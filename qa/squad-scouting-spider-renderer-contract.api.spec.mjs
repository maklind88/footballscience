import { expect, test } from "@playwright/test";
import {
  createSquadScoutingProfileHelpers,
  createSquadScoutingRuntime,
  createSquadScoutingSpiderRenderer,
  formatPlayerProfileScoutingMinutes,
  formatPlayerProfileScoutingNumber,
} from "../src/modules/squad/index.mjs";

const recordIndex = { team: "team", season: "season", minutes: "minutes" };
const profileRecordIndex = {
  player: "player",
  team: "team",
  league: "league",
  season: "season",
  position: "position",
  minutes: "minutes",
  metrics: "metrics",
};
const templates = {
  OTHER: [
    { label: "Passing", metricId: "passing" },
    { label: "Progression", metricId: "progression" },
    { label: "Duels", metricId: "duels", direction: "lower" },
  ],
};

const goalkeeperMetricIds = [
  "exits-per-90",
  "save-rate",
  "prevented-goals-per-90",
  "accurate-passes",
  "average-pass-length-m",
  "passes-per-90",
];

function createIndexedScoutingRecord({ id, player, season, minutes, metrics, team = "North Carolina Courage" }) {
  return [id, player, team, team, "NWSL", season, "GK", 31, null, minutes, null, null, null, null, metrics];
}

function createIndexedScoutingDatabase(records, source = "Scouting player database") {
  return {
    schema: "football-science-scouting-import",
    source,
    metrics: goalkeeperMetricIds.map((id) => ({ id, label: id })),
    records,
  };
}

function createRuntimeForScoutingDatabases(win) {
  return createSquadScoutingRuntime({
    escapeHtml: (value) => String(value ?? ""),
    platformModuleLoader: { loadScript: () => Promise.resolve() },
    renderWorkspace: () => {},
    win,
  });
}

test("Squad scouting spider renderer queues database load and renders clean no-data state", () => {
  let queued = false;
  const renderer = createSquadScoutingSpiderRenderer({
    queueDatabaseLoad: () => {
      queued = true;
    },
  });

  const markup = renderer.render({ name: "Mak Lind" });

  expect(queued).toBe(true);
  expect(markup).toContain("Loading data");
  expect(markup).toContain("Scouting player database data is being loaded");
});

test("Squad scouting spider renderer renders no verified data without mutating lookup", () => {
  const renderer = createSquadScoutingSpiderRenderer({
    getDatabase: () => ({ records: [], metrics: [] }),
    findRecord: () => null,
  });

  const markup = renderer.render({ name: "Mak Lind" });

  expect(markup).toContain("No verified data");
  expect(markup).toContain("No linked scouting player database row exists");
});

test("Squad scouting spider renderer renders radar metrics from callback data", () => {
  const record = {
    team: "NCC",
    season: "2026",
    minutes: 1234.4,
    metrics: { passing: 91.25, progression: 7.4, duels: 2.1 },
  };
  const renderer = createSquadScoutingSpiderRenderer({
    getDatabase: () => ({ records: [record], metrics: [{ id: "passing" }, { id: "progression" }, { id: "duels" }] }),
    findRecord: () => record,
    getPositionGroup: () => "OTHER",
    getMetricValue: (sourceRecord, metricId) => sourceRecord.metrics[metricId],
    getPercentile: (_sourceRecord, metricId) => ({ passing: 88, progression: 71, duels: 64 })[metricId],
    getMetric: (_database, metricId) => ({ label: metricId.toUpperCase() }),
    templates,
    recordIndex,
  });

  const markup = renderer.render(
    { playerName: "Mak Lind" },
    {
      cardClassName: "idp-profile-scouting-radar player-profile-scouting-spider-card",
      headerClassName: "idp-profile-scouting-radar-head",
      kickerLabel: "NWSL Data Spider",
    }
  );

  expect(markup).toContain(">2026</span>");
  expect(markup).toContain(">NCC</span>");
  expect(markup).not.toContain("NCC / 2026");
  expect(markup).toContain("Minutes 1,234");
  expect(markup).toContain("player-profile-scouting-radar-meta");
  expect(markup).toContain("idp-profile-scouting-radar");
  expect(markup).toContain("idp-profile-scouting-radar-head");
  expect(markup).toContain("NWSL Data Spider");
  expect(markup).toContain("NWSL performance spider");
  expect(markup).toContain("<strong>P88</strong>");
  expect(markup).toContain("DUELS: 2.1 / low is good");
  expect(markup.indexOf(">2026</span>")).toBeLessThan(markup.indexOf(">NCC</span>"));
  expect(markup.indexOf(">NCC</span>")).toBeLessThan(markup.indexOf("Minutes 1,234"));
  expect(formatPlayerProfileScoutingNumber("bad")).toBe("n/a");
  expect(formatPlayerProfileScoutingMinutes(987.6)).toBe("988");
  expect(formatPlayerProfileScoutingMinutes("bad")).toBe("");
});

