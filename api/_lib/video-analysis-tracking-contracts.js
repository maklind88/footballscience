const {
  actorScope,
  asMs,
  normalizeText,
  normalizeUuid,
  rejectForbiddenPayload,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-elite-v1";
const TRACK_ENTITY_TYPES = new Set(["player", "ball", "referee", "area", "unknown"]);
const TRACK_STATUSES = new Set(["draft", "processing", "review", "verified", "archived"]);
const GRAPHIC_TYPES = new Set(["arrow", "circle", "spotlight", "label", "trail", "distance", "unit-hull", "unit-line", "movement-curve"]);
const GRAPHIC_SOURCES = new Set(["static", "tracking", "spatial"]);

function rowList(result = {}) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(value, minimum = 0, maximum = 1) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : minimum));
}

function expectedRevision(value = {}) {
  return Math.max(0, Math.round(Number(value.expectedRevision ?? value.expected_revision) || 0)) || null;
}

function rejectDenseTrackPayload(value = {}) {
  if (Array.isArray(value.segments) || Array.isArray(value.points) || Array.isArray(value.samples)) {
    const error = new Error("Dense tracking samples stay on the analyst device.");
    error.status = 400;
    throw error;
  }
}

function mapTrack(row = {}, corrections = []) {
  return {
    id: row.id,
    clipId: row.clip_instance_id,
    videoId: row.video_id,
    entityType: row.entity_type,
    playerId: row.player_id || "",
    playerLabel: row.player_label || "",
    teamSide: row.team_side || "",
    shirtNumber: row.shirt_number || "",
    startMs: row.start_ms,
    endMs: row.end_ms,
    confidence: Number(row.confidence || 0),
    identityConfidence: Number(row.identity_confidence || 0),
    coverageRatio: Number(row.coverage_ratio || 0),
    pointCount: row.point_count || 0,
    segmentCount: row.segment_count || 0,
    engine: row.engine || "",
    engineVersion: row.engine_version || "",
    status: row.status,
    revision: row.revision || 1,
    corrections,
    metadata: {
      ...(row.metadata || {}),
      localArtifactId: row.local_artifact_id || "",
      localArtifactHash: row.local_artifact_hash || "",
    },
  };
}

function mapCorrection(row = {}) {
  return {
    id: row.id,
    objectTrackId: row.object_track_id,
    atMs: row.at_ms,
    correctionType: row.correction_type,
    box: row.box_json || {},
    groundPoint: row.ground_point_json || {},
    playerId: row.player_id || "",
    playerLabel: row.player_label || "",
    reason: row.reason || "",
    correctedBy: row.corrected_by || "",
    correctedAt: row.created_at,
  };
}

function mapGraphic(row = {}) {
  return {
    id: row.id,
    clipId: row.clip_instance_id,
    presentationItemId: row.presentation_item_id || "",
    type: row.graphic_type,
    source: row.source,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.layer_text || "",
    bindings: row.bindings_json || [],
    staticPoints: row.static_points_json || [],
    style: row.style_json || {},
    trailDurationMs: row.trail_duration_ms,
    confidenceThreshold: Number(row.confidence_threshold || 0),
    locked: row.locked === true,
    hidden: row.hidden === true,
    status: row.status,
    revision: row.revision || 1,
    metadata: row.metadata || {},
  };
}

