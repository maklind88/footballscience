import { test, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';

test('a real full browser cache does not hide acknowledged merged work', async ({ page }) => {
  await page.route('**/qa-cache-pressure', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic cache pressure</title>' }));
  await page.goto('/qa-cache-pressure');
  const result = await page.evaluate(async () => {
    const { createAcknowledgedCacheHarness } = await import('/qa/helpers/acknowledged-cache-pressure-harness.mjs');
    const key = 'football-dashboard-tasks-v1', nativeSet = Storage.prototype.setItem, nativeGet = Storage.prototype.getItem;
    const serverValue = 'acknowledged content '.repeat(16000);
    const h = createAcknowledgedCacheHarness(key, { storage: localStorage, storageConstructor: Storage,
      send: () => ({ ok: true, revision: 8, value: serverValue }) });
    h.win.localStorage.setItem(key, 'original edit');
    nativeSet.call(localStorage, 'qa-reserve', 'x'.repeat(16000));
    let quotaErrors = 0, count = 0;
    for (const chunk of [262144, 16384, 1024]) {
      for (let i = 0; i < 1000; i++) {
        try { nativeSet.call(localStorage, `qa-fill-${count++}`, 'x'.repeat(chunk)); }
        catch (error) { if (error.name !== 'QuotaExceededError') throw error; quotaErrors++; break; }
      }
    }
    localStorage.removeItem('qa-reserve'); // Fixture-only headroom for small receipt metadata.
    const beforeEntries = localStorage.length;
    await h.sync.flushCentralStateWrites();
    const backup = h.safety.createBackupEnvelope('test');
    return { quotaErrors, calls: h.calls.length, visible: h.views[0]?.value === serverValue,
      cached: h.safety.rawGetItem(key) === serverValue, disk: nativeGet.call(localStorage, key),
      durable: h.cache.get(key)?.durable, serverBacked: h.cache.get(key)?.serverBacked,
      pending: h.safety.readManifest().entries[key].pendingCentralSync,
      oldMetadata: backup.saveContext.entries[key].hash === h.safety.hashString(backup.storage[key]),
      entriesUnchanged: beforeEntries === localStorage.length };
  });
  expect(result).toEqual({ quotaErrors: 3, calls: 1, visible: true, cached: true, disk: 'original edit',
    durable: false, serverBacked: true, pending: false, oldMetadata: true, entriesUnchanged: true });
});

test('the full app reads the acknowledged merge through its reload consumer and cold reload despite cache failure', async ({ page }) => {
  await installSetPiecesCentralFixture(page);
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  const key = 'football-schedule-v1';
  const event = (id, title) => ({ id, date: '2026-11-04', time: '10:00', type: 'training', title, note: '' });
  let baseline = { selectedDate: '2026-11-04', selectedYear: 2026, selectedMonthIndex: 10 };
  const state = events => ({ ...baseline, events });
  let value = JSON.stringify(state([])), revision = 7, writes = 0;
  const own = event('qa-own', 'Own accepted training'), peer = event('qa-peer', 'Colleague accepted training');
  await page.addInitScript(key => {
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
    window.__cacheFailures = 0;
    window.__readNativeTask = () => read.call(localStorage, key);
    Storage.prototype.setItem = function(k, v) {
      if (this === localStorage && k === key && String(v).includes('qa-peer')) {
        window.__cacheFailures++;
        throw new DOMException('Synthetic merged cache exceeds native quota', 'QuotaExceededError');
      }
      return write.call(this, k, v);
    };
  }, key);
  await page.route('**/api/app-state**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: {
      ok: true, entries: { [key]: value }, metadata: { [key]: { revision } }, absentKeys: [],
    } });
    const body = route.request().postDataJSON();
    if (body.key !== key) return route.fulfill({ status: 503, json: { ok: false } });
    // Equivalent JSON field order still exercises the reader's cache normalization.
    const serverPeer = { title: peer.title, ...peer };
    writes++; value = JSON.stringify(state([own, serverPeer])); revision++;
    return route.fulfill({ json: { ok: true, key, value, metadata: { revision } } });
  });
  await page.goto('/?workspace=home');
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
  // Use the actual initialized shape so background import normalization cannot
  // create an unrelated successor between the synthetic edit and its receipt.
  baseline = await page.evaluate(async () => (await import('/src/core/platform-runtime-accessors.mjs')).readScheduleState());
  // Exercise the installed protected writer and auth bridge, then open its consuming view.
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value: JSON.stringify(state([own])) });
  await expect.poll(() => writes).toBe(1);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).events.some(event => event.id === 'qa-peer'), key)).toBe(true);
  // Directly exercising the protected writer above does not run a Schedule editor
  // action. Exercise the production read consumer separately; no central read is
  // requested here. Automatic per-module refresh remains a separate acceptance case.
  await page.evaluate(async () => (await import('/src/core/platform-runtime-accessors.mjs')).reloadCentralizedAppStateFromStorage());
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText(peer.title, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__cacheFailures)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__readNativeTask())).not.toContain('qa-peer');
  expect(await page.evaluate(key => window.footballScienceCentralState.getCachedValueInfo(key), key))
    .toMatchObject({ durable: false, serverBacked: true });
  await page.reload();
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
  await expect(page.getByText(peer.title, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem('football-data-safety-v1')).entries[key].pendingCentralSync, key)).toBe(false);
  expect(writes).toBe(1);
});
