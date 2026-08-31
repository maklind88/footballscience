import {
  createTrackingGroundTruthSceneReview,
  reviewTrackingGroundTruthSceneFrame,
  trackingGroundTruthSceneReviewCheckpointAt,
  trackingGroundTruthSceneReviewProgress,
} from "../services/trackingGroundTruthSceneReviewService.js";
import { trackingGroundTruthCheckpointDiagnostics } from "../services/trackingGroundTruthCheckpointService.js";
import { selectedTrackingItem } from "./trackingControllerHelpers.js";

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

  function selectedContext() {
    const state = getState();
    const item = selectedTrackingItem(state);
    const itemId = String(item?.id || "");
    return { state, item, itemId, context: contextFor(state), truth: groundTruthState(state, itemId) };
  }

  function update(itemId, patch) {
    updateState((state) => patchGroundTruth(state, itemId, patch));
  }

  function markAndNext() {
    const { state, item, itemId, context, truth } = selectedContext();
    if (!itemId || truth.status === "locked") return false;
    const atMs = trackingGroundTruthSceneReviewCheckpointAt(context, currentAtMs(state));
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
    const { itemId, context, truth } = selectedContext();
    if (!itemId) return false;
    const progress = trackingGroundTruthSceneReviewProgress(truth.sceneReview, context);
    if (progress.nextAtMs != null) seekToMatchMs(progress.nextAtMs);
    return true;
  }

  function reset() {
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

  return { invalidate, markAndNext, reset, seekNext, setAttested };
}
