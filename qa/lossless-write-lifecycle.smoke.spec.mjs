import { test, expect } from '@playwright/test';

async function prepare(page, mode, name) {
  await page.goto('/medical-merge.js');
  await page.evaluate(async ({ mode, name }) => {
    const { openLosslessStore } = await import('/qa/prototypes/lossless-store.mjs');
    const helpers = await import('/qa/helpers/lossless-write-proof.mjs');
    window.proof = { ...helpers, name, mode, writer: await openLosslessStore(name, mode) };
  }, { mode, name });
}

for (const mode of ['standalone', 'pooled']) {
  test(`${mode}: two tabs serialize retries, conflicting ids and distinct writes`, async ({ page, context }) => {
    const second = await context.newPage(), name = 'qa-lossless-concurrent';
    await prepare(page, mode, name); await prepare(second, mode, name);
    const append = (tab, id, change = '') => tab.evaluate(async ({ id, change }) => {
      const row = proof.proofRow(id); if (change) row.storage['key-0'] = change;
      try { return { ok: true, ...(await proof.writer.append(row)), row }; }
      catch { return { ok: false }; }
    }, { id, change });
    const identical = await Promise.all([append(page, 'retry'), append(second, 'retry')]);
    expect(identical.filter(r => r.inserted)).toHaveLength(1);
    expect(identical.every(r => r.ok)).toBe(true);
    const collision = await Promise.all([append(page, 'conflict', 'first'), append(second, 'conflict', 'second')]);
    expect(collision.filter(r => r.ok)).toHaveLength(1);
    const distinct = await Promise.all(Array.from({ length: 20 }, (_, n) => append(n % 2 ? page : second, 'distinct-' + n)));
    expect(distinct.every(r => r.ok && r.inserted)).toBe(true);
    const rows = [identical[0].row, collision.find(r => r.ok).row, ...distinct.map(r => r.row)];
    const verified = await page.evaluate(async rows => {
      const reader = await proof.proofReader(proof.name, ['key-0', 'key-1']);
      for (const row of rows) {
        const result = await reader.read({ source: 'compact', id: row.id });
        if (result.status !== 'ok' || JSON.stringify(result.envelope) !== JSON.stringify(row)) return false;
      }
      return (await proof.writer.stats()).versions === rows.length;
    }, rows);
    expect(verified).toBe(true);
  });

  test(`${mode}: closing a tab during an active transaction leaves all or none of the generation`, async ({ page, context }, testInfo) => {
    const name = 'qa-lossless-tab-close';
    await prepare(page, mode, name);
    const before = await page.evaluate(async () => {
      await proof.writer.append(proof.proofRow('original'));
      return JSON.stringify(await proof.dumpProofDb(proof.name));
    });
    await page.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function(...args) {
        const r = add.apply(this, args);
        if (this.transaction.db.name === proof.name && this.name === 'versions') {
          const tx = this.transaction;
          r.addEventListener('success', () => {
            window.proofHeld = true;
            // Keep a real transaction active until the browsing context closes.
            const hold = () => { const next = tx.objectStore('versions').get('missing'); next.onsuccess = hold; };
            hold();
          });
        }
        return r;
      };
      window.proofSaved = false;
      void proof.writer.append(proof.proofRow('interrupted')).then(() => { window.proofSaved = true; }).catch(() => {});
    });
    await page.waitForFunction(() => window.proofHeld === true);
    expect(await page.evaluate(() => window.proofSaved)).toBe(false);
    await page.close();
    const reopened = await context.newPage(); await prepare(reopened, mode, name);
    const result = await reopened.evaluate(async before => {
      const reader = await proof.proofReader(proof.name, ['key-0', 'key-1']);
      const original = await reader.read({ source: 'compact', id: 'original' });
      const interrupted = await reader.read({ source: 'compact', id: 'interrupted' });
      const unchanged = before === JSON.stringify(await proof.dumpProofDb(proof.name));
      const complete = interrupted.status === 'ok' && JSON.stringify(interrupted.envelope) === JSON.stringify(proof.proofRow('interrupted'));
      const retry = await proof.writer.append(proof.proofRow('interrupted'));
      return { originalExact: original.status === 'ok' && JSON.stringify(original.envelope) === JSON.stringify(proof.proofRow('original')),
        interruptedStatus: interrupted.status, unchanged, complete, retry, stats: await proof.writer.stats() };
    }, before);
    expect(result.originalExact).toBe(true);
    expect(result.unchanged || result.complete).toBe(true);
    expect(result.retry.inserted).toBe(result.interruptedStatus === 'absent');
    expect(result.stats.versions).toBe(2);
    expect(result.stats.blocks).toBe(mode === 'pooled' ? 4 : 0);
    await testInfo.attach('tab-close-outcome', { body: JSON.stringify(result), contentType: 'application/json' });
  });

  test(`${mode}: retained legacy tab, writer shutdown and offline read preserve pending generations`, async ({ page, context }) => {
    await page.goto('/medical-merge.js');
    const legacy = await page.evaluate(async () => {
      const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
      window.legacy = await preservationHarness();
      await legacy.capture('actor-A', 1, true);
      return (await legacy.all('snapshots'))[0];
    });
    const newer = await context.newPage(), name = 'qa-lossless-old-tab'; await prepare(newer, mode, name);
    await newer.evaluate(async row => { await proof.writer.append(row); proof.writer.close(); }, legacy);
    await page.evaluate(async () => {
      for (let n = 2; n <= 35; n++) await legacy.capture('actor-A', n, true);
    });
    const originalPreserved = await page.evaluate(async row =>
      (await legacy.all('snapshots')).some(r => JSON.stringify(r) === JSON.stringify(row)), legacy);
    expect(originalPreserved).toBe(true);
    await newer.close();
    // Modules are bootstrapped online in a fresh tab, then network disabled.
    // This proves offline data reading, NOT a cold offline application launch.
    const reopened = await context.newPage();
    await reopened.goto('/medical-merge.js');
    await reopened.evaluate(async ({ name, legacy }) => {
      const { proofReader } = await import('/qa/helpers/lossless-write-proof.mjs');
      window.offlineReader = await proofReader(name, Object.keys(legacy.storage));
    }, { name, legacy });
    await context.setOffline(true);
    const result = await reopened.evaluate(async ({ name, legacy }) => {
      const result = await offlineReader.read({ source: 'compact', id: legacy.id });
      return result.status === 'ok' && JSON.stringify(result.envelope) === JSON.stringify(legacy);
    }, { name, legacy });
    expect(result).toBe(true);
    await context.setOffline(false);
  });
}
