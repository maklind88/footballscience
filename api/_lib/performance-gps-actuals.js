const { buildSupabaseKeyHeaders, readConfig } = require("./supabase-admin.js");

const planMetrics = ["distance", "hsr", "sprint"];
const sessionMetricLimits = {
  distance: 1000000, hml: 1000000, hsr: 1000000, sprint: 1000000,
  maxSpeed: 100, accelerations: 1000000, decelerations: 1000000,
};
const archiveMetricLimits = { ...sessionMetricLimits, gpsMinutes: 1440 };
const readTimeoutMs = 1500;

function projectMetrics(values, limits) {
  return Object.fromEntries(Object.entries(limits).flatMap(([key, max]) => {
    const value = values?.[key];
    return Number.isFinite(value) && value >= 0 && value <= max ? [[key, value]] : [];
  }));
}

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
    const metrics = projectMetrics(row.metrics, sessionMetricLimits);
    const comparable = planMetrics.filter((metric) =>
      Object.hasOwn(metrics, metric) && Array.isArray(row.comparable) && row.comparable.includes(metric)
    );
    const duration = row.sessionDurationMinutes;
    const timing = Number.isFinite(duration) && duration >= 0 && duration <= 1440
      ? { sessionDurationMinutes: duration } : {};
    seen.set(key, Object.keys(metrics).length ? { playerId, activityId, metrics, comparable, ...timing } : null);
  }
  return [...seen.values()].filter(Boolean);
}

async function readPublishedGpsWeek({ actorId, organizationId, teamId, week, history = false }, { signal }) {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) throw new Error("GPS source unavailable.");
  const response = await fetch(`${url}/rest/v1/rpc/read_performance_gps_week`, {
    method: "POST",
    headers: buildSupabaseKeyHeaders(serviceRoleKey, { contentType: "application/json" }),
    body: JSON.stringify({ p_actor_id: actorId, p_organization_id: organizationId, p_team_id: teamId, p_week: week, p_history: history }),
    signal,
  });
  if (!response.ok) throw new Error("GPS source unavailable.");
  const rows = await response.json();
  return rows === null ? { connected: false } : { rows };
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
    const query = { actorId: scope.actor.id, organizationId: scope.organizationId, teamId: scope.teamId, week, playerIds, activityIds };
    const result = await Promise.race([reader(query, { signal: controller.signal }), timeout]);
    if (result?.connected === false) return { status: "not-connected", rows: [] };
    if (!Array.isArray(result?.rows)) return { status: "unavailable", rows: [] };
    return { status: "ready", sample: result.sample === true, rows: projectActuals(result.rows, playerIds, activityIds) };
  } catch {
    return { status: "unavailable", rows: [] };
  } finally {
    clearTimeout(timer);
  }
}

const archiveLinks = new Set(["linked", "unmatched-player", "unmatched-activity", "ambiguous-activity", "review"]);

async function readGpsHistory(reader, scope, week, end) {
  if (typeof reader !== "function") return { status: "not-connected", rows: [] };
  const query = { actorId: scope.actor.id, organizationId: scope.organizationId, teamId: scope.teamId, week, history: true };
  const result = await reader(query, { signal: AbortSignal.timeout(readTimeoutMs) });
  if (result?.connected === false) return { status: "not-connected", rows: [] };
  if (!Array.isArray(result?.rows)) throw new Error("GPS history unavailable.");
  const rows = result.rows.flatMap((row) => {
    if (typeof row?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date < week || row.date >= end ||
        typeof row.player !== "string" || !row.player.trim() || !["training", "match"].includes(row.type)) return [];
    const metrics = projectMetrics(row.metrics, archiveMetricLimits);
    return [{
      date: row.date, player: row.player.slice(0, 160), type: row.type, metrics,
      opponent: typeof row.opponent === "string" ? row.opponent.slice(0, 160) : "",
      link: archiveLinks.has(row.link) ? row.link : "review",
    }];
  });
  return { status: "ready", rows };
}

module.exports = { readGpsHistory, readPublishedGpsWeek, readWeekGpsActuals };
