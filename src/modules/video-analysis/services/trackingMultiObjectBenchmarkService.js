import {
  MAX_TRACKING_BENCHMARK_CASE_BYTES,
  MAX_TRACKING_BENCHMARK_SUITE_BYTES,
  TRACKING_BENCHMARK_EVALUATOR_VERSION,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  assertBenchmarkEnvelope,
  assertBenchmarkMetadataOnly,
  benchmarkBoundedString,
  benchmarkFinite,
  benchmarkInvalid,
  benchmarkSerializedBytes,
  normalizeBenchmarkFingerprint,
  normalizeBenchmarkFrame,
  normalizeBenchmarkRange,
  normalizeBenchmarkTracks,
} from "./trackingBenchmarkContract.js";
import {
  buildMultiObjectFrames,
  summarizeMultiObjectFrames,
} from "./trackingMultiObjectMetrics.js";
import {
  trackingBenchmarkCaseEvidence,
  trackingBenchmarkSuiteEvidence,
} from "./trackingBenchmarkEvidence.js";

export const MULTI_OBJECT_BENCHMARK_PROFILES = Object.freeze({
  "football-scene-pilot-v1": Object.freeze({
    description: "Calibratable full-scene gate for players, ball and referees in tactical match video.",
    requiredEntityTypes: Object.freeze(["player", "ball", "referee"]),
    sampling: Object.freeze({
      minimumIou: 0.5,
      maxInterpolationGapMs: 500,
      maxSampleDeltaMs: 100,
      maximumIdentitySwitchGapMs: 2500,
    }),
    thresholds: Object.freeze({
      minDetectionPrecision: 0.9,
      minDetectionRecall: 0.9,
      minDetectionF1: 0.9,
      minMeanIou: 0.65,
      minP10Iou: 0.4,
      minMota: 0.8,
      minIdentityF1: 0.85,
      maxIdentitySwitchesPerMinute: 2,
      maxFragmentationsPerMinute: 4,
      minEntityTypeAccuracy: 0.98,
      minTeamAccuracy: 0.95,
      minPlayerIdentityAccuracy: 0.9,
      minShirtNumberAccuracy: null,
      minPlayerPrecision: 0.9,
      minPlayerRecall: 0.9,
      minBallPrecision: 0.8,
      minBallRecall: 0.8,
      minRefereePrecision: 0.8,
      minRefereeRecall: 0.8,
      maxDetectionBrierScore: 0.2,
      maxCorrectionsPerMinute: 8,
      maxRealtimeFactor: 1,
    }),
    referenceThresholds: Object.freeze({
      minHota: 0.65,
      minDetA: 0.75,
      minAssA: 0.65,
      minLocA: 0.75,
      minMota: 0.8,
      minIdf1: 0.85,
    }),
  }),
});

const thresholdRules = Object.freeze([
  ["minDetectionPrecision", "detectionPrecision", "minimum"],
  ["minDetectionRecall", "detectionRecall", "minimum"],
  ["minDetectionF1", "detectionF1", "minimum"],
  ["minMeanIou", "meanIou", "minimum"],
  ["minP10Iou", "p10Iou", "minimum"],
  ["minMota", "mota", "minimum"],
  ["minIdentityF1", "identityF1", "minimum"],
  ["maxIdentitySwitchesPerMinute", "identitySwitchesPerMinute", "maximum"],
  ["maxFragmentationsPerMinute", "fragmentationsPerMinute", "maximum"],
  ["minEntityTypeAccuracy", "entityTypeAccuracy", "minimum"],
  ["minTeamAccuracy", "teamAccuracy", "minimum"],
  ["minPlayerIdentityAccuracy", "playerIdentityAccuracy", "minimum"],
  ["minShirtNumberAccuracy", "shirtNumberAccuracy", "minimum"],
  ["minPlayerPrecision", "playerPrecision", "minimum"],
  ["minPlayerRecall", "playerRecall", "minimum"],
  ["minBallPrecision", "ballPrecision", "minimum"],
  ["minBallRecall", "ballRecall", "minimum"],
  ["minRefereePrecision", "refereePrecision", "minimum"],
  ["minRefereeRecall", "refereeRecall", "minimum"],
  ["maxDetectionBrierScore", "detectionBrierScore", "maximum"],
  ["maxCorrectionsPerMinute", "correctionsPerMinute", "maximum"],
  ["maxRealtimeFactor", "realtimeFactor", "maximum"],
]);

