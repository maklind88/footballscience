import { expect, test } from "@playwright/test";
import { createSessionSaveChainTiming, readSessionSaveChainDiagnostics } from "./helpers/session-save-chain-diagnostics.mjs";

test("Sessions diagnostics correlate synthetic timings without exposing identities, journal rows or conflict paths", async ({ page, baseURL }) => {
  let now = 100;
  const timing = createSessionSaveChainTiming(() => now);
  timing.markCommit("private-operation-a");
  now = 111;
  timing.markAcknowledged("private-operation-a");
  now = 119;
  timing.markAcknowledged("private-operation-a"); // retries keep the first observation
  timing.markCommit("private-operation-b");
  now = 130;
  timing.markVisible("private-operation-a");
  timing.markVisible("private-operation-b");
  expect(timing.summary()).toEqual([
    { commitToIndependentViewMs: 30, acknowledgementToIndependentViewMs: 19, committed: true, acknowledged: true, independentlyVisible: true },
    { commitToIndependentViewMs: 11, acknowledgementToIndependentViewMs: null, committed: true, acknowledged: false, independentlyVisible: true },
  ]);

  // Synthetic browser origin with the same IndexedDB schema and identity-read
  // contract. Capture exactly the fields that are allowed to leave the page.
  await page.route(`${baseURL}/session-diagnostic-fixture`, (route) => route.fulfill({ body: "<!doctype html>", contentType: "text/html" }));
  await page.goto(`${baseURL}/session-diagnostic-fixture`);
  const at = Date.UTC(2026, 10, 24);
  await page.clock.setFixedTime(at);
  await page.evaluate(async (at) => {
    const actor = { id: "private-actor", clubId: "private-club", teamId: "private-team" };
    const scope = JSON.stringify(["sessions-actor-team-v1", actor.id, actor.clubId, actor.teamId]);
    window.platformAuthStore = { getCurrentUser: () => actor };
    window.footballScienceCentralState = { getReadScope: () => "private-read-scope", canAutoSyncKey: () => true };
    const request = indexedDB.open("football-science-data-safety-v1");
    request.onupgradeneeded = () => request.result.createObjectStore("latest", { keyPath: "id" });
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("latest", "readwrite");
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = reject;
        const store = tx.objectStore("latest");
        const put = (n, status, fields = {}) => store.put({ id: `session-save:private-operation-${n}`, status, scope,
          change: { title: "private-work-text" }, ...fields });
        put(1, "pending", { createdAt: (at - 400) * 1000 + 1 });
        put(2, "pending", { createdAt: at - 700 });
        put(3, "pending", { createdAt: (at + 2000) * 1000 });
        put(4, "pending", { scope: "other-actor", createdAt: at - 25_000 });
        put(5, "review", { conflicts: ["2026-11-24.session.blocks.private-player-reference"] });
        put(6, "review", { conflicts: ["An earlier local version needs review."] });
        put(7, "review", { conflicts: ["private-freeform-reason"] });
        put(8, "archived");
      });
    } finally { db.close(); }
  }, at);
  expect(await readSessionSaveChainDiagnostics(page)).toEqual({
    journal: "read", pendingCount: 3, oldestPendingAgeMs: 700, unmeasurablePendingCount: 1,
    reviewCounts: { centralConflict: 1, earlierVersion: 1, unknown: 1 },
  });
  await page.evaluate(() => { window.footballScienceCentralState.canAutoSyncKey = () => false; });
  expect(await readSessionSaveChainDiagnostics(page)).toEqual({
    journal: "not-authorized", pendingCount: null, oldestPendingAgeMs: null, unmeasurablePendingCount: null, reviewCounts: null,
  });
});
