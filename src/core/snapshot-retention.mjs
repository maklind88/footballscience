// This policy proves local replacement, not central acknowledgement. Only new
// automatic copies opt in; legacy/unknown/recovery records are never inferred safe.
const POLICY = 'exact-local-replacement-v1';
const automaticReasons = new Set(['autosave', 'startup', 'central-merge', 'pagehide']);
const envelopeFields = new Set(['id', 'schema', 'app', 'createdAt', 'reason', 'source', 'summary',
  'storage', 'saveContext', 'recoveryCopies', 'recoverySeparations', 'recoveryState', 'retention']);
const entryFields = new Set(['principalScope', 'pendingCentralSync', 'pendingBaseRevision',
  'serverRevision', 'writes', 'hash', 'updatedAt', 'deletedAt', 'localWritePrepared']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = value => record(value) && Object.keys(value).length === 0;
const knownFields = (value, fields) => record(value) && Object.keys(value).every(key => fields.has(key));

function knownCleanSnapshot(snapshot) {
  if (!knownFields(snapshot, envelopeFields) || snapshot.schema !== 'football-science-backup-v1' ||
      snapshot.app !== 'Football Science' || typeof snapshot.id !== 'string' || !snapshot.id ||
      snapshot.id.startsWith('football-session-planner-v3-quota-fallback') ||
      typeof snapshot.createdAt !== 'string' || !snapshot.createdAt || !automaticReasons.has(snapshot.reason) ||
      !empty(snapshot.recoveryCopies) || !empty(snapshot.recoveryState) ||
      !Array.isArray(snapshot.recoverySeparations) || snapshot.recoverySeparations.length ||
      !record(snapshot.storage) || !knownFields(snapshot.saveContext, new Set(['scope', 'entries']))) return false;
  const { scope, entries } = snapshot.saveContext;
  const keys = Object.keys(snapshot.storage);
  if (typeof scope !== 'string' || !scope || !record(entries) || !keys.length ||
      keys.length !== Object.keys(entries).length) return false;
  return keys.every(key => {
    const entry = entries[key];
    return typeof snapshot.storage[key] === 'string' && knownFields(entry, entryFields) &&
      entry.principalScope === scope && entry.pendingCentralSync === false &&
      (!Object.hasOwn(entry, 'localWritePrepared') || entry.localWritePrepared === false) &&
      (!Object.hasOwn(entry, 'deletedAt') || entry.deletedAt === '') &&
      Number.isSafeInteger(entry.serverRevision) && entry.serverRevision > 0 &&
      Number.isSafeInteger(entry.writes) && entry.writes > 0 &&
      typeof entry.updatedAt === 'string' && Boolean(entry.updatedAt) &&
      typeof entry.hash === 'string' && Boolean(entry.hash) &&
      (!Object.hasOwn(entry, 'pendingBaseRevision') ||
        (Number.isSafeInteger(entry.pendingBaseRevision) && entry.pendingBaseRevision >= 0));
  });
}

export function prepareSnapshotRetention(snapshot) {
  if (Object.hasOwn(snapshot, 'retention') || !knownCleanSnapshot(snapshot)) return snapshot;
  return { ...snapshot, retention: { policy: POLICY } };
}

export function permitsExactSnapshotReplacement(snapshot) {
  return snapshot?.retention?.policy === POLICY && Object.keys(snapshot.retention).length === 1 &&
    knownCleanSnapshot(snapshot);
}
