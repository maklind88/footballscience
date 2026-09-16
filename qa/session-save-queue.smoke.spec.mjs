import { expect, test } from "@playwright/test";

async function boot(page) {
  await page.route("**/qa/session-queue-proof", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Queue proof</title>" }));
  await page.goto("/qa/session-queue-proof");
  await page.evaluate(async () => {
    const { createSessionSaveQueueStore } = await import("/src/modules/session-planner/session-save-queue-store.mjs");
    const { createSessionDateChanges } = await import("/src/modules/session-planner/session-save-protocol.mjs");
    window.store = createSessionSaveQueueStore(); window.makeStore = createSessionSaveQueueStore;
    window.row = (id, title, previous = "Original", extra = {}) => {
      const date = extra.date || "2026-09-16";
      const state = (text) => ({ sessions: { [date]: { date, title: text, blocks: [{ id: "a", title: "Press" }] } } });
      return { scope: "actor:org:team", writer: "tab-a", status: "pending", createdAt: Date.now() * 1000,
        change: createSessionDateChanges(state(previous), state(title), () => id)[0], ...extra };
    };
    window.list = () => window.store.list("actor:org:team");
  });
}
const rows = (page) => page.evaluate(() => window.list());

test("18 durable text edits compact to one row, retain IDs and survive reload", async ({ page }) => {
  await boot(page);
  const original = await page.evaluate(async () => {
    let previous = "Original", first;
    for (let i = 0; i < 18; i++) {
      const row = window.row(`edit-${i}`, `Title ${i}`, previous); first ||= row;
      await window.store.putMany([row]); previous = `Title ${i}`;
    }
    return first;
  });
  const [compacted] = await rows(page);
  expect(compacted).toMatchObject({ attempted: false, ordinal: 1, change: { id: "edit-17", before: { session: { title: "Original" } }, after: { session: { title: "Title 17" } } } });
  await page.reload(); await boot(page);
  expect(await rows(page)).toEqual([compacted]);
  expect(await page.evaluate((original) => window.store.putMany([original]), original)).toBe(true);
  expect(await rows(page)).toEqual([compacted]);
  expect(await page.evaluate(async (original) => {
    original.change.after.session.title = "Changed immutable ID";
    try { await window.store.putMany([original]); return false; } catch { return true; }
  }, original)).toBe(true);
});

test("two real pages preserve different keys with serialized ordinal allocation", async ({ page, context }) => {
  await boot(page); const peer = await context.newPage(); await boot(peer);
  const write = (target, day) => target.evaluate(async (date) => {
    const jobs = [];
    for (let i = 0; i < 16; i++) jobs.push(window.store.putMany([window.row(`${date}-${i}`, `Edit ${i}`, "Original", { date, writer: `${date}-${i}`, createdAt: 100 - i })]));
    await Promise.all(jobs);
  }, day);
  // Both pages issue independent IDB transactions concurrently.
  const a = write(page, "2026-09-16"), b = write(peer, "2026-09-17"); await a; await b;
  const all = await rows(page); expect(all).toHaveLength(32);
  expect(new Set(all.map((row) => row.ordinal)).size).toBe(32);
  expect(all.map((row) => row.ordinal)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  expect(await rows(peer)).toEqual(all); await peer.close();
});

test("claim is durable before delivery and attempted A never compacts with newer text", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    await window.store.putMany([window.row("a", "A")]);
    return window.store.withReplay("actor:org:team", async () => {
      const iterator = window.store.replayRows("actor:org:team"); const a = (await iterator.next()).value;
      const durable = await window.list();
      await window.store.putMany([window.row("b", "B", "A")]);
      await window.store.putMany([window.row("c", "C", "B")]);
      const queued = await window.list();
      await window.store.remove(a, { revision: 11 }); const c = (await iterator.next()).value;
      await window.store.remove(c, { revision: 12 }); return { a, durable, queued, c, remaining: await window.list(), confirmed: await window.store.confirmedRevision("actor:org:team") };
    });
  });
  expect(result.durable).toEqual([result.a]); expect(result.a.attempted).toBe(true);
  expect(result.queued.map((row) => row.change.id)).toEqual(["a", "c"]);
  expect(result.c).toMatchObject({ attempted: true, change: { before: { session: { title: "A" } }, after: { session: { title: "C" } } } });
  expect(result.remaining).toEqual([]);
  expect(result.confirmed).toBe(12);
});

