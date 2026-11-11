import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { installStorageHealthAppFixture, waitForStorageHealthApp } from './helpers/storage-health-app-fixture.mjs';
import { setPiecesKey } from './helpers/set-pieces-central-fixture.mjs';
import { verifyAuthenticatedHistory } from './helpers/history-live-probe.mjs';

test('authenticated production history probe against the local app fixture', async ({ page }) => {
  await installStorageHealthAppFixture(page);
  await page.goto('/?workspace=medical-team');
  await waitForStorageHealthApp(page);
  await verifyAuthenticatedHistory(page);
});

async function isolated(page, mode = 'pooled', count = 1) {
  await page.goto('/medical-merge.js');
  await page.evaluate(async ({ mode, count }) => {
    window.helpers = await import('/qa/helpers/compact-history-fixture.mjs');
    window.view = await import('/src/core/snapshot-history-dialog.mjs');
    window.scope = 'actor-A'; window.legacyName = 'qa-compatible-' + crypto.randomUUID();
    window.key = 'football-session-planner-v3';
    window.originals = Array.from({ length: count }, (_, i) => helpers.historyRow('copy-' + String(i).padStart(4, '0'), scope, key, `Pending ${i} åäö 🧪`));
    await helpers.seedCompactHistory(originals, mode);
    window.options = { win: window, databaseName: legacyName, getScope: () => scope, protectedStorageKeys: [key, 'football-medical-team-v1'] };
  }, { mode, count });
}

for (const mode of ['standalone', 'pooled']) test(`actual app admin reviews and downloads ${mode} history without new server writes`, async ({ page }) => {
  const { server } = await installStorageHealthAppFixture(page);
  await page.goto('/?workspace=medical-team'); await waitForStorageHealthApp(page);
  await expect.poll(() => server.writes.some(write => write.key === 'football-transfer-room-v1')).toBe(true);
  const row = await page.evaluate(async ({ mode, key }) => {
    const { seedCompactHistory, historyRow } = await import('/qa/helpers/compact-history-fixture.mjs');
    const scope = window.footballScienceCentralState.getReadScope(), row = historyRow('compact-admin', scope, key, 'Exact pending compact work');
    row.storage['football-medical-team-v1'] = 'Synthetic confidential medical text';
    row.saveContext.entries['football-medical-team-v1'] = { principalScope: scope, pendingCentralSync: true };
    await seedCompactHistory([row], mode); return row;
  }, { mode, key: setPiecesKey });
  const writes = server.writes.length;
  await page.locator('#profileMenuButton').click(); await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
  await page.getByRole('button', { name: 'Review saved browser copies' }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies', exact: true });
  await dialog.getByLabel('Saved-copy collection').selectOption('compact');
  await expect(dialog).toContainText('1 verified browser copies');
  await dialog.locator('summary').click(); await expect(dialog).toContainText('Exact pending compact work');
  await expect(dialog).not.toContainText('Synthetic confidential medical text');
  const promised = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download review file' }).click();
  const downloaded = JSON.parse(await readFile(await (await promised).path(), 'utf8'));
  expect(downloaded.versions[0]).toEqual(row); expect(downloaded.purpose).toBe('review-only');
  expect(server.writes.length).toBe(writes);
  // Change actual auth state while fresh compact decoding is awaiting a digest.
  await page.evaluate(() => {
    window.leakedDownloads = 0;
    HTMLAnchorElement.prototype.click = function() { leakedDownloads++; };
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      crypto.subtle.digest = digest;
      const auth = window.platformAuthStore, user = auth.getCurrentUser();
      auth.writeUsers([{ ...user, role: 'coach' }]); auth.setCurrentUser(user.id);
      return digest(...args);
    };
  });
  await dialog.getByRole('button', { name: 'Download review file' }).click();
  await expect(dialog).toContainText('Account or access changed'); await expect(dialog).not.toContainText('Exact pending compact work');
  expect(await page.evaluate(() => leakedDownloads)).toBe(0);
});

