import {
  cloneScheduleEvent,
  formatScheduleDateValue,
  getScheduleEventDedupKey,
  getUniqueScheduleEvents,
  normalizeScheduleDayNotes,
  parseScheduleDateValue,
  scheduleOverviewSpanOptions,
} from "./schedule-state.mjs";

export function getScheduleNavigationStepForState() {
  return 1;
}

export function shiftScheduleStateWindow(state, delta) {
  if (!state) {
    return state;
  }

  const nextDate = new Date(state.selectedYear, state.selectedMonthIndex + delta, 1);

  state.selectedYear = nextDate.getFullYear();
  state.selectedMonthIndex = nextDate.getMonth();
  state.selectedDate = formatScheduleDateValue(nextDate);
  return state;
}

export function setScheduleStateViewMode(state) {
  if (!state) {
    return state;
  }
  state.viewMode = "planner";
  const selectedDate = parseScheduleDateValue(state.selectedDate);
  state.selectedYear = selectedDate.getFullYear();
  state.selectedMonthIndex = selectedDate.getMonth();
  return state;
}

export function setScheduleStateOverviewSpan(state, span) {
  if (!state) {
    return state;
  }
  const overviewSpan = Number(span);
  state.overviewSpan = scheduleOverviewSpanOptions.includes(overviewSpan) ? overviewSpan : 6;
  state.viewMode = "planner";
  return state;
}

export function selectScheduleStateDate(state, dateValue, options = {}) {
  if (!state) {
    return state;
  }

  const date = parseScheduleDateValue(dateValue);
  const windowStart = new Date(state.selectedYear, state.selectedMonthIndex, 1);
  const plannerWindowMonths = Math.max(1, Math.floor(Number(options.plannerWindowMonths) || 1));
  const visibleMonthCount = plannerWindowMonths;
  const windowEnd = new Date(state.selectedYear, state.selectedMonthIndex + visibleMonthCount, 0);
  const keepPlannerWindow =
    options.keepPlannerWindow !== false &&
    date >= windowStart &&
    date <= windowEnd;

  if (!keepPlannerWindow) {
    state.selectedYear = date.getFullYear();
    state.selectedMonthIndex = date.getMonth();
  }
  state.selectedDate = formatScheduleDateValue(date);
  return state;
}

export function createScheduleEventClipboard(event) {
  return event
    ? {
        kind: "event",
        events: [cloneScheduleEvent(event)],
      }
    : null;
}

export function createScheduleDayClipboard(events = []) {
  const copiedEvents = events.map(cloneScheduleEvent);
  return copiedEvents.length
    ? {
        kind: "day",
        events: copiedEvents,
      }
    : null;
}

export function pasteScheduleClipboard(state, clipboard) {
  if (!state || !clipboard?.events?.length) {
    return state;
  }

  const date = state.selectedDate;
  if (clipboard.kind === "day") {
    state.events = state.events.filter((event) => event.date !== date);
  }
  state.events.push(
    ...clipboard.events.map((event) =>
      cloneScheduleEvent({
        ...event,
        id: "",
        date,
      })
    )
  );
  state.events = getUniqueScheduleEvents(state.events);
  return state;
}

export function setScheduleDayNote(state, dateValue, note) {
  if (!state || !dateValue) {
    return false;
  }
  const normalizedNotes = normalizeScheduleDayNotes(state.dayNotes);
  const normalizedNote = String(note ?? "").replace(/\r\n?/g, "\n").trim();
  const previousNote = normalizedNotes[dateValue] || "";
  if (normalizedNote) {
    normalizedNotes[dateValue] = normalizedNote;
  } else {
    delete normalizedNotes[dateValue];
  }
  state.dayNotes = normalizedNotes;
  return previousNote !== (normalizedNotes[dateValue] || "");
}

export function moveScheduleEventToDate(state, eventId, dateValue) {
  if (!state || !eventId || !dateValue) {
    return { changed: false, eventId: "" };
  }
  const event = state.events.find((item) => item.id === eventId);
  if (!event) {
    return { changed: false, eventId: "" };
  }
  const targetDate = formatScheduleDateValue(parseScheduleDateValue(dateValue));
  if (event.date === targetDate) {
    state.selectedDate = targetDate;
    return { changed: false, eventId };
  }

  const movedEvent = cloneScheduleEvent({ ...event, date: targetDate });
  const duplicateEvent = state.events.find(
    (item) => item.id !== eventId && getScheduleEventDedupKey(item) === getScheduleEventDedupKey(movedEvent)
  );
  if (duplicateEvent) {
    state.events = state.events.filter((item) => item.id !== eventId);
    state.selectedDate = targetDate;
    return { changed: true, eventId: duplicateEvent.id };
  }

  state.events = state.events.map((item) => (item.id === eventId ? movedEvent : item));
  state.events = getUniqueScheduleEvents(state.events);
  state.selectedDate = targetDate;
  return { changed: true, eventId: movedEvent.id };
}

export function startScheduleEventEdit(state, eventId) {
  if (!state) {
    return null;
  }
  const event = state.events.find((item) => item.id === eventId);
  if (!event) {
    return null;
  }
  const date = parseScheduleDateValue(event.date);
  state.selectedYear = date.getFullYear();
  state.selectedMonthIndex = date.getMonth();
  state.selectedDate = event.date;
  return event;
}

export function removeScheduleEventById(state, eventId) {
  if (!state) {
    return state;
  }
  state.events = state.events.filter((item) => item.id !== eventId);
  return state;
}

export function upsertScheduleEventFromValues(state, values = {}, editingEventId = "") {
  if (!state || !values.date || !values.title) {
    return { changed: false, editingEventId };
  }

  const date = parseScheduleDateValue(values.date);
  state.selectedYear = date.getFullYear();
  state.selectedMonthIndex = date.getMonth();
  state.selectedDate = formatScheduleDateValue(date);

  const eventPayload = {
    date: state.selectedDate,
    time: values.time,
    type: values.type,
    title: values.title,
    note: values.note,
  };

  if (editingEventId) {
    state.events = state.events.map((item) =>
      item.id === editingEventId ? cloneScheduleEvent({ ...item, ...eventPayload }) : item
    );
  } else {
    const nextEvent = cloneScheduleEvent(eventPayload);
    if (!state.events.some((item) => getScheduleEventDedupKey(item) === getScheduleEventDedupKey(nextEvent))) {
      state.events.push(nextEvent);
    }
  }

  state.events = getUniqueScheduleEvents(state.events);
  return { changed: true, editingEventId: "" };
}
