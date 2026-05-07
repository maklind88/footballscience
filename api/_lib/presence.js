const { readConfig } = require("./supabase-admin.js");

const STATE_BUCKET = "footballscience-app-state";
const STATE_PREFIX = "global";
const PRESENCE_KEY = "football-presence-v1";
const PRESENCE_SCHEMA = "footballscience-presence-v1";
const ONLINE_TTL_MS = 80 * 1000;
const AWAY_TTL_MS = 6 * 60 * 1000;
const RETAIN_TTL_MS = 24 * 60 * 60 * 1000;
const TYPING_TTL_MS = 9 * 1000;

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

async function readPresenceObject() {
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
    return {
      schema: PRESENCE_SCHEMA,
      entries: value?.entries && typeof value.entries === "object" && !Array.isArray(value.entries)
        ? value.entries
        : {},
    };
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
    return result;
  }

  return storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(PRESENCE_KEY)}`, {
    method: "POST",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });
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
  const now = new Date().toISOString();
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
