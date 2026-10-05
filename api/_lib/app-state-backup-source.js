const { isAppStateDatabaseEnabled, readAppStateRecord } = require("./app-state-records-database.js");

function validateEntry(entry, key) {
  if (!entry || Array.isArray(entry) || entry.key !== key ||
      (entry.organizationId && entry.organizationId !== "global") ||
      (entry.removed !== true && typeof entry.value !== "string")) {
    throw new Error(`Invalid backup source record for ${key}; previous backup retained.`);
  }
  return entry;
}

function parsePayload(payload) {
  if (typeof payload !== "string") return payload;
  try { return JSON.parse(payload); } catch { return null; }
}

async function readBackupStateEntry(key, readStorage) {
  if (isAppStateDatabaseEnabled()) {
    const result = await readAppStateRecord(key);
    if (!result.ok) throw new Error(`Backup database read failed for ${key}; previous backup retained.`);
    // A tombstone is authoritative too; never resurrect its compatibility mirror.
    if (result.entry) return validateEntry(result.entry, key);
    // The serving API supports legacy Storage when no database record exists.
    // Backup may read that fallback, but must not seed or otherwise write it.
  }
  const result = await readStorage(key);
  const payload = parsePayload(result.payload);
  if (!result.ok) {
    const code = String(payload?.code || payload?.error || "");
    if (result.status === 404 && (!code || ["NoSuchKey", "not_found", "Not Found"].includes(code))) return null;
    const wrappedMissingObject = result.status === 400 && String(payload?.statusCode) === "404" && (
      payload?.code === "NoSuchKey" || (!payload?.code && payload?.error === "not_found" && payload?.message === "Object not found")
    );
    if (wrappedMissingObject) return null;
    throw new Error(`Backup Storage read failed for ${key} (${result.status}); previous backup retained.`);
  }
  return validateEntry(payload, key);
}

module.exports = { readBackupStateEntry };
