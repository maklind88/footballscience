import { chromium, expect, webkit } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { day, edit, installSessionStorageFixture, key, readJournal, ready } from './session-full-app-storage-fixture.mjs';
import { guardSavedWorkLoopback, savedWorkIsolationProxy } from './saved-work-loopback-browser.mjs';
import { qaCoach } from './set-pieces-central-fixture.mjs';
import { qaGrantRequest, qaLoginKey } from './sessions-offline-start-server.mjs';

export const workspace = '/?workspace=session-planner';
export const acceptedText = 'Synthetic accepted Sessions checkpoint A';
export const pendingText = 'Synthetic unsynced Sessions work B';
const prepareSelector = { name: 'Prepare offline access', exact: true };
const statusSelector = '[data-session-offline-status]';

export async function sessionsProofProfile(origin, browserName) {
  const directory = await mkdtemp(join(tmpdir(), 'fs-sessions-offline-start-'));
  const engine = browserName === 'webkit' ? webkit : chromium;
  let context;
  return {
    async open() {
      if (context) throw new Error('Previous test browser is still running');
      context = await engine.launchPersistentContext(directory, {
        baseURL: origin, headless: true, serviceWorkers: 'allow',
        viewport: { width: 1365, height: 900 }, proxy: savedWorkIsolationProxy(origin),
      });
      await guardSavedWorkLoopback(context, origin);
      return context;
    },
    async close({ crash = false } = {}) {
      if (!context) return;
      if (crash) {
        const browser = context.browser();
        const session = await browser.newBrowserCDPSession();
        const disconnected = new Promise(resolve => browser.once('disconnected', resolve));
        const closed = new Promise(resolve => context.once('close', resolve));
        await session.send('Browser.crash').catch(error => {
          if (!/closed/i.test(error.message)) throw error;
        });
        await Promise.all([disconnected, closed]);
        if (browser.isConnected()) throw new Error('Test browser did not crash');
      } else {
        await context.close();
      }
      context = null;
    },
    async dispose() {
      try { await context?.close(); }
      finally { await rm(directory, { recursive: true, force: true }); }
    },
  };
}

export async function installSessionsReturnAuth(page, fixture) {
  const login = { access_token: fixture.token, user: qaCoach };
  // WebKit may bypass request routing for a CDN script on a document
  // controlled by a worker. This substitutes the same synthetic SDK only on
  // the online return path, after the uninjected cold launch has been proved.
  await page.addInitScript(({ login, key, url }) => {
    window.__footballScienceQaForceCentralState = true;
    document.addEventListener('DOMContentLoaded', () => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(login));
      window.supabase = { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session: login }, error: null }),
        refreshSession: async () => ({ data: { session: login }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      } }) };
      const sdk = document.createElement('script');
      sdk.type = 'application/x-football-science-qa';
      sdk.src = url;
      document.head.append(sdk);
    }, { once: true });
  }, { login, key: qaLoginKey, url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js' });
}

