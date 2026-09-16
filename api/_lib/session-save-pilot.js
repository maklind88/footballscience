const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { readConfig, buildSupabaseKeyHeaders, DEFAULT_ROLES } = require("./supabase-admin.js");

const KEY = "football-session-planner-v3";
const MAX_BYTES = 12 * 1024 * 1024;
const uuid = (value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const failure = (status, reason) => ({ ok: false, status, reason });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function createSessionSaveRpcTransport(options = {}) {
  return async (name, body) => {
    if (!["read_session_save_context", "commit_authorized_session_save"].includes(name)) {
      throw new Error("Unsupported Sessions pilot RPC.");
    }
    const config = options.config || readConfig();
    if (!config.url || !config.serviceRoleKey) return failure(503, "Sessions database is not configured.");
    try {
      const response = await (options.fetchImpl || fetch)(`${config.url}/rest/v1/rpc/${name}`, {
        method: "POST", headers: { ...buildSupabaseKeyHeaders(config.serviceRoleKey, { contentType: "application/json" }), Accept: "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      // Body-read failures are uncertain too. Never repeat a POST behind the caller.
      const payload = await response.json();
      if (!response.ok) return failure(response.status, "Sessions database request failed.");
      if (!object(payload) || typeof payload.ok !== "boolean") return failure(502, "Invalid Sessions database response.");
      return payload;
    } catch {
      return failure(503, "Sessions response could not be verified. Keep the pending operation.");
    }
  };
}

function validContext(context, actorId, teamId) {
  const { scope, roles, entry, operation } = context;
  return object(scope) && scope.actorId === actorId && scope.teamId === teamId && uuid(scope.organizationId)
    && (scope.clubId === null || uuid(scope.clubId))
    && Array.isArray(roles) && roles.length > 0 && roles.every((role) => DEFAULT_ROLES.includes(role))
    && /^[a-f0-9]{64}$/.test(context.authorizationToken || "") && typeof context.workspaceHub === "string"
    && object(JSON.parse(context.workspaceHub))
    && entry?.key === KEY && entry.moduleId === "session-planner" && entry.organizationId === scope.organizationId
    && entry.metadata?.teamId === teamId && entry.removed === false
    && Number.isSafeInteger(entry.revision) && entry.revision > 0 && entry.revision < Number.MAX_SAFE_INTEGER
    && typeof entry.value === "string" && Buffer.byteLength(entry.value) <= MAX_BYTES && hash(entry.value) === entry.hash
    && object(JSON.parse(entry.value)) && object(operation) && typeof operation.found === "boolean"
    && typeof operation.matches === "boolean";
}

function validReceipt(receipt, context, change) {
  return receipt?.schema === "session-save-receipt-v1" && receipt.key === KEY
    && receipt.id === change.id && receipt.date === change.date
    && receipt.actorId === context.scope.actorId && receipt.teamId === context.scope.teamId
    && receipt.organizationId === context.scope.organizationId
    && Number.isSafeInteger(receipt.revision) && receipt.revision > 0
    && /^[a-f0-9]{64}$/.test(receipt.hash || "") && typeof receipt.updatedAt === "string"
    && Number.isFinite(Date.parse(receipt.updatedAt)) && object(receipt.value)
    && object(receipt.value.session) && receipt.value.session.date === change.date && object(receipt.value.tombstones);
}

// Unwired server component. actorId MUST come from the HTTP handler's verified
// authentication, never request JSON. The handler must also run guardApiRequest.
// authorize is mandatory and supplied by the existing app-state policy below.
function createSessionSavePilot({ authorize, request = createSessionSaveRpcTransport(), prepareReceipt = async () => {} } = {}) {
  if (typeof authorize !== "function") throw new Error("Sessions pilot requires the existing server authorization policy.");
  return async ({ actorId, teamId, change: input } = {}) => {
    if (!uuid(actorId) || !uuid(teamId)) return failure(400, "Canonical Sessions actor and team are required.");
    let change;
    try {
      const serialized = JSON.stringify(input);
      if (!serialized || Buffer.byteLength(serialized) > MAX_BYTES) throw new Error("Invalid operation size.");
      change = JSON.parse(serialized);
    } catch { return failure(400, "Invalid Sessions date change."); }
    const protocol = await import("../../src/modules/session-planner/session-save-protocol.mjs");
    try { protocol.validateSessionDateChange(change); }
    catch { return failure(400, "Invalid Sessions date change."); }
    // At most one fresh reconcile. Transport uncertainty is never auto-retried.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let context;
      try { context = await request("read_session_save_context", { p_actor_id: actorId, p_team_id: teamId, p_change: change }); }
      catch { return failure(503, "Sessions context is unavailable."); }
      if (context?.ok !== true) return failure(context?.status || 503, "Sessions context is unavailable or not authorized.");
      try { if (!validContext(context, actorId, teamId)) throw new Error("Invalid context."); }
      catch { return failure(502, "Sessions context could not be verified."); }

      const authorizeValue = async (value) => authorize({ scope: context.scope, roles: context.roles,
        workspaceHub: context.workspaceHub, previousEntry: context.entry, value });
      try {
        const access = await authorizeValue(context.entry.value);
        if (access?.ok !== true) return failure(access?.status || 403, "Sessions edit access was not authorized.");
      } catch { return failure(503, "Sessions permission check is unavailable."); }

      if (context.operation.found && !context.operation.matches) return failure(409, "Sessions operation identity was reused.");
      let value = context.entry.value;
      if (!context.operation.found) {
        let merged;
        try { merged = protocol.applySessionDateChange(JSON.parse(value), change); }
        catch { return failure(502, "Sessions server state could not be merged safely."); }
        if (!merged.ok) return { ...failure(409, "Review conflicting Sessions changes."), conflicts: merged.conflicts };
        value = JSON.stringify(merged.state);
      } else if (!validReceipt(context.operation.receipt, context, change) || context.operation.receipt.revision > context.entry.revision) {
        return failure(502, "Stored Sessions receipt could not be verified.");
      }
      if (Buffer.byteLength(value) > MAX_BYTES) return failure(413, "Sessions state is too large.");
      try {
        const content = await authorizeValue(value);
        if (content?.ok !== true) return failure(content?.status || 403, "Sessions content was not authorized.");
      } catch { return failure(503, "Sessions content check is unavailable."); }

      try {
        await prepareReceipt(context.operation.found ? context.operation.receipt : {
          schema: "session-save-receipt-v1", key: KEY, id: change.id, date: change.date,
          actorId, teamId, organizationId: context.scope.organizationId,
          revision: context.entry.revision + 1, hash: hash(value), updatedAt: "9999-12-31T23:59:59.999999+00:00",
          value: protocol.sessionDateValue(JSON.parse(value), change.date),
        });
      } catch { return failure(413, "Sessions receipt exceeds the transfer limit. Nothing new was saved."); }

      let result;
      try {
        result = await request("commit_authorized_session_save", {
          p_actor_id: actorId, p_team_id: teamId, p_organization_id: context.scope.organizationId,
          p_change: change, p_authorization_token: context.authorizationToken,
          p_expected_revision: context.entry.revision, p_value: value,
        });
      } catch { return failure(503, "Sessions response could not be verified. Keep the pending operation."); }
      if (result?.ok !== true) {
        if (result?.status === 409 && (result.contextChanged === true || Number.isSafeInteger(result.currentRevision)) && attempt === 0) continue;
        return failure(result?.status || 503, "Sessions save was not confirmed. Keep the pending operation.");
      }
      if (!validReceipt(result.receipt, context, change) || typeof result.replayed !== "boolean") {
        return failure(502, "Sessions receipt could not be verified.");
      }
      if (result.replayed) {
        // A competing identical operation can win after our read; reread its
        // immutable receipt instead of comparing it to our speculative merge.
        if (!context.operation.found && attempt === 0) continue;
        if (!isDeepStrictEqual(result.receipt, context.operation.receipt)) return failure(502, "Sessions replay receipt mismatch.");
      } else if (context.operation.found || result.receipt.revision !== context.entry.revision + 1
        || result.receipt.hash !== hash(value)
        || !isDeepStrictEqual(result.receipt.value, protocol.sessionDateValue(JSON.parse(value), change.date))) {
        return failure(502, "Sessions commit receipt mismatch.");
      }
      return { ok: true, replayed: result.replayed, receipt: result.receipt };
    }
    return failure(409, "Sessions changed again. Keep the pending operation for a later retry.");
  };
}

module.exports = { createSessionSavePilot, createSessionSaveRpcTransport };
