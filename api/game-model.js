const { getCurrentActor, parseJsonBody, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { enforceApiPermission, guardApiRequest } = require("./_lib/platform-security.js");
const { readGameModelCatalog, saveGameModelItem } = require("./_lib/game-model-catalog.js");
const { resolveGameModelScope } = require("./_lib/game-model-scope.js");

const route = "/api/game-model";
const moduleId = "game-model";

function createGameModelHandler(dependencies = {}) {
  const readActor = dependencies.getCurrentActor || getCurrentActor;
  const parseBody = dependencies.parseJsonBody || parseJsonBody;
  const cors = dependencies.sendCorsHeaders || sendCorsHeaders;
  const reply = dependencies.sendJson || sendJson;
  const preflight = dependencies.guardApiRequest || guardApiRequest;
  const enforce = dependencies.enforceApiPermission || enforceApiPermission;
  const resolveScope = dependencies.resolveGameModelScope || resolveGameModelScope;
  const readCatalog = dependencies.readGameModelCatalog || readGameModelCatalog;
  const saveItem = dependencies.saveGameModelItem || saveGameModelItem;

  return async (req, res) => {
    cors(res);
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
      return reply(res, 405, { ok: false, reason: "Method not allowed." });
    }
    try {
      const actor = await readActor(req.headers?.authorization || req.headers?.Authorization);
      if (!actor) return reply(res, 401, { ok: false, reason: "You must be signed in." });
      if (!preflight(req, res, { route, moduleId, actor, requireAuth: true, enforcePermission: false }).ok) return;
      const writing = req.method === "POST";
      const body = writing ? await parseBody(req, { maxBytes: 16 * 1024 }) : null;
      if (writing && (!body || typeof body !== "object" || Array.isArray(body) || !body.item)) {
        return reply(res, 400, { ok: false, reason: "Choose a Game Model item to save." });
      }
      const requestedTeamId = writing ? body.teamId : new URL(req.url || route, "https://footballscience.local").searchParams.get("teamId");
      const scope = await resolveScope(actor, requestedTeamId);
      if (!scope.ok) return reply(res, scope.status, { ok: false, reason: scope.reason });
      if (!enforce(req, res, { route, moduleId, actor: scope.actor, enforcePermission: true }).ok) return;
      const result = writing ? await saveItem(scope, body.item) : await readCatalog(scope);
      if (!result.ok) return reply(res, result.status, { ok: false, reason: result.reason });
      return reply(res, 200, writing ? result : { ok: true, teamId: scope.teamId, canEdit: scope.canEdit, items: result.items });
    } catch (error) {
      if (error?.code === "BODY_TOO_LARGE") return reply(res, 413, { ok: false, reason: "Request body is too large." });
      return reply(res, 503, { ok: false, reason: "Game Model is unavailable. Please try again." });
    }
  };
}

module.exports = createGameModelHandler();
module.exports.createGameModelHandler = createGameModelHandler;
