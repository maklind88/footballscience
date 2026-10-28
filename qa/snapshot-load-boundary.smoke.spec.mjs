import { test, expect } from "@playwright/test";

async function setup(page, size = 128) {
  await page.goto("/medical-merge.js");
  await page.evaluate(async size => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    const key = "football-schedule-v1", manifestKey = "football-data-safety-v1";
    const rawSet = Storage.prototype.setItem.bind(localStorage), rawGet = Storage.prototype.getItem.bind(localStorage);
    if (!rawGet(key)) rawSet(key, "x".repeat(size));
    if (!rawGet(manifestKey)) rawSet(manifestKey, JSON.stringify({ entries: {
      [key]: { principalScope: "owner", pendingCentralSync: true, writes: 1 },
      "football-medical-team-v1": { principalScope: "owner", pendingCentralSync: true, writes: 17 },
    } }));
    window.saveScope ||= "owner"; window.stats = { primaryReads: 0, manifestWrites: 0, snapshotTransactions: 0 };
    const storageConstructor = { prototype: {
      getItem(key) { if (key === "football-schedule-v1") window.stats.primaryReads++; return rawGet(key); },
      setItem(key, value) { if (key === manifestKey) window.stats.manifestWrites++; return rawSet(key, value); },
      removeItem: Storage.prototype.removeItem, clear: Storage.prototype.clear, key: Storage.prototype.key,
    } };
    const win = { localStorage, indexedDB, crypto, location: { href: "https://synthetic.invalid" },
      setTimeout: () => 1, clearTimeout() {}, addEventListener() {} };
    window.service = createDataSafetyRuntimeService({ win, storageConstructor, documentRef: document, navigatorRef: {},
      protectedStorageKeys: [key], getCentralStateBridge: () => ({ getReadScope: () => window.saveScope, getStatus: () => ({}) }) });
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === "football-science-browser-snapshots-v2" && mode === "readwrite") window.stats.snapshotTransactions++;
      return transaction.call(this, stores, mode, ...rest);
    };
    window.service.install(); window.stats = { primaryReads: 0, manifestWrites: 0, snapshotTransactions: 0 }; window.before = rawGet(manifestKey);
  }, size);
}

test("a burst of large optional snapshots never rewrites primary pending metadata", async ({ page }) => {
  await setup(page, 2 * 1024 * 1024);
  const result = await page.evaluate(async () => {
    const started = performance.now();
    const pending = Array.from({ length: 20 }, () => window.service.saveSnapshot("synthetic-burst"));
    const captureMs = performance.now() - started;
    const outcomes = await Promise.all(pending);
    const db = await window.service.openSnapshotDatabase();
    const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
    return { ...window.stats, captureMs, elapsedMs: performance.now() - started, allSaved: outcomes.every(Boolean),
      rows: rows.length, bytes: rows[0].storage["football-schedule-v1"].length,
      manifestUnchanged: localStorage.getItem("football-data-safety-v1") === window.before };
  });
  console.log("Synthetic snapshot burst", JSON.stringify(result));
  expect(result).toMatchObject({ allSaved: true, rows: 1, bytes: 2 * 1024 * 1024, manifestWrites: 0, manifestUnchanged: true, snapshotTransactions: 1 });
});

test("two tabs completing snapshots do not write the shared module manifest", async ({ page, context }) => {
  await setup(page);
  const peer = await context.newPage(); await setup(peer);
  for (const tab of [page, peer]) await tab.evaluate(() => { window.before = localStorage.getItem("football-data-safety-v1"); });
  const run = tab => tab.evaluate(async () => {
    await Promise.all(Array.from({ length: 8 }, () => window.service.saveSnapshot("two-tabs")));
    return { ...window.stats, unchanged: localStorage.getItem("football-data-safety-v1") === window.before };
  });
  const results = await Promise.all([run(page), run(peer)]);
  for (const result of results) expect(result).toMatchObject({ manifestWrites: 0, unchanged: true });
});

for (const change of ["payload", "generation", "scope"]) {
  test(`concurrent snapshots with different ${change} cannot share acceptance`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async change => {
      const first = window.service.saveSnapshot("first");
      if (change === "payload") localStorage.setItem("football-schedule-v1", "new protected payload");
      if (change === "generation") window.service.mutateManifest(m => { m.entries["football-schedule-v1"].writes++; });
      if (change === "scope") window.saveScope = "other-owner";
      const results = await Promise.all([first, window.service.saveSnapshot("second")]);
      const db = await window.service.openSnapshotDatabase();
      const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
      return { results, count: rows.length, transactions: window.stats.snapshotTransactions };
    }, change);
    expect(result).toEqual({ results: [true, true], count: 2, transactions: 2 });
  });
}

test("joined callers all fail on write failure and a later retry can commit", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const transaction = IDBDatabase.prototype.transaction;
    let attempts = 0;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === "football-science-browser-snapshots-v2" && mode === "readwrite") {
        attempts++; throw new DOMException("Synthetic quota", "QuotaExceededError");
      }
      return transaction.call(this, stores, mode, ...rest);
    };
    const failed = await Promise.all(Array.from({ length: 10 }, () => window.service.saveSnapshot("joined-failure")));
    IDBDatabase.prototype.transaction = transaction;
    const retried = await window.service.saveSnapshot("later-retry");
    return { failed, attempts, retried, manifestUnchanged: localStorage.getItem("football-data-safety-v1") === window.before };
  });
  expect(result).toEqual({ failed: Array(10).fill(false), attempts: 1, retried: true, manifestUnchanged: true });
});