for (const phase of ["stage", "claim", "ack"]) test(`IDB ${phase} abort preserves the whole prior transaction`, async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.store.putMany([window.row("a", "A")]));
  const result = await page.evaluate(async (phase) => {
    const before = await window.list();
    const verb = phase === "stage" ? "add" : phase === "claim" ? "put" : "delete";
    const original = IDBObjectStore.prototype[verb];
    let armed = false;
    IDBObjectStore.prototype[verb] = function (...args) {
      const request = original.apply(this, args);
      if (armed && this.name === "operations") request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    let failed = false, claimed;
    try {
      if (phase === "stage") { armed = true; await window.store.putMany([window.row("b", "B", "A")]); }
      else await window.store.withReplay("actor:org:team", async () => {
        armed = phase === "claim";
        claimed = (await window.store.replayRows("actor:org:team").next()).value;
        armed = true;
        if (phase === "ack") await window.store.remove(claimed, { revision: 11 });
      });
    } catch { failed = true; }
    finally { IDBObjectStore.prototype[verb] = original; }
    return { before, failed, claimed, after: await window.list(), confirmed: await window.store.confirmedRevision("actor:org:team") };
  }, phase);
  expect(result.failed).toBe(true);
  expect(result.confirmed).toBe(0);
  expect(result.after).toEqual(phase === "ack" ? [result.claimed] : result.before);
});

test("multirow ID collision aborts every new row and ordinal in the batch", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    await window.store.putMany([window.row("a", "A")]); const before = await window.list();
    try { await window.store.putMany([window.row("b", "B"), window.row("a", "Conflict")]); } catch {}
    const after = await window.list();
    await window.store.putMany([window.row("c", "C", "Original", { writer: "other" })]);
    return { before, after, final: await window.list() };
  });
  expect(result.after).toEqual(result.before); expect(result.final[1].ordinal).toBe(2);
});

test("another tab cannot claim concurrently; closing owner releases browser lock", async ({ page, context }) => {
  await boot(page); const peer = await context.newPage(); await boot(peer);
  await page.evaluate(async () => {
    await window.store.putMany([window.row("a", "A")]);
    window.held = window.store.withReplay("actor:org:team", async () => {
      window.claimed = (await window.store.replayRows("actor:org:team").next()).value;
      await new Promise(() => {});
    });
  });
  await expect.poll(() => page.evaluate(() => Boolean(window.claimed))).toBe(true);
  await peer.evaluate(() => { window.replay = window.store.withReplay("actor:org:team", async () => { window.received = (await window.store.replayRows("actor:org:team").next()).value; }); });
  await expect.poll(() => peer.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
  expect(await peer.evaluate(() => window.received || null)).toBeNull();
  const [claimed] = await rows(page); await page.close();
  await peer.evaluate(() => window.replay);
  expect(await peer.evaluate(() => window.received)).toEqual(claimed); await peer.close();
});

test("missing Web Locks and unowned direct claim cannot send or discard durable rows", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    await window.store.putMany([window.row("a", "A")]); const before = await window.list();
    let sends = 0, denied = 0;
    try { await window.makeStore({ locks: null }).withReplay("actor:org:team", () => { sends++; }); } catch { denied++; }
    try { await window.store.replayRows("actor:org:team").next(); } catch { denied++; }
    try { await window.store.remove(before[0]); } catch { denied++; }
    return { before, after: await window.list(), sends, denied };
  });
  expect(result.after).toEqual(result.before); expect(result).toMatchObject({ sends: 0, denied: 3 });
});

