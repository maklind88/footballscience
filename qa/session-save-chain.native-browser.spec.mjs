import { test as base, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import { readJournal } from './helpers/session-full-app-storage-fixture.mjs';
import { startSessionSaveBackend, date, sessionKey } from './helpers/session-save-chain-backend.mjs';
import { isolatedProfile, exhaustOrigin } from './helpers/session-save-chain-profile.mjs';
import { createSessionSaveChainTiming, attachSessionSaveChainEvidence } from './helpers/session-save-chain-diagnostics.mjs';
import { guardSavedWorkLoopback } from './helpers/saved-work-loopback-browser.mjs';
import transport from '../api/_lib/session-state-transport.js';

const test = base.extend({ seedSessions: [true, { option: true }] });
const field = (page, name = 'objective') => page.locator(`[data-session-field="${name}"]`).first();
const status = page => page.locator('[data-platform-autosave-status]');
const objective = server => server.value.sessions[date].blocks[0]?.objective;
const noEffects = { receipts: 0, effects: 0 };
let backend, timing, cleanup, appOrigin, activeBrowser;

test.beforeEach(async ({ baseURL, browser, seedSessions }) => {
  appOrigin = new URL(baseURL).origin;
  if (new URL(appOrigin).hostname !== '127.0.0.1') throw new Error('Synthetic suite requires loopback');
  activeBrowser = browser;
  cleanup = [];
  timing = createSessionSaveChainTiming();
  backend = await startSessionSaveBackend(timing, { seedSessions });
});
test.afterEach(async () => {
  await Promise.allSettled(cleanup.map(close => close()));
  await backend?.close(); backend = null;
});

async function launch(number, { profile, quotaBytes, failCache = false, failCheckpoint = false, dropReply = false, allowEmpty = false, serviceWorkers }  = {}) {
  const { user } = backend.actor(number);
  let page, context;
  if (profile) ({ page, context } = await profile.open({ quotaBytes, serviceWorkers }));
  else {
    context = await activeBrowser.newContext({ baseURL: appOrigin, serviceWorkers: 'block' });
    cleanup.push(() => context.close());
    await guardSavedWorkLoopback(context, appOrigin);
    page = await context.newPage();
  }
  // Fixed calendar date without a frozen monotonic clock for pending-age evidence.
  await page.clock.install({ time: new Date(`${date}T12:00:00Z`) });
  const fixture = await installSetPiecesCentralFixture(page);
  Object.assign(fixture.actor, user);
  await page.addInitScript(({ key, failCache, failCheckpoint }) => {
    window.__chainFault = { cache: failCache, journal: false, checkpoint: failCheckpoint,
      cacheFailures: 0, journalFailures: 0, checkpointFailures: 0 };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, ...args) {
      if (name === key && window.__chainFault.cache) {
        window.__chainFault.cacheFailures++;
        throw new DOMException('Test cache quota', 'QuotaExceededError');
      }
      return set.call(this, name, ...args);
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.transaction.db.name === 'football-science-data-safety-v1') {
        if (window.__chainFault.journal && value?.id?.startsWith('session-save:')) {
          window.__chainFault.journalFailures++;
          throw new DOMException('Test journal quota', 'QuotaExceededError');
        }
        if (window.__chainFault.checkpoint && value?.id?.startsWith('session-accepted-date:')) {
          window.__chainFault.checkpointFailures++;
          throw new DOMException('Test checkpoint quota', 'QuotaExceededError');
        }
      }
      return put.call(this, value, ...args);
    };
  }, { key: sessionKey, failCache, failCheckpoint });
  const wire = { dropped: false, posts: 0 };
  await page.route('**/api/app-state**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      if (body?.key !== sessionKey || !body.sessionChange) return route.abort('blockedbyclient');
      wire.posts++;
      if (wire.rejectOperation) {
        const operation = JSON.parse(await transport.decodeSessionStateValue(sessionKey, body.sessionChange));
        if (operation.id === wire.rejectOperation) return route.abort('internetdisconnected');
      }
    }
    if (wire.offline) return route.abort('internetdisconnected');
    const response = await route.fetch({ url: backend.origin + url.pathname + url.search, maxRedirects: 0 });
    if (req.method() === 'POST' && response.ok()) {
      if (dropReply && !wire.dropped) { wire.dropped = true; return route.abort('internetdisconnected'); }
      const reply = await response.json();
      if (reply.sessionChange) {
        const receipt = JSON.parse(await transport.decodeSessionStateValue(sessionKey, reply.sessionChange));
        timing.markAcknowledged(receipt.id);
      }
    }
    await route.fulfill({ response });
  });
  await page.goto('/?workspace=session-planner');
  await expect.poll(() => page.evaluate(() => Boolean(window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden)),
    { message: 'Authenticated application shell ready', timeout: 30_000 }).toBe(true);
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.locator('[data-open-workspace="session-planner"]').first().click();
  await expect.poll(() => page.evaluate(key => window.footballScienceCentralState?.isKeyHydrated?.(key), sessionKey),
    { message: 'Authorized Sessions baseline ready', timeout: 30_000 }).toBe(true);
  await page.locator(`[data-session-date="${date}"]`).click();
  if (!allowEmpty) await expect(field(page)).toBeVisible();
  return { page, context, wire };
}

