import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('/medical-merge.js'); });

test('disabled by default and unsupported envelopes never create compact storage', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { createCompactSnapshotArchive } = await import('/src/core/snapshot-compact-archive.mjs');
    const { writerFixture, candidateRow, writerDump } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const row = candidateRow(), before = JSON.stringify(row), disabled = await createCompactSnapshotArchive().save(row);
    const { writer } = writerFixture(); const results = [];
    for (const kind of ['small', 'recovery', 'foreign', 'unknown', 'manual', 'other-module', 'acknowledged']) {
      const copy = structuredClone(row);
      if (kind === 'small') copy.storage['football-session-planner-v3'] = '{"sessions":{}}';
      if (kind === 'recovery') copy.recoveryCopies.key = 'Do not drop';
      if (kind === 'foreign') copy.saveContext.scope = 'someone-else';
      if (kind === 'unknown') copy.futureRecovery = 'Keep this';
      if (kind === 'acknowledged') { copy.saveContext.entries['football-session-planner-v3'].pendingCentralSync = false; copy.saveContext.entries['football-session-planner-v3'].localWritePrepared = false; }
      if (kind === 'manual') copy.reason = 'before-import';
      if (kind === 'other-module') copy.storage['football-medical-team-v1'] = 'Preserve module';
      results.push(await writer.save(copy));
    }
    return { disabled, results, unchanged: before === JSON.stringify(row), db: await writerDump() };
  })).toEqual({ disabled: { status: 'unsupported' }, results: Array(7).fill({ status: 'unsupported' }), unchanged: true, db: null });
});

test('byte-exact reader, retry, new capture deduplication and immutable collision', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { writerFixture, candidateRow, writerDump } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const { writer, reader } = writerFixture(), row = candidateRow();
    const first = await writer.save(row), retry = await writer.save(row);
    const same = await writer.save({ ...row, id: 'new-capture', createdAt: '2026-11-13T10:00:00Z' });
    const decoded = await reader.read({ source: 'compact', id: first.id });
    const before = await writerDump(); let collision = false;
    try { await writer.save(candidateRow('one', 1)); } catch { collision = true; }
    return { first, retry, same, exact: JSON.stringify(decoded.envelope) === JSON.stringify(row), collision,
      unchanged: JSON.stringify(await writerDump()) === JSON.stringify(before), count: before.versions.length };
  });
  expect(r.first.written).toBe(true); expect(r.retry.written).toBe(false); expect(r.same.written).toBe(false);
  expect(r.same.id).toBe('one'); expect(r.exact && r.collision && r.unchanged).toBe(true); expect(r.count).toBe(1);
});

for (const fault of ['quota-version', 'quota-head', 'abort', 'scope', 'role', 'disable', 'aba', 'timeout'])
  test(`a failed new history write preserves every earlier version: ${fault}`, async ({ page }) => {
    const r = await page.evaluate(async fault => {
      const { writerFixture, candidateRow, writerDump, dbName } = await import('/qa/helpers/compact-writer-fixture.mjs');
      const h = writerFixture(); await h.writer.save(candidateRow()); const before = JSON.stringify(await writerDump());
      const add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      if (fault.startsWith('quota')) {
        const method = fault === 'quota-version' ? 'add' : 'put'; const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function(...args) {
          if (this.transaction.db.name === dbName) throw new DOMException('Synthetic full storage', 'QuotaExceededError');
          return original.apply(this, args);
        };
      } else if (fault === 'abort') {
        IDBObjectStore.prototype.add = function(...args) {
          const r = add.apply(this, args);
          if (this.transaction.db.name === dbName) r.addEventListener('success', () => this.transaction.abort());
          return r;
        };
      } else {
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        crypto.subtle.digest = async (...args) => {
          crypto.subtle.digest = digest;
          if (fault === 'scope') h.state.scope = 'foreign';
          if (fault === 'role') h.state.canWrite = false;
          if (fault === 'disable') h.state.enabled = false;
          if (fault === 'aba') h.state.generation++;
          if (fault === 'timeout') await new Promise(resolve => setTimeout(resolve, 3200));
          return digest(...args);
        };
      }
      let rejected = false;
      try { await h.writer.save(candidateRow('two', 2)); } catch { rejected = true; }
      IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put;
      if (fault === 'timeout') await new Promise(resolve => setTimeout(resolve, 300));
      return { rejected, unchanged: before === JSON.stringify(await writerDump()) };
    }, fault);
    expect(r).toEqual({ rejected: true, unchanged: true });
  });

for (const limit of ['count', 'bytes']) test(`bounded history rejects new copies without eviction: ${limit}`, async ({ page }) => {
  expect(await page.evaluate(async limit => {
    const { writerFixture, candidateRow, writerDump } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const normal = writerFixture(); await normal.writer.save(candidateRow()); const before = JSON.stringify(await writerDump());
    const h = writerFixture({ storeOptions: limit === 'count' ? { maxVersions: 1 } : { maxBytes: 1 } });
    let rejected = false; try { await h.writer.save(candidateRow('two', 2)); } catch { rejected = true; }
    return { rejected, unchanged: before === JSON.stringify(await writerDump()) };
  }, limit)).toEqual({ rejected: true, unchanged: true });
});

