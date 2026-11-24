const { buildSupabaseKeyHeaders, getCurrentActor, parseJsonBody, readConfig, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { enforceApiPermission, guardApiRequest } = require("./_lib/platform-security.js");
const { resolvePlatformActorScope } = require("./_lib/platform-identity.js");
const { resolvePerformanceTeam, readPerformanceSources } = require("./_lib/performance-load-sources.js");

const route = "/api/performance-load-plan";
const metrics = ["distance", "hsr", "sprint"];
const unavailable = "Saved load plans are temporarily unavailable. Try again.";

function weekEnd(week) {
  if (typeof week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return "";
  const date = new Date(`${week}T00:00:00Z`);
  if (date.getUTCDay() !== 1 || date.toISOString().slice(0, 10) !== week) return "";
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

function validateRecords(records, sources) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 30) return false;
  const seen = new Set();
  return records.every((record) => {
    if (!record || typeof record !== "object") return false;
    const { kind, subjectKey, activityId, revision, targets } = record;
    if (kind !== records[0].kind || subjectKey !== records[0].subjectKey || !sources.subjectKeys.has(subjectKey)) return false;
    const validKey = kind === "baseline" ? activityId === "" :
      kind === "plan" && subjectKey.startsWith("player:") && sources.activityIds.has(activityId);
    if (!validKey || seen.has(activityId) || !Number.isInteger(revision) || revision < 0 || revision >= 2147483647) return false;
    seen.add(activityId);
    return targets && typeof targets === "object" && !Array.isArray(targets) &&
      Object.entries(targets).every(([key, value]) =>
        metrics.includes(key) && Number.isInteger(value) && value >= 0 && value <= 1000000
      );
  });
}

async function callPerformanceRpc(operation, scope, fields) {
  const config = readConfig();
  if (!config?.url || !config.serviceRoleKey) throw new Error(unavailable);
  const response = await fetch(`${config.url}/rest/v1/rpc/${operation}_performance_load_records`, {
    method: "POST",
    headers: buildSupabaseKeyHeaders(config.serviceRoleKey, { contentType: "application/json" }),
    body: JSON.stringify({
      p_actor_id: scope.actor.id,
      p_organization_id: scope.organizationId,
      p_team_id: scope.teamId,
      ...fields,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.text();
  return { ok: response.ok, data: data ? JSON.parse(data) : null };
}

function rpcRecord({ kind, subjectKey, activityId, revision, targets }) {
  return {
    kind, subject_key: subjectKey, activity_id: activityId, base_revision: revision,
    distance_m: targets.distance, hsr_m: targets.hsr, sprint_m: targets.sprint,
  };
}

function createPerformanceLoadPlanHandler({
  readActor = getCurrentActor, readScope = resolvePlatformActorScope, resolveTeam = resolvePerformanceTeam,
  readSources = readPerformanceSources, rpc = callPerformanceRpc,
} = {}) {
  return async function performanceLoadPlan(req, res) {
    sendCorsHeaders(res);
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "OPTIONS") return res.end();
    const reply = (status, payload) => sendJson(res, status, payload);
    const fail = (status, reason) => reply(status, { ok: false, reason });

    try {
      const actor = await readActor(req.headers?.authorization || req.headers?.Authorization);
      const options = { route, actor, requireAuth: true };
      if (!guardApiRequest(req, res, { ...options, enforcePermission: false }).ok) return;
      const write = req.method === "POST";
      const body = write ? await parseJsonBody(req, { maxBytes: 24576 }) : null;
      const week = write ? body?.week : new URL(req.url, "http://localhost").searchParams.get("week");
      const end = weekEnd(week);
      if (!end) return fail(400, "Choose the Monday of the plan week.");

      const platform = await readScope(actor);
      if (!platform.ok) return fail(platform.status >= 500 ? 503 : 403, platform.status >= 500 ? unavailable : "Active team membership required.");
      const scope = await resolveTeam(platform, write ? "write" : "read");
      if (!scope) return fail(403, "Performance planning is unavailable for this team.");
      if (!enforceApiPermission(req, res, { ...options, actor: scope.actor }).ok) return;

      const sources = await readSources(week, end);
      if (write && !validateRecords(body.records, sources)) {
        return fail(400, "Check the targets and make sure the player and activities are saved in Squad and Schedule.");
      }
      const result = write ? await rpc("save", scope, { p_records: body.records.map(rpcRecord) }) :
        await rpc("read", scope, { p_subject_keys: [...sources.subjectKeys], p_activity_ids: [...sources.activityIds] });
      if (!result.ok) {
        if (["40001", "23505"].includes(result.data?.code)) return fail(409, "The plan has changed. Reload saved values before editing again.");
        if (result.data?.code === "42501") return fail(403, "Your access to the plan has changed.");
        return fail(503, unavailable);
      }
      const records = write ? body.records.map(({ kind, subjectKey, activityId, revision, targets }) =>
        ({ kind, subjectKey, activityId, revision: revision + 1, targets })
      ) : result.data;
      if (!Array.isArray(records)) return fail(503, unavailable);
      return reply(200, { ok: true, week, canEdit: scope.canEdit, records });
    } catch (error) {
      if (error?.code === "BODY_TOO_LARGE") return fail(413, "The plan is too large.");
      return fail(503, unavailable);
    }
  };
}

module.exports = createPerformanceLoadPlanHandler();
module.exports.createPerformanceLoadPlanHandler = createPerformanceLoadPlanHandler;
