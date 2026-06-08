import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeRenderers } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Medical runtime renderers own renderer and selector wiring outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const runtimeRenderers = readProjectFile("src/modules/medical/medical-runtime-renderers.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeRenderers).toBe("function");
  expect(app).toContain("createMedicalRuntimeRenderers({");
  expect(app).not.toContain("createMedicalOptionSelectors({");
  expect(app).not.toContain("createMedicalRosterRenderer({");
  expect(runtimeRenderers).toContain("createMedicalOptionSelectors({");
  expect(runtimeRenderers).toContain("createMedicalRosterRenderer({");
  expect(runtimeRenderers).toContain("medicalPlayerModalRenderer");
  expect(index).toContain('export * from "./medical-runtime-renderers.mjs";');
});

test("Medical runtime renderer factory does not own protected write paths", () => {
  const runtimeRenderers = readProjectFile("src/modules/medical/medical-runtime-renderers.mjs");

  expect(runtimeRenderers).not.toContain("localStorage");
  expect(runtimeRenderers).not.toContain("writeMedical");
  expect(runtimeRenderers).not.toContain("recordMedicalDatabaseSyncEvent");
  expect(runtimeRenderers).not.toContain("rawDataSafetySetItem");
});