async function profile() {
  const result = await isolatedProfile(appOrigin);
  cleanup.push(() => result.dispose());
  return result;
}
async function edit(page, value, name) {
  const input = field(page, name);
  await input.fill(value);
  await input.dispatchEvent('change');
  await input.blur();
}
async function reconnect(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}
async function visibleToIndependentClient(expected, title, options) {
  const { page } = await launch(3, options);
  await expect(field(page)).toHaveValue(expected);
  if (title) await expect(field(page, 'title')).toHaveValue(title);
  for (const id of await backend.operations()) timing.markVisible(id);
  return page;
}
async function counts(expected) {
  await expect.poll(() => backend.counts()).toEqual({ receipts: expected, effects: expected });
}

test('editor saves through authoritative SQL receipt and fresh client sees it despite cache failure', async ({}, info) => {
  const { page } = await launch(1);
  await expect(field(page)).toHaveValue('Original objective');
  await edit(page, 'Measured accepted change');
  await counts(1);
  await expect(status(page)).toHaveClass(/is-saved/);
  expect(objective(await backend.state())).toBe('Measured accepted change');
  await expect.poll(() => readJournal(page)).toEqual([]);
  const peer = await visibleToIndependentClient('Measured accepted change', null, { failCache: true });
  await expect.poll(() => peer.evaluate(() => window.__chainFault.cacheFailures)).toBeGreaterThan(0);
  const evidence = await attachSessionSaveChainEvidence(info, { timing, page });
  expect(evidence.timings[0]).toMatchObject({ committed: true, acknowledged: true, independentlyVisible: true });
});

test('full localStorage keeps a durable pending change across browser crash and later sync', async ({}, info) => {
  const disk = await profile();
  const { page } = await launch(1, { profile: disk, quotaBytes: 2 * 1024 * 1024 });
  const pressure = await page.evaluate(() => {
    const write = window.__setPiecesNativeSet;
    let count = 0, error = '';
    try { for (; count < 512; count++) write.call(localStorage, `qa-chain-padding:${count}`, 'x'.repeat(16384)); }
    catch (failure) { error = failure.name; }
    // Use the remaining slack, so a small legitimate cache update also exceeds quota.
    const last = `qa-chain-padding:${count - 1}`;
    let value = window.__setPiecesNativeGet.call(localStorage, last);
    for (let step = 8192; step >= 1; step /= 2) {
      try { write.call(localStorage, last, value + 'x'.repeat(step)); value += 'x'.repeat(step); } catch {}
    }
    let remainingWrite = '';
    try { write.call(localStorage, last, value + 'x'); } catch (failure) { remainingWrite = failure.name; }
    return { error, remainingWrite };
  });
  expect(pressure).toMatchObject({ error: 'QuotaExceededError', remainingWrite: 'QuotaExceededError' });
  backend.denyWrites(true);
  await edit(page, 'Durable pending after restart');
  await expect.poll(async () => (await readJournal(page)).map(row => row.status)).toEqual(['pending']);
  await expect(status(page)).not.toHaveClass(/is-saved/);
  expect(await backend.counts()).toEqual(noEffects);
  const before = await readJournal(page);
  await attachSessionSaveChainEvidence(info, { page });
  await disk.crash();
  const reopened = await launch(1, { profile: disk });
  await expect(field(reopened.page)).toHaveValue('Durable pending after restart');
  expect(await readJournal(reopened.page)).toEqual(before);
  backend.denyWrites(false);
  await reconnect(reopened.page);
  await counts(1);
  await expect(status(reopened.page)).toHaveClass(/is-saved/);
  await visibleToIndependentClient('Durable pending after restart');
  await attachSessionSaveChainEvidence(info, { timing, page: reopened.page });
});

