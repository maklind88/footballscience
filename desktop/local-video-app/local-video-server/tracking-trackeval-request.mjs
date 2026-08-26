import {
  MAX_TRACKING_BENCHMARK_CASE_BYTES,
  assertBenchmarkEnvelope,
  assertBenchmarkMetadataOnly,
  benchmarkBoundedString,
  benchmarkInvalid,
  benchmarkSerializedBytes,
  normalizeBenchmarkFingerprint,
  normalizeBenchmarkRange,
  normalizeBenchmarkTracks,
} from "../../../src/modules/video-analysis/services/trackingBenchmarkContract.js";
import {
  resolveMultiObjectBenchmarkProfile,
} from "../../../src/modules/video-analysis/services/trackingMultiObjectBenchmarkService.js";
import {
  buildMultiObjectFrames,
} from "../../../src/modules/video-analysis/services/trackingMultiObjectMetrics.js";

export const TRACK_EVAL_PROTOCOL = "football-science-trackeval-reference-v1";
const entityTypes = ["player", "ball", "referee"];
const metricNames = [
  "HOTA",
  "DetA",
  "AssA",
  "LocA",
  "MOTA",
  "IDF1",
  "IDP",
  "IDR",
  "identitySwitches",
  "fragmentations",
];
const countNames = [
  "timesteps",
  "groundTruthDetections",
  "predictionDetections",
  "groundTruthIdentities",
  "predictionIdentities",
];

function observation(value = {}) {
  return {
    id: value.track.id,
    entityType: value.track.entityType,
    box: [value.point.x, value.point.y, value.point.width, value.point.height],
  };
}

function assertRequiredEntities(tracks = []) {
  const present = new Set(tracks.map((track) => track.entityType));
  const missing = entityTypes.find((entityType) => !present.has(entityType));
  if (missing) benchmarkInvalid(`Ground truth is missing required entity type: ${missing}.`);
  if (tracks.some((track) => !entityTypes.includes(track.entityType))) {
    benchmarkInvalid("Ground truth contains an unsupported entity type for TrackEval.");
  }
}

function buildSequence(value = {}) {
  assertBenchmarkEnvelope(value);
  if (value.benchmarkType !== "multi-object") benchmarkInvalid("TrackEval requires a multi-object benchmark.");
  const benchmarkId = benchmarkBoundedString(value.id, "benchmark id", 120);
  const sourceFingerprint = normalizeBenchmarkFingerprint(value.sourceFingerprint);
  const range = normalizeBenchmarkRange(value.range);
  const profile = resolveMultiObjectBenchmarkProfile(value);
  const truthTracks = normalizeBenchmarkTracks(value.groundTruth?.tracks, range, "ground-truth tracks");
  const predictionTracks = normalizeBenchmarkTracks(value.prediction?.tracks, range, "prediction tracks", true);
  assertRequiredEntities(truthTracks);
  const frames = buildMultiObjectFrames(truthTracks, predictionTracks, profile.sampling);
  if (!frames) benchmarkInvalid("Ground truth has no visible frames or exceeds the TrackEval limit.");
  return {
    benchmarkId,
    sourceFingerprint,
    timesteps: frames.map((frame) => ({
      atMs: frame.atMs,
      truth: frame.truth.map(observation),
      prediction: frame.prediction.map(observation),
    })),
  };
}

