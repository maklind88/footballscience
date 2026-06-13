import { expect, test } from "@playwright/test";
import { createScoutingDatabaseResultsService } from "../src/modules/scouting/index.mjs";

function createRecords(count, prefix = "record") {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}` }));
}

function createHarness(options = {}) {
  const calls = {
    hydratedNavigation: [],
    renderedCards: [],
  };
  const state = {
    databaseFilters: {
      fsdbGenderSegment: options.fsdbGenderSegment || "women",
    },
  };
  const records = options.records || createRecords(0);
  const service = createScoutingDatabaseResultsService({
    apiPageLimit: 50,
    ensureState: () => state,
    getDatabase: () => ({ source: options.source || "local" }),
    getDatabasePage: () => options.page || null,
    getDatabasePageOffset: () => options.localOffset || 0,
    getFilteredDatabaseCacheKey: () => options.cacheKey || "cache-key",
    getFilteredRecords: () => records,
    getFootballScienceDbGenderSegmentLabel: (value) => (value === "men" ? "men's" : "women's"),
    hydrateNavigationCache: (visibleRecords, key) => calls.hydratedNavigation.push({ ids: visibleRecords.map((record) => record.id), key }),
    isAdvancedDatabaseMode: () => options.advancedMode === true,
    normalizeDatabaseFilters: (filters = {}) => ({ fsdbGenderSegment: "women", ...filters }),
    normalizeText: (value = "", limit = 160) => String(value ?? "").trim().slice(0, limit),
    pageSize: 50,
    renderRecordCard: (record, renderOptions) => {
      calls.renderedCards.push({ id: record.id, renderOptions });
      return `<article data-record="${record.id}" data-compact="${renderOptions.compactMode ? "yes" : "no"}"></article>`;
    },
  });
  return { calls, records, service, state };
}

test("Scouting database results service slices local records and hydrates navigation", () => {
  const harness = createHarness({ records: createRecords(125), localOffset: 50 });

  const results = harness.service.getResultsMarkup();

  expect(results.visibleRecords.map((record) => record.id)).toEqual(createRecords(50).map((_, index) => `record-${index + 51}`));
  expect(results.summary).toBe("125 players match.");
  expect(results.paging).toMatchObject({
    total: 125,
    offset: 50,
    limit: 50,
    returned: 125,
    mode: "local",
    shownStart: 51,
    shownEnd: 100,
  });
  expect(results.html).toContain('data-record="record-51"');
  expect(harness.calls.renderedCards[0]).toEqual({ id: "record-51", renderOptions: { lightweight: true, compactMode: true } });
  expect(harness.calls.hydratedNavigation).toEqual([{ ids: results.visibleRecords.map((record) => record.id), key: "cache-key:visible:50:50" }]);
});

test("Scouting database results service renders empty local states", () => {
  const harness = createHarness({ records: [] });

  const results = harness.service.getResultsMarkup();

  expect(results.visibleRecords).toEqual([]);
  expect(results.summary).toBe("0 players match.");
  expect(results.html).toContain("No players match these filters yet.");
  expect(harness.calls.hydratedNavigation).toEqual([{ ids: [], key: "cache-key:visible:0:0" }]);
});

test("Scouting database results service preserves paged API metadata", () => {
  const harness = createHarness({
    source: "api",
    records: createRecords(2, "api"),
    page: { offset: 100, returned: 50, total: 180, limit: 50, hasMore: true, nextOffset: 150 },
  });

  const results = harness.service.getResultsMarkup();

  expect(results.visibleRecords.map((record) => record.id)).toEqual(["api-1", "api-2"]);
  expect(results.summary).toBe("180 players match.");
  expect(results.paging).toMatchObject({
    total: 180,
    offset: 100,
    limit: 50,
    returned: 2,
    hasMore: true,
    nextOffset: 150,
    mode: "api",
    shownStart: 101,
    shownEnd: 102,
  });
  expect(harness.calls.hydratedNavigation).toEqual([{ ids: ["api-1", "api-2"], key: "cache-key:visible:100:2" }]);
});

test("Scouting database results service uses visible records as total when the last paged slice is smaller than known returned rows", () => {
  const harness = createHarness({
    source: "worker",
    records: createRecords(1, "worker"),
    page: { offset: 50, returned: 50, limit: 50, hasMore: false },
  });

  const results = harness.service.getResultsMarkup();

  expect(results.summary).toBe("1 players match.");
  expect(results.paging.total).toBe(1);
});

test("Scouting database results service preserves Football Science DB summaries and cursors", () => {
  const harness = createHarness({
    source: "fsdb",
    fsdbGenderSegment: "men",
    records: createRecords(2, "fsdb"),
    page: { offset: 0, returned: 2, total: 2, limit: 50, hasMore: true, nextCursor: "cursor-next" },
  });

  const results = harness.service.getResultsMarkup();

  expect(results.summary).toBe("2 men's Football Science DB players match.");
  expect(results.paging).toMatchObject({
    total: 2,
    offset: 0,
    limit: 50,
    returned: 2,
    hasMore: true,
    nextCursor: "cursor-next",
    mode: "fsdb",
  });
});

test("Scouting database results service exposes visible records without rendering cards", () => {
  const harness = createHarness({ records: createRecords(80), localOffset: 50, advancedMode: true });

  const panelRecords = harness.service.getVisibleRecordsForPanels();

  expect(panelRecords.records).toHaveLength(80);
  expect(panelRecords.visibleRecords.map((record) => record.id)).toEqual(createRecords(30).map((_, index) => `record-${index + 51}`));
  expect(harness.calls.renderedCards).toEqual([]);
  expect(harness.calls.hydratedNavigation).toEqual([]);
});
