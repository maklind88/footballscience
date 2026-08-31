import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

test("preannotation panel exposes bounded review decisions and save state", async () => {
  const component = await import(moduleUrl(
    "src/modules/video-analysis/components/TrackingPreannotationReviewPanel.js",
  ));
  const html = component.renderTrackingPreannotationReviewPanel({
    presentation: {
      tracking: {
        preannotationReview: {
          status: "review",
          caseId: "attacking-third",
          workspaceSha256: "a".repeat(64),
          associatedTrackCount: 312,
          unassociatedObservationCount: 4341,
          pendingCount: 4652,
          acceptedCount: 1,
          rejectedCount: 0,
          savedCount: 0,
          draftStatus: "restored",
          restoredDecisionCount: 12,
          current: {
            id: "suggestion-1",
            entityType: "ball",
            associationStatus: "unassociated",
            atMs: 1250,
            confidence: 0.4,
            pointCount: 1,
          },
          error: "",
        },
      },
    },
  }, { id: "item-1" });

  expect(html).toContain("Verified preannotation");
  expect(html).toContain("attacking-third");
  expect(html).toContain("4,341");
  expect(html).toContain("Unassociated ball");
  expect(html).toContain("Device progress restored");
  expect(html).toContain("12 decisions");
  expect(html).toContain("1 samples | 40%");
  for (const action of [
    "preannotation-open",
    "preannotation-accept",
    "preannotation-reject",
    "preannotation-next",
    "preannotation-undo",
    "preannotation-save",
  ]) expect(html).toContain(`data-video-analysis-tracking-action="${action}"`);
  expect(html).toMatch(/preannotation-save" >Save accepted/);
});
