import { expect, test } from "@playwright/test";
import {
  createScoutingDatabaseSourcePolicy,
  getFootballScienceDbGenderSegmentLabel,
  normalizeFootballScienceDbGenderSegment,
  normalizeScoutingDatabaseFilterSource,
  normalizeScoutingDatabaseRecordSource,
  isFootballScienceDbDatabaseSource,
  isScoutingApiDatabaseSource,
  isScoutingPagedDatabaseSource,
  isScoutingWorkerDatabaseSource,
} from "../src/modules/scouting/index.mjs";

test("Scouting database source policy keeps standalone FSDB disabled unless explicitly enabled", () => {
  expect(normalizeScoutingDatabaseFilterSource("fsdb")).toBe("scouting");
  expect(normalizeScoutingDatabaseFilterSource(" FSDB ", { standaloneFootballScienceDbEnabled: false })).toBe("scouting");
  expect(normalizeScoutingDatabaseFilterSource("fsdb", { standaloneFootballScienceDbEnabled: true })).toBe("fsdb");
  expect(normalizeScoutingDatabaseFilterSource("worker", { standaloneFootballScienceDbEnabled: true })).toBe("scouting");
  expect(normalizeScoutingDatabaseFilterSource("")).toBe("scouting");
});

test("Scouting database source policy classifies loaded database sources for refresh and paging", () => {
  expect(normalizeScoutingDatabaseRecordSource({ source: "api" })).toBe("api");
  expect(normalizeScoutingDatabaseRecordSource({ source: "worker" })).toBe("worker");
  expect(normalizeScoutingDatabaseRecordSource({ source: "fsdb" })).toBe("fsdb");
  expect(normalizeScoutingDatabaseRecordSource({ source: "imported" })).toBe("");

  expect(isScoutingApiDatabaseSource({ source: "api" })).toBe(true);
  expect(isScoutingWorkerDatabaseSource({ source: "worker" })).toBe(true);
  expect(isFootballScienceDbDatabaseSource({ source: "fsdb" })).toBe(true);
  expect(isScoutingPagedDatabaseSource({ source: "api" })).toBe(true);
  expect(isScoutingPagedDatabaseSource({ source: "worker" })).toBe(true);
  expect(isScoutingPagedDatabaseSource({ source: "fsdb" })).toBe(true);
  expect(isScoutingPagedDatabaseSource({ source: "local" })).toBe(false);
});

test("Scouting database source policy normalizes FSDB gender segments and labels", () => {
  expect(normalizeFootballScienceDbGenderSegment(" Women ")).toBe("women");
  expect(normalizeFootballScienceDbGenderSegment("men")).toBe("men");
  expect(normalizeFootballScienceDbGenderSegment("mixed")).toBe("");
  expect(getFootballScienceDbGenderSegmentLabel("women")).toBe("Women's players");
  expect(getFootballScienceDbGenderSegmentLabel("men", { short: true })).toBe("Men's");
  expect(getFootballScienceDbGenderSegmentLabel("", { fallback: "players" })).toBe("players");
});

test("Scouting database source policy factory preserves the workspace source gate", () => {
  const disabledPolicy = createScoutingDatabaseSourcePolicy({
    standaloneFootballScienceDbEnabled: false,
    normalizeText: (value, limit) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit),
  });
  const enabledPolicy = createScoutingDatabaseSourcePolicy({ standaloneFootballScienceDbEnabled: true });

  expect(disabledPolicy.normalizeFilterSource("fsdb")).toBe("scouting");
  expect(disabledPolicy.isPagedDatabase({ source: "worker" })).toBe(true);
  expect(disabledPolicy.getFootballScienceDbGenderSegmentLabel("women", { short: true })).toBe("Women's");
  expect(enabledPolicy.normalizeFilterSource("fsdb")).toBe("fsdb");
});
