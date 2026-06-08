import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("workspace runtime composer owns non-chat workspace service composition outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const composerSource = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appSource).toContain("createWorkspaceRuntimeComposition({");
  expect(appSource).not.toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(appSource).not.toContain("createProfileStaffWorkspaceController({");
  expect(appSource).not.toContain("createPlayerProfileRuntimeFacade({");
  expect(appSource).not.toContain("createPeriodizationRuntimeBindings({");
  expect(appSource).not.toContain("createWorkspaceShellController({");
  expect(appSource).not.toContain("createCentralAppStateReloadService({");

  expect(composerSource).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(composerSource).toContain("createProfileStaffWorkspaceController({");
  expect(composerSource).toContain("createPlayerProfileRuntimeFacade({");
  expect(composerSource).toContain("createPeriodizationRuntimeBindings({");
  expect(composerSource).toContain("createWorkspaceShellController({");
  expect(composerSource).toContain("createCentralAppStateReloadService({");
  expect(composerSource).not.toMatch(/createDashboardChatWidgetRenderer|sendDashboardChatApiAction|chat-widget/);

  expect(packageJson.scripts.check).toContain("src/core/workspace-runtime-composer.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/workspace-runtime-composer-contract.api.spec.mjs");
});

test("workspace runtime composer preserves runtime state assignment boundaries", () => {
  const composerSource = readProjectFile("src/core/workspace-runtime-composer.mjs");

  expect(composerSource).toContain("deps.configurePlayerProfileRuntimeAccessors(() => playerProfileRuntimeFacade);");
  expect(composerSource).toContain("getSessionPlannerPeriodizationBridge: () => sessionPlannerPeriodizationBridge");
  expect(composerSource).toContain("centralAppStateReloadService");
  expect(composerSource).toContain("workspaceShellController");
  expect(composerSource).toContain("renderProfileWorkspace");
  expect(composerSource).toContain("renderStaffWorkspace");
  expect(composerSource).toContain("const renderWorkspaceByViewId = (activeViewId) =>");
  expect(composerSource).toContain('if (activeViewId === "session-planner") deps.renderSessionPlannerWorkspace();');
});
