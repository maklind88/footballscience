import { normalizeObjectTrack, normalizeTrackingPoint } from "../domain/tracking.model.js";

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function pointDistance(first = {}, second = {}) {
  const deltaX = Number(first.x || 0) - Number(second.x || 0);
  const deltaY = Number(first.y || 0) - Number(second.y || 0);
  return Math.hypot(deltaX, deltaY);
}

function interpolateValue(first, second, ratio) {
  return Number(first || 0) + ((Number(second || 0) - Number(first || 0)) * ratio);
}

function interpolatePoint(first, second, atMs) {
  const spanMs = Math.max(1, second.atMs - first.atMs);
  const ratio = clamp((atMs - first.atMs) / spanMs);
  return normalizeTrackingPoint({
    atMs,
    frameIndex: Math.round(interpolateValue(first.frameIndex, second.frameIndex, ratio)),
    x: interpolateValue(first.x, second.x, ratio),
    y: interpolateValue(first.y, second.y, ratio),
    width: interpolateValue(first.width, second.width, ratio),
    height: interpolateValue(first.height, second.height, ratio),
    groundX: interpolateValue(first.groundPoint?.x, second.groundPoint?.x, ratio),
    groundY: interpolateValue(first.groundPoint?.y, second.groundPoint?.y, ratio),
    confidence: Math.min(first.confidence, second.confidence) * 0.96,
    identityConfidence: Math.min(first.identityConfidence, second.identityConfidence) * 0.96,
    occluded: first.occluded || second.occluded,
    source: "interpolated",
  });
}

export function trackingPointAt(track = {}, atMs = 0, options = {}) {
  const normalized = normalizeObjectTrack(track);
  const targetMs = Math.max(0, Math.round(Number(atMs) || 0));
  const maxInterpolationGapMs = Math.max(1, Number(options.maxInterpolationGapMs || 1000));
  const minimumConfidence = clamp(options.minimumConfidence ?? 0);
  for (const segment of normalized.segments) {
    if (targetMs < segment.startMs || targetMs > segment.endMs || !segment.points.length) continue;
    const exact = segment.points.find((point) => point.atMs === targetMs);
    if (exact) return exact.confidence >= minimumConfidence ? exact : null;
    const nextIndex = segment.points.findIndex((point) => point.atMs > targetMs);
    if (nextIndex <= 0) return null;
    const first = segment.points[nextIndex - 1];
    const second = segment.points[nextIndex];
    if (second.atMs - first.atMs > maxInterpolationGapMs) return null;
    const point = interpolatePoint(first, second, targetMs);
    return point.confidence >= minimumConfidence ? point : null;
  }
  return null;
}

export function trackingAnchorAt(track = {}, atMs = 0, anchor = "ground", options = {}) {
  const point = trackingPointAt(track, atMs, options);
  if (!point) return null;
  if (anchor === "center") return { x: point.x, y: point.y, confidence: point.confidence };
  if (anchor === "top") {
    return { x: point.x, y: clamp(point.y - (point.height / 2)), confidence: point.confidence };
  }
  if (anchor === "left") {
    return { x: clamp(point.x - (point.width / 2)), y: point.y, confidence: point.confidence };
  }
  if (anchor === "right") {
    return { x: clamp(point.x + (point.width / 2)), y: point.y, confidence: point.confidence };
  }
  return { ...point.groundPoint, confidence: point.confidence };
}

export function trackingMovementInImage(track = {}, startMs = 0, endMs = 0, stepMs = 100) {
  const points = [];
  const start = Math.max(0, Math.round(Number(startMs) || 0));
  const end = Math.max(start, Math.round(Number(endMs) || start));
  const step = Math.max(20, Math.round(Number(stepMs) || 100));
  for (let atMs = start; atMs <= end; atMs += step) {
    const point = trackingPointAt(track, atMs);
    if (point) points.push(point.groundPoint);
  }
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += pointDistance(points[index - 1], points[index]);
  }
  return { distance, sampleCount: points.length };
}

