const {
  getCurrentActor,
  parseJsonBody,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const {
  MAX_BODY_BYTES,
  RESPONSE_SCHEMA,
  SNAPSHOT_RESPONSE_SCHEMA,
  validateDatabaseResult,
  validateRequest,
  validateSnapshotQuery,
  validateSnapshotResult,
} = require("./_lib/desktop-session-sync-contract.js");

function unavailableDatabaseAdapter() {
  const error = new Error("Desktop synchronization backend is not configured.");
  error.code = "DESKTOP_SYNC_UNAVAILABLE";
  throw error;
}

function createDesktopSessionSyncHandler(dependencies = {}) {
  const authenticate = dependencies.getCurrentActor || getCurrentActor;
  const parseBody = dependencies.parseJsonBody || parseJsonBody;
  const guard = dependencies.guardApiRequest || guardApiRequest;
  const applyOperation = dependencies.applyOperation || unavailableDatabaseAdapter;
  const readSnapshot = dependencies.readSnapshot || unavailableDatabaseAdapter;
  const send = dependencies.sendJson || sendJson;
  const cors = dependencies.sendCorsHeaders || sendCorsHeaders;

  return async function desktopSessionSync(req, res) {
    cors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
      return send(res, 405, { ok: false, schema: RESPONSE_SCHEMA, reason: "Method not allowed." });
    }
    const actor = await authenticate(req.headers?.authorization || req.headers?.Authorization);
    if (!actor) {
      return send(res, 401, { ok: false, schema: RESPONSE_SCHEMA, reason: "You must be signed in." });
    }
    const security = guard(req, res, {
      route: "/api/desktop-session-sync",
      moduleId: "session-planner",
      actor,
      action: req.method === "GET" ? "read" : "write",
      requireAuth: true,
      enforcePermission: true,
      permissionDeniedReason: req.method === "GET"
        ? "You do not have read access for Session Planner."
        : "You do not have edit access for Session Planner.",
    });
    if (!security.ok) return;

    const actorId = String(actor.id || "").trim();
    const organizationId = String(actor.organizationId || "").trim();
    const teamId = String(actor.teamId || "").trim();
    if (!actorId || !organizationId || !teamId || actor.status === "paused") {
      return send(res, 403, { ok: false, schema: RESPONSE_SCHEMA, reason: "Desktop synchronization scope is unavailable." });
    }

    try {
      if (req.method === "GET") {
        const parsedUrl = new URL(req.url || "/api/desktop-session-sync", "http://desktop.local");
        const query = validateSnapshotQuery(Object.fromEntries(parsedUrl.searchParams));
        const snapshot = validateSnapshotResult(await readSnapshot({
          ...query,
          actorId,
          organizationId,
          teamId,
          requestId: security.context.requestId,
        }));
        return send(res, 200, {
          ok: true,
          schema: SNAPSHOT_RESPONSE_SCHEMA,
          syncProtocolVersion: 1,
          requestId: security.context.requestId,
          snapshot,
        });
      }
      const request = validateRequest(await parseBody(req, { maxBytes: MAX_BODY_BYTES }));
      const acknowledgement = validateDatabaseResult(await applyOperation({
        ...request,
        actorId,
        organizationId,
        teamId,
        requestId: security.context.requestId,
      }));
      return send(res, 200, {
        ok: true,
        schema: RESPONSE_SCHEMA,
        syncProtocolVersion: 1,
        requestId: security.context.requestId,
        operationId: request.operationId,
        ...acknowledgement,
      });
    } catch (error) {
      if (error?.code === "BODY_TOO_LARGE") {
        return send(res, 413, { ok: false, schema: RESPONSE_SCHEMA, reason: "Request body is too large." });
      }
      if (error instanceof TypeError) {
        return send(res, 400, { ok: false, schema: RESPONSE_SCHEMA, reason: error.message });
      }
      if (error?.code === "DESKTOP_SYNC_UNAVAILABLE") {
        return send(res, 503, { ok: false, schema: RESPONSE_SCHEMA, reason: "Desktop synchronization is unavailable." });
      }
      if (error?.code === "42501") {
        return send(res, 403, { ok: false, schema: RESPONSE_SCHEMA, reason: "Desktop synchronization is not authorized." });
      }
      return send(res, 500, { ok: false, schema: RESPONSE_SCHEMA, reason: "Desktop synchronization failed." });
    }
  };
}

const handler = createDesktopSessionSyncHandler();
handler.createDesktopSessionSyncHandler = createDesktopSessionSyncHandler;
module.exports = handler;
