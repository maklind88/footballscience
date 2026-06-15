const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");

const STATE_BUCKET = "footballscience-app-state";
const STATE_PREFIX = "global";
const PRESENCE_KEY = "football-presence-v1";
const PRESENCE_SCHEMA = "footballscience-presence-v1";
const ONLINE_TTL_MS = 80 * 1000;
const AWAY_TTL_MS = 6 * 60 * 1000;
const RETAIN_TTL_MS = 24 * 60 * 60 * 1000;
const TYPING_TTL_MS = 9 * 1000;
const PRESENCE_BUCKET_CHECK_TTL_MS = 10 * 60 * 1000;
const PRESENCE_READ_CACHE_TTL_MS = 5000;
const PRESENCE_WRITE_MIN_INTERVAL_MS = 45 * 1000;
const PRESENCE_TYPING_WRITE_MIN_INTERVAL_MS = 5 * 1000;
const PRESENCE_STORAGE_REQUEST_TIMEOUT_MS = 8000;
let presenceBucketReadyCache = { checkedAt: 0, ready: false, pending: null };
let presenceObjectCache = { updatedAt: 0, value: null };

function clonePresenceObject(value = {}) {
  return {
    schema: value.schema || PRESENCE_SCHEMA,
    entries: JSON.parse(JSON.stringify(value.entries && typeof value.entries === "object" ? value.entries : {})),
  };
}

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
  return buildSupabaseKeyHeaders(serviceRoleKey, { contentType });
}

function isTimeoutError(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError";
}

function createStorageTimeoutSignal(timeoutMs = PRESENCE_STORAGE_REQUEST_TIMEOUT_MS) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
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

  let response;
  try {
    response = await fetch(`${storage.url}${path}`, {
      ...options,
      signal: options.signal || createStorageTimeoutSignal(),
      headers: {
        ...storageHeaders(storage.serviceRoleKey, options.contentType),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    return {
      ok: false,
      status: isTimeoutError(error) ? 503 : 0,
      payload: {},
      reason: isTimeoutError(error)
        ? "Presence storage is temporarily busy."
        : error?.message || "Presence storage could not be reached.",
    };
  }

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
  const now = Date.now();
  if (presenceBucketReadyCache.ready && now - presenceBucketReadyCache.checkedAt < PRESENCE_BUCKET_CHECK_TTL_MS) {
    return true;
  }
  if (presenceBucketReadyCache.pending) {
    return presenceBucketReadyCache.pending;
  }

  presenceBucketReadyCache.pending = (async () => {
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
  })();

  try {
    const ready = await presenceBucketReadyCache.pending;
    presenceBucketReadyCache = { checkedAt: Date.now(), ready, pending: null };
    return ready;
  } catch {
    presenceBucketReadyCache = { checkedAt: Date.now(), ready: false, pending: null };
    return false;
  }
}

function objectPathForKey(key) {
  return `${STATE_PREFIX}/${encodeURIComponent(key)}.json`;
}

async function readPresenceObject() {
  const now = Date.now();
  if (presenceObjectCache.value && now - presenceObjectCache.updatedAt < PRESENCE_READ_CACHE_TTL_MS) {
    return clonePresenceObject(presenceObjectCache.value);
  }
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(PRESENCE_KEY)}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });

  if (!result.ok) {
    return { schema: PRESENCE_SCHEMA, entries: {} };
  }

  try {
    const parsed = JSON.parse(result.payload);
    const value = JSON.parse(parsed?.value || "{}");
    const presenceObject = {
      schema: PRESENCE_SCHEMA,
      entries: value?.entries && typeof value.entries === "object" && !Array.isArray(value.entries)
        ? value.entries
        : {},
    };
    presenceObjectCache = { updatedAt: Date.now(), value: clonePresenceObject(presenceObject) };
    return presenceObject;
  } catch {
    return { schema: PRESENCE_SCHEMA, entries: {} };
  }
}

async function writePresenceObject(presenceLog, actor) {
  const entry = {
    schema: "footballscience-app-state-v1",
    key: PRESENCE_KEY,
    value: JSON.stringify({
      schema: PRESENCE_SCHEMA,
      entries: presenceLog?.entries && typeof presenceLog.entries === "object" ? presenceLog.entries : {},
    }),
    removed: false,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "",
  };

  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(PRESENCE_KEY)}`, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  if (result.ok || result.status !== 404) {
    if (result.ok) {
      presenceObjectCache = { updatedAt: Date.now(), value: clonePresenceObject(presenceLog) };
    }
    return result;
  }

  const fallback = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(PRESENCE_KEY)}`, {
    method: "POST",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });
  if (fallback.ok) {
    presenceObjectCache = { updatedAt: Date.now(), value: clonePresenceObject(presenceLog) };
  }
  return fallback;
}

function normalizePresenceStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "away" || status === "offline") {
    return status;
  }
  return "online";
}

function normalizePresenceString(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 160);
}

