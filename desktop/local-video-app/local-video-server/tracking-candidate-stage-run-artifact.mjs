import { createHash, randomUUID } from "node:crypto";
import { normalizeTrackingProviderManifest } from "./tracking-provider-contract.mjs";
import {
  trackingProviderExecutionFingerprint,
  trackingProviderFingerprint,
} from "./tracking-provider-evidence.mjs";
import {
  normalizeTrackingStageRequest,
  trackingStageRequestFingerprint,
  validateTrackingStageArtifact,
} from "./tracking-stage-artifact-validator.mjs";

export const TRACKING_CANDIDATE_STAGE_RUN_PROTOCOL = "football-science-tracking-candidate-stage-run-v1";
const MAXIMUM_CANDIDATE_STAGE_RUN_BYTES = 160 * 1024 * 1024;

export class TrackingCandidateStageRunError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_STAGE_RUN_INVALID") {
    super(message);
    this.name = "TrackingCandidateStageRunError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateStageRunError(message, code);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid(`${label} contains unsupported field ${unknown[0]}.`);
}

function boundedString(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function identifier(value, label) {
  const text = boundedString(value, label);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function sha256(value, label) {
  const text = boundedString(value, label, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) invalid(`${label} must be a SHA-256 hash.`);
  return text;
}

function boundedInteger(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function trackingCandidateStageValueSha256(value) {
  let serialized;
  try {
    serialized = canonicalJson(value);
  } catch {
    invalid("Tracking candidate evidence is not serializable.");
  }
  return createHash("sha256").update(serialized).digest("hex");
}

function providerIdentity(provider = {}) {
  return {
    id: provider.providerId,
    version: provider.providerVersion,
    protocol: provider.protocol,
    stage: provider.stage,
    capabilities: [...provider.capabilities].sort(),
    manifestFingerprintSha256: trackingProviderFingerprint(provider),
    executionFingerprintSha256: trackingProviderExecutionFingerprint(provider),
  };
}

function assertCandidatePolicy(provider = {}) {
  const identityUseRequired = provider.stage === "reidentification"
    || provider.capabilities.includes("classify:shirt-number");
  if (provider.approval.status !== "candidate"
    || provider.approval.networkAtInference
    || !provider.approval.licenseReviewed
    || provider.benchmark.status === "passed"
    || provider.models.some((model) => !model.provenance.trainingDataReviewed)
    || provider.models.some((model) => model.provenance.datasets.some((dataset) => !dataset.rightsReviewed))
    || (identityUseRequired && provider.models.some(
      (model) => model.provenance.datasets.some((dataset) => !dataset.identityUseReviewed),
    ))) {
    invalid("Candidate policy does not allow benchmark execution.", "TRACKING_CANDIDATE_STAGE_RUN_BOUNDARY");
  }
}

function normalizedTelemetry(value = {}, provider = {}, range = {}) {
  exactKeys(value, [
    "protocol", "isolation", "wallTimeMs", "outputBytes", "stdoutBytes", "stderrBytes", "exitCode",
  ], "Tracking candidate execution");
  const wallTimeMs = boundedInteger(value.wallTimeMs, "tracking candidate wall time", 1, 24 * 60 * 60 * 1000);
  const durationMs = range.endMs - range.startMs;
  const exitCode = boundedInteger(value.exitCode, "tracking candidate exit code", 0, 255);
  if (exitCode !== 0) invalid("A failed candidate execution cannot become benchmark evidence.");
  return {
    protocol: identifier(value.protocol, "tracking candidate execution protocol"),
    isolation: identifier(value.isolation, "tracking candidate execution isolation"),
    wallTimeMs,
    realTimeFactor: Number((wallTimeMs / durationMs).toFixed(6)),
    outputBytes: boundedInteger(value.outputBytes, "tracking candidate output bytes", 1, 4 * 1024 * 1024 * 1024),
    stdoutBytes: boundedInteger(value.stdoutBytes, "tracking candidate stdout bytes", 0, 64 * 1024),
    stderrBytes: boundedInteger(value.stderrBytes, "tracking candidate stderr bytes", 0, 64 * 1024),
    exitCode,
    device: boundedString(provider.runtime.device, "tracking candidate execution device", 80),
    runtimeMode: boundedString(provider.runtime.runtimeMode, "tracking candidate runtime mode", 100),
    cpuThreads: boundedInteger(provider.runtime.cpuThreads, "tracking candidate CPU thread count", 1, 256),
    sampleFps: Number(provider.runtime.sampleFps),
    modelResident: provider.runtime.modelResident === true,
    workerReused: false,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizedArtifact(value = {}, providerValue = {}, options = {}) {
  const provider = normalizeTrackingProviderManifest(providerValue);
  assertCandidatePolicy(provider);
  const request = normalizeTrackingStageRequest(provider, value.request);
  const artifact = validateTrackingStageArtifact(value.artifact, provider, request);
  const telemetry = normalizedTelemetry(value.telemetry, provider, request.range);
  if (!Number.isFinite(telemetry.sampleFps) || telemetry.sampleFps <= 0 || telemetry.sampleFps > 240) {
    invalid("Invalid tracking candidate sample rate.");
  }
  const createdDate = new Date(options.now?.() ?? value.createdAt ?? Date.now());
  if (!Number.isFinite(createdDate.getTime())) invalid("Invalid candidate evidence creation time.");
  const artifactValue = {
    schemaVersion: 1,
    protocol: TRACKING_CANDIDATE_STAGE_RUN_PROTOCOL,
    id: identifier(options.id || value.id || `candidate-stage-${randomUUID()}`, "tracking candidate evidence id"),
    benchmarkOnly: true,
    provider: providerIdentity(provider),
    source: {
      algorithm: "sha256",
      kind: "exact-local-file-bytes",
      fingerprintSha256: request.sourceFingerprint,
    },
    range: { ...request.range },
    request: {
      fingerprintSha256: trackingStageRequestFingerprint(provider, request),
      payload: request,
    },
    result: {
      artifactSha256: trackingCandidateStageValueSha256(artifact),
      payload: artifact,
    },
    execution: telemetry,
    createdAt: createdDate.toISOString(),
  };
  if (Buffer.byteLength(canonicalJson(artifactValue)) > MAXIMUM_CANDIDATE_STAGE_RUN_BYTES) {
    invalid("Tracking candidate stage run exceeds its evidence limit.", "TRACKING_CANDIDATE_STAGE_RUN_LIMIT");
  }
  return artifactValue;
}

export function createTrackingCandidateStageRunArtifact(value = {}, providerValue = {}, options = {}) {
  return deepFreeze(normalizedArtifact(value, providerValue, options));
}

export function validateTrackingCandidateStageRunArtifact(value = {}, providerValue = {}) {
  exactKeys(value, [
    "schemaVersion", "protocol", "id", "benchmarkOnly", "provider", "source", "range",
    "request", "result", "execution", "createdAt",
  ], "Tracking candidate stage run");
  exactKeys(value.provider, [
    "id", "version", "protocol", "stage", "capabilities", "manifestFingerprintSha256",
    "executionFingerprintSha256",
  ], "Tracking candidate provider");
  exactKeys(value.source, ["algorithm", "kind", "fingerprintSha256"], "Tracking candidate source");
  exactKeys(value.range, ["startMs", "endMs"], "Tracking candidate range");
  exactKeys(value.request, ["fingerprintSha256", "payload"], "Tracking candidate request");
  exactKeys(value.result, ["artifactSha256", "payload"], "Tracking candidate result");
  exactKeys(value.execution, [
    "protocol", "isolation", "wallTimeMs", "realTimeFactor", "outputBytes", "stdoutBytes",
    "stderrBytes", "exitCode", "device", "runtimeMode", "cpuThreads", "sampleFps",
    "modelResident", "workerReused",
  ], "Tracking candidate execution");
  if (Number(value.schemaVersion) !== 1
    || value.protocol !== TRACKING_CANDIDATE_STAGE_RUN_PROTOCOL
    || value.benchmarkOnly !== true
    || value.source.algorithm !== "sha256"
    || value.source.kind !== "exact-local-file-bytes") {
    invalid("Tracking candidate stage run protocol is invalid.");
  }
  const normalized = normalizedArtifact({
    id: value.id,
    request: value.request.payload,
    artifact: value.result.payload,
    telemetry: {
      protocol: value.execution.protocol,
      isolation: value.execution.isolation,
      wallTimeMs: value.execution.wallTimeMs,
      outputBytes: value.execution.outputBytes,
      stdoutBytes: value.execution.stdoutBytes,
      stderrBytes: value.execution.stderrBytes,
      exitCode: value.execution.exitCode,
    },
    createdAt: value.createdAt,
  }, providerValue, { id: value.id, now: () => value.createdAt });
  if (JSON.stringify(normalized.provider) !== JSON.stringify(value.provider)
    || normalized.source.fingerprintSha256 !== sha256(value.source.fingerprintSha256, "candidate source fingerprint")
    || JSON.stringify(normalized.range) !== JSON.stringify(value.range)
    || normalized.request.fingerprintSha256 !== sha256(value.request.fingerprintSha256, "candidate request fingerprint")
    || normalized.result.artifactSha256 !== sha256(value.result.artifactSha256, "candidate result fingerprint")
    || JSON.stringify(normalized.execution) !== JSON.stringify(value.execution)) {
    invalid("Tracking candidate stage run does not match its bound evidence.", "TRACKING_CANDIDATE_STAGE_RUN_MISMATCH");
  }
  return deepFreeze(normalized);
}

export function trackingCandidateStageRunArtifactJson(value = {}, providerValue = {}) {
  return `${JSON.stringify(validateTrackingCandidateStageRunArtifact(value, providerValue), null, 2)}\n`;
}
