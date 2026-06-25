import { createMedicalRuntimeActivitySelectors } from "./medical-runtime-activity-selectors.mjs";
import { createMedicalRuntimeOperationsService } from "./medical-runtime-operations-service.mjs";
import { createMedicalRuntimeWriteService } from "./medical-runtime-write-service.mjs";
import { createMedicalWorkspaceRuntimeRenderer } from "./medical-workspace-runtime-renderer.mjs";

export function createMedicalRuntimeFacade(deps = {}) {
  let activitySelectors = null;
  let operationsService = null;
  let writeService = null;
  const rtpCoachStatusByPlayerId = new Map();
  const rtpCoachStatusLoadInFlightByPlayerId = new Map();

  const getMedicalState = () => deps.getMedicalState?.() ?? null;
  const method = (service, methodName, ...args) => service?.[methodName]?.(...args);

  const safeText = (value, fallback = "") => String(value || "").trim().slice(0, 200) || fallback;
  const normalizePlayerId = (playerId) => safeText(playerId).trim();

  function getMedicalAccessLabel(...args) { return method(activitySelectors, "getMedicalAccessLabel", ...args); }
  function getMedicalHeroTeamName(...args) { return method(activitySelectors, "getMedicalHeroTeamName", ...args); }
  function getSelectedMedicalPlayer(...args) { return method(activitySelectors, "getSelectedMedicalPlayer", ...args); }
  function getActiveMedicalPlayers(...args) { return method(activitySelectors, "getActiveMedicalPlayers", ...args); }
  function isMedicalPlayerVisibleForDate(...args) { return method(activitySelectors, "isMedicalPlayerVisibleForDate", ...args); }
  function getActiveMedicalPlayersForDate(...args) { return method(activitySelectors, "getActiveMedicalPlayersForDate", ...args); }
  function isMedicalInjuryPlanActive(...args) { return method(activitySelectors, "isMedicalInjuryPlanActive", ...args); }
  function getMedicalPlayerInjuryPlans(...args) { return method(activitySelectors, "getMedicalPlayerInjuryPlans", ...args); }
  function getActiveMedicalInjuryPlan(...args) { return method(activitySelectors, "getActiveMedicalInjuryPlan", ...args); }
  function createMedicalRecordFromSquadAvailabilityBlock(...args) { return method(activitySelectors, "createMedicalRecordFromSquadAvailabilityBlock", ...args); }
  function isMedicalPlanCleared(...args) { return method(activitySelectors, "isMedicalPlanCleared", ...args); }
  function getMedicalRecommendationBlockReason(...args) { return method(activitySelectors, "getMedicalRecommendationBlockReason", ...args); }
  function getMedicalReviewAlerts(...args) { return method(activitySelectors, "getMedicalReviewAlerts", ...args); }
  function getMedicalCoachComment(...args) { return method(activitySelectors, "getMedicalCoachComment", ...args); }
  function getMedicalVisibleComment(...args) { return method(activitySelectors, "getMedicalVisibleComment", ...args); }
  function createMedicalRecordFromInjuryPlan(...args) { return method(activitySelectors, "createMedicalRecordFromInjuryPlan", ...args); }
  function getLatestMedicalRecord(...args) { return method(activitySelectors, "getLatestMedicalRecord", ...args); }
  function getMedicalPlayerRecords(...args) { return method(activitySelectors, "getMedicalPlayerRecords", ...args); }
  function isMedicalRestrictedRecommendationRecord(...args) { return method(activitySelectors, "isMedicalRestrictedRecommendationRecord", ...args); }
  function getMedicalPlayerRestrictedLogRecords(...args) { return method(activitySelectors, "getMedicalPlayerRestrictedLogRecords", ...args); }
  function getMedicalWindowDates(...args) { return method(activitySelectors, "getMedicalWindowDates", ...args); }
  function getMedicalPastWindowDates(...args) { return method(activitySelectors, "getMedicalPastWindowDates", ...args); }
  function getMedicalMonthToDateDates(...args) { return method(activitySelectors, "getMedicalMonthToDateDates", ...args); }
  function getMedicalScheduleSummary(...args) { return method(activitySelectors, "getMedicalScheduleSummary", ...args); }
  function getMedicalRecommendationEvent(...args) { return method(activitySelectors, "getMedicalRecommendationEvent", ...args); }
  function getMedicalRecommendationActivityContext(...args) { return method(activitySelectors, "getMedicalRecommendationActivityContext", ...args); }
  function getMedicalRecordStatus(...args) { return method(activitySelectors, "getMedicalRecordStatus", ...args); }
  function getDefaultMedicalInjuryPlanDraft(...args) { return method(activitySelectors, "getDefaultMedicalInjuryPlanDraft", ...args); }
  function normalizeMedicalInjuryPlanDraft(...args) { return method(activitySelectors, "normalizeMedicalInjuryPlanDraft", ...args); }
  function getMedicalInjuryPlanDraft(...args) { return method(activitySelectors, "getMedicalInjuryPlanDraft", ...args); }
  function setMedicalInjuryPlanDraft(...args) { return method(activitySelectors, "setMedicalInjuryPlanDraft", ...args); }
  function setMedicalInjuryPlanDraftFromPlan(...args) { return method(activitySelectors, "setMedicalInjuryPlanDraftFromPlan", ...args); }
  function getMedicalRtpLibraryProfile(...args) { return method(activitySelectors, "getMedicalRtpLibraryProfile", ...args); }
  function getMedicalRtpLibraryProfiles(...args) { return method(activitySelectors, "getMedicalRtpLibraryProfiles", ...args); }
  function getMedicalRtpLibraryStarterDraft(...args) { return method(activitySelectors, "getMedicalRtpLibraryStarterDraft", ...args); }
  function getMedicalRtpLibraryStarterDraftForPlan(...args) { return method(activitySelectors, "getMedicalRtpLibraryStarterDraftForPlan", ...args); }
  function clearMedicalInjuryPlanDraft(...args) { return method(activitySelectors, "clearMedicalInjuryPlanDraft", ...args); }
  function getMedicalInjuryPlanFormDraft(...args) { return method(activitySelectors, "getMedicalInjuryPlanFormDraft", ...args); }
  function persistMedicalInjuryPlanDraftFromForm(...args) { return method(activitySelectors, "persistMedicalInjuryPlanDraftFromForm", ...args); }

  function getMedicalPlayerRtpCoachStatus(playerId = "") {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!normalizedPlayerId) {
      return null;
    }
    const entry = rtpCoachStatusByPlayerId.get(normalizedPlayerId);
    return entry?.status || null;
  }

  async function loadMedicalPlayerRtpCoachStatus(playerId = "", options = {}) {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const force = Boolean(options.force);
    if (!normalizedPlayerId) {
      return null;
    }
    if (!force) {
      const cached = rtpCoachStatusByPlayerId.get(normalizedPlayerId);
      if (cached?.status && Date.now() - cached.loadedAt < 60000) {
        return cached.status;
      }
    }
    const existingRequest = rtpCoachStatusLoadInFlightByPlayerId.get(normalizedPlayerId);
    if (existingRequest) {
      return existingRequest;
    }

    const token = await deps.getPlatformApiAccessToken?.();
    if (!token || typeof deps.fetchRef !== "function") {
      return null;
    }

    const request = (async () => {
      try {
        const response = await deps.fetchRef(
          `/api/rtp?view=coach-player-status&playerId=${encodeURIComponent(normalizedPlayerId)}`,
          {
            headers: {
              Authorization: `Bearer ${safeText(token)}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
          }
        );
        if (!response.ok) {
          return null;
        }
        const payload = await response.json().catch(() => null);
        if (!payload || typeof payload !== "object") {
          return null;
        }
        rtpCoachStatusByPlayerId.set(normalizedPlayerId, {
          status: payload,
          loadedAt: Date.now(),
        });
        return payload;
      } catch {
        return null;
      } finally {
        rtpCoachStatusLoadInFlightByPlayerId.delete(normalizedPlayerId);
      }
    })();
    rtpCoachStatusLoadInFlightByPlayerId.set(normalizedPlayerId, request);
    return request;
  }

  activitySelectors = createMedicalRuntimeActivitySelectors({
    addCalendarDays: deps.addCalendarDays,
    canEditMedicalTeam: deps.canEditMedicalTeam,
    ensureMedicalState: deps.ensureMedicalState,
    formatDateValue: deps.formatDateValue,
    getCurrentUser: deps.getCurrentUser,
    getFormValues: deps.getFormValues,
    getMedicalEntityUpdatedMs: deps.getMedicalEntityUpdatedMs,
    getMedicalPlayerAvailabilityStatusOption: deps.getMedicalPlayerAvailabilityStatusOption,
    getMedicalPlayerSquadAvailabilityBlockReason: deps.getMedicalPlayerSquadAvailabilityBlockReason,
    getMedicalRtpPhaseOption: deps.getMedicalRtpPhaseOption,
    getMedicalState,
    getMedicalStatusOptionForDate: deps.getMedicalStatusOptionForDate,
    getPlatformStructureState: deps.getPlatformStructureState,
    getPlatformTeamDisplayName: deps.getPlatformTeamDisplayName,
    getRemovedSquadPlayerIdSet: deps.getRemovedSquadPlayerIdSet,
    getScheduleEventsForDate: deps.getScheduleEventsForDate,
    getScheduleMainEvent: deps.getScheduleMainEvent,
    isAdmin: deps.isAdmin,
    isDateValue: deps.isDateValue,
    isItemArchived: deps.isItemArchived,
    isPlayerBlockedBySquadAvailability: deps.isPlayerBlockedBySquadAvailability,
    isPlayerRemovedFromSquad: deps.isPlayerRemovedFromSquad,
    isScheduleSessionEvent: deps.isScheduleSessionEvent,
    isTemporaryPlayerProfile: deps.isTemporaryPlayerProfile,
    isTemporaryPlayerProfileActiveOnDate: deps.isTemporaryPlayerProfileActiveOnDate,
    medicalActualParticipationFallback: deps.medicalActualParticipationFallback,
    medicalClearanceRoles: deps.medicalClearanceRoles,
    medicalInjuryPlanDraftsByPlayerId: deps.medicalInjuryPlanDraftsByPlayerId,
    medicalInjuryPlanStatusOptions: deps.medicalInjuryPlanStatusOptions,
    medicalLoadGateOptions: deps.medicalLoadGateOptions,
    medicalWindowLength: deps.medicalWindowLength,
    normalizeClearance: deps.normalizeClearance,
    normalizeLoadGates: deps.normalizeLoadGates,
    normalizeParticipation: deps.normalizeParticipation,
    normalizePlatformText: deps.normalizePlatformText,
    normalizeShareValue: deps.normalizeShareValue,
    parseDateValue: deps.parseDateValue,
    scheduleEventTypes: deps.scheduleEventTypes,
  });

  function getMedicalDailyStats(dateValue = getMedicalState()?.selectedDate) { return deps.medicalCommandSelectors.getMedicalDailyStats(dateValue); }
  function getMedicalWindowAverage() { return deps.medicalCommandSelectors.getMedicalWindowAverage(); }
  function getMedicalParticipationAverageForDates(dateValues = []) { return deps.medicalCommandSelectors.getMedicalParticipationAverageForDates(dateValues); }
  function getMedicalMonthAverageStats() { return deps.medicalCommandSelectors.getMedicalMonthAverageStats(); }
  function getMedicalAttentionPlayers(dateValue = getMedicalState()?.selectedDate) { return deps.medicalCommandSelectors.getMedicalAttentionPlayers(dateValue); }
  function getMedicalPositionSummaries(dateValue = getMedicalState()?.selectedDate) { return deps.medicalCommandSelectors.getMedicalPositionSummaries(dateValue); }
  function getMedicalDaySpan(startDateValue, endDateValue) {
    if (!deps.isDateValue(startDateValue) || !deps.isDateValue(endDateValue)) return null;
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round((deps.parseDateValue(endDateValue) - deps.parseDateValue(startDateValue)) / dayMs) + 1);
  }
  function getMedicalDailyHuddle(dateValue = getMedicalState()?.selectedDate) { return deps.medicalCommandSelectors.getMedicalDailyHuddle(dateValue); }
  function getMedicalCoachHandoverItems(dateValue = getMedicalState()?.selectedDate) { return deps.medicalCommandSelectors.getMedicalCoachHandoverItems(dateValue); }
  function buildMedicalCoachHandoverText(dateValue = getMedicalState()?.selectedDate) { return deps.medicalCommandSelectors.buildMedicalCoachHandoverText(dateValue); }

  function getMedicalPlayerProfileSummary(player, dateValue = getMedicalState()?.selectedDate) { return deps.medicalProfileSummarySelectors.getMedicalPlayerProfileSummary(player, dateValue); }
  function getMedicalPlanTotalDays(plan) { return deps.medicalPlanSelectors.getMedicalPlanTotalDays(plan); }
  function getMedicalPlanElapsedDays(plan, dateValue = getMedicalState()?.selectedDate) { return deps.medicalPlanSelectors.getMedicalPlanElapsedDays(plan, dateValue); }
  function getMedicalPlanDaysRemaining(plan, dateValue = getMedicalState()?.selectedDate) { return deps.medicalPlanSelectors.getMedicalPlanDaysRemaining(plan, dateValue); }
  function getMedicalPlanSeverity(plan) { return deps.medicalPlanSelectors.getMedicalPlanSeverity(plan); }
  function getMedicalPlanClearanceSummary(plan) { return deps.medicalPlanSelectors.getMedicalPlanClearanceSummary(plan); }
  function getMedicalPlanReviewState(plan, dateValue = getMedicalState()?.selectedDate) { return deps.medicalPlanSelectors.getMedicalPlanReviewState(plan, dateValue); }
  function getMedicalTrailingRecommendationSummary(playerId, dateValue = getMedicalState()?.selectedDate) { return deps.medicalPlanSelectors.getMedicalTrailingRecommendationSummary(playerId, dateValue); }
  function getMedicalSeasonPlans(dateValue = getMedicalState()?.selectedDate) { return deps.medicalOperationsSelectors.getMedicalSeasonPlans(dateValue); }
  function getMedicalActiveCaseItems(dateValue = getMedicalState()?.selectedDate) { return deps.medicalOperationsSelectors.getMedicalActiveCaseItems(dateValue); }
  function getMedicalHistoryEvents(limit = 40) { return deps.medicalOperationsSelectors.getMedicalHistoryEvents(limit); }
  function getMedicalSeasonSummary(dateValue = getMedicalState()?.selectedDate) { return deps.medicalOperationsSelectors.getMedicalSeasonSummary(dateValue); }
  function getMedicalPlayerRiskSignal(player, dateValue = getMedicalState()?.selectedDate) { return deps.medicalOperationsSelectors.getMedicalPlayerRiskSignal(player, dateValue); }
  function getMedicalRiskSignals(dateValue = getMedicalState()?.selectedDate) { return deps.medicalOperationsSelectors.getMedicalRiskSignals(dateValue); }
  function getMedicalOperationsSummary(dateValue = getMedicalState()?.selectedDate) { return deps.medicalOperationsSelectors.getMedicalOperationsSummary(dateValue); }
  function getMedicalRosterPositionGroups(players = []) { return deps.medicalRosterSelectors.getMedicalRosterPositionGroups(players); }
  function getMedicalRosterPositionStats(players = []) { return deps.medicalRosterSelectors.getMedicalRosterPositionStats(players); }

  function renderMedicalOperationsTopMenu() {
    if (!deps.canViewPrivateMedicalDetails()) return "";
    deps.setMedicalOperationsTab(deps.normalizeMedicalOperationsTab(deps.getMedicalOperationsTab()));
    return deps.medicalOperationsRenderer.renderTopMenu(deps.getMedicalOperationsTab(), deps.medicalOperationsTabOptions);
  }
  function renderMedicalOperationsSystem() {
    if (!deps.canViewPrivateMedicalDetails()) return deps.medicalOperationsRenderer.renderCoachSafeSummary(getMedicalState().selectedDate);
    deps.setMedicalOperationsTab(deps.normalizeMedicalOperationsTab(deps.getMedicalOperationsTab()));
    return deps.medicalOperationsRenderer.renderPrivateSystem(getMedicalOperationsSummary(getMedicalState().selectedDate), deps.getMedicalOperationsTab(), getMedicalState().selectedDate);
  }

  const { renderMedicalTeamWorkspace } = createMedicalWorkspaceRuntimeRenderer({
    canViewPrivateDetails: deps.canViewPrivateMedicalDetails,
    ensureState: deps.ensureMedicalState,
    escapeHtml: deps.escapeHtml,
    getAccessLabel: getMedicalAccessLabel,
    getHeroTeamName: getMedicalHeroTeamName,
    getOperationsTab: deps.getMedicalOperationsTab,
    getWorkspace: deps.getWorkspace,
    normalizeOperationsTab: deps.normalizeMedicalOperationsTab,
    playerModalRenderer: deps.medicalPlayerModalRenderer,
    renderOperationsSystem: renderMedicalOperationsSystem,
    renderOperationsTopMenu: renderMedicalOperationsTopMenu,
    rosterRenderer: deps.medicalRosterRenderer,
    setOperationsTab: deps.setMedicalOperationsTab,
  });

  operationsService = createMedicalRuntimeOperationsService({
    addMedicalRecord,
    buildMedicalCoachHandoverText,
    canEditMedicalTeam: deps.canEditMedicalTeam,
    canViewPrivateMedicalDetails: deps.canViewPrivateMedicalDetails,
    commitMedicalClinicalState: deps.commitMedicalClinicalState,
    compareMedicalPlayers: deps.compareMedicalPlayers,
    ensureMedicalState: deps.ensureMedicalState,
    formatDateValue: deps.formatDateValue,
    getActiveMedicalPlayers,
    getActiveMedicalPlayersForDate,
    getBulkRecommendationOpen: deps.getMedicalBulkRecommendationOpen,
    getBulkSelectedPlayerIds: deps.getMedicalBulkSelectedPlayerIds,
    getCurrentPlatformUser: deps.getCurrentPlatformUser,
    getLatestMedicalRecord,
    getMedicalCoachHandoverItems,
    getMedicalDataSafetyCounts: deps.getMedicalDataSafetyCounts,
    getMedicalDailyStats,
    getMedicalPlayerSquadAvailabilityBlockReason: deps.getMedicalPlayerSquadAvailabilityBlockReason,
    getMedicalRecommendationActivityContext,
    getMedicalRecommendationBlockReason,
    getMedicalRecordStatus,
    getMedicalRtpPhaseForRecommendation: deps.getMedicalRtpPhaseForRecommendation,
    getMedicalRtpPhaseOption: deps.getMedicalRtpPhaseOption,
    getMedicalState,
    getMedicalStatusForParticipation: deps.getMedicalStatusForParticipation,
    getPlayerProfileRosterLabel: deps.getPlayerProfileRosterLabel,
    getRosterSearchQuery: deps.getMedicalRosterSearchQuery,
    getStatusFilter: deps.getMedicalStatusFilter,
    isMedicalDateValue: deps.isDateValue,
    isMedicalItemArchived: deps.isItemArchived,
    isMedicalPlayerBlockedBySquadAvailability: deps.isPlayerBlockedBySquadAvailability,
    medicalActualParticipationFallback: deps.medicalActualParticipationFallback,
    medicalRtpPhaseOptions: deps.medicalRtpPhaseOptions,
    medicalTeamStorageKey: deps.medicalTeamStorageKey,
    navigatorRef: deps.navigatorRef,
    normalizeMedicalGovernancePolicy: deps.normalizeMedicalGovernancePolicy,
    normalizeMedicalParticipation: deps.normalizeParticipation,
    renderMedicalTeamWorkspace,
    setBulkRecommendationOpen: deps.setMedicalBulkRecommendationOpen,
    setBulkSelectedPlayerIds: deps.setMedicalBulkSelectedPlayerIds,
    updateMedicalDatabaseSyncStatus: deps.updateMedicalDatabaseSyncStatus,
    win: deps.win,
    writeMedicalState: deps.writeMedicalState,
  });

  writeService = createMedicalRuntimeWriteService({
    addCalendarDays: deps.addCalendarDays,
    cloneMedicalState: deps.cloneMedicalState,
    commitMedicalClinicalState: deps.commitMedicalClinicalState,
    ensureMedicalState: deps.ensureMedicalState,
    formatDateValue: deps.formatDateValue,
    getActiveMedicalPlayers,
    getCurrentMedicalActorId: deps.getCurrentMedicalActorId,
    getCurrentPlatformUser: deps.getCurrentPlatformUser,
    getMedicalClearanceValues: deps.getMedicalClearanceValues,
    getMedicalLoadGateValues: deps.getMedicalLoadGateValues,
    getMedicalRecommendationActivityContext,
    getMedicalRemovedSquadPlayerIdSet: deps.getMedicalRemovedSquadPlayerIdSet,
    getMedicalRtpPhaseOption: deps.getMedicalRtpPhaseOption,
    getMedicalState,
    getMedicalStatusForParticipation: deps.getMedicalStatusForParticipation,
    isDateValue: deps.isDateValue,
    isMedicalItemArchived: deps.isItemArchived,
    isMedicalPlayerBlockedBySquadAvailability: deps.isPlayerBlockedBySquadAvailability,
    isMedicalPlayerRemovedFromSquad: deps.isMedicalPlayerRemovedFromSquad,
    medicalStatusOptions: deps.medicalStatusOptions,
    normalizeMedicalInjuryPlan: deps.normalizeMedicalInjuryPlan,
    normalizeMedicalParticipation: deps.normalizeParticipation,
    normalizeMedicalPlayer: deps.normalizeMedicalPlayer,
    normalizeMedicalRecord: deps.normalizeMedicalRecord,
    parseDateValue: deps.parseDateValue,
    renderMedicalTeamWorkspace,
    setMedicalPlayerModalOpen: deps.setMedicalPlayerModalOpen,
    setMedicalPlayerModalTab: deps.setMedicalPlayerModalTab,
    setMedicalState: deps.setMedicalState,
    writeMedicalState: deps.writeMedicalState,
  });

  function recordMedicalAuditEvent(...args) { return method(operationsService, "recordMedicalAuditEvent", ...args); }
  function getMedicalDatabasePlayer(...args) { return method(operationsService, "getMedicalDatabasePlayer", ...args); }
  function buildMedicalDatabaseStateSummary(...args) { return method(operationsService, "buildMedicalDatabaseStateSummary", ...args); }
  function getMedicalDatabaseIdempotencyKey(...args) { return method(operationsService, "getMedicalDatabaseIdempotencyKey", ...args); }
  function recordMedicalDatabaseSyncEvent(...args) { return method(operationsService, "recordMedicalDatabaseSyncEvent", ...args); }
  function copyMedicalCoachHandoverToClipboard(...args) { return method(operationsService, "copyMedicalCoachHandoverToClipboard", ...args); }
  function getFilteredMedicalPlayers(...args) { return method(operationsService, "getFilteredMedicalPlayers", ...args); }
  function getMedicalValidBulkSelection(...args) { return method(operationsService, "getMedicalValidBulkSelection", ...args); }
  function getMedicalBulkSelectedPlayers(...args) { return method(operationsService, "getMedicalBulkSelectedPlayers", ...args); }
  function getMedicalBulkRecommendationEligiblePlayers(...args) { return method(operationsService, "getMedicalBulkRecommendationEligiblePlayers", ...args); }
  function toggleMedicalBulkPlayer(...args) { return method(operationsService, "toggleMedicalBulkPlayer", ...args); }
  function setMedicalBulkSelection(...args) { return method(operationsService, "setMedicalBulkSelection", ...args); }
  function setMedicalBulkNotSetSelection(...args) { return method(operationsService, "setMedicalBulkNotSetSelection", ...args); }
  function applyMedicalQuickRecommendation(...args) { return method(operationsService, "applyMedicalQuickRecommendation", ...args); }
  function applyMedicalBulkRecommendation(...args) { return method(operationsService, "applyMedicalBulkRecommendation", ...args); }
  function updateMedicalBulkActivityControls(...args) { return method(operationsService, "updateMedicalBulkActivityControls", ...args); }
  function updateMedicalGovernancePolicy(...args) { return method(operationsService, "updateMedicalGovernancePolicy", ...args); }
  function upsertMedicalPlayers(...args) { return method(writeService, "upsertMedicalPlayers", ...args); }
  function addMedicalRecord(...args) { return method(writeService, "addMedicalRecord", ...args); }
  function updateMedicalPlayerProfile(...args) { return method(writeService, "updateMedicalPlayerProfile", ...args); }
  function removeMedicalPlayer(...args) { return method(writeService, "removeMedicalPlayer", ...args); }
  function removeMedicalRecord(...args) { return method(writeService, "removeMedicalRecord", ...args); }
  function addMedicalInjuryPlan(...args) { return method(writeService, "addMedicalInjuryPlan", ...args); }
  function updateMedicalInjuryPlan(...args) { return method(writeService, "updateMedicalInjuryPlan", ...args); }
  function updateMedicalPlanClearance(...args) { return method(writeService, "updateMedicalPlanClearance", ...args); }
  function removeMedicalInjuryPlan(...args) { return method(writeService, "removeMedicalInjuryPlan", ...args); }
  function openMedicalPlayerModal(...args) { return method(writeService, "openMedicalPlayerModal", ...args); }
  function closeMedicalPlayerModal(...args) { return method(writeService, "closeMedicalPlayerModal", ...args); }
  function setMedicalSelectedDate(...args) { return method(writeService, "setMedicalSelectedDate", ...args); }
  function shiftMedicalSelectedDate(...args) { return method(writeService, "shiftMedicalSelectedDate", ...args); }

  return {
    addMedicalInjuryPlan, addMedicalRecord, applyMedicalBulkRecommendation, applyMedicalQuickRecommendation,
    buildMedicalCoachHandoverText, buildMedicalDatabaseStateSummary, clearMedicalInjuryPlanDraft,
    closeMedicalPlayerModal, copyMedicalCoachHandoverToClipboard, createMedicalRecordFromInjuryPlan,
    createMedicalRecordFromSquadAvailabilityBlock, getActiveMedicalInjuryPlan, getActiveMedicalPlayers,
    getActiveMedicalPlayersForDate, getDefaultMedicalInjuryPlanDraft, getFilteredMedicalPlayers,
    getLatestMedicalRecord, getMedicalAccessLabel, getMedicalActiveCaseItems, getMedicalAttentionPlayers,
    getMedicalBulkRecommendationEligiblePlayers, getMedicalBulkSelectedPlayers, getMedicalCoachComment,
    getMedicalCoachHandoverItems, getMedicalDailyHuddle, getMedicalDailyStats, getMedicalDatabaseIdempotencyKey,
    getMedicalDatabasePlayer, getMedicalDaySpan, getMedicalHeroTeamName, getMedicalHistoryEvents,
    getMedicalInjuryPlanDraft, getMedicalInjuryPlanFormDraft, getMedicalRtpLibraryProfile,
    getMedicalRtpLibraryProfiles, getMedicalRtpLibraryStarterDraft, getMedicalRtpLibraryStarterDraftForPlan, getMedicalMonthAverageStats,
    getMedicalMonthToDateDates, getMedicalOperationsSummary, getMedicalPastWindowDates,
    getMedicalParticipationAverageForDates, getMedicalPlanClearanceSummary, getMedicalPlanDaysRemaining,
    getMedicalPlanElapsedDays, getMedicalPlanReviewState, getMedicalPlanSeverity, getMedicalPlanTotalDays,
    getMedicalPlayerInjuryPlans, getMedicalPlayerProfileSummary, getMedicalPlayerRecords,
    getMedicalPlayerRestrictedLogRecords, getMedicalPlayerRiskSignal, getMedicalPositionSummaries,
    getMedicalRecommendationActivityContext, getMedicalRecommendationBlockReason, getMedicalRecommendationEvent,
    getMedicalRecordStatus, getMedicalReviewAlerts, getMedicalRiskSignals, getMedicalRosterPositionGroups,
    getMedicalRosterPositionStats, getMedicalScheduleSummary, getMedicalSeasonPlans, getMedicalSeasonSummary,
    getMedicalPlayerRtpCoachStatus, loadMedicalPlayerRtpCoachStatus,
    getMedicalTrailingRecommendationSummary, getMedicalValidBulkSelection, getMedicalVisibleComment,
    getMedicalWindowAverage, getMedicalWindowDates, isMedicalInjuryPlanActive, isMedicalPlanCleared,
    getSelectedMedicalPlayer, isMedicalPlayerVisibleForDate, isMedicalRestrictedRecommendationRecord, normalizeMedicalInjuryPlanDraft,
    openMedicalPlayerModal, persistMedicalInjuryPlanDraftFromForm, recordMedicalAuditEvent,
    recordMedicalDatabaseSyncEvent, removeMedicalInjuryPlan, removeMedicalPlayer, removeMedicalRecord,
    renderMedicalOperationsSystem, renderMedicalOperationsTopMenu, renderMedicalTeamWorkspace,
    setMedicalBulkNotSetSelection, setMedicalBulkSelection, setMedicalInjuryPlanDraft,
    setMedicalInjuryPlanDraftFromPlan, setMedicalSelectedDate, shiftMedicalSelectedDate,
    toggleMedicalBulkPlayer, updateMedicalBulkActivityControls, updateMedicalGovernancePolicy,
    updateMedicalInjuryPlan, updateMedicalPlanClearance, updateMedicalPlayerProfile, upsertMedicalPlayers,
  };
}
