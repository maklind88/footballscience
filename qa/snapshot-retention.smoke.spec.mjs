import { test, expect } from '@playwright/test';

async function boot(page, name = `qa-retention-${crypto.randomUUID()}`) {
  await page.goto('/medical-merge.js');
  await page.evaluate(async name => {
    const { storeDistinctSnapshot } = await import('/src/core/distinct-snapshot-store.mjs');
    const { snapshotBytes } = await import('/src/core/snapshot-budget.mjs');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('snapshots', { keyPath: 'id' });
        request.result.createObjectStore('latest', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const row = (id, value = 'A') => ({ id, schema: 'football-science-backup-v1', app: 'Football Science',
      createdAt: `2026-11-02T12:00:${id.padStart(2, '0')}.000Z`, reason: 'autosave',
      storage: { key: value }, summary: { keyCount: 1 }, recoveryCopies: {}, recoveryState: {}, recoverySeparations: [],
      saveContext: { scope: 'owner', entries: { key: { principalScope: 'owner', pendingCentralSync: false,
        serverRevision: 3, writes: 1, updatedAt: '2026-11-02T12:00:00.000Z', hash: 'deliberate-collision' } } } });
    const inspect = () => new Promise((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'latest']);
      const history = tx.objectStore('snapshots').getAll(), latest = tx.objectStore('latest').getAll();
      tx.oncomplete = () => resolve({ history: history.result, latest: latest.result });
      tx.onabort = () => reject(tx.error);
    });
    const seed = rows => new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      rows.forEach(row => tx.objectStore('snapshots').put(row));
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    const write = async (row, budget = { maxSnapshots: 2 }) => {
      try { return await storeDistinctSnapshot(db, 'snapshots', 'latest', row, budget); }
      catch (error) { return { error: error.message }; }
    };
    window.retentionProbe = { db, row, inspect, seed, write, snapshotBytes };
  }, name);
}

test('future exact duplicates rotate under count pressure while distinct contents survive', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const p = window.retentionProbe, writes = [];
    for (let i = 0; i < 40; i++) writes.push(await p.write(p.row(String(i).padStart(2, '0'), i % 2 ? 'B' : 'A')));
    const state = await p.inspect();
    return { writes, state };
  });
  expect(result.writes.every(write => write.written)).toBe(true);
  expect(result.state.history.map(row => row.id)).toEqual(['38', '39']);
  expect(result.state.history.map(row => row.storage.key)).toEqual(['A', 'B']);
  expect(result.state.latest[0].sourceSnapshotId).toBe('39');
});

test('replacement also respects exact aggregate bytes and leaves history intact below budget', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const p = window.retentionProbe;
    await p.write(p.row('01', 'A')); await p.write(p.row('02', 'B'));
    const before = await p.inspect();
    const limit = before.history.reduce((n, row) => n + p.snapshotBytes(row), 0) + p.snapshotBytes(before.latest[0]);
    const replaced = await p.write(p.row('03', 'A'), { maxSnapshots: 30, maxTotalBytes: limit });
    const bounded = await p.inspect();
    const spare = await p.write(p.row('04', 'B'), { maxSnapshots: 30 });
    return { replaced, spare, bounded, after: await p.inspect(), limit,
      bytes: bounded.history.reduce((n, row) => n + p.snapshotBytes(row), 0) + p.snapshotBytes(bounded.latest[0]) };
  });
  expect(result.replaced.written).toBe(true);
  expect(result.bounded.history.map(row => row.id)).toEqual(['02', '03']);
  expect(result.bytes).toBe(result.limit);
  expect(result.spare.written).toBe(true);
  expect(result.after.history.map(row => row.id)).toEqual(['02', '03', '04']);
});

for (const kind of ['legacy', 'pending', 'review', 'unknown-field', 'unknown-policy', 'manual', 'scope', 'generation', 'payload', 'summary', 'prepared', 'deletion', 'missing-owner', 'separation', 'recovery-state']) {
  test(`${kind} copies cannot be retired using a coinciding value or hash`, async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(async kind => {
      const p = window.retentionProbe;
      await p.write(p.row('01', 'A')); await p.write(p.row('02', 'B'));
      const original = (await p.inspect()).history[0], next = p.row('03', 'A');
      if (kind === 'legacy') delete original.retention;
      if (kind === 'pending') {
        original.saveContext.entries.key.pendingCentralSync = true;
        next.saveContext.entries.key.pendingCentralSync = true;
      }
      if (kind === 'prepared') original.saveContext.entries.key.localWritePrepared = next.saveContext.entries.key.localWritePrepared = true;
      if (kind === 'deletion') original.saveContext.entries.key.deletedAt = next.saveContext.entries.key.deletedAt = '2026-11-02';
      if (kind === 'missing-owner') delete original.saveContext.entries.key.principalScope;
      if (kind === 'separation') original.recoverySeparations = next.recoverySeparations = ['medical'];
      if (kind === 'recovery-state') original.recoveryState = next.recoveryState = { key: { value: 'Protected work' } };
      if (kind === 'review') original.recoveryCopies = next.recoveryCopies = { retained: 'Unresolved version' };
      if (kind === 'unknown-field') original.futureRecovery = next.futureRecovery = 'Do not infer safety';
      if (kind === 'unknown-policy') original.retention.policy = 'future-policy-v2';
      if (kind === 'manual') original.reason = next.reason = 'before-restore';
      if (kind === 'scope') next.saveContext.scope = next.saveContext.entries.key.principalScope = 'other-owner';
      if (kind === 'generation') next.saveContext.entries.key.writes++;
      if (kind === 'payload') next.storage.key = 'C';
      if (kind === 'summary') next.summary = { keyCount: 1, retainedLabel: 'different' };
      await p.seed([original]);
      const before = await p.inspect(), refused = await p.write(next);
      return { refused, unchanged: JSON.stringify(before) === JSON.stringify(await p.inspect()) };
    }, kind);
    expect(result.refused.error).toContain('storage limit');
    expect(result.unchanged).toBe(true);
  });
}

