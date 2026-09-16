import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { syntheticPostgres, id, statementOutcome } from "./helpers/relations-permissions-postgres.mjs";
import { applySessionDateChange, createSessionDateChanges } from "../src/modules/session-planner/session-save-protocol.mjs";

const require = createRequire(import.meta.url);
const { createSessionSavePilot } = require("../api/app-state.js");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlValue = (value) => value === null ? "NULL" : typeof value === "object" ? `${literal(JSON.stringify(value))}::jsonb` : literal(value);
const expression = (name, body) => {
  assert.ok(["read_session_save_context", "commit_authorized_session_save"].includes(name));
  assert.ok(Object.keys(body).every((key) => /^p_[a-z_]+$/.test(key)));
  return `public.${name}(${Object.entries(body).map(([key, value]) => `${key} => ${sqlValue(value)}`).join(",")})`;
};
const readMigration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const migration = readMigration("20260916170114_session_save_authorized_context.sql");
const date = "2026-09-16";
const initial = { sessions: {
  [date]: { date, title: "Original", blocks: [{ id: "a", title: "Press", objective: "Keep", minutes: 15 }] },
  "2026-09-17": { date: "2026-09-17", title: "Tomorrow", blocks: [] },
} };
const edit = (operation = "save-1", mutate = (state) => { state.sessions[date].title = "Saved"; }, before = initial) => {
  const after = structuredClone(before); mutate(after);
  return createSessionDateChanges(before, after, () => operation)[0];
};
const args = (change = edit(), actor = 1, team = 301) => ({ actorId: id(actor), teamId: id(team), change });

