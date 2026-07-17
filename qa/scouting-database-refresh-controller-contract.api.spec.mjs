import { expect, test } from "@playwright/test";
import { createScoutingDatabaseRefreshController } from "../src/modules/scouting/index.mjs";

function createHarness(overrides = {}) {
  let apiRefreshTimer = overrides.apiRefreshTimer || 0;
  let resultsFrame = overrides.resultsFrame || 0;
  let nextTimerId = 20;
  let nextFrameId = 50;
  const frames = new Map();
  const timers = new Map();
  const state = {
    activeTab: overrides.activeTab || "database",
  };
  const calls = {
    appliedWorkers: [],
    cancelledFrames: [],
    clearedTimers: [],
    loadedApi: 0,
    loadedFsdb: 0,
    perf: [],
    refreshStatuses: [],
    renderedResults: 0,
    requestedWorkers: [],
    setApiTimers: [],
    setFrames: [],
    timers: [],
  };
  const controller = createScoutingDatabaseRefreshController({
    applyWorkerDatabase: (database) => {
      calls.appliedWorkers.push(database);
      return overrides.workerApplyResult === undefined ? database : overrides.workerApplyResult;
    },
    cancelAnimationFrame: (frame) => {
      calls.cancelledFrames.push(frame);
      frames.delete(frame);
    },
    clearTimeout: (timer) => {
      calls.clearedTimers.push(timer);
      timers.delete(timer);
    },
    ensureState: () => state,
    getApiRefreshTimer: () => apiRefreshTimer,
    getResultsFrame: () => resultsFrame,
    isApiDatabaseActive: () => overrides.source === "api",
    isFootballScienceDbDatabaseActive: () => overrides.source === "fsdb",
    isWorkerDatabaseActive: () => overrides.source === "worker",
    loadApiDatabase: () => {
      calls.loadedApi += 1;
      return overrides.loadApiResult || Promise.resolve({ source: "api" });
    },
    loadFootballScienceDbDatabase: () => {
      calls.loadedFsdb += 1;
      return overrides.loadFsdbResult || Promise.resolve({ source: "fsdb" });
    },
    onRefreshStatus: (status) => calls.refreshStatuses.push(status),
    renderResults: () => {
      calls.renderedResults += 1;
    },
    requestAnimationFrame: (callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frames.set(frameId, callback);
      return frameId;
    },
    requestWorkerQuery: (payload) => {
      calls.requestedWorkers.push(payload);
      const requestIndex = calls.requestedWorkers.length - 1;
      return overrides.workerResults?.[requestIndex] || overrides.workerResult || Promise.resolve({ source: "worker" });
    },
    setApiRefreshTimer: (timer) => {
      apiRefreshTimer = timer || 0;
      calls.setApiTimers.push(apiRefreshTimer);
    },
    setResultsFrame: (frame) => {
      resultsFrame = frame || 0;
      calls.setFrames.push(resultsFrame);
    },
    setTimeout: (callback, delayMs) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, callback);
      calls.timers.push({ delayMs, timerId });
      return timerId;
    },
    startPerformance: (label, detail) => {
      const entry = { label, detail, ended: null };
      calls.perf.push(entry);
      return {
        end(endDetail) {
          entry.ended = endDetail || {};
        },
      };
    },
  });
  return {
    calls,
    controller,
    runFrame(frameId) {
      frames.get(frameId)?.();
    },
    runTimer(timerId) {
      timers.get(timerId)?.();
    },
    state,
  };
}

async function flushMicrotasks(count = 4) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

test("Scouting database refresh controller schedules local result renders with one animation frame", () => {
  const harness = createHarness({ resultsFrame: 44 });

  const result = harness.controller.scheduleRefresh();

  expect(result).toEqual({ mode: "local", status: "scheduled" });
  expect(harness.calls.cancelledFrames).toEqual([44]);
  expect(harness.calls.setFrames).toEqual([50]);

  harness.runFrame(50);

  expect(harness.calls.setFrames).toEqual([50, 0]);
  expect(harness.calls.renderedResults).toBe(1);
  expect(harness.calls.perf[0]).toMatchObject({ label: "database.results-render", ended: {} });
});

