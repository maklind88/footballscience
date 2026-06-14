const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;
const MAX_BODY_BYTES = 128 * 1024;

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeNote(value, maxLength = 1200) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function normalizeUuid(value) {
  const text = normalizeText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

function asLimit(value, fallback = DEFAULT_LIMIT) {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(limit, MAX_LIMIT);
}

function actorScope(actor = {}) {
  return {
    organizationId: normalizeText(actor.clubId || actor.organizationId || "club-ncc", 160),
    clubId: normalizeText(actor.clubId || actor.organizationId || "club-ncc", 160),
    teamId: normalizeText(actor.teamId || "team-ncc-first", 160),
    actorId: normalizeText(actor.id, 160),
  };
}

function restBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  return url && serviceRoleKey ? { url: `${url}/rest/v1`, serviceRoleKey } : null;
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
  if (!base) return { ok: false, status: 500, reason: "Missing Supabase database configuration." };
  const headers = {
    ...buildSupabaseKeyHeaders(base.serviceRoleKey, { contentType: "application/json" }),
    ...(options.headers || {}),
  };
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(`${base.url}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.error || `IDP database request failed (${response.status}).`,
      payload,
    };
  }
  return { ok: true, status: response.status, payload };
}

function paramsPath(table, params = new URLSearchParams()) {
  const query = params.toString();
  return `/${table}${query ? `?${query}` : ""}`;
}

function buildTeamParams(scope) {
  const params = new URLSearchParams();
  params.set("organization_id", `eq.${scope.organizationId}`);
  params.set("team_id", `eq.${scope.teamId}`);
  return params;
}

async function selectRows(table, params) {
  const result = await dbRequest(paramsPath(table, params));
  if (!result.ok) return result;
  return { ok: true, payload: Array.isArray(result.payload) ? result.payload : [] };
}

async function insertRow(table, row) {
  return dbRequest(paramsPath(table), { method: "POST", body: row, prefer: "return=representation" });
}

async function patchRows(table, params, row) {
  return dbRequest(paramsPath(table, params), { method: "PATCH", body: row, prefer: "return=representation" });
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_BODY_BYTES,
  asLimit,
  actorScope,
  buildTeamParams,
  insertRow,
  normalizeNote,
  normalizeText,
  normalizeUuid,
  paramsPath,
  patchRows,
  selectRows,
};
