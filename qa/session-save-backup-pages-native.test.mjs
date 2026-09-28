import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { syntheticPostgres, statementOutcome } from "./helpers/relations-permissions-postgres.mjs";
import { receiptPostgresHttp } from "./helpers/session-receipt-postgres-http.mjs";

const require = createRequire(import.meta.url);
const { readSessionSaveBackup, validateSessionSaveBackup } = require("../api/_lib/session-save-backup.js");
const { decodeBackupChunk } = require("../api/_lib/session-save-backup-chunks.js");
const key = "football-session-planner-v3";
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "test-only", SUPABASE_SERVICE_ROLE_KEY: "test-only" };

test("paged backup uses real PostgreSQL, bounded pages and exact content", { timeout: 120_000 }, async (t) => {
  const db = await syntheticPostgres();
  const previousFetch = global.fetch;
  const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const http = receiptPostgresHttp(db);
  global.fetch = http.fetch;
  const sql = (query) => db.pg.sql(db.source, query);
  try {
    for (const migration of ["20260925200724_session_save_receipts.sql", "20260927192224_session_save_backup_pages.sql"]) {
      await sql(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await t.test("unprivileged roles cannot export and empty scope is explicit", async () => {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(await statementOutcome(db, "select public.snapshot_session_save_page('global')", { role }), "42501");
      }
      const empty = await readSessionSaveBackup();
      assert.equal(empty.receiptCount, 0);
      assert.deepEqual(empty.chunks, []);
      assert.equal(validateSessionSaveBackup(empty), null);
    });
    const value = JSON.stringify({ sessions: { "2026-09-27": { title: "Synthetic QA only" } } });
    await sql(`insert into public.platform_app_state_records
      (organization_id,state_key,module_id,merge_policy,revision,value,value_hash)
      values ('global','${key}','session-planner','date-scoped',200,${quote(value)},${quote(hash(value))});
      insert into public.session_save_receipts
      (organization_id,state_key,actor_id,operation_id,operation_hash,session_date,accepted_revision)
      select 'global','${key}','coach-' || (i % 3), 'save-' || lpad(i::text,4,'0'), repeat('a',64), '2026-09-27', i
      from generate_series(1,189) i;
      insert into public.session_save_effects (organization_id,state_key,actor_id,operation_id,payload)
      select organization_id,state_key,actor_id,operation_id,
        jsonb_build_object('audit', jsonb_build_object('id',operation_id,'content',repeat('synthetic-history-',21000)))
      from public.session_save_receipts;`);
    let snapshot;
    let restored;
    await t.test("more than 64MB is exported in verified chunks without increasing the 32MB archive guard", async () => {
      const size = Number(await sql("select sum(octet_length(payload::text)) from public.session_save_effects"));
      assert.ok(size > 64 * 1024 * 1024);
      snapshot = await readSessionSaveBackup();
      assert.equal(snapshot.receiptCount, 189);
      assert.equal(snapshot.chunks.length, 19);
      assert.equal(validateSessionSaveBackup(snapshot).value, value);
      assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 32 * 1024 * 1024);
      let count = 0;
      for (const chunk of snapshot.chunks) {
        for (const row of decodeBackupChunk(chunk)) {
          assert.equal(row.effect.payload.audit.id, row.receipt.operation_id);
          assert.equal(row.effect.payload.audit.content, "synthetic-history-".repeat(21000));
          count++;
        }
      }
      assert.equal(count, 189);
    });
    await t.test("next organization never receives another organization's rows", async () => {
      const other = await readSessionSaveBackup("other");
      assert.equal(other.entry, null);
      assert.equal(other.receiptCount, 0);
    });
    await t.test("service role can read bounded pages without granting access to client roles", async () => {
      const page = JSON.parse(await sql("set role service_role; select public.snapshot_session_save_page('global'); reset role;"));
      assert.equal(page.receiptCount, 189);
      assert.equal(page.rows.length, 10);
      assert.equal(page.entry.value, value);
    });
    await t.test("a concurrent save rejects the export instead of mixing revisions", async () => {
      let requests = 0;
      global.fetch = async (...args) => {
        if (++requests === 2) await sql(`update public.platform_app_state_records set revision=201 where organization_id='global'`);
        return http.fetch(...args);
      };
      await assert.rejects(readSessionSaveBackup(), /changed/);
      assert.equal(requests, 2);
      global.fetch = http.fetch;
    });
    await t.test("an unavailable middle page is a hard failure, never a truncated backup", async () => {
      let requests = 0;
      global.fetch = async (...args) => ++requests === 2 ? new Response("{}", { status: 503 }) : http.fetch(...args);
      await assert.rejects(readSessionSaveBackup(), /unavailable/);
      assert.equal(requests, 2);
      global.fetch = http.fetch;
    });
    await t.test("restore decoded chunks under the real schema and constraints with exact data digests", async () => {
      const schema = join(db.root, "paged-schema.dump");
      await db.pg.run("pg_dump", ["--schema-only", "-Fc", "-f", schema], { env: db.source });
      await db.pg.run("createdb", ["paged_restore"], { env: db.source });
      restored = { ...db.source, PGDATABASE: "paged_restore" };
      await db.pg.run("pg_restore", ["--exit-on-error", "--single-transaction", "-d", "paged_restore", schema], { env: restored });
      const statements = [`insert into public.platform_app_state_records select * from
        jsonb_populate_record(null::public.platform_app_state_records, ${quote(JSON.stringify(snapshot.entry))}::jsonb);`];
      for (const chunk of snapshot.chunks) {
        const rows = decodeBackupChunk(chunk);
        for (const [kind, field] of [["receipts", "receipt"], ["effects", "effect"]]) {
          statements.push(`insert into public.session_save_${kind} select * from
            jsonb_populate_recordset(null::public.session_save_${kind}, ${quote(JSON.stringify(rows.map((row) => row[field])))}::jsonb);`);
        }
      }
      await db.pg.sql(restored, `begin; ${statements.join("\n")} commit;`);
      for (const kind of ["receipts", "effects"]) {
        const sourceHash = await sql(`select md5(string_agg(md5(to_jsonb(r)::text), '' order by actor_id,operation_id)) from public.session_save_${kind} r`);
        const targetHash = await db.pg.sql(restored, `select md5(string_agg(md5(to_jsonb(r)::text), '' order by actor_id,operation_id)) from public.session_save_${kind} r`);
        assert.equal(targetHash, sourceHash);
        assert.equal(Number(await db.pg.sql(restored, `select count(*) from public.session_save_${kind}`)), 189);
      }
      assert.deepEqual(JSON.parse(await db.pg.sql(restored, "select to_jsonb(r) from public.platform_app_state_records r")), snapshot.entry);
    });
    await t.test("restored v2 receipts prevent replay from overwriting a newer save", async () => {
      const nextValue = JSON.stringify({ sessions: { "2026-09-27": { title: "New synthetic edit after restore" } } });
      const entry = { organizationId: "global", key, moduleId: "session-planner", mergePolicy: "date-scoped",
        updatedBy: "coach-new", value: nextValue, hash: hash(nextValue), removed: false, metadata: {} };
      const run = async (body) => JSON.parse(await db.pg.sql(restored, `set role service_role; ${body}; reset role;`));
      const result = await run(`select public.commit_session_save(${quote(JSON.stringify(entry))}::jsonb,
        200, 'after-restore', ${quote(hash(nextValue))}, '2026-09-27', 'coach-new', '{"audit":true}'::jsonb)`);
      assert.equal(result.status, "committed");
      assert.equal(result.entry.revision, 201);
      entry.updatedBy = "coach-1";
      entry.value = value;
      entry.hash = hash(value);
      const replay = await run(`select public.commit_session_save(${quote(JSON.stringify(entry))}::jsonb,
        0, 'save-0001', '${"a".repeat(64)}', '2026-09-27', 'coach-1', '{"audit":true}'::jsonb)`);
      assert.equal(replay.status, "duplicate");
      assert.equal(replay.acceptedRevision, 1);
      assert.equal(replay.entry.revision, 201);
      assert.equal(replay.entry.value, nextValue);
      for (const kind of ["receipts", "effects"]) {
        assert.equal(Number(await db.pg.sql(restored, `select count(*) from public.session_save_${kind}`)), 190);
      }
    });
    await t.test("missing ledger row fails closed at the database boundary", async () => {
      await sql("delete from public.session_save_effects where operation_id='save-0001'");
      await assert.rejects(readSessionSaveBackup(), /unavailable/);
    });
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await db.close();
  }
});
