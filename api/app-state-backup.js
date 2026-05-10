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
const LATEST_BACKUP_PATH = `${BACKUP_PREFIX}/latest.json`;
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

function parseBackupJson(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readBackupObject(path) {
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });

  if (!result.ok) {
    return result;
  }

  const payload = parseBackupJson(result.payload);
  if (!payload) {
    return { ok: false, status: 500, reason: "App-state backup object is not valid JSON." };
  }

  return { ok: true, status: result.status, payload };
}

function isSafeBackupPath(path) {
  const normalized = String(path || "");
  return (
    normalized.startsWith(`${BACKUP_PREFIX}/`) &&
    normalized.endsWith(".json") &&
    normalized !== LATEST_BACKUP_PATH &&
    !normalized.includes("..") &&
    !normalized.includes("?") &&
    !normalized.includes("#") &&
    !normalized.startsWith("/")
  );
}

function summarizeBackupStatus(pointer, backup) {
  const { contentSha256, ...backupCore } = backup;
  const computedSha256 = hashText(JSON.stringify(backupCore));
  const createdAtMs = Date.parse(pointer.createdAt || backup.createdAt || "");
  const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, Date.now() - createdAtMs) : null;
  const manifestSummary = summarizeBackupManifest(backup.manifest || {});

  return {
    latest: {
      schema: pointer.schema || "",
      createdAt: pointer.createdAt || "",
      ageMs,
      path: pointer.path || "",
      entryCount: Number.isInteger(Number(pointer.entryCount)) ? Number(pointer.entryCount) : 0,
      contentSha256: pointer.contentSha256 || "",
    },
    backup: {
      schema: backup.schema || "",
      createdAt: backup.createdAt || "",
      entryCount: Number.isInteger(Number(backup.entryCount)) ? Number(backup.entryCount) : 0,
      contentSha256: contentSha256 || "",
      computedSha256,
    },
    manifest: manifestSummary.manifest,
    manifestCoverage: manifestSummary.coverage,
    backupMatchesPointer:
      pointer.schema === "footballscience-app-state-backup-pointer-v1" &&
      backup.schema === "footballscience-app-state-backup-v1" &&
      pointer.createdAt === backup.createdAt &&
      Number(pointer.entryCount) === Number(backup.entryCount) &&
      pointer.contentSha256 === contentSha256 &&
      computedSha256 === contentSha256 &&
      manifestSummary.coverage.missingKeys.length === 0,
  };
}

function summarizeBackupManifest(rawManifest) {
  const source = rawManifest && typeof rawManifest === "object" && !Array.isArray(rawManifest) ? rawManifest : {};
  const manifest = {};
  const missingKeys = [];
  let presentEntryCount = 0;

  for (const key of CENTRAL_STATE_KEYS) {
    const contract = dataSafetyRegistry.getByKey(key);
    const entry = source[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      missingKeys.push(key);
      manifest[key] = {
        present: false,
        moduleId: contract?.moduleId || "",
      };
      continue;
    }

    const present = entry.present === true;
    if (present) {
      presentEntryCount += 1;
    }

    manifest[key] = {
      present,
      moduleId: String(entry.moduleId || contract?.moduleId || ""),
      organizationId: String(entry.organizationId || contract?.defaultOrganizationId || "global"),
      revision: Number.isInteger(Number(entry.revision)) ? Number(entry.revision) : 0,
      mergePolicy: String(entry.mergePolicy || contract?.mergePolicy || ""),
      updatedAt: String(entry.updatedAt || ""),
      bytes: Number.isInteger(Number(entry.bytes)) ? Number(entry.bytes) : 0,
      sha256: String(entry.sha256 || ""),
    };
  }

  return {
    manifest,
    coverage: {
      keyCount: CENTRAL_STATE_KEYS.size,
      manifestKeyCount: Object.keys(source).length,
      presentEntryCount,
      missingKeys,
    },
  };
}

