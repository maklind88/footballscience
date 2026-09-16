const { getCurrentActor, parseJsonBody, sendCorsHeaders, sendJson } = require("./supabase-admin.js");
const { guardApiRequest } = require("./platform-security.js");
const { decodeSessionStateValue, encodeSessionStateValue } = require("./session-state-transport.js");

const KEY = "football-session-planner-v3";
const MAX_WIRE_BYTES = 4 * 1024 * 1024;
const MAX_VALUE_BYTES = 12 * 1024 * 1024;

async function receiptPayload(req, receipt, replayed) {
  const encoded = await encodeSessionStateValue(req, KEY, JSON.stringify(receipt));
  const payload = { ok: true, replayed, receipt: encoded };
  // Reserve room for the actual timestamp and envelope differences before SQL.
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_WIRE_BYTES - 65536) {
    throw new Error("Sessions receipt exceeds the transfer limit.");
  }
  return payload;
}

// Constructor only, not a deployed route. Authentication and rate guards are
// fixed here; only the server-side database transport is injectable.
function createSessionSavePilotHandler({ request } = {}) {
  return async (req, res) => {
    sendCorsHeaders(res);
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
    try {
      const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
      if (!actor) return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
      if (!guardApiRequest(req, res, { route: "/api/app-state", moduleId: "app-state", actor,
        requireAuth: true, enforcePermission: false }).ok) return;
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
      const body = await parseJsonBody(req, { maxBytes: MAX_WIRE_BYTES });
      if (body?.key !== KEY || body.removed || body.entries || body.value !== undefined) {
        return sendJson(res, 400, { ok: false, reason: "A Sessions date operation is required." });
      }
      const raw = await decodeSessionStateValue(KEY, body.sessionChange);
      if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_VALUE_BYTES) {
        return sendJson(res, 413, { ok: false, reason: "Invalid Sessions operation size." });
      }
      let change;
      try { change = JSON.parse(raw); }
      catch { return sendJson(res, 400, { ok: false, reason: "Invalid Sessions date operation." }); }
      const save = require("../app-state.js").createSessionSavePilot({ request,
        prepareReceipt: (receipt) => receiptPayload(req, receipt, false),
      });
      const result = await save({ actorId: actor.id, teamId: body.teamId, change });
      if (!result.ok) return sendJson(res, result.status || 503, result);
      return sendJson(res, 200, await receiptPayload(req, result.receipt, result.replayed));
    } catch (error) {
      const status = error?.code === "BODY_TOO_LARGE" ? 413 : error?.code === "SESSION_TRANSPORT" ? error.status || 400 : 503;
      return sendJson(res, status, { ok: false, reason: "Sessions response was not confirmed. Keep the pending operation." });
    }
  };
}

module.exports = { createSessionSavePilotHandler };
