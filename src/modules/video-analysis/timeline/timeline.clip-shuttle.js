import { VIDEO_SHUTTLE_IDLE_MS, VIDEO_SHUTTLE_MAX_FRAME_MS,
  videoShuttleHorizontalDelta, videoShuttleHasHorizontalIntent, videoShuttleSpeedFromDelta } from "../services/videoShuttleGesture.js";

export function createClipShuttle({ surface, video, getRange, isReady, seekTo, onChange, signal }) {
  const win = surface.ownerDocument.defaultView;
  let session = null;
  let frame = 0;
  let timer = 0;
  let touch = null;

  function cancel({ resume = false } = {}) {
    if (timer) win.clearTimeout(timer);
    if (frame) win.cancelAnimationFrame(frame);
    timer = frame = 0;
    surface.classList.remove("is-clip-shuttling");
    const previous = session;
    session = null;
    if (!previous) return;
    video.pause();
    video.playbackRate = previous.rate;
    video.muted = previous.muted;
    const range = getRange();
    const inside = range && video.currentTime * 1000 > range.start + 2 && video.currentTime * 1000 < range.end - 2;
    if (resume && !previous.paused && inside && isReady()) video.play().catch(() => {});
    onChange();
  }

  function tick(timestamp) {
    frame = 0;
    if (!session) return;
    const range = getRange();
    if (!range || !isReady()) { cancel(); return; }
    if (session.step) {
      const elapsed = session.timestamp ? Math.min(VIDEO_SHUTTLE_MAX_FRAME_MS, Math.max(8, timestamp - session.timestamp)) : 16;
      session.timestamp = timestamp;
      seekTo(video.currentTime * 1000 + session.direction * session.speed * elapsed);
    }
    const time = video.currentTime * 1000;
    if ((session.direction < 0 && time <= range.start) || (session.direction > 0 && time >= range.end)) {
      seekTo(session.direction < 0 ? range.start : range.end);
      cancel();
      return;
    }
    onChange();
    frame = win.requestAnimationFrame(tick);
  }

  function activate(delta) {
    if (!isReady()) return;
    session ||= { paused: video.paused || video.ended, rate: video.playbackRate, muted: video.muted, token: 0 };
    const active = session;
    const token = ++active.token;
    active.direction = Math.sign(delta);
    active.speed = videoShuttleSpeedFromDelta(delta);
    active.timestamp = 0;
    active.step = delta < 0;
    video.muted = true;
    surface.classList.add("is-clip-shuttling");
    if (active.step) {
      video.pause();
      video.playbackRate = active.rate;
    } else {
      video.playbackRate = active.speed;
      video.play().catch(() => {
        if (session !== active || active.token !== token) return;
        active.step = true;
        video.pause();
      });
    }
    if (!frame) frame = win.requestAnimationFrame(tick);
    if (timer) win.clearTimeout(timer);
    timer = win.setTimeout(() => cancel({ resume: true }), VIDEO_SHUTTLE_IDLE_MS);
    onChange();
  }

  function wheel(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || !videoShuttleHasHorizontalIntent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.__videoAnalysisHandled = true;
    const delta = videoShuttleHorizontalDelta(event);
    if (delta) activate(delta);
  }

  const touchPosition = touches => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
    distance: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY),
  });
  function touchStart(event) {
    touch = event.touches.length === 2 ? touchPosition(event.touches) : null;
  }
  function touchMove(event) {
    if (!touch || event.touches.length !== 2) return;
    const position = touchPosition(event.touches);
    if (Math.abs(position.distance - touch.distance) > Math.max(12, touch.distance * .08)) {
      touch = null;
      cancel({ resume: true });
      return;
    }
    const gesture = { deltaX: touch.x - position.x, deltaY: touch.y - position.y };
    if (!videoShuttleHasHorizontalIntent(gesture)) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = videoShuttleHorizontalDelta(gesture);
    if (delta) { activate(delta); touch = position; }
  }
  function touchEnd() { touch = null; cancel({ resume: true }); }
  const listen = (target, type, handler, passive = true) => target.addEventListener(type, handler, { signal, passive });
  listen(surface, "wheel", wheel, false);
  listen(surface, "touchstart", touchStart);
  listen(surface, "touchmove", touchMove, false);
  listen(surface, "touchend", touchEnd);
  listen(surface, "touchcancel", () => { touch = null; cancel(); });
  listen(win, "blur", () => cancel());
  listen(surface.ownerDocument, "visibilitychange", () => { if (surface.ownerDocument.hidden) cancel(); });
  return { cancel, isActive: () => Boolean(session) };
}
