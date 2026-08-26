import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  maximumTrackingGapMs,
  mean,
  normalizedPointDistance,
  percentile,
  pixelPointDistance,
  sampleTrackAt,
  trackingBoxIou,
  trackingContinuityBreaks,
} from "./trackingBenchmarkMetrics.js";

export const TRACKING_BENCHMARK_SCHEMA_VERSION = 1;
export const TRACKING_BENCHMARK_EVALUATOR_VERSION = "tracking-benchmark-v1";

const MAX_CASE_BYTES = 8 * 1024 * 1024;
const MAX_CASE_DURATION_MS = 30 * 60 * 1000;
const MAX_TRACK_POINTS = 100_000;
const MAX_TRACK_SEGMENTS = 10_000;
const unsafeKeyPattern = /(?:path|url|uri)$|(?:blob|base64|buffer|bytes|rawvideo|videodata)|^frames$/i;
const unsafeValuePattern = /^(?:file:|blob:|data:|https?:\/\/|\/|~\/|[a-z]:[\\/])/i;
const relativeMediaPattern = /(?:^|[\\/])[^\\/]+\.(?:mp4|mov|mkv|avi|webm|mxf|mts|m2ts)$/i;

export const TRACKING_BENCHMARK_PROFILES = Object.freeze({
  "selected-player-pilot-v1": Object.freeze({
    description: "Calibratable starting gate for one prompted, visible player in tactical match video.",
    sampling: Object.freeze({
      maxInterpolationGapMs: 500,
      maxSampleDeltaMs: 100,
      successIou: 0.5,
    }),
    thresholds: Object.freeze({
      minVisibleCoverage: 0.95,
      minMeanIou: 0.65,
      minP10Iou: 0.4,
      maxP95CenterError: 0.04,
      maxP95GroundError: 0.05,
      maxContinuityBreaks: 2,
      maxGapMs: 1000,
      maxCorrectionsPerMinute: 4,
      minEntityTypeAccuracy: 1,
      minTeamAccuracy: 1,
      minIdentityAccuracy: 1,
      maxDetectionBrierScore: 0.2,
      maxRealtimeFactor: 1,
    }),
  }),
});

const thresholdRules = Object.freeze([
  ["minVisibleCoverage", "visibleCoverage", "minimum"],
  ["minMeanIou", "meanIou", "minimum"],
  ["minP10Iou", "p10Iou", "minimum"],
  ["maxP95CenterError", "p95CenterError", "maximum"],
  ["maxP95GroundError", "p95GroundError", "maximum"],
  ["maxContinuityBreaks", "continuityBreaks", "maximum"],
  ["maxGapMs", "maxGapMs", "maximum"],
  ["maxCorrectionsPerMinute", "correctionsPerMinute", "maximum"],
  ["minEntityTypeAccuracy", "entityTypeAccuracy", "minimum"],
  ["minTeamAccuracy", "teamAccuracy", "minimum"],
  ["minIdentityAccuracy", "identityAccuracy", "minimum"],
  ["maxDetectionBrierScore", "detectionBrierScore", "maximum"],
  ["maxRealtimeFactor", "realtimeFactor", "maximum"],
]);

export class TrackingBenchmarkError extends Error {
  constructor(message, code = "TRACKING_BENCHMARK_INVALID") {
    super(message);
    this.name = "TrackingBenchmarkError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingBenchmarkError(message, code);
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) invalid(`Invalid ${label}.`);
  return number;
}

