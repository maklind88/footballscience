import { expect, test } from "@playwright/test";
import fs from "node:fs";

const fixturePath = process.env.SCOUTING_IMPORT_FIXTURE || "";
const hasFixture = Boolean(fixturePath) && fs.existsSync(fixturePath);
const workspaceHubKey = "football-workspace-hub-v3";

test.skip(!hasFixture, "Set SCOUTING_IMPORT_FIXTURE to run the production-shaped Excel import check.");

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page
      .locator(
        "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
      )
      .first()
      .click({ force: true, timeout: 500 })
      .catch(() => {});
    await page.waitForTimeout(80);
  }
}

test("Scouting parses and previews a production-shaped workbook without freezing the workspace", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors = [];
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
    console.log("[scouting-data-import] page error", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) browserErrors.push(message.text());
  });
  page.on("dialog", async (dialog) => dialog.dismiss().catch(() => {}));

  await page.addInitScript(({ key }) => {
    window.localStorage.removeItem("football-scouting-v1");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        activeWorkspaceId: "home",
        workspaceAccess: {
          home: { view: ["admin"], edit: ["admin"] },
          scouting: { view: ["admin"], edit: ["admin"] },
        },
      })
    );
  }, { key: workspaceHubKey });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await dismissDashboardModal(page);
  await page.evaluate(() => {
    const user = {
      id: "qa-admin",
      email: "admin@footballscience.test",
      firstName: "QA",
      lastName: "Admin",
      username: "qa-admin",
      role: "admin",
      title: "QA",
      department: "Football",
      clubId: "club-ncc",
      clubName: "North Carolina Courage",
      teamId: "team-ncc-first",
      teamName: "North Carolina Courage",
      team: "North Carolina Courage",
      status: "active",
    };
    window.platformAuthStore?.writeUsers?.([user]);
    window.platformAuthStore?.setCurrentUser?.(user.id);
  });
  await expect.poll(() => page.evaluate(() => document.body.dataset.userRole || ""), { timeout: 10_000 }).toBe("admin");

  await page.locator('[data-open-workspace="scouting"]:visible').first().click();
  await expect(page.locator('[data-workspace-view="scouting"].is-active')).toBeVisible({ timeout: 10_000 });
  await page.locator(".scouting-settings-menu > summary").click();
  await page.locator('[data-open-scouting-settings-panel="datasource"]').click();
  await expect(page.locator("[data-scouting-settings-data-tools]")).toBeVisible();

  await page.evaluate(() => {
    const samples = [];
    const phases = [];
    const longTasks = [];
    const startedAt = performance.now();
    let last = performance.now();
    window.__scoutingImportResponsivenessInterval = window.setInterval(() => {
      const now = performance.now();
      samples.push(now - last);
      last = now;
      const phase = document.querySelector("[data-scouting-import-progress-label]")?.textContent?.trim()
        || document.querySelector(".scouting-import-status p")?.textContent?.trim()
        || "idle";
      if (phases.at(-1)?.phase !== phase) phases.push({ phase, atMs: Math.round(now - startedAt) });
    }, 16);
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => longTasks.push({
        atMs: Math.round(entry.startTime - startedAt),
        durationMs: Math.round(entry.duration),
      }));
    });
    observer.observe({ type: "longtask", buffered: true });
    window.__scoutingImportResponsivenessSamples = samples;
    window.__scoutingImportPhases = phases;
    window.__scoutingImportLongTasks = longTasks;
    window.__scoutingImportLongTaskObserver = observer;
  });

  const startedAt = Date.now();
  await page.locator("[data-scouting-import-file]").setInputFiles(fixturePath);
  const interactionStartedAt = Date.now();
  await page.locator("[data-close-scouting-settings-panel]").click();
  await expect(page.locator("[data-scouting-settings-overlay]")).toBeHidden();
  const interactionLatencyMs = Date.now() - interactionStartedAt;
  await page.locator(".scouting-settings-menu > summary").click();
  await page.locator('[data-open-scouting-settings-panel="datasource"]').click();
  await expect(page.locator("[data-scouting-settings-data-tools]")).toBeVisible();
  await expect(page.locator(".scouting-import-diff-preview")).toBeVisible({ timeout: 90_000 });
  const elapsedMs = Date.now() - startedAt;
  const responsiveness = await page.evaluate(() => {
    window.clearInterval(window.__scoutingImportResponsivenessInterval);
    window.__scoutingImportLongTaskObserver?.disconnect();
    const samples = window.__scoutingImportResponsivenessSamples || [];
    return {
      maxGapMs: Math.round(Math.max(0, ...samples)),
      maxLongTaskMs: Math.round(Math.max(0, ...(window.__scoutingImportLongTasks || []).filter((entry) => entry.atMs >= 0).map((entry) => entry.durationMs))),
      samples: samples.length,
      phases: window.__scoutingImportPhases || [],
      longTasks: window.__scoutingImportLongTasks || [],
      performanceEntries: window.__footballScienceScoutingPerformance?.entries?.filter((entry) => entry.label.startsWith("import.")) || [],
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      status: document.querySelector(".scouting-import-status")?.textContent?.trim() || "",
      preview: document.querySelector(".scouting-import-diff-preview")?.textContent?.trim() || "",
    };
  });

  console.log(`[scouting-data-import] preview ${elapsedMs}ms, max event-loop gap ${responsiveness.maxGapMs}ms`);
  console.log(`[scouting-data-import] settings interaction ${interactionLatencyMs}ms, max main-thread task ${responsiveness.maxLongTaskMs}ms`);
  console.log("[scouting-data-import] phases", responsiveness.phases);
  console.log("[scouting-data-import] long tasks", responsiveness.longTasks);
  console.log("[scouting-data-import] performance", responsiveness.performanceEntries);
  expect(elapsedMs).toBeLessThan(30_000);
  expect(interactionLatencyMs).toBeLessThan(500);
  expect(responsiveness.maxLongTaskMs).toBeLessThan(500);
  expect(responsiveness.samples).toBeGreaterThan(5);
  expect(responsiveness.overflow).toBeLessThanOrEqual(1);
  expect(responsiveness.status).toContain("Preview ready");
  expect(responsiveness.preview).toMatch(/rows/i);
  expect(responsiveness.performanceEntries.find((entry) => entry.label === "import.parse")?.detail).toMatchObject({ rows: "24351" });
  expect(responsiveness.performanceEntries.find((entry) => entry.label === "import.prepare")?.detail).toMatchObject({ metrics: "100" });
  expect(browserErrors).toEqual([]);
});
