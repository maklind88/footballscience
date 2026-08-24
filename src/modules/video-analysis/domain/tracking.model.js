const trackingEntityTypes = new Set(["player", "ball", "referee", "area", "unknown"]);
const trackingStatuses = new Set(["draft", "processing", "review", "verified", "archived"]);
const trackingPointSources = new Set(["automatic", "manual", "interpolated"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}

function normalizeAtMs(value, fallback = 0) {
  return Math.max(0, Math.round(finiteNumber(value, fallback)));
}

function normalizePointCoordinate(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0, 1) : clamp(fallback, 0, 1);
}

function stringValue(value = "") {
  return String(value || "").trim();
}

export function normalizeTrackingPoint(value = {}, fallbackAtMs = 0) {
  const x = normalizePointCoordinate(value.x ?? value.centerX ?? value.center_x);
  const y = normalizePointCoordinate(value.y ?? value.centerY ?? value.center_y);
  const width = clamp(value.width ?? value.w ?? 0, 0, 1);
  const height = clamp(value.height ?? value.h ?? 0, 0, 1);
  const groundX = normalizePointCoordinate(
    value.groundX ?? value.ground_x ?? value.groundPoint?.x,
    x,
  );
  const groundY = normalizePointCoordinate(
    value.groundY ?? value.ground_y ?? value.groundPoint?.y,
    Math.min(1, y + (height / 2)),
  );
  const source = stringValue(value.source || value.pointSource || value.point_source).toLowerCase();
  return {
    atMs: normalizeAtMs(value.atMs ?? value.at_ms, fallbackAtMs),
    frameIndex: Math.max(0, Math.round(finiteNumber(value.frameIndex ?? value.frame_index, 0))),
    x,
    y,
    width,
    height,
    groundPoint: { x: groundX, y: groundY },
    confidence: clamp(value.confidence ?? value.detectionConfidence ?? value.detection_confidence ?? 0),
    identityConfidence: clamp(
      value.identityConfidence ?? value.identity_confidence ?? value.confidence ?? 0,
    ),
    occluded: Boolean(value.occluded),
    source: trackingPointSources.has(source) ? source : "automatic",
  };
}

function uniqueSortedPoints(values = []) {
  const byTime = new Map();
  values.forEach((value, index) => {
    const point = normalizeTrackingPoint(value, index);
    const current = byTime.get(point.atMs);
    if (!current || point.source === "manual" || current.source !== "manual") {
      byTime.set(point.atMs, point);
    }
  });
  return [...byTime.values()].sort((first, second) => first.atMs - second.atMs);
}

function averageConfidence(points = []) {
  if (!points.length) return 0;
  return points.reduce((total, point) => total + point.confidence, 0) / points.length;
}

export function normalizeTrackingSegment(value = {}, fallbackIndex = 0) {
  const points = uniqueSortedPoints(value.points || value.samples || []);
  const firstPointMs = points[0]?.atMs ?? 0;
  const lastPointMs = points.at(-1)?.atMs ?? firstPointMs;
  const startMs = normalizeAtMs(value.startMs ?? value.start_ms, firstPointMs);
  const endMs = Math.max(
    startMs,
    normalizeAtMs(value.endMs ?? value.end_ms, lastPointMs),
  );
  return {
    id: stringValue(value.id || `segment-${fallbackIndex + 1}`),
    startMs,
    endMs,
    confidence: clamp(value.confidence ?? averageConfidence(points)),
    discontinuityBefore: Boolean(value.discontinuityBefore ?? value.discontinuity_before),
    points: points.filter((point) => point.atMs >= startMs && point.atMs <= endMs),
  };
}

export function normalizeTrackingCorrection(value = {}) {
  const startMs = normalizeAtMs(value.startMs ?? value.start_ms ?? value.atMs ?? value.at_ms);
  return {
    id: stringValue(value.id),
    startMs,
    endMs: Math.max(startMs, normalizeAtMs(value.endMs ?? value.end_ms, startMs)),
    correctionType: stringValue(value.correctionType || value.correction_type || "position"),
    reason: stringValue(value.reason),
    correctedBy: stringValue(value.correctedBy || value.corrected_by),
    correctedAt: stringValue(value.correctedAt || value.corrected_at),
  };
}

export function normalizeObjectTrack(value = {}) {
  const entityType = stringValue(value.entityType || value.entity_type).toLowerCase();
  const status = stringValue(value.status).toLowerCase();
  const segments = (value.segments || []).map(normalizeTrackingSegment)
    .filter((segment) => segment.points.length)
    .sort((first, second) => first.startMs - second.startMs);
  const points = segments.flatMap((segment) => segment.points);
  const startMs = normalizeAtMs(value.startMs ?? value.start_ms, points[0]?.atMs ?? 0);
  const endMs = Math.max(
    startMs,
    normalizeAtMs(value.endMs ?? value.end_ms, points.at(-1)?.atMs ?? startMs),
  );
  return {
    id: stringValue(value.id),
    clipId: stringValue(value.clipId || value.clip_id),
    videoId: stringValue(value.videoId || value.video_id),
    entityType: trackingEntityTypes.has(entityType) ? entityType : "unknown",
    playerId: stringValue(value.playerId || value.player_id),
    playerLabel: stringValue(value.playerLabel || value.player_label),
    teamId: stringValue(value.teamId || value.team_id),
    teamSide: stringValue(value.teamSide || value.team_side),
    shirtNumber: stringValue(value.shirtNumber || value.shirt_number),
    status: trackingStatuses.has(status) ? status : "draft",
    startMs,
    endMs,
    confidence: clamp(value.confidence ?? averageConfidence(points)),
    identityConfidence: clamp(
      value.identityConfidence ?? value.identity_confidence ?? value.confidence ?? averageConfidence(points),
    ),
    engine: stringValue(value.engine),
    engineVersion: stringValue(value.engineVersion || value.engine_version),
    segments,
    corrections: (value.corrections || []).map(normalizeTrackingCorrection),
    metadata: value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? value.metadata
      : {},
  };
}

export function trackingPoints(track = {}) {
  return normalizeObjectTrack(track).segments.flatMap((segment) => segment.points);
}

export function trackingCoverage(track = {}) {
  const normalized = normalizeObjectTrack(track);
  const coveredMs = normalized.segments.reduce(
    (total, segment) => total + Math.max(0, segment.endMs - segment.startMs),
    0,
  );
  const durationMs = Math.max(0, normalized.endMs - normalized.startMs);
  return {
    coveredMs,
    durationMs,
    ratio: durationMs > 0 ? clamp(coveredMs / durationMs) : 0,
    pointCount: normalized.segments.reduce((total, segment) => total + segment.points.length, 0),
    segmentCount: normalized.segments.length,
  };
}
