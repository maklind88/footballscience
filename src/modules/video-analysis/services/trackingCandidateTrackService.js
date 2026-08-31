import { normalizeObjectTrack } from "../domain/tracking.model.js";

function invalid(message, code = "TRACKING_CANDIDATE_TRACK_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sourceToMatchMs(value, sync = {}) {
  const scale = 1 + ((Number(sync.driftPpm) || 0) / 1_000_000);
  return Math.max(0, Math.round((Number(value) - (Number(sync.syncOffsetMs) || 0)) / scale));
}

function pointFromObservation(observation = {}, sync = {}, identityConfidence = null) {
  return {
    atMs: sourceToMatchMs(observation.atMs, sync),
    frameIndex: observation.frameIndex,
    x: observation.box.left + (observation.box.width / 2),
    y: observation.box.top + (observation.box.height / 2),
    width: observation.box.width,
    height: observation.box.height,
    groundX: observation.box.left + (observation.box.width / 2),
    groundY: observation.box.top + observation.box.height,
    confidence: observation.confidence,
    identityConfidence: identityConfidence ?? observation.confidence,
    occluded: false,
    source: "automatic",
  };
}

function splitSegments(trajectory = {}, sync = {}, identityConfidence = null) {
  const breaks = new Set(trajectory.discontinuitiesMs || []);
  const groups = [];
  for (const observation of trajectory.observations || []) {
    if (!groups.length || [...breaks].some((atMs) => (
      observation.atMs >= atMs && groups.at(-1).at(-1).atMs < atMs
    ))) groups.push([]);
    groups.at(-1).push(observation);
  }
  return groups.filter((group) => group.length).map((group, index) => {
    const points = group.map((observation) => pointFromObservation(observation, sync, identityConfidence));
    return {
      id: `${trajectory.id}-segment-${index + 1}`,
      startMs: points[0].atMs,
      endMs: points.at(-1).atMs,
      confidence: group.reduce((sum, entry) => sum + entry.confidence, 0) / group.length,
      discontinuityBefore: index > 0,
      points,
    };
  });
}

function average(values = [], fallback = 0) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : fallback;
}

function safeId(value = "") {
  return String(value || "").replace(/[^a-z0-9._:-]/gi, "-").slice(0, 140) || "unknown";
}

function baseTrack(value = {}, lineage = {}, options = {}) {
  const segments = value.segments || [];
  return normalizeObjectTrack({
    id: value.id,
    entityType: value.entityType,
    playerId: "",
    playerLabel: "",
    teamSide: value.teamSide || (value.entityType === "referee" ? "official" : ""),
    shirtNumber: value.shirtNumber === "unknown" ? "" : value.shirtNumber || "",
    status: "review",
    startMs: lineage.matchRange.startMs,
    endMs: lineage.matchRange.endMs,
    confidence: value.confidence,
    identityConfidence: value.identityConfidence,
    engine: options.engine || "tracking-intelligence-v2-pipeline",
    engineVersion: options.engineVersion || lineage.fingerprintSha256.slice(0, 16),
    segments,
    corrections: [],
    metadata: options.metadata || {},
  });
}

export function materializeCandidateTrajectories(association = {}, observations = []) {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  return (association.trajectories || []).map((trajectory) => ({
    id: trajectory.id,
    entityType: trajectory.entityType,
    observations: trajectory.observationIds.map((id) => {
      const observation = byId.get(id);
      if (!observation) invalid("Association output references a missing detection.");
      return observation;
    }),
    confidence: trajectory.confidence,
    discontinuitiesMs: [...trajectory.discontinuitiesMs],
  }));
}

function pipelineMetadata(lineage = {}) {
  return {
    candidatePipelineProtocol: lineage.protocol,
    candidatePipelineFingerprintSha256: lineage.fingerprintSha256,
    localSourceSha256: lineage.sourceFingerprint,
    angleId: lineage.sync.angleId,
    candidateDetectionEvidenceSha256: lineage.evidenceByStage.detection,
    candidateAssociationEvidenceSha256: lineage.evidenceByStage.association,
    candidateReidentificationEvidenceSha256: lineage.evidenceByStage.reidentification,
    candidateClassificationEvidenceSha256: lineage.evidenceByStage.classification,
  };
}

function trackForTrajectory(trajectory = {}, lineage = {}, options = {}) {
  return baseTrack({
    id: trajectory.id,
    entityType: trajectory.entityType,
    confidence: trajectory.confidence,
    identityConfidence: options.identityConfidence ?? trajectory.confidence,
    teamSide: options.teamSide,
    shirtNumber: options.shirtNumber,
    segments: splitSegments(trajectory, lineage.sync, options.identityConfidence),
  }, lineage, options);
}

function groupedTrajectories(trajectories = [], identities = []) {
  const identityByTrajectory = new Map(identities.map((entry) => [entry.trajectoryId, entry]));
  const groups = new Map();
  for (const trajectory of trajectories) {
    const identity = trajectory.entityType === "player" ? identityByTrajectory.get(trajectory.id) : null;
    const key = identity ? `player:${identity.identityKey}` : `${trajectory.entityType}:${trajectory.id}`;
    if (!groups.has(key)) groups.set(key, { key, entityType: trajectory.entityType, identity, trajectories: [] });
    groups.get(key).trajectories.push(trajectory);
  }
  for (const group of groups.values()) {
    const windows = group.trajectories.map((trajectory) => ({
      startMs: trajectory.observations[0]?.atMs,
      endMs: trajectory.observations.at(-1)?.atMs,
    })).sort((left, right) => left.startMs - right.startMs);
    if (windows.some((window, index) => index > 0 && window.startMs <= windows[index - 1].endMs)) {
      invalid("Re-identification assigned one identity to simultaneous trajectories.", "TRACKING_CANDIDATE_IDENTITY_COLLISION");
    }
  }
  return [...groups.values()];
}

