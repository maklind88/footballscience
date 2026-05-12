const crypto = require("crypto");
const { parseJsonBody, readConfig, sendJson } = require("./supabase-admin.js");
const { appendAuditLog } = require("./audit-log.js");

const MEDICAL_DATABASE_SCHEMA = "footballscience-medical-database-v1";
const MEDICAL_SYNC_TABLE = "medical_state_sync_events";
const MEDICAL_SOURCE_KEY = "football-medical-team-v1";
const MEDICAL_WRITE_ROLES = new Set(["admin", "club-admin", "team-admin", "medical", "performance"]);
const MEDICAL_DATABASE_MODE_VALUES = new Set([
  "database",
  "db",
  "postgres",
  "supabase",
  "dual-write",
  "dualwrite",
  "shadow",
]);
const MEDICAL_LEGACY_MODE_VALUES = new Set(["legacy", "storage", "app-state", "appstate", "local", "off", "false", "0"]);
const MEDICAL_EVENT_TYPES = new Set([
  "state-snapshot",
  "recommendation-saved",
  "bulk-recommendation-saved",
  "availability-plan-created",
  "availability-plan-deleted",
  "clearance-saved",
  "governance-saved",
  "player-profile-saved",
  "players-imported",
  "player-added",
  "player-removed",
  "record-deleted",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 240;
const MAX_ID_LENGTH = 160;
const MAX_PAYLOAD_BYTES = 180 * 1024;

function normalizeString(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function actorRole(actor = {}) {
  return normalizeString(actor.role || "unknown", 40).toLowerCase();
}

function canWriteMedicalDatabase(actor = {}) {
  return MEDICAL_WRITE_ROLES.has(actorRole(actor));
}

function isMedicalDatabaseEnabled() {
  const mode = normalizeString(
    process.env.MEDICAL_STORAGE_MODE || process.env.MEDICAL_DATABASE_MODE || process.env.MEDICAL_DUAL_WRITE_MODE,
    80
  ).toLowerCase();
  if (!mode) {
    return false;
  }
  if (MEDICAL_LEGACY_MODE_VALUES.has(mode)) {
    return false;
  }
  if (MEDICAL_DATABASE_MODE_VALUES.has(mode)) {
    return true;
  }
  return true;
}

function normalizeEventType(value) {
  const eventType = normalizeString(value, 80).toLowerCase();
  return MEDICAL_EVENT_TYPES.has(eventType) ? eventType : "";
}

function normalizeSourceKey(value) {
  const sourceKey = normalizeString(value || MEDICAL_SOURCE_KEY, MAX_ID_LENGTH);
  return sourceKey || MEDICAL_SOURCE_KEY;
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeJsonPayload(value = {}) {
  const payload = value && typeof value === "object" ? value : {};
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES) {
    const error = new Error("Medical sync payload is too large.");
    error.status = 413;
    throw error;
  }

  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeIdempotencyKey(value, fallback) {
  const explicit = normalizeString(value, MAX_ID_LENGTH);
  return explicit || normalizeString(fallback, MAX_ID_LENGTH);
}

function normalizeSyncEventBody(body = {}, actor = {}) {
  const eventType = normalizeEventType(body.eventType || body.type || body.actionType);
  if (!eventType) {
    return { ok: false, status: 400, reason: "Unsupported medical sync event type." };
  }

  const payload = normalizeJsonPayload(body.payload || body.data || {});
  const stablePayload = stableJson({
    eventType,
    legacyPlayerId: body.legacyPlayerId || body.playerId || payload.playerId || "",
    payload,
  });
  const payloadHash = sha256(stablePayload);
  const legacyPlayerId = normalizeString(body.legacyPlayerId || body.playerId || payload.playerId || "", MAX_ID_LENGTH);

  return {
    ok: true,
    row: {
      organization_id: isUuid(body.organizationId || body.organization_id) ? String(body.organizationId || body.organization_id) : null,
      team_id: isUuid(body.teamId || body.team_id) ? String(body.teamId || body.team_id) : null,
      source_key: normalizeSourceKey(body.sourceKey || body.source_key),
      event_type: eventType,
      legacy_player_id: legacyPlayerId || null,
      idempotency_key: normalizeIdempotencyKey(body.idempotencyKey || body.idempotency_key, `${eventType}:${payloadHash}`),
      payload,
      payload_hash: payloadHash,
      actor_id: isUuid(actor.id) ? actor.id : null,
    },
    payloadBytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
  };
}

function restBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: `${url}/rest/v1`,
    serviceRoleKey,
  };
}

function restHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
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

async function dbRequest(path, options = {}) {
  const base = restBaseUrl();
  if (!base) {
    return { ok: false, status: 500, reason: "Missing Supabase database configuration." };
  }

  const response = await fetch(`${base.url}${path}`, {
    method: options.method || "GET",
    headers: restHeaders(base.serviceRoleKey, options.headers || {}),
    body: options.body ? JSON.stringify(options.body) : undefined,
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

async function insertMedicalSyncEvent(row) {
  const result = await dbRequest(`/${MEDICAL_SYNC_TABLE}?on_conflict=source_key,idempotency_key`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: [row],
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }

  return Array.isArray(result.payload) ? result.payload[0] || null : null;
}

function medicalDatabaseStatus(actor = {}) {
  return {
    ok: true,
    schema: MEDICAL_DATABASE_SCHEMA,
    mode: isMedicalDatabaseEnabled() ? "database" : "legacy",
    enabled: isMedicalDatabaseEnabled(),
    canWrite: canWriteMedicalDatabase(actor),
    table: MEDICAL_SYNC_TABLE,
  };
}

async function handleMedicalPost(req, res, actor) {
  if (!canWriteMedicalDatabase(actor)) {
    return sendJson(res, 403, { ok: false, reason: "Medical database writes require medical, performance, or admin access." });
  }

  const body = await parseJsonBody(req);
  const action = normalizeString(body?.action || "recordSyncEvent", 60);
  if (!["recordSyncEvent", "syncState"].includes(action)) {
    return sendJson(res, 400, { ok: false, reason: "Unsupported medical action." });
  }

  const normalized = normalizeSyncEventBody(body, actor);
  if (!normalized.ok) {
    return sendJson(res, normalized.status || 400, normalized);
  }

  if (!isMedicalDatabaseEnabled()) {
    return sendJson(res, 200, {
      ok: true,
      schema: MEDICAL_DATABASE_SCHEMA,
      mode: "legacy",
      stored: false,
      enabled: false,
      reason: "Medical database dual-write is not enabled.",
      payloadHash: normalized.row.payload_hash,
    });
  }

  const inserted = await insertMedicalSyncEvent(normalized.row);
  await appendAuditLog(actor, {
    action: "medical.database.sync.queued",
    summary: "Queued medical database sync event",
    details: {
      eventType: normalized.row.event_type,
      legacyPlayerId: normalized.row.legacy_player_id || "",
      payloadHash: normalized.row.payload_hash,
      payloadBytes: normalized.payloadBytes,
      stored: Boolean(inserted?.id),
    },
  });

  return sendJson(res, 200, {
    ok: true,
    schema: MEDICAL_DATABASE_SCHEMA,
    mode: "database",
    stored: Boolean(inserted?.id),
    duplicate: !inserted?.id,
    eventId: inserted?.id || "",
    eventType: normalized.row.event_type,
    payloadHash: normalized.row.payload_hash,
    updatedAt: new Date().toISOString(),
  });
}

async function handleMedicalDatabaseRequest(req, res, actor) {
  if (req.method === "GET") {
    return sendJson(res, 200, medicalDatabaseStatus(actor));
  }

  if (req.method === "POST") {
    return handleMedicalPost(req, res, actor);
  }

  return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
}

module.exports = {
  MEDICAL_DATABASE_SCHEMA,
  MEDICAL_SYNC_TABLE,
  canWriteMedicalDatabase,
  handleMedicalDatabaseRequest,
  isMedicalDatabaseEnabled,
  normalizeSyncEventBody,
  _private: {
    isUuid,
    normalizeEventType,
    normalizeJsonPayload,
    stableJson,
  },
};
