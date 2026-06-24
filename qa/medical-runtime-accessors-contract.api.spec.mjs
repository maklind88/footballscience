import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as medicalRuntimeAccessors from "../src/modules/medical/medical-runtime-accessors.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const helperNames = [
  "compareMedicalPlayers",
  "getCurrentMedicalActorId",
  "getMedicalCanonicalPositionFromText",
  "getMedicalClearanceValues",
  "getMedicalDataSafetyCounts",
  "getMedicalEntityUpdatedMs",
  "getMedicalGateOption",
  "getMedicalLoadGateValues",
  "getMedicalLinkedPlayerProfile",
  "getMedicalPlayerAvailabilityStatus",
  "getMedicalPlayerAvailabilityStatusOption",
  "getMedicalPlayerNumberRank",
  "getMedicalPlayerPositionRank",
  "getMedicalPlayerRosterOrder",
  "getMedicalPlayerSquadAvailabilityBlockReason",
  "getMedicalRtpPhaseForRecommendation",
  "getMedicalRtpPhaseOption",
  "getMedicalStatusActivityType",
  "getMedicalStatusForParticipation",
  "getMedicalStatusOption",
  "getMedicalStatusOptionForActivity",
  "getMedicalStatusOptionForDateFromHelper",
  "getMedicalTimestampMs",
  "isMedicalItemArchived",
  "isMedicalPlayerBlockedBySquadAvailability",
  "normalizeMedicalActualParticipation",
  "normalizeMedicalClearance",
  "normalizeMedicalDataSafety",
  "normalizeMedicalGovernancePolicy",
  "normalizeMedicalInjuryPlan",
  "normalizeMedicalLoadGates",
  "normalizeMedicalParticipation",
  "normalizeMedicalPlayer",
  "normalizeMedicalPlayerAvailabilityStatus",
  "normalizeMedicalPlayerPosition",
  "normalizeMedicalPositionText",
  "normalizeMedicalShareValue",
  "normalizeMedicalTimestamp",
  "normalizeMedicalRecord",
  "sanitizeMedicalGovernancePolicyForCoachView",
];

const stateServiceNames = [
  "getMedicalStatusOptionForDate",
  "syncMedicalPlayerAvailabilityStatusesFromProfiles",
  "markMedicalClinicalChange",
  "commitMedicalClinicalState",
  "updateMedicalDatabaseSyncStatus",
  "cloneMedicalState",
  "canViewPrivateMedicalDetails",
  "sanitizeMedicalRecordForCoachView",
  "sanitizeMedicalInjuryPlanForCoachView",
  "sanitizeMedicalStateForCurrentUser",
  "setMedicalStateStorageValue",
  "readMedicalState",
  "writeMedicalState",
  "ensureMedicalState",
];

const facadeNames = [
  "getMedicalAccessLabel",
  "getMedicalHeroTeamName",
  "getSelectedMedicalPlayer",
  "getActiveMedicalPlayers",
  "isMedicalPlayerVisibleForDate",
  "getActiveMedicalPlayersForDate",
  "isMedicalInjuryPlanActive",
  "getMedicalPlayerInjuryPlans",
  "getActiveMedicalInjuryPlan",
  "createMedicalRecordFromSquadAvailabilityBlock",
  "isMedicalPlanCleared",
  "getMedicalRecommendationBlockReason",
  "getMedicalReviewAlerts",
  "getMedicalCoachComment",
  "getMedicalVisibleComment",
  "getMedicalPlayerRtpCoachStatus",
  "loadMedicalPlayerRtpCoachStatus",
  "createMedicalRecordFromInjuryPlan",
  "getLatestMedicalRecord",
  "getMedicalPlayerRecords",
  "isMedicalRestrictedRecommendationRecord",
  "getMedicalPlayerRestrictedLogRecords",
  "getMedicalWindowDates",
  "getMedicalPastWindowDates",
  "getMedicalMonthToDateDates",
  "getMedicalScheduleSummary",
  "getMedicalRecommendationEvent",
  "getMedicalRecommendationActivityContext",
  "getMedicalRecordStatus",
  "getDefaultMedicalInjuryPlanDraft",
  "normalizeMedicalInjuryPlanDraft",
  "getMedicalInjuryPlanDraft",
  "setMedicalInjuryPlanDraft",
  "setMedicalInjuryPlanDraftFromPlan",
  "clearMedicalInjuryPlanDraft",
  "getMedicalInjuryPlanFormDraft",
  "persistMedicalInjuryPlanDraftFromForm",
  "getMedicalDailyStats",
  "getMedicalWindowAverage",
  "getMedicalParticipationAverageForDates",
  "getMedicalMonthAverageStats",
  "getMedicalAttentionPlayers",
  "getMedicalPositionSummaries",
  "getMedicalDaySpan",
  "getMedicalDailyHuddle",
  "getMedicalCoachHandoverItems",
  "buildMedicalCoachHandoverText",
  "recordMedicalAuditEvent",
  "getMedicalDatabasePlayer",
  "buildMedicalDatabaseStateSummary",
  "getMedicalDatabaseIdempotencyKey",
  "recordMedicalDatabaseSyncEvent",
  "copyMedicalCoachHandoverToClipboard",
  "getMedicalPlayerProfileSummary",
  "getFilteredMedicalPlayers",
  "getMedicalValidBulkSelection",
  "getMedicalBulkSelectedPlayers",
  "getMedicalBulkRecommendationEligiblePlayers",
  "toggleMedicalBulkPlayer",
  "setMedicalBulkSelection",
  "setMedicalBulkNotSetSelection",
  "applyMedicalQuickRecommendation",
  "applyMedicalBulkRecommendation",
  "updateMedicalBulkActivityControls",
  "updateMedicalGovernancePolicy",
  "getMedicalPlanTotalDays",
  "getMedicalPlanElapsedDays",
  "getMedicalPlanDaysRemaining",
  "getMedicalPlanSeverity",
  "getMedicalPlanClearanceSummary",
  "getMedicalPlanReviewState",
  "getMedicalTrailingRecommendationSummary",
  "getMedicalSeasonPlans",
  "getMedicalActiveCaseItems",
  "getMedicalHistoryEvents",
  "getMedicalSeasonSummary",
  "getMedicalPlayerRiskSignal",
  "getMedicalRiskSignals",
  "getMedicalOperationsSummary",
  "renderMedicalOperationsTopMenu",
  "renderMedicalOperationsSystem",
  "getMedicalRosterPositionGroups",
  "getMedicalRosterPositionStats",
  "renderMedicalTeamWorkspace",
  "upsertMedicalPlayers",
  "addMedicalRecord",
  "updateMedicalPlayerProfile",
  "removeMedicalPlayer",
  "removeMedicalRecord",
  "addMedicalInjuryPlan",
  "updateMedicalInjuryPlan",
  "updateMedicalPlanClearance",
  "removeMedicalInjuryPlan",
  "openMedicalPlayerModal",
  "closeMedicalPlayerModal",
  "setMedicalSelectedDate",
  "shiftMedicalSelectedDate",
];

