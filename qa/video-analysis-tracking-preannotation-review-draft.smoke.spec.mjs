import { expect, test } from "@playwright/test";

test("preannotation review progress survives reload only for its exact sealed identity", async ({ page }) => {
  await page.goto("/qa/video-analysis-browser-smoke.html?preannotation-review-draft=1", {
    waitUntil: "domcontentloaded",
  });
  const result = await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("football-science-tracking-preannotation-reviews");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
      request.onblocked = () => resolve(false);
    });
    const store = await import(
      "/src/modules/video-analysis/services/localTrackingPreannotationReviewStore.js"
    );
    const scope = {
      organizationId: "org-review-smoke",
      teamId: "team-review-smoke",
      userId: "analyst-review-smoke",
      matchId: "match-review-smoke",
      videoId: "video-review-smoke",
      clipId: "clip-review-smoke",
    };
    const identity = {
      itemId: "item-review-smoke",
      clipId: scope.clipId,
      angleId: "primary",
      sourceSha256: "a".repeat(64),
      workspaceSha256: "b".repeat(64),
      caseId: "attacking-third",
    };
    const saved = await store.saveLocalTrackingPreannotationReviewDraft(scope, {
      ...identity,
      totalSuggestionCount: 4653,
      decisions: [{ trackId: "track-review-1", decision: "rejected" }],
      history: [{ trackId: "track-review-1", decision: "rejected" }],
    }, { win: window, now: () => "2026-08-31T12:00:00.000Z" });
    const restored = await store.getLocalTrackingPreannotationReviewDraft(scope, identity, window);
    const isolated = await store.getLocalTrackingPreannotationReviewDraft(scope, {
      ...identity,
      workspaceSha256: "c".repeat(64),
    }, window);
    await store.removeLocalTrackingPreannotationReviewDraft(scope, identity, window);
    const removed = await store.getLocalTrackingPreannotationReviewDraft(scope, identity, window);
    return {
      savedCount: saved.decisionCount,
      restoredDecision: restored.decisions[0].decision,
      isolated,
      removed,
    };
  });

  expect(result).toEqual({
    savedCount: 1,
    restoredDecision: "rejected",
    isolated: null,
    removed: null,
  });
});
