import { inspectLocalTrackingProvider, trackLocalObjects } from "../services/localTrackingService.js";
import { getLocalVideoFile } from "../services/localVideoBridgeService.js";
import { activeMediaAngle, activeMediaReference, matchTimeFromActiveVideoMs } from "../services/mediaProductionService.js";
import { buildLocalVideoHandleIdentity } from "../services/localVideoSessionService.js";
import { clipPreviewRange } from "./timeline.clip-preview.controller.js";
import { containedVideoRect, pairPointerPoint, pairPromptBox, playerPairAt, verifiedPairDistance } from "./timeline.player-pair.geometry.js";
import { drawPlayerPair } from "./timeline.player-pair.view.js";
import { loadPairCalibration, estimatedPairDistance, pairDistanceLabel } from "../services/playerPairCalibrationService.js";

export function playerPairContext(state, clipId, range, context = {}) {
  const reference = activeMediaReference(state);
  const angle = activeMediaAngle(state);
  const sourceRange = clipPreviewRange(state, range.startMs, range.endMs, reference?.durationMs);
  const file = reference ? getLocalVideoFile(reference) : null;
  if (!file || !sourceRange || reference?.playbackWindow || reference?.playbackProxy) return null;
  const scope = buildLocalVideoHandleIdentity(state, context, { reference });
  return {
    file, reference, angle, sourceRange,
    key: JSON.stringify([scope.organizationId, scope.teamId, scope.userId, state.match?.id, state.video?.id,
      clipId, angle?.id, angle?.syncOffsetMs, angle?.driftPpm, range.startMs, range.endMs]),
  };
}

// Exact File identity prevents reuse after a different same-named video is attached.
export function createPlayerPairCache() {
  const entries = new Map();
  return {
    get(context) { const entry = entries.get(context?.key); return entry?.file === context?.file ? entry.tracks : null; },
    set(context, tracks) {
      entries.delete(context.key);
      entries.set(context.key, { file: context.file, tracks });
      while (entries.size > 10) entries.delete(entries.keys().next().value);
    },
  };
}

