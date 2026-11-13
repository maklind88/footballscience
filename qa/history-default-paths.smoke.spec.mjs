import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('/medical-merge.js'); });
async function seed(page, mode = 'standalone') {
  await page.evaluate(async mode => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const { seedCompactHistory } = await import('/qa/helpers/compact-history-fixture.mjs');
    const h = window.h = await saveSyncGrowthHarness(); // NO archive injection.
    h.edit('Original pending work');
    const row = { ...h.safety.createBackupEnvelope('autosave'), id: 'retained-version' };
    await seedCompactHistory([row], mode);
    window.prior = { value: localStorage.getItem(h.key), entries: JSON.stringify(h.safety.readManifest().entries) };
    const tx = h.db.transaction('latest', 'readwrite');
    tx.objectStore('latest').put({ id: 'session-save:protected', scope: 'actor-A', status: 'pending', change: { id: 'protected', value: 'Keep journal' } });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
  }, mode);
}
for (const mode of ['standalone', 'pooled']) test(`default runtime reuses ${mode} history for every capture reason without touching pending work`, async ({ page }) => {
  await seed(page, mode);
  const result = await page.evaluate(async () => {
    const results = [];
    const original = IDBDatabase.prototype.transaction;
    let compactWrites = 0;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === 'football-science-snapshots-compact-v1' && mode === 'readwrite') { compactWrites++; throw new Error('Forbidden compact write'); }
      return original.call(this, stores, mode, ...rest);
    };
    for (const reason of ['autosave', 'cross-tab-update', 'pagehide', 'manual-export', 'before-restore', 'after-restore',
      'before-remove', 'after-remove', 'before-clear', 'exercise-library-save', 'exercise-library-folders-save'])
      results.push(await h.safety.saveSnapshot(reason));
    IDBDatabase.prototype.transaction = original;
    return { results, copies: (await h.all('snapshots')).length, latest: await h.all('latest'), compactWrites,
      value: localStorage.getItem(h.key), entriesSame: prior.entries === JSON.stringify(h.safety.readManifest().entries) };
  });
  expect(result).toEqual({ results: Array(11).fill(true), copies: 0, compactWrites: 0, value: 'Original pending work', entriesSame: true,
    latest: [{ id: 'session-save:protected', scope: 'actor-A', status: 'pending', change: { id: 'protected', value: 'Keep journal' } }] });
});

test('a stale capture finds its exact older compact version after the compact head advanced', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const { seedCompactHistory } = await import('/qa/helpers/compact-history-fixture.mjs');
    const h = await saveSyncGrowthHarness();
    h.edit('Older protected work'); const old = h.savedScope();
    const older = { ...h.safety.createBackupEnvelope('autosave'), id: 'older' };
    h.edit('Newer protected work');
    const newer = { ...h.safety.createBackupEnvelope('autosave'), id: 'newer' };
    await seedCompactHistory([older, newer]);
    const request = indexedDB.open('football-science-snapshots-compact-v1', 2);
    request.onupgradeneeded = () => request.result.createObjectStore('heads', { keyPath: 'key' });
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction('heads', 'readwrite'); tx.objectStore('heads').put({ key: 'actor-A', id: 'newer' });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); db.close();
    const dump = async () => {
      const r = indexedDB.open('football-science-snapshots-compact-v1');
      const d = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
      try { return await new Promise(resolve => { const t = d.transaction(['versions', 'blocks', 'heads']), out = {};
        for (const key of ['versions', 'blocks', 'heads']) { const q = t.objectStore(key).getAll(); q.onsuccess = () => { out[key] = q.result; }; }
        t.oncomplete = () => resolve(JSON.stringify(out)); }); } finally { d.close(); }
    };
    const before = await dump(); h.restoreScope(old);
    const ok = await h.safety.saveSnapshot('cross-tab-update');
    return { ok, legacy: (await h.all('snapshots')).length, unchanged: before === await dump() };
  })).toEqual({ ok: true, legacy: 0, unchanged: true });
});

test('changed recovery metadata is preserved as a distinct legacy version', async ({ page }) => {
  await seed(page);
  expect(await page.evaluate(async () => {
    h.safety.mutateManifest(m => { m.entries[h.key].pendingBaseRevision = 42; });
    const ok = await h.safety.saveSnapshot('autosave'); const rows = await h.all('snapshots');
    return { ok, rows: rows.length, revision: rows[0].saveContext.entries[h.key].pendingBaseRevision, pending: rows[0].saveContext.entries[h.key].pendingCentralSync };
  })).toEqual({ ok: true, rows: 1, revision: 42, pending: true });
});

