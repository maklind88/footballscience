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
      ...(backend?.extraEvents ?? []),
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
      const params = new URL(request.url()).searchParams;
      const week = params.get("week");
      if (params.get("view") === "gps-history") {
        backend.historyReads?.push(week);
        return route.fulfill({ json: { ok: true, week, history: { status: "ready", rows: backend.history?.[week] ?? [] } } });
      }
      const planningSources = {
        playerIds: entries[squadKey].players.map(({ id }) => id),
        activityIds: entries[scheduleKey].events.filter(({ type }) => type !== "meeting").map(({ id }) => id),
      };
      return route.fulfill({ json: { ok: true, week, canEdit: backend.canEdit, records: backend.records, planningSources, gpsActuals: backend.gpsActuals } });
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
  await planning.getByRole("button", { name: "By activity", exact: true }).click();
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
  await expect(room.getByText("GPS coverage is shown in load planning", { exact: true })).toBeVisible();
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
  await workbench.getByRole("button", { name: "By activity", exact: true }).click();
  const training = workbench.getByRole("row", { name: /Midweek training/ });
  await expect(training.getByRole("cell").first()).toContainText("5.25 km");
  await expect(training.getByRole("cell").last()).toContainText("0 m");
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

test("Team week displays existing goals per player and saves per-player edits against the planning roster", async ({ page }) => {
  const backend = { records: [{
    kind: "week-goal", subjectKey: "week:2026-11-23", activityId: "", revision: 1,
    targets: { distance: 120001, hsr: 8011 },
  }], writes: [], canEdit: true };
  const room = await boot(page, { backend });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  const plan = room.locator(".pr-plan-workbench");
  await plan.getByRole("button", { name: "By activity", exact: true }).click();
  await plan.getByRole("button", { name: "Edit weekly goals", exact: true }).click();
  const goal = plan.getByRole("textbox", { name: "Weekly per-player Total distance" });
  await expect(goal).toHaveValue("40");
  await expect(plan.getByRole("textbox", { name: "Weekly per-player High-speed running" })).toHaveValue("2670");
  await plan.getByRole("button", { name: "Save weekly goals" }).click();
  await expect(plan.getByRole("status")).toContainText("No changes to save.");
  expect(backend.writes).toHaveLength(0);
  await goal.fill("42");
  await plan.getByRole("textbox", { name: "Weekly per-player Sprint distance" }).fill("800");
  await plan.getByRole("button", { name: "Save weekly goals" }).click();
  await expect(plan.getByRole("status")).toContainText("Weekly goals saved");
  expect(backend.writes[0]).toEqual([{
    kind: "week-goal", subjectKey: "week:2026-11-23", activityId: "", revision: 1,
    targets: { distance: 126000, hsr: 8011, sprint: 2400 },
  }]);

  const training = plan.getByRole("row", { name: /Midweek training/ });
  await training.getByRole("button", { name: /Edit player targets/ }).click();
  const editor = plan.getByRole("region", { name: "Player targets" });
  const alex = editor.getByRole("row", { name: /Alex Example/ });
  const blair = editor.getByRole("row", { name: /Blair Example/ });
  const allDistance = editor.getByRole("textbox", { name: "All players Total distance" });
  await allDistance.fill("5,2");
  await editor.getByRole("textbox", { name: "All players High-speed running" }).fill("400");
  await editor.getByRole("textbox", { name: "All players Sprint distance" }).fill("80");
  await editor.getByRole("button", { name: "Fill empty targets" }).click();
  await expect(alex.getByRole("textbox", { name: /Total distance/ })).toHaveValue("5.2");
  await expect(blair.getByRole("textbox", { name: /High-speed running/ })).toHaveValue("400");
  await blair.getByRole("textbox", { name: /Sprint distance/ }).fill("0");
  await alex.getByRole("textbox", { name: /Total distance/ }).fill("6.2");
  const activity = editor.getByRole("combobox", { name: "Activity to edit" });
  await activity.selectOption("qa-first");
  await activity.selectOption("qa-training");
  await expect(alex.getByRole("textbox", { name: /Total distance/ })).toHaveValue("6.2");
  await expect(blair.getByRole("textbox", { name: /Sprint distance/ })).toHaveValue("0");
  expect(backend.writes).toHaveLength(1);

  await editor.getByRole("button", { name: "Save player targets" }).click();
  await expect(plan.getByRole("status")).toContainText("Player targets saved. Team week updated.");
  expect(backend.writes).toHaveLength(2);
  expect(backend.writes[1]).toHaveLength(3);
  expect(backend.writes[1]).toEqual(expect.arrayContaining([
    { kind: "plan", subjectKey: "player:qa-player-a", activityId: "qa-training", revision: 0, targets: { distance: 6200, hsr: 400, sprint: 80 } },
    { kind: "plan", subjectKey: "player:qa-player-b", activityId: "qa-training", revision: 0, targets: { distance: 5200, hsr: 400, sprint: 0 } },
  ]));
  await expect(training.locator("td").last()).toContainText("53 m");
  await expect(training.locator("td").last()).not.toContainText("160 m");
  await expect(plan.getByRole("region", { name: "Weekly training goals" })).toContainText("Plan avg · 5.533 km");
  await expect(goal).toHaveValue("42");

  await plan.getByRole("button", { name: "Player plan" }).click();
  await plan.getByRole("combobox", { name: "Player", exact: true }).selectOption("qa-player-a");
  await expect(plan.getByRole("textbox", { name: /Midweek training.*Total distance/ })).toHaveValue("6.2");

  backend.canEdit = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  await plan.getByRole("button", { name: "By activity", exact: true }).click();
  await plan.getByRole("button", { name: "View weekly goals", exact: true }).click();
  await expect(goal).toHaveValue("42");
  await expect(goal).toHaveAttribute("readonly", "");
  await expect(plan.getByRole("button", { name: "Save weekly goals" })).toHaveCount(0);
  await expect(training.getByRole("button", { name: /Edit player targets/ })).toHaveCount(0);
});

