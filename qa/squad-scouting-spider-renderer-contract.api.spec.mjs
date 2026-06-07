import { expect, test } from "@playwright/test";
import {
  createSquadScoutingProfileHelpers,
  createSquadScoutingSpiderRenderer,
  formatPlayerProfileScoutingNumber,
} from "../src/modules/squad/index.mjs";

const recordIndex = { team: "team", season: "season" };
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

  const markup = renderer.render({ name: "Mak Lind" });

  expect(markup).toContain("NCC / 2026");
  expect(markup).toContain("NWSL performance spider");
  expect(markup).toContain("<strong>P88</strong>");
  expect(markup).toContain("DUELS: 2.1 / low is good");
  expect(formatPlayerProfileScoutingNumber("bad")).toBe("n/a");
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
