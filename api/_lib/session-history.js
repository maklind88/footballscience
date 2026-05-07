const { readConfig } = require("./supabase-admin.js");

const STATE_BUCKET = "footballscience-app-state";
const STATE_PREFIX = "global";
const SESSION_PLANNER_KEY = "football-session-planner-v3";
const SESSION_HISTORY_KEY = "football-session-planner-history-v1";
const SESSION_HISTORY_SCHEMA = "footballscience-session-history-v1";
const MAX_SESSION_HISTORY_ENTRIES = 160;
const MAX_SESSION_HISTORY_VALUE_BYTES = 9 * 1024 * 1024;
const SESSION_HISTORY_BURST_WINDOW_MS = 5 * 60 * 1000;

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

async function ensureStateBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(STATE_BUCKET)}`, { method: "GET" });
  if (existing.ok) {
    return true;
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: STATE_BUCKET,
      name: STATE_BUCKET,
      public: false,
    }),
  });

  return created.ok || created.status === 409 || String(created.reason || "").toLowerCase().includes("already");
}

function objectPathForKey(key) {
  return `${STATE_PREFIX}/${encodeURIComponent(key)}.json`;
}

async function readStateObject(key) {
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(key)}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });

  if (!result.ok) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.payload);
    return parsed?.key ? parsed : null;
  } catch {
    return null;
  }
}

async function writeStateObject(entry) {
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(entry.key)}`, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  if (result.ok || result.status !== 404) {
    return result;
  }

  return storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(entry.key)}`, {
    method: "POST",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function parseSessionPlannerState(rawValue) {
  const parsed = parseJson(rawValue, null);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? {
        ...parsed,
        sessions: parsed.sessions && typeof parsed.sessions === "object" && !Array.isArray(parsed.sessions)
          ? parsed.sessions
          : {},
      }
    : { selectedDate: "", sessions: {} };
}

function getSessionKey(dateValue, session = {}) {
  return String(session?.date || dateValue || "").trim();
}

function cloneJson(value) {
  return parseJson(JSON.stringify(value ?? null), value ?? null);
}

function normalizeHistoryString(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 240);
}

function normalizeHistoryActor(actor = {}) {
  return {
    id: normalizeHistoryString(actor.id),
    email: normalizeHistoryString(actor.email).toLowerCase(),
    name: normalizeHistoryString(`${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email),
    role: normalizeHistoryString(actor.role || "unknown"),
  };
}

function getSessionBlockCount(session) {
  return Array.isArray(session?.blocks) ? session.blocks.length : 0;
}

function getSessionTitle(session = {}, dateValue = "") {
  return normalizeHistoryString(session.title || `Session ${dateValue}`, `Session ${dateValue}`);
}

function getSessionChangeAction(beforeSession, afterSession, reason = "") {
  if (reason === "restore") {
    return "session.restored";
  }

  if (!beforeSession && afterSession) {
    return "session.created";
  }

  if (beforeSession && !afterSession) {
    return "session.removed";
  }

  const beforeCount = getSessionBlockCount(beforeSession);
  const afterCount = getSessionBlockCount(afterSession);
  if (afterCount < beforeCount) {
    return "session.blocks_reduced";
  }
  if (afterCount > beforeCount) {
    return "session.blocks_added";
  }
  return "session.updated";
}

function getSessionHistorySummary(dateValue, beforeSession, afterSession, action) {
  const title = getSessionTitle(afterSession || beforeSession, dateValue);
  const beforeCount = getSessionBlockCount(beforeSession);
  const afterCount = getSessionBlockCount(afterSession);
  if (action === "session.restored") {
    return `Restored ${title} on ${dateValue}`;
  }
  if (action === "session.blocks_reduced") {
    return `${title} changed from ${beforeCount} to ${afterCount} blocks`;
  }
  if (action === "session.blocks_added") {
    return `${title} changed from ${beforeCount} to ${afterCount} blocks`;
  }
  if (action === "session.created") {
    return `Created ${title} on ${dateValue}`;
  }
  return `Updated ${title} on ${dateValue}`;
}

function sessionsAreEqual(beforeSession, afterSession) {
  return JSON.stringify(beforeSession || null) === JSON.stringify(afterSession || null);
}

function parseHistoryLogFromEntry(entry) {
  const parsed = parseJson(entry?.value, null);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  return {
    schema: SESSION_HISTORY_SCHEMA,
    entries: entries.slice(0, MAX_SESSION_HISTORY_ENTRIES),
  };
}

async function readSessionHistoryLog(limit = MAX_SESSION_HISTORY_ENTRIES) {
  const stateObject = await readStateObject(SESSION_HISTORY_KEY);
  const historyLog = parseHistoryLogFromEntry(stateObject);
  const safeLimit = Math.max(1, Math.min(MAX_SESSION_HISTORY_ENTRIES, Number(limit) || MAX_SESSION_HISTORY_ENTRIES));
  return {
    schema: SESSION_HISTORY_SCHEMA,
    entries: historyLog.entries.slice(0, safeLimit),
  };
}

