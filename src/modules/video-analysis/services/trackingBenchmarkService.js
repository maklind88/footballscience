import {
  MAX_TRACKING_BENCHMARK_CASE_BYTES,
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  TRACKING_BENCHMARK_EVALUATOR_VERSION,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  TrackingBenchmarkError,
  assertBenchmarkEnvelope,
  assertBenchmarkMetadataOnly,
  benchmarkBoundedString,
  benchmarkFinite,
  benchmarkInvalid,
  benchmarkSerializedBytes,
  normalizeBenchmarkFingerprint,
  normalizeBenchmarkFrame,
  normalizeBenchmarkProviderRunEvidence,
  normalizeBenchmarkRange,
  normalizeBenchmarkTrack,
  trackingClassificationAccuracy,
  trackingIdentityKey,
} from "./trackingBenchmarkContract.js";
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
import {
  trackingBenchmarkCaseEvidence,
  trackingBenchmarkSuiteEvidence,
} from "./trackingBenchmarkEvidence.js";

export {
  TRACKING_BENCHMARK_EVALUATOR_VERSION,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  TrackingBenchmarkError,
};

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

function profileFor(value = {}) {
  const profileId = benchmarkBoundedString(value.profileId, "benchmark profile", 80);
  const profile = TRACKING_BENCHMARK_PROFILES[profileId];
  if (!profile) benchmarkInvalid(`Unsupported benchmark profile: ${profileId}.`);
  const overrides = value.thresholds && typeof value.thresholds === "object" ? value.thresholds : {};
  const unknown = Object.keys(overrides).filter((key) => !thresholdRules.some(([name]) => name === key));
  if (unknown.length) benchmarkInvalid(`Unknown benchmark threshold: ${unknown[0]}.`);
  const thresholds = { ...profile.thresholds };
  for (const [key, entry] of Object.entries(overrides)) {
    if (entry === null) {
      thresholds[key] = null;
      continue;
    }
    const number = benchmarkFinite(entry, `threshold ${key}`);
    if (number < 0) benchmarkInvalid(`Threshold ${key} cannot be negative.`);
    if ((key.startsWith("min") || key === "maxDetectionBrierScore") && number > 1) {
      benchmarkInvalid(`Threshold ${key} cannot exceed 1.`);
    }
    thresholds[key] = number;
  }
  const samplingOverrides = value.sampling && typeof value.sampling === "object" ? value.sampling : {};
  const samplingKeys = ["maxInterpolationGapMs", "maxSampleDeltaMs", "successIou"];
  const unknownSampling = Object.keys(samplingOverrides).filter((key) => !samplingKeys.includes(key));
  if (unknownSampling.length) benchmarkInvalid(`Unknown benchmark sampling option: ${unknownSampling[0]}.`);
  const sampling = { ...profile.sampling };
  for (const [key, entry] of Object.entries(samplingOverrides)) {
    const number = benchmarkFinite(entry, `sampling option ${key}`);
    if (number < 0 || (key === "successIou" && number > 1)) benchmarkInvalid(`Invalid sampling option ${key}.`);
    sampling[key] = number;
  }
  return {
    id: profileId,
    description: profile.description,
    sampling,
    thresholds,
  };
}

function benchmarkSamples(truth, prediction, range, frame, sampling) {
  const truthPoints = truth.segments.flatMap((segment) => segment.points).filter((point) => !point.occluded);
  if (!truthPoints.length) benchmarkInvalid("Ground truth has no visible samples.");
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
    : benchmarkFinite(performance.processingMs, "processing time");
  if (processingMs !== null && processingMs <= 0) benchmarkInvalid("Processing time must be positive.");
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
    entityTypeAccuracy: trackingClassificationAccuracy(truth.entityType, prediction.entityType),
    teamAccuracy: trackingClassificationAccuracy(truth.teamId || truth.teamSide, prediction.teamId || prediction.teamSide),
    identityAccuracy: trackingClassificationAccuracy(trackingIdentityKey(truth), trackingIdentityKey(prediction)),
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
  assertBenchmarkEnvelope(value);

  const id = benchmarkBoundedString(value.id, "benchmark id", 120);
  const sourceFingerprint = normalizeBenchmarkFingerprint(value.sourceFingerprint);
  const frame = normalizeBenchmarkFrame(value.frame);
  const range = normalizeBenchmarkRange(value.range);
  const profile = profileFor(value);
  const groundTruth = normalizeBenchmarkTrack(value.groundTruth?.track, range, "ground-truth track");
  const prediction = normalizeBenchmarkTrack(value.prediction?.track, range, "prediction track", true);
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
    benchmarkType: "selected-object",
    evidence: trackingBenchmarkCaseEvidence(value, range),
    metrics,
    thresholds: profile.thresholds,
    worstSamples: worstSamples(samples),
    verdict: { passed: failures.length === 0, failureCount: failures.length, failures },
  };
}

export function evaluateTrackingBenchmarkSuite(value = {}) {
  if (benchmarkSerializedBytes(value, "Benchmark suite") > MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
    benchmarkInvalid("Benchmark suite is too large.", "TRACKING_BENCHMARK_LIMIT");
  }
  assertBenchmarkMetadataOnly(value);
  if (Number(value.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION) benchmarkInvalid("Unsupported benchmark suite version.");
  const suiteId = benchmarkBoundedString(value.id, "benchmark suite id", 120);
  const providerRunEvidence = value.providerRunEvidence
    ? normalizeBenchmarkProviderRunEvidence(value.providerRunEvidence)
    : null;
  if (providerRunEvidence && providerRunEvidence.provider.stage !== "segmentation") {
    benchmarkInvalid("Selected-object provider evidence requires a segmentation provider.");
  }
  const cases = Array.isArray(value.cases) ? value.cases : [];
  if (!cases.length || cases.length > 100) benchmarkInvalid("Benchmark suite must contain 1-100 cases.");
  const reports = cases.map(evaluateTrackingBenchmarkCase);
  const visibleSamples = reports.reduce((total, report) => total + report.metrics.visibleGroundTruthSamples, 0);
  const weighted = (metric) => reports.reduce(
    (total, report) => total + ((report.metrics[metric] || 0) * report.metrics.visibleGroundTruthSamples),
    0,
  ) / Math.max(1, visibleSamples);
  const failedCaseIds = reports.filter((report) => !report.verdict.passed).map((report) => report.benchmarkId);
  const evidence = trackingBenchmarkSuiteEvidence(reports);
  return {
    schemaVersion: TRACKING_BENCHMARK_SCHEMA_VERSION,
    evaluatorVersion: TRACKING_BENCHMARK_EVALUATOR_VERSION,
    benchmarkType: "selected-object-suite",
    suiteId,
    ...(providerRunEvidence ? { providerRunEvidence } : {}),
    summary: {
      passed: failedCaseIds.length === 0,
      caseCount: reports.length,
      passedCaseCount: reports.length - failedCaseIds.length,
      failedCaseIds,
      visibleGroundTruthSamples: visibleSamples,
      weightedVisibleCoverage: weighted("visibleCoverage"),
      weightedMeanIou: weighted("meanIou"),
      ...evidence,
    },
    cases: reports,
  };
}
