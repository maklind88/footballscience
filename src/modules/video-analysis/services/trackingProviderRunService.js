import {
  MAX_TRACKING_BENCHMARK_CASE_BYTES,
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  assertBenchmarkEnvelope,
  benchmarkBoundedString,
  benchmarkSerializedBytes,
  normalizeBenchmarkFingerprint,
  normalizeBenchmarkFrame,
  normalizeBenchmarkRange,
  normalizeBenchmarkTracks,
} from "./trackingBenchmarkContract.js";
import { normalizeObjectTrack, trackingPoints } from "../domain/tracking.model.js";

export const TRACKING_PROVIDER_RUN_PROTOCOL = "football-science-tracking-provider-run-v1";
export const TRACKING_PROVIDER_RUN_SUITE_PROTOCOL = "football-science-tracking-provider-run-suite-v1";
export const TRACKING_PROVIDER_CONTRACT_PROTOCOL = "football-science-tracking-stage-v1";
export const MAX_TRACKING_PROVIDER_RUNS_PER_ITEM = 32;
export const MAX_TRACKING_PROVIDER_RUNS_PER_WORKSPACE = 128;
export const MAX_TRACKING_PROVIDER_RUN_WORKSPACE_BYTES = 2 * MAX_TRACKING_BENCHMARK_SUITE_BYTES;

const stageCapabilities = Object.freeze({
  detection: new Set(["detect:player", "detect:ball", "detect:referee"]),
  segmentation: new Set(["segment:selected-object", "propagate:selected-object"]),
  association: new Set(["associate:multi-object"]),
  reidentification: new Set(["reidentify:player"]),
  classification: new Set(["classify:team", "classify:shirt-number"]),
});
const sha256Pattern = /^[a-f0-9]{64}$/i;

export class TrackingProviderRunError extends Error {
  constructor(message, code = "TRACKING_PROVIDER_RUN_INVALID", options = {}) {
    super(message, options);
    this.name = "TrackingProviderRunError";
    this.code = code;
  }
}

function invalid(message, code, options) {
  throw new TrackingProviderRunError(message, code, options);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) invalid(`${label} contains unsupported field ${unexpected[0]}.`);
}

function sha256(value, label) {
  const normalized = benchmarkBoundedString(value, label, 64).toLowerCase();
  if (!sha256Pattern.test(normalized)) invalid(`${label} must be a SHA-256 hash.`);
  return normalized;
}

function positiveDuration(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 24 * 60 * 60 * 1000) {
    invalid(`Invalid ${label}.`);
  }
  return Math.round(number);
}

function providerIdentity(value = {}) {
  exactKeys(value, [
    "providerId", "providerVersion", "protocol", "stage", "capabilities", "executionFingerprintSha256",
  ], "Tracking provider identity");
  const stage = benchmarkBoundedString(value.stage, "tracking provider stage", 40).toLowerCase();
  const protocol = benchmarkBoundedString(value.protocol, "tracking provider protocol", 100);
  const allowed = stageCapabilities[stage];
  if (!allowed) invalid("Tracking provider stage is unsupported.");
  if (protocol !== TRACKING_PROVIDER_CONTRACT_PROTOCOL) {
    invalid("Tracking provider contract protocol is unsupported.");
  }
  if (!Array.isArray(value.capabilities) || !value.capabilities.length) {
    invalid("Tracking provider capabilities are required.");
  }
  const capabilities = [...new Set(value.capabilities.map((capability) => (
    benchmarkBoundedString(capability, "tracking provider capability", 80)
  )))].sort();
  if (capabilities.some((capability) => !allowed.has(capability))) {
    invalid("Tracking provider capability does not belong to its stage.");
  }
  return {
    providerId: benchmarkBoundedString(value.providerId, "tracking provider id", 100),
    providerVersion: benchmarkBoundedString(value.providerVersion, "tracking provider version", 100),
    protocol,
    stage,
    capabilities,
    executionFingerprintSha256: sha256(
      value.executionFingerprintSha256,
      "tracking provider execution fingerprint",
    ),
  };
}

function rawTrackIsAutomatic(trackValue = {}) {
  const track = normalizeObjectTrack(trackValue);
  if (track.corrections.length || trackingPoints(track).some((point) => point.source !== "automatic")) {
    invalid(
      "Provider runs must be captured before analyst corrections.",
      "TRACKING_PROVIDER_RUN_CORRECTED",
    );
  }
  return track;
}

