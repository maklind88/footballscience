import { expect, test } from "@playwright/test";

const day = "2026-11-25";
const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionKey = "football-session-planner-v3";
const squadKey = "football-player-profiles-v1";
const medicalKey = "football-medical-team-v1";

async function boot(page) {
  await page.clock.setFixedTime(new Date(`${day}T15:00:00Z`));
  const entries = {
    [scheduleKey]: { events: [
      { id: "qa-first", date: "2026-11-23", title: "First match", type: "match", time: "19:00" },
      { id: "qa-training", date: day, title: "Midweek training", type: "training", time: "10:00" },
      { id: "qa-meeting", date: day, title: "Staff meeting", type: "meeting", time: "08:30" },
      { id: "qa-next", date: "2026-11-28", title: "Second match", type: "match", time: "19:30" },
    ] },
    [periodizationKey]: { days: { [day]: { physicalLoad: "High", daySchedule: "Training" } } },
    [sessionKey]: { selectedDate: day, sessions: {
      [day]: { blocks: [
        { id: "qa-block", title: "Build-up games", minutes: 25 },
        { id: "qa-block-2", title: "Transition games", minutes: 35 },
      ] },
      "2026-11-17": { blocks: [{ id: "qa-block-3", title: "Previous week", minutes: 20 }] },
    } },
    [squadKey]: { schemaVersion: 3, rosterVersion: "qa-performance", players: [
      { id: "qa-player-a", name: "Alex Example", number: "8", position: "Midfielder", rosterType: "squad" },
      { id: "qa-player-b", name: "Blair Example", number: "4", position: "Defender", rosterType: "squad" },
      { id: "qa-player-c", name: "Casey Example", number: "6", position: "Midfielder", rosterType: "squad" },
    ] },
    [medicalKey]: { rosterVersion: "qa-performance", players: [
      { id: "qa-player-a", name: "Alex Example" }, { id: "qa-player-b", name: "Blair Example" },
      { id: "qa-outside", name: "Outside Roster" },
    ], records: [
      { id: "qa-a", playerId: "qa-player-a", date: day, participation: 100, status: "full" },
      { id: "qa-b", playerId: "qa-player-b", date: day, participation: 50, status: "modified", comment: "Private clinical note" },
      { id: "qa-c", playerId: "qa-outside", date: day, participation: 0, status: "unavailable" },
    ] },
  };
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, entries);
  await page.goto("/?workspace=performance-room", { waitUntil: "domcontentloaded" });
  const room = page.locator("#performanceWorkspace");
  await expect(room.getByRole("heading", { name: "Head of Performance" })).toBeVisible();
  return room;
}

test("Performance Room joins a two-match week and links back to the source workspaces", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 950 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const room = await boot(page);
  const navigation = room.getByRole("navigation", { name: "Performance Room" });
  await expect(room.getByRole("button", { name: /Next match Second match/ })).toBeVisible();
  await expect(room.getByRole("button", { name: /Mon.*First match/ })).toBeVisible();
  await expect(room.getByRole("button", { name: /Sat.*Second match/ })).toBeVisible();
  await expect(room.getByText("60 min", { exact: true }).first()).toBeVisible();
  await expect(room.getByText(/1 of \d+ full training · [1-9]\d* not set/)).toBeVisible();
  await expect(room.getByText("Private clinical note")).toHaveCount(0);
  await expect(room.getByText("Outside Roster")).toHaveCount(0);
  await expect(page.locator('[data-open-workspace="performance-room"]').first()).toBeAttached();
  await room.screenshot({ path: testInfo.outputPath("performance-overview.png") });

  await navigation.getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  const planning = room.locator(".pr-plan-workbench");
  await expect(planning.getByRole("row", { name: /Midweek training/ })).toContainText("High · 60 plan min");
  await expect(planning.getByRole("row", { name: /Staff meeting/ })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: "Load focus", exact: true }).click();
  await expect(room.getByRole("button", { name: /Midweek training.*Load focus High/ })).toBeVisible();
  await expect(room.getByRole("row", { name: /Transition games 35 min/ })).toBeVisible();
  await room.getByRole("button", { name: "Schedule", exact: false }).last().click();
  await expect(page.locator('body[data-active-workspace="schedule"]')).toHaveCount(1);
  await expect(page.locator("#scheduleWorkspace").getByText("Midweek training", { exact: true }).first()).toBeVisible();
  await expect(room).toBeEmpty();
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(room.getByRole("heading", { name: "Session Plan", exact: true })).toBeVisible();
  await room.getByRole("button", { name: "Periodization", exact: false }).click();
  await expect(page.locator("[data-periodization-overlay] h2").first()).toHaveText("Wednesday, November 25");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(room.getByRole("heading", { name: "Session Plan", exact: true })).toBeVisible();
  await room.getByRole("button", { name: "Session Planner", exact: false }).click();
  await expect(page.locator('body[data-active-workspace="session-planner"]')).toHaveCount(1);
  await expect(page.locator("#sessionPlannerWorkspace").getByText("Build-up games", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Performance Room keeps unknown data distinct, updates from the owner cache and fits mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await boot(page);
  await room.screenshot({ path: testInfo.outputPath("performance-mobile.png") });
  expect(await room.evaluate((root) => root.scrollWidth - root.clientWidth)).toBeLessThanOrEqual(1);
  const navigation = room.getByRole("navigation", { name: "Performance Room" });
  await navigation.getByRole("button", { name: "Overview" }).click();
  await room.getByRole("button", { name: /Blair Example.*Modified/ }).click();
  await expect(room.getByRole("heading", { name: "Blair Example" })).toBeVisible();
  await expect(room.getByText("Private clinical note")).toHaveCount(0);
  await navigation.getByRole("button", { name: "Players" }).click();
  await room.getByRole("button", { name: "Not set", exact: true }).click();
  await expect(room.getByRole("button", { name: /Casey Example/ })).toBeVisible();
  await expect(room.getByRole("button", { name: /Alex Example/ })).toHaveCount(0);

  await navigation.getByRole("button", { name: "Season Monitoring" }).click();
  await room.getByRole("button", { name: "14 days", exact: true }).click();
  await expect(room.getByText("80 min", { exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "Data Review" }).click();
  await expect(room.getByText("GPS import not connected", { exact: true })).toBeVisible();
  await expect(room.getByText("RPE collection not connected", { exact: true })).toBeVisible();

  await page.evaluate(({ sessionKey, day }) => {
    const data = JSON.parse(localStorage.getItem(sessionKey));
    data.sessions[day].blocks[0].minutes = 40;
    localStorage.setItem(sessionKey, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("footballscience:central-state-ready"));
  }, { sessionKey, day });
  await navigation.getByRole("button", { name: "Overview" }).click();
  await expect(room.getByText("75 min", { exact: true }).first()).toBeVisible();
  await room.getByRole("button", { name: /Open session details/ }).click();
  await expect(room.getByRole("row", { name: /Build-up games 40 min/ })).toBeVisible();
});
