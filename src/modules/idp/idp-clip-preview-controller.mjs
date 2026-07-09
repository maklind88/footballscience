import { sortClipBankItems } from "./idp-clip-bank-renderer.mjs";
import { createLocalVideoReference, revokeLocalVideoReference } from "../video-analysis/services/localVideoBridgeService.js";
import {
  persistLocalVideoHandle,
  pickLocalVideoFile,
  restoreLocalVideoHandleForState,
} from "../video-analysis/services/localVideoSessionService.js";

function getRoot(activeRuntime = {}) {
  return activeRuntime?.context?.ui?.idpWorkspace || null;
}

function getDocument(activeRuntime = {}) {
  return activeRuntime?.context?.win?.document || globalThis.document || null;
}

function clipId(clip = {}) {
  return String(clip.id || clip.clipInstanceId || "");
}

function formatClipClock(seconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function currentClipBank(activeRuntime = {}) {
  return sortClipBankItems(activeRuntime?.store?.getState?.()?.playerDetail?.clipBank || []);
}

function findClipBankItem(id = "", activeRuntime = {}) {
  return currentClipBank(activeRuntime).find((clip) => clipId(clip) === String(id || "")) || null;
}

function activePreviewClip(activeRuntime = {}) {
  const state = activeRuntime?.store?.getState?.() || {};
  const queueIds = state.ui?.clipPreviewQueueIds || [];
  const index = Math.max(0, Math.min(Number(state.ui?.clipPreviewActiveIndex || 0), Math.max(0, queueIds.length - 1)));
  return findClipBankItem(queueIds[index], activeRuntime);
}

function setPreviewError(activeRuntime = {}, message = "Could not open local video.") {
  activeRuntime?.store?.setState?.({
    ui: {
      clipPreviewStatus: "error",
      clipPreviewMessage: message,
      clipPreviewObjectUrl: "",
    },
  });
}

function safeRun(activeRuntime = {}, task) {
  Promise.resolve()
    .then(task)
    .catch((error) => setPreviewError(activeRuntime, error?.message || "Could not open local video."));
}

function previewHandleState(clip = {}) {
  return {
    match: {
      id: clip.matchId,
      matchDate: clip.matchDate,
      organizationId: clip.organizationId,
      teamId: clip.teamId,
      title: clip.matchTitle,
    },
    source: {
      displayName: clip.videoTitle || clip.matchTitle,
      localVideoIdentifier: clip.localVideoIdentifier,
      matchDate: clip.matchDate,
      matchId: clip.matchId,
      organizationId: clip.organizationId,
      teamId: clip.teamId,
      videoId: clip.videoId,
    },
    video: {
      id: clip.videoId,
      localVideoIdentifier: clip.localVideoIdentifier,
      organizationId: clip.organizationId,
      teamId: clip.teamId,
      title: clip.videoTitle || clip.matchTitle,
    },
    videoRef: {
      displayName: clip.videoTitle || clip.matchTitle,
      localVideoIdentifier: clip.localVideoIdentifier,
    },
  };
}

function previewMessageForResult(result = {}, clip = {}) {
  if (result.reason === "permission-needed") return "Local video permission is needed. Reconnect the local file to continue here.";
  if (result.reason === "missing-handle") return "Local video is not linked on this device yet.";
  if (result.reason === "missing-file") return "The local file moved or is no longer available on this device.";
  if (result.reason === "missing-metadata") return "This clip does not have enough video metadata to restore playback.";
  return `Could not open ${clip.matchTitle || clip.videoTitle || "this clip"}.`;
}

async function loadPreviewClip(activeRuntime = {}) {
  const state = activeRuntime?.store?.getState?.() || {};
  const queueIds = state.ui?.clipPreviewQueueIds || [];
  const index = Math.max(0, Math.min(Number(state.ui?.clipPreviewActiveIndex || 0), Math.max(0, queueIds.length - 1)));
  const clip = activePreviewClip(activeRuntime);
  if (!clip) {
    activeRuntime?.store?.setState?.({ ui: { clipPreviewStatus: "missing", clipPreviewMessage: "Clip was not found.", clipPreviewObjectUrl: "" } });
    return;
  }
  revokePreviewUrl(activeRuntime);
  activeRuntime?.store?.setState?.({
    ui: {
      clipPreviewStatus: "loading",
      clipPreviewMessage: `Connecting ${clip.matchTitle || clip.videoTitle || "local video"}...`,
      clipPreviewObjectUrl: "",
    },
  });
  const result = await restoreLocalVideoHandleForState({
    context: activeRuntime.context,
    requestReadPermission: true,
    state: previewHandleState(clip),
  });
  if (!result.ok || !result.reference?.objectUrl) {
    activeRuntime?.store?.setState?.({
      ui: {
        clipPreviewStatus: result.reason || "missing",
        clipPreviewMessage: previewMessageForResult(result, clip),
        clipPreviewObjectUrl: "",
      },
    });
    return;
  }
  activeRuntime?.store?.setState?.({
    ui: {
      clipPreviewStatus: "ready",
      clipPreviewMessage: "",
      clipPreviewObjectUrl: result.reference.objectUrl,
    },
  });
}

export async function reconnectClipPreviewLocalFile(activeRuntime = {}) {
  const clip = activePreviewClip(activeRuntime);
  if (!clip) {
    setPreviewError(activeRuntime, "Clip was not found.");
    return;
  }
  const context = activeRuntime.context || {};
  const win = context.win || window;
  activeRuntime?.store?.setState?.({
    ui: {
      clipPreviewStatus: "loading",
      clipPreviewMessage: "Choose the local video file for this clip.",
      clipPreviewObjectUrl: "",
    },
  });
  let picked;
  try {
    picked = await pickLocalVideoFile(win);
  } catch (error) {
    const cancelled = error?.name === "AbortError";
    activeRuntime?.store?.setState?.({
      ui: {
        clipPreviewStatus: "missing-handle",
        clipPreviewMessage: cancelled ? "Reconnect cancelled." : error?.message || "Could not open the local file picker.",
        clipPreviewObjectUrl: "",
      },
    });
    return;
  }
  if (!picked?.file) {
    activeRuntime?.store?.setState?.({
      ui: {
        clipPreviewStatus: "missing-handle",
        clipPreviewMessage: "This browser cannot reconnect a local file here. Open FS Player to link the file on this device.",
        clipPreviewObjectUrl: "",
      },
    });
    return;
  }
  revokePreviewUrl(activeRuntime);
  const reference = await createLocalVideoReference(picked.file, win);
  if (reference.playbackCompatibility?.warning) {
    revokeLocalVideoReference(reference, win);
    activeRuntime?.store?.setState?.({
      ui: {
        clipPreviewStatus: "browser-unplayable",
        clipPreviewMessage: reference.playbackCompatibility.warning,
        clipPreviewObjectUrl: "",
      },
    });
    return;
  }
  if (picked.handle) {
    await persistLocalVideoHandle({
      state: previewHandleState(clip),
      context,
      handle: picked.handle,
      reference,
    });
  }
  activeRuntime?.store?.setState?.({
    ui: {
      clipPreviewStatus: "ready",
      clipPreviewMessage: "",
      clipPreviewObjectUrl: reference.objectUrl,
    },
  });
}

export function ensureClipBankStyles(activeRuntime = {}) {
  const doc = getDocument(activeRuntime);
  if (!doc?.head || doc.getElementById("idp-clip-bank-styles")) return;
  const link = doc.createElement("link");
  link.id = "idp-clip-bank-styles";
  link.rel = "stylesheet";
  link.href = "src/modules/idp/idp-clip-bank.css";
  doc.head.appendChild(link);
}

export function selectedClipIds(activeRuntime = {}) {
  const available = new Set(currentClipBank(activeRuntime).map(clipId));
  const seen = new Set();
  return (activeRuntime?.store?.getState?.()?.ui?.selectedClipBankIds || [])
    .map((id) => String(id || ""))
    .filter((id) => {
      if (!id || !available.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function toggleClipBankSelection(activeRuntime = {}, id = "", checked = false) {
  const selected = new Set(activeRuntime?.store?.getState?.()?.ui?.selectedClipBankIds || []);
  if (checked) selected.add(id);
  else selected.delete(id);
  activeRuntime?.store?.setState?.({ ui: { selectedClipBankIds: [...selected] } });
}

export function revokePreviewUrl(activeRuntime = {}) {
  const win = activeRuntime?.context?.win || globalThis;
  const url = activeRuntime?.store?.getState?.()?.ui?.clipPreviewObjectUrl || "";
  if (!url?.startsWith?.("blob:")) return;
  try {
    win.URL?.revokeObjectURL?.(url);
  } catch {
    // The browser may already have released the object URL.
  }
}

export function openClipPreview(activeRuntime = {}, ids = []) {
  const available = new Set(currentClipBank(activeRuntime).map(clipId));
  const seen = new Set();
  const queueIds = ids.map((id) => String(id || "")).filter((id) => {
    if (!id || !available.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!queueIds.length) return;
  activeRuntime?.store?.setState?.({
    ui: {
      clipPreviewActiveIndex: 0,
      clipPreviewMessage: "Connecting local video...",
      clipPreviewObjectUrl: "",
      clipPreviewOpen: true,
      clipPreviewQueueIds: queueIds,
      clipPreviewStatus: "loading",
    },
  });
  safeRun(activeRuntime, () => loadPreviewClip(activeRuntime));
}

export function closeClipPreview(activeRuntime = {}) {
  revokePreviewUrl(activeRuntime);
  activeRuntime?.store?.setState?.({
    ui: {
      clipPreviewActiveIndex: 0,
      clipPreviewMessage: "",
      clipPreviewObjectUrl: "",
      clipPreviewOpen: false,
      clipPreviewQueueIds: [],
      clipPreviewStatus: "",
    },
  });
}

export function jumpClipPreview(activeRuntime = {}, index = 0) {
  const queue = activeRuntime?.store?.getState?.()?.ui?.clipPreviewQueueIds || [];
  const nextIndex = Math.max(0, Math.min(Number(index || 0), Math.max(0, queue.length - 1)));
  activeRuntime?.store?.setState?.({ ui: { clipPreviewActiveIndex: nextIndex, clipPreviewObjectUrl: "", clipPreviewStatus: "loading" } });
  safeRun(activeRuntime, () => loadPreviewClip(activeRuntime));
}

export function moveClipPreview(activeRuntime = {}, direction = 1) {
  const current = Number(activeRuntime?.store?.getState?.()?.ui?.clipPreviewActiveIndex || 0);
  jumpClipPreview(activeRuntime, current + direction);
}

export function setClipPreviewSpeed(activeRuntime = {}, speed = 1) {
  const root = getRoot(activeRuntime);
  const video = root?.querySelector?.("[data-idp-clip-preview-video]");
  if (!video) return;
  const playbackRate = Number(speed);
  video.playbackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  root?.querySelectorAll?.("[data-idp-clip-preview-speed]")?.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.idpClipPreviewSpeed || 1) === video.playbackRate);
  });
}

export function toggleClipPreviewPlayback(activeRuntime = {}) {
  const root = getRoot(activeRuntime);
  const video = root?.querySelector?.("[data-idp-clip-preview-video]");
  if (!video) return;
  if (video.paused) {
    video.play?.().catch(() => {
      activeRuntime?.store?.setState?.({ ui: { clipPreviewMessage: "Press play to start this local clip." } });
    });
    return;
  }
  video.pause?.();
}

export function setupIdpClipPreviewPlayback(activeRuntime = {}) {
  const root = getRoot(activeRuntime);
  const video = root?.querySelector?.("[data-idp-clip-preview-video]");
  if (!video || video.dataset.idpPreviewBound === "true") return;
  video.dataset.idpPreviewBound = "true";
  const startSeconds = Math.max(0, Number(video.dataset.startMs || 0) / 1000);
  const rawEndSeconds = Math.max(0, Number(video.dataset.endMs || 0) / 1000);
  const endSeconds = rawEndSeconds > startSeconds ? rawEndSeconds : 0;
  const durationSeconds = endSeconds ? Math.max(0, endSeconds - startSeconds) : 0;
  const progressBar = root?.querySelector?.("[data-idp-clip-preview-progress-bar]");
  const timeLabel = root?.querySelector?.("[data-idp-clip-preview-time]");
  const toggleLabel = root?.querySelector?.("[data-idp-clip-preview-toggle-label]");
  const syncControls = () => {
    if (toggleLabel) toggleLabel.textContent = video.paused ? "Play" : "Pause";
  };
  const updateProgress = () => {
    const elapsed = Math.max(0, video.currentTime - startSeconds);
    if (durationSeconds && progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, (elapsed / durationSeconds) * 100))}%`;
    if (timeLabel) timeLabel.textContent = `${formatClipClock(elapsed)} / ${formatClipClock(durationSeconds)}`;
  };
  const begin = () => {
    if (Number.isFinite(startSeconds)) video.currentTime = startSeconds;
    video.play?.().catch(() => {
      activeRuntime?.store?.setState?.({ ui: { clipPreviewMessage: "Press play to start this local clip." } });
    });
    updateProgress();
    syncControls();
  };
  const onTimeUpdate = () => {
    updateProgress();
    if (!endSeconds || video.currentTime < endSeconds || video.dataset.idpPreviewComplete === "true") return;
    video.dataset.idpPreviewComplete = "true";
    const state = activeRuntime?.store?.getState?.() || {};
    const nextIndex = Number(state.ui?.clipPreviewActiveIndex || 0) + 1;
    const hasNext = nextIndex < (state.ui?.clipPreviewQueueIds || []).length;
    if (hasNext) moveClipPreview(activeRuntime, 1);
    else video.pause?.();
  };
  video.addEventListener("play", syncControls);
  video.addEventListener("pause", syncControls);
  video.addEventListener("timeupdate", onTimeUpdate);
  if (video.readyState >= 1) begin();
  else video.addEventListener("loadedmetadata", begin, { once: true });
}
