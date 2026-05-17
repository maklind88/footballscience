const {
  getCurrentActor,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { handleFootballScienceDbRequest } = require("./_lib/football-science-db.js");
const { guardApiRequest } = require("./_lib/platform-security.js");

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/football-science-db",
    moduleId: "football-science-db",
    actor,
  });
  if (!security.ok) {
    return;
  }

  try {
    return await handleFootballScienceDbRequest(req, res, actor);
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE" || error?.status === 413) {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, error?.status || 500, {
      ok: false,
      reason: error?.message || "Football Science DB API failed.",
    });
  }
};
