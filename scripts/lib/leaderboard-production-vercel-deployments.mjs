import { canonicalDigest, canonicalJson, invariant, sha256 } from "./leaderboard-production-release-security.mjs";
import { deploymentCreatedAt, deploymentId, deploymentProjectId, deploymentState } from "./leaderboard-production-vercel-state.mjs";

const previewBodyKeys = ["files", "meta", "name", "project"];
const productionBodyKeys = ["files", "meta", "name", "project", "target"];
const forbiddenBodyKeys = ["aliases", "buildEnv", "customEnvironment", "deploymentId", "env", "forceNew", "gitMetadata", "gitSource", "projectSettings", "withLatestCommit"];
const previewMetaKeys = ["attemptNonce", "candidateSha", "candidateTree", "createIntentSha256", "githubRunAttempt", "githubRunId", "githubWorkflow", "orchestrationSha", "planArtifactSha256", "releaseLane", "sourceManifestSha256", "sourceRequestSha256"];

function assertAttemptMeta(meta, baseline, { withIntent = false } = {}) {
  invariant(meta && typeof meta === "object" && !Array.isArray(meta), "Preview attempt metadata was malformed.");
  const keys = withIntent ? previewMetaKeys : previewMetaKeys.filter((key) => key !== "createIntentSha256");
  invariant(canonicalJson(Object.keys(meta).sort()) === canonicalJson(keys), "Preview attempt metadata keyset drifted.");
  invariant(meta.releaseLane === baseline.vercel.filesApi.preview.releaseLane && meta.candidateSha === baseline.candidate.sha && meta.candidateTree === baseline.candidate.tree, "Preview attempt candidate metadata drifted.");
  invariant(meta.sourceManifestSha256 === baseline.vercel.filesApi.source.manifestSha256 && meta.sourceRequestSha256 === baseline.vercel.filesApi.source.requestFilesSha256, "Preview attempt source metadata drifted.");
  invariant(/^[0-9a-f]{40}$/.test(meta.orchestrationSha) && /^[0-9a-f]{64}$/.test(meta.planArtifactSha256), "Preview attempt orchestration/artifact metadata drifted.");
  invariant(meta.githubWorkflow === "leaderboard-production-code-release.yml" && /^\d+$/.test(meta.githubRunId) && meta.githubRunAttempt === "1" && /^[A-Za-z0-9._-]{12,120}$/.test(meta.attemptNonce), "Preview attempt workflow metadata drifted.");
  if (withIntent) invariant(/^[0-9a-f]{64}$/.test(meta.createIntentSha256), "Preview create-intent metadata drifted.");
  return meta;
}

export function previewAttemptMeta({ baseline, orchestrationSha, artifactSha256, manifest, requestFilesSha256, workflow, runId, runAttempt, nonce }) {
  invariant(/^[0-9a-f]{40}$/.test(orchestrationSha) && /^[0-9a-f]{64}$/.test(artifactSha256), "Preview orchestration/artifact binding was invalid.");
  invariant(manifest.commit === baseline.candidate.sha && manifest.tree === baseline.candidate.tree && manifest.manifestSha256 === baseline.vercel.filesApi.source.manifestSha256, "Preview manifest binding drifted.");
  invariant(requestFilesSha256 === baseline.vercel.filesApi.source.requestFilesSha256 && /^[A-Za-z0-9._-]{12,120}$/.test(nonce), "Preview request digest/nonce was invalid.");
  invariant(workflow === "leaderboard-production-code-release.yml" && /^\d+$/.test(String(runId)) && String(runAttempt) === "1", "Preview workflow/run binding drifted.");
  const meta = {
    releaseLane: baseline.vercel.filesApi.preview.releaseLane,
    candidateSha: baseline.candidate.sha,
    candidateTree: baseline.candidate.tree,
    sourceManifestSha256: manifest.manifestSha256,
    sourceRequestSha256: requestFilesSha256,
    orchestrationSha,
    planArtifactSha256: artifactSha256,
    githubWorkflow: workflow,
    githubRunId: String(runId),
    githubRunAttempt: String(runAttempt),
    attemptNonce: nonce,
  };
  return assertAttemptMeta(meta, baseline);
}

function withIntentDigest(body) {
  const createIntentSha256 = canonicalDigest(body);
  const value = { ...body, meta: { ...body.meta, createIntentSha256 } };
  return { value, bytes: Buffer.from(`${canonicalJson(value)}\n`, "utf8"), createIntentSha256 };
}

export function buildPreviewCreateBody({ baseline, files, meta }) {
  const result = withIntentDigest({ name: baseline.vercel.projectName, project: baseline.vercel.projectId, files, meta });
  assertPreviewCreateBody(result.value, baseline);
  return { ...result, bodySha256: sha256(result.bytes) };
}

