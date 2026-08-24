import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { pointerPercent } from "../services/presentationLayerGeometryService.js";
import {
  presentationQueue,
  selectedPresentationItem,
  updatePresentationItem,
} from "../services/presentationService.js";
import {
  applyManualTrackingCorrection,
  createManualPromptTrack,
  trackingMetadataPayload,
  trackingPrompt,
  verifyObjectTrack,
} from "../services/trackingReviewService.js";
import { getVideoCurrentMs } from "../services/videoPlaybackService.js";
import { eventElement } from "../video-analysis.dom-events.js";

function localId(prefix = "graphic") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function selectedItem(state = {}) {
  return selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
}

function trackingPatch(state = {}, patch = {}) {
  return {
    ...state,
    presentation: {
      ...(state.presentation || {}),
      tracking: { ...(state.presentation?.tracking || {}), ...patch },
    },
  };
}

function replaceItem(state = {}, itemId = "", patch = {}) {
  return {
    ...state,
    presentation: {
      ...(state.presentation || {}),
      current: updatePresentationItem(state.presentation?.current, itemId, patch),
    },
  };
}

function normalizedPointer(event, surface) {
  const point = pointerPercent(event, surface);
  return { x: point.x / 100, y: point.y / 100 };
}

function promptBox(start = {}, end = {}) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return {
    left,
    top,
    width: Math.max(0.02, Math.abs(end.x - start.x)),
    height: Math.max(0.04, Math.abs(end.y - start.y)),
  };
}

function itemRange(item = {}) {
  const clip = item.clip || {};
  const startMs = Math.max(0, Math.round(Number(item.startMs ?? clip.startMs ?? clip.start_ms) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(item.endMs ?? clip.endMs ?? clip.end_ms) || startMs + 5000));
  return { startMs, endMs };
}

function currentAtMs(getVideoElement, state = {}) {
  const video = getVideoElement?.();
  return video ? getVideoCurrentMs(video) : Math.max(0, Number(state.timeline?.playheadMs) || 0);
}

export function createTrackingController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  let activeInteraction = null;

  function setMode(mode = "static") {
    updateState((state) => trackingPatch(state, {
      mode: mode === "tracking" ? "tracking" : "static",
      captureMode: "",
      interaction: null,
      error: "",
    }));
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

  function selectedPlayer(state = {}, playerId = "") {
    return (state.players || []).find((player) => player.id === playerId) || null;
  }

  function updateField(field = "", value = "") {
    updateState((state) => {
      const item = selectedItem(state);
      const existing = state.presentation?.tracking?.prompt || trackingPrompt({ ...itemRange(item || {}) });
      if (field === "playerId") {
        const player = selectedPlayer(state, value);
        return trackingPatch(state, {
          prompt: { ...existing, playerId: value, playerLabel: player?.name || "" },
          error: "",
        });
      }
      const milliseconds = Math.max(0, Math.round(Number(value) * 1000) || 0);
      const prompt = field === "startSeconds"
        ? { ...existing, startMs: milliseconds, endMs: Math.max(milliseconds + 1, existing.endMs) }
        : { ...existing, endMs: Math.max(existing.startMs + 1, milliseconds) };
      return trackingPatch(state, { prompt, error: "" });
    });
    return true;
  }

  async function persistTrack(track = {}) {
    if (!options.persistTrack) return track;
    const payload = await options.persistTrack(trackingMetadataPayload(track));
    return normalizeObjectTrack({ ...track, ...(payload?.objectTrack || payload?.track || {}) });
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

  async function runTracking() {
    const state = getState();
    const item = selectedItem(state);
    const prompt = state.presentation?.tracking?.prompt;
    if (!item || !prompt?.box || !options.trackObject) return false;
    updateState((current) => trackingPatch(current, {
      job: { stage: "Preparing local tracking", progress: 0.02 },
      error: "",
    }));
    try {
      let track = await options.trackObject({
        videoRef: state.videoRef,
        clipId: item.clipId,
        videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
        prompt,
        onProgress: (progress = {}) => updateState((current) => trackingPatch(current, {
          job: {
            stage: progress.stage || "Tracking player",
            progress: Math.max(0, Math.min(1, Number(progress.ratio) || 0)),
          },
        })),
      });
      track = normalizeObjectTrack({
        ...track,
        clipId: item.clipId,
        videoId: item.clip?.videoId || item.clip?.video_id || state.video?.id,
        playerId: prompt.playerId || track.playerId,
        playerLabel: prompt.playerLabel || track.playerLabel,
        status: "review",
      });
      track = await persistTrack(track);
      updateState((current) => {
        const liveItem = selectedItem(current);
        if (!liveItem) return current;
        const tracks = [...(liveItem.objectTracks || []).filter((entry) => entry.id !== track.id), track];
        return trackingPatch(replaceItem(current, liveItem.id, { objectTracks: tracks }), {
          selectedTrackIds: [track.id],
          captureMode: "",
          prompt: { ...prompt, box: null },
          job: null,
          error: "",
        });
      });
      return true;
    } catch (error) {
      updateState((current) => trackingPatch(current, {
        job: null,
        error: error?.message || "Local tracking could not be completed.",
      }));
      return false;
    }
  }

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
    const prompt = { ...current, box: promptBox(interaction.start, end) };
    if (interaction.captureMode === "correction") {
      const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
      const track = (item?.objectTracks || []).find((entry) => entry.id === trackId);
      if (track && item) {
        const atMs = currentAtMs(getVideoElement, state);
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
    if (action === "verify") { void verifySelectedTrack(); return true; }
    if (action === "add-graphic") { void addGraphic(); return true; }
    return false;
  }

  function handleChange(event) {
    const field = eventElement(event)?.closest?.("[data-video-analysis-tracking-field]");
    return field ? updateField(field.dataset.videoAnalysisTrackingField, field.value) : false;
  }

  return {
    finishInteraction,
    handleChange,
    handleClick,
    startInteraction,
    updateInteraction,
  };
}
