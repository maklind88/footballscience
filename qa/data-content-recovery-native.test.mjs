import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRecoveryWorkspace, runContentRecovery } from "../scripts/lib/data-content-recovery-drill.mjs";
import { contentDigests, holdRecoverySnapshot, localOptions, postgresRunner, readOnlyOptions } from "../scripts/lib/data-content-recovery-process.mjs";
import { contentTableDDL, metadataQuery, snapshotTransaction, verifyDataOnlyToc } from "../scripts/lib/data-content-recovery-plan.mjs";

test("native content recovery and failure paths use only synthetic databases", async (t) => {
  assert.ok(process.env.FS_RECOVERY_PG_BIN, "A verified PostgreSQL 17 toolchain is required");
  const bin = resolve(process.env.FS_RECOVERY_PG_BIN);
  const root = createRecoveryWorkspace();
  const data = join(root, "data");
  const socket = join(root, "socket");
  const pg = postgresRunner(bin, root);
  const source = { PGHOST: socket, PGPORT: "5432", PGUSER: "synthetic", PGDATABASE: "postgres", PGOPTIONS: localOptions };
  const tables = ["sample", "events"];
  let serverAttempted = false;
  try {
    mkdirSync(socket, { mode: 0o700 });
    await pg.run("initdb", ["-D", data, "-U", "synthetic", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"]);
    serverAttempted = true;
    await pg.run("pg_ctl", ["-D", data, "-l", join(root, "log"), "-w", "start", "-o", `-h '' -k ${socket} -p 5432 -c unix_socket_permissions=0700`]);
    await pg.sql(source, `
      CREATE TABLE public.sample (id uuid NOT NULL, payload jsonb, revision bigint NOT NULL, removed boolean NOT NULL, captured_at timestamp with time zone NOT NULL);
      CREATE TABLE public.events (id text NOT NULL, payload text, status text NOT NULL);
      INSERT INTO sample VALUES ('10000000-0000-4000-8000-000000000001','{"value":"synthetic-player","nested":{"a":1}}',7,false,'2026-09-11T01:02:03Z'),
        ('10000000-0000-4000-8000-000000000002','{"archived":true}',12,true,'2026-09-10T01:02:03Z');
      INSERT INTO events VALUES ('event-1',E'line1\\nline2\\t\\\\','pending'), ('event-2',null,'processed');
    `);
    const baseline = await contentDigests(pg, source, tables);
    await t.test("full content test exports, restores, restarts and removes the private destination", async () => {
      const destination = createRecoveryWorkspace();
      const result = await runContentRecovery({ bin, root: destination, source, tables });
      assert.deepEqual(result, { ok: true, kind: "data-content-drill-v1", tablesCompared: 2, rowsCompared: 4,
        restartVerified: true, fullRecoveryVerified: false, sourceWritten: false, retainedArchive: false });
      assert.equal(existsSync(destination), false);
      assert.deepEqual(await contentDigests(pg, source, tables), baseline);
      assert.ok(!JSON.stringify(result).includes("synthetic-player"));
    });
    await t.test("a held snapshot survives source edits and rejects source writes", async () => {
      const readonly = { ...source, PGOPTIONS: readOnlyOptions };
      const held = await holdRecoverySnapshot(pg, readonly, tables);
      try {
        await pg.sql(source, "UPDATE sample SET revision=revision+1;");
        assert.deepEqual(await contentDigests(pg, readonly, tables, held.snapshot), baseline);
        assert.notDeepEqual(await contentDigests(pg, source, tables), baseline);
        await assert.rejects(pg.sql(readonly, snapshotTransaction(held.snapshot, "DELETE FROM events")), /postgres-command-failed/);
      } finally { await held.close(); }
    });
    await t.test("a missing table fails without partial export or retained destination", async () => {
      const destination = createRecoveryWorkspace();
      await assert.rejects(runContentRecovery({ bin, root: destination, source, tables: ["missing"] }));
      assert.equal(existsSync(destination), false);
    });
    await t.test("unsupported schema fails before dumping data and cleans the destination", async () => {
      await pg.sql(source, "CREATE TYPE public.synthetic_enum AS ENUM ('synthetic'); CREATE TABLE public.unsupported (value public.synthetic_enum);");
      const destination = createRecoveryWorkspace();
      await assert.rejects(runContentRecovery({ bin, root: destination, source, tables: ["unsupported"] }), /unsupported-column-type/);
      assert.equal(existsSync(destination), false);
    });
    await t.test("invalid archive and copy failure cannot partially restore content", async () => {
      const archive = join(root, "fixture.dump");
      await pg.run("pg_dump", ["-w", "--format=custom", "--data-only", "--no-large-objects", ...tables.map((table) => `--table=public.${table}`), "--file", archive], { env: source });
      verifyDataOnlyToc(await pg.run("pg_restore", ["--list", archive]), tables);
      const metadata = JSON.parse(await pg.sql(source, metadataQuery(tables)));
      const restore = { ...source, PGDATABASE: "failure_fixture" };
      await pg.run("createdb", ["-w", restore.PGDATABASE], { env: source });
      await pg.sql(restore, contentTableDDL(metadata, tables));
      // The later table COPY fails after the earlier one ran; single-transaction must undo both.
      await pg.sql(restore, "ALTER TABLE sample ADD CONSTRAINT reject_fixture CHECK (revision < 0);");
      await assert.rejects(pg.run("pg_restore", ["-w", "--single-transaction", "--exit-on-error", `--dbname=${restore.PGDATABASE}`, archive], { env: restore }));
      for (const table of tables) assert.equal((await pg.sql(restore, `SELECT count(*) FROM ${table};`)).trim(), "0");
      const invalid = join(root, "invalid.dump");
      writeFileSync(invalid, "synthetic-invalid-archive", { mode: 0o600 });
      await assert.rejects(pg.run("pg_restore", ["-w", "--single-transaction", "--exit-on-error", `--dbname=${restore.PGDATABASE}`, invalid], { env: restore }));
      assert.equal((await pg.sql(restore, "SELECT count(*) FROM events;")).trim(), "0");
    });
    await t.test("abort before export leaves no destination or source change", async () => {
      const destination = createRecoveryWorkspace();
      const controller = new AbortController();
      const before = await contentDigests(pg, source, tables);
      const run = runContentRecovery({ bin, root: destination, source, tables, signal: controller.signal });
      controller.abort();
      await assert.rejects(run);
      assert.equal(existsSync(destination), false);
      assert.deepEqual(await contentDigests(pg, source, tables), before);
    });
    await t.test("abort cancels an active source query and releases a held snapshot", async () => {
      const controller = new AbortController();
      const cancellable = postgresRunner(bin, root, controller.signal);
      const readonly = { ...source, PGOPTIONS: readOnlyOptions, PGAPPNAME: "synthetic-cancel-proof" };
      const held = await holdRecoverySnapshot(cancellable, readonly, tables);
      const query = cancellable.start("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], {
        env: readonly, input: "SELECT 'ready'; SELECT pg_sleep(30);", onChunk: () => controller.abort(),
      });
      await assert.rejects(query.done, /postgres-command-failed/);
      await held.close().catch(() => {});
      assert.equal((await pg.sql(source, "SELECT count(*) FROM pg_stat_activity WHERE application_name='synthetic-cancel-proof';")).trim(), "0");
    });
    await t.test("database errors and inherited environment values cannot reach public output", async () => {
      const secret = "synthetic-sensitive-content-not-for-logs";
      await assert.rejects(pg.sql(source, `DO $$ BEGIN RAISE EXCEPTION '${secret}'; END $$;`), (error) => !error.message.includes(secret));
      const aborted = new AbortController();
      aborted.abort();
      await assert.rejects(postgresRunner(bin, root, aborted.signal).sql(source, "SELECT 1"), /recovery-aborted/);
      assert.equal(statSync(root).mode & 0o777, 0o700);
    });
  } finally {
    if (serverAttempted && existsSync(join(data, "postmaster.pid"))) await pg.run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], { cleanup: true });
    rmSync(root, { recursive: true, force: true });
  }
});
