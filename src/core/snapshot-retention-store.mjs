const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const emptyObject = value => object(value) && Object.keys(value).length === 0;
const envelopeFields = new Set(['id', 'schema', 'app', 'createdAt', 'reason', 'source', 'summary',
  'storage', 'recoveryCopies', 'recoveryState', 'recoverySeparations', 'saveContext']);
const entryFields = new Set(['principalScope', 'pendingCentralSync', 'pendingBaseRevision', 'serverRevision',
  'writes', 'hash', 'updatedAt', 'deletedAt', 'localWritePrepared']);
const automaticReasons = new Set(['autosave', 'startup', 'central-merge']);

// Rotation is for positively acknowledged ordinary history, never for unresolved
// work. Missing/legacy/future metadata is not evidence that a copy is disposable.
export function isRotatingSnapshot(row, { schema, hashString }) {
  if (!object(row) || row.schema !== schema || row.app !== 'Football Science' ||
      typeof row.id !== 'string' || !row.id || row.id.startsWith('football-session-planner-v3-quota-fallback') ||
      typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) ||
      !automaticReasons.has(row.reason) || Object.keys(row).some(key => !envelopeFields.has(key)) ||
      !emptyObject(row.recoveryCopies) || !emptyObject(row.recoveryState) ||
      !Array.isArray(row.recoverySeparations) || row.recoverySeparations.length || !object(row.storage)) return false;
  const context = row.saveContext;
  if (!object(context) || typeof context.scope !== 'string' || !context.scope || !object(context.entries) ||
      Object.keys(context).some(key => !['scope', 'entries'].includes(key))) return false;
  const keys = Object.keys(row.storage);
  // An absent payload may be a pending deletion. Do not rotate its metadata away.
  if (!keys.length || keys.length !== Object.keys(context.entries).length) return false;
  return keys.every(key => {
    const value = row.storage[key], entry = context.entries[key];
    return typeof value === 'string' && Object.hasOwn(context.entries, key) && object(entry) &&
      Object.keys(entry).every(field => entryFields.has(field)) && entry.principalScope === context.scope &&
      entry.pendingCentralSync === false && (entry.localWritePrepared === undefined || entry.localWritePrepared === false) &&
      Number.isSafeInteger(entry.serverRevision) && entry.serverRevision > 0 &&
      Number.isSafeInteger(entry.pendingBaseRevision) && entry.pendingBaseRevision >= 0 &&
      entry.serverRevision > entry.pendingBaseRevision && Number.isSafeInteger(entry.writes) && entry.writes >= 0 &&
      typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt)) && entry.deletedAt === '' &&
      typeof hashString === 'function' && entry.hash === hashString(value);
  });
}

// Selection and deletion share the same transaction as the latest-pointer read.
// Another connection cannot replace a selected row with unresolved work between
// inspection and deletion. Limits fail closed and leave every row untouched.
export function pruneAcknowledgedSnapshots(database, { snapshotStore, latestStore, maxSnapshots, schema, hashString,
  maxRecords = 3000, maxBytes = 100 * 1024 * 1024 }) {
  if (!Number.isSafeInteger(maxSnapshots) || maxSnapshots < 1) return Promise.resolve({ deleted: 0, limited: true });
  return new Promise((resolve, reject) => {
    const tx = database.transaction([snapshotStore, latestStore], 'readwrite');
    const store = tx.objectStore(snapshotStore), candidates = [], pinned = new Set();
    let failure, limited = false, records = 0, bytes = 0, deleted = 0;
    tx.oncomplete = () => resolve({ deleted, limited });
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Snapshot retention transaction failed.'));
    const latest = tx.objectStore(latestStore).get('latest');
    latest.onsuccess = () => {
      try {
        if (typeof latest.result?.sourceSnapshotId === 'string') pinned.add(latest.result.sourceSnapshotId);
        for (const ref of Array.isArray(latest.result?.recentSnapshotRefs) ? latest.result.recentSnapshotRefs : []) {
          if (typeof ref?.id === 'string') pinned.add(ref.id);
        }
        const request = store.openCursor();
        request.onsuccess = () => {
          try {
            const cursor = request.result;
            if (!cursor) {
              for (const key of candidates.slice(0, Math.max(0, candidates.length - maxSnapshots))) {
                if (!pinned.has(key)) { store.delete(key); deleted++; }
              }
              return;
            }
            const row = cursor.value;
            bytes += JSON.stringify(row)?.length * 2 || 0;
            if (++records > maxRecords || bytes > maxBytes) { limited = true; return; }
            if (isRotatingSnapshot(row, { schema, hashString })) candidates.push(cursor.primaryKey);
            cursor.continue();
          } catch (error) { failure = error; tx.abort(); }
        };
      } catch (error) { failure = error; tx.abort(); }
    };
  });
}