test("Squad scouting spider renderer exposes season selection for player radar records", () => {
  const records = [
    { team: "NCC", season: "2025", minutes: 2400, metrics: { passing: 70, progression: 5, duels: 3 } },
    { team: "NCC", season: "2026", minutes: 420, metrics: { passing: 92, progression: 8, duels: 2 } },
  ];
  const renderer = createSquadScoutingSpiderRenderer({
    getDatabase: () => ({ records, metrics: [{ id: "passing" }, { id: "progression" }, { id: "duels" }] }),
    findRecord: (_player, renderOptions = {}) => records.find((record) => record.season === renderOptions.selectedSeason) || records[1],
    getPositionGroup: () => "OTHER",
    getMetricValue: (sourceRecord, metricId) => sourceRecord.metrics[metricId],
    getPercentile: () => 70,
    getMetric: (_database, metricId) => ({ label: metricId.toUpperCase() }),
    templates,
    recordIndex,
  });

  const markup = renderer.render(
    { playerName: "Mak Lind" },
    {
      metricSelectionKey: "p1",
      seasonOptions: [
        { label: "2026", value: "2026" },
        { label: "2025", value: "2025" },
      ],
      selectedSeason: "2026",
    }
  );

  expect(markup).toContain('data-player-profile-scouting-season-select="p1"');
  expect(markup).toContain('<option value="2026" selected>2026</option>');
  expect(markup).toContain('<option value="2025" >2025</option>');
  expect(markup).toContain(">NCC</span>");
  expect(markup).not.toContain("NCC / 2026");
  expect(markup).toContain("Minutes 420");
  expect(markup.indexOf("player-profile-scouting-season-picker")).toBeLessThan(markup.indexOf("player-profile-scouting-radar-meta"));
});

test("Squad scouting spider renderer defaults to six metrics and keeps spider axes in sync with selected metrics", () => {
  const metricIds = ["exits", "save", "prevention", "accuracy", "short", "volume", "shots"];
  const record = {
    team: "NCC",
    season: "2026",
    metrics: Object.fromEntries(metricIds.map((metricId, index) => [metricId, index + 1])),
  };
  const renderer = createSquadScoutingSpiderRenderer({
    getDatabase: () => ({ records: [record], metrics: metricIds.map((id) => ({ id })) }),
    findRecord: () => record,
    getPositionGroup: () => "OTHER",
    getMetricValue: (sourceRecord, metricId) => sourceRecord.metrics[metricId],
    getPercentile: (_sourceRecord, metricId) => metricIds.indexOf(metricId) * 10 + 30,
    getMetric: (_database, metricId) => ({ label: metricId.toUpperCase() }),
    templates: {
      OTHER: metricIds.map((metricId) => ({ label: metricId.toUpperCase(), metricId })),
    },
    recordIndex,
  });

  const defaultMarkup = renderer.render({ playerName: "Mak Lind" });
  expect((defaultMarkup.match(/<strong>P/g) || []).length).toBe(6);
  expect((defaultMarkup.match(/player-profile-scouting-axis/g) || []).length).toBe(6);
  expect(defaultMarkup).toContain("EXITS");
  expect(defaultMarkup).toContain("VOLUME");
  expect(defaultMarkup).not.toContain("SHOTS: 7");

  const selectedMarkup = renderer.render(
    { playerName: "Mak Lind" },
    {
      maxMetricCount: 6,
      metricSelectionKey: "p1",
      metricPickerOpen: true,
      seasonOptions: [
        { label: "2026", value: "2026" },
        { label: "2025", value: "2025" },
      ],
      selectedSeason: "2026",
      selectedMetricIds: ["shots", "save", "accuracy"],
      showMetricPicker: true,
    }
  );
  expect((selectedMarkup.match(/<strong>P/g) || []).length).toBe(3);
  expect((selectedMarkup.match(/player-profile-scouting-axis/g) || []).length).toBe(3);
  expect(selectedMarkup).toContain('data-player-profile-scouting-metric-key="p1"');
  expect(selectedMarkup).toContain('class="player-profile-scouting-metric-picker" open');
  expect(selectedMarkup.indexOf("player-profile-scouting-season-picker")).toBeLessThan(selectedMarkup.indexOf("player-profile-scouting-radar-meta"));
  expect(selectedMarkup.indexOf("player-profile-scouting-radar-meta")).toBeLessThan(selectedMarkup.indexOf("player-profile-scouting-metric-picker"));
  expect(selectedMarkup).toContain("SHOTS: 7");
  expect(selectedMarkup).toContain("SAVE: 2");
  expect(selectedMarkup).toContain("ACCURACY: 4");
  expect(selectedMarkup).not.toContain("PREVENTION: 3");
});

