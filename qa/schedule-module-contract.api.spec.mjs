import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createDefaultScheduleState,
  createScheduleDayClipboard,
  createScheduleHomeMonthRenderer,
  createScheduleWorkspaceController,
  createScheduleWorkspaceRenderer,
  moveScheduleEventToDate,
  pasteScheduleClipboard,
  selectScheduleStateDate,
  setScheduleDayNote,
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
    "src/modules/schedule/schedule-home-month-renderer.mjs",
    "src/modules/schedule/schedule.css",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });
});

test("Schedule renders the current month preview for Home from the shared schedule state", () => {
  const renderer = createScheduleHomeMonthRenderer({
    getNow: () => new Date(2026, 7, 19),
  });
  const markup = renderer.render({
    todayValue: "2026-08-19",
    state: {
      visibleEventTypes: ["training", "match", "travel"],
      events: [
        { id: "training", date: "2026-08-19", type: "training", title: "Training" },
        { id: "match", date: "2026-08-22", type: "match", title: "Match" },
        { id: "travel", date: "2026-08-23", type: "travel", title: "Travel" },
        { id: "hidden", date: "2026-08-24", type: "recovery", title: "Recovery" },
        { id: "next-month", date: "2026-09-01", type: "training", title: "Training" },
      ],
    },
  });

  expect(markup).toContain("<h2>August</h2>");
  expect(markup).toContain('data-dashboard-open-schedule-date="2026-08-19"');
  expect(markup).toContain('class="dashboard-schedule-day is-today has-event is-training"');
  expect(markup).toContain('data-dashboard-open-schedule-date="2026-08-22"');
  expect(markup).toContain("is-match");
  expect(markup).toContain("is-travel");
  expect(markup).not.toContain("Recovery");
  expect(markup).not.toContain("2026-09-01");
});

test("Schedule app integration delegates controller wiring to the module", () => {
  const app = readProjectFile("app-runtime.js");
  const appComposer = readProjectFile("src/core/platform-app-runtime-services-composer.mjs");
  const composer = readProjectFile("src/core/platform-runtime-services-composer.mjs");
  const platformBindings = readProjectFile("src/core/platform-workspace-runtime-bindings.mjs");

  expect(app).toContain("./src/core/platform-app-runtime-services-composer.mjs");
  expect(appComposer).toContain("./platform-runtime-services-composer.mjs");
  expect(app).not.toContain("./src/modules/schedule/schedule-controller.mjs");
  expect(composer).toContain("../modules/schedule/schedule-controller.mjs");
  expect(composer).toContain("createScheduleWorkspaceController({");
  expect(app).toContain("./src/modules/schedule/schedule-state.mjs");
  expect(app).toContain("bindPlatformWorkspaceRuntimeBindings({");
  expect(app).not.toContain("scheduleWorkspaceController.bind()");
  expect(platformBindings).toContain("scheduleWorkspaceController?.bind?.()");
  expect(app).toContain("renderScheduleWorkspace,");
  expect(composer).toContain("scheduleWorkspaceController.render()");
  expect(app).not.toContain("ui.schedulePrevMonthButton?.addEventListener");
  expect(app).not.toContain("data-edit-schedule-event");
  expect(app).not.toContain("function renderScheduleEventCard(event");
  expect(app).not.toContain("function renderScheduleMonthDay(date");
  expect(app).toContain("scheduleWorkspaceController?.selectDate(dateValue);");
  expect(app).not.toContain("selectScheduleDate(dateValue);");
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

test("Schedule controller remeasures planner width after the view becomes active", () => {
  const state = createDefaultScheduleState(new Date(2026, 5, 1));
  state.viewMode = "planner";
  state.selectedYear = 2026;
  state.selectedMonthIndex = 5;
  state.selectedDate = "2026-06-01";

  let renderCount = 0;
  const rafCallbacks = new Map();
  let nextFrameId = 1;
  const ui = {
    schedulePlannerGrid: {
      clientWidth: 1280,
      dataset: { months: "3" },
      parentElement: { clientWidth: 1280 },
    },
    scheduleWorkspace: { clientWidth: 1280 },
  };
  const window = {
    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      rafCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      rafCallbacks.delete(id);
    },
  };
  const flushAnimationFrame = () => {
    const callbacks = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    callbacks.forEach((callback) => callback());
  };

  const controller = createScheduleWorkspaceController({
    ui,
    window,
    renderer: {
      getPlannerMonthCountForWidth: (width) => (width >= 1180 ? 4 : 3),
      renderWorkspace() {
        renderCount += 1;
        ui.schedulePlannerGrid.dataset.months = renderCount === 1 ? "3" : "4";
      },
    },
    getState: () => state,
    ensureState: () => state,
    canEdit: () => true,
    canCreateSession: () => true,
    isActive: () => true,
    getEventsForDate: () => [],
    getVisibleEvents: (events) => events,
    getVisibleMonthEvents: () => [],
    getSelectedDayContext: () => ({ sessionSnapshot: { hasSession: false, blocks: [], minutes: 0 } }),
  });

  controller.render();
  expect(renderCount).toBe(1);

  flushAnimationFrame();
  expect(renderCount).toBe(1);

  flushAnimationFrame();
  expect(renderCount).toBe(2);
  expect(ui.schedulePlannerGrid.dataset.months).toBe("4");

  flushAnimationFrame();
  flushAnimationFrame();
  expect(renderCount).toBe(2);
});

test("Schedule actions preserve navigation, copy paste, and upsert behavior", () => {
  const state = createDefaultScheduleState(new Date(2026, 4, 7));
  expect(state.dayNotes).toEqual({});

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

  const movedEventId = state.events.find((event) => event.date === "2026-05-09")?.id;
  const moveResult = moveScheduleEventToDate(state, movedEventId, "2026-05-10");
  expect(moveResult.changed).toBe(true);
  expect(state.events.find((event) => event.id === movedEventId)?.date).toBe("2026-05-10");

  const duplicateMoveResult = moveScheduleEventToDate(state, movedEventId, "2026-05-08");
  expect(duplicateMoveResult.changed).toBe(true);
  expect(state.events).toHaveLength(1);
  expect(state.events[0]).toMatchObject({ date: "2026-05-08", title: "Training" });

  expect(setScheduleDayNote(state, "2026-05-09", "Bus leaves after lunch")).toBe(true);
  expect(state.dayNotes["2026-05-09"]).toBe("Bus leaves after lunch");
  expect(setScheduleDayNote(state, "2026-05-09", "")).toBe(true);
  expect(state.dayNotes["2026-05-09"]).toBeUndefined();

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

  expect(renderer.getPlannerMonthCountForWidth(1280)).toBe(4);
  expect(renderer.getPlannerMonthCountForWidth(980)).toBe(3);
  expect(renderer.getPlannerMonthCountForWidth(640)).toBe(2);

  const plannerDay = renderer.renderPlannerDay(
    {
      state: {
        selectedDate: "2026-05-08",
        dayNotes: { "2026-05-08": "Bus leaves after lunch" },
      },
      canEdit: true,
      getEventsForDate: () => [],
      getVisibleEvents: (events) => events,
    },
    new Date(2026, 4, 8)
  );
  expect(plannerDay).toContain("schedule-planner-note-indicator");
  expect(plannerDay).toContain("Bus leaves after lunch");
});
