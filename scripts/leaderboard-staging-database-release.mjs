import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalizeSupabaseMigration } from "./lib/leaderboard-supabase-migration-canonicalizer.mjs";
import {
  dependencyFingerprintSql,
  makePostApplySql,
  makePreApplySql,
  postApplyCatalogFingerprintSql,
} from "./lib/leaderboard-staging-database-sql.mjs";
import {
  assertSafeCommandArgs,
  captureDatabasePassword,
  makeStagingConnection,
  redact,
  resolvePinnedTooling,
  scopedChildEnvironment,
} from "./lib/leaderboard-staging-release-security.mjs";

export { canonicalizeSupabaseMigration, captureDatabasePassword, dependencyFingerprintSql, postApplyCatalogFingerprintSql };

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(rootDir, "scripts", "leaderboard-staging-baseline.json");

export const releaseContract = Object.freeze({
  schema: "footballscience-leaderboard-staging-database-release-v1",
  planArtifactSchema: "footballscience-leaderboard-staging-database-plan-v1",
  repository: "maklind88/footballscience",
  projectRef: "pokrksgempkuraueglpu",
  productionProjectRef: "bustidorxevacosqhkcz",
  poolerHost: "aws-0-us-east-1.pooler.supabase.com",
  poolerPort: 5432,
  database: "postgres",
  cliVersion: "2.115.0",
  cliSha256: "ff099608ce758b625532ef03a61f4c9520b995e94ff6cd5480dc0428cad64cb3",
  cliShimSha256: "5986d84e4c7e251126f7579c686b302b3527bc4b2ac1517963930eb0780d3867",
  cliGoSha256: "c507c71c331ee9b4dd87b6ec6cc8a6e4f312a642ff0f9e44931129053c534eef",
  caSha256: "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7",
  targetVersion: "20260825181453",
  targetName: "leaderboard_foundation",
  targetBytes: 32045,
  targetMd5: "825daea7b2ecfb2ff7587cc24015905b",
  targetSha256: "c4e719b1fc7600f57f4bcf8726704877a76b793423eaeb42d4c7365e43d19717",
  targetCanonicalStatements: 51,
  targetCanonicalBytes: 32042,
  targetCanonicalMd5: "87266ae8b7847ef07638bc421b5a25a0",
  targetCanonicalSha256: "e51c119d3f47b9cc1e473a1518f646b749799dfb3e0f64d882701fddc3fcc36e",
  forbiddenVersions: ["20260722202605", "20260810214000"],
});

export const stagingDependencyFingerprints = Object.freeze({
  columns: [194, "8b36ab7efb997774d3f5e0a6faa480c6"],
  constraints: [129, "540710140b9ccf631723f1ae2986171b"],
  grants: [194, "2fbf42971bd823bcd87f635f3ec9d710"],
  indexes: [53, "34168e3f72b9f4413b1fdb4591c7ae78"],
  policies: [10, "e3287e44bbf6e0230e3db1fe69ff62b6"],
  relations: [11, "96c6800c1527b3efa8114712615fec08"],
});

export const postApplyDependencyFingerprints = Object.freeze({
  ...stagingDependencyFingerprints,
  indexes: [58, "149051b629b1d9560159e787c1ca48d0"],
});

const targetFilename = `${releaseContract.targetVersion}_${releaseContract.targetName}.sql`;
const targetPath = path.join(rootDir, "supabase", "migrations", targetFilename);
const expectedApplyPrefix = `APPLY_LEADERBOARD_STAGING_${releaseContract.targetVersion}_`;
const pinnedCaPath = path.join(rootDir, "scripts", "certs", "supabase-prod-ca-2021.crt");

function digest(algorithm, value) {
  return crypto.createHash(algorithm).update(value).digest("hex");
}

