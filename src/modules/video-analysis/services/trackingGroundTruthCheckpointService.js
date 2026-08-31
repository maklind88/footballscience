import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { trackingPointAt } from "./trackingGeometryService.js";

const entityTypes = Object.freeze(["player", "ball", "referee"]);

function declaredAt(track = {}, atMs = 0) {
  return track.segments.some((segment) => atMs >= segment.startMs && atMs <= segment.endMs);
}

function checkpointEntry(track = {}, atMs = 0) {
  const declared = declaredAt(track, atMs);
  const point = declared ? trackingPointAt(track, atMs, { maxInterpolationGapMs: 500 }) : null;
  return {
    track,
    declared,
    point,
    visible: Boolean(point && !point.occluded),
    occluded: Boolean(point?.occluded),
  };
}

function missingPlayerIdentity(track = {}) {
  return track.entityType === "player"
    && (!String(track.playerId || track.playerLabel || "").trim()
      || !String(track.teamId || track.teamSide || "").trim());
}

export function trackingGroundTruthCheckpointDiagnostics(value = {}) {
  const atMs = Math.max(0, Math.round(Number(value.atMs) || 0));
  const selectedIds = new Set((value.selectedTrackIds || []).map(String));
  const tracks = (value.tracks || []).map(normalizeObjectTrack).filter((track) => (
    track.status !== "archived" && track.metadata?.preannotationReviewPreview !== true
  ));
  const selected = tracks.filter((track) => selectedIds.has(track.id))
    .map((track) => checkpointEntry(track, atMs));
  const declared = selected.filter((entry) => entry.declared);
  const visible = selected.filter((entry) => entry.visible);
  const unselectedVisible = value.benchmarkType === "selected-object" ? [] : tracks
    .filter((track) => !selectedIds.has(track.id))
    .map((track) => checkpointEntry(track, atMs))
    .filter((entry) => entry.visible);
  return {
    atMs,
    selectedDeclaredCount: declared.length,
    selectedVisibleCount: visible.length,
    occludedCount: selected.filter((entry) => entry.occluded).length,
    samplingGapCount: declared.filter((entry) => !entry.point).length,
    unselectedVisibleCount: unselectedVisible.length,
    unverifiedCount: declared.filter((entry) => entry.track.status !== "verified").length,
    identityIssueCount: visible.filter((entry) => missingPlayerIdentity(entry.track)).length,
    entityCounts: Object.fromEntries(entityTypes.map((entityType) => [
      entityType,
      visible.filter((entry) => entry.track.entityType === entityType).length,
    ])),
  };
}
