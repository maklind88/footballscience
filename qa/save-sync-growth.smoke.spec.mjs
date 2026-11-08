import { test, expect } from '@playwright/test';

test('measure native save, offline retries, receipt and idle capture over 40 generations', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const h = await saveSyncGrowthHarness(), checkpoints = [], originals = [];
    for (let generation = 1; generation <= 40; generation++) {
      const value = JSON.stringify({ generation, content: 'x'.repeat(32768) });
      h.edit(value); await h.capture();
      const rows = await h.all('snapshots'); originals.push(rows.at(-1));
      h.offline(true); await h.flush();
      const beforeRetry = await h.measure();
      for (let retry = 0; retry < 3; retry++) { await h.flush(); await h.capture(); }
      const afterRetry = await h.measure();
      if (afterRetry.historyBytes !== beforeRetry.historyBytes) throw new Error('Offline retries multiplied history');
      h.offline(false); await h.flush(); await h.capture();
      const settled = await h.measure();
      for (let repeat = 0; repeat < 3; repeat++) { h.edit(value); await h.capture(); }
      if ((await h.measure()).historyBytes !== settled.historyBytes) throw new Error('Idle saves multiplied history');
      const entry = h.safety.readManifest().entries[h.key];
      if (entry.pendingCentralSync || entry.serverRevision !== generation) throw new Error('Receipt did not settle exact generation');
      if ([1, 10, 20, 30, 40].includes(generation)) checkpoints.push({ generation, ...settled });
    }
    const rows = await h.all('snapshots'); h.db.close();
    return { checkpoints, uniquePendingRetained: originals.every(row => rows.some(other => JSON.stringify(row) === JSON.stringify(other))),
      finalNative: JSON.parse(localStorage.getItem(h.key)).generation, saved: h.statuses.filter(s => s.state === 'saved').length };
  });
  console.log('[save-sync-growth]', JSON.stringify(result));
  expect(result.uniquePendingRetained).toBe(true);
  expect(result.finalNative).toBe(40);
  expect(result.saved).toBe(40);
  expect(result.checkpoints.at(-1).pending).toBe(40);
  expect(result.checkpoints.at(-1).rows).toBe(70);
});

test('unchanged scopes beyond the recent hint window do not multiply protected copies', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const h = await saveSyncGrowthHarness(), scopes = [];
    for (let i = 0; i < 12; i++) {
      h.setScope('actor-' + i);
      h.edit(JSON.stringify({ actor: i, content: 'x'.repeat(32768) })); await h.flush();
      h.edit('Unique unsynced note ' + i, h.secondary); await h.capture();
      scopes.push(h.savedScope());
    }
    const before = await h.all('snapshots'), baseline = await h.measure();
    for (let cycle = 0; cycle < 5; cycle++) for (const scope of scopes) { h.restoreScope(scope); await h.capture(); }
    const after = await h.all('snapshots'), final = await h.measure(); h.db.close();
    return { baseline, final, originalsRetained: before.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))) };
  });
  console.log('[scope-growth]', JSON.stringify(result));
  expect(result.originalsRetained).toBe(true);
  expect(result.final.rows).toBe(result.baseline.rows);
  expect(result.final.historyBytes).toBe(result.baseline.historyBytes);
});

test('late receipt cannot acknowledge or discard a newer pending generation', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const h = await saveSyncGrowthHarness();
    h.edit('Original pending work'); await h.capture();
    h.holdReceipt(); const flush = h.flush();
    while (!h.calls.length) await Promise.resolve();
    h.edit('Newer pending work'); await h.capture();
    const originals = await h.all('snapshots');
    h.releaseReceipt(); await flush; await h.capture();
    const pendingAfterOldReceipt = h.safety.readManifest().entries[h.key].pendingCentralSync;
    const nativeAfterOldReceipt = h.safety.rawGetItem(h.key);
    await h.flush(); await h.capture();
    const after = await h.all('snapshots');
    const final = h.safety.readManifest().entries[h.key]; h.db.close();
    return { pendingAfterOldReceipt, nativeAfterOldReceipt, finalPending: final.pendingCentralSync,
      finalRevision: final.serverRevision, retained: originals.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))) };
  });
  expect(result).toEqual({ pendingAfterOldReceipt: true, nativeAfterOldReceipt: 'Newer pending work',
    finalPending: false, finalRevision: 2, retained: true });
});

test('full native storage does not erase the saved version or pretend the failed edit was saved', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const h = await saveSyncGrowthHarness();
    h.edit('Saved original'); await h.flush(); await h.capture();
    const before = JSON.stringify(await h.all('snapshots')), calls = h.calls.length;
    h.failWritesFor(h.key);
    let rejected = false; try { h.edit('Unsaved replacement'); } catch { rejected = true; }
    await h.capture(); await h.flush();
    const result = { rejected, unchanged: before === JSON.stringify(await h.all('snapshots')),
      native: h.safety.rawGetItem(h.key), newRequests: h.calls.length - calls, issue: !!h.safety.status.lastError };
    h.db.close(); return result;
  });
  expect(result).toEqual({ rejected: true, unchanged: true, native: 'Saved original', newRequests: 0, issue: true });
});

test('reload replays the persisted pending generation and preserves its exact recovery export', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const before = await page.evaluate(async () => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const h = await saveSyncGrowthHarness(); h.offline(true);
    h.edit('Pending across restart'); await h.capture(); await h.flush();
    const saved = { name: h.db.name, original: (await h.all('snapshots'))[0], key: h.key };
    h.db.close(); return saved;
  });
  await page.reload();
  const result = await page.evaluate(async ({ name, original, key }) => {
    const { saveSyncGrowthHarness } = await import('/qa/helpers/save-sync-growth-harness.mjs');
    const { encodeSnapshotReview } = await import('/src/core/snapshot-history-format.mjs');
    const h = await saveSyncGrowthHarness({ name });
    await h.sync.retryCentral(h.safety.readManifest); await h.flush(); await h.capture();
    const rows = await h.all('snapshots'), retained = rows.find(row => row.id === original.id);
    const exported = retained && JSON.parse(encodeSnapshotReview(retained, 'actor-A', new Set([key]))).versions[0];
    const result = { pending: h.safety.readManifest().entries[key].pendingCentralSync,
      serverValue: h.server.get('actor-A' + key)?.value, exactExport: JSON.stringify(exported) === JSON.stringify(original) };
    h.db.close(); return result;
  }, before);
  expect(result).toEqual({ pending: false, serverValue: 'Pending across restart', exactExport: true });
});
