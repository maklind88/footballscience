import { normalizeObjectTrack } from "../domain/tracking.model.js";

export const TRACKING_BENCHMARK_SCHEMA_VERSION = 1;
export const TRACKING_BENCHMARK_EVALUATOR_VERSION = "tracking-benchmark-v1";
export const TRACKING_PROVIDER_RUN_EVIDENCE_PROTOCOL = "football-science-tracking-provider-run-evidence-v1";
export const MAX_TRACKING_BENCHMARK_CASE_BYTES = 8 * 1024 * 1024;
export const MAX_TRACKING_BENCHMARK_SUITE_BYTES = 64 * 1024 * 1024;

const MAX_CASE_DURATION_MS = 30 * 60 * 1000;
const MAX_TRACK_POINTS = 100_000;
const MAX_TRACK_COLLECTION_POINTS = 500_000;
const MAX_TRACK_SEGMENTS = 10_000;
const MAX_TRACKS = 1000;
const unsafeKeyPattern = /(?:path|url|uri)$|(?:blob|base64|buffer|bytes|rawvideo|videodata)|^frames$/i;
const unsafeValuePattern = /^(?:file:|blob:|data:|https?:\/\/|\/|~\/|[a-z]:[\\/])/i;
const relativeMediaPattern = /(?:^|[\\/])[^\\/]+\.(?:mp4|mov|mkv|avi|webm|mxf|mts|m2ts)$/i;

export class TrackingBenchmarkError extends Error {
  constructor(message, code = "TRACKING_BENCHMARK_INVALID", options = {}) {
    super(message, options);
    this.name = "TrackingBenchmarkError";
    this.code = code;
  }
}

export function benchmarkInvalid(message, code) {
  throw new TrackingBenchmarkError(message, code);
}

export function benchmarkFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) benchmarkInvalid(`Invalid ${label}.`);
  return number;
}

export function benchmarkBoundedString(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) benchmarkInvalid(`Invalid ${label}.`);
  return text;
}

export function assertBenchmarkMetadataOnly(value, trail = "benchmark", depth = 0) {
  if (depth > 20) benchmarkInvalid("Benchmark input is too deeply nested.", "TRACKING_BENCHMARK_LIMIT");
  if (typeof value === "string") {
    if (value.length > 4096) benchmarkInvalid(`Oversized text at ${trail}.`, "TRACKING_BENCHMARK_LIMIT");
    if (unsafeValuePattern.test(value.trim()) || relativeMediaPattern.test(value.trim())) {
      benchmarkInvalid(
        `Local or remote media references are forbidden at ${trail}.`,
        "TRACKING_BENCHMARK_MEDIA_FORBIDDEN",
      );
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > MAX_TRACK_POINTS) benchmarkInvalid(`Oversized array at ${trail}.`, "TRACKING_BENCHMARK_LIMIT");
    value.forEach((entry, index) => assertBenchmarkMetadataOnly(entry, `${trail}[${index}]`, depth + 1));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (unsafeKeyPattern.test(key)) {
      benchmarkInvalid(`Media field ${trail}.${key} is forbidden.`, "TRACKING_BENCHMARK_MEDIA_FORBIDDEN");
    }
    assertBenchmarkMetadataOnly(entry, `${trail}.${key}`, depth + 1);
  }
}

export function benchmarkSerializedBytes(value, label = "Benchmark document") {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    benchmarkInvalid(`${label} must be serializable.`);
  }
  return new TextEncoder().encode(serialized).byteLength;
}