function boundedString(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function assertMetadataOnly(value, trail = "benchmark", depth = 0) {
  if (depth > 20) invalid("Benchmark input is too deeply nested.", "TRACKING_BENCHMARK_LIMIT");
  if (typeof value === "string") {
    if (value.length > 4096) invalid(`Oversized text at ${trail}.`, "TRACKING_BENCHMARK_LIMIT");
    if (unsafeValuePattern.test(value.trim()) || relativeMediaPattern.test(value.trim())) {
      invalid(`Local or remote media references are forbidden at ${trail}.`, "TRACKING_BENCHMARK_MEDIA_FORBIDDEN");
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > MAX_TRACK_POINTS) invalid(`Oversized array at ${trail}.`, "TRACKING_BENCHMARK_LIMIT");
    value.forEach((entry, index) => assertMetadataOnly(entry, `${trail}[${index}]`, depth + 1));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (unsafeKeyPattern.test(key)) {
      invalid(`Media field ${trail}.${key} is forbidden.`, "TRACKING_BENCHMARK_MEDIA_FORBIDDEN");
    }
    assertMetadataOnly(entry, `${trail}.${key}`, depth + 1);
  }
}

function unit(value, label, options = {}) {
  const number = finite(value, label);
  const minimum = options.positive ? Number.EPSILON : 0;
  if (number < minimum || number > 1) invalid(`${label} must be between ${minimum} and 1.`);
  return number;
}

function rawCoordinate(point, aliases, label, options) {
  const value = aliases.reduce((found, key) => found ?? point[key], undefined);
  return unit(value, label, options);
}

function validateRawPoint(point = {}, range = {}, label = "tracking point", requireConfidence = false) {
  const atMs = Math.round(finite(point.atMs ?? point.at_ms, `${label} time`));
  if (atMs < range.startMs || atMs > range.endMs) invalid(`${label} is outside the benchmark range.`);
  const x = rawCoordinate(point, ["x", "centerX", "center_x"], `${label} x`);
  const y = rawCoordinate(point, ["y", "centerY", "center_y"], `${label} y`);
  const width = rawCoordinate(point, ["width", "w"], `${label} width`, { positive: true });
  const height = rawCoordinate(point, ["height", "h"], `${label} height`, { positive: true });
  if (x - (width / 2) < -0.0001 || x + (width / 2) > 1.0001
    || y - (height / 2) < -0.0001 || y + (height / 2) > 1.0001) {
    invalid(`${label} box leaves the normalized video frame.`);
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

function validateRawTrack(value = {}, range = {}, label = "track", requireConfidence = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`Missing ${label}.`);
  const segments = Array.isArray(value.segments) ? value.segments : [];
  if (!segments.length || segments.length > MAX_TRACK_SEGMENTS) invalid(`Invalid ${label} segment count.`);
  let previousEndMs = null;
  let pointCount = 0;
  segments.forEach((segment, segmentIndex) => {
    const points = Array.isArray(segment.points || segment.samples) ? (segment.points || segment.samples) : [];
    if (!points.length) invalid(`${label} segment ${segmentIndex + 1} has no points.`);
    let previousAtMs = null;
    points.forEach((point, pointIndex) => {
      const atMs = validateRawPoint(point, range, `${label} point ${pointIndex + 1}`, requireConfidence);
      if (previousAtMs !== null && atMs <= previousAtMs) invalid(`${label} points must be strictly ordered.`);
      previousAtMs = atMs;
    });
    const startMs = Math.round(finite(segment.startMs ?? segment.start_ms ?? points[0].atMs ?? points[0].at_ms, `${label} segment start`));
    const endPoint = points.at(-1);
    const endMs = Math.round(finite(segment.endMs ?? segment.end_ms ?? endPoint.atMs ?? endPoint.at_ms, `${label} segment end`));
    if (startMs < range.startMs || endMs > range.endMs || endMs < startMs) invalid(`${label} segment range is invalid.`);
    const firstPointMs = Math.round(Number(points[0].atMs ?? points[0].at_ms));
    const lastPointMs = Math.round(Number(endPoint.atMs ?? endPoint.at_ms));
    if (firstPointMs < startMs || lastPointMs > endMs) invalid(`${label} points leave their continuity segment.`);
    if (previousEndMs !== null && startMs <= previousEndMs) invalid(`${label} segments must not overlap.`);
    previousEndMs = endMs;
    pointCount += points.length;
  });
  if (pointCount > MAX_TRACK_POINTS) invalid(`${label} has too many points.`, "TRACKING_BENCHMARK_LIMIT");
  return normalizeObjectTrack(value);
}

function normalizeFingerprint(value) {
  const fingerprint = boundedString(value, "source fingerprint", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) invalid("Source fingerprint must be a SHA-256 hash.");
  return fingerprint;
}

function normalizeFrame(value = {}) {
  const width = Math.round(finite(value.width, "frame width"));
  const height = Math.round(finite(value.height, "frame height"));
  if (width < 1 || width > 16_384 || height < 1 || height > 16_384) invalid("Frame dimensions are outside supported bounds.");
  return { width, height };
}

function normalizeRange(value = {}) {
  const startMs = Math.max(0, Math.round(finite(value.startMs, "range start")));
  const endMs = Math.round(finite(value.endMs, "range end"));
  if (endMs <= startMs || endMs - startMs > MAX_CASE_DURATION_MS) invalid("Benchmark range is empty or too long.");
  return { startMs, endMs, durationMs: endMs - startMs };
}

function profileFor(value = {}) {
  const profileId = boundedString(value.profileId, "benchmark profile", 80);
  const profile = TRACKING_BENCHMARK_PROFILES[profileId];
  if (!profile) invalid(`Unsupported benchmark profile: ${profileId}.`);
  const overrides = value.thresholds && typeof value.thresholds === "object" ? value.thresholds : {};
  const unknown = Object.keys(overrides).filter((key) => !thresholdRules.some(([name]) => name === key));
  if (unknown.length) invalid(`Unknown benchmark threshold: ${unknown[0]}.`);
  const thresholds = { ...profile.thresholds };
  for (const [key, entry] of Object.entries(overrides)) {
    if (entry === null) {
      thresholds[key] = null;
      continue;
    }
    const number = finite(entry, `threshold ${key}`);
    if (number < 0) invalid(`Threshold ${key} cannot be negative.`);
    if ((key.startsWith("min") || key === "maxDetectionBrierScore") && number > 1) {
      invalid(`Threshold ${key} cannot exceed 1.`);
    }
    thresholds[key] = number;
  }
  const samplingOverrides = value.sampling && typeof value.sampling === "object" ? value.sampling : {};
  const samplingKeys = ["maxInterpolationGapMs", "maxSampleDeltaMs", "successIou"];
  const unknownSampling = Object.keys(samplingOverrides).filter((key) => !samplingKeys.includes(key));
  if (unknownSampling.length) invalid(`Unknown benchmark sampling option: ${unknownSampling[0]}.`);
  const sampling = { ...profile.sampling };
  for (const [key, entry] of Object.entries(samplingOverrides)) {
    const number = finite(entry, `sampling option ${key}`);
    if (number < 0 || (key === "successIou" && number > 1)) invalid(`Invalid sampling option ${key}.`);
    sampling[key] = number;
  }
  return {
    id: profileId,
    description: profile.description,
    sampling,
    thresholds,
  };
}

function normalizedIdentity(value = "") {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

function identityKey(track = {}) {
  if (track.playerId) return `player:${normalizedIdentity(track.playerId)}`;
  if (track.teamId && track.shirtNumber) {
    return `shirt:${normalizedIdentity(track.teamId)}:${normalizedIdentity(track.shirtNumber)}`;
  }
  if (track.playerLabel) return `label:${normalizedIdentity(track.playerLabel)}`;
  return "";
}

function classificationAccuracy(truth = "", prediction = "") {
  const expected = normalizedIdentity(truth);
  if (!expected) return null;
  return expected === normalizedIdentity(prediction) ? 1 : 0;
}

function benchmarkSamples(truth, prediction, range, frame, sampling) {
  const truthPoints = truth.segments.flatMap((segment) => segment.points).filter((point) => !point.occluded);
  if (!truthPoints.length) invalid("Ground truth has no visible samples.");
  return truthPoints.map((truthPoint) => {
    const predictedPoint = sampleTrackAt(prediction, truthPoint.atMs, sampling);
    if (!predictedPoint) return { atMs: truthPoint.atMs, matched: false };
    const iou = trackingBoxIou(truthPoint, predictedPoint);
    const centerError = normalizedPointDistance(truthPoint, predictedPoint);
    const groundError = normalizedPointDistance(truthPoint.groundPoint, predictedPoint.groundPoint);
    return {
      atMs: truthPoint.atMs,
      matched: true,
      iou,
      centerError,
      centerErrorPx: pixelPointDistance(truthPoint, predictedPoint, frame),
      groundError,
      groundErrorPx: pixelPointDistance(truthPoint.groundPoint, predictedPoint.groundPoint, frame),
      confidence: predictedPoint.confidence,
      detectionError: (predictedPoint.confidence - (iou >= sampling.successIou ? 1 : 0)) ** 2,
    };
  });
}

function metricSummary(samples, truth, prediction, range, frame, performance = {}) {
  const matched = samples.filter((sample) => sample.matched);
  const values = (key) => matched.map((sample) => sample[key]);
  const durationMinutes = range.durationMs / 60_000;
  const processingMs = performance.processingMs === undefined
    ? null
    : Math.max(0, finite(performance.processingMs, "processing time"));
  return {
    visibleGroundTruthSamples: samples.length,
    matchedSamples: matched.length,
    visibleCoverage: matched.length / samples.length,
    meanIou: mean(values("iou")),
    medianIou: percentile(values("iou"), 0.5),
    p10Iou: percentile(values("iou"), 0.1),
    meanCenterError: mean(values("centerError")),
    p95CenterError: percentile(values("centerError"), 0.95),
    p95CenterErrorPx: percentile(values("centerErrorPx"), 0.95),
    meanGroundError: mean(values("groundError")),
    p95GroundError: percentile(values("groundError"), 0.95),
    p95GroundErrorPx: percentile(values("groundErrorPx"), 0.95),
    continuityBreaks: trackingContinuityBreaks(prediction, range),
    maxGapMs: maximumTrackingGapMs(prediction, range),
    correctionsPerMinute: prediction.corrections.length / durationMinutes,
    entityTypeAccuracy: classificationAccuracy(truth.entityType, prediction.entityType),
    teamAccuracy: classificationAccuracy(truth.teamId || truth.teamSide, prediction.teamId || prediction.teamSide),
    identityAccuracy: classificationAccuracy(identityKey(truth), identityKey(prediction)),
    meanDetectionConfidence: mean(values("confidence")),
    detectionBrierScore: mean(values("detectionError")),
    processingMs,
    realtimeFactor: processingMs === null ? null : processingMs / range.durationMs,
  };
}

function thresholdFailures(metrics, thresholds) {
  return thresholdRules.flatMap(([thresholdName, metricName, direction]) => {
    const threshold = thresholds[thresholdName];
    if (threshold === null) return [];
    const actual = metrics[metricName];
    if (actual === null || actual === undefined) {
      return [{ metric: metricName, threshold: thresholdName, expected: threshold, actual: null, reason: "missing-metric" }];
    }
    const passes = direction === "minimum" ? actual >= threshold : actual <= threshold;
    return passes ? [] : [{ metric: metricName, threshold: thresholdName, expected: threshold, actual, reason: direction }];
  });
}

function worstSamples(samples = []) {
  return samples.filter((sample) => sample.matched)
    .sort((first, second) => first.iou - second.iou || second.centerError - first.centerError)
    .slice(0, 10)
    .map(({ atMs, iou, centerError, groundError, confidence }) => ({
      atMs,
      iou,
      centerError,
      groundError,
      confidence,
    }));
}

export function evaluateTrackingBenchmarkCase(value = {}) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid("Benchmark case must be serializable.");
  }
  const serializedBytes = new TextEncoder().encode(serialized).byteLength;
  if (serializedBytes > MAX_CASE_BYTES) invalid("Benchmark case is too large.", "TRACKING_BENCHMARK_LIMIT");
  assertMetadataOnly(value);
  if (Number(value.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION) invalid("Unsupported benchmark schema version.");

  const id = boundedString(value.id, "benchmark id", 120);
  const sourceFingerprint = normalizeFingerprint(value.sourceFingerprint);
  const frame = normalizeFrame(value.frame);
  const range = normalizeRange(value.range);
  const profile = profileFor(value);
  const groundTruth = validateRawTrack(value.groundTruth?.track, range, "ground-truth track");
  const prediction = validateRawTrack(value.prediction?.track, range, "prediction track", true);
  const samples = benchmarkSamples(groundTruth, prediction, range, frame, profile.sampling);
  const metrics = metricSummary(samples, groundTruth, prediction, range, frame, value.performance);
  const failures = thresholdFailures(metrics, profile.thresholds);

  return {
    schemaVersion: TRACKING_BENCHMARK_SCHEMA_VERSION,
    evaluatorVersion: TRACKING_BENCHMARK_EVALUATOR_VERSION,
    benchmarkId: id,
    sourceFingerprint,
    frame,
    profile: { id: profile.id, description: profile.description },
    range,
    metrics,
    thresholds: profile.thresholds,
    worstSamples: worstSamples(samples),
    verdict: { passed: failures.length === 0, failureCount: failures.length, failures },
  };
}

export function evaluateTrackingBenchmarkSuite(value = {}) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid("Benchmark suite must be serializable.");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_CASE_BYTES * 4) {
    invalid("Benchmark suite is too large.", "TRACKING_BENCHMARK_LIMIT");
  }
  assertMetadataOnly(value);
  if (Number(value.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION) invalid("Unsupported benchmark suite version.");
  const suiteId = boundedString(value.id, "benchmark suite id", 120);
  const cases = Array.isArray(value.cases) ? value.cases : [];
  if (!cases.length || cases.length > 100) invalid("Benchmark suite must contain 1-100 cases.");
  const reports = cases.map(evaluateTrackingBenchmarkCase);
  const visibleSamples = reports.reduce((total, report) => total + report.metrics.visibleGroundTruthSamples, 0);
  const weighted = (metric) => reports.reduce(
    (total, report) => total + ((report.metrics[metric] || 0) * report.metrics.visibleGroundTruthSamples),
    0,
  ) / Math.max(1, visibleSamples);
  const failedCaseIds = reports.filter((report) => !report.verdict.passed).map((report) => report.benchmarkId);
  return {
    schemaVersion: TRACKING_BENCHMARK_SCHEMA_VERSION,
    evaluatorVersion: TRACKING_BENCHMARK_EVALUATOR_VERSION,
    suiteId,
    summary: {
      passed: failedCaseIds.length === 0,
      caseCount: reports.length,
      passedCaseCount: reports.length - failedCaseIds.length,
      failedCaseIds,
      visibleGroundTruthSamples: visibleSamples,
      weightedVisibleCoverage: weighted("visibleCoverage"),
      weightedMeanIou: weighted("meanIou"),
    },
    cases: reports,
  };
}
