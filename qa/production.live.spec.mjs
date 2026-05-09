import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const hasLiveCredentials = Boolean(process.env.LIVE_QA_USERNAME && process.env.LIVE_QA_PASSWORD);

test.skip(!hasLiveCredentials, "Set LIVE_QA_USERNAME and LIVE_QA_PASSWORD for production-safe live smoke.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    }

    await page.waitForTimeout(150);
  }
}

async function waitForAuthReady(page) {
  await page.waitForFunction(() => Boolean(window.platformAuthReadyPromise), null, { timeout: 15_000 });
  await page.evaluate(() => window.platformAuthReadyPromise);
}

async function waitForCentralStateReady(page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const status = window.footballScienceCentralState?.getStatus?.();
          return Boolean(status?.hydrated && !status.hydrating && !status.lastError);
        }),
      { timeout: 20_000 }
    )
    .toBe(true);
}

async function signIn(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForAuthReady(page);
  if (await page.locator("#loginScreen:visible").count()) {
    await expect(page.locator('#loginForm button[type="submit"]')).toBeEnabled();
    await page.locator("#loginUsername").fill(process.env.LIVE_QA_USERNAME);
    await page.locator("#loginPassword").fill(process.env.LIVE_QA_PASSWORD);
    await page.locator('#loginForm button[type="submit"]').click();
  }

  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await waitForCentralStateReady(page);
  await dismissDashboardModal(page);
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
      { timeout: 15_000 }
    )
    .toBe(true);
}

async function expectCentralSyncContains(page, key, text) {
  const endpointBase = new URL("/", page.url()).origin;

  await expect
    .poll(
      async () => {
        const value = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey) || "", key);
        if (!value.includes(text)) {
          return false;
        }

        const loginResponse = await page.request.post(`${endpointBase}/api/client-config`, {
          data: {
            email: process.env.LIVE_QA_USERNAME,
            password: process.env.LIVE_QA_PASSWORD,
          },
          timeout: 15_000,
        });
        if (!loginResponse.ok()) {
          return false;
        }
        const loginPayload = await loginResponse.json();
        const token = loginPayload?.session?.access_token;
        if (!token) {
          return false;
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const centralResponse = await page.request.get(`${endpointBase}/api/app-state`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const centralPayload = centralResponse.ok() ? await centralResponse.json() : {};
          const baseRevision = Number(centralPayload?.metadata?.[key]?.revision) || 0;
          const saveResponse = await page.request.post(`${endpointBase}/api/app-state`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            data: {
              key,
              value,
              metadata: {
                baseRevision,
                revision: baseRevision,
              },
            },
          });
          if (saveResponse.ok()) {
            return true;
          }
          if (saveResponse.status() !== 409) {
            return false;
          }
        }

        return false;
      },
      { timeout: 25_000 }
    )
    .toBe(true);
}

async function removeScheduleEventIfPresent(page, title) {
  await openWorkspace(page, "schedule");
  await page.locator("#scheduleTodayButton").click();

  const editButton = page.locator("#scheduleEditDayButton");
  if ((await editButton.count()) === 0 || !(await editButton.isVisible())) {
    return;
  }

  await editButton.click();
  const removeButton = page.getByLabel(new RegExp(`^Remove ${escapeRegExp(title)}$`));
  if ((await removeButton.count()) > 0) {
    await removeButton.first().click();
    await expect(page.locator("#scheduleEventList")).not.toContainText(title);
  }
}

test("production test account can save and reload a schedule record", async ({ page }) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") {
      await dialog.accept();
      return;
    }
    await dialog.dismiss().catch(() => {});
  });

  const title = `QA Live ${Date.now()}`;

  await signIn(page);

  try {
    await openWorkspace(page, "schedule");
    await page.locator("#scheduleTodayButton").click();
    await page.locator("#scheduleEditDayButton").click();
    await expect(page.locator("#scheduleEventForm")).toBeVisible();
    await page.locator("#scheduleEventTitle").fill(title);
    await page.locator("#scheduleEventNote").fill("Production-safe smoke test. Remove automatically.");
    await page.locator("#scheduleEventSubmitButton").click();
    await expect(page.locator("#scheduleEventList")).toContainText(title);
    await expectStorageContains(page, scheduleKey, title);
    await expectCentralSyncContains(page, scheduleKey, title);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#hubShell")).toBeVisible();
    await openWorkspace(page, "schedule");
    await expect(page.locator("#scheduleEventList")).toContainText(title);
    await expectStorageContains(page, scheduleKey, title);
  } finally {
    await removeScheduleEventIfPresent(page, title).catch(() => {});
  }
});
