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
    criticalEntityCount: 1,
    fragmentCount: 1,
    lowConfidenceCount: 1,
    current: {
      id: "unassociated-ball",
      entityType: "ball",
      associationStatus: "unassociated",
      priorityCode: "critical-entity",
      priorityLabel: "Ball/referee requires manual confirmation",
    },
  });
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(1);
  expect(persisted).toHaveLength(0);

  expect(controller.handleAction("preannotation-accept")).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 1,
    acceptedCount: 1,
    current: { id: "associated-player", entityType: "player", priorityCode: "single-sample" },
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

test("preannotation review can save one current suggestion and hand it to correction tools", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const persisted = [];
  const campaignWrites = [];
  const draftScope = {
    organizationId: "org-review",
    teamId: "team-review",
    userId: "analyst-review",
    matchId: "match-review",
    clipId: "clip-1",
  };
  const associated = track("associated-player", "player", 1000, 0.8, "associated");
  const unassociated = track("unassociated-ball", "ball", 500, 0.4, "unassociated");
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    getDraftScope: () => draftScope,
    now: () => "2026-08-31T11:00:00.000Z",
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [associated],
      queue: [{ track: unassociated }],
      summary: { associatedTrackCount: 1, unassociatedObservationCount: 1 },
      campaign: {
        workspaceSha256: "b".repeat(64),
        packId: "real-match-pack",
        caseCount: 1,
        totalSuggestionCount: 2,
        cases: [{
          caseId: "transition",
          totalSuggestionCount: 2,
          associatedTrackCount: 1,
          unassociatedObservationCount: 1,
          missingSuggestedEntityTypes: [],
        }],
      },
    }),
    loadDraft: async () => null,
    saveDraft: async (_scope, value) => value,
    removeDraft: async () => true,
    loadCampaignCases: async () => [],
    saveCampaignCase: async (_scope, value) => {
      const record = { ...structuredClone(value), updatedAt: "2026-08-31T11:00:00.000Z" };
      campaignWrites.push(record);
      return record;
    },
    persistTrack: async (value) => {
      persisted.push(value);
      return value;
    },
  });

  expect(await controller.open()).toBe(true);
  expect(await controller.saveCurrentForCorrection()).toBe(true);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({
    id: unassociated.id,
    status: "review",
    metadata: {
      preannotationReviewPreview: false,
      preannotationReviewState: "saved-review",
    },
  });
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "correcting",
    pendingCount: 1,
    savedCount: 1,
    current: { id: unassociated.id, savedForCorrection: true },
  });
  expect(state.presentation.tracking.selectedTrackIds).toEqual([unassociated.id]);
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(1);
  expect(state.presentation.current.sections[0].items[0].objectTracks[0].metadata.preannotationReviewPreview).toBe(false);
  expect(await controller.flushDraft()).toBe(true);
  expect(campaignWrites.at(-1).reviewEffort).toMatchObject({
    correctionHandoffCount: 1,
    deferActionCount: 0,
    savedTrackActionCount: 1,
  });

  expect(controller.handleAction("preannotation-next")).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "review",
    current: { id: associated.id },
  });
  expect(state.presentation.tracking.preannotationReview.current).not.toHaveProperty("savedForCorrection");
  expect(state.presentation.tracking.preannotationReview.campaign.cases[0]).toMatchObject({
    reviewActionCount: 1,
    reworkActionCount: 1,
  });
  expect(campaignWrites.at(-1).reviewEffort.deferActionCount).toBe(0);
  expect(state.presentation.tracking.selectedTrackIds).toEqual([associated.id]);
  expect(state.presentation.current.sections[0].items[0].objectTracks).toHaveLength(2);
});

