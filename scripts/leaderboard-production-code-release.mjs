import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendGithubOutput, assertArtifactPath, assertNoSecretLeak, assertSupabaseUrl, canonicalDigest, canonicalJson, captureSecrets, childEnvironment, fetchBytes, fetchJson, git, invariant, readArtifact, readJson, redact, runChecked, sha256, writeArtifact } from "./lib/leaderboard-production-release-security.mjs";
import { assertCredentialHealth, assertFreezeFresh, assertGithubEvidence, assertGithubRace, assertReleaseEnvironments } from "./lib/leaderboard-production-release-evidence.mjs";
import { assertSourceManifest, buildSourceManifest } from "./lib/leaderboard-production-source-manifest.mjs";
import { assertDeploymentFileTree, assertSourceRequestFiles, uploadSourceFiles, verifyDeploymentFileContents } from "./lib/leaderboard-production-vercel-files.mjs";
import { buildPreviewCreateBody, collectDeploymentPages, previewAttemptMeta, resolveAmbiguousCreate, selectDeploymentCandidates } from "./lib/leaderboard-production-vercel-deployments.mjs";
import { aliasSnapshot, assertAliasBaseline, assertAliasesUnchanged, assertPreviewDeployment, assertPreviewSupabaseRef, assertVercelProject, deploymentCreatedAt, deploymentId, deploymentProjectId, deploymentState } from "./lib/leaderboard-production-vercel-state.mjs";
import { VERCEL_API_ORIGIN, VercelRequestError, assertNoProxyEnvironment, vercelRequest } from "./lib/leaderboard-production-vercel-transport.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = readJson(path.join(rootDir, "scripts/leaderboard-production-release-baseline.json"), "release baseline");
const artifactSchema = "footballscience-leaderboard-files-preview-plan-v1";
const dbAttestationSchema = "footballscience-leaderboard-production-db-attestation-v1";
const artifactPlaceholder = "0".repeat(64);
let processSecrets = {};

export function databaseAttestationDigest(observedAt) { return canonicalDigest({ schema: dbAttestationSchema, observedAt, supabase: baseline.supabase }); }
export function assertFreshReleaseTimestamp(value, maxAgeMs, now = Date.now(), label = "Release evidence") {
  const timestamp = Date.parse(value);
  invariant(Number.isFinite(timestamp) && now - timestamp <= maxAgeMs && timestamp - now <= 120_000, `${label} is stale or from the future.`);
  return timestamp;
}
export function assertReleaseEvidenceWindow(plan, db, freezes, now = Date.now()) {
  assertFreshReleaseTimestamp(plan?.createdAt, 45 * 60_000, now, "Preview plan");
  assertFreshReleaseTimestamp(db?.observedAt, 30 * 60_000, now, "Production DB reviewer attestation");
  assertFreezeFresh(freezes, now);
  return true;
}
export function assertRailEntries(entries, allowedPaths = baseline.allowedRailPaths) {
  invariant(entries.length === allowedPaths.length, "Rail diff must contain the exact allowlisted file count.");
  const allowed = new Set(allowedPaths);
  for (const [status, file] of entries) {
    invariant(status === "A" || (status === "M" && file === "package.json"), `Rail diff status is forbidden: ${status} ${file}.`);
    invariant(allowed.has(file), `Rail diff escaped the infra/QA allowlist: ${file}.`);
  }
  invariant(new Set(entries.map(([, file]) => file)).size === allowed.size, "Rail diff omitted or duplicated an allowlisted path.");
  return entries.map(([, file]) => file).sort();
}
export function assertRailDiff(orchestrationDir = rootDir) {
  const head = git(orchestrationDir, ["rev-parse", "HEAD"]); const tree = git(orchestrationDir, ["rev-parse", "HEAD^{tree}"]);
  invariant(head !== baseline.candidate.sha && git(orchestrationDir, ["merge-base", baseline.candidate.sha, head]) === baseline.candidate.sha, "Rail HEAD must descend from the immutable candidate.");
  const entries = git(orchestrationDir, ["diff", "--name-status", `${baseline.candidate.sha}..${head}`]).split("\n").filter(Boolean).map((line) => line.split("\t"));
  return { head, tree, files: assertRailEntries(entries) };
}
export function normalizeNpmCiDrift(worktree) {
  const status = git(worktree, ["status", "--porcelain", "--untracked-files=no"]);
  if (!status) return "clean";
  invariant(status === "M package-lock.json", `npm ci dirtied unexpected tracked files: ${status}.`);
  const before = JSON.parse(runChecked("read committed package-lock", "git", ["show", "HEAD:package-lock.json"], { cwd: worktree }));
  const after = readJson(path.join(worktree, "package-lock.json"), "npm-ci package-lock");
  const beforeName = before.name; const afterName = after.name; delete before.name; delete after.name;
  invariant(beforeName && !afterName && canonicalJson(before) === canonicalJson(after), "package-lock drift was not the proven root-name-only npm ci normalization.");
  runChecked("restore proven package-lock drift", "git", ["restore", "--source=HEAD", "--", "package-lock.json"], { cwd: worktree });
  invariant(!git(worktree, ["status", "--porcelain", "--untracked-files=no"]), "Rail did not return to a clean tracked state.");
  return "restored-root-name-only";
}

