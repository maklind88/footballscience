const { resolvePlatformActorScope } = require("./platform-identity.js");
const { resolvePerformanceTeam } = require("./performance-load-sources.js");
const { callCheckinRpc } = require("./performance-checkins.js");

const publisherRoles = new Set(["admin", "club-admin", "team-admin", "coach"]);
const result = (status, payload) => ({ status, payload });
const fail = (status, reason) => result(status, { ok: false, reason });
const unavailable = "My Development publishing is temporarily unavailable.";
const boundedText = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : null;

async function handleIdpPlayerPublication({ actor, playerId, body = {} }, {
  readScope = resolvePlatformActorScope, resolveTeam = resolvePerformanceTeam, rpc = callCheckinRpc,
} = {}) {
  if (!publisherRoles.has(actor?.role)) return fail(403, "Coaching access is required to publish to players.");
  if (!boundedText(playerId, 193)) return fail(400, "Choose a player.");
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Invalid publication.");
  const action = body.operation ?? "read";
  const revision = body.revision ?? 0;
  const focus = boundedText(body.focus, 180);
  const nextStep = boundedText(body.nextStep, 800);
  const feedback = boundedText(body.feedback ?? "", 1200);
  if (!["read", "publish", "withdraw"].includes(action) || !Number.isInteger(revision)
    || revision < 0 || revision >= 2147483647 || (action === "publish" && (!focus || !nextStep || feedback === null))) {
    return fail(400, "Enter a focus and a next step within the field limits.");
  }
  try {
    const platform = await readScope(actor);
    if (!platform.ok) return fail(platform.status >= 500 ? 503 : 403, "Active team access is required.");
    const scope = await resolveTeam(platform, "read");
    if (!scope) return fail(403, "Player publishing is unavailable for this team.");
    const payload = await rpc("manage_idp_player_publication", {
      p_actor_id: actor.id, p_organization_id: scope.organizationId, p_team_id: scope.teamId,
      p_player_id: playerId.trim(), p_action: action, p_focus: focus, p_next_step: nextStep,
      p_feedback: feedback, p_revision: revision,
    });
    if (payload?.state === "conflict") return fail(409, "The shared focus changed. Reload it before saving.");
    if (payload?.state === "unlinked") return fail(404, "Ask a team administrator to link this player's account.");
    if (payload?.state === "empty") return result(200, { ok: true, publication: null });
    if (payload?.state !== "ready") return fail(503, unavailable);
    return result(200, { ok: true, publication: payload });
  } catch (error) {
    if (error?.code === "42501") return fail(403, "Coaching access is required to publish to players.");
    return fail(503, unavailable);
  }
}

module.exports = { handleIdpPlayerPublication };
