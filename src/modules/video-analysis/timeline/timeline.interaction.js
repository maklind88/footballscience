import { formatVideoTime, getVideoCurrentMs, seekVideoToMs } from "../services/videoPlaybackService.js";
import { getTimelineDurationMs, normalizeTimelineZoom, timelineMsFromClientX } from "./timeline.service.js";

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
    if (!session?.scrollContainer || session.type === "pan") return;
    session.scrollContainer.scrollLeft = session.scrollLeft;
  }

  function elementTimelineWindow(element, fallbackDurationMs = 1) {
    const module = element?.closest?.("[data-video-analysis-timeline-module]");
    const startMs = Math.max(0, Number(
      element?.dataset?.videoAnalysisTimelineWindowStartMs
      || module?.dataset?.videoAnalysisTimelineWindowStartMs
      || 0
    ));
    const durationMs = Math.max(1, Number(
      element?.dataset?.videoAnalysisTimelineDurationMs
      || module?.dataset?.videoAnalysisTimelineWindowDurationMs
      || fallbackDurationMs
      || 1
    ));
    return { startMs, durationMs };
  }

  function timelineLeftForElement(element, playheadMs = 0, fallbackDurationMs = 1) {
    const timelineWindow = elementTimelineWindow(element, fallbackDurationMs);
    const relativeMs = Number(playheadMs || 0) - timelineWindow.startMs;
    return `${Math.min(100, Math.max(0, (relativeMs / timelineWindow.durationMs) * 100))}%`;
  }

  function syncScrubTimes(playheadMs = 0, durationMs = 1, visible = false) {
    const targetRoot = root();
    if (!targetRoot) return;
    const safeDuration = Math.max(1, Number(durationMs || 1));
    const safeMs = Math.min(safeDuration, Math.max(0, Math.round(Number(playheadMs || 0))));
    targetRoot.querySelectorAll("[data-video-analysis-timeline-scrub-time]").forEach((badge) => {
      badge.style.left = timelineLeftForElement(badge, safeMs, safeDuration);
      badge.textContent = formatVideoTime(safeMs);
      badge.setAttribute("aria-hidden", visible ? "false" : "true");
    });
  }

  function syncPlayheads(playheadMs = 0, durationMs = 1) {
    const targetRoot = root();
    if (!targetRoot) return;
    const safeDuration = Math.max(1, Number(durationMs || 1));
    const safeMs = Math.min(safeDuration, Math.max(0, Math.round(Number(playheadMs || 0))));
    targetRoot.querySelectorAll(".video-analysis-playhead").forEach((playhead) => {
      playhead.style.left = timelineLeftForElement(playhead, safeMs, safeDuration);
    });
    targetRoot.querySelectorAll("[data-video-analysis-player-current-time]").forEach((time) => {
      time.textContent = formatVideoTime(safeMs);
    });
    targetRoot.querySelectorAll("[data-video-analysis-player-duration-time]").forEach((time) => {
      time.textContent = `/ ${formatVideoTime(safeDuration)}`;
    });
    targetRoot.querySelectorAll("[data-video-analysis-player-meta-duration]").forEach((time) => {
      time.textContent = formatVideoTime(safeDuration);
    });
    syncScrubTimes(safeMs, safeDuration, Boolean(session && session.type !== "pan"));
  }

  function videoTimelineMs(videoElement) {
    const rawMs = getVideoCurrentMs(videoElement);
    const converted = options.videoToTimelineMs?.(rawMs, state());
    return Number.isFinite(Number(converted)) ? Math.max(0, Math.round(Number(converted))) : rawMs;
  }

  function timelineVideoMs(timelineMs = 0) {
    const converted = options.timelineToVideoMs?.(timelineMs, state());
    return Number.isFinite(Number(converted)) ? Math.max(0, Math.round(Number(converted))) : timelineMs;
  }

  function seekToMs(ms = 0, { commit = false } = {}) {
    lockScrollPosition();
    const durationMs = getTimelineDurationMs(state());
    const safeMs = Math.min(durationMs, Math.max(0, Math.round(Number(ms || 0))));
    seekVideoToMs(options.getVideoElement?.(), timelineVideoMs(safeMs));
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
    return timelineMsFromClientX(event.clientX, session.rect, session.durationMs, session.startMs);
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
    if (session.type === "pan") {
      const nextScrollLeft = session.scrollLeft - (Number(event.clientX || 0) - session.startX);
      session.scrollContainer.scrollLeft = Math.max(0, Math.min(session.maxScrollLeft, nextScrollLeft));
      return true;
    }
    lockScrollPosition();
    applyScrub(event);
    return true;
  }

  function endScrub(event = {}) {
    if (!session) return;
    const wasPan = session.type === "pan";
    if (!wasPan) applyScrub(event, { commit: true });
    const targetWindow = win();
    targetWindow?.removeEventListener?.("pointermove", handlePointerMove, session.listenerOptions);
    targetWindow?.removeEventListener?.("pointerup", endScrub, session.listenerOptions);
    targetWindow?.removeEventListener?.("pointercancel", endScrub, session.listenerOptions);
    session.scrollContainer?.classList?.remove("is-scrubbing");
    session.scrollContainer?.classList?.remove("is-panning");
    if (!wasPan) {
      lockScrollPosition();
      syncScrubTimes(videoTimelineMs(options.getVideoElement?.()), getTimelineDurationMs(state()), false);
    }
    clearPendingFrame();
    session = null;
    return true;
  }

  function isPanBlocked(target) {
    return Boolean(target.closest?.([
      "button",
      "a",
      "input",
      "select",
      "textarea",
      "[data-video-analysis-seek]",
      "[data-video-analysis-timeline-category]",
      "[data-video-analysis-timeline-ruler]",
      "[data-video-analysis-timeline-scrub]",
      "[data-video-analysis-timeline-scrub-surface]",
      "[data-video-analysis-timeline-track]",
    ].join(",")));
  }

  function startPan(event = {}, target) {
    const scrollContainer = target.closest?.("[data-video-analysis-timeline-pan]");
    if (!scrollContainer || isPanBlocked(target)) return false;
    const maxScrollLeft = Math.max(0, Number(scrollContainer.scrollWidth || 0) - Number(scrollContainer.clientWidth || 0));
    if (!maxScrollLeft) return false;
    const listenerOptions = { passive: false };
    session = {
      type: "pan",
      listenerOptions,
      scrollContainer,
      scrollLeft: Number(scrollContainer.scrollLeft || 0),
      maxScrollLeft,
      startX: Number(event.clientX || 0),
    };
    const targetWindow = win();
    event.preventDefault?.();
    scrollContainer.classList?.add("is-panning");
    targetWindow?.addEventListener?.("pointermove", handlePointerMove, listenerOptions);
    targetWindow?.addEventListener?.("pointerup", endScrub, listenerOptions);
    targetWindow?.addEventListener?.("pointercancel", endScrub, listenerOptions);
    target.setPointerCapture?.(event.pointerId);
    return true;
  }

  function handlePointerDown(event = {}) {
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (!target?.closest || (event.button && event.button !== 0)) return false;
    if (target.closest("[data-video-analysis-seek]")) return false;

    const scrubHandle = target.closest("[data-video-analysis-timeline-scrub]");
    const track = target.closest("[data-video-analysis-timeline-track]");
    const ruler = target.closest("[data-video-analysis-timeline-ruler]");
    const module = target.closest("[data-video-analysis-timeline-module]");
    if (!track && !ruler && !scrubHandle && startPan(event, target)) return true;
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
      || surface.closest("[data-video-analysis-timeline-module]")?.dataset.videoAnalysisTimelineWindowDurationMs
      || getTimelineDurationMs(state())
    ));
    const startMs = Math.max(0, Number(
      surface.dataset.videoAnalysisTimelineWindowStartMs
      || surface.closest("[data-video-analysis-timeline-module]")?.dataset.videoAnalysisTimelineWindowStartMs
      || 0
    ));
    const scrollContainer = surface.closest(".video-analysis-timeline-scroll");
    const listenerOptions = { passive: false };
    session = {
      type: "scrub",
      durationMs,
      startMs,
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
    syncPlayheads(videoTimelineMs(videoElement), getTimelineDurationMs(state()));
  }

  function zoomTimeline(event = {}, scrollContainer) {
    if (!scrollContainer) return false;
    const currentState = state();
    const currentZoom = normalizeTimelineZoom(currentState.timeline?.zoom || 1);
    const deltaY = Number(event.deltaY || 0);
    if (!deltaY) return false;
    const direction = deltaY < 0 ? 1 : -1;
    const step = event.ctrlKey || event.metaKey ? 0.32 : 0.2;
    const nextZoom = normalizeTimelineZoom(currentZoom + (direction * step));
    if (nextZoom === currentZoom) return false;

    const rect = scrollContainer.getBoundingClientRect?.();
    const pointerX = rect?.width
      ? Math.min(rect.width, Math.max(0, Number(event.clientX || rect.left) - rect.left))
      : Number(scrollContainer.clientWidth || 0) / 2;
    const canvas = scrollContainer.querySelector?.(".video-analysis-timeline-canvas");
    const oldCanvasWidth = Math.max(
      1,
      Number(canvas?.scrollWidth || canvas?.getBoundingClientRect?.().width || scrollContainer.scrollWidth || scrollContainer.clientWidth || 1)
    );
    const timelineRatioAtPointer = Math.min(
      1,
      Math.max(0, (Number(scrollContainer.scrollLeft || 0) + pointerX) / oldCanvasWidth)
    );

    options.updateState?.((current) => ({
      ...current,
      timeline: { ...(current.timeline || {}), zoom: nextZoom },
    }));

    win()?.requestAnimationFrame?.(() => {
      const nextCanvas = scrollContainer.querySelector?.(".video-analysis-timeline-canvas");
      const nextCanvasWidth = Math.max(
        1,
        Number(nextCanvas?.scrollWidth || nextCanvas?.getBoundingClientRect?.().width || scrollContainer.scrollWidth || scrollContainer.clientWidth || 1)
      );
      const maxScrollLeft = Math.max(0, Number(scrollContainer.scrollWidth || 0) - Number(scrollContainer.clientWidth || 0));
      scrollContainer.scrollLeft = Math.max(0, Math.min(maxScrollLeft, Math.round((nextCanvasWidth * timelineRatioAtPointer) - pointerX)));
    });

    event.preventDefault?.();
    return true;
  }

  function handleWheel(event = {}) {
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    const scrollContainer = target?.closest?.("[data-video-analysis-timeline-pan]");
    if (!scrollContainer) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return zoomTimeline(event, scrollContainer);
    }
    const maxScrollLeft = Math.max(0, Number(scrollContainer.scrollWidth || 0) - Number(scrollContainer.clientWidth || 0));
    if (!maxScrollLeft) return false;
    const deltaX = Number(event.deltaX || 0);
    const deltaY = Number(event.deltaY || 0);
    const horizontalDelta = Math.abs(deltaX) > 0 ? deltaX : event.shiftKey ? deltaY : 0;
    if (!horizontalDelta) return false;
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, Number(scrollContainer.scrollLeft || 0) + horizontalDelta));
    if (nextScrollLeft === Number(scrollContainer.scrollLeft || 0)) return false;
    scrollContainer.scrollLeft = nextScrollLeft;
    event.preventDefault?.();
    return true;
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handleWheel,
    handleVideoTimeUpdate,
    seekToMs,
    syncPlayheads,
  };
}
