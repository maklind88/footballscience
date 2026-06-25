let getMedicalRuntimeService = () => null;

export function configureMedicalRuntimeAccessors(nextGetMedicalRuntimeService) {
  if (typeof nextGetMedicalRuntimeService !== "function") {
    throw new TypeError("Medical runtime accessors require a service getter.");
  }
  getMedicalRuntimeService = nextGetMedicalRuntimeService;
}

function callMedicalRuntimeArea(areaKey, methodName, args) {
  const service = getMedicalRuntimeService();
  const area = service?.[areaKey];
  const method = area?.[methodName];
  if (typeof method !== "function") {
    throw new ReferenceError(`Medical runtime ${areaKey}.${methodName} is not configured.`);
  }
  return method(...args);
}

const callHelper = (methodName, args) => callMedicalRuntimeArea("helpers", methodName, args);
const callStateService = (methodName, args) => callMedicalRuntimeArea("stateService", methodName, args);
const callFacade = (methodName, args) => callMedicalRuntimeArea("facade", methodName, args);

export function compareMedicalPlayers(...args) { return callHelper("compareMedicalPlayers", args); }
export function getCurrentMedicalActorId(...args) { return callHelper("getCurrentMedicalActorId", args); }
export function getMedicalCanonicalPositionFromText(...args) { return callHelper("getMedicalCanonicalPositionFromText", args); }
export function getMedicalClearanceValues(...args) { return callHelper("getMedicalClearanceValues", args); }
export function getMedicalDataSafetyCounts(...args) { return callHelper("getMedicalDataSafetyCounts", args); }
export function getMedicalEntityUpdatedMs(...args) { return callHelper("getMedicalEntityUpdatedMs", args); }
export function getMedicalGateOption(...args) { return callHelper("getMedicalGateOption", args); }
export function getMedicalLoadGateValues(...args) { return callHelper("getMedicalLoadGateValues", args); }
export function getMedicalLinkedPlayerProfile(...args) { return callHelper("getMedicalLinkedPlayerProfile", args); }
export function getMedicalPlayerAvailabilityStatus(...args) { return callHelper("getMedicalPlayerAvailabilityStatus", args); }
export function getMedicalPlayerAvailabilityStatusOption(...args) { return callHelper("getMedicalPlayerAvailabilityStatusOption", args); }
export function getMedicalPlayerNumberRank(...args) { return callHelper("getMedicalPlayerNumberRank", args); }
export function getMedicalPlayerPositionRank(...args) { return callHelper("getMedicalPlayerPositionRank", args); }
export function getMedicalPlayerRosterOrder(...args) { return callHelper("getMedicalPlayerRosterOrder", args); }
export function getMedicalPlayerSquadAvailabilityBlockReason(...args) { return callHelper("getMedicalPlayerSquadAvailabilityBlockReason", args); }
export function getMedicalRtpPhaseForRecommendation(...args) { return callHelper("getMedicalRtpPhaseForRecommendation", args); }
export function getMedicalRtpPhaseOption(...args) { return callHelper("getMedicalRtpPhaseOption", args); }
export function getMedicalStatusActivityType(...args) { return callHelper("getMedicalStatusActivityType", args); }
export function getMedicalStatusForParticipation(...args) { return callHelper("getMedicalStatusForParticipation", args); }
export function getMedicalStatusOption(...args) { return callHelper("getMedicalStatusOption", args); }
export function getMedicalStatusOptionForActivity(...args) { return callHelper("getMedicalStatusOptionForActivity", args); }
export function getMedicalStatusOptionForDateFromHelper(...args) { return callHelper("getMedicalStatusOptionForDate", args); }
export function getMedicalTimestampMs(...args) { return callHelper("getMedicalTimestampMs", args); }
export function isMedicalItemArchived(...args) { return callHelper("isMedicalItemArchived", args); }
export function isMedicalPlayerBlockedBySquadAvailability(...args) { return callHelper("isMedicalPlayerBlockedBySquadAvailability", args); }
export function normalizeMedicalActualParticipation(...args) { return callHelper("normalizeMedicalActualParticipation", args); }
export function normalizeMedicalClearance(...args) { return callHelper("normalizeMedicalClearance", args); }
export function normalizeMedicalDataSafety(...args) { return callHelper("normalizeMedicalDataSafety", args); }
export function normalizeMedicalGovernancePolicy(...args) { return callHelper("normalizeMedicalGovernancePolicy", args); }
export function normalizeMedicalInjuryPlan(...args) { return callHelper("normalizeMedicalInjuryPlan", args); }
export function normalizeMedicalLoadGates(...args) { return callHelper("normalizeMedicalLoadGates", args); }
export function normalizeMedicalParticipation(...args) { return callHelper("normalizeMedicalParticipation", args); }
export function normalizeMedicalPlayer(...args) { return callHelper("normalizeMedicalPlayer", args); }
export function normalizeMedicalPlayerAvailabilityStatus(...args) { return callHelper("normalizeMedicalPlayerAvailabilityStatus", args); }
export function normalizeMedicalPlayerPosition(...args) { return callHelper("normalizeMedicalPlayerPosition", args); }
export function normalizeMedicalPositionText(...args) { return callHelper("normalizeMedicalPositionText", args); }
export function normalizeMedicalShareValue(...args) { return callHelper("normalizeMedicalShareValue", args); }
export function normalizeMedicalTimestamp(...args) { return callHelper("normalizeMedicalTimestamp", args); }
export function normalizeMedicalRecord(...args) { return callHelper("normalizeMedicalRecord", args); }
export function sanitizeMedicalGovernancePolicyForCoachView(...args) { return callHelper("sanitizeMedicalGovernancePolicyForCoachView", args); }

