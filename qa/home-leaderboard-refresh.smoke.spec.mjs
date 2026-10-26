import { expect, test } from "@playwright/test";

const teamA = "44444444-4444-4444-8444-444444444444";
const teamB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const dialogRoot = "[data-leaderboard-dialog-workspace] [data-leaderboard-root]";

async function mountHome(page) {
  const errors = [];
  let writes = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__home_refresh_harness__", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="dashboardGrid"></main><div id="dialogHost"></div></body></html>',
  }));
  await page.route("**/api/leaderboard**", (route) => {
    if (route.request().method() !== "GET") {
      writes += 1;
      return route.abort();
    }
    const month = new URL(route.request().url()).searchParams.get("month");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true, schema: "footballscience-leaderboard-v1", month,
        access: { canView: true, canAward: true, canReverse: true },
        competition: { id: "synthetic-competition", status: "live" },
        summary: { eventCount: 1, totalPoints: 1 },
        roster: [{ playerId: "synthetic-player", displayName: "Synthetic Player" }],
        standings: [{ playerId: "synthetic-player", displayName: "Synthetic Player", points: 1, rank: 1, awardCount: 1 }], events: [],
      }),
    });
  });
  await page.goto("/__home_refresh_harness__");
  await page.evaluate(async (teamId) => {
    const [{ createDashboardRuntimeController }, { createLeaderboardSurfaceRuntime }, { createCentralSyncStateHandler }] = await Promise.all([
      import("/src/modules/home/dashboard-runtime-controller.mjs"),
      import("/src/core/leaderboard-surface-runtime.mjs"),
      import("/src/core/platform-central-sync-helpers.mjs"),
    ]);
    let user = { id: "synthetic-coach", role: "coach", teamId };
    let team = { id: teamId, name: "Synthetic Team" };
    let renders = 0;
    let mayView = true;
    const ui = { dashboardGrid: document.getElementById("dashboardGrid"), leaderboardDialogHost: document.getElementById("dialogHost") };
    const surface = createLeaderboardSurfaceRuntime({
      ui, win: window, getAssetVersion: () => "home-refresh-test",
      getCurrentUser: () => user, getActivePlatformTeam: () => team,
      getAuthToken: () => "synthetic-only", canView: () => Boolean(user) && mayView, canEdit: () => true,
      platformModuleLoader: {
        loadStylesheet: (_id, href) => new Promise((resolve, reject) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "/" + href;
          link.onload = resolve;
          link.onerror = reject;
          document.head.append(link);
        }),
        loadModule: (_id, load) => load(),
      },
    });
    const home = createDashboardRuntimeController({
      documentRef: document, win: window, getUi: () => ui, getCurrentUser: () => user,
      getActiveWorkspaceId: () => "home",
      homeContextSelectors: { getHomeContext: () => ({}) },
      homeCardsRenderer: { render: () => `<output id="homeVersion">${++renders}</output><div id="leaderboardSummary"></div>` },
      canViewLeaderboard: surface.canView,
      mountLeaderboardHome: surface.mountHome,
      unmountLeaderboardHome: surface.unmountHome,
    });
    const sync = createCentralSyncStateHandler({
      getHubState: () => ({ activeWorkspaceId: "home" }),
      platformAppearanceStorageKey: "synthetic-appearance",
      dashboardPresentationStorageKey: "synthetic-presentation",
      renderDashboardCards: home.renderCards,
    });
    window.homeRefreshHarness = {
      refresh: (key = "synthetic-appearance") => sync.handleCentralSyncedStateValue(key),
      changeTeam: (id) => { team = { id, name: "Other Synthetic Team" }; surface.syncScope(); home.renderCards(); },
      logout: () => { user = null; surface.syncScope(); home.renderCards(); },
      revokeAccess: () => { mayView = false; home.renderCards(); },
      navigateAway: () => surface.unmountHome(),
      requestClose: () => surface.requestClose(),
      setPending: async (pending) => {
        const { getActiveLeaderboardRuntime } = await import("/src/modules/leaderboard/leaderboard-runtime.mjs");
        getActiveLeaderboardRuntime().store.setState({ ui: { pendingAction: pending ? "award" : "" } });
      },
    };
    home.renderCards();
  }, teamA);
  await page.locator("[data-leaderboard-home-open]").click();
  await expect(page.locator(dialogRoot)).toBeVisible();
  return () => { expect(writes).toBe(0); expect(errors).toEqual([]); };
}

