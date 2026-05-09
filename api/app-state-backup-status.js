const { createHash } = require("node:crypto");
const {
  getCurrentActor,
  readConfig,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");

const STATE_BUCKET = "footballscience-app-state";
const BACKUP_PREFIX = "backups/app-state";
const LATEST_BACKUP_PATH = `${BACKUP_PREFIX}/latest.json`;

function getStorageBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  return `${url}/storage/v1`;
}

function storageHeaders() {
  const { serviceRoleKey } = readConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function getAuthorizationHeader(req) {
  return req.headers?.authorization || req.headers?.Authorization || "";
}

async function authorizeStatusRequest(req) {
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

function parseStorageJson(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function readStorageJson(path) {
  const encodedPath = String(path)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(`${getStorageBaseUrl()}/object/${encodeURIComponent(STATE_BUCKET)}/${encodedPath}`, {
    method: "GET",
    headers: storageHeaders(),
  });
  const text = await response.text();
  const payload = parseStorageJson(text);

  if (!response.ok) {
    const reason = payload?.error || payload?.message || payload?.msg || `Storage object read failed (${response.status}).`;
    return { ok: false, status: response.status, payload, reason };
  }

  return { ok: true, status: response.status, payload };
}

function hashText(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
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

function summarizeBackup(pointer, backup) {
  const { contentSha256, ...backupCore } = backup;
  const computedSha256 = hashText(JSON.stringify(backupCore));
  const createdAtMs = Date.parse(pointer.createdAt || backup.createdAt || "");
  const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, Date.now() - createdAtMs) : null;

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
    backupMatchesPointer:
      pointer.schema === "footballscience-app-state-backup-pointer-v1" &&
      backup.schema === "footballscience-app-state-backup-v1" &&
      pointer.createdAt === backup.createdAt &&
      Number(pointer.entryCount) === Number(backup.entryCount) &&
      pointer.contentSha256 === contentSha256 &&
      computedSha256 === contentSha256,
  };
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const authorization = await authorizeStatusRequest(req);
  if (!authorization.ok) {
    return sendJson(res, authorization.status, { ok: false, reason: authorization.reason });
  }

  try {
    const pointerResult = await readStorageJson(LATEST_BACKUP_PATH);
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

    const backupResult = await readStorageJson(pointer.path);
    if (!backupResult.ok) {
      return sendJson(res, backupResult.status === 404 ? 404 : 500, {
        ok: false,
        reason: backupResult.reason || "Latest app-state backup object is not available.",
      });
    }

    const summary = summarizeBackup(pointer, backupResult.payload || {});
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
  } catch (error) {
    return sendJson(res, 500, { ok: false, reason: error?.message || "App-state backup status failed." });
  }
};
