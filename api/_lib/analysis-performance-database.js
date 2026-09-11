const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");
const { fail, STAFF_ROLES } = require("./analysis-performance-contract.js");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function coversTeam(membership, team) {
  return membership.status === "active" && membership.organizationId === team.organizationId && (
    membership.scope === "organization" || (membership.scope === "club" && membership.clubId && membership.clubId === team.clubId)
    || (membership.scope === "team" && membership.teamId === team.id));
}
function resolvePerformanceContext(platform, requestedTeamId = "") {
  if (!platform?.ok || !UUID.test(platform.actor?.id || "") || platform.actor.status !== "active") fail("Active platform identity is required.", 403);
  const memberships = platform.scope?.memberships || [];
  const teams = (platform.scope?.teams || []).filter((team) => team.status === "active" && UUID.test(team.id) && UUID.test(team.organizationId)
    && memberships.some((m) => coversTeam(m, team) && STAFF_ROLES.includes(m.role)));
  const team = requestedTeamId ? teams.find((row) => row.id === requestedTeamId) : teams.length === 1 ? teams[0] : null;
  if (!team) fail(requestedTeamId ? "Team Performance access denied for this team." : "Select an authorized Platform team for Team Performance.", requestedTeamId ? 403 : 409);
  const role = STAFF_ROLES.find((role) => memberships.some((m) => m.role === role && coversTeam(m, team)));
  return { actor: { id: platform.actor.id, role }, organizationId: team.organizationId, teamId: team.id };
}

async function performanceRpc(name, context, args = {}, options = {}) {
  const config = options.config || readConfig();
  if (!config.url || !config.serviceRoleKey) fail("Team Performance database is not configured.", 503);
  let response;
  try {
    response = await (options.fetchImpl || fetch)(`${config.url}/rest/v1/rpc/analysis_performance_${name}`, {
      method: "POST", signal: AbortSignal.timeout(25000),
      headers: buildSupabaseKeyHeaders(config.serviceRoleKey, { contentType: "application/json" }),
      body: JSON.stringify({ p_actor_id: context.actor.id, p_organization_id: context.organizationId, p_team_id: context.teamId, ...args }),
    });
  } catch { fail("Team Performance database is unavailable.", 503); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (["40001", "23505"].includes(payload.code)) fail("Statistics changed. Preview the import again.", 409);
    if (payload.code === "42501") fail("Team Performance access denied.", 403);
    if (payload.code === "P0002") fail("Statistics version not found.", 404);
    if (payload.code === "22023") fail("Statistics validation failed. Saved data has not changed.", 422);
    fail("Team Performance database is not ready. Saved data has not changed.", 503);
  }
  return payload;
}

module.exports = { UUID, resolvePerformanceContext, performanceRpc };
