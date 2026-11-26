import { expect, test } from '@playwright/test';
import { sessionsProofProfile, workspace } from './helpers/sessions-offline-start-browser.mjs';
import { startSessionsOfflineStartFixture } from './helpers/sessions-offline-start-server.mjs';

const packageSelector = 'meta[name="sessions-offline-code-package"]';
const trustModulePath = '/src/core/sessions-offline-access/trust.mjs';

async function prepareCode(page) {
  return page.evaluate(async () => {
    const { prepareSessionsOfflineCode } = await import('/src/core/sessions-offline-code-prep.mjs');
    return prepareSessionsOfflineCode();
  });
}

async function generationFromLateImport(page) {
  return page.evaluate(async path => {
    const url = new URL('.' + path + '?qa=late-import-after-publish', document.baseURI);
    return (await import(url.href)).qaStaticGeneration ?? 'older';
  }, trustModulePath);
}

test('an already open Sessions tab uses its exact code after a later package is published', async ({ browserName }) => {
  const fixture = await startSessionsOfflineStartFixture();
  const profile = await sessionsProofProfile(fixture.origin, browserName);
  try {
    const context = await profile.open();
    const online = context.pages()[0];
    await online.goto('/qa-sessions-offline-probe');
    const older = await prepareCode(online);

    // Only the canonical navigation now loses its connection. Keep the local
    // static origin available so another tab can prepare a new code generation.
    fixture.state.disconnectSessionNavigation = true;
    const openedWithOlderCode = await context.newPage();
    await openedWithOlderCode.goto(workspace);
    await expect(openedWithOlderCode.locator(packageSelector)).toHaveAttribute('content', older.packageId);

    const next = await fixture.offerNextVersion(new Map([[trustModulePath, Buffer.from([
      'export const trustedSessionsOfflineKeys = Object.freeze({});',
      'export const qaStaticGeneration = "newer";',
    ].join('\n'))]]));
    expect(next).not.toBe(older.packageId);
    expect((await prepareCode(online)).packageId).toBe(next);
    expect(await generationFromLateImport(openedWithOlderCode)).toBe('older');

    const openedWithNewerCode = await context.newPage();
    await openedWithNewerCode.goto(workspace);
    await expect(openedWithNewerCode.locator(packageSelector)).toHaveAttribute('content', next);
    expect(await generationFromLateImport(openedWithNewerCode)).toBe('newer');
    expect(openedWithNewerCode.url()).toBe(fixture.origin + workspace);
    await expect(openedWithOlderCode.locator(packageSelector)).toHaveAttribute('content', older.packageId);

    const network = await openedWithOlderCode.evaluate(async () => {
      const fetchBlocked = await fetch('/api/unpinned-code-test').then(() => false, () => true);
      const imageBlocked = await new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(false);
        image.onerror = () => resolve(true);
        image.src = '/api/unpinned-image-test';
        document.body.append(image);
      });
      return { fetchBlocked, imageBlocked };
    });
    expect(network).toEqual({ fetchBlocked: true, imageBlocked: true });
    expect(fixture.state.privateRequests).toBe(0);
    expect(fixture.state.grantAttempts).toBe(0);
  } finally {
    try { await profile.dispose(); } finally { await fixture.stop(); }
  }
});

test('a quota-denied new generation leaves the active Sessions code usable', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'IndexedDB origin quota override requires Chromium CDP.');
  const fixture = await startSessionsOfflineStartFixture();
  const profile = await sessionsProofProfile(fixture.origin, browserName);
  try {
    const initial = await profile.open();
    const firstPage = initial.pages()[0];
    await firstPage.goto('/qa-sessions-offline-probe');
    const older = await prepareCode(firstPage);
    expect(await fixture.offerNextVersion()).not.toBe(older.packageId);

    await profile.close();
    const context = await profile.open();
    const online = context.pages()[0];
    // The process caches its first quota allowance per bucket. Set the quota
    // before navigating or letting the service worker reopen its database.
    const quota = await context.newCDPSession(online);
    await quota.send('Storage.overrideQuotaForOrigin', { origin: fixture.origin, quotaSize: 1 });
    await online.goto('/qa-sessions-offline-probe');
    await expect(prepareCode(online)).rejects.toThrow('Local storage is full.');
    fixture.state.disconnectSessionNavigation = true;
    const reopen = await context.newPage();
    await reopen.goto(workspace);
    await expect(reopen.locator(packageSelector)).toHaveAttribute('content', older.packageId);
    expect(fixture.state.privateRequests).toBe(0);
    expect(fixture.state.grantAttempts).toBe(0);
  } finally {
    try { await profile.dispose(); } finally { await fixture.stop(); }
  }
});