test("Squad scouting spider renderer can expose database metric choices without changing the six default axes", () => {
  const metricIds = ["role-a", "role-b", "role-c", "role-d", "role-e", "role-f", "database-extra"];
  const record = {
    team: "NCC",
    season: "2026",
    metrics: Object.fromEntries(metricIds.map((metricId, index) => [metricId, index + 1])),
  };
  const renderer = createSquadScoutingSpiderRenderer({
    getDatabase: () => ({
      records: [record],
      metrics: metricIds.map((id) => ({ id, label: id.toUpperCase(), direction: "higher" })),
    }),
    findRecord: () => record,
    getPositionGroup: () => "OTHER",
    getMetricValue: (sourceRecord, metricId) => sourceRecord.metrics[metricId],
    getPercentile: (_sourceRecord, metricId) => metricIds.indexOf(metricId) * 10 + 30,
    getMetric: (_database, metricId) => ({ id: metricId, label: metricId.toUpperCase(), direction: "higher" }),
    templates: {
      OTHER: metricIds.slice(0, 6).map((metricId) => ({ label: metricId.toUpperCase(), metricId })),
    },
    recordIndex,
  });

  const markup = renderer.render(
    { playerName: "Mak Lind" },
    {
      includeDatabaseMetricChoices: true,
      metricSelectionKey: "p1",
      showMetricPicker: true,
    }
  );

  expect((markup.match(/<strong>P/g) || []).length).toBe(6);
  expect((markup.match(/player-profile-scouting-axis/g) || []).length).toBe(6);
  expect(markup).toContain('data-player-profile-scouting-metric-toggle="database-extra"');
  expect(markup).toContain("DATABASE-EXTRA");
  expect(markup).not.toContain("DATABASE-EXTRA: 7");
});

test("Squad scouting spider metric picker explains metrics and keeps hidden search matches selectable", () => {
  const metricIds = ["def-actions", "aerial", "interceptions", "progression", "short", "accuracy", "duels"];
  const record = {
    team: "NCC",
    season: "2026",
    metrics: Object.fromEntries(metricIds.map((metricId, index) => [metricId, index + 1])),
  };
  const renderer = createSquadScoutingSpiderRenderer({
    getDatabase: () => ({
      records: [record],
      metrics: metricIds.map((id) => ({
        id,
        label: id === "def-actions" ? "Successful defensive actions per 90" : id.toUpperCase(),
        description: id === "def-actions" ? "How often the player completes defensive interventions per 90 minutes." : "",
        direction: "higher",
      })),
    }),
    findRecord: () => record,
    getPositionGroup: () => "OTHER",
    getMetricValue: (sourceRecord, metricId) => sourceRecord.metrics[metricId],
    getPercentile: (_sourceRecord, metricId) => metricIds.indexOf(metricId) * 10 + 30,
    getMetric: (database, metricId) => database.metrics.find((metric) => metric.id === metricId),
    templates: {
      OTHER: metricIds.slice(0, 6).map((metricId) => ({ label: metricId.toUpperCase(), metricId })),
    },
    recordIndex,
  });

  const markup = renderer.render(
    { playerName: "Mak Lind" },
    {
      includeDatabaseMetricChoices: true,
      metricSelectionKey: "p1",
      metricPickerOpen: true,
      metricPickerSearchQuery: "defensive",
      showMetricPicker: true,
    }
  );

  expect(markup).toContain("data-player-profile-scouting-metric-search");
  expect(markup).toContain("Search metrics");
  expect(markup).toContain("Tick up to 6 metrics");
  expect(markup).toContain("Successful defensive actions per 90");
  expect(markup).toContain("How often the player completes defensive interventions per 90 minutes.");
  expect(markup).toContain("Current value: 1");
  expect(markup).toContain('data-player-profile-scouting-metric-toggle="aerial"');
  expect(markup).toContain('data-player-profile-scouting-metric-toggle="duels"');
  expect(markup).toContain('data-player-profile-scouting-metric-search-text="');
  expect(markup).toContain("hidden");
});