async function attachSessionsOnlineFixture(page, fixture) {
  const backend = await installSessionStorageFixture(page);
  const login = { access_token: fixture.token, user: qaCoach };
  await page.route('**/npm/@supabase/supabase-js@2/**', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      const session = ${JSON.stringify(login)};
      if (!localStorage.getItem(${JSON.stringify(qaLoginKey)})) {
        localStorage.setItem(${JSON.stringify(qaLoginKey)}, JSON.stringify(session));
      }
      window.supabase = { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session }, error: null }),
        refreshSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      } }) };
    `,
  }));
  let forceConflict = false;
  await page.route('**/api/app-state**', route => {
    if (qaGrantRequest(route.request().url())) return route.continue();
    if (forceConflict && route.request().method() === 'POST' && route.request().postDataJSON()?.key === key) {
      return route.fulfill({ status: 409, json: { ok: false, currentRevision: backend.revision,
        conflicts: [{ code: 'field-changed', field: 'objective', blockId: 'a' }] } });
    }
    return route.fallback();
  });
  return { backend, requireReview: () => { forceConflict = true; } };
}

export async function makeSyntheticWork(page, fixture, { review = false } = {}) {
  const { backend, requireReview } = await attachSessionsOnlineFixture(page, fixture);
  await page.goto(workspace);
  await ready(page);
  backend.reject = false;
  await edit(page, acceptedText);
  await expect.poll(() => backend.effects).toBe(1);
  await expect.poll(() => readJournal(page)).toEqual([]);
  backend.reject = true;
  if (review) requireReview();
  await edit(page, pendingText);
  await expect.poll(async () => (await readJournal(page)).map(row => row.status))
    .toEqual([review ? 'review' : 'pending']);

  // The existing fixture pins the calendar before online boot. The real grant
  // and cold launch use the real clock, including in the already-open page.
  await page.clock.setFixedTime(new Date());
  return backend;
}

export async function addSyntheticHistoricalVersion(page) {
  await page.evaluate(({ key, day }) => new Promise((resolve, reject) => {
    const opening = indexedDB.open('football-science-data-safety-v1');
    opening.onupgradeneeded = () => opening.transaction.abort();
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        id: 'qa-protected-session-offline-start-history', reason: 'session-planner-recovery-review',
        createdAt: new Date().toISOString(),
        storage: { [key]: JSON.stringify({ sessions: { [day]: { date: day, title: 'Synthetic protected history' } } }) },
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { key, day });
}

export async function prepareOffline(page, expected = 'ready') {
  const button = page.getByRole('button', prepareSelector);
  try { await expect(button).toBeVisible(); }
  catch (error) {
    const state = await page.evaluate(() => ({
      authLoaded: typeof window.platformAuthStore?.getSessionsOfflineOwner === 'function',
      ownerPresent: Boolean(window.platformAuthStore?.getSessionsOfflineOwner?.()),
      isSecureContext: window.isSecureContext,
      workerAvailable: Boolean(navigator.serviceWorker),
      hasButton: Boolean(document.querySelector('[data-session-prepare-offline]')),
    }));
    throw new Error('Sessions preparation control is unavailable: ' + JSON.stringify(state), { cause: error });
  }
  await button.click();
  await expect(page.locator(statusSelector)).toHaveAttribute('data-session-offline-status', expected);
}

export async function readProtectedWork(page) {
  return page.evaluate(async ({ key }) => {
    const opening = indexedDB.open('football-science-data-safety-v1');
    opening.onupgradeneeded = () => opening.transaction.abort();
    const db = await new Promise((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const stores = await new Promise((resolve, reject) => {
        const tx = db.transaction(['latest', 'snapshots'], 'readonly');
        const latest = tx.objectStore('latest').getAll();
        const snapshots = tx.objectStore('snapshots').getAll();
        tx.oncomplete = () => resolve({ latest: latest.result, snapshots: snapshots.result });
        tx.onabort = () => reject(tx.error);
      });
      // The online shell's wrapped getItem can return its in-memory projection
      // even when the fixture refuses the underlying localStorage write.
      const readNative = window.__nativeStorageRead || (name => localStorage.getItem(name));
      const manifest = JSON.parse(readNative('football-data-safety-v1') || '{}');
      return {
        latest: stores.latest.filter(row => row.id?.startsWith('session-save:') ||
          row.id?.startsWith('session-accepted-date:') || Object.hasOwn(row.storage ?? {}, key)),
        snapshots: stores.snapshots,
        local: readNative(key),
        manifest: manifest.entries?.[key] ?? null,
      };
    } finally { db.close(); }
  }, { key });
}

export async function assertOfflineWork(page, { review = false } = {}) {
  const content = page.locator('[data-session-offline-readonly]');
  await expect(page.getByRole('heading', { name: 'Session Planner', exact: true })).toBeVisible();
  await expect(content).toBeVisible();
  await expect(content.locator('[data-session-offline-date]')).toHaveAttribute('datetime', day);
  const accepted = content.locator('[data-session-offline-version="accepted"]');
  const journal = content.locator(`[data-session-offline-version="${review ? 'review' : 'pending'}"]`);
  await expect(accepted).toContainText(acceptedText);
  await journal.locator(':scope > summary').click();
  await expect(journal.getByText(pendingText, { exact: true }).last()).toBeVisible();
  await expect(accepted).not.toContainText(pendingText);
  await expect(content.locator('input:not([readonly]):not([disabled]),textarea:not([readonly]):not([disabled]),[contenteditable=true]')).toHaveCount(0);
}