export function getMedicalStatusOptionForDate(...args) { return callStateService("getMedicalStatusOptionForDate", args); }
export function syncMedicalPlayerAvailabilityStatusesFromProfiles(...args) { return callStateService("syncMedicalPlayerAvailabilityStatusesFromProfiles", args); }
export function markMedicalClinicalChange(...args) { return callStateService("markMedicalClinicalChange", args); }
export function commitMedicalClinicalState(...args) { return callStateService("commitMedicalClinicalState", args); }
export function updateMedicalDatabaseSyncStatus(...args) { return callStateService("updateMedicalDatabaseSyncStatus", args); }
export function cloneMedicalState(...args) { return callStateService("cloneMedicalState", args); }
export function canViewPrivateMedicalDetails(...args) { return callStateService("canViewPrivateMedicalDetails", args); }
export function sanitizeMedicalRecordForCoachView(...args) { return callStateService("sanitizeMedicalRecordForCoachView", args); }
export function sanitizeMedicalInjuryPlanForCoachView(...args) { return callStateService("sanitizeMedicalInjuryPlanForCoachView", args); }
export function sanitizeMedicalStateForCurrentUser(...args) { return callStateService("sanitizeMedicalStateForCurrentUser", args); }
export function setMedicalStateStorageValue(...args) { return callStateService("setMedicalStateStorageValue", args); }
export function readMedicalState(...args) { return callStateService("readMedicalState", args); }
export function writeMedicalState(...args) { return callStateService("writeMedicalState", args); }
export function ensureMedicalState(...args) { return callStateService("ensureMedicalState", args); }

