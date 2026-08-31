import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
  trackingGroundTruthEntry,
} from "../services/trackingGroundTruthService.js";
import { trackingGroundTruthSuiteEntry } from "../services/trackingGroundTruthSuiteService.js";
import { createTrackingGroundTruthSceneReview } from "../services/trackingGroundTruthSceneReviewService.js";
import { createTrackingReviewWorkloadEvidence } from "../services/trackingReviewWorkloadEvidenceService.js";
import { patchTrackingState, selectedTrackingItem } from "./trackingControllerHelpers.js";

const actionName = "ground-truth-use-preannotation-case";

function patchDraft(state = {}, itemId = "", patch = {}) {
  const workspace = state.presentation?.tracking?.groundTruth || {};
  return patchTrackingState(state, {
    groundTruth: {
      ...workspace,
      byItemId: {
        ...(workspace.byItemId || {}),
        [itemId]: {
          ...trackingGroundTruthEntry(workspace, itemId),
          itemId,
          ...patch,
        },
      },
    },
  });
}

function matchingSavedTracks(item = {}, review = {}, context = {}) {
  return (item.objectTracks || []).map(normalizeObjectTrack).filter((track) => (
    track.status !== "archived"
    && track.metadata?.preannotationReviewPreview !== true
    && track.metadata?.preannotationReviewState === "saved-review"
    && track.metadata?.preannotationWorkspaceSha256 === review.workspaceSha256
    && track.metadata?.preannotationCaseId === review.caseId
    && track.metadata?.localSourceSha256 === context.sourceFingerprint
    && (!track.metadata?.angleId || track.metadata.angleId === context.angleId)
  ));
}

export function createTrackingGroundTruthPreannotationBridgeController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const getContext = options.getContext || (() => ({}));

  function fail(itemId, message) {
    updateState((state) => patchDraft(state, itemId, { error: message }));
    return true;
  }

  function useReviewedCase() {
    const state = getState();
    const item = selectedTrackingItem(state);
    if (!item?.id) return false;
    const tracking = state.presentation?.tracking || {};
    const review = tracking.preannotationReview || {};
    const campaignCase = review.campaign?.cases?.find((entry) => entry.caseId === review.caseId);
    const suite = trackingGroundTruthSuiteEntry(tracking.groundTruth || {});
    const truth = trackingGroundTruthEntry(tracking.groundTruth || {}, item.id);
    if (suite.benchmarkType !== TRACKING_BENCHMARK_TYPE_MULTI_OBJECT) {
      return fail(item.id, "Choose Full scene before using a reviewed preannotation case.");
    }
    if (truth.status === "locked") {
      return fail(item.id, "Start a new draft before replacing the locked reference selection.");
    }
    const counts = ["pendingCount", "acceptedCount", "rejectedCount", "savedCount"]
      .map((key) => Math.max(0, Number(review[key]) || 0));
    const campaignCountsMatch = campaignCase
      && ["pendingCount", "acceptedCount", "rejectedCount", "savedCount"]
        .every((key) => Number(campaignCase[key]) === Number(review[key]))
      && Number(campaignCase.totalSuggestionCount) === counts.reduce((sum, value) => sum + value, 0)
      && review.campaign?.workspaceSha256 === review.workspaceSha256;
    if (!campaignCase?.complete || !campaignCountsMatch || counts[0] !== 0 || counts[1] !== 0) {
      return fail(item.id, "Finish and save every preannotation decision before preparing ground truth.");
    }
    const context = getContext(state);
    let tracks;
    try {
      tracks = matchingSavedTracks(item, review, context);
    } catch (error) {
      return fail(item.id, error?.message || "Saved preannotation tracks could not be validated.");
    }
    if (!tracks.length) {
      return fail(item.id, "No saved tracks from this sealed case are available for ground truth.");
    }
    const unresolvedRoleCount = tracks.filter((track) => (
      track.entityType === "person" || track.entityType === "unknown"
    )).length;
    if (unresolvedRoleCount) {
      return fail(
        item.id,
        `Classify ${unresolvedRoleCount} saved person track${unresolvedRoleCount === 1 ? "" : "s"} as player or referee before preparing ground truth.`,
      );
    }
    let workloadEvidence;
    try {
      workloadEvidence = createTrackingReviewWorkloadEvidence({
        sourceFingerprint: context.sourceFingerprint,
        workspaceSha256: review.workspaceSha256,
        packId: review.campaign?.packId,
        caseId: review.caseId,
        angleId: context.angleId,
        range: context.range,
        totalSuggestionCount: campaignCase.totalSuggestionCount,
        rejectedCount: campaignCase.rejectedCount,
        savedCount: campaignCase.savedCount,
        reviewEffort: campaignCase.reviewEffort,
      }, { expectedSavedTrackCount: tracks.length });
    } catch (error) {
      return fail(item.id, error?.message || "Saved preannotation workload could not be validated.");
    }
    const selectedTrackIds = [...new Set(tracks.map((track) => track.id))];
    const benchmarkTargetTrackId = selectedTrackIds.includes(truth.benchmarkTargetTrackId)
      ? truth.benchmarkTargetTrackId
      : tracks.find((track) => track.entityType === "player")?.id || "";
    updateState((current) => patchDraft(current, item.id, {
      ...context,
      status: "draft",
      selectedTrackIds,
      benchmarkTargetTrackId,
      workloadEvidence,
      sceneReview: createTrackingGroundTruthSceneReview(context),
      attested: false,
      exhaustiveSceneAttested: false,
      error: "",
    }));
    options.onEvidenceChanged?.();
    return true;
  }

  return {
    handleAction: (action = "") => action === actionName ? useReviewedCase() : false,
  };
}