test("Scouting database refresh controller debounces API and FSDB refreshes", async () => {
  const apiHarness = createHarness({ apiRefreshTimer: 7, source: "api" });

  expect(apiHarness.controller.scheduleRefresh()).toEqual({ delayMs: 260, mode: "api", status: "scheduled" });
  expect(apiHarness.calls.clearedTimers).toEqual([7]);
  expect(apiHarness.calls.setApiTimers).toEqual([20]);
  apiHarness.runTimer(20);
  await flushMicrotasks();

  expect(apiHarness.calls.loadedApi).toBe(1);
  expect(apiHarness.calls.renderedResults).toBe(1);
  expect(apiHarness.calls.perf[0]).toMatchObject({ label: "database.refresh", detail: { source: "api" }, ended: { status: "loaded" } });

  const fsdbHarness = createHarness({ source: "fsdb" });

  expect(fsdbHarness.controller.scheduleRefresh()).toEqual({ delayMs: 260, mode: "fsdb", status: "scheduled" });
  fsdbHarness.runTimer(20);
  await flushMicrotasks();

  expect(fsdbHarness.calls.loadedFsdb).toBe(1);
  expect(fsdbHarness.calls.renderedResults).toBe(1);
});

test("Scouting database refresh controller refreshes worker sources and falls back to local render", async () => {
  const harness = createHarness({ source: "worker", workerApplyResult: null });

  expect(harness.controller.scheduleRefresh()).toEqual({ delayMs: 80, mode: "worker", status: "scheduled" });
  harness.runTimer(20);
  await flushMicrotasks();

  expect(harness.calls.requestedWorkers).toEqual([{ timeoutMs: 45000 }]);
  expect(harness.calls.appliedWorkers).toEqual([{ source: "worker" }]);
  expect(harness.calls.renderedResults).toBe(0);
  expect(harness.calls.perf[0]).toMatchObject({ label: "database.refresh", detail: { source: "worker" }, ended: { status: "fallback" } });
  expect(harness.calls.setFrames).toEqual([50]);
  harness.runFrame(50);
  expect(harness.calls.renderedResults).toBe(1);
});

test("Scouting database refresh controller ignores stale worker results", async () => {
  let resolveFirst;
  let resolveSecond;
  const firstResult = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const secondResult = new Promise((resolve) => {
    resolveSecond = resolve;
  });
  const harness = createHarness({ source: "worker", workerResults: [firstResult, secondResult] });

  harness.controller.scheduleRefresh();
  harness.runTimer(20);
  harness.controller.scheduleRefresh();
  harness.runTimer(21);

  resolveSecond({ source: "worker", marker: "new" });
  await flushMicrotasks();
  resolveFirst({ source: "worker", marker: "old" });
  await flushMicrotasks();

  expect(harness.calls.appliedWorkers).toEqual([{ source: "worker", marker: "new" }]);
  expect(harness.calls.renderedResults).toBe(1);
  expect(harness.calls.perf.map((entry) => entry.ended?.status).sort()).toEqual(["loaded", "stale"]);
  expect(harness.calls.refreshStatuses).toContainEqual({ revision: 2, source: "worker", status: "loaded" });
});

test("Scouting database refresh controller avoids stale renders after leaving Database", async () => {
  const harness = createHarness({ source: "api" });

  harness.controller.scheduleRefresh();
  harness.state.activeTab = "lists";
  harness.runTimer(20);
  await flushMicrotasks();

  expect(harness.calls.loadedApi).toBe(1);
  expect(harness.calls.renderedResults).toBe(0);
  expect(harness.calls.perf[0]).toMatchObject({ ended: { status: "loaded" } });
});
