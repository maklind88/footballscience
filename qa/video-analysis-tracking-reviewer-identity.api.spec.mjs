import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

test("ground-truth reviewer identity rejects placeholders and control text", async () => {
  const identity = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingReviewerIdentityService.js",
  ));
  expect(identity.normalizeTrackingReviewerIdentity({ id: "  analyst-42  " })).toBe("analyst-42");
  expect(identity.normalizeTrackingReviewerIdentity("Lead   Analyst")).toBe("Lead Analyst");
  for (const value of [
    "",
    "anonymous",
    "local-analyst",
    "REPLACE_AFTER_EXHAUSTIVE_REVIEW",
    "unknown",
    "reviewer\nclaim",
    "x".repeat(161),
  ]) {
    expect(identity.normalizeTrackingReviewerIdentity(value)).toBe("");
    expect(identity.trackingReviewerIdentityReady(value)).toBe(false);
  }

  const groundTruth = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingGroundTruthService.js",
  ));
  expect(groundTruth.groundTruthReadiness({ reviewedBy: "local-analyst" }).issues)
    .toEqual(expect.arrayContaining([expect.objectContaining({ code: "reviewer-missing" })]));
  expect(groundTruth.groundTruthReadiness({ reviewedBy: "analyst-42" }).issues)
    .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "reviewer-missing" })]));
});

test("reviewer changes clear attestations and render the named identity", async () => {
  const { createTrackingGroundTruthController } = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingGroundTruthController.js",
  ));
  const { renderTrackingGroundTruthPanel } = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingGroundTruthPanel.js",
  ));
  const item = { id: "item-1", clipId: "clip-1", startMs: 0, endMs: 1000, objectTracks: [] };
  let state = {
    presentation: {
      current: { sections: [{ id: "section-1", items: [item] }] },
      selectedItemId: item.id,
      tracking: {
        groundTruth: {
          suite: { benchmarkType: "multi-object", cases: [] },
          byItemId: {
            [item.id]: {
              itemId: item.id,
              status: "draft",
              reviewedBy: "Analyst One",
              attested: true,
              exhaustiveSceneAttested: true,
              range: { startMs: 0, endMs: 1000 },
            },
          },
        },
      },
    },
  };
  const controller = createTrackingGroundTruthController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
  });

  expect(controller.handleField("groundTruthReviewer", { value: "Analyst One" })).toBe(true);
  expect(state.presentation.tracking.groundTruth.byItemId[item.id]).toMatchObject({
    reviewedBy: "Analyst One",
    attested: true,
    exhaustiveSceneAttested: true,
  });
  expect(controller.handleField("groundTruthReviewer", { value: "Lead Analyst" })).toBe(true);
  expect(state.presentation.tracking.groundTruth.byItemId[item.id]).toMatchObject({
    reviewedBy: "Lead Analyst",
    attested: false,
    exhaustiveSceneAttested: false,
  });
  expect(renderTrackingGroundTruthPanel(state, item)).toContain('value="Lead Analyst"');
  expect(renderTrackingGroundTruthPanel(state, item)).toContain("Reviewer identity");

  expect(controller.handleField("groundTruthReviewer", { value: "local-analyst" })).toBe(true);
  expect(state.presentation.tracking.groundTruth.byItemId[item.id]).toMatchObject({
    reviewedBy: "",
    error: expect.stringMatching(/named human reviewer/i),
  });
  state.presentation.tracking.groundTruth.byItemId[item.id].status = "locked";
  expect(controller.handleField("groundTruthReviewer", { value: "Another Analyst" })).toBe(false);
});
