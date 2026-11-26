const { getCurrentActor, parseJsonBody, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { isUuid } = require("./_lib/leaderboard-contract.js");
const { callCheckinRpc, checkinWeekEnd, currentCourageActivity, projectWellness } = require("./_lib/performance-checkins.js");
const { readPerformanceSources } = require("./_lib/performance-load-sources.js");

const route = "/api/performance-rpe";
const unavailable = "No active player profile is linked to this account. Contact your team administrator.";

function createRpeResponseHandler({
  readActor = getCurrentActor, rpc = callCheckinRpc, readSources = readPerformanceSources, now = () => new Date(),
} = {}) {
  return async function performanceRpe(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const fail = (status, reason) => sendJson(res, status, { ok: false, reason });

    try {
      const actor = await readActor(req.headers?.authorization || req.headers?.Authorization);
      if (!guardApiRequest(req, res, { route, actor, requireAuth: true, enforcePermission: false }).ok) return;
      if (!isUuid(actor?.id) || actor.role !== "guest" || actor.status !== "active") return fail(403, unavailable);
      const write = req.method === "POST";
      const body = write ? await parseJsonBody(req, { maxBytes: 2048 }) : null;
      const week = write ? body?.week : new URL(req.url, "http://localhost").searchParams.get("week");
      const end = checkinWeekEnd(week);
      if (!end) return fail(400, "Choose the Monday of the week.");
      if (write && (!Number.isInteger(body.rating) || body.rating < 0 || body.rating > 10 ||
          typeof body.activityId !== "string" || !body.activityId.length || body.activityId.length > 180)) {
        return fail(400, "Choose an activity and a rating from 0 to 10.");
      }

      const portal = await rpc("read_performance_player_portal", { p_user_id: actor.id, p_week: week });
      if (!portal) return fail(403, unavailable);
      if (!Array.isArray(portal.rpe) || !Array.isArray(portal.wellness)) throw new Error("Invalid player portal payload.");
      const sources = await readSources(week, end);
      if (!sources.subjectKeys.has(`player:${portal.playerId}`)) return fail(403, unavailable);
      const activities = new Map(sources.activities.map((activity) => [activity.id, activity]));
      const currentTime = now();
      const rpe = portal.rpe.flatMap((entry) => {
        const activity = activities.get(entry.activityId);
        if (activity?.date !== entry.date || !currentCourageActivity(activity, currentTime)) return [];
        const rating = Number.isInteger(entry.rating) && entry.rating >= 0 && entry.rating <= 10 ? entry.rating : null;
        return [{ activityId: activity.id, date: activity.date,
          title: typeof activity.title === "string" ? activity.title.slice(0, 160) : "Activity", rating }];
      });
      if (!write) {
        const dates = new Set(Array.from({ length: 7 }, (_, offset) =>
          new Date(Date.parse(`${week}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)));
        const playerIds = new Set([portal.playerId]);
        const wellness = projectWellness(portal.wellness.map((row) => ({ ...row, playerId: portal.playerId })), playerIds, dates)
          .map(({ playerId, ...row }) => row);
        return sendJson(res, 200, { ok: true, week, rpe, wellness });
      }

      const assignment = rpe.find(({ activityId }) => activityId === body.activityId);
      if (!assignment) return fail(404, "No open RPE check-in for that activity.");
      const state = await rpc("submit_performance_rpe", {
        p_user_id: actor.id, p_activity_id: assignment.activityId, p_activity_date: assignment.date, p_rating: body.rating,
      });
      if (state === "saved") return sendJson(res, 200, { ok: true, rating: body.rating });
      if (state === "answered") return fail(409, "A response has already been submitted.");
      return fail(404, "No open RPE check-in for that activity.");
    } catch (error) {
      if (error?.code === "BODY_TOO_LARGE") return fail(413, "The response is too large.");
      return fail(503, "Player check-ins are temporarily unavailable. Try again.");
    }
  };
}

module.exports = createRpeResponseHandler();
module.exports.createRpeResponseHandler = createRpeResponseHandler;
