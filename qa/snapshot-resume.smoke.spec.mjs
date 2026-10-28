import { test, expect } from "@playwright/test";

async function setup(page, scenario = "accepted") {
  await page.goto("/medical-merge.js");
  return page.evaluate(async scenario => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    const key = "football-schedule-v1", library = "football-session-exercise-library-v1", manifestKey = "football-data-safety-v1";
    const nativeSet = Storage.prototype.setItem.bind(localStorage);
    const hash = value => { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
    nativeSet(key, "same pending intent"); nativeSet(library, "unchanged legacy payload");
    nativeSet(manifestKey, JSON.stringify({ entries: { [key]: { principalScope: "owner", pendingCentralSync: true,
      writes: 1, updatedAt: "2026-10-27T12:00:00Z", deletedAt: "", hash: hash("same pending intent"), pendingBaseRevision: 4, serverRevision: 4 } } }));
    window.__scope = "owner"; window.__queueWrites = 0;
    const button = document.createElement("button"); button.textContent = "Open health"; document.body.append(button);
    const databaseName = `qa-resume-${crypto.randomUUID()}`;
    const win = { localStorage, indexedDB, crypto, location: { href: "https://synthetic.invalid" }, setTimeout: () => 1, clearTimeout() {}, addEventListener() {} };
    const service = createDataSafetyRuntimeService({ win, storageConstructor: Storage, navigatorRef: {}, documentRef: document,
      snapshotDatabaseName: databaseName, maxSnapshots: 1, protectedStorageKeys: [key, library], ui: { dataSafetyHealthButton: button },
      getCentralStateBridge: () => ({ getReadScope: () => window.__scope, getStatus: () => ({}) }),
      queueCentralStateWrite: () => { window.__queueWrites++; return true; } });
    service.install();
    const first = await service.saveSnapshot("pending");
    const metadata = service.readManifest(); metadata.entries[key].serverRevision = 5;
    nativeSet(manifestKey, JSON.stringify(metadata));
    // A newer known revision alone is not acceptance of this pending generation.
    const unconfirmed = await service.saveSnapshot("revision-without-acceptance");
    const paused = service.readSnapshotDiagnostics().snapshotOutcome.state;
    const accepted = service.readManifest(); accepted.entries[key].pendingCentralSync = false;
    if (scenario === "different") {
      nativeSet(key, "different intent"); accepted.entries[key].writes = 2; accepted.entries[key].hash = hash("different intent");
    }
    nativeSet(manifestKey, JSON.stringify(accepted));
    window.__safety = service;
    return { first, unconfirmed, paused, databaseName };
  }, scenario);
}

for (const scenario of ["accepted", "different"]) {
  test(`paused snapshot retry ${scenario === "accepted" ? "resumes for the exact accepted generation" : "retains a different unresolved generation"}`, async ({ page }) => {
    const before = await setup(page, scenario);
    expect(before).toMatchObject({ first: true, unconfirmed: false, paused: "paused" });
    await page.getByRole("button", { name: "Open health" }).click();
    const dialog = page.getByRole("dialog", { name: "Storage health", exact: true });
    await expect(dialog).toContainText("Browser snapshots are paused");
    await expect(dialog).not.toContainText("same pending intent");
    await expect(dialog).not.toContainText("unchanged legacy payload");
    await dialog.getByRole("button", { name: "Retry browser snapshot" }).click();
    await expect(dialog).toContainText("Snapshot retry finished");
    await expect(dialog).toContainText(scenario === "accepted" ? "A browser snapshot has been recorded" : "Browser snapshots are paused");
    const state = await page.evaluate(async () => {
      const db = await window.__safety.openSnapshotDatabase();
      const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
      return { rows, primary: localStorage.getItem("football-schedule-v1"), writes: window.__queueWrites, outcome: window.__safety.readSnapshotDiagnostics().snapshotOutcome.state };
    });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].storage["football-schedule-v1"]).toBe("same pending intent");
    expect(state.rows[0].saveContext.entries["football-schedule-v1"].pendingCentralSync).toBe(scenario !== "accepted");
    expect(state).toMatchObject({ primary: scenario === "accepted" ? "same pending intent" : "different intent", writes: 0,
      outcome: scenario === "accepted" ? "available" : "paused" });
    await dialog.getByRole("button", { name: "Close storage health" }).click();
    await page.reload();
    const after = await page.evaluate(async name => {
      const db = await new Promise(resolve => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); });
      const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
      db.close(); indexedDB.deleteDatabase(name); return rows;
    }, before.databaseName);
    expect(after).toEqual(state.rows);
  });
}

test("retry cannot start after the account changes", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Open health" }).click();
  const button = page.getByRole("button", { name: "Retry browser snapshot" });
  await expect(button).toBeVisible();
  await page.evaluate(() => { window.__scope = "other"; });
  await button.click();
  await expect(page.getByRole("dialog", { name: "Storage health", exact: true })).toContainText("Account or team changed");
  expect(await page.evaluate(() => window.__safety.readSnapshotDiagnostics().snapshotOutcome.state)).toBe("paused");
});

test("snapshot completion after an account switch does not publish an outcome for the new account", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const before = JSON.stringify(window.__safety.readSnapshotDiagnostics().snapshotOutcome);
    const pending = window.__safety.saveSnapshot("scope-transition");
    window.__scope = "other";
    const committed = await pending;
    const { readSnapshotState } = await import("/src/core/snapshot-status.mjs");
    return { committed, unchanged: JSON.stringify(window.__safety.readSnapshotDiagnostics().snapshotOutcome) === before,
      state: readSnapshotState(window.__safety.readManifest(), "other") };
  });
  expect(result).toEqual({ committed: true, unchanged: true, state: "unknown" });
});