test('corrupt deduplication target fails closed without repairing or adding history', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { writerFixture, candidateRow, writerDump, dbName } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const h = writerFixture(), row = candidateRow(); await h.writer.save(row);
    const r = indexedDB.open(dbName); const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction('versions', 'readwrite'), store = tx.objectStore('versions'), get = store.get(JSON.stringify(['actor-A', 'one']));
    get.onsuccess = () => { const bad = get.result; bad.packet.bytes[0] ^= 255; store.put(bad); };
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
    const before = JSON.stringify(await writerDump()); let rejected = false;
    try { await h.writer.save(candidateRow('new-id')); } catch { rejected = true; }
    return { rejected, unchanged: before === JSON.stringify(await writerDump()) };
  })).toEqual({ rejected: true, unchanged: true });
});

test('two real tabs commit one identical capture and preserve both distinct captures', async ({ page, context }) => {
  const peer = await context.newPage(); await peer.goto('/medical-merge.js');
  const write = (p, id, generation) => p.evaluate(async ({ id, generation }) => {
    const { writerFixture, candidateRow } = await import('/qa/helpers/compact-writer-fixture.mjs');
    return writerFixture().writer.save(candidateRow(id, generation));
  }, { id, generation });
  const same = await Promise.all([write(page, 'first', 0), write(peer, 'second', 0)]);
  expect(same.filter(r => r.written)).toHaveLength(1);
  await Promise.all([write(page, 'third', 1), write(peer, 'fourth', 2)]);
  expect(await page.evaluate(async () => (await (await import('/qa/helpers/compact-writer-fixture.mjs')).writerDump()).versions.length)).toBe(3);
});

test('non-JSON arrays, small valid copies and reader-overbudget versions retain the legacy path', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { writerFixture, candidateRow, writerDump } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const { writer } = writerFixture(), results = [];
    const extended = candidateRow(); extended.summary = [1]; extended.summary.length = 2; extended.summary.extra = 'Must not disappear';
    const small = candidateRow(); const data = JSON.parse(small.storage['football-session-planner-v3']);
    data.sessions['2026-11-12'].blocks[0].objective = 'Short'; small.storage['football-session-planner-v3'] = JSON.stringify(data);
    const large = candidateRow(); large.summary = 'x'.repeat(8 * 1024 * 1024);
    for (const row of [extended, small, large]) results.push(await writer.save(row));
    return { results, db: await writerDump(), retained: extended.summary.extra };
  })).toEqual({ results: Array(3).fill({ status: 'unsupported' }), db: null, retained: 'Must not disappear' });
});

test('existing incompatible compact schema is not migrated, cleared or adopted', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { writerFixture, candidateRow, dbName } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('versions', { keyPath: 'key' }); r.result.createObjectStore('blocks', { keyPath: 'key' }); };
    const db = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction('versions', 'readwrite'); tx.objectStore('versions').add({ key: 'foreign-format', retained: 'Saved work' });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
    let rejected = false; try { await writerFixture().writer.save(candidateRow()); } catch { rejected = true; }
    const rr = indexedDB.open(dbName); const reopened = await new Promise(resolve => { rr.onsuccess = () => resolve(rr.result); });
    const names = [...reopened.objectStoreNames], read = reopened.transaction('versions').objectStore('versions').get('foreign-format');
    const row = await new Promise(resolve => { read.onsuccess = () => resolve(read.result); }); reopened.close();
    return { rejected, names, row };
  })).toEqual({ rejected: true, names: ['blocks', 'versions'], row: { key: 'foreign-format', retained: 'Saved work' } });
});

test('closing a tab in its write transaction preserves earlier history and permits safe retry', async ({ page, context }) => {
  await page.evaluate(async () => {
    const { writerFixture, candidateRow, dbName } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const h = writerFixture(); await h.writer.save(candidateRow());
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      const r = add.apply(this, args);
      if (this.transaction.db.name === dbName) {
        const tx = this.transaction;
        r.addEventListener('success', () => {
          window.transactionHeld = true;
          const hold = () => { const read = tx.objectStore('versions').get('absent'); read.onsuccess = hold; }; hold();
        });
      }
      return r;
    };
    window.writeConfirmed = false;
    void h.writer.save(candidateRow('interrupted', 1)).then(() => { window.writeConfirmed = true; }).catch(() => {});
  });
  await page.waitForFunction(() => window.transactionHeld); expect(await page.evaluate(() => window.writeConfirmed)).toBe(false);
  await page.close(); const next = await context.newPage(); await next.goto('/medical-merge.js');
  expect(await next.evaluate(async () => {
    const { writerFixture, candidateRow, writerDump } = await import('/qa/helpers/compact-writer-fixture.mjs');
    const h = writerFixture(), prior = await h.reader.read({ source: 'compact', id: 'one' });
    const before = await writerDump(), interrupted = await h.reader.read({ source: 'compact', id: 'interrupted' });
    await h.writer.save(candidateRow('interrupted', 1));
    return { original: JSON.stringify(prior.envelope) === JSON.stringify(candidateRow()),
      atomic: before.versions.length === 1 || (before.versions.length === 2 && interrupted.status === 'ok'), count: (await writerDump()).versions.length };
  })).toEqual({ original: true, atomic: true, count: 2 });
});