export function createPlayerPairController({ dialog, clipId, getState, getRange, getContext = () => ({}), cache,
  inspect = inspectLocalTrackingProvider, track = trackLocalObjects, loadCalibration = loadPairCalibration }) {
  const win = dialog.ownerDocument.defaultView;
  const video = dialog.querySelector("[data-video-analysis-clip-preview]");
  const root = dialog.querySelector("[data-player-pair]");
  const canvas = root.querySelector("canvas");
  const toggle = dialog.querySelector("[data-player-pair-toggle]");
  const output = root.querySelector("[data-player-pair-status]");
  const retry = root.querySelector("[data-player-pair-retry]");
  const events = new win.AbortController();
  let enabled = false, disposed = false, selecting = false, checking = false;
  let tracks = null, boxes = [], pointer = null, promptAtMs = null, job = null, epoch = 0, animation = null;
  let activeContext = null;
  let calibration = null;
  const context = () => playerPairContext(getState(), clipId, getRange(), getContext());
  const sameContext = value => value && activeContext?.key === value.key && activeContext?.file === value.file;
  const status = text => { if (output.textContent !== text) output.textContent = text; };
  const listen = (node, type, callback) => node.addEventListener(type, callback, { signal: events.signal });

  function setSelecting(value) {
    selecting = value;
    root.classList.toggle("is-selecting", value);
    canvas.setAttribute("aria-label", value ? `Select player ${boxes.length + 1}` : "Player tracking overlay");
  }

  function clearWork() {
    epoch += 1;
    job?.abort(); job = null;
    checking = false; pointer = null; boxes = []; promptAtMs = null;
    calibration = null;
    setSelecting(false);
  }

  function hide() {
    clearWork();
    enabled = false;
    root.hidden = true;
    toggle.setAttribute("aria-pressed", "false");
    if (animation !== null) win.cancelAnimationFrame(animation);
    animation = null;
  }

  function paint() {
    if (disposed || !enabled) return;
    if (activeContext && !sameContext(context())) {
      clearWork(); tracks = null; activeContext = null;
      status("Video or clip range changed");
    }
    const state = getState();
    const atMs = matchTimeFromActiveVideoMs(state, video.currentTime * 1000);
    const points = tracks && !selecting && !job ? playerPairAt(tracks, atMs) : null;
    const verified = points ? verifiedPairDistance(points, state.presentation?.spatial?.calibration, {
      atMs, sourceSha256: tracks[0]?.metadata?.localSourceSha256, videoId: state.video?.id,
      angleId: activeContext?.angle?.id || "",
    }) : null;
    const estimate = points && verified === null ? estimatedPairDistance(points, calibration, {
      sourceSha256: tracks[0]?.metadata?.localSourceSha256, sourceAtMs: video.currentTime * 1000,
      width: video.videoWidth, height: video.videoHeight,
    }) : null;
    const label = pairDistanceLabel(verified ?? estimate, verified === null);
    const visibleBoxes = job && Math.abs(atMs - promptAtMs) > 50 ? [] : boxes;
    drawPlayerPair(canvas, video, { points, boxes: visibleBoxes, distanceLabel: label });
    if (tracks && !selecting && !job) status(points ? label || "Calibration needed" : "Tracking unavailable here");
    output.title = label && verified === null ? "Estimated distance" : "";
    retry.disabled = checking;
    retry.title = job ? "Cancel tracking and select again" : "Select two players again";
  }

  async function prepareCalibration(result, current) {
    let value = null;
    try { value = await loadCalibration(result[0]?.metadata?.localSourceSha256, win); } catch { /* Tracking remains usable without metres. */ }
    if (!disposed && enabled && current === epoch && sameContext(context())) { calibration = value; paint(); }
  }

  function tick() {
    animation = null;
    paint();
    if (enabled && !disposed && !video.paused) animation = win.requestAnimationFrame(tick);
  }

  async function beginSelection() {
    clearWork(); tracks = null;
    video.pause();
    activeContext = context();
    if (!activeContext || video.readyState < 2) { status("Reconnect the original video"); paint(); return; }
    if (getRange().endMs - getRange().startMs > 30_000) { status("Maximum clip length: 30 s"); paint(); return; }
    const current = epoch;
    checking = true; status("Connecting"); paint();
    let provider;
    try { provider = await inspect(win); }
    catch { provider = { status: "offline" }; }
    if (disposed || !enabled || current !== epoch) return;
    checking = false;
    if (!sameContext(context())) { status("Video or clip range changed"); paint(); return; }
    if (!provider.batchAvailable) {
      status(provider.status === "offline" ? "Open FS Companion, then retry" : "Tracking engine unavailable");
      paint(); return;
    }
    if (video.currentTime * 1000 >= activeContext.sourceRange.end - 160) video.currentTime = activeContext.sourceRange.start / 1000;
    setSelecting(true); status("Player 1 / 2"); paint();
  }

  async function run() {
    setSelecting(false);
    const current = epoch;
    const controller = new win.AbortController();
    job = controller;
    const state = getState(), range = getRange();
    const sourcePromptAtMs = video.currentTime * 1000;
    // A real sample after the visible end brackets the final frames; no extrapolation.
    const sourceDuration = Number.isFinite(video.duration) ? video.duration * 1000 : activeContext.reference.durationMs || activeContext.sourceRange.end;
    const sourceEndMs = Math.max(activeContext.sourceRange.end, Math.min(sourceDuration, activeContext.sourceRange.end + 320));
    const prompts = boxes.map((box, index) => ({
      id: `pair-${win.crypto.randomUUID()}`, entityType: "player", playerLabel: `Player ${index + 1}`,
      startMs: range.startMs, endMs: matchTimeFromActiveVideoMs(state, sourceEndMs), promptAtMs,
      sourceStartMs: activeContext.sourceRange.start, sourceEndMs,
      sourcePromptAtMs, angleId: activeContext.angle?.id || "", box,
    }));
    status("Tracking 0%"); paint();
    try {
      const result = await track({ clipId, videoId: state.video?.id, videoRef: activeContext.reference,
        prompts, win, signal: controller.signal,
        onProgress(progress) {
          if (!disposed && current === epoch) status(`Tracking ${Math.round(progress.ratio * 100)}%`);
        },
      });
      if (disposed || current !== epoch || !sameContext(context())) return;
      const sourceSha256 = result?.[0]?.metadata?.localSourceSha256;
      if (!Array.isArray(result) || result.length !== 2 || !/^[a-f0-9]{64}$/.test(sourceSha256 || "")
        || result.some(item => item.clipId !== clipId || item.videoId !== state.video?.id
          || item.metadata?.localSourceSha256 !== sourceSha256
          || item.metadata?.angleId !== (activeContext.angle?.id || ""))) {
        throw new Error("Tracking returned a different video or camera");
      }
      tracks = result; boxes = [];
      cache?.set(activeContext, tracks);
      void prepareCalibration(tracks, current);
      video.currentTime = sourcePromptAtMs / 1000;
    } catch (error) {
      if (!disposed && current === epoch && error.name !== "AbortError") status(error.message || "Tracking failed. Retry.");
    } finally {
      if (!disposed && current === epoch) { job = null; paint(); }
    }
  }

  function position(event) {
    const bounds = canvas.getBoundingClientRect();
    return pairPointerPoint(event.clientX - bounds.left, event.clientY - bounds.top,
      containedVideoRect(bounds.width, bounds.height, video.videoWidth, video.videoHeight));
  }
  listen(canvas, "pointerdown", event => {
    if (!selecting || event.button !== 0 || pointer || video.seeking) return;
    const point = position(event);
    if (!point) return;
    event.preventDefault(); event.stopPropagation(); video.pause();
    pointer = { id: event.pointerId, first: point };
    canvas.setPointerCapture(event.pointerId);
  });
  listen(canvas, "pointermove", event => {
    if (pointer?.id !== event.pointerId || !selecting) return;
    const box = pairPromptBox(pointer.first, position(event), video.videoWidth, video.videoHeight);
    drawPlayerPair(canvas, video, { boxes: box ? [...boxes, box] : boxes });
  });
  listen(canvas, "pointerup", event => {
    if (pointer?.id !== event.pointerId || !selecting) return;
    const box = pairPromptBox(pointer.first, position(event), video.videoWidth, video.videoHeight);
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!box) return;
    if (boxes.some(item => Math.abs(item.left - box.left) < item.width / 2 && Math.abs(item.top - box.top) < item.height / 2)) return;
    boxes.push(box);
    promptAtMs = matchTimeFromActiveVideoMs(getState(), video.currentTime * 1000);
    status("Player 2 / 2"); paint();
    if (boxes.length === 2) void run();
    else setSelecting(true);
  });
  listen(canvas, "pointercancel", () => { pointer = null; paint(); });
  listen(toggle, "click", () => {
    if (enabled) { hide(); return; }
    enabled = true; root.hidden = false; toggle.setAttribute("aria-pressed", "true");
    activeContext = context();
    tracks = activeContext && cache?.get(activeContext);
    if (tracks) { void prepareCalibration(tracks, epoch); paint(); if (!video.paused) tick(); }
    else void beginSelection();
  });
  listen(retry, "click", () => { void beginSelection(); });
  listen(root.querySelector("[data-player-pair-hide]"), "click", hide);
  listen(video, "play", () => { if (selecting || job) video.pause(); else if (animation === null) tick(); });
  listen(video, "pause", paint);
  listen(video, "seeking", () => { if (selecting) { boxes = []; pointer = null; status("Player 1 / 2"); } paint(); });
  listen(video, "seeked", paint);
  listen(video, "timeupdate", paint);
  listen(video, "emptied", () => { if (enabled) { hide(); tracks = null; } });
  const observer = new win.ResizeObserver(paint);
  observer.observe(canvas);
  return { dispose() { disposed = true; hide(); events.abort(); observer.disconnect(); } };
}
