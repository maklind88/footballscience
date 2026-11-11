import { expect } from '@playwright/test';

// Disposable Playwright profile only. Synthetic IDB history never enters native
// module values. The restore fault uses an isolated in-memory Storage instance.
export async function verifyStorageGrowthLive(page) {
  expect(await page.evaluate(() => window.platformAuthStore?.getCurrentUser?.()?.role)).toBe('admin');
  await page.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  const id = 'qa-live-growth-' + crypto.randomUUID();
  const before = await page.evaluate(async id => {
    const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
    const service = createDataSafetyRuntimeService();
    const scope = window.footballScienceCentralState.getReadScope();
    if (!scope) throw new Error('Live scope required');
    const key = 'football-player-profiles-v1', value = 'Synthetic retained growth probe';
    const row = { id, schema: 'football-science-backup-v1', app: 'Football Science', reason: 'autosave',
      createdAt: '2026-11-11T12:00:00.000Z', storage: { [key]: value },
      recoveryCopies: {}, recoveryState: {}, recoverySeparations: [], saveContext: { scope,
        entries: { [key]: { principalScope: scope, pendingCentralSync: true, localWritePrepared: true,
          writes: 1, serverRevision: 1, pendingBaseRevision: 1, hash: service.hashString(value),
          updatedAt: '2026-11-11T12:00:00.000Z', deletedAt: '' } } } };
    const request = indexedDB.open('football-science-data-safety-v1');
    request.onupgradeneeded = () => request.transaction.abort();
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').add(row);
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    } finally { db.close(); }
    return { row: JSON.stringify(row), compactAbsent: !(await indexedDB.databases()).some(db => db.name === 'football-science-snapshots-compact-v1') };
  }, id);
  expect(before.compactAbsent).toBe(true);
  await page.locator('#profileMenuButton').click();
  await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
  const health = page.getByRole('dialog', { name: 'Storage health', exact: true });
  await expect(health).toContainText('Pending or prepared work retained:');
  await expect(health).toContainText('Additional saved copies: Not present');
  await expect(health).toContainText(/History rotation result is unavailable|The last history rotation on this page/);
  await expect(health).not.toContainText('Synthetic retained growth probe');
  await health.getByRole('button', { name: 'Close storage health' }).click();
  const outcome = await page.evaluate(async id => {
    const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
    class ProbeStorage {
      constructor() { this.values = new Map(); }
      get length() { return this.values.size; }
      key(i) { return [...this.values.keys()][i] ?? null; }
      getItem(k) { return this.values.get(String(k)) ?? null; }
      setItem(k, v) { this.values.set(String(k), String(v)); }
      removeItem(k) { this.values.delete(String(k)); }
      clear() { this.values.clear(); }
    }
    const storage = new ProbeStorage(), key = 'football-player-profiles-v1', alerts = [];
    let centralWrites = 0;
    const runtime = createDataSafetyRuntimeService({
      win: { localStorage: storage, indexedDB, document: {}, crypto, location: { reload() { throw new Error('Unexpected reload'); } },
        confirm: () => true, alert: m => alerts.push(m), setTimeout: () => 1, clearTimeout() {}, addEventListener() {} },
      documentRef: {}, navigatorRef: {}, storageConstructor: ProbeStorage, databaseName: id,
      protectedStorageKeys: [key], getCentralStateBridge: () => ({ getReadScope: () => 'qa-isolated-scope' }),
      queueCentralStateWrite: () => centralWrites++,
    });
    runtime.install(); storage.setItem(key, 'Synthetic unsynced original');
    const entries = JSON.stringify(runtime.readManifest().entries), originalWrites = centralWrites;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.transaction.db.name === id && this.name === 'snapshots') throw new DOMException('Synthetic quota limit', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { await runtime.importBackupFile({ text: async () => JSON.stringify({ schema: 'football-science-backup-v1', storage: { [key]: 'Must not replace' } }) }); }
    finally { IDBObjectStore.prototype.put = put; }
    (await runtime.openDatabase()).close();
    const r = indexedDB.open('football-science-data-safety-v1');
    r.onupgradeneeded = () => r.transaction.abort();
    const db = await new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    let retained;
    try { retained = await new Promise((resolve, reject) => {
      const read = db.transaction('snapshots').objectStore('snapshots').get(id);
      read.onsuccess = () => resolve(JSON.stringify(read.result)); read.onerror = () => reject(read.error);
    }); } finally { db.close(); }
    return { retained, originalRetained: storage.getItem(key) === 'Synthetic unsynced original',
      metadataRetained: entries === JSON.stringify(runtime.readManifest().entries), newWrites: centralWrites - originalWrites,
      stopped: alerts.some(m => m.startsWith('Backup not restored.')), compactAbsent: !(await indexedDB.databases()).some(db => db.name === 'football-science-snapshots-compact-v1') };
  }, id);
  expect(outcome).toEqual({ retained: before.row, originalRetained: true, metadataRetained: true, newWrites: 0, stopped: true, compactAbsent: true });
}