test("preannotation review keeps completed saves when a later track fails and resumes safely", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const persisted = [];
  let invalidated = 0;
  let failSecond = true;
  const campaignWrites = [];
  const draftScope = {
    organizationId: "org-review",
    teamId: "team-review",
    userId: "analyst-review",
    matchId: "match-review",
    clipId: "clip-1",
  };
  const first = track("unassociated-ball", "ball", 500, 0.4, "unassociated");
  const second = track("associated-player", "player", 1000, 0.8, "associated");
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    getDraftScope: () => draftScope,
    now: () => "2026-08-31T12:00:30.000Z",
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [second],
      queue: [{ track: first }],
      summary: { associatedTrackCount: 1, unassociatedObservationCount: 1 },
      campaign: {
        workspaceSha256: "b".repeat(64),
        packId: "real-match-pack",
        caseCount: 1,
        totalSuggestionCount: 2,
        cases: [{
          caseId: "transition",
          totalSuggestionCount: 2,
          associatedTrackCount: 1,
          unassociatedObservationCount: 1,
          missingSuggestedEntityTypes: [],
        }],
      },
    }),
    loadDraft: async () => null,
    saveDraft: async (_scope, value) => value,
    removeDraft: async () => true,
    loadCampaignCases: async () => [],
    saveCampaignCase: async (_scope, value) => {
      const record = { ...structuredClone(value), updatedAt: "2026-08-31T12:00:30.000Z" };
      campaignWrites.push(record);
      return record;
    },
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
  expect(await controller.flushDraft()).toBe(true);
  expect(campaignWrites.at(-1).reviewEffort).toMatchObject({
    acceptActionCount: 2,
    batchSaveActionCount: 1,
    savedTrackActionCount: 1,
  });

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
  expect(await controller.flushDraft()).toBe(true);
  expect(campaignWrites.at(-1).reviewEffort).toMatchObject({
    acceptActionCount: 2,
    batchSaveActionCount: 2,
    savedTrackActionCount: 2,
  });
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

test("preannotation review restores, serializes, and removes exact local decision progress", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const writes = [];
  let removals = 0;
  const first = track("unassociated-ball", "ball", 500, 0.4, "unassociated");
  const second = track("associated-player", "player", 1000, 0.8, "associated");
  const scope = { id: "scope-review", clipId: "clip-1" };
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    getDraftScope: () => scope,
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [second],
      queue: [{ track: first }],
      summary: { associatedTrackCount: 1, unassociatedObservationCount: 1 },
    }),
    loadDraft: async (receivedScope, identity) => {
      expect(receivedScope).toBe(scope);
      expect(identity).toMatchObject({
        itemId: "item-1",
        clipId: "clip-1",
        workspaceSha256: "b".repeat(64),
        caseId: "transition",
      });
      return {
        totalSuggestionCount: 2,
        decisions: [{ trackId: first.id, decision: "rejected" }],
        history: [{ trackId: first.id, decision: "rejected" }],
      };
    },
    saveDraft: async (receivedScope, value) => {
      expect(receivedScope).toBe(scope);
      writes.push(structuredClone(value));
      return value;
    },
    removeDraft: async (receivedScope, identity) => {
      expect(receivedScope).toBe(scope);
      expect(identity.workspaceSha256).toBe("b".repeat(64));
      removals += 1;
      return true;
    },
  });

  expect(await controller.open()).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "review",
    pendingCount: 1,
    rejectedCount: 1,
    restoredDecisionCount: 1,
    draftStatus: "restored",
    current: { id: second.id },
  });

  expect(controller.handleAction("preannotation-accept")).toBe(true);
  expect(await controller.flushDraft()).toBe(true);
  expect(writes.at(-1)).toMatchObject({
    totalSuggestionCount: 2,
    decisions: [
      { trackId: first.id, decision: "rejected" },
      { trackId: second.id, decision: "accepted" },
    ],
  });
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "complete",
    draftStatus: "ready",
  });

  expect(controller.handleAction("preannotation-undo")).toBe(true);
  expect(await controller.flushDraft()).toBe(true);
  expect(writes.at(-1).decisions).toEqual([{ trackId: first.id, decision: "rejected" }]);
  expect(state.presentation.tracking.preannotationReview.current).toMatchObject({ id: second.id });

  expect(controller.handleAction("preannotation-undo")).toBe(true);
  expect(await controller.flushDraft()).toBe(true);
  expect(removals).toBe(1);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 2,
    acceptedCount: 0,
    rejectedCount: 0,
    draftStatus: "ready",
    current: { id: first.id },
  });
});