export function buildTrackEvalRequest(value = {}, manifest = {}) {
  const cases = Array.isArray(value.cases) ? value.cases : [value];
  if (!cases.length || cases.length > Number(manifest.runtime?.maximumSequences || 100)) {
    benchmarkInvalid("TrackEval benchmark suite has an invalid case count.");
  }
  if (Array.isArray(value.cases)) {
    if (benchmarkSerializedBytes(value, "TrackEval benchmark suite") > MAX_TRACKING_BENCHMARK_CASE_BYTES * 4) {
      benchmarkInvalid("TrackEval benchmark suite is too large.", "TRACKING_BENCHMARK_LIMIT");
    }
    assertBenchmarkMetadataOnly(value);
    if (Number(value.version) !== 1) benchmarkInvalid("Unsupported TrackEval benchmark suite version.");
    benchmarkBoundedString(value.id, "TrackEval benchmark suite id", 120);
  }
  const request = {
    schemaVersion: 1,
    protocol: TRACK_EVAL_PROTOCOL,
    evaluator: {
      commit: manifest.upstream?.commit,
      sourceSha256: manifest.upstream?.sourceSha256,
    },
    threshold: 0.5,
    sequences: cases.map(buildSequence),
  };
  if (benchmarkSerializedBytes(request, "TrackEval request") > Number(manifest.runtime?.maximumRequestBytes || 0)) {
    benchmarkInvalid("TrackEval request is too large.", "TRACKING_BENCHMARK_LIMIT");
  }
  return request;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) benchmarkInvalid(`Invalid ${label}.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    benchmarkInvalid(`Unexpected ${label} fields.`);
  }
}

function finiteMetric(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) benchmarkInvalid(`Invalid TrackEval metric ${name}.`);
  const isCount = name === "identitySwitches" || name === "fragmentations";
  if (isCount && (!Number.isInteger(number) || number < 0)) benchmarkInvalid(`Invalid TrackEval metric ${name}.`);
  if (!isCount && name !== "MOTA" && (number < 0 || number > 1)) benchmarkInvalid(`Invalid TrackEval metric ${name}.`);
  if (name === "MOTA" && (number < -1000 || number > 1)) benchmarkInvalid(`Invalid TrackEval metric ${name}.`);
  return number;
}

function normalizeMetrics(value = {}) {
  exactKeys(value, metricNames, "TrackEval metrics");
  return Object.fromEntries(metricNames.map((name) => [name, finiteMetric(value[name], name)]));
}

function normalizeCounts(value = {}) {
  exactKeys(value, countNames, "TrackEval counts");
  return Object.fromEntries(countNames.map((name) => {
    const count = Number(value[name]);
    if (!Number.isInteger(count) || count < 0 || count > 1_000_000) benchmarkInvalid(`Invalid TrackEval count ${name}.`);
    return [name, count];
  }));
}

function normalizeEntityReports(value = {}) {
  exactKeys(value, entityTypes, "TrackEval entity report");
  return Object.fromEntries(entityTypes.map((entityType) => {
    const report = value[entityType];
    exactKeys(report, ["metrics", "counts"], `TrackEval ${entityType} report`);
    return [entityType, { metrics: normalizeMetrics(report.metrics), counts: normalizeCounts(report.counts) }];
  }));
}

function normalizeResultBundle(value = {}, label = "TrackEval result") {
  exactKeys(value, ["metrics", "counts", "perEntity"], label);
  return {
    metrics: normalizeMetrics(value.metrics),
    counts: normalizeCounts(value.counts),
    perEntity: normalizeEntityReports(value.perEntity),
  };
}

function assertSummaryCounts(summary = {}, sequences = []) {
  for (const name of countNames) {
    const expected = sequences.reduce((total, sequence) => total + sequence.counts[name], 0);
    if (summary.counts[name] !== expected) benchmarkInvalid(`TrackEval summary count mismatch for ${name}.`);
  }
}

export function validateTrackEvalReport(value = {}, request = {}, manifest = {}) {
  if (benchmarkSerializedBytes(value, "TrackEval report") > Number(manifest.runtime?.maximumReportBytes || 0)) {
    benchmarkInvalid("TrackEval report is too large.", "TRACKING_BENCHMARK_LIMIT");
  }
  assertBenchmarkMetadataOnly(value);
  exactKeys(value, [
    "schemaVersion",
    "protocol",
    "evaluator",
    "threshold",
    "sequenceCount",
    "summary",
    "sequences",
  ], "TrackEval report");
  if (value.schemaVersion !== 1 || value.protocol !== TRACK_EVAL_PROTOCOL || Number(value.threshold) !== 0.5) {
    benchmarkInvalid("Unsupported TrackEval report protocol.");
  }
  exactKeys(value.evaluator, ["name", "commit", "sourceSha256"], "TrackEval evaluator evidence");
  if (value.evaluator.name !== "TrackEval"
    || value.evaluator.commit !== manifest.upstream?.commit
    || value.evaluator.sourceSha256 !== manifest.upstream?.sourceSha256) {
    benchmarkInvalid("TrackEval report does not match the pinned evaluator.");
  }
  const expected = new Map((request.sequences || []).map((sequence) => [sequence.benchmarkId, sequence]));
  if (!Array.isArray(value.sequences)
    || value.sequenceCount !== expected.size
    || value.sequences.length !== expected.size) benchmarkInvalid("TrackEval report sequence count mismatch.");
  const sequences = value.sequences.map((entry) => {
    exactKeys(entry, ["benchmarkId", "sourceFingerprint", "metrics", "counts", "perEntity"], "TrackEval sequence");
    const benchmarkId = benchmarkBoundedString(entry.benchmarkId, "TrackEval benchmark id", 120);
    const expectedSequence = expected.get(benchmarkId);
    if (!expectedSequence || entry.sourceFingerprint !== expectedSequence.sourceFingerprint) {
      benchmarkInvalid("TrackEval report sequence identity mismatch.");
    }
    expected.delete(benchmarkId);
    return {
      benchmarkId,
      sourceFingerprint: entry.sourceFingerprint,
      ...normalizeResultBundle({ metrics: entry.metrics, counts: entry.counts, perEntity: entry.perEntity }),
    };
  });
  if (expected.size) benchmarkInvalid("TrackEval report is missing a sequence.");
  const summary = normalizeResultBundle(value.summary, "TrackEval summary");
  assertSummaryCounts(summary, sequences);
  return {
    schemaVersion: 1,
    protocol: TRACK_EVAL_PROTOCOL,
    evaluator: { ...value.evaluator },
    threshold: 0.5,
    sequenceCount: sequences.length,
    summary,
    sequences,
  };
}

export const TRACK_EVAL_REFERENCE_METRICS = Object.freeze(metricNames.slice(0, 8));
