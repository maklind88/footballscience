const { getCurrentActor, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { resolvePlatformActorScope } = require("./_lib/platform-identity.js");
const { resolveLeaderboardActorContext } = require("./_lib/leaderboard-scope.js");
const { handleLeaderboardRequest, prepareLeaderboardRequest } = require("./_lib/leaderboard-service.js");

module.exports = async (req, res) => {
  sendCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) return sendJson(res, 401, { ok: false, reason: "You must be signed in." });

  try {
    const preparedRequest = await prepareLeaderboardRequest(req);
    if (!preparedRequest.ok) {
      return sendJson(res, preparedRequest.status || 400, { ok: false, reason: preparedRequest.reason });
    }
    const requestedTeamId = preparedRequest.request.teamId;
    const platformScope = await resolvePlatformActorScope(actor, { requestedTeamId });
    if (!platformScope.ok) {
      return sendJson(res, platformScope.status || 403, { ok: false, reason: platformScope.reason || "Platform scope is unavailable." });
    }
    const context = resolveLeaderboardActorContext(platformScope, requestedTeamId);
    if (!context.ok) return sendJson(res, context.status || 403, { ok: false, reason: context.reason });

    const security = guardApiRequest(req, res, {
      route: "/api/leaderboard",
      moduleId: "leaderboard",
      actor: context.actor,
      enforcePermission: true,
    });
    if (!security.ok) return;
    return await handleLeaderboardRequest(req, res, context, { preparedRequest });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE" || error?.status === 413) {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, error?.status || 500, { ok: false, reason: error?.message || "Leaderboard API failed." });
  }
};
