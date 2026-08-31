import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function file(name, value) {
  const bytes = new TextEncoder().encode(value);
  return { name, arrayBuffer: async () => bytes.buffer };
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
          criticalEntityCount: 17,
          fragmentCount: 204,
          lowConfidenceCount: 48,
          pendingCount: 4652,
          acceptedCount: 1,
          rejectedCount: 0,
          savedCount: 0,
          reviewScope: "critical",
          scopePendingCount: 17,
          batchSize: 50,
          batchPendingCount: 17,
          batchTotalCount: 17,
          draftStatus: "restored",
          restoredDecisionCount: 12,
          current: {
            id: "suggestion-1",
            entityType: "ball",
            associationStatus: "unassociated",
            atMs: 1250,
            confidence: 0.4,
            pointCount: 1,
            priorityCode: "critical-entity",
            priorityLabel: "Ball/referee requires manual confirmation",
          },
          error: "",
        },
      },
    },
  }, { id: "item-1" });

  expect(html).toContain("Verified preannotation");
  expect(html).toContain("attacking-third");
  expect(html).toContain("4,341");
  expect(html).toContain("Critical objects");
  expect(html).toContain("204");
  expect(html).toContain("Unassociated ball");
  expect(html).toContain("Ball/referee requires manual confirmation");
  expect(html).toContain('data-video-analysis-tracking-field="preannotation-scope"');
  expect(html).toContain('<option value="critical" selected>Ball &amp; referee</option>');
  expect(html).toContain('<option value="50" selected>50</option>');
  expect(html).toContain("17/17");
  expect(html).toContain("Device progress restored");
  expect(html).toContain("12 decisions");
  expect(html).toContain("1 samples | 40%");
  for (const action of [
    "preannotation-open",
    "preannotation-accept",
    "preannotation-reject",
    "preannotation-next",
    "preannotation-next-batch",
    "preannotation-undo",
    "preannotation-save-current",
    "preannotation-save",
  ]) expect(html).toContain(`data-video-analysis-tracking-action="${action}"`);
  expect(html).toMatch(/preannotation-save" >Save accepted/);
  expect(html).toMatch(/preannotation-next-batch" disabled>Next batch/);
});

test("preannotation file picker opens the three real workspace locations in order", async () => {
  const helpers = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewControllerHelpers.js",
  ));
  const selections = [
    [file("annotation-pack.json", "pack")],
    [file("workspace.json", "workspace")],
    [
      file("attacking-third.track-map.json", "map"),
      file("attacking-third.suggestions.mot.txt", "suggestions"),
    ],
  ];
  const pickerOptions = [];
  const result = await helpers.selectTrackingPreannotationReviewFiles({
    showOpenFilePicker: async (options) => {
      pickerOptions.push(options);
      return selections[pickerOptions.length - 1].map((entry) => ({ getFile: async () => entry }));
    },
  });

  expect(pickerOptions.map((entry) => ({
    description: entry.types[0].description,
    multiple: entry.multiple,
  }))).toEqual([
    { description: "Step 1 of 3: annotation-pack.json", multiple: false },
    { description: "Step 2 of 3: workspace.json", multiple: false },
    { description: "Step 3 of 3: matching case files", multiple: true },
  ]);
  expect(result.caseId).toBe("attacking-third");
  expect(new TextDecoder().decode(result.packBytes)).toBe("pack");
  expect(new TextDecoder().decode(result.workspaceBytes)).toBe("workspace");
  expect(new TextDecoder().decode(result.trackMapBytes)).toBe("map");
  expect(new TextDecoder().decode(result.suggestionBytes)).toBe("suggestions");
});

test("preannotation file picker rejects a crossed case pair", async () => {
  const helpers = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewControllerHelpers.js",
  ));
  const selections = [
    [file("annotation-pack.json", "pack")],
    [file("workspace.json", "workspace")],
    [
      file("attacking-third.track-map.json", "map"),
      file("fast-transition.suggestions.mot.txt", "suggestions"),
    ],
  ];
  let index = 0;
  await expect(helpers.selectTrackingPreannotationReviewFiles({
    showOpenFilePicker: async () => selections[index++].map((entry) => ({ getFile: async () => entry })),
  })).rejects.toThrow(/one matching case/i);
});