test('when both browser stores reject writes, latest edit is visibly volatile and restart preserves prior server version', async ({}, info) => {
  const disk = await profile();
  const { page } = await launch(1, { profile: disk, quotaBytes: 2 * 1024 * 1024 });
  const pressure = await exhaustOrigin(page);
  expect(pressure.idb.error).toBe('QuotaExceededError');
  expect(pressure.local.error).toBe('QuotaExceededError');
  // A real quota failure on a large allocation may still leave enough room for
  // a tiny journal row. Force the precise negative outcome as well.
  await page.evaluate(() => { window.__chainFault.cache = window.__chainFault.journal = true; });
  await edit(page, 'Newest volatile text');
  await expect(field(page)).toHaveValue('Newest volatile text');
  await expect(status(page)).toContainText('Not saved on this device');
  expect(await readJournal(page)).toEqual([]);
  expect(await backend.counts()).toEqual(noEffects);
  // Journal-first saves need not attempt to persist the display cache here.
  const journalWriteRejections = await page.evaluate(() => window.__chainFault.journalFailures);
  expect(journalWriteRejections).toBeGreaterThan(0);
  await info.attach('Browser quota faults', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    actualIdbQuota: pressure.idb.error, actualLocalQuota: pressure.local.error, journalWriteRejections,
  })) });
  await disk.crash();
  const reopened = await launch(1, { profile: disk });
  await expect(field(reopened.page)).toHaveValue('Original objective');
  expect(await readJournal(reopened.page)).toEqual([]);
  await visibleToIndependentClient('Original objective');
});

test('lost HTTP receipt reconciles the same operation once and preserves the later change across restart', async ({}, info) => {
  const disk = await profile();
  const first = await launch(1, { profile: disk, dropReply: true });
  await edit(first.page, 'Accepted before lost reply');
  await counts(1);
  await expect.poll(() => first.wire.dropped).toBe(true);
  await expect(status(first.page)).not.toHaveClass(/is-saved/);
  const [operation] = await backend.operations();
  expect((await readJournal(first.page)).map(row => row.change.id)).toEqual([operation]);
  backend.denyWrites(true);
  await edit(first.page, 'Later edit must survive');
  await expect.poll(async () => (await readJournal(first.page)).length).toBe(2);
  const rows = await readJournal(first.page);
  // IndexedDB enumeration is by key, not chronology. Correlate the first
  // operation with the actual SQL receipt before choosing its successor.
  const successor = rows.find(row => row.change.id !== operation).change.id;
  await disk.crash();
  const restarted = await launch(1, { profile: disk });
  await expect(field(restarted.page)).toHaveValue('Later edit must survive');
  expect(await readJournal(restarted.page)).toEqual(rows);
  // Let the startup retry reach its known failure before simulating a new
  // recovery event. The next attempt must be the one that can reach SQL.
  await expect(status(restarted.page)).toContainText('Central save not confirmed');
  await visibleToIndependentClient('Accepted before lost reply');
  restarted.wire.rejectOperation = successor;
  backend.denyWrites(false);
  await reconnect(restarted.page);
  // The old receipt can retire A but may not clear or mark B as saved.
  await expect.poll(async () => (await readJournal(restarted.page)).map(row => row.change.id)).toEqual([successor]);
  await expect(field(restarted.page)).toHaveValue('Later edit must survive');
  await expect(status(restarted.page)).not.toHaveClass(/is-saved/);
  expect(await backend.counts()).toEqual({ receipts: 1, effects: 1 });
  restarted.wire.rejectOperation = null;
  await reconnect(restarted.page);
  await counts(2);
  expect(await backend.operations()).toEqual([operation, successor]);
  await expect.poll(() => readJournal(restarted.page)).toEqual([]);
  await expect(status(restarted.page)).toHaveClass(/is-saved/);
  await visibleToIndependentClient('Later edit must survive');
  await attachSessionSaveChainEvidence(info, { timing, page: restarted.page });
});

