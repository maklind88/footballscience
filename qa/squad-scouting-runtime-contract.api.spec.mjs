import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Squad Scouting runtime owns read-only scouting spider wiring outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const runtimeSource = readProjectFile("src/modules/squad/squad-scouting-runtime.mjs");
  const indexSource = readProjectFile("src/modules/squad/index.mjs");

  expect(appSource).toContain("createSquadScoutingRuntime({");
  expect(appSource).not.toContain("playerProfileScoutingSpiderTemplates");
  expect(appSource).not.toContain("function getPlayerProfileScoutingDatabase()");
  expect(appSource).not.toContain("function queuePlayerProfileScoutingDatabaseLoad()");
  expect(runtimeSource).toContain("createSquadScoutingProfileHelpers({");
  expect(runtimeSource).toContain("createSquadScoutingSpiderRenderer({");
  expect(runtimeSource).toContain("renderPlayerProfileScoutingSpider:");
  expect(indexSource).toContain('export * from "./squad-scouting-runtime.mjs";');
});

test("Squad Scouting runtime lets an imported Excel cache override the bundled fallback database", () => {
  const runtimeSource = readProjectFile("src/modules/squad/squad-scouting-runtime.mjs");

  expect(runtimeSource.indexOf("win.__footballScienceImportedScoutingDatabase")).toBeLessThan(runtimeSource.indexOf("win.localStorage?.getItem(playerProfileScoutingDatabaseStorageKey)"));
  expect(runtimeSource.indexOf("win.localStorage?.getItem(playerProfileScoutingDatabaseStorageKey)")).toBeLessThan(runtimeSource.indexOf("win.__footballScienceScoutingDatabase"));
});

test("Squad Scouting runtime loads the NWSL profile payload instead of the full player database", () => {
  const runtimeSource = readProjectFile("src/modules/squad/squad-scouting-runtime.mjs");

  expect(runtimeSource).toContain("win.__footballScienceNwslScoutingProfileDatabase");
  expect(runtimeSource).toContain('loadScript("scouting-import-nwsl-profile", "scouting-import-nwsl-profile-data.js"');
  expect(runtimeSource).not.toContain('loadScript("scouting-import-data", "scouting-import-data.js"');
});

test("Squad Scouting runtime stays read-only and does not own Squad writes", () => {
  const runtimeSource = readProjectFile("src/modules/squad/squad-scouting-runtime.mjs");

  expect(runtimeSource).not.toContain("setItem");
  expect(runtimeSource).not.toContain("rawDataSafetySetItem");
  expect(runtimeSource).not.toContain("queueCentralStateWrite");
  expect(runtimeSource).not.toContain("writePlayerProfilesState");
  expect(runtimeSource).not.toContain("writeMedicalState");
});
