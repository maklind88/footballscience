const DEFAULT_CONTEXT_LEAD_MS = 1500;

export function createTrackingContextReplayController(options = {}) {
  const requestedLeadMs = Number(options.contextLeadMs);
  const contextLeadMs = Number.isFinite(requestedLeadMs)
    ? Math.max(0, requestedLeadMs)
    : DEFAULT_CONTEXT_LEAD_MS;
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

  function start(range = null) {
    if (!range) return false;
    const startMs = Math.max(0, Number(range.startMs) || 0);
    const endMs = Math.max(startMs, Number(range.endMs) || startMs);
    const requestedMinStartMs = Number(range.minStartMs);
    const minStartMs = Number.isFinite(requestedMinStartMs)
      ? Math.max(0, Math.min(startMs, requestedMinStartMs))
      : 0;
    const requestedMaxEndMs = Number(range.maxEndMs);
    const maxEndMs = Number.isFinite(requestedMaxEndMs)
      ? Math.max(endMs, requestedMaxEndMs)
      : Number.POSITIVE_INFINITY;
    stop();
    options.seekToMatchMs?.(Math.max(minStartMs, startMs - contextLeadMs));
    const video = options.getVideoElement?.();
    if (!video || typeof video.play !== "function" || typeof video.addEventListener !== "function"
      || typeof options.getCurrentMatchMs !== "function") return true;
    const preview = {
      video,
      endMs: Math.min(maxEndMs, endMs + contextLeadMs),
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
