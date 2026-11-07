import { test, expect } from '@playwright/test';

// Real runtime and IndexedDB; synthetic payloads only. Sizes are serialized
// UTF-16 estimates, not physical disk usage or the browser's origin quota.
test('repeated scope switches do not multiply unchanged recoverable snapshots', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
    const key = 'football-player-profiles-v1', databaseName = 'qa-growth-' + crypto.randomUUID();
    const original = JSON.stringify({ players: [{ id: 'synthetic', notes: 'x'.repeat(512 * 1024) }] });
    localStorage.setItem(key, original);
    let scope = 'actor-A';
    const service = createDataSafetyRuntimeService({
      win: { localStorage, indexedDB, location, crypto, setTimeout: () => 1, clearTimeout() {}, addEventListener() {} },
      documentRef: {}, navigatorRef: {}, storageConstructor: Storage, databaseName,
      protectedStorageKeys: [key], getCentralStateBridge: () => ({ getReadScope: () => scope }),
    });
    service.install();
    service.mutateManifest(m => { m.entries[key] = { principalScope: 'actor-A', writes: 1, pendingCentralSync: true,
      pendingBaseRevision: 10, hash: service.hashString(original), updatedAt: '2026-11-06T12:00:00Z' }; });
    const db = await service.openDatabase();
    const read = store => new Promise((resolve, reject) => {
      const tx = db.transaction(store), r = tx.objectStore(store).getAll();
      tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error);
    });
    const measure = async () => { const rows = await read('snapshots'), latest = await read('latest'); return {
      rows: rows.length, bytes: JSON.stringify(rows).length * 2, latestBytes: JSON.stringify(latest).length * 2,
    }; };
    const journal = { id: 'session-save:pending-synthetic', scope: 'actor-A', status: 'pending', change: { id: 'pending-synthetic', value: 'Unsent work' } };
    await new Promise((resolve, reject) => { const tx = db.transaction('latest', 'readwrite');
      tx.objectStore('latest').put(journal); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    await service.saveSnapshot('startup');
    const baseline = await measure();
    for (let i = 0; i < 8; i++) await service.saveSnapshot('unchanged-refresh');
    const idle = await measure();
    scope = 'actor-B'; await service.saveSnapshot('startup');
    const twoScopes = await measure();
    for (let i = 0; i < 12; i++) { scope = i % 2 ? 'actor-B' : 'actor-A'; await service.saveSnapshot('startup'); }
    const switched = await measure();
    const before = await read('snapshots');
    // A new pending generation is meaningful even when its payload is identical.
    scope = 'actor-A'; service.mutateManifest(m => { m.entries[key].writes++; });
    await service.saveSnapshot('new-pending-generation');
    const after = await read('snapshots'), latest = await read('latest');
    db.close();
    return { baseline, idle, twoScopes, switched, newGenerationRows: after.length,
      oldRowsRetained: before.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))),
      payloadRetained: localStorage.getItem(key) === original,
      journalRetained: latest.some(row => JSON.stringify(row) === JSON.stringify(journal)),
      latestScope: latest.find(row => row.id === 'latest').saveContext.scope };
  });
  console.log('[snapshot-growth]', JSON.stringify(result));
  expect(result.idle).toEqual(result.baseline);
  expect(result.twoScopes.rows).toBe(2);
  expect(result.switched).toEqual(result.twoScopes);
  expect(result.newGenerationRows).toBe(3);
  expect(result.oldRowsRetained).toBe(true);
  expect(result.payloadRetained).toBe(true);
  expect(result.journalRetained).toBe(true);
  expect(result.latestScope).toBe('actor-A');
});

for (const change of ['payload', 'generation', 'receipt', 'deletion', 'recovery-copy', 'recovery-state', 'separation', 'owner', 'future-metadata']) {
  test(`scope reuse preserves a distinct ${change}`, async ({ page }) => {
    await page.goto('/medical-merge.js');
    const result = await page.evaluate(async change => {
      const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
      const h = await snapshotGrowthHarness();
      try {
        await h.write(h.row('a')); await h.write(h.row('b', 'B'));
        const before = await h.all('snapshots'), next = h.row('next');
        if (change === 'payload') next.storage.key = 'New content';
        if (change === 'generation') next.saveContext.entries.key.writes++;
        if (change === 'receipt') next.saveContext.entries.key.serverRevision++;
        if (change === 'deletion') next.saveContext.entries.key.deletedAt = '2026-11-06T12:01:00Z';
        if (change === 'recovery-copy') next.recoveryCopies.original = 'Keep this exact copy';
        if (change === 'recovery-state') next.recoveryState.key = { value: 'Pending branch' };
        if (change === 'separation') next.recoverySeparations = ['key'];
        if (change === 'owner') next.saveContext.entries.key.principalScope = 'different-owner';
        if (change === 'future-metadata') next.futureRecoveryMetadata = { protectedGeneration: 'keep' };
        const saved = await h.write(next), after = await h.all('snapshots');
        return { saved, count: after.length, retained: before.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))),
          exact: after.some(row => JSON.stringify(row) === JSON.stringify(next)) };
      } finally { h.db.close(); }
    }, change);
    expect(result).toEqual({ saved: { written: true, createdAt: '2026-11-06T12:00:00Z' }, count: 3, retained: true, exact: true });
  });
}

