import { expect, test } from "@playwright/test";

async function boot(page) {
  await page.route("**/qa/session-save-harness", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="open">Review local saves</button></body></html>' }));
  await page.goto("/qa/session-save-harness");
}

test("legacy cache archival is durable and never resets a reviewed copy", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const store = createSessionSaveStore();
    const context = { scope: "coach:org:team", revision: 10 };
    const raw = JSON.stringify({ sessions: { "2026-09-10": { title: "Unresolved", blocks: [] } } });
    await store.archiveLocal(raw, context);
    const db = await new Promise((resolve) => { const req = indexedDB.open("football-science-data-safety-v1", 1); req.onsuccess = () => resolve(req.result); });
    const read = () => new Promise((resolve) => { const req = db.transaction("snapshots").objectStore("snapshots").getAll(); req.onsuccess = () => resolve(req.result); });
    const [row] = await read();
    await new Promise((resolve) => {
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put({ ...row, reviewedDates: { "2026-09-10": "reviewed" } }); tx.oncomplete = resolve;
    });
    await store.archiveLocal(raw, { ...context, revision: 11 });
    const rows = await read(); db.close();
    return { rows, raw };
  });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ recovery: { scope: "coach:org:team", baseRevision: 10 }, reviewedDates: { "2026-09-10": "reviewed" } });
  expect(result.rows[0].storage["football-session-planner-v3"]).toBe(result.raw);
});

test("real IndexedDB retains queued frames after reload and snapshot pruning never removes unresolved copies", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const { createSessionDateChanges } = await import("/src/modules/session-planner/session-save-protocol.mjs");
    const before = { sessions: {} }, after = { sessions: { "2026-09-10": { date: "2026-09-10", blocks: [{ id: "a", tacticalFrames: Array.from({ length: 24 }, (_, i) => ({ id: `f${i}`, elements: [{ id: "p", playerNumber: "CB", x: i, y: 40 }] })) }] } } };
    await createSessionSaveStore().put({ scope: "coach:team", status: "pending", createdAt: 1, change: createSessionDateChanges(before, after, () => "durable-edit")[0] });
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const store = createSessionSaveStore();
    const rows = await store.list("coach:team");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("football-science-data-safety-v1", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const protectedId = "football-session-planner-v3-quota-fallback:coach:review:1";
    await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite"), snapshots = tx.objectStore("snapshots");
      for (let i = 0; i < 40; i++) snapshots.put({ id: `snapshot-${String(i).padStart(2, "0")}` });
      snapshots.put({ id: protectedId, reason: "session-planner-recovery-review", storage: { important: "Retained" } });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    await createDataSafetyRuntimeService({ maxSnapshots: 3 }).pruneSnapshots(db);
    const remaining = await new Promise((resolve, reject) => {
      const request = db.transaction("snapshots").objectStore("snapshots").getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return { frameCount: rows[0].change.after.session.blocks[0].tacticalFrames.length,
      marker: rows[0].change.after.session.blocks[0].tacticalFrames[0].elements[0],
      otherScope: await store.list("other:team"), remaining, queued: (await store.list("coach:team")).length };
  });
  expect(result).toMatchObject({ frameCount: 24, marker: { playerNumber: "CB", x: 0, y: 40 }, otherScope: [], queued: 1 });
  expect(result.remaining).toHaveLength(4);
  expect(result.remaining.some((row) => row.storage?.important === "Retained")).toBe(true);
});

for (const width of [1470, 390]) {
  test(`local review is readable, keyboard accessible and archives without deleting at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 752 });
    await boot(page);
    await page.evaluate(async () => {
      const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
      await createSessionSaveStore().list("initialize");
      const { createSessionLocalReviewService } = await import("/src/modules/session-planner/session-local-review-service.mjs");
      const { getSessionPlannerQuotaSnapshotId } = await import("/src/modules/session-planner/session-planner-recovery-controller.mjs");
      const { openSessionSaveReview } = await import("/src/modules/session-planner/session-save-review.mjs");
      const context = { scope: "review-coach:team", ready: true, revision: 12 };
      const key = "football-session-planner-v3", date = "2026-09-10";
      const central = { sessions: { [date]: { date, title: "Training", blocks: [{ id: "a", title: "Press", objective: "Central instruction" }] } } };
      const local = structuredClone(central); local.sessions[date].blocks[0].objective = '<img src=x onerror="window.unsafe=true"> Local instruction';
      const db = await new Promise((resolve) => { const request = indexedDB.open("football-science-data-safety-v1", 1); request.onsuccess = () => resolve(request.result); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put({ id: getSessionPlannerQuotaSnapshotId(key, context), reason: "session-planner-quota-fallback", recovery: { scope: context.scope }, storage: { [key]: JSON.stringify(local) } });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      window.reviewWrites = 0; window.refreshes = 0;
      const legacy = createSessionLocalReviewService({ openDatabase: async () => db, getContext: () => context, getCentralValue: () => JSON.stringify(central), save: async () => { window.reviewWrites++; return { ok: true }; } });
      window.readSnapshots = () => new Promise((resolve) => { const req = db.transaction("snapshots").objectStore("snapshots").getAll(); req.onsuccess = () => resolve(req.result); });
      document.querySelector("#open").addEventListener("click", () => openSessionSaveReview({ document, legacy, canReview: () => true,
        bridge: { hydrate: async () => { window.refreshes++; return true; }, getSessionSaveReviews: async () => [] } }));
    });
    await page.locator("#open").click();
    const dialog = page.getByRole("dialog", { name: "Review local saves" });
    await expect(dialog).toBeVisible();
    await dialog.locator("summary").click();
    await expect(dialog.getByText("Central instruction", { exact: true })).toBeVisible();
    await expect(dialog.locator("img")).toHaveCount(0);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`review-${width}.png`) });
    page.once("dialog", (prompt) => prompt.accept());
    await dialog.getByRole("button", { name: "Keep central version" }).click();
    await expect(dialog.getByRole("status")).toHaveText("No unresolved local versions.");
    const result = await page.evaluate(async () => ({ writes: window.reviewWrites, refreshes: window.refreshes, snapshots: await window.readSnapshots(), unsafe: Boolean(window.unsafe) }));
    expect(result.writes).toBe(0);
    expect(result.unsafe).toBe(false);
    expect(result.refreshes).toBeGreaterThanOrEqual(2);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].reviewedDates["2026-09-10"]).toBeTruthy();
    expect(result.snapshots[0].storage["football-session-planner-v3"]).toContain("Local instruction");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#open")).toBeFocused();
  });
}
