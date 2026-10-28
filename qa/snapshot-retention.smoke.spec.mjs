import { test, expect } from "@playwright/test";

async function run(page, scenario) {
  await page.goto("/medical-merge.js");
  return page.evaluate(async scenario => {
    const { storeDistinctSnapshot } = await import("/src/core/distinct-snapshot-store.mjs");
    const name = `qa-retention-${crypto.randomUUID()}`;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        for (const store of ["snapshots", "latest"]) request.result.createObjectStore(store, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const hash = value => { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
    const row = (id, value = id, extra = {}) => ({ id, schema: "football-science-backup-v1", app: "Football Science", createdAt: id,
      storage: { key: value }, recoveryCopies: {}, recoverySeparations: [], recoveryState: {},
      saveContext: { scope: "owner", entries: { key: { principalScope: "owner", pendingCentralSync: false, serverRevision: 1, hash: hash(value) } } }, ...extra });
    const put = async (store, rows) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite"); rows.forEach(row => tx.objectStore(store).put(row));
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    const read = store => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const write = (value, options, database = db) => storeDistinctSnapshot(database, "snapshots", "latest", value, options);
    const options = { maxSnapshots: 2, maxSnapshotBytes: 64 * 1024 };
    try {
      const old = row("01");
      if (scenario === "protected") old.saveContext.entries.key.pendingCentralSync = true;
      if (scenario === "unknown") delete old.saveContext;
      if (scenario === "foreign") old.saveContext.scope = "another-owner";
      if (scenario === "mismatched") old.saveContext.entries.key.hash = "wrong";
      if (scenario === "future") old.futureRecoveryData = { text: "retain unknown semantics" };
      if (scenario === "recovery") old.recoveryCopies = { rescue: "only copy" };
      await write(old, options);
      await write(row("02"), options);
      const before = { history: await read("snapshots"), latest: await read("latest") };
      if (["protected", "unknown", "foreign", "mismatched", "recovery", "future"].includes(scenario)) {
        await write(row("03"), options);
        const rows = await read("snapshots");
        return { ids: rows.map(row => row.id), retained: JSON.stringify(rows.find(row => row.id === "01")) === JSON.stringify(old) };
      }
      if (scenario === "blocked") {
        const protectedRows = before.history.map(row => ({ ...row, recoveryState: { rescue: "retained" } }));
        await put("snapshots", protectedRows);
        let error = "";
        try { await write(row("03"), options); } catch (failure) { error = failure.name; }
        return { error, unchanged: JSON.stringify(await read("snapshots")) === JSON.stringify(protectedRows),
          latestUnchanged: JSON.stringify(await read("latest")) === JSON.stringify(before.latest) };
      }
      if (scenario === "orphan") {
        await new Promise((resolve, reject) => {
          const tx = db.transaction("snapshots", "readwrite"); tx.objectStore("snapshots").delete("02");
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        });
        await write(row("03"), options);
        const rows = await read("snapshots");
        return { ids: rows.map(row => row.id), retained: rows.find(row => row.retainedOrphan)?.storage.key };
      }
      if (scenario === "collision") {
        let rejected = false;
        try { await write(row("01", "replacement"), options); } catch { rejected = true; }
        return { rejected, unchanged: JSON.stringify({ history: await read("snapshots"), latest: await read("latest") }) === JSON.stringify(before) };
      }
      if (scenario === "bytes") {
        const incoming = row("03", "x".repeat(6000));
        const pairBytes = (JSON.stringify(incoming).length + JSON.stringify({ ...incoming, id: "latest", sourceSnapshotId: incoming.id }).length) * 2;
        await write(incoming, { ...options, maxSnapshots: 30, maxSnapshotBytes: pairBytes });
        const history = await read("snapshots"), latest = await read("latest");
        return { ids: history.map(row => row.id), bytes: [...history, ...latest].reduce((n, row) => n + JSON.stringify(row).length * 2, 0), pairBytes };
      }
      if (scenario === "oversized") {
        let error = "";
        try { await write(row("03", "x".repeat(40000)), options); } catch (failure) { error = failure.name; }
        return { error, unchanged: JSON.stringify({ history: await read("snapshots"), latest: await read("latest") }) === JSON.stringify(before) };
      }
      if (["abort", "quota", "request-error"].includes(scenario)) {
        const broken = { transaction(...args) {
          const tx = db.transaction(...args), objectStore = tx.objectStore.bind(tx);
          tx.objectStore = name => {
            const store = objectStore(name), add = store.add.bind(store);
            if (name === "latest" && scenario === "abort") store.put = () => { tx.abort(); throw new Error("Injected write failure"); };
            if (name === "snapshots" && scenario === "quota") store.add = () => { throw new DOMException("Injected quota failure", "QuotaExceededError"); };
            if (name === "snapshots" && scenario === "request-error") store.add = value => add({ ...value, id: "02" });
            return store;
          };
          return tx;
        } };
        let rejected = false;
        try { await write(row("03"), options, broken); } catch { rejected = true; }
        return { rejected, unchanged: JSON.stringify({ history: await read("snapshots"), latest: await read("latest") }) === JSON.stringify(before) };
      }
      await put("snapshots", [{ id: "football-session-planner-v3-quota-fallback:review", storage: { work: "protected" } }]);
      await put("latest", [{ id: "session-save:pending", status: "pending", value: "protected" }]);
      await Promise.all([write(row("03"), options), write(row("04"), options)]);
      return { ids: (await read("snapshots")).map(row => row.id), journal: (await read("latest")).find(row => row.id === "session-save:pending") };
    } finally { db.close(); indexedDB.deleteDatabase(name); }
  }, scenario);
}

for (const scenario of ["protected", "unknown", "foreign", "mismatched", "recovery", "future"]) {
  test(`rotation retains ${scenario} work and only replaces eligible history`, async ({ page }) => {
    expect(await run(page, scenario)).toEqual({ ids: ["01", "03"], retained: true });
  });
}
test("a full budget of protected work rejects the new copy without removing anything", async ({ page }) => {
  expect(await run(page, "blocked")).toEqual({ error: "SnapshotBudgetError", unchanged: true, latestUnchanged: true });
});
test("serialized byte budget includes history and the latest copy", async ({ page }) => {
  const result = await run(page, "bytes"); expect(result.ids).toEqual(["03"]); expect(result.bytes).toBe(result.pairBytes);
});
test("an individually oversized copy leaves previous history and latest intact", async ({ page }) => {
  expect(await run(page, "oversized")).toEqual({ error: "SnapshotBudgetError", unchanged: true });
});
test("failed replacement rolls back retirement as well as the new copy", async ({ page }) => {
  expect(await run(page, "abort")).toEqual({ rejected: true, unchanged: true });
});
test("competing writers respect one budget and preserve Sessions rows", async ({ page }) => {
  expect(await run(page, "concurrent")).toEqual({ ids: ["03", "04", "football-session-planner-v3-quota-fallback:review"],
    journal: { id: "session-save:pending", status: "pending", value: "protected" } });
});


test("a latest copy with missing history is retained before replacement", async ({ page }) => {
  expect(await run(page, "orphan")).toEqual({ ids: ["03", "snapshot-orphan:03"], retained: "02" });
});
test("an identity collision cannot overwrite an existing generation", async ({ page }) => {
  expect(await run(page, "collision")).toEqual({ rejected: true, unchanged: true });
});

test("repeated small edits stop snapshot growth without acknowledging or discarding pending work", async ({ page }) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { createDataSafetyRuntimeService } = await import("/src/core/data-safety-runtime-service.mjs");
    const key = "football-schedule-v1", library = "football-session-exercise-library-v1", databaseName = `qa-growth-${crypto.randomUUID()}`;
    localStorage.setItem(library, "x".repeat(8192));
    localStorage.setItem(key, "initial");
    const win = { localStorage, indexedDB, crypto, location: { href: "https://synthetic.invalid" },
      setTimeout: () => 1, clearTimeout() {}, addEventListener() {} };
    let queued = 0;
    const service = createDataSafetyRuntimeService({ win, storageConstructor: Storage, navigatorRef: {}, documentRef: document,
      snapshotDatabaseName: databaseName, maxSnapshotBytes: 128 * 1024, protectedStorageKeys: [key, library],
      getCentralStateBridge: () => ({ getReadScope: () => "owner", getStatus: () => ({}) }),
      queueCentralStateWrite: () => { queued++; return true; } });
    service.install();
    const outcomes = [];
    for (let i = 0; i < 25; i++) {
      localStorage.setItem(key, `edit-${i}`);
      outcomes.push(await service.saveSnapshot("synthetic-edit"));
    }
    const db = await service.openSnapshotDatabase();
    const read = name => new Promise(resolve => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); });
    const history = await read("snapshots"), latest = await read("latest");
    const output = { outcomes, bytes: [...history, ...latest].reduce((total, row) => total + JSON.stringify(row).length * 2, 0),
      raw: localStorage.getItem(key), queued, pending: service.readManifest().entries[key].pendingCentralSync,
      warning: service.readSnapshotDiagnostics().lastSnapshotError, databaseName, ids: history.map(row => row.id) };
    db.close(); return output;
  });
  expect(result.outcomes[0]).toBe(true);
  const firstRejected = result.outcomes.indexOf(false);
  expect(firstRejected).toBeGreaterThan(0);
  expect(result.outcomes.slice(firstRejected).every(value => value === false)).toBe(true);
  expect(result.bytes).toBeLessThanOrEqual(128 * 1024);
  expect(result).toMatchObject({ raw: "edit-24", queued: 25, pending: true });
  expect(result.warning).toContain("this snapshot was not saved");
  await page.reload();
  const retained = await page.evaluate(async databaseName => {
    const db = await new Promise(resolve => { const r = indexedDB.open(databaseName); r.onsuccess = () => resolve(r.result); });
    const rows = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); indexedDB.deleteDatabase(databaseName);
    return { ids: rows.map(row => row.id), raw: localStorage.getItem("football-schedule-v1") };
  }, result.databaseName);
  expect(retained).toEqual({ ids: result.ids, raw: "edit-24" });
});

