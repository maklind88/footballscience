import { test, expect } from '@playwright/test';

test('rotation beyond 30 versions preserves another scope\'s unique unsynced copy across reload', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const beforeReload = await page.evaluate(async () => {
    const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const h = await preservationHarness();
    await h.capture('actor-A', 1, true);
    const original = (await h.all('snapshots'))[0];
    const journal = { id: 'session-save:pending-retained', scope: 'actor-A', status: 'pending', change: { content: 'Unsent session' } };
    await h.put('latest', journal);
    let current;
    for (let generation = 2; generation <= 41; generation++) current = await h.capture('actor-B', generation);
    const name = h.db.name;
    h.db.close();
    return { name, original, journal, current, key: h.key };
  });
  await page.reload();
  const result = await page.evaluate(async ({ name, original, journal, current, key }) => {
    const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const { encodeSnapshotReview } = await import('/src/core/snapshot-history-format.mjs');
    const h = await preservationHarness({ name });
    const rows = await h.all('snapshots'), latest = await h.all('latest');
    const retained = rows.find(row => row.id === original.id);
    const exported = retained && JSON.parse(encodeSnapshotReview(retained, 'actor-A', new Set([key]))).versions[0];
    h.db.close();
    return { retained: JSON.stringify(retained) === JSON.stringify(original),
      exactExport: JSON.stringify(exported) === JSON.stringify(original),
      journalRetained: latest.some(row => JSON.stringify(row) === JSON.stringify(journal)),
      currentRetained: localStorage.getItem(key) === current, rows: rows.length };
  }, beforeReload);
  console.log('[snapshot-preservation]', JSON.stringify(result));
  expect(result.retained).toBe(true);
  expect(result.exactExport).toBe(true);
  expect(result.journalRetained).toBe(true);
  expect(result.currentRetained).toBe(true);
});

test('45 distinct pending generations remain recoverable after automatic rotation', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const h = await preservationHarness(), expected = [];
    for (let generation = 1; generation <= 45; generation++) {
      expected.push(await h.capture(generation % 2 ? 'actor-A' : 'actor-B', generation, true));
    }
    const rows = await h.all('snapshots'); h.db.close();
    return { missing: expected.filter(value => !rows.some(row => row.storage[h.key] === value)), count: rows.length };
  });
  expect(result.missing).toEqual([]);
  expect(result.count).toBe(45);
});

const protectedCases = ['pending', 'prepared', 'unknown-sync', 'unknown-revision', 'unacknowledged-revision',
  'unknown-owner', 'different-owner', 'legacy', 'future-envelope', 'future-entry', 'future-context',
  'recovery-copy', 'recovery-state', 'separation', 'deletion', 'missing-entry', 'different-payload',
  'manual-export', 'before-restore', 'unknown-schema', 'session-fallback'];
