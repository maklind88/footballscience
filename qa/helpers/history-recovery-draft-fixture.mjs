export const recoveryKey = 'football-session-planner-v3';
export function recoveryEnvelope(scope = 'actor-A', id = 'history-one') {
  const value = JSON.stringify({ selectedDate: '2026-11-12',
    sessions: { '2026-11-12': { date: '2026-11-12', title: 'Recovered training', selectedBlockId: 'block-one',
      blocks: [{ id: 'block-one', title: 'Pressing', objective: 'Historical pending objective åäö', minutes: 20 }] } },
    blockDeletionTombstones: { '2026-11-12': { removed: '2026-11-11T14:00:00Z' } } });
  return { id, schema: 'football-science-backup-v1', app: 'Football Science', reason: 'autosave',
    createdAt: '2026-11-12T10:00:00Z', storage: { [recoveryKey]: value }, recoveryCopies: {}, recoveryState: {}, recoverySeparations: [],
    saveContext: { scope, entries: { [recoveryKey]: { principalScope: scope, pendingCentralSync: true, localWritePrepared: true,
      serverRevision: 7, pendingBaseRevision: 6, writes: 8, deletedAt: '', updatedAt: '2026-11-12T10:00:00Z', hash: 'original-metadata' } } } };
}
export async function seedLegacyRecovery(row, name = 'qa-history-recovery-source') {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put(row);
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function recoveryFixture({ source = 'legacy', storeOptions = {} } = {}) {
  const { createSnapshotCompatibleReader } = await import('/src/core/snapshot-compatible-reader.mjs');
  const { createSnapshotRecoveryDrafts } = await import('/src/core/snapshot-recovery-draft-service.mjs');
  const row = recoveryEnvelope();
  if (source === 'legacy') await seedLegacyRecovery(row);
  else await (await import('/qa/helpers/compact-history-fixture.mjs')).seedCompactHistory([row], source);
  const state = { scope: 'actor-A', generation: '1', canPrepare: true, allowedKeys: new Set([recoveryKey]) };
  const abort = new AbortController();
  const reader = createSnapshotCompatibleReader({ indexedDB, databaseName: 'qa-history-recovery-source',
    getAccess: () => ({ ...state, canReview: state.canPrepare }) });
  const service = createSnapshotRecoveryDrafts({ indexedDB, reader, getAccess: () => state, signal: abort.signal, storeOptions });
  return { state, abort, row, reader, service, source: source === 'legacy' ? 'legacy' : 'compact',
    prepare: () => service.prepare({ source: source === 'legacy' ? 'legacy' : 'compact', id: row.id, expected: row }) };
}
export async function recoveryDump() {
  const name = 'football-science-history-drafts-v1';
  if (!(await indexedDB.databases()).some(db => db.name === name && db.version)) return null;
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts', 'catalog']);
      const drafts = tx.objectStore('drafts').getAll(), catalog = tx.objectStore('catalog').getAll();
      tx.oncomplete = () => resolve({ drafts: drafts.result, catalog: catalog.result }); tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
