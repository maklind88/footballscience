import { test, expect } from "@playwright/test";
import { createRestartHarness, initial, day, rows, stage, replay, view } from "./helpers/session-restart-harness.mjs";

let harness;
test.beforeEach(async ({ baseURL, browserName }) => {
  test.skip(browserName !== "chromium", "Browser.crash is a Chromium protocol command; no WebKit crash claim");
  harness = await createRestartHarness(baseURL, browserName);
});
test.afterEach(async () => { await harness?.dispose(); harness = null; });

async function crashAndReopen(page) {
  expect(await harness.crash()).toEqual({ disconnected: true });
  expect(page.isClosed()).toBe(true);
  return harness.open();
}
const editA = () => { const value = initial(); value.sessions[day].blocks[0].objective = "Durable A"; return value; };
const editB = a => { const value = structuredClone(a); value.sessions[day].blocks[0].minutes = 45; return value; };

// Keep a real transaction uncommitted after request success. A queued read in
// each success callback keeps it active without blocking the renderer event loop.
// This is a deterministic crash boundary, not a mocked IndexedDB implementation.
async function holdTransaction(page, method) {
  await page.evaluate(method => {
    const original = IDBObjectStore.prototype[method];
    window.transactionBoundary = { requestSucceeded: false, completed: false };
    IDBObjectStore.prototype[method] = function(value, ...args) {
      const request = original.call(this, value, ...args);
      const key = typeof value === "string" ? value : value?.id;
      if (this.name === "latest" && key?.startsWith("session-save:")) {
        this.transaction.addEventListener("complete", () => { window.transactionBoundary.completed = true; });
        request.addEventListener("success", () => {
          window.transactionBoundary.requestSucceeded = true;
          const keepAlive = () => { this.get(key).addEventListener("success", keepAlive); };
          keepAlive();
        });
      }
      return request;
    };
  }, method);
}
async function awaitUncommittedRequest(page) {
  await expect.poll(() => page.evaluate(() => window.transactionBoundary.requestSucceeded)).toBe(true);
  expect(await page.evaluate(() => window.transactionBoundary.completed)).toBe(false);
}
async function startReplay(page) {
  await page.evaluate(() => { window.replayCompleted = false; void window.saveClient.replay().then(() => { window.replayCompleted = true; }); });
}

test("browser crash after local commit retains exact work before any send", async () => {
  let page = await harness.open();
  const a = editA();
  expect(await stage(page, a, initial())).toEqual({ ok: true });
  const journal = await rows(page);
  expect(journal).toHaveLength(1);
  expect(harness.state.calls).toEqual([]);
  page = await crashAndReopen(page);
  expect(await rows(page)).toEqual(journal);
  expect((await view(page)).value.sessions[day]).toEqual(a.sessions[day]);
  expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(false);
  harness.state.mode = "online";
  expect(await replay(page)).toMatchObject({ ok: true });
  expect(harness.state.calls.map(call => call.change)).toEqual([journal[0].change]);
  expect(harness.state.effects).toBe(1);
  expect(await rows(page)).toEqual([]);
});

test("browser crash during local put rolls back uncommitted work and preserves prior commit", async () => {
  let page = await harness.open();
  const a = editA();
  expect(await stage(page, a, initial())).toEqual({ ok: true });
  const journal = await rows(page);
  await holdTransaction(page, "put");
  harness.state.mode = "online";
  await page.evaluate(({ a, b }) => {
    window.saveCompleted = false;
    void window.saveClient.save(JSON.stringify(b), { previousValue: JSON.stringify(a) })
      .then(() => { window.saveCompleted = true; });
  }, { a, b: editB(a) });
  await awaitUncommittedRequest(page);
  expect(await page.evaluate(() => window.saveCompleted)).toBe(false);
  expect(harness.state.calls).toEqual([]);
  page = await crashAndReopen(page);
  expect(await rows(page)).toEqual(journal);
  expect((await view(page)).value.sessions[day]).toEqual(a.sessions[day]);
  harness.state.mode = "online";
  expect(await replay(page)).toMatchObject({ ok: true });
  expect(harness.state.calls.map(call => call.change)).toEqual([journal[0].change]);
  expect(harness.state.value.sessions[day]).toEqual(a.sessions[day]);
  expect(await rows(page)).toEqual([]);
});

test("browser crash after server commit before client receipt retries exact A and retains B", async () => {
  let page = await harness.open();
  const a = editA(), b = editB(a);
  expect(await stage(page, a, initial())).toEqual({ ok: true });
  expect(await stage(page, b, a)).toEqual({ ok: true });
  const journal = await rows(page);
  expect(journal).toHaveLength(2);
  // The real response reaches fetch, but is held before the save client can
  // inspect it. This models an unobserved receipt, not a network-server test.
  await page.evaluate(() => {
    const original = window.fetch;
    window.receiptHeld = false;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (args[1]?.method === "POST") { window.receiptHeld = true; await new Promise(() => {}); }
      return response;
    };
  });
  harness.state.mode = "online";
  await startReplay(page);
  await expect.poll(() => page.evaluate(() => window.receiptHeld)).toBe(true);
  expect(harness.state.effects).toBe(1);
  expect(await rows(page)).toEqual(journal);
  expect(await page.evaluate(() => window.replayCompleted)).toBe(false);
  page = await crashAndReopen(page);
  expect(await rows(page)).toEqual(journal);
  expect(await replay(page)).toMatchObject({ ok: true });
  expect(harness.state.calls.map(call => call.change)).toEqual([journal[0].change, journal[0].change, journal[1].change]);
  expect(harness.state.effects).toBe(2);
  expect(harness.state.value.sessions[day]).toEqual(b.sessions[day]);
  expect(await rows(page)).toEqual([]);
});

for (const committed of [false, true]) {
  test(`browser crash with receipt retirement ${committed ? "committed" : "uncommitted"} preserves later generation`, async () => {
    let page = await harness.open();
    const a = editA(), b = editB(a);
    expect(await stage(page, a, initial())).toEqual({ ok: true });
    expect(await stage(page, b, a)).toEqual({ ok: true });
    const journal = await rows(page);
    expect(journal).toHaveLength(2);
    if (committed) {
      await page.evaluate(() => {
        const remove = window.saveStore.remove;
        window.retired = false;
        window.saveStore.remove = async id => {
          await remove(id); window.retired = true;
          await new Promise(() => {});
        };
      });
    } else await holdTransaction(page, "delete");
    harness.state.mode = "online";
    await startReplay(page);
    if (committed) {
      await expect.poll(() => page.evaluate(() => window.retired)).toBe(true);
      expect(await rows(page)).toEqual([journal[1]]);
    } else await awaitUncommittedRequest(page);
    expect(harness.state.calls.map(call => call.change)).toEqual([journal[0].change]);
    expect(harness.state.effects).toBe(1);
    expect(await page.evaluate(() => window.replayCompleted)).toBe(false);
    page = await crashAndReopen(page);
    expect(await rows(page)).toEqual(committed ? [journal[1]] : journal);
    expect((await view(page)).value.sessions[day]).toEqual(b.sessions[day]);
    expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(false);
    expect(await replay(page)).toMatchObject({ ok: true });
    expect(harness.state.calls.map(call => call.change)).toEqual(committed
      ? [journal[0].change, journal[1].change] : [journal[0].change, journal[0].change, journal[1].change]);
    expect(harness.state.effects).toBe(2);
    expect(harness.state.value.sessions[day]).toEqual(b.sessions[day]);
    expect(await rows(page)).toEqual([]);
    expect(await page.evaluate(() => window.saveClient.isSettled())).toBe(true);
  });
}
