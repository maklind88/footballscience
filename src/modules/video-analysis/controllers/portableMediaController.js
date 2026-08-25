import {
  cancelLocalPortablePublish,
  publishLocalMediaExport,
} from "../services/localPortableMediaService.js";
import { eventElement } from "../video-analysis.dom-events.js";

function portablePatch(state = {}, patch = {}) {
  return {
    ...state,
    mediaProduction: {
      ...(state.mediaProduction || {}),
      portable: { ...(state.mediaProduction?.portable || {}), ...patch },
    },
  };
}

function assetRange(asset = {}) {
  const startMs = Math.max(0, Math.round(Number(asset.manifest?.range?.startMs) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(asset.manifest?.range?.endMs) || startMs + 1));
  return { startMs, endMs };
}

export function createPortableMediaController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const win = () => options.getWindow?.() || globalThis.window;
  let activeJob = null;
  let abortController = null;
  let reservedAssetId = "";

  async function initialize(force = false) {
    const state = getState();
    const matchId = state.match?.id || state.video?.match_id || "";
    const portable = state.mediaProduction?.portable || {};
    if (!matchId || (!force && portable.loadedMatchId === matchId)) return false;
    updateState((current) => portablePatch(current, { status: "loading", loadedMatchId: matchId, error: "" }));
    try {
      const payload = await options.repository.portableMedia(matchId);
      updateState((current) => portablePatch(current, { status: "ready", assets: payload.assets || [], error: "" }));
      return true;
    } catch (error) {
      updateState((current) => portablePatch(current, { status: "error", error: error.message || "Shared reviews could not be loaded." }));
      return false;
    }
  }

  function reservationPayload(state = {}, result = {}) {
    const manifest = result.manifest || {};
    const currentPresentation = state.presentation?.current || {};
    return {
      title: manifest.title || state.mediaProduction?.export?.title,
      fileName: result.fileName,
      matchId: manifest.source?.matchId,
      presentationId: manifest.analysis?.presentationId,
      clipId: manifest.analysis?.clipId,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
      sourceManifestSha256: result.manifestSha256,
      exportManifestId: result.exportManifestId,
      manifest,
      shareTargets: currentPresentation.shareTargets || [],
    };
  }

  async function publish() {
    const state = getState();
    const result = state.mediaProduction?.export?.result;
    if (!result?.artifactId || !result?.sha256) {
      updateState((current) => portablePatch(current, { error: "Render the review before publishing it." }));
      return false;
    }
    const alreadyPublished = (state.mediaProduction?.portable?.assets || []).some((asset) => (
      asset.sha256 === result.sha256 && asset.sourceManifestSha256 === result.manifestSha256
    ));
    if (alreadyPublished) {
      updateState((current) => portablePatch(current, { error: "This exact rendered review is already published." }));
      return false;
    }
    abortController = new AbortController();
    activeJob = null;
    reservedAssetId = "";
    updateState((current) => portablePatch(current, { status: "publishing", stage: "reserving private storage", progress: 0.01, error: "" }));
    try {
      const reserved = await options.repository.reservePortableMedia(reservationPayload(state, result));
      reservedAssetId = reserved.asset?.id || reserved.upload?.assetId || "";
      updateState((current) => portablePatch(current, { stage: "uploading portable review", progress: 0.03 }));
      await (options.publishLocal || publishLocalMediaExport)(result, reserved.upload, {
        win: win(),
        signal: abortController.signal,
        onQueued: (job) => { activeJob = job; },
        onProgress: (progress) => updateState((current) => portablePatch(current, {
          stage: progress.stage || "uploading portable review",
          progress: 0.03 + Math.max(0, Math.min(1, Number(progress.ratio) || 0)) * 0.92,
        })),
      });
      updateState((current) => portablePatch(current, { stage: "verifying private review", progress: 0.97 }));
      const completed = await options.repository.completePortableMedia(reservedAssetId);
      const asset = completed.asset;
      updateState((current) => {
        const assets = [asset, ...(current.mediaProduction?.portable?.assets || []).filter((entry) => entry.id !== asset.id)];
        return portablePatch(current, { status: "ready", stage: "published", progress: 1, assets, error: "" });
      });
      return true;
    } catch (error) {
      if (reservedAssetId) await options.repository.revokePortableMedia(reservedAssetId).catch(() => {});
      updateState((current) => portablePatch(current, {
        status: error?.name === "AbortError" ? "cancelled" : "error",
        stage: "",
        progress: 0,
        error: error?.name === "AbortError" ? "" : error.message || "Portable review could not be published.",
      }));
      return false;
    } finally {
      activeJob = null;
      abortController = null;
      reservedAssetId = "";
    }
  }

  async function cancelPublish() {
    if (activeJob) await (options.cancelLocal || cancelLocalPortablePublish)(activeJob, win()).catch(() => false);
    abortController?.abort();
    return true;
  }

  async function open(assetId = "") {
    try {
      const payload = await options.repository.openPortableMedia(assetId, false);
      const range = assetRange(payload.asset);
      updateState((state) => portablePatch(state, {
        playback: { active: true, asset: payload.asset, url: payload.playback.url, expiresAt: payload.playback.expiresAt, ...range },
        error: "",
      }));
      win()?.requestAnimationFrame?.(() => {
        options.seekToMatchMs?.(range.startMs);
        options.getVideoElement?.()?.play?.().catch?.(() => {});
      });
      return true;
    } catch (error) {
      updateState((state) => portablePatch(state, { error: error.message || "Portable review could not be opened." }));
      return false;
    }
  }

  function closePlayback() {
    options.getVideoElement?.()?.pause?.();
    updateState((state) => portablePatch(state, { playback: null, error: "" }));
    return true;
  }

  async function download(assetId = "") {
    try {
      const payload = await options.repository.openPortableMedia(assetId, true);
      const anchor = win()?.document?.createElement?.("a");
      if (!anchor) return false;
      anchor.href = payload.playback.url;
      anchor.download = payload.asset.fileName || "football-science-review.mp4";
      anchor.rel = "noopener";
      anchor.click();
      return true;
    } catch (error) {
      updateState((state) => portablePatch(state, { error: error.message || "Portable review could not be downloaded." }));
      return false;
    }
  }

  async function revoke(assetId = "") {
    try {
      await options.repository.revokePortableMedia(assetId);
      updateState((state) => portablePatch(state, {
        assets: (state.mediaProduction?.portable?.assets || []).filter((asset) => asset.id !== assetId),
        playback: state.mediaProduction?.portable?.playback?.asset?.id === assetId ? null : state.mediaProduction?.portable?.playback,
        error: "",
      }));
      return true;
    } catch (error) {
      updateState((state) => portablePatch(state, { error: error.message || "Portable review could not be revoked." }));
      return false;
    }
  }

  function handleClick(event) {
    const target = eventElement(event);
    const panel = target?.closest?.("[data-video-analysis-media-panel]")?.dataset?.videoAnalysisMediaPanel;
    if (panel === "share") void initialize();
    const node = target?.closest?.("[data-video-analysis-portable-action]");
    const action = node?.dataset?.videoAnalysisPortableAction;
    if (!action) return false;
    const assetId = node.dataset.videoAnalysisPortableAsset || "";
    if (action === "publish") { void publish(); return true; }
    if (action === "cancel") { void cancelPublish(); return true; }
    if (action === "open") { void open(assetId); return true; }
    if (action === "close") return closePlayback();
    if (action === "download") { void download(assetId); return true; }
    if (action === "revoke") { void revoke(assetId); return true; }
    if (action === "refresh") { void initialize(true); return true; }
    return false;
  }

  return { dispose: cancelPublish, handleClick, initialize };
}