export function assertBenchmarkEnvelope(value, options = {}) {
  const label = options.label || "Benchmark case";
  const maxBytes = Number(options.maxBytes) || MAX_TRACKING_BENCHMARK_CASE_BYTES;
  if (benchmarkSerializedBytes(value, label) > maxBytes) {
    benchmarkInvalid(`${label} is too large.`, "TRACKING_BENCHMARK_LIMIT");
  }
  assertBenchmarkMetadataOnly(value);
  if (Number(value?.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION) {
    benchmarkInvalid(`Unsupported ${label.toLowerCase()} schema version.`);
  }
}

function unit(value, label, options = {}) {
  const number = benchmarkFinite(value, label);
  const minimum = options.positive ? Number.EPSILON : 0;
  if (number < minimum || number > 1) benchmarkInvalid(`${label} must be between ${minimum} and 1.`);
  return number;
}

function rawCoordinate(point, aliases, label, options) {
  const value = aliases.reduce((found, key) => found ?? point[key], undefined);
  return unit(value, label, options);
}

function validateRawPoint(point = {}, range = {}, label = "tracking point", requireConfidence = false) {
  const atMs = Math.round(benchmarkFinite(point.atMs ?? point.at_ms, `${label} time`));
  if (atMs < range.startMs || atMs > range.endMs) benchmarkInvalid(`${label} is outside the benchmark range.`);
  const x = rawCoordinate(point, ["x", "centerX", "center_x"], `${label} x`);
  const y = rawCoordinate(point, ["y", "centerY", "center_y"], `${label} y`);
  const width = rawCoordinate(point, ["width", "w"], `${label} width`, { positive: true });
  const height = rawCoordinate(point, ["height", "h"], `${label} height`, { positive: true });
  if (x - (width / 2) < -0.0001 || x + (width / 2) > 1.0001
    || y - (height / 2) < -0.0001 || y + (height / 2) > 1.0001) {
    benchmarkInvalid(`${label} box leaves the normalized video frame.`);
  }
  if (point.groundX !== undefined || point.ground_x !== undefined || point.groundPoint) {
    unit(point.groundX ?? point.ground_x ?? point.groundPoint?.x, `${label} ground x`);
    unit(point.groundY ?? point.ground_y ?? point.groundPoint?.y, `${label} ground y`);
  }
  if (requireConfidence) {
    unit(point.confidence ?? point.detectionConfidence ?? point.detection_confidence, `${label} confidence`);
  }
  return atMs;
}

export function normalizeBenchmarkTrack(value = {}, range = {}, label = "track", requireConfidence = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) benchmarkInvalid(`Missing ${label}.`);
  const segments = Array.isArray(value.segments) ? value.segments : [];
  if (!segments.length || segments.length > MAX_TRACK_SEGMENTS) benchmarkInvalid(`Invalid ${label} segment count.`);
  let previousEndMs = null;
  let pointCount = 0;
  segments.forEach((segment, segmentIndex) => {
    const points = Array.isArray(segment.points || segment.samples) ? (segment.points || segment.samples) : [];
    if (!points.length) benchmarkInvalid(`${label} segment ${segmentIndex + 1} has no points.`);
    let previousAtMs = null;
    points.forEach((point, pointIndex) => {
      const atMs = validateRawPoint(point, range, `${label} point ${pointIndex + 1}`, requireConfidence);
      if (previousAtMs !== null && atMs <= previousAtMs) benchmarkInvalid(`${label} points must be strictly ordered.`);
      previousAtMs = atMs;
    });
    const firstPoint = points[0];
    const lastPoint = points.at(-1);
    const startMs = Math.round(benchmarkFinite(
      segment.startMs ?? segment.start_ms ?? firstPoint.atMs ?? firstPoint.at_ms,
      `${label} segment start`,
    ));
    const endMs = Math.round(benchmarkFinite(
      segment.endMs ?? segment.end_ms ?? lastPoint.atMs ?? lastPoint.at_ms,
      `${label} segment end`,
    ));
    if (startMs < range.startMs || endMs > range.endMs || endMs < startMs) {
      benchmarkInvalid(`${label} segment range is invalid.`);
    }
    const firstPointMs = Math.round(Number(firstPoint.atMs ?? firstPoint.at_ms));
    const lastPointMs = Math.round(Number(lastPoint.atMs ?? lastPoint.at_ms));
    if (firstPointMs < startMs || lastPointMs > endMs) benchmarkInvalid(`${label} points leave their continuity segment.`);
    if (previousEndMs !== null && startMs <= previousEndMs) benchmarkInvalid(`${label} segments must not overlap.`);
    previousEndMs = endMs;
    pointCount += points.length;
  });
  if (pointCount > MAX_TRACK_POINTS) benchmarkInvalid(`${label} has too many points.`, "TRACKING_BENCHMARK_LIMIT");
  return normalizeObjectTrack(value);
}

