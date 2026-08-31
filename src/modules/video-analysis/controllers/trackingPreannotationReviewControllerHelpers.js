import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  normalizeTrackingPreannotationReviewBatchSize,
  normalizeTrackingPreannotationReviewScope,
} from "../services/trackingPreannotationReviewPriorityService.js";

function invalid(message) {
  throw new Error(message);
}

async function selectFiles(win, options, expectedCount) {
  const { countError, ...pickerOptions } = options;
  const handles = await win.showOpenFilePicker(pickerOptions);
  if (handles.length !== expectedCount) invalid(countError);
  return Promise.all(handles.map((handle) => handle.getFile()));
}

function selectedFile(files, expectedName, errorMessage) {
  const file = files.find((entry) => entry.name === expectedName);
  if (!file) invalid(errorMessage);
  return file;
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
  const [pack] = await selectFiles(win, {
    multiple: false,
    types: [{
      description: "Step 1 of 3: annotation-pack.json",
      accept: { "application/json": [".json"] },
    }],
    countError: "Select exactly one annotation-pack.json file.",
  }, 1);
  selectedFile([pack], "annotation-pack.json", "Select annotation-pack.json from the benchmark pilot folder.");
  const [workspace] = await selectFiles(win, {
    multiple: false,
    types: [{
      description: "Step 2 of 3: workspace.json",
      accept: { "application/json": [".json"] },
    }],
    countError: "Select exactly one workspace.json file.",
  }, 1);
  selectedFile([workspace], "workspace.json", "Select workspace.json from one sealed preannotation folder.");
  const caseFiles = await selectFiles(win, {
    multiple: true,
    types: [{
      description: "Step 3 of 3: matching case files",
      accept: {
        "application/json": [".json"],
        "text/plain": [".txt"],
      },
    }],
    countError: "Select one track-map JSON and its matching MOT suggestion file.",
  }, 2);
  const trackMap = caseFiles.find((file) => file.name.endsWith(".track-map.json"));
  const suggestion = caseFiles.find((file) => file.name.endsWith(".suggestions.mot.txt"));
  const caseId = String(trackMap?.name || "").replace(/\.track-map\.json$/, "");
  if (!trackMap || !suggestion || suggestion.name !== `${caseId}.suggestions.mot.txt`) {
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
