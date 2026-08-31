import {
  patchTrackingState,
  selectedTrackingItem,
  trackingItemRange,
} from "./trackingControllerHelpers.js";

const actionName = "ground-truth-checkpoint-select";

export function createTrackingGroundTruthCheckpointController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});

  function handleAction(action = "", element = null) {
    if (action !== actionName) return false;
    const state = getState();
    const item = selectedTrackingItem(state);
    const trackId = String(element?.dataset?.videoAnalysisGroundTruthTrackId || "");
    const track = (item?.objectTracks || []).find((entry) => (
      entry.id === trackId
      && entry.status !== "archived"
      && entry.metadata?.preannotationReviewPreview !== true
    ));
    if (!item || !track) return false;
    const range = trackingItemRange(item);
    const requestedAtMs = Math.round(Number(element?.dataset?.videoAnalysisGroundTruthAtMs));
    const atMs = Number.isFinite(requestedAtMs)
      ? Math.max(range.startMs, Math.min(range.endMs, requestedAtMs))
      : range.startMs;
    updateState((current) => patchTrackingState(current, { selectedTrackIds: [track.id], error: "" }));
    options.seekToMatchMs?.(atMs);
    return true;
  }

  return { handleAction };
}
