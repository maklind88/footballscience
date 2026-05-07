import { expect, test } from "@playwright/test";
import {
  createScheduleEventCounts,
  createScheduleLegacyReadAdapter,
  normalizeScheduleState,
  scheduleStorageKey,
  selectScheduleEventsForDate,
  selectScheduleEventsForMonth,
  selectScheduleMainEvent,
  selectScheduleTrainingEventForDate,
} from "../src/modules/manifest.mjs";

const now = "2026-05-07T12:00:00.000Z";
const idFactory = (_event, index = 0) => `event-${index + 1}`;

test("Schedule adapter normalizes current schedule storage without changing the visible event model", () => {
  const rawSchedule = JSON.stringify({
    selectedYear: "2026",
    selectedMonthIndex: "4",
    selectedDate: "2026-05-07",
    viewMode: "overview",
    overviewSpan: 9,
    importVersion: "ncc-2026-numbers-v1",
    events: [
      {
        id: "match",
        date: "2026-05-08",
        time: "20:00",
        type: "match",
        title: " Orlando Pride - NCC ",
        note: " Away ",
      },
      {
        date: "2026-05-07",
        type: "mystery",
        title: " Training ",
      },
      {
        date: "2026-05-09",
        type: "travel",
        title: "",
      },
    ],
  });

  const state = normalizeScheduleState(rawSchedule, { now, idFactory });

  expect(state).toMatchObject({
    selectedYear: 2026,
    selectedMonthIndex: 4,
    selectedDate: "2026-05-07",
    viewMode: "overview",
    overviewSpan: 9,
    importVersion: "ncc-2026-numbers-v1",
  });
  expect(state.events).toHaveLength(2);
  expect(state.events[0]).toMatchObject({
    id: "match",
    date: "2026-05-08",
    time: "20:00",
    type: "match",
    title: "Orlando Pride - NCC",
    note: "Away",
  });
  expect(state.events[1]).toMatchObject({
    id: "event-2",
    date: "2026-05-07",
    type: "training",
    title: "Training",
  });
});

test("Schedule selectors match day, month, main event, and training-session behavior", () => {
  const state = normalizeScheduleState(
    {
      selectedDate: "2026-05-08",
      events: [
        { id: "late-training", date: "2026-05-08", time: "18:00", type: "training", title: "Training PM" },
        { id: "match", date: "2026-05-08", time: "20:00", type: "match", title: "Match" },
        { id: "early-training", date: "2026-05-08", time: "09:30", type: "training", title: "Training AM" },
        { id: "meeting", date: "2026-05-12", time: "10:00", type: "meeting", title: "Staff meeting" },
        { id: "june", date: "2026-06-01", type: "training", title: "June training" },
      ],
    },
    { now, idFactory }
  );

  const mayEvents = selectScheduleEventsForMonth(state, 2026, 4);
  const dayEvents = selectScheduleEventsForDate(state, "2026-05-08");

  expect(mayEvents.map((event) => event.id)).toEqual(["late-training", "match", "early-training", "meeting"]);
  expect(dayEvents.map((event) => event.id)).toEqual(["early-training", "late-training", "match"]);
  expect(selectScheduleMainEvent(dayEvents)).toMatchObject({ id: "match" });
  expect(selectScheduleTrainingEventForDate(state, "2026-05-08")).toMatchObject({ id: "early-training" });
  expect(createScheduleEventCounts(state.events)).toMatchObject({
    training: 3,
    match: 1,
    meeting: 1,
    travel: 0,
    recovery: 0,
    off: 0,
  });
});

test("Schedule legacy read adapter uses the protected storage key and blocks writes", async () => {
  const reads = [];
  const adapter = createScheduleLegacyReadAdapter(
    {
      read: async (key) => {
        reads.push(key);
        return JSON.stringify({
          selectedDate: "2026-05-08",
          events: [
            { id: "match", date: "2026-05-08", time: "20:00", type: "match", title: "Orlando Pride - NCC" },
            { id: "training", date: "2026-05-08", time: "10:00", type: "training", title: "Training" },
          ],
        });
      },
    },
    { now, idFactory }
  );

  await expect(adapter.readState()).resolves.toMatchObject({ selectedDate: "2026-05-08" });
  await expect(adapter.readEventsForDate("2026-05-08")).resolves.toHaveLength(2);
  await expect(adapter.readEventsForMonth(2026, 4)).resolves.toHaveLength(2);
  await expect(adapter.readMainEventForDate("2026-05-08")).resolves.toMatchObject({ id: "match" });
  await expect(adapter.readTrainingEventForDate("2026-05-08")).resolves.toMatchObject({ id: "training" });
  await expect(adapter.writeEvent({ title: "Nope" })).rejects.toThrow("read-only");
  await expect(adapter.removeEvent("match")).rejects.toThrow("read-only");
  expect(reads).toEqual([
    scheduleStorageKey,
    scheduleStorageKey,
    scheduleStorageKey,
    scheduleStorageKey,
    scheduleStorageKey,
  ]);
});

test("Schedule adapter treats invalid legacy payloads as empty instead of destructive", () => {
  expect(normalizeScheduleState("{not-json}", { now, idFactory })).toMatchObject({
    selectedYear: 2026,
    selectedMonthIndex: 4,
    viewMode: "month",
    overviewSpan: 6,
    events: [],
  });
  expect(normalizeScheduleState({ events: "bad" }, { now, idFactory }).events).toEqual([]);
});
