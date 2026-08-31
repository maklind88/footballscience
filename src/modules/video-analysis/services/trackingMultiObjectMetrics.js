import {
  globalIdentityMetrics,
  harmonicMean,
  maximumWeightAssignment,
  safeRatio,
} from "./trackingAssignmentMetrics.js";
import {
  mean,
  percentile,
  sampleTrackAt,
  trackingBoxIou,
} from "./trackingBenchmarkMetrics.js";
import {
  normalizedTrackingIdentity,
  trackingIdentityKey,
} from "./trackingBenchmarkContract.js";

const entityTypes = ["player", "ball", "referee"];
const personEntityTypes = new Set(["person", "player", "referee"]);

function exactVisiblePoint(track = {}, atMs = 0) {
  for (const segment of track.segments || []) {
    const point = segment.points.find((entry) => entry.atMs === atMs);
    if (point) return point.occluded ? null : point;
  }
  return null;
}

function observationsAt(tracks = [], atMs = 0, sampling = {}, exact = false) {
  return tracks.flatMap((track) => {
    const point = exact ? exactVisiblePoint(track, atMs) : sampleTrackAt(track, atMs, sampling);
    return point ? [{ track, point }] : [];
  });
}

export function multiObjectSampleTimes(tracks = [], maximum = 50_000) {
  const times = [...new Set(tracks.flatMap((track) => (
    track.segments.flatMap((segment) => segment.points.filter((point) => !point.occluded).map((point) => point.atMs))
  )))].sort((first, second) => first - second);
  if (!times.length || times.length > maximum) return null;
  return times;
}

export function matchTrackingFrame(truth = [], prediction = [], minimumIou = 0.5) {
  const weights = truth.map((truthObservation) => prediction.map(
    (predictionObservation) => trackingBoxIou(truthObservation.point, predictionObservation.point),
  ));
  const assignment = maximumWeightAssignment(weights, minimumIou);
  const matchedTruth = new Set(assignment.map((pair) => pair.rowIndex));
  const matchedPrediction = new Set(assignment.map((pair) => pair.columnIndex));
  return {
    matches: assignment.map((pair) => ({
      truth: truth[pair.rowIndex],
      prediction: prediction[pair.columnIndex],
      iou: pair.weight,
    })),
    unmatchedTruth: truth.filter((_, index) => !matchedTruth.has(index)),
    unmatchedPrediction: prediction.filter((_, index) => !matchedPrediction.has(index)),
  };
}

export function buildMultiObjectFrames(truthTracks, predictionTracks, sampling = {}) {
  const times = multiObjectSampleTimes(truthTracks);
  if (!times) return null;
  return times.map((atMs) => {
    const truth = observationsAt(truthTracks, atMs, sampling, true);
    const prediction = observationsAt(predictionTracks, atMs, sampling, false);
    return { atMs, truth, prediction, ...matchTrackingFrame(truth, prediction, sampling.minimumIou) };
  });
}

function pairCountMap(frames = []) {
  const counts = new Map();
  for (const frame of frames) {
    for (const match of frame.matches) {
      const truthId = match.truth.track.id;
      const predictionId = match.prediction.track.id;
      if (!counts.has(truthId)) counts.set(truthId, new Map());
      const predictionCounts = counts.get(truthId);
      predictionCounts.set(predictionId, (predictionCounts.get(predictionId) || 0) + 1);
    }
  }
  return counts;
}

function continuityMetrics(frames = [], maximumSwitchGapMs = 2500) {
  const state = new Map();
  const events = [];
  let identitySwitches = 0;
  let fragmentations = 0;
  for (const frame of frames) {
    const matchedByTruth = new Map(frame.matches.map((match) => [match.truth.track.id, match]));
    for (const truth of frame.truth) {
      const current = state.get(truth.track.id) || {
        lastPredictionId: "",
        lastMatchAtMs: null,
        trackedBefore: false,
        missedAfterTrack: false,
        visible: 0,
        matched: 0,
      };
      current.visible += 1;
      const match = matchedByTruth.get(truth.track.id);
      if (match) {
        current.matched += 1;
        if (current.missedAfterTrack) {
          fragmentations += 1;
          events.push({ atMs: frame.atMs, entityType: truth.track.entityType, type: "fragmentation" });
        }
        if (current.lastPredictionId
          && current.lastPredictionId !== match.prediction.track.id
          && frame.atMs - current.lastMatchAtMs <= maximumSwitchGapMs) {
          identitySwitches += 1;
          events.push({ atMs: frame.atMs, entityType: truth.track.entityType, type: "identity-switch" });
        }
        current.lastPredictionId = match.prediction.track.id;
        current.lastMatchAtMs = frame.atMs;
        current.trackedBefore = true;
        current.missedAfterTrack = false;
      } else if (current.trackedBefore) {
        current.missedAfterTrack = true;
      }
      state.set(truth.track.id, current);
    }
  }
  const coverage = [...state.values()].map((entry) => entry.matched / entry.visible);
  return {
    events,
    identitySwitches,
    fragmentations,
    mostlyTracked: coverage.filter((ratio) => ratio >= 0.8).length,
    partiallyTracked: coverage.filter((ratio) => ratio > 0.2 && ratio < 0.8).length,
    mostlyLost: coverage.filter((ratio) => ratio <= 0.2).length,
  };
}