function assertContext(mode) {
  invariant(baseline.schema === "footballscience-leaderboard-production-code-release-baseline-v1", "Unexpected release baseline schema.");
  invariant(baseline.vercel.filesApi.origin === VERCEL_API_ORIGIN && baseline.vercel.filesApi.preview.createTarget === null && baseline.vercel.filesApi.production.enabled === false && baseline.vercel.filesApi.preview.supabaseRef === baseline.supabase.stagingRef, "Files preview rail origin/target/production/ref policy drifted.");
  invariant(process.env.GITHUB_EVENT_NAME === "workflow_dispatch" && process.env.GITHUB_REPOSITORY === baseline.repository.fullName && process.env.GITHUB_REF === "refs/heads/main", "Workflow dispatch repository/ref identity drifted.");
  invariant(process.env.GITHUB_ACTOR === baseline.environments.reviewer && process.env.GITHUB_TRIGGERING_ACTOR === baseline.environments.reviewer && process.env.GITHUB_RUN_ATTEMPT === "1", "Preview actor/attempt identity drifted.");
  invariant(process.env.GITHUB_REF_PROTECTED === "true" && process.env.GITHUB_WORKFLOW_REF === `${baseline.repository.fullName}/.github/workflows/leaderboard-production-code-release.yml@refs/heads/main`, "Preview workflow protection/path drifted.");
  const rail = assertRailDiff();
  invariant(process.env.GITHUB_WORKFLOW_SHA === rail.head && process.env.GITHUB_SHA === rail.head && process.env.EXPECTED_ORCHESTRATION_SHA === rail.head, "Main/orchestration SHA binding failed.");
  invariant(git(rootDir, ["rev-parse", "origin/main"]) === rail.head && git(rootDir, ["rev-parse", "origin/staging"]) === baseline.candidate.sha && git(rootDir, ["rev-parse", "origin/staging^{tree}"]) === baseline.candidate.tree, "Remote main/staging binding drifted.");
  invariant(!git(rootDir, ["status", "--porcelain", "--untracked-files=normal"]), "Orchestration checkout must be fully clean.");
  invariant(process.env.RELEASE_CONFIRMATION === `${baseline.confirmationPrefix}${rail.head}` && !process.env.RELEASE_SKIP_STAGING_TREE_CHECK && !process.env.RELEASE_ACK_EMERGENCY, "Typed confirmation or override policy drifted.");
  return { mode, rail };
}
function assertDbAttestation(now = Date.now()) {
  const observedAt = String(process.env.PRODUCTION_DB_OBSERVED_AT || "");
  assertFreshReleaseTimestamp(observedAt, 30 * 60_000, now, "Production DB reviewer attestation");
  const digest = databaseAttestationDigest(observedAt);
  invariant(process.env.PRODUCTION_DB_ATTESTATION_SHA256 === digest, "External MCP DB attestation did not match exact 48/V/catalog/rows0.");
  return { observedAt, digest, authority: "human-reviewed-external-mcp" };
}
function requireSecrets(secrets, mode) {
  const required = mode === "environment-preflight" ? ["GITHUB_TOKEN"] : ["GITHUB_TOKEN", "VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "LIVE_QA_USERNAME", "LIVE_QA_PASSWORD", "STAGING_QA_USERNAME", "STAGING_QA_PASSWORD"];
  for (const name of required) invariant(secrets[name], `${name} is required inside the protected ${mode} step.`);
  if (mode !== "environment-preflight") invariant(secrets.VERCEL_ORG_ID === baseline.vercel.teamId && secrets.VERCEL_PROJECT_ID === baseline.vercel.projectId, "Vercel secret project binding drifted.");
}

function vercelApi(secrets, fetchImpl = fetch) {
  const query = (extra = {}) => ({ teamId: baseline.vercel.teamId, ...extra });
  const call = (options) => vercelRequest({ token: secrets.VERCEL_TOKEN, fetchImpl, ...options });
  return {
    project: async () => (await call({ pathname: `/v9/projects/${baseline.vercel.projectId}`, query: query(), expectedStatus: 200, label: "Vercel project" })).payload,
    environment: async () => (await call({ pathname: `/v10/projects/${baseline.vercel.projectId}/env`, query: query({ decrypt: "false" }), expectedStatus: 200, label: "Vercel environment metadata" })).payload,
    deployment: async (idOrHost) => (await call({ pathname: `/v13/deployments/${encodeURIComponent(idOrHost)}`, query: query(), expectedStatus: 200, label: "Vercel deployment" })).payload,
    list: async ({ until = null, since = baseline.vercel.stagingDeployment.createdAt, limit = 100 } = {}) => (await call({ pathname: "/v6/deployments", query: query({ projectId: baseline.vercel.projectId, since, limit, ...(until === null ? {} : { until }) }), expectedStatus: 200, label: "Vercel deployment list" })).payload,
    upload: async ({ row, bytes }) => {
      invariant(row && Buffer.isBuffer(bytes) && bytes.length === row.size && crypto.createHash("sha1").update(bytes).digest("hex") === row.sha, "Vercel upload row/body digest or size drifted.");
      return call({ pathname: "/v2/files", query: query(), method: "POST", bytes, headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length), "x-vercel-digest": row.sha }, expectedStatus: 200, label: "Vercel file upload" });
    },
    createPreview: async (body) => call({ pathname: "/v13/deployments", query: query(), method: "POST", json: body, expectedStatus: 200, label: "single Vercel preview create" }),
    files: async (id) => (await call({ pathname: `/v6/deployments/${encodeURIComponent(id)}/files`, query: query(), expectedStatus: 200, jsonShape: "any", label: "Vercel deployment files" })).payload,
    content: async (id, file, expected, maxBytes) => {
      invariant(expected && Number.isSafeInteger(expected.size) && maxBytes > expected.size, "Frozen deployment-content bound was missing.");
      return call({ pathname: `/v8/deployments/${encodeURIComponent(id)}/files/${encodeURIComponent(file.uid)}`, query: query(), expectedStatus: 200, responseType: "bytes", maxBytes, label: "Vercel deployment file content" });
    },
    events: async (id) => (await call({ pathname: `/v3/deployments/${encodeURIComponent(id)}/events`, query: query({ direction: "backward", follow: 0, limit: 100 }), expectedStatus: 200, jsonShape: "any", label: "Vercel deployment events" })).payload,
    cancel: async (id) => call({ pathname: `/v12/deployments/${encodeURIComponent(id)}/cancel`, query: query(), method: "PATCH", json: {}, expectedStatus: 200, label: "single Vercel preview cancel" }),
  };
}
function assertDeploymentHistory(records) {
  invariant(Array.isArray(records), "Vercel deployment history was malformed.");
  const ids = new Set();
  for (const record of records) {
    const id = deploymentId(record); const state = deploymentState(record); deploymentCreatedAt(record);
    invariant(!ids.has(id) && ["BUILDING", "CANCELED", "ERROR", "INITIALIZING", "QUEUED", "READY"].includes(state), "Vercel deployment history id/state drifted.");
    invariant(deploymentProjectId(record) === baseline.vercel.projectId && record.teamId === baseline.vercel.teamId && record.name === baseline.vercel.projectName && Object.hasOwn(record, "target") && [null, "production"].includes(record.target), "Vercel deployment history project/team/target drifted.");
    invariant(record.meta && typeof record.meta === "object" && !Array.isArray(record.meta), "Vercel deployment history metadata was malformed."); ids.add(id);
  }
  return records;
}
async function allDeployments(api) { return assertDeploymentHistory(await collectDeploymentPages(({ until }) => api.list({ until }))); }
function priorPreviewDeployments(records) {
  invariant(Array.isArray(records), "Vercel deployment history was malformed.");
  return records.filter((record) => record?.meta?.releaseLane === baseline.vercel.filesApi.preview.releaseLane && record.meta?.candidateSha === baseline.candidate.sha && record.meta?.candidateTree === baseline.candidate.tree);
}
function activeDeployments(records) { return records.filter((record) => ["BUILDING", "QUEUED", "INITIALIZING"].includes(record?.readyState || record?.state)); }
async function loadAliases(api) {
  const records = {};
  for (const host of [baseline.hosts.production, baseline.hosts.www, baseline.hosts.staging, baseline.hosts.stagingBranch]) records[host] = await api.deployment(host);
  return assertAliasBaseline(aliasSnapshot(records, baseline), baseline);
}
async function publicJson(host, pathname) {
  const url = new URL(pathname, `https://${host}`); url.searchParams.set("leaderboardFilesProof", Date.now());
  let response;
  try { response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) }); } catch { throw new Error("Reviewed public JSON request failed."); }
  invariant(response.ok && new URL(response.url).origin === `https://${host}` && /^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || ""), "Reviewed public JSON response drifted.");
  const text = await response.text(); invariant(Buffer.byteLength(text) <= 256 * 1024, "Reviewed public JSON response was oversized.");
  try { return JSON.parse(text); } catch { throw new Error("Reviewed public JSON response was malformed."); }
}
async function assetProof(host, pathname, expectedBytes, expectedSha) {
  const url = new URL(pathname, `https://${host}`); url.searchParams.set("leaderboardFilesProof", Date.now());
  const { bytes, response } = await fetchBytes(url.href, { label: "reviewed deployment asset", redirect: "error" });
  invariant(new URL(response.url).origin === `https://${host}` && (expectedBytes === null || bytes.length === expectedBytes) && sha256(bytes) === expectedSha, "Reviewed deployment asset bytes/hash drifted.");
  return { bytes: bytes.length, sha256: expectedSha };
}
function assertKnownDeployment(record, expected, target) {
  invariant(deploymentId(record) === expected.id && deploymentProjectId(record) === baseline.vercel.projectId && record.name === baseline.vercel.projectName, "Bound deployment identity drifted.");
  const createdAt = deploymentCreatedAt(record);
  invariant(deploymentState(record) === "READY" && record.target === target && record.url === expected.url && (expected.createdAt === undefined || createdAt === Number(expected.createdAt)), "Bound deployment readiness/target/url drifted.");
  return record;
}
async function assertVercelState(secrets, expectedStagingId = process.env.EXPECTED_STAGING_DEPLOYMENT_ID) {
  invariant(expectedStagingId === baseline.vercel.stagingDeployment.id, "Expected staging deployment id must equal the immutable baseline.");
  const api = vercelApi(secrets); const project = assertVercelProject(await api.project(), baseline);
  const environment = await api.environment();
  invariant(Array.isArray(environment.envs) && !environment.envs.some(({ key }) => key === "ALLOW_VERCEL_GIT_PRODUCTION"), "Vercel Git-production override exists or environment metadata was malformed.");
  const history = await allDeployments(api); const active = activeDeployments(history); const prior = priorPreviewDeployments(history);
  invariant(active.length === 0 && prior.length === 0, "Vercel traffic or a prior immutable Files preview blocks a new create.");
  const staging = assertKnownDeployment(await api.deployment(expectedStagingId), baseline.vercel.stagingDeployment, null);
  invariant(staging.meta?.gitDirty === baseline.vercel.stagingDeployment.acceptedGitDirty && staging.meta?.githubCommitSha === baseline.candidate.sha && staging.meta?.githubCommitRef === baseline.vercel.stagingDeployment.githubCommitRef && staging.meta?.releaseLane === baseline.vercel.stagingDeployment.releaseLane, "Reviewed staging provenance drifted.");
  const old = assertKnownDeployment(await api.deployment(baseline.vercel.oldProductionDeployment.id), baseline.vercel.oldProductionDeployment, "production");
  invariant(old.meta?.githubCommitSha === baseline.vercel.oldProductionDeployment.gitCommitSha, "Reviewed old-production commit provenance drifted.");
  const aliases = await loadAliases(api);
  invariant(aliases[baseline.hosts.staging] === expectedStagingId && aliases[baseline.hosts.stagingBranch] === expectedStagingId && aliases[baseline.hosts.production] === old.id && aliases[baseline.hosts.www] === old.id, "Bound live/staging aliases drifted.");
  assertSupabaseUrl((await publicJson(baseline.hosts.staging, "/api/client-config")).url, baseline.supabase.stagingRef, baseline.supabase.productionRef);
  assertSupabaseUrl((await publicJson(baseline.hosts.production, "/api/client-config")).url, baseline.supabase.productionRef, baseline.supabase.stagingRef);
  await assetProof(baseline.hosts.staging, "/app.js", null, baseline.assets.appJsSha256);
  await assetProof(baseline.hosts.staging, baseline.assets.leaderboardModulePath, baseline.assets.leaderboardModuleBytes, baseline.assets.leaderboardModuleSha256);
  return { project, aliases, stagingDeploymentId: expectedStagingId, oldProductionDeploymentId: old.id, active: 0, prior: 0 };
}