test('older production tab keeps saving legacy copies while new view reads compact history', async ({ page, context }) => {
  await isolated(page, 'pooled', 20);
  await page.evaluate(() => { options.protectedStorageKeys.push('football-player-profiles-v1'); });
  const legacyName = await page.evaluate(() => legacyName);
  const peer = await context.newPage();
  // Pinned pre-integration runtime; preserve the existing writer contract.
  // A byte-exact fixture also works in CI's shallow checkout/container ownership.
  // Do not weaken Git ownership checks or depend on fetching history during QA.
  const old = await readFile(new URL('./fixtures/data-safety-runtime-94a452c04.mjs.txt', import.meta.url), 'utf8');
  expect(createHash('sha256').update(old).digest('hex')).toBe('3248e789b091107f7c99ed22408d1d7f2dc6a54c732b0c6004acf84c2f59cbee');
  await peer.route('**/src/core/data-safety-runtime-service.mjs', route => route.fulfill({ contentType: 'text/javascript', body: old }));
  await peer.goto('/medical-merge.js');
  await peer.evaluate(async name => {
    const { preservationHarness } = await import('/qa/helpers/snapshot-preservation-harness.mjs');
    window.h = await preservationHarness({ name });
    const editor = document.createElement('textarea'); editor.value = 'Unsent older-tab editor'; document.body.append(editor);
  }, legacyName);
  await page.evaluate(() => view.openSnapshotHistory(options));
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies' });
  await Promise.all([
    dialog.getByLabel('Saved-copy collection').selectOption('compact'),
    peer.evaluate(async () => { for (let i = 1; i <= 10; i++) await h.capture('actor-A', i, true); }),
  ]);
  await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(20);
  await dialog.getByLabel('Saved-copy collection').selectOption('legacy');
  await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(10);
  const result = await peer.evaluate(async () => ({ rows: (await h.all('snapshots')).length,
    editor: document.querySelector('textarea').value, native: JSON.parse(localStorage.getItem(h.key)).generation }));
  expect(result).toEqual({ rows: 10, editor: 'Unsent older-tab editor', native: 10 });
  await peer.close();
});

test('compact changes after rendering block export without falling back to legacy', async ({ page }) => {
  await isolated(page); await page.evaluate(() => view.openSnapshotHistory(options));
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies' });
  await dialog.getByLabel('Saved-copy collection').selectOption('compact');
  await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(1);
  await page.evaluate(async () => {
    const row = structuredClone(originals[0]); row.storage[key] = 'Newer unrelated version';
    await helpers.seedCompactHistory([row], 'pooled');
    window.downloads = 0; HTMLAnchorElement.prototype.click = function() { downloads++; };
  });
  await dialog.getByRole('button', { name: 'Download review file' }).click();
  await expect(dialog).toContainText('copy changed or could not be verified');
  expect(await page.evaluate(() => downloads)).toBe(0);
});

