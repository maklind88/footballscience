import { expect, test } from "@playwright/test";
import {
  createScheduleDayClipboard,
  pasteScheduleClipboard,
  selectScheduleStateDate,
  upsertScheduleEventFromValues,
} from "../src/modules/schedule/schedule-actions.mjs";

test("Schedule planner date selection keeps the visible month window", () => {
  const state = {
    selectedYear: 2027,
    selectedMonthIndex: 0,
    selectedDate: "2027-01-01",
    viewMode: "planner",
    overviewSpan: 6,
  };

  selectScheduleStateDate(state, "2027-02-12", { plannerWindowMonths: 3 });

  expect(state.selectedDate).toBe("2027-02-12");
  expect(state.selectedYear).toBe(2027);
  expect(state.selectedMonthIndex).toBe(0);
});

test("Schedule planner date selection moves the window when the date is outside view", () => {
  const state = {
    selectedYear: 2027,
    selectedMonthIndex: 0,
    selectedDate: "2027-01-01",
    viewMode: "planner",
    overviewSpan: 6,
  };

  selectScheduleStateDate(state, "2027-04-01", { plannerWindowMonths: 3 });

  expect(state.selectedDate).toBe("2027-04-01");
  expect(state.selectedYear).toBe(2027);
  expect(state.selectedMonthIndex).toBe(3);
});

test("Schedule today-style selection can force the planner window to the selected date", () => {
  const state = {
    selectedYear: 2027,
    selectedMonthIndex: 0,
    selectedDate: "2027-01-01",
    viewMode: "planner",
    overviewSpan: 6,
  };

  selectScheduleStateDate(state, "2027-02-12", {
    keepPlannerWindow: false,
    plannerWindowMonths: 3,
  });

  expect(state.selectedDate).toBe("2027-02-12");
  expect(state.selectedYear).toBe(2027);
  expect(state.selectedMonthIndex).toBe(1);
});

test("Schedule day paste refuses to replace plans without confirmed removal", () => {
  const state = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-12",
    events: [
      { id: "existing", date: "2026-05-12", time: "09:00", type: "off", title: "Existing" },
    ],
  };
  const clipboard = createScheduleDayClipboard([
    { id: "copied", date: "2026-05-09", time: "10:00", type: "training", title: "Copied" },
  ]);

  pasteScheduleClipboard(state, clipboard);
  expect(state.events).toHaveLength(1);
  expect(state.events[0]).toMatchObject({ id: "existing", title: "Existing" });

  pasteScheduleClipboard(state, clipboard, { allowRemoval: true });
  expect(state.events).toHaveLength(1);
  expect(state.events[0]).toMatchObject({ date: "2026-05-12", title: "Copied" });
});

test("Schedule edit refuses duplicate merge until removal is confirmed", () => {
  const state = {
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-12",
    events: [
      { id: "existing", date: "2026-05-12", time: "10:00", type: "training", title: "Training" },
      { id: "editing", date: "2026-05-12", time: "11:00", type: "meeting", title: "Meeting" },
    ],
  };
  const values = {
    date: "2026-05-12",
    time: "10:00",
    type: "training",
    title: "Training",
    note: "",
  };

  expect(upsertScheduleEventFromValues(state, values, "editing")).toMatchObject({
    changed: false,
    confirmationRequired: true,
    duplicateEventId: "existing",
  });
  expect(state.events.map((event) => event.id)).toEqual(["existing", "editing"]);

  expect(
    upsertScheduleEventFromValues(state, values, "editing", { allowDuplicateRemoval: true })
  ).toMatchObject({ changed: true });
  expect(state.events.map((event) => event.id)).toEqual(["existing"]);
});
