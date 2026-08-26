function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}

export function mean(values = []) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + finiteNumber(value), 0) / values.length;
}

export function percentile(values = [], probability = 0.5) {
  if (!values.length) return null;
  const sorted = values.map((value) => finiteNumber(value)).sort((first, second) => first - second);
  if (sorted.length === 1) return sorted[0];
  const rank = clamp(probability) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const ratio = rank - lowerIndex;
  return sorted[lowerIndex] + ((sorted[upperIndex] - sorted[lowerIndex]) * ratio);
}

function pointBox(point = {}) {
  const width = Math.max(0, finiteNumber(point.width));
  const height = Math.max(0, finiteNumber(point.height));
  const x = finiteNumber(point.x);
  const y = finiteNumber(point.y);
  return {
    left: x - (width / 2),
    right: x + (width / 2),
    top: y - (height / 2),
    bottom: y + (height / 2),
    area: width * height,
  };
}

export function trackingBoxIou(first = {}, second = {}) {
  const firstBox = pointBox(first);
  const secondBox = pointBox(second);
  if (firstBox.area <= 0 || secondBox.area <= 0) return 0;
  const width = Math.max(0, Math.min(firstBox.right, secondBox.right) - Math.max(firstBox.left, secondBox.left));
  const height = Math.max(0, Math.min(firstBox.bottom, secondBox.bottom) - Math.max(firstBox.top, secondBox.top));
  const intersection = width * height;
  const union = firstBox.area + secondBox.area - intersection;
  return union > 0 ? clamp(intersection / union) : 0;
}

export function normalizedPointDistance(first = {}, second = {}) {
  return Math.hypot(
    finiteNumber(first.x) - finiteNumber(second.x),
    finiteNumber(first.y) - finiteNumber(second.y),
  );
}

export function pixelPointDistance(first = {}, second = {}, frame = {}) {
  const width = Math.max(1, finiteNumber(frame.width, 1));
  const height = Math.max(1, finiteNumber(frame.height, 1));
  return Math.hypot(
    (finiteNumber(first.x) - finiteNumber(second.x)) * width,
    (finiteNumber(first.y) - finiteNumber(second.y)) * height,
  );
}

function interpolateValue(first, second, ratio) {
  return finiteNumber(first) + ((finiteNumber(second) - finiteNumber(first)) * ratio);
}

function interpolatedPoint(first = {}, second = {}, atMs = 0) {
  const durationMs = Math.max(1, second.atMs - first.atMs);
  const ratio = clamp((atMs - first.atMs) / durationMs);
  return {
    atMs,
    frameIndex: Math.round(interpolateValue(first.frameIndex, second.frameIndex, ratio)),
    x: interpolateValue(first.x, second.x, ratio),
    y: interpolateValue(first.y, second.y, ratio),
    width: interpolateValue(first.width, second.width, ratio),
    height: interpolateValue(first.height, second.height, ratio),
    groundPoint: {
      x: interpolateValue(first.groundPoint?.x, second.groundPoint?.x, ratio),
      y: interpolateValue(first.groundPoint?.y, second.groundPoint?.y, ratio),
    },
    confidence: interpolateValue(first.confidence, second.confidence, ratio),
    identityConfidence: interpolateValue(first.identityConfidence, second.identityConfidence, ratio),
    occluded: Boolean(first.occluded || second.occluded),
    source: "interpolated",
  };
}

function closestPoint(points = [], atMs = 0, insertionIndex = 0) {
  const candidates = [points[insertionIndex - 1], points[insertionIndex]].filter(Boolean);
  return candidates.sort((first, second) => (
    Math.abs(first.atMs - atMs) - Math.abs(second.atMs - atMs)
  ))[0] || null;
}

function pointInsertionIndex(points = [], atMs = 0) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].atMs < atMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function sampleTrackAt(track = {}, atMs = 0, options = {}) {
  const maxInterpolationGapMs = Math.max(0, finiteNumber(options.maxInterpolationGapMs, 1000));
  const maxSampleDeltaMs = Math.max(0, finiteNumber(options.maxSampleDeltaMs, 100));
  const segment = (track.segments || []).find((candidate) => (
    atMs >= candidate.startMs && atMs <= candidate.endMs
  ));
  if (!segment?.points?.length) return null;

  const insertionIndex = pointInsertionIndex(segment.points, atMs);
  const exact = segment.points[insertionIndex];
  if (exact?.atMs === atMs) return exact;

  const previous = segment.points[insertionIndex - 1];
  const next = segment.points[insertionIndex];
  if (previous && next && next.atMs - previous.atMs <= maxInterpolationGapMs) {
    return interpolatedPoint(previous, next, atMs);
  }

  const closest = closestPoint(segment.points, atMs, insertionIndex);
  if (closest && Math.abs(closest.atMs - atMs) <= maxSampleDeltaMs) {
    return { ...closest, atMs };
  }
  return null;
}

export function maximumTrackingGapMs(track = {}, range = {}) {
  const startMs = finiteNumber(range.startMs);
  const endMs = Math.max(startMs, finiteNumber(range.endMs, startMs));
  const segments = (track.segments || []).filter((segment) => (
    segment.endMs >= startMs && segment.startMs <= endMs
  ));
  if (!segments.length) return endMs - startMs;
  const gaps = [];
  let previousAtMs = startMs;
  segments.forEach((segment) => {
    const points = segment.points || [];
    for (const point of points) {
      gaps.push(Math.max(0, point.atMs - previousAtMs));
      previousAtMs = point.atMs;
    }
  });
  gaps.push(Math.max(0, endMs - previousAtMs));
  return Math.max(...gaps);
}

export function trackingContinuityBreaks(track = {}, range = {}) {
  const segments = (track.segments || []).filter((segment) => (
    segment.endMs >= range.startMs && segment.startMs <= range.endMs
  ));
  return Math.max(0, segments.length - 1);
}
