import { test, expect } from "@playwright/test";

async function boot(page) {
  await page.goto("/medical-merge.js");
  await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    window.scope = "owner"; window.canEdit = true; window.alerts = []; window.writes = []; window.reloads = 0;
    window.backup = { schema: "football-science-backup-v1", storage: { "synthetic-work": "restored content" },
      saveContext: { scope: "owner", entries: { "synthetic-work": { principalScope: "owner" } } } };
    const win = { localStorage, indexedDB, crypto, document, location: { href: "https://synthetic.invalid", reload() { window.reloads++; } },
      setTimeout(fn, ms) { if (ms === 250) window.reloads++; return 1; }, clearTimeout() {}, addEventListener() {}, alert(message) { window.alerts.push(message); } };
    window.safety = createDataSafetyRuntimeService({ win, documentRef: document, navigatorRef: {}, storageConstructor: Storage,
      protectedStorageKeys: ["synthetic-work"], getCentralStateBridge: () => ({ getReadScope: () => window.scope,
        getStatus: () => ({}), canAutoSyncKey: () => window.canEdit }),
      queueCentralStateWrite: (...args) => { window.writes.push(args); return true; } });
    window.safety.install(); window.safety.rawSetItem("synthetic-work", "current work");
    window.safety.mutateManifest(m => { m.entries["synthetic-work"] = { principalScope: "owner", pendingCentralSync: true, writes: 1 }; });
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === "football-science-browser-snapshots-v2" && mode === "readwrite" && window.onSnapshotWrite) {
        const callback = window.onSnapshotWrite; window.onSnapshotWrite = null; callback();
      }
      return transaction.call(this, stores, mode, ...rest);
    };
    window.startRestore = () => { window.restoring = window.safety.importBackupFile({ text: async () => {
      if (window.onReadFile) window.onReadFile(); return JSON.stringify(window.backup);
    } }); };
  });
}

for (const change of ["file-scope", "confirmation-scope", "snapshot-scope", "snapshot-edit", "snapshot-generation", "snapshot-permission", "missing-scope", "foreign-file", "foreign-entry"]) {
  test(`restore stops without writes after ${change}`, async ({ page }) => {
    await boot(page);
    await page.evaluate(change => {
      if (change === "missing-scope") { window.scope = ""; delete window.backup.saveContext; }
      if (change === "file-scope") window.onReadFile = () => { window.scope = "other"; };
      if (change === "foreign-file") window.backup.saveContext.scope = "other";
      if (change === "foreign-entry") window.backup.saveContext.entries["synthetic-work"].principalScope = "other";
      if (change.startsWith("snapshot-")) window.onSnapshotWrite = () => {
        if (change === "snapshot-scope") window.scope = "other";
        if (change === "snapshot-permission") window.canEdit = false;
        if (change === "snapshot-generation") window.safety.mutateManifest(m => { m.entries["synthetic-work"].writes = 2; });
        if (change === "snapshot-edit") {
          window.safety.rawSetItem("synthetic-work", "newer work during snapshot");
          window.safety.mutateManifest(m => { m.entries["synthetic-work"].writes = 2; });
        }
      };
      window.startRestore();
    }, change);
    // The old implementation opens a dialog even for invalid input; close it
    // through the real confirmation so the regression observes actual writes.
    const restore = page.getByRole("button", { name: "Restore", exact: true });
    await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('[data-platform-confirm-ok]')) || window.alerts.length > 0)).toBeTruthy();
    if (await restore.isVisible()) {
      if (change === "confirmation-scope") await page.evaluate(() => { window.scope = "other"; });
      await restore.click();
    }
    await page.evaluate(() => window.restoring);
    const result = await page.evaluate(() => ({ value: window.safety.rawGetItem("synthetic-work"), writes: window.writes,
      reloads: window.reloads, imported: window.safety.readManifest().lastImportedAt, alerts: window.alerts }));
    expect(result.value).toBe(change === "snapshot-edit" ? "newer work during snapshot" : "current work");
    expect(result.writes).toEqual([]); expect(result.reloads).toBe(0); expect(result.imported).toBeFalsy();
    expect(result.alerts.join(" ")).toContain("Backup not restored");
  });
}

test("unchanged authorized restore still requires and commits a protective copy", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.startRestore());
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.evaluate(() => window.restoring);
  const result = await page.evaluate(async () => {
    const db = await window.safety.openSnapshotDatabase();
    const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
    return { value: window.safety.rawGetItem("synthetic-work"), snapshots: rows.map(row => row.storage["synthetic-work"]), writes: window.writes.length, reloads: window.reloads };
  });
  expect(result).toMatchObject({ value: "restored content", writes: 1, reloads: 1 });
  expect(result.snapshots).toContain("current work"); expect(result.snapshots).toContain("restored content");
});
