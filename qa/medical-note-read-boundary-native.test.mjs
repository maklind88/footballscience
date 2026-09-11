import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentDigests } from "../scripts/lib/data-content-recovery-process.mjs";
import { asActor, catalog, claims, id, statementOutcome, syntheticPostgres } from "./helpers/relations-permissions-postgres.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260911185738_medical_coach_note_read_boundary.sql", import.meta.url), "utf8");
const tables = ["medical_availability_recommendations", "medical_availability_plans", "medical_state_sync_events", "platform_app_state_records"];
const surfaces = [
  { table: tables[0], view: "medical_coach_availability", fn: "medical_coach_recommendation_note", unshared: 701, shared: 711, foreign: 712, sibling: 713, archived: 714, empty: 715, lifecycle: "deleted_at" },
  { table: tables[1], view: "medical_coach_availability_plans", fn: "medical_coach_plan_note", unshared: 801, shared: 811, foreign: 812, sibling: 813, archived: 814, empty: 815, lifecycle: "archived_at" },
];
const notes = (rows) => JSON.parse(rows).map(({ coach_note }) => coach_note);
const getter = (surface, recordId) => `SELECT coalesce(app_private.${surface.fn}('${id(recordId)}'),'<null>')`;

async function seed(db) {
  await db.pg.sql(db.source, `
    INSERT INTO medical_availability_recommendations
      (id,organization_id,team_id,player_id,recommendation_date,status,recommended_participation,rtp_phase,share_with_coach,coach_note,internal_note,deleted_at)
    VALUES
      ('${id(711)}','${id(101)}','${id(301)}','${id(501)}','2026-09-12','modified',50,'modified-team',true,'shared-a','private-a',null),
      ('${id(712)}','${id(102)}','${id(302)}','${id(502)}','2026-09-12','modified',50,'modified-team',true,'shared-b','private-b',null),
      ('${id(713)}','${id(101)}','${id(303)}','${id(501)}','2026-09-12','modified',50,'modified-team',true,'sibling-team','private-c',null),
      ('${id(714)}','${id(101)}','${id(301)}','${id(501)}','2026-09-13','modified',50,'modified-team',true,'archived','private-d',now()),
      ('${id(715)}','${id(101)}','${id(301)}','${id(501)}','2026-09-14','modified',50,'modified-team',true,null,'private-e',null);
    INSERT INTO medical_availability_plans
      (id,organization_id,team_id,player_id,starts_on,ends_on,status,recommended_participation,rtp_phase,share_with_coach,coach_note,internal_note,archived_at)
    SELECT replace(id::text,'0000000007','0000000008')::uuid,organization_id,team_id,player_id,recommendation_date,recommendation_date,
      status,recommended_participation,rtp_phase,share_with_coach,coach_note,internal_note,deleted_at
    FROM medical_availability_recommendations;
    -- Model existing Supabase service-role grants, not permissions granted by the fix.
    GRANT USAGE ON SCHEMA app_private TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON medical_availability_recommendations,medical_availability_plans TO service_role;
    GRANT SELECT ON medical_coach_availability,medical_coach_availability_plans TO service_role;
  `);
}