function readCanonicalTarget() {
  const buffer = fs.readFileSync(targetPath);
  verifyTargetMigration(buffer);
  const canonical = canonicalizeSupabaseMigration(buffer);
  const golden = {
    statements: releaseContract.targetCanonicalStatements,
    bytes: releaseContract.targetCanonicalBytes,
    md5: releaseContract.targetCanonicalMd5,
    sha256: releaseContract.targetCanonicalSha256,
  };
  if (JSON.stringify(canonical) !== JSON.stringify(golden)) {
    throw new Error(`Leaderboard canonical migration fingerprint drifted: ${JSON.stringify(canonical)}.`);
  }
  return canonical;
}

function readBaseline() {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (baseline.schema !== "footballscience-leaderboard-staging-migration-baseline-v1") {
    throw new Error("Unexpected staging migration baseline schema.");
  }
  if (baseline.projectRef !== releaseContract.projectRef || baseline.migrations?.length !== 47) {
    throw new Error("Staging migration baseline must contain the exact 47-row staging history.");
  }
  return baseline;
}

function migrationFilename(entry) {
  return `${entry.version}_${entry.name}.sql`;
}

export function verifyTargetMigration(buffer) {
  const failures = [];
  if (buffer.length !== releaseContract.targetBytes) failures.push(`bytes=${buffer.length}`);
  if (digest("md5", buffer) !== releaseContract.targetMd5) failures.push("MD5 mismatch");
  if (digest("sha256", buffer) !== releaseContract.targetSha256) failures.push("SHA256 mismatch");
  if (failures.length) throw new Error(`Leaderboard migration integrity failed: ${failures.join(", ")}.`);
  return true;
}

export function verifyFetchedMigrationDirectory(migrationsDir, expectedEntries) {
  const actualFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  const expectedFiles = expectedEntries.map(migrationFilename).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Remote migration filenames drifted. Expected ${expectedFiles.length}; received ${actualFiles.length}.`);
  }
  for (const entry of expectedEntries) {
    const buffer = fs.readFileSync(path.join(migrationsDir, migrationFilename(entry)));
    if (buffer.length !== entry.bytes || digest("md5", buffer) !== entry.md5) {
      throw new Error(`Remote migration statement fingerprint drifted at ${entry.version}_${entry.name}.`);
    }
  }
  for (const version of releaseContract.forbiddenVersions) {
    if (actualFiles.some((name) => name.startsWith(`${version}_`))) {
      throw new Error(`Out-of-scope migration ${version} must remain absent.`);
    }
  }
  return actualFiles;
}

export function assertExactPushJson(output, dryRun) {
  let actual;
  try {
    actual = JSON.parse(String(output).trim());
  } catch {
    throw new Error("Supabase db push stdout was not one JSON document.");
  }
  const expected = {
    upToDate: false,
    dryRun,
    migrations: [targetFilename],
    seeds: [],
    roles: [],
    message: "Finished supabase db push.",
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Supabase db push JSON was not exact: ${JSON.stringify(actual)}.`);
  }
  return Object.freeze(actual);
}

export function extractDryRunMigrations(output) {
  return assertExactPushJson(output, true).migrations;
}

export function assertExactDryRun(output) {
  return assertExactPushJson(output, true);
}

export function assertTrustedMainContext(context) {
  const fullSha = /^[0-9a-f]{40}$/;
  if (context.eventName !== "workflow_dispatch") throw new Error("Database release must be manual workflow_dispatch only.");
  if (context.repository !== releaseContract.repository) throw new Error("Unexpected GitHub repository.");
  if (context.ref !== "refs/heads/main") throw new Error("Database release must run from refs/heads/main.");
  for (const [label, value] of [["expected", context.expectedSha], ["GitHub", context.githubSha], ["checkout", context.checkoutSha], ["origin/main", context.originMainSha]]) {
    if (!fullSha.test(value || "")) throw new Error(`${label} SHA must be a full lowercase commit SHA.`);
  }
  if (new Set([context.expectedSha, context.githubSha, context.checkoutSha, context.originMainSha]).size !== 1) {
    throw new Error("Expected SHA, workflow SHA, checkout SHA, and current origin/main must be identical.");
  }
  if (context.status !== "") throw new Error("Trusted-main checkout must be clean before database release work.");
  return context.githubSha;
}

