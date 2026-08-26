import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { trackingGraphicBindingSelection } from "../services/trackingGraphicBindingService.js";
import {
  patchTrackingState,
  replacePresentationItem,
  selectedTrackingItem,
  trackingItemRange,
  trackingLocalId,
} from "./trackingControllerHelpers.js";

export function createTrackingGraphicController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});

  async function add() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const tracking = state.presentation?.tracking || {};
    const selection = trackingGraphicBindingSelection(
      item?.objectTracks || [],
      tracking.selectedTrackIds || [],
      tracking.tool,
    );
    if (!item || !selection.ready) {
      updateState((current) => patchTrackingState(current, { error: selection.reason || "Select a track first." }));
      return false;
    }
    const range = trackingItemRange(item);
    let graphic = normalizeDynamicGraphic({
      id: trackingLocalId("graphic"),
      clipId: item.clipId,
      type: tracking.tool === "highlight" ? "circle" : tracking.tool,
      source: tracking.tool === "distance" ? "spatial" : "tracking",
      startMs: tracking.prompt?.startMs ?? range.startMs,
      endMs: tracking.prompt?.endMs ?? range.endMs,
      bindings: selection.trackIds.map((trackId, index) => ({
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
        updateState((current) => patchTrackingState(current, {
          error: error.message || "Dynamic graphic metadata could not be saved.",
        }));
        return false;
      }
    }
    updateState((current) => {
      const liveItem = selectedTrackingItem(current);
      return liveItem ? patchTrackingState(replacePresentationItem(current, liveItem.id, {
        dynamicGraphics: [...(liveItem.dynamicGraphics || []), graphic],
      }), { error: "" }) : current;
    });
    return true;
  }

  return { add };
}