for (const role of ['coach', 'medical', 'club-admin', 'team-admin', 'guest']) test(`actual ${role} account cannot open whole-copy compact review`, async ({ page }) => {
  const { server } = await installStorageHealthAppFixture(page); server.actor.app_metadata.role = role;
  await page.goto('/?workspace=medical-team'); await waitForStorageHealthApp(page);
  await page.evaluate(async key => {
    const { seedCompactHistory, historyRow } = await import('/qa/helpers/compact-history-fixture.mjs');
    await seedCompactHistory([historyRow('forbidden', window.footballScienceCentralState.getReadScope(), key, 'Hidden copy')]);
  }, setPiecesKey);
  await page.locator('#profileMenuButton').click(); await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Storage health', exact: true }).getByRole('status')).not.toContainText('Checking storage');
  await expect(page.getByRole('button', { name: 'Review saved browser copies' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Saved browser copies', exact: true })).toHaveCount(0);
});

test('real auth ABA during lazy loading cancels opening even after same admin returns', async ({ page }) => {
  await installStorageHealthAppFixture(page); await page.goto('/?workspace=medical-team'); await waitForStorageHealthApp(page);
  let release, requested = false; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/src/core/snapshot-history-dialog.mjs', async route => { requested = true; await gate; await route.continue(); });
  await page.locator('#profileMenuButton').click(); await page.getByRole('menuitem', { name: 'Storage health', exact: true }).click();
  const health = page.getByRole('dialog', { name: 'Storage health', exact: true });
  await health.getByRole('button', { name: 'Review saved browser copies' }).click();
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => {
    const auth = window.platformAuthStore, user = auth.getCurrentUser();
    auth.clearCurrentUser(); auth.writeUsers([user]); auth.setCurrentUser(user.id);
  }); release();
  await expect(health.getByRole('status')).toHaveText('Account or team changed. Reopen this check.');
  await expect(health).not.toContainText('Local browser storage:');
  await expect(health.getByRole('button', { name: 'Review saved browser copies' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Saved browser copies', exact: true })).toHaveCount(0);
});

test('compact pagination reaches all 103 versions; no write-capable transactions or absent legacy DB creation', async ({ page }) => {
  await isolated(page, 'pooled', 103);
  await page.evaluate(async () => {
    window.mutations = 0; window.writeTransactions = 0;
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...args) {
      if (mode && mode !== 'readonly') { writeTransactions++; throw new Error('Writing forbidden'); }
      return transaction.call(this, stores, mode, ...args);
    };
    for (const method of ['put','add','delete','clear']) IDBObjectStore.prototype[method] = function() { mutations++; throw new Error('Mutation forbidden'); };
    await view.openSnapshotHistory(options);
  });
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies' });
  await dialog.getByLabel('Saved-copy collection').selectOption('compact');
  await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(100);
  await dialog.getByRole('button', { name: 'Next copies' }).click();
  await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(3);
  const promise = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download review file' }).first().click(); await promise;
  const result = await page.evaluate(async () => ({ mutations, writeTransactions, created: (await indexedDB.databases()).some(db => db.name === legacyName) }));
  expect(result).toEqual({ mutations: 0, writeTransactions: 0, created: false });
});

for (const change of ['corrupt', 'future', 'scope', 'recovery']) test(`compact ${change} cannot leak through preview or export`, async ({ page }) => {
  await isolated(page);
  if (change === 'recovery' || change === 'scope') await page.evaluate(async change => {
    const row = originals[0]; row.storage[key] = 'Must not be disclosed';
    if (change === 'recovery') row.recoveryState[key] = { value: 'Recovery original' };
    else row.saveContext.entries[key].principalScope = 'actor-B';
    await helpers.seedCompactHistory([row], 'standalone');
  }, change);
  else await page.evaluate(async change => {
    const { compactSnapshotDatabaseName } = await import('/src/core/snapshot-compatible-reader.mjs');
    const db = await new Promise(resolve => { const r = indexedDB.open(compactSnapshotDatabaseName); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => {
      const tx = db.transaction('versions','readwrite'), store = tx.objectStore('versions'), r = store.openCursor();
      r.onsuccess = () => { const row = r.result.value; if (change === 'future') row.format = 99; else row.packet.bytes[0] ^= 255; r.result.update(row); };
      tx.oncomplete = resolve;
    }); db.close();
  }, change);
  await page.evaluate(() => view.openSnapshotHistory(options));
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies' }); await dialog.getByLabel('Saved-copy collection').selectOption('compact');
  await expect(dialog).toContainText('Some copies could not be verified');
  await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(0);
  await expect(dialog).not.toContainText('Must not be disclosed');
});

for (const mode of ['standalone', 'pooled']) test(`loaded ${mode} product view downloads exact pending copy with all network requests blocked`, async ({ page }) => {
  await isolated(page, mode);
  await page.route('**/*', route => route.abort('internetdisconnected'));
  await page.evaluate(() => view.openSnapshotHistory(options));
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies' });
  await dialog.getByLabel('Saved-copy collection').selectOption('compact');
  await expect(dialog).toContainText('awaiting central saving');
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download review file' }).click();
  const content = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(content.versions[0]).toEqual(await page.evaluate(() => originals[0]));
});

test('same id in two collections remains explicitly selected and never silently merged', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await isolated(page);
  await page.evaluate(async () => {
    const db = await new Promise(resolve => {
      const r = indexedDB.open(legacyName); r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
    });
    const row = structuredClone(originals[0]); row.storage[key] = 'Different legacy original';
    await new Promise(resolve => { const tx = db.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put(row); tx.oncomplete = resolve; });
    db.close(); await view.openSnapshotHistory(options);
  });
  const dialog = page.getByRole('dialog', { name: 'Saved browser copies' });
  for (const source of ['legacy', 'compact']) {
    await dialog.getByLabel('Saved-copy collection').selectOption(source);
    await expect(dialog.getByRole('button', { name: 'Download review file' })).toHaveCount(1);
    const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download review file' }).click();
    const content = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(content.versions[0].storage['football-session-planner-v3']).toBe(source === 'legacy' ? 'Different legacy original' : 'Pending 0 åäö 🧪');
  }
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await dialog.screenshot({ path: `/private/tmp/history-compatible-collections-${info.project.name}.png` });
});
