import { test, expect } from '@playwright/test';
import { installStorageHealthAppFixture, waitForStorageHealthApp } from './helpers/storage-health-app-fixture.mjs';

test('real pending snapshot survives compact decoding exactly, but review export cannot silently restore it', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const { seedCompactHistory } = await import('/qa/helpers/compact-history-fixture.mjs');
    const { createSnapshotCompatibleReader } = await import('/src/core/snapshot-compatible-reader.mjs');
    const { encodeSnapshotReview } = await import('/src/core/snapshot-history-format.mjs');
    const h = await preservationHarness();
    await h.capture('actor-A', 1, true);
    const row = (await h.all('snapshots'))[0];
    await seedCompactHistory([row]);
    const reader = createSnapshotCompatibleReader({ indexedDB, databaseName: h.db.name,
      getAccess: () => ({ scope: 'actor-A', generation: 1, canReview: true, allowedKeys: new Set([h.key]) }) });
    const compact = await reader.read({ source: 'compact', id: row.id });
    const before = localStorage.getItem(h.key), metadata = JSON.stringify(h.service.readManifest().entries);
    await h.service.importBackupFile({ text: async () => encodeSnapshotReview(compact.envelope, 'actor-A', new Set([h.key])) });
    const unchanged = before === localStorage.getItem(h.key) && metadata === JSON.stringify(h.service.readManifest().entries);
    h.db.close();
    return { status: compact.status, exact: JSON.stringify(row) === JSON.stringify(compact.envelope), unchanged,
      pending: compact.envelope.saveContext.entries[h.key].pendingCentralSync };
  });
  expect(result).toEqual({ status: 'ok', exact: true, unchanged: true, pending: true });
});

test('large legitimate legacy envelope exposes the compact reader admission limit without altering legacy work', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { seedCompactHistory, historyRow } = await import('/qa/helpers/compact-history-fixture.mjs');
    const { createSnapshotCompatibleReader } = await import('/src/core/snapshot-compatible-reader.mjs');
    const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const h = await retentionHarness();
    const row = historyRow('large', 'actor-A', 'key', 'x'.repeat(8 * 1024 * 1024));
    await h.putMany('snapshots', [row]); await seedCompactHistory([row]);
    const reader = createSnapshotCompatibleReader({ indexedDB, databaseName: h.db.name,
      getAccess: () => ({ scope: 'actor-A', generation: 1, canReview: true, allowedKeys: new Set(['key']) }) });
    const compact = await reader.read({ source: 'compact', id: row.id });
    const unchanged = JSON.stringify((await h.all('snapshots'))[0]) === JSON.stringify(row); h.db.close();
    return { status: compact.status, unchanged };
  });
  expect(result).toEqual({ status: 'limited', unchanged: true });
});

for (const fault of ['quota', 'abort', 'none', 'cancel']) test(`restore preservation gate: ${fault}`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async fault => {
    const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
    const key = 'football-player-profiles-v1', alerts = [], queued = [];
    const service = createDataSafetyRuntimeService({
      win: { localStorage, indexedDB, document: {}, location, crypto, confirm: () => fault !== 'cancel',
        alert: message => alerts.push(message), setTimeout: () => 1, clearTimeout() {}, addEventListener() {} },
      documentRef: {}, navigatorRef: {}, storageConstructor: Storage, protectedStorageKeys: [key],
      databaseName: 'qa-restore-gate', getCentralStateBridge: () => ({ getReadScope: () => 'actor-A' }),
      queueCentralStateWrite: (...args) => queued.push(args),
    });
    service.install(); localStorage.setItem(key, 'unsynced original');
    const before = JSON.stringify(service.readManifest().entries), writes = queued.length;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'snapshots' && fault === 'quota') throw new DOMException('Test full storage', 'QuotaExceededError');
      const result = put.apply(this, args);
      if (this.name === 'snapshots' && fault === 'abort') this.transaction.abort();
      return result;
    };
    try { await service.importBackupFile({ text: async () => JSON.stringify({ schema: 'football-science-backup-v1', storage: { [key]: 'replacement' } }) }); }
    finally { IDBObjectStore.prototype.put = put; }
    const db = await service.openDatabase();
    const snapshots = await new Promise(resolve => {
      const r = db.transaction('snapshots').objectStore('snapshots').getAll(); r.onsuccess = () => resolve(r.result);
    }); db.close();
    return { value: localStorage.getItem(key), metadataUnchanged: before === JSON.stringify(service.readManifest().entries),
      newWrites: queued.length - writes, alerts, protectedOriginal: snapshots.some(row => row.reason === 'before-restore' &&
        row.storage[key] === 'unsynced original' && row.saveContext.entries[key].pendingCentralSync === true) };
  }, fault);
  if (fault === 'none') {
    expect(result.value).toBe('replacement'); expect(result.protectedOriginal).toBe(true);
    expect(result.alerts.join(' ')).toContain('Backup restored');
  } else {
    expect(result.value).toBe('unsynced original'); expect(result.metadataUnchanged).toBe(true); expect(result.newWrites).toBe(0);
    if (fault !== 'cancel') expect(result.alerts.join(' ')).toContain('Backup not restored');
  }
});

