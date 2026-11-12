import { test, expect } from '@playwright/test';

for (const source of ['legacy', 'standalone', 'pooled']) test(`${source}: explicit recovery retains exact module draft without changing active work`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async source => {
    const { recoveryFixture, recoveryDump, recoveryKey } = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const h = await recoveryFixture({ source });
    localStorage.setItem(recoveryKey, 'Newer unsynced work');
    localStorage.setItem('football-data-safety-v1', 'pending metadata sentinel');
    const before = JSON.stringify({ ...localStorage });
    const first = await h.prepare(), second = await h.prepare();
    const read = await h.service.read(first.row.id);
    const sourceCopy = await h.reader.read({ source: h.source, id: h.row.id });
    const dump = await recoveryDump();
    h.state.scope = 'actor-B'; h.state.generation = '2';
    let denied = false; try { await h.service.read(first.row.id); } catch { denied = true; }
    return { first: first.inserted, second: second.inserted, content: read.content,
      sourceExact: JSON.stringify(sourceCopy.envelope) === JSON.stringify(h.row),
      activeExact: before === JSON.stringify({ ...localStorage }), rows: dump.drafts.length, metadata: dump.catalog.length,
      denied, otherScopeList: await h.service.list(), value: h.row.storage[recoveryKey], entry: h.row.saveContext.entries[recoveryKey] };
  }, source);
  expect(result.first).toBe(true); expect(result.second).toBe(false);
  expect(result.content.value).toBe(result.value); expect(result.content.entry).toEqual(result.entry);
  expect(result.sourceExact && result.activeExact && result.denied).toBe(true);
  expect(result.rows).toBe(1); expect(result.metadata).toBe(1); expect(result.otherScopeList).toEqual([]);
});

for (const fault of ['quota-payload', 'quota-catalog', 'abort-after-request', 'access-during-write', 'capacity']) test(`recovery ${fault} preserves existing draft and original`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async fault => {
    const { recoveryFixture, recoveryDump, seedLegacyRecovery } = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const h = await recoveryFixture({ storeOptions: { maxCopies: fault === 'capacity' ? 1 : 32 } });
    await h.prepare(); const before = JSON.stringify(await recoveryDump());
    h.row.id = 'second'; await seedLegacyRecovery(h.row);
    const add = IDBObjectStore.prototype.add; let requestSucceeded = false;
    IDBObjectStore.prototype.add = function(...args) {
      if (this.transaction.db.name !== 'football-science-history-drafts-v1') return add.apply(this, args);
      if ((fault === 'quota-payload' && this.name === 'drafts') || (fault === 'quota-catalog' && this.name === 'catalog'))
        throw new DOMException('Synthetic full storage', 'QuotaExceededError');
      const request = add.apply(this, args);
      if (this.name === 'drafts') request.addEventListener('success', () => {
        requestSucceeded = true;
        if (fault === 'abort-after-request') this.transaction.abort();
        if (fault === 'access-during-write') { h.state.generation = '2'; h.abort.abort(); }
      });
      return request;
    };
    let rejected = false; try { await h.prepare(); } catch { rejected = true; }
    finally { IDBObjectStore.prototype.add = add; }
    const after = JSON.stringify(await recoveryDump());
    return { rejected, unchanged: before === after, requestSucceeded };
  }, fault);
  expect(result.rejected).toBe(true); expect(result.unchanged).toBe(true);
  if (fault.includes('request') || fault === 'access-during-write') expect(result.requestSucceeded).toBe(true);
});

for (const fault of ['source-changed', 'auth-aba', 'no-permission', 'malformed-sessions', 'bytes-limit']) test(`recovery rejects ${fault} without a stored draft`, async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async fault => {
    const { recoveryFixture, recoveryDump, seedLegacyRecovery, recoveryKey } = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const h = await recoveryFixture({ storeOptions: fault === 'bytes-limit' ? { maxBytes: 1 } : {} });
    if (fault === 'source-changed') {
      const changed = structuredClone(h.row); changed.storage[recoveryKey] = 'Changed copy'; await seedLegacyRecovery(changed);
    }
    if (fault === 'malformed-sessions') { h.row.storage[recoveryKey] = '{broken'; await seedLegacyRecovery(h.row); }
    if (fault === 'no-permission') h.state.canPrepare = false;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    if (fault === 'auth-aba') crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest; h.state.generation = '2'; h.abort.abort(); return digest(...args);
    };
    let rejected = false; try { await h.prepare(); } catch { rejected = true; }
    finally { crypto.subtle.digest = digest; }
    const dump = await recoveryDump(); return { rejected, rows: dump?.drafts.length || 0, catalogs: dump?.catalog.length || 0 };
  }, fault);
  expect(result).toEqual({ rejected: true, rows: 0, catalogs: 0 });
});

test('simultaneous recovery requests deduplicate atomically and new versions stay separate', async ({ page, context }) => {
  await page.goto('/medical-merge.js'); const peer = await context.newPage(); await peer.goto('/medical-merge.js');
  for (const tab of [page, peer]) await tab.evaluate(async () => {
    window.h = await (await import('/qa/helpers/history-recovery-draft-fixture.mjs')).recoveryFixture();
  });
  const results = await Promise.all([page, peer].map(tab => tab.evaluate(() => h.prepare())));
  expect(results.filter(r => r.inserted)).toHaveLength(1);
  const next = await peer.evaluate(async () => {
    const { seedLegacyRecovery } = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    h.row.id = 'later-version'; await seedLegacyRecovery(h.row); return h.prepare();
  });
  expect(next.inserted).toBe(true);
  expect(await page.evaluate(async () => (await h.service.list()).length)).toBe(2);
});

