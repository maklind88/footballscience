import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { syntheticPostgres } from "./helpers/relations-permissions-postgres.mjs";
import { receiptPostgresHttp } from "./helpers/session-receipt-postgres-http.mjs";
import { createSessionSaveClient } from "../src/modules/session-planner/session-save-client.mjs";
import { createSessionDateChanges } from "../src/modules/session-planner/session-save-protocol.mjs";

const require = createRequire(import.meta.url);
const { decodeSessionStateValue } = require("../api/_lib/session-state-transport.js");
const key = "football-session-planner-v3", date = "2026-09-25";
const migration = readFileSync(new URL("../supabase/migrations/20260925200724_session_save_receipts.sql", import.meta.url), "utf8");
const env = { APP_STATE_DATABASE_MODE: "database", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "test-only", SUPABASE_SERVICE_ROLE_KEY: "test-only" };

test("actual Sessions client/API with atomic PostgreSQL receipts", { timeout: 120_000 }, async (t) => {
  const db = await syntheticPostgres();
  const previousFetch = global.fetch;
  const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const http = receiptPostgresHttp(db);
  global.fetch = http.fetch;
  const central = async () => JSON.parse(await db.pg.sql(db.source, `select to_jsonb(r) from public.platform_app_state_records r where organization_id='global' and state_key='${key}'`));
  let requestNumber = 0;
  const post = async (change, revision) => {
    const path = require.resolve("../api/app-state.js"); delete require.cache[path];
    let raw = "";
    const res = { statusCode: 200, setHeader() {}, end(chunk) { raw += chunk; } };
    const req = { method: "POST", url: "/api/app-state", headers: { authorization: `Bearer synthetic-receipt-coach-${requestNumber}`, "x-forwarded-for": `synthetic-${requestNumber++}` },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ key, baseRevision: revision, sessionChange: JSON.stringify(change) })); } };
    await require(path)(req, res);
    const payload = JSON.parse(raw);
    if (payload.sessionChange) payload.sessionChange = JSON.parse(await decodeSessionStateValue(key, payload.sessionChange));
    return { ok: res.statusCode === 200, status: res.statusCode, payload };
  };
  try {
    await db.pg.sql(db.source, migration);
    for (const lostAt of ["HTTP", "RPC"]) {
      for (const successor of ["none", "objective", "title"]) {
        await t.test(`${lostAt} reply lost, successor edits ${successor}: one commit, latest state, durable history`, async () => {
          await db.pg.sql(db.source, `delete from public.session_save_effects; delete from public.session_save_receipts;
            delete from public.platform_app_state_records where state_key='${key}';`);
          http.objects.clear();
          const initial = { sessions: { [date]: { date, blocks: [{ id: "a", title: "Before", objective: "Original", minutes: 20 }] } } };
          const value = JSON.stringify(initial).replaceAll("'", "''");
          await db.pg.sql(db.source, `insert into public.platform_app_state_records
            (organization_id,state_key,module_id,merge_policy,revision,value,value_hash)
            values ('global','${key}','session-planner','date-scoped',1,'${value}',repeat('a',64))`);
          const rows = new Map(); let drop = lostAt === "HTTP";
          if (lostAt === "RPC") http.loseNextRpcReply();
          const client = createSessionSaveClient({ getScope: () => "synthetic-scope", store: {
            list: async () => structuredClone([...rows.values()]), put: async (row) => rows.set(row.change.id, structuredClone(row)), remove: async (id) => rows.delete(id),
          }, send: async (...args) => { const result = await post(...args); if (drop && result.ok) { drop = false; return { ok: false, status: 0 }; } return result; } });
          client.observe(JSON.stringify(initial), { revision: 1 });
          const a = structuredClone(initial); a.sessions[date].blocks[0].title = "Accepted A";
          assert.equal((await client.save(JSON.stringify(a))).ok, false);
          assert.equal((await central()).revision, 2);
          assert.equal(rows.size, 1);
          if (successor !== "none") {
            const current = await central(), before = JSON.parse(current.value), after = structuredClone(before);
            after.sessions[date].blocks[0][successor] = "Accepted B";
            assert.equal((await post(createSessionDateChanges(before, after, () => "b")[0], current.revision)).ok, true);
          }
          const expected = await central();
          // A receipt is not an access grant. Use a fresh synthetic token so
          // this verifies the current actor, not the unrelated actor cache.
          const queued = structuredClone([...rows.values()][0]);
          const writesBeforeDeniedReplay = http.rpcCalls();
          http.user.app_metadata.role = "analyst";
          try {
            const denied = await post(queued.change, expected.revision);
            assert.equal(denied.status, 403);
            assert.equal(denied.payload.sessionChange, undefined);
            assert.equal(denied.payload.value, undefined);
            assert.equal(http.rpcCalls(), writesBeforeDeniedReplay);
            assert.deepEqual(await central(), expected);
          } finally { http.user.app_metadata.role = "coach"; }
          await db.restart();
          assert.equal((await client.replay()).ok, true);
          assert.equal(rows.size, 0);
          assert.deepEqual(await central(), expected);
          assert.deepEqual(JSON.parse(client.centralValue()), JSON.parse(expected.value));
          const count = successor === "none" ? 1 : 2;
          for (const table of ["session_save_receipts", "session_save_effects"]) {
            assert.equal(Number(await db.pg.sql(db.source, `select count(*) from public.${table}`)), count);
          }
          const { readAuditLog } = require("../api/_lib/audit-log.js");
          const { getSessionHistoryEntries } = require("../api/_lib/session-history.js");
          assert.equal((await readAuditLog()).entries.filter((event) => event.action === "data-safety.saved").length, count);
          assert.equal((await getSessionHistoryEntries({ date })).length, count);
          // Accepted retries need no second write RPC or delayed history delivery.
          const calls = http.rpcCalls();
          assert.equal((await client.replay()).ok, true);
          assert.equal(http.rpcCalls(), calls);
        });
      }
    }
    await t.test("real backup endpoint captures database data and receipts, rejects incomplete restore", async () => {
      const handler = require("../api/app-state-backup.js");
      http.user.app_metadata.role = "admin";
      const invoke = async (url, method) => {
        let raw = "";
        const res = { statusCode: 200, setHeader() {}, end(chunk) { raw += chunk; } };
        await handler({ url, method, headers: { authorization: `Bearer backup-${requestNumber++}` } }, res);
        return { status: res.statusCode, payload: JSON.parse(raw) };
      };
      try {
        // Prove the authoritative database, not a possibly stale mirror, is backed up.
        http.objects.set(`global/${key}.json`, { key, value: "stale mirror", revision: 1 });
        assert.equal((await invoke("/api/app-state-backup", "POST")).status, 200);
        const pointer = http.objects.get("backups/app-state/latest.json");
        const backup = http.objects.get(pointer.path);
        assert.equal(backup.entries[key], (await central()).value);
        assert.equal(backup.sessionSaveSnapshot.receipts.length, 2);
        assert.equal(backup.sessionSaveSnapshot.effects.length, 2);
        assert.equal((await invoke("/api/app-state-backup?mode=restore-drill", "GET")).status, 200);
        // Rehash to prove semantic validation, not only envelope hashing, catches missing events.
        backup.sessionSaveSnapshot.effects.pop();
        const { contentSha256, ...core } = backup;
        backup.contentSha256 = createHash("sha256").update(JSON.stringify(core)).digest("hex");
        pointer.contentSha256 = backup.contentSha256;
        const invalid = await invoke("/api/app-state-backup?mode=restore-drill", "GET");
        assert.equal(invalid.status, 409);
        assert.equal(invalid.payload.restoreDrill.restorable, false);
      } finally { http.user.app_metadata.role = "coach"; }
    });
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await db.close();
  }
});