test('isolated atomic writer feeds the product reader and rejects quota, collisions and oversized generations', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
    const { createSnapshotCompatibleReader, compactSnapshotDatabaseName } = await import('/src/core/snapshot-compatible-reader.mjs');
    const h = await preservationHarness(), name = 'qa-lossless-product-chain';
    const writer = await openLosslessStore(name, 'standalone');
    const expected = [];
    for (let i = 0; i < 35; i++) {
      await h.capture('actor-A', i + 1, true);
      const row = (await h.all('snapshots')).find(row => JSON.parse(row.storage[h.key]).generation === i + 1);
      expected.push(row); await writer.append(row);
    }
    const original = expected[0], before = await writer.stats();
    const retry = await writer.append(original);
    let collision = false, quota = false, oversized = false;
    try { await writer.append({ ...original, storage: { [h.key]: 'different content' } }); } catch { collision = true; }
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      if (this.transaction.db.name === name) throw new DOMException('Test quota', 'QuotaExceededError');
      return add.apply(this, args);
    };
    try { await writer.append({ ...original, id: 'quota' }); } catch { quota = true; }
    finally { IDBObjectStore.prototype.add = add; }
    try { await writer.append({ ...original, id: 'large', storage: { [h.key]: 'x'.repeat(8 * 1024 * 1024) } }); } catch { oversized = true; }
    const unchanged = JSON.stringify(await writer.stats()) === JSON.stringify(before);
    writer.close();
    // Read-only name mapping keeps the existing QA writer in its QA database.
    // It tests the real reader/format, not production discovery or authentication.
    const factory = {
      databases: async () => (await indexedDB.databases()).map(db => db.name === name ? { ...db, name: compactSnapshotDatabaseName } : db),
      open: requested => indexedDB.open(requested === compactSnapshotDatabaseName ? name : requested),
    };
    const reader = createSnapshotCompatibleReader({ indexedDB: factory, databaseName: h.db.name,
      getAccess: () => ({ scope: 'actor-A', generation: 1, canReview: true, allowedKeys: new Set([h.key]) }) });
    const recovered = [];
    for (const row of expected) recovered.push(await reader.read({ source: 'compact', id: row.id }));
    h.db.close();
    return { retry, collision, quota, oversized, unchanged,
      recovered: recovered.filter((r, i) => r.status === 'ok' && JSON.stringify(r.envelope) === JSON.stringify(expected[i])).length };
  });
  expect(result).toEqual({ retry: { inserted: false }, collision: true, quota: true, oversized: true, unchanged: true, recovered: 35 });
});

test('readiness counterexample: current app shell cannot be guaranteed to reopen cold offline', async ({ page, context }) => {
  await installStorageHealthAppFixture(page);
  await page.goto('/?workspace=medical-team'); await waitForStorageHealthApp(page);
  await page.evaluate(async () => {
    localStorage.setItem('qa-cold-offline-sentinel', 'unsynced work retained');
    await navigator.serviceWorker.register('/footballscience-sw.js'); await navigator.serviceWorker.ready;
  });
  const url = page.url();
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  let failed = false;
  try { await reopened.goto(url, { timeout: 10000 }); } catch { failed = true; }
  const ready = await reopened.evaluate(() => Boolean(window.__footballScienceAppReady)).catch(() => false);
  expect(failed || !ready).toBe(true);
  await context.setOffline(false);
  await reopened.goto(new URL('/medical-merge.js', url).href);
  expect(await reopened.evaluate(() => localStorage.getItem('qa-cold-offline-sentinel'))).toBe('unsynced work retained');
});
