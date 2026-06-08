import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sessionPlannerDefaultExerciseLibrary,
  sessionPlannerExerciseLibraryBackupStorageKey,
  sessionPlannerExerciseLibraryFoldersBackupStorageKey,
  sessionPlannerExerciseLibraryFoldersStorageKey,
  sessionPlannerExerciseLibraryStorageKey,
  sessionPlannerExerciseLibraryVersionLimit,
  sessionPlannerLibrarySortOptions,
} from "../src/modules/exercise-library/index.mjs";
import { createSessionPlannerAppRuntimeComposition } from "../src/modules/session-planner/session-planner-app-runtime-composer.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function createStorageStub() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function createComposerDeps() {
  const noop = () => {};
  const identity = (value) => value;
  const selectedBlock = { id: "block-1", phase: "", subPhase: "" };
  const sessionPlannerState = { selectedDate: "2026-05-29", sessions: {} };
  return {
    canEditSessionPlanner: () => true,
    canRemoveSessionPlannerLibraryExerciseFromSelectedFolder: () => true,
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    dataSafetySnapshotStoreName: "snapshots",
    escapeHtml: (value) => String(value ?? ""),
    formatScheduleDateValue: () => "2026-05-29",
    getCurrentPlatformUser: () => ({ id: "coach-1" }),
    getHubState: () => ({ activeWorkspaceId: "session-planner" }),
    getPeriodizationState: () => ({ days: {} }),
    getScheduleEventsForDate: () => [],
    getScheduleMainEvent: () => null,
    getScheduledSessionTitleForDate: () => "Training",
    getSessionPlannerExerciseLibraryFoldersState: () => [],
    getSessionPlannerExerciseLibraryState: () => [],
    getSessionPlannerSelectedBlock: () => selectedBlock,
    getSessionPlannerState: () => sessionPlannerState,
    getSessionPlannerWorkspaceController: () => ({ renderWorkspace: noop }),
    isScheduleSessionEvent: () => false,
    logEvent: noop,
    normalizeSessionPlannerPlayerBoardColorsFromModule: () => ({}),
    normalizeSessionPlannerPlayerBoardCustomPeopleFromModule: () => [],
    normalizeSessionPlannerPlayerBoardPositionsFromModule: () => ({}),
    openDataSafetyDatabase: async () => null,
    periodizationOptionLibrary: { matchPhases: ["Build Up"], subPhases: ["High Press"] },
    readPeriodizationState: () => ({ days: {} }),
    renderSessionPlannerWorkspace: noop,
    runtimeRendererDeps: {
      buildMedicalPlayerFromPlayerProfile: identity,
      canEditSessionPlanner: () => true,
      clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
      compareMedicalPlayers: () => 0,
      createMedicalRecordFromSquadAvailabilityBlock: identity,
      escapeHtml: (value) => String(value ?? ""),
      formatScheduleDateValue: () => "2026-05-29",
      getDashboardSessionTotalMinutes: () => 75,
      getMedicalAvailabilityItems: () => [],
      getMedicalCoachComment: () => "",
      getMedicalPlayerAvailabilityStatusOption: () => ({ label: "Available" }),
      getMedicalRecordStatus: () => "",
      getMedicalRtpPhaseOption: () => ({ label: "None" }),
      getPeriodizationDay: () => ({}),
      getPeriodizationDayScheduleLabel: () => "",
      getPeriodizationMatchDayLabel: () => "",
      getPlayerProfileRosterLabel: () => "",
      getPlayerProfileRoleOptions: () => [],
      getPlayerProfileTemporaryWindowLabel: () => "",
      getScheduleSessionEventForDate: () => null,
      getSelectedMedicalDate: () => "2026-05-29",
      getSessionPlannerDateLabel: () => "29 May",
      getSessionPlannerMedicalAvailability: () => [],
      getSessionPlannerPlayerBoardBridgeBestMatches: () => [],
      getSessionPlannerPlayerBoardBridgeContract: () => null,
      getSessionPlannerPlayerBoardBridgeRoleLabel: () => "",
      getSessionPlannerPlayerBoardBridgeSummary: () => "",
      getSessionPlannerPlayerBoardColorOptions: () => [],
      getSessionPlannerPlayerBoardCustomPerson: () => null,
      getSessionPlannerPlayerBoardMaxTeamCount: () => 4,
      getSessionPlannerPlayerBoardPlayers: () => [],
      getSessionPlannerPlayerBoardPosition: () => null,
      getSessionPlannerPlayerBoardPositionById: () => null,
      getSessionPlannerPlayerBoardProfileState: () => ({}),
      getSessionPlannerPlayerBoardReadableSpacing: () => "",
      getSessionPlannerPlayerBoardSelectedColorIds: () => [],
      getSessionPlannerPlayerBoardSummary: () => "",
      getSessionPlannerPlayerBoardSyncedPlayer: () => null,
      getSessionPlannerPlayerBoardWarnings: () => [],
      getSessionPlannerPrintPaperOptions: () => [],
      getSessionPlannerPrintSectionOptions: () => [],
      getSessionPlannerReadablePlayerBoardPositions: () => [],
      getSessionPlannerSelectedBlock: () => selectedBlock,
      getSessionPlannerSelectedSession: () => ({}),
      getSessionPlannerTacticalActiveFrameId: () => "",
      getSessionPlannerTacticalPitchModeOptions: () => [],
      getSessionPlannerTacticalSelectedElementIds: () => [],
      getScheduledSessionTitleForDate: () => "Training",
      isMedicalPlayerBlockedBySquadAvailability: () => false,
      isPlayerProfileTemporaryActiveOnDate: () => false,
      isSessionPlannerTacticalElementSelected: () => false,
      isSessionPlannerTacticalEndpointElement: () => false,
      isTemporaryPlayerProfile: () => false,
      medicalActualParticipationFallback: "none",
      medicalOperationsTabOptions: [],
      medicalPlayerModalTabOptions: [],
      normalizeMedicalActualParticipation: identity,
      normalizePlayerProfileRole: identity,
      normalizeSessionPlannerMultiValue: identity,
      normalizeSessionPlannerTimestamp: identity,
      parseScheduleDateValue: () => new Date("2026-05-29T00:00:00.000Z"),
      periodizationOptionLibrary: { matchPhases: ["Build Up"], subPhases: ["High Press"] },
      renderSessionPlannerActionIcon: () => "",
      renderSessionPlannerExerciseVisual: () => "",
      renderSessionPlannerPeriodizationOverlay: () => "",
      renderSessionPlannerPeriodizationSummary: () => "",
      renderSessionPlannerTacticalSelectionBox: () => "",
      syncSessionPlannerPlayerBoardSelection: noop,
      ensureSessionPlannerTacticalFrames: () => [],
    },
    saveDataSafetySnapshot: noop,
    sessionPlannerBlockFieldUpdatedAtKey: "fieldUpdatedAt",
    sessionPlannerBlockMergeFieldSet: new Set(["phase", "subPhase"]),
    sessionPlannerBlockMergeFields: ["phase", "subPhase"],
    sessionPlannerDefaultExerciseLibrary,
    sessionPlannerExerciseLibraryBackupStorageKey,
    sessionPlannerExerciseLibraryFoldersBackupStorageKey,
    sessionPlannerExerciseLibraryFoldersStorageKey,
    sessionPlannerExerciseLibraryStorageKey,
    sessionPlannerExerciseLibraryVersionLimit,
    sessionPlannerLibrarySortOptions,
    sessionPlannerPlayerBoardAutoModeOptions: [],
    sessionPlannerPlayerBoardMaxTeamCount: 4,
    sessionPlannerPrintSectionOptions: [],
    sessionPlannerTacticalMaxFrames: 6,
    sessionPlannerTacticalPitchModeKeys: new Set(["full"]),
    sessionPlannerTacticalPitchModeOptions: [{ id: "full", label: "Full" }],
    setPeriodizationState: noop,
    setSessionPlannerExerciseLibrary: noop,
    setSessionPlannerExerciseLibraryFolders: noop,
    showSessionPlannerToast: noop,
    syncSelectedSessionPlannerBlockFieldsFromDom: noop,
    ui: {},
    updateSelectedSessionPlannerBlockField: noop,
    win: { confirm: () => true, localStorage: createStorageStub() },
  };
}

