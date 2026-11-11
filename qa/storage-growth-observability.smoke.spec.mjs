import { test, expect } from '@playwright/test';

test('snapshot explanations share the real retention predicate and preserve every byte', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const { collectIndexedDbStorageHealth } = await import('/src/core/indexeddb-storage-health.mjs');
    const h = await retentionHarness({ name: 'football-science-data-safety-v1' });
    const rows = ['ack', 'pending', 'prepared', 'manual', 'recovery', 'unknown', 'pinned', 'deletion'].map(id => h.row(id));
    rows[1].saveContext.entries.key.pendingCentralSync = true;
    rows[2].saveContext.entries.key.localWritePrepared = true;
    rows[3].reason = 'before-restore'; rows[4].recoveryCopies.private = 'secret';
    rows[5].future = 'unknown'; rows[7].saveContext.entries.key.deletedAt = '2026-11-11T12:00:00Z';
    await h.putMany('snapshots', rows);
    await h.putMany('latest', [{ id: 'latest', sourceSnapshotId: 'pinned' }]);
    const before = JSON.stringify(await h.all('snapshots'));
    const modes = [], original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(names, mode, ...args) { modes.push(mode); return original.call(this, names, mode, ...args); };
    let report;
    try { report = await collectIndexedDbStorageHealth({ indexedDB, snapshotPolicy: { schema: 'football-science-backup-v1', hashString: h.hashString } }); }
    finally { IDBDatabase.prototype.transaction = original; }
    const unchanged = before === JSON.stringify(await h.all('snapshots')); h.db.close();
    return { report, modes, unchanged };
  });
  expect(result.unchanged).toBe(true); expect(result.modes).toEqual(['readonly']);
  expect(result.report.databases[0].protection.map(r => [r.label, r.records])).toEqual(expect.arrayContaining([
    ['Acknowledged automatic history', 1], ['Pending or prepared work retained', 2], ['Manual or restore copy retained', 1],
    ['Recovery contents retained', 1], ['Unverified or unsupported history retained', 1], ['Referenced by latest copies', 1], ['Deletion metadata retained', 1],
  ]));
  expect(JSON.stringify(result.report)).not.toContain('secret');
  expect(JSON.stringify(result.report)).not.toContain('actor-A');
});

test('compact inventory counts binary bytes without decoding, writing or claiming recoverability', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { seedCompactHistory, historyRow } = await import('/qa/helpers/compact-history-fixture.mjs');
    const { collectIndexedDbStorageHealth } = await import('/src/core/indexeddb-storage-health.mjs');
    await seedCompactHistory([historyRow('private-id', 'private-scope', 'key', 'private payload'.repeat(1000))]);
    const original = globalThis.DecompressionStream;
    globalThis.DecompressionStream = class { constructor() { throw new Error('Diagnostic may not decode'); } };
    try { return await collectIndexedDbStorageHealth({ indexedDB }); }
    finally { globalThis.DecompressionStream = original; }
  });
  const compact = result.databases.at(-1);
  expect(compact.status).toBe('complete'); expect(compact.records).toBe(1);
  expect(compact.binaryBytes).toBeGreaterThan(0);
  expect(compact.approximateJsonUtf16Bytes).toBeLessThan(3000);
  expect(compact.groups[0].label).toContain('integrity not checked');
  expect(JSON.stringify(result)).not.toContain('private');
});

test('a rotation limit remains visible without turning a successful snapshot into a failed save', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const h = await preservationHarness();
    await h.capture('actor-A', 1, true);
    const original = (await h.all('snapshots'))[0];
    const tx = h.db.transaction('snapshots', 'readwrite');
    for (let i = 0; i < 3001; i++) tx.objectStore('snapshots').put({ ...original, id: 'kept-' + i });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    const countBefore = (await h.all('snapshots')).length;
    await h.capture('actor-A', 2, true);
    const countAfter = (await h.all('snapshots')).length;
    const state = { ...h.service.status }; h.db.close();
    const { openStorageHealth } = await import('/src/core/storage-health-dialog.mjs');
    await openStorageHealth({ documentRef: document, storage: localStorage, indexedDB,
      getSnapshotRotation: () => state.lastSnapshotRotation });
    return { state, countBefore, countAfter };
  });
  expect(result.state.lastSnapshotRotation).toBe('limited');
  expect(result.state.lastSnapshotError).toBe('');
  expect(result.countAfter).toBe(result.countBefore + 1);
  await expect(page.getByRole('dialog')).toContainText('No copies were removed by that attempt');
});

for (const timing of ['during', 'after']) test(`account A to B to A invalidates storage health ${timing} inspection`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  await page.evaluate(async timing => {
    const { openStorageHealth } = await import('/src/core/storage-health-dialog.mjs');
    localStorage.setItem('private-key', 'private-content');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const opening = openStorageHealth({ documentRef: document, storage: localStorage, getScope: () => 'actor-A',
      navigatorRef: { storage: { estimate: () => gate } }, indexedDB });
    if (timing === 'after') { release({ usage: 100 }); await opening; }
    dispatchEvent(new CustomEvent('platform:user-change'));
    dispatchEvent(new CustomEvent('platform:user-change'));
    release({ usage: 100 }); await opening;
  }, timing);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status')).toHaveText('Account or team changed. Reopen this check.');
  await expect(dialog).not.toContainText('Local browser storage:');
  expect(await page.evaluate(() => localStorage.getItem('private-key'))).toBe('private-content');
  await dialog.getByRole('button').click();
});

test('unknown collections and unread binary rows remain explicitly unclassified', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { collectIndexedDbStorageHealth } = await import('/src/core/indexeddb-storage-health.mjs');
    const r = indexedDB.open('football-science-snapshots-compact-v1', 1);
    r.onupgradeneeded = () => {
      for (const name of ['versions', 'blocks', 'private-future-store']) r.result.createObjectStore(name, { keyPath: 'key' });
    };
    const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction(['versions', 'private-future-store'], 'readwrite');
    for (let i = 0; i < 2; i++) tx.objectStore('versions').put({ key: 'private-' + i, packet: { bytes: new Uint8Array(1024) } });
    tx.objectStore('private-future-store').put({ key: 'private', work: 'untouched' });
    await new Promise(resolve => { tx.oncomplete = resolve; });
    const limited = await collectIndexedDbStorageHealth({ indexedDB, maxBytes: 100 });
    const completeKnown = await collectIndexedDbStorageHealth({ indexedDB });
    const retained = await new Promise(resolve => {
      const read = db.transaction('private-future-store').objectStore('private-future-store').get('private');
      read.onsuccess = () => resolve(read.result.work);
    }); db.close();
    return { limited: limited.databases.at(-1), known: completeKnown.databases.at(-1), retained };
  });
  expect(result.limited).toMatchObject({ status: 'partial', stoppedBecause: 'bytes', records: 1, binaryBytes: 1024, totalRecords: null });
  expect(result.known).toMatchObject({ status: 'partial', stoppedBecause: 'unknown-stores', records: 2, unknownStores: 1, totalRecords: null });
  expect(result.retained).toBe('untouched');
  expect(JSON.stringify(result.limited)).not.toContain('private');
  expect(JSON.stringify(result.known)).not.toContain('private');
});
