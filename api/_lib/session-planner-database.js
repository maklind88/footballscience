const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");
const {
  SESSION_PLANNER_DOMAIN_SCHEMA_VERSION,
  composeSessionPlannerLegacyState,
  hashJsonValue,
} = require("./session-planner-domain-records.js");

const SESSION_PLANNER_DATABASE_MODES = new Set(["planned", "shadow"]);
const SESSION_PLANNER_DATABASE_READ_MODES = new Set(["shadow"]);
const SESSION_PLANNER_DATABASE_TIMEOUT_MS = 10000;
const SESSION_PLANNER_DATABASE_SCOPES_ENV = "SESSION_PLANNER_DATABASE_SCOPES";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TABLE = "session_planner_sessions";
const BLOCK_TABLE = "session_planner_blocks";

function getSessionPlannerDatabaseMode(env = process.env) {
  const mode = String(env.SESSION_PLANNER_DATABASE_MODE || "off").trim().toLowerCase();
  return SESSION_PLANNER_DATABASE_MODES.has(mode) ? mode : "off";
}

function isSessionPlannerDatabaseConfigured(env = process.env) {
  return getSessionPlannerDatabaseMode(env) !== "off";
}

function isSessionPlannerDatabaseReadEnabled(env = process.env) {
  return SESSION_PLANNER_DATABASE_READ_MODES.has(getSessionPlannerDatabaseMode(env));
}

function normalizeScopeId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function sessionPlannerScopeKey(scope = {}) {
  const organizationId = normalizeScopeId(scope.organizationId);
  const teamId = normalizeScopeId(scope.teamId);
  return organizationId && teamId ? `${organizationId}:${teamId}` : "";
}

