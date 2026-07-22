const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");
const { composeSessionPlannerLegacyState } = require("./session-planner-domain-records.js");

const SESSION_PLANNER_DATABASE_MODES = new Set(["planned", "shadow", "database"]);
const SESSION_PLANNER_DATABASE_READ_MODES = new Set(["shadow", "database"]);
const SESSION_PLANNER_DATABASE_TIMEOUT_MS = 10000;
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
    "updated_at",
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
    "updated_at",
  ].join(",");
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
    updatedAt: String(row.updated_at || ""),
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
    updatedAt: String(row.updated_at || ""),
  };
}

async function readSessionPlannerDomainSnapshot(scope = {}, options = {}) {
  const env = options.env || process.env;
  if (!isSessionPlannerDatabaseReadEnabled(env) && options.allowDisabled !== true) {
    return { ok: false, enabled: false, mode: getSessionPlannerDatabaseMode(env) };
  }
  const organizationId = String(scope.organizationId || "").trim();
  const teamId = String(scope.teamId || "").trim();
  if (!organizationId || !teamId) {
    return { ok: false, enabled: true, status: 400, reason: "Session Planner tenant scope is required." };
  }
  const sessionQuery = new URLSearchParams({
    select: sessionSelect(),
    organization_id: `eq.${organizationId}`,
    team_id: `eq.${teamId}`,
    session_slot: "eq.primary",
    archived_at: "is.null",
    order: "session_date.asc,id.asc",
  });
  if (scope.dateFrom) sessionQuery.set("session_date", `gte.${scope.dateFrom}`);
  if (scope.dateTo) sessionQuery.append("session_date", `lte.${scope.dateTo}`);

  const sessionResult = await databaseRequest(`/${SESSION_TABLE}?${sessionQuery}`, options);
  if (!sessionResult.ok) return { ...sessionResult, enabled: true };
  const sessions = (Array.isArray(sessionResult.payload) ? sessionResult.payload : []).map(mapSessionRow);
  if (!sessions.length) {
    return { ok: true, enabled: true, sessions: [], blocks: [] };
  }

  const blockQuery = new URLSearchParams({
    select: blockSelect(),
    organization_id: `eq.${organizationId}`,
    team_id: `eq.${teamId}`,
    session_id: `in.(${sessions.map((session) => session.id).join(",")})`,
    archived_at: "is.null",
    order: "session_id.asc,sort_order.asc,id.asc",
  });
  const blockResult = await databaseRequest(`/${BLOCK_TABLE}?${blockQuery}`, options);
  if (!blockResult.ok) return { ...blockResult, enabled: true };
  return {
    ok: true,
    enabled: true,
    organizationId,
    teamId,
    sessions,
    blocks: (Array.isArray(blockResult.payload) ? blockResult.payload : []).map(mapBlockRow),
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
  isSessionPlannerDatabaseConfigured,
  isSessionPlannerDatabaseReadEnabled,
  mapBlockRow,
  mapSessionRow,
  readSessionPlannerDomainSnapshot,
  readSessionPlannerLegacyState,
};