export function resolveMultiObjectBenchmarkProfile(value = {}) {
  const profileId = benchmarkBoundedString(value.profileId, "benchmark profile", 80);
  const profile = MULTI_OBJECT_BENCHMARK_PROFILES[profileId];
  if (!profile) benchmarkInvalid(`Unsupported multi-object benchmark profile: ${profileId}.`);

  const overrides = value.thresholds && typeof value.thresholds === "object" ? value.thresholds : {};
  const unknownThresholds = Object.keys(overrides).filter(
    (key) => !thresholdRules.some(([threshold]) => threshold === key),
  );
  if (unknownThresholds.length) benchmarkInvalid(`Unknown multi-object threshold: ${unknownThresholds[0]}.`);
  const thresholds = { ...profile.thresholds };
  for (const [key, entry] of Object.entries(overrides)) {
    if (entry === null) {
      thresholds[key] = null;
      continue;
    }
    const number = benchmarkFinite(entry, `threshold ${key}`);
    if (number < 0 || (key.startsWith("min") && number > 1)) benchmarkInvalid(`Invalid threshold ${key}.`);
    thresholds[key] = number;
  }

  const samplingOverrides = value.sampling && typeof value.sampling === "object" ? value.sampling : {};
  const samplingKeys = Object.keys(profile.sampling);
  const unknownSampling = Object.keys(samplingOverrides).filter((key) => !samplingKeys.includes(key));
  if (unknownSampling.length) benchmarkInvalid(`Unknown multi-object sampling option: ${unknownSampling[0]}.`);
  const sampling = { ...profile.sampling };
  for (const [key, entry] of Object.entries(samplingOverrides)) {
    const number = benchmarkFinite(entry, `sampling option ${key}`);
    if (number < 0 || (key === "minimumIou" && number > 1)) benchmarkInvalid(`Invalid sampling option ${key}.`);
    sampling[key] = number;
  }
  const referenceOverrides = value.referenceThresholds && typeof value.referenceThresholds === "object"
    ? value.referenceThresholds
    : {};
  const referenceThresholds = { ...profile.referenceThresholds };
  const unknownReference = Object.keys(referenceOverrides).filter((key) => !(key in referenceThresholds));
  if (unknownReference.length) benchmarkInvalid(`Unknown TrackEval threshold: ${unknownReference[0]}.`);
  for (const [key, entry] of Object.entries(referenceOverrides)) {
    const number = benchmarkFinite(entry, `TrackEval threshold ${key}`);
    if (number < 0 || number > 1) benchmarkInvalid(`Invalid TrackEval threshold ${key}.`);
    referenceThresholds[key] = number;
  }
  return { id: profileId, ...profile, sampling, thresholds, referenceThresholds };
}

