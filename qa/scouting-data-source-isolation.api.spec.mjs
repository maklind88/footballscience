import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function readJavascriptPayload(relativePath) {
  const source = readProjectFile(relativePath).trim();
  const assignmentIndex = source.indexOf("=");
  return JSON.parse(source.slice(assignmentIndex + 1).replace(/;$/, ""));
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
  expect(preview.totalRecords).toBe(database.records.length);
  expect(preview.records).toEqual(database.records.slice(0, preview.records.length));
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
