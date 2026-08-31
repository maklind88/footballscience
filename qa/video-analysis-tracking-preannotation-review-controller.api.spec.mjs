import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function track(id, entityType, atMs, confidence, associationStatus) {
  return {
    id,
    clipId: "clip-1",
    entityType,
    status: "review",
    startMs: atMs,
    endMs: atMs + (associationStatus === "associated" ? 1000 : 0),
    confidence,
    identityConfidence: 0,
    engine: "tracking-preannotation-review",
    engineVersion: "1".repeat(16),
    segments: [{
      id: `${id}-segment`,
      startMs: atMs,
      endMs: atMs + (associationStatus === "associated" ? 1000 : 0),
      confidence,
      points: [{
        atMs,
        frameIndex: Math.round(atMs / 33.333),
        x: 0.5,
        y: 0.5,
        width: 0.1,
        height: 0.2,
        groundX: 0.5,
        groundY: 0.6,
        confidence,
        identityConfidence: 0,
        source: "automatic",
      }],
    }],
    corrections: [],
    metadata: {
      preannotationAssociationStatus: associationStatus,
      preannotationWorkspaceSha256: "b".repeat(64),
      preannotationCaseId: "transition",
      localSourceSha256: "a".repeat(64),
      angleId: "primary",
    },
  };
}

function initialState() {
  return {
    mediaProduction: {
      activeAngleId: "primary",
      primaryAngleId: "primary",
      proxy: { byAngleId: { primary: { result: { sourceSha256: "a".repeat(64) } } } },
    },
    presentation: {
      selectedItemId: "item-1",
      selectedClipId: "clip-1",
      current: {
        sections: [{
          id: "section-1",
          items: [{ id: "item-1", clipId: "clip-1", objectTracks: [] }],
        }],
      },
      tracking: {
        selectedTrackIds: [],
        preannotationReview: { status: "idle" },
      },
    },
  };
}

test("preannotation review decisions stay local, support undo, and persist only on save", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const persisted = [];
  const seeks = [];
  let invalidated = 0;
  const associated = track("associated-player", "player", 1000, 0.8, "associated");
  const unassociated = track("unassociated-ball", "ball", 500, 0.4, "unassociated");
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async (request) => {
      expect(request).toMatchObject({
        caseId: "transition",
        sourceSha256: "a".repeat(64),
        itemId: "item-1",
        clipId: "clip-1",
        angleId: "primary",
      });
      return {
        workspaceSha256: "b".repeat(64),
        sourceSha256: "a".repeat(64),
        caseId: "transition",
        tracks: [associated],
        queue: [{ track: unassociated }],
        summary: { associatedTrackCount: 1, unassociatedObservationCount: 1 },
      };
    },
    seekToMatchMs: (atMs) => seeks.push(atMs),
    persistTrack: async (value) => {
      persisted.push(value);
      return value;
    },
    onEvidenceChanged: () => { invalidated += 1; },
  });

  expect(await controller.open()).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "review",
    caseId: "transition",
    pendingCount: 2,
    acceptedCount: 0,
    current: { id: "unassociated-ball", entityType: "ball", associationStatus: "unassociated" },
  });
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(1);
  expect(persisted).toHaveLength(0);

  expect(controller.handleAction("preannotation-accept")).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 1,
    acceptedCount: 1,
    current: { id: "associated-player", entityType: "player" },
  });
  expect(persisted).toHaveLength(0);

  expect(controller.handleAction("preannotation-reject")).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "complete",
    pendingCount: 0,
    acceptedCount: 1,
    rejectedCount: 1,
    current: null,
  });

  expect(controller.handleAction("preannotation-undo")).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "review",
    pendingCount: 1,
    rejectedCount: 0,
    current: { id: "associated-player" },
  });
  expect(controller.handleAction("preannotation-accept")).toBe(true);
  expect(await controller.saveAccepted()).toBe(true);
  expect(persisted).toHaveLength(2);
  expect(persisted.every((entry) => entry.metadata.preannotationReviewState === "saved-review")).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    acceptedCount: 0,
    savedCount: 2,
    rejectedCount: 0,
  });
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(2);
  expect(invalidated).toBe(1);
  expect(seeks).toEqual([500, 1000, 1000]);

  expect(await controller.open()).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "complete",
    pendingCount: 0,
    acceptedCount: 0,
    savedCount: 2,
    current: null,
  });
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(2);
  expect(persisted).toHaveLength(2);
});

test("preannotation review keeps completed saves when a later track fails and resumes safely", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const persisted = [];
  let invalidated = 0;
  let failSecond = true;
  const first = track("unassociated-ball", "ball", 500, 0.4, "unassociated");
  const second = track("associated-player", "player", 1000, 0.8, "associated");
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [second],
      queue: [{ track: first }],
      summary: { associatedTrackCount: 1, unassociatedObservationCount: 1 },
    }),
    persistTrack: async (value) => {
      if (value.id === second.id && failSecond) throw new Error("disk unavailable");
      persisted.push(value);
      return value;
    },
    onEvidenceChanged: () => { invalidated += 1; },
  });

  expect(await controller.open()).toBe(true);
  expect(controller.handleAction("preannotation-accept")).toBe(true);
  expect(controller.handleAction("preannotation-accept")).toBe(true);
  expect(await controller.saveAccepted()).toBe(false);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "error",
    acceptedCount: 1,
    savedCount: 1,
    error: "disk unavailable",
  });
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(1);
  expect(persisted.map((entry) => entry.id)).toEqual([first.id]);
  expect(invalidated).toBe(1);

  failSecond = false;
  expect(await controller.saveAccepted()).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "complete",
    acceptedCount: 0,
    savedCount: 2,
    error: "",
  });
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(2);
  expect(persisted.map((entry) => entry.id)).toEqual([first.id, second.id]);
  expect(invalidated).toBe(2);
});

test("preannotation review refuses an import when the selected source changes while opening", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const candidate = track("associated-player", "player", 1000, 0.8, "associated");
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => {
      state = {
        ...state,
        mediaProduction: {
          ...state.mediaProduction,
          proxy: { byAngleId: { primary: { result: { sourceSha256: "c".repeat(64) } } } },
        },
      };
      return {
        workspaceSha256: "b".repeat(64),
        sourceSha256: "a".repeat(64),
        caseId: "transition",
        tracks: [candidate],
        queue: [],
        summary: { associatedTrackCount: 1, unassociatedObservationCount: 0 },
      };
    },
  });

  expect(await controller.open()).toBe(false);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "error",
    error: "The selected clip or video source changed while preannotation was opening.",
    current: null,
  });
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(0);
});