export function releaseCommandEnvironment(kind, secrets, preview = {}) {
  const refs = { SUPABASE_PROJECT_REF: baseline.supabase.productionRef, STAGING_SUPABASE_PROJECT_REF: baseline.supabase.stagingRef };
  const environments = {
    "credential-live": { LIVE_QA_BASE_URL: `https://${baseline.hosts.production}`, LIVE_QA_USERNAME: secrets.LIVE_QA_USERNAME, LIVE_QA_PASSWORD: secrets.LIVE_QA_PASSWORD, LEADERBOARD_CREDENTIAL_PROOF_ONLY: "1", LEADERBOARD_CREDENTIAL_PROOF_TARGET: "live", ...refs },
    "credential-staging": { LIVE_QA_BASE_URL: `https://${baseline.hosts.staging}`, LIVE_QA_USERNAME: secrets.STAGING_QA_USERNAME, LIVE_QA_PASSWORD: secrets.STAGING_QA_PASSWORD, LEADERBOARD_CREDENTIAL_PROOF_ONLY: "1", LEADERBOARD_CREDENTIAL_PROOF_TARGET: "staging", ...refs },
    "preview-smoke": { LIVE_QA_BASE_URL: preview.origin, LIVE_QA_USERNAME: secrets.STAGING_QA_USERNAME, LIVE_QA_PASSWORD: secrets.STAGING_QA_PASSWORD, LEADERBOARD_READONLY_EXPECTED_ORIGIN: preview.origin, LEADERBOARD_READONLY_EXPECTED_SUPABASE_REF: baseline.supabase.stagingRef, LEADERBOARD_READONLY_DENIED_SUPABASE_REF: baseline.supabase.productionRef },
  };
  invariant(environments[kind], `Unknown release child environment: ${kind}.`);
  return childEnvironment(environments[kind]);
}
export function assertPlanArtifact(value, expected) {
  invariant(value && typeof value === "object" && !Array.isArray(value), "Plan artifact was malformed.");
  invariant(canonicalJson(Object.keys(value).sort()) === canonicalJson(["candidate", "createdAt", "credentialProof", "db", "expectedCalls", "github", "orchestration", "planSha256", "preview", "repository", "runAttempt", "runId", "schema", "source", "vercel"]), "Plan artifact top-level schema drifted.");
  invariant(value.schema === artifactSchema && value.repository === baseline.repository.fullName, "Plan artifact schema/repository drifted.");
  invariant(value.runId === String(process.env.GITHUB_RUN_ID) && value.runAttempt === "1", "Plan artifact was not produced by this exact run/attempt.");
  invariant(value.orchestration.sha === expected.rail.head && value.candidate.sha === baseline.candidate.sha && value.candidate.tree === baseline.candidate.tree, "Plan artifact SHA/tree binding drifted.");
  invariant(canonicalJson(value.orchestration.files) === canonicalJson(baseline.allowedRailPaths) && canonicalJson(Object.keys(value.source).sort()) === canonicalJson(["commit", "manifestSha256", "projectedCount", "requestFilesSha256", "schema", "totalBytes", "trackedCount", "tree"]), "Plan rail/source schema drifted.");
  invariant(value.source.manifestSha256 === baseline.vercel.filesApi.source.manifestSha256 && value.source.requestFilesSha256 === baseline.vercel.filesApi.source.requestFilesSha256 && value.source.projectedCount === baseline.vercel.filesApi.source.projectedCount, "Plan source evidence drifted.");
  invariant(canonicalJson(value.preview) === canonicalJson({ nonce: process.env.PREVIEW_ATTEMPT_NONCE, createTemplateSha256: value.preview?.createTemplateSha256, createIntentSha256: value.preview?.createIntentSha256, target: null, productionEnabled: false }) && /^[0-9a-f]{64}$/.test(value.preview.createTemplateSha256) && /^[0-9a-f]{64}$/.test(value.preview.createIntentSha256), "Plan preview policy/template drifted.");
  invariant(canonicalJson(value.expectedCalls) === canonicalJson({ uploads: baseline.vercel.filesApi.source.uniqueUploadCount, previewCreates: 1, productionCreates: 0, promotes: 0, rollbacks: 0 }) && canonicalJson(value.credentialProof) === canonicalJson({ livePlatformAdmin: true, stagingTeamCoverage: true, writes: "auth-session-metadata-only" }), "Plan call/credential policy drifted.");
  assertAliasBaseline(value.vercel?.aliases, baseline);
  const core = { ...value }; delete core.planSha256;
  invariant(value.planSha256 === canonicalDigest(core), "Plan artifact canonical digest was tampered.");
  return value;
}
export function assertUploadedArtifactRecord(payload, expectedName, expectedDigest) {
  invariant(/^[0-9a-f]{64}$/.test(expectedDigest) && payload.total_count === 1 && payload.artifacts?.length === 1, "Same-run plan artifact identity/digest was ambiguous.");
  const artifact = payload.artifacts[0];
  invariant(artifact.name === expectedName && artifact.expired === false && artifact.digest === `sha256:${expectedDigest}`, "Same-run plan artifact state/digest drifted.");
  return { id: Number(artifact.id), digest: artifact.digest };
}
async function assertUploadedArtifact(token) {
  const name = `leaderboard-files-preview-plan-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  const payload = await fetchJson(`https://api.github.com/repos/${baseline.repository.fullName}/actions/runs/${process.env.GITHUB_RUN_ID}/artifacts?name=${encodeURIComponent(name)}&per_page=100`, { token, label: "same-run Files preview plan artifact", headers: { "X-GitHub-Api-Version": "2026-03-10", Accept: "application/vnd.github+json" }, redirect: "error" });
  return assertUploadedArtifactRecord(payload, name, String(process.env.EXPECTED_UPLOAD_DIGEST || ""));
}
function manifestSummary(manifest) { return { schema: manifest.schema, commit: manifest.commit, tree: manifest.tree, trackedCount: manifest.trackedCount, projectedCount: manifest.projectedCount, totalBytes: manifest.totalBytes, manifestSha256: manifest.manifestSha256, requestFilesSha256: baseline.vercel.filesApi.source.requestFilesSha256 }; }
function attemptMeta(context, manifest, artifactSha256) {
  return previewAttemptMeta({ baseline, orchestrationSha: context.rail.head, artifactSha256, manifest, requestFilesSha256: baseline.vercel.filesApi.source.requestFilesSha256, workflow: "leaderboard-production-code-release.yml", runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, nonce: process.env.PREVIEW_ATTEMPT_NONCE });
}
function assertTemplate(value, context, manifest, files) {
  invariant(value.preview.nonce === process.env.PREVIEW_ATTEMPT_NONCE && value.preview.target === null && value.preview.productionEnabled === false, "Plan preview nonce/target policy drifted.");
  const template = buildPreviewCreateBody({ baseline, files, meta: attemptMeta(context, manifest, artifactPlaceholder) });
  invariant(value.preview.createTemplateSha256 === template.bodySha256 && value.preview.createIntentSha256 === template.createIntentSha256, "Plan preview-create template drifted.");
  return template;
}
async function credentialProof(target, secrets) {
  runChecked(`read-only ${target} credential proof`, process.execPath, [fileURLToPath(import.meta.url), "--mode", "credential-proof"], { cwd: rootDir, env: releaseCommandEnvironment(`credential-${target}`, secrets), secrets, timeoutMs: 2 * 60_000, print: true });
}
async function plan(secrets) {
  const context = assertContext("plan"); const db = assertDbAttestation(); const github = await assertGithubEvidence(secrets.GITHUB_TOKEN); const vercel = await assertVercelState(secrets);
  await credentialProof("live", secrets); await credentialProof("staging", secrets);
  const manifest = assertSourceManifest(buildSourceManifest(rootDir, baseline), baseline); const files = assertSourceRequestFiles(manifest, baseline);
  const template = buildPreviewCreateBody({ baseline, files, meta: attemptMeta(context, manifest, artifactPlaceholder) });
  const core = { schema: artifactSchema, repository: baseline.repository.fullName, runId: String(process.env.GITHUB_RUN_ID), runAttempt: "1", createdAt: new Date().toISOString(), orchestration: { sha: context.rail.head, tree: context.rail.tree, files: context.rail.files }, candidate: baseline.candidate, source: manifestSummary(manifest), db, github, vercel, preview: { nonce: process.env.PREVIEW_ATTEMPT_NONCE, createTemplateSha256: template.bodySha256, createIntentSha256: template.createIntentSha256, target: null, productionEnabled: false }, credentialProof: { livePlatformAdmin: true, stagingTeamCoverage: true, writes: "auth-session-metadata-only" }, expectedCalls: { uploads: baseline.vercel.filesApi.source.uniqueUploadCount, previewCreates: 1, productionCreates: 0, promotes: 0, rollbacks: 0 } };
  const artifact = { ...core, planSha256: canonicalDigest(core) }; assertNoSecretLeak(artifact, secrets);
  const artifactPath = assertArtifactPath(process.env.PLAN_ARTIFACT_PATH, process.env.RUNNER_TEMP); const written = writeArtifact(artifactPath, artifact);
  appendGithubOutput({ artifact_sha256: written.sha256, plan_sha256: artifact.planSha256, artifact_path: artifactPath });
  console.log(`Leaderboard Files preview plan: ok (${artifact.planSha256}).`);
}

