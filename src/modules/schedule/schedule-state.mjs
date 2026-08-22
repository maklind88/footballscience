import {
  formatScheduleDateValue,
  normalizeScheduleVisibleEventTypes,
  parseScheduleDateValue,
  scheduleEventTypeKeys,
  scheduleEventTypes,
  scheduleMainEventPriority,
  scheduleOverviewSpanOptions,
  scheduleStorageKey,
} from "./events.mjs";

export {
  formatScheduleDateValue,
  normalizeScheduleVisibleEventTypes,
  parseScheduleDateValue,
  scheduleEventTypeKeys,
  scheduleEventTypes,
  scheduleMainEventPriority,
  scheduleOverviewSpanOptions,
  scheduleStorageKey,
};

export const scheduleViewModes = Object.freeze(["planner"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNoteText(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function createScheduleEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultScheduleState(now = new Date()) {
  const date = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  return {
    selectedYear: date.getFullYear(),
    selectedMonthIndex: date.getMonth(),
    selectedDate: formatScheduleDateValue(date),
    viewMode: "planner",
    overviewSpan: 6,
    visibleEventTypes: [...scheduleEventTypeKeys],
    importVersion: "",
    events: [],
    dayNotes: {},
  };
}

export function cloneScheduleEvent(event = {}, options = {}) {
  const fallbackState = options.defaultState || createDefaultScheduleState(options.now);
  const date = normalizeText(event.date) || fallbackState.selectedDate;
  const type = scheduleEventTypes[event.type] ? event.type : "training";

  return {
    id: normalizeText(event.id) || createScheduleEventId(),
    date,
    time: normalizeText(event.time),
    type,
    title: normalizeText(event.title),
    note: normalizeNoteText(event.note),
  };
}

export function normalizeScheduleDayNotes(dayNotes = {}) {
  if (!dayNotes || typeof dayNotes !== "object" || Array.isArray(dayNotes)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(dayNotes)
      .map(([dateValue, note]) => [normalizeText(dateValue), normalizeNoteText(note)])
      .filter(([dateValue, note]) => dateValue && note)
  );
}

export function normalizeScheduleTextForDedup(value) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

export function getScheduleEventDedupKey(event = {}) {
  return [
    normalizeText(event.date),
    normalizeText(event.time),
    scheduleEventTypes[event.type] ? event.type : "",
    normalizeScheduleTextForDedup(event.title),
  ].join("::");
}

export function getUniqueScheduleEvents(events = []) {
  const seen = new Set();
  return events.filter((event) => {
    const key = getScheduleEventDedupKey(event);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function cloneScheduleState(source = createDefaultScheduleState(), options = {}) {
  const fallbackState = createDefaultScheduleState(options.now);
  const selectedYear = Number.isFinite(Number(source.selectedYear))
    ? Number(source.selectedYear)
    : fallbackState.selectedYear;
  const rawMonthIndex = Number(source.selectedMonthIndex);
  const selectedMonthIndex = Number.isFinite(rawMonthIndex)
    ? Math.min(11, Math.max(0, rawMonthIndex))
    : fallbackState.selectedMonthIndex;
  const selectedDate =
    normalizeText(source.selectedDate) || formatScheduleDateValue(new Date(selectedYear, selectedMonthIndex, 1));
  const viewMode = "planner";
  const overviewSpan = scheduleOverviewSpanOptions.includes(Number(source.overviewSpan))
    ? Number(source.overviewSpan)
    : 6;
  const events = getUniqueScheduleEvents(
    Array.isArray(source.events)
      ? source.events
          .map((event) => cloneScheduleEvent(event, { ...options, defaultState: fallbackState }))
          .filter((event) => event.title.trim())
      : []
  );

  return {
    selectedYear,
    selectedMonthIndex,
    selectedDate,
    viewMode,
    overviewSpan,
    visibleEventTypes: normalizeScheduleVisibleEventTypes(source.visibleEventTypes),
    importVersion: normalizeText(source.importVersion),
    events,
    dayNotes: normalizeScheduleDayNotes(source.dayNotes),
  };
}

export function mergeImportedScheduleEvents(state, options = {}) {
  const mergedState = cloneScheduleState(state);
  const importVersion = normalizeText(options.importVersion);
  const importedEvents = Array.isArray(options.events) ? options.events : [];

  if (!importVersion || mergedState.importVersion === importVersion || !importedEvents.length) {
    return mergedState;
  }

  const existingIds = new Set(mergedState.events.map((event) => event.id));
  const existingSignatures = new Set(mergedState.events.map(getScheduleEventDedupKey));
  const nextEvents = importedEvents
    .map((event) => cloneScheduleEvent(event))
    .filter((event) => !existingIds.has(event.id) && !existingSignatures.has(getScheduleEventDedupKey(event)));

  return {
    ...mergedState,
    importVersion,
    events: [...mergedState.events, ...nextEvents],
  };
}

export function mergeScheduleStatePreservingLocalUi(localValue, centralValue) {
  let localState = null;
  let centralStateValue = null;

  try {
    localState = localValue ? JSON.parse(localValue) : null;
    centralStateValue = centralValue ? JSON.parse(centralValue) : null;
  } catch {
    return centralValue;
  }

  if (!localState || typeof localState !== "object" || !centralStateValue || typeof centralStateValue !== "object") {
    return centralValue;
  }

  return JSON.stringify({
    ...centralStateValue,
    selectedYear: localState.selectedYear ?? centralStateValue.selectedYear,
    selectedMonthIndex: localState.selectedMonthIndex ?? centralStateValue.selectedMonthIndex,
    selectedDate: localState.selectedDate ?? centralStateValue.selectedDate,
    viewMode: "planner",
    overviewSpan: localState.overviewSpan ?? centralStateValue.overviewSpan,
    visibleEventTypes: localState.visibleEventTypes ?? centralStateValue.visibleEventTypes,
  });
}
