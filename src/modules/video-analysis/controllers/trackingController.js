import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { createTrackingContinuationController } from "./trackingContinuationController.js";
import { createTrackingGroundTruthController } from "./trackingGroundTruthController.js";
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
  applyManualTrackingCorrection,
  createManualPromptTrack,
  trackingMetadataPayload,
  trackingPrompt,
  verifyObjectTrack,
} from "../services/trackingReviewService.js";
import { eventElement } from "../video-analysis.dom-events.js";
import {
  currentTrackingAtMs as currentAtMs,
  normalizedTrackingPointer as normalizedPointer,
  patchTrackingState as trackingPatch,
  replacePresentationItem as replaceItem,
  selectedTrackingItem as selectedItem,
  trackingItemById,
  trackingItemRange as itemRange,
  trackingLocalId as localId,
  trackingPromptBox as promptBox,
  updateTrackingPromptField,
} from "./trackingControllerHelpers.js";

export function createTrackingController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const getCurrentMatchMs = options.getCurrentMatchMs || null;
  const now = options.now || Date.now;
  const trackingJob = createTrackingJobSession(options.trackObject);
  let activeInteraction = null;
  let providerRefreshId = 0;
  const groundTruth = createTrackingGroundTruthController({
    getState,
    updateState,
    getVideoElement,
    getWindow: options.getWindow,
    getReviewer: options.getReviewer,
    now,
  });

  async function refreshProvider() {
    if (!options.inspectProvider) return false;
    const refreshId = ++providerRefreshId;
    updateState((state) => trackingPatch(state, {
      provider: {
        ...(state.presentation?.tracking?.provider || {}),
        status: "checking",
        available: false,
        error: "",
      },
    }));
    let provider;
    try {
      provider = await options.inspectProvider();
    } catch (error) {
      provider = {
        status: "offline",
        available: false,
        name: "Local tracking companion",
        error: error?.message || "The local tracking companion is offline.",
      };
    }
    if (refreshId !== providerRefreshId) return false;
    updateState((state) => trackingPatch(state, { provider }));
    return provider.available === true;
  }

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
      void refreshProvider();
    }
    return true;
  }

  function setTool(tool = "highlight") {
    updateState((state) => trackingPatch(state, { tool, error: "" }));
    return true;
  }

  function selectTrack(trackId = "") {
    updateState((state) => {
      const selected = [...(state.presentation?.tracking?.selectedTrackIds || [])];
      const existingIndex = selected.indexOf(trackId);
      if (existingIndex >= 0) selected.splice(existingIndex, 1);
      else selected.push(trackId);
      return trackingPatch(state, { selectedTrackIds: selected.slice(-2), error: "" });
    });
    return true;
  }

  function beginCapture(captureMode = "prompt", target = null) {
    target?.closest?.(".video-analysis-drawing-builder")
      ?.querySelector?.("[data-video-analysis-drawing-surface]")
      ?.scrollIntoView?.({ block: "nearest" });
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

  async function persistTrack(track = {}) {
    if (!options.persistTrack) return track;
    const payload = await options.persistTrack(trackingMetadataPayload(track));
    const remoteTrack = payload?.objectTrack || payload?.track || {};
    return normalizeObjectTrack({
      ...track,
      ...remoteTrack,
      metadata: { ...(remoteTrack.metadata || {}), ...(track.metadata || {}) },
    });
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

  async function addGraphic() {
    const state = getState();
    const item = selectedItem(state);
    const tracking = state.presentation?.tracking || {};
    const selectedIds = tracking.selectedTrackIds || [];
    const requiresPair = tracking.tool === "distance";
    if (!item || !selectedIds.length || (requiresPair && selectedIds.length < 2)) {
      updateState((current) => trackingPatch(current, { error: requiresPair ? "Select two tracks for distance." : "Select a track first." }));
      return false;
    }
    const range = itemRange(item);
    let graphic = normalizeDynamicGraphic({
      id: localId("graphic"),
      clipId: item.clipId,
      type: tracking.tool === "highlight" ? "circle" : tracking.tool,
      source: tracking.tool === "distance" ? "spatial" : "tracking",
      startMs: tracking.prompt?.startMs ?? range.startMs,
      endMs: tracking.prompt?.endMs ?? range.endMs,
      bindings: selectedIds.slice(0, requiresPair ? 2 : 1).map((trackId, index) => ({
        trackId,
        role: index ? "secondary" : "primary",
        anchor: "ground",
      })),
      style: { color: "#f7d154", showValue: true },
    });
    if (options.persistGraphic) {
      try {
        const payload = await options.persistGraphic(graphic);
        graphic = normalizeDynamicGraphic({ ...graphic, ...(payload?.dynamicGraphic || payload?.graphic || {}) });
      } catch (error) {
        updateState((current) => trackingPatch(current, { error: error.message || "Dynamic graphic metadata could not be saved." }));
        return false;
      }
    }
    updateState((current) => {
      const liveItem = selectedItem(current);
      return liveItem ? trackingPatch(replaceItem(current, liveItem.id, {
        dynamicGraphics: [...(liveItem.dynamicGraphics || []), graphic],
      }), { error: "" }) : current;
    });
    return true;
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
    const prompt = {
      ...current,
      box: promptBox(interaction.start, end),
      promptAtMs: currentAtMs(getVideoElement, state, getCurrentMatchMs),
    };
    if (interaction.captureMode === "correction") {
      const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
      const track = (item?.objectTracks || []).find((entry) => entry.id === trackId);
      if (track && item) {
        const atMs = currentAtMs(getVideoElement, state, getCurrentMatchMs);
        const corrected = applyManualTrackingCorrection(track, { ...prompt, atMs });
        updateState((currentState) => {
          const liveItem = selectedItem(currentState);
          return liveItem ? trackingPatch(replaceItem(currentState, liveItem.id, {
            objectTracks: (liveItem.objectTracks || []).map((entry) => entry.id === corrected.id ? corrected : entry),
          }), { prompt: { ...prompt, box: null }, captureMode: "", interaction: null, error: "" }) : currentState;
        });
        void Promise.resolve(options.persistCorrection?.({
          objectTrackId: corrected.id,
          atMs,
          box: prompt.box,
          correctionType: "position",
          reason: "Manual keyframe",
        })).catch(() => {});
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
    const action = target?.closest?.("[data-video-analysis-tracking-action]")?.dataset?.videoAnalysisTrackingAction;
    if (!action) return false;
    if (action === "select-target") return beginCapture("prompt", target);
    if (action === "correct") return beginCapture("correction", target);
    if (action === "manual") { void addManualTrack(); return true; }
    if (action === "run") { void runTracking(); return true; }
    if (action === "extend-earlier") { void continuation.extend("earlier"); return true; }
    if (action === "extend-later") { void continuation.extend("later"); return true; }
    if (action === "complete-range") { void continuation.complete(); return true; }
    if (action === "refresh-provider") { void refreshProvider(); return true; }
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
    if (action === "add-graphic") { void addGraphic(); return true; }
    if (groundTruth.handleAction(action)) return true;
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
    refreshProvider,
    startInteraction,
    updateInteraction,
  };
}
