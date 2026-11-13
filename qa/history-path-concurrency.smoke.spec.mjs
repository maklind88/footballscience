import { test, expect } from '@playwright/test';
test('two ordinary runtime tabs retain exactly 30 protected generations', async ({ page, context }) => {
  await page.goto('/medical-merge.js');
  const name = await page.evaluate(async () => {
    window.h = await (await import('/qa/helpers/save-sync-growth-harness.mjs')).saveSyncGrowthHarness();
    return h.db.name;
  });
  const peer = await context.newPage(); await peer.goto('/medical-merge.js');
  await peer.evaluate(async name => {
    window.h = await (await import('/qa/helpers/save-sync-growth-harness.mjs')).saveSyncGrowthHarness({ name });
  }, name);
  for (let generation = 0; generation < 30; generation++) {
    await page.evaluate(generation => h.edit('Protected generation ' + generation), generation);
    expect(await Promise.all([page.evaluate(() => h.safety.saveSnapshot('autosave')), peer.evaluate(() => h.safety.saveSnapshot('pagehide'))])).toEqual([true, true]);
  }
  expect(await peer.evaluate(async () => ({ total: (await h.all('snapshots')).length,
    pending: h.safety.readManifest().entries[h.key].pendingCentralSync, serverWrites: h.calls.length,
    compactCreated: (await indexedDB.databases()).some(d => d.name === 'football-science-snapshots-compact-v1') })))
    .toEqual({ total: 30, pending: true, serverWrites: 0, compactCreated: false });
});

test('the default history lock times out without a late copy or changes to pending work', async ({ page }) => {
  await page.goto('/medical-merge.js');
  expect(await page.evaluate(async () => {
    const h = await (await import('/qa/helpers/save-sync-growth-harness.mjs')).saveSyncGrowthHarness();
    h.edit('Pending work'); const before = JSON.stringify(h.safety.readManifest().entries);
    let release, ready;
    const started = new Promise(r => { ready = r; });
    const held = navigator.locks.request('footballscience-history-write-v1', async () => { ready(); await new Promise(r => { release = r; }); });
    await started; const ok = await h.safety.saveSnapshot('pagehide'); release(); await held;
    await new Promise(r => setTimeout(r, 30));
    return { ok, copies: (await h.all('snapshots')).length, pending: localStorage.getItem(h.key),
      entriesSame: before === JSON.stringify(h.safety.readManifest().entries), warning: Boolean(h.safety.status.lastSnapshotError) };
  })).toEqual({ ok: false, copies: 0, pending: 'Pending work', entriesSame: true, warning: true });
});
