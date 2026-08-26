import { activeMediaAngle } from "../services/mediaProductionService.js";
import {
  createGroundTruthArtifact,
  groundTruthArtifactJson,
  trackingGroundTruthEntry,
} from "../services/trackingGroundTruthService.js";
import {
  patchTrackingState,
  selectedTrackingItem,
  trackingItemRange,
} from "./trackingControllerHelpers.js";

const groundTruthActions = new Set([
  "ground-truth-toggle",
  "ground-truth-refresh",
  "ground-truth-lock",
  "ground-truth-download",
  "ground-truth-new",
]);

function groundTruthState(state = {}, itemId = "") {
  return trackingGroundTruthEntry(state.presentation?.tracking?.groundTruth || {}, itemId);
}

function patchGroundTruth(state = {}, itemId = "", patch = {}) {
  const workspace = state.presentation?.tracking?.groundTruth || {};
  return patchTrackingState(state, {
    groundTruth: {
      ...workspace,
      byItemId: {
        ...(workspace.byItemId || {}),
        [itemId]: { ...groundTruthState(state, itemId), itemId, ...patch },
      },
    },
  });
}

export function trackingSourceFingerprint(state = {}) {
  const angle = activeMediaAngle(state);
  const proxyFingerprint = String(
    state.mediaProduction?.proxy?.byAngleId?.[angle?.id]?.result?.sourceSha256 || "",
  ).trim();
  if (/^[a-f0-9]{64}$/i.test(proxyFingerprint)) return proxyFingerprint;
  const item = selectedTrackingItem(state);
  const trackedFingerprint = (item?.objectTracks || []).find((track) => {
    const value = String(track.metadata?.localSourceSha256 || "");
    const trackAngleId = String(track.metadata?.angleId || "");
    return /^[a-f0-9]{64}$/i.test(value) && (!angle?.id || !trackAngleId || trackAngleId === angle.id);
  })?.metadata?.localSourceSha256;
  return String(trackedFingerprint || "").trim();
}

export function trackingFrameSize(video = null) {
  const width = Math.max(0, Math.round(Number(video?.videoWidth) || 0));
  const height = Math.max(0, Math.round(Number(video?.videoHeight) || 0));
  return { width, height };
}

function reviewerId(value = null) {
  if (typeof value === "string") return value.trim();
  return String(value?.id || value?.userId || value?.user_id || "local-analyst").trim();
}

export function createTrackingGroundTruthController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getVideoElement = options.getVideoElement || (() => null);
  const getWindow = options.getWindow || (() => globalThis.window);
  const getReviewer = options.getReviewer || (() => "local-analyst");
  const now = options.now || Date.now;

  function contextFor(state = getState()) {
    const item = selectedTrackingItem(state);
    const angle = activeMediaAngle(state);
    return {
      itemId: String(item?.id || ""),
      angleId: String(angle?.id || ""),
      sourceFingerprint: trackingSourceFingerprint(state),
      frame: trackingFrameSize(getVideoElement()),
      range: trackingItemRange(item || {}),
    };
  }

  function refreshContext() {
    const context = contextFor();
    if (!context.itemId) return false;
    updateState((state) => patchGroundTruth(state, context.itemId, { ...context, error: "" }));
    return true;
  }

  function toggleSelectedTrack() {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    const truth = groundTruthState(state, itemId);
    const trackId = state.presentation?.tracking?.selectedTrackIds?.[0] || "";
    if (!itemId || !trackId) return false;
    if (truth.status === "locked") {
      updateState((current) => patchGroundTruth(current, itemId, {
        error: "Start a new draft before changing the locked reference.",
      }));
      return true;
    }
    const selected = new Set((truth.selectedTrackIds || []).map(String));
    if (selected.has(trackId)) selected.delete(trackId);
    else selected.add(trackId);
    const context = contextFor(state);
    updateState((current) => patchGroundTruth(current, itemId, {
      ...context,
      status: "draft",
      selectedTrackIds: [...selected],
      attested: false,
      error: "",
    }));
    return true;
  }

  function setAttested(checked = false) {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    if (!itemId || groundTruthState(state, itemId).status === "locked") return false;
    updateState((current) => patchGroundTruth(current, itemId, { attested: Boolean(checked), error: "" }));
    return true;
  }

  function lockReference() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const truth = groundTruthState(state, item?.id);
    if (!item || truth.status === "locked") return false;
    const context = contextFor(state);
    try {
      const artifact = createGroundTruthArtifact({
        ...context,
        tracks: item.objectTracks || [],
        selectedTrackIds: truth.selectedTrackIds || [],
        attested: truth.attested === true,
        reviewedBy: reviewerId(getReviewer()),
        revision: truth.revision || 1,
      }, { now });
      updateState((current) => patchGroundTruth(current, item.id, {
        ...context,
        status: "locked",
        lockedArtifact: artifact,
        lockedAt: artifact.reviewEvidence.reviewedAt,
        error: "",
      }));
      return true;
    } catch (error) {
      updateState((current) => patchGroundTruth(current, item.id, {
        ...context,
        error: error?.message || "The benchmark reference could not be locked.",
      }));
      return true;
    }
  }

  function downloadReference() {
    const state = getState();
    const itemId = selectedTrackingItem(state)?.id || "";
    const artifact = groundTruthState(state, itemId).lockedArtifact;
    if (!artifact) return false;
    const win = getWindow();
    const anchor = win?.document?.createElement?.("a");
    const BlobConstructor = win?.Blob || globalThis.Blob;
    if (!anchor || !BlobConstructor || !win?.URL?.createObjectURL) return false;
    const objectUrl = win.URL.createObjectURL(new BlobConstructor(
      [groundTruthArtifactJson(artifact)],
      { type: "application/json" },
    ));
    anchor.href = objectUrl;
    anchor.download = `fs-player-${artifact.id}.json`;
    anchor.rel = "noopener";
    win.document.body?.appendChild?.(anchor);
    anchor.click();
    anchor.remove?.();
    win.setTimeout?.(() => win.URL.revokeObjectURL?.(objectUrl), 0);
    updateState((current) => patchGroundTruth(current, itemId, { downloadedAt: new Date(now()).toISOString(), error: "" }));
    return true;
  }

  function newDraft() {
    const state = getState();
    const context = contextFor();
    if (!context.itemId) return false;
    const truth = groundTruthState(state, context.itemId);
    updateState((current) => patchGroundTruth(current, context.itemId, {
      ...context,
      status: "draft",
      revision: Math.max(1, Math.round(Number(truth.revision) || 1)) + 1,
      selectedTrackIds: [],
      attested: false,
      lockedArtifact: null,
      lockedAt: "",
      downloadedAt: "",
      error: "",
    }));
    return true;
  }

  function handleAction(action = "") {
    if (!groundTruthActions.has(action)) return false;
    if (action === "ground-truth-toggle") return toggleSelectedTrack();
    if (action === "ground-truth-refresh") return refreshContext();
    if (action === "ground-truth-lock") return lockReference();
    if (action === "ground-truth-download") return downloadReference();
    return newDraft();
  }

  function handleField(field = "", element = {}) {
    return field === "groundTruthAttested" ? setAttested(element.checked) : false;
  }

  return {
    handleAction,
    handleField,
    refreshContext,
  };
}
