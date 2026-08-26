import {
  normalizeObjectTrack,
  normalizeTrackingPoint,
  trackingPoints,
} from "../domain/tracking.model.js";
import { trackingPrompt } from "./trackingReviewService.js";

export const DEFAULT_TRACKING_CHUNK_MS = 120_000;
export const DEFAULT_TRACKING_OVERLAP_MS = 1000;

function clamp(value, minimum = 0, maximum = 1) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : minimum));
}

function boundedDuration(value, fallback = DEFAULT_TRACKING_CHUNK_MS) {
  return Math.max(1000, Math.min(20 * 60 * 1000, Math.round(Number(value) || fallback)));
}

function normalizedRange(value = {}) {
  const startMs = Math.max(0, Math.round(Number(value.startMs ?? value.start_ms) || 0));
  return {
    startMs,
    endMs: Math.max(startMs + 1, Math.round(Number(value.endMs ?? value.end_ms) || startMs + 1)),
  };
}

export function trackingTargetRange(trackValue = {}, fallbackValue = {}) {
  const fallback = normalizedRange(fallbackValue);
  const metadata = trackValue?.metadata || {};
  const requestedStart = Number(metadata.targetStartMs);
  const requestedEnd = Number(metadata.targetEndMs);
  const startMs = Number.isFinite(requestedStart)
    ? Math.max(fallback.startMs, Math.min(fallback.endMs - 1, Math.round(requestedStart)))
    : fallback.startMs;
  const endMs = Number.isFinite(requestedEnd)
    ? Math.max(startMs + 1, Math.min(fallback.endMs, Math.round(requestedEnd)))
    : fallback.endMs;
  return { startMs, endMs };
}

function pointBox(point = {}) {
  const width = clamp(Number(point.width) * 1.12, 0.02, 1);
  const height = clamp(Number(point.height) * 1.12, 0.04, 1);
  const left = clamp(Number(point.x) - (width / 2), 0, 1 - width);
  const top = clamp(Number(point.y) - (height / 2), 0, 1 - height);
  return { left, top, width, height };
}

function identityKey(track = {}) {
  return String(track.playerId || track.playerLabel || "").trim().toLowerCase();
}

function extensionError(message, code = "TRACK_EXTENSION_INVALID") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pointScore(point = {}) {
  return (point.source === "manual" ? 10 : 0)
    + clamp(point.identityConfidence)
    + clamp(point.confidence);
}

function mergedPoints(first = [], second = []) {
  const byTime = new Map();
  for (const value of [...first, ...second]) {
    const point = normalizeTrackingPoint(value);
    const current = byTime.get(point.atMs);
    if (!current || pointScore(point) >= pointScore(current)) byTime.set(point.atMs, point);
  }
  return [...byTime.values()].sort((left, right) => left.atMs - right.atMs);
}

function segmentsFromPoints(points = [], maximumGapMs = 1500) {
  const groups = [];
  for (const point of points) {
    const current = groups.at(-1);
    if (!current || point.atMs - current.at(-1).atMs > maximumGapMs) groups.push([point]);
    else current.push(point);
  }
  return groups.map((group, index) => ({
    id: `segment-continuation-${index + 1}`,
    startMs: group[0].atMs,
    endMs: group.at(-1).atMs,
    confidence: group.reduce((total, point) => total + point.confidence, 0) / group.length,
    discontinuityBefore: index > 0,
    points: group,
  }));
}

function seamPoint(points = [], atMs = 0) {
  return points.reduce((best, point) => (
    !best || Math.abs(point.atMs - atMs) < Math.abs(best.atMs - atMs) ? point : best
  ), null);
}

function assertSeamContinuity(basePoint = {}, extensionPoint = {}) {
  const timeGapMs = Math.abs(Number(basePoint.atMs) - Number(extensionPoint.atMs));
  const distance = Math.hypot(
    Number(basePoint.x) - Number(extensionPoint.x),
    Number(basePoint.y) - Number(extensionPoint.y),
  );
  const scale = Math.max(
    0.04,
    Math.hypot(Number(basePoint.width) || 0, Number(basePoint.height) || 0),
    Math.hypot(Number(extensionPoint.width) || 0, Number(extensionPoint.height) || 0),
  );
  if (timeGapMs > 2500 || distance > Math.max(0.3, scale * 3.5)) {
    throw extensionError(
      "The continuation did not reconnect to the selected player's identity. Correct the seam before extending again.",
      "TRACK_EXTENSION_IDENTITY_BREAK",
    );
  }
}

