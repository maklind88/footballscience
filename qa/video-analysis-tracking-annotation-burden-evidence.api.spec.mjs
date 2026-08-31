import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFingerprint = "a".repeat(64);
const workspaceSha256 = "b".repeat(64);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function track(id, source, corrections = [], metadata = {}) {
  return {
    id,
    entityType: "player",
    playerId: id,
    playerLabel: id,
    teamSide: "home",
    status: "verified",
    startMs: 0,
    endMs: 1000,
    segments: [{
      id: `${id}-segment`,
      startMs: 0,
      endMs: 1000,
      points: [
        { atMs: 0, x: 0.2, y: 0.4, width: 0.08, height: 0.16, groundX: 0.2, groundY: 0.56, source },
        { atMs: 1000, x: 0.3, y: 0.4, width: 0.08, height: 0.16, groundX: 0.3, groundY: 0.56, source },
      ],
    }],
    corrections,
    metadata,
  };
}

test("annotation burden binds preannotation provenance and deduplicates correction operations", async () => {
  const burden = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingAnnotationBurdenEvidenceService.js",
  ));
  const workload = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingReviewWorkloadEvidenceService.js",
  ));
  const workloadEvidence = workload.createTrackingReviewWorkloadEvidence({
    sourceFingerprint,
    workspaceSha256,
    packId: "real-match-pack",
    caseId: "transition-1",
    angleId: "angle-1",
    range: { startMs: 0, endMs: 1000 },
    totalSuggestionCount: 3,
    rejectedCount: 1,
    savedCount: 2,
    reviewEffort: {
      coverage: "complete",
      openedCount: 1,
      acceptActionCount: 2,
      rejectActionCount: 1,
      undoActionCount: 0,
      deferActionCount: 0,
      correctionHandoffCount: 1,
      batchSaveActionCount: 1,
      savedTrackActionCount: 2,
      firstOpenedAt: "2026-08-31T12:00:00.000Z",
      lastActionAt: "2026-08-31T12:10:00.000Z",
    },
  });
  const preannotation = {
    localSourceSha256: sourceFingerprint,
    angleId: "angle-1",
    preannotationReviewState: "saved-review",
    preannotationWorkspaceSha256: workspaceSha256,
    preannotationCaseId: "transition-1",
  };
  const sourceTracks = [
    track("p1", "automatic", [
      { id: "split-op:prefix", startMs: 500, correctionType: "split" },
      { id: "position-op", startMs: 750, correctionType: "position" },
    ], preannotation),
    track("p2", "manual", [
      { id: "split-op:suffix", startMs: 500, correctionType: "split" },
      { id: "identity-op", startMs: 800, correctionType: "identity" },
    ], preannotation),
    track("p3", "interpolated"),
  ];
  const artifactTracks = sourceTracks.map((entry) => ({ ...entry, corrections: [], metadata: {} }));
  const reviewEvidence = { sceneReview: { reviewedSampleCount: 3 } };
  const evidence = burden.createTrackingAnnotationBurdenEvidence({
    sourceFingerprint,
    angleId: "angle-1",
    range: { startMs: 0, endMs: 1000 },
    sourceTracks,
    artifactTracks,
    workloadEvidence,
    reviewEvidence,
  });

  expect(evidence).toMatchObject({
    protocol: "football-science-tracking-annotation-burden-evidence-v1",
    workloadBound: true,
    trackSummary: {
      selectedTrackCount: 3,
      preannotationRetainedTrackCount: 2,
      nonPreannotationTrackCount: 1,
      preannotationSavedCount: 2,
      preannotationExcludedTrackCount: 0,
      addedOutsidePreannotationCount: 1,
    },
    pointSummary: {
      pointCount: 6,
      automaticPointCount: 2,
      manualPointCount: 2,
      interpolatedPointCount: 2,
      manualPointRatio: 0.3333,
    },
    correctionSummary: {
      correctionRecordCount: 4,
      correctionOperationCount: 3,
      byType: { split: 1, position: 1, identity: 1 },
    },
    reviewSummary: { reviewedCheckpointCount: 3 },
  });
  expect(burden.validateTrackingAnnotationBurdenEvidence(structuredClone(evidence), {
    sourceFingerprint,
    angleId: "angle-1",
    range: { startMs: 0, endMs: 1000 },
    tracks: artifactTracks,
    workloadEvidence,
    reviewEvidence,
  })).toEqual(evidence);

  const hiddenField = structuredClone(evidence);
  hiddenField.privatePath = "/private/match.mp4";
  expect(() => burden.validateTrackingAnnotationBurdenEvidence(hiddenField)).toThrow(/unsupported field/i);
  const forgedPoints = structuredClone(evidence);
  forgedPoints.pointSummary.manualPointCount += 1;
  expect(() => burden.validateTrackingAnnotationBurdenEvidence(forgedPoints, {
    tracks: artifactTracks,
    workloadEvidence,
    reviewEvidence,
  })).toThrow(/point summary/i);
  const forgedCorrections = structuredClone(evidence);
  forgedCorrections.correctionSummary.byType.position += 1;
  expect(() => burden.validateTrackingAnnotationBurdenEvidence(forgedCorrections, {
    tracks: artifactTracks,
    workloadEvidence,
    reviewEvidence,
  })).toThrow(/does not reconcile/i);
  expect(() => burden.validateTrackingAnnotationBurdenEvidence(evidence, {
    sourceFingerprint: "c".repeat(64),
  })).toThrow(/another source/i);
  expect(() => burden.validateTrackingAnnotationBurdenEvidence(evidence, {
    range: { startMs: 0, endMs: 900 },
  })).toThrow(/another benchmark range/i);
});
