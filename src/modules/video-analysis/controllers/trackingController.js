import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { createTrackingContinuationController } from "./trackingContinuationController.js";
import {
  createTrackingBatchController,
  trackingBatchTargets,
} from "./trackingBatchController.js";
import { createTrackingGroundTruthController } from "./trackingGroundTruthController.js";
import {
  createTrackingProviderRunController,
} from "./trackingProviderRunController.js";
import { createTrackingGraphicController } from "./trackingGraphicController.js";
import { createTrackingReviewController } from "./trackingReviewController.js";
import { createTrackingJobSession } from "../services/trackingJobSessionService.js";
import { normalizeTrackingJobProgress } from "../services/trackingProgressService.js";
import {
  initialTrackingPromptChunk,
  mergeTrackingExtension,
  trackingContinuationProgress,
  trackingExtensionCorrection,
  trackingTargetRange,
} from "../services/trackingExtensionService.js";
import {
  createManualPromptTrack,
  trackingPrompt,
  verifyObjectTrack,
} from "../services/trackingReviewService.js";
import { persistTrackingTrack } from "../services/trackingTrackPersistenceService.js";
import { eventElement } from "../video-analysis.dom-events.js";
import {
  currentTrackingAtMs as currentAtMs,
  normalizedTrackingPointer as normalizedPointer,
  patchTrackingState as trackingPatch,
  replacePresentationItem as replaceItem,
  selectedTrackingItem as selectedItem,
  trackingItemById,
  trackingItemRange as itemRange,
  trackingPromptBox as promptBox,
  toggleTrackingTrackSelection,
  updateTrackingPromptField,
} from "./trackingControllerHelpers.js";

export { preserveTrackingProviderEvidenceIdentity } from "./trackingProviderRunController.js";

