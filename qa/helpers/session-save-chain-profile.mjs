import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function isolatedProfile(baseURL) {
  const profile = await mkdtemp(join(tmpdir(), 'fs-save-chain-'));
  let context;
  return {
    profile,
    async open({ offline = false, quotaBytes, serviceWorkers = 'block' } = {}) {
      if (context) throw new Error('Previous proof browser is still open');
      context = await chromium.launchPersistentContext(profile, { headless: true, baseURL,
        viewport: { width: 1365, height: 900 }, serviceWorkers });
      await context.setOffline(offline);
      if (quotaBytes !== undefined) {
        // Apply before ANY IndexedDB use: Chromium caches the initial bucket
        // allowance, so a late override can change estimates without blocking writes.
        const quotaSession = await context.newCDPSession(context.pages()[0]);
        await quotaSession.send('Storage.overrideQuotaForOrigin', { origin: new URL(baseURL).origin, quotaSize: quotaBytes });
      }
      // Remote HTTP is denied; the explicit synthetic auth routes may override it.
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
        ? route.continue() : route.abort('blockedbyclient'));
      return { context, page: context.pages()[0] };
    },
    async crash() {
      const browser = context.browser(), session = await browser.newBrowserCDPSession();
      const disconnected = new Promise(resolve => browser.once('disconnected', resolve));
      const closed = new Promise(resolve => context.once('close', resolve));
      await session.send('Browser.crash').catch(error => {
        if (!/closed/i.test(error.message)) throw error;
      });
      await Promise.all([disconnected, closed]);
      context = null;
      if (browser.isConnected()) throw new Error('Proof browser did not crash');
      return { browserDisconnected: true, gracefulClose: false };
    },
    async close() { if (context) { await context.close(); context = null; } },
    async dispose() {
      if (!profile.startsWith(join(tmpdir(), 'fs-save-chain-'))) throw new Error('Unexpected cleanup path');
      try { if (context) await context.close(); } finally { await rm(profile, { recursive: true, force: true }); }
    },
  };
}

export async function exhaustOrigin(page) {
  const cdp = await page.context().newCDPSession(page), origin = new URL(page.url()).origin;
  await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 2 * 1024 * 1024 });
  const idb = await page.evaluate(async () => {
    const open = indexedDB.open('qa-offline-proof-pressure', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('padding');
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    let bytes = 0, count = 0, error = '';
    try {
      // At most 32 MiB test data, including Chromium's preallocated quota budget.
      // Never fill the host filesystem. No mocked throw.
      for (; count < 512; count++) {
        const value = crypto.getRandomValues(new Uint8Array(65536));
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('padding', 'readwrite'); tx.objectStore('padding').put(value, count);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
          }); bytes += value.byteLength;
        } catch (e) { error = e.name; break; }
      }
    } finally { db.close(); }
    return { bytes, count, error };
  });
  const local = await page.evaluate(() => {
    const nativeSet = window.__setPiecesNativeSet || Storage.prototype.setItem;
    let count = 0, error = '';
    for (; count < 512; count++) {
      try { nativeSet.call(localStorage, `qa-proof-padding:${count}`, 'x'.repeat(16384)); }
      catch (e) { error = e.name; break; }
    }
    return { count, error };
  });
  const usage = await cdp.send('Storage.getUsageAndQuota', { origin });
  // Small deletes can free room. Lower the artificial quota below retained usage
  // so the next genuine journal write still fails; existing bytes are untouched.
  await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1 });
  // Keep the session attached: detaching releases its quota override. It dies
  // with the isolated browser at the deliberate crash boundary.
  return { idb, local, usage, finalQuotaBytes: 1, physicalDiskFilled: false };
}
