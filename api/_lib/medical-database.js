const crypto = require("crypto");
const { parseJsonBody, readConfig, sendJson, buildSupabaseKeyHeaders } = require("./supabase-admin.js");
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
  "availability-plan-updated",
  "availability-plan-archived",
  "availability-plan-deleted",
  "medical-board-updated",
  "clearance-saved",
  "governance-saved",
  "player-profile-saved",
  "players-imported",
  "player-added",
  "player-archived",
  "player-removed",
  "record-archived",
  "record-deleted",
]);
const MEDICAL_PROJECTED_EVENT_TYPES = new Set([
  "recommendation-saved",
  "bulk-recommendation-saved",
  "record-archived",
  "availability-plan-created",
  "availability-plan-updated",
  "availability-plan-archived",
  "availability-plan-deleted",
  "clearance-saved",
  "medical-board-updated",
]);
const MEDICAL_PARTICIPATION_OPTIONS = new Set([0, 10, 25, 50, 75, 100]);
const BLOCKED_CONTENT_PATTERNS = [
  { pattern: /<\s*script\b/i, label: "script tags" },
  { pattern: /<\s*iframe\b/i, label: "iframe tags" },
  { pattern: /<\s*object\b/i, label: "object tags" },
  { pattern: /<\s*embed\b/i, label: "embed tags" },
  { pattern: /\bon[a-z]+\s*=/i, label: "inline event handlers" },
  { pattern: /javascript\s*:/i, label: "javascript URLs" },
];
const BLOCKED_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 240;
const MAX_ID_LENGTH = 160;
const MAX_PAYLOAD_BYTES = 180 * 1024;
const MAX_CONTENT_DEPTH = 80;
const MAX_BULK_RECOMMENDATIONS = 120;

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

function validateJsonContent(value, pathLabel = "payload", depth = 0) {
  if (depth > MAX_CONTENT_DEPTH) {
    return `${pathLabel} is too deeply nested.`;
  }
  if (typeof value === "string") {
    const blockedPattern = BLOCKED_CONTENT_PATTERNS.find((entry) => entry.pattern.test(value));
    return blockedPattern ? `${pathLabel} contains blocked executable content (${blockedPattern.label}).` : "";
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = validateJsonContent(value[index], `${pathLabel}[${index}]`, depth + 1);
      if (issue) return issue;
    }
    return "";
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (BLOCKED_JSON_KEYS.has(key)) {
      return `${pathLabel}.${key} is not allowed in central state.`;
    }
    const issue = validateJsonContent(nestedValue, `${pathLabel}.${key}`, depth + 1);
    if (issue) return issue;
  }
  return "";
}

function isDateValue(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function isTimestampValue(value) {
  const text = String(value || "").trim();
  return Boolean(text) && Number.isFinite(Date.parse(text));
}

function validateRecommendationRecord(record, pathLabel = "payload.record") {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return `${pathLabel} must be an object.`;
  }
  const recordId = String(record.id || "").trim();
  const playerId = String(record.playerId || "").trim();
  if (!recordId || recordId.length > 180) return `${pathLabel}.id is invalid.`;
  if (!playerId || playerId.length > 180) return `${pathLabel}.playerId is invalid.`;
  if (!isDateValue(record.date)) return `${pathLabel}.date must use a valid YYYY-MM-DD value.`;
  if (!MEDICAL_PARTICIPATION_OPTIONS.has(Number(record.participation))) {
    return `${pathLabel}.participation is unsupported.`;
  }
  return "";
}

function validateAvailabilityPlan(plan, pathLabel = "payload.plan", { requireArchivedAt = false } = {}) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return `${pathLabel} must be an object.`;
  }
  const planId = String(plan.id || "").trim();
  const playerId = String(plan.playerId || "").trim();
  if (!planId || planId.length > 180) return `${pathLabel}.id is invalid.`;
  if (!playerId || playerId.length > 180) return `${pathLabel}.playerId is invalid.`;
  if (!isDateValue(plan.startDate) || !isDateValue(plan.endDate) || plan.endDate < plan.startDate) {
    return `${pathLabel} date range is invalid.`;
  }
  if (!MEDICAL_PARTICIPATION_OPTIONS.has(Number(plan.participation))) {
    return `${pathLabel}.participation is unsupported.`;
  }
  if (plan.updatedAt && !isTimestampValue(plan.updatedAt)) return `${pathLabel}.updatedAt is invalid.`;
  if (requireArchivedAt && !isTimestampValue(plan.archivedAt || plan.deletedAt)) {
    return `${pathLabel}.archivedAt is invalid.`;
  }
  return "";
}

