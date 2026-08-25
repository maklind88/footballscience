import { normalizeMediaAngle } from "../domain/mediaAngle.model.js";
import { createLocalVideoReference, revokeLocalVideoReference } from "../services/localVideoBridgeService.js";
import {
  cancelLocalMediaExport,
  downloadLocalMediaExport,
  downloadLocalMediaManifest,
  renderLocalMediaExport,
} from "../services/localMediaExportService.js";
import {
  mediaSourcePayload,
  persistedMediaAnglePayload,
  replaceMediaAngle,
} from "../services/mediaAnglePersistenceService.js";
import { buildMediaOverlaySpec } from "../services/mediaOverlayExportService.js";
import {
  activeMediaAngle,
  activeVideoTimeFromMatchMs,
  buildMediaExportManifest,
  manifestSha256,
  mediaAnglesForState,
  mediaReferenceForAngle,
  normalizedReplayRange,
  primaryMediaAngleForState,
} from "../services/mediaProductionService.js";
import { matchTimeToAngleTime } from "../services/multiAngleSyncService.js";
import { eventElement } from "../video-analysis.dom-events.js";

function localId(prefix = "angle") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function mediaPatch(state = {}, patch = {}) {
  return {
    ...state,
    mediaProduction: { ...(state.mediaProduction || {}), ...patch },
  };
}

