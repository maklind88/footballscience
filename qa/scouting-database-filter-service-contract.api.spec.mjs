import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { createScoutingDatabaseFilterService } from "../src/modules/scouting/scouting-database-filter-service.mjs";
import { handleScoutingDatabaseInput } from "../src/modules/scouting/scouting-database.mjs";

function createFilterHarness({ records = [], filters = {}, source = "local", cache = { key: "", records: [] } } = {}) {
  let currentCache = cache;
  const state = { databaseFilters: filters, favoriteRecordIds: ["favorite-1"] };
  const defaultFilters = {
    query: "",
    league: "all",
    team: "all",
    season: "all",
    position: "all",
    minMinutes: "",
    maxMinutes: "",
    minAge: "",
    maxAge: "",
    metricId: "all",
    metricIds: [],
    metricMin: "",
    roleProfileId: "all",
    roleFitMin: "",
    roleFloorMin: "",
    sortMetricId: "minutes",
    signalMode: "all",
    marketStatus: "all",
    benchmarkMode: "position",
    offset: 0,
  };
  const service = createScoutingDatabaseFilterService({
    getScoutingDatabase: () => ({ source, records }),
    ensureScoutingState: () => state,
    normalizeScoutingDatabaseFilters: (value = {}) => ({ ...defaultFilters, ...value }),
    normalizeScoutingText: (value = "") => String(value || "").trim().toLowerCase(),
    ensureScoutingRecordLookupsReady: () => {},
    getScoutingRoleProfileById: () => null,
    getScoutingRoleCategoryGroup: () => "",
    normalizeScoutingRecordIds: (ids = []) => ids.filter(Boolean),
    getScoutingTargetedRecordIds: () => ["pipeline-1"],
    getScoutingAllShadowRecordIds: () => ["shadow-1"],
    getScoutingApiOffset: (offset) => Number(offset) || 0,
    groupScoutingDatabaseRecordsByPerson: (items) => items,
    getScoutingRecordLeague: (record) => record.league || "",
    getScoutingRecordTeam: (record) => record.team || "",
    getScoutingRecordSeason: (record) => record.season || "",
    scoutingPositionMatchesFilter: (record, position) => record.position === position,
    getScoutingRecordMinutes: (record) => Number(record.minutes) || 0,
    getScoutingRecordAge: (record) => Number(record.age),
    getScoutingMetricValue: (record, metricId) => Number(record.metrics?.[metricId] ?? record[metricId]) || 0,
    getScoutingRoleFitScore: (record) => Number(record.roleFit) || 0,
    getScoutingComparablePercentile: (record, metricId) => Number(record.percentiles?.[metricId]) || 0,
    getScoutingRoleMetricFloor: (record) => Number(record.roleFloor) || 0,
    getScoutingRecordId: (record) => record.id,
    getScoutingPositionGroup: (record) => record.group || record.position || "",
    getScoutingSampleConfidenceScore: (record) => Number(record.sampleConfidence) || 0,
    getScoutingIntelligenceProfile: (record) => ({
      confidence: { score: Number(record.intelligenceConfidence) || 0 },
      floor: { score: Number(record.intelligenceFloor) || 0 },
    }),
    getScoutingMarketInfo: (recordId) => records.find((record) => record.id === recordId)?.market || {},
    isScoutingHighDealProbability: (value) => value === "High",
    doesScoutingRecordMatchSearchQuery: (record, query) => String(record.name || "").toLowerCase().includes(query),
    getScoutingMetric: (metricId) => (["minutes", "matches"].includes(metricId) ? null : { id: metricId }),
    getFilteredDatabaseCache: () => currentCache,
    setFilteredDatabaseCache: (nextCache) => {
      currentCache = nextCache;
    },
    getRecordLookupFingerprint: () => "lookup-v1",
    getMarketIntelVersion: () => 7,
  });
  return {
    ...service,
    getCache: () => currentCache,
  };
}

