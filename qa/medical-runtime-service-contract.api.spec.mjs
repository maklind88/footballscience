import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeService } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Medical runtime service owns composition wiring outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const service = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeService).toBe("function");
  expect(app).toContain("createMedicalRuntimeService({");
  expect(app).not.toContain("createMedicalRuntimeRenderers({");
  expect(app).not.toContain("createMedicalRuntimeHelpers({");
  expect(app).not.toContain("createMedicalRuntimeStateService({");
  expect(app).not.toContain("createMedicalRuntimeFacade({");
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(accessors).toContain('export function addMedicalRecord(...args) { return callFacade("addMedicalRecord", args); }');
  expect(accessors).toContain('export function renderMedicalTeamWorkspace(...args) { return callFacade("renderMedicalTeamWorkspace", args); }');
  expect(service).toContain("createMedicalRuntimeRenderers({");
  expect(service).toContain("createMedicalRuntimeHelpers({");
  expect(service).toContain("createMedicalRuntimeStateService({");
  expect(service).toContain("createMedicalRuntimeFacade({");
  expect(service).toContain("get helpers() { return getHelpers(); }");
  expect(service).toContain("get stateService() { return getStateService(); }");
  expect(service).toContain("get facade() { return getFacade(); }");
  expect(index).toContain('export * from "./medical-runtime-service.mjs";');
  expect(index).toContain('export * from "./medical-runtime-accessors.mjs";');
});

test("Medical runtime service preserves protected write ownership", () => {
  const service = readProjectFile("src/modules/medical/medical-runtime-service.mjs");

  expect(service).not.toContain("function addMedicalRecord(values");
  expect(service).not.toContain("function writeMedicalState(");
  expect(service).not.toContain("localStorage");
  expect(service).not.toContain("rawDataSafetySetItem(");
  expect(service).toContain("rawDataSafetySetItem: deps.rawDataSafetySetItem");
  expect(service).toContain('fromStateService("writeMedicalState")');
});
