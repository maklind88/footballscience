import { trackingPointAt } from "../services/trackingGeometryService.js";
import { applyHomography, pitchDistance } from "../services/spatialAnalysisService.js";

export function containedVideoRect(width, height, videoWidth, videoHeight) {
  if (![width, height, videoWidth, videoHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale, h = videoHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function pairPointerPoint(x, y, rect) {
  if (!rect || x < rect.x || y < rect.y || x > rect.x + rect.width || y > rect.y + rect.height) return null;
  return { x: (x - rect.x) / rect.width, y: (y - rect.y) / rect.height };
}

export function pairPromptBox(first, last, videoWidth, videoHeight) {
  if (!first || !last || !videoWidth || !videoHeight) return null;
  const dragged = Math.hypot((last.x - first.x) * videoWidth, (last.y - first.y) * videoHeight) >= 8;
  const width = dragged ? Math.abs(last.x - first.x) : Math.min(1, 40 / videoWidth);
  const height = dragged ? Math.abs(last.y - first.y) : Math.min(1, 80 / videoHeight);
  if (width * videoWidth < 3 || height * videoHeight < 6) return null;
  const left = Math.max(0, Math.min(1 - width, dragged ? Math.min(first.x, last.x) : first.x - width / 2));
  const top = Math.max(0, Math.min(1 - height, dragged ? Math.min(first.y, last.y) : first.y - height / 2));
  return { left, top, width, height };
}

export function playerPairAt(tracks, atMs) {
  if (tracks?.length !== 2 || !Number.isFinite(atMs)) return null;
  const points = tracks.map(track => trackingPointAt(track, atMs, { minimumConfidence: .65, maxInterpolationGapMs: 350 }));
  return points.every(point => point && !point.occluded) ? points : null;
}

function insidePolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return false;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function calibrationSupport(frame) {
  const points = (frame.controlPoints || []).map(point => ({ x: point.imageX, y: point.imageY }))
    .filter(point => [point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (points.length < 4 || points.length > 200) return [];
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = ordered => {
    const hull = [];
    for (const point of ordered) {
      while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(points), ...half([...points].reverse())];
}

// A fit at one instant must never masquerade as a camera-aware metre measurement.
export function verifiedPairDistance(points, calibration, { atMs, sourceSha256, videoId, angleId } = {}) {
  if (points?.length !== 2 || calibration?.status !== "verified" || !calibration.verifiedBy || !calibration.verifiedAt
    || !/^[a-f0-9]{64}$/.test(sourceSha256 || "") || calibration.metadata?.sourceSha256 !== sourceSha256
    || calibration.videoId !== videoId || calibration.metadata?.angleId !== angleId) return null;
  const frame = calibration.frames?.find(item => atMs >= item.validFromMs && atMs <= item.validToMs
    && Math.abs(item.atMs - atMs) <= 125 && item.validToMs - item.validFromMs <= 250
    && item.confidence >= .8 && Number.isFinite(item.rmsErrorM) && item.rmsErrorM <= 1);
  if (!frame || frame.inputSpace !== "normalized-image") return null;
  const grounds = points.map(point => point.groundPoint);
  const support = calibrationSupport(frame);
  if (!grounds.every(point => point && insidePolygon(point, support))) return null;
  const projected = grounds.map(point => applyHomography(point, frame.imageToPitchMatrix));
  if (!projected.every(point => point && point.xM >= 0 && point.yM >= 0
    && point.xM <= calibration.pitchLengthM && point.yM <= calibration.pitchWidthM)) return null;
  return pitchDistance(...projected);
}
