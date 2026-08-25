import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("platform runtime services composer owns platform-wide service wiring outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const appRuntimeServicesSource = readProjectFile("src/core/platform-app-runtime-services-composer.mjs");
  const composerSource = readProjectFile("src/core/platform-runtime-services-composer.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appSource).toContain("createPlatformAppRuntimeServices({");
  expect(appSource).not.toContain("createPlatformRuntimeServices({");
  expect(appSource).not.toContain("createWorkspaceAccessRuntimeService({");
  expect(appSource).not.toContain("createWorkspaceDataRuntimeService({");
  expect(appSource).not.toContain("createWorkspaceModuleRuntimeController({");
  expect(appSource).not.toContain("createScheduleRuntimeSelectors({");
  expect(appSource).not.toContain("createScheduleWorkspaceController({");
  expect(appSource).not.toContain("createPlatformStructureRuntimeService({");
  expect(appSource).not.toContain("createTransferRoomRuntime({");

  expect(appRuntimeServicesSource).toContain("createPlatformRuntimeServices({");
  expect(appRuntimeServicesSource).not.toMatch(/dashboardChat|DashboardChat|chat-widget/);
  expect(composerSource).toContain("createWorkspaceAccessRuntimeService({");
  expect(composerSource).toContain("createWorkspaceDataRuntimeService({");
  expect(composerSource).toContain("createWorkspaceModuleRuntimeController({");
  expect(composerSource).toContain('import { platformModules } from "./platform-contracts.mjs";');
  expect(composerSource).not.toContain('from "./permissions.mjs"');
  expect(composerSource).toContain('const leaderboardModuleContract = platformModules.find((moduleContract) => moduleContract.id === "leaderboard")');
  expect(composerSource).toContain('canViewLeaderboard: () => currentUserHasLeaderboardRole("viewRoles")');
  expect(composerSource).toContain('canEditLeaderboard: () => currentUserHasLeaderboardRole("editRoles")');
  expect(composerSource).toContain("getActivePlatformTeam: platformStructureRuntimeService.getActivePlatformTeam");
  expect(composerSource).toContain("getPlayerProfilesStateForLeaderboard");
  expect(composerSource).toContain("createScheduleRuntimeSelectors({");
  expect(composerSource).toContain("createScheduleWorkspaceController({");
  expect(composerSource).toContain("createPlatformStructureRuntimeService({");
  expect(composerSource).toContain("createTransferRoomRuntime({");
  expect(composerSource).not.toMatch(/dashboardChat|DashboardChat|chat-widget/);

  expect(packageJson.scripts.check).toContain("src/core/platform-runtime-services-composer.mjs");
  expect(packageJson.scripts.check).toContain("src/core/platform-app-runtime-services-composer.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-runtime-services-composer-contract.api.spec.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-app-runtime-services-composer-contract.api.spec.mjs");
});

test("platform runtime services composer preserves periodization hydration assignments", () => {
  const appSource = readProjectFile("app-runtime.js");
  const appRuntimeServicesSource = readProjectFile("src/core/platform-app-runtime-services-composer.mjs");
  const appRuntimeComposerSource = readProjectFile("src/modules/session-planner/session-planner-app-runtime-composer.mjs");
  const composerSource = readProjectFile("src/core/platform-runtime-services-composer.mjs");

  expect(appSource).toContain("periodizationStateAdapter,");
  expect(appRuntimeServicesSource).toContain("periodizationStateAdapter.defaultPeriodizationState");
  expect(appRuntimeServicesSource).toContain("periodizationStateAdapter.clonePeriodizationState");
  expect(appRuntimeComposerSource).toContain("deps.setPeriodizationState(deps.readPeriodizationState());");
  expect(composerSource).toContain("setPeriodizationState(workspaceDataRuntimeService.readPeriodizationState());");
  expect(composerSource).not.toContain("workspaceDataRuntimeService.readPeriodizationState();");
});
