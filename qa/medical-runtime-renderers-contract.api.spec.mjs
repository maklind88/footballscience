import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeRenderers, createMedicalWorkspaceRuntimeRenderer } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Medical runtime renderers own renderer and selector wiring outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const runtimeRenderers = readProjectFile("src/modules/medical/medical-runtime-renderers.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeRenderers).toBe("function");
  expect(app).toContain("createMedicalRuntimeService({");
  expect(app).not.toContain("createMedicalRuntimeRenderers({");
  expect(runtimeService).toContain("createMedicalRuntimeRenderers({");
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

test("Medical workspace runtime renderer owns shell rendering outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const facade = readProjectFile("src/modules/medical/medical-runtime-facade.mjs");
  const workspaceRenderer = readProjectFile("src/modules/medical/medical-workspace-runtime-renderer.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");
  const workspace = {
    innerHTML: "",
    querySelector: () => null,
  };
  const renderer = createMedicalWorkspaceRuntimeRenderer({
    canViewPrivateDetails: () => true,
    ensureState: () => {},
    escapeHtml: (value) => String(value).replaceAll("<", "&lt;"),
    getAccessLabel: () => "Private",
    getHeroTeamName: () => "First Team",
    getOperationsTab: () => "availability",
    getWorkspace: () => workspace,
    normalizeOperationsTab: (value) => value,
    playerModalRenderer: { renderPlayerModal: () => "<aside>Modal</aside>" },
    renderOperationsTopMenu: () => "<nav>Tabs</nav>",
    renderOperationsSystem: () => "<section>System</section>",
    rosterRenderer: { renderAvailabilityWorkspace: (message) => `<main>${message}</main>` },
    setOperationsTab: () => {},
  });

  renderer.renderMedicalTeamWorkspace("Saved.");

  expect(typeof createMedicalWorkspaceRuntimeRenderer).toBe("function");
  expect(workspace.innerHTML).toContain("Medical Team");
  expect(workspace.innerHTML).toContain("First Team");
  expect(workspace.innerHTML).toContain("<main>Saved.</main>");
  expect(app).toContain("const medicalRuntimeFacade = medicalRuntimeService.facade;");
  expect(runtimeService).toContain("createMedicalRuntimeFacade({");
  expect(app).toContain("function renderMedicalTeamWorkspace(...args)");
  expect(app).not.toContain("createMedicalWorkspaceRuntimeRenderer({");
  expect(facade).toContain("createMedicalWorkspaceRuntimeRenderer({");
  expect(workspaceRenderer).not.toContain("writeMedicalState");
  expect(workspaceRenderer).not.toContain("recordMedicalDatabaseSyncEvent");
  expect(workspaceRenderer).not.toContain("localStorage");
  expect(index).toContain('export * from "./medical-workspace-runtime-renderer.mjs";');
});
