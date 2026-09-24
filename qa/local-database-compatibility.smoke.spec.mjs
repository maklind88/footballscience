import { expect, test } from "@playwright/test";

const databaseName = "football-science-data-safety-v1";
const scope = "qa-coach:qa-org:qa-team";

async function boot(page) {
  await page.route("**/qa/database-compatibility", (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Isolated storage schema test</title>",
  }));
  await page.goto("/qa/database-compatibility");
  await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
    window.sessions = createSessionSaveStore();
    window.backup = createDataSafetyRuntimeService();
    window.journal = createOfflineOperationJournal();
    window.operation = { id: "offline-edit", scope: "qa-coach:qa-org:qa-team", moduleId: "periodization",
      key: "football-periodization-v2", type: "day.patch", payload: { title: "Keep this edit" }, baseRevision: 7 };
    window.rows = async (name) => {
      const db = await window.backup.openDatabase();
      return new Promise((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    };
  });
}

for (const journalFirst of [false, true]) {
  test(`shared storage preserves pending edits and backups with journal ${journalFirst ? "first" : "last"} across tabs and reload`, async ({ page, context }) => {
    await boot(page);
    const peer = await context.newPage();
    await boot(peer);
    if (journalFirst) await peer.evaluate(() => window.journal.put(window.operation));
    const before = await page.evaluate(async (scope) => {
      await window.sessions.put({ change: { id: "session-pending", payload: "Unacknowledged" }, scope, status: "pending", createdAt: 1 });
      await window.sessions.archiveLocal("Original recovery copy", { scope, revision: 7 });
      if (!await window.backup.saveSnapshot("schema-test")) throw new Error("Backup failed");
      return { snapshots: await window.rows("snapshots"), latest: await window.rows("latest") };
    }, scope);
    if (!journalFirst) await peer.evaluate(() => window.journal.put(window.operation));
    // Reuse already-open Sessions/backup clients after the peer upgraded v1 -> v2.
    expect(await page.evaluate((scope) => window.sessions.list(scope), scope)).toHaveLength(1);
    expect(await page.evaluate(async () => ({ snapshots: await window.rows("snapshots"), latest: await window.rows("latest") }))).toEqual(before);
    expect(await page.evaluate(() => window.backup.saveSnapshot("after-upgrade"))).toBe(true);
    const expected = await page.evaluate(async () => ({ snapshots: await window.rows("snapshots"), latest: await window.rows("latest") }));
    await page.reload();
    await boot(page);
    expect(await page.evaluate(async () => ({ snapshots: await window.rows("snapshots"), latest: await window.rows("latest") }))).toEqual(expected);
    expect(await page.evaluate((scope) => window.journal.list(scope), scope)).toMatchObject([{ id: "offline-edit", status: "pending", baseRevision: 7 }]);
    expect(await page.evaluate(() => window.journal.list("another:org:team"))).toEqual([]);
    expect(await page.evaluate(async () => (await window.backup.openDatabase()).version)).toBe(2);
  });
}

test("legacy tab blocks upgrade explicitly; no late upgrade or lost write, retry succeeds after it closes", async ({ page, context }) => {
  await boot(page);
  await page.evaluate(async (name) => {
    window.legacy = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("snapshots", { keyPath: "id" });
        request.result.createObjectStore("latest", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    // Deliberately emulate an old tab with no versionchange handler.
  }, databaseName);
  const peer = await context.newPage(); await boot(peer);
  expect(await peer.evaluate(async () => {
    try { await window.journal.put(window.operation); return "unexpected success"; }
    catch (error) { return error.message; }
  })).toContain("Close other platform tabs and retry");
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const tx = window.legacy.transaction("latest", "readwrite");
      tx.objectStore("latest").put({ id: "session-save:legacy", scope: "qa-coach:qa-org:qa-team", value: "Still durable" });
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    window.legacy.close();
  });
  // A versionless open is queued after the rejected upgrade and observes its rollback.
  expect(await page.evaluate(async () => (await window.backup.openDatabase()).version)).toBe(1);
  await peer.evaluate(() => window.journal.put(window.operation));
  expect(await page.evaluate((scope) => window.sessions.list(scope), scope)).toMatchObject([{ value: "Still durable" }]);
  expect(await peer.evaluate((scope) => window.journal.list(scope), scope)).toHaveLength(1);
});

