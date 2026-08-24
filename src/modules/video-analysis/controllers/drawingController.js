import {
  addDrawingLayerToItem,
  normalizeDrawingLayer,
  presentationQueue,
  removeDrawingLayerFromItem,
  selectedPresentationItem,
  updateDrawingLayerInItem,
} from "../services/presentationService.js";
import {
  defaultDrawingGeometry,
  geometryFromDrag,
  moveGeometry,
  pointerPercent,
  resizeGeometry,
} from "../services/presentationLayerGeometryService.js";
import { getVideoCurrentMs } from "../services/videoPlaybackService.js";
import { eventElement } from "../video-analysis.dom-events.js";

function currentPlayheadMs(getVideoElement = () => null, state = {}, getCurrentMatchMs = null) {
  const matchMs = getCurrentMatchMs?.();
  if (Number.isFinite(Number(matchMs))) return Math.max(0, Math.round(Number(matchMs)));
  const video = getVideoElement();
  const timelineMs = Math.max(0, Math.round(Number(state.timeline?.playheadMs ?? state.draft?.startMs ?? 0)));
  if (!video) return timelineMs;
  const videoMs = getVideoCurrentMs(video);
  const videoReady = Number(video.readyState || 0) > 0 || videoMs > 0;
  return videoReady ? videoMs : timelineMs;
}

function selectedItem(state = {}) {
  return selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId
  );
}

function drawingLayerById(item = {}, layerId = "") {
  return (item.drawings || []).find((layer) => layer.id === layerId) || null;
}

function createDrawingLayer(state = {}, item = {}, getVideoElement = () => null, geometry = {}, getCurrentMatchMs = null) {
  const draft = state.presentation?.drawingDraft || {};
  const tool = state.presentation?.drawingTool || "arrow";
  const presentation = state.presentation?.current || {};
  return normalizeDrawingLayer({
    presentationId: presentation.id,
    presentationItemId: item.id,
    clipId: item.clipId,
    timestampMs: currentPlayheadMs(getVideoElement, state, getCurrentMatchMs),
    durationMs: draft.durationSeconds ? Math.round(Number(draft.durationSeconds || 0) * 1000) : null,
    tool,
    text: draft.text || (tool === "text" ? "Coach point" : ""),
    geometry,
    style: { color: tool === "spotlight" ? "#ffffff" : "#f4d06f" },
  });
}

function withUndoStack(presentationState = {}, previousPresentation = null, patch = {}) {
  return {
    ...presentationState,
    ...patch,
    drawingUndoStack: [...(presentationState.drawingUndoStack || []), previousPresentation]
      .filter(Boolean)
      .slice(-20),
    drawingRedoStack: [],
  };
}