test("Session Planner app runtime composition owns extracted wiring outside app-runtime", () => {
  const appRuntime = readProjectFile("app-runtime.js");
  const composer = readProjectFile("src/modules/session-planner/session-planner-app-runtime-composer.mjs");
  const index = readProjectFile("src/modules/session-planner/index.mjs");
  const packageJson = readProjectFile("package.json");

  expect(appRuntime).toContain("createSessionPlannerAppRuntimeComposition({");
  expect(appRuntime).not.toContain("createExerciseLibraryRuntimeController({");
  expect(appRuntime).not.toContain("createExerciseLibraryActions({");
  expect(appRuntime).not.toContain("createExerciseLibraryRuntimeFacade({");
  expect(appRuntime).not.toContain("createSessionPlannerRuntimeRenderers({");
  expect(appRuntime).not.toContain("createSessionPlannerLocalUiState({");
  expect(appRuntime).not.toContain("configureSessionPlannerRuntimeAccessors(() => ({");
  expect(composer).toContain("createExerciseLibraryRuntimeController({");
  expect(composer).toContain("createExerciseLibraryActions({");
  expect(composer).toContain("createExerciseLibraryRuntimeFacade({");
  expect(composer).toContain("createSessionPlannerRuntimeRenderers({");
  expect(composer).toContain("createSessionPlannerLocalUiState({");
  expect(composer).toContain("configureSessionPlannerRuntimeAccessors(() => ({");
  expect(composer).not.toMatch(/dashboardChat|DashboardChat|chat-widget/);
  expect(index).toContain('export * from "./session-planner-app-runtime-composer.mjs";');
  expect(packageJson).toContain("src/modules/session-planner/session-planner-app-runtime-composer.mjs");
  expect(packageJson).toContain("qa/session-planner-app-runtime-composer-contract.api.spec.mjs");
});

