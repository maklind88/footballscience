let getPlatformRuntimeAccessorSources = () => ({});

export const platformRuntimeAccessorNames = Object.freeze([
  "mergePeriodizationStatePreservingLocalUi",
  "renderPlayerProfilesWorkspaceMessage",
  "cloneDefaultPlatformStructureState",
  "normalizePlatformStructureText",
  "normalizePlatformStructureComparable",
  "isLegacyPlatformStructureValue",
  "isCanonicalPlatformClubValue",
  "isCanonicalPlatformTeamValue",
  "isLegacyPlatformClub",
  "isLegacyPlatformTeam",
  "isCanonicalPlatformClub",
  "isCanonicalPlatformTeam",
  "hasPlatformWorkspaceScope",
  "slugifyPlatformStructureValue",
  "normalizePlatformStructureId",
  "createPlatformStructureId",
  "normalizePlatformClub",
  "normalizePlatformTeam",
  "normalizePlatformStructureState",
  "isLegacyPlatformTeamPlaceholderName",
  "readPlatformStructureState",
  "writePlatformStructureState",
  "getPlatformStructureState",
  "getPlatformClubById",
  "getPlatformTeamById",
  "findPlatformTeamByName",
  "syncPlatformStructureWithUsers",
  "getUserTeamId",
  "getUserClubId",
  "getUserTeamName",
  "getActivePlatformTeam",
  "getPlatformTeamDisplayTeam",
  "getPlatformTeamDisplayName",
  "writePlatformTeamLogo",
  "getUserClubName",
  "getUserScopeLabel",
  "isSamePlatformClub",
  "isSamePlatformTeam",
  "canAdminViewUser",
  "canAdminManageUser",
  "getScopedPlatformUsers",
  "getScopedPlatformClubs",
  "getScopedPlatformTeams",
  "normalizeAdminUserSubmissionValues",
  "getAllWorkspacePool",
  "normalizeWorkspaceRoleList",
  "normalizeWorkspaceAccessEntry",
  "getWorkspaceAccessConfig",
  "getWorkspaceByIdFromPool",
  "canUserAccessWorkspace",
  "canCurrentUserAccessWorkspace",
  "canUserEditWorkspace",
  "canCurrentUserEditWorkspace",
  "canEditScheduleWorkspace",
  "canEditSessionPlanner",
  "canEditPeriodizationWorkspace",
  "canEditGameSimulatorWorkspace",
  "canEditScoutingWorkspace",
  "getAccessibleWorkspacePool",
  "getVisibleWorkspacePool",
  "mergeWorkspaceDefinitions",
  "cloneHubState",
  "clonePersistableWorkspaceHubState",
  "repairWorkspaceState",
  "getWorkspaceIdFromUrl",
  "readRememberedWorkspaceId",
  "rememberActiveWorkspaceId",
  "readWorkspaceHubState",
  "writeWorkspaceHubState",
  "getWorkspaceById",
  "getWorkspaceByIdUnfiltered",
  "getSafeWorkspaceId",
  "getWorkspaceViewId",
  "getPeriodizationDay",
  "ensurePeriodizationState",
  "writePeriodizationDay",
  "selectPeriodizationDate",
  "openPeriodizationDateForDashboard",
  "setPeriodizationStateStorageValue",
  "readPeriodizationState",
  "writePeriodizationState",
  "setPeriodizationMonth",
  "shiftPeriodizationMonth",
  "scrollPeriodizationDateIntoView",
  "jumpPeriodizationToToday",
  "mergeImportedNccSchedule",
  "setScheduleStateStorageValue",
  "readScheduleState",
  "ensureScheduleState",
  "writeScheduleState",
  "setScoutingStateStorageValue",
  "readScoutingState",
  "writeScoutingState",
  "ensureScoutingState",
  "getPeriodizationMultiSelectOpenField",
  "setPeriodizationMultiSelectOpenField",
  "setPeriodizationSelection",
  "getPeriodizationOverlayState",
  "setPeriodizationOverlayMode",
  "setPeriodizationOverlayState",
  "readTransferRoomState",
  "ensureTransferRoomState",
  "syncTransferRoomLinkedState",
  "canUserAccessTransferRoom",
  "canUserEditTransferRoom",
  "addTransferRoomTargetFromScoutingSnapshot",
  "canEditLeaderboard",
  "canViewLeaderboard",
  "getGameplanContext",
  "getIdpContext",
  "getScoutingAnalysisRoomContext",
  "getScoutingWorkspaceContext",
  "getTransferRoomWorkspaceContext",
  "hydrateWorkspaceModuleState",
  "loadGameplanModule",
  "loadIdpModule",
  "mountLeaderboardHome",
  "openLeaderboardAward",
  "openLeaderboardDialog",
  "requestCloseLeaderboard",
  "loadScoutingWorkspaceModule",
  "loadTransferRoomWorkspaceModule",
  "renderAnalysisRoomWorkspace",
  "renderGameplanWorkspace",
  "renderIdpWorkspace",
  "renderScoutingWorkspace",
  "renderTransferRoomWorkspace",
  "unmountLeaderboardHome",
  "renderPeriodizationWorkspace",
  "renderSessionPlannerPeriodizationOverlay",
  "renderSessionPlannerPeriodizationSummary",
  "initializeWorkspaceHub",
  "renderWorkspaceChrome",
  "setActiveWorkspace",
  "reloadCentralizedAppStateFromStorage",
  "getCurrentSessionPlannerUiSelection",
  "readSessionPlannerStatePreservingUiSelection",
  "shouldDeferCentralizedAppStateReload",
  "setCentralizedAppStateReloadPending",
  "requestCentralizedAppStateReload",
  "flushDeferredCentralizedAppStateReload",
  "refreshCentralStateFromSource",
  "formatScheduleBlockSummary",
  "getScheduleEventsForDate",
  "getScheduleMainEvent",
  "getScheduleMonthEvents",
  "getScheduleDayWarnings",
  "getScheduledSessionTitleForDate",
  "getScheduleSelectedDayContext",
  "getScheduleSessionEventForDate",
  "getScheduleSessionSnapshot",
  "getScheduleVisibleEvents",
  "getScheduleVisibleMonthEvents",
  "isScheduleSessionEvent",
  "openCredentialsMailto",
  "buildTemporaryLoginMessage",
  "getAdminManagedWorkspaces",
  "getAdminAuditState",
  "getReadinessState",
  "getSelectedAdminUserId",
  "getAdminUsersForTeam",
  "getAdminUserInitials",
  "createAdminClubFromForm",
  "createAdminTeamFromForm",
  "loadAdminAuditLog",
  "loadPlatformReadinessReport",
  "publishPlatformAppearanceConfig",
  "getAdminTransferRoomAccessTeamId",
  "renderAdminWorkspace",
]);

