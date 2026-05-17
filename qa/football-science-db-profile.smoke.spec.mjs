import { expect, test } from "@playwright/test";

const workspaceHubKey = "football-workspace-hub-v3";

async function dismissDashboardModal(page) {
  const closeButton = page
    .locator(
      "button[data-dashboard-news-dismiss], button[data-dashboard-tutorial-never], button[data-dashboard-tutorial-save], button[data-dashboard-modal-close], [data-dashboard-news-dismiss]"
    )
    .first();
  if ((await closeButton.count()) > 0) {
    await closeButton.click({ force: true }).catch(() => {});
  }
}

async function bootApp(page) {
  await page.addInitScript((key) => {
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
  }, workspaceHubKey);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.platformAuthStore), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.platformAuthStore.getAccessToken = async () => "qa-fsdb-token";
    window.platformAuthStore.refreshAccessToken = async () => "qa-fsdb-token";
  });
  await dismissDashboardModal(page);
}

async function openWorkspace(page, workspaceId, viewId = workspaceId) {
  await dismissDashboardModal(page);
  const visibleTrigger = page.locator(`[data-open-workspace="${workspaceId}"]:visible`).first();
  if ((await visibleTrigger.count()) > 0) {
    await visibleTrigger.click();
  } else {
    await page.evaluate((targetWorkspaceId) => {
      window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: targetWorkspaceId } }));
    }, workspaceId);
  }
  await expect(page.locator(`[data-workspace-view="${viewId}"].is-active`)).toBeVisible();
}

function mockFootballScienceDb(route) {
  const url = new URL(route.request().url());
  const action = url.searchParams.get("action") || "players";
  const player = {
    id: "11111111-1111-4111-8111-111111111111",
    fsdbId: "fsdb_padaexample",
    name: "Ada Example",
    fullName: "Ada Lovelace Example",
    dateOfBirth: "2001-04-12",
    birthYear: 2001,
    genderSegment: "women",
    nationality: "Norway",
    primaryPosition: "Forward",
    positionGroup: "FW",
    currentTeam: "Example FC",
    currentCompetition: "Toppserien",
    sourceConfidence: 94,
    sourceLinkCount: 2,
    rosterEntryCount: 1,
    seasonStatCount: 1,
    metricCount: 6,
    nameQuality: "full",
    identityStatus: "verified",
    dedupeKeyPresent: true,
    dataReadiness: {
      tier: "spider_ready",
      label: "Spider ready",
      rosterReady: true,
      statsReady: true,
      spiderReady: true,
      missing: [],
    },
  };
  const profile = {
    ok: true,
    player,
    review: { status: "spider_ready", label: "Spider ready", reasons: [] },
    aliases: [{ alias: "Ada Example", aliasType: "display", sourceSystem: "qa", confidence: 100, status: "active" }],
    sourceLinks: [
      {
        sourceSystem: "qa-source",
        sourceEntityId: "qa-ada",
        sourceUrl: "https://example.com/ada",
        confidence: 100,
        verifiedStatus: "linked",
      },
    ],
    rosters: [{ season: "2025/2026", team: "Example FC", competition: "Toppserien", position: "FW", rosterStatus: "active" }],
    stats: [
      {
        season: "2025/2026",
        team: "Example FC",
        competition: "Toppserien",
        position: "FW",
        matches: 10,
        starts: 8,
        minutes: 720,
        metricCount: 6,
        metrics: {
          goals: 0.42,
          assists: 0.21,
          shots: 3.4,
          progressiveRuns: 2.2,
        },
      },
    ],
  };

  if (action === "quality" || action === "health") {
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        totals: { players: 1, women: 1, men: 0, mixed: 0, unknownGender: 0 },
        coverage: {
          profileCompleteness: 100,
          fullNamePct: 100,
          dedupePct: 100,
          sourceLinkPct: 100,
          rosterPct: 100,
          statsPct: 100,
          spiderMetricPct: 100,
        },
        counts: { missingDedupe: 0, initialNames: 1 },
        reviewQueues: {
          weakIdentity: [],
          initialNames: [
            {
              id: player.id,
              fsdbId: player.fsdbId,
              name: "A. Example",
              team: player.currentTeam,
              position: player.primaryPosition,
              nationality: player.nationality,
              sourceLinkCount: 2,
              metricCount: 6,
              reviewLabel: "Needs identity review",
              reviewReasons: [{ code: "full_name", label: "Full name needs confirmation", priority: "high" }],
            },
          ],
        },
      }),
    });
  }

  if (action === "profile") {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(profile) });
  }

  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      source: "api",
      players: [player],
      page: { limit: 25, returned: 1, hasMore: false, nextCursor: null, total: 1 },
    }),
  });
}

test("Football Science DB profile and identity queue open from Scouting", async ({ page }) => {
  await page.route("**/api/football-science-db**", mockFootballScienceDb);
  await bootApp(page);
  await openWorkspace(page, "scouting");

  await page.locator('.scouting-tab[data-scouting-tab="database"]').click();
  await page.locator("[data-scouting-load-fsdb]").first().click();

  await expect(page.locator("[data-scouting-record-grid]")).toContainText("Ada Lovelace Example", { timeout: 15_000 });
  await page.locator('[data-open-scouting-record="fsdb:fsdb_padaexample"]').first().click();

  const profileModal = page.locator("[data-scouting-profile-modal]").first();
  await expect(profileModal).toContainText("Football Science DB profile", { timeout: 15_000 });
  await expect(profileModal).toContainText("Sources");
  await expect(profileModal).toContainText("Roster history");
  await expect(profileModal).toContainText("Season stats");
  await expect(profileModal).toContainText("Football Science Spider");

  await profileModal.locator(".scouting-profile-close").click();
  await expect(page.locator("[data-open-fsdb-profile]").first()).toBeVisible({ timeout: 15_000 });
  await page.locator("[data-open-fsdb-profile]").first().click();
  await expect(page.locator("[data-scouting-profile-modal]").first()).toContainText("Ada Lovelace Example", { timeout: 15_000 });
});
