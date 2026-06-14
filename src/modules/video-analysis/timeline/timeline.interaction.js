import { formatVideoTime, getVideoCurrentMs, seekVideoToMs } from "../services/videoPlaybackService.js";
import { getTimelineDurationMs, timelineMsFromClientX } from "./timeline.service.js";

export function createTimelineScrubController(options = {}) {
  let session = null;
  let pendingMoveMs = null;
  let frameId = 0;

  function root() {
    return options.getRoot?.() || null;
  }

  function state() {
    return options.getState?.() || {};
  }

  function win() {
    return options.getWindow?.() || globalThis.window;
  }

  function clearPendingFrame() {
    const targetWindow = win();
    if (frameId && targetWindow?.cancelAnimationFrame) {
      targetWindow.cancelAnimationFrame(frameId);
    }
    frameId = 0;
    pendingMoveMs = null;
  }

  function lockScrollPosition() {
    if (!session?.scrollContainer) return;
    session.scrollContainer.scrollLeft = session.scrollLeft;
  }

  function syncScrubTimes(playheadMs = 0, durationMs = 1, visible = false) {
    const targetRoot = root();
    if (!targetRoot) return;
    const safeDuration = Math.max(1, Number(durationMs || 1));
    const safeMs = Math.min(safeDuration, Math.max(0, Math.round(Number(playheadMs || 0))));
    const left = `${Math.min(100, Math.max(0, (safeMs / safeDuration) * 100))}%`;
    targetRoot.querySelectorAll("[data-video-analysis-timeline-scrub-time]").forEach((badge) => {
      badge.style.left = left;
      badge.textContent = formatVideoTime(safeMs);
      badge.setAttribute("aria-hidden", visible ? "false" : "true");
    });
  }

  function syncPlayheads(playheadMs = 0, durationMs = 1) {
    const targetRoot = root();
    if (!targetRoot) return;
    const safeDuration = Math.max(1, Number(durationMs || 1));
    const safeMs = Math.min(safeDuration, Math.max(0, Math.round(Number(playheadMs || 0))));
    const left = `${Math.min(100, Math.max(0, (safeMs / safeDuration) * 100))}%`;
    targetRoot.querySelectorAll(".video-analysis-playhead").forEach((playhead) => {
      playhead.style.left = left;
    });
    syncScrubTimes(safeMs, safeDuration, Boolean(session));
  }

  function seekToMs(ms = 0, { commit = false } = {}) {
    lockScrollPosition();
    const durationMs = getTimelineDurationMs(state());
    const safeMs = Math.min(durationMs, Math.max(0, Math.round(Number(ms || 0))));
    seekVideoToMs(options.getVideoElement?.(), safeMs);
    syncPlayheads(safeMs, durationMs);
    if (commit) {
      options.updateState?.((current) => ({
        ...current,
        timeline: { ...(current.timeline || {}), playheadMs: safeMs },
      }));
    }
    return safeMs;
  }

  function msFromEvent(event = {}) {
    if (!session) return 0;
    return timelineMsFromClientX(event.clientX, session.rect, session.durationMs);
  }

  function applyScrub(event = {}, { commit = false, immediate = false } = {}) {
    if (!session) return;
    const nextMs = msFromEvent(event);
    const targetWindow = win();
    if (commit || immediate || !targetWindow?.requestAnimationFrame) {
      clearPendingFrame();
      seekToMs(nextMs, { commit });
      return;
    }
    pendingMoveMs = nextMs;
    if (frameId) return;
    frameId = targetWindow.requestAnimationFrame(() => {
      frameId = 0;
      const scrubMs = pendingMoveMs;
      pendingMoveMs = null;
      lockScrollPosition();
      seekToMs(scrubMs);
    });
  }

  function handlePointerMove(event = {}) {
    if (!session) return;
    event.preventDefault?.();
    lockScrollPosition();
    applyScrub(event);
  }

  function endScrub(event = {}) {
    if (!session) return;
    applyScrub(event, { commit: true });
    const targetWindow = win();
    targetWindow?.removeEventListener?.("pointermove", handlePointerMove, session.listenerOptions);
    targetWindow?.removeEventListener?.("pointerup", endScrub, session.listenerOptions);
    targetWindow?.removeEventListener?.("pointercancel", endScrub, session.listenerOptions);
    session.scrollContainer?.classList?.remove("is-scrubbing");
    lockScrollPosition();
    syncScrubTimes(getVideoCurrentMs(options.getVideoElement?.()), getTimelineDurationMs(state()), false);
    clearPendingFrame();
    session = null;
  }

  function handlePointerDown(event = {}) {
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (!target?.closest || (event.button && event.button !== 0)) return false;
    if (target.closest("[data-video-analysis-seek]")) return false;

    const scrubHandle = target.closest("[data-video-analysis-timeline-scrub]");
    const track = target.closest("[data-video-analysis-timeline-track]");
    const ruler = target.closest("[data-video-analysis-timeline-ruler]");
    const module = target.closest("[data-video-analysis-timeline-module]");
    const surface = module?.querySelector("[data-video-analysis-timeline-scrub-surface]")
      || scrubHandle?.closest("[data-video-analysis-timeline-scrub-surface]")
      || track
      || ruler;
    if (!surface) return false;

    const rect = surface.getBoundingClientRect?.();
    if (!rect?.width) return false;
    const insideScrubSurface = Number(event.clientX || 0) >= rect.left
      && Number(event.clientX || 0) <= rect.right
      && Number(event.clientY || 0) >= rect.top
      && Number(event.clientY || 0) <= rect.bottom;
    if (!scrubHandle && !track && !ruler && !insideScrubSurface) return false;

    const durationMs = Math.max(1, Number(
      surface.dataset.videoAnalysisTimelineDurationMs
      || surface.closest("[data-video-analysis-timeline-module]")?.dataset.videoAnalysisTimelineDurationMs
      || getTimelineDurationMs(state())
    ));
    const scrollContainer = surface.closest(".video-analysis-timeline-scroll");
    const listenerOptions = { passive: false };
    session = {
      durationMs,
      listenerOptions,
      rect,
      scrollContainer,
      scrollLeft: Number(scrollContainer?.scrollLeft || 0),
    };
    scrollContainer?.classList?.add("is-scrubbing");

    const targetWindow = win();
    event.preventDefault?.();
    target.blur?.();
    targetWindow?.addEventListener?.("pointermove", handlePointerMove, listenerOptions);
    targetWindow?.addEventListener?.("pointerup", endScrub, listenerOptions);
    targetWindow?.addEventListener?.("pointercancel", endScrub, listenerOptions);
    target.setPointerCapture?.(event.pointerId);
    lockScrollPosition();
    applyScrub(event, { immediate: true });
    return true;
  }

  function handleVideoTimeUpdate(videoElement) {
    syncPlayheads(getVideoCurrentMs(videoElement), getTimelineDurationMs(state()));
  }

  return {
    handlePointerDown,
    handleVideoTimeUpdate,
    seekToMs,
    syncPlayheads,
  };
}
