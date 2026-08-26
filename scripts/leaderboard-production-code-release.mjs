import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendGithubOutput, assertArtifactPath, assertNoSecretLeak, assertOnlyMirroredOccurrences, assertSupabaseUrl, canonicalDigest, canonicalJson, captureSecrets, childEnvironment, fetchBytes, fetchJson, git, invariant, readArtifact, readDotenv, readJson, redact, runCaptured, runChecked, sha256, writeArtifact } from "./lib/leaderboard-production-release-security.mjs";
import { assertCredentialHealth, assertFreezeFresh, assertGithubEvidence, assertGithubRace, assertReleaseEnvironments, assertVercelDeploymentRecords } from "./lib/leaderboard-production-release-evidence.mjs";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = readJson(path.join(rootDir, "scripts/leaderboard-production-release-baseline.json"), "release baseline");
const artifactSchema = "footballscience-leaderboard-production-code-plan-v1";
const dbAttestationSchema = "footballscience-leaderboard-production-db-attestation-v1";
const candidateDir = () => path.resolve(process.env.CANDIDATE_DIR || path.join(rootDir, ".release-candidate"));
const cliToolDir = path.join(rootDir, "scripts/release-tools/vercel-cli");
const cliEntry = path.join(cliToolDir, "node_modules/vercel/dist/vc.js");
let processSecrets = {};
export function databaseAttestationDigest(observedAt) { return canonicalDigest({ schema: dbAttestationSchema, observedAt, supabase: baseline.supabase }); }
export function assertFreshReleaseTimestamp(value, maxAgeMs, now = Date.now(), label = "Release evidence") {
  const timestamp = Date.parse(value);
  invariant(Number.isFinite(timestamp) && now - timestamp <= maxAgeMs && timestamp - now <= 120_000, `${label} is stale or from the future.`);
  return timestamp;
}
export function assertReleaseEvidenceWindow(plan, db, freezes, now = Date.now()) {
  assertFreshReleaseTimestamp(plan?.createdAt, 45 * 60_000, now, "Release plan"); assertFreshReleaseTimestamp(db?.observedAt, 30 * 60_000, now, "Production DB reviewer attestation"); assertFreezeFresh(freezes, now); return true;
}
export function assertRailEntries(entries, allowedPaths = baseline.allowedRailPaths) {
  invariant(entries.length === allowedPaths.length, "Rail diff must contain the exact allowlisted file count.");
  const allowed = new Set(allowedPaths);
  for (const [status, file] of entries) { invariant(status === "A" || (status === "M" && file === "package.json"), `Rail diff status is forbidden: ${status} ${file}.`); invariant(allowed.has(file), `Rail diff escaped the infra/QA allowlist: ${file}.`); }
  invariant(new Set(entries.map(([, file]) => file)).size === allowed.size, "Rail diff omitted or duplicated an allowlisted path.");
  return entries.map(([, file]) => file).sort();
}
export function assertRailDiff(orchestrationDir = rootDir) {
  const head = git(orchestrationDir, ["rev-parse", "HEAD"]);
  const tree = git(orchestrationDir, ["rev-parse", "HEAD^{tree}"]);
  const mergeBase = git(orchestrationDir, ["merge-base", baseline.candidate.sha, head]);
  invariant(head !== baseline.candidate.sha && mergeBase === baseline.candidate.sha, "Rail HEAD must descend directly or transitively from the immutable candidate.");
  const entries = git(orchestrationDir, ["diff", "--name-status", `${baseline.candidate.sha}..${head}`]).split("\n").filter(Boolean).map((line) => line.split("\t"));
  return { head, tree, files: assertRailEntries(entries) };
}
export function normalizeNpmCiDrift(worktree) {
  const status = git(worktree, ["status", "--porcelain", "--untracked-files=no"]);
  if (!status) return "clean";
  invariant(status === "M package-lock.json", `npm ci dirtied unexpected tracked files: ${status}.`);
  const before = JSON.parse(runChecked("read committed package-lock", "git", ["show", "HEAD:package-lock.json"], { cwd: worktree }));
  const after = readJson(path.join(worktree, "package-lock.json"), "npm-ci package-lock");
  const beforeName = before.name; const afterName = after.name;
  delete before.name; delete after.name;
  invariant(beforeName && !afterName && canonicalJson(before) === canonicalJson(after), "package-lock drift was not the proven root-name-only npm ci normalization.");
  runChecked("restore proven package-lock drift", "git", ["restore", "--source=HEAD", "--", "package-lock.json"], { cwd: worktree });
  invariant(!git(worktree, ["status", "--porcelain", "--untracked-files=no"]), "Candidate did not return to a clean tracked state.");
  return "restored-root-name-only";
}
function assertContext(mode) {
  invariant(baseline.schema === "footballscience-leaderboard-production-code-release-baseline-v1", "Unexpected release baseline schema.");
  invariant(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "Release rail is workflow_dispatch-only.");
  invariant(process.env.GITHUB_REPOSITORY === baseline.repository.fullName, "Repository identity drifted.");
  invariant(process.env.GITHUB_REF === "refs/heads/main", "Release rail must run from main.");
  invariant(process.env.GITHUB_ACTOR === baseline.environments.reviewer && process.env.GITHUB_TRIGGERING_ACTOR === baseline.environments.reviewer, "Release actor identity drifted.");
  invariant(process.env.GITHUB_RUN_ATTEMPT === "1", "Release workflow reruns are forbidden.");
  invariant(process.env.GITHUB_REF_PROTECTED === "true", "Main was not protected when the release ran.");
  invariant(process.env.GITHUB_WORKFLOW_REF === `${baseline.repository.fullName}/.github/workflows/leaderboard-production-code-release.yml@refs/heads/main`, "Release workflow path/ref drifted.");
  const rail = assertRailDiff();
  invariant(process.env.GITHUB_WORKFLOW_SHA === rail.head, "Release workflow source SHA drifted.");
  invariant(process.env.GITHUB_SHA === rail.head && process.env.EXPECTED_ORCHESTRATION_SHA === rail.head, "Main/orchestration SHA binding failed.");
  invariant(git(rootDir, ["rev-parse", "origin/main"]) === rail.head, "origin/main drifted from orchestration HEAD.");
  const railStatus = git(rootDir, ["status", "--porcelain", "--untracked-files=normal"]).split("\n").filter((line) => line && line !== "?? .release-candidate/");
  invariant(railStatus.length === 0, `Orchestration checkout has unexpected dirty paths: ${railStatus.join(", ")}.`);
  const candidateSha = git(candidateDir(), ["rev-parse", "HEAD"]);
  const candidateTree = git(candidateDir(), ["rev-parse", "HEAD^{tree}"]);
  invariant(candidateSha === baseline.candidate.sha && candidateTree === baseline.candidate.tree, "Candidate checkout SHA/tree drifted.");
  invariant(!git(candidateDir(), ["status", "--porcelain", "--untracked-files=normal"]), "Candidate checkout must be fully clean.");
  invariant(git(rootDir, ["rev-parse", "origin/staging"]) === baseline.candidate.sha, "origin/staging must equal the immutable candidate SHA.");
  invariant(git(rootDir, ["rev-parse", "origin/staging^{tree}"]) === baseline.candidate.tree, "origin/staging tree must equal the immutable candidate tree.");
  invariant(readJson(path.join(candidateDir(), "vercel.json"), "candidate Vercel config").ignoreCommand === "node scripts/vercel-ignore-build.mjs", "Candidate Vercel ignoreCommand drifted.");
  const expectedConfirmation = `${baseline.confirmationPrefix}${rail.head}`;
  invariant(process.env.RELEASE_CONFIRMATION === expectedConfirmation, "Typed release confirmation was not exact for this orchestration SHA.");
  invariant(!process.env.RELEASE_SKIP_STAGING_TREE_CHECK && !process.env.RELEASE_ACK_EMERGENCY, "Release overrides are forbidden.");
  return { mode, rail, candidateSha, candidateTree, confirmation: expectedConfirmation };
}
function assertDbAttestation(now = Date.now()) {
  const observedAt = String(process.env.PRODUCTION_DB_OBSERVED_AT || "");
  assertFreshReleaseTimestamp(observedAt, 30 * 60_000, now, "Production DB reviewer attestation");
  const digest = databaseAttestationDigest(observedAt);
  invariant(process.env.PRODUCTION_DB_ATTESTATION_SHA256 === digest, "Human-reviewed external MCP DB attestation did not match the exact 48/V/catalog/rows0 baseline.");
  return { observedAt, digest, authority: "human-reviewed-external-mcp" };
}
function assertPlanFresh(value, now = Date.now()) { assertFreshReleaseTimestamp(value.createdAt, 45 * 60_000, now, "Release plan"); return value; }
function requireSecrets(secrets, mode) {
  const required = mode === "cleanup" ? ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"] : mode === "plan" ? ["GITHUB_TOKEN", "VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "LIVE_QA_USERNAME", "LIVE_QA_PASSWORD", "STAGING_QA_USERNAME", "STAGING_QA_PASSWORD"] : ["GITHUB_TOKEN", "VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "CRON_SECRET", "LIVE_QA_USERNAME", "LIVE_QA_PASSWORD", "STAGING_QA_USERNAME", "STAGING_QA_PASSWORD"];
  for (const name of required) invariant(secrets[name], `${name} is required inside the protected release step.`);
  invariant(secrets.VERCEL_ORG_ID === baseline.vercel.teamId && secrets.VERCEL_PROJECT_ID === baseline.vercel.projectId, "Vercel secret project binding drifted.");
}
function vercelUrl(pathname, teamId, params = {}) {
  const url = new URL(`https://api.vercel.com${pathname}`);
  url.searchParams.set("teamId", teamId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.href;
}
async function vercelDeployment(idOrHost, secrets) { return fetchJson(vercelUrl(`/v13/deployments/${encodeURIComponent(idOrHost)}`, secrets.VERCEL_ORG_ID), { token: secrets.VERCEL_TOKEN, label: `Vercel deployment ${idOrHost}` }); }
async function githubApi(pathname, token, label) { return fetchJson(`https://api.github.com/repos/${baseline.repository.fullName}${pathname}`, { token, label, headers: { "X-GitHub-Api-Version": "2026-03-10", Accept: "application/vnd.github+json" } }); }
export function selectPriorRailDeployments(deployments) {
  assertVercelDeploymentRecords(deployments, "Vercel deployment list");
  return deployments.filter((deployment) => deployment?.target === "production" && deployment.meta?.releaseLane === "leaderboard-safe-c1" && deployment.meta?.githubCommitSha === baseline.candidate.sha && deployment.meta?.candidateTree === baseline.candidate.tree);
}
export async function collectVercelDeploymentHistory(fetchPage) {
  const deployments = [];
  let until = null;
  for (let page = 0; page < 20; page += 1) {
    const params = { projectId: baseline.vercel.projectId, limit: 100, since: baseline.vercel.stagingDeployment.createdAt };
    if (until !== null) params.until = until;
    const payload = await fetchPage(params, page);
    invariant(Array.isArray(payload.deployments) && payload.pagination && Object.hasOwn(payload.pagination, "next"), "Vercel deployment history response was malformed.");
    assertVercelDeploymentRecords(payload.deployments, "Vercel deployment history page");
    deployments.push(...payload.deployments);
    const next = payload.pagination.next;
    if (next === null) return assertVercelDeploymentRecords(deployments, "Vercel deployment history");
    invariant(typeof next === "number" && Number.isSafeInteger(next) && next > 0 && (until === null || next < until), "Vercel deployment pagination cursor was malformed or did not advance.");
    until = next;
  }
  throw new Error("Vercel deployment history exceeded the fail-closed pagination bound.");
}
async function recentVercelDeployments(secrets) { return collectVercelDeploymentHistory((params) => fetchJson(vercelUrl("/v6/deployments", secrets.VERCEL_ORG_ID, params), { token: secrets.VERCEL_TOKEN, label: "durable Vercel release history" })); }
export function assertDeployment(deployment, expected, label) {
  invariant((deployment.id || deployment.uid) === expected.id, `${label} deployment id drifted.`);
  invariant((deployment.readyState || deployment.state) === "READY" && deployment.target === expected.target, `${label} readiness/target drifted.`);
  invariant((deployment.projectId || deployment.project?.id) === baseline.vercel.projectId && deployment.name === baseline.vercel.projectName, `${label} canonical project drifted.`);
  if (expected.sha) invariant(deployment.meta?.githubCommitSha === expected.sha, `${label} commit metadata drifted.`);
  if (expected.url) invariant(deployment.url === expected.url && Number(deployment.createdAt) === expected.createdAt, `${label} URL/creation time drifted.`);
  return deployment;
}
async function publicJson(host, pathname) {
  const url = new URL(pathname, `https://${host}`);
  url.searchParams.set("leaderboardRelease", Date.now());
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  invariant(response.ok, `${host}${pathname} returned ${response.status}.`);
  return payload;
}
async function assetProof(host, pathname, expectedBytes, expectedSha) {
  const url = new URL(pathname, `https://${host}`);
  url.searchParams.set("leaderboardRelease", Date.now());
  const { bytes } = await fetchBytes(url.href, { label: `${host}${pathname}` });
  invariant((expectedBytes === null || bytes.length === expectedBytes) && sha256(bytes) === expectedSha, `${host}${pathname} bytes/hash drifted.`);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}
export function inspectVercelRace(history, traffic, expectedMeta = null) {
  assertVercelDeploymentRecords(history, "Vercel deployment history"); assertVercelDeploymentRecords(traffic, "final Vercel release traffic");
  const deployments = [...new Map([...history, ...traffic].map((deployment) => [deployment.id || deployment.uid, deployment])).values()];
  const active = deployments.filter((deployment) => ["BUILDING", "QUEUED", "INITIALIZING"].includes(deployment.readyState || deployment.state));
  const prior = selectPriorRailDeployments(deployments);
  const exact = expectedMeta ? deployments.filter((deployment) => deployment.target === "production" && Object.entries(expectedMeta).every(([key, value]) => deployment.meta?.[key] === value)) : [];
  invariant(exact.length <= 1, "Multiple immutable current-run production deployments were observed.");
  return { active, prior, exact };
}
export async function captureVercelRace(loadHistory, loadTraffic, expectedMeta = null) { const history = await loadHistory(); const traffic = await loadTraffic(); return inspectVercelRace(history, traffic, expectedMeta); }
async function vercelRaceSnapshot(secrets, expectedMeta = null) {
  return captureVercelRace(() => recentVercelDeployments(secrets), async () => {
    const payload = await fetchJson(vercelUrl("/v6/deployments", secrets.VERCEL_ORG_ID, { projectId: baseline.vercel.projectId, limit: 100 }), { token: secrets.VERCEL_TOKEN, label: "final Vercel release traffic" });
    return payload.deployments;
  }, expectedMeta);
}
export async function assertVercelReleaseRace(secrets) {
  const { active, prior } = await vercelRaceSnapshot(secrets);
  invariant(active.length === 0, `Another Vercel deployment is active: ${active.map(({ id, readyState, state }) => `${id}/${readyState || state}`).join(", ")}.`);
  invariant(prior.length === 0, `A prior immutable Leaderboard production deployment already exists (${prior.map(({ id }) => id).join(",")}); recovery review is required and a new deploy is forbidden.`);
  return { active: 0, prior: 0 };
}
async function assertVercelState(secrets, expectedStagingId = process.env.EXPECTED_STAGING_DEPLOYMENT_ID) {
  invariant(expectedStagingId === baseline.vercel.stagingDeployment.id, "Expected staging deployment id must equal the immutable baseline deployment.");
  await assertVercelReleaseRace(secrets);
  const environment = await fetchJson(vercelUrl(`/v10/projects/${baseline.vercel.projectId}/env`, secrets.VERCEL_ORG_ID, { decrypt: "false" }), { token: secrets.VERCEL_TOKEN, label: "Vercel environment metadata" });
  invariant(Array.isArray(environment.envs) && !environment.envs.some(({ key }) => key === "ALLOW_VERCEL_GIT_PRODUCTION"), "Vercel production Git override exists or environment metadata was malformed.");
  const staging = assertDeployment(await vercelDeployment(expectedStagingId, secrets), { ...baseline.vercel.stagingDeployment, sha: baseline.candidate.sha }, "staging");
  invariant(staging.meta?.gitDirty === baseline.vercel.stagingDeployment.acceptedGitDirty && staging.meta?.githubCommitRef === baseline.vercel.stagingDeployment.githubCommitRef && staging.meta?.releaseLane === baseline.vercel.stagingDeployment.releaseLane, "Staging provenance evidence drifted.");
  const stagingAlias = await vercelDeployment(baseline.hosts.staging, secrets);
  invariant((stagingAlias.id || stagingAlias.uid) === expectedStagingId, "Staging alias no longer targets the reviewed deployment.");
  const stagingBranchAlias = await vercelDeployment(baseline.hosts.stagingBranch, secrets);
  invariant((stagingBranchAlias.id || stagingBranchAlias.uid) === expectedStagingId, "Staging branch alias no longer targets the reviewed deployment.");
  const config = await publicJson(baseline.hosts.staging, "/api/client-config");
  assertSupabaseUrl(config.url, baseline.supabase.stagingRef, baseline.supabase.productionRef);
  const stagingAssets = { app: await assetProof(baseline.hosts.staging, "/app.js", null, baseline.assets.appJsSha256), leaderboard: await assetProof(baseline.hosts.staging, baseline.assets.leaderboardModulePath, baseline.assets.leaderboardModuleBytes, baseline.assets.leaderboardModuleSha256) };
  const old = assertDeployment(await vercelDeployment(baseline.vercel.oldProductionDeployment.id, secrets), { id: baseline.vercel.oldProductionDeployment.id, target: "production", sha: baseline.vercel.oldProductionDeployment.gitCommitSha }, "old production");
  for (const host of [baseline.hosts.production, baseline.hosts.www]) { const live = await vercelDeployment(host, secrets); invariant((live.id || live.uid) === baseline.vercel.oldProductionDeployment.id, `${host} no longer points to the bound old deployment.`); }
  const liveConfig = await publicJson(baseline.hosts.production, "/api/client-config");
  assertSupabaseUrl(liveConfig.url, baseline.supabase.productionRef, baseline.supabase.stagingRef);
  const absent = await fetch(new URL(baseline.assets.leaderboardModulePath, `https://${baseline.hosts.production}`), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  invariant(absent.status === 404, "Old live deployment unexpectedly already serves the Leaderboard module.");
  invariant(Number(staging.createdAt) <= Date.parse(baseline.evidence.stagingSmoke.createdAt), "Reviewed staging deployment was created after its smoke run.");
  return { stagingDeploymentId: expectedStagingId, oldProductionDeploymentId: old.id || old.uid, stagingAssets };
}
export function releaseCommandEnvironment(kind, secrets) {
  const live = { LIVE_QA_BASE_URL: `https://${baseline.hosts.production}`, LIVE_QA_EXPECT_ADMIN: "1", LIVE_QA_REQUIRE_PEER_CHAT: "1", LIVE_QA_USERNAME: secrets.LIVE_QA_USERNAME, LIVE_QA_PASSWORD: secrets.LIVE_QA_PASSWORD, ...(secrets.LIVE_QA_PEER_USERNAME ? { LIVE_QA_PEER_USERNAME: secrets.LIVE_QA_PEER_USERNAME } : {}), ...(secrets.LIVE_QA_PEER_PASSWORD ? { LIVE_QA_PEER_PASSWORD: secrets.LIVE_QA_PEER_PASSWORD } : {}) };
  const refs = { SUPABASE_PROJECT_REF: baseline.supabase.productionRef, STAGING_SUPABASE_PROJECT_REF: baseline.supabase.stagingRef };
  const vercel = { VERCEL_TOKEN: secrets.VERCEL_TOKEN, VERCEL_ORG_ID: secrets.VERCEL_ORG_ID, VERCEL_PROJECT_ID: secrets.VERCEL_PROJECT_ID };
  const staging = { STAGING_QA_BASE_URL: `https://${baseline.hosts.staging}`, STAGING_QA_USERNAME: secrets.STAGING_QA_USERNAME, STAGING_QA_PASSWORD: secrets.STAGING_QA_PASSWORD };
  const present = "verified-present-by-protected-parent";
  const verifierPresence = { VERCEL_TOKEN: present, VERCEL_ORG_ID: present, VERCEL_PROJECT_ID: present, CRON_SECRET: present, LIVE_QA_USERNAME: present, LIVE_QA_PASSWORD: present, STAGING_QA_USERNAME: present, STAGING_QA_PASSWORD: present };
  const environments = {
    ci: { ...verifierPresence, ...refs, LIVE_QA_BASE_URL: live.LIVE_QA_BASE_URL, LIVE_QA_EXPECT_ADMIN: "1", LIVE_QA_REQUIRE_PEER_CHAT: "1", STAGING_QA_BASE_URL: staging.STAGING_QA_BASE_URL },
    safety: { ...refs, LIVE_QA_BASE_URL: live.LIVE_QA_BASE_URL, LIVE_QA_EXPECT_ADMIN: "1", LIVE_QA_REQUIRE_PEER_CHAT: "1", LIVE_QA_USERNAME: present, LIVE_QA_PASSWORD: present, STAGING_QA_BASE_URL: staging.STAGING_QA_BASE_URL, STAGING_QA_USERNAME: present, STAGING_QA_PASSWORD: present, GITHUB_REF_NAME: "main" },
    vercel,
    postdeploy: { LIVE_QA_BASE_URL: live.LIVE_QA_BASE_URL },
    live,
    "credential-live": { LIVE_QA_BASE_URL: live.LIVE_QA_BASE_URL, LIVE_QA_USERNAME: live.LIVE_QA_USERNAME, LIVE_QA_PASSWORD: live.LIVE_QA_PASSWORD, LEADERBOARD_CREDENTIAL_PROOF_ONLY: "1", LEADERBOARD_CREDENTIAL_PROOF_TARGET: "live", ...refs },
    "credential-staging": { LIVE_QA_BASE_URL: staging.STAGING_QA_BASE_URL, LIVE_QA_USERNAME: staging.STAGING_QA_USERNAME, LIVE_QA_PASSWORD: staging.STAGING_QA_PASSWORD, LEADERBOARD_CREDENTIAL_PROOF_ONLY: "1", LEADERBOARD_CREDENTIAL_PROOF_TARGET: "staging", ...refs },
    leaderboard: { LIVE_QA_BASE_URL: live.LIVE_QA_BASE_URL, LIVE_QA_USERNAME: live.LIVE_QA_USERNAME, LIVE_QA_PASSWORD: live.LIVE_QA_PASSWORD, ...refs },
  };
  invariant(environments[kind], `Unknown release child environment: ${kind}.`);
  return childEnvironment(environments[kind]);
}
export function assertPlanArtifact(value, expected) {
  invariant(value.schema === artifactSchema && value.repository === baseline.repository.fullName, "Plan artifact schema/repository drifted.");
  invariant(value.runId === String(process.env.GITHUB_RUN_ID) && value.runAttempt === String(process.env.GITHUB_RUN_ATTEMPT), "Plan artifact was not produced by this exact run/attempt.");
  invariant(value.orchestration.sha === expected.rail.head && value.candidate.sha === baseline.candidate.sha && value.candidate.tree === baseline.candidate.tree, "Plan artifact SHA/tree binding drifted.");
  const core = { ...value };
  delete core.planSha256;
  invariant(value.planSha256 === canonicalDigest(core), "Plan artifact canonical digest was tampered.");
  return value;
}
export function assertUploadedArtifactRecord(payload, expectedName, expectedDigest) {
  invariant(/^[0-9a-f]{64}$/.test(expectedDigest), "Same-run upload artifact digest output was missing or invalid.");
  invariant(payload.total_count === 1 && payload.artifacts?.length === 1, "Same-run release plan artifact identity was ambiguous.");
  const artifact = payload.artifacts[0];
  invariant(artifact.name === expectedName && artifact.expired === false && artifact.digest === `sha256:${expectedDigest}`, "Same-run release plan artifact name/state/digest drifted.");
  return { id: Number(artifact.id), digest: artifact.digest };
}
async function assertUploadedArtifact(token) {
  const name = `leaderboard-production-plan-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  const payload = await githubApi(`/actions/runs/${process.env.GITHUB_RUN_ID}/artifacts?name=${encodeURIComponent(name)}&per_page=100`, token, "same-run release plan artifact");
  return assertUploadedArtifactRecord(payload, name, String(process.env.EXPECTED_UPLOAD_DIGEST || ""));
}
async function plan(secrets) {
  const context = assertContext("plan");
  const db = assertDbAttestation();
  const github = await assertGithubEvidence(secrets.GITHUB_TOKEN);
  const vercel = await assertVercelState(secrets);
  for (const target of ["live", "staging"]) {
    runChecked(`read-only ${target} credential health proof`, process.execPath, [fileURLToPath(import.meta.url), "--mode", "credential-proof"], { cwd: rootDir, env: releaseCommandEnvironment(`credential-${target}`, secrets), secrets, timeoutMs: 2 * 60_000, print: true });
  }
  const core = {
    schema: artifactSchema,
    repository: baseline.repository.fullName,
    runId: String(process.env.GITHUB_RUN_ID),
    runAttempt: String(process.env.GITHUB_RUN_ATTEMPT),
    createdAt: new Date().toISOString(),
    orchestration: { sha: context.rail.head, tree: context.rail.tree, files: context.rail.files },
    candidate: { sha: baseline.candidate.sha, tree: baseline.candidate.tree },
    db,
    github,
    vercel,
    externalGates: { environmentSecretCount: baseline.environments.requiredExternalSecretCount, environmentSecretMetadata: "human-reviewed-before-dispatch" },
    credentialProof: { hosts: [baseline.hosts.production, baseline.hosts.staging], mode: "authenticated-read-only-app-data", livePlatformAdmin: true },
    expectedCommands: { executable: "integrity-locked absolute vercel@53.2.0 entry", pull: "pull production", build: "build --prod", deploy: "deploy --prebuilt --prod exactly once" },
  };
  const artifact = { ...core, planSha256: canonicalDigest(core) };
  assertNoSecretLeak(artifact, secrets);
  const artifactPath = assertArtifactPath(process.env.PLAN_ARTIFACT_PATH, process.env.RUNNER_TEMP);
  const written = writeArtifact(artifactPath, artifact);
  appendGithubOutput({ artifact_sha256: written.sha256, plan_sha256: artifact.planSha256, artifact_path: artifactPath });
  console.log(`Leaderboard production plan: ok (${artifact.planSha256}).`);
}
export function assertVercelLock(lock) {
  const root = lock.packages?.[""];
  const cli = lock.packages?.["node_modules/vercel"];
  invariant(root?.dependencies?.vercel === baseline.vercel.cliVersion && cli?.version === baseline.vercel.cliVersion && cli?.integrity === baseline.vercel.cliIntegrity, "Vercel lock root/package drifted.");
  invariant(Object.entries(lock.packages || {}).filter(([name]) => name).every(([, value]) => value.integrity || value.link), "Vercel transitive lock contained a package without SRI.");
  return true;
}
function assertVercelTooling() {
  const lockPath = path.join(cliToolDir, "package-lock.json");
  invariant(sha256(fs.readFileSync(lockPath)) === baseline.vercel.cliLockSha256, "Vercel CLI lockfile SHA256 drifted.");
  assertVercelLock(readJson(lockPath, "Vercel CLI lockfile"));
  invariant(sha256(fs.readFileSync(cliEntry)) === baseline.vercel.cliEntrySha256 && sha256(fs.readFileSync(path.join(cliToolDir, "node_modules/vercel/dist/index.js"))) === baseline.vercel.cliBundleSha256, "Installed Vercel CLI executable bytes drifted.");
  const version = runChecked("locked Vercel CLI version", process.execPath, [cliEntry, "--version"], { env: childEnvironment() }).trim();
  invariant(version === baseline.vercel.cliVersion, "Installed Vercel CLI version drifted.");
  return cliEntry;
}
function scanProductionOutput() {
  const outputDir = path.join(candidateDir(), ".vercel/output");
  invariant(fs.existsSync(path.join(outputDir, "config.json")), "Vercel production build output is missing config.json.");
  const pulled = readDotenv(path.join(candidateDir(), ".vercel/.env.production.local"));
  invariant(pulled.VERCEL_ENV === "production" && pulled.VERCEL_TARGET_ENV === "production", "Vercel pull did not select the production target.");
  invariant(pulled.SUPABASE_PROJECT_REF === baseline.supabase.productionRef, "Pulled production project ref was not bust.");
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) assertSupabaseUrl(pulled[key], baseline.supabase.productionRef, baseline.supabase.stagingRef);
  assertOnlyMirroredOccurrences(outputDir, candidateDir(), baseline.supabase.stagingRef, [
    "static/docs/CHAT_STABILIZATION_RELEASE_PACKET.md",
    "static/scripts/leaderboard-staging-baseline.json",
    "static/scripts/leaderboard-staging-database-release.mjs",
  ]);
}
async function resolveSingleDeployment(secrets, startedAt, expectedMeta) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const payload = await fetchJson(vercelUrl("/v6/deployments", secrets.VERCEL_ORG_ID, { projectId: baseline.vercel.projectId, target: "production", limit: 30, since: startedAt - 5_000 }), { token: secrets.VERCEL_TOKEN, label: "resolve production deployment" });
    const matches = selectDeploymentMatches(payload.deployments || [], startedAt, expectedMeta);
    if (matches.length === 1) return matches[0];
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("No uniquely matching production deployment appeared; deploy outcome is ambiguous and must not be retried.");
}
export function selectDeploymentMatches(deployments, startedAt, expectedMeta) {
  assertVercelDeploymentRecords(deployments, "Vercel deployment resolution list");
  const matches = deployments.filter((deployment) => {
    const meta = deployment.meta || {};
    const createdAt = Number(deployment.createdAt || deployment.created || deployment.ready || 0);
    return createdAt >= startedAt - 5_000 && Object.entries(expectedMeta).every(([key, value]) => meta[key] === value);
  });
  invariant(matches.length <= 1, "Multiple matching production deployments made deploy outcome ambiguous.");
  return matches;
}
export function releaseDeploymentMeta(orchestrationSha = process.env.EXPECTED_ORCHESTRATION_SHA) {
  return { githubCommitSha: baseline.candidate.sha, githubCommitRef: "main", gitDirty: "0", releaseLane: "leaderboard-safe-c1", orchestrationSha, candidateTree: baseline.candidate.tree, githubRunId: String(process.env.GITHUB_RUN_ID), githubRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT), planArtifactSha256: String(process.env.EXPECTED_ARTIFACT_SHA256) };
}
async function waitReady(secrets, id) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const deployment = await vercelDeployment(id, secrets);
    const state = deployment.readyState || deployment.state;
    invariant(!["ERROR", "CANCELED"].includes(state), `Production deployment entered ${state}.`);
    if (state === "READY") return deployment;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Production deployment did not become READY in five minutes.");
}
export async function settleCleanupThenRepair(loadSnapshot, repair, expectedMeta, options = {}) {
  const now = options.now || Date.now; const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))); const horizonMs = options.horizonMs || 90 * 60_000; const startedAt = now(); let sawExact = false;
  while (true) {
    const state = await loadSnapshot(expectedMeta); if (state.exact.length) sawExact = true;
    const elapsed = now() - startedAt;
    if (state.active.length === 0 && (sawExact || elapsed >= horizonMs)) { await repair(); return { sawExact, elapsed }; }
    invariant(elapsed < horizonMs, "Cleanup horizon expired before every project deployment was terminal; aliases were not repaired early.");
    await sleep(options.pollMs || 5_000);
  }
}
export function assertResolvedDeploymentIdentity(deployment, expectedMeta) {
  const id = deployment?.id || deployment?.uid || "";
  invariant(/^dpl_[A-Za-z0-9]+$/.test(id), "Resolved production deployment id was invalid.");
  invariant(deployment.target === "production" && (deployment.projectId || deployment.project?.id) === baseline.vercel.projectId && deployment.name === baseline.vercel.projectName, "Resolved production deployment target/project drifted.");
  invariant(Object.entries(expectedMeta).every(([key, value]) => deployment.meta?.[key] === value), "Resolved production deployment metadata drifted.");
  return id;
}
async function stagingIsolationState(secrets, expectedId) {
  const staging = await vercelDeployment(baseline.hosts.staging, secrets);
  const branch = await vercelDeployment(baseline.hosts.stagingBranch, secrets);
  const idsMatch = (staging.id || staging.uid) === expectedId && (branch.id || branch.uid) === expectedId;
  if (!idsMatch) return { ok: false, idsMatch: false };
  const config = await publicJson(baseline.hosts.staging, "/api/client-config");
  try { assertSupabaseUrl(config.url, baseline.supabase.stagingRef, baseline.supabase.productionRef); } catch { return { ok: false, idsMatch: true }; }
  return { ok: true, idsMatch: true, deploymentId: expectedId, ref: baseline.supabase.stagingRef };
}
async function repairStagingIsolation(secrets, expectedId) {
  let state = await stagingIsolationState(secrets, expectedId);
  const aliasResults = [];
  if (!state.ok) for (const host of [baseline.hosts.staging, baseline.hosts.stagingBranch]) aliasResults.push(runCaptured(`state-driven staging alias repair ${host}`, process.execPath, [cliEntry, "alias", "set", baseline.vercel.stagingDeployment.url, host], { cwd: candidateDir(), env: releaseCommandEnvironment("vercel", secrets), secrets, timeoutMs: 5 * 60_000 }));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    state = await stagingIsolationState(secrets, expectedId);
    if (state.ok) return state;
    if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Staging isolation did not converge after the state-driven repair (alias statuses ${aliasResults.map(({ status }) => status ?? "unknown").join(",") || "not-run"}).`);
}
async function verifyNewLive(secrets, deploymentId, expectedMeta, readyDeployment = null) {
  const deployment = assertDeployment(readyDeployment || await waitReady(secrets, deploymentId), { id: deploymentId, target: "production", sha: baseline.candidate.sha }, "new production");
  invariant(Object.entries(expectedMeta).every(([key, value]) => deployment.meta?.[key] === value) && deployment.meta?.gitDirty === "0", "New production provenance metadata drifted.");
  for (const host of [baseline.hosts.production, baseline.hosts.www]) {
    const alias = await vercelDeployment(host, secrets);
    invariant((alias.id || alias.uid) === deploymentId, `${host} did not converge on the new deployment.`);
  }
  const config = await publicJson(baseline.hosts.production, "/api/client-config");
  assertSupabaseUrl(config.url, baseline.supabase.productionRef, baseline.supabase.stagingRef);
  await assetProof(baseline.hosts.production, "/app.js", null, baseline.assets.appJsSha256);
  await assetProof(baseline.hosts.production, "/app-runtime.js", null, baseline.assets.appRuntimeSha256);
  await assetProof(baseline.hosts.production, "/src/modules/platform/navigation-controller.mjs", null, baseline.assets.navigationControllerSha256);
  await assetProof(baseline.hosts.production, baseline.assets.leaderboardModulePath, baseline.assets.leaderboardModuleBytes, baseline.assets.leaderboardModuleSha256);
  return deployment;
}
async function apply(secrets) {
  const context = assertContext("apply");
  const db = assertDbAttestation();
  const artifactPath = assertArtifactPath(process.env.PLAN_ARTIFACT_PATH, process.env.RUNNER_TEMP);
  const { value } = readArtifact(artifactPath, process.env.EXPECTED_ARTIFACT_SHA256);
  assertPlanArtifact(value, context);
  assertPlanFresh(value);
  await assertUploadedArtifact(secrets.GITHUB_TOKEN);
  invariant(value.db.digest === db.digest, "Plan DB attestation digest drifted before apply.");
  const initialGithub = await assertGithubEvidence(secrets.GITHUB_TOKEN);
  invariant(value.github.freezes.digest === initialGithub.freezes.digest, "Plan freeze attestation drifted before apply.");
  await assertVercelState(secrets, value.vercel.stagingDeploymentId);
  runChecked("release CI environment", "npm", ["run", "release:ci-env"], { cwd: candidateDir(), env: releaseCommandEnvironment("ci", secrets), secrets, print: true });
  runChecked("release preflight", "npm", ["run", "release:preflight"], { cwd: candidateDir(), env: childEnvironment({ GITHUB_REF_NAME: "main" }), print: true });
  runChecked("release safety", "npm", ["run", "release:safety"], { cwd: candidateDir(), env: releaseCommandEnvironment("safety", secrets), secrets, print: true });
  const vercelEnv = releaseCommandEnvironment("vercel", secrets);
  runChecked("Vercel token gate", "npm", ["run", "release:vercel-token"], { cwd: candidateDir(), env: vercelEnv, secrets, print: true });
  assertVercelTooling();
  const secretFiles = [path.join(candidateDir(), ".vercel/.env.production.local"), path.join(candidateDir(), ".vercel/.env.production")];
  let deploymentId = "";
  let deploymentUrl = "";
  let deployIssued = false;
  let releaseError = null;
  let repairError = null;
  try {
    fs.mkdirSync(path.join(candidateDir(), ".vercel"), { recursive: true, mode: 0o700 });
    runChecked("Vercel production pull", process.execPath, [cliEntry, "pull", "--yes", "--environment=production"], { cwd: candidateDir(), env: vercelEnv, secrets, timeoutMs: 5 * 60_000, print: true });
    const project = readJson(path.join(candidateDir(), ".vercel/project.json"), "Vercel project link");
    invariant(project.orgId === baseline.vercel.teamId && project.projectId === baseline.vercel.projectId, "Pulled Vercel link was not the canonical project.");
    fs.chmodSync(path.join(candidateDir(), ".vercel"), 0o700);
    for (const file of secretFiles.filter(fs.existsSync)) fs.chmodSync(file, 0o600);
    runChecked("Vercel production build", process.execPath, [cliEntry, "build", "--prod"], { cwd: candidateDir(), env: vercelEnv, secrets, timeoutMs: 20 * 60_000, print: true });
    invariant(!git(candidateDir(), ["status", "--porcelain", "--untracked-files=normal"]), "Production build dirtied candidate files.");
    scanProductionOutput();
    for (const file of secretFiles.filter(fs.existsSync)) fs.rmSync(file);
    const predeployGithub = await assertGithubEvidence(secrets.GITHUB_TOKEN);
    invariant(predeployGithub.freezes.digest === value.github.freezes.digest, "Freeze attestation drifted immediately before deploy.");
    await assertVercelState(secrets, value.vercel.stagingDeploymentId);
    const finalGithub = await assertGithubRace(secrets.GITHUB_TOKEN);
    invariant(finalGithub.freezes.digest === value.github.freezes.digest, "Freeze attestation drifted at the final race gate.");
    await assertVercelReleaseRace(secrets);
    const finalNow = Date.now();
    const predeployDb = assertDbAttestation(finalNow);
    invariant(predeployDb.digest === value.db.digest, "Production DB attestation drifted immediately before deploy.");
    assertReleaseEvidenceWindow(value, predeployDb, finalGithub.freezes, finalNow);
    const startedAt = finalNow;
    const deployMeta = releaseDeploymentMeta(context.rail.head);
    const deployArgs = [cliEntry, "deploy", "--prebuilt", "--prod", ...Object.entries(deployMeta).flatMap(([key, value]) => ["--meta", `${key}=${value}`])];
    deployIssued = true;
    const result = runCaptured("single production deploy", process.execPath, deployArgs, { cwd: candidateDir(), env: vercelEnv, secrets, timeoutMs: 20 * 60_000 });
    const resolved = await resolveSingleDeployment(secrets, startedAt, deployMeta);
    deploymentId = assertResolvedDeploymentIdentity(resolved, deployMeta);
    appendGithubOutput({ deployment_id: deploymentId });
    console.log(`Resolved immutable production deployment: ${deploymentId}.`);
    if (result.status !== 0) console.warn("Vercel CLI result was non-success; the single deployment was resolved by immutable metadata without retry.");
    await repairStagingIsolation(secrets, value.vercel.stagingDeploymentId);
    const ready = assertDeployment(await waitReady(secrets, deploymentId), { id: deploymentId, target: "production", sha: baseline.candidate.sha }, "new production");
    assertResolvedDeploymentIdentity(ready, deployMeta);
    await repairStagingIsolation(secrets, value.vercel.stagingDeploymentId);
    runChecked("verify staging isolation", "npm", ["run", "release:staging-isolation"], { cwd: candidateDir(), env: childEnvironment(), timeoutMs: 5 * 60_000, print: true });
    await verifyNewLive(secrets, deploymentId, deployMeta, ready);
    runChecked("production postdeploy", "npm", ["run", "release:postdeploy"], { cwd: candidateDir(), env: releaseCommandEnvironment("postdeploy", secrets), timeoutMs: 5 * 60_000, print: true });
    runChecked("generic authenticated live smoke", "npm", ["run", "qa:live:required"], { cwd: candidateDir(), env: releaseCommandEnvironment("live", secrets), secrets, timeoutMs: 20 * 60_000, print: true });
    runChecked("read-only Leaderboard live smoke", "npm", ["run", "qa:live:leaderboard:readonly"], { cwd: rootDir, env: releaseCommandEnvironment("leaderboard", secrets), secrets, timeoutMs: 5 * 60_000, print: true });
    await verifyNewLive(secrets, deploymentId, deployMeta);
    deploymentUrl = `https://${(await vercelDeployment(deploymentId, secrets)).url}`;
  } catch (error) {
    releaseError = error;
  } finally {
    if (deployIssued) {
      try { await repairStagingIsolation(secrets, value.vercel.stagingDeploymentId); }
      catch (error) { repairError = error; }
    }
    for (const file of secretFiles.filter(fs.existsSync)) fs.rmSync(file);
  }
  if (releaseError || repairError) throw new Error([releaseError ? `Release failure: ${releaseError.message}` : "", repairError ? `Mandatory staging repair failure: ${repairError.message}` : ""].filter(Boolean).join("\n"));
  appendGithubOutput({ deployment_url: deploymentUrl });
  console.log(`Leaderboard production code release: ok (${deploymentId}).`);
}
async function cleanup(secrets) {
  const context = assertContext("cleanup");
  invariant(process.env.RELEASE_AUTHORIZED === "true" && ["success", "failure", "cancelled"].includes(process.env.APPLY_RESULT), "Cleanup was not transitively authorized by the protected apply job.");
  assertVercelTooling();
  const expectedMeta = releaseDeploymentMeta(context.rail.head);
  const settled = await settleCleanupThenRepair((meta) => vercelRaceSnapshot(secrets, meta), () => repairStagingIsolation(secrets, baseline.vercel.stagingDeployment.id), expectedMeta);
  console.log(`Cleanup quiescence observed (current-run deployment ${settled.sawExact ? "found" : "absent for full horizon"}).`);
  console.log("Independent post-apply staging isolation cleanup: ok.");
}
async function main() {
  const mode = process.argv[process.argv.indexOf("--mode") + 1] || "";
  if (mode === "normalize") {
    console.log(`npm ci normalization: ${normalizeNpmCiDrift(path.resolve(process.env.TARGET_DIR || rootDir))}.`);
    return;
  }
  if (mode === "tooling") {
    assertVercelTooling();
    console.log("Integrity-locked Vercel CLI: ok.");
    return;
  }
  const secrets = captureSecrets(process.env);
  processSecrets = secrets;
  if (mode === "credential-proof") {
    invariant(secrets.LIVE_QA_USERNAME && secrets.LIVE_QA_PASSWORD, "Credential proof requires one isolated username/password pair.");
    const proof = await assertCredentialHealth({ target: process.env.LEADERBOARD_CREDENTIAL_PROOF_TARGET, baseUrl: process.env.LIVE_QA_BASE_URL, username: secrets.LIVE_QA_USERNAME, password: secrets.LIVE_QA_PASSWORD });
    console.log(`Read-only ${proof.target} credential health: ok (${proof.host}).`);
    return;
  }
  if (mode === "environment-preflight") {
    invariant(secrets.GITHUB_TOKEN, "GITHUB_TOKEN is required for environment preflight.");
    await assertReleaseEnvironments(secrets.GITHUB_TOKEN);
    console.log("Protected release environments: ok.");
    return;
  }
  invariant(["plan", "apply", "cleanup"].includes(mode), "Usage: --mode environment-preflight|tooling|plan|apply|cleanup|normalize");
  requireSecrets(secrets, mode);
  if (mode === "plan") await plan(secrets); else if (mode === "apply") await apply(secrets); else await cleanup(secrets);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(redact(`Leaderboard production ${process.argv.at(-1)} failed: ${error.message}`, processSecrets));
    process.exitCode = 1;
  });
}