function manifestObservation(entries) {
  const rows = entries.map(({ version, name, statements, bytes, md5 }) => ({ version, name, statements, bytes, md5 }));
  return Object.freeze({ count: rows.length, sha256: digest("sha256", `${JSON.stringify(rows)}\n`) });
}

export function expectedPlanObservations(baseline = readBaseline()) {
  return Object.freeze({
    remoteHistory: manifestObservation(baseline.migrations),
    dependencyClosure: Object.freeze({ sha256: digest("sha256", `${JSON.stringify(stagingDependencyFingerprints)}\n`) }),
    tls: Object.freeze({ mode: "verify-full", caSha256: releaseContract.caSha256 }),
    dbPushPlan: Object.freeze({ upToDate: false, dryRun: true, migrations: [targetFilename], seeds: [], roles: [], message: "Finished supabase db push." }),
    lint: Object.freeze({ schemas: "public,app_private", level: "error", failOn: "error", status: "clean" }),
  });
}

function buildPlanArtifact(mainSha, planSha, observations = expectedPlanObservations()) {
  return {
    schema: releaseContract.planArtifactSchema,
    repository: releaseContract.repository,
    runId: String(process.env.GITHUB_RUN_ID || ""),
    runAttempt: String(process.env.GITHUB_RUN_ATTEMPT || ""),
    mainSha,
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
    observations,
  };
}

export function assertPlanArtifact(artifact, { mainSha, planSha }, baseline = readBaseline()) {
  const expected = buildPlanArtifact(mainSha, planSha, expectedPlanObservations(baseline));
  if (JSON.stringify(artifact) !== JSON.stringify(expected)) {
    throw new Error("Immutable staging plan artifact does not match this run, main SHA, CLI, or migration.");
  }
  return artifact.planSha256;
}

function planArtifactPath() {
  const value = String(process.env.LEADERBOARD_PLAN_ARTIFACT_PATH || "").trim();
  const runnerTemp = String(process.env.RUNNER_TEMP || "").trim();
  if (!value || !runnerTemp) throw new Error("Plan artifact path and RUNNER_TEMP are required.");
  const resolved = path.resolve(value);
  const trustedRoot = path.resolve(runnerTemp);
  if (!resolved.startsWith(`${trustedRoot}${path.sep}`)) throw new Error("Plan artifact must remain under RUNNER_TEMP.");
  return resolved;
}

function writePlanArtifact(mainSha, planSha, observations) {
  const artifactPath = planArtifactPath();
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true, mode: 0o700 });
  if ((fs.lstatSync(path.dirname(artifactPath)).mode & 0o777) !== 0o700) throw new Error("Plan artifact directory must be mode 0700.");
  const bytes = Buffer.from(`${JSON.stringify(buildPlanArtifact(mainSha, planSha, observations))}\n`, "utf8");
  fs.writeFileSync(artifactPath, bytes, { flag: "wx", mode: 0o600 });
  return digest("sha256", bytes);
}

function readAndVerifyPlanArtifact(mainSha, planSha) {
  const artifactPath = planArtifactPath();
  const stat = fs.lstatSync(artifactPath);
  const parent = fs.lstatSync(path.dirname(artifactPath));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 || (stat.mode & 0o777) !== 0o600 || !parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700) {
    throw new Error("Plan artifact must be one private small regular file under a private directory.");
  }
  const bytes = fs.readFileSync(artifactPath);
  if (digest("sha256", bytes) !== process.env.EXPECTED_ARTIFACT_SHA256) throw new Error("Downloaded plan artifact byte SHA256 does not match needs.plan.");
  const artifact = JSON.parse(bytes.toString("utf8"));
  assertPlanArtifact(artifact, { mainSha, planSha });
  return artifact;
}