function validateProjectedMedicalEvent(row = {}) {
  if (!MEDICAL_PROJECTED_EVENT_TYPES.has(row.event_type)) {
    return { ok: true, projected: false };
  }
  if (row.source_key !== MEDICAL_SOURCE_KEY) {
    return { ok: false, status: 400, reason: "Medical recommendations must target the canonical Medical Room state." };
  }
  const contentIssue = validateJsonContent(row.payload);
  if (contentIssue) {
    return { ok: false, status: 400, reason: contentIssue };
  }
  if (row.event_type === "recommendation-saved") {
    const issue = validateRecommendationRecord(row.payload?.record);
    return issue ? { ok: false, status: 400, reason: issue } : { ok: true, projected: true };
  }
  if (row.event_type === "bulk-recommendation-saved") {
    const records = row.payload?.records;
    if (!Array.isArray(records) || !records.length || records.length > MAX_BULK_RECOMMENDATIONS) {
      return { ok: false, status: 400, reason: "Bulk medical recommendations must include 1 to 120 records." };
    }
    for (let index = 0; index < records.length; index += 1) {
      const issue = validateRecommendationRecord(records[index], `payload.records[${index}]`);
      if (issue) return { ok: false, status: 400, reason: issue };
    }
    return { ok: true, projected: true };
  }
  if ([
    "availability-plan-created",
    "availability-plan-updated",
    "clearance-saved",
    "medical-board-updated",
  ].includes(row.event_type)) {
    const issue = validateAvailabilityPlan(row.payload?.plan);
    return issue ? { ok: false, status: 400, reason: issue } : { ok: true, projected: true };
  }
  if (["availability-plan-archived", "availability-plan-deleted"].includes(row.event_type)) {
    const issue = validateAvailabilityPlan(row.payload?.plan, "payload.plan", { requireArchivedAt: true });
    return issue ? { ok: false, status: 400, reason: issue } : { ok: true, projected: true };
  }
  const recordId = String(row.payload?.recordId || row.payload?.record?.id || "").trim();
  const archivedAt = row.payload?.archivedAt || row.payload?.record?.archivedAt;
  if (!recordId || recordId.length > 180 || !isTimestampValue(archivedAt)) {
    return { ok: false, status: 400, reason: "Medical recommendation archive data is invalid." };
  }
  return { ok: true, projected: true };
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
    ...buildSupabaseKeyHeaders(serviceRoleKey, { contentType: "application/json" }),
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

async function findMedicalSyncEvent(sourceKey, idempotencyKey) {
  const params = new URLSearchParams({
    select: "id,event_type,processing_status,payload_hash,created_at",
    source_key: `eq.${sourceKey}`,
    idempotency_key: `eq.${idempotencyKey}`,
    limit: "1",
  });
  const result = await dbRequest(`/${MEDICAL_SYNC_TABLE}?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload[0] || null : null;
}

async function projectMedicalSyncEvents(eventIds = []) {
  const ids = eventIds.filter(isUuid);
  if (!ids.length) {
    return { ok: false, status: 400, reason: "Medical sync event id is invalid.", canonicalStored: false };
  }
  const result = await dbRequest("/rpc/project_medical_state_sync_events", {
    method: "POST",
    body: { p_event_ids: ids },
  });
  if (!result.ok) {
    return { ...result, canonicalStored: false };
  }
  const projection = Array.isArray(result.payload) ? result.payload[0] || {} : result.payload || {};
  return {
    ok: true,
    status: result.status,
    canonicalStored: projection.canonical_stored === true,
    processedCount: Number(projection.processed_count) || 0,
    failedCount: Number(projection.failed_count) || 0,
    revision: Number(projection.revision) || 0,
  };
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
  const projectionValidation = validateProjectedMedicalEvent(normalized.row);
  if (!projectionValidation.ok) {
    return sendJson(res, projectionValidation.status || 400, projectionValidation);
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
  const duplicate = !inserted?.id;
  const syncEvent = inserted || await findMedicalSyncEvent(normalized.row.source_key, normalized.row.idempotency_key);
  if (!syncEvent?.id) {
    return sendJson(res, 503, {
      ok: false,
      schema: MEDICAL_DATABASE_SCHEMA,
      mode: "database",
      stored: false,
      canonicalStored: false,
      reason: "Medical data could not be confirmed in the recovery journal.",
    });
  }
  if (syncEvent.payload_hash !== normalized.row.payload_hash) {
    return sendJson(res, 409, {
      ok: false,
      schema: MEDICAL_DATABASE_SCHEMA,
      mode: "database",
      stored: true,
      canonicalStored: false,
      duplicate: true,
      eventId: syncEvent.id,
      reason: "Medical sync idempotency key already belongs to different content.",
    });
  }

  const projection = projectionValidation.projected
    ? await projectMedicalSyncEvents([syncEvent.id])
    : null;
  await appendAuditLog(actor, {
    action: projectionValidation.projected
      ? projection?.canonicalStored
        ? "medical.database.sync.projected"
        : "medical.database.sync.projection_failed"
      : "medical.database.sync.queued",
    summary: projectionValidation.projected
      ? projection?.canonicalStored
        ? "Saved medical event to canonical state"
        : "Medical canonical state confirmation failed"
      : "Queued medical database sync event",
    details: {
      eventType: normalized.row.event_type,
      legacyPlayerId: normalized.row.legacy_player_id || "",
      payloadHash: normalized.row.payload_hash,
      payloadBytes: normalized.payloadBytes,
      stored: true,
      canonicalStored: projection?.canonicalStored ?? null,
      revision: projection?.revision || 0,
    },
  });

  if (projectionValidation.projected && !projection?.canonicalStored) {
    return sendJson(res, 503, {
      ok: false,
      schema: MEDICAL_DATABASE_SCHEMA,
      mode: "database",
      stored: true,
      canonicalStored: false,
      duplicate,
      eventId: syncEvent.id,
      eventType: normalized.row.event_type,
      processingStatus: projection?.failedCount ? "failed" : syncEvent.processing_status || "pending",
      payloadHash: normalized.row.payload_hash,
      reason: projection?.reason || "Medical data reached the recovery journal but canonical save confirmation failed.",
    });
  }

  return sendJson(res, 200, {
    ok: true,
    schema: MEDICAL_DATABASE_SCHEMA,
    mode: "database",
    stored: true,
    enabled: true,
    canonicalStored: projection?.canonicalStored ?? null,
    revision: projection?.revision || 0,
    processingStatus: projectionValidation.projected ? "processed" : syncEvent.processing_status || "pending",
    duplicate,
    eventId: syncEvent.id,
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
    findMedicalSyncEvent,
    handleMedicalPost,
    isUuid,
    normalizeEventType,
    normalizeJsonPayload,
    projectMedicalSyncEvents,
    stableJson,
    validateJsonContent,
    validateProjectedMedicalEvent,
    validateRecommendationRecord,
  },
};
