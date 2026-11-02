import { test, expect } from '@playwright/test';

async function boot(page, name = `qa-budget-${crypto.randomUUID()}`) {
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
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = (id, extra = {}) => ({ id, schema: 'v1', app: 'Football Science', createdAt: id,
      storage: { library: id }, recoveryCopies: {}, recoverySeparations: [], recoveryState: {},
      saveContext: { scope: 'owner', entries: {} }, ...extra });
    const inspect = () => new Promise((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'latest']);
      const history = tx.objectStore('snapshots').getAll(), latest = tx.objectStore('latest').getAll();
      tx.oncomplete = () => resolve({ history: history.result, latest: latest.result });
      tx.onabort = () => reject(tx.error);
    });
    const seed = (rows, latest) => new Promise((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'latest'], 'readwrite');
      rows.forEach(row => tx.objectStore('snapshots').put(row));
      if (latest) tx.objectStore('latest').put(latest);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    const write = async (row, budget) => {
      try { return await storeDistinctSnapshot(db, 'snapshots', 'latest', row, budget); }
      catch (error) { return { error: error.message }; }
    };
    window.budgetProbe = { db, row, inspect, seed, write, snapshotBytes };
  }, name);
}

for (const limit of ['single', 'total']) {
  test(`${limit} byte limit refuses a new copy without changing pending, review, unknown or latest`, async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(async limit => {
      const p = window.budgetProbe;
      const rows = [
        p.row('pending', { saveContext: { scope: 'owner', entries: { library: { pendingCentralSync: true } } } }),
        p.row('review', { recoveryCopies: { retained: 'review content' } }),
        { id: 'legacy-unknown', content: 'No classification proof' },
        { id: 'football-session-planner-v3-quota-fallback:owner', content: 'Protected Sessions work' },
      ];
      await p.seed(rows);
      await p.write(p.row('current'));
      const before = await p.inspect();
      const next = p.row('new', { storage: { library: 'x'.repeat(4096) } });
      const copy = { ...next, id: 'latest', sourceSnapshotId: next.id };
      const bytes = before.history.reduce((n, row) => n + p.snapshotBytes(row), 0) + p.snapshotBytes(next) + p.snapshotBytes(copy);
      const budget = limit === 'single' ? { maxSnapshotBytes: p.snapshotBytes(next) - 1 } : { maxTotalBytes: bytes - 1 };
      const refused = await p.write(next, budget);
      const after = await p.inspect();
      const admitted = await p.write(next, { maxTotalBytes: bytes });
      const exact = await p.inspect();
      return { refused, unchanged: JSON.stringify(before) === JSON.stringify(after), admitted,
        bytes, actualBytes: exact.history.reduce((n, row) => n + p.snapshotBytes(row), 0) + p.snapshotBytes(exact.latest[0]),
        originalsRetained: before.history.every(row => exact.history.some(saved => JSON.stringify(saved) === JSON.stringify(row))) };
    }, limit);
    expect(result.refused.error).toContain('storage limit');
    expect(result.unchanged).toBe(true);
    expect(result.admitted.written).toBe(true);
    expect(result.actualBytes).toBe(result.bytes);
    expect(result.originalsRetained).toBe(true);
  });
}

test('two tabs cannot jointly exceed the same byte budget', async ({ page, context }) => {
  const name = `qa-budget-tabs-${crypto.randomUUID()}`, other = await context.newPage();
  await boot(page, name); await boot(other, name);
  const budget = await page.evaluate(async () => {
    const p = window.budgetProbe;
    await p.write(p.row('0'));
    // One existing row + one additional row + latest, with a small ID-length allowance.
    return { maxTotalBytes: p.snapshotBytes(p.row('0')) * 3 + 100 };
  });
  const results = await Promise.all([page, other].map((tab, i) => tab.evaluate(({ budget, id }) =>
    window.budgetProbe.write(window.budgetProbe.row(id), budget), { budget, id: String(i + 1) })));
  expect(results.filter(result => result.written)).toHaveLength(1);
  expect(results.filter(result => result.error?.includes('storage limit'))).toHaveLength(1);
  const state = await page.evaluate(() => window.budgetProbe.inspect());
  expect(state.history).toHaveLength(2);
  expect(state.history.some(row => row.id === state.latest[0].sourceSnapshotId)).toBe(true);
});