export function computePlanSha256(mainSha, baseline = readBaseline()) {
  const canonicalTarget = readCanonicalTarget();
  const payload = {
    schema: releaseContract.schema,
    mainSha,
    projectRef: releaseContract.projectRef,
    cliVersion: releaseContract.cliVersion,
    target: {
      version: releaseContract.targetVersion,
      name: releaseContract.targetName,
      bytes: releaseContract.targetBytes,
      md5: releaseContract.targetMd5,
      sha256: releaseContract.targetSha256,
      canonicalStatements: canonicalTarget.statements,
      canonicalBytes: canonicalTarget.bytes,
      canonicalMd5: canonicalTarget.md5,
      canonicalSha256: canonicalTarget.sha256,
    },
    baseline: baseline.migrations.map(({ version, name, statements, bytes, md5 }) => ({ version, name, statements, bytes, md5 })),
  };
  return digest("sha256", `${JSON.stringify(payload)}\n`);
}

export function assertApplyAuthorization({ mainSha, plannedPlanSha256, confirmation }, baseline = readBaseline()) {
  const expectedPlan = computePlanSha256(mainSha, baseline);
  if (plannedPlanSha256 !== expectedPlan) throw new Error("Plan artifact SHA256 does not match this immutable main/baseline/migration plan.");
  if (confirmation !== `${expectedApplyPrefix}${mainSha}`) throw new Error("Apply confirmation is not exact for this migration and main SHA.");
  return expectedPlan;
}

function runGit(args) {
  const result = spawnSync("git", args, { cwd: rootDir, env: scopedChildEnvironment(), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed.`);
  return result.stdout.trim();
}

function collectTrustedMainContext() {
  return {
    eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    expectedSha: process.env.EXPECTED_MAIN_SHA,
    githubSha: process.env.GITHUB_SHA,
    checkoutSha: runGit(["rev-parse", "HEAD"]),
    originMainSha: runGit(["rev-parse", "origin/main"]),
    status: runGit(["status", "--porcelain"]),
  };
}

export function makeConnection(password, caPath = pinnedCaPath) {
  return makeStagingConnection(releaseContract, password, caPath);
}

export function assertNoSensitiveCommandArgs(args, secrets = []) {
  return assertSafeCommandArgs(releaseContract.productionProjectRef, args, secrets);
}

function runCheckedResult(label, command, args, options = {}) {
  assertNoSensitiveCommandArgs(args, options.secrets || []);
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    env: options.env || scopedChildEnvironment(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = redact(`${result.error?.message || ""}\n${result.stdout || ""}\n${result.stderr || ""}`, options.secrets || []).trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : "."}`);
  }
  return Object.freeze({ stdout: result.stdout || "", stderr: result.stderr || "" });
}

function runChecked(label, command, args, options = {}) {
  const result = runCheckedResult(label, command, args, options);
  return `${result.stdout}\n${result.stderr}`;
}

