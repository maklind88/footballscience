import { expect, test } from "@playwright/test";
import { createScoutingProfileSpiderService } from "../src/modules/scouting/index.mjs";

const recordIndex = Object.freeze({
  id: 0,
  player: 1,
  team: 2,
  league: 4,
  season: 5,
  position: 6,
  age: 7,
  matches: 8,
  minutes: 9,
  metrics: 14,
  sourceTrace: 20,
  metricQuality: 21,
});

function normalizeText(value = "", limit = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value, fallback = "n/a") {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 10) / 10) : fallback;
}

function createRecord({ id, season, minutes, matches, goals, xg, xgQuality = "trusted", fit }) {
  const record = [];
  record[recordIndex.id] = id;
  record[recordIndex.player] = "Ada Forward";
  record[recordIndex.season] = season;
  record[recordIndex.matches] = matches;
  record[recordIndex.minutes] = minutes;
  record[recordIndex.metrics] = {
    goals: { value: goals, quality: "trusted" },
    xg: { value: xg, quality: xgQuality },
  };
  record[recordIndex.metricQuality] = { goals: "trusted", xg: xgQuality };
  record[recordIndex.sourceTrace] = { original: id };
  record.fit = fit;
  return record;
}

function getSeasonSortValue(record) {
  const years = (normalizeText(record?.[recordIndex.season], 80).match(/\d{4}/g) || []).map(Number);
  return years.length ? Math.max(...years) : 0;
}

function createHarness(overrides = {}) {
  const rows =
    overrides.rows ||
    [
      createRecord({ fit: 88, goals: 8, id: "2025", matches: 20, minutes: 1800, season: "2025", xg: 6, xgQuality: "estimated" }),
      createRecord({ fit: 74, goals: 4, id: "2024", matches: 10, minutes: 900, season: "2024", xg: 3 }),
    ];
  const state = {
    profileSpiderSeasonMode: overrides.mode || "latest",
    profileSpiderSeasonValue: overrides.season || "",
  };
  const service = createScoutingProfileSpiderService({
    ensureState: () => state,
    escapeHtml,
    formatNumber,
    getCoreMetricOptions: () => [{ id: "goals" }, { id: "xg" }],
    getMetricQuality: (record, metricId) => {
      const raw = record?.[recordIndex.metrics]?.[metricId];
      if (!raw || raw.value === null || raw.value === undefined) {
        return "missing";
      }
      return raw.quality || "trusted";
    },
    getMetricValue: (record, metricId) => {
      if (metricId === "minutes") return Number(record?.[recordIndex.minutes]);
      if (metricId === "matches") return Number(record?.[recordIndex.matches]);
      const raw = record?.[recordIndex.metrics]?.[metricId];
      return Number.isFinite(Number(raw?.value)) ? Number(raw.value) : null;
    },
    getRecordMinutes: (record) => Number(record?.[recordIndex.minutes]) || 0,
    getRecordSeason: (record) => normalizeText(record?.[recordIndex.season], 80),
    getRecordsForPlayer: () => rows,
    getRoleFitScore: (record) => record?.fit,
    getSeasonSortValue,
    normalizeText,
    recordIndex,
  });
  return { rows, service, state };
}

test("Scouting profile spider service normalizes season mode and renders selected season options", () => {
  const { rows, service } = createHarness();

  expect(service.normalizeSeasonMode("average")).toBe("average");
  expect(service.normalizeSeasonMode("season")).toBe("season");
  expect(service.normalizeSeasonMode("bad")).toBe("latest");
  expect(service.getSeasonSelectValue({ mode: "season", season: "2025" })).toBe("season::2025");

  const options = service.getSeasonOptions(rows, { mode: "season", season: "2025" });

  expect(options).toContain(`<option value="latest" >Latest season</option>`);
  expect(options).toContain(`<option value="average" >All seasons average</option>`);
  expect(options).toContain(`<option value="season::2025" selected>2025</option>`);
  expect(options.indexOf("season::2025")).toBeLessThan(options.indexOf("season::2024"));
});

