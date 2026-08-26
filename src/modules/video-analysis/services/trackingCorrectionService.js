import {
  normalizeObjectTrack,
  normalizeTrackingPoint,
  trackingPoints,
} from "../domain/tracking.model.js";
import { trackingPointAt } from "./trackingGeometryService.js";

const reviewEventLimit = 240;

function localId(prefix = "correction") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function correctionRecord(type = "position", atMs = 0, options = {}) {
  const timestamp = Math.max(0, Math.round(Number(atMs) || 0));
  return {
    id: String(options.id || localId("correction")),
    startMs: timestamp,
    endMs: timestamp,
    correctionType: type,
    reason: String(options.reason || "Manual review"),
    correctedBy: String(options.correctedBy || ""),
    correctedAt: String(options.correctedAt || new Date().toISOString()),
  };
}

function event(type, atMs, label, severity = "warning", count = 1) {
  return {
    id: `${type}-${Math.max(0, Math.round(Number(atMs) || 0))}`,
    type,
    atMs: Math.max(0, Math.round(Number(atMs) || 0)),
    label,
    severity,
    count,
  };
}

function groupedPointEvents(values = [], type = "detection", label = "Review sample") {
  const sorted = [...values].sort((first, second) => first.atMs - second.atMs);
  const groups = [];
  for (const point of sorted) {
    const current = groups.at(-1);
    if (!current || point.atMs - current.at(-1).atMs > 750) groups.push([point]);
    else current.push(point);
  }
  return groups.map((group) => event(type, group[0].atMs, label, "warning", group.length));
}

export function trackingReviewEvents(trackValue = {}, options = {}) {
  const track = normalizeObjectTrack(trackValue);
  const points = trackingPoints(track);
  const minimumDetection = Number(options.minimumDetectionConfidence ?? 0.55);
  const minimumIdentity = Number(options.minimumIdentityConfidence ?? 0.65);
  const events = [];
  if (track.entityType === "player" && !track.playerId && !track.playerLabel) {
    events.push(event("identity-assignment", points[0]?.atMs ?? track.startMs, "Assign player identity", "blocking"));
  }
  if (points.length < 2) {
    events.push(event("sparse-track", points[0]?.atMs ?? track.startMs, "Add another reviewed keyframe", "blocking"));
  }
  events.push(...groupedPointEvents(
    points.filter((point) => point.confidence < minimumDetection),
    "detection-confidence",
    "Review low detection confidence",
  ));
  if (track.entityType === "player") {
    events.push(...groupedPointEvents(
      points.filter((point) => point.identityConfidence < minimumIdentity),
      "identity-confidence",
      "Confirm player identity",
    ));
  }
  track.segments.forEach((segment) => {
    if (segment.discontinuityBefore) {
      events.push(event("continuity-break", segment.startMs, "Review continuity after tracking break", "blocking"));
    }
  });
  return events
    .sort((first, second) => first.atMs - second.atMs || first.type.localeCompare(second.type))
    .slice(0, reviewEventLimit);
}

export function adjacentTrackingReviewEvent(events = [], atMs = 0, direction = "later") {
  const sorted = [...events].sort((first, second) => first.atMs - second.atMs);
  if (!sorted.length) return null;
  const target = Math.max(0, Math.round(Number(atMs) || 0));
  if (direction === "earlier") {
    return [...sorted].reverse().find((entry) => entry.atMs < target - 1) || sorted.at(-1);
  }
  return sorted.find((entry) => entry.atMs > target + 1) || sorted[0];
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

export function applyTrackingVisibilityCorrection(trackValue = {}, options = {}) {
  const track = normalizeObjectTrack(trackValue);
  const atMs = Math.max(track.startMs, Math.min(track.endMs, Math.round(Number(options.atMs) || 0)));
  const sampled = trackingPointAt(track, atMs, { maxInterpolationGapMs: 2000 });
  if (!sampled) {
    const error = new Error("No tracking sample exists at this frame. Correct the box first.");
    error.code = "TRACKING_REVIEW_SAMPLE_MISSING";
    throw error;
  }
  const point = normalizeTrackingPoint({
    ...sampled,
    atMs,
    groundX: sampled.groundPoint?.x,
    groundY: sampled.groundPoint?.y,
    confidence: 1,
    identityConfidence: sampled.identityConfidence,
    occluded: options.occluded === true,
    source: "manual",
  });
  const segmentIndex = track.segments.findIndex((segment) => atMs >= segment.startMs && atMs <= segment.endMs);
  if (segmentIndex < 0) {
    const error = new Error("This frame is outside the selected track segment.");
    error.code = "TRACKING_REVIEW_SEGMENT_MISSING";
    throw error;
  }
  const segments = [...track.segments];
  segments[segmentIndex] = segmentWithPoint(segments[segmentIndex], point);
  return normalizeObjectTrack({
    ...track,
    status: "review",
    segments,
    corrections: [...track.corrections, correctionRecord("occlusion", atMs, {
      ...options,
      reason: options.reason || (point.occluded ? "Marked occluded" : "Marked visible"),
    })],
  });
}

export function applyTrackingIdentityCorrection(trackValue = {}, identity = {}, options = {}) {
  const track = normalizeObjectTrack(trackValue);
  if (track.entityType !== "player") {
    const error = new Error("Identity assignment is only available for player tracks.");
    error.code = "TRACKING_REVIEW_IDENTITY_UNSUPPORTED";
    throw error;
  }
  const playerId = String(identity.playerId || "").trim();
  const playerLabel = String(identity.playerLabel || "").trim();
  if (!playerId && !playerLabel) {
    const error = new Error("Choose a player or enter an identity label first.");
    error.code = "TRACKING_REVIEW_IDENTITY_REQUIRED";
    throw error;
  }
  const atMs = Math.max(track.startMs, Math.min(track.endMs, Math.round(Number(options.atMs) || track.startMs)));
  const sampled = trackingPointAt(track, atMs, { maxInterpolationGapMs: 2000 });
  const segments = track.segments.map((segment) => ({ ...segment, points: [...segment.points] }));
  const segmentIndex = segments.findIndex((segment) => atMs >= segment.startMs && atMs <= segment.endMs);
  if (sampled && segmentIndex >= 0) {
    const point = normalizeTrackingPoint({
      ...sampled,
      atMs,
      groundX: sampled.groundPoint?.x,
      groundY: sampled.groundPoint?.y,
      identityConfidence: 1,
      source: "manual",
    });
    segments[segmentIndex] = segmentWithPoint(segments[segmentIndex], point);
  }
  const identityPoints = segments.flatMap((segment) => segment.points);
  const identityConfidence = identityPoints.length
    ? identityPoints.reduce((total, point) => total + point.identityConfidence, 0) / identityPoints.length
    : track.identityConfidence;
  return normalizeObjectTrack({
    ...track,
    playerId,
    playerLabel,
    teamSide: String(identity.teamSide || "").trim(),
    shirtNumber: String(identity.shirtNumber || "").trim().slice(0, 24),
    status: "review",
    identityConfidence,
    segments,
    corrections: [...track.corrections, correctionRecord("identity", atMs, {
      ...options,
      reason: options.reason || "Assigned player identity",
    })],
  });
}

export function trackingPointVisibility(trackValue = {}, atMs = 0) {
  const point = trackingPointAt(trackValue, atMs, { maxInterpolationGapMs: 2000 });
  return point ? { available: true, occluded: point.occluded === true } : { available: false, occluded: false };
}
