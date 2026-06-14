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

  function syncPlayheads(playheadMs = 0, durationMs = 1) {
    const targetRoot = root();
    if (!targetRoot) return;
    const safeDuration = Math.max(1, Number(durationMs || 1));
    const safeMs = Math.min(safeDuration, Math.max(0, Math.round(Number(playheadMs || 0))));
    const left = `${Math.min(100, Math.max(0, (safeMs / safeDuration) * 100))}%`;
    targetRoot.querySelectorAll(".video-analysis-playhead").forEach((playhead) => {
      playhead.style.left = left;
      playhead.setAttribute("aria-valuenow", String(Math.round(safeMs / 1000)));
      playhead.setAttribute("aria-valuetext", formatVideoTime(safeMs));
    });
  }

  function seekToMs(ms = 0, { commit = false } = {}) {
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
      seekToMs(scrubMs);
    });
  }

  function handlePointerMove(event = {}) {
    if (!session) return;
    event.preventDefault?.();
    applyScrub(event);
  }

  function endScrub(event = {}) {
    if (!session) return;
    applyScrub(event, { commit: true });
    const targetWindow = win();
    targetWindow?.removeEventListener?.("pointermove", handlePointerMove);
    targetWindow?.removeEventListener?.("pointerup", endScrub);
    targetWindow?.removeEventListener?.("pointercancel", endScrub);
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
    if (!scrubHandle && !track && !ruler) return false;

    const module = target.closest("[data-video-analysis-timeline-module]");
    const surface = module?.querySelector("[data-video-analysis-timeline-scrub-surface]")
      || scrubHandle?.closest("[data-video-analysis-timeline-scrub-surface]")
      || track
      || ruler;
    if (!surface) return false;

    const rect = surface.getBoundingClientRect?.();
    if (!rect?.width) return false;

    const durationMs = Math.max(1, Number(
      surface.dataset.videoAnalysisTimelineDurationMs
      || surface.closest("[data-video-analysis-timeline-module]")?.dataset.videoAnalysisTimelineDurationMs
      || getTimelineDurationMs(state())
    ));
    session = { durationMs, rect };

    const targetWindow = win();
    targetWindow?.addEventListener?.("pointermove", handlePointerMove);
    targetWindow?.addEventListener?.("pointerup", endScrub);
    targetWindow?.addEventListener?.("pointercancel", endScrub);
    target.setPointerCapture?.(event.pointerId);

    event.preventDefault?.();
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
