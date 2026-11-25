import { test, expect } from '@playwright/test';
import { createRestartHarness, initial, day, rows, stage, replay, owner } from './helpers/session-restart-harness.mjs';

let harness;
test.beforeEach(async ({ baseURL, browserName }) => { harness = await createRestartHarness(baseURL, browserName); });
test.afterEach(async () => { await harness?.dispose(); harness = null; });
const edit = title => { const value = initial(); value.sessions[day].blocks[0].title = title; return value; };
const accepted = page => page.evaluate(() => window.saveClient.readAcceptedBase());

test('accepted date persists, fresh reader restores without observe, later edits and other scopes remain separate', async () => {
  const page = await harness.open(), a = edit('Accepted A'), b = edit('Pending B');
  await stage(page, a, initial()); harness.state.mode = 'online';
  expect(await replay(page)).toMatchObject({ ok: true });
  const base = await accepted(page);
  expect(base).toMatchObject({ dates: [day], revisions: { [day]: 11 }, complete: false, readOnly: true });
  expect(JSON.parse(base.value).sessions[day].blocks[0].title).toBe('Accepted A');
  harness.state.mode = 'offline'; await stage(page, b, a);
  const pending = await rows(page);
  expect(await accepted(page)).toEqual(base);
  const result = await page.evaluate(async ({ scope }) => {
    const { createSessionSaveClient } = await import('/src/modules/session-planner/session-save-client.mjs');
    const client = createSessionSaveClient({ getScope: () => scope, send: async () => { throw new Error('Recovery must not send'); } });
    return { base: await client.readAcceptedBase(), ready: client.isReady(), central: client.centralValue() };
  }, { scope: owner });
  expect(result).toEqual({ base, ready: false, central: null });
  expect(await rows(page)).toEqual(pending);
  expect(await page.evaluate(() => window.saveStore.readAcceptedBase('other-scope', 'other-scope'))).toBeNull();
  // Same journal scope but a different full principal/organization is not enough.
  expect(await page.evaluate(scope => window.saveStore.readAcceptedBase(scope, 'another-organization'), owner)).toBeNull();
});

test('atomic receipt transaction keeps all records on abort and safely retries the same operation', async () => {
  const page = await harness.open(); await stage(page, edit('A'), initial());
  const pending = await rows(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.abortBase = true;
    IDBObjectStore.prototype.put = function(value, ...args) {
      const request = original.call(this, value, ...args);
      if (window.abortBase && value?.id?.startsWith('session-accepted-date:')) {
        request.addEventListener('success', () => this.transaction.abort());
      }
      return request;
    };
  });
  harness.state.mode = 'online';
  expect(await replay(page)).toMatchObject({ ok: false, centralAcknowledged: true, localCheckpointPending: true,
    acknowledgedOperationId: pending[0].change.id });
  expect(await rows(page)).toEqual(pending); expect(await accepted(page)).toBeNull();
  expect(harness.state.effects).toBe(1);
  await page.evaluate(() => { window.abortBase = false; });
  expect(await replay(page)).toMatchObject({ ok: true });
  expect(harness.state.effects).toBe(1);
  expect(harness.state.calls.map(row => row.change.id)).toEqual([pending[0].change.id, pending[0].change.id]);
  expect(await rows(page)).toEqual([]); expect((await accepted(page)).revisions[day]).toBe(11);
});

