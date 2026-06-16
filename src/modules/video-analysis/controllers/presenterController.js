import { presentationQueue } from "../services/presentationService.js";
import { seekVideoToMs } from "../services/videoPlaybackService.js";

export function presenterStepState(state = {}, direction = 0) {
  const queue = presentationQueue(state.presentation?.current);
  if (!queue.length) return state;
  const selectedIndex = queue.findIndex((item) => item.id === state.presentation?.selectedItemId);
  const index = selectedIndex >= 0 ? selectedIndex : 0;
  const nextIndex = Math.max(0, Math.min(queue.length - 1, index + Number(direction || 0)));
  const next = queue[nextIndex] || queue[0];
  return {
    ...state,
    presentation: {
      ...(state.presentation || {}),
      presenterIndex: nextIndex,
      selectedItemId: next.id || state.presentation?.selectedItemId || "",
      selectedClipId: next.clipId || state.presentation?.selectedClipId || "",
      activeSectionId: next.sectionId || state.presentation?.activeSectionId || "",
    },
  };
}

export function createPresenterController(options = {}) {
  const getRoot = options.getRoot || (() => null);
  const getVideoElement = options.getVideoElement || (() => null);
  const updateState = options.updateState || (() => {});

  function step(direction = 0) {
    let nextItem = null;
    updateState((state) => {
      const nextState = presenterStepState(state, direction);
      const queue = presentationQueue(nextState.presentation?.current);
      nextItem = queue.find((item) => item.id === nextState.presentation?.selectedItemId) || queue[0] || null;
      return nextState;
    });
    if (nextItem) {
      const clip = nextItem.clip || {};
      seekVideoToMs(getVideoElement(), nextItem.startMs ?? clip.startMs ?? clip.start_ms ?? 0);
    }
    return true;
  }

  function enterFullscreen() {
    const element = getRoot()?.querySelector(".video-analysis-presenter-mode");
    element?.requestFullscreen?.().catch(() => {});
    return true;
  }

  function exitToBuilder() {
    updateState((state) => ({
      ...state,
      presentation: { ...(state.presentation || {}), mode: "builder" },
    }));
    return true;
  }

  function toggleFreeze() {
    const video = getVideoElement();
    if (video && typeof video.pause === "function") video.pause();
    updateState((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        presenterFrozen: !state.presentation?.presenterFrozen,
      },
    }));
    return true;
  }

  function setMode(mode = "presenter") {
    updateState((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        mode,
      },
    }));
    return true;
  }

  return {
    enterFullscreen,
    exitToBuilder,
    setMode,
    step,
    toggleFreeze,
  };
}
