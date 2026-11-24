import { expect, test } from "@playwright/test";

const day = "2026-11-25";
const scheduleKey = "football-schedule-v1";
const periodizationKey = "football-periodization-v2";
const sessionKey = "football-session-planner-v3";
const squadKey = "football-player-profiles-v1";
const medicalKey = "football-medical-team-v1";

async function boot(page, { fromSquad = false, backend } = {}) {
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
  if (backend) await attachLoadPlanRoutes(page, entries, backend);
  else await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, entries);
  await page.goto(`/?workspace=${fromSquad ? "player-profiles" : "performance-room"}`, { waitUntil: "domcontentloaded" });
  if (fromSquad) return page.locator("#playerProfilesWorkspace");
  const room = page.locator("#performanceWorkspace");
  await expect(room.getByRole("heading", { name: "Head of Performance" })).toBeVisible();
  return room;
}

async function attachLoadPlanRoutes(page, entries, backend) {
  const user = {
    id: "performance-fixture-user", email: "qa-performance@footballscience.test",
    user_metadata: { firstName: "QA", lastName: "Performance", username: "qa.performance" },
    app_metadata: { role: "admin", status: "active", teamId: "team-north-carolina-courage" },
  };
  await page.addInitScript(() => { window.__footballScienceQaForceCentralState = true; });
  await page.route("**/npm/@supabase/supabase-js@2/**", (route) => route.fulfill({ contentType: "text/javascript", body: `
    const session = ${JSON.stringify({ access_token: "qa-load-plan-token", user })};
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session }, error: null }),
      refreshSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } }) };` }));
  await page.route("**/api/client-config", (route) => route.fulfill({ json: {
    ok: true, url: "https://qa.supabase.co", anonKey: "qa-public-key", hasServiceRoleKey: true,
  } }));
  await page.route("**/api/admin-users**", (route) => route.fulfill({ json: { ok: true, user, users: [user] } }));
  await page.route("**/api/presence**", (route) => route.fulfill({ json: { ok: true, entries: [] } }));
  await page.route("**/api/app-state**", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: { ok: true } });
    const keys = (new URL(route.request().url()).searchParams.get("keys") || "").split(",");
    return route.fulfill({ json: {
      ok: true,
      entries: Object.fromEntries(keys.filter((key) => key in entries).map((key) => [key, JSON.stringify(entries[key])])),
      metadata: Object.fromEntries(keys.filter((key) => key in entries).map((key) => [key, { revision: 1 }])),
      absentKeys: keys.filter((key) => !(key in entries)),
    } });
  });
  await page.route("**/api/performance-load-plan**", async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer qa-load-plan-token");
    if (request.method() === "GET") {
      const week = new URL(request.url()).searchParams.get("week");
      return route.fulfill({ json: { ok: true, week, canEdit: backend.canEdit, records: backend.records } });
    }
    const { week, records } = request.postDataJSON();
    backend.writes.push(records);
    const storedBy = (record) => `${record.kind}|${record.subjectKey}|${record.activityId}`;
    if (records.some((record) => record.revision !==
      (backend.records.find((saved) => storedBy(saved) === storedBy(record))?.revision ?? 0))) {
      return route.fulfill({ status: 409, json: { ok: false, reason: "The plan has changed. Reload saved values before editing again." } });
    }
    const saved = records.map((record) => ({ ...record, revision: record.revision + 1 }));
    backend.records = [...backend.records.filter((record) => !saved.some((edit) => storedBy(edit) === storedBy(record))), ...saved];
    return route.fulfill({ json: { ok: true, week, canEdit: backend.canEdit, records: saved } });
  });
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


test("a Squad profile opens its saved plan, keeps changes after reload, and updates the team week", async ({ page }) => {
  const backend = { records: [], writes: [], canEdit: true };
  const squad = await boot(page, { fromSquad: true, backend });
  await squad.locator('[data-player-profile-select="qa-player-b"]').click();
  await squad.locator('[data-player-profile-tab="performance"]').click();
  await squad.getByRole("link", { name: "Open performance plan" }).click();

  const workbench = page.locator(".pr-plan-workbench");
  const player = workbench.getByRole("combobox", { name: "Player", exact: true });
  await expect(player).toHaveValue("qa-player-b");
  await expect(workbench.getByText("Saved team plan")).toBeVisible();
  await workbench.getByRole("button", { name: "Edit player baselines" }).click();
  await workbench.getByRole("textbox", { name: "High-speed running", exact: true }).fill("480");
  await workbench.getByRole("button", { name: "Save reference" }).click();
  await expect(workbench.getByRole("status")).toHaveText("Baseline saved.");

  await workbench.getByRole("button", { name: "Player plan" }).click();
  const distance = workbench.getByRole("textbox", { name: /Midweek training.*Total distance/ });
  const sprint = workbench.getByRole("textbox", { name: /Midweek training.*Sprint distance/ });
  await distance.fill("5,25");
  await sprint.fill("0");
  await workbench.getByRole("button", { name: "Save player plan" }).click();
  await expect(workbench.getByRole("status")).toContainText("Team week updated");
  expect(backend.writes).toEqual([
    [{ kind: "baseline", subjectKey: "player:qa-player-b", activityId: "", revision: 0, targets: { hsr: 480 } }],
    [{ kind: "plan", subjectKey: "player:qa-player-b", activityId: "qa-training", revision: 0, targets: { distance: 5250, sprint: 0 } }],
  ]);

  await workbench.getByRole("button", { name: "Team week" }).click();
  const training = workbench.getByRole("row", { name: /Midweek training/ });
  await expect(training.getByRole("cell").first()).toContainText("5.25 km total");
  await expect(training.getByRole("cell").last()).toContainText("0 m total");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(player).toHaveValue("qa-player-b");
  await expect(distance).toHaveValue("5.25");
  await expect(workbench.getByText("480 m", { exact: false }).first()).toBeVisible();

  backend.records.find(({ kind }) => kind === "plan").revision = 2;
  await distance.fill("4.5");
  await workbench.getByRole("button", { name: "Save player plan" }).click();
  await expect(workbench.getByRole("status")).toContainText("The plan has changed");
  await expect(distance).toHaveValue("4.5");
  backend.canEdit = false;
  await workbench.getByRole("button", { name: "Reload saved values" }).click();
  await expect(distance).toHaveValue("5.25");
  await expect(distance).toHaveAttribute("readonly", "");
  await expect(workbench.getByRole("button", { name: "Save player plan" })).toHaveCount(0);
});
