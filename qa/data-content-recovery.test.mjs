import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  compareContent, contentTableDDL, identifier, maxRecoveryBytes, metadataQuery, productionPooler,
  productionRef, recoveryPlan, recoveryTables, requireExecution, snapshotTransaction,
  tableContentQuery, verifyDataOnlyToc,
} from "../scripts/lib/data-content-recovery-plan.mjs";

const sha = "a".repeat(40);
const proposedEnv = {
  GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: "maklind88/footballscience",
  GITHUB_REF: "refs/heads/main", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux",
  RECOVERY_EXPECTED_SHA: sha, GITHUB_SHA: sha, RECOVERY_CONFIRM: "DATA_CONTENT_DRILL_ONLY",
  SUPABASE_PROJECT_REF: productionRef, SUPABASE_DB_POOLER_HOST: productionPooler,
  SUPABASE_DB_PASSWORD: "synthetic-test-value",
};
const column = (name, type) => ({ name, type, typeSchema: "pg_catalog", generated: "", identity: "", notNull: true });
const table = (name = "sample") => ({ name, kind: "r", bytes: 8192, columns: [column("id", "uuid"), column("payload", "jsonb")] });

test("plan declares exact bounded scope and does not certify complete recovery", () => {
  const plan = recoveryPlan();
  assert.equal(plan.mode, "plan");
  assert.equal(plan.sourceReadOnly, true);
  assert.equal(plan.fullRecoveryVerified, false);
  assert.equal(plan.retainedArchive, false);
  assert.equal(plan.rawDataInLogs, false);
  assert.equal(plan.tables.length, 13);
  assert.equal(new Set(plan.tables).size, plan.tables.length);
  assert.ok(plan.tables.includes("medical_state_sync_events"));
  assert.ok(plan.tables.includes("squad_roster_memberships"));
  assert.ok(!plan.tables.some((name) => /auth|session|token/.test(name)));
  assert.ok(plan.excludes.includes("schema-security"));
  assert.ok(plan.excludes.includes("offline-drafts"));
  plan.tables.pop();
  assert.equal(recoveryTables.length, 13);
});

test("proposed execution identity requires explicit SHA confirmation", () => {
  assert.doesNotThrow(() => requireExecution(proposedEnv));
  for (const key of Object.keys(proposedEnv)) {
    assert.throws(() => requireExecution({ ...proposedEnv, [key]: "" }), undefined, key);
  }
  assert.throws(() => requireExecution({ ...proposedEnv, GITHUB_SHA: "b".repeat(40) }));
});

test("forks, PRs, feature branches, schedules and self-hosted runners are not execution contexts", () => {
  for (const patch of [
    { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_EVENT_NAME: "schedule" },
    { GITHUB_REF: "refs/heads/codex/work" }, { GITHUB_REPOSITORY: "someone/footballscience" },
    { RUNNER_ENVIRONMENT: "self-hosted" }, { RUNNER_OS: "macOS" },
  ]) assert.throws(() => requireExecution({ ...proposedEnv, ...patch }));
});

test("staging and attacker-controlled source hosts fail closed without disclosing credentials", () => {
  for (const patch of [{ SUPABASE_PROJECT_REF: "pokrksgempkuraueglpu" }, { SUPABASE_DB_POOLER_HOST: "example.com" },
    { SUPABASE_DB_PASSWORD: "bad\ncredential" }]) {
    assert.throws(() => requireExecution({ ...proposedEnv, ...patch }), (error) => !error.message.includes("credential\n"));
  }
});

