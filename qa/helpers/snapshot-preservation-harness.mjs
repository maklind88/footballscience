// Synthetic scope transitions, real runtime/native storage/IndexedDB. No server.
export async function preservationHarness({ name = 'qa-preservation-' + crypto.randomUUID() } = {}) {
  const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
  const key = 'football-player-profiles-v1';
  const nativeSet = Storage.prototype.setItem.bind(localStorage);
  let scope = 'actor-A';
  const service = createDataSafetyRuntimeService({
    win: { localStorage, indexedDB, location, crypto, setTimeout: () => 1, clearTimeout() {}, addEventListener() {} },
    documentRef: {}, navigatorRef: {}, storageConstructor: Storage, databaseName: name,
    protectedStorageKeys: [key], getCentralStateBridge: () => ({ getReadScope: () => scope }),
  });
  service.install();
  const db = await service.openDatabase();
  const all = store => new Promise((resolve, reject) => {
    const tx = db.transaction(store), r = tx.objectStore(store).getAll();
    tx.oncomplete = () => resolve(r.result); tx.onabort = tx.onerror = () => reject(tx.error);
  });
  const put = (store, row) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(row);
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  });
  const capture = async (owner, generation, pending = false) => {
    scope = owner;
    const value = JSON.stringify({ owner, generation, content: 'Unique retained work ' + generation });
    // Supply the state a scoped runtime sees; this is not an authenticated switch test.
    nativeSet(key, value);
    service.mutateManifest(m => { m.entries = { [key]: {
      principalScope: owner, writes: generation, hash: service.hashString(value),
      pendingCentralSync: pending, serverRevision: generation, pendingBaseRevision: generation - 1,
      updatedAt: new Date().toISOString(), deletedAt: '',
    } }; });
    if (!await service.saveSnapshot('autosave')) throw new Error(service.status.lastSnapshotError);
    return value;
  };
  return { service, db, key, all, put, capture };
}

export async function retentionHarness({ name = 'qa-retention-' + crypto.randomUUID(), maxSnapshots = 30 } = {}) {
  const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
  const service = createDataSafetyRuntimeService({ maxSnapshots });
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('snapshots', { keyPath: 'id' });
      r.result.createObjectStore('latest', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  const row = (id, scope = 'actor-A') => ({
    id, schema: 'football-science-backup-v1', app: 'Football Science', reason: 'autosave',
    createdAt: '2026-11-07T12:00:00Z', storage: { key: 'Saved content ' + id },
    recoveryCopies: {}, recoveryState: {}, recoverySeparations: [],
    saveContext: { scope, entries: { key: { principalScope: scope, pendingCentralSync: false,
      writes: 1, serverRevision: 2, pendingBaseRevision: 1, hash: service.hashString('Saved content ' + id),
      updatedAt: '2026-11-07T12:00:00Z', deletedAt: '' } } },
  });
  const putMany = (store, rows) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    rows.forEach(row => tx.objectStore(store).put(row));
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  });
  const all = store => new Promise((resolve, reject) => {
    const tx = db.transaction(store), r = tx.objectStore(store).getAll();
    tx.oncomplete = () => resolve(r.result); tx.onabort = tx.onerror = () => reject(tx.error);
  });
  return { db, row, putMany, all, hashString: service.hashString, prune: database => service.pruneSnapshots(database || db) };
}