test("preannotation review retries a failed protected progress checkpoint", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  let failDraftSave = true;
  let campaignWrites = 0;
  const draftScope = {
    organizationId: "org-review",
    teamId: "team-review",
    userId: "analyst-review",
    matchId: "match-review",
    clipId: "clip-1",
  };
  const suggestion = track("associated-player", "player", 1000, 0.8, "associated");
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    getDraftScope: () => draftScope,
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [suggestion],
      queue: [],
      summary: { associatedTrackCount: 1, unassociatedObservationCount: 0 },
      campaign: {
        workspaceSha256: "b".repeat(64),
        packId: "real-match-pack",
        caseCount: 1,
        totalSuggestionCount: 1,
        cases: [{
          caseId: "transition",
          totalSuggestionCount: 1,
          associatedTrackCount: 1,
          unassociatedObservationCount: 0,
          missingSuggestedEntityTypes: [],
        }],
      },
    }),
    loadDraft: async () => null,
    saveDraft: async (_scope, value) => {
      if (failDraftSave) throw new Error("Disk unavailable.");
      return value;
    },
    removeDraft: async () => true,
    loadCampaignCases: async () => [],
    saveCampaignCase: async (_scope, value) => {
      campaignWrites += 1;
      return { ...structuredClone(value), updatedAt: "2026-08-31T15:00:00.000Z" };
    },
  });

  expect(await controller.open()).toBe(true);
  expect(controller.handleAction("preannotation-reject")).toBe(true);
  expect(await controller.flushDraft()).toBe(false);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    draftStatus: "error",
    draftError: "Disk unavailable.",
    campaign: { status: "error" },
  });
  failDraftSave = false;
  expect(controller.handleAction("preannotation-save-progress")).toBe(true);
  expect(await controller.flushDraft()).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    draftStatus: "ready",
    draftError: "",
    campaign: { status: "ready", completeCaseCount: 1 },
  });
  expect(campaignWrites).toBe(2);
  expect(controller.handleAction("preannotation-save-progress")).toBe(false);
  state = {
    ...state,
    mediaProduction: {
      ...state.mediaProduction,
      proxy: { byAngleId: { primary: { result: { sourceSha256: "c".repeat(64) } } } },
    },
    presentation: {
      ...state.presentation,
      tracking: {
        ...state.presentation.tracking,
        preannotationReview: {
          ...state.presentation.tracking.preannotationReview,
          draftStatus: "error",
          campaign: {
            ...state.presentation.tracking.preannotationReview.campaign,
            status: "error",
          },
        },
      },
    },
  };
  expect(controller.handleAction("preannotation-save-progress")).toBe(false);
  expect(campaignWrites).toBe(2);
});

test("preannotation review restores and advances source-bound campaign progress", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const campaignWrites = [];
  const draftScope = {
    organizationId: "org-review",
    teamId: "team-review",
    userId: "analyst-review",
    matchId: "match-review",
    clipId: "clip-1",
  };
  const associated = track("associated-player", "player", 1000, 0.8, "associated");
  const unassociated = track("unassociated-ball", "ball", 500, 0.4, "unassociated");
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    now: () => "2026-08-31T12:00:30.000Z",
    getDraftScope: () => draftScope,
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [associated],
      queue: [{ track: unassociated }],
      summary: { associatedTrackCount: 1, unassociatedObservationCount: 1 },
      campaign: {
        workspaceSha256: "b".repeat(64),
        packId: "real-match-pack",
        caseCount: 2,
        totalSuggestionCount: 5,
        cases: [
          {
            caseId: "transition",
            totalSuggestionCount: 2,
            associatedTrackCount: 1,
            unassociatedObservationCount: 1,
            missingSuggestedEntityTypes: [],
          },
          {
            caseId: "other-case",
            totalSuggestionCount: 3,
            associatedTrackCount: 2,
            unassociatedObservationCount: 1,
            missingSuggestedEntityTypes: ["referee"],
          },
        ],
      },
    }),
    loadDraft: async () => null,
    saveDraft: async (_scope, value) => value,
    removeDraft: async () => true,
    loadCampaignCases: async (scope, workspaceSha256) => {
      expect(scope).toBe(draftScope);
      expect(workspaceSha256).toBe("b".repeat(64));
      return [{
        workspaceSha256: "b".repeat(64),
        packId: "real-match-pack",
        caseId: "other-case",
        totalSuggestionCount: 3,
        pendingCount: 1,
        acceptedCount: 0,
        rejectedCount: 1,
        savedCount: 1,
        updatedAt: "2026-08-31T12:00:00.000Z",
      }];
    },
    saveCampaignCase: async (scope, value) => {
      expect(scope).toBe(draftScope);
      const record = { ...structuredClone(value), updatedAt: "2026-08-31T12:01:00.000Z" };
      campaignWrites.push(record);
      return record;
    },
  });

  expect(await controller.open()).toBe(true);
  expect(campaignWrites).toHaveLength(1);
  expect(campaignWrites[0]).toMatchObject({
    caseId: "transition",
    pendingCount: 2,
    acceptedCount: 0,
    rejectedCount: 0,
    savedCount: 0,
    reviewEffort: {
      coverage: "complete",
      openedCount: 1,
      acceptActionCount: 0,
      firstOpenedAt: "2026-08-31T12:00:30.000Z",
    },
  });
  expect(state.presentation.tracking.preannotationReview.campaign).toMatchObject({
    status: "ready",
    caseCount: 2,
    openedCaseCount: 2,
    completeCaseCount: 0,
    totalSuggestionCount: 5,
    decisionCount: 2,
    resolvedCount: 2,
    reviewEffortCoverage: "partial",
    reviewActionCount: 0,
    cases: [
      { caseId: "transition", pendingCount: 2, decisionCount: 0, reviewActionCount: 0, active: true },
      { caseId: "other-case", pendingCount: 1, decisionCount: 2, active: false },
    ],
  });

  expect(controller.handleAction("preannotation-accept")).toBe(true);
  expect(await controller.flushDraft()).toBe(true);
  expect(campaignWrites.at(-1)).toMatchObject({
    caseId: "transition",
    pendingCount: 1,
    acceptedCount: 1,
    rejectedCount: 0,
    savedCount: 0,
    reviewEffort: {
      coverage: "complete",
      openedCount: 1,
      acceptActionCount: 1,
      lastActionAt: "2026-08-31T12:00:30.000Z",
    },
  });
  expect(state.presentation.tracking.preannotationReview.campaign).toMatchObject({
    status: "ready",
    decisionCount: 3,
    resolvedCount: 2,
    reviewActionCount: 1,
    cases: [
      { caseId: "transition", acceptedCount: 1, reviewActionCount: 1, complete: false },
      { caseId: "other-case", decisionCount: 2, resolvedCount: 2, complete: false },
    ],
  });
});

