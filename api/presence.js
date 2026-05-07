const {
  getCurrentActor,
  sendCorsHeaders,
  sendJson,
  parseJsonBody,
} = require("./_lib/supabase-admin.js");
const {
  getPresenceEntries,
  updatePresence,
} = require("./_lib/presence.js");

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

  try {
    if (req.method === "GET") {
      const entries = await getPresenceEntries();
      return sendJson(res, 200, {
        ok: true,
        entries,
        updatedAt: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    }

    const body = await parseJsonBody(req);
    const result = await updatePresence(actor, {
      status: body?.status,
      lastActivityAt: body?.lastActivityAt,
      workspaceId: body?.workspaceId,
    });

    return sendJson(res, result.ok ? 200 : 400, result);
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, 500, { ok: false, reason: error?.message || "Presence API failed." });
  }
};