test("Medical runtime accessors preserve app-runtime pass-through names", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const composer = readProjectFile("src/modules/medical/medical-runtime-service-composer.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof medicalRuntimeAccessors.configureMedicalRuntimeAccessors).toBe("function");
  for (const accessorName of [...helperNames, ...stateServiceNames, ...facadeNames]) {
    expect(typeof medicalRuntimeAccessors[accessorName], accessorName).toBe("function");
    expect(app, `${accessorName} should stay locally addressable through accessors`).toContain(accessorName);
  }

  expect(app).toContain('import * as medicalRuntimeAccessors from "./src/modules/medical/medical-runtime-accessors.mjs";');
  expect(composer).toContain("medicalRuntimeService.helpers;");
  expect(composer).toContain("medicalRuntimeService.stateService;");
  expect(composer).toContain("medicalRuntimeService.facade;");
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(app).not.toContain("const medicalRuntimeHelpers = medicalRuntimeService.helpers;");
  expect(app).not.toContain("const medicalRuntimeStateService = medicalRuntimeService.stateService;");
  expect(app).not.toContain("const medicalRuntimeFacade = medicalRuntimeService.facade;");
  expect(accessors).toContain('callMedicalRuntimeArea("helpers"');
  expect(accessors).toContain('callMedicalRuntimeArea("stateService"');
  expect(accessors).toContain('callMedicalRuntimeArea("facade"');
  expect(accessors).not.toContain("localStorage");
  expect(accessors).not.toContain("rawDataSafetySetItem");
  expect(index).toContain('export * from "./medical-runtime-accessors.mjs";');
});

test("Medical runtime accessors forward to the configured runtime service", () => {
  const calls = [];
  const service = {
    helpers: {
      compareMedicalPlayers: (...args) => calls.push(["helpers", "compareMedicalPlayers", args]) && "helper-result",
      getMedicalStatusOptionForDate: (...args) => calls.push(["helpers", "getMedicalStatusOptionForDate", args]) && "helper-date-result",
    },
    stateService: {
      readMedicalState: (...args) => calls.push(["stateService", "readMedicalState", args]) && { players: [] },
    },
    facade: {
      renderMedicalTeamWorkspace: (...args) => calls.push(["facade", "renderMedicalTeamWorkspace", args]) && "render-result",
    },
  };

  medicalRuntimeAccessors.configureMedicalRuntimeAccessors(() => service);

  expect(medicalRuntimeAccessors.compareMedicalPlayers("a", "b")).toBe("helper-result");
  expect(medicalRuntimeAccessors.getMedicalStatusOptionForDateFromHelper("full", "2026-06-08")).toBe("helper-date-result");
  expect(medicalRuntimeAccessors.readMedicalState()).toEqual({ players: [] });
  expect(medicalRuntimeAccessors.renderMedicalTeamWorkspace("Saved.")).toBe("render-result");
  expect(calls).toEqual([
    ["helpers", "compareMedicalPlayers", ["a", "b"]],
    ["helpers", "getMedicalStatusOptionForDate", ["full", "2026-06-08"]],
    ["stateService", "readMedicalState", []],
    ["facade", "renderMedicalTeamWorkspace", ["Saved."]],
  ]);
});
