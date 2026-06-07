import { scheduleMainEventPriority } from "./schedule-state.mjs";

export function formatMonthYearLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatScheduleMonthName(date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
  }).format(date);
}

export function getScheduleMainEvent(events = []) {
  return [...events].sort((a, b) => {
    const priorityA = scheduleMainEventPriority[a.type] ?? 99;
    const priorityB = scheduleMainEventPriority[b.type] ?? 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return `${a.time || "99:99"} ${a.title}`.localeCompare(`${b.time || "99:99"} ${b.title}`);
  })[0];
}

export function isScheduleSessionEvent(event = {}) {
  const title = String(event?.title ?? "").toLowerCase();
  return event?.type === "training" || title.includes("training");
}

export function formatScheduleBlockSummary(blockCount, minutes = 0) {
  const blockLabel = `${blockCount} block${blockCount === 1 ? "" : "s"}`;
  return minutes ? `${blockLabel} / ${minutes} min` : blockLabel;
}

export function getScheduleDayWarnings(events = [], periodizationDay = {}, sessionSnapshot = {}, options = {}) {
  const warnings = [];
  const isSessionEvent = typeof options.isSessionEvent === "function" ? options.isSessionEvent : isScheduleSessionEvent;
  const getPeriodizationDayScheduleLabel =
    typeof options.getPeriodizationDayScheduleLabel === "function" ? options.getPeriodizationDayScheduleLabel : () => "";
  const getPeriodizationMatchDayLabel =
    typeof options.getPeriodizationMatchDayLabel === "function" ? options.getPeriodizationMatchDayLabel : () => "";
  const hasTraining = events.some((event) => isSessionEvent(event));
  const hasMatch = events.some((event) => event.type === "match");
  const hasOff = events.some((event) => event.type === "off");
  const hasActivePlan = events.some((event) => event.type !== "off");
  const periodizationLabel = getPeriodizationDayScheduleLabel(periodizationDay);
  const periodizationText = String(periodizationLabel || "").toLowerCase();
  const matchDayLabel = getPeriodizationMatchDayLabel(periodizationDay.matchDay);
  if (hasTraining && !sessionSnapshot.hasSession) {
    warnings.push("Training without session plan");
  }
  if (sessionSnapshot.hasSession && !hasTraining) {
    warnings.push("Session without schedule training");
  }
  if (periodizationText === "off" && hasActivePlan) {
    warnings.push("Periodization says OFF");
  }
  if (hasOff && hasActivePlan) {
    warnings.push("OFF mixed with active plan");
  }
  if (hasMatch && !matchDayLabel) {
    warnings.push("Match missing match day tag");
  }
  if (events.length && periodizationText.includes("training") && !hasTraining) {
    warnings.push("Periodization expects training");
  }
  if (events.length && periodizationText.includes("match") && !hasMatch) {
    warnings.push("Periodization expects match");
  }
  const timedEvents = events.filter((event) => event.time);
  const duplicateTime = timedEvents.find(
    (event, index) => timedEvents.findIndex((candidate) => candidate.time === event.time) !== index
  );
  if (duplicateTime) {
    warnings.push(`Time conflict at ${duplicateTime.time}`);
  }
  return warnings;
}
