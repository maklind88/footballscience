import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertApplyAuthorization,
  assertExactDryRun,
  assertNoSensitiveCommandArgs,
  assertPlanArtifact,
  assertTrustedMainContext,
  buildPostApplySql,
  buildPreApplySql,
  canonicalizeSupabaseMigration,
  captureDatabasePassword,
  computePlanSha256,
  expectedPlanObservations,
  extractDryRunMigrations,
  makeConnection,
  postApplyDependencyFingerprints,
  postApplyCatalogFingerprintSql,
  releaseContract,
  stagingDependencyFingerprints,
  verifyFetchedMigrationDirectory,
  verifyTargetMigration,
} from "../scripts/leaderboard-staging-database-release.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetFilename = `${releaseContract.targetVersion}_${releaseContract.targetName}.sql`;
const baseline = JSON.parse(fs.readFileSync(path.join(rootDir, "scripts/leaderboard-staging-baseline.json"), "utf8"));

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("staging release locks the exact remote history and Leaderboard bytes", () => {
  expect(baseline.schema).toBe("footballscience-leaderboard-staging-migration-baseline-v1");
  expect(baseline.projectRef).toBe("pokrksgempkuraueglpu");
  expect(baseline.migrations).toHaveLength(47);
  expect(new Set(baseline.migrations.map(({ version }) => version)).size).toBe(47);
  expect(baseline.migrations.at(-1)).toMatchObject({ version: "20260825024501", name: "medical_sync_event_projection" });
  expect(baseline.migrations.some(({ version }) => releaseContract.forbiddenVersions.includes(version))).toBe(false);

  const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", targetFilename));
  expect(verifyTargetMigration(migration)).toBe(true);
  expect(migration).toHaveLength(releaseContract.targetBytes);
  expect(crypto.createHash("sha256").update(migration).digest("hex")).toBe(releaseContract.targetSha256);
  expect(canonicalizeSupabaseMigration(migration)).toEqual({
    statements: 51,
    bytes: 32042,
    md5: "87266ae8b7847ef07638bc421b5a25a0",
    sha256: "e51c119d3f47b9cc1e473a1518f646b749799dfb3e0f64d882701fddc3fcc36e",
  });
  expect(releaseContract).toMatchObject({
    targetCanonicalStatements: 51,
    targetCanonicalBytes: 32042,
    targetCanonicalMd5: "87266ae8b7847ef07638bc421b5a25a0",
    targetCanonicalSha256: "e51c119d3f47b9cc1e473a1518f646b749799dfb3e0f64d882701fddc3fcc36e",
  });

  const parserProof = baseline.migrations[0];
  const parserProofMigration = fs.readFileSync(
    path.join(rootDir, "supabase", "migrations", `${parserProof.version}_${parserProof.name}.sql`),
  );
  expect(canonicalizeSupabaseMigration(parserProofMigration)).toMatchObject({
    statements: parserProof.statements,
    bytes: parserProof.bytes,
    md5: parserProof.md5,
  });
  expect(releaseContract.projectRef).not.toBe("bustidorxevacosqhkcz");
  expect(releaseContract.poolerHost).toBe("aws-1-us-east-1.pooler.supabase.com");
  expect(releaseContract.poolerPort).toBe(5432);
});