function artifactIds(track = {}) {
  const metadata = track.metadata || {};
  return [
    ...(Array.isArray(metadata.localArtifactIds) ? metadata.localArtifactIds : []),
    metadata.localArtifactId,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

export function initialTrackingPromptChunk(value = {}, options = {}) {
  const prompt = trackingPrompt(value);
  const maximumDurationMs = boundedDuration(options.maxDurationMs);
  if (prompt.endMs - prompt.startMs <= maximumDurationMs) return prompt;
  const half = Math.floor(maximumDurationMs / 2);
  let startMs = Math.max(prompt.startMs, prompt.promptAtMs - half);
  let endMs = Math.min(prompt.endMs, startMs + maximumDurationMs);
  startMs = Math.max(prompt.startMs, endMs - maximumDurationMs);
  return { ...prompt, startMs, endMs };
}

export function trackingExtensionAvailability(trackValue = {}, rangeValue = {}) {
  const track = normalizeObjectTrack(trackValue);
  const range = normalizedRange(rangeValue);
  const points = trackingPoints(track);
  const first = points[0] || null;
  const last = points.at(-1) || null;
  const trackedStartMs = first?.atMs ?? range.startMs;
  const trackedEndMs = last?.atMs ?? range.startMs;
  return {
    earlier: Boolean(first && trackedStartMs > range.startMs),
    later: Boolean(last && trackedEndMs < range.endMs),
    trackedStartMs,
    trackedEndMs,
    trackedDurationMs: first && last ? Math.max(0, trackedEndMs - trackedStartMs) : 0,
    targetDurationMs: Math.max(1, range.endMs - range.startMs),
  };
}

export function trackingContinuationSteps(trackValue = {}, rangeValue = {}, options = {}) {
  const range = normalizedRange(rangeValue);
  const availability = trackingExtensionAvailability(trackValue, range);
  const maximumDurationMs = boundedDuration(options.maxDurationMs);
  const overlapMs = Math.max(200, Math.min(5000, Math.round(Number(options.overlapMs) || DEFAULT_TRACKING_OVERLAP_MS)));
  const netDurationMs = Math.max(1, maximumDurationMs - overlapMs);
  const earlier = availability.earlier
    ? Math.ceil((availability.trackedStartMs - range.startMs) / netDurationMs)
    : 0;
  const later = availability.later
    ? Math.ceil((range.endMs - availability.trackedEndMs) / netDurationMs)
    : 0;
  return { earlier, later, total: earlier + later };
}

export function trackingContinuationProgress(value = {}, batch = null) {
  const total = Math.max(0, Math.round(Number(batch?.total) || 0));
  if (!total) return value;
  const completed = Math.max(0, Math.min(total - 1, Math.round(Number(batch.completed) || 0)));
  const localRatio = clamp(value.ratio ?? value.progress);
  const stage = String(value.stage || "Tracking player").trim();
  return {
    ...value,
    stage: `Complete range ${completed + 1}/${total}: ${stage}`,
    ratio: clamp((completed + localRatio) / total),
    startedAtMs: Number.isFinite(Number(batch.startedAtMs)) ? Number(batch.startedAtMs) : value.startedAtMs,
  };
}

export function trackingExtensionPrompt(trackValue = {}, rangeValue = {}, direction = "later", options = {}) {
  const track = normalizeObjectTrack(trackValue);
  const range = normalizedRange(rangeValue);
  const availability = trackingExtensionAvailability(track, range);
  const points = trackingPoints(track);
  const later = direction !== "earlier";
  if (!(later ? availability.later : availability.earlier)) {
    throw extensionError("This object track already reaches the requested boundary.", "TRACK_EXTENSION_COMPLETE");
  }
  const anchor = later ? points.at(-1) : points[0];
  const overlapMs = Math.max(200, Math.min(5000, Math.round(Number(options.overlapMs) || DEFAULT_TRACKING_OVERLAP_MS)));
  const maximumDurationMs = boundedDuration(options.maxDurationMs);
  const startMs = later
    ? Math.max(range.startMs, anchor.atMs - overlapMs)
    : Math.max(range.startMs, Math.min(range.endMs, anchor.atMs + overlapMs) - maximumDurationMs);
  const endMs = later
    ? Math.min(range.endMs, startMs + maximumDurationMs)
    : Math.min(range.endMs, anchor.atMs + overlapMs);
  return trackingPrompt({
    startMs,
    endMs,
    promptAtMs: anchor.atMs,
    box: pointBox(anchor),
    playerId: track.playerId,
    playerLabel: track.playerLabel,
    teamSide: track.teamSide,
  });
}

export function mergeTrackingExtension(baseValue = {}, extensionValue = {}, direction = "later", options = {}) {
  const base = normalizeObjectTrack(baseValue);
  const extension = normalizeObjectTrack(extensionValue);
  const baseIdentity = identityKey(base);
  const extensionIdentity = identityKey(extension);
  if (baseIdentity && extensionIdentity && baseIdentity !== extensionIdentity) {
    throw extensionError("The continuation belongs to a different player identity.", "TRACK_EXTENSION_IDENTITY_BREAK");
  }
  for (const key of ["clipId", "videoId"]) {
    if (base[key] && extension[key] && base[key] !== extension[key]) {
      throw extensionError(`The continuation ${key} does not match the original track.`);
    }
  }
  const basePoints = trackingPoints(base);
  const extensionPoints = trackingPoints(extension);
  if (!basePoints.length || !extensionPoints.length) {
    throw extensionError("Both track parts need reviewable tracking points before they can be joined.");
  }
  const baseAnchor = direction === "earlier" ? basePoints[0] : basePoints.at(-1);
  const extensionBoundary = direction === "earlier" ? extensionPoints[0] : extensionPoints.at(-1);
  if ((direction === "earlier" && extensionBoundary.atMs >= baseAnchor.atMs)
    || (direction !== "earlier" && extensionBoundary.atMs <= baseAnchor.atMs)) {
    throw extensionError(
      "The continuation did not extend the tracked time range.",
      "TRACK_EXTENSION_NO_PROGRESS",
    );
  }
  assertSeamContinuity(baseAnchor, seamPoint(extensionPoints, baseAnchor.atMs));
  const points = mergedPoints(basePoints, extensionPoints);
  const segments = segmentsFromPoints(points, Math.max(250, Number(options.maximumGapMs) || 1500));
  const seamAtMs = baseAnchor.atMs;
  const localArtifactIds = [...new Set([...artifactIds(base), ...artifactIds(extension)])].slice(-64);
  const corrections = [...base.corrections, ...extension.corrections, {
    id: `continuation-${direction}-${seamAtMs}`,
    startMs: seamAtMs,
    endMs: seamAtMs,
    correctionType: "merge",
    reason: `Automatic ${direction} track continuation`,
  }];
  return normalizeObjectTrack({
    ...base,
    startMs: Math.min(base.startMs, extension.startMs),
    endMs: Math.max(base.endMs, extension.endMs),
    playerId: base.playerId || extension.playerId,
    playerLabel: base.playerLabel || extension.playerLabel,
    status: "review",
    confidence: points.reduce((total, point) => total + point.confidence, 0) / points.length,
    identityConfidence: points.reduce((total, point) => total + point.identityConfidence, 0) / points.length,
    engine: extension.engine || base.engine,
    engineVersion: extension.engineVersion || base.engineVersion,
    segments,
    corrections,
    metadata: {
      ...(base.metadata || {}),
      ...(extension.metadata || {}),
      localArtifactIds,
      localArtifactId: extension.metadata?.localArtifactId || base.metadata?.localArtifactId || "",
      localSourceArtifactId: extension.metadata?.localSourceArtifactId || base.metadata?.localSourceArtifactId || "",
      extensionCount: Math.min(10_000, Math.max(0, Number(base.metadata?.extensionCount) || 0) + 1),
      lastExtensionDirection: direction === "earlier" ? "earlier" : "later",
      lastExtensionAtMs: seamAtMs,
    },
  });
}

export function trackingExtensionCorrection(track = {}, direction = "later") {
  const normalized = normalizeObjectTrack(track);
  return {
    objectTrackId: normalized.id,
    atMs: Number(normalized.metadata?.lastExtensionAtMs) || normalized.startMs,
    correctionType: "merge",
    reason: `Automatic ${direction === "earlier" ? "earlier" : "later"} track continuation`,
    metadata: { direction: direction === "earlier" ? "earlier" : "later" },
  };
}
