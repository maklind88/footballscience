import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createDefaultScheduleState,
  createScheduleDayClipboard,
  createScheduleWorkspaceController,
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
    "src/modules/schedule/schedule-controller.mjs",
    "src/modules/schedule/schedule.css",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });
});

test("Schedule app integration delegates controller wiring to the module", () => {
  const app = readProjectFile("app.js");

  expect(app).toContain("./src/modules/schedule/schedule-controller.mjs");
  expect(app).toContain("./src/modules/schedule/schedule-state.mjs");
  expect(app).toContain("scheduleWorkspaceController.bind()");
  expect(app).toContain("scheduleWorkspaceController.render()");
  expect(app).not.toContain("ui.schedulePrevMonthButton?.addEventListener");
  expect(app).not.toContain("data-edit-schedule-event");
  expect(app).not.toContain("function renderScheduleEventCard(event");
  expect(app).not.toContain("function renderScheduleMonthDay(date");
});

function createFakeElement(dataset = {}) {
  const listeners = new Map();
  return {
    dataset,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.({
        preventDefault: () => {},
        target: this,
        currentTarget: this,
        ...event,
      });
    },
    reset() {},
  };
}

test("Schedule controller owns date navigation and shortcut clipboard wiring", () => {
  const state = createDefaultScheduleState(new Date(2026, 4, 7));
  state.events = [{ id: "training", date: "2026-06-01", time: "10:00", type: "training", title: "Training" }];
  const writes = [];
  const renderContexts = [];
  const ui = {
    scheduleNextMonthButton: createFakeElement(),
  };
  const controller = createScheduleWorkspaceController({
    ui,
    document: { addEventListener() {} },
    window: { requestAnimationFrame: (run) => run(), matchMedia: () => ({ matches: true }) },
    renderer: { renderWorkspace: (context) => renderContexts.push(context) },
    getState: () => state,
    ensureState: () => state,
    writeState: (options = {}) => writes.push(options),
    canEdit: () => true,
    canCreateSession: () => true,
    isActive: () => true,
    isEditableKeyboardTarget: () => false,
    getEventsForDate: (dateValue) => state.events.filter((event) => event.date === dateValue),
    getVisibleEvents: (events) => events,
    getVisibleMonthEvents: () => [],
    getSelectedDayContext: () => ({ sessionSnapshot: { hasSession: false, blocks: [], minutes: 0 } }),
  });

  controller.bind();
  ui.scheduleNextMonthButton.dispatch("click");

  expect(state.selectedMonthIndex).toBe(5);
  expect(state.selectedDate).toBe("2026-06-01");
  expect(writes[0]).toEqual({ syncCentral: false });
  expect(renderContexts).toHaveLength(1);

  let copyPrevented = false;
  controller.handleDocumentKeydown({
    key: "c",
    target: null,
    preventDefault: () => {
      copyPrevented = true;
    },
  });
  expect(copyPrevented).toBe(true);
  expect(controller.getUiState().clipboard.events).toHaveLength(1);

  controller.selectDate("2026-06-02");
  let pastePrevented = false;
  controller.handleDocumentKeydown({
    key: "v",
    target: null,
    preventDefault: () => {
      pastePrevented = true;
    },
  });

  expect(pastePrevented).toBe(true);
  expect(state.events.map((event) => event.date)).toEqual(["2026-06-01", "2026-06-02"]);
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
