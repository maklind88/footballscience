export const scheduleStorageKey = "football-schedule-v1";
export const scheduleEventTypes = Object.freeze({
  training: Object.freeze({ label: "Training", tone: "training" }),
  match: Object.freeze({ label: "Match", tone: "match" }),
  meeting: Object.freeze({ label: "Meeting", tone: "meeting" }),
  travel: Object.freeze({ label: "Travel", tone: "travel" }),
  recovery: Object.freeze({ label: "Recovery", tone: "recovery" }),
  off: Object.freeze({ label: "Off", tone: "off" }),
});
export const scheduleEventTypeKeys = Object.freeze(Object.keys(scheduleEventTypes));
export const scheduleMainEventPriority = Object.freeze({
  match: 1,
  training: 2,
  travel: 3,
  meeting: 4,
  recovery: 5,
  off: 6,
});
export const scheduleOverviewSpanOptions = Object.freeze([3, 6, 9, 12]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function defaultNow() {
  return new Date();
}

function defaultIdFactory() {
  return `schedule-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const [year, month, day] = normalizeText(value).split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatScheduleDateValue(date) {
  const safeDate = toDate(date) || defaultNow();
  return `${safeDate.getFullYear()}-${padDatePart(safeDate.getMonth() + 1)}-${padDatePart(safeDate.getDate())}`;
}

export function parseScheduleDateValue(dateValue, fallbackDate = defaultNow()) {
  return toDate(dateValue) || toDate(fallbackDate) || defaultNow();
}

export function parseSchedulePayload(rawValue) {
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return rawValue;
  }

  if (Array.isArray(rawValue)) {
    return { events: rawValue };
  }

  if (!rawValue || typeof rawValue !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return { events: parsed };
    }
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeScheduleEventType(type) {
  const normalizedType = normalizeText(type);
  return scheduleEventTypes[normalizedType] ? normalizedType : "training";
}

export function normalizeScheduleEvent(event = {}, options = {}) {
  const fallbackDate = normalizeText(options.selectedDate) || formatScheduleDateValue(options.now || defaultNow());
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : defaultIdFactory;

  return Object.freeze({
    id: normalizeText(event?.id) || normalizeText(idFactory(event)),
    date: normalizeText(event?.date) || fallbackDate,
    time: normalizeText(event?.time),
    type: normalizeScheduleEventType(event?.type),
    title: normalizeText(event?.title),
    note: normalizeText(event?.note),
  });
}

export function normalizeScheduleState(rawValue, options = {}) {
  const source = parseSchedulePayload(rawValue);
  const now = toDate(options.now) || defaultNow();
  const selectedYear = Number.isFinite(Number(source.selectedYear)) ? Number(source.selectedYear) : now.getFullYear();
  const rawMonthIndex = Number(source.selectedMonthIndex);
  const selectedMonthIndex = Number.isFinite(rawMonthIndex) ? Math.min(11, Math.max(0, rawMonthIndex)) : now.getMonth();
  const selectedDate = normalizeText(source.selectedDate) || formatScheduleDateValue(new Date(selectedYear, selectedMonthIndex, 1));
  const overviewSpan = scheduleOverviewSpanOptions.includes(Number(source.overviewSpan)) ? Number(source.overviewSpan) : 6;
  const events = (Array.isArray(source.events) ? source.events : [])
    .map((event, index) =>
      normalizeScheduleEvent(event, {
        ...options,
        selectedDate,
        idFactory: event?.id
          ? options.idFactory
          : () =>
              typeof options.idFactory === "function"
                ? options.idFactory(event, index)
                : defaultIdFactory(event, index),
      })
    )
    .filter((event) => event.title);

  return Object.freeze({
    selectedYear,
    selectedMonthIndex,
    selectedDate,
    viewMode: ["month", "week", "overview"].includes(source.viewMode) ? source.viewMode : "month",
    overviewSpan,
    importVersion: normalizeText(source.importVersion),
    events: Object.freeze(events),
  });
}

function compareScheduleEventsByTimeAndTitle(first, second) {
  return `${first.time || "99:99"} ${first.title}`.localeCompare(`${second.time || "99:99"} ${second.title}`);
}

function normalizeEventSource(source) {
  return Array.isArray(source) ? source : source?.events || [];
}

export function selectScheduleEventsForDate(source, dateValue) {
  const normalizedDate = normalizeText(dateValue);
  return Object.freeze(
    normalizeEventSource(source)
      .filter((event) => event.date === normalizedDate)
      .sort(compareScheduleEventsByTimeAndTitle)
  );
}

export function selectScheduleEventsForMonth(source, year, monthIndex) {
  const cleanYear = Number(year);
  const cleanMonthIndex = Number(monthIndex);
  return Object.freeze(
    normalizeEventSource(source).filter((event) => {
      const eventDate = parseScheduleDateValue(event.date, new Date(0));
      return eventDate.getFullYear() === cleanYear && eventDate.getMonth() === cleanMonthIndex;
    })
  );
}

export function selectScheduleMainEvent(events = []) {
  return (
    [...events].sort((first, second) => {
      const firstPriority = scheduleMainEventPriority[first.type] ?? 99;
      const secondPriority = scheduleMainEventPriority[second.type] ?? 99;
      if (firstPriority !== secondPriority) {
        return firstPriority - secondPriority;
      }

      return compareScheduleEventsByTimeAndTitle(first, second);
    })[0] || null
  );
}

export function isScheduleTrainingEvent(event = {}) {
  const title = normalizeText(event.title).toLowerCase();
  return event.type === "training" || title.includes("training");
}

export function selectScheduleTrainingEventForDate(source, dateValue) {
  return selectScheduleEventsForDate(source, dateValue).find(isScheduleTrainingEvent) || null;
}

export function createScheduleEventCounts(events = []) {
  return Object.freeze(
    scheduleEventTypeKeys.reduce((counts, type) => {
      counts[type] = events.filter((event) => event.type === type).length;
      return counts;
    }, {})
  );
}
