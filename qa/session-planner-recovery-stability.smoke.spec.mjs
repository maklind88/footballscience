import { expect, test } from "@playwright/test";

const key = "football-session-planner-v3";
const date = "2026-09-08";
const emptyDate = "2026-09-09";
const pulse = (page) => page.evaluate(() => window.dispatchEvent(new CustomEvent("footballscience:central-state-ready")));

async function boot(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ key, date }) => {
    if (localStorage.getItem(key)) return;
    const elements = [{ id: "player", type: "blue-player", x: 25, y: 35, playerNumber: "CB" }];
    const block = { id: "qa-recovery", title: "Recovery safety", label: "Block 1", minutes: 15,
      objective: "Current objective", principles: "Keep position and timing", diagram: "empty",
      tacticalElements: elements, tacticalFrames: [{ id: "f1", label: "Frame 1", elements }], tacticalActiveFrameId: "f1" };
    localStorage.setItem(key, JSON.stringify({ selectedDate: date, sessions: {
      [date]: { id: `session-${date}`, date, title: "QA Training", selectedBlockId: block.id, blocks: [block] },
    } }));
    localStorage.setItem("football-periodization-v2", JSON.stringify({ selectedDate: date, days: { [date]: { sessionType: "Training" } } }));
    localStorage.setItem("football-schedule-v1", JSON.stringify({ selectedDate: date, events: [{ id: "qa-training", date, type: "training", title: "QA Training" }] }));
  }, { key, date });
  await page.goto("/?workspace=session-planner", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.evaluate(({ key, date }) => {
    window.__qaRecoveryRevision = 11;
    const getStatus = window.footballScienceCentralState.getStatus;
    window.footballScienceCentralState.getStatus = () => ({ ...getStatus(),
      metadata: { [key]: { revision: window.__qaRecoveryRevision, organizationId: "qa-recovery-org" } },
    });
    window.__qaOriginalSession = localStorage.getItem(key);
    window.__qaExercise = JSON.parse(window.__qaOriginalSession).sessions[date].blocks[0];
  }, { key, date });
  return errors;
}

for (const width of [1470, 390]) {
  test(`sync preserves an empty selected day and does not rebuild unchanged Sessions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 820 });
    const errors = await boot(page);
    await page.locator(`[data-session-date="${emptyDate}"]`).click();
    await expect(page.locator(".session-date-pill.is-active")).toHaveAttribute("data-session-date", emptyDate);
    await pulse(page);
    await expect(page.locator(".session-date-pill.is-active")).toHaveAttribute("data-session-date", emptyDate);
    await expect(page.getByText("Add a block to start building this session.", { exact: true })).toBeVisible();
    await page.evaluate(() => { window.__qaSessionsRoot = document.querySelector(".session-overview-title"); });
    await pulse(page);
    expect(await page.evaluate(() => window.__qaSessionsRoot === document.querySelector(".session-overview-title"))).toBe(true);
    expect(await page.evaluate(({ key }) => localStorage.getItem(key) === window.__qaOriginalSession, { key })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`stable-empty-day-${width}.png`) });
    await page.locator(`[data-session-date="${date}"]`).click();
    const objective = page.locator('[data-session-field="objective"]');
    await objective.fill("Edited after background sync");
    await objective.press("Tab");
    await expect.poll(() => page.evaluate(({ key, date }) => JSON.parse(localStorage.getItem(key)).sessions[date].blocks[0].objective, { key, date }))
      .toBe("Edited after background sync");
    await page.reload();
    await page.waitForFunction(() => window.__footballScienceAppReady);
    await expect(page.locator('[data-session-field="objective"]')).toHaveValue("Edited after background sync");
    expect(await page.locator('[data-session-tactical-element-id="player"] .session-tactical-player-badge').first().textContent()).toBe("CB");
    expect(errors).toEqual([]);
  });
}

test("central reload never applies a larger historical IndexedDB backup", async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(async ({ key, date }) => {
    const backup = JSON.parse(localStorage.getItem(key));
    backup.sessions[date].blocks.push({ ...backup.sessions[date].blocks[0], id: "historic-extra", title: "Must not return" });
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("football-science-data-safety-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put({ id: "qa-historic-extra", reason: "autosave", createdAt: new Date().toISOString(), storage: { [key]: JSON.stringify(backup) } });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { key, date });
  await pulse(page);
  await pulse(page);
  await page.locator("[data-session-open-tacticalboard]").click();
  await expect(page.locator(".session-tacticalboard-modal")).toBeVisible();
  await expect(page.locator('.session-tacticalboard-modal [data-session-tactical-element-id="player"] .session-tactical-player-badge')).toHaveText("CB");
  expect(await page.evaluate(({ key, date }) => JSON.parse(localStorage.getItem(key)).sessions[date].blocks.map((block) => block.id), { key, date }))
    .toEqual(["qa-recovery"]);
  await expect(page.getByText("Session planner restored from local backup.", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
