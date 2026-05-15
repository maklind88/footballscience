const { getCurrentActor, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { resolvePlatformActorScope } = require("./_lib/platform-identity.js");

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/platform-identity",
    moduleId: "platform-identity",
    action: "read",
    actor,
  });
  if (!security.ok) {
    return;
  }

  const result = await resolvePlatformActorScope(actor);
  return sendJson(res, result.ok ? 200 : result.status || 500, result);
};
