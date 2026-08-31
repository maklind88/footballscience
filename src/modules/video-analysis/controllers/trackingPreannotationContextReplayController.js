import { TRACKING_PREANNOTATION_CONTEXT_LEAD_MS } from "./trackingPreannotationReviewControllerHelpers.js";

export function createTrackingPreannotationContextReplayController(options = {}) {
  let active = null;

  function stop(stopOptions = {}) {
    const preview = active;
    active = null;
    if (!preview) return false;
    preview.video.removeEventListener?.("timeupdate", preview.onTimeUpdate);
    preview.video.removeEventListener?.("ended", preview.onEnded);
    if (stopOptions.pause !== false && preview.video.paused !== true) preview.video.pause?.();
    return true;
  }

  function start(track = null) {
    if (!track) return false;
    const startMs = Math.max(0, Number(track.startMs) || 0);
    const endMs = Math.max(startMs, Number(track.endMs) || startMs);
    stop();
    options.seekToMatchMs?.(Math.max(0, startMs - TRACKING_PREANNOTATION_CONTEXT_LEAD_MS));
    const video = options.getVideoElement?.();
    if (!video || typeof video.play !== "function" || typeof video.addEventListener !== "function"
      || typeof options.getCurrentMatchMs !== "function") return true;
    const preview = {
      video,
      endMs: endMs + TRACKING_PREANNOTATION_CONTEXT_LEAD_MS,
      onTimeUpdate: null,
      onEnded: null,
    };
    preview.onTimeUpdate = () => {
      const atMs = Number(options.getCurrentMatchMs());
      if (active === preview && Number.isFinite(atMs) && atMs >= preview.endMs) stop();
    };
    preview.onEnded = () => {
      if (active === preview) stop({ pause: false });
    };
    active = preview;
    video.addEventListener("timeupdate", preview.onTimeUpdate);
    video.addEventListener("ended", preview.onEnded);
    try {
      const playback = video.play();
      playback?.catch?.(() => {
        if (active === preview) stop({ pause: false });
      });
    } catch {
      stop({ pause: false });
    }
    return true;
  }

  return { start, stop };
}
