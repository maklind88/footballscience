const { createHash } = require("node:crypto");
const {
  getCurrentActor,
  readConfig,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { dataSafetyRegistry } = require("../src/core/data-safety-contracts.cjs");

const STATE_BUCKET = "footballscience-app-state";
const STATE_PREFIX = "global";
const BACKUP_PREFIX = "backups/app-state";
const CENTRAL_STATE_KEYS = new Set(dataSafetyRegistry.keys());

function getStorageBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  return `${url}/storage/v1`;
}

function storageHeaders(contentType = "application/json") {
  const { serviceRoleKey } = readConfig();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function parseResponseJson(response) {
  const text = await response.text();
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
  const response = await fetch(`${getStorageBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...storageHeaders(options.contentType),
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return { ok: false, status: 404, payload: {} };
  }

  const payload = options.raw ? await response.text() : await parseResponseJson(response);
  if (!response.ok) {
    const reason = payload?.error || payload?.message || payload?.msg || `Storage request failed (${response.status}).`;
    return { ok: false, status: response.status, payload, reason };
  }

  return { ok: true, status: response.status, payload };
}

async function ensureStateBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(STATE_BUCKET)}`, { method: "GET" });
  if (existing.ok) {
    return { ok: true };
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: STATE_BUCKET,
      name: STATE_BUCKET,
      public: false,
    }),
  });

  if (created.ok || created.status === 409 || String(created.reason || "").toLowerCase().includes("already")) {
    return { ok: true };
  }

  return created;
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
    return parsed?.key && !parsed.removed ? parsed : null;
  } catch {
    return null;
  }
}

function hashText(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

async function collectCentralStateBackupEntries() {
  const entries = {};
  const manifest = {};

  await Promise.all(
    Array.from(CENTRAL_STATE_KEYS).map(async (key) => {
      const entry = await readStateObject(key);
      if (!entry?.key) {
        manifest[key] = { present: false };
        return;
      }

      const value = String(entry.value ?? "");
      entries[entry.key] = value;
      manifest[entry.key] = {
        present: true,
        moduleId: dataSafetyRegistry.getByKey(entry.key)?.moduleId || "",
        organizationId: entry.organizationId || "global",
        revision: Number.isInteger(Number(entry.revision)) ? Number(entry.revision) : 0,
        mergePolicy: entry.mergePolicy || dataSafetyRegistry.getByKey(entry.key)?.mergePolicy || "",
        updatedAt: entry.updatedAt || "",
        updatedBy: entry.updatedBy || "",
        bytes: Buffer.byteLength(value, "utf8"),
        sha256: hashText(value),
      };
    })
  );

  return { entries, manifest };
}

function createBackupEnvelope({ actor, entries, manifest }) {
  const createdAt = new Date().toISOString();
  const core = {
    schema: "footballscience-app-state-backup-v1",
    createdAt,
    source: "api/app-state-backup",
    actor: {
      id: actor?.id || "vercel-cron",
      role: actor?.role || "system",
      email: actor?.email || "",
    },
    entryCount: Object.keys(entries).length,
    manifest,
    entries,
  };

  return {
    ...core,
    contentSha256: hashText(JSON.stringify(core)),
  };
}

async function writeBackupObject(path, payload, upsert = false) {
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "PUT",
    headers: {
      ...(upsert ? { "x-upsert": "true" } : {}),
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  });

  if (!result.ok && result.status === 404) {
    return storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
      method: "POST",
      headers: {
        ...(upsert ? { "x-upsert": "true" } : {}),
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(payload),
    });
  }

  return result;
}

function getAuthorizationHeader(req) {
  return req.headers?.authorization || req.headers?.Authorization || "";
}

async function authorizeBackupRequest(req) {
  const authorization = getAuthorizationHeader(req);
  const cronSecret = String(process.env.CRON_SECRET || "").trim();

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return { ok: true, actor: { id: "vercel-cron", role: "admin", email: "" } };
  }

  const actor = await getCurrentActor(authorization);
  if (!actor) {
    return { ok: false, status: 401, reason: "Admin sign-in or Vercel cron secret required." };
  }

  if (actor.role !== "admin") {
    return { ok: false, status: 403, reason: "Admin access required." };
  }

  return { ok: true, actor };
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const authorization = await authorizeBackupRequest(req);
  if (!authorization.ok) {
    return sendJson(res, authorization.status, { ok: false, reason: authorization.reason });
  }

  try {
    const bucket = await ensureStateBucket();
    if (!bucket.ok) {
      return sendJson(res, 500, { ok: false, reason: bucket.reason || "Central app-state bucket is not available." });
    }

    const backupSource = await collectCentralStateBackupEntries();
    const envelope = createBackupEnvelope({ actor: authorization.actor, ...backupSource });
    const timestamp = envelope.createdAt.replace(/[:.]/g, "-");
    const day = envelope.createdAt.slice(0, 10);
    const backupPath = `${BACKUP_PREFIX}/${day}/${timestamp}-${envelope.contentSha256.slice(0, 12)}.json`;
    const latestPath = `${BACKUP_PREFIX}/latest.json`;

    const backupResult = await writeBackupObject(backupPath, envelope, false);
    if (!backupResult.ok) {
      return sendJson(res, 500, { ok: false, reason: backupResult.reason || "App-state backup could not be written." });
    }

    const latest = {
      schema: "footballscience-app-state-backup-pointer-v1",
      createdAt: envelope.createdAt,
      path: backupPath,
      entryCount: envelope.entryCount,
      contentSha256: envelope.contentSha256,
    };
    const latestResult = await writeBackupObject(latestPath, latest, true);
    if (!latestResult.ok) {
      return sendJson(res, 500, { ok: false, reason: latestResult.reason || "Latest backup pointer could not be written." });
    }

    return sendJson(res, 200, {
      ok: true,
      createdAt: envelope.createdAt,
      path: backupPath,
      latestPath,
      entryCount: envelope.entryCount,
      contentSha256: envelope.contentSha256,
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, reason: error?.message || "App-state backup failed." });
  }
};