function consensus(values = []) {
  const labels = [...new Set(values.map(String).filter((value) => value && value !== "unknown"))];
  return { value: labels.length === 1 ? labels[0] : "", conflict: labels.length > 1 };
}

function groupedTrack(group = {}, classifications = new Map(), lineage = {}, withClassification = false) {
  const classValues = group.trajectories.map((trajectory) => classifications.get(trajectory.id) || {});
  const team = consensus(classValues.map((entry) => entry.teamSide));
  const shirt = consensus(classValues.map((entry) => entry.shirtNumber));
  const identityConfidence = group.entityType === "player"
    ? Number(group.identity?.confidence) || 0
    : average(group.trajectories.map((entry) => entry.confidence));
  const segments = group.trajectories.flatMap((trajectory, trajectoryIndex) => (
    splitSegments(trajectory, lineage.sync, identityConfidence).map((segment, segmentIndex) => ({
      ...segment,
      id: `${safeId(group.key)}-${trajectory.id}-${segmentIndex + 1}`,
      discontinuityBefore: trajectoryIndex > 0 || segment.discontinuityBefore,
    }))
  )).sort((left, right) => left.startMs - right.startMs);
  return {
    track: baseTrack({
      id: `candidate-${safeId(group.key)}`,
      entityType: group.entityType,
      confidence: average(group.trajectories.map((entry) => entry.confidence)),
      identityConfidence,
      teamSide: withClassification ? team.value : "",
      shirtNumber: withClassification ? shirt.value : "",
      segments,
    }, lineage, { metadata: pipelineMetadata(lineage) }),
    classificationConflict: withClassification && (team.conflict || shirt.conflict),
    mergedTrajectoryCount: Math.max(0, group.trajectories.length - 1),
  };
}

export function candidateStageTracks(value = {}) {
  const lineage = value.lineage || {};
  const detection = value.detection?.payload || value.detection || {};
  const association = value.association?.payload || value.association || {};
  const reidentification = value.reidentification?.payload || value.reidentification || {};
  const classification = value.classification?.payload || value.classification || {};
  const observations = detection.observations || [];
  const trajectories = materializeCandidateTrajectories(association, observations);
  const classificationByTrajectory = new Map((classification.classifications || []).map((entry) => [entry.trajectoryId, entry]));
  const groups = groupedTrajectories(trajectories, reidentification.identities || []);
  const groupedWithoutLabels = groups.map((group) => groupedTrack(group, classificationByTrajectory, lineage, false));
  const groupedWithLabels = groups.map((group) => groupedTrack(group, classificationByTrajectory, lineage, true));
  return {
    detection: observations.map((observation) => baseTrack({
      id: `detection-${observation.id}`,
      entityType: observation.entityType,
      confidence: observation.confidence,
      identityConfidence: observation.entityType === "player" ? 0 : observation.confidence,
      segments: [{
        id: `detection-${observation.id}-segment`,
        startMs: sourceToMatchMs(observation.atMs, lineage.sync),
        endMs: sourceToMatchMs(observation.atMs, lineage.sync),
        confidence: observation.confidence,
        discontinuityBefore: false,
        points: [pointFromObservation(observation, lineage.sync, observation.entityType === "player" ? 0 : observation.confidence)],
      }],
    }, lineage)),
    association: trajectories.map((trajectory) => trackForTrajectory(trajectory, lineage)),
    reidentification: groupedWithoutLabels.map((entry) => entry.track),
    classification: trajectories.map((trajectory) => {
      const classificationValue = classificationByTrajectory.get(trajectory.id) || {};
      return trackForTrajectory(trajectory, lineage, {
        teamSide: classificationValue.teamSide,
        shirtNumber: classificationValue.shirtNumber,
      });
    }),
    review: groupedWithLabels.map((entry) => entry.track),
    classificationConflictCount: groupedWithLabels.filter((entry) => entry.classificationConflict).length,
    reidentificationMergeCount: groupedWithLabels.reduce((sum, entry) => sum + entry.mergedTrajectoryCount, 0),
    observations,
    trajectories,
  };
}

export function candidateReviewSummary(value = {}) {
  const tracks = value.review || [];
  const assigned = new Set((value.trajectories || []).flatMap((trajectory) => trajectory.observations.map((entry) => entry.id)));
  return {
    trackCount: tracks.length,
    playerTrackCount: tracks.filter((track) => track.entityType === "player").length,
    ballTrackCount: tracks.filter((track) => track.entityType === "ball").length,
    refereeTrackCount: tracks.filter((track) => track.entityType === "referee").length,
    unassignedObservationCount: (value.observations || []).filter((observation) => !assigned.has(observation.id)).length,
    playerIdentityReviewCount: tracks.filter((track) => track.entityType === "player" && !track.playerId).length,
    lowConfidenceTrackCount: tracks.filter((track) => track.confidence < 0.55 || track.identityConfidence < 0.65).length,
    classificationConflictCount: Number(value.classificationConflictCount) || 0,
    reidentificationMergeCount: Number(value.reidentificationMergeCount) || 0,
  };
}