test("Squad scouting profile helpers own record matching, metrics, and percentiles", () => {
  const database = {
    metrics: [{ id: "shots" }, { id: "turnovers" }],
    records: [
      { player: "Mak Lind", league: "NWSL", position: "CF", minutes: 900, metrics: [0.8, 2] },
      { player: "M. Lind", league: "National Women Soccer League", position: "ST", minutes: 800, metrics: [0.6, 3] },
      { player: "Other Forward", league: "NWSL", position: "CF", minutes: 600, metrics: [0.1, 5] },
      { player: "Low Minutes", league: "NWSL", position: "CF", minutes: 100, metrics: [0.9, 1] },
    ],
  };
  const helpers = createSquadScoutingProfileHelpers({
    getDatabase: () => database,
    recordIndex: profileRecordIndex,
  });

  expect(helpers.normalizePlayerProfileScoutingText("Mák Lind!")).toBe("mak lind");
  expect(helpers.doPlayerProfileScoutingNamesMatch("Mak Lind", "M. Lind")).toBe(true);
  expect(helpers.findPlayerProfileNwslScoutingRecord({ name: "Mak Lind" })?.minutes).toBe(900);
  expect(helpers.getPlayerProfileScoutingPositionGroup("LW / RW")).toBe("WING");
  expect(helpers.getPlayerProfileScoutingMetricValue(database.records[0], "shots")).toBe(0.8);
  expect(helpers.getPlayerProfileScoutingPercentile(database.records[0], "shots")).toBeGreaterThan(50);
  expect(helpers.getPlayerProfileScoutingPercentile(database.records[0], "turnovers", "lower")).toBeGreaterThan(50);
});

test("Squad scouting profile helpers default player radar records to the latest available season", () => {
  const database = {
    metrics: [{ id: "shots" }],
    records: [
      { player: "Mak Lind", league: "NWSL", position: "CF", season: "2025", minutes: 2200, metrics: { shots: 1 } },
      { player: "Mak Lind", league: "NWSL", position: "CF", season: "2026", minutes: 320, metrics: { shots: 2 } },
      { player: "Mak Lind", league: "NWSL", position: "CF", season: "2024", minutes: 1800, metrics: { shots: 3 } },
    ],
  };
  const helpers = createSquadScoutingProfileHelpers({
    getDatabase: () => database,
    recordIndex: profileRecordIndex,
  });

  expect(helpers.findPlayerProfileNwslScoutingRecord({ name: "Mak Lind" })?.season).toBe("2026");
  expect(helpers.findPlayerProfileNwslScoutingRecord({ name: "Mak Lind" }, { selectedSeason: "2025" })?.season).toBe("2025");
  expect(helpers.getPlayerProfileNwslScoutingSeasonOptions({ name: "Mak Lind" }).map((season) => season.value)).toEqual(["2026", "2025", "2024"]);
});