export function normalizeBenchmarkTracks(values, range, label, requireConfidence = false) {
  if (!Array.isArray(values) || !values.length || values.length > MAX_TRACKS) {
    benchmarkInvalid(`${label} must contain 1-${MAX_TRACKS} tracks.`);
  }
  const tracks = values.map((value, index) => normalizeBenchmarkTrack(
    value,
    range,
    `${label} ${index + 1}`,
    requireConfidence,
  ));
  const ids = new Set();
  let pointCount = 0;
  for (const track of tracks) {
    const id = benchmarkBoundedString(track.id, `${label} track id`, 160);
    if (ids.has(id)) benchmarkInvalid(`${label} track ids must be unique.`);
    ids.add(id);
    pointCount += track.segments.reduce((total, segment) => total + segment.points.length, 0);
  }
  if (pointCount > MAX_TRACK_COLLECTION_POINTS) {
    benchmarkInvalid(`${label} has too many total points.`, "TRACKING_BENCHMARK_LIMIT");
  }
  return tracks;
}

export function normalizeBenchmarkFingerprint(value) {
  const fingerprint = benchmarkBoundedString(value, "source fingerprint", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) benchmarkInvalid("Source fingerprint must be a SHA-256 hash.");
  return fingerprint;
}

function exactObjectKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) benchmarkInvalid(`${label} must be an object.`);
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) benchmarkInvalid(`${label} contains unsupported field ${unsupported[0]}.`);
}

function normalizeProviderExecutionProfile(value = {}, runCount = 0) {
  exactObjectKeys(value, [
    "device", "runtimeMode", "cpuThreads", "sampleFps", "modelResident",
    "runCount", "workerReusedRunCount",
  ], "Provider execution profile");
  const cpuThreads = Number(value.cpuThreads);
  const sampleFps = Number(value.sampleFps);
  const declaredRunCount = Number(value.runCount);
  const workerReusedRunCount = Number(value.workerReusedRunCount);
  if (typeof value.cpuThreads !== "number"
    || !Number.isSafeInteger(cpuThreads) || cpuThreads < 0 || cpuThreads > 256
    || typeof value.sampleFps !== "number"
    || !Number.isFinite(sampleFps) || sampleFps <= 0 || sampleFps > 240
    || typeof value.modelResident !== "boolean"
    || !Number.isSafeInteger(declaredRunCount) || declaredRunCount !== runCount
    || !Number.isSafeInteger(workerReusedRunCount)
    || workerReusedRunCount < 0 || workerReusedRunCount > declaredRunCount
    || (!value.modelResident && workerReusedRunCount > 0)) {
    benchmarkInvalid("Provider execution profile is invalid.");
  }
  return {
    device: benchmarkBoundedString(value.device, "provider execution device", 80),
    runtimeMode: benchmarkBoundedString(value.runtimeMode, "provider runtime mode", 100),
    cpuThreads,
    sampleFps,
    modelResident: value.modelResident,
    runCount: declaredRunCount,
    workerReusedRunCount,
  };
}

