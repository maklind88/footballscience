import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  normalizeTrackingPreannotationReviewBatchSize,
  normalizeTrackingPreannotationReviewScope,
  summarizeTrackingPreannotationReviewBatch,
} from "../services/trackingPreannotationReviewPriorityService.js";
import { selectTrackingPreannotationWorkspaceDirectory } from "../services/trackingPreannotationWorkspacePickerService.js";

export const TRACKING_PREANNOTATION_CONTEXT_LEAD_MS = 1500;
export const TRACKING_PREANNOTATION_SHORTCUT_ACTIONS = Object.freeze({
  a: "preannotation-accept",
  r: "preannotation-reject",
  n: "preannotation-next",
  p: "preannotation-preview-context",
  u: "preannotation-undo",
  c: "preannotation-save-current",
  s: "preannotation-save",
});

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

function normalizeCampaignEffort(value = {}) {
  const counter = (entry) => Math.max(0, Number(entry) || 0);
  return {
    coverage: value.coverage === "partial" ? "partial" : "complete",
    openedCount: counter(value.openedCount),
    acceptActionCount: counter(value.acceptActionCount),
    rejectActionCount: counter(value.rejectActionCount),
    undoActionCount: counter(value.undoActionCount),
    deferActionCount: counter(value.deferActionCount),
    correctionHandoffCount: counter(value.correctionHandoffCount),
    batchSaveActionCount: counter(value.batchSaveActionCount),
    savedTrackActionCount: counter(value.savedTrackActionCount),
    firstOpenedAt: String(value.firstOpenedAt || ""),
    lastActionAt: String(value.lastActionAt || ""),
  };
}

function normalizeCampaignState(value = null) {
  if (!value || typeof value !== "object") return null;
  return {
    status: String(value.status || "idle"),
    error: String(value.error || ""),
    workspaceSha256: String(value.workspaceSha256 || ""),
    packId: String(value.packId || ""),
    caseCount: Math.max(0, Number(value.caseCount) || 0),
    openedCaseCount: Math.max(0, Number(value.openedCaseCount) || 0),
    completeCaseCount: Math.max(0, Number(value.completeCaseCount) || 0),
    totalSuggestionCount: Math.max(0, Number(value.totalSuggestionCount) || 0),
    decisionCount: Math.max(0, Number(value.decisionCount) || 0),
    resolvedCount: Math.max(0, Number(value.resolvedCount) || 0),
    reviewEffortCoverage: value.reviewEffortCoverage === "partial" ? "partial" : "complete",
    reviewActionCount: Math.max(0, Number(value.reviewActionCount) || 0),
    reworkActionCount: Math.max(0, Number(value.reworkActionCount) || 0),
    correctionHandoffCount: Math.max(0, Number(value.correctionHandoffCount) || 0),
    savedTrackActionCount: Math.max(0, Number(value.savedTrackActionCount) || 0),
    reviewActionsPer100Suggestions: Math.max(0, Number(value.reviewActionsPer100Suggestions) || 0),
    cases: (Array.isArray(value.cases) ? value.cases : []).slice(0, 100).map((entry) => ({
      caseId: String(entry.caseId || ""),
      totalSuggestionCount: Math.max(0, Number(entry.totalSuggestionCount) || 0),
      decisionCount: Math.max(0, Number(entry.decisionCount) || 0),
      resolvedCount: Math.max(0, Number(entry.resolvedCount) || 0),
      pendingCount: Math.max(0, Number(entry.pendingCount) || 0),
      acceptedCount: Math.max(0, Number(entry.acceptedCount) || 0),
      rejectedCount: Math.max(0, Number(entry.rejectedCount) || 0),
      savedCount: Math.max(0, Number(entry.savedCount) || 0),
      reviewEffortCoverage: entry.reviewEffort?.coverage === "partial" ? "partial" : "complete",
      reviewEffort: normalizeCampaignEffort(entry.reviewEffort),
      reviewActionCount: Math.max(0, Number(entry.reviewActionCount) || 0),
      reworkActionCount: Math.max(0, Number(entry.reworkActionCount) || 0),
      reviewActionsPer100Suggestions: Math.max(0, Number(entry.reviewActionsPer100Suggestions) || 0),
      undoActionCount: Math.max(0, Number(entry.reviewEffort?.undoActionCount) || 0),
      correctionHandoffCount: Math.max(0, Number(entry.reviewEffort?.correctionHandoffCount) || 0),
      missingSuggestedEntityTypes: (entry.missingSuggestedEntityTypes || []).map(String).slice(0, 3),
      complete: entry.complete === true,
      active: entry.active === true,
    })),
  };
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
    campaign: normalizeCampaignState(value.campaign),
    current: value.current && typeof value.current === "object" ? value.current : null,
    error: String(value.error || ""),
  };
}

export function summarizeTrackingPreannotationReviewSession(session = null) {
  const values = [...(session?.decisions?.values() || [])];
  return {
    pendingCount: Math.max(0, (session?.entries.length || 0) - values.length),
    acceptedCount: values.filter((value) => value === "accepted").length,
    rejectedCount: values.filter((value) => value === "rejected").length,
    savedCount: values.filter((value) => value === "saved").length,
    ...summarizeTrackingPreannotationReviewBatch(session),
  };
}

export async function selectTrackingPreannotationReviewFiles(win = globalThis.window, options = {}) {
  if (typeof win?.showDirectoryPicker === "function") {
    return selectTrackingPreannotationWorkspaceDirectory(win, options);
  }
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
  const startMs = Math.max(0, Number(entry.track.startMs) || 0);
  const endMs = Math.max(startMs, Number(entry.track.endMs) || startMs);
  return {
    id: entry.track.id,
    entityType: entry.track.entityType,
    associationStatus: entry.associationStatus,
    atMs: startMs,
    endMs,
    durationMs: endMs - startMs,
    contextStartMs: Math.max(0, startMs - TRACKING_PREANNOTATION_CONTEXT_LEAD_MS),
    contextLeadMs: Math.min(startMs, TRACKING_PREANNOTATION_CONTEXT_LEAD_MS),
    confidence: entry.track.confidence,
    pointCount: entry.track.segments.reduce((sum, segment) => sum + segment.points.length, 0),
    priorityCode: entry.priority?.code || "",
    priorityLabel: entry.priority?.label || "",
    ...overrides,
  };
}
