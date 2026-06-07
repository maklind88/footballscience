import { attackStylePresets, autoBallProfiles, autoDribbleProfiles, ballRadiusMeters, competitionPhysicalProfiles, defaultFormations, defaultKickoffTeamId, defaultPhysicalProfileKey, defaultScenarioInfo, defaultTeamIdentities, defenseStylePresets, defensiveAggressionPresets, defensiveAutopilotProfiles, defensivePhaseProfiles, firstTouchModes, formationLayouts, formationMagnetLabels, gameRoleProfiles, getAttackStyleRhythmProfile, intelligenceLabelBoosts, intelligenceRoleArchetypes, matchPhaseModel, offensiveAutopilotProfiles, offensivePhaseProfiles, pitch, pitchSurfacePresets, playerRadiusMeters, playerTendencyTemplates, possessionRhythmByAttackStyle, possessionRhythmDefaults, resolvePreferredFoot, resolveWeakFootQuality, setPiecePhaseProfiles, sprintRoleArchetypes, squadBlueprints, teamRosterOrder, teams, weatherPresets } from "./src/modules/game-simulator/model-data.mjs";
import { createGameSimulatorSidebarRenderer } from "./src/modules/game-simulator/sidebar-renderer.mjs";
import { createGameSimulatorPointerController } from "./src/modules/game-simulator/pointer-controller.mjs";
import { createGameSimulatorAutopilotTargets } from "./src/modules/game-simulator/autopilot-targets.mjs";
import { createGameSimulatorAutopilotCandidates } from "./src/modules/game-simulator/autopilot-candidates.mjs";
import { createGameSimulatorAutopilotDecisionEngine } from "./src/modules/game-simulator/autopilot-decision-engine.mjs";
import { createGameSimulatorAutopilotOffballTargets } from "./src/modules/game-simulator/autopilot-offball-targets.mjs";
import { createGameSimulatorAutopilotDefensiveTargets } from "./src/modules/game-simulator/autopilot-defensive-targets.mjs";
import { createGameSimulatorActionSpaceMetrics } from "./src/modules/game-simulator/action-space-metrics.mjs";
import { createGameSimulatorBallResolutionEngine } from "./src/modules/game-simulator/ball-resolution-engine.mjs";
import { createGameSimulatorAutopilotLiveEngine } from "./src/modules/game-simulator/autopilot-live-engine.mjs";
import { createGameSimulatorCommandEngine } from "./src/modules/game-simulator/command-engine.mjs";
import { createGameSimulatorCanvasRenderer } from "./src/modules/game-simulator/canvas-renderer.mjs";
import { createGameSimulatorSetupEngine } from "./src/modules/game-simulator/setup-engine.mjs";
import { createGameSimulatorSequenceEngine } from "./src/modules/game-simulator/sequence-engine.mjs";
import { createDashboardChatMessageTextRenderer, createDashboardChatWidgetRenderer, renderDashboardChatMessageStatus } from "./src/modules/chat/chat-widget-renderer.mjs";
import { createDashboardChatAttachmentRenderer } from "./src/modules/chat/chat-attachment-renderer.mjs";
import { createDashboardChatAttachmentPreview } from "./src/modules/chat/chat-attachment-preview.mjs";
import { createDashboardChatApiUiActions } from "./src/modules/chat/chat-api-ui-actions.mjs";
import { createDashboardChatThreadSettingsStore } from "./src/modules/chat/chat-thread-settings.mjs";
import { uploadDashboardChatAttachmentFile as uploadDashboardChatAttachmentFileWithClient } from "./src/modules/chat/chat-attachment-storage.mjs";
import { createDashboardHomeContextSelectors } from "./src/modules/home/dashboard-context-selectors.mjs";
import { createDashboardHomeCardsRenderer } from "./src/modules/home/dashboard-renderer.mjs";
import { createDashboardTaskListRenderer } from "./src/modules/home/task-list-renderer.mjs";
import { createScheduleWorkspaceController } from "./src/modules/schedule/schedule-controller.mjs";
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
import {
  createExerciseLibraryActions,
  createExerciseLibraryRenderer,
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
import { createSessionPlannerAutosaveBoundary, createSessionPlannerBlockHelpers, createSessionPlannerTacticalController, createSessionPlannerMedicalAvailabilitySelectors, createSessionPlannerPlayerBoardFormationHelpers, createSessionPlannerPlayerBoardHelpers, createSessionPlannerPlayerBoardRenderer, createSessionPlannerPrintRenderer, createSessionPlannerRenderer, createSessionPlannerSelectionAssistant, createSessionPlannerSessionFactory, createSessionPlannerTacticalHelpers, createSessionPlannerVisualRenderer, createSessionPlannerVisualUploadHelpers, createSessionPlannerWorkspaceRenderer, formatSessionPlannerHistoryTime as formatSessionPlannerHistoryTimeFromModule, getSessionPlannerHistoryActionLabel as getSessionPlannerHistoryActionLabelFromModule, getSessionPlannerHistoryActorLabel as getSessionPlannerHistoryActorLabelFromModule, sessionPlannerPlayerBoardAutoModeOptions, sessionPlannerPlayerBoardColorOptions, sessionPlannerPlayerBoardMaxTeamCount, sessionPlannerPrintPaperOptions, sessionPlannerPrintSectionOptions, sessionPlannerStorageKey, sessionPlannerTacticalMaxFrames, sessionPlannerTacticalPitchDimensions, sessionPlannerTacticalPitchModeKeys, sessionPlannerTacticalPitchModeOptions, sessionPlannerTacticalSnapStep } from "./src/modules/session-planner/index.mjs";
import { createPlatformModuleLoader } from "./src/core/platform-module-loader.mjs";
import { createPlatformAutosaveStatusController } from "./src/core/platform-autosave-status.mjs";
import { createPasswordRevealInputRenderer } from "./src/core/form-renderers.mjs";
import { installPlatformOverlayStability } from "./src/core/overlay-stability.mjs";
import { defaultHubState, placeholderWorkspaceContent, platformSidebarMoreOrder, platformSidebarPrimaryOrder, topIconMenuOrder } from "./src/core/workspace-defaults.mjs";
import { createPlatformDisplayHelpers, formatPlatformUserName, getPlatformRoleLabel, getPlatformUserInitials, getPlatformUserProfileImageUrl, normalizePlatformProfileImageUrl } from "./src/modules/platform/display-helpers.mjs";
import { buildPlatformTemporaryLoginMessage, buildPlatformUserCredentialMessage, getPlatformPasswordValidationMessage, readPlatformFormValues, stripPlatformPasswordConfirmation } from "./src/modules/platform/form-helpers.mjs";
import { createPlatformNavigationController, getPlatformTopIconLabel } from "./src/modules/platform/navigation-controller.mjs";
import { createPlatformNavigationRenderer } from "./src/modules/platform/navigation-renderer.mjs";
import { createPlatformStructureStateHelpers } from "./src/modules/platform/structure-state.mjs";
import { createTransferRoomRuntime } from "./transfer-room-runtime.js";
import { getTopIconSvg } from "./top-icons.js";
import { createDefaultPlatformAppearanceConfig, getHomeAppearanceImpactSummary, normalizePlatformAppearanceConfig, normalizePlatformAppearanceValue, platformAppearanceDensityOptions, platformAppearanceHomeComponentTypeIds, platformAppearanceHomeSectionDefaults, platformAppearanceThemeOptions, platformAppearanceToneOptions } from "./src/core/appearance-governance.mjs";
import { adminDepartmentSuggestions, adminTitleSuggestions, createAdminAccessRenderer, createAdminReadinessRenderer, createAdminStructureRenderer, createAdminUserRenderer, createAdminWorkspaceRenderer, formatAdminDateTime, getAdminActiveUserCount, getAdminUserInitials as getAdminUserInitialsFromModule } from "./src/modules/admin/index.mjs";
import { createProfileWorkspaceRenderer } from "./src/modules/profile/index.mjs";
import { createStaffWorkspaceRenderer } from "./src/modules/staff/index.mjs";
import {
  createSquadProfileSelectedRenderer,
  createSquadProfileSupportRenderer,
  createSquadRosterRenderer,
  createSquadScoutingSpiderRenderer,
  createSquadWorkspaceRenderer,
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
  createMedicalDisplayHelpers,
  createMedicalOptionRenderers,
  createMedicalCommandRenderer,
  createMedicalCommandSelectors,
  createMedicalAvailabilitySelectors,
  createMedicalOperationsRenderer,
  createMedicalOperationsSelectors,
  createMedicalPlanSelectors,
  createMedicalPlanFormRenderer,
  createMedicalPlayerModalRenderer,
  createMedicalProfileSummaryRenderer,
  createMedicalProfileSummarySelectors,
  createMedicalOptionSelectors,
  createMedicalRecommendationRenderer,
  createMedicalRosterHelpers,
  createMedicalRosterRenderer,
  createMedicalRosterSelectors,
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
const getElement = document.getElementById.bind(document);
const win = window;
const canvas = getElement("pitchCanvas");
const ctx = canvas.getContext("2d");
const ui = {
hubShell: getElement("hubShell"),
hubSidebar: getElement("hubSidebar"),
sidebarToggle: getElement("sidebarToggle"),
workspaceList: getElement("workspaceList"),
topIconMenu: getElement("topIconMenu"),
workspaceTitle: getElement("workspaceTitle"),
workspaceMeta: getElement("workspaceMeta"),
workspaceStatus: getElement("workspaceStatus"),
workspaceQuickSwitch: getElement("workspaceQuickSwitch"),
platformThemeModeSelect: getElement("platformThemeModeSelect"),
profileMenuButton: getElement("profileMenuButton"),
profileMenu: getElement("profileMenu"),
profileMenuAvatar: getElement("profileMenuAvatar"),
profileMenuName: getElement("profileMenuName"),
profileMenuClub: getElement("profileMenuClub"),
profileMenuPanelAvatar: getElement("profileMenuPanelAvatar"),
profileMenuPanelName: getElement("profileMenuPanelName"),
profileMenuPanelClub: getElement("profileMenuPanelClub"),
sidebarProfileButton: getElement("sidebarProfileButton"),
dashboardChatWidgetRoot: getElement("dashboardChatWidgetRoot"),
dataSafetyStatus: getElement("dataSafetyStatus"),
dataSafetyExportButton: getElement("dataSafetyExportButton"),
dataSafetyImportButton: getElement("dataSafetyImportButton"),
dataSafetyImportInput: getElement("dataSafetyImportInput"),
workspaceSearch: getElement("workspaceSearch"),
dashboardDate: getElement("dashboardDate"),
dashboardGreeting: getElement("dashboardGreeting"),
dashboardGrid: getElement("dashboardGrid"),
placeholderTag: getElement("placeholderTag"),
placeholderTitle: getElement("placeholderTitle"),
placeholderDescription: getElement("placeholderDescription"),
placeholderModules: getElement("placeholderModules"),
periodizationShell: getElement("periodizationShell"),
periodizationHeading: getElement("periodizationHeading"),
periodizationPrevMonthButton: getElement("periodizationPrevMonthButton"),
periodizationNextMonthButton: getElement("periodizationNextMonthButton"),
periodizationTodayButton: getElement("periodizationTodayButton"),
periodizationMonthSelect: getElement("periodizationMonthSelect"),
periodizationWindowLabel: getElement("periodizationWindowLabel"),
periodizationPickerGrid: getElement("periodizationPickerGrid"),
periodizationBoard: getElement("periodizationBoard"),
scheduleWorkspace: getElement("scheduleWorkspace"),
scheduleMonthTitle: getElement("scheduleMonthTitle"),
schedulePrevMonthButton: getElement("schedulePrevMonthButton"),
scheduleNextMonthButton: getElement("scheduleNextMonthButton"),
scheduleTodayButton: getElement("scheduleTodayButton"),
scheduleMonthViewButton: getElement("scheduleMonthViewButton"),
scheduleWeekViewButton: getElement("scheduleWeekViewButton"),
scheduleOverviewViewButton: getElement("scheduleOverviewViewButton"),
scheduleOverviewSpanControl: getElement("scheduleOverviewSpanControl"),
scheduleOverviewSpanButtons: Array.from(document.querySelectorAll("[data-schedule-span]")),
scheduleWeekdays: getElement("scheduleWeekdays"),
scheduleCalendarGrid: getElement("scheduleCalendarGrid"),
scheduleWeekGrid: getElement("scheduleWeekGrid"),
scheduleOverviewGrid: getElement("scheduleOverviewGrid"),
scheduleDayCard: getElement("scheduleDayCard"),
scheduleDayEyebrow: getElement("scheduleDayEyebrow"),
scheduleSelectedDateLabel: getElement("scheduleSelectedDateLabel"),
scheduleEditDayButton: getElement("scheduleEditDayButton"),
scheduleAdminActions: getElement("scheduleAdminActions"),
scheduleCopyDayButton: getElement("scheduleCopyDayButton"),
schedulePasteDayButton: getElement("schedulePasteDayButton"),
scheduleEventList: getElement("scheduleEventList"),
scheduleDayInsights: getElement("scheduleDayInsights"),
scheduleEventForm: getElement("scheduleEventForm"),
scheduleEventDate: getElement("scheduleEventDate"),
scheduleEventTime: getElement("scheduleEventTime"),
scheduleEventType: getElement("scheduleEventType"),
scheduleEventTitle: getElement("scheduleEventTitle"),
scheduleEventNote: getElement("scheduleEventNote"),
scheduleEventSubmitButton: getElement("scheduleEventSubmitButton"),
scheduleEventCancelButton: getElement("scheduleEventCancelButton"),
sessionPlannerWorkspace: getElement("sessionPlannerWorkspace"),
pitchStage: getElement("pitchStage"),
pitchFullscreenButton: getElement("pitchFullscreenButton"),
coachAvatar: getElement("coachAvatar"),
coachName: getElement("coachName"),
coachRole: getElement("coachRole"),
profileWorkspace: getElement("profileWorkspace"),
staffWorkspace: getElement("staffWorkspace"),
adminWorkspace: getElement("adminWorkspace"),
medicalTeamWorkspace: getElement("medicalTeamWorkspace"),
playerProfilesWorkspace: getElement("playerProfilesWorkspace"),
scoutingWorkspace: getElement("scoutingWorkspace"),
gameplanWorkspace: getElement("gameplanWorkspace"),
transferRoomWorkspace: getElement("transferRoomWorkspace"),
analysisRoomWorkspace: getElement("analysisRoomWorkspace"),
gameSimulatorWorkspace: document.querySelector('[data-workspace-view="game-simulator"]'),
gameSimulatorIntro: getElement("gameSimulatorIntro"),
simulatorIntroEnterButton: getElement("simulatorIntroEnterButton"),
playPauseButton: getElement("playPauseButton"),
resetButton: getElement("resetButton"),
homeFormationSelect: getElement("homeFormationSelect"),
awayFormationSelect: getElement("awayFormationSelect"),
homeAttackStyleSelect: getElement("homeAttackStyleSelect"),
homeDefenseStyleSelect: getElement("homeDefenseStyleSelect"),
awayAttackStyleSelect: getElement("awayAttackStyleSelect"),
awayDefenseStyleSelect: getElement("awayDefenseStyleSelect"),
physicalProfileSelect: getElement("physicalProfileSelect"),
passModeButton: getElement("passModeButton"),
dribbleModeButton: getElement("dribbleModeButton"),
shotModeButton: getElement("shotModeButton"),
assignBallButton: getElement("assignBallButton"),
defensiveAutopilotButton: getElement("defensiveAutopilotButton"),
offensiveAutopilotButton: getElement("offensiveAutopilotButton"),
autoV2DebugButton: getElement("autoV2DebugButton"),
previousStepButton: getElement("previousStepButton"),
nextStepButton: getElement("nextStepButton"),
sequenceStepLabel: getElement("sequenceStepLabel"),
playSequenceButton: getElement("playSequenceButton"),
clearSequenceButton: getElement("clearSequenceButton"),
saveSequenceButton: getElement("saveSequenceButton"),
loadSequenceButton: getElement("loadSequenceButton"),
downloadSequenceButton: getElement("downloadSequenceButton"),
playbackSpeed: getElement("playbackSpeed"),
playbackSpeedLabel: getElement("playbackSpeedLabel"),
ballSpeedAutoButton: getElement("ballSpeedAutoButton"),
ballSpeedManualButton: getElement("ballSpeedManualButton"),
ballSpeed: getElement("ballSpeed"),
ballSpeedLabel: getElement("ballSpeedLabel"),
dribbleSpeedAutoButton: getElement("dribbleSpeedAutoButton"),
dribbleSpeedManualButton: getElement("dribbleSpeedManualButton"),
dribbleSpeed: getElement("dribbleSpeed"),
dribbleSpeedLabel: getElement("dribbleSpeedLabel"),
pitchSurfaceSelect: getElement("pitchSurfaceSelect"),
weatherSelect: getElement("weatherSelect"),
firstTouchSelect: getElement("firstTouchSelect"),
defensiveAggressionSelect: getElement("defensiveAggressionSelect"),
homeLegendLabel: getElement("homeLegendLabel"),
awayLegendLabel: getElement("awayLegendLabel"),
simTime: getElement("simTime"),
ballStatus: getElement("ballStatus"),
ballEta: getElement("ballEta"),
actionTime: getElement("actionTime"),
actionType: getElement("actionType"),
ballProfile: getElement("ballProfile"),
ballCurrentSpeed: getElement("ballCurrentSpeed"),
ballOwner: getElement("ballOwner"),
selectedPlayerName: getElement("selectedPlayerName"),
selectedReachAtArrival: getElement("selectedReachAtArrival"),
fullscreenSimTime: getElement("fullscreenSimTime"),
fullscreenBallStatus: getElement("fullscreenBallStatus"),
fullscreenBallEta: getElement("fullscreenBallEta"),
fullscreenActionTime: getElement("fullscreenActionTime"),
fullscreenActionType: getElement("fullscreenActionType"),
fullscreenBallProfile: getElement("fullscreenBallProfile"),
fullscreenBallCurrentSpeed: getElement("fullscreenBallCurrentSpeed"),
fullscreenActionDistance: getElement("fullscreenActionDistance"),
fullscreenBallOwner: getElement("fullscreenBallOwner"),
fullscreenSelectedPlayerName: getElement("fullscreenSelectedPlayerName"),
fullscreenSelectedReachAtArrival: getElement("fullscreenSelectedReachAtArrival"),
scenarioTitle: getElement("scenarioTitle"),
scenarioText: getElement("scenarioText"),
scenarioMeta: getElement("scenarioMeta"),
selectedPlayerCard: getElement("selectedPlayerCard"),
fullscreenSelectedPlayerCard: getElement("fullscreenSelectedPlayerCard"),
metricTooltip: getElement("metricTooltip"),
playerTable: getElement("playerTable"),
eventLog: getElement("eventLog"),
sequenceStatus: getElement("sequenceStatus"),
sequenceList: getElement("sequenceList"),
savedSequenceStatus: getElement("savedSequenceStatus"),
savedSequenceList: getElement("savedSequenceList"),
};
const platformAssetVersion = win.__assetVersion || Date.now();
const platformModuleLoader = createPlatformModuleLoader({
documentRef: document,
assetVersion: platformAssetVersion,
});
let gameSimulatorControllersPromise = null;
let gameSimulatorFullscreenController = null, gameSimulatorKeyboardState = null, gameSimulatorWorkspaceController = null;
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
const platformThemeModeStorageKey = "football-platform-theme-mode-v1";
const platformThemeModeDefault = "auto";
function queuePlatformIdleTask(callback, timeout = 300) {
if (typeof callback !== "function") {
return;
}
if (typeof win.requestIdleCallback === "function") {
win.requestIdleCallback(callback, { timeout });
return;
}
win.setTimeout(callback, Math.min(timeout, 120));
}
function ensureDashboardChatStylesheet() {
return platformModuleLoader.loadStylesheet("dashboard-chat", "dashboard-chat.css", {
id: "dashboardChatStylesheet",
});
}
function queueDashboardChatStylesheetLoad() {
queuePlatformIdleTask(() => {
ensureDashboardChatStylesheet().catch(() => {});
}, 220);
}
function queueCriticalWorkspacePreloads() {
queuePlatformIdleTask(() => {
queueWorkspaceModulePreload("transfer-room");
}, 900);
win.setTimeout(() => queuePlatformIdleTask(() => queueWorkspaceModulePreload("scouting"), 600), 1600);
}
const platformThemeModeSupported = new Set(["auto", "light", "dark"]);
const platformDarkThemeStartHour = 19;
const platformDarkThemeEndHour = 6;
const platformThemeRefreshIntervalMs = 60 * 1000;
let platformThemeRefreshTimer = null;
let platformThemeMediaQuery = null;
let platformThemeMediaQueryListener = null;
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
const dashboardTaskStorageKey = "football-dashboard-tasks-v1";
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
const dashboardTutorialPrefsStorageKey = "football-dashboard-tutorial-prefs-v1";
const dashboardNewsSeenStorageKey = "football-dashboard-news-seen-v1";
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
function getDataSafetyNow() {
return new Date().toISOString();
}
function isPlatformDarkThemeActive(now = new Date()) {
const mode = getPlatformThemeMode();
if (mode === "dark") {
return true;
}
if (mode === "light") {
return false;
}
const query = platformThemeMediaQuery ?? getPlatformColorSchemeMediaQuery();
if (query && typeof query.matches === "boolean") {
return Boolean(query.matches);
}
const totalMinutes = now.getHours() * 60 + now.getMinutes();
const start = platformDarkThemeStartHour * 60;
const end = platformDarkThemeEndHour * 60;
return totalMinutes >= start || totalMinutes < end;
}
function applyPlatformThemeByTime() {
const nextMode = getPlatformThemeMode();
const isDark = isPlatformDarkThemeActive();
if (!document.body) {
return;
}
document.body.classList.toggle("is-dark-mode", isDark);
document.body.dataset.themeMode = isDark ? "dark" : "light";
if (ui.platformThemeModeSelect) {
ui.platformThemeModeSelect.value = platformThemeModeSupported.has(nextMode) ? nextMode : platformThemeModeDefault;
}
}
function startPlatformThemeScheduler() {
if (platformThemeMediaQueryListener && platformThemeMediaQuery) {
if (typeof platformThemeMediaQuery.removeEventListener === "function") {
platformThemeMediaQuery.removeEventListener("change", platformThemeMediaQueryListener);
} else if (typeof platformThemeMediaQuery.removeListener === "function") {
platformThemeMediaQuery.removeListener(platformThemeMediaQueryListener);
}
}
platformThemeMediaQuery = getPlatformColorSchemeMediaQuery();
if (platformThemeMediaQuery) {
if (!platformThemeMediaQueryListener) {
platformThemeMediaQueryListener = () => applyPlatformThemeByTime();
}
if (typeof platformThemeMediaQuery.addEventListener === "function") {
platformThemeMediaQuery.addEventListener("change", platformThemeMediaQueryListener);
} else if (typeof platformThemeMediaQuery.addListener === "function") {
platformThemeMediaQuery.addListener(platformThemeMediaQueryListener);
}
}
applyPlatformThemeByTime();
if (platformThemeRefreshTimer) {
win.clearInterval(platformThemeRefreshTimer);
}
platformThemeRefreshTimer = win.setInterval(applyPlatformThemeByTime, platformThemeRefreshIntervalMs);
}
function getPlatformThemeMode() {
return normalizePlatformThemeMode(readPlatformThemeMode());
}
function readPlatformThemeMode() {
try {
return win.localStorage.getItem(platformThemeModeStorageKey) || platformThemeModeDefault;
} catch {
return platformThemeModeDefault;
}
}
function normalizePlatformThemeMode(value = "") {
const normalizedMode = String(value || "").trim().toLowerCase();
return platformThemeModeSupported.has(normalizedMode) ? normalizedMode : platformThemeModeDefault;
}
function setPlatformThemeMode(rawMode = platformThemeModeDefault) {
const mode = normalizePlatformThemeMode(rawMode);
try {
win.localStorage.setItem(platformThemeModeStorageKey, mode);
} catch {
}
if (ui.platformThemeModeSelect) {
ui.platformThemeModeSelect.value = mode;
}
applyPlatformThemeByTime();
}
function getPlatformColorSchemeMediaQuery() {
if (platformThemeMediaQuery) {
return platformThemeMediaQuery;
}
if (typeof win.matchMedia !== "function") {
return null;
}
return win.matchMedia("(prefers-color-scheme: dark)");
}
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
function getDataSafetyStorageLabel(key) {
return dataSafetyStorageLabels[key] || key.replace(/^football-/, "").replaceAll("-", " ");
}
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
function isSessionPlannerAutosaveKey(key = "") {
return sessionPlannerAutosaveBoundary.isAutosaveKey(key);
}
function shouldShowPlatformAutosaveStatus(workspaceId = hubState?.activeWorkspaceId) {
return sessionPlannerAutosaveBoundary.shouldShowStatus(workspaceId);
}
function syncPlatformAutosaveStatusVisibility(workspaceId = hubState?.activeWorkspaceId) {
sessionPlannerAutosaveBoundary.syncVisibility(workspaceId);
}
function setPlatformAutosaveStatusForKey(key, state, message = "") {
sessionPlannerAutosaveBoundary.setStatusForKey(key, state, message);
}
syncPlatformAutosaveStatusVisibility(null);
function getCentralStateBridge() {
return win.footballScienceCentralState ?? null;
}
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
function createCentralBackedStorageError() {
return new Error("Central sync is not ready.");
}
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
sessionPlannerCentralSyncConflict = null;
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
const dashboardNewsVersion = "home-dashboard-personal-todo-v2";
const dashboardNewsItems = [
"Home is now a cleaner staff workspace.",
"Tasks can be delegated from the dashboard.",
"Personal To-Do now lives on Home and mirrors to Profile.",
"Team chat is ready for internal messages.",
];
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
function getPlayerMagnetLabel(player) {
if (!player) {
return "";
}
const teamId = getPlayerTeamId(player);
const roster = teamRosterOrder[teamId] ?? [];
const slotIndex = roster.indexOf(player.id);
const formation = teams[teamId]?.formation;
const formationLabels = formationMagnetLabels[formation];
if (slotIndex >= 0 && formationLabels?.[slotIndex]) {
return formationLabels[slotIndex];
}
const role = player.role ?? "";
const shortLabel = player.shortLabel ?? "";
if (/goalkeeper/i.test(role) || shortLabel === "GK") return "GK";
if (/center back/i.test(role) || /^(LCB|RCB|CB)$/i.test(shortLabel)) return "CB";
if (/wing-back/i.test(role) || /^(LM|RM)$/i.test(shortLabel)) return "WB";
if (/left back/i.test(role) || shortLabel === "LB") return "LB";
if (/right back/i.test(role) || shortLabel === "RB") return "RB";
if (/back/i.test(role) && !/center back/i.test(role)) {
return player.position.y <= pitch.width / 2 ? "LB" : "RB";
}
if (shortLabel === "6" || /holding midfielder/i.test(role)) return "6";
if (shortLabel === "10" || /attacking midfielder/i.test(role)) return "10";
if (shortLabel === "8" || /no\. 8|central midfielder/i.test(role)) return "8";
if (/striker|centre forward/i.test(role) || /^ST$/i.test(shortLabel)) return "9";
if (/winger|forward/i.test(role) || /^(LW|RW)$/i.test(shortLabel)) return "W";
return shortLabel;
}
function vec(x, y) {
return { x, y };
}
function cloneVector(point) {
return { x: point.x, y: point.y };
}
function cloneSecurePossession(securePossession) {
if (!securePossession) {
return null;
}
return {
...securePossession,
opponentPlayerIds: Array.isArray(securePossession.opponentPlayerIds)
? [...securePossession.opponentPlayerIds]
: undefined,
point: securePossession.point ? cloneVector(securePossession.point) : null,
escapePoint: securePossession.escapePoint ? cloneVector(securePossession.escapePoint) : null,
};
}
function cloneGoalEvent(goal) {
if (!goal) {
return null;
}
return {
scoringTeamId: goal.scoringTeamId ?? null,
concedingTeamId: goal.concedingTeamId ?? null,
side: goal.side ?? null,
scoredAt: Number.isFinite(goal.scoredAt) ? goal.scoredAt : 0,
point: goal.point ? cloneVector(goal.point) : null,
displayPoint: goal.displayPoint ? cloneVector(goal.displayPoint) : null,
};
}
function cloneShotPlacement(placement) {
if (!placement) {
return null;
}
return {
intendedTarget: placement.intendedTarget ? cloneVector(placement.intendedTarget) : null,
executedTarget: placement.executedTarget ? cloneVector(placement.executedTarget) : null,
errorMeters: Number.isFinite(placement.errorMeters) ? placement.errorMeters : 0,
missRisk: Number.isFinite(placement.missRisk) ? placement.missRisk : 0,
executionQuality: Number.isFinite(placement.executionQuality) ? placement.executionQuality : 0,
pressure: Number.isFinite(placement.pressure) ? placement.pressure : 0,
angleQuality: Number.isFinite(placement.angleQuality) ? placement.angleQuality : 0,
blockRisk: Number.isFinite(placement.blockRisk) ? placement.blockRisk : 0,
goalDistance: Number.isFinite(placement.goalDistance) ? placement.goalDistance : 0,
};
}
function subtract(a, b) {
return {
x: a.x - b.x,
y: a.y - b.y,
};
}
function clamp(value, min, max) {
return Math.max(min, Math.min(max, value));
}
function lerp(start, end, ratio) {
return start + (end - start) * ratio;
}
function randomBetween(min, max) {
return min + Math.random() * (max - min);
}
function randomSign() {
return Math.random() < 0.5 ? -1 : 1;
}
function addPointNoise(point, radiusMeters = 0, inset = pitch.inset) {
if (!point || radiusMeters <= 0) {
return point ? cloneVector(point) : point;
}
const angle = randomBetween(0, Math.PI * 2);
const radius = Math.sqrt(Math.random()) * radiusMeters;
return clampToPitch({
x: point.x + Math.cos(angle) * radius,
y: point.y + Math.sin(angle) * radius,
}, inset);
}
function chooseWeightedOption(options, getWeight) {
const weighted = options
.map((option) => ({
option,
weight: Math.max(0, getWeight(option)),
}))
.filter((entry) => entry.weight > 0);
if (!weighted.length) {
return options[0] ?? null;
}
const totalWeight = weighted.reduce((total, entry) => total + entry.weight, 0);
let cursor = Math.random() * totalWeight;
for (const entry of weighted) {
cursor -= entry.weight;
if (cursor <= 0) {
return entry.option;
}
}
return weighted[weighted.length - 1].option;
}
function getNaturalDecisionDiversityWeight(candidate, profile = {}, options = {}) {
const carrier = options.carrier ?? candidate?.carrier ?? null;
const startPoint =
options.startPoint ??
(carrier ? getPlayerBallControlPoint(carrier) : null);
if (!candidate?.target || !carrier?.team || !startPoint) {
return 1;
}
const recent = getRecentPossessionSteps(carrier.team, 7)
.map((step) => getRecordedStepPattern(step, carrier.team))
.filter(Boolean);
if (!recent.length) {
return 1;
}
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const lastPattern = recent[0] ?? null;
let familyStreak = 0;
let laneStreak = 0;
for (const entry of recent) {
if (entry.family === pattern.family) {
familyStreak += 1;
} else {
break;
}
}
for (const entry of recent) {
if (entry.laneKey === pattern.laneKey && entry.thirdKey === pattern.thirdKey) {
laneStreak += 1;
} else {
break;
}
}
const sameReceiverRoleCount = pattern.receiverRoleKey
? recent.filter((entry) => entry.receiverRoleKey === pattern.receiverRoleKey).length
: 0;
const sameSpaceCount = recent.filter((entry) => entry.targetSpaceLabel === pattern.targetSpaceLabel).length;
const highValueException =
candidate.actionType === "shot" ||
candidate.mustShoot ||
candidate.isBoxPass ||
candidate.isLineBreak ||
targetThreat.value >= 0.7 ||
targetThreat.centralPocket >= 0.48;
const identityRepeat =
((profile.styleKey === "wing-play" || profile.styleKey === "overlap-wide") &&
["wide-overload", "cross", "cutback", "switch"].includes(pattern.family)) ||
((profile.styleKey === "control-possession" || profile.styleKey === "tiki-taka" || profile.styleKey === "fluid-combinations") &&
["support-link", "third-player", "line-break"].includes(pattern.family)) ||
(isTransitionAttackStyle(profile.styleKey) &&
["line-break", "carry-forward", "front-line", "shot"].includes(pattern.family));
const repeatTolerance = identityRepeat ? 0.56 : 1;
const laneShiftFromLast = lastPattern
? Math.abs(getPitchLaneIndex(pattern.laneKey) - getPitchLaneIndex(lastPattern.laneKey))
: 0;
let weight = 1;
if (!highValueException) {
weight -= clamp(familyStreak * 0.1 * repeatTolerance, 0, 0.34);
weight -= clamp(laneStreak * 0.12, 0, 0.38);
weight -= clamp((sameReceiverRoleCount - 1) * 0.05, 0, 0.18);
weight -= clamp((sameSpaceCount - 2) * 0.05, 0, 0.2);
}
if (laneStreak >= 2 && laneShiftFromLast >= 2) {
weight += 0.18 + (profile.switchBias ?? 0.5) * 0.1;
}
if (familyStreak >= 2 && pattern.family !== lastPattern?.family) {
weight += 0.14 + (profile.tempo ?? 0.5) * 0.08;
}
if (recent.some((entry) => entry.family === "recycle") && pattern.forwardGain >= 6) {
weight += 0.12 + (profile.progressionUrgency ?? 0.5) * 0.08;
}
if (highValueException) {
weight += candidate.actionType === "shot" ? 0.12 : 0.06;
}
const naturalNoise = randomBetween(
-clamp(0.04 + (profile.risk ?? 0.5) * 0.04, 0.04, 0.1),
clamp(0.05 + (profile.tempo ?? 0.5) * 0.06, 0.05, 0.12)
);
return clamp(weight + naturalNoise, highValueException ? 0.72 : 0.36, 1.42);
}
function getAutoPilotDecisionPersonalityWeight(candidate, profile = {}, options = {}) {
const carrier = options.carrier ?? candidate?.carrier ?? null;
const startPoint =
options.startPoint ??
(carrier ? getPlayerBallControlPoint(carrier) : null);
if (!candidate?.target || !carrier || !startPoint) {
return 1;
}
const context = getPlayerDecisionContext(carrier);
const pattern = getAutoPilotCandidatePattern(candidate, carrier, startPoint);
const targetThreat = getPitchThreatProfile(candidate.target, carrier.team);
const actionSpace = getActionSpaceValue(startPoint, candidate.target, carrier.team, profile);
const decisionSecurity = clamp(
context.profile.perception * 0.24 +
context.profile.decisionQuality * 0.3 +
context.profile.tacticalDiscipline * 0.18 +
context.profile.composure * 0.16 +
context.profile.technicalSecurity * 0.12,
0,
1
);
const creativeFreedom = clamp(
(profile.risk ?? 0.5) * 0.26 +
(profile.tempo ?? 0.5) * 0.16 +
(1 - context.profile.tacticalDiscipline) * 0.14 +
context.profile.decisionQuality * 0.18,
0,
0.72
);
const underPressure = clamp(context.pressure, 0, 1);
const isHighValue =
candidate.mustShoot ||
candidate.isLineBreak ||
candidate.isBoxPass ||
candidate.actionType === "shot" ||
targetThreat.value >= 0.62 ||
targetThreat.centralPocket >= 0.42 ||
actionSpace.spacePriority?.score >= 0.62;
let fit = 0;
let tendencyFit = 0;
if (candidate.actionType === "dribble") {
fit =
getAutoPilotRoleStrength(carrier, "dribbler") * 0.58 +
getAutoPilotRoleStrength(carrier, "runner") * 0.22;
tendencyFit =
getPlayerTendency(carrier, "dribble") * 0.62 +
getPlayerTendency(carrier, "boxRun") * 0.18;
} else if (candidate.actionType === "shot") {
fit =
getAutoPilotRoleStrength(carrier, "finisher") * 0.66 +
getAutoPilotRoleStrength(carrier, "runner") * 0.12;
tendencyFit =
getPlayerTendency(carrier, "boxRun") * 0.28 +
(profile.shootBias ?? 0.5) * 0.28;
} else if (pattern.family === "switch" || candidate.isSwitch) {
fit =
getAutoPilotRoleStrength(carrier, "switcher") * 0.62 +
getAutoPilotRoleStrength(carrier, "creator") * 0.18;
tendencyFit = getPlayerTendency(carrier, "switchPlay") * 0.68;
} else if (pattern.family === "cross" || pattern.family === "cutback" || candidate.isBoxPass) {
fit =
getAutoPilotRoleStrength(carrier, "crosser") * 0.48 +
getAutoPilotRoleStrength(carrier, "creator") * 0.28;
tendencyFit =
getPlayerTendency(carrier, "earlyCross") * 0.46 +
getPlayerTendency(carrier, "passAndMove") * 0.18;
} else if (
pattern.family === "line-break" ||
pattern.family === "front-line" ||
candidate.isLineBreak
) {
fit =
getAutoPilotRoleStrength(carrier, "creator") * 0.46 +
getAutoPilotRoleStrength(carrier, "receiver") * 0.18;
tendencyFit =
getPlayerTendency(carrier, "lineBreakPass") * 0.58 +
getPlayerTendency(carrier, "passAndMove") * 0.16;
} else if (pattern.family === "support-link" || pattern.family === "recycle") {
fit =
getAutoPilotRoleStrength(carrier, "receiver") * 0.34 +
getAutoPilotRoleStrength(carrier, "creator") * 0.24;
tendencyFit =
getPlayerTendency(carrier, "retain") * 0.5 +
getPlayerTendency(carrier, "passAndMove") * 0.22;
} else {
fit =
getAutoPilotRoleStrength(carrier, "creator") * 0.32 +
getAutoPilotRoleStrength(carrier, "receiver") * 0.22;
tendencyFit = getPlayerTendency(carrier, "passAndMove") * 0.34;
}
const personalityFit = clamp((fit + tendencyFit) / 1.18, 0, 1.16);
const pressureSafetyFit =
underPressure >= 0.48
? candidate.actionType === "pass" && pattern.forwardGain <= 6 && (candidate.receiverPressure ?? 1) <= 0.68
? 0.12 + context.profile.pressResistance * 0.1
: candidate.actionType === "dribble" && getAutoPilotRoleStrength(carrier, "dribbler") >= 0.66
? 0.08 + context.profile.pressResistance * 0.08
: -0.12 * underPressure
: 0;
const lowValueRisk =
!isHighValue &&
(
(candidate.actionType === "shot" && targetThreat.box < 0.16) ||
(candidate.actionType === "pass" && pattern.forwardGain < -5 && !(candidate.isSwitch || pattern.family === "switch")) ||
(candidate.actionType === "dribble" && actionSpace.openTarget < 0.32 && underPressure >= 0.42)
);
const intelligenceGuard =
lowValueRisk
? -0.18 - decisionSecurity * 0.18
: isHighValue
? decisionSecurity * 0.12
: decisionSecurity * 0.04;
const naturalVariance = randomBetween(
-clamp(0.035 + (1 - decisionSecurity) * 0.06, 0.035, 0.095),
clamp(0.04 + creativeFreedom * 0.08, 0.04, 0.105)
);
const score =
0.9 +
personalityFit * 0.18 +
pressureSafetyFit +
intelligenceGuard +
naturalVariance;
return clamp(score, lowValueRisk ? 0.62 : 0.74, isHighValue ? 1.28 : 1.2);
}
function chooseScoredCandidateWithVariation(candidates, profile = {}, options = {}) {
const available = candidates.filter(Boolean);
if (!available.length) {
return null;
}
const sorted = [...available].sort((a, b) => b.score - a.score);
const bestScore = sorted[0].score ?? 0;
const tolerance =
options.tolerance ??
clamp(0.54 + (profile.risk ?? 0.5) * 0.52 + (profile.tempo ?? 0.5) * 0.28, 0.55, 1.45);
const temperature =
options.temperature ??
clamp(0.22 + (profile.risk ?? 0.5) * 0.16 + (profile.tempo ?? 0.5) * 0.1, 0.2, 0.58);
const pool = sorted.filter((candidate, index) => (
index === 0 ||
(candidate.score ?? 0) >= bestScore - tolerance ||
candidate.mustShoot
));
return chooseWeightedOption(pool, (candidate) => {
const relativeScore = ((candidate.score ?? 0) - bestScore) / Math.max(temperature, 0.01);
const principleBoost = candidate.isPrinciplePattern ? 1.1 : 1;
const preferredBoost = options.preferredCandidate && candidate === options.preferredCandidate ? 1.35 : 1;
const shotBoost = candidate.actionType === "shot" && (candidate.mustShoot || profile.phaseKey === "finalThird") ? 1.25 : 1;
const diversityWeight = getNaturalDecisionDiversityWeight(candidate, profile, options);
const personalityWeight = getAutoPilotDecisionPersonalityWeight(candidate, profile, options);
return Math.exp(relativeScore) * principleBoost * preferredBoost * shotBoost * diversityWeight * personalityWeight;
});
}
function clampToPitch(point, inset = pitch.inset) {
return {
x: clamp(point.x, inset, pitch.length - inset),
y: clamp(point.y, inset, pitch.width - inset),
};
}
function distance(a, b) {
const dx = b.x - a.x;
const dy = b.y - a.y;
return Math.sqrt(dx * dx + dy * dy);
}
function normalize(from, to) {
const dx = to.x - from.x;
const dy = to.y - from.y;
const length = Math.sqrt(dx * dx + dy * dy);
if (length === 0) {
return { x: 0, y: 0 };
}
return {
x: dx / length,
y: dy / length,
};
}
function moveTowards(from, to, maxDistance) {
const remaining = distance(from, to);
if (remaining <= maxDistance) {
return cloneVector(to);
}
const direction = normalize(from, to);
return {
x: from.x + direction.x * maxDistance,
y: from.y + direction.y * maxDistance,
};
}
function normalizeAngle(angle) {
let next = angle;
while (next > Math.PI) {
next -= Math.PI * 2;
}
while (next < -Math.PI) {
next += Math.PI * 2;
}
return next;
}
function angleBetween(from, to) {
return Math.atan2(to.y - from.y, to.x - from.x);
}
function angleDifference(a, b) {
return Math.abs(normalizeAngle(a - b));
}
function getTeamAttackAngle(teamId) {
return teamId === "home" ? 0 : Math.PI;
}
function getPlayerFacingAngle(player) {
return Number.isFinite(player.bodyAngle) ? player.bodyAngle : getTeamAttackAngle(player.team);
}
function rotatePlayerBodyToward(player, targetPoint, blend = 1) {
if (!targetPoint) {
return;
}
const desiredAngle = angleBetween(player.position, targetPoint);
const currentAngle = getPlayerFacingAngle(player);
const delta = normalizeAngle(desiredAngle - currentAngle);
player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
}
function rotatePlayerBodyTowardAngle(player, desiredAngle, blend = 1, maxTurn = Infinity) {
if (!player || !Number.isFinite(desiredAngle)) {
return;
}
const currentAngle = getPlayerFacingAngle(player);
let delta = normalizeAngle(desiredAngle - currentAngle);
if (Number.isFinite(maxTurn)) {
delta = clamp(delta, -Math.abs(maxTurn), Math.abs(maxTurn));
}
player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
}
function rotatePlayerBodyAlongMovement(player, fromPoint, toPoint, blend = 1) {
if (!player || !fromPoint || !toPoint || distance(fromPoint, toPoint) <= 0.001) {
return;
}
const desiredAngle = angleBetween(fromPoint, toPoint);
const currentAngle = getPlayerFacingAngle(player);
const delta = normalizeAngle(desiredAngle - currentAngle);
player.bodyAngle = normalizeAngle(currentAngle + delta * clamp(blend, 0, 1));
}
function getBallAwareBodyAngle(player, focusPoint) {
if (!player || !focusPoint) {
return player ? getPlayerFacingAngle(player) : 0;
}
const ballAngle = angleBetween(player.position, focusPoint);
const nextPlayAngle = getTeamAttackAngle(player.team);
const attackBias = clamp(
normalizeAngle(nextPlayAngle - ballAngle) * 0.26,
-Math.PI / 7.5,
Math.PI / 7.5
);
return normalizeAngle(ballAngle + attackBias);
}
function getPlayerBallControlPoint(player) {
const facingAngle = getPlayerFacingAngle(player);
const controlOffset = getBallControlOffsetMeters();
return clampToPitch({
x: player.position.x + Math.cos(facingAngle) * controlOffset,
y: player.position.y + Math.sin(facingAngle) * controlOffset,
});
}
function getPreferredFootOffsetAngle(player) {
return player?.preferredFoot === "left" ? Math.PI / 7.5 : -Math.PI / 7.5;
}
function getFootUsageScore(player, referenceAngle, baseAngle = getPlayerFacingAngle(player)) {
if (!player || !Number.isFinite(referenceAngle)) {
return 0.82;
}
const preferredPocketAngle = normalizeAngle(baseAngle + getPreferredFootOffsetAngle(player));
const alternatePocketAngle = normalizeAngle(baseAngle - getPreferredFootOffsetAngle(player));
const preferredAlignment = 1 - angleDifference(referenceAngle, preferredPocketAngle) / Math.PI;
const alternateAlignment = 1 - angleDifference(referenceAngle, alternatePocketAngle) / Math.PI;
const weakFootQuality = clamp(player.weakFootQuality ?? 0.68, 0.45, 0.92);
return clamp(
Math.max(preferredAlignment, alternateAlignment * weakFootQuality),
0.2,
1
);
}
function blendAngles(angleA, angleB, weightA = 0.5, weightB = 0.5) {
const x = Math.cos(angleA) * weightA + Math.cos(angleB) * weightB;
const y = Math.sin(angleA) * weightA + Math.sin(angleB) * weightB;
if (Math.abs(x) <= 0.0001 && Math.abs(y) <= 0.0001) {
return angleA;
}
return Math.atan2(y, x);
}
function projectPointOnSegment(point, segmentStart, segmentEnd) {
const dx = segmentEnd.x - segmentStart.x;
const dy = segmentEnd.y - segmentStart.y;
const lengthSquared = dx * dx + dy * dy;
if (lengthSquared === 0) {
return cloneVector(segmentStart);
}
const t = clamp(
((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared,
0,
1
);
return {
x: segmentStart.x + dx * t,
y: segmentStart.y + dy * t,
};
}
function projectPointOnSegmentWithRatio(point, segmentStart, segmentEnd) {
const dx = segmentEnd.x - segmentStart.x;
const dy = segmentEnd.y - segmentStart.y;
const lengthSquared = dx * dx + dy * dy;
if (lengthSquared === 0) {
return {
point: cloneVector(segmentStart),
ratio: 0,
};
}
const ratio = clamp(
((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared,
0,
1
);
return {
point: {
x: segmentStart.x + dx * ratio,
y: segmentStart.y + dy * ratio,
},
ratio,
};
}
function formatTime(seconds) {
return `${seconds.toFixed(2)} s`;
}
function formatSpeed(value) {
return `${value.toFixed(1)} m/s`;
}
function formatMeters(value) {
return `${value.toFixed(1)} m`;
}
function getIntelligenceArchetype(blueprint) {
return (
intelligenceRoleArchetypes.find((archetype) =>
archetype.test(blueprint.role, blueprint.shortLabel)
) ?? intelligenceRoleArchetypes[intelligenceRoleArchetypes.length - 1]
);
}
function getSprintArchetype(blueprint) {
const roleLabel = blueprint?.team
? getPlayerMagnetLabel(blueprint) || blueprint.shortLabel
: blueprint?.shortLabel;
return (
sprintRoleArchetypes.find((archetype) =>
archetype.test(blueprint.role, roleLabel)
) ?? sprintRoleArchetypes[sprintRoleArchetypes.length - 1]
);
}
const gameSimulatorSetupEngine = createGameSimulatorSetupEngine({
  angleBetween,
  ballRadiusMeters,
  chooseScoredCandidateWithVariation,
  chooseWeightedOption,
  clamp,
  clampToPitch,
  cloneVector,
  competitionPhysicalProfiles,
  defaultKickoffTeamId,
  defaultPhysicalProfileKey,
  defensiveAutopilotProfiles,
  defensivePhaseProfiles,
  distance,
  formationLayouts,
  getAttackDirectionSign: (...args) => getAttackDirectionSign(...args),
  getDefensiveAutopilotLineKey: (...args) => getDefensiveAutopilotLineKey(...args),
  getDefensiveCompactLineIntegritySettings: (...args) => getDefensiveCompactLineIntegritySettings(...args),
  getDefensiveGoalkeeperTarget: (...args) => getDefensiveGoalkeeperTarget(...args),
  getDefensiveLineCenterY: (...args) => getDefensiveLineCenterY(...args),
  getDefensiveLineX: (...args) => getDefensiveLineX(...args),
  getDefensiveUnitGap: (...args) => getDefensiveUnitGap(...args),
  getIntelligenceArchetype,
  getOffensiveAutopilotProfile: (...args) => getOffensiveAutopilotProfile(...args),
  getOffensiveRoleKey: (...args) => getOffensiveRoleKey(...args),
  getOpponentGoalCenter: (...args) => getOpponentGoalCenter(...args),
  getOpponentPenaltySpot: (...args) => getOpponentPenaltySpot(...args),
  getOtherTeamId: (...args) => getOtherTeamId(...args),
  getPlayerMagnetLabel,
  getSprintArchetype,
  getTeamAttackAngle,
  getTeamAttackStyleProfile,
  getTeamDefenseStyleKey,
  getTeamDefenseStyleProfile,
  intelligenceLabelBoosts,
  invalidateAutoPilotPossessionPlan: (...args) => invalidateAutoPilotPossessionPlan(...args),
  isFrontLineRole: (...args) => isFrontLineRole(...args),
  isGoalkeeper: (...args) => isGoalkeeper(...args),
  normalize,
  pitch,
  playerRadiusMeters,
  playerTendencyTemplates,
  randomBetween,
  randomSign,
  resolvePreferredFoot,
  resolveWeakFootQuality,
  setPiecePhaseProfiles,
  squadBlueprints,
  teamRosterOrder,
  teams,
  vec,
  getState: () => state,
});
const {
  applyCornerSetup,
  applyFreeKickSetup,
  applyGoalKickSetup,
  applyKickoffSetup,
  applyPenaltySetup,
  applyPhysicalProfileToPlayers,
  applyThrowInSetup,
  buildPlayerIntelligenceProfile,
  buildPlayerSprintProfile,
  buildPlayerTendencyProfile,
  createPlayer,
  getBallControlOffsetMeters,
  getCompetitionPhysicalLabel,
  getCompetitionPhysicalProfile,
  getCornerKickSpot,
  getFormationPositions,
  getKickoffDefensivePhaseKey,
  getKickoffSupportId,
  getKickoffTakerId,
  getKickoffSpot,
  getPlayerPositionForControlPoint,
  getPlayerTeamId,
  getPlayerTendency,
  kickoffOpeningProfiles,
  placePlayerWithControlPoint,
  resetPlayerMovementProgress,
  setTeamFormationOnPlayers,
} = gameSimulatorSetupEngine;
const {
  getRemainingBallDistance,
  hasBallAction,
  getActionOrigin,
  getProjectedActionDuration,
  getCurrentActionDuration,
  getActionInitiator,
  getOrientationTurnDelay,
  getOrientationMovementProfile,
  getCoverShadowInfluence,
  getReceiveOrientationScore,
  getBestReceiveBodyAngle,
  getReceiveFootUsageScore,
  applyBestReceiveBodyAngle,
  getFirstTouchModeLabel,
  resolveFirstTouchMode,
  getFirstTouchDirectionAngle,
  getFirstTouchDistance,
  clearAutoPilotReceiveMomentum,
  setAutoPilotReceiveMomentum,
  getAutoPilotReceiveMomentum,
  getAutoPilotReceiveMomentumAdjustment,
  getAutoPilotFirstActionAfterReceiveAdjustment,
  getAutoPilotReceiveFlowContext,
  getAutoPilotReceiveFlowAdjustment,
  getReceiveContinuationCarryTarget,
  buildAutoPilotReceiveContinuationCandidate,
  applyControlledFirstTouch,
  shouldUseAutoPilotActiveFirstTouch,
  getLiveBallFocusPoint,
  getSpacePassTargetPoint,
  getPlayerOrientationFocus,
  getActiveMovementTarget,
  isPlayerReservedForReceiveShape,
  applyNearbyBallOrientation,
  getPotentialPassReceiverAtTarget,
  getPassLaneRiskProfile,
  computePassLaneClarity,
  getGoalMouthTarget,
  getShotAngleQuality,
  getShotBlockRisk,
  getGoalkeeperTargetOpenness,
  computeShotLaneClarity,
  getShotWindowProfile,
  getDeterministicShotNoise,
  resolveExecutedShotTarget,
  getAttackDirectionSign,
  getAttackingDepth,
  getOpponentGoalCenter,
  getDepthZoneKey,
  getDepthZoneLabel,
  getLaneLabel,
  getGoldenZoneScore,
  isGoldenZone,
  getMedianNumber,
  getDepthQuantile,
  getOpponentLineDepthsForAttackingTeam,
  getAttackingGameSpaceProfile,
  getPitchSpaceProfile,
  getPitchThreatProfile,
  getOpponentPressureAtPoint,
  getNearestOpponentGapToPoint,
  getOpponentsBypassedByAction,
  getFootballSpacePriority,
  getActionSpaceValue,
  getTeamDensityAtPoint,
  getOpponentDensityAtPoint,
  getSpaceDominanceProfile,
  getAutoPilotSpaceDominanceAdjustment,
  getAutoPilotGameSpaceAdjustment,
  getAutoPilotSpatialDecisionAdjustment,
  getActionThreatGain,
  isPlayerFacingForward,
  getForwardFacingSpaceTwoContext,
  getAutoPilotSpaceTwoAdvantageAdjustment,
  getForwardProgressionWindow,
  getOpponentGoalSide,
  getGoalLineX,
  getGoalDirectionSign,
  isBetweenGoalPosts,
  getGoalNetDisplayPoint,
  resolveShotTarget,
  getOwnGoalCenter,
  getOpponentPenaltySpot,
  getSecondLastOpponentLineX,
  getOffsideInfo,
  isPassReceiverOffside,
  isWideChannel,
  isBylineZone,
  isInsideOpponentBox,
  isInsideOwnBox,
  isCutbackTarget,
  isGoalkeeper,
  getBallProfileDistanceRatio,
  getPitchSurfacePreset,
  getWeatherPreset,
  getDefensiveAggressionPreset,
  isAerialFlightStyle,
  getFlightStyleLabel,
  resolveBallCurveDirection,
  getBallTravelProgress,
  getBallTravelPoint,
  materializeBallProfile,
  getManualBallProfile,
  getDribbleRoleFamily,
  resolveAutoDribbleProfile,
  getNearestOpponentGapInCarryLane,
  getCarryLaneOpenSpaceScore,
  getCarryRunwayRoleCap,
  getCarryRunwayProfile,
  getRunwayCarryTarget,
  getBreakawayCarryTarget,
  getOpenGrassCarryContext,
  getQuadraticPoint,
  buildSampledCurvePath,
  getSampledPathPoint,
  buildDribbleCarryPath,
  getDribbleCarryPathPoint,
  setDribbleCarryPathForBall,
  getLiveDribbleSpeed,
  resolveAutoBallProfile,
  resolveBallActionProfile,
  resolveRecordedStepProfile,
  applyResolvedBallProfile,
  getBallProfileLabel,
  getDisplayedBallSpeed,
  getRemainingBallTravelTime,
  updateBallFlightHeight,
  getBallFlightControlFactor,
} = createGameSimulatorActionSpaceMetrics({
  angleBetween: angleBetween,
  angleDifference: angleDifference,
  autoBallProfiles: autoBallProfiles,
  autoDribbleProfiles: autoDribbleProfiles,
  ballRadiusMeters: ballRadiusMeters,
  blendAngles: blendAngles,
  buildPlayerIntelligenceProfile: buildPlayerIntelligenceProfile,
  clamp: clamp,
  clampToPitch: clampToPitch,
  cloneVector: cloneVector,
  computeTimeToCoverDistance: (...args) => computeTimeToCoverDistance(...args),
  defensiveAggressionPresets: defensiveAggressionPresets,
  distance: distance,
  firstTouchModes: firstTouchModes,
  getActionSpeed: (...args) => getActionSpeed(...args),
  getAutoPilotFlowContext: (...args) => getAutoPilotFlowContext(...args),
  getAutoPilotRoleStrength: (...args) => getAutoPilotRoleStrength(...args),
  getBallAwareBodyAngle: getBallAwareBodyAngle,
  getBallControlOffsetMeters: getBallControlOffsetMeters,
  getBallOwner: getBallOwner,
  getCompetitionPhysicalProfile: getCompetitionPhysicalProfile,
  getDefensiveAutopilotLineKey: (...args) => getDefensiveAutopilotLineKey(...args),
  getDefensivePhaseKey: (...args) => getDefensivePhaseKey(...args),
  getFootUsageScore: getFootUsageScore,
  getGoalkeeperForTeam: (...args) => getGoalkeeperForTeam(...args),
  getNearestOpponentGap: getNearestOpponentGap,
  getOffensiveAutopilotProfile: (...args) => getOffensiveAutopilotProfile(...args),
  getOffensiveRoleKey: (...args) => getOffensiveRoleKey(...args),
  getOtherTeamId: (...args) => getOtherTeamId(...args),
  getPitchLaneIndex: (...args) => getPitchLaneIndex(...args),
  getPitchLaneKey: (...args) => getPitchLaneKey(...args),
  getPlannedPossessionTeamId: (...args) => getPlannedPossessionTeamId(...args),
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getPlayerById: getPlayerById,
  getPlayerDecisionContext: getPlayerDecisionContext,
  getPlayerFacingAngle: getPlayerFacingAngle,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getPlayerTendency: getPlayerTendency,
  getTeamAttackAngle: getTeamAttackAngle,
  getTeamSupportCountAroundPoint: (...args) => getTeamSupportCountAroundPoint(...args),
  getWideSideSign: (...args) => getWideSideSign(...args),
  isFrontLineRole: (...args) => isFrontLineRole(...args),
  isSupportRole: (...args) => isSupportRole(...args),
  keepSecurePossessionOnlyForOwner: (...args) => keepSecurePossessionOnlyForOwner(...args),
  lerp: lerp,
  moveTowards: moveTowards,
  normalize: normalize,
  normalizeAngle: normalizeAngle,
  pitch: pitch,
  pitchSurfacePresets: pitchSurfacePresets,
  playerRadiusMeters: playerRadiusMeters,
  projectPointOnSegmentWithRatio: projectPointOnSegmentWithRatio,
  rotatePlayerBodyTowardAngle: rotatePlayerBodyTowardAngle,
  setSecurePossessionAfterControlledTouch: (...args) => setSecurePossessionAfterControlledTouch(...args),
  subtract: subtract,
  teams: teams,
  uniquePrincipleLabels: (...args) => uniquePrincipleLabels(...args),
  vec: vec,
  weatherPresets: weatherPresets,
  getState: () => state,
});

const {
  applyBallExecutionProfile,
  getLooseBallClaimScore,
  getShotReboundClaimContext,
  getShotReboundClaimAdjustment,
  getBallContestControlScore,
  getAerialPresence,
  getAerialContestScore,
  getAerialFirstContactContext,
  getAerialFirstContactScore,
  getAerialDefensiveClearanceAngle,
  getAerialAttackingKnockdownAngle,
  getAerialControlScore,
  getBallDuelScore,
  clearSecurePossession,
  getBallWinEscapeTouch,
  applyBallWinEscapeTouch,
  setSecurePossessionAfterBallWin,
  getPossessionShieldOpponents,
  setSecurePossessionAfterControlledTouch,
  keepSecurePossessionOnlyForOwner,
  getSecurePossessionContext,
  getDribbleTackleCandidate,
  getDribbleFoulCandidate,
  completeDribbleFoulRestart,
  resolveDribbleDefensiveChallenge,
  resolveLooseBallClaim,
  connectBallToPlayerForNextAction,
  applyShotReboundControlTouch,
  keepBallPlayableForNextAction,
  createLooseBallSpill,
  resolveShotBlockCommitment,
  resolvePassTransitInterception,
  resolveAerialArrivalContest,
  shouldTriggerLandingBounce,
  startLandingBounceSkid,
  settleBallForNextAction,
} = createGameSimulatorBallResolutionEngine({
  angleBetween: angleBetween,
  angleDifference: angleDifference,
  applyCommittedSnapshot: applyCommittedSnapshot,
  applyControlledFirstTouch: applyControlledFirstTouch,
  blendAngles: blendAngles,
  captureSnapshot: captureSnapshot,
  clamp: clamp,
  clampToPitch: clampToPitch,
  clearAutoPilotReceiveMomentum: (...args) => clearAutoPilotReceiveMomentum(...args),
  cloneSnapshot: cloneSnapshot,
  cloneVector: cloneVector,
  completeLiveActionPlayersBeforeCommit: (...args) => completeLiveActionPlayersBeforeCommit(...args),
  computePassLaneClarity: computePassLaneClarity,
  computeShotLaneClarity: computeShotLaneClarity,
  computeTimeToCoverDistance: (...args) => computeTimeToCoverDistance(...args),
  configureBallTravelProfile: (...args) => configureBallTravelProfile(...args),
  distance: distance,
  finalizeCurrentActionStep: (...args) => finalizeCurrentActionStep(...args),
  getActionInitiator: getActionInitiator,
  getAttackDirectionSign: getAttackDirectionSign,
  getAutoPilotRoleStrength: (...args) => getAutoPilotRoleStrength(...args),
  getBallFlightControlFactor: getBallFlightControlFactor,
  getBallTravelProgress: getBallTravelProgress,
  getCoverShadowInfluence: getCoverShadowInfluence,
  getDefensiveAggressionPreset: getDefensiveAggressionPreset,
  getDistanceFromOwnGoal: (...args) => getDistanceFromOwnGoal(...args),
  getFirstTouchModeLabel: getFirstTouchModeLabel,
  getFootUsageScore: getFootUsageScore,
  getLiveDribbleSpeed: getLiveDribbleSpeed,
  getNearestOpponentGap: getNearestOpponentGap,
  getOffensiveRoleKey: (...args) => getOffensiveRoleKey(...args),
  getOpponentGoalCenter: getOpponentGoalCenter,
  getOpponentPenaltySpot: getOpponentPenaltySpot,
  getOrientationMovementProfile: getOrientationMovementProfile,
  getOtherTeamId: (...args) => getOtherTeamId(...args),
  getOwnGoalCenter: getOwnGoalCenter,
  getPitchSurfacePreset: getPitchSurfacePreset,
  getPitchThreatProfile: getPitchThreatProfile,
  getPlannedPossessionTeamId: (...args) => getPlannedPossessionTeamId(...args),
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getPlayerById: getPlayerById,
  getPlayerDecisionContext: getPlayerDecisionContext,
  getPlayerFacingAngle: getPlayerFacingAngle,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPositionForControlPoint: getPlayerPositionForControlPoint,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getReceiveFootUsageScore: getReceiveFootUsageScore,
  getReceiveOrientationScore: getReceiveOrientationScore,
  getShotWindowProfile: getShotWindowProfile,
  getTeamAttackAngle: getTeamAttackAngle,
  getTeamAttackStyleKey: getTeamAttackStyleKey,
  getWeatherPreset: getWeatherPreset,
  isAerialFlightStyle: isAerialFlightStyle,
  isGoalkeeper: isGoalkeeper,
  isInsideOpponentBox: isInsideOpponentBox,
  isInsideOwnBox: isInsideOwnBox,
  isTransitionAttackStyle: (...args) => isTransitionAttackStyle(...args),
  lerp: lerp,
  logEvent: logEvent,
  normalize: normalize,
  normalizeAngle: normalizeAngle,
  pitch: pitch,
  placePlayerWithControlPoint: placePlayerWithControlPoint,
  playerRadiusMeters: playerRadiusMeters,
  projectPointOnSegment: projectPointOnSegment,
  projectPointOnSegmentWithRatio: projectPointOnSegmentWithRatio,
  queueNextSequenceStep: (...args) => queueNextSequenceStep(...args),
  rotatePlayerBodyToward: rotatePlayerBodyToward,
  scheduleAutoPilotContinuation: (...args) => scheduleAutoPilotContinuation(...args),
  setPiecePhaseProfiles: setPiecePhaseProfiles,
  shouldUseAutoPilotActiveFirstTouch: shouldUseAutoPilotActiveFirstTouch,
  teams: teams,
  ui: ui,
  getState: () => state,
});

const {
  getDefensiveAutopilotFocusPoint,
  getOffensiveAutopilotFocusPoint,
  isDefensiveAutopilotPlayer,
  isOffensiveAutopilotPlayer,
  isDefensiveDribblePresser,
  getLiveDefensiveDribblePressTarget,
  cloneDefensiveAutopilotIntents,
  getDefensiveAutoV2Intent,
  buildDefensiveAutoV2Intents,
  setReachableDefensiveAutoV2Target,
  applyDefensiveAutoV2BackLineRelationship,
  applyDefensiveAutoV2MidfieldPressCover,
  applyDefensiveAutoV2PressTether,
  applyDefensiveAutoV2AntiMagnetRelationships,
  applyDefensiveAutoV2RelationshipLayer,
  getDefensiveAutoV2FrameDt,
  moveDefensiveAutoV2Player,
  alignArrivedDefensiveAutopilotPlayers,
  completeLiveActionPlayersBeforeCommit,
  getActionSpeed,
  configureBallTravelProfile,
  getActionDistance,
  getRequestedActionMode,
  computeReachDistance,
  computeTimeToCoverDistance,
  shouldUseCurvedRecoveryRun,
  getCurvedRecoveryWaypoint,
  shouldUseOffBallCounterMovementRun,
  getOffBallCounterMovementWaypoint,
  buildMovementPath,
  getMovementPathPoint,
  getSnapshotPlayerMap,
  getRecordedStepEndSnapshot,
  getRecordedStepDuration,
  snapshotsMatch,
  createTransitionPlan,
  clampToCircle,
  getEditableRadius,
  getOtherTeamId,
  getPlannedPossessionTeamId,
  getDefendingDirectionSign,
  getDepthX,
  getDistanceFromOwnGoal,
  getOffensivePhaseKey,
  getOffensiveAutopilotProfile,
  getOffensiveRoleKey,
  getPitchLaneKey,
  getPitchLaneIndex,
  getAttackingThirdKey,
  getLaneCenterY,
  getSideLaneKeys,
  getRecentPossessionSteps,
  getRecordedStepPossessionTeamId,
  getPossessionRhythmContext,
  getLaneForSideSign,
  getWideOverlapPrincipleFit,
  getWideOverlapRunTarget,
  cloneOffensiveAutopilotIntents,
  cloneAutoV2DecisionTriggers,
  scanAutoV2DecisionTriggers,
  weightOffensiveAutoV2Intent,
  getOffensiveAutoV2Intent,
  setReachableOffensiveAutoV2Target,
  pickOffensiveAutoV2Player,
  applyOffensiveAutoV2RelationshipLayer,
  buildOffensiveAutoV2Intents,
  moveOffensiveAutoV2Player,
  getDefensivePhaseKey,
  getDefensiveAutopilotLineKey,
  getDefensiveAutopilotProfile,
  getDefensiveLineActionAdjustment,
  getDefensiveLineDistanceFromOwnGoal,
  getDefensiveLineX,
  getDefensiveLineWidth,
  getDefensiveLineCenterY,
  enforceDefensiveUnitCompactness,
  getDefensiveUnitGap,
  enforceDefensiveBlockGeometryLock,
  enforceDefensiveLineStaggering,
  enforceDefensiveLineChainSpacing,
  enforceDefensiveVerticalBlockConnections,
  enforceDefensiveMeasuredBlockEnvelope,
  enforceDefensiveCollectiveShiftCohesion,
  getDefensiveCompactLineIntegritySettings,
  enforceDefensiveCompactLineIntegrity,
  getDefensiveOffsideLineControlContext,
  enforceDefensiveOffsideLineControl,
  applyOffensiveAutopilotForCurrentAction,
  getDefensiveAutopilotGroupsForTeam,
  applyReachableDefensiveLineCohesion,
  applyDefensiveAutopilotForCurrentAction,
  applyAutopilotsForCurrentAction,
} = createGameSimulatorAutopilotLiveEngine({
  angleBetween: angleBetween,
  angleDifference: angleDifference,
  buildDefensiveAutopilotTargets: (...args) => buildDefensiveAutopilotTargets(...args),
  buildOffensiveAutopilotTargets: (...args) => buildOffensiveAutopilotTargets(...args),
  clamp: clamp,
  clampToPitch: clampToPitch,
  cloneVector: cloneVector,
  computePassLaneClarity: computePassLaneClarity,
  defensiveAutopilotProfiles: defensiveAutopilotProfiles,
  defensivePhaseProfiles: defensivePhaseProfiles,
  distance: distance,
  getActionInitiator: getActionInitiator,
  getActionOrigin: getActionOrigin,
  getActionSpaceValue: getActionSpaceValue,
  getAttackDirectionSign: getAttackDirectionSign,
  getAttackStyleRhythmProfile: getAttackStyleRhythmProfile,
  getAttackingGameSpaceProfile: getAttackingGameSpaceProfile,
  getAutoPilotRoleStrength: (...args) => getAutoPilotRoleStrength(...args),
  getBallNearSupportTriangleTarget: (...args) => getBallNearSupportTriangleTarget(...args),
  getCurrentActionDuration: getCurrentActionDuration,
  getDefensiveDribblePressTarget: (...args) => getDefensiveDribblePressTarget(...args),
  getDefensiveThreatResponse: (...args) => getDefensiveThreatResponse(...args),
  getDribblePressureReference: (...args) => getDribblePressureReference(...args),
  getFormationPositions: getFormationPositions,
  getKickoffDefensivePhaseKey: getKickoffDefensivePhaseKey,
  getOpponentPressureAtPoint: getOpponentPressureAtPoint,
  getOrientationTurnDelay: getOrientationTurnDelay,
  getOrientationMovementProfile: getOrientationMovementProfile,
  getPitchSurfacePreset: getPitchSurfacePreset,
  getPitchThreatProfile: getPitchThreatProfile,
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getPlayerById: getPlayerById,
  getPlayerDecisionContext: getPlayerDecisionContext,
  getPlayerFacingAngle: getPlayerFacingAngle,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getProjectedActionDuration: getProjectedActionDuration,
  getSecondLastOpponentLineX: getSecondLastOpponentLineX,
  getTeamAttackAngle: getTeamAttackAngle,
  getTeamAttackStyleKey: getTeamAttackStyleKey,
  getTeamAttackStyleProfile: getTeamAttackStyleProfile,
  getTeamDefenseStyleKey: getTeamDefenseStyleKey,
  getTeamDefenseStyleProfile: getTeamDefenseStyleProfile,
  getWeatherPreset: getWeatherPreset,
  getWideSideSign: (...args) => getWideSideSign(...args),
  hasBallAction: hasBallAction,
  isAerialFlightStyle: isAerialFlightStyle,
  isGoalkeeper: isGoalkeeper,
  lerp: lerp,
  logEvent: logEvent,
  materializeBallProfile: materializeBallProfile,
  moveTowards: moveTowards,
  normalize: normalize,
  normalizeAngle: normalizeAngle,
  offensiveAutopilotProfiles: offensiveAutopilotProfiles,
  offensivePhaseProfiles: offensivePhaseProfiles,
  pitch: pitch,
  resolveBallCurveDirection: resolveBallCurveDirection,
  rotatePlayerBodyAlongMovement: rotatePlayerBodyAlongMovement,
  rotatePlayerBodyToward: rotatePlayerBodyToward,
  teamRosterOrder: teamRosterOrder,
  teams: teams,
  uniquePrincipleLabels: (...args) => uniquePrincipleLabels(...args),
  updateActionPlayers: (...args) => updateActionPlayers(...args),
  getState: () => state,
});

const {
  getAutoPilotPossessionStartIndex,
  getAutoPilotStyleIntentSequence,
  resolvePossessionRouteLanes,
  resolveOpeningVariationLanes,
  getRecentAutoPilotPlanMemory,
  getAutoPilotPlanRepeatPenalty,
  rememberAutoPilotPossessionPlan,
  invalidateAutoPilotPossessionPlan,
  createAutoPilotPossessionRoute,
  createAutoPilotOpeningVariation,
  getAutoPilotPossessionRouteStage,
  createAutoPilotPossessionPlan,
  getAutoPilotPossessionPlan,
  getAutoPilotPossessionIntentContext,
  getAutoPilotPossessionIntentFit,
  getAutoPilotPossessionIntentAdjustment,
  getAutoPilotTempoPhaseContext,
  getAutoPilotTempoPhaseAdjustment,
  getAutoPilotRhythmGovernorAdjustment,
  getAutoPilotOpeningVariationAdjustment,
  getOpponentBlockReadProfile,
  getAutoPilotOpponentBlockReadAdjustment,
  isLastStepKickoffResetForTeam,
  getRecentLaneRepeatCount,
  isFrontLineRole,
  isSupportRole,
  getStepReceiverRoleKey,
  getAutoPilotFlowContext,
  getLastAutoPrincipleSet,
  principleSetIncludes,
  isTransitionAttackStyle,
  getSecurePossessionSnapshotForTeam,
  getAutoPilotRegainContext,
  getAutoPilotCandidatePattern,
  getRecordedStepPattern,
  getRecordedStepActorIds,
  getAutoPilotPossessionLoopAdjustment,
  getAutoPilotCorridorTempoReleaseAdjustment,
  getAutoPilotCombinationChainContext,
  getAutoPilotCombinationChainAdjustment,
  getAutoPilotPassLaneDenialAdjustment,
  getAutoPilotCounterPressEscapeAdjustment,
  getAutoPilotRecoveryFirstActionContext,
  getAutoPilotRecoveryFirstActionAdjustment,
  getAutoPilotPostRecoveryPhaseContext,
  getAutoPilotPostRecoveryPhaseAdjustment,
  getAutoPilotTransitionNumbersContext,
  getAutoPilotTransitionNumbersAdjustment,
  getAutoPilotPressureEscapeContext,
  buildAutoPilotPressureTrapEscapeCandidate,
  getAutoPilotPressureEscapeAdjustment,
  getAutoPilotPatternDiversityAdjustment,
  getAutoPilotRepetitionPenalty,
  getAutoPilotFlowAdjustment,
  getAutoPilotCarryEndProductContext,
  getAutoPilotCarryEndProductAdjustment,
  getAutoPilotSpacingBonus,
  mergeIntentionWeights,
  getAutoPilotIntentionModel,
  getAutoPilotCandidatePrincipleMetrics,
  getUniversalFootballDecisionAdjustment,
  getAutoPilotVisionScanAdjustment,
  scoreAutoPilotCandidateByIntentions,
  getAutoPilotStylePrincipleWeights,
  uniquePrincipleLabels,
  getAutoPilotPrincipleAdjustment,
  getAutoPilotLaneRealityAdjustment,
  getAutoPilotCandidateReceiver,
  getAutoPilotRoleResponsibilityAdjustment,
  getAutoPilotLocalSuperiorityProfile,
  getAutoPilotLocalSuperiorityAdjustment,
  getReceiverAvailabilityProfile,
  getAutoPilotReceiverAvailabilityAdjustment,
  getAutoPilotReceivePressureTrapAdjustment,
  estimateAutoPilotCandidateDuration,
  getNextSupportSlotRoleFit,
  getAutoPilotNextSupportNetworkProfile,
  getAutoPilotNextSupportNetworkAdjustment,
  getAutoPilotSpaceLadderContext,
  getAutoPilotSpaceLadderAdjustment,
  getAutoPilotAdvantageRetentionContext,
  getAutoPilotAdvantageRetentionAdjustment,
  getAutoPilotEndProductUrgencyContext,
  getAutoPilotEndProductUrgencyAdjustment,
  getAutoPilotChanceHierarchyContext,
  getAutoPilotChanceHierarchyAdjustment,
  getAutoPilotLineBreakAdvantageAdjustment,
  getAutoPilotAdvantageLifecycleContext,
  getAutoPilotAdvantageLifecycleAdjustment,
  getWideSideSign,
  isWidePrincipleZone,
} = createGameSimulatorAutopilotDecisionEngine({
  angleBetween: angleBetween,
  angleDifference: angleDifference,
  ballRadiusMeters: ballRadiusMeters,
  buildPlayerIntelligenceProfile: buildPlayerIntelligenceProfile,
  chooseScoredCandidateWithVariation: chooseScoredCandidateWithVariation,
  chooseWeightedOption: chooseWeightedOption,
  clamp: clamp,
  clampToPitch: clampToPitch,
  cloneVector: cloneVector,
  computePassLaneClarity: computePassLaneClarity,
  computeTimeToCoverDistance: (...args) => computeTimeToCoverDistance(...args),
  distance: distance,
  getActionSpaceValue: getActionSpaceValue,
  getActionThreatGain: getActionThreatGain,
  getAttackDirectionSign: getAttackDirectionSign,
  getAttackStyleRhythmProfile: getAttackStyleRhythmProfile,
  getAttackingDepth: getAttackingDepth,
  getAttackingGameSpaceProfile: getAttackingGameSpaceProfile,
  getAttackingThirdKey: getAttackingThirdKey,
  getAutoPilotRoleStrength: (...args) => getAutoPilotRoleStrength(...args),
  getCarryLaneOpenSpaceScore: getCarryLaneOpenSpaceScore,
  getCoverShadowInfluence: getCoverShadowInfluence,
  getForwardFacingSpaceTwoContext: getForwardFacingSpaceTwoContext,
  getForwardProgressionWindow: getForwardProgressionWindow,
  getLaneForSideSign: getLaneForSideSign,
  getNearestOpponentGap: getNearestOpponentGap,
  getNearestOpponentGapInCarryLane: getNearestOpponentGapInCarryLane,
  getNearestOpponentGapToPoint: getNearestOpponentGapToPoint,
  getOffensiveRoleKey: (...args) => getOffensiveRoleKey(...args),
  getOpponentDensityAtPoint: getOpponentDensityAtPoint,
  getOpponentGoalCenter: getOpponentGoalCenter,
  getOpponentLineDepthsForAttackingTeam: getOpponentLineDepthsForAttackingTeam,
  getOpponentPressureAtPoint: getOpponentPressureAtPoint,
  getOtherTeamId: (...args) => getOtherTeamId(...args),
  getPassLaneRiskProfile: getPassLaneRiskProfile,
  getPitchLaneIndex: (...args) => getPitchLaneIndex(...args),
  getPitchLaneKey: (...args) => getPitchLaneKey(...args),
  getPitchThreatProfile: getPitchThreatProfile,
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getPlayerById: getPlayerById,
  getPlayerDecisionContext: getPlayerDecisionContext,
  getPlayerFacingAngle: getPlayerFacingAngle,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getPlayerTendency: getPlayerTendency,
  getPossessionRhythmContext: (...args) => getPossessionRhythmContext(...args),
  getPotentialPassReceiverAtTarget: getPotentialPassReceiverAtTarget,
  getReceiveFootUsageScore: getReceiveFootUsageScore,
  getReceiveOrientationScore: getReceiveOrientationScore,
  getRecentPossessionSteps: (...args) => getRecentPossessionSteps(...args),
  getReceptionSupportTarget: (...args) => getReceptionSupportTarget(...args),
  getRecordedStepDuration: (...args) => getRecordedStepDuration(...args),
  getRecordedStepPossessionTeamId: (...args) => getRecordedStepPossessionTeamId(...args),
  getShotWindowProfile: getShotWindowProfile,
  getState: () => state,
  getTeamDensityAtPoint: getTeamDensityAtPoint,
  isGoalkeeper: isGoalkeeper,
  isPassReceiverOffside: isPassReceiverOffside,
  isPlayerFacingForward: isPlayerFacingForward,
  isWideChannel: isWideChannel,
  lerp: lerp,
  pitch: pitch,
  playerRadiusMeters: playerRadiusMeters,
  possessionRhythmDefaults: possessionRhythmDefaults,
  projectPointOnSegmentWithRatio: projectPointOnSegmentWithRatio,
  randomBetween: randomBetween,
  randomSign: randomSign,
  resolveBallActionProfile: resolveBallActionProfile,
  teams: teams,
});
const {
  getSameSideWideBacks,
  chooseWideOverlapRunner,
  getWideEntryPrincipleContext,
  getOffensiveActionPrinciple,
  getPlayerRoleModel,
  getOffensiveLaneY,
  shouldSkipOffensiveAutopilotPlayer,
  getOffensiveAutopilotTarget,
  chooseOffensiveAutopilotRunner,
  enforceOffensiveTargetSpacing,
  getOffensiveOnsideLineContext,
  enforceOffensiveOnsideLineAwareness,
  enforceOffensiveOccupationZones,
  getOffensiveStructureBalanceTarget,
  getStructureBalanceCandidates,
  enforceOffensiveStructureBalance,
  getFiveLaneOccupationSlotTarget,
  getFiveLaneOccupationCandidates,
  enforceOffensiveFiveLaneOccupation,
  getAutopilotTargetVariationRadius,
  applyAutopilotTargetVariation,
  getMovableAutopilotPlayerByRoles,
  getMovableAutopilotPlayerByRolesOnSide,
  setAutopilotPrincipleTarget,
  getSupportUnderBallTarget,
  getThirdManRunnerTarget,
  getBoxOccupationTarget,
  getShotReboundGeometryContext,
  getShotReboundTarget,
  applyShotReboundPrincipleTargets,
  getSecondBallAnticipationContext,
  getOffensiveSecondBallAnticipationTarget,
  applyOffensiveSecondBallAnticipationTargets,
  applyCornerDeliveryPrincipleTargets,
  getGoalkeeperBuildOutSupportTarget,
  applyGoalkeeperBuildOutPrincipleTargets,
  applyBoxOccupationPrincipleTargets,
  getTimedBoxArrivalContext,
  getTimedBoxArrivalTarget,
  chooseTimedBoxArrivalPlayer,
  applyTimedFinalThirdBoxArrivals,
  getAttackingBoxOccupationChainContext,
  getAttackingBoxOccupationChainTarget,
  applyAttackingBoxOccupationChainTargets,
  getTransitionAttackTarget,
  applyTransitionAttackPrincipleTargets,
  applyBetweenLinesPrincipleTargets,
  getReceptionSupportTarget,
  applyReceptionSupportPrincipleTargets,
  getOpenGrassCarrySupportTarget,
  applyOpenGrassCarrySupportTargets,
  getBallNearSupportTriangleTarget,
  applyBallNearSupportTriangleTargets,
  getTargetLocalSuperiorityProfile,
  getLocalSuperioritySupportTarget,
  applyLocalSuperioritySupportTargets,
  getOffensivePassingGeometryContext,
  getOffensivePassingGeometryTarget,
  applyOffensivePassingGeometryTargets,
  getLooseBallRecoverySupportTarget,
  applyLooseBallRecoverySupportTargets,
  getPostRecoveryAttackSupportContext,
  getPostRecoveryAttackSupportTarget,
  applyPostRecoveryAttackSupportTargets,
  getOffensiveRestDefenceNetContext,
  getOffensiveRestDefenceNetTarget,
  applyOffensiveRestDefenceNetTargets,
  getPressResistanceEscapeTarget,
  applyPressResistanceEscapeSupportTargets,
  getPressEscapeContinuationTarget,
  applyPressEscapeContinuationTargets,
  getSwitchLandingAttackContext,
  getSwitchLandingAttackTarget,
  applySwitchLandingAttackTargets,
  getBlindsideChannelRunContext,
  getBlindsideChannelRunTarget,
  chooseBlindsideChannelRunner,
  applyBlindsideChannelRunTargets,
  getPasserContinuationTarget,
  applyPasserContinuationTargets,
  applyThirdManChainSupportTargets,
  getSpaceTwoForwardFacingTarget,
  applySpaceTwoForwardFacingTargets,
  getSpaceTwoContinuationContext,
  getSpaceTwoContinuationTarget,
  applySpaceTwoContinuationTargets,
  getDepthPoint,
  applyGenerativePrincipleSupportTargets,
  getHighValueAttackTarget,
  applyHighValueSpacePrincipleTargets,
  getFormationIdentityTarget,
  applyFormationIdentityPrincipleTargets,
  getPossessionRouteOccupationTarget,
  applyPossessionRoutePrincipleTargets,
  getPositionalPlayOccupationTarget,
  applyPositionalPlayOccupationTargets,
  getOpponentBlockOccupationTarget,
  applyOpponentBlockResponsiveTargets,
  getGameSpaceOffBallTarget,
  applyGameSpaceOffBallPrincipleTargets,
} = createGameSimulatorAutopilotOffballTargets({
  addPointNoise: addPointNoise,
  clamp: clamp,
  clampToPitch: clampToPitch,
  cloneVector: cloneVector,
  computeTimeToCoverDistance: (...args) => computeTimeToCoverDistance(...args),
  distance: distance,
  gameRoleProfiles: gameRoleProfiles,
  getActionSpaceValue: getActionSpaceValue,
  getAttackDirectionSign: getAttackDirectionSign,
  getAttackingDepth: getAttackingDepth,
  getAttackingGameSpaceProfile: getAttackingGameSpaceProfile,
  getAutoPilotPossessionPlan: getAutoPilotPossessionPlan,
  getAutoPilotPossessionRouteStage: getAutoPilotPossessionRouteStage,
  getAutoPilotRoleStrength: (...args) => getAutoPilotRoleStrength(...args),
  getCarryLaneOpenSpaceScore: getCarryLaneOpenSpaceScore,
  getDefensiveAutopilotLineKey: (...args) => getDefensiveAutopilotLineKey(...args),
  getDepthX: getDepthX,
  getFormationPositions: getFormationPositions,
  getLaneCenterY: getLaneCenterY,
  getNearestOpponentGapInCarryLane: getNearestOpponentGapInCarryLane,
  getNearestOpponentGapToPoint: getNearestOpponentGapToPoint,
  getOffensiveAutopilotProfile: (...args) => getOffensiveAutopilotProfile(...args),
  getOffensivePhaseKey: getOffensivePhaseKey,
  getOffensiveRoleKey: (...args) => getOffensiveRoleKey(...args),
  getOpponentBlockReadProfile: getOpponentBlockReadProfile,
  getOpponentGoalCenter: getOpponentGoalCenter,
  getOpponentLineDepthsForAttackingTeam: getOpponentLineDepthsForAttackingTeam,
  getOpponentPenaltySpot: getOpponentPenaltySpot,
  getOpponentPressureAtPoint: getOpponentPressureAtPoint,
  getPitchLaneIndex: (...args) => getPitchLaneIndex(...args),
  getPitchLaneKey: (...args) => getPitchLaneKey(...args),
  getPitchSpaceProfile: getPitchSpaceProfile,
  getPitchThreatProfile: getPitchThreatProfile,
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getPlayerById: getPlayerById,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getPlayerTendency: getPlayerTendency,
  getPossessionRhythmContext: (...args) => getPossessionRhythmContext(...args),
  getRecordedStepDuration: (...args) => getRecordedStepDuration(...args),
  getRecordedStepPattern: getRecordedStepPattern,
  getRecordedStepPossessionTeamId: (...args) => getRecordedStepPossessionTeamId(...args),
  getSecondLastOpponentLineX: getSecondLastOpponentLineX,
  getSecurePossessionSnapshotForTeam: getSecurePossessionSnapshotForTeam,
  getShotWindowProfile: getShotWindowProfile,
  getSideLaneKeys: (...args) => getSideLaneKeys(...args),
  getState: () => state,
  getWideOverlapPrincipleFit: (...args) => getWideOverlapPrincipleFit(...args),
  getWideOverlapRunTarget: (...args) => getWideOverlapRunTarget(...args),
  getWideSideSign: getWideSideSign,
  isAerialFlightStyle: isAerialFlightStyle,
  isFrontLineRole: isFrontLineRole,
  isGoalkeeper: isGoalkeeper,
  isTransitionAttackStyle: isTransitionAttackStyle,
  isWideChannel: isWideChannel,
  isWidePrincipleZone: isWidePrincipleZone,
  lerp: lerp,
  pitch: pitch,
  resolveBallActionProfile: resolveBallActionProfile,
  teamRosterOrder: teamRosterOrder,
  teams: teams,
  uniquePrincipleLabels: uniquePrincipleLabels,
});
const {
  getAutoPilotShotTarget,
  getAutoPilotBoxTarget,
  getCornerDeliveryTarget,
  chooseCornerDeliveryRunner,
  getFreeKickDeliveryTarget,
  chooseFreeKickShortReceiver,
  getAutoPilotDribbleTarget,
  getTeamSupportCountAroundPoint,
  getGoalkeeperDistributionPressure,
  getGoalkeeperDirectReleaseTarget,
  buildAutoPilotGoalkeeperDistributionCandidate,
  buildAutoPilotShotCandidate,
  buildAutoPilotKickoffCandidate,
  getLastKickoffOpeningProfile,
  getKickoffOpeningCandidateFit,
  buildAutoPilotPostKickoffResetCandidate,
  buildAutoPilotCornerCandidate,
  buildAutoPilotThrowInCandidate,
  buildAutoPilotPenaltyCandidate,
  buildAutoPilotFreeKickCandidate,
  buildAutoPilotRegainReleaseCandidate,
  getPressedRegainExitVector,
  buildAutoPilotPressedRegainExitCandidate,
  buildAutoPilotDangerZoneEscapeCandidate,
  buildAutoPilotBoxDeliveryCandidate,
  getFinalThirdCombinationVariants,
  buildAutoPilotFinalThirdCombinationCandidate,
  buildAutoPilotWideOverlapCandidate,
  getLastSwitchLandingActionContext,
  buildAutoPilotSwitchLandingContinuationCandidate,
  buildAutoPilotThroughBallCandidate,
  buildAutoPilotBetweenLinesCandidate,
  buildAutoPilotPassCandidates,
  buildAutoPilotDribbleCandidate,
} = createGameSimulatorAutopilotCandidates({
  angleBetween: angleBetween,
  chooseScoredCandidateWithVariation: chooseScoredCandidateWithVariation,
  chooseWideOverlapRunner: chooseWideOverlapRunner,
  clamp: clamp,
  clampToPitch: clampToPitch,
  computePassLaneClarity: computePassLaneClarity,
  computeTimeToCoverDistance: (...args) => computeTimeToCoverDistance(...args),
  distance: distance,
  getActionSpaceValue: getActionSpaceValue,
  getActionThreatGain: getActionThreatGain,
  getAttackDirectionSign: getAttackDirectionSign,
  getAttackingDepth: getAttackingDepth,
  getAutoPilotCarryEndProductContext: getAutoPilotCarryEndProductContext,
  getAutoPilotFlowContext: getAutoPilotFlowContext,
  getAutoPilotRegainContext: getAutoPilotRegainContext,
  getAutoPilotRoleStrength: (...args) => getAutoPilotRoleStrength(...args),
  getBreakawayCarryTarget: getBreakawayCarryTarget,
  getCarryLaneOpenSpaceScore: getCarryLaneOpenSpaceScore,
  getCarryRunwayProfile: getCarryRunwayProfile,
  getDepthPoint: getDepthPoint,
  getDepthX: getDepthX,
  getDistanceFromOwnGoal: (...args) => getDistanceFromOwnGoal(...args),
  getFootUsageScore: getFootUsageScore,
  getForwardFacingSpaceTwoContext: getForwardFacingSpaceTwoContext,
  getForwardProgressionWindow: getForwardProgressionWindow,
  getGoalMouthTarget: getGoalMouthTarget,
  getGoalkeeperTargetOpenness: getGoalkeeperTargetOpenness,
  getHighValueAttackTarget: getHighValueAttackTarget,
  getKickoffSupportId: getKickoffSupportId,
  getNearestOpponentGapInCarryLane: getNearestOpponentGapInCarryLane,
  getOffensiveAutopilotProfile: (...args) => getOffensiveAutopilotProfile(...args),
  getOffensiveRoleKey: (...args) => getOffensiveRoleKey(...args),
  getOpenGrassCarryContext: getOpenGrassCarryContext,
  getOpponentGoalCenter: getOpponentGoalCenter,
  getOpponentPenaltySpot: getOpponentPenaltySpot,
  getOpponentPressureAtPoint: getOpponentPressureAtPoint,
  getPitchLaneIndex: (...args) => getPitchLaneIndex(...args),
  getPitchLaneKey: (...args) => getPitchLaneKey(...args),
  getPitchThreatProfile: getPitchThreatProfile,
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getPlayerById: getPlayerById,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getPlayerTendency: getPlayerTendency,
  getPossessionRhythmContext: (...args) => getPossessionRhythmContext(...args),
  getRecentPossessionSteps: (...args) => getRecentPossessionSteps(...args),
  getRecordedStepDuration: (...args) => getRecordedStepDuration(...args),
  getRunwayCarryTarget: getRunwayCarryTarget,
  getShotAngleQuality: getShotAngleQuality,
  getShotWindowProfile: getShotWindowProfile,
  getState: () => state,
  getSwitchLandingAttackTarget: getSwitchLandingAttackTarget,
  getWideEntryPrincipleContext: getWideEntryPrincipleContext,
  getWideSideSign: getWideSideSign,
  isBylineZone: isBylineZone,
  isGoalkeeper: isGoalkeeper,
  isInsideOpponentBox: isInsideOpponentBox,
  isInsideOwnBox: isInsideOwnBox,
  isLastStepKickoffResetForTeam: isLastStepKickoffResetForTeam,
  isPassReceiverOffside: isPassReceiverOffside,
  isTransitionAttackStyle: isTransitionAttackStyle,
  isWideChannel: isWideChannel,
  isWidePrincipleZone: isWidePrincipleZone,
  kickoffOpeningProfiles: kickoffOpeningProfiles,
  lerp: lerp,
  normalize: normalize,
  pitch: pitch,
  resolveBallActionProfile: resolveBallActionProfile,
  resolveShotTarget: resolveShotTarget,
  teams: teams,
  uniquePrincipleLabels: uniquePrincipleLabels,
  win: win,
});
const {
  getDefensiveBackLineHandoverContext,
  applyDefensiveBackLineHandoverTargets,
  getDefensiveLineActionLabels,
  getDefensiveGoalkeeperTarget,
  getDefensiveGoalkeeperSweeperContext,
  applyDefensiveGoalkeeperSweeperTarget,
  getDefensiveGoalkeeperShotSetContext,
  getDefensiveGoalkeeperShotSetTarget,
  applyDefensiveGoalkeeperShotSetTarget,
  chooseDefensiveAutopilotPresser,
  getDefensivePressTarget,
  getDefensiveAngledPressTarget,
  applyDefensivePresserAngleTarget,
  getGoalkeeperBuildOutPressContext,
  pickDefensiveAutopilotPlayer,
  getGoalkeeperBuildOutPressTarget,
  applyGoalkeeperBuildOutPressTargets,
  getDefensiveThreatResponse,
  getDefensivePrioritySpacePoint,
  pickDefensiveProtectionPlayer,
  applyDefensivePrioritySpaceProtectionTargets,
  getDefensiveCornerContext,
  getDefensiveCornerTarget,
  applyDefensiveCornerSetPieceTargets,
  getRestartActionMeta,
  getDefensiveFreeKickContext,
  getFreeKickWallTarget,
  getDefensiveFreeKickTarget,
  applyDefensiveFreeKickSetPieceTargets,
  getDefensivePenaltyContext,
  getDefensivePenaltyTarget,
  applyDefensivePenaltySetPieceTargets,
  getDefensiveThrowInContext,
  getDefensiveThrowInTarget,
  applyDefensiveThrowInSetPieceTargets,
  getNegativeTransitionContext,
  getNegativeTransitionTarget,
  getNegativeTransitionOutletOptions,
  applyNegativeTransitionDefensiveTargets,
  getDefensiveLooseBallRecoveryTrapContext,
  getDefensiveLooseBallRecoveryTrapTarget,
  applyDefensiveLooseBallRecoveryTrapTargets,
  getDefensiveOpenPlayTriggerContext,
  getDefensiveOpenPlayTriggerTarget,
  applyDefensiveOpenPlayTriggerTargets,
  getDefensiveReceptionTrapContext,
  getDefensiveReceptionTrapTarget,
  applyDefensiveReceptionTrapTargets,
  getDefensiveReceiveContinuationNextPoint,
  getDefensiveReceiveContinuationContext,
  getDefensiveReceiveContinuationTarget,
  applyDefensiveReceiveContinuationTargets,
  getDefensiveRouteAnticipationContext,
  getDefensiveRouteAnticipationTarget,
  applyDefensiveRouteAnticipationTargets,
  getDefensiveSwitchRecoveryContext,
  getDefensiveSwitchRecoveryTarget,
  applyDefensiveSwitchRecoveryTargets,
  getDefensiveSwitchLandingLockContext,
  getDefensiveSwitchLandingLockTarget,
  applyDefensiveSwitchLandingLockTargets,
  getDefensiveGameSpaceResponseContext,
  getDefensiveGameSpaceResponseTarget,
  applyDefensiveGameSpaceResponseTargets,
  getDefensiveRunnerThreats,
  getDefensiveRunnerTrackingTarget,
  applyDefensiveRunnerTrackingTargets,
  getDribblePressureReference,
  chooseDefensiveDribblePresser,
  getDefensiveDribblePressTarget,
  getDefensiveCarryContainmentContext,
  getDefensiveCarryContainmentTarget,
  applyDefensiveCarryContainmentTargets,
  getDefensivePressureCoverContext,
  getDefensivePressureCoverTarget,
  applyDefensivePressureCoverBalanceTargets,
  getDefensivePressChainSupportContext,
  getDefensivePressChainSupportTarget,
  applyDefensivePressChainSupportTargets,
  getActualLocalSuperiorityProfile,
  getDefensiveLocalOverloadContext,
  getDefensiveLocalOverloadTarget,
  applyDefensiveLocalOverloadResponseTargets,
  getDefensivePostRecoveryResponseContext,
  getDefensivePostRecoveryResponseTarget,
  getDefensivePostRecoveryOutletOptions,
  applyDefensivePostRecoveryResponseTargets,
  getDefensivePassLaneDenialContext,
  getDefensivePassLaneDenialTarget,
  applyDefensivePassLaneDenialTargets,
  getDefensiveCentralAccessGateContext,
  getDefensiveCentralAccessGateTarget,
  applyDefensiveCentralAccessGateTargets,
  getDefensiveChanceDenialContext,
  getDefensiveChanceDenialTarget,
  applyDefensiveChanceDenialTargets,
  getDefensiveBoxDeliveryChainContext,
  getDefensiveBoxDeliveryChainTarget,
  applyDefensiveBoxDeliveryChainTargets,
  getDefensiveLineBreakAdvantageContext,
  getDefensiveLineBreakAdvantageTarget,
  applyDefensiveLineBreakAdvantageCollapseTargets,
  getDefensiveEmergencyCoverContext,
  getDefensiveEmergencyCoverTarget,
  applyDefensiveEmergencyCoverTargets,
  getDefensiveSecondBallAnticipationTarget,
  applyDefensiveSecondBallAnticipationTargets,
} = createGameSimulatorAutopilotDefensiveTargets({
  clamp: clamp,
  clampToPitch: clampToPitch,
  cloneRestartPhase: cloneRestartPhase,
  cloneVector: cloneVector,
  computePassLaneClarity: computePassLaneClarity,
  computeTimeToCoverDistance: (...args) => computeTimeToCoverDistance(...args),
  distance: distance,
  getActionSpaceValue: getActionSpaceValue,
  getAttackDirectionSign: getAttackDirectionSign,
  getAttackingDepth: getAttackingDepth,
  getAttackingGameSpaceProfile: getAttackingGameSpaceProfile,
  getAutoPilotPossessionRouteStage: getAutoPilotPossessionRouteStage,
  getAutoPilotShotTarget: getAutoPilotShotTarget,
  getBallTravelProgress: getBallTravelProgress,
  getCornerKickSpot: getCornerKickSpot,
  getDefendingDirectionSign: getDefendingDirectionSign,
  getDefensiveAutopilotLineKey: (...args) => getDefensiveAutopilotLineKey(...args),
  getDefensiveAutopilotProfile: getDefensiveAutopilotProfile,
  getDefensiveLineDistanceFromOwnGoal: (...args) => getDefensiveLineDistanceFromOwnGoal(...args),
  getDefensiveUnitGap: (...args) => getDefensiveUnitGap(...args),
  getDepthX: getDepthX,
  getDistanceFromOwnGoal: (...args) => getDistanceFromOwnGoal(...args),
  getLaneCenterY: getLaneCenterY,
  getOffensiveAutopilotProfile: (...args) => getOffensiveAutopilotProfile(...args),
  getOffensiveRoleKey: (...args) => getOffensiveRoleKey(...args),
  getOpponentGoalCenter: getOpponentGoalCenter,
  getOpponentPenaltySpot: getOpponentPenaltySpot,
  getOpponentPressureAtPoint: getOpponentPressureAtPoint,
  getOtherTeamId: (...args) => getOtherTeamId(...args),
  getOwnGoalCenter: getOwnGoalCenter,
  getPitchLaneIndex: (...args) => getPitchLaneIndex(...args),
  getPitchLaneKey: (...args) => getPitchLaneKey(...args),
  getPitchThreatProfile: getPitchThreatProfile,
  getPlannedPossessionTeamId: (...args) => getPlannedPossessionTeamId(...args),
  getPlayerById: getPlayerById,
  getPlayerDecisionContext: getPlayerDecisionContext,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getPossessionRhythmContext: (...args) => getPossessionRhythmContext(...args),
  getRecentPossessionSteps: (...args) => getRecentPossessionSteps(...args),
  getRecordedStepDuration: (...args) => getRecordedStepDuration(...args),
  getRecordedStepPattern: getRecordedStepPattern,
  getRecordedStepPossessionTeamId: (...args) => getRecordedStepPossessionTeamId(...args),
  getSecondBallAnticipationContext: getSecondBallAnticipationContext,
  getShotAngleQuality: getShotAngleQuality,
  getShotWindowProfile: getShotWindowProfile,
  getSnapshotPlayerMap: getSnapshotPlayerMap,
  getTeamDefenseStyleKey: getTeamDefenseStyleKey,
  getTeamDefenseStyleProfile: getTeamDefenseStyleProfile,
  getTeamSupportCountAroundPoint: getTeamSupportCountAroundPoint,
  getWideSideSign: getWideSideSign,
  isAerialFlightStyle: isAerialFlightStyle,
  isGoalkeeper: isGoalkeeper,
  isTransitionAttackStyle: isTransitionAttackStyle,
  isWideChannel: isWideChannel,
  isWidePrincipleZone: isWidePrincipleZone,
  lerp: lerp,
  moveTowards: moveTowards,
  normalize: normalize,
  pitch: pitch,
  playerRadiusMeters: playerRadiusMeters,
  projectPointOnSegmentWithRatio: projectPointOnSegmentWithRatio,
  teams: teams,
  uniquePrincipleLabels: uniquePrincipleLabels,
  vec: vec,
  getState: () => state,
});

const {
  buildOffensiveAutopilotTargets,
  buildDefensiveAutopilotTargets,
  chooseAutoPilotNextAction,
} = createGameSimulatorAutopilotTargets({
  applyAttackingBoxOccupationChainTargets: applyAttackingBoxOccupationChainTargets,
  applyAutopilotTargetVariation: applyAutopilotTargetVariation,
  applyBallNearSupportTriangleTargets: applyBallNearSupportTriangleTargets,
  applyBlindsideChannelRunTargets: applyBlindsideChannelRunTargets,
  applyDefensiveBackLineHandoverTargets: applyDefensiveBackLineHandoverTargets,
  applyDefensiveBoxDeliveryChainTargets: applyDefensiveBoxDeliveryChainTargets,
  applyDefensiveCarryContainmentTargets: applyDefensiveCarryContainmentTargets,
  applyDefensiveCentralAccessGateTargets: applyDefensiveCentralAccessGateTargets,
  applyDefensiveChanceDenialTargets: applyDefensiveChanceDenialTargets,
  applyDefensiveCornerSetPieceTargets: applyDefensiveCornerSetPieceTargets,
  applyDefensiveEmergencyCoverTargets: applyDefensiveEmergencyCoverTargets,
  applyDefensiveFreeKickSetPieceTargets: applyDefensiveFreeKickSetPieceTargets,
  applyDefensiveGameSpaceResponseTargets: applyDefensiveGameSpaceResponseTargets,
  applyDefensiveGoalkeeperShotSetTarget: applyDefensiveGoalkeeperShotSetTarget,
  applyDefensiveGoalkeeperSweeperTarget: applyDefensiveGoalkeeperSweeperTarget,
  applyDefensiveLineBreakAdvantageCollapseTargets: applyDefensiveLineBreakAdvantageCollapseTargets,
  applyDefensiveLocalOverloadResponseTargets: applyDefensiveLocalOverloadResponseTargets,
  applyDefensiveLooseBallRecoveryTrapTargets: applyDefensiveLooseBallRecoveryTrapTargets,
  applyDefensiveOpenPlayTriggerTargets: applyDefensiveOpenPlayTriggerTargets,
  applyDefensivePassLaneDenialTargets: applyDefensivePassLaneDenialTargets,
  applyDefensivePenaltySetPieceTargets: applyDefensivePenaltySetPieceTargets,
  applyDefensivePostRecoveryResponseTargets: applyDefensivePostRecoveryResponseTargets,
  applyDefensivePressChainSupportTargets: applyDefensivePressChainSupportTargets,
  applyDefensivePresserAngleTarget: applyDefensivePresserAngleTarget,
  applyDefensivePressureCoverBalanceTargets: applyDefensivePressureCoverBalanceTargets,
  applyDefensivePrioritySpaceProtectionTargets: applyDefensivePrioritySpaceProtectionTargets,
  applyDefensiveReceiveContinuationTargets: applyDefensiveReceiveContinuationTargets,
  applyDefensiveReceptionTrapTargets: applyDefensiveReceptionTrapTargets,
  applyDefensiveRouteAnticipationTargets: applyDefensiveRouteAnticipationTargets,
  applyDefensiveRunnerTrackingTargets: applyDefensiveRunnerTrackingTargets,
  applyDefensiveSecondBallAnticipationTargets: applyDefensiveSecondBallAnticipationTargets,
  applyDefensiveSwitchLandingLockTargets: applyDefensiveSwitchLandingLockTargets,
  applyDefensiveSwitchRecoveryTargets: applyDefensiveSwitchRecoveryTargets,
  applyDefensiveThrowInSetPieceTargets: applyDefensiveThrowInSetPieceTargets,
  applyGenerativePrincipleSupportTargets: applyGenerativePrincipleSupportTargets,
  applyGoalkeeperBuildOutPressTargets: applyGoalkeeperBuildOutPressTargets,
  applyLocalSuperioritySupportTargets: applyLocalSuperioritySupportTargets,
  applyLooseBallRecoverySupportTargets: applyLooseBallRecoverySupportTargets,
  applyNegativeTransitionDefensiveTargets: applyNegativeTransitionDefensiveTargets,
  applyOffensivePassingGeometryTargets: applyOffensivePassingGeometryTargets,
  applyOffensiveRestDefenceNetTargets: applyOffensiveRestDefenceNetTargets,
  applyOffensiveSecondBallAnticipationTargets: applyOffensiveSecondBallAnticipationTargets,
  applyPasserContinuationTargets: applyPasserContinuationTargets,
  applyPostRecoveryAttackSupportTargets: applyPostRecoveryAttackSupportTargets,
  applyPressEscapeContinuationTargets: applyPressEscapeContinuationTargets,
  applyPressResistanceEscapeSupportTargets: applyPressResistanceEscapeSupportTargets,
  applySpaceTwoContinuationTargets: applySpaceTwoContinuationTargets,
  applySpaceTwoForwardFacingTargets: applySpaceTwoForwardFacingTargets,
  applySwitchLandingAttackTargets: applySwitchLandingAttackTargets,
  applyThirdManChainSupportTargets: applyThirdManChainSupportTargets,
  applyTimedFinalThirdBoxArrivals: applyTimedFinalThirdBoxArrivals,
  buildAutoPilotBetweenLinesCandidate: buildAutoPilotBetweenLinesCandidate,
  buildAutoPilotBoxDeliveryCandidate: buildAutoPilotBoxDeliveryCandidate,
  buildAutoPilotCornerCandidate: buildAutoPilotCornerCandidate,
  buildAutoPilotDangerZoneEscapeCandidate: buildAutoPilotDangerZoneEscapeCandidate,
  buildAutoPilotDribbleCandidate: buildAutoPilotDribbleCandidate,
  buildAutoPilotFinalThirdCombinationCandidate: buildAutoPilotFinalThirdCombinationCandidate,
  buildAutoPilotFreeKickCandidate: buildAutoPilotFreeKickCandidate,
  buildAutoPilotGoalkeeperDistributionCandidate: buildAutoPilotGoalkeeperDistributionCandidate,
  buildAutoPilotKickoffCandidate: buildAutoPilotKickoffCandidate,
  buildAutoPilotPassCandidates: buildAutoPilotPassCandidates,
  buildAutoPilotPenaltyCandidate: buildAutoPilotPenaltyCandidate,
  buildAutoPilotPostKickoffResetCandidate: buildAutoPilotPostKickoffResetCandidate,
  buildAutoPilotPressedRegainExitCandidate: buildAutoPilotPressedRegainExitCandidate,
  buildAutoPilotPressureTrapEscapeCandidate: buildAutoPilotPressureTrapEscapeCandidate,
  buildAutoPilotReceiveContinuationCandidate: buildAutoPilotReceiveContinuationCandidate,
  buildAutoPilotRegainReleaseCandidate: buildAutoPilotRegainReleaseCandidate,
  buildAutoPilotShotCandidate: buildAutoPilotShotCandidate,
  buildAutoPilotSwitchLandingContinuationCandidate: buildAutoPilotSwitchLandingContinuationCandidate,
  buildAutoPilotThroughBallCandidate: buildAutoPilotThroughBallCandidate,
  buildAutoPilotThrowInCandidate: buildAutoPilotThrowInCandidate,
  buildAutoPilotWideOverlapCandidate: buildAutoPilotWideOverlapCandidate,
  chooseDefensiveAutopilotPresser: chooseDefensiveAutopilotPresser,
  chooseDefensiveDribblePresser: chooseDefensiveDribblePresser,
  chooseOffensiveAutopilotRunner: chooseOffensiveAutopilotRunner,
  chooseScoredCandidateWithVariation: chooseScoredCandidateWithVariation,
  clamp: clamp,
  clampToPitch: clampToPitch,
  cloneVector: cloneVector,
  enforceDefensiveBlockGeometryLock: (...args) => enforceDefensiveBlockGeometryLock(...args),
  enforceDefensiveCollectiveShiftCohesion: (...args) => enforceDefensiveCollectiveShiftCohesion(...args),
  enforceDefensiveCompactLineIntegrity: (...args) => enforceDefensiveCompactLineIntegrity(...args),
  enforceDefensiveLineChainSpacing: (...args) => enforceDefensiveLineChainSpacing(...args),
  enforceDefensiveLineStaggering: (...args) => enforceDefensiveLineStaggering(...args),
  enforceDefensiveMeasuredBlockEnvelope: (...args) => enforceDefensiveMeasuredBlockEnvelope(...args),
  enforceDefensiveOffsideLineControl: (...args) => enforceDefensiveOffsideLineControl(...args),
  enforceDefensiveUnitCompactness: enforceDefensiveUnitCompactness,
  enforceDefensiveVerticalBlockConnections: (...args) => enforceDefensiveVerticalBlockConnections(...args),
  enforceOffensiveFiveLaneOccupation: enforceOffensiveFiveLaneOccupation,
  enforceOffensiveOccupationZones: enforceOffensiveOccupationZones,
  enforceOffensiveOnsideLineAwareness: enforceOffensiveOnsideLineAwareness,
  enforceOffensiveStructureBalance: enforceOffensiveStructureBalance,
  enforceOffensiveTargetSpacing: enforceOffensiveTargetSpacing,
  getAutoPilotAdvantageLifecycleAdjustment: getAutoPilotAdvantageLifecycleAdjustment,
  getAutoPilotAdvantageRetentionAdjustment: getAutoPilotAdvantageRetentionAdjustment,
  getAutoPilotCarryEndProductAdjustment: getAutoPilotCarryEndProductAdjustment,
  getAutoPilotChanceHierarchyAdjustment: getAutoPilotChanceHierarchyAdjustment,
  getAutoPilotCombinationChainAdjustment: getAutoPilotCombinationChainAdjustment,
  getAutoPilotCorridorTempoReleaseAdjustment: getAutoPilotCorridorTempoReleaseAdjustment,
  getAutoPilotCounterPressEscapeAdjustment: getAutoPilotCounterPressEscapeAdjustment,
  getAutoPilotEndProductUrgencyAdjustment: getAutoPilotEndProductUrgencyAdjustment,
  getAutoPilotFirstActionAfterReceiveAdjustment: getAutoPilotFirstActionAfterReceiveAdjustment,
  getAutoPilotFlowAdjustment: getAutoPilotFlowAdjustment,
  getAutoPilotGameSpaceAdjustment: getAutoPilotGameSpaceAdjustment,
  getAutoPilotLaneRealityAdjustment: getAutoPilotLaneRealityAdjustment,
  getAutoPilotLineBreakAdvantageAdjustment: getAutoPilotLineBreakAdvantageAdjustment,
  getAutoPilotLocalSuperiorityAdjustment: getAutoPilotLocalSuperiorityAdjustment,
  getAutoPilotNextSupportNetworkAdjustment: getAutoPilotNextSupportNetworkAdjustment,
  getAutoPilotOpeningVariationAdjustment: getAutoPilotOpeningVariationAdjustment,
  getAutoPilotOpponentBlockReadAdjustment: getAutoPilotOpponentBlockReadAdjustment,
  getAutoPilotPassLaneDenialAdjustment: getAutoPilotPassLaneDenialAdjustment,
  getAutoPilotPatternDiversityAdjustment: getAutoPilotPatternDiversityAdjustment,
  getAutoPilotPossessionIntentAdjustment: getAutoPilotPossessionIntentAdjustment,
  getAutoPilotPossessionLoopAdjustment: getAutoPilotPossessionLoopAdjustment,
  getAutoPilotPossessionPlayer: (...args) => getAutoPilotPossessionPlayer(...args),
  getAutoPilotPostRecoveryPhaseAdjustment: getAutoPilotPostRecoveryPhaseAdjustment,
  getAutoPilotPressureEscapeAdjustment: getAutoPilotPressureEscapeAdjustment,
  getAutoPilotPrincipleAdjustment: getAutoPilotPrincipleAdjustment,
  getAutoPilotReceiveFlowAdjustment: getAutoPilotReceiveFlowAdjustment,
  getAutoPilotReceiveMomentumAdjustment: getAutoPilotReceiveMomentumAdjustment,
  getAutoPilotReceivePressureTrapAdjustment: getAutoPilotReceivePressureTrapAdjustment,
  getAutoPilotReceiverAvailabilityAdjustment: getAutoPilotReceiverAvailabilityAdjustment,
  getAutoPilotRecoveryFirstActionAdjustment: getAutoPilotRecoveryFirstActionAdjustment,
  getAutoPilotRepetitionPenalty: getAutoPilotRepetitionPenalty,
  getAutoPilotRhythmGovernorAdjustment: getAutoPilotRhythmGovernorAdjustment,
  getAutoPilotRoleResponsibilityAdjustment: getAutoPilotRoleResponsibilityAdjustment,
  getAutoPilotSpaceDominanceAdjustment: getAutoPilotSpaceDominanceAdjustment,
  getAutoPilotSpaceLadderAdjustment: getAutoPilotSpaceLadderAdjustment,
  getAutoPilotSpaceTwoAdvantageAdjustment: getAutoPilotSpaceTwoAdvantageAdjustment,
  getAutoPilotSpacingBonus: getAutoPilotSpacingBonus,
  getAutoPilotSpatialDecisionAdjustment: getAutoPilotSpatialDecisionAdjustment,
  getAutoPilotTempoPhaseAdjustment: getAutoPilotTempoPhaseAdjustment,
  getAutoPilotTransitionNumbersAdjustment: getAutoPilotTransitionNumbersAdjustment,
  getAutoPilotVisionScanAdjustment: getAutoPilotVisionScanAdjustment,
  getDefensiveAutopilotLineKey: (...args) => getDefensiveAutopilotLineKey(...args),
  getDefensiveAutopilotProfile: getDefensiveAutopilotProfile,
  getDefensiveDribblePressTarget: getDefensiveDribblePressTarget,
  getDefensiveGoalkeeperTarget: getDefensiveGoalkeeperTarget,
  getDefensiveLineActionLabels: getDefensiveLineActionLabels,
  getDefensiveLineCenterY: (...args) => getDefensiveLineCenterY(...args),
  getDefensiveLineWidth: (...args) => getDefensiveLineWidth(...args),
  getDefensiveLineX: getDefensiveLineX,
  getDefensivePhaseKey: (...args) => getDefensivePhaseKey(...args),
  getDefensivePressTarget: getDefensivePressTarget,
  getDribblePressureReference: getDribblePressureReference,
  getFormationPositions: getFormationPositions,
  getOffensiveActionPrinciple: getOffensiveActionPrinciple,
  getOffensiveAutopilotProfile: (...args) => getOffensiveAutopilotProfile(...args),
  getOffensiveAutopilotTarget: getOffensiveAutopilotTarget,
  getOffensivePhaseKey: getOffensivePhaseKey,
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getState: () => state,
  lerp: lerp,
  pitch: pitch,
  shouldSkipOffensiveAutopilotPlayer: shouldSkipOffensiveAutopilotPlayer,
  teamRosterOrder: teamRosterOrder,
  teams: teams,
  uniquePrincipleLabels: uniquePrincipleLabels,
});

const {
  getAutoPilotRoleStrength,
  getAutoPilotPossessionPlayer,
  getLooseBallRecoveryTarget,
  getSecondBallReactionAdjustment,
  getLooseBallRecoveryStructureAdjustment,
  getLooseBallNearestOpponent,
  getLooseBallCollectControlTouch,
  applyLooseBallCollectControlTouch,
  chooseAutoPilotLooseBallRecovery,
  issueLooseBallRecoveryCommand,
  describeAutoPilotChoice,
  planAutoPilotNextAction,
  cancelAutoPilotContinuation,
  pauseAutoPilotPlay,
  getAutoPilotContinuationContext,
  getAutoPilotContinuationDelay,
  scheduleAutoPilotContinuation,
  refreshPlannedBallActionProfile,
  clearBallAction,
  setBallOwner,
  issuePassLikeCommand,
  issuePassCommand,
  issueShotCommand,
  issueDribbleCommand,
  issueBallCommand,
  detectShotGoal,
  detectShotOutOfPlay,
  detectTouchlineOutOfPlay,
  getGoalkeeperForTeam,
  getPreferredParrySafetyPlayer,
  getGoalkeeperParryProfile,
  resolveGoalkeeperSave,
  registerGoalFlash,
  completeGoalkeeperSave,
  completeShotGoal,
  completeShotOutOfPlay,
  completeTouchlineOutOfPlay,
  updateBall,
  updateDribble,
  updateLooseBallRecovery,
  updateActionPlayers,
  updateSequenceActionPlayers,
  updateLiveActionPlayers,
  updateSequenceTransition,
  stepSimulation,
  getBallStatus,
  getActionTypeLabel,
  describeStep,
  getSequenceStartSnapshot,
  getSequenceFrameSnapshot,
  persistCurrentFrameSnapshot,
  finalizeCurrentActionStep,
} = createGameSimulatorCommandEngine({
  angleBetween: angleBetween,
  applyAutopilotsForCurrentAction: applyAutopilotsForCurrentAction,
  applyBallExecutionProfile: applyBallExecutionProfile,
  applyBestReceiveBodyAngle: applyBestReceiveBodyAngle,
  applyCommittedSnapshot: (...args) => applyCommittedSnapshot(...args),
  applyCornerSetup: applyCornerSetup,
  applyFreeKickSetup: applyFreeKickSetup,
  applyGoalKickSetup: applyGoalKickSetup,
  applyKickoffSetup: applyKickoffSetup,
  applyPenaltySetup: applyPenaltySetup,
  applyResolvedBallProfile: applyResolvedBallProfile,
  applySnapshot: applySnapshot,
  applyThrowInSetup: applyThrowInSetup,
  ballRadiusMeters: ballRadiusMeters,
  buildMovementPath: buildMovementPath,
  canEditScenario: canEditScenario,
  captureSnapshot: captureSnapshot,
  chooseAutoPilotNextAction: chooseAutoPilotNextAction,
  clamp: clamp,
  clampToPitch: clampToPitch,
  clearAutoPilotReceiveMomentum: clearAutoPilotReceiveMomentum,
  clearKeyboardActionGrace: clearKeyboardActionGrace,
  clearSecurePossession: clearSecurePossession,
  cloneAutoV2DecisionTriggers: cloneAutoV2DecisionTriggers,
  cloneDefensiveAutopilotIntents: cloneDefensiveAutopilotIntents,
  cloneGoalEvent: cloneGoalEvent,
  cloneOffensiveAutopilotIntents: cloneOffensiveAutopilotIntents,
  cloneRestartPhase: cloneRestartPhase,
  cloneShotPlacement: cloneShotPlacement,
  cloneSnapshot: cloneSnapshot,
  cloneVector: cloneVector,
  completeLiveActionPlayersBeforeCommit: completeLiveActionPlayersBeforeCommit,
  computeTimeToCoverDistance: computeTimeToCoverDistance,
  configureBallTravelProfile: configureBallTravelProfile,
  connectBallToPlayerForNextAction: connectBallToPlayerForNextAction,
  createCommittedSnapshotFromCurrentState: (...args) => createCommittedSnapshotFromCurrentState(...args),
  createLooseBallSpill: createLooseBallSpill,
  defaultKickoffTeamId: defaultKickoffTeamId,
  distance: distance,
  executePlannedAction: (...args) => executePlannedAction(...args),
  finishSequencePlayback: (...args) => finishSequencePlayback(...args),
  formatSpeed: formatSpeed,
  getActionInitiator: getActionInitiator,
  getActionOrigin: getActionOrigin,
  getActionSpeed: getActionSpeed,
  getAttackDirectionSign: getAttackDirectionSign,
  getAttackingDepth: getAttackingDepth,
  getAutoPilotFlowContext: getAutoPilotFlowContext,
  getAutoPilotReceiveMomentum: getAutoPilotReceiveMomentum,
  getBallOwner: getBallOwner,
  getBallTravelPoint: getBallTravelPoint,
  getDefensiveAutoV2Intent: getDefensiveAutoV2Intent,
  getDefensiveAutopilotFocusPoint: getDefensiveAutopilotFocusPoint,
  getDribbleCarryPathPoint: getDribbleCarryPathPoint,
  getGoalDirectionSign: getGoalDirectionSign,
  getGoalLineX: getGoalLineX,
  getGoalNetDisplayPoint: getGoalNetDisplayPoint,
  getLiveDefensiveDribblePressTarget: getLiveDefensiveDribblePressTarget,
  getLiveDribbleSpeed: getLiveDribbleSpeed,
  getMovementPathPoint: getMovementPathPoint,
  getOffensiveAutoV2Intent: getOffensiveAutoV2Intent,
  getOffensiveAutopilotFocusPoint: getOffensiveAutopilotFocusPoint,
  getOffensiveAutopilotProfile: getOffensiveAutopilotProfile,
  getOffensiveRoleKey: getOffensiveRoleKey,
  getOffsideInfo: getOffsideInfo,
  getOpponentGoalSide: getOpponentGoalSide,
  getOpponentPenaltySpot: getOpponentPenaltySpot,
  getOpponentPressureAtPoint: getOpponentPressureAtPoint,
  getOtherTeamId: getOtherTeamId,
  getPitchThreatProfile: getPitchThreatProfile,
  getPlannedPossessionTeamId: getPlannedPossessionTeamId,
  getPlayerById: getPlayerById,
  getPlayerBallControlPoint: getPlayerBallControlPoint,
  getPlayerDecisionContext: getPlayerDecisionContext,
  getPlayerMagnetLabel: getPlayerMagnetLabel,
  getPlayerPositionForControlPoint: getPlayerPositionForControlPoint,
  getPlayerPressureLoad: getPlayerPressureLoad,
  getPlayerRoleModel: getPlayerRoleModel,
  getRecordedStepEndSnapshot: getRecordedStepEndSnapshot,
  getRequestedActionMode: getRequestedActionMode,
  getSelectedPlayer: getSelectedPlayer,
  getTeamAttackAngle: getTeamAttackAngle,
  getTeamSupportCountAroundPoint: getTeamSupportCountAroundPoint,
  hasBallAction: hasBallAction,
  isBetweenGoalPosts: isBetweenGoalPosts,
  isDefensiveAutopilotPlayer: isDefensiveAutopilotPlayer,
  isDefensiveDribblePresser: isDefensiveDribblePresser,
  isGoalkeeper: isGoalkeeper,
  isInsideOpponentBox: isInsideOpponentBox,
  isInsideOwnBox: isInsideOwnBox,
  isOffensiveAutopilotPlayer: isOffensiveAutopilotPlayer,
  keepSecurePossessionOnlyForOwner: keepSecurePossessionOnlyForOwner,
  lerp: lerp,
  logEvent: logEvent,
  markSequenceDirty: markSequenceDirty,
  moveDefensiveAutoV2Player: moveDefensiveAutoV2Player,
  moveOffensiveAutoV2Player: moveOffensiveAutoV2Player,
  moveTowards: moveTowards,
  normalize: normalize,
  pauseLiveSimulation: (...args) => pauseLiveSimulation(...args),
  pitch: pitch,
  queueNextSequenceStep: (...args) => queueNextSequenceStep(...args),
  randomBetween: randomBetween,
  render: (...args) => render(...args),
  resetPlayerMovementProgress: resetPlayerMovementProgress,
  resolveBallActionProfile: resolveBallActionProfile,
  resolveDribbleDefensiveChallenge: resolveDribbleDefensiveChallenge,
  resolveLooseBallClaim: resolveLooseBallClaim,
  resolvePassTransitInterception: resolvePassTransitInterception,
  resolveShotBlockCommitment: resolveShotBlockCommitment,
  resolveShotTarget: resolveShotTarget,
  rotatePlayerBodyAlongMovement: rotatePlayerBodyAlongMovement,
  rotatePlayerBodyToward: rotatePlayerBodyToward,
  rotatePlayerBodyTowardAngle: rotatePlayerBodyTowardAngle,
  setDribbleCarryPathForBall: setDribbleCarryPathForBall,
  setPiecePhaseProfiles: setPiecePhaseProfiles,
  setSecurePossessionAfterControlledTouch: setSecurePossessionAfterControlledTouch,
  setSelectedPlayers: setSelectedPlayers,
  settleBallForNextAction: settleBallForNextAction,
  shouldTriggerLandingBounce: shouldTriggerLandingBounce,
  startLandingBounceSkid: startLandingBounceSkid,
  startRecordedAction: (...args) => startRecordedAction(...args),
  teams: teams,
  ui: ui,
  updateBallFlightHeight: updateBallFlightHeight,
  updateSequenceButtons: (...args) => updateSequenceButtons(...args),
  win: win,
  getState: () => state,
});

function createInitialState() {
teams.home.formation = defaultFormations.home;
teams.away.formation = defaultFormations.away;
resetTeamIdentities();
const physicalProfile = defaultPhysicalProfileKey;
const players = squadBlueprints.map((blueprint) => createPlayer(blueprint, physicalProfile));
setTeamFormationOnPlayers(players, "home", teams.home.formation);
setTeamFormationOnPlayers(players, "away", teams.away.formation);
const kickoffSpot = getKickoffSpot();
const initialState = {
time: 0,
dt: 0.05,
physicalProfile,
playbackSpeed: 1,
surfacePreset: "hybrid-grass",
weatherPreset: "damp",
firstTouchMode: "auto",
defensiveAggressionPreset: "balanced",
goalFlash: null,
actionMode: null,
ballSpeedMode: "auto",
dribbleSpeedMode: "auto",
defensiveAutopilot: false,
offensiveAutopilot: false,
autoV2Debug: false,
autoPilotPlay: {
active: false,
nextActionTimeoutId: null,
possessionPlan: null,
receiveMomentum: null,
},
dribbleSpeed: 4.5,
isRunning: false,
drag: null,
keyboardActionMode: null,
keyboardActionGraceMode: null,
keyboardActionGraceUntil: 0,
matchPhase: "setPieces",
restartPhase: {
type: "kickoff",
teamId: defaultKickoffTeamId,
label: setPiecePhaseProfiles.kickoff.label,
},
selectedPlayerId: getKickoffTakerId(defaultKickoffTeamId),
selectedPlayerIds: [getKickoffTakerId(defaultKickoffTeamId)],
eventLog: [
"Kick-off loaded: Blue Team starts from the centre mark.",
"Sandbox loaded: drag players, the ball, or box-select players while the simulation is paused.",
"Press P, D or S, or arm a mode button, then click the pitch to set the target. Press Enter or Start to play it. With offensive autopilot on, Space starts or pauses auto play.",
],
scenario: { ...defaultScenarioInfo },
example: null,
simulatorDirty: false,
savedSequences: readSavedSequenceLibrary(),
draftStep: null,
activeActionTargets: null,
sequence: {
isPlaying: false,
playbackIndex: -1,
currentFrameIndex: -1,
playbackTimeoutId: null,
phase: null,
transition: null,
actionTargets: null,
initialSnapshot: null,
dirty: false,
steps: [],
},
ball: {
position: cloneVector(kickoffSpot),
startPosition: cloneVector(kickoffSpot),
target: cloneVector(kickoffSpot),
speed: 12,
manualSpeed: 12,
currentSpeed: 0,
launchSpeed: 0,
finalSpeed: 0,
deceleration: 0,
profileKey: null,
profileLabel: null,
profileMode: "auto",
targetKind: null,
firstTouchMode: "auto",
flightStyle: "ground",
peakHeight: 0,
height: 0,
controlHeightThreshold: 0.12,
landingPhaseStart: 0.58,
curveAmount: 0,
curveDirection: 1,
spinRate: 0,
spinAngle: 0,
trackDistanceTotal: 0,
trackDistanceCovered: 0,
dribblePath: null,
bounceCount: 0,
inTransit: false,
elapsedTravelTime: 0,
actionType: null,
ownerPlayerId: getKickoffTakerId(defaultKickoffTeamId),
initiatorPlayerId: null,
laneClarity: 0.84,
executionQuality: 0.84,
claimRadius: 2.2,
controlRadius: 1.4,
carrierPlayerId: null,
receiverPlayerId: null,
securePossession: null,
recoveryDuration: 0,
secondBallContext: null,
},
players,
};
applyKickoffSetup(initialState, {
teamId: defaultKickoffTeamId,
resetFormations: false,
});
return initialState;
}
let state = createInitialState();
win.__autoV2DebugEnabled = Boolean(win.__autoV2DebugEnabled);
let lastFrame = null;
let simulatorAnimationRuntime = null;
let simulatorAnimationRuntimePromise = null;
let simulatorAnimationLoopRequested = false;
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
let sessionPlannerLibraryOpen = false;
let sessionPlannerLibraryPhaseFilter = "all";
let sessionPlannerLibrarySubPhaseFilter = "all";
let sessionPlannerLibraryPhaseFilters = [];
let sessionPlannerLibrarySubPhaseFilters = [];
let sessionPlannerLibraryFilterOpen = "";
let sessionPlannerLibrarySearchQuery = "";
let sessionPlannerLibraryArchiveView = "active";
let sessionPlannerLibrarySortMode = "updated";
let sessionPlannerLibraryEditExerciseId = "";
let sessionPlannerLibraryViewExerciseId = "";
let sessionPlannerLibrarySelectedFolderId = "all";
let sessionPlannerLibraryEditingFolderId = "";
let sessionPlannerDraggedLibraryExerciseId = "";
let sessionPlannerLibraryPointerDrag = null;
let sessionPlannerLibrarySuppressNextClick = false;
let sessionPlannerPendingLibrarySave = null;
let sessionPlannerCentralSyncConflict = null;
let sessionPlannerCentralSyncNoticeAt = 0;
const sessionPlannerBoardHistoryLimit = 80;
let sessionPlannerBoardHistoryApplying = false;
const sessionPlannerBoardHistoryBaselines = {
tactical: new Map(),
player: new Map(),
};
const sessionPlannerBoardHistoryStacks = {
tactical: new Map(),
player: new Map(),
};
let sessionPlannerSnapshotRecoveryQueued = false;
let sessionPlannerExerciseLibrarySnapshotRecoveryQueued = false;
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
color: sessionPlannerTacticalColor,
lineWidth: sessionPlannerTacticalLineWidth,
lineStyle: sessionPlannerTacticalLineStyle,
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
function normalizeSessionPlannerPlayerBoardCustomPeople(source = []) {
return normalizeSessionPlannerPlayerBoardCustomPeopleFromModule(source);
}
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
formatMultiValue: formatSessionPlannerMultiValue,
getCurrentUserId: () => (typeof getCurrentPlatformUser === "function" ? getCurrentPlatformUser()?.id || "" : ""),
normalizePlayerBoardColors: normalizeSessionPlannerPlayerBoardColors,
normalizePlayerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople,
normalizePlayerBoardPositions: normalizeSessionPlannerPlayerBoardPositions,
normalizeTacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId,
normalizeTacticalFrames: normalizeSessionPlannerTacticalFrames,
normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
});
const sessionPlannerSessionFactory = createSessionPlannerSessionFactory({
createBlock: createSessionPlannerBlock,
defaultExerciseLibrary: sessionPlannerDefaultExerciseLibrary,
formatDateValue: formatScheduleDateValue,
getActiveExerciseLibrary: getSessionPlannerActiveExerciseLibrary,
getScheduledSessionTitle: getScheduledSessionTitleForDate,
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
normalizeMultiValue: normalizeSessionPlannerMultiValue,
formatMultiValue: formatSessionPlannerMultiValue,
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
const exerciseLibraryRenderer = createExerciseLibraryRenderer({
escapeHtml,
normalizeTimestamp: normalizeSessionPlannerTimestamp,
normalizeTags: normalizeSessionPlannerLibraryTags,
normalizeFolderExerciseIds: normalizeSessionPlannerLibraryFolderExerciseIds,
getReviewNotes: getSessionPlannerExerciseReviewNotes,
getMultiValueSummary: getSessionPlannerMultiValueSummary,
canEdit: canEditSessionPlanner,
sortOptions: sessionPlannerLibrarySortOptions,
getState: () => ({
isOpen: sessionPlannerLibraryOpen,
archiveView: sessionPlannerLibraryArchiveView,
editingFolderId: sessionPlannerLibraryEditingFolderId,
filterOpen: sessionPlannerLibraryFilterOpen,
searchQuery: sessionPlannerLibrarySearchQuery,
selectedFolderId: sessionPlannerLibrarySelectedFolderId,
sortMode: sessionPlannerLibrarySortMode,
pendingSave: sessionPlannerPendingLibrarySave,
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
getSelectedFolder: () => getSessionPlannerLibraryFolderById(sessionPlannerLibrarySelectedFolderId),
getFilteredExercises: getFilteredSessionPlannerExerciseLibrary,
getEditExercise: getSessionPlannerLibraryEditExercise,
getViewExercise: getSessionPlannerLibraryViewExercise,
getOptionValues: getSessionPlannerLibraryOptionValues,
}),
});
const exerciseLibraryActions = createExerciseLibraryActions({
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
getUiState: () => ({
open: sessionPlannerLibraryOpen,
selectedFolderId: sessionPlannerLibrarySelectedFolderId,
editExerciseId: sessionPlannerLibraryEditExerciseId,
viewExerciseId: sessionPlannerLibraryViewExerciseId,
editingFolderId: sessionPlannerLibraryEditingFolderId,
archiveView: sessionPlannerLibraryArchiveView,
filterOpen: sessionPlannerLibraryFilterOpen,
searchQuery: sessionPlannerLibrarySearchQuery,
pendingSave: sessionPlannerPendingLibrarySave,
}),
setUiState: (nextState = {}) => {
if (Object.prototype.hasOwnProperty.call(nextState, "open")) {
sessionPlannerLibraryOpen = Boolean(nextState.open);
}
if (Object.prototype.hasOwnProperty.call(nextState, "selectedFolderId")) {
sessionPlannerLibrarySelectedFolderId = nextState.selectedFolderId;
}
if (Object.prototype.hasOwnProperty.call(nextState, "editExerciseId")) {
sessionPlannerLibraryEditExerciseId = nextState.editExerciseId;
}
if (Object.prototype.hasOwnProperty.call(nextState, "viewExerciseId")) {
sessionPlannerLibraryViewExerciseId = nextState.viewExerciseId;
}
if (Object.prototype.hasOwnProperty.call(nextState, "editingFolderId")) {
sessionPlannerLibraryEditingFolderId = nextState.editingFolderId;
}
if (Object.prototype.hasOwnProperty.call(nextState, "archiveView")) {
sessionPlannerLibraryArchiveView = nextState.archiveView;
}
if (Object.prototype.hasOwnProperty.call(nextState, "filterOpen")) {
sessionPlannerLibraryFilterOpen = nextState.filterOpen;
}
if (Object.prototype.hasOwnProperty.call(nextState, "searchQuery")) {
sessionPlannerLibrarySearchQuery = nextState.searchQuery;
}
if (Object.prototype.hasOwnProperty.call(nextState, "pendingSave")) {
sessionPlannerPendingLibrarySave = nextState.pendingSave;
}
if (Object.prototype.hasOwnProperty.call(nextState, "phaseFilters")) {
setSessionPlannerLibraryFilterValues("phase", nextState.phaseFilters);
}
if (Object.prototype.hasOwnProperty.call(nextState, "subPhaseFilters")) {
setSessionPlannerLibraryFilterValues("subPhase", nextState.subPhaseFilters);
}
},
});
let sessionPlannerHistoryEntries = [];
let sessionPlannerHistoryLoading = false;
let sessionPlannerHistoryLoadedDate = "";
let sessionPlannerHistoryLoadError = "";
let sessionPlannerHistoryOpen = false;
let sessionPlannerToastMessage = "";
let sessionPlannerToastTone = "success";
let sessionPlannerToastTimeoutId = null;
let sessionPlannerAddMenuOpen = false;
const sessionPlannerMultiSelectFields = new Set(["phase", "subPhase"]);
let sessionPlannerMultiSelectOpenField = "";
const sessionPlannerRenderer = createSessionPlannerRenderer({
escapeHtml,
canEdit: canEditSessionPlanner,
normalizeMultiValue: normalizeSessionPlannerMultiValue,
getMultiSelectOpenField: () => sessionPlannerMultiSelectOpenField,
multiSelectFields: sessionPlannerMultiSelectFields,
getReviewNotesForBlock: getSessionPlannerExerciseReviewNotesForBlock,
formatLibraryDate: (value) => exerciseLibraryRenderer.formatDate(value),
getScheduleSessionEventForDate,
});
const sessionPlannerWorkspaceRenderer = createSessionPlannerWorkspaceRenderer({
escapeHtml,
formatDateValue: formatScheduleDateValue,
parseDateValue: parseScheduleDateValue,
periodizationOptionLibrary,
renderSessionPlannerActionIcon,
renderSessionPlannerBlockList: (session) => sessionPlannerRenderer.renderBlockList(session),
renderSessionPlannerDateStrip: () =>
sessionPlannerWorkspaceRenderer.renderDateStrip({
selectedDate: sessionPlannerState.selectedDate,
sessions: sessionPlannerState.sessions,
hasScheduledSession: getScheduleSessionEventForDate,
}),
renderSessionPlannerEditableField: (block, key, label, options) => sessionPlannerRenderer.renderEditableField(block, key, label, options),
renderSessionPlannerExerciseVisual,
renderSessionPlannerHeaderField: (block, key, fallback, options) => sessionPlannerRenderer.renderHeaderField(block, key, fallback, options),
renderSessionPlannerLibraryOverlay: () => exerciseLibraryRenderer.renderOverlay(),
renderSessionPlannerLibrarySaveConflictOverlay: () => exerciseLibraryRenderer.renderSaveConflictOverlay(),
renderSessionPlannerMedicalAvailability: (dateValue) =>
sessionPlannerWorkspaceRenderer.renderMedicalAvailability(getSessionPlannerMedicalAvailability(dateValue)),
renderSessionPlannerPeriodizationOverlay,
renderSessionPlannerPeriodizationSummary,
renderSessionPlannerPlayerBoard: (block) => sessionPlannerPlayerBoardRenderer.renderPlayerBoard(block),
renderSessionPlannerPlayerBoardOverlay: (block) => sessionPlannerPlayerBoardRenderer.renderPlayerBoardOverlay(block),
renderSessionPlannerPostSessionNotesCard: (block) => sessionPlannerRenderer.renderPostSessionNotesCard(block),
renderSessionPlannerPrintOverlay: (session) => sessionPlannerPrintRenderer.renderOverlay(session),
renderSessionPlannerTacticalboardOverlay: (block) => sessionPlannerVisualRenderer.renderTacticalboardOverlay(block),
renderSessionPlannerVisualPreviewOverlay: (block) => sessionPlannerVisualRenderer.renderVisualPreviewOverlay(block),
});
const sessionPlannerMedicalAvailabilitySelectors = createSessionPlannerMedicalAvailabilitySelectors({
buildMedicalPlayerFromPlayerProfile,
createMedicalRecordFromSquadAvailabilityBlock,
getMedicalAvailabilityItems,
getMedicalRecordStatus,
getSelectedDate: () => medicalState?.selectedDate,
getSessionPlannerPlayerBoardProfileState,
getSessionPlannerPlayerBoardSyncedPlayer,
isMedicalPlayerBlockedBySquadAvailability,
isPlayerProfileTemporaryActiveOnDate,
isTemporaryPlayerProfile,
});
let sessionPlannerVisualPreviewOpen = false;
let sessionPlannerTacticalboardOpen = false;
let sessionPlannerTacticalTool = "blue-player";
let sessionPlannerTacticalColor = "#0d4f86";
let sessionPlannerTacticalLineWidth = 1.1;
let sessionPlannerTacticalLineStyle = "solid";
let sessionPlannerTacticalSnapEnabled = false;
let sessionPlannerTacticalPendingPoint = null;
let sessionPlannerTacticalSelectedElementId = "";
let sessionPlannerTacticalSelectedElementIds = [];
let sessionPlannerTacticalDragState = null;
let sessionPlannerTacticalDraftLineState = null;
let sessionPlannerTacticalFreehandState = null;
let sessionPlannerTacticalSelectionState = null;
let sessionPlannerTacticalSuppressNextClick = false;
let sessionPlannerTacticalSuppressNextClickAt = 0;
let sessionPlannerTacticalLastPlacementClick = null;
let sessionPlannerTacticalLastPlacement = null;
let sessionPlannerTacticalClipboard = [];
let sessionPlannerTacticalClipboardPasteCount = 0;
let sessionPlannerTacticalNumberPickerElementId = "";
let sessionPlannerDraggedBlockId = "";
let sessionPlannerPlayerBoardOpen = false;
let sessionPlannerPlayerBoardSelectedPlayerId = "";
let sessionPlannerPlayerBoardSelectedPlayerIds = [];
let sessionPlannerPlayerBoardDragState = null;
let sessionPlannerPlayerBoardSelectionState = null;
let sessionPlannerPlayerBoardFormationInput = "";
let sessionPlannerPlayerBoardTeamCount = 2;
let sessionPlannerPlayerBoardAutoMode = "balanced";
let sessionPlannerPlayerBoardAssistantOpen = false;
let sessionPlannerPlayerBoardCustomPersonEditor = null;
let sessionPlannerPrintRootElement = null;
const {
formatMedicalDateLabel,
getMedicalPlayerInitials,
renderMedicalPlayerAvatar,
renderMedicalSquadAvailabilityBadge,
renderMedicalTemporaryPlayerBadge,
} = createMedicalDisplayHelpers({
escapeHtml,
getMedicalPlayerAvailabilityStatusOption,
getPlayerProfileRosterLabel,
getPlayerProfileTemporaryWindowLabel,
getSelectedDate: () => medicalState?.selectedDate,
isMedicalPlayerBlockedBySquadAvailability,
isPlayerProfileTemporaryActiveOnDate,
isTemporaryPlayerProfile,
parseScheduleDateValue,
});
const {
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
} = createSessionPlannerPlayerBoardHelpers({
clamp,
createStableId: createSessionPlannerStableId,
getPlayerInitials: getMedicalPlayerInitials,
getSelectedSession: getSessionPlannerSelectedSession,
normalizeColor: normalizeTacticalColor,
normalizeTimestamp: normalizeSessionPlannerTimestamp,
normalizePlayerProfileRole,
});
const {
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
} = createSessionPlannerPlayerBoardFormationHelpers({
autoModeOptions: sessionPlannerPlayerBoardAutoModeOptions,
clamp,
getCareerScore: getSessionPlannerPlayerBoardCareerScore,
getDirectRoleFitScore: getSessionPlannerPlayerBoardDirectRoleFitScore,
getImportanceScore: getSessionPlannerPlayerBoardImportanceScore,
getItemPriorityScore: getSessionPlannerPlayerBoardItemPriorityScore,
getMinutesScore: getSessionPlannerPlayerBoardMinutesScore,
getNumericPriorityValue: getSessionPlannerPlayerBoardNumericPriorityValue,
getPlayerBoardPositionById: getSessionPlannerPlayerBoardPositionById,
getPlayerInitials: getMedicalPlayerInitials,
getPlayerRoleProfile: getSessionPlannerPlayerBoardPlayerRoleProfile,
getPositionGroup: getSessionPlannerPlayerBoardPositionGroup,
getPriorityScore: getSessionPlannerPlayerBoardPriorityScore,
getRoleOrder: getSessionPlannerPlayerBoardRoleOrder,
getRolePriorityValue: getSessionPlannerPlayerBoardRolePriorityValue,
maxTeamCount: sessionPlannerPlayerBoardMaxTeamCount,
});
const {
buildSelectionAssistant: buildSessionPlannerSelectionAssistant,
} = createSessionPlannerSelectionAssistant({
clamp,
comparePlayers: compareMedicalPlayers,
getBridgeBestMatches: getSessionPlannerPlayerBoardBridgeBestMatches,
getCareerScore: getSessionPlannerPlayerBoardCareerScore,
getFormationInput: () => sessionPlannerPlayerBoardFormationInput,
getImportanceScore: getSessionPlannerPlayerBoardImportanceScore,
getMinutesScore: getSessionPlannerPlayerBoardMinutesScore,
getPlayerBoardPlayers: getSessionPlannerPlayerBoardPlayers,
getRoleGroupForRole: getSessionPlannerPlayerBoardRoleGroupForRole,
getSelectedBlock: getSessionPlannerSelectedBlock,
normalizePlayerProfileRole,
normalizeProfileKey: normalizeSessionPlannerPlayerBoardProfileKey,
normalizeRoleGroupKey: normalizeSessionPlannerPlayerBoardRoleGroupKey,
normalizeSquadStatusKey: normalizeSessionPlannerPlayerBoardSquadStatusKey,
parseFormation: parseSessionPlannerPlayerBoardFormation,
});
const sessionPlannerPlayerBoardRenderer = createSessionPlannerPlayerBoardRenderer({
escapeHtml,
getState: () => ({
playerBoardOpen: sessionPlannerPlayerBoardOpen,
selectedPlayerIds: sessionPlannerPlayerBoardSelectedPlayerIds,
formationInput: sessionPlannerPlayerBoardFormationInput,
teamCount: sessionPlannerPlayerBoardTeamCount,
autoMode: sessionPlannerPlayerBoardAutoMode,
assistantOpen: sessionPlannerPlayerBoardAssistantOpen,
customPersonEditor: sessionPlannerPlayerBoardCustomPersonEditor,
selectedDate: sessionPlannerState?.selectedDate || "",
}),
playerProfileRoleOptions: () => playerProfileRoleOptions,
positionGroups: () => sessionPlannerPlayerBoardPositionGroups,
colorOptions: () => sessionPlannerPlayerBoardColorOptions,
autoModeOptions: () => sessionPlannerPlayerBoardAutoModeOptions,
maxTeamCount: () => sessionPlannerPlayerBoardMaxTeamCount,
getBridgeSummary: getSessionPlannerPlayerBoardBridgeSummary,
getBridgeBestMatches: getSessionPlannerPlayerBoardBridgeBestMatches,
getBridgeContract: getSessionPlannerPlayerBoardBridgeContract,
getBridgeRoleLabel: getSessionPlannerPlayerBoardBridgeRoleLabel,
buildSelectionAssistant: buildSessionPlannerSelectionAssistant,
getPlayerBoardWarnings: getSessionPlannerPlayerBoardWarnings,
formatPlayerWarningNames: formatSessionPlannerPlayerWarningNames,
getSelectedColorIds: getSessionPlannerPlayerBoardSelectedColorIds,
getSelectedBlock: getSessionPlannerSelectedBlock,
getPlayerBoardPlayers: getSessionPlannerPlayerBoardPlayers,
normalizeTeamCount: normalizeSessionPlannerPlayerBoardTeamCount,
normalizeAutoMode: normalizeSessionPlannerPlayerBoardAutoMode,
getPlayerBoardTextColor: getSessionPlannerPlayerBoardTextColor,
getPlayerBoardSummary: getSessionPlannerPlayerBoardSummary,
getInitialLabelMap: getSessionPlannerPlayerBoardInitialLabelMap,
getReadablePlayerBoardPositions: getSessionPlannerReadablePlayerBoardPositions,
getReadableSpacing: getSessionPlannerPlayerBoardReadableSpacing,
getPlayerBoardPosition: getSessionPlannerPlayerBoardPosition,
getPlayerBoardTone: getSessionPlannerPlayerBoardTone,
getPlayerBoardCustomColor: getSessionPlannerPlayerBoardCustomColor,
getPlayerBoardColorStyle: getSessionPlannerPlayerBoardColorStyle,
isTemporaryPlayer: isTemporaryPlayerProfile,
getRosterLabel: getPlayerProfileRosterLabel,
getPlayerInitials: getMedicalPlayerInitials,
getPlayerBoardCustomPerson: getSessionPlannerPlayerBoardCustomPerson,
getSourceBlocks: getSessionPlannerPlayerBoardSourceBlocks,
getSourceLabel: getSessionPlannerPlayerBoardSourceLabel,
getDataObject: getSessionPlannerPlayerBoardDataObject,
syncSelection: syncSessionPlannerPlayerBoardSelection,
normalizeActualParticipation: normalizeMedicalActualParticipation,
medicalActualParticipationFallback,
getRtpPhaseOption: getMedicalRtpPhaseOption,
getCoachComment: getMedicalCoachComment,
formatDateLabel: formatMedicalDateLabel,
renderPlayerAvatar: renderMedicalPlayerAvatar,
});
const sessionPlannerVisualRenderer = createSessionPlannerVisualRenderer({
escapeHtml,
clamp,
getState: () => ({
visualPreviewOpen: sessionPlannerVisualPreviewOpen,
tacticalboardOpen: sessionPlannerTacticalboardOpen,
tool: sessionPlannerTacticalTool,
color: sessionPlannerTacticalColor,
lineWidth: sessionPlannerTacticalLineWidth,
lineStyle: sessionPlannerTacticalLineStyle,
pendingPoint: sessionPlannerTacticalPendingPoint,
selectedElementId: sessionPlannerTacticalSelectedElementId,
draftLineState: sessionPlannerTacticalDraftLineState,
freehandState: sessionPlannerTacticalFreehandState,
}),
getPitchModeOptions: () => sessionPlannerTacticalPitchModeOptions,
normalizeTacticalPitchMode: normalizeSessionPlannerTacticalPitchMode,
getTacticalPitchModeOption: getSessionPlannerTacticalPitchModeOption,
isTacticalElementSelected: isSessionPlannerTacticalElementSelected,
normalizeTacticalColor,
getDefaultTacticalColor,
getTacticalRenderStrokeWidth: getSessionPlannerTacticalRenderStrokeWidth,
getTacticalStrokeDasharray,
getDefaultTacticalLineStyle,
getTacticalCurveControlPoint: getSessionPlannerTacticalCurveControlPoint,
getTacticalDefaultCurveControlPoint: getSessionPlannerTacticalDefaultCurveControlPoint,
isTacticalGoalType: isSessionPlannerTacticalGoalType,
isTacticalPlayerType: isSessionPlannerTacticalPlayerType,
normalizeTacticalRotation,
normalizeTacticalPlayerBadge: normalizeSessionPlannerTacticalPlayerBadge,
isTacticalEndpointElement: isSessionPlannerTacticalEndpointElement,
getTacticalPitchDimensionsForBlock: getSessionPlannerTacticalPitchDimensionsForBlock,
cloneTacticalElement: cloneSessionPlannerTacticalElement,
createLineElement: createSessionPlannerLineElement,
renderSelectionBox: renderSessionPlannerTacticalSelectionBox,
ensureTacticalFrames: ensureSessionPlannerTacticalFrames,
getTacticalActiveFrameId: getSessionPlannerTacticalActiveFrameId,
getTacticalSelectedElementIds: getSessionPlannerTacticalSelectedElementIds,
getTacticalNumberPickerElementId: () => sessionPlannerTacticalNumberPickerElementId,
clearTacticalNumberPickerElementId: () => {
sessionPlannerTacticalNumberPickerElementId = "";
},
});
let sessionPlannerPrintOverlayOpen = false;
let sessionPlannerPrintPaper = "letter";
let sessionPlannerPrintSections = Object.fromEntries(
sessionPlannerPrintSectionOptions.map((option) => [option.key, true])
);
const sessionPlannerPrintRenderer = createSessionPlannerPrintRenderer({
escapeHtml,
getState: () => ({
printOverlayOpen: sessionPlannerPrintOverlayOpen,
printPaper: sessionPlannerPrintPaper,
printSections: sessionPlannerPrintSections,
selectedDate: sessionPlannerState?.selectedDate || "",
}),
getPaperOptions: () => sessionPlannerPrintPaperOptions,
getSectionOptions: () => sessionPlannerPrintSectionOptions,
normalizeMultiValue: normalizeSessionPlannerMultiValue,
getPeriodizationDay,
getMedicalAvailability: getSessionPlannerMedicalAvailability,
getPlayerBoardCustomColor: getSessionPlannerPlayerBoardCustomColor,
getPlayerBoardTone: getSessionPlannerPlayerBoardTone,
getPlayerBoardSummary: getSessionPlannerPlayerBoardSummary,
getInitialLabelMap: getSessionPlannerPlayerBoardInitialLabelMap,
getReadablePlayerBoardPositions: getSessionPlannerReadablePlayerBoardPositions,
getReadableSpacing: getSessionPlannerPlayerBoardReadableSpacing,
getPlayerBoardPosition: getSessionPlannerPlayerBoardPosition,
getPlayerBoardTextColor: getSessionPlannerPlayerBoardTextColor,
getPlayerInitials: getMedicalPlayerInitials,
renderExerciseVisual: renderSessionPlannerExerciseVisual,
getSessionDateLabel: getSessionPlannerDateLabel,
getMatchDayLabel: getPeriodizationMatchDayLabel,
getDayScheduleLabel: getPeriodizationDayScheduleLabel,
getScheduledSessionTitle: getScheduledSessionTitleForDate,
getTotalMinutes: getDashboardSessionTotalMinutes,
});
let activeMetricTooltipTarget = null;
let pinnedMetricTooltipTarget = null;
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
const adminUserRenderer = createAdminUserRenderer({
escapeHtml,
formatUserName,
getRoleLabel,
getUserScopeLabel,
renderUserAvatar,
getAdminUserInitials,
getAuditState: () => ({
entries: adminAuditEntries,
loading: adminAuditLoading,
loadError: adminAuditLoadError,
}),
getSelectedUserId: () => selectedAdminUserId,
canManageUser: canAdminManageUser,
hasWorkspaceScope: hasPlatformWorkspaceScope,
getScopedTeams: getScopedPlatformTeams,
getClubById: getPlatformClubById,
getUsersForTeam: getAdminUsersForTeam,
isLegacyTeam: isLegacyPlatformTeam,
isLegacyTeamPlaceholderName: isLegacyPlatformTeamPlaceholderName,
});
let platformReadinessReport = null;
let platformReadinessLoading = false;
let platformReadinessLoadedAt = 0;
let platformReadinessLoadError = "";
const passwordRevealInputRenderer = createPasswordRevealInputRenderer({ escapeHtml });
const adminReadinessRenderer = createAdminReadinessRenderer({
escapeHtml,
getReadinessState: () => ({
report: platformReadinessReport,
loading: platformReadinessLoading,
loadError: platformReadinessLoadError,
loadedAt: platformReadinessLoadedAt,
}),
readAppearanceState: readPlatformAppearanceState,
getHomeAppearanceImpactSummary,
platformAppearanceDensityOptions,
platformAppearanceHomeComponentTypeIds,
platformAppearanceHomeSectionDefaults,
platformAppearanceThemeOptions,
platformAppearanceToneOptions,
});
const adminAccessRenderer = createAdminAccessRenderer({
escapeHtml,
getTransferRoomState: ensureTransferRoomState,
getTransferRoomAccessTeamId: getAdminTransferRoomAccessTeamId,
getManagedWorkspaces: getAdminManagedWorkspaces,
getRoleLabel,
getWorkspaceAccessConfig,
normalizeWorkspaceAccessEntry,
normalizePlatformRole,
});
const adminWorkspaceRenderer = createAdminWorkspaceRenderer({
escapeHtml,
formatAdminDateTime,
formatUserName,
getRoleLabel,
renderAdminAccountSummary: (user) => adminUserRenderer.renderAccountSummary(user),
renderAdminAuditLog: () => adminUserRenderer.renderAuditLog(),
renderAdminGroupedUsers: (users, currentUser, structure) => adminUserRenderer.renderGroupedUsers(users, currentUser, structure),
renderAdminRoleAccessForm: (roles) => adminAccessRenderer.renderRoleAccessForm(roles),
renderAdminRoleOptions,
renderAdminStructurePanel: (currentUser, structure, visibleUsers) => adminStructureRenderer.renderStructurePanel(currentUser, structure, visibleUsers),
renderAdminTeamOptions,
renderAdminTransferRoomAccessPanel: (users, structure) => adminAccessRenderer.renderTransferRoomAccessPanel(users, structure),
renderPasswordRevealInput: passwordRevealInputRenderer,
renderPlatformAppearanceGovernancePanel: () => adminReadinessRenderer.renderAppearanceGovernancePanel(),
renderPlatformReadinessDashboard: () => adminReadinessRenderer.renderReadinessDashboard(),
titleSuggestions: adminTitleSuggestions,
departmentSuggestions: adminDepartmentSuggestions,
});
const profileWorkspaceRenderer = createProfileWorkspaceRenderer({
escapeHtml,
formatUserName,
getRoleLabel,
renderTaskList: dashboardTaskListRenderer.renderTaskList,
renderUserAvatar,
});
const staffWorkspaceRenderer = createStaffWorkspaceRenderer({
escapeHtml,
formatUserName,
getRoleLabel,
getUserClubName,
getUserScopeLabel,
getUserTeamName,
renderPasswordRevealInput: passwordRevealInputRenderer,
renderUserAvatar,
});
const squadRosterRenderer = createSquadRosterRenderer({
escapeHtml,
getAllPlayerProfiles: () => playerProfilesState.players,
getAllTemporaryPlayerProfiles,
getPlayerProfileCompleteness,
getPlayerProfileDisplayAgeValue,
getPlayerProfileEffectiveStatusFromSnapshot,
getPlayerProfileIdpFollowUpLabel,
getPlayerProfileMedicalSnapshot,
getPlayerProfileOption,
getPlayerProfileRosterLabel,
getPlayerProfileRosterSummary: getPlayerProfilesRosterSummary,
getPlayerProfileRosterTypeOption,
getPlayerProfileTemporaryWindowLabel,
getSelectedPlayerId: () => playerProfilesState.selectedPlayerId,
getTemporarySectionCollapsed: () => playerProfilesTemporarySectionCollapsed,
isTemporaryPlayerProfile,
playerProfileCountsInSquad,
playerProfileIdpStatusOptions,
playerProfileStatusOptions,
playerProfileSquadStatusOptions,
renderPlayerProfileAvatar,
});
const squadWorkspaceRenderer = createSquadWorkspaceRenderer({
escapeHtml,
});
const squadProfileSupportRenderer = createSquadProfileSupportRenderer({
escapeHtml,
formatPlayerProfileChangeTime,
getActiveTab: () => playerProfileActiveTab,
getPlayerProfileChangeLog,
getPlayerProfileMedicalSnapshot,
getRecentPlayerProfileChangeLog,
isNewPlayerModalOpen: () => playerProfileNewPlayerModalOpen,
canEditPlayerProfiles,
playerProfileRoleOptions,
playerProfileRosterTypeOptions,
playerProfileTabOptions,
});
const squadProfileSelectedRenderer = createSquadProfileSelectedRenderer({
escapeHtml,
canEditPlayerProfiles,
getActiveTab: () => playerProfileActiveTab,
getPlayerProfileDisplayBirthDateValue,
getPlayerProfileEffectiveStatusFromSnapshot,
getPlayerProfileMedicalSnapshot,
getPlayerProfileOption,
isCurrentPlatformUserAdmin,
isProfileModalOpen: () => playerProfileModalOpen,
normalizePlayerProfileTab,
playerProfileAttributeGroups,
playerProfileCareerPhaseOptions,
playerProfileIdpStatusOptions,
playerProfilePreferredSideOptions,
playerProfileRoleGroupOptions,
playerProfileRosterTypeOptions,
playerProfileSquadStatusOptions,
playerProfileStatusOptions,
playerProfileTabOptions,
playerProfileCountsInSquad,
renderPlayerProfileAvatarUpload,
renderPlayerProfileFuturePanel: (player) => squadProfileSupportRenderer.renderFuturePanel(player),
renderPlayerProfileHistoryPanel: (player) => squadProfileSupportRenderer.renderHistoryPanel(player),
renderPlayerProfileMedicalPanel: (player) => squadProfileSupportRenderer.renderMedicalPanel(player),
renderPlayerProfileOptionSet: (options, selectedKey) => squadProfileSupportRenderer.renderOptionSet(options, selectedKey),
renderPlayerProfileRoleOptions: (selectedRole) => squadProfileSupportRenderer.renderRoleOptions(selectedRole),
renderPlayerProfileScoutingSpider,
renderPlayerProfileSecondaryRoleOptions: (selectedRoles) => squadProfileSupportRenderer.renderSecondaryRoleOptions(selectedRoles),
renderPlayerProfileStatusChip,
renderPlayerProfileTabs: () => squadProfileSupportRenderer.renderTabs(),
});
const medicalOptionSelectors = createMedicalOptionSelectors({
getMedicalRecommendationActivityContext,
medicalActualParticipationFallback,
medicalGateOptions,
medicalParticipationOptions,
medicalRtpPhaseOptions,
medicalStatusActivityLabels,
medicalStatusActivityTones,
medicalStatusOptions,
});
const {
renderMedicalActualParticipationOptions,
renderMedicalDurationUnitOptions,
renderMedicalGateOptions,
renderMedicalParticipationOptions,
renderMedicalRtpPhaseOptions,
renderMedicalStatusOptions,
} = createMedicalOptionRenderers({
escapeHtml,
getMedicalGateOption,
getMedicalRtpPhaseOption,
getMedicalStatusOption,
getMedicalStatusOptionForDate,
getSelectedDate: () => medicalState?.selectedDate,
medicalActualParticipationFallback,
medicalGateOptions,
medicalParticipationOptions,
medicalRtpPhaseOptions,
medicalStatusOptions,
normalizeMedicalActualParticipation,
normalizeMedicalParticipation,
});
const medicalAvailabilitySelectors = createMedicalAvailabilitySelectors({
compareMedicalPlayers,
ensureMedicalState,
getActiveMedicalPlayersForDate,
getLatestMedicalRecord,
getMedicalRecordStatus,
});
const medicalCommandSelectors = createMedicalCommandSelectors({
addCalendarDays,
compareMedicalPlayers,
ensureMedicalState,
formatDateValue: formatScheduleDateValue,
formatMedicalDateLabel,
getActiveMedicalPlayers,
getLatestMedicalRecord,
getMedicalAvailabilityItems,
getMedicalCoachComment,
getMedicalMonthToDateDates,
getMedicalPastWindowDates,
getMedicalRecordStatus,
getMedicalReviewAlerts,
getSelectedDate: () => medicalState?.selectedDate,
medicalPositionOrder,
normalizeMedicalPlayerPosition,
parseDateValue: parseScheduleDateValue,
});
const medicalOperationsSelectors = createMedicalOperationsSelectors({
compareMedicalPlayers,
ensureMedicalState,
formatDateValue: formatScheduleDateValue,
getActiveMedicalInjuryPlan,
getLatestMedicalRecord,
getMedicalAvailabilityItems,
getMedicalPlanClearanceSummary,
getMedicalPlanDaysRemaining,
getMedicalPlanElapsedDays,
getMedicalPlanReviewState,
getMedicalPlanSeverity,
getMedicalPlanTotalDays,
getMedicalPlayerInjuryPlans,
getMedicalRecordStatus,
getMedicalRtpPhaseOption,
getMedicalState: () => medicalState,
getMedicalTrailingRecommendationSummary,
getSelectedDate: () => medicalState?.selectedDate,
isMedicalDateValue,
isMedicalInjuryPlanActive,
isMedicalItemArchived,
medicalActualParticipationFallback,
parseDateValue: parseScheduleDateValue,
});
const medicalPlanSelectors = createMedicalPlanSelectors({
formatMedicalDateLabel,
getLatestMedicalRecord,
getMedicalDaySpan,
getMedicalPastWindowDates,
getSelectedDate: () => medicalState?.selectedDate,
isMedicalDateValue,
isMedicalPlanCleared,
medicalActualParticipationFallback,
medicalClearanceRoles,
medicalLoadGateOptions,
normalizeMedicalClearance,
normalizeMedicalLoadGates,
parseDateValue: parseScheduleDateValue,
});
const medicalRosterSelectors = createMedicalRosterSelectors({
compareMedicalPlayers,
getLatestMedicalRecord,
getMedicalPlayerPositionRank,
getSelectedDate: () => medicalState?.selectedDate,
medicalPositionOrder,
normalizeMedicalPlayerPosition,
});
const medicalOperationsRenderer = createMedicalOperationsRenderer({
escapeHtml,
formatMedicalDateLabel,
getMedicalCoachHandoverItems,
getMedicalDailyStats,
getMedicalHistoryEvents,
getMedicalRtpPhaseOption,
medicalClearanceRoles,
medicalLoadGateOptions,
renderMedicalCoachHandoverPanel: () => medicalCommandRenderer.renderCoachHandoverPanel(),
renderMedicalDailyHuddle: () => medicalCommandRenderer.renderDailyHuddle(),
});
const medicalCommandRenderer = createMedicalCommandRenderer({
escapeHtml,
formatMedicalDateLabel,
getActiveMedicalPlayers,
getMedicalAttentionPlayers,
getMedicalCoachComment,
getMedicalCoachHandoverItems,
getMedicalDailyHuddle,
getMedicalDailyStats,
getMedicalPositionSummaries,
getMedicalReviewAlerts,
getMedicalRtpPhaseOption,
getSelectedDate: () => medicalState.selectedDate,
});
const {
parseRosterCsvLine: parseMedicalRosterCsvLine,
parseRosterLine: parseMedicalRosterLine,
parseRosterLineParts: parseMedicalRosterLineParts,
parseRosterText: parseMedicalRosterText,
renderBulkUpdatePanel: renderMedicalBulkUpdatePanel,
} = createMedicalRosterHelpers({
escapeHtml,
canEditMedicalTeam,
getBulkRecommendationEligiblePlayers: getMedicalBulkRecommendationEligiblePlayers,
getBulkSelectedPlayers: getMedicalBulkSelectedPlayers,
getMedicalRecommendationActivityContext,
getMedicalRtpPhaseForRecommendation,
getMedicalRtpPhaseOption,
getMedicalStatusForParticipation,
getSelectedDate: () => medicalState.selectedDate,
isBulkRecommendationOpen: () => medicalBulkRecommendationOpen,
normalizeMedicalPlayer,
renderMedicalParticipationOptions,
});
const medicalRosterRenderer = createMedicalRosterRenderer({
escapeHtml,
canEditMedicalTeam,
canViewPrivateMedicalDetails,
formatMedicalDateLabel,
formatScheduleDateValue,
getActiveMedicalPlayers,
getFilteredMedicalPlayers,
getLatestMedicalRecord,
getMedicalDailyStats,
getMedicalMonthAverageStats,
getMedicalPlayerSquadAvailabilityBlockReason,
getMedicalRecommendationActivityContext,
getMedicalRecordStatus,
getMedicalRosterPositionGroups,
getMedicalRosterPositionStats,
getMedicalScheduleSummary,
getMedicalStatusForParticipation,
getMedicalStatusOptionForDate,
getMedicalValidBulkSelection,
getMedicalVisibleComment,
getMedicalWindowAverage,
getMedicalWindowDates,
getRosterSearchQuery: () => medicalRosterSearchQuery,
getSelectedDate: () => medicalState.selectedDate,
getSelectedPlayerId: () => medicalState.selectedPlayerId,
getStatusFilter: () => medicalStatusFilter,
isPlayerModalOpen: () => medicalPlayerModalOpen,
isTemporaryPlayerProfile,
medicalParticipationOptions,
medicalStatusOptions,
renderMedicalBulkUpdatePanel,
renderMedicalMetric,
renderMedicalOperationsSystem,
renderMedicalPlayerAvatar,
renderMedicalSquadAvailabilityBadge,
renderMedicalTemporaryPlayerBadge,
});
const medicalRecommendationRenderer = createMedicalRecommendationRenderer({
escapeHtml,
canEditMedicalTeam,
formatMedicalDateLabel,
getMedicalPlayerInjuryPlans,
getMedicalPlayerRestrictedLogRecords,
getMedicalRecordStatus,
getMedicalRtpPhaseOption,
getMedicalStatusForParticipation,
getMedicalStatusOption,
getSelectedDate: () => medicalState.selectedDate,
isMedicalInjuryPlanActive,
isMedicalItemArchived,
isMedicalPlanCleared,
medicalActualParticipationFallback,
medicalInjuryPlanStatusOptions,
medicalParticipationOptions,
normalizeMedicalActualParticipation,
});
const medicalPlanFormRenderer = createMedicalPlanFormRenderer({
escapeHtml,
getActiveMedicalInjuryPlan,
getMedicalInjuryPlanDraft,
getMedicalPlayerInjuryPlans,
getSelectedDate: () => medicalState.selectedDate,
isMedicalPlanCleared,
medicalClearanceRoles,
medicalInjuryDurationPresets,
medicalLoadGateOptions,
normalizeMedicalClearance,
normalizeMedicalLoadGates,
renderMedicalDurationUnitOptions,
renderMedicalGateOptions,
renderMedicalInjuryPlanStatusOptions: (selectedStatus) => medicalRecommendationRenderer.renderInjuryPlanStatusOptions(selectedStatus),
renderMedicalParticipationOptions,
renderMedicalRtpPhaseOptions,
});
const medicalProfileSummaryRenderer = createMedicalProfileSummaryRenderer({
escapeHtml,
formatMedicalDateLabel,
clearanceRoleCount: medicalClearanceRoles.length,
loadGateCount: medicalLoadGateOptions.length,
});
const medicalProfileSummarySelectors = createMedicalProfileSummarySelectors({
getActiveMedicalInjuryPlan,
getLatestMedicalRecord,
getMedicalCoachComment,
getMedicalDaySpan,
getMedicalPastWindowDates,
getMedicalPlayerInjuryPlans,
getMedicalPlayerRecords,
getMedicalRecordStatus,
getMedicalRtpPhaseOption,
isMedicalPlanCleared,
isMedicalRestrictedRecommendationRecord,
medicalClearanceRoles,
medicalLoadGateOptions,
normalizeMedicalClearance,
normalizeMedicalLoadGates,
});
const medicalPlayerModalRenderer = createMedicalPlayerModalRenderer({
escapeHtml,
canEditMedicalTeam,
formatMedicalDateLabel,
getLatestMedicalRecord,
getMedicalCoachComment,
getMedicalPlayerSquadAvailabilityBlockReason,
getMedicalRecommendationActivityContext,
getMedicalRecordStatus,
getMedicalRtpPhaseForRecommendation,
getMedicalRtpPhaseOption,
getMedicalStatusForParticipation,
getMedicalStatusOption,
getMedicalStatusOptionForDate,
getMedicalWindowDates,
getMedicalPlayerRestrictedLogRecords,
getPlayerModalOpen: () => medicalPlayerModalOpen,
getPlayerModalTab: () => medicalPlayerModalTab,
getSelectedDate: () => medicalState.selectedDate,
getSelectedMedicalPlayer,
medicalActualParticipationFallback,
medicalPlayerModalTabOptions,
normalizeMedicalPlayerModalTab,
renderMedicalActualPresets: (selectedValue, canEdit) => medicalRecommendationRenderer.renderActualPresets(selectedValue, canEdit),
renderMedicalClearanceChecklist: (player, canEdit) => medicalPlanFormRenderer.renderClearanceChecklist(player, canEdit),
renderMedicalInjuryPlanForm: (player, canEdit) => medicalPlanFormRenderer.renderInjuryPlanForm(player, canEdit),
renderMedicalLogCard: (player) => medicalRecommendationRenderer.renderLogCard(player),
renderMedicalLog: (player) => medicalRecommendationRenderer.renderLog(player),
renderMedicalNewPlayerCard: () => medicalRosterRenderer.renderNewPlayerCard(),
renderMedicalPlanListCard: (player) => medicalRecommendationRenderer.renderPlanListCard(player),
renderMedicalActualParticipationOptions,
renderMedicalParticipationOptions,
renderMedicalPlayerAvatar,
renderMedicalPlayerProfileSummary: (player) => medicalProfileSummaryRenderer.render(getMedicalPlayerProfileSummary(player, medicalState.selectedDate)),
renderMedicalRecommendationPresets: (selectedParticipation, canEdit) => medicalRecommendationRenderer.renderRecommendationPresets(selectedParticipation, canEdit),
renderMedicalRtpPhaseOptions,
renderMedicalStatusOptions,
});
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
const adminStructureRenderer = createAdminStructureRenderer({
escapeHtml,
getAssignableRolesForUser,
getRoleLabel,
getScopedClubs: getScopedPlatformClubs,
getScopedTeams: getScopedPlatformTeams,
getClubById: getPlatformClubById,
getUsersForTeam: getAdminUsersForTeam,
getUserClubId,
getUserScopeLabel,
isPlatformAdminUser,
normalizePlatformRole,
hasWorkspaceScope: hasPlatformWorkspaceScope,
isLegacyTeam: isLegacyPlatformTeam,
isLegacyTeamPlaceholderName: isLegacyPlatformTeamPlaceholderName,
renderTeamLogoMark: renderPlatformTeamLogoMark,
renderMiniUserStack: (users) => adminUserRenderer.renderMiniUserStack(users),
defaultTeamId: platformDefaultTeamId,
});
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
function getPlatformAuthStore() {
return win.platformAuthStore ?? null;
}
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
function setFormSubmitButtonState(form, options = {}) {
const {
isSubmitting = false,
submittingLabel = "Saving...",
defaultLabel = "Save",
} = options;
if (!form || typeof form.querySelector !== "function") {
return;
}
const submitButton = form.querySelector('button[type="submit"], [data-admin-create-user-submit]');
if (!submitButton) {
return;
}
if (isSubmitting) {
if (submitButton.dataset.savedLabel == null) {
submitButton.dataset.savedLabel = String(submitButton.textContent || defaultLabel);
}
submitButton.disabled = true;
submitButton.textContent = submittingLabel;
return;
}
submitButton.disabled = false;
submitButton.textContent = submitButton.dataset.savedLabel || defaultLabel;
delete submitButton.dataset.savedLabel;
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
function getCurrentPlatformUser() {
return platformUser ?? syncPlatformUserFromAuth();
}
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
function getPlatformUsers() {
return getPlatformAuthStore()?.getUsers?.() ?? [];
}
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
function formatUserName(user) {
return formatPlatformUserName(user);
}
function getUserInitials(user) {
return getPlatformUserInitials(user);
}
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
function isProfileMenuOpen() {
return Boolean(ui.profileMenu && !ui.profileMenu.hidden);
}
function getRoleLabel(role) {
return getPlatformRoleLabel(role);
}
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
function isPlatformAdminUser(user) {
return normalizePlatformRole(user?.role, "") === "admin";
}
function isPlatformManagementUser(user) {
return platformManagementRoleSet.has(normalizePlatformRole(user?.role, ""));
}
function isPlatformStaffUser(user) {
return platformStaffRoleSet.has(normalizePlatformRole(user?.role, ""));
}
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
function cloneDefaultPlatformStructureState() {
return cloneDefaultPlatformStructureStateFromModule();
}
function normalizePlatformStructureText(value, fallback = "") {
return normalizePlatformStructureTextFromModule(value, fallback);
}
function normalizePlatformStructureComparable(value = "") {
return normalizePlatformStructureComparableFromModule(value);
}
function isLegacyPlatformStructureValue(value = "") {
return isLegacyPlatformStructureValueFromModule(value);
}
function isCanonicalPlatformClubValue(value = "") {
return isCanonicalPlatformClubValueFromModule(value);
}
function isCanonicalPlatformTeamValue(value = "") {
return isCanonicalPlatformTeamValueFromModule(value);
}
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
function slugifyPlatformStructureValue(value, fallback = "scope") {
return slugifyPlatformStructureValueFromModule(value, fallback);
}
function normalizePlatformStructureId(value, prefix, fallbackLabel) {
return normalizePlatformStructureIdFromModule(value, prefix, fallbackLabel);
}
function createPlatformStructureId(prefix, label, usedIds = new Set()) {
return createPlatformStructureIdFromModule(prefix, label, usedIds);
}
function normalizePlatformClub(club = {}, fallback = {}) {
return normalizePlatformClubFromModule(club, fallback);
}
function normalizePlatformTeam(team = {}, fallback = {}) {
return normalizePlatformTeamFromModule(team, fallback);
}
function normalizePlatformStructureState(candidate = {}) {
return normalizePlatformStructureStateFromModule(candidate);
}
function isLegacyPlatformTeamPlaceholderName(value = "") {
return isLegacyPlatformTeamPlaceholderNameFromModule(value);
}
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
function getPlatformStructureState() {
return readPlatformStructureState();
}
function getPlatformClubById(clubId, structure = getPlatformStructureState()) {
return structure.clubs.find((club) => club.id === clubId) ?? structure.clubs[0] ?? null;
}
function getPlatformTeamById(teamId, structure = getPlatformStructureState()) {
return structure.teams.find((team) => team.id === teamId) ?? structure.teams[0] ?? null;
}
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
function isSamePlatformClub(firstUser, secondUser, structure = getPlatformStructureState()) {
return getUserClubId(firstUser, structure) === getUserClubId(secondUser, structure);
}
function isSamePlatformTeam(firstUser, secondUser, structure = getPlatformStructureState()) {
return getUserTeamId(firstUser, structure) === getUserTeamId(secondUser, structure);
}
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
function getScopedPlatformUsers(users = getPlatformUsers(), actor = getCurrentPlatformUser(), structure = getPlatformStructureState()) {
return users.filter((user) => canAdminViewUser(actor, user, structure));
}
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
function renderAdminRoleOptions(actor, selectedRole = "coach") {
return adminStructureRenderer.renderRoleOptions(actor, selectedRole);
}
function renderAdminTeamOptions(actor, structure, selectedTeamId = "") {
return adminStructureRenderer.renderTeamOptions(actor, structure, selectedTeamId);
}
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
function getWorkspaceByIdFromPool(workspaceId, sourceState = hubState) {
return getAllWorkspacePool(sourceState).find((workspace) => workspace.id === workspaceId) ?? null;
}
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
function canCurrentUserAccessWorkspace(workspace) {
return canUserAccessWorkspace(workspace);
}
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
function canCurrentUserEditWorkspace(workspaceId) {
return canUserEditWorkspace(workspaceId);
}
function canEditScheduleWorkspace() {
return canCurrentUserEditWorkspace("schedule");
}
function canEditSessionPlanner() {
return canCurrentUserEditWorkspace("session-planner");
}
function canEditPeriodizationWorkspace() {
return canCurrentUserEditWorkspace("periodization");
}
function canEditGameSimulatorWorkspace() {
return canCurrentUserEditWorkspace("game-simulator");
}
function canEditScoutingWorkspace() {
return canCurrentUserEditWorkspace("scouting");
}
function getAccessibleWorkspacePool() {
return getAllWorkspacePool().filter((workspace) => canCurrentUserAccessWorkspace(workspace));
}
function getVisibleWorkspacePool() {
return getAccessibleWorkspacePool().filter((workspace) => !workspace.hiddenFromNav);
}
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
function getPeriodizationDay(dateValue) {
return getPeriodizationDayFromState(dateValue, periodizationState);
}
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
setActiveWorkspace,
loadScoutingWorkspaceModule: () => loadScoutingWorkspaceModule(),
getScoutingWorkspaceContext: () => getScoutingWorkspaceContext(),
logEvent,
});
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
let gpModule = null;
function getGameplanContext() {
return {
users: getPlatformUsers(),
currentUser: getCurrentPlatformUser(),
getScheduleState: () => scheduleState || readScheduleState(),
getPlayerProfilesState: () => playerProfilesState || readPlayerProfilesState(),
canEdit: () => canCurrentUserEditWorkspace("gameplan"),
getAuthToken: getPlatformApiAccessToken,
suppressCentralWrites: (key) => centralStateWriteSuppressionKeys.add(key),
unsuppressCentralWrites: (key) => centralStateWriteSuppressionKeys.delete(key),
};
}
function loadGameplanModule() {
if (gpModule) {
return Promise.resolve(gpModule);
}
return Promise.all([
platformModuleLoader.loadStylesheet("gameplan", "gameplan.css", {
id: "gameplanStylesheet",
required: true,
}),
platformModuleLoader.loadModule("gameplan", () => import(`./gameplan.js?v=${encodeURIComponent(platformAssetVersion)}`)),
])
.then(([, module]) => {
gpModule = module;
return module;
});
}
function renderGameplanWorkspace() {
if (!ui.gameplanWorkspace) {
return;
}
if (!gpModule) {
ui.gameplanWorkspace.textContent = "Loading Gameplan";
loadGameplanModule()
.then((module) => module.render(getGameplanContext()))
.catch(() => {
ui.gameplanWorkspace.textContent = "Gameplan could not load";
});
return;
}
gpModule.render(getGameplanContext());
}
let scoutingWorkspaceModulePromise = null;
let scoutingWorkspaceModule = null;
let scoutingMenuPreloadTimer = 0;
function getScoutingWorkspaceContext() {
return {
ui,
platformModuleLoader,
escapeHtml,
teamName: (() => {
const currentUser = getCurrentPlatformUser();
return normalizePlatformStructureText(currentUser?.team || currentUser?.teamName || currentUser?.clubName || currentUser?.club, "") || getUserTeamName(currentUser);
})(),
ensureState: ensureScoutingState,
writeState: writeScoutingState,
canEdit: canEditScoutingWorkspace,
canSendToTransferRoom: canUserEditTransferRoom,
sendToTransferRoom: addTransferRoomTargetFromScoutingSnapshot,
tabs: scoutingTabs,
shadowSlots: scoutingShadowSlots,
coreMetricOptions: scoutingCoreMetricOptions,
scoutingStatusOptions,
scoutingPriorityOptions,
};
}
function getScoutingAnalysisRoomContext() {
const context = getScoutingWorkspaceContext();
return {
...context,
ui: {
...context.ui,
scoutingWorkspace: ui.analysisRoomWorkspace,
},
};
}
function loadScoutingWorkspaceModule() {
if (scoutingWorkspaceModule) {
return Promise.resolve(scoutingWorkspaceModule);
}
if (!scoutingWorkspaceModulePromise) {
scoutingWorkspaceModulePromise = Promise.all([
platformModuleLoader.loadStylesheet("scouting-workspace", "scouting-workspace.css", {
id: "scoutingWorkspaceStylesheet",
required: true,
}),
platformModuleLoader.loadModule("scouting-workspace", () => import(`./scouting-workspace.js?v=${encodeURIComponent(platformAssetVersion)}`)),
])
.then(([, module]) => {
scoutingWorkspaceModule = module;
return module;
})
.catch((error) => {
scoutingWorkspaceModulePromise = null;
throw error;
});
}
return scoutingWorkspaceModulePromise;
}
function loadScoutingWorkspaceModuleAfterPaint() {
return new Promise((resolve, reject) => {
const scheduleLoad = () => {
loadScoutingWorkspaceModule().then(resolve).catch(reject);
};
if (typeof win.requestAnimationFrame === "function") {
win.requestAnimationFrame(() => win.requestAnimationFrame(scheduleLoad));
return;
}
win.setTimeout(scheduleLoad, 0);
});
}
function renderScoutingWorkspace() {
if (!ui.scoutingWorkspace) {
return;
}
if (!scoutingWorkspaceModule) {
ui.scoutingWorkspace.innerHTML = `
      <section class="scouting-shell">
        <section class="scouting-load-panel">
          <h2>Loading Scouting</h2>
          <p>Preparing the Shadow XI workspace and scouting database.</p>
        </section>
      </section>
    `;
loadScoutingWorkspaceModuleAfterPaint()
.then((module) => module.render(getScoutingWorkspaceContext()))
.catch(() => {
ui.scoutingWorkspace.innerHTML = `
          <section class="scouting-shell">
            <section class="scouting-load-panel">
              <h2>Scouting could not load</h2>
              <p>Refresh and try again.</p>
            </section>
          </section>
        `;
});
return;
}
scoutingWorkspaceModule.render(getScoutingWorkspaceContext());
}
function renderAnalysisRoomWorkspace() {
if (!ui.analysisRoomWorkspace) {
return;
}
if (!scoutingWorkspaceModule) {
ui.analysisRoomWorkspace.innerHTML = `
      <section class="scouting-shell">
        <section class="scouting-load-panel">
          <h2>Loading Analysis Room</h2>
          <p>Preparing the own-team performance room.</p>
        </section>
      </section>
    `;
loadScoutingWorkspaceModule()
.then((module) => module.renderAnalysisRoom(getScoutingAnalysisRoomContext()))
.catch(() => {
ui.analysisRoomWorkspace.innerHTML = `
          <section class="scouting-shell">
            <section class="scouting-load-panel">
              <h2>Analysis Room could not load</h2>
              <p>Refresh and try again.</p>
            </section>
          </section>
        `;
});
return;
}
scoutingWorkspaceModule.renderAnalysisRoom(getScoutingAnalysisRoomContext());
}
function getTransferRoomWorkspaceContext() { return transferRoomRuntime.getContext(); }
function loadTransferRoomWorkspaceModule() { return transferRoomRuntime.loadWorkspaceModule(); }
function renderTransferRoomWorkspace() { return transferRoomRuntime.render(); }
function getScheduleEventsForDate(dateValue) {
if (!scheduleState) {
scheduleState = readScheduleState();
}
return getUniqueScheduleEvents(scheduleState.events.filter((event) => event.date === dateValue))
.sort((a, b) => `${a.time || "99:99"} ${a.title}`.localeCompare(`${b.time || "99:99"} ${b.title}`));
}
function getScheduleVisibleEvents(events = []) {
return getUniqueScheduleEvents(events);
}
function getScheduleMainEvent(events = []) {
return getScheduleMainEventFromModule(events);
}
function isScheduleSessionEvent(event) {
return isScheduleSessionEventFromModule(event);
}
function getScheduleSessionEventForDate(dateValue) {
return getScheduleEventsForDate(dateValue).find(isScheduleSessionEvent) ?? null;
}
function getScheduledSessionTitleForDate(dateValue) {
return getScheduleSessionEventForDate(dateValue)?.title || "";
}
function getScheduleMonthEvents(year, monthIndex) {
if (!scheduleState) {
return [];
}
return getUniqueScheduleEvents(
scheduleState.events.filter((event) => {
const eventDate = parseScheduleDateValue(event.date);
return eventDate.getFullYear() === year && eventDate.getMonth() === monthIndex;
})
);
}
function getScheduleVisibleMonthEvents(year, monthIndex) {
return getScheduleVisibleEvents(getScheduleMonthEvents(year, monthIndex));
}
function isEditableKeyboardTarget(target) {
const element = target instanceof Element ? target : null;
if (!element) {
return false;
}
return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}
function getScheduleSelectedDayContext(dateValue) {
ensurePeriodizationState();
const periodizationDay = getPeriodizationDay(dateValue);
const phaseLabels = [
...(Array.isArray(periodizationDay.matchPhases) ? periodizationDay.matchPhases : []),
...(Array.isArray(periodizationDay.subPhases) ? periodizationDay.subPhases : []),
].slice(0, 3);
return {
sessionSnapshot: getScheduleSessionSnapshot(dateValue),
periodizationLabel: getPeriodizationDayScheduleLabel(periodizationDay),
matchDayLabel: getPeriodizationMatchDayLabel(periodizationDay.matchDay),
phaseSummary: phaseLabels.join(" / "),
};
}
function getScheduleSessionSnapshot(dateValue) {
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
const session = sessionPlannerState?.sessions?.[dateValue] || null;
const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
return {
session,
blocks,
hasSession: blocks.length > 0,
minutes: blocks.reduce((total, block) => total + (Number(block.minutes) || 0), 0),
};
}
function formatScheduleBlockSummary(blockCount, minutes = 0) {
return formatScheduleBlockSummaryFromModule(blockCount, minutes);
}
function getScheduleDayWarnings(events, periodizationDay, sessionSnapshot) {
return getScheduleDayWarningsFromModule(events, periodizationDay, sessionSnapshot, {
isSessionEvent: isScheduleSessionEvent,
getPeriodizationDayScheduleLabel,
getPeriodizationMatchDayLabel,
});
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
function renderScheduleWorkspace() {
scheduleWorkspaceController.render();
}
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
function getWorkspaceQuery() {
return ui.workspaceSearch?.value.trim().toLowerCase() ?? "";
}
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
function getDashboardDateLabel() {
return new Intl.DateTimeFormat("en-GB", {
weekday: "long",
day: "numeric",
month: "long",
}).format(new Date());
}
function escapeHtml(value) {
return String(value)
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;");
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
function normalizeDashboardTask(task) {
const currentUser = getCurrentPlatformUser();
const title = String(task?.title ?? "").trim();
const assignedTo = task?.assignedTo || currentUser?.id || "";
const createdBy = task?.createdBy || currentUser?.id || assignedTo;
return {
id: task?.id || createDashboardId("task"),
title,
note: String(task?.note ?? "").trim(),
assignedTo,
createdBy,
scope: task?.scope === "personal" ? "personal" : "team",
status: task?.status === "done" ? "done" : "open",
createdAt: task?.createdAt || new Date().toISOString(),
completedAt: task?.completedAt || "",
};
}
function readDashboardTasks() {
const parsed = readDashboardJson(dashboardTaskStorageKey, []);
return Array.isArray(parsed)
? parsed
.map(normalizeDashboardTask)
.filter((task) => task.title && task.assignedTo)
.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
: [];
}
function writeDashboardTasks(tasks) {
writeDashboardJson(dashboardTaskStorageKey, tasks.map(normalizeDashboardTask));
}
function createDashboardTask(values) {
const currentUser = getCurrentPlatformUser();
const title = String(values?.title ?? "").trim();
if (!currentUser || !title) {
return null;
}
const task = normalizeDashboardTask({
title,
note: values?.note ?? "",
assignedTo: values?.assignedTo || currentUser.id,
createdBy: currentUser.id,
scope: values?.scope ?? "team",
});
writeDashboardTasks([task, ...readDashboardTasks()]);
return task;
}
function updateDashboardTask(taskId, patch) {
const tasks = readDashboardTasks();
const nextTasks = tasks.map((task) => {
if (task.id !== taskId) {
return task;
}
const nextStatus = patch?.status ?? task.status;
return normalizeDashboardTask({
...task,
...patch,
completedAt:
nextStatus === "done"
? patch?.completedAt || task.completedAt || new Date().toISOString()
: "",
});
});
writeDashboardTasks(nextTasks);
}
function removeDashboardTask(taskId) {
writeDashboardTasks(readDashboardTasks().filter((task) => task.id !== taskId));
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
function normalizeDashboardUserIdentityValue(value = "") {
return String(value || "").trim().toLowerCase();
}
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
function getDashboardChatActiveToastThreadId() {
return normalizeDashboardChatThreadId(readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
}
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
function isDashboardDocumentActivelyViewed() {
return document.visibilityState === "visible" && document.hasFocus();
}
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
function getDashboardMessagesFromIdentityMap(messageMap) {
return Array.from(new Set(messageMap.values())).sort(compareDashboardChatMessages);
}
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
function retryDashboardMessageWithApi(messageId) {
return dashboardChatApiUiActions.retryMessageWithApi(messageId);
}
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
function setDashboardChatPriorityDraft(priority) {
dashboardChatPriorityDraft = normalizeDashboardChatPriority(priority);
}
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
function clearDashboardMessages() {
writeDashboardMessages([]);
}
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
function getDashboardPresenceEntry(userId) {
return dashboardPresenceEntriesByUserId[String(userId || "").trim()] || null;
}
function getDashboardPresenceStatus(userId) {
return resolveDashboardPresenceStatus(getDashboardPresenceEntry(userId), String(userId || "").trim());
}
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
function markDashboardPresenceActivity() {
dashboardPresenceLastActivityAt = Date.now();
}
function getDashboardPresenceWorkspaceId() {
return hubState?.activeWorkspaceId || "";
}
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
function formatDashboardTime(value) {
const date = new Date(value);
if (Number.isNaN(date.getTime())) {
return "";
}
const today = new Date();
const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const dayDiff = Math.round((startOfToday - startOfDate) / (24 * 60 * 60 * 1000));
const timeLabel = new Intl.DateTimeFormat("en-GB", {
hour: "2-digit",
minute: "2-digit",
}).format(date);
if (dayDiff === 0) {
return timeLabel;
}
if (dayDiff === 1) {
return `Yesterday ${timeLabel}`;
}
const dateOptions = date.getFullYear() === today.getFullYear()
? { day: "2-digit", month: "short" }
: { day: "2-digit", month: "short", year: "numeric" };
return `${new Intl.DateTimeFormat("en-GB", dateOptions).format(date)} ${timeLabel}`;
}
function formatDashboardDateTime(value) {
const date = new Date(value);
if (Number.isNaN(date.getTime())) {
return "";
}
return new Intl.DateTimeFormat("en-GB", {
day: "2-digit",
month: "short",
hour: "2-digit",
minute: "2-digit",
}).format(date);
}
function getDashboardMessageById(messageId, messages = readDashboardMessages()) {
return messages.find((message) => message.id === messageId) || null;
}
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
function getDashboardSessionPlannerState() {
return dashboardHomeContextSelectors.getSessionPlannerState();
}
function getDashboardTodayValue() {
return dashboardHomeContextSelectors.getTodayValue();
}
function getDashboardSessionTotalMinutes(session) {
return dashboardHomeContextSelectors.getSessionTotalMinutes(session);
}
function getDashboardHomeContext(currentUser, users, tasks) {
return dashboardHomeContextSelectors.getHomeContext(currentUser, users, tasks);
}
function readPlatformAppearanceState() {
return normalizePlatformAppearanceConfig(rawDataSafetyGetItem(platformAppearanceStorageKey) || {});
}
function writePlatformAppearanceState(config) {
const currentUser = getCurrentPlatformUser();
const normalizedValue = normalizePlatformAppearanceValue(config, {
updatedAt: new Date().toISOString(),
updatedBy: currentUser?.id || "",
});
localStorage.setItem(platformAppearanceStorageKey, normalizedValue);
return JSON.parse(normalizedValue);
}
function getDashboardTutorialPrefs() {
const parsed = readDashboardJson(dashboardTutorialPrefsStorageKey, {});
return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
function writeDashboardTutorialPrefs(prefs) {
writeDashboardJson(dashboardTutorialPrefsStorageKey, prefs);
}
function getDashboardTutorialPreference(userId) {
return getDashboardTutorialPrefs()[userId] ?? null;
}
function saveDashboardTutorialPreference(userId, showOnLogin) {
if (!userId) {
return;
}
writeDashboardTutorialPrefs({
...getDashboardTutorialPrefs(),
[userId]: {
showOnLogin: Boolean(showOnLogin),
seenAt: new Date().toISOString(),
},
});
}
function shouldShowDashboardTutorialOnLogin(user) {
if (!user?.id) {
return false;
}
const preference = getDashboardTutorialPreference(user.id);
return Boolean(preference?.showOnLogin);
}
function getDashboardNewsSeenMap() {
const parsed = readDashboardJson(dashboardNewsSeenStorageKey, {});
return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
function hasSeenDashboardNews(userId) {
return getDashboardNewsSeenMap()[userId] === dashboardNewsVersion;
}
function markDashboardNewsSeen(userId) {
if (!userId) {
return;
}
writeDashboardJson(dashboardNewsSeenStorageKey, {
...getDashboardNewsSeenMap(),
[userId]: dashboardNewsVersion,
});
}
let dashboardModalAfterClose = null;
let dashboardPopupsScheduledForUserId = null;
function getDashboardModalRoot() {
let root = getElement("dashboardModalRoot");
if (!root) {
root = document.createElement("div");
root.id = "dashboardModalRoot";
root.className = "dashboard-modal-root";
root.hidden = true;
document.body.appendChild(root);
}
return root;
}
function closeDashboardModal(runAfterClose = true) {
const root = getDashboardModalRoot();
root.hidden = true;
root.innerHTML = "";
const afterClose = dashboardModalAfterClose;
dashboardModalAfterClose = null;
if (runAfterClose && typeof afterClose === "function") {
afterClose();
}
}
function showDashboardTutorialModal(options = {}) {
if (document.body?.dataset.activeWorkspace && document.body.dataset.activeWorkspace !== "home") {
return;
}
const user = getCurrentPlatformUser();
if (!user) {
return;
}
const preference = getDashboardTutorialPreference(user.id);
const shouldShowNext = Boolean(preference?.showOnLogin);
const root = getDashboardModalRoot();
dashboardModalAfterClose = options.afterClose ?? null;
root.innerHTML = dashboardHomeCardsRenderer.renderTutorialModal({ shouldShowNext });
root.hidden = false;
root.querySelector(".dashboard-modal-actions [data-dashboard-tutorial-save]")?.focus();
}
function showDashboardNewsModal() {
dashboardModalAfterClose = null;
closeDashboardModal(false);
if (document.body?.dataset.activeWorkspace && document.body.dataset.activeWorkspace !== "home") {
return;
}
const newsSeenMap = getDashboardNewsSeenMap();
const user = getCurrentPlatformUser();
if (user?.id && newsSeenMap[user.id] !== dashboardNewsVersion) {
markDashboardNewsSeen(user.id);
}
return;
}
function maybeShowDashboardNewsModal() {
const user = getCurrentPlatformUser();
if (!user || hasSeenDashboardNews(user.id)) {
return;
}
showDashboardNewsModal();
}
function scheduleDashboardLoginPopups() {
const user = getCurrentPlatformUser();
if (!user) {
dashboardPopupsScheduledForUserId = null;
closeDashboardModal(false);
return;
}
if (dashboardPopupsScheduledForUserId === user.id) {
return;
}
dashboardPopupsScheduledForUserId = user.id;
win.setTimeout(() => {
const activeUser = getCurrentPlatformUser();
if (!activeUser || activeUser.id !== user.id) {
return;
}
if (shouldShowDashboardTutorialOnLogin(activeUser)) {
showDashboardTutorialModal({
afterClose: maybeShowDashboardNewsModal,
});
return;
}
maybeShowDashboardNewsModal();
}, 350);
}
const gameSimulatorSidebarRenderer = createGameSimulatorSidebarRenderer({
ui,
getState: () => state,
teams,
getSelectedPlayer,
getBallOwner,
getProjectedActionDuration,
formatMeters,
getActionDistance,
computeReachDistance,
getCurrentActionDuration,
getPlayerBallControlPoint,
distance,
getActionOrigin,
getEditableRadius,
getPlayerRoleModel: (...args) => getPlayerRoleModel(...args),
getCompetitionPhysicalLabel,
hasBallAction,
formatTime,
getRemainingBallTravelTime,
getBallProfileLabel,
getDisplayedBallSpeed,
formatSpeed,
getBallStatus,
getActionTypeLabel,
isPlayerRenderedSelected,
describeStep,
createStepThumbnail,
escapeHtml,
playerTendencyTemplates,
});

function renderDashboardCards() {
if (!ui.dashboardGrid) {
return;
}
const currentUser = getCurrentPlatformUser();
if (!currentUser) {
ui.dashboardGrid.innerHTML = "";
return;
}
const users = getPlatformUsers().filter((user) => user.status === "active");
const tasks = readDashboardTasks();
const context = getDashboardHomeContext(currentUser, users, tasks);
const appearance = readPlatformAppearanceState();
const staffOptions = users
.map(
(user) =>
`<option value="${escapeHtml(user.id)}" ${user.id === currentUser.id ? "selected" : ""}>${escapeHtml(formatUserName(user))}</option>`
)
.join("");
ui.dashboardGrid.innerHTML = `
    ${dashboardHomeCardsRenderer.render(context, staffOptions, appearance)}
  `;
syncDashboardChatWidgetNotificationCursor();
}
function refreshDashboardSurfaces(profileMessage = "") {
renderDashboardCards();
if (hubState?.activeWorkspaceId === "my-profile") {
renderProfileWorkspace(profileMessage);
}
}
function createSessionPlannerLibraryExercise(source = {}) {
return exerciseLibraryStateAdapter.createExercise(source);
}
function cloneSessionPlannerLibraryExercise(exercise = {}) {
return exerciseLibraryStateAdapter.cloneExercise(exercise);
}
function normalizeSessionPlannerExerciseLibraryList(sourceLibrary = []) {
return exerciseLibraryStateAdapter.normalizeExercises(sourceLibrary);
}
function normalizeSessionPlannerLibraryVersions(sourceVersions = []) {
return exerciseLibraryStateAdapter.normalizeVersions(sourceVersions);
}
function createSessionPlannerLibraryVersionSnapshot(exercise = {}, reason = "Updated") {
return exerciseLibraryStateAdapter.createVersionSnapshot(exercise, reason);
}
function appendSessionPlannerLibraryVersion(exercise = {}, reason = "Updated") {
return exerciseLibraryStateAdapter.appendVersion(exercise, reason);
}
function isSessionPlannerLibraryExerciseArchived(exercise = {}) {
return exerciseLibraryStateAdapter.isExerciseArchived(exercise);
}
function getSessionPlannerLibraryExercisesByArchiveState(archiveView = sessionPlannerLibraryArchiveView) {
return exerciseLibraryStateAdapter.getExercisesByArchiveState(getSessionPlannerExerciseLibrary(), archiveView);
}
function getSessionPlannerActiveExerciseLibrary() {
return getSessionPlannerLibraryExercisesByArchiveState("active");
}
function getSessionPlannerLibraryArchiveCounts() {
return exerciseLibraryStateAdapter.getArchiveCounts(getSessionPlannerExerciseLibrary());
}
function parseSessionPlannerExerciseLibraryPayload(rawLibrary) {
return exerciseLibraryStateAdapter.parseExercisePayload(rawLibrary);
}
function readSessionPlannerExerciseLibraryFromStorage(storageKey) {
try {
const rawLibrary = win.localStorage.getItem(storageKey);
if (rawLibrary === null) {
return null;
}
const exercises = parseSessionPlannerExerciseLibraryPayload(rawLibrary);
return exercises ? { storageKey, exercises } : null;
} catch {
return null;
}
}
function createSessionPlannerExerciseLibraryBackupEnvelope(exercises = []) {
return exerciseLibraryStateAdapter.createExerciseBackupEnvelope(exercises);
}
function writeSessionPlannerExerciseLibraryToStorage(exercises = []) {
const normalizedLibrary = normalizeSessionPlannerExerciseLibraryList(exercises);
const libraryText = JSON.stringify(normalizedLibrary);
try {
win.localStorage.setItem(sessionPlannerExerciseLibraryStorageKey, libraryText);
} catch (error) {
logEvent(error?.message || "Exercise library could not be saved centrally.");
return {
saved: false,
backupSaved: false,
exercises: normalizedLibrary,
error,
};
}
let backupSaved = true;
try {
win.localStorage.setItem(
sessionPlannerExerciseLibraryBackupStorageKey,
JSON.stringify(createSessionPlannerExerciseLibraryBackupEnvelope(normalizedLibrary))
);
} catch (error) {
backupSaved = false;
logEvent(error?.message || "Exercise library backup could not be saved centrally.");
}
if (typeof saveDataSafetySnapshot === "function") {
saveDataSafetySnapshot("exercise-library-save");
}
return {
saved: true,
backupSaved,
exercises: normalizedLibrary,
error: null,
};
}
async function findSessionPlannerExerciseLibraryInSnapshots() {
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
for (const snapshot of orderedSnapshots) {
const storage = snapshot?.storage && typeof snapshot.storage === "object" ? snapshot.storage : {};
const candidates = [
storage[sessionPlannerExerciseLibraryStorageKey],
storage[sessionPlannerExerciseLibraryBackupStorageKey],
];
for (const rawLibrary of candidates) {
const exercises = parseSessionPlannerExerciseLibraryPayload(rawLibrary);
if (exercises) {
return exercises;
}
}
}
} catch {
return null;
}
return null;
}
function queueSessionPlannerExerciseLibrarySnapshotRecovery() {
if (sessionPlannerExerciseLibrarySnapshotRecoveryQueued) {
return;
}
sessionPlannerExerciseLibrarySnapshotRecoveryQueued = true;
findSessionPlannerExerciseLibraryInSnapshots().then((recoveredExercises) => {
sessionPlannerExerciseLibrarySnapshotRecoveryQueued = false;
if (!recoveredExercises || readSessionPlannerExerciseLibraryFromStorage(sessionPlannerExerciseLibraryStorageKey)) {
return;
}
const writeResult = writeSessionPlannerExerciseLibraryToStorage(recoveredExercises);
if (!writeResult.saved) {
return;
}
sessionPlannerExerciseLibrary = writeResult.exercises;
if (hubState?.activeWorkspaceId === "session-planner") {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast("Exercise Library restored from local backup.");
}
});
}
function readSessionPlannerExerciseLibrary() {
const mainLibrary = readSessionPlannerExerciseLibraryFromStorage(sessionPlannerExerciseLibraryStorageKey);
if (mainLibrary) {
return mainLibrary.exercises;
}
const backupLibrary = readSessionPlannerExerciseLibraryFromStorage(sessionPlannerExerciseLibraryBackupStorageKey);
if (backupLibrary) {
writeSessionPlannerExerciseLibraryToStorage(backupLibrary.exercises);
return backupLibrary.exercises;
}
queueSessionPlannerExerciseLibrarySnapshotRecovery();
return normalizeSessionPlannerExerciseLibraryList(sessionPlannerDefaultExerciseLibrary);
}
function getSessionPlannerExerciseLibrary() {
if (!Array.isArray(sessionPlannerExerciseLibrary)) {
sessionPlannerExerciseLibrary = readSessionPlannerExerciseLibrary();
}
return sessionPlannerExerciseLibrary;
}
function normalizeSessionPlannerLibraryFolderVisibility(value) {
return exerciseLibraryStateAdapter.normalizeFolderVisibility(value);
}
function normalizeSessionPlannerLibraryFolderExerciseIds(sourceIds = []) {
return exerciseLibraryStateAdapter.normalizeFolderExerciseIds(sourceIds);
}
function createSessionPlannerLibraryFolder(source = {}) {
return exerciseLibraryStateAdapter.createFolder(source);
}
function createSessionPlannerDefaultExerciseLibraryFolders() {
return exerciseLibraryStateAdapter.createDefaultFolders();
}
function normalizeSessionPlannerExerciseLibraryFolders(sourceFolders = []) {
return exerciseLibraryStateAdapter.normalizeFolders(sourceFolders);
}
function isSessionPlannerLibraryFolderArchived(folder = {}) {
return exerciseLibraryStateAdapter.isFolderArchived(folder);
}
function parseSessionPlannerExerciseLibraryFoldersPayload(rawFolders) {
return exerciseLibraryStateAdapter.parseFoldersPayload(rawFolders);
}
function readSessionPlannerExerciseLibraryFoldersFromStorage(storageKey) {
try {
const rawFolders = win.localStorage.getItem(storageKey);
if (rawFolders === null) {
return null;
}
const folders = parseSessionPlannerExerciseLibraryFoldersPayload(rawFolders);
return folders ? { storageKey, folders } : null;
} catch {
return null;
}
}
function createSessionPlannerExerciseLibraryFoldersBackupEnvelope(folders = []) {
return exerciseLibraryStateAdapter.createFoldersBackupEnvelope(folders);
}
function writeSessionPlannerExerciseLibraryFoldersToStorage(folders = []) {
const normalizedFolders = normalizeSessionPlannerExerciseLibraryFolders(folders);
const foldersText = JSON.stringify(normalizedFolders);
try {
win.localStorage.setItem(sessionPlannerExerciseLibraryFoldersStorageKey, foldersText);
} catch (error) {
logEvent(error?.message || "Exercise library folders could not be saved centrally.");
return {
saved: false,
backupSaved: false,
folders: normalizedFolders,
error,
};
}
let backupSaved = true;
try {
win.localStorage.setItem(
sessionPlannerExerciseLibraryFoldersBackupStorageKey,
JSON.stringify(createSessionPlannerExerciseLibraryFoldersBackupEnvelope(normalizedFolders))
);
} catch (error) {
backupSaved = false;
logEvent(error?.message || "Exercise library folders backup could not be saved centrally.");
}
if (typeof saveDataSafetySnapshot === "function") {
saveDataSafetySnapshot("exercise-library-folders-save");
}
return {
saved: true,
backupSaved,
folders: normalizedFolders,
error: null,
};
}
function readSessionPlannerExerciseLibraryFolders() {
const mainFolders = readSessionPlannerExerciseLibraryFoldersFromStorage(sessionPlannerExerciseLibraryFoldersStorageKey);
if (mainFolders) {
return mainFolders.folders;
}
const backupFolders = readSessionPlannerExerciseLibraryFoldersFromStorage(sessionPlannerExerciseLibraryFoldersBackupStorageKey);
if (backupFolders) {
writeSessionPlannerExerciseLibraryFoldersToStorage(backupFolders.folders);
return backupFolders.folders;
}
return normalizeSessionPlannerExerciseLibraryFolders(createSessionPlannerDefaultExerciseLibraryFolders());
}
function getSessionPlannerExerciseLibraryFolders() {
if (!Array.isArray(sessionPlannerExerciseLibraryFolders)) {
sessionPlannerExerciseLibraryFolders = readSessionPlannerExerciseLibraryFolders();
}
return sessionPlannerExerciseLibraryFolders;
}
function writeSessionPlannerExerciseLibrary() {
if (!Array.isArray(sessionPlannerExerciseLibrary)) {
return false;
}
const result = writeSessionPlannerExerciseLibraryToStorage(sessionPlannerExerciseLibrary);
if (result.saved) {
sessionPlannerExerciseLibrary = result.exercises;
}
return result.saved;
}
function normalizeSessionPlannerMultiValue(value) {
return exerciseLibrarySelectors.normalizeMultiValue(value);
}
function formatSessionPlannerMultiValue(value) {
return exerciseLibrarySelectors.formatMultiValue(value);
}
function normalizeSessionPlannerLibraryTags(value) {
return exerciseLibraryStateAdapter.normalizeTags(value);
}
function formatSessionPlannerLibraryTags(value) {
return normalizeSessionPlannerLibraryTags(value).join(", ");
}
function getSessionPlannerMultiValueSummary(value, fallback) {
return exerciseLibrarySelectors.getMultiValueSummary(value, fallback);
}
function getSessionPlannerMultiSelectFieldConfig(field) {
const configs = {
phase: {
label: "Phase",
listOptions: periodizationOptionLibrary.matchPhases,
},
subPhase: {
label: "Sub Phase",
listOptions: periodizationOptionLibrary.subPhases,
},
};
return configs[field] ?? null;
}
function refreshSessionPlannerMultiSelectFields(fields = []) {
const block = getSessionPlannerSelectedBlock();
const fieldList = Array.from(new Set((Array.isArray(fields) ? fields : [fields]).filter(Boolean)));
if (!block || !fieldList.length) {
return;
}
let refreshedAnyField = false;
fieldList.forEach((field) => {
const config = getSessionPlannerMultiSelectFieldConfig(field);
const fieldElement = ui.sessionPlannerWorkspace?.querySelector(`[data-session-multiselect="${field}"]`);
if (!config || !fieldElement) {
return;
}
fieldElement.outerHTML = sessionPlannerRenderer.renderMultiSelectField(block, field, config.label, {
long: false,
listOptions: config.listOptions,
});
refreshedAnyField = true;
});
if (!refreshedAnyField) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
}
function toggleSessionPlannerMultiSelectValue(field, value) {
if (!sessionPlannerMultiSelectFields.has(field) || !value) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const values = normalizeSessionPlannerMultiValue(block[field]);
const nextValues = values.includes(value)
? values.filter((item) => item !== value)
: [...values, value];
updateSelectedSessionPlannerBlockField(field, nextValues.join(", "));
sessionPlannerMultiSelectOpenField = field;
refreshSessionPlannerMultiSelectFields([field]);
}
function clearSessionPlannerMultiSelectValue(field) {
if (!sessionPlannerMultiSelectFields.has(field)) {
return;
}
updateSelectedSessionPlannerBlockField(field, "");
sessionPlannerMultiSelectOpenField = field;
refreshSessionPlannerMultiSelectFields([field]);
}
function normalizeSessionPlannerLibraryFilterValues(value) {
return exerciseLibrarySelectors.normalizeFilterValues(value);
}
function getSessionPlannerLibraryFilterValues(filterKey) {
if (filterKey === "phase") {
return normalizeSessionPlannerLibraryFilterValues(
sessionPlannerLibraryPhaseFilters.length ? sessionPlannerLibraryPhaseFilters : sessionPlannerLibraryPhaseFilter
);
}
if (filterKey === "subPhase") {
return normalizeSessionPlannerLibraryFilterValues(
sessionPlannerLibrarySubPhaseFilters.length
? sessionPlannerLibrarySubPhaseFilters
: sessionPlannerLibrarySubPhaseFilter
);
}
return [];
}
function setSessionPlannerLibraryFilterValues(filterKey, values = []) {
const normalizedValues = normalizeSessionPlannerLibraryFilterValues(values);
if (filterKey === "phase") {
sessionPlannerLibraryPhaseFilters = normalizedValues;
sessionPlannerLibraryPhaseFilter = normalizedValues[0] || "all";
}
if (filterKey === "subPhase") {
sessionPlannerLibrarySubPhaseFilters = normalizedValues;
sessionPlannerLibrarySubPhaseFilter = normalizedValues[0] || "all";
}
}
function toggleSessionPlannerLibraryFilterOpen(filterKey) {
sessionPlannerLibraryFilterOpen = sessionPlannerLibraryFilterOpen === filterKey ? "" : filterKey;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function toggleSessionPlannerLibraryFilterValue(filterKey, value) {
const cleanValue = String(value || "").trim();
if (!cleanValue) {
return;
}
const currentValues = getSessionPlannerLibraryFilterValues(filterKey);
const nextValues = currentValues.includes(cleanValue)
? currentValues.filter((item) => item !== cleanValue)
: [...currentValues, cleanValue];
setSessionPlannerLibraryFilterValues(filterKey, nextValues);
sessionPlannerLibraryFilterOpen = filterKey;
sessionPlannerLibraryEditExerciseId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function clearSessionPlannerLibraryFilter(filterKey) {
setSessionPlannerLibraryFilterValues(filterKey, []);
sessionPlannerLibraryFilterOpen = filterKey;
sessionPlannerLibraryEditExerciseId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function exerciseMatchesSessionPlannerLibraryFilterValue(exerciseValue, selectedValues = []) {
return exerciseLibrarySelectors.exerciseMatchesFilterValue(exerciseValue, selectedValues);
}
function getSessionPlannerVisibleLibraryFolders() {
return getSessionPlannerExerciseLibraryFolders()
.filter((folder) => !isSessionPlannerLibraryFolderArchived(folder))
.sort((a, b) => {
const visibilitySort = a.visibility.localeCompare(b.visibility);
return visibilitySort || a.name.localeCompare(b.name);
});
}
function getSessionPlannerArchivedLibraryFolders() {
return getSessionPlannerExerciseLibraryFolders()
.filter((folder) => isSessionPlannerLibraryFolderArchived(folder))
.sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")) || a.name.localeCompare(b.name));
}
function getSessionPlannerLibraryFolderById(folderId) {
const targetId = String(folderId || "").trim();
if (!targetId) {
return null;
}
return getSessionPlannerExerciseLibraryFolders().find((folder) => folder.id === targetId) || null;
}
function getSessionPlannerLibraryFolderExerciseIdSet(folderId = sessionPlannerLibrarySelectedFolderId) {
const targetFolderId = String(folderId || "all");
const currentUserId = getSessionPlannerLibraryUserId();
const visibleFolders = getSessionPlannerVisibleLibraryFolders();
if (targetFolderId === "all") {
return null;
}
if (targetFolderId === "team") {
return new Set(
visibleFolders
.filter((folder) => folder.visibility === "team")
.flatMap((folder) => normalizeSessionPlannerLibraryFolderExerciseIds(folder.exerciseIds))
);
}
if (targetFolderId === "mine") {
return new Set(
visibleFolders
.filter((folder) => folder.visibility === "personal" && (!folder.createdBy || folder.createdBy === currentUserId))
.flatMap((folder) => normalizeSessionPlannerLibraryFolderExerciseIds(folder.exerciseIds))
);
}
const folder = getSessionPlannerLibraryFolderById(targetFolderId);
return new Set(normalizeSessionPlannerLibraryFolderExerciseIds(folder?.exerciseIds));
}
function exerciseMatchesSessionPlannerLibraryFolder(exercise = {}) {
const folderExerciseIds = getSessionPlannerLibraryFolderExerciseIdSet();
return !folderExerciseIds || folderExerciseIds.has(exercise.id);
}
function getSessionPlannerLibraryFolderCount(folderId, archiveView = sessionPlannerLibraryArchiveView) {
const folderExerciseIds = getSessionPlannerLibraryFolderExerciseIdSet(folderId);
return getSessionPlannerLibraryExercisesByArchiveState(archiveView).filter((exercise) =>
!folderExerciseIds || folderExerciseIds.has(exercise.id)
).length;
}
function getSessionPlannerLibraryFolderName(folderId = sessionPlannerLibrarySelectedFolderId) {
if (folderId === "all") {
return "All Exercises";
}
if (folderId === "team") {
return "Team";
}
if (folderId === "mine") {
return "Mine";
}
return getSessionPlannerLibraryFolderById(folderId)?.name || "Folder";
}
function getUniqueSessionPlannerLibraryFolderName(baseName = "Untitled Folder", excludeFolderId = "") {
const cleanBaseName = String(baseName || "Untitled Folder").trim().replace(/\s+/g, " ") || "Untitled Folder";
const existingFolderNames = new Set(
getSessionPlannerExerciseLibraryFolders()
.filter((folder) => folder.id !== excludeFolderId && !isSessionPlannerLibraryFolderArchived(folder))
.map((folder) => normalizeSessionPlannerLibraryTitle(folder.name))
.filter(Boolean)
);
let candidate = cleanBaseName;
let suffix = 2;
while (existingFolderNames.has(normalizeSessionPlannerLibraryTitle(candidate))) {
candidate = `${cleanBaseName} ${suffix}`;
suffix += 1;
}
return candidate;
}
function selectSessionPlannerLibraryFolder(folderId = "all") {
const normalizedFolderId = String(folderId || "all").trim() || "all";
const isVirtualFolder = ["all", "team", "mine"].includes(normalizedFolderId);
const targetFolder = getSessionPlannerLibraryFolderById(normalizedFolderId);
const targetFolderId = isVirtualFolder || (targetFolder && !isSessionPlannerLibraryFolderArchived(targetFolder))
? normalizedFolderId
: "all";
sessionPlannerLibrarySelectedFolderId = targetFolderId;
sessionPlannerLibraryEditExerciseId = "";
sessionPlannerLibraryEditingFolderId = "";
sessionPlannerLibraryFilterOpen = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function startSessionPlannerExerciseLibraryFolderEdit(folderId) {
exerciseLibraryActions.startFolderEdit(folderId);
}
function cancelSessionPlannerExerciseLibraryFolderEdit() {
exerciseLibraryActions.cancelFolderEdit();
}
function createSessionPlannerExerciseLibraryFolderFromForm(form) {
exerciseLibraryActions.createFolderFromForm(form);
}
function updateSessionPlannerExerciseLibraryFolderFromForm(form) {
exerciseLibraryActions.updateFolderFromForm(form);
}
function archiveSessionPlannerExerciseLibraryFolder(folderId) {
exerciseLibraryActions.archiveFolder(folderId);
}
function restoreSessionPlannerExerciseLibraryFolder(folderId) {
exerciseLibraryActions.restoreFolder(folderId);
}
function addSessionPlannerExerciseToLibraryFolder(exerciseId, folderId) {
exerciseLibraryActions.addExerciseToFolder(exerciseId, folderId);
}
function removeSessionPlannerExerciseFromLibraryFolder(exerciseId, folderId = sessionPlannerLibrarySelectedFolderId) {
exerciseLibraryActions.removeExerciseFromFolder(exerciseId, folderId);
}
function getSessionPlannerLibraryOptionValues(key) {
const values = getSessionPlannerLibraryExercisesByArchiveState()
.flatMap((exercise) => normalizeSessionPlannerMultiValue(exercise[key]))
.filter(Boolean);
return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
function normalizeSessionPlannerLibrarySortMode(value) {
return exerciseLibrarySelectors.normalizeSortMode(value);
}
function compareSessionPlannerLibraryExercises(a = {}, b = {}) {
return exerciseLibrarySelectors.compareExercises(a, b, sessionPlannerLibrarySortMode);
}
function getFilteredSessionPlannerExerciseLibrary() {
const phaseFilters = getSessionPlannerLibraryFilterValues("phase");
const subPhaseFilters = getSessionPlannerLibraryFilterValues("subPhase");
const searchQuery = String(sessionPlannerLibrarySearchQuery || "").trim().toLowerCase();
return getSessionPlannerLibraryExercisesByArchiveState()
.filter((exercise) => {
const phaseMatches = exerciseMatchesSessionPlannerLibraryFilterValue(exercise.phase, phaseFilters);
const subPhaseMatches = exerciseMatchesSessionPlannerLibraryFilterValue(exercise.subPhase, subPhaseFilters);
const folderMatches = exerciseMatchesSessionPlannerLibraryFolder(exercise);
const searchableText = [
exercise.title,
exercise.focus,
exercise.objective,
exercise.phase,
exercise.subPhase,
formatSessionPlannerLibraryTags(exercise.tags),
getSessionPlannerExerciseReviewNotes(exercise).map((note) => note.notes).join(" "),
]
.filter(Boolean)
.join(" ")
.toLowerCase();
const searchMatches = !searchQuery || searchableText.includes(searchQuery);
return folderMatches && phaseMatches && subPhaseMatches && searchMatches;
})
.sort(compareSessionPlannerLibraryExercises);
}
function updateSessionPlannerLibraryFilter(filterKey, value) {
setSessionPlannerLibraryFilterValues(filterKey, normalizeSessionPlannerLibraryFilterValues(value));
sessionPlannerLibraryEditExerciseId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function updateSessionPlannerLibraryArchiveView(value) {
sessionPlannerLibraryArchiveView = value === "archived" ? "archived" : "active";
sessionPlannerLibraryFilterOpen = "";
sessionPlannerLibraryEditExerciseId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function updateSessionPlannerLibrarySortMode(value) {
sessionPlannerLibrarySortMode = normalizeSessionPlannerLibrarySortMode(value);
sessionPlannerLibraryFilterOpen = "";
sessionPlannerLibraryEditExerciseId = "";
sessionPlannerLibraryViewExerciseId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function renderSessionPlannerLibraryResults() {
exerciseLibraryRenderer.renderResults(ui.sessionPlannerWorkspace);
}
function updateSessionPlannerLibrarySearch(value) {
sessionPlannerLibrarySearchQuery = String(value || "");
sessionPlannerLibraryEditExerciseId = "";
sessionPlannerLibraryViewExerciseId = "";
renderSessionPlannerLibraryResults();
}
function getSessionPlannerLibraryExerciseById(exerciseId) {
const targetId = String(exerciseId || "").trim();
if (!targetId) {
return null;
}
return getSessionPlannerExerciseLibrary().find((exercise) => exercise.id === targetId) || null;
}
function getSessionPlannerLibraryEditExercise() {
if (!sessionPlannerLibraryEditExerciseId) {
return null;
}
const exercise = getSessionPlannerLibraryExerciseById(sessionPlannerLibraryEditExerciseId);
if (!exercise || isSessionPlannerLibraryExerciseArchived(exercise)) {
sessionPlannerLibraryEditExerciseId = "";
return null;
}
return exercise;
}
function getSessionPlannerLibraryViewExercise() {
if (!sessionPlannerLibraryViewExerciseId) return null;
const exercise = getSessionPlannerLibraryExerciseById(sessionPlannerLibraryViewExerciseId);
if (!exercise) {
sessionPlannerLibraryViewExerciseId = "";
return null;
}
return exercise;
}
function startSessionPlannerLibraryExerciseView(exerciseId) {
const exercise = getSessionPlannerLibraryExerciseById(exerciseId);
if (!exercise) return;
sessionPlannerLibraryViewExerciseId = exercise.id;
sessionPlannerLibraryEditExerciseId = "";
sessionPlannerLibraryFilterOpen = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function closeSessionPlannerLibraryExerciseView() {
sessionPlannerLibraryViewExerciseId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function startSessionPlannerLibraryExerciseEdit(exerciseId) {
if (!canEditSessionPlanner()) {
return;
}
const exercise = getSessionPlannerLibraryExerciseById(exerciseId);
if (!exercise) {
return;
}
if (isSessionPlannerLibraryExerciseArchived(exercise)) {
showSessionPlannerToast("Restore the exercise before editing it.", "warning");
return;
}
sessionPlannerLibraryEditExerciseId = exercise.id;
sessionPlannerLibraryViewExerciseId = "";
sessionPlannerLibraryFilterOpen = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function cancelSessionPlannerLibraryExerciseEdit() {
const exercise = getSessionPlannerLibraryExerciseById(sessionPlannerLibraryEditExerciseId);
if (
exercise &&
hasSessionPlannerLibraryExerciseEditChanges(exercise) &&
!win.confirm("Discard unsaved exercise edits?")
) {
return;
}
sessionPlannerLibraryEditExerciseId = "";
sessionPlannerLibraryViewExerciseId = "";
renderSessionPlannerLibraryResults();
}
function getSessionPlannerLibraryExerciseEditFields() {
const fields = {};
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-library-edit-field]")
.forEach((field) => {
const key = field.dataset.sessionLibraryEditField;
if (!key) {
return;
}
fields[key] = field.value ?? "";
});
return fields;
}
function duplicateSessionPlannerLibraryExercise(exerciseId) {
exerciseLibraryActions.duplicateExercise(exerciseId);
}
function updateSessionPlannerLibraryExerciseFromEdit(exerciseId) {
exerciseLibraryActions.updateExerciseFromEdit(exerciseId);
}
function hasSessionPlannerLibraryExerciseEditChanges(exercise = {}, editFields = getSessionPlannerLibraryExerciseEditFields()) {
return exerciseLibraryActions.hasExerciseEditChanges(exercise, editFields);
}
function saveSessionPlannerLibraryExerciseEditAsCopy(exerciseId) {
exerciseLibraryActions.saveExerciseEditAsCopy(exerciseId);
}
function normalizeSessionPlannerLibraryTitle(title = "") {
return String(title || "")
.trim()
.replace(/\s+/g, " ")
.toLowerCase();
}
function createSessionPlannerReviewNoteFromBlock(block = {}, options = {}) {
const notes = String(block.postSessionNotes || "").trim();
if (!notes) {
return null;
}
const sessionDate = String(options.sessionDate || sessionPlannerState?.selectedDate || "").trim();
const blockId = String(block.id || "").trim();
const existingNote = options.existingNote || null;
const now = getSessionPlannerLibraryNow();
return normalizeSessionPlannerExerciseReviewNote({
id: existingNote?.id || createSessionPlannerReviewNoteId(sessionDate, blockId),
sessionDate,
blockId,
blockTitle: String(block.title || block.label || "Exercise").trim(),
notes,
createdAt: existingNote?.createdAt || now,
updatedAt: now,
updatedBy: getSessionPlannerLibraryUserId(),
});
}
function getSessionPlannerExerciseReviewNotes(exercise = {}) {
return normalizeSessionPlannerExerciseReviewNotes(exercise.reviewNotes, exercise.postSessionNotes);
}
function getSessionPlannerExerciseReviewNotesForBlock(block = {}, options = {}) {
const exercise = getSessionPlannerLibraryExerciseById(block.libraryExerciseId);
if (!exercise) {
return [];
}
const currentNoteId = createSessionPlannerReviewNoteId(
String(options.sessionDate || sessionPlannerState?.selectedDate || "").trim(),
String(block.id || "").trim()
);
return getSessionPlannerExerciseReviewNotes(exercise).filter((note) => note.id !== currentNoteId);
}
function buildSessionPlannerLibraryExerciseFromBlock(block) {
const now = getSessionPlannerLibraryNow();
const currentUserId = getSessionPlannerLibraryUserId();
const reviewNote = createSessionPlannerReviewNoteFromBlock(block);
return createSessionPlannerLibraryExercise({
...block,
id: createSessionPlannerStableId("exercise"),
label: "Library Exercise",
createdAt: now,
updatedAt: now,
createdBy: currentUserId,
updatedBy: currentUserId,
archivedAt: "",
archivedBy: "",
source: "session",
title: String(block.title || "").trim() || "Untitled Exercise",
focus: String(block.focus || "").trim(),
phase: block.phase || "",
subPhase: block.subPhase || "",
tags: [],
minutes: block.minutes,
time: block.time || "",
intensity: block.intensity,
pitchSize: block.pitchSize || "",
material: block.material || "",
objective: block.objective || "",
why: block.why || "",
organization: block.organization || "",
principles: block.principles || "",
postSessionNotes: "",
reviewNotes: reviewNote ? [reviewNote] : [],
diagram: block.diagram || "empty",
tacticalPitchMode: normalizeSessionPlannerTacticalPitchMode(block.tacticalPitchMode),
playerBoardLayoutMode: block.playerBoardLayoutMode === "manual" ? "manual" : "auto",
visualImage: block.visualImage || "",
playerBoardPositions: normalizeSessionPlannerPlayerBoardPositions(block.playerBoardPositions),
playerBoardColors: normalizeSessionPlannerPlayerBoardColors(block.playerBoardColors),
playerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople(block.playerBoardCustomPeople),
tacticalFrames: normalizeSessionPlannerTacticalFrames(block.tacticalFrames),
tacticalActiveFrameId: block.tacticalActiveFrameId || "",
tacticalElements: Array.isArray(block.tacticalElements)
? block.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [],
});
}
function renderSessionPlannerToast() {
if (!ui.sessionPlannerWorkspace) {
return;
}
const existingToast = ui.sessionPlannerWorkspace.querySelector("[data-session-toast]");
if (!sessionPlannerToastMessage) {
existingToast?.remove();
return;
}
const toastMarkup = `
    <div class="session-toast is-${escapeHtml(sessionPlannerToastTone)}" data-session-toast role="status" aria-live="polite">
      <strong>${escapeHtml(sessionPlannerToastMessage)}</strong>
    </div>
  `;
if (existingToast) {
existingToast.outerHTML = toastMarkup;
return;
}
ui.sessionPlannerWorkspace.insertAdjacentHTML("beforeend", toastMarkup);
}
function showSessionPlannerToast(message, tone = "success") {
sessionPlannerToastMessage = String(message || "");
sessionPlannerToastTone = tone;
renderSessionPlannerToast();
if (sessionPlannerToastTimeoutId) {
win.clearTimeout(sessionPlannerToastTimeoutId);
}
sessionPlannerToastTimeoutId = win.setTimeout(() => {
sessionPlannerToastMessage = "";
renderSessionPlannerToast();
}, 3200);
}
function commitSessionPlannerExerciseToLibrary(exercise, mode = "new", existingExerciseId = "") {
return exerciseLibraryActions.commitExercise(exercise, mode, existingExerciseId);
}
function queueSessionPlannerLibrarySaveConflict(exercise, existingExercise) {
exerciseLibraryActions.queueSaveConflict(exercise, existingExercise);
}
function resolveSessionPlannerLibrarySaveConflict(action) {
exerciseLibraryActions.resolveSaveConflict(action);
}
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
function saveSelectedSessionPlannerExerciseToLibrary() {
exerciseLibraryActions.saveSelectedExercise();
}
function deleteSessionPlannerLibraryExercise(exerciseId) {
exerciseLibraryActions.archiveExercise(exerciseId);
}
function restoreSessionPlannerLibraryExercise(exerciseId) {
exerciseLibraryActions.restoreExercise(exerciseId);
}
function createSessionPlannerDefaultSession(dateValue = formatScheduleDateValue(new Date())) {
return sessionPlannerSessionFactory.createDefaultSession(dateValue);
}
function createSessionPlannerEmptySession(dateValue = formatScheduleDateValue(new Date())) {
return sessionPlannerSessionFactory.createEmptySession(dateValue);
}
function getSessionPlannerPeriodizationOverride(dateValue) {
if (!dateValue) {
return {};
}
if (!periodizationState) {
periodizationState = readPeriodizationState();
}
return periodizationState?.days?.[dateValue] ?? {};
}
function isSessionPlannerOffDate(dateValue) {
if (!dateValue) {
return false;
}
const periodizationOverride = getSessionPlannerPeriodizationOverride(dateValue);
const savedDaySchedule = String(periodizationOverride.daySchedule || "").trim().toUpperCase();
const savedSessionType = String(periodizationOverride.sessionType || "").trim().toUpperCase();
const scheduleEvent = getScheduleMainEvent(getScheduleEventsForDate(dateValue));
return savedDaySchedule === "OFF" || savedSessionType === "OFF" || scheduleEvent?.type === "off";
}
function createSessionPlannerSessionForNewPlan(dateValue = formatScheduleDateValue(new Date())) {
return isSessionPlannerOffDate(dateValue)
? createSessionPlannerEmptySession(dateValue)
: createSessionPlannerDefaultSession(dateValue);
}
function isGeneratedDefaultSessionPlannerSession(session = {}) {
return sessionPlannerSessionFactory.isGeneratedDefaultSession(session);
}
function shouldStripSessionPlannerGeneratedDefaultSession(dateValue, session = {}) {
if (!isGeneratedDefaultSessionPlannerSession(session)) {
return false;
}
const scheduleEvents = getScheduleEventsForDate(dateValue);
const hasSessionEvent = scheduleEvents.some(isScheduleSessionEvent);
const periodizationOverride = getSessionPlannerPeriodizationOverride(dateValue);
const savedDaySchedule = String(periodizationOverride.daySchedule || "").trim().toLowerCase();
const savedSessionType = String(periodizationOverride.sessionType || "").trim().toLowerCase();
const hasSavedTrainingSignal = [savedDaySchedule, savedSessionType].some((value) =>
value.includes("training") || value.includes("match") || value.includes("recovery")
);
return isSessionPlannerOffDate(dateValue) || (!hasSessionEvent && !hasSavedTrainingSignal);
}
function shouldClearSessionPlannerSessionForDate(dateValue, session = {}) {
if (isSessionPlannerOffDate(dateValue)) {
return true;
}
return shouldStripSessionPlannerGeneratedDefaultSession(dateValue, session);
}
function cloneSessionPlannerSession(session = {}) {
const date = session.date || formatScheduleDateValue(new Date());
const blocks = Array.isArray(session.blocks) ? session.blocks.map(createSessionPlannerBlock) : [];
const selectedBlockId = blocks.some((block) => block.id === session.selectedBlockId)
? session.selectedBlockId
: blocks[0]?.id ?? "";
const rawTitle = String(session.title ?? "").trim();
const isLegacyEmptyTitle = rawTitle.toLowerCase() === "no session planned";
const title = !isLegacyEmptyTitle && rawTitle
? rawTitle
: getScheduledSessionTitleForDate(date) || (blocks.length ? "Training Session" : "Session");
return {
id: session.id || `session-${date}`,
date,
title,
theme: session.theme || "",
selectedBlockId,
blocks,
};
}
function createSessionPlannerDefaultState() {
const selectedDate = formatScheduleDateValue(new Date());
return {
selectedDate,
sessions: {
[selectedDate]: createSessionPlannerEmptySession(selectedDate),
},
};
}
function parseSessionPlannerBlockReductionGuardTime(value) {
const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
return Number.isFinite(timestamp) ? timestamp : 0;
}
function normalizeSessionPlannerBlockReductionGuard(source = {}) {
const guard = source?.[sessionPlannerBlockReductionGuardKey];
if (!guard || typeof guard !== "object" || Array.isArray(guard)) {
return {};
}
const now = Date.now();
return Object.entries(guard).reduce((normalizedGuard, [dateValue, timestampValue]) => {
const timestamp = parseSessionPlannerBlockReductionGuardTime(timestampValue);
if (timestamp && now - timestamp <= sessionPlannerBlockReductionGuardMaxAgeMs) {
normalizedGuard[dateValue] = timestamp;
}
return normalizedGuard;
}, {});
}
function canReduceSessionPlannerBlocksForDate(source, dateValue) {
return Boolean(normalizeSessionPlannerBlockReductionGuard(source)[dateValue]);
}
function normalizeSessionPlannerBlockDeletionTombstones(source = {}) {
const tombstones = source?.[sessionPlannerBlockDeletionTombstoneKey];
if (!tombstones || typeof tombstones !== "object" || Array.isArray(tombstones)) {
return {};
}
return Object.entries(tombstones).reduce((normalized, [dateValue, blockMap]) => {
if (!blockMap || typeof blockMap !== "object" || Array.isArray(blockMap)) {
return normalized;
}
const normalizedBlocks = Object.entries(blockMap).reduce((blocks, [blockId, timestampValue]) => {
const cleanBlockId = String(blockId || "").trim();
const timestamp = parseSessionPlannerBlockReductionGuardTime(timestampValue);
if (cleanBlockId && timestamp) {
blocks[cleanBlockId] = new Date(timestamp).toISOString();
}
return blocks;
}, {});
const cleanDate = String(dateValue || "").trim();
if (cleanDate && Object.keys(normalizedBlocks).length) {
normalized[cleanDate] = normalizedBlocks;
}
return normalized;
}, {});
}
function markSessionPlannerBlockReductionAllowed(dateValue) {
if (!sessionPlannerState || !dateValue) {
return;
}
sessionPlannerState[sessionPlannerBlockReductionGuardKey] = {
...normalizeSessionPlannerBlockReductionGuard(sessionPlannerState),
[dateValue]: Date.now(),
};
}
function markSessionPlannerBlockDeleted(dateValue, blockId) {
const cleanDate = String(dateValue || "").trim();
const cleanBlockId = String(blockId || "").trim();
if (!sessionPlannerState || !cleanDate || !cleanBlockId) {
return;
}
const tombstones = normalizeSessionPlannerBlockDeletionTombstones(sessionPlannerState);
sessionPlannerState[sessionPlannerBlockDeletionTombstoneKey] = {
...tombstones,
[cleanDate]: {
...(tombstones[cleanDate] || {}),
[cleanBlockId]: new Date().toISOString(),
},
};
markSessionPlannerBlockReductionAllowed(cleanDate);
}
function applySessionPlannerBlockReductionGuard(targetState, sourceState) {
const guard = normalizeSessionPlannerBlockReductionGuard(sourceState);
if (Object.keys(guard).length) {
targetState[sessionPlannerBlockReductionGuardKey] = guard;
} else {
delete targetState[sessionPlannerBlockReductionGuardKey];
}
return targetState;
}
function applySessionPlannerBlockDeletionTombstones(targetState, ...sourceStates) {
const tombstones = sourceStates.reduce((merged, sourceState) => {
const next = normalizeSessionPlannerBlockDeletionTombstones(sourceState);
Object.entries(next).forEach(([dateValue, blockMap]) => {
merged[dateValue] = {
...(merged[dateValue] || {}),
...blockMap,
};
});
return merged;
}, {});
if (Object.keys(tombstones).length) {
targetState[sessionPlannerBlockDeletionTombstoneKey] = tombstones;
} else {
delete targetState[sessionPlannerBlockDeletionTombstoneKey];
}
return targetState;
}
function getSessionPlannerDeletedBlockIds(source, dateValue) {
return new Set(Object.keys(normalizeSessionPlannerBlockDeletionTombstones(source)[dateValue] || {}));
}
function cloneSessionPlannerBlockMergeValue(value) {
if (!value || typeof value !== "object") {
return value;
}
try {
return JSON.parse(JSON.stringify(value));
} catch {
return Array.isArray(value) ? [...value] : { ...value };
}
}
function isSessionPlannerBlockFieldEmptyValue(value) {
if (value === null || value === undefined) {
return true;
}
if (typeof value === "string") {
return value.trim() === "";
}
if (Array.isArray(value)) {
return value.length === 0;
}
if (typeof value === "object") {
return Object.keys(value).length === 0;
}
return false;
}
function getSessionPlannerBlockFieldUpdatedAtMs(block = {}, field) {
return parseSessionPlannerTimestampMs(block?.[sessionPlannerBlockFieldUpdatedAtKey]?.[field]);
}
function markSessionPlannerBlockFieldsUpdated(block, fields = []) {
if (!block) {
return;
}
const validFields = fields.filter((field) => sessionPlannerBlockMergeFieldSet.has(field));
if (!validFields.length) {
return;
}
const timestamp = new Date().toISOString();
block[sessionPlannerBlockFieldUpdatedAtKey] = {
...normalizeSessionPlannerBlockFieldMeta(block[sessionPlannerBlockFieldUpdatedAtKey]),
};
validFields.forEach((field) => {
block[sessionPlannerBlockFieldUpdatedAtKey][field] = timestamp;
});
block.updatedAt = timestamp;
}
function mergeSessionPlannerBlockForWrite(existingBlock, incomingBlock) {
const existing = createSessionPlannerBlock(existingBlock);
const incoming = createSessionPlannerBlock(incomingBlock);
const merged = createSessionPlannerBlock({
...incoming,
id: incoming.id || existing.id,
createdAt: incoming.createdAt || existing.createdAt,
});
const mergedMeta = {
...normalizeSessionPlannerBlockFieldMeta(existing[sessionPlannerBlockFieldUpdatedAtKey]),
...normalizeSessionPlannerBlockFieldMeta(incoming[sessionPlannerBlockFieldUpdatedAtKey]),
};
sessionPlannerBlockMergeFields.forEach((field) => {
const existingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(existing, field);
const incomingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(incoming, field);
const existingValue = existing[field];
const incomingValue = incoming[field];
if (existingTimestamp && (!incomingTimestamp || existingTimestamp > incomingTimestamp)) {
merged[field] = cloneSessionPlannerBlockMergeValue(existingValue);
mergedMeta[field] = new Date(existingTimestamp).toISOString();
return;
}
if (!existingTimestamp && !incomingTimestamp && isSessionPlannerBlockFieldEmptyValue(incomingValue) && !isSessionPlannerBlockFieldEmptyValue(existingValue)) {
merged[field] = cloneSessionPlannerBlockMergeValue(existingValue);
return;
}
merged[field] = cloneSessionPlannerBlockMergeValue(incomingValue);
if (incomingTimestamp) {
mergedMeta[field] = new Date(incomingTimestamp).toISOString();
}
});
const newestFieldTimestamp = Object.values(mergedMeta).reduce(
(latest, timestampValue) => Math.max(latest, parseSessionPlannerTimestampMs(timestampValue)),
0
);
const newestBlockTimestamp = Math.max(
parseSessionPlannerTimestampMs(existing.updatedAt),
parseSessionPlannerTimestampMs(incoming.updatedAt),
newestFieldTimestamp
);
merged[sessionPlannerBlockFieldUpdatedAtKey] = mergedMeta;
merged.updatedAt = newestBlockTimestamp ? new Date(newestBlockTimestamp).toISOString() : incoming.updatedAt || existing.updatedAt || "";
return createSessionPlannerBlock(merged);
}
function filterSessionPlannerDeletedBlocksForWrite(session, dateValue, deletedBlockIds = new Set()) {
const filteredSession = cloneSessionPlannerSession({ ...session, date: session?.date || dateValue });
if (!deletedBlockIds.size) {
return filteredSession;
}
filteredSession.blocks = filteredSession.blocks.filter((block) => !deletedBlockIds.has(block.id));
if (!filteredSession.blocks.some((block) => block.id === filteredSession.selectedBlockId)) {
filteredSession.selectedBlockId = filteredSession.blocks[0]?.id ?? "";
}
return filteredSession;
}
function mergeSessionPlannerSessionForWrite(existingSession, incomingSession, dateValue, canReduceBlocks = false, deletedBlockIds = new Set()) {
const existing = cloneSessionPlannerSession({ ...existingSession, date: existingSession?.date || dateValue });
const incoming = cloneSessionPlannerSession({ ...incomingSession, date: incomingSession?.date || dateValue });
const existingById = new Map(existing.blocks.map((block) => [block.id, block]));
const incomingIds = new Set();
const blocks = incoming.blocks.flatMap((incomingBlock) => {
incomingIds.add(incomingBlock.id);
if (deletedBlockIds.has(incomingBlock.id)) {
return [];
}
const existingBlock = existingById.get(incomingBlock.id);
return [existingBlock ? mergeSessionPlannerBlockForWrite(existingBlock, incomingBlock) : createSessionPlannerBlock(incomingBlock)];
});
if (!canReduceBlocks) {
existing.blocks.forEach((existingBlock) => {
if (!incomingIds.has(existingBlock.id) && !deletedBlockIds.has(existingBlock.id)) {
blocks.push(createSessionPlannerBlock(existingBlock));
}
});
}
const selectedBlockId = blocks.some((block) => block.id === incoming.selectedBlockId)
? incoming.selectedBlockId
: blocks.some((block) => block.id === existing.selectedBlockId)
? existing.selectedBlockId
: blocks[0]?.id ?? "";
return {
...existing,
...incoming,
title: isSessionPlannerBlockFieldEmptyValue(incoming.title) && !isSessionPlannerBlockFieldEmptyValue(existing.title)
? existing.title
: incoming.title,
theme: isSessionPlannerBlockFieldEmptyValue(incoming.theme) && !isSessionPlannerBlockFieldEmptyValue(existing.theme)
? existing.theme
: incoming.theme,
date: incoming.date || existing.date || dateValue,
selectedBlockId,
blocks,
};
}
function cloneSessionPlannerState(source = createSessionPlannerDefaultState()) {
const fallback = createSessionPlannerDefaultState();
const selectedDate = source.selectedDate || fallback.selectedDate;
const sessions = {};
Object.entries(source.sessions ?? {}).forEach(([dateValue, session]) => {
const clonedSession = cloneSessionPlannerSession({ ...session, date: session.date || dateValue });
sessions[dateValue] = shouldClearSessionPlannerSessionForDate(dateValue, clonedSession)
? createSessionPlannerEmptySession(dateValue)
: clonedSession;
});
if (!Object.keys(sessions).length) {
sessions[fallback.selectedDate] = fallback.sessions[fallback.selectedDate];
}
return applySessionPlannerBlockDeletionTombstones(applySessionPlannerBlockReductionGuard({
selectedDate,
sessions,
}, source), source);
}
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
function mergeSessionPlannerStateForWrite(existingState, incomingState) {
const existing = cloneSessionPlannerState(existingState);
const incoming = cloneSessionPlannerState(incomingState);
const merged = {
...incoming,
sessions: {},
};
applySessionPlannerBlockDeletionTombstones(merged, existing, incoming);
const sessionDates = new Set([
...Object.keys(existing.sessions || {}),
...Object.keys(incoming.sessions || {}),
]);
sessionDates.forEach((dateValue) => {
const existingSession = existing.sessions?.[dateValue];
const incomingSession = incoming.sessions?.[dateValue];
if (existingSession && incomingSession) {
merged.sessions[dateValue] = mergeSessionPlannerSessionForWrite(
existingSession,
incomingSession,
dateValue,
canReduceSessionPlannerBlocksForDate(incoming, dateValue),
getSessionPlannerDeletedBlockIds(merged, dateValue)
);
return;
}
const deletedBlockIds = getSessionPlannerDeletedBlockIds(merged, dateValue);
if (existingSession) {
merged.sessions[dateValue] = filterSessionPlannerDeletedBlocksForWrite(existingSession, dateValue, deletedBlockIds);
return;
}
if (incomingSession) {
merged.sessions[dateValue] = filterSessionPlannerDeletedBlocksForWrite(incomingSession, dateValue, deletedBlockIds);
}
});
return applySessionPlannerBlockDeletionTombstones(applySessionPlannerBlockReductionGuard(merged, incoming), existing, incoming);
}
function mergeSessionPlannerStateFromBackup(currentState, backupState) {
const current = cloneSessionPlannerState(currentState);
const backup = cloneSessionPlannerState(backupState);
const merged = {
...current,
sessions: {
...current.sessions,
},
};
let recoveredSessions = 0;
Object.entries(backup.sessions || {}).forEach(([dateValue, backupSession]) => {
const currentSession = merged.sessions?.[dateValue];
const currentBlockCount = Array.isArray(currentSession?.blocks) ? currentSession.blocks.length : 0;
const backupSessionWithoutDeletedBlocks = filterSessionPlannerDeletedBlocksForWrite(
backupSession,
dateValue,
getSessionPlannerDeletedBlockIds(current, dateValue)
);
const backupBlockCount = Array.isArray(backupSessionWithoutDeletedBlocks?.blocks) ? backupSessionWithoutDeletedBlocks.blocks.length : 0;
if (
backupBlockCount > currentBlockCount &&
!canReduceSessionPlannerBlocksForDate(current, dateValue)
) {
merged.sessions[dateValue] = backupSessionWithoutDeletedBlocks;
recoveredSessions += 1;
}
});
return {
state: applySessionPlannerBlockDeletionTombstones(applySessionPlannerBlockReductionGuard(merged, current), current, backup),
recoveredSessions,
};
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
function getSessionPlannerBoardHistoryKey(block = getSessionPlannerSelectedBlock()) {
return `${sessionPlannerState?.selectedDate || "date"}::${block?.id || "block"}`;
}
function stringifySessionPlannerBoardSnapshot(snapshot = {}) {
try {
return JSON.stringify(snapshot);
} catch {
return "";
}
}
function createSessionPlannerTacticalBoardSnapshot(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return null;
}
const frames = normalizeSessionPlannerTacticalFrames(block.tacticalFrames);
return {
tacticalPitchMode: normalizeSessionPlannerTacticalPitchMode(block.tacticalPitchMode),
tacticalFrames: frames,
tacticalActiveFrameId: normalizeSessionPlannerTacticalActiveFrameId(block.tacticalActiveFrameId, frames),
tacticalElements: Array.isArray(block.tacticalElements)
? block.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [],
};
}
function createSessionPlannerPlayerBoardSnapshot(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return null;
}
return {
playerBoardLayoutMode: block.playerBoardLayoutMode === "manual" ? "manual" : "auto",
playerBoardPositions: normalizeSessionPlannerPlayerBoardPositions(block.playerBoardPositions),
playerBoardColors: normalizeSessionPlannerPlayerBoardColors(block.playerBoardColors),
playerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople(block.playerBoardCustomPeople),
};
}
function createSessionPlannerBoardSnapshot(type, block = getSessionPlannerSelectedBlock()) {
return type === "player"
? createSessionPlannerPlayerBoardSnapshot(block)
: createSessionPlannerTacticalBoardSnapshot(block);
}
function getSessionPlannerBoardHistoryStack(type, key) {
const store = sessionPlannerBoardHistoryStacks[type] || sessionPlannerBoardHistoryStacks.tactical;
if (!store.has(key)) {
store.set(key, { undo: [], redo: [] });
}
return store.get(key);
}
function trimSessionPlannerBoardHistoryStack(stack) {
while (stack.undo.length > sessionPlannerBoardHistoryLimit) {
stack.undo.shift();
}
while (stack.redo.length > sessionPlannerBoardHistoryLimit) {
stack.redo.shift();
}
}
function syncSessionPlannerBoardHistoryBaseline(type, block = getSessionPlannerSelectedBlock()) {
const snapshot = createSessionPlannerBoardSnapshot(type, block);
if (!snapshot || !block) {
return;
}
sessionPlannerBoardHistoryBaselines[type]?.set(getSessionPlannerBoardHistoryKey(block), snapshot);
}
function syncSessionPlannerBoardHistoryBaselines(block = getSessionPlannerSelectedBlock()) {
syncSessionPlannerBoardHistoryBaseline("tactical", block);
syncSessionPlannerBoardHistoryBaseline("player", block);
}
function captureSessionPlannerBoardHistoryFromState() {
if (sessionPlannerBoardHistoryApplying) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
["tactical", "player"].forEach((type) => {
const snapshot = createSessionPlannerBoardSnapshot(type, block);
const baselineStore = sessionPlannerBoardHistoryBaselines[type];
if (!snapshot || !baselineStore) {
return;
}
const key = getSessionPlannerBoardHistoryKey(block);
const previousSnapshot = baselineStore.get(key);
if (!previousSnapshot) {
baselineStore.set(key, snapshot);
return;
}
if (stringifySessionPlannerBoardSnapshot(previousSnapshot) === stringifySessionPlannerBoardSnapshot(snapshot)) {
return;
}
const stack = getSessionPlannerBoardHistoryStack(type, key);
stack.undo.push(previousSnapshot);
stack.redo = [];
trimSessionPlannerBoardHistoryStack(stack);
baselineStore.set(key, snapshot);
});
}
function applySessionPlannerBoardSnapshot(type, snapshot) {
const block = getSessionPlannerSelectedBlock();
if (!block || !snapshot) {
return false;
}
sessionPlannerBoardHistoryApplying = true;
try {
if (type === "player") {
block.playerBoardLayoutMode = snapshot.playerBoardLayoutMode === "manual" ? "manual" : "auto";
block.playerBoardPositions = normalizeSessionPlannerPlayerBoardPositions(snapshot.playerBoardPositions);
block.playerBoardColors = normalizeSessionPlannerPlayerBoardColors(snapshot.playerBoardColors);
block.playerBoardCustomPeople = normalizeSessionPlannerPlayerBoardCustomPeople(snapshot.playerBoardCustomPeople);
markSessionPlannerBlockFieldsUpdated(block, [
"playerBoardLayoutMode",
"playerBoardPositions",
"playerBoardColors",
"playerBoardCustomPeople",
]);
} else {
const frames = normalizeSessionPlannerTacticalFrames(snapshot.tacticalFrames);
block.tacticalPitchMode = normalizeSessionPlannerTacticalPitchMode(snapshot.tacticalPitchMode);
block.tacticalFrames = frames;
block.tacticalActiveFrameId = normalizeSessionPlannerTacticalActiveFrameId(snapshot.tacticalActiveFrameId, frames);
block.tacticalElements = Array.isArray(snapshot.tacticalElements)
? snapshot.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [];
markSessionPlannerBlockFieldsUpdated(block, ["tacticalPitchMode", "tacticalElements", "tacticalFrames", "tacticalActiveFrameId"]);
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
sessionPlannerTacticalSelectionState = null;
clearSessionPlannerTacticalSelection();
}
writeSessionPlannerState();
} finally {
sessionPlannerBoardHistoryApplying = false;
}
syncSessionPlannerBoardHistoryBaseline(type, block);
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return true;
}
function undoSessionPlannerBoardHistory(type) {
const block = getSessionPlannerSelectedBlock();
if (!block || !canEditSessionPlanner()) {
return false;
}
const key = getSessionPlannerBoardHistoryKey(block);
const stack = getSessionPlannerBoardHistoryStack(type, key);
if (!stack.undo.length) {
showSessionPlannerToast("Nothing to undo yet.", "warning");
return false;
}
const currentSnapshot = createSessionPlannerBoardSnapshot(type, block);
const previousSnapshot = stack.undo.pop();
if (currentSnapshot) {
stack.redo.push(currentSnapshot);
}
trimSessionPlannerBoardHistoryStack(stack);
return applySessionPlannerBoardSnapshot(type, previousSnapshot);
}
function redoSessionPlannerBoardHistory(type) {
const block = getSessionPlannerSelectedBlock();
if (!block || !canEditSessionPlanner()) {
return false;
}
const key = getSessionPlannerBoardHistoryKey(block);
const stack = getSessionPlannerBoardHistoryStack(type, key);
if (!stack.redo.length) {
showSessionPlannerToast("Nothing to redo yet.", "warning");
return false;
}
const currentSnapshot = createSessionPlannerBoardSnapshot(type, block);
const nextSnapshot = stack.redo.pop();
if (currentSnapshot) {
stack.undo.push(currentSnapshot);
}
trimSessionPlannerBoardHistoryStack(stack);
return applySessionPlannerBoardSnapshot(type, nextSnapshot);
}
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
function getSessionPlannerSelectedSession() {
if (!sessionPlannerState) {
sessionPlannerState = createSessionPlannerDefaultState();
}
return sessionPlannerState.sessions?.[sessionPlannerState.selectedDate] ??
createSessionPlannerEmptySession(sessionPlannerState.selectedDate);
}
function ensureSessionPlannerSelectedSession() {
if (!sessionPlannerState) {
sessionPlannerState = createSessionPlannerDefaultState();
}
if (!sessionPlannerState.sessions) {
sessionPlannerState.sessions = {};
}
if (!sessionPlannerState.sessions[sessionPlannerState.selectedDate]) {
sessionPlannerState.sessions[sessionPlannerState.selectedDate] = createSessionPlannerEmptySession(
sessionPlannerState.selectedDate
);
}
return sessionPlannerState.sessions[sessionPlannerState.selectedDate];
}
function getSessionPlannerSelectedBlock() {
const session = getSessionPlannerSelectedSession();
return session.blocks.find((block) => block.id === session.selectedBlockId) ?? session.blocks[0] ?? null;
}
function selectSessionPlannerDate(dateValue) {
if (!sessionPlannerState || !dateValue) {
return;
}
sessionPlannerState.selectedDate = dateValue;
sessionPlannerPeriodizationBridge.close({ render: false });
sessionPlannerLibraryOpen = false;
sessionPlannerAddMenuOpen = false;
sessionPlannerVisualPreviewOpen = false;
sessionPlannerTacticalboardOpen = false;
sessionPlannerPlayerBoardOpen = false;
sessionPlannerPlayerBoardAssistantOpen = false;
sessionPlannerPlayerBoardSelectedPlayerId = "";
sessionPlannerPlayerBoardSelectedPlayerIds = [];
sessionPlannerPlayerBoardSelectionState = null;
sessionPlannerTacticalPendingPoint = null;
getSessionPlannerSelectedSession();
writeSessionPlannerState();
renderSessionPlannerWorkspace();
}
function selectSessionPlannerBlock(blockId) {
const session = getSessionPlannerSelectedSession();
if (!session.blocks.some((block) => block.id === blockId)) {
return;
}
session.selectedBlockId = blockId;
sessionPlannerAddMenuOpen = false;
sessionPlannerVisualPreviewOpen = false;
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function addSessionPlannerBlock() {
if (!canEditSessionPlanner()) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const blockNumber = session.blocks.length + 1;
const block = createSessionPlannerBlock({
label: `Block ${blockNumber}`,
title: "New Exercise",
focus: "",
minutes: 15,
intensity: 3,
diagram: "empty",
tacticalElements: [],
});
session.blocks.push(block);
session.selectedBlockId = block.id;
sessionPlannerAddMenuOpen = false;
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return block;
}
function renumberSessionPlannerExerciseBlocks(session) {
if (!session?.blocks?.length) {
return;
}
let exerciseNumber = 1;
session.blocks.forEach((block) => {
if (/^Block\s+\d+$/i.test(String(block.label || ""))) {
const nextLabel = `Block ${exerciseNumber}`;
if (block.label !== nextLabel) {
block.label = nextLabel;
markSessionPlannerBlockFieldsUpdated(block, ["label"]);
}
exerciseNumber += 1;
}
});
}
function moveSessionPlannerBlock(blockId, direction) {
if (!canEditSessionPlanner() || !direction) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const currentIndex = session.blocks.findIndex((block) => block.id === blockId);
const nextIndex = currentIndex + direction;
if (currentIndex === -1 || nextIndex < 0 || nextIndex >= session.blocks.length) {
return;
}
const [block] = session.blocks.splice(currentIndex, 1);
session.blocks.splice(nextIndex, 0, block);
session.selectedBlockId = block.id;
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function reorderSessionPlannerBlock(sourceBlockId, targetBlockId, placement = "before") {
if (!canEditSessionPlanner() || !sourceBlockId || !targetBlockId || sourceBlockId === targetBlockId) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const sourceIndex = session.blocks.findIndex((block) => block.id === sourceBlockId);
const targetBlock = session.blocks.find((block) => block.id === targetBlockId);
if (sourceIndex === -1 || !targetBlock) {
return;
}
const [block] = session.blocks.splice(sourceIndex, 1);
const targetIndex = session.blocks.findIndex((item) => item.id === targetBlock.id);
const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
session.blocks.splice(insertIndex, 0, block);
session.selectedBlockId = block.id;
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function getSessionPlannerBlockDropPlacement(event, row) {
const rect = row.getBoundingClientRect();
return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}
function clearSessionPlannerBlockDragState() {
sessionPlannerDraggedBlockId = "";
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-block-row.is-dragging, .session-block-row.is-drop-before, .session-block-row.is-drop-after")
.forEach((row) => row.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
}
function clearSessionPlannerLibraryDragState() {
sessionPlannerDraggedLibraryExerciseId = "";
sessionPlannerLibraryPointerDrag = null;
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-library-item.is-dragging, .session-library-folder-card.is-drop-target")
.forEach((element) => element.classList.remove("is-dragging", "is-drop-target"));
}
function updateSessionPlannerLibraryPointerDropTarget(clientX, clientY) {
const target = document.elementFromPoint(clientX, clientY)?.closest?.("[data-session-library-folder-drop]");
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-library-folder-card.is-drop-target")
.forEach((folderCard) => {
if (folderCard !== target) {
folderCard.classList.remove("is-drop-target");
}
});
target?.classList.add("is-drop-target");
return target || null;
}
function startSessionPlannerLibraryPointerDrag(event) {
const item = event.target.closest?.("[data-session-library-drag-exercise]");
if (!item || !canEditSessionPlanner() || event.button !== 0 || event.target.closest(".session-library-actions")) {
return false;
}
sessionPlannerLibraryPointerDrag = {
exerciseId: item.dataset.sessionLibraryDragExercise,
startX: event.clientX,
startY: event.clientY,
active: false,
};
return true;
}
function updateSessionPlannerLibraryPointerDrag(event) {
if (!sessionPlannerLibraryPointerDrag?.exerciseId) {
return false;
}
const deltaX = Math.abs(event.clientX - sessionPlannerLibraryPointerDrag.startX);
const deltaY = Math.abs(event.clientY - sessionPlannerLibraryPointerDrag.startY);
if (!sessionPlannerLibraryPointerDrag.active && deltaX + deltaY < 10) {
return true;
}
sessionPlannerLibraryPointerDrag.active = true;
sessionPlannerDraggedLibraryExerciseId = sessionPlannerLibraryPointerDrag.exerciseId;
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-library-drag-exercise]")
.forEach((item) => {
if (item.dataset.sessionLibraryDragExercise === sessionPlannerDraggedLibraryExerciseId) {
item.classList.add("is-dragging");
}
});
updateSessionPlannerLibraryPointerDropTarget(event.clientX, event.clientY);
event.preventDefault();
return true;
}
function finishSessionPlannerLibraryPointerDrag(event) {
if (!sessionPlannerLibraryPointerDrag?.exerciseId) {
return false;
}
const dragState = sessionPlannerLibraryPointerDrag;
const shouldDrop = Boolean(dragState.active);
const folderDropTarget = shouldDrop ? updateSessionPlannerLibraryPointerDropTarget(event.clientX, event.clientY) : null;
if (folderDropTarget) {
sessionPlannerLibrarySuppressNextClick = true;
addSessionPlannerExerciseToLibraryFolder(
dragState.exerciseId,
folderDropTarget.dataset.sessionLibraryFolderDrop
);
}
clearSessionPlannerLibraryDragState();
return shouldDrop;
}
function deleteSessionPlannerBlock(blockId) {
if (!canEditSessionPlanner()) {
return;
}
const session = ensureSessionPlannerSelectedSession();
const blockIndex = session.blocks.findIndex((block) => block.id === blockId);
if (blockIndex === -1) {
return;
}
const block = session.blocks[blockIndex];
const exerciseName = block?.title || block?.label || "this exercise";
const shouldDelete = win.confirm(`Are you sure you want to delete "${exerciseName}" from this session?`);
if (!shouldDelete) {
return;
}
session.blocks.splice(blockIndex, 1);
markSessionPlannerBlockDeleted(session.date, blockId);
if (session.selectedBlockId === blockId) {
session.selectedBlockId = session.blocks[Math.min(blockIndex, session.blocks.length - 1)]?.id ?? "";
}
if (!session.blocks.length) {
session.title = getScheduledSessionTitleForDate(session.date) || "Session";
}
renumberSessionPlannerExerciseBlocks(session);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerLibraryOpen(isOpen) {
sessionPlannerLibraryOpen = Boolean(isOpen);
if (sessionPlannerLibraryOpen) {
sessionPlannerAddMenuOpen = false;
sessionPlannerPlayerBoardOpen = false;
sessionPlannerPrintOverlayOpen = false;
} else {
sessionPlannerLibraryFilterOpen = "";
sessionPlannerLibraryEditExerciseId = "";
sessionPlannerLibraryViewExerciseId = "";
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function closeSessionPlannerLibrary() {
const editExercise = getSessionPlannerLibraryEditExercise();
if (
editExercise &&
hasSessionPlannerLibraryExerciseEditChanges(editExercise) &&
!win.confirm("Discard unsaved exercise edits?")
) {
return;
}
setSessionPlannerLibraryOpen(false);
}
function setSessionPlannerAddMenuOpen(isOpen) {
sessionPlannerAddMenuOpen = Boolean(isOpen);
if (sessionPlannerAddMenuOpen) {
sessionPlannerLibraryOpen = false;
sessionPlannerPrintOverlayOpen = false;
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerVisualPreviewOpen(isOpen) {
sessionPlannerVisualPreviewOpen = Boolean(isOpen);
if (sessionPlannerVisualPreviewOpen) {
sessionPlannerAddMenuOpen = false;
sessionPlannerPlayerBoardOpen = false;
sessionPlannerPrintOverlayOpen = false;
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function syncSessionPlannerPrintModeClass() {
document.body?.classList.toggle("is-session-printing", Boolean(sessionPlannerPrintOverlayOpen));
}
function setSessionPlannerPrintOverlayOpen(isOpen) {
sessionPlannerPrintOverlayOpen = Boolean(isOpen);
if (sessionPlannerPrintOverlayOpen) {
sessionPlannerAddMenuOpen = false;
sessionPlannerLibraryOpen = false;
sessionPlannerVisualPreviewOpen = false;
sessionPlannerTacticalboardOpen = false;
sessionPlannerPlayerBoardOpen = false;
sessionPlannerPlayerBoardAssistantOpen = false;
ensureSessionPlannerPrintPageStyle();
}
syncSessionPlannerPrintModeClass();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerTacticalboardOpen(isOpen) {
sessionPlannerTacticalboardOpen = Boolean(isOpen);
if (sessionPlannerTacticalboardOpen) {
sessionPlannerAddMenuOpen = false;
sessionPlannerVisualPreviewOpen = false;
sessionPlannerPlayerBoardOpen = false;
sessionPlannerPlayerBoardAssistantOpen = false;
sessionPlannerPrintOverlayOpen = false;
syncSessionPlannerBoardHistoryBaseline("tactical", getSessionPlannerSelectedBlock());
}
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
sessionPlannerTacticalSelectionState = null;
sessionPlannerTacticalNumberPickerElementId = "";
setSessionPlannerTacticalClickSuppression(false);
clearSessionPlannerTacticalSelection();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function setSessionPlannerPlayerBoardOpen(isOpen) {
sessionPlannerPlayerBoardOpen = Boolean(isOpen);
sessionPlannerPlayerBoardAssistantOpen = false;
sessionPlannerPlayerBoardCustomPersonEditor = null;
if (sessionPlannerPlayerBoardOpen) {
sessionPlannerAddMenuOpen = false;
sessionPlannerLibraryOpen = false;
sessionPlannerVisualPreviewOpen = false;
sessionPlannerTacticalboardOpen = false;
sessionPlannerPrintOverlayOpen = false;
syncSessionPlannerPlayerBoardSelection(getSessionPlannerSelectedBlock());
syncSessionPlannerBoardHistoryBaseline("player", getSessionPlannerSelectedBlock());
} else {
sessionPlannerPlayerBoardDragState = null;
sessionPlannerPlayerBoardSelectionState = null;
sessionPlannerPlayerBoardSelectedPlayerId = "";
sessionPlannerPlayerBoardSelectedPlayerIds = [];
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function openSessionPlannerPlayerBoardProfile(playerId) {
if (!playerId) {
return;
}
const isVisiblePlayer = getSessionPlannerPlayerBoardPlayers().some((item) => item.player.id === playerId);
if (!isVisiblePlayer) {
return;
}
sessionPlannerPlayerBoardSelectedPlayerId = playerId;
sessionPlannerPlayerBoardAssistantOpen = false;
sessionPlannerPlayerBoardCustomPersonEditor = null;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function closeSessionPlannerPlayerBoardProfile() {
sessionPlannerPlayerBoardSelectedPlayerId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function getSessionPlannerPlayerBoardVisiblePlayerIds(block = getSessionPlannerSelectedBlock()) {
return new Set(getSessionPlannerPlayerBoardPlayers(block).map((item) => item.player.id));
}
function normalizeSessionPlannerPlayerBoardSelectedIds(playerIds = [], block = getSessionPlannerSelectedBlock()) {
const visibleIds = getSessionPlannerPlayerBoardVisiblePlayerIds(block);
const selectedIds = [];
playerIds.forEach((playerId) => {
if (visibleIds.has(playerId) && !selectedIds.includes(playerId)) {
selectedIds.push(playerId);
}
});
return selectedIds;
}
function setSessionPlannerPlayerBoardSelectedPlayers(playerIds = [], options = {}) {
sessionPlannerPlayerBoardSelectedPlayerIds = normalizeSessionPlannerPlayerBoardSelectedIds(playerIds);
if (options.render) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return;
}
syncSessionPlannerPlayerBoardSelectionUi();
}
function toggleSessionPlannerPlayerBoardSelectedPlayer(playerId, options = {}) {
if (!playerId) {
return;
}
const currentIds = normalizeSessionPlannerPlayerBoardSelectedIds(sessionPlannerPlayerBoardSelectedPlayerIds);
const nextIds = currentIds.includes(playerId)
? currentIds.filter((selectedId) => selectedId !== playerId)
: [...currentIds, playerId];
setSessionPlannerPlayerBoardSelectedPlayers(nextIds, options);
}
function syncSessionPlannerPlayerBoardSelectionUi() {
const selectedIds = new Set(normalizeSessionPlannerPlayerBoardSelectedIds(sessionPlannerPlayerBoardSelectedPlayerIds));
const selectedCount = selectedIds.size;
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-player-board-token]")
.forEach((token) => {
token.classList.toggle("is-selected", selectedIds.has(token.dataset.sessionPlayerBoardToken));
});
ui.sessionPlannerWorkspace
?.querySelectorAll("[data-session-player-board-selected-count]")
.forEach((item) => {
item.textContent = `${selectedCount} selected`;
});
ui.sessionPlannerWorkspace
?.querySelectorAll(
[
"[data-session-player-board-color]",
"[data-session-player-board-color-select]",
"[data-session-player-board-clear-colors]",
"[data-session-player-board-apply-formation]",
"[data-session-player-board-prioritize]",
].join(", ")
)
.forEach((button) => {
button.disabled = selectedCount === 0;
});
}
function getSessionPlannerPlayerBoardSelectedColorIds() {
return normalizeSessionPlannerPlayerBoardSelectedIds(sessionPlannerPlayerBoardSelectedPlayerIds);
}
function updateSessionPlannerPlayerBoardSelectedColor(colorValue) {
const block = getSessionPlannerSelectedBlock();
const selectedIds = getSessionPlannerPlayerBoardSelectedColorIds();
if (!block || !selectedIds.length) {
return;
}
const color = colorValue ? normalizeTacticalColor(colorValue, "") : "";
if (!block.playerBoardColors || typeof block.playerBoardColors !== "object") {
block.playerBoardColors = {};
}
selectedIds.forEach((playerId) => {
if (color) {
block.playerBoardColors[playerId] = color;
} else {
delete block.playerBoardColors[playerId];
}
});
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardColors"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function clearSessionPlannerPlayerBoardSelectedColors() {
const selectedIds = getSessionPlannerPlayerBoardSelectedColorIds();
if (!selectedIds.length) {
showSessionPlannerToast("Select players before clearing colours.", "error");
return;
}
updateSessionPlannerPlayerBoardSelectedColor("");
showSessionPlannerToast(`Colour cleared for ${selectedIds.length} player${selectedIds.length === 1 ? "" : "s"}.`);
}
function getSessionPlannerPlayerBoardContextPosition(event, board) {
const rect = board?.getBoundingClientRect?.();
if (!rect?.width || !rect?.height) {
return { x: 50, y: 50 };
}
return {
x: clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98),
y: clamp(((event.clientY - rect.top) / rect.height) * 100, 4, 96),
};
}
function normalizeSessionPlannerPlayerBoardCustomPersonPromptValue(value, limit = 72) {
return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}
function getSessionPlannerPlayerBoardCustomPersonKind(role, name) {
const text = `${role || ""} ${name || ""}`.toLowerCase();
return /staff|coach|leader|ledare|tr[aä]nare|assistent/.test(text) ? "staff" : "player";
}
function removeSessionPlannerPlayerBoardCustomPerson(playerId) {
const block = getSessionPlannerSelectedBlock();
if (!block || !playerId) {
return;
}
const people = getSessionPlannerPlayerBoardCustomPeople(block);
const person = people.find((item) => item.id === playerId);
if (!person) {
return;
}
const shouldRemove = win.confirm(`Remove ${person.name} from this player board?`);
if (!shouldRemove) {
return;
}
block.playerBoardCustomPeople = people.filter((item) => item.id !== playerId);
if (block.playerBoardPositions && typeof block.playerBoardPositions === "object") {
delete block.playerBoardPositions[playerId];
}
if (block.playerBoardColors && typeof block.playerBoardColors === "object") {
delete block.playerBoardColors[playerId];
}
setSessionPlannerPlayerBoardSelectedPlayers(
sessionPlannerPlayerBoardSelectedPlayerIds.filter((selectedId) => selectedId !== playerId)
);
markSessionPlannerBlockFieldsUpdated(block, [
"playerBoardCustomPeople",
"playerBoardPositions",
"playerBoardColors",
]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(`${person.name} removed from this player board.`);
}
function openSessionPlannerPlayerBoardCustomPersonEditor(editor = {}) {
sessionPlannerPlayerBoardCustomPersonEditor = {
mode: editor.mode === "edit" ? "edit" : "add",
personId: String(editor.personId || ""),
position: editor.position || null,
};
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function closeSessionPlannerPlayerBoardCustomPersonEditor() {
sessionPlannerPlayerBoardCustomPersonEditor = null;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function saveSessionPlannerPlayerBoardCustomPersonFromForm(form) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
const editor = sessionPlannerPlayerBoardCustomPersonEditor;
if (!block || !editor) {
return;
}
const formData = new FormData(form);
const name = normalizeSessionPlannerPlayerBoardCustomPersonPromptValue(formData.get("name"));
if (!name) {
showSessionPlannerToast("Add a name first.", "error");
return;
}
const role = normalizeSessionPlannerPlayerBoardCustomPersonPromptValue(formData.get("role"), 36);
const kindInput = String(formData.get("kind") || "").trim();
const kind = kindInput === "staff" ? "staff" : getSessionPlannerPlayerBoardCustomPersonKind(role, name);
const people = getSessionPlannerPlayerBoardCustomPeople(block);
if (editor.mode === "edit" && editor.personId) {
const personIndex = people.findIndex((person) => person.id === editor.personId);
if (personIndex < 0) {
return;
}
people[personIndex] = {
...people[personIndex],
name,
role,
kind,
};
block.playerBoardCustomPeople = people;
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardCustomPeople"]);
sessionPlannerPlayerBoardCustomPersonEditor = null;
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(`${name} updated.`);
return;
}
const person = {
id: createSessionPlannerStableId("player-board-person"),
name,
role,
kind,
createdAt: new Date().toISOString(),
};
block.playerBoardCustomPeople = [...people, person];
block.playerBoardLayoutMode = "manual";
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardPositions[person.id] = editor.position || { x: 50, y: 50 };
markSessionPlannerBlockFieldsUpdated(block, [
"playerBoardCustomPeople",
"playerBoardLayoutMode",
"playerBoardPositions",
]);
sessionPlannerPlayerBoardCustomPersonEditor = null;
setSessionPlannerPlayerBoardSelectedPlayers([person.id]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(`${name} added to this player board.`);
}
function handleSessionPlannerPlayerBoardContextMenu(event) {
if (event.target.closest?.("[data-session-player-board-person-editor]")) {
return;
}
const board = event.target.closest?.("[data-session-player-board]");
if (!board || !sessionPlannerPlayerBoardOpen) {
return;
}
event.preventDefault();
const token = event.target.closest?.("[data-session-player-board-token]");
const playerId = token?.dataset?.sessionPlayerBoardToken || "";
if (playerId && isSessionPlannerPlayerBoardCustomPersonId(playerId)) {
openSessionPlannerPlayerBoardCustomPersonEditor({ mode: "edit", personId: playerId });
return;
}
if (playerId) {
openSessionPlannerPlayerBoardProfile(playerId);
return;
}
openSessionPlannerPlayerBoardCustomPersonEditor({
mode: "add",
position: getSessionPlannerPlayerBoardContextPosition(event, board),
});
}
function resetSessionPlannerPlayerBoardPositions() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const shouldReset = win.confirm(
"Reset player board? This will move the players back to their starting positions and restore the player buttons."
);
if (!shouldReset) {
return;
}
block.playerBoardLayoutMode = "auto";
block.playerBoardPositions = {};
block.playerBoardColors = {};
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions", "playerBoardColors"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast("Players reset to starting positions and default buttons.");
}
function getSessionPlannerTacticalFrames(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return [];
}
const frames = normalizeSessionPlannerTacticalFrames(block.tacticalFrames);
block.tacticalFrames = frames;
block.tacticalActiveFrameId = normalizeSessionPlannerTacticalActiveFrameId(block.tacticalActiveFrameId, frames);
return frames;
}
function getSessionPlannerTacticalActiveFrameId(block = getSessionPlannerSelectedBlock()) {
return normalizeSessionPlannerTacticalActiveFrameId(block?.tacticalActiveFrameId, getSessionPlannerTacticalFrames(block));
}
function ensureSessionPlannerTacticalFrames(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return [];
}
const frames = getSessionPlannerTacticalFrames(block);
if (frames.length) {
return frames;
}
const firstFrame = cloneSessionPlannerTacticalFrame(
{
label: "Frame 1",
elements: Array.isArray(block.tacticalElements) ? block.tacticalElements : [],
},
0
);
block.tacticalFrames = [firstFrame];
block.tacticalActiveFrameId = firstFrame.id;
return block.tacticalFrames;
}
function syncSessionPlannerTacticalActiveFrame(block = getSessionPlannerSelectedBlock()) {
const frames = ensureSessionPlannerTacticalFrames(block);
const activeFrameId = getSessionPlannerTacticalActiveFrameId(block);
const activeFrame = frames.find((frame) => frame.id === activeFrameId);
if (activeFrame) {
activeFrame.elements = Array.isArray(block.tacticalElements)
? block.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [];
}
return frames;
}
function persistSessionPlannerTacticalElements(block = getSessionPlannerSelectedBlock()) {
if (!block) {
return;
}
const fields = ["tacticalElements"];
if (Array.isArray(block.tacticalFrames) && block.tacticalFrames.length) {
syncSessionPlannerTacticalActiveFrame(block);
fields.push("tacticalFrames", "tacticalActiveFrameId");
}
markSessionPlannerBlockFieldsUpdated(block, fields);
writeSessionPlannerState();
}
function commitSessionPlannerTacticalFrames(block, frames, activeFrameId) {
if (!block || !Array.isArray(frames) || !frames.length) {
return false;
}
const normalizedFrames = normalizeSessionPlannerTacticalFrames(frames);
const nextActiveFrameId = normalizeSessionPlannerTacticalActiveFrameId(activeFrameId, normalizedFrames);
const activeFrame = normalizedFrames.find((frame) => frame.id === nextActiveFrameId) ?? normalizedFrames[0];
block.tacticalFrames = normalizedFrames;
block.tacticalActiveFrameId = activeFrame.id;
block.tacticalElements = activeFrame.elements.map(cloneSessionPlannerTacticalElement);
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
sessionPlannerTacticalSelectionState = null;
clearSessionPlannerTacticalSelection();
markSessionPlannerBlockFieldsUpdated(block, ["tacticalElements", "tacticalFrames", "tacticalActiveFrameId"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return true;
}
function addSessionPlannerTacticalFrame() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
if (frames.length >= sessionPlannerTacticalMaxFrames) {
showSessionPlannerToast(`Max ${sessionPlannerTacticalMaxFrames} frames per board.`, "warning");
return;
}
const nextFrame = cloneSessionPlannerTacticalFrame(
{
label: `Frame ${frames.length + 1}`,
elements: block.tacticalElements,
},
frames.length
);
commitSessionPlannerTacticalFrames(block, [...frames, nextFrame], nextFrame.id);
}
function selectSessionPlannerTacticalFrame(frameId) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
const targetFrame = frames.find((frame) => frame.id === frameId);
if (!targetFrame || targetFrame.id === block.tacticalActiveFrameId) {
return;
}
commitSessionPlannerTacticalFrames(block, frames, targetFrame.id);
}
function duplicateSessionPlannerTacticalFrame() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
if (frames.length >= sessionPlannerTacticalMaxFrames) {
showSessionPlannerToast(`Max ${sessionPlannerTacticalMaxFrames} frames per board.`, "warning");
return;
}
const activeFrameId = getSessionPlannerTacticalActiveFrameId(block);
const activeIndex = Math.max(0, frames.findIndex((frame) => frame.id === activeFrameId));
const sourceFrame = frames[activeIndex] ?? frames[0];
const duplicateFrame = cloneSessionPlannerTacticalFrame(
{
label: `Frame ${frames.length + 1}`,
elements: sourceFrame.elements,
},
frames.length
);
const nextFrames = [...frames];
nextFrames.splice(activeIndex + 1, 0, duplicateFrame);
commitSessionPlannerTacticalFrames(block, nextFrames, duplicateFrame.id);
}
function deleteSessionPlannerTacticalFrame() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const frames = syncSessionPlannerTacticalActiveFrame(block);
if (frames.length <= 1) {
showSessionPlannerToast("Keep at least one frame on the board.", "warning");
return;
}
if (!win.confirm("Delete this tactical board frame?")) {
return;
}
const activeFrameId = getSessionPlannerTacticalActiveFrameId(block);
const activeIndex = Math.max(0, frames.findIndex((frame) => frame.id === activeFrameId));
const nextFrames = frames.filter((frame) => frame.id !== activeFrameId);
const nextFrame = nextFrames[Math.min(activeIndex, nextFrames.length - 1)] ?? nextFrames[0];
commitSessionPlannerTacticalFrames(block, nextFrames, nextFrame.id);
}
const sessionPlannerTacticalController = createSessionPlannerTacticalController({
  canEditSessionPlanner: (...args) => canEditSessionPlanner(...args),
  clamp,
  cloneSessionPlannerTacticalElement,
  createSessionPlannerLineElement,
  createSessionPlannerStableId,
  getDefaultTacticalColor,
  getDefaultTacticalLineStyle,
  getSessionPlannerSelectedBlock: (...args) => getSessionPlannerSelectedBlock(...args),
  getSessionPlannerTacticalEndpointCoordinates,
  isSessionPlannerTacticalGoalType,
  isSessionPlannerTacticalPlayerType,
  markSessionPlannerBlockFieldsUpdated: (...args) => markSessionPlannerBlockFieldsUpdated(...args),
  normalizeSessionPlannerTacticalPitchMode,
  normalizeSessionPlannerTacticalPlayerBadge,
  normalizeTacticalColor,
  normalizeTacticalLineStyle,
  normalizeTacticalLineWidth,
  normalizeTacticalRotation,
  persistSessionPlannerTacticalElements: (...args) => persistSessionPlannerTacticalElements(...args),
  renderSessionPlannerExerciseVisual: (...args) => renderSessionPlannerExerciseVisual(...args),
  renderSessionPlannerWorkspace: (...args) => renderSessionPlannerWorkspace(...args),
  sessionPlannerTacticalSnapStep,
  showSessionPlannerToast: (...args) => showSessionPlannerToast(...args),
  ui,
  undoSessionPlannerBoardHistory: (...args) => undoSessionPlannerBoardHistory(...args),
  win,
  writeSessionPlannerState: (...args) => writeSessionPlannerState(...args),
  getLocalState: () => ({
    sessionPlannerTacticalboardOpen,
    sessionPlannerTacticalTool,
    sessionPlannerTacticalColor,
    sessionPlannerTacticalLineWidth,
    sessionPlannerTacticalLineStyle,
    sessionPlannerTacticalSnapEnabled,
    sessionPlannerTacticalPendingPoint,
    sessionPlannerTacticalSelectedElementId,
    sessionPlannerTacticalSelectedElementIds,
    sessionPlannerTacticalDragState,
    sessionPlannerTacticalDraftLineState,
    sessionPlannerTacticalFreehandState,
    sessionPlannerTacticalSelectionState,
    sessionPlannerTacticalSuppressNextClick,
    sessionPlannerTacticalSuppressNextClickAt,
    sessionPlannerTacticalLastPlacementClick,
    sessionPlannerTacticalLastPlacement,
    sessionPlannerTacticalClipboard,
    sessionPlannerTacticalClipboardPasteCount,
    sessionPlannerTacticalNumberPickerElementId,
  }),
  setLocalState: (patch = {}) => {
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalboardOpen")) sessionPlannerTacticalboardOpen = patch.sessionPlannerTacticalboardOpen;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalTool")) sessionPlannerTacticalTool = patch.sessionPlannerTacticalTool;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalColor")) sessionPlannerTacticalColor = patch.sessionPlannerTacticalColor;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLineWidth")) sessionPlannerTacticalLineWidth = patch.sessionPlannerTacticalLineWidth;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLineStyle")) sessionPlannerTacticalLineStyle = patch.sessionPlannerTacticalLineStyle;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSnapEnabled")) sessionPlannerTacticalSnapEnabled = patch.sessionPlannerTacticalSnapEnabled;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalPendingPoint")) sessionPlannerTacticalPendingPoint = patch.sessionPlannerTacticalPendingPoint;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSelectedElementId")) sessionPlannerTacticalSelectedElementId = patch.sessionPlannerTacticalSelectedElementId;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSelectedElementIds")) sessionPlannerTacticalSelectedElementIds = patch.sessionPlannerTacticalSelectedElementIds;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalDragState")) sessionPlannerTacticalDragState = patch.sessionPlannerTacticalDragState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalDraftLineState")) sessionPlannerTacticalDraftLineState = patch.sessionPlannerTacticalDraftLineState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalFreehandState")) sessionPlannerTacticalFreehandState = patch.sessionPlannerTacticalFreehandState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSelectionState")) sessionPlannerTacticalSelectionState = patch.sessionPlannerTacticalSelectionState;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSuppressNextClick")) sessionPlannerTacticalSuppressNextClick = patch.sessionPlannerTacticalSuppressNextClick;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalSuppressNextClickAt")) sessionPlannerTacticalSuppressNextClickAt = patch.sessionPlannerTacticalSuppressNextClickAt;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLastPlacementClick")) sessionPlannerTacticalLastPlacementClick = patch.sessionPlannerTacticalLastPlacementClick;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalLastPlacement")) sessionPlannerTacticalLastPlacement = patch.sessionPlannerTacticalLastPlacement;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalClipboard")) sessionPlannerTacticalClipboard = patch.sessionPlannerTacticalClipboard;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalClipboardPasteCount")) sessionPlannerTacticalClipboardPasteCount = patch.sessionPlannerTacticalClipboardPasteCount;
    if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerTacticalNumberPickerElementId")) sessionPlannerTacticalNumberPickerElementId = patch.sessionPlannerTacticalNumberPickerElementId;
  },
});
function refreshSessionPlannerTacticalboardCanvas(...args) {
return sessionPlannerTacticalController.refreshSessionPlannerTacticalboardCanvas(...args);
}
function isSessionPlannerTacticalLineTool(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalLineTool(...args);
}
function isSessionPlannerTacticalStrokeElement(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalStrokeElement(...args);
}
function isSessionPlannerTacticalPlacementTool(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalPlacementTool(...args);
}
function uniqueValues(...args) {
return sessionPlannerTacticalController.uniqueValues(...args);
}
function getSessionPlannerTacticalSelectedElementIds(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalSelectedElementIds(...args);
}
function setSessionPlannerTacticalSelectedElements(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalSelectedElements(...args);
}
function isSessionPlannerTacticalSelectionToggleModifier(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalSelectionToggleModifier(...args);
}
function toggleSessionPlannerTacticalElementSelection(...args) {
return sessionPlannerTacticalController.toggleSessionPlannerTacticalElementSelection(...args);
}
function clearSessionPlannerTacticalSelection(...args) {
return sessionPlannerTacticalController.clearSessionPlannerTacticalSelection(...args);
}
function setSessionPlannerTacticalClickSuppression(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalClickSuppression(...args);
}
function setSessionPlannerTacticalPitchMode(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalPitchMode(...args);
}
function openSessionPlannerTacticalNumberPicker(...args) {
return sessionPlannerTacticalController.openSessionPlannerTacticalNumberPicker(...args);
}
function updateSessionPlannerTacticalPlayerNumber(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalPlayerNumber(...args);
}
function updateSelectedSessionPlannerTacticalPlayerBadges(...args) {
return sessionPlannerTacticalController.updateSelectedSessionPlannerTacticalPlayerBadges(...args);
}
function isSessionPlannerTacticalElementSelected(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalElementSelected(...args);
}
function shouldDragSessionPlannerTacticalSelectionGroup(...args) {
return sessionPlannerTacticalController.shouldDragSessionPlannerTacticalSelectionGroup(...args);
}
function getSessionPlannerTacticalDragElementIds(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalDragElementIds(...args);
}
function setSessionPlannerTacticalTool(...args) {
return sessionPlannerTacticalController.setSessionPlannerTacticalTool(...args);
}
function clearSelectedSessionPlannerTacticalBoard(...args) {
return sessionPlannerTacticalController.clearSelectedSessionPlannerTacticalBoard(...args);
}
function undoSelectedSessionPlannerTacticalBoardAction(...args) {
return sessionPlannerTacticalController.undoSelectedSessionPlannerTacticalBoardAction(...args);
}
function removeSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.removeSessionPlannerTacticalElement(...args);
}
function removeSelectedSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.removeSelectedSessionPlannerTacticalElement(...args);
}
function addSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.addSessionPlannerTacticalElement(...args);
}
function snapSessionPlannerTacticalValue(...args) {
return sessionPlannerTacticalController.snapSessionPlannerTacticalValue(...args);
}
function snapSessionPlannerTacticalPoint(...args) {
return sessionPlannerTacticalController.snapSessionPlannerTacticalPoint(...args);
}
function shouldSnapSessionPlannerTacticalEvent(...args) {
return sessionPlannerTacticalController.shouldSnapSessionPlannerTacticalEvent(...args);
}
function getSessionPlannerTacticalCanvasPoint(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalCanvasPoint(...args);
}
function getSessionPlannerTacticalPointFromRect(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalPointFromRect(...args);
}
function getSessionPlannerTacticalElementById(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementById(...args);
}
function getSessionPlannerTacticalSelectionRect(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalSelectionRect(...args);
}
function getSessionPlannerTacticalElementBounds(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementBounds(...args);
}
function isSessionPlannerTacticalPointInRect(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalPointInRect(...args);
}
function getSessionPlannerTacticalElementSelectionPoints(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementSelectionPoints(...args);
}
function isSessionPlannerTacticalElementInSelectionRect(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalElementInSelectionRect(...args);
}
function getSessionPlannerTacticalElementsInRect(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalElementsInRect(...args);
}
function renderSessionPlannerTacticalSelectionBox(...args) {
return sessionPlannerTacticalController.renderSessionPlannerTacticalSelectionBox(...args);
}
function getSelectedSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.getSelectedSessionPlannerTacticalElement(...args);
}
function getSelectedSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.getSelectedSessionPlannerTacticalElements(...args);
}
function syncSessionPlannerTacticalboardInspector(...args) {
return sessionPlannerTacticalController.syncSessionPlannerTacticalboardInspector(...args);
}
function updateSelectedSessionPlannerTacticalElement(...args) {
return sessionPlannerTacticalController.updateSelectedSessionPlannerTacticalElement(...args);
}
function updateSessionPlannerTacticalLineStyle(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalLineStyle(...args);
}
function clampMovedTacticalPoint(...args) {
return sessionPlannerTacticalController.clampMovedTacticalPoint(...args);
}
function moveSessionPlannerTacticalElementFromInitial(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElementFromInitial(...args);
}
function moveSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElements(...args);
}
function moveSessionPlannerTacticalElementByDelta(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElementByDelta(...args);
}
function getSessionPlannerTacticalBoundsCollection(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalBoundsCollection(...args);
}
function getSessionPlannerTacticalArrangeSpacing(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalArrangeSpacing(...args);
}
function moveSessionPlannerTacticalElementCenterTo(...args) {
return sessionPlannerTacticalController.moveSessionPlannerTacticalElementCenterTo(...args);
}
function arrangeSelectedSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.arrangeSelectedSessionPlannerTacticalElements(...args);
}
function copySelectedSessionPlannerTacticalElements(...args) {
return sessionPlannerTacticalController.copySelectedSessionPlannerTacticalElements(...args);
}
function pasteSessionPlannerTacticalClipboard(...args) {
return sessionPlannerTacticalController.pasteSessionPlannerTacticalClipboard(...args);
}
function isSessionPlannerTacticalEndpointElement(...args) {
return sessionPlannerTacticalController.isSessionPlannerTacticalEndpointElement(...args);
}
function updateSessionPlannerTacticalElementHandle(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalElementHandle(...args);
}
function getSessionPlannerTacticalRotationFromEvent(...args) {
return sessionPlannerTacticalController.getSessionPlannerTacticalRotationFromEvent(...args);
}
function shouldPlaceSessionPlannerTacticalDoubleClick(...args) {
return sessionPlannerTacticalController.shouldPlaceSessionPlannerTacticalDoubleClick(...args);
}
function shouldSkipRepeatedSessionPlannerTacticalPlacement(...args) {
return sessionPlannerTacticalController.shouldSkipRepeatedSessionPlannerTacticalPlacement(...args);
}
function addSessionPlannerTacticalPlacementElement(...args) {
return sessionPlannerTacticalController.addSessionPlannerTacticalPlacementElement(...args);
}
function handleSessionPlannerTacticalCanvasClick(...args) {
return sessionPlannerTacticalController.handleSessionPlannerTacticalCanvasClick(...args);
}
function handleSessionPlannerTacticalCanvasDoubleClick(...args) {
return sessionPlannerTacticalController.handleSessionPlannerTacticalCanvasDoubleClick(...args);
}
function startSessionPlannerTacticalDrag(...args) {
return sessionPlannerTacticalController.startSessionPlannerTacticalDrag(...args);
}
function updateSessionPlannerTacticalDrag(...args) {
return sessionPlannerTacticalController.updateSessionPlannerTacticalDrag(...args);
}
function finishSessionPlannerTacticalDrag(...args) {
return sessionPlannerTacticalController.finishSessionPlannerTacticalDrag(...args);
}
function startSessionPlannerPlayerBoardDrag(event) {
if (!canEditSessionPlanner()) {
return false;
}
if (event.button !== 0) {
return false;
}
const token = event.target.closest?.("[data-session-player-board-token]");
const board = token?.closest?.("[data-session-player-board]");
const block = getSessionPlannerSelectedBlock();
if (!token || !board || !block) {
return false;
}
const playerId = token.dataset.sessionPlayerBoardToken;
if (!playerId) {
return false;
}
const currentSelectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(sessionPlannerPlayerBoardSelectedPlayerIds, block);
if (event.shiftKey || event.metaKey || event.ctrlKey) {
toggleSessionPlannerPlayerBoardSelectedPlayer(playerId);
} else if (!currentSelectedIds.includes(playerId)) {
setSessionPlannerPlayerBoardSelectedPlayers([playerId]);
}
const selectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(sessionPlannerPlayerBoardSelectedPlayerIds, block);
const dragPlayerIds = selectedIds.includes(playerId) ? selectedIds : [playerId];
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const startPositions = dragPlayerIds.reduce((positions, selectedPlayerId) => {
positions[selectedPlayerId] = getSessionPlannerPlayerBoardPositionById(block, selectedPlayerId, boardPlayers);
return positions;
}, {});
const tokenRect = token.getBoundingClientRect();
sessionPlannerPlayerBoardDragState = {
blockId: block.id,
playerId,
playerIds: dragPlayerIds,
board,
token,
pointerId: event.pointerId,
startX: event.clientX,
startY: event.clientY,
startPositions,
anchorStartPosition: startPositions[playerId] ?? getSessionPlannerPlayerBoardPositionById(block, playerId, boardPlayers),
pointerOffsetX: event.clientX - (tokenRect.left + tokenRect.width / 2),
pointerOffsetY: event.clientY - (tokenRect.top + tokenRect.height / 2),
moved: false,
};
event.preventDefault();
token.classList.add("is-dragging");
token.setPointerCapture?.(event.pointerId);
return true;
}
function updateSessionPlannerPlayerBoardDrag(event) {
if (!sessionPlannerPlayerBoardDragState) {
return false;
}
const block = getSessionPlannerSelectedBlock();
const dragState = sessionPlannerPlayerBoardDragState;
if (!block || block.id !== dragState.blockId) {
sessionPlannerPlayerBoardDragState = null;
return false;
}
const boardRect = dragState.board.getBoundingClientRect();
const moveDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
if (!dragState.moved && moveDistance < 8) {
return true;
}
const x = clamp(((event.clientX - boardRect.left - dragState.pointerOffsetX) / boardRect.width) * 100, 0, 100);
const y = clamp(((event.clientY - boardRect.top - dragState.pointerOffsetY) / boardRect.height) * 100, 0, 100);
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
const anchorStartPosition = dragState.anchorStartPosition ?? { x, y };
const deltaX = x - anchorStartPosition.x;
const deltaY = y - anchorStartPosition.y;
const movingPlayerIds = Array.isArray(dragState.playerIds) && dragState.playerIds.length
? dragState.playerIds
: [dragState.playerId];
movingPlayerIds.forEach((playerId) => {
const startPosition = dragState.startPositions?.[playerId] ?? anchorStartPosition;
const nextPosition = {
x: clamp(startPosition.x + deltaX, 0, 100),
y: clamp(startPosition.y + deltaY, 0, 100),
};
block.playerBoardPositions[playerId] = nextPosition;
const playerToken = Array.from(dragState.board.querySelectorAll("[data-session-player-board-token]"))
.find((candidate) => candidate.dataset.sessionPlayerBoardToken === playerId);
if (playerToken) {
playerToken.style.left = `${nextPosition.x}%`;
playerToken.style.top = `${nextPosition.y}%`;
}
});
dragState.moved = true;
return true;
}
function finishSessionPlannerPlayerBoardDrag() {
if (!sessionPlannerPlayerBoardDragState) {
return false;
}
const { token, moved, pointerId } = sessionPlannerPlayerBoardDragState;
token?.classList.remove("is-dragging");
token?.releasePointerCapture?.(pointerId);
sessionPlannerPlayerBoardDragState = null;
if (moved) {
const block = getSessionPlannerSelectedBlock();
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions"]);
writeSessionPlannerState();
}
return true;
}
function getSessionPlannerPlayerBoardEventPoint(event, board) {
const rect = board.getBoundingClientRect();
return {
x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
};
}
function getSessionPlannerPlayerBoardSelectionRect(selection) {
if (!selection) {
return null;
}
return {
left: Math.min(selection.startPoint.x, selection.currentPoint.x),
top: Math.min(selection.startPoint.y, selection.currentPoint.y),
width: Math.abs(selection.currentPoint.x - selection.startPoint.x),
height: Math.abs(selection.currentPoint.y - selection.startPoint.y),
};
}
function syncSessionPlannerPlayerBoardSelectionBox() {
const selection = sessionPlannerPlayerBoardSelectionState;
const box = selection?.board?.querySelector("[data-session-player-board-selection-box]");
if (!box) {
return;
}
const rect = getSessionPlannerPlayerBoardSelectionRect(selection);
if (!selection?.moved || !rect) {
box.style.display = "none";
return;
}
box.style.display = "block";
box.style.left = `${rect.left}%`;
box.style.top = `${rect.top}%`;
box.style.width = `${rect.width}%`;
box.style.height = `${rect.height}%`;
}
function startSessionPlannerPlayerBoardSelection(event) {
if (!canEditSessionPlanner()) {
return false;
}
if (event.button !== 0) {
return false;
}
const board = event.target.closest?.("[data-session-player-board]");
if (
!board ||
event.target.closest?.("[data-session-player-board-token]") ||
event.target.closest?.("[data-session-player-board-person-editor]")
) {
return false;
}
const startPoint = getSessionPlannerPlayerBoardEventPoint(event, board);
sessionPlannerPlayerBoardSelectionState = {
board,
pointerId: event.pointerId,
startClientX: event.clientX,
startClientY: event.clientY,
startPoint,
currentPoint: startPoint,
additive: event.shiftKey || event.metaKey || event.ctrlKey,
moved: false,
};
event.preventDefault();
board.setPointerCapture?.(event.pointerId);
return true;
}
function updateSessionPlannerPlayerBoardSelection(event) {
if (!sessionPlannerPlayerBoardSelectionState) {
return false;
}
const selection = sessionPlannerPlayerBoardSelectionState;
const moveDistance = Math.hypot(event.clientX - selection.startClientX, event.clientY - selection.startClientY);
selection.currentPoint = getSessionPlannerPlayerBoardEventPoint(event, selection.board);
selection.moved = moveDistance >= 8;
syncSessionPlannerPlayerBoardSelectionBox();
return true;
}
function finishSessionPlannerPlayerBoardSelection() {
if (!sessionPlannerPlayerBoardSelectionState) {
return false;
}
const selection = sessionPlannerPlayerBoardSelectionState;
const rect = getSessionPlannerPlayerBoardSelectionRect(selection);
selection.board?.releasePointerCapture?.(selection.pointerId);
sessionPlannerPlayerBoardSelectionState = null;
selection.board?.querySelector("[data-session-player-board-selection-box]")?.removeAttribute("style");
if (!selection.moved || !rect) {
if (!selection.additive) {
setSessionPlannerPlayerBoardSelectedPlayers([]);
}
return true;
}
const selectedIds = Array.from(selection.board.querySelectorAll("[data-session-player-board-token]"))
.filter((token) => {
const x = Number.parseFloat(token.style.left);
const y = Number.parseFloat(token.style.top);
return (
Number.isFinite(x) &&
Number.isFinite(y) &&
x >= rect.left &&
x <= rect.left + rect.width &&
y >= rect.top &&
y <= rect.top + rect.height
);
})
.map((token) => token.dataset.sessionPlayerBoardToken)
.filter(Boolean);
const nextIds = selection.additive
? [...sessionPlannerPlayerBoardSelectedPlayerIds, ...selectedIds]
: selectedIds;
setSessionPlannerPlayerBoardSelectedPlayers(nextIds);
return true;
}
const sessionPlannerVisualUploadHelpers = createSessionPlannerVisualUploadHelpers();
function findSessionPlannerBlockById(blockId) {
const sessions = sessionPlannerState?.sessions || {};
for (const session of Object.values(sessions)) {
const block = Array.isArray(session?.blocks)
? session.blocks.find((candidate) => candidate.id === blockId)
: null;
if (block) {
return block;
}
}
return null;
}
async function normalizeSessionPlannerVisualUpload(file) {
return sessionPlannerVisualUploadHelpers.normalizeVisualUpload(file);
}
async function handleSessionPlannerVisualUpload(file) {
if (!canEditSessionPlanner() || !file) {
return;
}
if (!file.type.startsWith("image/")) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const blockId = block.id;
const previousVisualImage = block.visualImage || "";
try {
const visualImage = await normalizeSessionPlannerVisualUpload(file);
const targetBlock = findSessionPlannerBlockById(blockId);
if (!targetBlock) {
return;
}
targetBlock.visualImage = visualImage;
markSessionPlannerBlockFieldsUpdated(targetBlock, ["visualImage"]);
if (!writeSessionPlannerState()) {
targetBlock.visualImage = previousVisualImage;
markSessionPlannerBlockFieldsUpdated(targetBlock, ["visualImage"]);
writeSessionPlannerState();
showSessionPlannerToast("The image could not be saved. Try a smaller file.", "error");
return;
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast("Uploaded image saved.");
} catch {
showSessionPlannerToast("The image could not be uploaded.", "error");
}
}
function syncSessionPlannerPostSessionNotesToLibrary(block = getSessionPlannerSelectedBlock()) {
if (!block?.libraryExerciseId || !canEditSessionPlanner()) {
return false;
}
const library = getSessionPlannerExerciseLibrary().map(cloneSessionPlannerLibraryExercise);
const exerciseIndex = library.findIndex((exercise) => exercise.id === block.libraryExerciseId);
if (exerciseIndex < 0) {
return false;
}
const exercise = library[exerciseIndex];
const noteId = createSessionPlannerReviewNoteId(sessionPlannerState?.selectedDate || "", block.id || "");
const existingReviewNotes = getSessionPlannerExerciseReviewNotes(exercise);
const existingNote = existingReviewNotes.find((note) => note.id === noteId) || null;
const nextNote = createSessionPlannerReviewNoteFromBlock(block, { existingNote });
const nextReviewNotes = nextNote
? [nextNote, ...existingReviewNotes.filter((note) => note.id !== noteId)]
: existingReviewNotes.filter((note) => note.id !== noteId);
if (JSON.stringify(existingReviewNotes) === JSON.stringify(nextReviewNotes)) {
return true;
}
const now = getSessionPlannerLibraryNow();
const nextExercise = cloneSessionPlannerLibraryExercise({
...exercise,
reviewNotes: nextReviewNotes,
updatedAt: now,
updatedBy: getSessionPlannerLibraryUserId(),
});
library[exerciseIndex] = nextExercise;
const writeResult = writeSessionPlannerExerciseLibraryToStorage(library);
if (!writeResult.saved) {
showSessionPlannerToast("Post-session note saved on the block, but not in the exercise library.", "warning");
return false;
}
sessionPlannerExerciseLibrary = writeResult.exercises;
return true;
}
function applySessionPlannerExercise(exerciseId) {
if (!canEditSessionPlanner()) {
return;
}
const exercise = getSessionPlannerExerciseLibrary().find((item) => item.id === exerciseId);
const block = getSessionPlannerSelectedBlock();
if (!exercise || !block) {
return;
}
if (isSessionPlannerLibraryExerciseArchived(exercise)) {
showSessionPlannerToast("Restore the exercise before using it in a session.", "warning");
return;
}
const {
archivedAt,
archivedBy,
createdAt,
createdBy,
source,
tags,
updatedAt,
updatedBy,
versions,
reviewNotes,
postSessionNotes,
...exerciseContent
} = exercise;
Object.assign(block, {
...exerciseContent,
id: block.id,
label: block.label,
libraryExerciseId: exercise.id,
postSessionNotes: block.postSessionNotes || "",
visualImage: exercise.visualImage || "",
playerBoardPositions: normalizeSessionPlannerPlayerBoardPositions(exercise.playerBoardPositions),
playerBoardColors: normalizeSessionPlannerPlayerBoardColors(exercise.playerBoardColors),
playerBoardCustomPeople: normalizeSessionPlannerPlayerBoardCustomPeople(exercise.playerBoardCustomPeople),
tacticalFrames: normalizeSessionPlannerTacticalFrames(exercise.tacticalFrames),
tacticalActiveFrameId: exercise.tacticalActiveFrameId || "",
tacticalElements: Array.isArray(exercise.tacticalElements)
? exercise.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [],
});
markSessionPlannerBlockFieldsUpdated(block, sessionPlannerBlockMergeFields);
sessionPlannerLibraryOpen = false;
sessionPlannerAddMenuOpen = false;
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function updateSelectedSessionPlannerBlockField(field, rawValue, options = {}) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
const previousValue = block?.[field];
if (!assignSessionPlannerBlockFieldValue(block, field, rawValue)) {
return;
}
if (block[field] !== previousValue) {
markSessionPlannerBlockFieldsUpdated(block, [field]);
}
const saved = writeSessionPlannerState();
if (saved && field === "postSessionNotes" && options.syncExerciseReview) {
syncSessionPlannerPostSessionNotesToLibrary(block);
}
}
function getSessionPlannerDateLabel(dateValue, options = {}) {
return new Intl.DateTimeFormat("en-GB", options).format(parseScheduleDateValue(dateValue));
}
function syncSessionPlannerDateStripState(dateControls = ui.sessionPlannerWorkspace?.querySelector(".session-date-controls")) {
const dateStrip = dateControls?.querySelector(".session-date-strip");
if (!dateStrip || !sessionPlannerState) {
return;
}
dateStrip.querySelectorAll("[data-session-date]").forEach((dateButton) => {
const dateValue = dateButton.dataset.sessionDate;
const isSelected = dateValue === sessionPlannerState.selectedDate;
const hasSession =
Boolean(sessionPlannerState.sessions?.[dateValue]?.blocks?.length) ||
Boolean(getScheduleSessionEventForDate(dateValue));
dateButton.classList.toggle("is-active", isSelected);
dateButton.classList.toggle("has-session", hasSession);
});
}
function scrollSessionPlannerSelectedDateIntoView(options = {}) {
const selectedDateButton = ui.sessionPlannerWorkspace?.querySelector(".session-date-pill.is-active");
selectedDateButton?.scrollIntoView({
behavior: options.behavior || "auto",
block: "nearest",
inline: "center",
});
}
function getSessionPlannerTacticalEndpointCoordinates(element) {
return sessionPlannerVisualRenderer.getTacticalEndpointCoordinates(element);
}
function renderSessionPlannerExerciseVisual(block, options = {}) {
return sessionPlannerVisualRenderer.renderExerciseVisual(block, options);
}
function renderSessionPlannerActionIcon(name) {
return sessionPlannerVisualRenderer.renderActionIcon(name);
}
function resizeSessionPlannerTextarea(textarea) {
if (!textarea || textarea.tagName !== "TEXTAREA") {
return;
}
textarea.style.height = "auto";
textarea.style.height = `${textarea.scrollHeight}px`;
}
function resizeSessionPlannerTextareas() {
ui.sessionPlannerWorkspace
?.querySelectorAll("textarea[data-session-field]")
.forEach((textarea) => resizeSessionPlannerTextarea(textarea));
}
function scrollSessionPlannerDateStrip(direction) {
const dateStrip = ui.sessionPlannerWorkspace?.querySelector(".session-date-strip");
if (!dateStrip) {
return;
}
const datePill = dateStrip.querySelector(".session-date-pill");
const pillGap = 8;
const pillWidth = datePill?.getBoundingClientRect().width ?? 52;
const scrollDistance = (pillWidth + pillGap) * 7;
const targetLeft = Math.max(0, dateStrip.scrollLeft + direction * scrollDistance);
const prefersReducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
dateStrip.scrollTo({
left: targetLeft,
behavior: prefersReducedMotion ? "auto" : "smooth",
});
}
function jumpSessionPlannerToToday() {
selectSessionPlannerDate(formatScheduleDateValue(new Date()));
}
function canRemoveSessionPlannerLibraryExerciseFromSelectedFolder(exercise = {}) {
const selectedFolder = getSessionPlannerLibraryFolderById(sessionPlannerLibrarySelectedFolderId);
return Boolean(
canEditSessionPlanner() &&
exercise.id &&
!isSessionPlannerLibraryExerciseArchived(exercise) &&
selectedFolder &&
!isSessionPlannerLibraryFolderArchived(selectedFolder) &&
normalizeSessionPlannerLibraryFolderExerciseIds(selectedFolder.exerciseIds).includes(exercise.id)
);
}
function renderSessionPlannerCentralSyncConflictOverlay() {
if (!sessionPlannerCentralSyncConflict) {
return "";
}
return `
    <div class="session-library-overlay session-save-conflict-overlay" data-session-central-conflict-overlay>
      <section class="session-library-modal session-save-conflict-modal session-central-conflict-modal" role="dialog" aria-modal="true" aria-label="Session sync conflict">
        <header class="session-library-modal-head">
          <div>
            <span>Autosave</span>
            <h2>Someone saved this session first</h2>
          </div>
          <button
            type="button"
            class="session-library-close-button"
            data-session-central-conflict-action="keep-central"
            aria-label="Keep synced version"
          >
            Keep synced
          </button>
        </header>
        <div class="session-save-conflict-copy">
          <strong>Sync issue</strong>
          <p>${escapeHtml(sessionPlannerCentralSyncConflict.reason || "The central version changed while you were editing.")}</p>
          <p>Choose the synced version, or save your local board changes again if you want them to replace the latest version.</p>
        </div>
        <div class="session-save-conflict-actions">
          <button type="button" class="session-save-conflict-secondary" data-session-central-conflict-action="keep-central">
            Use synced version
          </button>
          <button type="button" class="session-save-conflict-primary" data-session-central-conflict-action="save-local">
            Save my version
          </button>
        </div>
      </section>
    </div>
  `;
}
function resolveSessionPlannerCentralSyncConflict(action = "keep-central") {
if (!sessionPlannerCentralSyncConflict) {
return;
}
const conflict = sessionPlannerCentralSyncConflict;
sessionPlannerCentralSyncConflict = null;
sessionPlannerAutosaveBoundary.markSessionPlannerWrite();
if (action === "save-local" && conflict.localValue) {
win.__footballScienceCentralHydrating = true;
try {
rawDataSafetySetItem(sessionPlannerStorageKey, conflict.localValue);
} finally {
win.__footballScienceCentralHydrating = false;
}
sessionPlannerState = readSessionPlannerStatePreservingUiSelection();
queueCentralStateWrite(sessionPlannerStorageKey, conflict.localValue);
setPlatformAutosaveStatusForKey(sessionPlannerStorageKey, "saving", "Saving");
} else if (conflict.centralValue) {
win.__footballScienceCentralHydrating = true;
try {
rawDataSafetySetItem(sessionPlannerStorageKey, conflict.centralValue);
} finally {
win.__footballScienceCentralHydrating = false;
}
sessionPlannerState = readSessionPlannerStatePreservingUiSelection();
setPlatformAutosaveStatusForKey(sessionPlannerStorageKey, "saved", "Saved");
} else {
setPlatformAutosaveStatusForKey(sessionPlannerStorageKey, "saved", "Saved");
}
if (hubState?.activeWorkspaceId === "session-planner") {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
}
function getSessionPlannerBlockNumber(block = getSessionPlannerSelectedBlock()) {
const session = getSessionPlannerSelectedSession();
const index = session?.blocks?.findIndex((candidate) => candidate.id === block?.id) ?? -1;
return index >= 0 ? index + 1 : 1;
}
function getSessionPlannerPlayerBoardRule(block = getSessionPlannerSelectedBlock()) {
const blockNumber = getSessionPlannerBlockNumber(block);
if (blockNumber <= 1) {
return { blockNumber, label: "Block 1", valueLabel: "10%+", min: 10 };
}
if (blockNumber === 2) {
return { blockNumber, label: "Block 2", valueLabel: "25%+", min: 25 };
}
if (blockNumber === 3) {
return { blockNumber, label: "Block 3", valueLabel: "50%+", min: 50 };
}
return { blockNumber, label: `Block ${blockNumber}`, valueLabel: "75%+", min: 75 };
}
function getSessionPlannerPlayerBoardProfileState() {
try {
return ensurePlayerProfilesState();
} catch {
return playerProfilesState;
}
}
function getSessionPlannerPlayerBoardProfileForPlayer(player = {}) {
const profileState = getSessionPlannerPlayerBoardProfileState();
const profiles = Array.isArray(profileState?.players) ? profileState.players : [];
if (!profiles.length) {
return null;
}
const playerIds = [player.id, player.playerId, player.profileId, player.medicalPlayerId]
.map((value) => String(value ?? "").trim())
.filter(Boolean);
const idMatch = profiles.find((profile) =>
[profile.id, profile.playerId, profile.medicalPlayerId, profile.sourceId]
.map((value) => String(value ?? "").trim())
.filter(Boolean)
.some((value) => playerIds.includes(value))
);
if (idMatch) {
return idMatch;
}
const nameKey = normalizeSessionPlannerPlayerBoardProfileKey(player.name);
if (nameKey) {
const nameMatch = profiles.find((profile) => normalizeSessionPlannerPlayerBoardProfileKey(profile.name) === nameKey);
if (nameMatch) {
return nameMatch;
}
}
const numberKey = String(player.number ?? "").trim();
if (numberKey) {
const numberMatches = profiles.filter((profile) => String(profile.number ?? "").trim() === numberKey);
if (numberMatches.length === 1) {
return numberMatches[0];
}
}
return null;
}
function getSessionPlannerPlayerBoardProfileRoleFitMap(profile = {}) {
if (!profile) {
return {};
}
if (profile.roleFit && typeof profile.roleFit === "object" && !Array.isArray(profile.roleFit)) {
return profile.roleFit;
}
try {
return Object.fromEntries(playerProfileRoleOptions.map((role) => [role, getPlayerProfileRoleFitScore(profile, role)]));
} catch {
return {};
}
}
function getSessionPlannerPlayerBoardFutureMinutesValue(source) {
if (!source) {
return null;
}
if (typeof source === "number") {
return Number.isFinite(source) ? source : null;
}
if (Array.isArray(source)) {
const total = source.reduce((sum, item) => {
const value =
getSessionPlannerPlayerBoardNumericPriorityValue(item?.minutes) ??
getSessionPlannerPlayerBoardNumericPriorityValue(item?.played) ??
getSessionPlannerPlayerBoardNumericPriorityValue(item?.value) ??
getSessionPlannerPlayerBoardNumericPriorityValue(item?.total) ??
0;
return sum + value;
}, 0);
return total > 0 ? total : null;
}
if (typeof source === "object") {
const directValue =
getSessionPlannerPlayerBoardNumericPriorityValue(source.minutes) ??
getSessionPlannerPlayerBoardNumericPriorityValue(source.played) ??
getSessionPlannerPlayerBoardNumericPriorityValue(source.value) ??
getSessionPlannerPlayerBoardNumericPriorityValue(source.total);
if (directValue !== null) {
return directValue;
}
}
return null;
}
function getSessionPlannerPlayerBoardSyncedPlayer(player = {}) {
  const profile = getSessionPlannerPlayerBoardProfileForPlayer(player);
  if (!profile) {
    return player;
  }
  const roleFit = getSessionPlannerPlayerBoardProfileRoleFitMap(profile);
  const futureMinutes = getSessionPlannerPlayerBoardFutureMinutesValue(profile.futureData?.minutes);
  const squadStatusPriority = getSessionPlannerPlayerBoardSquadStatusPriority(profile.squadStatus);
  const careerPhasePriority = getSessionPlannerPlayerBoardCareerPhasePriority(profile.careerPhase);
  return {
    ...player,
    status: profile.status || player.status,
    availabilityStatus: profile.status || player.availabilityStatus,
    availability_status: profile.status || player.availability_status,
    number: profile.number || player.number,
    name: profile.name || player.name,
    position: profile.position || player.position,
    photoUrl: profile.photoUrl || player.photoUrl,
    sourceUrl: profile.sourceUrl || player.sourceUrl,
    rosterOrder: Number.isFinite(Number(profile.rosterOrder)) ? Number(profile.rosterOrder) : player.rosterOrder,
    profileId: profile.id,
    medicalPlayerId: player.id,
    squadStatus: profile.squadStatus,
    careerPhase: profile.careerPhase,
    rosterType: profile.rosterType,
    countsInSquad: profile.countsInSquad,
    temporaryGroup: profile.temporaryGroup,
    temporaryFrom: profile.temporaryFrom,
    temporaryTo: profile.temporaryTo,
    primaryRole: profile.primaryRole,
    secondaryRoles: Array.isArray(profile.secondaryRoles) ? [...profile.secondaryRoles] : [],
    preferredSide: profile.preferredSide,
    roleGroup: profile.roleGroup,
    attributeRatings: profile.attributeRatings,
    idp: profile.idp,
    futureData: profile.futureData,
    coachNotes: profile.coachNotes,
    roleFit,
    rolePriority: roleFit,
    positionPriority: roleFit,
    squadImportance: squadStatusPriority,
    careerPhasePriority,
    seasonMinutes: futureMinutes ?? player.seasonMinutes,
  };
}
function getSessionPlannerPlayerBoardBridgeContract(player = {}) {
const profile = getSessionPlannerPlayerBoardProfileForPlayer(player);
if (!profile) {
return null;
}
return createSessionPlannerPlayerProfileContract(profile, sessionPlannerState?.selectedDate);
}
function getSessionPlannerPlayerBoardBridgeRoleLabel(player = {}) {
const primaryRole = normalizePlayerProfileRole(player.primaryRole, "");
if (primaryRole) {
return primaryRole;
}
const roleFit = player.roleFit && typeof player.roleFit === "object" && !Array.isArray(player.roleFit)
? player.roleFit
: {};
const bestRole = Object.entries(roleFit)
.filter(([role, score]) => playerProfileRoleOptions.includes(role) && Number.isFinite(Number(score)))
.sort((first, second) => Number(second[1]) - Number(first[1]))[0]?.[0];
return bestRole || "";
}
function getSessionPlannerPlayerBoardBridgeBestMatches(player = {}, limit = 3) {
const roleFit = player.roleFit && typeof player.roleFit === "object" && !Array.isArray(player.roleFit)
? player.roleFit
: {};
return Object.entries(roleFit)
.filter(([role, score]) => playerProfileRoleOptions.includes(role) && Number.isFinite(Number(score)))
.sort((first, second) => Number(second[1]) - Number(first[1]))
.slice(0, limit)
.map(([role, score]) => ({
role,
score: Math.round(Number(score)),
definition: getPlayerRoleDnaDefinition(role),
}));
}
function getSessionPlannerPlayerBoardBridgeSummary(boardPlayers = []) {
const linkedItems = boardPlayers.filter((item) => item.player?.profileId);
const roleDnaItems = linkedItems.filter((item) => Object.keys(item.player?.roleFit || {}).length > 0);
const temporaryItems = boardPlayers.filter((item) => isTemporaryPlayerProfile(item.player));
const roleCounts = linkedItems.reduce((counts, item) => {
const role = getSessionPlannerPlayerBoardBridgeRoleLabel(item.player) || "Unset";
counts[role] = (counts[role] || 0) + 1;
return counts;
}, {});
const roleSummary = Object.entries(roleCounts)
.sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
.slice(0, 4)
.map(([role, count]) => `${role} ${count}`)
.join(" / ");
return {
linkedCount: linkedItems.length,
roleDnaCount: roleDnaItems.length,
totalCount: boardPlayers.length,
temporaryCount: temporaryItems.length,
roleSummary,
linkedItems,
};
}
function applySessionPlannerSelectionAssistant() {
const block = getSessionPlannerSelectedBlock();
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const assistant = buildSessionPlannerSelectionAssistant(block, boardPlayers);
const playerIds = assistant.suggestions.map((suggestion) => suggestion.item.player.id);
if (!playerIds.length) {
showSessionPlannerToast("No suggested players available for this block.", "error");
return;
}
sessionPlannerPlayerBoardAssistantOpen = false;
setSessionPlannerPlayerBoardSelectedPlayers(playerIds, { render: true });
showSessionPlannerToast(`Selection Assistant selected ${playerIds.length} player${playerIds.length === 1 ? "" : "s"}.`);
}
function compareSessionPlannerPlayerBoardItems(first, second) {
const firstGroup = getSessionPlannerPlayerBoardPositionGroup(first?.player);
const secondGroup = getSessionPlannerPlayerBoardPositionGroup(second?.player);
const groupComparison = firstGroup.order - secondGroup.order;
if (groupComparison !== 0) {
return groupComparison;
}
return compareMedicalPlayers(first.player, second.player);
}
function isSessionPlannerPlayerVisibleForBoard(participation, rule) {
if (participation === null || participation === undefined || participation <= 0) {
return false;
}
return participation >= rule.min;
}
function isSessionPlannerPlayerBoardCustomPersonId(playerId = "") {
return String(playerId || "").startsWith("player-board-person-");
}
function getSessionPlannerPlayerBoardCustomPeople(block = getSessionPlannerSelectedBlock()) {
return normalizeSessionPlannerPlayerBoardCustomPeople(block?.playerBoardCustomPeople);
}
function getSessionPlannerPlayerBoardCustomPerson(block, personId) {
return getSessionPlannerPlayerBoardCustomPeople(block).find((person) => person.id === personId) || null;
}
function createSessionPlannerPlayerBoardCustomItem(person = {}) {
const kind = person.kind === "staff" ? "staff" : "player";
const roleLabel = person.role || (kind === "staff" ? "Staff" : "Guest");
return {
player: {
id: person.id,
name: person.name,
position: roleLabel,
role: roleLabel,
roleGroup: kind === "staff" ? "midfielder" : "",
rosterType: "guest",
countsInSquad: false,
temporaryGroup: kind === "staff" ? "Staff" : "Manual board",
playerBoardCustom: true,
playerBoardKind: kind,
playerBoardRoleLabel: roleLabel,
},
record: null,
planningOnly: true,
participation: 100,
status: { label: kind === "staff" ? "Staff added" : "Added manually" },
};
}
function getSessionPlannerPlayerBoardPlayers(block = getSessionPlannerSelectedBlock()) {
const rule = getSessionPlannerPlayerBoardRule(block);
const availabilityItems = getSessionPlannerAvailabilityItems(sessionPlannerState?.selectedDate)
.filter((item) => !isMedicalPlayerBlockedBySquadAvailability(item.player))
.filter((item) => (item.record || item.planningOnly) && isSessionPlannerPlayerVisibleForBoard(item.participation, rule))
.map((item) => ({
...item,
player: getSessionPlannerPlayerBoardSyncedPlayer(item.player),
}));
const customItems = getSessionPlannerPlayerBoardCustomPeople(block).map(createSessionPlannerPlayerBoardCustomItem);
return [...availabilityItems, ...customItems].sort(compareSessionPlannerPlayerBoardItems);
}
function getSessionPlannerPlayerBoardSummary(block = getSessionPlannerSelectedBlock()) {
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const availabilityItems = getSessionPlannerAvailabilityItems(sessionPlannerState?.selectedDate);
const rule = getSessionPlannerPlayerBoardRule(block);
const temporaryBoardCount = boardPlayers.filter((item) => isTemporaryPlayerProfile(item.player)).length;
return {
boardPlayers,
rule,
temporaryBoardCount,
belowLimitCount: availabilityItems.filter(
(item) => item.record && item.participation > 0 && item.participation < rule.min
).length,
hiddenZeroCount: availabilityItems.filter((item) => item.record && item.participation === 0).length,
unconfirmedCount: availabilityItems.filter((item) => !item.record && !item.planningOnly).length,
};
}
function getSessionPlannerPlayerBoardWarnings(block = getSessionPlannerSelectedBlock(), dateValue = sessionPlannerState?.selectedDate) {
const rule = getSessionPlannerPlayerBoardRule(block);
const availabilityItems = getSessionPlannerAvailabilityItems(dateValue);
const available = availabilityItems.filter((item) =>
(item.record || item.planningOnly) && isSessionPlannerPlayerVisibleForBoard(item.participation, rule)
);
const belowLimit = availabilityItems.filter((item) => item.record && item.participation > 0 && item.participation < rule.min);
const unavailable = availabilityItems.filter((item) => item.record && item.participation === 0);
const unconfirmed = availabilityItems.filter((item) => !item.record && !item.planningOnly);
return {
rule,
available,
belowLimit,
unavailable,
unconfirmed,
hasWarnings: Boolean(belowLimit.length || unavailable.length || unconfirmed.length),
};
}
function syncSessionPlannerPlayerBoardSelection(block = getSessionPlannerSelectedBlock()) {
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const visibleIds = new Set(boardPlayers.map((item) => item.player.id));
sessionPlannerPlayerBoardSelectedPlayerIds = sessionPlannerPlayerBoardSelectedPlayerIds.filter((playerId) =>
visibleIds.has(playerId)
);
if (!boardPlayers.length || !sessionPlannerPlayerBoardSelectedPlayerId) {
sessionPlannerPlayerBoardSelectedPlayerId = "";
return null;
}
const selectedItem = boardPlayers.find((item) => item.player.id === sessionPlannerPlayerBoardSelectedPlayerId) ?? null;
if (!selectedItem) {
sessionPlannerPlayerBoardSelectedPlayerId = "";
}
return selectedItem;
}
function getSessionPlannerPlayerBoardAutoTargetItems(block) {
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const selectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(sessionPlannerPlayerBoardSelectedPlayerIds, block);
if (!selectedIds.length) {
return boardPlayers;
}
const selectedIdSet = new Set(selectedIds);
return boardPlayers.filter((item) => selectedIdSet.has(item.player.id));
}
function getSessionPlannerPlayerBoardAutoSelectFormation() {
let formationValue = normalizeSessionPlannerPlayerBoardFormationValue(sessionPlannerPlayerBoardFormationInput);
if (!parseSessionPlannerPlayerBoardFormation(formationValue).length) {
const promptValue = win.prompt("Set formation for Auto Select", formationValue || "3-3-1");
if (promptValue === null) {
return null;
}
formationValue = normalizeSessionPlannerPlayerBoardFormationValue(promptValue);
}
const formation = parseSessionPlannerPlayerBoardFormation(formationValue);
if (!formation.length) {
showSessionPlannerToast("Enter a formation, for example 3-3-1.", "error");
return null;
}
sessionPlannerPlayerBoardFormationInput = formationValue;
return formation;
}
function applySessionPlannerPlayerBoardAutoTeamFormation(block, targetItems, assignments, formation) {
if (assignments.some((assignment) => assignment?.position)) {
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
targetItems.forEach((item) => {
if (item?.player?.id) {
delete block.playerBoardPositions[item.player.id];
}
});
assignments.forEach((assignment) => {
if (assignment?.playerId && assignment.position) {
block.playerBoardPositions[assignment.playerId] = assignment.position;
}
});
return;
}
const itemsById = new Map(targetItems.map((item) => [item.player.id, item]));
const teams = Array.from({ length: sessionPlannerPlayerBoardTeamCount }, () => []);
assignments.forEach((assignment) => {
const item = itemsById.get(assignment.playerId);
if (item && teams[assignment.teamIndex]) {
teams[assignment.teamIndex].push(item);
}
});
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
targetItems.forEach((item) => {
if (item?.player?.id) {
delete block.playerBoardPositions[item.player.id];
}
});
teams.forEach((teamItems, teamIndex) => {
if (!teamItems.length) {
return;
}
const slots = createSessionPlannerPlayerBoardAutoTeamFormationSlots(
teamItems,
formation,
teamIndex,
sessionPlannerPlayerBoardTeamCount
);
const positionAssignments = assignSessionPlannerPlayerBoardFormationSlots(teamItems, slots, {
prioritize: sessionPlannerPlayerBoardAutoMode === "best-xi",
});
positionAssignments.forEach((assignment) => {
block.playerBoardPositions[assignment.playerId] = assignment.position;
});
});
}
function applySessionPlannerPlayerBoardAutoSelect() {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
sessionPlannerPlayerBoardTeamCount = normalizeSessionPlannerPlayerBoardTeamCount(sessionPlannerPlayerBoardTeamCount);
sessionPlannerPlayerBoardAutoMode = normalizeSessionPlannerPlayerBoardAutoMode(sessionPlannerPlayerBoardAutoMode);
const targetItems = getSessionPlannerPlayerBoardAutoTargetItems(block);
if (!targetItems.length) {
showSessionPlannerToast("No available players to auto-select.", "error");
return;
}
const formation = getSessionPlannerPlayerBoardAutoSelectFormation();
if (!formation) {
return;
}
const assignments = assignSessionPlannerPlayerBoardAutoFormationTeams(
targetItems,
sessionPlannerPlayerBoardTeamCount,
sessionPlannerPlayerBoardAutoMode,
block,
formation
);
if (!assignments.length) {
showSessionPlannerToast("Auto Select could not find any players to colour.", "error");
return;
}
if (!block.playerBoardColors || typeof block.playerBoardColors !== "object") {
block.playerBoardColors = {};
}
const assignedIds = new Set(assignments.map((assignment) => assignment.playerId));
targetItems.forEach((item) => {
if (item?.player?.id) {
delete block.playerBoardColors[item.player.id];
}
});
assignments.forEach((assignment) => {
const color = sessionPlannerPlayerBoardColorOptions[assignment.teamIndex % sessionPlannerPlayerBoardColorOptions.length]?.value;
if (color && assignedIds.has(assignment.playerId)) {
block.playerBoardColors[assignment.playerId] = color;
}
});
applySessionPlannerPlayerBoardAutoTeamFormation(block, targetItems, assignments, formation);
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions", "playerBoardColors"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
const modeLabel =
sessionPlannerPlayerBoardAutoModeOptions.find((option) => option.key === sessionPlannerPlayerBoardAutoMode)?.label ??
"Auto Select";
showSessionPlannerToast(
`${modeLabel}: ${assignments.length} player${assignments.length === 1 ? "" : "s"} assigned across ${sessionPlannerPlayerBoardTeamCount} team${sessionPlannerPlayerBoardTeamCount === 1 ? "" : "s"} in ${formation.join("-")}.`
);
}
function applySessionPlannerPlayerBoardFormation(options = {}) {
if (!canEditSessionPlanner()) {
return;
}
const block = getSessionPlannerSelectedBlock();
if (!block) {
return;
}
const selectedIds = normalizeSessionPlannerPlayerBoardSelectedIds(sessionPlannerPlayerBoardSelectedPlayerIds, block);
if (!selectedIds.length) {
showSessionPlannerToast("Select players first.", "error");
return;
}
const formation = parseSessionPlannerPlayerBoardFormation(sessionPlannerPlayerBoardFormationInput);
const outfieldSlotCount = formation.reduce((total, count) => total + count, 0);
if (!outfieldSlotCount) {
showSessionPlannerToast("Enter a formation, for example 3-3-1.", "error");
return;
}
const boardPlayers = getSessionPlannerPlayerBoardPlayers(block);
const selectedItems = selectedIds
.map((playerId) => boardPlayers.find((item) => item.player.id === playerId))
.filter(Boolean);
const hasGoalkeeper = selectedItems.some(
(item) => getSessionPlannerPlayerBoardPlayerRoleProfile(item.player).roleKey === "goalkeeper"
);
const hasGoalkeeperSlot = hasGoalkeeper && selectedItems.length === outfieldSlotCount + 1;
const expectedCount = outfieldSlotCount + (hasGoalkeeperSlot ? 1 : 0);
if (selectedItems.length < expectedCount || (!options.prioritize && selectedItems.length !== expectedCount)) {
const expectedLabel = hasGoalkeeper
? `${outfieldSlotCount} or ${outfieldSlotCount + 1} with goalkeeper`
: String(outfieldSlotCount);
showSessionPlannerToast(
`The formation needs ${expectedLabel} players. You selected ${selectedItems.length}.`,
"error"
);
return;
}
const slots = createSessionPlannerPlayerBoardFormationSlots(formation, hasGoalkeeperSlot);
const assignments = assignSessionPlannerPlayerBoardFormationSlots(selectedItems, slots, options);
if (!assignments.length) {
return;
}
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
block.playerBoardLayoutMode = "manual";
assignments.forEach((assignment) => {
block.playerBoardPositions[assignment.playerId] = assignment.position;
});
markSessionPlannerBlockFieldsUpdated(block, ["playerBoardLayoutMode", "playerBoardPositions"]);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
showSessionPlannerToast(
`${options.prioritize ? "Prioritized formation" : "Formation"} ${formation.join("-")} placed for ${assignments.length} player${assignments.length === 1 ? "" : "s"}.`
);
}
function getSessionPlannerPlayerBoardPosition(block, item, index, boardPlayers = []) {
const playerId = typeof item === "string" ? item : item?.player?.id;
if (!block.playerBoardPositions || typeof block.playerBoardPositions !== "object") {
block.playerBoardPositions = {};
}
const savedPosition = block.playerBoardPositions[playerId];
if (block.playerBoardLayoutMode === "manual" && savedPosition) {
return {
x: clamp(Number(savedPosition.x) || 50, 0, 100),
y: clamp(Number(savedPosition.y) || 50, 0, 100),
};
}
return getSessionPlannerPlayerBoardDefaultPosition(item, index, boardPlayers);
}
function getSessionPlannerPlayerBoardPositionById(block, playerId, boardPlayers = getSessionPlannerPlayerBoardPlayers(block)) {
const index = boardPlayers.findIndex((item) => item.player.id === playerId);
const item = boardPlayers[index] ?? { player: { id: playerId, position: "" } };
return getSessionPlannerPlayerBoardPosition(block, item, Math.max(index, 0), boardPlayers);
}
function getSessionPlannerPlayerBoardReadableSpacing(playerCount, mode = "preview") {
const count = Math.max(0, Number(playerCount) || 0);
const compact = count > 28;
const dense = count > 20;
if (mode === "print") {
return {
minX: compact ? 6.4 : dense ? 7.2 : 8,
minY: compact ? 5.7 : dense ? 6.35 : 7,
};
}
return {
minX: compact ? 7 : dense ? 7.8 : 8.8,
minY: compact ? 6.05 : dense ? 6.7 : 7.4,
};
}
function getSessionPlannerReadablePlayerBoardPositions(block, boardPlayers = [], options = {}) {
const items = Array.isArray(boardPlayers) ? boardPlayers : [];
const minX = Number.isFinite(Number(options.minX)) ? Number(options.minX) : 8;
const minY = Number.isFinite(Number(options.minY)) ? Number(options.minY) : 6.5;
const minBoundsX = Number.isFinite(Number(options.minBoundsX)) ? Number(options.minBoundsX) : 5;
const maxBoundsX = Number.isFinite(Number(options.maxBoundsX)) ? Number(options.maxBoundsX) : 95;
const minBoundsY = Number.isFinite(Number(options.minBoundsY)) ? Number(options.minBoundsY) : 8;
const maxBoundsY = Number.isFinite(Number(options.maxBoundsY)) ? Number(options.maxBoundsY) : 92;
const entries = items
.map((item, index) => {
const playerId = item?.player?.id;
if (!playerId) {
return null;
}
const position = getSessionPlannerPlayerBoardPosition(block, item, index, items);
return {
id: playerId,
index,
x: clamp(Number(position.x) || 50, minBoundsX, maxBoundsX),
y: clamp(Number(position.y) || 50, minBoundsY, maxBoundsY),
};
})
.filter(Boolean);
for (let iteration = 0; iteration < 72; iteration += 1) {
let moved = false;
for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
const first = entries[firstIndex];
const second = entries[secondIndex];
const dx = second.x - first.x;
const dy = second.y - first.y;
const overlapX = minX - Math.abs(dx);
const overlapY = minY - Math.abs(dy);
if (overlapX <= 0 || overlapY <= 0) {
continue;
}
const separateOnX = Math.abs(dx) > 0.01 && (overlapX < overlapY || Math.abs(dy) <= 0.01);
if (separateOnX) {
const direction = Math.sign(dx) || (first.index < second.index ? 1 : -1);
const correction = (overlapX + 0.12) / 2;
first.x = clamp(first.x - direction * correction, minBoundsX, maxBoundsX);
second.x = clamp(second.x + direction * correction, minBoundsX, maxBoundsX);
} else {
const direction = Math.sign(dy) || (first.index < second.index ? 1 : -1);
const correction = (overlapY + 0.12) / 2;
first.y = clamp(first.y - direction * correction, minBoundsY, maxBoundsY);
second.y = clamp(second.y + direction * correction, minBoundsY, maxBoundsY);
}
moved = true;
}
}
if (!moved) {
break;
}
}
return new Map(entries.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
}
function copySessionPlannerPlayerBoardTeamsFromBlock(sourceBlockId) {
if (!canEditSessionPlanner()) {
return;
}
const session = getSessionPlannerSelectedSession();
const targetBlock = getSessionPlannerSelectedBlock();
if (!session || !targetBlock || !sourceBlockId) {
showSessionPlannerToast("Choose a block to copy teams from.", "error");
return;
}
const blocks = Array.isArray(session.blocks) ? session.blocks : [];
const sourceEntry = blocks
.map((block, index) => ({ block, index }))
.find(({ block }) => block?.id === sourceBlockId);
const sourceBlock = sourceEntry?.block;
if (!sourceBlock || sourceBlock.id === targetBlock.id) {
showSessionPlannerToast("Choose another block from this session.", "error");
return;
}
const targetPlayers = getSessionPlannerPlayerBoardPlayers(targetBlock);
const visibleIds = new Set(targetPlayers.map((item) => item.player.id));
if (!visibleIds.size) {
showSessionPlannerToast("No visible players in this block yet.", "error");
return;
}
const sourceColors = getSessionPlannerPlayerBoardDataObject(sourceBlock.playerBoardColors);
const sourcePositions = getSessionPlannerPlayerBoardDataObject(sourceBlock.playerBoardPositions);
const sourceColorIds = Object.keys(sourceColors);
const sourcePositionIds = Object.keys(sourcePositions);
const shouldCopyColors = sourceColorIds.length > 0;
const shouldCopyPositions = sourcePositionIds.length > 0;
if (!shouldCopyColors && !shouldCopyPositions) {
showSessionPlannerToast("That block has no team setup to copy yet.", "error");
return;
}
const sourcePlayerIds = new Set([...sourceColorIds, ...sourcePositionIds]);
const nextColors = { ...getSessionPlannerPlayerBoardDataObject(targetBlock.playerBoardColors) };
const nextPositions = { ...getSessionPlannerPlayerBoardDataObject(targetBlock.playerBoardPositions) };
if (shouldCopyColors) {
visibleIds.forEach((playerId) => delete nextColors[playerId]);
}
if (shouldCopyPositions) {
visibleIds.forEach((playerId) => delete nextPositions[playerId]);
}
const copiedPlayerIds = new Set();
let copiedColors = 0;
let copiedPositions = 0;
let skippedPlayers = 0;
sourcePlayerIds.forEach((playerId) => {
if (!visibleIds.has(playerId)) {
skippedPlayers += 1;
return;
}
let copiedForPlayer = false;
const sourceColor = shouldCopyColors ? normalizeTacticalColor(sourceColors[playerId], "") : "";
if (sourceColor) {
nextColors[playerId] = sourceColor;
copiedColors += 1;
copiedForPlayer = true;
}
const sourcePosition = shouldCopyPositions ? sourcePositions[playerId] : null;
const x = Number(sourcePosition?.x);
const y = Number(sourcePosition?.y);
if (Number.isFinite(x) && Number.isFinite(y)) {
nextPositions[playerId] = {
x: clamp(x, 0, 100),
y: clamp(y, 0, 100),
};
copiedPositions += 1;
copiedForPlayer = true;
}
if (copiedForPlayer) {
copiedPlayerIds.add(playerId);
}
});
if (!copiedPlayerIds.size) {
showSessionPlannerToast("No matching players found in this block.", "error");
return;
}
const changedFields = [];
if (shouldCopyColors) {
targetBlock.playerBoardColors = nextColors;
changedFields.push("playerBoardColors");
}
if (shouldCopyPositions) {
targetBlock.playerBoardPositions = nextPositions;
if (copiedPositions) {
targetBlock.playerBoardLayoutMode = "manual";
changedFields.push("playerBoardLayoutMode");
}
changedFields.push("playerBoardPositions");
}
markSessionPlannerBlockFieldsUpdated(targetBlock, changedFields);
writeSessionPlannerState();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
const sourceLabel = getSessionPlannerPlayerBoardSourceLabel(sourceBlock, sourceEntry.index);
const copiedDetails = [
copiedColors ? `${copiedColors} colour${copiedColors === 1 ? "" : "s"}` : "",
copiedPositions ? `${copiedPositions} position${copiedPositions === 1 ? "" : "s"}` : "",
].filter(Boolean).join(" and ");
showSessionPlannerToast(
`Copied ${copiedDetails || `${copiedPlayerIds.size} player${copiedPlayerIds.size === 1 ? "" : "s"}`} from ${sourceLabel}${skippedPlayers ? ` (${skippedPlayers} not visible here)` : ""}.`
);
}
function formatSessionPlannerHistoryTime(value) {
return formatSessionPlannerHistoryTimeFromModule(value);
}
function getSessionPlannerHistoryActorLabel(entry = {}) {
return getSessionPlannerHistoryActorLabelFromModule(entry);
}
function getSessionPlannerHistoryActionLabel(action = "") {
return getSessionPlannerHistoryActionLabelFromModule(action);
}
function getSessionPlannerHistoryPanelContext() {
const dateValue = sessionPlannerState?.selectedDate || "";
return {
entries: sessionPlannerHistoryEntries,
isAdmin: isCurrentPlatformUserAdmin(),
isLoading: sessionPlannerHistoryLoading,
loadedDate: sessionPlannerHistoryLoadedDate,
loadError: sessionPlannerHistoryLoadError,
open: sessionPlannerHistoryOpen,
selectedDate: dateValue,
formatHistoryTime: formatSessionPlannerHistoryTime,
getHistoryActionLabel: getSessionPlannerHistoryActionLabel,
getHistoryActorLabel: getSessionPlannerHistoryActorLabel,
};
}
async function loadSessionPlannerHistory(dateValue = sessionPlannerState?.selectedDate, options = {}) {
const cleanDate = String(dateValue || "").trim();
if (!cleanDate || sessionPlannerHistoryLoading || !isCurrentPlatformUserAdmin()) {
return;
}
if (!options.force && sessionPlannerHistoryLoadedDate === cleanDate) {
return;
}
const authStore = getPlatformAuthStore();
if (!authStore?.getSessionHistory) {
sessionPlannerHistoryLoadError = "Session history is not ready yet.";
sessionPlannerHistoryLoadedDate = cleanDate;
return;
}
sessionPlannerHistoryLoading = true;
sessionPlannerHistoryLoadError = "";
try {
const result = await authStore.getSessionHistory(cleanDate, 50);
if (!result?.ok) {
sessionPlannerHistoryLoadError = result?.reason || "Session history could not be loaded.";
sessionPlannerHistoryLoadedDate = cleanDate;
return;
}
sessionPlannerHistoryEntries = Array.isArray(result.entries) ? result.entries : [];
sessionPlannerHistoryLoadedDate = cleanDate;
} catch (error) {
sessionPlannerHistoryLoadError = error?.message || "Session history could not be loaded.";
sessionPlannerHistoryLoadedDate = cleanDate;
} finally {
sessionPlannerHistoryLoading = false;
if (hubState?.activeWorkspaceId === "session-planner" && sessionPlannerState?.selectedDate === cleanDate) {
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
}
}
async function restoreSessionPlannerHistoryEntry(entryId) {
if (!canEditSessionPlanner()) {
showSessionPlannerToast("You do not have edit access for Session Planner.", "error");
return;
}
const historyEntry = sessionPlannerHistoryEntries.find((entry) => entry.id === entryId);
if (!historyEntry) {
showSessionPlannerToast("History entry could not be found.", "error");
return;
}
const willRemoveSession = !historyEntry.beforeSession;
const confirmed = win.confirm(
willRemoveSession
? `Undo the session created at ${formatSessionPlannerHistoryTime(historyEntry.createdAt)}?\n\nThis will remove the current session for ${historyEntry.date}.`
: `Restore the previous version from ${formatSessionPlannerHistoryTime(historyEntry.createdAt)}?\n\nThis will replace the current session for ${historyEntry.date}.`
);
if (!confirmed) {
return;
}
const authStore = getPlatformAuthStore();
if (!authStore?.restoreSessionHistory) {
showSessionPlannerToast("Session history restore is not ready yet.", "error");
return;
}
try {
const result = await authStore.restoreSessionHistory(entryId, "before");
if (!result?.ok) {
showSessionPlannerToast(result?.reason || "Session could not be restored.", "error");
return;
}
if (result.value) {
win.__footballScienceCentralHydrating = true;
try {
win.localStorage.setItem(sessionPlannerStorageKey, result.value);
} finally {
win.__footballScienceCentralHydrating = false;
}
}
sessionPlannerState = readSessionPlannerState();
if (result.date) {
sessionPlannerState.selectedDate = result.date;
}
sessionPlannerHistoryLoadedDate = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
loadSessionPlannerHistory(sessionPlannerState.selectedDate, { force: true }).catch(() => {});
showSessionPlannerToast("Session restored from version history.");
} catch (error) {
showSessionPlannerToast(error?.message || "Session could not be restored.", "error");
}
}
function getMedicalAvailabilityItems(dateValue = medicalState?.selectedDate) {
return medicalAvailabilitySelectors.getMedicalAvailabilityItems(dateValue);
}
function getSessionPlannerAvailabilityItems(dateValue = medicalState?.selectedDate) {
  return sessionPlannerMedicalAvailabilitySelectors.getAvailabilityItems(dateValue);
}
function getSessionPlannerMedicalAvailability(dateValue) {
return sessionPlannerMedicalAvailabilitySelectors.getMedicalAvailability(dateValue);
}
function updateSessionPlannerPrintPaper(value) {
if (!sessionPlannerPrintPaperOptions[value]) {
return;
}
sessionPlannerPrintPaper = value;
ensureSessionPlannerPrintPageStyle();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function updateSessionPlannerPrintSection(sectionKey, isEnabled) {
if (!sessionPlannerPrintSectionOptions.some((option) => option.key === sectionKey)) {
return;
}
sessionPlannerPrintSections = {
...sessionPlannerPrintSections,
[sectionKey]: Boolean(isEnabled),
};
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
function ensureSessionPlannerPrintPageStyle() {
const paper = sessionPlannerPrintRenderer.getPaperOption(sessionPlannerPrintPaper);
let styleElement = getElement("sessionPlannerPrintPageStyle");
if (!styleElement) {
styleElement = document.createElement("style");
styleElement.id = "sessionPlannerPrintPageStyle";
document.head.appendChild(styleElement);
}
styleElement.textContent = `
@page { size: ${paper.pageSize}; margin: 0; }
@media print {
  body.is-session-printing .session-print-root,
  body.is-session-printing .session-print-root *,
  body.is-session-printing .session-print-document,
  body.is-session-printing .session-print-document * {
    visibility: visible !important;
  }
}`;
}
function removeSessionPlannerPrintRoot() {
document.querySelectorAll("[data-session-print-root]").forEach((element) => element.remove());
sessionPlannerPrintRootElement = null;
}
function prepareSessionPlannerPrintRoot() {
removeSessionPlannerPrintRoot();
const printDocument = document.querySelector("[data-session-print-document]");
if (!printDocument) {
return false;
}
sessionPlannerPrintRootElement = document.createElement("div");
sessionPlannerPrintRootElement.className = "session-print-root";
sessionPlannerPrintRootElement.dataset.sessionPrintRoot = "";
sessionPlannerPrintRootElement.appendChild(printDocument.cloneNode(true));
document.body.appendChild(sessionPlannerPrintRootElement);
return true;
}
function printSessionPlannerCurrentSession() {
if (!sessionPlannerPrintOverlayOpen) {
sessionPlannerPrintOverlayOpen = true;
syncSessionPlannerPrintModeClass();
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
}
syncSessionPlannerPrintModeClass();
ensureSessionPlannerPrintPageStyle();
win.requestAnimationFrame(() => {
if (prepareSessionPlannerPrintRoot()) {
win.print();
}
});
}
function renderSessionPlannerWorkspace(options = {}) {
if (!ui.sessionPlannerWorkspace) {
return;
}
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
const previousDateControls = ui.sessionPlannerWorkspace.querySelector(".session-date-controls");
const previousRenderedSelectedDate =
previousDateControls?.querySelector(".session-date-pill.is-active")?.dataset.sessionDate ?? "";
const previousDateStripScrollLeft = previousDateControls?.querySelector(".session-date-strip")?.scrollLeft ?? 0;
const preserveDateStripScroll = options.preserveDateStripScroll ?? false;
const canReuseDateControls =
Boolean(previousDateControls) && previousRenderedSelectedDate === sessionPlannerState?.selectedDate;
const alignSelectedDate = options.alignSelectedDate ?? !canReuseDateControls;
ensurePeriodizationState();
const session = getSessionPlannerSelectedSession();
const block = getSessionPlannerSelectedBlock();
const isAdmin = canEditSessionPlanner();
const selectedDateLabel = getSessionPlannerDateLabel(sessionPlannerState.selectedDate, {
weekday: "long",
day: "numeric",
month: "long",
});
const sessionMatchDayLabel = getPeriodizationMatchDayLabel(getPeriodizationDay(sessionPlannerState.selectedDate).matchDay);
const sessionTitle =
session.title && session.title.toLowerCase() !== "no session planned"
? session.title
: getScheduledSessionTitleForDate(sessionPlannerState.selectedDate) || "Session";
const sessionTotalMinutes = getDashboardSessionTotalMinutes(session);
if (
isCurrentPlatformUserAdmin() &&
sessionPlannerHistoryOpen &&
sessionPlannerHistoryLoadedDate !== sessionPlannerState.selectedDate &&
!sessionPlannerHistoryLoading
) {
loadSessionPlannerHistory(sessionPlannerState.selectedDate).catch(() => {});
}
ui.sessionPlannerWorkspace.innerHTML = sessionPlannerWorkspaceRenderer.renderWorkspace({
addMenuOpen: sessionPlannerAddMenuOpen,
block,
historyContext: getSessionPlannerHistoryPanelContext(),
isAdmin,
selectedDate: sessionPlannerState.selectedDate,
selectedDateLabel,
session,
sessionMatchDayLabel,
sessionTitle,
sessionTotalMinutes,
});
if (canReuseDateControls) {
const nextDateControls = ui.sessionPlannerWorkspace.querySelector(".session-date-controls");
nextDateControls?.replaceWith(previousDateControls);
syncSessionPlannerDateStripState(previousDateControls);
const dateStrip = previousDateControls.querySelector(".session-date-strip");
if (dateStrip) {
dateStrip.scrollLeft = previousDateStripScrollLeft;
}
}
win.requestAnimationFrame(resizeSessionPlannerTextareas);
renderSessionPlannerToast();
if (preserveDateStripScroll && !canReuseDateControls) {
win.requestAnimationFrame(() => {
const dateStrip = ui.sessionPlannerWorkspace?.querySelector(".session-date-strip");
if (dateStrip) {
dateStrip.scrollLeft = previousDateStripScrollLeft;
}
});
} else if (alignSelectedDate && !canReuseDateControls) {
win.requestAnimationFrame(() => scrollSessionPlannerSelectedDateIntoView({ behavior: "auto" }));
}
}
let profileWorkspaceFlashMessage = "";
let profileWorkspaceFlashTimer = null;
function getProfileWorkspaceMessage(message = "") {
const nextMessage = String(message || "");
if (!nextMessage) {
return profileWorkspaceFlashMessage;
}
profileWorkspaceFlashMessage = nextMessage;
if (profileWorkspaceFlashTimer) {
win.clearTimeout(profileWorkspaceFlashTimer);
}
profileWorkspaceFlashTimer = win.setTimeout(() => {
profileWorkspaceFlashTimer = null;
profileWorkspaceFlashMessage = "";
if (hubState?.activeWorkspaceId === "my-profile") {
renderProfileWorkspace();
}
}, 5000);
return profileWorkspaceFlashMessage;
}
function renderProfileWorkspace(message = "") {
if (!ui.profileWorkspace) {
return;
}
const user = getCurrentPlatformUser();
if (!user) {
ui.profileWorkspace.innerHTML = "";
return;
}
const users = getPlatformUsers();
const personalTasks = readDashboardTasks().filter(
(task) => task.assignedTo === user.id && task.createdBy === user.id && task.scope === "personal"
);
const openPersonalTasks = personalTasks.filter((task) => task.status !== "done");
const completedPersonalTasks = personalTasks.filter((task) => task.status === "done").slice(0, 3);
const hasProfilePhoto = Boolean(getUserProfileImageUrl(user));
const profileMessage = getProfileWorkspaceMessage(message);
ui.profileWorkspace.innerHTML = profileWorkspaceRenderer.renderWorkspace({
user,
users,
openPersonalTasks,
completedPersonalTasks,
hasProfilePhoto,
message: profileMessage,
});
}
function getPlatformFormValues(form) {
return readPlatformFormValues(form);
}
function getPasswordValidationMessage(values = {}) {
return getPlatformPasswordValidationMessage(values);
}
function stripPasswordConfirmation(values = {}) {
return stripPlatformPasswordConfirmation(values);
}
function createProfileImageDataUrl(file) {
return new Promise((resolve, reject) => {
if (!file || !file.type?.startsWith("image/")) {
reject(new Error("Choose an image file."));
return;
}
if (file.size > 18 * 1024 * 1024) {
reject(new Error("Choose an image under 18 MB."));
return;
}
const image = new Image();
const objectUrl = URL.createObjectURL(file);
image.onload = () => {
try {
const naturalWidth = image.naturalWidth;
const naturalHeight = image.naturalHeight;
if (!naturalWidth || !naturalHeight) {
throw new Error("The image could not be read.");
}
const outputSizes = [512, 448, 384, 320, 256, 192, 128];
const outputFormats = [
["image/webp", [0.82, 0.72, 0.62, 0.52]],
["image/jpeg", [0.78, 0.68, 0.58, 0.48]],
];
const sourceSize = Math.min(naturalWidth, naturalHeight);
const sourceX = (naturalWidth - sourceSize) / 2;
const sourceY = (naturalHeight - sourceSize) / 2;
const imageCanvas = document.createElement("canvas");
const imageContext = imageCanvas.getContext("2d");
if (!imageContext) {
throw new Error("The image could not be prepared.");
}
let fallbackDataUrl = "";
for (const outputSize of outputSizes) {
imageCanvas.width = outputSize;
imageCanvas.height = outputSize;
imageContext.clearRect(0, 0, outputSize, outputSize);
imageContext.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
for (const [format, qualities] of outputFormats) {
for (const quality of qualities) {
const candidate = imageCanvas.toDataURL(format, quality);
if (!fallbackDataUrl || candidate.length < fallbackDataUrl.length) {
fallbackDataUrl = candidate;
}
if (candidate.length <= maxProfileImageUploadDataUrlLength) {
resolve(candidate);
return;
}
}
}
}
if (fallbackDataUrl.length <= maxProfileImageUploadDataUrlLength) {
resolve(fallbackDataUrl);
return;
}
throw new Error("Profile image is still too large. Choose a simpler image under 1 MB.");
} catch (error) {
reject(error);
} finally {
URL.revokeObjectURL(objectUrl);
}
};
image.onerror = () => {
URL.revokeObjectURL(objectUrl);
reject(new Error("The image could not be read."));
};
image.src = objectUrl;
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
function buildUserCredentialMessage(user, temporaryPassword = "") {
return buildPlatformUserCredentialMessage(user, temporaryPassword);
}
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
function buildTemporaryLoginMessage(user, temporaryPassword, copied = false) {
return buildPlatformTemporaryLoginMessage(user, temporaryPassword, copied);
}
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
function renderStaffWorkspace(message = "") {
if (!ui.staffWorkspace) {
return;
}
const user = getCurrentPlatformUser();
const structure = syncPlatformStructureWithUsers(getPlatformUsers());
const users = getScopedPlatformUsers(getPlatformUsers(), user, structure);
const isAdmin = isCurrentPlatformUserAdmin();
const selectedUser =
users.find((staffUser) => staffUser.id === selectedStaffUserId) ??
users.find((staffUser) => staffUser.id === user?.id) ??
users[0] ??
null;
selectedStaffUserId = selectedUser?.id ?? null;
const roleOptions = renderAdminRoleOptions(user, getAssignableRolesForUser(user).includes("coach") ? "coach" : getAssignableRolesForUser(user)[0]);
const teamOptions = renderAdminTeamOptions(user, structure, getUserTeamId(user, structure));
ui.staffWorkspace.innerHTML = staffWorkspaceRenderer.renderWorkspace({
currentUser: user,
users,
structure,
selectedUser,
selectedUserId: selectedStaffUserId,
isAdmin,
createUserEditorOpen: staffCreateUserEditorOpen,
roleOptions,
teamOptions,
message,
});
}
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
function getMedicalStatusOption(statusKey) {
return medicalOptionSelectors.getMedicalStatusOption(statusKey);
}
function getMedicalStatusActivityType(dateValue, rtpPhase = "") {
return medicalOptionSelectors.getMedicalStatusActivityType(dateValue, rtpPhase);
}
function getMedicalStatusOptionForActivity(statusKey, activityType = "training") {
return medicalOptionSelectors.getMedicalStatusOptionForActivity(statusKey, activityType);
}
function getMedicalStatusOptionForDate(statusKey, dateValue = medicalState?.selectedDate, rtpPhase = "") {
return medicalOptionSelectors.getMedicalStatusOptionForDate(statusKey, dateValue, rtpPhase);
}
function getMedicalRtpPhaseOption(phaseKey) {
return medicalOptionSelectors.getMedicalRtpPhaseOption(phaseKey);
}
function getMedicalGateOption(value) {
return medicalOptionSelectors.getMedicalGateOption(value);
}
function getMedicalStatusForParticipation(participation) {
return medicalOptionSelectors.getMedicalStatusForParticipation(participation);
}
const medicalSquadAvailabilityBlockStatusKeys = new Set(
[
...playerProfileStatusOptions.map((option) => option.key),
"unknown",
].filter((status) => status && status !== "available")
);
function normalizeMedicalPlayerAvailabilityStatus(value, fallback = "available") {
const status = String(value ?? "").trim().toLowerCase();
return playerProfileStatusOptions.some((option) => option.key === status) || status === "unknown" ? status : fallback;
}
function getMedicalLinkedPlayerProfile(player = {}) {
const profileState = playerProfilesState || readPlayerProfilesState();
const profiles = Array.isArray(profileState?.players) ? profileState.players : [];
if (!profiles.length) {
return null;
}
const playerIds = new Set(
[player.id, player.playerId, player.profileId, player.medicalPlayerId]
.map((value) => String(value ?? "").trim())
.filter(Boolean)
);
if (playerIds.size) {
const profile = profiles.find((candidate) => playerIds.has(String(candidate?.id ?? "").trim()));
if (profile) {
return profile;
}
}
const targetName = normalizePlayerProfileName(player.name || player.displayName || "");
const targetNumber = String(player.number || player.shirtNumber || player.shirt_number || "").trim().toLowerCase();
if (!targetName) {
return null;
}
if (targetNumber) {
const profile = profiles.find((candidate) => {
const candidateName = normalizePlayerProfileName(candidate?.name || candidate?.displayName || "");
const candidateNumber = String(candidate?.number || candidate?.shirtNumber || candidate?.shirt_number || "").trim().toLowerCase();
return candidateName === targetName && candidateNumber === targetNumber;
});
if (profile) {
return profile;
}
}
const nameMatches = profiles.filter((candidate) => normalizePlayerProfileName(candidate?.name || candidate?.displayName || "") === targetName);
return nameMatches.length === 1 ? nameMatches[0] : null;
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
function getMedicalPlayerAvailabilityStatus(player = {}) {
const profile = getMedicalLinkedPlayerProfile(player);
const profileStatus = normalizeMedicalPlayerAvailabilityStatus(
profile?.status || profile?.availabilityStatus || profile?.availability_status,
""
);
if (profileStatus && medicalSquadAvailabilityBlockStatusKeys.has(profileStatus)) {
return profileStatus;
}
return normalizeMedicalPlayerAvailabilityStatus(
player.status || player.availabilityStatus || player.availability_status,
profileStatus || "available"
);
}
function getMedicalPlayerAvailabilityStatusOption(player = {}) {
const statusKey = getMedicalPlayerAvailabilityStatus(player);
return (
playerProfileStatusOptions.find((option) => option.key === statusKey) || {
key: statusKey,
label: statusKey ? statusKey.replace(/-/g, " ") : "Available",
tone: "unavailable",
}
);
}
function isMedicalPlayerBlockedBySquadAvailability(player = {}) {
return medicalSquadAvailabilityBlockStatusKeys.has(getMedicalPlayerAvailabilityStatus(player));
}
function getMedicalPlayerSquadAvailabilityBlockReason(player = {}) {
if (!isMedicalPlayerBlockedBySquadAvailability(player)) {
return "";
}
const option = getMedicalPlayerAvailabilityStatusOption(player);
return `${player.name || "Player"} is marked ${option.label} in Squad Room and should not receive a team-activity recommendation.`;
}
function getMedicalRtpPhaseForRecommendation(statusKey, participation, activityType = "training") {
return medicalOptionSelectors.getMedicalRtpPhaseForRecommendation(statusKey, participation, activityType);
}
function normalizeMedicalParticipation(value, fallback = 100) {
return medicalOptionSelectors.normalizeMedicalParticipation(value, fallback);
}
function normalizeMedicalActualParticipation(value) {
return medicalOptionSelectors.normalizeMedicalActualParticipation(value);
}
function normalizeMedicalPositionText(value) {
return String(value ?? "")
.trim()
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/[^a-z0-9]+/g, " ")
.trim();
}
function getMedicalCanonicalPositionFromText(value) {
const normalizedText = normalizeMedicalPositionText(value);
if (!normalizedText) {
return "";
}
const compactText = normalizedText.replace(/\s+/g, "");
const parts = normalizedText.split(/\s+/).filter(Boolean);
return (
Object.entries(medicalPositionAliases).find(([, aliases]) =>
aliases.some((alias) => compactText === alias || parts.includes(alias) || (alias.length >= 4 && compactText.includes(alias)))
)?.[0] || ""
);
}
function normalizeMedicalPlayerPosition(value, player = {}) {
const fields = [
value,
player.position,
player.roleGroup,
player.primaryRole,
player.role,
player.squadRole,
...(Array.isArray(player.secondaryRoles) ? player.secondaryRoles : []),
];
for (const field of fields) {
const position = getMedicalCanonicalPositionFromText(field);
if (position) {
return position;
}
}
return "Midfielder";
}
function normalizeMedicalPlayer(player = {}) {
const name = String(player.name ?? "").trim();
if (!name) {
return null;
}
const rosterOrder = Number(player.rosterOrder);
const rosterType = normalizePlayerProfileRosterType(player.rosterType || player.playerType || player.squadType);
const position = normalizeMedicalPlayerPosition(player.position, player);
return {
id: player.id || createDashboardId("medical-player"),
name,
number: String(player.number ?? "").trim(),
position,
photoUrl: String(player.photoUrl ?? "").trim(),
sourceUrl: String(player.sourceUrl ?? "").trim(),
status: normalizeMedicalPlayerAvailabilityStatus(player.status || player.availabilityStatus || player.availability_status),
rosterType,
countsInSquad: typeof player.countsInSquad === "boolean"
? player.countsInSquad
: playerProfileRosterTypeCountsInSquad(rosterType),
temporaryGroup: String(player.temporaryGroup ?? player.subGroup ?? player.trainingGroup ?? "").trim(),
temporaryFrom: normalizePlayerProfileTemporaryDate(player.temporaryFrom || player.startDate),
temporaryTo: normalizePlayerProfileTemporaryDate(player.temporaryTo || player.endDate),
primaryRole: normalizePlayerProfileRole(player.primaryRole, ""),
secondaryRoles: normalizePlayerProfileRoleList(player.secondaryRoles),
roleGroup: String(player.roleGroup ?? "").trim(),
rosterOrder: Number.isFinite(rosterOrder) ? rosterOrder : null,
createdAt: player.createdAt || new Date().toISOString(),
updatedAt: player.updatedAt || new Date().toISOString(),
archivedAt: normalizeMedicalTimestamp(player.archivedAt || player.deletedAt),
archivedBy: String(player.archivedBy ?? player.deletedBy ?? "").trim(),
archiveReason: String(player.archiveReason ?? player.deleteReason ?? "").trim().slice(0, 160),
};
}
function normalizeMedicalShareValue(value) {
return value === true || value === "true" || value === "on" || value === "1";
}
function normalizeMedicalTimestamp(value) {
const cleanValue = String(value ?? "").trim().slice(0, 40);
return Number.isFinite(Date.parse(cleanValue)) ? cleanValue : "";
}
function getMedicalTimestampMs(value, fallback = 0) {
const cleanValue = normalizeMedicalTimestamp(value);
if (!cleanValue) {
return fallback;
}
const timestamp = Date.parse(cleanValue);
return Number.isFinite(timestamp) ? timestamp : fallback;
}
function getMedicalEntityUpdatedMs(entity = {}) {
return Math.max(getMedicalTimestampMs(entity.updatedAt), getMedicalTimestampMs(entity.createdAt));
}
function isMedicalItemArchived(item = {}) {
return Boolean(normalizeMedicalTimestamp(item.archivedAt || item.deletedAt));
}
function getCurrentMedicalActorId() {
const user = getCurrentPlatformUser();
return String(user?.id || user?.username || user?.email || "").trim();
}
function getMedicalDataSafetyCounts(source = {}) {
const players = Array.isArray(source.players) ? source.players : [];
const records = Array.isArray(source.records) ? source.records : [];
const injuryPlans = Array.isArray(source.injuryPlans) ? source.injuryPlans : [];
return {
archivedPlayers: players.filter(isMedicalItemArchived).length,
archivedRecords: records.filter(isMedicalItemArchived).length,
archivedPlans: injuryPlans.filter(isMedicalItemArchived).length,
};
}
function normalizeMedicalDataSafety(dataSafety = {}, source = {}) {
const counts = getMedicalDataSafetyCounts(source);
const syncStatus = String(dataSafety.lastDatabaseSyncStatus ?? "idle").trim().toLowerCase();
return {
schema: "footballscience-medical-data-safety-v1",
lastClinicalChangeAt: normalizeMedicalTimestamp(dataSafety.lastClinicalChangeAt),
lastClinicalChangeBy: String(dataSafety.lastClinicalChangeBy ?? "").trim().slice(0, 160),
lastClinicalChangeType: String(dataSafety.lastClinicalChangeType ?? "").trim().slice(0, 80),
lastClinicalChangeSummary: String(dataSafety.lastClinicalChangeSummary ?? "").trim().slice(0, 220),
lastDatabaseSyncAt: normalizeMedicalTimestamp(dataSafety.lastDatabaseSyncAt),
lastDatabaseSyncStatus: medicalDataSafetySyncStatusOptions.has(syncStatus) ? syncStatus : "idle",
lastDatabaseSyncEvent: String(dataSafety.lastDatabaseSyncEvent ?? "").trim().slice(0, 80),
lastPayloadHash: String(dataSafety.lastPayloadHash ?? "").trim().slice(0, 80),
archivedRecordCount: counts.archivedRecords,
archivedPlanCount: counts.archivedPlans,
archivedPlayerCount: counts.archivedPlayers,
};
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
function normalizeMedicalClearance(clearance = {}) {
return medicalClearanceRoles.reduce((result, role) => {
const value = clearance?.[role.key];
result[role.key] = value === true || value === "true" || value === "on" || value === "1";
return result;
}, {});
}
function normalizeMedicalLoadGates(gates = {}) {
return medicalLoadGateOptions.reduce((result, gate) => {
const value = gates?.[gate.key];
result[gate.key] = medicalGateOptions.some((option) => option.key === value) ? value : "pending";
return result;
}, {});
}
function getMedicalClearanceValues(values = {}) {
return medicalClearanceRoles.reduce((result, role) => {
result[role.key] = values[`clearance.${role.key}`];
return result;
}, {});
}
function getMedicalLoadGateValues(values = {}) {
return medicalLoadGateOptions.reduce((result, gate) => {
result[gate.key] = values[`gates.${gate.key}`];
return result;
}, {});
}
function normalizeMedicalRecord(record = {}) {
const playerId = String(record.playerId ?? "").trim();
const date = isMedicalDateValue(record.date) ? record.date : formatScheduleDateValue(new Date());
if (!playerId) {
return null;
}
const participation = normalizeMedicalParticipation(record.participation);
const statusKey = medicalStatusOptions.some((status) => status.key === record.status)
? record.status
: getMedicalStatusForParticipation(participation);
const createdAt = normalizeMedicalTimestamp(record.createdAt) || new Date().toISOString();
const archivedAt = normalizeMedicalTimestamp(record.archivedAt || record.deletedAt);
return {
id: record.id || createDashboardId("medical-record"),
playerId,
date,
status: statusKey,
participation,
actualParticipation: normalizeMedicalActualParticipation(record.actualParticipation),
comment: String(record.comment ?? "").trim(),
coachNote: String(record.coachNote ?? "").trim(),
shareWithCoach: normalizeMedicalShareValue(record.shareWithCoach),
rtpPhase: medicalRtpPhaseOptions.some((phase) => phase.key === record.rtpPhase)
? record.rtpPhase
: getMedicalRtpPhaseForRecommendation(
statusKey,
participation,
getMedicalRecommendationActivityContext(date).type
),
createdAt,
updatedAt: normalizeMedicalTimestamp(record.updatedAt) || archivedAt || createdAt,
createdBy: record.createdBy || getCurrentPlatformUser()?.id || "",
archivedAt,
archivedBy: String(record.archivedBy ?? record.deletedBy ?? "").trim(),
archiveReason: String(record.archiveReason ?? record.deleteReason ?? "").trim().slice(0, 160),
};
}
function addMedicalCalendarMonths(date, months) {
const nextDate = new Date(date);
const originalDay = nextDate.getDate();
nextDate.setMonth(nextDate.getMonth() + months);
if (nextDate.getDate() !== originalDay) {
nextDate.setDate(0);
}
return nextDate;
}
function getMedicalPlanEndDate(startDateValue, duration, durationUnit) {
const cleanDuration = Math.max(1, Number(duration) || 1);
const startDate = parseScheduleDateValue(startDateValue);
if (durationUnit === "months") {
return formatScheduleDateValue(addCalendarDays(addMedicalCalendarMonths(startDate, cleanDuration), -1));
}
if (durationUnit === "days") {
return formatScheduleDateValue(addCalendarDays(startDate, cleanDuration - 1));
}
return formatScheduleDateValue(addCalendarDays(startDate, cleanDuration * 7 - 1));
}
function normalizeMedicalInjuryPlan(plan = {}) {
const playerId = String(plan.playerId ?? "").trim();
const startDate = isMedicalDateValue(plan.startDate) ? plan.startDate : formatScheduleDateValue(new Date());
const duration = Math.max(1, Number(plan.duration) || 1);
const durationUnit = ["days", "weeks", "months"].includes(plan.durationUnit) ? plan.durationUnit : "weeks";
const endDate = isMedicalDateValue(plan.endDate)
? plan.endDate
: getMedicalPlanEndDate(startDate, duration, durationUnit);
if (!playerId || endDate < startDate) {
return null;
}
const initialParticipation = normalizeMedicalParticipation(plan.participation, 0);
const fallbackPhaseKey = getMedicalRtpPhaseForRecommendation(plan.status, initialParticipation);
const phaseOption = medicalRtpPhaseOptions.some((phase) => phase.key === plan.rtpPhase)
? getMedicalRtpPhaseOption(plan.rtpPhase)
: getMedicalRtpPhaseOption(fallbackPhaseKey);
const participation = normalizeMedicalParticipation(plan.participation, phaseOption.participation);
const status = medicalInjuryPlanStatusOptions.some((option) => option.key === plan.status)
? plan.status
: phaseOption.status;
const createdAt = normalizeMedicalTimestamp(plan.createdAt) || new Date().toISOString();
const archivedAt = normalizeMedicalTimestamp(plan.archivedAt || plan.deletedAt);
return {
id: plan.id || createDashboardId("medical-injury-plan"),
playerId,
injuryType: String(plan.injuryType ?? "").trim() || "Injury",
bodyArea: String(plan.bodyArea ?? "").trim(),
startDate,
endDate,
duration,
durationUnit,
status,
participation,
reviewDate: isMedicalDateValue(plan.reviewDate) ? plan.reviewDate : "",
rtpPhase: phaseOption.key,
phase: String(plan.phase ?? "").trim() || phaseOption.label,
clearance: normalizeMedicalClearance(plan.clearance),
gates: normalizeMedicalLoadGates(plan.gates),
coachNote: String(plan.coachNote ?? "").trim(),
shareWithCoach: normalizeMedicalShareValue(plan.shareWithCoach),
comment: String(plan.comment ?? "").trim(),
createdAt,
updatedAt: normalizeMedicalTimestamp(plan.updatedAt) || archivedAt || createdAt,
createdBy: plan.createdBy || getCurrentPlatformUser()?.id || "",
archivedAt,
archivedBy: String(plan.archivedBy ?? plan.deletedBy ?? "").trim(),
archiveReason: String(plan.archiveReason ?? plan.deleteReason ?? "").trim().slice(0, 160),
};
}
function createDefaultMedicalGovernancePolicy() {
return {
schema: "football-medical-governance-v1",
dataLevel: "private-medical",
coachShareBoundary: "availability-approved-note",
consentRequired: true,
retentionMonths: 24,
reviewCadenceDays: 30,
policyOwner: "Medical Lead",
incidentContact: "Admin",
lastReviewed: "",
updatedAt: "",
updatedBy: "",
};
}
function normalizeMedicalGovernancePolicy(policy = {}) {
const defaults = createDefaultMedicalGovernancePolicy();
const retentionMonths = clamp(Number(policy.retentionMonths) || defaults.retentionMonths, 1, 120);
const reviewCadenceDays = clamp(Number(policy.reviewCadenceDays) || defaults.reviewCadenceDays, 1, 90);
return {
...defaults,
dataLevel: "private-medical",
coachShareBoundary: "availability-approved-note",
consentRequired: normalizeMedicalShareValue(policy.consentRequired ?? defaults.consentRequired),
retentionMonths: Math.round(retentionMonths),
reviewCadenceDays: Math.round(reviewCadenceDays),
policyOwner: String(policy.policyOwner ?? defaults.policyOwner).trim().slice(0, 80) || defaults.policyOwner,
incidentContact: String(policy.incidentContact ?? defaults.incidentContact).trim().slice(0, 120) || defaults.incidentContact,
lastReviewed: isMedicalDateValue(policy.lastReviewed) ? policy.lastReviewed : "",
updatedAt: String(policy.updatedAt ?? "").trim(),
updatedBy: String(policy.updatedBy ?? "").trim(),
};
}
function sanitizeMedicalGovernancePolicyForCoachView() {
const defaults = createDefaultMedicalGovernancePolicy();
return {
schema: defaults.schema,
dataLevel: "coach-safe",
coachShareBoundary: defaults.coachShareBoundary,
consentRequired: true,
retentionMonths: 0,
reviewCadenceDays: 0,
policyOwner: "",
incidentContact: "",
lastReviewed: "",
updatedAt: "",
updatedBy: "",
};
}
function getMedicalPlayerNumberRank(player) {
const value = String(player?.number ?? "").trim();
if (!/^\d+$/.test(value)) {
return null;
}
const numericValue = Number(value);
return Number.isFinite(numericValue) ? numericValue : null;
}
function getMedicalPlayerRosterOrder(player) {
const rosterOrder = Number(player?.rosterOrder);
return Number.isFinite(rosterOrder) ? rosterOrder : null;
}
function getMedicalPlayerPositionRank(player) {
return medicalPositionOrder[normalizeMedicalPlayerPosition(player?.position, player)] ?? 99;
}
function compareMedicalPlayers(first, second) {
const firstNumber = getMedicalPlayerNumberRank(first);
const secondNumber = getMedicalPlayerNumberRank(second);
if (firstNumber !== null && secondNumber !== null && firstNumber !== secondNumber) {
return firstNumber - secondNumber;
}
if (firstNumber !== null || secondNumber !== null) {
return firstNumber !== null ? -1 : 1;
}
const firstOrder = getMedicalPlayerRosterOrder(first);
const secondOrder = getMedicalPlayerRosterOrder(second);
if (firstOrder !== null && secondOrder !== null && firstOrder !== secondOrder) {
return firstOrder - secondOrder;
}
if (firstOrder !== null || secondOrder !== null) {
return firstOrder !== null ? -1 : 1;
}
const positionComparison = getMedicalPlayerPositionRank(first) - getMedicalPlayerPositionRank(second);
if (positionComparison !== 0) {
return positionComparison;
}
return first.name.localeCompare(second.name);
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
function canViewPrivateMedicalDetails() {
return canEditMedicalTeam();
}
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
function getPlayerProfileOption(options, key, fallback = null) {
return options.find((option) => option.key === key) ?? fallback ?? options[0];
}
function getPlayerProfileRosterTypeOption(value) {
return getPlayerProfileOption(playerProfileRosterTypeOptions, normalizePlayerProfileRosterType(value), playerProfileRosterTypeOptions[0]);
}
function normalizePlayerProfileRosterTypeKey(value) {
const cleanValue = String(value ?? "").trim().toLowerCase();
if (!cleanValue) {
return "";
}
const dashedValue = cleanValue.replace(/[_\s/]+/g, "-").replace(/-+/g, "-");
const compactValue = cleanValue.replace(/[\s/_-]+/g, "");
return (
playerProfileRosterTypeAliases[cleanValue] ||
playerProfileRosterTypeAliases[dashedValue] ||
playerProfileRosterTypeAliases[compactValue] ||
cleanValue
);
}
function normalizePlayerProfileRosterType(value, fallback = "squad") {
const rosterType = normalizePlayerProfileRosterTypeKey(value);
return playerProfileRosterTypeOptions.some((option) => option.key === rosterType) ? rosterType : fallback;
}
function playerProfileRosterTypeCountsInSquad(value) {
return getPlayerProfileRosterTypeOption(value).countsInSquad !== false;
}
function normalizePlayerProfileTemporaryDate(value) {
const cleanValue = String(value ?? "").trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
return "";
}
const parsedDate = new Date(`${cleanValue}T00:00:00`);
if (Number.isNaN(parsedDate.getTime())) {
return "";
}
return cleanValue;
}
function normalizePlayerProfileBirthDate(value) {
return normalizePlayerProfileTemporaryDate(value);
}
function normalizePlayerProfileAgeValue(value) {
const cleanValue = String(value ?? "").trim();
if (!cleanValue) {
return "";
}
const numericValue = Number(cleanValue);
if (!Number.isFinite(numericValue)) {
return "";
}
const age = Math.floor(numericValue);
return age >= 0 && age <= 99 ? String(age) : "";
}
function getPlayerProfileAgeValue(player = {}, referenceDate = new Date()) {
const birthDate = normalizePlayerProfileBirthDate(player.birthDate || player.dateOfBirth || player.date_of_birth || player.dob);
if (birthDate) {
const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
if (Number.isFinite(birthYear) && Number.isFinite(birthMonth) && Number.isFinite(birthDay)) {
let age = referenceDate.getFullYear() - birthYear;
const monthDiff = referenceDate.getMonth() + 1 - birthMonth;
if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDay)) {
age -= 1;
}
if (age >= 0 && age <= 99) {
return String(age);
}
}
}
return normalizePlayerProfileAgeValue(player.age ?? player.playerAge);
}
function normalizePlayerProfileAgeLookupText(value = "") {
return String(value || "")
.normalize("NFKD")
.replace(/[\u0300-\u036f]/g, "")
.toLowerCase()
.replace(/[^a-z0-9]+/g, " ")
.replace(/\s+/g, " ")
.trim();
}
function getPlayerProfileAgeLookupSignature(player = {}) {
return [
normalizePlayerProfileAgeLookupText(player.id),
normalizePlayerProfileAgeLookupText(player.name),
normalizePlayerProfileAgeLookupText(player.number),
normalizePlayerProfileAgeLookupText(player.position),
].join("|");
}
function getPlayerProfileAgeCacheKey(player = {}) {
const playerId = String(player.id || "").trim();
if (playerId) {
return playerId;
}
return getPlayerProfileAgeLookupSignature(player);
}
function normalizePlayerProfileAgeCacheEntry(entry = {}) {
const signature = String(entry.signature || "").trim();
return {
signature,
birthDate: normalizePlayerProfileBirthDate(entry.birthDate || entry.dateOfBirth || entry.date_of_birth),
age: normalizePlayerProfileAgeValue(entry.age),
databasePlayerId: String(entry.databasePlayerId || entry.playerId || "").trim(),
source: String(entry.source || "squad_players").trim(),
checkedAt: String(entry.checkedAt || "").trim(),
birthDateCheckedAt: String(entry.birthDateCheckedAt || "").trim(),
};
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
function getPlayerProfileDisplayAgeValue(player = {}, referenceDate = new Date()) {
const directBirthDate = getPlayerProfileBirthDateValue(player);
if (directBirthDate) {
return getPlayerProfileAgeValue({ birthDate: directBirthDate }, referenceDate);
}
const cachedAge = getPlayerProfileAgeCacheEntry(player);
const cachedBirthDate = normalizePlayerProfileBirthDate(cachedAge?.birthDate);
if (cachedBirthDate) {
return getPlayerProfileAgeValue({ birthDate: cachedBirthDate }, referenceDate);
}
const directAge = normalizePlayerProfileAgeValue(player.age ?? player.playerAge);
if (directAge) {
return directAge;
}
return cachedAge ? getPlayerProfileAgeValue({ age: cachedAge.age }, referenceDate) : "";
}
function getPlayerProfileBirthDateValue(player = {}) {
return normalizePlayerProfileBirthDate(player.birthDate || player.dateOfBirth || player.date_of_birth || player.dob);
}
function getPlayerProfileDisplayBirthDateValue(player = {}) {
const directBirthDate = getPlayerProfileBirthDateValue(player);
if (directBirthDate) {
return directBirthDate;
}
const cachedEntry = getPlayerProfileAgeCacheEntry(player);
return cachedEntry?.birthDate || "";
}
function isPlayerProfileTemporaryActiveOnDate(player = {}, dateValue = "") {
if (!isTemporaryPlayerProfile(player)) {
return true;
}
const activeDate = normalizePlayerProfileTemporaryDate(dateValue);
if (!activeDate) {
return true;
}
const fromDate = normalizePlayerProfileTemporaryDate(player.temporaryFrom);
const toDate = normalizePlayerProfileTemporaryDate(player.temporaryTo);
if (fromDate && activeDate < fromDate) {
return false;
}
if (toDate && activeDate > toDate) {
return false;
}
return true;
}
function getPlayerProfileTemporaryWindowLabel(player = {}) {
const fromDate = normalizePlayerProfileTemporaryDate(player.temporaryFrom);
const toDate = normalizePlayerProfileTemporaryDate(player.temporaryTo);
if (fromDate && toDate) {
return `${fromDate} to ${toDate}`;
}
if (fromDate) {
return `from ${fromDate}`;
}
if (toDate) {
return `until ${toDate}`;
}
return "";
}
function playerProfileCountsInSquad(player = {}) {
if (typeof player.countsInSquad === "boolean") {
return player.countsInSquad;
}
return playerProfileRosterTypeCountsInSquad(player.rosterType);
}
function isTemporaryPlayerProfile(player = {}) {
return !playerProfileCountsInSquad(player);
}
function getPlayerProfileRosterLabel(player = {}) {
const option = getPlayerProfileRosterTypeOption(player.rosterType);
const group = String(player.temporaryGroup ?? "").trim();
return group ? `${option.shortLabel || option.label} / ${group}` : option.label;
}
function normalizePlayerProfileTab(tabKey) {
return playerProfileTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "overview";
}
function normalizePlayerProfileRole(value, fallback = "CB") {
const cleanValue = String(value ?? "").trim().toUpperCase();
return playerProfileRoleOptions.includes(cleanValue) ? cleanValue : fallback;
}
function normalizePlayerProfileRoleList(value = []) {
const source = Array.isArray(value)
? value
: String(value ?? "")
.split(",")
.map((entry) => entry.trim());
return Array.from(new Set(source.map((entry) => normalizePlayerProfileRole(entry, "")).filter(Boolean)));
}
function getDefaultPlayerProfileRole(player = {}) {
const position = String(player.position ?? "").toLowerCase();
if (position.includes("goal")) {
return "GK";
}
if (position.includes("def")) {
return "CB";
}
if (position.includes("mid")) {
return "8";
}
if (position.includes("for")) {
return "ST";
}
return "CB";
}
function getPlayerProfileRoleGroupForRole(role, position = "") {
const roleKey = normalizePlayerProfileRole(role, getDefaultPlayerProfileRole({ position }));
if (roleKey === "GK") {
return "goalkeeper";
}
if (["LB", "CB", "RB", "LWB", "RWB"].includes(roleKey)) {
return "defender";
}
if (["6", "8", "10"].includes(roleKey)) {
return "midfielder";
}
return "forward";
}
function normalizePlayerProfileName(value = "") {
return String(value)
.trim()
.replace(/\s+/g, " ")
.toLowerCase();
}
function getPlayerProfileSyncIdentityKeys(player = {}) {
const keys = [];
const playerId = String(player.id || player.playerId || player.profileId || "").trim();
if (playerId) {
keys.push(`id:${playerId}`);
}
const name = normalizePlayerProfileName(player.name || player.displayName || "");
if (name) {
const number = String(player.number || player.shirtNumber || player.shirt_number || "").trim().toLowerCase();
keys.push(`name:${name}|${number}`);
}
return keys;
}
function getTemporaryRosterTypeFromPlayerSource(player = {}) {
const rosterType = normalizePlayerProfileRosterType(player.rosterType || player.playerType || player.squadType, "");
if (rosterType && !playerProfileRosterTypeCountsInSquad(rosterType)) {
return rosterType;
}
const searchText = [
player.rosterType,
player.playerType,
player.squadType,
player.temporaryGroup,
player.subGroup,
player.trainingGroup,
player.status,
].join(" ").toLowerCase();
if (searchText.includes("academy")) {
return "academy";
}
if (searchText.includes("trial")) {
return "trialist";
}
if (searchText.includes("loan") || searchText.includes("external")) {
return "loan";
}
return "guest";
}
function getPlayerProfileDuplicateCandidates(candidate = {}, players = [], options = {}) {
const ignorePlayerId = String(options.ignorePlayerId || "");
const normalizedName = normalizePlayerProfileName(candidate?.name || "");
const normalizedNumber = String(candidate?.number || "").trim();
const normalizedPosition = normalizePlayerProfileName(candidate?.position || "");
if (!normalizedName) {
return [];
}
const exactMatches = [];
const probableMatches = [];
players.forEach((player) => {
if (!player || player.id === ignorePlayerId) {
return;
}
if (normalizePlayerProfileName(player.name) !== normalizedName) {
return;
}
const existingNumber = String(player.number || "").trim();
const existingPosition = normalizePlayerProfileName(player.position || "");
if (normalizedNumber && existingNumber && existingNumber === normalizedNumber) {
exactMatches.push({ player, match: "same name and number" });
return;
}
if (!existingNumber || !normalizedNumber) {
if (!normalizedPosition || !existingPosition || normalizedPosition === existingPosition) {
probableMatches.push({ player, match: "same name" });
}
return;
}
if (existingNumber !== normalizedNumber) {
probableMatches.push({ player, match: "same name" });
}
});
if (exactMatches.length) {
return exactMatches;
}
if (probableMatches.length > 3) {
return probableMatches.slice(0, 3);
}
return probableMatches;
}
function validatePlayerProfileFormValues(values = {}, options = {}) {
const errors = [];
const warnings = [];
const existingPlayers = Array.isArray(options.existingPlayers) ? options.existingPlayers : [];
const blockDuplicate = options.blockDuplicate !== false;
const player = normalizePlayerProfile(values);
if (!player) {
return {
ok: false,
status: "error",
errors: ["Player name is required."],
warnings: [],
player: null,
duplicates: [],
};
}
const requestedFrom = String(values.temporaryFrom || "").trim();
const requestedTo = String(values.temporaryTo || "").trim();
const requestedReviewDate = String(values.idp?.reviewDate || "").trim();
const temporaryFrom = normalizePlayerProfileTemporaryDate(requestedFrom || player.temporaryFrom);
const temporaryTo = normalizePlayerProfileTemporaryDate(requestedTo || player.temporaryTo);
if (requestedFrom && !temporaryFrom) {
errors.push("Temporary from must be YYYY-MM-DD when provided.");
}
if (requestedTo && !temporaryTo) {
errors.push("Temporary to must be YYYY-MM-DD when provided.");
}
if (temporaryFrom && temporaryTo && temporaryFrom > temporaryTo) {
errors.push("Temporary from must not be after temporary to.");
}
if (!requestedReviewDate) {
} else if (!isMedicalDateValue(requestedReviewDate)) {
errors.push("IDP review date must be YYYY-MM-DD when entered.");
}
if (!player.position) {
warnings.push("Position is recommended for better role quality and matching.");
}
if (!player.primaryRole) {
warnings.push("Primary role is required.");
}
if (!player.preferredSide) {
warnings.push("Preferred side is recommended.");
}
const duplicates = getPlayerProfileDuplicateCandidates(player, existingPlayers, {
ignorePlayerId: options.ignorePlayerId || player.id,
});
if (blockDuplicate && duplicates.length) {
const duplicate = duplicates[0];
const existingName = String(duplicate.player?.name || player.name || "").trim();
errors.push(`A player already exists with ${player.name}: ${duplicate.match} (${existingName}).`);
}
if (!errors.length && warnings.length) {
return {
ok: true,
status: "warning",
errors,
warnings,
player,
duplicates,
};
}
return {
ok: !errors.length,
status: errors.length ? "error" : "success",
errors,
warnings,
player,
duplicates,
};
}
function buildPlayerProfileImportFeedback(result = {}) {
return buildPlayerProfileImportFeedbackMessage(result, { undoState: getPlayerProfileImportUndoState() });
}
function renderPlayerProfilesWorkspaceMessage(message) {
return squadWorkspaceRenderer.renderMessage(message);
}
function normalizePlayerProfileFutureData(futureData = {}) {
return {
matchData: Array.isArray(futureData.matchData) ? futureData.matchData : [],
load: Array.isArray(futureData.load) ? futureData.load : [],
minutes: Array.isArray(futureData.minutes) ? futureData.minutes : [],
performanceNotes: String(futureData.performanceNotes ?? "").trim(),
scoutingNotes: String(futureData.scoutingNotes ?? "").trim(),
analysisNotes: String(futureData.analysisNotes ?? "").trim(),
};
}
function normalizePlayerProfileMedicalSummary(summary = {}) {
return {
currentAvailability: String(summary.currentAvailability ?? "").trim(),
rtpStatus: String(summary.rtpStatus ?? "").trim(),
coachNote: String(summary.coachNote ?? "").trim(),
latestLogDate: String(summary.latestLogDate ?? "").trim(),
latestLogSummary: String(summary.latestLogSummary ?? "").trim(),
returnDate: String(summary.returnDate ?? "").trim(),
returnDateLabel: String(summary.returnDateLabel ?? "").trim(),
returnLabel: String(summary.returnLabel ?? "").trim(),
activeInjuryLabel: String(summary.activeInjuryLabel ?? "").trim(),
medicalSource: String(summary.medicalSource ?? "").trim(),
};
}
function normalizePlayerProfileNumber(value, fallback = 3) {
const numericValue = Number(value);
if (!Number.isFinite(numericValue)) {
return fallback;
}
return Math.max(1, Math.min(5, Math.round(numericValue)));
}
function normalizePlayerProfileAttributeRatings(ratings = {}) {
return playerProfileAttributeGroups.reduce((result, group) => {
result[group.key] = normalizePlayerProfileNumber(ratings?.[group.key], 3);
return result;
}, {});
}
function getDefaultPlayerProfileAttributeRatings(player = {}) {
const group = getPlayerProfileRoleGroupForRole(player.primaryRole || getDefaultPlayerProfileRole(player), player.position);
const defaults = {
goalkeeper: { technical: 3, tactical: 3, physical: 3, mental: 4 },
defender: { technical: 3, tactical: 4, physical: 3, mental: 3 },
midfielder: { technical: 4, tactical: 4, physical: 3, mental: 4 },
forward: { technical: 4, tactical: 3, physical: 4, mental: 3 },
};
return defaults[group] ?? defaults.defender;
}
function normalizePlayerProfileIdp(idp = {}) {
const status = playerProfileIdpStatusOptions.some((option) => option.key === idp.status)
? idp.status
: "active";
return {
status,
primaryFocus: String(idp.primaryFocus ?? "").trim(),
strengths: String(idp.strengths ?? "").trim(),
focusAreas: String(idp.focusAreas ?? "").trim(),
nextAction: String(idp.nextAction ?? "").trim(),
reviewDate: isMedicalDateValue(idp.reviewDate) ? idp.reviewDate : "",
};
}
function getDefaultPlayerProfileIdp(player = {}) {
const role = normalizePlayerProfileRole(player.primaryRole, getDefaultPlayerProfileRole(player));
const focusByRole = {
GK: "Distribution, claiming space and defensive organisation",
LB: "Wide defending, timing overlaps and final-third delivery",
CB: "Box defending, build-up security and defending large spaces",
RB: "Wide defending, timing overlaps and final-third delivery",
LWB: "High wing-back output, recovery runs and crossing choices",
RWB: "High wing-back output, recovery runs and crossing choices",
6: "Receiving under pressure, screening and progression choices",
8: "Box-to-box timing, counter-pressing and third-player runs",
10: "Between-line receiving, final pass and pressing cues",
LW: "1v1 threat, back-post timing and counter-pressing",
RW: "1v1 threat, back-post timing and counter-pressing",
ST: "Penalty-box movement, pressing triggers and link play",
};
return {
status: "active",
primaryFocus: focusByRole[role] || "Role behaviours and consistency",
strengths: "",
focusAreas: "",
nextAction: "",
reviewDate: "",
};
}
function getDefaultPlayerProfileSquadStatus(player = {}) {
const order = Number(player.rosterOrder);
if (Number.isFinite(order) && order <= 11) {
return "important";
}
if (Number.isFinite(order) && order <= 18) {
return "rotation";
}
return "depth";
}
function getDefaultPlayerProfileCareerPhase(player = {}) {
const order = Number(player.rosterOrder);
if (Number.isFinite(order) && order <= 8) {
return "peak";
}
if (Number.isFinite(order) && order <= 18) {
return "emerging";
}
return "developing";
}
function normalizePlayerProfile(player = {}) {
const name = String(player.name ?? "").trim();
if (!name) {
return null;
}
const primaryRole = normalizePlayerProfileRole(player.primaryRole, getDefaultPlayerProfileRole(player));
const roleGroup = playerProfileRoleGroupOptions.some((option) => option.key === player.roleGroup)
? player.roleGroup
: getPlayerProfileRoleGroupForRole(primaryRole, player.position);
const preferredSide = playerProfilePreferredSideOptions.some((option) => option.key === player.preferredSide)
? player.preferredSide
: roleGroup === "goalkeeper"
? "center"
: "center";
const status = playerProfileStatusOptions.some((option) => option.key === player.status)
? player.status
: "available";
const squadStatus = playerProfileSquadStatusOptions.some((option) => option.key === player.squadStatus)
? player.squadStatus
: getDefaultPlayerProfileSquadStatus(player);
const rosterType = normalizePlayerProfileRosterType(player.rosterType || player.playerType || player.squadType);
const countsInSquad =
typeof player.countsInSquad === "boolean"
? player.countsInSquad
: playerProfileRosterTypeCountsInSquad(rosterType);
const careerPhase = playerProfileCareerPhaseOptions.some((option) => option.key === player.careerPhase)
? player.careerPhase
: getDefaultPlayerProfileCareerPhase(player);
const rosterOrder = Number(player.rosterOrder);
const attributeRatings = normalizePlayerProfileAttributeRatings({
...getDefaultPlayerProfileAttributeRatings({ ...player, primaryRole }),
...(player.attributeRatings || {}),
});
return {
id: player.id || createDashboardId("player-profile"),
name,
number: String(player.number ?? "").trim(),
age: normalizePlayerProfileAgeValue(player.age ?? player.playerAge),
birthDate: normalizePlayerProfileBirthDate(player.birthDate || player.dateOfBirth || player.date_of_birth || player.dob),
position: String(player.position ?? "").trim(),
photoUrl: String(player.photoUrl ?? "").trim(),
sourceUrl: String(player.sourceUrl ?? "").trim(),
coachNotes: String(player.coachNotes ?? "").trim(),
status,
squadStatus,
rosterType,
countsInSquad,
temporaryGroup: String(player.temporaryGroup ?? player.subGroup ?? player.trainingGroup ?? "").trim(),
temporaryFrom: normalizePlayerProfileTemporaryDate(player.temporaryFrom || player.startDate),
temporaryTo: normalizePlayerProfileTemporaryDate(player.temporaryTo || player.endDate),
careerPhase,
primaryRole,
secondaryRoles: normalizePlayerProfileRoleList(player.secondaryRoles).filter((role) => role !== primaryRole),
preferredSide,
roleGroup,
attributeRatings,
idp: normalizePlayerProfileIdp({
...getDefaultPlayerProfileIdp({ ...player, primaryRole }),
...(player.idp || {}),
}),
medicalSummary: normalizePlayerProfileMedicalSummary(player.medicalSummary),
futureData: normalizePlayerProfileFutureData(player.futureData),
rosterOrder: Number.isFinite(rosterOrder) ? rosterOrder : null,
createdAt: player.createdAt || new Date().toISOString(),
updatedAt: player.updatedAt || new Date().toISOString(),
};
}
function normalizePlayerProfileChangeLogEntry(entry = {}) {
const createdAt = Date.parse(entry.createdAt) ? entry.createdAt : new Date().toISOString();
const changes = Array.isArray(entry.changes)
? entry.changes
.filter((change) => change && typeof change === "object")
.map((change) => ({
field: String(change.field ?? "").trim(),
from: String(change.from ?? "").trim(),
to: String(change.to ?? "").trim(),
}))
.filter((change) => change.field || change.from || change.to)
: [];
return {
id: String(entry.id || createDashboardId("squad-change")),
type: String(entry.type || "profile-updated").trim(),
playerId: String(entry.playerId ?? "").trim(),
playerName: String(entry.playerName ?? "").trim(),
actor: String(entry.actor ?? "Football Science").trim(),
summary: String(entry.summary ?? "").trim(),
changes,
createdAt,
};
}
function normalizePlayerProfileChangeLog(entries = []) {
return (Array.isArray(entries) ? entries : [])
.map(normalizePlayerProfileChangeLogEntry)
.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
.slice(0, playerProfileChangeLogLimit);
}
function getNestedPlayerProfileValue(source = {}, path = "") {
return path.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), source);
}
function formatPlayerProfileChangeValue(value, definition = {}) {
if (Array.isArray(value)) {
return value.length ? value.join(" / ") : "-";
}
if (definition.options) {
const option = getPlayerProfileOption(definition.options, value, null);
return option ? option.label : String(value ?? "").trim() || "-";
}
return String(value ?? "").trim() || "-";
}
function getPlayerProfileChangeDiffs(previousPlayer = {}, nextPlayer = {}) {
return playerProfileChangeFieldDefinitions
.map((definition) => {
const previousValue = getNestedPlayerProfileValue(previousPlayer, definition.key);
const nextValue = getNestedPlayerProfileValue(nextPlayer, definition.key);
const formattedPrevious = formatPlayerProfileChangeValue(previousValue, definition);
const formattedNext = formatPlayerProfileChangeValue(nextValue, definition);
return formattedPrevious === formattedNext
? null
: {
field: definition.label,
from: formattedPrevious,
to: formattedNext,
};
})
.filter(Boolean);
}
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
function formatPlayerProfileChangeTime(value) {
const date = new Date(value);
if (Number.isNaN(date.getTime())) {
return "";
}
return new Intl.DateTimeFormat("en-GB", {
day: "2-digit",
month: "short",
hour: "2-digit",
minute: "2-digit",
}).format(date);
}
function comparePlayerProfiles(first, second) {
const groupComparison = getPlayerProfileSquadSortGroup(first) - getPlayerProfileSquadSortGroup(second);
if (groupComparison !== 0) {
return groupComparison;
}
const roleComparison = getPlayerProfileRoleSortIndex(first) - getPlayerProfileRoleSortIndex(second);
if (roleComparison !== 0) {
return roleComparison;
}
return compareMedicalPlayers(first, second);
}
function getPlayerProfileSquadSortGroup(player = {}) {
const group = String(player.roleGroup || "").trim().toLowerCase();
if (group === "goalkeeper") return 0;
if (group === "defender") return 1;
if (group === "midfielder") return 2;
if (group === "forward") return 3;
const position = String(player.position || "").trim().toLowerCase();
if (position.includes("goal")) return 0;
if (position.includes("def") || position.includes("back")) return 1;
if (position.includes("mid")) return 2;
if (position.includes("for") || position.includes("wing") || position.includes("strik")) return 3;
return 9;
}
function getPlayerProfileRoleSortIndex(player = {}) {
const role = normalizePlayerProfileRole(player.primaryRole, "");
const index = playerProfileRoleOptions.indexOf(role);
return index >= 0 ? index : playerProfileRoleOptions.length;
}
function normalizePlayerProfileRemovedIds(value = []) {
const source = Array.isArray(value) ? value : [];
return Array.from(
new Set(source.map((id) => String(id || "").trim()).filter(Boolean))
).slice(0, 1000);
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
function canEditPlayerProfiles() {
return canCurrentUserEditWorkspace("player-profiles");
}
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
function renderPlayerProfileStatusChip(statusKey, medicalSnapshot = null) {
return squadRosterRenderer.renderStatusChip(statusKey, medicalSnapshot);
}
const playerProfileScoutingDatabaseStorageKey = "football-scouting-imported-database-v1";
const playerProfileScoutingRecordIndex = Object.freeze({
id: 0,
player: 1,
team: 2,
league: 4,
season: 5,
position: 6,
minutes: 9,
metrics: 14,
});
let playerProfileScoutingDatabaseLoadPromise = null;
let playerProfileScoutingMetricIndexCache = { database: null, byId: new Map() };
const playerProfileScoutingSpiderTemplates = Object.freeze({
GK: [
{ label: "Exits", metricId: "exits-per-90" },
{ label: "Save rate", metricId: "save-rate" },
{ label: "Prevention", metricId: "prevented-goals-per-90" },
{ label: "Accuracy", metricId: "accurate-passes" },
{ label: "Short game", metricId: "average-pass-length-m", direction: "lower" },
],
CB: [
{ label: "Def actions", metricId: "successful-defensive-actions-per-90" },
{ label: "Aerial", metricId: "aerial-duels-won" },
{ label: "Interceptions", metricId: "padj-interceptions" },
{ label: "Prog pass", metricId: "progressive-passes-per-90" },
{ label: "Short game", metricId: "average-pass-length-m", direction: "lower" },
],
FB: [
{ label: "Prog runs", metricId: "progressive-runs-per-90" },
{ label: "Crossing", metricId: "crosses-per-90" },
{ label: "Def actions", metricId: "successful-defensive-actions-per-90" },
{ label: "Key passes", metricId: "key-passes-per-90" },
{ label: "xA", metricId: "xa-per-90" },
],
MID: [
{ label: "Pass volume", metricId: "passes-per-90" },
{ label: "Prog pass", metricId: "progressive-passes-per-90" },
{ label: "Receives", metricId: "received-passes-per-90" },
{ label: "Def work", metricId: "successful-defensive-actions-per-90" },
{ label: "Creativity", metricId: "smart-passes-per-90" },
{ label: "Short game", metricId: "average-pass-length-m", direction: "lower" },
],
WING: [
{ label: "Prog runs", metricId: "progressive-runs-per-90" },
{ label: "Dribbles", metricId: "dribbles-per-90" },
{ label: "Dribble win", metricId: "successful-dribbles" },
{ label: "Acceleration", metricId: "accelerations-per-90" },
{ label: "Box threat", metricId: "touches-in-box-per-90" },
{ label: "xA", metricId: "xa-per-90" },
],
CF: [
{ label: "Shots", metricId: "shots-per-90" },
{ label: "xG", metricId: "xg-per-90" },
{ label: "Box touches", metricId: "touches-in-box-per-90" },
{ label: "Receives", metricId: "received-passes-per-90" },
{ label: "Key passes", metricId: "key-passes-per-90" },
],
OTHER: [
{ label: "Passing", metricId: "accurate-passes" },
{ label: "Progression", metricId: "progressive-passes-per-90" },
{ label: "Duels", metricId: "duels-won" },
{ label: "Def work", metricId: "successful-defensive-actions-per-90" },
{ label: "Creation", metricId: "xa-per-90" },
],
});
const squadScoutingSpiderRenderer = createSquadScoutingSpiderRenderer({
escapeHtml,
getDatabase: getPlayerProfileScoutingDatabase,
queueDatabaseLoad: queuePlayerProfileScoutingDatabaseLoad,
findRecord: findPlayerProfileNwslScoutingRecord,
getPositionGroup: getPlayerProfileScoutingPositionGroup,
getMetricValue: getPlayerProfileScoutingMetricValue,
getPercentile: getPlayerProfileScoutingPercentile,
getMetric: getPlayerProfileScoutingMetric,
templates: playerProfileScoutingSpiderTemplates,
recordIndex: playerProfileScoutingRecordIndex,
});
function normalizePlayerProfileScoutingText(value) {
return String(value ?? "")
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.toLowerCase()
.replace(/[^a-z0-9]+/g, " ")
.trim();
}
function getPlayerProfileScoutingNameParts(value) {
return normalizePlayerProfileScoutingText(value).split(" ").filter(Boolean);
}
function doPlayerProfileScoutingNamesMatch(playerName, recordName) {
const playerText = normalizePlayerProfileScoutingText(playerName);
const recordText = normalizePlayerProfileScoutingText(recordName);
if (!playerText || !recordText) {
return false;
}
if (playerText === recordText || playerText.includes(recordText) || recordText.includes(playerText)) {
return true;
}
const playerParts = getPlayerProfileScoutingNameParts(playerName);
const recordParts = getPlayerProfileScoutingNameParts(recordName);
const playerLast = playerParts.at(-1);
const recordLast = recordParts.at(-1);
const playerFirst = playerParts[0] || "";
const recordFirst = recordParts[0] || "";
return Boolean(playerLast && recordLast && playerLast === recordLast && playerFirst[0] && playerFirst[0] === recordFirst[0]);
}
function getPlayerProfileScoutingDatabase() {
const importedDatabase = win.__footballScienceImportedScoutingDatabase;
if (importedDatabase && Array.isArray(importedDatabase.records) && Array.isArray(importedDatabase.metrics)) {
return importedDatabase;
}
const bundledDatabase = win.__footballScienceScoutingDatabase;
if (bundledDatabase && Array.isArray(bundledDatabase.records) && Array.isArray(bundledDatabase.metrics)) {
return bundledDatabase;
}
try {
const stored = win.localStorage?.getItem(playerProfileScoutingDatabaseStorageKey);
if (!stored) {
return null;
}
const parsed = JSON.parse(stored);
return parsed && Array.isArray(parsed.records) && Array.isArray(parsed.metrics) ? parsed : null;
} catch {
return null;
}
}
function queuePlayerProfileScoutingDatabaseLoad() {
if (getPlayerProfileScoutingDatabase() || playerProfileScoutingDatabaseLoadPromise || !platformModuleLoader?.loadScript) {
return;
}
playerProfileScoutingDatabaseLoadPromise = platformModuleLoader
.loadScript("scouting-import-data", "scouting-import-data.js", {
id: "scoutingImportDataScript",
required: false,
async: true,
})
.then(() => {
playerProfileScoutingDatabaseLoadPromise = null;
renderPlayerProfilesWorkspace();
})
.catch(() => {
playerProfileScoutingDatabaseLoadPromise = null;
});
}
function getPlayerProfileScoutingMetric(database, metricId) {
return (database?.metrics || []).find((metric) => metric.id === metricId) || null;
}
function getPlayerProfileScoutingMetricIndex(database, metricId) {
if (!database) {
return -1;
}
if (playerProfileScoutingMetricIndexCache.database !== database) {
playerProfileScoutingMetricIndexCache = {
database,
byId: new Map((database.metrics || []).map((metric, index) => [metric.id, index])),
};
}
const index = playerProfileScoutingMetricIndexCache.byId.get(metricId);
return Number.isInteger(index) ? index : -1;
}
function getPlayerProfileScoutingMetricValue(record, metricId) {
const database = getPlayerProfileScoutingDatabase();
const metrics = record?.[playerProfileScoutingRecordIndex.metrics];
const rawValue = Array.isArray(metrics)
? metrics[getPlayerProfileScoutingMetricIndex(database, metricId)]
: metrics && typeof metrics === "object"
? metrics[metricId]
: null;
const value = rawValue === null || rawValue === undefined || rawValue === "" ? NaN : Number(rawValue);
return Number.isFinite(value) ? value : null;
}
function getPlayerProfileScoutingMinutes(record) {
const minutes = Number(record?.[playerProfileScoutingRecordIndex.minutes]);
return Number.isFinite(minutes) ? minutes : 0;
}
function getPlayerProfileScoutingPositionGroup(recordOrPosition, player = null) {
const position = Array.isArray(recordOrPosition)
? recordOrPosition[playerProfileScoutingRecordIndex.position]
: recordOrPosition || player?.position || player?.primaryRole || "";
const tokens = String(position ?? "")
.toUpperCase()
.split(/[^A-Z0-9]+/)
.filter(Boolean);
if (tokens.some((token) => token.includes("GK"))) {
return "GK";
}
if (tokens.some((token) => ["CB", "RCB", "LCB"].includes(token))) {
return "CB";
}
if (tokens.some((token) => ["RB", "LB", "RWB", "LWB", "WB"].includes(token))) {
return "FB";
}
if (tokens.some((token) => ["DMF", "CMF", "RCMF", "LCMF", "AMF", "MF", "8", "6", "10"].includes(token))) {
return "MID";
}
if (tokens.some((token) => ["RW", "LW", "RWF", "LWF", "WF", "W"].includes(token))) {
return "WING";
}
if (tokens.some((token) => ["CF", "ST", "FW", "F"].includes(token))) {
return "CF";
}
if (player?.roleGroup === "goalkeeper") {
return "GK";
}
if (player?.roleGroup === "defender") {
return "CB";
}
if (player?.roleGroup === "midfielder") {
return "MID";
}
if (player?.roleGroup === "forward") {
return "CF";
}
return "OTHER";
}
function isPlayerProfileNwslScoutingRecord(record) {
const league = normalizePlayerProfileScoutingText(record?.[playerProfileScoutingRecordIndex.league]);
return league.includes("nwsl") || league.includes("national women");
}
function findPlayerProfileNwslScoutingRecord(player) {
const database = getPlayerProfileScoutingDatabase();
const playerName = normalizePlayerProfileScoutingText(player?.name);
if (!database || !playerName) {
return null;
}
const candidates = database.records
.filter((record) => {
if (!isPlayerProfileNwslScoutingRecord(record)) {
return false;
}
return doPlayerProfileScoutingNamesMatch(playerName, record?.[playerProfileScoutingRecordIndex.player]);
})
.sort((first, second) => getPlayerProfileScoutingMinutes(second) - getPlayerProfileScoutingMinutes(first));
return candidates[0] || null;
}
function getPlayerProfileScoutingPercentile(record, metricId, direction = "higher") {
const database = getPlayerProfileScoutingDatabase();
const value = getPlayerProfileScoutingMetricValue(record, metricId);
const metric = getPlayerProfileScoutingMetric(database, metricId);
if (!database || !metric || !Number.isFinite(value)) {
return null;
}
const group = getPlayerProfileScoutingPositionGroup(record);
const values = database.records
.filter(
(candidate) =>
isPlayerProfileNwslScoutingRecord(candidate) &&
getPlayerProfileScoutingPositionGroup(candidate) === group &&
getPlayerProfileScoutingMinutes(candidate) >= 300
)
.map((candidate) => getPlayerProfileScoutingMetricValue(candidate, metricId))
.filter((candidateValue) => Number.isFinite(candidateValue))
.sort((a, b) => a - b);
if (values.length < 2) {
return 50;
}
let low = 0;
let high = values.length;
while (low < high) {
const middle = Math.floor((low + high) / 2);
if (values[middle] <= value) {
low = middle + 1;
} else {
high = middle;
}
}
const rawPercentile = Math.max(1, Math.min(99, Math.round((low / values.length) * 100)));
return direction === "lower" ? Math.max(1, Math.min(99, 101 - rawPercentile)) : rawPercentile;
}
function renderPlayerProfileScoutingSpider(player) {
return squadScoutingSpiderRenderer.render(player);
}
function getPlayerRoleDnaDefinition(role) {
const roleKey = normalizePlayerProfileRole(role, "8");
return playerRoleDnaDefinitions[roleKey] ?? playerRoleDnaDefinitions["8"];
}
function getPlayerRoleDnaAttributeBreakdown(player = {}) {
const ratings = player.attributeRatings || {};
return playerProfileAttributeGroups.map((group) => ({
key: group.key,
label: group.label,
rating: normalizePlayerProfileNumber(ratings[group.key], 3),
}));
}
function getPlayerRoleDnaAttributeFit(player = {}, role = "8") {
const definition = getPlayerRoleDnaDefinition(role);
const weightedTotal = playerProfileAttributeGroups.reduce((total, group) => {
const weight = definition.weights?.[group.key] ?? 0.25;
const rating = normalizePlayerProfileNumber(player.attributeRatings?.[group.key], 3);
return total + rating * weight;
}, 0);
const weightTotal = playerProfileAttributeGroups.reduce((total, group) => total + (definition.weights?.[group.key] ?? 0.25), 0);
return Math.round((weightedTotal / Math.max(weightTotal, 0.01)) * 20);
}
function getPlayerRoleDnaBaseFit(player = {}, role = "8") {
const roleKey = normalizePlayerProfileRole(role, "");
const primaryRole = normalizePlayerProfileRole(player.primaryRole, "");
const secondaryRoles = Array.isArray(player.secondaryRoles)
? player.secondaryRoles.map((candidate) => normalizePlayerProfileRole(candidate, "")).filter(Boolean)
: [];
const compatibleRoles = getSquadMatrixCompatibleRoles(roleKey);
if (!roleKey) {
return 0;
}
if (primaryRole === roleKey) {
return 100;
}
if (secondaryRoles.includes(roleKey)) {
return 86;
}
if (compatibleRoles.includes(primaryRole)) {
return 72;
}
if (secondaryRoles.some((candidate) => compatibleRoles.includes(candidate))) {
return 64;
}
if (primaryRole && getSquadMatrixRoleGroup(primaryRole) === getSquadMatrixRoleGroup(roleKey)) {
return 52;
}
return 32;
}
function getPlayerRoleDnaScore(player = {}, role = "8") {
const roleKey = normalizePlayerProfileRole(role, "");
if (!roleKey) {
return 0;
}
const baseFit = getPlayerRoleDnaBaseFit(player, roleKey);
const attributeFit = getPlayerRoleDnaAttributeFit(player, roleKey);
const sideAdjustment = getSquadMatrixSideAdjustment(player, roleKey);
const score = Math.round(baseFit * 0.62 + attributeFit * 0.38 + sideAdjustment);
return Math.max(25, Math.min(99, score));
}
function getPlayerRoleDnaBestMatches(player = {}, limit = 3) {
return playerProfileRoleOptions
.map((role) => ({
role,
score: getPlayerRoleDnaScore(player, role),
definition: getPlayerRoleDnaDefinition(role),
attributeFit: getPlayerRoleDnaAttributeFit(player, role),
}))
.sort((first, second) => second.score - first.score || second.attributeFit - first.attributeFit)
.slice(0, limit);
}
function getPlayerRoleDnaReasons(player = {}, role = "8") {
const roleKey = normalizePlayerProfileRole(role, "8");
const definition = getPlayerRoleDnaDefinition(roleKey);
const baseFit = getPlayerRoleDnaBaseFit(player, roleKey);
const attributeFit = getPlayerRoleDnaAttributeFit(player, roleKey);
const sideAdjustment = getSquadMatrixSideAdjustment(player, roleKey);
const availabilityAdjustment = getSquadMatrixAvailabilityAdjustment(player);
const strongestAttribute = getPlayerRoleDnaAttributeBreakdown(player).sort((first, second) => second.rating - first.rating)[0];
const strengths = [];
const risks = [];
if (player.primaryRole === roleKey) {
strengths.push(`Natural primary role as ${roleKey}`);
} else if (Array.isArray(player.secondaryRoles) && player.secondaryRoles.includes(roleKey)) {
strengths.push(`Secondary role coverage as ${roleKey}`);
} else if (baseFit >= 64) {
strengths.push(`Compatible role family for ${roleKey}`);
}
if (attributeFit >= 76) {
strengths.push(`${definition.label} DNA fits the attribute model`);
}
if (strongestAttribute) {
strengths.push(`${strongestAttribute.label} is the strongest current attribute`);
}
if (sideAdjustment > 0) {
strengths.push("Preferred side supports the role");
}
if (baseFit < 58) {
risks.push(`Not a natural ${roleKey} profile yet`);
}
if (attributeFit < 62) {
risks.push("Attribute profile needs more evidence");
}
if (sideAdjustment < 0) {
risks.push("Preferred side conflicts with the role");
}
if (availabilityAdjustment < 0) {
risks.push("Availability reduces selection confidence");
}
return {
strengths: strengths.slice(0, 3),
risks: risks.slice(0, 3),
};
}
function getPlayerProfileRoleFitScore(player, role) {
const roleKey = normalizePlayerProfileRole(role, "");
if (!player || !roleKey) {
return 0;
}
return getPlayerRoleDnaScore(player, roleKey);
}
function getSquadStatusRank(statusKey) {
const ranks = {
important: 1,
rotation: 2,
depth: 3,
development: 4,
loan: 5,
};
return ranks[statusKey] ?? 9;
}
function getPlayerProfileDateDiffDays(fromDateValue, toDateValue) {
if (!isMedicalDateValue(fromDateValue) || !isMedicalDateValue(toDateValue)) {
return 0;
}
const fromDate = parseScheduleDateValue(fromDateValue);
const toDate = parseScheduleDateValue(toDateValue);
fromDate.setHours(0, 0, 0, 0);
toDate.setHours(0, 0, 0, 0);
return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}
function getPlayerProfileDateValueFromTimestamp(value = "") {
const parsedTime = Date.parse(value);
if (!Number.isFinite(parsedTime)) {
return "";
}
return formatScheduleDateValue(new Date(parsedTime));
}
function getPlayerProfileIdpReviewLabel(reviewDate = "", todayValue = formatScheduleDateValue(new Date())) {
if (!isMedicalDateValue(reviewDate)) {
return "";
}
const daysUntilReview = getPlayerProfileDateDiffDays(todayValue, reviewDate);
if (daysUntilReview < 0) {
return `Review overdue ${Math.abs(daysUntilReview)}d`;
}
if (daysUntilReview === 0) {
return "Review today";
}
if (daysUntilReview === 1) {
return "Review tomorrow";
}
if (daysUntilReview <= 14) {
return `Review in ${daysUntilReview}d`;
}
return `Review ${formatMedicalDateLabel(reviewDate)}`;
}
function getPlayerProfileIdpMissingFocusLabel(player, todayValue = formatScheduleDateValue(new Date())) {
const anchorDate =
getPlayerProfileDateValueFromTimestamp(player.updatedAt) ||
getPlayerProfileDateValueFromTimestamp(player.createdAt) ||
todayValue;
const daysWithoutFocus = Math.max(0, getPlayerProfileDateDiffDays(anchorDate, todayValue));
return `No IDP focus · ${daysWithoutFocus}d`;
}
function getPlayerProfileIdpFollowUpLabel(player, statusOption) {
const idp = player.idp || {};
const todayValue = formatScheduleDateValue(new Date());
const nextAction = String(idp.nextAction || "").trim();
const reviewLabel = getPlayerProfileIdpReviewLabel(idp.reviewDate, todayValue);
if (statusOption.key === "none") {
return "No active IDP";
}
if (!String(idp.primaryFocus || "").trim()) {
return getPlayerProfileIdpMissingFocusLabel(player, todayValue);
}
if (nextAction && reviewLabel) {
return `${nextAction} · ${reviewLabel}`;
}
if (reviewLabel) {
return reviewLabel;
}
if (nextAction) {
return `Next: ${nextAction}`;
}
if (statusOption.key === "review") {
return "Review needed";
}
return "Set follow-up date";
}
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
function getSquadMatrixRoleGroup(role) {
if (role === "GK") {
return "goalkeeper";
}
if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) {
return "defender";
}
if (["6", "8", "10"].includes(role)) {
return "midfielder";
}
return "forward";
}
function getSquadMatrixCompatibleRoles(role) {
const compatibleRoles = {
GK: ["GK"],
LB: ["LWB", "CB", "RB"],
CB: ["LB", "RB", "6"],
RB: ["RWB", "CB", "LB"],
LWB: ["LB", "LW", "RWB"],
RWB: ["RB", "RW", "LWB"],
6: ["8", "CB", "10"],
8: ["6", "10", "LW", "RW"],
10: ["8", "ST", "LW", "RW"],
LW: ["LWB", "RW", "10", "ST"],
RW: ["RWB", "LW", "10", "ST"],
ST: ["10", "LW", "RW"],
};
return compatibleRoles[role] ?? [];
}
function getSquadMatrixSideAdjustment(player, role) {
const preferredSide = String(player?.preferredSide ?? "").toLowerCase();
if (!preferredSide || preferredSide === "any") {
return 0;
}
if (["LB", "LWB", "LW"].includes(role)) {
return preferredSide === "left" ? 4 : preferredSide === "right" ? -3 : 0;
}
if (["RB", "RWB", "RW"].includes(role)) {
return preferredSide === "right" ? 4 : preferredSide === "left" ? -3 : 0;
}
if (["CB", "6", "8", "10", "ST", "GK"].includes(role)) {
return preferredSide === "center" ? 3 : 0;
}
return 0;
}
function getSquadMatrixAvailabilityAdjustment(player) {
const summary = player?.medicalSummary ?? {};
const availabilityText = [
player?.status,
summary.currentAvailability,
summary.availability,
summary.rtpStatus,
summary.status,
]
.filter(Boolean)
.join(" ")
.toLowerCase();
if (/injur|unavailable|out|not available/.test(availabilityText)) {
return -24;
}
if (/rehab|restricted|rtp|return/.test(availabilityText)) {
return -12;
}
if (/limited|modified|partial|monitor/.test(availabilityText)) {
return -7;
}
if (/available|fit|full|ready/.test(availabilityText)) {
return 4;
}
return 0;
}
function getSquadPlayerDataQualityFlags(player = {}) {
const flags = [];
const completeness = getPlayerProfileCompleteness(player);
const attributeValues = playerProfileAttributeGroups.map((group) =>
normalizePlayerProfileNumber(player.attributeRatings?.[group.key], 3)
);
const baselineAttributes = attributeValues.every((value) => value === 3);
const medicalSnapshot = player.id ? getPlayerProfileMedicalSnapshot(player.id) : null;
if (!player.primaryRole) {
flags.push({ key: "missing-role", label: "Missing primary role", severity: "critical" });
}
if (!Array.isArray(player.secondaryRoles) || player.secondaryRoles.length === 0) {
flags.push({ key: "secondary-roles", label: "Add secondary roles", severity: "watch" });
}
if (!player.preferredSide) {
flags.push({ key: "preferred-side", label: "Missing preferred side", severity: "watch" });
}
if (baselineAttributes) {
flags.push({ key: "attributes", label: "Attribute ratings need review", severity: "watch" });
}
if (!player.idp?.primaryFocus && player.idp?.status !== "none") {
flags.push({ key: "idp", label: "IDP focus missing", severity: "watch" });
}
if (!medicalSnapshot || medicalSnapshot.latestLogSummary === "No medical log yet") {
flags.push({ key: "medical-link", label: "No medical log linked", severity: "watch" });
}
if (completeness < 70) {
flags.push({ key: "profile-complete", label: `Profile ${completeness}% complete`, severity: "critical" });
}
return flags;
}
function buildSquadDataQualityReport() {
ensurePlayerProfilesState();
const playerReports = playerProfilesState.players.map((player) => {
const flags = getSquadPlayerDataQualityFlags(player);
return {
player,
flags,
criticalCount: flags.filter((flag) => flag.severity === "critical").length,
watchCount: flags.filter((flag) => flag.severity === "watch").length,
completeness: getPlayerProfileCompleteness(player),
};
});
const totalFlags = playerReports.reduce((total, report) => total + report.flags.length, 0);
const criticalFlags = playerReports.reduce((total, report) => total + report.criticalCount, 0);
const sessionPlannerReady = playerReports.filter((report) =>
report.player.name &&
report.player.primaryRole &&
report.player.roleGroup &&
report.player.preferredSide &&
report.completeness >= 70
).length;
return {
playerReports,
totalFlags,
criticalFlags,
sessionPlannerReady,
reviewPlayers: playerReports
.filter((report) => report.flags.length)
.sort((first, second) =>
second.criticalCount - first.criticalCount ||
second.flags.length - first.flags.length ||
first.completeness - second.completeness
),
};
}
function buildSquadSessionPlannerContracts() {
ensurePlayerProfilesState();
return playerProfilesState.players.map((player) => {
const roleScores = playerProfileRoleOptions.reduce((scores, role) => {
scores[role] = getPlayerRoleDnaScore(player, role);
return scores;
}, {});
const bestRoleMatches = getPlayerRoleDnaBestMatches(player, 4).map((match) => ({
role: match.role,
score: match.score,
label: match.definition.label,
}));
const medicalSnapshot = getPlayerProfileMedicalSnapshot(player.id);
const effectiveStatus = getPlayerProfileEffectiveStatusFromSnapshot(player, medicalSnapshot);
return {
id: player.id,
name: player.name,
number: player.number,
position: player.position,
primaryRole: player.primaryRole,
secondaryRoles: player.secondaryRoles,
preferredSide: player.preferredSide,
roleGroup: player.roleGroup,
status: effectiveStatus,
profileStatus: player.status,
squadStatus: player.squadStatus,
rosterType: player.rosterType,
countsInSquad: player.countsInSquad,
temporaryGroup: player.temporaryGroup,
temporaryFrom: player.temporaryFrom,
temporaryTo: player.temporaryTo,
availability: medicalSnapshot.currentAvailability,
rtpStatus: medicalSnapshot.rtpStatus,
roleDnaScores: roleScores,
bestRoleMatches,
dataQualityFlags: getSquadPlayerDataQualityFlags(player).map((flag) => flag.key),
updatedAt: player.updatedAt,
};
});
}
function buildSquadDataFoundationPayload() {
ensurePlayerProfilesState();
const dataQuality = buildSquadDataQualityReport();
return {
schemaVersion: 3,
module: "player-profiles",
source: "football-science",
exportedAt: new Date().toISOString(),
storageKey: playerProfilesStorageKey,
supabaseReady: {
recommendedTables: [
"players",
"player_roles",
"player_attribute_ratings",
"player_role_dna",
"player_idp",
"player_medical_summary_links",
"player_future_data",
"player_change_log",
],
primaryKey: "players.id",
sessionPlannerContract: "sessionPlanner.players.v2",
},
schema: {
players: [
"id",
"name",
"number",
"position",
"photoUrl",
"status",
"squadStatus",
"careerPhase",
"rosterType",
"countsInSquad",
"temporaryGroup",
"temporaryFrom",
"temporaryTo",
],
roles: ["primaryRole", "secondaryRoles", "preferredSide", "roleGroup"],
attributeRatings: playerProfileAttributeGroups.map((group) => group.key),
roleDna: playerProfileRoleOptions,
idp: ["status", "primaryFocus", "strengths", "focusAreas", "nextAction", "reviewDate"],
medicalSummary: ["currentAvailability", "rtpStatus", "coachNote", "latestLogDate", "latestLogSummary"],
futureData: ["matchData", "load", "minutes", "performanceNotes", "scoutingNotes", "analysisNotes"],
changeLog: ["id", "type", "playerId", "actor", "summary", "changes", "createdAt"],
},
dataQuality: {
totalFlags: dataQuality.totalFlags,
criticalFlags: dataQuality.criticalFlags,
sessionPlannerReady: dataQuality.sessionPlannerReady,
totalPlayers: playerProfilesState.players.length,
squadPlayers: getPlayerProfilesRosterSummary(playerProfilesState.players).squadCount,
temporaryPlayers: getPlayerProfilesRosterSummary(playerProfilesState.players).temporaryCount,
},
players: playerProfilesState.players.map((player) => ({
id: player.id,
name: player.name,
number: player.number,
position: player.position,
photoUrl: player.photoUrl,
sourceUrl: player.sourceUrl,
status: player.status,
squadStatus: player.squadStatus,
careerPhase: player.careerPhase,
rosterType: player.rosterType,
countsInSquad: player.countsInSquad,
temporaryGroup: player.temporaryGroup,
temporaryFrom: player.temporaryFrom,
temporaryTo: player.temporaryTo,
roles: {
primaryRole: player.primaryRole,
secondaryRoles: player.secondaryRoles,
preferredSide: player.preferredSide,
roleGroup: player.roleGroup,
},
attributeRatings: player.attributeRatings,
roleDna: {
bestMatches: getPlayerRoleDnaBestMatches(player, 4).map((match) => ({
role: match.role,
label: match.definition.label,
score: match.score,
})),
scores: playerProfileRoleOptions.reduce((scores, role) => {
scores[role] = getPlayerRoleDnaScore(player, role);
return scores;
}, {}),
},
idp: player.idp,
medicalSummary: getPlayerProfileMedicalSnapshot(player.id),
futureData: player.futureData,
coachNotes: player.coachNotes,
dataQualityFlags: getSquadPlayerDataQualityFlags(player),
rosterOrder: player.rosterOrder,
createdAt: player.createdAt,
updatedAt: player.updatedAt,
})),
changeLog: normalizePlayerProfileChangeLog(playerProfilesState.changeLog),
sessionPlanner: {
players: buildSquadSessionPlannerContracts(),
},
};
}
function getSquadFoundationFileStamp() {
return new Date().toISOString().slice(0, 10);
}
function downloadSquadFoundationTextFile(filename, contents, type = "text/plain") {
const blob = new Blob([contents], { type });
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = filename;
document.body.appendChild(link);
link.click();
link.remove();
URL.revokeObjectURL(url);
}
function exportSquadDataFoundationJson() {
const payload = buildSquadDataFoundationPayload();
downloadSquadFoundationTextFile(
`football-science-squad-data-${getSquadFoundationFileStamp()}.json`,
`${JSON.stringify(payload, null, 2)}\n`,
"application/json"
);
}
function exportSquadSessionPlannerCsv() {
const contracts = buildSquadSessionPlannerContracts();
const headers = [
"id",
"name",
"number",
"primaryRole",
"secondaryRoles",
"preferredSide",
"roleGroup",
"status",
"rosterType",
"countsInSquad",
"temporaryGroup",
"availability",
"bestRoleMatches",
];
const rows = contracts.map((player) => [
player.id,
player.name,
player.number,
player.primaryRole,
player.secondaryRoles.join("|"),
player.preferredSide,
player.roleGroup,
player.status,
player.rosterType,
player.countsInSquad ? "true" : "false",
player.temporaryGroup,
player.availability,
player.bestRoleMatches.map((match) => `${match.role}:${match.score}`).join("|"),
]);
const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
downloadSquadFoundationTextFile(
`football-science-session-planner-contract-${getSquadFoundationFileStamp()}.csv`,
`${csv}\n`,
"text/csv"
);
}
function getImportedSquadPlayersFromPayload(payload = {}) {
if (Array.isArray(payload.players)) {
return payload.players;
}
if (Array.isArray(payload.sessionPlanner?.players)) {
return payload.sessionPlanner.players;
}
if (Array.isArray(payload.state?.players)) {
return payload.state.players;
}
return [];
}
function normalizeImportedSquadPlayerProfile(source = {}, existingPlayer = {}) {
const roles = source.roles || {};
const normalized = normalizePlayerProfile({
...existingPlayer,
...source,
primaryRole: source.primaryRole || roles.primaryRole || existingPlayer.primaryRole,
secondaryRoles: source.secondaryRoles || roles.secondaryRoles || existingPlayer.secondaryRoles,
preferredSide: source.preferredSide || roles.preferredSide || existingPlayer.preferredSide,
roleGroup: source.roleGroup || roles.roleGroup || existingPlayer.roleGroup,
rosterType: source.rosterType || source.playerType || existingPlayer.rosterType,
countsInSquad: typeof source.countsInSquad === "boolean" ? source.countsInSquad : existingPlayer.countsInSquad,
temporaryGroup: source.temporaryGroup || source.subGroup || existingPlayer.temporaryGroup,
temporaryFrom: source.temporaryFrom || source.startDate || existingPlayer.temporaryFrom,
temporaryTo: source.temporaryTo || source.endDate || existingPlayer.temporaryTo,
attributeRatings: source.attributeRatings || existingPlayer.attributeRatings,
idp: source.idp || existingPlayer.idp,
medicalSummary: source.medicalSummary || existingPlayer.medicalSummary,
futureData: source.futureData || existingPlayer.futureData,
coachNotes: source.coachNotes || existingPlayer.coachNotes,
});
return normalized;
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
function buildPlayerProfileImportPlan(payload = {}, options = {}) {
ensurePlayerProfilesState();
const incomingPlayers = getImportedSquadPlayersFromPayload(payload);
const sourceRows = Array.isArray(incomingPlayers) ? incomingPlayers.length : 0;
if (!incomingPlayers.length) {
return {
ok: false,
status: "error",
sourceRows,
importedCount: 0,
createdCount: 0,
updatedCount: 0,
skippedCount: 0,
duplicateRowsCount: 0,
errors: [{ row: 0, message: "No players found in import file." }],
warnings: [],
rows: [],
nextPlayers: [...playerProfilesState.players],
profilesForMedicalSync: [],
canApply: false,
};
}
let createdCount = 0;
let updatedCount = 0;
let skippedCount = 0;
let duplicateRowsCount = 0;
const warnings = [];
const errors = [];
const profilesForMedicalSync = [];
const nextPlayers = [...playerProfilesState.players];
const seenIncomingRows = new Map();
const rows = [];
incomingPlayers.forEach((incomingPlayer, rowIndex) => {
const row = rowIndex + 1;
if (!incomingPlayer || typeof incomingPlayer !== "object") {
errors.push({ row, message: "Import row must be an object." });
rows.push({
row,
action: "skip",
message: "Import row must be an object.",
});
skippedCount += 1;
return;
}
const incomingName = String(incomingPlayer.name ?? "").trim();
if (!incomingName) {
errors.push({ row, message: "Player name is required." });
rows.push({
row,
action: "skip",
message: "Player name is required.",
});
skippedCount += 1;
return;
}
const normalizedName = normalizePlayerProfileName(incomingName);
const normalizedNumber = String(incomingPlayer.number || "").trim();
const importIdentity = `${normalizedName}|${normalizedNumber}`;
const previousRow = seenIncomingRows.get(importIdentity);
if (previousRow) {
const message = `Duplicate row in import file for ${incomingName}. Keeping row ${previousRow} first.`;
warnings.push({ row, message });
rows.push({
row,
action: "skip",
message,
});
duplicateRowsCount += 1;
skippedCount += 1;
return;
}
seenIncomingRows.set(importIdentity, row);
const existingIndex = nextPlayers.findIndex((player) =>
(incomingPlayer.id && player.id === incomingPlayer.id) ||
String(player?.name ?? "").toLowerCase() === incomingName.toLowerCase()
);
const existingPlayer = existingIndex >= 0 ? nextPlayers[existingIndex] : {};
const normalized = normalizeImportedSquadPlayerProfile(incomingPlayer, existingPlayer);
if (!normalized) {
errors.push({ row, message: `Could not normalize ${incomingName}.` });
rows.push({
row,
action: "skip",
message: `Could not normalize ${incomingName}.`,
});
skippedCount += 1;
return;
}
const validation = validatePlayerProfileFormValues(
{
...normalized,
id: existingPlayer.id || normalized.id || createDashboardId("player-profile"),
updatedAt: new Date().toISOString(),
},
{
existingPlayers: nextPlayers,
ignorePlayerId: existingPlayer.id || "",
blockDuplicate: false,
}
);
if (!validation.ok) {
validation.errors.forEach((message) => errors.push({ row, message }));
rows.push({
row,
action: "skip",
message: validation.errors.join(", "),
});
skippedCount += 1;
return;
}
const nextPlayer = validation.player;
if (!nextPlayer) {
errors.push({ row, message: `Could not normalize ${incomingName}.` });
rows.push({
row,
action: "skip",
message: `Could not normalize ${incomingName}.`,
});
skippedCount += 1;
return;
}
validation.warnings.forEach((message) => warnings.push({ row, message }));
if (existingIndex >= 0) {
nextPlayers[existingIndex] = nextPlayer;
updatedCount += 1;
} else {
nextPlayers.push(nextPlayer);
createdCount += 1;
}
profilesForMedicalSync.push(nextPlayer);
rows.push({
row,
action: existingIndex >= 0 ? "update" : "create",
playerName: nextPlayer.name,
playerId: nextPlayer.id,
message: incomingPlayer.id ? `id ${nextPlayer.id}` : "new profile",
matchType: existingIndex >= 0 ? (incomingPlayer.id ? "id match" : "name match") : "new profile",
});
});
const importedCount = createdCount + updatedCount;
if (!importedCount) {
return {
ok: false,
status: errors.length ? "error" : "warning",
sourceRows,
importedCount,
createdCount,
updatedCount,
skippedCount,
duplicateRowsCount,
errors,
warnings,
rows,
nextPlayers,
profilesForMedicalSync,
canApply: false,
};
}
return {
ok: true,
status: errors.length ? "warning" : "success",
sourceRows,
importedCount,
createdCount,
updatedCount,
skippedCount,
duplicateRowsCount,
errors,
warnings,
rows,
nextPlayers,
profilesForMedicalSync,
canApply: importedCount > 0,
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
function createSessionPlannerPlayerProfileContract(player, dateValue = formatScheduleDateValue(new Date())) {
if (!player) {
return null;
}
const medicalSnapshot = getPlayerProfileMedicalSnapshot(player.id, dateValue);
const effectiveStatus = getPlayerProfileEffectiveStatusFromSnapshot(player, medicalSnapshot);
return {
id: player.id,
name: player.name,
number: player.number,
position: player.position,
status: effectiveStatus,
profileStatus: player.status,
squadStatus: player.squadStatus,
careerPhase: player.careerPhase,
rosterType: player.rosterType,
countsInSquad: player.countsInSquad,
temporaryGroup: player.temporaryGroup,
temporaryFrom: player.temporaryFrom,
temporaryTo: player.temporaryTo,
roleGroup: player.roleGroup,
primaryRole: player.primaryRole,
secondaryRoles: [...player.secondaryRoles],
preferredSide: player.preferredSide,
roleFit: Object.fromEntries(
playerProfileRoleOptions.map((role) => [role, getPlayerProfileRoleFitScore(player, role)])
),
idp: {
status: player.idp?.status || "none",
primaryFocus: player.idp?.primaryFocus || "",
nextAction: player.idp?.nextAction || "",
reviewDate: player.idp?.reviewDate || "",
},
medical: {
availability: medicalSnapshot.currentAvailability,
rtpStatus: medicalSnapshot.rtpStatus,
coachNote: medicalSnapshot.coachNote,
latestLogSummary: medicalSnapshot.latestLogSummary,
participation: medicalSnapshot.participation,
status: medicalSnapshot.medicalStatusKey,
tone: medicalSnapshot.tone,
medicalSource: medicalSnapshot.medicalSource,
hasActivePlan: medicalSnapshot.hasActivePlan,
returnDate: medicalSnapshot.returnDate,
returnDateLabel: medicalSnapshot.returnDateLabel,
returnLabel: medicalSnapshot.returnLabel,
activeInjuryLabel: medicalSnapshot.activeInjuryLabel,
},
};
}
function getSessionPlannerPlayerProfileContracts(options = {}) {
ensurePlayerProfilesState();
const dateValue = isMedicalDateValue(options.dateValue)
? options.dateValue
: formatScheduleDateValue(new Date());
return playerProfilesState.players
.map((player) => createSessionPlannerPlayerProfileContract(player, dateValue))
.filter(Boolean);
}
function getSessionPlannerPlayerProfileContract(playerId, options = {}) {
ensurePlayerProfilesState();
const player = playerProfilesState.players.find((candidate) => candidate.id === playerId) ?? null;
return createSessionPlannerPlayerProfileContract(
player,
isMedicalDateValue(options.dateValue) ? options.dateValue : formatScheduleDateValue(new Date())
);
}
win.footballSciencePlayerProfiles = {
getState: () => clonePlayerProfilesState(ensurePlayerProfilesState()),
getPlayersForSessionPlanner: getSessionPlannerPlayerProfileContracts,
getPlayerForSessionPlanner: getSessionPlannerPlayerProfileContract,
getDataFoundationPayload: buildSquadDataFoundationPayload,
getDataQualityReport: buildSquadDataQualityReport,
getSessionPlannerContractsV2: buildSquadSessionPlannerContracts,
};
function canEditMedicalTeam() {
return canCurrentUserEditWorkspace("medical-team");
}
function getMedicalAccessLabel() {
if (canEditMedicalTeam()) {
return isCurrentPlatformUserAdmin() ? "Admin oversight" : "Medical edit access";
}
return "Coach view";
}
function getMedicalHeroTeamName() {
const user = getCurrentPlatformUser();
const teamName = getPlatformTeamDisplayName(user, getPlatformStructureState());
if (teamName && teamName !== "Team") {
return teamName;
}
return normalizePlatformStructureText(user?.team || user?.teamName || user?.clubName || user?.club, "") || "Medical Team";
}
function getSelectedMedicalPlayer() {
ensureMedicalState();
const activePlayers = getActiveMedicalPlayers();
return (
activePlayers.find((player) => player.id === medicalState.selectedPlayerId) ??
activePlayers[0] ??
null
);
}
function getActiveMedicalPlayers() {
ensureMedicalState();
const removedPlayerIdSet = getMedicalRemovedSquadPlayerIdSet();
return medicalState.players.filter(
(player) => !isMedicalItemArchived(player) && !isMedicalPlayerRemovedFromSquad(player, removedPlayerIdSet)
);
}
function isMedicalPlayerVisibleForDate(player = {}, dateValue = medicalState?.selectedDate) {
return !isTemporaryPlayerProfile(player) || isPlayerProfileTemporaryActiveOnDate(player, dateValue);
}
function getActiveMedicalPlayersForDate(dateValue = medicalState?.selectedDate) {
return getActiveMedicalPlayers().filter((player) => isMedicalPlayerVisibleForDate(player, dateValue));
}
function isMedicalInjuryPlanActive(plan, dateValue = medicalState?.selectedDate) {
return Boolean(plan && !isMedicalItemArchived(plan) && isMedicalDateValue(dateValue) && plan.startDate <= dateValue && plan.endDate >= dateValue);
}
function getMedicalPlayerInjuryPlans(playerId, options = {}) {
ensureMedicalState();
const includeArchived = Boolean(options.includeArchived);
return medicalState.injuryPlans
.filter((plan) => plan.playerId === playerId && (includeArchived || !isMedicalItemArchived(plan)))
.sort((first, second) => {
const activeComparison =
Number(isMedicalInjuryPlanActive(second, medicalState.selectedDate)) -
Number(isMedicalInjuryPlanActive(first, medicalState.selectedDate));
if (activeComparison !== 0) {
return activeComparison;
}
const startComparison = second.startDate.localeCompare(first.startDate);
if (startComparison !== 0) {
return startComparison;
}
return new Date(second.createdAt) - new Date(first.createdAt);
});
}
function getActiveMedicalInjuryPlan(playerId, dateValue = medicalState?.selectedDate) {
ensureMedicalState();
return medicalState.injuryPlans
.filter((plan) => plan.playerId === playerId && isMedicalInjuryPlanActive(plan, dateValue))
.sort((first, second) => new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt))[0] ?? null;
}
function createMedicalRecordFromSquadAvailabilityBlock(player, dateValue) {
if (!player || !isMedicalDateValue(dateValue) || !isMedicalPlayerBlockedBySquadAvailability(player)) {
return null;
}
const option = getMedicalPlayerAvailabilityStatusOption(player);
const reason = option.label || "Unavailable";
return {
id: `squad-availability:${player.id}:${dateValue}`,
playerId: player.id,
date: dateValue,
status: "unavailable",
participation: 0,
actualParticipation: medicalActualParticipationFallback,
comment: `${reason} in Squad Room`,
coachNote: `${reason} - not available for team activity`,
shareWithCoach: true,
rtpPhase: "medical-restriction",
createdAt: player.updatedAt || new Date().toISOString(),
updatedAt: player.updatedAt || new Date().toISOString(),
createdBy: "squad-room",
source: "squad-availability",
};
}
function isMedicalPlanCleared(plan) {
if (!plan) {
return true;
}
const clearance = normalizeMedicalClearance(plan.clearance);
const gates = normalizeMedicalLoadGates(plan.gates);
return (
medicalClearanceRoles.every((role) => clearance[role.key]) &&
medicalLoadGateOptions.every((gate) => gates[gate.key] === "pass")
);
}
function getMedicalRecommendationBlockReason(playerId, participation, dateValue) {
const activityContext = getMedicalRecommendationActivityContext(dateValue);
if (!activityContext.isRecommendable) {
return activityContext.blockReason;
}
const player = medicalState.players.find((candidate) => candidate.id === playerId);
const squadBlockReason = getMedicalPlayerSquadAvailabilityBlockReason(player);
if (squadBlockReason) {
return squadBlockReason;
}
const activePlan = getActiveMedicalInjuryPlan(playerId, dateValue);
if (participation === 100 && activePlan && !isMedicalPlanCleared(activePlan)) {
return activityContext.type === "match"
? "Clearance checklist required before match availability."
: "Clearance checklist required before full training.";
}
return "";
}
function getMedicalReviewAlerts(dateValue = medicalState?.selectedDate) {
ensureMedicalState();
if (!isMedicalDateValue(dateValue)) {
return [];
}
const endDate = formatScheduleDateValue(addCalendarDays(parseScheduleDateValue(dateValue), 7));
return medicalState.injuryPlans
.filter((plan) => !isMedicalItemArchived(plan) && plan.reviewDate && plan.reviewDate <= endDate && plan.endDate >= dateValue)
.map((plan) => ({
plan,
player: medicalState.players.find((player) => player.id === plan.playerId) ?? null,
isOverdue: plan.reviewDate < dateValue,
}))
.filter((item) => item.player)
.sort((first, second) => {
if (first.isOverdue !== second.isOverdue) {
return Number(second.isOverdue) - Number(first.isOverdue);
}
return first.plan.reviewDate.localeCompare(second.plan.reviewDate);
});
}
function getMedicalCoachComment(record) {
if (!record || !record.shareWithCoach) {
return "";
}
return String(record.coachNote ?? "").trim();
}
function getMedicalVisibleComment(record) {
if (!record) {
return "";
}
return canEditMedicalTeam() ? String(record.comment ?? "").trim() : getMedicalCoachComment(record);
}
function createMedicalRecordFromInjuryPlan(plan, dateValue) {
if (!plan) {
return null;
}
const injuryLabel = [plan.injuryType, plan.bodyArea].filter(Boolean).join(" / ");
const clearancePending = plan.participation === 100 && !isMedicalPlanCleared(plan);
return {
id: `injury-plan:${plan.id}:${dateValue}`,
playerId: plan.playerId,
date: dateValue,
status: clearancePending ? "modified" : plan.status,
participation: clearancePending ? 75 : plan.participation,
actualParticipation: medicalActualParticipationFallback,
comment: [injuryLabel, plan.phase, clearancePending ? "Clearance pending" : "", plan.comment].filter(Boolean).join(" - "),
coachNote: plan.coachNote,
shareWithCoach: plan.shareWithCoach,
rtpPhase: plan.rtpPhase,
clearance: plan.clearance,
gates: plan.gates,
createdAt: plan.createdAt,
updatedAt: plan.updatedAt,
createdBy: plan.createdBy,
source: "injury-plan",
injuryPlanId: plan.id,
};
}
function getLatestMedicalRecord(playerId, dateValue = medicalState?.selectedDate) {
ensureMedicalState();
const player = medicalState.players.find((candidate) => candidate.id === playerId);
const squadBlockRecord = createMedicalRecordFromSquadAvailabilityBlock(player, dateValue);
if (squadBlockRecord) {
return squadBlockRecord;
}
const manualRecord = medicalState.records
.filter((record) => record.playerId === playerId && record.date === dateValue && !isMedicalItemArchived(record))
.sort((first, second) => new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt))[0] ?? null;
const activePlan = getActiveMedicalInjuryPlan(playerId, dateValue);
const planRecord = createMedicalRecordFromInjuryPlan(activePlan, dateValue);
if (manualRecord && planRecord) {
return getMedicalEntityUpdatedMs(activePlan) >= getMedicalEntityUpdatedMs(manualRecord) ? planRecord : manualRecord;
}
return manualRecord || planRecord;
}
function getMedicalPlayerRecords(playerId, options = {}) {
ensureMedicalState();
const includeArchived = Boolean(options.includeArchived);
return medicalState.records
.filter((record) => record.playerId === playerId && (includeArchived || !isMedicalItemArchived(record)))
.sort((first, second) => {
const dateComparison = second.date.localeCompare(first.date);
if (dateComparison !== 0) {
return dateComparison;
}
return new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt);
});
}
function isMedicalRestrictedRecommendationRecord(record) {
return normalizeMedicalParticipation(record?.participation, 100) !== 100;
}
function getMedicalPlayerRestrictedLogRecords(playerId, options = {}) {
return getMedicalPlayerRecords(playerId, options).filter(isMedicalRestrictedRecommendationRecord);
}
function getMedicalWindowDates() {
ensureMedicalState();
const startDate = parseScheduleDateValue(medicalState.selectedDate);
return Array.from({ length: medicalWindowLength }, (_, index) =>
formatScheduleDateValue(addCalendarDays(startDate, index))
);
}
function getMedicalPastWindowDates(dateValue = medicalState?.selectedDate) {
ensureMedicalState();
const endDate = parseScheduleDateValue(dateValue);
return Array.from({ length: medicalWindowLength }, (_, index) =>
formatScheduleDateValue(addCalendarDays(endDate, index - medicalWindowLength + 1))
);
}
function getMedicalMonthToDateDates(referenceDate = new Date()) {
const today = new Date(referenceDate);
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
const dayCount = getMedicalDaySpan(formatScheduleDateValue(monthStart), formatScheduleDateValue(today)) ?? 1;
return Array.from({ length: dayCount }, (_, index) => formatScheduleDateValue(addCalendarDays(monthStart, index)));
}
function getMedicalScheduleSummary(dateValue) {
const events = getScheduleEventsForDate(dateValue);
const mainEvent = getScheduleMainEvent(events);
if (!mainEvent) {
return "No team event";
}
return mainEvent.title || scheduleEventTypes[mainEvent.type]?.label || "Team event";
}
function getMedicalRecommendationEvent(events = []) {
const matchEvent = events.find((event) => event?.type === "match");
if (matchEvent) {
return { event: matchEvent, type: "match" };
}
const trainingEvent = events.find(isScheduleSessionEvent);
if (trainingEvent) {
return { event: trainingEvent, type: "training" };
}
return { event: getScheduleMainEvent(events) ?? null, type: "none" };
}
function getMedicalRecommendationActivityContext(dateValue = medicalState?.selectedDate) {
const cleanDate = isMedicalDateValue(dateValue) ? dateValue : formatScheduleDateValue(new Date());
const events = getScheduleEventsForDate(cleanDate);
const { event: mainEvent, type: activityType } = getMedicalRecommendationEvent(events);
const rawType = mainEvent?.type || activityType;
const isMatch = activityType === "match";
const isTraining = activityType === "training";
const isRecommendable = isMatch || isTraining;
const scheduleLabel = mainEvent?.title || scheduleEventTypes[rawType]?.label || "No team event";
const activityLabel = isMatch ? "Match" : isTraining ? "Training" : "No team activity";
return {
date: cleanDate,
type: isRecommendable ? activityType : "none",
rawType,
mainEvent,
scheduleLabel,
isRecommendable,
activityLabel,
availabilityLabel: isRecommendable ? `${activityLabel} Availability` : "No Team Activity",
recommendationLabel: isRecommendable ? `${activityLabel} Recommendation` : "No Team Recommendation",
quickLabel: isRecommendable ? `Quick ${activityLabel.toLowerCase()} recommendation` : "Locked",
blockReason: isRecommendable ? "" : "No scheduled training or match for this date.",
};
}
function getMedicalRecordStatus(record) {
if (!record) {
return {
key: "not-set",
label: "Not set",
tone: "unset",
defaultParticipation: null,
};
}
return getMedicalStatusOptionForDate(record.status, record.date, record.rtpPhase);
}
function getDefaultMedicalInjuryPlanDraft(playerId = medicalState?.selectedPlayerId || "") {
return {
planId: "",
playerId: String(playerId ?? "").trim(),
injuryType: "",
bodyArea: "",
startDate: isMedicalDateValue(medicalState?.selectedDate) ? medicalState.selectedDate : formatScheduleDateValue(new Date()),
duration: 4,
durationUnit: "weeks",
status: "unavailable",
rtpPhase: "medical-restriction",
participation: 0,
reviewDate: "",
phase: "",
comment: "",
coachNote: "",
shareWithCoach: false,
};
}
function normalizeMedicalInjuryPlanDraft(draft = {}, playerId = draft.playerId) {
const defaults = getDefaultMedicalInjuryPlanDraft(playerId);
const draftPlayerId = String(draft.playerId ?? defaults.playerId).trim() || defaults.playerId;
const rtpPhase = getMedicalRtpPhaseOption(draft.rtpPhase || defaults.rtpPhase);
const status = medicalInjuryPlanStatusOptions.some((option) => option.key === draft.status)
? draft.status
: rtpPhase.status;
const durationUnit = ["days", "weeks", "months"].includes(draft.durationUnit) ? draft.durationUnit : defaults.durationUnit;
return {
...defaults,
planId: String(draft.planId ?? draft.id ?? defaults.planId).trim(),
playerId: draftPlayerId,
injuryType: String(draft.injuryType ?? defaults.injuryType).trim(),
bodyArea: String(draft.bodyArea ?? defaults.bodyArea).trim(),
startDate: isMedicalDateValue(draft.startDate) ? draft.startDate : defaults.startDate,
duration: Math.max(1, Number(draft.duration) || defaults.duration),
durationUnit,
status,
rtpPhase: rtpPhase.key,
participation: normalizeMedicalParticipation(draft.participation, rtpPhase.participation),
reviewDate: isMedicalDateValue(draft.reviewDate) ? draft.reviewDate : "",
phase: String(draft.phase ?? defaults.phase).trim(),
comment: String(draft.comment ?? defaults.comment).trim(),
coachNote: String(draft.coachNote ?? defaults.coachNote).trim(),
shareWithCoach: normalizeMedicalShareValue(draft.shareWithCoach),
};
}
function getMedicalInjuryPlanDraft(playerId = medicalState?.selectedPlayerId || "") {
const draftPlayerId = String(playerId ?? "").trim();
const draft = normalizeMedicalInjuryPlanDraft(
medicalInjuryPlanDraftsByPlayerId.get(draftPlayerId) ?? { playerId: draftPlayerId },
draftPlayerId
);
if (draftPlayerId) {
medicalInjuryPlanDraftsByPlayerId.set(draftPlayerId, draft);
}
return draft;
}
function setMedicalInjuryPlanDraft(playerId, values = {}) {
const draftPlayerId = String(playerId ?? values.playerId ?? "").trim();
if (!draftPlayerId) {
return null;
}
const draft = normalizeMedicalInjuryPlanDraft({ ...values, playerId: draftPlayerId }, draftPlayerId);
medicalInjuryPlanDraftsByPlayerId.set(draftPlayerId, draft);
return draft;
}
function setMedicalInjuryPlanDraftFromPlan(plan) {
if (!plan?.playerId) {
return null;
}
return setMedicalInjuryPlanDraft(plan.playerId, {
...plan,
planId: plan.id,
});
}
function clearMedicalInjuryPlanDraft(playerId) {
const draftPlayerId = String(playerId ?? "").trim();
if (draftPlayerId) {
medicalInjuryPlanDraftsByPlayerId.delete(draftPlayerId);
}
}
function getMedicalInjuryPlanFormDraft(form) {
if (!form) {
return null;
}
const values = getPlatformFormValues(form);
return {
...values,
playerId: values.playerId || form.querySelector("[name='playerId']")?.value || medicalState?.selectedPlayerId || "",
shareWithCoach: Boolean(form.querySelector("[name='shareWithCoach']")?.checked),
};
}
function persistMedicalInjuryPlanDraftFromForm(form) {
const draft = getMedicalInjuryPlanFormDraft(form);
if (!draft) {
return null;
}
return setMedicalInjuryPlanDraft(draft.playerId, draft);
}
function getMedicalDailyStats(dateValue = medicalState?.selectedDate) {
return medicalCommandSelectors.getMedicalDailyStats(dateValue);
}
function getMedicalWindowAverage() {
return medicalCommandSelectors.getMedicalWindowAverage();
}
function getMedicalParticipationAverageForDates(dateValues = []) {
return medicalCommandSelectors.getMedicalParticipationAverageForDates(dateValues);
}
function getMedicalMonthAverageStats() {
return medicalCommandSelectors.getMedicalMonthAverageStats();
}
function getMedicalAttentionPlayers(dateValue = medicalState?.selectedDate) {
return medicalCommandSelectors.getMedicalAttentionPlayers(dateValue);
}
function getMedicalPositionSummaries(dateValue = medicalState?.selectedDate) {
return medicalCommandSelectors.getMedicalPositionSummaries(dateValue);
}
function getMedicalDaySpan(startDateValue, endDateValue) {
if (!isMedicalDateValue(startDateValue) || !isMedicalDateValue(endDateValue)) {
return null;
}
const dayMs = 24 * 60 * 60 * 1000;
return Math.max(1, Math.round((parseScheduleDateValue(endDateValue) - parseScheduleDateValue(startDateValue)) / dayMs) + 1);
}
function getMedicalDailyHuddle(dateValue = medicalState?.selectedDate) {
return medicalCommandSelectors.getMedicalDailyHuddle(dateValue);
}
function getMedicalCoachHandoverItems(dateValue = medicalState?.selectedDate) {
return medicalCommandSelectors.getMedicalCoachHandoverItems(dateValue);
}
function buildMedicalCoachHandoverText(dateValue = medicalState?.selectedDate) {
return medicalCommandSelectors.buildMedicalCoachHandoverText(dateValue);
}
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
function getMedicalPlayerProfileSummary(player, dateValue = medicalState?.selectedDate) {
return medicalProfileSummarySelectors.getMedicalPlayerProfileSummary(player, dateValue);
}
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
function getMedicalBulkRecommendationEligiblePlayers(players = getFilteredMedicalPlayers()) {
return players.filter((player) => !isMedicalPlayerBlockedBySquadAvailability(player));
}
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
function normalizeMedicalOperationsTab(tabKey) {
return medicalOperationsTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "availability";
}
function normalizeMedicalPlayerModalTab(tabKey) {
return medicalPlayerModalTabOptions.some((tab) => tab.key === tabKey) ? tabKey : "availability";
}
function getMedicalPlanTotalDays(plan) {
return medicalPlanSelectors.getMedicalPlanTotalDays(plan);
}
function getMedicalPlanElapsedDays(plan, dateValue = medicalState?.selectedDate) {
return medicalPlanSelectors.getMedicalPlanElapsedDays(plan, dateValue);
}
function getMedicalPlanDaysRemaining(plan, dateValue = medicalState?.selectedDate) {
return medicalPlanSelectors.getMedicalPlanDaysRemaining(plan, dateValue);
}
function getMedicalPlanSeverity(plan) {
return medicalPlanSelectors.getMedicalPlanSeverity(plan);
}
function getMedicalPlanClearanceSummary(plan) {
return medicalPlanSelectors.getMedicalPlanClearanceSummary(plan);
}
function getMedicalPlanReviewState(plan, dateValue = medicalState?.selectedDate) {
return medicalPlanSelectors.getMedicalPlanReviewState(plan, dateValue);
}
function getMedicalTrailingRecommendationSummary(playerId, dateValue = medicalState?.selectedDate) {
return medicalPlanSelectors.getMedicalTrailingRecommendationSummary(playerId, dateValue);
}
function getMedicalSeasonPlans(dateValue = medicalState?.selectedDate) {
return medicalOperationsSelectors.getMedicalSeasonPlans(dateValue);
}
function getMedicalActiveCaseItems(dateValue = medicalState?.selectedDate) {
return medicalOperationsSelectors.getMedicalActiveCaseItems(dateValue);
}
function getMedicalHistoryEvents(limit = 40) {
return medicalOperationsSelectors.getMedicalHistoryEvents(limit);
}
function getMedicalSeasonSummary(dateValue = medicalState?.selectedDate) {
return medicalOperationsSelectors.getMedicalSeasonSummary(dateValue);
}
function getMedicalPlayerRiskSignal(player, dateValue = medicalState?.selectedDate) {
return medicalOperationsSelectors.getMedicalPlayerRiskSignal(player, dateValue);
}
function getMedicalRiskSignals(dateValue = medicalState?.selectedDate) {
return medicalOperationsSelectors.getMedicalRiskSignals(dateValue);
}
function getMedicalOperationsSummary(dateValue = medicalState?.selectedDate) {
return medicalOperationsSelectors.getMedicalOperationsSummary(dateValue);
}
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
function getMedicalRosterPositionGroups(players = []) {
return medicalRosterSelectors.getMedicalRosterPositionGroups(players);
}
function getMedicalRosterPositionStats(players = []) {
return medicalRosterSelectors.getMedicalRosterPositionStats(players);
}
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
function addCalendarDays(date, days) {
const nextDate = new Date(date);
nextDate.setDate(nextDate.getDate() + days);
return nextDate;
}
function getPeriodizationDayScheduleLabel(day) {
return periodizationRenderer.getDayScheduleLabel(day);
}
function getPeriodizationMatchDayLabel(value) {
return periodizationRenderer.getMatchDayLabel(value);
}
function getPeriodizationMultiFieldValue(field, dateValue) {
return periodizationRenderer.getMultiFieldValue(field, dateValue);
}
function getPeriodizationCustomFieldValue(field, dateValue) {
return periodizationRenderer.getCustomFieldValue(field, dateValue);
}
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
function renderSessionPlannerPeriodizationSummary(dateValue) {
return sessionPlannerPeriodizationBridge.renderSummary(dateValue);
}
function renderSessionPlannerPeriodizationOverlay() {
return sessionPlannerPeriodizationBridge.renderOverlay();
}
function refreshPeriodizationBoardMultiField(key) {
if (!periodizationState?.selectedDate || !ui.periodizationBoard) {
return;
}
const field = ui.periodizationBoard.querySelector(`[data-periodization-multi-field="${key}"]`);
const html = periodizationRenderer.renderMultiFieldForDate(key, periodizationState.selectedDate);
if (!field || !html) {
return;
}
field.outerHTML = html;
}
function refreshPeriodizationBoardMultiFields(keys = []) {
Array.from(new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))).forEach((key) => {
refreshPeriodizationBoardMultiField(key);
});
}
function refreshPeriodizationBoardDependentFields(changedKey = "") {
if (changedKey === "matchPhases") {
refreshPeriodizationBoardMultiFields(["subPhases", "teamPrinciples", "miniGamePrinciples"]);
return;
}
if (changedKey === "subPhases") {
refreshPeriodizationBoardMultiFields(["teamPrinciples", "miniGamePrinciples"]);
}
}
function renderPeriodizationWorkspace() {
if (
!ui.periodizationShell ||
!ui.periodizationHeading ||
!ui.periodizationBoard
) {
return;
}
const wasPeriodizationOverlayOpen = periodizationDayOverlayOpen;
const previousPeriodizationOverlayScrollTop = wasPeriodizationOverlayOpen
? ui.periodizationBoard.querySelector(".periodization-day-overlay .periodization-day-panel")?.scrollTop ?? 0
: 0;
if (!canEditPeriodizationWorkspace() && periodizationDayOverlayMode === "edit") {
periodizationDayOverlayMode = "view";
}
const rendered = periodizationRenderer.renderWorkspace(periodizationState, {
overlayOpen: periodizationDayOverlayOpen,
overlayMode: periodizationDayOverlayMode,
});
ui.periodizationShell.classList.add("is-coach-board");
ui.periodizationHeading.textContent = `${rendered.selectedMonthName} ${rendered.selectedYear}`;
if (ui.periodizationMonthSelect) {
ui.periodizationMonthSelect.value = String(rendered.selectedMonthIndex);
}
if (ui.periodizationWindowLabel) {
ui.periodizationWindowLabel.textContent = `${rendered.selectedMonthName} ${rendered.selectedYear}`;
}
if (ui.periodizationPrevMonthButton) {
ui.periodizationPrevMonthButton.disabled = rendered.prevDisabled;
}
if (ui.periodizationNextMonthButton) {
ui.periodizationNextMonthButton.disabled = rendered.nextDisabled;
}
ui.periodizationBoard.innerHTML = rendered.bodyHtml;
if (wasPeriodizationOverlayOpen && periodizationDayOverlayOpen) {
const overlayPanel = ui.periodizationBoard.querySelector(".periodization-day-overlay .periodization-day-panel");
if (overlayPanel && Number.isFinite(previousPeriodizationOverlayScrollTop)) {
overlayPanel.scrollTop = previousPeriodizationOverlayScrollTop;
}
}
}
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
function isPitchFullscreenActive() { return gameSimulatorFullscreenController?.isActive() ?? false; }
function syncPitchFullscreenButton() {
gameSimulatorFullscreenController?.syncButton();
}
function updatePitchFullscreenHudLayout() { gameSimulatorFullscreenController?.updateHudLayout(); }
async function togglePitchFullscreen() {
await ensureGameSimulatorControllers();
await gameSimulatorFullscreenController?.toggle();
}
function hasUnsavedSimulatorWork() {
return Boolean(
state.simulatorDirty ||
state.sequence.dirty ||
state.draftStep ||
state.actionMode !== null ||
(hasBallAction() && !state.sequence.isPlaying)
);
}
function resetUnsavedSimulatorSession() {
cancelAutoPilotContinuation();
cancelSequenceAdvance();
if (document.fullscreenElement === ui.pitchStage) {
document.exitFullscreen().catch(() => {});
}
if (state.autoPilotPlay) {
state.autoPilotPlay.active = false;
state.autoPilotPlay.possessionPlan = null;
state.autoPilotPlay.receiveMomentum = null;
}
state.isRunning = false;
state.drag = null;
state.actionMode = null;
state.keyboardActionMode = null;
state.keyboardActionGraceMode = null;
state.keyboardActionGraceUntil = 0;
state.goalFlash = null;
state.sequence.isPlaying = false;
state.sequence.playbackIndex = -1;
state.sequence.currentFrameIndex = -1;
state.sequence.phase = null;
state.sequence.transition = null;
state.sequence.actionTargets = null;
state.sequence.initialSnapshot = null;
state.sequence.steps = [];
state.sequence.dirty = false;
state.example = null;
state.scenario = { ...defaultScenarioInfo };
state.draftStep = null;
state.activeActionTargets = null;
clearBallAction();
applyKickoffSetup(state, {
teamId: defaultKickoffTeamId,
resetFormations: true,
});
state.time = 0;
state.simulatorDirty = false;
ui.playPauseButton.textContent = "Start";
updateModeButtons();
syncDefensiveAutopilotButton();
syncOffensiveAutopilotButton();
syncAutoV2DebugButton();
updateSequenceButtons();
logEvent("Unsaved simulator session closed. New simulator session starts with a kick-off.");
}
function isSimulatorIntroActive() {
return gameSimulatorWorkspaceController?.isIntroActive() ??
Boolean(isGameSimulatorWorkspaceActive() && ui.gameSimulatorWorkspace?.classList.contains("is-simulator-intro"));
}
function resetGameSimulatorIntro() {
if (gameSimulatorWorkspaceController) return gameSimulatorWorkspaceController.resetIntro();
ui.gameSimulatorWorkspace?.classList.add("is-simulator-intro");
ui.gameSimulatorWorkspace?.classList.remove("is-simulator-launched");
}
function syncGameSimulatorIntroState() {
if (gameSimulatorWorkspaceController) return gameSimulatorWorkspaceController.syncIntroState();
const workspace = ui.gameSimulatorWorkspace;
if (isGameSimulatorWorkspaceActive() && workspace && !workspace.classList.contains("is-simulator-launched")) {
workspace.classList.add("is-simulator-intro");
}
}
async function launchGameSimulatorFromIntro() {
await ensureGameSimulatorControllers();
await gameSimulatorWorkspaceController?.launchFromIntro();
}
function pauseSimulatorForWorkspaceSwitch() {
const shouldResetUnsavedSession = hasUnsavedSimulatorWork();
cancelAutoPilotContinuation();
if (state.autoPilotPlay) {
state.autoPilotPlay.active = false;
}
if (state.sequence.isPlaying) {
stopSequencePlayback(false);
}
if (state.isRunning) {
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
}
if (state.keyboardActionMode !== null) {
setKeyboardActionMode(null);
}
if (shouldResetUnsavedSession) {
resetUnsavedSimulatorSession();
}
if (document.fullscreenElement === ui.pitchStage) {
document.exitFullscreen?.().catch(() => {});
}
}
function hydrateWorkspaceModuleState(workspaceId = hubState?.activeWorkspaceId) {
const viewId = getWorkspaceViewId(workspaceId || workspaceHubDefaultActiveWorkspaceId);
if (viewId === "schedule") {
if (!scheduleState) {
scheduleState = readScheduleState();
}
return;
}
if (viewId === "periodization") {
if (!periodizationState) {
periodizationState = readPeriodizationState();
}
if (!scheduleState) {
scheduleState = readScheduleState();
}
return;
}
if (viewId === "session-planner") {
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
return;
}
if (viewId === "medical-team") {
if (!medicalState) {
medicalState = readMedicalState();
}
if (!playerProfilesState) {
playerProfilesState = readPlayerProfilesState();
}
return;
}
if (viewId === "player-profiles") {
if (!playerProfilesState) {
playerProfilesState = readPlayerProfilesState();
}
if (!medicalState) {
medicalState = readMedicalState();
}
return;
}
if (viewId === "scouting") {
ensureScoutingState();
return;
}
if (viewId === "transfer-room") {
syncTransferRoomLinkedState();
return;
}
}
function queueWorkspaceModulePreload(workspaceId = "") {
const safeWorkspaceId = getSafeWorkspaceId(workspaceId, hubState) || workspaceId;
const viewId = getWorkspaceViewId(safeWorkspaceId || workspaceHubDefaultActiveWorkspaceId);
if (viewId === "game-simulator") {
queueGameSimulatorControllersLoad();
}
if (viewId === "analysis-room" || viewId === "scouting") {
loadScoutingWorkspaceModule();
}
if (viewId === "transfer-room") {
loadTransferRoomWorkspaceModule();
}
}
function preloadWorkspaceFromTrigger(trigger) {
const workspaceId = trigger?.dataset?.openWorkspace || "";
if (!workspaceId) {
return;
}
if (getWorkspaceViewId(getSafeWorkspaceId(workspaceId, hubState) || workspaceId) === "scouting") {
win.clearTimeout(scoutingMenuPreloadTimer);
scoutingMenuPreloadTimer = win.setTimeout(() => queueWorkspaceModulePreload(workspaceId), 180);
return;
}
queueWorkspaceModulePreload(workspaceId);
}
function renderWorkspaceChrome() {
if (!hubState) {
return;
}
const currentUser = syncPlatformUserFromAuth();
hubState = repairWorkspaceState(hubState);
const workspacePool =
Array.isArray(hubState.workspaces) && hubState.workspaces.length
? hubState.workspaces
: defaultHubState.workspaces;
const accessibleWorkspacePool = getAccessibleWorkspacePool();
const activeWorkspace =
getWorkspaceById(hubState.activeWorkspaceId) ??
accessibleWorkspacePool[0] ??
workspacePool[0];
if (activeWorkspace && hubState.activeWorkspaceId !== activeWorkspace.id) {
hubState.activeWorkspaceId = activeWorkspace.id;
}
const activeViewId = getWorkspaceViewId(activeWorkspace.id);
hydrateWorkspaceModuleState(activeWorkspace.id);
syncPlatformAutosaveStatusVisibility(activeWorkspace.id);
document.body.dataset.appReady = "true";
document.body.dataset.activeWorkspace = activeWorkspace.id;
document.body.dataset.userRole = String(currentUser?.role || "guest").trim().toLowerCase() || "guest";
ui.hubShell?.classList.toggle("is-sidebar-collapsed", hubState.sidebarCollapsed);
if (ui.workspaceTitle) {
ui.workspaceTitle.textContent = activeWorkspace.title || "Football Science";
}
if (ui.workspaceMeta) {
ui.workspaceMeta.textContent = "";
}
if (ui.workspaceStatus) {
ui.workspaceStatus.textContent = activeWorkspace.status;
}
if (ui.coachName) {
ui.coachName.textContent = currentUser ? formatUserName(currentUser) : hubState.profile.name;
}
if (ui.coachRole) {
ui.coachRole.textContent = currentUser?.title ?? hubState.profile.role;
}
applyUserAvatar(ui.coachAvatar, currentUser);
ui.profileMenuButton?.classList.toggle("is-active", activeWorkspace.id === "my-profile");
syncAccountMenu(currentUser);
if (ui.dashboardDate) {
ui.dashboardDate.textContent = getDashboardDateLabel();
}
if (ui.dashboardGreeting) {
ui.dashboardGreeting.textContent = `Welcome back, ${currentUser?.firstName ?? hubState.profile.shortName}.`;
}
if (activeWorkspace.id === "home") {
markDashboardHomeSeenForCurrentUser();
} else {
closeDashboardModal(false);
}
platformNavigationController.renderWorkspaceList();
platformNavigationController.renderTopIconMenu();
platformNavigationController.renderWorkspaceQuickSwitch(activeWorkspace.id);
if (activeWorkspace.id === "home") {
renderDashboardCards();
}
renderDashboardChatWidget();
syncDashboardChatWidgetNotificationCursor();
document
.querySelectorAll(".workspace-view")
.forEach((view) => view.classList.toggle("is-active", view.dataset.workspaceView === activeViewId));
document
.querySelectorAll("[data-open-workspace]")
.forEach((trigger) => trigger.classList.toggle("is-active", trigger.dataset.openWorkspace === activeWorkspace.id));
if (activeViewId === "placeholder") {
platformNavigationController.renderPlaceholderWorkspace();
}
if (activeViewId === "profile") {
renderProfileWorkspace();
}
if (activeViewId === "staff") {
renderStaffWorkspace();
}
if (activeViewId === "admin") {
renderAdminWorkspace();
}
if (activeViewId === "medical-team") {
renderMedicalTeamWorkspace();
}
if (activeViewId === "player-profiles") {
renderPlayerProfilesWorkspace();
}
if (activeViewId === "scouting") {
renderScoutingWorkspace();
}
if (activeViewId === "gameplan") {
renderGameplanWorkspace();
}
if (activeViewId === "transfer-room") {
renderTransferRoomWorkspace();
}
if (activeViewId === "analysis-room") {
renderAnalysisRoomWorkspace();
}
if (activeViewId === "schedule") {
renderScheduleWorkspace();
}
if (activeViewId === "periodization") {
renderPeriodizationWorkspace();
}
if (activeViewId === "session-planner") {
renderSessionPlannerWorkspace();
}
if (activeViewId === "game-simulator") {
syncGameSimulatorIntroState();
if (ui.gameSimulatorWorkspace?.classList.contains("is-simulator-launched")) {
render();
}
startSimulatorAnimationLoop();
} else {
stopSimulatorAnimationLoop();
}
}
function setActiveWorkspace(workspaceId) {
const resolvedWorkspaceId = getSafeWorkspaceId(workspaceId);
const workspace = getWorkspaceById(resolvedWorkspaceId ?? "home");
if (!workspace) {
return;
}
const previousWorkspaceId = hubState?.activeWorkspaceId;
const targetWorkspaceId = workspace.id;
if (previousWorkspaceId === "game-simulator" && targetWorkspaceId !== "game-simulator") {
pauseSimulatorForWorkspaceSwitch();
stopSimulatorAnimationLoop();
}
if (previousWorkspaceId === "player-profiles" && targetWorkspaceId !== "player-profiles") {
playerProfileModalOpen = false;
playerProfileNewPlayerModalOpen = false;
}
if (targetWorkspaceId === "game-simulator") {
resetGameSimulatorIntro();
}
const targetViewId = getWorkspaceViewId(targetWorkspaceId);
if (targetViewId && targetViewId !== "scouting") {
queueWorkspaceModulePreload(targetWorkspaceId);
}
hubState.activeWorkspaceId = targetWorkspaceId;
rememberActiveWorkspaceId(targetWorkspaceId);
writeWorkspaceHubState();
renderWorkspaceChrome();
}
function initializeWorkspaceHub() {
startPlatformThemeScheduler();
syncPlatformUserFromAuth();
hubState = repairWorkspaceState(readWorkspaceHubState());
const urlWorkspaceId = getWorkspaceIdFromUrl();
const safeUrlWorkspaceId = getSafeWorkspaceId(urlWorkspaceId, hubState);
const pendingWorkspaceId = win.__pendingWorkspaceId;
const safePendingWorkspaceId = getSafeWorkspaceId(pendingWorkspaceId, hubState);
const rememberedWorkspaceId = readRememberedWorkspaceId();
const safeRememberedWorkspaceId = getSafeWorkspaceId(rememberedWorkspaceId, hubState);
const safeHomeWorkspaceId = getSafeWorkspaceId(workspaceHubDefaultActiveWorkspaceId, hubState);
if (safePendingWorkspaceId) {
hubState.activeWorkspaceId = safePendingWorkspaceId;
} else if (safeUrlWorkspaceId) {
hubState.activeWorkspaceId = safeUrlWorkspaceId;
} else if (safeRememberedWorkspaceId) {
hubState.activeWorkspaceId = safeRememberedWorkspaceId;
} else if (safeHomeWorkspaceId) {
hubState.activeWorkspaceId = safeHomeWorkspaceId;
}
rememberActiveWorkspaceId(hubState.activeWorkspaceId);
win.__pendingWorkspaceId = null;
hydrateWorkspaceModuleState(hubState.activeWorkspaceId);
writeWorkspaceHubState();
renderWorkspaceChrome();
queueDashboardChatStylesheetLoad();
queueCriticalWorkspacePreloads();
scheduleDashboardLoginPopups();
}
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
state.savedSequences = readSavedSequenceLibrary();
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
sessionPlannerLibraryOpen ||
sessionPlannerPendingLibrarySave ||
sessionPlannerVisualPreviewOpen ||
sessionPlannerPrintOverlayOpen ||
sessionPlannerTacticalboardOpen ||
sessionPlannerPlayerBoardOpen ||
sessionPlannerPlayerBoardSelectedPlayerId ||
sessionPlannerTacticalDragState ||
sessionPlannerTacticalSelectionState ||
sessionPlannerPlayerBoardSelectionState ||
sessionPlannerPlayerBoardDragState
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
function canEditScenario() {
return canEditGameSimulatorWorkspace() && !state.isRunning && !state.sequence.isPlaying;
}
function applyTeamFormation(teamId, formation) {
teams[teamId].formation = formation;
setTeamFormationOnPlayers(state.players, teamId, formation);
applyPhysicalProfileToPlayers(state.players, state.physicalProfile);
if (state.ball.ownerPlayerId && teamRosterOrder[teamId].includes(state.ball.ownerPlayerId) && !hasBallAction()) {
const owner = getBallOwner();
if (owner) {
const controlPoint = getPlayerBallControlPoint(owner);
state.ball.position = cloneVector(controlPoint);
state.ball.startPosition = cloneVector(controlPoint);
state.ball.target = cloneVector(controlPoint);
}
}
}
function getScaleX() {
return canvas.width / pitch.length;
}
function getScaleY() {
return canvas.height / pitch.width;
}
function getMetersToPixels() {
return getScaleX();
}
function toCanvas(point) {
return {
x: point.x * getScaleX(),
y: point.y * getScaleY(),
};
}
function eventToPitch(event) {
const rect = canvas.getBoundingClientRect();
return clampToPitch(
vec(
((event.clientX - rect.left) / rect.width) * pitch.length,
((event.clientY - rect.top) / rect.height) * pitch.width
),
0
);
}
function logEvent(message) {
if (state.eventLog[state.eventLog.length - 1] !== message) {
state.eventLog.push(message);
if (state.eventLog.length > 18) {
state.eventLog = state.eventLog.slice(-18);
}
}
}
function getPlayerById(playerId) {
return state.players.find((player) => player.id === playerId) ?? null;
}
function normalizeSelectedPlayerIds(playerIds = [], fallbackId = null) {
const seen = new Set();
const normalized = [];
playerIds.forEach((playerId) => {
if (!playerId || seen.has(playerId) || !getPlayerById(playerId)) {
return;
}
seen.add(playerId);
normalized.push(playerId);
});
if (!normalized.length && fallbackId && getPlayerById(fallbackId)) {
normalized.push(fallbackId);
}
return normalized;
}
function getSelectedPlayerIds() {
return normalizeSelectedPlayerIds(state.selectedPlayerIds, state.selectedPlayerId);
}
function setSelectedPlayers(playerIds, primaryId = null) {
const normalized = normalizeSelectedPlayerIds(playerIds, primaryId ?? state.selectedPlayerId);
const nextPrimary =
(primaryId && normalized.includes(primaryId) ? primaryId : null) ??
normalized[0] ??
null;
state.selectedPlayerIds = normalized;
state.selectedPlayerId = nextPrimary;
}
function setSingleSelectedPlayer(playerId) {
setSelectedPlayers([playerId], playerId);
}
function clearSelectedPlayers() {
state.selectedPlayerIds = [];
state.selectedPlayerId = null;
}
function toggleSelectedPlayer(playerId) {
const selectedIds = getSelectedPlayerIds();
if (selectedIds.includes(playerId)) {
if (selectedIds.length === 1) {
setSingleSelectedPlayer(playerId);
return;
}
const nextIds = selectedIds.filter((id) => id !== playerId);
const nextPrimary = state.selectedPlayerId === playerId ? nextIds[0] : state.selectedPlayerId;
setSelectedPlayers(nextIds, nextPrimary);
return;
}
setSelectedPlayers([...selectedIds, playerId], state.selectedPlayerId ?? playerId);
}
function isPlayerSelected(playerId) {
return getSelectedPlayerIds().includes(playerId);
}
function getSelectionPreviewIds() {
if (state.drag?.type === "selection" && state.drag.moved && Array.isArray(state.drag.previewSelectedPlayerIds)) {
return state.drag.previewSelectedPlayerIds;
}
return null;
}
function getRenderedSelectedPlayerIds() {
return getSelectionPreviewIds() ?? getSelectedPlayerIds();
}
function isPlayerRenderedSelected(playerId) {
return getRenderedSelectedPlayerIds().includes(playerId);
}
function getRenderedPrimarySelectedPlayerId() {
if (state.drag?.type === "selection" && state.drag.moved && state.drag.previewPrimaryPlayerId) {
return state.drag.previewPrimaryPlayerId;
}
return state.selectedPlayerId;
}
function isSelectionModifierActive(event) {
return event.shiftKey || event.metaKey || event.ctrlKey;
}
function getSelectedPlayer() {
return getPlayerById(state.selectedPlayerId) ?? getPlayerById(getSelectedPlayerIds()[0]) ?? null;
}
function getBallOwner() {
return getPlayerById(state.ball.ownerPlayerId);
}
function cloneTeamIdentity(identity) {
return {
attackStyle: identity?.attackStyle ?? "balanced",
defenseStyle: identity?.defenseStyle ?? "balanced-block",
};
}
function cloneTeamIdentities() {
return {
home: cloneTeamIdentity(teams.home.identity),
away: cloneTeamIdentity(teams.away.identity),
};
}
function cloneRestartPhase(restartPhase) {
if (!restartPhase) {
return null;
}
return {
type: restartPhase.type ?? null,
teamId: restartPhase.teamId ?? null,
label: restartPhase.label ?? null,
sideY: Number.isFinite(restartPhase.sideY) ? restartPhase.sideY : null,
point: restartPhase.point ? cloneVector(restartPhase.point) : null,
supportPlayerId: restartPhase.supportPlayerId ?? null,
openingKey: restartPhase.openingKey ?? null,
openingLabel: restartPhase.openingLabel ?? null,
};
}
function applyTeamIdentities(identitySnapshot = {}) {
["home", "away"].forEach((teamId) => {
const incoming = identitySnapshot[teamId] ?? teams[teamId].identity ?? {};
const defaults = defaultTeamIdentities[teamId] ?? {};
teams[teamId].identity = {
attackStyle: incoming.attackStyle ?? defaults.attackStyle ?? "balanced",
defenseStyle: incoming.defenseStyle ?? defaults.defenseStyle ?? "balanced-block",
};
});
}
function resetTeamIdentities() {
applyTeamIdentities(defaultTeamIdentities);
}
function getTeamAttackStyleKey(teamId) {
return teams[teamId]?.identity?.attackStyle ?? defaultTeamIdentities[teamId]?.attackStyle ?? "balanced";
}
function getTeamDefenseStyleKey(teamId) {
return teams[teamId]?.identity?.defenseStyle ?? defaultTeamIdentities[teamId]?.defenseStyle ?? "balanced-block";
}
function getTeamAttackStyleProfile(teamId) {
const styleKey = getTeamAttackStyleKey(teamId);
return attackStylePresets[styleKey] ?? attackStylePresets.balanced;
}
function getTeamDefenseStyleProfile(teamId) {
const styleKey = getTeamDefenseStyleKey(teamId);
return defenseStylePresets[styleKey] ?? defenseStylePresets["balanced-block"];
}
function getPlayerPressureLoad(player, referencePoint = player.position) {
const opponents = state.players.filter((candidate) => candidate.team !== player.team);
let pressure = 0;
opponents.forEach((opponent) => {
const gap = distance(referencePoint, opponent.position);
if (gap > 14) {
return;
}
const zoneWeight = gap <= 4 ? 1 : gap <= 8 ? 0.72 : 0.38;
pressure += (1 - gap / 14) * zoneWeight;
});
return clamp(pressure / 1.8, 0, 1);
}
function getNearestOpponentGap(player, referencePoint = player.position) {
if (!player || !referencePoint) {
return Infinity;
}
return state.players.reduce((nearestGap, candidate) => {
if (candidate.team === player.team) {
return nearestGap;
}
return Math.min(nearestGap, distance(referencePoint, candidate.position));
}, Infinity);
}
function getPlayerDecisionContext(player) {
const intelligenceProfile = player.intelligenceProfile ?? buildPlayerIntelligenceProfile(player);
const sprintProfile = player.sprintProfile ?? buildPlayerSprintProfile(player);
const pressure = getPlayerPressureLoad(player);
const anticipationReduction =
player.reactionTime * (0.06 + intelligenceProfile.decisionSpeed * 0.1);
const perceptionReduction =
player.reactionTime * (0.02 + intelligenceProfile.perception * 0.05);
const tacticalReduction =
hasBallAction()
? player.reactionTime * 0.03 * intelligenceProfile.tacticalDiscipline
: 0;
const pressurePenalty =
player.reactionTime *
pressure *
(0.05 + (1 - intelligenceProfile.composure) * 0.16);
const effectiveReactionTime = clamp(
player.reactionTime - anticipationReduction - perceptionReduction - tacticalReduction + pressurePenalty,
0.08,
player.reactionTime + 0.08
);
const effectiveAcceleration = Math.max(
0.01,
player.acceleration *
sprintProfile.accelerationFactor *
(1 - pressure * (0.02 + (1 - intelligenceProfile.pressResistance) * 0.08))
);
const effectiveMaxSpeed = Math.max(
0.01,
player.maxSpeed *
sprintProfile.maxSpeedFactor *
(1 - pressure * (0.015 + (1 - intelligenceProfile.composure) * 0.05))
);
return {
pressure,
profile: intelligenceProfile,
sprintProfile,
reactionTime: effectiveReactionTime,
acceleration: effectiveAcceleration,
maxSpeed: effectiveMaxSpeed,
};
}
var gameSimulatorSequenceEngine;
function invokeGameSimulatorSequenceEngine(methodName, args) {
if (!gameSimulatorSequenceEngine?.[methodName]) {
throw new Error(`Game simulator sequence engine is not ready: ${methodName}`);
}
return gameSimulatorSequenceEngine[methodName](...args);
}
function captureSnapshot(...args) {
return invokeGameSimulatorSequenceEngine("captureSnapshot", args);
}
function applySnapshot(...args) {
return invokeGameSimulatorSequenceEngine("applySnapshot", args);
}
function cloneSnapshot(...args) {
return invokeGameSimulatorSequenceEngine("cloneSnapshot", args);
}
function cloneSequenceStep(...args) {
return invokeGameSimulatorSequenceEngine("cloneSequenceStep", args);
}
function buildSnapshotFromFormations(...args) {
return invokeGameSimulatorSequenceEngine("buildSnapshotFromFormations", args);
}
function withSnapshotOverrides(...args) {
return invokeGameSimulatorSequenceEngine("withSnapshotOverrides", args);
}
function createLowBlockPressExample(...args) {
return invokeGameSimulatorSequenceEngine("createLowBlockPressExample", args);
}
function loadLowBlockPressExample(...args) {
return invokeGameSimulatorSequenceEngine("loadLowBlockPressExample", args);
}
function cloneScenarioInfo(...args) {
return invokeGameSimulatorSequenceEngine("cloneScenarioInfo", args);
}
function markSimulatorDirty(...args) {
return invokeGameSimulatorSequenceEngine("markSimulatorDirty", args);
}
function markSequenceDirty(...args) {
return invokeGameSimulatorSequenceEngine("markSequenceDirty", args);
}
function markSimulatorSaved(...args) {
return invokeGameSimulatorSequenceEngine("markSimulatorSaved", args);
}
function readSavedSequenceLibrary(...args) {
if (!gameSimulatorSequenceEngine?.readSavedSequenceLibrary) {
try {
const raw = win.localStorage.getItem(sequenceLibraryStorageKey);
if (!raw) {
return [];
}
const parsed = JSON.parse(raw);
if (!Array.isArray(parsed)) {
return [];
}
return parsed
.filter((entry) => entry && entry.id && entry.name && entry.sequence?.steps)
.sort((a, b) => new Date(b.savedAt ?? 0) - new Date(a.savedAt ?? 0));
} catch {
return [];
}
}
return invokeGameSimulatorSequenceEngine("readSavedSequenceLibrary", args);
}
function writeSavedSequenceLibrary(...args) {
return invokeGameSimulatorSequenceEngine("writeSavedSequenceLibrary", args);
}
function sanitizeFileName(...args) {
return invokeGameSimulatorSequenceEngine("sanitizeFileName", args);
}
function goToSequenceFrame(...args) {
return invokeGameSimulatorSequenceEngine("goToSequenceFrame", args);
}
function cancelSequenceAdvance(...args) {
return invokeGameSimulatorSequenceEngine("cancelSequenceAdvance", args);
}
function stopSequencePlayback(...args) {
return invokeGameSimulatorSequenceEngine("stopSequencePlayback", args);
}
function finishSequencePlayback(...args) {
return invokeGameSimulatorSequenceEngine("finishSequencePlayback", args);
}
function queueNextSequenceStep(...args) {
return invokeGameSimulatorSequenceEngine("queueNextSequenceStep", args);
}
function startRecordedAction(...args) {
return invokeGameSimulatorSequenceEngine("startRecordedAction", args);
}
function createCommittedSnapshotFromCurrentState(...args) {
return invokeGameSimulatorSequenceEngine("createCommittedSnapshotFromCurrentState", args);
}
function applyCommittedSnapshot(...args) {
return invokeGameSimulatorSequenceEngine("applyCommittedSnapshot", args);
}
function serializeSequence(...args) {
return invokeGameSimulatorSequenceEngine("serializeSequence", args);
}
function loadSequenceData(...args) {
return invokeGameSimulatorSequenceEngine("loadSequenceData", args);
}
function saveSequenceToLocal(...args) {
return invokeGameSimulatorSequenceEngine("saveSequenceToLocal", args);
}
function loadSequenceFromLocal(...args) {
return invokeGameSimulatorSequenceEngine("loadSequenceFromLocal", args);
}
function downloadSequence(...args) {
return invokeGameSimulatorSequenceEngine("downloadSequence", args);
}
function createStepThumbnail(...args) {
return invokeGameSimulatorSequenceEngine("createStepThumbnail", args);
}
function startSequenceStep(...args) {
return invokeGameSimulatorSequenceEngine("startSequenceStep", args);
}
function startSequencePlayback(...args) {
return invokeGameSimulatorSequenceEngine("startSequencePlayback", args);
}
function getActiveExampleOverlay(...args) {
return invokeGameSimulatorSequenceEngine("getActiveExampleOverlay", args);
}
function getSavedSequenceById(...args) {
return invokeGameSimulatorSequenceEngine("getSavedSequenceById", args);
}
function loadSavedSequenceEntry(...args) {
return invokeGameSimulatorSequenceEngine("loadSavedSequenceEntry", args);
}
function removeSavedSequenceEntry(...args) {
return invokeGameSimulatorSequenceEngine("removeSavedSequenceEntry", args);
}
gameSimulatorSequenceEngine = createGameSimulatorSequenceEngine({
  applyBallExecutionProfile: (...args) => applyBallExecutionProfile(...args),
  applyPhysicalProfileToPlayers: (...args) => applyPhysicalProfileToPlayers(...args),
  applyResolvedBallProfile: (...args) => applyResolvedBallProfile(...args),
  applyTeamIdentities: (...args) => applyTeamIdentities(...args),
  buildPlayerTendencyProfile: (...args) => buildPlayerTendencyProfile(...args),
  canEditScenario: (...args) => canEditScenario(...args),
  clamp,
  clearAutoPilotReceiveMomentum: (...args) => clearAutoPilotReceiveMomentum(...args),
  clearBallAction: (...args) => clearBallAction(...args),
  cloneAutoV2DecisionTriggers,
  cloneDefensiveAutopilotIntents,
  cloneGoalEvent,
  cloneOffensiveAutopilotIntents,
  cloneRestartPhase,
  cloneSecurePossession,
  cloneShotPlacement,
  cloneTeamIdentities,
  cloneTeamIdentity,
  cloneVector,
  competitionPhysicalProfiles,
  configureBallTravelProfile: (...args) => configureBallTravelProfile(...args),
  createInitialState,
  createPlayer: (...args) => createPlayer(...args),
  createTransitionPlan: (...args) => createTransitionPlan(...args),
  defaultScenarioInfo,
  describeStep: (...args) => describeStep(...args),
  distance,
  getActionSpeed: (...args) => getActionSpeed(...args),
  getPlayerById: (...args) => getPlayerById(...args),
  getPlayerFacingAngle,
  getRecordedStepEndSnapshot: (...args) => getRecordedStepEndSnapshot(...args),
  getSelectedPlayerIds: (...args) => getSelectedPlayerIds(...args),
  getSequenceFrameSnapshot: (...args) => getSequenceFrameSnapshot(...args),
  hasBallAction: (...args) => hasBallAction(...args),
  logEvent,
  persistCurrentFrameSnapshot: (...args) => persistCurrentFrameSnapshot(...args),
  pitch,
  playerTendencyTemplates,
  resolveRecordedStepProfile: (...args) => resolveRecordedStepProfile(...args),
  setDribbleCarryPathForBall: (...args) => setDribbleCarryPathForBall(...args),
  setLastFrame: (nextLastFrame) => { lastFrame = nextLastFrame; },
  setSelectedPlayers: (...args) => setSelectedPlayers(...args),
  setState: (nextState) => { state = nextState; },
  setTeamFormationOnPlayers: (...args) => setTeamFormationOnPlayers(...args),
  sequenceLibraryStorageKey,
  sequenceStorageKey,
  snapshotsMatch: (...args) => snapshotsMatch(...args),
  squadBlueprints,
  teams,
  ui,
  updateModeButtons: (...args) => updateModeButtons(...args),
  updateSequenceButtons: (...args) => updateSequenceButtons(...args),
  vec,
  win,
  getState: () => state,
});
const gameSimulatorCanvasRenderer = createGameSimulatorCanvasRenderer({
  ballRadiusMeters,
  canvas,
  clamp,
  cloneVector,
  computeReachDistance,
  ctx,
  gameSimulatorSidebarRenderer,
  getActionOrigin,
  getActiveExampleOverlay,
  getBallOwner,
  getGoalDirectionSign,
  getMetersToPixels,
  getPlayerBallControlPoint,
  getPlayerFacingAngle,
  getPlayerMagnetLabel,
  getProjectedActionDuration,
  getRenderedPrimarySelectedPlayerId,
  hasBallAction,
  isPlayerRenderedSelected,
  lerp,
  normalize,
  pitch,
  playerRadiusMeters,
  syncBallSpeedControls,
  syncDefensiveAggressionControls,
  syncDefensiveAutopilotButton,
  syncDribbleSpeedControls,
  syncFirstTouchControls,
  syncFormationControls,
  syncOffensiveAutopilotButton,
  syncPhysicalProfileControls,
  syncSurfaceControls,
  syncTeamIdentityControls,
  syncWeatherControls,
  toCanvas,
  updatePitchFullscreenHudLayout,
  updateSequenceButtons,
  win,
  getState: () => state,
});
function render() {
  gameSimulatorCanvasRenderer.render();
}
win.renderGameSimulator = render;
const gameSimulatorPointerController = createGameSimulatorPointerController({
canvas,
getState: () => state,
playerRadiusMeters,
ballRadiusMeters,
pitch,
distance,
clamp,
cloneVector,
normalizeSelectedPlayerIds,
hasBallAction,
getPlayerById,
getPlayerBallControlPoint,
refreshPlannedBallActionProfile,
getPointerRequestedActionMode,
issuePassCommand,
issueBallCommand,
consumePointerActionMode,
clearBallAction,
logEvent,
isSelectionModifierActive,
toggleSelectedPlayer,
isPlayerSelected,
setSingleSelectedPlayer,
setSelectedPlayers,
getSelectedPlayerIds,
getActionOrigin,
getEditableRadius,
eventToPitch,
clampToPitch,
subtract,
clampToCircle,
rotatePlayerBodyAlongMovement,
clearSecurePossession,
markSimulatorDirty,
clearSelectedPlayers,
render,
});
function isGameSimulatorWorkspaceActive() {
return hubState?.activeWorkspaceId === "game-simulator";
}
function shouldIgnoreSimulatorTextOrModifierTarget(event) { const t = event?.target, tag = t?.tagName; return Boolean(event?.metaKey || event?.ctrlKey || event?.altKey || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) || t?.isContentEditable); }
async function ensureGameSimulatorControllers() {
if (gameSimulatorWorkspaceController) return;
if (!gameSimulatorControllersPromise) {
gameSimulatorControllersPromise = platformModuleLoader.loadModule("game-simulator.controllers", () =>
import("./src/modules/game-simulator/controllers.mjs")
)
.then(({ createSimulatorControllers }) => {
const controllers = createSimulatorControllers({
windowRef: window, documentRef: document, bindButtonControls: false,
getStageElement: () => ui.pitchStage,
getCanvasElement: () => canvas,
getButtonElement: () => ui.pitchFullscreenButton,
getWorkspaceElement: () => ui.gameSimulatorWorkspace,
getIntroElement: () => ui.gameSimulatorIntro,
getPitchStageElement: () => ui.pitchStage,
getIsActiveWorkspace: () => isGameSimulatorWorkspaceActive(),
getOffensiveAutopilotEnabled: () => state.offensiveAutopilot,
getKeyboardActionMode: () => state.keyboardActionMode,
hasActiveMetricTooltip: () => Boolean(activeMetricTooltipTarget && !ui.metricTooltip?.hidden),
log: (message) => logEvent(message),
onActionModeChanged: () => { updateModeButtons(); render(); },
render,
renderWorkspaceChrome,
syncFullscreen: syncPitchFullscreenButton,
syncFullscreenButton: syncPitchFullscreenButton,
updateFullscreenHudLayout: updatePitchFullscreenHudLayout,
ensureMetricTooltipLayer,
positionMetricTooltip: () => positionMetricTooltip(activeMetricTooltipTarget),
resetIntro: resetGameSimulatorIntro,
toggleSpaceAutopilotPlayback,
executePlannedAction,
setKeyboardActionMode,
armKeyboardActionGrace,
clearKeyboardActionGrace,
requestAnimationFrame: (callback) => win.requestAnimationFrame(callback),
});
gameSimulatorFullscreenController = controllers.fullscreenController;
gameSimulatorKeyboardState = controllers.keyboardState; gameSimulatorWorkspaceController = controllers.workspaceController;
controllers.controlBindings.bind();
syncGameSimulatorIntroState();
syncPitchFullscreenButton();
updatePitchFullscreenHudLayout();
})
.catch((error) => {
gameSimulatorControllersPromise = null;
throw error;
});
}
return gameSimulatorControllersPromise;
}
function queueGameSimulatorControllersLoad() { ensureGameSimulatorControllers().catch(() => {}); }
function resetSimulatorAnimationClock() {
lastFrame = null;
}
async function getSimulatorAnimationRuntime() {
if (simulatorAnimationRuntime) {
return simulatorAnimationRuntime;
}
if (!simulatorAnimationRuntimePromise) {
simulatorAnimationRuntimePromise = platformModuleLoader.loadModule("game-simulator.runtime", () =>
import("./src/modules/game-simulator/runtime.mjs")
)
.then(({ createSimulatorAnimationLoop }) => {
simulatorAnimationRuntime = createSimulatorAnimationLoop({
shouldRun: () => simulatorAnimationLoopRequested && isGameSimulatorWorkspaceActive(),
onFrame: animationFrame,
});
return simulatorAnimationRuntime;
})
.catch((error) => {
simulatorAnimationRuntimePromise = null;
console.error(error);
throw error;
});
}
return simulatorAnimationRuntimePromise;
}
function startSimulatorAnimationLoop() {
simulatorAnimationLoopRequested = true;
getSimulatorAnimationRuntime()
.then((runtime) => {
if (simulatorAnimationLoopRequested && isGameSimulatorWorkspaceActive()) {
runtime.start();
}
})
.catch(() => {});
}
function stopSimulatorAnimationLoop() {
simulatorAnimationLoopRequested = false;
simulatorAnimationRuntime?.stop();
resetSimulatorAnimationClock();
}
function animationFrame(timestamp) {
if (!isGameSimulatorWorkspaceActive()) {
resetSimulatorAnimationClock();
return;
}
if (lastFrame === null) {
lastFrame = timestamp;
}
const realDt = Math.min((timestamp - lastFrame) / 1000, 0.05);
lastFrame = timestamp;
if (state.isRunning) {
stepSimulation(realDt);
}
applyNearbyBallOrientation(realDt);
render();
}
function executePlannedAction() {
if (!isGameSimulatorWorkspaceActive()) {
return;
}
if (state.isRunning || state.sequence.isPlaying) {
return;
}
if (!hasBallAction()) {
logEvent("Set a new ball target before starting the action.");
render();
return;
}
if (state.draftStep?.beforeSnapshot && !state.activeActionTargets) {
const actionTargetSnapshot = captureSnapshot();
const resolvedProfile = resolveRecordedStepProfile(state.draftStep);
state.activeActionTargets = new Map(
actionTargetSnapshot.players.map((player) => [
player.id,
cloneVector(player.position),
])
);
applySnapshot(state.draftStep.beforeSnapshot);
setSelectedPlayers(
actionTargetSnapshot.selectedPlayerIds ?? [],
actionTargetSnapshot.selectedPlayerId ?? actionTargetSnapshot.selectedPlayerIds?.[0] ?? null
);
if (state.draftStep.actionType === "dribble") {
const carrier = getPlayerById(state.draftStep.carrierPlayerId);
state.dribbleSpeed = state.draftStep.speed;
ui.dribbleSpeed.value = String(state.draftStep.speed);
ui.dribbleSpeedLabel.textContent = `${state.draftStep.speed.toFixed(1)} m/s`;
applyResolvedBallProfile(resolvedProfile);
state.ball.position = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.startPosition = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.target = cloneVector(state.draftStep.target);
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = "dribble";
state.ball.initiatorPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.carrierPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.receiverPlayerId = null;
state.ball.ownerPlayerId = state.draftStep.carrierPlayerId ?? null;
applyBallExecutionProfile("dribble", carrier, state.draftStep.target, resolvedProfile);
configureBallTravelProfile(
"dribble",
distance(state.ball.startPosition, state.ball.target),
getActionSpeed(),
resolvedProfile
);
if (carrier) {
setDribbleCarryPathForBall(carrier, carrier.position, state.ball.target);
}
} else if (state.draftStep.actionType === "recovery") {
applyResolvedBallProfile(resolvedProfile);
state.ball.speed = state.draftStep.speed;
state.ball.position = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.startPosition = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.target = cloneVector(state.draftStep.target);
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = "recovery";
state.ball.initiatorPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.carrierPlayerId = state.draftStep.carrierPlayerId ?? null;
state.ball.receiverPlayerId = null;
state.ball.ownerPlayerId = null;
state.ball.recoveryDuration = Math.max(state.draftStep.recoveryDuration ?? 0, 0.35);
state.ball.currentSpeed = 0;
state.ball.launchSpeed = 0;
state.ball.finalSpeed = 0;
state.ball.deceleration = 0;
state.ball.trackDistanceTotal = 0;
state.ball.trackDistanceCovered = 0;
} else {
const initiator = getPlayerById(state.draftStep.beforeSnapshot.ball.ownerPlayerId);
state.ballSpeedMode = state.draftStep.speedMode ?? state.ballSpeedMode;
state.ball.speed = state.draftStep.speed;
if (state.draftStep.speedMode === "manual") {
state.ball.manualSpeed = state.draftStep.speed;
}
applyResolvedBallProfile(resolvedProfile);
state.ball.position = cloneVector(state.draftStep.beforeSnapshot.ball.position);
state.ball.startPosition = cloneVector(state.draftStep.beforeSnapshot.ball.position);
const intendedTarget = cloneVector(state.draftStep.target);
state.ball.target = cloneVector(intendedTarget);
state.ball.inTransit = true;
state.ball.elapsedTravelTime = 0;
state.ball.actionType = state.draftStep.actionType;
state.ball.initiatorPlayerId = state.draftStep.beforeSnapshot.ball.ownerPlayerId ?? null;
state.ball.carrierPlayerId = null;
state.ball.receiverPlayerId = state.draftStep.receiverPlayerId ?? null;
state.ball.firstTouchMode = state.draftStep.firstTouchMode ?? "auto";
state.ball.ownerPlayerId = null;
applyBallExecutionProfile(state.draftStep.actionType, initiator, intendedTarget, resolvedProfile);
if (state.draftStep.actionType === "shot") {
const executedTarget = resolveExecutedShotTarget(initiator, intendedTarget, resolvedProfile) ?? intendedTarget;
state.ball.target = cloneVector(executedTarget);
state.draftStep.intendedTarget = cloneVector(intendedTarget);
state.draftStep.target = cloneVector(executedTarget);
state.draftStep.shotPlacement = cloneShotPlacement(state.ball.shotPlacement);
}
configureBallTravelProfile(
state.draftStep.actionType,
distance(state.ball.startPosition, state.ball.target),
getActionSpeed(),
resolvedProfile
);
}
state.players.forEach((player) => {
player.actionOrigin = cloneVector(player.position);
});
}
state.isRunning = true;
ui.playPauseButton.textContent = "Pause";
logEvent("Action started.");
}
function pauseLiveSimulation(message = "Simulation paused.") {
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent(message);
updateSequenceButtons();
render();
}
function resumeLiveSimulation(message = "Simulation resumed.") {
state.isRunning = true;
ui.playPauseButton.textContent = "Pause";
logEvent(message);
updateSequenceButtons();
render();
}
function toggleSpaceAutopilotPlayback() {
if (!state.offensiveAutopilot) {
return;
}
if (state.sequence.isPlaying) {
if (state.isRunning) {
pauseAutoPilotPlay("Auto play paused.");
return;
}
state.autoPilotPlay.active = true;
resumeLiveSimulation("Autopilot playback resumed.");
return;
}
if (state.isRunning) {
pauseAutoPilotPlay("Auto play paused.");
return;
}
if (state.autoPilotPlay?.active && !hasBallAction() && !state.draftStep) {
pauseAutoPilotPlay("Auto play paused.");
return;
}
state.autoPilotPlay.active = true;
if (state.ball.inTransit && (hasBallAction() || state.draftStep)) {
resumeLiveSimulation("Auto play resumed.");
return;
}
if (hasBallAction() || state.draftStep) {
executePlannedAction();
render();
return;
}
planAutoPilotNextAction({ startImmediately: true });
}
function positionMetricTooltip(target) {
if (!ui.metricTooltip || !target) {
return;
}
if (!target.isConnected) {
hideMetricTooltip({ force: true });
return;
}
const rect = target.getBoundingClientRect();
const padding = 12;
const tooltipWidth = ui.metricTooltip.offsetWidth;
const tooltipHeight = ui.metricTooltip.offsetHeight;
let left = rect.left + rect.width / 2 - tooltipWidth / 2;
let top = rect.bottom + 10;
left = clamp(left, padding, win.innerWidth - tooltipWidth - padding);
if (top + tooltipHeight > win.innerHeight - padding) {
top = rect.top - tooltipHeight - 10;
}
top = clamp(top, padding, win.innerHeight - tooltipHeight - padding);
ui.metricTooltip.style.left = `${left}px`;
ui.metricTooltip.style.top = `${top}px`;
}
function ensureMetricTooltipLayer() {
if (!ui.metricTooltip) {
return;
}
const layerRoot = document.fullscreenElement ?? document.body;
if (ui.metricTooltip.parentElement !== layerRoot) {
layerRoot.appendChild(ui.metricTooltip);
}
}
function showMetricTooltip(target, { pinned = false } = {}) {
const helpText = target?.dataset?.metricHelp;
if (!ui.metricTooltip || !helpText) {
return;
}
ensureMetricTooltipLayer();
activeMetricTooltipTarget = target;
pinnedMetricTooltipTarget = pinned ? target : pinnedMetricTooltipTarget;
ui.metricTooltip.textContent = helpText;
ui.metricTooltip.hidden = false;
ui.metricTooltip.classList.add("is-visible");
ui.metricTooltip.dataset.metricLabel = target.dataset.metricLabel ?? "";
target.setAttribute("aria-expanded", "true");
positionMetricTooltip(target);
}
function hideMetricTooltip({ force = false } = {}) {
if (!ui.metricTooltip) {
return;
}
if (!force && pinnedMetricTooltipTarget) {
return;
}
if (activeMetricTooltipTarget) {
activeMetricTooltipTarget.setAttribute("aria-expanded", "false");
}
activeMetricTooltipTarget = null;
pinnedMetricTooltipTarget = null;
ui.metricTooltip.classList.remove("is-visible");
ui.metricTooltip.hidden = true;
delete ui.metricTooltip.dataset.metricLabel;
}
ui.playPauseButton.addEventListener("click", () => {
if (state.isRunning) {
state.isRunning = false;
ui.playPauseButton.textContent = "Start";
logEvent("Simulation paused.");
return;
}
executePlannedAction();
});
ui.resetButton.addEventListener("click", () => {
cancelAutoPilotContinuation();
cancelSequenceAdvance();
state = createInitialState();
lastFrame = null;
ui.playPauseButton.textContent = "Start";
ui.playbackSpeed.value = "1";
ui.playbackSpeedLabel.textContent = "1.00x";
ui.ballSpeed.value = "12";
ui.ballSpeedLabel.textContent = "Auto";
ui.dribbleSpeed.value = "4.5";
ui.dribbleSpeedLabel.textContent = "Auto";
if (ui.firstTouchSelect) {
ui.firstTouchSelect.value = "auto";
}
if (ui.defensiveAggressionSelect) {
ui.defensiveAggressionSelect.value = "balanced";
}
syncSurfaceControls();
syncWeatherControls();
syncFirstTouchControls();
syncDefensiveAggressionControls();
syncBallSpeedControls();
syncDribbleSpeedControls();
updateModeButtons();
updateSequenceButtons();
logEvent("Reset complete: new sequence starts with a kick-off.");
render();
});
ui.playbackSpeed.addEventListener("input", (event) => {
const value = Number(event.target.value);
state.playbackSpeed = value;
ui.playbackSpeedLabel.textContent = `${value.toFixed(2)}x`;
});
ui.ballSpeedAutoButton.addEventListener("click", () => {
state.ballSpeedMode = "auto";
refreshPlannedBallActionProfile();
syncBallSpeedControls();
render();
});
ui.ballSpeedManualButton.addEventListener("click", () => {
state.ballSpeedMode = "manual";
state.ball.speed = state.ball.manualSpeed;
refreshPlannedBallActionProfile();
syncBallSpeedControls();
render();
});
ui.ballSpeed.addEventListener("input", (event) => {
const value = Number(event.target.value);
state.ball.manualSpeed = value;
if (state.ballSpeedMode === "manual") {
state.ball.speed = value;
}
refreshPlannedBallActionProfile();
syncBallSpeedControls();
render();
});
ui.dribbleSpeedAutoButton?.addEventListener("click", () => {
state.dribbleSpeedMode = "auto";
refreshPlannedBallActionProfile();
syncDribbleSpeedControls();
render();
});
ui.dribbleSpeedManualButton?.addEventListener("click", () => {
state.dribbleSpeedMode = "manual";
refreshPlannedBallActionProfile();
syncDribbleSpeedControls();
render();
});
ui.dribbleSpeed.addEventListener("input", (event) => {
const value = Number(event.target.value);
state.dribbleSpeed = value;
refreshPlannedBallActionProfile();
syncDribbleSpeedControls();
render();
});
ui.pitchSurfaceSelect?.addEventListener("input", (event) => {
state.surfacePreset = event.target.value;
refreshPlannedBallActionProfile();
render();
});
ui.weatherSelect?.addEventListener("input", (event) => {
state.weatherPreset = event.target.value;
refreshPlannedBallActionProfile();
render();
});
ui.firstTouchSelect?.addEventListener("input", (event) => {
state.firstTouchMode = event.target.value;
if (state.draftStep?.actionType === "pass") {
state.draftStep.firstTouchMode = state.firstTouchMode;
state.ball.firstTouchMode = state.firstTouchMode;
}
render();
});
ui.defensiveAggressionSelect?.addEventListener("input", (event) => {
state.defensiveAggressionPreset = event.target.value;
syncDefensiveAggressionControls();
render();
});
function updateModeButtons() {
const activeMode = getRequestedActionMode();
ui.passModeButton.classList.toggle("is-active", activeMode === "pass");
ui.dribbleModeButton.classList.toggle("is-active", activeMode === "dribble");
ui.shotModeButton.classList.toggle("is-active", activeMode === "shot");
}
function syncDefensiveAutopilotButton() {
if (!ui.defensiveAutopilotButton) {
return;
}
ui.defensiveAutopilotButton.classList.toggle("is-active", state.defensiveAutopilot);
ui.defensiveAutopilotButton.setAttribute("aria-pressed", String(state.defensiveAutopilot));
ui.defensiveAutopilotButton.textContent = state.defensiveAutopilot
? "Defence Auto"
: "Defence Manual";
ui.defensiveAutopilotButton.disabled = state.isRunning || state.sequence.isPlaying;
}
function syncOffensiveAutopilotButton() {
if (!ui.offensiveAutopilotButton) {
return;
}
ui.offensiveAutopilotButton.classList.toggle("is-active", state.offensiveAutopilot);
ui.offensiveAutopilotButton.setAttribute("aria-pressed", String(state.offensiveAutopilot));
ui.offensiveAutopilotButton.textContent = state.offensiveAutopilot
? "Attack Auto"
: "Attack Manual";
ui.offensiveAutopilotButton.disabled = state.isRunning || state.sequence.isPlaying;
}
function syncAutoV2DebugButton() {
if (!ui.autoV2DebugButton) {
return;
}
ui.autoV2DebugButton.classList.toggle("is-active", Boolean(win.__autoV2DebugEnabled));
ui.autoV2DebugButton.setAttribute("aria-pressed", String(Boolean(win.__autoV2DebugEnabled)));
ui.autoV2DebugButton.textContent = win.__autoV2DebugEnabled ? "Auto v2 Debug On" : "Auto v2 Debug";
}
function toggleAutoV2DebugOverlay() {
state.autoV2Debug = !state.autoV2Debug;
win.__autoV2DebugEnabled = state.autoV2Debug;
logEvent(state.autoV2Debug ? "Auto v2 debug overlay is on." : "Auto v2 debug overlay is off.");
render();
}
win.toggleAutoV2DebugOverlay = toggleAutoV2DebugOverlay;
function shouldIgnoreHotkey(event) { return shouldIgnoreSimulatorTextOrModifierTarget(event); }
function shouldIgnoreSpaceAutopilotHotkey(event) { return shouldIgnoreSimulatorTextOrModifierTarget(event); }
function clearKeyboardActionGrace() { gameSimulatorKeyboardState?.clearKeyboardActionGrace(state); }
function armKeyboardActionGrace(mode, durationMs = 220) {
if (gameSimulatorKeyboardState) return gameSimulatorKeyboardState.armKeyboardActionGrace(state, mode, durationMs);
state.keyboardActionGraceMode = mode;
state.keyboardActionGraceUntil = Date.now() + durationMs;
}
function getPointerRequestedActionMode() {
return gameSimulatorKeyboardState?.getPointerRequestedActionMode(state) ?? state.keyboardActionMode ?? state.actionMode;
}
function consumePointerActionMode(mode) { gameSimulatorKeyboardState?.consumePointerActionMode(state, mode); }
function setKeyboardActionMode(mode) {
if (gameSimulatorKeyboardState) return gameSimulatorKeyboardState.setKeyboardActionMode(state, mode);
if (state.keyboardActionMode === mode) return;
state.keyboardActionMode = mode;
updateModeButtons();
render();
}
function toggleActionMode(mode) {
state.actionMode = state.actionMode === mode ? null : mode;
updateModeButtons();
render();
}
function syncFormationControls() {
ui.homeFormationSelect.value = teams.home.formation;
ui.awayFormationSelect.value = teams.away.formation;
ui.homeLegendLabel.innerHTML = `<i class="swatch swatch-home"></i>${teams.home.name} ${teams.home.formation}`;
ui.awayLegendLabel.innerHTML = `<i class="swatch swatch-away"></i>${teams.away.name} ${teams.away.formation}`;
}
function syncTeamIdentityControls() {
if (ui.homeAttackStyleSelect) {
ui.homeAttackStyleSelect.value = getTeamAttackStyleKey("home");
ui.homeAttackStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
if (ui.homeDefenseStyleSelect) {
ui.homeDefenseStyleSelect.value = getTeamDefenseStyleKey("home");
ui.homeDefenseStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
if (ui.awayAttackStyleSelect) {
ui.awayAttackStyleSelect.value = getTeamAttackStyleKey("away");
ui.awayAttackStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
if (ui.awayDefenseStyleSelect) {
ui.awayDefenseStyleSelect.value = getTeamDefenseStyleKey("away");
ui.awayDefenseStyleSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncPhysicalProfileControls() {
if (ui.physicalProfileSelect) {
ui.physicalProfileSelect.value = state.physicalProfile ?? defaultPhysicalProfileKey;
ui.physicalProfileSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncSurfaceControls() {
if (ui.pitchSurfaceSelect) {
ui.pitchSurfaceSelect.value = state.surfacePreset;
ui.pitchSurfaceSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncWeatherControls() {
if (ui.weatherSelect) {
ui.weatherSelect.value = state.weatherPreset;
ui.weatherSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncFirstTouchControls() {
if (ui.firstTouchSelect) {
ui.firstTouchSelect.value = state.firstTouchMode;
ui.firstTouchSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncDefensiveAggressionControls() {
if (ui.defensiveAggressionSelect) {
ui.defensiveAggressionSelect.value = state.defensiveAggressionPreset;
ui.defensiveAggressionSelect.disabled = state.isRunning || state.sequence.isPlaying;
}
}
function syncBallSpeedControls() {
const isAuto = state.ballSpeedMode === "auto";
ui.ballSpeedAutoButton.classList.toggle("is-active", isAuto);
ui.ballSpeedManualButton.classList.toggle("is-active", !isAuto);
ui.ballSpeed.disabled = isAuto;
ui.ballSpeed.closest(".speed-control")?.classList.toggle("is-disabled", isAuto);
ui.ballSpeed.value = String(state.ball.manualSpeed);
ui.ballSpeedLabel.textContent = isAuto
? hasBallAction() || state.ball.inTransit
? `Auto • ${formatSpeed(state.ball.speed)}`
: "Auto"
: formatSpeed(state.ball.manualSpeed);
}
function syncDribbleSpeedControls() {
const isAuto = state.dribbleSpeedMode === "auto";
ui.dribbleSpeedAutoButton?.classList.toggle("is-active", isAuto);
ui.dribbleSpeedManualButton?.classList.toggle("is-active", !isAuto);
ui.dribbleSpeed.disabled = isAuto;
ui.dribbleSpeed.closest(".speed-control")?.classList.toggle("is-disabled", isAuto);
ui.dribbleSpeed.value = String(state.dribbleSpeed);
const isLiveDribble = (hasBallAction() || state.ball.inTransit || !!state.draftStep) &&
(state.ball.actionType === "dribble" || state.draftStep?.actionType === "dribble");
const displayedSpeed = state.draftStep?.actionType === "dribble"
? state.draftStep.speed
: state.ball.actionType === "dribble"
? state.ball.currentSpeed || state.ball.speed || state.dribbleSpeed
: state.dribbleSpeed;
ui.dribbleSpeedLabel.textContent = isAuto
? isLiveDribble
? `Auto • ${formatSpeed(displayedSpeed)}`
: "Auto"
: formatSpeed(state.dribbleSpeed);
}
function updateSequenceButtons() {
ui.playSequenceButton.textContent = state.sequence.isPlaying
? "Stop Playback"
: "Play From Here";
const isLocked = !canEditScenario() || hasBallAction() || !!state.draftStep;
const hasPrevious = state.sequence.currentFrameIndex > -1;
const hasNext = state.sequence.currentFrameIndex < state.sequence.steps.length - 1;
ui.previousStepButton.disabled = isLocked || !hasPrevious;
ui.nextStepButton.disabled = isLocked || !hasNext;
ui.playSequenceButton.disabled =
(state.sequence.steps.length === 0 && !state.sequence.isPlaying) ||
(!state.sequence.isPlaying && isLocked);
ui.clearSequenceButton.disabled = state.sequence.isPlaying || state.isRunning;
if (!state.sequence.steps.length) {
ui.sequenceStepLabel.textContent = "Start";
return;
}
ui.sequenceStepLabel.textContent =
state.sequence.currentFrameIndex < 0
? `Start / ${state.sequence.steps.length}`
: `Step ${state.sequence.currentFrameIndex + 1} / ${state.sequence.steps.length}`;
}
function refreshKickoffSetupIfWaitingToStart() {
if (
state.restartPhase?.type !== "kickoff" ||
state.isRunning ||
state.sequence.isPlaying ||
state.sequence.steps.length ||
hasBallAction() ||
state.draftStep
) {
return;
}
applyKickoffSetup(state, {
teamId: state.restartPhase.teamId ?? defaultKickoffTeamId,
resetFormations: false,
});
}
ui.passModeButton.addEventListener("click", () => {
toggleActionMode("pass");
});
ui.dribbleModeButton.addEventListener("click", () => {
toggleActionMode("dribble");
});
ui.shotModeButton.addEventListener("click", () => {
toggleActionMode("shot");
});
ui.homeFormationSelect.addEventListener("change", (event) => {
if (!canEditScenario()) {
syncFormationControls();
return;
}
if (hasBallAction() || state.draftStep) {
clearBallAction();
}
applyTeamFormation("home", event.target.value);
refreshKickoffSetupIfWaitingToStart();
state.example = null;
state.scenario = { ...defaultScenarioInfo };
logEvent(`Blue Team switched to a ${event.target.value} shape.`);
render();
});
ui.awayFormationSelect.addEventListener("change", (event) => {
if (!canEditScenario()) {
syncFormationControls();
return;
}
if (hasBallAction() || state.draftStep) {
clearBallAction();
}
applyTeamFormation("away", event.target.value);
refreshKickoffSetupIfWaitingToStart();
state.example = null;
state.scenario = { ...defaultScenarioInfo };
logEvent(`Red Team switched to a ${event.target.value} shape.`);
render();
});
function updateTeamIdentity(teamId, type, styleKey) {
if (!canEditScenario()) {
syncTeamIdentityControls();
return;
}
const team = teams[teamId];
if (!team) {
return;
}
if (type === "attack") {
team.identity.attackStyle = attackStylePresets[styleKey] ? styleKey : "balanced";
const style = getTeamAttackStyleProfile(teamId);
logEvent(`${team.name} attack identity set to ${style.label}.`);
} else {
team.identity.defenseStyle = defenseStylePresets[styleKey] ? styleKey : "balanced-block";
const style = getTeamDefenseStyleProfile(teamId);
logEvent(`${team.name} defensive identity set to ${style.label}.`);
}
if (!state.isRunning && !state.sequence.isPlaying && hasBallAction()) {
applyAutopilotsForCurrentAction({ silent: true });
}
syncTeamIdentityControls();
render();
}
function updatePhysicalProfile(profileKey) {
if (!canEditScenario()) {
syncPhysicalProfileControls();
return;
}
const nextProfile = competitionPhysicalProfiles[profileKey] ?? competitionPhysicalProfiles[defaultPhysicalProfileKey];
state.physicalProfile = nextProfile.key;
applyPhysicalProfileToPlayers(state.players, nextProfile.key);
refreshPlannedBallActionProfile();
if (!state.isRunning && !state.sequence.isPlaying && hasBallAction()) {
applyAutopilotsForCurrentAction({ silent: true });
}
logEvent(`Physical level set to ${nextProfile.label}. Player speed, acceleration and auto carry speed now use that profile.`);
syncPhysicalProfileControls();
render();
}
function updateSelectedPlayerProfile(playerId, profileKey) {
if (!canEditScenario()) {
render();
return;
}
const player = getPlayerById(playerId);
const profile = playerTendencyTemplates[profileKey];
if (!player || !profile) {
render();
return;
}
player.tendencyProfile = buildPlayerTendencyProfile({
...player,
tendencyKey: profileKey,
});
if (hasBallAction()) {
applyAutopilotsForCurrentAction({ silent: true });
}
logEvent(`${player.shortLabel} ${player.role} profile set to ${profile.label}.`);
render();
}
ui.homeAttackStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("home", "attack", event.target.value);
});
ui.homeDefenseStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("home", "defense", event.target.value);
});
ui.awayAttackStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("away", "attack", event.target.value);
});
ui.awayDefenseStyleSelect?.addEventListener("change", (event) => {
updateTeamIdentity("away", "defense", event.target.value);
});
ui.physicalProfileSelect?.addEventListener("change", (event) => {
updatePhysicalProfile(event.target.value);
});
ui.assignBallButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
if (!state.selectedPlayerId) {
logEvent("Select a player before setting the ball carrier.");
render();
return;
}
setBallOwner(state.selectedPlayerId);
render();
});
ui.defensiveAutopilotButton?.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
state.defensiveAutopilot = !state.defensiveAutopilot;
if (state.defensiveAutopilot) {
const applied = applyDefensiveAutopilotForCurrentAction();
if (!applied) {
logEvent("Defensive autopilot is on and will shape the team without the ball on the next action.");
}
} else {
logEvent("Defensive autopilot is off.");
}
render();
});
ui.offensiveAutopilotButton?.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
state.offensiveAutopilot = !state.offensiveAutopilot;
if (state.offensiveAutopilot) {
const applied = applyOffensiveAutopilotForCurrentAction();
if (!applied) {
logEvent("Offensive autopilot is on and will shape the team with the ball on the next action.");
}
} else {
if (state.autoPilotPlay?.active || state.isRunning) {
pauseAutoPilotPlay("Auto play paused because offensive autopilot is off.");
} else {
cancelAutoPilotContinuation();
state.autoPilotPlay.active = false;
}
logEvent("Offensive autopilot is off.");
}
render();
});
ui.autoV2DebugButton?.addEventListener("click", () => {
toggleAutoV2DebugOverlay();
});
ui.sidebarToggle?.addEventListener("click", () => {
if (!hubState) {
return;
}
hubState.sidebarCollapsed = !hubState.sidebarCollapsed;
writeWorkspaceHubState();
renderWorkspaceChrome();
});
ui.workspaceSearch?.addEventListener("input", () => {
renderWorkspaceChrome();
});
ui.workspaceQuickSwitch?.addEventListener("change", () => {
setActiveWorkspace(ui.workspaceQuickSwitch.value);
});
ui.platformThemeModeSelect?.addEventListener("change", () => {
setPlatformThemeMode(ui.platformThemeModeSelect?.value);
});
ui.workspaceList?.addEventListener("click", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
if (!trigger) {
return;
}
setActiveWorkspace(trigger.dataset.openWorkspace);
});
ui.workspaceList?.addEventListener("mouseover", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
preloadWorkspaceFromTrigger(trigger);
platformNavigationController.showTopIconTooltip(trigger);
});
ui.workspaceList?.addEventListener("mouseout", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
if (trigger && !trigger.contains(event.relatedTarget)) {
platformNavigationController.hideTopIconTooltip();
}
});
ui.workspaceList?.addEventListener("focusin", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
preloadWorkspaceFromTrigger(trigger);
platformNavigationController.showTopIconTooltip(trigger);
});
ui.workspaceList?.addEventListener("focusout", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
if (trigger && !trigger.contains(event.relatedTarget)) {
platformNavigationController.hideTopIconTooltip();
}
});
ui.topIconMenu?.addEventListener("click", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
if (!trigger) {
return;
}
setActiveWorkspace(trigger.dataset.openWorkspace);
});
ui.topIconMenu?.addEventListener("mouseover", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
preloadWorkspaceFromTrigger(trigger);
platformNavigationController.showTopIconTooltip(trigger);
});
ui.topIconMenu?.addEventListener("mouseout", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
if (trigger && !trigger.contains(event.relatedTarget)) {
platformNavigationController.hideTopIconTooltip();
}
});
ui.topIconMenu?.addEventListener("focusin", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
preloadWorkspaceFromTrigger(trigger);
platformNavigationController.showTopIconTooltip(trigger);
});
ui.topIconMenu?.addEventListener("focusout", (event) => {
const trigger = event.target.closest("[data-open-workspace]");
if (trigger && !trigger.contains(event.relatedTarget)) {
platformNavigationController.hideTopIconTooltip();
}
});
win.addEventListener("scroll", platformNavigationController.hideTopIconTooltip, { passive: true });
win.addEventListener("resize", platformNavigationController.hideTopIconTooltip);
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
ui.workspaceTitle?.addEventListener("click", () => {
if (!hubState) {
return;
}
setActiveWorkspace("home");
});
ui.workspaceTitle?.addEventListener("keydown", (event) => {
if (!hubState || (event.key !== "Enter" && event.key !== " ")) {
return;
}
event.preventDefault();
setActiveWorkspace("home");
});
ui.dashboardGrid?.addEventListener("click", (event) => {
const readReceipt = event.target.closest("[data-dashboard-read-receipt]");
if (readReceipt) {
ui.dashboardGrid
.querySelectorAll("[data-dashboard-read-receipt][open]")
.forEach((receipt) => {
if (receipt !== readReceipt) {
receipt.removeAttribute("open");
}
});
return;
}
const tutorialButton = event.target.closest("[data-dashboard-action='open-tutorial']");
if (tutorialButton) {
showDashboardTutorialModal();
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
if (removeTaskButton) {
if (win.confirm("Remove this task?")) {
removeDashboardTask(removeTaskButton.dataset.dashboardRemoveTask);
refreshDashboardSurfaces();
}
return;
}
const scheduleDateButton = event.target.closest("[data-dashboard-open-schedule-date]");
if (scheduleDateButton) {
const dateValue = scheduleDateButton.dataset.dashboardOpenScheduleDate;
if (dateValue) {
if (!scheduleState) {
scheduleState = readScheduleState();
}
selectScheduleDate(dateValue);
}
setActiveWorkspace("schedule");
return;
}
const periodizationDateButton = event.target.closest("[data-dashboard-open-periodization-date]");
if (periodizationDateButton) {
const dateValue = periodizationDateButton.dataset.dashboardOpenPeriodizationDate;
ensurePeriodizationState();
if (dateValue && isDateValueInYear(dateValue, periodizationYear)) {
const date = parseScheduleDateValue(dateValue);
periodizationState.selectedDate = dateValue;
periodizationState.selectedMonthIndex = date.getMonth();
periodizationDayOverlayOpen = true;
periodizationDayOverlayMode = "view";
writePeriodizationState({ syncCentral: false });
}
setActiveWorkspace("periodization");
return;
}
const openSessionDateButton = event.target.closest("[data-dashboard-open-session-date]");
if (openSessionDateButton) {
const dateValue = openSessionDateButton.dataset.dashboardOpenSessionDate;
if (dateValue) {
getDashboardSessionPlannerState();
sessionPlannerState.selectedDate = dateValue;
writeSessionPlannerState();
}
setActiveWorkspace("session-planner");
return;
}
const createSessionDateButton = event.target.closest("[data-dashboard-create-session-date]");
if (createSessionDateButton) {
if (!canEditSessionPlanner()) {
setActiveWorkspace("session-planner");
return;
}
const dateValue = createSessionDateButton.dataset.dashboardCreateSessionDate || getDashboardTodayValue();
getDashboardSessionPlannerState();
if (!sessionPlannerState.sessions) {
sessionPlannerState.sessions = {};
}
if (!sessionPlannerState.sessions[dateValue]?.blocks?.length) {
sessionPlannerState.sessions[dateValue] = createSessionPlannerSessionForNewPlan(dateValue);
}
sessionPlannerState.selectedDate = dateValue;
writeSessionPlannerState();
setActiveWorkspace("session-planner");
return;
}
const tacticalboardButton = event.target.closest("[data-dashboard-open-tacticalboard]");
if (tacticalboardButton) {
const dateValue = tacticalboardButton.dataset.dashboardOpenTacticalboard || getDashboardTodayValue();
getDashboardSessionPlannerState();
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
return;
}
const focusButton = event.target.closest("[data-dashboard-focus]");
if (focusButton) {
const targetKey = focusButton.dataset.dashboardFocus;
const target =
targetKey === "task"
? ui.dashboardGrid.querySelector("#dashboardTaskForm input[name='title']")
: null;
target?.focus();
return;
}
const openTopTasksButton = event.target.closest("[data-dashboard-open-top-tasks]");
if (openTopTasksButton) {
const taskTitleInput = ui.dashboardGrid.querySelector("#dashboardTaskForm input[name='title']");
if (!taskTitleInput) {
return;
}
taskTitleInput.scrollIntoView({ behavior: "smooth", block: "center" });
taskTitleInput.focus();
return;
}
const trigger = event.target.closest("[data-open-workspace]");
if (!trigger) {
return;
}
setActiveWorkspace(trigger.dataset.openWorkspace);
});
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
ui.dashboardGrid?.addEventListener("submit", (event) => {
const personalTodoForm = event.target.closest("#dashboardPersonalTodoForm");
if (personalTodoForm) {
event.preventDefault();
const user = getCurrentPlatformUser();
const values = getPlatformFormValues(personalTodoForm);
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
const taskForm = event.target.closest("#dashboardTaskForm");
if (taskForm) {
event.preventDefault();
const values = getPlatformFormValues(taskForm);
createDashboardTask({
title: values.title,
note: values.note,
assignedTo: values.assignedTo,
scope: "team",
});
renderDashboardCards();
return;
}
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
document.addEventListener("click", (event) => {
const modalRoot = getElement("dashboardModalRoot");
if (!modalRoot || modalRoot.hidden) {
return;
}
const user = getCurrentPlatformUser();
if (event.target.closest("[data-dashboard-tutorial-never]")) {
saveDashboardTutorialPreference(user?.id, false);
closeDashboardModal();
return;
}
if (event.target.closest("[data-dashboard-tutorial-save]") || event.target.matches("[data-dashboard-modal-close]")) {
const showNext = Boolean(modalRoot.querySelector("#dashboardTutorialShowNext")?.checked);
saveDashboardTutorialPreference(user?.id, showNext);
closeDashboardModal();
return;
}
if (event.target.closest("[data-dashboard-news-dismiss]")) {
markDashboardNewsSeen(user?.id);
closeDashboardModal();
}
});
document.addEventListener("keydown", (event) => {
if (event.key !== "Escape") {
return;
}
const modalRoot = getElement("dashboardModalRoot");
if (!modalRoot || modalRoot.hidden) {
return;
}
const user = getCurrentPlatformUser();
if (modalRoot.querySelector("#dashboardTutorialShowNext")) {
const showNext = Boolean(modalRoot.querySelector("#dashboardTutorialShowNext")?.checked);
saveDashboardTutorialPreference(user?.id, showNext);
} else {
markDashboardNewsSeen(user?.id);
}
closeDashboardModal();
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
ui.sessionPlannerWorkspace?.addEventListener("click", (event) => {
if (sessionPlannerLibrarySuppressNextClick) {
sessionPlannerLibrarySuppressNextClick = false;
event.preventDefault();
return;
}
if (sessionPlannerPeriodizationBridge.handleClick(event)) {
return;
}
if (event.target.matches("[data-session-library-overlay]")) {
closeSessionPlannerLibrary();
return;
}
if (event.target.matches("[data-session-save-conflict-overlay]")) {
resolveSessionPlannerLibrarySaveConflict("cancel");
return;
}
if (event.target.matches("[data-session-central-conflict-overlay]")) {
resolveSessionPlannerCentralSyncConflict("keep-central");
return;
}
const saveConflictAction = event.target.closest("[data-session-save-conflict-action]");
if (saveConflictAction) {
resolveSessionPlannerLibrarySaveConflict(saveConflictAction.dataset.sessionSaveConflictAction);
return;
}
const centralConflictAction = event.target.closest("[data-session-central-conflict-action]");
if (centralConflictAction) {
resolveSessionPlannerCentralSyncConflict(centralConflictAction.dataset.sessionCentralConflictAction);
return;
}
if (event.target.matches("[data-session-visual-preview-overlay]")) {
setSessionPlannerVisualPreviewOpen(false);
return;
}
const closeVisualPreviewButton = event.target.closest("[data-session-close-visual-preview]");
if (closeVisualPreviewButton) {
setSessionPlannerVisualPreviewOpen(false);
return;
}
if (event.target.matches("[data-session-print-overlay]")) {
setSessionPlannerPrintOverlayOpen(false);
return;
}
const closePrintButton = event.target.closest("[data-session-close-print]");
if (closePrintButton) {
setSessionPlannerPrintOverlayOpen(false);
return;
}
const printNowButton = event.target.closest("[data-session-print-now]");
if (printNowButton) {
printSessionPlannerCurrentSession();
return;
}
if (event.target.matches("[data-session-tacticalboard-overlay]")) {
setSessionPlannerTacticalboardOpen(false);
return;
}
const closeTacticalboardButton = event.target.closest("[data-session-close-tacticalboard]");
if (closeTacticalboardButton) {
setSessionPlannerTacticalboardOpen(false);
return;
}
const tacticalNumberButton = event.target.closest("[data-session-tactical-number]");
if (tacticalNumberButton) {
updateSessionPlannerTacticalPlayerNumber(
tacticalNumberButton.dataset.sessionTacticalNumberElement,
tacticalNumberButton.dataset.sessionTacticalNumber
);
return;
}
if (event.target.matches("[data-session-player-board-profile-overlay]")) {
closeSessionPlannerPlayerBoardProfile();
return;
}
if (event.target.matches("[data-session-selection-assistant-overlay]")) {
sessionPlannerPlayerBoardAssistantOpen = false;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return;
}
const closePlayerBoardProfileButton = event.target.closest("[data-session-close-player-board-profile]");
if (closePlayerBoardProfileButton) {
closeSessionPlannerPlayerBoardProfile();
return;
}
const selectionAssistantOpenButton = event.target.closest("[data-session-selection-assistant-open]");
if (selectionAssistantOpenButton) {
sessionPlannerPlayerBoardAssistantOpen = true;
sessionPlannerPlayerBoardSelectedPlayerId = "";
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return;
}
const selectionAssistantCloseButton = event.target.closest("[data-session-selection-assistant-close]");
if (selectionAssistantCloseButton) {
sessionPlannerPlayerBoardAssistantOpen = false;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return;
}
const squadBridgePlayerButton = event.target.closest("[data-session-squad-bridge-player]");
if (squadBridgePlayerButton) {
openSessionPlannerPlayerBoardProfile(squadBridgePlayerButton.dataset.sessionSquadBridgePlayer);
return;
}
const selectionAssistantApplyButton = event.target.closest("[data-session-selection-assistant-apply]");
if (selectionAssistantApplyButton) {
applySessionPlannerSelectionAssistant();
return;
}
const playerBoardPrioritizeButton = event.target.closest("[data-session-player-board-prioritize]");
if (playerBoardPrioritizeButton) {
const formationInput = ui.sessionPlannerWorkspace?.querySelector("[data-session-player-board-formation-input]");
sessionPlannerPlayerBoardFormationInput = normalizeSessionPlannerPlayerBoardFormationValue(formationInput?.value);
applySessionPlannerPlayerBoardFormation({ prioritize: true });
return;
}
const playerBoardColorButton = event.target.closest("[data-session-player-board-color]");
if (playerBoardColorButton) {
updateSessionPlannerPlayerBoardSelectedColor(playerBoardColorButton.dataset.sessionPlayerBoardColor);
return;
}
const playerBoardResetPositionsButton = event.target.closest("[data-session-player-board-reset-positions]");
if (playerBoardResetPositionsButton) {
resetSessionPlannerPlayerBoardPositions();
return;
}
const playerBoardClearColorsButton = event.target.closest("[data-session-player-board-clear-colors]");
if (playerBoardClearColorsButton) {
clearSessionPlannerPlayerBoardSelectedColors();
return;
}
const playerBoardPersonCancelButton = event.target.closest("[data-session-player-board-person-cancel]");
if (playerBoardPersonCancelButton) {
closeSessionPlannerPlayerBoardCustomPersonEditor();
return;
}
const playerBoardPersonRemoveButton = event.target.closest("[data-session-player-board-person-remove]");
if (playerBoardPersonRemoveButton) {
sessionPlannerPlayerBoardCustomPersonEditor = null;
removeSessionPlannerPlayerBoardCustomPerson(playerBoardPersonRemoveButton.dataset.sessionPlayerBoardPersonRemove);
return;
}
if (event.target.matches("[data-session-player-board-overlay]")) {
setSessionPlannerPlayerBoardOpen(false);
return;
}
const closePlayerBoardButton = event.target.closest("[data-session-close-player-board]");
if (closePlayerBoardButton) {
setSessionPlannerPlayerBoardOpen(false);
return;
}
const tacticalFrameButton = event.target.closest("[data-session-tactical-frame]");
if (tacticalFrameButton) {
selectSessionPlannerTacticalFrame(tacticalFrameButton.dataset.sessionTacticalFrame);
return;
}
const tacticalAddFrameButton = event.target.closest("[data-session-add-tactical-frame]");
if (tacticalAddFrameButton) {
addSessionPlannerTacticalFrame();
return;
}
const tacticalDuplicateFrameButton = event.target.closest("[data-session-duplicate-tactical-frame]");
if (tacticalDuplicateFrameButton) {
duplicateSessionPlannerTacticalFrame();
return;
}
const tacticalDeleteFrameButton = event.target.closest("[data-session-delete-tactical-frame]");
if (tacticalDeleteFrameButton) {
deleteSessionPlannerTacticalFrame();
return;
}
const tacticalArrangeButton = event.target.closest("[data-session-arrange-tactical]");
if (tacticalArrangeButton) {
arrangeSelectedSessionPlannerTacticalElements(tacticalArrangeButton.dataset.sessionArrangeTactical);
return;
}
const tacticalToolButton = event.target.closest("[data-session-tactical-tool]");
if (tacticalToolButton) {
setSessionPlannerTacticalTool(tacticalToolButton.dataset.sessionTacticalTool);
return;
}
const tacticalClearButton = event.target.closest("[data-session-clear-board]");
if (tacticalClearButton) {
clearSelectedSessionPlannerTacticalBoard();
return;
}
const tacticalUndoButton = event.target.closest("[data-session-undo-board]");
if (tacticalUndoButton) {
undoSessionPlannerBoardHistory(tacticalUndoButton.dataset.sessionUndoBoard || "tactical");
return;
}
const boardRedoButton = event.target.closest("[data-session-redo-board]");
if (boardRedoButton) {
redoSessionPlannerBoardHistory(boardRedoButton.dataset.sessionRedoBoard || "tactical");
return;
}
const tacticalCopySelectedButton = event.target.closest("[data-session-copy-tactical-selected]");
if (tacticalCopySelectedButton) {
copySelectedSessionPlannerTacticalElements();
return;
}
const tacticalPasteButton = event.target.closest("[data-session-paste-tactical-clipboard]");
if (tacticalPasteButton) {
pasteSessionPlannerTacticalClipboard();
return;
}
const tacticalDeleteSelectedButton = event.target.closest("[data-session-delete-tactical-selected]");
if (tacticalDeleteSelectedButton) {
removeSelectedSessionPlannerTacticalElement();
return;
}
const tacticalCanvas = event.target.closest("[data-session-tactical-canvas]");
if (tacticalCanvas) {
handleSessionPlannerTacticalCanvasClick(event, tacticalCanvas);
return;
}
const previewVisualButton = event.target.closest("[data-session-preview-visual]");
if (previewVisualButton) {
setSessionPlannerVisualPreviewOpen(true);
return;
}
const openTacticalboardButton = event.target.closest("[data-session-open-tacticalboard]");
if (openTacticalboardButton) {
setSessionPlannerTacticalboardOpen(true);
return;
}
const openPlayerBoardButton = event.target.closest("[data-session-open-player-board]");
if (openPlayerBoardButton) {
setSessionPlannerPlayerBoardOpen(true);
return;
}
const openPrintButton = event.target.closest("[data-session-open-print]");
if (openPrintButton) {
setSessionPlannerPrintOverlayOpen(true);
return;
}
const toggleHistoryButton = event.target.closest("[data-session-toggle-history]");
if (toggleHistoryButton) {
sessionPlannerHistoryOpen = !sessionPlannerHistoryOpen;
if (sessionPlannerHistoryOpen) {
loadSessionPlannerHistory(sessionPlannerState?.selectedDate).catch(() => {});
}
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return;
}
const refreshHistoryButton = event.target.closest("[data-session-refresh-history]");
if (refreshHistoryButton) {
loadSessionPlannerHistory(sessionPlannerState?.selectedDate, { force: true }).catch(() => {});
return;
}
const restoreHistoryButton = event.target.closest("[data-session-restore-history]");
if (restoreHistoryButton) {
restoreSessionPlannerHistoryEntry(restoreHistoryButton.dataset.sessionRestoreHistory);
return;
}
const closeLibraryButton = event.target.closest("[data-session-close-library]");
if (closeLibraryButton) {
closeSessionPlannerLibrary();
return;
}
const openLibraryButton = event.target.closest("[data-session-open-library]");
if (openLibraryButton) {
setSessionPlannerLibraryOpen(true);
return;
}
const libraryFolderButton = event.target.closest("[data-session-library-folder]");
if (libraryFolderButton) {
selectSessionPlannerLibraryFolder(libraryFolderButton.dataset.sessionLibraryFolder);
return;
}
const archiveLibraryFolderButton = event.target.closest("[data-session-library-archive-folder]");
if (archiveLibraryFolderButton) {
archiveSessionPlannerExerciseLibraryFolder(archiveLibraryFolderButton.dataset.sessionLibraryArchiveFolder);
return;
}
const editLibraryFolderButton = event.target.closest("[data-session-library-edit-folder]");
if (editLibraryFolderButton) {
startSessionPlannerExerciseLibraryFolderEdit(editLibraryFolderButton.dataset.sessionLibraryEditFolder);
return;
}
const cancelLibraryFolderEditButton = event.target.closest("[data-session-library-cancel-folder-edit]");
if (cancelLibraryFolderEditButton) {
cancelSessionPlannerExerciseLibraryFolderEdit();
return;
}
const restoreLibraryFolderButton = event.target.closest("[data-session-library-restore-folder]");
if (restoreLibraryFolderButton) {
restoreSessionPlannerExerciseLibraryFolder(restoreLibraryFolderButton.dataset.sessionLibraryRestoreFolder);
return;
}
const saveExerciseButton = event.target.closest("[data-session-save-exercise]");
if (saveExerciseButton) {
saveSelectedSessionPlannerExerciseToLibrary();
return;
}
const multiSelectToggle = event.target.closest("[data-session-multiselect-toggle]");
if (multiSelectToggle) {
const field = multiSelectToggle.dataset.sessionMultiselectToggle;
const previousOpenField = sessionPlannerMultiSelectOpenField;
sessionPlannerMultiSelectOpenField = sessionPlannerMultiSelectOpenField === field ? "" : field;
refreshSessionPlannerMultiSelectFields([previousOpenField, field]);
return;
}
const multiSelectOption = event.target.closest("[data-session-multiselect-option]");
if (multiSelectOption) {
toggleSessionPlannerMultiSelectValue(
multiSelectOption.dataset.sessionMultiselectOption,
multiSelectOption.dataset.sessionMultiselectValue
);
return;
}
const multiSelectClear = event.target.closest("[data-session-multiselect-clear]");
if (multiSelectClear) {
clearSessionPlannerMultiSelectValue(multiSelectClear.dataset.sessionMultiselectClear);
return;
}
const todayButton = event.target.closest("[data-session-today]");
if (todayButton) {
jumpSessionPlannerToToday();
return;
}
const scrollDatesButton = event.target.closest("[data-session-scroll-dates]");
if (scrollDatesButton) {
scrollSessionPlannerDateStrip(Number(scrollDatesButton.dataset.sessionScrollDates) || 0);
return;
}
const dateButton = event.target.closest("[data-session-date]");
if (dateButton) {
selectSessionPlannerDate(dateButton.dataset.sessionDate);
return;
}
const moveBlockButton = event.target.closest("[data-session-move-block]");
if (moveBlockButton) {
moveSessionPlannerBlock(
moveBlockButton.dataset.sessionMoveBlock,
Number(moveBlockButton.dataset.sessionMoveDirection) || 0
);
return;
}
const deleteBlockButton = event.target.closest("[data-session-delete-block]");
if (deleteBlockButton) {
deleteSessionPlannerBlock(deleteBlockButton.dataset.sessionDeleteBlock);
return;
}
const blockButton = event.target.closest("[data-session-block-id]");
if (blockButton) {
selectSessionPlannerBlock(blockButton.dataset.sessionBlockId);
return;
}
const addMenuButton = event.target.closest("[data-session-add-menu-toggle]");
if (addMenuButton) {
setSessionPlannerAddMenuOpen(!sessionPlannerAddMenuOpen);
return;
}
const addNewExerciseButton = event.target.closest("[data-session-add-new]");
if (addNewExerciseButton) {
addSessionPlannerBlock();
return;
}
const addFromLibraryButton = event.target.closest("[data-session-add-from-library]");
if (addFromLibraryButton) {
addSessionPlannerBlock();
setSessionPlannerLibraryOpen(true);
return;
}
const addTacticalboardButton = event.target.closest("[data-session-add-tacticalboard]");
if (addTacticalboardButton) {
addSessionPlannerBlock();
setSessionPlannerTacticalboardOpen(true);
return;
}
const libraryButton = event.target.closest("[data-session-use-exercise]");
if (libraryButton) {
applySessionPlannerExercise(libraryButton.dataset.sessionUseExercise);
return;
}
const duplicateLibraryExerciseButton = event.target.closest("[data-session-duplicate-library-exercise]");
if (duplicateLibraryExerciseButton) {
duplicateSessionPlannerLibraryExercise(duplicateLibraryExerciseButton.dataset.sessionDuplicateLibraryExercise);
return;
}
const viewLibraryExerciseButton = event.target.closest("[data-session-view-exercise]");
if (viewLibraryExerciseButton) {
startSessionPlannerLibraryExerciseView(viewLibraryExerciseButton.dataset.sessionViewExercise);
return;
}
const editLibraryExerciseButton = event.target.closest("[data-session-edit-library-exercise]");
if (editLibraryExerciseButton) {
startSessionPlannerLibraryExerciseEdit(editLibraryExerciseButton.dataset.sessionEditLibraryExercise);
return;
}
const saveLibraryEditButton = event.target.closest("[data-session-save-library-edit]");
if (saveLibraryEditButton) {
updateSessionPlannerLibraryExerciseFromEdit(saveLibraryEditButton.dataset.sessionSaveLibraryEdit);
return;
}
const saveLibraryEditCopyButton = event.target.closest("[data-session-save-library-edit-copy]");
if (saveLibraryEditCopyButton) {
saveSessionPlannerLibraryExerciseEditAsCopy(saveLibraryEditCopyButton.dataset.sessionSaveLibraryEditCopy);
return;
}
const cancelLibraryEditButton = event.target.closest("[data-session-cancel-library-edit]");
if (cancelLibraryEditButton) {
cancelSessionPlannerLibraryExerciseEdit();
return;
}
if (event.target.matches("[data-session-library-edit-dialog]")) {
cancelSessionPlannerLibraryExerciseEdit();
return;
}
const closeLibraryViewButton = event.target.closest("[data-session-close-view]");
if (closeLibraryViewButton) {
closeSessionPlannerLibraryExerciseView();
return;
}
if (event.target.matches("[data-session-view-dialog]")) {
closeSessionPlannerLibraryExerciseView();
return;
}
const deleteLibraryExerciseButton = event.target.closest("[data-session-delete-library-exercise]");
if (deleteLibraryExerciseButton) {
deleteSessionPlannerLibraryExercise(deleteLibraryExerciseButton.dataset.sessionDeleteLibraryExercise);
return;
}
const restoreLibraryExerciseButton = event.target.closest("[data-session-restore-library-exercise]");
if (restoreLibraryExerciseButton) {
restoreSessionPlannerLibraryExercise(restoreLibraryExerciseButton.dataset.sessionRestoreLibraryExercise);
return;
}
const removeLibraryExerciseFromFolderButton = event.target.closest("[data-session-remove-library-exercise-from-folder]");
if (removeLibraryExerciseFromFolderButton) {
removeSessionPlannerExerciseFromLibraryFolder(
removeLibraryExerciseFromFolderButton.dataset.sessionRemoveLibraryExerciseFromFolder,
removeLibraryExerciseFromFolderButton.dataset.sessionRemoveLibraryFolder
);
return;
}
const libraryFilterToggle = event.target.closest("[data-session-library-filter-toggle]");
if (libraryFilterToggle) {
toggleSessionPlannerLibraryFilterOpen(libraryFilterToggle.dataset.sessionLibraryFilterToggle);
return;
}
const libraryFilterOption = event.target.closest("[data-session-library-filter-option]");
if (libraryFilterOption) {
toggleSessionPlannerLibraryFilterValue(
libraryFilterOption.dataset.sessionLibraryFilterOption,
libraryFilterOption.dataset.sessionLibraryFilterValue
);
return;
}
const libraryFilterClear = event.target.closest("[data-session-library-filter-clear]");
if (libraryFilterClear) {
clearSessionPlannerLibraryFilter(libraryFilterClear.dataset.sessionLibraryFilterClear);
return;
}
const libraryArchiveViewButton = event.target.closest("[data-session-library-archive-view]");
if (libraryArchiveViewButton) {
updateSessionPlannerLibraryArchiveView(libraryArchiveViewButton.dataset.sessionLibraryArchiveView);
return;
}
});
ui.sessionPlannerWorkspace?.addEventListener("dblclick", (event) => {
const playerBoardToken = event.target.closest("[data-session-player-board-token]");
if (playerBoardToken) {
openSessionPlannerPlayerBoardProfile(playerBoardToken.dataset.sessionPlayerBoardToken);
return;
}
const tacticalCanvas = event.target.closest("[data-session-tactical-canvas]");
if (!tacticalCanvas) {
return;
}
handleSessionPlannerTacticalCanvasDoubleClick(event, tacticalCanvas);
});
ui.sessionPlannerWorkspace?.addEventListener("contextmenu", (event) => {
handleSessionPlannerPlayerBoardContextMenu(event);
});
ui.sessionPlannerWorkspace?.addEventListener("submit", (event) => {
const libraryFolderEditForm = event.target.closest?.("[data-session-library-folder-edit-form]");
if (libraryFolderEditForm) {
event.preventDefault();
updateSessionPlannerExerciseLibraryFolderFromForm(libraryFolderEditForm);
return;
}
const libraryFolderForm = event.target.closest?.("[data-session-library-folder-form]");
if (libraryFolderForm) {
event.preventDefault();
createSessionPlannerExerciseLibraryFolderFromForm(libraryFolderForm);
return;
}
const playerBoardPersonForm = event.target.closest?.("[data-session-player-board-person-form]");
if (playerBoardPersonForm) {
event.preventDefault();
saveSessionPlannerPlayerBoardCustomPersonFromForm(playerBoardPersonForm);
return;
}
const playerBoardAutoForm = event.target.closest?.("[data-session-player-board-auto-form]");
if (playerBoardAutoForm) {
event.preventDefault();
const teamCountField = playerBoardAutoForm.querySelector("[data-session-player-board-team-count]");
const autoModeField = playerBoardAutoForm.querySelector("[data-session-player-board-auto-mode]");
sessionPlannerPlayerBoardTeamCount = normalizeSessionPlannerPlayerBoardTeamCount(teamCountField?.value);
sessionPlannerPlayerBoardAutoMode = normalizeSessionPlannerPlayerBoardAutoMode(autoModeField?.value);
applySessionPlannerPlayerBoardAutoSelect();
return;
}
const playerBoardCopyForm = event.target.closest?.("[data-session-player-board-copy-form]");
if (playerBoardCopyForm) {
event.preventDefault();
const sourceField = playerBoardCopyForm.querySelector("[data-session-player-board-copy-source]");
copySessionPlannerPlayerBoardTeamsFromBlock(sourceField?.value);
return;
}
const playerBoardFormationForm = event.target.closest?.("[data-session-player-board-formation-form]");
if (!playerBoardFormationForm) {
return;
}
event.preventDefault();
const formationInput = playerBoardFormationForm.querySelector("[data-session-player-board-formation-input]");
sessionPlannerPlayerBoardFormationInput = normalizeSessionPlannerPlayerBoardFormationValue(formationInput?.value);
applySessionPlannerPlayerBoardFormation();
});
ui.sessionPlannerWorkspace?.addEventListener("dragstart", (event) => {
const libraryExerciseItem = event.target.closest("[data-session-library-drag-exercise]");
if (libraryExerciseItem && canEditSessionPlanner()) {
sessionPlannerDraggedLibraryExerciseId = libraryExerciseItem.dataset.sessionLibraryDragExercise;
libraryExerciseItem.classList.add("is-dragging");
event.dataTransfer.effectAllowed = "copy";
event.dataTransfer.setData("text/plain", sessionPlannerDraggedLibraryExerciseId);
return;
}
const row = event.target.closest("[data-session-block-drop-id]");
if (!row || !canEditSessionPlanner()) {
return;
}
sessionPlannerDraggedBlockId = row.dataset.sessionBlockDropId;
row.classList.add("is-dragging");
event.dataTransfer.effectAllowed = "move";
event.dataTransfer.setData("text/plain", sessionPlannerDraggedBlockId);
});
ui.sessionPlannerWorkspace?.addEventListener("dragover", (event) => {
const folderDropTarget = event.target.closest("[data-session-library-folder-drop]");
if (folderDropTarget && sessionPlannerDraggedLibraryExerciseId) {
event.preventDefault();
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-library-folder-card.is-drop-target")
.forEach((folderCard) => {
if (folderCard !== folderDropTarget) {
folderCard.classList.remove("is-drop-target");
}
});
folderDropTarget.classList.add("is-drop-target");
event.dataTransfer.dropEffect = "copy";
return;
}
const row = event.target.closest("[data-session-block-drop-id]");
if (!row || !sessionPlannerDraggedBlockId || row.dataset.sessionBlockDropId === sessionPlannerDraggedBlockId) {
return;
}
event.preventDefault();
const placement = getSessionPlannerBlockDropPlacement(event, row);
ui.sessionPlannerWorkspace
?.querySelectorAll(".session-block-row.is-drop-before, .session-block-row.is-drop-after")
.forEach((dropRow) => {
if (dropRow !== row) {
dropRow.classList.remove("is-drop-before", "is-drop-after");
}
});
row.classList.toggle("is-drop-before", placement === "before");
row.classList.toggle("is-drop-after", placement === "after");
event.dataTransfer.dropEffect = "move";
});
ui.sessionPlannerWorkspace?.addEventListener("dragleave", (event) => {
const folderDropTarget = event.target.closest("[data-session-library-folder-drop]");
if (folderDropTarget) {
folderDropTarget.classList.remove("is-drop-target");
return;
}
const row = event.target.closest("[data-session-block-drop-id]");
if (!row) {
return;
}
row.classList.remove("is-drop-before", "is-drop-after");
});
ui.sessionPlannerWorkspace?.addEventListener("drop", (event) => {
const folderDropTarget = event.target.closest("[data-session-library-folder-drop]");
if (folderDropTarget && sessionPlannerDraggedLibraryExerciseId) {
event.preventDefault();
addSessionPlannerExerciseToLibraryFolder(
sessionPlannerDraggedLibraryExerciseId,
folderDropTarget.dataset.sessionLibraryFolderDrop
);
clearSessionPlannerLibraryDragState();
return;
}
const row = event.target.closest("[data-session-block-drop-id]");
if (!row || !sessionPlannerDraggedBlockId) {
return;
}
event.preventDefault();
reorderSessionPlannerBlock(
sessionPlannerDraggedBlockId,
row.dataset.sessionBlockDropId,
getSessionPlannerBlockDropPlacement(event, row)
);
clearSessionPlannerBlockDragState();
});
ui.sessionPlannerWorkspace?.addEventListener("dragend", () => {
clearSessionPlannerBlockDragState();
clearSessionPlannerLibraryDragState();
});
ui.sessionPlannerWorkspace?.addEventListener("pointerdown", (event) => {
if (startSessionPlannerLibraryPointerDrag(event)) {
return;
}
if (startSessionPlannerPlayerBoardDrag(event)) {
return;
}
if (startSessionPlannerPlayerBoardSelection(event)) {
return;
}
startSessionPlannerTacticalDrag(event);
});
win.addEventListener("pointermove", (event) => {
if (updateSessionPlannerLibraryPointerDrag(event)) {
return;
}
if (updateSessionPlannerPlayerBoardDrag(event)) {
return;
}
if (updateSessionPlannerPlayerBoardSelection(event)) {
return;
}
updateSessionPlannerTacticalDrag(event);
});
win.addEventListener("pointerup", (event) => {
if (finishSessionPlannerLibraryPointerDrag(event)) {
return;
}
if (finishSessionPlannerPlayerBoardDrag()) {
return;
}
if (finishSessionPlannerPlayerBoardSelection()) {
return;
}
finishSessionPlannerTacticalDrag();
});
ui.sessionPlannerWorkspace?.addEventListener("input", (event) => {
const playerBoardFormationInput = event.target.closest("[data-session-player-board-formation-input]");
if (playerBoardFormationInput) {
sessionPlannerPlayerBoardFormationInput = cleanSessionPlannerPlayerBoardFormationInput(playerBoardFormationInput.value);
playerBoardFormationInput.value = sessionPlannerPlayerBoardFormationInput;
return;
}
const tacticalColorField = event.target.closest("[data-session-tactical-color]");
if (tacticalColorField) {
sessionPlannerTacticalColor = normalizeTacticalColor(tacticalColorField.value, sessionPlannerTacticalColor);
if (getSessionPlannerTacticalSelectedElementIds().length) {
updateSelectedSessionPlannerTacticalElement({ color: sessionPlannerTacticalColor });
}
return;
}
const tacticalWidthField = event.target.closest("[data-session-tactical-width]");
if (tacticalWidthField) {
sessionPlannerTacticalLineWidth = normalizeTacticalLineWidth(
tacticalWidthField.value,
sessionPlannerTacticalLineWidth
);
if (getSelectedSessionPlannerTacticalElements().some(isSessionPlannerTacticalStrokeElement)) {
updateSelectedSessionPlannerTacticalElement({ lineWidth: sessionPlannerTacticalLineWidth });
}
return;
}
const tacticalStyleInput = event.target.closest("[data-session-tactical-style]");
if (tacticalStyleInput) {
updateSessionPlannerTacticalLineStyle(tacticalStyleInput.value);
return;
}
if (sessionPlannerPeriodizationBridge.handleInput(event)) {
return;
}
const librarySearchField = event.target.closest("[data-session-library-search]");
if (librarySearchField) {
updateSessionPlannerLibrarySearch(librarySearchField.value);
return;
}
const field = event.target.closest("[data-session-field]");
if (!field) {
return;
}
updateSelectedSessionPlannerBlockField(field.dataset.sessionField, field.value);
resizeSessionPlannerTextarea(field);
});
ui.sessionPlannerWorkspace?.addEventListener("change", (event) => {
const playerBoardColorSelect = event.target.closest("[data-session-player-board-color-select]");
if (playerBoardColorSelect) {
const colorValue = playerBoardColorSelect.value;
if (colorValue) {
updateSessionPlannerPlayerBoardSelectedColor(colorValue);
}
playerBoardColorSelect.value = "";
return;
}
const playerBoardTeamCountField = event.target.closest("[data-session-player-board-team-count]");
if (playerBoardTeamCountField) {
sessionPlannerPlayerBoardTeamCount = normalizeSessionPlannerPlayerBoardTeamCount(playerBoardTeamCountField.value);
playerBoardTeamCountField.value = String(sessionPlannerPlayerBoardTeamCount);
return;
}
const playerBoardAutoModeField = event.target.closest("[data-session-player-board-auto-mode]");
if (playerBoardAutoModeField) {
sessionPlannerPlayerBoardAutoMode = normalizeSessionPlannerPlayerBoardAutoMode(playerBoardAutoModeField.value);
playerBoardAutoModeField.value = sessionPlannerPlayerBoardAutoMode;
return;
}
const printPaperField = event.target.closest("[data-session-print-paper]");
if (printPaperField) {
updateSessionPlannerPrintPaper(printPaperField.value);
return;
}
const printSectionField = event.target.closest("[data-session-print-section]");
if (printSectionField) {
updateSessionPlannerPrintSection(printSectionField.dataset.sessionPrintSection, printSectionField.checked);
return;
}
const tacticalPitchModeField = event.target.closest("[data-session-tactical-pitch-mode]");
if (tacticalPitchModeField) {
setSessionPlannerTacticalPitchMode(tacticalPitchModeField.value);
return;
}
const tacticalStyleField = event.target.closest("[data-session-tactical-style]");
if (tacticalStyleField) {
updateSessionPlannerTacticalLineStyle(tacticalStyleField.value);
return;
}
const visualUploadField = event.target.closest("[data-session-upload-visual]");
if (visualUploadField) {
handleSessionPlannerVisualUpload(visualUploadField.files?.[0]);
visualUploadField.value = "";
return;
}
if (sessionPlannerPeriodizationBridge.handleChange(event)) {
return;
}
const libraryFilter = event.target.closest("[data-session-library-filter]");
if (libraryFilter) {
updateSessionPlannerLibraryFilter(libraryFilter.dataset.sessionLibraryFilter, libraryFilter.value);
return;
}
const librarySort = event.target.closest("[data-session-library-sort]");
if (librarySort) {
updateSessionPlannerLibrarySortMode(librarySort.value);
return;
}
const field = event.target.closest("[data-session-field]");
if (!field) {
return;
}
updateSelectedSessionPlannerBlockField(field.dataset.sessionField, field.value, {
syncExerciseReview: field.dataset.sessionField === "postSessionNotes",
});
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
});
const SESSION_TACTICALBOARD_KEY_HANDLED = "__sessionTacticalboardKeyHandled";
function isSessionPlannerShortcutTextEditingTarget(target) {
return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}
function hasSessionPlannerActiveTextSelection() {
const selection = win.getSelection?.();
return Boolean(selection && !selection.isCollapsed && String(selection).trim());
}
function shouldHandleSessionPlannerTacticalboardShortcut(event, options = {}) {
if (!sessionPlannerTacticalboardOpen || event[SESSION_TACTICALBOARD_KEY_HANDLED]) {
return false;
}
if (isSessionPlannerShortcutTextEditingTarget(event.target)) {
return false;
}
if (options.skipWhenTextSelected && hasSessionPlannerActiveTextSelection()) {
return false;
}
if (options.requireSelection && !getSessionPlannerTacticalSelectedElementIds().length) {
return false;
}
return true;
}
function handleSessionPlannerTacticalboardKeydown(event) {
if (!shouldHandleSessionPlannerTacticalboardShortcut(event)) {
return;
}
const isTextEditingTarget = isSessionPlannerShortcutTextEditingTarget(event.target);
const isUndoShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z";
const isCopyShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c";
const isPasteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v";
const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
const hasSelectedTacticalElements = getSessionPlannerTacticalSelectedElementIds().length > 0;
if (isUndoShortcut && !isTextEditingTarget) {
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
undoSelectedSessionPlannerTacticalBoardAction();
return;
}
if (event.key === "Escape") {
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
sessionPlannerTacticalSelectionState = null;
clearSessionPlannerTacticalSelection();
refreshSessionPlannerTacticalboardCanvas();
return;
}
if (isCopyShortcut && !isTextEditingTarget && hasSelectedTacticalElements) {
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
copySelectedSessionPlannerTacticalElements();
return;
}
if (isPasteShortcut && !isTextEditingTarget) {
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
pasteSessionPlannerTacticalClipboard();
return;
}
const playerBadgeKey = getSessionPlannerTacticalPlayerBadgeFromKeyboardEvent(event);
if (playerBadgeKey && updateSelectedSessionPlannerTacticalPlayerBadges(playerBadgeKey)) {
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
return;
}
if (isDeleteKey && !isTextEditingTarget && (sessionPlannerTacticalPendingPoint || hasSelectedTacticalElements)) {
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
if (sessionPlannerTacticalPendingPoint) {
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
refreshSessionPlannerTacticalboardCanvas();
return;
}
removeSelectedSessionPlannerTacticalElement();
}
}
function handleSessionPlannerTacticalboardCopy(event) {
if (
!shouldHandleSessionPlannerTacticalboardShortcut(event, {
requireSelection: true,
skipWhenTextSelected: true,
})
) {
return;
}
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
const selectedCount = getSessionPlannerTacticalSelectedElementIds().length;
event.clipboardData?.setData("text/plain", `Football Science tactical selection (${selectedCount} item${selectedCount === 1 ? "" : "s"})`);
copySelectedSessionPlannerTacticalElements();
}
function handleSessionPlannerTacticalboardPaste(event) {
if (
!sessionPlannerTacticalClipboard.length ||
!shouldHandleSessionPlannerTacticalboardShortcut(event, { skipWhenTextSelected: true })
) {
return;
}
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
pasteSessionPlannerTacticalClipboard();
}
function handleSessionPlannerTacticalboardDeleteKeyup(event) {
const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
if (!isDeleteKey || !shouldHandleSessionPlannerTacticalboardShortcut(event)) {
return;
}
const hasSelectedTacticalElements = getSessionPlannerTacticalSelectedElementIds().length > 0;
if (!sessionPlannerTacticalPendingPoint && !hasSelectedTacticalElements) {
return;
}
event.preventDefault();
event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
if (sessionPlannerTacticalPendingPoint) {
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
refreshSessionPlannerTacticalboardCanvas();
return;
}
removeSelectedSessionPlannerTacticalElement();
}
win.addEventListener("keydown", handleSessionPlannerTacticalboardKeydown, true);
win.addEventListener("keyup", handleSessionPlannerTacticalboardDeleteKeyup, true);
win.addEventListener("copy", handleSessionPlannerTacticalboardCopy, true);
win.addEventListener("paste", handleSessionPlannerTacticalboardPaste, true);
win.addEventListener("afterprint", removeSessionPlannerPrintRoot);
ui.sessionPlannerWorkspace?.addEventListener("keydown", (event) => {
if (event[SESSION_TACTICALBOARD_KEY_HANDLED]) {
return;
}
const isTextEditingTarget = Boolean(event.target.closest?.("input, textarea, select, [contenteditable='true']"));
if (sessionPlannerPlayerBoardOpen && event.key === "Escape") {
event.preventDefault();
if (sessionPlannerPlayerBoardAssistantOpen) {
sessionPlannerPlayerBoardAssistantOpen = false;
renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
return;
}
if (sessionPlannerPlayerBoardSelectedPlayerId) {
closeSessionPlannerPlayerBoardProfile();
return;
}
setSessionPlannerPlayerBoardOpen(false);
return;
}
if (sessionPlannerPrintOverlayOpen && event.key === "Escape") {
event.preventDefault();
setSessionPlannerPrintOverlayOpen(false);
return;
}
if (
sessionPlannerTacticalboardOpen &&
(event.metaKey || event.ctrlKey) &&
event.key.toLowerCase() === "z"
) {
event.preventDefault();
if (event.shiftKey) {
redoSessionPlannerBoardHistory("tactical");
} else {
undoSessionPlannerBoardHistory("tactical");
}
return;
}
if (
sessionPlannerPlayerBoardOpen &&
(event.metaKey || event.ctrlKey) &&
event.key.toLowerCase() === "z" &&
!isTextEditingTarget
) {
event.preventDefault();
if (event.shiftKey) {
redoSessionPlannerBoardHistory("player");
} else {
undoSessionPlannerBoardHistory("player");
}
return;
}
if (sessionPlannerTacticalboardOpen && event.key === "Escape") {
event.preventDefault();
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
sessionPlannerTacticalSelectionState = null;
clearSessionPlannerTacticalSelection();
refreshSessionPlannerTacticalboardCanvas();
return;
}
if (
sessionPlannerTacticalboardOpen &&
(event.key === "Backspace" || event.key === "Delete") &&
sessionPlannerTacticalPendingPoint
) {
event.preventDefault();
sessionPlannerTacticalPendingPoint = null;
sessionPlannerTacticalDraftLineState = null;
refreshSessionPlannerTacticalboardCanvas();
return;
}
const hasSelectedTacticalElements = getSessionPlannerTacticalSelectedElementIds().length > 0;
if (
sessionPlannerTacticalboardOpen &&
!isTextEditingTarget &&
(event.key === "Backspace" || event.key === "Delete") &&
hasSelectedTacticalElements
) {
event.preventDefault();
removeSelectedSessionPlannerTacticalElement();
return;
}
sessionPlannerPeriodizationBridge.handleKeydown(event);
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
ui.scoutingWorkspace?.addEventListener("click", (event) => {
scoutingWorkspaceModule?.handleClick(event, getScoutingWorkspaceContext());
});
ui.scoutingWorkspace?.addEventListener("input", (event) => {
scoutingWorkspaceModule?.handleInput(event, getScoutingWorkspaceContext());
});
ui.scoutingWorkspace?.addEventListener("change", (event) => {
scoutingWorkspaceModule?.handleChange(event, getScoutingWorkspaceContext());
});
ui.scoutingWorkspace?.addEventListener("submit", (event) => {
scoutingWorkspaceModule?.handleSubmit(event, getScoutingWorkspaceContext());
});
["click", "input", "change", "submit"].forEach((type) => {
ui.gameplanWorkspace?.addEventListener(type, (event) =>
gpModule?.[`handle${type[0].toUpperCase()}${type.slice(1)}`]?.(event, getGameplanContext())
);
});
ui.transferRoomWorkspace?.addEventListener("click", (event) => {
transferRoomRuntime.workspaceModule?.handleClick(event, getTransferRoomWorkspaceContext());
});
ui.transferRoomWorkspace?.addEventListener("input", (event) => {
transferRoomRuntime.workspaceModule?.handleInput(event, getTransferRoomWorkspaceContext());
});
ui.transferRoomWorkspace?.addEventListener("change", (event) => {
transferRoomRuntime.workspaceModule?.handleChange(event, getTransferRoomWorkspaceContext());
});
ui.transferRoomWorkspace?.addEventListener("submit", (event) => {
transferRoomRuntime.workspaceModule?.handleSubmit(event, getTransferRoomWorkspaceContext());
});
ui.analysisRoomWorkspace?.addEventListener("click", (event) => {
scoutingWorkspaceModule?.handleClick(event, getScoutingAnalysisRoomContext());
});
ui.analysisRoomWorkspace?.addEventListener("input", (event) => {
scoutingWorkspaceModule?.handleInput(event, getScoutingAnalysisRoomContext());
});
ui.analysisRoomWorkspace?.addEventListener("change", (event) => {
scoutingWorkspaceModule?.handleChange(event, getScoutingAnalysisRoomContext());
});
ui.analysisRoomWorkspace?.addEventListener("submit", (event) => {
scoutingWorkspaceModule?.handleSubmit(event, getScoutingAnalysisRoomContext());
});
ui.simulatorIntroEnterButton?.addEventListener("click", () => launchGameSimulatorFromIntro().catch(console.error));
ui.pitchFullscreenButton?.addEventListener("click", () => togglePitchFullscreen().catch(console.error));
document.addEventListener("mousemove", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (trigger) {
showMetricTooltip(trigger);
return;
}
hideMetricTooltip();
});
document.addEventListener("click", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (!trigger) {
hideMetricTooltip({ force: true });
return;
}
event.preventDefault();
event.stopPropagation();
if (pinnedMetricTooltipTarget === trigger && !ui.metricTooltip?.hidden) {
hideMetricTooltip({ force: true });
return;
}
showMetricTooltip(trigger, { pinned: true });
});
document.addEventListener("focusin", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (trigger) {
showMetricTooltip(trigger);
}
});
document.addEventListener("focusout", (event) => {
const trigger = event.target.closest?.("[data-metric-help]");
if (trigger && pinnedMetricTooltipTarget !== trigger) {
hideMetricTooltip();
}
});
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
if (event.key === "Escape" && activeMetricTooltipTarget) {
hideMetricTooltip({ force: true });
}
});
document.querySelectorAll(".hub-rail-button").forEach((button) => {
button.addEventListener("click", () => {
setActiveWorkspace(button.dataset.openWorkspace);
});
});
ui.previousStepButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
goToSequenceFrame(state.sequence.currentFrameIndex - 1);
updateSequenceButtons();
render();
});
ui.nextStepButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
goToSequenceFrame(state.sequence.currentFrameIndex + 1);
updateSequenceButtons();
render();
});
ui.playSequenceButton.addEventListener("click", () => {
if (state.sequence.isPlaying) {
stopSequencePlayback();
render();
return;
}
if (state.isRunning) {
return;
}
startSequencePlayback();
updateSequenceButtons();
render();
});
ui.clearSequenceButton.addEventListener("click", () => {
if (state.isRunning && !state.sequence.isPlaying) {
return;
}
if (state.sequence.isPlaying) {
stopSequencePlayback(false);
}
state.sequence.steps = [];
state.sequence.initialSnapshot = null;
state.sequence.dirty = false;
state.sequence.playbackIndex = -1;
state.sequence.currentFrameIndex = -1;
state.example = null;
state.scenario = { ...defaultScenarioInfo };
state.simulatorDirty = false;
cancelSequenceAdvance();
clearBallAction();
applyKickoffSetup(state, {
teamId: defaultKickoffTeamId,
resetFormations: true,
});
state.time = 0;
logEvent("Sequence cleared. New sequence starts with a kick-off.");
updateSequenceButtons();
render();
});
ui.saveSequenceButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
saveSequenceToLocal();
render();
});
ui.loadSequenceButton.addEventListener("click", () => {
if (!canEditScenario()) {
return;
}
loadSequenceFromLocal();
render();
});
ui.downloadSequenceButton.addEventListener("click", () => {
downloadSequence();
});
ui.playerTable.addEventListener("click", (event) => {
const button = event.target.closest("[data-player-id]");
if (!button) {
return;
}
if (!hasBallAction() && isSelectionModifierActive(event)) {
toggleSelectedPlayer(button.dataset.playerId);
} else {
setSingleSelectedPlayer(button.dataset.playerId);
}
render();
});
function handleSelectedPlayerProfileChange(event) {
const select = event.target.closest("[data-selected-player-profile]");
if (!select) {
return;
}
updateSelectedPlayerProfile(select.dataset.selectedPlayerProfile, select.value);
}
function handleSelectedPlayerProfileClick(event) {
const button = event.target.closest("[data-selected-player-profile-option]");
if (!button) {
return;
}
updateSelectedPlayerProfile(
button.dataset.selectedPlayerProfileOption,
button.dataset.playerProfileKey
);
}
ui.selectedPlayerCard?.addEventListener("change", handleSelectedPlayerProfileChange);
ui.fullscreenSelectedPlayerCard?.addEventListener("change", handleSelectedPlayerProfileChange);
ui.selectedPlayerCard?.addEventListener("click", handleSelectedPlayerProfileClick);
ui.fullscreenSelectedPlayerCard?.addEventListener("click", handleSelectedPlayerProfileClick);
ui.sequenceList.addEventListener("click", (event) => {
const stepCard = event.target.closest("[data-sequence-frame-index]");
if (!stepCard || !canEditScenario()) {
return;
}
goToSequenceFrame(Number(stepCard.dataset.sequenceFrameIndex));
updateSequenceButtons();
render();
});
ui.savedSequenceList.addEventListener("click", (event) => {
const button = event.target.closest("[data-saved-sequence-action]");
if (!button || !canEditScenario()) {
return;
}
const { savedSequenceAction, savedSequenceId } = button.dataset;
if (!savedSequenceId) {
return;
}
if (savedSequenceAction === "load") {
loadSavedSequenceEntry(savedSequenceId);
render();
return;
}
if (savedSequenceAction === "download") {
const entry = getSavedSequenceById(savedSequenceId);
if (entry) {
downloadSequence(entry.sequence, entry.name);
}
return;
}
if (savedSequenceAction === "delete") {
removeSavedSequenceEntry(savedSequenceId);
render();
}
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
canvas.addEventListener("pointerdown", gameSimulatorPointerController.handlePointerDown);
canvas.addEventListener("pointermove", gameSimulatorPointerController.handlePointerMove);
canvas.addEventListener("pointerup", gameSimulatorPointerController.handlePointerUp);
canvas.addEventListener("pointercancel", gameSimulatorPointerController.handlePointerCancel);
canvas.addEventListener("dblclick", gameSimulatorPointerController.handleCanvasDoubleClick);
ui.playbackSpeedLabel.textContent = `${state.playbackSpeed.toFixed(2)}x`;
syncBallSpeedControls();
syncDribbleSpeedControls();
syncSurfaceControls();
syncWeatherControls();
syncDefensiveAggressionControls();
syncTeamIdentityControls();
syncPhysicalProfileControls();
refreshDataSafetyStatus();
initializeWorkspaceHub();
startDashboardPresenceRuntime();
updateModeButtons();
syncDefensiveAutopilotButton();
syncOffensiveAutopilotButton();
syncFormationControls();
updateSequenceButtons();
if (hubState?.activeWorkspaceId === "game-simulator") {
queueGameSimulatorControllersLoad();
render();
startSimulatorAnimationLoop();
}
