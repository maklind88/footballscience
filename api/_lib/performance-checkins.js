const { buildSupabaseKeyHeaders, readConfig } = require("./supabase-admin.js");

const wellFields = ["sleepDuration", "sleepQuality", "stress", "fatigue", "soreness"];
const adminRoles = new Set(["admin", "club-admin", "team-admin"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const playerKey = (id) => `player:${id}`;

async function callCheckinRpc(name, fields) {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) throw new Error("Check-ins unavailable.");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: buildSupabaseKeyHeaders(serviceRoleKey, { contentType: "application/json" }),
    body: JSON.stringify(fields),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error("Check-ins unavailable.");
    error.code = data?.code;
    throw error;
  }
  return data;
}

const result = (status, payload) => ({ status, payload });
const fail = (status, reason) => result(status, { ok: false, reason });

function scopeFields({ actor, organizationId, teamId }) {
  return { p_actor_id: actor.id, p_organization_id: organizationId, p_team_id: teamId };
}

function getSquadPlayers(sources) {
  return sources.players.filter(({ id }) => sources.subjectKeys.has(playerKey(id))).map(({ id, name }) => ({
    id, name: typeof name === "string" ? name.slice(0, 160) : "Player",
  }));
}

function projectWellness(rows, playerIds, dates) {
  return rows.filter(({ playerId, date, score }) => playerIds.has(playerId) && dates.has(date)
    && Number.isFinite(score) && score >= 0 && score <= 100).map((row) => ({
    playerId: row.playerId, date: row.date, score: row.score,
    ...Object.fromEntries(wellFields.filter((key) => typeof row[key] === "string").map((key) => [key, row[key].slice(0, 40)])),
  }));
}

function projectRpe(rows, playerIds, activities) {
  return rows.filter(({ playerId, activityId, date }) => playerIds.has(playerId) && activities.get(activityId)?.date === date)
    .map(({ playerId, activityId, date, rating, answeredAt }) => ({ playerId, activityId, date,
      rating: Number.isInteger(rating) && rating >= 0 && rating <= 10 ? rating : null, answeredAt,
    }));
}

function nextDay(date, offset = 1) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

function checkinWeekEnd(week) {
  if (typeof week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return "";
  const date = new Date(`${week}T00:00:00Z`);
  return date.getUTCDay() === 1 && date.toISOString().slice(0, 10) === week ? nextDay(week, 7) : "";
}

const courageClock = new Intl.DateTimeFormat("en", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function currentCourageActivity(activity, now) {
  const fields = courageClock.formatToParts(now);
  const parts = Object.fromEntries(fields.map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return activity.date < today || (activity.date === today
    && (!/^\d{2}:\d{2}$/.test(activity.time ?? "") || activity.time <= `${parts.hour}:${parts.minute}`));
}

async function openRpe(scope, week, sources, body, rpc, now) {
  const activity = sources.activities.find(({ id }) => id === body?.activityId);
  const playerIds = body?.playerIds;
  if (body?.action !== "open-rpe" || !activity || !sources.activityIds.has(activity.id) ||
      !Array.isArray(playerIds) || playerIds.length < 1 || playerIds.length > 100 ||
      new Set(playerIds).size !== playerIds.length ||
      playerIds.some((id) => typeof id !== "string" || !sources.subjectKeys.has(playerKey(id)))) {
    return fail(400, "Choose a saved activity and eligible Squad players.");
  }
  if (!currentCourageActivity(activity, now())) return fail(400, "Wait until the activity has taken place.");
  const opened = await rpc("open_performance_rpe", {
    ...scopeFields(scope), p_activity_id: activity.id, p_activity_date: activity.date, p_player_ids: playerIds,
  });
  if (!Array.isArray(opened)) throw new Error("RPE assignment unavailable.");
  return result(200, { ok: true, week, opened: opened.filter((id) => playerIds.includes(id)) });
}

async function manageAccount(scope, week, sources, body, rpc) {
  if (!adminRoles.has(scope.actor.role)) return fail(403, "A team administrator can manage player accounts.");
  if (typeof body.playerId !== "string" || !sources.subjectKeys.has(playerKey(body.playerId))) {
    return fail(404, "Choose a current Squad player.");
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const revoke = body.action === "unlink-account";
  if (!revoke && (email.length > 254 || !emailPattern.test(email))) return fail(400, "Enter the player's verified account email.");
  const state = await rpc("manage_performance_player_account", {
    ...scopeFields(scope), p_player_id: body.playerId, p_email: revoke ? null : email,
  });
  if (state === "conflict") return fail(409, "That account or player already has a different link.");
  if (state === "unavailable") return fail(404, "No eligible account found. Ask an administrator to check the account and verified email.");
  if (state !== "linked" && state !== "revoked") throw new Error("Account link unavailable.");
  return result(200, { ok: true, week, linked: state === "linked" });
}

async function handleStaffCheckins({ scope, week, sources, body, write, playerId = null }, { rpc = callCheckinRpc, now = () => new Date() } = {}) {
  if (!scope.canEdit) return fail(403, "Individual check-ins require Performance staff access.");
  try {
    if (write) {
      if (["link-account", "unlink-account"].includes(body?.action)) return await manageAccount(scope, week, sources, body, rpc);
      return await openRpe(scope, week, sources, body, rpc, now);
    }
    const players = getSquadPlayers(sources);
    if (playerId !== null && !players.some(({ id }) => id === playerId)) return fail(404, "This Squad player is unavailable.");
    const selected = new Set(players.filter(({ id }) => !playerId || id === playerId).map(({ id }) => id));
    const currentTime = now();
    const activities = new Map(sources.activities.map((activity) => {
      const { id, date, title } = activity;
      return [id, { id, date, title: typeof title === "string" ? title.slice(0, 160) : "Activity",
        canOpen: currentCourageActivity(activity, currentTime) }];
    }));
    const dates = new Set(Array.from({ length: 7 }, (_, index) =>
      nextDay(week, index)));
    const payload = await rpc("read_performance_player_checkins", {
      ...scopeFields(scope), p_week: week, p_player_ids: [...selected], p_activity_ids: [...activities.keys()],
    });
    if (!["wellness", "rpe", "linkedPlayerIds"].every((key) => Array.isArray(payload?.[key]))) throw new Error("Check-ins unavailable.");
    return result(200, { ok: true, week, canManageAccounts: adminRoles.has(scope.actor.role),
      linkedPlayerIds: payload.linkedPlayerIds.filter((id) => selected.has(id)), players, activities: [...activities.values()],
      wellness: projectWellness(payload.wellness, selected, dates), rpe: projectRpe(payload.rpe, selected, activities),
    });
  } catch (error) {
    return error?.code === "42501" ? fail(403, "Your Performance access has changed.")
      : fail(503, "Player check-ins are temporarily unavailable.");
  }
}

module.exports = { callCheckinRpc, checkinWeekEnd, currentCourageActivity, handleStaffCheckins, projectWellness };
