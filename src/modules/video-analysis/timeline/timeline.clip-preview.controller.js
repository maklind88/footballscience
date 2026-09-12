import { activeMediaReference, activeVideoTimeFromMatchMs, matchTimeFromActiveVideoMs } from "../services/mediaProductionService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { playerHeaderIcon } from "../components/playerHeaderIcons.js";
import { createClipShuttle } from "./timeline.clip-shuttle.js";

export function clipPreviewRange(state, startMs, endMs, durationMs = 0) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) return null;
  const start = activeVideoTimeFromMatchMs(state, startMs);
  const end = activeVideoTimeFromMatchMs(state, endMs);
  // Reject clipped offsets/windows instead of showing a different moment in the match.
  if (end <= start || (durationMs > 0 && end > durationMs + 2)) return null;
  if (Math.abs(matchTimeFromActiveVideoMs(state, start) - startMs) > 2
    || Math.abs(matchTimeFromActiveVideoMs(state, end) - endMs) > 2) return null;
  return { start, end, duration: endMs - startMs };
}

export function createClipPreview({ dialog, getState, getRange, subscribe, reconnect, selectFile, onContextChange }) {
  const video = dialog.querySelector("[data-video-analysis-clip-preview]");
  const play = dialog.querySelector("[data-clip-preview-play]");
  const seek = dialog.querySelector("[data-clip-preview-seek]");
  const output = dialog.querySelector("[data-clip-preview-time]");
  const empty = dialog.querySelector("[data-clip-preview-empty]");
  const status = dialog.querySelector("[data-clip-preview-status]");
  const connect = dialog.querySelector("[data-clip-preview-reconnect]");
  const input = dialog.querySelector("[data-clip-preview-file]");
  const win = dialog.ownerDocument.defaultView;
  const events = new win.AbortController();
  const initial = getState();
  const identity = state => `${state.match?.id || ""}:${state.video?.id || ""}`;
  const originalIdentity = identity(initial);
  let source = "";
  let range = null;
  let frame = null;
  let disposed = false;
  let locked = false;
  let mediaError = false;
  let shuttle = null;
  const ready = () => Boolean(source && range && video.readyState >= 1 && !mediaError && !locked && !disposed);

  function cancelFrame() {
    if (frame != null) win.cancelAnimationFrame(frame);
    frame = null;
  }

  function updateTransport() {
    if (disposed) return;
    play.disabled = !ready();
    seek.disabled = !ready();
    const paused = video.paused && !shuttle?.isActive();
    const label = paused ? "Play clip" : "Pause clip";
    play.setAttribute("aria-label", label);
    play.title = label;
    if (play.dataset.icon !== label) {
      play.innerHTML = playerHeaderIcon(paused ? "play" : "pause");
      play.dataset.icon = label;
    }
    const draft = getRange();
    const duration = Math.max(0, draft.endMs - draft.startMs) || 0;
    const elapsed = range ? Math.max(0, Math.min(duration, (video.currentTime * 1000 - range.start) / (range.end - range.start) * duration)) : 0;
    seek.max = String(duration);
    seek.value = String(Math.round(elapsed));
    seek.style.setProperty("--clip-preview-progress", `${duration ? elapsed / duration * 100 : 0}%`);
    seek.setAttribute("aria-valuetext", `${formatVideoTime(elapsed)} / ${formatVideoTime(duration)}`);
    output.textContent = `${formatVideoTime(elapsed)} / ${formatVideoTime(duration)}`;
  }

  function stop() {
    shuttle?.cancel();
    video.pause();
    cancelFrame();
    updateTransport();
  }

  function seekTo(ms) {
    if (!range || video.readyState < 1) return;
    video.currentTime = Math.max(range.start, Math.min(range.end, ms)) / 1000;
    updateTransport();
  }

  function enforceRange() {
    if (disposed || !range) return;
    if (video.currentTime * 1000 >= range.end) { stop(); seekTo(range.end); }
    else if (video.currentTime * 1000 < range.start - 2) seekTo(range.start);
    updateTransport();
  }

  function tick() {
    frame = null;
    enforceRange();
    if (!disposed && !video.paused) frame = win.requestAnimationFrame(tick);
  }

  async function start() {
    if (disposed || locked || !source || !range || video.readyState < 1 || mediaError) return;
    if (video.currentTime * 1000 >= range.end - 2 || video.currentTime * 1000 < range.start) seekTo(range.start);
    try { await video.play(); } catch { /* A blocked autoplay leaves the explicit Play control available. */ }
    if (disposed || locked) video.pause();
  }

  function updateRange({ rewind = false } = {}) {
    if (disposed) return;
    const state = getState();
    const draft = getRange();
    const actualDuration = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
    const declaredDuration = activeMediaReference(state)?.durationMs || 0;
    const nextRange = clipPreviewRange(state, draft.startMs, draft.endMs, actualDuration || declaredDuration);
    if (nextRange?.start !== range?.start || nextRange?.end !== range?.end) shuttle?.cancel();
    range = nextRange;
    empty.hidden = Boolean(source && range && !mediaError);
    status.textContent = mediaError ? "Video unavailable" : source && !range ? "Clip outside available video" : "";
    connect.hidden = Boolean(source && !mediaError);
    if (!range) stop();
    else if (rewind || video.currentTime * 1000 < range.start || video.currentTime * 1000 > range.end) seekTo(range.start);
    updateTransport();
  }

  function refresh() {
    if (disposed) return;
    const state = getState();
    if (identity(state) !== originalIdentity) { stop(); onContextChange(); return; }
    const next = state.status === "saving-source" ? "" : String(activeMediaReference(state)?.objectUrl || "");
    if (next !== source) {
      stop();
      source = next;
      mediaError = false;
      if (source) video.src = source;
      else video.removeAttribute("src");
      video.load();
      updateRange({ rewind: true });
    } else updateRange();
  }

  const surface = dialog.querySelector(".video-analysis-clip-editor__media");
  shuttle = createClipShuttle({ surface, video, getRange: () => range, isReady: ready, seekTo, onChange: updateTransport, signal: events.signal });
  function toggle() {
    if (shuttle.isActive() || !video.paused) stop();
    else void start();
  }
  const listen = (element, type, callback) => element.addEventListener(type, callback, { signal: events.signal });
  listen(video, "loadedmetadata", () => { updateRange({ rewind: true }); void start(); });
  listen(video, "play", () => { cancelFrame(); tick(); });
  listen(video, "pause", () => { cancelFrame(); updateTransport(); });
  listen(video, "ended", () => { cancelFrame(); updateTransport(); });
  listen(video, "timeupdate", enforceRange);
  listen(video, "seeking", enforceRange);
  listen(video, "error", () => { mediaError = true; stop(); updateRange(); });
  listen(play, "click", toggle);
  listen(surface, "keydown", event => {
    if (event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey
      || event.target.closest("button, input, textarea, select, [contenteditable=true]")) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
  listen(seek, "input", () => {
    if (!range || locked) return;
    const position = Number(seek.value);
    stop();
    seekTo(range.start + position / range.duration * (range.end - range.start));
  });
  listen(connect, "click", async () => {
    if (locked) return;
    try { await reconnect(input); }
    catch { if (!disposed) status.textContent = "Could not reconnect video"; }
  });
  listen(input, "change", async () => {
    if (!input.files?.[0] || locked) return;
    try { await selectFile(input.files[0]); }
    catch { if (!disposed) status.textContent = "Could not reconnect video"; }
  });
  const unsubscribe = subscribe(refresh);
  refresh();

  return {
    updateRange,
    setBusy(value) { locked = value; if (value) stop(); updateTransport(); },
    dispose() {
      disposed = true;
      shuttle.cancel();
      unsubscribe();
      events.abort();
      cancelFrame();
      video.pause();
      video.removeAttribute("src");
      video.load();
      // The main player owns the shared object URL; closing a preview must never revoke it.
    },
  };
}