test("review CAS protects newer rows and resolved replacements receive a new immutable ID", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    await window.store.putMany([window.row("a", "Local")]);
    return window.store.withReplay("actor:org:team", async () => {
      const a = (await window.store.replayRows("actor:org:team").next()).value;
      const review = { ...a, status: "review", conflicts: ["Colleague edit"] };
      await window.store.update(a, review); const staleAck = await window.store.remove(a, { revision: 11 });
      const changed = await window.store.resolveReview(review, window.row("resolved", "Local", "Colleague"));
      const replacement = (await window.store.replayRows("actor:org:team").next()).value;
      await window.store.remove(replacement, { revision: 12 });
      await window.store.putMany([window.row("resolved", "Local", "Colleague", { createdAt: replacement.createdAt })]);
      return { staleAck, changed, replacement, remaining: await window.list() };
    });
  });
  expect(result.staleAck).toBe(false); expect(result.changed).toBe(true);
  expect(result.replacement.change.id).toBe("resolved");
  expect(result.remaining).toHaveLength(1); expect(result.remaining[0].status).toBe("archived");
});

test("v1 pending data stays separate and legacy recovery never silently adopts it", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const { createSessionSaveStore } = await import("/src/modules/session-planner/session-save-store.mjs");
    const legacy = createSessionSaveStore(), row = window.row("legacy", "Keep legacy");
    await legacy.putMany([row]); const before = await legacy.list(row.scope);
    let denied = false; try { await window.store.archiveLocal("old data"); } catch { denied = true; }
    return { before, after: await legacy.list(row.scope), queue: await window.list(), denied };
  });
  expect(result.after).toEqual(result.before); expect(result.queue).toEqual([]); expect(result.denied).toBe(true);
});

test("bounded ownership wait retains draft and cannot steal a live owner's lock", async ({ page, context }) => {
  await boot(page); const peer = await context.newPage(); await boot(peer);
  await page.evaluate(async () => {
    await window.store.putMany([window.row("a", "A")]);
    window.hold = window.store.withReplay("actor:org:team", async () => { window.owner = true; await new Promise((resolve) => { window.release = resolve; }); });
  });
  await expect.poll(() => page.evaluate(() => window.owner)).toBe(true);
  await peer.clock.install(); await peer.clock.pauseAt(new Date());
  await peer.evaluate(() => { window.waiting = window.store.withReplay("actor:org:team", () => { window.stolen = true; }).then(() => "sent", () => "retained"); });
  await peer.clock.runFor(15001);
  expect(await peer.evaluate(() => window.waiting)).toBe("retained"); expect(await peer.evaluate(() => Boolean(window.stolen))).toBe(false);
  expect((await rows(peer))[0].attempted).toBe(false);
  await page.evaluate(() => window.release()); await page.evaluate(() => window.hold);
  expect(await peer.evaluate(() => window.store.withReplay("actor:org:team", () => true))).toBe(true); await peer.close();
});

test("corrupt persistent queue ordering fails closed without removing its payload", async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    await window.store.putMany([window.row("a", "Retain raw")]);
    const db = await new Promise((resolve) => { const request = indexedDB.open("football-science-session-outbox-v2", 1); request.onsuccess = () => resolve(request.result); });
    const [original] = await window.list(), corrupt = { ...original, ordinal: "unknown" };
    await new Promise((resolve) => { const tx = db.transaction("operations", "readwrite"); tx.objectStore("operations").put(corrupt); tx.oncomplete = resolve; });
    let denied = false;
    try { await window.store.withReplay(original.scope, () => window.store.replayRows(original.scope).next()); } catch { denied = true; }
    const retained = await new Promise((resolve) => { const request = db.transaction("operations").objectStore("operations").get(original.id); request.onsuccess = () => resolve(request.result); });
    db.close(); return { denied, retained, corrupt };
  });
  expect(result.denied).toBe(true); expect(result.retained).toEqual(result.corrupt);
});
