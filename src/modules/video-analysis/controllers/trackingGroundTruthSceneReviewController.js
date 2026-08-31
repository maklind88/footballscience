import {
  createTrackingGroundTruthSceneReview,
  reviewTrackingGroundTruthSceneFrame,
  trackingGroundTruthSceneReviewProgress,
} from "../services/trackingGroundTruthSceneReviewService.js";
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
    const itemId = String(selectedTrackingItem(state)?.id || "");
    return { state, itemId, context: contextFor(state), truth: groundTruthState(state, itemId) };
  }

  function update(itemId, patch) {
    updateState((state) => patchGroundTruth(state, itemId, patch));
  }

  function markAndNext() {
    const { state, itemId, context, truth } = selectedContext();
    if (!itemId || truth.status === "locked") return false;
    const sceneReview = reviewTrackingGroundTruthSceneFrame(
      truth.sceneReview,
      context,
      currentAtMs(state),
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
