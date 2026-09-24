import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { syntheticPostgres, id, statementOutcome } from "./helpers/relations-permissions-postgres.mjs";
import { applySessionDateChange, createSessionDateChanges } from "../src/modules/session-planner/session-save-protocol.mjs";

const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const receipts = read("20260916163623_session_save_atomic_receipts.sql");
const migration = read("20260916165132_session_save_scope_history.sql");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const date = "2026-09-16";
const tomorrow = "2026-09-17";
const scope = (actor = 1, team = 301) => `public.resolve_session_save_scope('${id(actor)}','${id(team)}')`;
const history = ({ actor = 1, team = 301, day = date, before = null, limit = 25 } = {}) =>
  `public.read_session_save_history('${id(actor)}','${id(team)}',${day === null ? "NULL" : literal(day)},${before ?? "NULL"},${limit ?? "NULL"})`;

test("Sessions canonical scope and history in isolated PostgreSQL 17 (never Supabase)", async (t) => {
  const db = await syntheticPostgres();
  const sql = (query) => db.pg.sql(db.source, query);
  const run = async (expression) => JSON.parse(await sql(`SET ROLE service_role; SELECT ${expression};`));
  const state = { sessions: {
    [date]: { date, title: "Private training", blocks: [{ id: "a", title: "Private exercise", minutes: 15 }] },
    [tomorrow]: { date: tomorrow, title: "Tomorrow", blocks: [] },
  } };
  const seedCalendar = async (org = 101, team = 301) => sql(`INSERT INTO platform_app_state_records
    (organization_id,state_key,module_id,merge_policy,revision,value,value_hash,metadata)
    VALUES ('${id(org)}','football-session-planner-v3','session-planner','merge',10,
      ${literal(JSON.stringify(state))},repeat('a',64),${json({ teamId: id(team) })});`);
  const save = async (operation, { actor = 1, org = 101, team = 301, day = date } = {}) => {
    const row = JSON.parse(await sql(`SELECT to_jsonb(r) FROM platform_app_state_records r
      WHERE organization_id='${id(org)}' AND state_key='football-session-planner-v3';`));
    const previous = JSON.parse(row.value);
    const next = structuredClone(previous);
    next.sessions[day].title = `Private ${operation}`;
    const change = createSessionDateChanges(previous, next, () => operation)[0];
    const merged = applySessionDateChange(previous, change);
    assert.equal(merged.ok, true);
    const expression = `public.commit_session_save_operation('${id(org)}','${id(team)}','${id(actor)}',
      ${literal(operation)},${json(change)},${row.revision},${literal(JSON.stringify(merged.state))})`;
    const result = await run(expression);
    assert.equal(result.ok, true);
    return { expression, result };
  };
  const snapshot = async () => sql(`SELECT jsonb_build_object(
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY organization_id,team_id,actor_id,operation_id) FROM app_private.session_save_receipts r),
    'effects',(SELECT jsonb_agg(to_jsonb(r) ORDER BY organization_id,team_id,actor_id,operation_id) FROM app_private.session_save_effects r),
    'state',(SELECT jsonb_agg(to_jsonb(r) ORDER BY organization_id,state_key) FROM platform_app_state_records r));`);
  try {
    await sql(receipts);
    await t.test("real migration parses, applies and rolls back before permanent synthetic application", async () => {
      await sql(`BEGIN; ${migration} ROLLBACK;`);
      assert.equal((await sql("SELECT to_regprocedure('public.read_session_save_history(uuid,uuid,text,bigint,integer)') IS NULL")).trim(), "t");
      assert.equal((await sql("SELECT to_regclass('app_private.session_save_receipts_history_page_idx') IS NULL")).trim(), "t");
      await sql(migration);
      await seedCalendar();
    });
    await t.test("explicit canonical team derives organization, but coach membership grants no history/edit capability", async () => {
      assert.deepEqual(await run(scope()), { ok: true, scope: { actorId: id(1), organizationId: id(101),
        clubId: id(201), teamId: id(301) }, roles: ["coach"], canReadHistory: false });
      assert.equal((await run(history())).status, 403);
      for (const expression of [scope(1, 302), scope(1, 303), scope(2, 301), scope(99),
        "public.resolve_session_save_scope(NULL,NULL)", `public.resolve_session_save_scope('${id(1)}',NULL)`]) {
        assert.deepEqual(await run(expression), { ok: false, status: 403, reason: "Sessions scope is not active." });
      }
    });
    await t.test("metadata/JWT role and team claims or primary-team preferences cannot authorize history", async () => {
      const result = JSON.parse(await sql(`SET ROLE service_role;
        SET request.jwt.claims = '${JSON.stringify({ sub: id(1), user_metadata: { role: "admin", teamId: id(302) }, app_metadata: { role: "admin" } })}';
        SELECT ${history()};`));
      assert.equal(result.status, 403);
      await sql(`UPDATE platform_user_profiles SET primary_team_id='${id(302)}',primary_organization_id='${id(102)}' WHERE user_id='${id(1)}'`);
      try {
        assert.equal((await run(scope())).scope.organizationId, id(101));
        assert.equal((await run(scope(1, 302))).status, 403);
      } finally {
        await sql(`UPDATE platform_user_profiles SET primary_team_id='${id(301)}',primary_organization_id='${id(101)}' WHERE user_id='${id(1)}'`);
      }
    });
    await t.test("history stays admin-only; club/team-admin and all specialist roles are denied", async () => {
      for (const role of ["club-admin", "team-admin", "coach", "medical", "performance", "analyst", "scout", "guest"]) {
        await sql(`UPDATE platform_memberships SET role=${literal(role)} WHERE user_id='${id(1)}'`);
        assert.equal((await run(history())).status, 403, role);
      }
      await sql(`UPDATE platform_memberships SET role='admin' WHERE user_id='${id(1)}'`);
      assert.equal((await run(history())).ok, true);
      assert.equal((await run(history({ team: 303 }))).status, 403);
    });
    await t.test("organization and club membership cover only canonical descendants; inconsistent links fail closed", async () => {
      await sql(`UPDATE platform_memberships SET scope='club',club_id='${id(201)}',team_id=NULL WHERE user_id='${id(1)}'`);
      assert.equal((await run(scope(1, 303))).canReadHistory, true);
      assert.equal((await run(scope(1, 302))).status, 403);
      await sql(`UPDATE platform_memberships SET scope='organization',club_id=NULL WHERE user_id='${id(1)}'`);
      assert.equal((await run(scope(1, 303))).canReadHistory, true);
      assert.equal((await run(scope(1, 302))).status, 403);
      await sql(`UPDATE platform_memberships SET scope='team',team_id='${id(301)}',club_id='${id(202)}' WHERE user_id='${id(1)}'`);
      assert.equal((await run(scope())).status, 403);
      await sql(`UPDATE platform_memberships SET club_id=NULL WHERE user_id='${id(1)}';
        UPDATE platform_teams SET club_id='${id(202)}' WHERE id='${id(301)}'`);
      try { assert.equal((await run(scope())).status, 403); }
      finally { await sql(`UPDATE platform_teams SET club_id='${id(201)}' WHERE id='${id(301)}'`); }
    });
    await t.test("an administrator role in a different team never upgrades this team's coach", async () => {
      const result = JSON.parse(await sql(`BEGIN;
        UPDATE platform_memberships SET role='coach' WHERE user_id='${id(1)}';
        INSERT INTO platform_memberships (organization_id,team_id,user_id,role,scope)
          VALUES ('${id(101)}','${id(303)}','${id(1)}','admin','team');
        SET LOCAL ROLE service_role;
        SELECT jsonb_build_object('current',${history()},'other',${scope(1, 303)}); ROLLBACK;`));
      assert.equal(result.current.status, 403);
      assert.equal(result.other.canReadHistory, true);
    });
    await t.test("committed write and replay yield one metadata item while complete before/after evidence survives", async () => {
      const { expression, result } = await save("save-1");
      assert.equal((await run(expression)).replayed, true);
      const page = await run(history());
      assert.equal(page.entries.length, 1);
      assert.equal(page.entries[0].revision, result.receipt.revision);
      assert.deepEqual(Object.keys(page.entries[0]).sort(), ["actorId", "committedAt", "date", "id", "revision"]);
      assert.equal(JSON.stringify(page).includes("Private"), false);
      assert.equal(page.hasMore, false); assert.equal(page.nextBeforeRevision, null);
      const evidence = JSON.parse(await snapshot());
      assert.equal(evidence.effects[0].before_value.session.title, "Private training");
      assert.equal(evidence.effects[0].after_value.session.title, "Private save-1");
      await db.restart();
      assert.deepEqual(await run(history()), page);
    });
    await t.test("missing canonical profile or membership never falls back to a legacy global administrator", async () => {
      for (const partialIdentity of [
        `INSERT INTO platform_memberships (organization_id,team_id,user_id,role,scope)
          VALUES ('${id(101)}','${id(301)}','${id(4)}','admin','team')`,
        `INSERT INTO platform_user_profiles (user_id,primary_organization_id,primary_team_id,display_name)
          VALUES ('${id(4)}','${id(101)}','${id(301)}','Synthetic incomplete identity')`,
      ]) {
        const result = JSON.parse(await sql(`BEGIN; INSERT INTO auth.users VALUES ('${id(4)}'); ${partialIdentity};
          SET LOCAL ROLE service_role; SET LOCAL request.jwt.claims='{"app_metadata":{"role":"admin"}}';
          SELECT ${history({ actor: 4 })}; ROLLBACK;`));
        assert.equal(result.status, 403); assert.equal(result.entries, undefined);
      }
    });
    await t.test("new canonical teams work only after an explicit active membership without client/default adoption", async () => {
      await sql(`INSERT INTO platform_teams (id,organization_id,club_id,slug,name)
        VALUES ('${id(304)}','${id(101)}','${id(201)}','new-test-team','New synthetic team');
        INSERT INTO auth.users VALUES ('${id(4)}');
        INSERT INTO platform_user_profiles (user_id,display_name) VALUES ('${id(4)}','New synthetic staff')`);
      assert.equal((await run(scope(4, 304))).status, 403);
      await sql(`INSERT INTO platform_memberships (organization_id,team_id,user_id,role,scope)
        VALUES ('${id(101)}','${id(304)}','${id(4)}','admin','team')`);
      const context = await run(scope(4, 304));
      assert.equal(context.scope.teamId, id(304)); assert.equal(context.scope.organizationId, id(101));
      assert.deepEqual((await run(history({ actor: 4, team: 304 }))).entries, []);
    });
    for (const [table, where, inactive] of [
      ["platform_user_profiles", `user_id='${id(1)}'`, "removed"],
      ["platform_memberships", `user_id='${id(1)}'`, "removed"],
      ["platform_organizations", `id='${id(101)}'`, "archived"],
      ["platform_clubs", `id='${id(201)}'`, "archived"],
      ["platform_teams", `id='${id(301)}'`, "archived"],
    ]) {
      await t.test(`fresh active/deleted ${table} check protects each page, even previously issued cursors`, async () => {
        for (const mutation of ["status='paused'", `status='${inactive}'`, "deleted_at=now()"]) {
          await sql(`UPDATE ${table} SET ${mutation} WHERE ${where}`);
          try {
            assert.equal((await run(scope())).status, 403);
            const page = await run(history({ before: 99 }));
            assert.equal(page.status, 403); assert.equal(page.entries, undefined);
          } finally { await sql(`UPDATE ${table} SET status='active',deleted_at=NULL WHERE ${where}`); }
        }
      });
    }
    await t.test("keyset pages survive a newer commit without skips/duplicates and recheck role revoke", async () => {
      await save("save-2"); await save("save-3");
      const first = await run(history({ limit: 2 }));
      assert.deepEqual(first.entries.map((e) => e.revision), [13, 12]);
      assert.equal(first.nextBeforeRevision, 12); assert.equal(first.hasMore, true);
      await save("save-4");
      await sql(`UPDATE platform_memberships SET role='coach' WHERE user_id='${id(1)}'`);
      assert.equal((await run(history({ before: first.nextBeforeRevision }))).status, 403);
      await sql(`UPDATE platform_memberships SET role='admin' WHERE user_id='${id(1)}'`);
      const next = await run(history({ before: first.nextBeforeRevision, limit: 2 }));
      assert.deepEqual(next.entries.map((e) => e.revision), [11]);
      assert.equal(next.hasMore, false);
      assert.equal((await run(history({ limit: 1 }))).entries[0].revision, 14);
    });
    await t.test("other date/org/team records cannot leak through filters or invented cursors", async () => {
      await save("tomorrow", { day: tomorrow });
      await seedCalendar(102, 302);
      await save("other-org", { org: 102, team: 302, actor: 2 });
      // Synthetic historical record for another team, not a migration/adoption of its calendar.
      await sql(`INSERT INTO app_private.session_save_receipts SELECT organization_id,'${id(303)}',actor_id,
        'other-team',request_hash,jsonb_set(receipt,'{teamId}',to_jsonb('${id(303)}'::text)),committed_at
        FROM app_private.session_save_receipts WHERE operation_id='save-1'`);
      const current = await run(history({ before: 999 }));
      assert.deepEqual(current.entries.map((e) => e.id), ["save-4", "save-3", "save-2", "save-1"]);
      assert.deepEqual((await run(history({ day: tomorrow }))).entries.map((e) => e.id), ["tomorrow"]);
      assert.equal((await run(history({ actor: 2, team: 301 }))).status, 403);
      assert.equal((await run(history({ team: 303 }))).status, 403);
      assert.equal((await run(history({ day: "2026-09-18" }))).entries.length, 0);
    });
    await t.test("bounded input rejects malformed dates/limits/cursors and reads never mutate evidence", async () => {
      const before = await snapshot();
      for (const options of [{ day: null }, { day: "global" }, { limit: 0 }, { limit: 51 }, { limit: null }, { before: 0 }]) {
        assert.equal(await statementOutcome(db, `SELECT ${history(options)}`, { role: "service_role" }), "22023");
      }
      assert.equal(await statementOutcome(db, `SELECT ${history({ day: "2026-02-30" })}`, { role: "service_role" }), "22008");
      await sql(`BEGIN READ ONLY; SET LOCAL ROLE service_role; SELECT ${scope()}; SELECT ${history()}; COMMIT;`);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test("a populated feed enforces its 50-entry ceiling and reaches every older operation", async () => {
      for (let index = 0; index < 55; index += 1) await save(`page-${index}`);
      const first = await run(history({ limit: 50 }));
      assert.equal(first.entries.length, 50); assert.equal(first.hasMore, true);
      const older = await run(history({ limit: 50, before: first.nextBeforeRevision }));
      assert.equal(older.entries.length, 9); assert.equal(older.hasMore, false);
      const all = [...first.entries, ...older.entries];
      assert.equal(new Set(all.map((e) => e.id)).size, 59);
      assert.equal(all.at(-1).id, "save-1");
      assert.equal((await run(history())).entries.length, 25);
    });
    await t.test("browser roles cannot invoke either RPC; functions are read-only security invoker", async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const expression of [scope(), history()]) {
          assert.equal(await statementOutcome(db, `SELECT ${expression}`, { role }), "42501");
        }
      }
      const properties = JSON.parse(await sql(`SELECT jsonb_agg(jsonb_build_object('invoker',NOT prosecdef,'volatility',provolatile))
        FROM pg_proc WHERE proname IN ('resolve_session_save_scope','read_session_save_history')`));
      assert.deepEqual(properties, [{ invoker: true, volatility: "s" }, { invoker: true, volatility: "s" }]);
    });
    await t.test("date/revision cursor is indexable without indexing the full payload", async () => {
      const plan = await sql(`SET enable_seqscan=off; EXPLAIN (FORMAT JSON)
        SELECT operation_id FROM app_private.session_save_receipts
        WHERE organization_id='${id(101)}' AND team_id='${id(301)}'
          AND receipt->>'date'='${date}' AND (receipt->>'revision')::bigint < 12
        ORDER BY (receipt->>'revision')::bigint DESC LIMIT 26;`);
      assert.match(plan, /session_save_receipts_history_page_idx/);
      assert.doesNotMatch(plan, /"Node Type": "Sort"/);
    });
  } finally { await db.close(); }
});
