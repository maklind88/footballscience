// Native PostgreSQL toolchain proof. Synthetic data only; never a Live restore.
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { canonicalJson, sha256 } from "../scripts/lib/platform-identity-snapshot.mjs";
import {
  applyProofMigration, createProofDatabase, planProofMigration, proofSnapshot,
} from "./helpers/identity-migration-proof.mjs";

const tables = ["teams", "sources", "players", "memberships", "links", "references", "receipts"];
const schema = readFileSync(new URL("./fixtures/identity-migration-proof.sql", import.meta.url), "utf8");

test("Native PostgreSQL 17 exports and restores a private synthetic recovery set", async (t) => {
  assert.ok(process.env.FS_RECOVERY_PG_BIN, "Set FS_RECOVERY_PG_BIN to verified PostgreSQL 17 binaries");
  const bin = resolve(process.env.FS_RECOVERY_PG_BIN);
  for (const name of ["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore", "createdb"]) {
    assert.ok(statSync(join(bin, name)).isFile(), `Missing PostgreSQL tool: ${name}`);
  }
  const root = mkdtempSync(join(tmpdir(), "fs-native-recovery-"));
  chmodSync(root, 0o700);
  const data = join(root, "data");
  const socket = join(root, "socket");
  const archive = join(root, "fixture.dump");
  mkdirSync(socket, { mode: 0o700 });
  // Do not inherit PGHOST, PGSERVICE, passwords, client certificates or startup files.
  const env = { PATH: bin, HOME: root, TMPDIR: root, LANG: "C", LC_ALL: "C" };
  const connection = ["--host", socket, "--port", "5432", "--username", "fs_recovery_operator", "--no-password"];
  let started = false;
  function command(name, args, input, allowFailure = false) {
    const result = spawnSync(join(bin, name), args, {
      cwd: root, env, input, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    });
    if (!allowFailure) {
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${name} failed: ${result.stderr || result.stdout}`);
    }
    return result;
  }
  function sql(database, query, allowFailure = false) {
    return command("psql", [...connection, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--dbname", database], query, allowFailure);
  }
  function snapshot(database) {
    return Object.fromEntries(tables.map((table) => {
      const output = sql(database, `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]') from identity_proof."${table}" t;`).stdout;
      const rows = JSON.parse(output).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
      return [table, { count: rows.length, sha256: sha256(rows) }];
    }));
  }
  function metadata(database) {
    return sql(database, `select jsonb_build_object(
      'constraints', (select jsonb_agg(row_to_json(c) order by c.relname,c.conname) from
        (select r.relname,k.conname,pg_get_constraintdef(k.oid) as definition,k.convalidated
         from pg_constraint k join pg_class r on r.oid=k.conrelid
         join pg_namespace n on n.oid=r.relnamespace where n.nspname='identity_proof') c),
      'indexes', (select jsonb_agg(row_to_json(i) order by i.indexname) from
        (select indexname,indexdef from pg_indexes where schemaname='identity_proof') i));`).stdout.trim();
  }
  function start() {
    // Empty listen_addresses means no TCP listener, including on localhost.
    started = true;
    command("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-w", "start", "-o", `-h '' -k ${socket} -p 5432 -c unix_socket_permissions=0700`]);
  }
  try {
    assert.match(command("pg_dump", ["--version"]).stdout, /PostgreSQL\) 17\./);
    assert.match(command("pg_restore", ["--version"]).stdout, /PostgreSQL\) 17\./);
    command("initdb", ["-D", data, "-U", "fs_recovery_operator", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"]);
    start();
    command("createdb", [...connection, "proof_source"]);
    command("createdb", [...connection, "proof_restored"]);
    const fixtureDb = await createProofDatabase();
    let fixture;
    try {
      await applyProofMigration(fixtureDb, await planProofMigration(fixtureDb), randomUUID());
      fixture = await proofSnapshot(fixtureDb);
    } finally {
      await fixtureDb.close();
    }
    const inserts = tables.map((table) => {
      const json = JSON.stringify(fixture[table]).replaceAll("'", "''");
      return `insert into identity_proof."${table}" select * from jsonb_populate_recordset(null::identity_proof."${table}", '${json}');`;
    });
    sql("proof_source", `begin;\n${schema}\n${inserts.join("\n")}\ncommit;`);
    const baseline = snapshot("proof_source");
    const baselineMetadata = metadata("proof_source");

    await t.test("the database listens only on its private Unix socket", () => {
      assert.equal(statSync(root).mode & 0o777, 0o700);
      assert.equal(sql("proof_source", "show listen_addresses;").stdout.trim(), "");
      assert.equal(sql("proof_source", "select inet_server_addr() is null;").stdout.trim(), "t");
    });
    await t.test("pg_dump produces a readable custom archive with seven table-data entries", () => {
      command("pg_dump", [...connection, "--format=custom", "--schema=identity_proof", "--strict-names", "--file", archive, "proof_source"]);
      chmodSync(archive, 0o600);
      const toc = command("pg_restore", ["--list", archive]).stdout;
      assert.equal((toc.match(/TABLE DATA identity_proof /g) || []).length, tables.length);
      assert.equal(statSync(archive).mode & 0o777, 0o600);
    });
    await t.test("restore preserves the recovery point despite later source edits", () => {
      sql("proof_source", "update identity_proof.sources set revision=revision+1,body=jsonb_set(body,'{afterBackup}','true');");
      command("pg_restore", [...connection, "--exit-on-error", "--single-transaction", "--dbname=proof_restored", archive]);
      assert.deepEqual(snapshot("proof_restored"), baseline);
      assert.notDeepEqual(snapshot("proof_source"), baseline);
      assert.equal(metadata("proof_restored"), baselineMetadata);
    });
    await t.test("restored data, revisions, receipts and constraints survive a server restart", () => {
      command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
      started = false;
      start();
      assert.deepEqual(snapshot("proof_restored"), baseline);
      assert.equal(metadata("proof_restored"), baselineMetadata);
    });
    await t.test("restored foreign keys reject an invalid reference without modifying data", () => {
      const result = sql("proof_restored", "update identity_proof.links set player_id='30000000-0000-4000-8000-000000000099';", true);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /foreign key/);
      assert.deepEqual(snapshot("proof_restored"), baseline);
    });
    await t.test("repeat restore fails instead of silently replacing the existing database", () => {
      const result = command("pg_restore", [...connection, "--exit-on-error", "--single-transaction", "--dbname=proof_restored", archive], undefined, true);
      assert.notEqual(result.status, 0);
      assert.deepEqual(snapshot("proof_restored"), baseline);
    });
    await t.test("an invalid archive cannot partially initialize a recovery database", () => {
      command("createdb", [...connection, "proof_invalid"]);
      const invalid = join(root, "invalid.dump");
      writeFileSync(invalid, "not a PostgreSQL archive", { mode: 0o600 });
      const result = command("pg_restore", [...connection, "--exit-on-error", "--single-transaction", "--dbname=proof_invalid", invalid], undefined, true);
      assert.notEqual(result.status, 0);
      assert.equal(sql("proof_invalid", "select count(*) from pg_namespace where nspname='identity_proof';").stdout.trim(), "0");
    });
    t.diagnostic(`Synthetic recovery set: ${JSON.stringify(baseline)}`);
  } finally {
    if (started) command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
});
