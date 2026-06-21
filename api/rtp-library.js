const {
  getCurrentActor,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { handleRtpLibraryRequest } = require("./_lib/rtp-library-database.js");

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
    route: "/api/rtp-library",
    moduleId: "rtp-library",
    actor,
  });
  if (!security.ok) {
    return;
  }

  try {
    return await handleRtpLibraryRequest(req, res, actor);
  } catch (error) {
    return sendJson(res, error?.status || 500, {
      ok: false,
      reason: error?.message || "RTP Library API failed.",
    });
  }
};