test("Session Planner app runtime composition keeps block creation and local UI state behavior", () => {
  const composition = createSessionPlannerAppRuntimeComposition(createComposerDeps());
  const block = composition.createSessionPlannerBlock({
    title: "Pressing wave",
    phase: ["Build Up"],
    subPhase: ["High Press"],
    minutes: 12,
  });

  expect(composition.sessionPlannerMultiSelectFields.has("phase")).toBe(true);
  expect(composition.sessionPlannerMultiSelectFields.has("subPhase")).toBe(true);
  expect(block.title).toBe("Pressing wave");
  expect(block.phase).toBe("Build Up");
  expect(block.subPhase).toBe("High Press");
  expect(block.minutes).toBe(12);
  expect(composition.sessionPlannerLocalUiState.state.sessionPlannerLibraryOpen).toBe(false);
  composition.setSessionPlannerMultiSelectOpenField("phase");
  expect(composition.getSessionPlannerMultiSelectOpenField()).toBe("phase");
  expect(typeof composition.exerciseLibraryRuntimeFacade.getSessionPlannerExerciseLibrary).toBe("function");
  expect(typeof composition.exerciseLibraryActions.commitExercise).toBe("function");

  expect(() =>
    composition.configureRuntimeAccessors({
      getSessionPlannerRuntimeStateService: () => ({}),
      getSessionPlannerStateMergeHelpers: () => ({}),
      getSessionPlannerToastController: () => ({}),
    })
  ).not.toThrow();
});