async function invariants(t, db) {
  for (const surface of surfaces) {
    await t.test(`${surface.view}: readable availability, shared note, masked unshared note`, async () => {
      const rows = JSON.parse(await asActor(db, `SELECT json_agg(v ORDER BY id) FROM ${surface.view} v`));
      assert.deepEqual(rows.map((row) => row.id), [surface.unshared, surface.shared, surface.empty].map(id));
      assert.deepEqual(rows.map((row) => row.coach_note), [null, "shared-a", null]);
      assert.ok(rows.every((row) => row.recommended_participation === 50));
      assert.ok(rows.every((row) => !Object.hasOwn(row, "internal_note")));
    });
    await t.test(`${surface.table}: raw note and private columns are denied, safe columns work`, async () => {
      for (const column of ["coach_note", "internal_note", "*"]) {
        assert.equal(await statementOutcome(db, `SELECT ${column} FROM ${surface.table}`), "42501");
      }
      assert.equal(await asActor(db, `SELECT count(id) FROM ${surface.table}`), "3");
      assert.equal(await statementOutcome(db, `UPDATE ${surface.table} SET coach_note='changed'`), "42501");
      assert.equal(await statementOutcome(db, `DELETE FROM ${surface.table}`), "42501");
      assert.equal(await statementOutcome(db, `SELECT id FROM ${surface.table} WHERE coach_note IS NOT NULL`), "42501");
    });
    await t.test(`${surface.fn}: direct calls cannot bypass sharing, team or archive checks`, async () => {
      assert.equal(await asActor(db, getter(surface, surface.shared)), "shared-a");
      for (const recordId of [surface.unshared, surface.foreign, surface.sibling, surface.archived, surface.empty, 999]) {
        assert.equal(await asActor(db, getter(surface, recordId)), "<null>");
      }
      assert.equal(await asActor(db, getter(surface, surface.foreign), { jwt: claims(2) }), "shared-b");
      assert.equal(await asActor(db, getter(surface, surface.shared), { jwt: claims(2) }), "<null>");
      assert.equal(await asActor(db, `SELECT app_private.${surface.fn}(null) IS NULL`), "t");
    });
    await t.test(`${surface.view}: membership revoke and share withdrawal apply immediately`, async () => {
      const revoked = `UPDATE squad_staff_memberships SET status='removed' WHERE user_id='${id(1)}';`;
      assert.equal(await asActor(db, `SELECT count(*) FROM ${surface.view}`, { before: revoked }), "0");
      assert.equal(await asActor(db, getter(surface, surface.shared), { before: revoked }), "<null>");
      const unshare = `UPDATE ${surface.table} SET share_with_coach=false WHERE id='${id(surface.shared)}';`;
      assert.equal(await asActor(db, getter(surface, surface.shared), { before: unshare }), "<null>");
      assert.equal(await asActor(db, `SELECT coach_note IS NULL FROM ${surface.view} WHERE id='${id(surface.shared)}'`, { before: unshare }), "t");
    });
    await t.test(`${surface.view}: anon, missing principal, guest and editable role spoofing fail closed`, async () => {
      assert.equal(await statementOutcome(db, `SELECT * FROM ${surface.view}`, { role: "anon" }), "42501");
      assert.equal(await statementOutcome(db, getter(surface, surface.shared), { role: "anon" }), "42501");
      for (const jwt of [{}, claims(1, "guest"), { sub: id(1), user_metadata: { role: "admin" } },
        { ...claims(2), role: "service_role", user_metadata: { role: "admin", teamId: id(301) } }]) {
        assert.equal(await asActor(db, getter(surface, surface.shared), { jwt }), "<null>");
      }
      assert.equal(await statementOutcome(db, "SELECT set_config('role','service_role',true)"), "42501");
    });
    await t.test(`${surface.view}: backend access and legitimate Medical writes are unchanged`, async () => {
      assert.equal(await asActor(db, `SELECT internal_note FROM ${surface.table} WHERE id='${id(surface.shared)}'`, { role: "service_role", jwt: {} }), "private-a");
      assert.equal(await asActor(db, getter(surface, surface.shared), { role: "service_role", jwt: {} }), "shared-a");
      assert.equal(await asActor(db, getter(surface, surface.unshared), { role: "service_role", jwt: {} }), "<null>");
      assert.equal(await statementOutcome(db, `UPDATE ${surface.table} SET coach_note='server-edited' WHERE id='${id(surface.shared)}'`, { role: "service_role", jwt: {} }), "accepted");
      const rows = await asActor(db, `SELECT json_agg(v ORDER BY id) FROM ${surface.view} v`, { jwt: claims(3, "medical") });
      assert.deepEqual(notes(rows), [null, "shared-a", null]);
    });
    await t.test(`${surface.fn}: temporary objects cannot shadow the protected table`, async () => {
      const before = `CREATE TEMP TABLE ${surface.table}(id uuid,coach_note text); INSERT INTO pg_temp.${surface.table} VALUES ('${id(surface.shared)}','injected');`;
      assert.equal(await asActor(db, getter(surface, surface.shared), { before }), "shared-a");
    });
  }
  await t.test("helper privileges and invoker view identity are preserved", async () => {
    for (const surface of surfaces) {
      const row = JSON.parse(await db.pg.sql(db.source, `SELECT json_build_object(
        'definer',prosecdef,'config',proconfig,'return',prorettype::regtype::text,
        'anon',has_function_privilege('anon',oid,'EXECUTE'),
        'auth',has_function_privilege('authenticated',oid,'EXECUTE'),
        'service',has_function_privilege('service_role',oid,'EXECUTE'))
        FROM pg_proc WHERE oid='app_private.${surface.fn}(uuid)'::regprocedure;`));
      assert.equal(row.definer, true);
      assert.ok(row.config.includes('search_path=""'));
      assert.deepEqual([row.return, row.anon, row.auth, row.service], ["text", false, true, true]);
      assert.equal(await asActor(db, `SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid='public.${surface.view}'::regclass`), "t");
    }
  });
}

