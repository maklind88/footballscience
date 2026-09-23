import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { trackingPointAt } from "./trackingGeometryService.js";
import { trackingGroundTruthSceneReviewTimes } from "./trackingGroundTruthSceneReviewService.js";

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

function issue(track = {}, code = "", suffix = "") {
  const fallback = track.entityType ? `${track.entityType[0].toUpperCase()}${track.entityType.slice(1)}` : "Object";
  const rawLabel = String(track.playerLabel || track.playerId || fallback).trim();
  const label = rawLabel ? `${rawLabel[0].toUpperCase()}${rawLabel.slice(1)}` : fallback;
  return { code, trackId: track.id, entityType: track.entityType, label: `${label}: ${suffix}` };
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
  const issues = [
    ...declared.filter((entry) => !entry.point)
      .map((entry) => issue(entry.track, "sample-gap", "sample gap")),
    ...declared.filter((entry) => entry.track.status !== "verified")
      .map((entry) => issue(entry.track, "unverified", "unverified")),
    ...visible.filter((entry) => missingPlayerIdentity(entry.track))
      .map((entry) => issue(entry.track, "identity", "needs identity or team")),
    ...unselectedVisible.map((entry) => issue(entry.track, "outside-reference", "outside reference")),
  ];
  return {
    atMs,
    selectedDeclaredCount: declared.length,
    selectedVisibleCount: visible.length,
    occludedCount: selected.filter((entry) => entry.occluded).length,
    samplingGapCount: declared.filter((entry) => !entry.point).length,
    unselectedVisibleCount: unselectedVisible.length,
    unverifiedCount: declared.filter((entry) => entry.track.status !== "verified").length,
    identityIssueCount: visible.filter((entry) => missingPlayerIdentity(entry.track)).length,
    issues,
    entityCounts: Object.fromEntries(entityTypes.map((entityType) => [
      entityType,
      visible.filter((entry) => entry.track.entityType === entityType).length,
    ])),
  };
}

export function auditTrackingGroundTruthCheckpoints(value = {}) {
  const checkpoints = trackingGroundTruthSceneReviewTimes(value);
  const issueCountsByCode = {};
  let issueCheckpointCount = 0;
  let issueCount = 0;
  let firstIssueAtMs = null;
  checkpoints.forEach((atMs) => {
    const diagnostics = trackingGroundTruthCheckpointDiagnostics({ ...value, atMs });
    if (!diagnostics.issues.length) return;
    issueCheckpointCount += 1;
    issueCount += diagnostics.issues.length;
    if (firstIssueAtMs == null) firstIssueAtMs = atMs;
    diagnostics.issues.forEach((entry) => {
      issueCountsByCode[entry.code] = (issueCountsByCode[entry.code] || 0) + 1;
    });
  });
  return {
    ready: issueCount === 0,
    checkpointCount: checkpoints.length,
    issueCheckpointCount,
    issueCount,
    firstIssueAtMs,
    issueCountsByCode,
  };
}
