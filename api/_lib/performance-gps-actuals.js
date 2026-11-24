const metricKeys = ["distance", "hsr", "sprint"];
const readTimeoutMs = 1500;

function projectActuals(rows, playerIds, activityIds) {
  const players = new Set(playerIds);
  const activities = new Set(activityIds);
  const seen = new Map();
  for (const row of rows) {
    if (!players.has(row?.playerId) || !activities.has(row?.activityId)) continue;
    const { playerId, activityId } = row;
    const key = JSON.stringify([playerId, activityId]);
    // Multiple summaries for the same player and activity require source review.
    if (seen.has(key)) {
      seen.set(key, null);
      continue;
    }
    const metrics = Object.fromEntries(metricKeys.flatMap((metric) => {
      const value = row.metrics?.[metric];
      return Number.isFinite(value) && value >= 0 && value <= 1000000 ? [[metric, value]] : [];
    }));
    const comparable = metricKeys.filter((metric) =>
      Object.hasOwn(metrics, metric) && Array.isArray(row.comparable) && row.comparable.includes(metric)
    );
    const duration = row.sessionDurationMinutes;
    const timing = Number.isFinite(duration) && duration >= 0 && duration <= 1440
      ? { sessionDurationMinutes: duration } : {};
    seen.set(key, Object.keys(metrics).length ? { playerId, activityId, metrics, comparable, ...timing } : null);
  }
  return [...seen.values()].filter(Boolean);
}

async function readWeekGpsActuals(reader, scope, week, sources) {
  if (typeof reader !== "function") return { status: "not-connected", rows: [] };
  const playerIds = [...sources.subjectKeys]
    .filter((key) => key.startsWith("player:"))
    .map((key) => key.slice("player:".length));
  const activityIds = [...sources.activityIds];
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, readTimeoutMs);
    });
    // The upstream reader provides one published, canonical metre summary per player and activity.
    const query = { organizationId: scope.organizationId, teamId: scope.teamId, week, playerIds, activityIds };
    const result = await Promise.race([reader(query, { signal: controller.signal }), timeout]);
    if (!Array.isArray(result?.rows)) return { status: "unavailable", rows: [] };
    return { status: "ready", sample: result.sample === true, rows: projectActuals(result.rows, playerIds, activityIds) };
  } catch {
    return { status: "unavailable", rows: [] };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { readWeekGpsActuals };
