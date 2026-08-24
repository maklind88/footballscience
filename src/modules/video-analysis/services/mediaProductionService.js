import { normalizeMediaAngle, normalizeMediaAngleSet } from "../domain/mediaAngle.model.js";
import { selectedPresentationItem } from "./presentationService.js";
import { angleTimeToMatchTime, matchTimeToAngleTime } from "./multiAngleSyncService.js";

const EXPORT_PRESETS = new Set(["review-720p", "analysis-1080p", "master-2160p"]);

function text(value = "") {
  return String(value || "").trim();
}

function boundedMs(value, fallback = 0) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function localId(prefix = "media") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createInitialMediaProductionState() {
  return {
    status: "idle",
    panelOpen: false,
    panel: "angles",
    angles: [],
    angleRefs: {},
    primaryAngleId: "",
    activeAngleId: "",
    viewMode: "single",
    replay: { inMs: null, outMs: null, loop: false },
    export: {
      id: "",
      title: "Football Science review",
      preset: "analysis-1080p",
      status: "idle",
      stage: "",
      progress: 0,
      result: null,
      error: "",
    },
    error: "",
  };
}

export function primaryMediaAngleForState(state = {}) {
  const media = state.mediaProduction || {};
  const source = state.source || {};
  const video = state.video || {};
  const reference = state.videoRef || {};
  return normalizeMediaAngle({
    id: media.primaryAngleId || source.id || video.id || "angle-primary",
    matchId: state.match?.id || video.match_id || source.match_id || "",
    videoId: video.id || source.video_id || "",
    sourceId: source.id || "",
    label: reference.displayName || source.display_name || video.title || "Primary angle",
    role: "primary",
    localVideoIdentifier: reference.localVideoIdentifier || source.local_video_identifier || video.local_video_identifier || "",
    durationMs: reference.durationMs || source.duration_ms || video.duration_ms || 0,
    primary: true,
    status: reference.objectUrl ? "available" : "needs-local-file",
    syncConfidence: 1,
  });
}

export function mediaAnglesForState(state = {}) {
  const primary = primaryMediaAngleForState(state);
  const values = Array.isArray(state.mediaProduction?.angles) ? state.mediaProduction.angles : [];
  const normalized = values.map(normalizeMediaAngle);
  const primaryIndex = normalized.findIndex((angle) => (
    angle.id === primary.id
    || (angle.localVideoIdentifier && angle.localVideoIdentifier === primary.localVideoIdentifier)
  ));
  const merged = primaryIndex >= 0
    ? normalized.map((angle, index) => (index === primaryIndex ? {
      ...primary,
      ...angle,
      id: angle.id,
      matchId: angle.matchId || primary.matchId,
      videoId: angle.videoId || primary.videoId,
      sourceId: angle.sourceId || primary.sourceId,
      localVideoIdentifier: primary.localVideoIdentifier || angle.localVideoIdentifier,
      durationMs: primary.durationMs || angle.durationMs,
      status: primary.status,
      primary: true,
      metadata: { ...(angle.metadata || {}), sourceId: angle.sourceId || primary.sourceId },
    } : { ...angle, primary: false }))
    : [primary, ...normalized.map((angle) => ({ ...angle, primary: false }))];
  return normalizeMediaAngleSet(merged);
}

export function activeMediaAngle(state = {}) {
  const angles = mediaAnglesForState(state);
  const activeId = text(state.mediaProduction?.activeAngleId);
  return angles.find((angle) => angle.id === activeId) || angles.find((angle) => angle.primary) || angles[0] || null;
}

export function mediaReferenceForAngle(state = {}, angleValue = null) {
  const angle = angleValue ? normalizeMediaAngle(angleValue) : activeMediaAngle(state);
  if (!angle) return state.videoRef || null;
  const stored = state.mediaProduction?.angleRefs?.[angle.id] || null;
  if (stored?.objectUrl) return stored;
  const primary = primaryMediaAngleForState(state);
  if (angle.primary || angle.id === primary.id || (
    angle.localVideoIdentifier && angle.localVideoIdentifier === state.videoRef?.localVideoIdentifier
  )) return state.videoRef || stored;
  return stored;
}