test('an orphaned latest cannot be overwritten by another scope or generation', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const p = window.budgetProbe, orphan = { ...p.row('old'), id: 'latest', sourceSnapshotId: 'missing' };
    await p.seed([], orphan);
    const refused = await p.write(p.row('new', { saveContext: { scope: 'other', entries: {} } }));
    const after = await p.inspect();
    const repaired = await p.write({ ...p.row('repair'), storage: orphan.storage });
    return { refused, after, orphan, repaired };
  });
  expect(result.refused.error).toContain('previous latest copy needs recovery');
  expect(result.after).toEqual({ history: [], latest: [result.orphan] });
  expect(result.repaired.written).toBe(true);
});

test('representative multi-module envelopes hit the aggregate ceiling before the row ceiling', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const p = window.budgetProbe, outcomes = [];
    // Approximately 8 MiB UTF-16, comparable to the observed 8.61 MiB latest envelope.
    const payload = Object.fromEntries(['library', 'profiles', 'medical', 'sessions'].map(key => [key, 'x'.repeat(1024 * 1024)]));
    for (let i = 0; i < 9; i++) outcomes.push(await p.write(p.row(String(i), { storage: { ...payload, revision: String(i) } })));
    const state = await p.inspect();
    return { admitted: outcomes.filter(result => result.written).length, refused: outcomes.filter(result => result.error).length,
      count: state.history.length, total: state.history.reduce((n, row) => n + p.snapshotBytes(row), 0) + p.snapshotBytes(state.latest[0]) };
  });
  expect(result).toMatchObject({ admitted: 6, refused: 3, count: 6 });
  expect(result.total).toBeLessThanOrEqual(64 * 1024 * 1024);
});

test('budget refusal is visible and never prevents module writes or advances snapshot success', async ({ page }) => {
  await page.goto('/medical-merge.js');
  const result = await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import('/src/core/data-safety-runtime-service.mjs');
    const key = 'football-exercises-v2', element = document.createElement('div');
    let writes = 0;
    const service = createDataSafetyRuntimeService({
      win: { localStorage, indexedDB, crypto, location, setTimeout: () => 0, clearTimeout() {}, addEventListener() {} },
      documentRef: document, navigatorRef: {}, storageConstructor: Storage, maxSnapshotBytes: 4096,
      databaseName: `qa-budget-status-${crypto.randomUUID()}`, protectedStorageKeys: [key], ui: { dataSafetyStatus: element },
      getCentralStateBridge: () => ({ getReadScope: () => 'owner', getStatus: () => ({ lastSyncedAt: 'earlier-confirmation' }) }),
      queueCentralStateWrite: () => { writes++; return true; },
    });
    service.install();
    localStorage.setItem(key, 'small');
    if (!await service.saveSnapshot('first')) throw new Error('Baseline failed');
    const timestamp = service.readManifest().lastSnapshotAt;
    localStorage.setItem(key, 'x'.repeat(4096));
    const saved = await service.saveSnapshot('too-large');
    service.refreshStatus();
    const pendingTitle = element.title, pendingText = element.textContent;
    // Simulate a separate central receipt; snapshot refusal must remain visible afterwards.
    service.mutateManifest(manifest => { manifest.entries[key].pendingCentralSync = false; });
    service.refreshStatus();
    const title = element.title, text = element.textContent;
    localStorage.setItem(key, 'newer module edit');
    return { saved, title, text, pendingTitle, pendingText, backedUp: element.classList.contains('is-backed-up'),
      sameTimestamp: timestamp === service.readManifest().lastSnapshotAt, saveError: service.status.lastError,
      snapshotError: service.readManifest().lastSnapshotError, writes, current: localStorage.getItem(key) };
  });
  expect(result).toMatchObject({ saved: false, text: 'Local history needs attention', backedUp: false,
    sameTimestamp: true, saveError: '', writes: 3, current: 'newer module edit' });
  expect(result.pendingText).toBe('Sync pending');
  expect(result.pendingTitle).toContain('storage limit');
  expect(result.title).toContain('storage limit');
  expect(result.snapshotError).toBe(result.title);
});