export function createDrawingController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getRoot = options.getRoot || (() => null);
  const getVideoElement = options.getVideoElement || (() => null);
  const getCurrentMatchMs = options.getCurrentMatchMs || null;

  function addLayerAtPoint(geometry = null) {
    updateState((state) => {
      const presentation = state.presentation?.current;
      const item = selectedItem(state);
      if (!item) return state;
      const draft = state.presentation?.drawingDraft || {};
      const tool = state.presentation?.drawingTool || "arrow";
      const layer = createDrawingLayer(state, item, getVideoElement, geometry || defaultDrawingGeometry(tool), getCurrentMatchMs);
      return {
        ...state,
        presentation: withUndoStack(state.presentation || {}, presentation, {
          current: addDrawingLayerToItem(presentation, item.id, layer),
          selectedDrawingLayerId: layer.id,
          drawingDraft: { ...draft, timestampSeconds: "", durationSeconds: "", text: "" },
        }),
      };
    });
    return true;
  }

  function selectLayer(layerId = "") {
    updateState((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        selectedDrawingLayerId: layerId,
      },
    }));
    return true;
  }

  function removeLayer(layerId = "") {
    updateState((state) => {
      const presentation = state.presentation?.current;
      const item = selectedItem(state);
      if (!item || !layerId) return state;
      return {
        ...state,
        presentation: withUndoStack(state.presentation || {}, presentation, {
          current: removeDrawingLayerFromItem(presentation, item.id, layerId),
          selectedDrawingLayerId: state.presentation?.selectedDrawingLayerId === layerId ? "" : state.presentation?.selectedDrawingLayerId,
        }),
      };
    });
    return true;
  }

  function updateSelectedLayer(patch = {}) {
    updateState((state) => {
      const presentation = state.presentation?.current;
      const item = selectedItem(state);
      const layerId = state.presentation?.selectedDrawingLayerId || "";
      if (!item || !layerId) {
        return {
          ...state,
          presentation: {
            ...(state.presentation || {}),
            drawingDraft: { ...(state.presentation?.drawingDraft || {}), ...patch },
          },
        };
      }
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current: updateDrawingLayerInItem(presentation, item.id, layerId, patch),
          drawingDraft: { ...(state.presentation?.drawingDraft || {}), ...patch },
        },
      };
    });
    return true;
  }

  function undo() {
    updateState((state) => {
      const stack = [...(state.presentation?.drawingUndoStack || [])];
      const previous = stack.pop();
      if (!previous) return state;
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current: previous,
          drawingUndoStack: stack,
          drawingRedoStack: [state.presentation?.current, ...(state.presentation?.drawingRedoStack || [])]
            .filter(Boolean)
            .slice(0, 20),
        },
      };
    });
    return true;
  }

  function redo() {
    updateState((state) => {
      const stack = [...(state.presentation?.drawingRedoStack || [])];
      const next = stack.shift();
      if (!next) return state;
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current: next,
          drawingUndoStack: [...(state.presentation?.drawingUndoStack || []), state.presentation?.current]
            .filter(Boolean)
            .slice(-20),
          drawingRedoStack: stack,
        },
      };
    });
    return true;
  }

  function startInteraction(event, surface = null) {
    const state = getState();
    const presentation = state.presentation?.current;
    const item = selectedItem(state);
    if (!item) return false;
    const point = pointerPercent(event, surface);
    const resizeTarget = eventElement(event)?.closest?.("[data-video-analysis-drawing-resize]");
    const layerTarget = eventElement(event)?.closest?.("[data-video-analysis-drawing-layer]");
    const [resizeLayerId, resizeHandle] = String(resizeTarget?.dataset?.videoAnalysisDrawingResize || "").split(":");
    const layerId = resizeLayerId || layerTarget?.dataset?.videoAnalysisDrawingLayer || "";
    const layer = drawingLayerById(item, layerId);
    event.preventDefault?.();
    surface?.setPointerCapture?.(event.pointerId);
    if (layer) {
      updateState((current) => ({
        ...current,
        presentation: {
          ...(current.presentation || {}),
          selectedDrawingLayerId: layer.id,
          drawingInteraction: {
            type: resizeTarget ? "resize" : "move",
            itemId: item.id,
            layerId: layer.id,
            handle: resizeHandle || "end",
            start: point,
            last: point,
            originalGeometry: layer.geometry || {},
            beforePresentation: presentation,
          },
        },
      }));
      return true;
    }
    const tool = state.presentation?.drawingTool || "arrow";
    const geometry = defaultDrawingGeometry(tool, point);
    const previewLayer = createDrawingLayer(state, item, getVideoElement, geometry);
    updateState((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        selectedDrawingLayerId: "",
        drawingInteraction: {
          type: "create",
          itemId: item.id,
          start: point,
          last: point,
          tool,
          previewLayer,
          beforePresentation: presentation,
        },
      },
    }));
    return true;
  }

  function updateInteraction(event) {
    const state = getState();
    const interaction = state.presentation?.drawingInteraction;
    if (!interaction) return false;
    const surface = getRoot()?.querySelector("[data-video-analysis-drawing-surface]");
    const point = pointerPercent(event, surface);
    event.preventDefault?.();
    updateState((current) => {
      const liveInteraction = current.presentation?.drawingInteraction || interaction;
      const presentation = current.presentation?.current;
      const item = selectedPresentationItem(presentation, liveInteraction.itemId, "");
      if (!item) return current;
      if (liveInteraction.type === "create") {
        const geometry = geometryFromDrag(liveInteraction.tool, liveInteraction.start, point);
        return {
          ...current,
          presentation: {
            ...(current.presentation || {}),
            drawingInteraction: {
              ...liveInteraction,
              last: point,
              previewLayer: {
                ...(liveInteraction.previewLayer || {}),
                geometry,
              },
            },
          },
        };
      }
      const layer = drawingLayerById(item, liveInteraction.layerId);
      if (!layer) return current;
      const dx = point.x - liveInteraction.start.x;
      const dy = point.y - liveInteraction.start.y;
      const geometry = liveInteraction.type === "resize"
        ? resizeGeometry(layer.tool, liveInteraction.originalGeometry, liveInteraction.handle, point)
        : moveGeometry(liveInteraction.originalGeometry, dx, dy);
      return {
        ...current,
        presentation: {
          ...(current.presentation || {}),
          current: updateDrawingLayerInItem(presentation, item.id, layer.id, { geometry }),
          drawingInteraction: { ...liveInteraction, last: point },
        },
      };
    });
    return true;
  }

  function finishInteraction(event) {
    const state = getState();
    const interaction = state.presentation?.drawingInteraction;
    if (!interaction) return false;
    const surface = getRoot()?.querySelector("[data-video-analysis-drawing-surface]");
    const point = pointerPercent(event, surface);
    event.preventDefault?.();
    updateState((current) => {
      const liveInteraction = current.presentation?.drawingInteraction || interaction;
      const presentation = current.presentation?.current;
      const item = selectedPresentationItem(presentation, liveInteraction.itemId, "");
      if (!item) {
        return {
          ...current,
          presentation: { ...(current.presentation || {}), drawingInteraction: null },
        };
      }
      if (liveInteraction.type === "create") {
        const geometry = geometryFromDrag(liveInteraction.tool, liveInteraction.start, point);
        const layer = createDrawingLayer(current, item, getVideoElement, geometry);
        return {
          ...current,
          presentation: withUndoStack(current.presentation || {}, liveInteraction.beforePresentation, {
            current: addDrawingLayerToItem(presentation, item.id, layer),
            selectedDrawingLayerId: layer.id,
            drawingInteraction: null,
            drawingDraft: { timestampSeconds: "", durationSeconds: "", text: "" },
          }),
        };
      }
      return {
        ...current,
        presentation: withUndoStack(current.presentation || {}, liveInteraction.beforePresentation, {
          drawingInteraction: null,
        }),
      };
    });
    return true;
  }

  function selectedLayer() {
    const state = getState();
    const item = selectedItem(state);
    return drawingLayerById(item || {}, state.presentation?.selectedDrawingLayerId || "");
  }

  return {
    addLayerAtPoint,
    finishInteraction,
    redo,
    removeLayer,
    selectLayer,
    selectedLayer,
    startInteraction,
    undo,
    updateInteraction,
    updateSelectedLayer,
  };
}
