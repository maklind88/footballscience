import { formatScheduleDateValue, parseScheduleDateValue } from "../schedule/events.mjs";

export function shiftDate(date, days) {
  const value = parseScheduleDateValue(date);
  value.setDate(value.getDate() + days);
  return formatScheduleDateValue(value);
}

export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value === shiftDate(value, 0);
}

export function weekDates(date) {
  const weekday = (parseScheduleDateValue(date).getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftDate(date, index - weekday));
}

export function dateLabel(value, options = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", options).format(parseScheduleDateValue(value));
}

function sessionPlan(session) {
  const blocks = (session?.blocks ?? []).map((block) => {
    const minutes = Number(block.minutes);
    return {
      title: block.title || block.label || "Training block",
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      intensity: block.intensity,
      exerciseId: block.libraryExerciseId,
    };
  });
  if (!blocks.length) return null;
  const timed = blocks.filter((block) => block.minutes !== null);
  return {
    blocks,
    minutes: timed.length ? timed.reduce((total, block) => total + block.minutes, 0) : null,
    hasUntimedBlocks: timed.length !== blocks.length,
  };
}

export const availabilityLabels = {
  full: "Full training",
  modified: "Modified",
  unavailable: "Unavailable",
  unknown: "Not set",
};

export function participationStatus(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return "unknown";
  if (value === 100) return "full";
  return value === 0 ? "unavailable" : "modified";
}

export function createPerformanceOverview({ date, events, getPeriodization, sessions, players, getAvailability }) {
  const week = weekDates(date);
  const eventsByDate = new Map(week.map((day) => [day, []]));
  for (const event of events) eventsByDate.get(event.date)?.push(event);
  const days = week.map((day) => {
    const periodization = getPeriodization(day);
    return {
      date: day,
      events: eventsByDate.get(day).sort((first, second) => (first.time || "99:99").localeCompare(second.time || "99:99")),
      plan: sessionPlan(sessions[day]),
      matchDay: periodization.matchDay,
      physicalLoad: periodization.physicalLoad,
      sessionType: periodization.sessionType,
      gpsReport: periodization.gpsReport,
    };
  });
  const availability = getAvailability(date);
  const squad = players.map((player) => ({ ...player, availability: participationStatus(availability.get(player.id)) }));
  const counts = squad.reduce((summary, player) => {
    summary[player.availability] += 1;
    return summary;
  }, { full: 0, modified: 0, unavailable: 0, unknown: 0 });
  const nextMatch = events.reduce((next, event) => {
    if (event.type !== "match" || event.date < date) return next;
    return !next || `${event.date} ${event.time || "99:99"}` < `${next.date} ${next.time || "99:99"}` ? event : next;
  }, null);
  return { days, selected: days.find((day) => day.date === date), squad, counts, nextMatch };
}

export function summarizePlannedRange({ date, range, events, sessions }) {
  const from = range === "season" ? `${date.slice(0, 4)}-01-01` : shiftDate(date, 1 - Number(range));
  const through = range === "season" ? `${date.slice(0, 4)}-12-31` : date;
  const inRange = (day) => day >= from && day <= through;
  const plans = Object.entries(sessions).filter(([day]) => inRange(day))
    .map(([day, session]) => ({ date: day, plan: sessionPlan(session) }))
    .filter(({ plan }) => plan)
    .sort((first, second) => second.date.localeCompare(first.date));
  const scheduled = events.filter((event) => inRange(event.date));
  const timed = plans.filter(({ plan }) => plan.minutes !== null);
  return {
    from, through, plans,
    minutes: timed.length ? timed.reduce((sum, { plan }) => sum + plan.minutes, 0) : null,
    matches: scheduled.filter((event) => event.type === "match").length,
    trainings: scheduled.filter((event) => event.type === "training").length,
  };
}
