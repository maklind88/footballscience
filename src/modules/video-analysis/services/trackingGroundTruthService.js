import {
  normalizeObjectTrack,
  trackingPoints,
} from "../domain/tracking.model.js";
import {
  MAX_TRACKING_BENCHMARK_CASE_BYTES,
  TRACKING_BENCHMARK_SCHEMA_VERSION,
  assertBenchmarkEnvelope,
  assertBenchmarkMetadataOnly,
  benchmarkSerializedBytes,
  normalizeBenchmarkFingerprint,
  normalizeBenchmarkFrame,
  normalizeBenchmarkRange,
  normalizeBenchmarkTracks,
} from "./trackingBenchmarkContract.js";
import { sampleTrackAt } from "./trackingBenchmarkMetrics.js";
import { normalizeTrackingBenchmarkScenarios } from "./trackingBenchmarkScenarioService.js";
import {
  TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
  TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
  TRACKING_GROUND_TRUTH_PROFILE,
  TRACKING_SELECTED_OBJECT_PROFILE,
  normalizeTrackingGroundTruthBenchmarkType,
  trackingGroundTruthArtifactBenchmarkType,
  trackingGroundTruthProfileForType,
} from "./trackingGroundTruthProfileService.js";

export * from "./trackingGroundTruthProfileService.js";

export const TRACKING_GROUND_TRUTH_PROTOCOL = "football-science-ground-truth-v1";
export const TRACKING_GROUND_TRUTH_REVIEW_PROTOCOL = "football-ground-truth-review-v1";
export const TRACKING_GROUND_TRUTH_MAX_SAMPLE_GAP_MS = 500;
export const TRACKING_GROUND_TRUTH_MAX_RANGE_MS = 2 * 60 * 1000;

const requiredEntityTypes = Object.freeze(["player", "ball", "referee"]);
const sourceFingerprintPattern = /^[a-f0-9]{64}$/i;

export class TrackingGroundTruthError extends Error {
  constructor(message, code = "TRACKING_GROUND_TRUTH_INVALID", options = {}) {
    super(message, options);
    this.name = "TrackingGroundTruthError";
    this.code = code;
  }
}

function issue(code, message, trackId = "") {
  return { code, message, ...(trackId ? { trackId } : {}) };
}

function selectedTracks(value = {}) {
  const tracks = (value.tracks || []).map(normalizeObjectTrack);
  const selectedIds = new Set((value.selectedTrackIds || tracks.map((track) => track.id)).map(String));
  return tracks.filter((track) => selectedIds.has(track.id));
}

function frameReady(frame = {}) {
  return Number.isInteger(Number(frame.width))
    && Number(frame.width) > 0
    && Number(frame.width) <= 16_384
    && Number.isInteger(Number(frame.height))
    && Number(frame.height) > 0
    && Number(frame.height) <= 16_384;
}

function rangeReady(range = {}) {
  const startMs = Number(range.startMs);
  const endMs = Number(range.endMs);
  return Number.isFinite(startMs)
    && Number.isFinite(endMs)
    && startMs >= 0
    && endMs > startMs
    && endMs - startMs <= TRACKING_GROUND_TRUTH_MAX_RANGE_MS;
}

function entityCounts(tracks = []) {
  return Object.fromEntries(requiredEntityTypes.map((entityType) => [
    entityType,
    tracks.filter((track) => track.entityType === entityType).length,
  ]));
}

