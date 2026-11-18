import { test, expect } from '@playwright/test';
for (const fault of ['timeout', 'access']) test(`request success cannot acknowledge or leave a late write after ${fault}`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async fault => {
    const { writerFixture, candidateRow, writerDump, dbName } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const h = writerFixture({ timeoutMs: 500 }); await h.writer.save(candidateRow());
    const before = JSON.stringify(await writerDump()), add = IDBObjectStore.prototype.add;
    let reached = false, rejected = false;
    IDBObjectStore.prototype.add = function(...args) {
      const r = add.apply(this, args);
      if (this.transaction.db.name === dbName) {
        const tx = this.transaction;
        r.addEventListener('success', () => {
          reached = true;
          if (fault === 'access') { h.state.generation++; return; }
          const hold = () => { const read = tx.objectStore('versions').get('absent'); read.onsuccess = hold; }; hold();
        });
      }
      return r;
    };
    try { await h.writer.save(candidateRow('late', 1)); } catch { rejected = true; }
    finally { IDBObjectStore.prototype.add = add; }
    await new Promise(resolve => setTimeout(resolve, 100));
    return { reached, rejected, unchanged: before === JSON.stringify(await writerDump()) };
  }, fault);
  expect(result).toEqual({ reached: true, rejected: true, unchanged: true });
});