function safePoint(point = {}) {
  return {
    atMs: point.atMs,
    frameIndex: point.frameIndex,
    x: point.x,
    y: point.y,
    width: point.width,
    height: point.height,
    groundPoint: { x: point.groundPoint.x, y: point.groundPoint.y },
    confidence: point.confidence,
    identityConfidence: point.identityConfidence,
    occluded: point.occluded,
    source: "automatic",
  };
}

function safeTrack(trackValue = {}, provider = {}, source = {}, range = {}, options = {}) {
  const track = rawTrackIsAutomatic(trackValue);
  const trackSource = String(track.metadata?.localSourceSha256 || "").toLowerCase();
  const trackAngleId = String(track.metadata?.angleId || "");
  if (options.requireProviderIdentity
    && (track.engine !== provider.providerId || track.engineVersion !== provider.providerVersion)) {
    invalid("Tracking run must declare its exact provider engine and version.");
  }
  if (track.engine && track.engine !== provider.providerId) invalid("Tracking run engine does not match its provider.");
  if (track.engineVersion && track.engineVersion !== provider.providerVersion) {
    invalid("Tracking run engine version does not match its provider.");
  }
  if (trackSource && trackSource !== source.sourceFingerprint) invalid("Tracking run belongs to another video source.");
  if (trackAngleId && source.angleId && trackAngleId !== source.angleId) invalid("Tracking run belongs to another camera angle.");
  return {
    id: track.id,
    entityType: track.entityType,
    playerId: track.playerId,
    playerLabel: track.playerLabel,
    teamId: track.teamId,
    teamSide: track.teamSide,
    shirtNumber: track.shirtNumber,
    status: "review",
    startMs: track.startMs,
    endMs: track.endMs,
    confidence: track.confidence,
    identityConfidence: track.identityConfidence,
    segments: track.segments.map((segment) => ({
      id: segment.id,
      startMs: segment.startMs,
      endMs: segment.endMs,
      confidence: segment.confidence,
      discontinuityBefore: segment.discontinuityBefore,
      points: segment.points.map(safePoint),
    })),
    corrections: [],
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizedRun(value = {}, options = {}) {
  const provider = providerIdentity(value.provider);
  const sourceFingerprint = normalizeBenchmarkFingerprint(value.sourceFingerprint);
  const angleId = String(value.angleId || "").trim().slice(0, 160);
  const frame = normalizeBenchmarkFrame(value.frame);
  const range = normalizeBenchmarkRange(value.range);
  const source = { sourceFingerprint, angleId };
  const rawTracks = Array.isArray(value.tracks) ? value.tracks : [];
  const tracks = normalizeBenchmarkTracks(
    rawTracks.map((track) => safeTrack(track, provider, source, range, options)),
    range,
    "provider prediction tracks",
    true,
  ).map((track) => safeTrack(track, provider, source, range));
  const processingMs = positiveDuration(value.performance?.processingMs, "provider processing time");
  const createdAt = new Date(options.now?.() ?? value.createdAt ?? Date.now()).toISOString();
  const runId = benchmarkBoundedString(
    options.id || value.id || `run-${provider.providerId}-${sourceFingerprint.slice(0, 12)}-${range.startMs}`,
    "tracking provider run id",
    160,
  );
  return {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    protocol: TRACKING_PROVIDER_RUN_PROTOCOL,
    id: runId,
    benchmarkType: provider.stage === "segmentation" ? "selected-object" : "multi-object",
    provider,
    sourceFingerprint,
    sourceEvidence: {
      algorithm: "sha256",
      kind: "exact-local-file-bytes",
      angleId,
    },
    frame,
    range: { startMs: range.startMs, endMs: range.endMs },
    prediction: { tracks },
    performance: {
      processingMs,
      ...(value.performance?.device ? {
        device: benchmarkBoundedString(value.performance.device, "tracking device", 80),
      } : {}),
    },
    createdAt,
  };
}

export function createTrackingProviderRunArtifact(value = {}, options = {}) {
  const artifact = normalizedRun(value, { ...options, requireProviderIdentity: true });
  assertBenchmarkEnvelope(artifact, {
    label: "Tracking provider run",
    maxBytes: MAX_TRACKING_BENCHMARK_CASE_BYTES,
  });
  return deepFreeze(artifact);
}

export function validateTrackingProviderRunArtifact(value = {}) {
  exactKeys(value, [
    "version", "protocol", "id", "benchmarkType", "provider", "sourceFingerprint",
    "sourceEvidence", "frame", "range", "prediction", "performance", "createdAt",
  ], "Tracking provider run");
  if (Number(value.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION
    || value.protocol !== TRACKING_PROVIDER_RUN_PROTOCOL
    || !["selected-object", "multi-object"].includes(value.benchmarkType)
    || value.sourceEvidence?.algorithm !== "sha256"
    || value.sourceEvidence?.kind !== "exact-local-file-bytes"
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid("Tracking provider run protocol is invalid.");
  }
  exactKeys(value.sourceEvidence, ["algorithm", "kind", "angleId"], "Tracking provider source evidence");
  exactKeys(value.prediction, ["tracks"], "Tracking provider prediction");
  exactKeys(value.performance, ["processingMs", "device"], "Tracking provider performance");
  const normalized = normalizedRun({
    ...value,
    angleId: value.sourceEvidence.angleId,
    tracks: value.prediction.tracks,
  }, { id: value.id, now: () => value.createdAt });
  if (normalized.benchmarkType !== value.benchmarkType) invalid("Tracking provider run type does not match its stage.");
  assertBenchmarkEnvelope(normalized, {
    label: "Tracking provider run",
    maxBytes: MAX_TRACKING_BENCHMARK_CASE_BYTES,
  });
  return deepFreeze(normalized);
}

export function trackingProviderRunArtifactJson(value = {}) {
  return `${JSON.stringify(validateTrackingProviderRunArtifact(value), null, 2)}\n`;
}

function sameProvider(first = {}, second = {}) {
  return JSON.stringify(providerIdentity(first)) === JSON.stringify(providerIdentity(second));
}

function runSuiteSummary(runs = []) {
  return {
    runCount: runs.length,
    sourceCount: new Set(runs.map((run) => run.sourceFingerprint)).size,
    rangeCount: new Set(runs.map((run) => [
      run.sourceFingerprint,
      run.sourceEvidence.angleId || "primary",
      run.range.startMs,
      run.range.endMs,
    ].join(":"))).size,
    predictionTrackCount: runs.reduce((total, run) => total + run.prediction.tracks.length, 0),
    processingMs: runs.reduce((total, run) => total + run.performance.processingMs, 0),
  };
}

function normalizedRunSuite(value = {}, options = {}) {
  const rawRuns = Array.isArray(value.runs) ? value.runs : [];
  if (!rawRuns.length || rawRuns.length > 500) invalid("Provider run suite must contain 1-500 runs.");
  const runs = rawRuns.map(validateTrackingProviderRunArtifact).sort((first, second) => (
    first.sourceFingerprint.localeCompare(second.sourceFingerprint)
    || first.range.startMs - second.range.startMs
    || first.range.endMs - second.range.endMs
    || first.id.localeCompare(second.id)
  ));
  const ids = new Set();
  for (const run of runs) {
    if (ids.has(run.id)) invalid("Provider run ids must be unique.");
    ids.add(run.id);
    if (!sameProvider(run.provider, runs[0].provider)) invalid("One provider run suite must use one exact provider build.");
  }
  const createdAt = new Date(options.now?.() ?? value.createdAt ?? Date.now()).toISOString();
  return {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    protocol: TRACKING_PROVIDER_RUN_SUITE_PROTOCOL,
    id: benchmarkBoundedString(options.id || value.id || "fs-player-provider-runs", "provider run suite id", 160),
    provider: { ...runs[0].provider, capabilities: [...runs[0].provider.capabilities] },
    createdAt,
    summary: runSuiteSummary(runs),
    runs,
  };
}

export function createTrackingProviderRunSuiteArtifact(value = {}, options = {}) {
  const artifact = normalizedRunSuite(value, options);
  assertBenchmarkEnvelope(artifact, {
    label: "Tracking provider run suite",
    maxBytes: MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  });
  return deepFreeze(artifact);
}

export function validateTrackingProviderRunSuiteArtifact(value = {}) {
  exactKeys(value, ["version", "protocol", "id", "provider", "createdAt", "summary", "runs"], "Provider run suite");
  exactKeys(value.summary, [
    "runCount", "sourceCount", "rangeCount", "predictionTrackCount", "processingMs",
  ], "Provider run suite summary");
  if (Number(value.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION
    || value.protocol !== TRACKING_PROVIDER_RUN_SUITE_PROTOCOL
    || !Number.isFinite(Date.parse(value.createdAt))) {
    invalid("Provider run suite protocol is invalid.");
  }
  const normalized = normalizedRunSuite(value, { id: value.id, now: () => value.createdAt });
  if (!sameProvider(value.provider, normalized.provider)
    || Object.keys(normalized.summary).some((key) => Number(value.summary[key]) !== normalized.summary[key])) {
    invalid("Provider run suite summary does not match its runs.", "TRACKING_PROVIDER_RUN_SUITE_MISMATCH");
  }
  assertBenchmarkEnvelope(normalized, {
    label: "Tracking provider run suite",
    maxBytes: MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  });
  return deepFreeze(normalized);
}

export function trackingProviderRunSuiteArtifactJson(value = {}) {
  return `${JSON.stringify(validateTrackingProviderRunSuiteArtifact(value), null, 2)}\n`;
}

export function trackingProviderRunWorkspaceEntry(value = {}) {
  return {
    byItemId: value.byItemId && typeof value.byItemId === "object" && !Array.isArray(value.byItemId)
      ? value.byItemId
      : {},
    downloadedAt: String(value.downloadedAt || ""),
    error: String(value.error || ""),
  };
}

export function trackingProviderRunsForItem(value = {}, itemId = "") {
  const workspace = trackingProviderRunWorkspaceEntry(value);
  const runs = workspace.byItemId[String(itemId || "")];
  return Array.isArray(runs) ? runs.map(validateTrackingProviderRunArtifact) : [];
}

export function trackingProviderRunsForProvider(value = {}, providerValue = {}) {
  const providerId = providerValue.providerId || providerValue.id;
  if (!providerId) return [];
  const provider = providerIdentity({
    providerId,
    providerVersion: providerValue.providerVersion || providerValue.version,
    protocol: providerValue.protocol,
    stage: providerValue.stage,
    capabilities: providerValue.capabilities,
    executionFingerprintSha256: providerValue.executionFingerprintSha256,
  });
  const workspace = trackingProviderRunWorkspaceEntry(value);
  return Object.values(workspace.byItemId).flatMap((entries) => (
    Array.isArray(entries) ? entries.map(validateTrackingProviderRunArtifact) : []
  )).filter((run) => sameProvider(run.provider, provider));
}

export function addTrackingProviderRun(value = {}, itemId = "", runValue = {}) {
  const workspace = trackingProviderRunWorkspaceEntry(value);
  const key = benchmarkBoundedString(itemId, "tracking item id", 160);
  const run = validateTrackingProviderRunArtifact(runValue);
  const existing = trackingProviderRunsForItem(workspace, key).filter((entry) => entry.id !== run.id);
  if (existing.length >= MAX_TRACKING_PROVIDER_RUNS_PER_ITEM) {
    invalid(
      `One benchmark item cannot retain more than ${MAX_TRACKING_PROVIDER_RUNS_PER_ITEM} raw provider runs.`,
      "TRACKING_PROVIDER_RUN_LIMIT",
    );
  }
  const byItemId = {
    ...workspace.byItemId,
    [key]: [...existing, run],
  };
  const allRuns = Object.values(byItemId).flatMap((entries) => (Array.isArray(entries) ? entries : []));
  if (allRuns.length > MAX_TRACKING_PROVIDER_RUNS_PER_WORKSPACE
    || benchmarkSerializedBytes(byItemId, "Provider run workspace") > MAX_TRACKING_PROVIDER_RUN_WORKSPACE_BYTES) {
    invalid(
      "The local provider-run workspace is full. Export evidence before tracking more benchmark runs.",
      "TRACKING_PROVIDER_RUN_WORKSPACE_LIMIT",
    );
  }
  return {
    byItemId,
    downloadedAt: "",
    error: "",
  };
}
