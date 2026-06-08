import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createScoutingImportHelpers } from "../src/modules/scouting/scouting-import-helpers.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createHelpers(draft = {}) {
  return createScoutingImportHelpers({
    supportedSourceTypes: [
      { id: "xlsx", label: "Excel", extensions: [".xlsx"], parser: "xlsx" },
      { id: "csv", label: "CSV", extensions: [".csv", ".tsv"], parser: "csv" },
      { id: "json", label: "JSON", extensions: [".json"], parser: "json" },
      { id: "generic", label: "Generic", extensions: [], parser: "csv" },
    ],
    normalizeText: (value = "", maxLength = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength),
    normalizeDateValue: (value = "") => String(value || "").trim(),
    normalizeIdentityPart: (value = "", maxLength = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength),
    normalizeLeague: (value = "") => String(value || "").trim().replace(/\s+/g, " "),
    getImportDraft: () => draft,
  });
}

test("Scouting import helpers own import parsing bodies outside scouting-workspace", () => {
  const workspaceSource = readProjectFile("scouting-workspace.js");
  const helperSource = readProjectFile("src/modules/scouting/scouting-import-helpers.mjs");
  const indexSource = readProjectFile("src/modules/scouting/index.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(workspaceSource).toContain('import { createScoutingImportHelpers } from "./src/modules/scouting/scouting-import-helpers.mjs";');
  expect(workspaceSource).toContain("const scoutingImportHelpers = createScoutingImportHelpers({");
  expect(workspaceSource).not.toContain("function parseScoutingSeparatedLine(line = \"\", delimiter = \",\") {");
  expect(workspaceSource).not.toContain("function getScoutingImportMetricQuality(rawValue, minutes = 0) {");
  expect(helperSource).toContain("function parseScoutingSeparatedLine(line = \"\", delimiter = \",\") {");
  expect(helperSource).toContain("function getScoutingImportMetricQuality(rawValue, minutes = 0) {");
  expect(helperSource).not.toContain("writeScoutingState");
  expect(helperSource).not.toContain("sendScoutingApiAction");
  expect(indexSource).toContain('export * from "./scouting-import-helpers.mjs";');
  expect(packageJson.scripts.check).toContain("src/modules/scouting/scouting-import-helpers.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/scouting-import-helpers-contract.api.spec.mjs");
});

test("Scouting import helpers preserve parsing, identity, and metric import behavior", () => {
  const helpers = createHelpers({ sourceSystem: "wyscout", seasonOverride: "2026" });

  expect(helpers.getScoutingImportSourceFromFile("players.csv")).toMatchObject({ id: "csv" });
  expect(helpers.parseScoutingSeparatedLine('"Smith, Jane",NCC,\"8\"')).toEqual(["Smith, Jane", "NCC", "8"]);
  expect(helpers.detectScoutingImportDelimiter(["a;b;c", "1;2;3"])).toBe(";");

  const parsed = helpers.parseScoutingTextRowsToRecords([
    ["Player", "Team", "Minutes"],
    ["Mak Lind", "NCC", "900"],
    ["", "", ""],
  ]);
  expect(parsed).toEqual({
    headers: ["Player", "Team", "Minutes"],
    rows: [{ Player: "Mak Lind", Team: "NCC", Minutes: "900" }],
  });

  expect(helpers.parseScoutingJsonRows({ players: [{ Player: "A", Team: "NCC" }] })).toEqual({
    headers: ["Player", "Team"],
    rows: [{ Player: "A", Team: "NCC" }],
  });
  expect(helpers.parseScoutingMetricValue("1,23")).toBe(1.23);
  expect(helpers.parseScoutingMetricValue("~450")).toBe(450);
  expect(helpers.getScoutingImportMetricDirection("Errors against")).toBe("lower");
  expect(helpers.getScoutingImportMetricQuality("estimated 8.4", 900)).toBe("estimated");
  expect(helpers.getScoutingImportMetricQuality("8.4", 300)).toBe("estimated");
  expect(helpers.getScoutingImportMetricQuality("8.4", 900)).toBe("trusted");

  const map = {
    player: "Player",
    dateOfBirth: "DOB",
    passportCountry: "Nation",
    sourceRecordId: "Record ID",
    season: "Season",
    league: "League",
    team: "Team",
    wyscoutId: "Wyscout ID",
  };
  const row = {
    Player: "Mak Lind",
    DOB: "2000-01-01",
    Nation: "SE",
    "Record ID": "",
    Season: "2025",
    League: "NWSL",
    Team: "NCC",
    "Wyscout ID": "ws-1",
  };
  const playerSourceId = helpers.buildScoutingPlayerSourceId(row, map);
  expect(playerSourceId).toContain("wyscoutid-ws-1");
  expect(helpers.buildScoutingRecordSourceId(row, map, playerSourceId)).toMatch(/^wyscout::/);
  expect(helpers.getScoutingImportMergeKey("wyscout", playerSourceId, "2026", "NWSL", "NCC")).toContain("|2026|NWSL|NCC");
});
