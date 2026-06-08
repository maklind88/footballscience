import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeFacade } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createHarness() {
  let medicalState = {
    selectedDate: "2026-06-01",
    selectedPlayerId: "p1",
    players: [
      { id: "p1", name: "Alex Morgan", number: "10", position: "FW" },
      { id: "removed", name: "Removed Player", number: "8", position: "CM" },
      { id: "archived", name: "Archived Player", archivedAt: "2026-05-01T09:00:00.000Z" },
    ],
    records: [],
    injuryPlans: [],
    dataSafety: {},
  };
  const commits = [];
  const renders = [];
  const writes = [];
  const workspace = { innerHTML: "", querySelector: () => null };
  let recordCounter = 1;

  const facade = createMedicalRuntimeFacade({
    addCalendarDays: (date, days) => {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + Number(days || 0));
      return next;
    },
    canEditMedicalTeam: () => true,
    canViewPrivateMedicalDetails: () => true,
    cloneMedicalState: (state) => JSON.parse(JSON.stringify(state)),
    commitMedicalClinicalState: (type, summary) => commits.push({ type, summary }),
    compareMedicalPlayers: (first = {}, second = {}) => String(first.name || "").localeCompare(String(second.name || "")),
    ensureMedicalState: () => medicalState,
    escapeHtml: (value) => String(value ?? ""),
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    getCurrentMedicalActorId: () => "medical-user",
    getCurrentPlatformUser: () => ({ id: "medical-user", teamName: "North Carolina Courage" }),
    getCurrentUser: () => ({ id: "medical-user", teamName: "North Carolina Courage" }),
    getFormValues: () => ({}),
    getMedicalBulkRecommendationOpen: () => false,
    getMedicalBulkSelectedPlayerIds: () => new Set(),
    getMedicalClearanceValues: () => ({}),
    getMedicalDataSafetyCounts: () => ({ archivedPlayers: 1, archivedRecords: 0, archivedPlans: 0 }),
    getMedicalEntityUpdatedMs: (item = {}) => new Date(item.updatedAt || item.createdAt || 0).getTime(),
    getMedicalLoadGateValues: () => ({}),
    getMedicalOperationsTab: () => "availability",
    getMedicalPlayerAvailabilityStatusOption: () => ({ label: "Unavailable" }),
    getMedicalPlayerSquadAvailabilityBlockReason: () => "",
    getMedicalRemovedSquadPlayerIdSet: () => new Set(["removed"]),
    getMedicalRosterSearchQuery: () => "",
    getMedicalRtpPhaseForRecommendation: () => "modified-team",
    getMedicalRtpPhaseOption: (key) => ({ key, label: "Modified team", status: "modified", participation: 75 }),
    getMedicalState: () => medicalState,
    getMedicalStatusFilter: () => "all",
    getMedicalStatusForParticipation: (participation) => participation >= 100 ? "full" : participation > 0 ? "modified" : "unavailable",
    getMedicalStatusOptionForDate: (statusKey, dateValue, rtpPhase) => ({ key: statusKey, dateValue, rtpPhase }),
    getPlatformStructureState: () => ({}),
    getPlatformTeamDisplayName: () => "North Carolina Courage",
    getPlayerProfileRosterLabel: () => "Squad",
    getRemovedSquadPlayerIdSet: () => new Set(["removed"]),
    getScheduleEventsForDate: () => [{ type: "training", title: "Training" }],
    getScheduleMainEvent: (events = []) => events[0] || null,
    getWorkspace: () => workspace,
    isAdmin: () => true,
    isDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    isItemArchived: (item = {}) => Boolean(item.archivedAt),
    isPlayerBlockedBySquadAvailability: () => false,
    isPlayerRemovedFromSquad: (player = {}, removedIds = new Set()) => removedIds.has(player.id),
    isScheduleSessionEvent: () => true,
    isTemporaryPlayerProfile: () => false,
    isTemporaryPlayerProfileActiveOnDate: () => true,
    medicalActualParticipationFallback: "not-logged",
    medicalClearanceRoles: [],
    medicalCommandSelectors: {
      buildMedicalCoachHandoverText: () => "Handover",
      getMedicalAttentionPlayers: () => [],
      getMedicalCoachHandoverItems: () => [],
      getMedicalDailyHuddle: () => [],
      getMedicalDailyStats: () => ({ fullCount: 0, modifiedCount: 1, unavailableCount: 0, unloggedCount: 0 }),
      getMedicalMonthAverageStats: () => ({}),
      getMedicalParticipationAverageForDates: () => 0,
      getMedicalPositionSummaries: () => [],
      getMedicalWindowAverage: () => 0,
    },
    medicalInjuryPlanDraftsByPlayerId: new Map(),
    medicalInjuryPlanStatusOptions: [],
    medicalLoadGateOptions: [],
    medicalOperationsRenderer: {
      renderCoachSafeSummary: () => "coach-safe",
      renderPrivateSystem: () => "private-system",
      renderTopMenu: () => "top-menu",
    },
    medicalOperationsSelectors: {
      getMedicalActiveCaseItems: () => [],
      getMedicalHistoryEvents: () => [],
      getMedicalOperationsSummary: () => ({}),
      getMedicalPlayerRiskSignal: () => null,
      getMedicalRiskSignals: () => [],
      getMedicalSeasonPlans: () => [],
      getMedicalSeasonSummary: () => ({}),
    },
    medicalOperationsTabOptions: [],
    medicalPlanSelectors: {
      getMedicalPlanClearanceSummary: () => "",
      getMedicalPlanDaysRemaining: () => 0,
      getMedicalPlanElapsedDays: () => 0,
      getMedicalPlanReviewState: () => ({}),
      getMedicalPlanSeverity: () => "",
      getMedicalPlanTotalDays: () => 0,
      getMedicalTrailingRecommendationSummary: () => ({}),
    },
    medicalPlayerModalRenderer: { renderPlayerModal: () => "modal" },
    medicalProfileSummarySelectors: { getMedicalPlayerProfileSummary: () => ({}) },
    medicalRosterRenderer: { renderAvailabilityWorkspace: (message) => `availability:${message}` },
    medicalRosterSelectors: {
      getMedicalRosterPositionGroups: () => [],
      getMedicalRosterPositionStats: () => [],
    },
    medicalRtpPhaseOptions: [{ key: "modified-team" }],
    medicalStatusOptions: [{ key: "full" }, { key: "modified" }, { key: "unavailable" }],
    medicalTeamStorageKey: "football-medical-team-v1",
    medicalWindowLength: 7,
    navigatorRef: {},
    normalizeClearance: (value = {}) => ({ ...value }),
    normalizeLoadGates: (value = {}) => ({ ...value }),
    normalizeMedicalGovernancePolicy: (value = {}) => ({ ...value }),
    normalizeMedicalInjuryPlan: (value = {}) => value && value.playerId ? { ...value } : null,
    normalizeMedicalOperationsTab: (value) => value || "availability",
    normalizeMedicalPlayer: (value = {}) => value && value.id ? { ...value } : null,
    normalizeMedicalRecord: (value = {}) => value && value.playerId ? { id: value.id || `record-${recordCounter++}`, ...value } : null,
    normalizeParticipation: (value, fallback = 100) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    },
    normalizePlatformText: (value = "") => String(value).trim(),
    normalizeShareValue: (value) => value === true,
    parseDateValue: (value) => new Date(`${value}T00:00:00.000Z`),
    scheduleEventTypes: { training: { label: "Training" } },
    setBulkRecommendationOpen: () => {},
    setBulkSelectedPlayerIds: () => {},
    setMedicalBulkRecommendationOpen: () => {},
    setMedicalBulkSelectedPlayerIds: () => {},
    setMedicalOperationsTab: () => {},
    setMedicalPlayerModalOpen: () => {},
    setMedicalPlayerModalTab: () => {},
    setMedicalState: (nextState) => {
      medicalState = nextState;
    },
    updateMedicalDatabaseSyncStatus: () => {},
    win: {},
    writeMedicalState: () => writes.push("write"),
  });

  return { commits, facade, getState: () => medicalState, renders, workspace, writes };
}