test("fetched history verifier rejects extra, forbidden, or byte-drifted files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "leaderboard-staging-history-contract-"));
  const content = Buffer.from("select 1;\n");
  const entry = {
    version: "20260101000000",
    name: "baseline",
    bytes: content.length,
    md5: crypto.createHash("md5").update(content).digest("hex"),
  };
  try {
    fs.writeFileSync(path.join(tempDir, "20260101000000_baseline.sql"), content);
    expect(verifyFetchedMigrationDirectory(tempDir, [entry])).toEqual(["20260101000000_baseline.sql"]);
    fs.writeFileSync(path.join(tempDir, "20260722202605_session_planner.sql"), "select 2;\n");
    expect(() => verifyFetchedMigrationDirectory(tempDir, [entry])).toThrow(/filenames drifted|Out-of-scope/);
    fs.rmSync(path.join(tempDir, "20260722202605_session_planner.sql"));
    fs.writeFileSync(path.join(tempDir, "20260101000000_baseline.sql"), "select 3;\n");
    expect(() => verifyFetchedMigrationDirectory(tempDir, [entry])).toThrow(/fingerprint drifted/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("trusted-main and immutable same-run plan gates fail closed", () => {
  const sha = "a".repeat(40);
  const context = {
    eventName: "workflow_dispatch",
    repository: "maklind88/footballscience",
    ref: "refs/heads/main",
    expectedSha: sha,
    githubSha: sha,
    checkoutSha: sha,
    originMainSha: sha,
    status: "",
  };
  expect(assertTrustedMainContext(context)).toBe(sha);
  expect(() => assertTrustedMainContext({ ...context, ref: "refs/heads/staging" })).toThrow(/refs\/heads\/main/);
  expect(() => assertTrustedMainContext({ ...context, originMainSha: "b".repeat(40) })).toThrow(/identical/);
  expect(() => assertTrustedMainContext({ ...context, status: "?? unsafe.sql" })).toThrow(/clean/);

  const planSha = computePlanSha256(sha, baseline);
  expect(planSha).toMatch(/^[0-9a-f]{64}$/);
  expect(assertApplyAuthorization({
    mainSha: sha,
    plannedPlanSha256: planSha,
    confirmation: `APPLY_LEADERBOARD_STAGING_${releaseContract.targetVersion}_${sha}`,
  }, baseline)).toBe(planSha);
  expect(() => assertApplyAuthorization({ mainSha: sha, plannedPlanSha256: "b".repeat(64), confirmation: "wrong" }, baseline)).toThrow(/plan artifact SHA256/i);

  const previousRunId = process.env.GITHUB_RUN_ID;
  const previousRunAttempt = process.env.GITHUB_RUN_ATTEMPT;
  process.env.GITHUB_RUN_ID = "123456789";
  process.env.GITHUB_RUN_ATTEMPT = "1";
  try {
    const artifact = {
      schema: releaseContract.planArtifactSchema,
      repository: releaseContract.repository,
      runId: "123456789",
      runAttempt: "1",
      mainSha: sha,
      planSha256: planSha,
      projectRef: releaseContract.projectRef,
      productionProjectRefDenied: releaseContract.productionProjectRef,
      cliVersion: releaseContract.cliVersion,
      cliSha256: releaseContract.cliSha256,
      cliShimSha256: releaseContract.cliShimSha256,
      cliGoSha256: releaseContract.cliGoSha256,
      caSha256: releaseContract.caSha256,
      targetVersion: releaseContract.targetVersion,
      targetSha256: releaseContract.targetSha256,
      targetCanonicalSha256: releaseContract.targetCanonicalSha256,
      observations: expectedPlanObservations(baseline),
    };
    expect(assertPlanArtifact(artifact, { mainSha: sha, planSha })).toBe(planSha);
    expect(() => assertPlanArtifact({ ...artifact, runAttempt: "2" }, { mainSha: sha, planSha })).toThrow(/this run/);
  } finally {
    if (previousRunId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previousRunId;
    if (previousRunAttempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT;
    else process.env.GITHUB_RUN_ATTEMPT = previousRunAttempt;
  }
});

test("dry-run parser accepts exactly one target migration", () => {
  const exact = JSON.stringify({ upToDate: false, dryRun: true, migrations: [targetFilename], seeds: [], roles: [], message: "Finished supabase db push." });
  expect(extractDryRunMigrations(exact)).toEqual([targetFilename]);
  expect(assertExactDryRun(exact)).toEqual(JSON.parse(exact));
  expect(() => assertExactDryRun(JSON.stringify({ ...JSON.parse(exact), migrations: [targetFilename, "20260722202605_session_planner.sql"] }))).toThrow(/not exact/);
  expect(() => assertExactDryRun("No pending migrations")).toThrow(/not one JSON document/);
});

test("staging workflow preserves one protected immutable plan-to-apply lane", () => {
  const workflow = read(".github/workflows/leaderboard-staging-database-release.yml");
  const script = read("scripts/leaderboard-staging-database-release.mjs");
  const security = read("scripts/lib/leaderboard-staging-release-security.mjs");

  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).not.toMatch(/\n\s*push:/);
  expect(workflow).not.toMatch(/pooler[_-]?host/i);
  expect(workflow).not.toMatch(/pooler[_-]?port/i);
  expect(workflow).toContain("group: footballscience-leaderboard-staging-database");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow.match(/environment:\n\s+name: leaderboard-staging-database/g)).toHaveLength(2);
  expect(workflow.match(/if: github\.ref == 'refs\/heads\/main'/g)).toHaveLength(2);
  expect(workflow.match(/ref: \$\{\{ github\.sha \}\}/g)).toHaveLength(2);
  expect(workflow.match(/persist-credentials: false/g)).toHaveLength(2);
  expect(workflow.match(/git fetch --no-tags origin main/g)).toHaveLength(2);
  expect(workflow.match(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g)).toHaveLength(2);
  expect(workflow.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/g)).toHaveLength(2);
  expect(workflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
  expect(workflow).toContain("actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0");
  expect(workflow).not.toMatch(/uses:\s+[^\s@]+@v\d/);
  expect(workflow).toContain("needs: plan");
  expect(workflow).toContain("needs.plan.result == 'success'");
  expect(workflow).toContain("leaderboard-staging-plan-${{ github.run_id }}-${{ github.run_attempt }}");
  expect(workflow).toContain("EXPECTED_PLAN_SHA256: ${{ needs.plan.outputs.plan_sha256 }}");
  expect(workflow).toContain("EXPECTED_ARTIFACT_SHA256: ${{ needs.plan.outputs.artifact_sha256 }}");
  expect(workflow).toContain("artifact_sha256: ${{ steps.plan.outputs.artifact_sha256 }}");
  expect(workflow).not.toContain("reviewed_plan_sha256");
  expect(workflow).toContain("--mode plan");
  expect(workflow).toContain("LEADERBOARD_STAGING_APPLY_CONFIRMATION");
  expect(workflow).toContain("--mode apply");
  expect(workflow).toContain("SUPABASE_CLI_VERSION: 2.115.0");
  expect(workflow).toContain("SUPABASE_CLI_SHA256: ff099608ce758b625532ef03a61f4c9520b995e94ff6cd5480dc0428cad64cb3");
  expect(workflow).toContain("SUPABASE_CLI_SHIM_SHA256: 5986d84e4c7e251126f7579c686b302b3527bc4b2ac1517963930eb0780d3867");
  expect(workflow).toContain("SUPABASE_CLI_GO_SHA256: c507c71c331ee9b4dd87b6ec6cc8a6e4f312a642ff0f9e44931129053c534eef");
  expect(workflow).toContain("SUPABASE_CA_SHA256: 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7");
  expect(workflow.match(/supabase supabase-go/g)).toHaveLength(2);
  expect(workflow.match(/SUPABASE_CLI_PATH=/g)).toHaveLength(2);
  expect(workflow).not.toContain("GITHUB_PATH");
  expect(workflow.match(/SUPABASE_HOME=/g)).toHaveLength(4);
  expect(workflow.match(/SUPABASE_TELEMETRY_DISABLED=1/g)).toHaveLength(4);
  expect(workflow.match(/SUPABASE_NO_UPDATE_NOTIFIER=1/g)).toHaveLength(4);
  expect(workflow.match(/DO_NOT_TRACK=1/g)).toHaveLength(4);
  expect(workflow.match(/chmod 0700 \"\$\{RUNNER_TEMP\}\"/g)).toHaveLength(2);
  expect(workflow).not.toContain("npx");
  expect(workflow).not.toContain("supabase@2.115.0");
  expect(workflow.match(/STAGING_SUPABASE_DB_PASSWORD: \$\{\{ secrets\.STAGING_SUPABASE_DB_PASSWORD \}\}/g)).toHaveLength(2);
  expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
  expect(workflow).not.toMatch(/\n\s+SUPABASE_DB_PASSWORD:/);
  const secretBearingSteps = workflow
    .split("\n      - name: ")
    .filter((step) => step.includes("STAGING_SUPABASE_DB_PASSWORD: ${{ secrets.STAGING_SUPABASE_DB_PASSWORD }}"));
  expect(secretBearingSteps).toHaveLength(2);
  for (const step of secretBearingSteps) {
    expect(step).not.toContain("run: |");
    expect(step.match(/\n\s+run:/g)).toHaveLength(1);
    expect(step).toMatch(/\n\s+run: node scripts\/leaderboard-staging-database-release\.mjs --mode (?:plan|apply)(?:\n|$)/);
  }
  const permissionStep = workflow.split("\n      - name: Normalize downloaded plan artifact permissions")[1].split("\n      - name: ")[0];
  expect(permissionStep).not.toContain("STAGING_SUPABASE_DB_PASSWORD");
  expect(permissionStep).toContain("chmod 0700");
  expect(permissionStep).toContain("chmod 0600");

  expect(script).toContain("--dry-run");
  expect(script).toContain("--skip-vault");
  expect(script).toContain("assertDependencyClosure");
  expect(script).toContain("assertPostApplyState");
  expect(script).toContain("productionProjectRef");
  expect(script).toContain("--output-format\", \"json");
  expect(security).toContain("sslmode\", \"verify-full");
  expect(security).toContain("PGSSLROOTCERT");
  expect(security).toContain("SUPABASE_TELEMETRY_DISABLED");
  expect(script).not.toContain("--include-all");
  expect(script).not.toContain("migration repair");
  expect(releaseContract.projectRef).toBe("pokrksgempkuraueglpu");
  expect(releaseContract.productionProjectRef).toBe("bustidorxevacosqhkcz");
  expect(releaseContract.cliVersion).toBe("2.115.0");
  expect(releaseContract.cliSha256).toBe("ff099608ce758b625532ef03a61f4c9520b995e94ff6cd5480dc0428cad64cb3");
  expect(releaseContract.caSha256).toBe("700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7");
  expect(stagingDependencyFingerprints).toEqual({
    columns: [194, "8b36ab7efb997774d3f5e0a6faa480c6"],
    constraints: [129, "540710140b9ccf631723f1ae2986171b"],
    grants: [194, "2fbf42971bd823bcd87f635f3ec9d710"],
    indexes: [53, "34168e3f72b9f4413b1fdb4591c7ae78"],
    policies: [10, "e3287e44bbf6e0230e3db1fe69ff62b6"],
    relations: [11, "96c6800c1527b3efa8114712615fec08"],
  });
  expect(postApplyDependencyFingerprints).toEqual({
    ...stagingDependencyFingerprints,
    indexes: [58, "149051b629b1d9560159e787c1ca48d0"],
  });
  expect(postApplyCatalogFingerprintSql).toContain("count(*) as object_count");
  expect(postApplyCatalogFingerprintSql).toContain("public.platform_permission_matrix");
});

test("database child processes keep the password out of argv and require verified TLS", () => {
  const password = "ContractOnly-A9z-0123456789abcdef";
  const previousUnrelated = process.env.LEADERBOARD_UNRELATED_SECRET;
  const poolerOverrides = {
    INPUT_POOLER_HOST: "override.invalid",
    PGHOST: "override.invalid",
    PGPORT: "6543",
    STAGING_SUPABASE_POOLER_HOST: "override.invalid",
    STAGING_SUPABASE_POOLER_PORT: "6543",
    SUPABASE_POOLER_HOST: "override.invalid",
  };
  const previousOverrides = Object.fromEntries(
    Object.keys(poolerOverrides).map((key) => [key, process.env[key]]),
  );
  process.env.LEADERBOARD_UNRELATED_SECRET = "must-not-inherit";
  Object.assign(process.env, poolerOverrides);
  try {
    const connection = makeConnection(password);
    const cliUrl = new URL(connection.cliTarget);
    expect(cliUrl.hostname).toBe("aws-1-us-east-1.pooler.supabase.com");
    expect(cliUrl.port).toBe("5432");
    expect(connection.cliTarget).toContain(releaseContract.projectRef);
    expect(connection.cliTarget).toContain("sslmode=verify-full");
    expect(connection.cliTarget).not.toContain(password);
    expect(connection.cliTarget).not.toContain(encodeURIComponent(password));
    expect(connection.cliTarget).not.toContain(releaseContract.productionProjectRef);
    expect(connection.env.PGPASSWORD).toBe(password);
    expect(connection.env.PGSSLMODE).toBe("verify-full");
    expect(connection.env.PGSSLROOTCERT).toMatch(/supabase-prod-ca-2021\.crt$/);
    expect(connection.env.PGHOST).toBeUndefined();
    expect(connection.env.PGPORT).toBeUndefined();
    expect(connection.env.LEADERBOARD_UNRELATED_SECRET).toBeUndefined();
    expect(connection.psqlArgs.join(" ")).not.toContain(password);
    expect(connection.psqlArgs).toContain("--no-password");
    expect(connection.psqlArgs).toEqual(expect.arrayContaining([
      "--host", "aws-1-us-east-1.pooler.supabase.com", "--port", "5432",
    ]));
    for (const override of Object.values(poolerOverrides)) {
      expect(connection.cliTarget).not.toContain(override);
      expect(connection.psqlArgs).not.toContain(override);
    }
    expect(assertNoSensitiveCommandArgs(["db", "push", "--db-url", connection.cliTarget], connection.secrets)).toBe(true);
    expect(() => assertNoSensitiveCommandArgs([releaseContract.productionProjectRef], connection.secrets)).toThrow(/Production project ref/);
    expect(() => assertNoSensitiveCommandArgs([`postgresql://user:${password}@db.invalid/postgres`], connection.secrets)).toThrow(/credential/i);
    expect(() => assertNoSensitiveCommandArgs(["postgresql://user:other-secret@db.invalid/postgres"])).toThrow(/Credential-bearing/);
    const preApplySql = buildPreApplySql();
    expect(preApplySql).toContain("pg_stat_ssl");
    expect(preApplySql).toContain("current_database() <> 'postgres'");
    expect(preApplySql).toContain("current_user <> 'postgres'");
    for (const sql of [preApplySql, buildPostApplySql()]) {
      expect(sql).toContain("n.nspname='public' and c.relname like 'session_planner_%'");
      expect(sql).toContain("n.nspname='app_private' and (p.proname like 'session_planner_%' or p.proname='can_read_session_planner_scope')");
      expect(sql).toContain("(select count(*) from public.platform_module_migration_checkpoints where module_id='session-planner') <> 1");
      expect(sql).toContain("source_storage_key='football-session-planner-v3' and target_table='sessions' and phase='planned'");
      expect(sql).toContain("reads_from_database is false and writes_to_database is false and app_state_fallback_enabled is true and owner='platform'");
      expect(sql).toContain("module_id='session-planner' and target_table='session_planner_sessions'");
      expect(sql).toContain("public.platform_permission_matrix where module_id='set-pieces-room'");
    }
  } finally {
    if (previousUnrelated === undefined) delete process.env.LEADERBOARD_UNRELATED_SECRET;
    else process.env.LEADERBOARD_UNRELATED_SECRET = previousUnrelated;
    for (const [key, value] of Object.entries(previousOverrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("staging password is masked and removed from the parent environment before child work", () => {
  const source = { STAGING_SUPABASE_DB_PASSWORD: "Mask-A9z-0123456789", GITHUB_ACTIONS: "true" };
  let commands = "";
  const password = captureDatabasePassword(source, { write: (value) => { commands += value; } });
  expect(password).toBe("Mask-A9z-0123456789");
  expect(source.STAGING_SUPABASE_DB_PASSWORD).toBeUndefined();
  expect(commands).toContain("::add-mask::Mask-A9z-0123456789");
});
