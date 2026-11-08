// Native browser storage and production save/sync services; deterministic server
// and timer boundaries. Scope switching is a fixture, not authenticated UI proof.
export async function saveSyncGrowthHarness({ name = 'qa-save-sync-growth-' + crypto.randomUUID() } = {}) {
  const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
  const { createCentralSyncRuntimeService } = await import('/src/core/central-sync-runtime-service.mjs');
  const key = 'football-player-profiles-v1', secondary = 'football-team-notes-v1';
  const originalSet = Storage.prototype.setItem, nativeSet = originalSet.bind(localStorage);
  const cache = new Map(), server = new Map(), calls = [], statuses = [], timers = new Map();
  let scope = 'actor-A', offline = false, sync, timer = 0, failedKey = '', hold, releaseReceipt;
  Storage.prototype.setItem = function(k, value) {
    if (this === localStorage && k === failedKey) throw new DOMException('Synthetic full storage', 'QuotaExceededError');
    return originalSet.call(this, k, value);
  };
  const bridge = {
    getReadScope: () => scope, isHydrated: () => true, isCentralKey: () => true, canAutoSyncKey: () => true,
    getStatus: () => ({ metadata: Object.fromEntries([key, secondary].map(k => [k, { revision: server.get(scope + k)?.revision || 0 }])) }),
    getCachedValue: k => cache.get(k)?.value, getCachedValueInfo: k => cache.get(k) || {},
    setCachedValue(k, value, info = {}) { cache.set(k, { value, source: 'local-write', durable: true, ...info }); return true; },
    async syncKey(k, value, options) {
      const owner = scope;
      calls.push({ scope, key: k, value, options });
      if (offline) throw new Error('Synthetic offline boundary');
      if (hold) { const waiting = hold; hold = null; await waiting; }
      const previous = server.get(owner + k);
      const row = { value, revision: (previous?.revision || 0) + 1 };
      server.set(owner + k, row);
      return { ok: true, ...row };
    },
  };
  const win = { localStorage, indexedDB, location, crypto, footballScienceCentralState: bridge,
    addEventListener() {}, console: { warn() {} },
    setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); } };
  const safety = createDataSafetyRuntimeService({ win, documentRef: {}, navigatorRef: {}, storageConstructor: Storage,
    databaseName: name, protectedStorageKeys: [key, secondary], journaledStorageKeys: [],
    getCentralStateBridge: () => bridge, queueCentralStateWrite: (...args) => sync.queueCentralStateWrite(...args) });
  sync = createCentralSyncRuntimeService({ win, getCurrentUser: () => ({ id: scope }),
    ...Object.fromEntries(['rawGetItem', 'rawSetItem', 'cacheAcknowledgedValue', 'readManifest', 'mutateManifest',
      'hashString', 'getStorageLabel', 'isProtectedStorageKey', 'queueSnapshot', 'queueStatusRefresh'].map(k => [k, safety[k]])),
    handleSyncStatus: (key, state) => statuses.push({ key, state }),
  });
  safety.install();
  const db = await safety.openDatabase();
  const all = store => new Promise((resolve, reject) => {
    const tx = db.transaction(store), request = tx.objectStore(store).getAll();
    tx.oncomplete = () => resolve(request.result); tx.onabort = tx.onerror = () => reject(tx.error);
  });
  const capture = async () => { if (!await safety.saveSnapshot('autosave')) throw new Error(safety.status.lastSnapshotError); };
  const measure = async () => {
    const rows = await all('snapshots'), latest = await all('latest');
    const pending = rows.filter(row => Object.values(row.saveContext.entries).some(entry => entry.pendingCentralSync));
    return { rows: rows.length, pending: pending.length, historyBytes: JSON.stringify(rows).length * 2,
      latestBytes: JSON.stringify(latest).length * 2, nativeBytes: Array.from({ length: localStorage.length }, (_, i) => {
        const k = localStorage.key(i); return (k.length + localStorage.getItem(k).length) * 2;
      }).reduce((a, b) => a + b, 0) };
  };
  const savedScope = () => ({ scope, manifest: safety.readManifest(), values: safety.collectStorageData() });
  const restoreScope = saved => {
    scope = saved.scope; cache.clear();
    for (const [k, value] of Object.entries(saved.values)) nativeSet(k, value);
    safety.mutateManifest(m => { m.entries = saved.manifest.entries; });
  };
  return { db, key, secondary, safety, sync, server, calls, statuses, all, capture, measure, savedScope, restoreScope,
    setScope: value => { scope = value; cache.clear(); }, offline: value => { offline = value; },
    failWritesFor: value => { failedKey = value; },
    holdReceipt: () => { hold = new Promise(resolve => { releaseReceipt = resolve; }); },
    releaseReceipt: () => releaseReceipt(),
    edit: (value, k = key) => localStorage.setItem(k, value), flush: () => sync.flushCentralStateWrites() };
}
