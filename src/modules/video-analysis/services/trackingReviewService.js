import {
  normalizeObjectTrack,
  normalizeTrackingPoint,
  trackingCoverage,
  trackingPoints,
} from "../domain/tracking.model.js";

function localId(prefix = "track") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function normalizedBox(value = {}) {
  const left = clamp(value.left ?? value.x ?? 0);
  const top = clamp(value.top ?? value.y ?? 0);
  const width = clamp(value.width ?? value.w ?? 0.08, 0.01, 1 - left);
  const height = clamp(value.height ?? value.h ?? 0.16, 0.01, 1 - top);
  return { left, top, width, height };
}

export function trackingPrompt(value = {}) {
  const box = normalizedBox(value.box || value);
  const startMs = Math.max(0, Math.round(Number(value.startMs ?? value.atMs) || 0));
  return {
    id: String(value.id || localId("prompt")),
    startMs,
    endMs: Math.max(startMs + 1, Math.round(Number(value.endMs) || startMs + 5000)),
    box,
    point: {
      x: box.left + (box.width / 2),
      y: box.top + (box.height / 2),
      groundX: box.left + (box.width / 2),
      groundY: box.top + box.height,
    },
    playerId: String(value.playerId || ""),
    playerLabel: String(value.playerLabel || ""),
    teamSide: String(value.teamSide || ""),
  };
}

export function createManualPromptTrack(value = {}) {
  const prompt = trackingPrompt(value);
  const point = normalizeTrackingPoint({
    atMs: prompt.startMs,
    x: prompt.point.x,
    y: prompt.point.y,
    width: prompt.box.width,
    height: prompt.box.height,
    groundX: prompt.point.groundX,
    groundY: prompt.point.groundY,
    confidence: 1,
    identityConfidence: prompt.playerId ? 1 : 0.5,
    source: "manual",
  });
  return normalizeObjectTrack({
    id: String(value.id || localId("track")),
    clipId: value.clipId,
    videoId: value.videoId,
    entityType: "player",
    playerId: prompt.playerId,
    playerLabel: prompt.playerLabel,
    teamId: value.teamId,
    teamSide: prompt.teamSide,
    status: "review",
    startMs: prompt.startMs,
    endMs: prompt.endMs,
    confidence: 1,
    identityConfidence: point.identityConfidence,
    engine: String(value.engine || "manual-keyframes"),
    engineVersion: String(value.engineVersion || "1"),
    segments: [{
      id: localId("segment"),
      startMs: prompt.startMs,
      endMs: prompt.endMs,
      confidence: 1,
      points: [point],
    }],
    metadata: value.metadata || {},
  });
}

function segmentWithPoint(segment = {}, point = {}) {
  const points = [...(segment.points || []).filter((entry) => entry.atMs !== point.atMs), point]
    .sort((first, second) => first.atMs - second.atMs);
  return {
    ...segment,
    startMs: Math.min(segment.startMs, point.atMs),
    endMs: Math.max(segment.endMs, point.atMs),
    points,
  };
}

export function applyManualTrackingCorrection(trackValue = {}, correction = {}) {
  const track = normalizeObjectTrack(trackValue);
  const prompt = trackingPrompt({
    ...correction,
    startMs: correction.atMs ?? correction.startMs,
    endMs: correction.atMs ?? correction.startMs,
  });
  const point = normalizeTrackingPoint({
    atMs: prompt.startMs,
    x: prompt.point.x,
    y: prompt.point.y,
    width: prompt.box.width,
    height: prompt.box.height,
    groundX: prompt.point.groundX,
    groundY: prompt.point.groundY,
    confidence: 1,
    identityConfidence: 1,
    source: "manual",
  });
  const targetIndex = track.segments.findIndex((segment) => (
    point.atMs >= segment.startMs - 1000 && point.atMs <= segment.endMs + 1000
  ));
  const segments = [...track.segments];
  if (targetIndex >= 0) segments[targetIndex] = segmentWithPoint(segments[targetIndex], point);
  else {
    segments.push({
      id: localId("segment"),
      startMs: point.atMs,
      endMs: point.atMs,
      confidence: 1,
      discontinuityBefore: segments.length > 0,
      points: [point],
    });
  }
  return normalizeObjectTrack({
    ...track,
    playerId: correction.playerId ?? track.playerId,
    playerLabel: correction.playerLabel ?? track.playerLabel,
    status: "review",
    segments: segments.sort((first, second) => first.startMs - second.startMs),
    corrections: [...track.corrections, {
      id: localId("correction"),
      startMs: point.atMs,
      endMs: point.atMs,
      correctionType: correction.correctionType || "position",
      reason: correction.reason || "Manual keyframe",
      correctedBy: correction.correctedBy || "",
      correctedAt: correction.correctedAt || new Date().toISOString(),
    }],
  });
}

export function trackingReviewSummary(trackValue = {}, options = {}) {
  const track = normalizeObjectTrack(trackValue);
  const points = trackingPoints(track);
  const coverage = trackingCoverage(track);
  const minimumDetection = Number(options.minimumDetectionConfidence ?? 0.55);
  const minimumIdentity = Number(options.minimumIdentityConfidence ?? 0.65);
  const minimumCoverage = Number(options.minimumCoverage ?? 0.8);
  const lowDetectionCount = points.filter((point) => point.confidence < minimumDetection).length;
  const lowIdentityCount = points.filter((point) => point.identityConfidence < minimumIdentity).length;
  const discontinuityCount = track.segments.filter((segment) => segment.discontinuityBefore).length;
  const issues = [];
  if (!track.playerId && !track.playerLabel) issues.push("Assign a player identity");
  if (coverage.ratio < minimumCoverage) issues.push("Tracking coverage is incomplete");
  if (lowDetectionCount) issues.push(`${lowDetectionCount} low-confidence samples`);
  if (lowIdentityCount) issues.push(`${lowIdentityCount} identity checks required`);
  if (discontinuityCount) issues.push(`${discontinuityCount} continuity breaks`);
  return {
    coverage,
    lowDetectionCount,
    lowIdentityCount,
    discontinuityCount,
    issues,
    canVerify: points.length >= 2 && issues.length === 0,
  };
}

export function verifyObjectTrack(trackValue = {}, options = {}) {
  const track = normalizeObjectTrack(trackValue);
  const review = trackingReviewSummary(track, options);
  if (!review.canVerify) {
    const error = new Error(review.issues.join(". ") || "The track needs more review.");
    error.code = "TRACK_REVIEW_REQUIRED";
    throw error;
  }
  return normalizeObjectTrack({ ...track, status: "verified" });
}

export function trackingMetadataPayload(trackValue = {}) {
  const track = normalizeObjectTrack(trackValue);
  const coverage = trackingCoverage(track);
  return {
    id: track.id,
    clipId: track.clipId,
    videoId: track.videoId,
    entityType: track.entityType,
    playerId: track.playerId,
    playerLabel: track.playerLabel,
    teamSide: track.teamSide,
    shirtNumber: track.shirtNumber,
    status: track.status,
    startMs: track.startMs,
    endMs: track.endMs,
    confidence: track.confidence,
    identityConfidence: track.identityConfidence,
    engine: track.engine,
    engineVersion: track.engineVersion,
    pointCount: coverage.pointCount,
    segmentCount: coverage.segmentCount,
    coverageRatio: coverage.ratio,
    localArtifactId: track.metadata?.localArtifactId || "",
    localArtifactHash: track.metadata?.localArtifactHash || "",
    metadata: { ...(track.metadata || {}), pointsStoredLocally: true },
  };
}
