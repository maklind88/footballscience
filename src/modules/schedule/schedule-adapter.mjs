import { createReadOnlyStorageAdapter, storageAdapterKinds } from "../../core/storage-adapters.mjs";
import {
  createScheduleEventCounts,
  normalizeScheduleState,
  scheduleStorageKey,
  selectScheduleEventsForDate,
  selectScheduleEventsForMonth,
  selectScheduleMainEvent,
  selectScheduleTrainingEventForDate,
} from "./events.mjs";

function assertReadableAdapter(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter.read !== "function") {
    throw new TypeError("Schedule adapter requires a readable storage adapter.");
  }
}

export function createScheduleReadAdapter(storageAdapter, defaultOptions = {}) {
  assertReadableAdapter(storageAdapter);

  return Object.freeze({
    storageKey: scheduleStorageKey,
    kind: storageAdapter.kind || storageAdapterKinds.legacyAppState,
    async readState(options = {}) {
      const rawValue = await storageAdapter.read(scheduleStorageKey);
      return normalizeScheduleState(rawValue, { ...defaultOptions, ...options });
    },
    async readEvents(options = {}) {
      const state = await this.readState(options);
      return state.events;
    },
    async readEventsForDate(dateValue, options = {}) {
      const events = await this.readEvents(options);
      return selectScheduleEventsForDate(events, dateValue);
    },
    async readEventsForMonth(year, monthIndex, options = {}) {
      const events = await this.readEvents(options);
      return selectScheduleEventsForMonth(events, year, monthIndex);
    },
    async readMainEventForDate(dateValue, options = {}) {
      const events = await this.readEventsForDate(dateValue, options);
      return selectScheduleMainEvent(events);
    },
    async readTrainingEventForDate(dateValue, options = {}) {
      const events = await this.readEvents(options);
      return selectScheduleTrainingEventForDate(events, dateValue);
    },
    async readEventCounts(options = {}) {
      const events = await this.readEvents(options);
      return createScheduleEventCounts(events);
    },
    async writeEvent() {
      throw new Error("Schedule adapter is read-only until migration is explicitly enabled.");
    },
    async removeEvent() {
      throw new Error("Schedule adapter is read-only until migration is explicitly enabled.");
    },
  });
}

export function createScheduleLegacyReadAdapter({ read }, options = {}) {
  return createScheduleReadAdapter(
    createReadOnlyStorageAdapter({
      kind: storageAdapterKinds.legacyAppState,
      read,
    }),
    options
  );
}