function assertRequiredEntities(tracks = [], profile = {}) {
  const present = new Set(tracks.map((track) => track.entityType));
  const missing = profile.requiredEntityTypes.filter((entityType) => !present.has(entityType));
  if (missing.length) benchmarkInvalid(`Ground truth is missing required entity type: ${missing[0]}.`);
  if (tracks.some((track) => !profile.requiredEntityTypes.includes(track.entityType))) {
    benchmarkInvalid("Ground truth contains an unsupported entity type for this profile.");
  }
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

function performanceMetrics(value = {}, range = {}) {
  const processingMs = value.processingMs === undefined
    ? null
    : Math.max(0, benchmarkFinite(value.processingMs, "processing time"));
  return {
    processingMs,
    realtimeFactor: processingMs === null ? null : processingMs / range.durationMs,
  };
}

function correctionMetrics(tracks = [], range = {}) {
  const count = tracks.reduce((total, track) => total + track.corrections.length, 0);
  return {
    correctionCount: count,
    correctionsPerMinute: count / (range.durationMs / 60_000),
  };
}

function reportMetrics(frames, truthTracks, predictionTracks, profile, range, performance) {
  const summary = summarizeMultiObjectFrames(frames, {
    durationMs: range.durationMs,
    maximumIdentitySwitchGapMs: profile.sampling.maximumIdentitySwitchGapMs,
  });
  const { worstFrames, ...metrics } = summary;
  return {
    metrics: {
      ...metrics,
      playerPrecision: metrics.perEntity.player.precision,
      playerRecall: metrics.perEntity.player.recall,
      ballPrecision: metrics.perEntity.ball.precision,
      ballRecall: metrics.perEntity.ball.recall,
      refereePrecision: metrics.perEntity.referee.precision,
      refereeRecall: metrics.perEntity.referee.recall,
      ...correctionMetrics(predictionTracks, range),
      ...performanceMetrics(performance, range),
      groundTruthTrackCount: truthTracks.length,
      predictionTrackCount: predictionTracks.length,
    },
    worstFrames,
  };
}

export function evaluateMultiObjectTrackingBenchmarkCase(value = {}) {
  assertBenchmarkEnvelope(value);
  if (value.benchmarkType !== "multi-object") benchmarkInvalid("Multi-object benchmark type is required.");
  const benchmarkId = benchmarkBoundedString(value.id, "benchmark id", 120);
  const sourceFingerprint = normalizeBenchmarkFingerprint(value.sourceFingerprint);
  const frame = normalizeBenchmarkFrame(value.frame);
  const range = normalizeBenchmarkRange(value.range);
  const profile = resolveMultiObjectBenchmarkProfile(value);
  const truthTracks = normalizeBenchmarkTracks(value.groundTruth?.tracks, range, "ground-truth tracks");
  const predictionTracks = normalizeBenchmarkTracks(value.prediction?.tracks, range, "prediction tracks", true);
  assertRequiredEntities(truthTracks, profile);
  const frames = buildMultiObjectFrames(truthTracks, predictionTracks, profile.sampling);
  if (!frames) benchmarkInvalid("Ground truth has no visible frames or exceeds the frame limit.");
  const { metrics, worstFrames } = reportMetrics(
    frames,
    truthTracks,
    predictionTracks,
    profile,
    range,
    value.performance,
  );
  const failures = thresholdFailures(metrics, profile.thresholds);
  return {
    schemaVersion: TRACKING_BENCHMARK_SCHEMA_VERSION,
    evaluatorVersion: TRACKING_BENCHMARK_EVALUATOR_VERSION,
    benchmarkType: "multi-object",
    benchmarkId,
    sourceFingerprint,
    frame,
    range,
    profile: { id: profile.id, description: profile.description },
    evidence: trackingBenchmarkCaseEvidence(value, range),
    metrics,
    thresholds: profile.thresholds,
    worstFrames,
    referenceValidation: {
      evaluator: "TrackEval",
      status: "required-before-provider-approval",
      requiredMetrics: ["HOTA", "DetA", "AssA", "LocA", "MOTA", "IDF1"],
      requiredThresholds: profile.referenceThresholds,
    },
    verdict: {
      passed: failures.length === 0,
      providerApprovalReady: false,
      failureCount: failures.length,
      failures,
    },
  };
}

export function evaluateMultiObjectTrackingBenchmarkSuite(value = {}) {
  if (benchmarkSerializedBytes(value, "Benchmark suite") > MAX_TRACKING_BENCHMARK_SUITE_BYTES) {
    benchmarkInvalid("Benchmark suite is too large.", "TRACKING_BENCHMARK_LIMIT");
  }
  assertBenchmarkMetadataOnly(value);
  if (Number(value.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION) benchmarkInvalid("Unsupported benchmark suite version.");
  const suiteId = benchmarkBoundedString(value.id, "benchmark suite id", 120);
  const cases = Array.isArray(value.cases) ? value.cases : [];
  if (!cases.length || cases.length > 100) benchmarkInvalid("Benchmark suite must contain 1-100 cases.");
  const reports = cases.map(evaluateMultiObjectTrackingBenchmarkCase);
  const truthDetections = reports.reduce((total, report) => total + report.metrics.truthDetections, 0);
  const predictionDetections = reports.reduce((total, report) => total + report.metrics.predictionDetections, 0);
  const truePositives = reports.reduce((total, report) => total + report.metrics.truePositives, 0);
  const weighted = (metric) => reports.reduce(
    (total, report) => total + ((report.metrics[metric] || 0) * report.metrics.truthDetections),
    0,
  ) / Math.max(1, truthDetections);
  const failedCaseIds = reports.filter((report) => !report.verdict.passed).map((report) => report.benchmarkId);
  const evidence = trackingBenchmarkSuiteEvidence(reports);
  return {
    schemaVersion: TRACKING_BENCHMARK_SCHEMA_VERSION,
    evaluatorVersion: TRACKING_BENCHMARK_EVALUATOR_VERSION,
    benchmarkType: "multi-object-suite",
    suiteId,
    summary: {
      passed: failedCaseIds.length === 0,
      providerApprovalReady: false,
      caseCount: reports.length,
      passedCaseCount: reports.length - failedCaseIds.length,
      failedCaseIds,
      truthDetections,
      predictionDetections,
      detectionPrecision: predictionDetections > 0 ? truePositives / predictionDetections : 0,
      detectionRecall: truthDetections > 0 ? truePositives / truthDetections : 0,
      weightedMeanIou: weighted("meanIou"),
      weightedIdentityF1: weighted("identityF1"),
      ...evidence,
    },
    cases: reports,
  };
}
