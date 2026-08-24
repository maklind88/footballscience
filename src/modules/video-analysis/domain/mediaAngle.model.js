const mediaAngleRoles = new Set(["primary", "tactical", "broadcast", "end-zone", "bench", "custom"]);
const mediaAngleStatuses = new Set(["available", "needs-local-file", "offline", "archived"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringValue(value = "") {
  return String(value || "").trim();
}

export function normalizeMediaAngle(value = {}, fallbackIndex = 0) {
  const role = stringValue(value.role || value.angleRole || value.angle_role).toLowerCase();
  const status = stringValue(value.status).toLowerCase();
  return {
    id: stringValue(value.id || `angle-${fallbackIndex + 1}`),
    matchId: stringValue(value.matchId || value.match_id),
    videoId: stringValue(value.videoId || value.video_id),
    label: stringValue(value.label || value.title || `Angle ${fallbackIndex + 1}`),
    role: mediaAngleRoles.has(role) ? role : "custom",
    localVideoIdentifier: stringValue(value.localVideoIdentifier || value.local_video_identifier),
    syncOffsetMs: Math.round(finiteNumber(value.syncOffsetMs ?? value.sync_offset_ms, 0)),
    driftPpm: finiteNumber(value.driftPpm ?? value.drift_ppm, 0),
    durationMs: Math.max(0, Math.round(finiteNumber(value.durationMs ?? value.duration_ms, 0))),
    primary: Boolean(value.primary),
    muted: Boolean(value.muted),
    status: mediaAngleStatuses.has(status) ? status : "needs-local-file",
    syncConfidence: Math.min(1, Math.max(0, finiteNumber(
      value.syncConfidence ?? value.sync_confidence,
      0,
    ))),
    metadata: value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? value.metadata
      : {},
  };
}

export function normalizeMediaAngleSet(values = []) {
  const angles = values.map(normalizeMediaAngle);
  const primaryIndex = Math.max(0, angles.findIndex((angle) => angle.primary));
  return angles.map((angle, index) => ({
    ...angle,
    primary: index === primaryIndex,
  }));
}