for (const variant of protectedCases) {
  test(`rotation retains exact ${variant} content and metadata while bounding ordinary acknowledged history`, async ({ page }) => {
    await page.goto('/medical-merge.js');
    const result = await page.evaluate(async variant => {
      const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
      const h = await retentionHarness(), protectedRow = h.row('000-protected');
      const entry = protectedRow.saveContext.entries.key;
      if (variant === 'pending') entry.pendingCentralSync = true;
      if (variant === 'prepared') entry.localWritePrepared = true;
      if (variant === 'unknown-sync') delete entry.pendingCentralSync;
      if (variant === 'unknown-revision') entry.serverRevision = 0;
      if (variant === 'unacknowledged-revision') entry.serverRevision = entry.pendingBaseRevision;
      if (variant === 'unknown-owner') protectedRow.saveContext.scope = '';
      if (variant === 'different-owner') entry.principalScope = 'actor-B';
      if (variant === 'legacy') delete protectedRow.saveContext;
      if (variant === 'future-envelope') protectedRow.futureRecovery = { original: 'Keep me' };
      if (variant === 'future-entry') entry.futureGeneration = 'Keep me';
      if (variant === 'future-context') protectedRow.saveContext.futureOwner = 'Keep me';
      if (variant === 'recovery-copy') protectedRow.recoveryCopies.original = 'Keep me';
      if (variant === 'recovery-state') protectedRow.recoveryState.key = { original: 'Keep me' };
      if (variant === 'separation') protectedRow.recoverySeparations.push('key');
      if (variant === 'deletion') { delete protectedRow.storage.key; entry.deletedAt = '2026-11-07T12:01:00Z'; }
      if (variant === 'missing-entry') delete protectedRow.saveContext.entries.key;
      if (variant === 'different-payload') protectedRow.storage.key = 'Unacknowledged bytes';
      if (variant === 'manual-export' || variant === 'before-restore') protectedRow.reason = variant;
      if (variant === 'unknown-schema') protectedRow.schema = 'unknown';
      if (variant === 'session-fallback') protectedRow.id = 'football-session-planner-v3-quota-fallback:owner:review:1';
      const settled = Array.from({ length: 40 }, (_, i) => h.row('settled-' + String(i).padStart(2, '0')));
      await h.putMany('snapshots', [protectedRow, ...settled]);
      const latest = { ...settled.at(-1), id: 'latest', sourceSnapshotId: settled.at(-1).id };
      const journal = { id: 'session-save:review', status: 'review', value: 'Unresolved work' };
      await h.putMany('latest', [latest, journal]);
      await h.prune();
      const rows = await h.all('snapshots'), afterLatest = await h.all('latest'); h.db.close();
      return { retained: rows.some(row => JSON.stringify(row) === JSON.stringify(protectedRow)),
        latest: afterLatest.find(row => row.id === 'latest'), journal: afterLatest.find(row => row.id === journal.id),
        ordinaryIds: rows.filter(row => row.id.startsWith('settled-')).map(row => row.id),
        expectedIds: settled.slice(-30).map(row => row.id), expectedLatest: latest, expectedJournal: journal };
    }, variant);
    expect(result.retained).toBe(true);
    expect(result.ordinaryIds).toEqual(result.expectedIds);
    expect(result.latest).toEqual(result.expectedLatest);
    expect(result.journal).toEqual(result.expectedJournal);
  });
}

test('latest and scope hints cannot be pruned away even when pointing to older acknowledged history', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const h = await retentionHarness();
    const rows = Array.from({ length: 40 }, (_, i) => h.row(String(i).padStart(2, '0')));
    await h.putMany('snapshots', rows);
    const latest = { ...rows[0], id: 'latest', sourceSnapshotId: rows[0].id,
      recentSnapshotRefs: [{ scope: 'actor-A', id: rows[1].id }] };
    await h.putMany('latest', [latest]);
    await h.prune();
    const after = await h.all('snapshots'), afterLatest = await h.all('latest'); h.db.close();
    return { ids: after.map(row => row.id), expected: [rows[0], rows[1], ...rows.slice(-30)].map(row => row.id),
      latestUnchanged: JSON.stringify(afterLatest) === JSON.stringify([latest]) };
  });
  expect(result.ids).toEqual(result.expected);
  expect(result.latestUnchanged).toBe(true);
});

test('two real tabs preserve 45 pending versions while the other tab rotates history', async ({ page, context }) => {
  await page.goto('/medical-merge.js');
  const peer = await context.newPage(); await peer.goto('/medical-merge.js');
  const name = 'qa-two-tabs-' + Date.now();
  for (const tab of [page, peer]) await tab.evaluate(async name => {
    const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    window.retentionTest = await retentionHarness({ name });
  }, name);
  await page.evaluate(async () => {
    const h = window.retentionTest;
    await h.putMany('snapshots', Array.from({ length: 40 }, (_, i) => h.row('old-' + i)));
    await h.putMany('latest', [{ id: 'session-save:pending', scope: 'actor-A', status: 'pending', value: 'Keep this journal' }]);
  });
  await Promise.all([
    page.evaluate(async () => {
      const { storeDistinctSnapshot } = await import('/src/core/distinct-snapshot-store.mjs');
      const h = window.retentionTest;
      for (let i = 0; i < 45; i++) {
        const row = h.row('pending-' + i, i % 2 ? 'actor-A' : 'actor-B');
        row.saveContext.entries.key.pendingCentralSync = true;
        await storeDistinctSnapshot(h.db, 'snapshots', 'latest', row);
      }
    }),
    peer.evaluate(async () => { for (let i = 0; i < 50; i++) await window.retentionTest.prune(); }),
  ]);
  await page.evaluate(() => window.retentionTest.db.close());
  await peer.evaluate(() => window.retentionTest.db.close());
  await peer.close(); await page.reload();
  const result = await page.evaluate(async name => {
    const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const h = await retentionHarness({ name }); await h.prune();
    const rows = await h.all('snapshots'), latest = await h.all('latest'); h.db.close();
    return { pending: rows.filter(row => row.id.startsWith('pending-')).length,
      missing: Array.from({ length: 45 }, (_, i) => i).filter(i => !rows.some(row =>
        row.id === 'pending-' + i && row.storage.key === 'Saved content pending-' + i && row.saveContext.entries.key.pendingCentralSync)),
      journal: latest.find(row => row.id === 'session-save:pending') };
  }, name);
  expect(result.pending).toBe(45);
  expect(result.missing).toEqual([]);
  expect(result.journal).toEqual({ id: 'session-save:pending', scope: 'actor-A', status: 'pending', value: 'Keep this journal' });
});

