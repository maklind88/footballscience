import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { day, readJournal } from './helpers/session-full-app-storage-fixture.mjs';
import { exhaustOrigin } from './helpers/session-save-chain-profile.mjs';
import { qaLoginKey, startSessionsOfflineStartFixture } from './helpers/sessions-offline-start-server.mjs';
import { acceptedText, addSyntheticHistoricalVersion, assertOfflineWork, installSessionsReturnAuth, makeSyntheticWork, pendingText, prepareOffline, readProtectedWork,
  sessionsProofProfile, workspace } from './helpers/sessions-offline-start-browser.mjs';

let fixture, profile, context;
test.beforeEach(async ({ browserName }) => {
  profile = undefined;
  fixture = await startSessionsOfflineStartFixture();
  profile = await sessionsProofProfile(fixture.origin, browserName);
  context = await profile.open();
});
test.afterEach(async () => {
  await Promise.allSettled([profile?.dispose(), fixture?.stop()]);
});

async function openOffline({ crash = false, quotaBytes, expireAt } = {}) {
  // Physically close the test's only TCP origin. The new browser reuses its
  // profile with no auth route, page bootstrap, or injected application files.
  await fixture.stop();
  await expect(fetch(fixture.origin + '/qa-sessions-offline-probe', { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
  await profile.close({ crash });
  if (expireAt) await expect.poll(() => Date.now() >= expireAt).toBe(true);
  context = await profile.open();
  const page = context.pages()[0];
  if (quotaBytes !== undefined) {
    const session = await context.newCDPSession(page);
    await session.send('Storage.overrideQuotaForOrigin', { origin: fixture.origin, quotaSize: quotaBytes });
  }
  const privateRequests = [];
  context.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') || request.method() !== 'GET') {
      privateRequests.push({ method: request.method(), path: new URL(request.url()).pathname });
    }
  });
  await page.goto(workspace);
  expect(page.url()).toBe(fixture.origin + workspace);
  return { page, privateRequests };
}

async function expectLocked(page) {
  const content = page.locator('[data-session-offline-readonly]');
  await expect(page.getByRole('heading', { name: 'Session Planner', exact: true })).toBeVisible();
  await expect(content).toHaveAttribute('aria-busy', 'false');
  await expect(content.getByRole('status')).toContainText(/connect|expired/i);
  await expect(page.getByText(acceptedText, { exact: false })).toHaveCount(0);
  await expect(page.getByText(pendingText, { exact: false })).toHaveCount(0);
}

async function expectProtectedWork(page, before) {
  expect(before.latest.some(row => row.id.startsWith('session-accepted-date:'))).toBe(true);
  expect(before.latest.some(row => row.id.startsWith('session-save:'))).toBe(true);
  const current = await readProtectedWork(page);
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const name of Object.keys(before)) {
    expect(digest(current[name]), 'Persisted Sessions section ' + name + ' changed').toBe(digest(before[name]));
  }
}

test('the regular Sessions URL cold-starts read-only and preserves accepted, pending and historical work', async ({ browserName }, info) => {
  const app = context.pages()[0];
  const backend = await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  expect(fixture.state.grantAccepted).toBe(1);
  await addSyntheticHistoricalVersion(app);
  const before = await readProtectedWork(app);
  expect(before.snapshots.some(row => row.id === 'qa-protected-session-offline-start-history')).toBe(true);
  const writesBefore = backend.writes.length;
  const { page, privateRequests } = await openOffline();
  await assertOfflineWork(page);
  const peer = await context.newPage();
  await peer.goto(workspace);
  await expect(peer.locator('[data-session-offline-readonly]')).toHaveAttribute('aria-busy', 'false');
  await peer.evaluate(() => localStorage.setItem('qa-unrelated-sessions-ui-preference', 'unchanged-access'));
  await peer.close();
  await expect(page.locator('[data-session-offline-version="accepted"]')).toContainText(acceptedText);
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
  expect(backend.effects).toBe(1);
  expect(backend.writes).toHaveLength(writesBefore);
  await info.attach('sessions-offline-proof', { contentType: 'application/json', body: JSON.stringify({
    browserName, sameSessionsRoute: true, isolatedTcpServerStoppedBeforeRestart: true,
    newBrowserProcess: true, injectedColdBootstrap: false, privateRequests: privateRequests.length,
    protectedWorkUnchanged: true, acceptedAndUnsyncedSeparate: true,
  }) });
});

test('a durable review operation stays separate from the accepted checkpoint after cold start', async () => {
  const app = context.pages()[0];
  await makeSyntheticWork(app, fixture, { review: true });
  await prepareOffline(app);
  const before = await readProtectedWork(app);
  const { page, privateRequests } = await openOffline();
  await assertOfflineWork(page, { review: true });
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
});

test('after a known server denial a cold restart cannot reopen the old permission', async () => {
  const app = context.pages()[0];
  await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  const before = await readProtectedWork(app);
  fixture.state.denied = true;
  await prepareOffline(app, 'unavailable');
  expect(fixture.state.grantAttempts).toBe(2);
  expect(fixture.state.grantAccepted).toBe(1);
  const { page, privateRequests } = await openOffline();
  await expectLocked(page);
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
});

