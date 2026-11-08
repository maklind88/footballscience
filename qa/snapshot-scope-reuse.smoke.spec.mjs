import { test, expect } from '@playwright/test';

const variants = ['unchanged', 'payload', 'pending', 'receipt', 'generation', 'owner', 'future-metadata',
  'recovery-copy', 'recovery-state', 'separation', 'deleted', 'missing', 'unknown-scope'];
for (const variant of variants) test(`unhinted scope reuse preserves ${variant} exactly`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async variant => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const h = await snapshotGrowthHarness(), original = h.row('000-target', 'target');
    await h.write(original);
    for (let i = 0; i < 8; i++) await h.write(h.row('scope-' + i, 'scope-' + i));
    const next = { ...structuredClone(original), id: 'next' };
    const entry = next.saveContext.entries.key;
    if (variant === 'payload') next.storage.key = 'Distinct content';
    if (variant === 'pending') entry.pendingCentralSync = false;
    if (variant === 'receipt') entry.serverRevision++;
    if (variant === 'generation') entry.writes++;
    if (variant === 'owner') entry.principalScope = 'other-owner';
    if (variant === 'future-metadata') next.futureRecovery = { original: 'Keep' };
    if (variant === 'recovery-copy') next.recoveryCopies.key = 'Unique recovery';
    if (variant === 'recovery-state') next.recoveryState.key = { original: 'Keep' };
    if (variant === 'separation') next.recoverySeparations = ['key'];
    if (variant === 'deleted') entry.deletedAt = '2026-11-08T12:00:00Z';
    if (variant === 'unknown-scope') next.saveContext.scope = '';
    if (variant === 'missing') await h.transact('snapshots', 'readwrite', s => s.delete(original.id));
    const before = await h.all('snapshots'), saved = await h.write(next), after = await h.all('snapshots');
    h.db.close();
    return { written: saved.written, added: after.length - before.length,
      retained: before.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))),
      exact: after.some(row => JSON.stringify(row) === JSON.stringify(variant === 'unchanged' ? original : next)) };
  }, variant);
  expect(result).toEqual({ written: variant !== 'unchanged', added: variant === 'unchanged' ? 0 : 1, retained: true, exact: true });
});

for (const limit of ['records', 'bytes']) test(`lookup ${limit} budget appends without deleting existing history`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async limit => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const h = await snapshotGrowthHarness(), original = h.row('000-target', 'target');
    await h.write(original);
    for (let i = 0; i < 8; i++) await h.write(h.row('scope-' + i, 'scope-' + i));
    if (limit === 'records') for (let i = 0; i < 33; i++)
      await h.transact('snapshots', 'readwrite', s => s.put(h.row('z' + i, 'other-' + i)));
    else await h.transact('snapshots', 'readwrite', s => s.put({ ...h.row('z-large', 'other'), storage: { key: 'x'.repeat(4 * 1024 * 1024) } }));
    let inspected = 0;
    const database = { transaction(...args) {
      const tx = h.db.transaction(...args), get = tx.objectStore.bind(tx);
      tx.objectStore = name => {
        const store = get(name), open = store.openCursor.bind(store);
        store.openCursor = (...args) => {
          const request = open(...args);
          request.addEventListener('success', () => { if (request.result) inspected++; });
          return request;
        }; return store;
      }; return tx;
    } };
    const before = await h.all('snapshots'), next = { ...original, id: 'new-target' }, saved = await h.write(next, database), after = await h.all('snapshots');
    h.db.close();
    return { written: saved.written, added: after.length - before.length, inspected,
      retained: before.every(row => after.some(other => JSON.stringify(row) === JSON.stringify(other))) };
  }, limit);
  expect(result).toEqual({ written: true, added: 1, retained: true, inspected: limit === 'records' ? 32 : 1 });
});

for (const fault of ['cursor', 'reuse-abort']) test(`unhinted lookup ${fault} failure preserves all stores`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async fault => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const h = await snapshotGrowthHarness(); await h.write(h.row('000-target', 'target'));
    for (let i = 0; i < 8; i++) await h.write(h.row('scope-' + i, 'scope-' + i));
    await h.transact('latest', 'readwrite', s => s.put({ id: 'session-save:pending', status: 'pending', value: 'Unsent' }));
    const before = JSON.stringify([await h.all('snapshots'), await h.all('latest')]);
    const broken = { transaction(...args) {
      const tx = h.db.transaction(...args), get = tx.objectStore.bind(tx);
      tx.objectStore = name => {
        const store = get(name);
        if (fault === 'cursor' && name === 'snapshots') store.openCursor = () => { throw new Error('Synthetic cursor failure'); };
        if (fault === 'reuse-abort' && name === 'latest') store.put = () => { tx.abort(); throw new Error('Synthetic abort'); };
        return store;
      }; return tx;
    } };
    let rejected = false;
    try { await h.write(h.row('next', 'target'), broken); } catch { rejected = true; }
    const unchanged = before === JSON.stringify([await h.all('snapshots'), await h.all('latest')]); h.db.close();
    return { rejected, unchanged };
  }, fault);
  expect(result).toEqual({ rejected: true, unchanged: true });
});

test('two connections reuse an unhinted copy in the same atomic transaction', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { snapshotGrowthHarness } = await import('/qa/helpers/snapshot-growth-harness.mjs');
    const h = await snapshotGrowthHarness(), peer = await h.open();
    await h.write(h.row('000-target', 'target'));
    for (let i = 0; i < 8; i++) await h.write(h.row('scope-' + i, 'scope-' + i));
    const before = JSON.stringify(await h.all('snapshots'));
    const writes = await Promise.all(Array.from({ length: 20 }, (_, i) => h.write(h.row('next-' + i, 'target'), i % 2 ? h.db : peer)));
    const unchanged = before === JSON.stringify(await h.all('snapshots'));
    h.db.close(); peer.close(); return { unchanged, appended: writes.filter(row => row.written).length };
  });
  expect(result).toEqual({ unchanged: true, appended: 0 });
});
