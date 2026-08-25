import {
  cancelLocalMediaJob,
  createLocalMediaProxy,
  createLocalReplayBuffer,
} from "../services/localMediaProxyService.js";
import {
  activeMediaAngle,
  mediaReferenceForAngle,
  normalizedReplayRange,
} from "../services/mediaProductionService.js";
import { matchTimeToAngleTime } from "../services/multiAngleSyncService.js";
import { eventElement } from "../video-analysis.dom-events.js";

function mediaPatch(state = {}, patch = {}) {
  return { ...state, mediaProduction: { ...(state.mediaProduction || {}), ...patch } };
}

function proxyEntry(state = {}, angleId = "") {
  return state.mediaProduction?.proxy?.byAngleId?.[angleId] || {};
}

function patchProxyEntry(state = {}, angleId = "", patch = {}) {
  const proxy = state.mediaProduction?.proxy || {};
  return mediaPatch(state, {
    proxy: {
      ...proxy,
      byAngleId: {
        ...(proxy.byAngleId || {}),
        [angleId]: { ...proxyEntry(state, angleId), ...patch },
      },
    },
  });
}

function patchReplayBuffer(state = {}, patch = {}) {
  const replay = state.mediaProduction?.replay || {};
  return mediaPatch(state, { replay: { ...replay, buffer: { ...(replay.buffer || {}), ...patch } } });
}

function freshArtifact(result = {}, minimumLifetimeMs = 5000) {
  const expiresAtMs = Date.parse(result.expiresAt || "");
  return Boolean(result.artifactId && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + minimumLifetimeMs);
}

