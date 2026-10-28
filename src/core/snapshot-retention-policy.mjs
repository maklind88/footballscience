// This bounds serialized snapshot history, not browser disk usage or module journals.
export const DEFAULT_SNAPSHOT_BYTES = 64 * 1024 * 1024;
export const isDedicatedRecoveryKey = key => String(key).startsWith("football-session-planner-v3-quota-fallback");
export const snapshotBytes = row => JSON.stringify(row).length * 2;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const empty = value => record(value) && Object.keys(value).length === 0;
const snapshotFields = new Set(["id", "schema", "app", "createdAt", "reason", "source", "summary", "storage", "recoveryCopies", "recoverySeparations", "recoveryState", "saveContext"]);
const entryFields = new Set(["principalScope", "pendingCentralSync", "pendingBaseRevision", "serverRevision", "writes", "hash", "updatedAt", "deletedAt", "localWritePrepared"]);

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

// Missing/foreign ownership, recovery state and unacknowledged generations are
// protected. A hash is only a consistency veto, never proof of central acceptance.
export function canRotateSnapshot(row, scope) {
  if (row?.schema !== "football-science-backup-v1" || row.app !== "Football Science" || Object.keys(row).some(key => !snapshotFields.has(key)) ||
      typeof scope !== "string" || !scope || row.saveContext?.scope !== scope ||
      !record(row.storage) || Object.keys(row.saveContext).some(key => !["scope", "entries"].includes(key)) || !record(row.saveContext.entries) || !empty(row.recoveryCopies) ||
      !empty(row.recoveryState) || !Array.isArray(row.recoverySeparations) || row.recoverySeparations.length) return false;
  const entries = row.saveContext.entries;
  if (Object.values(entries).some(entry => !record(entry) || Object.keys(entry).some(key => !entryFields.has(key)) || entry.principalScope !== scope ||
      entry.pendingCentralSync !== false || entry.localWritePrepared ||
      !Number.isInteger(entry.serverRevision) || entry.serverRevision <= 0)) return false;
  return Object.entries(row.storage).every(([key, value]) => typeof value === "string" &&
    Object.hasOwn(entries, key) && entries[key].hash === hashString(value));
}

export function snapshotBudgetError() {
  const error = new Error("Browser snapshot limit reached. Existing recovery copies were retained; this snapshot was not saved.");
  error.name = "SnapshotBudgetError";
  return error;
}

export function planSnapshotRetirement(rows, latestBytes, options = {}) {
  const { maxSnapshots = 30, maxSnapshotBytes = DEFAULT_SNAPSHOT_BYTES } = options;
  if (!Number.isSafeInteger(maxSnapshots) || maxSnapshots < 1 ||
      !Number.isSafeInteger(maxSnapshotBytes) || maxSnapshotBytes < 1) throw new TypeError("Invalid snapshot budget.");
  let count = rows.length, bytes = latestBytes + rows.reduce((total, row) => total + row.bytes, 0);
  const retire = [];
  for (const row of rows) {
    if (count <= maxSnapshots && bytes <= maxSnapshotBytes) break;
    if (!row.rotatable) continue;
    retire.push(row.id); count--; bytes -= row.bytes;
  }
  if (count > maxSnapshots || bytes > maxSnapshotBytes) throw snapshotBudgetError();
  return retire;
}
