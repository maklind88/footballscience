import {
  activeMediaAngle,
  activeMediaReference,
  mediaAnglesForState,
} from "./mediaProductionService.js";

export function updateActiveMediaDurationState(state = {}, durationMs = 0) {
  const safeDurationMs = Math.round(Number(durationMs || 0));
  if (!Number.isFinite(safeDurationMs) || safeDurationMs <= 0) return state;
  const activeAngle = activeMediaAngle(state);
  const activeReference = activeMediaReference(state);
  if (!activeReference || Math.round(Number(activeReference.durationMs || 0)) === safeDurationMs) return state;

  if (!activeAngle || activeAngle.primary) {
    return {
      ...state,
      videoRef: { ...(state.videoRef || {}), durationMs: safeDurationMs },
    };
  }

  const angles = mediaAnglesForState(state).map((angle) => (
    angle.id === activeAngle.id ? { ...angle, durationMs: safeDurationMs } : angle
  ));
  const currentReference = state.mediaProduction?.angleRefs?.[activeAngle.id];
  return {
    ...state,
    mediaProduction: {
      ...(state.mediaProduction || {}),
      angles,
      angleRefs: currentReference ? {
        ...(state.mediaProduction?.angleRefs || {}),
        [activeAngle.id]: { ...currentReference, durationMs: safeDurationMs },
      } : state.mediaProduction?.angleRefs || {},
    },
  };
}