export function normalizeBenchmarkProviderRunEvidence(value = {}) {
  exactObjectKeys(value, [
    "protocol", "provider", "groundTruthSuiteId", "groundTruthSuiteSha256",
    "providerRunSuiteId", "providerRunSuiteSha256", "runIds", "executionProfile",
  ], "Provider run evidence");
  if (value.protocol !== TRACKING_PROVIDER_RUN_EVIDENCE_PROTOCOL) {
    benchmarkInvalid("Provider run evidence protocol is invalid.");
  }
  exactObjectKeys(value.provider, [
    "providerId", "providerVersion", "protocol", "stage", "capabilities", "executionFingerprintSha256",
  ], "Provider run evidence identity");
  const stage = benchmarkBoundedString(value.provider.stage, "provider run stage", 40).toLowerCase();
  if (!["detection", "segmentation", "association", "reidentification", "classification"].includes(stage)) {
    benchmarkInvalid("Provider run evidence stage is invalid.");
  }
  if (!Array.isArray(value.provider.capabilities) || !value.provider.capabilities.length) {
    benchmarkInvalid("Provider run evidence capabilities are required.");
  }
  const capabilities = [...new Set(value.provider.capabilities.map((capability) => (
    benchmarkBoundedString(capability, "provider run capability", 80)
  )))].sort();
  const runIds = Array.isArray(value.runIds)
    ? value.runIds.map((runId) => benchmarkBoundedString(runId, "provider run id", 160))
    : [];
  if (!runIds.length || runIds.length > 500 || new Set(runIds).size !== runIds.length) {
    benchmarkInvalid("Provider run evidence requires 1-500 unique run ids.");
  }
  return {
    protocol: TRACKING_PROVIDER_RUN_EVIDENCE_PROTOCOL,
    provider: {
      providerId: benchmarkBoundedString(value.provider.providerId, "provider run id", 100),
      providerVersion: benchmarkBoundedString(value.provider.providerVersion, "provider run version", 100),
      protocol: benchmarkBoundedString(value.provider.protocol, "provider run protocol", 100),
      stage,
      capabilities,
      executionFingerprintSha256: normalizeBenchmarkFingerprint(
        value.provider.executionFingerprintSha256,
      ),
    },
    groundTruthSuiteId: benchmarkBoundedString(value.groundTruthSuiteId, "ground-truth suite id", 160),
    groundTruthSuiteSha256: normalizeBenchmarkFingerprint(value.groundTruthSuiteSha256),
    providerRunSuiteId: benchmarkBoundedString(value.providerRunSuiteId, "provider run suite id", 160),
    providerRunSuiteSha256: normalizeBenchmarkFingerprint(value.providerRunSuiteSha256),
    runIds: runIds.slice().sort(),
    executionProfile: normalizeProviderExecutionProfile(value.executionProfile, runIds.length),
  };
}

export function normalizeBenchmarkFrame(value = {}) {
  const width = Math.round(benchmarkFinite(value.width, "frame width"));
  const height = Math.round(benchmarkFinite(value.height, "frame height"));
  if (width < 1 || width > 16_384 || height < 1 || height > 16_384) {
    benchmarkInvalid("Frame dimensions are outside supported bounds.");
  }
  return { width, height };
}

export function normalizeBenchmarkRange(value = {}) {
  const startMs = Math.max(0, Math.round(benchmarkFinite(value.startMs, "range start")));
  const endMs = Math.round(benchmarkFinite(value.endMs, "range end"));
  if (endMs <= startMs || endMs - startMs > MAX_CASE_DURATION_MS) {
    benchmarkInvalid("Benchmark range is empty or too long.");
  }
  return { startMs, endMs, durationMs: endMs - startMs };
}

export function normalizedTrackingIdentity(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function trackingIdentityKey(track = {}) {
  if (track.playerId) return `player:${normalizedTrackingIdentity(track.playerId)}`;
  if (track.teamId && track.shirtNumber) {
    return `shirt:${normalizedTrackingIdentity(track.teamId)}:${normalizedTrackingIdentity(track.shirtNumber)}`;
  }
  if (track.playerLabel) return `label:${normalizedTrackingIdentity(track.playerLabel)}`;
  return "";
}

export function trackingClassificationAccuracy(truth = "", prediction = "") {
  const expected = normalizedTrackingIdentity(truth);
  if (!expected) return null;
  return expected === normalizedTrackingIdentity(prediction) ? 1 : 0;
}
