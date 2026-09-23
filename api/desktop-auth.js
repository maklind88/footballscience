const { parseJsonBody, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { RESPONSE_SCHEMA, executeDesktopAuth } = require("./_lib/desktop-auth.js");

function createDesktopAuthHandler(dependencies = {}) {
  const guard = dependencies.guardApiRequest || guardApiRequest;
  const parseBody = dependencies.parseJsonBody || parseJsonBody;
  const execute = dependencies.executeDesktopAuth || executeDesktopAuth;
  const send = dependencies.sendJson || sendJson;
  const cors = dependencies.sendCorsHeaders || sendCorsHeaders;

  return async function desktopAuth(req, res) {
    cors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.method !== "POST") return send(res, 405, { ok: false, schema: RESPONSE_SCHEMA, reason: "Method not allowed." });
    const security = guard(req, res, { route: "/api/desktop-auth", moduleId: "auth", action: "write" });
    if (!security.ok) return;
    let body;
    try {
      body = await parseBody(req, { maxBytes: 32 * 1024 });
    } catch (error) {
      return send(res, error?.code === "BODY_TOO_LARGE" ? 413 : 400, {
        ok: false,
        schema: RESPONSE_SCHEMA,
        reason: "Desktop authentication request is invalid.",
      });
    }
    let result;
    try {
      result = await execute(body, req.headers?.authorization || req.headers?.Authorization || "", dependencies);
    } catch {
      result = { ok: false, status: 503, reason: "Desktop authentication is temporarily unavailable." };
    }
    return send(res, result.status || (result.ok ? 200 : 500), result.payload || {
      ok: false,
      schema: RESPONSE_SCHEMA,
      reason: result.reason || "Desktop authentication failed.",
    });
  };
}

const handler = createDesktopAuthHandler();
handler.createDesktopAuthHandler = createDesktopAuthHandler;
module.exports = handler;
