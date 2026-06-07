import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createPeriodizationWorkspaceController,
  createPeriodizationRenderer,
  createPeriodizationStateAdapter,
  normalizePeriodizationMultiValue,
  periodizationFieldUpdatedAtKey,
  periodizationMultiFields,
  periodizationOptionLibrary,
  periodizationYear,
} from "../src/modules/periodization/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(dateValue) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createClosestTarget(selector, dataset = {}, extra = {}) {
  const target = {
    dataset,
    tagName: extra.tagName || "BUTTON",
    value: extra.value || "",
    closest: (query) => (query === selector ? target : null),
    matches: (query) => Boolean(extra.matches?.includes?.(query)),
  };
  return target;
}

test("Periodization extraction owns the state, renderer, and controller module file slots", () => {
  [
    "src/modules/periodization/index.mjs",
    "src/modules/periodization/periodization-state.mjs",
    "src/modules/periodization/periodization-renderer.mjs",
    "src/modules/periodization/periodization-controller.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });
});

test("Periodization app integration delegates state, renderer, controller, and merge helpers to the module", () => {
  const app = readProjectFile("app.js");

  expect(app).toContain("./src/modules/periodization/periodization-state.mjs");
  expect(app).toContain("./src/modules/periodization/periodization-renderer.mjs");
  expect(app).toContain("./src/modules/periodization/periodization-controller.mjs");
  expect(app).toContain("createPeriodizationStateAdapter");
  expect(app).toContain("createPeriodizationRenderer");
  expect(app).toContain("createPeriodizationWorkspaceController");
  expect(app).toContain("getPeriodizationDay: getPeriodizationDayFromState");
  expect(app).toContain("periodizationRenderer.renderWorkspace");
  expect(app).toContain("periodizationWorkspaceController.bind()");
  expect(app).not.toContain('ui.periodizationBoard?.addEventListener("click"');
  expect(app).not.toContain("function renderPeriodizationDayCard(");
  expect(app).not.toContain("function renderPeriodizationWeek(");
  expect(app).not.toContain("function renderPeriodizationDayViewPanel(");
  expect(app).not.toContain("const periodizationPhaseLibrary =");
  expect(app).not.toContain("function normalizePeriodizationDay(day");
  expect(app).not.toContain("function clonePeriodizationState(");
  expect(app).not.toContain("function mergePeriodizationStatePreservingLocalUi(");
});

test("Periodization controller delegates board clicks and field changes through the module boundary", () => {
  const calls = [];
  const registered = [];
  const makeElement = (id) => ({
    addEventListener: (type) => registered.push(`${id}:${type}`),
  });
  const controller = createPeriodizationWorkspaceController({
    ui: {
      periodizationTodayButton: makeElement("today"),
      periodizationPrevMonthButton: makeElement("prev"),
      periodizationNextMonthButton: makeElement("next"),
      periodizationMonthSelect: makeElement("month"),
      periodizationPickerGrid: makeElement("picker"),
      periodizationBoard: makeElement("board"),
    },
    getState: () => ({ selectedDate: "2026-05-08" }),
    canEdit: () => true,
    selectDate: (...args) => calls.push(["selectDate", ...args]),
    writeDay: (...args) => calls.push(["writeDay", ...args]),
    getCustomFieldValue: () => ["Progress quickly once pressure is broken"],
    getMultiFieldValue: () => ["In Possession"],
    isMultiField: (fieldKey) => fieldKey === "matchPhases",
    setMultiSelectOpenField: (fieldKey) => calls.push(["setOpen", fieldKey]),
    getMultiSelectOpenField: () => "",
    refreshMultiFields: (keys) => calls.push(["refreshMulti", keys]),
    refreshDependentFields: (fieldKey) => calls.push(["refreshDependent", fieldKey]),
    setOverlayState: (state) => calls.push(["overlay", state]),
    render: () => calls.push(["render"]),
  });

  controller.bind();
  expect(registered).toEqual([
    "today:click",
    "prev:click",
    "next:click",
    "month:change",
    "picker:click",
    "board:click",
    "board:keydown",
    "board:input",
    "board:change",
  ]);

  controller.handleBoardClick({
    target: createClosestTarget("[data-periodization-edit-date]", { periodizationEditDate: "2026-05-09" }),
  });
  expect(calls).toContainEqual(["setOpen", ""]);
  expect(calls).toContainEqual(["selectDate", "2026-05-09", true, "edit"]);

  controller.handleBoardChange({
    target: createClosestTarget(
      "[data-periodization-field]",
      { periodizationField: "matchPhases" },
      { tagName: "INPUT", value: "unused" }
    ),
  });
  expect(calls).toContainEqual(["writeDay", "2026-05-08", { matchPhases: ["In Possession"] }, false]);
  expect(calls).toContainEqual(["refreshDependent", "matchPhases"]);
});

test("Periodization state keeps the current default calendar and option contract", () => {
  const adapter = createPeriodizationStateAdapter({
    formatDateValue,
    parseDateValue,
    importedVersion: "ncc-test",
    importedDays: {},
    today: new Date(2026, 4, 12),
  });

  expect(periodizationYear).toBe(2026);
  expect(adapter.defaultPeriodizationState).toMatchObject({
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-01",
    importVersion: "ncc-test",
  });
  expect(periodizationOptionLibrary.matchPhases).toContain("In Possession");
  expect(periodizationOptionLibrary.subPhases).toContain("Build Up");
  expect(periodizationMultiFields.has("teamPrinciples")).toBe(true);
  expect(normalizePeriodizationMultiValue(["Build Up", "Build Up", " High Press "])).toEqual(["Build Up", "High Press"]);
});

test("Periodization renderer keeps the day card and overlay contract", () => {
  const renderer = createPeriodizationRenderer({
    escapeHtml,
    formatDateValue,
    parseDateValue,
    getState: () => ({ selectedDate: "2026-05-08" }),
    getDay: () => ({
      daySchedule: "Training",
      sessionType: "Training",
      physicalLoad: "Moderate",
      pitchSize: "SSG",
      preTrainingVideo: "Training Prep",
      matchDay: "Match Day -2",
      matchPhases: ["In Possession"],
      subPhases: ["Build Up"],
      teamPrinciples: ["Progress quickly once pressure is broken"],
      miniGamePrinciples: ["Drive past press"],
    }),
    canEdit: () => true,
    isOffDay: () => false,
    getMultiSelectOpenField: () => "teamPrinciples",
    renderActionIcon: () => "icon",
  });

  const card = renderer.renderDayCard(new Date(2026, 4, 8), 4);
  expect(card).toContain("periodization-day-card");
  expect(card).toContain("Match Day -2");
  expect(card).toContain('data-periodization-edit-date="2026-05-08"');

  const panel = renderer.renderDayPanel("2026-05-08", { isOverlay: true, mode: "edit" });
  expect(panel).toContain("periodization-day-panel");
  expect(panel).toContain('data-periodization-field="physicalLoad"');
  expect(panel).toContain('data-periodization-multi-field="teamPrinciples"');
});

test("Periodization state derives match-day context from Schedule without overwriting manual match-day edits", () => {
  const allScheduleEvents = [
    { id: "training", date: "2026-05-08", type: "training", title: "Training" },
    { id: "match", date: "2026-05-10", type: "match", title: "Match" },
  ];
  const adapter = createPeriodizationStateAdapter({
    formatDateValue,
    parseDateValue,
    getScheduleEventsForDate: (dateValue) => allScheduleEvents.filter((event) => event.date === dateValue),
    getAllScheduleEvents: () => allScheduleEvents,
    getScheduleEventLabel: (type) => (type === "match" ? "Match" : "Training"),
  });

  const autoDay = adapter.getPeriodizationDay("2026-05-08", { days: {} });
  expect(autoDay).toMatchObject({
    daySchedule: "Training",
    sessionType: "Training",
    physicalLoad: "Moderate",
    matchDay: "Match Day -2",
  });

  const manualDay = adapter.getPeriodizationDay("2026-05-08", {
    days: {
      "2026-05-08": {
        daySchedule: "Training",
        sessionType: "Training",
        physicalLoad: "Moderate",
        matchDay: "Match Day +1",
        [periodizationFieldUpdatedAtKey]: {
          matchDay: "2026-05-07T12:00:00.000Z",
        },
      },
    },
  });
  expect(manualDay.matchDay).toBe("Match Day +1");
});

test("Periodization state merges stale local and central day edits by field timestamps", () => {
  const adapter = createPeriodizationStateAdapter({
    formatDateValue,
    parseDateValue,
    importedVersion: "ncc-test",
  });
  const localState = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-09",
    importVersion: "ncc-test",
    days: {
      "2026-05-09": {
        daySchedule: "Training",
        physicalLoad: "Low",
        sessionNotes: "Fresh coach note",
        [periodizationFieldUpdatedAtKey]: {
          physicalLoad: "2026-05-07T14:00:00.000Z",
          sessionNotes: "2026-05-07T16:00:00.000Z",
        },
      },
    },
  };
  const centralState = {
    selectedYear: 2026,
    selectedMonthIndex: 3,
    selectedDate: "2026-04-01",
    importVersion: "ncc-test",
    days: {
      "2026-05-09": {
        daySchedule: "Training",
        physicalLoad: "High",
        sessionNotes: "Older central note",
        [periodizationFieldUpdatedAtKey]: {
          physicalLoad: "2026-05-07T15:00:00.000Z",
          sessionNotes: "2026-05-07T13:00:00.000Z",
        },
      },
      "2026-05-10": {
        daySchedule: "Recovery",
        sessionNotes: "Central recovery",
      },
    },
  };

  const merged = JSON.parse(
    adapter.mergePeriodizationStatePreservingLocalUi(JSON.stringify(localState), JSON.stringify(centralState))
  );

  expect(merged.selectedMonthIndex).toBe(4);
  expect(merged.selectedDate).toBe("2026-05-09");
  expect(merged.days["2026-05-09"].physicalLoad).toBe("High");
  expect(merged.days["2026-05-09"].sessionNotes).toBe("Fresh coach note");
  expect(merged.days["2026-05-10"].sessionNotes).toBe("Central recovery");
});
