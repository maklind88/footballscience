import { activeMediaAngle } from "../services/mediaProductionService.js";
import {
  TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
  TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT,
  createGroundTruthArtifact,
  groundTruthArtifactJson,
  normalizeTrackingGroundTruthBenchmarkType,
  trackingGroundTruthEntry,
} from "../services/trackingGroundTruthService.js";
import {
  addGroundTruthSuiteCase,
  createGroundTruthSuiteArtifact,
  groundTruthSuiteArtifactJson,
  normalizeTrackingBenchmarkScenarios,
  removeGroundTruthSuiteCase,
  trackingGroundTruthSuiteEntry,
} from "../services/trackingGroundTruthSuiteService.js";
import { emptyTrackingBenchmarkEvaluation } from "../services/trackingBenchmarkStateService.js";
import {
  createTrackingProviderRunSuiteArtifact,
  trackingProviderRunSuiteArtifactJson,
  trackingProviderRunWorkspaceEntry,
  trackingProviderRunsForProvider,
} from "../services/trackingProviderRunService.js";
import {
  patchTrackingState,
  selectedTrackingItem,
  trackingItemRange,
} from "./trackingControllerHelpers.js";

const groundTruthActions = new Set([
  "ground-truth-toggle",
  "ground-truth-target",
  "ground-truth-refresh",
  "ground-truth-lock",
  "ground-truth-download",
  "ground-truth-new",
  "ground-truth-suite-download",
  "ground-truth-suite-remove",
  "ground-truth-suite-mode",
  "ground-truth-runs-download",
]);

function groundTruthState(state = {}, itemId = "") {
  return trackingGroundTruthEntry(state.presentation?.tracking?.groundTruth || {}, itemId);
}

function patchGroundTruth(state = {}, itemId = "", patch = {}) {
  const workspace = state.presentation?.tracking?.groundTruth || {};
  return patchTrackingState(state, {
    groundTruth: {
      ...workspace,
      byItemId: {
        ...(workspace.byItemId || {}),
        [itemId]: { ...groundTruthState(state, itemId), itemId, ...patch },
      },
    },
  });
}

function patchGroundTruthSuite(state = {}, suite = {}) {
  const workspace = state.presentation?.tracking?.groundTruth || {};
  const previousCases = (workspace.suite?.cases || []).map((entry) => entry.id).join("|");
  const nextCases = (suite.cases || []).map((entry) => entry.id).join("|");
  const benchmarkTypeChanged = workspace.suite?.benchmarkType !== suite.benchmarkType;
  return patchTrackingState(state, {
    groundTruth: { ...workspace, suite },
    ...(previousCases !== nextCases || benchmarkTypeChanged ? {
      benchmarkEvaluation: emptyTrackingBenchmarkEvaluation(),
    } : {}),
  });
}

function downloadJson(win = null, json = "", fileName = "artifact.json") {
  const anchor = win?.document?.createElement?.("a");
  const BlobConstructor = win?.Blob || globalThis.Blob;
  if (!anchor || !BlobConstructor || !win?.URL?.createObjectURL) return false;
  const objectUrl = win.URL.createObjectURL(new BlobConstructor([json], { type: "application/json" }));
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  win.document.body?.appendChild?.(anchor);
  anchor.click();
  anchor.remove?.();
  win.setTimeout?.(() => win.URL.revokeObjectURL?.(objectUrl), 0);
  return true;
}

export function trackingSourceFingerprint(state = {}) {
  const angle = activeMediaAngle(state);
  const proxyFingerprint = String(
    state.mediaProduction?.proxy?.byAngleId?.[angle?.id]?.result?.sourceSha256 || "",
  ).trim();
  if (/^[a-f0-9]{64}$/i.test(proxyFingerprint)) return proxyFingerprint;
  const item = selectedTrackingItem(state);
  const trackedFingerprint = (item?.objectTracks || []).find((track) => {
    const value = String(track.metadata?.localSourceSha256 || "");
    const trackAngleId = String(track.metadata?.angleId || "");
    return /^[a-f0-9]{64}$/i.test(value) && (!angle?.id || !trackAngleId || trackAngleId === angle.id);
  })?.metadata?.localSourceSha256;
  return String(trackedFingerprint || "").trim();
}

export function trackingFrameSize(video = null) {
  const width = Math.max(0, Math.round(Number(video?.videoWidth) || 0));
  const height = Math.max(0, Math.round(Number(video?.videoHeight) || 0));
  return { width, height };
}

