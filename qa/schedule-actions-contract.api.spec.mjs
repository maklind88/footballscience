import { expect, test } from "@playwright/test";
import { selectScheduleStateDate } from "../src/modules/schedule/schedule-actions.mjs";

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