test("Scouting profile spider service sorts player rows by season and minutes", () => {
  const olderHighMinutes = createRecord({ fit: 70, goals: 1, id: "2023-a", matches: 8, minutes: 1500, season: "2023", xg: 1 });
  const olderLowMinutes = createRecord({ fit: 68, goals: 1, id: "2023-b", matches: 6, minutes: 700, season: "2023", xg: 1 });
  const latest = createRecord({ fit: 90, goals: 9, id: "2026", matches: 22, minutes: 2000, season: "2026", xg: 7 });
  const { service } = createHarness({ rows: [olderLowMinutes, latest, olderHighMinutes] });

  expect(service.getRows(latest).map((record) => record[recordIndex.id])).toEqual(["2026", "2023-a", "2023-b"]);
});

test("Scouting profile spider service reports fit trends across seasons", () => {
  const { rows, service } = createHarness();

  expect(service.getTrend(rows, "role-cf")).toEqual({
    detail: "2024 P74 → 2025 P88 · 2 seasons",
    direction: "up",
    label: "Trending up +14",
  });
  expect(service.getTrend([rows[0]], "role-cf")).toEqual({
    detail: "1 season available",
    direction: "flat",
    label: "No trend yet",
  });
  expect(service.getTrend([], "role-cf")).toEqual({
    detail: "Needs more seasons",
    direction: "flat",
    label: "No trend yet",
  });
});

test("Scouting profile spider service builds minutes-weighted average records", () => {
  const { rows, service } = createHarness();

  const average = service.buildMinutesWeightedAverageRecord(rows, rows[0]);

  expect(average[recordIndex.season]).toBe("All seasons average");
  expect(average[recordIndex.minutes]).toBe(1500);
  expect(average[recordIndex.matches]).toBe(16.7);
  expect(average[recordIndex.metrics].goals.value).toBeCloseTo(6.666, 2);
  expect(average[recordIndex.metrics].goals.quality).toBe("trusted");
  expect(average[recordIndex.metrics].xg.value).toBe(5);
  expect(average[recordIndex.metrics].xg.quality).toBe("estimated");
  expect(average[recordIndex.sourceTrace]).toMatchObject({
    original: "2025",
    seasonCount: 2,
    spiderSeasonMode: "all-seasons-average",
    weightedBy: "minutes",
  });
});

test("Scouting profile spider service creates latest, season, fallback, and average contexts", () => {
  const latestHarness = createHarness();
  expect(latestHarness.service.getContext(latestHarness.rows[0], latestHarness.rows, "role-cf")).toMatchObject({
    mode: "latest",
    record: latestHarness.rows[0],
    sampleLabel: "2025 · 1800 minutes",
    season: "",
  });

  const seasonHarness = createHarness({ mode: "season", season: "2024" });
  expect(seasonHarness.service.getContext(seasonHarness.rows[0], seasonHarness.rows, "role-cf")).toMatchObject({
    mode: "season",
    record: seasonHarness.rows[1],
    sampleLabel: "2024 · 900 minutes",
    season: "2024",
  });

  const missingSeasonHarness = createHarness({ mode: "season", season: "2022" });
  expect(missingSeasonHarness.service.getContext(missingSeasonHarness.rows[0], missingSeasonHarness.rows, "role-cf")).toMatchObject({
    mode: "latest",
    record: missingSeasonHarness.rows[0],
    season: "",
  });

  const averageHarness = createHarness({ mode: "average" });
  const averageContext = averageHarness.service.getContext(averageHarness.rows[0], averageHarness.rows, "role-cf");
  expect(averageContext.mode).toBe("average");
  expect(averageContext.record[recordIndex.season]).toBe("All seasons average");
  expect(averageContext.sampleLabel).toBe("2 seasons · minutes-weighted");
});
