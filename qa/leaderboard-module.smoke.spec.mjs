import { expect, test } from "@playwright/test";

const payload = {
  ok: true,
  schema: "footballscience-leaderboard-v1",
  month: "2026-08",
  competition: { id: "competition-aug", status: "live" },
  summary: { eventCount: 2, totalPoints: 21, participantCount: 3 },
  roster: [
    { playerId: "p1", displayName: "Alex Morgan", number: "13", position: "Forward" },
    { playerId: "p2", displayName: "Sam Coffey", number: "17", position: "Midfielder" },
    { playerId: "p3", displayName: "Emily Fox", number: "2", position: "Defender" },
    { playerId: "p4", displayName: "Casey Murphy", number: "1", position: "Goalkeeper" },
  ],
  standings: [
    { playerId: "p1", displayName: "Alex Morgan", points: 9, rank: 1, awardCount: 3, lastAwardOn: "2026-08-24" },
    { playerId: "p2", displayName: "Sam Coffey", points: 9, rank: 1, awardCount: 2, lastAwardOn: "2026-08-23" },
    { playerId: "p3", displayName: "Emily Fox", points: 3, rank: 3, awardCount: 1, lastAwardOn: "2026-08-20" },
  ],
  events: [
    {
      id: "e1",
      occurredOn: "2026-08-24",
      title: "5v5 tournament",
      createdByName: "Coach Taylor",
      createdAt: "2026-08-24T15:00:00Z",
      points: 6,
      awards: [
        { playerId: "p1", playerName: "Alex Morgan", points: 3, placement: 1 },
        { playerId: "p2", playerName: "Sam Coffey", points: 3, placement: 1 },
      ],
    },
  ],
};

const squad = {
  players: [
    { id: "p1", name: "Alex Morgan", number: 13, position: "Forward" },
    { id: "p2", name: "Sam Coffey", number: 17, position: "Midfielder" },
    { id: "p3", name: "Emily Fox", number: 2, position: "Defender" },
    { id: "p4", name: "Casey Murphy", number: 1, position: "Goalkeeper" },
  ],
};

test("leaderboard renders and remains operable across desktop and mobile", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/__leaderboard_module_harness__", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><head></head><body></body></html>" }));
  await page.route("**/api/leaderboard**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto("/__leaderboard_module_harness__");

  await page.evaluate(async ({ squadState }) => {
    document.head.innerHTML = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;background:#edf2ee;font-family:Inter,system-ui,sans-serif}</style>`;
    document.body.innerHTML = `<main id="leaderboardHarness"></main>`;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/src/modules/leaderboard/leaderboard.css";
    document.head.append(stylesheet);
    await new Promise((resolve, reject) => { stylesheet.onload = resolve; stylesheet.onerror = reject; });

    const module = await import(`/src/modules/leaderboard/index.mjs?smoke=${Date.now()}`);
    const root = document.querySelector("#leaderboardHarness");
    const context = {
      ui: { leaderboardWorkspace: root },
      win: window,
      team: { id: "team-1", name: "North Carolina Courage" },
      teamName: "North Carolina Courage",
      currentUser: { id: "coach-1" },
      getAuthToken: () => "",
      getPlayerProfilesState: () => squadState,
      getNow: () => new Date("2026-08-24T12:00:00"),
      canEdit: () => true,
    };
    for (const type of ["click", "input", "change", "submit"]) {
      const handler = `handle${type[0].toUpperCase()}${type.slice(1)}`;
      root.addEventListener(type, (event) => module[handler]?.(event, context));
    }
    module.render(context);
  }, { squadState: squad });

  await expect(page.getByRole("heading", { name: "North Carolina Courage Leaderboard" })).toBeVisible();
  await expect(page.locator(".leaderboard-podium-card")).toHaveCount(3);
  await expect(page.getByText("No points yet")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Award Points" }).click();
  await expect(page.getByRole("dialog", { name: "Award Points" })).toBeVisible();
  await page.getByPlaceholder("e.g. 5v5 tournament").fill("Finishing tournament");
  await page.locator('[data-leaderboard-player-id="p1"][data-leaderboard-assign-placement="1"]').click();
  await page.locator('[data-leaderboard-player-id="p2"][data-leaderboard-assign-placement="2"]').click();
  await expect(page.locator(".leaderboard-award-preview")).toContainText("2 players");
  await expect(page.locator(".leaderboard-award-preview")).toContainText("5 points total");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-leaderboard-open-award]")).toBeFocused();

  await page.locator('tr[data-leaderboard-player-detail="p1"]').click();
  await expect(page.getByRole("dialog", { name: "Alex Morgan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close player detail" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-leaderboard-player-detail="p1"]:focus')).toHaveCount(1);
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("5v5 tournament")).toBeVisible();
  await expect(page.getByText("Coach Taylor", { exact: false })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Standings" }).click();
  expect(await page.locator(".leaderboard-table tr").first().evaluate((row) => getComputedStyle(row).display)).toBe("grid");
  expect(await page.locator(".leaderboard-award-trigger").evaluate((button) => getComputedStyle(button).position)).toBe("fixed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".leaderboard-award-trigger").click();
  await expect(page.getByRole("dialog", { name: "Award Points" })).toBeVisible();
  expect(await page.locator(".leaderboard-award-sheet").evaluate((sheet) => getComputedStyle(sheet).borderBottomLeftRadius)).toBe("0px");

  expect(browserErrors).toEqual([]);
});
