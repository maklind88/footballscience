import { expect, test } from "@playwright/test";
import { createScoutingDatabaseActions } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function normalizeDatabaseFilters(value = {}) {
  return {
    query: "",
    source: "local",
    offset: 0,
    metricId: "all",
    metricIds: [],
    minMinutes: 0,
    minMinutesIntentional: false,
    fsdbCursor: "",
    fsdbCursorStack: [],
    ...value,
  };
}

function createHarness(overrides = {}) {
  const state = {
    activeTab: "lists",
    databaseFilters: normalizeDatabaseFilters({
      query: "old",
      source: "local",
      offset: 50,
      fsdbCursor: "cursor-1",
      fsdbCursorStack: ["previous-1"],
    }),
    savedViews: [
      { id: "view-1", name: "Wide Targets", filters: normalizeDatabaseFilters({ query: "wide", position: "W" }) },
      { id: "view-2", name: "Keepers", filters: normalizeDatabaseFilters({ position: "GK" }) },
    ],
  };
  const ui = {
    advancedFiltersOpen: overrides.advancedFiltersOpen ?? true,
    advancedMode: overrides.advancedMode ?? false,
    debounceTimer: 17,
    savedViewNameDraft: "Draft",
    savedViewsOpen: false,
  };
  const calls = {
    clearDatabaseLoadState: 0,
    clearFilteredDatabaseCache: 0,
    clearTimeouts: [],
    deferWrites: [],
    refreshDatabaseSurface: [],
    renderWorkspace: [],
    resultsRenders: 0,
    scheduledDatabaseRefreshes: 0,
    setTimeouts: [],
    writes: [],
  };
  const deps = {
    apiPageLimit: 50,
    canEdit: () => overrides.canEdit ?? true,
    clearDatabaseLoadState: () => {
      calls.clearDatabaseLoadState += 1;
    },
    clearFilteredDatabaseCache: () => {
      calls.clearFilteredDatabaseCache += 1;
    },
    clearTimeout: (timer) => calls.clearTimeouts.push(timer),
    cloneSavedView: (view) => ({ id: `saved-${normalizeText(view.name, 80).toLowerCase().replace(/\s+/g, "-")}`, ...view }),
    deferStateWrite: (options) => calls.deferWrites.push(options),
    ensureState: () => state,
    getAdvancedFiltersOpen: () => ui.advancedFiltersOpen,
    getAdvancedMode: () => ui.advancedMode,
    getApiOffset: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    getDatabaseFilterDebounceTimer: () => ui.debounceTimer,
    getDatabaseLiveSearchQuery: (fallback) => normalizeText(fallback, 120),
    getDatabasePage: () => overrides.databasePage || { limit: 50, total: 200, nextCursor: "cursor-next" },
    getFilteredDatabaseRecords: () => Array.from({ length: overrides.filteredCount ?? 125 }, (_, index) => ({ id: `record-${index + 1}` })),
    getRangeFilterResetValue: (field) => (field === "minMinutes" ? 0 : "all"),
    getSavedViewPresets: () => [
      { id: "u23", name: "U23", filters: { ageMax: 23, source: "local" } },
    ],
    getSavedViews: (currentState) => currentState.savedViews || [],
    isDatabaseLoaded: () => overrides.databaseLoaded ?? true,
    isPagedDatabaseActive: () => overrides.paged ?? false,
    normalizeDatabaseFilters,
    normalizeText,
    pageSize: 50,
    refreshDatabaseSurface: (options) => calls.refreshDatabaseSurface.push(options),
    renderWorkspace: (options) => calls.renderWorkspace.push(options),
    scheduleDatabaseRefresh: () => {
      calls.scheduledDatabaseRefreshes += 1;
    },
    scheduleDatabaseResultsRender: () => {
      calls.resultsRenders += 1;
    },
    setAdvancedFiltersOpenState: (open) => {
      ui.advancedFiltersOpen = Boolean(open);
    },
    setAdvancedModeState: (enabled) => {
      ui.advancedMode = Boolean(enabled);
    },
    setDatabaseFilterDebounceTimer: (timer) => {
      ui.debounceTimer = timer || 0;
    },
    setDatabaseMetricFilterOpen: (open) => {
      ui.metricFilterOpen = Boolean(open);
    },
    setDatabaseSearchDraft: (value) => {
      ui.searchDraft = value;
    },
    setSavedViewNameDraft: (value) => {
      ui.savedViewNameDraft = value;
    },
    setSavedViewsOpen: (open) => {
      ui.savedViewsOpen = Boolean(open);
    },
    setTimeout: (callback, delayMs) => {
      calls.setTimeouts.push({ callback, delayMs });
      return 88;
    },
    syncAdvancedFiltersDom: () => overrides.syncAdvancedFiltersDom ?? false,
    syncAdvancedModeDom: () => overrides.syncAdvancedModeDom ?? false,
    writeState: (options) => calls.writes.push(options || {}),
  };
  return {
    actions: createScoutingDatabaseActions(deps),
    calls,
    state,
    ui,
  };
}