test("aborted journal upgrade preserves the version-one stores and can retry", async ({ page }) => {
  await boot(page);
  await page.evaluate(async (scope) => {
    await window.sessions.put({ change: { id: "prior" }, scope, status: "pending" });
    const create = IDBDatabase.prototype.createObjectStore;
    IDBDatabase.prototype.createObjectStore = function(name, options) {
      const store = create.call(this, name, options);
      if (name === "offline-operations-v1") store.transaction.abort();
      return store;
    };
    try {
      await window.journal.open().then(() => { throw new Error("Unexpected success"); }, (error) => {
        if (error.name !== "AbortError") throw error;
      });
    } finally { IDBDatabase.prototype.createObjectStore = create; }
  }, scope);
  expect(await page.evaluate(async () => (await window.backup.openDatabase()).version)).toBe(1);
  expect(await page.evaluate((scope) => window.sessions.list(scope), scope)).toHaveLength(1);
  await page.evaluate(() => window.journal.put(window.operation));
  expect(await page.evaluate((scope) => window.sessions.list(scope), scope)).toHaveLength(1);
});

test("quota failure never acknowledges a journal write and existing pending data survives reload", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.journal.put(window.operation));
  const error = await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value) {
      if (this.name !== "offline-operations-v1") return put.call(this, value);
      this.transaction.abort();
      throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    };
    try { await window.journal.put({ ...window.operation, id: "quota-write" }); return "unexpected success"; }
    catch (error) { return error.name; }
    finally { IDBObjectStore.prototype.put = put; }
  });
  expect(error).toBe("QuotaExceededError");
  await page.reload(); await boot(page);
  expect(await page.evaluate((scope) => window.journal.list(scope), scope)).toMatchObject([{ id: "offline-edit" }]);
  expect(await page.evaluate((scope) => window.journal.list(scope), scope)).toHaveLength(1);
  await page.evaluate(() => window.journal.put({ ...window.operation, id: "retry" }));
  expect(await page.evaluate((scope) => window.journal.list(scope), scope)).toHaveLength(2);
});

test("unknown schema is rejected without deleting stored values", async ({ page }) => {
  await boot(page);
  await page.evaluate(async (name) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      request.onupgradeneeded = () => request.result.createObjectStore("latest", { keyPath: "otherId" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve) => {
      const tx = db.transaction("latest", "readwrite"); tx.objectStore("latest").put({ otherId: "keep" }); tx.oncomplete = resolve;
    });
    db.close();
  }, databaseName);
  expect(await page.evaluate(async () => {
    try { await window.sessions.list("anything"); return "unexpected success"; }
    catch (error) { return error.message; }
  })).toContain("schema is incompatible");
  expect(await page.evaluate(async (name) => {
    const db = await new Promise((resolve) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); });
    const rows = await new Promise((resolve) => { const request = db.transaction("latest").objectStore("latest").getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return rows;
  }, databaseName)).toEqual([{ otherId: "keep" }]);
});

test("denied IndexedDB access does not break service construction and a later open can recover", async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    let denied = true;
    const service = createDataSafetyRuntimeService({ win: {
      get indexedDB() {
        if (denied) throw new DOMException("Storage denied", "SecurityError");
        return window.indexedDB;
      },
    } });
    let error;
    try { await service.openDatabase(); } catch (failure) { error = failure.name; }
    denied = false;
    const db = await service.openDatabase();
    const stores = Array.from(db.objectStoreNames); db.close();
    return { error, stores };
  })).toEqual({ error: "SecurityError", stores: ["latest", "snapshots"] });
});
