const {
  buildSupabaseKeyHeaders,
  readConfig,
} = require("./supabase-admin.js");

const CHAT_PUSH_TIMEOUT_MS = 8000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeString(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeId(value) {
  return normalizeString(value, 120);
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function filterValue(value) {
  return encodeURIComponent(String(value || ""));
}

function inFilter(values = []) {
  return `in.(${values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`;
}

function timeoutSignal(timeoutMs = CHAT_PUSH_TIMEOUT_MS) {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function restBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }
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

async function dbRequest(path, options = {}) {
  const base = restBaseUrl();
  if (!base) {
    return { ok: false, status: 500, reason: "Missing Supabase service configuration." };
  }
  const response = await fetch(`${base.url}${path}`, {
    method: options.method || "GET",
    headers: {
      ...buildSupabaseKeyHeaders(base.serviceRoleKey, { contentType: "application/json" }),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: timeoutSignal(options.timeoutMs),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
      reason: payload?.message || payload?.hint || payload?.details || `Database request failed (${response.status}).`,
    };
  }
  return { ok: true, status: response.status, payload };
}

async function selectMany(table, query) {
  const result = await dbRequest(`/${table}?${query}`);
  if (!result.ok) return [];
  return Array.isArray(result.payload) ? result.payload : [];
}

async function insertRows(table, rows) {
  const result = await dbRequest(`/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: Array.isArray(rows) ? rows : [rows],
  });
  if (!result.ok) throw new Error(result.reason);
  return Array.isArray(result.payload) ? result.payload : [];
}

async function upsertRows(table, rows, conflictKey) {
  const result = await dbRequest(`/${table}?on_conflict=${encodeURIComponent(conflictKey)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: Array.isArray(rows) ? rows : [rows],
  });
  if (!result.ok) throw new Error(result.reason);
  return Array.isArray(result.payload) ? result.payload : [];
}

async function patchRows(table, query, patch) {
  const result = await dbRequest(`/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: patch,
  });
  if (!result.ok) return [];
  return Array.isArray(result.payload) ? result.payload : [];
}

module.exports = {
  filterValue,
  inFilter,
  insertRows,
  isPlainObject,
  isUuid,
  normalizeBoolean,
  normalizeId,
  normalizeString,
  patchRows,
  selectMany,
  upsertRows,
};
