import { expect, test } from "@playwright/test";
import { createCentralAppStateReloadService } from "../src/core/central-app-state-reload-service.mjs";

function harness(hydrate) {
  let now = 100000, user = { id: "actor-a", teamId: "team-a" }, readScope = "org-a", nextTimer = 0;
  const timers = new Map(), calls = [], documentRef = { visibilityState: "visible", hasFocus: () => true };
  const service = createCentralAppStateReloadService({ documentRef,
    getRefreshNow: () => now, getCurrentPlatformUser: () => user,
    getCentralStateBridge: () => ({ getReadScope: () => readScope, hydrate: () => { calls.push("read"); return hydrate(); } }),
    hasPendingCentralStateWrites: () => true,
    retryCentral: () => calls.push("retry-writes"), queueCentralStateStatus: () => calls.push("error"),
    win: { setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) },
  });
  return { service, timers, calls, documentRef, advance: ms => { now += ms; }, setUser: value => { user = value; },
    setReadScope: value => { readScope = value; },
    async tick() { const [id, timer] = [...timers][0]; timers.delete(id); now += timer.delay; await timer.fn(); },
  };
}

for (const failure of ["false", "rejection", "throw"]) {
  test(`failed central read retries before the success throttle (${failure})`, async () => {
    let first = true;
    const h = harness(() => {
      if (!first) return Promise.resolve(true);
      first = false;
      if (failure === "throw") throw new Error("offline");
      return failure === "false" ? Promise.resolve(false) : Promise.reject(new Error("offline"));
    });
    await h.service.refreshCentralStateFromSource("focus");
    expect(h.calls).not.toContain("retry-writes");
    expect([...h.timers.values()].map(timer => timer.delay)).toEqual([5000]);
    await h.tick();
    expect(h.calls.filter(value => value === "read")).toHaveLength(2);
    expect(h.calls).toContain("retry-writes");
    expect(h.timers.size).toBe(0);
    await h.service.refreshCentralStateFromSource("focus");
    expect(h.calls.filter(value => value === "read")).toHaveLength(2);
  });
}

test("automatic read retries back off and stop after three retries", async () => {
  const h = harness(() => Promise.resolve(false));
  await h.service.refreshCentralStateFromSource("focus");
  for (const delay of [5000, 10000, 20000]) {
    expect([...h.timers.values()][0].delay).toBe(delay);
    await h.tick();
  }
  expect(h.calls.filter(value => value === "read")).toHaveLength(4);
  expect(h.timers.size).toBe(0);
});

test("manual lifecycle events cannot multiply a failed read during backoff", async () => {
  const h = harness(() => Promise.resolve(false));
  await h.service.refreshCentralStateFromSource("focus");
  h.advance(1000);
  await h.service.refreshCentralStateFromSource("visibility");
  expect(h.calls.filter(value => value === "read")).toHaveLength(1);
  expect(h.timers.size).toBe(1);
});

test("a queued retry cannot cross an account or team change", async () => {
  const h = harness(() => Promise.resolve(false));
  await h.service.refreshCentralStateFromSource("focus");
  h.setUser({ id: "actor-a", teamId: "team-b" });
  await h.tick();
  expect(h.calls.filter(value => value === "read")).toHaveLength(1);
  expect(h.timers.size).toBe(0);
});

test("a read finishing after account change does not replay pending writes", async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const request = h.service.refreshCentralStateFromSource("focus");
  await Promise.resolve();
  h.setUser({ id: "actor-b" });
  finish(true);
  await request;
  expect(h.calls).not.toContain("retry-writes");
});

test("a queued retry cannot cross an organization claim change with the same profile", async () => {
  const h = harness(() => Promise.resolve(false));
  await h.service.refreshCentralStateFromSource("focus");
  h.setReadScope("org-b");
  await h.tick();
  expect(h.calls.filter(value => value === "read")).toHaveLength(1);
});

test("a read finishing after an organization claim change does not replay writes", async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const request = h.service.refreshCentralStateFromSource("focus");
  await Promise.resolve();
  h.setReadScope("org-b");
  finish(true);
  await request;
  expect(h.calls).not.toContain("retry-writes");
});

test("the previous organization's successful read cannot throttle a new organization", async () => {
  const h = harness(() => Promise.resolve(true));
  await h.service.refreshCentralStateFromSource("focus");
  h.setReadScope("org-b");
  await h.service.refreshCentralStateFromSource("focus");
  expect(h.calls.filter(value => value === "read")).toHaveLength(2);
});

test("a queued retry does not read while hidden", async () => {
  const h = harness(() => Promise.resolve(false));
  await h.service.refreshCentralStateFromSource("focus");
  h.documentRef.visibilityState = "hidden";
  await h.tick();
  expect(h.calls.filter(value => value === "read")).toHaveLength(1);
});

test("a successful read keeps normal throttling and allows a later refresh", async () => {
  const h = harness(() => Promise.resolve(true));
  await h.service.refreshCentralStateFromSource("focus");
  h.advance(1000);
  await h.service.refreshCentralStateFromSource("focus");
  expect(h.calls.filter(value => value === "read")).toHaveLength(1);
  h.advance(30000);
  await h.service.refreshCentralStateFromSource("focus");
  expect(h.calls.filter(value => value === "read")).toHaveLength(2);
});