test("Scouting database filter service owns filter body outside scouting-workspace", async () => {
  const workspaceSource = await readFile("scouting-workspace.js", "utf8");
  const serviceSource = await readFile("src/modules/scouting/scouting-database-filter-service.mjs", "utf8");
  const indexSource = await readFile("src/modules/scouting/index.mjs", "utf8");

  expect(workspaceSource).toContain("createScoutingDatabaseFilterService");
  expect(workspaceSource).toContain("const { getFilteredScoutingDatabaseRecords } = scoutingDatabaseFilterService;");
  expect(workspaceSource).not.toContain("function getFilteredScoutingDatabaseRecords() {");
  expect(serviceSource).toContain("function getFilteredScoutingDatabaseRecords() {");
  expect(indexSource).toContain('export * from "./scouting-database-filter-service.mjs";');
  expect(serviceSource).not.toContain("writeScoutingState");
  expect(serviceSource).not.toContain("sendScoutingApiAction");
  expect(serviceSource).not.toContain("localStorage");
});

test("Scouting team search updates bounded suggestions without filtering on every keystroke", () => {
  let suggestionInput = null;
  let filterWrites = 0;
  const teamInput = {
    dataset: { scoutingFilter: "team" },
    type: "search",
    value: "North",
    closest(selector) {
      return selector === "[data-scouting-team-filter]" || selector === "[data-scouting-filter]" ? this : null;
    },
  };

  const handled = handleScoutingDatabaseInput(
    { target: teamInput },
    {
      setDatabaseFilter: () => {
        filterWrites += 1;
      },
      updateTeamFilterSuggestions: (input) => {
        suggestionInput = input;
      },
    }
  );

  expect(handled).toBe(true);
  expect(suggestionInput).toBe(teamInput);
  expect(filterWrites).toBe(0);
});

test("Scouting database filter service preserves simple local filtering and cache behavior", () => {
  const harness = createFilterHarness({
    records: [
      { id: "a", name: "Ada Mid", league: "NWSL", team: "NC", season: "2026", position: "MID", minutes: 900, age: 22 },
      { id: "b", name: "Bea Wing", league: "NWSL", team: "NC", season: "2026", position: "WING", minutes: 1200, age: 24 },
      { id: "c", name: "Cara Back", league: "Liga MX", team: "Tigres", season: "2025", position: "CB", minutes: 700, age: 31 },
    ],
    filters: {
      league: "NWSL",
      team: "NC",
      season: "2026",
      minMinutes: 800,
      maxAge: 25,
      sortMetricId: "minutes",
    },
  });

  expect(harness.getFilteredScoutingDatabaseRecords().map((record) => record.id)).toEqual(["b", "a"]);
  expect(harness.getCache().records.map((record) => record.id)).toEqual(["b", "a"]);
  expect(harness.getFilteredScoutingDatabaseRecords()).toBe(harness.getCache().records);
});

test("Scouting database filter service preserves query, signal and metric filters", () => {
  const records = [
    {
      id: "favorite-1",
      name: "Ada Creator",
      league: "NWSL",
      team: "NC",
      season: "2026",
      position: "MID",
      minutes: 900,
      age: 22,
      metrics: { "xg-per-90": 0.25 },
      percentiles: { "xg-per-90": 88 },
    },
    {
      id: "other-1",
      name: "Bea Creator",
      league: "NWSL",
      team: "NC",
      season: "2026",
      position: "MID",
      minutes: 1100,
      age: 23,
      metrics: { "xg-per-90": 0.55 },
      percentiles: { "xg-per-90": 91 },
    },
  ];
  const favoritesHarness = createFilterHarness({
    records,
    filters: {
      query: "creator",
      signalMode: "favorites",
      metricIds: ["xg-per-90"],
      metricMin: 80,
      sortMetricId: "xg-per-90",
    },
  });
  expect(favoritesHarness.getFilteredScoutingDatabaseRecords().map((record) => record.id)).toEqual(["favorite-1"]);

  const metricHarness = createFilterHarness({
    records,
    filters: {
      query: "creator",
      metricIds: ["xg-per-90"],
      metricMin: 90,
      sortMetricId: "xg-per-90",
    },
  });
  expect(metricHarness.getFilteredScoutingDatabaseRecords().map((record) => record.id)).toEqual(["other-1"]);
});
