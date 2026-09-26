import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { syntheticPostgres, statementOutcome } from "./helpers/relations-permissions-postgres.mjs";
import { contentDigests } from "../scripts/lib/data-content-recovery-process.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260925200724_session_save_receipts.sql", import.meta.url), "utf8");
const key = "football-session-planner-v3";
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
function entry(org, value, actor = "coach-a") {
  return { organizationId: org, key, moduleId: "session-planner", mergePolicy: "date-scoped",
    updatedBy: actor, value, hash: hash(value), removed: false, metadata: {} };
}
function commit(org, id, value, base, { actor = "coach-a", digest = hash(value), effects = { audit: true } } = {}) {
  return `select public.commit_session_save(${quote(JSON.stringify(entry(org, value, actor)))}::jsonb,
    ${base}, ${quote(id)}, ${quote(digest)}, '2026-09-25', ${quote(actor)}, ${quote(JSON.stringify(effects))}::jsonb)`;
}

test("Sessions receipt transaction on real isolated PostgreSQL", { timeout: 120_000 }, async (t) => {
  const db = await syntheticPostgres();
  const sql = (query) => db.pg.sql(db.source, query);
  const run = async (query) => JSON.parse(await sql(query));
  try {
    await sql(migration);
    await t.test("anon/authenticated cannot read receipts, effects or call commit", async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const query of ["select * from public.session_save_receipts", "select * from public.session_save_effects", "select public.snapshot_session_saves('accepted')", commit("denied", "a", "A", 0)]) {
          assert.equal(await statementOutcome(db, query, { role }), "42501");
        }
      }
      assert.equal(await sql("select bool_and(relrowsecurity) from pg_class where oid in ('public.session_save_receipts'::regclass, 'public.session_save_effects'::regclass)"), "t\n");
    });
    await t.test("service role commits state, one receipt and required effect together", async () => {
      const result = await run(`set role service_role; ${commit("accepted", "a", "A", 0)}; reset role;`);
      assert.equal(result.status, "committed");
      assert.equal(result.entry.revision, 1);
      assert.equal(result.acceptedRevision, 1);
      assert.equal(await sql("select count(*) from public.session_save_effects where organization_id='accepted'"), "1\n");
    });
    await t.test("process/database restart and lost reply do not repeat a commit", async () => {
      await db.restart();
      const result = await run(commit("accepted", "a", "A", 0));
      assert.equal(result.status, "duplicate");
      assert.equal(result.entry.revision, 1);
      assert.equal(await sql("select count(*) from public.session_save_receipts where organization_id='accepted'"), "1\n");
      assert.equal(await sql("select count(*) from public.session_save_effects where organization_id='accepted'"), "1\n");
    });
    await t.test("retry A returns current B without replaying A", async () => {
      assert.equal((await run(commit("accepted", "b", "B", 1))).status, "committed");
      const result = await run(commit("accepted", "a", "A", 0));
      assert.equal(result.status, "duplicate");
      assert.equal(result.acceptedRevision, 1);
      assert.equal(result.entry.revision, 2);
      assert.equal(result.entry.value, "B");
    });
    await t.test("same ID with different payload cannot use the old receipt", async () => {
      assert.equal((await run(commit("accepted", "a", "other", 2))).status, "identity-mismatch");
      assert.equal(await sql("select value from public.platform_app_state_records where organization_id='accepted'"), "B\n");
    });
    await t.test("same operation ID in a different organization or actor is distinct", async () => {
      assert.equal((await run(commit("other-org", "a", "other", 0))).status, "committed");
      assert.equal((await run(commit("accepted", "a", "C", 2, { actor: "coach-b" }))).status, "committed");
      assert.equal((await run(commit("accepted", "a", "A", 0))).entry.value, "C");
    });
    await t.test("concurrent identical calls have one durable effect", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => run(commit("race", "a", "A", 0))));
      assert.equal(results.filter((r) => r.status === "committed").length, 1);
      assert.equal(results.filter((r) => r.status === "duplicate").length, 7);
      assert.equal(await sql("select count(*) from public.session_save_effects where organization_id='race'"), "1\n");
      assert.ok(results.every((r) => r.entry.revision === 1));
    });
    await t.test("concurrent different edits enforce revision CAS", async () => {
      const results = await Promise.all([run(commit("revision-race", "a", "A", 0)), run(commit("revision-race", "b", "B", 0))]);
      assert.equal(results.filter((r) => r.status === "committed").length, 1);
      assert.equal(results.filter((r) => r.status === "conflict").length, 1);
      assert.equal(await sql("select count(*) from public.session_save_receipts where organization_id='revision-race'"), "1\n");
    });
    await t.test("backup snapshot stays consistent while saves commit concurrently", async () => {
      for (let revision = 0; revision < 8; revision++) {
        const [, snapshot] = await Promise.all([
          run(commit("backup-race", `save-${revision}`, `Value ${revision}`, revision)),
          run("select public.snapshot_session_saves('backup-race')"),
        ]);
        const observedRevision = snapshot.entry?.revision || 0;
        assert.equal(snapshot.receipts.length, observedRevision);
        assert.equal(snapshot.effects.length, observedRevision);
        assert.ok(snapshot.receipts.every((receipt) => receipt.accepted_revision <= observedRevision));
      }
    });
    await t.test("failure after state write rolls back state, receipt and effect", async () => {
      await sql(`create function public.reject_test_effect() returns trigger language plpgsql as $$
        begin if new.organization_id = 'rollback' then raise exception 'synthetic effect failure'; end if; return new; end $$;
        create trigger reject_test_effect before insert on public.session_save_effects for each row execute function public.reject_test_effect();`);
      assert.equal(await statementOutcome(db, commit("rollback", "a", "A", 0), { role: "service_role" }), "P0001");
      for (const table of ["platform_app_state_records", "session_save_receipts", "session_save_effects"]) {
        assert.equal(await sql(`select count(*) from public.${table} where organization_id='rollback'`), "0\n");
      }
    });
    await t.test("consistent pg_dump restore retains receipts, history and current B on retry A", async () => {
      const tables = ["platform_app_state_records", "session_save_receipts", "session_save_effects"];
      const archive = join(db.root, "synthetic-receipts.dump");
      const before = await contentDigests(db.pg, db.source, tables);
      await db.pg.run("pg_dump", ["-Fc", "-f", archive], { env: db.source });
      await db.pg.run("createdb", ["receipt_recovery"], { env: db.source });
      const restored = { ...db.source, PGDATABASE: "receipt_recovery" };
      await db.pg.run("pg_restore", ["--exit-on-error", "--single-transaction", "-d", "receipt_recovery", archive], { env: restored });
      assert.deepEqual(await contentDigests(db.pg, restored, tables), before);
      const result = JSON.parse(await db.pg.sql(restored, `set role service_role; ${commit("accepted", "a", "A", 0)}`));
      assert.equal(result.status, "duplicate");
      assert.equal(result.entry.value, "C");
      assert.equal(result.entry.revision, 3);
      assert.equal(result.acceptedRevision, 1);
      assert.deepEqual(await contentDigests(db.pg, restored, tables), before);
    });
    await t.test("receipt after state restore/revision regression fails closed", async () => {
      await sql("update public.platform_app_state_records set revision=1 where organization_id='accepted'");
      assert.equal((await run(commit("accepted", "b", "B", 1))).status, "recovery-required");
      assert.equal(await sql("select revision from public.platform_app_state_records where organization_id='accepted'"), "1\n");
    });
    await t.test("explicit transaction rollback leaves no receipt or saved data", async () => {
      await sql(`begin; ${commit("abort", "a", "A", 0)}; rollback;`);
      assert.equal(await sql("select count(*) from public.platform_app_state_records where organization_id='abort'"), "0\n");
      assert.equal(await sql("select count(*) from public.session_save_receipts where organization_id='abort'"), "0\n");
    });
  } finally { await db.close(); }
});
