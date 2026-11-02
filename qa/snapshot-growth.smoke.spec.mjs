import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const key = 'football-exercises-v2';
const recoveryId = 'football-session-planner-v3-quota-fallback:synthetic-owner';

// Isolated runtime, actual IndexedDB. Scheduling is manual, remote transport absent.
// Serialized UTF-16 bytes are not physical disk usage or browser quota headroom.
async function boot(page, options = {}) {
  await page.goto('/medical-merge.js');
  await page.evaluate(async ({ key, recoveryId, databaseName, maxSnapshots = 30 }) => {
    const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
    const service = createDataSafetyRuntimeService({
      win: { localStorage, indexedDB, crypto, location, setTimeout: () => 0, clearTimeout() {}, addEventListener() {} },
      documentRef: document, navigatorRef: {}, storageConstructor: Storage,
      databaseName, protectedStorageKeys: [key], maxSnapshots,
      getCentralStateBridge: () => ({ getReadScope: () => 'synthetic-owner' }),
    });
    service.install();
    const database = await service.openDatabase();
    const read = store => new Promise((resolve, reject) => {
      const tx = database.transaction(store, 'readonly');
      const request = tx.objectStore(store).getAll();
      let rows;
      request.onsuccess = () => { rows = request.result; };
      tx.oncomplete = () => resolve(rows);
      tx.onabort = () => reject(tx.error);
    });
    const retained = { id: recoveryId, scope: 'synthetic-owner', value: 'Unsynced Sessions work', baseRevision: 7 };
    const seedRecovery = async () => {
      const tx = database.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(retained);
      await service.waitForTransaction(tx);
    };
    const inspect = async () => {
      const rows = await read('snapshots'), latest = await read('latest');
      const history = rows.filter(row => row.id !== recoveryId);
      return { rows, latest, count: history.length, historyBytes: history.reduce((n, row) => n + JSON.stringify(row).length * 2, 0),
        latestBytes: JSON.stringify(latest[0] || {}).length * 2, payloads: history.map(row => row.storage[key]),
        recovery: rows.find(row => row.id === recoveryId) };
    };
    const setValue = revision => service.rawSetItem(key, JSON.stringify({ padding: 'x'.repeat(128 * 1024), revision }));
    window.snapshotProbe = { service, database, retained, seedRecovery, inspect, setValue };
  }, { key, recoveryId, databaseName: options.databaseName || `qa-snapshot-growth-${crypto.randomUUID()}`, ...options });
}

for (const change of ['payload', 'receipt-metadata']) {
  test(`snapshot growth is count-bounded, not byte-bounded, for ${change} changes`, async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(async change => {
      const p = window.snapshotProbe;
      await p.seedRecovery();
      p.setValue(0);
      const statuses = [];
      for (let revision = 0; revision < 35; revision++) {
        if (change === 'payload') p.setValue(revision);
        else p.service.mutateManifest(manifest => {
          manifest.entries['football-exercises-v2'] = { principalScope: 'synthetic-owner', pendingCentralSync: false, serverRevision: revision };
        });
        statuses.push(await p.service.saveSnapshot('qa-growth'));
      }
      const before = await p.inspect();
      for (let repeat = 0; repeat < 10; repeat++) statuses.push(await p.service.saveSnapshot('qa-unchanged'));
      const after = await p.inspect();
      return { allSaved: statuses.every(Boolean), count: after.count,
        bytesUnchanged: after.historyBytes === before.historyBytes && after.latestBytes === before.latestBytes,
        rowsUnchanged: JSON.stringify(after.rows) === JSON.stringify(before.rows),
        latestRevision: JSON.parse(after.latest[0].storage['football-exercises-v2']).revision,
        allPayloadsRetained: after.payloads.every(value => JSON.parse(value).padding.length === 128 * 1024),
        recoveryUnchanged: JSON.stringify(after.recovery) === JSON.stringify(p.retained),
        historyBytes: after.historyBytes, latestBytes: after.latestBytes,
        payloadBytes: after.latest[0].storage['football-exercises-v2'].length * 2 };
    }, change);
    expect(result).toMatchObject({ allSaved: true, count: 30, bytesUnchanged: true, rowsUnchanged: true,
      latestRevision: change === 'payload' ? 34 : 0, allPayloadsRetained: true, recoveryUnchanged: true });
    expect(result.historyBytes).toBeGreaterThanOrEqual(30 * result.payloadBytes);
    expect(result.latestBytes).toBeGreaterThanOrEqual(result.payloadBytes);
    console.log(JSON.stringify({ snapshotGrowth: { change, count: result.count, historyBytes: result.historyBytes,
      latestBytes: result.latestBytes, payloadBytes: result.payloadBytes, measure: 'serialized-utf16-not-physical-disk' } }));
  });
}

test('snapshot quota failure preserves committed history, latest and recovery; retry resumes rotation', async ({ page }) => {
  await boot(page, { maxSnapshots: 3 });
  const result = await page.evaluate(async () => {
    const p = window.snapshotProbe;
    await p.seedRecovery();
    for (let revision = 0; revision < 3; revision++) {
      p.setValue(revision);
      if (!await p.service.saveSnapshot('qa-before-quota')) throw new Error('Baseline snapshot failed');
    }
    const before = await p.inspect();
    const original = IDBObjectStore.prototype.put;
    let injected = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'latest' && this.transaction.db.name === p.database.name) {
        injected++;
        throw new DOMException('Injected snapshot quota refusal', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
    p.setValue(3);
    let saved;
    try { saved = await p.service.saveSnapshot('qa-injected-quota'); }
    finally { IDBObjectStore.prototype.put = original; }
    const failed = await p.inspect();
    const errorReported = Boolean(p.service.status.lastSnapshotError && p.service.readManifest().lastSnapshotError);
    const retried = await p.service.saveSnapshot('qa-after-quota');
    const after = await p.inspect();
    return { saved, injected, errorReported, unchanged: JSON.stringify(failed) === JSON.stringify(before), retried,
      warningCleared: !p.service.status.lastSnapshotError, count: after.count,
      latestRevision: JSON.parse(after.latest[0].storage['football-exercises-v2']).revision,
      recoveryUnchanged: JSON.stringify(after.recovery) === JSON.stringify(p.retained) };
  });
  expect(result).toEqual({ saved: false, injected: 1, errorReported: true, unchanged: true, retried: true,
    warningCleared: true, count: 3, latestRevision: 3, recoveryUnchanged: true });
});

test('offline snapshot and protected recovery survive a closed disk profile and an offline read', async ({ playwright, browserName, baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), 'fs-snapshot-restart-'));
  const databaseName = `qa-snapshot-restart-${crypto.randomUUID()}`;
  let context;
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true, baseURL });
    let page = await context.newPage();
    await boot(page, { databaseName });
    await context.setOffline(true);
    const before = await page.evaluate(async () => {
      const p = window.snapshotProbe;
      await p.seedRecovery(); p.setValue(17);
      if (!await p.service.saveSnapshot('qa-offline')) throw new Error('Offline snapshot failed');
      return p.inspect();
    });
    await context.close(); context = null;
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true, baseURL });
    page = await context.newPage();
    // Code assets load online. This proves disk persistence, not offline app-shell startup.
    await boot(page, { databaseName });
    await context.setOffline(true);
    const after = await page.evaluate(() => window.snapshotProbe.inspect());
    expect(after).toEqual(before);
    expect(after.count).toBe(1);
    expect(after.recovery.value).toBe('Unsynced Sessions work');
    expect(JSON.parse(after.latest[0].storage[key]).revision).toBe(17);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