function classificationMetrics(frames = []) {
  const entity = [];
  const team = [];
  const playerIdentity = [];
  const shirtNumber = [];
  for (const frame of frames) {
    for (const match of frame.matches) {
      const truth = match.truth.track;
      const prediction = match.prediction.track;
      entity.push(truth.entityType === prediction.entityType ? 1 : 0);
      if (truth.entityType === "player" && (truth.teamId || truth.teamSide)) {
        team.push(normalizedTrackingIdentity(truth.teamId || truth.teamSide)
          === normalizedTrackingIdentity(prediction.teamId || prediction.teamSide) ? 1 : 0);
      }
      if (truth.entityType === "player" && trackingIdentityKey(truth)) {
        playerIdentity.push(trackingIdentityKey(truth) === trackingIdentityKey(prediction) ? 1 : 0);
      }
      if (truth.entityType === "player" && String(truth.shirtNumber || "").trim()) {
        shirtNumber.push(normalizedTrackingIdentity(truth.shirtNumber)
          === normalizedTrackingIdentity(prediction.shirtNumber) ? 1 : 0);
      }
    }
  }
  return {
    entityTypeAccuracy: mean(entity),
    teamAccuracy: mean(team),
    playerIdentityAccuracy: mean(playerIdentity),
    shirtNumberAccuracy: mean(shirtNumber),
  };
}

function perEntityMetrics(frames = []) {
  const metrics = Object.fromEntries(entityTypes.map((entityType) => {
    let truthCount = 0;
    let predictionCount = 0;
    let truePositives = 0;
    for (const frame of frames) {
      truthCount += frame.truth.filter((entry) => entry.track.entityType === entityType).length;
      predictionCount += frame.prediction.filter((entry) => entry.track.entityType === entityType).length;
      truePositives += frame.matches.filter((match) => (
        match.truth.track.entityType === entityType && match.prediction.track.entityType === entityType
      )).length;
    }
    const precision = safeRatio(truePositives, predictionCount) ?? 0;
    const recall = safeRatio(truePositives, truthCount) ?? 0;
    return [entityType, {
      truthCount,
      predictionCount,
      truePositives,
      falsePositives: Math.max(0, predictionCount - truePositives),
      falseNegatives: Math.max(0, truthCount - truePositives),
      precision,
      recall,
      f1: harmonicMean(precision, recall),
    }];
  }));
  let truthCount = 0;
  let predictionCount = 0;
  let truePositives = 0;
  for (const frame of frames) {
    truthCount += frame.truth.filter((entry) => personEntityTypes.has(entry.track.entityType)).length;
    predictionCount += frame.prediction.filter((entry) => personEntityTypes.has(entry.track.entityType)).length;
    truePositives += frame.matches.filter((match) => (
      personEntityTypes.has(match.truth.track.entityType)
      && personEntityTypes.has(match.prediction.track.entityType)
    )).length;
  }
  const precision = safeRatio(truePositives, predictionCount) ?? 0;
  const recall = safeRatio(truePositives, truthCount) ?? 0;
  return {
    ...metrics,
    person: {
      truthCount,
      predictionCount,
      truePositives,
      falsePositives: Math.max(0, predictionCount - truePositives),
      falseNegatives: Math.max(0, truthCount - truePositives),
      precision,
      recall,
      f1: harmonicMean(precision, recall),
    },
  };
}

function eventCounts(events = [], entityType = "") {
  const selected = entityType ? events.filter((event) => event.entityType === entityType) : events;
  return {
    identitySwitches: selected.filter((event) => event.type === "identity-switch").length,
    fragmentations: selected.filter((event) => event.type === "fragmentation").length,
  };
}

function entityFrameMetrics(frame = {}, entityType = "", events = []) {
  const truth = frame.truth.filter((entry) => entry.track.entityType === entityType);
  const prediction = frame.prediction.filter((entry) => entry.track.entityType === entityType);
  const matches = frame.matches.filter((match) => (
    match.truth.track.entityType === entityType && match.prediction.track.entityType === entityType
  ));
  return {
    truthCount: truth.length,
    predictionCount: prediction.length,
    matchedCount: matches.length,
    falseNegatives: Math.max(0, truth.length - matches.length),
    falsePositives: Math.max(0, prediction.length - matches.length),
    meanIou: mean(matches.map((match) => match.iou)),
    ...eventCounts(events, entityType),
  };
}

