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
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const composer = readProjectFile("src/modules/medical/medical-runtime-service-composer.mjs");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const runtimeRenderers = readProjectFile("src/modules/medical/medical-runtime-renderers.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeRenderers).toBe("function");
  expect(app).toContain("createMedicalRuntimeServiceComposition({");
  expect(app).not.toContain("createMedicalRuntimeService({");
  expect(composer).toContain("createMedicalRuntimeService({");
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
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const facade = readProjectFile("src/modules/medical/medical-runtime-facade.mjs");
  const workspaceRenderer = readProjectFile("src/modules/medical/medical-workspace-runtime-renderer.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");
  const workspace = {
    innerHTML: "",
    querySelector: () => null,
  };
  let batchCalls = 0;
  let batchOpen = false;
  let renderedInsideBatch = false;
  const renderer = createMedicalWorkspaceRuntimeRenderer({
    canViewPrivateDetails: () => true,
    ensureState: () => {},
    escapeHtml: (value) => String(value).replaceAll("<", "&lt;"),
    getHeroTeamLogoUrl: () => "assets/team-logos/test-team.svg",
    getHeroTeamName: () => "First Team",
    getOperationsTab: () => "availability",
    getWorkspace: () => workspace,
    normalizeOperationsTab: (value) => value,
    playerModalRenderer: { renderPlayerModal: () => "<aside>Modal</aside>" },
    renderOperationsTopMenu: () => "<nav>Tabs</nav>",
    renderOperationsSystem: () => "<section>System</section>",
    rosterRenderer: {
      renderAvailabilityWorkspace: (message) => {
        renderedInsideBatch = batchOpen;
        return `<main>${message}</main>`;
      },
    },
    setOperationsTab: () => {},
    withEnsuredState: (callback) => {
      batchCalls += 1;
      batchOpen = true;
      try {
        return callback();
      } finally {
        batchOpen = false;
      }
    },
  });

  renderer.renderMedicalTeamWorkspace("Saved.");

  expect(typeof createMedicalWorkspaceRuntimeRenderer).toBe("function");
  expect(workspace.innerHTML).toContain("Medical Room");
  expect(workspace.innerHTML).toContain("First Team");
  expect(workspace.innerHTML).toContain("assets/team-logos/test-team.svg");
  expect(workspace.innerHTML).not.toContain("medical-access-chip");
  expect(workspace.innerHTML).toContain("<main>Saved.</main>");
  expect(batchCalls).toBe(1);
  expect(renderedInsideBatch).toBe(true);
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(runtimeService).toContain("createMedicalRuntimeFacade({");
  expect(accessors).toContain('export function renderMedicalTeamWorkspace(...args) { return callFacade("renderMedicalTeamWorkspace", args); }');
  expect(app).not.toContain("createMedicalWorkspaceRuntimeRenderer({");
  expect(facade).toContain("createMedicalWorkspaceRuntimeRenderer({");
  expect(facade).toContain("withEnsuredState: deps.withMedicalStateReadBatch");
  expect(workspaceRenderer).not.toContain("writeMedicalState");
  expect(workspaceRenderer).not.toContain("recordMedicalDatabaseSyncEvent");
  expect(workspaceRenderer).not.toContain("localStorage");
  expect(index).toContain('export * from "./medical-workspace-runtime-renderer.mjs";');
});
