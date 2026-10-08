import { test, expect } from "@playwright/test";

async function install(page, scope = "owner-A") {
  await page.evaluate(async scope => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    const indicator = document.createElement("div"); indicator.setAttribute("role", "status"); document.body.append(indicator);
    window.__saveScope = scope;
    const service = createDataSafetyRuntimeService({ win: window, documentRef: document, navigatorRef: {}, storageConstructor: Storage,
      protectedStorageKeys: ["football-medical-team-v1", "football-schedule-v1"], ui: { dataSafetyStatus: indicator },
      getCentralStateBridge: () => ({ getReadScope: () => window.__saveScope, canAutoSyncKey: () => true,
        getStatus: () => ({ lastSyncedAt: "2026-10-08T12:00:00Z" }) }),
      queueCentralStateWrite: () => true,
    });
    service.install(); window.__safety = service; window.__indicator = indicator;
  }, scope);
}

async function status(page) {
  return page.evaluate(() => {
    window.__safety.refreshStatus();
    return { text: window.__indicator.textContent, title: window.__indicator.title,
      backedUp: window.__indicator.classList.contains("is-backed-up") };
  });
}

test("Medical failure survives an unrelated save, snapshot and browser reload until its own successful retry", async ({ page }) => {
  let writes = 0; page.on("request", request => { if (request.method() !== "GET") writes++; });
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(async () => {
    localStorage.setItem("football-medical-team-v1", "retained saved value");
    window.footballScienceDataSafety.reportSaveIssue("football-medical-team-v1", "Medical saving is not confirmed");
    localStorage.setItem("football-schedule-v1", "new schedule");
    await window.__safety.saveSnapshot("synthetic-qa");
  });
  expect(await status(page)).toEqual({ text: "Autosave needs attention", title: "Medical saving is not confirmed", backedUp: false });
  await page.reload(); await install(page);
  await page.evaluate(() => localStorage.setItem("football-schedule-v1", "another schedule"));
  expect((await status(page)).title).toBe("Medical saving is not confirmed");
  expect(await page.evaluate(() => localStorage.getItem("football-medical-team-v1"))).toBe("retained saved value");
  await page.evaluate(() => localStorage.setItem("football-medical-team-v1", "retried Medical draft"));
  expect(await status(page)).toMatchObject({ text: expect.stringMatching(/^Sync pending/), backedUp: false });
  expect(writes).toBe(0);
});

test("a second tab cannot clear another account's issue and returning to the owner restores its warning", async ({ context, page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(() => window.footballScienceDataSafety.reportSaveIssue("football-medical-team-v1", "Owner A save issue"));
  const other = await context.newPage(); await other.goto("/medical-merge.js"); await install(other, "owner-B");
  expect((await status(other)).title).not.toContain("Owner A save issue");
  await other.evaluate(() => localStorage.setItem("football-medical-team-v1", "owner B draft"));
  expect((await status(page)).title).toBe("Owner A save issue");
  await other.evaluate(() => { window.__saveScope = "owner-A"; });
  expect((await status(other)).title).toBe("Owner A save issue");
  await other.close();
});

test("a warning in another tab remains until that module is actually retried", async ({ context, page }) => {
  await page.goto("/medical-merge.js"); await install(page);
  await page.evaluate(() => window.footballScienceDataSafety.reportSaveIssue("football-medical-team-v1", "Unconfirmed Medical draft"));
  const other = await context.newPage(); await other.goto("/medical-merge.js"); await install(other);
  await other.evaluate(() => localStorage.setItem("football-schedule-v1", "new schedule"));
  expect((await status(page)).title).toBe("Unconfirmed Medical draft");
  await other.evaluate(() => localStorage.setItem("football-medical-team-v1", "retried draft"));
  expect(await status(page)).toMatchObject({ text: expect.stringMatching(/^Sync pending/), backedUp: false });
  await other.close();
});
