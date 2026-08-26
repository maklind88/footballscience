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
    apiSignals: [],
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
    loadApiDatabase: (options = {}) => {
      calls.loadedApi += 1;
      calls.apiSignals.push(options.signal || null);
      return overrides.loadApiResults?.[calls.loadedApi - 1] || overrides.loadApiResult || Promise.resolve({ source: "api" });
    },
    loadFootballScienceDbDatabase: (options = {}) => {
      calls.loadedFsdb += 1;
      calls.apiSignals.push(options.signal || null);
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
  expect(apiHarness.calls.setApiTimers).toEqual([0, 20]);
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

  expect(harness.calls.requestedWorkers[0]).toMatchObject({ timeoutMs: 45000 });
  expect(harness.calls.requestedWorkers[0].signal).toBeInstanceOf(AbortSignal);
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
  expect(harness.calls.requestedWorkers[0].signal.aborted).toBe(true);
  expect(harness.calls.requestedWorkers[1].signal.aborted).toBe(false);
});

test("Scouting database refresh controller aborts superseded API requests", async () => {
  let rejectFirst;
  const firstResult = new Promise((_resolve, reject) => {
    rejectFirst = reject;
  });
  const harness = createHarness({
    source: "api",
    loadApiResults: [firstResult, Promise.resolve({ source: "api", marker: "new" })],
  });

  harness.controller.scheduleRefresh();
  harness.runTimer(20);
  harness.controller.scheduleRefresh();
  expect(harness.calls.apiSignals[0].aborted).toBe(true);
  rejectFirst(new DOMException("cancelled", "AbortError"));
  harness.runTimer(21);
  await flushMicrotasks();

  expect(harness.calls.loadedApi).toBe(2);
  expect(harness.calls.apiSignals[1].aborted).toBe(false);
  expect(harness.calls.renderedResults).toBe(1);
  expect(harness.calls.refreshStatuses).toContainEqual({ revision: 2, source: "api", status: "loaded" });
});

test("Scouting database refresh controller cancels scheduled and rendered work", () => {
  const harness = createHarness({ apiRefreshTimer: 7, resultsFrame: 44, source: "api" });

  const result = harness.controller.cancel();

  expect(result).toEqual({ revision: 1, status: "cancelled" });
  expect(harness.calls.clearedTimers).toEqual([7]);
  expect(harness.calls.cancelledFrames).toEqual([44]);
  expect(harness.calls.setApiTimers).toEqual([0]);
  expect(harness.calls.setFrames).toEqual([0]);
  expect(harness.calls.refreshStatuses).toContainEqual({ revision: 1, source: "api", status: "cancelled" });
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
