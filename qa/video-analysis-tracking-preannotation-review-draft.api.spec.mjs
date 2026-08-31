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
    videoId: "video-review",
    clipId: "clip-review",
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    scope: scope(),
    itemId: "item-review",
    clipId: "clip-review",
    angleId: "primary",
    sourceSha256: "a".repeat(64),
    workspaceSha256: "b".repeat(64),
    caseId: "attacking-third",
    totalSuggestionCount: 4653,
    decisions: [
      { trackId: "track-2", decision: "accepted" },
      { trackId: "track-1", decision: "rejected" },
    ],
    history: [
      { trackId: "track-1", decision: "rejected" },
      { trackId: "track-2", decision: "accepted" },
    ],
    ...overrides,
  };
}

test("local preannotation review draft is exact, scoped, bounded, and reproducible", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingPreannotationReviewStore.js",
  ));
  const record = service.createLocalTrackingPreannotationReviewDraft(draft(), {
    now: () => "2026-08-31T12:00:00.000Z",
  });

  expect(record).toMatchObject({
    version: 1,
    protocol: "football-science-local-tracking-preannotation-review-v1",
    scopeId: record.scope.id,
    itemId: "item-review",
    clipId: "clip-review",
    decisionCount: 2,
    updatedAt: "2026-08-31T12:00:00.000Z",
  });
  expect(record.decisions.map((entry) => entry.trackId)).toEqual(["track-1", "track-2"]);
  expect(record.history.map((entry) => entry.trackId)).toEqual(["track-1", "track-2"]);
  expect(service.validateLocalTrackingPreannotationReviewDraft(record)).toEqual(record);
  expect(service.localTrackingPreannotationReviewDraftId(scope(), draft())).toBe(record.id);
});

test("local preannotation review draft rejects scope drift, duplicates, and mismatched history", async () => {
  const service = await import(moduleUrl(
    "src/modules/video-analysis/services/localTrackingPreannotationReviewStore.js",
  ));
  expect(() => service.createLocalTrackingPreannotationReviewDraft(draft({ clipId: "other-clip" })))
    .toThrow("does not belong to this clip");
  expect(() => service.createLocalTrackingPreannotationReviewDraft(draft({
    decisions: [
      { trackId: "track-1", decision: "accepted" },
      { trackId: "track-1", decision: "rejected" },
    ],
  }))).toThrow("invalid or duplicated");
  expect(() => service.createLocalTrackingPreannotationReviewDraft(draft({
    history: [
      { trackId: "track-1", decision: "accepted" },
      { trackId: "track-2", decision: "accepted" },
    ],
  }))).toThrow("does not match its decisions");
  expect(() => service.validateLocalTrackingPreannotationReviewDraft({
    ...service.createLocalTrackingPreannotationReviewDraft(draft()),
    decisionCount: 3,
  })).toThrow("identity is invalid");
});