function frameDiagnostic(frame = {}, events = []) {
  return {
    atMs: frame.atMs,
    truthCount: frame.truth.length,
    predictionCount: frame.prediction.length,
    matchedCount: frame.matches.length,
    falseNegatives: frame.unmatchedTruth.length,
    falsePositives: frame.unmatchedPrediction.length,
    meanIou: mean(frame.matches.map((match) => match.iou)),
    ...eventCounts(events),
    perEntity: Object.fromEntries(entityTypes.map((entityType) => [
      entityType,
      entityFrameMetrics(frame, entityType, events),
    ])),
  };
}

function frameErrorCount(value = {}) {
  return Number(value.falseNegatives || 0) + Number(value.falsePositives || 0);
}

function frameContinuityCount(value = {}) {
  return Number(value.identitySwitches || 0) + Number(value.fragmentations || 0);
}

function compareFrameDiagnostics(first = {}, second = {}) {
  return (
    (second.falseNegatives + second.falsePositives) - (first.falseNegatives + first.falsePositives)
      || frameContinuityCount(second) - frameContinuityCount(first)
      || (first.meanIou ?? 0) - (second.meanIou ?? 0)
      || first.atMs - second.atMs
  );
}

function compareEntityDiagnostics(entityType = "") {
  return (first = {}, second = {}) => {
    const left = first.perEntity?.[entityType] || {};
    const right = second.perEntity?.[entityType] || {};
    return frameContinuityCount(right) - frameContinuityCount(left)
      || frameErrorCount(right) - frameErrorCount(left)
      || (left.meanIou ?? 0) - (right.meanIou ?? 0)
      || first.atMs - second.atMs;
  };
}

function worstFrames(frames = [], continuityEvents = []) {
  const byTime = new Map();
  continuityEvents.forEach((event) => {
    if (!byTime.has(event.atMs)) byTime.set(event.atMs, []);
    byTime.get(event.atMs).push(event);
  });
  const entries = frames.map((frame) => frameDiagnostic(frame, byTime.get(frame.atMs) || []));
  const selected = new Map(entries.slice().sort(compareFrameDiagnostics).slice(0, 12)
    .map((entry) => [entry.atMs, entry]));
  entityTypes.forEach((entityType) => {
    entries.slice().sort(compareEntityDiagnostics(entityType)).slice(0, 4)
      .forEach((entry) => selected.set(entry.atMs, entry));
  });
  entries.filter((entry) => frameContinuityCount(entry) > 0)
    .sort((first, second) => frameContinuityCount(second) - frameContinuityCount(first))
    .slice(0, 8)
    .forEach((entry) => selected.set(entry.atMs, entry));
  return [...selected.values()].sort(compareFrameDiagnostics).slice(0, 24);
}

export function summarizeMultiObjectFrames(frames = [], options = {}) {
  const truthDetections = frames.reduce((total, frame) => total + frame.truth.length, 0);
  const predictionDetections = frames.reduce((total, frame) => total + frame.prediction.length, 0);
  const truePositives = frames.reduce((total, frame) => total + frame.matches.length, 0);
  const falseNegatives = Math.max(0, truthDetections - truePositives);
  const falsePositives = Math.max(0, predictionDetections - truePositives);
  const precision = safeRatio(truePositives, predictionDetections) ?? 0;
  const recall = safeRatio(truePositives, truthDetections) ?? 0;
  const ious = frames.flatMap((frame) => frame.matches.map((match) => match.iou));
  const continuity = continuityMetrics(frames, options.maximumIdentitySwitchGapMs);
  const identity = globalIdentityMetrics(pairCountMap(frames), truthDetections, predictionDetections);
  const perEntity = perEntityMetrics(frames);
  const durationMinutes = options.durationMs / 60_000;
  const confidenceErrors = frames.flatMap((frame) => {
    const matchedIds = new Set(frame.matches.map((match) => match.prediction.track.id));
    return frame.prediction.map((entry) => (
      entry.point.confidence - (matchedIds.has(entry.track.id) ? 1 : 0)
    ) ** 2);
  });
  return {
    evaluatedFrames: frames.length,
    truthDetections,
    predictionDetections,
    truePositives,
    falsePositives,
    falseNegatives,
    detectionPrecision: precision,
    detectionRecall: recall,
    detectionF1: harmonicMean(precision, recall),
    detectionAccuracy: safeRatio(truePositives, truePositives + falsePositives + falseNegatives) ?? 0,
    meanIou: mean(ious),
    p10Iou: percentile(ious, 0.1),
    identitySwitches: continuity.identitySwitches,
    identitySwitchesPerMinute: continuity.identitySwitches / durationMinutes,
    fragmentations: continuity.fragmentations,
    fragmentationsPerMinute: continuity.fragmentations / durationMinutes,
    mostlyTracked: continuity.mostlyTracked,
    partiallyTracked: continuity.partiallyTracked,
    mostlyLost: continuity.mostlyLost,
    mota: 1 - ((falseNegatives + falsePositives + continuity.identitySwitches) / truthDetections),
    ...identity,
    ...classificationMetrics(frames),
    detectionBrierScore: mean(confidenceErrors),
    perEntity,
    worstFrames: worstFrames(frames, continuity.events),
  };
}
