const crypto = require("crypto");
const { readConfig } = require("./supabase-admin.js");

const SCHEDULE_DATABASE_SCHEMA = "footballscience-schedule-database-v1";
const SCHEDULE_SYNC_TABLE = "schedule_state_sync_events";
const SCHEDULE_SOURCE_KEY = "football-schedule-v1";
const SCHEDULE_WRITE_ROLES = new Set(["admin", "club-admin", "team-admin", "coach"]);
const SCHEDULE_DATABASE_MODE_VALUES = new Set(["database", "db", "postgres", "supabase", "dual-write", "dualwrite", "shadow"]);
const SCHEDULE_LEGACY_MODE_VALUES = new Set(["legacy", "storage", "app-state", "appstate", "local", "off", "false", "0"]);
const SCHEDULE_EVENT_TYPES = new Set(["state-snapshot", "event-saved", "event-removed", "events-imported"]);
const SCHEDULE_TYPES = new Set(["training", "match", "meeting", "travel", "recovery", "off"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
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

function canWriteScheduleDatabase(actor = {}) {
  return SCHEDULE_WRITE_ROLES.has(actorRole(actor));
}

function isScheduleDatabaseEnabled() {
  const mode = normalizeString(
    process.env.SCHEDULE_STORAGE_MODE || process.env.SCHEDULE_DATABASE_MODE || process.env.SCHEDULE_DUAL_WRITE_MODE,
    80
  ).toLowerCase();
  if (!mode) {
    return false;
  }
  if (SCHEDULE_LEGACY_MODE_VALUES.has(mode)) {
    return false;
  }
  if (SCHEDULE_DATABASE_MODE_VALUES.has(mode)) {
    return true;
  }
  return true;
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeJsonPayload(value = {}) {
  let payload = {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      payload = {};
    }
  } else {
    payload = value && typeof value === "object" ? value : {};
  }
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES) {
    const error = new Error("Schedule sync payload is too large.");
    error.status = 413;
    throw error;
  }

  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function parseSchedulePayload(rawValue) {
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return rawValue;
  }
  if (Array.isArray(rawValue)) {
    return { events: rawValue };
  }
  if (!rawValue || typeof rawValue !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return { events: parsed };
    }
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDate(value, fallback = "") {
  const dateValue = normalizeString(value || fallback, 20);
  if (!DATE_PATTERN.test(dateValue)) {
    return "";
  }
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? dateValue : "";
}

function normalizeScheduleType(value) {
  const type = normalizeString(value, 40).toLowerCase();
  return SCHEDULE_TYPES.has(type) ? type : "training";
}

function normalizeSourceKey(value) {
  const sourceKey = normalizeString(value || SCHEDULE_SOURCE_KEY, MAX_ID_LENGTH);
  return sourceKey || SCHEDULE_SOURCE_KEY;
}

function normalizeIdempotencyKey(value, fallback) {
  const explicit = normalizeString(value, MAX_ID_LENGTH);
  return explicit || normalizeString(fallback, MAX_ID_LENGTH);
}

function normalizeTenantIds(source = {}, options = {}) {
  const organizationId = normalizeString(options.organizationId || source.organizationId || source.organization_id, 80);
  const teamId = normalizeString(options.teamId || source.teamId || source.team_id, 80);
  const seasonId = normalizeString(options.seasonId || source.seasonId || source.season_id, 80);

  if (!isUuid(organizationId) || !isUuid(teamId)) {
    return { ok: false, status: 400, reason: "Schedule database sync requires organizationId and teamId." };
  }

  return { ok: true, organizationId, teamId, seasonId: isUuid(seasonId) ? seasonId : null };
}

function normalizeScheduleEventRows(rawValue, options = {}) {
  const source = parseSchedulePayload(rawValue);
  const tenant = normalizeTenantIds(source, options);
  if (!tenant.ok) {
    return tenant;
  }

  const fallbackDate = normalizeDate(options.selectedDate || source.selectedDate, normalizeDate(new Date().toISOString().slice(0, 10)));
  const events = Array.isArray(source.events) ? source.events : [];
  const rows = events
    .map((event = {}) => {
      const title = normalizeString(event.title, 180);
      const eventDate = normalizeDate(event.date, fallbackDate);
      if (!title || !eventDate) {
        return null;
      }

      const legacyEventId = normalizeString(event.id, MAX_ID_LENGTH);
      const legacyTime = normalizeString(event.time, 20);
      return {
        organization_id: tenant.organizationId,
        team_id: tenant.teamId,
        season_id: tenant.seasonId,
        legacy_event_id: legacyEventId || null,
        event_date: eventDate,
        starts_at: null,
        ends_at: null,
        type: normalizeScheduleType(event.type),
        title,
        note: normalizeString(event.note, 2000) || null,
        source: "legacy-app-state",
        metadata: {
          legacyId: legacyEventId || null,
          legacyTime: TIME_PATTERN.test(legacyTime) ? legacyTime : null,
        },
      };
    })
    .filter(Boolean);

  return { ok: true, rows, organizationId: tenant.organizationId, teamId: tenant.teamId, seasonId: tenant.seasonId };
}

function normalizeScheduleEventType(value) {
  const eventType = normalizeString(value, 80).toLowerCase();
  return SCHEDULE_EVENT_TYPES.has(eventType) ? eventType : "";
}

function normalizeSyncEventBody(body = {}, actor = {}) {
  const eventType = normalizeScheduleEventType(body.eventType || body.type || body.actionType || "state-snapshot");
  if (!eventType) {
    return { ok: false, status: 400, reason: "Unsupported schedule sync event type." };
  }

  const payload = normalizeJsonPayload(body.payload || body.data || body.state || {});
  const tenant = normalizeTenantIds({ ...payload, ...body });
  if (!tenant.ok) {
    return tenant;
  }

  const normalizedRows = normalizeScheduleEventRows(payload, tenant);
  const explicitCount = Number(body.eventCount ?? body.event_count);
  const eventCount = Number.isFinite(explicitCount) ? Math.max(0, explicitCount) : normalizedRows.ok ? normalizedRows.rows.length : 0;
  const payloadHash = sha256(
    stableJson({
      eventType,
      organizationId: tenant.organizationId,
      teamId: tenant.teamId,
      payload,
    })
  );

  return {
    ok: true,
    row: {
      organization_id: tenant.organizationId,
      team_id: tenant.teamId,
      source_key: normalizeSourceKey(body.sourceKey || body.source_key),
      event_type: eventType,
      event_count: eventCount,
      idempotency_key: normalizeIdempotencyKey(body.idempotencyKey || body.idempotency_key, `${eventType}:${tenant.teamId}:${payloadHash}`),
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
  return { url: `${url}/rest/v1`, serviceRoleKey };
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

async function insertScheduleSyncEvent(row) {
  const result = await dbRequest(`/${SCHEDULE_SYNC_TABLE}?on_conflict=source_key,idempotency_key`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: [row],
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload[0] || null : null;
}

function scheduleDatabaseStatus(actor = {}) {
  return {
    ok: true,
    schema: SCHEDULE_DATABASE_SCHEMA,
    mode: isScheduleDatabaseEnabled() ? "database" : "legacy",
    enabled: isScheduleDatabaseEnabled(),
    canWrite: canWriteScheduleDatabase(actor),
    table: SCHEDULE_SYNC_TABLE,
  };
}

async function recordScheduleStateSyncEvent(actor = {}, rawValue = {}, options = {}) {
  if (!canWriteScheduleDatabase(actor)) {
    return { ok: false, status: 403, reason: "Schedule database writes require coach or admin access." };
  }

  const normalized = normalizeSyncEventBody(
    {
      eventType: options.eventType || "state-snapshot",
      organizationId: options.organizationId,
      teamId: options.teamId,
      seasonId: options.seasonId,
      idempotencyKey: options.idempotencyKey,
      sourceKey: options.sourceKey,
      payload: rawValue,
    },
    actor
  );
  if (!normalized.ok) {
    return normalized;
  }

  if (!isScheduleDatabaseEnabled()) {
    return {
      ok: true,
      schema: SCHEDULE_DATABASE_SCHEMA,
      mode: "legacy",
      stored: false,
      enabled: false,
      reason: "Schedule database dual-write is not enabled.",
      payloadHash: normalized.row.payload_hash,
    };
  }

  const inserted = await insertScheduleSyncEvent(normalized.row);
  return {
    ok: true,
    schema: SCHEDULE_DATABASE_SCHEMA,
    mode: "database",
    stored: Boolean(inserted?.id),
    duplicate: !inserted?.id,
    eventId: inserted?.id || "",
    eventType: normalized.row.event_type,
    payloadHash: normalized.row.payload_hash,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  SCHEDULE_DATABASE_SCHEMA,
  SCHEDULE_SOURCE_KEY,
  SCHEDULE_SYNC_TABLE,
  canWriteScheduleDatabase,
  isScheduleDatabaseEnabled,
  normalizeScheduleEventRows,
  normalizeSyncEventBody,
  recordScheduleStateSyncEvent,
  scheduleDatabaseStatus,
  _private: {
    isUuid,
    normalizeDate,
    normalizeJsonPayload,
    parseSchedulePayload,
    stableJson,
  },
};
