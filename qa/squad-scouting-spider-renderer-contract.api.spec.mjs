import { expect, test } from "@playwright/test";
import {
  createSquadScoutingSpiderRenderer,
  formatPlayerProfileScoutingNumber,
} from "../src/modules/squad/index.mjs";

const recordIndex = { team: "team", season: "season" };
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
