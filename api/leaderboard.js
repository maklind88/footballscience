const { getCurrentActor, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { enforceApiPermission, guardApiRequest } = require("./_lib/platform-security.js");
const { resolvePlatformActorScope } = require("./_lib/platform-identity.js");
const { resolveLeaderboardActorContext } = require("./_lib/leaderboard-scope.js");
const { handleLeaderboardRequest, prepareLeaderboardRequest } = require("./_lib/leaderboard-service.js");

function createLeaderboardHandler(dependencies = {}) {
  const readCurrentActor = dependencies.getCurrentActor || getCurrentActor;
  const applyCorsHeaders = dependencies.sendCorsHeaders || sendCorsHeaders;
  const replyJson = dependencies.sendJson || sendJson;
  const applyRateLimit = dependencies.guardApiRequest || guardApiRequest;
  const applyPermission = dependencies.enforceApiPermission || enforceApiPermission;
  const prepareRequest = dependencies.prepareLeaderboardRequest || prepareLeaderboardRequest;
  const resolveActorScope = dependencies.resolvePlatformActorScope || resolvePlatformActorScope;
  const resolveActorContext = dependencies.resolveLeaderboardActorContext || resolveLeaderboardActorContext;
  const handleRequest = dependencies.handleLeaderboardRequest || handleLeaderboardRequest;

  return async (req, res) => {
    applyCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.end();
      return;
    }

    const actor = await readCurrentActor(req.headers?.authorization || req.headers?.Authorization);
    if (!actor) return replyJson(res, 401, { ok: false, reason: "You must be signed in." });

    const rateLimit = applyRateLimit(req, res, {
      route: "/api/leaderboard",
      moduleId: "leaderboard",
      actor,
      enforcePermission: false,
      requireAuth: true,
    });
    if (!rateLimit.ok) return;

    try {
      const preparedRequest = await prepareRequest(req);
      if (!preparedRequest.ok) {
        return replyJson(res, preparedRequest.status || 400, { ok: false, reason: preparedRequest.reason });
      }
      const requestedTeamId = preparedRequest.request.teamId;
      const platformScope = await resolveActorScope(actor, { requestedTeamId });
      if (!platformScope.ok) {
        return replyJson(res, platformScope.status || 403, { ok: false, reason: platformScope.reason || "Platform scope is unavailable." });
      }
      const context = resolveActorContext(platformScope, requestedTeamId);
      if (!context.ok) return replyJson(res, context.status || 403, { ok: false, reason: context.reason });

      const security = applyPermission(req, res, {
        route: "/api/leaderboard",
        moduleId: "leaderboard",
        actor: context.actor,
        enforcePermission: true,
      });
      if (!security.ok) return;
      return await handleRequest(req, res, context, { preparedRequest });
    } catch (error) {
      if (error?.code === "BODY_TOO_LARGE" || error?.status === 413) {
        return replyJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
      }
      return replyJson(res, error?.status || 500, { ok: false, reason: error?.message || "Leaderboard API failed." });
    }
  };
}

module.exports = createLeaderboardHandler();
module.exports.createLeaderboardHandler = createLeaderboardHandler;
