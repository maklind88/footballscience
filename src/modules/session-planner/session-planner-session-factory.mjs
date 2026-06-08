function defaultFormatDateValue(date = new Date()) {
  if (typeof date === "string") {
    return date;
  }
  return new Date(date).toISOString().slice(0, 10);
}

export function createSessionPlannerSessionFactory(options = {}) {
  const createBlock = typeof options.createBlock === "function" ? options.createBlock : (block = {}) => ({ ...block });
  const defaultExerciseLibrary = Array.isArray(options.defaultExerciseLibrary) ? options.defaultExerciseLibrary : [];
  const formatDateValue = typeof options.formatDateValue === "function" ? options.formatDateValue : defaultFormatDateValue;
  const getActiveExerciseLibrary =
    typeof options.getActiveExerciseLibrary === "function" ? options.getActiveExerciseLibrary : () => [];
  const getPeriodizationOverride =
    typeof options.getPeriodizationOverride === "function" ? options.getPeriodizationOverride : () => ({});
  const getScheduleEventsForDate =
    typeof options.getScheduleEventsForDate === "function" ? options.getScheduleEventsForDate : () => [];
  const getScheduleMainEvent =
    typeof options.getScheduleMainEvent === "function" ? options.getScheduleMainEvent : (events = []) => events[0] ?? null;
  const getScheduledSessionTitle =
    typeof options.getScheduledSessionTitle === "function" ? options.getScheduledSessionTitle : () => "";
  const isScheduleSessionEvent =
    typeof options.isScheduleSessionEvent === "function" ? options.isScheduleSessionEvent : (event) => event?.type === "training";

  function createDefaultSession(dateValue = formatDateValue(new Date())) {
    const possessionBlock = getActiveExerciseLibrary()[0] || defaultExerciseLibrary[0];
    const blocks = [
      createBlock({
        id: "warm-up",
        label: "Warm Up",
        title: "Activation",
        focus: "Prepare the body and the football brain",
        minutes: 12,
        intensity: 2,
        pitchSize: "20m x 20m",
        diagram: "build-up",
      }),
      createBlock({
        id: "block-1",
        label: "Block 1",
        title: "Technical Rhythm",
        focus: "Passing detail and first touch direction",
        minutes: 16,
        intensity: 3,
        pitchSize: "30m x 24m",
        diagram: "build-up",
      }),
      createBlock({
        ...possessionBlock,
        id: "block-2",
        label: "Block 2",
      }),
      createBlock({
        id: "game",
        label: "Game",
        title: "Game Form",
        focus: "Transfer the block into live decisions",
        minutes: 20,
        intensity: 4,
        pitchSize: "BSG",
        diagram: "final-third",
      }),
    ];
    return {
      id: `session-${dateValue}`,
      date: dateValue,
      title: "Training Session",
      theme: "Possession and pressing connection",
      selectedBlockId: "block-2",
      blocks,
    };
  }

  function createEmptySession(dateValue = formatDateValue(new Date())) {
    return {
      id: `session-${dateValue}`,
      date: dateValue,
      title: getScheduledSessionTitle(dateValue) || "Session",
      theme: "",
      selectedBlockId: "",
      blocks: [],
    };
  }

  function isGeneratedDefaultSession(session = {}) {
    const blocks = Array.isArray(session.blocks) ? session.blocks : [];
    return (
      String(session.title || "").trim() === "Training Session" &&
      String(session.theme || "").trim() === "Possession and pressing connection" &&
      blocks.length === 4 &&
      blocks[0]?.id === "warm-up" &&
      blocks[0]?.title === "Activation" &&
      blocks[1]?.id === "block-1" &&
      blocks[1]?.title === "Technical Rhythm" &&
      blocks[2]?.id === "block-2" &&
      blocks[3]?.id === "game" &&
      blocks[3]?.title === "Game Form"
    );
  }

  function isOffDate(dateValue) {
    if (!dateValue) {
      return false;
    }
    const periodizationOverride = getPeriodizationOverride(dateValue);
    const savedDaySchedule = String(periodizationOverride.daySchedule || "").trim().toUpperCase();
    const savedSessionType = String(periodizationOverride.sessionType || "").trim().toUpperCase();
    const scheduleEvent = getScheduleMainEvent(getScheduleEventsForDate(dateValue));
    return savedDaySchedule === "OFF" || savedSessionType === "OFF" || scheduleEvent?.type === "off";
  }

  function createSessionForNewPlan(dateValue = formatDateValue(new Date())) {
    return isOffDate(dateValue) ? createEmptySession(dateValue) : createDefaultSession(dateValue);
  }

  function shouldStripGeneratedDefaultSession(dateValue, session = {}) {
    if (!isGeneratedDefaultSession(session)) {
      return false;
    }
    const scheduleEvents = getScheduleEventsForDate(dateValue);
    const hasSessionEvent = scheduleEvents.some(isScheduleSessionEvent);
    const periodizationOverride = getPeriodizationOverride(dateValue);
    const savedDaySchedule = String(periodizationOverride.daySchedule || "").trim().toLowerCase();
    const savedSessionType = String(periodizationOverride.sessionType || "").trim().toLowerCase();
    const hasSavedTrainingSignal = [savedDaySchedule, savedSessionType].some((value) =>
      value.includes("training") || value.includes("match") || value.includes("recovery")
    );
    return isOffDate(dateValue) || (!hasSessionEvent && !hasSavedTrainingSignal);
  }

  function shouldClearSessionForDate(dateValue, session = {}) {
    return isOffDate(dateValue) || shouldStripGeneratedDefaultSession(dateValue, session);
  }

  return Object.freeze({
    createDefaultSession,
    createEmptySession,
    createSessionForNewPlan,
    getPeriodizationOverride,
    isGeneratedDefaultSession,
    isOffDate,
    shouldClearSessionForDate,
    shouldStripGeneratedDefaultSession,
  });
}
