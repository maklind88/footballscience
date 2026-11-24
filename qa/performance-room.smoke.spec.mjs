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
      const planningSources = {
        playerIds: entries[squadKey].players.map(({ id }) => id),
        activityIds: entries[scheduleKey].events.filter(({ type }) => type !== "meeting").map(({ id }) => id),
      };
      return route.fulfill({ json: { ok: true, week, canEdit: backend.canEdit, records: backend.records, planningSources } });
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

test("Team week saves squad goals and edits all individual targets from one activity", async ({ page }) => {
  const backend = { records: [], writes: [], canEdit: true };
  const room = await boot(page, { backend });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  const plan = room.locator(".pr-plan-workbench");
  const goal = plan.getByRole("textbox", { name: "Weekly squad Total distance" });
  await goal.fill("120");
  await plan.getByRole("textbox", { name: "Weekly squad High-speed running" }).fill("8000");
  await plan.getByRole("textbox", { name: "Weekly squad Sprint distance" }).fill("2400");
  await plan.getByRole("button", { name: "Save weekly goals" }).click();
  await expect(plan.getByRole("status")).toContainText("Weekly goals saved");
  expect(backend.writes[0]).toEqual([{
    kind: "week-goal", subjectKey: "week:2026-11-23", activityId: "", revision: 0,
    targets: { distance: 120000, hsr: 8000, sprint: 2400 },
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
  await editor.getByRole("button", { name: "Apply to all" }).click();
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
  await expect(training.locator("td").last()).toContainText(`${((backend.writes[1].length - 1) * 80).toLocaleString("en-GB")} m total`);
  const plannedDistance = (backend.writes[1].length * 5.2 + 1).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  await expect(plan.getByRole("region", { name: "Weekly training goals" })).toContainText(`Planned · ${plannedDistance} km`);
  await expect(goal).toHaveValue("120");

  await plan.getByRole("button", { name: "Player plan" }).click();
  await plan.getByRole("combobox", { name: "Player", exact: true }).selectOption("qa-player-a");
  await expect(plan.getByRole("textbox", { name: /Midweek training.*Total distance/ })).toHaveValue("6.2");

  backend.canEdit = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await room.getByRole("navigation", { name: "Performance Room" }).getByRole("button", { name: "Microcycle" }).click();
  await room.getByRole("button", { name: /Open load planning/ }).click();
  await expect(goal).toHaveValue("120");
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
  await expect(plan.getByRole("row", { name: /Midweek training/ })).toContainText("6.2 km total");

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
