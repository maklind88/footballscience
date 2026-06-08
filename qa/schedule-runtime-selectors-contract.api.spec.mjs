import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScheduleRuntimeSelectors } from "../src/modules/schedule/index.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Schedule runtime selectors own read-only app bridge outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const composerSource = readProjectFile("src/core/platform-runtime-services-composer.mjs");
  const selectorSource = readProjectFile("src/modules/schedule/schedule-runtime-selectors.mjs");
  const indexSource = readProjectFile("src/modules/schedule/index.mjs");

  expect(appSource).toContain("createPlatformRuntimeServices({");
  expect(appSource).not.toContain("createScheduleRuntimeSelectors({");
  expect(composerSource).toContain("createScheduleRuntimeSelectors({");
  expect(appSource).not.toContain("function getScheduleSelectedDayContext");
  expect(appSource).not.toContain("function getScheduleSessionSnapshot");
  expect(selectorSource).not.toContain("localStorage");
  expect(selectorSource).not.toContain("setItem");
  expect(selectorSource).not.toContain("writeScheduleState");
  expect(selectorSource).not.toContain("writeSessionPlannerState");
  expect(indexSource).toContain('export * from "./schedule-runtime-selectors.mjs";');
});

test("Schedule runtime selectors preserve events, sessions, and periodization context", () => {
  let periodizationEnsured = false;
  const scheduleState = {
    events: [
      { id: "late", date: "2026-05-08", time: "", type: "travel", title: "Travel" },
      { id: "early", date: "2026-05-08", time: "09:00", type: "training", title: "Training" },
      { id: "other", date: "2026-06-01", time: "10:00", type: "match", title: "Match" },
    ],
  };
  const sessionPlannerState = {
    sessions: {
      "2026-05-08": {
        blocks: [{ minutes: 20 }, { minutes: "15" }, { minutes: "" }],
      },
    },
  };
  const selectors = createScheduleRuntimeSelectors({
    ensurePeriodizationState: () => {
      periodizationEnsured = true;
    },
    ensureScheduleState: () => scheduleState,
    ensureSessionPlannerState: () => sessionPlannerState,
    formatBlockSummary: (count, minutes) => `${count}/${minutes}`,
    getDayWarnings: (_events, _day, _snapshot, helpers) => [helpers.isSessionEvent({ type: "training" }) ? "session" : "none"],
    getMainEvent: (events) => events[0] || null,
    getPeriodizationDay: () => ({ daySchedule: "Training", matchDay: "MD-1", matchPhases: ["Load"], subPhases: ["Press", "Set"] }),
    getPeriodizationDayScheduleLabel: (day) => day.daySchedule,
    getPeriodizationMatchDayLabel: (matchDay) => matchDay,
    getScheduleState: () => scheduleState,
    getUniqueEvents: (events) => events,
    isSessionEvent: (event) => event.type === "training",
    parseDateValue: (dateValue) => new Date(`${dateValue}T00:00:00`),
  });

  expect(selectors.getEventsForDate("2026-05-08").map((event) => event.id)).toEqual(["early", "late"]);
  expect(selectors.getSessionEventForDate("2026-05-08")?.id).toBe("early");
  expect(selectors.getScheduledSessionTitleForDate("2026-05-08")).toBe("Training");
  expect(selectors.getMonthEvents(2026, 4).map((event) => event.id)).toEqual(["late", "early"]);

  const snapshot = selectors.getSessionSnapshot("2026-05-08");
  expect(snapshot).toMatchObject({ hasSession: true, minutes: 35 });

  const context = selectors.getSelectedDayContext("2026-05-08");
  expect(periodizationEnsured).toBe(true);
  expect(context).toMatchObject({
    periodizationLabel: "Training",
    matchDayLabel: "MD-1",
    phaseSummary: "Load / Press / Set",
  });
  expect(selectors.getScheduleDayWarnings([], {}, snapshot)).toEqual(["session"]);
  expect(selectors.formatBlockSummary(2, 35)).toBe("2/35");
});
