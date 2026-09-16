import { expect, test } from "@playwright/test";

const scope = "coach:org:team";
function record(id, date = "2026-09-16", owner = scope) {
  return { scope: owner, writer: "qa-writer", status: "pending", createdAt: 1,
    change: { schema: "session-date-change-v1", id, date,
      before: { session: null, tombstones: {} },
      after: { session: { date, title: id, blocks: [] }, tombstones: {} } } };
}

async function boot(page) {
  await page.route("**/qa/save-atomicity", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local save tests</title>" }));
  await page.goto("/qa/save-atomicity");
  await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    window.store = createSessionSaveStore();
  });
}

async function holdTransactions(page) {
  await page.evaluate(async () => {
    await window.store.list("initialize");
    const db = await new Promise((resolve) => { const request = indexedDB.open("football-science-data-safety-v1", 1); request.onsuccess = () => resolve(request.result); });
    window.releaseTransactionBarrier = false;
    const tx = db.transaction("latest", "readwrite"), store = tx.objectStore("latest");
    tx.oncomplete = () => db.close();
    const pump = () => { store.get("qa-barrier").onsuccess = () => { if (!window.releaseTransactionBarrier) pump(); }; };
    pump();
  });
}

test("immutable journal IDs cannot be overwritten by another account or payload", async ({ page }) => {
  await boot(page);
  const original = record("immutable");
  const result = await page.evaluate(async (original) => {
    await window.store.put(original);
    const failures = [];
    for (const next of [{ ...original, scope: "other:org:team" },
      { ...original, change: { ...original.change, after: { ...original.change.after, session: { ...original.change.after.session, title: "Changed" } } } }]) {
      try { await window.store.put(next); failures.push(false); } catch { failures.push(true); }
    }
    await window.store.put(original);
    return { failures, rows: await window.store.list(original.scope), other: await window.store.list("other:org:team") };
  }, original);
  expect(result.failures).toEqual([true, true]);
  expect(result.rows).toEqual([{ ...original, id: "session-save:immutable" }]);
  expect(result.other).toEqual([]);
});

