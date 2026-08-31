import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSha256 = "a".repeat(64);
const workspaceSha256 = "b".repeat(64);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function savedTrack(id, entityType, metadata = {}, status = "review") {
  return {
    id,
    clipId: "clip-1",
    entityType,
    status,
    startMs: 0,
    endMs: 1000,
    confidence: 0.9,
    identityConfidence: entityType === "player" ? 0.8 : 0,
    engine: "tracking-preannotation-review",
    engineVersion: "1".repeat(16),
    segments: [{
      id: `${id}-segment`,
      startMs: 0,
      endMs: 1000,
      confidence: 0.9,
      points: [
        { atMs: 0, x: 0.3, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9, source: "automatic" },
        { atMs: 1000, x: 0.35, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9, source: "manual" },
      ],
    }],
    corrections: [],
    metadata: {
      preannotationReviewState: "saved-review",
      preannotationWorkspaceSha256: workspaceSha256,
      preannotationCaseId: "transition",
      localSourceSha256: sourceSha256,
      angleId: "primary",
      ...metadata,
    },
  };
}

function state(overrides = {}) {
  const tracks = overrides.tracks || [
    savedTrack("player-1", "player"),
    savedTrack("ball-1", "ball"),
    savedTrack("archived-referee", "referee", {}, "archived"),
    savedTrack("wrong-case", "player", { preannotationCaseId: "other-case" }),
    savedTrack("pending-preview", "player", { preannotationReviewPreview: true }),
    savedTrack("manual-extra", "referee", { preannotationReviewState: "manual" }),
  ];
  return {
    presentation: {
      selectedItemId: "item-1",
      current: {
        sections: [{
          id: "section-1",
          items: [{ id: "item-1", clipId: "clip-1", startMs: 0, endMs: 1000, objectTracks: tracks }],
        }],
      },
      tracking: {
        preannotationReview: {
          status: "complete",
          caseId: "transition",
          workspaceSha256,
          pendingCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          savedCount: 2,
          campaign: {
            workspaceSha256,
            cases: [{
              caseId: "transition",
              totalSuggestionCount: 2,
              pendingCount: 0,
              acceptedCount: 0,
              rejectedCount: 0,
              savedCount: 2,
              complete: true,
            }],
          },
          ...(overrides.review || {}),
        },
        groundTruth: {
          suite: { benchmarkType: overrides.benchmarkType || "multi-object", cases: [] },
          byItemId: {
            "item-1": {
              itemId: "item-1",
              status: overrides.truthStatus || "draft",
              selectedTrackIds: ["manual-extra", "archived-referee"],
              benchmarkTargetTrackId: "",
              attested: true,
              exhaustiveSceneAttested: true,
              error: "",
            },
          },
        },
      },
    },
  };
}

function context() {
  return {
    itemId: "item-1",
    angleId: "primary",
    sourceFingerprint: sourceSha256,
    frame: { width: 1920, height: 1080 },
    range: { startMs: 0, endMs: 1000 },
    benchmarkType: "multi-object",
  };
}

test("completed preannotation selects only exact saved case tracks for full-scene review", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingGroundTruthPreannotationBridgeController.js",
  ));
  let current = state();
  let invalidated = 0;
  const controller = service.createTrackingGroundTruthPreannotationBridgeController({
    getState: () => current,
    updateState: (updater) => { current = updater(current); },
    getContext: context,
    onEvidenceChanged: () => { invalidated += 1; },
  });

  expect(controller.handleAction("ground-truth-use-preannotation-case")).toBe(true);
  expect(current.presentation.tracking.groundTruth.byItemId["item-1"]).toMatchObject({
    status: "draft",
    selectedTrackIds: ["player-1", "ball-1"],
    benchmarkTargetTrackId: "player-1",
    sourceFingerprint: sourceSha256,
    angleId: "primary",
    frame: { width: 1920, height: 1080 },
    range: { startMs: 0, endMs: 1000 },
    attested: false,
    exhaustiveSceneAttested: false,
    error: "",
  });
  expect(current.presentation.tracking.groundTruth.byItemId["item-1"].sceneReview.reviewedAtMs).toEqual([]);
  expect(invalidated).toBe(1);
});

test("preannotation bridge refuses incomplete, selected-object, and locked review state", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingGroundTruthPreannotationBridgeController.js",
  ));
  for (const [initial, message] of [
    [state({ review: { pendingCount: 1 } }), /finish and save every/i],
    [state({ benchmarkType: "selected-object" }), /choose full scene/i],
    [state({ truthStatus: "locked" }), /start a new draft/i],
  ]) {
    let current = initial;
    const controller = service.createTrackingGroundTruthPreannotationBridgeController({
      getState: () => current,
      updateState: (updater) => { current = updater(current); },
      getContext: context,
    });
    expect(controller.handleAction("ground-truth-use-preannotation-case")).toBe(true);
    expect(current.presentation.tracking.groundTruth.byItemId["item-1"].error).toMatch(message);
  }
});
