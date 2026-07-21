const crypto = require("crypto");
const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");

const APP_STATE_RECORDS_TABLE = "platform_app_state_records";
const APP_STATE_WRITE_RPC = "write_platform_app_state_record";
const DATABASE_MODE_VALUES = new Set(["database", "db", "postgres", "supabase", "on", "true", "1"]);
const DATABASE_REQUEST_TIMEOUT_MS = 10000;

function isAppStateDatabaseEnabled() {
  const mode = String(process.env.APP_STATE_DATABASE_MODE || "").trim().toLowerCase();
  return DATABASE_MODE_VALUES.has(mode);
}

function databaseConfig() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return { url: `${url}/rest/v1`, serviceRoleKey };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function databaseRequest(path, options = {}) {
  const config = databaseConfig();
  if (!config) {
    return { ok: false, status: 500, reason: "Central app-state database is not configured." };
  }

  let response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method: options.method || "GET",
      headers: {
        ...buildSupabaseKeyHeaders(config.serviceRoleKey, { contentType: options.body ? "application/json" : "" }),
        Accept: "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(DATABASE_REQUEST_TIMEOUT_MS)
          : undefined,
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      reason:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "Central app-state database timed out."
          : "Central app-state database is unavailable.",
    };
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.hint || payload?.details || `Database request failed (${response.status}).`,
      payload,
    };
  }
  return { ok: true, status: response.status, payload };
}

function normalizeRecord(row = {}) {
  if (!row?.state_key) {
    return null;
  }
  return {
    schema: "footballscience-app-state-v1",
    key: String(row.state_key),
    moduleId: String(row.module_id || ""),
    organizationId: String(row.organization_id || "global"),
    mergePolicy: String(row.merge_policy || ""),
    revision: Number(row.revision) || 0,
    value: String(row.value ?? ""),
    removed: Boolean(row.removed),
    updatedBy: String(row.updated_by || ""),
    updatedAt: String(row.updated_at || ""),
    hash: String(row.value_hash || ""),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

function hashStateValue(value = "") {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function recordSelect() {
  return "organization_id,state_key,module_id,merge_policy,revision,value,removed,updated_by,updated_at,value_hash,metadata";
}

async function readAppStateRecord(key, organizationId = "global") {
  if (!isAppStateDatabaseEnabled()) {
    return { ok: false, enabled: false };
  }
  const query = new URLSearchParams({
    select: recordSelect(),
    organization_id: `eq.${organizationId}`,
    state_key: `eq.${key}`,
    limit: "1",
  });
  const result = await databaseRequest(`/${APP_STATE_RECORDS_TABLE}?${query.toString()}`);
  if (!result.ok) {
    return result;
  }
  return { ok: true, enabled: true, entry: normalizeRecord(result.payload?.[0]) };
}

async function listAppStateRecords(organizationId = "global", keys = null) {
  if (!isAppStateDatabaseEnabled()) {
    return { ok: false, enabled: false };
  }
  const query = new URLSearchParams({
    select: recordSelect(),
    organization_id: `eq.${organizationId}`,
    order: "state_key.asc",
  });
  if (Array.isArray(keys)) {
    if (!keys.length) {
      return { ok: true, enabled: true, entries: [] };
    }
    query.set("state_key", `in.(${keys.join(",")})`);
  }
  const result = await databaseRequest(`/${APP_STATE_RECORDS_TABLE}?${query.toString()}`);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    enabled: true,
    entries: (Array.isArray(result.payload) ? result.payload : []).map(normalizeRecord).filter(Boolean),
  };
}

async function writeAppStateRecord(entry = {}, expectedRevision = 0) {
  if (!isAppStateDatabaseEnabled()) {
    return { ok: false, enabled: false };
  }
  const result = await databaseRequest(`/rpc/${APP_STATE_WRITE_RPC}`, {
    method: "POST",
    body: {
      p_organization_id: String(entry.organizationId || "global"),
      p_state_key: String(entry.key || ""),
      p_module_id: String(entry.moduleId || ""),
      p_merge_policy: String(entry.mergePolicy || ""),
      p_expected_revision: Number(expectedRevision) || 0,
      p_next_revision: Number(entry.revision) || 1,
      p_value: String(entry.value ?? ""),
      p_removed: Boolean(entry.removed),
      p_updated_by: String(entry.updatedBy || ""),
      p_value_hash: /^[a-f0-9]{64}$/.test(String(entry.hash || ""))
        ? String(entry.hash)
        : hashStateValue(entry.value),
      p_metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
    },
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.payload) ? result.payload[0] : null;
  if (!row) {
    return { ok: false, enabled: true, status: 409, conflict: true, reason: "Central app-state revision changed before save." };
  }
  const persistedEntry = normalizeRecord(row);
  if (!row.applied) {
    return {
      ok: false,
      enabled: true,
      status: 409,
      conflict: true,
      currentRevision: persistedEntry?.revision || 0,
      currentEntry: persistedEntry,
      reason: "Central app-state revision changed before save.",
    };
  }
  return { ok: true, enabled: true, entry: persistedEntry };
}

module.exports = {
  APP_STATE_RECORDS_TABLE,
  isAppStateDatabaseEnabled,
  listAppStateRecords,
  readAppStateRecord,
  writeAppStateRecord,
  _private: {
    databaseRequest,
    normalizeRecord,
  },
};