test("unchanged pending work stays recoverable through repeated acknowledged changes", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { storeDistinctSnapshot } = await import("/src/core/distinct-snapshot-store.mjs");
    const name = `qa-covered-${crypto.randomUUID()}`;
    const db = await new Promise(resolve => { const r = indexedDB.open(name); r.onupgradeneeded = () => {
      for (const s of ["snapshots", "latest"]) r.result.createObjectStore(s, { keyPath: "id" }); }; r.onsuccess = () => resolve(r.result); });
    const hash = value => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
    const outcomes = [];
    for (let n = 0; n < 25; n++) {
      const other = String(n);
      const row = { id: String(n), schema: "football-science-backup-v1", app: "Football Science", createdAt: String(n),
        storage: { work: "pending", other }, recoveryCopies: {}, recoveryState: {}, recoverySeparations: [],
        saveContext: { scope: "owner", entries: { work: { principalScope: "owner", pendingCentralSync: true, writes: 1 },
          other: { principalScope: "owner", pendingCentralSync: false, serverRevision: n + 1, hash: hash(other) } } } };
      outcomes.push(await storeDistinctSnapshot(db, "snapshots", "latest", row, { maxSnapshots: 1 }));
    }
    const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); indexedDB.deleteDatabase(name); return { rows, count: outcomes.length };
  });
  expect(result.count).toBe(25); expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ storage: { work: "pending", other: "24" }, recoveryCopies: {},
    saveContext: { entries: { work: { pendingCentralSync: true, writes: 1 } } } });
});


test("real save receipts keep repeated offline-to-online generations within one snapshot slot", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    const { createCentralSyncRuntimeService } = await import("/src/core/central-sync-runtime-service.mjs");
    const key = "football-schedule-v1", library = "football-session-exercise-library-v1";
    const set = Storage.prototype.setItem.bind(localStorage);
    set(library, "unchanged library");
    let revision = 4, sends = 0, sync;
    const receipts = [];
    const bridge = { getReadScope: () => "owner", isHydrated: () => true,
      getStatus: () => ({ metadata: { [key]: { revision } } }),
      syncKey: async (_key, value) => { sends++; return { ok: true, value, revision: ++revision }; } };
    const win = { localStorage, indexedDB, crypto, footballScienceCentralState: bridge, location: { href: "https://synthetic.invalid" },
      setTimeout: () => 1, clearTimeout() {}, addEventListener() {} };
    const service = createDataSafetyRuntimeService({ win, storageConstructor: Storage, navigatorRef: {}, documentRef: document,
      snapshotDatabaseName: `qa-receipt-cycle-${crypto.randomUUID()}`, maxSnapshots: 1, protectedStorageKeys: [key, library],
      getCentralStateBridge: () => bridge, queueCentralStateWrite: (...args) => sync.queueCentralStateWrite(...args) });
    service.install();
    sync = createCentralSyncRuntimeService({ win, getCurrentUser: () => ({ id: "owner" }), scheduleStorageKey: key,
      isProtectedStorageKey: service.isProtectedStorageKey, rawGetItem: service.rawGetItem, rawSetItem: service.rawSetItem,
      hashString: service.hashString, mutateManifest: service.mutateManifest, readManifest: service.readManifest,
      captureReceiptSnapshot: reason => { const pending = service.saveSnapshot(reason); receipts.push(pending); return pending; } });
    const outcomes = [];
    for (let i = 0; i < 12; i++) {
      const value = JSON.stringify({ generation: i });
      set(key, value); service.recordWrite(key, value, { requirePersisted: true });
      outcomes.push(await service.saveSnapshot("offline-intent"));
      await sync.flushCentralStateWrites();
      outcomes.push(await receipts.at(-1));
    }
    const db = await service.openSnapshotDatabase();
    const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); return { allCommitted: outcomes.every(Boolean), sends, receiptCount: receipts.length, rows, outcome: service.readSnapshotDiagnostics().snapshotOutcome.state };
  });
  expect(result).toMatchObject({ allCommitted: true, sends: 12, receiptCount: 12, outcome: "available" });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ storage: { "football-schedule-v1": '{"generation":11}' },
    saveContext: { entries: { "football-schedule-v1": { pendingCentralSync: false, serverRevision: 16, writes: 12 } } } });
});

test("a failed covered replacement retains the previous protected generation", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const { storeDistinctSnapshot } = await import("/src/core/distinct-snapshot-store.mjs");
    const db = await window.__safety.openSnapshotDatabase();
    const read = () => new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
    const before = await read(), incoming = { ...window.__safety.createBackupEnvelope("accepted"), id: "replacement" };
    const broken = { transaction(...args) { const tx = db.transaction(...args), objectStore = tx.objectStore.bind(tx);
      tx.objectStore = name => { const store = objectStore(name); if (name === "latest") store.put = () => { tx.abort(); throw new Error("Injected failure"); }; return store; }; return tx; } };
    let failed = false;
    try { await storeDistinctSnapshot(broken, "snapshots", "latest", incoming, { maxSnapshots: 1 }); } catch { failed = true; }
    return { failed, unchanged: JSON.stringify(before) === JSON.stringify(await read()) };
  });
  expect(result).toEqual({ failed: true, unchanged: true });
});
