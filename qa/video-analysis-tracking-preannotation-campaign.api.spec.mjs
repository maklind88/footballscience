import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function scope(overrides = {}) {
  return {
    organizationId: "org-review",
    teamId: "team-review",
    userId: "analyst-review",
    matchId: "match-review",
    clipId: "clip-review",
    ...overrides,
  };
}

function campaign(overrides = {}) {
  return {
    workspaceSha256: "b".repeat(64),
    packId: "real-match-pack",
    caseCount: 2,
    totalSuggestionCount: 40,
    cases: [
      {
        caseId: "attacking-third",
        totalSuggestionCount: 25,
        associatedTrackCount: 10,
        unassociatedObservationCount: 15,
        missingSuggestedEntityTypes: ["referee"],
      },
      {
        caseId: "fast-transition",
        totalSuggestionCount: 15,
        associatedTrackCount: 5,
        unassociatedObservationCount: 10,
        missingSuggestedEntityTypes: [],
      },
    ],
    ...overrides,
  };
}

test("preannotation campaign reconciles every sealed case and current review decision", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingPreannotationCampaignService.js",
  ));
  const normalized = service.normalizeTrackingPreannotationCampaign(campaign());
  const progress = service.trackingPreannotationCampaignProgress(normalized, [{
    caseId: "attacking-third",
    totalSuggestionCount: 25,
    pendingCount: 10,
    acceptedCount: 2,
    rejectedCount: 8,
    savedCount: 5,
    reviewEffort: {
      coverage: "complete",
      openedCount: 2,
      acceptActionCount: 4,
      rejectActionCount: 8,
      undoActionCount: 2,
      deferActionCount: 3,
      correctionHandoffCount: 1,
      batchSaveActionCount: 1,
      savedTrackActionCount: 5,
      firstOpenedAt: "2026-08-31T11:00:00.000Z",
      lastActionAt: "2026-08-31T12:00:00.000Z",
    },
    updatedAt: "2026-08-31T12:00:00.000Z",
  }], {
    activeCaseId: "fast-transition",
    current: {
      caseId: "fast-transition",
      totalSuggestionCount: 15,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 10,
      savedCount: 5,
      reviewEffort: {
        coverage: "complete",
        openedCount: 1,
        acceptActionCount: 5,
        rejectActionCount: 10,
        undoActionCount: 0,
        deferActionCount: 0,
        correctionHandoffCount: 0,
        batchSaveActionCount: 1,
        savedTrackActionCount: 5,
        firstOpenedAt: "2026-08-31T12:30:00.000Z",
        lastActionAt: "2026-08-31T13:00:00.000Z",
      },
      updatedAt: "",
    },
  });

  expect(progress).toMatchObject({
    caseCount: 2,
    openedCaseCount: 2,
    completeCaseCount: 1,
    totalSuggestionCount: 40,
    decisionCount: 30,
    resolvedCount: 28,
    reviewEffortCoverage: "complete",
    reviewActionCount: 35,
    reworkActionCount: 3,
    correctionHandoffCount: 1,
    savedTrackActionCount: 10,
    reviewActionsPer100Suggestions: 87.5,
    cases: [
      {
        caseId: "attacking-third",
        decisionCount: 15,
        resolvedCount: 13,
        reviewActionCount: 19,
        reworkActionCount: 3,
        complete: false,
        active: false,
      },
      {
        caseId: "fast-transition",
        decisionCount: 15,
        resolvedCount: 15,
        reviewActionCount: 16,
        reworkActionCount: 0,
        complete: true,
        active: true,
      },
    ],
  });
  expect(progress.cases[0].missingSuggestedEntityTypes).toEqual(["referee"]);
  expect(() => service.normalizeTrackingPreannotationCampaign(campaign({ totalSuggestionCount: 39 })))
    .toThrow(/workload summary/i);
  expect(() => service.trackingPreannotationCampaignProgress(normalized, [], {
    current: {
      caseId: "fast-transition",
      totalSuggestionCount: 15,
      pendingCount: 1,
      acceptedCount: 1,
      rejectedCount: 1,
      savedCount: 1,
    },
  })).toThrow(/does not reconcile/i);
  expect(() => service.trackingPreannotationCampaignProgress(normalized, [{
    caseId: "attacking-third",
    workspaceSha256: "c".repeat(64),
    packId: "real-match-pack",
    totalSuggestionCount: 25,
    pendingCount: 25,
    acceptedCount: 0,
    rejectedCount: 0,
    savedCount: 0,
  }])).toThrow(/another sealed workspace/i);
  expect(() => service.trackingPreannotationCampaignProgress(normalized, [{
    caseId: "attacking-third",
    workspaceSha256: "b".repeat(64),
    packId: "another-pack",
    totalSuggestionCount: 25,
    pendingCount: 25,
    acceptedCount: 0,
    rejectedCount: 0,
    savedCount: 0,
  }])).toThrow(/another sealed workspace/i);
});