function trackReviewCoverage(track = {}, range = {}) {
  if (!rangeReady(range)) return { pointCount: 0, ratio: 0, maxSampleGapMs: Infinity };
  const points = trackingPoints(track).filter((point) => (
    point.atMs >= Number(range.startMs) && point.atMs <= Number(range.endMs)
  ));
  let maxSampleGapMs = 0;
  let declaredVisibleMs = 0;
  const reviewedVisibleMs = track.segments.reduce((total, segment) => {
    const startMs = Math.max(Number(range.startMs), segment.startMs);
    const endMs = Math.min(Number(range.endMs), segment.endMs);
    const segmentPoints = segment.points.filter((point) => point.atMs >= startMs && point.atMs <= endMs);
    if (endMs > startMs) {
      declaredVisibleMs += endMs - startMs;
      const sampleTimes = [startMs, ...segmentPoints.map((point) => point.atMs), endMs]
        .sort((first, second) => first - second);
      for (let index = 1; index < sampleTimes.length; index += 1) {
        maxSampleGapMs = Math.max(maxSampleGapMs, sampleTimes[index] - sampleTimes[index - 1]);
      }
    }
    const firstPointMs = segmentPoints[0]?.atMs;
    const lastPointMs = segmentPoints.at(-1)?.atMs;
    return total + (Number.isFinite(firstPointMs) && Number.isFinite(lastPointMs)
      ? Math.max(0, Math.min(endMs, lastPointMs) - Math.max(startMs, firstPointMs))
      : 0);
  }, 0);
  return {
    pointCount: points.length,
    ratio: Math.min(1, reviewedVisibleMs / Math.max(1, declaredVisibleMs)),
    maxSampleGapMs,
  };
}

export function groundTruthReadiness(value = {}) {
  const benchmarkType = normalizeTrackingGroundTruthBenchmarkType(value.benchmarkType, value.profileId);
  const selected = selectedTracks(value);
  const benchmarkTargetTrackId = String(value.benchmarkTargetTrackId || "");
  const target = selected.find((track) => track.id === benchmarkTargetTrackId && track.entityType === "player");
  const tracks = benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT
    ? target ? [target] : []
    : selected;
  const counts = entityCounts(tracks);
  const issues = [];
  const ids = new Set();
  if (!sourceFingerprintPattern.test(String(value.sourceFingerprint || ""))) {
    issues.push(issue("source-fingerprint-missing", "Create or refresh the exact local source fingerprint."));
  }
  if (!frameReady(value.frame)) issues.push(issue("frame-missing", "Load the video frame before locking the reference."));
  if (!rangeReady(value.range)) issues.push(issue("range-invalid", "Choose a benchmark range of no more than two minutes."));
  if (!tracks.length) issues.push(issue("tracks-missing", "Add verified object tracks to the reference set."));
  if (benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT && selected.length !== 1) {
    issues.push(issue("selected-object-count", "Selected-object ground truth requires exactly one target player."));
  }
  if (benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT) {
    for (const entityType of requiredEntityTypes) {
      if (!counts[entityType]) issues.push(issue(`${entityType}-missing`, `Add at least one ${entityType} track.`));
    }
  }
  if (!target) {
    issues.push(issue("benchmark-target-missing", "Choose one included player track as the selected-object benchmark target."));
  }
  for (const track of tracks) {
    const coverage = trackReviewCoverage(track, value.range);
    const trackFingerprint = String(track.metadata?.localSourceSha256 || "");
    const trackAngleId = String(track.metadata?.angleId || "");
    if (!track.id || ids.has(track.id)) issues.push(issue("track-id-invalid", "Reference track ids must be unique.", track.id));
    ids.add(track.id);
    if (!requiredEntityTypes.includes(track.entityType)) {
      issues.push(issue("entity-unsupported", "Reference tracks must be players, ball, or referees.", track.id));
    }
    if (sourceFingerprintPattern.test(trackFingerprint)
      && trackFingerprint.toLowerCase() !== String(value.sourceFingerprint || "").toLowerCase()) {
      issues.push(issue("track-source-mismatch", "Reference tracks must use the same source fingerprint.", track.id));
    }
    if (trackAngleId && value.angleId && trackAngleId !== String(value.angleId)) {
      issues.push(issue("track-angle-mismatch", "Reference tracks must use the active camera angle.", track.id));
    }
    if (track.status !== "verified") issues.push(issue("track-unverified", "Verify every reference track.", track.id));
    if (coverage.pointCount < 2) issues.push(issue("track-sparse", "Reference tracks need at least two reviewed points in the benchmark range.", track.id));
    if (coverage.ratio < 0.8) issues.push(issue("track-coverage", "Review at least 80% of every declared visible track span.", track.id));
    if (coverage.maxSampleGapMs > TRACKING_GROUND_TRUTH_MAX_SAMPLE_GAP_MS) {
      issues.push(issue("track-sampling", "Reference samples must be no more than 500 ms apart.", track.id));
    }
    if (track.entityType === "player" && !track.playerId && !track.playerLabel) {
      issues.push(issue("player-identity-missing", "Assign every reference player an identity.", track.id));
    }
    if (track.entityType === "player" && !track.teamId && !track.teamSide) {
      issues.push(issue("player-team-missing", "Assign every reference player to a team side.", track.id));
    }
  }
  if (!String(value.reviewedBy || "").trim()) issues.push(issue("reviewer-missing", "A local analyst identity is required."));
  if (value.attested !== true) issues.push(issue("attestation-missing", "Confirm that every selected track was reviewed frame by frame."));
  if (benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT && value.exhaustiveSceneAttested !== true) {
    issues.push(issue(
      "scene-completeness-missing",
      "Confirm that every visible player, ball and referee in the range is included.",
    ));
  }
  return {
    ready: issues.length === 0,
    issues,
    benchmarkType,
    selectedTrackCount: tracks.length,
    verifiedTrackCount: tracks.filter((track) => track.status === "verified").length,
    entityCounts: counts,
    sourceFingerprintReady: sourceFingerprintPattern.test(String(value.sourceFingerprint || "")),
    frameReady: frameReady(value.frame),
    rangeReady: rangeReady(value.range),
  };
}