function createModuleRestoreSummary() {
  const modules = {};
  for (const key of CENTRAL_STATE_KEYS) {
    const moduleId = dataSafetyRegistry.getByKey(key)?.moduleId || "unknown";
    if (!modules[moduleId]) {
      modules[moduleId] = {
        protectedKeyCount: 0,
        presentEntryCount: 0,
        parsedEntryCount: 0,
      };
    }
    modules[moduleId].protectedKeyCount += 1;
  }
  return modules;
}

function createRestoreDrillSummary(backup, statusSummary) {
  const manifest = backup.manifest && typeof backup.manifest === "object" && !Array.isArray(backup.manifest) ? backup.manifest : {};
  const entries = backup.entries && typeof backup.entries === "object" && !Array.isArray(backup.entries) ? backup.entries : {};
  const modules = createModuleRestoreSummary();
  const unknownEntryKeys = [];
  const missingEntryKeys = [];
  const unexpectedEntryKeys = [];
  const invalidEntries = [];
  let parsedEntryCount = 0;

  for (const key of Object.keys(entries)) {
    if (!CENTRAL_STATE_KEYS.has(key)) {
      unknownEntryKeys.push(key);
    }
  }

  for (const key of CENTRAL_STATE_KEYS) {
    const contract = dataSafetyRegistry.getByKey(key);
    const moduleId = contract?.moduleId || "unknown";
    const manifestEntry = manifest[key] || {};
    const hasEntry = Object.prototype.hasOwnProperty.call(entries, key);
    const present = manifestEntry.present === true;

    if (!present && hasEntry) {
      unexpectedEntryKeys.push(key);
      continue;
    }

    if (!present) {
      continue;
    }

    modules[moduleId].presentEntryCount += 1;

    if (!hasEntry) {
      missingEntryKeys.push(key);
      continue;
    }

    const value = String(entries[key] ?? "");
    const bytes = Buffer.byteLength(value, "utf8");
    const sha256 = hashText(value);
    const entryFailures = [];

    if (Number(manifestEntry.bytes) !== bytes) {
      entryFailures.push("bytes");
    }

    if (String(manifestEntry.sha256 || "") !== sha256) {
      entryFailures.push("sha256");
    }

    try {
      JSON.parse(value);
    } catch {
      entryFailures.push("json");
    }

    if (entryFailures.length) {
      invalidEntries.push({
        key,
        moduleId,
        reasons: entryFailures,
      });
      continue;
    }

    parsedEntryCount += 1;
    modules[moduleId].parsedEntryCount += 1;
  }

  const entryCount = Object.keys(entries).length;
  const declaredEntryCount = Number(backup.entryCount || 0);
  const pointerEntryCount = Number(statusSummary.latest.entryCount || 0);
  const entryCountMatches = entryCount === declaredEntryCount && entryCount === pointerEntryCount;
  const restorable =
    statusSummary.backupMatchesPointer &&
    entryCountMatches &&
    unknownEntryKeys.length === 0 &&
    missingEntryKeys.length === 0 &&
    unexpectedEntryKeys.length === 0 &&
    invalidEntries.length === 0;

  return {
    dryRun: true,
    restored: false,
    restorable,
    keyCount: CENTRAL_STATE_KEYS.size,
    entryCount,
    declaredEntryCount,
    pointerEntryCount,
    parsedEntryCount,
    moduleCount: Object.keys(modules).length,
    modules,
    unknownEntryKeys,
    missingEntryKeys,
    unexpectedEntryKeys,
    invalidEntries,
  };
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

function isBackupStatusRequest(req) {
  try {
    const url = new URL(req.url || "", "https://footballscience.local");
    return url.pathname.endsWith("/app-state-backup-status") || url.searchParams.get("mode") === "status";
  } catch {
    return false;
  }
}

function isRestoreDrillRequest(req) {
  try {
    const url = new URL(req.url || "", "https://footballscience.local");
    return url.searchParams.get("mode") === "restore-drill";
  } catch {
    return false;
  }
}

async function sendBackupStatus(res) {
  const pointerResult = await readBackupObject(LATEST_BACKUP_PATH);
  if (!pointerResult.ok) {
    return sendJson(res, pointerResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: pointerResult.reason || "Latest app-state backup pointer is not available.",
    });
  }

  const pointer = pointerResult.payload || {};
  if (!isSafeBackupPath(pointer.path)) {
    return sendJson(res, 409, { ok: false, reason: "Latest app-state backup pointer contains an invalid path." });
  }

  const backupResult = await readBackupObject(pointer.path);
  if (!backupResult.ok) {
    return sendJson(res, backupResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: backupResult.reason || "Latest app-state backup object is not available.",
    });
  }

  const summary = summarizeBackupStatus(pointer, backupResult.payload || {});
  if (!summary.backupMatchesPointer) {
    return sendJson(res, 409, {
      ok: false,
      reason: "Latest app-state backup pointer does not match the stored backup object.",
      ...summary,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    ...summary,
  });
}