function assertCreateResponse(record, meta, startedAt) {
  const matches = selectDeploymentCandidates([record], { baseline, meta, startedAt, target: null });
  invariant(matches.length === 1 && Object.hasOwn(record, "target") && record.target === null && Array.isArray(record.alias) && record.alias.length === 0 && record.teamId === baseline.vercel.teamId && record.name === baseline.vercel.projectName, "Vercel preview create response drifted.");
  return record;
}
async function resolveCreate(api, error, meta, startedAt) {
  if (error instanceof VercelRequestError && error.kind === "status" && error.status >= 400 && error.status < 500 && error.status !== 429) throw error;
  return resolveAmbiguousCreate({ baseline, meta, startedAt, target: null, loadPage: ({ until }) => api.list({ until, since: startedAt - 5_000 }), inspect: (id) => api.deployment(id) });
}
async function waitPreview(api, id, meta) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const record = await api.deployment(id); const state = record.readyState || record.state;
    invariant(!["ERROR", "CANCELED"].includes(state), `Files preview entered ${state}.`);
    if (state === "READY") return assertPreviewDeployment(record, { meta }, baseline);
    if (attempt < 59) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Files preview did not become READY in five minutes.");
}
function assertBuildEvents(events) {
  invariant(Array.isArray(events), "Vercel preview event response was malformed.");
  invariant(!events.some((event) => event?.type === "fatal" || (event?.type === "exit" && Number(event?.payload?.statusCode ?? event?.payload?.exitCode) !== 0)), "Vercel preview emitted a fatal or nonzero build event.");
  return { inspected: events.length, fatal: 0 };
}
async function verifyPreview(api, ready, manifest, secrets) {
  const id = ready.id; const host = ready.url; const origin = `https://${host}`;
  const tree = assertDeploymentFileTree(await api.files(id), manifest);
  const contents = await verifyDeploymentFileContents({ remoteFiles: tree, manifest, loadContent: (file, expected, maxBytes) => api.content(id, file, expected, maxBytes), hash: (algorithm, bytes) => crypto.createHash(algorithm).update(bytes).digest("hex") });
  assertPreviewSupabaseRef(await publicJson(host, "/api/client-config"), baseline);
  await assetProof(host, "/app.js", null, baseline.assets.appJsSha256); await assetProof(host, "/app-runtime.js", null, baseline.assets.appRuntimeSha256); await assetProof(host, "/src/modules/platform/navigation-controller.mjs", null, baseline.assets.navigationControllerSha256); await assetProof(host, baseline.assets.leaderboardModulePath, baseline.assets.leaderboardModuleBytes, baseline.assets.leaderboardModuleSha256);
  await assertCredentialHealth({ target: "preview", baseUrl: origin, expectedHost: host, expectedRef: baseline.supabase.stagingRef, deniedRef: baseline.supabase.productionRef, username: secrets.STAGING_QA_USERNAME, password: secrets.STAGING_QA_PASSWORD });
  runChecked("read-only Leaderboard Files preview smoke", "npm", ["run", "qa:live:leaderboard:readonly"], { cwd: rootDir, env: releaseCommandEnvironment("preview-smoke", secrets, { origin }), secrets, timeoutMs: 10 * 60_000, print: true });
  const events = assertBuildEvents(await api.events(id));
  return { id, url: host, contents, events, supabaseRef: baseline.supabase.stagingRef, rows: 0, aliasesChanged: false };
}
export async function runSinglePreviewAttempt({ issue, resolve, identify, report, validate, prove, assertAliases }) {
  for (const operation of [issue, resolve, identify, report, validate, prove, assertAliases]) invariant(typeof operation === "function", "Single preview attempt operations were malformed.");
  let primaryError = null; let aliasError = null; let result;
  try {
    let record; let requestError = null; let reconciled = false;
    try { record = await issue(); } catch (error) { requestError = error; }
    if (requestError) { record = await resolve(requestError); reconciled = true; }
    let id;
    try { id = identify(record); }
    catch (identityError) {
      if (reconciled) throw identityError;
      record = await resolve(identityError); reconciled = true; id = identify(record);
    }
    report(record, id); const validated = validate(record); result = await prove(validated, id);
  } catch (error) { primaryError = error; }
  finally { try { await assertAliases(); } catch (error) { aliasError = error; } }
  if (primaryError || aliasError) throw new Error([primaryError ? `Preview attempt failure: ${primaryError.message}` : "", aliasError ? `Mandatory alias-state failure: ${aliasError.message}` : ""].filter(Boolean).join("\n"));
  return result;
}
async function previewApply(secrets) {
  const context = assertContext("preview-apply"); const now = Date.now(); const db = assertDbAttestation(now);
  const artifactPath = assertArtifactPath(process.env.PLAN_ARTIFACT_PATH, process.env.RUNNER_TEMP); const { value } = readArtifact(artifactPath, process.env.EXPECTED_ARTIFACT_SHA256); assertPlanArtifact(value, context); await assertUploadedArtifact(secrets.GITHUB_TOKEN);
  const manifest = assertSourceManifest(buildSourceManifest(rootDir, baseline), baseline); const files = assertSourceRequestFiles(manifest, baseline); assertTemplate(value, context, manifest, files);
  const github = await assertGithubEvidence(secrets.GITHUB_TOKEN); invariant(github.freezes.digest === value.github.freezes.digest && value.db.digest === db.digest, "Plan GitHub/DB evidence drifted before preview upload.");
  const initialVercel = await assertVercelState(secrets, value.vercel.stagingDeploymentId); invariant(canonicalJson(initialVercel.aliases) === canonicalJson(value.vercel.aliases), "Plan alias snapshot drifted before preview upload.");
  assertReleaseEvidenceWindow(value, db, github.freezes, now);
  const api = vercelApi(secrets); const uploads = await uploadSourceFiles({ repoDir: rootDir, manifest, baseline, upload: (request) => api.upload(request) });
  const finalGithub = await assertGithubRace(secrets.GITHUB_TOKEN); const finalVercel = await assertVercelState(secrets, value.vercel.stagingDeploymentId); const finalDb = assertDbAttestation(Date.now());
  invariant(finalGithub.freezes.digest === value.github.freezes.digest && canonicalJson(finalVercel.aliases) === canonicalJson(value.vercel.aliases) && finalDb.digest === value.db.digest, "Final pre-create evidence drifted.");
  assertReleaseEvidenceWindow(value, finalDb, finalGithub.freezes, Date.now());
  const meta = attemptMeta(context, manifest, process.env.EXPECTED_ARTIFACT_SHA256); const body = buildPreviewCreateBody({ baseline, files, meta }); const startedAt = Date.now();
  const { id, proof } = await runSinglePreviewAttempt({
    issue: async () => (await api.createPreview(body.value)).payload,
    resolve: (error) => resolveCreate(api, error, body.value.meta, startedAt),
    identify: deploymentId,
    report: (_record, id) => { appendGithubOutput({ preview_deployment_id: id, preview_create_body_sha256: body.bodySha256 }); console.log(`Resolved immutable Files preview deployment: ${id}.`); },
    validate: (record) => assertCreateResponse(record, body.value.meta, startedAt),
    prove: async (record, id) => { const ready = await waitPreview(api, id, body.value.meta); return { id, proof: await verifyPreview(api, ready, manifest, secrets) }; },
    assertAliases: async () => assertAliasesUnchanged(value.vercel.aliases, await loadAliases(api)),
  });
  appendGithubOutput({ preview_deployment_url: `https://${proof.url}`, preview_source_files_verified: String(proof.contents.verified) });
  console.log(`Leaderboard Files preview proof: ok (${id}; ${uploads.uniqueDigests} uploads; ${proof.contents.verified} source files).`);
}

