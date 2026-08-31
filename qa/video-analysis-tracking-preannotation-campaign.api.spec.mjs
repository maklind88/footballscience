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
    cases: [
      { caseId: "attacking-third", decisionCount: 15, resolvedCount: 13, complete: false, active: false },
      { caseId: "fast-transition", decisionCount: 15, resolvedCount: 15, complete: true, active: true },
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
    version: 1,
    protocol: "football-science-local-tracking-preannotation-campaign-case-v1",
    scope: {
      organizationId: "org-review",
      teamId: "team-review",
      userId: "analyst-review",
      sourceType: "match",
      sourceId: "match-review",
    },
    workspaceSha256: "b".repeat(64),
    caseId: "attacking-third",
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
});