function trimHistoryEntriesToSize(entries) {
  let trimmedEntries = entries.slice(0, MAX_SESSION_HISTORY_ENTRIES);
  while (trimmedEntries.length > 1) {
    const value = JSON.stringify({ schema: SESSION_HISTORY_SCHEMA, entries: trimmedEntries });
    if (Buffer.byteLength(value, "utf8") <= MAX_SESSION_HISTORY_VALUE_BYTES) {
      return trimmedEntries;
    }
    trimmedEntries = trimmedEntries.slice(0, -1);
  }
  return trimmedEntries;
}

async function writeSessionHistoryLog(historyLog, actor) {
  const entries = trimHistoryEntriesToSize(Array.isArray(historyLog?.entries) ? historyLog.entries : []);
  const entry = {
    schema: "footballscience-app-state-v1",
    key: SESSION_HISTORY_KEY,
    value: JSON.stringify({
      schema: SESSION_HISTORY_SCHEMA,
      entries,
    }),
    removed: false,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "",
  };

  return writeStateObject(entry);
}

function findEditableBurstEntry(entries, actor, dateValue, action) {
  if (action === "session.restored") {
    return -1;
  }

  const now = Date.now();
  return entries.findIndex((entry) => {
    const createdAt = new Date(entry?.createdAt || 0).getTime();
    return (
      entry?.date === dateValue &&
      entry?.actor?.id === actor?.id &&
      entry?.action !== "session.restored" &&
      Number.isFinite(createdAt) &&
      now - createdAt <= SESSION_HISTORY_BURST_WINDOW_MS
    );
  });
}

function createSessionHistoryEntry(actor, dateValue, beforeSession, afterSession, options = {}) {
  const now = new Date().toISOString();
  const action = getSessionChangeAction(beforeSession, afterSession, options.reason);
  const beforeBlockCount = getSessionBlockCount(beforeSession);
  const afterBlockCount = getSessionBlockCount(afterSession);

  return {
    id: `${now}-${dateValue}-${Math.random().toString(16).slice(2, 10)}`,
    schema: SESSION_HISTORY_SCHEMA,
    date: dateValue,
    createdAt: now,
    updatedAt: now,
    action,
    summary: getSessionHistorySummary(dateValue, beforeSession, afterSession, action),
    actor: normalizeHistoryActor(actor),
    beforeBlockCount,
    afterBlockCount,
    beforeSession: beforeSession ? cloneJson(beforeSession) : null,
    afterSession: afterSession ? cloneJson(afterSession) : null,
    restoreOf: normalizeHistoryString(options.restoreOf || ""),
  };
}

async function appendSessionPlannerHistory(actor, previousRawValue, nextRawValue, options = {}) {
  try {
    const bucketReady = await ensureStateBucket();
    if (!bucketReady) {
      return [];
    }

    const previousState = parseSessionPlannerState(previousRawValue);
    const nextState = parseSessionPlannerState(nextRawValue);
    const dateValues = new Set([
      ...Object.keys(previousState.sessions || {}),
      ...Object.keys(nextState.sessions || {}),
    ]);
    const changedEntries = [];

    dateValues.forEach((dateValue) => {
      const beforeSession = previousState.sessions?.[dateValue] || null;
      const afterSession = nextState.sessions?.[dateValue] || null;
      const sessionDate = getSessionKey(dateValue, afterSession || beforeSession);
      if (!sessionDate || sessionsAreEqual(beforeSession, afterSession)) {
        return;
      }

      changedEntries.push(createSessionHistoryEntry(actor, sessionDate, beforeSession, afterSession, options));
    });

    if (!changedEntries.length) {
      return [];
    }

    const historyLog = await readSessionHistoryLog(MAX_SESSION_HISTORY_ENTRIES);
    const nextEntries = [...historyLog.entries];
    const recordedEntries = [];
    changedEntries.forEach((entry) => {
      const burstIndex = findEditableBurstEntry(nextEntries, entry.actor, entry.date, entry.action);
      if (burstIndex >= 0) {
        const existingEntry = nextEntries[burstIndex];
        nextEntries[burstIndex] = {
          ...existingEntry,
          updatedAt: entry.updatedAt,
          action: entry.action,
          summary: entry.summary,
          afterBlockCount: entry.afterBlockCount,
          afterSession: entry.afterSession,
        };
        return;
      }

      nextEntries.unshift(entry);
      recordedEntries.push(entry);
    });

    const result = await writeSessionHistoryLog({ schema: SESSION_HISTORY_SCHEMA, entries: nextEntries }, actor);
    return result.ok ? recordedEntries : [];
  } catch {
    return [];
  }
}

async function getSessionHistoryEntries(options = {}) {
  const historyLog = await readSessionHistoryLog(options.limit || 80);
  const date = normalizeHistoryString(options.date || "");
  return date
    ? historyLog.entries.filter((entry) => entry.date === date)
    : historyLog.entries;
}

async function readSessionPlannerStateEntry() {
  return readStateObject(SESSION_PLANNER_KEY);
}

async function writeSessionPlannerStateValue(value, actor) {
  const entry = {
    schema: "footballscience-app-state-v1",
    key: SESSION_PLANNER_KEY,
    value: String(value ?? ""),
    removed: false,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "",
  };

  return writeStateObject(entry);
}

module.exports = {
  SESSION_PLANNER_KEY,
  SESSION_HISTORY_KEY,
  appendSessionPlannerHistory,
  getSessionHistoryEntries,
  readSessionPlannerStateEntry,
  writeSessionPlannerStateValue,
  parseSessionPlannerState,
};
