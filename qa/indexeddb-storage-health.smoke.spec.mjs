import { test, expect } from "@playwright/test";

test("IndexedDB inventory reads counts and approximate sizes without writes or exposing content", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
    const open = indexedDB.open("football-science-data-safety-v1", 2);
    open.onupgradeneeded = () => { for (const name of ["snapshots", "latest", "offline-operations-v1"]) open.result.createObjectStore(name, { keyPath: "id" }); };
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = reject; });
    const write = db.transaction(["snapshots", "latest", "offline-operations-v1"], "readwrite");
    write.objectStore("snapshots").put({ id: "private-snapshot", reason: "session-planner-recovery-review", storage: { secret: "private clinical contents" } });
    for (const status of ["pending", "review", "archived", "constructor"]) write.objectStore("latest").put({ id: "session-save:" + status, status, scope: "private-user", change: { note: "private coaching contents" } });
    write.objectStore("offline-operations-v1").put({ id: "private-operation", status: "applied" });
    await new Promise((resolve, reject) => { write.oncomplete = resolve; write.onerror = reject; });
    const dump = () => Promise.all(["snapshots", "latest", "offline-operations-v1"].map(name => new Promise(resolve => {
      const request = db.transaction(name, "readonly").objectStore(name).getAll(); request.onsuccess = () => resolve(request.result);
    })));
    const before = JSON.stringify(await dump()), modes = [];
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(names, mode, options) { modes.push(mode); return original.call(this, names, mode, options); };
    const report = await collectIndexedDbStorageHealth({ indexedDB });
    IDBDatabase.prototype.transaction = original;
    const after = JSON.stringify(await dump()); db.close();
    return { report, unchanged: before === after, modes };
  });
  expect(result.unchanged).toBe(true); expect(result.modes).toEqual(["readonly"]);
  expect(result.report.status).toBe("complete");
  expect(result.report.databases[0].records).toBe(6);
  expect(result.report.databases[0].groups.map(row => row.label)).toEqual(expect.arrayContaining(["Sessions recovery snapshots", "Sessions pending edits", "Sessions review edits", "Sessions archived edits", "Sessions unclassified edits", "Shared applied operations"]));
  expect(result.report.databases[1].status).toBe("absent");
  for (const text of ["private-", "private clinical", "private coaching", "private-user"]) expect(JSON.stringify(result.report)).not.toContain(text);
});

test("missing or concurrently removed databases never commit a schema or stored data", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
    const absent = await collectIndexedDbStorageHealth({ indexedDB });
    const changed = await collectIndexedDbStorageHealth({ indexedDB: {
      databases: async () => [{ name: "football-science-data-safety-v1" }], open: name => indexedDB.open(name),
    } });
    const inventory = await indexedDB.databases();
    const native = indexedDB.open("qa-native-aborted-open");
    native.onupgradeneeded = () => native.transaction.abort();
    await new Promise(resolve => { native.onerror = resolve; });
    const nativeInventory = await indexedDB.databases();
    return { absent, changed, databases: inventory, nativeInventory };

  });
  expect(result.absent.databases.every(row => row.status === "absent")).toBe(true);
  expect(result.changed.status).toBe("partial"); expect(result.changed.databases[0].status).toBe("unavailable");
  // WebKit lists a version-zero placeholder even after a native aborted open.
  // Compare that browser baseline, while requiring zero committed schemas.
  expect(result.databases.filter(row => row.version > 0)).toEqual([]);
  expect(result.databases.map(row => row.version)).toEqual(result.nativeInventory
    .filter(row => row.name === "qa-native-aborted-open").map(row => row.version));
});

test("bounded scan reports incomplete counts and keeps all pending work", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
    const open = indexedDB.open("football-science-library-v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("pending", { keyPath: "id" });
    const db = await new Promise(resolve => { open.onsuccess = () => resolve(open.result); });
    const tx = db.transaction("pending", "readwrite");
    for (let id = 0; id < 4; id++) tx.objectStore("pending").put({ id, scope: "private", payload: "retained" });
    await new Promise(resolve => { tx.oncomplete = resolve; });
    const report = await collectIndexedDbStorageHealth({ indexedDB, maxRecords: 2 });
    const count = await new Promise(resolve => { const request = db.transaction("pending", "readonly").objectStore("pending").count(); request.onsuccess = () => resolve(request.result); });
    db.close(); return { report, count };
  });
  expect(result.report.status).toBe("partial"); expect(result.report.databases[1].records).toBe(2); expect(result.count).toBe(4);
});

