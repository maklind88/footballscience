import { expect, test } from "@playwright/test";
import { createScoutingDatabaseLoader } from "../src/modules/scouting/index.mjs";

function createHarness(options = {}) {
  const state = {
    databaseFilters: { source: options.source || "local" },
  };
  let database = options.database || null;
  const calls = {
    errors: [],
    loads: [],
    renders: [],
    resetCaches: 0,
    clearedOptions: 0,
  };
  const loader = createScoutingDatabaseLoader({
    clearDatabaseOptionCache: () => {
      calls.clearedOptions += 1;
    },
    ensureState: () => state,
    getDatabase: () => database,
    isDatabaseLoaded: () => Boolean(database),
    loadBySource: (filters) => {
      calls.loads.push(filters.source);
      const result = options.loadBySource?.(filters, {
        setDatabase(nextDatabase) {
          database = nextDatabase;
        },
      });
      return result;
    },
    normalizeDatabaseFilters: (filters = {}) => ({ source: "local", ...filters }),
    renderWorkspace: (renderOptions) => calls.renders.push(renderOptions),
    resetComputedCaches: () => {
      calls.resetCaches += 1;
    },
    setDatabaseError: (message) => calls.errors.push(message || ""),
  });
  return {
    calls,
    loader,
    setDatabase(nextDatabase) {
      database = nextDatabase;
    },
    state,
  };
}

test("Scouting database loader returns existing databases without starting a load", async () => {
  const harness = createHarness({ database: { source: "local", records: [] } });

  await expect(harness.loader.ensureLoaded()).resolves.toEqual({ source: "local", records: [] });

  expect(harness.loader.isLoading()).toBe(false);
  expect(harness.calls.loads).toEqual([]);
  expect(harness.calls.errors).toEqual([]);
});

test("Scouting database loader resets stale source promises before FSDB loads", async () => {
  const pending = new Promise(() => {});
  const harness = createHarness({
    source: "local",
    loadBySource: (filters, api) => {
      if (filters.source === "local") {
        return pending;
      }
      api.setDatabase({ source: "fsdb", records: [{ id: "fsdb-1" }] });
      return Promise.resolve();
    },
  });

  const firstLoad = harness.loader.ensureLoaded();
  expect(harness.loader.isLoading()).toBe(true);
  expect(harness.loader.getLoadSource()).toBe("local");

  harness.state.databaseFilters.source = "fsdb";
  const secondLoad = harness.loader.ensureLoaded();

  await expect(secondLoad).resolves.toEqual({ source: "fsdb", records: [{ id: "fsdb-1" }] });
  expect(firstLoad).toBeInstanceOf(Promise);
  expect(harness.calls.loads).toEqual(["local", "fsdb"]);
  expect(harness.loader.isLoading()).toBe(false);
  expect(harness.loader.getLoadSource()).toBe("");
  expect(harness.calls.clearedOptions).toBe(1);
  expect(harness.calls.resetCaches).toBe(1);
});

test("Scouting database loader dedupes queued renders while a load is active", async () => {
  let resolveLoad;
  const loadPromise = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const harness = createHarness({
    loadBySource: (filters, api) =>
      loadPromise.then(() => {
        api.setDatabase({ source: filters.source, records: [{ id: "record-1" }] });
      }),
  });

  harness.loader.queueLoad();
  harness.loader.queueLoad((options) => harness.calls.renders.push({ custom: true, ...options }));
  expect(harness.calls.loads).toEqual(["local"]);
  expect(harness.loader.isLoading()).toBe(true);

  resolveLoad();
  await harness.loader.ensureLoaded();
  await Promise.resolve();

  expect(harness.calls.renders).toEqual([{ custom: true, preserveFocus: true }]);
  expect(harness.loader.isLoading()).toBe(false);
});

test("Scouting database loader records source-specific load errors and clears loading state", async () => {
  const harness = createHarness({
    source: "fsdb",
    loadBySource: () => Promise.reject(new Error("No session")),
  });

  await expect(harness.loader.ensureLoaded()).rejects.toThrow("No session");

  expect(harness.calls.loads).toEqual(["fsdb"]);
  expect(harness.calls.errors).toEqual(["", "No session"]);
  expect(harness.loader.isLoading()).toBe(false);
  expect(harness.loader.getLoadSource()).toBe("");
});
