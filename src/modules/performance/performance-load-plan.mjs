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
  return Number.isSafeInteger(normalized) && normalized <= 1000000 ? normalized : undefined;
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

  const revisions = new Map();
  const recordKey = (kind, subject, activity) => JSON.stringify([kind, subject, activity]);

  function prepareRecord(kind, subjectKey, activityId, fields, prefix, current) {
    const { values: targets, invalid } = readLoadTargets(fields, prefix);
    const revision = revisions.get(recordKey(kind, subjectKey, activityId)) ?? 0;
    const changed = loadMetrics.some(({ key }) => targets[key] !== current?.[key]);
    return { invalid, record: changed ? { kind, subjectKey, activityId, revision, targets } : null };
  }

  function preparePlayerWeek(id, activities, fields) {
    const changes = activities.map((event) => prepareRecord(
      "plan", `player:${id}`, event.id, fields, activityInputPrefix(event), plans.get(id)?.get(event.id)
    ));
    return { invalid: changes.flatMap(({ invalid }) => invalid), records: changes.flatMap(({ record }) => record ? [record] : []) };
  }

  function prepareReference(scope, fields) {
    const { invalid, record } = prepareRecord("baseline", scope, "", fields, "", references.get(scope));
    return { invalid, records: record ? [record] : [] };
  }

  function applyRecords(records) {
    for (const { kind, subjectKey, activityId, revision, targets } of records) {
      revisions.set(recordKey(kind, subjectKey, activityId), revision);
      if (kind === "baseline") {
        references.set(subjectKey, targets);
      } else {
        const id = subjectKey.slice("player:".length);
        const player = plans.get(id) ?? new Map();
        player.set(activityId, targets);
        plans.set(id, player);
      }
    }
  }

  function saveDraft({ invalid, records }) {
    if (!invalid.length) applyRecords(records);
    return invalid;
  }

  applyRecords(seed.records ?? []);
  return {
    getTargets: (playerId, activityId) => plans.get(playerId)?.get(activityId),
    getExplicitReference: (scope) => references.get(scope),
    getReference, preparePlayerWeek, prepareReference, applyRecords,
    savePlayerWeek: (...args) => saveDraft(preparePlayerWeek(...args)),
    saveReference: (...args) => saveDraft(prepareReference(...args)),
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
