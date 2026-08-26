const PROVIDER_PROTOCOL = "football-science-tracking-stage-v1";
const REQUIRED_EVALUATOR_VERSION = "tracking-benchmark-v1";

const stageCapabilities = Object.freeze({
  detection: Object.freeze(["detect:player", "detect:ball", "detect:referee"]),
  segmentation: Object.freeze(["segment:selected-object", "propagate:selected-object"]),
  association: Object.freeze(["associate:multi-object"]),
  reidentification: Object.freeze(["reidentify:player"]),
  classification: Object.freeze(["classify:team", "classify:shirt-number"]),
});

const approvalStatuses = new Set(["candidate", "approved-local-optional", "blocked"]);
const benchmarkStatuses = new Set(["not-run", "passed", "failed"]);
const knownCapabilities = new Set(Object.values(stageCapabilities).flat());

export class TrackingProviderContractError extends Error {
  constructor(message, code = "TRACKING_PROVIDER_CONTRACT_INVALID") {
    super(message);
    this.name = "TrackingProviderContractError";
    this.code = code;
  }
}

function invalid(message) {
  throw new TrackingProviderContractError(message);
}

function boundedString(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function identifier(value, label) {
  const text = boundedString(value, label, 100);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = boundedString(value, label, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function commitHash(value) {
  const text = boundedString(value, "upstream commit", 64).toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(text)) invalid("Upstream source must be pinned to a full commit hash.");
  return text;
}

function positiveInteger(value, label, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function httpsUrl(value, label) {
  const text = boundedString(value, label, 2048);
  let url;
  try {
    url = new URL(text);
  } catch {
    invalid(`Invalid ${label}.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) invalid(`${label} must use HTTPS without credentials.`);
  return url.toString();
}

function uniqueCapabilities(values = [], stage = "") {
  if (!Array.isArray(values) || !values.length) invalid("A tracking provider needs at least one capability.");
  const allowed = new Set(stageCapabilities[stage] || []);
  const capabilities = [...new Set(values.map((value) => boundedString(value, "provider capability", 80)))];
  if (capabilities.some((capability) => !allowed.has(capability))) {
    invalid(`A provider capability does not belong to the ${stage} stage.`);
  }
  return capabilities;
}

function normalizeApproval(value = {}) {
  const status = boundedString(value.status, "approval status", 40);
  if (!approvalStatuses.has(status)) invalid("Unknown provider approval status.");
  const reviewedAt = boundedString(value.reviewedAt, "approval review date", 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) invalid("Approval review date must use YYYY-MM-DD.");
  return {
    status,
    reviewedAt,
    networkAtInference: Boolean(value.networkAtInference),
    licenseReviewed: Boolean(value.licenseReviewed),
    redistributeUpstreamAssets: Boolean(value.redistributeUpstreamAssets),
  };
}

function normalizeUpstream(value = {}) {
  return {
    repository: httpsUrl(value.repository, "upstream repository"),
    commit: commitHash(value.commit),
    sourceSha256: sha256(value.sourceSha256, "upstream source checksum"),
    license: identifier(value.license, "upstream SPDX licence"),
    licenseUrl: httpsUrl(value.licenseUrl, "upstream licence URL"),
  };
}

function normalizeModel(value = {}, index = 0) {
  return {
    id: identifier(value.id, `model ${index + 1} id`),
    sha256: sha256(value.sha256, `model ${index + 1} checksum`),
    bytes: positiveInteger(value.bytes, `model ${index + 1} byte size`, 100 * 1024 * 1024 * 1024),
    license: identifier(value.license, `model ${index + 1} SPDX licence`),
    sourceUrl: httpsUrl(value.sourceUrl, `model ${index + 1} source URL`),
  };
}

function normalizeRuntime(value = {}) {
  return {
    maxFrames: positiveInteger(value.maxFrames, "maximum frame count", 1_000_000),
    maxDurationMs: positiveInteger(value.maxDurationMs, "maximum duration", 4 * 60 * 60 * 1000),
    maxMemoryMb: positiveInteger(value.maxMemoryMb, "maximum memory", 131_072),
    maxConcurrentJobs: positiveInteger(value.maxConcurrentJobs, "maximum concurrency", 4),
  };
}

function normalizeBenchmark(value = {}) {
  const status = boundedString(value.status, "benchmark status", 40);
  if (!benchmarkStatuses.has(status)) invalid("Unknown provider benchmark status.");
  const capabilities = Array.isArray(value.capabilities)
    ? [...new Set(value.capabilities.map((entry) => boundedString(entry, "benchmark capability", 80)))]
    : [];
  if (capabilities.some((capability) => !knownCapabilities.has(capability))) {
    invalid("Benchmark evidence contains an unknown capability.");
  }
  return {
    status,
    evaluatorVersion: boundedString(value.evaluatorVersion || "not-run", "benchmark evaluator", 80),
    profileId: boundedString(value.profileId || "not-run", "benchmark profile", 80),
    reportSha256: status === "not-run" ? "" : sha256(value.reportSha256, "benchmark report checksum"),
    caseCount: status === "not-run" ? 0 : positiveInteger(value.caseCount, "benchmark case count", 100_000),
    realMatchCaseCount: status === "not-run"
      ? 0
      : positiveInteger(value.realMatchCaseCount, "real-match benchmark count", 100_000),
    capabilities,
  };
}

export function normalizeTrackingProviderManifest(value = {}) {
  if (Number(value.schemaVersion) !== 1) invalid("Unsupported tracking provider schema version.");
  if (value.protocol !== PROVIDER_PROTOCOL) invalid("Unsupported tracking provider protocol.");
  const stage = boundedString(value.stage, "provider stage", 40);
  if (!stageCapabilities[stage]) invalid("Unknown tracking provider stage.");
  const models = Array.isArray(value.models) ? value.models.map(normalizeModel) : [];
  if (stage !== "association" && !models.length) invalid(`${stage} providers must pin at least one model artifact.`);
  return {
    schemaVersion: 1,
    protocol: PROVIDER_PROTOCOL,
    providerId: identifier(value.providerId, "provider id"),
    providerVersion: identifier(value.providerVersion, "provider version"),
    displayName: boundedString(value.displayName, "provider display name", 160),
    stage,
    priority: Math.max(0, Math.min(1000, Math.round(Number(value.priority) || 0))),
    capabilities: uniqueCapabilities(value.capabilities, stage),
    approval: normalizeApproval(value.approval),
    upstream: normalizeUpstream(value.upstream),
    models,
    runtime: normalizeRuntime(value.runtime),
    benchmark: normalizeBenchmark(value.benchmark),
  };
}

export function trackingProviderReadiness(value = {}, options = {}) {
  const provider = normalizeTrackingProviderManifest(value);
  const requiredEvaluatorVersion = options.requiredEvaluatorVersion || REQUIRED_EVALUATOR_VERSION;
  const reasons = [];
  if (provider.approval.status !== "approved-local-optional") reasons.push("provider-not-approved");
  if (provider.approval.networkAtInference) reasons.push("inference-network-enabled");
  if (!provider.approval.licenseReviewed) reasons.push("licence-not-reviewed");
  if (provider.benchmark.status !== "passed") reasons.push("benchmark-not-passed");
  if (provider.benchmark.evaluatorVersion !== requiredEvaluatorVersion) reasons.push("benchmark-evaluator-mismatch");
  if (provider.benchmark.realMatchCaseCount < 1) reasons.push("real-match-evidence-missing");
  const evidenced = new Set(provider.benchmark.capabilities);
  if (provider.capabilities.some((capability) => !evidenced.has(capability))) reasons.push("capability-evidence-missing");
  return {
    ready: reasons.length === 0,
    reasons,
    provider: {
      providerId: provider.providerId,
      providerVersion: provider.providerVersion,
      displayName: provider.displayName,
      stage: provider.stage,
      priority: provider.priority,
      capabilities: provider.capabilities,
      benchmarkReportSha256: provider.benchmark.reportSha256,
    },
  };
}

export function buildTrackingPipelinePlan(values = [], options = {}) {
  if (!Array.isArray(values) || values.length > 50) invalid("Tracking pipeline provider count is invalid.");
  const requiredCapabilities = [...new Set(options.requiredCapabilities || [])];
  if (!requiredCapabilities.length || requiredCapabilities.some((entry) => !knownCapabilities.has(entry))) {
    invalid("Tracking pipeline capabilities are missing or unknown.");
  }
  const readiness = values.map((value) => trackingProviderReadiness(value, options));
  const duplicateIds = readiness.map((entry) => entry.provider.providerId)
    .filter((id, index, list) => list.indexOf(id) !== index);
  if (duplicateIds.length) invalid(`Duplicate tracking provider id: ${duplicateIds[0]}.`);
  const readyProviders = readiness.filter((entry) => entry.ready)
    .sort((first, second) => second.provider.priority - first.provider.priority);
  const selected = new Map();
  const missingCapabilities = [];
  for (const capability of requiredCapabilities) {
    const match = readyProviders.find((entry) => entry.provider.capabilities.includes(capability));
    if (!match) missingCapabilities.push(capability);
    else selected.set(match.provider.providerId, match.provider);
  }
  return {
    protocol: "football-science-tracking-pipeline-v1",
    ready: missingCapabilities.length === 0,
    requiredCapabilities,
    missingCapabilities,
    providers: [...selected.values()],
    blockedProviders: readiness.filter((entry) => !entry.ready).map((entry) => ({
      providerId: entry.provider.providerId,
      reasons: entry.reasons,
    })),
  };
}

export const TRACKING_PROVIDER_CAPABILITIES = stageCapabilities;