test('older receipts cannot roll back a date; equal-revision mismatch and changed journal fail closed', async () => {
  const page = await harness.open(); await stage(page, edit('A'), initial());
  const [a] = await rows(page); harness.state.mode = 'online'; await replay(page);
  await stage(page, edit('B'), edit('A')); const [b] = await rows(page); await replay(page);
  const before = await accepted(page);
  const receipt = row => ({ id: row.change.id, date: day, value: row.change.after });
  await page.evaluate(async ({ a, receipt, owner }) => {
    await window.saveStore.put(a);
    await window.saveStore.acknowledge(a, receipt, { revision: 11 }, { owner });
  }, { a, receipt: receipt(a), owner });
  expect(await accepted(page)).toEqual(before); expect(await rows(page)).toEqual([]);
  const outcome = await page.evaluate(async ({ a, receipt, owner }) => {
    await window.saveStore.put(a);
    try { await window.saveStore.acknowledge(a, receipt, { revision: 12 }, { owner }); return 'unexpected'; }
    catch { return 'retained'; }
  }, { a, receipt: receipt(a), owner });
  expect(outcome).toBe('retained'); expect(await accepted(page)).toEqual(before); expect(await rows(page)).toEqual([a]);
  const changed = await page.evaluate(async ({ a, receipt, owner }) => {
    const newer = { ...a, writer: 'another-tab', createdAt: a.createdAt + 1 };
    await window.saveStore.put(newer);
    try { await window.saveStore.acknowledge(a, receipt, { revision: 13 }, { owner }); return null; }
    catch { return window.saveStore.list(owner); }
  }, { a, receipt: receipt(a), owner });
  expect(changed[0].writer).toBe('another-tab'); expect(await accepted(page)).toEqual(before);
  expect(b.change.id).not.toBe(a.change.id);
});

test('scope change during checkpoint retains exact pending and corrupt base is rejected without writes', async () => {
  const page = await harness.open(); await stage(page, edit('A'), initial()); const [a] = await rows(page);
  expect(await page.evaluate(async ({ a, owner, day }) => {
    try { await window.saveStore.acknowledge(a, { id: a.change.id, date: day, value: a.change.after }, { revision: 11 },
      { owner, isCurrent: () => false }); return 'unexpected'; } catch { return 'retained'; }
  }, { a, owner, day })).toBe('retained');
  expect(await rows(page)).toEqual([a]); expect(await accepted(page)).toBeNull();
  harness.state.mode = 'online'; await replay(page);
  expect(await page.evaluate(async () => {
    const request = indexedDB.open('football-science-data-safety-v1');
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('latest', 'readwrite'), store = tx.objectStore('latest'), all = store.getAll();
      all.onsuccess = () => { const row = all.result.find(row => row.id.startsWith('session-accepted-date:')); row.hash = 'corrupt'; store.put(row); };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
    try { await window.saveClient.readAcceptedBase(); return 'unexpected'; } catch { return 'rejected'; }
  })).toBe('rejected');
});

test('invalid receipt revision cannot corrupt the in-memory base or retire the journal', async () => {
  const page = await harness.open(); await stage(page, edit('A'), initial());
  const pending = await rows(page);
  const result = await page.evaluate(async ({ scope, initial }) => {
    const { createSessionSaveClient } = await import('/src/modules/session-planner/session-save-client.mjs');
    const client = createSessionSaveClient({ getScope: () => scope,
      send: async change => ({ ok: true, payload: { metadata: { revision: 'invalid' },
        sessionChange: { id: change.id, date: change.date, value: change.after } } }) });
    client.observe(JSON.stringify(initial), { revision: 10 });
    const result = await client.replay();
    return { result, central: JSON.parse(client.centralValue()), accepted: await client.readAcceptedBase() };
  }, { scope: owner, initial: initial() });
  expect(result.result).toMatchObject({ ok: false, durablePending: true });
  expect(result.central).toEqual(initial()); expect(result.accepted).toBeNull();
  expect(await rows(page)).toEqual(pending);
});

test('two connections acknowledging the identical receipt are idempotent', async () => {
  const page = await harness.open(); await stage(page, edit('A'), initial()); const [row] = await rows(page);
  const peer = await harness.peer();
  const acknowledge = target => target.evaluate(async ({ row, owner, day }) => {
    await window.saveStore.acknowledge(row, { id: row.change.id, date: day, value: row.change.after }, { revision: 11 }, { owner });
    return window.saveStore.readAcceptedBase(owner, owner);
  }, { row, owner, day });
  const [first, second] = await Promise.all([acknowledge(page), acknowledge(peer)]);
  expect(first).toEqual(second); expect(first.dates).toEqual([day]); expect(await rows(page)).toEqual([]);
});

