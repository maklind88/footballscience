import { expect, test } from "@playwright/test";
import { createDashboardHomeContextSelectors } from "../src/modules/home/dashboard-context-selectors.mjs";

function createSelectors(overrides = {}) {
  const scheduleState = {
    events: [
      { id: "training-2", date: "2026-06-02", type: "training", time: "10:00", title: "Training" },
      { id: "match-1", date: "2026-06-03", type: "match", time: "18:00", title: "Match" },
      { id: "off-1", date: "2026-06-01", type: "off", time: "", title: "Off" },
    ],
    ...overrides.scheduleState,
  };
  const sessionPlannerState = {
    sessions: {
      "2026-06-02": { date: "2026-06-02", blocks: [{ minutes: 30 }, { minutes: "15" }] },
      ...(overrides.sessions || {}),
    },
  };
  const periodizationDays = {
    "2026-06-01": { physicalLoad: "Low", matchDay: "" },
    "2026-06-02": { physicalLoad: "High", matchDay: "MD-1" },
    "2026-06-03": { physicalLoad: "Match", matchDay: "MD" },
  };
  const medicalRecords = overrides.medicalRecords ?? [{ date: "2026-06-01", status: "limited" }];

  return createDashboardHomeContextSelectors({
    cloneSession: (session = {}) => ({ ...session, blocks: Array.isArray(session.blocks) ? [...session.blocks] : [] }),
    createEmptySession: (dateValue = "2026-06-01") => ({ date: dateValue, blocks: [] }),
    ensurePlayerProfilesState: overrides.ensurePlayerProfilesState || (() => {}),
    formatScheduleDateValue: (value) => {
      const date = value instanceof Date ? value : new Date(value);
      return date.toISOString().slice(0, 10);
    },
    getMedicalRecords: () => medicalRecords,
    getPeriodizationDay: (dateValue) => periodizationDays[dateValue] || {},
    getPlayerProfilesState: () => overrides.playerProfilesState || { players: [] },
    getScheduleEventsForDate: (dateValue) => scheduleState.events.filter((event) => event.date === dateValue),
    getScheduleMainEvent: (events = []) => events.find((event) => event.type === "match") || events[0] || null,
    getScheduleState: () => scheduleState,
    getSessionPlannerState: () => sessionPlannerState,
    getUpcomingPlayerProfileBirthdays: overrides.getUpcomingPlayerProfileBirthdays || (() => ({ items: [], next: null })),
    isScheduleSessionEvent: (event) => event?.type === "training",
    parseScheduleDateValue: (value) => new Date(`${value}T00:00:00.000Z`),
    scheduleEventTypes: {
      match: { label: "Match" },
      off: { label: "Off" },
      training: { label: "Training" },
    },
    scheduleMainEventPriority: { match: 0, training: 1, off: 9 },
  });
}

test("Home dashboard context selectors rank events, sessions, microcycle, and alerts", () => {
  const selectors = createSelectors();

  expect(selectors.getRelativeDateLabel("2026-06-01", "2026-06-01")).toBe("Today");
  expect(selectors.getRelativeDateLabel("2026-06-02", "2026-06-01")).toBe("Tomorrow");
  expect(selectors.getUpcomingEvents("2026-06-01").map((event) => event.id)).toEqual(["off-1", "training-2", "match-1"]);
  expect(selectors.getUpcomingEvents("2026-06-01", ["match"]).map((event) => event.id)).toEqual(["match-1"]);

  const nextSession = selectors.getNextSession("2026-06-01");
  expect(nextSession.date).toBe("2026-06-02");
  expect(nextSession.isMissingPlan).toBe(false);
  expect(selectors.getSessionTotalMinutes(nextSession.session)).toBe(45);
  expect(selectors.getMicrocycle("2026-06-01")[1]).toMatchObject({ dateValue: "2026-06-02", tone: "high" });
  expect(selectors.getMedicalAlert("2026-06-01")).toMatchObject({ tone: "medical", workspaceId: "medical-team" });
});

test("Home dashboard context selectors build the complete Home render context", () => {
  let birthdayStateEnsured = false;
  let birthdayOptions = null;
  const selectors = createSelectors({
    medicalRecords: [],
    ensurePlayerProfilesState: () => {
      birthdayStateEnsured = true;
    },
    playerProfilesState: {
      players: [{ id: "p8", name: "Ada Midfielder", birthDate: "2001-07-24" }],
    },
    getUpcomingPlayerProfileBirthdays: (players = [], options = {}) => {
      birthdayOptions = options;
      return {
        items: players.map((player) => ({ id: player.id, name: player.name, referenceDate: options.referenceDate })),
        next: players[0] || null,
        trackedCount: players.length,
        withBirthDateCount: players.length,
        missingBirthDateCount: 0,
        thisMonthCount: 1,
      };
    },
  });
  const context = selectors.getHomeContext(
    { id: "coach-1" },
    [{ id: "coach-1" }, { id: "coach-2" }],
    [
      { id: "mine", title: "Mine", assignedTo: "coach-1", createdBy: "coach-2", scope: "team", status: "open" },
      { id: "personal", title: "Own", assignedTo: "coach-1", createdBy: "coach-1", scope: "personal", status: "open" },
      { id: "delegated", title: "Delegate", assignedTo: "coach-2", createdBy: "coach-1", scope: "team", status: "open" },
    ]
  );

  expect(context.todayValue).toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(context.myOpenTasks.map((task) => task.id)).toEqual(["mine"]);
  expect(context.personalOpenTasks.map((task) => task.id)).toEqual(["personal"]);
  expect(context.delegatedOpenTasks.map((task) => task.id)).toEqual(["delegated"]);
  expect(context.alerts.map((alert) => alert.title)).toContain("Staff follow-up");
  expect(context.alerts.find((alert) => alert.title === "Medical availability")?.tone).toBe("monitor");
  expect(birthdayStateEnsured).toBe(true);
  expect(birthdayOptions).toMatchObject({ referenceDate: context.todayValue, includeTemporary: false, limit: 12 });
  expect(context.birthdayCalendar.items).toEqual([
    expect.objectContaining({ id: "p8", name: "Ada Midfielder", referenceDate: context.todayValue }),
  ]);
});