function safePoint(point = {}, includeConfidence = false) {
  return {
    atMs: point.atMs,
    frameIndex: point.frameIndex,
    x: point.x,
    y: point.y,
    width: point.width,
    height: point.height,
    groundPoint: { x: point.groundPoint.x, y: point.groundPoint.y },
    occluded: point.occluded,
    source: point.source,
    ...(includeConfidence ? {
      confidence: point.confidence,
      identityConfidence: point.identityConfidence,
    } : {}),
  };
}

function referenceSampleTimes(tracks = [], range = {}) {
  const times = new Set([range.startMs, range.endMs]);
  for (let atMs = range.startMs; atMs <= range.endMs; atMs += TRACKING_GROUND_TRUTH_MAX_SAMPLE_GAP_MS) {
    times.add(atMs);
  }
  for (const track of tracks) {
    for (const segment of track.segments) {
      times.add(Math.max(range.startMs, segment.startMs));
      times.add(Math.min(range.endMs, segment.endMs));
      segment.points.forEach((point, index) => {
        const previous = segment.points[index - 1];
        if (point.source === "manual" || (previous && point.occluded !== previous.occluded)) times.add(point.atMs);
      });
      if (segment.points[0]) times.add(segment.points[0].atMs);
      if (segment.points.at(-1)) times.add(segment.points.at(-1).atMs);
    }
  }
  return [...times]
    .filter((atMs) => atMs >= range.startMs && atMs <= range.endMs)
    .sort((first, second) => first - second);
}

function safeSegments(track = {}, range = {}, includeConfidence = false, sampleTimes = []) {
  return track.segments.flatMap((segment, index) => {
    const startMs = Math.max(range.startMs, segment.startMs);
    const endMs = Math.min(range.endMs, segment.endMs);
    const points = sampleTimes
      .filter((atMs) => atMs >= startMs && atMs <= endMs)
      .map((atMs) => sampleTrackAt(track, atMs, {
        maxInterpolationGapMs: TRACKING_GROUND_TRUTH_MAX_SAMPLE_GAP_MS,
        maxSampleDeltaMs: 100,
      }))
      .filter(Boolean)
      .map((point) => safePoint(point, includeConfidence));
    if (!points.length) return [];
    return [{
      id: `segment-${index + 1}`,
      startMs: points[0].atMs,
      endMs: points.at(-1).atMs,
      discontinuityBefore: Boolean(segment.discontinuityBefore),
      points,
    }];
  });
}