test("preannotation review scopes work in explicit bounded batches without bulk decisions", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const suggestions = Array.from({ length: 30 }, (_, index) => track(
    `object-${String(index).padStart(2, "0")}`,
    index < 2 ? "ball" : "player",
    index * 100,
    0.7,
    "unassociated",
  ));
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [],
      queue: suggestions.map((entry) => ({ track: entry })),
      summary: { associatedTrackCount: 0, unassociatedObservationCount: suggestions.length },
    }),
  });

  expect(await controller.open()).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 30,
    reviewScope: "all",
    scopePendingCount: 30,
    batchSize: 25,
    batchPendingCount: 25,
    batchTotalCount: 25,
    current: { id: "object-00" },
  });

  expect(controller.handleField("preannotation-scope", { value: "critical" })).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    reviewScope: "critical",
    scopePendingCount: 2,
    batchPendingCount: 2,
    batchTotalCount: 2,
    current: { id: "object-00" },
  });
  expect(controller.handleField("preannotation-batch-size", { value: "50" })).toBe(true);
  expect(state.presentation.tracking.preannotationReview.batchSize).toBe(50);
  expect(controller.handleField("preannotation-scope", { value: "all" })).toBe(true);
  expect(state.presentation.tracking.preannotationReview.batchTotalCount).toBe(30);
  expect(controller.handleField("preannotation-batch-size", { value: "25" })).toBe(true);

  for (let index = 0; index < 25; index += 1) {
    expect(controller.handleAction("preannotation-accept")).toBe(true);
  }
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "batch-complete",
    pendingCount: 5,
    acceptedCount: 25,
    scopePendingCount: 5,
    batchPendingCount: 0,
    batchTotalCount: 25,
    current: null,
  });
  expect(controller.handleAction("preannotation-next-batch")).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "review",
    batchPendingCount: 5,
    batchTotalCount: 5,
    current: { id: "object-25" },
  });
});

