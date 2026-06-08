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
import { createPeriodizationWorkspaceController } from "./src/modules/periodization/periodization-controller.mjs";
import { createPeriodizationRenderer } from "./src/modules/periodization/periodization-renderer.mjs";
import { createPeriodizationSessionBridge } from "./src/modules/periodization/periodization-session-bridge.mjs";
import { createPeriodizationWorkspaceShell } from "./src/modules/periodization/periodization-workspace-shell.mjs";
import {
  createExerciseLibraryActions,
  createExerciseLibraryRenderer,
  createExerciseLibraryReviewHelpers,
  createExerciseLibraryRuntimeFacade,
  createExerciseLibraryRuntimeController,
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
import { bindSessionPlannerRuntimeBindings, createSessionPlannerAutosaveBoundary, createSessionPlannerBlockHelpers, createSessionPlannerBoardHistoryController, createSessionPlannerLocalUiState, createSessionPlannerRuntimeDelegates, createSessionPlannerRuntimeRenderers, createSessionPlannerStateMergeHelpers, createSessionPlannerTacticalController, createSessionPlannerToastController, createSessionPlannerWorkspaceController, createSessionPlannerSessionFactory, createSessionPlannerTacticalHelpers, createSessionPlannerVisualUploadHelpers, formatSessionPlannerHistoryTime as formatSessionPlannerHistoryTimeFromModule, getSessionPlannerHistoryActionLabel as getSessionPlannerHistoryActionLabelFromModule, getSessionPlannerHistoryActorLabel as getSessionPlannerHistoryActorLabelFromModule, sessionPlannerPlayerBoardAutoModeOptions, sessionPlannerPlayerBoardColorOptions, sessionPlannerPlayerBoardMaxTeamCount, sessionPlannerPrintPaperOptions, sessionPlannerPrintSectionOptions, sessionPlannerStorageKey, sessionPlannerTacticalMaxFrames, sessionPlannerTacticalPitchDimensions, sessionPlannerTacticalPitchModeKeys, sessionPlannerTacticalPitchModeOptions, sessionPlannerTacticalSnapStep } from "./src/modules/session-planner/index.mjs";
import { createPlatformModuleLoader } from "./src/core/platform-module-loader.mjs";
import { createPlatformShellRuntime } from "./src/core/platform-shell-runtime.mjs";
import { createWorkspaceModuleRuntimeController } from "./src/core/workspace-module-runtime-controller.mjs";
import { createWorkspaceShellController } from "./src/core/workspace-shell-controller.mjs";
import { bindPlatformNavigationInteractions } from "./src/core/platform-navigation-bindings.mjs";
import { createPlatformUiBindings } from "./src/core/platform-ui-bindings.mjs";
import { createPlatformAutosaveStatusController } from "./src/core/platform-autosave-status.mjs";
import { addCalendarDays, clamp, escapeHtml, formatDashboardDateTime, formatDashboardTime, logEvent, setFormSubmitButtonState } from "./src/core/runtime-ui-helpers.mjs";
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
import { createDefaultPlatformAppearanceConfig, getHomeAppearanceImpactSummary, normalizePlatformAppearanceConfig, normalizePlatformAppearanceValue, platformAppearanceDensityOptions, platformAppearanceHomeComponentTypeIds, platformAppearanceHomeSectionDefaults, platformAppearanceThemeOptions, platformAppearanceToneOptions } from "./src/core/appearance-governance.mjs";
import { getAdminUserInitials as getAdminUserInitialsFromModule } from "./src/modules/admin/index.mjs";
import { createProfileImageDataUrl as createProfileImageDataUrlFromModule, createProfileStaffWorkspaceController } from "./src/modules/profile/index.mjs";
import {
  createSquadDataFoundationHelpers,
  createSquadImportPlanner,
  createPlayerProfileHelpers,
  createPlayerProfileIntelligenceHelpers,
  createSquadScoutingRuntime,
  buildPlayerProfileImportFeedback as buildPlayerProfileImportFeedbackMessage,
  buildPlayerProfileImportPreviewMessage,
  buildPlayerProfileOperationFeedback,
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
  squadFormationOptions,
} from "./src/modules/squad/index.mjs";
import {
  createMedicalRuntimeActivitySelectors,
  createMedicalRuntimeHelpers,
  createMedicalRuntimeRenderers,
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
let dataSafetyNativeGetItem = null;
let dataSafetyNativeSetItem = null;
let dataSafetyNativeRemoveItem = null;
let dataSafetyNativeClear = null;
let dataSafetyNativeKey = null;
let dataSafetySnapshotTimer = null;
let dataSafetyStatusTimer = null;
let dataSafetyDbPromise = null;
let dataSafetyInstalled = false;
let platformUser = null;
const dataSafetyRuntimeStatus = {
lastError: "",
lastSnapshotError: "",
};
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
function getDataSafetyStorage() {
try {
return win.localStorage;
} catch {
return null;
}
}
function getDataSafetyNow() { return new Date().toISOString(); }
function isDataSafetyInternalStorageKey(key) {
const normalizedKey = String(key || "");
return normalizedKey === dataSafetyStorageKey || normalizedKey.startsWith("football-data-safety-");
}
function isDataSafetyProtectedStorageKey(key) {
const normalizedKey = String(key || "");
if (!normalizedKey || isDataSafetyInternalStorageKey(normalizedKey)) {
return false;
}
return dataSafetyProtectedStorageKeySet.has(normalizedKey);
}
function rawDataSafetyGetItem(key) {
const storage = getDataSafetyStorage();
if (!storage || !dataSafetyNativeGetItem) {
return null;
}
return dataSafetyNativeGetItem.call(storage, key);
}
function rawDataSafetySetItem(key, value) {
const storage = getDataSafetyStorage();
if (!storage || !dataSafetyNativeSetItem) {
return;
}
dataSafetyNativeSetItem.call(storage, key, value);
}
function rawDataSafetyRemoveItem(key) {
const storage = getDataSafetyStorage();
if (!storage || !dataSafetyNativeRemoveItem) {
return;
}
dataSafetyNativeRemoveItem.call(storage, key);
}
function rawDataSafetyKey(index) {
const storage = getDataSafetyStorage();
if (!storage || !dataSafetyNativeKey) {
return null;
}
return dataSafetyNativeKey.call(storage, index);
}
function createDataSafetyManifest() {
return {
version: 1,
createdAt: getDataSafetyNow(),
updatedAt: "",
lastSavedAt: "",
lastSnapshotAt: "",
lastExportAt: "",
lastImportedAt: "",
lastCentralSyncedAt: "",
lastKey: "",
lastError: "",
lastSnapshotError: "",
lastCentralError: "",
persistentStorage: null,
entries: {},
};
}
function readDataSafetyManifest() {
try {
const raw = rawDataSafetyGetItem(dataSafetyStorageKey);
if (!raw) {
return createDataSafetyManifest();
}
const parsed = JSON.parse(raw);
return {
...createDataSafetyManifest(),
...parsed,
entries: parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {},
};
} catch {
return createDataSafetyManifest();
}
}
function writeDataSafetyManifest(manifest) {
const normalizedManifest = {
...createDataSafetyManifest(),
...manifest,
updatedAt: getDataSafetyNow(),
};
try {
rawDataSafetySetItem(dataSafetyStorageKey, JSON.stringify(normalizedManifest));
} catch (error) {
dataSafetyRuntimeStatus.lastError = error?.message || "Data safety manifest could not be saved.";
}
}
function mutateDataSafetyManifest(mutator) {
const manifest = readDataSafetyManifest();
mutator(manifest);
writeDataSafetyManifest(manifest);
return manifest;
}
function hashDataSafetyString(value) {
const text = String(value ?? "");
let hash = 2166136261;
for (let index = 0; index < text.length; index += 1) {
hash ^= text.charCodeAt(index);
hash = Math.imul(hash, 16777619);
}
return (hash >>> 0).toString(36);
}
function getDataSafetyStorageLabel(key) { return dataSafetyStorageLabels[key] || key.replace(/^football-/, "").replaceAll("-", " "); }
let centralStateWriteTimer = null, centralStateRefreshTimer = null, centralStateLastRefreshAt = 0, centralStateRefreshInFlight = false;
const centralStateWriteQueue = new Map(), centralStateWriteSuppressionKeys = new Set();
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
function getCentralStateBridge() { return win.footballScienceCentralState ?? null; }
function getCentralStateMetadataForKey(key) {
const metadata = getCentralStateBridge()?.getStatus?.()?.metadata;
const entry = metadata?.[String(key || "")];
return entry && typeof entry === "object" ? entry : {};
}
function getCentralStateRevisionForKey(key) {
const revision = Number(getCentralStateMetadataForKey(key).revision);
return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}
function canWriteCentralBackedCache() {
if (win.__footballScienceCentralHydrating) {
return true;
}
const bridge = getCentralStateBridge();
return Boolean(getCurrentPlatformUser() && bridge?.syncKey);
}
function createCentralBackedStorageError() { return new Error("Central sync is not ready."); }
function setCentralSyncPendingState(key, isPending = false, isRemoved = false) {
const normalizedKey = String(key || "");
mutateDataSafetyManifest((manifest) => {
const currentEntry = manifest.entries[normalizedKey] || {};
manifest.entries[normalizedKey] = {
...(currentEntry?.label ? currentEntry : { label: getDataSafetyStorageLabel(normalizedKey), writes: 0, size: 0, hash: "", updatedAt: "", deletedAt: "" }),
...currentEntry,
pendingCentralSync: Boolean(isPending),
deletedAt: isRemoved ? getDataSafetyNow() : currentEntry.deletedAt || "",
};
});
queueDataSafetyStatusRefresh();
}
function queueCentralStateStatus(error = "") {
mutateDataSafetyManifest((manifest) => {
if (error) {
manifest.lastCentralError = error;
return;
}
manifest.lastCentralError = "";
manifest.lastCentralSyncedAt = getDataSafetyNow();
});
queueDataSafetyStatusRefresh();
}
function hasPendingCentralStateWrites() {
if (centralStateWriteTimer || centralStateWriteQueue.size) {
return true;
}
return Object.values(readDataSafetyManifest().entries || {}).some((entry) => entry?.pendingCentralSync);
}
function retryCentral() {
if (centralStateWriteTimer || centralStateWriteQueue.size || win.__footballScienceCentralHydrating || !getCurrentPlatformUser() || !getCentralStateBridge()?.syncKey) return;
for (const [key, entry] of Object.entries(readDataSafetyManifest().entries)) {
const value = rawDataSafetyGetItem(key);
if (entry?.pendingCentralSync && (entry.deletedAt || value !== null)) queueCentralStateWrite(key, value ?? "", { removed: !!entry.deletedAt });
}
}
function applyCentralSyncedStateValue(write = {}, syncedValue) {
const key = String(write.key || "");
if (!key || write.removed || typeof syncedValue !== "string") {
return;
}
if (centralStateWriteQueue.has(key) || rawDataSafetyGetItem(key) !== write.value || syncedValue === write.value) {
return;
}
const valueToApply =
key === scheduleStorageKey
? mergeScheduleStatePreservingLocalUi(rawDataSafetyGetItem(key), syncedValue)
: key === periodizationStorageKey
? mergePeriodizationStatePreservingLocalUi(rawDataSafetyGetItem(key), syncedValue)
: syncedValue;
win.__footballScienceCentralHydrating = true;
try {
rawDataSafetySetItem(key, valueToApply);
} finally {
win.__footballScienceCentralHydrating = false;
}
mutateDataSafetyManifest((manifest) => {
const currentEntry = manifest.entries[key] || {};
manifest.entries[key] = {
...(currentEntry?.label ? currentEntry : { label: getDataSafetyStorageLabel(key), writes: 0 }),
...currentEntry,
updatedAt: getDataSafetyNow(),
size: valueToApply.length,
hash: hashDataSafetyString(valueToApply),
pendingCentralSync: false,
};
});
queueDataSafetySnapshot("central-merge");
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
function getCentralSyncResultValue(result = {}) {
const candidates = [
result?.value,
result?.currentValue,
result?.serverValue,
result?.data?.value,
result?.record?.value,
];
return candidates.find((value) => typeof value === "string") ?? "";
}
function getCentralSyncResultRevision(result = {}) {
const revision = Number(result?.currentRevision ?? result?.revision ?? result?.metadata?.revision);
return Number.isInteger(revision) && revision > 0 ? revision : 0;
}
function showSessionPlannerCentralSyncNotice(message = "Session synced with the latest team changes.", tone = "warning") {
const now = Date.now();
if (now - sessionPlannerCentralSyncNoticeAt < 12000) {
return;
}
sessionPlannerCentralSyncNoticeAt = now;
if (hubState?.activeWorkspaceId === "session-planner") {
showSessionPlannerToast(message, tone);
}
}
async function retryCentralStateWriteAfterConflict(write = {}, result = {}, bridge = getCentralStateBridge()) {
if (String(write.key || "") !== sessionPlannerStorageKey || write.removed || Number(write.retryCount || 0) > 0) {
return null;
}
const retryBaseRevision = getCentralSyncResultRevision(result);
if (!retryBaseRevision || !bridge?.syncKey) {
return null;
}
const retryResult = await bridge.syncKey(write.key, write.value, {
removed: false,
baseRevision: retryBaseRevision,
});
if (!retryResult?.ok) {
return retryResult || null;
}
applyCentralSyncedStateValue(write, retryResult.value);
if (retryResult?.merged) {
showSessionPlannerCentralSyncNotice("Session synced with the latest team changes.");
}
return retryResult;
}
function registerSessionPlannerCentralSyncConflict(write = {}, result = {}) {
if (String(write.key || "") !== sessionPlannerStorageKey) {
return;
}
sessionPlannerLocalUiState.state.sessionPlannerCentralSyncConflict = null;
showSessionPlannerCentralSyncNotice(
result?.reason ? `Session sync needs attention: ${result.reason}` : "Session sync needs attention. Your latest edit stayed local.",
"warning"
);
}
function queueCentralStateWrite(key, value, options = {}) {
if (win.__footballScienceCentralHydrating) {
return;
}
const normalizedKey = String(key || "");
if (!isDataSafetyProtectedStorageKey(normalizedKey)) {
return;
}
const bridge = getCentralStateBridge();
if (typeof bridge?.isCentralKey === "function" && !bridge.isCentralKey(normalizedKey)) {
return;
}
if (!getCurrentPlatformUser() || !bridge?.syncKey) {
queueCentralStateStatus("Central sync unavailable.");
setPlatformAutosaveStatusForKey(normalizedKey, "issue", "Central sync unavailable.");
return;
}
setPlatformAutosaveStatusForKey(normalizedKey, "saving", "Saving");
setCentralSyncPendingState(normalizedKey, true, Boolean(options.removed));
centralStateWriteQueue.set(normalizedKey, {
key: normalizedKey,
value: String(value ?? ""),
removed: Boolean(options.removed),
baseRevision: getCentralStateRevisionForKey(normalizedKey),
});
if (centralStateWriteTimer) {
win.clearTimeout(centralStateWriteTimer);
}
centralStateWriteTimer = win.setTimeout(flushCentralStateWrites, 120);
}
async function flushCentralStateWrites() {
centralStateWriteTimer = null;
const bridge = getCentralStateBridge();
if (!bridge?.syncKey || !centralStateWriteQueue.size) {
return;
}
const writes = Array.from(centralStateWriteQueue.values());
const touchedSessionPlannerAutosave = writes.some((write) => isSessionPlannerAutosaveKey(write.key));
centralStateWriteQueue.clear();
for (let index = 0; index < writes.length; index += 1) {
const write = writes[index];
const result = await bridge.syncKey(write.key, write.value, {
removed: write.removed,
baseRevision: write.baseRevision,
});
if (!result?.ok) {
if (result?.conflict || result?.status === 409) {
const retryResult = await retryCentralStateWriteAfterConflict(write, result, bridge);
setCentralSyncPendingState(write.key, false, write.removed);
if (retryResult?.ok) {
queueCentralStateStatus("");
setPlatformAutosaveStatusForKey(write.key, "saved", "Saved");
continue;
}
queueCentralStateStatus(result?.reason || "Central newer.");
registerSessionPlannerCentralSyncConflict(write, result);
setPlatformAutosaveStatusForKey(write.key, "issue", "Sync needs attention");
if (write.key !== sessionPlannerStorageKey) {
await bridge.hydrate?.({ forceApply: true }).catch(() => {});
}
continue;
}
for (let retryIndex = index; retryIndex < writes.length; retryIndex += 1) {
const retryWrite = writes[retryIndex];
centralStateWriteQueue.set(retryWrite.key, retryWrite);
}
queueCentralStateStatus(result?.reason || "Sync failed.");
setPlatformAutosaveStatusForKey(write.key, "issue", result?.reason || "Sync failed.");
return;
}
applyCentralSyncedStateValue(write, result.value);
if (result?.merged && write.key === sessionPlannerStorageKey && hubState?.activeWorkspaceId === "session-planner") {
showSessionPlannerToast("Central sync merged.", "warning");
}
setCentralSyncPendingState(write.key, false, write.removed);
}
queueCentralStateStatus("");
if (touchedSessionPlannerAutosave) {
setPlatformAutosaveStatusForKey(sessionPlannerStorageKey, "saved", "Saved");
}
}
function recordDataSafetyWrite(key, value, options = {}) {
const normalizedKey = String(key || "");
if (!isDataSafetyProtectedStorageKey(normalizedKey)) {
return;
}
const textValue = String(value ?? "");
const now = getDataSafetyNow();
dataSafetyRuntimeStatus.lastError = "";
mutateDataSafetyManifest((manifest) => {
const previousEntry = manifest.entries[normalizedKey] || {};
manifest.lastSavedAt = now;
manifest.lastKey = normalizedKey;
manifest.lastError = "";
manifest.entries[normalizedKey] = {
label: getDataSafetyStorageLabel(normalizedKey),
updatedAt: now,
size: textValue.length,
hash: hashDataSafetyString(textValue),
writes: Number(previousEntry.writes || 0) + 1,
deletedAt: options.removed ? now : "",
};
});
queueDataSafetySnapshot(options.removed ? "after-remove" : "autosave");
if (!centralStateWriteSuppressionKeys.has(normalizedKey)) {
queueCentralStateWrite(normalizedKey, textValue, options);
}
queueDataSafetyStatusRefresh();
}
function handleDataSafetyWriteError(key, error) {
const message = error?.message || "Save failed.";
dataSafetyRuntimeStatus.lastError = message;
mutateDataSafetyManifest((manifest) => {
manifest.lastKey = String(key || "");
manifest.lastError = message;
});
queueDataSafetyStatusRefresh();
}
function collectFootballScienceStorageData() {
const storage = getDataSafetyStorage();
const data = {};
if (!storage) {
return data;
}
const keys = new Set(dataSafetyProtectedStorageKeys);
for (let index = 0; index < storage.length; index += 1) {
const key = rawDataSafetyKey(index);
if (isDataSafetyProtectedStorageKey(key)) {
keys.add(key);
}
}
keys.forEach((key) => {
const value = rawDataSafetyGetItem(key);
if (value !== null) {
data[key] = value;
}
});
return data;
}
function createFootballScienceBackupEnvelope(reason = "manual") {
const storage = collectFootballScienceStorageData();
const entries = Object.entries(storage).map(([key, value]) => ({
key,
label: getDataSafetyStorageLabel(key),
size: value.length,
hash: hashDataSafetyString(value),
}));
return {
schema: dataSafetyExportSchema,
app: "Football Science",
createdAt: getDataSafetyNow(),
reason,
source: win.location.href,
summary: {
keyCount: entries.length,
totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
entries,
},
storage,
};
}
function waitForDataSafetyTransaction(transaction) {
return new Promise((resolve, reject) => {
transaction.oncomplete = () => resolve();
transaction.onerror = () => reject(transaction.error);
transaction.onabort = () => reject(transaction.error);
});
}
function openDataSafetyDatabase() {
if (dataSafetyDbPromise) {
return dataSafetyDbPromise;
}
dataSafetyDbPromise = new Promise((resolve, reject) => {
if (!win.indexedDB) {
reject(new Error("IndexedDB is not available."));
return;
}
const request = win.indexedDB.open(dataSafetyDatabaseName, 1);
request.onupgradeneeded = () => {
const database = request.result;
if (!database.objectStoreNames.contains(dataSafetySnapshotStoreName)) {
database.createObjectStore(dataSafetySnapshotStoreName, { keyPath: "id" });
}
if (!database.objectStoreNames.contains(dataSafetyLatestStoreName)) {
database.createObjectStore(dataSafetyLatestStoreName, { keyPath: "id" });
}
};
request.onsuccess = () => resolve(request.result);
request.onerror = () => reject(request.error);
});
return dataSafetyDbPromise;
}
async function pruneDataSafetySnapshots(database) {
const keys = await new Promise((resolve, reject) => {
const transaction = database.transaction(dataSafetySnapshotStoreName, "readonly");
const request = transaction.objectStore(dataSafetySnapshotStoreName).getAllKeys();
request.onsuccess = () => resolve(Array.from(request.result || []));
request.onerror = () => reject(request.error);
});
if (keys.length <= dataSafetyMaxSnapshots) {
return;
}
const keysToDelete = keys.sort().slice(0, keys.length - dataSafetyMaxSnapshots);
const transaction = database.transaction(dataSafetySnapshotStoreName, "readwrite");
const store = transaction.objectStore(dataSafetySnapshotStoreName);
keysToDelete.forEach((key) => store.delete(key));
await waitForDataSafetyTransaction(transaction);
}
async function saveDataSafetySnapshot(reason = "autosave") {
const snapshot = {
...createFootballScienceBackupEnvelope(reason),
id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
};
try {
const database = await openDataSafetyDatabase();
const transaction = database.transaction(
[dataSafetySnapshotStoreName, dataSafetyLatestStoreName],
"readwrite"
);
transaction.objectStore(dataSafetySnapshotStoreName).put(snapshot);
transaction.objectStore(dataSafetyLatestStoreName).put({ ...snapshot, id: "latest" });
await waitForDataSafetyTransaction(transaction);
await pruneDataSafetySnapshots(database);
dataSafetyRuntimeStatus.lastError = "";
dataSafetyRuntimeStatus.lastSnapshotError = "";
mutateDataSafetyManifest((manifest) => {
manifest.lastSnapshotAt = snapshot.createdAt;
manifest.lastError = "";
manifest.lastSnapshotError = "";
});
queueDataSafetyStatusRefresh();
return true;
} catch (error) {
const message = error?.message || "Backup snapshot could not be saved.";
dataSafetyRuntimeStatus.lastSnapshotError = message;
mutateDataSafetyManifest((manifest) => {
manifest.lastSnapshotError = message;
});
queueDataSafetyStatusRefresh();
return false;
}
}
function queueDataSafetySnapshot(reason = "autosave") {
if (dataSafetySnapshotTimer) {
win.clearTimeout(dataSafetySnapshotTimer);
}
dataSafetySnapshotTimer = win.setTimeout(() => {
dataSafetySnapshotTimer = null;
saveDataSafetySnapshot(reason);
}, 900);
}
function formatDataSafetyTime(value) {
if (!value) {
return "";
}
const date = new Date(value);
if (Number.isNaN(date.getTime())) {
return "";
}
return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function refreshDataSafetyStatus() {
if (!ui.dataSafetyStatus) {
return;
}
const manifest = readDataSafetyManifest();
const centralStatus = getCentralStateBridge()?.getStatus?.() ?? {};
const error = dataSafetyRuntimeStatus.lastError || manifest.lastError;
const centralError = centralStatus.lastError || manifest.lastCentralError;
const snapshotWarning = dataSafetyRuntimeStatus.lastSnapshotError || manifest.lastSnapshotError;
const hasPendingCentralSync = Object.values(manifest.entries || {}).some((entry) => entry?.pendingCentralSync);
ui.dataSafetyStatus.classList.toggle("is-error", Boolean(error || centralError));
ui.dataSafetyStatus.classList.toggle(
"is-backed-up",
Boolean((centralStatus.lastSyncedAt || manifest.lastCentralSyncedAt) && !hasPendingCentralSync && !error && !centralError)
);
if (centralError) {
ui.dataSafetyStatus.textContent = "Sync needs attention";
ui.dataSafetyStatus.title = centralError;
return;
}
if (error) {
ui.dataSafetyStatus.textContent = "Autosave needs attention";
ui.dataSafetyStatus.title = error;
return;
}
const centralTime = formatDataSafetyTime(centralStatus.lastSyncedAt || manifest.lastCentralSyncedAt);
const snapshotTime = formatDataSafetyTime(manifest.lastSnapshotAt);
const savedTime = formatDataSafetyTime(manifest.lastSavedAt);
if (centralStatus.localDev) {
ui.dataSafetyStatus.textContent = "Local dev cache";
ui.dataSafetyStatus.title = "Localhost cache only.";
return;
}
if (hasPendingCentralSync) {
ui.dataSafetyStatus.textContent = savedTime ? `Sync pending ${savedTime}` : "Sync pending";
ui.dataSafetyStatus.title = "Saved locally; waiting for Supabase.";
return;
}
if (centralTime) {
ui.dataSafetyStatus.textContent = `Central sync ${centralTime}`;
ui.dataSafetyStatus.title = "Synced centrally.";
return;
}
if (snapshotTime) {
ui.dataSafetyStatus.textContent = `Central cache ${snapshotTime}`;
ui.dataSafetyStatus.title = "Browser cache snapshot exists.";
return;
}
if (savedTime) {
ui.dataSafetyStatus.textContent = `Waiting for central sync ${savedTime}`;
ui.dataSafetyStatus.title = snapshotWarning
? `Supabase is the source of truth. Browser cache snapshot issue: ${snapshotWarning}`
: "Waiting for central sync.";
return;
}
ui.dataSafetyStatus.textContent = "Sync ready";
ui.dataSafetyStatus.title = snapshotWarning
? `Supabase sync is ready. Browser cache snapshot issue: ${snapshotWarning}`
: "Sync starts after login.";
}
function queueDataSafetyStatusRefresh() {
if (dataSafetyStatusTimer) {
win.clearTimeout(dataSafetyStatusTimer);
}
dataSafetyStatusTimer = win.setTimeout(() => {
dataSafetyStatusTimer = null;
refreshDataSafetyStatus();
}, 120);
}
function requestDataSafetyPersistentStorage() {
if (!navigator.storage?.persist) {
return;
}
navigator.storage
.persist()
.then((granted) => {
mutateDataSafetyManifest((manifest) => {
manifest.persistentStorage = Boolean(granted);
});
queueDataSafetyStatusRefresh();
})
.catch(() => {
mutateDataSafetyManifest((manifest) => {
manifest.persistentStorage = false;
});
});
}
function exportFootballScienceDataBackup() {
try {
const backup = createFootballScienceBackupEnvelope("manual-export");
const backupText = JSON.stringify(backup, null, 2);
const blob = new Blob([backupText], { type: "application/json" });
const url = URL.createObjectURL(blob);
const datePart = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
const link = document.createElement("a");
link.href = url;
link.download = `football-science-backup-${datePart}.json`;
document.body.appendChild(link);
link.click();
link.remove();
win.setTimeout(() => URL.revokeObjectURL(url), 1000);
mutateDataSafetyManifest((manifest) => {
manifest.lastExportAt = backup.createdAt;
});
saveDataSafetySnapshot("manual-export");
refreshDataSafetyStatus();
} catch (error) {
const message = error?.message || "The backup could not be exported.";
dataSafetyRuntimeStatus.lastError = message;
refreshDataSafetyStatus();
win.alert(message);
}
}
function getStorageFromFootballScienceBackup(backup) {
if (!backup || typeof backup !== "object") {
return null;
}
if (backup.schema === dataSafetyExportSchema && backup.storage && typeof backup.storage === "object") {
return backup.storage;
}
if (backup.keys && typeof backup.keys === "object") {
return backup.keys;
}
return null;
}
async function importFootballScienceDataBackupFile(file) {
if (!file) {
return;
}
let backup;
try {
backup = JSON.parse(await file.text());
} catch {
win.alert("That file is not a valid Football Science backup.");
return;
}
const storage = getStorageFromFootballScienceBackup(backup);
const entries = Object.entries(storage || {}).filter(
([key, value]) => isDataSafetyProtectedStorageKey(key) && typeof value === "string"
);
if (!entries.length) {
win.alert("That backup did not contain any restorable Football Science data.");
return;
}
const createdAt = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : "unknown time";
const confirmed = win.confirm(
`Restore Football Science data from ${createdAt}?\n\nCurrent local data will be snapshotted first, then the page will reload.`
);
if (!confirmed) {
return;
}
await saveDataSafetySnapshot("before-restore");
try {
entries.forEach(([key, value]) => {
rawDataSafetySetItem(key, value);
recordDataSafetyWrite(key, value);
});
mutateDataSafetyManifest((manifest) => {
manifest.lastImportedAt = getDataSafetyNow();
manifest.lastError = "";
});
await saveDataSafetySnapshot("after-restore");
win.alert("Backup restored. The page will reload now.");
win.setTimeout(() => win.location.reload(), 250);
} catch (error) {
const message = error?.message || "The backup could not be restored.";
dataSafetyRuntimeStatus.lastError = message;
refreshDataSafetyStatus();
win.alert(message);
}
}
function migrateDataSafetyLegacyStorageKeys() {
Object.entries(dataSafetyLegacyStorageKeys).forEach(([currentKey, legacyKeys]) => {
if (rawDataSafetyGetItem(currentKey) !== null) {
return;
}
const legacyKey = legacyKeys.find((key) => rawDataSafetyGetItem(key) !== null);
if (!legacyKey) {
return;
}
const legacyValue = rawDataSafetyGetItem(legacyKey);
try {
rawDataSafetySetItem(currentKey, legacyValue);
recordDataSafetyWrite(currentKey, legacyValue);
mutateDataSafetyManifest((manifest) => {
manifest.entries[currentKey] = {
...(manifest.entries[currentKey] || {}),
migratedFrom: legacyKey,
migratedAt: getDataSafetyNow(),
};
});
} catch (error) {
handleDataSafetyWriteError(currentKey, error);
}
});
}
function installFootballDataSafety() {
if (dataSafetyInstalled || typeof window === "undefined" || typeof Storage === "undefined") {
return;
}
const storage = getDataSafetyStorage();
if (!storage) {
return;
}
dataSafetyNativeGetItem = Storage.prototype.getItem;
dataSafetyNativeSetItem = Storage.prototype.setItem;
dataSafetyNativeRemoveItem = Storage.prototype.removeItem;
dataSafetyNativeClear = Storage.prototype.clear;
dataSafetyNativeKey = Storage.prototype.key;
Storage.prototype.setItem = function patchedDataSafetySetItem(key, value) {
const normalizedKey = String(key || "");
const normalizedValue = String(value ?? "");
if (this !== storage || !isDataSafetyProtectedStorageKey(normalizedKey)) {
return dataSafetyNativeSetItem.call(this, key, value);
}
if (!canWriteCentralBackedCache()) {
const error = createCentralBackedStorageError();
handleDataSafetyWriteError(normalizedKey, error);
throw error;
}
const previousValue = rawDataSafetyGetItem(normalizedKey);
try {
const result = dataSafetyNativeSetItem.call(this, normalizedKey, normalizedValue);
if (previousValue !== normalizedValue) {
recordDataSafetyWrite(normalizedKey, normalizedValue);
}
return result;
} catch (error) {
handleDataSafetyWriteError(normalizedKey, error);
throw error;
}
};
Storage.prototype.removeItem = function patchedDataSafetyRemoveItem(key) {
const normalizedKey = String(key || "");
if (this !== storage || !isDataSafetyProtectedStorageKey(normalizedKey)) {
return dataSafetyNativeRemoveItem.call(this, key);
}
if (!canWriteCentralBackedCache()) {
const error = createCentralBackedStorageError();
handleDataSafetyWriteError(normalizedKey, error);
throw error;
}
const previousValue = rawDataSafetyGetItem(normalizedKey);
if (previousValue !== null) {
saveDataSafetySnapshot("before-remove");
}
const result = dataSafetyNativeRemoveItem.call(this, normalizedKey);
if (previousValue !== null) {
recordDataSafetyWrite(normalizedKey, "", { removed: true });
}
return result;
};
Storage.prototype.clear = function patchedDataSafetyClear() {
const removedKeys = this === storage ? Object.keys(collectFootballScienceStorageData()) : [];
if (this === storage && removedKeys.length && !canWriteCentralBackedCache()) {
const error = createCentralBackedStorageError();
handleDataSafetyWriteError(removedKeys[0], error);
throw error;
}
if (this === storage && Object.keys(collectFootballScienceStorageData()).length) {
saveDataSafetySnapshot("before-clear");
}
const result = dataSafetyNativeClear.call(this);
if (this === storage) {
mutateDataSafetyManifest((manifest) => {
manifest.lastSavedAt = getDataSafetyNow();
manifest.lastKey = "localStorage.clear";
manifest.entries = {};
});
removedKeys.forEach((key) => queueCentralStateWrite(key, "", { removed: true }));
queueDataSafetyStatusRefresh();
}
return result;
};
dataSafetyInstalled = true;
migrateDataSafetyLegacyStorageKeys();
mutateDataSafetyManifest((manifest) => {
manifest.lastSeenAt = getDataSafetyNow();
});
requestDataSafetyPersistentStorage();
queueDataSafetySnapshot("startup");
refreshDataSafetyStatus();
win.footballScienceDataSafety = {
collect: collectFootballScienceStorageData,
createBackup: createFootballScienceBackupEnvelope,
exportBackup: exportFootballScienceDataBackup,
importBackupFile: importFootballScienceDataBackupFile,
saveSnapshot: saveDataSafetySnapshot,
};
}
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
let sessionPlannerCentralSyncNoticeAt = 0;
let sessionPlannerSnapshotRecoveryQueued = false;
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
function getExerciseLibraryUiState() {
return {
open: sessionPlannerLocalUiState.state.sessionPlannerLibraryOpen,
selectedFolderId: sessionPlannerLocalUiState.state.sessionPlannerLibrarySelectedFolderId,
editExerciseId: sessionPlannerLocalUiState.state.sessionPlannerLibraryEditExerciseId,
viewExerciseId: sessionPlannerLocalUiState.state.sessionPlannerLibraryViewExerciseId,
editingFolderId: sessionPlannerLocalUiState.state.sessionPlannerLibraryEditingFolderId,
archiveView: sessionPlannerLocalUiState.state.sessionPlannerLibraryArchiveView,
filterOpen: sessionPlannerLocalUiState.state.sessionPlannerLibraryFilterOpen,
searchQuery: sessionPlannerLocalUiState.state.sessionPlannerLibrarySearchQuery,
sortMode: sessionPlannerLocalUiState.state.sessionPlannerLibrarySortMode,
pendingSave: sessionPlannerLocalUiState.state.sessionPlannerPendingLibrarySave,
phaseFilter: sessionPlannerLocalUiState.state.sessionPlannerLibraryPhaseFilter,
subPhaseFilter: sessionPlannerLocalUiState.state.sessionPlannerLibrarySubPhaseFilter,
phaseFilters: sessionPlannerLocalUiState.state.sessionPlannerLibraryPhaseFilters,
subPhaseFilters: sessionPlannerLocalUiState.state.sessionPlannerLibrarySubPhaseFilters,
};
}
function setExerciseLibraryUiState(nextState = {}) {
if (Object.prototype.hasOwnProperty.call(nextState, "open")) sessionPlannerLocalUiState.state.sessionPlannerLibraryOpen = Boolean(nextState.open);
if (Object.prototype.hasOwnProperty.call(nextState, "selectedFolderId")) sessionPlannerLocalUiState.state.sessionPlannerLibrarySelectedFolderId = nextState.selectedFolderId;
if (Object.prototype.hasOwnProperty.call(nextState, "editExerciseId")) sessionPlannerLocalUiState.state.sessionPlannerLibraryEditExerciseId = nextState.editExerciseId;
if (Object.prototype.hasOwnProperty.call(nextState, "viewExerciseId")) sessionPlannerLocalUiState.state.sessionPlannerLibraryViewExerciseId = nextState.viewExerciseId;
if (Object.prototype.hasOwnProperty.call(nextState, "editingFolderId")) sessionPlannerLocalUiState.state.sessionPlannerLibraryEditingFolderId = nextState.editingFolderId;
if (Object.prototype.hasOwnProperty.call(nextState, "archiveView")) sessionPlannerLocalUiState.state.sessionPlannerLibraryArchiveView = nextState.archiveView;
if (Object.prototype.hasOwnProperty.call(nextState, "filterOpen")) sessionPlannerLocalUiState.state.sessionPlannerLibraryFilterOpen = nextState.filterOpen;
if (Object.prototype.hasOwnProperty.call(nextState, "searchQuery")) sessionPlannerLocalUiState.state.sessionPlannerLibrarySearchQuery = nextState.searchQuery;
if (Object.prototype.hasOwnProperty.call(nextState, "sortMode")) sessionPlannerLocalUiState.state.sessionPlannerLibrarySortMode = nextState.sortMode;
if (Object.prototype.hasOwnProperty.call(nextState, "pendingSave")) sessionPlannerLocalUiState.state.sessionPlannerPendingLibrarySave = nextState.pendingSave;
if (Object.prototype.hasOwnProperty.call(nextState, "phaseFilter")) sessionPlannerLocalUiState.state.sessionPlannerLibraryPhaseFilter = nextState.phaseFilter;
if (Object.prototype.hasOwnProperty.call(nextState, "subPhaseFilter")) sessionPlannerLocalUiState.state.sessionPlannerLibrarySubPhaseFilter = nextState.subPhaseFilter;
if (Object.prototype.hasOwnProperty.call(nextState, "phaseFilters")) sessionPlannerLocalUiState.state.sessionPlannerLibraryPhaseFilters = nextState.phaseFilters;
if (Object.prototype.hasOwnProperty.call(nextState, "subPhaseFilters")) sessionPlannerLocalUiState.state.sessionPlannerLibrarySubPhaseFilters = nextState.subPhaseFilters;
}
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
function isEditableKeyboardTarget(target) {
const element = target instanceof Element ? target : null;
if (!element) {
return false;
}
return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}
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
function cloneHubState(source = defaultHubState) {
return {
activeWorkspaceId: source.activeWorkspaceId,
sidebarCollapsed: Boolean(source.sidebarCollapsed),
profile: {
name: source.profile?.name ?? defaultHubState.profile.name,
shortName: source.profile?.shortName ?? defaultHubState.profile.shortName,
role: source.profile?.role ?? defaultHubState.profile.role,
},
workspaces: mergeWorkspaceDefinitions(source.workspaces ?? defaultHubState.workspaces).map((workspace) => ({
id: workspace.id,
kind: workspace.kind,
title: workspace.title,
meta: workspace.meta,
description: workspace.description,
status: workspace.status,
icon: workspace.icon,
requiresAdmin: Boolean(workspace.requiresAdmin),
hiddenFromNav: Boolean(workspace.hiddenFromNav),
})),
workspaceAccess: {
...defaultWorkspaceAccess,
...(source.workspaceAccess ?? {}),
},
};
}
function clonePersistableWorkspaceHubState(source = hubState) {
const clonedState = cloneHubState(source ?? defaultHubState);
delete clonedState.activeWorkspaceId;
return clonedState;
}
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
function assignSessionPlannerBlockFieldValue(block, field, rawValue) {
if (!block || !(field in block)) {
return false;
}
if (field === "minutes") {
block[field] = Math.max(0, Number(rawValue) || 0);
} else if (field === "intensity") {
block[field] = clamp(Number(rawValue) || 1, 1, 5);
} else if (sessionPlannerMultiSelectFields.has(field)) {
block[field] = formatSessionPlannerMultiValue(rawValue);
} else {
block[field] = rawValue;
}
return true;
}
function syncSelectedSessionPlannerBlockFieldsFromDom() {
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
let hasChanged = false;
const changedFields = [];
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-field]")
.forEach((field) => {
const fieldKey = field.dataset.sessionField;
if (!fieldKey || !(fieldKey in block)) {
return;
}
const previousValue = block[fieldKey];
if (assignSessionPlannerBlockFieldValue(block, fieldKey, field.value) && block[fieldKey] !== previousValue) {
hasChanged = true;
changedFields.push(fieldKey);
}
});
if (hasChanged) {
markSessionPlannerBlockFieldsUpdated(block, changedFields);
writeSessionPlannerState();
}
}
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
function readSessionPlannerState() {
try {
const raw = win.localStorage.getItem(sessionPlannerStorageKey);
if (!raw) {
return createSessionPlannerDefaultState();
}
const state = cloneSessionPlannerState(JSON.parse(raw));
if (JSON.stringify(state) !== raw) {
persistNormalizedSessionPlannerState(state);
}
return state;
} catch {
return createSessionPlannerDefaultState();
}
}
function persistNormalizedSessionPlannerState(nextState) {
const nextValue = JSON.stringify(nextState);
try {
rawDataSafetySetItem(sessionPlannerStorageKey, nextValue);
if (win.__footballScienceCentralHydrating) {
win.setTimeout(() => {
if (rawDataSafetyGetItem(sessionPlannerStorageKey) === nextValue && canWriteCentralBackedCache()) {
recordDataSafetyWrite(sessionPlannerStorageKey, nextValue);
}
}, 0);
return;
}
if (canWriteCentralBackedCache()) {
recordDataSafetyWrite(sessionPlannerStorageKey, nextValue);
}
} catch {
}
}
async function findSessionPlannerStateInSnapshots(currentState) {
try {
const database = await openDataSafetyDatabase();
const snapshots = await new Promise((resolve, reject) => {
const transaction = database.transaction(dataSafetySnapshotStoreName, "readonly");
const request = transaction.objectStore(dataSafetySnapshotStoreName).getAll();
request.onsuccess = () => resolve(Array.from(request.result || []));
request.onerror = () => reject(request.error);
});
const orderedSnapshots = snapshots.sort((a, b) =>
String(b?.createdAt || b?.id || "").localeCompare(String(a?.createdAt || a?.id || ""))
);
let recoveredState = cloneSessionPlannerState(currentState);
let recoveredSessions = 0;
orderedSnapshots.forEach((snapshot) => {
const storage = snapshot?.storage && typeof snapshot.storage === "object" ? snapshot.storage : {};
const rawState = storage[sessionPlannerStorageKey];
if (typeof rawState !== "string") {
return;
}
try {
const backupState = cloneSessionPlannerState(JSON.parse(rawState));
const mergeResult = mergeSessionPlannerStateFromBackup(recoveredState, backupState);
recoveredState = mergeResult.state;
recoveredSessions += mergeResult.recoveredSessions;
} catch {
}
});
return recoveredSessions ? recoveredState : null;
} catch {
return null;
}
}
function queueSessionPlannerSnapshotRecovery() {
if (sessionPlannerSnapshotRecoveryQueued) {
return;
}
sessionPlannerSnapshotRecoveryQueued = true;
const currentState = sessionPlannerState || readSessionPlannerState();
findSessionPlannerStateInSnapshots(currentState).then((recoveredState) => {
sessionPlannerSnapshotRecoveryQueued = false;
if (!recoveredState) {
return;
}
sessionPlannerState = recoveredState;
if (!writeSessionPlannerState()) {
return;
}
if (hubState?.activeWorkspaceId === "session-planner") {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast("Session planner restored from local backup.");
}
});
}
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
function writeSessionPlannerState() {
if (!sessionPlannerState) {
return false;
}
try {
captureSessionPlannerBoardHistoryFromState();
let existingState = null;
try {
const rawExistingState = win.localStorage.getItem(sessionPlannerStorageKey);
existingState = rawExistingState ? cloneSessionPlannerState(JSON.parse(rawExistingState)) : null;
} catch {
existingState = null;
}
const nextState = existingState
? mergeSessionPlannerStateForWrite(existingState, sessionPlannerState)
: cloneSessionPlannerState(sessionPlannerState);
sessionPlannerState = nextState;
sessionPlannerAutosaveBoundary.markSessionPlannerWrite();
win.localStorage.setItem(sessionPlannerStorageKey, JSON.stringify(nextState));
return true;
} catch {
logEvent("Session planner could not be written to local storage.");
return false;
}
}
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
async function maybeCopyToClipboard(text) {
const safeText = String(text || "").trim();
if (!safeText || !win.navigator?.clipboard?.writeText) {
return false;
}
try {
await win.navigator.clipboard.writeText(safeText);
return true;
} catch {
return false;
}
}
function togglePasswordInputVisibility(button) {
const shell = button?.closest(".password-input-shell");
const input = shell?.querySelector("input");
if (!input) {
return;
}
const shouldShow = input.type === "password";
input.type = shouldShow ? "text" : "password";
button.setAttribute("aria-pressed", shouldShow ? "true" : "false");
button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
button.classList.toggle("is-visible", shouldShow);
}
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
function buildPlatformAppearanceConfigFromForm(form) {
const formData = new FormData(form);
const current = readPlatformAppearanceState();
const componentTypes = Object.fromEntries(
platformAppearanceHomeComponentTypeIds.map((typeId) => [
typeId,
{
...(current.modules.home.componentTypes[typeId] || {}),
density: String(formData.get(`componentType.${typeId}.density`) || ""),
tone: String(formData.get(`componentType.${typeId}.tone`) || ""),
},
])
);
const sections = Object.fromEntries(
platformAppearanceHomeSectionDefaults.map((section) => [
section.id,
{
...(current.modules.home.sections[section.id] || section),
enabled: formData.get(`section.${section.id}.enabled`) === "on",
order: String(formData.get(`section.${section.id}.order`) || section.order),
eyebrow: String(formData.get(`section.${section.id}.eyebrow`) || ""),
title: String(formData.get(`section.${section.id}.title`) || ""),
},
])
);
return normalizePlatformAppearanceConfig({
...current,
modules: {
...current.modules,
home: {
...current.modules.home,
density: String(formData.get("home.density") || ""),
theme: String(formData.get("home.theme") || ""),
componentTypes,
sections,
},
},
});
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
function getMedicalStatusOptionForDate(statusKey, dateValue = medicalState?.selectedDate, rtpPhase = "") {
return getMedicalStatusOptionForDateFromHelper(statusKey, dateValue, rtpPhase);
}
function syncMedicalPlayerAvailabilityStatusesFromProfiles() {
if (!medicalState || !Array.isArray(medicalState.players)) {
return false;
}
let changed = false;
const nextPlayers = medicalState.players.map((player) => {
const profile = getMedicalLinkedPlayerProfile(player);
const profileStatus = normalizeMedicalPlayerAvailabilityStatus(
profile?.status || profile?.availabilityStatus || profile?.availability_status,
""
);
const playerStatus = normalizeMedicalPlayerAvailabilityStatus(
player.status || player.availabilityStatus || player.availability_status,
""
);
if (!profileStatus || profileStatus === playerStatus) {
return player;
}
changed = true;
return {
...player,
status: profileStatus,
availabilityStatus: profileStatus,
availability_status: profileStatus,
};
});
if (changed) {
medicalState.players = nextPlayers;
}
return changed;
}
function markMedicalClinicalChange(changeType, summary) {
ensureMedicalState();
medicalState.dataSafety = normalizeMedicalDataSafety(
{
...medicalState.dataSafety,
lastClinicalChangeAt: new Date().toISOString(),
lastClinicalChangeBy: getCurrentMedicalActorId(),
lastClinicalChangeType: changeType,
lastClinicalChangeSummary: summary,
lastDatabaseSyncStatus: "pending",
lastDatabaseSyncEvent: changeType,
},
medicalState
);
}
function commitMedicalClinicalState(changeType, summary) {
markMedicalClinicalChange(changeType, summary);
writeMedicalState();
}
function updateMedicalDatabaseSyncStatus(eventType, result = {}) {
if (!medicalState) {
return;
}
const status = result.ok
? result.stored
? "stored"
: result.duplicate
? "duplicate"
: result.enabled === false || result.localDev
? "legacy"
: "legacy"
: "failed";
medicalState.dataSafety = normalizeMedicalDataSafety(
{
...medicalState.dataSafety,
lastDatabaseSyncAt: new Date().toISOString(),
lastDatabaseSyncStatus: status,
lastDatabaseSyncEvent: eventType,
lastPayloadHash: result.payloadHash || medicalState.dataSafety?.lastPayloadHash || "",
},
medicalState
);
writeMedicalState();
}
function cloneMedicalState(source = {}) {
const shouldSeedDefaultRoster =
!Array.isArray(source.players) || (!source.rosterVersion && source.players.length === 0);
const players = (shouldSeedDefaultRoster ? defaultMedicalPlayers : source.players)
.map(normalizeMedicalPlayer)
.filter(Boolean)
.sort(compareMedicalPlayers);
const playerIds = new Set(players.map((player) => player.id));
const records = Array.isArray(source.records)
? source.records
.map(normalizeMedicalRecord)
.filter((record) => record && playerIds.has(record.playerId))
.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
: [];
const injuryPlans = Array.isArray(source.injuryPlans)
? source.injuryPlans
.map(normalizeMedicalInjuryPlan)
.filter((plan) => plan && playerIds.has(plan.playerId))
.sort((first, second) => {
const startComparison = second.startDate.localeCompare(first.startDate);
if (startComparison !== 0) {
return startComparison;
}
return new Date(second.createdAt) - new Date(first.createdAt);
})
: [];
const selectedDate = isMedicalDateValue(source.selectedDate)
? source.selectedDate
: formatScheduleDateValue(new Date());
const activePlayers = players.filter((player) => !isMedicalItemArchived(player));
const selectedPlayerId = activePlayers.some((player) => player.id === source.selectedPlayerId)
? source.selectedPlayerId
: activePlayers[0]?.id || "";
return {
selectedDate,
selectedPlayerId,
players,
records,
injuryPlans,
dataSafety: normalizeMedicalDataSafety(source.dataSafety, { players, records, injuryPlans }),
policy: normalizeMedicalGovernancePolicy(source.policy),
rosterVersion: source.rosterVersion || medicalDefaultRosterVersion,
};
}
function canViewPrivateMedicalDetails() { return canEditMedicalTeam(); }
function sanitizeMedicalRecordForCoachView(record = {}) {
const participation = normalizeMedicalParticipation(record.participation, 100);
const statusKey = medicalStatusOptions.some((status) => status.key === record.status)
? record.status
: getMedicalStatusForParticipation(participation);
return {
...record,
status: statusKey,
participation,
actualParticipation: medicalActualParticipationFallback,
comment: "",
coachNote: record.shareWithCoach ? String(record.coachNote ?? "").trim() : "",
shareWithCoach: normalizeMedicalShareValue(record.shareWithCoach),
rtpPhase: medicalRtpPhaseOptions.some((phase) => phase.key === record.rtpPhase)
? record.rtpPhase
: getMedicalRtpPhaseForRecommendation(
statusKey,
participation,
getMedicalRecommendationActivityContext(record.date).type
),
clearance: {},
gates: {},
createdBy: "coach-safe",
};
}
function sanitizeMedicalInjuryPlanForCoachView(plan = {}) {
const participation = normalizeMedicalParticipation(plan.participation, 0);
const statusKey = medicalStatusOptions.some((status) => status.key === plan.status)
? plan.status
: getMedicalStatusForParticipation(participation);
return {
...plan,
injuryType: "Availability plan",
bodyArea: "",
status: statusKey,
participation,
reviewDate: "",
rtpPhase: medicalRtpPhaseOptions.some((phase) => phase.key === plan.rtpPhase)
? plan.rtpPhase
: getMedicalRtpPhaseForRecommendation(statusKey, participation),
phase: "Coach-safe availability plan",
clearance: {},
gates: {},
coachNote: plan.shareWithCoach ? String(plan.coachNote ?? "").trim() : "",
shareWithCoach: normalizeMedicalShareValue(plan.shareWithCoach),
comment: "",
createdBy: "coach-safe",
};
}
function sanitizeMedicalStateForCurrentUser(state = {}) {
if (getCurrentPlatformUser() && canViewPrivateMedicalDetails()) {
return state;
}
return cloneMedicalState({
...state,
records: Array.isArray(state.records) ? state.records.map(sanitizeMedicalRecordForCoachView) : [],
injuryPlans: Array.isArray(state.injuryPlans) ? state.injuryPlans.map(sanitizeMedicalInjuryPlanForCoachView) : [],
policy: sanitizeMedicalGovernancePolicyForCoachView(),
});
}
function setMedicalStateStorageValue(state = medicalState, suppressCentralSync = false) {
if (suppressCentralSync) {
rawDataSafetySetItem(medicalTeamStorageKey, JSON.stringify(state));
return;
}
win.localStorage.setItem(medicalTeamStorageKey, JSON.stringify(state));
}
function readMedicalState() {
try {
const raw = win.localStorage.getItem(medicalTeamStorageKey);
const parsed = raw ? JSON.parse(raw) : {};
const state = sanitizeMedicalStateForCurrentUser(cloneMedicalState(parsed));
const shouldPersistSeededRoster =
!raw || (!parsed?.rosterVersion && Array.isArray(parsed?.players) && parsed.players.length === 0);
if (shouldPersistSeededRoster) {
setMedicalStateStorageValue(state, true);
}
return state;
} catch {
const state = sanitizeMedicalStateForCurrentUser(cloneMedicalState({}));
try {
setMedicalStateStorageValue(state, true);
} catch {
logEvent("Medical Team data could not be written to local storage.");
}
return state;
}
}
function writeMedicalState() {
if (!medicalState) {
return;
}
try {
const coachSafeOnly = !canViewPrivateMedicalDetails();
const nextState = coachSafeOnly ? sanitizeMedicalStateForCurrentUser(medicalState) : medicalState;
const nextStateJson = JSON.stringify(nextState);
const currentStateJson = win.localStorage.getItem(medicalTeamStorageKey);
if (currentStateJson === nextStateJson) {
return;
}
setMedicalStateStorageValue(nextState, coachSafeOnly);
} catch {
logEvent("Medical Team data could not be written to local storage.");
}
}
function ensureMedicalState() {
if (!medicalState) {
medicalState = readMedicalState();
}
archiveMedicalPlayersRemovedFromSquad({ persist: canViewPrivateMedicalDetails() });
syncMedicalPlayerAvailabilityStatusesFromProfiles();
return medicalState;
}
function readPlayerProfileAgeCache() {
try {
const raw = win.localStorage.getItem(playerProfileAgeCacheStorageKey);
const parsed = raw ? JSON.parse(raw) : {};
const sourcePlayers = parsed?.players && typeof parsed.players === "object" ? parsed.players : {};
const players = Object.entries(sourcePlayers).reduce((result, [key, entry]) => {
const normalizedKey = String(key || "").trim();
if (!normalizedKey) {
return result;
}
const normalizedEntry = normalizePlayerProfileAgeCacheEntry(entry);
if (normalizedEntry.signature || normalizedEntry.checkedAt || normalizedEntry.birthDate || normalizedEntry.age) {
result[normalizedKey] = normalizedEntry;
}
return result;
}, {});
return {
schemaVersion: "football-squad-age-cache-v1",
players,
updatedAt: String(parsed?.updatedAt || "").trim(),
};
} catch {
return { schemaVersion: "football-squad-age-cache-v1", players: {}, updatedAt: "" };
}
}
function ensurePlayerProfileAgeCache() {
if (!playerProfileAgeCacheState) {
playerProfileAgeCacheState = readPlayerProfileAgeCache();
}
return playerProfileAgeCacheState;
}
function writePlayerProfileAgeCache(cache = playerProfileAgeCacheState) {
if (!cache) {
return;
}
playerProfileAgeCacheState = {
schemaVersion: "football-squad-age-cache-v1",
players: cache.players && typeof cache.players === "object" ? cache.players : {},
updatedAt: new Date().toISOString(),
};
try {
win.localStorage.setItem(playerProfileAgeCacheStorageKey, JSON.stringify(playerProfileAgeCacheState));
} catch {
logEvent("Squad age cache could not be written to local storage.");
}
}
function getPlayerProfileAgeCacheEntry(player = {}, cache = ensurePlayerProfileAgeCache()) {
const key = getPlayerProfileAgeCacheKey(player);
const entry = key ? cache.players?.[key] : null;
if (!entry) {
return null;
}
const signature = getPlayerProfileAgeLookupSignature(player);
if (entry.signature && entry.signature !== signature) {
return null;
}
return entry;
}
function buildPlayerProfileImportFeedback(result = {}) {
return buildPlayerProfileImportFeedbackMessage(result, { undoState: getPlayerProfileImportUndoState() });
}
function renderPlayerProfilesWorkspaceMessage(message) { return squadWorkspaceRenderer.renderMessage(message); }
function getCurrentSquadActorLabel() {
const user = getCurrentPlatformUser?.();
const firstName = String(user?.firstName || user?.user_metadata?.firstName || "").trim();
const lastName = String(user?.lastName || user?.user_metadata?.lastName || "").trim();
const displayName = String(user?.name || user?.displayName || [firstName, lastName].filter(Boolean).join(" ")).trim();
return displayName || String(user?.email || "Football Science").trim();
}
function getSquadChangeSummary(type, player = {}, changes = []) {
if (type === "player-added") {
return `${player?.name || "Player"} added to Squad`;
}
if (type === "player-removed") {
return `${player?.name || "Player"} removed from Squad`;
}
if (type === "squad-import") {
return `${changes.length || 0} player profiles imported`;
}
const roleChange = changes.find((change) => change.field === "Primary role");
if (roleChange) {
return `${player?.name || "Player"} role changed to ${roleChange.to}`;
}
const firstChange = changes[0];
return firstChange
? `${player?.name || "Player"} updated: ${firstChange.field}`
: `${player?.name || "Player"} profile saved`;
}
function recordPlayerProfileChange(type, player = {}, changes = [], options = {}) {
ensurePlayerProfilesState();
const safeChanges = Array.isArray(changes) ? changes.filter(Boolean) : [];
const summary = options.summary || getSquadChangeSummary(type, player, safeChanges);
const entry = normalizePlayerProfileChangeLogEntry({
id: createDashboardId("squad-change"),
type,
playerId: player?.id || options.playerId || "",
playerName: player?.name || options.playerName || "",
actor: options.actor || getCurrentSquadActorLabel(),
summary,
changes: safeChanges,
createdAt: options.createdAt || new Date().toISOString(),
});
playerProfilesState.changeLog = normalizePlayerProfileChangeLog([entry, ...(playerProfilesState.changeLog || [])]);
}
function getPlayerProfileChangeLog(playerId = "") {
ensurePlayerProfilesState();
return normalizePlayerProfileChangeLog(playerProfilesState.changeLog).filter((entry) => entry.playerId === playerId);
}
function getRecentPlayerProfileChangeLog(limit = 5) {
ensurePlayerProfilesState();
return normalizePlayerProfileChangeLog(playerProfilesState.changeLog).slice(0, limit);
}
function clonePlayerProfilesState(source = {}) {
const removedPlayerIds = normalizePlayerProfileRemovedIds(
source.removedPlayerIds || source.deletedPlayerIds || source.removedIds
);
const removedPlayerIdSet = new Set(removedPlayerIds);
const seededPlayers = defaultMedicalPlayers.map((player) =>
normalizePlayerProfile({
...player,
primaryRole: getDefaultPlayerProfileRole(player),
roleGroup: getPlayerProfileRoleGroupForRole(getDefaultPlayerProfileRole(player), player.position),
})
);
const incomingPlayers = Array.isArray(source.players)
? source.players.map(normalizePlayerProfile).filter(Boolean)
: [];
const playersById = new Map();
seededPlayers.filter(Boolean).forEach((player) => {
if (removedPlayerIdSet.has(player.id)) {
return;
}
playersById.set(player.id, player);
});
incomingPlayers.forEach((player) => {
if (removedPlayerIdSet.has(player.id)) {
return;
}
const seededPlayer = playersById.get(player.id);
playersById.set(player.id, seededPlayer ? { ...seededPlayer, ...player } : player);
});
const players = Array.from(playersById.values()).sort(comparePlayerProfiles);
const selectedPlayerId = players.some((player) => player.id === source.selectedPlayerId)
? source.selectedPlayerId
: players[0]?.id || "";
return {
selectedPlayerId,
players,
removedPlayerIds,
rosterVersion: source.rosterVersion || playerProfilesDefaultRosterVersion,
changeLog: normalizePlayerProfileChangeLog(source.changeLog || source.history || []),
schemaVersion: playerProfilesSchemaVersion,
updatedAt: source.updatedAt || new Date().toISOString(),
};
}
function buildPlayerProfileFromMedicalTrainingGuest(medicalPlayer = {}) {
const rosterType = getTemporaryRosterTypeFromPlayerSource(medicalPlayer);
return normalizePlayerProfile({
...medicalPlayer,
rosterType,
countsInSquad: false,
temporaryGroup: medicalPlayer.temporaryGroup || medicalPlayer.subGroup || medicalPlayer.trainingGroup || getPlayerProfileRosterTypeOption(rosterType).shortLabel,
temporaryFrom: medicalPlayer.temporaryFrom || medicalPlayer.startDate,
temporaryTo: medicalPlayer.temporaryTo || medicalPlayer.endDate,
});
}
function syncPlayerProfilesFromMedicalTrainingGuests(options = {}) {
if (!playerProfilesState) {
return false;
}
ensureMedicalState();
const medicalPlayers = Array.isArray(medicalState?.players) ? medicalState.players : [];
const removedPlayerIdSet = new Set(normalizePlayerProfileRemovedIds(playerProfilesState.removedPlayerIds));
const existingIdentityKeys = new Set();
(Array.isArray(playerProfilesState.players) ? playerProfilesState.players : []).forEach((player) => {
getPlayerProfileSyncIdentityKeys(player).forEach((key) => existingIdentityKeys.add(key));
});
const importedProfiles = [];
medicalPlayers
.filter((player) => player && !isMedicalItemArchived(player))
.filter(isTemporaryPlayerProfile)
.forEach((medicalPlayer) => {
const identityKeys = getPlayerProfileSyncIdentityKeys(medicalPlayer);
const playerId = String(medicalPlayer.id || "").trim();
if ((playerId && removedPlayerIdSet.has(playerId)) || identityKeys.some((key) => existingIdentityKeys.has(key))) {
return;
}
const profile = buildPlayerProfileFromMedicalTrainingGuest(medicalPlayer);
if (!profile || playerProfileCountsInSquad(profile)) {
return;
}
importedProfiles.push(profile);
getPlayerProfileSyncIdentityKeys(profile).forEach((key) => existingIdentityKeys.add(key));
});
if (!importedProfiles.length) {
return false;
}
playerProfilesState.players = [...playerProfilesState.players, ...importedProfiles].sort(comparePlayerProfiles);
if (!playerProfilesState.selectedPlayerId && playerProfilesState.players[0]) {
playerProfilesState.selectedPlayerId = playerProfilesState.players[0].id;
}
if (options.persist !== false) {
writePlayerProfilesState();
}
return true;
}
function readPlayerProfilesState() {
try {
const raw = win.localStorage.getItem(playerProfilesStorageKey);
const parsed = raw ? JSON.parse(raw) : {};
const state = clonePlayerProfilesState(parsed);
if (!raw || parsed?.schemaVersion !== playerProfilesSchemaVersion) {
rawDataSafetySetItem(playerProfilesStorageKey, JSON.stringify(state));
}
return state;
} catch {
const state = clonePlayerProfilesState({});
try {
rawDataSafetySetItem(playerProfilesStorageKey, JSON.stringify(state));
} catch {
logEvent("Player Profiles data could not be written to local storage.");
}
return state;
}
}
function writePlayerProfilesState() {
if (!playerProfilesState) {
return;
}
try {
const removedPlayerIdSet = new Set(normalizePlayerProfileRemovedIds(playerProfilesState.removedPlayerIds));
playerProfilesState.removedPlayerIds = Array.from(removedPlayerIdSet);
playerProfilesState.players = (Array.isArray(playerProfilesState.players) ? playerProfilesState.players : [])
.filter((player) => !removedPlayerIdSet.has(player?.id));
playerProfilesState.updatedAt = new Date().toISOString();
win.localStorage.setItem(playerProfilesStorageKey, JSON.stringify(playerProfilesState));
} catch {
logEvent("Player Profiles data could not be written to local storage.");
}
}
function getPlayerProfileAgeHydrationCandidates(players = []) {
const cache = ensurePlayerProfileAgeCache();
const seenKeys = new Set();
return (Array.isArray(players) ? players : [])
.filter((player) => player?.id && player?.name)
.filter((player) => {
if (getPlayerProfileBirthDateValue(player)) {
return false;
}
const cacheKey = getPlayerProfileAgeCacheKey(player);
if (!cacheKey || seenKeys.has(cacheKey)) {
return false;
}
const cachedEntry = getPlayerProfileAgeCacheEntry(player, cache);
if (cachedEntry?.birthDate || cachedEntry?.birthDateCheckedAt || (cachedEntry?.checkedAt && !cachedEntry?.age)) {
return false;
}
seenKeys.add(cacheKey);
return true;
})
.map((player) => ({
profileId: player.id,
cacheKey: getPlayerProfileAgeCacheKey(player),
signature: getPlayerProfileAgeLookupSignature(player),
name: player.name,
number: player.number,
position: player.position,
}));
}
function buildPlayerProfileAgeHydrationPayload(candidates = []) {
const user = getCurrentPlatformUser();
const platformStructure = getPlatformStructureState();
const squadTeam = getPlatformTeamDisplayTeam(user, platformStructure);
const teamName = squadTeam?.name || getPlatformTeamDisplayName(user, platformStructure);
return {
schemaVersion: "football-squad-age-hydration-request-v1",
team: {
id: squadTeam?.id || user?.teamId || "",
name: teamName,
clubId: squadTeam?.clubId || user?.clubId || "",
clubName: user?.clubName || user?.club || "",
},
players: candidates.map((candidate) => ({
profileId: candidate.profileId,
name: candidate.name,
number: candidate.number,
position: candidate.position,
})),
};
}
function mergePlayerProfileAgeHydrationResult(candidates = [], payload = {}) {
const cache = ensurePlayerProfileAgeCache();
const now = new Date().toISOString();
const candidatesByProfileId = new Map(candidates.map((candidate) => [candidate.profileId, candidate]));
candidates.forEach((candidate) => {
if (!candidate.cacheKey) {
return;
}
cache.players[candidate.cacheKey] = {
...(cache.players[candidate.cacheKey] || {}),
signature: candidate.signature,
checkedAt: now,
birthDateCheckedAt: now,
source: "squad_players",
};
});
const hydratedPlayers = Array.isArray(payload?.players) ? payload.players : [];
hydratedPlayers.forEach((entry) => {
const profileId = String(entry?.profileId || "").trim();
const candidate = candidatesByProfileId.get(profileId);
if (!candidate?.cacheKey) {
return;
}
const birthDate = normalizePlayerProfileBirthDate(entry.birthDate || entry.dateOfBirth || entry.date_of_birth);
const age = normalizePlayerProfileAgeValue(entry.age);
if (!birthDate && !age) {
return;
}
cache.players[candidate.cacheKey] = {
signature: candidate.signature,
birthDate,
age,
databasePlayerId: String(entry.databasePlayerId || entry.playerId || "").trim(),
source: String(entry.source || "squad_players").trim(),
checkedAt: now,
birthDateCheckedAt: now,
};
});
writePlayerProfileAgeCache(cache);
return hydratedPlayers.length > 0;
}
async function hydratePlayerProfileAgesOnce() {
if (playerProfileAgeHydrationPending || hubState?.activeWorkspaceId !== "player-profiles") {
return;
}
ensurePlayerProfilesState();
const candidates = getPlayerProfileAgeHydrationCandidates(playerProfilesState.players);
if (!candidates.length) {
return;
}
const fingerprint = candidates.map((candidate) => `${candidate.cacheKey}:${candidate.signature}`).join(";");
if (fingerprint && fingerprint === playerProfileAgeHydrationLastFingerprint) {
return;
}
playerProfileAgeHydrationLastFingerprint = fingerprint;
playerProfileAgeHydrationPending = true;
try {
const token = await getPlatformApiAccessToken();
if (!token) {
playerProfileAgeHydrationLastFingerprint = "";
return;
}
const response = await fetch("/api/squad-ages", {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${token}`,
},
body: JSON.stringify(buildPlayerProfileAgeHydrationPayload(candidates)),
});
const text = await response.text();
let payload = {};
if (text) {
try {
payload = JSON.parse(text);
} catch {
payload = {};
}
}
if (!response.ok || payload?.ok === false) {
playerProfileAgeHydrationLastFingerprint = "";
return;
}
const didHydrate = mergePlayerProfileAgeHydrationResult(candidates, payload);
if (didHydrate && hubState?.activeWorkspaceId === "player-profiles") {
renderPlayerProfilesRosterListOnly();
}
} catch {
playerProfileAgeHydrationLastFingerprint = "";
} finally {
playerProfileAgeHydrationPending = false;
}
}
function queuePlayerProfileAgeHydration() {
win.clearTimeout(playerProfileAgeHydrationTimer);
playerProfileAgeHydrationTimer = win.setTimeout(() => {
playerProfileAgeHydrationTimer = 0;
hydratePlayerProfileAgesOnce();
}, 80);
}
function ensurePlayerProfilesState() {
if (!playerProfilesState) {
playerProfilesState = readPlayerProfilesState();
}
return playerProfilesState;
}
function canEditPlayerProfiles() { return canCurrentUserEditWorkspace("player-profiles"); }
function getPlayerProfilesAccessLabel() {
if (canEditPlayerProfiles()) {
return isCurrentPlatformUserAdmin() ? "Admin edit access" : "Coach edit access";
}
return "Read only";
}
function getSelectedPlayerProfile() {
ensurePlayerProfilesState();
return (
playerProfilesState.players.find((player) => player.id === playerProfilesState.selectedPlayerId) ??
playerProfilesState.players[0] ??
null
);
}
function openPlayerProfileModal(playerId) {
ensurePlayerProfilesState();
if (!playerProfilesState.players.some((player) => player.id === playerId)) {
return;
}
playerProfilesState.selectedPlayerId = playerId;
playerProfileModalOpen = true;
playerProfileNewPlayerModalOpen = false;
writePlayerProfilesState();
renderPlayerProfilesWorkspace(); playerProfileAutosaveLastSignature = getPlayerProfileFormSignature(ui.playerProfilesWorkspace?.querySelector("#playerProfileEditForm"));
}
function closePlayerProfileModal() {
if (!playerProfileModalOpen) {
return;
}
flushPlayerProfileAutosave(); playerProfileModalOpen = false;
renderPlayerProfilesWorkspace();
}
function openPlayerProfileNewPlayerModal() {
if (!canEditPlayerProfiles()) {
return;
}
playerProfileModalOpen = false;
playerProfileNewPlayerModalOpen = true;
renderPlayerProfilesWorkspace();
}
function closePlayerProfileNewPlayerModal() {
if (!playerProfileNewPlayerModalOpen) {
return;
}
playerProfileNewPlayerModalOpen = false;
renderPlayerProfilesWorkspace();
}
function getLatestManualMedicalLog(playerId) {
ensureMedicalState();
return medicalState.records
.filter((record) => record.playerId === playerId)
.sort((first, second) => {
const dateComparison = second.date.localeCompare(first.date);
if (dateComparison !== 0) {
return dateComparison;
}
return new Date(second.createdAt) - new Date(first.createdAt);
})[0] ?? null;
}
function getPlayerProfileMedicalStatusOverride(snapshot = {}) {
if (snapshot.medicalSource === "squad-availability" && !snapshot.hasActivePlan) {
return "";
}
const statusKey = String(snapshot.medicalStatusKey || snapshot.tone || "").trim();
const participation = Number(snapshot.participation);
if (snapshot.hasActivePlan && Number.isFinite(participation) && participation < 100) {
return "injured";
}
if (statusKey === "unavailable" || statusKey === "rehab") {
return "injured";
}
if (statusKey === "modified" || statusKey === "controlled") {
return "managed";
}
return "";
}
function getPlayerProfileEffectiveStatusFromSnapshot(player = {}, snapshot = {}) {
return getPlayerProfileMedicalStatusOverride(snapshot) || player.status || "available";
}
function getPlayerProfileEffectiveStatus(player = {}, dateValue = formatScheduleDateValue(new Date())) {
return getPlayerProfileEffectiveStatusFromSnapshot(player, getPlayerProfileMedicalSnapshot(player.id, dateValue));
}
function getPlayerProfileMedicalSnapshot(playerId, dateValue = formatScheduleDateValue(new Date())) {
ensureMedicalState();
const currentRecord = getLatestMedicalRecord(playerId, dateValue);
const latestLog = getLatestManualMedicalLog(playerId);
const activePlan = getActiveMedicalInjuryPlan(playerId, dateValue);
const openEndedLog =
!currentRecord &&
!activePlan &&
latestLog &&
latestLog.date <= dateValue &&
["unavailable", "rehab", "modified", "controlled"].includes(latestLog.status)
? latestLog
: null;
const medicalStatusKey = currentRecord?.status || activePlan?.status || openEndedLog?.status || "";
const participation = currentRecord?.participation ?? activePlan?.participation ?? openEndedLog?.participation ?? null;
const medicalSource = currentRecord?.source || (activePlan ? "injury-plan" : openEndedLog ? "manual-log" : "");
const availabilityLabel = currentRecord
? `${getMedicalRecordStatus(currentRecord).label} / ${currentRecord.participation}%`
: activePlan
? `${getMedicalRtpPhaseOption(activePlan.rtpPhase).label} / ${activePlan.participation}%`
: openEndedLog
? `${getMedicalRecordStatus(openEndedLog).label} / ${openEndedLog.participation}% ongoing`
: "Not logged today";
const rtpStatus = activePlan
? getMedicalRtpPhaseOption(activePlan.rtpPhase).label
: currentRecord
? getMedicalRtpPhaseOption(currentRecord.rtpPhase).label
: openEndedLog
? getMedicalRtpPhaseOption(openEndedLog.rtpPhase).label
: "No RTP restriction";
const coachNote = currentRecord?.coachNote || activePlan?.coachNote || latestLog?.coachNote || "";
const latestLogSummary = latestLog
? `${formatMedicalDateLabel(latestLog.date)} - ${getMedicalRecordStatus(latestLog).label} / ${latestLog.participation}%`
: activePlan
? `${formatMedicalDateLabel(dateValue)} - ${getMedicalRtpPhaseOption(activePlan.rtpPhase).label}`
: "No medical log yet";
const returnDate = activePlan?.endDate || "";
const returnDateLabel = returnDate ? formatMedicalDateLabel(returnDate) : "";
const activeInjuryLabel = activePlan ? [activePlan.injuryType, activePlan.bodyArea].filter(Boolean).join(" / ") : "";
return {
currentAvailability: availabilityLabel,
rtpStatus,
coachNote,
latestLogDate: latestLog?.date || "",
latestLogSummary,
returnDate,
returnDateLabel,
returnLabel: returnDateLabel ? `Expected back ${returnDateLabel}` : "",
activeInjuryLabel,
tone: medicalStatusKey || "unset",
participation,
medicalStatusKey,
medicalSource,
hasActivePlan: Boolean(activePlan),
isOpenEndedMedicalStatus: Boolean(openEndedLog),
};
}
function getPlayerProfilesRosterSummary(players = []) {
const squadPlayers = players.filter(playerProfileCountsInSquad);
const temporaryPlayers = players.filter((player) => !playerProfileCountsInSquad(player));
const temporaryGroups = Array.from(new Set(temporaryPlayers.map(getPlayerProfileRosterLabel).filter(Boolean)));
return {
squadCount: squadPlayers.length,
temporaryCount: temporaryPlayers.length,
totalCount: players.length,
temporaryGroups,
};
}
function matchesPlayerProfileRosterFilter(player = {}, filterValue = playerProfilesRosterFilter) {
const filterKey = String(filterValue || "all").trim().toLowerCase();
if (filterKey === "all") {
return true;
}
if (filterKey === "squad") {
return playerProfileCountsInSquad(player);
}
if (filterKey === "temporary") {
return !playerProfileCountsInSquad(player);
}
return normalizePlayerProfileRosterType(player.rosterType) === filterKey;
}
function getVisiblePlayerProfiles() {
ensurePlayerProfilesState();
const query = playerProfilesSearchQuery.trim().toLowerCase();
return playerProfilesState.players.filter((player) => {
const groupMatch = playerProfilesRoleGroupFilter === "all" || player.roleGroup === playerProfilesRoleGroupFilter;
if (!groupMatch) {
return false;
}
if (!matchesPlayerProfileRosterFilter(player)) {
return false;
}
if (!query) {
return true;
}
return [
player.name,
player.number,
player.position,
player.primaryRole,
player.secondaryRoles.join(" "),
player.roleGroup,
player.status,
player.squadStatus,
player.careerPhase,
player.rosterType,
player.temporaryGroup,
player.idp?.primaryFocus,
player.idp?.focusAreas,
]
.join(" ")
.toLowerCase()
.includes(query);
}).sort(comparePlayerProfiles);
}
function getAllTemporaryPlayerProfiles() {
ensurePlayerProfilesState();
return playerProfilesState.players.filter(isTemporaryPlayerProfile).sort(comparePlayerProfiles);
}
function getPlayerProfileCompleteness(player = {}) {
const checks = [
player.name,
player.position,
player.primaryRole,
player.roleGroup,
player.preferredSide,
player.squadStatus,
player.careerPhase,
player.idp?.primaryFocus,
player.idp?.nextAction || player.idp?.focusAreas,
player.futureData?.performanceNotes || player.futureData?.scoutingNotes,
player.coachNotes,
];
const completeCount = checks.filter((value) => String(value ?? "").trim()).length;
return Math.round((completeCount / checks.length) * 100);
}
function renderPlayerProfileAvatar(player, className = "player-profile-avatar") {
const initials = player.name
.split(/\s+/)
.map((part) => part[0])
.join("")
.slice(0, 2)
.toUpperCase();
return `
    <span class="${className}${player.photoUrl ? " has-photo" : ""}">
      ${player.photoUrl ? `<img src="${escapeHtml(player.photoUrl)}" alt="" loading="lazy" />` : escapeHtml(initials)}
    </span>
  `;
}
function renderPlayerProfileAvatarUpload(player, canEdit = false) {
const avatar = renderPlayerProfileAvatar(player, "squad-profile-avatar");
if (!canEdit) {
return avatar;
}
const label = player.photoUrl ? "Change player image" : "Upload player image";
return `
    <label class="squad-profile-avatar-upload" title="${escapeHtml(label)}">
      ${avatar}
      <input
        type="file"
        accept="image/*"
        data-player-profile-photo-upload="${escapeHtml(player.id)}"
        aria-label="${escapeHtml(`Upload image for ${player.name}`)}"
      />
      <span class="squad-profile-avatar-upload-dot" aria-hidden="true">+</span>
    </label>
  `;
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
function createPlayerProfileImportUndoSnapshot(plan = {}) {
ensurePlayerProfilesState();
ensureMedicalState();
return {
createdAt: new Date().toISOString(),
playerProfilesState: clonePlayerProfilesState(playerProfilesState),
medicalState: cloneMedicalState(medicalState),
preApplyChangeLogId: getRecentPlayerProfileChangeLog(1)[0]?.id || "",
plan: {
importedCount: Number(plan.importedCount) || 0,
createdCount: Number(plan.createdCount) || 0,
updatedCount: Number(plan.updatedCount) || 0,
sourceRows: Number(plan.sourceRows) || 0,
},
undoChangeLogId: "",
};
}
function clearPlayerProfileImportUndoSnapshots() {
playerProfileImportUndoHistory = [];
playerProfileLastImportSnapshot = null;
}
function getPlayerProfileImportUndoRelativeTimeLabel(timestamp) {
if (!timestamp) {
return "";
}
const parsed = new Date(timestamp).getTime();
if (!Number.isFinite(parsed)) {
return "";
}
const diffMs = Date.now() - parsed;
if (diffMs < 0) {
return "";
}
const absMinutes = Math.max(0, Math.floor(diffMs / 60000));
if (absMinutes < 1) {
return "just now";
}
if (absMinutes < 60) {
return `${absMinutes} minute${absMinutes === 1 ? "" : "s"} ago`;
}
const absHours = Math.floor(absMinutes / 60);
if (absHours < 24) {
return `${absHours} hour${absHours === 1 ? "" : "s"} ago`;
}
const absDays = Math.floor(absHours / 24);
if (absDays < 30) {
return `${absDays} day${absDays === 1 ? "" : "s"} ago`;
}
const absWeeks = Math.floor(absDays / 7);
if (absWeeks < 5) {
return `${absWeeks} week${absWeeks === 1 ? "" : "s"} ago`;
}
return "";
}
function registerPlayerProfileImportUndoSnapshot(snapshot = {}) {
if (!snapshot || typeof snapshot !== "object") {
return;
}
playerProfileImportUndoHistory = [
{ ...snapshot },
...(Array.isArray(playerProfileImportUndoHistory) ? playerProfileImportUndoHistory : []),
].slice(0, playerProfileImportUndoHistoryLimit);
playerProfileLastImportSnapshot = playerProfileImportUndoHistory[0] || null;
}
function getPlayerProfileImportUndoHistory(limit = playerProfileImportUndoHistoryLimit) {
const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : playerProfileImportUndoHistoryLimit;
const history = Array.isArray(playerProfileImportUndoHistory) ? playerProfileImportUndoHistory : [];
return history.slice(0, safeLimit);
}
function getPlayerProfileImportUndoState() {
if (!canEditPlayerProfiles()) {
return {
canUndo: false,
reason: "Undo is disabled because your role is read-only.",
summary: "",
title: "Undo is disabled in read-only mode.",
label: "Undo import",
};
}
const latestSnapshot = playerProfileImportUndoHistory[0] || playerProfileLastImportSnapshot;
if (!latestSnapshot) {
return {
canUndo: false,
reason: "No player profile import can be undone right now.",
summary: "",
title: "No import available to undo.",
label: "Undo import",
};
}
const expectedChangeLogHead = latestSnapshot?.undoChangeLogId || "";
const currentChangeLogHead = getRecentPlayerProfileChangeLog(1)[0]?.id || "";
if (expectedChangeLogHead && currentChangeLogHead && expectedChangeLogHead !== currentChangeLogHead) {
return {
canUndo: false,
reason: "Undo blocked because newer player profile changes were made after this import.",
summary: "",
title: "Undo is no longer safe. Newer profile changes were made after the import.",
label: "Undo import",
};
}
const importedCount = Number(latestSnapshot?.plan?.importedCount) || 0;
const createdCount = Number(latestSnapshot?.plan?.createdCount) || 0;
const updatedCount = Number(latestSnapshot?.plan?.updatedCount) || 0;
const appliedBy = String(latestSnapshot?.appliedBy || latestSnapshot?.actor || "Unknown");
const importedAt = latestSnapshot?.createdAt || "";
const appliedAt = latestSnapshot?.appliedAt || importedAt;
const appliedAtLabel = appliedAt ? new Date(appliedAt).toLocaleString() : "";
const appliedAgo = appliedAt ? getPlayerProfileImportUndoRelativeTimeLabel(appliedAt) : "";
return {
canUndo: true,
title: `Undo last import (${importedCount} records, ${createdCount} added, ${updatedCount} updated).`
+ ` Applied by ${appliedBy}${appliedAtLabel ? ` • ${appliedAtLabel}` : ""}`,
label: importedCount ? `Undo import (${importedCount})` : "Undo import",
reason: "",
summary: `Undo is available for ${importedCount} records (${createdCount} created, ${updatedCount} updated). Applied by ${appliedBy}${
      appliedAtLabel ? ` at ${appliedAtLabel}` : ""
    }${appliedAgo ? ` (${appliedAgo})` : ""}`,
};
}
function applyPlayerProfileImportUndo() {
if (!canEditPlayerProfiles()) {
return {
status: "warning",
lines: ["Your role cannot undo player profile imports."],
};
}
if (!playerProfileImportUndoHistory.length || !playerProfileLastImportSnapshot) {
clearPlayerProfileImportUndoSnapshots();
return {
status: "warning",
lines: ["No import undo state was available."],
};
}
const topSnapshot = playerProfileImportUndoHistory[0];
if (!topSnapshot?.playerProfilesState) {
clearPlayerProfileImportUndoSnapshots();
return {
status: "warning",
lines: ["No valid import undo snapshot was available."],
};
}
const undoState = getPlayerProfileImportUndoState();
if (!undoState.canUndo) {
return {
status: "warning",
lines: [undoState.reason || "The last import cannot be undone at this time."],
};
}
const currentChangeLogHead = getRecentPlayerProfileChangeLog(1)[0]?.id || "";
const expectedChangeLogHead = topSnapshot.undoChangeLogId || "";
if (expectedChangeLogHead && currentChangeLogHead && currentChangeLogHead !== expectedChangeLogHead) {
return {
status: "warning",
lines: [
"Import cannot be undone because newer player profile changes were made after the import.",
"Re-import or revert manually from history.",
],
};
}
playerProfilesState = clonePlayerProfilesState(topSnapshot.playerProfilesState);
medicalState = cloneMedicalState(topSnapshot.medicalState || {});
playerProfileImportUndoHistory = playerProfileImportUndoHistory.slice(1);
playerProfileLastImportSnapshot = playerProfileImportUndoHistory[0] || null;
const restoredCount = Number(topSnapshot?.plan?.importedCount) || 0;
writePlayerProfilesState();
writeMedicalState();
return {
status: "success",
lines: [`Last player profile import was undone${restoredCount ? ` (${restoredCount} record${restoredCount === 1 ? "" : "s"})` : ""}.`],
};
}
function importSquadDataFoundationPayload(payload = {}, options = {}) {
if (!canEditPlayerProfiles()) {
return {
ok: false,
status: "warning",
importedCount: 0,
createdCount: 0,
updatedCount: 0,
skippedCount: 0,
errors: [{ row: 0, message: "Your role cannot apply player profile imports." }],
warnings: [],
rows: [],
canApply: false,
};
}
const applyChanges = options.apply !== false;
const basePlan = options.plan || buildPlayerProfileImportPlan(payload, options);
if (!basePlan || typeof basePlan !== "object") {
return {
ok: false,
status: "error",
importedCount: 0,
createdCount: 0,
updatedCount: 0,
skippedCount: 0,
errors: [{ row: 0, message: "Unable to build import plan." }],
warnings: [],
rows: [],
canApply: false,
};
}
if (!applyChanges || !basePlan.canApply) {
return {
...basePlan,
ok: basePlan.ok,
status: basePlan.status,
};
}
const preApplyChangeLogId = getRecentPlayerProfileChangeLog(1)[0]?.id || "";
if (options.playerProfilesImportLogHeadId && options.playerProfilesImportLogHeadId !== preApplyChangeLogId) {
return {
ok: false,
status: "warning",
importedCount: 0,
createdCount: 0,
updatedCount: 0,
skippedCount: 0,
errors: [{ row: 0, message: "Import preview is stale. Please re-run the import file and apply again." }],
warnings: [],
rows: [],
sourceRows: 0,
duplicateRowsCount: 0,
canApply: false,
};
}
const preApplySnapshot = createPlayerProfileImportUndoSnapshot(basePlan);
const importedCount = basePlan.importedCount || 0;
const importedPlayerIds = new Set(
(basePlan.profilesForMedicalSync || []).map((player) => String(player?.id || "").trim()).filter(Boolean)
);
if (importedPlayerIds.size) {
playerProfilesState.removedPlayerIds = normalizePlayerProfileRemovedIds(playerProfilesState.removedPlayerIds)
.filter((removedPlayerId) => !importedPlayerIds.has(removedPlayerId));
}
playerProfilesState.players = [...(Array.isArray(basePlan.nextPlayers) ? basePlan.nextPlayers : playerProfilesState.players)]
.sort(comparePlayerProfiles);
if (!playerProfilesState.selectedPlayerId && playerProfilesState.players[0]) {
playerProfilesState.selectedPlayerId = playerProfilesState.players[0].id;
}
if (importedCount) {
recordPlayerProfileChange(
"squad-import",
null,
Array.from({ length: importedCount }, (_, index) => ({
field: `Player ${index + 1}`,
from: "Import file",
to: "Squad profile",
}))
);
const latestLog = getRecentPlayerProfileChangeLog(1)[0];
preApplySnapshot.undoChangeLogId = latestLog?.id || "";
preApplySnapshot.appliedBy = latestLog?.actor || getCurrentSquadActorLabel();
preApplySnapshot.appliedAt = latestLog?.createdAt || new Date().toISOString();
preApplySnapshot.actor = preApplySnapshot.appliedBy;
registerPlayerProfileImportUndoSnapshot(preApplySnapshot);
}
writePlayerProfilesState();
syncMedicalPlayersFromPlayerProfiles(basePlan.profilesForMedicalSync || []);
writeMedicalState();
return {
ok: basePlan.ok !== false,
status: basePlan.errors && basePlan.errors.length ? "warning" : "success",
importedCount: basePlan.importedCount || 0,
createdCount: basePlan.createdCount || 0,
updatedCount: basePlan.updatedCount || 0,
skippedCount: basePlan.skippedCount || 0,
errors: basePlan.errors || [],
warnings: basePlan.warnings || [],
rows: basePlan.rows || [],
sourceRows: basePlan.sourceRows || 0,
duplicateRowsCount: basePlan.duplicateRowsCount || 0,
canApply: false,
};
}
function importSquadDataFoundationFile(file) {
if (!canEditPlayerProfiles()) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Your role cannot import player profile changes."],
});
return;
}
if (!file) {
return;
}
const reader = new FileReader();
reader.onload = () => {
try {
const payload = JSON.parse(String(reader.result || "{}"));
const preview = importSquadDataFoundationPayload(payload, { apply: false });
if (!preview.canApply) {
pendingPlayerProfileImportPlan = null;
renderPlayerProfilesWorkspace(buildPlayerProfileImportFeedback(preview));
return;
}
const preApplyChangeLogId = getRecentPlayerProfileChangeLog(1)[0]?.id || "";
pendingPlayerProfileImportPlan = {
...preview,
playerProfilesImportLogHeadId: preApplyChangeLogId,
};
const previewMessage = buildPlayerProfileImportPreviewMessage(preview, { maxRows: 20 });
renderPlayerProfilesWorkspace({
status: previewMessage.status || "success",
lines: [...previewMessage.lines, "Review changes then choose Apply or Cancel."],
items: [],
});
} catch {
pendingPlayerProfileImportPlan = null;
renderPlayerProfilesWorkspace(
buildPlayerProfileImportFeedback({
ok: false,
status: "error",
errors: [{ row: 0, message: "Import failed. Please use a valid Squad JSON export." }],
})
);
}
};
reader.readAsText(file);
}
function renderPendingPlayerProfileImport() {
if (!pendingPlayerProfileImportPlan) {
return "";
}
const preview = buildPlayerProfileImportPreviewMessage(pendingPlayerProfileImportPlan, { maxRows: 20 });
return squadWorkspaceRenderer.renderPendingImport(pendingPlayerProfileImportPlan, preview, canEditPlayerProfiles());
}
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
function getPlayerProfileFormValues(form) {
const data = new FormData(form);
const hasField = (name) => Boolean(form?.querySelector(`[name="${name}"]`));
const attributeRatings = playerProfileAttributeGroups.reduce((result, group) => {
result[group.key] = normalizePlayerProfileNumber(data.get(`rating.${group.key}`), 3);
return result;
}, {});
const futureData = {
performanceNotes: String(data.get("performanceNotes") ?? "").trim(),
scoutingNotes: String(data.get("scoutingNotes") ?? "").trim(),
analysisNotes: String(data.get("analysisNotes") ?? "").trim(),
};
const values = {
playerId: String(data.get("playerId") ?? "").trim(),
name: String(data.get("name") ?? "").trim(),
number: String(data.get("number") ?? "").trim(),
position: String(data.get("position") ?? "").trim(),
status: String(data.get("status") ?? "").trim(),
squadStatus: String(data.get("squadStatus") ?? "").trim(),
careerPhase: String(data.get("careerPhase") ?? "").trim(),
primaryRole: String(data.get("primaryRole") ?? "").trim(),
secondaryRoles: data.getAll("secondaryRoles").map((role) => String(role).trim()),
preferredSide: String(data.get("preferredSide") ?? "").trim(),
roleGroup: String(data.get("roleGroup") ?? "").trim(),
coachNotes: String(data.get("coachNotes") ?? "").trim(),
attributeRatings,
idp: {
status: String(data.get("idpStatus") ?? "").trim(),
primaryFocus: String(data.get("idpPrimaryFocus") ?? "").trim(),
strengths: String(data.get("idpStrengths") ?? "").trim(),
focusAreas: String(data.get("idpFocusAreas") ?? "").trim(),
nextAction: String(data.get("idpNextAction") ?? "").trim(),
reviewDate: String(data.get("idpReviewDate") ?? "").trim(),
},
futureData,
};
if (hasField("age")) values.age = String(data.get("age") ?? "").trim();
if (hasField("birthDate")) values.birthDate = String(data.get("birthDate") ?? "").trim();
if (hasField("rosterType")) values.rosterType = String(data.get("rosterType") ?? "").trim();
if (hasField("temporaryGroup")) values.temporaryGroup = String(data.get("temporaryGroup") ?? "").trim();
if (hasField("temporaryFrom")) values.temporaryFrom = String(data.get("temporaryFrom") ?? "").trim();
if (hasField("temporaryTo")) values.temporaryTo = String(data.get("temporaryTo") ?? "").trim();
if (hasField("photoUrl")) values.photoUrl = String(data.get("photoUrl") ?? "").trim();
return values;
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
function buildMedicalPlayerFromPlayerProfile(player = {}) {
const now = new Date().toISOString();
const createdAt = String(player.createdAt || "").trim() || now;
const updatedAt = String(player.updatedAt || "").trim() || now;
return normalizeMedicalPlayer({
id: player.id || createDashboardId("medical-player"),
name: player.name,
number: player.number,
position: player.position,
status: player.status,
primaryRole: player.primaryRole,
secondaryRoles: player.secondaryRoles,
roleGroup: player.roleGroup,
photoUrl: player.photoUrl,
sourceUrl: player.sourceUrl,
rosterType: player.rosterType,
countsInSquad: player.countsInSquad,
temporaryGroup: player.temporaryGroup,
temporaryFrom: player.temporaryFrom,
temporaryTo: player.temporaryTo,
rosterOrder: player.rosterOrder,
createdAt,
updatedAt,
});
}
function syncMedicalPlayersFromPlayerProfiles(players = []) {
if (!Array.isArray(players) || !players.length) {
return;
}
const medicalPlayers = players
.map(buildMedicalPlayerFromPlayerProfile)
.filter((player) => player && player.id && player.name);
if (!medicalPlayers.length) {
return;
}
upsertMedicalPlayers(medicalPlayers);
}
function getMedicalPlayersMatchingPlayerProfile(playerProfile = {}) {
ensureMedicalState();
const targetId = String(playerProfile.id || playerProfile.playerId || playerProfile.profileId || "").trim();
const targetName = normalizePlayerProfileName(playerProfile.name || playerProfile.displayName || "");
const targetNumber = String(playerProfile.number || playerProfile.shirtNumber || playerProfile.shirt_number || "").trim().toLowerCase();
const activePlayers = medicalState.players.filter((player) => !isMedicalItemArchived(player));
const matchesById = new Map();
activePlayers.forEach((medicalPlayer) => {
const medicalId = String(medicalPlayer.id || medicalPlayer.playerId || medicalPlayer.profileId || "").trim();
const medicalName = normalizePlayerProfileName(medicalPlayer.name || medicalPlayer.displayName || "");
const medicalNumber = String(medicalPlayer.number || medicalPlayer.shirtNumber || medicalPlayer.shirt_number || "").trim().toLowerCase();
if (targetId && medicalId === targetId) {
matchesById.set(medicalPlayer.id, medicalPlayer);
return;
}
if (targetName && targetNumber && medicalName === targetName && medicalNumber === targetNumber) {
matchesById.set(medicalPlayer.id, medicalPlayer);
}
});
if (matchesById.size || !targetName || targetNumber) {
return Array.from(matchesById.values());
}
const nameMatches = activePlayers.filter((medicalPlayer) => normalizePlayerProfileName(medicalPlayer.name || medicalPlayer.displayName || "") === targetName);
return nameMatches.length === 1 ? nameMatches : [];
}
function getMedicalRemovedSquadPlayerIdSet() {
try {
const profileState = ensurePlayerProfilesState();
return new Set(normalizePlayerProfileRemovedIds(profileState?.removedPlayerIds));
} catch {
return new Set();
}
}
function isMedicalPlayerRemovedFromSquad(player = {}, removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet()) {
const playerId = String(player?.id || player?.playerId || player?.profileId || "").trim();
return Boolean(playerId && removedPlayerIdSet.has(playerId));
}
function archiveMedicalPlayersRemovedFromSquad(options = {}) {
if (!medicalState || !Array.isArray(medicalState.players)) {
return [];
}
const previousSelectedPlayerId = String(medicalState.selectedPlayerId || "").trim();
const removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet();
if (!removedPlayerIdSet.size) {
return [];
}
const activeRemovedPlayers = medicalState.players.filter(
(player) => isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet) && !isMedicalItemArchived(player)
);
if (!activeRemovedPlayers.length) {
return [];
}
const archivedAt = new Date().toISOString();
const archivedBy = getCurrentMedicalActorId();
const archivedIds = new Set(activeRemovedPlayers.map((player) => String(player.id || "").trim()).filter(Boolean));
const archivedPlayers = [];
medicalState.players = medicalState.players.map((player) => {
if (!archivedIds.has(String(player.id || "").trim()) || isMedicalItemArchived(player)) {
return player;
}
const archivedPlayer = normalizeMedicalPlayer({
...player,
updatedAt: archivedAt,
archivedAt,
archivedBy,
archiveReason: "Removed from Squad Room",
});
if (archivedPlayer) {
archivedPlayers.push(archivedPlayer);
return archivedPlayer;
}
return player;
});
medicalState.records = medicalState.records.map((record) =>
archivedIds.has(String(record.playerId || "").trim()) && !isMedicalItemArchived(record)
? normalizeMedicalRecord({
...record,
updatedAt: archivedAt,
archivedAt,
archivedBy,
archiveReason: "Player removed from Squad Room",
}) || record
: record
);
medicalState.injuryPlans = medicalState.injuryPlans.map((plan) =>
archivedIds.has(String(plan.playerId || "").trim()) && !isMedicalItemArchived(plan)
? normalizeMedicalInjuryPlan({
...plan,
updatedAt: archivedAt,
archivedAt,
archivedBy,
archiveReason: "Player removed from Squad Room",
}) || plan
: plan
);
const nextActivePlayers = medicalState.players.filter(
(player) => !isMedicalItemArchived(player) && !isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet)
);
medicalState.selectedPlayerId =
nextActivePlayers.find((player) => player.id === previousSelectedPlayerId)?.id ||
nextActivePlayers[0]?.id ||
"";
if (options.persist !== false && canViewPrivateMedicalDetails()) {
writeMedicalState();
}
return archivedPlayers;
}
function archiveMedicalPlayersForRemovedPlayerProfile(playerProfile = {}) {
const matchingPlayers = getMedicalPlayersMatchingPlayerProfile(playerProfile);
if (!matchingPlayers.length) {
return [];
}
const archivedAt = new Date().toISOString();
const matchingPlayerIds = new Set(matchingPlayers.map((player) => String(player.id || "").trim()).filter(Boolean));
const archivedPlayers = [];
medicalState.players = medicalState.players.map((medicalPlayer) => {
if (!matchingPlayerIds.has(String(medicalPlayer.id || "").trim()) || isMedicalItemArchived(medicalPlayer)) {
return medicalPlayer;
}
const archivedPlayer = normalizeMedicalPlayer({
...medicalPlayer,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Removed from Squad Room",
});
if (archivedPlayer) {
archivedPlayers.push(archivedPlayer);
return archivedPlayer;
}
return medicalPlayer;
});
medicalState.records = medicalState.records.map((record) =>
matchingPlayerIds.has(String(record.playerId || "").trim()) && !isMedicalItemArchived(record)
? normalizeMedicalRecord({
...record,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Player removed from Squad Room",
}) || record
: record
);
medicalState.injuryPlans = medicalState.injuryPlans.map((plan) =>
matchingPlayerIds.has(String(plan.playerId || "").trim()) && !isMedicalItemArchived(plan)
? normalizeMedicalInjuryPlan({
...plan,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Player removed from Squad Room",
}) || plan
: plan
);
medicalState.selectedPlayerId = getActiveMedicalPlayers()[0]?.id || "";
commitMedicalClinicalState(
"player-removed-from-squad",
`${archivedPlayers.map((player) => player.name).join(", ")} archived after Squad Room removal.`
);
return archivedPlayers;
}
function addPlayerProfile(values = {}) {
ensurePlayerProfilesState();
const roleGroup = getPlayerProfileRoleGroupForRole(values.primaryRole, values.position);
const result = validatePlayerProfileFormValues(
{
...values,
roleGroup,
},
{
existingPlayers: playerProfilesState.players,
}
);
if (!result.ok) {
return {
ok: false,
status: result.status || "error",
errors: result.errors,
warnings: result.warnings,
duplicates: result.duplicates,
player: null,
};
}
const player = result.player;
if (!player) {
return {
ok: false,
status: "error",
errors: ["Player could not be normalized."],
warnings: [],
duplicates: [],
player: null,
};
}
playerProfilesState.removedPlayerIds = normalizePlayerProfileRemovedIds(playerProfilesState.removedPlayerIds)
.filter((removedPlayerId) => removedPlayerId !== player.id);
playerProfilesState.players = [...playerProfilesState.players, player].sort(comparePlayerProfiles);
playerProfilesState.selectedPlayerId = player.id;
recordPlayerProfileChange("player-added", player, [
{ field: "Primary role", from: "-", to: player.primaryRole },
{ field: "Role group", from: "-", to: formatPlayerProfileChangeValue(player.roleGroup, { options: playerProfileRoleGroupOptions }) },
{ field: "Squad status", from: "-", to: formatPlayerProfileChangeValue(player.squadStatus, { options: playerProfileSquadStatusOptions }) },
{ field: "Roster type", from: "-", to: formatPlayerProfileChangeValue(player.rosterType, { options: playerProfileRosterTypeOptions }) },
]);
writePlayerProfilesState();
syncMedicalPlayersFromPlayerProfiles([player]);
return {
ok: true,
status: result.status || "success",
errors: [],
warnings: result.warnings,
duplicates: result.duplicates,
player,
};
}
function updatePlayerProfile(values = {}) {
ensurePlayerProfilesState();
const playerIndex = playerProfilesState.players.findIndex((player) => player.id === values.playerId);
if (playerIndex < 0) {
return {
ok: false,
status: "error",
errors: ["Player profile could not be found."],
warnings: [],
duplicates: [],
player: null,
};
}
const currentPlayer = playerProfilesState.players[playerIndex];
const currentNaturalRoleGroup = getPlayerProfileRoleGroupForRole(currentPlayer.primaryRole, currentPlayer.position);
const nextPrimaryRole = normalizePlayerProfileRole(values.primaryRole, currentPlayer.primaryRole);
const nextPosition = values.position || currentPlayer.position;
const nextNaturalRoleGroup = getPlayerProfileRoleGroupForRole(nextPrimaryRole, nextPosition);
const submittedRoleGroup = String(values.roleGroup || "").trim();
const shouldAutoAlignRoleGroup =
(!submittedRoleGroup || submittedRoleGroup === currentPlayer.roleGroup) &&
currentPlayer.roleGroup === currentNaturalRoleGroup &&
nextNaturalRoleGroup !== currentPlayer.roleGroup;
const hasSubmittedValue = (key) => Object.prototype.hasOwnProperty.call(values, key);
const currentRosterType = normalizePlayerProfileRosterType(currentPlayer.rosterType, "squad");
const currentIsSquadPlayer = playerProfileCountsInSquad(currentPlayer);
const submittedRosterType = hasSubmittedValue("rosterType")
? normalizePlayerProfileRosterType(values.rosterType, currentRosterType)
: currentRosterType;
const nextRosterType = submittedRosterType;
const nextCountsInSquad = playerProfileRosterTypeCountsInSquad(nextRosterType);
const nextTemporaryGroup = nextCountsInSquad
? ""
: hasSubmittedValue("temporaryGroup")
? values.temporaryGroup
: currentPlayer.temporaryGroup;
const nextTemporaryFrom = nextCountsInSquad
? ""
: hasSubmittedValue("temporaryFrom")
? values.temporaryFrom
: currentPlayer.temporaryFrom;
const nextTemporaryTo = nextCountsInSquad
? ""
: hasSubmittedValue("temporaryTo")
? values.temporaryTo
: currentPlayer.temporaryTo;
const nextPhotoUrl = hasSubmittedValue("photoUrl") ? values.photoUrl : currentPlayer.photoUrl;
const nextPlayer = normalizePlayerProfile({
...currentPlayer,
...values,
primaryRole: nextPrimaryRole,
roleGroup: shouldAutoAlignRoleGroup ? nextNaturalRoleGroup : submittedRoleGroup || nextNaturalRoleGroup,
rosterType: nextRosterType,
countsInSquad: nextCountsInSquad,
temporaryGroup: nextTemporaryGroup,
temporaryFrom: nextTemporaryFrom,
temporaryTo: nextTemporaryTo,
photoUrl: nextPhotoUrl,
attributeRatings: {
...currentPlayer.attributeRatings,
...values.attributeRatings,
},
idp: {
...currentPlayer.idp,
...values.idp,
},
futureData: {
...currentPlayer.futureData,
...values.futureData,
},
updatedAt: new Date().toISOString(),
});
const validation = validatePlayerProfileFormValues(nextPlayer, {
existingPlayers: playerProfilesState.players,
ignorePlayerId: currentPlayer.id,
});
if (!validation.ok) {
return {
ok: false,
status: validation.status || "error",
errors: validation.errors,
warnings: validation.warnings,
duplicates: validation.duplicates,
player: null,
};
}
if (!validation.player) {
return {
ok: false,
status: "error",
errors: ["Player could not be normalized."],
warnings: [],
duplicates: [],
player: null,
};
}
const normalizedNextPlayer = validation.player;
const changes = getPlayerProfileChangeDiffs(currentPlayer, normalizedNextPlayer);
const nextPlayers = [...playerProfilesState.players];
nextPlayers[playerIndex] = normalizedNextPlayer;
playerProfilesState.players = nextPlayers.sort(comparePlayerProfiles);
playerProfilesState.selectedPlayerId = normalizedNextPlayer.id;
if (changes.length) {
recordPlayerProfileChange("profile-updated", normalizedNextPlayer, changes);
}
writePlayerProfilesState();
syncMedicalPlayersFromPlayerProfiles([normalizedNextPlayer]);
return {
ok: true,
status: validation.status || "success",
errors: [],
warnings: validation.warnings,
duplicates: validation.duplicates,
player: normalizedNextPlayer,
};
}
function removePlayerProfile(playerId) {
if (!isCurrentPlatformUserAdmin()) return false;
ensurePlayerProfilesState();
const removedPlayer = playerProfilesState.players.find((player) => player.id === playerId) ?? null;
const removedPlayerIds = normalizePlayerProfileRemovedIds(playerProfilesState.removedPlayerIds);
if (playerId && !removedPlayerIds.includes(playerId)) {
removedPlayerIds.push(playerId);
}
playerProfilesState.removedPlayerIds = removedPlayerIds;
const nextPlayers = playerProfilesState.players.filter((player) => player.id !== playerId);
playerProfilesState.players = nextPlayers;
playerProfilesState.selectedPlayerId = nextPlayers[0]?.id || "";
if (removedPlayer) {
recordPlayerProfileChange("player-removed", removedPlayer, [
{ field: "Squad status", from: formatPlayerProfileChangeValue(removedPlayer.squadStatus, { options: playerProfileSquadStatusOptions }), to: "Removed" },
]);
}
writePlayerProfilesState();
archiveMedicalPlayersForRemovedPlayerProfile(removedPlayer || { id: playerId });
return true;
}
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
function recordMedicalAuditEvent(event = {}) {
const auditBridge = win.footballScienceAudit;
if (!getCurrentPlatformUser() || !auditBridge?.record) {
return Promise.resolve({ ok: false });
}
return auditBridge.record(event).catch(() => ({ ok: false }));
}
function getMedicalDatabasePlayer(playerId) {
ensureMedicalState();
return medicalState.players.find((player) => player.id === playerId) ?? null;
}
function buildMedicalDatabaseStateSummary() {
ensureMedicalState();
const stats = getMedicalDailyStats(medicalState.selectedDate);
const archiveCounts = getMedicalDataSafetyCounts(medicalState);
return {
selectedDate: medicalState.selectedDate,
rosterVersion: medicalState.rosterVersion,
playerCount: getActiveMedicalPlayers().length,
archivedPlayerCount: archiveCounts.archivedPlayers,
recordCount: medicalState.records.length,
injuryPlanCount: medicalState.injuryPlans.length,
archivedRecordCount: archiveCounts.archivedRecords,
archivedPlanCount: archiveCounts.archivedPlans,
lastClinicalChangeAt: medicalState.dataSafety?.lastClinicalChangeAt || "",
fullCount: stats.fullCount,
modifiedCount: stats.modifiedCount,
unavailableCount: stats.unavailableCount,
unloggedCount: stats.unloggedCount,
coachSharedItems:
medicalState.records.filter((record) => !isMedicalItemArchived(record) && record.shareWithCoach).length +
medicalState.injuryPlans.filter((plan) => !isMedicalItemArchived(plan) && plan.shareWithCoach).length,
};
}
function getMedicalDatabaseIdempotencyKey(eventType, payload = {}) {
const playerId = payload.playerId || payload.record?.playerId || payload.plan?.playerId || payload.player?.id || "";
const entityId =
payload.record?.id ||
payload.plan?.id ||
payload.player?.id ||
payload.recordId ||
payload.planId ||
payload.policy?.updatedAt ||
payload.updatedAt ||
Date.now();
return [eventType, playerId, entityId].filter(Boolean).join(":");
}
function recordMedicalDatabaseSyncEvent(eventType, payload = {}) {
const databaseBridge = win.footballScienceMedicalDatabase;
if (!getCurrentPlatformUser() || !canViewPrivateMedicalDetails() || !databaseBridge?.record) {
return Promise.resolve({ ok: false });
}
const legacyPlayerId = payload.playerId || payload.record?.playerId || payload.plan?.playerId || payload.player?.id || "";
const player = payload.player || getMedicalDatabasePlayer(legacyPlayerId);
const payloadCopy = { ...payload };
delete payloadCopy.idempotencyKey;
return databaseBridge
.record({
action: "recordSyncEvent",
eventType,
legacyPlayerId,
idempotencyKey: payload.idempotencyKey || getMedicalDatabaseIdempotencyKey(eventType, payload),
payload: {
schema: "footballscience-medical-room-event-v1",
sourceKey: medicalTeamStorageKey,
eventType,
selectedDate: medicalState?.selectedDate || "",
player: player
? {
id: player.id,
name: player.name,
number: player.number,
position: player.position,
photoUrl: player.photoUrl,
updatedAt: player.updatedAt,
}
: null,
stateSummary: buildMedicalDatabaseStateSummary(),
...payloadCopy,
},
})
.then((result) => {
updateMedicalDatabaseSyncStatus(eventType, result);
return result;
})
.catch(() => {
const result = { ok: false };
updateMedicalDatabaseSyncStatus(eventType, result);
return result;
});
}
function copyMedicalCoachHandoverToClipboard() {
const text = buildMedicalCoachHandoverText(medicalState.selectedDate);
if (!navigator.clipboard?.writeText) {
renderMedicalTeamWorkspace("Clipboard is not available in this browser.");
return;
}
navigator.clipboard
.writeText(text)
.then(() => {
void recordMedicalAuditEvent({
action: "medical.handover.copied",
summary: "Copied coach-safe medical handover",
details: {
date: medicalState.selectedDate,
itemCount: getMedicalCoachHandoverItems(medicalState.selectedDate).length,
},
});
renderMedicalTeamWorkspace("Coach-safe handover copied.");
})
.catch(() => renderMedicalTeamWorkspace("Coach-safe handover could not be copied."));
}
function getMedicalPlayerProfileSummary(player, dateValue = medicalState?.selectedDate) { return medicalProfileSummarySelectors.getMedicalPlayerProfileSummary(player, dateValue); }
function getFilteredMedicalPlayers() {
ensureMedicalState();
const query = medicalRosterSearchQuery.trim().toLowerCase();
return getActiveMedicalPlayersForDate(medicalState.selectedDate).filter((player) => {
const record = getLatestMedicalRecord(player.id, medicalState.selectedDate);
const status = getMedicalRecordStatus(record);
const matchesSearch = !query || `${player.name} ${player.number} ${player.position} ${getPlayerProfileRosterLabel(player)}`.toLowerCase().includes(query);
const matchesStatus =
medicalStatusFilter === "all" ||
(medicalStatusFilter === "not-set" && !record) ||
status.key === medicalStatusFilter;
return matchesSearch && matchesStatus;
});
}
function getMedicalValidBulkSelection() {
ensureMedicalState();
const validIds = new Set(
getActiveMedicalPlayersForDate(medicalState.selectedDate)
.filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player))
.map((player) => player.id)
);
medicalBulkSelectedPlayerIds = new Set(
Array.from(medicalBulkSelectedPlayerIds).filter((playerId) => validIds.has(playerId))
);
return medicalBulkSelectedPlayerIds;
}
function getMedicalBulkSelectedPlayers() {
const selectedIds = getMedicalValidBulkSelection();
return getActiveMedicalPlayersForDate(medicalState.selectedDate).filter((player) => selectedIds.has(player.id)).sort(compareMedicalPlayers);
}
function getMedicalBulkRecommendationEligiblePlayers(players = getFilteredMedicalPlayers()) { return players.filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player)); }
function toggleMedicalBulkPlayer(playerId) {
const selectedIds = getMedicalValidBulkSelection();
const player = getActiveMedicalPlayersForDate(medicalState.selectedDate).find((candidate) => candidate.id === playerId);
if (isMedicalPlayerBlockedBySquadAvailability(player)) {
selectedIds.delete(playerId);
renderMedicalTeamWorkspace(getMedicalPlayerSquadAvailabilityBlockReason(player));
return;
}
if (selectedIds.has(playerId)) {
selectedIds.delete(playerId);
} else if (getActiveMedicalPlayers().some((player) => player.id === playerId)) {
selectedIds.add(playerId);
}
renderMedicalTeamWorkspace();
}
function setMedicalBulkSelection(playerIds = [], dateValue = medicalState.selectedDate) {
const validIds = new Set(
getActiveMedicalPlayersForDate(dateValue)
.filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player))
.map((player) => player.id)
);
medicalBulkSelectedPlayerIds = new Set(playerIds.filter((playerId) => validIds.has(playerId)));
renderMedicalTeamWorkspace();
}
function setMedicalBulkNotSetSelection(dateValue = formatScheduleDateValue(new Date()), players = getFilteredMedicalPlayers()) {
const bulkDate = isMedicalDateValue(dateValue) ? dateValue : formatScheduleDateValue(new Date());
const activityContext = getMedicalRecommendationActivityContext(bulkDate);
medicalBulkRecommendationOpen = true;
if (!activityContext.isRecommendable) {
medicalBulkSelectedPlayerIds = new Set();
renderMedicalTeamWorkspace(activityContext.blockReason);
return;
}
setMedicalBulkSelection(
players
.filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player))
.filter((player) => !getLatestMedicalRecord(player.id, bulkDate))
.map((player) => player.id),
bulkDate
);
}
function applyMedicalQuickRecommendation(playerId, participationValue) {
ensureMedicalState();
const player = medicalState.players.find((candidate) => candidate.id === playerId);
if (!player) {
return { player: null, record: null, blockReason: "Player could not be found." };
}
const dateValue = medicalState.selectedDate;
const participation = normalizeMedicalParticipation(participationValue, 75);
const status = getMedicalStatusForParticipation(participation);
const blockReason = getMedicalRecommendationBlockReason(player.id, participation, dateValue);
if (blockReason) {
return { player, record: null, blockReason };
}
const record = addMedicalRecord({
playerId: player.id,
date: dateValue,
status,
participation,
actualParticipation: medicalActualParticipationFallback,
comment: "",
coachNote: "",
shareWithCoach: false,
rtpPhase: getMedicalRtpPhaseForRecommendation(
status,
participation,
getMedicalRecommendationActivityContext(dateValue).type
),
});
return { player, record, blockReason: "" };
}
function applyMedicalBulkRecommendation(values = {}) {
ensureMedicalState();
const selectedPlayers = getMedicalBulkSelectedPlayers();
const dateValue = isMedicalDateValue(values.date) ? values.date : medicalState.selectedDate;
const participation = normalizeMedicalParticipation(values.participation, 75);
const status = getMedicalStatusForParticipation(participation);
const activityContext = getMedicalRecommendationActivityContext(dateValue);
if (!activityContext.isRecommendable) {
return {
savedCount: 0,
records: [],
blockedCount: selectedPlayers.length,
blockedNames: selectedPlayers.map((player) => player.name),
blockReason: activityContext.blockReason,
};
}
const rtpPhase = medicalRtpPhaseOptions.some((phase) => phase.key === values.rtpPhase)
? values.rtpPhase
: getMedicalRtpPhaseForRecommendation(status, participation, activityContext.type);
const blockedPlayers = [];
const savedRecords = [];
let savedCount = 0;
selectedPlayers.forEach((player) => {
const blockReason = getMedicalRecommendationBlockReason(player.id, participation, dateValue);
if (blockReason) {
blockedPlayers.push(player);
return;
}
const record = addMedicalRecord({
playerId: player.id,
date: dateValue,
status,
participation,
actualParticipation: medicalActualParticipationFallback,
comment: values.comment,
coachNote: values.coachNote,
shareWithCoach: values.shareWithCoach,
rtpPhase,
}, { skipDataSafety: true });
if (record) {
savedCount += 1;
savedRecords.push(record);
}
});
medicalState.selectedDate = dateValue;
medicalBulkSelectedPlayerIds = new Set();
medicalBulkRecommendationOpen = false;
if (savedCount) {
commitMedicalClinicalState("bulk-recommendation-saved", `${savedCount} bulk recommendations saved for ${dateValue}.`);
} else {
writeMedicalState();
}
return {
savedCount,
records: savedRecords,
blockedCount: blockedPlayers.length,
blockedNames: blockedPlayers.map((player) => player.name),
};
}
function updateMedicalBulkActivityControls(form) {
if (!form) {
return;
}
const dateValue = form.querySelector("[data-medical-bulk-date]")?.value;
const participationControl = form.querySelector("[data-medical-bulk-participation]");
const phasePreview = form.querySelector("[data-medical-bulk-rtp-preview]");
const activityLabel = form.querySelector("[data-medical-bulk-activity-label]");
const selectNotSetButton = form.querySelector("[data-medical-bulk-select-not-set]");
const submitButton = form.querySelector('button[type="submit"]');
const activityContext = getMedicalRecommendationActivityContext(dateValue);
const canRecommend = canEditMedicalTeam() && activityContext.isRecommendable;
const participation = normalizeMedicalParticipation(participationControl?.value, 75);
const phaseKey = getMedicalRtpPhaseForRecommendation(
getMedicalStatusForParticipation(participation),
participation,
activityContext.type
);
if (participationControl) {
participationControl.disabled = !canRecommend;
}
if (phasePreview) {
phasePreview.value = getMedicalRtpPhaseOption(phaseKey).label;
}
if (activityLabel) {
activityLabel.textContent = activityContext.isRecommendable
? `${activityContext.activityLabel} / ${activityContext.scheduleLabel}`
: activityContext.blockReason;
activityLabel.classList.toggle("is-locked", !activityContext.isRecommendable);
}
if (selectNotSetButton) {
selectNotSetButton.disabled = !canRecommend || !getMedicalBulkRecommendationEligiblePlayers(getFilteredMedicalPlayers()).length;
}
if (submitButton) {
submitButton.disabled = !canRecommend || !getMedicalBulkSelectedPlayers().length;
}
}
function renderMedicalMetric(label, value, meta = "", tone = "") {
const toneClass = tone ? ` medical-metric-card-${escapeHtml(tone)}` : "";
const noMetaClass = meta ? "" : " medical-metric-card-no-meta";
return `
<article class="medical-metric-card${toneClass}${noMetaClass}">
<span>${escapeHtml(label)}</span>
<strong>${escapeHtml(value)}</strong>
${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
</article>
`;
}
function updateMedicalGovernancePolicy(values = {}) {
if (!canViewPrivateMedicalDetails()) {
return false;
}
const now = new Date().toISOString();
medicalState.policy = normalizeMedicalGovernancePolicy({
...medicalState.policy,
retentionMonths: values.retentionMonths,
reviewCadenceDays: values.reviewCadenceDays,
consentRequired: values.consentRequired,
policyOwner: values.policyOwner,
incidentContact: values.incidentContact,
lastReviewed: values.lastReviewed,
updatedAt: now,
updatedBy: getCurrentPlatformUser()?.id || "",
});
writeMedicalState();
return true;
}
function normalizeMedicalOperationsTab(tabKey) { return medicalOperationsTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "availability"; }
function normalizeMedicalPlayerModalTab(tabKey) { return medicalPlayerModalTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "availability"; }
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
function renderMedicalTeamWorkspace(message = "", options = {}) {
if (!ui.medicalTeamWorkspace) {
return;
}
ensureMedicalState();
const teamName = getMedicalHeroTeamName();
medicalOperationsTab = normalizeMedicalOperationsTab(medicalOperationsTab);
const showAvailabilityWorkspace = !canViewPrivateMedicalDetails() || medicalOperationsTab === "availability";
ui.medicalTeamWorkspace.innerHTML = `
<div class="medical-shell">
<header class="medical-hero">
<div>
<p class="placeholder-tag">Medical Team</p>
<h1>${escapeHtml(teamName)}</h1>
</div>
<div class="medical-access-chip">${escapeHtml(getMedicalAccessLabel())}</div>
</header>
${renderMedicalOperationsTopMenu()}
${showAvailabilityWorkspace ? medicalRosterRenderer.renderAvailabilityWorkspace(message) : `${message ? `<div class="medical-message platform-inline-toast" role="status" aria-live="polite">${escapeHtml(message)}</div>` : ""}${renderMedicalOperationsSystem()}`}
${medicalPlayerModalRenderer.renderPlayerModal()}
</div>
`;
if (options.focusRosterSearch) {
const searchInput = ui.medicalTeamWorkspace.querySelector("[data-medical-roster-search]");
if (searchInput) {
searchInput.focus({ preventScroll: true });
const valueLength = searchInput.value.length;
const selectionStart = Math.min(Number(options.searchSelectionStart ?? valueLength), valueLength);
const selectionEnd = Math.min(Number(options.searchSelectionEnd ?? selectionStart), valueLength);
if (typeof searchInput.setSelectionRange === "function") {
searchInput.setSelectionRange(selectionStart, selectionEnd);
}
}
}
}
function upsertMedicalPlayers(players) {
ensureMedicalState();
const removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet();
const existingById = new Map(
medicalState.players
.filter((player) => player && player.id)
.map((player) => [String(player.id), player])
);
const existingBySignature = new Map(
medicalState.players.map((player) => [`${player.number}|${player.name}`.toLowerCase(), player])
);
const nextPlayers = [...medicalState.players];
players.forEach((player) => {
const signature = `${String(player.number || "").trim()}|${String(player.name || "").trim().toLowerCase()}`;
const playerId = String(player.id || "").trim();
const existingPlayer = existingById.get(playerId) || existingBySignature.get(signature);
if (isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet)) {
if (existingPlayer && !isMedicalItemArchived(existingPlayer)) {
const archivedAt = new Date().toISOString();
Object.assign(existingPlayer, {
...existingPlayer,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Removed from Squad Room",
});
}
return;
}
if (existingPlayer) {
Object.assign(existingPlayer, {
...existingPlayer,
...player,
id: existingPlayer.id || player.id,
archivedAt: "",
archivedBy: "",
archiveReason: "",
updatedAt: new Date().toISOString(),
});
} else {
nextPlayers.push(player);
if (playerId) {
existingById.set(playerId, player);
}
existingBySignature.set(signature, player);
}
});
medicalState = cloneMedicalState({
...medicalState,
players: nextPlayers,
selectedPlayerId: medicalState.selectedPlayerId || nextPlayers[0]?.id || "",
});
writeMedicalState();
}
function addMedicalRecord(values, options = {}) {
ensureMedicalState();
const playerId = values.playerId;
const player = medicalState.players.find((candidate) => candidate.id === playerId);
if (!player || !isMedicalDateValue(values.date)) {
return null;
}
if (isMedicalPlayerBlockedBySquadAvailability(player)) {
return null;
}
const participation = normalizeMedicalParticipation(values.participation);
const status = medicalStatusOptions.some((option) => option.key === values.status)
? values.status
: getMedicalStatusForParticipation(participation);
const activityContext = getMedicalRecommendationActivityContext(values.date);
if (!activityContext.isRecommendable) {
return null;
}
const record = normalizeMedicalRecord({
playerId,
date: values.date,
status,
participation,
actualParticipation: values.actualParticipation,
comment: values.comment,
coachNote: values.coachNote,
shareWithCoach: values.shareWithCoach,
rtpPhase: values.rtpPhase,
createdBy: getCurrentPlatformUser()?.id || "",
});
if (!record) {
return null;
}
medicalState.records = [record, ...medicalState.records];
medicalState.selectedDate = record.date;
medicalState.selectedPlayerId = playerId;
if (options.skipDataSafety) {
writeMedicalState();
} else {
commitMedicalClinicalState("recommendation-saved", `${player.name}: ${record.participation}% recommendation saved.`);
}
return record;
}
function updateMedicalPlayerProfile(values) {
ensureMedicalState();
const playerId = values.playerId;
const playerIndex = medicalState.players.findIndex((player) => player.id === playerId);
if (playerIndex < 0) {
return false;
}
const nextPlayer = normalizeMedicalPlayer({
...medicalState.players[playerIndex],
number: values.number,
name: values.name,
position: values.position,
photoUrl: values.photoUrl,
updatedAt: new Date().toISOString(),
});
if (!nextPlayer) {
return false;
}
const nextPlayers = [...medicalState.players];
nextPlayers[playerIndex] = nextPlayer;
medicalState = cloneMedicalState({
...medicalState,
players: nextPlayers,
selectedPlayerId: nextPlayer.id,
});
commitMedicalClinicalState("player-profile-saved", `${nextPlayer.name} profile saved.`);
return true;
}
function removeMedicalPlayer(playerId) {
ensureMedicalState();
const playerIndex = medicalState.players.findIndex((player) => player.id === playerId);
if (playerIndex < 0) {
return null;
}
const archivedAt = new Date().toISOString();
const archivedPlayer = normalizeMedicalPlayer({
...medicalState.players[playerIndex],
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Manual archive from Medical Room",
});
if (!archivedPlayer) {
return null;
}
const nextPlayers = [...medicalState.players];
nextPlayers[playerIndex] = archivedPlayer;
medicalState.players = nextPlayers;
medicalState.records = medicalState.records.map((record) =>
record.playerId === playerId && !isMedicalItemArchived(record)
? normalizeMedicalRecord({
...record,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Player archived from Medical Room",
}) || record
: record
);
medicalState.injuryPlans = medicalState.injuryPlans.map((plan) =>
plan.playerId === playerId && !isMedicalItemArchived(plan)
? normalizeMedicalInjuryPlan({
...plan,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Player archived from Medical Room",
}) || plan
: plan
);
medicalState.selectedPlayerId = getActiveMedicalPlayers()[0]?.id || "";
commitMedicalClinicalState("player-archived", `${archivedPlayer.name} archived with protected medical history.`);
return archivedPlayer;
}
function removeMedicalRecord(recordId) {
ensureMedicalState();
const recordIndex = medicalState.records.findIndex((record) => record.id === recordId);
if (recordIndex < 0) {
return null;
}
const currentRecord = medicalState.records[recordIndex];
if (isMedicalItemArchived(currentRecord)) {
return currentRecord;
}
const archivedAt = new Date().toISOString();
const archivedRecord = normalizeMedicalRecord({
...currentRecord,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Manual archive from Medical Room",
});
if (!archivedRecord) {
return null;
}
const nextRecords = [...medicalState.records];
nextRecords[recordIndex] = archivedRecord;
medicalState.records = nextRecords;
commitMedicalClinicalState("record-archived", "Medical log entry archived and kept in protected history.");
return archivedRecord;
}
function addMedicalInjuryPlan(values) {
ensureMedicalState();
const player = medicalState.players.find((candidate) => candidate.id === values.playerId);
if (!player) {
return null;
}
const plan = normalizeMedicalInjuryPlan({
...values,
clearance: getMedicalClearanceValues(values),
gates: getMedicalLoadGateValues(values),
createdBy: getCurrentPlatformUser()?.id || "",
});
if (!plan) {
return null;
}
medicalState.injuryPlans = [plan, ...medicalState.injuryPlans];
medicalState.selectedDate = plan.startDate;
medicalState.selectedPlayerId = plan.playerId;
commitMedicalClinicalState("availability-plan-created", `${player.name}: availability plan created.`);
return plan;
}
function updateMedicalInjuryPlan(values) {
ensureMedicalState();
const planIndex = medicalState.injuryPlans.findIndex((plan) => plan.id === values.planId);
if (planIndex < 0) {
return null;
}
const currentPlan = medicalState.injuryPlans[planIndex];
if (isMedicalItemArchived(currentPlan)) {
return null;
}
const player = medicalState.players.find((candidate) => candidate.id === currentPlan.playerId);
const nextPlan = normalizeMedicalInjuryPlan({
...currentPlan,
...values,
id: currentPlan.id,
playerId: currentPlan.playerId,
clearance: currentPlan.clearance,
gates: currentPlan.gates,
createdAt: currentPlan.createdAt,
createdBy: currentPlan.createdBy,
updatedAt: new Date().toISOString(),
});
if (!nextPlan) {
return null;
}
const nextPlans = [...medicalState.injuryPlans];
nextPlans[planIndex] = nextPlan;
medicalState.injuryPlans = nextPlans;
medicalState.selectedDate = nextPlan.startDate;
medicalState.selectedPlayerId = nextPlan.playerId;
commitMedicalClinicalState("availability-plan-updated", `${player?.name || "Player"}: availability plan updated.`);
return nextPlan;
}
function updateMedicalPlanClearance(values) {
ensureMedicalState();
const planIndex = medicalState.injuryPlans.findIndex((plan) => plan.id === values.planId);
if (planIndex < 0) {
return false;
}
const currentPlan = medicalState.injuryPlans[planIndex];
const phase = getMedicalRtpPhaseOption(values.rtpPhase || currentPlan.rtpPhase);
const nextPlan = normalizeMedicalInjuryPlan({
...currentPlan,
status: phase.status,
participation: phase.participation,
rtpPhase: phase.key,
phase: currentPlan.rtpPhase === phase.key ? currentPlan.phase : phase.label,
clearance: getMedicalClearanceValues(values),
gates: getMedicalLoadGateValues(values),
updatedAt: new Date().toISOString(),
});
if (!nextPlan) {
return false;
}
const nextPlans = [...medicalState.injuryPlans];
nextPlans[planIndex] = nextPlan;
medicalState.injuryPlans = nextPlans;
medicalState.selectedPlayerId = nextPlan.playerId;
commitMedicalClinicalState("clearance-saved", "Clearance checklist saved.");
return nextPlan;
}
function removeMedicalInjuryPlan(planId) {
ensureMedicalState();
const planIndex = medicalState.injuryPlans.findIndex((plan) => plan.id === planId);
if (planIndex < 0) {
return null;
}
const currentPlan = medicalState.injuryPlans[planIndex];
if (isMedicalItemArchived(currentPlan)) {
return currentPlan;
}
const archivedAt = new Date().toISOString();
const archivedPlan = normalizeMedicalInjuryPlan({
...currentPlan,
updatedAt: archivedAt,
archivedAt,
archivedBy: getCurrentMedicalActorId(),
archiveReason: "Manual archive from Medical Room",
});
if (!archivedPlan) {
return null;
}
const nextPlans = [...medicalState.injuryPlans];
nextPlans[planIndex] = archivedPlan;
medicalState.injuryPlans = nextPlans;
commitMedicalClinicalState("availability-plan-archived", "Availability plan archived and kept in protected history.");
return archivedPlan;
}
function openMedicalPlayerModal(playerId) {
ensureMedicalState();
if (!medicalState.players.some((player) => player.id === playerId)) {
return;
}
medicalState.selectedPlayerId = playerId;
medicalPlayerModalOpen = true;
medicalPlayerModalTab = "availability";
writeMedicalState();
renderMedicalTeamWorkspace();
}
function closeMedicalPlayerModal(message = "") {
medicalPlayerModalOpen = false;
medicalPlayerModalTab = "availability";
renderMedicalTeamWorkspace(message);
}
function setMedicalSelectedDate(dateValue) {
if (!isMedicalDateValue(dateValue)) {
return;
}
ensureMedicalState();
medicalState.selectedDate = dateValue;
writeMedicalState();
renderMedicalTeamWorkspace();
}
function shiftMedicalSelectedDate(deltaDays) {
ensureMedicalState();
const currentDate = parseScheduleDateValue(medicalState.selectedDate);
setMedicalSelectedDate(formatScheduleDateValue(addCalendarDays(currentDate, deltaDays)));
}
function getPeriodizationDayScheduleLabel(day) { return periodizationRenderer.getDayScheduleLabel(day); }
function getPeriodizationMatchDayLabel(value) { return periodizationRenderer.getMatchDayLabel(value); }
function getPeriodizationMultiFieldValue(field, dateValue) { return periodizationRenderer.getMultiFieldValue(field, dateValue); }
function getPeriodizationCustomFieldValue(field, dateValue) { return periodizationRenderer.getCustomFieldValue(field, dateValue); }
function refreshSessionPlannerMatchDayChip() {
if (!ui.sessionPlannerWorkspace || !sessionPlannerState) {
return;
}
const headerInfo = ui.sessionPlannerWorkspace.querySelector(".session-blocks-card .session-card-head > div");
if (!headerInfo) {
return;
}
const existingChip = headerInfo.querySelector(".session-matchday-chip");
const matchDayLabel = getPeriodizationMatchDayLabel(
getPeriodizationDay(sessionPlannerState.selectedDate).matchDay
);
if (!matchDayLabel) {
existingChip?.remove();
return;
}
if (existingChip) {
existingChip.textContent = `(${matchDayLabel})`;
return;
}
headerInfo.insertAdjacentHTML(
"beforeend",
`<strong class="session-matchday-chip">(${escapeHtml(matchDayLabel)})</strong>`
);
}
const sessionPlannerPeriodizationBridge = createPeriodizationSessionBridge({
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
refreshMatchDayChip: refreshSessionPlannerMatchDayChip,
});
function renderSessionPlannerPeriodizationSummary(dateValue) { return sessionPlannerPeriodizationBridge.renderSummary(dateValue); }
function renderSessionPlannerPeriodizationOverlay() { return sessionPlannerPeriodizationBridge.renderOverlay(); }
const periodizationWorkspaceShell = createPeriodizationWorkspaceShell({
ui,
renderer: periodizationRenderer,
getState: () => periodizationState,
canEdit: canEditPeriodizationWorkspace,
getOverlayState: () => ({ open: periodizationDayOverlayOpen, mode: periodizationDayOverlayMode }),
setOverlayMode: (mode) => {
periodizationDayOverlayMode = mode === "edit" ? "edit" : "view";
},
});
const {
renderWorkspace: renderPeriodizationWorkspace,
refreshBoardMultiFields: refreshPeriodizationBoardMultiFields,
refreshDependentFields: refreshPeriodizationBoardDependentFields,
} = periodizationWorkspaceShell;
const periodizationWorkspaceController = createPeriodizationWorkspaceController({
ui,
getState: () => periodizationState,
canEdit: canEditPeriodizationWorkspace,
render: renderPeriodizationWorkspace,
jumpToToday: jumpPeriodizationToToday,
shiftMonth: shiftPeriodizationMonth,
setMonth: setPeriodizationMonth,
selectDate: selectPeriodizationDate,
writeDay: writePeriodizationDay,
getCustomFieldValue: getPeriodizationCustomFieldValue,
getMultiFieldValue: getPeriodizationMultiFieldValue,
isMultiField: (fieldKey) => periodizationMultiFields.has(fieldKey),
getMultiSelectOpenField: () => periodizationMultiSelectOpenField,
setMultiSelectOpenField: (fieldKey = "") => {
periodizationMultiSelectOpenField = fieldKey;
},
setOverlayState: ({ open, mode }) => {
periodizationDayOverlayOpen = Boolean(open);
periodizationDayOverlayMode = mode === "edit" ? "edit" : "view";
},
refreshMultiFields: refreshPeriodizationBoardMultiFields,
refreshDependentFields: refreshPeriodizationBoardDependentFields,
});
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
ui.profileMenu?.addEventListener("click", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
if (!trigger) {
return;
}
setProfileMenuOpen(false);
setActiveWorkspace(trigger.dataset.openWorkspace);
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
win.addEventListener("platform:open-workspace", (event) => {
const workspaceId = event.detail?.workspaceId;
if (!workspaceId) {
return;
}
win.__pendingWorkspaceId = workspaceId;
if (!hubState) {
return;
}
setProfileMenuOpen(false);
setActiveWorkspace(workspaceId);
});
ui.profileWorkspace?.addEventListener("submit", async (event) => {
event.preventDefault();
if (win.platformAuthReadyPromise instanceof Promise) {
try {
await win.platformAuthReadyPromise;
} catch {
}
}
const todoForm = event.target.closest("#profileTodoForm");
if (todoForm) {
const user = getCurrentPlatformUser();
const values = getPlatformFormValues(todoForm);
if (!user || !values.title) {
return;
}
createDashboardTask({
title: values.title,
assignedTo: user.id,
scope: "personal",
});
refreshDashboardSurfaces();
return;
}
const form = event.target.closest("#profileForm");
if (!form) {
return;
}
const user = getCurrentPlatformUser();
const authStore = getPlatformAuthStore();
if (!user || !authStore) {
return;
}
const values = getPlatformFormValues(form);
const profileValues = { ...values };
delete profileValues.role;
delete profileValues.status;
setFormSubmitButtonState(form, {
isSubmitting: true,
submittingLabel: "Saving...",
defaultLabel: "Save",
});
if (hasUserFieldConflict(user.id, values)) {
setFormSubmitButtonState(form, { isSubmitting: false });
renderProfileWorkspace("Username or email already exists.");
return;
}
try {
const result = await authStore.updateUser(user.id, profileValues);
if (!result?.ok) {
renderProfileWorkspace(result?.reason || "Profile could not be saved.");
return;
}
updatePlatformUserFromPayload({ ...user, ...(result.user || result.payload?.user), ...profileValues });
syncPlatformUserFromAuth();
renderWorkspaceChrome();
renderProfileWorkspace("Saved.");
} catch (error) {
renderProfileWorkspace(
error?.message || "Profile details could not be saved right now. Make sure you are signed in and try again."
);
} finally {
setFormSubmitButtonState(form, { isSubmitting: false, defaultLabel: "Save" });
}
});
ui.profileWorkspace?.addEventListener("change", async (event) => {
const imageInput = event.target.closest("#profileImageUpload");
if (!imageInput) {
return;
}
if (win.platformAuthReadyPromise instanceof Promise) {
try {
await win.platformAuthReadyPromise;
} catch {
}
}
const file = imageInput.files?.[0];
if (!file) {
return;
}
const user = getCurrentPlatformUser();
const authStore = getPlatformAuthStore();
if (!user || !authStore) {
return;
}
const form = imageInput.closest("#profileForm");
const values = form ? getPlatformFormValues(form) : {};
if (form && hasUserFieldConflict(user.id, values)) {
renderProfileWorkspace("Username or email already exists.");
return;
}
try {
const profileImageUrl = await createProfileImageDataUrl(file);
const profileValues = { ...values };
delete profileValues.role;
delete profileValues.status;
renderProfileWorkspace("Uploading profile image...");
const uploadImage = authStore.uploadProfileImage || ((userId, imageDataUrl, patch) =>
authStore.updateUser?.(userId, { ...patch, profileImageUrl: imageDataUrl }));
const result = await uploadImage(user.id, profileImageUrl, profileValues);
if (!result?.ok) {
renderProfileWorkspace(result?.reason || "Profile image could not be saved.");
return;
}
updatePlatformUserFromPayload(result.user || result.payload?.user);
syncPlatformUserFromAuth();
renderWorkspaceChrome();
renderProfileWorkspace("Profile image saved.");
} catch (error) {
const message =
error?.name === "QuotaExceededError"
? "Profile image could not be saved because local storage is full."
: error?.message ?? "Profile image could not be saved.";
renderProfileWorkspace(message);
}
});
ui.profileWorkspace?.addEventListener("click", async (event) => {
const removePhotoButton = event.target.closest("[data-profile-remove-photo]");
if (removePhotoButton) {
if (win.platformAuthReadyPromise instanceof Promise) {
try {
await win.platformAuthReadyPromise;
} catch {
}
}
const user = getCurrentPlatformUser();
const authStore = getPlatformAuthStore();
if (!user || !authStore) {
return;
}
try {
const removeImage = authStore.removeProfileImage || ((userId) => authStore.updateUser?.(userId, { profileImageUrl: "" }));
const result = await removeImage(user.id);
if (!result?.ok) {
renderProfileWorkspace(result?.reason || "Profile image could not be removed.");
return;
}
updatePlatformUserFromPayload(result.user || result.payload?.user);
syncPlatformUserFromAuth();
renderWorkspaceChrome();
renderProfileWorkspace("Profile image removed.");
} catch (error) {
renderProfileWorkspace(error?.message || "Profile image could not be removed.");
}
return;
}
const toggleTaskButton = event.target.closest("[data-dashboard-toggle-task]");
if (toggleTaskButton) {
const task = readDashboardTasks().find((candidate) => candidate.id === toggleTaskButton.dataset.dashboardToggleTask);
if (!task) {
return;
}
updateDashboardTask(task.id, {
status: task.status === "done" ? "open" : "done",
});
refreshDashboardSurfaces();
return;
}
const removeTaskButton = event.target.closest("[data-dashboard-remove-task]");
if (!removeTaskButton) {
return;
}
if (win.confirm("Remove this To-Do?")) {
removeDashboardTask(removeTaskButton.dataset.dashboardRemoveTask);
refreshDashboardSurfaces();
}
});
ui.staffWorkspace?.addEventListener("click", async (event) => {
const passwordToggle = event.target.closest("[data-toggle-password-visibility]");
if (passwordToggle) {
togglePasswordInputVisibility(passwordToggle);
return;
}
const openCreateUserButton = event.target.closest("[data-staff-open-create-user]");
if (openCreateUserButton) {
staffCreateUserEditorOpen = true;
renderStaffWorkspace();
return;
}
const closeCreateUserButton = event.target.closest("[data-staff-close-create-user]");
if (closeCreateUserButton) {
staffCreateUserEditorOpen = false;
renderStaffWorkspace();
return;
}
const createUserOverlay = event.target.closest("[data-staff-create-user-overlay]");
if (createUserOverlay && event.target === createUserOverlay) {
staffCreateUserEditorOpen = false;
renderStaffWorkspace();
return;
}
const selectButton = event.target.closest("[data-staff-select-user]");
if (selectButton) {
selectedStaffUserId = selectButton.dataset.staffSelectUser;
staffCreateUserEditorOpen = false;
renderStaffWorkspace();
return;
}
const removeButton = event.target.closest("[data-staff-remove-user]");
if (!removeButton || !isCurrentPlatformUserAdmin()) {
return;
}
const userId = removeButton.dataset.staffRemoveUser;
const staffUser = getPlatformUsers().find((user) => user.id === userId);
if (!staffUser) {
return;
}
const structure = syncPlatformStructureWithUsers(getPlatformUsers());
if (!canAdminManageUser(getCurrentPlatformUser(), staffUser, structure, { remove: true })) {
renderStaffWorkspace("This user is outside your admin scope.");
return;
}
if (!win.confirm(`Remove ${formatUserName(staffUser)}?`)) {
return;
}
const result = await getPlatformAuthStore()?.removeUser?.(userId);
if (!result?.ok) {
renderStaffWorkspace(result?.reason ?? "User could not be removed.");
return;
}
selectedStaffUserId = null;
renderWorkspaceChrome();
renderStaffWorkspace("Removed.");
});
ui.staffWorkspace?.addEventListener("submit", async (event) => {
const form = event.target.closest("#staffUserForm");
if (!form || !isCurrentPlatformUserAdmin()) {
return;
}
event.preventDefault();
const values = getPlatformFormValues(form);
const passwordError = getPasswordValidationMessage(values);
if (passwordError) {
renderStaffWorkspace(passwordError);
return;
}
const submissionValues = normalizeAdminUserSubmissionValues(
stripPasswordConfirmation({
...values,
status: "active",
}),
getCurrentPlatformUser(),
null,
syncPlatformStructureWithUsers(getPlatformUsers())
);
const result = await getPlatformAuthStore()?.createUser?.(submissionValues);
if (!result?.ok) {
renderStaffWorkspace(result?.reason ?? "User could not be added.");
return;
}
selectedStaffUserId = result.user?.id ?? null;
staffCreateUserEditorOpen = false;
form.reset();
renderWorkspaceChrome();
const generatedPassword = result.generatedPassword || "";
const passwordForMessage = submissionValues.password || generatedPassword;
const copied = passwordForMessage
? await maybeCopyToClipboard(
[
"Website: https://footballscience.xyz/",
`Username: ${result.user?.username || submissionValues.username}`,
`Email: ${result.user?.email || submissionValues.email}`,
`Password: ${passwordForMessage}`,
].join("\n")
)
: false;
renderStaffWorkspace(
passwordForMessage
? `User added. Password: ${passwordForMessage}.${copied ? " Copied to clipboard." : ""}`
: "User added."
);
});
async function createAdminUserFromForm(createUserForm) {
if (!createUserForm) {
return;
}
if (!isCurrentPlatformUserAdmin()) {
renderAdminWorkspace("Admin access required. Sign in as an admin and try again.");
return;
}
const values = getPlatformFormValues(createUserForm);
const passwordError = getPasswordValidationMessage(values);
if (passwordError) {
renderAdminWorkspace(passwordError);
return;
}
const authStore = getPlatformAuthStore();
if (!authStore?.createUser) {
renderAdminWorkspace("Supabase user creation is not ready yet. Reload the page and try again.");
return;
}
const submissionValues = normalizeAdminUserSubmissionValues(
stripPasswordConfirmation(values),
getCurrentPlatformUser(),
null,
syncPlatformStructureWithUsers(getPlatformUsers())
);
setFormSubmitButtonState(createUserForm, { isSubmitting: true, submittingLabel: "Creating...", defaultLabel: "Create user" });
try {
const result = await authStore.createUser(submissionValues);
if (!result?.ok) {
renderAdminWorkspace(result?.reason ?? "User could not be created.");
return;
}
selectedAdminUserId = result.user?.id ?? null;
adminCreateUserEditorOpen = false;
adminUserEditorOpen = Boolean(selectedAdminUserId);
createUserForm.reset();
renderWorkspaceChrome();
const generatedPassword = result.generatedPassword || "";
const passwordForMessage = submissionValues.password || generatedPassword;
const copied = passwordForMessage
? await maybeCopyToClipboard(
[
"Website: https://footballscience.xyz/",
`Username: ${result.user?.username || submissionValues.username}`,
`Email: ${result.user?.email || submissionValues.email}`,
`Password: ${passwordForMessage}`,
].join("\n")
)
: false;
renderAdminWorkspace(
passwordForMessage
? `User created in Supabase. Password: ${passwordForMessage}.${copied ? " Copied to clipboard." : ""} Use "Send login" only if you want to replace this password with a fresh temporary one.`
: `User created in Supabase. Use "Send login" to create and email a temporary password.`
);
} catch (error) {
renderAdminWorkspace(error?.message || "User could not be created in Supabase.");
} finally {
setFormSubmitButtonState(createUserForm, { isSubmitting: false, defaultLabel: "Create user" });
}
}
ui.adminWorkspace?.addEventListener("click", async (event) => {
const passwordToggle = event.target.closest("[data-toggle-password-visibility]");
if (passwordToggle) {
togglePasswordInputVisibility(passwordToggle);
return;
}
const openCreateUserButton = event.target.closest("[data-admin-open-create-user]");
if (openCreateUserButton) {
adminCreateUserTeamId = openCreateUserButton.dataset.adminOpenCreateUser || getUserTeamId(getCurrentPlatformUser(), getPlatformStructureState());
adminCreateUserEditorOpen = true;
adminUserEditorOpen = false;
renderAdminWorkspace();
return;
}
const closeCreateUserButton = event.target.closest("[data-admin-close-create-user]");
if (closeCreateUserButton) {
adminCreateUserEditorOpen = false;
renderAdminWorkspace();
return;
}
const createUserOverlay = event.target.closest("[data-admin-create-user-overlay]");
if (createUserOverlay && event.target === createUserOverlay) {
adminCreateUserEditorOpen = false;
renderAdminWorkspace();
return;
}
const createUserButton = event.target.closest("[data-admin-create-user-submit]");
if (createUserButton) {
event.preventDefault();
await createAdminUserFromForm(createUserButton.closest("#adminCreateUserForm"));
return;
}
const closeUserEditorButton = event.target.closest("[data-admin-close-user-editor]");
if (closeUserEditorButton) {
adminUserEditorOpen = false;
renderAdminWorkspace();
return;
}
const userEditorOverlay = event.target.closest("[data-admin-user-editor-overlay]");
if (userEditorOverlay && event.target === userEditorOverlay) {
adminUserEditorOpen = false;
renderAdminWorkspace();
return;
}
const selectButton = event.target.closest("[data-admin-select-user]");
if (selectButton) {
selectedAdminUserId = selectButton.dataset.adminSelectUser;
adminUserEditorOpen = true;
adminCreateUserEditorOpen = false;
renderAdminWorkspace();
return;
}
const refreshAuditButton = event.target.closest("[data-admin-refresh-audit]");
if (refreshAuditButton) {
if (!isPlatformAdminUser(getCurrentPlatformUser())) {
renderAdminWorkspace("Platform admin required.");
return;
}
await loadAdminAuditLog({ force: true });
return;
}
const refreshReadinessButton = event.target.closest("[data-pr-refresh]");
if (refreshReadinessButton) {
if (!isPlatformAdminUser(getCurrentPlatformUser())) {
renderAdminWorkspace("Platform admin required.");
return;
}
await loadPlatformReadinessReport({ force: true });
return;
}
const appearanceResetButton = event.target.closest("[data-platform-appearance-reset]");
if (appearanceResetButton) {
if (!isPlatformAdminUser(getCurrentPlatformUser())) {
renderAdminWorkspace("Platform admin required.");
return;
}
await publishPlatformAppearanceConfig(
createDefaultPlatformAppearanceConfig({
updatedAt: new Date().toISOString(),
updatedBy: getCurrentPlatformUser()?.id || "",
}),
"Defaults reset."
);
return;
}
const removeButton = event.target.closest("[data-admin-remove-user]");
const sendButton = event.target.closest("[data-admin-send-credentials]");
const sendSelectedButton = event.target.closest("[data-admin-send-selected]");
const resetPasswordButton = event.target.closest("[data-admin-reset-password]");
const generatePasswordButton = event.target.closest("[data-admin-generate-password]");
const generateSelectedPasswordButton = event.target.closest("[data-admin-generate-selected-password]");
if (!isCurrentPlatformUserAdmin()) {
return;
}
const currentAdminUser = getCurrentPlatformUser();
const adminActionStructure = syncPlatformStructureWithUsers(getPlatformUsers());
const canRunAdminUserAction = (adminUser, options = {}) => {
if (canAdminManageUser(currentAdminUser, adminUser, adminActionStructure, options)) {
return true;
}
renderAdminWorkspace("This user is outside your admin scope.");
return false;
};
if (generatePasswordButton) {
const userId = generatePasswordButton.dataset.adminGeneratePassword;
const adminUser = getPlatformUsers().find((user) => user.id === userId);
if (!adminUser) {
return;
}
if (!canRunAdminUserAction(adminUser)) {
return;
}
const result = await getPlatformAuthStore()?.updateUser?.(adminUser.id, { generatePassword: true });
if (!result?.ok) {
renderAdminWorkspace(result?.reason || "Could not generate a temporary password.");
return;
}
if (!result.generatedPassword) {
renderAdminWorkspace(`Password generated for ${adminUser.email}, but no password was returned.`);
return;
}
const copied = await maybeCopyToClipboard(
[
"Website: https://footballscience.xyz/",
`Username: ${adminUser.username}`,
`Email: ${adminUser.email}`,
`Temporary password: ${result.generatedPassword}`,
].join("\n")
);
renderAdminWorkspace(
`Temporary password for ${adminUser.email}: ${result.generatedPassword}. This replaces any previous password.${copied ? " Copied to clipboard." : ""}`
);
return;
}
if (generateSelectedPasswordButton) {
const userId = generateSelectedPasswordButton.dataset.adminGenerateSelectedPassword;
const adminUser = getPlatformUsers().find((user) => user.id === userId);
if (!adminUser) {
return;
}
if (!canRunAdminUserAction(adminUser)) {
return;
}
const result = await getPlatformAuthStore()?.updateUser?.(adminUser.id, { generatePassword: true });
if (!result?.ok) {
renderAdminWorkspace(result?.reason || "Could not generate a temporary password.");
return;
}
if (!result.generatedPassword) {
renderAdminWorkspace(`Password generated for ${adminUser.email}, but no password was returned.`);
return;
}
const copied = await maybeCopyToClipboard(
[
"Website: https://footballscience.xyz/",
`Username: ${adminUser.username}`,
`Email: ${adminUser.email}`,
`Temporary password: ${result.generatedPassword}`,
].join("\n")
);
renderAdminWorkspace(
`Temporary password for ${adminUser.email}: ${result.generatedPassword}. This replaces any previous password.${copied ? " Copied to clipboard." : ""}`
);
return;
}
if (resetPasswordButton) {
const userId = resetPasswordButton.dataset.adminResetPassword;
const adminUser = getPlatformUsers().find((user) => user.id === userId);
if (!adminUser) {
return;
}
if (!canRunAdminUserAction(adminUser)) {
return;
}
const result = await getPlatformAuthStore()?.sendPasswordReset?.(adminUser.id);
if (!result?.ok) {
renderAdminWorkspace(result?.reason || "Could not send reset email.");
return;
}
renderAdminWorkspace(`Password reset sent to ${adminUser.email}.`);
return;
}
if (sendButton) {
const userId = sendButton.dataset.adminSendCredentials;
const adminUser = getPlatformUsers().find((user) => user.id === userId);
if (!adminUser) {
return;
}
if (!canRunAdminUserAction(adminUser)) {
return;
}
if (!adminUser.email) {
renderAdminWorkspace("No email saved for this user.");
return;
}
const result = await getPlatformAuthStore()?.updateUser?.(adminUser.id, { generatePassword: true });
if (!result?.ok) {
renderAdminWorkspace(result?.reason || "Could not create a temporary password.");
return;
}
if (!result.generatedPassword) {
renderAdminWorkspace(`Temporary password was created for ${adminUser.email}, but no password was returned.`);
return;
}
const nextUser = result.user || adminUser;
const sendResult = await openCredentialsMailto(nextUser, result.generatedPassword);
renderAdminWorkspace(buildTemporaryLoginMessage(nextUser, result.generatedPassword, Boolean(sendResult?.copied)));
return;
}
if (sendSelectedButton) {
const userId = sendSelectedButton.dataset.adminSendSelected;
const adminUser = getPlatformUsers().find((user) => user.id === userId);
if (!adminUser) {
return;
}
if (!canRunAdminUserAction(adminUser)) {
return;
}
if (!adminUser.email) {
renderAdminWorkspace("No email saved for this user.");
return;
}
const result = await getPlatformAuthStore()?.updateUser?.(adminUser.id, { generatePassword: true });
if (!result?.ok) {
renderAdminWorkspace(result?.reason || "Could not create a temporary password.");
return;
}
if (!result.generatedPassword) {
renderAdminWorkspace(`Temporary password was created for ${adminUser.email}, but no password was returned.`);
return;
}
const nextUser = result.user || adminUser;
const sendResult = await openCredentialsMailto(nextUser, result.generatedPassword);
renderAdminWorkspace(buildTemporaryLoginMessage(nextUser, result.generatedPassword, Boolean(sendResult?.copied)));
return;
}
if (!removeButton) {
return;
}
const userId = removeButton.dataset.adminRemoveUser;
const adminUser = getPlatformUsers().find((user) => user.id === userId);
if (!adminUser) {
return;
}
if (!canRunAdminUserAction(adminUser, { remove: true })) {
return;
}
if (!win.confirm(`Remove ${formatUserName(adminUser)}?`)) {
return;
}
const result = await getPlatformAuthStore()?.removeUser?.(userId);
if (!result?.ok) {
renderAdminWorkspace(result?.reason ?? "User could not be removed.");
return;
}
selectedAdminUserId = null;
renderWorkspaceChrome();
renderAdminWorkspace("User removed.");
});
ui.adminWorkspace?.addEventListener("submit", async (event) => {
const clubForm = event.target.closest("#adminClubForm");
if (clubForm) {
event.preventDefault();
createAdminClubFromForm(clubForm);
return;
}
const teamForm = event.target.closest("#adminTeamForm");
if (teamForm) {
event.preventDefault();
createAdminTeamFromForm(teamForm);
return;
}
const createUserForm = event.target.closest("#adminCreateUserForm");
if (createUserForm) {
event.preventDefault();
await createAdminUserFromForm(createUserForm);
return;
}
const appearanceForm = event.target.closest("#platformAppearanceForm");
if (appearanceForm) {
event.preventDefault();
if (!isPlatformAdminUser(getCurrentPlatformUser())) {
renderAdminWorkspace("Platform admin required.");
return;
}
setFormSubmitButtonState(appearanceForm, {
isSubmitting: true,
submittingLabel: "Publishing...",
defaultLabel: "Publish",
});
try {
await publishPlatformAppearanceConfig(buildPlatformAppearanceConfigFromForm(appearanceForm));
} catch (error) {
renderAdminWorkspace(error?.message || "Could not publish.");
} finally {
setFormSubmitButtonState(appearanceForm, { isSubmitting: false, defaultLabel: "Publish" });
}
return;
}
const userForm = event.target.closest("#adminUserForm");
if (userForm) {
event.preventDefault();
if (!isCurrentPlatformUserAdmin()) {
renderAdminWorkspace("Admin access required. Sign in as an admin and try again.");
return;
}
const selectedUser = getPlatformUsers().find((user) => user.id === selectedAdminUserId);
if (!selectedUser) {
return;
}
const currentAdminUser = getCurrentPlatformUser();
const structure = syncPlatformStructureWithUsers(getPlatformUsers());
if (!canAdminManageUser(currentAdminUser, selectedUser, structure)) {
renderAdminWorkspace("This user is outside your admin scope.");
return;
}
const values = getPlatformFormValues(userForm);
const passwordError = getPasswordValidationMessage(values);
if (passwordError) {
renderAdminWorkspace(passwordError);
return;
}
if (hasUserFieldConflict(selectedUser.id, values)) {
renderAdminWorkspace("Username or email already exists.");
return;
}
const submissionValues = normalizeAdminUserSubmissionValues(
stripPasswordConfirmation(values),
currentAdminUser,
selectedUser,
structure
);
try {
const authStore = getPlatformAuthStore();
if (!authStore?.updateUser) {
renderAdminWorkspace("Supabase user update is not ready yet. Reload the page and try again.");
return;
}
setFormSubmitButtonState(userForm, { isSubmitting: true, submittingLabel: "Saving...", defaultLabel: "Save user" });
const result = await withUiTimeout(
authStore.updateUser(selectedUser.id, submissionValues),
26000,
"Saving took too long. Refresh the page and check if the change was saved."
);
if (!result?.ok) {
renderAdminWorkspace(result?.reason ?? "User could not be saved.");
return;
}
syncPlatformUserFromAuth();
renderWorkspaceChrome();
const generatedPassword = result.generatedPassword ? ` Temporary password: ${result.generatedPassword}.` : "";
const successMessage = submissionValues.password
? "User saved and password updated in Supabase. Only the latest saved or reset password works."
: "User saved.";
renderAdminWorkspace(`${successMessage}${generatedPassword}`);
} catch (error) {
renderAdminWorkspace(error?.message || "User could not be saved.");
} finally {
setFormSubmitButtonState(userForm, { isSubmitting: false, defaultLabel: "Save" });
}
return;
}
const transferRoomAccessForm = event.target.closest("#adminTransferRoomAccessForm");
if (transferRoomAccessForm) {
event.preventDefault();
if (!isPlatformAdminUser(getCurrentPlatformUser()) || !transferRoomRuntime.canManageAccess(getCurrentPlatformUser())) {
renderAdminWorkspace("Platform admin required.");
return;
}
const controls = Array.from(transferRoomAccessForm.querySelectorAll("[data-admin-transfer-room-access-user]"));
const editableIds = new Set(controls.map((control) => control.dataset.adminTransferRoomAccessUser).filter(Boolean));
const nextSelectedIds = new Set(
controls
.filter((control) => control.checked)
.map((control) => control.dataset.adminTransferRoomAccessUser)
.filter(Boolean)
);
const state = ensureTransferRoomState();
const teamId = getAdminTransferRoomAccessTeamId(state, getPlatformStructureState());
const currentSelectedIds = new Set(state.accessByTeam?.[teamId]?.userIds || []);
let hasChanges = false;
currentSelectedIds.forEach((userId) => {
if (editableIds.has(userId) && !nextSelectedIds.has(userId)) {
transferRoomRuntime.toggleAccessUser(userId, false);
hasChanges = true;
}
});
nextSelectedIds.forEach((userId) => {
if (!currentSelectedIds.has(userId)) {
transferRoomRuntime.toggleAccessUser(userId, true);
hasChanges = true;
}
});
renderWorkspaceChrome();
renderAdminWorkspace(hasChanges ? "Transfer Room access saved." : "Transfer Room access is already up to date.");
return;
}
const accessForm = event.target.closest("#adminAccessForm");
if (accessForm) {
event.preventDefault();
if (!isPlatformAdminUser(getCurrentPlatformUser())) {
renderAdminWorkspace("Platform admin required.");
return;
}
const roles = getPlatformRoles();
const controls = Array.from(accessForm.querySelectorAll("[data-admin-access-workspace][data-admin-access-role]"));
const nextAccess = { ...getWorkspaceAccessConfig() };
getAdminManagedWorkspaces().forEach((workspace) => {
if (workspace.requiresAdmin) {
nextAccess[workspace.id] = { view: ["admin"], edit: ["admin"] };
return;
}
const viewRoles = new Set(["admin"]);
const editRoles = new Set(["admin"]);
controls
.filter((control) => control.dataset.adminAccessWorkspace === workspace.id)
.forEach((control) => {
const role = control.dataset.adminAccessRole;
if (!roles.includes(role)) {
return;
}
if (control.value === "view" || control.value === "edit") {
viewRoles.add(role);
}
if (control.value === "edit") {
editRoles.add(role);
}
});
nextAccess[workspace.id] = {
view: Array.from(viewRoles),
edit: Array.from(editRoles).filter((role) => viewRoles.has(role)),
};
});
hubState.workspaceAccess = nextAccess;
hubState = repairWorkspaceState(hubState);
writeWorkspaceHubState();
renderWorkspaceChrome();
renderAdminWorkspace("Access saved.");
}
});
ui.medicalTeamWorkspace?.addEventListener("click", (event) => {
const closeModalButton = event.target.closest("[data-medical-close-modal]");
if (closeModalButton) {
closeMedicalPlayerModal();
return;
}
const modalTabButton = event.target.closest("[data-medical-modal-tab]");
if (modalTabButton) {
medicalPlayerModalTab = normalizeMedicalPlayerModalTab(modalTabButton.dataset.medicalModalTab);
renderMedicalTeamWorkspace();
return;
}
const recommendationPreset = event.target.closest("[data-medical-recommendation-preset]");
if (recommendationPreset) {
const form = recommendationPreset.closest("[data-medical-recommendation-form]");
const participationInput = form?.querySelector("#medicalRecommendationParticipation");
const statusInput = form?.querySelector("#medicalRecommendationStatus");
const rtpSelect = form?.querySelector("#medicalRecommendationRtpPhase");
const dateInput = form?.querySelector("[name='date']");
const preview = form?.querySelector("[data-medical-recommendation-preview]") ??
ui.medicalTeamWorkspace.querySelector("[data-medical-recommendation-preview]");
const participation = normalizeMedicalParticipation(recommendationPreset.dataset.medicalParticipation);
const status = getMedicalStatusOption(recommendationPreset.dataset.medicalStatus);
const activityContext = getMedicalRecommendationActivityContext(dateInput?.value || medicalState.selectedDate);
const phase = getMedicalRtpPhaseOption(getMedicalRtpPhaseForRecommendation(status.key, participation, activityContext.type));
const displayStatus = getMedicalStatusOptionForDate(status.key, dateInput?.value || medicalState.selectedDate, phase.key);
if (participationInput && statusInput) {
participationInput.value = String(participation);
statusInput.value = status.key;
if (rtpSelect) {
rtpSelect.value = phase.key;
}
form.querySelectorAll("[data-medical-recommendation-preset]").forEach((button) => {
button.classList.toggle("is-selected", button === recommendationPreset);
});
if (preview) {
preview.textContent = `${participation}% / ${displayStatus.label}`;
}
}
return;
}
const actualPreset = event.target.closest("[data-medical-actual-value]");
if (actualPreset) {
const form = actualPreset.closest("[data-medical-recommendation-form]");
const actualInput = form?.querySelector("#medicalActualParticipation");
if (actualInput) {
actualInput.value = actualPreset.dataset.medicalActualValue;
form.querySelectorAll("[data-medical-actual-value]").forEach((button) => {
button.classList.toggle("is-selected", button === actualPreset);
});
}
return;
}
const durationPreset = event.target.closest("[data-medical-duration-preset]");
if (durationPreset) {
const form = durationPreset.closest("#medicalInjuryPlanForm");
const durationInput = form?.querySelector("[name='duration']");
const durationUnitInput = form?.querySelector("[name='durationUnit']");
if (durationInput && durationUnitInput) {
durationInput.value = durationPreset.dataset.medicalDuration;
durationUnitInput.value = durationPreset.dataset.medicalDurationUnit;
form.querySelectorAll("[data-medical-duration-preset]").forEach((button) => {
button.classList.toggle("is-selected", button === durationPreset);
});
persistMedicalInjuryPlanDraftFromForm(form);
}
return;
}
const copyHandoverButton = event.target.closest("[data-medical-copy-handover]");
if (copyHandoverButton) {
copyMedicalCoachHandoverToClipboard();
return;
}
const quickRecommendationButton = event.target.closest("[data-medical-quick-recommend]");
if (quickRecommendationButton) {
event.preventDefault();
event.stopPropagation();
if (!canEditMedicalTeam()) {
return;
}
const result = applyMedicalQuickRecommendation(
quickRecommendationButton.dataset.medicalQuickRecommend,
quickRecommendationButton.dataset.medicalQuickParticipation
);
if (result.record) {
void recordMedicalDatabaseSyncEvent("recommendation-saved", {
playerId: result.record.playerId,
record: result.record,
idempotencyKey: `recommendation-saved:${result.record.id}`,
});
}
const playerName = result.player?.name || "Player";
renderMedicalTeamWorkspace(result.record ? `${playerName}: ${result.record.participation}% recommendation saved.` : result.blockReason || "Recommendation could not be saved.");
return;
}
const bulkToggleButton = event.target.closest("[data-medical-bulk-toggle]");
if (bulkToggleButton && canEditMedicalTeam()) {
event.preventDefault();
event.stopPropagation();
toggleMedicalBulkPlayer(bulkToggleButton.dataset.medicalBulkToggle);
return;
}
const bulkMenuToggleButton = event.target.closest("[data-medical-bulk-menu-toggle]");
if (bulkMenuToggleButton && canEditMedicalTeam()) {
medicalBulkRecommendationOpen = !medicalBulkRecommendationOpen;
renderMedicalTeamWorkspace();
return;
}
const bulkSelectVisibleButton = event.target.closest("[data-medical-bulk-select-visible]");
if (bulkSelectVisibleButton && canEditMedicalTeam()) {
setMedicalBulkSelection(getFilteredMedicalPlayers().map((player) => player.id));
return;
}
const bulkSelectNotSetButton = event.target.closest("[data-medical-bulk-select-not-set]");
if (bulkSelectNotSetButton && canEditMedicalTeam()) {
const form = bulkSelectNotSetButton.closest("#medicalBulkRecommendationForm");
const dateValue = form?.querySelector("[data-medical-bulk-date]")?.value;
setMedicalBulkNotSetSelection(dateValue, getFilteredMedicalPlayers());
return;
}
const bulkClearButton = event.target.closest("[data-medical-bulk-clear]");
if (bulkClearButton && canEditMedicalTeam()) {
setMedicalBulkSelection([]);
return;
}
const operationsTabButton = event.target.closest("[data-medical-ops-tab]");
if (operationsTabButton) {
medicalOperationsTab = normalizeMedicalOperationsTab(operationsTabButton.dataset.medicalOpsTab);
renderMedicalTeamWorkspace();
return;
}
const selectPlayerCard = event.target.closest("[data-medical-select-player]");
if (selectPlayerCard) {
openMedicalPlayerModal(selectPlayerCard.dataset.medicalSelectPlayer);
return;
}
const shiftDateButton = event.target.closest("[data-medical-shift-date]");
if (shiftDateButton) {
shiftMedicalSelectedDate(Number(shiftDateButton.dataset.medicalShiftDate) || 0);
return;
}
const todayButton = event.target.closest("[data-medical-today]");
if (todayButton) {
setMedicalSelectedDate(formatScheduleDateValue(new Date()));
return;
}
const setDateButton = event.target.closest("[data-medical-set-date]");
if (setDateButton) {
setMedicalSelectedDate(setDateButton.dataset.medicalSetDate);
return;
}
const deleteRecordButton = event.target.closest("[data-medical-delete-record]");
if (deleteRecordButton && canEditMedicalTeam()) {
if (win.confirm("Archive this medical log entry? It will remain in protected clinical history.")) {
const recordId = deleteRecordButton.dataset.medicalDeleteRecord;
const record = medicalState.records.find((entry) => entry.id === recordId) ?? null;
const archivedRecord = removeMedicalRecord(recordId);
void recordMedicalDatabaseSyncEvent("record-archived", {
playerId: record?.playerId || "",
recordId,
record: archivedRecord || record,
idempotencyKey: `record-archived:${recordId}:${archivedRecord?.archivedAt || Date.now()}`,
});
renderMedicalTeamWorkspace("Log entry archived in protected clinical history.");
}
return;
}
const deleteInjuryPlanButton = event.target.closest("[data-medical-delete-injury-plan]");
if (deleteInjuryPlanButton && canEditMedicalTeam()) {
if (win.confirm("Archive this availability plan? It will remain in protected clinical history.")) {
const planId = deleteInjuryPlanButton.dataset.medicalDeleteInjuryPlan;
const plan = medicalState.injuryPlans.find((entry) => entry.id === planId) ?? null;
const archivedPlan = removeMedicalInjuryPlan(planId);
void recordMedicalDatabaseSyncEvent("availability-plan-archived", {
playerId: plan?.playerId || "",
planId,
plan: archivedPlan || plan,
idempotencyKey: `availability-plan-archived:${planId}:${archivedPlan?.archivedAt || Date.now()}`,
});
renderMedicalTeamWorkspace("Availability plan archived in protected clinical history.");
}
return;
}
const editInjuryPlanButton = event.target.closest("[data-medical-edit-injury-plan]");
if (editInjuryPlanButton && canEditMedicalTeam()) {
const planId = editInjuryPlanButton.dataset.medicalEditInjuryPlan;
const plan = medicalState.injuryPlans.find((entry) => entry.id === planId && !isMedicalItemArchived(entry));
if (plan) {
event.preventDefault();
event.stopPropagation();
setMedicalInjuryPlanDraftFromPlan(plan);
medicalState.selectedPlayerId = plan.playerId;
medicalPlayerModalOpen = true;
medicalPlayerModalTab = "plan";
renderMedicalTeamWorkspace("Availability plan ready to edit.");
}
return;
}
const cancelInjuryPlanEditButton = event.target.closest("[data-medical-cancel-injury-plan-edit]");
if (cancelInjuryPlanEditButton && canEditMedicalTeam()) {
const form = cancelInjuryPlanEditButton.closest("#medicalInjuryPlanForm");
const playerId = form?.querySelector("[name='playerId']")?.value || medicalState.selectedPlayerId;
clearMedicalInjuryPlanDraft(playerId);
renderMedicalTeamWorkspace("Plan edit cancelled.");
return;
}
const removePlayerButton = event.target.closest("[data-medical-remove-player]");
if (removePlayerButton && canEditMedicalTeam()) {
const player = medicalState.players.find((candidate) => candidate.id === removePlayerButton.dataset.medicalRemovePlayer);
if (player && win.confirm(`Archive ${player.name} from Medical Room? Medical history will remain protected.`)) {
const archivedPlayer = removeMedicalPlayer(player.id);
void recordMedicalDatabaseSyncEvent("player-archived", {
playerId: player.id,
player: archivedPlayer || player,
idempotencyKey: `player-archived:${player.id}:${archivedPlayer?.archivedAt || Date.now()}`,
});
medicalPlayerModalOpen = false;
renderMedicalTeamWorkspace("Player archived with protected medical history.");
}
}
});
ui.medicalTeamWorkspace?.addEventListener("keydown", (event) => {
if (event.key !== "Enter" && event.key !== " ") {
return;
}
if (event.target.closest("button, input, select, textarea, label")) {
return;
}
const selectPlayerCard = event.target.closest("[data-medical-select-player]");
if (!selectPlayerCard) {
return;
}
event.preventDefault();
openMedicalPlayerModal(selectPlayerCard.dataset.medicalSelectPlayer);
});
ui.medicalTeamWorkspace?.addEventListener("input", (event) => {
const injuryPlanForm = event.target.closest("#medicalInjuryPlanForm");
if (injuryPlanForm) {
persistMedicalInjuryPlanDraftFromForm(injuryPlanForm);
return;
}
const searchInput = event.target.closest("[data-medical-roster-search]");
if (!searchInput) {
return;
}
const selectionStart = searchInput.selectionStart ?? searchInput.value.length;
const selectionEnd = searchInput.selectionEnd ?? selectionStart;
medicalRosterSearchQuery = searchInput.value;
renderMedicalTeamWorkspace("", {
focusRosterSearch: true,
searchSelectionStart: selectionStart,
searchSelectionEnd: selectionEnd,
});
});
ui.medicalTeamWorkspace?.addEventListener("change", (event) => {
const datePicker = event.target.closest("[data-medical-date-picker]");
if (datePicker) {
setMedicalSelectedDate(datePicker.value);
return;
}
const statusFilter = event.target.closest("[data-medical-status-filter]");
if (statusFilter) {
medicalStatusFilter = statusFilter.value;
renderMedicalTeamWorkspace();
return;
}
const bulkDate = event.target.closest("[data-medical-bulk-date]");
if (bulkDate) {
updateMedicalBulkActivityControls(bulkDate.closest("#medicalBulkRecommendationForm"));
return;
}
const recommendationStatus = event.target.closest("#medicalRecommendationStatus");
if (recommendationStatus) {
const form = recommendationStatus.closest("[data-medical-recommendation-form]");
const participationSelect = form?.querySelector("#medicalRecommendationParticipation") ??
ui.medicalTeamWorkspace.querySelector("#medicalRecommendationParticipation");
const preview = form?.querySelector("[data-medical-recommendation-preview]") ??
ui.medicalTeamWorkspace.querySelector("[data-medical-recommendation-preview]");
const dateInput = form?.querySelector("[name='date']");
const status = getMedicalStatusOption(recommendationStatus.value);
if (participationSelect && status.defaultParticipation !== null) {
participationSelect.value = String(status.defaultParticipation);
}
if (preview) {
const participation = normalizeMedicalParticipation(participationSelect?.value, status.defaultParticipation ?? 100);
preview.textContent = `${participation}% / ${getMedicalStatusOptionForDate(status.key, dateInput?.value || medicalState.selectedDate).label}`;
}
}
const recommendationRtpPhase = event.target.closest("#medicalRecommendationRtpPhase");
if (recommendationRtpPhase) {
const form = recommendationRtpPhase.closest("[data-medical-recommendation-form]");
const participationInput = form?.querySelector("#medicalRecommendationParticipation");
const statusInput = form?.querySelector("#medicalRecommendationStatus");
const dateInput = form?.querySelector("[name='date']");
const preview = form?.querySelector("[data-medical-recommendation-preview]") ??
ui.medicalTeamWorkspace.querySelector("[data-medical-recommendation-preview]");
const phase = getMedicalRtpPhaseOption(recommendationRtpPhase.value);
if (participationInput && statusInput) {
participationInput.value = String(phase.participation);
statusInput.value = phase.status;
form.querySelectorAll("[data-medical-recommendation-preset]").forEach((button) => {
button.classList.toggle(
"is-selected",
normalizeMedicalParticipation(button.dataset.medicalParticipation) === phase.participation
);
});
if (preview) {
preview.textContent = `${phase.participation}% / ${getMedicalStatusOptionForDate(phase.status, dateInput?.value || medicalState.selectedDate, phase.key).label}`;
}
}
return;
}
const bulkParticipation = event.target.closest("[data-medical-bulk-participation]");
if (bulkParticipation) {
const form = bulkParticipation.closest("#medicalBulkRecommendationForm");
const phaseSelect = form?.querySelector("[data-medical-bulk-rtp-phase]");
const phasePreview = form?.querySelector("[data-medical-bulk-rtp-preview]");
const dateValue = form?.querySelector("[data-medical-bulk-date]")?.value || medicalState.selectedDate;
const activityContext = getMedicalRecommendationActivityContext(dateValue);
const participation = normalizeMedicalParticipation(bulkParticipation.value, 75);
const phaseKey = getMedicalRtpPhaseForRecommendation(getMedicalStatusForParticipation(participation), participation, activityContext.type);
if (phaseSelect) {
phaseSelect.value = phaseKey;
}
if (phasePreview) {
if ("value" in phasePreview) {
phasePreview.value = getMedicalRtpPhaseOption(phaseKey).label;
} else {
phasePreview.textContent = getMedicalRtpPhaseOption(phaseKey).label;
}
}
return;
}
const bulkRtpPhase = event.target.closest("[data-medical-bulk-rtp-phase]");
if (bulkRtpPhase) {
const form = bulkRtpPhase.closest("#medicalBulkRecommendationForm");
const participationSelect = form?.querySelector("[data-medical-bulk-participation]");
const phase = getMedicalRtpPhaseOption(bulkRtpPhase.value);
if (participationSelect) {
participationSelect.value = String(phase.participation);
}
return;
}
const planRtpPhase = event.target.closest("[data-medical-plan-rtp-phase]");
if (planRtpPhase) {
const form = planRtpPhase.closest("#medicalInjuryPlanForm");
const statusSelect = form?.querySelector("[name='status']");
const participationSelect = form?.querySelector("[data-medical-plan-participation]");
const phase = getMedicalRtpPhaseOption(planRtpPhase.value);
if (statusSelect) {
statusSelect.value = phase.status;
}
if (participationSelect) {
participationSelect.value = String(phase.participation);
}
}
const injuryPlanForm = event.target.closest("#medicalInjuryPlanForm");
if (injuryPlanForm) {
persistMedicalInjuryPlanDraftFromForm(injuryPlanForm);
return;
}
});
ui.medicalTeamWorkspace?.addEventListener("submit", (event) => {
const governanceForm = event.target.closest("#medicalGovernanceForm");
if (governanceForm) {
event.preventDefault();
const saved = updateMedicalGovernancePolicy(getPlatformFormValues(governanceForm));
if (saved) {
void recordMedicalDatabaseSyncEvent("governance-saved", {
policy: medicalState.policy,
idempotencyKey: `governance-saved:${medicalState.policy?.updatedAt || Date.now()}`,
});
}
renderMedicalTeamWorkspace(saved ? "Medical governance policy saved." : "Medical governance policy could not be saved.");
return;
}
const rosterImportForm = event.target.closest("#medicalRosterImportForm");
if (rosterImportForm) {
event.preventDefault();
if (!canEditMedicalTeam()) {
return;
}
const values = getPlatformFormValues(rosterImportForm);
const importResult = parseMedicalRosterText(values.rosterText);
const players = importResult.players;
const skippedCount = importResult.skippedLines.length;
if (!players.length) {
const skippedMessage = skippedCount ? ` ${skippedCount} line(s) could not be parsed.` : "";
renderMedicalTeamWorkspace(`No players found in the roster paste.${skippedMessage}`);
return;
}
upsertMedicalPlayers(players);
void recordMedicalDatabaseSyncEvent("players-imported", {
players,
importedCount: players.length,
idempotencyKey: `players-imported:${Date.now()}`,
});
rosterImportForm.reset();
const skippedMessage = skippedCount
? ` ${skippedCount} line${skippedCount === 1 ? "" : "s"} could not be parsed and were skipped.`
: "";
renderMedicalTeamWorkspace(`${players.length} player${players.length === 1 ? "" : "s"} imported.${skippedMessage}`);
return;
}
const bulkRecommendationForm = event.target.closest("#medicalBulkRecommendationForm");
if (bulkRecommendationForm) {
event.preventDefault();
if (!canEditMedicalTeam()) {
return;
}
const selectedCount = getMedicalBulkSelectedPlayers().length;
if (!selectedCount) {
renderMedicalTeamWorkspace("Select players before applying a bulk recommendation.");
return;
}
const result = applyMedicalBulkRecommendation(getPlatformFormValues(bulkRecommendationForm));
if (result.savedCount) {
void recordMedicalDatabaseSyncEvent("bulk-recommendation-saved", {
records: result.records,
recordIds: result.records.map((record) => record.id),
date: result.records[0]?.date || medicalState.selectedDate,
idempotencyKey: `bulk-recommendation-saved:${result.records.map((record) => record.id).join("|")}`,
});
}
const skippedText = result.blockReason
? ` ${result.blockReason}`
: result.blockedCount
? ` ${result.blockedCount} skipped for clearance: ${result.blockedNames.slice(0, 3).join(", ")}${result.blockedNames.length > 3 ? "..." : ""}.`
: "";
const bulkMessage = result.savedCount
? `${result.savedCount} bulk recommendation${result.savedCount === 1 ? "" : "s"} saved.${skippedText}`
: result.blockReason || "No bulk recommendations saved.";
renderMedicalTeamWorkspace(bulkMessage);
return;
}
const newPlayerForm = event.target.closest("#medicalNewPlayerForm");
if (newPlayerForm) {
event.preventDefault();
if (!canEditMedicalTeam()) {
return;
}
const player = normalizeMedicalPlayer(getPlatformFormValues(newPlayerForm));
if (!player) {
renderMedicalTeamWorkspace("Player name is required.");
return;
}
upsertMedicalPlayers([player]);
void recordMedicalDatabaseSyncEvent("player-added", {
playerId: player.id,
player,
idempotencyKey: `player-added:${player.id}`,
});
newPlayerForm.reset();
renderMedicalTeamWorkspace("Player added.");
return;
}
const injuryPlanForm = event.target.closest("#medicalInjuryPlanForm");
if (injuryPlanForm) {
event.preventDefault();
if (!canEditMedicalTeam()) {
return;
}
const draft = getMedicalInjuryPlanFormDraft(injuryPlanForm);
const plan = draft?.planId ? updateMedicalInjuryPlan(draft) : addMedicalInjuryPlan(draft);
if (plan) {
clearMedicalInjuryPlanDraft(plan.playerId);
const eventType = draft?.planId ? "availability-plan-updated" : "availability-plan-created";
void recordMedicalDatabaseSyncEvent(eventType, {
playerId: plan.playerId,
planId: plan.id,
plan,
idempotencyKey: `${eventType}:${plan.id}:${plan.updatedAt || Date.now()}`,
});
}
renderMedicalTeamWorkspace(plan ? `Availability plan ${draft?.planId ? "updated" : "created"}.` : "Availability plan could not be saved.");
return;
}
const recommendationForm = event.target.closest("[data-medical-recommendation-form]");
if (recommendationForm) {
event.preventDefault();
if (!canEditMedicalTeam()) {
return;
}
const values = getPlatformFormValues(recommendationForm);
const participation = normalizeMedicalParticipation(values.participation);
const blockReason = getMedicalRecommendationBlockReason(values.playerId, participation, values.date);
if (blockReason) {
renderMedicalTeamWorkspace(blockReason);
return;
}
const record = addMedicalRecord(values);
if (record) {
void recordMedicalDatabaseSyncEvent("recommendation-saved", {
playerId: record.playerId,
record,
idempotencyKey: `recommendation-saved:${record.id}`,
});
}
medicalPlayerModalOpen = false;
renderMedicalTeamWorkspace(record ? "Status saved." : "Status could not be saved.");
return;
}
const clearanceForm = event.target.closest("#medicalClearanceForm");
if (clearanceForm) {
event.preventDefault();
if (!canEditMedicalTeam()) {
return;
}
const saved = updateMedicalPlanClearance(getPlatformFormValues(clearanceForm));
if (saved) {
void recordMedicalDatabaseSyncEvent("clearance-saved", {
playerId: saved.playerId,
plan: saved,
idempotencyKey: `clearance-saved:${saved.id}:${saved.updatedAt || Date.now()}`,
});
}
renderMedicalTeamWorkspace(saved ? "Clearance checklist saved." : "Clearance checklist could not be saved.");
return;
}
const playerProfileForm = event.target.closest("#medicalPlayerProfileForm");
if (playerProfileForm) {
event.preventDefault();
if (!canEditMedicalTeam()) {
return;
}
const profileValues = getPlatformFormValues(playerProfileForm);
const saved = updateMedicalPlayerProfile(profileValues);
if (saved) {
const player = getMedicalDatabasePlayer(profileValues.playerId);
void recordMedicalDatabaseSyncEvent("player-profile-saved", {
playerId: profileValues.playerId,
player,
idempotencyKey: `player-profile-saved:${profileValues.playerId}:${player?.updatedAt || Date.now()}`,
});
}
renderMedicalTeamWorkspace(saved ? "Player profile saved." : "Player profile could not be saved.");
}
});
ui.playerProfilesWorkspace?.addEventListener("click", (event) => {
if (event.target.matches("[data-player-profile-modal-overlay]") || event.target.closest("[data-player-profile-modal-close]")) {
closePlayerProfileModal();
return;
}
if (
event.target.matches("[data-player-profile-new-modal-overlay]") ||
event.target.closest("[data-player-profile-new-modal-close]")
) {
closePlayerProfileNewPlayerModal();
return;
}
if (event.target.closest("[data-player-profile-new-open]")) {
openPlayerProfileNewPlayerModal();
return;
}
const tabButton = event.target.closest("[data-player-profile-tab]");
if (tabButton) {
flushPlayerProfileAutosave(); playerProfileActiveTab = normalizePlayerProfileTab(tabButton.dataset.playerProfileTab);
renderPlayerProfilesWorkspace(); playerProfileAutosaveLastSignature = getPlayerProfileFormSignature(ui.playerProfilesWorkspace?.querySelector("#playerProfileEditForm"));
return;
}
if (event.target.closest("[data-squad-data-export]")) {
exportSquadDataFoundationJson();
return;
}
if (event.target.closest("[data-squad-session-export]")) {
exportSquadSessionPlannerCsv();
return;
}
if (event.target.closest("[data-squad-data-import-open]")) {
if (!canEditPlayerProfiles()) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Your role cannot import player profile changes."],
});
return;
}
ui.playerProfilesWorkspace.querySelector("[data-squad-data-import-file]")?.click();
return;
}
const applyImportButton = event.target.closest("[data-player-profile-import-apply]");
if (applyImportButton) {
if (!canEditPlayerProfiles()) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Your role cannot apply player profile imports."],
});
return;
}
const pendingImport = pendingPlayerProfileImportPlan;
pendingPlayerProfileImportPlan = null;
if (!pendingImport || !pendingImport.canApply) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["No pending import was available to apply."],
});
return;
}
const result = importSquadDataFoundationPayload({}, { apply: true, plan: pendingImport });
renderPlayerProfilesWorkspace(buildPlayerProfileImportFeedback(result));
return;
}
const undoImportButton = event.target.closest("[data-player-profile-import-undo]");
if (undoImportButton) {
renderPlayerProfilesWorkspace(applyPlayerProfileImportUndo());
return;
}
const undoHistoryButton = event.target.closest("[data-player-profile-import-undo-history]");
if (undoHistoryButton) {
const requestedIndex = Number(undoHistoryButton.dataset?.playerProfileImportUndoHistory);
if (!Number.isFinite(requestedIndex) || requestedIndex !== 0) {
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Only the latest import snapshot can be undone from this view."],
});
return;
}
renderPlayerProfilesWorkspace(applyPlayerProfileImportUndo());
return;
}
const cancelImportButton = event.target.closest("[data-player-profile-import-cancel]");
if (cancelImportButton) {
const pendingImport = pendingPlayerProfileImportPlan;
pendingPlayerProfileImportPlan = null;
renderPlayerProfilesWorkspace({
status: "warning",
lines: ["Import preview cancelled before applying changes."],
items: pendingImport?.rows
? pendingImport.rows.slice(0, 8).map(
(entry) => `Row ${entry.row}: ${String(entry.action || "skip").toUpperCase()} ${entry.playerName || "Unknown"} (${entry.message || "skipped"})`
)
: [],
});
return;
}
const temporaryToggle = event.target.closest("[data-squad-temporary-toggle]");
if (temporaryToggle) {
event.preventDefault();
event.stopPropagation();
playerProfilesTemporarySectionCollapsed = !playerProfilesTemporarySectionCollapsed;
renderPlayerProfilesRosterListOnly();
return;
}
const selectButton = event.target.closest("[data-player-profile-select]");
if (selectButton) {
openPlayerProfileModal(selectButton.dataset.playerProfileSelect);
return;
}
const removeButton = event.target.closest("[data-player-profile-remove]");
if (!removeButton) return;
if (!isCurrentPlatformUserAdmin()) { renderPlayerProfilesWorkspace({ status: "warning", lines: ["Only team admins can remove players from Squad Room."] }); return; }
ensurePlayerProfilesState();
const player = playerProfilesState.players.find((candidate) => candidate.id === removeButton.dataset.playerProfileRemove);
if (player && win.confirm(`Remove ${player.name} from Player Profiles?`)) {
const removed = removePlayerProfile(player.id);
playerProfileModalOpen = false;
playerProfileNewPlayerModalOpen = false;
renderPlayerProfilesWorkspace(removed ? "Player removed." : { status: "warning", lines: ["Only team admins can remove players from Squad Room."] });
}
});
ui.playerProfilesWorkspace?.addEventListener("input", (event) => {
const playerPhotoInput = event.target.closest("[data-player-profile-photo-upload]");
if (playerPhotoInput) {
handlePhotoInput(playerPhotoInput);
return;
}
const searchInput = event.target.closest("[data-player-profile-search]");
if (searchInput) {
playerProfilesSearchQuery = searchInput.value;
renderPlayerProfilesRosterListOnly();
return;
}
const editForm = event.target.closest("#playerProfileEditForm");
if (editForm) {
const label = event.target.type === "range" ? event.target.closest("label")?.querySelector("strong") : null;
if (label) label.textContent = `${event.target.value}/5`;
if (event.target.matches('textarea[name="coachNotes"], input[name="temporaryGroup"], input[name="temporaryFrom"], input[name="temporaryTo"]')) {
savePlayerProfileEditForm(editForm);
} else {
queuePlayerProfileAutosave(editForm);
}
}
});
ui.playerProfilesWorkspace?.addEventListener("change", (event) => {
const teamLogoInput = event.target.closest("[data-squad-team-logo-upload]");
if (teamLogoInput) {
const file = teamLogoInput.files?.[0] ?? null;
teamLogoInput.value = "";
void uploadSquadTeamLogo(file);
return;
}
const playerPhotoInput = event.target.closest("[data-player-profile-photo-upload]");
if (playerPhotoInput) {
handlePhotoInput(playerPhotoInput);
return;
}
const editForm = event.target.closest("#playerProfileEditForm");
if (editForm) {
if (event.target.matches('select[name="rosterType"]')) {
const result = savePlayerProfileEditForm(editForm);
if (result?.ok) {
renderPlayerProfilesWorkspace();
}
return;
}
queuePlayerProfileAutosave(editForm, 0);
return;
}
const importInput = event.target.closest("[data-squad-data-import-file]");
if (importInput) {
const file = importInput.files?.[0] ?? null;
importInput.value = "";
importSquadDataFoundationFile(file);
return;
}
});
ui.playerProfilesWorkspace?.addEventListener("keydown", (event) => {
if (event.key !== "Enter" && event.key !== " ") {
return;
}
const selectRow = event.target.closest("[data-player-profile-select]");
if (!selectRow) {
return;
}
event.preventDefault();
selectRow.click();
});
ui.playerProfilesWorkspace?.addEventListener("change", (event) => {
const roleGroupFilter = event.target.closest("[data-player-profile-role-group-filter]");
if (roleGroupFilter) {
playerProfilesRoleGroupFilter = roleGroupFilter.value;
renderPlayerProfilesWorkspace();
return;
}
const rosterFilter = event.target.closest("[data-player-profile-roster-filter]");
if (rosterFilter) {
playerProfilesRosterFilter = rosterFilter.value;
renderPlayerProfilesWorkspace();
}
});
ui.playerProfilesWorkspace?.addEventListener("submit", (event) => {
const newPlayerForm = event.target.closest("#playerProfileNewPlayerForm");
if (newPlayerForm) {
event.preventDefault();
if (!canEditPlayerProfiles()) {
return;
}
const result = addPlayerProfile(getPlatformFormValues(newPlayerForm));
const player = result?.player ?? null;
if (result?.ok) {
playerProfileNewPlayerModalOpen = false;
}
renderPlayerProfilesWorkspace(
buildPlayerProfileOperationFeedback(
result,
player
? `${isTemporaryPlayerProfile(player) ? "Temporary player added. Planner placement is ready without Medical clearance." : "Player added. Medical roster slot and planner placement are ready for clearance."}`
: "Could not add player profile."
)
);
if (result?.ok) {
newPlayerForm.reset();
}
return;
}
const editForm = event.target.closest("#playerProfileEditForm");
if (!editForm) {
return;
}
event.preventDefault();
if (!canEditPlayerProfiles()) {
return;
}
const result = savePlayerProfileEditForm(editForm);
if (result && !result.ok) renderPlayerProfilesWorkspace(buildPlayerProfileOperationFeedback(result, "Player profile could not be saved."));
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
if (centralStateWriteTimer) {
win.clearTimeout(centralStateWriteTimer);
centralStateWriteTimer = null;
flushCentralStateWrites();
}
if (dataSafetySnapshotTimer) {
win.clearTimeout(dataSafetySnapshotTimer);
dataSafetySnapshotTimer = null;
saveDataSafetySnapshot("pagehide");
}
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
