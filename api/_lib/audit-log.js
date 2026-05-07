const { readConfig } = require("./supabase-admin.js");

const AUDIT_BUCKET = "footballscience-app-state";
const AUDIT_PREFIX = "global";
const AUDIT_KEY = "football-platform-audit-log-v1";
const AUDIT_SCHEMA = "footballscience-audit-log-v1";
const MAX_AUDIT_ENTRIES = 200;
const MAX_STRING_LENGTH = 240;
const REDACTED_DETAIL_KEYS = new Set([
  "password",
  "passwordConfirm",
  "generatedPassword",
  "access_token",
  "refresh_token",
  "token",
  "serviceRoleKey",
  "secret",
]);

function getStorageBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: `${url}/storage/v1`,
    serviceRoleKey,
  };
}

function storageHeaders(serviceRoleKey, contentType = "application/json") {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function parseResponseBody(response, raw = false) {
  const text = await response.text();
  if (raw) {
    return text;
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function storageRequest(path, options = {}) {
  const storage = getStorageBaseUrl();
  if (!storage) {
    return { ok: false, reason: "Missing Supabase server configuration." };
  }

  const response = await fetch(`${storage.url}${path}`, {
    ...options,
    headers: {
      ...storageHeaders(storage.serviceRoleKey, options.contentType),
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return { ok: false, status: 404, payload: {} };
  }

  const payload = await parseResponseBody(response, Boolean(options.raw));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
      reason: payload?.error || payload?.message || payload?.msg || `Storage request failed (${response.status}).`,
    };
  }

  return { ok: true, status: response.status, payload };
}

async function ensureAuditBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(AUDIT_BUCKET)}`, { method: "GET" });
  if (existing.ok) {
    return true;
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: AUDIT_BUCKET,
      name: AUDIT_BUCKET,
      public: false,
    }),
  });

  return created.ok || created.status === 409 || String(created.reason || "").toLowerCase().includes("already");
}

function auditObjectPath() {
  return `${AUDIT_PREFIX}/${encodeURIComponent(AUDIT_KEY)}.json`;
}

function normalizeAuditString(value, fallback = "") {
  return String(value || fallback).trim().slice(0, MAX_STRING_LENGTH);
}

function sanitizeAuditDetails(value, depth = 0) {
  if (depth > 3) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeAuditDetails(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((sanitized, [key, item]) => {
      const normalizedKey = String(key || "");
      if (REDACTED_DETAIL_KEYS.has(normalizedKey)) {
        sanitized[normalizedKey] = "[redacted]";
        return sanitized;
      }

      sanitized[normalizedKey] = sanitizeAuditDetails(item, depth + 1);
      return sanitized;
    }, {});
  }

  if (typeof value === "string") {
    return normalizeAuditString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  return null;
}

function normalizeAuditActor(actor = {}) {
  return {
    id: normalizeAuditString(actor.id),
    email: normalizeAuditString(actor.email).toLowerCase(),
    name: normalizeAuditString(`${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email),
    role: normalizeAuditString(actor.role || "unknown"),
  };
}

function normalizeAuditTarget(target = {}) {
  return {
    id: normalizeAuditString(target.id),
    email: normalizeAuditString(target.email).toLowerCase(),
    name: normalizeAuditString(`${target.firstName || ""} ${target.lastName || ""}`.trim() || target.username || target.email),
    role: normalizeAuditString(target.role || ""),
  };
}

function normalizeAuditEntry(actor, event = {}) {
  const timestamp = new Date().toISOString();
  const action = normalizeAuditString(event.action || "system.event", "system.event");

  return {
    id: `${timestamp}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: timestamp,
    action,
    summary: normalizeAuditString(event.summary || action, action),
    actor: normalizeAuditActor(actor),
    target: normalizeAuditTarget(event.target || event.targetUser || {}),
    details: sanitizeAuditDetails(event.details || {}),
  };
}

async function readAuditStateObject() {
  const result = await storageRequest(`/object/${encodeURIComponent(AUDIT_BUCKET)}/${auditObjectPath()}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });

  if (!result.ok) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.payload);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseAuditLogFromStateObject(stateObject) {
  if (!stateObject?.value) {
    return { schema: AUDIT_SCHEMA, entries: [] };
  }

  try {
    const parsed = JSON.parse(String(stateObject.value || ""));
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return {
      schema: AUDIT_SCHEMA,
      entries: entries.slice(0, MAX_AUDIT_ENTRIES),
    };
  } catch {
    return { schema: AUDIT_SCHEMA, entries: [] };
  }
}

async function readAuditLog(limit = MAX_AUDIT_ENTRIES) {
  const stateObject = await readAuditStateObject();
  const auditLog = parseAuditLogFromStateObject(stateObject);
  const safeLimit = Math.max(1, Math.min(MAX_AUDIT_ENTRIES, Number(limit) || MAX_AUDIT_ENTRIES));
  return {
    schema: AUDIT_SCHEMA,
    entries: auditLog.entries.slice(0, safeLimit),
  };
}

async function writeAuditLog(auditLog, actor) {
  const entry = {
    schema: "footballscience-app-state-v1",
    key: AUDIT_KEY,
    value: JSON.stringify({
      schema: AUDIT_SCHEMA,
      entries: Array.isArray(auditLog?.entries) ? auditLog.entries.slice(0, MAX_AUDIT_ENTRIES) : [],
    }),
    removed: false,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "",
  };

  const result = await storageRequest(`/object/${encodeURIComponent(AUDIT_BUCKET)}/${auditObjectPath()}`, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  if (result.ok || result.status !== 404) {
    return result.ok;
  }

  const fallback = await storageRequest(`/object/${encodeURIComponent(AUDIT_BUCKET)}/${auditObjectPath()}`, {
    method: "POST",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  return fallback.ok;
}

async function appendAuditLog(actor, event = {}) {
  try {
    const bucketReady = await ensureAuditBucket();
    if (!bucketReady) {
      return false;
    }

    const currentLog = await readAuditLog(MAX_AUDIT_ENTRIES);
    const nextEntry = normalizeAuditEntry(actor, event);
    return writeAuditLog(
      {
        schema: AUDIT_SCHEMA,
        entries: [nextEntry, ...currentLog.entries].slice(0, MAX_AUDIT_ENTRIES),
      },
      actor
    );
  } catch {
    return false;
  }
}

module.exports = {
  AUDIT_KEY,
  readAuditLog,
  appendAuditLog,
};
