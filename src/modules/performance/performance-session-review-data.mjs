import { loadMetrics, previewTeamTargets, summarizeSquadWeek } from "./performance-load-plan.mjs";

function startsBefore(first, second) {
  if (first.date !== second.date) return first.date < second.date;
  return Boolean(first.time && second.time && first.time < second.time);
}

const activityOrder = (first, second) =>
  first.date.localeCompare(second.date) || (first.time || "99:99").localeCompare(second.time || "99:99");

export function selectReviewSession(days, events, selectedDate, requestedDate, requestedActivity, confirmedActivities) {
  const activities = days.flatMap((day) => day.activities);
  const defaultSession = activities.find((item) => item.date === selectedDate && item.type !== "match") ??
    activities.find((item) => item.date === selectedDate) ?? activities.find((item) => item.date > selectedDate) ??
    activities.at(-1);
  const day = days.find(({ date }) => date === requestedDate) ??
    days.find(({ date }) => date === (defaultSession?.date ?? selectedDate)) ?? days[0];
  const activity = day.activities.find(({ id }) => id === requestedActivity) ??
    day.activities.find(({ id }) => id === defaultSession?.id) ?? day.activities[0];
  if (!activity) return { day, activity };

  const matches = events.filter((item) => item.type === "match");
  const match = activity.type === "match" ? activity : matches
    .filter((item) => startsBefore(item, activity))
    .sort(activityOrder).at(-1);
  const followingTraining = activity.type === "match" ? events
    .filter((item) => {
      if (!item.id || !["training", "recovery"].includes(item.type) || !startsBefore(activity, item)) return false;
      const inWeek = days.some(({ date }) => date === item.date);
      return !inWeek || !confirmedActivities || confirmedActivities.has(item.id);
    }).sort(activityOrder)[0] : null;
  return { day, activity, match, followingTraining };
}

export function createSessionComparison(players, activityId, metric, getTargets, gps) {
  let planTotal = 0;
  let gpsTotal = 0;
  let count = 0;
  const rows = players.map((player) => {
    const plan = getTargets(player.id, activityId)?.[metric.key];
    const record = gps.getActual(player.id, activityId);
    const actual = record?.metrics?.[metric.key];
    const defined = Number.isFinite(actual);
    const comparable = defined && record.comparable?.includes(metric.key);
    const planned = Number.isFinite(plan);
    if (planned && comparable) {
      count += 1;
      planTotal += plan;
      gpsTotal += actual;
    }
    let status = "";
    if (!defined) status = record ? "Metric missing" : "No linked GPS";
    else if (!comparable) status = metric.key === "distance" ? "Definition unconfirmed" : "Zones unconfirmed";
    else if (!planned) status = "No target";
    return { player, plan, actual, comparable, status };
  });

  return {
    rows,
    count,
    plan: count ? planTotal / count : null,
    actual: count ? gpsTotal / count : null,
  };
}

export function trainingPlanAverage(context, metric) {
  const { days, players, draft, canEdit, readTeamInput } = context;
  const getTargets = canEdit
    ? (playerId, activityId) => previewTeamTargets(draft, playerId, activityId, readTeamInput)
    : draft.getTargets;
  const training = days.flatMap(({ activities }) => activities).filter(({ type }) => type !== "match");
  return summarizeSquadWeek(players, training, getTargets).training[metric.key];
}

export function pairedSquadWeeks(players, activities, getTargets, gps) {
  const paired = new Map();
  for (const { id: activityId } of activities) {
    for (const { id: playerId } of players) {
      const targets = getTargets(playerId, activityId);
      const record = gps.getActual(playerId, activityId);
      if (!targets || !record) continue;
      const values = { plan: {}, actual: {} };
      for (const { key } of loadMetrics) {
        if (!Number.isFinite(targets[key]) || !Number.isFinite(record.metrics[key]) || !record.comparable?.includes(key)) continue;
        values.plan[key] = targets[key];
        values.actual[key] = record.metrics[key];
      }
      paired.set(JSON.stringify([playerId, activityId]), values);
    }
  }
  return Object.fromEntries(["plan", "actual"].map((kind) => [
    kind, summarizeSquadWeek(players, activities, (playerId, activityId) =>
      paired.get(JSON.stringify([playerId, activityId]))?.[kind]),
  ]));
}