function makeMigrationWorkdir() {
  const runnerTemp = path.resolve(String(process.env.RUNNER_TEMP || os.tmpdir()));
  const workdir = fs.mkdtempSync(path.join(runnerTemp, "footballscience-leaderboard-staging-db-"));
  if (fs.readdirSync(workdir).length !== 0 || (fs.lstatSync(workdir).mode & 0o777) !== 0o700) {
    throw new Error("Isolated migration workdir must be empty and mode 0700.");
  }
  fs.mkdirSync(path.join(workdir, "supabase", "migrations"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(workdir, "supabase", "config.toml"),
    `project_id = "leaderboard-staging-isolated"\n[db]\nmajor_version = 17\n`,
    { flag: "wx", mode: 0o600 },
  );
  return workdir;
}

function runSupabase(tooling, connection, label, args, workdir, { capture = false } = {}) {
  const runner = capture ? runCheckedResult : runChecked;
  return runner(label, tooling.cliPath, [...args, "--workdir", workdir, "--yes", "--log-level", "error"], {
    cwd: workdir,
    env: connection.env,
    secrets: connection.secrets,
  });
}

function fetchAndVerify(tooling, connection, expectedEntries) {
  const workdir = makeMigrationWorkdir();
  runSupabase(tooling, connection, "Supabase migration fetch", ["migration", "fetch", "--db-url", connection.cliTarget], workdir);
  verifyFetchedMigrationDirectory(path.join(workdir, "supabase", "migrations"), expectedEntries);
  return Object.freeze({ workdir, observation: manifestObservation(expectedEntries) });
}

function psql(connection, label, sql, { tuples = false } = {}) {
  const args = [...connection.psqlArgs];
  if (tuples) args.push("--tuples-only", "--no-align", "--field-separator=\t");
  args.push("--command", sql);
  return runChecked(label, "psql", args, { env: connection.env, secrets: connection.secrets });
}

function assertDependencyClosure(connection, expected = stagingDependencyFingerprints) {
  const output = psql(connection, "Leaderboard staging dependency fingerprint", dependencyFingerprintSql, { tuples: true });
  const rows = output.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split("\t"));
  const actual = Object.fromEntries(rows.map(([category, count, fingerprint]) => [category, [Number(count), fingerprint]]));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Leaderboard prerequisite catalog drifted: ${JSON.stringify(actual)}.`);
  }
  return Object.freeze({ sha256: digest("sha256", `${JSON.stringify(actual)}\n`) });
}

function assertPreApplyState(connection) {
  psql(connection, "Leaderboard staging pre-apply state", buildPreApplySql());
  return assertDependencyClosure(connection);
}

export function buildPreApplySql() {
  return makePreApplySql(releaseContract);
}

export function buildPostApplySql() {
  return makePostApplySql(releaseContract, readCanonicalTarget());
}

function assertPostApplyState(connection) {
  psql(connection, "Leaderboard staging post-apply catalog and ACL", buildPostApplySql());
  const catalog = psql(connection, "Leaderboard exact post-apply catalog fingerprint", postApplyCatalogFingerprintSql, { tuples: true }).trim();
  if (catalog !== "175\tff4915614faf4a99ed13ec2dd1c8af17\t5\t65\t57\t23\t5\t6\t7\t0\t7") {
    throw new Error(`Leaderboard exact post-apply catalog drifted: ${catalog}.`);
  }
  assertDependencyClosure(connection, postApplyDependencyFingerprints);
}

function writeWorkflowResult(mode, mainSha, planSha, observations) {
  const artifactSha = mode === "plan" ? writePlanArtifact(mainSha, planSha, observations) : "";
  const lines = [
    `## Leaderboard staging database ${mode}`,
    "",
    `- trusted main: \`${mainSha}\``,
    `- project ref: \`${releaseContract.projectRef}\``,
    `- migration: \`${targetFilename}\``,
    `- migration SHA256: \`${releaseContract.targetSha256}\``,
    `- same-run plan SHA256: \`${planSha}\``,
  ];
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `plan_sha256=${planSha}\n${artifactSha ? `artifact_sha256=${artifactSha}\n` : ""}`);
  console.log(`Leaderboard staging database ${mode}: ok`);
  console.log(`Same-run plan SHA256: ${planSha}`);
}