function safeTrack(trackValue = {}, range = {}, index = 0, includeConfidence = false, sampleTimes = []) {
  const track = normalizeObjectTrack(trackValue);
  const segments = safeSegments(track, range, includeConfidence, sampleTimes);
  const firstMs = segments[0]?.startMs ?? range.startMs;
  const lastMs = segments.at(-1)?.endMs ?? firstMs;
  return {
    id: track.id || `${track.entityType || "object"}-${index + 1}`,
    entityType: track.entityType,
    playerId: track.playerId,
    playerLabel: track.playerLabel,
    teamId: track.teamId,
    teamSide: track.teamSide,
    shirtNumber: track.shirtNumber,
    status: includeConfidence ? "review" : "verified",
    startMs: firstMs,
    endMs: lastMs,
    segments,
    ...(includeConfidence ? {
      confidence: track.confidence,
      identityConfidence: track.identityConfidence,
      corrections: track.corrections.map((correction) => ({
        startMs: correction.startMs,
        endMs: correction.endMs,
        correctionType: correction.correctionType,
      })),
    } : {}),
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createGroundTruthArtifact(value = {}, options = {}) {
  const readiness = groundTruthReadiness(value);
  if (!readiness.ready) {
    throw new TrackingGroundTruthError(
      readiness.issues.map((entry) => entry.message).join(" "),
      "TRACKING_GROUND_TRUTH_REVIEW_REQUIRED",
    );
  }
  const sourceFingerprint = normalizeBenchmarkFingerprint(value.sourceFingerprint);
  const frame = normalizeBenchmarkFrame(value.frame);
  const range = normalizeBenchmarkRange(value.range);
  const sourceTracks = selectedTracks(value).filter((track) => (
    readiness.benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT
      || track.id === String(value.benchmarkTargetTrackId || "")
  ));
  const sampleTimes = referenceSampleTimes(sourceTracks, range);
  const tracks = sourceTracks.map((track, index) => safeTrack(track, range, index, false, sampleTimes));
  try {
    normalizeBenchmarkTracks(tracks, range, "ground-truth tracks");
  } catch (error) {
    throw new TrackingGroundTruthError(
      error?.message || "The reviewed trajectories do not satisfy the benchmark contract.",
      "TRACKING_GROUND_TRUTH_CONTRACT_INVALID",
      { cause: error },
    );
  }
  const revision = Math.max(1, Math.round(Number(value.revision) || 1));
  const reviewedAt = new Date(options.now?.() ?? value.reviewedAt ?? Date.now()).toISOString();
  const profileId = String(value.profileId || trackingGroundTruthProfileForType(readiness.benchmarkType));
  if (profileId !== trackingGroundTruthProfileForType(readiness.benchmarkType)) {
    throw new TrackingGroundTruthError(`Unsupported ground-truth profile: ${profileId}.`);
  }
  const artifact = {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    protocol: TRACKING_GROUND_TRUTH_PROTOCOL,
    id: `gt-${sourceFingerprint.slice(0, 12)}-${range.startMs}-${range.endMs}-r${revision}`,
    profileId,
    sourceFingerprint,
    sourceEvidence: {
      algorithm: "sha256",
      kind: "exact-local-file-bytes",
      angleId: String(value.angleId || "").slice(0, 160),
    },
    frame,
    range: { startMs: range.startMs, endMs: range.endMs },
    groundTruth: { tracks },
    reviewEvidence: {
      kind: "real-match",
      protocol: TRACKING_GROUND_TRUTH_REVIEW_PROTOCOL,
      benchmarkType: readiness.benchmarkType,
      reviewedAt,
      reviewedBy: String(value.reviewedBy).trim().slice(0, 160),
      attested: true,
      exhaustiveSceneAttested: readiness.benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
      selectedTrackCount: readiness.selectedTrackCount,
      selectedObjectTargetTrackId: String(value.benchmarkTargetTrackId),
      entityCounts: readiness.entityCounts,
      scenarioTags: normalizeTrackingBenchmarkScenarios(value.scenarioTags),
    },
  };
  if (benchmarkSerializedBytes(artifact, "Ground-truth artifact") > MAX_TRACKING_BENCHMARK_CASE_BYTES) {
    throw new TrackingGroundTruthError(
      "The reviewed reference is too large for one bounded benchmark case.",
      "TRACKING_GROUND_TRUTH_LIMIT",
    );
  }
  assertBenchmarkMetadataOnly(artifact);
  return deepFreeze(artifact);
}

export function groundTruthArtifactJson(artifact = {}) {
  return `${JSON.stringify(validateGroundTruthArtifact(artifact), null, 2)}\n`;
}

export function validateGroundTruthArtifact(artifact = {}) {
  const benchmarkType = trackingGroundTruthArtifactBenchmarkType(artifact);
  const expectedProfile = trackingGroundTruthProfileForType(benchmarkType);
  const scenarioTags = artifact.reviewEvidence?.scenarioTags || [];
  const normalizedScenarioTags = normalizeTrackingBenchmarkScenarios(scenarioTags);
  if (artifact.protocol !== TRACKING_GROUND_TRUTH_PROTOCOL
    || Number(artifact.version) !== TRACKING_BENCHMARK_SCHEMA_VERSION
    || artifact.profileId !== expectedProfile
    || artifact.sourceEvidence?.algorithm !== "sha256"
    || artifact.sourceEvidence?.kind !== "exact-local-file-bytes"
    || artifact.reviewEvidence?.kind !== "real-match"
    || artifact.reviewEvidence?.protocol !== TRACKING_GROUND_TRUTH_REVIEW_PROTOCOL
    || (benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT
      && artifact.reviewEvidence?.benchmarkType !== TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT)
    || (artifact.reviewEvidence?.benchmarkType
      && artifact.reviewEvidence.benchmarkType !== benchmarkType)
    || artifact.reviewEvidence?.attested !== true
    || (benchmarkType === TRACKING_BENCHMARK_TYPE_MULTI_OBJECT
      && artifact.reviewEvidence?.exhaustiveSceneAttested !== true)
    || (benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT
      && artifact.reviewEvidence?.exhaustiveSceneAttested !== false)
    || !Number.isFinite(Date.parse(artifact.reviewEvidence?.reviewedAt))
    || !Array.isArray(scenarioTags)
    || normalizedScenarioTags.length !== scenarioTags.length
    || !artifact.reviewEvidence?.selectedObjectTargetTrackId
    || !artifact.groundTruth?.tracks?.length) {
    throw new TrackingGroundTruthError("The locked reference artifact is invalid.");
  }
  assertBenchmarkEnvelope(artifact, { label: "Ground-truth artifact" });
  const range = normalizeBenchmarkRange(artifact.range);
  const tracks = normalizeBenchmarkTracks(artifact.groundTruth.tracks, range, "ground-truth tracks");
  const readiness = groundTruthReadiness({
    tracks,
    selectedTrackIds: tracks.map((track) => track.id),
    sourceFingerprint: normalizeBenchmarkFingerprint(artifact.sourceFingerprint),
    angleId: String(artifact.sourceEvidence?.angleId || ""),
    frame: normalizeBenchmarkFrame(artifact.frame),
    range,
    benchmarkType,
    reviewedBy: artifact.reviewEvidence?.reviewedBy,
    attested: true,
    exhaustiveSceneAttested: artifact.reviewEvidence?.exhaustiveSceneAttested,
    benchmarkTargetTrackId: artifact.reviewEvidence?.selectedObjectTargetTrackId,
  });
  if (!readiness.ready) {
    throw new TrackingGroundTruthError(
      readiness.issues.map((entry) => entry.message).join(" "),
      "TRACKING_GROUND_TRUTH_CONTRACT_INVALID",
    );
  }
  const counts = artifact.reviewEvidence?.entityCounts || {};
  if (Number(artifact.reviewEvidence?.selectedTrackCount) !== readiness.selectedTrackCount
    || requiredEntityTypes.some((entityType) => Number(counts[entityType] || 0) !== readiness.entityCounts[entityType])) {
    throw new TrackingGroundTruthError(
      "The locked reference review summary does not match its trajectories.",
      "TRACKING_GROUND_TRUTH_EVIDENCE_MISMATCH",
    );
  }
  return artifact;
}

export function buildMultiObjectCaseFromGroundTruth(artifactValue = {}, options = {}) {
  const artifact = validateGroundTruthArtifact(artifactValue);
  if (trackingGroundTruthArtifactBenchmarkType(artifact) !== TRACKING_BENCHMARK_TYPE_MULTI_OBJECT) {
    throw new TrackingGroundTruthError("Full-scene evaluation requires full-scene ground truth.");
  }
  const range = normalizeBenchmarkRange(artifact.range);
  const sampleTimes = [...new Set(artifact.groundTruth.tracks.flatMap((track) => (
    track.segments.flatMap((segment) => segment.points.map((point) => point.atMs))
  )))].sort((first, second) => first - second);
  const predictionTracks = (options.predictionTracks || []).map((track, index) => (
    safeTrack(track, range, index, true, sampleTimes)
  ));
  const processingMs = Number(options.performance?.processingMs);
  const benchmarkCase = {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    benchmarkType: "multi-object",
    id: String(options.id || `${artifact.id}-run-1`).slice(0, 120),
    profileId: artifact.profileId,
    sourceFingerprint: artifact.sourceFingerprint,
    frame: { ...artifact.frame },
    range: { ...artifact.range },
    groundTruth: { tracks: artifact.groundTruth.tracks.map((track) => ({ ...track })) },
    prediction: { tracks: predictionTracks },
    performance: Number.isFinite(processingMs) && processingMs > 0 ? { processingMs } : {},
    reviewEvidence: { ...artifact.reviewEvidence },
  };
  assertBenchmarkEnvelope(benchmarkCase);
  return benchmarkCase;
}

export function buildSelectedObjectCaseFromGroundTruth(artifactValue = {}, options = {}) {
  const artifact = validateGroundTruthArtifact(artifactValue);
  const range = normalizeBenchmarkRange(artifact.range);
  const targetTrackId = String(artifact.reviewEvidence?.selectedObjectTargetTrackId || "");
  const groundTruthTrack = artifact.groundTruth.tracks.find((track) => track.id === targetTrackId);
  if (!groundTruthTrack || groundTruthTrack.entityType !== "player") {
    throw new TrackingGroundTruthError("The selected-object benchmark target is missing from ground truth.");
  }
  const sampleTimes = groundTruthTrack.segments.flatMap((segment) => segment.points.map((point) => point.atMs));
  const predictionTrack = safeTrack(options.predictionTrack, range, 0, true, sampleTimes);
  const processingMs = Number(options.performance?.processingMs);
  const benchmarkCase = {
    version: TRACKING_BENCHMARK_SCHEMA_VERSION,
    id: String(options.id || `${artifact.id}-${targetTrackId}-provider-run`).slice(0, 120),
    profileId: TRACKING_SELECTED_OBJECT_PROFILE,
    sourceFingerprint: artifact.sourceFingerprint,
    frame: { ...artifact.frame },
    range: { ...artifact.range },
    groundTruth: { track: groundTruthTrack },
    prediction: { track: predictionTrack },
    performance: {
      ...(Number.isFinite(processingMs) && processingMs > 0 ? { processingMs } : {}),
      ...(options.performance?.device ? { device: String(options.performance.device).slice(0, 80) } : {}),
    },
    reviewEvidence: { ...artifact.reviewEvidence },
  };
  assertBenchmarkEnvelope(benchmarkCase);
  return benchmarkCase;
}
