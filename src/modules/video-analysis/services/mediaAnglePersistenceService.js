import { normalizeMediaAngle } from "../domain/mediaAngle.model.js";
import { mediaAnglesForState } from "./mediaProductionService.js";

export function mediaSourcePayload(reference = {}, state = {}) {
  const match = state.match || {};
  return {
    displayName: reference.displayName,
    localVideoIdentifier: reference.localVideoIdentifier,
    fileSizeBytes: reference.fileSizeBytes,
    durationMs: reference.durationMs,
    matchId: match.id || "",
    matchTitle: match.title || reference.displayName,
    matchDate: match.match_date || match.matchDate || "",
    eventType: match.event_type || match.eventType || "match",
    scheduleEventId: match.schedule_event_id || match.scheduleEventId || "",
    scheduleDayKey: match.schedule_day_key || match.scheduleDayKey || match.match_date || match.matchDate || "",
    opponent: match.opponent || "",
  };
}

export function persistedMediaAnglePayload(angle = {}) {
  return {
    id: angle.revision ? angle.id : "",
    expectedRevision: angle.revision || null,
    matchId: angle.matchId,
    videoId: angle.videoId,
    sourceId: angle.sourceId || angle.metadata?.sourceId,
    label: angle.label,
    role: angle.role,
    syncOffsetMs: angle.syncOffsetMs,
    driftPpm: angle.driftPpm,
    durationMs: angle.durationMs,
    primary: angle.primary,
    muted: angle.muted,
    status: angle.status,
    syncConfidence: angle.syncConfidence,
    metadata: angle.metadata || {},
  };
}

export function replaceMediaAngle(state = {}, replacement = {}) {
  const angles = mediaAnglesForState(state);
  const existing = angles.some((angle) => angle.id === replacement.id);
  return {
    ...state,
    mediaProduction: {
      ...(state.mediaProduction || {}),
      angles: existing
        ? angles.map((angle) => (angle.id === replacement.id ? normalizeMediaAngle(replacement) : angle))
        : [...angles, normalizeMediaAngle(replacement)],
    },
  };
}
