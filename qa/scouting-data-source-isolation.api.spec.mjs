import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function evaluateJavascriptPayload(relativePath) {
  const source = readProjectFile(relativePath).trim();
  const context = { self: {}, window: {} };
  vm.runInNewContext(source, context);
  return context;
}

function readJavascriptPayload(relativePath) {
  const context = evaluateJavascriptPayload(relativePath);
  if (relativePath === "scouting-import-data.js") {
    return context.window.__footballScienceBundledScoutingDatabase;
  }
  if (relativePath === "scouting-import-preview-data.js") {
    return context.window.__footballScienceScoutingPreviewDatabase;
  }
  if (relativePath === "scouting-import-nwsl-profile-data.js") {
    return context.window.__footballScienceNwslScoutingProfileDatabase;
  }
  if (relativePath === "scouting-import-manifest.js") {
    return context.self.__footballScienceScoutingDatabaseManifest;
  }
  if (relativePath === "scouting-statsbomb-data.js") {
    return context.self.__footballScienceNwslStatsbombDatabase;
  }
  throw new Error(`Unknown JavaScript payload: ${relativePath}`);
}

test("the standard scouting database excludes the isolated StatsBomb source", () => {
  const database = readJavascriptPayload("scouting-import-data.js");
  const columns = Object.fromEntries(database.recordColumns.map((column, index) => [column, index]));
  const firstRecord = database.records[0];

  expect(database.records).toHaveLength(24_351);
  expect(database.metrics).toHaveLength(100);
  expect(database.sheets).toHaveLength(49);
  expect(database.sheets.some((sheet) => sheet.name === "NWSL (Statsbomb)")).toBe(false);
  expect(firstRecord[columns.player]).toBe("J. Rybrink");
  expect(firstRecord[columns.league]).toBe("Damallsvenskan");
  expect(firstRecord[columns.season]).toBe("2023");
});

test("the full database, preview, and manifest stay version aligned", () => {
  const database = readJavascriptPayload("scouting-import-data.js");
  const preview = readJavascriptPayload("scouting-import-preview-data.js");
  const profile = readJavascriptPayload("scouting-import-nwsl-profile-data.js");
  const manifest = readJavascriptPayload("scouting-import-manifest.js");

  expect(manifest.full).toMatchObject({
    schema: database.schema,
    version: database.version,
    records: database.records.length,
    metrics: database.metrics.length,
  });
  expect(manifest.preview).toMatchObject({
    schema: preview.schema,
    version: preview.version,
    records: preview.records.length,
    metrics: preview.metrics.length,
  });
  expect(manifest.profile).toMatchObject({
    script: "scouting-import-nwsl-profile-data.js",
    schema: profile.schema,
    version: profile.version,
    parentVersion: database.version,
    league: "NWSL",
    records: profile.records.length,
    metrics: profile.metrics.length,
  });
  expect(preview.totalRecords).toBe(database.records.length);
  expect(preview.records).toEqual(database.records.slice(0, preview.records.length));
});

test("the Squad profile payload contains only the canonical NWSL rows", () => {
  const database = readJavascriptPayload("scouting-import-data.js");
  const profile = readJavascriptPayload("scouting-import-nwsl-profile-data.js");
  const leagueIndex = database.recordColumns.indexOf("league");
  const expectedRecords = database.records.filter((record) => record[leagueIndex] === "NWSL");

  expect(profile).toMatchObject({
    schema: "football-science-scouting-profile-import",
    parentVersion: database.version,
    datasetScope: { league: "NWSL" },
    totalRecords: database.records.length,
  });
  expect(profile.records).toHaveLength(1_400);
  expect(profile.metrics).toEqual(database.metrics);
  expect(profile.records).toEqual(expectedRecords);
  expect(readProjectFile("scouting-import-nwsl-profile-data.js").length).toBeLessThan(
    readProjectFile("scouting-import-data.js").length / 10
  );
});

test("the bundled scouting database remains stable when the active database changes", () => {
  const context = evaluateJavascriptPayload("scouting-import-data.js");
  const bundledDatabase = context.window.__footballScienceBundledScoutingDatabase;

  expect(context.window.__footballScienceScoutingDatabase).toBe(bundledDatabase);
  context.window.__footballScienceScoutingDatabase = {
    source: "fsdb",
    metrics: [],
    records: [],
    page: { mode: "fsdb" },
  };

  expect(context.window.__footballScienceBundledScoutingDatabase).toBe(bundledDatabase);
  expect(context.window.__footballScienceBundledScoutingDatabase.records).toHaveLength(24_351);
  expect(context.window.__footballScienceScoutingDatabase).not.toBe(bundledDatabase);
});

test("the StatsBomb source is preserved as a separate unloaded database", () => {
  const database = readJavascriptPayload("scouting-statsbomb-data.js");
  const columnIds = database.columns.map((column) => column.id);
  const primaryKeyIndex = database.columns.find((column) => column.id === database.primaryKeyColumn)?.index;
  const playerIds = database.records.map((record) => String(record[primaryKeyIndex]));

  expect(database).toMatchObject({
    schema: "football-science-statsbomb-player-database",
    sourceSheet: "NWSL (Statsbomb)",
    integrationStatus: "isolated-awaiting-rules",
    loadedByApplication: false,
    primaryKeyColumn: "player-sbd-id",
  });
  expect(database.records).toHaveLength(354);
  expect(database.columns).toHaveLength(217);
  expect(new Set(columnIds).size).toBe(217);
  expect(new Set(playerIds).size).toBe(354);
  expect(columnIds).toContain("line-breaking-passes-to-space-10m-2");
  expect(columnIds).toContain("line-breaking-passes-to-space-10m-in-final-third-2");
});

test("the manifest advertises isolation without loading the source into application flows", () => {
  const manifest = readJavascriptPayload("scouting-import-manifest.js");
  const applicationSources = [
    readProjectFile("index.html"),
    readProjectFile("scouting-database-worker.js"),
    readProjectFile("scouting-workspace.js"),
    readProjectFile("transfer-room.js"),
    readProjectFile("src/modules/squad/squad-scouting-runtime.mjs"),
  ];

  expect(manifest.isolatedSources).toEqual([
    expect.objectContaining({
      script: "scouting-statsbomb-data.js",
      records: 354,
      columns: 217,
      integrationStatus: "isolated-awaiting-rules",
      loadedByApplication: false,
    }),
  ]);
  applicationSources.forEach((source) => expect(source).not.toContain("scouting-statsbomb-data.js"));
});