test('a failed replacement restores every queued deletion and retry succeeds', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const p = window.retentionProbe;
    await p.write(p.row('01')); await p.write(p.row('02', 'B'));
    const before = await p.inspect(), original = IDBObjectStore.prototype.put;
    let injected = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'latest' && this.transaction.db.name === p.db.name) {
        injected++; throw new DOMException('Injected replacement quota failure', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
    let failed;
    try { failed = await p.write(p.row('03')); } finally { IDBObjectStore.prototype.put = original; }
    const afterFailure = await p.inspect(), retried = await p.write(p.row('03'));
    return { failed, injected, unchanged: JSON.stringify(before) === JSON.stringify(afterFailure), retried,
      ids: (await p.inspect()).history.map(row => row.id) };
  });
  expect(result.failed.error).toContain('quota failure');
  expect(result).toMatchObject({ injected: 1, unchanged: true, retried: { written: true }, ids: ['02', '03'] });
});

test('two tabs serialize exact replacement and preserve distinct versions across reload', async ({ page, context }) => {
  const name = `qa-retention-tabs-${crypto.randomUUID()}`, other = await context.newPage();
  await boot(page, name); await boot(other, name);
  await page.evaluate(async () => {
    const p = window.retentionProbe; await p.write(p.row('01')); await p.write(p.row('02', 'B'));
  });
  const results = await Promise.all([page, other].map((tab, i) => tab.evaluate(id => {
    const p = window.retentionProbe; return p.write(p.row(id));
  }, `0${i + 3}`)));
  expect(results.filter(result => result.written)).toHaveLength(1);
  expect(results.filter(result => result.written === false)).toHaveLength(1);
  const before = await page.evaluate(() => window.retentionProbe.inspect());
  await context.setOffline(true);
  // Already loaded code can replace a duplicate offline too.
  const offline = await page.evaluate(() => window.retentionProbe.write(window.retentionProbe.row('05', 'B')));
  expect(offline.written).toBe(true);
  const committed = await page.evaluate(() => window.retentionProbe.inspect());
  await context.setOffline(false);
  await boot(page, name);
  expect(await page.evaluate(() => window.retentionProbe.inspect())).toEqual(committed);
  expect(before.history).toHaveLength(2);
  expect(committed.history.map(row => row.storage.key).sort()).toEqual(['A', 'B']);
});

test('the actual runtime marks only new clean automatic snapshots and replaces them at capacity', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
    const key = 'football-exercises-v2';
    const service = createDataSafetyRuntimeService({
      win: { localStorage, indexedDB, crypto, location, setTimeout: () => 0, clearTimeout() {}, addEventListener() {} },
      documentRef: document, navigatorRef: {}, storageConstructor: Storage,
      databaseName: `qa-runtime-retention-${crypto.randomUUID()}`, protectedStorageKeys: [key], maxSnapshots: 2,
      getCentralStateBridge: () => ({ getReadScope: () => 'owner' }),
    });
    service.install();
    service.mutateManifest(manifest => { manifest.entries[key] = { principalScope: 'owner', pendingCentralSync: false,
      serverRevision: 3, writes: 1, updatedAt: '2026-11-02T12:00:00.000Z', hash: 'same-short-hash' }; });
    const saved = [];
    for (const value of ['A', 'B', 'A']) {
      service.rawSetItem(key, value); saved.push(await service.saveSnapshot('autosave'));
    }
    const db = await service.openDatabase();
    const history = await new Promise(resolve => {
      const request = db.transaction('snapshots').objectStore('snapshots').getAll(); request.onsuccess = () => resolve(request.result);
    });
    return { saved, values: history.map(row => row.storage[key]).sort(), policies: history.map(row => row.retention?.policy),
      warning: service.status.lastSnapshotError };
  });
  expect(result).toEqual({ saved: [true, true, true], values: ['A', 'B'],
    policies: ['exact-local-replacement-v1', 'exact-local-replacement-v1'], warning: '' });
});

test('new recovery fields cannot disappear through consecutive duplicate suppression', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const p = window.retentionProbe;
    await p.write(p.row('01'));
    const next = { ...p.row('02'), futureRecovery: { value: 'New format retained work' } };
    const newField = await p.write(next);
    const repeats = await p.write({ ...next, id: '03' });
    const refused = await p.write({ ...p.row('04'), futureRecovery: { value: 'Another pending version' } });
    return { newField, repeats, refused, state: await p.inspect() };
  });
  expect(result.newField.written).toBe(true);
  expect(result.repeats.written).toBe(false);
  expect(result.refused.error).toContain('storage limit');
  expect(result.state.history.map(row => row.id)).toEqual(['01', '02']);
  expect(result.state.latest[0].futureRecovery.value).toBe('New format retained work');
});

test('caller mutations cannot change measured contents or eligibility during an asynchronous write', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const p = window.retentionProbe, original = p.row('01');
    const pending = p.write(original);
    original.storage.key = 'x'.repeat(10000);
    original.saveContext.entries.key.pendingCentralSync = true;
    original.recoveryCopies.retained = 'Later draft';
    const saved = await pending;
    return { saved, state: await p.inspect() };
  });
  expect(result.saved.written).toBe(true);
  expect(result.state.history[0]).toMatchObject({ storage: { key: 'A' }, recoveryCopies: {},
    saveContext: { entries: { key: { pendingCentralSync: false } } }, retention: { policy: 'exact-local-replacement-v1' } });
  expect(result.state.latest[0].storage.key).toBe('A');
});
