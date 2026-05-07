const {
  getCurrentActor,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { readAuditLog } = require("./_lib/audit-log.js");

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

  if (actor.role !== "admin") {
    return sendJson(res, 403, { ok: false, reason: "Admin access required." });
  }

  try {
    const query = new URL(req.url, "http://localhost").searchParams;
    const auditLog = await readAuditLog(query.get("limit") || 80);
    return sendJson(res, 200, {
      ok: true,
      entries: auditLog.entries,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, reason: error?.message || "Audit log could not be loaded." });
  }
};
