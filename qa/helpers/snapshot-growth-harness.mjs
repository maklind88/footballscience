// Browser-side fixture: real IDB transactions, no application/user database.
export async function snapshotGrowthHarness({ name = 'qa-snapshot-growth-' + crypto.randomUUID() } = {}) {
  const { storeDistinctSnapshot } = await import('/src/core/distinct-snapshot-store.mjs');
  const open = () => new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('snapshots', { keyPath: 'id' });
      r.result.createObjectStore('latest', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  const db = await open();
  const row = (id, scope = 'A') => ({ id, schema: 'football-science-backup-v1', app: 'Football Science',
    createdAt: '2026-11-06T12:00:00Z', storage: { key: 'Retained content' }, recoveryCopies: {},
    recoverySeparations: [], recoveryState: {}, saveContext: { scope, entries: { key: {
      principalScope: scope, writes: 1, serverRevision: 3, pendingBaseRevision: 3, pendingCentralSync: true,
    } } } });
  const transact = (store, mode, action) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result); tx.onabort = tx.onerror = () => reject(tx.error);
  });
  const all = store => transact(store, 'readonly', s => s.getAll());
  const write = (value, database = db) => storeDistinctSnapshot(database, 'snapshots', 'latest', value);
  return { db, open, row, transact, all, write };
}