export function main(argv = process.argv.slice(2)) {
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : "";
  if (!['plan','apply'].includes(mode)) throw new Error("Use --mode plan or --mode apply.");
  const databasePassword = captureDatabasePassword();
  const tooling = resolvePinnedTooling(releaseContract, rootDir);
  const mainSha = assertTrustedMainContext(collectTrustedMainContext());
  const baseline = readBaseline();
  verifyTargetMigration(fs.readFileSync(targetPath));
  const planSha = computePlanSha256(mainSha, baseline);
  let planArtifact;
  if (mode === "apply") {
    planArtifact = readAndVerifyPlanArtifact(mainSha, planSha);
    const artifactPlanSha = planArtifact.planSha256;
    if (process.env.EXPECTED_PLAN_SHA256 !== artifactPlanSha) {
      throw new Error("needs.plan output does not match this run's immutable plan artifact.");
    }
    assertApplyAuthorization({ mainSha, plannedPlanSha256: artifactPlanSha, confirmation: process.env.LEADERBOARD_STAGING_APPLY_CONFIRMATION }, baseline);
  }
  const installedCliVersion = runChecked("Supabase CLI availability", tooling.cliPath, ["--version"], { env: scopedChildEnvironment({ SUPABASE_HOME: tooling.supabaseHome, SUPABASE_TELEMETRY_DISABLED: "1", SUPABASE_NO_UPDATE_NOTIFIER: "1", DO_NOT_TRACK: "1" }) }).trim();
  if (installedCliVersion !== releaseContract.cliVersion) throw new Error(`Supabase CLI must be exactly ${releaseContract.cliVersion}.`);
  const connection = makeConnection(databasePassword, tooling.caPath);
  runChecked("psql availability", "psql", ["--version"], { env: scopedChildEnvironment(), secrets: connection.secrets });
  const dependencyClosure = assertPreApplyState(connection);
  const fetched = fetchAndVerify(tooling, connection, baseline.migrations);
  const { workdir } = fetched;
  try {
    fs.copyFileSync(targetPath, path.join(workdir, "supabase", "migrations", targetFilename), fs.constants.COPYFILE_EXCL);
    verifyTargetMigration(fs.readFileSync(path.join(workdir, "supabase", "migrations", targetFilename)));
    const dryRun = runSupabase(tooling, connection, "Supabase exact dry-run", ["db", "push", "--db-url", connection.cliTarget, "--dry-run", "--skip-vault", "--output-format", "json"], workdir, { capture: true });
    const dbPushPlan = assertExactDryRun(dryRun.stdout);
    runSupabase(tooling, connection, "Supabase pre-apply lint", ["db", "lint", "--db-url", connection.cliTarget, "--schema", "public,app_private", "--level", "error", "--fail-on", "error"], workdir);
    const observations = Object.freeze({ remoteHistory: fetched.observation, dependencyClosure, tls: connection.tlsObservation, dbPushPlan, lint: Object.freeze({ schemas: "public,app_private", level: "error", failOn: "error", status: "clean" }) });
    if (JSON.stringify(observations) !== JSON.stringify(expectedPlanObservations(baseline))) throw new Error("Runtime plan observations did not match the locked release contract.");
    if (planArtifact && JSON.stringify(planArtifact.observations) !== JSON.stringify(observations)) throw new Error("Apply re-plan did not match this run's immutable plan observations.");
    if (mode === "apply") {
      assertPreApplyState(connection);
      const applied = runSupabase(tooling, connection, "Supabase exact apply", ["db", "push", "--db-url", connection.cliTarget, "--skip-vault", "--output-format", "json"], workdir, { capture: true });
      assertExactPushJson(applied.stdout, false);
      const canonicalTarget = readCanonicalTarget();
      const postFetch = fetchAndVerify(tooling, connection, [...baseline.migrations, { version: releaseContract.targetVersion, name: releaseContract.targetName, statements: canonicalTarget.statements, bytes: canonicalTarget.bytes, md5: canonicalTarget.md5 }]);
      fs.rmSync(postFetch.workdir, { recursive: true, force: true });
      assertPostApplyState(connection);
      runSupabase(tooling, connection, "Supabase post-apply lint", ["db", "lint", "--db-url", connection.cliTarget, "--schema", "public,app_private", "--level", "error", "--fail-on", "error"], workdir);
    }
    writeWorkflowResult(mode, mainSha, planSha, observations);
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Leaderboard staging database release stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
