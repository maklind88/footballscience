import { normalizeObjectTrack } from "../domain/tracking.model.js";
import {
  groundTruthReadiness,
  trackingGroundTruthEntry,
} from "./trackingGroundTruthService.js";
import {
  groundTruthSuiteReadiness,
  trackingGroundTruthSuiteEntry,
} from "./trackingGroundTruthSuiteService.js";
import { trackingGroundTruthCheckpointDiagnostics } from "./trackingGroundTruthCheckpointService.js";
import {
  trackingGroundTruthSceneReviewProgress,
  trackingGroundTruthSceneReviewTimes,
} from "./trackingGroundTruthSceneReviewService.js";

const fingerprintPattern = /^[a-f0-9]{64}$/i;

function stage(id, label, status, detail) {
  return { id, label, status, detail };
}

function action(id, label, data = {}) {
  return { id, label, data };
}

function firstCheckpointIssue(tracks, truth, benchmarkType) {
  for (const atMs of trackingGroundTruthSceneReviewTimes(truth)) {
    const diagnostics = trackingGroundTruthCheckpointDiagnostics({
      tracks,
      selectedTrackIds: truth.selectedTrackIds || [],
      benchmarkType,
      atMs,
    });
    if (diagnostics.issues.length) return { atMs, ...diagnostics.issues[0] };
  }
  return null;
}

function suggestionActions(review = {}) {
  if (review.current && !review.current.savedForCorrection) return [
    action(
      "preannotation-accept",
      review.current.entityType === "person" ? "Accept as person" : "Accept suggestion",
    ),
    action("preannotation-reject", "Reject"),
  ];
  if (Number(review.acceptedCount) > 0) {
    return [action("preannotation-save", "Save accepted")];
  }
  if (Number(review.scopePendingCount) > 0) {
    return [action("preannotation-next-batch", "Open next batch")];
  }
  return [];
}

