import { buildLocalVideoHandleIdentity } from "../services/localVideoSessionService.js";
import { createTrackingBenchmarkWorkspaceScope } from "../services/trackingBenchmarkWorkspaceService.js";
import {
  createTrackingCandidatePipelineArtifact,
  trackingCandidatePipelineSummary,
} from "../services/trackingCandidatePipelineArtifactService.js";
import {
  getLocalTrackingCandidatePipelineRun,
  listLocalTrackingCandidatePipelineRuns,
  removeLocalTrackingCandidatePipelineRun,
  saveLocalTrackingCandidatePipelineRun,
} from "../services/localTrackingCandidateStore.js";
import {
  createTrackingCandidateProviderRuns,
  trackingCandidateBenchmarkProvider,
} from "../services/trackingCandidateProviderRunService.js";
import { trackingCandidatePipelineReadiness } from "../services/trackingCandidateSelectionService.js";
import { emptyTrackingBenchmarkEvaluation } from "../services/trackingBenchmarkStateService.js";
import {
  addTrackingProviderRun,
  trackingProviderRunWorkspaceEntry,
} from "../services/trackingProviderRunService.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
  trackingItemRange,
} from "./trackingControllerHelpers.js";

function candidateState(value = {}) {
  return {
    status: String(value.status || "waiting-item"),
    stage: String(value.stage || ""),
    progress: Math.max(0, Math.min(1, Number(value.progress) || 0)),
    activeRunId: String(value.activeRunId || ""),
    runs: Array.isArray(value.runs) ? value.runs : [],
    error: String(value.error || ""),
  };
}

function frameForVideo(video = null) {
  const width = Math.round(Number(video?.videoWidth) || 0);
  const height = Math.round(Number(video?.videoHeight) || 0);
  return width > 0 && height > 0 ? { width, height } : null;
}

function mergeTracks(existing = [], incoming = []) {
  const ids = new Set(incoming.map((track) => track.id));
  return [...existing.filter((track) => !ids.has(track.id)), ...incoming];
}