export function assertPreviewCreateBody(body, baseline) {
  invariant(body && typeof body === "object" && !Array.isArray(body), "Preview create body was malformed.");
  invariant(canonicalJson(Object.keys(body).sort()) === canonicalJson(previewBodyKeys), "Preview create body allowlist drifted.");
  for (const key of forbiddenBodyKeys) invariant(!Object.hasOwn(body, key), `Preview create body included forbidden ${key}.`);
  invariant(!Object.hasOwn(body, "target"), "Preview create must omit target.");
  invariant(body.name === baseline.vercel.projectName && body.project === baseline.vercel.projectId, "Preview create project binding drifted.");
  invariant(Array.isArray(body.files) && body.files.length === baseline.vercel.filesApi.source.projectedCount, "Preview create file cardinality drifted.");
  invariant(canonicalDigest(body.files) === baseline.vercel.filesApi.source.requestFilesSha256, "Preview create source-file digest drifted.");
  for (const row of body.files) invariant(row && canonicalJson(Object.keys(row).sort()) === canonicalJson(["file", "sha", "size"]) && typeof row.file === "string" && row.file && /^[0-9a-f]{40}$/.test(row.sha) && Number.isSafeInteger(row.size) && row.size >= 0, "Preview create source-file row drifted.");
  assertAttemptMeta(body.meta, baseline, { withIntent: true });
  const { createIntentSha256, ...meta } = body.meta;
  invariant(/^[0-9a-f]{64}$/.test(createIntentSha256) && createIntentSha256 === canonicalDigest({ name: body.name, project: body.project, files: body.files, meta }), "Preview create intent digest drifted.");
  return body;
}

export function buildStagedProductionCreateBody({ baseline, files, meta, project }) {
  invariant(baseline.vercel.filesApi.production.enabled === true && project.autoAssignCustomDomains === false, "Staged production creation is disabled or custom domains may auto-assign.");
  const result = withIntentDigest({ name: baseline.vercel.projectName, project: baseline.vercel.projectId, files, meta, target: "production" });
  invariant(canonicalJson(Object.keys(result.value).sort()) === canonicalJson(productionBodyKeys), "Production create body allowlist drifted.");
  for (const key of forbiddenBodyKeys) invariant(!Object.hasOwn(result.value, key), `Production create body included forbidden ${key}.`);
  return { ...result, bodySha256: sha256(result.bytes) };
}

export function selectDeploymentCandidates(records, { baseline, meta, startedAt, target = null }) {
  invariant(Array.isArray(records), "Deployment resolution list was malformed.");
  invariant(Number.isSafeInteger(startedAt) && startedAt > 0 && (target === null || target === "production"), "Deployment resolution input was malformed.");
  assertAttemptMeta(meta, baseline, { withIntent: true });
  const matches = records.filter((record) => {
    invariant(record && typeof record === "object" && !Array.isArray(record), "Deployment resolution record was malformed.");
    deploymentId(record);
    deploymentState(record);
    const createdAt = deploymentCreatedAt(record);
    const exactMeta = record.meta && typeof record.meta === "object" && !Array.isArray(record.meta) && canonicalJson(record.meta) === canonicalJson(meta);
    return createdAt >= startedAt - 5_000 && deploymentProjectId(record) === baseline.vercel.projectId && record.teamId === baseline.vercel.teamId && record.name === baseline.vercel.projectName && Object.hasOwn(record, "target") && record.target === target && exactMeta;
  });
  const ids = matches.map(deploymentId);
  invariant(new Set(ids).size === ids.length, "Deployment resolution returned duplicate identifiers.");
  return matches;
}

export async function collectDeploymentPages(loadPage) {
  const records = []; let until = null;
  for (let page = 0; page < 20; page += 1) {
    const payload = await loadPage({ until, page });
    invariant(payload && Array.isArray(payload.deployments) && payload.pagination && Object.hasOwn(payload.pagination, "next"), "Deployment resolution pagination was malformed.");
    records.push(...payload.deployments);
    const next = payload.pagination.next;
    if (next === null) return records;
    invariant(Number.isSafeInteger(next) && next > 0 && (until === null || next < until), "Deployment resolution pagination did not advance.");
    until = next;
  }
  throw new Error("Deployment resolution exceeded the fail-closed pagination bound.");
}

export async function resolveAmbiguousCreate({ loadPage, inspect, baseline, meta, startedAt, target = null, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  invariant(typeof loadPage === "function" && typeof inspect === "function" && typeof sleep === "function" && Number.isSafeInteger(startedAt) && startedAt > 0, "Deployment ambiguity resolver inputs were malformed.");
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const listed = selectDeploymentCandidates(await collectDeploymentPages(loadPage), { baseline, meta, startedAt, target });
    const exact = [];
    for (const candidate of listed) {
      const record = await inspect(deploymentId(candidate));
      if (selectDeploymentCandidates([record], { baseline, meta, startedAt, target }).length === 1) exact.push(record);
    }
    invariant(exact.length <= 1, "Multiple exact deployment candidates made create outcome ambiguous.");
    if (exact.length === 1) return exact[0];
    if (attempt + 1 < attempts) await sleep(5_000);
  }
  throw new Error("Deployment create outcome is UNKNOWN; manual review is required and create must not be retried.");
}