test('server acceptance is visible while the failed durable checkpoint retains its journal', async ({}, info) => {
  const { page } = await launch(1, { failCheckpoint: true });
  await edit(page, 'Accepted checkpoint retry');
  await counts(1);
  await expect.poll(() => page.evaluate(() => window.__chainFault.checkpointFailures)).toBeGreaterThan(0);
  await expect(status(page)).toHaveClass(/is-checkpoint-pending/);
  await expect(status(page)).toContainText('Saved centrally');
  await expect.poll(async () => (await readJournal(page)).map(row => row.status)).toEqual(['pending']);
  await visibleToIndependentClient('Accepted checkpoint retry');
  await page.evaluate(() => { window.__chainFault.checkpoint = false; });
  await reconnect(page);
  await expect.poll(() => readJournal(page)).toEqual([]);
  await expect(status(page)).toHaveClass(/is-saved/);
  expect(await backend.counts()).toEqual({ receipts: 1, effects: 1 });
  await attachSessionSaveChainEvidence(info, { timing, page });
});

test('two editors merge independent changes and a fresh third user sees both', async ({}, info) => {
  const a = await launch(1), b = await launch(2);
  a.wire.offline = true;
  await edit(a.page, 'First editor title', 'title');
  await expect.poll(async () => (await readJournal(a.page)).length).toBe(1);
  await edit(b.page, 'Second editor objective');
  await counts(1);
  a.wire.offline = false;
  await reconnect(a.page);
  await counts(2);
  await expect(status(a.page)).toHaveClass(/is-saved/);
  await visibleToIndependentClient('Second editor objective', 'First editor title');
  await attachSessionSaveChainEvidence(info, { timing, page: a.page });
});

for (const operation of ['same field', 'block deletion']) test(`two editors retain explicit review for ${operation}`, async ({}, info) => {
  const a = await launch(1), b = await launch(2);
  a.wire.offline = true;
  await edit(a.page, 'Retained local variant');
  await expect.poll(async () => (await readJournal(a.page)).length).toBe(1);
  const [original] = await readJournal(a.page);
  if (operation === 'block deletion') {
    await b.page.getByRole('button', { name: 'Delete Original exercise', exact: true }).click();
    await b.page.getByRole('alertdialog', { name: 'Delete exercise?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  } else await edit(b.page, 'Different authorized central edit');
  await counts(1);
  a.wire.offline = false;
  await reconnect(a.page);
  await expect.poll(async () => (await readJournal(a.page)).map(row => row.status)).toEqual(['review']);
  expect((await readJournal(a.page))[0].change).toEqual(original.change);
  await expect(status(a.page)).toContainText(/review/i);
  await a.page.getByRole('button', { name: 'Review local saves', exact: true }).click();
  await expect(a.page.locator('dialog.session-save-review')).toContainText('Retained local variant');
  if (operation === 'block deletion') {
    expect((await backend.state()).value.sessions[date].blocks).toEqual([]);
    const reader = await launch(3, { allowEmpty: true });
    await expect(field(reader.page)).toHaveCount(0);
    for (const id of await backend.operations()) timing.markVisible(id);
  } else await visibleToIndependentClient('Different authorized central edit');
  expect(await backend.counts()).toEqual({ receipts: 1, effects: 1 });
  await attachSessionSaveChainEvidence(info, { timing, page: a.page });
});

// A distinct result for the full app shell, with its current production worker.
test('full app cold navigation without network remains an explicit offline limitation', async ({}, info) => {
  const disk = await profile();
  const { page } = await launch(1, { profile: disk, serviceWorkers: 'allow' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/footballscience-sw.js');
    await navigator.serviceWorker.ready;
  });
  await disk.close();
  const offline = await disk.open({ offline: true, serviceWorkers: 'allow' });
  await expect(offline.page.goto('/?workspace=session-planner', { timeout: 10000 })).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
  await info.attach('Full app cold start outcome', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    fullAppOfflineReady: false, result: 'browser-navigation-blocked', newBrowserProcess: true,
  })) });
});

test.describe('fresh reads of unseeded Sessions', () => {
  test.use({ seedSessions: false });
  test('API distinguishes authorized absence from denied lookup without creating a baseline', async ({ request }) => {
    const coach = backend.actor(1), guest = backend.actor(4, 'guest');
    const path = `${backend.origin}/api/app-state?fresh=1&keys=${sessionKey}`;
    const read = async actor => {
      const response = await request.get(path, { headers: { Authorization: `Bearer ${actor.token}` } });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const absent = await read(coach);
    expect(absent.entries[sessionKey]).toBeUndefined();
    expect(absent.absentKeys).toContain(sessionKey);
    const denied = await read(guest);
    expect(denied.entries[sessionKey]).toBeUndefined();
    expect(denied.absentKeys).not.toContain(sessionKey);
    expect(await backend.counts()).toEqual(noEffects);
  });
});
