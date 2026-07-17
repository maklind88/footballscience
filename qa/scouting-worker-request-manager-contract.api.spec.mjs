import { expect, test } from "@playwright/test";
import { createScoutingWorkerRequestManager } from "../src/modules/scouting/index.mjs";

function createHarness() {
  let nextTimerId = 10;
  const diagnostics = [];
  const scheduled = new Map();
  const posted = [];
  const worker = {
    postMessage(payload) {
      posted.push(payload);
    },
  };
  const manager = createScoutingWorkerRequestManager({
    clearTimeout: (timerId) => scheduled.delete(timerId),
    onTimeout: (detail) => diagnostics.push(detail),
    setTimeout: (callback) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      scheduled.set(timerId, callback);
      return timerId;
    },
  });
  return {
    diagnostics,
    manager,
    posted,
    runTimer(timerId) {
      scheduled.get(timerId)?.();
    },
    worker,
  };
}

test("Scouting worker timeouts reject only the expired request and keep the worker reusable", async () => {
  const harness = createHarness();
  const expiredRequest = harness.manager.request(harness.worker, { type: "query" }, { timeoutMs: 15000 });

  expect(harness.posted[0]).toMatchObject({ requestId: 1, type: "query" });
  harness.runTimer(10);

  await expect(expiredRequest).rejects.toThrow("timed out");
  expect(harness.manager.getPendingCount()).toBe(0);
  expect(harness.diagnostics).toEqual([
    { pendingCount: 0, requestId: 1, timeoutMs: 15000, type: "query" },
  ]);

  const nextRequest = harness.manager.request(harness.worker, { type: "query" }, { timeoutMs: 15000 });
  expect(harness.posted[1]).toMatchObject({ requestId: 2, type: "query" });
  expect(harness.manager.handleMessage({ requestId: 2, type: "database", database: { source: "worker" } })).toBe(true);
  await expect(nextRequest).resolves.toEqual({ source: "worker" });
});

test("Scouting worker fatal errors reject every pending request", async () => {
  const harness = createHarness();
  const firstRequest = harness.manager.request(harness.worker, { type: "query" });
  const secondRequest = harness.manager.request(harness.worker, { type: "recordsByIds" });

  harness.manager.rejectAll(new Error("worker crashed"));

  await expect(firstRequest).rejects.toThrow("worker crashed");
  await expect(secondRequest).rejects.toThrow("worker crashed");
  expect(harness.manager.getPendingCount()).toBe(0);
});