test("snapshot SQL pins repeatable-read read-only transaction and rejects injected identifiers", () => {
  assert.equal(snapshotTransaction("00000003-000000AB-1", "SELECT 1"),
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '00000003-000000AB-1'; SELECT 1; ROLLBACK;");
  for (const value of ["", "x';COMMIT;", "1-2-3;", undefined]) assert.throws(() => snapshotTransaction(value, "SELECT 1"));
  assert.equal(identifier("medical_state_sync_events"), '"medical_state_sync_events"');
  for (const value of ["auth.users", "x;drop table x", 'a"b', "*", undefined]) assert.throws(() => identifier(value));
});

test("metadata query includes only explicit public tables, never row payloads or auth credentials", () => {
  const query = metadataQuery();
  assert.match(query, /n.nspname='public'/);
  assert.match(query, /pg_attribute/);
  for (const name of recoveryTables) assert.ok(query.includes(`'${name}'`));
  assert.doesNotMatch(query, /auth\.users|encrypted_password|SELECT \*/);
  assert.throws(() => metadataQuery(["a';SELECT 1"]));
});

test("local content schema preserves column order, types and nullability but executes no source expressions", () => {
  assert.equal(contentTableDDL([table()], ["sample"]), 'CREATE TABLE public."sample" ("id" uuid NOT NULL,"payload" jsonb NOT NULL);');
  for (const type of ["text[]", "timestamp with time zone", "timestamp without time zone", "numeric(10,2)", "bigint", "date", "boolean"]) {
    assert.ok(contentTableDDL([{ ...table(), columns: [column("value", type)] }], ["sample"]).includes(type));
  }
});

test("missing, duplicate, partitioned, oversized and invalid metadata never produces a partial scope", () => {
  for (const metadata of [[], [table(), table()], [{ ...table(), name: "wrong" }],
    [{ ...table(), kind: "p" }], [{ ...table(), bytes: maxRecoveryBytes + 1 }],
    [{ ...table(), bytes: -1 }], [{ ...table(), columns: [] }]]) {
    assert.throws(() => contentTableDDL(metadata, ["sample"]));
  }
});

test("generated columns, identity sequences, extension types and injected type SQL need separate review", () => {
  for (const patch of [{ generated: "s" }, { identity: "a" }, { typeSchema: "public" },
    { type: "text);DROP TABLE public.sample;--" }, { type: "custom_enum" }, { name: 'x"' }]) {
    assert.throws(() => contentTableDDL([{ ...table(), columns: [{ ...column("value", "text"), ...patch }] }], ["sample"]));
  }
});

test("content comparison includes every column and uses deterministic server ordering", () => {
  const sql = tableContentQuery("sample");
  assert.match(sql, /row_to_json\(t\)::text/);
  assert.match(sql, /COLLATE "C"/);
  assert.match(sql, /TO STDOUT$/);
  assert.doesNotMatch(sql, /WHERE|LIMIT|UPDATE|DELETE/);
});

test("data-only archive allows exactly one entry per reviewed table", () => {
  const toc = "; header\n1; 0 12 TABLE DATA public sample postgres\n";
  assert.doesNotThrow(() => verifyDataOnlyToc(toc, ["sample"]));
  for (const unsafe of ["", `${toc}2; 0 13 TABLE DATA public sample postgres`,
    "1; 0 12 TABLE DATA auth users postgres", "1; 0 12 FUNCTION public run_job() postgres",
    "1; 0 12 SEQUENCE SET public sample_id_seq postgres", "1; 0 12 TABLE DATA public other postgres"]) {
    assert.throws(() => verifyDataOnlyToc(unsafe, ["sample"]));
  }
});

test("same counts cannot hide changed payloads, missing tables, revisions or deleted rows", () => {
  const expected = { sample: { sha256: "a".repeat(64), rows: 3, bytes: 64 } };
  assert.deepEqual(compareContent(expected, structuredClone(expected)), { tablesCompared: 1, rowsCompared: 3 });
  for (const patch of [{ sha256: "b".repeat(64) }, { rows: 2 }, { bytes: 65 }]) {
    assert.throws(() => compareContent(expected, { sample: { ...expected.sample, ...patch } }));
  }
  assert.throws(() => compareContent(expected, {}));
  assert.throws(() => compareContent(expected, { ...expected, unexpected: expected.sample }));
});

test("CLI is offline by default, accepts no execution mode and emits no supplied secret", () => {
  const command = new URL("../scripts/data-content-recovery-plan.mjs", import.meta.url);
  const env = { ...process.env, SUPABASE_DB_PASSWORD: "never-print-this-synthetic-secret", PGHOST: "invalid.example" };
  const result = spawnSync(process.execPath, [command.pathname], { env, encoding: "utf8" });
  assert.equal(result.status, 0);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.destinationApproval, "pending");
  assert.ok(!`${result.stdout}${result.stderr}`.includes(env.SUPABASE_DB_PASSWORD));
  const rejected = spawnSync(process.execPath, [command.pathname, "--execute"], { env, encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /not enabled/);
});