for (const width of [1365, 390]) {
  test(`Home refresh preserves the reading dialog and replays latest cards after close at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const assertSafe = await mountHome(page);
    const search = page.getByRole("searchbox", { name: "Search standings" });
    await search.fill("Synthetic");
    await page.evaluate(() => {
      window.homeRefreshHarness.refresh();
      window.homeRefreshHarness.refresh("synthetic-presentation");
      window.homeRefreshHarness.refresh();
    });
    await expect(page.locator(dialogRoot)).toBeVisible();
    await expect(search).toHaveValue("Synthetic");
    await expect(search).toBeFocused();
    await expect(page.locator("#homeVersion")).toHaveText("1");
    await page.screenshot({ path: testInfo.outputPath("dialog-survives-home-refresh.png") });
    if (width === 1365) await search.press("Escape");
    else await page.getByRole("button", { name: "Close Leaderboard", exact: true }).click();
    await expect(page.locator("#homeVersion")).toHaveText("2");
    await expect(page.locator(dialogRoot)).toHaveCount(0);
    await expect(page.locator("[data-leaderboard-home-open]")).toBeFocused();
    expect(await page.locator("#dashboardGrid").evaluate((root) => Boolean(root.closest("[inert]")))).toBe(false);
    assertSafe();
  });
}

test("Deferred Home refresh cannot dismiss a pending award", async ({ page }) => {
  const assertSafe = await mountHome(page);
  await page.evaluate(() => window.homeRefreshHarness.setPending(true));
  await page.evaluate(() => window.homeRefreshHarness.refresh());
  expect(await page.evaluate(() => window.homeRefreshHarness.requestClose())).toBe(false);
  await expect(page.getByRole("button", { name: "Close Leaderboard", exact: true })).toBeDisabled();
  await expect(page.locator(dialogRoot)).toBeVisible();
  await expect(page.locator("#homeVersion")).toHaveText("1");
  await page.evaluate(() => window.homeRefreshHarness.setPending(false));
  await page.getByRole("button", { name: "Close Leaderboard", exact: true }).click();
  await expect(page.locator("#homeVersion")).toHaveText("2");
  assertSafe();
});

for (const action of ["changeTeam", "logout", "navigateAway", "revokeAccess"]) {
  test(`Deferred Home refresh is discarded on ${action}`, async ({ page }) => {
    const assertSafe = await mountHome(page);
    await page.evaluate(() => window.homeRefreshHarness.refresh());
    await page.evaluate(({ action, teamId }) => window.homeRefreshHarness[action](teamId), { action, teamId: teamB });
    await expect(page.locator(dialogRoot)).toHaveCount(0);
    if (action === "logout") await expect(page.locator("#dashboardGrid")).toBeEmpty();
    else await expect(page.locator("#homeVersion")).toHaveText(["changeTeam", "revokeAccess"].includes(action) ? "2" : "1");
    assertSafe();
  });
}

test("Permission loss still disposes a protected dialog instead of deferring Home refresh", async ({ page }) => {
  const assertSafe = await mountHome(page);
  await page.evaluate(() => window.homeRefreshHarness.setPending(true));
  await page.evaluate(() => window.homeRefreshHarness.refresh());
  await page.evaluate(() => window.homeRefreshHarness.revokeAccess());
  await expect(page.locator(dialogRoot)).toHaveCount(0);
  await expect(page.locator("#homeVersion")).toHaveText("2");
  assertSafe();
});

test("Scope disposal cancels a Home repaint already queued by dialog close", async ({ page }) => {
  const assertSafe = await mountHome(page);
  await page.evaluate((teamId) => {
    window.homeRefreshHarness.refresh();
    window.homeRefreshHarness.requestClose();
    window.homeRefreshHarness.changeTeam(teamId);
  }, teamB);
  await expect(page.locator(dialogRoot)).toHaveCount(0);
  await expect(page.locator("#homeVersion")).toHaveText("2");
  assertSafe();
});
