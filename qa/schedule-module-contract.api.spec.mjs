import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createDefaultScheduleState,
  createScheduleDayClipboard,
  createScheduleWorkspaceRenderer,
  pasteScheduleClipboard,
  selectScheduleStateDate,
  setScheduleStateOverviewSpan,
  setScheduleStateViewMode,
  shiftScheduleStateWindow,
  upsertScheduleEventFromValues,
} from "../src/modules/schedule/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Schedule extraction owns the required module file slots", () => {
  [
    "src/modules/schedule/index.mjs",
    "src/modules/schedule/schedule-renderer.mjs",
    "src/modules/schedule/schedule-state.mjs",
    "src/modules/schedule/schedule-actions.mjs",
    "src/modules/schedule/schedule-adapter.mjs",
    "src/modules/schedule/schedule.css",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });
});

test("Schedule app integration imports state, actions, and renderer from the module", () => {
  const app = readProjectFile("app.js");

  expect(app).toContain("./src/modules/schedule/schedule-actions.mjs");
  expect(app).toContain("./src/modules/schedule/schedule-renderer.mjs");
  expect(app).toContain("./src/modules/schedule/schedule-state.mjs");
  expect(app).toContain("scheduleWorkspaceRenderer.renderWorkspace");
  expect(app).not.toContain("function renderScheduleEventCard(event");
  expect(app).not.toContain("function renderScheduleMonthDay(date");
});

test("Schedule actions preserve navigation, copy paste, and upsert behavior", () => {
  const state = createDefaultScheduleState(new Date(2026, 4, 7));

  setScheduleStateViewMode(state, "overview");
  setScheduleStateOverviewSpan(state, 6);
  selectScheduleStateDate(state, "2026-05-08");
  expect(state).toMatchObject({
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-08",
    viewMode: "overview",
    overviewSpan: 6,
  });

  const result = upsertScheduleEventFromValues(state, {
    date: "2026-05-08",
    time: "10:00",
    type: "training",
    title: "Training",
    note: "Pitch",
  });
  expect(result).toEqual({ changed: true, editingEventId: "" });
  expect(state.events).toHaveLength(1);

  const clipboard = createScheduleDayClipboard(state.events);
  selectScheduleStateDate(state, "2026-05-09");
  pasteScheduleClipboard(state, clipboard);
  expect(state.events.map((event) => event.date)).toEqual(["2026-05-08", "2026-05-09"]);

  shiftScheduleStateWindow(state, 6);
  expect(state.selectedDate).toBe("2026-11-01");
});

test("Schedule renderer keeps the visible day operations contract", () => {
  const renderer = createScheduleWorkspaceRenderer({
    getNow: () => new Date(2026, 4, 8),
    getPeriodizationDay: () => ({ daySchedule: "Training" }),
    getPeriodizationDayScheduleLabel: (day) => day.daySchedule,
  });
  const state = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-08",
    viewMode: "week",
    overviewSpan: 6,
    events: [{ id: "training", date: "2026-05-08", time: "10:00", type: "training", title: "Training" }],
  };

  const html = renderer.renderWeekDay(
    {
      state,
      getEventsForDate: () => state.events,
      getVisibleEvents: (events) => events,
      getSessionForDate: () => ({ blocks: [{ minutes: 15 }] }),
    },
    new Date(2026, 4, 8)
  );

  expect(html).toContain("schedule-week-day");
  expect(html).toContain("1 plan");
  expect(html).toContain("1 blocks");

  const insights = renderer.renderDayInsights(
    {
      canCreateSession: true,
      getSelectedDayContext: () => ({
        sessionSnapshot: { hasSession: false, blocks: [], minutes: 0 },
      }),
    },
    "2026-05-08",
    state.events
  );
  expect(insights).toContain("Create Session");
  expect(insights).toContain("Open Periodization");
});
