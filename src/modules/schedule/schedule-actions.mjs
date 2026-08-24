import {
  cloneScheduleEvent,
  formatScheduleDateValue,
  getScheduleEventDedupKey,
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

export function createScheduleEventsClipboard(events = []) {
  const copiedEvents = events.map(cloneScheduleEvent);
  return copiedEvents.length
    ? {
        kind: "events",
        events: copiedEvents,
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

export function getScheduleClipboardReplacementCount(state, clipboard, dateValue = state?.selectedDate) {
  if (!state || clipboard?.kind !== "day" || !dateValue) {
    return 0;
  }
  return state.events.filter((event) => event.date === dateValue).length;
}

export function pasteScheduleClipboard(state, clipboard, options = {}) {
  if (!state || !clipboard?.events?.length) {
    return state;
  }

  const date = state.selectedDate;
  if (getScheduleClipboardReplacementCount(state, clipboard, date) && options.allowRemoval !== true) {
    return state;
  }
  if (clipboard.kind === "day") {
    state.events = state.events.filter((event) => event.date !== date);
  }
  clipboard.events.forEach((event) => {
    const copiedEvent = cloneScheduleEvent({
      ...event,
      id: "",
      date,
    });
    if (!state.events.some((item) => getScheduleEventDedupKey(item) === getScheduleEventDedupKey(copiedEvent))) {
      state.events.push(copiedEvent);
    }
  });
  return state;
}

export function setScheduleDayNote(state, dateValue, note, options = {}) {
  if (!state || !dateValue) {
    return false;
  }
  const normalizedNotes = normalizeScheduleDayNotes(state.dayNotes);
  const normalizedNote = String(note ?? "").replace(/\r\n?/g, "\n").trim();
  const previousNote = normalizedNotes[dateValue] || "";
  if (previousNote && !normalizedNote && options.allowRemoval !== true) {
    return false;
  }
  if (normalizedNote) {
    normalizedNotes[dateValue] = normalizedNote;
  } else {
    delete normalizedNotes[dateValue];
  }
  state.dayNotes = normalizedNotes;
  return previousNote !== (normalizedNotes[dateValue] || "");
}

export function getScheduleEventMoveConflict(state, eventId, dateValue) {
  if (!state || !eventId || !dateValue) {
    return null;
  }
  const event = state.events.find((item) => item.id === eventId);
  if (!event) {
    return null;
  }
  const targetDate = formatScheduleDateValue(parseScheduleDateValue(dateValue));
  if (event.date === targetDate) {
    return null;
  }
  const movedEvent = cloneScheduleEvent({ ...event, date: targetDate });
  const duplicateEvent = state.events.find(
    (item) => item.id !== eventId && getScheduleEventDedupKey(item) === getScheduleEventDedupKey(movedEvent)
  );
  return duplicateEvent ? { duplicateEvent, event, targetDate } : null;
}

export function moveScheduleEventToDate(state, eventId, dateValue, options = {}) {
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

  const conflict = getScheduleEventMoveConflict(state, eventId, targetDate);
  if (conflict && options.allowDuplicateRemoval !== true) {
    return {
      changed: false,
      confirmationRequired: true,
      duplicateEventId: conflict.duplicateEvent.id,
      eventId,
    };
  }
  if (conflict) {
    state.events = state.events.filter((item) => item.id !== eventId);
    state.selectedDate = targetDate;
    return { changed: true, eventId: conflict.duplicateEvent.id };
  }

  const movedEvent = cloneScheduleEvent({ ...event, date: targetDate });
  state.events = state.events.map((item) => (item.id === eventId ? movedEvent : item));
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

export function removeScheduleEventById(state, eventId, options = {}) {
  removeScheduleEventsById(state, [eventId], options);
  return state;
}

export function removeScheduleEventsById(state, eventIds = [], options = {}) {
  if (!state) {
    return { changed: false, confirmationRequired: false, removedCount: 0 };
  }
  const values = eventIds instanceof Set || Array.isArray(eventIds) ? eventIds : [eventIds];
  const ids = new Set(Array.from(values || [], (eventId) => String(eventId || "").trim()).filter(Boolean));
  const removedCount = state.events.filter((item) => ids.has(item.id)).length;
  if (!removedCount) {
    return { changed: false, confirmationRequired: false, removedCount: 0 };
  }
  if (options.allowRemoval !== true) {
    return { changed: false, confirmationRequired: true, removedCount: 0 };
  }
  state.events = state.events.filter((item) => !ids.has(item.id));
  return { changed: true, confirmationRequired: false, removedCount };
}

export function getScheduleEventUpsertConflict(state, values = {}, editingEventId = "") {
  if (!state || !editingEventId || !values.date || !values.title) {
    return null;
  }
  const event = state.events.find((item) => item.id === editingEventId);
  if (!event) {
    return null;
  }
  const candidate = cloneScheduleEvent({
    ...event,
    date: formatScheduleDateValue(parseScheduleDateValue(values.date)),
    time: values.time,
    type: values.type,
    title: values.title,
    note: values.note,
  });
  const duplicateEvent = state.events.find(
    (item) => item.id !== editingEventId && getScheduleEventDedupKey(item) === getScheduleEventDedupKey(candidate)
  );
  return duplicateEvent ? { duplicateEvent, event, candidate } : null;
}

export function upsertScheduleEventFromValues(state, values = {}, editingEventId = "", options = {}) {
  if (!state || !values.date || !values.title) {
    return { changed: false, editingEventId };
  }

  const date = parseScheduleDateValue(values.date);
  const conflict = getScheduleEventUpsertConflict(state, values, editingEventId);
  if (conflict && options.allowDuplicateRemoval !== true) {
    return {
      changed: false,
      confirmationRequired: true,
      duplicateEventId: conflict.duplicateEvent.id,
      editingEventId,
    };
  }
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
    state.events = conflict
      ? state.events.filter((item) => item.id !== editingEventId)
      : state.events.map((item) =>
          item.id === editingEventId ? cloneScheduleEvent({ ...item, ...eventPayload }) : item
        );
  } else {
    const nextEvent = cloneScheduleEvent(eventPayload);
    if (!state.events.some((item) => getScheduleEventDedupKey(item) === getScheduleEventDedupKey(nextEvent))) {
      state.events.push(nextEvent);
    }
  }
  return { changed: true, editingEventId: "" };
}
