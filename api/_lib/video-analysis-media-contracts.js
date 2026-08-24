const {
  actorScope,
  asMs,
  normalizeText,
  normalizeUuid,
  rejectForbiddenPayload,
} = require("./video-analysis-database-core.js");

const MEDIA_SCHEMA = "footballscience-video-analysis-media-v1";
const ANGLE_ROLES = new Set(["primary", "tactical", "broadcast", "end-zone", "bench", "custom"]);
const ANGLE_STATUSES = new Set(["active", "needs-local-file", "offline", "archived"]);
const EXPORT_PRESETS = new Set(["review-720p", "analysis-1080p", "master-2160p"]);
const ARTIFACT_LOCATOR_KEYS = new Set([
  "artifacturl",
  "downloadurl",
  "manifesturl",
  "objecturl",
  "playbackurl",
]);

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

function expectedRevision(value = {}) {
  return Math.max(0, Math.round(Number(value.expectedRevision ?? value.expected_revision) || 0)) || null;
}

function checksum(value = "") {
  const normalized = normalizeText(value, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function rejectArtifactLocators(value, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectArtifactLocators(entry, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (ARTIFACT_LOCATOR_KEYS.has(key.toLowerCase())) {
      const error = new Error("Device-local export URLs must not be stored centrally.");
      error.status = 400;
      error.details = { path: [...path, key] };
      throw error;
    }
    rejectArtifactLocators(child, [...path, key]);
  }
}

function normalizeMediaAnglePayload(value = {}, actor = {}) {
  rejectForbiddenPayload(value);
  const role = normalizeText(value.role || value.angleRole || value.angle_role || "custom", 40).toLowerCase();
  const status = normalizeText(value.status || "active", 40).toLowerCase();
  return {
    ...actorScope(actor),
    id: normalizeUuid(value.id),
    expectedRevision: expectedRevision(value),
    matchId: normalizeUuid(value.matchId || value.match_id),
    videoId: normalizeUuid(value.videoId || value.video_id),
    sourceId: normalizeUuid(value.sourceId || value.source_id),
    label: normalizeText(value.label || value.title || "Camera angle", 180),
    role: ANGLE_ROLES.has(role) ? role : "custom",
    syncOffsetMs: Math.round(boundedNumber(value.syncOffsetMs ?? value.sync_offset_ms, 0, -21_600_000, 21_600_000)),
    driftPpm: boundedNumber(value.driftPpm ?? value.drift_ppm, 0, -10_000, 10_000),
    durationMs: asMs(value.durationMs ?? value.duration_ms, 0),
    primary: Boolean(value.primary ?? value.isPrimary ?? value.is_primary),
    muted: Boolean(value.muted ?? value.isMuted ?? value.is_muted),
    status: ANGLE_STATUSES.has(status) ? status : "active",
    syncConfidence: boundedNumber(value.syncConfidence ?? value.sync_confidence, 0, 0, 1),
    metadata: safeObject(value.metadata),
  };
}

function normalizeExportManifestPayload(value = {}, actor = {}) {
  rejectForbiddenPayload(value);
  rejectArtifactLocators(value);
  const startMs = asMs(value.startMs ?? value.start_ms, 0);
  const endMs = Math.max(startMs + 1, asMs(value.endMs ?? value.end_ms, startMs + 1));
  const preset = normalizeText(value.preset || value.outputPreset || value.output_preset, 40).toLowerCase();
  return {
    ...actorScope(actor),
    id: normalizeUuid(value.id),
    matchId: normalizeUuid(value.matchId || value.match_id),
    videoId: normalizeUuid(value.videoId || value.video_id),
    sourceId: normalizeUuid(value.sourceId || value.source_id),
    angleId: normalizeUuid(value.angleId || value.angle_id),
    presentationId: normalizeUuid(value.presentationId || value.presentation_id),
    presentationItemId: normalizeUuid(value.presentationItemId || value.presentation_item_id),
    clipId: normalizeUuid(value.clipId || value.clip_id),
    title: normalizeText(value.title || "Football Science export", 180),
    startMs,
    endMs,
    preset: EXPORT_PRESETS.has(preset) ? preset : "analysis-1080p",
    manifestSha256: checksum(value.manifestSha256 || value.manifest_sha256),
    outputSha256: checksum(value.outputSha256 || value.output_sha256 || value.sha256),
    outputSizeBytes: Math.round(boundedNumber(value.outputSizeBytes ?? value.output_size_bytes ?? value.sizeBytes, 0, 0, Number.MAX_SAFE_INTEGER)),
    renderedAt: normalizeText(value.renderedAt || value.rendered_at, 80) || new Date().toISOString(),
    layerSummary: safeObject(value.layerSummary || value.layer_summary),
    metadata: safeObject(value.metadata),
  };
}

function mapMediaAngle(row = {}) {
  return {
    id: row.id,
    matchId: row.match_id,
    videoId: row.video_id,
    sourceId: row.source_id,
    label: row.label,
    role: row.angle_role,
    localVideoIdentifier: row.local_video_identifier || "",
    syncOffsetMs: Number(row.sync_offset_ms || 0),
    driftPpm: Number(row.drift_ppm || 0),
    durationMs: Number(row.duration_ms || 0),
    primary: Boolean(row.is_primary),
    muted: Boolean(row.is_muted),
    status: row.status === "active" ? "available" : row.status,
    syncConfidence: Number(row.sync_confidence || 0),
    revision: Number(row.revision || 1),
    metadata: row.metadata || {},
  };
}

function mapExportManifest(row = {}) {
  return {
    id: row.id,
    matchId: row.match_id,
    videoId: row.video_id,
    sourceId: row.source_id,
    angleId: row.angle_id || "",
    presentationId: row.presentation_id || "",
    presentationItemId: row.presentation_item_id || "",
    clipId: row.clip_id || "",
    title: row.title,
    startMs: Number(row.start_ms || 0),
    endMs: Number(row.end_ms || 0),
    preset: row.output_preset,
    manifestSha256: row.manifest_sha256,
    outputSha256: row.output_sha256,
    outputSizeBytes: Number(row.output_size_bytes || 0),
    renderedAt: row.rendered_at,
    layerSummary: row.layer_summary || {},
    metadata: row.metadata || {},
  };
}

module.exports = {
  MEDIA_SCHEMA,
  mapExportManifest,
  mapMediaAngle,
  normalizeExportManifestPayload,
  normalizeMediaAnglePayload,
};