export function createMediaProductionController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const getRoot = options.getRoot || (() => null);
  const win = () => options.getWindow?.() || globalThis.window;
  let activeJob = null;
  let exportAbort = null;

  function seekAfterPaint(matchMs = 0, play = false) {
    win()?.requestAnimationFrame?.(() => {
      options.seekToMatchMs?.(matchMs);
      const video = getVideoElement();
      if (play) video?.play?.().catch?.(() => {});
      syncSecondaryVideos(video);
    });
  }

  async function initialize(force = false) {
    const state = getState();
    const matchId = state.match?.id || state.video?.match_id || "";
    if (!matchId || (!force && state.mediaProduction?.loadedMatchId === matchId)) return false;
    updateState((current) => mediaPatch(current, { status: "loading", loadedMatchId: matchId, error: "" }));
    try {
      const payload = await options.repository.workspace(matchId);
      let angles = Array.isArray(payload.angles) ? payload.angles.map(normalizeMediaAngle) : [];
      if (!angles.length) {
        const primary = primaryMediaAngleForState(getState());
        if (primary.matchId && primary.videoId && primary.sourceId) {
          try {
            const saved = await options.repository.saveAngle(persistedMediaAnglePayload(primary));
            if (saved.angle) angles = [normalizeMediaAngle(saved.angle)];
          } catch {
            angles = [];
          }
        }
      }
      updateState((current) => mediaPatch(current, {
        status: "ready",
        angles,
        exports: payload.exports || [],
        loadedMatchId: matchId,
        activeAngleId: angles.some((angle) => angle.id === current.mediaProduction?.activeAngleId)
          ? current.mediaProduction.activeAngleId
          : angles.find((angle) => angle.primary)?.id || current.mediaProduction?.activeAngleId || "",
        error: "",
      }));
      return true;
    } catch (error) {
      updateState((current) => mediaPatch(current, { status: "ready", loadedMatchId: matchId, error: error.message || "Media metadata could not be loaded." }));
      return false;
    }
  }

  function openPanel(panel = "angles") {
    updateState((state) => mediaPatch(state, {
      panelOpen: panel === "toggle" ? !state.mediaProduction?.panelOpen : true,
      panel: panel === "toggle" ? state.mediaProduction?.panel || "angles" : panel,
      error: "",
    }));
    void initialize();
    return true;
  }

  function selectAngle(id = "") {
    const state = getState();
    const angle = mediaAnglesForState(state).find((entry) => entry.id === id);
    if (!angle) return false;
    if (!mediaReferenceForAngle(state, angle)?.objectUrl) {
      updateState((current) => mediaPatch(current, { error: "Reconnect this camera angle on this device." }));
      return true;
    }
    const matchMs = options.getCurrentMatchMs?.() ?? state.timeline?.playheadMs ?? 0;
    updateState((current) => mediaPatch(current, { activeAngleId: id, error: "" }));
    seekAfterPaint(matchMs, false);
    return true;
  }

  async function persistAngle(angle = {}) {
    if (!angle.matchId || !angle.videoId || !angle.sourceId) return angle;
    const payload = await options.repository.saveAngle(persistedMediaAnglePayload(angle));
    return normalizeMediaAngle(payload.angle || angle);
  }

  async function connectAngleFile(file, targetId = "", overrides = {}) {
    if (!file) return false;
    const before = getState();
    const matchMs = options.getCurrentMatchMs?.() ?? before.timeline?.playheadMs ?? 0;
    let reference;
    try {
      reference = await createLocalVideoReference(file, win());
      if (targetId) {
        const angle = mediaAnglesForState(before).find((entry) => entry.id === targetId);
        if (!angle) throw new Error("Camera angle could not be found.");
        if (angle.localVideoIdentifier && angle.localVideoIdentifier !== reference.localVideoIdentifier) {
          throw new Error("This file does not match the saved camera angle.");
        }
        const previous = before.mediaProduction?.angleRefs?.[targetId];
        if (previous) revokeLocalVideoReference(previous, win());
        updateState((state) => mediaPatch(state, {
          angleRefs: { ...(state.mediaProduction?.angleRefs || {}), [targetId]: reference },
          activeAngleId: targetId,
          error: "",
        }));
        seekAfterPaint(matchMs);
        return true;
      }
      const role = overrides.role || before.mediaProduction?.newAngleRole || "tactical";
      const label = overrides.label || before.mediaProduction?.newAngleLabel || reference.displayName.replace(/\.[^.]+$/, "");
      let source = null;
      try { source = await options.createLocalSource(mediaSourcePayload(reference, before)); } catch { source = null; }
      let angle = normalizeMediaAngle({
        id: localId("angle"),
        matchId: source?.video?.match_id || before.match?.id || "",
        videoId: source?.video?.id || "",
        sourceId: source?.source?.id || "",
        label,
        role,
        localVideoIdentifier: reference.localVideoIdentifier,
        durationMs: reference.durationMs,
        syncOffsetMs: Number(overrides.syncOffsetMs) || 0,
        status: "available",
        syncConfidence: 0,
        metadata: { sourceId: source?.source?.id || "", deviceLocal: true, ...(overrides.metadata || {}) },
      });
      try { angle = await persistAngle(angle); } catch { /* Local angle remains usable. */ }
      updateState((state) => {
        const next = replaceMediaAngle(state, angle);
        return mediaPatch(next, {
          angleRefs: { ...(next.mediaProduction?.angleRefs || {}), [angle.id]: reference },
          activeAngleId: angle.id,
          newAngleLabel: "",
          error: angle.sourceId ? "" : "Angle connected locally. Metadata sync is pending.",
        });
      });
      seekAfterPaint(matchMs);
      return true;
    } catch (error) {
      if (reference) revokeLocalVideoReference(reference, win());
      updateState((state) => mediaPatch(state, { error: error.message || "Camera angle could not be connected." }));
      return false;
    }
  }

  async function updateAngle(id = "", field = "", value = "") {
    const state = getState();
    const matchMs = options.getCurrentMatchMs?.() ?? state.timeline?.playheadMs ?? 0;
    const angle = mediaAnglesForState(state).find((entry) => entry.id === id);
    if (!angle) return false;
    const patch = field === "syncOffsetSeconds"
      ? { syncOffsetMs: Math.round((Number(value) || 0) * 1000), syncConfidence: 0.8 }
      : field === "driftPpm"
        ? { driftPpm: Number(value) || 0 }
        : { [field]: value };
    let updated = normalizeMediaAngle({ ...angle, ...patch });
    updateState((current) => replaceMediaAngle(current, updated));
    try {
      updated = await persistAngle(updated);
      updateState((current) => replaceMediaAngle(current, updated));
    } catch (error) {
      updateState((current) => mediaPatch(current, { error: error.message || "Angle settings could not be synced." }));
    }
    seekAfterPaint(matchMs);
    return true;
  }

  function updateReplay(patch = {}) {
    updateState((state) => mediaPatch(state, { replay: normalizedReplayRange(state, patch), error: "" }));
    return true;
  }

  function markReplay(edge = "in") {
    const atMs = Math.max(0, Math.round(options.getCurrentMatchMs?.() ?? getState().timeline?.playheadMs ?? 0));
    const replay = getState().mediaProduction?.replay || {};
    return updateReplay(edge === "out"
      ? { outMs: Math.max((replay.inMs ?? 0) + 1, atMs) }
      : { inMs: Math.min(atMs, replay.outMs == null ? atMs : Math.max(0, replay.outMs - 1)) });
  }

  function playReplay() {
    const replay = normalizedReplayRange(getState());
    if (replay.inMs == null || replay.outMs == null) return false;
    seekAfterPaint(replay.inMs, true);
    return true;
  }

  function syncSecondaryVideos(mainVideo = getVideoElement()) {
    const state = getState();
    const matchMs = options.getCurrentMatchMs?.() ?? state.timeline?.playheadMs ?? 0;
    const playing = Boolean(mainVideo && !mainVideo.paused && !mainVideo.ended);
    getRoot()?.querySelectorAll?.("[data-video-analysis-media-secondary]").forEach((video) => {
      const angle = mediaAnglesForState(state).find((entry) => entry.id === video.dataset.videoAnalysisMediaSecondary);
      if (!angle) return;
      const targetSeconds = matchTimeToAngleTime(matchMs, angle) / 1000;
      if (Math.abs(Number(video.currentTime || 0) - targetSeconds) > 0.18) {
        try { video.currentTime = targetSeconds; } catch { /* Metadata may still be loading. */ }
      }
      video.muted = true;
      video.playbackRate = Math.max(0.25, Math.min(4, Number(mainVideo?.playbackRate || 1) * (1 + (angle.driftPpm / 1_000_000))));
      if (playing) video.play?.().catch?.(() => {});
      else video.pause?.();
    });
  }

  function handleVideoTimeUpdate(video = getVideoElement()) {
    const state = getState();
    const replay = normalizedReplayRange(state);
    const matchMs = options.getCurrentMatchMs?.() ?? state.timeline?.playheadMs ?? 0;
    if (replay.outMs != null && matchMs >= replay.outMs) {
      if (replay.loop && replay.inMs != null) seekAfterPaint(replay.inMs, true);
      else {
        video?.pause?.();
        if (replay.outMs != null) options.seekToMatchMs?.(replay.outMs);
      }
    }
    syncSecondaryVideos(video);
  }

  async function renderExport() {
    const state = getState();
    const angle = activeMediaAngle(state);
    const reference = mediaReferenceForAngle(state, angle);
    if (!reference?.objectUrl) {
      updateState((current) => mediaPatch(current, { error: "Reconnect the active camera angle before exporting." }));
      return false;
    }
    const draft = state.mediaProduction?.export || {};
    const draftManifest = buildMediaExportManifest(state, { title: draft.title, preset: draft.preset });
    const overlaySpec = buildMediaOverlaySpec(state, {
      range: draftManifest.range,
      preset: draftManifest.preset,
    });
    let manifest = draftManifest;
    exportAbort = new AbortController();
    activeJob = null;
    updateState((current) => mediaPatch(current, { export: { ...draft, id: draftManifest.exportId, status: "rendering", stage: "compositing", progress: 0.01, result: null, error: "" }, error: "" }));
    try {
      const overlaySha256 = overlaySpec.primitives.length
        ? await manifestSha256(overlaySpec, win()?.crypto || globalThis.crypto)
        : "";
      manifest = {
        ...draftManifest,
        analysis: {
          ...draftManifest.analysis,
          compositeMode: overlaySpec.primitives.length ? "burn-in" : "source-only",
          compositePrimitiveCount: overlaySpec.primitives.length,
          overlaySha256,
          overlayTruncated: overlaySpec.truncated,
        },
      };
      let result = await renderLocalMediaExport({
        manifest,
        overlaySpec,
        videoRef: reference,
        win: win(),
        signal: exportAbort.signal,
        onQueued: (job) => { activeJob = job; },
        onProgress: (progress) => updateState((current) => mediaPatch(current, {
          export: { ...(current.mediaProduction?.export || {}), status: "rendering", stage: progress.stage, progress: progress.ratio },
        })),
      });
      let warning = "";
      try {
        const saved = await options.repository.saveExportManifest({
          matchId: manifest.source.matchId,
          videoId: manifest.source.videoId,
          sourceId: manifest.source.sourceId,
          angleId: angle?.revision ? angle.id : "",
          presentationId: manifest.analysis.presentationId,
          presentationItemId: manifest.analysis.presentationItemId,
          clipId: manifest.analysis.clipId,
          title: manifest.title,
          startMs: manifest.range.startMs,
          endMs: manifest.range.endMs,
          preset: manifest.preset,
          manifestSha256: result.manifestSha256,
          outputSha256: result.sha256,
          outputSizeBytes: result.sizeBytes,
          renderedAt: new Date().toISOString(),
          layerSummary: manifest.analysis,
        });
        result = { ...result, exportManifestId: saved?.exportManifest?.id || "" };
      } catch {
        warning = "Render complete. Central export metadata is pending sync.";
      }
      updateState((current) => mediaPatch(current, {
        export: { ...(current.mediaProduction?.export || {}), status: "ready", stage: "complete", progress: 1, result, error: "" },
        error: warning,
      }));
      return true;
    } catch (error) {
      updateState((current) => mediaPatch(current, {
        export: { ...(current.mediaProduction?.export || {}), status: error?.name === "AbortError" ? "cancelled" : "error", stage: "", progress: 0, error: error.message || "Export failed." },
      }));
      return false;
    } finally {
      activeJob = null;
      exportAbort = null;
    }
  }

  async function cancelExport() {
    if (activeJob) await cancelLocalMediaExport(activeJob, win()).catch(() => false);
    exportAbort?.abort();
    return true;
  }

  function handleClick(event) {
    const target = eventElement(event);
    const panel = target?.closest?.("[data-video-analysis-media-panel]")?.dataset?.videoAnalysisMediaPanel;
    if (panel) return openPanel(panel);
    const actionNode = target?.closest?.("[data-video-analysis-media-action]");
    const action = actionNode?.dataset?.videoAnalysisMediaAction;
    if (!action) return false;
    if (action === "toggle") return openPanel("toggle");
    if (action === "add-angle" || action === "reconnect") {
      const id = actionNode.dataset.videoAnalysisMediaAngle || "";
      getRoot()?.querySelector?.(`[data-video-analysis-media-angle-file="${id}"]`)?.click?.();
      return true;
    }
    if (action === "select-angle") return selectAngle(actionNode.dataset.videoAnalysisMediaAngle);
    if (action === "view-single" || action === "view-compare") {
      updateState((state) => mediaPatch(state, { viewMode: action === "view-compare" ? "compare" : "single" }));
      seekAfterPaint(options.getCurrentMatchMs?.() ?? getState().timeline?.playheadMs ?? 0);
      return true;
    }
    if (action === "mark-in" || action === "mark-out") return markReplay(action === "mark-out" ? "out" : "in");
    if (action === "clear-replay") return updateReplay({ inMs: null, outMs: null, loop: false });
    if (action === "toggle-loop") return updateReplay({ loop: !getState().mediaProduction?.replay?.loop });
    if (action === "play-replay") return playReplay();
    if (action === "render") { void renderExport(); return true; }
    if (action === "cancel-export") { void cancelExport(); return true; }
    if (action === "download") return downloadLocalMediaExport(getState().mediaProduction?.export?.result, win());
    if (action === "download-manifest") return downloadLocalMediaManifest(getState().mediaProduction?.export?.result, win());
    return false;
  }

  function handleChange(event) {
    const target = eventElement(event);
    const fileInput = target?.closest?.("[data-video-analysis-media-angle-file]");
    if (fileInput?.files?.[0]) {
      void connectAngleFile(fileInput.files[0], fileInput.dataset.videoAnalysisMediaAngleFile || "");
      fileInput.value = "";
      return true;
    }
    const angleField = target?.closest?.("[data-video-analysis-media-angle-field]");
    if (angleField) {
      void updateAngle(angleField.dataset.videoAnalysisMediaAngle, angleField.dataset.videoAnalysisMediaAngleField, angleField.value);
      return true;
    }
    const field = target?.closest?.("[data-video-analysis-media-field]");
    if (!field) return false;
    const key = field.dataset.videoAnalysisMediaField;
    updateState((state) => mediaPatch(state, key.startsWith("export.")
      ? { export: { ...(state.mediaProduction?.export || {}), [key.slice(7)]: field.value } }
      : { [key]: field.value }));
    return true;
  }

  return { connectAngleFile, handleChange, handleClick, handleVideoTimeUpdate, initialize, syncSecondaryVideos };
}