test("unsupported, denied and timed-out enumeration stays unknown and never opens storage", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const results = await page.evaluate(async () => {
    const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
    let opens = 0;
    const reports = [];
    for (const databases of [undefined, async () => { throw new Error("private details"); }, () => new Promise(() => {})]) {
      reports.push(await collectIndexedDbStorageHealth({ indexedDB: { databases, open: () => { opens++; } }, timeoutMs: 10 }));
    }
    return { reports, opens };
  });
  expect(results.opens).toBe(0); expect(results.reports.every(row => row.status === "unavailable")).toBe(true);
  expect(JSON.stringify(results)).not.toContain("private details");
});

test("large snapshots cannot hide the total rows in uninspected operation stores", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
    const request = indexedDB.open("football-science-data-safety-v1", 2);
    request.onupgradeneeded = () => {
      for (const name of ["snapshots", "latest", "offline-operations-v1"]) request.result.createObjectStore(name, { keyPath: "id" });
    };
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction(["snapshots", "latest", "offline-operations-v1"], "readwrite");
    for (let id = 0; id < 2; id++) tx.objectStore("snapshots").put({ id, storage: { secret: "private snapshot".repeat(100) } });
    tx.objectStore("latest").put({ id: "session-save:private-id", status: "review", scope: "private-owner" });
    tx.objectStore("offline-operations-v1").put({ id: "private-operation", status: "pending" });
    await new Promise(resolve => { tx.oncomplete = resolve; });
    const dump = () => Promise.all(["snapshots", "latest", "offline-operations-v1"].map(name => new Promise(resolve => {
      const read = db.transaction(name).objectStore(name).getAll(); read.onsuccess = () => resolve(read.result);
    })));
    const before = JSON.stringify(await dump());
    const modes = [], original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(names, mode, ...args) { modes.push(mode); return original.call(this, names, mode, ...args); };
    const report = await collectIndexedDbStorageHealth({ indexedDB, maxBytes: 128 });
    IDBDatabase.prototype.transaction = original;
    const unchanged = before === JSON.stringify(await dump()); db.close();
    return { report, modes, unchanged };
  });
  expect(result.unchanged).toBe(true);
  expect(result.modes).toEqual(["readonly"]);
  expect(result.report.databases[0]).toMatchObject({ status: "partial", stoppedBecause: "bytes", records: 1, totalRecords: 4,
    stores: [
      { label: "Safety snapshots and recovery", totalRecords: 2, scannedRecords: 1 },
      { label: "Safety latest copies and Sessions edits", totalRecords: 1, scannedRecords: 0 },
      { label: "Shared operations", totalRecords: 1, scannedRecords: 0 },
    ] });
  expect(result.report.databases[0].groups.map(row => row.label)).not.toContain("Sessions review edits");
  expect(JSON.stringify(result.report)).not.toContain("private");
});

test("an incomplete IndexedDB scan is incomplete at the top of the health dialog too", async ({ page }) => {
  await page.goto("/medical-merge.js");
  await page.evaluate(async () => {
    const request = indexedDB.open("football-science-library-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pending", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction("pending", "readwrite");
    for (let id = 0; id < 3002; id++) tx.objectStore("pending").put({ id, status: "pending", payload: "private" });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
    const { openStorageHealth } = await import("/src/core/storage-health-dialog.mjs");
    await openStorageHealth({ documentRef: document, storage: localStorage, indexedDB });
  });
  const dialog = page.getByRole("dialog", { name: "Storage health", exact: true });
  await expect(dialog.getByRole("status", { name: "Storage inventory status" })).toHaveText("Storage check incomplete. Some information could not be read.");
  await expect(dialog).toContainText("3000 rows inspected of 3002 stored rows");
  await expect(dialog).toContainText("Inspection stopped at row limit");
  await expect(dialog).toContainText("Library pending and review edits: 3002 stored rows; 3000 inspected.");
  await expect(dialog).not.toContainText("private");
});

test("failed row counts remain unknown rather than reporting an empty database", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const request = indexedDB.open("football-science-library-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pending", { keyPath: "id" });
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
    const write = db.transaction("pending", "readwrite");
    write.objectStore("pending").put({ id: "private-retained", status: "pending" });
    await new Promise(resolve => { write.oncomplete = resolve; }); db.close();
    const original = IDBObjectStore.prototype.count;
    IDBObjectStore.prototype.count = function() { throw new Error("private storage error"); };
    try {
      const { collectIndexedDbStorageHealth } = await import("/src/core/indexeddb-storage-health.mjs");
      return await collectIndexedDbStorageHealth({ indexedDB });
    } finally { IDBObjectStore.prototype.count = original; }
  });
  expect(result.status).toBe("partial");
  expect(result.databases[1]).toMatchObject({ status: "unavailable", totalRecords: null,
    stores: [{ label: "Library pending and review edits", totalRecords: null, scannedRecords: 0 }] });
  expect(JSON.stringify(result)).not.toContain("private");
});
