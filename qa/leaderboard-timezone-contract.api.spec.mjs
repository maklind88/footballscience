import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLeaderboardActions } from "../src/modules/leaderboard/leaderboard-actions.mjs";
import { createLeaderboardState, createLeaderboardStore } from "../src/modules/leaderboard/leaderboard-state.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const boundaryNow = new Date("2026-08-31T22:30:00.000Z");

test("UTC date helpers stay in August when a Stockholm browser is already in September", () => {
  const helpersUrl = pathToFileURL(path.join(rootDir, "src/modules/leaderboard/leaderboard-helpers.mjs")).href;
  const selectorsUrl = pathToFileURL(path.join(rootDir, "src/modules/leaderboard/leaderboard-selectors.mjs")).href;
  const stateUrl = pathToFileURL(path.join(rootDir, "src/modules/leaderboard/leaderboard-state.mjs")).href;
  const sessionUrl = pathToFileURL(path.join(rootDir, "src/modules/session-planner/session-planner-workspace-controller.mjs")).href;
  const script = `
    import { LEADERBOARD_TIMEZONE, formatLeaderboardDate, getLeaderboardMonthValue, getLeaderboardTodayValue } from ${JSON.stringify(helpersUrl)};
    import { getLeaderboardMonthBounds, isLeaderboardCurrentMonth } from ${JSON.stringify(selectorsUrl)};
    import { createLeaderboardState } from ${JSON.stringify(stateUrl)};
    import { createSessionPlannerLeaderboardAwardAction } from ${JSON.stringify(sessionUrl)};
    const now = new Date("2026-08-31T22:30:00.000Z");
    const getNow = () => now;
    const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    const augustAction = createSessionPlannerLeaderboardAwardAction({ canEdit: true, getNow, selectedDate: "2026-08-31", session: { blocks: [{ id: "b1" }] } });
    const septemberAction = createSessionPlannerLeaderboardAwardAction({ canEdit: true, getNow, selectedDate: "2026-09-01", session: { blocks: [{ id: "b1" }] } });
    console.log(JSON.stringify({
      timezone: LEADERBOARD_TIMEZONE,
      localDate,
      today: getLeaderboardTodayValue(now),
      month: getLeaderboardMonthValue(now),
      bounds: getLeaderboardMonthBounds("2026-08", now),
      augustIsCurrent: isLeaderboardCurrentMonth("2026-08", now),
      septemberIsCurrent: isLeaderboardCurrentMonth("2026-09", now),
      stateMonth: createLeaderboardState(now).month,
      displayDate: formatLeaderboardDate("2026-08-31", "en-GB"),
      augustAction,
      septemberAction,
    }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, TZ: "Europe/Stockholm" },
  });

  expect(result.status, result.stderr).toBe(0);
  const proof = JSON.parse(result.stdout.trim());
  expect(proof).toMatchObject({
    timezone: "UTC",
    localDate: "2026-09-01",
    today: "2026-08-31",
    month: "2026-08",
    bounds: { min: "2026-08-01", max: "2026-08-31" },
    augustIsCurrent: true,
    septemberIsCurrent: false,
    stateMonth: "2026-08",
    displayDate: "31 Aug 2026",
    augustAction: { enabled: true, command: { occurredOn: "2026-08-31" } },
    septemberAction: { visible: false, enabled: false, command: null },
  });
});

test("award and reversal write gates use the same injected UTC month", async () => {
  const getNow = () => boundaryNow;
  const roster = [{ playerId: "p1", displayName: "Player One" }];
  const payload = { ok: true, schema: "footballscience-leaderboard-v1", month: "2026-08", competition: { status: "open" }, roster, standings: [], events: [] };
  const calls = [];
  const store = createLeaderboardStore(createLeaderboardState(boundaryNow));
  store.setState({
    status: "ready",
    data: payload,
    draft: { occurredOn: "2026-08-31", title: "Boundary training", assignments: { p1: { placement: 1 } } },
  });
  const actions = createLeaderboardActions({
    store,
    context: { canEdit: () => true, getNow },
    api: {
      loadMonth: async () => payload,
      award: async (command) => { calls.push(["award", command]); return payload; },
      reverseEvent: async (command) => { calls.push(["reverse", command]); return payload; },
    },
  });

  expect(actions.validateAward()).toMatchObject({ occurredOn: "2026-08-31", title: "Boundary training" });
  await actions.awardPoints();
  await actions.reverseEvent({ eventId: "event-1", reason: "Correction", idempotencyKey: "reverse:utc:1" });
  expect(calls.map(([action]) => action)).toEqual(["award", "reverse"]);

  const historicalStore = createLeaderboardStore(createLeaderboardState(boundaryNow));
  historicalStore.setState({
    month: "2026-07",
    status: "ready",
    data: { ...payload, month: "2026-07" },
    draft: { occurredOn: "2026-07-31", title: "Historical", assignments: { p1: { placement: 1 } } },
  });
  let historicalWrites = 0;
  const historicalActions = createLeaderboardActions({
    store: historicalStore,
    context: { canEdit: () => true, getNow },
    api: {
      award: async () => { historicalWrites += 1; },
      reverseEvent: async () => { historicalWrites += 1; },
    },
  });

  expect(historicalActions.validateAward()).toEqual({ error: "Completed Leaderboard months are read-only." });
  await historicalActions.reverseEvent({ eventId: "event-1", reason: "Correction", idempotencyKey: "reverse:old:1" });
  expect(historicalWrites).toBe(0);
  expect(historicalStore.getState().ui.draftError).toBe("Completed Leaderboard months are read-only.");
});