export function trackingGroundTruthReviewStudioState(state = {}, item = null) {
  const tracking = state.presentation?.tracking || {};
  const workspace = tracking.groundTruth || {};
  const truth = trackingGroundTruthEntry(workspace, item?.id);
  const suite = trackingGroundTruthSuiteEntry(workspace);
  const suiteReadiness = groundTruthSuiteReadiness(suite);
  const review = tracking.preannotationReview || {};
  const campaignCase = review.campaign?.cases?.find((entry) => entry.caseId === review.caseId);
  const tracks = (item?.objectTracks || []).map(normalizeObjectTrack).filter((track) => (
    track.status !== "archived" && track.metadata?.preannotationReviewPreview !== true
  ));
  const locked = truth.status === "locked" && Boolean(truth.lockedArtifact);
  const sourceReady = fingerprintPattern.test(String(truth.sourceFingerprint || ""))
    && Number(truth.frame?.width) > 0
    && Number(truth.frame?.height) > 0;
  const workspaceReady = Boolean(review.workspaceSha256);
  const campaignDecisionsComplete = Boolean(
    campaignCase?.complete
    && campaignCase.reviewEffortCoverage === "complete"
    && Number(campaignCase.savedCount) > 0,
  );
  const unresolvedRoles = tracks.filter((track) => (
    track.metadata?.preannotationReviewState === "saved-review"
    && track.metadata?.preannotationWorkspaceSha256 === review.workspaceSha256
    && track.metadata?.preannotationCaseId === review.caseId
    && ["person", "unknown"].includes(track.entityType)
  ));
  const decisionsComplete = campaignDecisionsComplete && unresolvedRoles.length === 0;
  const referencePrepared = Boolean(truth.workloadEvidence && (truth.selectedTrackIds || []).length);
  const scene = trackingGroundTruthSceneReviewProgress(truth.sceneReview, truth);
  const readiness = locked ? { ready: true, issues: [] } : groundTruthReadiness({
    ...truth,
    tracks,
    selectedTrackIds: truth.selectedTrackIds || [],
    benchmarkType: suite.benchmarkType,
    reviewedBy: "local-analyst",
    requireSceneReview: true,
  });
  const evaluation = tracking.benchmarkEvaluation || {};
  const evaluationComplete = ["passed", "failed"].includes(evaluation.status)
    && Boolean(evaluation.evidenceSet);
  const stages = [
    stage("workspace", "Workspace", workspaceReady ? "complete" : sourceReady ? "active" : "blocked",
      workspaceReady ? `Matched ${review.caseId || "case"}` : sourceReady ? "Open sealed Match 11 evidence" : "Reconnect the normalized case video"),
    stage("decisions", "Decisions", decisionsComplete ? "complete" : workspaceReady ? "active" : "pending",
      decisionsComplete
        ? `${campaignCase.savedCount} saved tracks`
        : unresolvedRoles.length
          ? `${unresolvedRoles.length} saved roles unresolved`
          : workspaceReady ? `${Number(review.pendingCount) || 0} suggestions pending` : "Waiting for workspace"),
    stage("scene", "Scene review", scene.complete ? "complete" : decisionsComplete ? "active" : "pending",
      scene.complete ? `${scene.expectedSampleCount} checkpoints reviewed` : decisionsComplete ? `${scene.reviewedSampleCount}/${scene.expectedSampleCount} checkpoints` : "Waiting for decisions"),
    stage("lock", "Reference", locked ? "complete" : scene.complete ? "active" : "pending",
      locked ? `Locked revision ${truth.revision || 1}` : scene.complete ? readiness.issues[0]?.message || "Ready for attestation" : "Waiting for scene review"),
    stage("measure", "Measurement", evaluationComplete ? "complete" : suiteReadiness.ready ? "active" : "pending",
      evaluationComplete ? "TrackEval evidence complete" : suiteReadiness.ready ? "Ready to run TrackEval" : `${suiteReadiness.caseCount}/5 cases | ${(suiteReadiness.uniqueDurationMs / 60_000).toFixed(1)}/10.0 min`),
  ];

  let next = {
    title: "Reconnect case video",
    detail: "The source fingerprint and video frame must be available before evidence can be opened.",
    actions: [action("ground-truth-refresh", "Refresh evidence")],
  };
  if (sourceReady && !workspaceReady) {
    next = {
      title: "Open review workspace",
      detail: "Choose the self-contained ByteTrack 0.4 workspace folder. The matching case is selected by source hash.",
      actions: [action("preannotation-open", "Open workspace")],
    };
  } else if (workspaceReady && !decisionsComplete) {
    next = campaignDecisionsComplete && unresolvedRoles.length ? {
      title: "Classify saved person roles",
      detail: `${unresolvedRoles.length} saved track${unresolvedRoles.length === 1 ? "" : "s"} must become player or referee before ground truth.`,
      actions: [{ label: "Review first role", trackId: unresolvedRoles[0].id }],
    } : {
      title: review.current ? "Resolve current suggestion" : "Continue suggestion review",
      detail: review.current
        ? `${review.current.entityType || "Object"} at ${((Number(review.current.atMs) || 0) / 1000).toFixed(2)}s`
        : "Open the next bounded review batch.",
      actions: suggestionActions(review),
    };
  } else if (decisionsComplete && !referencePrepared && !locked) {
    next = {
      title: "Prepare independent reference",
      detail: "Copy only the saved review tracks into a separate ground-truth draft.",
      actions: [action("ground-truth-use-preannotation-case", "Prepare ground truth")],
    };
  } else if (referencePrepared && !scene.complete && !locked) {
    const issue = firstCheckpointIssue(tracks, truth, suite.benchmarkType);
    next = issue ? {
      title: "Resolve first checkpoint issue",
      detail: `${issue.label} at ${(issue.atMs / 1000).toFixed(1)}s`,
      actions: [action("ground-truth-checkpoint-select", "Review issue", {
        videoAnalysisGroundTruthTrackId: issue.trackId,
        videoAnalysisGroundTruthAtMs: issue.atMs,
      })],
    } : {
      title: "Review next scene checkpoint",
      detail: "Inspect every visible player, ball and referee before confirming the frame.",
      actions: [
        action("ground-truth-scene-next", "Go to checkpoint"),
        action("ground-truth-scene-review", "Confirm & next"),
      ],
    };
  } else if (scene.complete && !locked) {
    next = readiness.ready ? {
      title: "Lock reviewed reference",
      detail: "The immutable artifact will preserve tracks, review evidence and source identity.",
      actions: [action("ground-truth-lock", "Lock reference")],
    } : {
      title: "Complete reference requirements",
      detail: readiness.issues[0]?.message || "Complete the final attestations in the reference panel.",
      actions: [],
    };
  } else if (locked && !suiteReadiness.ready) {
    next = {
      title: "Continue the real-match suite",
      detail: suiteReadiness.issues[0]?.message || "Connect the next representative match case.",
      actions: [],
    };
  } else if (suiteReadiness.ready && !evaluationComplete) {
    next = {
      title: "Run independent measurement",
      detail: "TrackEval will evaluate the sealed provider runs against the locked reference suite.",
      actions: [action("tracking-benchmark-run", "Run benchmark")],
    };
  } else if (evaluationComplete) {
    next = {
      title: "Evidence complete",
      detail: evaluation.status === "passed" ? "The provider passed the configured evidence gate." : "Use the measured failures for the next tracking iteration.",
      actions: [],
    };
  }

  return {
    caseId: review.caseId || truth.itemId || "No case",
    campaign: {
      caseCount: Math.max(0, Number(review.campaign?.caseCount) || 0),
      completeCaseCount: Math.max(0, Number(review.campaign?.completeCaseCount) || 0),
    },
    currentStageId: stages.find((entry) => entry.status !== "complete")?.id || "measure",
    stages,
    next,
  };
}