export function createTrackingController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const getCurrentMatchMs = options.getCurrentMatchMs || null;
  const now = options.now || Date.now;
  const providerRuns = createTrackingProviderRunController({
    getState,
    updateState,
    getVideoElement,
    inspectProvider: options.inspectProvider,
    now,
  });
  const trackingJob = createTrackingJobSession((request) => {
    if (Array.isArray(request.prompts)) {
      if (!options.trackObjects) throw new Error("Batch tracking is not available.");
      return options.trackObjects(request);
    }
    if (!options.trackObject) throw new Error("No local tracking provider is configured.");
    return options.trackObject(request);
  });
  let activeInteraction = null;
  const groundTruth = createTrackingGroundTruthController({
    getState,
    updateState,
    getVideoElement,
    getWindow: options.getWindow,
    getReviewer: options.getReviewer,
    now,
  });
  const reviewController = createTrackingReviewController({
    getState,
    updateState,
    getVideoElement,
    getCurrentMatchMs,
    seekToMatchMs: options.seekToMatchMs,
    persistTrack,
    persistCorrection: options.persistCorrection,
    invalidateGroundTruth: groundTruth.invalidateDraft,
  });
  const graphicController = createTrackingGraphicController({
    getState,
    updateState,
    persistGraphic: options.persistGraphic,
  });
  const batchController = createTrackingBatchController({
    getState,
    updateState,
    now,
    persistTrack,
    captureProviderRun: providerRuns.capture,
    getProviderRunFrame: providerRuns.frame,
    trackObjects: options.trackObjects,
    trackingJob,
  });

  function setMode(mode = "static") {
    const nextMode = mode === "tracking" ? "tracking" : "static";
    updateState((state) => trackingPatch(state, {
      mode: nextMode,
      captureMode: "",
      interaction: null,
      error: "",
    }));
    if (nextMode === "tracking") {
      groundTruth.refreshContext();
      void providerRuns.refresh();
      void options.restoreTrackingWorkspace?.();
    }
    return true;
  }

  function setTool(tool = "highlight") {
    updateState((state) => trackingPatch(state, { tool, error: "" }));
    return true;
  }

  function selectTrack(trackId = "") {
    updateState((state) => toggleTrackingTrackSelection(state, trackId));
    reviewController.syncHistory();
    return true;
  }

  function beginCapture(captureMode = "prompt", target = null) {
    target?.closest?.(".video-analysis-drawing-builder")
      ?.querySelector?.("[data-video-analysis-drawing-surface]")
      ?.scrollIntoView?.({ block: "nearest" });
    const batchAnchorAtMs = captureMode === "prompt" ? batchController.anchorAtMs() : NaN;
    if (Number.isFinite(batchAnchorAtMs)) options.seekToMatchMs?.(batchAnchorAtMs);
    updateState((state) => {
      const item = selectedItem(state);
      const prompt = state.presentation?.tracking?.prompt || trackingPrompt(itemRange(item || {}));
      return trackingPatch(state, {
        captureMode,
        prompt: captureMode === "prompt" ? { ...prompt, box: null } : prompt,
        error: "",
      });
    });
    return true;
  }

  function updateField(field = "", value = "") {
    updateState((state) => updateTrackingPromptField(state, field, value));
    return true;
  }

  async function persistTrack(trackValue = {}) {
    const track = await persistTrackingTrack(trackValue, {
      persistLocalTrack: options.persistLocalTrack,
      persistMetadata: options.persistTrack,
    });
    const status = track.metadata?.localWorkspaceStatus;
    if (["pending-central", "unprotected"].includes(status)) {
      updateState((state) => trackingPatch(state, {
        workspace: {
          ...(state.presentation?.tracking?.workspace || {}),
          status: status === "pending-central" ? "pending-sync" : "attention",
          error: String(track.metadata?.localWorkspaceError || ""),
        },
      }));
    }
    return track;
  }

  async function addManualTrack() {
    const state = getState();
    const item = selectedItem(state);
    const prompt = state.presentation?.tracking?.prompt;
    if (!item || !prompt?.box) return false;
    let track = createManualPromptTrack({
      ...prompt,
      clipId: item.clipId,
      videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
      teamId: state.video?.team_id || "",
    });
    try {
      track = await persistTrack(track);
    } catch {
      // The manual track remains usable locally if metadata persistence is temporarily unavailable.
    }
    updateState((current) => {
      const liveItem = selectedItem(current);
      if (!liveItem) return current;
      return trackingPatch(replaceItem(current, liveItem.id, {
        objectTracks: [...(liveItem.objectTracks || []), track],
      }), {
        selectedTrackIds: [track.id],
        captureMode: "",
        prompt: { ...prompt, box: null },
        error: "",
      });
    });
    return true;
  }

  async function runTracking(runOptions = {}) {
    const state = getState();
    const item = selectedItem(state);
    const requestedPrompt = runOptions.prompt || state.presentation?.tracking?.prompt;
    const baseTrack = runOptions.baseTrack ? normalizeObjectTrack(runOptions.baseTrack) : null;
    if (!item || !requestedPrompt?.box || !options.trackObject || trackingJob.isActive()) return false;
    const provider = state.presentation?.tracking?.provider || {};
    const frame = providerRuns.frame();
    const targetRange = baseTrack
      ? trackingTargetRange(baseTrack, itemRange(item))
      : { startMs: requestedPrompt.startMs, endMs: requestedPrompt.endMs };
    const prompt = baseTrack
      ? trackingPrompt(requestedPrompt)
      : initialTrackingPromptChunk(requestedPrompt, { maxDurationMs: provider.maxDurationMs });
    const direction = runOptions.direction === "earlier" ? "earlier" : "later";
    updateState((current) => trackingPatch(current, {
      job: normalizeTrackingJobProgress(trackingContinuationProgress({
        stage: baseTrack ? `Extending track ${direction}` : "Preparing local tracking",
        ratio: 0.02,
      }, runOptions.batch), {}, { nowMs: now() }),
      error: "",
    }));
    try {
      let track = await trackingJob.run({
        videoRef: state.videoRef,
        clipId: item.clipId,
        videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
        continuationDirection: baseTrack ? direction : "",
        prompt,
        sourceArtifactId: baseTrack?.metadata?.localSourceArtifactId
          || baseTrack?.metadata?.localArtifactId
          || "",
        onProgress: (progress = {}) => updateState((current) => trackingPatch(current, {
          job: normalizeTrackingJobProgress(
            trackingContinuationProgress(progress, runOptions.batch),
            current.presentation?.tracking?.job || {},
            { nowMs: now() },
          ),
        })),
      });
      const trackedPart = normalizeObjectTrack({
        ...track,
        clipId: item.clipId,
        videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
        entityType: baseTrack ? baseTrack.entityType : prompt.entityType || track.entityType,
        playerId: baseTrack ? baseTrack.playerId : prompt.playerId || track.playerId,
        playerLabel: baseTrack ? baseTrack.playerLabel : prompt.playerLabel || track.playerLabel,
        teamSide: baseTrack ? baseTrack.teamSide : prompt.teamSide || track.teamSide,
        shirtNumber: baseTrack ? baseTrack.shirtNumber : prompt.shirtNumber || track.shirtNumber,
        status: "review",
        metadata: {
          ...(track.metadata || {}),
          targetStartMs: targetRange.startMs,
          targetEndMs: targetRange.endMs,
        },
      });
      providerRuns.capture({
        itemId: item.id,
        provider,
        frame,
        range: { startMs: prompt.startMs, endMs: prompt.endMs },
        tracks: [trackedPart],
      });
      track = baseTrack ? mergeTrackingExtension(baseTrack, trackedPart, direction) : trackedPart;
      track = await persistTrack(track);
      if (baseTrack && options.persistCorrection) {
        try {
          await options.persistCorrection(trackingExtensionCorrection(track, direction));
        } catch {
          // The merged local track remains reviewable if correction metadata is temporarily unavailable.
        }
      }
      updateState((current) => {
        const liveItem = trackingItemById(current, item.id);
        if (!liveItem) return trackingPatch(current, { job: null });
        const tracks = [...(liveItem.objectTracks || []).filter((entry) => (
          entry.id !== track.id && entry.id !== baseTrack?.id
        )), track];
        return trackingPatch(replaceItem(current, liveItem.id, { objectTracks: tracks }), {
          selectedTrackIds: [track.id],
          ...(runOptions.clearPending ? { pendingPrompts: [] } : {}),
          captureMode: "",
          prompt: { ...requestedPrompt, ...targetRange, box: null },
          job: null,
          error: "",
        });
      });
      return true;
    } catch (error) {
      updateState((current) => trackingPatch(current, {
        job: null,
        error: error?.name === "AbortError" ? "" : error?.message || "Local tracking could not be completed.",
      }));
      return false;
    }
  }

  async function runTargets() {
    const state = getState();
    const targets = trackingBatchTargets(state);
    if (targets.length >= 2) return batchController.run();
    if (targets.length === 1 && (state.presentation?.tracking?.pendingPrompts || []).length) {
      return runTracking({ prompt: targets[0], clearPending: true });
    }
    return runTracking();
  }

  const continuation = createTrackingContinuationController({
    getContext: () => {
      const state = getState();
      const item = selectedItem(state);
      const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
      return {
        item,
        provider: state.presentation?.tracking?.provider || {},
        range: itemRange(item || {}),
        track: (item?.objectTracks || []).find((entry) => entry.id === trackId) || null,
      };
    },
    now,
    runTracking,
    setError: (error) => updateState((state) => trackingPatch(state, { error })),
  });

  async function verifySelectedTrack() {
    const state = getState();
    const item = selectedItem(state);
    const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
    const track = (item?.objectTracks || []).find((entry) => entry.id === trackId);
    if (!item || !track) return false;
    try {
      const verified = await persistTrack(verifyObjectTrack(track));
      updateState((current) => {
        const liveItem = selectedItem(current);
        return liveItem ? replaceItem(current, liveItem.id, {
          objectTracks: (liveItem.objectTracks || []).map((entry) => entry.id === verified.id ? verified : entry),
        }) : current;
      });
      return true;
    } catch (error) {
      updateState((current) => trackingPatch(current, { error: error.message || "Review the track before verification." }));
      return false;
    }
  }

  function startInteraction(event, surface) {
    const state = getState();
    const captureMode = state.presentation?.tracking?.captureMode;
    if (!captureMode) return false;
    const start = normalizedPointer(event, surface);
    activeInteraction = { captureMode, start, surface, pointerId: event.pointerId };
    event.preventDefault?.();
    surface?.setPointerCapture?.(event.pointerId);
    return true;
  }

  function updateInteraction(event) {
    if (!activeInteraction) return false;
    activeInteraction.end = normalizedPointer(event, activeInteraction.surface);
    event.preventDefault?.();
    return true;
  }

  function finishInteraction(event) {
    if (!activeInteraction) return false;
    const interaction = activeInteraction;
    activeInteraction = null;
    const end = normalizedPointer(event, interaction.surface);
    const state = getState();
    const item = selectedItem(state);
    const current = state.presentation?.tracking?.prompt || trackingPrompt(itemRange(item || {}));
    const batchAnchorAtMs = batchController.anchorAtMs();
    const prompt = {
      ...current,
      box: promptBox(interaction.start, end),
      promptAtMs: Number.isFinite(batchAnchorAtMs)
        ? batchAnchorAtMs
        : currentAtMs(getVideoElement, state, getCurrentMatchMs),
    };
    if (interaction.captureMode === "correction") {
      const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
      const track = (item?.objectTracks || []).find((entry) => entry.id === trackId);
      if (track && item) {
        const atMs = currentAtMs(getVideoElement, state, getCurrentMatchMs);
        reviewController.applyPositionCorrection({ ...prompt, atMs });
        updateState((currentState) => trackingPatch(currentState, {
          prompt: { ...prompt, box: null },
          captureMode: "",
          interaction: null,
          error: "",
        }));
      }
    } else {
      updateState((currentState) => trackingPatch(currentState, { prompt, captureMode: "", interaction: null, error: "" }));
    }
    event.preventDefault?.();
    return true;
  }

  function handleClick(event) {
    const target = eventElement(event);
    const mode = target?.closest?.("[data-video-analysis-tracking-mode]");
    if (mode) return setMode(mode.dataset.videoAnalysisTrackingMode);
    const tool = target?.closest?.("[data-video-analysis-tracking-tool]");
    if (tool) return setTool(tool.dataset.videoAnalysisTrackingTool);
    const track = target?.closest?.("[data-video-analysis-track-select]");
    if (track) return selectTrack(track.dataset.videoAnalysisTrackSelect);
    const actionElement = target?.closest?.("[data-video-analysis-tracking-action]");
    const action = actionElement?.dataset?.videoAnalysisTrackingAction;
    if (!action) return false;
    if (action === "select-target") return beginCapture("prompt", target);
    if (action === "correct") return beginCapture("correction", target);
    if (action === "manual") { void addManualTrack(); return true; }
    if (action === "queue-target") return batchController.queueCurrent();
    if (action === "remove-target") return batchController.remove(actionElement.dataset.videoAnalysisTrackingPromptId);
    if (action === "clear-target") return batchController.clearCurrent();
    if (action === "run") { void runTargets(); return true; }
    if (action === "extend-earlier") { void continuation.extend("earlier"); return true; }
    if (action === "extend-later") { void continuation.extend("later"); return true; }
    if (action === "complete-range") { void continuation.complete(); return true; }
    if (action === "refresh-provider") { void providerRuns.refresh(); return true; }
    if (action === "retry-benchmark-storage") { void options.retryBenchmarkStorage?.(); return true; }
    if (action === "retry-tracking-workspace") { void options.retryTrackingWorkspace?.(); return true; }
    if (action === "cancel") {
      const cancelled = trackingJob.cancel();
      if (cancelled) updateState((state) => trackingPatch(state, {
        job: normalizeTrackingJobProgress(
          { stage: "Cancelling", ratio: state.presentation?.tracking?.job?.progress },
          state.presentation?.tracking?.job || {},
          { nowMs: now() },
        ),
      }));
      return cancelled;
    }
    if (action === "verify") { void verifySelectedTrack(); return true; }
    if (action === "add-graphic") { void graphicController.add(); return true; }
    if (reviewController.handleAction(action)) return true;
    if (groundTruth.handleAction(action, actionElement)) return true;
    return false;
  }

  function handleChange(event) {
    const field = eventElement(event)?.closest?.("[data-video-analysis-tracking-field]");
    if (!field) return false;
    if (groundTruth.handleField(field.dataset.videoAnalysisTrackingField, field)) return true;
    return updateField(field.dataset.videoAnalysisTrackingField, field.value);
  }

  return {
    finishInteraction,
    handleChange,
    handleClick,
    refreshProvider: providerRuns.refresh,
    startInteraction,
    updateInteraction,
  };
}