function normalizeTrackPayload(value = {}, actor = {}) {
  rejectForbiddenPayload(value);
  rejectDenseTrackPayload(value);
  const scope = actorScope(actor);
  const entityType = normalizeText(value.entityType || value.entity_type || "player", 40).toLowerCase();
  const status = normalizeText(value.status || "review", 40).toLowerCase();
  const startMs = asMs(value.startMs ?? value.start_ms, 0);
  const endMs = asMs(value.endMs ?? value.end_ms, startMs + 1);
  if (endMs <= startMs) throw Object.assign(new Error("Track end must be after start."), { status: 400 });
  return {
    ...scope,
    id: normalizeUuid(value.id),
    clipId: normalizeUuid(value.clipId || value.clip_id || value.clipInstanceId),
    entityType: TRACK_ENTITY_TYPES.has(entityType) ? entityType : "unknown",
    playerId: normalizeText(value.playerId || value.player_id, 160) || null,
    playerLabel: normalizeText(value.playerLabel || value.player_label, 180) || null,
    teamSide: normalizeText(value.teamSide || value.team_side, 80) || null,
    shirtNumber: normalizeText(value.shirtNumber || value.shirt_number, 24) || null,
    startMs,
    endMs,
    confidence: clamp(value.confidence),
    identityConfidence: clamp(value.identityConfidence ?? value.identity_confidence),
    coverageRatio: clamp(value.coverageRatio ?? value.coverage_ratio),
    pointCount: Math.min(500_000, Math.max(0, Math.round(Number(value.pointCount ?? value.point_count) || 0))),
    segmentCount: Math.min(10_000, Math.max(0, Math.round(Number(value.segmentCount ?? value.segment_count) || 0))),
    engine: normalizeText(value.engine, 120) || null,
    engineVersion: normalizeText(value.engineVersion || value.engine_version, 80) || null,
    localArtifactId: normalizeText(value.localArtifactId || value.local_artifact_id, 180) || null,
    localArtifactHash: normalizeText(value.localArtifactHash || value.local_artifact_hash, 128) || null,
    status: TRACK_STATUSES.has(status) ? status : "review",
    expectedRevision: expectedRevision(value),
    metadata: safeObject(value.metadata),
  };
}

function normalizeGraphicPayload(value = {}, actor = {}) {
  rejectForbiddenPayload(value);
  const scope = actorScope(actor);
  const type = normalizeText(value.type || value.graphicType || value.graphic_type, 40).toLowerCase();
  const source = normalizeText(value.source || "tracking", 40).toLowerCase();
  const startMs = asMs(value.startMs ?? value.start_ms, 0);
  const endMs = asMs(value.endMs ?? value.end_ms, startMs + 1);
  if (endMs <= startMs) throw Object.assign(new Error("Graphic end must be after start."), { status: 400 });
  return {
    ...scope,
    id: normalizeUuid(value.id),
    clipId: normalizeUuid(value.clipId || value.clip_id),
    presentationItemId: normalizeUuid(value.presentationItemId || value.presentation_item_id),
    type: GRAPHIC_TYPES.has(type) ? type : "circle",
    source: GRAPHIC_SOURCES.has(source) ? source : "tracking",
    startMs,
    endMs,
    text: normalizeText(value.text, 500) || null,
    bindings: (Array.isArray(value.bindings) ? value.bindings : []).map((binding) => ({
      trackId: normalizeUuid(binding.trackId || binding.track_id),
      role: normalizeText(binding.role || "primary", 80),
      anchor: normalizeText(binding.anchor || "ground", 40),
    })).filter((binding) => binding.trackId).slice(0, 40),
    staticPoints: (Array.isArray(value.staticPoints || value.static_points) ? (value.staticPoints || value.static_points) : []).slice(0, 500),
    style: safeObject(value.style),
    trailDurationMs: Math.min(120_000, Math.max(0, Math.round(Number(value.trailDurationMs ?? value.trail_duration_ms) || 2000))),
    confidenceThreshold: clamp(value.confidenceThreshold ?? value.confidence_threshold ?? 0.55),
    locked: Boolean(value.locked),
    hidden: Boolean(value.hidden),
    expectedRevision: expectedRevision(value),
    metadata: safeObject(value.metadata),
  };
}

module.exports = {
  VIDEO_ANALYSIS_SCHEMA,
  mapCorrection,
  mapGraphic,
  mapTrack,
  normalizeGraphicPayload,
  normalizeTrackPayload,
  rowList,
  safeObject,
};