test("Squad scouting runtime falls back to canonical data when a stale imported cache lacks the player", () => {
  const importedDatabase = createIndexedScoutingDatabase([
    createIndexedScoutingRecord({ id: "other-2026", player: "Other Keeper", season: "2026", minutes: 500, metrics: [1, 60, 0, 80, 30, 20] }),
  ], "ui-import");
  const bundledDatabase = createIndexedScoutingDatabase([
    createIndexedScoutingRecord({ id: "k-sheridan-2023", player: "K. Sheridan", season: "2023", minutes: 1898, metrics: [1.1, 70, 0.1, 81, 28, 25] }),
    createIndexedScoutingRecord({ id: "k-sheridan-2024", player: "K. Sheridan", season: "2024", minutes: 2544, metrics: [1.2, 71, 0.2, 82, 27, 27] }),
    createIndexedScoutingRecord({ id: "k-sheridan-2025", player: "K. Sheridan", season: "2025", minutes: 2560, metrics: [1.3, 72, 0.3, 83, 26, 29] }),
    createIndexedScoutingRecord({ id: "k-sheridan-2026", player: "K. Sheridan", season: "2026", minutes: 1338, metrics: [1.28, 67.4, 0.14, 85.3, 26, 30.3] }),
  ]);
  const activeDatabase = { source: "fsdb", metrics: [], records: [], page: { mode: "fsdb" } };
  const win = {
    __footballScienceImportedScoutingDatabase: importedDatabase,
    __footballScienceBundledScoutingDatabase: bundledDatabase,
    __footballScienceScoutingDatabase: activeDatabase,
    localStorage: { getItem: () => JSON.stringify(importedDatabase) },
  };
  const runtime = createRuntimeForScoutingDatabases(win);

  const markup = runtime.renderPlayerProfileScoutingSpider({ name: "Kailen Sheridan", position: "GK" });

  expect(runtime.getPlayerProfileScoutingDatabase()).toBe(importedDatabase);
  expect(markup).toContain('<option value="2026" selected>2026</option>');
  expect(markup).toContain("Minutes 1,338");
  expect(markup).toContain("exits-per-90: 1.28");
  expect(markup).not.toContain("No verified data");
  expect(win.__footballScienceScoutingDatabase).toBe(activeDatabase);
  expect(win.__footballScienceImportedScoutingDatabase).toBe(importedDatabase);
});

test("Squad scouting runtime keeps an imported player match ahead of canonical fallback", () => {
  const importedDatabase = createIndexedScoutingDatabase([
    createIndexedScoutingRecord({ id: "imported-k-sheridan", player: "K. Sheridan", season: "2025", minutes: 999, metrics: [2, 75, 0.4, 88, 24, 34] }),
  ], "ui-import");
  const bundledDatabase = createIndexedScoutingDatabase([
    createIndexedScoutingRecord({ id: "bundled-k-sheridan", player: "K. Sheridan", season: "2026", minutes: 1338, metrics: [1.28, 67.4, 0.14, 85.3, 26, 30.3] }),
  ]);
  const runtime = createRuntimeForScoutingDatabases({
    __footballScienceImportedScoutingDatabase: importedDatabase,
    __footballScienceBundledScoutingDatabase: bundledDatabase,
    __footballScienceScoutingDatabase: bundledDatabase,
    localStorage: { getItem: () => JSON.stringify(importedDatabase) },
  });

  const markup = runtime.renderPlayerProfileScoutingSpider({ name: "Kailen Sheridan", position: "GK" });

  expect(markup).toContain("<span>2025</span>");
  expect(markup).toContain("Minutes 999");
  expect(markup).toContain("exits-per-90: 2");
  expect(markup).not.toContain('value="2026"');
});

test("Squad scouting runtime fails closed when name aliases are not identity-safe", () => {
  const importedDatabase = createIndexedScoutingDatabase([
    createIndexedScoutingRecord({ id: "initial-sheridan", player: "K. Sheridan", season: "2025", minutes: 900, metrics: [2, 75, 0.4, 88, 24, 34] }),
    createIndexedScoutingRecord({ id: "kate-sheridan", player: "Kate Sheridan", season: "2025", minutes: 800, metrics: [1, 65, 0.1, 80, 28, 25] }),
  ], "ui-import");
  const bundledDatabase = createIndexedScoutingDatabase([
    createIndexedScoutingRecord({ id: "bundled-k-sheridan", player: "K. Sheridan", season: "2026", minutes: 1338, metrics: [1.28, 67.4, 0.14, 85.3, 26, 30.3] }),
  ]);
  const runtime = createRuntimeForScoutingDatabases({
    __footballScienceImportedScoutingDatabase: importedDatabase,
    __footballScienceBundledScoutingDatabase: bundledDatabase,
    __footballScienceScoutingDatabase: bundledDatabase,
    localStorage: { getItem: () => JSON.stringify(importedDatabase) },
  });

  const markup = runtime.renderPlayerProfileScoutingSpider({ name: "Kailen Sheridan", position: "GK" });

  expect(markup).toContain("No verified data");
  expect(markup).not.toContain("Minutes 1,338");
});