test("journal batch failure after a successful first request rolls back every new row", async ({ page }) => {
  await boot(page);
  const existing = record("existing"), a = record("batch-a"), b = record("batch-b", "2026-09-17");
  const result = await page.evaluate(async ({ existing, a, b }) => {
    await window.store.put(existing);
    const nativeAdd = IDBObjectStore.prototype.add;
    let succeeded = 0;
    IDBObjectStore.prototype.add = function (row, ...args) {
      const request = nativeAdd.call(this, row, ...args);
      if (row.id === "session-save:batch-a") request.addEventListener("success", () => { succeeded++; });
      if (row.id === "session-save:batch-b") request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    let rejected = false;
    try { await window.store.putMany([a, b]); } catch { rejected = true; }
    finally { IDBObjectStore.prototype.add = nativeAdd; }
    return { succeeded, rejected, rows: await window.store.list(existing.scope) };
  }, { existing, a, b });
  expect(result.succeeded).toBe(1);
  expect(result.rejected).toBe(true);
  expect(result.rows).toEqual([{ ...existing, id: "session-save:existing" }]);
  await page.reload(); await boot(page);
  expect(await page.evaluate((scope) => window.store.list(scope), scope)).toEqual(result.rows);
});

test("a scoped exact-generation receipt cannot delete a newer review or another account's row", async ({ page, context }) => {
  await boot(page);
  const peer = await context.newPage(); await boot(peer);
  try {
    await page.evaluate((row) => window.store.put(row), record("receipt"));
    const [sent] = await page.evaluate((scope) => window.store.list(scope), scope);
    const review = { ...sent, status: "review", conflicts: ["Peer review"] };
    expect(await peer.evaluate(({ sent, review }) => window.store.update(sent, review), { sent, review })).toBe(true);
    const denied = await page.evaluate(async (sent) => ({
      stale: await window.store.remove(sent),
      other: await window.store.remove({ ...sent, scope: "other:org:team" }),
    }), sent);
    expect(denied).toEqual({ stale: false, other: false });
    expect(await peer.evaluate((scope) => window.store.list(scope), scope)).toEqual([review]);
    expect(await peer.evaluate((row) => window.store.remove(row), review)).toBe(true);
  } finally { await peer.close(); }
});

test("two real pages keep simultaneous different-key batches and reject a colliding immutable ID", async ({ page, context }) => {
  await boot(page);
  const peer = await context.newPage(); await boot(peer);
  try {
    await holdTransactions(page);
    // Queue both real transactions behind a held transaction, not sequential completed writes.
    await page.evaluate((row) => { window.putDone = false; window.putResult = window.store.putMany([row]).then(() => { window.putDone = true; }); }, record("page-a"));
    await peer.evaluate((row) => { window.putDone = false; window.putResult = window.store.putMany([row]).then(() => { window.putDone = true; }); }, record("page-b", "2026-09-17"));
    expect(await page.evaluate(() => window.putDone)).toBe(false);
    expect(await peer.evaluate(() => window.putDone)).toBe(false);
    await page.evaluate(() => { window.releaseTransactionBarrier = true; });
    await page.evaluate(() => window.putResult); await peer.evaluate(() => window.putResult);
    expect((await page.evaluate((scope) => window.store.list(scope), scope)).map((row) => row.change.id)).toEqual(["page-a", "page-b"]);
    const collision = record("collision"), other = record("collision", "2026-09-17", "other:org:team");
    await holdTransactions(page);
    await page.evaluate((row) => { window.collision = window.store.put(row).then(() => true, () => false); }, collision);
    await peer.evaluate((row) => { window.collision = window.store.put(row).then(() => true, () => false); }, other);
    await page.evaluate(() => { window.releaseTransactionBarrier = true; });
    const outcomes = [await page.evaluate(() => window.collision), await peer.evaluate(() => window.collision)];
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const rows = await page.evaluate(async (scope) => [...await window.store.list(scope), ...await window.store.list("other:org:team")], scope);
    expect(rows.filter((row) => row.change.id === "collision")).toHaveLength(1);
  } finally { await page.evaluate(() => { window.releaseTransactionBarrier = true; }); await peer.close(); }
});

test("review replacement and archive commit together or neither does", async ({ page }) => {
  await boot(page);
  const row = { ...record("review-a"), status: "review", conflicts: ["Title"] };
  const replacement = record("review-b");
  const result = await page.evaluate(async ({ row, replacement }) => {
    await window.store.put(row);
    const [expected] = await window.store.list(row.scope);
    const nativePut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (value.id === expected.id && value.status === "archived") throw new DOMException("Full", "QuotaExceededError");
      return nativePut.call(this, value, ...args);
    };
    let failed = false;
    try { await window.store.resolveReview(expected, replacement); } catch { failed = true; }
    finally { IDBObjectStore.prototype.put = nativePut; }
    const retained = await window.store.list(row.scope);
    const committed = await window.store.resolveReview(expected, replacement);
    const repeated = await window.store.resolveReview(expected, recordNotToBeAdded(replacement));
    function recordNotToBeAdded(value) { return { ...value, change: { ...value.change, id: "stale-review-attempt" } }; }
    return { failed, retained, committed, repeated, rows: await window.store.list(row.scope) };
  }, { row, replacement });
  expect(result.failed).toBe(true);
  expect(result.retained).toEqual([{ ...row, id: "session-save:review-a" }]);
  expect(result.committed).toBe(true);
  expect(result.repeated).toBe(false);
  expect(result.rows.map((entry) => [entry.change.id, entry.status])).toEqual([["review-a", "archived"], ["review-b", "pending"]]);
});

