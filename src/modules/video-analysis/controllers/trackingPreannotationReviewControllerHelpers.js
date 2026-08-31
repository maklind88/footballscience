import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  normalizeTrackingPreannotationReviewBatchSize,
  normalizeTrackingPreannotationReviewScope,
} from "../services/trackingPreannotationReviewPriorityService.js";

function invalid(message) {
  throw new Error(message);
}

export function normalizeTrackingPreannotationReviewState(value = {}) {
  return {
    status: String(value.status || "idle"),
    caseId: String(value.caseId || ""),
    workspaceSha256: String(value.workspaceSha256 || ""),
    associatedTrackCount: Math.max(0, Number(value.associatedTrackCount) || 0),
    unassociatedObservationCount: Math.max(0, Number(value.unassociatedObservationCount) || 0),
    criticalEntityCount: Math.max(0, Number(value.criticalEntityCount) || 0),
    fragmentCount: Math.max(0, Number(value.fragmentCount) || 0),
    lowConfidenceCount: Math.max(0, Number(value.lowConfidenceCount) || 0),
    pendingCount: Math.max(0, Number(value.pendingCount) || 0),
    acceptedCount: Math.max(0, Number(value.acceptedCount) || 0),
    rejectedCount: Math.max(0, Number(value.rejectedCount) || 0),
    savedCount: Math.max(0, Number(value.savedCount) || 0),
    reviewScope: normalizeTrackingPreannotationReviewScope(value.reviewScope),
    scopePendingCount: Math.max(0, Number(value.scopePendingCount) || 0),
    batchSize: normalizeTrackingPreannotationReviewBatchSize(value.batchSize),
    batchPendingCount: Math.max(0, Number(value.batchPendingCount) || 0),
    batchTotalCount: Math.max(0, Number(value.batchTotalCount) || 0),
    draftStatus: String(value.draftStatus || "idle"),
    draftError: String(value.draftError || ""),
    restoredDecisionCount: Math.max(0, Number(value.restoredDecisionCount) || 0),
    current: value.current && typeof value.current === "object" ? value.current : null,
    error: String(value.error || ""),
  };
}

export async function selectTrackingPreannotationReviewFiles(win = globalThis.window) {
  if (typeof win?.showOpenFilePicker !== "function") {
    invalid("This browser cannot open a sealed preannotation workspace.");
  }
  const handles = await win.showOpenFilePicker({
    multiple: true,
    types: [{
      description: "FS Player preannotation review",
      accept: {
        "application/json": [".json"],
        "text/plain": [".txt"],
      },
    }],
  });
  if (handles.length !== 4) {
    invalid("Select annotation-pack.json, workspace.json, one track-map JSON, and its MOT suggestion file.");
  }
  const files = await Promise.all(handles.map((handle) => handle.getFile()));
  const pack = files.find((file) => file.name === "annotation-pack.json");
  const workspace = files.find((file) => file.name === "workspace.json");
  const trackMap = files.find((file) => file.name.endsWith(".track-map.json"));
  const suggestion = files.find((file) => file.name.endsWith(".suggestions.mot.txt"));
  const caseId = String(trackMap?.name || "").replace(/\.track-map\.json$/, "");
  if (!pack || !workspace || !trackMap || !suggestion
    || suggestion.name !== `${caseId}.suggestions.mot.txt`) {
    invalid("The selected preannotation files do not describe one matching case.");
  }
  const [packBytes, workspaceBytes, trackMapBytes, suggestionBytes] = await Promise.all([
    pack.arrayBuffer(),
    workspace.arrayBuffer(),
    trackMap.arrayBuffer(),
    suggestion.arrayBuffer(),
  ]);
  return { packBytes, workspaceBytes, trackMapBytes, suggestionBytes, caseId };
}

export function previewTrackingPreannotationTrack(track = {}) {
  return normalizeObjectTrack({
    ...track,
    metadata: {
      ...(track.metadata || {}),
      preannotationReviewPreview: true,
      preannotationReviewState: "pending",
    },
  });
}

export function acceptedTrackingPreannotationTrack(track = {}, state = "accepted-local") {
  return normalizeObjectTrack({
    ...track,
    metadata: {
      ...(track.metadata || {}),
      preannotationReviewPreview: false,
      preannotationReviewState: state,
    },
  });
}

export function currentTrackingPreannotationReview(entry = {}, overrides = {}) {
  return {
    id: entry.track.id,
    entityType: entry.track.entityType,
    associationStatus: entry.associationStatus,
    atMs: entry.track.startMs,
    confidence: entry.track.confidence,
    pointCount: entry.track.segments.reduce((sum, segment) => sum + segment.points.length, 0),
    priorityCode: entry.priority?.code || "",
    priorityLabel: entry.priority?.label || "",
    ...overrides,
  };
}