export function createMediaProxyController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const win = () => options.getWindow?.() || globalThis.window;
  let proxyAbort = null;
  let replayAbort = null;
  let proxyJob = null;
  let replayJob = null;
  let proxyToken = 0;
  let replayToken = 0;

  function refreshPlayback(matchMs = 0, play = false) {
    options.refreshPlayback?.(Math.max(0, Math.round(Number(matchMs) || 0)), play);
  }

  async function generateProxy() {
    const state = getState();
    const angle = activeMediaAngle(state);
    const reference = mediaReferenceForAngle(state, angle);
    if (!angle || !reference?.localVideoIdentifier) return false;
    const existing = proxyEntry(state, angle.id);
    if (existing.status === "processing") return false;
    const token = ++proxyToken;
    proxyAbort = new AbortController();
    proxyJob = null;
    const preset = state.mediaProduction?.proxy?.preset || "scrub-540p";
    updateState((current) => patchProxyEntry(current, angle.id, {
      status: "processing",
      stage: "receiving",
      progress: 0.01,
      enabled: false,
      error: "",
    }));
    try {
      const result = await (options.createProxy || createLocalMediaProxy)({
        angleId: angle.id,
        preset,
        videoRef: reference,
        win: win(),
        signal: proxyAbort.signal,
        onQueued: (job) => { proxyJob = job; },
        onProgress: (progress) => {
          if (token !== proxyToken) return;
          updateState((current) => patchProxyEntry(current, angle.id, {
            status: "processing",
            stage: progress.stage,
            progress: progress.ratio,
          }));
        },
      });
      if (token !== proxyToken) return false;
      updateState((current) => patchProxyEntry(current, angle.id, {
        status: "ready",
        stage: "complete",
        progress: 1,
        enabled: true,
        result,
        error: "",
      }));
      refreshPlayback(options.getCurrentMatchMs?.() || state.timeline?.playheadMs || 0);
      return true;
    } catch (error) {
      if (token !== proxyToken) return false;
      updateState((current) => patchProxyEntry(current, angle.id, {
        status: error?.name === "AbortError" ? "cancelled" : "error",
        stage: "",
        progress: 0,
        enabled: false,
        error: error?.name === "AbortError" ? "" : error.message || "Proxy creation failed.",
      }));
      return false;
    } finally {
      if (token === proxyToken) {
        proxyAbort = null;
        proxyJob = null;
      }
    }
  }

  async function cancelProxy() {
    if (!proxyJob && !proxyAbort) return false;
    proxyToken += 1;
    if (proxyJob) await (options.cancelJob || cancelLocalMediaJob)(proxyJob, win()).catch(() => false);
    proxyAbort?.abort();
    const angleId = Object.entries(getState().mediaProduction?.proxy?.byAngleId || {})
      .find(([, entry]) => entry?.status === "processing")?.[0] || "";
    if (angleId) updateState((state) => patchProxyEntry(state, angleId, { status: "cancelled", enabled: false, error: "" }));
    return true;
  }

  function toggleProxy() {
    const state = getState();
    const angle = activeMediaAngle(state);
    if (!angle) return false;
    const entry = proxyEntry(state, angle.id);
    if (!entry.enabled && !freshArtifact(entry.result)) {
      updateState((current) => patchProxyEntry(current, angle.id, { status: "expired", enabled: false, error: "Proxy access expired. Create it again to refresh local access." }));
      return true;
    }
    updateState((current) => patchProxyEntry(current, angle.id, { enabled: !entry.enabled, error: "" }));
    refreshPlayback(options.getCurrentMatchMs?.() || state.timeline?.playheadMs || 0);
    return true;
  }

  async function prepareReplayBuffer() {
    const state = getState();
    const angle = activeMediaAngle(state);
    const proxy = angle ? proxyEntry(state, angle.id) : {};
    const range = normalizedReplayRange(state);
    if (!angle || range.inMs == null || range.outMs == null) return false;
    if (!freshArtifact(proxy.result)) {
      updateState((current) => patchReplayBuffer(current, { status: "error", active: false, error: "Create a fresh local proxy before preparing replay." }));
      return true;
    }
    const token = ++replayToken;
    replayAbort = new AbortController();
    replayJob = null;
    const startMs = matchTimeToAngleTime(range.inMs, angle);
    const endMs = Math.max(startMs + 1, matchTimeToAngleTime(range.outMs, angle));
    updateState((current) => patchReplayBuffer(current, {
      status: "processing",
      active: false,
      angleId: angle.id,
      startMatchMs: range.inMs,
      endMatchMs: range.outMs,
      progress: 0.01,
      stage: "buffering",
      error: "",
    }));
    try {
      const result = await (options.createReplayBuffer || createLocalReplayBuffer)({
        angleId: angle.id,
        proxy: proxy.result,
        startMs,
        endMs,
        matchStartMs: range.inMs,
        matchEndMs: range.outMs,
        win: win(),
        signal: replayAbort.signal,
        onQueued: (job) => { replayJob = job; },
        onProgress: (progress) => {
          if (token !== replayToken) return;
          updateState((current) => patchReplayBuffer(current, {
            status: "processing",
            stage: progress.stage,
            progress: progress.ratio,
          }));
        },
      });
      if (token !== replayToken) return false;
      updateState((current) => patchReplayBuffer(current, {
        status: "ready",
        active: false,
        stage: "complete",
        progress: 1,
        result,
        error: "",
      }));
      return true;
    } catch (error) {
      if (token !== replayToken) return false;
      updateState((current) => patchReplayBuffer(current, {
        status: error?.name === "AbortError" ? "cancelled" : "error",
        active: false,
        progress: 0,
        stage: "",
        error: error?.name === "AbortError" ? "" : error.message || "Replay buffering failed.",
      }));
      return false;
    } finally {
      if (token === replayToken) {
        replayAbort = null;
        replayJob = null;
      }
    }
  }

  async function cancelReplayBuffer() {
    if (!replayJob && !replayAbort) return false;
    replayToken += 1;
    if (replayJob) await (options.cancelJob || cancelLocalMediaJob)(replayJob, win()).catch(() => false);
    replayAbort?.abort();
    updateState((state) => patchReplayBuffer(state, { status: "cancelled", active: false, error: "" }));
    return true;
  }

  function playReplayBuffer() {
    const state = getState();
    const buffer = state.mediaProduction?.replay?.buffer || {};
    if (buffer.status !== "ready" || !freshArtifact(buffer.result) || buffer.angleId !== activeMediaAngle(state)?.id) return false;
    updateState((current) => patchReplayBuffer(current, { active: true, error: "" }));
    refreshPlayback(buffer.startMatchMs, true);
    return true;
  }

  function stopReplayBuffer() {
    const state = getState();
    const buffer = state.mediaProduction?.replay?.buffer || {};
    if (!buffer.active) return false;
    const elapsedMs = Math.max(0, Math.round(Number(options.getVideoElement?.()?.currentTime || 0) * 1000));
    const matchMs = Math.min(buffer.endMatchMs, buffer.startMatchMs + elapsedMs);
    updateState((current) => patchReplayBuffer(current, { active: false }));
    refreshPlayback(matchMs, false);
    return true;
  }

  function handleVideoTimeUpdate(video = options.getVideoElement?.()) {
    const state = getState();
    const buffer = state.mediaProduction?.replay?.buffer || {};
    if (!buffer.active || !video) return false;
    const durationMs = Math.max(1, buffer.endMatchMs - buffer.startMatchMs);
    const elapsedMs = Math.max(0, Math.round(Number(video.currentTime || 0) * 1000));
    if (!video.ended && elapsedMs < durationMs - 20) return false;
    if (state.mediaProduction?.replay?.loop) {
      try { video.currentTime = 0; } catch { /* Replay metadata may still be loading. */ }
      video.play?.().catch?.(() => {});
    } else {
      updateState((current) => patchReplayBuffer(current, { active: false }));
      refreshPlayback(buffer.endMatchMs, false);
    }
    return true;
  }

  function handleClick(event) {
    const action = eventElement(event)?.closest?.("[data-video-analysis-proxy-action]")?.dataset?.videoAnalysisProxyAction;
    if (action === "generate") { void generateProxy(); return true; }
    if (action === "cancel-proxy") { void cancelProxy(); return true; }
    if (action === "toggle") return toggleProxy();
    if (action === "prepare-replay") { void prepareReplayBuffer(); return true; }
    if (action === "cancel-replay") { void cancelReplayBuffer(); return true; }
    if (action === "play-replay") return playReplayBuffer();
    if (action === "stop-replay") return stopReplayBuffer();
    return false;
  }

  function handleChange(event) {
    const field = eventElement(event)?.closest?.("[data-video-analysis-proxy-field]");
    if (!field || field.dataset.videoAnalysisProxyField !== "preset") return false;
    updateState((state) => mediaPatch(state, {
      proxy: { ...(state.mediaProduction?.proxy || {}), preset: field.value },
    }));
    return true;
  }

  async function dispose() {
    await Promise.all([cancelProxy(), cancelReplayBuffer()]);
  }

  return {
    dispose,
    generateProxy,
    handleChange,
    handleClick,
    handleVideoTimeUpdate,
    playReplayBuffer,
    prepareReplayBuffer,
    toggleProxy,
  };
}
