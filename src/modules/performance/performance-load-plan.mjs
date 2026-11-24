export const loadMetrics = Object.freeze([
  { key: "distance", name: "Total distance", short: "Distance", unit: "km", scale: 1000 },
  { key: "hsr", name: "High-speed running", short: "HSR", unit: "m", scale: 1 },
  { key: "sprint", name: "Sprint distance", short: "Sprint", unit: "m", scale: 1 },
]);

const planningEventTypes = new Set(["training", "recovery", "match"]);
const numeric = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 });
const dayMilliseconds = 86_400_000;

export function formatLoad(value, metric) {
  return value == null ? "—" : numeric.format(value / metric.scale);
}

export function parseLoadInput(input, metric) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  const pattern = metric.scale === 1000 ? /^\d+(?:[.,]\d{1,3})?$/ : /^\d+$/;
  if (!pattern.test(text)) return undefined;
  const normalized = Math.round(Number(text.replace(",", ".")) * metric.scale);
  return Number.isSafeInteger(normalized) ? normalized : undefined;
}

export function planningRole(player) {
  return player.position || player.roleGroup || "";
}

export function activityInputPrefix(event) {
  return `activity-${encodeURIComponent(event.id)}-`;
}

export function readLoadTargets(fields, prefix = "") {
  const values = {};
  const invalid = [];
  for (const metric of loadMetrics) {
    const field = prefix + metric.key;
    const value = parseLoadInput(fields.get(field), metric);
    if (value === undefined) invalid.push(field);
    if (value != null) values[metric.key] = value;
  }
  return { values, invalid };
}

export function createLoadPlanDraft(seed = {}) {
  const plans = new Map(Object.entries(seed.plans ?? {}).map(([id, entries]) => [id, new Map(Object.entries(entries))]));
  const references = new Map(Object.entries(seed.references ?? {}));

  function getReference(player) {
    const role = planningRole(player);
    const levels = [
      [`player:${player.id}`, "Player"],
      [role && `role:${role}`, "Position"],
      ["team", "Team"],
    ];
    return Object.fromEntries(loadMetrics.map(({ key }) => {
      const level = levels.find(([scope]) => references.get(scope)?.[key] != null);
      return [key, level ? { value: references.get(level[0])[key], source: level[1] } : null];
    }));
  }

  function savePlayerWeek(id, activities, fields) {
    const targets = activities.map((event) => readLoadTargets(fields, activityInputPrefix(event)));
    const invalid = targets.flatMap((target) => target.invalid);
    if (invalid.length) return invalid;
    const week = plans.get(id) ?? new Map();
    activities.forEach((event, index) => {
      const { values } = targets[index];
      if (Object.keys(values).length) week.set(event.id, values);
      else week.delete(event.id);
    });
    plans.set(id, week);
    return invalid;
  }

  function saveReference(scope, fields) {
    const { values, invalid } = readLoadTargets(fields);
    if (!invalid.length) references.set(scope, values);
    return invalid;
  }

  return {
    getTargets: (playerId, activityId) => plans.get(playerId)?.get(activityId),
    getExplicitReference: (scope) => references.get(scope),
    getReference,
    savePlayerWeek,
    saveReference,
  };
}

function matchContext(date, matches, fallback) {
  if (matches.includes(date)) return "MD";
  const previous = matches.filter((day) => day < date).at(-1);
  const next = matches.find((day) => day > date);
  const offsets = [[previous, "MD+"], [next, "MD−"]].flatMap(([day, label]) => {
    if (!day) return [];
    const distance = Math.round(Math.abs(Date.parse(day) - Date.parse(date)) / dayMilliseconds);
    return distance <= 7 ? [label + distance] : [];
  });
  return offsets.join(" · ") || fallback || "";
}

export function createLoadPlanWeek(overview, events) {
  const matches = [...new Set(events.filter(({ type }) => type === "match").map(({ date }) => date))].sort();
  return overview.days.map((day) => {
    const activities = day.events.filter(({ id, type }) => id && planningEventTypes.has(type));
    const trainingCount = activities.filter(({ type }) => type !== "match").length;
    return {
      ...day,
      matchContext: matchContext(day.date, matches, day.matchDay),
      activities: activities.map((event) => ({
        ...event,
        physicalLoad: day.physicalLoad,
        minutes: event.type !== "match" && trainingCount === 1 ? day.plan?.minutes ?? null : null,
      })),
    };
  });
}

export function summarizeLoadTargets(targets) {
  return Object.fromEntries(loadMetrics.map(({ key }) => {
    const known = targets.map((target) => target?.[key]).filter((value) => value != null);
    return [key, { total: known.length ? known.reduce((sum, value) => sum + value, 0) : null, count: known.length }];
  }));
}

export function summarizePlayerWeek(draft, playerId, activities) {
  const summarize = (isMatch) => summarizeLoadTargets(activities
    .filter(({ type }) => (type === "match") === isMatch)
    .map(({ id }) => draft.getTargets(playerId, id)));
  return { training: summarize(false), matches: summarize(true) };
}