for (const fault of ['missing', 'changed', 'wrong-scope', 'old-client']) {
  test(`a ${fault} snapshot hint cannot acknowledge a missing recovery version`, async ({ page }) => {
    await page.goto('/medical-merge.js');
    const result = await page.evaluate(async fault => {
      const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
      const h = await snapshotGrowthHarness();
      try {
        await h.write(h.row('a')); await h.write(h.row('b', 'B'));
        if (fault === 'missing') await h.transact('snapshots', 'readwrite', s => s.delete('a'));
        if (fault === 'changed') await h.transact('snapshots', 'readwrite', s => s.put({ ...h.row('a'), storage: { key: 'A newer retained version' } }));
        if (fault === 'wrong-scope' || fault === 'old-client') {
          const latest = (await h.all('latest')).find(row => row.id === 'latest');
          if (fault === 'wrong-scope') latest.recentSnapshotRefs = [{ scope: 'A', id: 'b' }];
          else delete latest.recentSnapshotRefs; // Exact legacy latest envelope, no new hints.
          await h.transact('latest', 'readwrite', s => s.put(latest));
        }
        const before = await h.all('snapshots'), saved = await h.write(h.row('new-a')), after = await h.all('snapshots');
        return { written: saved.written, added: after.length - before.length,
          retained: before.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))) };
      } finally { h.db.close(); }
    }, fault);
    expect(result).toEqual({ written: true, added: 1, retained: true });
  });
}

test('two connections reuse snapshots atomically and bound hints without deleting history', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const h = await snapshotGrowthHarness(), second = await h.open();
    try {
      const first = await Promise.all(Array.from({ length: 20 }, (_, i) => h.write(h.row('v' + i, i % 2 ? 'B' : 'A'), i % 2 ? second : h.db)));
      const before = await h.all('snapshots');
      for (let i = 0; i < 10; i++) await h.write(h.row('other' + i, 'other-scope' + i));
      const after = await h.all('snapshots'), latest = (await h.all('latest')).find(row => row.id === 'latest');
      const hints = latest.recentSnapshotRefs;
      // Legacy snapshot/export consumers still receive complete ordinary rows.
      return { appended: first.filter(row => row.written).length, count: before.length, hints: hints.length,
        historyCount: after.length, retained: before.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))),
        noHintsInHistory: after.every(row => !Object.hasOwn(row, 'recentSnapshotRefs')),
        fullLatest: latest.storage.key === 'Retained content' && !!latest.saveContext.entries.key };
    } finally { h.db.close(); second.close(); }
  });
  expect(result).toEqual({ appended: 2, count: 2, hints: 8, historyCount: 12, retained: true, noHintsInHistory: true, fullLatest: true });
});

test('aborted reuse leaves the latest copy, history and pending journal untouched', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const h = await snapshotGrowthHarness();
    try {
      await h.write(h.row('a')); await h.write(h.row('b', 'B'));
      await h.transact('latest', 'readwrite', s => s.put({ id: 'session-save:pending', status: 'pending', value: 'Unsent' }));
      const before = [await h.all('snapshots'), await h.all('latest')];
      const broken = { transaction(...args) {
        const tx = h.db.transaction(...args), original = tx.objectStore.bind(tx);
        tx.objectStore = name => { const store = original(name);
          if (name === 'latest') store.put = () => { tx.abort(); throw new Error('Injected write failure'); };
          return store;
        }; return tx;
      } };
      let rejected = false;
      try { await h.write(h.row('reuse-a'), broken); } catch { rejected = true; }
      return { rejected, unchanged: JSON.stringify(before) === JSON.stringify([await h.all('snapshots'), await h.all('latest')]) };
    } finally { h.db.close(); }
  });
  expect(result).toEqual({ rejected: true, unchanged: true });
});

test('persisted hints survive reload and keep ordinary history exportable', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const name = await page.evaluate(async () => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const h = await snapshotGrowthHarness();
    await h.write(h.row('a')); await h.write(h.row('b', 'B'));
    const name = h.db.name; h.db.close(); return name;
  });
  await page.reload();
  const result = await page.evaluate(async name => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const { encodeSnapshotReview } = await import('/src/core/snapshot-history-format.mjs');
    const h = await snapshotGrowthHarness({ name });
    try {
      const saved = await h.write(h.row('after-reload'));
      const rows = await h.all('snapshots'), original = rows.find(row => row.id === 'a');
      const exported = JSON.parse(encodeSnapshotReview(original, 'A', new Set(['key']))).versions[0];
      const latest = (await h.all('latest')).find(row => row.id === 'latest');
      return { saved: saved.written, count: rows.length, exactExport: JSON.stringify(exported) === JSON.stringify(original),
        latestId: latest.sourceSnapshotId, latestScope: latest.saveContext.scope };
    } finally { h.db.close(); }
  }, name);
  expect(result).toEqual({ saved: false, count: 2, exactExport: true, latestId: 'a', latestScope: 'A' });
});
