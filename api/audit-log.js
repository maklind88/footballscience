const {
  getCurrentActor,
  parseJsonBody,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { appendAuditLog, readAuditLog } = require("./_lib/audit-log.js");

const CLIENT_AUDIT_ACTIONS = new Set(["medical.handover.copied"]);

function normalizeClientAuditDetails(action, details = {}) {
  if (action === "medical.handover.copied") {
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(details.date || "")) ? String(details.date) : "",
      itemCount: Math.max(0, Math.min(200, Number(details.itemCount) || 0)),
    };
  }

  return {};
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  if (req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const action = String(body?.action || "").trim();
      if (!CLIENT_AUDIT_ACTIONS.has(action)) {
        return sendJson(res, 400, { ok: false, reason: "Unsupported audit action." });
      }

      await appendAuditLog(actor, {
        action,
        summary: String(body?.summary || action).trim().slice(0, 160),
        details: normalizeClientAuditDetails(action, body?.details || {}),
      });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { ok: false, reason: error?.message || "Audit event could not be saved." });
    }
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
