import { selectHomeTaskQueues } from "./tasks.mjs";

function addCalendarDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function defaultFormatScheduleDateValue(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  return value.toISOString().slice(0, 10);
}

function defaultParseScheduleDateValue(value) {
  return value instanceof Date ? value : new Date(value || Date.now());
}

export function createDashboardHomeContextSelectors(dependencies = {}) {
  const {
    cloneSession = (session = {}) => ({ ...session, blocks: Array.isArray(session.blocks) ? session.blocks : [] }),
    createEmptySession = (dateValue = getTodayValue()) => ({ date: dateValue, blocks: [] }),
    ensureMedicalState = () => {},
    ensurePeriodizationState = () => {},
    formatScheduleDateValue = defaultFormatScheduleDateValue,
    getMedicalRecords = () => [],
    getPeriodizationDay = () => ({}),
    getScheduleEventsForDate = () => [],
    getScheduleMainEvent = () => null,
    getScheduleState = () => ({ events: [] }),
    getSessionPlannerState = () => ({ sessions: {} }),
    isScheduleSessionEvent = () => false,
    parseScheduleDateValue = defaultParseScheduleDateValue,
    scheduleEventTypes = {},
    scheduleMainEventPriority = {},
  } = dependencies;

  function getTodayValue() {
    return formatScheduleDateValue(new Date());
  }

  function formatDateLabel(dateValue, variant = "short") {
    const date = parseScheduleDateValue(dateValue);
    const options =
      variant === "long"
        ? { weekday: "long", day: "numeric", month: "long" }
        : { weekday: "short", day: "numeric", month: "short" };
    return new Intl.DateTimeFormat("en-GB", options).format(date);
  }

  function getRelativeDateLabel(dateValue, todayValue = getTodayValue()) {
    const today = parseScheduleDateValue(todayValue);
    const date = parseScheduleDateValue(dateValue);
    const dayDelta = Math.round((date - today) / 86400000);
    if (dayDelta === 0) {
      return "Today";
    }
    if (dayDelta === 1) {
      return "Tomorrow";
    }
    return formatDateLabel(dateValue);
  }

  function getUpcomingEvents(todayValue = getTodayValue(), types = null) {
    const state = getScheduleState();
    const allowedTypes = Array.isArray(types) ? new Set(types) : null;
    return [...(state.events ?? [])]
      .filter((event) => event.date >= todayValue && (!allowedTypes || allowedTypes.has(event.type)))
      .sort((first, second) => {
        const dateComparison = first.date.localeCompare(second.date);
        if (dateComparison !== 0) {
          return dateComparison;
        }
        const priorityComparison =
          (scheduleMainEventPriority[first.type] ?? 99) - (scheduleMainEventPriority[second.type] ?? 99);
        if (priorityComparison !== 0) {
          return priorityComparison;
        }
        return `${first.time || "99:99"} ${first.title}`.localeCompare(`${second.time || "99:99"} ${second.title}`);
      });
  }

  function getSessionForDate(dateValue) {
    const state = getSessionPlannerState();
    return state.sessions?.[dateValue] ?? createEmptySession(dateValue);
  }

  function getSessionTotalMinutes(session) {
    return (session?.blocks ?? []).reduce((total, block) => total + (Number(block.minutes) || 0), 0);
  }

  function getNextSession(todayValue = getTodayValue()) {
    const state = getSessionPlannerState();
    const nextSessionEvent = getUpcomingEvents(todayValue).find(isScheduleSessionEvent) ?? null;
    if (nextSessionEvent) {
      const session = getSessionForDate(nextSessionEvent.date);
      return {
        date: nextSessionEvent.date,
        session,
        event: nextSessionEvent,
        isMissingPlan: !session.blocks.length,
      };
    }
    const plannedSessions = Object.entries(state.sessions ?? {})
      .map(([dateValue, session]) => cloneSession({ ...session, date: session.date || dateValue }))
      .filter((session) => session.date >= todayValue && session.blocks.length)
      .sort((first, second) => first.date.localeCompare(second.date));
    if (plannedSessions.length) {
      return {
        date: plannedSessions[0].date,
        session: plannedSessions[0],
        event: getScheduleMainEvent(getScheduleEventsForDate(plannedSessions[0].date)) ?? null,
        isMissingPlan: false,
      };
    }
    const fallbackSession = getSessionForDate(todayValue);
    return {
      date: todayValue,
      session: fallbackSession,
      event: null,
      isMissingPlan: !fallbackSession.blocks.length,
    };
  }

  function getLoadTone(load, eventType = "") {
    const cleanLoad = String(load ?? "").toLowerCase();
    if (eventType === "match" || cleanLoad.includes("match")) {
      return "match";
    }
    if (eventType === "off" || cleanLoad.includes("off")) {
      return "off";
    }
    if (cleanLoad.includes("hard") || cleanLoad.includes("high")) {
      return "high";
    }
    if (cleanLoad.includes("moderate") || cleanLoad.includes("medium")) {
      return "moderate";
    }
    if (cleanLoad.includes("low") || eventType === "recovery") {
      return "low";
    }
    return eventType || "neutral";
  }

  function getMicrocycle(todayValue = getTodayValue()) {
    getScheduleState();
    ensurePeriodizationState();
    const today = parseScheduleDateValue(todayValue);
    return Array.from({ length: 7 }, (_, index) => {
      const dateValue = formatScheduleDateValue(addCalendarDays(today, index));
      const events = getScheduleEventsForDate(dateValue);
      const mainEvent = getScheduleMainEvent(events) ?? null;
      const periodizationDay = getPeriodizationDay(dateValue);
      const load = periodizationDay.physicalLoad || scheduleEventTypes[mainEvent?.type]?.label || "";
      return {
        dateValue,
        dayLabel: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(parseScheduleDateValue(dateValue)),
        dateLabel: new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(parseScheduleDateValue(dateValue)),
        event: mainEvent,
        load,
        matchDay: periodizationDay.matchDay,
        tone: getLoadTone(load, mainEvent?.type),
      };
    });
  }

  function getMedicalAlert(todayValue = getTodayValue()) {
    ensureMedicalState();
    const records = getMedicalRecords().filter((record) => record.date === todayValue);
    const limitedRecords = records.filter((record) => !["full", "monitor"].includes(record.status));
    if (limitedRecords.length) {
      return {
        title: "Medical availability",
        detail: `${limitedRecords.length} player${limitedRecords.length === 1 ? "" : "s"} limited today`,
        tone: "medical",
        workspaceId: "medical-team",
      };
    }
    if (!records.length) {
      return {
        title: "Medical availability",
        detail: "Not logged today",
        tone: "monitor",
        workspaceId: "medical-team",
      };
    }
    return {
      title: "Medical availability",
      detail: "Logged for today",
      tone: "good",
      workspaceId: "medical-team",
    };
  }

  function getAlerts(context) {
    const alerts = [];
    if (context.nextSession.isMissingPlan) {
      alerts.push({
        title: "Training needs blocks",
        detail: `${getRelativeDateLabel(context.nextSession.date, context.todayValue)} is scheduled in Schedule`,
        tone: "alert",
        action: "session",
        dateValue: context.nextSession.date,
      });
    }
    if (context.nextMatch) {
      alerts.push({
        title: "Upcoming match prep",
        detail: `${getRelativeDateLabel(context.nextMatch.date, context.todayValue)} · ${context.nextMatch.title}`,
        tone: "match",
        workspaceId: "schedule",
        dateValue: context.nextMatch.date,
      });
    }
    alerts.push(getMedicalAlert(context.todayValue));
    if (context.delegatedOpenTasks.length) {
      alerts.push({
        title: "Staff follow-up",
        detail: `${context.delegatedOpenTasks.length} delegated task${context.delegatedOpenTasks.length === 1 ? "" : "s"} open`,
        tone: "task",
        focus: "task",
      });
    }
    return alerts.slice(0, 4);
  }

  function getHomeContext(currentUser, users, tasks) {
    const todayValue = getTodayValue();
    getScheduleState();
    ensurePeriodizationState();
    const todayEvents = getScheduleEventsForDate(todayValue);
    const todayMainEvent = getScheduleMainEvent(todayEvents) ?? null;
    const todayPeriodization = getPeriodizationDay(todayValue);
    const nextEvent = getUpcomingEvents(todayValue)[0] ?? null;
    const nextMatch = getUpcomingEvents(todayValue, ["match"])[0] ?? null;
    const nextSession = getNextSession(todayValue);
    const microcycle = getMicrocycle(todayValue);
    const taskQueues = selectHomeTaskQueues(tasks, currentUser?.id);
    const context = {
      currentUser,
      users,
      tasks,
      todayValue,
      todayEvents,
      todayMainEvent,
      todayPeriodization,
      nextEvent,
      nextMatch,
      nextSession,
      microcycle,
      personalOpenTasks: taskQueues.personalOpenTasks,
      myOpenTasks: taskQueues.myOpenTasks,
      delegatedOpenTasks: taskQueues.delegatedOpenTasks,
    };
    context.alerts = getAlerts(context);
    return context;
  }

  return {
    formatDateLabel,
    getAlerts,
    getHomeContext,
    getLoadTone,
    getMedicalAlert,
    getMicrocycle,
    getNextSession,
    getRelativeDateLabel,
    getScheduleState,
    getSessionForDate,
    getSessionPlannerState,
    getSessionTotalMinutes,
    getTodayValue,
    getUpcomingEvents,
  };
}