async function main() {
  assertNoProxyEnvironment();
  const mode = process.argv[process.argv.indexOf("--mode") + 1] || "";
  if (mode === "normalize") { console.log(`npm ci normalization: ${normalizeNpmCiDrift(path.resolve(process.env.TARGET_DIR || rootDir))}.`); return; }
  const secrets = captureSecrets(process.env); processSecrets = secrets;
  if (mode === "credential-proof") {
    invariant(secrets.LIVE_QA_USERNAME && secrets.LIVE_QA_PASSWORD, "Credential proof requires one isolated username/password pair.");
    const proof = await assertCredentialHealth({ target: process.env.LEADERBOARD_CREDENTIAL_PROOF_TARGET, baseUrl: process.env.LIVE_QA_BASE_URL, username: secrets.LIVE_QA_USERNAME, password: secrets.LIVE_QA_PASSWORD });
    console.log(`Read-only ${proof.target} credential health: ok (${proof.host}).`); return;
  }
  invariant(["environment-preflight", "plan", "preview-apply"].includes(mode), "Usage: --mode environment-preflight|plan|preview-apply|credential-proof|normalize"); requireSecrets(secrets, mode);
  if (mode === "environment-preflight") { await assertReleaseEnvironments(secrets.GITHUB_TOKEN); console.log("Protected Files preview environments: ok."); }
  else if (mode === "plan") await plan(secrets); else await previewApply(secrets);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(redact(`Leaderboard Files preview failed: ${error.message}`, processSecrets)); process.exitCode = 1; });