function normalizePresenceActor(actor = {}) {
  return {
    id: normalizePresenceString(actor.id),
    email: normalizePresenceString(actor.email).toLowerCase(),
    name: normalizePresenceString(`${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email),
    role: normalizePresenceString(actor.role || "unknown"),
    profileImageUrl: normalizePresenceString(actor.profileImageUrl || "", ""),
  };
}

function getPresenceEntrySignature(entry = {}) {
  return [
    normalizePresenceStatus(entry.rawStatus || entry.status),
    normalizePresenceString(entry.workspaceId || ""),
    normalizePresenceString(entry.typingThreadId || ""),
  ].join(":");
}

function resolvePresenceStatus(entry, nowMs = Date.now()) {
  const rawStatus = normalizePresenceStatus(entry?.status);
  const lastSeenMs = new Date(entry?.lastSeenAt || entry?.updatedAt || 0).getTime();
  if (!Number.isFinite(lastSeenMs)) {
    return "offline";
  }

  const ageMs = nowMs - lastSeenMs;
  if (rawStatus === "offline" || ageMs > AWAY_TTL_MS) {
    return "offline";
  }
  if (rawStatus === "away" || ageMs > ONLINE_TTL_MS) {
    return "away";
  }
  return "online";
}

function sanitizePresenceEntries(entries = {}) {
  const nowMs = Date.now();
  return Object.fromEntries(
    Object.entries(entries)
      .map(([userId, entry]) => {
        const lastSeenMs = new Date(entry?.lastSeenAt || entry?.updatedAt || 0).getTime();
        if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > RETAIN_TTL_MS) {
          return null;
        }

        const actor = normalizePresenceActor(entry?.user || entry?.actor || { id: userId });
        if (!actor.id) {
          actor.id = userId;
        }
        const typingAt = entry?.typingAt || "";
        const typingAtMs = new Date(typingAt || 0).getTime();
        const isTypingFresh = Number.isFinite(typingAtMs) && nowMs - typingAtMs <= TYPING_TTL_MS;

        return [
          actor.id,
          {
            ...entry,
            userId: actor.id,
            user: actor,
            status: resolvePresenceStatus(entry, nowMs),
            rawStatus: normalizePresenceStatus(entry?.status),
            lastSeenAt: entry?.lastSeenAt || entry?.updatedAt || "",
            lastActivityAt: entry?.lastActivityAt || "",
            typingThreadId: isTypingFresh ? normalizePresenceString(entry?.typingThreadId || "") : "",
            typingAt: isTypingFresh ? typingAt : "",
            updatedAt: entry?.updatedAt || "",
          },
        ];
      })
      .filter(Boolean)
  );
}

async function getPresenceEntries() {
  const bucketReady = await ensureStateBucket();
  if (!bucketReady) {
    return [];
  }

  const presenceLog = await readPresenceObject();
  const entries = sanitizePresenceEntries(presenceLog.entries);
  return Object.values(entries).sort((first, second) => {
    const rank = { online: 0, away: 1, offline: 2 };
    const firstRank = rank[first.status] ?? 2;
    const secondRank = rank[second.status] ?? 2;
    if (firstRank !== secondRank) {
      return firstRank - secondRank;
    }
    return new Date(second.lastSeenAt || 0) - new Date(first.lastSeenAt || 0);
  });
}

async function updatePresence(actor, values = {}) {
  const bucketReady = await ensureStateBucket();
  if (!bucketReady) {
    return { ok: false, reason: "Central presence is not available." };
  }

  const presenceLog = await readPresenceObject();
  const entries = sanitizePresenceEntries(presenceLog.entries);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const status = normalizePresenceStatus(values.status);
  const normalizedActor = normalizePresenceActor(actor);

  if (!normalizedActor.id) {
    return { ok: false, reason: "Missing signed-in user." };
  }
  const previousEntry = entries[normalizedActor.id] || {};
  const hasTypingThread = Object.prototype.hasOwnProperty.call(values, "typingThreadId");
  const typingThreadId = hasTypingThread
    ? normalizePresenceString(values.typingThreadId || "")
    : normalizePresenceString(previousEntry.typingThreadId || "");
  const typingAt = typingThreadId
    ? normalizePresenceString(values.typingAt || previousEntry.typingAt || now)
    : "";
  const previousSeenMs = new Date(previousEntry.lastSeenAt || previousEntry.updatedAt || 0).getTime();
  const previousTypingMs = new Date(previousEntry.typingAt || 0).getTime();
  const nextSignature = getPresenceEntrySignature({ status, workspaceId: values.workspaceId, typingThreadId });
  const previousSignature = getPresenceEntrySignature(previousEntry);
  const typingRefreshDue =
    typingThreadId &&
    (!Number.isFinite(previousTypingMs) || nowMs - previousTypingMs > PRESENCE_TYPING_WRITE_MIN_INTERVAL_MS);
  const minimumWriteInterval = typingThreadId ? PRESENCE_TYPING_WRITE_MIN_INTERVAL_MS : PRESENCE_WRITE_MIN_INTERVAL_MS;
  if (
    previousEntry?.userId &&
    nextSignature === previousSignature &&
    !typingRefreshDue &&
    Number.isFinite(previousSeenMs) &&
    nowMs - previousSeenMs < minimumWriteInterval
  ) {
    return {
      ok: true,
      entries: Object.values(sanitizePresenceEntries(entries)),
      updatedAt: previousEntry.updatedAt || previousEntry.lastSeenAt || now,
      throttled: true,
    };
  }

  entries[normalizedActor.id] = {
    userId: normalizedActor.id,
    user: normalizedActor,
    status,
    rawStatus: status,
    lastSeenAt: now,
    lastActivityAt: normalizePresenceString(values.lastActivityAt || now),
    workspaceId: normalizePresenceString(values.workspaceId || ""),
    typingThreadId,
    typingAt,
    updatedAt: now,
  };

  const result = await writePresenceObject({ schema: PRESENCE_SCHEMA, entries }, actor);
  if (!result.ok) {
    return { ok: false, reason: result.reason || "Presence could not be updated." };
  }

  return {
    ok: true,
    entries: Object.values(sanitizePresenceEntries(entries)),
    updatedAt: now,
  };
}

module.exports = {
  getPresenceEntries,
  updatePresence,
};
