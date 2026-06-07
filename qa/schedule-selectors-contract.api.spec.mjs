import { expect, test } from "@playwright/test";
import {
  formatMonthYearLabel,
  formatScheduleBlockSummary,
  formatScheduleMonthName,
  getScheduleDayWarnings,
  getScheduleMainEvent,
  isScheduleSessionEvent,
} from "../src/modules/schedule/schedule-selectors.mjs";

test("Schedule selectors format month and session summary labels", () => {
  const date = new Date(2026, 4, 1);

  expect(formatMonthYearLabel(date)).toBe("May 2026");
  expect(formatScheduleMonthName(date)).toBe("May");
  expect(formatScheduleBlockSummary(1, 0)).toBe("1 block");
  expect(formatScheduleBlockSummary(3, 75)).toBe("3 blocks / 75 min");
});

test("Schedule selectors keep main event and session detection semantics", () => {
  const events = [
    { type: "training", time: "10:00", title: "Training" },
    { type: "match", time: "18:00", title: "Match" },
    { type: "travel", time: "08:00", title: "Travel" },
  ];

  expect(getScheduleMainEvent(events)).toMatchObject({ type: "match", title: "Match" });
  expect(isScheduleSessionEvent({ type: "meeting", title: "Team training prep" })).toBe(true);
  expect(isScheduleSessionEvent({ type: "off", title: "Recovery" })).toBe(false);
});

test("Schedule selectors build selected-day warnings without owning periodization state", () => {
  const warnings = getScheduleDayWarnings(
    [
      { type: "training", time: "10:00", title: "Training" },
      { type: "off", time: "10:00", title: "Off" },
      { type: "match", time: "18:00", title: "Match" },
    ],
    { matchDay: "" },
    { hasSession: false },
    {
      getPeriodizationDayScheduleLabel: () => "Training",
      getPeriodizationMatchDayLabel: () => "",
    }
  );

  expect(warnings).toEqual([
    "Training without session plan",
    "OFF mixed with active plan",
    "Match missing match day tag",
    "Time conflict at 10:00",
  ]);
});