test("Scouting Database actions normalize filters, reset paging, and isolate source changes", () => {
  const harness = createHarness();

  const queryResult = harness.actions.setFilter("query", "Ada");
  expect(queryResult).toEqual({ changed: true, field: "query", status: "updated" });
  expect(harness.ui.searchDraft).toBeNull();
  expect(harness.state.databaseFilters).toMatchObject({
    query: "Ada",
    offset: 0,
    fsdbCursor: "",
    fsdbCursorStack: [],
  });
  expect(harness.calls.deferWrites).toEqual([{ syncCentral: false }]);
  expect(harness.calls.clearFilteredDatabaseCache).toBe(1);

  const metricResult = harness.actions.setFilter("metricIds", ["  score ", "", "pace"]);
  expect(metricResult).toMatchObject({ changed: true, field: "metricIds" });
  expect(harness.state.databaseFilters.metricIds).toEqual(["score", "pace"]);
  expect(harness.state.databaseFilters.metricId).toBe("score");

  const sourceResult = harness.actions.setFilter("source", "fsdb");
  expect(sourceResult).toMatchObject({ changed: true, field: "source" });
  expect(harness.calls.clearDatabaseLoadState).toBe(1);
});

test("Scouting Database actions clamp local paging and schedule result renders", () => {
  const harness = createHarness({ filteredCount: 125 });

  const result = harness.actions.setPageOffset(999);

  expect(result).toEqual({ changed: true, offset: 100, status: "updated" });
  expect(harness.state.databaseFilters.offset).toBe(100);
  expect(harness.calls.writes).toEqual([{ syncCentral: false }]);
  expect(harness.calls.resultsRenders).toBe(1);

  const pageResult = harness.actions.setPageNumber(2);
  expect(pageResult).toEqual({ changed: true, offset: 50, status: "updated" });
  expect(harness.state.databaseFilters.offset).toBe(50);
});

test("Scouting Database actions route paged offsets and FSDB cursors through database refresh", () => {
  const harness = createHarness({ paged: true });
  harness.state.databaseFilters = normalizeDatabaseFilters({
    source: "fsdb",
    query: "live query",
    fsdbCursor: "",
    fsdbCursorStack: [],
  });

  const pageResult = harness.actions.setPageOffset(50);
  expect(pageResult).toEqual({ changed: true, offset: 50, status: "updated" });
  expect(harness.calls.scheduledDatabaseRefreshes).toBe(1);

  const nextResult = harness.actions.setPageCursor("next");
  expect(nextResult).toEqual({ changed: true, cursor: "cursor-next", status: "updated" });
  expect(harness.state.databaseFilters.fsdbCursor).toBe("cursor-next");
  expect(harness.state.databaseFilters.fsdbCursorStack).toEqual(["__first__"]);

  const previousResult = harness.actions.setPageCursor("previous");
  expect(previousResult).toEqual({ changed: true, cursor: "", status: "updated" });
  expect(harness.state.databaseFilters.fsdbCursor).toBe("");
  expect(harness.state.databaseFilters.fsdbCursorStack).toEqual([]);
});

test("Scouting Database actions create, apply, and delete saved views", () => {
  const harness = createHarness();

  const created = harness.actions.createSavedView("  Wide Targets  ");
  expect(created).toMatchObject({ changed: true, status: "updated" });
  expect(harness.state.savedViews[0]).toMatchObject({ id: "saved-wide-targets", name: "Wide Targets" });
  expect(harness.state.savedViews.filter((view) => view.name === "Wide Targets")).toHaveLength(1);
  expect(harness.ui.savedViewNameDraft).toBe("");
  expect(harness.ui.savedViewsOpen).toBe(true);

  const preset = harness.actions.applyPresetView("u23");
  expect(preset).toEqual({ changed: true, viewId: "u23", status: "updated" });
  expect(harness.state.activeTab).toBe("database");
  expect(harness.state.databaseFilters.ageMax).toBe(23);

  const applied = harness.actions.applySavedView("view-2");
  expect(applied).toEqual({ changed: true, viewId: "view-2", status: "updated" });
  expect(harness.state.databaseFilters.position).toBe("GK");

  const deleted = harness.actions.deleteSavedView("view-2");
  expect(deleted).toEqual({ changed: true, viewId: "view-2", status: "updated" });
  expect(harness.state.savedViews.some((view) => view.id === "view-2")).toBe(false);
});

test("Scouting Database actions handle range reset, debounce, and advanced toggles", () => {
  const harness = createHarness();

  const reset = harness.actions.resetRangeFilter("minMinutes");
  expect(reset).toMatchObject({ changed: true, field: "minMinutes" });
  expect(harness.state.databaseFilters.minMinutes).toBe(0);
  expect(harness.calls.renderWorkspace).toEqual([{ preserveFocus: true }]);
  expect(harness.calls.clearTimeouts).toEqual([17]);
  expect(harness.ui.debounceTimer).toBe(88);
  expect(harness.calls.setTimeouts[0].delayMs).toBe(120);
  harness.calls.setTimeouts[0].callback();
  expect(harness.calls.resultsRenders).toBe(1);
  expect(harness.ui.debounceTimer).toBe(0);

  const advancedMode = harness.actions.setAdvancedMode(true);
  expect(advancedMode).toEqual({ changed: true, enabled: true, status: "updated" });
  expect(harness.ui.advancedMode).toBe(true);
  expect(harness.calls.refreshDatabaseSurface).toContainEqual({ controls: true });

  const filtersClosed = harness.actions.setAdvancedFiltersOpen(false);
  expect(filtersClosed).toEqual({ changed: true, open: false, status: "updated" });
  expect(harness.ui.advancedFiltersOpen).toBe(false);
  expect(harness.ui.metricFilterOpen).toBe(false);
});