export function getMedicalAccessLabel(...args) { return callFacade("getMedicalAccessLabel", args); }
export function getMedicalHeroTeamName(...args) { return callFacade("getMedicalHeroTeamName", args); }
export function getSelectedMedicalPlayer(...args) { return callFacade("getSelectedMedicalPlayer", args); }
export function getActiveMedicalPlayers(...args) { return callFacade("getActiveMedicalPlayers", args); }
export function isMedicalPlayerVisibleForDate(...args) { return callFacade("isMedicalPlayerVisibleForDate", args); }
export function getActiveMedicalPlayersForDate(...args) { return callFacade("getActiveMedicalPlayersForDate", args); }
export function isMedicalInjuryPlanActive(...args) { return callFacade("isMedicalInjuryPlanActive", args); }
export function getMedicalPlayerInjuryPlans(...args) { return callFacade("getMedicalPlayerInjuryPlans", args); }
export function getActiveMedicalInjuryPlan(...args) { return callFacade("getActiveMedicalInjuryPlan", args); }
export function createMedicalRecordFromSquadAvailabilityBlock(...args) { return callFacade("createMedicalRecordFromSquadAvailabilityBlock", args); }
export function isMedicalPlanCleared(...args) { return callFacade("isMedicalPlanCleared", args); }
export function getMedicalRecommendationBlockReason(...args) { return callFacade("getMedicalRecommendationBlockReason", args); }
export function getMedicalReviewAlerts(...args) { return callFacade("getMedicalReviewAlerts", args); }
export function getMedicalCoachComment(...args) { return callFacade("getMedicalCoachComment", args); }
export function getMedicalVisibleComment(...args) { return callFacade("getMedicalVisibleComment", args); }
export function getMedicalPlayerRtpCoachStatus(...args) { return callFacade("getMedicalPlayerRtpCoachStatus", args); }
export function loadMedicalPlayerRtpCoachStatus(...args) { return callFacade("loadMedicalPlayerRtpCoachStatus", args); }
export function createMedicalRecordFromInjuryPlan(...args) { return callFacade("createMedicalRecordFromInjuryPlan", args); }
export function getLatestMedicalRecord(...args) { return callFacade("getLatestMedicalRecord", args); }
export function getMedicalPlayerRecords(...args) { return callFacade("getMedicalPlayerRecords", args); }
export function isMedicalRestrictedRecommendationRecord(...args) { return callFacade("isMedicalRestrictedRecommendationRecord", args); }
export function getMedicalPlayerRestrictedLogRecords(...args) { return callFacade("getMedicalPlayerRestrictedLogRecords", args); }
export function getMedicalWindowDates(...args) { return callFacade("getMedicalWindowDates", args); }
export function getMedicalPastWindowDates(...args) { return callFacade("getMedicalPastWindowDates", args); }
export function getMedicalMonthToDateDates(...args) { return callFacade("getMedicalMonthToDateDates", args); }
export function getMedicalScheduleSummary(...args) { return callFacade("getMedicalScheduleSummary", args); }
export function getMedicalRecommendationEvent(...args) { return callFacade("getMedicalRecommendationEvent", args); }
export function getMedicalRecommendationActivityContext(...args) { return callFacade("getMedicalRecommendationActivityContext", args); }
export function getMedicalRecordStatus(...args) { return callFacade("getMedicalRecordStatus", args); }
export function getDefaultMedicalInjuryPlanDraft(...args) { return callFacade("getDefaultMedicalInjuryPlanDraft", args); }
export function normalizeMedicalInjuryPlanDraft(...args) { return callFacade("normalizeMedicalInjuryPlanDraft", args); }
export function getMedicalInjuryPlanDraft(...args) { return callFacade("getMedicalInjuryPlanDraft", args); }
export function setMedicalInjuryPlanDraft(...args) { return callFacade("setMedicalInjuryPlanDraft", args); }
export function setMedicalInjuryPlanDraftFromPlan(...args) { return callFacade("setMedicalInjuryPlanDraftFromPlan", args); }
export function getMedicalRtpLibraryProfile(...args) { return callFacade("getMedicalRtpLibraryProfile", args); }
export function getMedicalRtpLibraryProfiles(...args) { return callFacade("getMedicalRtpLibraryProfiles", args); }
export function getMedicalRtpLibraryStarterDraft(...args) { return callFacade("getMedicalRtpLibraryStarterDraft", args); }
export function getMedicalRtpLibraryStarterDraftForPlan(...args) { return callFacade("getMedicalRtpLibraryStarterDraftForPlan", args); }
export function clearMedicalInjuryPlanDraft(...args) { return callFacade("clearMedicalInjuryPlanDraft", args); }
export function getMedicalInjuryPlanFormDraft(...args) { return callFacade("getMedicalInjuryPlanFormDraft", args); }
export function persistMedicalInjuryPlanDraftFromForm(...args) { return callFacade("persistMedicalInjuryPlanDraftFromForm", args); }
export function getMedicalDailyStats(...args) { return callFacade("getMedicalDailyStats", args); }
export function getMedicalWindowAverage(...args) { return callFacade("getMedicalWindowAverage", args); }
export function getMedicalParticipationAverageForDates(...args) { return callFacade("getMedicalParticipationAverageForDates", args); }
export function getMedicalMonthAverageStats(...args) { return callFacade("getMedicalMonthAverageStats", args); }
export function getMedicalAttentionPlayers(...args) { return callFacade("getMedicalAttentionPlayers", args); }
export function getMedicalPositionSummaries(...args) { return callFacade("getMedicalPositionSummaries", args); }
export function getMedicalDaySpan(...args) { return callFacade("getMedicalDaySpan", args); }
export function getMedicalDailyHuddle(...args) { return callFacade("getMedicalDailyHuddle", args); }
export function getMedicalCoachHandoverItems(...args) { return callFacade("getMedicalCoachHandoverItems", args); }
export function buildMedicalCoachHandoverText(...args) { return callFacade("buildMedicalCoachHandoverText", args); }
export function recordMedicalAuditEvent(...args) { return callFacade("recordMedicalAuditEvent", args); }
export function getMedicalDatabasePlayer(...args) { return callFacade("getMedicalDatabasePlayer", args); }
export function buildMedicalDatabaseStateSummary(...args) { return callFacade("buildMedicalDatabaseStateSummary", args); }
export function getMedicalDatabaseIdempotencyKey(...args) { return callFacade("getMedicalDatabaseIdempotencyKey", args); }
export function recordMedicalDatabaseSyncEvent(...args) { return callFacade("recordMedicalDatabaseSyncEvent", args); }
export function copyMedicalCoachHandoverToClipboard(...args) { return callFacade("copyMedicalCoachHandoverToClipboard", args); }
export function getMedicalPlayerProfileSummary(...args) { return callFacade("getMedicalPlayerProfileSummary", args); }
export function getFilteredMedicalPlayers(...args) { return callFacade("getFilteredMedicalPlayers", args); }
export function getMedicalValidBulkSelection(...args) { return callFacade("getMedicalValidBulkSelection", args); }
export function getMedicalBulkSelectedPlayers(...args) { return callFacade("getMedicalBulkSelectedPlayers", args); }
export function getMedicalBulkRecommendationEligiblePlayers(...args) { return callFacade("getMedicalBulkRecommendationEligiblePlayers", args); }
export function toggleMedicalBulkPlayer(...args) { return callFacade("toggleMedicalBulkPlayer", args); }
export function setMedicalBulkSelection(...args) { return callFacade("setMedicalBulkSelection", args); }
export function setMedicalBulkNotSetSelection(...args) { return callFacade("setMedicalBulkNotSetSelection", args); }
export function applyMedicalQuickRecommendation(...args) { return callFacade("applyMedicalQuickRecommendation", args); }
export function applyMedicalBulkRecommendation(...args) { return callFacade("applyMedicalBulkRecommendation", args); }
export function updateMedicalBulkActivityControls(...args) { return callFacade("updateMedicalBulkActivityControls", args); }
export function updateMedicalGovernancePolicy(...args) { return callFacade("updateMedicalGovernancePolicy", args); }
export function getMedicalPlanTotalDays(...args) { return callFacade("getMedicalPlanTotalDays", args); }
export function getMedicalPlanElapsedDays(...args) { return callFacade("getMedicalPlanElapsedDays", args); }
export function getMedicalPlanDaysRemaining(...args) { return callFacade("getMedicalPlanDaysRemaining", args); }
export function getMedicalPlanSeverity(...args) { return callFacade("getMedicalPlanSeverity", args); }
export function getMedicalPlanClearanceSummary(...args) { return callFacade("getMedicalPlanClearanceSummary", args); }
export function getMedicalPlanReviewState(...args) { return callFacade("getMedicalPlanReviewState", args); }
export function getMedicalTrailingRecommendationSummary(...args) { return callFacade("getMedicalTrailingRecommendationSummary", args); }
export function getMedicalSeasonPlans(...args) { return callFacade("getMedicalSeasonPlans", args); }
export function getMedicalActiveCaseItems(...args) { return callFacade("getMedicalActiveCaseItems", args); }
export function getMedicalHistoryEvents(...args) { return callFacade("getMedicalHistoryEvents", args); }
export function getMedicalSeasonSummary(...args) { return callFacade("getMedicalSeasonSummary", args); }
export function getMedicalPlayerRiskSignal(...args) { return callFacade("getMedicalPlayerRiskSignal", args); }
export function getMedicalRiskSignals(...args) { return callFacade("getMedicalRiskSignals", args); }
export function getMedicalOperationsSummary(...args) { return callFacade("getMedicalOperationsSummary", args); }
export function renderMedicalOperationsTopMenu(...args) { return callFacade("renderMedicalOperationsTopMenu", args); }
export function renderMedicalOperationsSystem(...args) { return callFacade("renderMedicalOperationsSystem", args); }
export function getMedicalRosterPositionGroups(...args) { return callFacade("getMedicalRosterPositionGroups", args); }
export function getMedicalRosterPositionStats(...args) { return callFacade("getMedicalRosterPositionStats", args); }
export function renderMedicalTeamWorkspace(...args) { return callFacade("renderMedicalTeamWorkspace", args); }
export function upsertMedicalPlayers(...args) { return callFacade("upsertMedicalPlayers", args); }
export function addMedicalRecord(...args) { return callFacade("addMedicalRecord", args); }
export function updateMedicalPlayerProfile(...args) { return callFacade("updateMedicalPlayerProfile", args); }
export function removeMedicalPlayer(...args) { return callFacade("removeMedicalPlayer", args); }
export function removeMedicalRecord(...args) { return callFacade("removeMedicalRecord", args); }
export function addMedicalInjuryPlan(...args) { return callFacade("addMedicalInjuryPlan", args); }
export function updateMedicalInjuryPlan(...args) { return callFacade("updateMedicalInjuryPlan", args); }
export function updateMedicalPlanClearance(...args) { return callFacade("updateMedicalPlanClearance", args); }
export function removeMedicalInjuryPlan(...args) { return callFacade("removeMedicalInjuryPlan", args); }
export function openMedicalPlayerModal(...args) { return callFacade("openMedicalPlayerModal", args); }
export function closeMedicalPlayerModal(...args) { return callFacade("closeMedicalPlayerModal", args); }
export function setMedicalSelectedDate(...args) { return callFacade("setMedicalSelectedDate", args); }
export function shiftMedicalSelectedDate(...args) { return callFacade("shiftMedicalSelectedDate", args); }
