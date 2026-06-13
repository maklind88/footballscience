import { expect, test } from "@playwright/test";
import { createScoutingDatabaseBackgroundController } from "../src/modules/scouting/index.mjs";

function createHarness(overrides = {}) {
  let nextTimerId = 10;
  const scheduled = new Map();
  const state = {
    activeTab: overrides.activeTab || "database",
    databaseFilters: {
      source: overrides.source || "local",
    },
  };
  const calls = {
    clears: [],
    prewarmFullWorker: 0,
    prewarmWorker: 0,
    queuedLoads: [],
    refreshes: 0,
    renders: [],
    timers: [],
  };
  const controller = createScoutingDatabaseBackgroundController({
    clearTimeout: (timerId) => {
      calls.clears.push(timerId || 0);
      scheduled.delete(timerId);
    },
    ensureState: () => state,
    getAdvancedFiltersOpen: () => overrides.advancedFiltersOpen === true,
    getDatabaseError: () => overrides.databaseError || "",
    hasOpenOverlay: () => overrides.openOverlay === true,
    isDatabaseLoaded: () => overrides.databaseLoaded === true,
    isDatabaseLoading: () => overrides.databaseLoading === true,
    isWorkerDatabaseActive: () => overrides.workerDatabaseActive !== false,
    normalizeDatabaseFilters: (filters = {}) => ({ source: "local", ...filters }),
    prewarmFullWorker: () => {
      calls.prewarmFullWorker += 1;
    },
    prewarmWorker: () => {
      calls.prewarmWorker += 1;
    },
    queueDatabaseLoad: (onReady) => calls.queuedLoads.push(onReady),
    renderActiveTabSurfaceOrWorkspace: (options) => calls.renders.push(options),
    scheduleDatabaseRefresh: () => {
      calls.refreshes += 1;
    },
    setTimeout: (callback, delayMs) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      scheduled.set(timerId, callback);
      calls.timers.push({ delayMs, timerId });
      return timerId;
    },
  });
  return {
    calls,
    controller,
    runTimer(timerId) {
      scheduled.get(timerId)?.();
    },
    state,
  };
}

test("Scouting database background controller autoloads only active local Database views", () => {
  const harness = createHarness();

  harness.controller.scheduleAutoLoad("12.9");
  expect(harness.calls.clears).toEqual([0]);
  expect(harness.calls.timers).toEqual([{ delayMs: 12, timerId: 10 }]);

  harness.runTimer(10);

  expect(harness.controller.getTimerIds().autoLoadTimer).toBe(0);
  expect(harness.calls.queuedLoads).toHaveLength(1);

  harness.calls.queuedLoads[0]({ preserveFocus: true });
  expect(harness.calls.renders).toEqual([{ preserveFocus: true }]);
});

test("Scouting database background controller guards autoload when the source or state is unsafe", () => {
  const fsdbHarness = createHarness({ source: "fsdb" });
  fsdbHarness.controller.scheduleAutoLoad(0);
  fsdbHarness.runTimer(10);
  expect(fsdbHarness.calls.queuedLoads).toEqual([]);

  const loadedHarness = createHarness({ databaseLoaded: true });
  loadedHarness.controller.scheduleAutoLoad(0);
  loadedHarness.runTimer(10);
  expect(loadedHarness.calls.queuedLoads).toEqual([]);

  const inactiveHarness = createHarness();
  inactiveHarness.controller.scheduleAutoLoad(0);
  inactiveHarness.state.activeTab = "lists";
  inactiveHarness.runTimer(10);
  expect(inactiveHarness.calls.queuedLoads).toEqual([]);
});

test("Scouting database background controller gates worker prewarm and full refresh", () => {
  const harness = createHarness();

  harness.controller.scheduleWorkerPrewarm(25);
  harness.controller.scheduleFullWorkerPreload(30);
  harness.controller.scheduleWorkerFullRefresh(35);

  expect(harness.calls.timers).toEqual([
    { delayMs: 25, timerId: 10 },
    { delayMs: 30, timerId: 11 },
    { delayMs: 35, timerId: 12 },
  ]);

  harness.runTimer(10);
  harness.runTimer(11);
  harness.runTimer(12);

  expect(harness.calls.prewarmWorker).toBe(1);
  expect(harness.calls.prewarmFullWorker).toBe(1);
  expect(harness.calls.refreshes).toBe(1);

  const guardedHarness = createHarness({ activeTab: "database", advancedFiltersOpen: true });
  guardedHarness.controller.scheduleWorkerFullRefresh(0);
  guardedHarness.runTimer(10);
  expect(guardedHarness.calls.refreshes).toBe(0);
});

test("Scouting database background controller cancels and replaces queued timers", () => {
  const harness = createHarness();

  harness.controller.scheduleAutoLoad(100);
  harness.controller.scheduleAutoLoad(200);
  harness.controller.scheduleWorkerPrewarm(300);

  expect(harness.calls.clears).toEqual([0, 10, 0]);
  expect(harness.controller.getTimerIds()).toMatchObject({
    autoLoadTimer: 11,
    workerPreloadTimer: 12,
  });

  harness.controller.cancel();

  expect(harness.calls.clears.slice(-4)).toEqual([11, 12, 0, 0]);
  expect(harness.controller.getTimerIds()).toEqual({
    autoLoadTimer: 0,
    workerPreloadTimer: 0,
    workerFullPreloadTimer: 0,
    workerFullRefreshTimer: 0,
  });
});