test("real client sends nothing when a later journal row hits quota, and can retry the full edit", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const { createSessionSaveClient } = await import("/src/modules/session-planner/session-save-client.mjs");
    const { applySessionDateChange, sessionDateValue } = await import("/src/modules/session-planner/session-save-protocol.mjs");
    let central = { sessions: {} }, revision = 1, posts = 0;
    const client = createSessionSaveClient({ store: window.store, getScope: () => "coach:org:team", send: async (change) => {
      posts++;
      const merged = applySessionDateChange(central, change);
      if (!merged.ok) throw new Error("Unexpected synthetic conflict");
      central = merged.state;
      return { ok: true, payload: { metadata: { revision: ++revision }, sessionChange: { id: change.id, date: change.date, value: sessionDateValue(central, change.date) } } };
    } });
    client.observe(JSON.stringify(central), { revision });
    const desired = { sessions: Object.fromEntries(["2026-09-16", "2026-09-17"].map((date) => [date, { date, title: "Retained edit", blocks: [] }])) };
    const nativeAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (row, ...args) {
      if (row.change?.date === "2026-09-17") throw new DOMException("Full", "QuotaExceededError");
      return nativeAdd.call(this, row, ...args);
    };
    let failed;
    try { failed = await client.save(JSON.stringify(desired)); } finally { IDBObjectStore.prototype.add = nativeAdd; }
    const afterFailure = { posts, rows: await window.store.list("coach:org:team") };
    const retried = await client.save(JSON.stringify(desired));
    return { failed, afterFailure, retried, posts, central, remaining: await window.store.list("coach:org:team") };
  });
  expect(result.failed.ok).toBe(false);
  expect(result.afterFailure).toEqual({ posts: 0, rows: [] });
  expect(result.retried.ok).toBe(true);
  expect(result.posts).toBe(2);
  expect(Object.keys(result.central.sessions)).toEqual(["2026-09-16", "2026-09-17"]);
  expect(result.remaining).toEqual([]);
});

test("empty or mixed scope batches fail without adopting legacy unscoped data", async ({ page }) => {
  await boot(page);
  const a = record("owned"), b = record("other", "2026-09-17", "other:org:team");
  const result = await page.evaluate(async ({ a, b }) => {
    const rejected = [];
    for (const rows of [[{ ...a, scope: "" }], [a, b]]) {
      try { await window.store.putMany(rows); rejected.push(false); } catch { rejected.push(true); }
    }
    await window.store.list(a.scope);
    const db = await new Promise((resolve) => { const request = indexedDB.open("football-science-data-safety-v1", 1); request.onsuccess = () => resolve(request.result); });
    const legacy = { ...a, id: `session-save:${a.change.id}` }; delete legacy.scope;
    await new Promise((resolve, reject) => {
      const tx = db.transaction("latest", "readwrite"); tx.objectStore("latest").add(legacy);
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    try { await window.store.put(a); rejected.push(false); } catch { rejected.push(true); }
    const retained = await new Promise((resolve) => { db.transaction("latest").objectStore("latest").get(legacy.id).onsuccess = (event) => resolve(event.target.result); });
    db.close();
    return { rejected, legacyUnchanged: JSON.stringify(retained) === JSON.stringify(legacy), first: await window.store.list(a.scope), other: await window.store.list(b.scope), unknown: await window.store.list("") };
  }, { a, b });
  expect(result).toEqual({ rejected: [true, true, true], legacyUnchanged: true, first: [], other: [], unknown: [] });
});

test("closing a tab before transaction completion never leaves a partially committed batch", async ({ page, context }) => {
  await boot(page);
  const existing = record("previously-committed");
  await page.evaluate((row) => window.store.put(row), existing);
  const peer = await context.newPage(); await boot(peer);
  await page.evaluate((rows) => {
    const nativeAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (row, ...args) {
      const request = nativeAdd.call(this, row, ...args);
      if (row.id === "session-save:interrupted-a") request.addEventListener("success", () => {
        window.firstRequestSucceeded = true;
        const keepActive = () => { this.get("qa-interruption").onsuccess = keepActive; };
        keepActive();
      });
      return request;
    };
    window.batchCompleted = false;
    window.store.putMany(rows).then(() => { window.batchCompleted = true; }, () => {});
  }, [record("interrupted-a"), record("interrupted-b", "2026-09-17")]);
  await page.waitForFunction(() => window.firstRequestSucceeded);
  expect(await page.evaluate(() => window.batchCompleted)).toBe(false);
  await page.close();
  try {
    expect(await peer.evaluate((scope) => window.store.list(scope), scope)).toEqual([{ ...existing, id: "session-save:previously-committed" }]);
    await peer.reload(); await boot(peer);
    expect(await peer.evaluate((scope) => window.store.list(scope), scope)).toEqual([{ ...existing, id: "session-save:previously-committed" }]);
  } finally { await peer.close(); }
});
