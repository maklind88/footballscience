import { test, expect } from "@playwright/test";

for (const rollback of [false, true]) {
  test(`a ${rollback ? "rollback writer" : "still-open old tab"} cannot prune the new snapshot database`, async ({ page, context }) => {
    await page.goto("/medical-merge.js");
    const legacy = await context.newPage(); await legacy.goto("/medical-merge.js");
    await legacy.evaluate(async () => {
      window.oldDb = await new Promise(resolve => {
        const r = indexedDB.open("football-science-data-safety-v1", 1);
        r.onupgradeneeded = () => { for (const store of ["snapshots", "latest"]) r.result.createObjectStore(store, { keyPath: "id" }); };
        r.onsuccess = () => resolve(r.result);
      });
      const tx = window.oldDb.transaction(["snapshots", "latest"], "readwrite");
      tx.objectStore("snapshots").put({ id: "football-session-planner-v3-quota-fallback:original", value: "retained legacy recovery" });
      tx.objectStore("latest").put({ id: "session-save:pending", scope: "owner", status: "pending", value: "retained journal" });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    });
    const before = await page.evaluate(async () => {
      const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
      const key = "football-schedule-v1";
      localStorage.setItem(key, "future protected intent");
      localStorage.setItem("football-data-safety-v1", JSON.stringify({ entries: { [key]: { principalScope: "owner", pendingCentralSync: true, writes: 1 } } }));
      const win = { localStorage, indexedDB, crypto, location: { href: "https://synthetic.invalid" }, setTimeout: () => 1, clearTimeout() {}, addEventListener() {} };
      window.safety = createDataSafetyRuntimeService({ win, storageConstructor: Storage, navigatorRef: {}, documentRef: document,
        protectedStorageKeys: [key], getCentralStateBridge: () => ({ getReadScope: () => "owner", getStatus: () => ({}) }) });
      window.safety.install();
      if (!await window.safety.saveSnapshot("new-client")) throw new Error("Snapshot failed");
      const db = await window.safety.openSnapshotDatabase();
      const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
      return { name: db.name, version: db.version, rows };
    });
    if (rollback) { await legacy.close(); }
    const writer = rollback ? await context.newPage() : legacy;
    if (rollback) await writer.goto("/medical-merge.js");
    const old = await writer.evaluate(async () => {
      const { storeDistinctSnapshot, pruneSnapshots } = await import("/qa/fixtures/snapshot-writer-845a0ed.mjs");
      const db = window.oldDb || await new Promise(resolve => { const r = indexedDB.open("football-science-data-safety-v1"); r.onsuccess = () => resolve(r.result); });
      for (let i = 0; i < 4; i++) {
        await storeDistinctSnapshot(db, "snapshots", "latest", { id: `old-${i}`, schema: "football-science-backup-v1", app: "Football Science",
          createdAt: String(i), storage: { work: `legacy edit ${i}` }, saveContext: { scope: "owner", entries: {} },
          recoveryCopies: {}, recoveryState: {}, recoverySeparations: [] });
        await pruneSnapshots(db, 1);
      }
      const read = name => new Promise(resolve => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); });
      const result = { history: await read("snapshots"), latest: await read("latest"), version: db.version };
      db.close(); return result;
    });
    expect(old.history.map(row => row.id)).toEqual(["football-session-planner-v3-quota-fallback:original", "old-3"]);
    expect(old.latest.find(row => row.id === "session-save:pending")).toMatchObject({ value: "retained journal", status: "pending" });
    expect(old.version).toBe(1);
    const after = await page.evaluate(async () => {
      const db = await window.safety.openSnapshotDatabase();
      const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
      const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
      const report = await collectIndexedDbStorageHealth({ indexedDB });
      return { rows, report: report.databases.find(row => row.label === "Browser snapshots") };
    });
    expect(before.name).toBe("football-science-browser-snapshots-v2");
    expect(after.rows).toEqual(before.rows);
    expect(after.report).toMatchObject({ status: "complete", records: 2 });
    expect(JSON.stringify(after.report)).not.toContain("future protected intent");
    await page.reload();
    const reopened = await page.evaluate(async () => {
      const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
      const db = await createDataSafetyRuntimeService().openSnapshotDatabase();
      const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
      db.close(); return rows;
    });
    expect(reopened).toEqual(before.rows);
  });
}