export function configurePlatformRuntimeAccessors(sourceResolver) {
  if (typeof sourceResolver !== "function") {
    throw new TypeError("Platform runtime accessors require a source resolver.");
  }
  getPlatformRuntimeAccessorSources = sourceResolver;
}

function getAccessorSource(sourceName, methodName) {
  const sources = getPlatformRuntimeAccessorSources() || {};
  const source = sources[sourceName];
  if (!source || typeof source !== "object") {
    throw new TypeError("Platform runtime accessor source " + sourceName + " is missing for " + methodName + ".");
  }
  return source;
}

function callAccessorSource(sourceName, methodName, args) {
  const source = getAccessorSource(sourceName, methodName);
  const method = source[methodName];
  if (typeof method !== "function") {
    throw new TypeError("Platform runtime accessor source " + sourceName + " is missing " + methodName + ".");
  }
  return method.apply(source, args);
}

function callOptionalAccessorSource(sourceName, methodName, args, fallback) {
  const sources = getPlatformRuntimeAccessorSources() || {};
  const source = sources[sourceName];
  const method = source?.[methodName];
  return typeof method === "function" ? method.apply(source, args) : fallback;
}

export function mergePeriodizationStatePreservingLocalUi(...args) { return callAccessorSource("periodizationStateAdapter", "mergePeriodizationStatePreservingLocalUi", args); }
export function renderPlayerProfilesWorkspaceMessage(...args) { return callAccessorSource("squadWorkspaceRenderer", "renderMessage", args); }
export function cloneDefaultPlatformStructureState(...args) { return callAccessorSource("platformStructureRuntimeService", "cloneDefaultPlatformStructureState", args); }
export function normalizePlatformStructureText(...args) { return callAccessorSource("platformStructureRuntimeService", "normalizePlatformStructureText", args); }
export function normalizePlatformStructureComparable(...args) { return callAccessorSource("platformStructureRuntimeService", "normalizePlatformStructureComparable", args); }
export function isLegacyPlatformStructureValue(...args) { return callAccessorSource("platformStructureRuntimeService", "isLegacyPlatformStructureValue", args); }
export function isCanonicalPlatformClubValue(...args) { return callAccessorSource("platformStructureRuntimeService", "isCanonicalPlatformClubValue", args); }
export function isCanonicalPlatformTeamValue(...args) { return callAccessorSource("platformStructureRuntimeService", "isCanonicalPlatformTeamValue", args); }
export function isLegacyPlatformClub(...args) { return callAccessorSource("platformStructureRuntimeService", "isLegacyPlatformClub", args); }
export function isLegacyPlatformTeam(...args) { return callAccessorSource("platformStructureRuntimeService", "isLegacyPlatformTeam", args); }
export function isCanonicalPlatformClub(...args) { return callAccessorSource("platformStructureRuntimeService", "isCanonicalPlatformClub", args); }
export function isCanonicalPlatformTeam(...args) { return callAccessorSource("platformStructureRuntimeService", "isCanonicalPlatformTeam", args); }
export function hasPlatformWorkspaceScope(...args) { return callAccessorSource("platformStructureRuntimeService", "hasPlatformWorkspaceScope", args); }
export function slugifyPlatformStructureValue(...args) { return callAccessorSource("platformStructureRuntimeService", "slugifyPlatformStructureValue", args); }
export function normalizePlatformStructureId(...args) { return callAccessorSource("platformStructureRuntimeService", "normalizePlatformStructureId", args); }
export function createPlatformStructureId(...args) { return callAccessorSource("platformStructureRuntimeService", "createPlatformStructureId", args); }
export function normalizePlatformClub(...args) { return callAccessorSource("platformStructureRuntimeService", "normalizePlatformClub", args); }
export function normalizePlatformTeam(...args) { return callAccessorSource("platformStructureRuntimeService", "normalizePlatformTeam", args); }
export function normalizePlatformStructureState(...args) { return callAccessorSource("platformStructureRuntimeService", "normalizePlatformStructureState", args); }
export function isLegacyPlatformTeamPlaceholderName(...args) { return callAccessorSource("platformStructureRuntimeService", "isLegacyPlatformTeamPlaceholderName", args); }
export function readPlatformStructureState(...args) { return callAccessorSource("platformStructureRuntimeService", "readPlatformStructureState", args); }
export function writePlatformStructureState(...args) { return callAccessorSource("platformStructureRuntimeService", "writePlatformStructureState", args); }
export function getPlatformStructureState(...args) { return callAccessorSource("platformStructureRuntimeService", "getPlatformStructureState", args); }
export function getPlatformClubById(...args) { return callAccessorSource("platformStructureRuntimeService", "getPlatformClubById", args); }
export function getPlatformTeamById(...args) { return callAccessorSource("platformStructureRuntimeService", "getPlatformTeamById", args); }
export function findPlatformTeamByName(...args) { return callAccessorSource("platformStructureRuntimeService", "findPlatformTeamByName", args); }
export function syncPlatformStructureWithUsers(...args) { return callAccessorSource("platformStructureRuntimeService", "syncPlatformStructureWithUsers", args); }
export function getUserTeamId(...args) { return callAccessorSource("platformStructureRuntimeService", "getUserTeamId", args); }
export function getUserClubId(...args) { return callAccessorSource("platformStructureRuntimeService", "getUserClubId", args); }
export function getUserTeamName(...args) { return callAccessorSource("platformStructureRuntimeService", "getUserTeamName", args); }
export function getActivePlatformTeam(...args) { return callAccessorSource("platformStructureRuntimeService", "getActivePlatformTeam", args); }
export function getPlatformTeamDisplayTeam(...args) { return callAccessorSource("platformStructureRuntimeService", "getPlatformTeamDisplayTeam", args); }
export function getPlatformTeamDisplayName(...args) { return callAccessorSource("platformStructureRuntimeService", "getPlatformTeamDisplayName", args); }
export function writePlatformTeamLogo(...args) { return callAccessorSource("platformStructureRuntimeService", "writePlatformTeamLogo", args); }
export function getUserClubName(...args) { return callAccessorSource("platformStructureRuntimeService", "getUserClubName", args); }
export function getUserScopeLabel(...args) { return callAccessorSource("platformStructureRuntimeService", "getUserScopeLabel", args); }
export function isSamePlatformClub(...args) { return callAccessorSource("platformStructureRuntimeService", "isSamePlatformClub", args); }
export function isSamePlatformTeam(...args) { return callAccessorSource("platformStructureRuntimeService", "isSamePlatformTeam", args); }
export function canAdminViewUser(...args) { return callAccessorSource("platformStructureRuntimeService", "canAdminViewUser", args); }
export function canAdminManageUser(...args) { return callAccessorSource("platformStructureRuntimeService", "canAdminManageUser", args); }
export function getScopedPlatformUsers(...args) { return callAccessorSource("platformStructureRuntimeService", "getScopedPlatformUsers", args); }
export function getScopedPlatformClubs(...args) { return callAccessorSource("platformStructureRuntimeService", "getScopedPlatformClubs", args); }
export function getScopedPlatformTeams(...args) { return callAccessorSource("platformStructureRuntimeService", "getScopedPlatformTeams", args); }
export function normalizeAdminUserSubmissionValues(...args) { return callAccessorSource("platformStructureRuntimeService", "normalizeAdminUserSubmissionValues", args); }
export function getAllWorkspacePool(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getAllWorkspacePool", args); }
export function normalizeWorkspaceRoleList(...args) { return callAccessorSource("workspaceAccessRuntimeService", "normalizeWorkspaceRoleList", args); }
export function normalizeWorkspaceAccessEntry(...args) { return callAccessorSource("workspaceAccessRuntimeService", "normalizeWorkspaceAccessEntry", args); }
export function getWorkspaceAccessConfig(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getWorkspaceAccessConfig", args); }
export function getWorkspaceByIdFromPool(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getWorkspaceByIdFromPool", args); }
export function canUserAccessWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canUserAccessWorkspace", args); }
export function canCurrentUserAccessWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canCurrentUserAccessWorkspace", args); }
export function canUserEditWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canUserEditWorkspace", args); }
export function canCurrentUserEditWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canCurrentUserEditWorkspace", args); }
export function canEditScheduleWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canEditScheduleWorkspace", args); }
export function canEditSessionPlanner(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canEditSessionPlanner", args); }
export function canEditPeriodizationWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canEditPeriodizationWorkspace", args); }
export function canEditGameSimulatorWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canEditGameSimulatorWorkspace", args); }
export function canEditScoutingWorkspace(...args) { return callAccessorSource("workspaceAccessRuntimeService", "canEditScoutingWorkspace", args); }
export function getAccessibleWorkspacePool(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getAccessibleWorkspacePool", args); }
export function getVisibleWorkspacePool(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getVisibleWorkspacePool", args); }
export function mergeWorkspaceDefinitions(...args) { return callAccessorSource("workspaceAccessRuntimeService", "mergeWorkspaceDefinitions", args); }
export function cloneHubState(...args) { return callAccessorSource("workspaceAccessRuntimeService", "cloneHubState", args); }
export function clonePersistableWorkspaceHubState(...args) { return callAccessorSource("workspaceAccessRuntimeService", "clonePersistableWorkspaceHubState", args); }
export function repairWorkspaceState(...args) { return callAccessorSource("workspaceAccessRuntimeService", "repairWorkspaceState", args); }
export function getWorkspaceIdFromUrl(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getWorkspaceIdFromUrl", args); }
export function readRememberedWorkspaceId(...args) { return callAccessorSource("workspaceAccessRuntimeService", "readRememberedWorkspaceId", args); }
export function rememberActiveWorkspaceId(...args) { return callAccessorSource("workspaceAccessRuntimeService", "rememberActiveWorkspaceId", args); }
export function readWorkspaceHubState(...args) { return callAccessorSource("workspaceAccessRuntimeService", "readWorkspaceHubState", args); }
export function writeWorkspaceHubState(...args) { return callAccessorSource("workspaceAccessRuntimeService", "writeWorkspaceHubState", args); }
export function getWorkspaceById(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getWorkspaceById", args); }
export function getWorkspaceByIdUnfiltered(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getWorkspaceByIdUnfiltered", args); }
export function getSafeWorkspaceId(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getSafeWorkspaceId", args); }
export function getWorkspaceViewId(...args) { return callAccessorSource("workspaceAccessRuntimeService", "getWorkspaceViewId", args); }
export function getPeriodizationDay(...args) { return callAccessorSource("workspaceDataRuntimeService", "getPeriodizationDay", args); }
export function ensurePeriodizationState(...args) { return callAccessorSource("workspaceDataRuntimeService", "ensurePeriodizationState", args); }
export function writePeriodizationDay(...args) { return callAccessorSource("workspaceDataRuntimeService", "writePeriodizationDay", args); }
export function selectPeriodizationDate(...args) { return callAccessorSource("workspaceDataRuntimeService", "selectPeriodizationDate", args); }
export function openPeriodizationDateForDashboard(...args) { return callAccessorSource("workspaceDataRuntimeService", "openPeriodizationDateForDashboard", args); }
export function setPeriodizationStateStorageValue(...args) { return callAccessorSource("workspaceDataRuntimeService", "setPeriodizationStateStorageValue", args); }
export function readPeriodizationState(...args) { return callAccessorSource("workspaceDataRuntimeService", "readPeriodizationState", args); }
export function writePeriodizationState(...args) { return callAccessorSource("workspaceDataRuntimeService", "writePeriodizationState", args); }
export function setPeriodizationMonth(...args) { return callAccessorSource("workspaceDataRuntimeService", "setPeriodizationMonth", args); }
export function shiftPeriodizationMonth(...args) { return callAccessorSource("workspaceDataRuntimeService", "shiftPeriodizationMonth", args); }
export function scrollPeriodizationDateIntoView(...args) { return callAccessorSource("workspaceDataRuntimeService", "scrollPeriodizationDateIntoView", args); }
export function jumpPeriodizationToToday(...args) { return callAccessorSource("workspaceDataRuntimeService", "jumpPeriodizationToToday", args); }
export function mergeImportedNccSchedule(...args) { return callAccessorSource("workspaceDataRuntimeService", "mergeImportedNccSchedule", args); }
export function setScheduleStateStorageValue(...args) { return callAccessorSource("workspaceDataRuntimeService", "setScheduleStateStorageValue", args); }
export function readScheduleState(...args) { return callAccessorSource("workspaceDataRuntimeService", "readScheduleState", args); }
export function ensureScheduleState(...args) { return callAccessorSource("workspaceDataRuntimeService", "ensureScheduleState", args); }
export function writeScheduleState(...args) { return callAccessorSource("workspaceDataRuntimeService", "writeScheduleState", args); }
export function setScoutingStateStorageValue(...args) { return callAccessorSource("workspaceDataRuntimeService", "setScoutingStateStorageValue", args); }
export function readScoutingState(...args) { return callAccessorSource("workspaceDataRuntimeService", "readScoutingState", args); }
export function writeScoutingState(...args) { return callAccessorSource("workspaceDataRuntimeService", "writeScoutingState", args); }
export function ensureScoutingState(...args) { return callAccessorSource("workspaceDataRuntimeService", "ensureScoutingState", args); }
export function getPeriodizationMultiSelectOpenField(...args) { return callAccessorSource("workspaceDataRuntimeService", "getPeriodizationMultiSelectOpenField", args); }
export function setPeriodizationMultiSelectOpenField(...args) { return callAccessorSource("workspaceDataRuntimeService", "setPeriodizationMultiSelectOpenField", args); }
export function setPeriodizationSelection(...args) { return callAccessorSource("workspaceDataRuntimeService", "setPeriodizationSelection", args); }
export function getPeriodizationOverlayState(...args) { return callAccessorSource("workspaceDataRuntimeService", "getPeriodizationOverlayState", args); }
export function setPeriodizationOverlayMode(...args) { return callAccessorSource("workspaceDataRuntimeService", "setPeriodizationOverlayMode", args); }
export function setPeriodizationOverlayState(...args) { return callAccessorSource("workspaceDataRuntimeService", "setPeriodizationOverlayState", args); }
export function readTransferRoomState(...args) { return callAccessorSource("workspaceDataRuntimeService", "readTransferRoomState", args); }
export function ensureTransferRoomState(...args) { return callAccessorSource("workspaceDataRuntimeService", "ensureTransferRoomState", args); }
export function syncTransferRoomLinkedState(...args) { return callAccessorSource("workspaceDataRuntimeService", "syncTransferRoomLinkedState", args); }
export function canUserAccessTransferRoom(...args) { return callAccessorSource("workspaceDataRuntimeService", "canUserAccessTransferRoom", args); }
export function canUserEditTransferRoom(...args) { return callAccessorSource("workspaceDataRuntimeService", "canUserEditTransferRoom", args); }
export function addTransferRoomTargetFromScoutingSnapshot(...args) { return callAccessorSource("workspaceDataRuntimeService", "addTransferRoomTargetFromScoutingSnapshot", args); }
export function canEditLeaderboard(...args) { return callAccessorSource("workspaceModuleRuntimeController", "canEditLeaderboard", args); }
export function canViewLeaderboard(...args) { return callAccessorSource("workspaceModuleRuntimeController", "canViewLeaderboard", args); }
export function getGameplanContext(...args) { return callAccessorSource("workspaceModuleRuntimeController", "getGameplanContext", args); }
export function getIdpContext(...args) { return callAccessorSource("workspaceModuleRuntimeController", "getIdpContext", args); }
export function getScoutingAnalysisRoomContext(...args) { return callAccessorSource("workspaceModuleRuntimeController", "getScoutingAnalysisRoomContext", args); }
export function getScoutingWorkspaceContext(...args) { return callAccessorSource("workspaceModuleRuntimeController", "getScoutingWorkspaceContext", args); }
export function getTransferRoomWorkspaceContext(...args) { return callAccessorSource("workspaceModuleRuntimeController", "getTransferRoomWorkspaceContext", args); }
export function hydrateWorkspaceModuleState(...args) { return callAccessorSource("workspaceModuleRuntimeController", "hydrateWorkspaceModuleState", args); }
export function loadGameplanModule(...args) { return callAccessorSource("workspaceModuleRuntimeController", "loadGameplanModule", args); }
export function loadIdpModule(...args) { return callAccessorSource("workspaceModuleRuntimeController", "loadIdpModule", args); }
export function mountLeaderboardHome(...args) { return callAccessorSource("workspaceModuleRuntimeController", "mountLeaderboardHome", args); }
export function openLeaderboardAward(...args) { return callAccessorSource("workspaceModuleRuntimeController", "openLeaderboardAward", args); }
export function openLeaderboardDialog(...args) { return callAccessorSource("workspaceModuleRuntimeController", "openLeaderboardDialog", args); }
export function requestCloseLeaderboard(...args) { return callAccessorSource("workspaceModuleRuntimeController", "requestCloseLeaderboard", args); }
export function loadScoutingWorkspaceModule(...args) { return callAccessorSource("workspaceModuleRuntimeController", "loadScoutingWorkspaceModule", args); }
export function loadTransferRoomWorkspaceModule(...args) { return callAccessorSource("workspaceModuleRuntimeController", "loadTransferRoomWorkspaceModule", args); }
export function renderAnalysisRoomWorkspace(...args) { return callAccessorSource("workspaceModuleRuntimeController", "renderAnalysisRoomWorkspace", args); }
export function renderGameplanWorkspace(...args) { return callAccessorSource("workspaceModuleRuntimeController", "renderGameplanWorkspace", args); }
export function renderIdpWorkspace(...args) { return callAccessorSource("workspaceModuleRuntimeController", "renderIdpWorkspace", args); }
export function renderScoutingWorkspace(...args) { return callAccessorSource("workspaceModuleRuntimeController", "renderScoutingWorkspace", args); }
export function renderTransferRoomWorkspace(...args) { return callAccessorSource("workspaceModuleRuntimeController", "renderTransferRoomWorkspace", args); }
export function unmountLeaderboardHome(...args) { return callAccessorSource("workspaceModuleRuntimeController", "unmountLeaderboardHome", args); }
export function renderPeriodizationWorkspace(...args) { return callAccessorSource("periodizationRuntimeBindings", "renderPeriodizationWorkspace", args); }
export function renderSessionPlannerPeriodizationOverlay(...args) { return callAccessorSource("periodizationRuntimeBindings", "renderSessionPlannerPeriodizationOverlay", args); }
export function renderSessionPlannerPeriodizationSummary(...args) { return callAccessorSource("periodizationRuntimeBindings", "renderSessionPlannerPeriodizationSummary", args); }
export function initializeWorkspaceHub(...args) { return callAccessorSource("workspaceShellController", "initializeWorkspaceHub", args); }
export function renderWorkspaceChrome(...args) { return callAccessorSource("workspaceShellController", "renderWorkspaceChrome", args); }
export function setActiveWorkspace(...args) { return callAccessorSource("workspaceShellController", "setActiveWorkspace", args); }
export function reloadCentralizedAppStateFromStorage(...args) { return callAccessorSource("centralAppStateReloadService", "reloadCentralizedAppStateFromStorage", args); }
export function getCurrentSessionPlannerUiSelection(...args) { return callAccessorSource("centralAppStateReloadService", "getCurrentSessionPlannerUiSelection", args); }
export function readSessionPlannerStatePreservingUiSelection(...args) { return callAccessorSource("centralAppStateReloadService", "readSessionPlannerStatePreservingUiSelection", args); }
export function shouldDeferCentralizedAppStateReload(...args) { return callAccessorSource("centralAppStateReloadService", "shouldDeferCentralizedAppStateReload", args); }
export function setCentralizedAppStateReloadPending(...args) { return callAccessorSource("centralAppStateReloadService", "setCentralizedAppStateReloadPending", args); }
export function requestCentralizedAppStateReload(...args) { return callAccessorSource("centralAppStateReloadService", "requestCentralizedAppStateReload", args); }
export function flushDeferredCentralizedAppStateReload(...args) { return callAccessorSource("centralAppStateReloadService", "flushDeferredCentralizedAppStateReload", args); }
export function refreshCentralStateFromSource(...args) { return callAccessorSource("centralAppStateReloadService", "refreshCentralStateFromSource", args); }
export function formatScheduleBlockSummary(...args) { return callAccessorSource("scheduleRuntimeSelectors", "formatBlockSummary", args); }
export function getScheduleEventsForDate(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getEventsForDate", args); }
export function getScheduleMainEvent(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getMainEvent", args); }
export function getScheduleMonthEvents(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getMonthEvents", args); }
export function getScheduleDayWarnings(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getScheduleDayWarnings", args); }
export function getScheduledSessionTitleForDate(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getScheduledSessionTitleForDate", args); }
export function getScheduleSelectedDayContext(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getSelectedDayContext", args); }
export function getScheduleSessionEventForDate(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getSessionEventForDate", args); }
export function getScheduleSessionSnapshot(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getSessionSnapshot", args); }
export function getScheduleVisibleEvents(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getVisibleEvents", args); }
export function getScheduleVisibleMonthEvents(...args) { return callAccessorSource("scheduleRuntimeSelectors", "getVisibleMonthEvents", args); }
export function isScheduleSessionEvent(...args) { return callAccessorSource("scheduleRuntimeSelectors", "isSessionEvent", args); }
export async function openCredentialsMailto(...args) { return callAccessorSource("adminRuntimeService", "openCredentialsMailto", args); }
export function buildTemporaryLoginMessage(...args) { return callAccessorSource("adminRuntimeService", "buildTemporaryLoginMessage", args); }
export function getAdminManagedWorkspaces(...args) { return callAccessorSource("adminRuntimeService", "getAdminManagedWorkspaces", args); }
export function getAdminAuditState(...args) { return callOptionalAccessorSource("adminRuntimeService", "getAdminAuditState", args, {}); }
export function getReadinessState(...args) { return callOptionalAccessorSource("adminRuntimeService", "getReadinessState", args, {}); }
export function getSelectedAdminUserId(...args) { return callOptionalAccessorSource("adminRuntimeService", "getSelectedAdminUserId", args, null); }
export function getAdminUsersForTeam(...args) { return callAccessorSource("adminRuntimeService", "getAdminUsersForTeam", args); }
export function getAdminUserInitials(...args) { return callAccessorSource("adminRuntimeService", "getAdminUserInitials", args); }
export function createAdminClubFromForm(...args) { return callAccessorSource("adminRuntimeService", "createAdminClubFromForm", args); }
export function createAdminTeamFromForm(...args) { return callAccessorSource("adminRuntimeService", "createAdminTeamFromForm", args); }
export async function loadAdminAuditLog(...args) { return callAccessorSource("adminRuntimeService", "loadAdminAuditLog", args); }
export async function loadPlatformReadinessReport(...args) { return callAccessorSource("adminRuntimeService", "loadPlatformReadinessReport", args); }
export async function publishPlatformAppearanceConfig(...args) { return callAccessorSource("adminRuntimeService", "publishPlatformAppearanceConfig", args); }
export function getAdminTransferRoomAccessTeamId(...args) { return callAccessorSource("adminRuntimeService", "getAdminTransferRoomAccessTeamId", args); }
export function renderAdminWorkspace(...args) { return callAccessorSource("adminRuntimeService", "renderAdminWorkspace", args); }