for (const scenario of ["quota", "request-error"]) {
  test(`${scenario} after retirement restores all previous rows`, async ({ page }) => {
    expect(await run(page, scenario)).toEqual({ rejected: true, unchanged: true });
  });
}


test("large acknowledged history stays bounded after replacement", async ({ page }, testInfo) => {
  await page.goto("/medical-merge.js");
  const result = await page.evaluate(async () => {
    const { storeDistinctSnapshot } = await import("/src/core/distinct-snapshot-store.mjs");
    const name = `qa-large-history-${crypto.randomUUID()}`;
    const db = await new Promise(resolve => {
      const r = indexedDB.open(name);
      r.onupgradeneeded = () => { for (const s of ["snapshots", "latest"]) r.result.createObjectStore(s, { keyPath: "id" }); };
      r.onsuccess = () => resolve(r.result);
    });
    const library = "x".repeat(1024 * 1024);
    const hash = value => { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
    const libraryHash = hash(library);
    const row = id => ({ id, schema: "football-science-backup-v1", app: "Football Science", createdAt: id,
      storage: { library, key: id }, recoveryCopies: {}, recoveryState: {}, recoverySeparations: [],
      saveContext: { scope: "owner", entries: Object.fromEntries(["library", "key"].map(key => [key,
        { principalScope: "owner", pendingCentralSync: false, serverRevision: 1, hash: key === "library" ? libraryHash : hash(id) }])) } });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["snapshots", "latest"], "readwrite");
        for (let i = 0; i < 30; i++) tx.objectStore("snapshots").put(row(String(i).padStart(2, "0")));
        tx.objectStore("latest").put({ ...row("29"), id: "latest", sourceSnapshotId: "29" });
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
      const start = performance.now();
      await storeDistinctSnapshot(db, "snapshots", "latest", row("30"));
      const elapsedMs = performance.now() - start;
      const keys = await new Promise(resolve => { const r = db.transaction("snapshots").objectStore("snapshots").getAllKeys(); r.onsuccess = () => resolve(r.result); });
      return { elapsedMs, first: keys[0], last: keys.at(-1), count: keys.length, syntheticHistoryPayloadMiB: 30 };
    } finally { db.close(); indexedDB.deleteDatabase(name); }
  });
  await testInfo.attach("synthetic-history-timing", { body: JSON.stringify(result), contentType: "application/json" });
  console.log("Synthetic snapshot replacement timing:", JSON.stringify(result));
  expect(result).toMatchObject({ first: "01", last: "30", count: 30 });
});