test('corrupt compact data stops extra history copying without mutating the current work or journal', async ({ page }) => {
  await seed(page);
  expect(await page.evaluate(async () => {
    const request = indexedDB.open('football-science-snapshots-compact-v1');
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('versions', 'readwrite'), store = tx.objectStore('versions'), read = store.get(JSON.stringify(['actor-A', 'retained-version']));
    read.onsuccess = () => { const row = read.result; row.packet.bytes[0] ^= 255; store.put(row); };
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
    const journal = JSON.stringify(await h.all('latest'));
    const ok = await h.safety.saveSnapshot('pagehide');
    return { ok, legacy: (await h.all('snapshots')).length, journalSame: journal === JSON.stringify(await h.all('latest')),
      valueSame: localStorage.getItem(h.key) === prior.value, entriesSame: prior.entries === JSON.stringify(h.safety.readManifest().entries),
      warning: Boolean(h.safety.status.lastSnapshotError), primarySaveError: h.safety.status.lastError };
  })).toEqual({ ok: false, legacy: 0, journalSame: true, valueSame: true, entriesSame: true, warning: true, primarySaveError: '' });
});

test('two default-runtime tabs reuse one compact version without archive injection', async ({ page, context }) => {
  await seed(page); const peer = await context.newPage(); await peer.goto('/medical-merge.js');
  const name = await page.evaluate(() => h.db.name);
  await peer.evaluate(async name => { window.h = await (await import('/qa/helpers/save-sync-growth-harness.mjs')).saveSyncGrowthHarness({ name }); }, name);
  const results = await Promise.all([page.evaluate(() => h.safety.saveSnapshot('autosave')), peer.evaluate(() => h.safety.saveSnapshot('cross-tab-update'))]);
  expect(results).toEqual([true, true]); expect(await page.evaluate(async () => (await h.all('snapshots')).length)).toBe(0);
});

test('queued and pagehide captures use the default compatibility route', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { h.safety.queueSnapshot('cross-tab-update'); window.flushed = h.safety.flushQueuedSnapshot('pagehide'); });
  await expect.poll(() => page.evaluate(() => h.safety.readManifest().lastSnapshotAt)).not.toBeFalsy();
  expect(await page.evaluate(async () => ({ flushed, legacy: (await h.all('snapshots')).length }))).toEqual({ flushed: true, legacy: 0 });
});

for (const kind of ['scope', 'aba']) test(`account ${kind} change during compact verification cannot stamp another account or fall back`, async ({ page }) => {
  await seed(page);
  expect(await page.evaluate(async kind => {
    const before = JSON.stringify(h.safety.readManifest()), digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest; h.setScope('actor-B'); h.notifyUserChange();
      if (kind === 'aba') { h.setScope('actor-A'); h.notifyUserChange(); }
      return digest(...args);
    };
    const ok = await h.safety.saveSnapshot('autosave');
    return { ok, copies: (await h.all('snapshots')).length, unchanged: before === JSON.stringify(h.safety.readManifest()) };
  }, kind)).toEqual({ ok: false, copies: 0, unchanged: true });
});

test('a compact scan limit fails visibly without adding another protected representation', async ({ page }) => {
  await page.evaluate(async () => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const { seedCompactHistory } = await import('/qa/helpers/compact-history-fixture.mjs');
    window.h = await saveSyncGrowthHarness(); h.edit('Current protected work');
    const base = h.safety.createBackupEnvelope('autosave');
    await seedCompactHistory(Array.from({ length: 257 }, (_, i) => ({ ...base, id: String(i).padStart(4, '0'), storage: { [h.key]: 'Other version ' + i } })), 'standalone');
  });
  expect(await page.evaluate(async () => {
    const ok = await h.safety.saveSnapshot('autosave');
    return { ok, warning: Boolean(h.safety.status.lastSnapshotError), legacy: (await h.all('snapshots')).length, value: localStorage.getItem(h.key) };
  })).toEqual({ ok: false, warning: true, legacy: 0, value: 'Current protected work' });
});

test('another account cannot suppress a new local backup using its compact copies', async ({ page }) => {
  await seed(page);
  expect(await page.evaluate(async () => {
    h.setScope('actor-B'); h.edit('Original pending work');
    const ok = await h.safety.saveSnapshot('autosave'), rows = await h.all('snapshots');
    return { ok, copies: rows.length, scope: rows[0].saveContext.scope, pending: rows[0].saveContext.entries[h.key].pendingCentralSync };
  })).toEqual({ ok: true, copies: 1, scope: 'actor-B', pending: true });
});