async function sendBackupRestoreDrill(res) {
  const pointerResult = await readBackupObject(LATEST_BACKUP_PATH);
  if (!pointerResult.ok) {
    return sendJson(res, pointerResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: pointerResult.reason || "Latest app-state backup pointer is not available.",
    });
  }

  const pointer = pointerResult.payload || {};
  if (!isSafeBackupPath(pointer.path)) {
    return sendJson(res, 409, { ok: false, reason: "Latest app-state backup pointer contains an invalid path." });
  }

  const backupResult = await readBackupObject(pointer.path);
  if (!backupResult.ok) {
    return sendJson(res, backupResult.status === 404 ? 404 : 500, {
      ok: false,
      reason: backupResult.reason || "Latest app-state backup object is not available.",
    });
  }

  const backup = backupResult.payload || {};
  const summary = summarizeBackupStatus(pointer, backup);
  const restoreDrill = createRestoreDrillSummary(backup, summary);
  if (!restoreDrill.restorable) {
    return sendJson(res, 409, {
      ok: false,
      reason: "Latest app-state backup is not restore-ready.",
      latest: summary.latest,
      backup: summary.backup,
      manifestCoverage: summary.manifestCoverage,
      restoreDrill,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    latest: summary.latest,
    backup: summary.backup,
    manifestCoverage: summary.manifestCoverage,
    restoreDrill,
  });
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const backupStatusRequest = isBackupStatusRequest(req);
  const restoreDrillRequest = isRestoreDrillRequest(req);
  const readonlyMetadataRequest = backupStatusRequest || restoreDrillRequest;
  if ((readonlyMetadataRequest && req.method !== "GET") || (!readonlyMetadataRequest && req.method !== "GET" && req.method !== "POST")) {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const authorization = await authorizeBackupRequest(req);
  if (!authorization.ok) {
    return sendJson(res, authorization.status, { ok: false, reason: authorization.reason });
  }

  try {
    if (backupStatusRequest) {
      return sendBackupStatus(res);
    }

    if (restoreDrillRequest) {
      return sendBackupRestoreDrill(res);
    }

    const bucket = await ensureStateBucket();
    if (!bucket.ok) {
      return sendJson(res, 500, { ok: false, reason: bucket.reason || "Central app-state bucket is not available." });
    }

    const backupSource = await collectCentralStateBackupEntries();
    const envelope = createBackupEnvelope({ actor: authorization.actor, ...backupSource });
    const timestamp = envelope.createdAt.replace(/[:.]/g, "-");
    const day = envelope.createdAt.slice(0, 10);
    const backupPath = `${BACKUP_PREFIX}/${day}/${timestamp}-${envelope.contentSha256.slice(0, 12)}.json`;
    const latestPath = LATEST_BACKUP_PATH;

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