function downloadJson(win = null, value = {}, name = "fs-player-candidate-evidence.json") {
  if (!win?.document?.createElement || !win?.URL?.createObjectURL || !win?.Blob) return false;
  const url = win.URL.createObjectURL(new win.Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
  const anchor = win.document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  win.setTimeout?.(() => win.URL.revokeObjectURL(url), 0);
  return true;
}

export function createTrackingCandidateController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getContext = options.getContext || (() => ({}));
  const getWindow = options.getWindow || (() => globalThis.window);
  const getVideoElement = options.getVideoElement || (() => null);
  const createArtifact = options.createArtifact || createTrackingCandidatePipelineArtifact;
  const saveArtifact = options.saveArtifact || saveLocalTrackingCandidatePipelineRun;
  const listArtifacts = options.listArtifacts || listLocalTrackingCandidatePipelineRuns;
  const loadArtifact = options.loadArtifact || getLocalTrackingCandidatePipelineRun;
  const removeArtifact = options.removeArtifact || removeLocalTrackingCandidatePipelineRun;
  let active = null;
  let restoreId = 0;
  let observedKey = "";
  let unsubscribe = null;
  let disposed = false;

  function patchCandidate(patch = {}) {
    updateState((state) => patchTrackingState(state, {
      candidatePipeline: {
        ...candidateState(state.presentation?.tracking?.candidatePipeline),
        ...patch,
      },
    }));
  }

  function scopeFor(state = getState()) {
    try {
      const context = getContext();
      const user = context.currentUser || context.user || context.getCurrentPlatformUser?.() || {};
      const userId = String(
        user.id || user.userId || user.user_id || user.authId || user.auth_id || user.profileId || user.profile_id || "",
      ).trim();
      if (!userId) return null;
      const identity = buildLocalVideoHandleIdentity(state, context, { userId });
      if (identity.organizationId === "local" || identity.teamId === "team") return null;
      return createTrackingBenchmarkWorkspaceScope(identity);
    } catch {
      return null;
    }
  }

  function contextFor(state = getState()) {
    const item = selectedTrackingItem(state);
    const scope = scopeFor(state);
    return item && scope ? { item, scope, key: `${scope.id}::${item.id}` } : null;
  }

  async function restoreSummaries(state = getState()) {
    const context = contextFor(state);
    const requestId = ++restoreId;
    if (!context) {
      observedKey = "";
      patchCandidate({ status: "waiting-item", runs: [], activeRunId: "", error: "" });
      return false;
    }
    observedKey = context.key;
    patchCandidate({ status: "loading", error: "" });
    try {
      const runs = await listArtifacts(context.scope, context.item.id, getWindow());
      if (disposed || requestId !== restoreId || contextFor()?.key !== context.key) return false;
      patchCandidate({ status: runs.length ? "restored" : "ready", runs, error: "" });
      return true;
    } catch (error) {
      if (requestId !== restoreId) return false;
      patchCandidate({ status: "error", error: error?.message || "Candidate evidence could not be restored." });
      return false;
    }
  }

  function addRuns(workspaceValue = {}, itemId = "", runs = {}) {
    let workspace = trackingProviderRunWorkspaceEntry(workspaceValue);
    for (const run of Object.values(runs)) workspace = addTrackingProviderRun(workspace, itemId, run);
    return workspace;
  }

  async function retainReviewTracks(tracks = []) {
    const retained = [];
    for (const track of tracks) retained.push(await options.persistTrack(track));
    return retained;
  }

  function publishReview(itemId, tracks, providerRuns, summary) {
    updateState((state) => {
      const item = selectedTrackingItem(state);
      if (!item || item.id !== itemId) return state;
      const currentCandidate = candidateState(state.presentation?.tracking?.candidatePipeline);
      const runs = [summary, ...currentCandidate.runs.filter((entry) => entry.id !== summary.id)];
      const candidateBenchmarkProviders = Object.fromEntries(Object.entries(providerRuns).map(([stage, run]) => [
        stage,
        trackingCandidateBenchmarkProvider(run),
      ]));
      const selectedStage = String(state.presentation?.tracking?.candidateBenchmarkProvider?.stage || "detection");
      const selectedProvider = candidateBenchmarkProviders[selectedStage] || candidateBenchmarkProviders.detection;
      return patchTrackingState(replacePresentationItem(state, itemId, {
        objectTracks: mergeTracks(item.objectTracks || [], tracks),
      }), {
        selectedTrackIds: tracks.map((track) => track.id),
        providerRuns: addRuns(state.presentation?.tracking?.providerRuns, itemId, providerRuns),
        candidateBenchmarkProviders,
        candidateBenchmarkProvider: selectedProvider,
        benchmarkEvaluation: emptyTrackingBenchmarkEvaluation(),
        candidatePipeline: {
          ...currentCandidate,
          status: "review",
          stage: "",
          progress: 1,
          activeRunId: summary.id,
          runs,
          error: "",
        },
      });
    });
    options.onEvidenceChanged?.();
  }

  function selectBenchmarkProvider(stage = "") {
    let selected = false;
    updateState((state) => {
      const provider = state.presentation?.tracking?.candidateBenchmarkProviders?.[stage];
      if (!provider) return state;
      selected = true;
      return patchTrackingState(state, {
        candidateBenchmarkProvider: provider,
        benchmarkEvaluation: emptyTrackingBenchmarkEvaluation(),
      });
    });
    if (selected) options.onEvidenceChanged?.();
    return selected;
  }

  async function run() {
    if (active || typeof options.runPipeline !== "function") return false;
    const state = getState();
    const context = contextFor(state);
    const readiness = trackingCandidatePipelineReadiness(state.presentation?.tracking || {});
    const benchmarkType = state.presentation?.tracking?.groundTruth?.suite?.benchmarkType;
    const frame = frameForVideo(getVideoElement());
    if (!context || !frame || !readiness.ready || benchmarkType !== "multi-object") {
      patchCandidate({
        status: "error",
        error: !context
          ? "Connect one exact match source and presentation clip first."
          : !frame
            ? "Wait until the source video dimensions are available."
          : benchmarkType !== "multi-object"
            ? "Choose Full scene before running benchmark candidates."
            : readiness.issues[0] || "The full-scene candidate pipeline is incomplete.",
      });
      return false;
    }
    const controller = new AbortController();
    active = { controller, itemId: context.item.id };
    patchCandidate({ status: "running", stage: "Preparing full-scene candidates", progress: 0.01, error: "" });
    try {
      const result = await options.runPipeline({
        item: context.item,
        providers: readiness.providers,
        signal: controller.signal,
        onProgress: (progress = {}) => {
          const completed = Math.max(0, Number(progress.completedStages) || 0);
          const nested = Math.max(0, Math.min(1, Number(progress.ratio) || 0));
          patchCandidate({
            status: "running",
            stage: String(progress.pipelineStage || progress.stage || "Running candidate pipeline"),
            progress: Math.min(0.96, (completed + nested) / 4),
            error: "",
          });
        },
      });
      if (controller.signal.aborted) throw new DOMException("Candidate pipeline cancelled.", "AbortError");
      const providerRuns = createTrackingCandidateProviderRuns(result, { frame, now: options.now });
      const artifact = await createArtifact({
        scope: context.scope,
        itemId: context.item.id,
        frame,
        ...result,
      }, { cryptoApi: getWindow()?.crypto || globalThis.crypto, now: options.now });
      const summary = await saveArtifact(artifact, getWindow());
      const tracks = await retainReviewTracks(result.tracks);
      publishReview(context.item.id, tracks, providerRuns, summary);
      return true;
    } catch (error) {
      patchCandidate({
        status: error?.name === "AbortError" ? "cancelled" : "error",
        stage: "",
        progress: 0,
        error: error?.name === "AbortError" ? "" : error?.message || "Candidate pipeline could not be completed.",
      });
      return false;
    } finally {
      active = null;
    }
  }

  async function restoreRun(runId = "") {
    const context = contextFor();
    if (!context || active) return false;
    patchCandidate({ status: "loading-run", activeRunId: runId, error: "" });
    try {
      const artifact = await loadArtifact(context.scope, context.item.id, runId, getWindow());
      if (!artifact) throw new Error("The candidate evidence run is no longer available on this device.");
      const providerRuns = createTrackingCandidateProviderRuns(artifact, { frame: artifact.frame, now: () => artifact.createdAt });
      const tracks = await retainReviewTracks(artifact.rawTracks);
      publishReview(context.item.id, tracks, providerRuns, trackingCandidatePipelineSummary(artifact));
      return true;
    } catch (error) {
      patchCandidate({ status: "error", error: error?.message || "Candidate evidence could not be restored." });
      return false;
    }
  }

  async function exportRun(runId = "") {
    const context = contextFor();
    if (!context) return false;
    try {
      const artifact = await loadArtifact(context.scope, context.item.id, runId, getWindow());
      if (!artifact) throw new Error("The candidate evidence run is no longer available on this device.");
      return downloadJson(getWindow(), artifact, `fs-player-${artifact.id}.json`);
    } catch (error) {
      patchCandidate({ status: "error", error: error?.message || "Candidate evidence could not be exported." });
      return false;
    }
  }

  async function removeRun(runId = "") {
    const context = contextFor();
    if (!context || !getWindow()?.confirm?.("Remove this device-local candidate evidence run?")) return false;
    await removeArtifact(context.scope, context.item.id, runId, getWindow());
    return restoreSummaries(getState());
  }

  function cancel() {
    if (!active) return false;
    active.controller.abort();
    patchCandidate({ status: "cancelling", stage: "Cancelling candidate pipeline", error: "" });
    return true;
  }

  function handleAction(action = "", element = null) {
    const runId = String(element?.dataset?.videoAnalysisTrackingCandidateRunId || "");
    const stage = String(element?.dataset?.videoAnalysisTrackingCandidateStage || "");
    if (action === "candidate-pipeline-run") { void run(); return true; }
    if (action === "candidate-pipeline-cancel") return cancel();
    if (action === "candidate-pipeline-restore") { void restoreRun(runId); return true; }
    if (action === "candidate-pipeline-export") { void exportRun(runId); return true; }
    if (action === "candidate-pipeline-remove") { void removeRun(runId); return true; }
    if (action === "candidate-benchmark-provider") return selectBenchmarkProvider(stage);
    return false;
  }

  function observe(state = getState()) {
    const key = contextFor(state)?.key || "";
    if (key !== observedKey) void restoreSummaries(state);
  }

  function start() {
    if (unsubscribe || disposed) return false;
    const store = options.getStore?.();
    if (!store?.subscribe) return false;
    unsubscribe = store.subscribe(observe);
    observe(store.getState());
    return true;
  }

  function dispose() {
    disposed = true;
    active?.controller.abort();
    active = null;
    unsubscribe?.();
    unsubscribe = null;
    return true;
  }

  return { cancel, dispose, handleAction, restore: () => restoreSummaries(getState()), run, start };
}