test('a changed login cannot expose locally saved Sessions data', async () => {
  const app = context.pages()[0];
  await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  const before = await readProtectedWork(app);
  const other = await context.newPage();
  await other.goto('/qa-sessions-offline-probe');
  await other.evaluate(key => localStorage.setItem(key, JSON.stringify({
    access_token: 'qa.changed-login.synthetic', user: { id: 'synthetic-other-account' },
  })), qaLoginKey);
  const { page, privateRequests } = await openOffline();
  await expectLocked(page);
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
});

test('the same account changing team disarms the earlier preparation', async () => {
  const app = context.pages()[0];
  await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  const before = await readProtectedWork(app);
  const switched = await app.evaluate(() => {
    const auth = window.platformAuthStore;
    const user = auth.getCurrentUser();
    auth.writeUsers([{ ...user, teamId: 'qa-other-team' }]);
    auth.setCurrentUser(user.id);
    const owner = auth.getSessionsOfflineOwner();
    return owner ? JSON.parse(owner)[3] === 'qa-other-team' : false;
  });
  expect(switched).toBe(true);
  const { page, privateRequests } = await openOffline();
  await expectLocked(page);
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
});

test('another date does not substitute the prepared session', async () => {
  const app = context.pages()[0];
  await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  const before = await readProtectedWork(app);
  const { page, privateRequests } = await openOffline();
  await page.goto(workspace + '&date=2026-10-15');
  await expectLocked(page);
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
});

test('a naturally expired permission is locked after cold restart without deleting work', async () => {
  const app = context.pages()[0];
  await makeSyntheticWork(app, fixture);
  fixture.state.grantLifetimeMs = 5000;
  await prepareOffline(app);
  const before = await readProtectedWork(app);
  const { page, privateRequests } = await openOffline({ expireAt: fixture.state.expiresAt });
  await expectLocked(page);
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
});

test('an incomplete new build keeps the previous verified package usable after restart', async () => {
  const app = context.pages()[0];
  await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  const previous = fixture.packageId();
  const before = await readProtectedWork(app);
  const next = await fixture.offerNextVersion();
  expect(next).not.toBe(previous);
  fixture.state.corruptAsset = '/sessions-offline-shell.html';
  await prepareOffline(app, 'unavailable');
  expect(fixture.state.grantAttempts).toBe(1);
  const { page } = await openOffline();
  await assertOfflineWork(page);
  expect(new URL(await page.evaluate(() => document.baseURI)).pathname).toContain(previous);
  await expectProtectedWork(page, before);
});

test('returning online syncs the preserved operation once through the existing queue', async () => {
  const app = context.pages()[0];
  const backend = await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  const before = await readProtectedWork(app);
  const pendingId = before.latest.find(row => row.status === 'pending')?.change?.id;
  expect(pendingId).toBeTruthy();
  const { page, privateRequests } = await openOffline();
  await assertOfflineWork(page);
  await expectProtectedWork(page, before);

  const resumed = await fixture.resume(backend);
  expect((await fetch(fixture.origin + '/qa-sessions-offline-probe')).ok).toBe(true);
  const openOnline = page.getByRole('link', { name: 'Open Sessions online', exact: true });
  await expect(openOnline).toBeVisible();
  expect(privateRequests).toEqual([]);

  // Synthetic online services return only after the cold-read assertions.
  await installSessionsReturnAuth(page, fixture);
  await openOnline.click();
  await expect(page.locator('#hubShell')).toBeVisible();
  await expect.poll(() => resumed.effects).toBe(2);
  await expect.poll(() => readJournal(page)).toEqual([]);
  expect(resumed.writes.slice(backend.writes.length).map(row => row.sessionChange?.id)).toEqual([pendingId]);
  expect(resumed.value.sessions[day].blocks[0].objective).toBe(pendingText);
});

test('a prepared Sessions view survives full origin storage and a browser crash', async ({ browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Native quota override and Browser.crash require Chromium CDP.');
  let app = context.pages()[0];
  const backend = await makeSyntheticWork(app, fixture);
  await prepareOffline(app);
  const before = await readProtectedWork(app);

  // Stabilize the test login on disk first. This case tests full-origin reads
  // after a crash, separately from initial login durability.
  await profile.close();
  context = await profile.open();
  app = context.pages()[0];
  await app.goto('/qa-sessions-offline-probe');
  const pressure = await exhaustOrigin(app);
  expect(pressure.idb.error).toBe('QuotaExceededError');
  expect(pressure.local.error).toBe('QuotaExceededError');
  const { page, privateRequests } = await openOffline({ crash: true, quotaBytes: 1 });
  await assertOfflineWork(page);
  await expectProtectedWork(page, before);
  expect(privateRequests).toEqual([]);
  expect(backend.effects).toBe(1);
  await info.attach('sessions-offline-quota-proof', { contentType: 'application/json', body: JSON.stringify({
    browserName, processCrashed: true, physicalDiskFilled: false, quota: pressure.finalQuotaBytes,
    indexedDbQuotaError: pressure.idb.error, localStorageQuotaError: pressure.local.error,
    privateRequests: privateRequests.length, protectedWorkUnchanged: true,
  }) });
});
