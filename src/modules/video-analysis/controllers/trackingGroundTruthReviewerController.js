import { normalizeTrackingReviewerIdentity } from "../services/trackingReviewerIdentityService.js";
import { createTrackingGroundTruthSceneReview } from "../services/trackingGroundTruthSceneReviewService.js";

export function createTrackingGroundTruthReviewerController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getReviewer = options.getReviewer || (() => "");

  function identityFor(truth = {}, preferCurrent = false) {
    const current = normalizeTrackingReviewerIdentity(getReviewer());
    const stored = normalizeTrackingReviewerIdentity(truth.reviewedBy)
      || normalizeTrackingReviewerIdentity(truth.lockedArtifact?.reviewEvidence?.reviewedBy);
    return preferCurrent ? current || stored : stored || current;
  }

  function set(value = "") {
    const state = getState();
    const itemId = options.selectedItemId?.(state) || "";
    const truth = options.groundTruthState?.(state, itemId) || {};
    if (!itemId || truth.status === "locked") return false;
    const reviewedBy = normalizeTrackingReviewerIdentity(value);
    if (reviewedBy && reviewedBy === normalizeTrackingReviewerIdentity(truth.reviewedBy)) {
      updateState((current) => options.patchGroundTruth(current, itemId, { error: "" }));
      return true;
    }
    updateState((current) => options.patchGroundTruth(current, itemId, {
      reviewedBy,
      sceneReview: createTrackingGroundTruthSceneReview({ ...truth, reviewedBy }),
      attested: false,
      exhaustiveSceneAttested: false,
      error: String(value || "").trim() && !reviewedBy
        ? "Enter a named human reviewer or analyst ID."
        : "",
    }));
    return true;
  }

  return { identityFor, set };
}