function getSessionPlannerDatabaseScopeAccess(scope = {}, env = process.env) {
  const mode = getSessionPlannerDatabaseMode(env);
  const scopeKey = sessionPlannerScopeKey(scope);
  const allowlistedScopes = new Set(
    String(env[SESSION_PLANNER_DATABASE_SCOPES_ENV] || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const readModeEnabled = SESSION_PLANNER_DATABASE_READ_MODES.has(mode);
  const allowlisted = Boolean(scopeKey && allowlistedScopes.has(scopeKey));
  return Object.freeze({
    mode,
    scopeKey,
    readModeEnabled,
    allowlisted,
    enabled: readModeEnabled && allowlisted,
  });
}

function createIntegrityError(code) {
  const error = new Error("Session Planner domain snapshot failed integrity validation.");
  error.code = code;
  return error;
}

function validateSessionRows(rows, scope) {
  const organizationId = normalizeScopeId(scope.organizationId);
  const teamId = normalizeScopeId(scope.teamId);
  const ids = new Set();
  const dates = new Set();
  rows.forEach((row) => {
    if (normalizeScopeId(row.organizationId) !== organizationId || normalizeScopeId(row.teamId) !== teamId) {
      throw createIntegrityError("session_planner_scope_mismatch");
    }
    if (!normalizeScopeId(row.id) || ids.has(row.id)) {
      throw createIntegrityError("session_planner_session_identity_invalid");
    }
    if (!row.sessionDate || dates.has(row.sessionDate)) {
      throw createIntegrityError("session_planner_session_date_duplicate");
    }
    if (row.schemaVersion !== SESSION_PLANNER_DOMAIN_SCHEMA_VERSION || row.rowVersion < 1) {
      throw createIntegrityError("session_planner_session_version_invalid");
    }
    if (!row.contentHash || row.contentHash !== hashJsonValue(row.content)) {
      throw createIntegrityError("session_planner_session_hash_mismatch");
    }
    ids.add(row.id);
    dates.add(row.sessionDate);
  });
  return ids;
}

function validateBlockRows(rows, scope, sessionIds) {
  const organizationId = normalizeScopeId(scope.organizationId);
  const teamId = normalizeScopeId(scope.teamId);
  const ids = new Set();
  const sessionBlockKeys = new Set();
  const sessionOrderKeys = new Set();
  rows.forEach((row) => {
    if (normalizeScopeId(row.organizationId) !== organizationId || normalizeScopeId(row.teamId) !== teamId) {
      throw createIntegrityError("session_planner_scope_mismatch");
    }
    if (!normalizeScopeId(row.id) || ids.has(row.id) || !sessionIds.has(row.sessionId)) {
      throw createIntegrityError("session_planner_block_identity_invalid");
    }
    const blockKey = `${row.sessionId}:${row.legacyBlockId}`;
    const orderKey = `${row.sessionId}:${row.sortOrder}`;
    if (!row.legacyBlockId || row.sortOrder < 0 || sessionBlockKeys.has(blockKey) || sessionOrderKeys.has(orderKey)) {
      throw createIntegrityError("session_planner_block_order_invalid");
    }
    if (row.schemaVersion !== SESSION_PLANNER_DOMAIN_SCHEMA_VERSION || row.rowVersion < 1) {
      throw createIntegrityError("session_planner_block_version_invalid");
    }
    if (!row.payloadHash || row.payloadHash !== hashJsonValue(row.payload)) {
      throw createIntegrityError("session_planner_block_hash_mismatch");
    }
    ids.add(row.id);
    sessionBlockKeys.add(blockKey);
    sessionOrderKeys.add(orderKey);
  });
}

function validateSessionPlannerDomainSnapshot(snapshot = {}, scope = {}) {
  const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const sessionIds = validateSessionRows(sessions, scope);
  validateBlockRows(blocks, scope, sessionIds);
  return Object.freeze({ sessionCount: sessions.length, blockCount: blocks.length });
}

function databaseConfig() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) return null;
  return { url: `${url}/rest/v1`, serviceRoleKey };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function databaseRequest(path, options = {}) {
  const config = options.config || databaseConfig();
  const fetchImpl = options.fetchImpl || fetch;
  if (!config) {
    return { ok: false, status: 500, reason: "Session Planner database is not configured." };
  }
  let response;
  try {
    response = await fetchImpl(`${config.url}${path}`, {
      method: "GET",
      headers: {
        ...buildSupabaseKeyHeaders(config.serviceRoleKey),
        Accept: "application/json",
      },
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(SESSION_PLANNER_DATABASE_TIMEOUT_MS)
          : undefined,
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      reason:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "Session Planner database timed out."
          : "Session Planner database is unavailable.",
    };
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.hint || payload?.details || `Database request failed (${response.status}).`,
    };
  }
  return { ok: true, status: response.status, payload };
}

function sessionSelect() {
  return [
    "id",
    "organization_id",
    "team_id",
    "session_date",
    "session_slot",
    "legacy_session_id",
    "title",
    "theme",
    "selected_block_legacy_id",
    "schema_version",
    "row_version",
    "content",
    "content_hash",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at",
    "archived_at",
    "archived_by",
    "archive_reason",
  ].join(",");
}

function blockSelect() {
  return [
    "id",
    "organization_id",
    "team_id",
    "session_id",
    "legacy_block_id",
    "sort_order",
    "schema_version",
    "row_version",
    "payload",
    "payload_hash",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at",
    "archived_at",
    "archived_by",
    "archive_reason",
  ].join(",");
}

function nullableText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function mapSessionRow(row = {}) {
  return {
    id: String(row.id || ""),
    organizationId: String(row.organization_id || ""),
    teamId: String(row.team_id || ""),
    sessionDate: String(row.session_date || ""),
    sessionSlot: String(row.session_slot || "primary"),
    legacySessionId: String(row.legacy_session_id || ""),
    title: String(row.title || ""),
    theme: String(row.theme || ""),
    selectedBlockLegacyId: String(row.selected_block_legacy_id || ""),
    schemaVersion: Number(row.schema_version) || 0,
    rowVersion: Number(row.row_version) || 0,
    content: row.content && typeof row.content === "object" ? row.content : {},
    contentHash: String(row.content_hash || ""),
    createdBy: nullableText(row.created_by),
    updatedBy: nullableText(row.updated_by),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    archivedAt: nullableText(row.archived_at),
    archivedBy: nullableText(row.archived_by),
    archiveReason: nullableText(row.archive_reason),
  };
}

function mapBlockRow(row = {}) {
  return {
    id: String(row.id || ""),
    organizationId: String(row.organization_id || ""),
    teamId: String(row.team_id || ""),
    sessionId: String(row.session_id || ""),
    legacyBlockId: String(row.legacy_block_id || ""),
    sortOrder: Number(row.sort_order) || 0,
    schemaVersion: Number(row.schema_version) || 0,
    rowVersion: Number(row.row_version) || 0,
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    payloadHash: String(row.payload_hash || ""),
    createdBy: nullableText(row.created_by),
    updatedBy: nullableText(row.updated_by),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    archivedAt: nullableText(row.archived_at),
    archivedBy: nullableText(row.archived_by),
    archiveReason: nullableText(row.archive_reason),
  };
}

async function readSessionPlannerDomainSnapshot(scope = {}, options = {}) {
  const env = options.env || process.env;
  const organizationId = normalizeScopeId(scope.organizationId);
  const teamId = normalizeScopeId(scope.teamId);
  if (!organizationId || !teamId) {
    return { ok: false, enabled: true, status: 400, reason: "Session Planner tenant scope is required." };
  }
  const access = getSessionPlannerDatabaseScopeAccess({ organizationId, teamId }, env);
  if (!access.enabled && options.allowDisabled !== true) {
    return {
      ok: false,
      enabled: false,
      mode: access.mode,
      code: access.readModeEnabled
        ? "session_planner_scope_not_enabled"
        : "session_planner_database_not_enabled",
    };
  }
  const sessionQuery = new URLSearchParams({
    select: sessionSelect(),
    organization_id: `eq.${organizationId}`,
    team_id: `eq.${teamId}`,
    session_slot: "eq.primary",
    order: "session_date.asc,id.asc",
  });
  if (options.includeArchived !== true) sessionQuery.set("archived_at", "is.null");
  if (scope.dateFrom) sessionQuery.set("session_date", `gte.${scope.dateFrom}`);
  if (scope.dateTo) sessionQuery.append("session_date", `lte.${scope.dateTo}`);

  const sessionResult = await databaseRequest(`/${SESSION_TABLE}?${sessionQuery}`, options);
  if (!sessionResult.ok) return { ...sessionResult, enabled: true };
  const sessions = (Array.isArray(sessionResult.payload) ? sessionResult.payload : []).map(mapSessionRow);
  let sessionIds;
  try {
    sessionIds = validateSessionRows(sessions, { organizationId, teamId });
  } catch (error) {
    return { ok: false, enabled: true, status: 409, code: error.code, reason: error.message };
  }
  if (!sessions.length) {
    return {
      ok: true,
      enabled: true,
      organizationId,
      teamId,
      includeArchived: options.includeArchived === true,
      sessions: [],
      blocks: [],
    };
  }

  const blockQuery = new URLSearchParams({
    select: blockSelect(),
    organization_id: `eq.${organizationId}`,
    team_id: `eq.${teamId}`,
    session_id: `in.(${sessions.map((session) => session.id).join(",")})`,
    order: "session_id.asc,sort_order.asc,id.asc",
  });
  if (options.includeArchived !== true) blockQuery.set("archived_at", "is.null");
  const blockResult = await databaseRequest(`/${BLOCK_TABLE}?${blockQuery}`, options);
  if (!blockResult.ok) return { ...blockResult, enabled: true };
  const blocks = (Array.isArray(blockResult.payload) ? blockResult.payload : []).map(mapBlockRow);
  try {
    validateBlockRows(blocks, { organizationId, teamId }, sessionIds);
  } catch (error) {
    return { ok: false, enabled: true, status: 409, code: error.code, reason: error.message };
  }
  return {
    ok: true,
    enabled: true,
    organizationId,
    teamId,
    includeArchived: options.includeArchived === true,
    sessions,
    blocks,
  };
}

async function readSessionPlannerLegacyState(scope = {}, options = {}) {
  const snapshot = await readSessionPlannerDomainSnapshot(scope, options);
  if (!snapshot.ok) return snapshot;
  return {
    ...snapshot,
    state: composeSessionPlannerLegacyState(snapshot, {
      organizationId: snapshot.organizationId,
      teamId: snapshot.teamId,
      selectedDate: options.selectedDate,
    }),
  };
}

module.exports = {
  BLOCK_TABLE,
  SESSION_TABLE,
  getSessionPlannerDatabaseMode,
  getSessionPlannerDatabaseScopeAccess,
  isSessionPlannerDatabaseConfigured,
  isSessionPlannerDatabaseReadEnabled,
  mapBlockRow,
  mapSessionRow,
  readSessionPlannerDomainSnapshot,
  readSessionPlannerLegacyState,
  sessionPlannerScopeKey,
  validateSessionPlannerDomainSnapshot,
};