test("Team week shows live totals across activities per player and saves the changed records together", async ({ page }) => {
  await page.setViewportSize({ width: 1460, height: 980 });
  const record = (player, activity, revision, targets) => ({
    kind: "plan", subjectKey: `player:${player}`, activityId: activity, revision, targets,
  });
  const backend = { records: [
    record("qa-player-a", "qa-first", 1, { distance: 8000, hsr: 450, sprint: 100 }),
    record("qa-player-a", "qa-training", 2, { distance: 5000, hsr: 300, sprint: 65 }),
  ], writes: [], canEdit: true };
  const room = await boot(page, { backend });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  const plan = room.locator(".pr-plan-workbench");
  const byPlayer = plan.getByRole("button", { name: "By player", exact: true });
  const byActivity = plan.getByRole("button", { name: "By activity", exact: true });
  const grid = plan.getByRole("table", { name: "Player microcycles by day" });
  const alex = grid.getByRole("row", { name: /Alex Example/ });
  const blair = grid.getByRole("row", { name: /Blair Example/ });
  const trainingDistance = alex.getByRole("textbox", { name: /Midweek training.*Total distance/ });
  const weekTotal = (key) => alex.locator(`[data-pr-week-total="week:${key}"]`);

  await byPlayer.click();
  await expect(grid.locator("thead tr").first().getByRole("columnheader")).toHaveCount(8);
  await expect(grid.getByRole("columnheader", { name: /First match/ })).toBeVisible();
  await expect(grid.getByRole("columnheader", { name: /Second match/ })).toBeVisible();
  await expect(weekTotal("distance")).toHaveText("13 km");

  await trainingDistance.fill("-4");
  await expect(trainingDistance).toHaveAttribute("aria-invalid", "true");
  await expect(weekTotal("distance")).toHaveText("—");
  await trainingDistance.fill("6,2");
  await expect(trainingDistance).not.toHaveAttribute("aria-invalid", "true");
  await alex.getByRole("textbox", { name: /Midweek training.*High-speed running/ }).fill("420");
  await alex.getByRole("textbox", { name: /Midweek training.*Sprint distance/ }).fill("");
  await alex.getByRole("textbox", { name: /Second match.*Total distance/ }).fill("9");
  await alex.getByRole("textbox", { name: /Second match.*High-speed running/ }).fill("500");
  await alex.getByRole("textbox", { name: /Second match.*Sprint distance/ }).fill("0");
  await blair.getByRole("textbox", { name: /First match.*Total distance/ }).fill("0");
  await expect(weekTotal("distance")).toHaveText("23.2 km");
  await expect(weekTotal("hsr")).toHaveText("1,370 m");
  await expect(weekTotal("sprint")).toHaveText("100 m");
  await expect(alex.locator('[data-pr-week-total="training:distance"]')).toHaveText("6.2 km");
  await expect(alex.locator('[data-pr-week-total="matches:distance"]')).toHaveText("17 km");
  await expect(blair.locator('[data-pr-week-total="week:distance"]')).toHaveText("0 km");

  await byActivity.click();
  await plan.getByRole("button", { name: /Edit player targets for Midweek training/ }).click();
  const editor = plan.getByRole("region", { name: "Player targets" });
  await expect(editor.getByRole("textbox", { name: "Alex Example Total distance" })).toHaveValue("6,2");
  await editor.getByRole("textbox", { name: "Alex Example High-speed running" }).fill("440");
  await byPlayer.click();
  await expect(weekTotal("hsr")).toHaveText("1,390 m");
  expect(backend.writes).toHaveLength(0);

  await plan.getByRole("button", { name: "Save week changes" }).click();
  await expect(plan.getByRole("status")).toContainText("Week changes saved. Team week updated.");
  expect(backend.writes).toHaveLength(1);
  expect(backend.writes[0]).toHaveLength(3);
  expect(backend.writes[0]).toEqual(expect.arrayContaining([
    record("qa-player-a", "qa-training", 2, { distance: 6200, hsr: 440 }),
    record("qa-player-a", "qa-next", 0, { distance: 9000, hsr: 500, sprint: 0 }),
    record("qa-player-b", "qa-first", 0, { distance: 0 }),
  ]));
  await byActivity.click();
  await expect(plan.getByRole("row", { name: /Midweek training/ })).toContainText("6.2 km");

  backend.canEdit = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  await byPlayer.click();
  await expect(weekTotal("distance")).toHaveText("23.2 km");
  await expect(weekTotal("hsr")).toHaveText("1,390 m");
  await expect(grid.getByRole("textbox")).toHaveCount(0);
  await expect(plan.getByRole("button", { name: "Save week changes" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const scrollArea = plan.getByRole("region", { name: "Scrollable player week" });
  expect(await scrollArea.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await room.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
});

test("Team week pairs saved and edited plans with GPS by player and activity", async ({ page }) => {
  const backend = {
    records: [
      { kind: "plan", subjectKey: "player:qa-player-a", activityId: "qa-training", revision: 1,
        targets: { distance: 5100, hsr: 410, sprint: 70 } },
    ], writes: [], canEdit: true,
    gpsActuals: { status: "ready", sample: true, rows: [
      { playerId: "qa-player-a", activityId: "qa-training", metrics: { distance: 5400, hsr: 390, sprint: 0 },
        comparable: ["distance", "sprint"] },
      { playerId: "qa-player-b", activityId: "qa-training", metrics: { distance: 4200 }, comparable: ["distance"] },
      { playerId: "qa-player-b", activityId: "qa-first", metrics: { distance: 8200 }, comparable: ["distance"] },
      { playerId: "qa-player-b", activityId: "qa-next", metrics: { distance: 2800 }, comparable: ["distance"] },
      { playerId: "qa-player-a", activityId: "qa-next", metrics: { distance: 9000 }, comparable: ["distance"] },
    ] },
  };
  const room = await boot(page, { backend });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  const plan = room.locator(".pr-plan-workbench");
  await plan.getByRole("button", { name: "By activity", exact: true }).click();
  const compare = plan.getByRole("button", { name: "Plan vs GPS" });
  await expect(compare).toHaveAttribute("aria-pressed", "true");
  await expect(plan.getByText("Example GPS data", { exact: true })).toBeVisible();
  const training = plan.getByRole("row", { name: /Midweek training/ });
  await expect(training.locator("td").first()).toContainText("GPS avg · 4.8 km");
  await expect(training.locator("td").first()).toContainText(/2 \/ \d+ players in GPS avg/);
  await expect(plan.getByRole("row", { name: /Match estimates Average per player/ }).locator("td").first())
    .toContainText("GPS avg · 10 km");
  await expect(plan.getByRole("row", { name: /Training week Average per player/ }).locator("td").first())
    .toContainText("Paired avg · 5.1 km plan / 5.4 km GPS");

  await plan.getByRole("button", { name: "By player" }).click();
  const grid = plan.getByRole("table", { name: "Player microcycles by day" });
  const alex = grid.getByRole("row", { name: /Alex Example/ });
  const session = alex.locator('[data-pr-week-activity="qa-training"]');
  const measure = (key) => session.locator(`[data-pr-week-metric="${key}"]`);
  const distance = measure("distance").getByRole("textbox");
  const gpsValue = (key) => measure(key).locator(".pr-gps-amount > span");
  const delta = (key) => measure(key).locator("[data-pr-gps-actual]");
  await expect(distance).toHaveValue("5.1");
  await expect(gpsValue("distance")).toHaveText("5.4 km");
  await expect(delta("distance")).toHaveText("+0.3 km");
  await expect(gpsValue("hsr")).toHaveText("390 m");
  await expect(delta("hsr")).toHaveCount(0);
  await expect(gpsValue("sprint")).toHaveText("0 m");
  await expect(delta("sprint")).toHaveText("−70 m");
  await expect(alex.locator('[data-pr-week-activity="qa-first"] .pr-gps-amount > span').first()).toHaveText("—");
  await expect(alex.locator(".pr-week-gps-total")).toContainText("1 included");
  await expect(alex.locator(".pr-week-gps-total")).not.toContainText("390 m");

  await distance.fill("5,6");
  await expect(delta("distance")).toHaveText("−0.2 km");
  await compare.click();
  await expect(gpsValue("distance")).toHaveCount(0);
  await compare.click();
  await expect(distance).toHaveValue("5,6");
  await expect(delta("distance")).toHaveText("−0.2 km");
  expect(backend.writes).toHaveLength(0);

  await plan.getByRole("button", { name: "Save week changes" }).click();
  await expect(plan.getByRole("status")).toContainText("Week changes saved");
  expect(backend.writes).toEqual([[{
    kind: "plan", subjectKey: "player:qa-player-a", activityId: "qa-training", revision: 1,
    targets: { distance: 5600, hsr: 410, sprint: 70 },
  }]]);
  await expect(gpsValue("distance")).toHaveText("5.4 km");
});

test("Session review leads from match to training and saves only intentional player edits", async ({ page }) => {
  const saved = (playerId, targets) => ({
    kind: "plan", subjectKey: `player:qa-player-${playerId}`, activityId: "qa-training", revision: 1, targets,
  });
  const backend = {
    records: [saved("a", { distance: 6000, hsr: 400 }), saved("c", { distance: 9000, sprint: 0 })],
    extraEvents: [{ id: "qa-after", date: "2026-11-30", title: "Monday recovery", type: "recovery", time: "09:00" }],
    writes: [],
    canEdit: true,
    gpsActuals: { status: "ready", rows: [
      { playerId: "qa-player-a", activityId: "qa-first", metrics: { distance: 8900 }, comparable: ["distance"], sessionDurationMinutes: 94.2 },
      { playerId: "qa-player-b", activityId: "qa-first", metrics: { distance: 3600 }, comparable: ["distance"], sessionDurationMinutes: 32 },
      { playerId: "qa-player-a", activityId: "qa-next", metrics: { distance: 9300 }, comparable: ["distance"], sessionDurationMinutes: 96 },
      { playerId: "qa-player-a", activityId: "qa-training", metrics: { distance: 5700, hsr: 300 }, comparable: ["distance"] },
      { playerId: "qa-player-b", activityId: "qa-training", metrics: { distance: 0, sprint: 0 }, comparable: ["distance", "sprint"] },
    ] },
  };
  const room = await boot(page, { backend });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  const review = room.getByRole("region", { name: "Session review", exact: true });
  const compare = review.getByRole("table", { name: "Session player comparison" });
  const summary = review.locator(".pr-review-summary");
  await expect(review.getByRole("heading", { name: "Midweek training" })).toBeVisible();
  await expect(summary).toContainText("1 of 3 players comparable");
  await expect(summary).toContainText("5.7 km");
  await expect(summary).toContainText("−0.3 km");
  await expect(summary).toContainText("7.5 km");
  await expect(compare.getByRole("row", { name: /Blair Example/ })).toContainText("0 km");
  await expect(compare.getByRole("row", { name: /Blair Example/ })).toContainText("No target");
  await expect(compare.getByRole("row", { name: /Casey Example/ })).toContainText("No linked GPS");
  await expect(compare.getByRole("row", { name: /Blair Example/ })).toContainText("Modified");
  await expect(review).not.toContainText("Private clinical note");

  await review.getByRole("button", { name: "First match", exact: true }).click();
  await expect(review.getByRole("heading", { name: "First match" })).toBeVisible();
  await expect(compare.getByRole("row", { name: /Alex Example/ })).toContainText("94.2 min");
  await expect(compare.getByRole("row", { name: /Blair Example/ })).toContainText("32 min");
  await expect(review.getByText(/Official playing minutes are unavailable/)).toBeVisible();
  await review.getByRole("button", { name: "Midweek training", exact: true }).click();
  await review.getByRole("button", { name: "HSR", exact: true }).click();
  await expect(summary).toContainText("0 of 3 players comparable");
  await expect(compare.getByRole("row", { name: /Alex Example/ })).toContainText("Zones unconfirmed");
  await review.getByRole("button", { name: "Distance", exact: true }).click();

  await review.getByRole("button", { name: "Edit player targets" }).click();
  const editor = review.getByRole("region", { name: "Player targets" });
  const alex = editor.getByRole("row", { name: /Alex Example/ });
  const blair = editor.getByRole("row", { name: /Blair Example/ });
  const casey = editor.getByRole("row", { name: /Casey Example/ });
  const proposal = editor.getByRole("textbox", { name: "All players Total distance" });
  const playerDistance = (row) => row.getByRole("textbox", { name: /Total distance/i });
  await proposal.fill("4");
  await editor.getByRole("button", { name: "Fill empty targets" }).click();
  await expect(playerDistance(alex)).toHaveValue("6");
  await expect(playerDistance(casey)).toHaveValue("9");
  await expect(playerDistance(blair)).toHaveValue("4");
  await expect(blair).toContainText("Team draft");

  await alex.getByRole("checkbox").check();
  await blair.getByRole("checkbox").check();
  await proposal.fill("5");
  await editor.getByRole("button", { name: "Replace targets for selected players" }).click();
  await expect(alex).toContainText("Group draft");
  await expect(playerDistance(blair)).toHaveValue("5");
  await expect(playerDistance(casey)).toHaveValue("9");
  await playerDistance(blair).fill("6");
  await expect(blair).toContainText("Individual draft");
  await expect(summary.locator("[data-pr-review-week-avg]")).toHaveText("6.667 km");
  expect(backend.writes).toHaveLength(0);

  await editor.getByRole("button", { name: "Save player targets" }).click();
  await expect(room.locator(".pr-plan-status")).toContainText("Player targets saved");
  expect(backend.writes).toHaveLength(1);
  expect(backend.writes[0]).toHaveLength(2);
  expect(backend.writes[0]).toEqual(expect.arrayContaining([
    saved("a", { distance: 5000, hsr: 400 }),
    { ...saved("b", { distance: 6000 }), revision: 0 },
  ]));
  await review.getByRole("button", { name: "Back to review" }).click();
  await expect(summary).toContainText("2 of 3 players comparable");
  await expect(summary).toContainText("5.5 km");
  await expect(summary).toContainText("2.85 km");
  await expect(summary.locator("[data-pr-review-week-avg]")).toHaveText("6.667 km");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(review.getByRole("group", { name: "Week days" })).toBeVisible();
  expect(await room.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await compare.getByRole("button", { name: "Alex Example", exact: true }).click();
  await expect(room.getByRole("combobox", { name: "Player", exact: true })).toHaveValue("qa-player-a");
  await expect(room.getByRole("heading", { name: "Measured this week" })).toBeVisible();

  await room.getByRole("button", { name: "Team week", exact: true }).click();
  await review.getByRole("group", { name: "Week days" }).getByRole("button", { name: /Sat 28.*Match/ }).click();
  await review.getByRole("button", { name: "Monday recovery", exact: true }).click();
  await expect(review.getByRole("heading", { name: "Monday recovery" })).toBeVisible();
  await expect(compare.getByRole("row", { name: /Alex Example/ })).toContainText("96 min");
});

test("GPS History loads one selected week on demand and filters source players without reloading", async ({ page }) => {
  const historyReads = [];
  const room = await boot(page, { backend: {
    records: [], writes: [], canEdit: false, historyReads,
    history: { "2026-11-23": [
      { date: day, player: "Alex Example", type: "training", metrics: { distance: 5100, sprint: 0 }, link: "linked" },
      { date: day, player: "Former Courage Player", type: "match", opponent: "Example FC", metrics: { distance: 8500 }, link: "unmatched-player" },
    ] },
  } });
  expect(historyReads).toEqual([]);
  await room.getByRole("button", { name: "GPS History", exact: true }).click();
  const table = room.getByRole("table");
  await expect(table.getByRole("row", { name: /Former Courage Player/ })).toContainText("Player needs a Squad link");
  await expect(table.getByRole("row", { name: /Alex Example/ })).toContainText("5.1");
  await expect(table.getByRole("row", { name: /Alex Example/ }).getByRole("cell", { name: "0", exact: true })).toBeVisible();
  await room.getByRole("combobox", { name: "Player" }).selectOption("Former Courage Player");
  await expect(table.getByRole("row", { name: /Alex Example/ })).toHaveCount(0);
  expect(historyReads).toEqual(["2026-11-23"]);
  await room.getByRole("button", { name: "Previous week" }).click();
  await expect(room.getByRole("status")).toContainText("No workbook GPS entries for this week");
  expect(historyReads).toEqual(["2026-11-23", "2026-11-16"]);
});