export function activeMediaReference(state = {}) {
  return mediaReferenceForAngle(state, activeMediaAngle(state));
}

export function matchTimeFromActiveVideoMs(state = {}, videoTimeMs = 0) {
  const angle = activeMediaAngle(state);
  return angle ? angleTimeToMatchTime(videoTimeMs, angle) : boundedMs(videoTimeMs);
}

export function activeVideoTimeFromMatchMs(state = {}, matchTimeMs = 0) {
  const angle = activeMediaAngle(state);
  return angle ? matchTimeToAngleTime(matchTimeMs, angle) : boundedMs(matchTimeMs);
}

export function normalizedReplayRange(state = {}, patch = {}) {
  const current = { ...(state.mediaProduction?.replay || {}), ...patch };
  const durationMs = Math.max(
    boundedMs(state.videoRef?.durationMs),
    boundedMs(state.video?.duration_ms),
    boundedMs(state.source?.duration_ms),
    boundedMs(current.outMs),
    1,
  );
  const inMs = current.inMs == null ? null : Math.min(durationMs, boundedMs(current.inMs));
  const outMs = current.outMs == null ? null : Math.min(durationMs, boundedMs(current.outMs));
  return {
    inMs: outMs != null && inMs != null ? Math.min(inMs, Math.max(0, outMs - 1)) : inMs,
    outMs: inMs != null && outMs != null ? Math.max(inMs + 1, outMs) : outMs,
    loop: Boolean(current.loop),
  };
}

export function exportRangeForState(state = {}) {
  const replay = normalizedReplayRange(state);
  const selected = selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
  const clip = selected?.clip || {};
  const fallbackStart = boundedMs(selected?.startMs ?? clip.startMs ?? clip.start_ms ?? state.timeline?.playheadMs, 0);
  const fallbackEnd = Math.max(
    fallbackStart + 1,
    boundedMs(selected?.endMs ?? clip.endMs ?? clip.end_ms, fallbackStart + 15_000),
  );
  return {
    startMs: replay.inMs == null ? fallbackStart : replay.inMs,
    endMs: replay.outMs == null ? fallbackEnd : replay.outMs,
  };
}

export function buildMediaExportManifest(state = {}, overrides = {}) {
  const angle = activeMediaAngle(state) || {};
  const item = selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
  const range = exportRangeForState(state);
  const preset = EXPORT_PRESETS.has(overrides.preset) ? overrides.preset : "analysis-1080p";
  return {
    schema: "football-science-analysis-export-v1",
    exportId: text(overrides.exportId) || localId("export"),
    title: text(overrides.title) || "Football Science review",
    createdAt: new Date().toISOString(),
    range,
    preset,
    source: {
      matchId: text(state.match?.id || state.video?.match_id || state.source?.match_id),
      videoId: text(angle.videoId || state.video?.id || state.source?.video_id),
      sourceId: text(angle.sourceId || angle.metadata?.sourceId || state.source?.id),
      localVideoIdentifier: text(angle.localVideoIdentifier),
      angleId: text(angle.id),
      angleLabel: text(angle.label),
      angleRole: text(angle.role),
      syncOffsetMs: Math.round(Number(angle.syncOffsetMs) || 0),
      driftPpm: Number(angle.driftPpm) || 0,
    },
    analysis: {
      presentationId: text(state.presentation?.current?.id),
      presentationItemId: text(item?.id),
      clipId: text(item?.clipId),
      drawingLayerCount: Array.isArray(item?.drawings) ? item.drawings.length : 0,
      dynamicGraphicCount: Array.isArray(item?.dynamicGraphics) ? item.dynamicGraphics.length : 0,
      objectTrackCount: Array.isArray(item?.objectTracks) ? item.objectTracks.length : 0,
      calibrationId: text(state.presentation?.spatial?.calibration?.id),
    },
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

export function stableManifestJson(manifest = {}) {
  return JSON.stringify(stableValue(manifest));
}

export async function manifestSha256(manifest = {}, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle) throw new Error("Secure export checksums are not available in this browser.");
  const bytes = new TextEncoder().encode(stableManifestJson(manifest));
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
