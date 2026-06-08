import { createDashboardChatMessageTextRenderer, createDashboardChatWidgetRenderer, renderDashboardChatMessageStatus } from "./src/modules/chat/chat-widget-renderer.mjs";
import { createDashboardChatAttachmentRenderer } from "./src/modules/chat/chat-attachment-renderer.mjs";
import { createDashboardChatAttachmentPreview } from "./src/modules/chat/chat-attachment-preview.mjs";
import { createDashboardChatApiUiActions } from "./src/modules/chat/chat-api-ui-actions.mjs";
import { createDashboardChatThreadSettingsStore } from "./src/modules/chat/chat-thread-settings.mjs";
import { uploadDashboardChatAttachmentFile as uploadDashboardChatAttachmentFileWithClient } from "./src/modules/chat/chat-attachment-storage.mjs";
import {
  createDashboardHomeCardsRenderer,
  createDashboardHomeContextSelectors,
  createDashboardRuntimeController,
  createDashboardTaskListRenderer,
  dashboardNewsSeenStorageKey,
  dashboardTaskStorageKey,
  dashboardTutorialPrefsStorageKey,
} from "./src/modules/home/index.mjs";
import { createScheduleWorkspaceController } from "./src/modules/schedule/schedule-controller.mjs";
import { createScheduleRuntimeSelectors } from "./src/modules/schedule/schedule-runtime-selectors.mjs";
import { formatMonthYearLabel, formatScheduleBlockSummary as formatScheduleBlockSummaryFromModule, formatScheduleMonthName, getScheduleDayWarnings as getScheduleDayWarningsFromModule, getScheduleMainEvent as getScheduleMainEventFromModule, isScheduleSessionEvent as isScheduleSessionEventFromModule } from "./src/modules/schedule/schedule-selectors.mjs";
import {
  cloneScheduleState,
  createDefaultScheduleState,
  formatScheduleDateValue,
  getUniqueScheduleEvents,
  mergeImportedScheduleEvents,
  mergeScheduleStatePreservingLocalUi,
  parseScheduleDateValue,
  scheduleEventTypes,
  scheduleMainEventPriority,
} from "./src/modules/schedule/schedule-state.mjs";
import { defaultScoutingState, scoutingCoreMetricOptions, scoutingPriorityOptions, scoutingShadowSlots, scoutingStatusOptions, scoutingTabs } from "./src/modules/scouting/scouting-defaults.mjs";
import { cloneScoutingList, cloneScoutingState, normalizeScoutingDatabaseFilters, normalizeScoutingFormationValue, normalizeScoutingMyTeamPositions, normalizeScoutingMyTeamSlots, normalizeScoutingRecordIds, normalizeScoutingShadowMeta, normalizeScoutingText, preserveScoutingTransientUiState } from "./src/modules/scouting/scouting-state.mjs";
import {
  createPeriodizationStateAdapter,
  periodizationFieldUpdatedAtKey,
  periodizationMultiFields,
  periodizationOptionLibrary,
  periodizationTrackedFields,
  periodizationYear,
} from "./src/modules/periodization/periodization-state.mjs";
import { createPeriodizationRenderer } from "./src/modules/periodization/periodization-renderer.mjs";
import { createPeriodizationRuntimeBindings } from "./src/modules/periodization/periodization-runtime-bindings.mjs";
import {
  createExerciseLibraryActions,
  createExerciseLibraryRenderer,
  createExerciseLibraryReviewHelpers,
  createExerciseLibraryRuntimeFacade,
  createExerciseLibraryRuntimeController,
  createExerciseLibraryUiStateBridge,
  createExerciseLibrarySelectors,
  createExerciseLibraryStateAdapter,
  sessionPlannerDefaultExerciseLibrary,
  sessionPlannerExerciseLibraryBackupSchema,
  sessionPlannerExerciseLibraryBackupStorageKey,
  sessionPlannerExerciseLibraryFoldersBackupSchema,
  sessionPlannerExerciseLibraryFoldersBackupStorageKey,
  sessionPlannerExerciseLibraryFoldersStorageKey,
  sessionPlannerExerciseLibraryStorageKey,
  sessionPlannerExerciseLibraryVersionLimit,
  sessionPlannerLibrarySortOptions,
} from "./src/modules/exercise-library/index.mjs";
import { bindSessionPlannerRuntimeBindings, createSessionPlannerAutosaveBoundary, createSessionPlannerBlockHelpers, createSessionPlannerBoardHistoryController, createSessionPlannerLocalUiState, createSessionPlannerRuntimeDelegates, createSessionPlannerRuntimeRenderers, createSessionPlannerRuntimeStateService, createSessionPlannerStateMergeHelpers, createSessionPlannerTacticalController, createSessionPlannerToastController, createSessionPlannerWorkspaceController, createSessionPlannerSessionFactory, createSessionPlannerTacticalHelpers, createSessionPlannerVisualUploadHelpers, formatSessionPlannerHistoryTime as formatSessionPlannerHistoryTimeFromModule, getSessionPlannerHistoryActionLabel as getSessionPlannerHistoryActionLabelFromModule, getSessionPlannerHistoryActorLabel as getSessionPlannerHistoryActorLabelFromModule, sessionPlannerPlayerBoardAutoModeOptions, sessionPlannerPlayerBoardColorOptions, sessionPlannerPlayerBoardMaxTeamCount, sessionPlannerPrintPaperOptions, sessionPlannerPrintSectionOptions, sessionPlannerStorageKey, sessionPlannerTacticalMaxFrames, sessionPlannerTacticalPitchDimensions, sessionPlannerTacticalPitchModeKeys, sessionPlannerTacticalPitchModeOptions, sessionPlannerTacticalSnapStep } from "./src/modules/session-planner/index.mjs";
import { createPlatformModuleLoader } from "./src/core/platform-module-loader.mjs";
import { createPlatformShellRuntime } from "./src/core/platform-shell-runtime.mjs";
import { createWorkspaceModuleRuntimeController } from "./src/core/workspace-module-runtime-controller.mjs";
import { createWorkspaceShellController } from "./src/core/workspace-shell-controller.mjs";
import { bindPlatformNavigationInteractions } from "./src/core/platform-navigation-bindings.mjs";
import { createPlatformUiBindings } from "./src/core/platform-ui-bindings.mjs";
import { createPlatformAutosaveStatusController } from "./src/core/platform-autosave-status.mjs";
import { createCentralSyncRuntimeService } from "./src/core/central-sync-runtime-service.mjs";
import { createDataSafetyRuntimeService } from "./src/core/data-safety-runtime-service.mjs";
import { createWorkspaceHubStateHelpers } from "./src/core/workspace-hub-state.mjs";
import { addCalendarDays, clamp, escapeHtml, formatDashboardDateTime, formatDashboardTime, formatDataSafetyTime, isEditableKeyboardTarget, logEvent, maybeCopyToClipboard, setFormSubmitButtonState, togglePasswordInputVisibility } from "./src/core/runtime-ui-helpers.mjs";
import { installPlatformOverlayStability } from "./src/core/overlay-stability.mjs";
import { defaultHubState, placeholderWorkspaceContent, platformSidebarMoreOrder, platformSidebarPrimaryOrder, topIconMenuOrder } from "./src/core/workspace-defaults.mjs";
import { createPlatformDisplayHelpers, formatPlatformUserName, getPlatformRoleLabel, getPlatformUserInitials, getPlatformUserProfileImageUrl, normalizePlatformProfileImageUrl } from "./src/modules/platform/display-helpers.mjs";
import { buildPlatformTemporaryLoginMessage, buildPlatformUserCredentialMessage, getPlatformPasswordValidationMessage, readPlatformFormValues, stripPlatformPasswordConfirmation } from "./src/modules/platform/form-helpers.mjs";
import { createPlatformNavigationController, getPlatformTopIconLabel } from "./src/modules/platform/navigation-controller.mjs";
import { createPlatformNavigationRenderer } from "./src/modules/platform/navigation-renderer.mjs";
import { createPlatformStructureStateHelpers } from "./src/modules/platform/structure-state.mjs";
import { createPlatformWorkspaceRenderers } from "./src/modules/platform/workspace-renderers.mjs";
import { createTransferRoomRuntime } from "./transfer-room-runtime.js";
import { getTopIconSvg } from "./top-icons.js";
import { buildPlatformAppearanceConfigFromForm, createDefaultPlatformAppearanceConfig, getHomeAppearanceImpactSummary, normalizePlatformAppearanceConfig, normalizePlatformAppearanceValue, platformAppearanceDensityOptions, platformAppearanceHomeComponentTypeIds, platformAppearanceHomeSectionDefaults, platformAppearanceThemeOptions, platformAppearanceToneOptions } from "./src/core/appearance-governance.mjs";
import { bindAdminRuntimeBindings, getAdminUserInitials as getAdminUserInitialsFromModule } from "./src/modules/admin/index.mjs";
import { bindProfileStaffRuntimeBindings, createProfileImageDataUrl as createProfileImageDataUrlFromModule, createProfileStaffWorkspaceController } from "./src/modules/profile/index.mjs";
import {
  createSquadDataFoundationHelpers,
  createSquadImportPlanner,
  createPlayerProfileHelpers,
  createPlayerProfileIntelligenceHelpers,
  bindPlayerProfileRuntimeBindings,
  createPlayerProfileRuntimeImportService,
  createPlayerProfileRuntimeMedicalSyncService,
  createPlayerProfileRuntimeStateService,
  createPlayerProfileRuntimeWriteService,
  createSquadMedicalStatusService,
  createSquadScoutingRuntime,
  buildPlayerProfileImportFeedback as buildPlayerProfileImportFeedbackMessage,
  buildPlayerProfileImportPreviewMessage,
  buildPlayerProfileOperationFeedback,
  createPlayerProfileFormValueReader,
  createPlayerProfileRosterUiSelectors,
  getPlayerProfileCompleteness,
  getPlayerProfileImportUndoRelativeTimeLabel,
  getSquadChangeSummary,
  playerProfileAttributeGroups,
  playerProfileCareerPhaseOptions,
  playerProfileChangeFieldDefinitions,
  playerProfileIdpStatusOptions,
  playerProfilePreferredSideOptions,
  playerProfileRoleGroupOptions,
  playerProfileRoleOptions,
  playerProfileRosterFilterOptions,
  playerProfileRosterTypeAliases,
  playerProfileRosterTypeOptions,
  playerProfileSquadStatusOptions,
  playerProfileStatusOptions,
  playerProfileTabOptions,
  playerRoleDnaDefinitions,
  renderPlayerProfileAvatar,
  renderPlayerProfileAvatarUpload,
  squadFormationOptions,
} from "./src/modules/squad/index.mjs";
import {
  bindMedicalRuntimeBindings,
  createMedicalRuntimeActivitySelectors,
  createMedicalRuntimeHelpers,
  createMedicalRuntimeOperationsService,
  createMedicalRuntimeRenderers,
  createMedicalRuntimeStateService,
  createMedicalRuntimeWriteService,
  createMedicalWorkspaceRuntimeRenderer,
  defaultMedicalPlayers,
  medicalActualParticipationFallback,
  medicalClearanceRoles,
  medicalDataSafetySyncStatusOptions,
  medicalDefaultRosterVersion,
  medicalGateOptions,
  medicalInjuryDurationPresets,
  medicalInjuryPlanStatusOptions,
  medicalLoadGateOptions,
  medicalOperationsTabOptions,
  medicalParticipationOptions,
  medicalPlayerModalTabOptions,
  medicalPositionAliases,
  medicalPositionOrder,
  medicalRtpPhaseOptions,
  medicalStatusActivityLabels,
  medicalStatusActivityTones,
  medicalStatusOptions,
  medicalWindowLength,
} from "./src/modules/medical/index.mjs";
import { createGameSimulatorLazyRuntimeBridge } from "./src/modules/game-simulator/index.mjs";
const getElement = document.getElementById.bind(document);
const win = window;
const ui = createPlatformUiBindings(document);const platformAssetVersion = win.__assetVersion || Date.now();
const platformModuleLoader = createPlatformModuleLoader({
documentRef: document,
assetVersion: platformAssetVersion,
});
let workspaceModuleRuntimeController = null;
function queueWorkspaceModulePreload(workspaceId = "") {
return workspaceModuleRuntimeController?.queueWorkspaceModulePreload?.(workspaceId);
}
function preloadWorkspaceFromTrigger(trigger = null) {
return workspaceModuleRuntimeController?.preloadWorkspaceFromTrigger?.(trigger);
}
const workspaceHubStorageKey = "football-workspace-hub-v3";
const platformStructureStorageKey = "football-platform-structure-v1";
const workspaceHubDefaultActiveWorkspaceId = "home";
const workspaceLastActiveStorageKey = "football-workspace-last-active-local-v1";
const periodizationStorageKey = "football-periodization-v2";
const scheduleStorageKey = "football-schedule-v1";
const sessionPlannerBlockReductionGuardKey = "blockReductionGuard";
const sessionPlannerBlockDeletionTombstoneKey = "blockDeletionTombstones";
const sessionPlannerBlockReductionGuardMaxAgeMs = 30 * 60 * 1000;
const sessionPlannerBlockFieldUpdatedAtKey = "fieldUpdatedAt";
const platformShellRuntime = createPlatformShellRuntime({
documentRef: document,
getUi: () => ui,
platformModuleLoader,
queueWorkspaceModulePreload,
win,
});
const {
applyPlatformThemeByTime,
ensureDashboardChatStylesheet,
queueCriticalWorkspacePreloads,
queueDashboardChatStylesheetLoad,
setPlatformThemeMode,
startPlatformThemeScheduler,
} = platformShellRuntime;
const sessionPlannerBlockMergeFields = Object.freeze([
"label",
"title",
"focus",
"phase",
"subPhase",
"minutes",
"time",
"intensity",
"pitchSize",
"material",
"objective",
"why",
"organization",
"principles",
"diagram",
"tacticalPitchMode",
"tacticalFrames",
"tacticalActiveFrameId",
"playerBoardLayoutMode",
"visualImage",
"playerBoardPositions",
"playerBoardColors",
"playerBoardCustomPeople",
"tacticalElements",
"libraryExerciseId",
"postSessionNotes",
]);
const sessionPlannerBlockMergeFieldSet = new Set(sessionPlannerBlockMergeFields);
const playerProfilesStorageKey = "football-player-profiles-v1";
const playerProfileAgeCacheStorageKey = "football-player-profile-age-cache-v1";
const dashboardChatStorageKey = "football-dashboard-chat-v1";
const dashboardChatDeletedMessageIdsStorageKey = "football-dashboard-chat-deleted-message-ids-v1";
const dashboardChatLocalCacheResetStorageKey = "football-dashboard-chat-local-cache-reset-v1";
const dashboardChatLocalCacheResetVersion = "2026-05-09-chat-database-only-v3";
const dashboardChatWidgetStateStorageKey = "football-dashboard-chat-widget-state-v1";
const dashboardChatWidgetNotificationCursorStorageKey = "football-dashboard-chat-widget-notification-cursor-v1";
const dashboardChatWidgetNotificationStateStorageKey = "football-dashboard-chat-widget-notification-state-v1";
const dashboardChatTeamThreadId = "team";
const dashboardChatMaxMessageLength = 1600;
const dashboardChatWidgetMessageLimit = 50;
const dashboardChatApiPageLimit = 40;
const dashboardChatPinnedLimit = 3;
const dashboardChatReactionOptions = [
{ key: "seen", label: "Seen" },
{ key: "agree", label: "Agree" },
{ key: "done", label: "Done" },
{ key: "question", label: "Question" },
];
const dashboardChatPriorityOptions = [
{ key: "normal", label: "Normal" },
{ key: "important", label: "Important" },
{ key: "urgent", label: "Urgent" },
];
const dashboardChatPriorityKeys = new Set(dashboardChatPriorityOptions.map((option) => option.key));
const dashboardChatAdvancedThreadTemplates = [
{ key: "staff", label: "Staff", type: "group", title: "Staff Room", visibility: "staff" },
{ key: "medical", label: "Medical", type: "medical", title: "Medical Room", visibility: "medical" },
{ key: "matchday", label: "Matchday", type: "matchday", title: "Matchday Room", visibility: "staff" },
{ key: "training", label: "Training", type: "training", title: "Training Room", visibility: "members" },
{ key: "announcements", label: "Announcements", type: "announcement", title: "Announcements", visibility: "staff" },
];
const dashboardNotificationSeenStorageKey = "football-dashboard-notification-seen-v1";
const platformAppearanceStorageKey = "football-platform-appearance-v1";
const medicalTeamStorageKey = "football-medical-team-v1";
const scoutingStorageKey = "football-scouting-v1";
const gameplanStorageKey = "football-gameplan-v1";
const transferRoomStorageKey = "football-transfer-room-v1";
const sequenceStorageKey = "football-simulator-sequence-v1";
const sequenceLibraryStorageKey = "football-simulator-sequence-library-v2";
const dataSafetyStorageKey = "football-data-safety-v1";
const dataSafetyExportSchema = "football-science-backup-v1";
const dataSafetyDatabaseName = "football-science-data-safety-v1";
const maxProfileImageUrlLength = 1800;
const maxProfileImageUploadDataUrlLength = 900000;
const {
applyUserAvatar,
getPlatformTeamLogoInitials,
getPlatformTeamLogoUrl,
renderPlatformTeamLogoMark,
renderUserAvatar,
} = createPlatformDisplayHelpers({
escapeHtml,
getUserInitials,
getUserProfileImageUrl,
normalizeImageUrl: normalizePlatformImageUrl,
normalizeText: normalizePlatformStructureText,
});
const dataSafetySnapshotStoreName = "snapshots";
const dataSafetyLatestStoreName = "latest";
const dataSafetyMaxSnapshots = 30;
const dataSafetyProtectedStorageKeys = [
workspaceHubStorageKey,
platformStructureStorageKey,
periodizationStorageKey,
scheduleStorageKey,
sessionPlannerStorageKey,
sessionPlannerExerciseLibraryStorageKey,
sessionPlannerExerciseLibraryBackupStorageKey,
sessionPlannerExerciseLibraryFoldersStorageKey,
sessionPlannerExerciseLibraryFoldersBackupStorageKey,
playerProfilesStorageKey,
dashboardTaskStorageKey,
dashboardNotificationSeenStorageKey,
dashboardTutorialPrefsStorageKey,
dashboardNewsSeenStorageKey,
platformAppearanceStorageKey,
medicalTeamStorageKey,
scoutingStorageKey,
gameplanStorageKey,
transferRoomStorageKey,
sequenceStorageKey,
sequenceLibraryStorageKey,
];
const dataSafetyProtectedStorageKeySet = new Set(dataSafetyProtectedStorageKeys);
const dataSafetyStorageLabels = {
[workspaceHubStorageKey]: "Workspace",
[platformStructureStorageKey]: "Club and Team Structure",
[periodizationStorageKey]: "Periodization",
[scheduleStorageKey]: "Schedule",
[sessionPlannerStorageKey]: "Session Planner",
[sessionPlannerExerciseLibraryStorageKey]: "Exercise Library",
[sessionPlannerExerciseLibraryBackupStorageKey]: "Exercise Library Backup",
[sessionPlannerExerciseLibraryFoldersStorageKey]: "Exercise Library Folders",
[sessionPlannerExerciseLibraryFoldersBackupStorageKey]: "Exercise Library Folders Backup",
[dashboardTaskStorageKey]: "Dashboard Tasks",
[dashboardChatStorageKey]: "Team Chat",
[dashboardNotificationSeenStorageKey]: "Home Notifications",
[dashboardTutorialPrefsStorageKey]: "Dashboard Preferences",
[dashboardNewsSeenStorageKey]: "Dashboard News",
[platformAppearanceStorageKey]: "Appearance",
[medicalTeamStorageKey]: "Medical Room",
[playerProfilesStorageKey]: "Player Profiles",
[scoutingStorageKey]: "Scouting",
[transferRoomStorageKey]: "Transfer Room",
[sequenceStorageKey]: "Current Simulator Sequence",
[sequenceLibraryStorageKey]: "Simulator Sequence Library",
};
const dataSafetyLegacyStorageKeys = {
[workspaceHubStorageKey]: ["football-workspace-hub-v2", "football-workspace-hub-v1"],
[periodizationStorageKey]: ["football-periodization-v1"],
[sessionPlannerStorageKey]: ["football-session-planner-v2", "football-session-planner-v1"],
[sequenceLibraryStorageKey]: ["football-simulator-sequence-library-v1"],
};
const dataSafetyRuntimeService = createDataSafetyRuntimeService({
win,
documentRef: document,
navigatorRef: typeof navigator === "undefined" ? null : navigator,
storageConstructor: typeof Storage === "undefined" ? null : Storage,
blobConstructor: typeof Blob === "undefined" ? null : Blob,
urlApi: typeof URL === "undefined" ? null : URL,
ui,
storageKey: dataSafetyStorageKey,
exportSchema: dataSafetyExportSchema,
databaseName: dataSafetyDatabaseName,
snapshotStoreName: dataSafetySnapshotStoreName,
latestStoreName: dataSafetyLatestStoreName,
maxSnapshots: dataSafetyMaxSnapshots,
protectedStorageKeys: dataSafetyProtectedStorageKeys,
storageLabels: dataSafetyStorageLabels,
legacyStorageKeys: dataSafetyLegacyStorageKeys,
formatDataSafetyTime,
canWriteCentralBackedCache: () => canWriteCentralBackedCache(),
createCentralBackedStorageError: () => createCentralBackedStorageError(),
getCentralStateBridge: () => getCentralStateBridge(),
getCentralStateWriteSuppressionKeys: () => centralStateWriteSuppressionKeys,
queueCentralStateWrite: (...args) => queueCentralStateWrite(...args),
});
const dataSafetyRuntimeStatus = dataSafetyRuntimeService.status;
function getDataSafetyNow(...args) { return dataSafetyRuntimeService.getNow(...args); }
function isDataSafetyInternalStorageKey(...args) { return dataSafetyRuntimeService.isInternalStorageKey(...args); }
function isDataSafetyProtectedStorageKey(...args) { return dataSafetyRuntimeService.isProtectedStorageKey(...args); }
function rawDataSafetyGetItem(...args) { return dataSafetyRuntimeService.rawGetItem(...args); }
function rawDataSafetySetItem(...args) { return dataSafetyRuntimeService.rawSetItem(...args); }
function rawDataSafetyRemoveItem(...args) { return dataSafetyRuntimeService.rawRemoveItem(...args); }
function readDataSafetyManifest(...args) { return dataSafetyRuntimeService.readManifest(...args); }
function mutateDataSafetyManifest(...args) { return dataSafetyRuntimeService.mutateManifest(...args); }
function hashDataSafetyString(...args) { return dataSafetyRuntimeService.hashString(...args); }
function getDataSafetyStorageLabel(...args) { return dataSafetyRuntimeService.getStorageLabel(...args); }
function recordDataSafetyWrite(...args) { return dataSafetyRuntimeService.recordWrite(...args); }
function saveDataSafetySnapshot(...args) { return dataSafetyRuntimeService.saveSnapshot(...args); }
function queueDataSafetySnapshot(...args) { return dataSafetyRuntimeService.queueSnapshot(...args); }
function refreshDataSafetyStatus(...args) { return dataSafetyRuntimeService.refreshStatus(...args); }
function queueDataSafetyStatusRefresh(...args) { return dataSafetyRuntimeService.queueStatusRefresh(...args); }
function exportFootballScienceDataBackup(...args) { return dataSafetyRuntimeService.exportBackup(...args); }
function importFootballScienceDataBackupFile(...args) { return dataSafetyRuntimeService.importBackupFile(...args); }
function openDataSafetyDatabase(...args) { return dataSafetyRuntimeService.openDatabase(...args); }
function flushQueuedDataSafetySnapshot(...args) { return dataSafetyRuntimeService.flushQueuedSnapshot(...args); }
function installFootballDataSafety(...args) { return dataSafetyRuntimeService.install(...args); }
let platformUser = null;
const platformNavigationRenderer = createPlatformNavigationRenderer({
escapeHtml,
getTopIconLabel: getPlatformTopIconLabel,
getTopIconSvg,
});
const platformNavigationController = createPlatformNavigationController({
document,
window: win,
renderer: platformNavigationRenderer,
getUi: () => ui,
getHubState: () => hubState,
setHubState: (nextState) => {
hubState = nextState;
},
getWorkspaceById,
getVisibleWorkspaces,
getAccessibleWorkspacePool,
canAccessWorkspace: canCurrentUserAccessWorkspace,
repairWorkspaceState,
hasHomeNotifications: hasDashboardHomeNotifications,
topIconMenuOrder,
sidebarPrimaryOrder: platformSidebarPrimaryOrder,
sidebarMoreOrder: platformSidebarMoreOrder,
placeholderContent: placeholderWorkspaceContent,
});
const dashboardHomeContextSelectors = createDashboardHomeContextSelectors({
cloneSession: cloneSessionPlannerSession,
createEmptySession: createSessionPlannerEmptySession,
ensureMedicalState,
ensurePeriodizationState,
formatScheduleDateValue,
getMedicalRecords: () => medicalState?.records ?? [],
getPeriodizationDay,
getScheduleEventsForDate,
getScheduleMainEvent,
getScheduleState: () => {
if (!scheduleState) {
scheduleState = readScheduleState();
}
return scheduleState;
},
getSessionPlannerState: () => {
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
return sessionPlannerState;
},
isScheduleSessionEvent,
parseScheduleDateValue,
scheduleEventTypes,
scheduleMainEventPriority,
});
const dashboardTaskListRenderer = createDashboardTaskListRenderer({
escapeHtml,
formatDateTime: formatDashboardDateTime,
resolveUserLabel: (userId, users) => getDashboardUserLabel(userId, users),
canRemoveTask: (task, currentUser) =>
currentUser?.id === task.createdBy ||
currentUser?.id === task.assignedTo ||
isCurrentPlatformUserAdmin(),
});
const dashboardHomeCardsRenderer = createDashboardHomeCardsRenderer({
escapeHtml,
renderTaskList: dashboardTaskListRenderer.renderTaskList,
resolveUserLabel: (userId, users) => getDashboardUserLabel(userId, users),
});
const dashboardRuntimeController = createDashboardRuntimeController({
documentRef: document,
win,
getElement,
getUi: () => ui,
homeContextSelectors: dashboardHomeContextSelectors,
homeCardsRenderer: dashboardHomeCardsRenderer,
appearanceStorageKey: platformAppearanceStorageKey,
readJson: readDashboardJson,
writeJson: writeDashboardJson,
createId: createDashboardId,
getCurrentUser: getCurrentPlatformUser,
getUsers: getPlatformUsers,
getActiveWorkspaceId: () => hubState?.activeWorkspaceId,
formatUserName,
escapeHtml,
readAppearanceRaw: rawDataSafetyGetItem,
writeAppearanceRaw: (key, value) => win.localStorage.setItem(key, value),
normalizeAppearanceConfig: normalizePlatformAppearanceConfig,
normalizeAppearanceValue: normalizePlatformAppearanceValue,
renderProfileWorkspace: (message) => renderProfileWorkspace(message),
syncChatNotificationCursor: syncDashboardChatWidgetNotificationCursor,
setActiveWorkspace: (workspaceId) => setActiveWorkspace(workspaceId),
getFormValues: getPlatformFormValues,
confirm: (message) => win.confirm(message),
openScheduleDate: (dateValue) => {
if (dateValue) {
if (!scheduleState) {
scheduleState = readScheduleState();
}
selectScheduleDate(dateValue);
}
},
openPeriodizationDate: (dateValue) => {
ensurePeriodizationState();
if (dateValue && isDateValueInYear(dateValue, periodizationYear)) {
const date = parseScheduleDateValue(dateValue);
periodizationState.selectedDate = dateValue;
periodizationState.selectedMonthIndex = date.getMonth();
periodizationDayOverlayOpen = true;
periodizationDayOverlayMode = "view";
writePeriodizationState({ syncCentral: false });
}
},
openSessionDate: (dateValue) => {
if (dateValue) {
dashboardHomeContextSelectors.getSessionPlannerState();
sessionPlannerState.selectedDate = dateValue;
writeSessionPlannerState();
}
},
createSessionDate: (dateValue) => {
if (!canEditSessionPlanner()) {
return;
}
dashboardHomeContextSelectors.getSessionPlannerState();
if (!sessionPlannerState.sessions) {
sessionPlannerState.sessions = {};
}
if (!sessionPlannerState.sessions[dateValue]?.blocks?.length) {
sessionPlannerState.sessions[dateValue] = createSessionPlannerSessionForNewPlan(dateValue);
}
sessionPlannerState.selectedDate = dateValue;
writeSessionPlannerState();
},
openTacticalBoardDate: (dateValue) => {
dashboardHomeContextSelectors.getSessionPlannerState();
if (!sessionPlannerState.sessions) {
sessionPlannerState.sessions = {};
}
if (!sessionPlannerState.sessions[dateValue]?.blocks?.length && canEditSessionPlanner()) {
sessionPlannerState.sessions[dateValue] = createSessionPlannerSessionForNewPlan(dateValue);
}
sessionPlannerState.selectedDate = dateValue;
writeSessionPlannerState();
setActiveWorkspace("session-planner");
if (getSessionPlannerSelectedSession().blocks.length) {
setSessionPlannerTacticalboardOpen(true);
}
},
});
const {
closeModal: closeDashboardModal,
createTask: createDashboardTask,
getDashboardDateLabel,
getSessionTotalMinutes: getDashboardSessionTotalMinutes,
readAppearanceState: readPlatformAppearanceState,
readTasks: readDashboardTasks,
refreshSurfaces: refreshDashboardSurfaces,
removeTask: removeDashboardTask,
renderCards: renderDashboardCards,
scheduleLoginPopups: scheduleDashboardLoginPopups,
showTutorialModal: showDashboardTutorialModal,
updateTask: updateDashboardTask,
writeAppearanceState: writePlatformAppearanceState,
} = dashboardRuntimeController;
const dashboardChatAttachmentRenderer = createDashboardChatAttachmentRenderer({
escapeHtml,
getSupabaseClient: getDashboardSupabaseClient,
});
const dashboardChatAttachmentPreview = createDashboardChatAttachmentPreview();
const dashboardChatWidgetRenderer = createDashboardChatWidgetRenderer({
teamThreadId: dashboardChatTeamThreadId,
messageLimit: dashboardChatWidgetMessageLimit,
maxMessageLength: dashboardChatMaxMessageLength,
priorityOptions: dashboardChatPriorityOptions,
escapeHtml,
formatUserName,
formatTime: formatDashboardTime,
normalizePriority: normalizeDashboardChatPriority,
getPresenceSummary: getDashboardPresenceSummary,
getPresenceStatus: getDashboardPresenceStatus,
getPresenceLabel: getDashboardPresenceLabel,
renderPresenceAvatar: renderDashboardPresenceAvatar,
renderMessageStatus: (message, users, currentUser) => renderDashboardChatMessageStatus(message, currentUser, escapeHtml),
renderMessageText: renderDashboardMessageText,
renderMessageAttachments: dashboardChatAttachmentRenderer.renderMessageAttachments,
renderMessageReactions: renderDashboardMessageReactions,
renderReplyReference: renderDashboardReplyReference,
renderPinnedMessages: renderDashboardPinnedMessages,
renderTypingIndicator: renderDashboardTypingIndicator,
getPinnedMessagesForThread: getDashboardPinnedMessagesForThread,
getMessageById: getDashboardMessageById,
canDeleteMessage: isCurrentPlatformUserAdmin,
canPinMessage: canPinDashboardChatMessage,
});
let centralStateRefreshTimer = null, centralStateLastRefreshAt = 0, centralStateRefreshInFlight = false;
const centralStateRefreshIntervalMs = 120000, centralStateActiveRefreshMinMs = 30000, centralStateIntervalRefreshMinMs = 120000;
const platformAutosaveStatusController = createPlatformAutosaveStatusController({
documentRef: document,
windowRef: window,
now: getDataSafetyNow,
escapeHtml,
});
const setPlatformAutosaveStatus = platformAutosaveStatusController.set;
const sessionPlannerAutosaveBoundary = createSessionPlannerAutosaveBoundary({
getActiveWorkspaceId: () => hubState?.activeWorkspaceId || "",
setStatus: setPlatformAutosaveStatus,
setVisible: platformAutosaveStatusController.setVisible,
now: () => Date.now(),
});
function isSessionPlannerAutosaveKey(key = "") { return sessionPlannerAutosaveBoundary.isAutosaveKey(key); }
function shouldShowPlatformAutosaveStatus(workspaceId = hubState?.activeWorkspaceId) { return sessionPlannerAutosaveBoundary.shouldShowStatus(workspaceId); }
function syncPlatformAutosaveStatusVisibility(workspaceId = hubState?.activeWorkspaceId) { sessionPlannerAutosaveBoundary.syncVisibility(workspaceId); }
function setPlatformAutosaveStatusForKey(key, state, message = "") { sessionPlannerAutosaveBoundary.setStatusForKey(key, state, message); }
syncPlatformAutosaveStatusVisibility(null);
function handleCentralSyncedStateValue(key) {
if (key === sessionPlannerStorageKey) {
sessionPlannerState = readSessionPlannerStatePreservingUiSelection();
syncSessionPlannerBoardHistoryBaselines(getSessionPlannerSelectedBlock());
if (hubState?.activeWorkspaceId === "session-planner" && !shouldDeferCentralizedAppStateReload()) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
return;
}
if (key === sessionPlannerExerciseLibraryStorageKey) {
sessionPlannerExerciseLibrary = readSessionPlannerExerciseLibrary();
if (hubState?.activeWorkspaceId === "session-planner" && !shouldDeferCentralizedAppStateReload()) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
return;
}
if (key === sessionPlannerExerciseLibraryFoldersStorageKey) {
sessionPlannerExerciseLibraryFolders = readSessionPlannerExerciseLibraryFolders();
if (hubState?.activeWorkspaceId === "session-planner" && !shouldDeferCentralizedAppStateReload()) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
return;
}
if (key === dashboardChatStorageKey) {
dashboardChatRuntimeMessages = [];
purgeDashboardDeletedMessagesFromStorage();
renderDashboardChatWidget();
platformNavigationController.renderTopIconMenu();
return;
}
if (key === dashboardChatDeletedMessageIdsStorageKey) {
purgeDashboardDeletedMessagesFromStorage();
renderDashboardChatWidget();
platformNavigationController.renderTopIconMenu();
return;
}
if (key === platformAppearanceStorageKey) {
if (hubState?.activeWorkspaceId === "home") {
renderDashboardCards();
}
if (hubState?.activeWorkspaceId === "admin") {
renderAdminWorkspace();
}
return;
}
if (key === playerProfilesStorageKey) {
clearPlayerProfileImportUndoSnapshots();
playerProfilesState = readPlayerProfilesState();
if (hubState?.activeWorkspaceId === "transfer-room" && !shouldDeferCentralizedAppStateReload()) {
syncTransferRoomLinkedState({ render: true });
}
if (hubState?.activeWorkspaceId === "player-profiles" && !shouldDeferCentralizedAppStateReload()) {
renderPlayerProfilesWorkspace();
}
return;
}
if (key === medicalTeamStorageKey) {
clearPlayerProfileImportUndoSnapshots();
medicalState = readMedicalState();
if (hubState?.activeWorkspaceId === "player-profiles" && !shouldDeferCentralizedAppStateReload()) {
renderPlayerProfilesWorkspace();
}
if (hubState?.activeWorkspaceId === "medical-team" && !shouldDeferCentralizedAppStateReload()) {
renderMedicalTeamWorkspace();
}
return;
}
if (key === scoutingStorageKey) {
scoutingState = readScoutingState();
if (hubState?.activeWorkspaceId === "transfer-room" && !shouldDeferCentralizedAppStateReload()) {
syncTransferRoomLinkedState({ render: true });
}
if (hubState?.activeWorkspaceId === "scouting" && shouldDeferCentralizedAppStateReload()) {
centralizedAppStateReloadPending = true;
return;
}
if (hubState?.activeWorkspaceId === "scouting") {
renderScoutingWorkspace();
}
return;
}
if (key === transferRoomStorageKey) {
transferRoomState = readTransferRoomState();
if (hubState?.activeWorkspaceId === "transfer-room" && !shouldDeferCentralizedAppStateReload()) {
renderTransferRoomWorkspace();
}
}
}
const centralSyncRuntimeService = createCentralSyncRuntimeService({
getActiveWorkspaceId: () => hubState?.activeWorkspaceId || "",
getCurrentUser: getCurrentPlatformUser,
getDataSafetyNow,
getStorageLabel: getDataSafetyStorageLabel,
handleSyncedStateValue: handleCentralSyncedStateValue,
hashString: hashDataSafetyString,
isProtectedStorageKey: isDataSafetyProtectedStorageKey,
isSessionPlannerAutosaveKey,
mergePeriodizationStatePreservingLocalUi,
mergeScheduleStatePreservingLocalUi,
mutateManifest: mutateDataSafetyManifest,
periodizationStorageKey,
queueSnapshot: queueDataSafetySnapshot,
queueStatusRefresh: queueDataSafetyStatusRefresh,
rawGetItem: rawDataSafetyGetItem,
rawSetItem: rawDataSafetySetItem,
scheduleStorageKey,
getSessionPlannerLocalUiState: () => sessionPlannerLocalUiState,
sessionPlannerStorageKey,
setAutosaveStatusForKey: setPlatformAutosaveStatusForKey,
shouldDeferReload: shouldDeferCentralizedAppStateReload,
showSessionPlannerToast,
win,
});
const centralStateWriteSuppressionKeys = centralSyncRuntimeService.centralStateWriteSuppressionKeys;
function getCentralStateBridge(...args) { return centralSyncRuntimeService.getCentralStateBridge(...args); }
function getCentralStateMetadataForKey(...args) { return centralSyncRuntimeService.getCentralStateMetadataForKey(...args); }
function getCentralStateRevisionForKey(...args) { return centralSyncRuntimeService.getCentralStateRevisionForKey(...args); }
function canWriteCentralBackedCache(...args) { return centralSyncRuntimeService.canWriteCentralBackedCache(...args); }
function createCentralBackedStorageError(...args) { return centralSyncRuntimeService.createCentralBackedStorageError(...args); }
function queueCentralStateStatus(...args) { return centralSyncRuntimeService.queueCentralStateStatus(...args); }
function hasPendingCentralStateWrites() { return centralSyncRuntimeService.hasPendingCentralStateWrites(readDataSafetyManifest); }
function retryCentral() { return centralSyncRuntimeService.retryCentral(readDataSafetyManifest); }
function applyCentralSyncedStateValue(...args) { return centralSyncRuntimeService.applyCentralSyncedStateValue(...args); }
function getCentralSyncResultValue(...args) { return centralSyncRuntimeService.getCentralSyncResultValue(...args); }
function getCentralSyncResultRevision(...args) { return centralSyncRuntimeService.getCentralSyncResultRevision(...args); }
function retryCentralStateWriteAfterConflict(...args) { return centralSyncRuntimeService.retryCentralStateWriteAfterConflict(...args); }
function registerSessionPlannerCentralSyncConflict(...args) { return centralSyncRuntimeService.registerSessionPlannerCentralSyncConflict(...args); }
function queueCentralStateWrite(...args) { return centralSyncRuntimeService.queueCentralStateWrite(...args); }
function flushCentralStateWrites(...args) { return centralSyncRuntimeService.flushCentralStateWrites(...args); }
installFootballDataSafety();
installPlatformOverlayStability({ win });
const defaultScheduleState = createDefaultScheduleState();
const importedNccScheduleEvents = Array.isArray(win.__importedNccScheduleEvents)
? win.__importedNccScheduleEvents
: [];
const importedNccScheduleVersion = importedNccScheduleEvents.length
? win.__importedNccScheduleVersion || "ncc-2026-numbers-v1"
: "";
const defaultWorkspaceAccess = {
chat: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
schedule: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"],
gameplan: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
periodization: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
"session-planner": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
"player-profiles": ["admin", "club-admin", "team-admin", "coach", "scout", "performance", "medical"],
scouting: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
"transfer-room": ["admin", "team-admin"],
"analysis-room": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
"medical-team": ["admin", "club-admin", "team-admin", "coach", "performance", "medical"],
staff: ["admin"],
admin: ["admin"],
"team-identity": ["admin", "club-admin", "team-admin", "coach"],
"game-simulator": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance"],
};
const defaultWorkspaceEditAccess = {
chat: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
schedule: ["admin", "club-admin", "team-admin", "coach"],
gameplan: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
periodization: ["admin", "club-admin", "team-admin", "coach", "performance"],
"session-planner": ["admin", "club-admin", "team-admin", "coach"],
"player-profiles": ["admin", "club-admin", "team-admin", "coach", "scout"],
scouting: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
"transfer-room": ["admin", "team-admin"],
"analysis-room": ["admin", "club-admin", "team-admin", "scout", "analyst"],
"medical-team": ["admin", "club-admin", "team-admin", "medical", "performance"],
staff: ["admin"],
admin: ["admin"],
"team-identity": ["admin", "club-admin", "team-admin", "coach"],
"game-simulator": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
};
const requiredWorkspaceAccess = {
"session-planner": {
view: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
edit: ["admin", "club-admin", "team-admin", "coach"],
},
"player-profiles": {
view: ["admin", "club-admin", "team-admin", "coach", "scout", "performance", "medical"],
edit: ["admin", "club-admin", "team-admin", "coach", "scout"],
},
"medical-team": {
view: ["admin", "club-admin", "team-admin", "coach", "performance", "medical"],
edit: ["admin", "club-admin", "team-admin", "medical", "performance"],
},
scouting: {
view: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
edit: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
},
"transfer-room": {
view: ["admin", "team-admin"],
edit: ["admin", "team-admin"],
},
"team-identity": {
view: ["admin", "club-admin", "team-admin", "coach"],
edit: ["admin", "club-admin", "team-admin", "coach"],
},
};
const playerProfilesDefaultRosterVersion = "player-profiles-ncc-2026-v1";
const playerProfilesSchemaVersion = 3;
const playerProfileChangeLogLimit = 250;
const {
comparePlayerProfiles,
formatPlayerProfileChangeTime,
formatPlayerProfileChangeValue,
getDefaultPlayerProfileAttributeRatings,
getDefaultPlayerProfileCareerPhase,
getDefaultPlayerProfileIdp,
getDefaultPlayerProfileRole,
getDefaultPlayerProfileSquadStatus,
getNestedPlayerProfileValue,
getPlayerProfileAgeCacheKey,
getPlayerProfileAgeLookupSignature,
getPlayerProfileAgeValue,
getPlayerProfileBirthDateValue,
getPlayerProfileChangeDiffs,
getPlayerProfileDisplayAgeValue,
getPlayerProfileDisplayBirthDateValue,
getPlayerProfileDuplicateCandidates,
getPlayerProfileOption,
getPlayerProfileRoleGroupForRole,
getPlayerProfileRoleSortIndex,
getPlayerProfileRosterLabel,
getPlayerProfileRosterTypeOption,
getPlayerProfileSquadSortGroup,
getPlayerProfileSyncIdentityKeys,
getPlayerProfileTemporaryWindowLabel,
getTemporaryRosterTypeFromPlayerSource,
isPlayerProfileTemporaryActiveOnDate,
isTemporaryPlayerProfile,
normalizePlayerProfile,
normalizePlayerProfileAgeCacheEntry,
normalizePlayerProfileAgeLookupText,
normalizePlayerProfileAgeValue,
normalizePlayerProfileAttributeRatings,
normalizePlayerProfileBirthDate,
normalizePlayerProfileChangeLog,
normalizePlayerProfileChangeLogEntry,
normalizePlayerProfileFutureData,
normalizePlayerProfileIdp,
normalizePlayerProfileMedicalSummary,
normalizePlayerProfileName,
normalizePlayerProfileNumber,
normalizePlayerProfileRemovedIds,
normalizePlayerProfileRole,
normalizePlayerProfileRoleList,
normalizePlayerProfileRosterType,
normalizePlayerProfileRosterTypeKey,
normalizePlayerProfileTab,
normalizePlayerProfileTemporaryDate,
playerProfileCountsInSquad,
playerProfileRosterTypeCountsInSquad,
validatePlayerProfileFormValues,
} = createPlayerProfileHelpers({
changeLogLimit: playerProfileChangeLogLimit,
comparePlayers: compareMedicalPlayers,
createId: createDashboardId,
getAgeCacheEntry: getPlayerProfileAgeCacheEntry,
getNow: () => new Date().toISOString(),
isDateValue: isMedicalDateValue,
});
const getPlayerProfileFormValues = createPlayerProfileFormValueReader({
attributeGroups: playerProfileAttributeGroups,
normalizeNumber: normalizePlayerProfileNumber,
});
const playerProfileRosterUiSelectors = createPlayerProfileRosterUiSelectors({
compareProfiles: compareMedicalPlayers,
countsInSquad: playerProfileCountsInSquad,
getRosterLabel: getPlayerProfileRosterLabel,
isTemporaryProfile: isTemporaryPlayerProfile,
normalizeRosterType: normalizePlayerProfileRosterType,
});
const getPlayerProfilesRosterSummary = playerProfileRosterUiSelectors.getRosterSummary;
const {
getPlayerProfileDateDiffDays,
getPlayerProfileDateValueFromTimestamp,
getPlayerProfileIdpFollowUpLabel,
getPlayerProfileIdpMissingFocusLabel,
getPlayerProfileIdpReviewLabel,
getPlayerProfileRoleFitScore,
getPlayerRoleDnaAttributeBreakdown,
getPlayerRoleDnaAttributeFit,
getPlayerRoleDnaBaseFit,
getPlayerRoleDnaBestMatches,
getPlayerRoleDnaDefinition,
getPlayerRoleDnaReasons,
getPlayerRoleDnaScore,
getSquadMatrixAvailabilityAdjustment,
getSquadMatrixCompatibleRoles,
getSquadMatrixRoleGroup,
getSquadMatrixSideAdjustment,
getSquadPlayerDataQualityFlags,
getSquadStatusRank,
} = createPlayerProfileIntelligenceHelpers({
formatDateValue: formatScheduleDateValue,
formatMedicalDateLabel: (...args) => formatMedicalDateLabel(...args),
getCompleteness: getPlayerProfileCompleteness,
getMedicalSnapshot: getPlayerProfileMedicalSnapshot,
isDateValue: isMedicalDateValue,
normalizeNumber: normalizePlayerProfileNumber,
normalizeRole: normalizePlayerProfileRole,
parseDateValue: parseScheduleDateValue,
});
const {
buildSquadDataQualityReport,
buildSquadSessionPlannerContracts,
buildSquadDataFoundationPayload,
getSquadFoundationFileStamp,
downloadSquadFoundationTextFile,
exportSquadDataFoundationJson,
exportSquadSessionPlannerCsv,
createSessionPlannerPlayerProfileContract,
getSessionPlannerPlayerProfileContracts,
getSessionPlannerPlayerProfileContract,
} = createSquadDataFoundationHelpers({
ensureState: ensurePlayerProfilesState,
getPlayers: () => playerProfilesState.players,
getStorageKey: () => playerProfilesStorageKey,
getNow: () => new Date().toISOString(),
getFileDate: () => new Date().toISOString().slice(0, 10),
getDataQualityFlags: getSquadPlayerDataQualityFlags,
getPlayerCompleteness: getPlayerProfileCompleteness,
getRoleOptions: () => playerProfileRoleOptions,
getRoleDnaScore: getPlayerRoleDnaScore,
getRoleFitScore: getPlayerProfileRoleFitScore,
getRoleDnaBestMatches: getPlayerRoleDnaBestMatches,
getMedicalSnapshot: getPlayerProfileMedicalSnapshot,
getEffectiveStatus: getPlayerProfileEffectiveStatusFromSnapshot,
getRosterSummary: getPlayerProfilesRosterSummary,
getAttributeGroups: () => playerProfileAttributeGroups,
normalizeChangeLog: normalizePlayerProfileChangeLog,
getChangeLog: () => playerProfilesState.changeLog,
formatDateValue: formatScheduleDateValue,
isMedicalDateValue,
});
const {
buildPlayerProfileImportPlan,
} = createSquadImportPlanner({
ensureState: ensurePlayerProfilesState,
getPlayers: () => playerProfilesState.players,
normalizeProfile: normalizePlayerProfile,
normalizeName: normalizePlayerProfileName,
validateProfile: validatePlayerProfileFormValues,
createId: createDashboardId,
getNow: () => new Date().toISOString(),
});
const periodizationStateAdapter = createPeriodizationStateAdapter({
formatDateValue: formatScheduleDateValue,
parseDateValue: parseScheduleDateValue,
importedVersion: win.__importedNccPeriodizationVersion || "",
importedDays:
win.__importedNccPeriodizationDays && typeof win.__importedNccPeriodizationDays === "object"
? win.__importedNccPeriodizationDays
: {},
getScheduleEventsForDate,
getAllScheduleEvents: () => {
if (!scheduleState) {
scheduleState = readScheduleState();
}
return scheduleState?.events || [];
},
getScheduleEventLabel: (type) => scheduleEventTypes[type]?.label ?? "Training",
});
const {
clonePeriodizationState,
defaultPeriodizationState,
getPeriodizationDay: getPeriodizationDayFromState,
isDateValueInYear,
isPeriodizationOffDay,
mergePeriodizationStatePreservingLocalUi,
normalizePeriodizationDay,
normalizePeriodizationMultiValue,
} = periodizationStateAdapter;
const periodizationRenderer = createPeriodizationRenderer({
escapeHtml,
formatDateValue: formatScheduleDateValue,
parseDateValue: parseScheduleDateValue,
getState: () => periodizationState,
getDay: getPeriodizationDay,
canEdit: canEditPeriodizationWorkspace,
isOffDay: isPeriodizationOffDay,
getMultiSelectOpenField: () => periodizationMultiSelectOpenField,
renderActionIcon: renderSessionPlannerActionIcon,
});
const {
ensureGameSimulatorRuntime,
hasActiveMetricTooltip,
hasUnsavedSimulatorWork,
hideMetricTooltip,
isPitchFullscreenActive,
isSimulatorIntroActive,
launchGameSimulatorFromIntro,
pauseSimulatorForWorkspaceSwitch,
queueGameSimulatorControllersLoad,
queueGameSimulatorRuntimeLoad,
readSavedSequenceLibrary,
render,
resetGameSimulatorIntro,
resetUnsavedSimulatorSession,
startSimulatorAnimationLoop,
stopSimulatorAnimationLoop,
syncGameSimulatorIntroState,
syncGameSimulatorSavedSequencesFromStorage,
syncPitchFullscreenButton,
togglePitchFullscreen,
updatePitchFullscreenHudLayout,
} = createGameSimulatorLazyRuntimeBridge({
canEditGameSimulatorWorkspace,
documentRef: document,
escapeHtml,
getHubState: () => hubState,
platformModuleLoader,
renderWorkspaceChrome,
sequenceLibraryStorageKey,
sequenceStorageKey,
ui,
win,
});
let hubState = null;
let periodizationState = null;
let periodizationDayOverlayOpen = false;
let periodizationDayOverlayMode = "view";
let scheduleState = null;
let medicalState = null;
let medicalRosterSearchQuery = "";
let medicalStatusFilter = "all";
let medicalOperationsTab = "availability";
let medicalPlayerModalOpen = false;
let medicalPlayerModalTab = "availability";
let medicalInjuryPlanDraftsByPlayerId = new Map();
let medicalBulkSelectedPlayerIds = new Set();
let medicalBulkRecommendationOpen = false;
let playerProfilesState = null;
let playerProfileAgeCacheState = null;
let playerProfileAgeHydrationTimer = 0;
let playerProfileAgeHydrationPending = false;
let playerProfileAgeHydrationLastFingerprint = "";
let playerProfilesSearchQuery = "";
let playerProfilesRoleGroupFilter = "all";
let playerProfilesRosterFilter = "all";
let playerProfilesTemporarySectionCollapsed = false;
let playerProfileActiveTab = "overview";
let playerProfileModalOpen = false;
let playerProfileNewPlayerModalOpen = false;
let playerProfileAutosaveTimer = 0, playerProfileAutosaveLastSignature = "";
let playerProfileRuntimeImportService = null;
let playerProfileRuntimeMedicalSyncService = null;
let playerProfileRuntimeStateService = null;
let playerProfileRuntimeWriteService = null;
const playerProfileImportUndoHistoryLimit = 3;
let playerProfileImportUndoHistory = [];
let playerProfileLastImportSnapshot = null;
let pendingPlayerProfileImportPlan = null;
let scoutingState = null;
let transferRoomState = null;
let sessionPlannerState = null;
let sessionPlannerExerciseLibrary = null;
let sessionPlannerExerciseLibraryFolders = null;
let dashboardChatThreadId = "team";
let dashboardChatWidgetToastTimer = null;
let dashboardChatWidgetToastState = null;
let dashboardChatTypingThreadId = "";
let dashboardChatTypingAt = 0;
let dashboardChatTypingLastSentAt = 0;
let dashboardChatTypingClearTimer = null;
let dashboardChatReplyDraft = null;
let dashboardChatPriorityDraft = "normal";
let dashboardChatConfirmAction = null;
let dashboardChatApiReadReceiptSyncSignatures = new Set();
let dashboardChatApiSyncTimer = 0;
let dashboardChatApiRealtimeChannel = null;
let dashboardChatApiRealtimeSignature = "";
let dashboardChatApiRealtimeStatus = "idle";
let dashboardChatApiRealtimeLastEventAt = 0;
let dashboardChatApiRealtimeRecoveryTimer = 0;
let dashboardChatApiScope = null;
let dashboardChatApiThreads = [];
let dashboardChatApiPagination = {};
let dashboardChatRuntimeMessages = [];
let dashboardChatHydratedThreadIds = new Set();
let dashboardChatMessageSearchQuery = "";
let dashboardChatMessageSearchActiveIndex = 0;
let dashboardChatModerationOpen = false;
let dashboardChatDetailsOpen = false;
let dashboardChatMobileConversationOpen = true;
let dashboardChatModerationFilters = { action: "all", userId: "", threadId: "", from: "", to: "" };
let dashboardChatModerationState = { loading: false, audits: [], failedUploads: [], retentionPolicy: null, health: null, filters: dashboardChatModerationFilters, error: "" };
let dashboardChatThreadSummarySyncTimer = 0;
let dashboardChatThreadSummaryLastRequestedAt = 0;
let dashboardChatComposerAttachmentDraft = null;
let dashboardChatGroupCreatorOpen = false;
let dashboardChatSubmittedComposerDrafts = new Map();
const sessionPlannerMultiSelectFields = new Set(["phase", "subPhase"]);
let sessionPlannerMultiSelectOpenField = "";
let exerciseLibraryRuntime = null;
let sessionPlannerWorkspaceController;
const sessionPlannerRuntimeDelegates = createSessionPlannerRuntimeDelegates({
getController: () => sessionPlannerWorkspaceController,
});
const {
clearSelectedSessionPlannerTacticalBoard,
getSessionPlannerTacticalEndpointCoordinates,
getMedicalAvailabilityItems,
getSessionPlannerSelectedSession,
getSessionPlannerSelectedBlock,
getSessionPlannerPlayerBoardSelectedColorIds,
getSessionPlannerTacticalActiveFrameId,
ensureSessionPlannerTacticalFrames,
getSessionPlannerTacticalSelectedElementIds,
clearSessionPlannerTacticalSelection,
isSessionPlannerTacticalElementSelected,
renderSessionPlannerTacticalSelectionBox,
isSessionPlannerTacticalEndpointElement,
updateSelectedSessionPlannerBlockField,
getSessionPlannerDateLabel,
renderSessionPlannerExerciseVisual,
renderSessionPlannerActionIcon,
canRemoveSessionPlannerLibraryExerciseFromSelectedFolder,
getSessionPlannerPlayerBoardProfileState,
getSessionPlannerPlayerBoardSyncedPlayer,
getSessionPlannerPlayerBoardBridgeContract,
getSessionPlannerPlayerBoardBridgeRoleLabel,
getSessionPlannerPlayerBoardBridgeBestMatches,
getSessionPlannerPlayerBoardBridgeSummary,
getSessionPlannerPlayerBoardCustomPerson,
getSessionPlannerPlayerBoardPlayers,
getSessionPlannerPlayerBoardSummary,
getSessionPlannerPlayerBoardWarnings,
syncSessionPlannerPlayerBoardSelection,
getSessionPlannerPlayerBoardPosition,
getSessionPlannerPlayerBoardPositionById,
getSessionPlannerPlayerBoardReadableSpacing,
getSessionPlannerReadablePlayerBoardPositions,
formatSessionPlannerHistoryTime,
getSessionPlannerHistoryActorLabel,
getSessionPlannerHistoryActionLabel,
getSessionPlannerMedicalAvailability,
renderSessionPlannerWorkspace,
ensureSessionPlannerSelectedSession,
selectSessionPlannerDate,
selectSessionPlannerBlock,
addSessionPlannerBlock,
renumberSessionPlannerExerciseBlocks,
moveSessionPlannerBlock,
reorderSessionPlannerBlock,
getSessionPlannerBlockDropPlacement,
clearSessionPlannerBlockDragState,
clearSessionPlannerLibraryDragState,
updateSessionPlannerLibraryPointerDropTarget,
startSessionPlannerLibraryPointerDrag,
updateSessionPlannerLibraryPointerDrag,
finishSessionPlannerLibraryPointerDrag,
deleteSessionPlannerBlock,
setSessionPlannerLibraryOpen,
closeSessionPlannerLibrary,
setSessionPlannerAddMenuOpen,
setSessionPlannerVisualPreviewOpen,
syncSessionPlannerPrintModeClass,
setSessionPlannerPrintOverlayOpen,
setSessionPlannerTacticalboardOpen,
setSessionPlannerPlayerBoardOpen,
openSessionPlannerPlayerBoardProfile,
closeSessionPlannerPlayerBoardProfile,
getSessionPlannerPlayerBoardVisiblePlayerIds,
normalizeSessionPlannerPlayerBoardSelectedIds,
setSessionPlannerPlayerBoardSelectedPlayers,
toggleSessionPlannerPlayerBoardSelectedPlayer,
syncSessionPlannerPlayerBoardSelectionUi,
updateSessionPlannerPlayerBoardSelectedColor,
clearSessionPlannerPlayerBoardSelectedColors,
getSessionPlannerPlayerBoardContextPosition,
normalizeSessionPlannerPlayerBoardCustomPersonPromptValue,
getSessionPlannerPlayerBoardCustomPersonKind,
removeSessionPlannerPlayerBoardCustomPerson,
openSessionPlannerPlayerBoardCustomPersonEditor,
closeSessionPlannerPlayerBoardCustomPersonEditor,
saveSessionPlannerPlayerBoardCustomPersonFromForm,
handleSessionPlannerPlayerBoardContextMenu,
resetSessionPlannerPlayerBoardPositions,
getSessionPlannerTacticalFrames,
syncSessionPlannerTacticalActiveFrame,
persistSessionPlannerTacticalElements,
commitSessionPlannerTacticalFrames,
addSessionPlannerTacticalFrame,
selectSessionPlannerTacticalFrame,
duplicateSessionPlannerTacticalFrame,
deleteSessionPlannerTacticalFrame,
refreshSessionPlannerTacticalboardCanvas,
isSessionPlannerTacticalLineTool,
isSessionPlannerTacticalStrokeElement,
isSessionPlannerTacticalPlacementTool,
uniqueValues,
setSessionPlannerTacticalSelectedElements,
isSessionPlannerTacticalSelectionToggleModifier,
toggleSessionPlannerTacticalElementSelection,
setSessionPlannerTacticalClickSuppression,
setSessionPlannerTacticalPitchMode,
openSessionPlannerTacticalNumberPicker,
updateSessionPlannerTacticalPlayerNumber,
updateSelectedSessionPlannerTacticalPlayerBadges,
shouldDragSessionPlannerTacticalSelectionGroup,
getSessionPlannerTacticalDragElementIds,
setSessionPlannerTacticalTool,
undoSelectedSessionPlannerTacticalBoardAction,
removeSessionPlannerTacticalElement,
removeSelectedSessionPlannerTacticalElement,
addSessionPlannerTacticalElement,
snapSessionPlannerTacticalValue,
snapSessionPlannerTacticalPoint,
shouldSnapSessionPlannerTacticalEvent,
getSessionPlannerTacticalCanvasPoint,
getSessionPlannerTacticalPointFromRect,
getSessionPlannerTacticalElementById,
getSessionPlannerTacticalSelectionRect,
getSessionPlannerTacticalElementBounds,
isSessionPlannerTacticalPointInRect,
getSessionPlannerTacticalElementSelectionPoints,
isSessionPlannerTacticalElementInSelectionRect,
getSessionPlannerTacticalElementsInRect,
getSelectedSessionPlannerTacticalElement,
getSelectedSessionPlannerTacticalElements,
syncSessionPlannerTacticalboardInspector,
updateSelectedSessionPlannerTacticalElement,
updateSessionPlannerTacticalLineStyle,
clampMovedTacticalPoint,
moveSessionPlannerTacticalElementFromInitial,
moveSessionPlannerTacticalElements,
moveSessionPlannerTacticalElementByDelta,
getSessionPlannerTacticalBoundsCollection,
getSessionPlannerTacticalArrangeSpacing,
moveSessionPlannerTacticalElementCenterTo,
arrangeSelectedSessionPlannerTacticalElements,
copySelectedSessionPlannerTacticalElements,
pasteSessionPlannerTacticalClipboard,
updateSessionPlannerTacticalElementHandle,
getSessionPlannerTacticalRotationFromEvent,
shouldPlaceSessionPlannerTacticalDoubleClick,
shouldSkipRepeatedSessionPlannerTacticalPlacement,
addSessionPlannerTacticalPlacementElement,
handleSessionPlannerTacticalCanvasClick,
handleSessionPlannerTacticalCanvasDoubleClick,
startSessionPlannerTacticalDrag,
updateSessionPlannerTacticalDrag,
finishSessionPlannerTacticalDrag,
startSessionPlannerPlayerBoardDrag,
updateSessionPlannerPlayerBoardDrag,
finishSessionPlannerPlayerBoardDrag,
getSessionPlannerPlayerBoardEventPoint,
getSessionPlannerPlayerBoardSelectionRect,
syncSessionPlannerPlayerBoardSelectionBox,
startSessionPlannerPlayerBoardSelection,
updateSessionPlannerPlayerBoardSelection,
finishSessionPlannerPlayerBoardSelection,
findSessionPlannerBlockById,
normalizeSessionPlannerVisualUpload,
handleSessionPlannerVisualUpload,
syncSessionPlannerPostSessionNotesToLibrary,
applySessionPlannerExercise,
syncSessionPlannerDateStripState,
scrollSessionPlannerSelectedDateIntoView,
resizeSessionPlannerTextarea,
resizeSessionPlannerTextareas,
scrollSessionPlannerDateStrip,
jumpSessionPlannerToToday,
renderSessionPlannerCentralSyncConflictOverlay,
resolveSessionPlannerCentralSyncConflict,
getSessionPlannerBlockNumber,
getSessionPlannerPlayerBoardRule,
getSessionPlannerPlayerBoardProfileForPlayer,
getSessionPlannerPlayerBoardProfileRoleFitMap,
getSessionPlannerPlayerBoardFutureMinutesValue,
applySessionPlannerSelectionAssistant,
compareSessionPlannerPlayerBoardItems,
isSessionPlannerPlayerVisibleForBoard,
isSessionPlannerPlayerBoardCustomPersonId,
getSessionPlannerPlayerBoardCustomPeople,
createSessionPlannerPlayerBoardCustomItem,
getSessionPlannerPlayerBoardAutoTargetItems,
getSessionPlannerPlayerBoardAutoSelectFormation,
applySessionPlannerPlayerBoardAutoTeamFormation,
applySessionPlannerPlayerBoardAutoSelect,
applySessionPlannerPlayerBoardFormation,
copySessionPlannerPlayerBoardTeamsFromBlock,
getSessionPlannerHistoryPanelContext,
loadSessionPlannerHistory,
restoreSessionPlannerHistoryEntry,
getSessionPlannerAvailabilityItems,
updateSessionPlannerPrintPaper,
updateSessionPlannerPrintSection,
ensureSessionPlannerPrintPageStyle,
removeSessionPlannerPrintRoot,
prepareSessionPlannerPrintRoot,
printSessionPlannerCurrentSession,
} = sessionPlannerRuntimeDelegates;
const {
cloneTacticalElement: cloneSessionPlannerTacticalElement,
cloneTacticalFrame: cloneSessionPlannerTacticalFrame,
createLineElement: createSessionPlannerLineElement,
createStableId: createSessionPlannerStableId,
getDefaultTacticalColor,
getDefaultTacticalLineStyle,
getTacticalCurveControlPoint: getSessionPlannerTacticalCurveControlPoint,
getTacticalDefaultCurveControlPoint: getSessionPlannerTacticalDefaultCurveControlPoint,
getTacticalPitchDimensionsForBlock: getSessionPlannerTacticalPitchDimensionsForBlock,
getTacticalPitchModeOption: getSessionPlannerTacticalPitchModeOption,
getTacticalRenderStrokeWidth: getSessionPlannerTacticalRenderStrokeWidth,
getTacticalStrokeDasharray,
getTacticalPlayerBadgeFromKeyboardEvent: getSessionPlannerTacticalPlayerBadgeFromKeyboardEvent,
isTacticalGoalType: isSessionPlannerTacticalGoalType,
isTacticalPlayerType: isSessionPlannerTacticalPlayerType,
normalizeTacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId,
normalizeTacticalColor,
normalizeTacticalFrameLabel: normalizeSessionPlannerTacticalFrameLabel,
normalizeTacticalFrames: normalizeSessionPlannerTacticalFrames,
normalizeTacticalLineStyle,
normalizeTacticalLineWidth,
normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
normalizeTacticalPlayerBadge: normalizeSessionPlannerTacticalPlayerBadge,
normalizeTacticalRotation,
} = createSessionPlannerTacticalHelpers({
clamp,
getLineState: () => ({
color: sessionPlannerLocalUiState.state.sessionPlannerTacticalColor,
lineWidth: sessionPlannerLocalUiState.state.sessionPlannerTacticalLineWidth,
lineStyle: sessionPlannerLocalUiState.state.sessionPlannerTacticalLineStyle,
}),
getSelectedBlock: getSessionPlannerSelectedBlock,
tacticalMaxFrames: sessionPlannerTacticalMaxFrames,
tacticalPitchModeKeys: sessionPlannerTacticalPitchModeKeys,
tacticalPitchModeOptions: sessionPlannerTacticalPitchModeOptions,
});
function normalizeSessionPlannerPlayerBoardPositions(source = {}) {
return normalizeSessionPlannerPlayerBoardPositionsFromModule(source);
}
function normalizeSessionPlannerPlayerBoardColors(source = {}) {
return normalizeSessionPlannerPlayerBoardColorsFromModule(source);
}
function normalizeSessionPlannerPlayerBoardCustomPeople(source = []) { return normalizeSessionPlannerPlayerBoardCustomPeopleFromModule(source); }
const {
createBlock: createSessionPlannerBlock,
createInitialBlockFieldMeta: createSessionPlannerInitialBlockFieldMeta,
createReviewNoteId: createSessionPlannerReviewNoteId,
getLibraryNow: getSessionPlannerLibraryNow,
getLibraryUserId: getSessionPlannerLibraryUserId,
normalizeBlockFieldMeta: normalizeSessionPlannerBlockFieldMeta,
normalizeReviewNote: normalizeSessionPlannerExerciseReviewNote,
normalizeReviewNotes: normalizeSessionPlannerExerciseReviewNotes,
normalizeTimestamp: normalizeSessionPlannerTimestamp,
parseTimestampMs: parseSessionPlannerTimestampMs,
} = createSessionPlannerBlockHelpers({
blockFieldUpdatedAtKey: sessionPlannerBlockFieldUpdatedAtKey,
blockMergeFields: sessionPlannerBlockMergeFields,
blockMergeFieldSet: sessionPlannerBlockMergeFieldSet,
clamp,
cloneTacticalElement: cloneSessionPlannerTacticalElement,
createStableId: createSessionPlannerStableId,
formatMultiValue: (...args) => formatSessionPlannerMultiValue(...args),
getCurrentUserId: () => (typeof getCurrentPlatformUser === "function" ? getCurrentPlatformUser()?.id || "" : ""),
normalizePlayerBoardColors: normalizeSessionPlannerPlayerBoardColors,
normalizePlayerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople,
normalizePlayerBoardPositions: normalizeSessionPlannerPlayerBoardPositions,
normalizeTacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId,
normalizeTacticalFrames: normalizeSessionPlannerTacticalFrames,
normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
});
const exerciseLibrarySelectors = createExerciseLibrarySelectors({
normalizeTimestamp: normalizeSessionPlannerTimestamp,
sortOptions: sessionPlannerLibrarySortOptions,
});
const exerciseLibraryStateAdapter = createExerciseLibraryStateAdapter({
createBlock: createSessionPlannerBlock,
createStableId: createSessionPlannerStableId,
normalizeTimestamp: normalizeSessionPlannerTimestamp,
getNow: getSessionPlannerLibraryNow,
getUserId: getSessionPlannerLibraryUserId,
normalizeMultiValue: (...args) => normalizeSessionPlannerMultiValue(...args),
formatMultiValue: (...args) => formatSessionPlannerMultiValue(...args),
clamp,
normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
normalizeReviewNotes: normalizeSessionPlannerExerciseReviewNotes,
cloneTacticalElement: cloneSessionPlannerTacticalElement,
normalizeTacticalFrames: normalizeSessionPlannerTacticalFrames,
normalizeTacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId,
normalizePlayerBoardPositions: normalizeSessionPlannerPlayerBoardPositions,
normalizePlayerBoardColors: normalizeSessionPlannerPlayerBoardColors,
normalizePlayerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople,
versionLimit: sessionPlannerExerciseLibraryVersionLimit,
});
const exerciseLibraryUiStateBridge = createExerciseLibraryUiStateBridge({
getLocalState: () => sessionPlannerLocalUiState.state,
applyLocalPatch: (patch) => sessionPlannerLocalUiState.applyPatch(patch),
});
const {
getUiState: getExerciseLibraryUiState,
setUiState: setExerciseLibraryUiState,
} = exerciseLibraryUiStateBridge;
let exerciseLibraryRenderer;
let exerciseLibraryActions;
exerciseLibraryRuntime = createExerciseLibraryRuntimeController({
stateAdapter: exerciseLibraryStateAdapter,
selectors: exerciseLibrarySelectors,
getActions: () => exerciseLibraryActions,
getRenderer: () => exerciseLibraryRenderer,
getUi: () => ui,
getUiState: getExerciseLibraryUiState,
setUiState: setExerciseLibraryUiState,
getExerciseLibrary: () => sessionPlannerExerciseLibrary,
setExerciseLibrary: (exercises) => {
sessionPlannerExerciseLibrary = exercises;
},
getExerciseFolders: () => sessionPlannerExerciseLibraryFolders,
setExerciseFolders: (folders) => {
sessionPlannerExerciseLibraryFolders = folders;
},
win,
logEvent,
saveDataSafetySnapshot,
openDataSafetyDatabase,
dataSafetySnapshotStoreName,
exerciseLibraryStorageKey: sessionPlannerExerciseLibraryStorageKey,
exerciseLibraryBackupStorageKey: sessionPlannerExerciseLibraryBackupStorageKey,
exerciseLibraryFoldersStorageKey: sessionPlannerExerciseLibraryFoldersStorageKey,
exerciseLibraryFoldersBackupStorageKey: sessionPlannerExerciseLibraryFoldersBackupStorageKey,
defaultExerciseLibrary: sessionPlannerDefaultExerciseLibrary,
getActiveWorkspaceId: () => hubState?.activeWorkspaceId,
renderWorkspace: renderSessionPlannerWorkspace,
showToast: showSessionPlannerToast,
getLibraryUserId: getSessionPlannerLibraryUserId,
periodizationOptionLibrary,
getSelectedBlock: getSessionPlannerSelectedBlock,
updateSelectedBlockField: updateSelectedSessionPlannerBlockField,
getReviewNotes: (...args) => getSessionPlannerExerciseReviewNotes(...args),
canEdit: canEditSessionPlanner,
sessionPlannerMultiSelectFields,
setMultiSelectOpenField: (field) => {
sessionPlannerMultiSelectOpenField = field;
},
sessionPlannerRenderer: {
renderMultiSelectField: (...args) => sessionPlannerRenderer.renderMultiSelectField(...args),
},
});
const exerciseLibraryRuntimeFacade = createExerciseLibraryRuntimeFacade({ getRuntime: () => exerciseLibraryRuntime });
const { createSessionPlannerLibraryExercise, cloneSessionPlannerLibraryExercise, normalizeSessionPlannerExerciseLibraryList, normalizeSessionPlannerLibraryVersions, createSessionPlannerLibraryVersionSnapshot, appendSessionPlannerLibraryVersion, isSessionPlannerLibraryExerciseArchived, getSessionPlannerLibraryExercisesByArchiveState, getSessionPlannerActiveExerciseLibrary, getSessionPlannerLibraryArchiveCounts, parseSessionPlannerExerciseLibraryPayload, readSessionPlannerExerciseLibraryFromStorage, createSessionPlannerExerciseLibraryBackupEnvelope, writeSessionPlannerExerciseLibraryToStorage, findSessionPlannerExerciseLibraryInSnapshots, queueSessionPlannerExerciseLibrarySnapshotRecovery, readSessionPlannerExerciseLibrary, getSessionPlannerExerciseLibrary, normalizeSessionPlannerLibraryFolderVisibility, normalizeSessionPlannerLibraryFolderExerciseIds, createSessionPlannerLibraryFolder, createSessionPlannerDefaultExerciseLibraryFolders, normalizeSessionPlannerExerciseLibraryFolders, isSessionPlannerLibraryFolderArchived, parseSessionPlannerExerciseLibraryFoldersPayload, readSessionPlannerExerciseLibraryFoldersFromStorage, createSessionPlannerExerciseLibraryFoldersBackupEnvelope, writeSessionPlannerExerciseLibraryFoldersToStorage, readSessionPlannerExerciseLibraryFolders, getSessionPlannerExerciseLibraryFolders, writeSessionPlannerExerciseLibrary, normalizeSessionPlannerMultiValue, formatSessionPlannerMultiValue, normalizeSessionPlannerLibraryTags, formatSessionPlannerLibraryTags, getSessionPlannerMultiValueSummary, getSessionPlannerMultiSelectFieldConfig, refreshSessionPlannerMultiSelectFields, toggleSessionPlannerMultiSelectValue, clearSessionPlannerMultiSelectValue, normalizeSessionPlannerLibraryFilterValues, getSessionPlannerLibraryFilterValues, setSessionPlannerLibraryFilterValues, toggleSessionPlannerLibraryFilterOpen, toggleSessionPlannerLibraryFilterValue, clearSessionPlannerLibraryFilter, exerciseMatchesSessionPlannerLibraryFilterValue, getSessionPlannerVisibleLibraryFolders, getSessionPlannerArchivedLibraryFolders, getSessionPlannerLibraryFolderById, getSessionPlannerLibraryFolderExerciseIdSet, exerciseMatchesSessionPlannerLibraryFolder, getSessionPlannerLibraryFolderCount, getSessionPlannerLibraryFolderName, getUniqueSessionPlannerLibraryFolderName, selectSessionPlannerLibraryFolder, startSessionPlannerExerciseLibraryFolderEdit, cancelSessionPlannerExerciseLibraryFolderEdit, createSessionPlannerExerciseLibraryFolderFromForm, updateSessionPlannerExerciseLibraryFolderFromForm, archiveSessionPlannerExerciseLibraryFolder, restoreSessionPlannerExerciseLibraryFolder, addSessionPlannerExerciseToLibraryFolder, removeSessionPlannerExerciseFromLibraryFolder, getSessionPlannerLibraryOptionValues, normalizeSessionPlannerLibrarySortMode, compareSessionPlannerLibraryExercises, getFilteredSessionPlannerExerciseLibrary, updateSessionPlannerLibraryFilter, updateSessionPlannerLibraryArchiveView, updateSessionPlannerLibrarySortMode, renderSessionPlannerLibraryResults, updateSessionPlannerLibrarySearch, getSessionPlannerLibraryExerciseById, getSessionPlannerLibraryEditExercise, getSessionPlannerLibraryViewExercise, startSessionPlannerLibraryExerciseView, closeSessionPlannerLibraryExerciseView, startSessionPlannerLibraryExerciseEdit, cancelSessionPlannerLibraryExerciseEdit, getSessionPlannerLibraryExerciseEditFields, duplicateSessionPlannerLibraryExercise, updateSessionPlannerLibraryExerciseFromEdit, hasSessionPlannerLibraryExerciseEditChanges, saveSessionPlannerLibraryExerciseEditAsCopy, normalizeSessionPlannerLibraryTitle } = exerciseLibraryRuntimeFacade;
const {
buildLibraryExerciseFromBlock: buildSessionPlannerLibraryExerciseFromBlock,
createReviewNoteFromBlock: createSessionPlannerReviewNoteFromBlock,
getExerciseReviewNotes: getSessionPlannerExerciseReviewNotes,
getExerciseReviewNotesForBlock: getSessionPlannerExerciseReviewNotesForBlock,
} = createExerciseLibraryReviewHelpers({
cloneTacticalElement: cloneSessionPlannerTacticalElement,
createLibraryExercise: createSessionPlannerLibraryExercise,
createReviewNoteId: createSessionPlannerReviewNoteId,
createStableId: createSessionPlannerStableId,
getExerciseById: getSessionPlannerLibraryExerciseById,
getLibraryUserId: getSessionPlannerLibraryUserId,
getNow: getSessionPlannerLibraryNow,
getSelectedDate: () => sessionPlannerState?.selectedDate || "",
normalizePlayerBoardColors: normalizeSessionPlannerPlayerBoardColors,
normalizePlayerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople,
normalizePlayerBoardPositions: normalizeSessionPlannerPlayerBoardPositions,
normalizeReviewNote: normalizeSessionPlannerExerciseReviewNote,
normalizeReviewNotes: normalizeSessionPlannerExerciseReviewNotes,
normalizeTacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId,
normalizeTacticalFrames: normalizeSessionPlannerTacticalFrames,
normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
});
const sessionPlannerSessionFactory = createSessionPlannerSessionFactory({
createBlock: createSessionPlannerBlock,
defaultExerciseLibrary: sessionPlannerDefaultExerciseLibrary,
formatDateValue: formatScheduleDateValue,
getActiveExerciseLibrary: getSessionPlannerActiveExerciseLibrary,
getPeriodizationOverride: (dateValue) => {
if (!dateValue) {
return {};
}
if (!periodizationState) {
periodizationState = readPeriodizationState();
}
return periodizationState?.days?.[dateValue] ?? {};
},
getScheduleEventsForDate,
getScheduleMainEvent,
getScheduledSessionTitle: getScheduledSessionTitleForDate,
isScheduleSessionEvent,
});
exerciseLibraryRenderer = createExerciseLibraryRenderer({
escapeHtml,
normalizeTimestamp: normalizeSessionPlannerTimestamp,
normalizeTags: normalizeSessionPlannerLibraryTags,
normalizeFolderExerciseIds: normalizeSessionPlannerLibraryFolderExerciseIds,
getReviewNotes: getSessionPlannerExerciseReviewNotes,
getMultiValueSummary: getSessionPlannerMultiValueSummary,
canEdit: canEditSessionPlanner,
sortOptions: sessionPlannerLibrarySortOptions,
getState: () => ({
isOpen: sessionPlannerLocalUiState.state.sessionPlannerLibraryOpen,
archiveView: sessionPlannerLocalUiState.state.sessionPlannerLibraryArchiveView,
editingFolderId: sessionPlannerLocalUiState.state.sessionPlannerLibraryEditingFolderId,
filterOpen: sessionPlannerLocalUiState.state.sessionPlannerLibraryFilterOpen,
searchQuery: sessionPlannerLocalUiState.state.sessionPlannerLibrarySearchQuery,
selectedFolderId: sessionPlannerLocalUiState.state.sessionPlannerLibrarySelectedFolderId,
sortMode: sessionPlannerLocalUiState.state.sessionPlannerLibrarySortMode,
pendingSave: sessionPlannerLocalUiState.state.sessionPlannerPendingLibrarySave,
getFilterValues: getSessionPlannerLibraryFilterValues,
getArchiveCounts: getSessionPlannerLibraryArchiveCounts,
normalizeSortMode: normalizeSessionPlannerLibrarySortMode,
getFolderName: getSessionPlannerLibraryFolderName,
getFolderCount: getSessionPlannerLibraryFolderCount,
getVisibleFolders: getSessionPlannerVisibleLibraryFolders,
getArchivedFolders: getSessionPlannerArchivedLibraryFolders,
getCurrentUserId: getSessionPlannerLibraryUserId,
isFolderArchived: isSessionPlannerLibraryFolderArchived,
isExerciseArchived: isSessionPlannerLibraryExerciseArchived,
canRemoveFromSelectedFolder: canRemoveSessionPlannerLibraryExerciseFromSelectedFolder,
getSelectedFolder: () => getSessionPlannerLibraryFolderById(sessionPlannerLocalUiState.state.sessionPlannerLibrarySelectedFolderId),
getFilteredExercises: getFilteredSessionPlannerExerciseLibrary,
getEditExercise: getSessionPlannerLibraryEditExercise,
getViewExercise: getSessionPlannerLibraryViewExercise,
getOptionValues: getSessionPlannerLibraryOptionValues,
}),
});
exerciseLibraryActions = createExerciseLibraryActions({
canEdit: canEditSessionPlanner,
confirm: (message) => win.confirm(message),
showToast: showSessionPlannerToast,
renderWorkspace: renderSessionPlannerWorkspace,
renderResults: renderSessionPlannerLibraryResults,
getNow: getSessionPlannerLibraryNow,
getUserId: getSessionPlannerLibraryUserId,
createStableId: createSessionPlannerStableId,
createFolder: createSessionPlannerLibraryFolder,
normalizeFolderVisibility: normalizeSessionPlannerLibraryFolderVisibility,
normalizeFolderExerciseIds: normalizeSessionPlannerLibraryFolderExerciseIds,
isFolderArchived: isSessionPlannerLibraryFolderArchived,
isExerciseArchived: isSessionPlannerLibraryExerciseArchived,
normalizeTitle: normalizeSessionPlannerLibraryTitle,
normalizeMultiValue: normalizeSessionPlannerMultiValue,
formatMultiValue: formatSessionPlannerMultiValue,
normalizeTags: normalizeSessionPlannerLibraryTags,
clamp,
cloneExercise: cloneSessionPlannerLibraryExercise,
createVersionSnapshot: createSessionPlannerLibraryVersionSnapshot,
appendVersion: appendSessionPlannerLibraryVersion,
normalizeVersions: normalizeSessionPlannerLibraryVersions,
getExercises: getSessionPlannerExerciseLibrary,
setExercises: (exercises) => {
sessionPlannerExerciseLibrary = exercises;
},
writeExercises: writeSessionPlannerExerciseLibraryToStorage,
getFolders: getSessionPlannerExerciseLibraryFolders,
setFolders: (folders) => {
sessionPlannerExerciseLibraryFolders = folders;
},
writeFolders: writeSessionPlannerExerciseLibraryFoldersToStorage,
getExerciseById: getSessionPlannerLibraryExerciseById,
getFolderById: getSessionPlannerLibraryFolderById,
getUniqueFolderName: getUniqueSessionPlannerLibraryFolderName,
getEditFields: getSessionPlannerLibraryExerciseEditFields,
syncSelectedBlockFields: syncSelectedSessionPlannerBlockFieldsFromDom,
getSelectedBlock: getSessionPlannerSelectedBlock,
buildExerciseFromBlock: buildSessionPlannerLibraryExerciseFromBlock,
getUiState: getExerciseLibraryUiState,
setUiState: setExerciseLibraryUiState,
});
const sessionPlannerLocalUiState = createSessionPlannerLocalUiState({
printSectionOptions: sessionPlannerPrintSectionOptions,
});
const sessionPlannerRuntimeRenderers = createSessionPlannerRuntimeRenderers({
buildMedicalPlayerFromPlayerProfile,
canEditSessionPlanner,
clamp,
clearSessionPlannerTacticalNumberPickerElementId: () => {
sessionPlannerLocalUiState.state.sessionPlannerTacticalNumberPickerElementId = "";
},
cloneSessionPlannerTacticalElement,
compareMedicalPlayers,
createMedicalRecordFromSquadAvailabilityBlock,
createSessionPlannerLineElement,
createSessionPlannerStableId,
escapeHtml,
exerciseLibraryRenderer,
formatScheduleDateValue,
getDashboardSessionTotalMinutes,
getDefaultTacticalColor,
getDefaultTacticalLineStyle,
getMedicalAvailabilityItems,
getMedicalCoachComment,
getMedicalPlayerAvailabilityStatusOption,
getMedicalRecordStatus,
getMedicalRtpPhaseOption,
getPeriodizationDay,
getPeriodizationDayScheduleLabel,
getPeriodizationMatchDayLabel,
getPlayerProfileRosterLabel,
getPlayerProfileRoleOptions: () => playerProfileRoleOptions,
getPlayerProfileTemporaryWindowLabel,
getScheduleSessionEventForDate,
getSelectedMedicalDate: () => medicalState?.selectedDate,
getSessionPlannerDateLabel,
getSessionPlannerExerciseReviewNotesForBlock,
getSessionPlannerMedicalAvailability,
getSessionPlannerMultiSelectOpenField: () => sessionPlannerMultiSelectOpenField,
getSessionPlannerPlayerBoardAutoModeOptions: () => sessionPlannerPlayerBoardAutoModeOptions,
getSessionPlannerPlayerBoardBridgeBestMatches,
getSessionPlannerPlayerBoardBridgeContract,
getSessionPlannerPlayerBoardBridgeRoleLabel,
getSessionPlannerPlayerBoardBridgeSummary,
getSessionPlannerPlayerBoardColorOptions: () => sessionPlannerPlayerBoardColorOptions,
getSessionPlannerPlayerBoardCustomPerson,
getSessionPlannerPlayerBoardFormationInput: () => sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardFormationInput,
getSessionPlannerPlayerBoardMaxTeamCount: () => sessionPlannerPlayerBoardMaxTeamCount,
getSessionPlannerPlayerBoardPlayers,
getSessionPlannerPlayerBoardPosition,
getSessionPlannerPlayerBoardPositionById,
getSessionPlannerPlayerBoardProfileState,
getSessionPlannerPlayerBoardReadableSpacing,
getSessionPlannerPlayerBoardSelectedColorIds,
getSessionPlannerPlayerBoardState: () => ({
playerBoardOpen: sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardOpen,
selectedPlayerIds: sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardSelectedPlayerIds,
formationInput: sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardFormationInput,
teamCount: sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardTeamCount,
autoMode: sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardAutoMode,
assistantOpen: sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardAssistantOpen,
customPersonEditor: sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardCustomPersonEditor,
selectedDate: sessionPlannerState?.selectedDate || "",
}),
getSessionPlannerPlayerBoardSummary,
getSessionPlannerPlayerBoardSyncedPlayer,
getSessionPlannerPlayerBoardWarnings,
getSessionPlannerPrintPaperOptions: () => sessionPlannerPrintPaperOptions,
getSessionPlannerPrintSectionOptions: () => sessionPlannerPrintSectionOptions,
getSessionPlannerPrintState: () => ({
printOverlayOpen: sessionPlannerLocalUiState.state.sessionPlannerPrintOverlayOpen,
printPaper: sessionPlannerLocalUiState.state.sessionPlannerPrintPaper,
printSections: sessionPlannerLocalUiState.state.sessionPlannerPrintSections,
selectedDate: sessionPlannerState?.selectedDate || "",
}),
getSessionPlannerReadablePlayerBoardPositions,
getSessionPlannerSelectedBlock,
getSessionPlannerSelectedSession,
getSessionPlannerState: () => sessionPlannerState || {},
getSessionPlannerTacticalActiveFrameId,
getSessionPlannerTacticalCurveControlPoint,
getSessionPlannerTacticalDefaultCurveControlPoint,
getSessionPlannerTacticalPitchDimensionsForBlock,
getSessionPlannerTacticalPitchModeOption,
getSessionPlannerTacticalPitchModeOptions: () => sessionPlannerTacticalPitchModeOptions,
getSessionPlannerTacticalRenderStrokeWidth,
getSessionPlannerTacticalSelectedElementIds,
getSessionPlannerTacticalNumberPickerElementId: () => sessionPlannerLocalUiState.state.sessionPlannerTacticalNumberPickerElementId,
getSessionPlannerVisualState: () => ({
visualPreviewOpen: sessionPlannerLocalUiState.state.sessionPlannerVisualPreviewOpen,
tacticalboardOpen: sessionPlannerLocalUiState.state.sessionPlannerTacticalboardOpen,
tool: sessionPlannerLocalUiState.state.sessionPlannerTacticalTool,
color: sessionPlannerLocalUiState.state.sessionPlannerTacticalColor,
lineWidth: sessionPlannerLocalUiState.state.sessionPlannerTacticalLineWidth,
lineStyle: sessionPlannerLocalUiState.state.sessionPlannerTacticalLineStyle,
pendingPoint: sessionPlannerLocalUiState.state.sessionPlannerTacticalPendingPoint,
selectedElementId: sessionPlannerLocalUiState.state.sessionPlannerTacticalSelectedElementId,
draftLineState: sessionPlannerLocalUiState.state.sessionPlannerTacticalDraftLineState,
freehandState: sessionPlannerLocalUiState.state.sessionPlannerTacticalFreehandState,
}),
getScheduledSessionTitleForDate,
getTacticalStrokeDasharray,
isMedicalPlayerBlockedBySquadAvailability,
isPlayerProfileTemporaryActiveOnDate,
isSessionPlannerTacticalElementSelected,
isSessionPlannerTacticalEndpointElement,
isSessionPlannerTacticalGoalType,
isSessionPlannerTacticalPlayerType,
isTemporaryPlayerProfile,
medicalActualParticipationFallback,
medicalOperationsTabOptions,
medicalPlayerModalTabOptions,
normalizeMedicalActualParticipation,
normalizePlayerProfileRole,
normalizeSessionPlannerMultiValue,
normalizeSessionPlannerTacticalPitchMode,
normalizeSessionPlannerTacticalPlayerBadge,
normalizeSessionPlannerTimestamp,
normalizeTacticalColor,
normalizeTacticalRotation,
parseScheduleDateValue,
periodizationOptionLibrary,
renderSessionPlannerActionIcon,
renderSessionPlannerExerciseVisual,
renderSessionPlannerPeriodizationOverlay,
renderSessionPlannerPeriodizationSummary,
renderSessionPlannerTacticalSelectionBox,
sessionPlannerMultiSelectFields,
sessionPlannerPlayerBoardAutoModeOptions,
sessionPlannerPlayerBoardMaxTeamCount,
syncSessionPlannerPlayerBoardSelection,
ensureSessionPlannerTacticalFrames,
});
const {
formatMedicalDateLabel,
getMedicalPlayerInitials,
normalizeMedicalOperationsTab,
normalizeMedicalPlayerModalTab,
renderMedicalMetric,
renderMedicalPlayerAvatar,
renderMedicalSquadAvailabilityBadge,
renderMedicalTemporaryPlayerBadge,
formatWarningNames: formatSessionPlannerPlayerWarningNames,
getCareerPhasePriority: getSessionPlannerPlayerBoardCareerPhasePriority,
getCareerScore: getSessionPlannerPlayerBoardCareerScore,
getColorStyle: getSessionPlannerPlayerBoardColorStyle,
getCustomColor: getSessionPlannerPlayerBoardCustomColor,
getDataObject: getSessionPlannerPlayerBoardDataObject,
getDirectRoleFitScore: getSessionPlannerPlayerBoardDirectRoleFitScore,
getExplicitRoles: getSessionPlannerPlayerBoardExplicitRoles,
getImportanceScore: getSessionPlannerPlayerBoardImportanceScore,
getInitialLabelMap: getSessionPlannerPlayerBoardInitialLabelMap,
getItemPriorityScore: getSessionPlannerPlayerBoardItemPriorityScore,
getLabelCandidates: getSessionPlannerPlayerBoardLabelCandidates,
getMinutesScore: getSessionPlannerPlayerBoardMinutesScore,
getNumericPriorityValue: getSessionPlannerPlayerBoardNumericPriorityValue,
getPlayerRoleProfile: getSessionPlannerPlayerBoardPlayerRoleProfile,
getPositionGroup: getSessionPlannerPlayerBoardPositionGroup,
getPriorityScore: getSessionPlannerPlayerBoardPriorityScore,
getRoleGroupForRole: getSessionPlannerPlayerBoardRoleGroupForRole,
getRoleOrder: getSessionPlannerPlayerBoardRoleOrder,
getRolePriorityKeys: getSessionPlannerPlayerBoardRolePriorityKeys,
getRolePriorityValue: getSessionPlannerPlayerBoardRolePriorityValue,
getSideForRole: getSessionPlannerPlayerBoardSideForRole,
getSourceBlocks: getSessionPlannerPlayerBoardSourceBlocks,
getSourceLabel: getSessionPlannerPlayerBoardSourceLabel,
getSquadStatusPriority: getSessionPlannerPlayerBoardSquadStatusPriority,
getTextColor: getSessionPlannerPlayerBoardTextColor,
getTone: getSessionPlannerPlayerBoardTone,
hasTeamData: hasSessionPlannerPlayerBoardTeamData,
normalizePlayerBoardColors: normalizeSessionPlannerPlayerBoardColorsFromModule,
normalizePlayerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeopleFromModule,
normalizePlayerBoardPositions: normalizeSessionPlannerPlayerBoardPositionsFromModule,
normalizeProfileKey: normalizeSessionPlannerPlayerBoardProfileKey,
normalizeRoleGroupKey: normalizeSessionPlannerPlayerBoardRoleGroupKey,
normalizeSquadStatusKey: normalizeSessionPlannerPlayerBoardSquadStatusKey,
positionGroups: sessionPlannerPlayerBoardPositionGroups,
addItemToAutoTeam: addSessionPlannerPlayerBoardItemToAutoTeam,
assignAutoFormationTeams: assignSessionPlannerPlayerBoardAutoFormationTeams,
assignAutoTeams: assignSessionPlannerPlayerBoardAutoTeams,
assignFormationSlots: assignSessionPlannerPlayerBoardFormationSlots,
cleanFormationInput: cleanSessionPlannerPlayerBoardFormationInput,
createAutoAssignmentsFromTeams: createSessionPlannerPlayerBoardAutoAssignmentsFromTeams,
createAutoTeamFormationSlots: createSessionPlannerPlayerBoardAutoTeamFormationSlots,
createAutoTeamSlotPlan: createSessionPlannerPlayerBoardAutoTeamSlotPlan,
createAutoTeams: createSessionPlannerPlayerBoardAutoTeams,
createExtraTeamSlots: createSessionPlannerPlayerBoardExtraTeamSlots,
createFormationSlots: createSessionPlannerPlayerBoardFormationSlots,
getAutoTeamCell: getSessionPlannerPlayerBoardAutoTeamCell,
getAutoTeamGrid: getSessionPlannerPlayerBoardAutoTeamGrid,
getDefaultGridPosition: getSessionPlannerPlayerBoardDefaultGridPosition,
getDefaultPosition: getSessionPlannerPlayerBoardDefaultPosition,
getFormationLineRole: getSessionPlannerPlayerBoardFormationLineRole,
getFormationLineY: getSessionPlannerPlayerBoardFormationLineY,
getFormationSide: getSessionPlannerPlayerBoardFormationSide,
getFormationSideOrder: getSessionPlannerPlayerBoardFormationSideOrder,
getFormationSlotX: getSessionPlannerPlayerBoardFormationSlotX,
getRelationLookupValue: getSessionPlannerPlayerBoardRelationLookupValue,
getRelationPairs: getSessionPlannerPlayerBoardRelationPairs,
getRelationScore: getSessionPlannerPlayerBoardRelationScore,
getStoredRelationScore: getSessionPlannerPlayerBoardStoredRelationScore,
mapSlotToAutoTeamCell: mapSessionPlannerPlayerBoardSlotToAutoTeamCell,
normalizeAutoMode: normalizeSessionPlannerPlayerBoardAutoMode,
normalizeFormationValue: normalizeSessionPlannerPlayerBoardFormationValue,
normalizeTeamCount: normalizeSessionPlannerPlayerBoardTeamCount,
parseFormation: parseSessionPlannerPlayerBoardFormation,
pickAutoTeamSlotItem: pickSessionPlannerPlayerBoardAutoTeamSlotItem,
pickBalancedTeamIndex: pickSessionPlannerPlayerBoardBalancedTeamIndex,
scoreAutoTeamSlotCandidate: scoreSessionPlannerPlayerBoardAutoTeamSlotCandidate,
scoreFormationFit: scoreSessionPlannerPlayerBoardFormationFit,
shouldAutoUseGoalkeeperSlots: shouldSessionPlannerPlayerBoardAutoUseGoalkeeperSlots,
buildSessionPlannerSelectionAssistant,
sessionPlannerMedicalAvailabilitySelectors,
sessionPlannerPlayerBoardRenderer,
sessionPlannerPrintRenderer,
sessionPlannerRenderer,
sessionPlannerVisualRenderer,
sessionPlannerWorkspaceRenderer,
} = sessionPlannerRuntimeRenderers;
const platformDefaultRoles = ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
const platformManagementRoleSet = new Set(["admin", "club-admin", "team-admin"]);
const platformStaffRoleSet = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"]);
const platformRoleAliases = Object.freeze({
"super-admin": "admin",
"superadmin": "admin",
"administrator": "admin",
"platform-admin": "admin",
"platform owner": "admin",
"owner": "admin",
"admin-role": "admin",
});
const platformDefaultClubId = "club-north-carolina-courage";
const platformDefaultTeamId = "team-north-carolina-courage";
const platformDefaultClubName = "North Carolina Courage";
const platformDefaultClubShortName = "NCC";
const platformDefaultTeamName = "North Carolina Courage";
const platformDefaultTeamLevel = "First Team";
const legacyPlatformStructureValues = new Set([
"football science live",
"club football science live",
"team football science live",
"football-science-live",
"club-football-science-live",
"team-football-science-live",
"fsl",
]);
const canonicalPlatformClubValues = new Set([
"north carolina courage",
"club north carolina courage",
"club-north-carolina-courage",
"ncc",
]);
const canonicalPlatformTeamValues = new Set([
"north carolina courage",
"team north carolina courage",
"team-north-carolina-courage",
"first team",
"ncc",
]);
const {
doPlayerProfileScoutingNamesMatch,
findPlayerProfileNwslScoutingRecord,
getPlayerProfileScoutingMetric,
getPlayerProfileScoutingMetricIndex,
getPlayerProfileScoutingMetricValue,
getPlayerProfileScoutingMinutes,
getPlayerProfileScoutingNameParts,
getPlayerProfileScoutingPercentile,
getPlayerProfileScoutingPositionGroup,
isPlayerProfileNwslScoutingRecord,
normalizePlayerProfileScoutingText,
getPlayerProfileScoutingDatabase,
queuePlayerProfileScoutingDatabaseLoad,
renderPlayerProfileScoutingSpider,
} = createSquadScoutingRuntime({
escapeHtml,
platformModuleLoader,
renderWorkspace: () => renderPlayerProfilesWorkspace(),
win,
});
let selectedStaffUserId = null;
let staffCreateUserEditorOpen = false;
let selectedAdminUserId = null;
let adminUserEditorOpen = false;
let adminCreateUserEditorOpen = false;
let adminCreateUserTeamId = "";
let adminAuditEntries = [];
let adminAuditLoading = false;
let adminAuditLoadedAt = 0;
let adminAuditLoadError = "";
let platformReadinessReport = null;
let platformReadinessLoading = false;
let platformReadinessLoadedAt = 0;
let platformReadinessLoadError = "";
const {
adminAccessRenderer,
adminReadinessRenderer,
adminStructureRenderer,
adminUserRenderer,
adminWorkspaceRenderer,
passwordRevealInputRenderer,
profileWorkspaceRenderer,
staffWorkspaceRenderer,
squadProfileSelectedRenderer,
squadProfileSupportRenderer,
squadRosterRenderer,
squadWorkspaceRenderer,
} = createPlatformWorkspaceRenderers({
canAdminManageUser,
canEditPlayerProfiles,
dashboardTaskListRenderer,
defaultTeamId: platformDefaultTeamId,
escapeHtml,
formatPlayerProfileChangeTime,
formatUserName,
getAdminAuditState: () => ({
entries: adminAuditEntries,
loading: adminAuditLoading,
loadError: adminAuditLoadError,
}),
getAdminManagedWorkspaces,
getAdminTransferRoomAccessTeamId,
getAdminUserInitials,
getAllTemporaryPlayerProfiles,
getAssignableRolesForUser,
getClubById: getPlatformClubById,
getFilteredPlayerProfiles: () => playerProfilesState.players,
getHomeAppearanceImpactSummary,
getPlayerProfileActiveTab: () => playerProfileActiveTab,
getPlayerProfileChangeLog,
getPlayerProfileCompleteness,
getPlayerProfileDisplayAgeValue,
getPlayerProfileDisplayBirthDateValue,
getPlayerProfileEffectiveStatusFromSnapshot,
getPlayerProfileIdpFollowUpLabel,
getPlayerProfileMedicalSnapshot,
getPlayerProfileOption,
getPlayerProfileRosterLabel,
getPlayerProfileRosterSummary: getPlayerProfilesRosterSummary,
getPlayerProfileRosterTypeOption,
getPlayerProfileTemporaryWindowLabel,
getRecentPlayerProfileChangeLog,
getRoleLabel,
getScopedClubs: getScopedPlatformClubs,
getScopedTeams: getScopedPlatformTeams,
getSelectedAdminUserId: () => selectedAdminUserId,
getSelectedPlayerId: () => playerProfilesState.selectedPlayerId,
getTemporarySectionCollapsed: () => playerProfilesTemporarySectionCollapsed,
getTransferRoomState: ensureTransferRoomState,
getUserClubId,
getUserClubName,
getUserScopeLabel,
getUsersForTeam: getAdminUsersForTeam,
getUserTeamId,
getUserTeamName,
getWorkspaceAccessConfig,
hasWorkspaceScope: hasPlatformWorkspaceScope,
isCurrentPlatformUserAdmin,
isLegacyTeam: isLegacyPlatformTeam,
isLegacyTeamPlaceholderName: isLegacyPlatformTeamPlaceholderName,
isNewPlayerModalOpen: () => playerProfileNewPlayerModalOpen,
isPlatformAdminUser,
isProfileModalOpen: () => playerProfileModalOpen,
isTemporaryPlayerProfile,
normalizePlatformRole,
normalizePlayerProfileTab,
normalizeWorkspaceAccessEntry,
platformAppearanceDensityOptions,
platformAppearanceHomeComponentTypeIds,
platformAppearanceHomeSectionDefaults,
platformAppearanceThemeOptions,
platformAppearanceToneOptions,
playerProfileAttributeGroups,
playerProfileCareerPhaseOptions,
playerProfileCountsInSquad,
playerProfileIdpStatusOptions,
playerProfilePreferredSideOptions,
playerProfileRoleGroupOptions,
playerProfileRoleOptions,
playerProfileRosterTypeOptions,
playerProfileSquadStatusOptions,
playerProfileStatusOptions,
playerProfileTabOptions,
readAppearanceState: readPlatformAppearanceState,
renderAdminRoleOptions,
renderAdminTeamOptions,
renderPlayerProfileAvatar,
renderPlayerProfileAvatarUpload,
renderPlayerProfileScoutingSpider,
renderPlayerProfileStatusChip,
renderTaskList: dashboardTaskListRenderer.renderTaskList,
renderTeamLogoMark: renderPlatformTeamLogoMark,
renderUserAvatar,
});
const {
medicalAvailabilitySelectors,
medicalCommandRenderer,
medicalCommandSelectors,
medicalOperationsRenderer,
medicalOperationsSelectors,
medicalOptionSelectors,
medicalPlanFormRenderer,
medicalPlanSelectors,
medicalPlayerModalRenderer,
medicalProfileSummaryRenderer,
medicalProfileSummarySelectors,
medicalRecommendationRenderer,
medicalRosterRenderer,
medicalRosterSelectors,
parseMedicalRosterCsvLine,
parseMedicalRosterLine,
parseMedicalRosterLineParts,
parseMedicalRosterText,
renderMedicalActualParticipationOptions,
renderMedicalBulkUpdatePanel,
renderMedicalDurationUnitOptions,
renderMedicalGateOptions,
renderMedicalParticipationOptions,
renderMedicalRtpPhaseOptions,
renderMedicalStatusOptions,
} = createMedicalRuntimeRenderers({
addCalendarDays,
canEditMedicalTeam,
canViewPrivateMedicalDetails,
compareMedicalPlayers,
ensureMedicalState,
escapeHtml,
formatMedicalDateLabel,
formatScheduleDateValue,
getActiveMedicalInjuryPlan,
getActiveMedicalPlayers,
getActiveMedicalPlayersForDate,
getBulkRecommendationEligiblePlayers: getMedicalBulkRecommendationEligiblePlayers,
getBulkSelectedPlayers: getMedicalBulkSelectedPlayers,
getFilteredMedicalPlayers,
getLatestMedicalRecord,
getMedicalAttentionPlayers,
getMedicalAvailabilityItems,
getMedicalBulkRecommendationOpen: () => medicalBulkRecommendationOpen,
getMedicalCoachComment,
getMedicalCoachHandoverItems,
getMedicalDailyHuddle,
getMedicalDailyStats,
getMedicalDaySpan,
getMedicalHistoryEvents,
getMedicalInjuryPlanDraft,
getMedicalMonthAverageStats,
getMedicalMonthToDateDates,
getMedicalPastWindowDates,
getMedicalPlanClearanceSummary,
getMedicalPlanDaysRemaining,
getMedicalPlanElapsedDays,
getMedicalPlanReviewState,
getMedicalPlanSeverity,
getMedicalPlanTotalDays,
getMedicalPlayerInjuryPlans,
getMedicalPlayerModalOpen: () => medicalPlayerModalOpen,
getMedicalPlayerModalTab: () => medicalPlayerModalTab,
getMedicalPlayerPositionRank,
getMedicalPlayerProfileSummary,
getMedicalPlayerRecords,
getMedicalPlayerRestrictedLogRecords,
getMedicalPlayerSquadAvailabilityBlockReason,
getMedicalPositionSummaries,
getMedicalRecommendationActivityContext,
getMedicalRecordStatus,
getMedicalReviewAlerts,
getMedicalRosterPositionGroups,
getMedicalRosterPositionStats,
getMedicalRosterSearchQuery: () => medicalRosterSearchQuery,
getMedicalRtpPhaseForRecommendation,
getMedicalRtpPhaseOption,
getMedicalScheduleSummary,
getMedicalState: () => medicalState,
getMedicalStatusFilter: () => medicalStatusFilter,
getMedicalStatusForParticipation,
getMedicalStatusOption,
getMedicalStatusOptionForDate,
getMedicalTrailingRecommendationSummary,
getMedicalValidBulkSelection,
getMedicalVisibleComment,
getMedicalWindowAverage,
getMedicalWindowDates,
getSelectedMedicalPlayer,
isMedicalDateValue,
isMedicalInjuryPlanActive,
isMedicalItemArchived,
isMedicalPlanCleared,
isMedicalRestrictedRecommendationRecord,
isTemporaryPlayerProfile,
medicalActualParticipationFallback,
medicalClearanceRoles,
medicalGateOptions,
medicalInjuryDurationPresets,
medicalInjuryPlanStatusOptions,
medicalLoadGateOptions,
medicalParticipationOptions,
medicalPlayerModalTabOptions,
medicalPositionOrder,
medicalRtpPhaseOptions,
medicalStatusActivityLabels,
medicalStatusActivityTones,
medicalStatusOptions,
normalizeMedicalActualParticipation,
normalizeMedicalClearance,
normalizeMedicalLoadGates,
normalizeMedicalParticipation,
normalizeMedicalPlayer,
normalizeMedicalPlayerModalTab,
normalizeMedicalPlayerPosition,
parseScheduleDateValue,
renderMedicalMetric,
renderMedicalOperationsSystem,
renderMedicalPlayerAvatar,
renderMedicalSquadAvailabilityBadge,
renderMedicalTemporaryPlayerBadge,
});
const dashboardPresenceHeartbeatMs = 60000, dashboardPresencePollMs = 45000, dashboardPresenceSteadyPushMinMs = 30000;
const dashboardPresenceTypingPushMinMs = 5000, dashboardPresencePollMinMs = 30000;
const dashboardPresenceIdleMs = 90000;
const dashboardPresenceOnlineTtlMs = 85000;
const dashboardPresenceAwayTtlMs = 6 * 60 * 1000;
const dashboardTypingTtlMs = 9000;
const dashboardTypingSendThrottleMs = 1800;
let dashboardPresenceEntriesByUserId = {};
let dashboardPresenceHeartbeatTimer = null, dashboardPresencePollTimer = null, dashboardPresenceStarted = false, dashboardPresenceInFlight = false;
let dashboardPresenceLastActivityAt = Date.now(), dashboardPresenceLastRenderedSignature = "", dashboardPresenceLastPushAt = 0, dashboardPresenceLastPollAt = 0;
function getPlatformAuthStore() { return win.platformAuthStore ?? null; }
async function getPlatformApiAccessToken() {
if (win.platformAuthReadyPromise instanceof Promise) {
try {
await win.platformAuthReadyPromise;
} catch {
}
}
const authStore = getPlatformAuthStore();
if (typeof authStore?.getAccessToken !== "function") {
return "";
}
try {
return String((await authStore.getAccessToken()) || "").trim();
} catch {
return "";
}
}
function syncPlatformUserFromAuth() {
const authStore = getPlatformAuthStore();
platformUser = authStore?.getCurrentUser?.() ?? win.platformSession ?? null;
return platformUser;
}
function withUiTimeout(promise, timeoutMs, timeoutMessage) {
let timeoutId = 0;
return Promise.race([
Promise.resolve(promise).finally(() => {
if (timeoutId) {
win.clearTimeout(timeoutId);
}
}),
new Promise((_, reject) => {
timeoutId = win.setTimeout(() => {
reject(new Error(timeoutMessage || "Request timed out."));
}, timeoutMs);
}),
]);
}
function getCurrentPlatformUser() { return platformUser ?? syncPlatformUserFromAuth(); }
function updatePlatformUserFromPayload(nextUser) {
const authStore = getPlatformAuthStore();
if (!nextUser?.id || !authStore?.getUsers || !authStore?.writeUsers || !authStore?.setCurrentUser) {
return;
}
const users = Array.isArray(authStore.getUsers()) ? authStore.getUsers() : [];
const nextUsers = users.some((entry) => entry.id === nextUser.id)
? users.map((entry) => (entry.id === nextUser.id ? { ...entry, ...nextUser } : entry))
: [nextUser, ...users];
authStore.writeUsers(nextUsers);
const currentUser = getCurrentPlatformUser();
if (currentUser?.id === nextUser.id) {
authStore.setCurrentUser(nextUser.id);
}
}
function isCurrentPlatformUserAdmin() {
const user = getCurrentPlatformUser();
return isPlatformManagementUser(user);
}
function getPlatformUsers() { return getPlatformAuthStore()?.getUsers?.() ?? []; }
function getPlatformRoles() {
const roles = getPlatformAuthStore()?.roles;
if (Array.isArray(roles)) {
return Array.from(new Set([...platformDefaultRoles, ...roles]));
}
if (typeof roles === "function") {
try {
const nextRoles = roles();
return Array.isArray(nextRoles) ? Array.from(new Set([...platformDefaultRoles, ...nextRoles])) : platformDefaultRoles;
} catch {
return platformDefaultRoles;
}
}
return platformDefaultRoles;
}
function formatUserName(user) { return formatPlatformUserName(user); }
function getUserInitials(user) { return getPlatformUserInitials(user); }
function getUserProfileImageUrl(user) {
return getPlatformUserProfileImageUrl(user, {
maxUploadDataUrlLength: maxProfileImageUploadDataUrlLength,
maxUrlLength: maxProfileImageUrlLength,
});
}
function normalizePlatformImageUrl(value = "") {
return normalizePlatformProfileImageUrl(value, {
maxUploadDataUrlLength: maxProfileImageUploadDataUrlLength,
maxUrlLength: maxProfileImageUrlLength,
});
}
function getUserClub(user) {
const structure = getPlatformStructureState();
return getUserTeamName(user, structure) || getUserClubName(user, structure) || "Football Science";
}
function syncAccountMenu(user = getCurrentPlatformUser()) {
const name = user ? formatUserName(user) : "Profile";
const rawTeamLabel = normalizePlatformStructureText(user?.team || user?.teamName, "");
const club = rawTeamLabel && !isLegacyPlatformStructureValue(rawTeamLabel) ? rawTeamLabel : getUserClub(user);
applyUserAvatar(ui.profileMenuAvatar, user);
applyUserAvatar(ui.profileMenuPanelAvatar, user);
const accountFields = [
[ui.profileMenuName, name],
[ui.profileMenuPanelName, name],
[ui.profileMenuClub, club],
[ui.profileMenuPanelClub, club],
];
accountFields.forEach(([element, value]) => {
if (element) {
element.textContent = value;
}
});
if (ui.profileMenuButton) {
ui.profileMenuButton.setAttribute("aria-label", `Open profile menu for ${name}`);
ui.profileMenuButton.setAttribute("title", name);
}
}
function setProfileMenuOpen(isOpen) {
if (!ui.profileMenu || !ui.profileMenuButton) {
return;
}
ui.profileMenu.hidden = !isOpen;
ui.profileMenuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
}
function isProfileMenuOpen() { return Boolean(ui.profileMenu && !ui.profileMenu.hidden); }
function getRoleLabel(role) { return getPlatformRoleLabel(role); }
function normalizePlatformRole(role, fallback = "coach") {
if (Array.isArray(role)) {
return normalizePlatformRole(role.find((entry) => typeof entry === "string" && entry.trim()) || "", fallback);
}
if (role && typeof role === "object") {
return normalizePlatformRole(role?.role || role?.name || role?.value || "", fallback);
}
const normalizedRole = String(role || "").trim().toLowerCase();
const mappedRole = platformRoleAliases[normalizedRole] || normalizedRole;
return platformDefaultRoles.includes(mappedRole) ? mappedRole : fallback;
}
function isPlatformAdminUser(user) { return normalizePlatformRole(user?.role, "") === "admin"; }
function isPlatformManagementUser(user) { return platformManagementRoleSet.has(normalizePlatformRole(user?.role, "")); }
function isPlatformStaffUser(user) { return platformStaffRoleSet.has(normalizePlatformRole(user?.role, "")); }
function getAssignableRolesForUser(user = getCurrentPlatformUser()) {
const role = normalizePlatformRole(user?.role, "");
if (role === "admin") {
return platformDefaultRoles;
}
if (role === "club-admin") {
return ["team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"];
}
if (role === "team-admin") {
return ["coach", "scout", "analyst", "performance", "medical", "guest"];
}
return [];
}
const platformStructureStateHelpers = createPlatformStructureStateHelpers({
defaultClubId: platformDefaultClubId,
defaultTeamId: platformDefaultTeamId,
defaultClubName: platformDefaultClubName,
defaultClubShortName: platformDefaultClubShortName,
defaultTeamName: platformDefaultTeamName,
defaultTeamLevel: platformDefaultTeamLevel,
legacyValues: legacyPlatformStructureValues,
canonicalClubValues: canonicalPlatformClubValues,
canonicalTeamValues: canonicalPlatformTeamValues,
getTeamLogoUrl: getPlatformTeamLogoUrl,
});
const {
cloneDefaultPlatformStructureState: cloneDefaultPlatformStructureStateFromModule,
createPlatformStructureId: createPlatformStructureIdFromModule,
hasPlatformWorkspaceScope: hasPlatformWorkspaceScopeFromModule,
isCanonicalPlatformClub: isCanonicalPlatformClubFromModule,
isCanonicalPlatformClubValue: isCanonicalPlatformClubValueFromModule,
isCanonicalPlatformTeam: isCanonicalPlatformTeamFromModule,
isCanonicalPlatformTeamValue: isCanonicalPlatformTeamValueFromModule,
isLegacyPlatformClub: isLegacyPlatformClubFromModule,
isLegacyPlatformStructureValue: isLegacyPlatformStructureValueFromModule,
isLegacyPlatformTeam: isLegacyPlatformTeamFromModule,
isLegacyPlatformTeamPlaceholderName: isLegacyPlatformTeamPlaceholderNameFromModule,
normalizePlatformClub: normalizePlatformClubFromModule,
normalizePlatformStructureComparable: normalizePlatformStructureComparableFromModule,
normalizePlatformStructureId: normalizePlatformStructureIdFromModule,
normalizePlatformStructureState: normalizePlatformStructureStateFromModule,
normalizePlatformStructureText: normalizePlatformStructureTextFromModule,
normalizePlatformTeam: normalizePlatformTeamFromModule,
slugifyPlatformStructureValue: slugifyPlatformStructureValueFromModule,
} = platformStructureStateHelpers;
function cloneDefaultPlatformStructureState() { return cloneDefaultPlatformStructureStateFromModule(); }
function normalizePlatformStructureText(value, fallback = "") { return normalizePlatformStructureTextFromModule(value, fallback); }
function normalizePlatformStructureComparable(value = "") { return normalizePlatformStructureComparableFromModule(value); }
function isLegacyPlatformStructureValue(value = "") { return isLegacyPlatformStructureValueFromModule(value); }
function isCanonicalPlatformClubValue(value = "") { return isCanonicalPlatformClubValueFromModule(value); }
function isCanonicalPlatformTeamValue(value = "") { return isCanonicalPlatformTeamValueFromModule(value); }
function isLegacyPlatformClub(candidate = {}) {
return isLegacyPlatformClubFromModule(candidate);
}
function isLegacyPlatformTeam(candidate = {}) {
return isLegacyPlatformTeamFromModule(candidate);
}
function isCanonicalPlatformClub(candidate = {}) {
return isCanonicalPlatformClubFromModule(candidate);
}
function isCanonicalPlatformTeam(candidate = {}) {
return isCanonicalPlatformTeamFromModule(candidate);
}
function hasPlatformWorkspaceScope(user = {}) {
return hasPlatformWorkspaceScopeFromModule(user);
}
function slugifyPlatformStructureValue(value, fallback = "scope") { return slugifyPlatformStructureValueFromModule(value, fallback); }
function normalizePlatformStructureId(value, prefix, fallbackLabel) { return normalizePlatformStructureIdFromModule(value, prefix, fallbackLabel); }
function createPlatformStructureId(prefix, label, usedIds = new Set()) { return createPlatformStructureIdFromModule(prefix, label, usedIds); }
function normalizePlatformClub(club = {}, fallback = {}) {
return normalizePlatformClubFromModule(club, fallback);
}
function normalizePlatformTeam(team = {}, fallback = {}) {
return normalizePlatformTeamFromModule(team, fallback);
}
function normalizePlatformStructureState(candidate = {}) {
return normalizePlatformStructureStateFromModule(candidate);
}
function isLegacyPlatformTeamPlaceholderName(value = "") { return isLegacyPlatformTeamPlaceholderNameFromModule(value); }
function readPlatformStructureState() {
try {
const raw = win.localStorage.getItem(platformStructureStorageKey);
return normalizePlatformStructureState(raw ? JSON.parse(raw) : cloneDefaultPlatformStructureState());
} catch {
return cloneDefaultPlatformStructureState();
}
}
function writePlatformStructureState(nextState) {
try {
win.localStorage.setItem(platformStructureStorageKey, JSON.stringify(normalizePlatformStructureState(nextState)));
} catch {
logEvent("Club and team structure could not be written to local storage.");
}
}
function getPlatformStructureState() { return readPlatformStructureState(); }
function getPlatformClubById(clubId, structure = getPlatformStructureState()) { return structure.clubs.find((club) => club.id === clubId) ?? structure.clubs[0] ?? null; }
function getPlatformTeamById(teamId, structure = getPlatformStructureState()) { return structure.teams.find((team) => team.id === teamId) ?? structure.teams[0] ?? null; }
function findPlatformTeamByName(teamName, structure = getPlatformStructureState()) {
const normalizedName = String(teamName || "").trim().toLowerCase();
return normalizedName && !isLegacyPlatformStructureValue(normalizedName)
? structure.teams.find((team) => team.name.toLowerCase() === normalizedName) ?? null
: null;
}
function syncPlatformStructureWithUsers(users = getPlatformUsers()) {
const structure = readPlatformStructureState();
const clubIds = new Set(structure.clubs.map((club) => club.id));
const teamIds = new Set(structure.teams.map((team) => team.id));
let changed = false;
users.forEach((user) => {
const rawClubName = normalizePlatformStructureText(user.clubName || user.club || "", "");
const rawClubId = normalizePlatformStructureText(user.clubId || user.club_id || "", "");
const useDefaultClub =
isLegacyPlatformStructureValue(rawClubName) ||
isLegacyPlatformStructureValue(rawClubId) ||
isCanonicalPlatformClub({ id: rawClubId, name: rawClubName });
const clubName = useDefaultClub ? platformDefaultClubName : rawClubName;
const fallbackClubId = useDefaultClub
? platformDefaultClubId
: clubName
? normalizePlatformStructureId(user.clubId, "club", clubName)
: platformDefaultClubId;
const clubId = useDefaultClub ? platformDefaultClubId : normalizePlatformStructureText(user.clubId, fallbackClubId);
if (clubId && !clubIds.has(clubId)) {
structure.clubs.push(normalizePlatformClub({ id: clubId, name: clubName || "Club", shortName: user.clubShortName || clubName || "Club" }));
clubIds.add(clubId);
changed = true;
}
const rawTeamName = normalizePlatformStructureText(user.teamName || user.team || "", "");
const rawTeamId = normalizePlatformStructureText(user.teamId || user.team_id || "", "");
const useDefaultTeam =
isLegacyPlatformStructureValue(rawTeamName) ||
isLegacyPlatformStructureValue(rawTeamId) ||
isCanonicalPlatformTeam({ id: rawTeamId, name: rawTeamName });
const teamName = useDefaultTeam ? platformDefaultTeamName : rawTeamName;
const existingTeam = findPlatformTeamByName(teamName, structure);
const fallbackTeamId = useDefaultTeam
? platformDefaultTeamId
: existingTeam?.id || (teamName ? normalizePlatformStructureId(user.teamId, "team", teamName) : platformDefaultTeamId);
const teamId = useDefaultTeam ? platformDefaultTeamId : normalizePlatformStructureText(user.teamId, fallbackTeamId);
if (teamId && !teamIds.has(teamId)) {
structure.teams.push(
normalizePlatformTeam({
id: teamId,
clubId,
name: teamName || "Team",
shortName: user.teamShortName || teamName || "Team",
})
);
teamIds.add(teamId);
changed = true;
}
});
const normalizedStructure = normalizePlatformStructureState(structure);
if (changed) {
writePlatformStructureState(normalizedStructure);
}
return normalizedStructure;
}
function getUserTeamId(user, structure = getPlatformStructureState()) {
const explicitTeamId = normalizePlatformStructureText(user?.teamId || user?.team_id, "");
if (isLegacyPlatformStructureValue(explicitTeamId)) {
return platformDefaultTeamId;
}
if (explicitTeamId && structure.teams.some((team) => team.id === explicitTeamId)) {
return explicitTeamId;
}
const team = findPlatformTeamByName(user?.teamName || user?.team, structure);
return team?.id || platformDefaultTeamId;
}
function getUserClubId(user, structure = getPlatformStructureState()) {
const explicitClubId = normalizePlatformStructureText(user?.clubId || user?.club_id, "");
if (isLegacyPlatformStructureValue(explicitClubId)) {
return platformDefaultClubId;
}
if (explicitClubId && structure.clubs.some((club) => club.id === explicitClubId)) {
return explicitClubId;
}
const team = getPlatformTeamById(getUserTeamId(user, structure), structure);
return team?.clubId || platformDefaultClubId;
}
function getUserTeamName(user, structure = getPlatformStructureState()) {
const explicitTeamName = normalizePlatformStructureText(user?.teamName || user?.team, "");
const explicitTeamId = normalizePlatformStructureText(user?.teamId || user?.team_id, "");
if (explicitTeamId) {
if (isLegacyPlatformStructureValue(explicitTeamId)) {
return platformDefaultTeamName;
}
const team = getPlatformTeamById(explicitTeamId, structure);
if (team?.name) {
return team.name;
}
}
const matchedTeam = findPlatformTeamByName(explicitTeamName, structure);
if (matchedTeam?.name) {
return matchedTeam.name;
}
const fallbackTeam = getPlatformTeamById(platformDefaultTeamId, structure);
return explicitTeamName && !isLegacyPlatformStructureValue(explicitTeamName)
? explicitTeamName
: fallbackTeam?.name || platformDefaultTeamName;
}
function getActivePlatformTeam(structure = getPlatformStructureState()) {
const activeTeam = structure.teams.find((team) => team.id === structure.activeTeamId && team.status !== "archived") ?? null;
if (activeTeam && !isLegacyPlatformTeamPlaceholderName(activeTeam.name)) {
return activeTeam;
}
const defaultTeam = structure.teams.find((team) => team.id === platformDefaultTeamId && team.status !== "archived") ?? null;
if (defaultTeam && !isLegacyPlatformTeamPlaceholderName(defaultTeam.name)) {
return defaultTeam;
}
return (
structure.teams.find((team) => team.status !== "archived" && !isLegacyPlatformTeamPlaceholderName(team.name)) ??
activeTeam ??
structure.teams.find((team) => team.status !== "archived") ??
structure.teams[0] ??
null
);
}
function getPlatformTeamDisplayTeam(user = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
const currentAuthUser = getPlatformAuthStore()?.getCurrentUser?.() ?? null;
const displayUser = currentAuthUser || user || {};
const explicitTeamId = normalizePlatformStructureText(displayUser?.teamId || displayUser?.team_id, "");
if (explicitTeamId) {
const team = structure.teams.find((candidate) => candidate.id === explicitTeamId);
if (team?.name && !isLegacyPlatformTeamPlaceholderName(team.name)) {
return team;
}
}
const activeTeam = getActivePlatformTeam(structure);
if (activeTeam?.name) {
return activeTeam;
}
const matchedTeam = findPlatformTeamByName(displayUser?.teamName || displayUser?.team, structure);
if (matchedTeam?.name && !isLegacyPlatformTeamPlaceholderName(matchedTeam.name)) {
return matchedTeam;
}
return null;
}
function getPlatformTeamDisplayName(user = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
const currentAuthUser = getPlatformAuthStore()?.getCurrentUser?.() ?? null;
const displayUser = currentAuthUser || user || {};
const displayTeam = getPlatformTeamDisplayTeam(displayUser, structure);
if (displayTeam?.name) {
return displayTeam.name;
}
const explicitTeamName = normalizePlatformStructureText(displayUser?.teamName || displayUser?.team, "");
return explicitTeamName && !isLegacyPlatformTeamPlaceholderName(explicitTeamName) ? explicitTeamName : "Team";
}
function writePlatformTeamLogo(teamId, logoUrl) {
const structure = readPlatformStructureState();
const targetTeam = structure.teams.find((team) => team.id === teamId);
if (!targetTeam) {
return null;
}
const nextLogoUrl = normalizePlatformImageUrl(logoUrl);
const nextStructure = {
...structure,
teams: structure.teams.map((team) => (team.id === teamId ? { ...team, logoUrl: nextLogoUrl } : team)),
};
writePlatformStructureState(nextStructure);
return getPlatformTeamById(teamId, readPlatformStructureState());
}
async function uploadSquadTeamLogo(file) {
if (!canEditPlayerProfiles()) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Your role cannot update the team logo."],
});
return;
}
if (!file) {
return;
}
const structure = readPlatformStructureState();
const team = getPlatformTeamDisplayTeam(getCurrentPlatformUser(), structure);
if (!team?.id) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["No active team was available for logo upload."],
});
return;
}
try {
const logoUrl = await createProfileImageDataUrl(file);
writePlatformTeamLogo(team.id, logoUrl);
renderPlayerProfilesWorkspace("Team logo saved.");
} catch (error) {
const message =
error?.name === "QuotaExceededError"
? "Team logo could not be saved because local storage is full."
: String(error?.message || "Team logo could not be saved.").replace(/profile image/gi, "team logo");
renderPlayerProfilesWorkspace(message);
}
}
async function uploadPlayerProfilePhoto(playerId, file) {
if (!canEditPlayerProfiles()) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Your role cannot update player images."],
});
return;
}
if (!file) {
return;
}
ensurePlayerProfilesState();
const player = playerProfilesState.players.find((candidate) => candidate.id === playerId);
if (!player) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Player profile could not be found for image upload."],
});
return;
}
try {
const photoUrl = await createProfileImageDataUrl(file);
const result = updatePlayerProfile({ ...player, playerId: player.id, photoUrl });
renderPlayerProfilesWorkspace(
buildPlayerProfileOperationFeedback(result, result?.ok ? "Player image saved." : "Player image could not be saved.")
);
} catch (error) {
const message =
error?.name === "QuotaExceededError"
? "Player image could not be saved because local storage is full."
: String(error?.message || "Player image could not be saved.").replace(/profile image/gi, "player image");
renderPlayerProfilesWorkspace(message);
}
}
function handlePhotoInput(playerPhotoInput) {
if (!playerPhotoInput) return;
const file = playerPhotoInput.files?.[0] ?? null;
playerPhotoInput.value = "";
void uploadPlayerProfilePhoto(playerPhotoInput.dataset.playerProfilePhotoUpload || "", file);
}
function getUserClubName(user, structure = getPlatformStructureState()) {
const club = getPlatformClubById(getUserClubId(user, structure), structure);
return club?.name || normalizePlatformStructureText(user?.clubName || user?.club, "Club");
}
function getUserScopeLabel(user, structure = getPlatformStructureState()) {
if (hasPlatformWorkspaceScope(user)) {
return "Football Science Live · Platform";
}
const clubName = getUserClubName(user, structure);
const teamName = getUserTeamName(user, structure);
return clubName && teamName && clubName !== teamName ? `${clubName} · ${teamName}` : teamName || clubName;
}
function isSamePlatformClub(firstUser, secondUser, structure = getPlatformStructureState()) { return getUserClubId(firstUser, structure) === getUserClubId(secondUser, structure); }
function isSamePlatformTeam(firstUser, secondUser, structure = getPlatformStructureState()) { return getUserTeamId(firstUser, structure) === getUserTeamId(secondUser, structure); }
function canAdminViewUser(actor, targetUser, structure = getPlatformStructureState()) {
if (!actor || !targetUser) {
return false;
}
if (isPlatformAdminUser(actor) || actor.id === targetUser.id) {
return true;
}
const role = normalizePlatformRole(actor.role, "");
if (role === "club-admin") {
return isSamePlatformClub(actor, targetUser, structure);
}
if (role === "team-admin") {
return isSamePlatformTeam(actor, targetUser, structure);
}
return targetUser.status === "active" && isSamePlatformTeam(actor, targetUser, structure);
}
function canAdminManageUser(actor, targetUser, structure = getPlatformStructureState(), options = {}) {
if (!actor || !targetUser) {
return false;
}
if (isPlatformAdminUser(actor)) {
return options.remove ? actor.id !== targetUser.id : true;
}
if (actor.id === targetUser.id) {
return !options.remove;
}
if (!isPlatformManagementUser(actor)) {
return false;
}
const actorRole = normalizePlatformRole(actor.role, "");
const targetRole = normalizePlatformRole(targetUser.role, "");
if (actorRole === "club-admin") {
return isSamePlatformClub(actor, targetUser, structure) && targetRole !== "admin" && targetRole !== "club-admin";
}
if (actorRole === "team-admin") {
return isSamePlatformTeam(actor, targetUser, structure) && !platformManagementRoleSet.has(targetRole);
}
return false;
}
function getScopedPlatformUsers(users = getPlatformUsers(), actor = getCurrentPlatformUser(), structure = getPlatformStructureState()) { return users.filter((user) => canAdminViewUser(actor, user, structure)); }
function getScopedPlatformClubs(actor = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
if (isPlatformAdminUser(actor)) {
return structure.clubs;
}
const club = getPlatformClubById(getUserClubId(actor, structure), structure);
return club ? [club] : [];
}
function getScopedPlatformTeams(actor = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
if (isPlatformAdminUser(actor)) {
return structure.teams;
}
const role = normalizePlatformRole(actor?.role, "");
if (role === "club-admin") {
const clubId = getUserClubId(actor, structure);
return structure.teams.filter((team) => team.clubId === clubId);
}
const team = getPlatformTeamById(getUserTeamId(actor, structure), structure);
return team ? [team] : [];
}
function renderAdminRoleOptions(actor, selectedRole = "coach") { return adminStructureRenderer.renderRoleOptions(actor, selectedRole); }
function renderAdminTeamOptions(actor, structure, selectedTeamId = "") { return adminStructureRenderer.renderTeamOptions(actor, structure, selectedTeamId); }
function normalizeAdminUserSubmissionValues(values = {}, actor = getCurrentPlatformUser(), existingUser = null, structure = getPlatformStructureState()) {
const allowedRoles = getAssignableRolesForUser(actor);
const fallbackRole = existingUser?.role || (allowedRoles.includes("coach") ? "coach" : allowedRoles[0] || "coach");
let role = normalizePlatformRole(values.role || fallbackRole, fallbackRole);
if (!allowedRoles.includes(role)) {
role = allowedRoles.includes(fallbackRole) ? fallbackRole : allowedRoles[0] || "coach";
}
if (existingUser?.id && existingUser.id === actor?.id) {
role = existingUser.role;
}
let status = String(values.status || existingUser?.status || "active").trim().toLowerCase() === "paused" ? "paused" : "active";
if (existingUser?.id && existingUser.id === actor?.id) {
status = existingUser.status || "active";
}
const allowedTeams = getScopedPlatformTeams(actor, structure);
const requestedTeamId = values.teamId || existingUser?.teamId || getUserTeamId(actor, structure);
const requestedTeamName = values.team || values.teamName || existingUser?.team || "";
const selectedTeam =
allowedTeams.find((team) => team.id === requestedTeamId) ||
allowedTeams.find((team) => team.name.toLowerCase() === String(requestedTeamName).trim().toLowerCase()) ||
allowedTeams[0] ||
getPlatformTeamById(platformDefaultTeamId, structure);
const selectedClub = getPlatformClubById(selectedTeam?.clubId, structure) || getPlatformClubById(platformDefaultClubId, structure);
return {
...values,
role,
status,
clubId: selectedClub?.id || platformDefaultClubId,
clubName: selectedClub?.name || "North Carolina Courage",
teamId: selectedTeam?.id || platformDefaultTeamId,
teamName: selectedTeam?.name || "North Carolina Courage",
team: selectedTeam?.name || "North Carolina Courage",
};
}
function getAllWorkspacePool(sourceState = hubState) {
return Array.isArray(sourceState?.workspaces) && sourceState.workspaces.length
? sourceState.workspaces
: defaultHubState.workspaces;
}
function normalizeWorkspaceRoleList(roles = [], fallback = []) {
const knownRoles = new Set(platformDefaultRoles);
const sourceRoles = Array.isArray(roles) ? roles : fallback;
return Array.from(
new Set(["admin", ...sourceRoles.filter((role) => knownRoles.has(role))])
);
}
function normalizeWorkspaceAccessEntry(workspaceId, entry) {
const defaultView = defaultWorkspaceAccess[workspaceId] ?? platformDefaultRoles;
const defaultEdit = defaultWorkspaceEditAccess[workspaceId] ?? ["admin"];
const requiredView = requiredWorkspaceAccess[workspaceId]?.view ?? [];
const requiredEdit = requiredWorkspaceAccess[workspaceId]?.edit ?? [];
const withRequiredAccess = (permission) => {
const view = normalizeWorkspaceRoleList([...(permission.view ?? []), ...requiredView], defaultView);
const edit = normalizeWorkspaceRoleList([...(permission.edit ?? []), ...requiredEdit], defaultEdit).filter((role) =>
view.includes(role)
);
return {
view,
edit: normalizeWorkspaceRoleList(edit, ["admin"]),
};
};
if (Array.isArray(entry)) {
return withRequiredAccess({
view: normalizeWorkspaceRoleList(entry, defaultView),
edit: normalizeWorkspaceRoleList(defaultEdit, ["admin"]),
});
}
if (entry && typeof entry === "object") {
const view = normalizeWorkspaceRoleList(entry.view, defaultView);
const edit = normalizeWorkspaceRoleList(entry.edit, defaultEdit).filter((role) => view.includes(role));
return withRequiredAccess({
view,
edit: normalizeWorkspaceRoleList(edit, ["admin"]),
});
}
return withRequiredAccess({
view: normalizeWorkspaceRoleList(defaultView, platformDefaultRoles),
edit: normalizeWorkspaceRoleList(defaultEdit, ["admin"]),
});
}
function getWorkspaceAccessConfig(sourceState = hubState) {
const configuredAccess = sourceState?.workspaceAccess ?? {};
const workspaceIds = new Set([
...Object.keys(defaultWorkspaceAccess),
...Object.keys(defaultWorkspaceEditAccess),
...Object.keys(configuredAccess),
]);
return Array.from(workspaceIds).reduce((config, workspaceId) => {
config[workspaceId] = normalizeWorkspaceAccessEntry(workspaceId, configuredAccess[workspaceId]);
return config;
}, {});
}
function getWorkspaceByIdFromPool(workspaceId, sourceState = hubState) { return getAllWorkspacePool(sourceState).find((workspace) => workspace.id === workspaceId) ?? null; }
function canUserAccessWorkspace(
workspace,
user = getCurrentPlatformUser(),
accessConfig = getWorkspaceAccessConfig()
) {
if (!workspace) {
return false;
}
const normalizedRole = normalizePlatformRole(user?.role, "guest");
if (normalizedRole === "admin") {
return true;
}
if (workspace.id === "transfer-room") {
return canUserAccessTransferRoom(user);
}
if (workspace.requiresAdmin) {
return isPlatformManagementUser(user);
}
const permission = normalizeWorkspaceAccessEntry(workspace.id, accessConfig[workspace.id]);
if (!permission.view.length) {
return true;
}
return permission.view.includes(normalizedRole);
}
function canCurrentUserAccessWorkspace(workspace) { return canUserAccessWorkspace(workspace); }
function canUserEditWorkspace(
workspaceId,
user = getCurrentPlatformUser(),
accessConfig = getWorkspaceAccessConfig()
) {
const normalizedRole = normalizePlatformRole(user?.role, "guest");
if (normalizedRole === "admin") {
return true;
}
const workspace = getWorkspaceByIdFromPool(workspaceId);
if (!workspace) {
return false;
}
if (workspaceId === "transfer-room") {
return canUserEditTransferRoom(user);
}
if (workspace.requiresAdmin) {
return isPlatformManagementUser(user);
}
if (!isPlatformStaffUser(user)) {
return false;
}
const permission = normalizeWorkspaceAccessEntry(workspaceId, accessConfig[workspaceId]);
return permission.view.includes(normalizedRole) && permission.edit.includes(normalizedRole);
}
function canCurrentUserEditWorkspace(workspaceId) { return canUserEditWorkspace(workspaceId); }
function canEditScheduleWorkspace() { return canCurrentUserEditWorkspace("schedule"); }
function canEditSessionPlanner() { return canCurrentUserEditWorkspace("session-planner"); }
function canEditPeriodizationWorkspace() { return canCurrentUserEditWorkspace("periodization"); }
function canEditGameSimulatorWorkspace() { return canCurrentUserEditWorkspace("game-simulator"); }
function canEditScoutingWorkspace() { return canCurrentUserEditWorkspace("scouting"); }
function getAccessibleWorkspacePool() { return getAllWorkspacePool().filter((workspace) => canCurrentUserAccessWorkspace(workspace)); }
function getVisibleWorkspacePool() { return getAccessibleWorkspacePool().filter((workspace) => !workspace.hiddenFromNav); }
function mergeWorkspaceDefinitions(sourceWorkspaces = []) {
const sourceById = new Map(sourceWorkspaces.map((workspace) => [workspace.id, workspace]));
const defaultsById = new Map(defaultHubState.workspaces.map((workspace) => [workspace.id, workspace]));
return defaultHubState.workspaces.map((defaultWorkspace) => {
const workspace = sourceById.get(defaultWorkspace.id);
if (!workspace || !defaultsById.has(workspace.id)) {
return { ...defaultWorkspace };
}
const fallback = defaultsById.get(workspace.id) ?? {};
const mergedWorkspace = {
...fallback,
...workspace,
};
if (defaultWorkspace.id === "session-planner" || defaultWorkspace.id === "player-profiles") {
mergedWorkspace.kind = defaultWorkspace.kind;
mergedWorkspace.status = defaultWorkspace.status;
}
if (defaultWorkspace.id === "player-profiles") {
mergedWorkspace.title = defaultWorkspace.title;
mergedWorkspace.meta = defaultWorkspace.meta;
mergedWorkspace.description = defaultWorkspace.description;
}
return mergedWorkspace;
});
}
const {
cloneHubState,
clonePersistableWorkspaceHubState,
} = createWorkspaceHubStateHelpers({
defaultHubState,
defaultWorkspaceAccess,
mergeWorkspaceDefinitions,
});
function repairWorkspaceState(candidateState = hubState) {
const repairedState = candidateState ?? cloneHubState(defaultHubState);
const mergedWorkspaces = mergeWorkspaceDefinitions(
Array.isArray(repairedState.workspaces) && repairedState.workspaces.length
? repairedState.workspaces
: defaultHubState.workspaces
);
const activeExists = mergedWorkspaces.some(
(workspace) =>
workspace.id === repairedState.activeWorkspaceId &&
canUserAccessWorkspace(workspace, getCurrentPlatformUser(), getWorkspaceAccessConfig(repairedState))
);
repairedState.workspaces = mergedWorkspaces;
repairedState.workspaceAccess = getWorkspaceAccessConfig(repairedState);
if (!activeExists) {
repairedState.activeWorkspaceId = "home";
}
return repairedState;
}
function getWorkspaceIdFromUrl() {
try {
const params = new URLSearchParams(win.location.search);
return params.get("workspace") ?? params.get("space") ?? null;
} catch {
return null;
}
}
function readRememberedWorkspaceId() {
try {
return (
win.sessionStorage.getItem(workspaceLastActiveStorageKey) ||
win.localStorage.getItem(workspaceLastActiveStorageKey) ||
null
);
} catch {
return null;
}
}
function rememberActiveWorkspaceId(workspaceId) {
const safeWorkspaceId = typeof workspaceId === "string" ? workspaceId.trim() : "";
if (!safeWorkspaceId) {
return;
}
try {
win.sessionStorage.setItem(workspaceLastActiveStorageKey, safeWorkspaceId);
} catch {}
try {
win.localStorage.setItem(workspaceLastActiveStorageKey, safeWorkspaceId);
} catch {}
}
let periodizationMultiSelectOpenField = "";
function getPeriodizationDay(dateValue) { return getPeriodizationDayFromState(dateValue, periodizationState); }
function ensurePeriodizationState() {
if (!periodizationState) {
periodizationState = readPeriodizationState();
}
return periodizationState;
}
function writePeriodizationDay(dateValue, patch = {}, shouldRender = true) {
if (!periodizationState || !isDateValueInYear(dateValue, periodizationYear) || !canEditPeriodizationWorkspace()) {
return;
}
const previousDay = getPeriodizationDay(dateValue);
const nextDay = normalizePeriodizationDay({
...previousDay,
...patch,
});
const fieldUpdatedAt = {
...(previousDay[periodizationFieldUpdatedAtKey] || {}),
...(nextDay[periodizationFieldUpdatedAtKey] || {}),
};
const now = new Date().toISOString();
Object.keys(patch || {}).forEach((key) => {
if (periodizationTrackedFields.has(key)) {
fieldUpdatedAt[key] = now;
}
});
if (Object.keys(fieldUpdatedAt).length) {
nextDay[periodizationFieldUpdatedAtKey] = fieldUpdatedAt;
}
periodizationState.days[dateValue] = nextDay;
writePeriodizationState();
if (shouldRender) {
renderPeriodizationWorkspace();
}
}
function selectPeriodizationDate(dateValue, shouldOpenOverlay = true, overlayMode = "view") {
if (!periodizationState || !isDateValueInYear(dateValue, periodizationYear)) {
return;
}
const date = parseScheduleDateValue(dateValue);
const safeOverlayMode = overlayMode === "edit" && !canEditPeriodizationWorkspace() ? "view" : overlayMode;
periodizationState.selectedDate = dateValue;
periodizationState.selectedMonthIndex = date.getMonth();
periodizationDayOverlayOpen = shouldOpenOverlay;
periodizationDayOverlayMode = safeOverlayMode;
writePeriodizationState({ syncCentral: false });
renderPeriodizationWorkspace();
}
function setPeriodizationStateStorageValue(state = periodizationState, options = {}) {
const shouldSyncCentral = options.syncCentral !== false;
if (!shouldSyncCentral) {
rawDataSafetySetItem(periodizationStorageKey, JSON.stringify(state));
return;
}
win.localStorage.setItem(periodizationStorageKey, JSON.stringify(state));
}
function readPeriodizationState() {
try {
const raw = win.localStorage.getItem(periodizationStorageKey);
const state = raw ? clonePeriodizationState(JSON.parse(raw)) : clonePeriodizationState(defaultPeriodizationState);
const normalizedValue = JSON.stringify(state);
if (raw !== normalizedValue) {
setPeriodizationStateStorageValue(state, { syncCentral: false });
}
return state;
} catch {
const state = clonePeriodizationState(defaultPeriodizationState);
try {
setPeriodizationStateStorageValue(state, { syncCentral: false });
} catch {}
return state;
}
}
function writePeriodizationState(options = {}) {
if (!periodizationState) {
return;
}
try {
setPeriodizationStateStorageValue(periodizationState, options);
} catch {
logEvent("Periodization settings could not be written to local storage.");
}
}
function setPeriodizationMonth(monthIndex) {
if (!periodizationState || monthIndex < 0 || monthIndex > 11) {
return;
}
periodizationDayOverlayOpen = false;
periodizationDayOverlayMode = "view";
periodizationState.selectedMonthIndex = monthIndex;
const monthStart = new Date(periodizationYear, monthIndex, 1);
const selectedDate = parseScheduleDateValue(periodizationState.selectedDate);
if (selectedDate.getFullYear() !== periodizationYear || selectedDate.getMonth() !== monthIndex) {
periodizationState.selectedDate = formatScheduleDateValue(monthStart);
}
writePeriodizationState({ syncCentral: false });
if (hubState?.activeWorkspaceId === "periodization") {
renderPeriodizationWorkspace();
}
}
function shiftPeriodizationMonth(delta) {
if (!periodizationState) {
return;
}
setPeriodizationMonth(periodizationState.selectedMonthIndex + delta);
}
function scrollPeriodizationDateIntoView(dateValue, options = {}) {
if (!ui.periodizationBoard || !dateValue) {
return;
}
const prefersReducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
win.requestAnimationFrame(() => {
const selectedCard = ui.periodizationBoard.querySelector(`[data-periodization-date="${dateValue}"]`);
if (!selectedCard) {
return;
}
selectedCard.scrollIntoView({
block: options.block || "center",
inline: "nearest",
behavior: options.behavior || (prefersReducedMotion ? "auto" : "smooth"),
});
});
}
function jumpPeriodizationToToday() {
ensurePeriodizationState();
if (!periodizationState) {
return;
}
const today = new Date();
const todayDateValue = formatScheduleDateValue(new Date(periodizationYear, today.getMonth(), today.getDate()));
periodizationDayOverlayOpen = false;
periodizationDayOverlayMode = "view";
periodizationState = clonePeriodizationState({
...periodizationState,
selectedMonthIndex: today.getMonth(),
selectedDate: todayDateValue,
days: periodizationState?.days ?? {},
});
writePeriodizationState({ syncCentral: false });
if (hubState?.activeWorkspaceId === "periodization") {
renderPeriodizationWorkspace();
scrollPeriodizationDateIntoView(todayDateValue);
}
}
function mergeImportedNccSchedule(state) {
return mergeImportedScheduleEvents(state, {
importVersion: importedNccScheduleVersion,
events: importedNccScheduleEvents,
});
}
function setScheduleStateStorageValue(state = scheduleState, options = {}) {
const shouldSyncCentral = options.syncCentral !== false;
if (!shouldSyncCentral) {
rawDataSafetySetItem(scheduleStorageKey, JSON.stringify(state));
return;
}
win.localStorage.setItem(scheduleStorageKey, JSON.stringify(state));
}
function readScheduleState() {
try {
const raw = win.localStorage.getItem(scheduleStorageKey);
const state = raw ? cloneScheduleState(JSON.parse(raw)) : cloneScheduleState(defaultScheduleState);
const mergedState = mergeImportedNccSchedule(state);
const mergedValue = JSON.stringify(mergedState);
if (raw !== mergedValue) {
setScheduleStateStorageValue(mergedState, { syncCentral: false });
}
return mergedState;
} catch {
return mergeImportedNccSchedule(defaultScheduleState);
}
}
function writeScheduleState(options = {}) {
if (!scheduleState) {
return;
}
try {
setScheduleStateStorageValue(scheduleState, options);
} catch {
logEvent("Schedule could not be written to local storage.");
}
}
function setScoutingStateStorageValue(state = scoutingState, options = {}) {
const shouldSyncCentral = options.syncCentral !== false;
if (!shouldSyncCentral) {
rawDataSafetySetItem(scoutingStorageKey, JSON.stringify(state));
return;
}
win.localStorage.setItem(scoutingStorageKey, JSON.stringify(state));
}
function readScoutingState() {
try {
const raw = win.localStorage.getItem(scoutingStorageKey);
const state = raw ? cloneScoutingState(JSON.parse(raw)) : cloneScoutingState(defaultScoutingState);
const nextState = hubState?.activeWorkspaceId === "scouting" ? preserveScoutingTransientUiState(state, scoutingState) : state;
const normalizedValue = JSON.stringify(nextState);
if (raw !== normalizedValue) {
setScoutingStateStorageValue(nextState, { syncCentral: false });
}
return nextState;
} catch {
const state = cloneScoutingState(defaultScoutingState);
try {
setScoutingStateStorageValue(state, { syncCentral: false });
} catch {}
return state;
}
}
function writeScoutingState(options = {}) {
if (!scoutingState) {
return;
}
try {
setScoutingStateStorageValue(scoutingState, options);
} catch {
logEvent("Scouting could not be written to local storage.");
}
}
function ensureScoutingState() {
if (!scoutingState) {
scoutingState = readScoutingState();
}
return scoutingState;
}
const transferRoomRuntime = createTransferRoomRuntime({
storageKey: transferRoomStorageKey,
getCachedState: () => transferRoomState,
setCachedState: (state) => {
transferRoomState = state;
},
getPlatformStructureState,
getPlatformTeamById,
getUserTeamId,
defaultTeam: {
id: platformDefaultTeamId,
clubId: platformDefaultClubId,
name: platformDefaultTeamName,
shortName: platformDefaultClubShortName,
},
getPlayerProfilesState: () => playerProfilesState || readPlayerProfilesState(),
getScoutingState: () => scoutingState || readScoutingState(),
ensureScoutingState,
getCurrentUser: getCurrentPlatformUser,
getUsers: getPlatformUsers,
normalizeRole: normalizePlatformRole,
getDefaultTeamAliases: () => [platformDefaultTeamId, platformDefaultTeamName, "team-ncc-first"],
getActiveWorkspaceId: () => hubState?.activeWorkspaceId,
getRoot: () => ui.transferRoomWorkspace,
platformModuleLoader,
getAssetVersion: () => platformAssetVersion,
escapeHtml,
suppressCentralWrites: (key) => centralStateWriteSuppressionKeys.add(key),
unsuppressCentralWrites: (key) => centralStateWriteSuppressionKeys.delete(key),
setActiveWorkspace: (...args) => setActiveWorkspace(...args),
loadScoutingWorkspaceModule: () => workspaceModuleRuntimeController.loadScoutingWorkspaceModule(),
getScoutingWorkspaceContext: () => workspaceModuleRuntimeController.getScoutingWorkspaceContext(),
logEvent,
});
workspaceModuleRuntimeController = createWorkspaceModuleRuntimeController({
ui,
win,
platformModuleLoader,
getAssetVersion: () => platformAssetVersion,
getUsers: getPlatformUsers,
getCurrentUser: getCurrentPlatformUser,
getScheduleStateForGameplan: () => scheduleState || readScheduleState(),
getPlayerProfilesStateForGameplan: () => playerProfilesState || readPlayerProfilesState(),
canEditGameplan: () => canCurrentUserEditWorkspace("gameplan"),
getAuthToken: getPlatformApiAccessToken,
suppressCentralWrites: (key) => centralStateWriteSuppressionKeys.add(key),
unsuppressCentralWrites: (key) => centralStateWriteSuppressionKeys.delete(key),
escapeHtml,
getScoutingTeamName: () => {
const currentUser = getCurrentPlatformUser();
return normalizePlatformStructureText(currentUser?.team || currentUser?.teamName || currentUser?.clubName || currentUser?.club, "") || getUserTeamName(currentUser);
},
ensureScoutingState,
writeScoutingState,
canEditScouting: canEditScoutingWorkspace,
canSendToTransferRoom: canUserEditTransferRoom,
sendToTransferRoom: addTransferRoomTargetFromScoutingSnapshot,
scoutingTabs,
scoutingShadowSlots,
scoutingCoreMetricOptions,
scoutingStatusOptions,
scoutingPriorityOptions,
transferRoomRuntime,
getWorkspaceViewId,
getSafeWorkspaceId,
getHubState: () => hubState,
workspaceHubDefaultActiveWorkspaceId,
shouldDeferCentralizedAppStateReload,
hydrateState: {
schedule: () => {
if (!scheduleState) {
scheduleState = readScheduleState();
}
},
periodization: () => {
if (!periodizationState) {
periodizationState = readPeriodizationState();
}
if (!scheduleState) {
scheduleState = readScheduleState();
}
},
sessionPlanner: () => {
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
if (!sessionPlannerExerciseLibrary) {
sessionPlannerExerciseLibrary = readSessionPlannerExerciseLibrary();
}
if (!sessionPlannerExerciseLibraryFolders) {
sessionPlannerExerciseLibraryFolders = readSessionPlannerExerciseLibraryFolders();
}
if (!periodizationState) {
periodizationState = readPeriodizationState();
}
if (!medicalState) {
medicalState = readMedicalState();
}
},
medical: () => {
if (!medicalState) {
medicalState = readMedicalState();
}
if (!playerProfilesState) {
playerProfilesState = readPlayerProfilesState();
}
},
playerProfiles: () => {
if (!playerProfilesState) {
playerProfilesState = readPlayerProfilesState();
}
if (!medicalState) {
medicalState = readMedicalState();
}
},
transferRoom: () => {
syncTransferRoomLinkedState();
},
gameSimulator: () => {
queueGameSimulatorControllersLoad();
},
},
});
const {
getGameplanContext,
getScoutingAnalysisRoomContext,
getScoutingWorkspaceContext,
getTransferRoomWorkspaceContext,
hydrateWorkspaceModuleState,
loadGameplanModule,
loadScoutingWorkspaceModule,
loadTransferRoomWorkspaceModule,
renderAnalysisRoomWorkspace,
renderGameplanWorkspace,
renderScoutingWorkspace,
renderTransferRoomWorkspace,
} = workspaceModuleRuntimeController;
function readTransferRoomState() { return transferRoomRuntime.readState(); }
function ensureTransferRoomState() { return transferRoomRuntime.ensureState(); }
function syncTransferRoomLinkedState(options = {}) {
if (!playerProfilesState) {
playerProfilesState = readPlayerProfilesState();
}
ensureScoutingState();
transferRoomState = ensureTransferRoomState();
if (options.render && hubState?.activeWorkspaceId === "transfer-room" && !shouldDeferCentralizedAppStateReload()) {
renderTransferRoomWorkspace();
}
return transferRoomState;
}
function canUserAccessTransferRoom(user = getCurrentPlatformUser()) { return transferRoomRuntime.canAccess(user); }
function canUserEditTransferRoom(user = getCurrentPlatformUser()) { return transferRoomRuntime.canAccess(user); }
function addTransferRoomTargetFromScoutingSnapshot(snapshot = {}, options = {}) {
return transferRoomRuntime.addTargetFromScoutingSnapshot(snapshot, options);
}
const scheduleRuntimeSelectors = createScheduleRuntimeSelectors({
ensurePeriodizationState,
ensureScheduleState: () => {
if (!scheduleState) {
scheduleState = readScheduleState();
}
return scheduleState;
},
ensureSessionPlannerState: () => {
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
return sessionPlannerState;
},
formatBlockSummary: formatScheduleBlockSummaryFromModule,
getDayWarnings: getScheduleDayWarningsFromModule,
getMainEvent: getScheduleMainEventFromModule,
getPeriodizationDay,
getPeriodizationDayScheduleLabel,
getPeriodizationMatchDayLabel,
getScheduleState: () => scheduleState,
getUniqueEvents: getUniqueScheduleEvents,
isSessionEvent: isScheduleSessionEventFromModule,
parseDateValue: parseScheduleDateValue,
});
const {
formatBlockSummary: formatScheduleBlockSummary,
getEventsForDate: getScheduleEventsForDate,
getMainEvent: getScheduleMainEvent,
getMonthEvents: getScheduleMonthEvents,
getScheduleDayWarnings,
getScheduledSessionTitleForDate,
getSelectedDayContext: getScheduleSelectedDayContext,
getSessionEventForDate: getScheduleSessionEventForDate,
getSessionSnapshot: getScheduleSessionSnapshot,
getVisibleEvents: getScheduleVisibleEvents,
getVisibleMonthEvents: getScheduleVisibleMonthEvents,
isSessionEvent: isScheduleSessionEvent,
} = scheduleRuntimeSelectors;
const scheduleWorkspaceController = createScheduleWorkspaceController({
ui,
window: win,
document,
rendererOptions: {
escapeHtml,
getPeriodizationDay,
getPeriodizationDayScheduleLabel,
},
getState: () => scheduleState,
ensureState: () => {
if (!scheduleState) {
scheduleState = readScheduleState();
}
return scheduleState;
},
writeState: writeScheduleState,
canEdit: canEditScheduleWorkspace,
canCreateSession: canEditSessionPlanner,
isActive: () => hubState?.activeWorkspaceId === "schedule",
isEditableKeyboardTarget,
prepareRender: () => {
ensurePeriodizationState();
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
},
formatBlockSummary: formatScheduleBlockSummary,
getEventsForDate: getScheduleEventsForDate,
getSelectedDayContext: getScheduleSelectedDayContext,
getSessionForDate: (dateValue) => sessionPlannerState?.sessions?.[dateValue] || null,
getVisibleEvents: getScheduleVisibleEvents,
getVisibleMonthEvents: getScheduleVisibleMonthEvents,
isSessionEvent: isScheduleSessionEvent,
getFormValues: getPlatformFormValues,
onOpenSessionDate: (dateValue, options = {}) => {
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
if (!sessionPlannerState.sessions) {
sessionPlannerState.sessions = {};
}
sessionPlannerState.selectedDate = dateValue;
if (!sessionPlannerState.sessions[dateValue] && options.createSession && canEditSessionPlanner()) {
sessionPlannerState.sessions[dateValue] = createSessionPlannerEmptySession(dateValue);
}
writeSessionPlannerState();
setActiveWorkspace("session-planner");
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
},
onOpenPeriodizationDate: (dateValue) => {
ensurePeriodizationState();
selectPeriodizationDate(dateValue, true, "view");
setActiveWorkspace("periodization");
renderPeriodizationWorkspace();
},
});
function renderScheduleWorkspace() { scheduleWorkspaceController.render(); }
function readWorkspaceHubState() {
try {
const raw = win.localStorage.getItem(workspaceHubStorageKey);
if (!raw) {
return cloneHubState(defaultHubState);
}
const parsed = JSON.parse(raw);
return cloneHubState({
...defaultHubState,
...parsed,
activeWorkspaceId: workspaceHubDefaultActiveWorkspaceId,
profile: {
...defaultHubState.profile,
...(parsed?.profile ?? {}),
},
workspaces: mergeWorkspaceDefinitions(
Array.isArray(parsed?.workspaces) && parsed.workspaces.length
? parsed.workspaces
: defaultHubState.workspaces
),
workspaceAccess: {
...defaultWorkspaceAccess,
...(parsed?.workspaceAccess ?? {}),
},
});
} catch {
return cloneHubState(defaultHubState);
}
}
function writeWorkspaceHubState() {
if (!hubState) {
return;
}
try {
win.localStorage.setItem(workspaceHubStorageKey, JSON.stringify(clonePersistableWorkspaceHubState(hubState)));
} catch {
logEvent("Workspace hub settings could not be written to local storage.");
}
}
function getWorkspaceById(workspaceId) {
const workspaces = getAccessibleWorkspacePool();
return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}
function getWorkspaceByIdUnfiltered(workspaceId, sourceState = hubState) {
const workspaces = getAllWorkspacePool(sourceState);
return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}
function getSafeWorkspaceId(workspaceId, sourceState = hubState) {
const workspace = getWorkspaceByIdUnfiltered(workspaceId, sourceState);
if (!workspace) {
return null;
}
const user = getCurrentPlatformUser();
const accessConfig = getWorkspaceAccessConfig(sourceState);
if (!canUserAccessWorkspace(workspace, user, accessConfig)) {
return null;
}
return workspace.id;
}
function getWorkspaceViewId(workspaceId) {
const workspace = getWorkspaceById(workspaceId);
if (!workspace) {
return "home";
}
if (workspace.kind === "simulator") {
return "game-simulator";
}
if (workspace.kind === "dashboard") {
return "home";
}
if (workspace.kind === "profile") {
return "profile";
}
if (workspace.kind === "staff") {
return "staff";
}
if (workspace.kind === "admin") {
return "admin";
}
if (workspace.kind === "medical") {
return "medical-team";
}
if (workspace.kind === "player-profiles") {
return "player-profiles";
}
if (workspace.kind === "analysis-room") {
return "analysis-room";
}
if (workspace.kind === "transfer-room") {
return "transfer-room";
}
if (workspace.kind === "scouting") {
return "scouting";
}
if (workspace.kind === "schedule") {
return "schedule";
}
if (workspace.kind === "gameplan") {
return "gameplan";
}
if (workspace.kind === "periodization") {
return "periodization";
}
if (workspace.kind === "session") {
return "session-planner";
}
return "placeholder";
}
function getWorkspaceQuery() { return ui.workspaceSearch?.value.trim().toLowerCase() ?? ""; }
function getVisibleWorkspaces() {
const workspaces = getVisibleWorkspacePool();
const query = getWorkspaceQuery();
if (!query) {
return workspaces;
}
return workspaces.filter((workspace) =>
`${workspace.title} ${workspace.meta} ${workspace.description} ${workspace.status}`
.toLowerCase()
.includes(query)
);
}
function createDashboardId(prefix) {
return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function readDashboardJson(key, fallback) {
try {
const raw = win.localStorage.getItem(key);
if (!raw) {
return fallback;
}
return JSON.parse(raw);
} catch {
return fallback;
}
}
function writeDashboardJson(key, value) {
try {
win.localStorage.setItem(key, JSON.stringify(value));
} catch {
logEvent("Dashboard data could not be written to local storage.");
}
}
function normalizeDashboardChatThreadId(rawThreadId, fallbackThreadId = dashboardChatTeamThreadId) {
const threadId = String(rawThreadId || fallbackThreadId || "").trim();
if (!threadId || threadId === dashboardChatTeamThreadId) {
return dashboardChatTeamThreadId;
}
if (dashboardChatAdvancedThreadTemplates.some((template) => template.key === threadId)) {
return threadId;
}
const sanitizedThreadId = threadId.replace(/[^a-zA-Z0-9_.:-]/g, "-");
if (sanitizedThreadId.startsWith("group-") || sanitizedThreadId.startsWith("group:")) {
return sanitizedThreadId;
}
if (!threadId.startsWith("dm:")) {
return dashboardChatTeamThreadId;
}
const [, leftId = "", rightId = ""] = threadId.split(":");
const normalizedIds = [leftId, rightId]
.map((id) => String(id || "").trim())
.filter(Boolean)
.sort();
if (normalizedIds.length !== 2 || normalizedIds[0] === normalizedIds[1]) {
return dashboardChatTeamThreadId;
}
return `dm:${normalizedIds[0]}:${normalizedIds[1]}`;
}
function createDashboardChatThreadId(firstUserId, secondUserId) {
return normalizeDashboardChatThreadId(
`dm:${String(firstUserId || "").trim()}:${String(secondUserId || "").trim()}`,
dashboardChatTeamThreadId
);
}
function getDashboardChatTeamName() {
const scopedTeamName = String(
dashboardChatApiScope?.teamName ||
dashboardChatApiScope?.team?.name ||
dashboardChatApiScope?.team_name ||
""
).trim();
const userTeamName = String(getCurrentPlatformUser()?.team || "").trim();
return scopedTeamName || userTeamName || "Team";
}
function getDashboardChatTeamChatTitle() {
const teamName = getDashboardChatTeamName();
return teamName && teamName !== "Team" ? `${teamName} Chat` : "Team Chat";
}
function formatDashboardChatThreadLabel(threadId, currentUser, users = getPlatformUsers()) {
const normalized = normalizeDashboardChatThreadId(threadId);
if (normalized === dashboardChatTeamThreadId) {
return getDashboardChatTeamChatTitle();
}
const template = dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.key === normalized);
if (template) {
return template.title;
}
if (normalized.startsWith("group-") || normalized.startsWith("group:")) {
const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalized);
return dashboardChatThreadSettings.merge(normalized, apiThread?.settings || {}).customTitle || apiThread?.title || "Group chat";
}
const participantPartner = getDashboardChatThreadParticipants(normalized, users).find((user) => !isSameDashboardUser(user, currentUser));
if (participantPartner) {
return formatUserName(participantPartner);
}
const [, firstId = "", secondId = ""] = normalized.split(":");
const currentUserId = currentUser?.id || "";
const partnerId = firstId === currentUserId ? secondId : firstId;
const partner = users.find((user) => user.id === partnerId);
return partner ? formatUserName(partner) : "Direct Message";
}
function normalizeDashboardUserIdentityValue(value = "") { return String(value || "").trim().toLowerCase(); }
function isSameDashboardUser(firstUser = {}, secondUser = {}) {
if (!firstUser || !secondUser) {
return false;
}
const firstKeys = [
firstUser.id,
firstUser.email,
firstUser.username,
].map(normalizeDashboardUserIdentityValue).filter(Boolean);
const secondKeys = new Set([
secondUser.id,
secondUser.email,
secondUser.username,
].map(normalizeDashboardUserIdentityValue).filter(Boolean));
return firstKeys.some((key) => secondKeys.has(key));
}
function isGenericDashboardChatThreadTitle(value = "") {
const normalized = String(value || "").trim().toLowerCase();
return !normalized || ["chat", "team chat", "group chat", "direct message", "private chat"].includes(normalized);
}
function getDashboardChatThreadParticipants(threadId, users = getPlatformUsers()) {
const normalized = normalizeDashboardChatThreadId(threadId);
if (normalized === dashboardChatTeamThreadId || dashboardChatAdvancedThreadTemplates.some((template) => template.key === normalized)) {
return [];
}
if (normalized.startsWith("group-") || normalized.startsWith("group:")) {
const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalized);
const apiParticipants = Array.isArray(apiThread?.participants) ? apiThread.participants : [];
return apiParticipants
.map((participant) => {
const userId = String(participant.userId || participant.id || "").trim();
return users.find((user) => user.id === userId) || (userId ? { ...participant, id: userId } : null);
})
.filter(Boolean);
}
const [, firstId = "", secondId = ""] = normalized.split(":");
const userIds = [firstId, secondId];
return userIds.map((userId) => users.find((user) => user.id === userId)).filter(Boolean);
}
function getDashboardChatThreadLabel(threadId, currentUser, users = getPlatformUsers()) {
if (threadId === dashboardChatTeamThreadId) {
return getDashboardChatTeamChatTitle();
}
return formatDashboardChatThreadLabel(threadId, currentUser, users);
}
function getDashboardChatActiveToastThreadId() { return normalizeDashboardChatThreadId(readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId); }
function readDashboardChatWidgetState() {
const parsed = readDashboardJson(dashboardChatWidgetStateStorageKey, {
isOpen: false,
selectedThreadId: dashboardChatTeamThreadId,
});
return {
isOpen: Boolean(parsed?.isOpen),
selectedThreadId: normalizeDashboardChatThreadId(parsed?.selectedThreadId, dashboardChatTeamThreadId),
};
}
function writeDashboardChatWidgetState(nextState) {
writeDashboardJson(dashboardChatWidgetStateStorageKey, {
isOpen: Boolean(nextState?.isOpen),
selectedThreadId: normalizeDashboardChatThreadId(nextState?.selectedThreadId, dashboardChatTeamThreadId),
});
}
function readDashboardChatWidgetNotificationState() {
const parsed = readDashboardJson(dashboardChatWidgetNotificationStateStorageKey, {
enabled: true,
level: "all",
});
const level = ["all", "mentions", "muted"].includes(parsed?.level) ? parsed.level : parsed?.enabled === false ? "muted" : "all";
return {
enabled: level !== "muted",
level,
};
}
function writeDashboardChatWidgetNotificationState(nextState) {
const level = ["all", "mentions", "muted"].includes(nextState?.level)
? nextState.level
: nextState?.enabled === false
? "muted"
: "all";
writeDashboardJson(dashboardChatWidgetNotificationStateStorageKey, {
enabled: level !== "muted",
level,
});
}
const dashboardChatThreadSettings = createDashboardChatThreadSettingsStore({
readJson: readDashboardJson,
writeJson: writeDashboardJson,
normalizeThreadId: normalizeDashboardChatThreadId,
fallbackThreadId: dashboardChatTeamThreadId,
});
const dashboardChatApiUiActions = createDashboardChatApiUiActions({
applyApiPayload: applyDashboardChatApiPayload,
canFallbackApiResult: canFallbackDashboardChatApiResult,
getApiThreads: () => dashboardChatApiThreads,
getCurrentUser: getCurrentPlatformUser,
getMentionUserIds: getDashboardMentionUserIds,
getParticipantIds: getDashboardChatParticipantIdsForApi,
getRealtimeStatus: () => dashboardChatApiRealtimeStatus,
getThreadLabel: getDashboardChatThreadLabel,
getThreadType: getDashboardChatThreadTypeForApi,
getUsers: getPlatformUsers,
normalizeThreadId: normalizeDashboardChatThreadId,
queueThreadSummaryRefresh: queueDashboardChatThreadSummaryRefresh,
readMessages: readDashboardMessages,
renderWidget: renderDashboardChatWidget,
sendApiAction: sendDashboardChatApiAction,
settingsStore: dashboardChatThreadSettings,
showToast: showDashboardChatWidgetToast,
archiveThreadLocal: (threadId) => {
dashboardChatApiThreads = dashboardChatApiThreads.filter((thread) => thread.threadId !== threadId);
clearDashboardMessagesForThread(threadId, { skipCentralSync: true });
dashboardChatThreadSettings.remove(threadId);
writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: dashboardChatTeamThreadId });
dashboardChatDetailsOpen = false;
},
updateMessageLocalStatus: updateDashboardMessageLocalStatus,
});
function setDashboardChatThreadSettingsWithApi(threadId = dashboardChatTeamThreadId, patch = {}) {
return dashboardChatApiUiActions.setThreadSettingsWithApi(threadId, patch);
}
function readDashboardChatWidgetNotificationCursor() {
const parsed = readDashboardJson(dashboardChatWidgetNotificationCursorStorageKey, {});
if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
return { lastMessageId: "", seenAt: 0, userId: "", threadId: dashboardChatTeamThreadId, threads: {} };
}
const fallbackThreadId = normalizeDashboardChatThreadId(parsed.threadId, dashboardChatTeamThreadId);
const legacyCursor = {
lastMessageId: String(parsed.lastMessageId || "").trim(),
seenAt: Number.isFinite(Number(parsed.seenAt)) ? Number(parsed.seenAt) : 0,
userId: String(parsed.userId || "").trim(),
threadId: fallbackThreadId,
};
const rawThreads = parsed.threads && typeof parsed.threads === "object" && !Array.isArray(parsed.threads) ? parsed.threads : {};
const threads = Object.fromEntries(
Object.entries(rawThreads)
.map(([threadId, cursor]) => {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, "");
if (!normalizedThreadId || !cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
return null;
}
return [
normalizedThreadId,
{
lastMessageId: String(cursor.lastMessageId || "").trim(),
seenAt: Number.isFinite(Number(cursor.seenAt)) ? Number(cursor.seenAt) : 0,
userId: String(cursor.userId || "").trim(),
threadId: normalizedThreadId,
},
];
})
.filter(Boolean)
);
if (legacyCursor.lastMessageId && !threads[legacyCursor.threadId]) {
threads[legacyCursor.threadId] = legacyCursor;
}
return { ...legacyCursor, threads };
}
function writeDashboardChatWidgetNotificationCursor(nextCursor) {
const parsed = readDashboardJson(dashboardChatWidgetNotificationCursorStorageKey, {});
const previousThreads = parsed?.threads && typeof parsed.threads === "object" && !Array.isArray(parsed.threads) ? parsed.threads : {};
const threadId = normalizeDashboardChatThreadId(nextCursor?.threadId, dashboardChatTeamThreadId);
const cursor = {
lastMessageId: String(nextCursor?.lastMessageId || "").trim(),
seenAt: Number(nextCursor?.seenAt || 0) || 0,
userId: String(nextCursor?.userId || "").trim(),
threadId,
};
const threads = {
...previousThreads,
[threadId]: cursor,
};
const trimmedThreads = Object.fromEntries(
Object.entries(threads)
.sort(([, first], [, second]) => (Number(second?.seenAt || 0) || 0) - (Number(first?.seenAt || 0) || 0))
.slice(0, 100)
);
writeDashboardJson(dashboardChatWidgetNotificationCursorStorageKey, {
...cursor,
threads: trimmedThreads,
});
}
function getDashboardChatLatestNotificationMessageForThread(threadId, messages = readDashboardMessages()) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalizedThreadId) || null;
const apiLastMessage = apiThread?.lastMessage ? normalizeDashboardApiMessage(apiThread.lastMessage, apiThread) : null;
return (
[...messages].reverse().find((message) => message.threadId === normalizedThreadId) ||
apiLastMessage ||
(apiThread?.lastMessageId ? { id: apiThread.lastMessageId, userId: "", threadId: normalizedThreadId } : null)
);
}
function markDashboardChatWidgetNotificationSeenForThread(threadId, messages = readDashboardMessages()) {
const latestMessage = getDashboardChatLatestNotificationMessageForThread(threadId, messages);
if (!latestMessage?.id) {
return;
}
writeDashboardChatWidgetNotificationCursor({
lastMessageId: latestMessage.id,
seenAt: Date.now(),
userId: latestMessage.userId,
threadId: latestMessage.threadId,
});
}
function isDashboardDocumentActivelyViewed() { return document.visibilityState === "visible" && document.hasFocus(); }
function isDashboardChatThreadActivelyViewed(threadId = "") {
const state = readDashboardChatWidgetState();
const selectedThreadId = normalizeDashboardChatThreadId(state.selectedThreadId, dashboardChatTeamThreadId);
const targetThreadId = threadId ? normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId) : selectedThreadId;
return Boolean(state.isOpen && isDashboardDocumentActivelyViewed() && selectedThreadId === targetThreadId);
}
function normalizeDashboardMentionToken(value) {
return String(value || "")
.trim()
.toLowerCase()
.replace(/^@/, "")
.replace(/[^a-z0-9._-]/g, "");
}
function getDashboardMentionKeys(user = {}) {
const emailHandle = String(user.email || "").split("@", 1)[0];
const fullName = `${user.firstName || ""}.${user.lastName || ""}`;
return new Set(
[user.username, emailHandle, user.firstName, user.lastName, fullName, formatUserName(user).replace(/\s+/g, ".")]
.map(normalizeDashboardMentionToken)
.filter(Boolean)
);
}
function getDashboardMentionUserIdsForToken(token, users = getPlatformUsers(), authorUserId = "") {
const normalizedToken = normalizeDashboardMentionToken(token);
if (!normalizedToken) {
return [];
}
const activeUsers = users.filter((user) => user.status === "active" && user.id !== authorUserId);
if (["all", "team", "staff", "everyone"].includes(normalizedToken)) {
return activeUsers.map((user) => user.id);
}
return activeUsers
.filter((user) => getDashboardMentionKeys(user).has(normalizedToken))
.map((user) => user.id);
}
function getDashboardMentionUserIds(text, users = getPlatformUsers(), authorUserId = "") {
const matches = String(text || "").matchAll(/@([a-zA-Z0-9._-]{2,64})/g);
const mentionedUserIds = new Set();
for (const match of matches) {
getDashboardMentionUserIdsForToken(match[1], users, authorUserId).forEach((userId) => mentionedUserIds.add(userId));
}
return Array.from(mentionedUserIds);
}
const dashboardChatMessageTextRenderer = createDashboardChatMessageTextRenderer({
escapeHtml,
getMentionUserIdsForToken: getDashboardMentionUserIdsForToken,
});
function renderDashboardMessageText(message, users = getPlatformUsers(), options = {}) {
return dashboardChatMessageTextRenderer(message, users, options);
}
function canPinDashboardChatMessage(user = getCurrentPlatformUser()) {
const normalizedRole = normalizePlatformRole(user?.role, "");
return normalizedRole === "admin" || normalizedRole === "coach" || normalizedRole === "club-admin" || normalizedRole === "team-admin";
}
function normalizeDashboardChatPriority(value) {
const priority = String(value || "normal").trim().toLowerCase();
return dashboardChatPriorityKeys.has(priority) ? priority : "normal";
}
function normalizeDashboardReactions(reactions = {}) {
const normalized = {};
dashboardChatReactionOptions.forEach((option) => {
normalized[option.key] = Array.from(
new Set(
(Array.isArray(reactions?.[option.key]) ? reactions[option.key] : [])
.map((userId) => String(userId || "").trim())
.filter(Boolean)
)
);
});
return normalized;
}
function normalizeDashboardMessageAuthor(author = {}) {
const id = String(author?.id || "").trim();
if (!id) {
return null;
}
return {
id,
email: String(author?.email || "").toLowerCase(),
username: String(author?.username || "").trim(),
firstName: String(author?.firstName || author?.first_name || "").trim(),
lastName: String(author?.lastName || author?.last_name || "").trim(),
role: String(author?.role || "coach").trim().toLowerCase(),
title: String(author?.title || "").trim(),
department: String(author?.department || "").trim(),
team: String(author?.team || "").trim(),
status: String(author?.status || "active").trim().toLowerCase(),
profileImageUrl: String(author?.profileImageUrl || author?.profile_image_url || "").trim(),
};
}
function normalizeDashboardMessage(message) {
const currentUser = getCurrentPlatformUser();
const userId = message?.userId || message?.authorId || message?.senderId || currentUser?.id || "";
const text = String(message?.text ?? "").trim().slice(0, dashboardChatMaxMessageLength);
const id = String(message?.id || message?.messageId || "").trim() || createDashboardId("message");
const clientMessageId = String(
message?.clientMessageId ||
message?.client_message_id ||
message?.metadata?.clientMessageId ||
message?.metadata?.client_message_id ||
""
).trim();
const createdAt = String(message?.createdAt || message?.created_at || "").trim() || new Date().toISOString();
const readBy = Array.isArray(message?.readBy)
? message.readBy.map((userId) => String(userId ?? "").trim()).filter(Boolean)
: [];
const mentionedUserIds = Array.isArray(message?.mentionedUserIds)
? message.mentionedUserIds.map((userId) => String(userId || "").trim()).filter(Boolean)
: getDashboardMentionUserIds(text, getPlatformUsers(), userId);
return {
id,
clientMessageId,
userId,
threadId: normalizeDashboardChatThreadId(message?.threadId, dashboardChatTeamThreadId),
text,
createdAt,
deliveredAt: message?.deliveredAt || message?.createdAt || createdAt,
readBy: Array.from(new Set([userId, ...readBy].filter(Boolean))),
mentionedUserIds: Array.from(new Set(mentionedUserIds)),
reactions: normalizeDashboardReactions(message?.reactions),
replyToId: String(message?.replyToId || "").trim(),
priority: normalizeDashboardChatPriority(message?.priority),
pinnedAt: String(message?.pinnedAt || "").trim(),
pinnedBy: String(message?.pinnedBy || "").trim(),
author: normalizeDashboardMessageAuthor(message?.author || message?.user || null),
attachments: Array.isArray(message?.attachments) ? message.attachments : [],
status: String(message?.status || "sent").trim().toLowerCase(),
};
}
function getDashboardMessageCreatedAtMs(message = {}) {
const createdAtMs = Date.parse(message.createdAt || message.created_at || "");
if (Number.isFinite(createdAtMs)) {
return createdAtMs;
}
const deliveredAtMs = Date.parse(message.deliveredAt || message.delivered_at || "");
return Number.isFinite(deliveredAtMs) ? deliveredAtMs : 0;
}
function compareDashboardChatMessages(first = {}, second = {}) {
const firstTime = getDashboardMessageCreatedAtMs(first);
const secondTime = getDashboardMessageCreatedAtMs(second);
if (firstTime !== secondTime) {
return firstTime - secondTime;
}
const firstId = String(first.id || first.clientMessageId || "");
const secondId = String(second.id || second.clientMessageId || "");
return firstId.localeCompare(secondId, undefined, { sensitivity: "base" });
}
function getDashboardMessageIdentityKeys(message = {}) {
return Array.from(
new Set(
[
message.id,
message.messageId,
message.clientMessageId,
message.client_message_id,
message.metadata?.clientMessageId,
message.metadata?.client_message_id,
]
.map((value) => String(value || "").trim())
.filter(Boolean)
)
);
}
function isDashboardMessageRememberedDeleted(message = {}, deletedMessageIds = readDashboardDeletedMessageIds()) {
return getDashboardMessageIdentityKeys(message).some((id) => deletedMessageIds.has(id));
}
function mergeDashboardChatMessageRecords(existingMessage, incomingMessage) {
if (!existingMessage) {
return normalizeDashboardMessage(incomingMessage);
}
const existing = normalizeDashboardMessage(existingMessage);
const incoming = normalizeDashboardMessage(incomingMessage);
const incomingIsServerSettled = incoming.status !== "pending" && incoming.status !== "failed";
const existingIsLocalOnly = existing.status === "pending" || existing.status === "failed";
const preferIncoming = incomingIsServerSettled && (existingIsLocalOnly || getDashboardMessageCreatedAtMs(incoming) >= getDashboardMessageCreatedAtMs(existing));
const base = preferIncoming ? existing : incoming;
const overlay = preferIncoming ? incoming : existing;
const reactions = normalizeDashboardReactions({
...base.reactions,
...overlay.reactions,
});
dashboardChatReactionOptions.forEach((option) => {
reactions[option.key] = Array.from(new Set([...(base.reactions?.[option.key] || []), ...(overlay.reactions?.[option.key] || [])].filter(Boolean)));
});
return normalizeDashboardMessage({
...base,
...overlay,
id: overlay.id || base.id,
clientMessageId: overlay.clientMessageId || base.clientMessageId,
readBy: Array.from(new Set([...(base.readBy || []), ...(overlay.readBy || [])].filter(Boolean))),
mentionedUserIds: Array.from(new Set([...(base.mentionedUserIds || []), ...(overlay.mentionedUserIds || [])].filter(Boolean))),
reactions,
attachments: overlay.attachments?.length ? overlay.attachments : base.attachments,
author: overlay.author || base.author,
status: incomingIsServerSettled ? incoming.status : overlay.status || base.status,
});
}
function setDashboardMessageInIdentityMap(messageMap, message) {
const normalizedMessage = normalizeDashboardMessage(message);
const identityKeys = getDashboardMessageIdentityKeys(normalizedMessage);
const existingKey = identityKeys.find((key) => messageMap.has(key));
const existingMessage = existingKey ? messageMap.get(existingKey) : null;
const nextMessage = mergeDashboardChatMessageRecords(existingMessage, normalizedMessage);
if (existingMessage) {
getDashboardMessageIdentityKeys(existingMessage).forEach((key) => messageMap.delete(key));
}
getDashboardMessageIdentityKeys(nextMessage).forEach((key) => messageMap.set(key, nextMessage));
}
function getDashboardMessagesFromIdentityMap(messageMap) { return Array.from(new Set(messageMap.values())).sort(compareDashboardChatMessages); }
function normalizeDashboardMessageCollection(messages = [], options = {}) {
const deletedMessageIds = options.deletedMessageIds || readDashboardDeletedMessageIds();
const messageMap = new Map();
(Array.isArray(messages) ? messages : []).forEach((sourceMessage) => {
const message = normalizeDashboardMessage(sourceMessage);
if (!message.text || !message.userId || isDashboardMessageRememberedDeleted(message, deletedMessageIds)) {
return;
}
setDashboardMessageInIdentityMap(messageMap, message);
});
return getDashboardMessagesFromIdentityMap(messageMap);
}
function readDashboardDeletedMessageIds() {
const parsed = readDashboardJson(dashboardChatDeletedMessageIdsStorageKey, []);
return new Set(Array.isArray(parsed) ? parsed.map((id) => String(id || "").trim()).filter(Boolean) : []);
}
function rememberDashboardDeletedMessageId(messageId) {
const normalizedMessageId = String(messageId || "").trim();
if (!normalizedMessageId) {
return;
}
const nextIds = [normalizedMessageId, ...Array.from(readDashboardDeletedMessageIds()).filter((id) => id !== normalizedMessageId)].slice(0, 500);
writeDashboardJson(dashboardChatDeletedMessageIdsStorageKey, nextIds);
purgeDashboardDeletedMessagesFromStorage();
}
function purgeDashboardDeletedMessagesFromStorage(options = {}) {
const deletedMessageIds = readDashboardDeletedMessageIds();
if (!deletedMessageIds.size) {
return;
}
if (!dashboardChatRuntimeMessages.length) {
return;
}
const nextMessages = dashboardChatRuntimeMessages.filter((message) => {
const sourceId = String(message?.id || message?.messageId || "").trim();
const normalizedId = normalizeDashboardMessage(message).id;
return !deletedMessageIds.has(sourceId) && !deletedMessageIds.has(normalizedId) && !isDashboardMessageRememberedDeleted(message, deletedMessageIds);
});
if (nextMessages.length === dashboardChatRuntimeMessages.length) {
return;
}
writeDashboardMessages(nextMessages, {
skipCentralSync: Boolean(options.skipCentralSync),
});
}
function readDashboardMessages() {
if (!dashboardChatRuntimeMessages.length) {
const parsed = readDashboardJson(dashboardChatStorageKey, []);
dashboardChatRuntimeMessages = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.messages) ? parsed.messages : [];
}
const deletedMessageIds = readDashboardDeletedMessageIds();
return normalizeDashboardMessageCollection(dashboardChatRuntimeMessages, { deletedMessageIds });
}
function writeDashboardMessages(messages, options = {}) {
const deletedMessageIds = readDashboardDeletedMessageIds();
const normalizedMessages = normalizeDashboardMessageCollection(messages, { deletedMessageIds });
const recentMessages = normalizedMessages.slice(-80);
const pinnedMessages = normalizedMessages
.filter((message) => message.pinnedAt && !recentMessages.some((recentMessage) => recentMessage.id === message.id))
.slice(-20);
const nextMessages = normalizeDashboardMessageCollection([...pinnedMessages, ...recentMessages], { deletedMessageIds });
dashboardChatRuntimeMessages = nextMessages;
centralStateWriteSuppressionKeys.add(dashboardChatStorageKey);
try { writeDashboardJson(dashboardChatStorageKey, nextMessages); } finally { centralStateWriteSuppressionKeys.delete(dashboardChatStorageKey); }
}
function getDashboardChatThreadTypeForApi(threadId) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
if (normalizedThreadId === dashboardChatTeamThreadId) {
return "team";
}
if (normalizedThreadId.startsWith("group-") || normalizedThreadId.startsWith("group:")) {
return "group";
}
const template = dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.key === normalizedThreadId);
return template?.type || "dm";
}
function getDashboardChatParticipantIdsForApi(threadId) {
return getDashboardChatThreadParticipants(threadId)
.map((user) => user?.id)
.filter(Boolean);
}
async function getDashboardChatApiAccessToken() {
if (win.platformAuthReadyPromise instanceof Promise) {
try {
await win.platformAuthReadyPromise;
} catch {
}
}
const authStore = getPlatformAuthStore();
if (typeof authStore?.getAccessToken !== "function") {
return "";
}
try {
return String((await authStore.getAccessToken()) || "").trim();
} catch {
return "";
}
}
async function sendDashboardChatApiAction(payload = {}) {
let token = "";
try {
token = await withUiTimeout(
getDashboardChatApiAccessToken(),
8000,
"Chat session check took too long. Try again."
);
} catch (error) {
return {
ok: false,
status: 0,
reason: error?.message || "Chat session check took too long. Try again.",
retryable: true,
};
}
if (!token) {
return { ok: false, status: 401, reason: "Chat API requires an authenticated session." };
}
const controller = typeof AbortController === "function" ? new AbortController() : null;
let timeoutId = 0;
try {
if (controller) {
timeoutId = win.setTimeout(() => controller.abort(), 15000);
}
const response = await fetch("/api/chat", {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${token}`,
},
body: JSON.stringify(payload),
signal: controller?.signal,
});
const responseText = await response.text();
let result = {};
if (responseText) {
try {
result = JSON.parse(responseText);
} catch {
result = { reason: responseText.slice(0, 240) };
}
}
if (!response.ok || result?.ok === false) {
return {
ok: false,
status: response.status,
reason: result?.reason || result?.message || `Chat API failed (${response.status}).`,
retryable: response.status >= 500,
};
}
return { ok: true, status: response.status, result };
} catch (error) {
const timedOut = error?.name === "AbortError";
return {
ok: false,
status: 0,
reason: timedOut ? "Chat API timed out. Try again." : error?.message || "Chat API could not be reached.",
retryable: true,
};
} finally {
if (timeoutId) {
win.clearTimeout(timeoutId);
}
}
}
async function fetchDashboardChatApi(query = {}) {
const token = await getDashboardChatApiAccessToken();
if (!token) {
return { ok: false, status: 401, reason: "Chat API requires an authenticated session." };
}
const params = new URLSearchParams();
Object.entries(query).forEach(([key, value]) => {
if (value !== undefined && value !== null && String(value).trim()) {
params.set(key, String(value));
}
});
try {
const response = await fetch(`/api/chat${params.toString() ? `?${params.toString()}` : ""}`, {
method: "GET",
headers: {
Authorization: `Bearer ${token}`,
},
cache: "no-store",
});
const responseText = await response.text();
let result = {};
if (responseText) {
try {
result = JSON.parse(responseText);
} catch {
result = { reason: responseText.slice(0, 240) };
}
}
if (!response.ok || result?.ok === false) {
return {
ok: false,
status: response.status,
reason: result?.reason || result?.message || `Chat API failed (${response.status}).`,
};
}
return { ok: true, status: response.status, result };
} catch (error) {
return { ok: false, status: 0, reason: error?.message || "Chat API could not be reached." };
}
}
function canFallbackDashboardChatApiResult(result = {}) {
if (result.retryable) {
return true;
}
const host = win.location?.hostname || "";
const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
const isDevAuth = Boolean(getPlatformAuthStore()?.isDevMode?.());
return Boolean(isLocalHost && isDevAuth && result.status === 401);
}
function logDashboardChatApiFailure(action, result = {}) {
console.warn(`Chat action ${action} was not saved through /api/chat.`, result.reason || result.status || result);
}
function normalizeDashboardApiParticipant(participant = {}) {
if (participant && typeof participant === "object" && !Array.isArray(participant)) {
const userId = String(participant.userId || participant.user_id || participant.id || "").trim();
return {
id: userId,
userId,
participantRole: String(participant.participantRole || participant.participant_role || participant.role || "member").trim().toLowerCase() || "member",
role: String(participant.participantRole || participant.participant_role || participant.role || "member").trim().toLowerCase() || "member",
joinedAt: String(participant.joinedAt || participant.joined_at || "").trim(),
leftAt: String(participant.leftAt || participant.left_at || "").trim(),
lastReadAt: String(participant.lastReadAt || participant.last_read_at || "").trim(),
lastReadMessageId: String(participant.lastReadMessageId || participant.last_read_message_id || "").trim(),
};
}
const userId = String(participant || "").trim();
return userId ? { id: userId, userId, participantRole: "member", role: "member", joinedAt: "", leftAt: "", lastReadAt: "", lastReadMessageId: "" } : null;
}
function normalizeDashboardApiThread(thread = {}) {
const type = String(thread.type || "team").trim().toLowerCase();
const legacyThreadId = String(thread.metadata?.legacyThreadId || thread.legacyThreadId || "").trim();
const messageCount = Number(thread.message_count || thread.messageCount || 0) || 0;
const lastMessage = thread.lastMessage || thread.last_message || null;
const lastMessageId = String(thread.lastMessageId || thread.last_message_id || lastMessage?.id || lastMessage?.messageId || "").trim();
const templateByLegacyId = legacyThreadId
? dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.key === legacyThreadId)
: null;
const templateByManagedType = ["medical", "matchday", "training", "announcement"].includes(type)
? dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.type === type)
: null;
const template = templateByLegacyId || templateByManagedType;
const resolvedLegacyThreadId = legacyThreadId || template?.key || "";
return {
threadId: normalizeDashboardChatThreadId(resolvedLegacyThreadId || (type === "team" ? dashboardChatTeamThreadId : thread.id), dashboardChatTeamThreadId),
databaseThreadId: String(thread.id || "").trim(),
type,
title: String(thread.title || thread.name || template?.title || (type === "team" ? getDashboardChatTeamChatTitle() : "Chat")).trim(),
visibility: String(thread.visibility || "members").trim(),
createdAt: String(thread.created_at || thread.createdAt || "").trim(),
avatarUrl: String(thread.avatarUrl || thread.avatar_url || thread.metadata?.avatarUrl || thread.metadata?.imageUrl || "").trim(),
lastMessageAt: String(messageCount || lastMessage ? thread.last_message_at || thread.lastMessageAt || "" : "").trim(),
messageCount,
unreadCount: Number(thread.unreadCount || thread.unread_count || 0) || 0,
lastReadAt: String(thread.lastReadAt || thread.last_read_at || "").trim(),
lastMessage,
lastMessageId,
lastMessagePreview: String(thread.lastMessagePreview || thread.last_message_preview || "").trim(),
participants: Array.isArray(thread.participants) ? thread.participants.map(normalizeDashboardApiParticipant).filter(Boolean) : [],
permissions: thread.permissions && typeof thread.permissions === "object" ? thread.permissions : {},
settings: dashboardChatThreadSettings.normalize(thread.settings || thread.threadSettings || {}),
metadata: thread.metadata || {},
};
}
function normalizeDashboardApiMessage(message = {}, thread = null) {
const apiThread = thread ? normalizeDashboardApiThread(thread) : null;
const threadId = normalizeDashboardChatThreadId(
message.legacyThreadId || message.threadId || message.thread_id || apiThread?.threadId || dashboardChatTeamThreadId,
dashboardChatTeamThreadId
);
const author = message.author || message.user || null;
const authorId = message.userId || message.author_id || message.authorId || "";
return normalizeDashboardMessage({
id: message.id || message.messageId,
clientMessageId: message.clientMessageId || message.client_message_id || message.metadata?.clientMessageId || message.metadata?.client_message_id || "",
threadId,
text: message.text ?? message.body ?? "",
userId: authorId,
createdAt: message.createdAt || message.created_at,
deliveredAt: message.deliveredAt || message.createdAt || message.created_at,
readBy: Array.isArray(message.readBy) ? message.readBy : [],
mentionedUserIds: Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : [],
reactions: message.reactions || {},
replyToId: message.replyToId || message.reply_to_id || "",
priority: message.priority,
pinnedAt: message.pinnedAt || message.pinned_at || "",
pinnedBy: message.pinnedBy || message.pinned_by || "",
author,
attachments: Array.isArray(message.attachments) ? message.attachments : [],
status: message.status || (message.deleted_at || message.deletedAt ? "deleted" : "sent"),
});
}
function mergeDashboardChatApiMessages(messages = [], options = {}) {
if (!Array.isArray(messages)) {
return readDashboardMessages();
}
const replaceThreadId = options.replaceThreadId ? normalizeDashboardChatThreadId(options.replaceThreadId, "") : "";
const messageThread = options.thread || null;
const existingMessages = readDashboardMessages();
const existingThreadMessages = replaceThreadId ? existingMessages.filter((message) => message.threadId === replaceThreadId) : [];
const keepThread = Boolean(options.keepThread);
const incomingApiMessages = messages.map((sourceMessage) => ({
sourceMessage,
message: normalizeDashboardApiMessage(sourceMessage, messageThread),
sourceMessageId: String(sourceMessage?.id || sourceMessage?.messageId || "").trim(),
clientMessageId: String(sourceMessage?.clientMessageId || sourceMessage?.client_message_id || sourceMessage?.metadata?.clientMessageId || sourceMessage?.metadata?.client_message_id || "").trim(),
deletedAt: String(sourceMessage?.deletedAt || sourceMessage?.deleted_at || "").trim(),
}));
const incomingIdentityKeys = new Set();
let incomingMaxCreatedAtMs = 0;
incomingApiMessages.forEach(({ message, sourceMessageId, clientMessageId }) => {
[sourceMessageId, clientMessageId, ...getDashboardMessageIdentityKeys(message)].filter(Boolean).forEach((key) => incomingIdentityKeys.add(key));
incomingMaxCreatedAtMs = Math.max(incomingMaxCreatedAtMs, getDashboardMessageCreatedAtMs(message));
});
const recentLocalMessageCutoff = Date.now() - 5 * 60 * 1000;
const shouldKeepExistingThreadMessage = (message) => {
if (!replaceThreadId || message.threadId !== replaceThreadId) {
return true;
}
if (message.status === "pending" || message.status === "failed") {
return true;
}
if (getDashboardMessageIdentityKeys(message).some((key) => incomingIdentityKeys.has(key))) {
return false;
}
const createdAtMs = getDashboardMessageCreatedAtMs(message);
return Boolean(createdAtMs && (createdAtMs >= incomingMaxCreatedAtMs || createdAtMs >= recentLocalMessageCutoff));
};
const current = replaceThreadId && !keepThread
? existingMessages.filter(shouldKeepExistingThreadMessage)
: existingMessages;
if (!messages.length) {
if (replaceThreadId) {
const hasRecentLocalThreadMessages = existingThreadMessages.some((message) => {
const createdAtMs = getDashboardMessageCreatedAtMs(message);
return message.status === "pending" || message.status === "failed" || (Number.isFinite(createdAtMs) && createdAtMs >= recentLocalMessageCutoff);
});
const threadStillHasServerActivity = [
messageThread?.lastMessage,
messageThread?.last_message,
messageThread?.last_message_id,
messageThread?.lastMessageAt,
messageThread?.last_message_at,
Number(messageThread?.messageCount || messageThread?.message_count || 0) > 0,
].some(Boolean);
if (hasRecentLocalThreadMessages || threadStillHasServerActivity) {
return existingMessages;
}
writeDashboardMessages(current, { skipCentralSync: true });
if (options.render !== false) {
renderDashboardChatWidget();
}
}
return current;
}
const byId = new Map();
current.forEach((message) => {
if (message.text && message.userId) {
setDashboardMessageInIdentityMap(byId, message);
}
});
const deletedMessageIds = readDashboardDeletedMessageIds();
incomingApiMessages.forEach(({ sourceMessageId, clientMessageId, deletedAt, message }) => {
if (sourceMessageId && deletedAt) {
rememberDashboardDeletedMessageId(sourceMessageId);
deletedMessageIds.add(sourceMessageId);
byId.delete(sourceMessageId);
if (clientMessageId) {
rememberDashboardDeletedMessageId(clientMessageId);
deletedMessageIds.add(clientMessageId);
byId.delete(clientMessageId);
}
return;
}
const existingMessage = getDashboardMessageIdentityKeys({ ...message, clientMessageId }).map((key) => byId.get(key)).find(Boolean) || null;
const readBy = existingMessage ? Array.from(new Set([...(existingMessage.readBy || []), ...(message.readBy || [])].filter(Boolean))) : message.readBy;
const resolvedMessage = normalizeDashboardMessage({
...message,
clientMessageId: message.clientMessageId || clientMessageId,
threadId: replaceThreadId && message?.threadId !== replaceThreadId ? replaceThreadId : message.threadId,
readBy,
});
if (resolvedMessage?.text && resolvedMessage.userId && !isDashboardMessageRememberedDeleted(resolvedMessage, deletedMessageIds)) {
setDashboardMessageInIdentityMap(byId, resolvedMessage);
}
});
const mergedMessages = getDashboardMessagesFromIdentityMap(byId);
writeDashboardMessages(mergedMessages, { skipCentralSync: true });
if (options.render !== false) {
renderDashboardChatWidget();
}
return mergedMessages;
}
function updateDashboardChatApiThreads(threads = []) {
if (!Array.isArray(threads)) {
return;
}
const byId = new Map(dashboardChatApiThreads.map((thread) => [thread.threadId, thread]));
threads.map(normalizeDashboardApiThread).forEach((thread) => {
if (thread.threadId) {
byId.set(thread.threadId, thread);
}
});
dashboardChatApiThreads = Array.from(byId.values());
}
function applyDashboardChatApiPayload(payload = {}, options = {}) {
if (payload.scope) {
dashboardChatApiScope = payload.scope;
setupDashboardChatRealtime();
}
if (payload.health) {
dashboardChatModerationState = {
...dashboardChatModerationState,
health: payload.health,
audits: Array.isArray(payload.audits) ? payload.audits : dashboardChatModerationState.audits,
};
}
if (Array.isArray(payload.threads)) {
updateDashboardChatApiThreads(payload.threads);
} else if (payload.thread) {
updateDashboardChatApiThreads([payload.thread]);
}
if (payload.nextCursor !== undefined) {
const threadId = normalizeDashboardChatThreadId(
options.threadId || payload.thread?.threadId || payload.thread?.legacyThreadId || payload.thread?.metadata?.legacyThreadId || dashboardChatTeamThreadId,
dashboardChatTeamThreadId
);
dashboardChatApiPagination[threadId] = String(payload.nextCursor || "");
}
if (Array.isArray(payload.messages)) {
mergeDashboardChatApiMessages(payload.messages, {
render: false,
thread: payload.thread || null,
keepThread: Boolean(payload.nextCursor),
replaceThreadId: options.replaceThread
? options.threadId || payload.thread?.threadId || payload.thread?.legacyThreadId || payload.thread?.metadata?.legacyThreadId
: "",
});
}
if (payload.message) {
mergeDashboardChatApiMessages([payload.message], {
render: false,
thread: payload.thread || null,
});
}
}
async function refreshDashboardChatThreadSummariesFromApi(options = {}) {
const result = await fetchDashboardChatApi({ view: "threads", limit: options.limit || 80 });
if (!result.ok) {
if (!canFallbackDashboardChatApiResult(result)) {
logDashboardChatApiFailure("threads", result);
}
return result;
}
applyDashboardChatApiPayload(result.result || {});
syncDashboardChatWidgetNotificationCursor();
if (options.render !== false) {
renderDashboardChatWidget();
}
return result;
}
function queueDashboardChatThreadSummaryRefresh(options = {}) {
if (dashboardChatThreadSummarySyncTimer) {
win.clearTimeout(dashboardChatThreadSummarySyncTimer);
}
dashboardChatThreadSummarySyncTimer = win.setTimeout(() => {
dashboardChatThreadSummarySyncTimer = 0;
dashboardChatThreadSummaryLastRequestedAt = Date.now();
void refreshDashboardChatThreadSummariesFromApi(options);
}, Number(options.delayMs ?? 200));
}
function queueDashboardChatCurrentViewRefresh(options = {}) {
queueDashboardChatThreadSummaryRefresh({ delayMs: Number(options.delayMs ?? 120), render: false });
const state = readDashboardChatWidgetState();
if (state.isOpen) {
queueDashboardChatApiRefresh({
threadId: state.selectedThreadId,
delayMs: Number(options.delayMs ?? 120) + 40,
});
}
}
async function refreshDashboardChatFromApi(options = {}) {
const threadId = normalizeDashboardChatThreadId(options.threadId || readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
const query = {
threadId,
threadType: getDashboardChatThreadTypeForApi(threadId),
limit: options.limit || dashboardChatApiPageLimit,
};
if (options.cursor) {
query.cursor = options.cursor;
}
if (options.search) {
query.search = options.search;
delete query.threadId;
}
const result = await fetchDashboardChatApi(query);
if (!result.ok) {
dashboardChatHydratedThreadIds.delete(threadId);
if (!canFallbackDashboardChatApiResult(result)) {
logDashboardChatApiFailure("load", result);
}
return result;
}
dashboardChatHydratedThreadIds.add(threadId);
applyDashboardChatApiPayload(result.result, {
threadId,
replaceThread: !options.cursor && !options.search,
});
renderDashboardChatWidget();
return result;
}
function queueDashboardChatApiRefresh(options = {}) {
if (dashboardChatApiSyncTimer) {
win.clearTimeout(dashboardChatApiSyncTimer);
}
dashboardChatApiSyncTimer = win.setTimeout(() => {
dashboardChatApiSyncTimer = 0;
void refreshDashboardChatFromApi(options);
}, Number(options.delayMs ?? 160));
}
let dashboardChatPageScroll = false;
async function loadOlderDashboardChatMessagesWithApi(threadId) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
const cursor = dashboardChatApiPagination[normalizedThreadId];
if (!cursor) {
return null;
}
dashboardChatPageScroll = true;
return refreshDashboardChatFromApi({ threadId: normalizedThreadId, cursor });
}
async function loadDashboardChatModerationFromApi() {
if (!isCurrentPlatformUserAdmin()) {
return null;
}
dashboardChatModerationState = { ...dashboardChatModerationState, loading: true, error: "" };
renderDashboardChatWidget();
const moderationQuery = {
view: "moderation",
limit: 80,
action: dashboardChatModerationFilters.action || "all",
userId: dashboardChatModerationFilters.userId || "",
thread: dashboardChatModerationFilters.threadId || "",
from: dashboardChatModerationFilters.from || "",
to: dashboardChatModerationFilters.to || "",
};
const result = await fetchDashboardChatApi(moderationQuery);
const healthResult = await fetchDashboardChatApi({ view: "health", limit: 8 });
if (!result.ok) {
dashboardChatModerationState = { ...dashboardChatModerationState, loading: false, error: result.reason || "Could not load moderation." };
renderDashboardChatWidget();
return result;
}
dashboardChatModerationState = {
loading: false,
audits: Array.isArray(result.result.audits) ? result.result.audits : [],
failedUploads: Array.isArray(result.result.failedUploads) ? result.result.failedUploads : [],
retentionPolicy: result.result.retentionPolicy || null,
health: healthResult.ok ? healthResult.result.health || null : dashboardChatModerationState.health,
filters: result.result.filters || dashboardChatModerationFilters,
error: "",
};
if (healthResult.ok && Array.isArray(healthResult.result.audits) && !dashboardChatModerationState.audits.length) {
dashboardChatModerationState.audits = healthResult.result.audits;
}
if (result.result.scope) {
dashboardChatApiScope = result.result.scope;
}
renderDashboardChatWidget();
return result;
}
function getDashboardSupabaseClient() {
const authStore = getPlatformAuthStore?.();
return authStore?.getSupabaseClient?.() || authStore?.supabase || null;
}
function getDashboardAttachmentStorageRef(attachment = {}) {
const bucket = String(attachment.bucket || attachment.storage_bucket || "").trim();
const path = String(attachment.path || attachment.storage_path || "").trim();
return bucket && path ? { bucket, path } : null;
}
function setDashboardChatAttachmentDraft(next) { dashboardChatComposerAttachmentDraft = next; renderDashboardChatWidget(); focusDashboardChatWidgetComposer(); }
async function uploadDashboardChatAttachmentFile(file, attachment = {}) {
return uploadDashboardChatAttachmentFileWithClient(file, attachment, getDashboardSupabaseClient(), getDashboardChatApiAccessToken);
}
async function createDashboardChatAttachmentIntent(file, threadId = dashboardChatTeamThreadId) {
if (!file) return null;
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
const fileMetadata = { fileName: file.name || "Attachment", byteSize: file.size || 0, mimeType: file.type || "application/octet-stream" };
setDashboardChatAttachmentDraft({ id: createDashboardId("attachment"), status: "uploading", metadata: fileMetadata });
const result = await sendDashboardChatApiAction({
action: "createAttachmentIntent",
threadId: normalizedThreadId,
threadType: getDashboardChatThreadTypeForApi(normalizedThreadId),
threadTitle: getDashboardChatThreadLabel(normalizedThreadId, getCurrentPlatformUser()),
participantIds: getDashboardChatParticipantIdsForApi(normalizedThreadId),
fileName: file.name,
mimeType: file.type || "application/octet-stream",
byteSize: file.size || 0,
});
if (!result.ok) {
logDashboardChatApiFailure("createAttachmentIntent", result);
showDashboardChatWidgetToast(result.reason || "Attach failed.", normalizedThreadId);
setDashboardChatAttachmentDraft({ ...dashboardChatComposerAttachmentDraft, status: "failed", error: result.reason || "Attach failed." });
return null;
}
const uploadIntent = result.result?.upload || null;
const attachment = result.result?.attachment ? { ...result.result.attachment, upload: uploadIntent, token: uploadIntent?.token || "" } : null;
const upload = await uploadDashboardChatAttachmentFile(file, attachment);
if (!upload.ok) {
logDashboardChatApiFailure("uploadAttachment", upload);
showDashboardChatWidgetToast(upload.reason || "Upload failed.", normalizedThreadId);
setDashboardChatAttachmentDraft({ ...(attachment || dashboardChatComposerAttachmentDraft || {}), status: "failed", error: upload.reason || "Upload failed.", metadata: { ...(dashboardChatComposerAttachmentDraft?.metadata || {}), ...(attachment?.metadata || {}) } });
return null;
}
setDashboardChatAttachmentDraft(attachment ? { ...attachment, status: "uploaded", metadata: { ...(attachment.metadata || {}), uploadReady: true } } : null);
return dashboardChatComposerAttachmentDraft;
}
async function handleDashboardChatAttachmentInputChange(attachmentInput) {
if (!attachmentInput || attachmentInput.dataset.busy === "true") return;
const file = attachmentInput.files?.[0] || null;
if (!file) return;
attachmentInput.dataset.busy = "true";
try {
const currentState = readDashboardChatWidgetState();
const threadId = normalizeDashboardChatThreadId(currentState.selectedThreadId, dashboardChatTeamThreadId);
await createDashboardChatAttachmentIntent(file, threadId);
} catch (error) {
setDashboardChatAttachmentDraft({ id: createDashboardId("attachment"), status: "failed", error: error?.message || "Upload failed.", metadata: { fileName: file.name || "Attachment", byteSize: file.size || 0, mimeType: file.type || "application/octet-stream" } });
showDashboardChatWidgetToast(dashboardChatComposerAttachmentDraft.error, getDashboardChatActiveToastThreadId());
} finally {
attachmentInput.value = "";
delete attachmentInput.dataset.busy;
}
}
async function createDashboardAdvancedChatThread(templateKey) {
const template = dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.key === templateKey);
if (!template) {
return null;
}
const legacyThreadId = template.key;
const result = await sendDashboardChatApiAction({
action: "createThread",
threadId: legacyThreadId,
type: template.type,
title: template.title,
visibility: template.visibility,
participantIds: getDashboardChatParticipantIdsForApi(legacyThreadId),
});
if (!result.ok) {
logDashboardChatApiFailure("createThread", result);
return null;
}
applyDashboardChatApiPayload(result.result || {}, { threadId: legacyThreadId });
dashboardChatMessageSearchQuery = "";
dashboardChatGroupCreatorOpen = false;
writeDashboardChatWidgetState({
isOpen: true,
selectedThreadId: legacyThreadId,
});
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
return result.result?.thread || null;
}
function setDashboardChatGroupCreateError(form, message = "") {
const errorElement = form?.querySelector("[data-dashboard-chat-group-create-error]");
if (!errorElement) {
return;
}
const normalizedMessage = String(message || "").trim();
errorElement.textContent = normalizedMessage;
errorElement.hidden = !normalizedMessage;
}
async function createDashboardCustomGroupThreadFromForm(form) {
if (!form || form.dataset.busy === "true") return null;
const currentUser = getCurrentPlatformUser();
const formData = new FormData(form);
const title = String(formData.get("title") || "").trim().slice(0, 80);
setDashboardChatGroupCreateError(form, "");
const selectedParticipantInputs = Array.from(form.querySelectorAll("input[name='participantIds']:checked"));
const selectedParticipants = selectedParticipantInputs
.map((input) => ({
id: String(input.value || "").trim(),
email: String(input.dataset.dashboardChatGroupParticipantEmail || "").trim().toLowerCase(),
username: String(input.dataset.dashboardChatGroupParticipantUsername || "").trim(),
name: String(input.dataset.dashboardChatGroupParticipantName || "").trim(),
}))
.filter((participant) => participant.id || participant.email || participant.username);
const selectedParticipantIds = Array.from(new Set(
selectedParticipants.map((participant) => participant.id).filter(Boolean)
));
if (!currentUser?.id) {
setDashboardChatGroupCreateError(form, "Sign in before creating a group.");
showDashboardChatWidgetToast("Sign in before creating a group.", getDashboardChatActiveToastThreadId());
return null;
}
if (!title) {
setDashboardChatGroupCreateError(form, "Add a group name.");
showDashboardChatWidgetToast("Add a group name.", getDashboardChatActiveToastThreadId());
return null;
}
if (!selectedParticipants.length) {
setDashboardChatGroupCreateError(form, "Choose at least one teammate.");
showDashboardChatWidgetToast("Choose at least one teammate.", getDashboardChatActiveToastThreadId());
return null;
}
const legacyThreadId = createDashboardId("group");
const participantIds = Array.from(new Set([currentUser.id, ...selectedParticipantIds].filter(Boolean)));
const submitButton = form.querySelector("button[type='submit']");
form.dataset.busy = "true";
if (submitButton) {
submitButton.disabled = true;
submitButton.textContent = "Creating...";
}
try {
const result = await sendDashboardChatApiAction({
action: "createThread",
threadId: legacyThreadId,
type: "group",
title,
visibility: "members",
participantIds,
participants: [
{ id: currentUser.id, email: currentUser.email || "", username: currentUser.username || "", name: formatUserName(currentUser) },
...selectedParticipants,
],
});
if (!result.ok) {
logDashboardChatApiFailure("createGroupThread", result);
setDashboardChatGroupCreateError(form, result.reason || "Could not create group.");
showDashboardChatWidgetToast(result.reason || "Could not create group.", getDashboardChatActiveToastThreadId());
return null;
}
applyDashboardChatApiPayload(result.result || {}, { threadId: legacyThreadId });
const createdThreadId = normalizeDashboardChatThreadId(result.result?.thread?.threadId || result.result?.thread?.legacyThreadId || legacyThreadId, legacyThreadId);
dashboardChatMessageSearchQuery = "";
writeDashboardChatWidgetState({
isOpen: true,
selectedThreadId: createdThreadId,
});
dashboardChatGroupCreatorOpen = false;
form.reset();
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
showDashboardChatWidgetToast("Group created.", createdThreadId);
queueDashboardChatThreadSummaryRefresh({ delayMs: 0, render: true });
return result.result?.thread || null;
} catch (error) {
logDashboardChatApiFailure("createGroupThread", {
ok: false,
status: 0,
reason: error?.message || "Could not create group.",
retryable: true,
});
setDashboardChatGroupCreateError(form, error?.message || "Could not create group.");
showDashboardChatWidgetToast(error?.message || "Could not create group.", getDashboardChatActiveToastThreadId());
return null;
} finally {
delete form.dataset.busy;
if (submitButton) {
submitButton.disabled = false;
submitButton.textContent = "Create group";
}
}
}
function handleDashboardChatRealtimeMessageChange(change = {}) {
dashboardChatApiRealtimeLastEventAt = Date.now();
const eventType = String(change.eventType || change.type || "").toUpperCase();
const record = change.new || change.old || {};
const messageId = String(record?.id || record?.messageId || "").trim();
const deletedAt = String(record?.deleted_at || record?.deletedAt || "").trim();
if (messageId && (deletedAt || eventType === "DELETE")) {
removeDashboardMessage(messageId);
renderDashboardChatWidget();
syncDashboardChatWidgetNotificationCursor();
platformNavigationController.renderTopIconMenu();
}
queueDashboardChatApiRefresh({ delayMs: 250 });
queueDashboardChatThreadSummaryRefresh({ delayMs: 350 });
}
function handleDashboardChatRealtimeRelatedChange(change = {}) {
dashboardChatApiRealtimeLastEventAt = Date.now();
const record = change.new || change.old || {};
const databaseThreadId = String(record.thread_id || record.id || "").trim();
const activeState = readDashboardChatWidgetState();
const matchingThread = dashboardChatApiThreads.find((thread) => thread.databaseThreadId === databaseThreadId) || null;
const refreshThreadId = matchingThread?.threadId || activeState.selectedThreadId || dashboardChatTeamThreadId;
queueDashboardChatThreadSummaryRefresh({ delayMs: 180 });
if (activeState.isOpen) {
queueDashboardChatApiRefresh({ threadId: refreshThreadId, delayMs: 220 });
}
}
function handleDashboardChatRealtimeStatus(status = "") {
dashboardChatApiRealtimeStatus = String(status || "unknown");
renderDashboardChatWidget();
if (dashboardChatApiRealtimeRecoveryTimer) {
win.clearTimeout(dashboardChatApiRealtimeRecoveryTimer);
dashboardChatApiRealtimeRecoveryTimer = 0;
}
if (dashboardChatApiRealtimeStatus === "SUBSCRIBED") {
queueDashboardChatCurrentViewRefresh({ delayMs: 250 });
return;
}
dashboardChatApiRealtimeRecoveryTimer = win.setTimeout(() => {
dashboardChatApiRealtimeRecoveryTimer = 0;
queueDashboardChatCurrentViewRefresh({ delayMs: 0 });
}, 1200);
}
function setupDashboardChatRealtime() {
const authStore = getPlatformAuthStore();
const supabaseClient = typeof authStore?.getSupabaseClient === "function" ? authStore.getSupabaseClient() : null;
const scope = dashboardChatApiScope;
if (!supabaseClient?.channel || !scope?.organizationId) {
return;
}
const signature = `${scope.organizationId || ""}:${scope.teamId || ""}`;
if (dashboardChatApiRealtimeSignature === signature && dashboardChatApiRealtimeChannel) {
return;
}
if (dashboardChatApiRealtimeChannel && typeof supabaseClient.removeChannel === "function") {
supabaseClient.removeChannel(dashboardChatApiRealtimeChannel);
}
dashboardChatApiRealtimeSignature = signature;
const realtimeScopeFilter = `organization_id=eq.${scope.organizationId}`;
dashboardChatApiRealtimeChannel = supabaseClient
.channel(`chat:${signature}`)
.on("postgres_changes", { event: "*", schema: "public", table: "chat_threads", filter: realtimeScopeFilter }, handleDashboardChatRealtimeRelatedChange)
.on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: realtimeScopeFilter }, handleDashboardChatRealtimeMessageChange)
.on("postgres_changes", { event: "*", schema: "public", table: "chat_attachments", filter: realtimeScopeFilter }, handleDashboardChatRealtimeRelatedChange)
.on("postgres_changes", { event: "*", schema: "public", table: "chat_thread_participants", filter: realtimeScopeFilter }, handleDashboardChatRealtimeRelatedChange)
.on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions", filter: realtimeScopeFilter }, () =>
handleDashboardChatRealtimeRelatedChange()
)
.on("postgres_changes", { event: "*", schema: "public", table: "chat_read_receipts", filter: realtimeScopeFilter }, () =>
handleDashboardChatRealtimeRelatedChange()
)
.subscribe(handleDashboardChatRealtimeStatus);
}
async function commitDashboardChatApiAction(payload, localCommit) {
const result = await sendDashboardChatApiAction(payload);
if (result.ok) {
applyDashboardChatApiPayload(result.result || {}, {
threadId: payload?.threadId,
});
}
if (result.ok || canFallbackDashboardChatApiResult(result)) {
return localCommit(result);
}
logDashboardChatApiFailure(payload?.action || "unknown", result);
return null;
}
function createDashboardMessage(text, threadId = dashboardChatTeamThreadId, options = {}) {
const currentUser = getCurrentPlatformUser();
const cleanText = String(text ?? "").trim();
if (!currentUser || !cleanText) {
return null;
}
const message = normalizeDashboardMessage({
id: options.id || "",
clientMessageId: options.clientMessageId || options.id || "",
threadId,
text: cleanText,
userId: currentUser.id,
readBy: [currentUser.id],
mentionedUserIds: getDashboardMentionUserIds(cleanText, getPlatformUsers(), currentUser.id),
replyToId: dashboardChatReplyDraft?.threadId === threadId ? dashboardChatReplyDraft.messageId : "",
priority: dashboardChatPriorityDraft,
author: currentUser,
status: options.status || "sent",
});
writeDashboardMessages([...readDashboardMessages(), message], {
skipCentralSync: Boolean(options.skipCentralSync),
});
return message;
}
function updateDashboardMessageLocalStatus(messageId, status, patch = {}) {
const normalizedMessageId = String(messageId || "").trim();
if (!normalizedMessageId) return null;
let updatedMessage = null;
writeDashboardMessages(
readDashboardMessages().map((message) => {
if (message.id !== normalizedMessageId) return message;
return (updatedMessage = normalizeDashboardMessage({ ...message, ...patch, status }));
}),
{ skipCentralSync: true }
);
return updatedMessage;
}
async function createDashboardMessageWithApi(text, threadId = dashboardChatTeamThreadId) {
const currentUser = getCurrentPlatformUser();
const cleanText = String(text ?? "").trim().slice(0, dashboardChatMaxMessageLength);
if (!currentUser || !cleanText) {
return null;
}
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
const messageId = createDashboardId("message");
const replyToId = dashboardChatReplyDraft?.threadId === normalizedThreadId ? dashboardChatReplyDraft.messageId : "";
const priority = dashboardChatPriorityDraft;
const attachmentIds = dashboardChatComposerAttachmentDraft?.id ? [dashboardChatComposerAttachmentDraft.id] : [];
const pendingMessage = createDashboardMessage(cleanText, normalizedThreadId, { id: messageId, status: "pending", skipCentralSync: true });
renderDashboardChatWidget();
const result = await sendDashboardChatApiAction({
action: "sendMessage",
id: messageId,
clientMessageId: messageId,
threadId: normalizedThreadId,
threadType: getDashboardChatThreadTypeForApi(normalizedThreadId),
threadTitle: getDashboardChatThreadLabel(normalizedThreadId, currentUser),
participantIds: getDashboardChatParticipantIdsForApi(normalizedThreadId),
text: cleanText,
replyToId,
priority,
mentionedUserIds: getDashboardMentionUserIds(cleanText, getPlatformUsers(), currentUser.id),
attachmentIds,
});
dashboardChatComposerAttachmentDraft = null;
if (result.ok) {
applyDashboardChatApiPayload(result.result || {}, { threadId: normalizedThreadId });
const message = result.result?.message ? normalizeDashboardApiMessage(result.result.message, result.result.thread) : null;
return message || updateDashboardMessageLocalStatus(messageId, "sent") || pendingMessage;
}
if (canFallbackDashboardChatApiResult(result)) {
return updateDashboardMessageLocalStatus(messageId, "sent") || pendingMessage;
}
logDashboardChatApiFailure("sendMessage", result);
updateDashboardMessageLocalStatus(messageId, "failed");
showDashboardChatWidgetToast(result.reason || "Message could not be sent.", normalizedThreadId);
renderDashboardChatWidget();
return null;
}
function retryDashboardMessageWithApi(messageId) { return dashboardChatApiUiActions.retryMessageWithApi(messageId); }
function markDashboardChatApiThreadRead(threadId) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
if (!normalizedThreadId) return;
updateDashboardChatApiThreads(
dashboardChatApiThreads.map((thread) =>
thread.threadId === normalizedThreadId ? { ...thread, unreadCount: 0, lastReadAt: new Date().toISOString() } : thread
)
);
}
function queueDashboardChatReadReceiptApi(threadId, messages = readDashboardMessages()) {
const currentUser = getCurrentPlatformUser();
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
const latestMessage = [...messages]
.reverse()
.find((message) => message.threadId === normalizedThreadId && message.status !== "pending" && message.status !== "failed");
const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalizedThreadId) || null;
const apiLastMessage = apiThread?.lastMessage ? normalizeDashboardApiMessage(apiThread.lastMessage, apiThread) : null;
const latestMessageId = String(latestMessage?.id || apiLastMessage?.id || apiThread?.lastMessageId || "").trim();
if (!currentUser?.id || !latestMessageId) {
return;
}
const signature = `${currentUser.id}:${normalizedThreadId}:${latestMessageId}`;
if (dashboardChatApiReadReceiptSyncSignatures.has(signature)) {
return;
}
if (dashboardChatApiReadReceiptSyncSignatures.size > 250) {
dashboardChatApiReadReceiptSyncSignatures = new Set();
}
dashboardChatApiReadReceiptSyncSignatures.add(signature);
void sendDashboardChatApiAction({
action: "markThreadRead",
threadId: normalizedThreadId,
lastReadMessageId: latestMessageId,
}).then((result) => {
if (result.ok) {
markDashboardChatApiThreadRead(normalizedThreadId);
renderDashboardChatWidget();
return;
}
if (!canFallbackDashboardChatApiResult(result)) {
dashboardChatApiReadReceiptSyncSignatures.delete(signature);
logDashboardChatApiFailure("markThreadRead", result);
}
});
}
function markDashboardMessagesReadForCurrentUser(messages = readDashboardMessages(), threadId = null) {
const currentUser = getCurrentPlatformUser();
if (!currentUser) {
return messages;
}
const normalizedThreadId = threadId ? normalizeDashboardChatThreadId(threadId, null) : null;
let changed = false;
const nextMessages = messages.map((message) => {
if (normalizedThreadId && message.threadId !== normalizedThreadId) {
return message;
}
if (message.userId === currentUser.id || message.readBy.includes(currentUser.id)) {
return message;
}
changed = true;
return normalizeDashboardMessage({
...message,
readBy: [...message.readBy, currentUser.id],
});
});
if (changed) {
writeDashboardMessages(nextMessages);
if (normalizedThreadId) {
markDashboardChatApiThreadRead(normalizedThreadId);
queueDashboardChatReadReceiptApi(normalizedThreadId, nextMessages);
}
} else if (normalizedThreadId) {
markDashboardChatApiThreadRead(normalizedThreadId);
queueDashboardChatReadReceiptApi(normalizedThreadId, nextMessages);
}
return nextMessages;
}
function removeDashboardMessage(messageId, options = {}) {
rememberDashboardDeletedMessageId(messageId);
writeDashboardMessages(readDashboardMessages().filter((message) => message.id !== messageId), {
skipCentralSync: Boolean(options.skipCentralSync),
});
}
async function removeDashboardMessageWithApi(messageId) {
const normalizedMessageId = String(messageId || "").trim();
if (!normalizedMessageId) {
return null;
}
const result = await sendDashboardChatApiAction({
action: "deleteMessage",
messageId: normalizedMessageId,
});
if (result.ok) {
applyDashboardChatApiPayload(result.result || {}, { threadId: result.result?.thread?.metadata?.legacyThreadId });
removeDashboardMessage(normalizedMessageId);
queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
return true;
}
if (result.status === 404) {
removeDashboardMessage(normalizedMessageId);
queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
return true;
}
logDashboardChatApiFailure("deleteMessage", result);
showDashboardChatWidgetToast(result.reason || "Message could not be deleted.");
return false;
}
function toggleDashboardMessagePin(messageId, options = {}) {
const currentUser = getCurrentPlatformUser();
if (!canPinDashboardChatMessage(currentUser)) {
return false;
}
let changed = false;
const nextMessages = readDashboardMessages().map((message) => {
if (message.id !== messageId) {
return message;
}
changed = true;
return normalizeDashboardMessage({
...message,
pinnedAt: message.pinnedAt ? "" : new Date().toISOString(),
pinnedBy: message.pinnedAt ? "" : currentUser.id,
});
});
if (changed) {
writeDashboardMessages(nextMessages, { skipCentralSync: Boolean(options.skipCentralSync) });
}
return changed;
}
function toggleDashboardMessagePinWithApi(messageId) {
const normalizedMessageId = String(messageId || "").trim();
const message = readDashboardMessages().find((candidate) => candidate.id === normalizedMessageId);
if (!message || !canPinDashboardChatMessage()) {
return Promise.resolve(false);
}
return commitDashboardChatApiAction(
{
action: "setMessagePinned",
messageId: normalizedMessageId,
pinned: !message.pinnedAt,
},
(apiResult) => toggleDashboardMessagePin(normalizedMessageId, { skipCentralSync: Boolean(apiResult?.ok) })
);
}
function toggleDashboardMessageReaction(messageId, reactionKey, options = {}) {
const currentUser = getCurrentPlatformUser();
const normalizedReactionKey = dashboardChatReactionOptions.some((option) => option.key === reactionKey) ? reactionKey : "";
if (!currentUser?.id || !normalizedReactionKey) {
return false;
}
let changed = false;
const nextMessages = readDashboardMessages().map((message) => {
if (message.id !== messageId) {
return message;
}
changed = true;
const reactions = normalizeDashboardReactions(message.reactions);
const currentSet = new Set(reactions[normalizedReactionKey] || []);
if (currentSet.has(currentUser.id)) {
currentSet.delete(currentUser.id);
} else {
currentSet.add(currentUser.id);
}
reactions[normalizedReactionKey] = Array.from(currentSet);
return normalizeDashboardMessage({
...message,
reactions,
});
});
if (changed) {
writeDashboardMessages(nextMessages, { skipCentralSync: Boolean(options.skipCentralSync) });
}
return changed;
}
function toggleDashboardMessageReactionWithApi(messageId, reactionKey) {
const currentUser = getCurrentPlatformUser();
const normalizedMessageId = String(messageId || "").trim();
const normalizedReactionKey = dashboardChatReactionOptions.some((option) => option.key === reactionKey) ? reactionKey : "";
const message = readDashboardMessages().find((candidate) => candidate.id === normalizedMessageId);
if (!currentUser?.id || !normalizedMessageId || !normalizedReactionKey || !message) {
return Promise.resolve(false);
}
const reactions = normalizeDashboardReactions(message.reactions);
const action = reactions[normalizedReactionKey]?.includes(currentUser.id) ? "removeReaction" : "addReaction";
return commitDashboardChatApiAction(
{
action,
messageId: normalizedMessageId,
reaction: normalizedReactionKey,
},
(apiResult) => toggleDashboardMessageReaction(normalizedMessageId, normalizedReactionKey, {
skipCentralSync: Boolean(apiResult?.ok),
})
);
}
function setDashboardChatReplyDraft(messageId, threadId) {
dashboardChatReplyDraft = messageId
? {
messageId: String(messageId || "").trim(),
threadId: normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId),
}
: null;
}
function setDashboardChatPriorityDraft(priority) { dashboardChatPriorityDraft = normalizeDashboardChatPriority(priority); }
function setDashboardChatConfirmAction(action = null) {
dashboardChatConfirmAction = action
? {
type: String(action.type || "").trim(),
messageId: String(action.messageId || "").trim(),
threadId: normalizeDashboardChatThreadId(action.threadId, dashboardChatTeamThreadId),
title: String(action.title || "Confirm chat action").trim(),
message: String(action.message || "This action cannot be undone.").trim(),
confirmLabel: String(action.confirmLabel || "Confirm").trim(),
}
: null;
}
function clearDashboardMessages() { writeDashboardMessages([]); }
function resetDashboardChatLocalCacheIfNeeded() {
try {
if (localStorage.getItem(dashboardChatLocalCacheResetStorageKey) === dashboardChatLocalCacheResetVersion) {
return;
}
localStorage.setItem(dashboardChatStorageKey, "[]");
localStorage.setItem(dashboardChatDeletedMessageIdsStorageKey, "[]");
localStorage.setItem(dashboardChatWidgetNotificationCursorStorageKey, "{}");
localStorage.setItem(dashboardChatWidgetNotificationStateStorageKey, "{}");
localStorage.setItem(dashboardChatLocalCacheResetStorageKey, dashboardChatLocalCacheResetVersion);
} catch {
}
}
function getDashboardChatThreadMessages(messages = readDashboardMessages(), threadId = dashboardChatTeamThreadId) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
return messages.filter((message) => message.threadId === normalizedThreadId);
}
function getDashboardChatThreadData(
threadId,
currentUser = getCurrentPlatformUser(),
users = getPlatformUsers(),
messages = readDashboardMessages()
) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
const isTeamThread = normalizedThreadId === dashboardChatTeamThreadId;
const isManagedThread = dashboardChatAdvancedThreadTemplates.some((template) => template.key === normalizedThreadId);
const participants = isTeamThread || isManagedThread
? []
: getDashboardChatThreadParticipants(normalizedThreadId, users).filter((user) => !isSameDashboardUser(user, currentUser));
const threadMessages = getDashboardChatThreadMessages(messages, normalizedThreadId);
const unreadCount = currentUser
? threadMessages.filter((message) => message.userId !== currentUser.id && !message.readBy.includes(currentUser.id)).length
: 0;
const mentionCount = currentUser
? threadMessages.filter(
(message) =>
message.userId !== currentUser.id &&
message.mentionedUserIds.includes(currentUser.id) &&
!message.readBy.includes(currentUser.id)
).length
: 0;
const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalizedThreadId) || null;
const apiLastMessage = apiThread?.lastMessage ? normalizeDashboardApiMessage(apiThread.lastMessage, apiThread) : null;
const lastMessage = threadMessages.length ? threadMessages[threadMessages.length - 1] : apiLastMessage;
const effectiveUnreadCount = threadMessages.length
? unreadCount
: Number(apiThread?.unreadCount || 0) || 0;
const hasMessageActivity = Boolean(threadMessages.length || apiLastMessage || Number(apiThread?.messageCount || 0) > 0);
const lastActivityMs = hasMessageActivity
? Math.max(
Date.parse(lastMessage?.createdAt || "") || 0,
Date.parse(apiThread?.lastMessageAt || "") || 0
)
: Date.parse(apiThread?.createdAt || "") || 0;
const managedTemplate = dashboardChatAdvancedThreadTemplates.find((template) => template.key === normalizedThreadId);
const isDirectThread = !isTeamThread && !isManagedThread && normalizedThreadId.startsWith("dm:");
const fallbackThreadLabel = formatDashboardChatThreadLabel(normalizedThreadId, currentUser, users);
const apiThreadTitle = String(apiThread?.title || "").trim();
const shouldUseComputedLabel = isTeamThread || isDirectThread || isGenericDashboardChatThreadTitle(apiThreadTitle);
const threadSettings = dashboardChatThreadSettings.merge(normalizedThreadId, apiThread?.settings || {});
const apiParticipants = Array.isArray(apiThread?.participants) ? apiThread.participants : [];
const resolvedApiParticipants = apiParticipants.map((participant) => {
const userId = String(participant.userId || participant.id || "").trim();
const platformUser = users.find((user) => user.id === userId) || null;
return {
...(platformUser || { id: userId, firstName: userId ? "Staff" : "Unknown", lastName: "" }),
...participant,
id: userId || platformUser?.id || "",
chatParticipantRole: participant.participantRole || participant.role || "member",
lastReadAt: participant.lastReadAt || "",
};
}).filter((participant) => participant.id);
const threadParticipants = isTeamThread
? users
: resolvedApiParticipants.length
? resolvedApiParticipants
: participants;
return {
threadId: normalizedThreadId,
label: threadSettings.customTitle || (shouldUseComputedLabel ? fallbackThreadLabel : apiThreadTitle),
isTeamThread,
type: apiThread?.type || (isManagedThread ? managedTemplate?.type : isTeamThread ? "team" : "dm"),
participant: threadParticipants.find((participant) => !isSameDashboardUser(participant, currentUser)) || threadParticipants[0] || null,
participants: threadParticipants,
permissions: apiThread?.permissions || {},
messageCount: Math.max(threadMessages.length, apiThread?.messageCount || 0),
unreadCount: effectiveUnreadCount,
mentionCount,
lastMessage,
lastActivityAt: lastActivityMs ? new Date(lastActivityMs).toISOString() : "",
apiThread,
settings: threadSettings,
avatarUrl: threadSettings.avatarUrl || apiThread?.avatarUrl || "",
};
}
function getDashboardChatThreadList(currentUser = getCurrentPlatformUser(), users = getPlatformUsers(), messages = readDashboardMessages()) {
if (!currentUser?.id) {
return [
{
threadId: dashboardChatTeamThreadId,
label: getDashboardChatTeamChatTitle(),
isTeamThread: true,
messageCount: 0,
unreadCount: 0,
lastMessage: null,
participant: null,
},
];
}
const activeUsers = users.filter((candidate) => candidate.status === "active" && !isSameDashboardUser(candidate, currentUser));
const threadRows = [getDashboardChatThreadData(dashboardChatTeamThreadId, currentUser, users, messages)];
const advancedThreadIds = Array.from(
new Set([
...dashboardChatAdvancedThreadTemplates.map((template) => template.key),
...dashboardChatApiThreads
.filter((thread) => thread.threadId !== dashboardChatTeamThreadId && !String(thread.threadId).startsWith("dm:"))
.map((thread) => thread.threadId),
])
);
const advancedThreads = advancedThreadIds.map((threadId) => getDashboardChatThreadData(threadId, currentUser, users, messages));
const directThreadIds = Array.from(
new Set([
...activeUsers.map((user) => createDashboardChatThreadId(currentUser.id, user.id)),
...dashboardChatApiThreads
.filter((thread) => String(thread.threadId || "").startsWith("dm:"))
.map((thread) => thread.threadId),
...messages
.map((message) => message.threadId)
.filter((threadId) => String(threadId || "").startsWith("dm:")),
])
);
const directThreads = directThreadIds.map((threadId) => getDashboardChatThreadData(threadId, currentUser, users, messages));
const sortThreads = (first, second) => {
const firstPinned = Boolean(first.settings?.pinned);
const secondPinned = Boolean(second.settings?.pinned);
if (firstPinned !== secondPinned) {
return firstPinned ? -1 : 1;
}
const threadTime = (thread) => Date.parse(thread.lastActivityAt || thread.lastMessage?.createdAt || thread.apiThread?.lastMessageAt || thread.apiThread?.createdAt || "") || 0;
const firstTime = threadTime(first);
const secondTime = threadTime(second);
if (firstTime === secondTime) {
const firstName = getDashboardUserLabel(first.participant?.id, users);
const secondName = getDashboardUserLabel(second.participant?.id, users);
return firstName.localeCompare(secondName, undefined, { sensitivity: "base" });
}
return secondTime - firstTime;
};
advancedThreads.sort(sortThreads);
directThreads.sort(sortThreads);
return [...threadRows, ...advancedThreads, ...directThreads].sort(sortThreads);
}
function getDashboardChatUnreadCountForCurrentUser(currentUser = getCurrentPlatformUser(), messages = readDashboardMessages()) {
if (!currentUser?.id) {
return 0;
}
return getDashboardChatThreadList(currentUser, getPlatformUsers(), messages).reduce((total, thread) => total + thread.unreadCount, 0);
}
function normalizeDashboardPresenceStatus(value) {
const status = String(value || "").trim().toLowerCase();
if (status === "away" || status === "offline") {
return status;
}
return "online";
}
function getDashboardSelfPresenceStatus() {
if (document.visibilityState !== "visible" || !document.hasFocus()) {
return "away";
}
return Date.now() - dashboardPresenceLastActivityAt > dashboardPresenceIdleMs ? "away" : "online";
}
function resolveDashboardPresenceStatus(entry, userId = "") {
const currentUser = getCurrentPlatformUser();
if (!entry && currentUser?.id && currentUser.id === userId) {
return getDashboardSelfPresenceStatus();
}
const lastSeenMs = new Date(entry?.lastSeenAt || entry?.updatedAt || 0).getTime();
if (!Number.isFinite(lastSeenMs)) {
return "offline";
}
const ageMs = Date.now() - lastSeenMs;
const rawStatus = normalizeDashboardPresenceStatus(entry?.status);
if (rawStatus === "offline" || ageMs > dashboardPresenceAwayTtlMs) {
return "offline";
}
if (rawStatus === "away" || ageMs > dashboardPresenceOnlineTtlMs) {
return "away";
}
return "online";
}
function normalizeDashboardPresenceEntries(entries = []) {
if (!Array.isArray(entries)) {
return {};
}
return Object.fromEntries(
entries
.map((entry) => {
const userId = String(entry?.userId || entry?.user?.id || "").trim();
if (!userId) {
return null;
}
return [
userId,
{
userId,
status: normalizeDashboardPresenceStatus(entry.status),
lastSeenAt: String(entry.lastSeenAt || entry.updatedAt || ""),
lastActivityAt: String(entry.lastActivityAt || ""),
workspaceId: String(entry.workspaceId || ""),
typingThreadId: entry.typingThreadId ? normalizeDashboardChatThreadId(entry.typingThreadId, dashboardChatTeamThreadId) : "",
typingAt: String(entry.typingAt || ""),
updatedAt: String(entry.updatedAt || ""),
},
];
})
.filter(Boolean)
);
}
function getDashboardPresenceSignature(entriesByUserId = dashboardPresenceEntriesByUserId) {
return Object.entries(entriesByUserId)
.sort(([firstId], [secondId]) => firstId.localeCompare(secondId))
.map(([userId, entry]) => `${userId}:${entry.status}:${entry.lastSeenAt}:${entry.typingThreadId}:${entry.typingAt}`)
.join("|");
}
function applyDashboardPresenceEntries(entries = [], options = {}) {
const nextEntries = normalizeDashboardPresenceEntries(entries);
const nextSignature = getDashboardPresenceSignature(nextEntries);
dashboardPresenceEntriesByUserId = nextEntries;
if (!options.forceRender && nextSignature === dashboardPresenceLastRenderedSignature) {
return;
}
dashboardPresenceLastRenderedSignature = nextSignature;
renderDashboardChatWidget();
}
function getDashboardPresenceEntry(userId) { return dashboardPresenceEntriesByUserId[String(userId || "").trim()] || null; }
function getDashboardPresenceStatus(userId) { return resolveDashboardPresenceStatus(getDashboardPresenceEntry(userId), String(userId || "").trim()); }
function getDashboardPresenceLabel(status) {
const normalizedStatus = normalizeDashboardPresenceStatus(status);
if (normalizedStatus === "online") {
return "Online";
}
if (normalizedStatus === "away") {
return "Passive";
}
return "Offline";
}
function getDashboardPresenceSummary(users = []) {
return users.reduce(
(summary, user) => {
const status = getDashboardPresenceStatus(user.id);
summary[status] = (summary[status] || 0) + 1;
return summary;
},
{ online: 0, away: 0, offline: 0 }
);
}
function renderDashboardPresenceDot(user, options = {}) {
const status = getDashboardPresenceStatus(user?.id);
const label = getDashboardPresenceLabel(status);
return `
    <span
      class="dashboard-presence-dot is-${escapeHtml(status)}${options.inline ? " is-inline" : ""}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    ></span>
  `;
}
function renderDashboardPresenceAvatar(user, className) {
return `
    <span class="dashboard-presence-avatar">
      ${renderUserAvatar(user, className)}
      ${renderDashboardPresenceDot(user)}
    </span>
  `;
}
function markDashboardPresenceActivity() { dashboardPresenceLastActivityAt = Date.now(); }
function getDashboardPresenceWorkspaceId() { return hubState?.activeWorkspaceId || ""; }
function getActiveDashboardTypingThreadId() {
if (!dashboardChatTypingThreadId || Date.now() - dashboardChatTypingAt > dashboardTypingTtlMs) {
return "";
}
return dashboardChatTypingThreadId;
}
async function pushDashboardPresence(statusOverride = "", options = {}) {
const currentUser = getCurrentPlatformUser();
const authStore = getPlatformAuthStore();
if (!currentUser?.id || !authStore?.updatePresence || dashboardPresenceInFlight) return;
if (document.visibilityState !== "visible" && statusOverride !== "away" && statusOverride !== "offline") return;
const status = statusOverride || getDashboardSelfPresenceStatus();
const typingThreadId = getActiveDashboardTypingThreadId();
const payload = { lastActivityAt: new Date(dashboardPresenceLastActivityAt).toISOString(), workspaceId: getDashboardPresenceWorkspaceId(), typingThreadId, typingAt: typingThreadId ? new Date(dashboardChatTypingAt).toISOString() : "" };
const now = Date.now();
const minInterval = typingThreadId ? dashboardPresenceTypingPushMinMs : dashboardPresenceSteadyPushMinMs;
if (!options.force && now - dashboardPresenceLastPushAt < minInterval) return;
dashboardPresenceInFlight = true;
try {
const result = await authStore.updatePresence(status, payload);
if (result?.ok) {
dashboardPresenceLastPushAt = now;
applyDashboardPresenceEntries(result.entries, { forceRender: true });
}
} catch {
} finally {
dashboardPresenceInFlight = false;
}
}
async function refreshDashboardPresence(options = {}) {
const currentUser = getCurrentPlatformUser();
const authStore = getPlatformAuthStore();
if (!currentUser?.id || !authStore?.getPresence || document.visibilityState !== "visible") return;
const now = Date.now();
if (!options.forceNetwork && now - dashboardPresenceLastPollAt < dashboardPresencePollMinMs) return;
dashboardPresenceLastPollAt = now;
try {
const result = await authStore.getPresence();
if (result?.ok) {
applyDashboardPresenceEntries(result.entries, { forceRender: Boolean(options.forceRender) });
}
} catch {
}
}
function startDashboardPresenceRuntime() {
const currentUser = getCurrentPlatformUser();
if (!currentUser?.id) return stopDashboardPresenceRuntime();
if (dashboardPresenceStarted) return;
dashboardPresenceStarted = true;
markDashboardPresenceActivity();
pushDashboardPresence("online").catch(() => {});
refreshDashboardPresence({ forceRender: true }).catch(() => {});
dashboardPresenceHeartbeatTimer = win.setInterval(() => {
pushDashboardPresence().catch(() => {});
}, dashboardPresenceHeartbeatMs);
dashboardPresencePollTimer = win.setInterval(() => {
refreshDashboardPresence().catch(() => {});
}, dashboardPresencePollMs);
}
function pauseDashboardPresenceRuntime(options = {}) {
if (dashboardPresenceHeartbeatTimer) win.clearInterval(dashboardPresenceHeartbeatTimer);
if (dashboardPresencePollTimer) win.clearInterval(dashboardPresencePollTimer);
dashboardPresenceHeartbeatTimer = null;
dashboardPresencePollTimer = null;
dashboardPresenceStarted = false;
if (!options.clearEntries) return;
dashboardPresenceEntriesByUserId = {};
dashboardPresenceLastRenderedSignature = "";
renderDashboardChatWidget();
}
function stopDashboardPresenceRuntime() {
pauseDashboardPresenceRuntime({ clearEntries: true });
}
function clearDashboardChatTyping() {
dashboardChatTypingThreadId = "";
dashboardChatTypingAt = 0;
if (dashboardChatTypingClearTimer) {
win.clearTimeout(dashboardChatTypingClearTimer);
dashboardChatTypingClearTimer = null;
}
pushDashboardPresence().catch(() => {});
}
function queueDashboardChatTyping(threadId) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
dashboardChatTypingThreadId = normalizedThreadId;
dashboardChatTypingAt = Date.now();
if (dashboardChatTypingClearTimer) {
win.clearTimeout(dashboardChatTypingClearTimer);
}
dashboardChatTypingClearTimer = win.setTimeout(() => {
dashboardChatTypingClearTimer = null;
clearDashboardChatTyping();
}, dashboardTypingTtlMs);
if (Date.now() - dashboardChatTypingLastSentAt < dashboardTypingSendThrottleMs) {
return;
}
dashboardChatTypingLastSentAt = Date.now();
pushDashboardPresence().catch(() => {});
}
function getDashboardTypingUsers(threadId, users = getPlatformUsers(), currentUser = getCurrentPlatformUser()) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
const now = Date.now();
return users.filter((user) => {
if (!user?.id || user.id === currentUser?.id) {
return false;
}
const entry = getDashboardPresenceEntry(user.id);
const typingAtMs = new Date(entry?.typingAt || 0).getTime();
return (
entry?.typingThreadId === normalizedThreadId &&
Number.isFinite(typingAtMs) &&
now - typingAtMs <= dashboardTypingTtlMs
);
});
}
function renderDashboardTypingIndicator(threadId, users, currentUser) {
const typingUsers = getDashboardTypingUsers(threadId, users, currentUser);
if (!typingUsers.length) {
return "";
}
const names = typingUsers.slice(0, 2).map(formatUserName);
const label = typingUsers.length === 1
? `${names[0]} is typing`
: typingUsers.length === 2
? `${names[0]} and ${names[1]} are typing`
: `${names[0]}, ${names[1]} and ${typingUsers.length - 2} more are typing`;
return `<div class="dashboard-chat-typing" aria-live="polite"><span></span><span></span><span></span><strong>${escapeHtml(label)}</strong></div>`;
}
function readDashboardNotificationSeenMap() {
const parsed = readDashboardJson(dashboardNotificationSeenStorageKey, {});
return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
function writeDashboardNotificationSeenMap(seenMap) {
writeDashboardJson(dashboardNotificationSeenStorageKey, seenMap && typeof seenMap === "object" ? seenMap : {});
}
function getDashboardNotificationSeenAt(user = getCurrentPlatformUser()) {
if (!user?.id) {
return 0;
}
const seenAt = readDashboardNotificationSeenMap()[user.id];
const seenTime = new Date(seenAt || 0).getTime();
return Number.isFinite(seenTime) ? seenTime : 0;
}
function hasDashboardHomeNotifications(user = getCurrentPlatformUser()) {
if (!user?.id) {
return false;
}
const seenAt = getDashboardNotificationSeenAt(user);
return readDashboardTasks().some((task) => {
const createdAt = new Date(task.createdAt || 0).getTime();
return (
task.status === "open" &&
task.scope === "team" &&
task.assignedTo === user.id &&
task.createdBy !== user.id &&
Number.isFinite(createdAt) &&
createdAt > seenAt
);
});
}
function markDashboardHomeSeenForCurrentUser() {
const user = getCurrentPlatformUser();
if (!user?.id) {
return;
}
writeDashboardNotificationSeenMap({
...readDashboardNotificationSeenMap(),
[user.id]: new Date().toISOString(),
});
}
function getDashboardUserLabel(userId, users = getPlatformUsers()) {
const user = users.find((candidate) => candidate.id === userId);
return user ? formatUserName(user) : "Unknown";
}
function getDashboardMessageById(messageId, messages = readDashboardMessages()) { return messages.find((message) => message.id === messageId) || null; }
function getDashboardMessageAuthorName(message, users = getPlatformUsers()) {
const author = users.find((user) => user.id === message?.userId) || message?.author || null;
return author ? formatUserName(author) : "Staff";
}
function getDashboardMessagePreview(message) {
return String(message?.text || "")
.replace(/\s+/g, " ")
.trim()
.slice(0, 86);
}
function renderDashboardReplyReference(message, users = getPlatformUsers(), options = {}) {
if (!message) {
return "";
}
const authorName = getDashboardMessageAuthorName(message, users);
const preview = getDashboardMessagePreview(message);
const closeButton = options.cancelable
? `<button type="button" data-dashboard-cancel-reply aria-label="Cancel reply">×</button>`
: "";
return `
    <div class="dashboard-chat-reply-ref${options.compact ? " is-compact" : ""}">
      <span>
        <strong>${escapeHtml(authorName)}</strong>
        <small>${escapeHtml(preview || "Message")}</small>
      </span>
      ${closeButton}
    </div>
  `;
}
function getDashboardPinnedMessagesForThread(messages = readDashboardMessages(), threadId = dashboardChatTeamThreadId) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
return messages
.filter((message) => message.threadId === normalizedThreadId && message.pinnedAt)
.sort((first, second) => new Date(second.pinnedAt || 0) - new Date(first.pinnedAt || 0))
.slice(0, dashboardChatPinnedLimit);
}
function renderDashboardPinnedMessages(pinnedMessages = [], users = getPlatformUsers(), currentUser = getCurrentPlatformUser()) {
if (!pinnedMessages.length) {
return "";
}
return `
    <section class="dashboard-chat-pins" aria-label="Pinned chat messages">
      <div class="dashboard-chat-pins-head">
        <strong>Pinned</strong>
        <span>${escapeHtml(`${pinnedMessages.length}`)}</span>
      </div>
      ${pinnedMessages
        .map((message) => {
          const author = users.find((user) => user.id === message.userId) || message.author || null;
          const canUnpin = canPinDashboardChatMessage(currentUser);
          return `
<article class="dashboard-chat-pin-card">
<div>
<strong>${escapeHtml(author ? formatUserName(author) : "Staff")}</strong>
<p>${renderDashboardMessageText(message, users)}</p>
</div>
${
canUnpin
? `<button type="button" data-dashboard-toggle-pin-message="${escapeHtml(message.id)}">Unpin</button>`
: ""
}
</article>
`;
        })
        .join("")}
    </section>
  `;
}
function renderDashboardMessageReactions(message, currentUser = getCurrentPlatformUser()) {
const reactions = normalizeDashboardReactions(message.reactions);
return `
    <div class="dashboard-chat-reactions" aria-label="Message reactions">
      ${dashboardChatReactionOptions
        .map((option) => {
          const userIds = reactions[option.key] || [];
          const isActive = currentUser?.id ? userIds.includes(currentUser.id) : false;
          const countLabel = userIds.length ? ` ${userIds.length}` : "";
          return `
<button
type="button"
class="${isActive ? "is-active" : ""}"
data-dashboard-message-reaction="${escapeHtml(message.id)}"
data-dashboard-reaction-key="${escapeHtml(option.key)}"
aria-pressed="${isActive}"
>${escapeHtml(option.label)}${escapeHtml(countLabel)}</button>
`;
        })
        .join("")}
    </div>
  `;
}
function clearDashboardMessagesForThread(threadId, options = {}) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
writeDashboardMessages(readDashboardMessages().filter((message) => message.threadId !== normalizedThreadId), {
skipCentralSync: Boolean(options.skipCentralSync),
});
}
function clearDashboardMessagesForThreadWithApi(threadId) {
const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
return commitDashboardChatApiAction(
{
action: "clearThread",
threadId: normalizedThreadId,
},
(apiResult) => {
clearDashboardMessagesForThread(normalizedThreadId, { skipCentralSync: Boolean(apiResult?.ok) });
queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
return true;
}
);
}
function getDashboardChatRenderSignature(html = "") {
let hash = 0;
for (let index = 0; index < html.length; index += 1) {
hash = (hash * 31 + html.charCodeAt(index)) >>> 0;
}
return `${html.length}:${hash}`;
}
function renderDashboardChatWidget() {
const root = ui.dashboardChatWidgetRoot;
if (!root) {
return;
}
const currentUser = getCurrentPlatformUser();
if (!currentUser) {
document.body?.classList.remove("has-dashboard-chat-widget");
document.body?.classList.remove("is-dashboard-chat-closed");
document.body?.classList.remove("is-dashboard-chat-open");
delete root.dataset.dashboardChatRenderSignature;
root.innerHTML = "";
return;
}
ensureDashboardChatStylesheet().catch(() => {});
resetDashboardChatLocalCacheIfNeeded();
if (!dashboardChatThreadSummarySyncTimer && Date.now() - dashboardChatThreadSummaryLastRequestedAt > 30000) {
queueDashboardChatThreadSummaryRefresh({ delayMs: 50, render: true });
}
const users = getPlatformUsers().filter((user) => user.status === "active");
const notificationState = readDashboardChatWidgetNotificationState();
const state = readDashboardChatWidgetState();
document.body?.classList.add("has-dashboard-chat-widget");
document.body?.classList.toggle("is-dashboard-chat-open", Boolean(state.isOpen));
document.body?.classList.toggle("is-dashboard-chat-closed", !state.isOpen);
const activeElement = document.activeElement;
const existingComposer = root.querySelector("[data-dashboard-chat-input]");
const wasComposerFocused = Boolean(existingComposer && activeElement === existingComposer);
const previousComposerSelectionStart = wasComposerFocused ? existingComposer.selectionStart : null;
const previousComposerSelectionEnd = wasComposerFocused ? existingComposer.selectionEnd : null;
const previousComposerThreadId = state.selectedThreadId;
const previousComposerRawDraft = existingComposer?.value || "";
const submittedComposerDraft = dashboardChatSubmittedComposerDrafts.get(previousComposerThreadId) || "";
const shouldClearSubmittedComposerDraft = Boolean(submittedComposerDraft) && (
!previousComposerRawDraft || previousComposerRawDraft.trim() === submittedComposerDraft
);
const previousComposerDraft = shouldClearSubmittedComposerDraft ? "" : previousComposerRawDraft;
const existingThreadList = root.querySelector("[data-dashboard-chat-thread-list]");
const previousThreadListScrollTop = existingThreadList?.scrollTop ?? 0;
const previousThreadListScrollLeft = existingThreadList?.scrollLeft ?? 0;
const existingChatList = root.querySelector("[data-dashboard-chat-list]");
const previousChatListScrollTop = existingChatList?.scrollTop ?? null;
const previousChatListScrollHeight = existingChatList?.scrollHeight ?? 0;
const previousChatListClientHeight = existingChatList?.clientHeight ?? 0;
const previousChatListWasAtBottom =
existingChatList && previousChatListScrollHeight - previousChatListScrollTop - previousChatListClientHeight <96;
const preserveChatScroll = dashboardChatPageScroll;
const messages = readDashboardMessages();
const resolvedMessages = isDashboardChatThreadActivelyViewed(state.selectedThreadId)
? markDashboardMessagesReadForCurrentUser(messages, state.selectedThreadId)
: messages;
dashboardChatAttachmentRenderer.queueSignedUrls(resolvedMessages);
const threads = getDashboardChatThreadList(currentUser, users, resolvedMessages);
const activeThreadId = threads.some((thread) => thread.threadId === state.selectedThreadId)
? state.selectedThreadId
: threads[0]?.threadId || dashboardChatTeamThreadId;
if (state.isOpen && activeThreadId && !dashboardChatHydratedThreadIds.has(activeThreadId) && !dashboardChatApiSyncTimer) {
dashboardChatHydratedThreadIds.add(activeThreadId);
queueDashboardChatApiRefresh({ threadId: activeThreadId, delayMs: 0 });
}
const unreadCount = getDashboardChatUnreadCountForCurrentUser(currentUser, resolvedMessages);
const renderedWidget = dashboardChatWidgetRenderer.render({
currentUser,
users,
notificationState,
state,
messages: resolvedMessages,
threads,
activeThreadId,
unreadCount,
realtimeStatus: dashboardChatApiUiActions.getRealtimeRenderState(),
detailsOpen: dashboardChatDetailsOpen,
mobileConversationOpen: dashboardChatMobileConversationOpen,
replyDraft: dashboardChatReplyDraft,
priorityDraft: dashboardChatPriorityDraft,
confirmAction: dashboardChatConfirmAction,
messageSearchQuery: dashboardChatMessageSearchQuery,
messageSearchActiveIndex: dashboardChatMessageSearchActiveIndex,
hasOlderMessages: Boolean(dashboardChatApiPagination[activeThreadId]),
advancedThreadTemplates: dashboardChatAdvancedThreadTemplates,
moderationOpen: dashboardChatModerationOpen,
moderationState: dashboardChatModerationState,
attachmentDraft: dashboardChatComposerAttachmentDraft,
teamChatTitle: getDashboardChatTeamChatTitle(),
groupCreatorOpen: dashboardChatGroupCreatorOpen,
});
dashboardChatReplyDraft = renderedWidget.replyDraft;
if (renderedWidget.activeThreadId !== state.selectedThreadId) {
writeDashboardChatWidgetState({
...state,
selectedThreadId: renderedWidget.activeThreadId,
});
}
const renderSignature = getDashboardChatRenderSignature(renderedWidget.html);
if (root.dataset.dashboardChatRenderSignature === renderSignature) {
if (shouldClearSubmittedComposerDraft) {
dashboardChatSubmittedComposerDrafts.delete(previousComposerThreadId);
}
dashboardChatPageScroll = false;
platformNavigationController.renderTopIconMenu();
return;
}
const previousMessageSearchInput = root.querySelector("[data-dashboard-chat-message-search]");
const wasMessageSearchFocused = Boolean(previousMessageSearchInput && document.activeElement === previousMessageSearchInput);
const previousMessageSearchSelectionStart = wasMessageSearchFocused ? previousMessageSearchInput.selectionStart : null;
const previousMessageSearchSelectionEnd = wasMessageSearchFocused ? previousMessageSearchInput.selectionEnd : null;
root.innerHTML = renderedWidget.html;
root.dataset.dashboardChatRenderSignature = renderSignature;
if (shouldClearSubmittedComposerDraft) {
dashboardChatSubmittedComposerDrafts.delete(previousComposerThreadId);
}
const nextThreadList = root.querySelector("[data-dashboard-chat-thread-list]");
if (nextThreadList) {
nextThreadList.scrollTop = previousThreadListScrollTop;
nextThreadList.scrollLeft = previousThreadListScrollLeft;
}
if (wasMessageSearchFocused) {
const nextMessageSearchInput = root.querySelector("[data-dashboard-chat-message-search]");
if (nextMessageSearchInput) {
nextMessageSearchInput.focus();
if (previousMessageSearchSelectionStart !== null && previousMessageSearchSelectionEnd !== null) {
nextMessageSearchInput.setSelectionRange(previousMessageSearchSelectionStart, previousMessageSearchSelectionEnd);
}
}
}
const nextChatList = root.querySelector("[data-dashboard-chat-list]");
const activeSearchMatchElement = root.querySelector("[data-dashboard-chat-search-active='true']");
if (activeSearchMatchElement) {
activeSearchMatchElement.scrollIntoView({ block: "center", inline: "nearest" });
} else if (nextChatList && previousChatListScrollTop !== null && previousComposerThreadId === renderedWidget.activeThreadId) {
const nextMaxScrollTop = Math.max(0, nextChatList.scrollHeight - nextChatList.clientHeight);
const nextScrollTop = preserveChatScroll
? previousChatListScrollTop + Math.max(0, nextChatList.scrollHeight - previousChatListScrollHeight)
: previousChatListScrollTop;
nextChatList.scrollTop = previousChatListWasAtBottom
? nextMaxScrollTop
: Math.min(Math.max(0, nextScrollTop), nextMaxScrollTop);
}
dashboardChatPageScroll = false;
if (previousComposerThreadId === renderedWidget.activeThreadId) {
const nextComposer = root.querySelector("[data-dashboard-chat-input]");
if (nextComposer) {
nextComposer.value = previousComposerDraft;
if (wasComposerFocused) {
nextComposer.focus();
}
if (wasComposerFocused && previousComposerSelectionStart !== null && previousComposerSelectionEnd !== null) {
nextComposer.setSelectionRange(previousComposerSelectionStart, previousComposerSelectionEnd);
}
}
}
platformNavigationController.renderTopIconMenu();
}
function syncDashboardChatWidgetNotificationCursor() {
const currentUser = getCurrentPlatformUser();
if (!currentUser) {
return;
}
const state = readDashboardChatWidgetState();
const notifications = readDashboardChatWidgetNotificationState();
const messages = readDashboardMessages();
const normalizedActiveThreadId = normalizeDashboardChatThreadId(state.selectedThreadId, dashboardChatTeamThreadId);
const activeThreadApi = dashboardChatApiThreads.find((thread) => thread.threadId === normalizedActiveThreadId) || null;
const activeThreadApiLastMessage = activeThreadApi?.lastMessage ? normalizeDashboardApiMessage(activeThreadApi.lastMessage, activeThreadApi) : null;
const activeThreadLastMessage =
[...messages].reverse().find((message) => message.threadId === normalizedActiveThreadId) ||
activeThreadApiLastMessage ||
(activeThreadApi?.lastMessageId ? { id: activeThreadApi.lastMessageId, userId: "", threadId: normalizedActiveThreadId } : null);
const currentCursor = readDashboardChatWidgetNotificationCursor();
const activeThreadCursor = currentCursor.threads?.[activeThreadLastMessage?.threadId] || {};
if (activeThreadLastMessage && isDashboardChatThreadActivelyViewed(activeThreadLastMessage.threadId)) {
if (
activeThreadCursor.threadId !== activeThreadLastMessage.threadId ||
activeThreadCursor.lastMessageId !== activeThreadLastMessage.id ||
activeThreadCursor.userId !== activeThreadLastMessage.userId
) {
writeDashboardChatWidgetNotificationCursor({
lastMessageId: activeThreadLastMessage.id,
seenAt: Date.now(),
userId: activeThreadLastMessage.userId,
threadId: activeThreadLastMessage.threadId,
});
}
}
if (!notifications.enabled) {
return;
}
const latestMessage = [...messages].reverse().find((message) => message.userId !== currentUser.id);
const latestApiThreadMessage = dashboardChatApiThreads
.map((thread) => (thread.lastMessage ? normalizeDashboardApiMessage(thread.lastMessage, thread) : null))
.filter((message) => message && message.userId !== currentUser.id)
.sort((first, second) => getDashboardMessageCreatedAtMs(second) - getDashboardMessageCreatedAtMs(first))[0] || null;
const latestVisibleMessage = [latestMessage, latestApiThreadMessage]
.filter(Boolean)
.sort((first, second) => getDashboardMessageCreatedAtMs(second) - getDashboardMessageCreatedAtMs(first))[0] || null;
if (!latestVisibleMessage) {
return;
}
const cursor = currentCursor.threads?.[latestVisibleMessage.threadId] || currentCursor;
if (cursor.lastMessageId === latestVisibleMessage.id && cursor.userId === latestVisibleMessage.userId && cursor.threadId === latestVisibleMessage.threadId) {
return;
}
if (isDashboardChatThreadActivelyViewed(latestVisibleMessage.threadId)) {
return;
}
if (dashboardChatThreadSettings.get(latestVisibleMessage.threadId).muted) {
return;
}
const users = getPlatformUsers();
const sender = users?.find((entry) => entry.id === latestVisibleMessage.userId);
const senderName = formatUserName(sender ?? latestVisibleMessage.author ?? { firstName: "Team", lastName: "Member" });
const threadName = formatDashboardChatThreadLabel(latestVisibleMessage.threadId, currentUser, getPlatformUsers());
const mentionedCurrentUser = latestVisibleMessage.mentionedUserIds.includes(currentUser.id);
if (notifications.level === "mentions" && !mentionedCurrentUser) {
return;
}
showDashboardChatWidgetToast(
mentionedCurrentUser
? `${senderName} mentioned you in ${threadName}`
: `New message from ${senderName} in ${threadName}`,
latestVisibleMessage.threadId
);
writeDashboardChatWidgetNotificationCursor({
lastMessageId: latestVisibleMessage.id,
seenAt: Date.now(),
userId: latestVisibleMessage.userId,
threadId: latestVisibleMessage.threadId,
});
}
function showDashboardChatWidgetToast(messageText, threadId = dashboardChatTeamThreadId) {
const root = ui.dashboardChatWidgetRoot;
if (!root) {
return;
}
if (dashboardChatWidgetToastTimer) {
win.clearTimeout(dashboardChatWidgetToastTimer);
dashboardChatWidgetToastTimer = null;
}
const toastState = {
text: String(messageText || "").trim(),
createdAt: Date.now(),
threadId: normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId),
};
dashboardChatWidgetToastState = toastState;
const toastRoot = root.querySelector("[data-dashboard-chat-widget-toast]");
if (!toastRoot || !toastState.text) {
return;
}
toastRoot.textContent = toastState.text;
toastRoot.dataset.dashboardChatToastThread = toastState.threadId;
toastRoot.hidden = false;
dashboardChatWidgetToastTimer = win.setTimeout(() => {
if (root.querySelector("[data-dashboard-chat-widget-toast]")) {
root.querySelector("[data-dashboard-chat-widget-toast]").hidden = true;
}
dashboardChatWidgetToastTimer = null;
}, 3900);
}
function hideDashboardChatWidgetToast() {
const root = ui.dashboardChatWidgetRoot;
if (!root) {
return;
}
const toastRoot = root.querySelector("[data-dashboard-chat-widget-toast]");
if (toastRoot) {
toastRoot.hidden = true;
toastRoot.textContent = "";
delete toastRoot.dataset.dashboardChatToastThread;
}
if (dashboardChatWidgetToastTimer) {
win.clearTimeout(dashboardChatWidgetToastTimer);
dashboardChatWidgetToastTimer = null;
}
}
function focusDashboardChatWidgetComposer() {
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-input]")?.focus();
}, 0);
}
const sessionPlannerToastController = createSessionPlannerToastController({
escapeHtml,
getState: sessionPlannerLocalUiState.getState,
getWorkspace: () => ui.sessionPlannerWorkspace,
win,
});
function renderSessionPlannerToast() { sessionPlannerToastController.render(); }
function showSessionPlannerToast(message, tone = "success") { sessionPlannerToastController.show(message, tone); }
function commitSessionPlannerExerciseToLibrary(exercise, mode = "new", existingExerciseId = "") { return exerciseLibraryActions.commitExercise(exercise, mode, existingExerciseId); }
function queueSessionPlannerLibrarySaveConflict(exercise, existingExercise) { exerciseLibraryActions.queueSaveConflict(exercise, existingExercise); }
function resolveSessionPlannerLibrarySaveConflict(action) { exerciseLibraryActions.resolveSaveConflict(action); }
function saveSelectedSessionPlannerExerciseToLibrary() { exerciseLibraryActions.saveSelectedExercise(); }
function deleteSessionPlannerLibraryExercise(exerciseId) { exerciseLibraryActions.archiveExercise(exerciseId); }
function restoreSessionPlannerLibraryExercise(exerciseId) { exerciseLibraryActions.restoreExercise(exerciseId); }
function createSessionPlannerDefaultSession(dateValue = formatScheduleDateValue(new Date())) { return sessionPlannerSessionFactory.createDefaultSession(dateValue); }
function createSessionPlannerEmptySession(dateValue = formatScheduleDateValue(new Date())) { return sessionPlannerSessionFactory.createEmptySession(dateValue); }
function getSessionPlannerPeriodizationOverride(dateValue) { return sessionPlannerSessionFactory.getPeriodizationOverride(dateValue); }
function isSessionPlannerOffDate(dateValue) { return sessionPlannerSessionFactory.isOffDate(dateValue); }
function createSessionPlannerSessionForNewPlan(dateValue = formatScheduleDateValue(new Date())) { return sessionPlannerSessionFactory.createSessionForNewPlan(dateValue); }
function isGeneratedDefaultSessionPlannerSession(session = {}) { return sessionPlannerSessionFactory.isGeneratedDefaultSession(session); }
function shouldStripSessionPlannerGeneratedDefaultSession(dateValue, session = {}) { return sessionPlannerSessionFactory.shouldStripGeneratedDefaultSession(dateValue, session); }
function shouldClearSessionPlannerSessionForDate(dateValue, session = {}) { return sessionPlannerSessionFactory.shouldClearSessionForDate(dateValue, session); }
const {
cloneSessionPlannerSession,
createSessionPlannerDefaultState,
parseSessionPlannerBlockReductionGuardTime,
normalizeSessionPlannerBlockReductionGuard,
canReduceSessionPlannerBlocksForDate,
normalizeSessionPlannerBlockDeletionTombstones,
markSessionPlannerBlockReductionAllowed,
markSessionPlannerBlockDeleted,
applySessionPlannerBlockReductionGuard,
applySessionPlannerBlockDeletionTombstones,
getSessionPlannerDeletedBlockIds,
cloneSessionPlannerBlockMergeValue,
isSessionPlannerBlockFieldEmptyValue,
getSessionPlannerBlockFieldUpdatedAtMs,
markSessionPlannerBlockFieldsUpdated,
mergeSessionPlannerBlockForWrite,
filterSessionPlannerDeletedBlocksForWrite,
mergeSessionPlannerSessionForWrite,
cloneSessionPlannerState,
mergeSessionPlannerStateForWrite,
mergeSessionPlannerStateFromBackup,
} = createSessionPlannerStateMergeHelpers({
blockDeletionTombstoneKey: sessionPlannerBlockDeletionTombstoneKey,
blockFieldUpdatedAtKey: sessionPlannerBlockFieldUpdatedAtKey,
blockMergeFields: sessionPlannerBlockMergeFields,
blockMergeFieldSet: sessionPlannerBlockMergeFieldSet,
blockReductionGuardKey: sessionPlannerBlockReductionGuardKey,
blockReductionGuardMaxAgeMs: sessionPlannerBlockReductionGuardMaxAgeMs,
createBlock: createSessionPlannerBlock,
createEmptySession: createSessionPlannerEmptySession,
formatDateValue: formatScheduleDateValue,
getScheduledSessionTitleForDate,
getSessionPlannerState: () => sessionPlannerState,
normalizeBlockFieldMeta: normalizeSessionPlannerBlockFieldMeta,
parseTimestampMs: parseSessionPlannerTimestampMs,
shouldClearSessionForDate: shouldClearSessionPlannerSessionForDate,
});
const sessionPlannerRuntimeStateService = createSessionPlannerRuntimeStateService({
canWriteCentralBackedCache,
captureBoardHistoryFromState: () => captureSessionPlannerBoardHistoryFromState(),
clamp,
cloneState: cloneSessionPlannerState,
createDefaultState: createSessionPlannerDefaultState,
dataSafetySnapshotStoreName,
findWorkspaceFieldElements: () => Array.from(ui.sessionPlannerWorkspace?.querySelectorAll("[data-session-field]") || []),
formatMultiValue: formatSessionPlannerMultiValue,
getActiveWorkspaceId: () => hubState?.activeWorkspaceId || "",
getSelectedBlock: getSessionPlannerSelectedBlock,
getSessionPlannerState: () => sessionPlannerState,
logEvent,
markBlockFieldsUpdated: markSessionPlannerBlockFieldsUpdated,
mergeStateForWrite: mergeSessionPlannerStateForWrite,
mergeStateFromBackup: mergeSessionPlannerStateFromBackup,
openDataSafetyDatabase,
rawDataSafetyGetItem,
rawDataSafetySetItem,
recordDataSafetyWrite,
renderWorkspace: renderSessionPlannerWorkspace,
sessionPlannerAutosaveBoundary,
sessionPlannerMultiSelectFields,
sessionPlannerStorageKey,
setSessionPlannerState: (nextState) => { sessionPlannerState = nextState; },
showToast: showSessionPlannerToast,
win,
});
function assignSessionPlannerBlockFieldValue(...args) { return sessionPlannerRuntimeStateService.assignBlockFieldValue(...args); }
function syncSelectedSessionPlannerBlockFieldsFromDom(...args) { return sessionPlannerRuntimeStateService.syncSelectedBlockFieldsFromDom(...args); }
function readSessionPlannerState(...args) { return sessionPlannerRuntimeStateService.readState(...args); }
function persistNormalizedSessionPlannerState(...args) { return sessionPlannerRuntimeStateService.persistNormalizedState(...args); }
function findSessionPlannerStateInSnapshots(...args) { return sessionPlannerRuntimeStateService.findStateInSnapshots(...args); }
function queueSessionPlannerSnapshotRecovery(...args) { return sessionPlannerRuntimeStateService.queueSnapshotRecovery(...args); }
function writeSessionPlannerState(...args) { return sessionPlannerRuntimeStateService.writeState(...args); }
const {
captureFromState: captureSessionPlannerBoardHistoryFromState,
syncBaseline: syncSessionPlannerBoardHistoryBaseline,
syncBaselines: syncSessionPlannerBoardHistoryBaselines,
undo: undoSessionPlannerBoardHistory,
redo: redoSessionPlannerBoardHistory,
} = createSessionPlannerBoardHistoryController({
canEdit: canEditSessionPlanner,
clearTacticalSelection: clearSessionPlannerTacticalSelection,
cloneTacticalElement: cloneSessionPlannerTacticalElement,
getSelectedBlock: getSessionPlannerSelectedBlock,
getSelectedDate: () => sessionPlannerState?.selectedDate || "date",
markBlockFieldsUpdated: markSessionPlannerBlockFieldsUpdated,
normalizePlayerBoardColors: normalizeSessionPlannerPlayerBoardColors,
normalizePlayerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople,
normalizePlayerBoardPositions: normalizeSessionPlannerPlayerBoardPositions,
normalizeTacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId,
normalizeTacticalFrames: normalizeSessionPlannerTacticalFrames,
normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
renderWorkspace: renderSessionPlannerWorkspace,
resetTacticalDraftState: () => {
sessionPlannerLocalUiState.state.sessionPlannerTacticalPendingPoint = null;
sessionPlannerLocalUiState.state.sessionPlannerTacticalDraftLineState = null;
sessionPlannerLocalUiState.state.sessionPlannerTacticalSelectionState = null;
},
showToast: showSessionPlannerToast,
writeState: writeSessionPlannerState,
});
sessionPlannerWorkspaceController = createSessionPlannerWorkspaceController({
  assignSessionPlannerBlockFieldValue,
  assignSessionPlannerPlayerBoardAutoFormationTeams,
  assignSessionPlannerPlayerBoardFormationSlots,
  buildSessionPlannerSelectionAssistant,
  canEditSessionPlanner,
  clamp,
  clearSelectedSessionPlannerTacticalBoard,
  cloneSessionPlannerLibraryExercise,
  cloneSessionPlannerTacticalElement,
  cloneSessionPlannerTacticalFrame,
  compareMedicalPlayers,
  createSessionPlannerBlock,
  createSessionPlannerDefaultState,
  createSessionPlannerEmptySession,
  createSessionPlannerLineElement,
  createSessionPlannerPlayerBoardAutoTeamFormationSlots,
  createSessionPlannerPlayerBoardFormationSlots,
  createSessionPlannerPlayerProfileContract,
  createSessionPlannerReviewNoteFromBlock,
  createSessionPlannerReviewNoteId,
  createSessionPlannerStableId,
  createSessionPlannerTacticalController,
  createSessionPlannerVisualUploadHelpers,
  ensurePeriodizationState,
  ensurePlayerProfilesState,
  escapeHtml,
  formatScheduleDateValue,
  formatSessionPlannerHistoryTimeFromModule,
  getDashboardSessionTotalMinutes,
  getDefaultTacticalColor,
  getDefaultTacticalLineStyle,
  getElement,
  getMedicalAvailabilityItems,
  getPeriodizationDay,
  getPeriodizationMatchDayLabel,
  getPlatformAuthStore,
  getPlayerProfileRoleFitScore,
  getPlayerRoleDnaDefinition,
  getScheduleSessionEventForDate,
  getScheduledSessionTitleForDate,
  getSessionPlannerExerciseLibrary,
  getSessionPlannerExerciseReviewNotes,
  getSessionPlannerHistoryActionLabelFromModule,
  getSessionPlannerHistoryActorLabelFromModule,
  getSessionPlannerLibraryEditExercise,
  getSessionPlannerLibraryFolderById,
  getSessionPlannerLibraryNow,
  getSessionPlannerLibraryUserId,
  getSessionPlannerPlayerBoardCareerPhasePriority,
  getSessionPlannerPlayerBoardDataObject,
  getSessionPlannerPlayerBoardDefaultPosition,
  getSessionPlannerPlayerBoardNumericPriorityValue,
  getSessionPlannerPlayerBoardPlayerRoleProfile,
  getSessionPlannerPlayerBoardPositionGroup,
  getSessionPlannerPlayerBoardSourceLabel,
  getSessionPlannerPlayerBoardSquadStatusPriority,
  getSessionPlannerTacticalEndpointCoordinates,
  isCurrentPlatformUserAdmin,
  isMedicalPlayerBlockedBySquadAvailability,
  isSessionPlannerLibraryExerciseArchived,
  isSessionPlannerLibraryFolderArchived,
  isSessionPlannerTacticalGoalType,
  isSessionPlannerTacticalPlayerType,
  isTemporaryPlayerProfile,
  markSessionPlannerBlockDeleted,
  markSessionPlannerBlockFieldsUpdated,
  medicalAvailabilitySelectors,
  normalizePlayerProfileRole,
  normalizeSessionPlannerLibraryFolderExerciseIds,
  normalizeSessionPlannerPlayerBoardAutoMode,
  normalizeSessionPlannerPlayerBoardColors,
  normalizeSessionPlannerPlayerBoardCustomPeople,
  normalizeSessionPlannerPlayerBoardFormationValue,
  normalizeSessionPlannerPlayerBoardPositions,
  normalizeSessionPlannerPlayerBoardProfileKey,
  normalizeSessionPlannerPlayerBoardTeamCount,
  normalizeSessionPlannerTacticalActiveFrameId,
  normalizeSessionPlannerTacticalFrames,
  normalizeSessionPlannerTacticalPitchMode,
  normalizeSessionPlannerTacticalPlayerBadge,
  normalizeTacticalColor,
  normalizeTacticalLineStyle,
  normalizeTacticalLineWidth,
  normalizeTacticalRotation,
  parseScheduleDateValue,
  parseSessionPlannerPlayerBoardFormation,
  playerProfileRoleOptions,
  queueCentralStateWrite,
  rawDataSafetySetItem,
  readSessionPlannerState,
  readSessionPlannerStatePreservingUiSelection,
  renderSessionPlannerToast,
  sessionPlannerAutosaveBoundary,
  sessionPlannerBlockMergeFields,
  sessionPlannerMedicalAvailabilitySelectors,
  sessionPlannerPlayerBoardAutoModeOptions,
  sessionPlannerPlayerBoardColorOptions,
  sessionPlannerPlayerBoardMaxTeamCount,
  sessionPlannerPrintPaperOptions,
  sessionPlannerPrintRenderer,
  sessionPlannerPrintSectionOptions,
  sessionPlannerStorageKey,
  sessionPlannerTacticalMaxFrames,
  sessionPlannerTacticalSnapStep,
  sessionPlannerVisualRenderer,
  sessionPlannerWorkspaceRenderer,
  setSessionPlannerExerciseLibrary: (exercises) => {
    sessionPlannerExerciseLibrary = exercises;
  },
  setPlatformAutosaveStatusForKey,
  showSessionPlannerToast,
  syncSessionPlannerBoardHistoryBaseline,
  ui,
  undoSessionPlannerBoardHistory,
  win,
  writeSessionPlannerExerciseLibraryToStorage,
  writeSessionPlannerState,
  getSessionPlannerPeriodizationBridge: () => sessionPlannerPeriodizationBridge,
  getLocalState: () => ({
    ...sessionPlannerLocalUiState.getState(),
    sessionPlannerState,
  }),
  setLocalState: (patch = {}) => {
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerState")) sessionPlannerState = patch.sessionPlannerState;
    sessionPlannerLocalUiState.applyPatch(patch);
  },
});
const profileStaffWorkspaceController = createProfileStaffWorkspaceController({
getActiveWorkspaceId: () => hubState?.activeWorkspaceId,
getAssignableRolesForUser,
getCurrentUser: getCurrentPlatformUser,
getScopedUsers: getScopedPlatformUsers,
getSelectedStaffUserId: () => selectedStaffUserId,
getStaffCreateUserEditorOpen: () => staffCreateUserEditorOpen,
getTeamId: getUserTeamId,
getUi: () => ui,
getUserProfileImageUrl,
getUsers: getPlatformUsers,
isAdmin: isCurrentPlatformUserAdmin,
profileWorkspaceRenderer,
readDashboardTasks,
renderAdminRoleOptions,
renderAdminTeamOptions,
setSelectedStaffUserId: (userId) => {
selectedStaffUserId = userId;
},
staffWorkspaceRenderer,
syncStructure: syncPlatformStructureWithUsers,
win,
});
function renderProfileWorkspace(message = "") { return profileStaffWorkspaceController.renderProfileWorkspace(message); }
function getPlatformFormValues(form) { return readPlatformFormValues(form); }
function getPasswordValidationMessage(values = {}) {
return getPlatformPasswordValidationMessage(values);
}
function stripPasswordConfirmation(values = {}) {
return stripPlatformPasswordConfirmation(values);
}
function createProfileImageDataUrl(file) {
return createProfileImageDataUrlFromModule(file, {
documentRef: document,
ImageCtor: Image,
maxUploadDataUrlLength: maxProfileImageUploadDataUrlLength,
URLRef: URL,
});
}
function hasUserFieldConflict(userId, values) {
const username = String(values?.username || "").trim().toLowerCase();
const email = String(values?.email || "").trim().toLowerCase();
if (!username && !email) {
return false;
}
return getPlatformUsers().some(
(user) =>
user.id !== userId &&
(
(username && String(user.username || "").toLowerCase() === username) ||
(email && String(user.email || "").toLowerCase() === email)
)
);
}
function buildUserCredentialMessage(user, temporaryPassword = "") { return buildPlatformUserCredentialMessage(user, temporaryPassword); }
async function openCredentialsMailto(user, temporaryPassword = "") {
const body = buildUserCredentialMessage(user, temporaryPassword);
const recipient = (user.email || "").trim();
const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent("Your Football Science login")}&body=${encodeURIComponent(
    body
  )}`;
const copyText = [
"Website: https://footballscience.xyz/",
`Username: ${user.username}`,
`Email: ${user.email}`,
temporaryPassword ? `Temporary password: ${temporaryPassword}` : "",
].filter(Boolean).join("\n");
let copied = false;
if (win.navigator?.clipboard?.writeText) {
try {
await win.navigator.clipboard.writeText(copyText);
copied = true;
} catch {
}
}
win.location.href = mailto;
return { copied, copyText };
}
function buildTemporaryLoginMessage(user, temporaryPassword, copied = false) { return buildPlatformTemporaryLoginMessage(user, temporaryPassword, copied); }
function getAdminManagedWorkspaces() {
return topIconMenuOrder
.map((workspaceId) => getWorkspaceByIdFromPool(workspaceId))
.filter((workspace) => workspace && !workspace.hiddenFromNav);
}
function renderStaffWorkspace(message = "") { return profileStaffWorkspaceController.renderStaffWorkspace(message); }
function getAdminUsersForTeam(users = [], teamId = "", structure = getPlatformStructureState()) {
const normalizedTeamId = normalizePlatformStructureText(teamId, "");
return users.filter((user) => !hasPlatformWorkspaceScope(user) && getUserTeamId(user, structure) === normalizedTeamId);
}
function getAdminUserInitials(user = {}) {
return getAdminUserInitialsFromModule(user, {
formatUserName,
normalizeText: normalizePlatformStructureText,
});
}
function createAdminClubFromForm(form) {
const currentUser = getCurrentPlatformUser();
if (!form || !isPlatformAdminUser(currentUser)) {
renderAdminWorkspace("Platform admin required.");
return;
}
const values = getPlatformFormValues(form);
const clubName = normalizePlatformStructureText(values.clubName, "");
if (!clubName) {
renderAdminWorkspace("Club name is required.");
return;
}
if (isLegacyPlatformStructureValue(clubName)) {
renderAdminWorkspace("Football Science Live is a legacy workspace label, not a club.");
return;
}
const structure = readPlatformStructureState();
const existingClub = structure.clubs.find((club) => club.name.toLowerCase() === clubName.toLowerCase());
if (existingClub) {
renderAdminWorkspace("Club already exists.");
return;
}
const clubIds = new Set(structure.clubs.map((club) => club.id));
const club = normalizePlatformClub({
id: createPlatformStructureId("club", clubName, clubIds),
name: clubName,
shortName: clubName,
});
structure.clubs.push(club);
structure.activeClubId = club.id;
writePlatformStructureState(structure);
renderAdminWorkspace("Club added.");
}
function createAdminTeamFromForm(form) {
const currentUser = getCurrentPlatformUser();
if (!form || !(isPlatformAdminUser(currentUser) || normalizePlatformRole(currentUser?.role, "") === "club-admin")) {
renderAdminWorkspace("Club admin access required.");
return;
}
const values = getPlatformFormValues(form);
const structure = readPlatformStructureState();
const allowedClubs = getScopedPlatformClubs(currentUser, structure);
const club = allowedClubs.find((candidate) => candidate.id === values.clubId) || allowedClubs[0];
const teamName = normalizePlatformStructureText(values.teamName, "");
if (!club || !teamName) {
renderAdminWorkspace("Team name is required.");
return;
}
if (isLegacyPlatformStructureValue(teamName)) {
renderAdminWorkspace("Football Science Live is a legacy workspace label, not a team.");
return;
}
const existingTeam = structure.teams.find(
(team) => team.clubId === club.id && team.name.toLowerCase() === teamName.toLowerCase()
);
if (existingTeam) {
renderAdminWorkspace("Team already exists.");
return;
}
const teamIds = new Set(structure.teams.map((team) => team.id));
const team = normalizePlatformTeam({
id: createPlatformStructureId("team", `${club.name}-${teamName}`, teamIds),
clubId: club.id,
name: teamName,
shortName: teamName,
});
structure.teams.push(team);
structure.activeClubId = club.id;
structure.activeTeamId = team.id;
writePlatformStructureState(structure);
renderAdminWorkspace("Team added.");
}
async function loadAdminAuditLog(options = {}) {
if (adminAuditLoading) {
return;
}
const force = Boolean(options.force);
if (!force && adminAuditLoadedAt && Date.now() - adminAuditLoadedAt < 60000) {
return;
}
const authStore = getPlatformAuthStore();
if (!authStore?.getAuditLog) {
adminAuditLoadError = "Audit log is not ready yet.";
return;
}
adminAuditLoading = true;
adminAuditLoadError = "";
try {
const result = await authStore.getAuditLog(80);
if (!result?.ok) {
adminAuditLoadError = result?.reason || "Audit log could not be loaded.";
return;
}
adminAuditEntries = Array.isArray(result.entries) ? result.entries : [];
adminAuditLoadedAt = Date.now();
} catch (error) {
adminAuditLoadError = error?.message || "Audit log could not be loaded.";
} finally {
adminAuditLoading = false;
if (hubState?.activeWorkspaceId === "admin") {
renderAdminWorkspace();
}
}
}
async function loadPlatformReadinessReport(options = {}) {
if (platformReadinessLoading) {
return;
}
const force = Boolean(options.force);
if (!force && platformReadinessLoadedAt && Date.now() - platformReadinessLoadedAt < 60000) {
return;
}
platformReadinessLoading = true;
platformReadinessLoadError = "";
const token = await getPlatformApiAccessToken();
if (!token) {
platformReadinessLoadError = "Admin session required.";
platformReadinessLoading = false;
if (hubState?.activeWorkspaceId === "admin") {
renderAdminWorkspace();
}
return;
}
try {
const response = await fetch("/api/platform-readiness", {
headers: {
Authorization: `Bearer ${token}`,
},
cache: "no-store",
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload?.ok === false) {
platformReadinessLoadError = payload?.reason || `Platform readiness failed (${response.status}).`;
return;
}
platformReadinessReport = payload.report || null;
platformReadinessLoadedAt = Date.now();
} catch (error) {
platformReadinessLoadError = error?.message || "Platform readiness could not be loaded.";
} finally {
platformReadinessLoading = false;
if (hubState?.activeWorkspaceId === "admin") {
renderAdminWorkspace();
}
}
}
async function publishPlatformAppearanceConfig(config, message = "Published.") {
if (!isPlatformAdminUser(getCurrentPlatformUser())) {
renderAdminWorkspace("Platform admin required.");
return;
}
writePlatformAppearanceState(config);
await flushCentralStateWrites();
renderDashboardCards();
renderAdminWorkspace(message);
}
function getAdminTransferRoomAccessTeamId(state = ensureTransferRoomState(), structure = getPlatformStructureState()) {
const fallbackTeamId = state.activeTeamId || state.settings?.activeTeamId || platformDefaultTeamId;
const team =
(state.teams || []).find((item) => item.id === fallbackTeamId) ||
getPlatformTeamById(fallbackTeamId, structure) ||
(state.teams || [])[0] ||
{};
return team.id || fallbackTeamId;
}
function renderAdminWorkspace(message = "") {
if (!ui.adminWorkspace) {
return;
}
if (!isCurrentPlatformUserAdmin()) {
ui.adminWorkspace.innerHTML = adminWorkspaceRenderer.renderNotAdmin();
return;
}
const allUsers = getPlatformUsers();
const currentUser = getCurrentPlatformUser();
const structure = syncPlatformStructureWithUsers(allUsers);
const users = getScopedPlatformUsers(allUsers, currentUser, structure);
const currentUserIsPlatformAdmin = isPlatformAdminUser(currentUser);
const roles = getPlatformRoles();
if (currentUserIsPlatformAdmin && !adminAuditLoadedAt && !adminAuditLoading) {
loadAdminAuditLog().catch(() => {});
}
if (currentUserIsPlatformAdmin && !platformReadinessLoadedAt && !platformReadinessLoading && !platformReadinessLoadError) {
loadPlatformReadinessReport().catch(() => {});
}
const selectedUser =
users.find((adminUser) => adminUser.id === selectedAdminUserId) ??
users.find((adminUser) => adminUser.id === currentUser?.id) ??
users[0] ??
null;
selectedAdminUserId = selectedUser?.id ?? null;
const selectedUserIsSelf = Boolean(selectedUser?.id && selectedUser.id === currentUser?.id);
const canManageSelectedUser = Boolean(selectedUser && canAdminManageUser(currentUser, selectedUser, structure));
const canRemoveSelectedUser = Boolean(selectedUser && canAdminManageUser(currentUser, selectedUser, structure, { remove: true }));
const selectedUserFieldDisabled = canManageSelectedUser ? "" : "disabled";
const assignableRoles = getAssignableRolesForUser(currentUser);
const createRole = assignableRoles.includes("scout")
? "scout"
: assignableRoles.includes("coach")
? "coach"
: assignableRoles[0];
const createUserTeamId = adminCreateUserTeamId || getUserTeamId(currentUser, structure);
const createUserTeam = getPlatformTeamById(createUserTeamId, structure);
const createUserClub = createUserTeam ? getPlatformClubById(createUserTeam.clubId, structure) : null;
ui.adminWorkspace.innerHTML = adminWorkspaceRenderer.renderWorkspace({
adminAuditLoadedAt,
adminCreateUserEditorOpen,
adminUserEditorOpen,
canManageSelectedUser,
canRemoveSelectedUser,
createRole,
createUserClub,
createUserTeam,
createUserTeamId,
currentUser,
currentUserIsPlatformAdmin,
message,
roles,
selectedUser,
selectedUserFieldDisabled,
selectedUserIsSelf,
selectedUserTeamId: selectedUser ? getUserTeamId(selectedUser, structure) : "",
structure,
users,
});
}
function isMedicalDateValue(dateValue) {
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))) {
return false;
}
const parsedDate = parseScheduleDateValue(dateValue);
return formatScheduleDateValue(parsedDate) === dateValue;
}
const medicalRuntimeHelpers = createMedicalRuntimeHelpers({
addCalendarDays,
clamp,
createId: createDashboardId,
formatDateValue: formatScheduleDateValue,
getActivityContext: getMedicalRecommendationActivityContext,
getCurrentUser: getCurrentPlatformUser,
getPlayerProfilesState: () => playerProfilesState || readPlayerProfilesState(),
isDateValue: isMedicalDateValue,
medicalClearanceRoles,
medicalDataSafetySyncStatusOptions,
medicalGateOptions,
medicalInjuryPlanStatusOptions,
medicalLoadGateOptions,
medicalOptionSelectors,
medicalPositionAliases,
medicalPositionOrder,
medicalRtpPhaseOptions,
medicalStatusOptions,
parseDateValue: parseScheduleDateValue,
playerProfileStatusOptions,
normalizePlayerProfileName,
normalizePlayerProfileRole,
normalizePlayerProfileRoleList,
normalizePlayerProfileRosterType,
normalizePlayerProfileTemporaryDate,
playerProfileRosterTypeCountsInSquad,
});
const {
compareMedicalPlayers,
getCurrentMedicalActorId,
getMedicalCanonicalPositionFromText,
getMedicalClearanceValues,
getMedicalDataSafetyCounts,
getMedicalEntityUpdatedMs,
getMedicalGateOption,
getMedicalLoadGateValues,
getMedicalLinkedPlayerProfile,
getMedicalPlayerAvailabilityStatus,
getMedicalPlayerAvailabilityStatusOption,
getMedicalPlayerNumberRank,
getMedicalPlayerPositionRank,
getMedicalPlayerRosterOrder,
getMedicalPlayerSquadAvailabilityBlockReason,
getMedicalRtpPhaseForRecommendation,
getMedicalRtpPhaseOption,
getMedicalStatusActivityType,
getMedicalStatusForParticipation,
getMedicalStatusOption,
getMedicalStatusOptionForActivity,
getMedicalStatusOptionForDate: getMedicalStatusOptionForDateFromHelper,
getMedicalTimestampMs,
isMedicalItemArchived,
isMedicalPlayerBlockedBySquadAvailability,
normalizeMedicalActualParticipation,
normalizeMedicalClearance,
normalizeMedicalDataSafety,
normalizeMedicalGovernancePolicy,
normalizeMedicalInjuryPlan,
normalizeMedicalLoadGates,
normalizeMedicalParticipation,
normalizeMedicalPlayer,
normalizeMedicalPlayerAvailabilityStatus,
normalizeMedicalPlayerPosition,
normalizeMedicalPositionText,
normalizeMedicalShareValue,
normalizeMedicalTimestamp,
normalizeMedicalRecord,
sanitizeMedicalGovernancePolicyForCoachView,
} = medicalRuntimeHelpers;
let medicalRuntimeStateService = createMedicalRuntimeStateService({
archiveMedicalPlayersRemovedFromSquad,
canEditMedicalTeam,
compareMedicalPlayers,
defaultMedicalPlayers,
formatDateValue: formatScheduleDateValue,
getCurrentMedicalActorId,
getCurrentPlatformUser,
getMedicalLinkedPlayerProfile,
getMedicalRecommendationActivityContext,
getMedicalRtpPhaseForRecommendation,
getMedicalState: () => medicalState,
getMedicalStatusForParticipation,
getMedicalStatusOptionForDateFromHelper,
isMedicalDateValue,
logEvent,
medicalActualParticipationFallback,
medicalDefaultRosterVersion,
medicalRtpPhaseOptions,
medicalStatusOptions,
medicalTeamStorageKey,
normalizeMedicalDataSafety,
normalizeMedicalGovernancePolicy,
normalizeMedicalInjuryPlan,
normalizeMedicalParticipation,
normalizeMedicalPlayer,
normalizeMedicalPlayerAvailabilityStatus,
normalizeMedicalRecord,
normalizeMedicalShareValue,
rawDataSafetySetItem,
sanitizeMedicalGovernancePolicyForCoachView,
setMedicalState: (nextState) => {
medicalState = nextState;
},
win,
});
function getMedicalStatusOptionForDate(...args) { return medicalRuntimeStateService.getMedicalStatusOptionForDate(...args); }
function syncMedicalPlayerAvailabilityStatusesFromProfiles(...args) { return medicalRuntimeStateService.syncMedicalPlayerAvailabilityStatusesFromProfiles(...args); }
function markMedicalClinicalChange(...args) { return medicalRuntimeStateService.markMedicalClinicalChange(...args); }
function commitMedicalClinicalState(...args) { return medicalRuntimeStateService.commitMedicalClinicalState(...args); }
function updateMedicalDatabaseSyncStatus(...args) { return medicalRuntimeStateService.updateMedicalDatabaseSyncStatus(...args); }
function cloneMedicalState(...args) { return medicalRuntimeStateService.cloneMedicalState(...args); }
function canViewPrivateMedicalDetails(...args) { return medicalRuntimeStateService.canViewPrivateMedicalDetails(...args); }
function sanitizeMedicalRecordForCoachView(...args) { return medicalRuntimeStateService.sanitizeMedicalRecordForCoachView(...args); }
function sanitizeMedicalInjuryPlanForCoachView(...args) { return medicalRuntimeStateService.sanitizeMedicalInjuryPlanForCoachView(...args); }
function sanitizeMedicalStateForCurrentUser(...args) { return medicalRuntimeStateService.sanitizeMedicalStateForCurrentUser(...args); }
function setMedicalStateStorageValue(...args) { return medicalRuntimeStateService.setMedicalStateStorageValue(...args); }
function readMedicalState(...args) { return medicalRuntimeStateService.readMedicalState(...args); }
function writeMedicalState(...args) { return medicalRuntimeStateService.writeMedicalState(...args); }
function ensureMedicalState(...args) { return medicalRuntimeStateService.ensureMedicalState(...args); }
playerProfileRuntimeStateService = createPlayerProfileRuntimeStateService({
canCurrentUserEditWorkspace,
comparePlayerProfiles,
createDashboardId,
defaultMedicalPlayers,
ensureMedicalState,
fetchFn: (...args) => fetch(...args),
flushPlayerProfileAutosave,
getCurrentPlatformUser,
getDefaultPlayerProfileRole,
getHubState: () => hubState,
getMedicalState: () => medicalState,
getNow: () => new Date().toISOString(),
getPlatformApiAccessToken,
getPlatformStructureState,
getPlatformTeamDisplayName,
getPlatformTeamDisplayTeam,
getPlayerProfileAgeCacheKey,
getPlayerProfileAgeCacheState: () => playerProfileAgeCacheState,
getPlayerProfileAgeHydrationLastFingerprint: () => playerProfileAgeHydrationLastFingerprint,
getPlayerProfileAgeHydrationPending: () => playerProfileAgeHydrationPending,
getPlayerProfileAgeHydrationTimer: () => playerProfileAgeHydrationTimer,
getPlayerProfileAgeLookupSignature,
getPlayerProfileBirthDateValue,
getPlayerProfileFormSignature,
getPlayerProfileModalOpen: () => playerProfileModalOpen,
getPlayerProfileNewPlayerModalOpen: () => playerProfileNewPlayerModalOpen,
getPlayerProfileRoleGroupForRole,
getPlayerProfileRosterTypeOption,
getPlayerProfileSyncIdentityKeys,
getPlayerProfilesState: () => playerProfilesState,
getPlayerProfilesWorkspace: () => ui.playerProfilesWorkspace,
getSquadChangeSummary,
getTemporaryRosterTypeFromPlayerSource,
isCurrentPlatformUserAdmin,
isMedicalItemArchived,
isTemporaryPlayerProfile,
logEvent,
normalizePlayerProfile,
normalizePlayerProfileAgeCacheEntry,
normalizePlayerProfileAgeValue,
normalizePlayerProfileBirthDate,
normalizePlayerProfileChangeLog,
normalizePlayerProfileChangeLogEntry,
normalizePlayerProfileRemovedIds,
playerProfileAgeCacheStorageKey,
playerProfileCountsInSquad,
playerProfilesDefaultRosterVersion,
playerProfilesSchemaVersion,
playerProfilesStorageKey,
rawDataSafetySetItem,
renderPlayerProfilesRosterListOnly,
renderPlayerProfilesWorkspace,
setPlayerProfileAgeCacheState: (nextState) => {
playerProfileAgeCacheState = nextState;
},
setPlayerProfileAgeHydrationLastFingerprint: (nextFingerprint) => {
playerProfileAgeHydrationLastFingerprint = nextFingerprint;
},
setPlayerProfileAgeHydrationPending: (nextPending) => {
playerProfileAgeHydrationPending = Boolean(nextPending);
},
setPlayerProfileAgeHydrationTimer: (nextTimer) => {
playerProfileAgeHydrationTimer = nextTimer;
},
setPlayerProfileAutosaveLastSignature: (nextSignature) => {
playerProfileAutosaveLastSignature = nextSignature;
},
setPlayerProfileModalOpen: (nextOpen) => {
playerProfileModalOpen = Boolean(nextOpen);
},
setPlayerProfileNewPlayerModalOpen: (nextOpen) => {
playerProfileNewPlayerModalOpen = Boolean(nextOpen);
},
setPlayerProfilesState: (nextState) => {
playerProfilesState = nextState;
},
win,
});
function readPlayerProfileAgeCache(...args) { return playerProfileRuntimeStateService.readPlayerProfileAgeCache(...args); }
function ensurePlayerProfileAgeCache(...args) { return playerProfileRuntimeStateService.ensurePlayerProfileAgeCache(...args); }
function writePlayerProfileAgeCache(...args) { return playerProfileRuntimeStateService.writePlayerProfileAgeCache(...args); }
function getPlayerProfileAgeCacheEntry(...args) { return playerProfileRuntimeStateService.getPlayerProfileAgeCacheEntry(...args); }
function getCurrentSquadActorLabel(...args) { return playerProfileRuntimeStateService.getCurrentSquadActorLabel(...args); }
function recordPlayerProfileChange(...args) { return playerProfileRuntimeStateService.recordPlayerProfileChange(...args); }
function getPlayerProfileChangeLog(...args) { return playerProfileRuntimeStateService.getPlayerProfileChangeLog(...args); }
function getRecentPlayerProfileChangeLog(...args) { return playerProfileRuntimeStateService.getRecentPlayerProfileChangeLog(...args); }
function clonePlayerProfilesState(...args) { return playerProfileRuntimeStateService.clonePlayerProfilesState(...args); }
function buildPlayerProfileFromMedicalTrainingGuest(...args) { return playerProfileRuntimeStateService.buildPlayerProfileFromMedicalTrainingGuest(...args); }
function syncPlayerProfilesFromMedicalTrainingGuests(...args) { return playerProfileRuntimeStateService.syncPlayerProfilesFromMedicalTrainingGuests(...args); }
function readPlayerProfilesState(...args) { return playerProfileRuntimeStateService.readPlayerProfilesState(...args); }
function writePlayerProfilesState(...args) { return playerProfileRuntimeStateService.writePlayerProfilesState(...args); }
function getPlayerProfileAgeHydrationCandidates(...args) { return playerProfileRuntimeStateService.getPlayerProfileAgeHydrationCandidates(...args); }
function buildPlayerProfileAgeHydrationPayload(...args) { return playerProfileRuntimeStateService.buildPlayerProfileAgeHydrationPayload(...args); }
function mergePlayerProfileAgeHydrationResult(...args) { return playerProfileRuntimeStateService.mergePlayerProfileAgeHydrationResult(...args); }
function hydratePlayerProfileAgesOnce(...args) { return playerProfileRuntimeStateService.hydratePlayerProfileAgesOnce(...args); }
function queuePlayerProfileAgeHydration(...args) { return playerProfileRuntimeStateService.queuePlayerProfileAgeHydration(...args); }
function ensurePlayerProfilesState(...args) { return playerProfileRuntimeStateService.ensurePlayerProfilesState(...args); }
function canEditPlayerProfiles(...args) { return playerProfileRuntimeStateService.canEditPlayerProfiles(...args); }
function getPlayerProfilesAccessLabel(...args) { return playerProfileRuntimeStateService.getPlayerProfilesAccessLabel(...args); }
function getSelectedPlayerProfile(...args) { return playerProfileRuntimeStateService.getSelectedPlayerProfile(...args); }
function openPlayerProfileModal(...args) { return playerProfileRuntimeStateService.openPlayerProfileModal(...args); }
function closePlayerProfileModal(...args) { return playerProfileRuntimeStateService.closePlayerProfileModal(...args); }
function openPlayerProfileNewPlayerModal(...args) { return playerProfileRuntimeStateService.openPlayerProfileNewPlayerModal(...args); }
function closePlayerProfileNewPlayerModal(...args) { return playerProfileRuntimeStateService.closePlayerProfileNewPlayerModal(...args); }
let squadMedicalStatusService = null;
function getLatestManualMedicalLog(...args) { return squadMedicalStatusService.getLatestManualMedicalLog(...args); }
function getPlayerProfileMedicalStatusOverride(...args) { return squadMedicalStatusService.getPlayerProfileMedicalStatusOverride(...args); }
function getPlayerProfileEffectiveStatusFromSnapshot(...args) { return squadMedicalStatusService.getPlayerProfileEffectiveStatusFromSnapshot(...args); }
function getPlayerProfileEffectiveStatus(...args) { return squadMedicalStatusService.getPlayerProfileEffectiveStatus(...args); }
function getPlayerProfileMedicalSnapshot(...args) { return squadMedicalStatusService.getPlayerProfileMedicalSnapshot(...args); }
function getVisiblePlayerProfiles() {
ensurePlayerProfilesState();
return playerProfileRosterUiSelectors.getVisibleProfiles(playerProfilesState.players, {
query: playerProfilesSearchQuery,
roleGroupFilter: playerProfilesRoleGroupFilter,
rosterFilter: playerProfilesRosterFilter,
});
}
function getAllTemporaryPlayerProfiles() {
ensurePlayerProfilesState();
return playerProfileRosterUiSelectors.getTemporaryProfiles(playerProfilesState.players);
}
function renderPlayerProfileStatusChip(statusKey, medicalSnapshot = null) { return squadRosterRenderer.renderStatusChip(statusKey, medicalSnapshot); }
function renderSquadRosterSections(visiblePlayers = [], summaries = {}) {
return squadRosterRenderer.renderRosterSections(visiblePlayers, summaries);
}
function renderPlayerProfilesRosterListOnly() {
ensurePlayerProfilesState();
const listPanel = ui.playerProfilesWorkspace?.querySelector(".squad-list-panel");
if (!listPanel) {
renderPlayerProfilesWorkspace();
return;
}
const visiblePlayers = getVisiblePlayerProfiles();
listPanel.innerHTML = renderSquadRosterSections(visiblePlayers, {
rosterSummary: getPlayerProfilesRosterSummary(playerProfilesState.players),
visibleSummary: getPlayerProfilesRosterSummary(visiblePlayers),
});
queuePlayerProfileAgeHydration();
}
playerProfileRuntimeImportService = createPlayerProfileRuntimeImportService({
buildPlayerProfileImportFeedbackMessage,
buildPlayerProfileImportPlan,
buildPlayerProfileImportPreviewMessage,
canEditPlayerProfiles,
cloneMedicalState,
clonePlayerProfilesState,
comparePlayerProfiles,
ensureMedicalState,
ensurePlayerProfilesState,
FileReaderCtor: win.FileReader || (typeof FileReader !== "undefined" ? FileReader : null),
getCurrentSquadActorLabel,
getMedicalState: () => medicalState,
getNow: () => new Date().toISOString(),
getPendingPlayerProfileImportPlan: () => pendingPlayerProfileImportPlan,
getPlayerProfileImportUndoHistoryState: () => playerProfileImportUndoHistory,
getPlayerProfileImportUndoRelativeTimeLabel,
getPlayerProfileLastImportSnapshot: () => playerProfileLastImportSnapshot,
getPlayerProfilesState: () => playerProfilesState,
getRecentPlayerProfileChangeLog,
normalizePlayerProfileRemovedIds,
playerProfileImportUndoHistoryLimit,
recordPlayerProfileChange,
renderPendingPlayerProfileImport: (plan, preview, canEdit) => squadWorkspaceRenderer.renderPendingImport(plan, preview, canEdit),
renderPlayerProfilesWorkspace,
setMedicalState: (nextState) => {
medicalState = nextState;
},
setPendingPlayerProfileImportPlan: (nextPlan) => {
pendingPlayerProfileImportPlan = nextPlan;
},
setPlayerProfileImportUndoHistoryState: (nextHistory) => {
playerProfileImportUndoHistory = nextHistory;
},
setPlayerProfileLastImportSnapshot: (nextSnapshot) => {
playerProfileLastImportSnapshot = nextSnapshot;
},
setPlayerProfilesState: (nextState) => {
playerProfilesState = nextState;
},
syncMedicalPlayersFromPlayerProfiles,
writeMedicalState,
writePlayerProfilesState,
});
function buildPlayerProfileImportFeedback(...args) { return playerProfileRuntimeImportService.buildPlayerProfileImportFeedback(...args); }
function createPlayerProfileImportUndoSnapshot(...args) { return playerProfileRuntimeImportService.createPlayerProfileImportUndoSnapshot(...args); }
function clearPlayerProfileImportUndoSnapshots(...args) { return playerProfileRuntimeImportService.clearPlayerProfileImportUndoSnapshots(...args); }
function registerPlayerProfileImportUndoSnapshot(...args) { return playerProfileRuntimeImportService.registerPlayerProfileImportUndoSnapshot(...args); }
function getPlayerProfileImportUndoHistory(...args) { return playerProfileRuntimeImportService.getPlayerProfileImportUndoHistory(...args); }
function getPlayerProfileImportUndoState(...args) { return playerProfileRuntimeImportService.getPlayerProfileImportUndoState(...args); }
function applyPlayerProfileImportUndo(...args) { return playerProfileRuntimeImportService.applyPlayerProfileImportUndo(...args); }
function importSquadDataFoundationPayload(...args) { return playerProfileRuntimeImportService.importSquadDataFoundationPayload(...args); }
function importSquadDataFoundationFile(...args) { return playerProfileRuntimeImportService.importSquadDataFoundationFile(...args); }
function renderPendingPlayerProfileImport(...args) { return playerProfileRuntimeImportService.renderPendingPlayerProfileImport(...args); }
function renderPlayerProfilesWorkspace(message = "") {
if (!ui.playerProfilesWorkspace) {
return;
}
ensurePlayerProfilesState();
ensureMedicalState();
syncPlayerProfilesFromMedicalTrainingGuests();
const visiblePlayers = getVisiblePlayerProfiles();
const selectedPlayer = getSelectedPlayerProfile();
const rosterSummary = getPlayerProfilesRosterSummary(playerProfilesState.players);
const visibleSummary = getPlayerProfilesRosterSummary(visiblePlayers);
const platformStructure = getPlatformStructureState();
const currentPlatformUser = getCurrentPlatformUser();
const squadTeam = getPlatformTeamDisplayTeam(currentPlatformUser, platformStructure);
const squadTeamName = squadTeam?.name || getPlatformTeamDisplayName(currentPlatformUser, platformStructure);
ui.playerProfilesWorkspace.innerHTML = squadWorkspaceRenderer.renderWorkspace({
canEdit: canEditPlayerProfiles(),
messageMarkup: message ? renderPlayerProfilesWorkspaceMessage(message) : "",
newPlayerModalMarkup: squadProfileSupportRenderer.renderNewPlayerModal(),
pendingImportMarkup: renderPendingPlayerProfileImport(),
playerModalMarkup: squadProfileSelectedRenderer.renderModal(selectedPlayer),
roleGroupFilter: playerProfilesRoleGroupFilter,
roleGroupOptionsMarkup: squadProfileSupportRenderer.renderOptionSet(playerProfileRoleGroupOptions, playerProfilesRoleGroupFilter),
rosterFilterOptionsMarkup: squadProfileSupportRenderer.renderOptionSet(playerProfileRosterFilterOptions, playerProfilesRosterFilter),
rosterSectionsMarkup: renderSquadRosterSections(visiblePlayers, { rosterSummary, visibleSummary }),
searchQuery: playerProfilesSearchQuery,
teamLogoMarkup: renderPlatformTeamLogoMark(squadTeam || { name: squadTeamName }, { teamName: squadTeamName, canUpload: canEditPlayerProfiles() }),
teamName: squadTeamName,
});
queuePlayerProfileAgeHydration();
}
function getPlayerProfileFormSignature(form) { try { return form ? JSON.stringify(getPlayerProfileFormValues(form)) : ""; } catch { return ""; } }
function savePlayerProfileEditForm(form) {
if (!form || !canEditPlayerProfiles()) return null;
const values = getPlayerProfileFormValues(form);
if (!values.playerId) return null;
const signature = JSON.stringify(values);
if (signature && signature === playerProfileAutosaveLastSignature) return { ok: true, skipped: true };
const result = updatePlayerProfile(values);
if (result?.ok) playerProfileAutosaveLastSignature = getPlayerProfileFormSignature(form);
return result;
}
function queuePlayerProfileAutosave(form, delayMs = 420) { if (!form || !canEditPlayerProfiles()) return; win.clearTimeout(playerProfileAutosaveTimer); playerProfileAutosaveTimer = win.setTimeout(() => { playerProfileAutosaveTimer = 0; savePlayerProfileEditForm(form); }, delayMs); } function flushPlayerProfileAutosave() { const form = ui.playerProfilesWorkspace?.querySelector("#playerProfileEditForm"); win.clearTimeout(playerProfileAutosaveTimer); playerProfileAutosaveTimer = 0; return savePlayerProfileEditForm(form); }
playerProfileRuntimeMedicalSyncService = createPlayerProfileRuntimeMedicalSyncService({
canViewPrivateMedicalDetails,
commitMedicalClinicalState,
createDashboardId,
ensureMedicalState,
ensurePlayerProfilesState,
getActiveMedicalPlayers,
getCurrentMedicalActorId,
getMedicalState: () => medicalState,
getNow: () => new Date().toISOString(),
isMedicalItemArchived,
normalizeMedicalInjuryPlan,
normalizeMedicalPlayer,
normalizeMedicalRecord,
normalizePlayerProfileName,
normalizePlayerProfileRemovedIds,
setMedicalState: (nextState) => {
medicalState = nextState;
},
upsertMedicalPlayers,
writeMedicalState,
});
function buildMedicalPlayerFromPlayerProfile(...args) { return playerProfileRuntimeMedicalSyncService.buildMedicalPlayerFromPlayerProfile(...args); }
function syncMedicalPlayersFromPlayerProfiles(...args) { return playerProfileRuntimeMedicalSyncService.syncMedicalPlayersFromPlayerProfiles(...args); }
function getMedicalPlayersMatchingPlayerProfile(...args) { return playerProfileRuntimeMedicalSyncService.getMedicalPlayersMatchingPlayerProfile(...args); }
function getMedicalRemovedSquadPlayerIdSet(...args) { return playerProfileRuntimeMedicalSyncService.getMedicalRemovedSquadPlayerIdSet(...args); }
function isMedicalPlayerRemovedFromSquad(...args) { return playerProfileRuntimeMedicalSyncService.isMedicalPlayerRemovedFromSquad(...args); }
function archiveMedicalPlayersRemovedFromSquad(...args) { return playerProfileRuntimeMedicalSyncService.archiveMedicalPlayersRemovedFromSquad(...args); }
function archiveMedicalPlayersForRemovedPlayerProfile(...args) { return playerProfileRuntimeMedicalSyncService.archiveMedicalPlayersForRemovedPlayerProfile(...args); }
playerProfileRuntimeWriteService = createPlayerProfileRuntimeWriteService({
archiveMedicalPlayersForRemovedPlayerProfile,
comparePlayerProfiles,
ensurePlayerProfilesState,
formatPlayerProfileChangeValue,
getNow: () => new Date().toISOString(),
getPlayerProfileChangeDiffs,
getPlayerProfileRoleGroupForRole,
getPlayerProfilesState: () => playerProfilesState,
isCurrentPlatformUserAdmin,
normalizePlayerProfile,
normalizePlayerProfileRemovedIds,
normalizePlayerProfileRole,
normalizePlayerProfileRosterType,
playerProfileRoleGroupOptions,
playerProfileRosterTypeCountsInSquad,
playerProfileRosterTypeOptions,
playerProfileSquadStatusOptions,
recordPlayerProfileChange,
setPlayerProfilesState: (nextState) => {
playerProfilesState = nextState;
},
syncMedicalPlayersFromPlayerProfiles,
validatePlayerProfileFormValues,
writePlayerProfilesState,
});
function addPlayerProfile(...args) { return playerProfileRuntimeWriteService.addPlayerProfile(...args); }
function updatePlayerProfile(...args) { return playerProfileRuntimeWriteService.updatePlayerProfile(...args); }
function removePlayerProfile(...args) { return playerProfileRuntimeWriteService.removePlayerProfile(...args); }
win.footballSciencePlayerProfiles = {
getState: () => clonePlayerProfilesState(ensurePlayerProfilesState()),
getPlayersForSessionPlanner: getSessionPlannerPlayerProfileContracts,
getPlayerForSessionPlanner: getSessionPlannerPlayerProfileContract,
getDataFoundationPayload: buildSquadDataFoundationPayload,
getDataQualityReport: buildSquadDataQualityReport,
getSessionPlannerContractsV2: buildSquadSessionPlannerContracts,
};
function canEditMedicalTeam() { return canCurrentUserEditWorkspace("medical-team"); }
let medicalRuntimeActivitySelectors = null;
function getMedicalAccessLabel(...args) { return medicalRuntimeActivitySelectors.getMedicalAccessLabel(...args); }
function getMedicalHeroTeamName(...args) { return medicalRuntimeActivitySelectors.getMedicalHeroTeamName(...args); }
function getSelectedMedicalPlayer(...args) { return medicalRuntimeActivitySelectors.getSelectedMedicalPlayer(...args); }
function getActiveMedicalPlayers(...args) { return medicalRuntimeActivitySelectors.getActiveMedicalPlayers(...args); }
function isMedicalPlayerVisibleForDate(...args) { return medicalRuntimeActivitySelectors.isMedicalPlayerVisibleForDate(...args); }
function getActiveMedicalPlayersForDate(...args) { return medicalRuntimeActivitySelectors.getActiveMedicalPlayersForDate(...args); }
function isMedicalInjuryPlanActive(...args) { return medicalRuntimeActivitySelectors.isMedicalInjuryPlanActive(...args); }
function getMedicalPlayerInjuryPlans(...args) { return medicalRuntimeActivitySelectors.getMedicalPlayerInjuryPlans(...args); }
function getActiveMedicalInjuryPlan(...args) { return medicalRuntimeActivitySelectors.getActiveMedicalInjuryPlan(...args); }
function createMedicalRecordFromSquadAvailabilityBlock(...args) { return medicalRuntimeActivitySelectors.createMedicalRecordFromSquadAvailabilityBlock(...args); }
function isMedicalPlanCleared(...args) { return medicalRuntimeActivitySelectors.isMedicalPlanCleared(...args); }
function getMedicalRecommendationBlockReason(...args) { return medicalRuntimeActivitySelectors.getMedicalRecommendationBlockReason(...args); }
function getMedicalReviewAlerts(...args) { return medicalRuntimeActivitySelectors.getMedicalReviewAlerts(...args); }
function getMedicalCoachComment(...args) { return medicalRuntimeActivitySelectors.getMedicalCoachComment(...args); }
function getMedicalVisibleComment(...args) { return medicalRuntimeActivitySelectors.getMedicalVisibleComment(...args); }
function createMedicalRecordFromInjuryPlan(...args) { return medicalRuntimeActivitySelectors.createMedicalRecordFromInjuryPlan(...args); }
function getLatestMedicalRecord(...args) { return medicalRuntimeActivitySelectors.getLatestMedicalRecord(...args); }
function getMedicalPlayerRecords(...args) { return medicalRuntimeActivitySelectors.getMedicalPlayerRecords(...args); }
function isMedicalRestrictedRecommendationRecord(...args) { return medicalRuntimeActivitySelectors.isMedicalRestrictedRecommendationRecord(...args); }
function getMedicalPlayerRestrictedLogRecords(...args) { return medicalRuntimeActivitySelectors.getMedicalPlayerRestrictedLogRecords(...args); }
function getMedicalWindowDates(...args) { return medicalRuntimeActivitySelectors.getMedicalWindowDates(...args); }
function getMedicalPastWindowDates(...args) { return medicalRuntimeActivitySelectors.getMedicalPastWindowDates(...args); }
function getMedicalMonthToDateDates(...args) { return medicalRuntimeActivitySelectors.getMedicalMonthToDateDates(...args); }
function getMedicalScheduleSummary(...args) { return medicalRuntimeActivitySelectors.getMedicalScheduleSummary(...args); }
function getMedicalRecommendationEvent(...args) { return medicalRuntimeActivitySelectors.getMedicalRecommendationEvent(...args); }
function getMedicalRecommendationActivityContext(...args) { return medicalRuntimeActivitySelectors.getMedicalRecommendationActivityContext(...args); }
function getMedicalRecordStatus(...args) { return medicalRuntimeActivitySelectors.getMedicalRecordStatus(...args); }
function getDefaultMedicalInjuryPlanDraft(...args) { return medicalRuntimeActivitySelectors.getDefaultMedicalInjuryPlanDraft(...args); }
function normalizeMedicalInjuryPlanDraft(...args) { return medicalRuntimeActivitySelectors.normalizeMedicalInjuryPlanDraft(...args); }
function getMedicalInjuryPlanDraft(...args) { return medicalRuntimeActivitySelectors.getMedicalInjuryPlanDraft(...args); }
function setMedicalInjuryPlanDraft(...args) { return medicalRuntimeActivitySelectors.setMedicalInjuryPlanDraft(...args); }
function setMedicalInjuryPlanDraftFromPlan(...args) { return medicalRuntimeActivitySelectors.setMedicalInjuryPlanDraftFromPlan(...args); }
function clearMedicalInjuryPlanDraft(...args) { return medicalRuntimeActivitySelectors.clearMedicalInjuryPlanDraft(...args); }
function getMedicalInjuryPlanFormDraft(...args) { return medicalRuntimeActivitySelectors.getMedicalInjuryPlanFormDraft(...args); }
function persistMedicalInjuryPlanDraftFromForm(...args) { return medicalRuntimeActivitySelectors.persistMedicalInjuryPlanDraftFromForm(...args); }
medicalRuntimeActivitySelectors = createMedicalRuntimeActivitySelectors({
addCalendarDays,
canEditMedicalTeam,
ensureMedicalState,
formatDateValue: formatScheduleDateValue,
getCurrentUser: getCurrentPlatformUser,
getFormValues: getPlatformFormValues,
getMedicalEntityUpdatedMs,
getMedicalPlayerAvailabilityStatusOption,
getMedicalPlayerSquadAvailabilityBlockReason,
getMedicalRtpPhaseOption,
getMedicalState: () => medicalState,
getMedicalStatusOptionForDate,
getPlatformStructureState,
getPlatformTeamDisplayName,
getRemovedSquadPlayerIdSet: getMedicalRemovedSquadPlayerIdSet,
getScheduleEventsForDate,
getScheduleMainEvent,
isAdmin: isCurrentPlatformUserAdmin,
isDateValue: isMedicalDateValue,
isItemArchived: isMedicalItemArchived,
isPlayerBlockedBySquadAvailability: isMedicalPlayerBlockedBySquadAvailability,
isPlayerRemovedFromSquad: isMedicalPlayerRemovedFromSquad,
isScheduleSessionEvent,
isTemporaryPlayerProfile,
isTemporaryPlayerProfileActiveOnDate: isPlayerProfileTemporaryActiveOnDate,
medicalActualParticipationFallback,
medicalClearanceRoles,
medicalInjuryPlanDraftsByPlayerId,
medicalInjuryPlanStatusOptions,
medicalLoadGateOptions,
medicalWindowLength,
normalizeClearance: normalizeMedicalClearance,
normalizeLoadGates: normalizeMedicalLoadGates,
normalizeParticipation: normalizeMedicalParticipation,
normalizePlatformText: normalizePlatformStructureText,
normalizeShareValue: normalizeMedicalShareValue,
parseDateValue: parseScheduleDateValue,
scheduleEventTypes,
});
squadMedicalStatusService = createSquadMedicalStatusService({
ensureMedicalState,
formatDateValue: formatScheduleDateValue,
formatMedicalDateLabel,
getActiveMedicalInjuryPlan,
getLatestMedicalRecord,
getMedicalRecordStatus,
getMedicalRtpPhaseOption,
getMedicalState: () => medicalState,
});
function getMedicalDailyStats(dateValue = medicalState?.selectedDate) { return medicalCommandSelectors.getMedicalDailyStats(dateValue); }
function getMedicalWindowAverage() { return medicalCommandSelectors.getMedicalWindowAverage(); }
function getMedicalParticipationAverageForDates(dateValues = []) { return medicalCommandSelectors.getMedicalParticipationAverageForDates(dateValues); }
function getMedicalMonthAverageStats() { return medicalCommandSelectors.getMedicalMonthAverageStats(); }
function getMedicalAttentionPlayers(dateValue = medicalState?.selectedDate) { return medicalCommandSelectors.getMedicalAttentionPlayers(dateValue); }
function getMedicalPositionSummaries(dateValue = medicalState?.selectedDate) { return medicalCommandSelectors.getMedicalPositionSummaries(dateValue); }
function getMedicalDaySpan(startDateValue, endDateValue) {
if (!isMedicalDateValue(startDateValue) || !isMedicalDateValue(endDateValue)) {
return null;
}
const dayMs = 24 * 60 * 60 * 1000;
return Math.max(1, Math.round((parseScheduleDateValue(endDateValue) - parseScheduleDateValue(startDateValue)) / dayMs) + 1);
}
function getMedicalDailyHuddle(dateValue = medicalState?.selectedDate) { return medicalCommandSelectors.getMedicalDailyHuddle(dateValue); }
function getMedicalCoachHandoverItems(dateValue = medicalState?.selectedDate) { return medicalCommandSelectors.getMedicalCoachHandoverItems(dateValue); }
function buildMedicalCoachHandoverText(dateValue = medicalState?.selectedDate) { return medicalCommandSelectors.buildMedicalCoachHandoverText(dateValue); }
let medicalRuntimeOperationsService = null;
function recordMedicalAuditEvent(...args) { return medicalRuntimeOperationsService.recordMedicalAuditEvent(...args); }
function getMedicalDatabasePlayer(...args) { return medicalRuntimeOperationsService.getMedicalDatabasePlayer(...args); }
function buildMedicalDatabaseStateSummary(...args) { return medicalRuntimeOperationsService.buildMedicalDatabaseStateSummary(...args); }
function getMedicalDatabaseIdempotencyKey(...args) { return medicalRuntimeOperationsService.getMedicalDatabaseIdempotencyKey(...args); }
function recordMedicalDatabaseSyncEvent(...args) { return medicalRuntimeOperationsService.recordMedicalDatabaseSyncEvent(...args); }
function copyMedicalCoachHandoverToClipboard(...args) { return medicalRuntimeOperationsService.copyMedicalCoachHandoverToClipboard(...args); }
function getMedicalPlayerProfileSummary(player, dateValue = medicalState?.selectedDate) { return medicalProfileSummarySelectors.getMedicalPlayerProfileSummary(player, dateValue); }
function getFilteredMedicalPlayers(...args) { return medicalRuntimeOperationsService.getFilteredMedicalPlayers(...args); }
function getMedicalValidBulkSelection(...args) { return medicalRuntimeOperationsService.getMedicalValidBulkSelection(...args); }
function getMedicalBulkSelectedPlayers(...args) { return medicalRuntimeOperationsService.getMedicalBulkSelectedPlayers(...args); }
function getMedicalBulkRecommendationEligiblePlayers(...args) { return medicalRuntimeOperationsService.getMedicalBulkRecommendationEligiblePlayers(...args); }
function toggleMedicalBulkPlayer(...args) { return medicalRuntimeOperationsService.toggleMedicalBulkPlayer(...args); }
function setMedicalBulkSelection(...args) { return medicalRuntimeOperationsService.setMedicalBulkSelection(...args); }
function setMedicalBulkNotSetSelection(...args) { return medicalRuntimeOperationsService.setMedicalBulkNotSetSelection(...args); }
function applyMedicalQuickRecommendation(...args) { return medicalRuntimeOperationsService.applyMedicalQuickRecommendation(...args); }
function applyMedicalBulkRecommendation(...args) { return medicalRuntimeOperationsService.applyMedicalBulkRecommendation(...args); }
function updateMedicalBulkActivityControls(...args) { return medicalRuntimeOperationsService.updateMedicalBulkActivityControls(...args); }
function updateMedicalGovernancePolicy(...args) { return medicalRuntimeOperationsService.updateMedicalGovernancePolicy(...args); }
function getMedicalPlanTotalDays(plan) { return medicalPlanSelectors.getMedicalPlanTotalDays(plan); }
function getMedicalPlanElapsedDays(plan, dateValue = medicalState?.selectedDate) { return medicalPlanSelectors.getMedicalPlanElapsedDays(plan, dateValue); }
function getMedicalPlanDaysRemaining(plan, dateValue = medicalState?.selectedDate) { return medicalPlanSelectors.getMedicalPlanDaysRemaining(plan, dateValue); }
function getMedicalPlanSeverity(plan) { return medicalPlanSelectors.getMedicalPlanSeverity(plan); }
function getMedicalPlanClearanceSummary(plan) { return medicalPlanSelectors.getMedicalPlanClearanceSummary(plan); }
function getMedicalPlanReviewState(plan, dateValue = medicalState?.selectedDate) { return medicalPlanSelectors.getMedicalPlanReviewState(plan, dateValue); }
function getMedicalTrailingRecommendationSummary(playerId, dateValue = medicalState?.selectedDate) { return medicalPlanSelectors.getMedicalTrailingRecommendationSummary(playerId, dateValue); }
function getMedicalSeasonPlans(dateValue = medicalState?.selectedDate) { return medicalOperationsSelectors.getMedicalSeasonPlans(dateValue); }
function getMedicalActiveCaseItems(dateValue = medicalState?.selectedDate) { return medicalOperationsSelectors.getMedicalActiveCaseItems(dateValue); }
function getMedicalHistoryEvents(limit = 40) { return medicalOperationsSelectors.getMedicalHistoryEvents(limit); }
function getMedicalSeasonSummary(dateValue = medicalState?.selectedDate) { return medicalOperationsSelectors.getMedicalSeasonSummary(dateValue); }
function getMedicalPlayerRiskSignal(player, dateValue = medicalState?.selectedDate) { return medicalOperationsSelectors.getMedicalPlayerRiskSignal(player, dateValue); }
function getMedicalRiskSignals(dateValue = medicalState?.selectedDate) { return medicalOperationsSelectors.getMedicalRiskSignals(dateValue); }
function getMedicalOperationsSummary(dateValue = medicalState?.selectedDate) { return medicalOperationsSelectors.getMedicalOperationsSummary(dateValue); }
function renderMedicalOperationsTopMenu() {
if (!canViewPrivateMedicalDetails()) {
return "";
}
medicalOperationsTab = normalizeMedicalOperationsTab(medicalOperationsTab);
return medicalOperationsRenderer.renderTopMenu(medicalOperationsTab, medicalOperationsTabOptions);
}
function renderMedicalOperationsSystem() {
if (!canViewPrivateMedicalDetails()) {
return medicalOperationsRenderer.renderCoachSafeSummary(medicalState.selectedDate);
}
medicalOperationsTab = normalizeMedicalOperationsTab(medicalOperationsTab);
const summary = getMedicalOperationsSummary(medicalState.selectedDate);
return medicalOperationsRenderer.renderPrivateSystem(summary, medicalOperationsTab, medicalState.selectedDate);
}
function getMedicalRosterPositionGroups(players = []) { return medicalRosterSelectors.getMedicalRosterPositionGroups(players); }
function getMedicalRosterPositionStats(players = []) { return medicalRosterSelectors.getMedicalRosterPositionStats(players); }
const { renderMedicalTeamWorkspace } = createMedicalWorkspaceRuntimeRenderer({
canViewPrivateDetails: canViewPrivateMedicalDetails,
ensureState: ensureMedicalState,
escapeHtml,
getAccessLabel: getMedicalAccessLabel,
getHeroTeamName: getMedicalHeroTeamName,
getOperationsTab: () => medicalOperationsTab,
getWorkspace: () => ui.medicalTeamWorkspace,
normalizeOperationsTab: normalizeMedicalOperationsTab,
playerModalRenderer: medicalPlayerModalRenderer,
renderOperationsSystem: renderMedicalOperationsSystem,
renderOperationsTopMenu: renderMedicalOperationsTopMenu,
rosterRenderer: medicalRosterRenderer,
setOperationsTab: (tab) => {
medicalOperationsTab = tab;
},
});
medicalRuntimeOperationsService = createMedicalRuntimeOperationsService({
addMedicalRecord,
buildMedicalCoachHandoverText,
canEditMedicalTeam,
canViewPrivateMedicalDetails,
commitMedicalClinicalState,
compareMedicalPlayers,
ensureMedicalState,
formatDateValue: formatScheduleDateValue,
getActiveMedicalPlayers,
getActiveMedicalPlayersForDate,
getBulkRecommendationOpen: () => medicalBulkRecommendationOpen,
getBulkSelectedPlayerIds: () => medicalBulkSelectedPlayerIds,
getCurrentPlatformUser,
getLatestMedicalRecord,
getMedicalCoachHandoverItems,
getMedicalDataSafetyCounts,
getMedicalDailyStats,
getMedicalPlayerSquadAvailabilityBlockReason,
getMedicalRecommendationActivityContext,
getMedicalRecommendationBlockReason,
getMedicalRecordStatus,
getMedicalRtpPhaseForRecommendation,
getMedicalRtpPhaseOption,
getMedicalState: () => medicalState,
getMedicalStatusForParticipation,
getPlayerProfileRosterLabel,
getRosterSearchQuery: () => medicalRosterSearchQuery,
getStatusFilter: () => medicalStatusFilter,
isMedicalDateValue,
isMedicalItemArchived,
isMedicalPlayerBlockedBySquadAvailability,
medicalActualParticipationFallback,
medicalRtpPhaseOptions,
medicalTeamStorageKey,
navigatorRef: navigator,
normalizeMedicalGovernancePolicy,
normalizeMedicalParticipation,
renderMedicalTeamWorkspace,
setBulkRecommendationOpen: (isOpen) => {
medicalBulkRecommendationOpen = Boolean(isOpen);
},
setBulkSelectedPlayerIds: (selectedIds) => {
medicalBulkSelectedPlayerIds = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
},
updateMedicalDatabaseSyncStatus,
win,
writeMedicalState,
});
const medicalRuntimeWriteService = createMedicalRuntimeWriteService({
addCalendarDays,
cloneMedicalState,
commitMedicalClinicalState,
ensureMedicalState,
formatDateValue: formatScheduleDateValue,
getActiveMedicalPlayers,
getCurrentMedicalActorId,
getCurrentPlatformUser,
getMedicalClearanceValues,
getMedicalLoadGateValues,
getMedicalRecommendationActivityContext,
getMedicalRemovedSquadPlayerIdSet,
getMedicalRtpPhaseOption,
getMedicalState: () => medicalState,
getMedicalStatusForParticipation,
isDateValue: isMedicalDateValue,
isMedicalItemArchived,
isMedicalPlayerBlockedBySquadAvailability,
isMedicalPlayerRemovedFromSquad,
medicalStatusOptions,
normalizeMedicalInjuryPlan,
normalizeMedicalParticipation,
normalizeMedicalPlayer,
normalizeMedicalRecord,
parseDateValue: parseScheduleDateValue,
renderMedicalTeamWorkspace,
setMedicalPlayerModalOpen: (isOpen) => {
medicalPlayerModalOpen = Boolean(isOpen);
},
setMedicalPlayerModalTab: (tab) => {
medicalPlayerModalTab = tab;
},
setMedicalState: (nextState) => {
medicalState = nextState;
},
writeMedicalState,
});
function upsertMedicalPlayers(...args) { return medicalRuntimeWriteService.upsertMedicalPlayers(...args); }
function addMedicalRecord(...args) { return medicalRuntimeWriteService.addMedicalRecord(...args); }
function updateMedicalPlayerProfile(...args) { return medicalRuntimeWriteService.updateMedicalPlayerProfile(...args); }
function removeMedicalPlayer(...args) { return medicalRuntimeWriteService.removeMedicalPlayer(...args); }
function removeMedicalRecord(...args) { return medicalRuntimeWriteService.removeMedicalRecord(...args); }
function addMedicalInjuryPlan(...args) { return medicalRuntimeWriteService.addMedicalInjuryPlan(...args); }
function updateMedicalInjuryPlan(...args) { return medicalRuntimeWriteService.updateMedicalInjuryPlan(...args); }
function updateMedicalPlanClearance(...args) { return medicalRuntimeWriteService.updateMedicalPlanClearance(...args); }
function removeMedicalInjuryPlan(...args) { return medicalRuntimeWriteService.removeMedicalInjuryPlan(...args); }
function openMedicalPlayerModal(...args) { return medicalRuntimeWriteService.openMedicalPlayerModal(...args); }
function closeMedicalPlayerModal(...args) { return medicalRuntimeWriteService.closeMedicalPlayerModal(...args); }
function setMedicalSelectedDate(...args) { return medicalRuntimeWriteService.setMedicalSelectedDate(...args); }
function shiftMedicalSelectedDate(...args) { return medicalRuntimeWriteService.shiftMedicalSelectedDate(...args); }
function getPeriodizationDayScheduleLabel(day) { return periodizationRenderer.getDayScheduleLabel(day); }
function getPeriodizationMatchDayLabel(value) { return periodizationRenderer.getMatchDayLabel(value); }
function getPeriodizationMultiFieldValue(field, dateValue) { return periodizationRenderer.getMultiFieldValue(field, dateValue); }
function getPeriodizationCustomFieldValue(field, dateValue) { return periodizationRenderer.getCustomFieldValue(field, dateValue); }
const periodizationRuntimeBindings = createPeriodizationRuntimeBindings({
ui,
renderer: periodizationRenderer,
parseDateValue: parseScheduleDateValue,
ensurePeriodizationState,
isDateValueInYear: (dateValue) => isDateValueInYear(dateValue, periodizationYear),
canEdit: canEditPeriodizationWorkspace,
writeDay: writePeriodizationDay,
writePeriodizationState,
renderSessionPlanner: renderSessionPlannerWorkspace,
getCustomFieldValue: getPeriodizationCustomFieldValue,
getMultiFieldValue: getPeriodizationMultiFieldValue,
isMultiField: (fieldKey) => periodizationMultiFields.has(fieldKey),
getMultiSelectOpenField: () => periodizationMultiSelectOpenField,
setMultiSelectOpenField: (fieldKey = "") => {
periodizationMultiSelectOpenField = fieldKey;
},
setPeriodizationSelection: (dateValue, monthIndex) => {
periodizationState.selectedDate = dateValue;
periodizationState.selectedMonthIndex = Number.isInteger(monthIndex)
? monthIndex
: parseScheduleDateValue(dateValue).getMonth();
},
getState: () => periodizationState,
getPeriodizationState: () => periodizationState,
getOverlayState: () => ({ open: periodizationDayOverlayOpen, mode: periodizationDayOverlayMode }),
setOverlayMode: (mode) => {
periodizationDayOverlayMode = mode === "edit" ? "edit" : "view";
},
jumpToToday: jumpPeriodizationToToday,
shiftMonth: shiftPeriodizationMonth,
setMonth: setPeriodizationMonth,
selectDate: selectPeriodizationDate,
setOverlayState: ({ open, mode }) => {
periodizationDayOverlayOpen = Boolean(open);
periodizationDayOverlayMode = mode === "edit" ? "edit" : "view";
},
escapeHtml,
getPeriodizationDay,
getPeriodizationMatchDayLabel,
getSessionPlannerState: () => sessionPlannerState,
});
const {
periodizationWorkspaceController,
refreshPeriodizationBoardMultiFields,
refreshPeriodizationBoardDependentFields,
refreshSessionPlannerMatchDayChip,
renderPeriodizationWorkspace,
renderSessionPlannerPeriodizationOverlay,
renderSessionPlannerPeriodizationSummary,
sessionPlannerPeriodizationBridge,
} = periodizationRuntimeBindings;
const workspaceShellController = createWorkspaceShellController({
applyUserAvatar,
closeDashboardModal,
defaultHubState,
documentRef: document,
formatUserName,
getAccessibleWorkspacePool,
getDashboardDateLabel,
getHubState: () => hubState,
getSafeWorkspaceId,
getUi: () => ui,
getWorkspaceById,
getWorkspaceIdFromUrl,
getWorkspaceViewId,
hydrateWorkspaceModuleState,
markDashboardHomeSeenForCurrentUser,
onLeavePlayerProfiles: () => {
playerProfileModalOpen = false;
playerProfileNewPlayerModalOpen = false;
},
pauseSimulatorForWorkspaceSwitch,
platformNavigationController,
queueCriticalWorkspacePreloads,
queueDashboardChatStylesheetLoad,
queueWorkspaceModulePreload,
readRememberedWorkspaceId,
readWorkspaceHubState,
rememberActiveWorkspaceId,
renderDashboardCards,
renderDashboardChatWidget,
renderWorkspaceByViewId: (activeViewId) => {
if (activeViewId === "profile") renderProfileWorkspace();
if (activeViewId === "staff") renderStaffWorkspace();
if (activeViewId === "admin") renderAdminWorkspace();
if (activeViewId === "medical-team") renderMedicalTeamWorkspace();
if (activeViewId === "player-profiles") renderPlayerProfilesWorkspace();
if (activeViewId === "scouting") renderScoutingWorkspace();
if (activeViewId === "gameplan") renderGameplanWorkspace();
if (activeViewId === "transfer-room") renderTransferRoomWorkspace();
if (activeViewId === "analysis-room") renderAnalysisRoomWorkspace();
if (activeViewId === "schedule") renderScheduleWorkspace();
if (activeViewId === "periodization") renderPeriodizationWorkspace();
if (activeViewId === "session-planner") renderSessionPlannerWorkspace();
},
repairWorkspaceState,
resetGameSimulatorIntro,
scheduleDashboardLoginPopups,
setHubState: (nextState) => {
hubState = nextState;
},
simulatorRender: render,
startPlatformThemeScheduler,
startSimulatorAnimationLoop,
stopSimulatorAnimationLoop,
syncAccountMenu,
syncDashboardChatWidgetNotificationCursor,
syncGameSimulatorIntroState,
syncPlatformAutosaveStatusVisibility,
syncPlatformUserFromAuth,
win,
workspaceHubDefaultActiveWorkspaceId,
writeWorkspaceHubState,
});
const {
initializeWorkspaceHub,
renderWorkspaceChrome,
setActiveWorkspace,
} = workspaceShellController;
function reloadCentralizedAppStateFromStorage() {
if (!getCurrentPlatformUser()) {
return;
}
const previousSessionPlannerSelection = getCurrentSessionPlannerUiSelection();
const previousWorkspaceId = hubState?.activeWorkspaceId || workspaceHubDefaultActiveWorkspaceId;
if (hubState?.activeWorkspaceId === "session-planner") {
syncSelectedSessionPlannerBlockFieldsFromDom();
}
hubState = repairWorkspaceState({
...readWorkspaceHubState(),
activeWorkspaceId: previousWorkspaceId,
});
periodizationState = readPeriodizationState();
scheduleState = readScheduleState();
medicalState = readMedicalState();
playerProfilesState = readPlayerProfilesState();
scoutingState = readScoutingState();
transferRoomState = readTransferRoomState();
sessionPlannerState = readSessionPlannerStatePreservingUiSelection(previousSessionPlannerSelection);
sessionPlannerExerciseLibrary = readSessionPlannerExerciseLibrary();
syncGameSimulatorSavedSequencesFromStorage();
queueSessionPlannerSnapshotRecovery();
renderWorkspaceChrome();
scheduleDashboardLoginPopups();
}
let centralizedAppStateReloadPending = false;
function getCurrentSessionPlannerUiSelection() {
const dateValue = sessionPlannerState?.selectedDate || "";
return {
dateValue,
blockId: dateValue ? sessionPlannerState?.sessions?.[dateValue]?.selectedBlockId || "" : "",
};
}
function readSessionPlannerStatePreservingUiSelection(previousSelection = getCurrentSessionPlannerUiSelection()) {
const nextState = readSessionPlannerState();
if (hubState?.activeWorkspaceId !== "session-planner" || !previousSelection.dateValue) {
return nextState;
}
const previousSession = nextState.sessions?.[previousSelection.dateValue];
if (!previousSession) {
return nextState;
}
nextState.selectedDate = previousSelection.dateValue;
if (previousSession.blocks.some((block) => block.id === previousSelection.blockId)) {
previousSession.selectedBlockId = previousSelection.blockId;
}
return nextState;
}
function shouldDeferCentralizedAppStateReload() {
const activeElement = document.activeElement;
if (isEditableKeyboardTarget(activeElement)) {
return true;
}
if (hubState?.activeWorkspaceId === "scouting") {
const scoutingRoot = ui.scoutingWorkspace;
if (
scoutingRoot?.querySelector(
".scouting-profile-backdrop,[data-scouting-role-model-overlay],[data-scouting-report-builder-overlay],[data-scouting-saved-views-overlay],[data-scouting-settings-overlay],details[open],[data-scouting-active-content] .is-dragging"
)
) {
return true;
}
}
return Boolean(
sessionPlannerLocalUiState.state.sessionPlannerLibraryOpen ||
sessionPlannerLocalUiState.state.sessionPlannerPendingLibrarySave ||
sessionPlannerLocalUiState.state.sessionPlannerVisualPreviewOpen ||
sessionPlannerLocalUiState.state.sessionPlannerPrintOverlayOpen ||
sessionPlannerLocalUiState.state.sessionPlannerTacticalboardOpen ||
sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardOpen ||
sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardSelectedPlayerId ||
sessionPlannerLocalUiState.state.sessionPlannerTacticalDragState ||
sessionPlannerLocalUiState.state.sessionPlannerTacticalSelectionState ||
sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardSelectionState ||
sessionPlannerLocalUiState.state.sessionPlannerPlayerBoardDragState
);
}
function requestCentralizedAppStateReload() {
if (!getCurrentPlatformUser()) {
return;
}
if (shouldDeferCentralizedAppStateReload()) {
centralizedAppStateReloadPending = true;
return;
}
centralizedAppStateReloadPending = false;
reloadCentralizedAppStateFromStorage();
}
function flushDeferredCentralizedAppStateReload() {
if (!centralizedAppStateReloadPending || shouldDeferCentralizedAppStateReload()) {
return;
}
requestCentralizedAppStateReload();
}
function refreshCentralStateFromSource(reason = "refresh", options = {}) {
const bridge = getCentralStateBridge();
if (document.visibilityState === "hidden" || centralStateRefreshInFlight || !getCurrentPlatformUser() || !bridge?.hydrate) return;
if (reason === "interval" && !document.hasFocus()) return;
const now = Date.now();
const minInterval = options.force ? 0 : reason === "interval" ? centralStateIntervalRefreshMinMs : centralStateActiveRefreshMinMs;
if (minInterval && now - centralStateLastRefreshAt < minInterval) return;
centralStateRefreshInFlight = true;
centralStateLastRefreshAt = now;
const retryAfterHydrate = hasPendingCentralStateWrites();
bridge.hydrate().then(() => {
if (retryAfterHydrate) retryCentral();
}).catch((error) => {
queueCentralStateStatus(error?.message || `${reason} failed.`);
}).finally(() => {
centralStateRefreshInFlight = false;
});
}
bindPlatformNavigationInteractions({
getHubState: () => hubState,
platformNavigationController,
preloadWorkspaceFromTrigger,
renderWorkspaceChrome,
setActiveWorkspace,
ui,
win,
writeWorkspaceHubState,
});
ui.workspaceSearch?.addEventListener("input", () => {
renderWorkspaceChrome();
});
ui.platformThemeModeSelect?.addEventListener("change", () => {
setPlatformThemeMode(ui.platformThemeModeSelect?.value);
});
document.addEventListener("keydown", (event) => {
if (event.key === "Escape") {
if (dashboardChatGroupCreatorOpen) {
dashboardChatGroupCreatorOpen = false;
renderDashboardChatWidget();
return;
}
platformNavigationController.hideTopIconTooltip();
}
});
dashboardRuntimeController.bindInteractions();
function closeChatMenus(x = null) { ui.dashboardChatWidgetRoot?.querySelectorAll(".dashboard-chat-message-menu[open]").forEach((menu) => { if (menu !== x) menu.removeAttribute("open"); }); }
ui.dashboardChatWidgetRoot?.addEventListener("click", async (event) => {
const activeMenu = event.target.closest(".dashboard-chat-message-menu");
closeChatMenus(activeMenu);
const toastOpenButton = event.target.closest("[data-dashboard-chat-toast-open]");
if (toastOpenButton && !toastOpenButton.hidden) {
const threadId = normalizeDashboardChatThreadId(
toastOpenButton.dataset.dashboardChatToastThread,
dashboardChatTeamThreadId
);
writeDashboardChatWidgetState({
isOpen: true,
selectedThreadId: threadId,
});
dashboardChatMobileConversationOpen = true;
markDashboardChatWidgetNotificationSeenForThread(threadId);
hideDashboardChatWidgetToast();
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
return;
}
const readReceipt = event.target.closest("[data-dashboard-read-receipt]");
if (readReceipt) {
ui.dashboardChatWidgetRoot
?.querySelectorAll("[data-dashboard-read-receipt][open]")
.forEach((receipt) => {
if (receipt !== readReceipt) {
receipt.removeAttribute("open");
}
});
return;
}
const confirmBackdrop = event.target.closest("[data-dashboard-chat-confirm-backdrop]");
const confirmCancelButton = event.target.closest("[data-dashboard-chat-confirm-cancel]");
if ((confirmBackdrop && event.target === confirmBackdrop) || confirmCancelButton) {
setDashboardChatConfirmAction(null);
renderDashboardChatWidget();
return;
}
const detailsToggleButton = event.target.closest("[data-dashboard-chat-details-toggle]");
if (detailsToggleButton) {
dashboardChatDetailsOpen = !dashboardChatDetailsOpen;
renderDashboardChatWidget();
return;
}
const detailsCloseButton = event.target.closest("[data-dashboard-chat-details-close]");
if (detailsCloseButton) {
dashboardChatDetailsOpen = false;
renderDashboardChatWidget();
return;
}
const mobileBackButton = event.target.closest("[data-dashboard-chat-mobile-back]");
if (mobileBackButton) {
dashboardChatMobileConversationOpen = false;
dashboardChatDetailsOpen = false;
renderDashboardChatWidget();
return;
}
const threadSettingButton = event.target.closest("[data-dashboard-chat-thread-setting]");
if (threadSettingButton) {
const currentState = readDashboardChatWidgetState();
dashboardChatApiUiActions.handleThreadSettingAction(threadSettingButton, currentState.selectedThreadId);
return;
}
const archiveThreadButton = event.target.closest("[data-dashboard-chat-archive-thread]");
if (archiveThreadButton) {
const threadId = normalizeDashboardChatThreadId(archiveThreadButton.dataset.dashboardChatArchiveThread, dashboardChatTeamThreadId);
setDashboardChatConfirmAction({
type: "archiveThread",
threadId,
title: "Delete group?",
message: "History stays protected.",
confirmLabel: "Delete",
});
renderDashboardChatWidget();
return;
}
const participantActionButton = event.target.closest("[data-dashboard-chat-participant-action]");
if (participantActionButton) {
const currentState = readDashboardChatWidgetState();
dashboardChatApiUiActions.handleThreadParticipantAction(participantActionButton, currentState.selectedThreadId);
return;
}
const confirmApplyButton = event.target.closest("[data-dashboard-chat-confirm-apply]");
if (confirmApplyButton) {
const confirmAction = dashboardChatConfirmAction;
setDashboardChatConfirmAction(null);
if (confirmAction?.type === "clearThread") {
await clearDashboardMessagesForThreadWithApi(confirmAction.threadId);
} else if (confirmAction?.type === "archiveThread") {
await dashboardChatApiUiActions.archiveThreadWithApi(confirmAction.threadId);
} else if (confirmAction?.type === "deleteMessage") {
await removeDashboardMessageWithApi(confirmAction.messageId);
platformNavigationController.renderTopIconMenu();
}
renderDashboardChatWidget();
return;
}
const replyMessageButton = event.target.closest("[data-dashboard-reply-message]");
if (replyMessageButton) {
const currentState = readDashboardChatWidgetState();
const threadId = normalizeDashboardChatThreadId(currentState.selectedThreadId, dashboardChatTeamThreadId);
setDashboardChatReplyDraft(replyMessageButton.dataset.dashboardReplyMessage, threadId);
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
return;
}
const cancelReplyButton = event.target.closest("[data-dashboard-cancel-reply]");
if (cancelReplyButton) {
setDashboardChatReplyDraft("", "");
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
return;
}
const copyMessageButton = event.target.closest("[data-dashboard-copy-message]");
if (copyMessageButton) {
const message = getDashboardMessageById(copyMessageButton.dataset.dashboardCopyMessage);
const text = String(message?.text || "");
const copied = Boolean(text && navigator.clipboard?.writeText && await navigator.clipboard.writeText(text).then(() => true, () => false));
showDashboardChatWidgetToast(copied ? "Copied" : "Failed", message?.threadId || dashboardChatTeamThreadId);
return;
}
const retryMessageButton = event.target.closest("[data-dashboard-retry-message]");
if (retryMessageButton) {
await retryDashboardMessageWithApi(retryMessageButton.dataset.dashboardRetryMessage);
return;
}
const reactionButton = event.target.closest("[data-dashboard-message-reaction][data-dashboard-reaction-key]");
if (reactionButton) {
await toggleDashboardMessageReactionWithApi(
reactionButton.dataset.dashboardMessageReaction,
reactionButton.dataset.dashboardReactionKey
);
renderDashboardChatWidget();
return;
}
const loadEarlierButton = event.target.closest("[data-dashboard-chat-load-earlier]");
if (loadEarlierButton) {
await loadOlderDashboardChatMessagesWithApi(loadEarlierButton.dataset.dashboardChatLoadEarlier);
return;
}
const openGroupCreatorButton = event.target.closest("[data-dashboard-chat-open-group-creator]");
if (openGroupCreatorButton) {
event.preventDefault();
dashboardChatGroupCreatorOpen = true;
renderDashboardChatWidget();
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-group-name-input]")?.focus();
}, 0);
return;
}
const closeGroupCreatorButton = event.target.closest("[data-dashboard-chat-group-create-close]");
const groupCreatorBackdrop = event.target.closest("[data-dashboard-chat-group-create-backdrop]");
if (closeGroupCreatorButton || (groupCreatorBackdrop && event.target === groupCreatorBackdrop)) {
event.preventDefault();
dashboardChatGroupCreatorOpen = false;
renderDashboardChatWidget();
return;
}
const groupTitlePresetButton = event.target.closest("[data-dashboard-chat-group-title-preset]");
if (groupTitlePresetButton) {
event.preventDefault();
const groupNameInput = ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-group-name-input]");
if (groupNameInput) {
groupNameInput.value = groupTitlePresetButton.dataset.dashboardChatGroupTitlePreset || "";
groupNameInput.focus();
}
return;
}
const createThreadButton = event.target.closest("[data-dashboard-chat-create-thread]");
if (createThreadButton) {
await createDashboardAdvancedChatThread(createThreadButton.dataset.dashboardChatCreateThread);
return;
}
const moderationToggle = event.target.closest("[data-dashboard-chat-moderation-toggle]");
if (moderationToggle) {
dashboardChatModerationOpen = !dashboardChatModerationOpen;
renderDashboardChatWidget();
if (dashboardChatModerationOpen && !dashboardChatModerationState.audits.length) {
await loadDashboardChatModerationFromApi();
}
return;
}
const moderationRefresh = event.target.closest("[data-dashboard-chat-moderation-refresh]");
if (moderationRefresh) {
await loadDashboardChatModerationFromApi();
return;
}
const clearAttachmentButton = event.target.closest("[data-dashboard-chat-attachment-clear]");
if (clearAttachmentButton) {
dashboardChatComposerAttachmentDraft = null;
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
return;
}
const attachmentPreviewButton = event.target.closest("[data-dashboard-chat-attachment-preview]");
if (attachmentPreviewButton) {
event.preventDefault();
const previewButtons = Array.from(
ui.dashboardChatWidgetRoot?.querySelectorAll("[data-dashboard-chat-attachment-preview]") || []
).filter((button) => button.dataset.dashboardChatAttachmentUrl);
const previewItems = previewButtons.map((button) => ({
url: button.dataset.dashboardChatAttachmentUrl,
name: button.dataset.dashboardChatAttachmentName,
mimeType: button.dataset.dashboardChatAttachmentMime,
}));
const previewIndex = Math.max(0, previewButtons.indexOf(attachmentPreviewButton));
dashboardChatAttachmentPreview.open({
url: attachmentPreviewButton.dataset.dashboardChatAttachmentUrl,
name: attachmentPreviewButton.dataset.dashboardChatAttachmentName,
mimeType: attachmentPreviewButton.dataset.dashboardChatAttachmentMime,
items: previewItems,
index: previewIndex,
});
return;
}
const attachmentTrigger = event.target.closest("[data-dashboard-chat-attachment-trigger]");
if (attachmentTrigger) {
event.preventDefault();
const attachmentInput = attachmentTrigger.closest("[data-dashboard-chat-form]")?.querySelector("[data-dashboard-chat-attachment-input]");
if (attachmentInput) { attachmentInput.onchange = () => { void handleDashboardChatAttachmentInputChange(attachmentInput); }; attachmentInput.click(); }
return;
}
const priorityButton = event.target.closest("[data-dashboard-chat-priority]");
if (priorityButton) {
setDashboardChatPriorityDraft(priorityButton.dataset.dashboardChatPriority);
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
return;
}
const toggleChat = event.target.closest("[data-dashboard-chat-widget-toggle]");
if (toggleChat) {
const currentState = readDashboardChatWidgetState();
const nextState = {
...currentState,
isOpen: !currentState.isOpen,
};
if (!nextState.isOpen) {
clearDashboardChatTyping();
setDashboardChatReplyDraft("", "");
setDashboardChatPriorityDraft("normal");
setDashboardChatConfirmAction(null);
dashboardChatDetailsOpen = false;
dashboardChatGroupCreatorOpen = false;
dashboardChatMobileConversationOpen = true;
}
writeDashboardChatWidgetState(nextState);
if (nextState.isOpen) {
dashboardChatMobileConversationOpen = false;
hideDashboardChatWidgetToast();
queueDashboardChatCurrentViewRefresh({ delayMs: 0 });
}
renderDashboardChatWidget();
if (nextState.isOpen) {
focusDashboardChatWidgetComposer();
}
return;
}
const toggleNotifications = event.target.closest("[data-dashboard-chat-widget-toggle-notifications]");
if (toggleNotifications) {
const notifications = readDashboardChatWidgetNotificationState();
const nextLevel = notifications.level === "all" ? "mentions" : notifications.level === "mentions" ? "muted" : "all";
writeDashboardChatWidgetNotificationState({ level: nextLevel });
renderDashboardChatWidget();
return;
}
const threadSwitchButton = event.target.closest("[data-dashboard-chat-thread]");
if (threadSwitchButton) {
const threadId = normalizeDashboardChatThreadId(threadSwitchButton.dataset.dashboardChatThread, dashboardChatTeamThreadId);
if (!threadId) {
return;
}
clearDashboardChatTyping();
setDashboardChatReplyDraft("", "");
setDashboardChatPriorityDraft("normal");
dashboardChatMessageSearchQuery = "";
dashboardChatDetailsOpen = false;
dashboardChatGroupCreatorOpen = false;
dashboardChatMobileConversationOpen = true;
writeDashboardChatWidgetState({
isOpen: true,
selectedThreadId: threadId,
});
markDashboardChatWidgetNotificationSeenForThread(threadId);
hideDashboardChatWidgetToast();
renderDashboardChatWidget();
queueDashboardChatCurrentViewRefresh({ delayMs: 0 });
focusDashboardChatWidgetComposer();
return;
}
const clearThreadButton = event.target.closest("[data-dashboard-clear-thread]");
if (clearThreadButton) {
if (!isCurrentPlatformUserAdmin()) {
return;
}
const threadId = clearThreadButton.dataset.dashboardChatClearThread;
if (!threadId) {
return;
}
setDashboardChatConfirmAction({
type: "clearThread",
threadId,
title: "Clear this thread?",
message: "This removes all visible messages from the selected chat thread. The action is audited.",
confirmLabel: "Clear thread",
});
renderDashboardChatWidget();
return;
}
const pinMessageButton = event.target.closest("[data-dashboard-toggle-pin-message]");
if (pinMessageButton) {
if (!canPinDashboardChatMessage()) {
return;
}
await toggleDashboardMessagePinWithApi(pinMessageButton.dataset.dashboardTogglePinMessage);
renderDashboardChatWidget();
return;
}
const removeMessageButton = event.target.closest("[data-dashboard-remove-message]");
if (removeMessageButton) {
if (!isCurrentPlatformUserAdmin()) {
return;
}
setDashboardChatConfirmAction({
type: "deleteMessage",
messageId: removeMessageButton.dataset.dashboardRemoveMessage,
title: "Delete this message?",
message: "This removes the message from the chat view. The action is audited and can be reviewed by admins.",
confirmLabel: "Delete message",
});
renderDashboardChatWidget();
}
});
ui.dashboardChatWidgetRoot?.addEventListener("click", (event) => {
const searchStepButton = event.target.closest("[data-dashboard-chat-search-step]");
if (!searchStepButton) {
return;
}
event.preventDefault();
const direction = searchStepButton.dataset.dashboardChatSearchStep === "previous" ? -1 : 1;
dashboardChatMessageSearchActiveIndex += direction;
renderDashboardChatWidget();
});
ui.dashboardChatWidgetRoot?.addEventListener("input", (event) => {
const chatInput = event.target.closest("[data-dashboard-chat-input]");
if (chatInput) {
markDashboardPresenceActivity();
const currentState = readDashboardChatWidgetState();
const threadId = normalizeDashboardChatThreadId(currentState.selectedThreadId, dashboardChatTeamThreadId);
if (chatInput.value.trim()) {
queueDashboardChatTyping(threadId);
} else {
clearDashboardChatTyping();
}
return;
}
const messageSearchInput = event.target.closest("[data-dashboard-chat-message-search]");
if (messageSearchInput) {
dashboardChatMessageSearchQuery = messageSearchInput.value.trim().slice(0, 120);
dashboardChatMessageSearchActiveIndex = 0;
if (dashboardChatMessageSearchQuery.length >= 2) {
queueDashboardChatApiRefresh({ search: dashboardChatMessageSearchQuery, delayMs: 220 });
}
renderDashboardChatWidget();
return;
}
const filterInput = event.target.closest("[data-dashboard-chat-filter]");
if (!filterInput) {
return;
}
const query = filterInput.value.trim().toLowerCase();
ui.dashboardChatWidgetRoot
?.querySelectorAll("[data-dashboard-chat-thread]")
.forEach((threadButton) => {
const searchableText = threadButton.dataset.dashboardChatSearch || threadButton.textContent || "";
threadButton.hidden = Boolean(query) && !searchableText.toLowerCase().includes(query);
});
});
ui.dashboardChatWidgetRoot?.addEventListener("keydown", (event) => {
if (!event.target.matches("[data-dashboard-chat-input]")) {
return;
}
if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
event.preventDefault();
event.target.form?.requestSubmit();
}
});
ui.dashboardChatWidgetRoot?.addEventListener("submit", async (event) => {
const groupCreateForm = event.target.closest("[data-dashboard-chat-group-create-form]");
if (groupCreateForm) {
event.preventDefault();
await createDashboardCustomGroupThreadFromForm(groupCreateForm);
return;
}
const moderationFilterForm = event.target.closest("[data-dashboard-chat-moderation-filter-form]");
if (!moderationFilterForm) {
return;
}
event.preventDefault();
const formData = new FormData(moderationFilterForm);
dashboardChatModerationFilters = {
action: String(formData.get("action") || "all").trim() || "all",
userId: String(formData.get("userId") || "").trim(),
threadId: String(formData.get("threadId") || "").trim(),
from: String(formData.get("from") || "").trim(),
to: String(formData.get("to") || "").trim(),
};
await loadDashboardChatModerationFromApi();
});
document.addEventListener("click", (event) => {
if (event.target.closest("[data-dashboard-read-receipt]")) {
return;
}
ui.dashboardGrid
?.querySelectorAll("[data-dashboard-read-receipt][open]")
.forEach((receipt) => receipt.removeAttribute("open"));
ui.dashboardChatWidgetRoot
?.querySelectorAll("[data-dashboard-read-receipt][open]")
.forEach((receipt) => receipt.removeAttribute("open"));
});
ui.dashboardChatWidgetRoot?.addEventListener("submit", async (event) => {
const chatForm = event.target.closest("[data-dashboard-chat-form]");
if (!chatForm) {
return;
}
event.preventDefault();
const input = chatForm.querySelector("[data-dashboard-chat-input]");
const rawMessageText = (input?.value || "").trim();
const fallbackAttachmentText = dashboardChatComposerAttachmentDraft?.metadata?.fileName
? `Attachment: ${dashboardChatComposerAttachmentDraft.metadata.fileName}`
: "";
const messageText = (rawMessageText || fallbackAttachmentText).slice(0, dashboardChatMaxMessageLength);
if (!messageText) {
return;
}
const currentState = readDashboardChatWidgetState();
const threadId = normalizeDashboardChatThreadId(currentState.selectedThreadId, dashboardChatTeamThreadId);
const submitButton = chatForm.querySelector('button[type="submit"]');
if (submitButton?.disabled) {
return;
}
if (submitButton) {
submitButton.disabled = true;
}
dashboardChatSubmittedComposerDrafts.set(threadId, messageText);
if (input) {
input.value = "";
}
clearDashboardChatTyping();
let message = null;
try {
message = await createDashboardMessageWithApi(messageText, threadId);
} finally {
if (submitButton) {
submitButton.disabled = false;
}
}
if (!message) {
dashboardChatSubmittedComposerDrafts.delete(threadId);
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
return;
}
setDashboardChatReplyDraft("", "");
setDashboardChatPriorityDraft("normal");
queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
renderDashboardChatWidget();
focusDashboardChatWidgetComposer();
platformNavigationController.renderTopIconMenu();
});
bindProfileStaffRuntimeBindings({
ui: {
profileMenu: ui.profileMenu,
profileWorkspace: ui.profileWorkspace,
staffWorkspace: ui.staffWorkspace,
},
win,
state: {
getSelectedStaffUserId: () => selectedStaffUserId,
setSelectedStaffUserId: (userId) => { selectedStaffUserId = userId; },
getStaffCreateUserEditorOpen: () => staffCreateUserEditorOpen,
setStaffCreateUserEditorOpen: (isOpen) => { staffCreateUserEditorOpen = isOpen; },
},
actions: {
canAdminManageUser,
createDashboardTask,
createProfileImageDataUrl,
formatUserName,
getCurrentPlatformUser,
getPasswordValidationMessage,
getPlatformAuthStore,
getPlatformFormValues,
getPlatformUsers,
hasHubState: () => Boolean(hubState),
hasUserFieldConflict,
isCurrentPlatformUserAdmin,
maybeCopyToClipboard,
normalizeAdminUserSubmissionValues,
readDashboardTasks,
refreshDashboardSurfaces,
removeDashboardTask,
renderProfileWorkspace,
renderStaffWorkspace,
renderWorkspaceChrome,
setActiveWorkspace,
setFormSubmitButtonState,
setProfileMenuOpen,
stripPasswordConfirmation,
syncPlatformStructureWithUsers,
syncPlatformUserFromAuth,
togglePasswordInputVisibility,
updateDashboardTask,
updatePlatformUserFromPayload,
},
});
ui.dataSafetyExportButton?.addEventListener("click", () => {
exportFootballScienceDataBackup();
setProfileMenuOpen(false);
});
ui.dataSafetyImportButton?.addEventListener("click", () => {
ui.dataSafetyImportInput?.click();
});
ui.dataSafetyImportInput?.addEventListener("change", (event) => {
const file = event.target.files?.[0] ?? null;
event.target.value = "";
importFootballScienceDataBackupFile(file);
setProfileMenuOpen(false);
});
bindAdminRuntimeBindings({
workspaceElement: ui.adminWorkspace,
win,
state: {
getSelectedAdminUserId: () => selectedAdminUserId,
setSelectedAdminUserId: (userId) => { selectedAdminUserId = userId; },
setAdminCreateUserEditorOpen: (isOpen) => { adminCreateUserEditorOpen = isOpen; },
setAdminUserEditorOpen: (isOpen) => { adminUserEditorOpen = isOpen; },
setAdminCreateUserTeamId: (teamId) => { adminCreateUserTeamId = teamId; },
getHubState: () => hubState,
setHubState: (nextHubState) => { hubState = nextHubState; },
},
actions: {
buildPlatformAppearanceConfigFromForm,
buildTemporaryLoginMessage,
canAdminManageUser,
createAdminClubFromForm,
createAdminTeamFromForm,
createDefaultPlatformAppearanceConfig,
formatUserName,
getAdminManagedWorkspaces,
getAdminTransferRoomAccessTeamId,
getCurrentPlatformUser,
getPasswordValidationMessage,
getPlatformAuthStore,
getPlatformFormValues,
getPlatformRoles,
getPlatformStructureState,
getPlatformUsers,
getUserTeamId,
getWorkspaceAccessConfig,
hasUserFieldConflict,
isCurrentPlatformUserAdmin,
isPlatformAdminUser,
loadAdminAuditLog,
loadPlatformReadinessReport,
maybeCopyToClipboard,
normalizeAdminUserSubmissionValues,
openCredentialsMailto,
publishPlatformAppearanceConfig,
readPlatformAppearanceState,
renderAdminWorkspace,
renderWorkspaceChrome,
repairWorkspaceState,
setFormSubmitButtonState,
stripPasswordConfirmation,
syncPlatformStructureWithUsers,
syncPlatformUserFromAuth,
togglePasswordInputVisibility,
transferRoomRuntime,
ensureTransferRoomState,
withUiTimeout,
writeWorkspaceHubState,
},
});
bindMedicalRuntimeBindings({
workspaceElement: ui.medicalTeamWorkspace,
win,
state: {
getMedicalState: () => medicalState,
setMedicalSelectedPlayerId: (playerId) => { medicalState.selectedPlayerId = playerId; },
setMedicalPlayerModalOpen: (isOpen) => { medicalPlayerModalOpen = isOpen; },
setMedicalPlayerModalTab: (tab) => { medicalPlayerModalTab = tab; },
getMedicalBulkRecommendationOpen: () => medicalBulkRecommendationOpen,
setMedicalBulkRecommendationOpen: (isOpen) => { medicalBulkRecommendationOpen = isOpen; },
setMedicalOperationsTab: (tab) => { medicalOperationsTab = tab; },
setMedicalRosterSearchQuery: (query) => { medicalRosterSearchQuery = query; },
setMedicalStatusFilter: (filter) => { medicalStatusFilter = filter; },
},
actions: {
addMedicalInjuryPlan,
addMedicalRecord,
applyMedicalBulkRecommendation,
applyMedicalQuickRecommendation,
canEditMedicalTeam,
clearMedicalInjuryPlanDraft,
closeMedicalPlayerModal,
copyMedicalCoachHandoverToClipboard,
formatScheduleDateValue,
getFilteredMedicalPlayers,
getMedicalBulkSelectedPlayers,
getMedicalDatabasePlayer,
getMedicalInjuryPlanFormDraft,
getMedicalRecommendationActivityContext,
getMedicalRecommendationBlockReason,
getMedicalRtpPhaseForRecommendation,
getMedicalRtpPhaseOption,
getMedicalStatusForParticipation,
getMedicalStatusOption,
getMedicalStatusOptionForDate,
getPlatformFormValues,
isMedicalItemArchived,
normalizeMedicalOperationsTab,
normalizeMedicalParticipation,
normalizeMedicalPlayer,
normalizeMedicalPlayerModalTab,
openMedicalPlayerModal,
parseMedicalRosterText,
persistMedicalInjuryPlanDraftFromForm,
recordMedicalDatabaseSyncEvent,
removeMedicalInjuryPlan,
removeMedicalPlayer,
removeMedicalRecord,
renderMedicalTeamWorkspace,
setMedicalBulkNotSetSelection,
setMedicalBulkSelection,
setMedicalInjuryPlanDraftFromPlan,
setMedicalSelectedDate,
shiftMedicalSelectedDate,
toggleMedicalBulkPlayer,
updateMedicalBulkActivityControls,
updateMedicalGovernancePolicy,
updateMedicalInjuryPlan,
updateMedicalPlanClearance,
updateMedicalPlayerProfile,
upsertMedicalPlayers,
},
});
bindPlayerProfileRuntimeBindings({
workspaceElement: ui.playerProfilesWorkspace,
win,
state: {
getPendingPlayerProfileImportPlan: () => pendingPlayerProfileImportPlan,
setPendingPlayerProfileImportPlan: (plan) => { pendingPlayerProfileImportPlan = plan; },
getPlayerProfilesState: () => playerProfilesState,
setPlayerProfileActiveTab: (tab) => { playerProfileActiveTab = tab; },
setPlayerProfileAutosaveLastSignature: (signature) => { playerProfileAutosaveLastSignature = signature; },
getPlayerProfilesTemporarySectionCollapsed: () => playerProfilesTemporarySectionCollapsed,
setPlayerProfilesTemporarySectionCollapsed: (isCollapsed) => { playerProfilesTemporarySectionCollapsed = isCollapsed; },
setPlayerProfilesSearchQuery: (query) => { playerProfilesSearchQuery = query; },
setPlayerProfilesRoleGroupFilter: (filter) => { playerProfilesRoleGroupFilter = filter; },
setPlayerProfilesRosterFilter: (filter) => { playerProfilesRosterFilter = filter; },
setPlayerProfileModalOpen: (isOpen) => { playerProfileModalOpen = isOpen; },
setPlayerProfileNewPlayerModalOpen: (isOpen) => { playerProfileNewPlayerModalOpen = isOpen; },
},
helpers: {
getPlayerProfileFormSignature,
isTemporaryPlayerProfile,
normalizePlayerProfileTab,
},
actions: {
addPlayerProfile,
applyPlayerProfileImportUndo,
buildPlayerProfileImportFeedback,
buildPlayerProfileOperationFeedback,
canEditPlayerProfiles,
closePlayerProfileModal,
closePlayerProfileNewPlayerModal,
ensurePlayerProfilesState,
exportSquadDataFoundationJson,
exportSquadSessionPlannerCsv,
flushPlayerProfileAutosave,
getPlatformFormValues,
handlePhotoInput,
importSquadDataFoundationFile,
importSquadDataFoundationPayload,
isCurrentPlatformUserAdmin,
openPlayerProfileModal,
openPlayerProfileNewPlayerModal,
queuePlayerProfileAutosave,
removePlayerProfile,
renderPlayerProfilesRosterListOnly,
renderPlayerProfilesWorkspace,
savePlayerProfileEditForm,
uploadSquadTeamLogo,
},
});
bindSessionPlannerRuntimeBindings({
workspaceElement: ui.sessionPlannerWorkspace,
win,
canEditSessionPlanner,
localUiState: sessionPlannerLocalUiState,
runtimeDelegates: sessionPlannerRuntimeDelegates,
exerciseLibrary: exerciseLibraryRuntimeFacade,
exerciseLibraryActions,
periodizationBridge: sessionPlannerPeriodizationBridge,
boardHistory: {
undo: undoSessionPlannerBoardHistory,
redo: redoSessionPlannerBoardHistory,
},
normalizers: {
cleanPlayerBoardFormationInput: cleanSessionPlannerPlayerBoardFormationInput,
normalizePlayerBoardAutoMode: normalizeSessionPlannerPlayerBoardAutoMode,
normalizePlayerBoardFormationValue: normalizeSessionPlannerPlayerBoardFormationValue,
normalizePlayerBoardTeamCount: normalizeSessionPlannerPlayerBoardTeamCount,
normalizeTacticalColor,
normalizeTacticalLineWidth,
},
getPlayerBadgeFromKeyboardEvent: getSessionPlannerTacticalPlayerBadgeFromKeyboardEvent,
getSelectedDate: () => sessionPlannerState?.selectedDate,
getMultiSelectOpenField: () => sessionPlannerMultiSelectOpenField,
setMultiSelectOpenField: (field) => {
sessionPlannerMultiSelectOpenField = field;
},
});
periodizationWorkspaceController.bind();
scheduleWorkspaceController.bind();
ui.dashboardChatWidgetRoot?.addEventListener("change", async (event) => {
const attachmentInput = event.target.closest("[data-dashboard-chat-attachment-input]");
if (!attachmentInput) {
return;
}
await handleDashboardChatAttachmentInputChange(attachmentInput);
});
workspaceModuleRuntimeController.bindWorkspaceModuleEvents();
document.addEventListener("keydown", (event) => {
const key = String(event.key || "").toLowerCase();
if (key === "enter" && isSimulatorIntroActive() && !isEditableKeyboardTarget(event.target)) {
event.preventDefault();
launchGameSimulatorFromIntro();
return;
}
if (event.key === "Escape" && isProfileMenuOpen()) {
setProfileMenuOpen(false);
ui.profileMenuButton?.focus();
}
if (event.key === "Escape" && medicalPlayerModalOpen) {
medicalPlayerModalOpen = false;
medicalPlayerModalTab = "availability";
renderMedicalTeamWorkspace();
}
if (event.key === "Escape" && playerProfileModalOpen) {
closePlayerProfileModal();
}
if (event.key === "Escape" && playerProfileNewPlayerModalOpen) {
closePlayerProfileNewPlayerModal();
}
if (event.key === "Escape" && periodizationDayOverlayOpen) {
periodizationDayOverlayOpen = false;
periodizationDayOverlayMode = "view";
renderPeriodizationWorkspace();
}
if (event.key === "Escape" && hasActiveMetricTooltip()) {
hideMetricTooltip({ force: true });
}
});
document.querySelectorAll(".hub-rail-button").forEach((button) => {
button.addEventListener("click", () => {
setActiveWorkspace(button.dataset.openWorkspace);
});
});
win.addEventListener("blur", () => {
setProfileMenuOpen(false);
});
win.addEventListener("platform:user-change", () => {
syncPlatformUserFromAuth();
syncAccountMenu();
setProfileMenuOpen(false);
if (getCurrentPlatformUser()) {
startDashboardPresenceRuntime();
} else {
stopDashboardPresenceRuntime();
}
if (getCurrentPlatformUser() && getCentralStateBridge()?.isHydrated?.()) {
reloadCentralizedAppStateFromStorage();
return;
}
if (hubState) {
if (!getCurrentPlatformUser()) {
hubState.activeWorkspaceId = "home";
}
renderWorkspaceChrome();
}
scheduleDashboardLoginPopups();
});
win.addEventListener("footballscience:central-state-ready", () => {
dataSafetyRuntimeStatus.lastError = "";
retryCentral();
flushCentralStateWrites();
startDashboardPresenceRuntime();
refreshDashboardPresence({ forceRender: true }).catch(() => {});
requestCentralizedAppStateReload();
refreshDataSafetyStatus();
});
document.addEventListener("focusout", () => {
win.setTimeout(flushDeferredCentralizedAppStateReload, 180);
}, true);
document.addEventListener("pointerup", () => {
win.setTimeout(flushDeferredCentralizedAppStateReload, 180);
}, true);
win.addEventListener("focus", () => {
applyPlatformThemeByTime();
markDashboardPresenceActivity();
startDashboardPresenceRuntime();
pushDashboardPresence("online").catch(() => {});
refreshDashboardPresence({ forceRender: true }).catch(() => {});
queueDashboardChatCurrentViewRefresh({ delayMs: 250 });
refreshCentralStateFromSource("focus");
win.setTimeout(flushDeferredCentralizedAppStateReload, 180);
});
win.addEventListener("blur", () => {
pushDashboardPresence("away", { force: true }).catch(() => {});
});
document.addEventListener("visibilitychange", () => {
if (document.visibilityState !== "visible") {
pushDashboardPresence("away", { force: true }).catch(() => {});
pauseDashboardPresenceRuntime();
renderDashboardChatWidget();
return;
}
applyPlatformThemeByTime();
markDashboardPresenceActivity();
startDashboardPresenceRuntime();
pushDashboardPresence("online").catch(() => {});
refreshDashboardPresence({ forceRender: true }).catch(() => {});
if (document.visibilityState !== "visible") {
return;
}
queueDashboardChatCurrentViewRefresh({ delayMs: 250 });
refreshCentralStateFromSource("visibility");
win.setTimeout(flushDeferredCentralizedAppStateReload, 180);
});
["pointerdown", "keydown", "mousemove", "touchstart"].forEach((eventName) => {
document.addEventListener(
eventName,
() => {
markDashboardPresenceActivity();
},
{ passive: true }
);
});
centralStateRefreshTimer = win.setInterval(() => {
refreshCentralStateFromSource("interval");
}, centralStateRefreshIntervalMs);
win.addEventListener("storage", (event) => {
if (isDataSafetyProtectedStorageKey(event.key)) {
queueDataSafetyStatusRefresh();
if (event.key === sessionPlannerStorageKey) {
queueDataSafetySnapshot("cross-tab-update");
}
}
if (event.key === dashboardChatStorageKey) {
dashboardChatRuntimeMessages = [];
purgeDashboardDeletedMessagesFromStorage();
renderDashboardChatWidget();
syncDashboardChatWidgetNotificationCursor();
platformNavigationController.renderTopIconMenu();
return;
}
if (event.key === dashboardChatDeletedMessageIdsStorageKey) {
purgeDashboardDeletedMessagesFromStorage();
renderDashboardChatWidget();
syncDashboardChatWidgetNotificationCursor();
platformNavigationController.renderTopIconMenu();
return;
}
if (
event.key === dashboardTaskStorageKey ||
event.key === dashboardNotificationSeenStorageKey ||
event.key === playerProfilesStorageKey ||
event.key === scoutingStorageKey ||
event.key === transferRoomStorageKey
) {
if (event.key === playerProfilesStorageKey) {
playerProfilesState = readPlayerProfilesState();
if (hubState?.activeWorkspaceId === "transfer-room") {
syncTransferRoomLinkedState({ render: true });
return;
}
if (hubState?.activeWorkspaceId === "medical-team") {
renderMedicalTeamWorkspace();
return;
}
if (hubState?.activeWorkspaceId === "player-profiles") {
renderPlayerProfilesWorkspace();
return;
}
}
if (event.key === scoutingStorageKey && hubState?.activeWorkspaceId === "transfer-room") {
scoutingState = readScoutingState();
syncTransferRoomLinkedState({ render: true });
return;
}
if (event.key === scoutingStorageKey && hubState?.activeWorkspaceId === "scouting") {
scoutingState = preserveScoutingTransientUiState(readScoutingState(), scoutingState);
if (shouldDeferCentralizedAppStateReload()) {
centralizedAppStateReloadPending = true;
return;
}
renderScoutingWorkspace();
return;
}
if (event.key === transferRoomStorageKey && hubState?.activeWorkspaceId === "transfer-room") {
transferRoomState = readTransferRoomState();
renderTransferRoomWorkspace();
return;
}
if (hubState?.activeWorkspaceId === "home") {
markDashboardHomeSeenForCurrentUser();
renderDashboardCards();
}
platformNavigationController.renderTopIconMenu();
}
});
win.addEventListener("pagehide", () => {
pushDashboardPresence("away").catch(() => {});
if (centralSyncRuntimeService.clearCentralStateWriteTimer()) {
flushCentralStateWrites();
}
flushQueuedDataSafetySnapshot("pagehide");
});
document.addEventListener("click", (event) => {
if (!ui.profileMenu || !isProfileMenuOpen()) {
return;
}
if (event.target.closest(".platform-account-menu")) {
return;
}
setProfileMenuOpen(false);
});
refreshDataSafetyStatus();
initializeWorkspaceHub();
startDashboardPresenceRuntime();
if (hubState?.activeWorkspaceId === "game-simulator") {
queueGameSimulatorControllersLoad();
render();
startSimulatorAnimationLoop();
}