test("local preannotation campaign ledger is tenant, source and workspace bound", async () => {
  const store = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingPreannotationCampaignStore.js",
  ));
  const value = {
    scope: scope(),
    workspaceSha256: "b".repeat(64),
    packId: "real-match-pack",
    caseId: "attacking-third",
    itemId: "item-review",
    clipId: "clip-review",
    angleId: "primary",
    sourceSha256: "a".repeat(64),
    totalSuggestionCount: 25,
    pendingCount: 10,
    acceptedCount: 2,
    rejectedCount: 8,
    savedCount: 5,
  };
  const record = store.createLocalTrackingPreannotationCampaignCase(value, {
    now: () => "2026-08-31T12:00:00.000Z",
  });

  expect(record).toMatchObject({
    version: 2,
    protocol: "football-science-local-tracking-preannotation-campaign-case-v2",
    scope: {
      organizationId: "org-review",
      teamId: "team-review",
      userId: "analyst-review",
      sourceType: "match",
      sourceId: "match-review",
    },
    workspaceSha256: "b".repeat(64),
    caseId: "attacking-third",
    reviewEffort: { coverage: "partial", openedCount: 0, savedTrackActionCount: 0 },
    updatedAt: "2026-08-31T12:00:00.000Z",
  });
  expect(store.validateLocalTrackingPreannotationCampaignCase(record)).toEqual(record);
  expect(store.localTrackingPreannotationCampaignId(scope(), "b".repeat(64)))
    .toBe(store.localTrackingPreannotationCampaignId(scope({ clipId: "another-clip" }), "b".repeat(64)));
  expect(store.localTrackingPreannotationCampaignId(scope(), "b".repeat(64)))
    .not.toBe(store.localTrackingPreannotationCampaignId(scope({ userId: "another-user" }), "b".repeat(64)));
  expect(() => store.createLocalTrackingPreannotationCampaignCase({ ...value, pendingCount: 9 }))
    .toThrow(/counts do not reconcile/i);
  expect(() => store.createLocalTrackingPreannotationCampaignCase({
    ...value,
    scope: scope({ clipId: "another-clip" }),
  })).toThrow(/does not belong to this clip/i);
  expect(() => store.validateLocalTrackingPreannotationCampaignCase({ ...record, campaignId: "wrong" }))
    .toThrow(/identity is invalid/i);
  expect(() => store.createLocalTrackingPreannotationCampaignCase({
    ...value,
    reviewEffort: { coverage: "complete", savedTrackActionCount: 26 },
  })).toThrow(/exceeds its sealed suggestion workload/i);

  const { reviewEffort, ...legacyValue } = record;
  const legacy = {
    ...legacyValue,
    version: 1,
    protocol: "football-science-local-tracking-preannotation-campaign-case-v1",
  };
  expect(store.validateLocalTrackingPreannotationCampaignCase(legacy)).toMatchObject({
    version: 2,
    protocol: "football-science-local-tracking-preannotation-campaign-case-v2",
    reviewEffort: { coverage: "partial", openedCount: 0, savedTrackActionCount: 0 },
  });
});

