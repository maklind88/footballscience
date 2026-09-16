import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { syntheticPostgres, id, statementOutcome } from "./helpers/relations-permissions-postgres.mjs";
import { applySessionDateChange, createSessionDateChanges } from "../src/modules/session-planner/session-save-protocol.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260916163623_session_save_atomic_receipts.sql", import.meta.url), "utf8");
const historyMigration = readFileSync(new URL("../supabase/migrations/20260916165132_session_save_scope_history.sql", import.meta.url), "utf8");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const date = "2026-09-16";
const initial = { sessions: { [date]: { date, title: "Initial", blocks: [{ id: "a", title: "Press", minutes: 15 }] },
  "2026-09-17": { date: "2026-09-17", title: "Keep tomorrow", blocks: [] } } };
function command(operation = "save-1", options = {}) {
  const before = options.before || initial;
  const after = structuredClone(before);
  after.sessions[date].title = options.title || "Saved";
  const change = options.change || createSessionDateChanges(before, after, () => operation)[0];
  const merged = applySessionDateChange(before, change);
  assert.equal(merged.ok, true);
  const value = options.value || merged.state;
  return `public.commit_session_save_operation(${literal(id(options.org || 101))}::uuid,
    ${literal(id(options.team || 301))}::uuid, ${literal(id(options.actor || 1))}::uuid,
    ${literal(operation)}, ${json(change)}, ${options.revision ?? 10}, ${literal(JSON.stringify(value))})`;
}