test('a concurrent replacement of selected history with pending work is never deleted', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    const h = await retentionHarness(), peer = await retentionHarness({ name: h.db.name });
    const rows = Array.from({ length: 40 }, (_, i) => h.row(String(i).padStart(2, '0')));
    await h.putMany('snapshots', rows);
    const replacement = h.row('00');
    replacement.storage.key = 'Concurrent unsynced replacement';
    replacement.saveContext.entries.key.pendingCentralSync = true;
    let replacementDone;
    const wrapRequest = request => {
      request.addEventListener('success', () => {
        if (!replacementDone) replacementDone = peer.putMany('snapshots', [replacement]);
      });
      return request;
    };
    const database = { transaction(...args) {
      const tx = h.db.transaction(...args), original = tx.objectStore.bind(tx);
      tx.objectStore = name => {
        const store = original(name);
        // Queue the second connection at the first inspection response. With
        // separate read/delete transactions it can replace a selected row in the gap.
        if (name === 'snapshots') {
          const read = store.getAllKeys.bind(store);
          store.getAllKeys = (...args) => wrapRequest(read(...args));
        }
        if (name === 'latest') {
          const read = store.get.bind(store);
          store.get = (...args) => wrapRequest(read(...args));
        }
        return store;
      }; return tx;
    } };
    await h.prune(database);
    if (!replacementDone) throw new Error('Concurrent writer did not run');
    await replacementDone;
    await h.prune(); // A later pass must also recognize the replacement as protected.
    const after = await h.all('snapshots'); h.db.close(); peer.db.close();
    return { retained: after.some(row => JSON.stringify(row) === JSON.stringify(replacement)) };
  });
  expect(result.retained).toBe(true);
});

for (const fault of ['cursor', 'delete', 'records', 'bytes']) {
  test(`retention ${fault} failure or limit leaves every original row unchanged`, async ({ page }) => {
    await page.goto('/medical-merge.js');
    const result = await page.evaluate(async fault => {
      const { retentionHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
      const { pruneAcknowledgedSnapshots } = await import('/src/core/snapshot-retention-store.mjs');
      const h = await retentionHarness();
      await h.putMany('snapshots', Array.from({ length: 45 }, (_, i) => h.row('version-' + i)));
      await h.putMany('latest', [{ id: 'session-save:pending', value: 'Unsent' }]);
      const before = JSON.stringify([await h.all('snapshots'), await h.all('latest')]);
      const database = { transaction(...args) {
        const tx = h.db.transaction(...args), original = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = original(name);
          if (name === 'snapshots' && fault === 'cursor') store.openCursor = () => { throw new Error('Read failed'); };
          if (name === 'snapshots' && fault === 'delete') {
            const remove = store.delete.bind(store);
            store.delete = key => { remove(key); tx.abort(); throw new Error('Abort after queued deletion'); };
          }
          return store;
        }; return tx;
      } };
      let rejected = false, outcome;
      try {
        outcome = await pruneAcknowledgedSnapshots(database, { snapshotStore: 'snapshots', latestStore: 'latest',
          maxSnapshots: 30, schema: 'football-science-backup-v1', hashString: h.hashString,
          ...(fault === 'records' ? { maxRecords: 10 } : {}), ...(fault === 'bytes' ? { maxBytes: 10 } : {}) });
      } catch { rejected = true; }
      const unchanged = before === JSON.stringify([await h.all('snapshots'), await h.all('latest')]); h.db.close();
      return { rejected, outcome, unchanged };
    }, fault);
    expect(result.unchanged).toBe(true);
    if (fault === 'records' || fault === 'bytes') expect(result.outcome).toEqual({ deleted: 0, limited: true });
    else expect(result.rejected).toBe(true);
  });
}
