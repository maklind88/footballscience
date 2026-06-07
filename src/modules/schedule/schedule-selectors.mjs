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
