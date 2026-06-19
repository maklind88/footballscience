import { expect, test } from "@playwright/test";

const scheduleKey = "football-schedule-v1";
const hasLiveCredentials = Boolean(process.env.LIVE_QA_USERNAME && process.env.LIVE_QA_PASSWORD);
const expectsAdminCredentials = process.env.LIVE_QA_EXPECT_ADMIN === "1";

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

async function waitForAppReady(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const loadError = document.body.dataset.appLoadError || "";
          if (loadError) {
            return `error: ${loadError}`;
          }
          return window.__footballScienceAppReady ? "ready" : "loading";
        }),
      { timeout: 75_000 }
    )
    .toBe("ready");
}

async function waitForCentralStateReady(page, options = {}) {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const bridge = window.footballScienceCentralState;
          if (!bridge?.getStatus) {
            return "missing";
          }
          const status = bridge.getStatus() || {};
          if (status.hydrated && !status.hydrating && !status.lastError) {
            return "ready";
          }
          if (!status.hydrating && typeof bridge.hydrate === "function") {
            try {
              await bridge.hydrate({ forceApply: true });
            } catch {}
          }
          const nextStatus = bridge.getStatus?.() || status;
          if (nextStatus.hydrated && !nextStatus.hydrating && !nextStatus.lastError) {
            return "ready";
          }
          const lastError = String(nextStatus.lastError || "").trim() || "none";
          return `hydrated=${Boolean(nextStatus.hydrated)} hydrating=${Boolean(nextStatus.hydrating)} error=${lastError}`;
        }),
      { timeout: options.timeout ?? 75_000, intervals: [500, 1_000, 2_000, 3_000] }
    )
    .toBe("ready");
}

async function establishServerBackedSession(page) {
  const endpointBase = new URL("/", page.url()).origin;
  const loginResponse = await page.request.post(`${endpointBase}/api/client-config`, {
    data: {
      email: process.env.LIVE_QA_USERNAME,
      password: process.env.LIVE_QA_PASSWORD,
    },
    timeout: 75_000,
  });
  const loginPayload = await loginResponse.json().catch(() => ({}));
  expect(
    loginResponse.ok(),
    `API login failed: ${loginResponse.status()} ${loginPayload?.reason || loginPayload?.message || "no reason"}`
  ).toBeTruthy();

  const session = loginPayload?.session || {};
  expect(session.access_token, "API login did not return an access token.").toBeTruthy();
  expect(session.refresh_token, "API login did not return a refresh token.").toBeTruthy();

  const centralResponse = await page.request.get(`${endpointBase}/api/app-state`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    timeout: 15_000,
  });
  const centralPayload = await centralResponse.json().catch(() => ({}));
  expect(
    centralResponse.ok(),
    `API app-state auth failed: ${centralResponse.status()} ${centralPayload?.reason || centralPayload?.message || "no reason"}`
  ).toBeTruthy();

  const setSessionStatus = await page.evaluate(async (nextSession) => {
    const client = window.platformAuthStore?.getSupabaseClient?.();
    if (!client?.auth?.setSession) {
      return "missing Supabase client";
    }
    const { error } = await client.auth.setSession({
      access_token: nextSession.access_token,
      refresh_token: nextSession.refresh_token,
    });
    return error?.message || "ok";
  }, session);
  expect(setSessionStatus).toBe("ok");

  await expect
    .poll(() => page.evaluate(async () => String((await window.platformAuthStore?.getAccessToken?.()) || "")), {
      timeout: 15_000,
    })
    .not.toBe("");
}

async function signIn(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForAuthReady(page);
  await waitForAppReady(page);
  if (await page.locator("#loginScreen:visible").count()) {
    await expect(page.locator('#loginForm button[type="submit"]')).toBeEnabled();
    await page.locator("#loginUsername").fill(process.env.LIVE_QA_USERNAME);
    await page.locator("#loginPassword").fill(process.env.LIVE_QA_PASSWORD);
    await page.locator('#loginForm button[type="submit"]').click();
  }

  await expect(page.locator("#hubShell")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#loginScreen")).toBeHidden();
  try {
    await waitForCentralStateReady(page, { timeout: 15_000 });
  } catch {
    await establishServerBackedSession(page);
    await waitForCentralStateReady(page);
  }
  await dismissDashboardModal(page);
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  const visibleTrigger = page.locator(`[data-open-workspace="${workspaceId}"]:visible`).first();
  if ((await visibleTrigger.count()) > 0) {
    await visibleTrigger.click();
  } else {
    const moreMenu = page.locator(".platform-nav-more").first();
    if ((await moreMenu.count()) > 0) {
      await moreMenu.evaluate((node) => {
        node.open = true;
      });
    }
    const sidebarTrigger = page.locator(`#workspaceList [data-open-workspace="${workspaceId}"]`).first();
    if ((await sidebarTrigger.count()) > 0) {
      await sidebarTrigger.evaluate((button) => button.click());
    } else {
      await page.evaluate((targetWorkspaceId) => {
        window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
      }, workspaceId);
    }
  }
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
          timeout: 75_000,
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
          const centralResponse = await page.request.get(`${endpointBase}/api/app-state?fresh=1`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "x-footballscience-fresh-state": "1",
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

test("production admin account can open Access & Users", async ({ page }) => {
  test.skip(!expectsAdminCredentials, "This live smoke account is not expected to have admin access.");

  await signIn(page);

  await expect
    .poll(() => page.evaluate(() => window.platformAuthStore?.getCurrentUser?.()?.role || ""), { timeout: 10_000 })
    .toBe("admin");

  await openWorkspace(page, "admin");
  await expect(page.locator("#adminWorkspace")).toContainText("Access & Users");
  await expect(page.locator("#adminWorkspace")).toContainText("Platform Admin");
});

test("production test account can open the unified Scouting database", async ({ page }) => {
  await signIn(page);

  const endpointBase = new URL("/", page.url()).origin;
  const token = await page.evaluate(() => window.platformAuthStore?.getAccessToken?.() || "");
  expect(token).toBeTruthy();

  const statusResponse = await page.request.get(`${endpointBase}/api/football-science-db?action=status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(statusResponse.ok()).toBeTruthy();
  const statusPayload = await statusResponse.json();
  expect(statusPayload.canRead).toBe(true);

  await openWorkspace(page, "scouting");
  const databaseTab = page.locator('.scouting-tab[data-scouting-tab="database"]').first();
  await expect(databaseTab).toBeVisible({ timeout: 15_000 });
  await databaseTab.click();

  await expect(page.locator("[data-scouting-load-fsdb]")).toHaveCount(0);
  const loadButton = page.locator("[data-scouting-load-database], [data-scouting-retry-database]").first();
  await expect(loadButton).toBeVisible({ timeout: 15_000 });
  await loadButton.click();

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const workspace = document.querySelector('[data-workspace-view="scouting"].is-active');
          const text = workspace?.innerText || "";
          const playerRows = workspace?.querySelectorAll("[data-open-scouting-record]").length || 0;
          if (/must be signed in|needs sign-in|requires an authenticated session/i.test(text)) {
            return "auth-error";
          }
          if (/Scouting database failed/i.test(text)) {
            return "terminal-error";
          }
          if (
            playerRows > 0 ||
            /players match/i.test(text) ||
            /No players found this page/i.test(text)
          ) {
            return "ready";
          }
          return "loading";
        }),
      { timeout: 45_000 }
    )
    .toMatch(/^(ready|terminal-error)$/);
});

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