test("Medical runtime facade is the app-runtime boundary for Medical runtime services", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const facade = readProjectFile("src/modules/medical/medical-runtime-facade.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeFacade).toBe("function");
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(app).not.toContain("createMedicalRuntimeFacade({");
  expect(runtimeService).toContain("createMedicalRuntimeFacade({");
  expect(accessors).toContain('export function addMedicalRecord(...args) { return callFacade("addMedicalRecord", args); }');
  expect(accessors).toContain('export function renderMedicalTeamWorkspace(...args) { return callFacade("renderMedicalTeamWorkspace", args); }');
  expect(accessors).toContain('export function getSelectedMedicalPlayer(...args) { return callFacade("getSelectedMedicalPlayer", args); }');
  expect(app).not.toContain("createMedicalRuntimeActivitySelectors({");
  expect(app).not.toContain("createMedicalRuntimeOperationsService({");
  expect(app).not.toContain("createMedicalRuntimeWriteService({");
  expect(facade).toContain("createMedicalRuntimeActivitySelectors({");
  expect(facade).toContain("createMedicalRuntimeOperationsService({");
  expect(facade).toContain("createMedicalRuntimeWriteService({");
  expect(facade).not.toContain("renderDashboardChatWidget");
  expect(index).toContain('export * from "./medical-runtime-facade.mjs";');
});

test("Medical runtime facade preserves render, selector, and write-service behavior", () => {
  const harness = createHarness();

  expect(harness.facade.getActiveMedicalPlayers().map((player) => player.id)).toEqual(["p1"]);
  expect(harness.facade.getSelectedMedicalPlayer()).toMatchObject({ id: "p1", name: "Alex Morgan" });
  harness.facade.renderMedicalTeamWorkspace("Saved");
  expect(harness.workspace.innerHTML).toContain("North Carolina Courage");
  expect(harness.workspace.innerHTML).toContain("availability:Saved");

  const record = harness.facade.addMedicalRecord({
    playerId: "p1",
    date: "2026-06-01",
    participation: 75,
    status: "bad",
    rtpPhase: "modified-team",
    shareWithCoach: true,
  });

  expect(record).toMatchObject({
    id: "record-1",
    playerId: "p1",
    status: "modified",
    participation: 75,
    createdBy: "medical-user",
  });
  expect(harness.getState()).toMatchObject({ selectedDate: "2026-06-01", selectedPlayerId: "p1" });
  expect(harness.commits.at(-1)).toMatchObject({
    type: "recommendation-saved",
    summary: "Alex Morgan: 75% recommendation saved.",
  });
});