test("preannotation keyboard review is deliberate, scoped, and repeat-safe", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationReviewController.js",
  ));
  let state = initialState();
  const associated = track("associated-player", "player", 1000, 0.8, "associated");
  const unassociated = track("unassociated-ball", "ball", 500, 0.4, "unassociated");
  const seeks = [];
  const listeners = new Map();
  let currentMatchMs = 0;
  let playError = null;
  let playCount = 0;
  let pauseCount = 0;
  const video = {
    paused: true,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    play() {
      playCount += 1;
      if (playError) throw playError;
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      pauseCount += 1;
      this.paused = true;
    },
  };
  const controller = service.createTrackingPreannotationReviewController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getWindow: () => ({ crypto: globalThis.crypto }),
    pickFiles: async () => ({ caseId: "transition" }),
    importCase: async () => ({
      workspaceSha256: "b".repeat(64),
      sourceSha256: "a".repeat(64),
      caseId: "transition",
      tracks: [associated],
      queue: [{ track: unassociated }],
      summary: { associatedTrackCount: 1, unassociatedObservationCount: 1 },
    }),
    getVideoElement: () => video,
    getCurrentMatchMs: () => currentMatchMs,
    seekToMatchMs: (atMs) => {
      currentMatchMs = atMs;
      seeks.push(atMs);
    },
  });
  const keyboardEvent = (key, overrides = {}) => {
    const calls = { prevented: 0, stopped: 0 };
    return {
      key,
      target: { tagName: "BODY" },
      preventDefault: () => { calls.prevented += 1; },
      stopPropagation: () => { calls.stopped += 1; },
      calls,
      ...overrides,
    };
  };

  expect(await controller.open()).toBe(true);
  expect(controller.handleShortcut(keyboardEvent("a", { repeat: true }))).toBe(false);
  expect(controller.handleShortcut(keyboardEvent("a", { target: { tagName: "INPUT" } }))).toBe(false);
  expect(controller.handleShortcut(keyboardEvent("a", { metaKey: true }))).toBe(false);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({ pendingCount: 2, acceptedCount: 0 });

  const preview = keyboardEvent("P");
  expect(controller.handleShortcut(preview)).toBe(true);
  expect(preview.calls).toEqual({ prevented: 1, stopped: 1 });
  expect(seeks).toEqual([500, 0]);
  expect(playCount).toBe(1);
  expect(video.paused).toBe(false);
  expect([...listeners.keys()]).toEqual(["timeupdate", "ended"]);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 2,
    acceptedCount: 0,
    current: {
      id: unassociated.id,
      durationMs: 0,
      contextStartMs: 0,
      contextLeadMs: 500,
      batchPosition: 1,
      batchTotalCount: 2,
    },
  });
  const back = keyboardEvent("B");
  expect(controller.handleShortcut(back)).toBe(true);
  expect(back.calls).toEqual({ prevented: 1, stopped: 1 });
  expect(seeks).toEqual([500, 0, 1000]);
  expect(video.paused).toBe(true);
  expect(pauseCount).toBe(1);
  expect(listeners.size).toBe(0);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 2,
    acceptedCount: 0,
    current: { id: associated.id, batchPosition: 2, batchTotalCount: 2 },
  });

  const next = keyboardEvent("N");
  expect(controller.handleShortcut(next)).toBe(true);
  expect(next.calls).toEqual({ prevented: 1, stopped: 1 });
  expect(seeks).toEqual([500, 0, 1000, 500]);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 2,
    acceptedCount: 0,
    current: { id: unassociated.id, batchPosition: 1, batchTotalCount: 2 },
  });

  expect(controller.handleShortcut(keyboardEvent("p"))).toBe(true);
  expect(playCount).toBe(2);
  currentMatchMs = 2000;
  listeners.get("timeupdate")();
  expect(video.paused).toBe(true);
  expect(pauseCount).toBe(2);
  expect(listeners.size).toBe(0);

  playError = new Error("Autoplay blocked");
  expect(controller.handleShortcut(keyboardEvent("p"))).toBe(true);
  expect(playCount).toBe(3);
  expect(seeks).toEqual([500, 0, 1000, 500, 0, 0]);
  expect(listeners.size).toBe(0);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({ pendingCount: 2, acceptedCount: 0 });
  playError = null;

  const accept = keyboardEvent("A");
  expect(controller.handleShortcut(accept)).toBe(true);
  expect(accept.calls).toEqual({ prevented: 1, stopped: 1 });
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    pendingCount: 1,
    acceptedCount: 1,
    current: { id: associated.id },
  });

  const reject = keyboardEvent("r");
  expect(controller.handleShortcut(reject)).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "complete",
    pendingCount: 0,
    acceptedCount: 1,
    rejectedCount: 1,
  });

  const undo = keyboardEvent("u");
  expect(controller.handleShortcut(undo)).toBe(true);
  expect(state.presentation.tracking.preannotationReview).toMatchObject({
    status: "review",
    pendingCount: 1,
    rejectedCount: 0,
    current: { id: associated.id },
  });
  expect(controller.handleShortcut(keyboardEvent("x"))).toBe(false);
});