function reviewerId(value = null) {
  if (typeof value === "string") return value.trim();
  return String(value?.id || value?.userId || value?.user_id || "local-analyst").trim();
}

export function createTrackingGroundTruthController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const getWindow = options.getWindow || (() => globalThis.window);
  const getReviewer = options.getReviewer || (() => "local-analyst");
  const now = options.now || Date.now;

  function contextFor(state = getState()) {
    const item = selectedTrackingItem(state);
    const angle = activeMediaAngle(state);
    const suite = trackingGroundTruthSuiteEntry(state.presentation?.tracking?.groundTruth || {});
    return {
      itemId: String(item?.id || ""),
      angleId: String(angle?.id || ""),
      sourceFingerprint: trackingSourceFingerprint(state),
      frame: trackingFrameSize(getVideoElement()),
      range: trackingItemRange(item || {}),
      benchmarkType: suite.benchmarkType,
    };
  }

  function refreshContext() {
    const state = getState();
    const context = contextFor(state);
    if (!context.itemId) return false;
    const truth = groundTruthState(state, context.itemId);
    const contextChanged = truth.sourceFingerprint !== context.sourceFingerprint
      || truth.angleId !== context.angleId
      || Number(truth.frame?.width) !== context.frame.width
      || Number(truth.frame?.height) !== context.frame.height
      || Number(truth.range?.startMs) !== context.range.startMs
      || Number(truth.range?.endMs) !== context.range.endMs;
    updateState((current) => patchGroundTruth(current, context.itemId, {
      ...context,
      ...(contextChanged ? { attested: false, exhaustiveSceneAttested: false } : {}),
      error: "",
    }));
    return true;
  }

  function toggleSelectedTrack() {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    const truth = groundTruthState(state, itemId);
    const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
    if (!itemId || !trackId) return false;
    if (truth.status === "locked") {
      updateState((current) => patchGroundTruth(current, itemId, {
        error: "Start a new draft before changing the locked reference.",
      }));
      return true;
    }
    const selected = new Set((truth.selectedTrackIds || []).map(String));
    const selectedTrack = (selectedTrackingItem(state)?.objectTracks || []).find((track) => track.id === trackId);
    const benchmarkType = normalizeTrackingGroundTruthBenchmarkType(contextFor(state).benchmarkType);
    if (benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT && selectedTrack?.entityType !== "player") {
      updateState((current) => patchGroundTruth(current, itemId, {
        error: "Selected-object references require a player track.",
      }));
      return true;
    }
    const removing = selected.has(trackId);
    if (benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT) {
      selected.clear();
      if (!removing) selected.add(trackId);
    } else if (removing) selected.delete(trackId);
    else selected.add(trackId);
    const includedPlayerIds = (selectedTrackingItem(state)?.objectTracks || [])
      .filter((track) => selected.has(track.id) && track.entityType === "player")
      .map((track) => track.id);
    const benchmarkTargetTrackId = benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT
      ? removing ? "" : trackId
      : removing && truth.benchmarkTargetTrackId === trackId
        ? includedPlayerIds[0] || ""
        : !truth.benchmarkTargetTrackId && selectedTrack?.entityType === "player"
          ? trackId
          : truth.benchmarkTargetTrackId || "";
    const context = contextFor(state);
    updateState((current) => patchGroundTruth(current, itemId, {
      ...context,
      status: "draft",
      selectedTrackIds: [...selected],
      benchmarkTargetTrackId,
      attested: false,
      exhaustiveSceneAttested: false,
      error: "",
    }));
    return true;
  }

  function setBenchmarkTarget() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const truth = groundTruthState(state, item?.id);
    const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
    const track = (item?.objectTracks || []).find((entry) => entry.id === trackId);
    if (!item || truth.status === "locked" || track?.entityType !== "player"
      || !(truth.selectedTrackIds || []).includes(trackId)) return false;
    updateState((current) => patchGroundTruth(current, item.id, {
      benchmarkTargetTrackId: trackId,
      error: "",
    }));
    return true;
  }

  function setAttested(checked = false) {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    if (!itemId || groundTruthState(state, itemId).status === "locked") return false;
    updateState((current) => patchGroundTruth(current, itemId, { attested: Boolean(checked), error: "" }));
    return true;
  }

  function setExhaustiveSceneAttested(checked = false) {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    const truth = groundTruthState(state, itemId);
    const benchmarkType = trackingGroundTruthSuiteEntry(
      state.presentation?.tracking?.groundTruth || {},
    ).benchmarkType;
    if (!itemId || truth.status === "locked"
      || benchmarkType === TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT) {
      return false;
    }
    updateState((current) => patchGroundTruth(current, itemId, {
      exhaustiveSceneAttested: Boolean(checked),
      error: "",
    }));
    return true;
  }

  function lockReference() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const truth = groundTruthState(state, item?.id);
    if (!item || truth.status === "locked") return false;
    const context = contextFor(state);
    try {
      const artifact = createGroundTruthArtifact({
        ...context,
        tracks: item.objectTracks || [],
        selectedTrackIds: truth.selectedTrackIds || [],
        benchmarkTargetTrackId: truth.benchmarkTargetTrackId || "",
        benchmarkType: context.benchmarkType,
        scenarioTags: truth.scenarioTags || [],
        attested: truth.attested === true,
        exhaustiveSceneAttested: truth.exhaustiveSceneAttested === true,
        reviewedBy: reviewerId(getReviewer()),
        revision: truth.revision || 1,
      }, { now });
      updateState((current) => {
        const lockedState = patchGroundTruth(current, item.id, {
          ...context,
          status: "locked",
          lockedArtifact: artifact,
          lockedAt: artifact.reviewEvidence.reviewedAt,
          error: "",
        });
        const workspace = lockedState.presentation?.tracking?.groundTruth || {};
        return patchGroundTruthSuite(
          lockedState,
          addGroundTruthSuiteCase(trackingGroundTruthSuiteEntry(workspace), artifact),
        );
      });
      options.onEvidenceChanged?.();
      return true;
    } catch (error) {
      updateState((current) => patchGroundTruth(current, item.id, {
        ...context,
        error: error?.message || "The benchmark reference could not be locked.",
      }));
      return true;
    }
  }

  function downloadReference() {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    const artifact = groundTruthState(state, itemId).lockedArtifact;
    if (!artifact) return false;
    const win = getWindow();
    if (!downloadJson(win, groundTruthArtifactJson(artifact), `fs-player-${artifact.id}.json`)) return false;
    updateState((current) => patchGroundTruth(current, itemId, { downloadedAt: new Date(now()).toISOString(), error: "" }));
    return true;
  }

  function downloadSuite() {
    const state = getState();
    const workspace = state.presentation?.tracking?.groundTruth || {};
    const suite = trackingGroundTruthSuiteEntry(workspace);
    try {
      const artifact = createGroundTruthSuiteArtifact(suite, { now });
      const win = getWindow();
      if (!downloadJson(win, groundTruthSuiteArtifactJson(artifact), `fs-player-${artifact.id}.json`)) return false;
      updateState((current) => patchGroundTruthSuite(current, {
        ...suite,
        status: "exported",
        downloadedAt: artifact.createdAt,
        error: "",
      }));
      return true;
    } catch (error) {
      updateState((current) => patchGroundTruthSuite(current, {
        ...suite,
        error: error?.message || "The real-match suite could not be exported.",
      }));
      return true;
    }
  }

  function downloadProviderRuns() {
    const state = getState();
    const tracking = state.presentation?.tracking || {};
    const workspace = trackingProviderRunWorkspaceEntry(tracking.providerRuns);
    try {
      const runs = trackingProviderRunsForProvider(workspace, tracking.provider);
      const groundTruthSuite = trackingGroundTruthSuiteEntry(tracking.groundTruth || {});
      const artifact = createTrackingProviderRunSuiteArtifact({
        id: `${groundTruthSuite.id || "real-match-pilot"}-${runs[0]?.provider.providerId || "provider"}-runs`,
        runs,
      }, { now });
      const win = getWindow();
      if (!downloadJson(
        win,
        trackingProviderRunSuiteArtifactJson(artifact),
        `fs-player-${artifact.id}.json`,
      )) return false;
      updateState((current) => patchTrackingState(current, {
        providerRuns: {
          ...trackingProviderRunWorkspaceEntry(current.presentation?.tracking?.providerRuns),
          downloadedAt: artifact.createdAt,
          error: "",
        },
      }));
      return true;
    } catch (error) {
      updateState((current) => patchTrackingState(current, {
        providerRuns: {
          ...trackingProviderRunWorkspaceEntry(current.presentation?.tracking?.providerRuns),
          error: error?.message || "The raw provider runs could not be exported.",
        },
      }));
      return true;
    }
  }

  function removeSuiteCase(caseId = "") {
    if (!caseId) return false;
    updateState((state) => {
      const workspace = state.presentation?.tracking?.groundTruth || {};
      return patchGroundTruthSuite(
        state,
        removeGroundTruthSuiteCase(trackingGroundTruthSuiteEntry(workspace), caseId),
      );
    });
    options.onEvidenceChanged?.();
    return true;
  }

  function setSuiteBenchmarkType(value = "") {
    if (![TRACKING_BENCHMARK_TYPE_SELECTED_OBJECT, TRACKING_BENCHMARK_TYPE_MULTI_OBJECT].includes(value)) {
      return false;
    }
    const state = getState();
    const tracking = state.presentation?.tracking || {};
    const suite = trackingGroundTruthSuiteEntry(tracking.groundTruth || {});
    const runWorkspace = trackingProviderRunWorkspaceEntry(tracking.providerRuns);
    const hasProviderRuns = Object.values(runWorkspace.byItemId || {}).some((runs) => runs.length > 0);
    if (suite.cases.length || hasProviderRuns || suite.benchmarkType === value) return false;
    updateState((current) => patchGroundTruthSuite(current, {
      ...trackingGroundTruthSuiteEntry(current.presentation?.tracking?.groundTruth || {}),
      benchmarkType: value,
      status: "draft",
      downloadedAt: "",
      error: "",
    }));
    options.onEvidenceChanged?.();
    return true;
  }

  function newDraft() {
    const state = getState();
    const context = contextFor();
    if (!context.itemId) return false;
    const truth = groundTruthState(state, context.itemId);
    updateState((current) => patchGroundTruth(current, context.itemId, {
      ...context,
      status: "draft",
      revision: Math.max(1, Math.round(Number(truth.revision) || 1)) + 1,
      selectedTrackIds: [],
      benchmarkTargetTrackId: "",
      scenarioTags: [],
      attested: false,
      exhaustiveSceneAttested: false,
      lockedArtifact: null,
      lockedAt: "",
      downloadedAt: "",
      error: "",
    }));
    return true;
  }

  function invalidateDraft(itemId = "") {
    if (!itemId) return false;
    updateState((state) => {
      const truth = groundTruthState(state, itemId);
      return truth.status === "locked"
        ? state
        : patchGroundTruth(state, itemId, {
          attested: false,
          exhaustiveSceneAttested: false,
          error: "",
        });
    });
    return true;
  }

  function setScenario(scenarioId = "", checked = false) {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    const truth = groundTruthState(state, itemId);
    if (!itemId || truth.status === "locked") return false;
    const selected = new Set(normalizeTrackingBenchmarkScenarios(truth.scenarioTags));
    if (checked) selected.add(scenarioId);
    else selected.delete(scenarioId);
    updateState((current) => patchGroundTruth(current, itemId, {
      scenarioTags: normalizeTrackingBenchmarkScenarios([...selected]),
      error: "",
    }));
    return true;
  }

  function handleAction(action = "", element = null) {
    if (!groundTruthActions.has(action)) return false;
    if (action === "ground-truth-toggle") return toggleSelectedTrack();
    if (action === "ground-truth-target") return setBenchmarkTarget();
    if (action === "ground-truth-refresh") return refreshContext();
    if (action === "ground-truth-lock") return lockReference();
    if (action === "ground-truth-download") return downloadReference();
    if (action === "ground-truth-suite-download") return downloadSuite();
    if (action === "ground-truth-runs-download") return downloadProviderRuns();
    if (action === "ground-truth-suite-mode") {
      return setSuiteBenchmarkType(element?.dataset?.videoAnalysisGroundTruthBenchmarkType);
    }
    if (action === "ground-truth-suite-remove") {
      return removeSuiteCase(element?.dataset?.videoAnalysisGroundTruthCaseId);
    }
    return newDraft();
  }

  function handleField(field = "", element = {}) {
    if (field === "groundTruthAttested") return setAttested(element.checked);
    if (field === "groundTruthSceneComplete") return setExhaustiveSceneAttested(element.checked);
    if (field === "groundTruthScenario") return setScenario(element.value, element.checked);
    return false;
  }

  return {
    handleAction,
    handleField,
    invalidateDraft,
    refreshContext,
  };
}