test('readonly listing does not create storage and diagnostics account for explicit retained drafts', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { recoveryFixture, recoveryDump } = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const { collectIndexedDbStorageHealth } = await import('/src/core/indexeddb-storage-health.mjs');
    const h = await recoveryFixture(), listed = await h.service.list(), absent = await recoveryDump();
    await h.prepare(); const before = JSON.stringify(await recoveryDump());
    const report = await collectIndexedDbStorageHealth({ indexedDB });
    return { listed, absent, unchanged: before === JSON.stringify(await recoveryDump()),
      health: report.databases.find(db => db.label === 'Separate recovery drafts'), report: JSON.stringify(report) };
  });
  expect(result.listed).toEqual([]); expect(result.absent).toBeNull(); expect(result.unchanged).toBe(true);
  expect(result.health).toMatchObject({ status: 'complete', totalRecords: 2 });
  expect(result.report).not.toContain('Historical pending'); expect(result.report).not.toContain('actor-A');
});

test('corrupt retained draft is refused without repair, overwrite or a duplicate', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { recoveryFixture, recoveryDump } = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const h = await recoveryFixture(), saved = await h.prepare();
    const r = indexedDB.open('football-science-history-drafts-v1');
    const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const changed = structuredClone(saved.row); changed.content.value = changed.content.value.replace('Historical', 'HISTORICAL');
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put(changed);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    }); db.close();
    const before = JSON.stringify(await recoveryDump());
    let readDenied = false, retryDenied = false;
    try { await h.service.read(saved.row.id); } catch { readDenied = true; }
    try { await h.prepare(); } catch { retryDenied = true; }
    return { readDenied, retryDenied, unchanged: before === JSON.stringify(await recoveryDump()) };
  });
  expect(result).toEqual({ readDenied: true, retryDenied: true, unchanged: true });
});

test('closing during an active draft transaction preserves prior draft and allows safe retry', async ({ page, context }) => {
  await page.goto('/medical-merge.js');
  const before = await page.evaluate(async () => {
    const helper = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    window.h = await helper.recoveryFixture(); await h.prepare();
    const before = JSON.stringify(await helper.recoveryDump());
    h.row.id = 'interrupted'; await helper.seedLegacyRecovery(h.row);
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      const result = add.apply(this, args);
      if (this.transaction.db.name === 'football-science-history-drafts-v1' && this.name === 'drafts') {
        const tx = this.transaction;
        result.addEventListener('success', () => {
          window.held = true;
          const hold = () => { const r = tx.objectStore('drafts').get('absent'); r.onsuccess = hold; }; hold();
        });
      }
      return result;
    };
    window.saved = false; void h.prepare().then(() => { window.saved = true; }).catch(() => {});
    return before;
  });
  await page.waitForFunction(() => window.held); expect(await page.evaluate(() => window.saved)).toBe(false);
  await page.close(); const reopened = await context.newPage(); await reopened.goto('/medical-merge.js');
  const result = await reopened.evaluate(async before => {
    const helper = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const dump = await helper.recoveryDump();
    const h = await helper.recoveryFixture();
    const original = await h.service.read(dump.drafts.find(row => row.content.source.id === 'history-one').id);
    const interrupted = dump.drafts.find(row => row.content.source.id === 'interrupted');
    let complete = false;
    if (interrupted) complete = (await h.service.read(interrupted.id)).content.source.id === 'interrupted';
    h.row.id = 'interrupted'; await helper.seedLegacyRecovery(h.row);
    await h.prepare();
    return { original: original.content.value === helper.recoveryEnvelope().storage[helper.recoveryKey],
      atomic: before === JSON.stringify(dump) || complete, count: (await helper.recoveryDump()).drafts.length };
  }, before);
  expect(result).toEqual({ original: true, atomic: true, count: 2 });
});

test('transaction timeout rejects without a late background commit', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const helper = await import('/qa/helpers/history-recovery-draft-fixture.mjs');
    const h = await helper.recoveryFixture({ storeOptions: { timeoutMs: 250 } });
    let reachedTransaction = false;
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      const request = add.apply(this, args);
      if (this.transaction.db.name === 'football-science-history-drafts-v1' && this.name === 'drafts') {
        const tx = this.transaction;
        request.addEventListener('success', () => {
          reachedTransaction = true;
          const hold = () => { const r = tx.objectStore('drafts').get('absent'); r.onsuccess = hold; }; hold();
        });
      }
      return request;
    };
    let rejected = false;
    try { await h.prepare(); } catch { rejected = true; }
    finally { IDBObjectStore.prototype.add = add; }
    const dump = await helper.recoveryDump();
    return { rejected, reachedTransaction, count: dump?.drafts.length || 0, catalog: dump?.catalog.length || 0 };
  });
  expect(result).toEqual({ rejected: true, reachedTransaction: true, count: 0, catalog: 0 });
});