test("Sessions atomic receipts in isolated PostgreSQL 17 (never Supabase)", async (t) => {
  const db = await syntheticPostgres();
  const sql = (query) => db.pg.sql(db.source, query);
  const run = async (expression) => JSON.parse(await sql(`SET ROLE service_role; SELECT ${expression};`));
  const snapshot = async () => JSON.parse(await sql(`SELECT jsonb_build_object(
    'states',(SELECT jsonb_agg(to_jsonb(r) ORDER BY organization_id,state_key) FROM platform_app_state_records r),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY operation_id) FROM app_private.session_save_receipts r),
    'effects',(SELECT jsonb_agg(to_jsonb(r) ORDER BY operation_id) FROM app_private.session_save_effects r));`));
  const reset = async () => sql(`TRUNCATE app_private.session_save_effects, app_private.session_save_receipts;
    DELETE FROM platform_app_state_records WHERE state_key='football-session-planner-v3';
    INSERT INTO platform_app_state_records
      (organization_id,state_key,module_id,merge_policy,revision,value,value_hash,metadata)
    VALUES (${literal(id(101))},'football-session-planner-v3','session-planner','merge',10,
      ${literal(JSON.stringify(initial))},encode(sha256(convert_to(${literal(JSON.stringify(initial))},'UTF8')),'hex'),
      ${json({ teamId: id(301) })});`);
  try {
    await t.test("real SQL applies transactionally and rolls schema back", async () => {
      await sql(`BEGIN; ${migration} ROLLBACK;`);
      assert.equal((await sql("SELECT to_regclass('app_private.session_save_receipts') IS NULL")).trim(), "t");
      assert.equal((await sql("SELECT to_regprocedure('public.commit_session_save_operation(uuid,uuid,uuid,text,jsonb,bigint,text)') IS NULL")).trim(), "t");
      await sql(migration);
      await sql(historyMigration);
      await reset();
    });
    await t.test("lost response, database restart and replay yield one state change and one intent", async () => {
      const result = await run(command());
      assert.equal(result.ok, true);
      assert.equal(result.replayed, false);
      assert.equal(result.receipt.revision, 11);
      assert.deepEqual(result.receipt.value.session, { ...initial.sessions[date], title: "Saved" });
      const committed = await snapshot();
      assert.equal(committed.receipts.length, 1);
      assert.equal(committed.effects.length, 1);
      assert.equal(committed.effects[0].source_revision, 10);
      await db.restart();
      const replay = await run(command());
      assert.deepEqual(replay, { ...result, replayed: true });
      assert.deepEqual(await snapshot(), committed);
    });
    await t.test("request JSON key order does not change identity; same ID with new content is refused", async () => {
      const after = structuredClone(initial);
      after.sessions[date].title = "Saved";
      const original = createSessionDateChanges(initial, after, () => "save-1")[0];
      const reordered = Object.fromEntries(Object.entries(original).reverse());
      assert.equal((await run(command("save-1", { change: reordered }))).replayed, true);
      const before = await snapshot();
      assert.equal((await run(command("save-1", { title: "Other" }))).status, 409);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test("old receipt is immutable after a later authorized operation", async () => {
      const first = await run(command());
      const before = { sessions: { ...initial.sessions, [date]: first.receipt.value.session } };
      const second = await run(command("save-2", { before, revision: 11, title: "Newer" }));
      assert.equal(second.receipt.revision, 12);
      const committed = await snapshot();
      assert.deepEqual(await run(command()), { ...first, replayed: true });
      assert.deepEqual(await snapshot(), committed);
    });
    await t.test("stale new operation and wrong team/org/actor never expose or commit a receipt", async () => {
      const before = await snapshot();
      assert.deepEqual(await run(command("new-stale")), { ok: false, status: 409, currentRevision: 12 });
      for (const scope of [{ team: 303 }, { org: 102 }, { actor: 2 }]) {
        const result = await run(command("save-1", scope));
        assert.equal(result.ok, false); assert.equal(result.receipt, undefined);
      }
      assert.deepEqual(await snapshot(), before);
    });
    await t.test("an operation ID is independent for a second authorized actor and tenant", async () => {
      await reset();
      await run(command());
      const before = { sessions: { ...initial.sessions, [date]: { ...initial.sessions[date], title: "Saved" } } };
      assert.equal((await run(command("save-1", { actor: 3, before, revision: 11, title: "Peer" }))).replayed, false);
      await sql(`INSERT INTO platform_app_state_records SELECT ${literal(id(102))},state_key,module_id,merge_policy,
        10,${literal(JSON.stringify(initial))},false,'',now(),repeat('a',64),${json({ teamId: id(302) })}
        FROM platform_app_state_records WHERE state_key='football-session-planner-v3';`);
      assert.equal((await run(command("save-1", { org: 102, team: 302, actor: 2 }))).replayed, false);
      const state = await snapshot();
      assert.equal(state.receipts.length, 3); assert.equal(state.effects.length, 3);
    });
    for (const [table, identity] of [["platform_user_profiles", `user_id='${id(1)}'`],
      ["platform_memberships", `user_id='${id(1)}'`], ["platform_organizations", `id='${id(101)}'`],
      ["platform_clubs", `id='${id(201)}'`], ["platform_teams", `id='${id(301)}'`]]) {
      await t.test(`paused ${table} blocks even a previously committed receipt`, async () => {
        const before = await snapshot();
        await sql(`UPDATE ${table} SET status='paused' WHERE ${identity};`);
        try { assert.equal((await run(command())).status, 403); }
        finally { await sql(`UPDATE ${table} SET status='active' WHERE ${identity};`); }
        assert.deepEqual(await snapshot(), before);
      });
    }
    await t.test("global, unbound, missing and deleted calendars cannot be adopted or resurrected", async () => {
      for (const mutation of ["metadata='{}'", "removed=true", "organization_id='global'"]) {
        await reset();
        await sql(`UPDATE platform_app_state_records SET ${mutation} WHERE state_key='football-session-planner-v3'`);
        const before = await snapshot();
        assert.equal((await run(command())).ok, false);
        assert.deepEqual(await snapshot(), before);
      }
      await reset();
      await sql("DELETE FROM platform_app_state_records WHERE state_key='football-session-planner-v3'");
      const before = await snapshot();
      assert.equal((await run(command())).ok, false);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test("a different date or root field cannot be changed by this operation", async () => {
      await reset();
      const value = structuredClone(initial);
      value.sessions[date].title = "Saved";
      value.sessions["2026-09-17"].title = "Wrong date";
      const before = await snapshot();
      assert.equal(await statementOutcome(db, `SELECT ${command("save-1", { value })}`, { role: "service_role" }), "22023");
      assert.deepEqual(await snapshot(), before);
    });
    for (const table of ["session_save_receipts", "session_save_effects"]) {
      await t.test(`${table} insert failure rolls back state, receipt and effect together`, async () => {
        await reset();
        await sql(`ALTER TABLE app_private.${table} ADD CONSTRAINT reject_test_operation CHECK (operation_id <> 'fail');`);
        const before = await snapshot();
        assert.equal(await statementOutcome(db, `SELECT ${command("fail")}`, { role: "service_role" }), "23514");
        assert.deepEqual(await snapshot(), before);
        await sql(`ALTER TABLE app_private.${table} DROP CONSTRAINT reject_test_operation;`);
        assert.equal((await run(command("fail"))).receipt.revision, 11);
      });
    }
    await t.test("anon and authenticated cannot invoke RPC or read private evidence", async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const query of [`SELECT ${command()}`, "SELECT * FROM app_private.session_save_receipts",
          "SELECT * FROM app_private.session_save_effects"]) {
          assert.equal(await statementOutcome(db, query, { role }), "42501");
        }
      }
      assert.equal(await statementOutcome(db, "DELETE FROM app_private.session_save_receipts", { role: "service_role" }), "42501");
    });
    await t.test("two independent connections racing the same operation produce one commit", async () => {
      await reset();
      const held = await holdRow(db);
      const a = run(command());
      const b = run(command());
      const both = Promise.all([a, b]);
      both.catch(() => {});
      try {
        await waitBlocked(db, 2);
      } finally { await held.release(); }
      const results = await both;
      assert.deepEqual(results.map((r) => r.replayed).sort(), [false, true]);
      assert.deepEqual(results[0].receipt, results[1].receipt);
      assert.equal((await snapshot()).receipts.length, 1);
      assert.equal((await snapshot()).effects.length, 1);
    });
    await t.test("different concurrent operations require fresh CAS and never leave a partial receipt", async () => {
      await reset();
      const held = await holdRow(db);
      const a = run(command("a", { title: "A" }));
      const b = run(command("b", { title: "B" }));
      const both = Promise.all([a, b]);
      both.catch(() => {});
      try { await waitBlocked(db, 2); } finally { await held.release(); }
      const results = await both;
      assert.equal(results.filter((r) => r.ok).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 1);
      assert.equal((await snapshot()).effects.length, 1);
      const first = results.find((r) => r.ok);
      const before = { sessions: { ...initial.sessions, [date]: first.receipt.value.session } };
      assert.equal((await run(command("fresh", { before, revision: 11, title: "Fresh merged edit" }))).receipt.revision, 12);
    });
    await t.test("same operation ID with different concurrent content has one winner, never an overwritten receipt", async () => {
      await reset();
      const held = await holdRow(db);
      const both = Promise.all([run(command("same", { title: "A" })), run(command("same", { title: "B" }))]);
      both.catch(() => {});
      try { await waitBlocked(db, 2); } finally { await held.release(); }
      const results = await both;
      assert.equal(results.filter((r) => r.ok).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 1);
      assert.equal((await snapshot()).effects.length, 1);
      assert.equal((await snapshot()).receipts.length, 1);
    });
    await t.test("a membership revoked while waiting for another transaction cannot commit or replay", async () => {
      await reset();
      const first = await run(command());
      const before = await snapshot();
      const held = await holdRow(db);
      const central = { sessions: { ...initial.sessions, [date]: first.receipt.value.session } };
      const pending = Promise.all([run(command()), run(command("waiting-new", { before: central, revision: 11, title: "New" }))]);
      pending.catch(() => {});
      try {
        await waitBlocked(db, 2);
        await sql(`UPDATE platform_memberships SET status='paused' WHERE user_id='${id(1)}'`);
        await held.release();
        assert.deepEqual((await pending).map((r) => r.status), [403, 403]);
        assert.deepEqual(await snapshot(), before);
      } finally {
        if (held.process.child.exitCode === null) held.process.stop();
        await held.process.done.catch(() => {});
        await pending.catch(() => {});
        await sql(`UPDATE platform_memberships SET status='active' WHERE user_id='${id(1)}'`);
      }
    });
    await t.test("legacy CAS and receipt RPC share the actual record lock", async () => {
      await reset();
      const held = await holdRow(db);
      const legacyValue = JSON.stringify(initial);
      const legacy = run(`(SELECT to_jsonb(r) FROM public.write_platform_app_state_record(
        '${id(101)}','football-session-planner-v3','session-planner','merge',10,11,
        ${literal(legacyValue)},false,'${id(1)}',encode(sha256(convert_to(${literal(legacyValue)},'UTF8')),'hex'),
        ${json({ teamId: id(301) })}) r)`);
      const current = run(command());
      const both = Promise.all([legacy, current]);
      both.catch(() => {});
      try {
        await waitBlocked(db, 2, "%platform_app_state_record%");
      } finally { await held.release(); }
      const [oldResult, newResult] = await both;
      assert.equal(Number(oldResult.applied) + Number(newResult.ok), 1);
      const result = await snapshot();
      assert.equal(result.receipts?.length || 0, newResult.ok ? 1 : 0);
      assert.equal(result.effects?.length || 0, newResult.ok ? 1 : 0);
    });
    await t.test("disconnect before COMMIT leaves no operation and permits a later retry", async () => {
      await reset();
      const before = await snapshot();
      const held = await holdRow(db, `SET LOCAL ROLE service_role; SELECT ${command()};`);
      held.process.stop();
      await held.process.done.catch(() => {});
      assert.deepEqual(await snapshot(), before);
      assert.equal((await run(command())).receipt.revision, 11);
    });
  } finally { await db.close(); }
});

async function holdRow(db, extra = "") {
  let ready, reject;
  const started = new Promise((resolve, fail) => { ready = resolve; reject = fail; });
  let output = "";
  const process = db.pg.start("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], {
    env: db.source, timeout: 15_000,
    onChunk(chunk) { output += chunk.toString(); if (output.includes("BARRIER_READY")) ready(); },
  });
  process.done.then(() => reject(new Error("barrier ended early")), reject);
  process.child.stdin.write(`BEGIN; SELECT revision FROM platform_app_state_records
    WHERE state_key='football-session-planner-v3' FOR UPDATE; ${extra} SELECT 'BARRIER_READY';\n`);
  await started;
  return { process, release: async () => { process.child.stdin.end("COMMIT;\n"); await process.done; } };
}

async function waitBlocked(db, expected, pattern = "%commit_session_save_operation%") {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const count = Number(await db.pg.sql(db.source, `SELECT count(*) FROM pg_stat_activity
      WHERE wait_event_type='Lock' AND (query LIKE ${literal(pattern)} OR query LIKE '%commit_session_save_operation%');`));
    if (count === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("both independent database requests must reach the held row lock");
}
