import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function file(name, value) {
  const bytes = new TextEncoder().encode(value);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
}

function directory(files = {}, directories = {}) {
  return {
    kind: "directory",
    getFileHandle: async (name) => {
      if (!files[name]) throw new DOMException("Missing", "NotFoundError");
      return { kind: "file", getFile: async () => files[name] };
    },
    getDirectoryHandle: async (name) => {
      if (!directories[name]) throw new DOMException("Missing", "NotFoundError");
      return directories[name];
    },
  };
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
          campaign: {
            status: "ready",
            caseCount: 2,
            completeCaseCount: 1,
            totalSuggestionCount: 30,
            decisionCount: 20,
            reviewEffortCoverage: "partial",
            reviewActionCount: 28,
            reviewActionsPer100Suggestions: 93.33,
            cases: [
              {
                caseId: "attacking-third",
                totalSuggestionCount: 20,
                decisionCount: 10,
                resolvedCount: 8,
                reviewActionCount: 18,
                undoActionCount: 2,
                correctionHandoffCount: 3,
                missingSuggestedEntityTypes: ["referee"],
                active: true,
              },
              {
                caseId: "fast-transition",
                totalSuggestionCount: 10,
                decisionCount: 10,
                resolvedCount: 10,
                reviewActionCount: 10,
                complete: true,
              },
            ],
          },
          current: {
            id: "suggestion-1",
            entityType: "ball",
            associationStatus: "unassociated",
            atMs: 1250,
            durationMs: 900,
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
  expect(html).toContain('<option value="critical" selected>Roles, ball &amp; referee</option>');
  expect(html).toContain('<option value="50" selected>50</option>');
  expect(html).toContain("17/17");
  expect(html).toContain("Device progress restored");
  expect(html).toContain("12 decisions");
  expect(html).toContain("Annotation campaign");
  expect(html).toContain("20/30 decisions");
  expect(html).toContain("28 review actions | 93.33/100 suggestions");
  expect(html).toContain("18 actions | 2 undo | 3 correct");
  expect(html).toContain("Effort capture partial");
  expect(html).toContain("1/2 decision queues");
  expect(html).toContain("Decisions complete");
  expect(html).toContain("Find referee");
  expect(html).toContain('aria-current="step"');
  expect(html).toContain("Protected on this device");
  expect(html).toContain("1 samples | 900ms | 40%");
  for (const action of [
    "preannotation-open",
    "preannotation-accept",
    "preannotation-reject",
    "preannotation-preview-context",
    "preannotation-next",
    "preannotation-next-batch",
    "preannotation-undo",
    "preannotation-save-current",
    "preannotation-save",
    "ground-truth-use-preannotation-case",
  ]) expect(html).toContain(`data-video-analysis-tracking-action="${action}"`);
  expect(html).toMatch(/preannotation-save"[^>]*>Save accepted/);
  expect(html).toMatch(/preannotation-next-batch" disabled>Next batch/);
  expect(html).toMatch(/ground-truth-use-preannotation-case" disabled>Use in ground truth/);
  for (const [action, key] of [
    ["preannotation-accept", "A"],
    ["preannotation-reject", "R"],
    ["preannotation-preview-context", "P"],
    ["preannotation-next", "N"],
    ["preannotation-undo", "U"],
    ["preannotation-save-current", "C"],
    ["preannotation-save", "S"],
  ]) expect(html).toMatch(new RegExp(`${action}" aria-keyshortcuts="${key}"`));
  expect(html).toContain('title="Play 1.5 seconds before and after this suggestion (P)"');

  const completeState = {
    presentation: {
      tracking: {
        preannotationReview: {
          status: "complete",
          caseId: "attacking-third",
          workspaceSha256: "a".repeat(64),
          pendingCount: 0,
          acceptedCount: 0,
          savedCount: 20,
          campaign: {
            status: "ready",
            caseCount: 1,
            completeCaseCount: 1,
            totalSuggestionCount: 20,
            decisionCount: 20,
            cases: [{
              caseId: "attacking-third",
              totalSuggestionCount: 20,
              decisionCount: 20,
              resolvedCount: 20,
              savedCount: 20,
              reviewEffortCoverage: "complete",
              complete: true,
              active: true,
            }],
          },
        },
      },
    },
  };
  const completeHtml = component.renderTrackingPreannotationReviewPanel(completeState, { id: "item-1" });
  expect(completeHtml).toMatch(/ground-truth-use-preannotation-case" >Use in ground truth/);
  completeState.presentation.tracking.preannotationReview.campaign.cases[0].reviewEffortCoverage = "partial";
  const partialEffortHtml = component.renderTrackingPreannotationReviewPanel(completeState, { id: "item-1" });
  expect(partialEffortHtml).toMatch(/ground-truth-use-preannotation-case" disabled>Use in ground truth/);
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

test("preannotation directory picker matches the connected source to one sealed case", async () => {
  const helpers = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewControllerHelpers.js",
  ));
  const sourceSha256 = "b".repeat(64);
  const pack = file("annotation-pack.json", JSON.stringify({
    cases: [
      { id: "attacking-third", clip: { sha256: "a".repeat(64) } },
      { id: "fast-transition", clip: { sha256: sourceSha256 } },
    ],
  }));
  const workspace = file("workspace.json", JSON.stringify({
    cases: [{ id: "attacking-third" }, { id: "fast-transition" }],
  }));
  const root = directory({
    "annotation-pack.json": pack,
    "workspace.json": workspace,
  }, {
    cases: directory({
      "fast-transition.track-map.json": file("fast-transition.track-map.json", "map"),
      "fast-transition.suggestions.mot.txt": file("fast-transition.suggestions.mot.txt", "suggestions"),
    }),
  });
  let pickerOptions = null;
  const result = await helpers.selectTrackingPreannotationReviewFiles({
    showDirectoryPicker: async (options) => {
      pickerOptions = options;
      return root;
    },
  }, { sourceSha256 });

  expect(pickerOptions).toEqual({ id: "fs-player-preannotation", mode: "read" });
  expect(result.caseId).toBe("fast-transition");
  expect(new TextDecoder().decode(result.trackMapBytes)).toBe("map");
  expect(new TextDecoder().decode(result.suggestionBytes)).toBe("suggestions");
});

test("preannotation directory picker fails closed when the connected source is absent", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingPreannotationWorkspacePickerService.js",
  ));
  const root = directory({
    "annotation-pack.json": file("annotation-pack.json", JSON.stringify({
      cases: [{ id: "attacking-third", clip: { sha256: "a".repeat(64) } }],
    })),
    "workspace.json": file("workspace.json", JSON.stringify({
      cases: [{ id: "attacking-third" }],
    })),
  }, { cases: directory() });
  await expect(service.selectTrackingPreannotationWorkspaceDirectory({
    showDirectoryPicker: async () => root,
  }, { sourceSha256: "b".repeat(64) })).rejects.toThrow(/not part of this annotation workspace/i);
});
