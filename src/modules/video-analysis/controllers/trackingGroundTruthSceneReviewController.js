import {
  createTrackingGroundTruthSceneReview,
  reviewTrackingGroundTruthSceneFrame,
  trackingGroundTruthSceneReviewCheckpointAt,
  trackingGroundTruthSceneReviewProgress,
} from "../services/trackingGroundTruthSceneReviewService.js";
import { trackingGroundTruthCheckpointDiagnostics } from "../services/trackingGroundTruthCheckpointService.js";
import { shouldIgnoreShortcutTarget } from "../services/codingTemplateService.js";
import { trackingReviewerIdentityReady } from "../services/trackingReviewerIdentityService.js";
import { selectedTrackingItem } from "./trackingControllerHelpers.js";
import { createTrackingContextReplayController } from "./trackingContextReplayController.js";

const SCENE_REVIEW_SHORTCUTS = Object.freeze({
  n: "next",
  p: "preview",
  v: "verify",
});

export function createTrackingGroundTruthSceneReviewController(options = {}) {
  const {
    contextFor,
    currentAtMs,
    getState,
    groundTruthState,
    patchGroundTruth,
    seekToMatchMs,
    updateState,
  } = options;
  const contextReplay = createTrackingContextReplayController(options);

  function selectedContext() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const itemId = String(item?.id || "");
    const truth = groundTruthState(state, itemId);
    const context = { ...contextFor(state), reviewedBy: truth.reviewedBy };
    return { state, item, itemId, context, truth };
  }

  function update(itemId, patch) {
    updateState((state) => patchGroundTruth(state, itemId, patch));
  }

  function checkpointAt(context, state, requestedAtMs = null) {
    const requested = Number(requestedAtMs);
    const hasRequestedCheckpoint = requestedAtMs !== null
      && requestedAtMs !== undefined
      && requestedAtMs !== ""
      && Number.isFinite(requested);
    return trackingGroundTruthSceneReviewCheckpointAt(
      context,
      hasRequestedCheckpoint ? requested : currentAtMs(state),
    );
  }

  function markAndNext(requestedAtMs = null) {
    contextReplay.stop();
    const { state, item, itemId, context, truth } = selectedContext();
    if (!itemId || truth.status === "locked") return false;
    if (!trackingReviewerIdentityReady(context.reviewedBy)) {
      update(itemId, {
        attested: false,
        exhaustiveSceneAttested: false,
        error: "Enter a named human reviewer before marking scene checkpoints.",
      });
      return true;
    }
    const atMs = checkpointAt(context, state, requestedAtMs);
    const diagnostics = trackingGroundTruthCheckpointDiagnostics({
      tracks: item?.objectTracks || [],
      selectedTrackIds: truth.selectedTrackIds || [],
      benchmarkType: context.benchmarkType,
      atMs,
    });
    if (diagnostics.issues.length) {
      update(itemId, {
        attested: false,
        exhaustiveSceneAttested: false,
        error: `Resolve ${diagnostics.issues.length} known checkpoint issue${diagnostics.issues.length === 1 ? "" : "s"} before review.`,
      });
      seekToMatchMs(atMs);
      return true;
    }
    const sceneReview = reviewTrackingGroundTruthSceneFrame(
      truth.sceneReview,
      context,
      atMs,
    );
    const progress = trackingGroundTruthSceneReviewProgress(sceneReview, context);
    update(itemId, {
      sceneReview,
      attested: false,
      exhaustiveSceneAttested: false,
      error: "",
    });
    if (progress.nextAtMs != null) seekToMatchMs(progress.nextAtMs);
    return true;
  }

  function seekNext() {
    contextReplay.stop();
    const { itemId, context, truth } = selectedContext();
    if (!itemId) return false;
    const progress = trackingGroundTruthSceneReviewProgress(truth.sceneReview, context);
    if (progress.nextAtMs != null) seekToMatchMs(progress.nextAtMs);
    return true;
  }

  function reset() {
    contextReplay.stop();
    const { itemId, context, truth } = selectedContext();
    if (!itemId || truth.status === "locked") return false;
    update(itemId, {
      sceneReview: createTrackingGroundTruthSceneReview(context),
      attested: false,
      exhaustiveSceneAttested: false,
      error: "",
    });
    return true;
  }

  function setAttested(checked = false, exhaustive = false) {
    contextReplay.stop();
    const { itemId, context, truth } = selectedContext();
    if (!itemId || truth.status === "locked") return false;
    if (checked && !trackingGroundTruthSceneReviewProgress(truth.sceneReview, context).complete) {
      update(itemId, {
        ...(exhaustive ? { exhaustiveSceneAttested: false } : { attested: false }),
        error: "Complete every scene review checkpoint before attesting the reference.",
      });
      return true;
    }
    update(itemId, {
      ...(exhaustive
        ? { exhaustiveSceneAttested: Boolean(checked) }
        : { attested: Boolean(checked) }),
      error: "",
    });
    return true;
  }

  function invalidate(itemId = "") {
    contextReplay.stop();
    if (!itemId) return false;
    updateState((state) => {
      const truth = groundTruthState(state, itemId);
      return truth.status === "locked" ? state : patchGroundTruth(state, itemId, {
        sceneReview: createTrackingGroundTruthSceneReview(truth),
        attested: false,
        exhaustiveSceneAttested: false,
        error: "",
      });
    });
    return true;
  }

  function previewContext(requestedAtMs = null) {
    const { state, itemId, context, truth } = selectedContext();
    if (!itemId || truth.status === "locked") return false;
    const atMs = checkpointAt(context, state, requestedAtMs);
    return contextReplay.start({
      startMs: atMs,
      endMs: atMs,
      minStartMs: context.range?.startMs,
      maxEndMs: context.range?.endMs,
    });
  }

  function handleShortcut(event = {}) {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey
      || event.altKey || event.shiftKey || shouldIgnoreShortcutTarget(event.target)) return false;
    const command = SCENE_REVIEW_SHORTCUTS[String(event.key || "").toLowerCase()];
    if (!command) return false;
    const { itemId, context, truth } = selectedContext();
    if (!itemId || truth.status === "locked" || !(truth.selectedTrackIds || []).length
    ) return false;
    const progress = trackingGroundTruthSceneReviewProgress(truth.sceneReview, context);
    if (progress.complete || progress.nextAtMs == null) return false;
    const handled = command === "preview"
      ? previewContext(progress.nextAtMs)
      : command === "next"
        ? seekNext()
        : markAndNext(progress.nextAtMs);
    if (!handled) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  return {
    handleShortcut,
    invalidate,
    markAndNext,
    previewContext,
    reset,
    seekNext,
    setAttested,
    stopContextPreview: contextReplay.stop,
  };
}
