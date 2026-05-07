import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionPlannerKey = "football-session-planner-v3";
const medicalKey = "football-medical-team-v1";

async function dismissDashboardModal(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const isOpen = await page.evaluate(() => {
      const modalRoot = document.getElementById("dashboardModalRoot");
      return Boolean(modalRoot && !modalRoot.hidden);
    });

    if (isOpen) {
      const closeButton = page
        .locator(
          "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close]"
        )
        .first();

      if ((await closeButton.count()) > 0) {
        await closeButton.click({ force: true });
      }

      await expect
        .poll(
          () =>
            page
              .locator("#dashboardModalRoot")
              .evaluate((node) => node.hidden)
              .catch(() => true),
          { timeout: 5_000 }
        )
        .toBe(true);
    }

    await page.waitForTimeout(150);
  }
}

async function bootApp(page, options = {}) {
  const clientConfigRequests = [];
  const pageErrors = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/client-config")) {
      clientConfigRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") {
      await dialog.accept();
      return;
    }
    await dialog.dismiss().catch(() => {});
  });

  await page.goto(options.path || "/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.footballScienceDataSafety), null, { timeout: 15_000 });
  await page.waitForTimeout(450);
  await dismissDashboardModal(page);

  return {
    clientConfigRequests,
    pageErrors,
  };
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  await page.locator(`[data-open-workspace="${workspaceId}"]:visible`).first().click();
  await dismissDashboardModal(page);
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

async function expectStorageContains(page, key, text) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ storageKey, expectedText }) => window.localStorage.getItem(storageKey)?.includes(expectedText) ?? false,
          { storageKey: key, expectedText: text }
        ),
      { timeout: 10_000 }
    )
    .toBe(true);
}

test("localhost boots through dev auth and keeps Supabase config off the local path", async ({ page }) => {
  const boot = await bootApp(page);

  expect(boot.clientConfigRequests).toEqual([]);
  expect(boot.pageErrors).toEqual([]);
  await expect(page.locator("#workspaceTitle")).toContainText("Football Science");

  await page.locator("#profileMenuButton").click();
  await expect(page.locator("#dataSafetyStatus")).toBeVisible();
  await expect(page.locator("#dataSafetyStatus")).toContainText(/sync|autosave|saved|cache/i);
  await expect(page.locator("#dataSafetyExportButton")).toBeVisible();
  await expect(page.locator("#dataSafetyImportButton")).toBeVisible();
});

test("Schedule edits persist after refresh", async ({ page }) => {
  const title = `QA Schedule ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "schedule");

  await page.locator("#scheduleTodayButton").click();
  await page.locator("#scheduleEditDayButton").click();
  await expect(page.locator("#scheduleEventForm")).toBeVisible();
  await page.locator("#scheduleEventTitle").fill(title);
  await page.locator("#scheduleEventNote").fill("QA smoke test event");
  await page.locator("#scheduleEventSubmitButton").click();
  await expect(page.locator("#scheduleEventList")).toContainText(title);
  await expectStorageContains(page, scheduleKey, title);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await openWorkspace(page, "schedule");
  await expectStorageContains(page, scheduleKey, title);
});

test("Periodization day notes persist after refresh", async ({ page }) => {
  const note = `QA Periodization ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "periodization");

  await page.locator("#periodizationTodayButton").click();
  await expect(page.locator("[data-periodization-overlay]")).toBeVisible();
  await page.locator("[data-periodization-edit-selected]").click();
  const notesField = page.locator('textarea[data-periodization-field="sessionNotes"]').first();
  await expect(notesField).toBeVisible();
  await notesField.fill(note);
  await notesField.blur();
  await expectStorageContains(page, periodizationKey, note);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, periodizationKey, note);
});

test("Session Planner block edits persist after refresh", async ({ page }) => {
  const value = `QA Session ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "session-planner");

  let field = page.locator('[data-session-field="objective"]:visible').first();
  if ((await field.count()) === 0) {
    field = page.locator("[data-session-field]:visible").first();
  }
  await expect(field).toBeVisible();
  await field.fill(value);
  await field.blur();
  await expectStorageContains(page, sessionPlannerKey, value);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, sessionPlannerKey, value);
});

test("Medical recommendation edits persist after refresh", async ({ page }) => {
  const comment = `QA Medical ${Date.now()}`;
  await bootApp(page);
  await openWorkspace(page, "medical-team");

  await page.locator("[data-medical-select-player]:visible").first().click();
  const form = page.locator("#medicalRecommendationForm:visible").first();
  await expect(form).toBeVisible();
  await form.locator('textarea[name="comment"]').fill(comment);
  await form.locator('button[type="submit"]').click();
  await expectStorageContains(page, medicalKey, comment);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expectStorageContains(page, medicalKey, comment);
});