test("unwired Sessions server pilot: actual policy + protocol + PostgreSQL", async (t) => {
  const db = await syntheticPostgres();
  const sql = (query) => db.pg.sql(db.source, query);
  const calls = [];
  const request = async (name, body) => {
    calls.push({ name, body: structuredClone(body) });
    return JSON.parse(await sql(`SET ROLE service_role; SELECT ${expression(name, body)};`));
  };
  const client = (rpc = request) => createSessionSavePilot({ request: rpc });
  const snapshot = () => sql(`SELECT jsonb_build_object(
    'states',(SELECT jsonb_agg(to_jsonb(r) ORDER BY organization_id,state_key) FROM platform_app_state_records r),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY operation_id) FROM app_private.session_save_receipts r),
    'effects',(SELECT jsonb_agg(to_jsonb(r) ORDER BY operation_id) FROM app_private.session_save_effects r));`);
  const hub = async (value) => sql(`UPDATE platform_app_state_records SET value=${literal(JSON.stringify(value))},revision=revision+1
    WHERE state_key='football-workspace-hub-v3' AND organization_id='${id(101)}'`);
  const reset = async () => {
    await sql(`TRUNCATE app_private.session_save_effects,app_private.session_save_receipts;
      DELETE FROM platform_app_state_records WHERE state_key IN ('football-session-planner-v3','football-workspace-hub-v3');
      UPDATE platform_memberships SET role=CASE WHEN user_id='${id(3)}' THEN 'medical' ELSE 'coach' END,status='active';
      INSERT INTO platform_app_state_records (organization_id,state_key,module_id,merge_policy,revision,value,value_hash,metadata)
      VALUES ('${id(101)}','football-session-planner-v3','session-planner','merge',10,${literal(JSON.stringify(initial))},
        encode(sha256(convert_to(${literal(JSON.stringify(initial))},'UTF8')),'hex'),'${JSON.stringify({ teamId: id(301) })}'),
      ('${id(101)}','football-workspace-hub-v3','platform-shell','merge',1,'{}',
        encode(sha256(convert_to('{}','UTF8')),'hex'),'${JSON.stringify({ teamId: id(301) })}');`);
    calls.length = 0;
  };
  const writes = () => calls.filter((call) => call.name === "commit_authorized_session_save");
  try {
    await sql(readMigration("20260916163623_session_save_atomic_receipts.sql"));
    await sql(readMigration("20260916165132_session_save_scope_history.sql"));
    await t.test("actual SQL applies/rolls back without weakening identity privileges", async () => {
      await sql(`BEGIN; ${migration} ROLLBACK;`);
      assert.equal((await sql("SELECT to_regprocedure('public.read_session_save_context(uuid,uuid,jsonb)') IS NULL")).trim(), "t");
      await sql(migration); await reset();
      assert.equal(await statementOutcome(db, "UPDATE platform_memberships SET role='admin'", { role: "service_role" }), "42501");
    });
    await t.test("coach uses real Sessions guards and receives one atomic state/receipt/history item", async () => {
      const result = await client()(args());
      assert.equal(result.ok, true); assert.equal(result.replayed, false); assert.equal(result.receipt.revision, 11);
      const evidence = JSON.parse(await snapshot());
      assert.equal(evidence.receipts.length, 1); assert.equal(evidence.effects.length, 1);
      assert.equal(evidence.effects[0].before_value.session.title, "Original");
      assert.equal(evidence.effects[0].after_value.session.title, "Saved");
      assert.equal(writes()[0].body.p_organization_id, id(101));
    });
    await t.test("lost commit response and new server instance replay the same immutable receipt without re-saving", async () => {
      await reset();
      const unreliable = client(async (name, body) => {
        const result = await request(name, body);
        if (name === "commit_authorized_session_save") throw new Error("synthetic lost response");
        return result;
      });
      assert.equal((await unreliable(args())).status, 503); assert.equal(writes().length, 1);
      const committed = await snapshot();
      const replay = await client()(args());
      assert.equal(replay.replayed, true); assert.deepEqual(await snapshot(), committed);
    });
    await t.test("old receipt replay does not overwrite a later same-field colleague edit", async () => {
      const current = { ...initial, sessions: { ...initial.sessions, [date]: { ...initial.sessions[date], title: "Saved" } } };
      const next = edit("later", (state) => { state.sessions[date].title = "Later colleague"; }, current);
      assert.equal((await client()(args(next))).ok, true);
      const before = await snapshot();
      const result = await client()(args());
      assert.equal(result.replayed, true); assert.equal(result.receipt.revision, 11);
      assert.equal(result.receipt.value.session.title, "Saved"); assert.deepEqual(await snapshot(), before);
    });
    await t.test("genuine same-field conflict and changed-content ID reuse do not commit", async () => {
      const before = await snapshot(), count = writes().length;
      assert.equal((await client()(args(edit("different-id", (s) => { s.sessions[date].title = "Offline conflict"; })))).status, 409);
      assert.equal((await client()(args(edit("save-1", (s) => { s.sessions[date].title = "Reused ID"; })))).status, 409);
      assert.equal(writes().length, count); assert.deepEqual(await snapshot(), before);
    });
    await t.test("one real CAS collision remerges independent fields without dropping either author", async () => {
      await reset(); let raced = false;
      const save = client(async (name, body) => {
        if (name === "commit_authorized_session_save" && !raced) {
          raced = true;
          assert.equal((await client()(args(edit("peer", (s) => { s.sessions[date].blocks[0].minutes = 25; })))).ok, true);
        }
        return request(name, body);
      });
      const result = await save(args());
      assert.equal(result.ok, true); assert.equal(result.receipt.revision, 12);
      assert.equal(result.receipt.value.session.title, "Saved"); assert.equal(result.receipt.value.session.blocks[0].minutes, 25);
      assert.equal(writes().length, 3);
    });
    await t.test("revoke between authorization and send cannot use a stale permission token", async () => {
      await reset(); const before = await snapshot(); let revoked = false;
      const save = client(async (name, body) => {
        if (name === "commit_authorized_session_save" && !revoked) {
          revoked = true; await sql(`UPDATE platform_memberships SET role='medical' WHERE user_id='${id(1)}'`);
        }
        return request(name, body);
      });
      assert.equal((await save(args())).status, 403);
      assert.equal(writes().length, 1); assert.deepEqual(await snapshot(), before);
    });
    await t.test("configured Medical edit is honored, then fresh workspace revoke blocks the old grant", async () => {
      await reset(); assert.equal((await client()(args(edit(), 3))).status, 403); assert.equal(writes().length, 0);
      await hub({ workspaceAccess: { "session-planner": { view: ["medical"], edit: ["medical"] } } });
      assert.equal((await client()(args(edit(), 3))).ok, true);
      const before = await snapshot(); let revoked = false;
      const save = client(async (name, body) => {
        if (name === "commit_authorized_session_save" && !revoked) { revoked = true; await hub({}); }
        return request(name, body);
      });
      assert.equal((await save(args(edit(), 3))).status, 403);
      const after = JSON.parse(await snapshot()), prior = JSON.parse(before);
      assert.deepEqual(after.receipts, prior.receipts); assert.deepEqual(after.effects, prior.effects);
      assert.deepEqual(after.states.filter((r) => r.state_key.includes("session-planner")), prior.states.filter((r) => r.state_key.includes("session-planner")));
    });
    await t.test("unsafe content, wrong actor/team and missing/global/unbound records never write", async () => {
      await reset(); const before = await snapshot();
      assert.equal((await client()(args(edit("unsafe", (s) => { s.sessions[date].blocks[0].objective = '<script>alert(1)</script>'; })))).status, 400);
      assert.equal((await client()(args(edit(), 2))).status, 403);
      assert.equal((await client()(args(edit(), 1, 302))).status, 403);
      assert.equal(writes().length, 0); assert.deepEqual(await snapshot(), before);
      for (const mutation of ["organization_id='global'", "removed=true", "metadata='{}'", "module_id='unknown'"]) {
        await reset(); await sql(`UPDATE platform_app_state_records SET ${mutation} WHERE state_key='football-workspace-hub-v3'`);
        const snapshotBefore = await snapshot();
        assert.equal((await client()(args())).status, 409); assert.equal(writes().length, 0);
        assert.deepEqual(await snapshot(), snapshotBefore);
      }
    });
    await t.test("role revoked while the commit is blocked is rechecked after the actual row lock", async () => {
      await reset(); const before = await snapshot();
      const held = await hold(db, "SELECT revision FROM platform_app_state_records WHERE state_key='football-session-planner-v3' FOR UPDATE;");
      const pending = client()(args());
      try {
        await blocked(db, "%commit_authorized_session_save%", 1);
        await sql(`UPDATE platform_memberships SET role='medical' WHERE user_id='${id(1)}'`);
      } finally { await held.release(); }
      assert.equal((await pending).status, 403); assert.deepEqual(await snapshot(), before);
    });
    await t.test("identity and workspace revokes cannot cross the database check/commit boundary", async () => {
      await reset();
      let held;
      const save = client(async (name, body) => {
        if (name !== "commit_authorized_session_save") return request(name, body);
        held = await hold(db, `SET LOCAL ROLE service_role; SELECT ${expression(name, body)};`);
        return JSON.parse(held.output().split("\n").find((line) => line.startsWith("{")));
      });
      let revoke, workspaceRevoke;
      try {
        assert.equal((await save(args())).ok, true); // SQL has run; outer synthetic transaction deliberately holds locks.
        revoke = sql(`UPDATE platform_memberships SET role='medical' WHERE user_id='${id(1)}'`);
        workspaceRevoke = hub({ workspaceAccess: { "session-planner": { edit: [] } } });
        revoke.catch(() => {}); workspaceRevoke.catch(() => {});
        await blocked(db, "UPDATE%", 2);
      } finally { if (held) await held.release(); await revoke; await workspaceRevoke; }
      assert.equal((await client()(args())).status, 403);
    });
    await t.test("two actual simultaneous same-operation commits settle to one receipt and no duplicate history", async () => {
      await reset();
      const held = await hold(db, "SELECT revision FROM platform_app_state_records WHERE state_key='football-session-planner-v3' FOR UPDATE;");
      const both = Promise.all([client()(args()), client()(args())]); both.catch(() => {});
      try { await blocked(db, "%commit_authorized_session_save%", 2); }
      finally { await held.release(); }
      const [a, b] = await both;
      assert.equal(a.ok, true); assert.equal(b.ok, true); assert.deepEqual(a.receipt, b.receipt);
      const stored = JSON.parse(await snapshot()); assert.equal(stored.receipts.length, 1); assert.equal(stored.effects.length, 1);
    });
    await t.test("new training and explicit exercise deletion preserve other dates and immutable evidence", async () => {
      await reset(); const newDate = "2026-09-18";
      const created = edit("new-training", (s) => {
        s.sessions[newDate] = { date: newDate, title: "New training", blocks: [{ id: "new-exercise", title: "New exercise", minutes: 20 }] };
      });
      assert.equal((await client()(args(created))).ok, true);
      const deleted = edit("remove-exercise", (s) => {
        s.sessions[date].blocks = []; s.blockDeletionTombstones = { [date]: { a: "2026-09-16T12:00:00Z" } };
      });
      const result = await client()(args(deleted));
      assert.equal(result.ok, true); assert.deepEqual(result.receipt.value.session.blocks, []);
      const evidence = JSON.parse(await snapshot());
      const calendar = JSON.parse(evidence.states.find((r) => r.state_key === "football-session-planner-v3").value);
      assert.equal(calendar.sessions[newDate].blocks[0].id, "new-exercise");
      assert.deepEqual(calendar.sessions["2026-09-17"], initial.sessions["2026-09-17"]);
      assert.equal(evidence.effects.find((r) => r.operation_id === "remove-exercise").before_value.session.blocks[0].id, "a");
    });
    await t.test("effect persistence failure rolls back the complete guarded save and permits the same-ID retry", async () => {
      await reset(); const before = await snapshot();
      await sql("ALTER TABLE app_private.session_save_effects ADD CONSTRAINT synthetic_failure CHECK (operation_id <> 'blocked')");
      try {
        assert.equal((await client()(args(edit("blocked")))).ok, false);
        assert.deepEqual(await snapshot(), before);
      } finally { await sql("ALTER TABLE app_private.session_save_effects DROP CONSTRAINT synthetic_failure"); }
      const result = await client()(args(edit("blocked")));
      assert.equal(result.ok, true); assert.equal(result.receipt.revision, 11);
    });
    await t.test("browser roles cannot acquire private locks or call the guarded RPCs", async () => {
      const contextCall = expression("read_session_save_context", { p_actor_id: id(1), p_team_id: id(301), p_change: edit() });
      for (const role of ["anon", "authenticated"]) {
        for (const query of [`SELECT ${contextCall}`, `SELECT app_private.lock_session_save_identity('${id(1)}','${id(301)}','${id(101)}')`,
          `SELECT public.commit_authorized_session_save('${id(1)}','${id(301)}','${id(101)}','{}',NULL,10,'{}')`]) {
          assert.equal(await statementOutcome(db, query, { role }), "42501");
        }
      }
    });
  } finally { await db.close(); }
});

async function hold(db, query) {
  let ready, reject, output = "";
  const waiting = new Promise((resolve, fail) => { ready = resolve; reject = fail; });
  const process = db.pg.start("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], {
    env: db.source, timeout: 15000,
    onChunk(chunk) { output += chunk.toString(); if (output.includes("BARRIER_READY")) ready(); },
  });
  process.done.then(() => reject(new Error("barrier ended early")), reject);
  process.child.stdin.write(`BEGIN; ${query} SELECT 'BARRIER_READY';\n`);
  await waiting;
  return { output: () => output, release: async () => { process.child.stdin.end("COMMIT;\n"); await process.done; } };
}

async function blocked(db, pattern, count) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const actual = Number(await db.pg.sql(db.source, `SELECT count(*) FROM pg_stat_activity
      WHERE wait_event_type='Lock' AND query LIKE ${literal(pattern)}`));
    if (actual === count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("expected independent transactions at the lock barrier");
}