test("preannotation review effort records exact actions without estimating analyst time", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/trackingPreannotationReviewEffortService.js",
  ));
  const at = (second) => `2026-08-31T14:00:${String(second).padStart(2, "0")}.000Z`;
  let effort = service.recordTrackingPreannotationReviewEffort({}, "open", { at: at(0) });
  effort = service.recordTrackingPreannotationReviewEffort(effort, "accept", { at: at(1) });
  effort = service.recordTrackingPreannotationReviewEffort(effort, "reject", { at: at(2) });
  effort = service.recordTrackingPreannotationReviewEffort(effort, "undo", { at: at(3) });
  effort = service.recordTrackingPreannotationReviewEffort(effort, "defer", { at: at(4) });
  effort = service.recordTrackingPreannotationReviewEffort(effort, "correction-handoff", { at: at(5) });
  effort = service.recordTrackingPreannotationReviewEffort(effort, "batch-save", {
    at: at(6),
    savedTrackCount: 4,
  });

  expect(service.summarizeTrackingPreannotationReviewEffort(effort, 10)).toMatchObject({
    coverage: "complete",
    openedCount: 1,
    decisionActionCount: 2,
    reviewActionCount: 6,
    reworkActionCount: 2,
    savedTrackActionCount: 5,
    reviewActionsPer100Suggestions: 60,
    undoPer100Decisions: 50,
    correctionHandoffsPer100SavedTracks: 20,
    firstOpenedAt: at(0),
    lastActionAt: at(6),
  });
  expect(() => service.recordTrackingPreannotationReviewEffort(effort, "batch-save", {
    at: at(7),
    savedTrackCount: 0,
  })).toThrow(/at least one track/i);
  expect(() => service.recordTrackingPreannotationReviewEffort(effort, "idle", { at: at(7) }))
    .toThrow(/unsupported/i);
  expect(() => service.normalizeTrackingPreannotationReviewEffort({
    coverage: "complete",
    sourcePath: "/private/match.mp4",
  })).toThrow(/unsupported field/i);
  expect(() => service.normalizeTrackingPreannotationReviewEffort({ openedCount: Number.NaN }))
    .toThrow(/invalid review open count/i);
});

test("preannotation campaign refuses effort restored from another exact clip or source", async () => {
  const controllerModule = await import(moduleUrl(
    "src/modules/video-analysis/controllers/trackingPreannotationCampaignController.js",
  ));
  let saveCount = 0;
  const controller = controllerModule.createTrackingPreannotationCampaignController({
    getWindow: () => ({}),
    now: () => "2026-08-31T15:00:00.000Z",
    loadCampaignCases: async () => [{
      workspaceSha256: "b".repeat(64),
      packId: "real-match-pack",
      caseId: "attacking-third",
      itemId: "item-review",
      clipId: "another-clip",
      angleId: "primary",
      sourceSha256: "c".repeat(64),
      totalSuggestionCount: 25,
      pendingCount: 25,
      acceptedCount: 0,
      rejectedCount: 0,
      savedCount: 0,
      reviewEffort: { coverage: "complete", openedCount: 1 },
      updatedAt: "2026-08-31T14:00:00.000Z",
    }],
    saveCampaignCase: async () => { saveCount += 1; },
  });
  const session = {
    scope: scope(),
    campaign: campaign(),
    caseId: "attacking-third",
    itemId: "item-review",
    clipId: "clip-review",
    angleId: "primary",
    sourceSha256: "a".repeat(64),
    entries: Array.from({ length: 25 }),
  };
  const result = await controller.open(session, {
    pendingCount: 25,
    acceptedCount: 0,
    rejectedCount: 0,
    savedCount: 0,
  });

  expect(result).toMatchObject({
    status: "error",
    error: "Campaign progress belongs to another clip or match source.",
  });
  expect(saveCount).toBe(0);
  expect(session.reviewEffort).toMatchObject({ coverage: "complete", openedCount: 0 });
});