test('failed replacement retains the prior base; separate dates keep independent receipt revisions', async () => {
  const page = await harness.open(); await stage(page, edit('A'), initial()); harness.state.mode = 'online'; await replay(page);
  const before = await accepted(page);
  await stage(page, edit('B'), edit('A')); const [pending] = await rows(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      const request = put.call(this, value, ...args);
      if (value?.id?.startsWith('session-accepted-date:')) request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
  });
  expect(await replay(page)).toMatchObject({ centralAcknowledged: true, localCheckpointPending: true });
  expect(await accepted(page)).toEqual(before); expect(await rows(page)).toEqual([pending]);
  await page.reload(); // Removes only the test's abort instrumentation, no data reset.
  const restored = await page.evaluate(async ({ owner, day }) => {
    const { createSessionSaveStore } = await import('/src/modules/session-planner/session-save-store.mjs');
    const { createSessionDateChanges } = await import('/src/modules/session-planner/session-save-protocol.mjs');
    const store = createSessionSaveStore(), date = '2026-10-13';
    const value = { sessions: { [date]: { date, blocks: [{ id: 'other', title: 'Another accepted date' }] } } };
    const row = { scope: owner, writer: 'another-date', createdAt: 1, status: 'pending',
      change: createSessionDateChanges({ sessions: {} }, value, () => 'different-date')[0] };
    await store.put(row);
    await store.acknowledge(row, { id: row.change.id, date, value: row.change.after }, { revision: 20 }, { owner });
    return { base: await store.readAcceptedBase(owner, owner), pending: await store.list(owner) };
  }, { owner, day });
  expect(restored.base.revisions).toEqual({ '2026-10-13': 20, [day]: 11 });
  expect(restored.base.complete).toBe(false); expect(restored.pending).toEqual([pending]);
});

for (const committed of [false, true]) {
  test(`browser crash ${committed ? 'after' : 'before'} atomic checkpoint commit preserves recoverability`, async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Browser.crash requires Chromium; WebKit storage semantics tested separately');
    let page = await harness.open(); const a = edit('A'); await stage(page, a, initial());
    const pending = await rows(page);
    await page.evaluate(committed => {
      window.boundary = false;
      if (committed) {
        const acknowledge = window.saveStore.acknowledge;
        window.saveStore.acknowledge = async (...args) => { await acknowledge(...args); window.boundary = true; await new Promise(() => {}); };
      } else {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, ...args) {
          const req = put.call(this, value, ...args);
          if (value?.id?.startsWith('session-accepted-date:')) req.addEventListener('success', () => {
            window.boundary = true;
            const keep = () => this.get(value.id).addEventListener('success', keep); keep();
          });
          return req;
        };
      }
    }, committed);
    harness.state.mode = 'online'; await page.evaluate(() => { void window.saveClient.replay(); });
    await expect.poll(() => page.evaluate(() => window.boundary)).toBe(true);
    await harness.crash(); page = await harness.open();
    // Fresh reader receives NO observe/baseline. The surrounding harness's online
    // synthetic boot is not counted as product offline startup.
    const base = await page.evaluate(async scope => {
      const { createSessionSaveClient } = await import('/src/modules/session-planner/session-save-client.mjs');
      return createSessionSaveClient({ getScope: () => scope, send: async () => { throw new Error('No read-time send'); } }).readAcceptedBase();
    }, owner);
    if (committed) {
      expect(await rows(page)).toEqual([]);
      expect(JSON.parse(base.value).sessions[day]).toEqual(a.sessions[day]);
    } else {
      expect(base).toBeNull(); expect(await rows(page)).toEqual(pending);
      expect(await replay(page)).toMatchObject({ ok: true });
      expect(JSON.parse((await accepted(page)).value).sessions[day]).toEqual(a.sessions[day]);
    }
    expect(harness.state.effects).toBe(1);
  });
}
