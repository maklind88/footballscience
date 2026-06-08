import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("app runtime services composer owns app-level service wiring outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const appComposerSource = readProjectFile("src/core/platform-app-runtime-services-composer.mjs");
  const servicesComposerSource = readProjectFile("src/core/platform-runtime-services-composer.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appSource).toContain('import { createPlatformAppRuntimeServices } from "./src/core/platform-app-runtime-services-composer.mjs";');
  expect(appSource).toContain("createPlatformAppRuntimeServices({");
  expect(appSource).not.toContain("createPlatformRuntimeServices({");
  expect(appSource).not.toContain("const defaultScheduleState = createDefaultScheduleState();");
  expect(appSource).not.toContain("const importedNccScheduleEvents = Array.isArray(win.__importedNccScheduleEvents)");

  expect(appComposerSource).toContain("createPlatformRuntimeServices({");
  expect(appComposerSource).toContain("createDefaultScheduleState()");
  expect(appComposerSource).toContain("Array.isArray(deps.win?.__importedNccScheduleEvents)");
  expect(appComposerSource).toContain("periodizationStateAdapter.defaultPeriodizationState");
  expect(appComposerSource).toContain("deps.normalizePlatformStructureText?.(");
  expect(appComposerSource).not.toMatch(/dashboardChat|DashboardChat|chat-widget/);
  expect(servicesComposerSource).toContain("createWorkspaceDataRuntimeService({");

  expect(packageJson.scripts.check).toContain("src/core/platform-app-runtime-services-composer.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/platform-app-runtime-services-composer-contract.api.spec.mjs");
});

test("app runtime services composer preserves the moved dependency map", () => {
  const appComposerSource = readProjectFile("src/core/platform-app-runtime-services-composer.mjs");

  [
    "defaultScheduleState: createDefaultScheduleState()",
    "importedNccScheduleEvents,",
    "importedNccScheduleVersion,",
    "cloneScheduleState,",
    "mergeImportedScheduleEvents,",
    "scheduleEventTypes,",
    "defaultScoutingState,",
    "cloneScoutingState,",
    "preserveScoutingTransientUiState,",
    "getScoutingTeamName,",
    "getScheduleDayWarningsFromModule,",
    "getScheduleMainEventFromModule,",
    "periodizationStateAdapter.isDateValueInYear",
    "periodizationStateAdapter.normalizePeriodizationDay",
    "platformDefaultClubId,",
    "platformDefaultTeamId,",
    "transferRoomStorageKey,",
  ].forEach((snippet) => {
    expect(appComposerSource).toContain(snippet);
  });

  expect(appComposerSource).toContain("return createPlatformRuntimeServices({");
  expect(appComposerSource).not.toContain("createTransferRoomRuntime({");
  expect(appComposerSource).not.toContain("createWorkspaceDataRuntimeService({");
});
