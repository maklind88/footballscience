import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { calibrationReadiness } from "../domain/pitchCalibration.model.js";
import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { pitchDistance, projectTrackToPitch } from "./spatialAnalysisService.js";
import { trackingAnchorAt, trackingPointAt } from "./trackingGeometryService.js";

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function rounded(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function tracksById(tracks = []) {
  return new Map(tracks.map((track) => {
    const normalized = normalizeObjectTrack(track);
    return [normalized.id, normalized];
  }));
}

function convexHull(points = []) {
  const sorted = points.slice().sort((first, second) => first.x - second.x || first.y - second.y);
  if (sorted.length < 3) return sorted;
  const cross = (origin, first, second) => (
    ((first.x - origin.x) * (second.y - origin.y)) - ((first.y - origin.y) * (second.x - origin.x))
  );
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of sorted.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function trailPoints(track = {}, atMs = 0, durationMs = 2000, options = {}) {
  const points = [];
  const startMs = Math.max(track.startMs || 0, atMs - durationMs);
  const stepMs = Math.max(40, Math.round(Number(options.stepMs) || 120));
  for (let sampleMs = startMs; sampleMs <= atMs; sampleMs += stepMs) {
    const point = trackingPointAt(track, sampleMs, options);
    if (point) points.push({ x: point.groundPoint.x, y: point.groundPoint.y, confidence: point.confidence });
  }
  return points;
}

export function resolveDynamicGraphic(graphicValue = {}, trackValues = [], atMs = 0, options = {}) {
  const graphic = normalizeDynamicGraphic(graphicValue);
  const targetMs = Math.max(0, Math.round(Number(atMs) || 0));
  if (graphic.hidden || graphic.status !== "active" || targetMs < graphic.startMs || targetMs > graphic.endMs) return null;
  const trackMap = tracksById(trackValues);
  const bindings = graphic.bindings.map((binding) => ({ ...binding, track: trackMap.get(binding.trackId) })).filter((entry) => entry.track);
  const anchors = bindings.map((binding) => trackingAnchorAt(
    binding.track,
    targetMs,
    binding.anchor,
    { minimumConfidence: graphic.confidenceThreshold },
  ));
  if (!anchors[0]) return { id: graphic.id, type: graphic.type, available: false, reason: "tracking-gap", style: graphic.style };
  const base = {
    id: graphic.id,
    type: graphic.type,
    available: true,
    text: graphic.text,
    style: graphic.style,
    confidence: Math.min(...anchors.filter(Boolean).map((anchor) => anchor.confidence ?? 1)),
  };
  if (["circle", "spotlight", "label"].includes(graphic.type)) return { ...base, anchor: anchors[0] };
  if (graphic.type === "unit-hull") {
    const available = anchors.filter(Boolean);
    return available.length >= 3
      ? { ...base, anchors: convexHull(available) }
      : { ...base, available: false, reason: "tracking-gap" };
  }
  if (["trail", "movement-curve"].includes(graphic.type)) {
    const points = trailPoints(bindings[0].track, targetMs, graphic.trailDurationMs, {
      minimumConfidence: graphic.confidenceThreshold,
    });
    return points.length ? { ...base, points } : { ...base, available: false, reason: "tracking-gap" };
  }
  if (["distance", "unit-line"].includes(graphic.type)) {
    if (!anchors[1]) return { ...base, available: false, reason: "tracking-gap" };
    let distanceM = null;
    if (options.calibration && calibrationReadiness(options.calibration).ready) {
      const firstPitch = projectTrackToPitch(bindings[0].track, options.calibration, targetMs, {
        minimumConfidence: graphic.confidenceThreshold,
      });
      const secondPitch = projectTrackToPitch(bindings[1].track, options.calibration, targetMs, {
        minimumConfidence: graphic.confidenceThreshold,
      });
      distanceM = firstPitch && secondPitch ? pitchDistance(firstPitch, secondPitch) : null;
    }
    return {
      ...base,
      anchors: [anchors[0], anchors[1]],
      distanceM: Number.isFinite(distanceM) ? rounded(distanceM) : null,
      requiresCalibration: !Number.isFinite(distanceM),
    };
  }
  return { ...base, anchor: anchors[0] };
}

export function resolveDynamicGraphics(graphics = [], tracks = [], atMs = 0, options = {}) {
  return graphics.map((graphic) => resolveDynamicGraphic(graphic, tracks, atMs, options)).filter(Boolean);
}

export function dynamicGraphicBounds(resolved = {}) {
  if (resolved.anchor) {
    return { left: clamp(resolved.anchor.x) * 100, top: clamp(resolved.anchor.y) * 100 };
  }
  const points = resolved.anchors || resolved.points || [];
  if (!points.length) return null;
  const x = points.map((point) => clamp(point.x));
  const y = points.map((point) => clamp(point.y));
  return {
    left: Math.min(...x) * 100,
    top: Math.min(...y) * 100,
    width: (Math.max(...x) - Math.min(...x)) * 100,
    height: (Math.max(...y) - Math.min(...y)) * 100,
  };
}
