export function createScheduleRuntimeSelectors(deps = {}) {
  const {
    ensurePeriodizationState = () => {},
    ensureScheduleState = () => ({ events: [] }),
    ensureSessionPlannerState = () => ({ sessions: {} }),
    formatBlockSummary = () => "",
    getDayWarnings = () => [],
    getMainEvent = () => null,
    getPeriodizationDay = () => ({}),
    getPeriodizationDayScheduleLabel = () => "",
    getPeriodizationMatchDayLabel = () => "",
    getScheduleState = () => null,
    getUniqueEvents = (events = []) => events,
    isSessionEvent = () => false,
    parseDateValue = (dateValue) => new Date(dateValue),
  } = deps;

  function getEventsForDate(dateValue) {
    const state = ensureScheduleState();
    return getUniqueEvents((state.events || []).filter((event) => event.date === dateValue))
      .sort((a, b) => `${a.time || "99:99"} ${a.title}`.localeCompare(`${b.time || "99:99"} ${b.title}`));
  }

  function getVisibleEvents(events = []) {
    return getUniqueEvents(events);
  }

  function getSessionEventForDate(dateValue) {
    return getEventsForDate(dateValue).find(isSessionEvent) ?? null;
  }

  function getScheduledSessionTitleForDate(dateValue) {
    return getSessionEventForDate(dateValue)?.title || "";
  }

  function getMonthEvents(year, monthIndex) {
    const state = getScheduleState();
    if (!state) {
      return [];
    }
    return getUniqueEvents(
      (state.events || []).filter((event) => {
        const eventDate = parseDateValue(event.date);
        return eventDate.getFullYear() === year && eventDate.getMonth() === monthIndex;
      })
    );
  }

  function getVisibleMonthEvents(year, monthIndex) {
    return getVisibleEvents(getMonthEvents(year, monthIndex));
  }

  function getSessionSnapshot(dateValue) {
    const state = ensureSessionPlannerState();
    const session = state?.sessions?.[dateValue] || null;
    const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
    return {
      session,
      blocks,
      hasSession: blocks.length > 0,
      minutes: blocks.reduce((total, block) => total + (Number(block.minutes) || 0), 0),
    };
  }

  function getSelectedDayContext(dateValue) {
    ensurePeriodizationState();
    const periodizationDay = getPeriodizationDay(dateValue);
    const phaseLabels = [
      ...(Array.isArray(periodizationDay.matchPhases) ? periodizationDay.matchPhases : []),
      ...(Array.isArray(periodizationDay.subPhases) ? periodizationDay.subPhases : []),
    ].slice(0, 3);
    return {
      sessionSnapshot: getSessionSnapshot(dateValue),
      periodizationLabel: getPeriodizationDayScheduleLabel(periodizationDay),
      matchDayLabel: getPeriodizationMatchDayLabel(periodizationDay.matchDay),
      phaseSummary: phaseLabels.join(" / "),
    };
  }

  function getScheduleDayWarnings(events, periodizationDay, sessionSnapshot) {
    return getDayWarnings(events, periodizationDay, sessionSnapshot, {
      isSessionEvent,
      getPeriodizationDayScheduleLabel,
      getPeriodizationMatchDayLabel,
    });
  }

  return {
    formatBlockSummary,
    getEventsForDate,
    getMainEvent,
    getMonthEvents,
    getScheduleDayWarnings,
    getScheduledSessionTitleForDate,
    getSelectedDayContext,
    getSessionEventForDate,
    getSessionSnapshot,
    getVisibleEvents,
    getVisibleMonthEvents,
    isSessionEvent,
  };
}
