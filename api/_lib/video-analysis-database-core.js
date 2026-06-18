const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;
const MAX_BODY_BYTES = 128 * 1024;
const OUTCOMES = new Set(["Positive", "Development", "Neutral"]);
const PLAYER_ROLES = new Set(["primary", "secondary", "supporting", "unit"]);
const CODING_MODES = new Set(["manual", "instant"]);
const DESCRIPTOR_TYPES = new Set(["player", "unit", "pitch_zone", "pressure", "decision", "execution", "custom"]);
const LABEL_TYPES = new Set(["phase", "sub_phase", "team_principle", "mini_game_principle", "outcome", "descriptor", "custom"]);
const FORBIDDEN_VIDEO_KEYS = new Set(
  "absolutepath base64 blob bytes data dataurl file filecontent filepath fullpath localpath path rawvideo sourceurl videoblob videobytes videodata videofile videopath"
    .split(" ")
);

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeNote(value, maxLength = 4000) {
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

function asOffset(value, fallback = 0) {
  const offset = Math.floor(Number(value));
  if (!Number.isFinite(offset) || offset <= 0) return fallback;
  return Math.min(offset, 10000);
}

function asMs(value, fallback = 0) {
  const ms = Math.round(Number(value));
  return Number.isFinite(ms) && ms >= 0 ? ms : fallback;
}

function normalizeOutcome(value) {
  const outcome = normalizeText(value, 40);
  return OUTCOMES.has(outcome) ? outcome : "Neutral";
}

function normalizePlayerRole(value) {
  const role = normalizeText(value, 40).toLowerCase();
  return PLAYER_ROLES.has(role) ? role : "primary";
}

function normalizeCodingMode(value) {
  const mode = normalizeText(value, 40).toLowerCase();
  return CODING_MODES.has(mode) ? mode : "manual";
}

function normalizeDescriptorType(value) {
  const type = normalizeText(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  return DESCRIPTOR_TYPES.has(type) ? type : "custom";
}

function normalizeLabelType(value) {
  const type = normalizeText(value, 60).toLowerCase().replace(/[\s-]+/g, "_");
  return LABEL_TYPES.has(type) ? type : "custom";
}

function actorScope(actor = {}) {
  return {
    organizationId: normalizeText(actor.clubId || actor.organizationId || "club-ncc", 160),
    teamId: normalizeText(actor.teamId || "team-ncc-first", 160),
    actorId: normalizeText(actor.id, 160),
  };
}

function isLikelyLocalPath(value = "") {
  const text = String(value || "").trim();
  return (
    /^file:\/\//i.test(text) ||
    /^~\//.test(text) ||
    /^\/(?:Users|home|var|Volumes|private|tmp)\//.test(text) ||
    /^[A-Za-z]:\\/.test(text) ||
    /^data:video\//i.test(text)
  );
}

function containsForbiddenVideoPayload(value, path = []) {
  if (value == null) return null;
  if (typeof value === "string") {
    return isLikelyLocalPath(value) ? { path, reason: "local_video_path_or_inline_video" } : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = containsForbiddenVideoPayload(value[index], [...path, String(index)]);
      if (match) return match;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_VIDEO_KEYS.has(key.toLowerCase())) return { path: [...path, key], reason: "forbidden_video_payload_key" };
    const match = containsForbiddenVideoPayload(child, [...path, key]);
    if (match) return match;
  }
  return null;
}

function rejectForbiddenPayload(payload = {}) {
  const match = containsForbiddenVideoPayload(payload);
  if (!match) return;
  const error = new Error("Video files and local file paths must not be sent to Football Science.");
  error.status = 400;
  error.details = match;
  throw error;
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
      reason: payload?.message || payload?.error || `Video Analysis database request failed (${response.status}).`,
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

async function deleteRows(table, params) {
  return dbRequest(paramsPath(table, params), { method: "DELETE" });
}

module.exports = {
  DEFAULT_LIMIT,
  DESCRIPTOR_TYPES,
  LABEL_TYPES,
  MAX_BODY_BYTES,
  OUTCOMES,
  asLimit,
  asOffset,
  asMs,
  actorScope,
  buildTeamParams,
  containsForbiddenVideoPayload,
  dbRequest,
  deleteRows,
  insertRow,
  normalizeCodingMode,
  normalizeDescriptorType,
  normalizeLabelType,
  normalizeNote,
  normalizeOutcome,
  normalizePlayerRole,
  normalizeText,
  normalizeUuid,
  paramsPath,
  patchRows,
  rejectForbiddenPayload,
  selectRows,
};