test("Medical note boundary: actual migrations, no production database", async (t) => {
  const db = await syntheticPostgres();
  try {
    await seed(db);
    const before = await contentDigests(db.pg, db.source, tables);
    const beforeCatalog = await catalog(db);
    const viewColumnsQuery = `SELECT jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,
      pg_catalog.format_type(a.atttypid,a.atttypmod)) ORDER BY c.relname,a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      WHERE c.oid IN ('public.medical_coach_availability'::regclass,'public.medical_coach_availability_plans'::regclass)
        AND a.attnum > 0 AND NOT a.attisdropped;`;
    const beforeColumns = await db.pg.sql(db.source, viewColumnsQuery);
    await t.test("baseline reproduces raw unshared note access and broken invoker views", async () => {
      for (const surface of surfaces) {
        assert.equal(await asActor(db, `SELECT coach_note FROM ${surface.table} WHERE id='${id(surface.unshared)}'`), "synthetic-unshared");
        assert.equal(await statementOutcome(db, `SELECT * FROM ${surface.view}`), "42501");
      }
    });
    await t.test("a failed migration transaction restores the original ACLs and definitions", async () => {
      // Abort the local transaction just before commit; never run a reverse security migration on Live.
      const abort = migration.replace(/commit;\s*$/i, "DO $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$; COMMIT;");
      assert.notEqual(abort, migration);
      await assert.rejects(db.pg.sql(db.source, abort), /postgres-command-failed/);
      assert.deepEqual(await catalog(db), beforeCatalog);
      assert.deepEqual(await contentDigests(db.pg, db.source, tables), before);
    });
    await db.pg.sql(db.source, migration);
    await invariants(t, db);
    await t.test("applying again is safe and all source data and policies are untouched", async () => {
      const after = await catalog(db);
      assert.deepEqual(after.policies, beforeCatalog.policies);
      assert.deepEqual(after.constraints, beforeCatalog.constraints);
      assert.deepEqual(after.triggers, beforeCatalog.triggers);
      assert.equal(await db.pg.sql(db.source, viewColumnsQuery), beforeColumns);
      await db.pg.sql(db.source, migration);
      assert.deepEqual(await catalog(db), after);
      assert.deepEqual(await contentDigests(db.pg, db.source, tables), before);
    });
    await t.test("existing broad grants cannot leave an alternate route to raw notes", async () => {
      const expected = await catalog(db);
      for (const surface of surfaces) {
        await db.pg.sql(db.source, `GRANT SELECT ON ${surface.table} TO PUBLIC,anon,authenticated;
          GRANT SELECT(coach_note) ON ${surface.table} TO PUBLIC,anon,authenticated;
          GRANT EXECUTE ON FUNCTION app_private.${surface.fn}(uuid) TO PUBLIC;`);
      }
      await db.pg.sql(db.source, migration);
      for (const surface of surfaces) {
        assert.equal(await statementOutcome(db, `SELECT coach_note FROM ${surface.table}`), "42501");
        assert.equal(await statementOutcome(db, getter(surface, surface.shared), { role: "anon" }), "42501");
        assert.equal(await asActor(db, getter(surface, surface.shared)), "shared-a");
      }
      assert.deepEqual(await catalog(db), expected);
      assert.deepEqual(await contentDigests(db.pg, db.source, tables), before);
    });
    await t.test("restored schema/data retain the same privacy boundary after restart", async (restoredTest) => {
      const archive = join(db.root, "medical-note-boundary.dump");
      const expected = await catalog(db);
      await db.pg.run("pg_dump", ["-w", "--format=custom", "--file", archive], { env: db.source });
      const destination = { ...db.source, PGDATABASE: "restored" };
      await db.pg.run("createdb", ["-w", destination.PGDATABASE], { env: db.source });
      await db.pg.run("pg_restore", ["-w", "--single-transaction", "--exit-on-error", `--dbname=${destination.PGDATABASE}`, archive], { env: destination });
      await db.restart();
      const restored = { ...db, source: destination };
      assert.deepEqual(await catalog(restored), expected);
      assert.deepEqual(await contentDigests(db.pg, destination, tables), before);
      await invariants(restoredTest, restored);
    });
  } finally { await db.close(); }
});
