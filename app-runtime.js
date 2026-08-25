import { createDashboardChatMessageTextRenderer, createDashboardChatWidgetRenderer, renderDashboardChatMessageStatus } from "./src/modules/chat/chat-widget-renderer.mjs";
import { confirmPlatformAction } from "./src/core/platform-confirm-dialog.mjs";
import { createDashboardChatAttachmentRenderer } from "./src/modules/chat/chat-attachment-renderer.mjs";
import { createDashboardChatAttachmentPreview } from "./src/modules/chat/chat-attachment-preview.mjs";
import { createDashboardChatApiUiActions } from "./src/modules/chat/chat-api-ui-actions.mjs";
import { createDashboardChatApiDomainRuntime } from "./src/modules/chat/dashboard-chat-api-domain-runtime.mjs?v=chat-thread-scroll-recovery-20260715";
import { createDashboardChatApiRuntime } from "./src/modules/chat/dashboard-chat-api-runtime.mjs?v=chat-thread-scroll-recovery-20260715";
import { createDashboardChatThreadSettingsStore } from "./src/modules/chat/chat-thread-settings.mjs";
import { createDashboardChatDomainRuntime } from "./src/modules/chat/dashboard-chat-domain-runtime.mjs?v=chat-dm-send-20260714";
import { createDashboardChatMessageRuntime } from "./src/modules/chat/dashboard-chat-message-runtime.mjs?v=chat-history-tombstone-20260629";
import { createDashboardChatMessageActionsRuntime } from "./src/modules/chat/dashboard-chat-message-actions-runtime.mjs";
import { createDashboardChatMessageRenderRuntime } from "./src/modules/chat/dashboard-chat-message-render-runtime.mjs";
import { createDashboardChatWidgetRuntime } from "./src/modules/chat/dashboard-chat-widget-runtime.mjs?v=chat-thread-scroll-recovery-20260715";
import { createDashboardChatLauncherRuntime } from "./src/modules/chat/dashboard-chat-launcher-runtime.mjs";
import { createDashboardChatComposerRuntime } from "./src/modules/chat/dashboard-chat-composer-runtime.mjs";
import { createDashboardChatThreadRuntime } from "./src/modules/chat/dashboard-chat-thread-runtime.mjs";
import { createDashboardChatPresenceRuntime } from "./src/modules/chat/dashboard-chat-presence-runtime.mjs";
import { createChatPushClient } from "./src/modules/chat/chat-push-client.mjs";
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
import {
  createPresentationModeController,
  createPresentationModeRenderer,
  dashboardPresentationStorageKey,
  mergeDashboardPresentationStatePreservingLocalEdits,
} from "./src/modules/presentation-mode/index.mjs";
import { formatMonthYearLabel, formatScheduleBlockSummary as formatScheduleBlockSummaryFromModule, formatScheduleMonthName, getScheduleDayWarnings as getScheduleDayWarningsFromModule, getScheduleMainEvent as getScheduleMainEventFromModule, isScheduleSessionEvent as isScheduleSessionEventFromModule } from "./src/modules/schedule/schedule-selectors.mjs";
import { createScheduleHomeMonthRenderer } from "./src/modules/schedule/schedule-home-month-renderer.mjs";
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
import {
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
import { bindSessionPlannerRuntimeBindings, createSessionPlannerAutosaveBoundary, formatSessionPlannerHistoryTime as formatSessionPlannerHistoryTimeFromModule, getSessionPlannerHistoryActionLabel as getSessionPlannerHistoryActionLabelFromModule, getSessionPlannerHistoryActorLabel as getSessionPlannerHistoryActorLabelFromModule, sessionPlannerPlayerBoardAutoModeOptions, sessionPlannerPlayerBoardColorOptions, sessionPlannerPlayerBoardMaxTeamCount, sessionPlannerPrintPaperOptions, sessionPlannerPrintSectionOptions, sessionPlannerStorageKey, sessionPlannerTacticalMaxFrames, sessionPlannerTacticalPitchDimensions, sessionPlannerTacticalPitchModeKeys, sessionPlannerTacticalPitchModeOptions, sessionPlannerTacticalSnapStep } from "./src/modules/session-planner/index.mjs";
import { createSessionPlannerAppRuntimeComposition } from "./src/modules/session-planner/session-planner-app-runtime-composer.mjs";
import { clearSelectedSessionPlannerTacticalBoard, getSessionPlannerTacticalEndpointCoordinates, getMedicalAvailabilityItems, getSessionPlannerSelectedSession, getSessionPlannerSelectedBlock, getSessionPlannerPlayerBoardSelectedColorIds, getSessionPlannerTacticalActiveFrameId, ensureSessionPlannerTacticalFrames, getSessionPlannerTacticalSelectedElementIds, clearSessionPlannerTacticalSelection, isSessionPlannerTacticalElementSelected, renderSessionPlannerTacticalSelectionBox, isSessionPlannerTacticalEndpointElement, updateSelectedSessionPlannerBlockField, getSessionPlannerDateLabel, renderSessionPlannerExerciseVisual, renderSessionPlannerActionIcon, canRemoveSessionPlannerLibraryExerciseFromSelectedFolder, getSessionPlannerPlayerBoardProfileState, getSessionPlannerPlayerBoardSyncedPlayer, getSessionPlannerPlayerBoardBridgeContract, getSessionPlannerPlayerBoardBridgeRoleLabel, getSessionPlannerPlayerBoardBridgeBestMatches, getSessionPlannerPlayerBoardBridgeSummary, getSessionPlannerPlayerBoardCustomPerson, getSessionPlannerPlayerBoardPlayers, getSessionPlannerPlayerBoardSummary, getSessionPlannerPlayerBoardWarnings, syncSessionPlannerPlayerBoardSelection, getSessionPlannerPlayerBoardPosition, getSessionPlannerPlayerBoardPositionById, getSessionPlannerPlayerBoardReadableSpacing, getSessionPlannerReadablePlayerBoardPositions, formatSessionPlannerHistoryTime, getSessionPlannerHistoryActorLabel, getSessionPlannerHistoryActionLabel, getSessionPlannerMedicalAvailability, renderSessionPlannerWorkspace, ensureSessionPlannerSelectedSession, selectSessionPlannerDate, selectSessionPlannerBlock, addSessionPlannerBlock, renumberSessionPlannerExerciseBlocks, moveSessionPlannerBlock, reorderSessionPlannerBlock, getSessionPlannerBlockDropPlacement, clearSessionPlannerBlockDragState, clearSessionPlannerLibraryDragState, updateSessionPlannerLibraryPointerDropTarget, startSessionPlannerLibraryPointerDrag, updateSessionPlannerLibraryPointerDrag, finishSessionPlannerLibraryPointerDrag, deleteSessionPlannerBlock, setSessionPlannerLibraryOpen, closeSessionPlannerLibrary, setSessionPlannerAddMenuOpen, setSessionPlannerVisualPreviewOpen, syncSessionPlannerPrintModeClass, setSessionPlannerPrintOverlayOpen, setSessionPlannerTacticalboardOpen, setSessionPlannerPlayerBoardOpen, openSessionPlannerPlayerBoardProfile, closeSessionPlannerPlayerBoardProfile, getSessionPlannerPlayerBoardVisiblePlayerIds, normalizeSessionPlannerPlayerBoardSelectedIds, setSessionPlannerPlayerBoardSelectedPlayers, toggleSessionPlannerPlayerBoardSelectedPlayer, syncSessionPlannerPlayerBoardSelectionUi, updateSessionPlannerPlayerBoardSelectedColor, clearSessionPlannerPlayerBoardSelectedColors, getSessionPlannerPlayerBoardContextPosition, normalizeSessionPlannerPlayerBoardCustomPersonPromptValue, getSessionPlannerPlayerBoardCustomPersonKind, removeSessionPlannerPlayerBoardCustomPerson, openSessionPlannerPlayerBoardCustomPersonEditor, closeSessionPlannerPlayerBoardCustomPersonEditor, saveSessionPlannerPlayerBoardCustomPersonFromForm, handleSessionPlannerPlayerBoardContextMenu, resetSessionPlannerPlayerBoardPositions, getSessionPlannerTacticalFrames, syncSessionPlannerTacticalActiveFrame, persistSessionPlannerTacticalElements, commitSessionPlannerTacticalFrames, addSessionPlannerTacticalFrame, selectSessionPlannerTacticalFrame, duplicateSessionPlannerTacticalFrame, deleteSessionPlannerTacticalFrame, refreshSessionPlannerTacticalboardCanvas, isSessionPlannerTacticalLineTool, isSessionPlannerTacticalStrokeElement, isSessionPlannerTacticalPlacementTool, uniqueValues, setSessionPlannerTacticalSelectedElements, isSessionPlannerTacticalSelectionToggleModifier, toggleSessionPlannerTacticalElementSelection, setSessionPlannerTacticalClickSuppression, setSessionPlannerTacticalPitchMode, openSessionPlannerTacticalNumberPicker, updateSessionPlannerTacticalPlayerNumber, updateSelectedSessionPlannerTacticalPlayerBadges, shouldDragSessionPlannerTacticalSelectionGroup, getSessionPlannerTacticalDragElementIds, setSessionPlannerTacticalTool, undoSelectedSessionPlannerTacticalBoardAction, removeSessionPlannerTacticalElement, removeSelectedSessionPlannerTacticalElement, addSessionPlannerTacticalElement, snapSessionPlannerTacticalValue, snapSessionPlannerTacticalPoint, shouldSnapSessionPlannerTacticalEvent, getSessionPlannerTacticalCanvasPoint, getSessionPlannerTacticalPointFromRect, getSessionPlannerTacticalElementById, getSessionPlannerTacticalSelectionRect, getSessionPlannerTacticalElementBounds, isSessionPlannerTacticalPointInRect, getSessionPlannerTacticalElementSelectionPoints, isSessionPlannerTacticalElementInSelectionRect, getSessionPlannerTacticalElementsInRect, getSelectedSessionPlannerTacticalElement, getSelectedSessionPlannerTacticalElements, syncSessionPlannerTacticalboardInspector, updateSelectedSessionPlannerTacticalElement, updateSessionPlannerTacticalLineStyle, clampMovedTacticalPoint, moveSessionPlannerTacticalElementFromInitial, moveSessionPlannerTacticalElements, moveSessionPlannerTacticalElementByDelta, getSessionPlannerTacticalBoundsCollection, getSessionPlannerTacticalArrangeSpacing, moveSessionPlannerTacticalElementCenterTo, arrangeSelectedSessionPlannerTacticalElements, copySelectedSessionPlannerTacticalElements, pasteSessionPlannerTacticalClipboard, updateSessionPlannerTacticalElementHandle, getSessionPlannerTacticalRotationFromEvent, shouldPlaceSessionPlannerTacticalDoubleClick, shouldSkipRepeatedSessionPlannerTacticalPlacement, addSessionPlannerTacticalPlacementElement, handleSessionPlannerTacticalCanvasClick, handleSessionPlannerTacticalCanvasDoubleClick, startSessionPlannerTacticalDrag, updateSessionPlannerTacticalDrag, finishSessionPlannerTacticalDrag, startSessionPlannerPlayerBoardDrag, updateSessionPlannerPlayerBoardDrag, finishSessionPlannerPlayerBoardDrag, getSessionPlannerPlayerBoardEventPoint, getSessionPlannerPlayerBoardSelectionRect, syncSessionPlannerPlayerBoardSelectionBox, startSessionPlannerPlayerBoardSelection, updateSessionPlannerPlayerBoardSelection, finishSessionPlannerPlayerBoardSelection, findSessionPlannerBlockById, normalizeSessionPlannerVisualUpload, handleSessionPlannerVisualUpload, syncSessionPlannerPostSessionNotesToLibrary, applySessionPlannerExercise, syncSessionPlannerDateStripState, scrollSessionPlannerSelectedDateIntoView, resizeSessionPlannerTextarea, resizeSessionPlannerTextareas, scrollSessionPlannerDateStrip, jumpSessionPlannerToToday, renderSessionPlannerCentralSyncConflictOverlay, resolveSessionPlannerCentralSyncConflict, getSessionPlannerBlockNumber, getSessionPlannerPlayerBoardRule, getSessionPlannerPlayerBoardProfileForPlayer, getSessionPlannerPlayerBoardProfileRoleFitMap, getSessionPlannerPlayerBoardFutureMinutesValue, applySessionPlannerSelectionAssistant, compareSessionPlannerPlayerBoardItems, isSessionPlannerPlayerVisibleForBoard, isSessionPlannerPlayerBoardCustomPersonId, getSessionPlannerPlayerBoardCustomPeople, createSessionPlannerPlayerBoardCustomItem, getSessionPlannerPlayerBoardAutoTargetItems, getSessionPlannerPlayerBoardAutoSelectFormation, applySessionPlannerPlayerBoardAutoTeamFormation, applySessionPlannerPlayerBoardAutoSelect, applySessionPlannerPlayerBoardFormation, copySessionPlannerPlayerBoardTeamsFromBlock, getSessionPlannerHistoryPanelContext, loadSessionPlannerHistory, restoreSessionPlannerHistoryEntry, getSessionPlannerAvailabilityItems, updateSessionPlannerPrintPaper, updateSessionPlannerPrintSection, ensureSessionPlannerPrintPageStyle, removeSessionPlannerPrintRoot, prepareSessionPlannerPrintRoot, printSessionPlannerCurrentSession, renderSessionPlannerToast, showSessionPlannerToast, commitSessionPlannerExerciseToLibrary, queueSessionPlannerLibrarySaveConflict, resolveSessionPlannerLibrarySaveConflict, saveSelectedSessionPlannerExerciseToLibrary, deleteSessionPlannerLibraryExercise, restoreSessionPlannerLibraryExercise, createSessionPlannerDefaultSession, createSessionPlannerEmptySession, getSessionPlannerPeriodizationOverride, isSessionPlannerOffDate, createSessionPlannerSessionForNewPlan, isGeneratedDefaultSessionPlannerSession, shouldStripSessionPlannerGeneratedDefaultSession, shouldClearSessionPlannerSessionForDate, cloneSessionPlannerSession, createSessionPlannerDefaultState, parseSessionPlannerBlockReductionGuardTime, normalizeSessionPlannerBlockReductionGuard, canReduceSessionPlannerBlocksForDate, normalizeSessionPlannerBlockDeletionTombstones, markSessionPlannerBlockReductionAllowed, markSessionPlannerBlockDeleted, applySessionPlannerBlockReductionGuard, applySessionPlannerBlockDeletionTombstones, getSessionPlannerDeletedBlockIds, cloneSessionPlannerBlockMergeValue, isSessionPlannerBlockFieldEmptyValue, getSessionPlannerBlockFieldUpdatedAtMs, markSessionPlannerBlockFieldsUpdated, mergeSessionPlannerBlockForWrite, filterSessionPlannerDeletedBlocksForWrite, mergeSessionPlannerSessionForWrite, cloneSessionPlannerState, mergeSessionPlannerStateForWrite, mergeSessionPlannerStateFromBackup, assignSessionPlannerBlockFieldValue, syncSelectedSessionPlannerBlockFieldsFromDom, readSessionPlannerState, persistNormalizedSessionPlannerState, findSessionPlannerStateInSnapshots, queueSessionPlannerSnapshotRecovery, writeSessionPlannerState } from "./src/modules/session-planner/session-planner-runtime-accessors.mjs";
import { createPlatformModuleLoader } from "./src/core/platform-module-loader.mjs";
import { createPlatformShellRuntime } from "./src/core/platform-shell-runtime.mjs";
import { createInstallAppController } from "./src/core/install-app-controller.mjs";
import { bindPlatformNavigationInteractions } from "./src/core/platform-navigation-bindings.mjs";
import { createPlatformUiBindings } from "./src/core/platform-ui-bindings.mjs";
import { createPlatformAppRuntimeServices } from "./src/core/platform-app-runtime-services-composer.mjs";
import { createWorkspaceRuntimeComposition } from "./src/core/workspace-runtime-composer.mjs";
import { createPlatformUserRuntimeService } from "./src/core/platform-user-runtime-service.mjs";
import { createMedicalRuntimeServiceComposition } from "./src/modules/medical/medical-runtime-service-composer.mjs";
import { configurePlatformRuntimeAccessors, mergePeriodizationStatePreservingLocalUi, renderPlayerProfilesWorkspaceMessage, cloneDefaultPlatformStructureState, normalizePlatformStructureText, normalizePlatformStructureComparable, isLegacyPlatformStructureValue, isCanonicalPlatformClubValue, isCanonicalPlatformTeamValue, isLegacyPlatformClub, isLegacyPlatformTeam, isCanonicalPlatformClub, isCanonicalPlatformTeam, hasPlatformWorkspaceScope, slugifyPlatformStructureValue, normalizePlatformStructureId, createPlatformStructureId, normalizePlatformClub, normalizePlatformTeam, normalizePlatformStructureState, isLegacyPlatformTeamPlaceholderName, readPlatformStructureState, writePlatformStructureState, getPlatformStructureState, getPlatformClubById, getPlatformTeamById, findPlatformTeamByName, syncPlatformStructureWithUsers, getUserTeamId, getUserClubId, getUserTeamName, getActivePlatformTeam, getPlatformTeamDisplayTeam, getPlatformTeamDisplayName, writePlatformTeamLogo, getUserClubName, getUserScopeLabel, isSamePlatformClub, isSamePlatformTeam, canAdminViewUser, canAdminManageUser, getScopedPlatformUsers, getScopedPlatformClubs, getScopedPlatformTeams, normalizeAdminUserSubmissionValues, getAllWorkspacePool, normalizeWorkspaceRoleList, normalizeWorkspaceAccessEntry, getWorkspaceAccessConfig, getWorkspaceByIdFromPool, canUserAccessWorkspace, canCurrentUserAccessWorkspace, canUserEditWorkspace, canCurrentUserEditWorkspace, canEditScheduleWorkspace, canEditSessionPlanner, canEditPeriodizationWorkspace, canEditGameSimulatorWorkspace, canEditScoutingWorkspace, getAccessibleWorkspacePool, getVisibleWorkspacePool, mergeWorkspaceDefinitions, cloneHubState, clonePersistableWorkspaceHubState, repairWorkspaceState, getWorkspaceIdFromUrl, readRememberedWorkspaceId, rememberActiveWorkspaceId, readWorkspaceHubState, writeWorkspaceHubState, getWorkspaceById, getWorkspaceByIdUnfiltered, getSafeWorkspaceId, getWorkspaceViewId, getPeriodizationDay, ensurePeriodizationState, writePeriodizationDay, selectPeriodizationDate, openPeriodizationDateForDashboard, setPeriodizationStateStorageValue, readPeriodizationState, writePeriodizationState, setPeriodizationMonth, shiftPeriodizationMonth, scrollPeriodizationDateIntoView, jumpPeriodizationToToday, mergeImportedNccSchedule, setScheduleStateStorageValue, readScheduleState, ensureScheduleState, writeScheduleState, setScoutingStateStorageValue, readScoutingState, writeScoutingState, ensureScoutingState, getPeriodizationMultiSelectOpenField, setPeriodizationMultiSelectOpenField, setPeriodizationSelection, getPeriodizationOverlayState, setPeriodizationOverlayMode, setPeriodizationOverlayState, readTransferRoomState, ensureTransferRoomState, syncTransferRoomLinkedState, canUserAccessTransferRoom, canUserEditTransferRoom, addTransferRoomTargetFromScoutingSnapshot, getGameplanContext, getScoutingAnalysisRoomContext, getScoutingWorkspaceContext, getTransferRoomWorkspaceContext, hydrateWorkspaceModuleState, loadGameplanModule, loadScoutingWorkspaceModule, loadTransferRoomWorkspaceModule, renderAnalysisRoomWorkspace, renderGameplanWorkspace, renderScoutingWorkspace, renderTransferRoomWorkspace, renderPeriodizationWorkspace, renderSessionPlannerPeriodizationOverlay, renderSessionPlannerPeriodizationSummary, initializeWorkspaceHub, renderWorkspaceChrome, setActiveWorkspace, reloadCentralizedAppStateFromStorage, getCurrentSessionPlannerUiSelection, readSessionPlannerStatePreservingUiSelection, shouldDeferCentralizedAppStateReload, setCentralizedAppStateReloadPending, requestCentralizedAppStateReload, flushDeferredCentralizedAppStateReload, refreshCentralStateFromSource, formatScheduleBlockSummary, getScheduleEventsForDate, getScheduleMainEvent, getScheduleMonthEvents, getScheduleDayWarnings, getScheduledSessionTitleForDate, getScheduleSelectedDayContext, getScheduleSessionEventForDate, getScheduleSessionSnapshot, getScheduleVisibleEvents, getScheduleVisibleMonthEvents, isScheduleSessionEvent, openCredentialsMailto, buildTemporaryLoginMessage, getAdminManagedWorkspaces, getAdminAuditState, getReadinessState, getSelectedAdminUserId, getAdminUsersForTeam, getAdminUserInitials, createAdminClubFromForm, createAdminTeamFromForm, loadAdminAuditLog, loadPlatformReadinessReport, publishPlatformAppearanceConfig, getAdminTransferRoomAccessTeamId, renderAdminWorkspace } from "./src/core/platform-runtime-accessors.mjs";
import { renderIdpWorkspace } from "./src/core/platform-runtime-accessors.mjs";
import { createPlatformAutosaveStatusController } from "./src/core/platform-autosave-status.mjs";
import { createDashboardId, createDashboardJsonStorage, createDashboardWorkspaceQueryEngine } from "./src/core/dashboard-runtime-utils.mjs";
import { createPlatformRuntimeHelpers } from "./src/core/platform-runtime-helpers.mjs";
import { createCentralRuntimeFacade, dataSafetySnapshotStoreName } from "./src/core/central-runtime-facade.mjs";
import { bindPlatformWorkspaceRuntimeBindings } from "./src/core/platform-workspace-runtime-bindings.mjs";
import { bindPlatformGlobalRuntimeEvents } from "./src/core/platform-global-runtime-bindings.mjs";
import { canonicalPlatformClubValues, canonicalPlatformTeamValues, dashboardNotificationSeenStorageKey, dataSafetyDatabaseName, dataSafetyExportSchema, dataSafetyStorageKey, defaultWorkspaceAccess, defaultWorkspaceEditAccess, gameplanStorageKey, legacyPlatformStructureValues, maxProfileImageUploadDataUrlLength, maxProfileImageUrlLength, medicalTeamStorageKey, platformAppearanceStorageKey, platformDefaultClubId, platformDefaultClubName, platformDefaultClubShortName, platformDefaultTeamId, platformDefaultTeamLevel, platformDefaultTeamName, playerProfileAgeCacheStorageKey, playerProfileChangeLogLimit, playerProfilesDefaultRosterVersion, playerProfilesSchemaVersion, playerProfilesStorageKey, requiredWorkspaceAccess, scoutingStorageKey, sequenceLibraryStorageKey, sequenceStorageKey, sessionPlannerBlockMergeFields, sessionPlannerBlockMergeFieldSet, setPiecesRoomStorageKey, transferRoomStorageKey } from "./src/core/app-runtime-constants.mjs";
import { addCalendarDays, clamp, escapeHtml, formatDashboardDateTime, formatDashboardTime, formatDataSafetyTime, isEditableKeyboardTarget, logEvent, maybeCopyToClipboard, setFormSubmitButtonState, togglePasswordInputVisibility } from "./src/core/runtime-ui-helpers.mjs";
import { installPlatformOverlayStability } from "./src/core/overlay-stability.mjs";
import { defaultHubState, placeholderWorkspaceContent, platformSidebarMoreOrder, platformSidebarPrimaryOrder, topIconMenuOrder } from "./src/core/workspace-defaults.mjs";
import { createPlatformDisplayHelpers, formatPlatformUserName, getPlatformRoleLabel, getPlatformUserInitials, getPlatformUserProfileImageUrl, normalizePlatformProfileImageUrl } from "./src/modules/platform/display-helpers.mjs";
import { buildPlatformTemporaryLoginMessage, buildPlatformUserCredentialMessage, getPlatformPasswordValidationMessage, readPlatformFormValues, stripPlatformPasswordConfirmation } from "./src/modules/platform/form-helpers.mjs";
import { createPlatformNavigationController, getPlatformTopIconLabel } from "./src/modules/platform/navigation-controller.mjs";
import { createPlatformNavigationRenderer } from "./src/modules/platform/navigation-renderer.mjs";
import { createPlatformWorkspaceRenderers } from "./src/modules/platform/workspace-renderers.mjs";
import { getTopIconSvg } from "./top-icons.js";
import { buildPlatformAppearanceConfigFromForm, createDefaultPlatformAppearanceConfig, getHomeAppearanceImpactSummary, normalizePlatformAppearanceConfig, normalizePlatformAppearanceValue, platformAppearanceDensityOptions, platformAppearanceHomeComponentTypeIds, platformAppearanceHomeSectionDefaults, platformAppearanceThemeOptions, platformAppearanceToneOptions } from "./src/core/appearance-governance.mjs";
import { bindAdminRuntimeBindings, createAdminRuntimeService, getAdminUserInitials as getAdminUserInitialsFromModule } from "./src/modules/admin/index.mjs";
import { bindProfileStaffRuntimeBindings, createProfileImageDataUrl as createProfileImageDataUrlFromModule, createProfileImageRuntimeActions, createTeamLogoDataUrl as createTeamLogoDataUrlFromModule } from "./src/modules/profile/index.mjs";
import {
  createSquadAppRuntimeComposition,
  bindPlayerProfileRuntimeBindings,
  createSquadScoutingRuntime,
  buildPlayerProfileImportFeedback as buildPlayerProfileImportFeedbackMessage,
  buildPlayerProfileImportPreviewMessage,
  buildPlayerProfileOperationFeedback,
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
import * as playerProfileRuntimeAccessors from "./src/modules/squad/player-profile-runtime-accessors.mjs";
import {
  bindMedicalRuntimeBindings,
  createMedicalRuntimeService,
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
import * as medicalRuntimeAccessors from "./src/modules/medical/medical-runtime-accessors.mjs";
import { createGameSimulatorLazyRuntimeBridge } from "./src/modules/game-simulator/index.mjs";
const {
configurePlayerProfileRuntimeAccessors,
readPlayerProfileAgeCache, ensurePlayerProfileAgeCache, writePlayerProfileAgeCache, getPlayerProfileAgeCacheEntry,
getCurrentSquadActorLabel, recordPlayerProfileChange, getPlayerProfileChangeLog, getRecentPlayerProfileChangeLog,
clonePlayerProfilesState, buildPlayerProfileFromMedicalTrainingGuest, syncPlayerProfilesFromMedicalTrainingGuests,
readPlayerProfilesState, writePlayerProfilesState, getPlayerProfileAgeHydrationCandidates,
buildPlayerProfileAgeHydrationPayload, mergePlayerProfileAgeHydrationResult, hydratePlayerProfileAgesOnce,
queuePlayerProfileAgeHydration, ensurePlayerProfilesState, canEditPlayerProfiles, getPlayerProfilesAccessLabel,
getSelectedPlayerProfile, openPlayerProfileModal, closePlayerProfileModal, openPlayerProfileNewPlayerModal,
closePlayerProfileNewPlayerModal, getLatestManualMedicalLog, getPlayerProfileMedicalStatusOverride,
getPlayerProfileEffectiveStatusFromSnapshot, getPlayerProfileEffectiveStatus, getPlayerProfileMedicalSnapshot,
getVisiblePlayerProfiles, getAllTemporaryPlayerProfiles, renderPlayerProfileStatusChip, renderSquadRosterSections,
renderPlayerProfilesRosterListOnly, buildPlayerProfileImportFeedback, createPlayerProfileImportUndoSnapshot,
clearPlayerProfileImportUndoSnapshots, registerPlayerProfileImportUndoSnapshot, getPlayerProfileImportUndoHistory,
getPlayerProfileImportUndoState, applyPlayerProfileImportUndo, importSquadDataFoundationPayload,
importSquadDataFoundationFile, renderPendingPlayerProfileImport, renderPlayerProfilesWorkspace,
getPlayerProfileFormSignature, savePlayerProfileEditForm, queuePlayerProfileAutosave, flushPlayerProfileAutosave,
buildMedicalPlayerFromPlayerProfile, syncMedicalPlayersFromPlayerProfiles, getMedicalPlayersMatchingPlayerProfile,
getMedicalRemovedSquadPlayerIdSet, isMedicalPlayerRemovedFromSquad, archiveMedicalPlayersRemovedFromSquad,
archiveMedicalPlayersForRemovedPlayerProfile, addPlayerProfile, updatePlayerProfile, removePlayerProfile,
getPendingPlayerProfileImportPlan, setPendingPlayerProfileImportPlan, setPlayerProfileAutosaveLastSignature,
} = playerProfileRuntimeAccessors;
const {
configureMedicalRuntimeAccessors,
compareMedicalPlayers, getCurrentMedicalActorId, getMedicalCanonicalPositionFromText, getMedicalClearanceValues,
getMedicalDataSafetyCounts, getMedicalEntityUpdatedMs, getMedicalGateOption, getMedicalLoadGateValues,
getMedicalLinkedPlayerProfile, getMedicalPlayerAvailabilityStatus, getMedicalPlayerAvailabilityStatusForDate,
getMedicalPlayerAvailabilityStatusOption,
getMedicalPlayerNumberRank, getMedicalPlayerPositionRank, getMedicalPlayerRosterOrder,
getMedicalPlayerSquadAvailabilityBlockReason, getMedicalRtpPhaseForRecommendation, getMedicalRtpPhaseOption,
getMedicalStatusActivityType, getMedicalStatusForParticipation, getMedicalStatusOption,
getMedicalStatusOptionForActivity, getMedicalStatusOptionForDateFromHelper, getMedicalTimestampMs,
isMedicalItemArchived, isMedicalPlayerBlockedBySquadAvailability, normalizeMedicalActualParticipation,
normalizeMedicalClearance, normalizeMedicalDataSafety, normalizeMedicalGovernancePolicy, normalizeMedicalInjuryPlan,
normalizeMedicalLoadGates, normalizeMedicalParticipation, normalizeMedicalPlayer,
normalizeMedicalPlayerAvailabilityStatus, normalizeMedicalPlayerPosition, normalizeMedicalPositionText,
normalizeMedicalShareValue, normalizeMedicalTimestamp, normalizeMedicalRecord, sanitizeMedicalGovernancePolicyForCoachView,
getMedicalStatusOptionForDate, syncMedicalPlayerAvailabilityStatusesFromProfiles, markMedicalClinicalChange,
commitMedicalClinicalState, updateMedicalDatabaseSyncStatus, cloneMedicalState, canViewPrivateMedicalDetails,
sanitizeMedicalRecordForCoachView, sanitizeMedicalInjuryPlanForCoachView, sanitizeMedicalStateForCurrentUser,
setMedicalStateStorageValue, readMedicalState, writeMedicalState, ensureMedicalState,
getMedicalAccessLabel, getMedicalHeroTeamName, getSelectedMedicalPlayer, getActiveMedicalPlayers,
isMedicalPlayerVisibleForDate, getActiveMedicalPlayersForDate, isMedicalInjuryPlanActive, getMedicalPlayerInjuryPlans,
getActiveMedicalInjuryPlan, createMedicalRecordFromSquadAvailabilityBlock, isMedicalPlanCleared,
getMedicalRecommendationBlockReason, getMedicalReviewAlerts, getMedicalCoachComment, getMedicalVisibleComment,
createMedicalRecordFromInjuryPlan, getLatestMedicalRecord, getMedicalPlayerRecords,
isMedicalRestrictedRecommendationRecord, getMedicalPlayerRestrictedLogRecords, getMedicalWindowDates,
getMedicalPastWindowDates, getMedicalMonthToDateDates, getMedicalScheduleSummary, getMedicalRecommendationEvent,
getMedicalRecommendationActivityContext, getMedicalRecordStatus, getDefaultMedicalInjuryPlanDraft,
normalizeMedicalInjuryPlanDraft, getMedicalInjuryPlanDraft, setMedicalInjuryPlanDraft, setMedicalInjuryPlanDraftFromPlan,
getMedicalRtpLibraryProfile, getMedicalRtpLibraryProfiles, getMedicalRtpLibraryReadStatus, getMedicalRtpExercisesForProfile,
loadMedicalRtpLibraryProfile, loadMedicalRtpLibraryProfiles,
getMedicalRtpLibraryStarterDraft, getMedicalRtpLibraryStarterDraftForPlan,
clearMedicalInjuryPlanDraft, getMedicalInjuryPlanFormDraft, persistMedicalInjuryPlanDraftFromForm,
getMedicalDailyStats, getMedicalWindowAverage, getMedicalParticipationAverageForDates, getMedicalMonthAverageStats,
getMedicalAttentionPlayers, getMedicalPositionSummaries, getMedicalDaySpan, getMedicalDailyHuddle,
getMedicalCoachHandoverItems, buildMedicalCoachHandoverText, recordMedicalAuditEvent, getMedicalDatabasePlayer,
buildMedicalDatabaseStateSummary, getMedicalDatabaseIdempotencyKey, recordMedicalDatabaseSyncEvent,
copyMedicalCoachHandoverToClipboard, getMedicalPlayerProfileSummary, getFilteredMedicalPlayers,
getMedicalValidBulkSelection, getMedicalBulkSelectedPlayers, getMedicalBulkRecommendationEligiblePlayers,
toggleMedicalBulkPlayer, setMedicalBulkSelection, setMedicalBulkNotSetSelection, applyMedicalQuickRecommendation,
clearMedicalQuickRecommendation, applyMedicalBulkRecommendation, updateMedicalBulkActivityControls, updateMedicalGovernancePolicy,
getMedicalPlanTotalDays, getMedicalPlanElapsedDays, getMedicalPlanDaysRemaining, getMedicalPlanSeverity,
getMedicalPlanClearanceSummary, getMedicalPlanReviewState, getMedicalTrailingRecommendationSummary,
getMedicalSeasonPlans, getMedicalActiveCaseItems, getMedicalHistoryEvents, getMedicalSeasonSummary,
getMedicalPlayerRiskSignal, getMedicalRiskSignals, getMedicalOperationsSummary, renderMedicalOperationsTopMenu,
renderMedicalOperationsSystem, getMedicalRosterPositionGroups, getMedicalRosterPositionStats, renderMedicalTeamWorkspace,
getMedicalPlayerRtpCoachStatus, loadMedicalPlayerRtpCoachStatus,
upsertMedicalPlayers, addMedicalRecord, updateMedicalPlayerProfile, removeMedicalPlayer, removeMedicalRecord,
addMedicalInjuryPlan, updateMedicalInjuryPlan, updateMedicalPlanClearance, removeMedicalInjuryPlan,
openMedicalPlayerModal, closeMedicalPlayerModal, setMedicalSelectedDate, shiftMedicalSelectedDate,
} = medicalRuntimeAccessors;
const win = window;
const getElement = document.getElementById.bind(document);
const ui = createPlatformUiBindings(document);
const platformAssetVersion = win.__assetVersion || Date.now();
const installAppController = createInstallAppController({
  documentRef: document,
  storage: (() => {
    try {
      return win.localStorage;
    } catch {
      return null;
    }
  })(),
  ui,
  win,
});
const platformUserRuntimeService = createPlatformUserRuntimeService({
  formatPlatformUserName,
  getPlatformRoleLabel,
  getPlatformUserInitials,
  getPlatformUserProfileImageUrl,
  getUserClubName,
  getUserTeamName,
  isLegacyPlatformStructureValue,
  maxProfileImageUploadDataUrlLength,
  maxProfileImageUrlLength,
  normalizePlatformProfileImageUrl,
  normalizePlatformStructureText,
  win,
});
const {
  formatUserName,
  getAssignableRolesForUser,
  getCurrentPlatformUser,
  getPlatformApiAccessToken,
  getPlatformAuthStore,
  getPlatformRoles,
  getPlatformUsers,
  getRoleLabel,
  getUserInitials,
  getUserProfileImageUrl,
  isCurrentPlatformUserAdmin,
  isPlatformAdminUser,
  isPlatformManagementUser,
  isPlatformStaffUser,
  isProfileMenuOpen,
  normalizePlatformImageUrl,
  normalizePlatformRole,
  platformDefaultRoles,
  platformManagementRoleSet,
  platformStaffRoleSet,
  setProfileMenuOpen,
  syncAccountMenu,
  syncPlatformUserFromAuth,
  updatePlatformUserFromPayload,
  withUiTimeout,
} = platformUserRuntimeService;
const dashboardPresenceHeartbeatMs = 90000;
const dashboardPresencePollMs = 90000;
const dashboardPresenceSteadyPushMinMs = 45000;
const dashboardPresenceTypingPushMinMs = 5000;
const dashboardPresenceTypingSendThrottleMs = 1800;
const dashboardPresenceTypingTtlMs = 9000;
const dashboardPresencePollMinMs = 60000;
const dashboardPresenceIdleMs = 90000;
const dashboardPresenceOnlineTtlMs = 85000;
const dashboardPresenceAwayTtlMs = 6 * 60 * 1000;
const { readDashboardJson, writeDashboardJson } = createDashboardJsonStorage({
  windowRef: win,
  logEvent,
});
const { getVisibleWorkspaces } = createDashboardWorkspaceQueryEngine({
  ui,
  getVisibleWorkspacePool,
});
const platformRuntimePeriodizationRenderer = {
  getDayScheduleLabel: (...args) => periodizationRenderer?.getDayScheduleLabel?.(...args),
  getMatchDayLabel: (...args) => periodizationRenderer?.getMatchDayLabel?.(...args),
  getMultiFieldValue: (...args) => periodizationRenderer?.getMultiFieldValue?.(...args),
  getCustomFieldValue: (...args) => periodizationRenderer?.getCustomFieldValue?.(...args),
};
const {
  getPlatformFormValues,
  getPasswordValidationMessage,
  stripPasswordConfirmation,
  hasUserFieldConflict,
  isMedicalDateValue,
  getPeriodizationDayScheduleLabel,
  getPeriodizationMatchDayLabel,
  getPeriodizationMultiFieldValue,
  getPeriodizationCustomFieldValue,
} = createPlatformRuntimeHelpers({
  getPlatformUsers,
  parseScheduleDateValue,
  formatScheduleDateValue,
  periodizationRenderer: platformRuntimePeriodizationRenderer,
  readPlatformFormValues,
  getPlatformPasswordValidationMessage,
  stripPlatformPasswordConfirmation,
});
configurePlatformRuntimeAccessors(() => ({
adminRuntimeService,
centralAppStateReloadService,
periodizationRuntimeBindings,
periodizationStateAdapter,
platformStructureRuntimeService,
scheduleRuntimeSelectors,
squadWorkspaceRenderer,
workspaceAccessRuntimeService,
workspaceDataRuntimeService,
workspaceModuleRuntimeController,
workspaceShellController,
}));
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
const dashboardChatStorageKey = "football-dashboard-chat-v1";
const dashboardChatDeletedMessageIdsStorageKey = "football-dashboard-chat-deleted-message-ids-v1";
const dashboardChatLocalCacheResetStorageKey = "football-dashboard-chat-local-cache-reset-v1";
const dashboardChatLocalCacheResetVersion = "2026-05-09-chat-database-only-v3";
const dashboardChatWidgetStateStorageKey = "football-dashboard-chat-widget-state-v1";
const dashboardChatLauncherPositionStorageKey = "football-dashboard-chat-launcher-position-v1";
const dashboardChatWidgetNotificationCursorStorageKey = "football-dashboard-chat-widget-notification-cursor-v1";
const dashboardChatWidgetNotificationStateStorageKey = "football-dashboard-chat-widget-notification-state-v1";
const dashboardChatTeamThreadId = "team";
const dashboardChatMaxMessageLength = 1600;
const dashboardChatGroupNameMinLength = 2;
const dashboardChatWidgetMessageLimit = 50;
const dashboardChatWidgetConversationMessageLimit = 500;
const dashboardChatApiPageLimit = 40;
const dashboardChatPinnedLimit = 3;
const dashboardChatReactionOptions = [
{ key: "seen", label: "Seen" },
{ key: "agree", label: "Agree" },
{ key: "done", label: "Done" },
{ key: "question", label: "Question" },
];
const dashboardChatThreadRuntimeBindings = {
  getDashboardChatThreadMessages: () => [],
  getDashboardChatThreadData: () => null,
  getDashboardChatThreadList: () => [],
  getDashboardChatUnreadCountForCurrentUser: () => 0,
  readDashboardNotificationSeenMap: () => ({}),
  writeDashboardNotificationSeenMap: () => {},
  getDashboardNotificationSeenAt: () => 0,
  hasDashboardHomeNotifications: () => false,
  markDashboardHomeSeenForCurrentUser: () => {},
  getDashboardUserLabel: () => "Unknown",
  getDashboardMessageById: () => null,
  getDashboardMessageAuthorName: () => "Staff",
};
const dashboardChatMessageRenderRuntimeBindings = {
  getDashboardMessagePreview: () => "",
  renderDashboardReplyReference: () => "",
  getDashboardPinnedMessagesForThread: () => [],
  renderDashboardPinnedMessages: () => "",
  renderDashboardMessageReactions: () => "",
};
let syncDashboardChatWidgetNotificationCursor = () => {};
const dashboardChatApiRuntimeBindings = {
  dashboardChatSubmittedComposerDrafts: new Map(),
};
const getDashboardChatThreadMessages = (...args) => dashboardChatThreadRuntimeBindings.getDashboardChatThreadMessages(...args);
const getDashboardChatThreadData = (...args) => dashboardChatThreadRuntimeBindings.getDashboardChatThreadData(...args);
const getDashboardChatThreadList = (...args) => dashboardChatThreadRuntimeBindings.getDashboardChatThreadList(...args);
const getDashboardChatUnreadCountForCurrentUser = (...args) =>
  dashboardChatThreadRuntimeBindings.getDashboardChatUnreadCountForCurrentUser(...args);
const readDashboardNotificationSeenMap = (...args) => dashboardChatThreadRuntimeBindings.readDashboardNotificationSeenMap(...args);
const writeDashboardNotificationSeenMap = (...args) => dashboardChatThreadRuntimeBindings.writeDashboardNotificationSeenMap(...args);
const getDashboardNotificationSeenAt = (...args) => dashboardChatThreadRuntimeBindings.getDashboardNotificationSeenAt(...args);
const hasDashboardHomeNotifications = (...args) => dashboardChatThreadRuntimeBindings.hasDashboardHomeNotifications(...args);
const markDashboardHomeSeenForCurrentUser = (...args) =>
  dashboardChatThreadRuntimeBindings.markDashboardHomeSeenForCurrentUser(...args);
const getDashboardUserLabel = (...args) => dashboardChatThreadRuntimeBindings.getDashboardUserLabel(...args);
const getDashboardMessageById = (...args) => dashboardChatThreadRuntimeBindings.getDashboardMessageById(...args);
const getDashboardMessageAuthorName = (...args) => dashboardChatThreadRuntimeBindings.getDashboardMessageAuthorName(...args);
const getDashboardMessagePreview = (...args) => dashboardChatMessageRenderRuntimeBindings.getDashboardMessagePreview(...args);
const renderDashboardReplyReference = (...args) => dashboardChatMessageRenderRuntimeBindings.renderDashboardReplyReference(...args);
const getDashboardPinnedMessagesForThread = (...args) => dashboardChatMessageRenderRuntimeBindings.getDashboardPinnedMessagesForThread(...args);
const renderDashboardPinnedMessages = (...args) => dashboardChatMessageRenderRuntimeBindings.renderDashboardPinnedMessages(...args);
const renderDashboardMessageReactions = (...args) => dashboardChatMessageRenderRuntimeBindings.renderDashboardMessageReactions(...args);
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
platformUserRuntimeService.configureAccountMenu({
  applyUserAvatar,
  getPlatformStructureState,
  ui,
});
installAppController.initialize();
let updateSetPiecesRoomSyncStatus = () => {};
const centralRuntimeFacade = createCentralRuntimeFacade({
win,
documentRef: document,
navigatorRef: typeof navigator === "undefined" ? null : navigator,
storageConstructor: typeof Storage === "undefined" ? null : Storage,
blobConstructor: typeof Blob === "undefined" ? null : Blob,
urlApi: typeof URL === "undefined" ? null : URL,
ui,
storageKeys: {
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
dashboardChatStorageKey,
dashboardNotificationSeenStorageKey,
dashboardTutorialPrefsStorageKey,
dashboardNewsSeenStorageKey,
dashboardPresentationStorageKey,
platformAppearanceStorageKey,
medicalTeamStorageKey,
scoutingStorageKey,
gameplanStorageKey,
setPiecesRoomStorageKey,
transferRoomStorageKey,
sequenceStorageKey,
sequenceLibraryStorageKey,
dataSafetyStorageKey,
dataSafetyExportSchema,
dataSafetyDatabaseName,
},
formatDataSafetyTime,
getActiveWorkspaceId: () => hubState?.activeWorkspaceId || "",
getCurrentPlatformUser,
handleSyncedStateValue: handleCentralSyncedStateValue,
handleSyncStatus: (key, status, message) => {
if (key === setPiecesRoomStorageKey) updateSetPiecesRoomSyncStatus(status, message);
},
isSessionPlannerAutosaveKey,
mergeDashboardPresentationStatePreservingLocalEdits,
mergePeriodizationStatePreservingLocalUi,
mergeScheduleStatePreservingLocalUi,
getSessionPlannerLocalUiState: () => sessionPlannerLocalUiState,
setAutosaveStatusForKey: setPlatformAutosaveStatusForKey,
shouldDeferCentralizedAppStateReload,
showSessionPlannerToast,
});
const {
dataSafetyRuntimeStatus,
centralStateWriteSuppressionKeys,
getDataSafetyNow,
isDataSafetyInternalStorageKey,
isDataSafetyProtectedStorageKey,
rawDataSafetyGetItem,
rawDataSafetySetItem,
rawDataSafetyRemoveItem,
readDataSafetyManifest,
mutateDataSafetyManifest,
hashDataSafetyString,
getDataSafetyStorageLabel,
recordDataSafetyWrite,
saveDataSafetySnapshot,
queueDataSafetySnapshot,
refreshDataSafetyStatus,
queueDataSafetyStatusRefresh,
exportFootballScienceDataBackup,
importFootballScienceDataBackupFile,
openDataSafetyDatabase,
flushQueuedDataSafetySnapshot,
installFootballDataSafety,
getCentralStateBridge,
getCentralStateMetadataForKey,
getCentralStateRevisionForKey,
canWriteCentralBackedCache,
createCentralBackedStorageError,
queueCentralStateStatus,
hasPendingCentralStateWrites,
retryCentral,
applyCentralSyncedStateValue,
getCentralSyncResultValue,
getCentralSyncResultRevision,
retryCentralStateWriteAfterConflict,
registerSessionPlannerCentralSyncConflict,
queueCentralStateWrite,
flushCentralStateWrites,
clearCentralStateWriteTimer,
} = centralRuntimeFacade;
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
ensurePlayerProfilesState,
formatScheduleDateValue,
getMedicalRecords: () => medicalState?.records ?? [],
getPeriodizationDay,
getPlayerProfilesState: () => playerProfilesState || readPlayerProfilesState(),
getPresentationState: () => readDashboardJson(dashboardPresentationStorageKey, {}),
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
getUpcomingPlayerProfileBirthdays: (...args) => getUpcomingPlayerProfileBirthdays(...args),
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
const scheduleHomeMonthRenderer = createScheduleHomeMonthRenderer({ escapeHtml });
const presentationModeRenderer = createPresentationModeRenderer({
escapeHtml,
renderExerciseVisual: renderSessionPlannerExerciseVisual,
});
let presentationModeController = null;
const dashboardRuntimeController = createDashboardRuntimeController({
documentRef: document,
win,
getElement,
getUi: () => ui,
homeContextSelectors: dashboardHomeContextSelectors,
homeCardsRenderer: dashboardHomeCardsRenderer,
scheduleMonthRenderer: scheduleHomeMonthRenderer,
appearanceStorageKey: platformAppearanceStorageKey,
readJson: readDashboardJson,
writeJson: writeDashboardJson,
createId: createDashboardId,
getCurrentUser: getCurrentPlatformUser,
getUsers: getPlatformUsers,
getPlatformStructureState,
getPlatformTeamDisplayTeam,
getPlatformTeamLogoUrl,
getUserClubName,
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
confirm: (config) => confirmPlatformAction({ win, ...config }),
openScheduleDate: (dateValue) => {
if (dateValue) {
if (!scheduleState) {
scheduleState = readScheduleState();
}
scheduleWorkspaceController?.selectDate(dateValue);
}
},
openPeriodizationDate: (dateValue) => {
openPeriodizationDateForDashboard(dateValue);
},
openSessionDate: (dateValue) => {
if (dateValue) {
dashboardHomeContextSelectors.getSessionPlannerState();
sessionPlannerState.selectedDate = dateValue;
writeSessionPlannerState();
}
},
openPresentationMode: (dateValue, meetingType = "team", options = {}) => {
presentationModeController?.open(dateValue, meetingType, options);
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
presentationModeController = createPresentationModeController({
documentRef: document,
win,
renderer: presentationModeRenderer,
storageKey: dashboardPresentationStorageKey,
readJson: readDashboardJson,
writeJson: writeDashboardJson,
getTodayValue: dashboardHomeContextSelectors.getTodayValue,
getPasses: (dateValue) => dashboardHomeContextSelectors.getPresentationPasses(dateValue || dashboardHomeContextSelectors.getTodayValue()),
getSessionForDate: (dateValue) => {
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
return sessionPlannerState.sessions?.[dateValue] || createSessionPlannerEmptySession(dateValue);
},
getScheduleEventsForDate,
getScheduleMainEvent,
getScheduledSessionTitle: getScheduledSessionTitleForDate,
getPeriodizationDay,
getAvailabilityItems: (dateValue) => {
const medicalItems = medicalAvailabilitySelectors.getMedicalAvailabilityItems(dateValue);
return Array.isArray(medicalItems) && medicalItems.length ? medicalItems : getSessionPlannerAvailabilityItems(dateValue);
},
getCustomPeople: getSessionPlannerPlayerBoardCustomPeople,
createCustomPersonItem: createSessionPlannerPlayerBoardCustomItem,
getTeam: () => getPlatformTeamDisplayTeam(),
getTeamName: () => getPlatformTeamDisplayName() || "Football Science",
getTeamLogoUrl: (team) => getPlatformTeamLogoUrl(team),
getSetPiecesState: () => readDashboardJson(setPiecesRoomStorageKey, { plays: [] }),
getPlayerProfilesState: () => ensurePlayerProfilesState(),
formatDateLabel: (dateValue) => getSessionPlannerDateLabel(dateValue, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
isEditableTarget: isEditableKeyboardTarget,
escapeHtml,
onDeckChange: () => {
if (hubState?.activeWorkspaceId === "home") {
renderDashboardCards();
}
},
});
presentationModeController.bindInteractions();
const dashboardChatAttachmentRenderer = createDashboardChatAttachmentRenderer({
escapeHtml,
getSupabaseClient: getDashboardSupabaseClient,
});
const dashboardChatAttachmentPreview = createDashboardChatAttachmentPreview();
const dashboardChatWidgetRenderer = createDashboardChatWidgetRenderer({
teamThreadId: dashboardChatTeamThreadId,
messageLimit: dashboardChatWidgetMessageLimit,
conversationMessageLimit: dashboardChatWidgetConversationMessageLimit,
maxMessageLength: dashboardChatMaxMessageLength,
groupNameMinLength: dashboardChatGroupNameMinLength,
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
canDeleteMessage: canDeleteDashboardChatMessage,
canClearThread: isCurrentPlatformUserAdmin,
canPinMessage: canPinDashboardChatMessage,
});
let centralAppStateReloadService = null;
let reloadSetPiecesRoomFromStorage = () => {};
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
  return sessionPlannerAutosaveBoundary.setStatusForKey(key, state, message);
}
syncPlatformAutosaveStatusVisibility(null);
function handleCentralSyncedStateValue(key) {
  if (key === setPiecesRoomStorageKey) {
    reloadSetPiecesRoomFromStorage();
    return;
  }
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
  if (key === dashboardPresentationStorageKey) {
    if (hubState?.activeWorkspaceId === "home") {
      renderDashboardCards();
    }
    presentationModeController?.render();
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
      setCentralizedAppStateReloadPending(true);
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
installFootballDataSafety();
installPlatformOverlayStability({ win });
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
getUpcomingPlayerProfileBirthdays,
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
getPlayerProfileFormValues,
playerProfileRosterUiSelectors,
getPlayerProfilesRosterSummary,
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
buildPlayerProfileImportPlan,
} = createSquadAppRuntimeComposition({
createDashboardId,
ensurePlayerProfilesState,
formatMedicalDateLabel: (...args) => formatMedicalDateLabel(...args),
formatScheduleDateValue,
getPlayerProfileAgeCacheEntry,
getPlayerProfileCompleteness,
getPlayerProfileEffectiveStatusFromSnapshot,
getPlayerProfileMedicalSnapshot,
getPlayerProfilesState: () => playerProfilesState,
isMedicalDateValue,
parseScheduleDateValue,
playerProfileAttributeGroups,
playerProfileChangeLogLimit,
playerProfileRoleOptions,
playerProfilesStorageKey,
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
normalizePeriodizationDay,
normalizePeriodizationMultiValue,
} = periodizationStateAdapter;
function getPeriodizationSessionPlannerState() {
if (!sessionPlannerState) {
sessionPlannerState = readSessionPlannerState();
}
return sessionPlannerState;
}
const periodizationRenderer = createPeriodizationRenderer({
escapeHtml,
formatDateValue: formatScheduleDateValue,
parseDateValue: parseScheduleDateValue,
getState: () => periodizationState,
getDay: getPeriodizationDay,
canEdit: canEditPeriodizationWorkspace,
isOffDay: isPeriodizationOffDay,
getScheduleEventsForDate,
getSessionPlannerState: getPeriodizationSessionPlannerState,
getMultiSelectOpenField: getPeriodizationMultiSelectOpenField,
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
let scheduleState = null;
let medicalState = null;
let medicalRosterSearchQuery = "";
let medicalStatusFilter = "all";
let medicalOperationsTab = "availability";
let medicalHistorySearchQuery = "";
let medicalHistoryDateFilter = "all";
let medicalHistoryPlayerFilter = "all";
let medicalPlayerModalOpen = false;
let medicalPlayerModalTab = "availability";
let medicalInjuryPlanDraftsByPlayerId = new Map();
let medicalBulkSelectedPlayerIds = new Set();
let medicalBulkRecommendationOpen = false;
let playerProfilesState = null;
let playerProfilesSearchQuery = "";
let playerProfilesRoleGroupFilter = "all";
let playerProfilesRosterFilter = "all";
let playerProfilesTemporarySectionCollapsed = true;
let playerProfileActiveTab = "overview";
let playerProfileModalOpen = false;
let playerProfileNewPlayerModalOpen = false;
const playerProfileImportUndoHistoryLimit = 3;
let scoutingState = null;
let transferRoomState = null;
let sessionPlannerState = null;
let sessionPlannerExerciseLibrary = null;
let sessionPlannerExerciseLibraryFolders = null;
let workspaceDataRuntimeService = null;
let dashboardChatThreadId = "team";
let dashboardChatWidgetRuntimeFunctions = {
  renderDashboardChatWidget: () => {},
  syncDashboardChatWidgetNotificationCursor: () => {},
  showDashboardChatWidgetToast: () => {},
  hideDashboardChatWidgetToast: () => {},
  dismissDashboardChatWidgetToast: () => {},
  focusDashboardChatWidgetComposer: () => {},
  scrollDashboardChatFirstUnread: () => false,
  requestDashboardChatScrollToLatest: () => {},
  scrollDashboardChatActiveThreadToLatest: () => false,
};
let dashboardChatWidgetRuntime = null;
let dashboardChatLauncherRuntime = null;
let dashboardChatGroupCreatorRenderOnOpen = false;

const renderDashboardChatWidget = (...args) => {
  if (dashboardChatGroupCreatorOpen) {
    if (!dashboardChatGroupCreatorRenderOnOpen) {
      dashboardChatGroupCreatorPendingRender = true;
      return;
    }
    dashboardChatGroupCreatorRenderOnOpen = false;
  }
  dashboardChatWidgetRuntimeFunctions.renderDashboardChatWidget(...args);
  dashboardChatLauncherRuntime?.applyPosition();
  dashboardChatLauncherRuntime?.syncAvailability();
};
syncDashboardChatWidgetNotificationCursor = (...args) =>
  dashboardChatWidgetRuntimeFunctions.syncDashboardChatWidgetNotificationCursor(...args);
const showDashboardChatWidgetToast = (...args) => dashboardChatWidgetRuntimeFunctions.showDashboardChatWidgetToast(...args);
const hideDashboardChatWidgetToast = (...args) => dashboardChatWidgetRuntimeFunctions.hideDashboardChatWidgetToast(...args);
const dismissDashboardChatWidgetToast = (...args) => dashboardChatWidgetRuntimeFunctions.dismissDashboardChatWidgetToast(...args);
const focusDashboardChatWidgetComposer = (...args) => dashboardChatWidgetRuntimeFunctions.focusDashboardChatWidgetComposer(...args);
const scrollDashboardChatFirstUnread = (...args) => dashboardChatWidgetRuntimeFunctions.scrollDashboardChatFirstUnread(...args);
const requestDashboardChatScrollToLatest = (...args) => dashboardChatWidgetRuntimeFunctions.requestDashboardChatScrollToLatest(...args);
const scrollDashboardChatActiveThreadToLatest = (...args) => dashboardChatWidgetRuntimeFunctions.scrollDashboardChatActiveThreadToLatest(...args);
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
let dashboardChatApiStatus = {
key: "idle",
label: "Chat ready",
detail: "Open a conversation to sync.",
checkedAt: 0,
};
let dashboardChatRuntimeMessages = [];
let dashboardChatHydratedThreadIds = new Set();
let dashboardChatLocallyHiddenThreadIds = new Set();
let dashboardChatMessageSearchQuery = "";
let dashboardChatMessageSearchActiveIndex = 0;
let dashboardChatModerationOpen = false;
let dashboardChatDetailsOpen = false;
let dashboardChatMobileConversationOpen = true;
let dashboardChatThreadFilter = "all";
let dashboardChatModerationFilters = { action: "all", userId: "", threadId: "", from: "", to: "" };
let dashboardChatModerationState = { loading: false, audits: [], failedUploads: [], retentionPolicy: null, health: null, filters: dashboardChatModerationFilters, error: "" };
let dashboardChatPushDiagnosticsState = {
  loading: false,
  status: "unknown",
  label: "Check status",
  detail: "Open More to verify this device can receive push.",
  permission: "unknown",
  supported: false,
  subscribed: false,
  serverConfigured: false,
  deviceCount: 0,
  hint: "",
  checkedAt: "",
};
let dashboardChatPushDiagnosticsInFlight = null;
let dashboardChatPushDiagnosticsLastCheckedAt = 0;
const dashboardChatPushDiagnosticsAutoCooldownMs = 60 * 1000;
let dashboardChatThreadSummarySyncTimer = 0;
let dashboardChatThreadSummaryLastRequestedAt = 0;
let dashboardChatComposerAttachmentDraft = null;
let dashboardChatGroupCreatorOpen = false;
let dashboardChatCreatorMode = "group";
let dashboardChatGroupCreatorPendingRender = false;
let dashboardChatGroupCreatorPointerDownInsideCard = false;
let dashboardChatThreadSettingsDialog = null;
let dashboardChatApiRuntime = null;
let dashboardChatSubmittedComposerDrafts = new Map();

const dashboardChatPushClient = createChatPushClient({
  win,
  getAuthStore: getPlatformAuthStore,
  getChatScope: () => dashboardChatApiScope || {},
  getAssetVersion: () => window.__assetVersion || Date.now(),
  showToast: (message) => showDashboardChatWidgetToast(message, readDashboardChatWidgetState().selectedThreadId || dashboardChatTeamThreadId),
});

function getDashboardChatPushDeviceLabel(count = 0) {
  const normalizedCount = Math.max(0, Number(count) || 0);
  return `${normalizedCount} device${normalizedCount === 1 ? "" : "s"}`;
}

function normalizeDashboardChatPushDiagnostics(result = {}) {
  const source = result && typeof result === "object" ? result : {};
  const serverSubscriptions = Array.isArray(source.serverSubscriptions)
    ? source.serverSubscriptions
    : Array.isArray(source.subscriptions)
      ? source.subscriptions
      : [];
  const deviceCount = Math.max(0, Number(source.deviceCount || serverSubscriptions.length || 0));
  const permission = String(source.permission || dashboardChatPushDiagnosticsState.permission || "unknown");
  const supported = source.supported === true || (source.supported !== false && dashboardChatPushDiagnosticsState.supported === true);
  const subscribed = source.subscribed === true;
  const serverConfigured = source.serverConfigured === true || source.configured === true;
  const loading = source.loading === true;
  const explicitStatus = String(source.status || "").trim().toLowerCase();
  let status = explicitStatus || "unknown";
  if (!explicitStatus || explicitStatus === "unknown" || explicitStatus === "ok") {
    if (loading) {
      status = "checking";
    } else if (!supported) {
      status = "unsupported";
    } else if (permission === "denied") {
      status = "blocked";
    } else if (permission !== "granted") {
      status = "not-allowed";
    } else if (!serverConfigured) {
      status = "server-missing";
    } else if (!subscribed || deviceCount < 1) {
      status = "no-device";
    } else {
      status = "ready";
    }
  }
  const reason = String(source.reason || "").trim();
  const hint = String(source.hint || "").trim();
  const labels = {
    blocked: "Blocked in browser",
    checking: "Checking...",
    error: "Could not verify",
    "no-device": "No registered device",
    "not-allowed": "Needs browser permission",
    ready: `Ready · ${getDashboardChatPushDeviceLabel(deviceCount)}`,
    "server-missing": "Server not configured",
    unsupported: "Unsupported browser",
    unknown: "Not checked",
  };
  const details = {
    blocked: "Allow notifications for footballscience.xyz in browser settings, then test again.",
    checking: "Checking browser permission, service worker and server subscription.",
    error: reason || "Push notification status could not be checked.",
    "no-device": "This browser is allowed, but no active device registration exists for this account.",
    "not-allowed": "Enable notifications, then send a test push to register this device.",
    ready: "This account has an active push device registration.",
    "server-missing": "Server push keys are not configured for this environment.",
    unsupported: hint || "This browser cannot receive Web Push notifications.",
    unknown: "Open More and refresh notification health.",
  };
  return {
    loading,
    status,
    label: labels[status] || labels.unknown,
    detail: reason || hint || details[status] || details.unknown,
    permission,
    supported,
    subscribed,
    serverConfigured,
    serverSubscriptions,
    deviceCount,
    hint,
    checkedAt: source.checkedAt || new Date().toISOString(),
  };
}

async function refreshDashboardChatPushDiagnostics({ render = false, showToast = false, force = false } = {}) {
  const shouldUseCached =
    !force &&
    !showToast &&
    dashboardChatPushDiagnosticsLastCheckedAt &&
    Date.now() - dashboardChatPushDiagnosticsLastCheckedAt < dashboardChatPushDiagnosticsAutoCooldownMs &&
    dashboardChatPushDiagnosticsState.status !== "checking";
  if (shouldUseCached) {
    if (render) {
      renderDashboardChatWidget();
    }
    return dashboardChatPushDiagnosticsState;
  }
  if (dashboardChatPushDiagnosticsInFlight) {
    return dashboardChatPushDiagnosticsInFlight.then((state) => {
      if (render) {
        renderDashboardChatWidget();
      }
      return state;
    });
  }
  dashboardChatPushDiagnosticsState = normalizeDashboardChatPushDiagnostics({
    ...dashboardChatPushDiagnosticsState,
    loading: true,
    status: "checking",
  });
  if (render) {
    renderDashboardChatWidget();
  }
  dashboardChatPushDiagnosticsInFlight = (async () => {
    const result = await dashboardChatPushClient.status({ force }).catch((error) => ({
      ok: false,
      status: "error",
      supported: dashboardChatPushClient.supported?.() === true,
      permission: win?.Notification?.permission || dashboardChatPushDiagnosticsState.permission || "unknown",
      reason: error?.message || "Push notification status could not be checked.",
    }));
    dashboardChatPushDiagnosticsState = normalizeDashboardChatPushDiagnostics(result);
    dashboardChatPushDiagnosticsLastCheckedAt = Date.now();
    if (render) {
      renderDashboardChatWidget();
    }
    if (showToast) {
      showDashboardChatWidgetToast(dashboardChatPushDiagnosticsState.detail || dashboardChatPushDiagnosticsState.label);
    }
    return dashboardChatPushDiagnosticsState;
  })().finally(() => {
    dashboardChatPushDiagnosticsInFlight = null;
  });
  return dashboardChatPushDiagnosticsInFlight;
}

const getDashboardChatComposerAttachmentDraft = () => dashboardChatComposerAttachmentDraft;
const setDashboardChatComposerAttachmentDraft = (next) => {
  dashboardChatComposerAttachmentDraft = next;
};
const setDashboardChatMessageSearchQuery = (next = "") => {
  dashboardChatMessageSearchQuery = String(next || "");
};
const setDashboardChatGroupCreatorOpen = (next = false, { render = true, forceRender = false } = {}) => {
  const shouldOpen = Boolean(next) && !dashboardChatGroupCreatorOpen;
  const shouldClose = !Boolean(next) && dashboardChatGroupCreatorOpen;
  dashboardChatGroupCreatorOpen = Boolean(next);
  if (shouldOpen && forceRender) {
    dashboardChatGroupCreatorRenderOnOpen = true;
  }

  if (shouldClose && dashboardChatGroupCreatorPendingRender) {
    dashboardChatGroupCreatorPendingRender = false;
  }

  if (render && !dashboardChatGroupCreatorOpen) {
    renderDashboardChatWidget();
    return;
  }

  if (shouldOpen && forceRender) {
    renderDashboardChatWidget();
  }
};
const setDashboardChatCreatorMode = (next = "group") => {
  dashboardChatCreatorMode = next === "dm" ? "dm" : "group";
};

function normalizeDashboardChatGroupNameInput(value = "") {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeDashboardChatGroupAvatarInput(value = "") {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function getDashboardChatGroupNameRequirementLabel() {
  return `Add a group name with at least ${dashboardChatGroupNameMinLength} characters`;
}

function getDashboardChatGroupCreateDisabledTitle({ missingGroupName = false, missingParticipants = false } = {}) {
  if (missingGroupName && missingParticipants) {
    return `${getDashboardChatGroupNameRequirementLabel()} and choose at least one teammate`;
  }
  if (missingGroupName) {
    return getDashboardChatGroupNameRequirementLabel();
  }
  return "Choose at least one teammate";
}

function syncDashboardChatGroupCreateForm(form) {
  if (!form) {
    return;
  }
  const titleInput = form.querySelector("[data-dashboard-chat-group-name-input]");
  const selectedCount = form.querySelectorAll("input[name='participantIds']:checked").length;
  const visibleCount = Array.from(form.querySelectorAll("[data-dashboard-chat-group-user-search]")).filter((row) => !row.hidden).length;
  const submitButton = form.querySelector("[data-dashboard-chat-group-create-submit]");
  const statusElement = form.querySelector("[data-dashboard-chat-group-filter-status]");
  const selectedList = form.querySelector("[data-dashboard-chat-group-selected-list]");
  const titleValue = normalizeDashboardChatGroupNameInput(titleInput?.value);
  const hasTitle = titleValue.length >= dashboardChatGroupNameMinLength;
  const isReady = Boolean(hasTitle && selectedCount);
  const missingGroupName = !hasTitle;
  const missingParticipants = !selectedCount;
  const disabledTitle = getDashboardChatGroupCreateDisabledTitle({ missingGroupName, missingParticipants });
  const selectedPeople = Array.from(form.querySelectorAll("input[name='participantIds']:checked"))
    .map((input) => String(input.dataset.dashboardChatGroupParticipantName || input.value || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  form.querySelectorAll("[data-dashboard-chat-group-user-search]").forEach((row) => {
    const checkbox = row.querySelector("input[name='participantIds']");
    row.classList.toggle("is-selected", Boolean(checkbox?.checked));
  });
  if (submitButton) {
    submitButton.disabled = !isReady || form.dataset.busy === "true";
    submitButton.setAttribute("aria-disabled", submitButton.disabled ? "true" : "false");
    submitButton.title = isReady ? "Create group" : disabledTitle;
    if (form.dataset.busy !== "true") {
      submitButton.textContent = selectedCount ? `Create group (${selectedCount})` : "Create group";
    }
  }
  if (statusElement) {
    statusElement.textContent = `${visibleCount} teammate${visibleCount === 1 ? "" : "s"} visible · ${selectedCount} selected`;
  }
  if (selectedList) {
    selectedList.hidden = !selectedPeople.length;
    selectedList.innerHTML = selectedPeople
      .map((name) => `<span>${escapeHtml(name)}</span>`)
      .join("");
  }
}

function filterDashboardChatGroupCreateUsers(form) {
  if (!form) {
    return;
  }
  const query = String(form.querySelector("[data-dashboard-chat-group-user-filter]")?.value || "").trim().toLowerCase();
  form.querySelectorAll("[data-dashboard-chat-group-user-search]").forEach((row) => {
    const searchableText = row.dataset.dashboardChatGroupUserSearch || row.textContent || "";
    row.hidden = Boolean(query) && !searchableText.toLowerCase().includes(query);
  });
  syncDashboardChatGroupCreateForm(form);
}

function syncDashboardChatDirectCreateForm(form) {
  if (!form) {
    return;
  }
  const selectedInput = form.querySelector("input[name='participantId']:checked");
  const visibleCount = Array.from(form.querySelectorAll("[data-dashboard-chat-direct-user-search]")).filter((row) => !row.hidden).length;
  const submitButton = form.querySelector("[data-dashboard-chat-direct-create-submit]");
  const statusElement = form.querySelector("[data-dashboard-chat-direct-filter-status]");
  form.querySelectorAll("[data-dashboard-chat-direct-user-search]").forEach((row) => {
    const radio = row.querySelector("input[name='participantId']");
    row.classList.toggle("is-selected", Boolean(radio?.checked));
    row.classList.toggle("is-starting", Boolean(radio?.checked && form.dataset.busy === "true"));
  });
  if (submitButton) {
    const selectedHasExistingThread = Boolean(selectedInput?.dataset.dashboardChatDirectExistingThread);
    submitButton.disabled = !selectedInput || form.dataset.busy === "true";
    submitButton.setAttribute("aria-disabled", submitButton.disabled ? "true" : "false");
    submitButton.title = selectedInput ? (selectedHasExistingThread ? "Opening chat..." : "Starting chat...") : "Choose a teammate";
    if (form.dataset.busy !== "true") {
      submitButton.textContent = selectedInput
        ? `${selectedHasExistingThread ? "Open" : "Start"} chat with ${String(selectedInput.dataset.dashboardChatDirectParticipantName || "teammate").trim() || "teammate"}`
        : "Start chat";
    }
  }
  if (statusElement) {
    const selectedHasExistingThread = Boolean(selectedInput?.dataset.dashboardChatDirectExistingThread);
    statusElement.textContent = selectedInput
      ? `${selectedHasExistingThread ? "Opening" : "Starting"} ${String(selectedInput.dataset.dashboardChatDirectParticipantName || "chat").trim() || "chat"}...`
      : `${visibleCount} teammate${visibleCount === 1 ? "" : "s"} visible · start new or open existing`;
  }
}

function filterDashboardChatDirectCreateUsers(form) {
  if (!form) {
    return;
  }
  const query = String(form.querySelector("[data-dashboard-chat-direct-user-filter]")?.value || "").trim().toLowerCase();
  form.querySelectorAll("[data-dashboard-chat-direct-user-search]").forEach((row) => {
    const searchableText = row.dataset.dashboardChatDirectUserSearch || row.textContent || "";
    row.hidden = Boolean(query) && !searchableText.toLowerCase().includes(query);
  });
  syncDashboardChatDirectCreateForm(form);
}

const getDashboardSupabaseClientFromAuthStore = () => {
  const authStore = getPlatformAuthStore?.();
  return authStore?.getSupabaseClient?.() || authStore?.supabase || null;
};
function getDashboardSupabaseClient() {
  return dashboardChatApiRuntime?.getDashboardSupabaseClient?.() || getDashboardSupabaseClientFromAuthStore();
}

function getDashboardAttachmentStorageRef(attachment = {}) {
  const bucket = String(attachment.bucket || attachment.storage_bucket || "").trim();
  const path = String(attachment.path || attachment.storage_path || "").trim();
  return bucket && path ? { bucket, path } : null;
}

let sessionPlannerWorkspaceController;
const sessionPlannerAppRuntimeComposition = createSessionPlannerAppRuntimeComposition({
canEditSessionPlanner,
canRemoveSessionPlannerLibraryExerciseFromSelectedFolder,
clamp,
dataSafetySnapshotStoreName,
escapeHtml,
formatScheduleDateValue,
getCurrentPlatformUser,
getHubState: () => hubState,
getPeriodizationState: () => periodizationState,
getScheduleEventsForDate,
getScheduleMainEvent,
getScheduledSessionTitleForDate,
getSessionPlannerExerciseLibraryFoldersState: () => sessionPlannerExerciseLibraryFolders,
getSessionPlannerExerciseLibraryState: () => sessionPlannerExerciseLibrary,
getSessionPlannerSelectedBlock,
getSessionPlannerState: () => sessionPlannerState,
getSessionPlannerWorkspaceController: () => sessionPlannerWorkspaceController,
isScheduleSessionEvent,
logEvent,
openDataSafetyDatabase,
periodizationOptionLibrary,
readPeriodizationState,
renderSessionPlannerWorkspace,
runtimeRendererDeps: {
buildMedicalPlayerFromPlayerProfile,
canEditSessionPlanner,
clamp,
compareMedicalPlayers,
createMedicalRecordFromSquadAvailabilityBlock,
escapeHtml,
formatScheduleDateValue,
getDashboardSessionTotalMinutes,
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
getSessionPlannerMedicalAvailability,
getSessionPlannerPlayerBoardAutoModeOptions: () => sessionPlannerPlayerBoardAutoModeOptions,
getSessionPlannerPlayerBoardBridgeBestMatches,
getSessionPlannerPlayerBoardBridgeContract,
getSessionPlannerPlayerBoardBridgeRoleLabel,
getSessionPlannerPlayerBoardBridgeSummary,
getSessionPlannerPlayerBoardColorOptions: () => sessionPlannerPlayerBoardColorOptions,
getSessionPlannerPlayerBoardCustomPerson,
getSessionPlannerPlayerBoardMaxTeamCount: () => sessionPlannerPlayerBoardMaxTeamCount,
getSessionPlannerPlayerBoardPlayers,
getSessionPlannerPlayerBoardPosition,
getSessionPlannerPlayerBoardPositionById,
getSessionPlannerPlayerBoardProfileState,
getSessionPlannerPlayerBoardReadableSpacing,
getSessionPlannerPlayerBoardSelectedColorIds,
getSessionPlannerPlayerBoardSummary,
getSessionPlannerPlayerBoardSyncedPlayer,
getSessionPlannerPlayerBoardWarnings,
getSessionPlannerPrintPaperOptions: () => sessionPlannerPrintPaperOptions,
getSessionPlannerPrintSectionOptions: () => sessionPlannerPrintSectionOptions,
getSessionPlannerReadablePlayerBoardPositions,
getSessionPlannerSelectedBlock,
getSessionPlannerSelectedSession,
getSessionPlannerTacticalActiveFrameId,
getSessionPlannerTacticalPitchModeOptions: () => sessionPlannerTacticalPitchModeOptions,
getSessionPlannerTacticalSelectedElementIds,
getScheduledSessionTitleForDate,
isMedicalPlayerBlockedBySquadAvailability,
isPlayerProfileTemporaryActiveOnDate,
isSessionPlannerTacticalElementSelected,
isSessionPlannerTacticalEndpointElement,
isTemporaryPlayerProfile,
medicalActualParticipationFallback,
medicalOperationsTabOptions,
medicalPlayerModalTabOptions,
normalizeMedicalActualParticipation,
normalizePlayerProfileRole,
parseScheduleDateValue,
periodizationOptionLibrary,
renderSessionPlannerActionIcon,
renderSessionPlannerExerciseVisual,
renderSessionPlannerPeriodizationOverlay,
renderSessionPlannerPeriodizationSummary,
renderSessionPlannerTacticalSelectionBox,
syncSessionPlannerPlayerBoardSelection,
ensureSessionPlannerTacticalFrames,
},
saveDataSafetySnapshot,
sessionPlannerBlockFieldUpdatedAtKey,
sessionPlannerBlockMergeFieldSet,
sessionPlannerBlockMergeFields,
sessionPlannerDefaultExerciseLibrary,
sessionPlannerExerciseLibraryBackupStorageKey,
sessionPlannerExerciseLibraryFoldersBackupStorageKey,
sessionPlannerExerciseLibraryFoldersStorageKey,
sessionPlannerExerciseLibraryStorageKey,
sessionPlannerExerciseLibraryVersionLimit,
sessionPlannerLibrarySortOptions,
sessionPlannerPlayerBoardAutoModeOptions,
sessionPlannerPlayerBoardMaxTeamCount,
sessionPlannerPrintSectionOptions,
sessionPlannerTacticalMaxFrames,
sessionPlannerTacticalPitchModeKeys,
sessionPlannerTacticalPitchModeOptions,
setPeriodizationState: (nextState) => { periodizationState = nextState; },
setSessionPlannerExerciseLibrary: (exercises) => { sessionPlannerExerciseLibrary = exercises; },
setSessionPlannerExerciseLibraryFolders: (folders) => { sessionPlannerExerciseLibraryFolders = folders; },
showSessionPlannerToast,
syncSelectedSessionPlannerBlockFieldsFromDom,
ui,
updateSelectedSessionPlannerBlockField,
win,
});
const {
addSessionPlannerPlayerBoardItemToAutoTeam,
appendSessionPlannerLibraryVersion,
assignSessionPlannerPlayerBoardAutoFormationTeams,
assignSessionPlannerPlayerBoardAutoTeams,
assignSessionPlannerPlayerBoardFormationSlots,
buildSessionPlannerLibraryExerciseFromBlock,
buildSessionPlannerSelectionAssistant,
cancelSessionPlannerExerciseLibraryFolderEdit,
cancelSessionPlannerLibraryExerciseEdit,
cleanSessionPlannerPlayerBoardFormationInput,
clearSessionPlannerLibraryFilter,
clearSessionPlannerMultiSelectValue,
cloneSessionPlannerLibraryExercise,
cloneSessionPlannerTacticalElement,
cloneSessionPlannerTacticalFrame,
compareSessionPlannerLibraryExercises,
configureRuntimeAccessors: configureSessionPlannerAppRuntimeAccessors,
createSessionPlannerBlock,
createSessionPlannerDefaultExerciseLibraryFolders,
createSessionPlannerExerciseLibraryBackupEnvelope,
createSessionPlannerExerciseLibraryFoldersBackupEnvelope,
createSessionPlannerInitialBlockFieldMeta,
createSessionPlannerLibraryExercise,
createSessionPlannerLibraryFolder,
createSessionPlannerLibraryVersionSnapshot,
createSessionPlannerLineElement,
createSessionPlannerPlayerBoardAutoAssignmentsFromTeams,
createSessionPlannerPlayerBoardAutoTeamFormationSlots,
createSessionPlannerPlayerBoardAutoTeams,
createSessionPlannerPlayerBoardAutoTeamSlotPlan,
createSessionPlannerPlayerBoardExtraTeamSlots,
createSessionPlannerPlayerBoardFormationSlots,
createSessionPlannerReviewNoteFromBlock,
createSessionPlannerReviewNoteId,
createSessionPlannerStableId,
duplicateSessionPlannerLibraryExercise,
exerciseLibraryActions,
exerciseLibraryReviewHelpers,
exerciseLibraryRuntimeFacade,
exerciseMatchesSessionPlannerLibraryFilterValue,
exerciseMatchesSessionPlannerLibraryFolder,
findSessionPlannerExerciseLibraryInSnapshots,
formatMedicalDateLabel,
formatSessionPlannerLibraryTags,
formatSessionPlannerMultiValue,
formatSessionPlannerPlayerWarningNames,
getDefaultTacticalColor,
getDefaultTacticalLineStyle,
getFilteredSessionPlannerExerciseLibrary,
getMedicalPlayerInitials,
getSessionPlannerActiveExerciseLibrary,
getSessionPlannerExerciseLibrary,
getSessionPlannerExerciseLibraryFolders,
getSessionPlannerExerciseReviewNotes,
getSessionPlannerExerciseReviewNotesForBlock,
getSessionPlannerLibraryArchiveCounts,
getSessionPlannerLibraryEditExercise,
getSessionPlannerLibraryExerciseById,
getSessionPlannerLibraryExerciseEditFields,
getSessionPlannerLibraryExercisesByArchiveState,
getSessionPlannerLibraryFilterValues,
getSessionPlannerLibraryFolderById,
getSessionPlannerLibraryFolderCount,
getSessionPlannerLibraryFolderExerciseIdSet,
getSessionPlannerLibraryFolderName,
getSessionPlannerLibraryNow,
getSessionPlannerLibraryOptionValues,
getSessionPlannerLibraryUserId,
getSessionPlannerLibraryViewExercise,
getSessionPlannerMultiSelectFieldConfig,
getSessionPlannerMultiSelectOpenField,
getSessionPlannerMultiValueSummary,
getSessionPlannerPlayerBoardAutoTeamCell,
getSessionPlannerPlayerBoardAutoTeamGrid,
getSessionPlannerPlayerBoardCareerPhasePriority,
getSessionPlannerPlayerBoardCareerScore,
getSessionPlannerPlayerBoardColorStyle,
getSessionPlannerPlayerBoardCustomColor,
getSessionPlannerPlayerBoardDataObject,
getSessionPlannerPlayerBoardDefaultGridPosition,
getSessionPlannerPlayerBoardDefaultPosition,
getSessionPlannerPlayerBoardDirectRoleFitScore,
getSessionPlannerPlayerBoardExplicitRoles,
getSessionPlannerPlayerBoardFormationLineRole,
getSessionPlannerPlayerBoardFormationLineY,
getSessionPlannerPlayerBoardFormationSide,
getSessionPlannerPlayerBoardFormationSideOrder,
getSessionPlannerPlayerBoardFormationSlotX,
getSessionPlannerPlayerBoardImportanceScore,
getSessionPlannerPlayerBoardInitialLabelMap,
getSessionPlannerPlayerBoardItemPriorityScore,
getSessionPlannerPlayerBoardLabelCandidates,
getSessionPlannerPlayerBoardMinutesScore,
getSessionPlannerPlayerBoardNumericPriorityValue,
getSessionPlannerPlayerBoardPlayerRoleProfile,
getSessionPlannerPlayerBoardPositionGroup,
getSessionPlannerPlayerBoardPriorityScore,
getSessionPlannerPlayerBoardRelationLookupValue,
getSessionPlannerPlayerBoardRelationPairs,
getSessionPlannerPlayerBoardRelationScore,
getSessionPlannerPlayerBoardRoleGroupForRole,
getSessionPlannerPlayerBoardRoleOrder,
getSessionPlannerPlayerBoardRolePriorityKeys,
getSessionPlannerPlayerBoardRolePriorityValue,
getSessionPlannerPlayerBoardSideForRole,
getSessionPlannerPlayerBoardSourceBlocks,
getSessionPlannerPlayerBoardSourceLabel,
getSessionPlannerPlayerBoardSquadStatusPriority,
getSessionPlannerPlayerBoardStoredRelationScore,
getSessionPlannerPlayerBoardTextColor,
getSessionPlannerPlayerBoardTone,
getSessionPlannerTacticalCurveControlPoint,
getSessionPlannerTacticalDefaultCurveControlPoint,
getSessionPlannerTacticalPitchDimensionsForBlock,
getSessionPlannerTacticalPitchModeOption,
getSessionPlannerTacticalPlayerBadgeFromKeyboardEvent,
getSessionPlannerTacticalRenderStrokeWidth,
getSessionPlannerVisibleLibraryFolders,
getSessionPlannerArchivedLibraryFolders,
getTacticalStrokeDasharray,
getUniqueSessionPlannerLibraryFolderName,
hasSessionPlannerLibraryExerciseEditChanges,
hasSessionPlannerPlayerBoardTeamData,
isSessionPlannerLibraryExerciseArchived,
isSessionPlannerLibraryFolderArchived,
isSessionPlannerTacticalGoalType,
isSessionPlannerTacticalPlayerType,
mapSessionPlannerPlayerBoardSlotToAutoTeamCell,
normalizeMedicalOperationsTab,
normalizeMedicalPlayerModalTab,
normalizeSessionPlannerBlockFieldMeta,
normalizeSessionPlannerExerciseLibraryFolders,
normalizeSessionPlannerExerciseLibraryList,
normalizeSessionPlannerExerciseReviewNote,
normalizeSessionPlannerExerciseReviewNotes,
normalizeSessionPlannerLibraryFilterValues,
normalizeSessionPlannerLibraryFolderExerciseIds,
normalizeSessionPlannerLibraryFolderVisibility,
normalizeSessionPlannerLibrarySortMode,
normalizeSessionPlannerLibraryTags,
normalizeSessionPlannerLibraryTitle,
normalizeSessionPlannerLibraryVersions,
normalizeSessionPlannerMultiValue,
normalizeSessionPlannerPlayerBoardAutoMode,
normalizeSessionPlannerPlayerBoardColors,
normalizeSessionPlannerPlayerBoardColorsFromModule,
normalizeSessionPlannerPlayerBoardCustomPeople,
normalizeSessionPlannerPlayerBoardCustomPeopleFromModule,
normalizeSessionPlannerPlayerBoardFormationValue,
normalizeSessionPlannerPlayerBoardPositions,
normalizeSessionPlannerPlayerBoardPositionsFromModule,
normalizeSessionPlannerPlayerBoardProfileKey,
normalizeSessionPlannerPlayerBoardRoleGroupKey,
normalizeSessionPlannerPlayerBoardSquadStatusKey,
normalizeSessionPlannerPlayerBoardTeamCount,
normalizeSessionPlannerTacticalActiveFrameId,
normalizeSessionPlannerTacticalFrameLabel,
normalizeSessionPlannerTacticalFrames,
normalizeSessionPlannerTacticalPitchMode,
normalizeSessionPlannerTacticalPlayerBadge,
normalizeSessionPlannerTimestamp,
normalizeTacticalColor,
normalizeTacticalLineStyle,
normalizeTacticalLineWidth,
normalizeTacticalRotation,
parseSessionPlannerExerciseLibraryFoldersPayload,
parseSessionPlannerExerciseLibraryPayload,
parseSessionPlannerPlayerBoardFormation,
parseSessionPlannerTimestampMs,
pickSessionPlannerPlayerBoardAutoTeamSlotItem,
pickSessionPlannerPlayerBoardBalancedTeamIndex,
queueSessionPlannerExerciseLibrarySnapshotRecovery,
readSessionPlannerExerciseLibrary,
readSessionPlannerExerciseLibraryFolders,
readSessionPlannerExerciseLibraryFoldersFromStorage,
readSessionPlannerExerciseLibraryFromStorage,
removeSessionPlannerExerciseFromLibraryFolder,
renderMedicalMetric,
renderMedicalPlayerAvatar,
renderMedicalSquadAvailabilityBadge,
renderMedicalTemporaryPlayerBadge,
renderSessionPlannerLibraryResults,
restoreSessionPlannerExerciseLibraryFolder,
saveSessionPlannerLibraryExerciseEditAsCopy,
scoreSessionPlannerPlayerBoardAutoTeamSlotCandidate,
scoreSessionPlannerPlayerBoardFormationFit,
selectSessionPlannerLibraryFolder,
sessionPlannerBlockHelpers,
sessionPlannerLocalUiState,
sessionPlannerMedicalAvailabilitySelectors,
sessionPlannerMultiSelectFields,
sessionPlannerPlayerBoardPositionGroups,
sessionPlannerPlayerBoardRenderer,
sessionPlannerPrintRenderer,
sessionPlannerRenderer,
sessionPlannerRuntimeDelegates,
sessionPlannerRuntimeRenderers,
sessionPlannerSessionFactory,
sessionPlannerTacticalHelpers,
sessionPlannerVisualRenderer,
sessionPlannerWorkspaceRenderer,
setSessionPlannerLibraryFilterValues,
setSessionPlannerMultiSelectOpenField,
shouldSessionPlannerPlayerBoardAutoUseGoalkeeperSlots,
startSessionPlannerExerciseLibraryFolderEdit,
startSessionPlannerLibraryExerciseEdit,
startSessionPlannerLibraryExerciseView,
toggleSessionPlannerLibraryFilterOpen,
toggleSessionPlannerLibraryFilterValue,
toggleSessionPlannerMultiSelectValue,
updateSessionPlannerLibraryArchiveView,
updateSessionPlannerLibraryExerciseFromEdit,
updateSessionPlannerLibraryFilter,
updateSessionPlannerLibrarySearch,
updateSessionPlannerLibrarySortMode,
updateSessionPlannerExerciseLibraryFolderFromForm,
writeSessionPlannerExerciseLibrary,
writeSessionPlannerExerciseLibraryFoldersToStorage,
writeSessionPlannerExerciseLibraryToStorage
} = sessionPlannerAppRuntimeComposition;
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
renderWorkspace: () => {
if (hubState?.activeWorkspaceId === "idp") {
renderIdpWorkspace();
return;
}
renderPlayerProfilesWorkspace();
},
win,
});
let selectedStaffUserId = null;
let staffCreateUserEditorOpen = false;
let staffCreateUserDraft = null;
let adminRuntimeService = null;
const resolvePlayerWorkActorLabel = (actorId, fallback = "Football Science") => {
  const cleanActorId = String(actorId ?? "").trim();
  if (!cleanActorId) {
    return fallback;
  }
  if (cleanActorId === "squad-room") {
    return "Squad Room";
  }
  if (cleanActorId === "coach-safe") {
    return "Coach view";
  }
  const currentUser = getCurrentPlatformUser?.();
  try {
    const scopedUserList = getScopedPlatformUsers?.();
    const scopedUsers = Array.isArray(scopedUserList) ? scopedUserList : [];
    const teamId = getUserTeamId?.(currentUser) || "";
    const teamUsers = getAdminUsersForTeam?.(scopedUsers, teamId) || [];
    const candidates = [currentUser, ...teamUsers].filter(Boolean);
    const actor = candidates.find((user) =>
      [user.id, user.userId, user.email, user.name]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .includes(cleanActorId)
    );
    if (actor) {
      return formatUserName(actor);
    }
  } catch {
    return fallback;
  }
  return cleanActorId.includes("@") ? cleanActorId : fallback;
};
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
formatMedicalDateLabel,
formatPlayerProfileChangeTime,
formatUserName,
getAdminAuditState,
getAdminManagedWorkspaces,
getAdminTransferRoomAccessTeamId,
getAdminUserInitials,
getAllTemporaryPlayerProfiles,
getAssignableRolesForUser,
getClubById: getPlatformClubById,
getFilteredPlayerProfiles: () => playerProfilesState.players,
getHomeAppearanceImpactSummary,
getMedicalPlayerInjuryPlans,
getMedicalPlayerRecords,
getMedicalRecordStatus,
getMedicalRtpPhaseOption,
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
getSelectedAdminUserId,
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
resolvePlayerWorkActorLabel,
});
adminRuntimeService = createAdminRuntimeService({
adminWorkspaceRenderer,
buildPlatformTemporaryLoginMessage,
buildPlatformUserCredentialMessage,
canAdminManageUser,
createPlatformStructureId,
ensureTransferRoomState,
fetchRef: (...args) => fetch(...args),
flushCentralStateWrites,
formatUserName,
getAdminUserInitialsFromModule,
getAssignableRolesForUser,
getCurrentPlatformUser,
getHubState: () => hubState,
getPlatformApiAccessToken,
getPlatformAuthStore,
getPlatformClubById,
getPlatformFormValues,
getPlatformRoles,
getPlatformStructureState,
getPlatformTeamById,
getPlatformUsers,
getScopedPlatformClubs,
getScopedPlatformUsers,
getUserTeamId,
getWorkspaceByIdFromPool,
hasPlatformWorkspaceScope,
isCurrentPlatformUserAdmin,
isLegacyPlatformStructureValue,
isPlatformAdminUser,
normalizePlatformClub,
normalizePlatformRole,
normalizePlatformStructureText,
normalizePlatformTeam,
platformDefaultTeamId,
readPlatformStructureState,
renderDashboardCards,
setHubState: (nextHubState) => { hubState = nextHubState; },
syncPlatformStructureWithUsers,
topIconMenuOrder,
ui,
win,
writePlatformAppearanceState,
writePlatformStructureState,
});
const medicalRuntimeServiceComposition = createMedicalRuntimeServiceComposition({
addCalendarDays,
archiveMedicalPlayersRemovedFromSquad,
canEditMedicalTeam,
clamp,
createDashboardId,
defaultMedicalPlayers,
escapeHtml,
fetchRef: (...args) => fetch(...args),
formatMedicalDateLabel,
formatScheduleDateValue,
getCurrentPlatformUser,
getPlatformApiAccessToken,
getMedicalAvailabilityItems,
getMedicalBulkRecommendationOpen: () => medicalBulkRecommendationOpen,
getMedicalBulkSelectedPlayerIds: () => medicalBulkSelectedPlayerIds,
getMedicalHistoryDateFilter: () => medicalHistoryDateFilter,
getMedicalHistoryPlayerFilter: () => medicalHistoryPlayerFilter,
getMedicalHistorySearchQuery: () => medicalHistorySearchQuery,
getMedicalOperationsTab: () => medicalOperationsTab,
getMedicalPlayerModalOpen: () => medicalPlayerModalOpen,
getMedicalPlayerModalTab: () => medicalPlayerModalTab,
getMedicalRemovedSquadPlayerIdSet,
getMedicalRosterSearchQuery: () => medicalRosterSearchQuery,
getMedicalState: () => medicalState,
getMedicalStatusFilter: () => medicalStatusFilter,
getPlatformFormValues,
getPlayerProfileRosterLabel,
getPlayerProfilesState: () => playerProfilesState || readPlayerProfilesState(),
getPlatformStructureState,
getPlatformTeamDisplayName,
getScheduleEventsForDate,
getScheduleMainEvent,
getMedicalWorkspace: () => ui.medicalTeamWorkspace,
isCurrentPlatformUserAdmin,
isMedicalDateValue,
isMedicalPlayerRemovedFromSquad,
isScheduleSessionEvent,
isTemporaryPlayerProfile,
isPlayerProfileTemporaryActiveOnDate,
logEvent,
medicalActualParticipationFallback,
medicalClearanceRoles,
medicalDataSafetySyncStatusOptions,
medicalDefaultRosterVersion,
medicalGateOptions,
medicalInjuryDurationPresets,
medicalInjuryPlanDraftsByPlayerId,
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
medicalTeamStorageKey,
medicalWindowLength,
navigatorRef: navigator,
normalizeMedicalOperationsTab,
normalizeMedicalPlayerModalTab,
normalizePlatformStructureText,
normalizePlayerProfileName,
normalizePlayerProfileRole,
normalizePlayerProfileRoleList,
normalizePlayerProfileRosterType,
normalizePlayerProfileTemporaryDate,
parseScheduleDateValue,
playerProfileRosterTypeCountsInSquad,
playerProfileStatusOptions,
rawDataSafetySetItem,
renderMedicalMetric,
renderMedicalPlayerAvatar,
renderMedicalSquadAvailabilityBadge,
renderMedicalTemporaryPlayerBadge,
scheduleEventTypes,
setMedicalBulkRecommendationOpen: (isOpen) => { medicalBulkRecommendationOpen = Boolean(isOpen); },
setMedicalBulkSelectedPlayerIds: (selectedIds) => {
medicalBulkSelectedPlayerIds = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
},
setMedicalHistoryDateFilter: (filter) => { medicalHistoryDateFilter = filter || "all"; },
setMedicalHistoryPlayerFilter: (filter) => { medicalHistoryPlayerFilter = filter || "all"; },
setMedicalHistorySearchQuery: (query) => { medicalHistorySearchQuery = query || ""; },
setMedicalOperationsTab: (tab) => { medicalOperationsTab = tab; },
setMedicalPlayerModalOpen: (isOpen) => { medicalPlayerModalOpen = Boolean(isOpen); },
setMedicalPlayerModalTab: (tab) => { medicalPlayerModalTab = tab; },
setMedicalState: (nextState) => { medicalState = nextState; },
win,
});
const { medicalRuntimeService } = medicalRuntimeServiceComposition;
configureMedicalRuntimeAccessors(() => medicalRuntimeService);
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
} = medicalRuntimeServiceComposition;
const platformRuntimeServices = createPlatformAppRuntimeServices({
documentRef: document,
win,
ui,
platformAssetVersion,
platformModuleLoader,
periodizationStateAdapter,
canCurrentUserEditWorkspace,
canEditPeriodizationWorkspace,
canEditScheduleWorkspace,
canEditScoutingWorkspace,
canEditSessionPlanner,
canUserAccessTransferRoom,
canUserEditTransferRoom,
createSessionPlannerEmptySession,
ensurePeriodizationState,
ensureScoutingState,
formatScheduleBlockSummary,
formatScheduleDateValue,
getAssignableRolesForUser,
getCurrentPlatformUser,
getHubState: () => hubState,
getMedicalState: () => medicalState,
getPeriodizationDay,
getPeriodizationDayScheduleLabel,
getPeriodizationMatchDayLabel,
getPeriodizationState: () => periodizationState,
getPlatformApiAccessToken,
getPlatformAuthStore,
getPlatformFormValues,
getPlatformTeamLogoUrl,
getPlatformUsers,
formatUserName,
getPlayerProfilesState: () => playerProfilesState,
getPlayerProfilesStateForGameplan: () => playerProfilesState || readPlayerProfilesState(),
openPresentationMode: (dateValue, meetingType = "team", options = {}) => presentationModeController?.open(dateValue, meetingType, options),
getPlayerProfilesStateForTransferRoom: () => playerProfilesState || readPlayerProfilesState(),
renderPlayerProfileScoutingSpider,
getSafeWorkspaceId,
getScheduleState: () => scheduleState,
getScheduleStateForGameplan: () => scheduleState || readScheduleState(),
getScoutingState: () => scoutingState,
getScoutingStateForTransferRoom: () => scoutingState || readScoutingState(),
getSessionPlannerExerciseLibrary: () => sessionPlannerExerciseLibrary,
getSessionPlannerExerciseLibraryFolders: () => sessionPlannerExerciseLibraryFolders,
getSessionPlannerState: () => sessionPlannerState,
getTransferRoomState: () => transferRoomState,
getUserTeamId,
getUserTeamName,
getWorkspaceViewId,
isPlatformAdminUser,
isPlatformManagementUser,
isPlatformStaffUser,
isScheduleSessionEvent,
normalizePlatformImageUrl,
normalizePlatformRole,
normalizePlatformStructureText,
parseScheduleDateValue,
periodizationFieldUpdatedAtKey,
periodizationStorageKey,
periodizationTrackedFields,
periodizationYear,
platformDefaultRoles,
platformManagementRoleSet,
platformStructureStorageKey,
queueGameSimulatorControllersLoad,
rawDataSafetySetItem,
readMedicalState,
readPlayerProfilesState,
readScheduleState,
readSessionPlannerExerciseLibrary,
readSessionPlannerExerciseLibraryFolders,
readSessionPlannerState,
renderPeriodizationWorkspace,
renderSessionPlannerWorkspace,
renderTransferRoomWorkspace,
scheduleStorageKey,
scoutingStorageKey,
selectPeriodizationDate,
setActiveWorkspace: (...args) => setActiveWorkspace(...args),
setMedicalState: (nextState) => { medicalState = nextState; },
setPeriodizationState: (nextState) => { periodizationState = nextState; },
setPlayerProfilesState: (nextState) => { playerProfilesState = nextState; },
setScheduleState: (nextState) => { scheduleState = nextState; },
setScoutingState: (nextState) => { scoutingState = nextState; },
setSessionPlannerExerciseLibrary: (nextLibrary) => { sessionPlannerExerciseLibrary = nextLibrary; },
setSessionPlannerExerciseLibraryFolders: (nextFolders) => { sessionPlannerExerciseLibraryFolders = nextFolders; },
setSessionPlannerState: (nextState) => { sessionPlannerState = nextState; },
setTransferRoomState: (nextState) => { transferRoomState = nextState; },
shouldDeferCentralizedAppStateReload,
suppressCentralWrites: (key) => centralStateWriteSuppressionKeys.add(key),
unsuppressCentralWrites: (key) => centralStateWriteSuppressionKeys.delete(key),
workspaceHubDefaultActiveWorkspaceId,
workspaceHubStorageKey,
workspaceLastActiveStorageKey,
writeScheduleState,
writeScoutingState,
writeSessionPlannerState,
});
const {
platformStructureRuntimeService,
scheduleRuntimeSelectors,
scheduleWorkspaceController,
transferRoomRuntime,
workspaceAccessRuntimeService,
renderScheduleWorkspace,
} = platformRuntimeServices;
workspaceDataRuntimeService = platformRuntimeServices.workspaceDataRuntimeService;
workspaceModuleRuntimeController = platformRuntimeServices.workspaceModuleRuntimeController;
const profileImageRuntimeActions = createProfileImageRuntimeActions({
buildPlayerProfileOperationFeedback,
canEditPlayerProfiles,
createProfileImageDataUrl: createProfileImageDataUrlFromModule,
createTeamLogoDataUrl: createTeamLogoDataUrlFromModule,
documentRef: document,
ensurePlayerProfilesState,
getCurrentPlatformUser,
getPlatformTeamDisplayTeam,
getPlayerProfilesState: () => playerProfilesState,
ImageCtor: Image,
maxProfileImageUploadDataUrlLength,
readPlatformStructureState,
renderPlayerProfilesWorkspace,
updatePlayerProfile,
URLRef: URL,
writePlatformTeamLogo,
});
const {
createProfileImageDataUrl,
handlePhotoInput,
uploadPlayerProfilePhoto,
uploadSquadTeamLogo,
} = profileImageRuntimeActions;
function renderAdminRoleOptions(actor, selectedRole = "coach") { return adminStructureRenderer.renderRoleOptions(actor, selectedRole); }
function renderAdminTeamOptions(actor, structure, selectedTeamId = "") { return adminStructureRenderer.renderTeamOptions(actor, structure, selectedTeamId); }
let dashboardChatThreadSettings = null;
let readDashboardMessages = () => [];
let normalizeDashboardApiMessage = (message = {}, thread = null) => ({ ...message, threadId: thread?.threadId || message?.threadId || "" });
const resolveDashboardChatApiMessageForDomain = (...args) => normalizeDashboardApiMessage(...args);
let mergeDashboardChatApiMessages = () => [];
const dashboardChatDomainRuntime = createDashboardChatDomainRuntime({
  getCurrentPlatformUser,
  getPlatformUsers: () => getPlatformUsers(),
  getDashboardChatApiScope: () => dashboardChatApiScope,
  getDashboardChatAdvancedThreadTemplates: () => dashboardChatAdvancedThreadTemplates,
  getDashboardChatApiThreads: () => dashboardChatApiThreads,
  getDashboardChatThreadSettings: () => dashboardChatThreadSettings,
  dashboardChatTeamThreadId,
  dashboardChatWidgetStateStorageKey,
  dashboardChatWidgetNotificationStateStorageKey,
  dashboardChatWidgetNotificationCursorStorageKey,
  dashboardChatPriorityKeys,
  dashboardChatReactionOptions,
  dashboardChatMaxMessageLength,
  createDashboardId,
  normalizePlatformRole,
  formatUserName,
  escapeHtml,
  normalizeDashboardApiMessage: resolveDashboardChatApiMessageForDomain,
  readDashboardMessages,
  createDashboardChatMessageTextRenderer,
  readDashboardJson,
  writeDashboardJson,
});
const {
  normalizeDashboardChatThreadId: runtimeNormalizeDashboardChatThreadId,
  createDashboardChatThreadId,
  getDashboardChatTeamName,
  getDashboardChatTeamChatTitle,
  formatDashboardChatThreadLabel,
  normalizeDashboardUserIdentityValue,
  isSameDashboardUser,
  isGenericDashboardChatThreadTitle,
  getDashboardChatThreadParticipants,
  getDashboardChatThreadLabel,
  getDashboardChatActiveToastThreadId,
  readDashboardChatWidgetState: runtimeReadDashboardChatWidgetState,
  writeDashboardChatWidgetState: runtimeWriteDashboardChatWidgetState,
  readDashboardChatWidgetNotificationState: runtimeReadDashboardChatWidgetNotificationState,
  writeDashboardChatWidgetNotificationState: runtimeWriteDashboardChatWidgetNotificationState,
  readDashboardChatWidgetNotificationCursor: runtimeReadDashboardChatWidgetNotificationCursor,
  writeDashboardChatWidgetNotificationCursor: runtimeWriteDashboardChatWidgetNotificationCursor,
  getDashboardChatLatestNotificationMessageForThread: runtimeGetDashboardChatLatestNotificationMessageForThread,
  markDashboardChatWidgetNotificationSeenForThread: runtimeMarkDashboardChatWidgetNotificationSeenForThread,
  isDashboardDocumentActivelyViewed,
  isDashboardChatThreadActivelyViewed,
  normalizeDashboardMentionToken,
  getDashboardMentionKeys,
  getDashboardMentionUserIdsForToken,
  getDashboardMentionUserIds,
  normalizeDashboardReactions,
  normalizeDashboardMessageAuthor,
  normalizeDashboardMessage,
  getDashboardMessageCreatedAtMs,
  compareDashboardChatMessages,
  getDashboardMessageIdentityKeys,
  normalizeDashboardChatPriority: runtimeNormalizeDashboardChatPriority,
  canPinDashboardChatMessage: runtimeCanPinDashboardChatMessage,
  renderDashboardMessageText: runtimeRenderDashboardMessageText,
} = dashboardChatDomainRuntime;
const normalizeDashboardChatThreadId = runtimeNormalizeDashboardChatThreadId;
const readDashboardChatWidgetState = (...args) => runtimeReadDashboardChatWidgetState(...args);
const writeDashboardChatWidgetState = (...args) => runtimeWriteDashboardChatWidgetState(...args);
const readDashboardChatWidgetNotificationState = (...args) => runtimeReadDashboardChatWidgetNotificationState(...args);
const writeDashboardChatWidgetNotificationState = (...args) => runtimeWriteDashboardChatWidgetNotificationState(...args);
const readDashboardChatWidgetNotificationCursor = (...args) => runtimeReadDashboardChatWidgetNotificationCursor(...args);
const writeDashboardChatWidgetNotificationCursor = (...args) => runtimeWriteDashboardChatWidgetNotificationCursor(...args);
const getDashboardChatLatestNotificationMessageForThread = (...args) => runtimeGetDashboardChatLatestNotificationMessageForThread(...args);
const markDashboardChatWidgetNotificationSeenForThread = (...args) => runtimeMarkDashboardChatWidgetNotificationSeenForThread(...args);
function renderDashboardMessageText(message, users = getPlatformUsers(), options = {}) {
  return runtimeRenderDashboardMessageText(message, users, options);
}
function canPinDashboardChatMessage(user = getCurrentPlatformUser()) {
  return runtimeCanPinDashboardChatMessage(user);
}
function normalizeDashboardChatPriority(value) {
  return runtimeNormalizeDashboardChatPriority(value);
}
dashboardChatThreadSettings = createDashboardChatThreadSettingsStore({
  readJson: readDashboardJson,
  writeJson: writeDashboardJson,
  normalizeThreadId: normalizeDashboardChatThreadId,
  fallbackThreadId: dashboardChatTeamThreadId,
});

const dashboardChatApiDomainRuntime = createDashboardChatApiDomainRuntime({
  getDashboardChatAdvancedThreadTemplates: () => dashboardChatAdvancedThreadTemplates,
  dashboardChatTeamThreadId,
  dashboardChatThreadSettings: () => dashboardChatThreadSettings,
  getDashboardChatApiThreads: () => dashboardChatApiThreads,
  getDashboardChatTeamChatTitle,
  getCurrentPlatformUser,
  getPlatformAuthStore,
  normalizeDashboardMessage,
  withUiTimeout,
  win,
  fetchImpl: (...args) => fetch(...args),
  getDashboardChatThreadParticipants,
});
const {
  canFallbackDashboardChatApiResult,
  fetchDashboardChatApi,
  getDashboardChatApiAccessToken,
  getDashboardChatParticipantIdsForApi,
  getDashboardChatThreadTypeForApi,
  logDashboardChatApiFailure,
  normalizeDashboardApiParticipant,
  normalizeDashboardApiMessage: resolvedNormalizeDashboardApiMessage,
  normalizeDashboardApiThread,
  sendDashboardChatApiAction,
} = dashboardChatApiDomainRuntime;
normalizeDashboardApiMessage = resolvedNormalizeDashboardApiMessage;
let updateDashboardMessageLocalStatus = () => {};
const getIsCurrentPlatformUserAdmin = () => {
  if (typeof isCurrentPlatformUserAdmin === "function") {
    return isCurrentPlatformUserAdmin();
  }
  if (typeof isPlatformAdminUser === "function") {
    return isPlatformAdminUser();
  }
  return false;
};
function canDeleteDashboardChatMessage(message = null, currentUser = getCurrentPlatformUser()) {
  if (getIsCurrentPlatformUserAdmin()) {
    return true;
  }
  const currentUserId = String(currentUser?.id || "").trim();
  const messageAuthorId = String(message?.userId || message?.authorId || message?.senderId || message?.author?.id || "").trim();
  return Boolean(currentUserId && messageAuthorId && currentUserId === messageAuthorId);
}

dashboardChatApiRuntime = createDashboardChatApiRuntime({
  dashboardChatTeamThreadId,
  dashboardChatApiPageLimit,
  dashboardChatModerationDefaultFilters: dashboardChatModerationFilters,
  canFallbackDashboardChatApiResult,
  canPinDashboardChatMessage,
  createDashboardId,
  fetchDashboardChatApi,
  formatDashboardTime,
  getCurrentPlatformUser,
  getCurrentAuthStore: getPlatformAuthStore,
  getDashboardApiFilters: () => dashboardChatModerationFilters,
  getDashboardApiPagination: () => dashboardChatApiPagination,
  setDashboardApiPagination: (nextPagination = {}) => {
    dashboardChatApiPagination =
      nextPagination && typeof nextPagination === "object" && !Array.isArray(nextPagination)
        ? { ...nextPagination }
        : {};
  },
  getDashboardApiScope: () => dashboardChatApiScope,
  setDashboardApiScope: (nextScope) => {
    dashboardChatApiScope = nextScope;
    dashboardChatPushClient
      .refreshExistingSubscription(readDashboardChatWidgetNotificationState().level || "all")
      .then((result) => {
        if (result?.ok && !result.cached) {
          return refreshDashboardChatPushDiagnostics({ render: false });
        }
        return null;
      })
      .catch(() => {});
  },
  getDashboardApiThreads: () => dashboardChatApiThreads,
  setDashboardApiThreads: (nextThreads = []) => {
    dashboardChatApiThreads = Array.isArray(nextThreads) ? nextThreads : [];
  },
  getDashboardHydratedThreadIds: () => dashboardChatHydratedThreadIds,
  setDashboardHydratedThreadIds: (nextValue = new Set()) => {
    dashboardChatHydratedThreadIds =
      nextValue instanceof Set ? new Set(nextValue) : new Set(Array.isArray(nextValue) ? nextValue : []);
  },
  getDashboardChatCurrentViewState: () => readDashboardChatWidgetState(),
  getDashboardChatThreadTypeForApi,
  getDashboardChatThreadLabel,
  getDashboardChatThreadSettings: () => dashboardChatThreadSettings,
  getDashboardMessageDraft: () => dashboardChatMessageSearchQuery,
  getDashboardChatApiThreadSummarySyncLastRequestedAt: () => dashboardChatThreadSummaryLastRequestedAt,
  setDashboardChatApiThreadSummaryLastRequestedAt: (value = 0) => {
    dashboardChatThreadSummaryLastRequestedAt = Number(value) || 0;
  },
  getDashboardChatApiThreadSummarySyncTimer: () => dashboardChatThreadSummarySyncTimer,
  setDashboardChatApiThreadSummarySyncTimer: (value = 0) => {
    dashboardChatThreadSummarySyncTimer = Number(value) || 0;
  },
  getDashboardChatApiSyncTimer: () => dashboardChatApiSyncTimer,
  setDashboardChatApiSyncTimer: (value = 0) => {
    dashboardChatApiSyncTimer = Number(value) || 0;
  },
  getDashboardChatRealtimeSignature: () => dashboardChatApiRealtimeSignature,
  setDashboardChatRealtimeSignature: (nextSignature) => {
    dashboardChatApiRealtimeSignature = String(nextSignature || "");
  },
  getDashboardChatRealtimeChannel: () => dashboardChatApiRealtimeChannel,
  setDashboardChatRealtimeChannel: (nextChannel) => {
    dashboardChatApiRealtimeChannel = nextChannel;
  },
  getDashboardChatRealtimeStatus: () => dashboardChatApiRealtimeStatus,
  setDashboardChatRealtimeStatus: (nextStatus) => {
    dashboardChatApiRealtimeStatus = String(nextStatus || "idle");
  },
  getDashboardChatRealtimeLastEventAt: () => dashboardChatApiRealtimeLastEventAt,
  setDashboardChatRealtimeLastEventAt: (value = 0) => {
    dashboardChatApiRealtimeLastEventAt = Number(value) || 0;
  },
  getDashboardChatRealtimeRecoveryTimer: () => dashboardChatApiRealtimeRecoveryTimer,
  setDashboardChatRealtimeRecoveryTimer: (value = 0) => {
    dashboardChatApiRealtimeRecoveryTimer = Number(value) || 0;
  },
  getDashboardChatApiStatus: () => dashboardChatApiStatus,
  setDashboardChatApiStatus: (nextStatus = {}) => {
    dashboardChatApiStatus = {
      ...dashboardChatApiStatus,
      ...(nextStatus && typeof nextStatus === "object" && !Array.isArray(nextStatus) ? nextStatus : {}),
    };
  },
  getDashboardChatModerationState: () => dashboardChatModerationState,
  setDashboardChatModerationState: (nextState) => {
    dashboardChatModerationState = { ...dashboardChatModerationState, ...nextState };
  },
  getDashboardMessages: () => readDashboardMessages(),
  setDashboardMessages: (nextMessages = []) => {
    writeDashboardMessages(nextMessages);
  },
  getDashboardMentionIds: () => dashboardChatHydratedThreadIds,
  getDashboardAttachmentStorageRef,
  getPlatformAuthStore,
  getIsCurrentPlatformUserAdmin,
  getPlatformUsers: () => getPlatformUsers(),
  getDashboardMessage: getDashboardMessageById,
  getDashboardMessageBySearch: () => null,
  getDashboardMessageByReply: () => null,
  getDashboardMentionTokenIds: () => [],
  getDashboardMentionUserIds: () => [],
  getDashboardMessageIdentity: () => [],
  getDashboardMessageReadReceipts: () => [],
  getDashboardMessageById,
  getDashboardMentionedThreads: () => [],
  getDashboardMentionUsers: () => [],
  getDashboardMessageCreatedAtMs,
  getDashboardMentionUserIdsForText: () => [],
  getDashboardAttachmentDraft: () => dashboardChatComposerAttachmentDraft,
  getDashboardChatComposerAttachmentDraft: () => dashboardChatComposerAttachmentDraft,
  getDashboardChatThreadSummary: () => dashboardChatApiThreads,
  getDashboardChatMessageSearchActiveIndex: () => dashboardChatMessageSearchActiveIndex,
  getDashboardChatAttachmentRenderer: () => dashboardChatAttachmentRenderer,
  syncDashboardChatWidgetNotificationCursor,
  renderDashboardChatWidget,
  platformNavigationController,
  normalizeDashboardApiThread,
  mergeDashboardChatApiMessages: (...args) => mergeDashboardChatApiMessages(...args),
  normalizeDashboardApiMessage,
  logDashboardChatApiFailure,
  dashboardChatSubmittedComposerDrafts,
  getDashboardChatPriority: () => dashboardChatPriorityDraft,
  dashboardChatReactionOptions,
  dashboardChatRuntimeMessages,
  getDashboardMessageSearchQuery: () => dashboardChatMessageSearchQuery,
});

const {
  updateDashboardChatApiThreads,
  applyDashboardChatApiPayload,
  refreshDashboardChatThreadSummariesFromApi,
  queueDashboardChatThreadSummaryRefresh,
  queueDashboardChatCurrentViewRefresh,
  refreshDashboardChatFromApi,
  queueDashboardChatApiRefresh,
  loadOlderDashboardChatMessagesWithApi,
  isDashboardChatPageScrollActive,
  setDashboardChatPageScroll,
  loadDashboardChatModerationFromApi,
  handleDashboardChatRealtimeMessageChange,
  handleDashboardChatRealtimeRelatedChange,
  handleDashboardChatRealtimeStatus,
  setupDashboardChatRealtime,
  getThreadSummarySyncTimer,
  getThreadSummaryLastRequestedAt,
} = dashboardChatApiRuntime;
Object.assign(dashboardChatApiRuntimeBindings, dashboardChatApiRuntime);

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
  readMessages: () => readDashboardMessages(),
  renderWidget: renderDashboardChatWidget,
  sendApiAction: sendDashboardChatApiAction,
  settingsStore: dashboardChatThreadSettings,
  showToast: showDashboardChatWidgetToast,
  archiveThreadLocal: (threadId) => {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    dashboardChatLocallyHiddenThreadIds.add(normalizedThreadId);
    dashboardChatApiThreads = dashboardChatApiThreads.filter((thread) => thread.threadId !== normalizedThreadId);
    clearDashboardMessagesForThread(normalizedThreadId, { skipCentralSync: true });
    dashboardChatThreadSettings.remove(normalizedThreadId);
    writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: dashboardChatTeamThreadId });
    dashboardChatDetailsOpen = false;
  },
  updateMessageLocalStatus: updateDashboardMessageLocalStatus,
});
function setDashboardChatThreadSettingsWithApi(threadId = dashboardChatTeamThreadId, patch = {}) {
  return dashboardChatApiUiActions.setThreadSettingsWithApi(threadId, patch);
}
const dashboardChatMessageRuntime = createDashboardChatMessageRuntime({
  dashboardChatTeamThreadId,
  dashboardChatStorageKey,
  dashboardChatDeletedMessageIdsStorageKey,
  readMessagesFromStorage: false,
  persistMessagesToStorage: false,
  respectDeletedMessageIdsFromStorage: false,
  persistDeletedMessageIdsToStorage: false,
  normalizeDashboardChatThreadId,
  normalizeDashboardMessage,
  normalizeDashboardApiMessage,
  getDashboardMessageIdentityKeys,
  getDashboardMessageCreatedAtMs,
  compareDashboardChatMessages,
  readDashboardJson,
  writeDashboardJson,
  getDashboardChatRuntimeMessages: () => dashboardChatRuntimeMessages,
  setDashboardChatRuntimeMessages: (nextMessages) => {
    dashboardChatRuntimeMessages = nextMessages;
  },
  centralStateWriteSuppressionKeys,
  renderDashboardChatWidget,
});
const {
  isDashboardMessageRememberedDeleted,
  purgeDashboardDeletedMessagesFromStorage,
  readDashboardDeletedMessageIds,
  readDashboardMessages: runtimeReadDashboardMessages = () => [],
  rememberDashboardDeletedMessageId,
  writeDashboardMessages,
  mergeDashboardChatApiMessages: runtimeMergeDashboardChatApiMessages = () => [],
} = dashboardChatMessageRuntime;
mergeDashboardChatApiMessages = runtimeMergeDashboardChatApiMessages;
readDashboardMessages = runtimeReadDashboardMessages;
const dashboardChatMessageActionsRuntime = createDashboardChatMessageActionsRuntime({
  dashboardChatTeamThreadId,
  dashboardChatMaxMessageLength,
  applyDashboardChatApiPayload,
  canFallbackDashboardChatApiResult,
  canPinDashboardChatMessage,
  createDashboardId,
  getCurrentPlatformUser,
  getDashboardChatApiUiActions: () => dashboardChatApiUiActions,
  getDashboardChatThreadLabel,
  getDashboardChatThreadTypeForApi,
  getDashboardChatParticipantIdsForApi,
  getDashboardMentionUserIds,
  getPlatformUsers,
  getDashboardChatThreads: () => dashboardChatApiThreads,
  setDashboardChatThreads: (nextThreads) => {
    dashboardChatApiThreads = Array.isArray(nextThreads) ? nextThreads : [];
  },
  getDashboardComposerAttachmentDraft: getDashboardChatComposerAttachmentDraft,
  getDashboardChatReplyDraft: () => dashboardChatReplyDraft,
  getDashboardChatPriorityDraft: () => dashboardChatPriorityDraft,
  logDashboardChatApiFailure,
  normalizeDashboardApiMessage,
  normalizeDashboardChatThreadId,
  normalizeDashboardMessage,
  normalizeDashboardReactions,
  getDashboardChatReactionOptions: () => dashboardChatReactionOptions,
  queueDashboardChatThreadSummaryRefresh,
  readDashboardMessages,
  rememberDashboardDeletedMessageId,
  renderDashboardChatWidget,
  sendDashboardChatApiAction,
  setDashboardChatReplyDraft: (nextDraft) => {
    dashboardChatReplyDraft = nextDraft;
  },
  setDashboardChatPriorityDraft: (nextPriority) => {
    dashboardChatPriorityDraft = normalizeDashboardChatPriority(nextPriority);
  },
  setDashboardChatConfirmAction: (nextAction) => {
    dashboardChatConfirmAction = nextAction;
  },
  setDashboardChatComposerAttachmentDraft,
  showDashboardChatWidgetToast,
  writeDashboardMessages,
});
const dashboardChatPresenceRuntime = createDashboardChatPresenceRuntime({
  dashboardPresenceHeartbeatMs,
  dashboardPresencePollMs,
  dashboardPresenceSteadyPushMinMs,
  dashboardPresenceTypingPushMinMs,
  dashboardPresenceTypingSendThrottleMs,
  dashboardPresenceTypingTtlMs,
  dashboardPresencePollMinMs,
  dashboardPresenceIdleMs,
  dashboardPresenceOnlineTtlMs,
  dashboardPresenceAwayTtlMs,
  dashboardChatTeamThreadId,
  normalizeDashboardChatThreadId,
  getCurrentPlatformUser,
  getPlatformAuthStore,
  getPlatformUsers,
  getHubState: () => hubState,
  readDashboardMessages,
  writeDashboardJson,
  escapeHtml,
  formatUserName,
  renderUserAvatar,
  win,
  renderDashboardChatWidget,
});
const dashboardChatThreadRuntime = createDashboardChatThreadRuntime({
  dashboardChatAdvancedThreadTemplates,
  dashboardChatTeamThreadId,
  dashboardChatThreadSettings,
  dashboardNotificationSeenStorageKey,
  createDashboardChatThreadId,
  formatDashboardChatThreadLabel,
  getCurrentPlatformUser,
  getDashboardChatCurrentViewState: () => readDashboardChatWidgetState(),
  getDashboardChatApiThreads: () => dashboardChatApiThreads,
  isDashboardChatThreadLocallyHidden: (threadId) =>
    dashboardChatLocallyHiddenThreadIds.has(normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId)),
  getDashboardChatThreadParticipants,
  getDashboardChatTeamChatTitle,
  getPlatformUsers,
  isGenericDashboardChatThreadTitle,
  isSameDashboardUser,
  normalizeDashboardChatThreadId,
  normalizeDashboardApiMessage,
  readDashboardMessages,
  readDashboardTasks,
  readDashboardJson,
  writeDashboardJson,
  formatUserName,
});
Object.assign(dashboardChatThreadRuntimeBindings, dashboardChatThreadRuntime);
const dashboardChatMessageRenderRuntime = createDashboardChatMessageRenderRuntime({
  dashboardChatTeamThreadId,
  dashboardChatPinnedLimit,
  canPinDashboardChatMessage,
  escapeHtml,
  formatDashboardMessageText: runtimeRenderDashboardMessageText,
  dashboardChatReactionOptions,
  getCurrentPlatformUser,
  getDashboardMessageAuthorName: (...args) => getDashboardMessageAuthorName(...args),
  formatUserName,
  normalizeDashboardChatThreadId,
  normalizeDashboardReactions,
  readDashboardMessages,
});
Object.assign(dashboardChatMessageRenderRuntimeBindings, dashboardChatMessageRenderRuntime);
const dashboardChatComposerRuntime = createDashboardChatComposerRuntime({
  applyDashboardChatApiPayload,
  createDashboardId,
  dashboardChatAdvancedThreadTemplates,
  dashboardChatGroupNameMinLength,
  dashboardChatTeamThreadId,
  dashboardChatThreadSettings,
  formatUserName,
  getCurrentPlatformUser,
  getDashboardChatActiveToastThreadId,
  getDashboardChatComposerAttachmentDraft,
  getDashboardChatParticipantIdsForApi,
  getDashboardChatThreadLabel,
  getDashboardChatThreadTypeForApi,
  getDashboardChatApiAccessToken,
  getDashboardSupabaseClient,
  logDashboardChatApiFailure,
  normalizeDashboardChatGroupAvatarInput,
  normalizeDashboardChatGroupNameInput,
  normalizeDashboardChatThreadId,
  refreshDashboardChatFromApi,
  queueDashboardChatThreadSummaryRefresh,
  readDashboardChatWidgetState,
  renderDashboardChatWidget,
  sendDashboardChatApiAction,
setDashboardChatComposerAttachmentDraft,
setDashboardChatGroupCreatorOpen,
setDashboardChatMessageSearchQuery,
showDashboardChatWidgetToast,
syncDashboardChatDirectCreateForm,
syncDashboardChatGroupCreateForm,
writeDashboardChatWidgetState,
focusDashboardChatWidgetComposer,
  uploadDashboardChatAttachmentFileWithClient,
});

const {
  setDashboardChatAttachmentDraft,
  uploadDashboardChatAttachmentFile,
createDashboardChatAttachmentIntent,
createDashboardAdvancedChatThread,
handleDashboardChatAttachmentInputChange,
setDashboardChatGroupCreateError,
createDashboardDirectThreadFromForm,
createDashboardCustomGroupThreadFromForm,
} = dashboardChatComposerRuntime;
const {
  commitDashboardChatApiAction: commitDashboardChatApiActionFromRuntime,
  createDashboardMessage: createDashboardMessageFromRuntime,
  createDashboardMessageWithApi: createDashboardMessageWithApiFromRuntime,
  removeDashboardMessage,
  removeDashboardMessageWithApi: removeDashboardMessageWithApiFromRuntime,
  deleteDashboardMessageForMeWithApi: deleteDashboardMessageForMeWithApiFromRuntime,
  editDashboardMessageWithApi: editDashboardMessageWithApiFromRuntime,
  forwardDashboardMessageWithApi: forwardDashboardMessageWithApiFromRuntime,
  retryDashboardMessageWithApi: retryDashboardMessageWithApiFromRuntime,
  markDashboardChatApiThreadRead: markDashboardChatApiThreadReadFromRuntime,
  queueDashboardChatReadReceiptApi: queueDashboardChatReadReceiptApiFromRuntime,
  markDashboardMessagesReadForCurrentUser: markDashboardMessagesReadForCurrentUserFromRuntime,
  toggleDashboardMessagePin: toggleDashboardMessagePinFromRuntime,
  toggleDashboardMessagePinWithApi: toggleDashboardMessagePinWithApiFromRuntime,
  toggleDashboardMessageReaction: toggleDashboardMessageReactionFromRuntime,
  toggleDashboardMessageReactionWithApi: toggleDashboardMessageReactionWithApiFromRuntime,
  clearDashboardMessages,
  clearDashboardMessagesForThread: clearDashboardMessagesForThreadFromRuntime,
  clearDashboardMessagesForThreadWithApi: clearDashboardMessagesForThreadWithApiFromRuntime,
  setDashboardChatReplyDraft: setDashboardChatReplyDraftFromRuntime,
  setDashboardChatPriorityDraft: setDashboardChatPriorityDraftFromRuntime,
  setDashboardChatConfirmAction: setDashboardChatConfirmActionFromRuntime,
  updateDashboardMessageLocalStatus: runtimeUpdateDashboardMessageLocalStatus = () => {},
} = dashboardChatMessageActionsRuntime;
updateDashboardMessageLocalStatus = runtimeUpdateDashboardMessageLocalStatus;

function clearDashboardMessagesForThread(threadId, options = {}) {
  return dashboardChatMessageActionsRuntime?.clearDashboardMessagesForThread?.(threadId, options);
}

function clearDashboardMessagesForThreadWithApi(threadId) {
  return dashboardChatMessageActionsRuntime?.clearDashboardMessagesForThreadWithApi?.(threadId) || Promise.resolve(false);
}

function commitDashboardChatApiAction(payload, localCommit) {
  return (
    dashboardChatMessageActionsRuntime?.commitDashboardChatApiAction?.(payload, localCommit) ||
    Promise.resolve(null)
  );
}

function createDashboardMessageWithApi(text, threadId = dashboardChatTeamThreadId) {
  return dashboardChatMessageActionsRuntime?.createDashboardMessageWithApi?.(text, threadId);
}

function createDashboardMessage(text, threadId = dashboardChatTeamThreadId, options = {}) {
  return dashboardChatMessageActionsRuntime?.createDashboardMessage?.(text, threadId, options);
}

function markDashboardChatApiThreadRead(threadId) {
  return dashboardChatMessageActionsRuntime?.markDashboardChatApiThreadRead?.(threadId);
}

function queueDashboardChatReadReceiptApi(threadId, messages = readDashboardMessages()) {
  return dashboardChatMessageActionsRuntime?.queueDashboardChatReadReceiptApi?.(threadId, messages);
}

function markDashboardMessagesReadForCurrentUser(messages = readDashboardMessages(), threadId = null) {
  return dashboardChatMessageActionsRuntime?.markDashboardMessagesReadForCurrentUser?.(messages, threadId) || messages;
}

function removeDashboardMessageWithApi(messageId) {
  return dashboardChatMessageActionsRuntime?.removeDashboardMessageWithApi?.(messageId) || Promise.resolve(null);
}

function deleteDashboardMessageForMeWithApi(messageId) {
  return dashboardChatMessageActionsRuntime?.deleteDashboardMessageForMeWithApi?.(messageId) || Promise.resolve(false);
}

function editDashboardMessageWithApi(messageId, nextText) {
  return dashboardChatMessageActionsRuntime?.editDashboardMessageWithApi?.(messageId, nextText) || Promise.resolve(false);
}

function forwardDashboardMessageWithApi(messageId, targetThreadId) {
  return dashboardChatMessageActionsRuntime?.forwardDashboardMessageWithApi?.(messageId, targetThreadId) || Promise.resolve(false);
}

function toggleDashboardMessagePin(messageId, options = {}) {
  return dashboardChatMessageActionsRuntime?.toggleDashboardMessagePin?.(messageId, options) || false;
}

function toggleDashboardMessageReaction(messageId, reactionKey, options = {}) {
  return (
    dashboardChatMessageActionsRuntime?.toggleDashboardMessageReaction?.(messageId, reactionKey, options) || false
  );
}

function toggleDashboardMessageReactionWithApi(messageId, reactionKey) {
  return dashboardChatMessageActionsRuntime?.toggleDashboardMessageReactionWithApi?.(messageId, reactionKey) || Promise.resolve(false);
}

function setDashboardChatPriorityDraft(priority) {
  return dashboardChatMessageActionsRuntime?.setDashboardChatPriorityDraft?.(priority);
}

function setDashboardChatReplyDraft(messageId, threadId) {
  return setDashboardChatReplyDraftFromRuntime(
    messageId
      ? {
          messageId: String(messageId || "").trim(),
          threadId: normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId),
        }
      : null
  );
}

function setDashboardChatConfirmAction(action = null) {
  return dashboardChatMessageActionsRuntime?.setDashboardChatConfirmAction?.(action);
}

function retryDashboardMessageWithApi(messageId) {
  return (
    dashboardChatMessageActionsRuntime?.retryDashboardMessageWithApi?.(messageId) || Promise.resolve(false)
  );
}

function resetDashboardChatLocalCacheIfNeeded() {
try {
if (localStorage.getItem(dashboardChatLocalCacheResetStorageKey) === dashboardChatLocalCacheResetVersion) {
return;
}
// Compatibility marker only. Never clear football-dashboard-chat-v1 here;
// legacy chat cache may contain protected user history during database migration.
localStorage.setItem(dashboardChatLocalCacheResetStorageKey, dashboardChatLocalCacheResetVersion);
} catch {
}
}
function getDashboardPresenceSummary(users = []) {
  return dashboardChatPresenceRuntime.getDashboardPresenceSummary(users);
}
function getDashboardPresenceStatus(userId) {
  return dashboardChatPresenceRuntime.getDashboardPresenceStatus(userId);
}
function getDashboardPresenceLabel(status) {
  return dashboardChatPresenceRuntime.getDashboardPresenceLabel(status);
}
function renderDashboardPresenceDot(user, options) {
  return dashboardChatPresenceRuntime.renderDashboardPresenceDot(user, options);
}
function renderDashboardPresenceAvatar(user, className) {
  return dashboardChatPresenceRuntime.renderDashboardPresenceAvatar(user, className);
}
function markDashboardPresenceActivity() {
  return dashboardChatPresenceRuntime.markDashboardPresenceActivity();
}
function pushDashboardPresence(statusOverride = "", options) {
  return dashboardChatPresenceRuntime.pushDashboardPresence(statusOverride, options);
}
function refreshDashboardPresence(options) {
  return dashboardChatPresenceRuntime.refreshDashboardPresence(options);
}
function startDashboardPresenceRuntime() {
  return dashboardChatPresenceRuntime.startDashboardPresenceRuntime();
}
function pauseDashboardPresenceRuntime(options) {
  return dashboardChatPresenceRuntime.pauseDashboardPresenceRuntime(options);
}
function stopDashboardPresenceRuntime() {
  return dashboardChatPresenceRuntime.stopDashboardPresenceRuntime();
}
function clearDashboardChatTyping() {
  return dashboardChatPresenceRuntime.clearDashboardChatTyping();
}
function queueDashboardChatTyping(threadId) {
  return dashboardChatPresenceRuntime.queueDashboardChatTyping(threadId);
}
function getDashboardTypingUsers(threadId, users, currentUser) {
  return dashboardChatPresenceRuntime.getDashboardTypingUsers(threadId, users, currentUser);
}
function renderDashboardTypingIndicator(threadId, users, currentUser) {
  return dashboardChatPresenceRuntime.renderDashboardTypingIndicator(threadId, users, currentUser);
}
function sendDashboardChatBrowserNotification(notification = {}) {
try {
if (!("Notification" in win) || win.Notification.permission !== "granted") {
return false;
}
if (document.visibilityState === "visible" && isDashboardChatThreadActivelyViewed(notification.threadId)) {
return false;
}
const title = String(notification.title || "Football Science chat").trim();
const body = String(notification.body || "").trim();
const browserNotification = new win.Notification(title, {
body,
tag: `footballscience-chat-${notification.threadId || notification.messageId || "message"}`,
renotify: false,
});
browserNotification.onclick = () => {
win.focus?.();
writeDashboardChatWidgetState({
...readDashboardChatWidgetState(),
isOpen: true,
selectedThreadId: normalizeDashboardChatThreadId(notification.threadId, dashboardChatTeamThreadId),
});
renderDashboardChatWidget();
};
return true;
} catch {
return false;
}
}

function applyDashboardChatDeepLinkFromUrl() {
try {
const params = new URLSearchParams(win.location.search || "");
const rawThreadId = params.get("chatThread") || params.get("threadId") || "";
const threadId = normalizeDashboardChatThreadId(rawThreadId, "");
if (!threadId) {
return false;
}
const workspaceId = getSafeWorkspaceId(params.get("workspace") || "home");
if (workspaceId) {
setActiveWorkspace(workspaceId);
}
writeDashboardChatWidgetState({
...readDashboardChatWidgetState(),
isOpen: true,
selectedThreadId: threadId,
});
dashboardChatMobileConversationOpen = true;
renderDashboardChatWidget();
scrollDashboardChatDeepLinkMessage(params.get("message"));
return true;
} catch {
return false;
}
}

function getDashboardChatSelectorValue(value = "") {
const normalizedValue = String(value || "");
return globalThis.CSS?.escape ? globalThis.CSS.escape(normalizedValue) : normalizedValue.replace(/["\\]/g, "\\$&");
}

function scrollDashboardChatDeepLinkMessage(messageId = "") {
const normalizedMessageId = String(messageId || "").trim();
if (!normalizedMessageId) {
return false;
}
let scrollTimer = 0;
const highlightMessage = () => {
const root = ui.dashboardChatWidgetRoot || document.getElementById("dashboardChatWidgetRoot");
const selector = `[data-dashboard-chat-message-id="${getDashboardChatSelectorValue(normalizedMessageId)}"]`;
const messageNode = root?.querySelector(selector);
if (!messageNode) {
return false;
}
root.querySelectorAll(".dashboard-chat-message.is-deep-link-target").forEach((node) => {
if (node !== messageNode) {
node.classList.remove("is-deep-link-target", "is-search-match", "is-active-search-match");
}
});
messageNode.classList.add("is-deep-link-target", "is-search-match", "is-active-search-match");
messageNode.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
win.clearTimeout(scrollTimer);
scrollTimer = win.setTimeout(() => {
messageNode.classList.remove("is-deep-link-target", "is-search-match", "is-active-search-match");
}, 4200);
return true;
};
if (highlightMessage()) {
return true;
}
[180, 600, 1400].forEach((delay) => {
win.setTimeout(highlightMessage, delay);
});
return false;
}
const {
  renderDashboardChatWidget: _renderDashboardChatWidget,
  syncDashboardChatWidgetNotificationCursor: _syncDashboardChatWidgetNotificationCursor,
  showDashboardChatWidgetToast: _showDashboardChatWidgetToast,
  hideDashboardChatWidgetToast: _hideDashboardChatWidgetToast,
  dismissDashboardChatWidgetToast: _dismissDashboardChatWidgetToast,
  focusDashboardChatWidgetComposer: _focusDashboardChatWidgetComposer,
  scrollDashboardChatFirstUnread: _scrollDashboardChatFirstUnread,
} = (dashboardChatWidgetRuntime = createDashboardChatWidgetRuntime({
  dashboardChatTeamThreadId,
  dashboardChatWidgetRenderer,
  dashboardChatAdvancedThreadTemplates,
  dashboardChatSubmittedComposerDrafts,
  getDashboardApiThreads: () => dashboardChatApiThreads,
  getDashboardApiPagination: () => dashboardChatApiPagination,
  getDashboardChatThreadSummarySyncTimer: () => getThreadSummarySyncTimer(),
  getDashboardChatThreadSummaryLastRequestedAt: () => getThreadSummaryLastRequestedAt(),
  queueDashboardChatThreadSummaryRefresh,
  queueDashboardChatApiRefresh,
  getDashboardHydratedThreadIds: () => dashboardChatHydratedThreadIds,
  getDashboardChatApiSyncTimer: () => dashboardChatApiSyncTimer,
  getDashboardChatThreadList,
  readDashboardMessages: () => readDashboardMessages(),
  isDashboardChatThreadActivelyViewed,
  markDashboardMessagesReadForCurrentUser: markDashboardMessagesReadForCurrentUserFromRuntime,
  getDashboardChatUnreadCountForCurrentUser,
  isDashboardChatPageScrollActive,
  setDashboardChatPageScroll,
  dashboardChatAttachmentRenderer,
  readDashboardChatWidgetNotificationState,
  readDashboardChatWidgetState,
  writeDashboardChatWidgetState,
  readDashboardChatWidgetNotificationCursor,
  writeDashboardChatWidgetNotificationCursor,
  getDashboardChatThreadSettings: () => dashboardChatThreadSettings,
  getCurrentPlatformUser,
  getPlatformUsers: () => getPlatformUsers(),
  getDashboardChatTeamChatTitle,
  getDashboardChatReplyDraft: () => dashboardChatReplyDraft,
  setDashboardChatReplyDraft: setDashboardChatReplyDraftFromRuntime,
  getDashboardChatPriorityDraft: () => dashboardChatPriorityDraft,
  getDashboardChatConfirmAction: () => dashboardChatConfirmAction,
  getDashboardChatMessageSearchQuery: () => dashboardChatMessageSearchQuery,
  getDashboardChatMessageSearchActiveIndex: () => dashboardChatMessageSearchActiveIndex,
  getDashboardChatModerationOpen: () => dashboardChatModerationOpen,
  getDashboardChatDetailsOpen: () => dashboardChatDetailsOpen,
  getDashboardChatMobileConversationOpen: () => dashboardChatMobileConversationOpen,
  getDashboardChatComposerAttachmentDraft: () => dashboardChatComposerAttachmentDraft,
  getDashboardChatGroupCreatorOpen: () => dashboardChatGroupCreatorOpen,
  getDashboardChatCreatorMode: () => dashboardChatCreatorMode,
  getDashboardChatThreadFilter: () => dashboardChatThreadFilter,
  getDashboardChatThreadSettingsDialog: () => dashboardChatThreadSettingsDialog,
  getDashboardChatPushDiagnosticsState: () => dashboardChatPushDiagnosticsState,
  getDashboardChatApiStatus: () => dashboardChatApiStatus,
  moderationState: dashboardChatModerationState,
  normalizeDashboardChatThreadId,
  normalizeDashboardApiMessage,
  getDashboardMessageCreatedAtMs,
  formatDashboardChatThreadLabel,
  markDashboardChatWidgetNotificationSeenForThread,
  formatUserName,
  sendBrowserNotification: sendDashboardChatBrowserNotification,
  platformNavigationController,
  ui,
  win,
  documentRef: document,
  ensureDashboardChatStylesheet,
  resetDashboardChatLocalCacheIfNeeded,
  getRealtimeStatus: () => dashboardChatApiRealtimeStatus,
}));
dashboardChatWidgetRuntimeFunctions = {
  renderDashboardChatWidget: _renderDashboardChatWidget || (() => {}),
  syncDashboardChatWidgetNotificationCursor: _syncDashboardChatWidgetNotificationCursor || (() => {}),
  showDashboardChatWidgetToast: _showDashboardChatWidgetToast || (() => {}),
  hideDashboardChatWidgetToast: _hideDashboardChatWidgetToast || (() => {}),
  dismissDashboardChatWidgetToast: _dismissDashboardChatWidgetToast || (() => {}),
  focusDashboardChatWidgetComposer: _focusDashboardChatWidgetComposer || (() => {}),
  scrollDashboardChatFirstUnread: _scrollDashboardChatFirstUnread || (() => false),
  requestDashboardChatScrollToLatest: dashboardChatWidgetRuntime.requestDashboardChatScrollToLatest || (() => {}),
  scrollDashboardChatActiveThreadToLatest: dashboardChatWidgetRuntime.scrollDashboardChatActiveThreadToLatest || (() => false),
};
const workspaceRuntimeComposition = createWorkspaceRuntimeComposition({
applyUserAvatar,
buildPlayerProfileImportFeedbackMessage,
buildPlayerProfileImportPlan,
buildPlayerProfileImportPreviewMessage,
buildSquadDataFoundationPayload,
buildSquadDataQualityReport,
buildSquadSessionPlannerContracts,
canCurrentUserEditWorkspace,
canEditPeriodizationWorkspace,
canEditSessionPlanner,
canViewPrivateMedicalDetails,
canWriteCentralBackedCache,
clamp,
cloneMedicalState,
commitMedicalClinicalState,
compareMedicalPlayers,
comparePlayerProfiles,
configurePlayerProfileRuntimeAccessors,
createDashboardId,
createSessionPlannerBlock,
createSessionPlannerEmptySession,
createSessionPlannerPlayerProfileContract,
dataSafetySnapshotStoreName,
defaultHubState,
defaultMedicalPlayers,
documentRef: document,
ensureMedicalState,
ensurePeriodizationState,
ensurePlayerProfilesState,
escapeHtml,
exerciseLibraryReviewHelpers,
exerciseLibraryRuntimeFacade,
fetchRef: (...args) => fetch(...args),
formatMedicalDateLabel,
formatPlayerProfileChangeValue,
formatScheduleDateValue,
formatSessionPlannerHistoryTimeFromModule,
formatSessionPlannerMultiValue,
formatUserName,
getAccessibleWorkspacePool,
getActiveMedicalInjuryPlan,
getActiveMedicalPlayers,
getAssignableRolesForUser,
getCentralStateBridge,
getCurrentMedicalActorId,
getCurrentPlatformUser,
getDashboardDateLabel,
getDashboardSessionTotalMinutes,
getDefaultPlayerProfileRole,
getElement,
getHubState: () => hubState,
getLatestMedicalRecord,
getMedicalPlayerAvailabilityStatusForDate,
getMedicalRecommendationActivityContext,
getMedicalRecordStatus,
getMedicalRtpPhaseOption,
getMedicalState: () => medicalState,
getPeriodizationCustomFieldValue,
getPeriodizationDay,
getPeriodizationMatchDayLabel,
getPeriodizationMultiFieldValue,
getPeriodizationMultiSelectOpenField,
getPeriodizationOverlayState,
getPeriodizationState: () => periodizationState,
getPlatformApiAccessToken,
getPlatformAuthStore,
getPlatformStructureState,
getPlatformTeamDisplayName,
getPlatformTeamDisplayTeam,
getPlatformUsers,
getPlayerProfileAgeCacheKey,
getPlayerProfileAgeLookupSignature,
getPlayerProfileBirthDateValue,
getPlayerProfileChangeDiffs,
getPlayerProfileFormValues,
getPlayerProfileImportUndoRelativeTimeLabel,
getPlayerProfileModalOpen: () => playerProfileModalOpen,
getPlayerProfileNewPlayerModalOpen: () => playerProfileNewPlayerModalOpen,
getPlayerProfileRoleFitScore,
getPlayerProfileRoleGroupForRole,
getPlayerProfileRosterTypeOption,
getPlayerProfileSyncIdentityKeys,
getPlayerProfilesRoleGroupFilter: () => playerProfilesRoleGroupFilter,
getPlayerProfilesRosterFilter: () => playerProfilesRosterFilter,
getPlayerProfilesRosterSummary,
getPlayerProfilesSearchQuery: () => playerProfilesSearchQuery,
getPlayerProfilesState: () => playerProfilesState,
getPlayerRoleDnaDefinition,
getSafeWorkspaceId,
getScheduleSessionEventForDate,
getScheduledSessionTitleForDate,
getTeamTrainingDateValues: () => {
if (!scheduleState) {
scheduleState = readScheduleState();
}
return Array.from(
new Set((scheduleState?.events || []).filter((event) => event?.date && isScheduleSessionEvent(event)).map((event) => event.date))
).sort((first, second) => first.localeCompare(second));
},
getScopedPlatformUsers,
getSelectedStaffUserId: () => selectedStaffUserId,
getStaffCreateUserDraft: () => staffCreateUserDraft,
getSessionPlannerHistoryActionLabelFromModule,
getSessionPlannerHistoryActorLabelFromModule,
getSessionPlannerPlayerProfileContract,
getSessionPlannerPlayerProfileContracts,
getSessionPlannerState: () => sessionPlannerState,
refreshScheduleStateForPeriodization: () => {
scheduleState = readScheduleState();
},
getSquadChangeSummary,
getStaffCreateUserEditorOpen: () => staffCreateUserEditorOpen,
getTemporaryRosterTypeFromPlayerSource,
getUserProfileImageUrl,
getUserTeamId,
getWorkspaceById,
getWorkspaceIdFromUrl,
getWorkspaceViewId,
hasPendingCentralStateWrites,
hydrateWorkspaceModuleState,
isCurrentPlatformUserAdmin,
isDateValueInYear: (dateValue) => isDateValueInYear(dateValue, periodizationYear),
isEditableKeyboardTarget,
isMedicalItemArchived,
isMedicalPlayerBlockedBySquadAvailability,
isPeriodizationMultiField: (fieldKey) => periodizationMultiFields.has(fieldKey),
isTemporaryPlayerProfile,
jumpPeriodizationToToday,
logEvent,
markDashboardHomeSeenForCurrentUser,
medicalAvailabilitySelectors,
normalizeMedicalInjuryPlan,
normalizeMedicalPlayer,
normalizeMedicalRecord,
normalizePlayerProfile,
normalizePlayerProfileAgeCacheEntry,
normalizePlayerProfileAgeValue,
normalizePlayerProfileBirthDate,
normalizePlayerProfileChangeLog,
normalizePlayerProfileChangeLogEntry,
normalizePlayerProfileName,
normalizePlayerProfileRemovedIds,
normalizePlayerProfileRole,
normalizePlayerProfileRosterType,
normalizeSessionPlannerBlockFieldMeta,
onLeavePlayerProfiles: () => {
playerProfileModalOpen = false;
playerProfileNewPlayerModalOpen = false;
},
openDataSafetyDatabase,
parseScheduleDateValue,
parseSessionPlannerTimestampMs,
pauseSimulatorForWorkspaceSwitch,
periodizationRenderer,
playerProfileAgeCacheStorageKey,
playerProfileCountsInSquad,
playerProfileImportUndoHistoryLimit,
playerProfileRoleGroupOptions,
playerProfileRoleOptions,
playerProfileRosterFilterOptions,
playerProfileRosterTypeCountsInSquad,
playerProfileRosterTypeOptions,
playerProfileRosterUiSelectors,
playerProfileSquadStatusOptions,
playerProfilesDefaultRosterVersion,
playerProfilesSchemaVersion,
playerProfilesStorageKey,
platformNavigationController,
profileWorkspaceRenderer,
queueCentralStateStatus,
queueCentralStateWrite,
queueCriticalWorkspacePreloads,
queueDashboardChatStylesheetLoad,
queueSessionPlannerSnapshotRecovery,
queueWorkspaceModulePreload,
rawDataSafetyGetItem,
rawDataSafetySetItem,
readDashboardTasks,
readMedicalState,
readPeriodizationState,
readPlayerProfilesState,
readRememberedWorkspaceId,
readScheduleState,
readScoutingState,
readSessionPlannerExerciseLibrary,
readSessionPlannerState,
readSessionPlannerStatePreservingUiSelection,
readTransferRoomState,
readWorkspaceHubState,
recordDataSafetyWrite,
renderAdminRoleOptions,
renderAdminTeamOptions,
renderAdminWorkspace,
renderAnalysisRoomWorkspace,
renderDashboardCards,
renderDashboardChatWidget,
renderGameplanWorkspace,
renderIdpWorkspace,
renderMedicalTeamWorkspace,
renderPeriodizationWorkspace,
renderPlayerProfilesWorkspace,
renderPlayerProfilesWorkspaceMessage,
renderPlatformTeamLogoMark,
renderScheduleWorkspace,
renderScoutingWorkspace,
renderSessionPlannerToast,
renderSessionPlannerWorkspace,
renderTransferRoomWorkspace,
renderWorkspaceChrome,
rememberActiveWorkspaceId,
repairWorkspaceState,
resetGameSimulatorIntro,
retryCentral,
scheduleDashboardLoginPopups,
selectPeriodizationDate,
sessionPlannerAutosaveBoundary,
sessionPlannerBlockDeletionTombstoneKey,
sessionPlannerBlockFieldUpdatedAtKey,
sessionPlannerBlockHelpers,
sessionPlannerBlockMergeFieldSet,
sessionPlannerBlockMergeFields,
sessionPlannerBlockReductionGuardKey,
sessionPlannerBlockReductionGuardMaxAgeMs,
sessionPlannerLocalUiState,
sessionPlannerMultiSelectFields,
sessionPlannerPlayerBoardAutoModeOptions,
sessionPlannerPlayerBoardColorOptions,
sessionPlannerPlayerBoardMaxTeamCount,
sessionPlannerPrintPaperOptions,
sessionPlannerPrintSectionOptions,
sessionPlannerRuntimeDelegates,
sessionPlannerRuntimeRenderers,
sessionPlannerSessionFactory,
sessionPlannerStorageKey,
setPiecesRoomStorageKey,
canDeleteSetPiecesRoom: () => ["admin", "club-admin", "team-admin", "coach"].includes(normalizePlatformRole(getCurrentPlatformUser()?.role)),
addSetPieceVariantToTeamMeeting: (reference) => presentationModeController?.addSetPieceVariantToTeamMeeting({
...reference,
dateValue: reference?.scheduledFor || dashboardHomeContextSelectors.getTodayValue(),
}),
getSetPieceReferenceUsage: (reference) => presentationModeController?.getSetPieceReferenceUsage(reference) || { count: 0, dates: [], slideIds: [] },
sessionPlannerTacticalHelpers,
sessionPlannerTacticalMaxFrames,
sessionPlannerTacticalSnapStep,
setHubState: (nextState) => { hubState = nextState; },
setMedicalState: (nextState) => { medicalState = nextState; },
setPeriodizationMonth,
setPeriodizationMultiSelectOpenField,
setPeriodizationOverlayMode,
setPeriodizationOverlayState,
setPeriodizationSelection,
setPeriodizationState: (nextState) => { periodizationState = nextState; },
setPlatformAutosaveStatusForKey,
setPlayerProfileModalOpen: (nextOpen) => { playerProfileModalOpen = Boolean(nextOpen); },
setPlayerProfileNewPlayerModalOpen: (nextOpen) => { playerProfileNewPlayerModalOpen = Boolean(nextOpen); },
setPlayerProfilesState: (nextState) => { playerProfilesState = nextState; },
setScheduleState: (nextState) => { scheduleState = nextState; },
setScoutingState: (nextState) => { scoutingState = nextState; },
setSelectedStaffUserId: (userId) => { selectedStaffUserId = userId; },
setStaffCreateUserDraft: (draft) => { staffCreateUserDraft = draft && typeof draft === "object" ? { ...draft } : null; },
setSessionPlannerExerciseLibrary: (exercises) => { sessionPlannerExerciseLibrary = exercises; },
setSessionPlannerState: (nextState) => { sessionPlannerState = nextState; },
setStaffCreateUserEditorOpen: (isOpen) => { staffCreateUserEditorOpen = isOpen; },
setTransferRoomState: (nextState) => { transferRoomState = nextState; },
shiftPeriodizationMonth,
shouldClearSessionPlannerSessionForDate,
simulatorRender: render,
squadProfileSelectedRenderer,
squadProfileSupportRenderer,
squadRosterRenderer,
squadWorkspaceRenderer,
staffWorkspaceRenderer,
startPlatformThemeScheduler,
startSimulatorAnimationLoop,
stopSimulatorAnimationLoop,
syncAccountMenu,
syncDashboardChatWidgetNotificationCursor,
syncGameSimulatorIntroState,
syncGameSimulatorSavedSequencesFromStorage,
syncPlatformAutosaveStatusVisibility,
syncPlatformStructureWithUsers,
syncPlatformUserFromAuth,
syncSelectedSessionPlannerBlockFieldsFromDom,
ui,
upsertMedicalPlayers,
validatePlayerProfileFormValues,
win,
workspaceHubDefaultActiveWorkspaceId,
writeMedicalState,
writePeriodizationDay,
writePeriodizationState,
writeWorkspaceHubState,
});
const {
captureSessionPlannerBoardHistoryFromState,
centralAppStateReloadService: composedCentralAppStateReloadService,
periodizationRuntimeBindings,
periodizationWorkspaceController,
redoSessionPlannerBoardHistory,
refreshPeriodizationBoardDependentFields,
refreshPeriodizationBoardMultiFields,
refreshSessionPlannerMatchDayChip,
renderProfileWorkspace,
renderStaffWorkspace,
sessionPlannerPeriodizationBridge,
sessionPlannerRuntimeService,
sessionPlannerRuntimeStateService,
sessionPlannerStateMergeHelpers,
sessionPlannerToastController,
setPiecesRoomController,
sessionPlannerWorkspaceController: composedSessionPlannerWorkspaceController,
syncSessionPlannerBoardHistoryBaseline,
syncSessionPlannerBoardHistoryBaselines,
undoSessionPlannerBoardHistory,
workspaceShellController,
} = workspaceRuntimeComposition;
reloadSetPiecesRoomFromStorage = () => setPiecesRoomController.reloadFromStorage();
updateSetPiecesRoomSyncStatus = (status, message) => setPiecesRoomController.setSyncStatus(status, message);
centralAppStateReloadService = composedCentralAppStateReloadService;
sessionPlannerWorkspaceController = composedSessionPlannerWorkspaceController;
configureSessionPlannerAppRuntimeAccessors({
getSessionPlannerRuntimeStateService: () => sessionPlannerRuntimeStateService,
getSessionPlannerStateMergeHelpers: () => sessionPlannerStateMergeHelpers,
getSessionPlannerToastController: () => sessionPlannerToastController,
});
function canEditMedicalTeam() { return canCurrentUserEditWorkspace("medical-team"); }
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
applyDashboardChatDeepLinkFromUrl();
ui.workspaceSearch?.addEventListener("input", () => {
renderWorkspaceChrome();
});
ui.platformThemeModeSelect?.addEventListener("change", () => {
setPlatformThemeMode(ui.platformThemeModeSelect?.value);
});
document.addEventListener("keydown", (event) => {
if (event.key === "Escape") {
if (dashboardChatThreadSettingsDialog) {
closeDashboardChatThreadSettingsDialog();
return;
}
if (dashboardChatGroupCreatorOpen) {
closeDashboardChatGroupCreator();
return;
}
platformNavigationController.hideTopIconTooltip();
}
});
dashboardRuntimeController.bindInteractions();
function closeChatMenus(x = null) { ui.dashboardChatWidgetRoot?.querySelectorAll(".dashboard-chat-message-menu[open], .dashboard-chat-message-reaction-menu[open]").forEach((menu) => { if (menu !== x) menu.removeAttribute("open"); }); }
let dashboardChatPushActionInFlight = false;
let dashboardChatPushActionObserver = null;
function findDashboardChatActionTarget(event, selector) {
const path = typeof event.composedPath === "function" ? event.composedPath() : [];
for (const entry of path) {
if (entry?.matches?.(selector)) return entry;
const closestEntry = entry?.closest?.(selector);
if (closestEntry) return closestEntry;
}
const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
return target?.closest?.(selector) || null;
}
function isDashboardChatActionTarget(actionButton) {
if (!actionButton) return false;
const configuredRoot = ui.dashboardChatWidgetRoot || null;
const liveRoot = document.getElementById("dashboardChatWidgetRoot");
return Boolean(configuredRoot?.contains(actionButton) || liveRoot?.contains(actionButton));
}
async function handleDashboardChatReactionActionEvent(event) {
const reactionButton = findDashboardChatActionTarget(event, "[data-dashboard-message-reaction][data-dashboard-reaction-key]");
if (!isDashboardChatActionTarget(reactionButton)) {
return;
}
event.preventDefault();
event.stopPropagation();
event.stopImmediatePropagation?.();
closeChatMenus();
await toggleDashboardMessageReactionWithApi(
reactionButton.dataset.dashboardMessageReaction,
reactionButton.dataset.dashboardReactionKey
);
renderDashboardChatWidget();
}
async function runDashboardChatNotificationToggleAction() {
if (dashboardChatPushActionInFlight) return;
dashboardChatPushActionInFlight = true;
try {
const notifications = readDashboardChatWidgetNotificationState();
const nextLevel = notifications.level === "all" ? "mentions" : notifications.level === "mentions" ? "muted" : "all";
const pushResult = await dashboardChatPushClient.toggleFromNotificationLevel(nextLevel).catch((error) => ({
ok: false,
reason: error?.message || "Push notifications could not be updated.",
}));
let notificationMessage = nextLevel === "muted" ? "Chat notifications muted." : nextLevel === "mentions" ? "Only mentions will notify you." : "Chat notifications enabled.";
if (nextLevel !== "muted" && !pushResult?.ok) {
notificationMessage = pushResult?.reason || "Push notifications could not be updated.";
void refreshDashboardChatPushDiagnostics({ render: false, force: true });
renderDashboardChatWidget();
showDashboardChatWidgetToast(notificationMessage);
return;
}
writeDashboardChatWidgetNotificationState({ level: nextLevel });
void refreshDashboardChatPushDiagnostics({ render: false, force: true });
renderDashboardChatWidget();
showDashboardChatWidgetToast(notificationMessage);
} finally {
dashboardChatPushActionInFlight = false;
}
}
async function runDashboardChatPushTestAction() {
if (dashboardChatPushActionInFlight) return;
dashboardChatPushActionInFlight = true;
try {
const notifications = readDashboardChatWidgetNotificationState();
const level = notifications.level === "muted" ? "all" : notifications.level || "all";
showDashboardChatWidgetToast("Sending test push to this device...");
const testResult = await dashboardChatPushClient.sendTest(level).catch((error) => ({
ok: false,
reason: error?.message || "Push test failed.",
}));
let testPushMessage = testResult?.reason || "Push test could not be sent to this device.";
if (testResult?.ok && Number(testResult.sent || 0) > 0) {
writeDashboardChatWidgetNotificationState({ level });
testPushMessage = "Test push sent. If Football Science is in the background, it should appear as a system notification.";
}
void refreshDashboardChatPushDiagnostics({ render: false, force: true });
renderDashboardChatWidget();
showDashboardChatWidgetToast(testPushMessage);
} finally {
dashboardChatPushActionInFlight = false;
}
}
function handleDashboardChatPushActionEvent(event) {
const pushButton = findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-test-push]");
const notificationButton = findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-toggle-notifications]");
const statusButton = findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-refresh-push-status]");
const actionButton = pushButton || notificationButton || statusButton;
if (!isDashboardChatActionTarget(actionButton)) {
return;
}
event.preventDefault();
event.stopPropagation();
event.stopImmediatePropagation?.();
if (pushButton) {
void runDashboardChatPushTestAction();
} else if (statusButton) {
void refreshDashboardChatPushDiagnostics({ render: true, showToast: true, force: true });
} else {
void runDashboardChatNotificationToggleAction();
}
}
document.addEventListener("pointerdown", handleDashboardChatPushActionEvent, true);
document.addEventListener("click", handleDashboardChatPushActionEvent, true);
document.addEventListener("click", handleDashboardChatReactionActionEvent, true);
function bindDashboardChatPushActionButtons() {
const root = ui.dashboardChatWidgetRoot || document.getElementById("dashboardChatWidgetRoot");
if (!root) return;
root
.querySelectorAll("[data-dashboard-chat-widget-test-push], [data-dashboard-chat-widget-toggle-notifications], [data-dashboard-chat-widget-refresh-push-status]")
.forEach((button) => {
if (button.dataset.dashboardChatPushActionBound === "true") return;
button.dataset.dashboardChatPushActionBound = "true";
["pointerdown", "mousedown", "click", "touchstart"].forEach((type) => {
button.addEventListener(type, handleDashboardChatPushActionEvent, { capture: true, passive: false });
});
});
}
function startDashboardChatPushActionObserver() {
const root = ui.dashboardChatWidgetRoot || document.getElementById("dashboardChatWidgetRoot");
if (!root || dashboardChatPushActionObserver) return;
bindDashboardChatPushActionButtons();
dashboardChatPushActionObserver = new MutationObserver(() => bindDashboardChatPushActionButtons());
dashboardChatPushActionObserver.observe(root, { childList: true, subtree: true });
}
startDashboardChatPushActionObserver();
function focusDashboardChatWidgetLauncher() {
requestAnimationFrame(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-widget-toggle]")?.focus?.();
});
}
function focusDashboardChatCreateMenuTrigger() {
requestAnimationFrame(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-create-menu-trigger]")?.focus?.();
});
}
function closeDashboardChatGroupCreator({ focusCreateMenu = true, render = true } = {}) {
if (!dashboardChatGroupCreatorOpen) {
return false;
}
setDashboardChatGroupCreatorOpen(false, { render: false });
dashboardChatCreatorMode = "group";
if (render) {
  renderDashboardChatWidget();
}
if (focusCreateMenu) {
focusDashboardChatCreateMenuTrigger();
}
return true;
}
function closeDashboardChatThreadSettingsDialog({ render = true } = {}) {
if (!dashboardChatThreadSettingsDialog) {
return false;
}
dashboardChatThreadSettingsDialog = null;
if (render) {
renderDashboardChatWidget();
}
return true;
}
function closeDashboardChatWidgetPanel({ render = true } = {}) {
const currentState = readDashboardChatWidgetState();
if (!currentState.isOpen) {
return false;
}
closeChatMenus();
clearDashboardChatTyping();
setDashboardChatReplyDraft("", "");
setDashboardChatPriorityDraft("normal");
setDashboardChatConfirmAction(null);
dashboardChatDetailsOpen = false;
setDashboardChatGroupCreatorOpen(false, { render: false });
dashboardChatCreatorMode = "group";
dashboardChatThreadSettingsDialog = null;
dashboardChatMobileConversationOpen = true;
writeDashboardChatWidgetState({
...currentState,
isOpen: false,
});
if (render) {
renderDashboardChatWidget();
focusDashboardChatWidgetLauncher();
}
return true;
}
async function submitDashboardChatSettingsForm(settingsForm) {
if (!settingsForm) {
return false;
}
const formData = new FormData(settingsForm);
const threadId = normalizeDashboardChatThreadId(settingsForm.dataset.dashboardChatThread, dashboardChatTeamThreadId);
const type = String(settingsForm.dataset.dashboardChatSettingsType || "rename").trim();
const cleanValue = String(formData.get("value") || "").trim().replace(/\s+/g, " ");
const patch = type === "avatar"
? /^https?:\/\//i.test(cleanValue)
  ? { avatarUrl: cleanValue, avatarLabel: "" }
  : { avatarLabel: cleanValue.slice(0, 2).toUpperCase(), avatarUrl: "" }
: { customTitle: cleanValue };
dashboardChatThreadSettingsDialog = null;
await dashboardChatApiUiActions.setThreadSettingsWithApi(threadId, patch);
renderDashboardChatWidget();
return true;
}
async function submitDashboardChatParticipantsForm(participantsForm) {
if (!participantsForm) {
return false;
}
const threadId = normalizeDashboardChatThreadId(participantsForm.dataset.dashboardChatThread, dashboardChatTeamThreadId);
const participantIds = Array.from(participantsForm.querySelectorAll("input[name='participantIds']:checked"))
.map((input) => String(input.value || "").trim())
.filter(Boolean);
dashboardChatThreadSettingsDialog = null;
await dashboardChatApiUiActions.setThreadParticipantsWithApi(threadId, participantIds);
renderDashboardChatWidget();
return true;
}
dashboardChatLauncherRuntime = createDashboardChatLauncherRuntime({
  windowRef: win,
  documentRef: document,
  getRoot: () => ui.dashboardChatWidgetRoot,
  readState: readDashboardChatWidgetState,
  readPosition: () => readDashboardJson(dashboardChatLauncherPositionStorageKey, null),
  writePosition: (position) => writeDashboardJson(dashboardChatLauncherPositionStorageKey, {
    left: Math.round(position.left),
    top: Math.round(position.top),
  }),
});
  dashboardChatLauncherRuntime.start();
ui.dashboardChatWidgetRoot?.addEventListener("pointerdown", (event) => {
  if (!dashboardChatGroupCreatorOpen) {
    return;
  }
  dashboardChatGroupCreatorPointerDownInsideCard = Boolean(
    event.target.closest(".dashboard-chat-group-create-card, [data-dashboard-chat-group-create-form], [data-dashboard-chat-direct-create-form]")
  );
});
ui.dashboardChatWidgetRoot?.addEventListener("pointerup", () => {
  dashboardChatGroupCreatorPointerDownInsideCard = false;
});
ui.dashboardChatWidgetRoot?.addEventListener("pointercancel", () => {
  dashboardChatGroupCreatorPointerDownInsideCard = false;
});
function insertDashboardChatComposerEmoji(nextEmoji = "") {
  const emoji = String(nextEmoji || "").trim();
  if (!emoji) {
    return;
  }
  const input = ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-input]");
  if (!input) {
    return;
  }
  const maxLength = Number(input.getAttribute("maxlength") || dashboardChatMaxMessageLength || 0) || 0;
  const currentValue = String(input.value || "");
  const selectionStart = Number.isFinite(input.selectionStart) ? Number(input.selectionStart) : currentValue.length;
  const selectionEnd = Number.isFinite(input.selectionEnd) ? Number(input.selectionEnd) : selectionStart;
  const start = Math.min(Math.max(0, selectionStart), currentValue.length);
  const end = Math.min(Math.max(0, selectionEnd), currentValue.length);
  const safeStart = Math.min(start, end);
  const safeEnd = Math.max(start, end);
  const availableLength = Math.max(0, maxLength - (currentValue.length - (safeEnd - safeStart)));
  const emojiValue = maxLength > 0 && emoji.length > availableLength ? "" : emoji;
  if (!emojiValue) {
    return;
  }
  input.value = `${currentValue.slice(0, safeStart)}${emojiValue}${currentValue.slice(safeEnd)}`;
  const nextCursor = safeStart + emojiValue.length;
  input.setSelectionRange?.(nextCursor, nextCursor);
  const currentState = readDashboardChatWidgetState();
  const threadId = normalizeDashboardChatThreadId(currentState.selectedThreadId, dashboardChatTeamThreadId);
  if (input.value.trim()) {
    queueDashboardChatTyping(threadId);
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const currentEmojiMenu = input.closest("[data-dashboard-chat-form]")?.querySelector(".dashboard-chat-emoji-menu");
  if (currentEmojiMenu?.open) {
    currentEmojiMenu.open = false;
  }
  input.focus({ preventScroll: true });
}
ui.dashboardChatWidgetRoot?.addEventListener("click", async (event) => {
const activeMenu = findDashboardChatActionTarget(event, ".dashboard-chat-message-menu, .dashboard-chat-message-reaction-menu");
closeChatMenus(activeMenu);
const toastDismissButton = event.target.closest("[data-dashboard-chat-toast-dismiss]");
if (toastDismissButton && !toastDismissButton.hidden) {
event.preventDefault();
event.stopPropagation();
dismissDashboardChatWidgetToast();
return;
}
const toastOpenButton = event.target.closest("[data-dashboard-chat-toast-open]");
if (toastOpenButton && !toastOpenButton.hidden) {
const threadId = normalizeDashboardChatThreadId(
toastOpenButton.dataset.dashboardChatToastThread,
dashboardChatTeamThreadId
);
const toastMessageId = String(toastOpenButton.dataset.dashboardChatToastMessage || "").trim();
writeDashboardChatWidgetState({
isOpen: true,
selectedThreadId: threadId,
});
dashboardChatMobileConversationOpen = true;
requestDashboardChatScrollToLatest(threadId);
markDashboardChatWidgetNotificationSeenForThread(threadId);
hideDashboardChatWidgetToast();
renderDashboardChatWidget();
scrollDashboardChatActiveThreadToLatest(threadId);
if (toastMessageId) {
scrollDashboardChatDeepLinkMessage(toastMessageId);
}
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
const settingsSaveButton = event.target.closest("[data-dashboard-chat-settings-save]");
if (settingsSaveButton) {
event.preventDefault();
await submitDashboardChatSettingsForm(settingsSaveButton.closest("[data-dashboard-chat-settings-form]"));
return;
}
const participantsSaveButton = event.target.closest("[data-dashboard-chat-participants-save]");
if (participantsSaveButton) {
event.preventDefault();
await submitDashboardChatParticipantsForm(participantsSaveButton.closest("[data-dashboard-chat-participants-form]"));
return;
}
const settingsBackdrop = event.target.closest("[data-dashboard-chat-settings-backdrop]");
const settingsCloseButton = event.target.closest("[data-dashboard-chat-settings-close]");
if ((settingsBackdrop && event.target === settingsBackdrop) || settingsCloseButton) {
event.preventDefault();
closeDashboardChatThreadSettingsDialog();
return;
}
const mobileBackButton = event.target.closest("[data-dashboard-chat-mobile-back]");
if (mobileBackButton) {
dashboardChatMobileConversationOpen = false;
dashboardChatDetailsOpen = false;
renderDashboardChatWidget();
return;
}
const moreSettingButton = event.target.closest("[data-dashboard-chat-more-setting]");
if (moreSettingButton) {
const action = String(moreSettingButton.dataset.dashboardChatMoreSetting || "").trim();
const threadId = normalizeDashboardChatThreadId(moreSettingButton.dataset.dashboardChatMoreSettingThread || readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
moreSettingButton.closest("details")?.removeAttribute("open");
if (action === "rename" || action === "avatar") {
dashboardChatThreadSettingsDialog = { type: action, threadId };
renderDashboardChatWidget();
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-settings-input]")?.focus();
}, 0);
}
return;
}
const moreParticipantsButton = event.target.closest("[data-dashboard-chat-more-participants]");
if (moreParticipantsButton) {
const threadId = normalizeDashboardChatThreadId(moreParticipantsButton.dataset.dashboardChatMoreParticipants || readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
moreParticipantsButton.closest("details")?.removeAttribute("open");
dashboardChatThreadSettingsDialog = { type: "participants", threadId };
renderDashboardChatWidget();
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-participant-filter]")?.focus();
}, 0);
return;
}
const moreArchiveThreadButton = event.target.closest("[data-dashboard-chat-more-archive-thread]");
if (moreArchiveThreadButton) {
const threadId = normalizeDashboardChatThreadId(moreArchiveThreadButton.dataset.dashboardChatMoreArchiveThread, dashboardChatTeamThreadId);
moreArchiveThreadButton.closest("details")?.removeAttribute("open");
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
const threadSettingButton = event.target.closest("[data-dashboard-chat-thread-setting]");
if (threadSettingButton) {
const currentState = readDashboardChatWidgetState();
const action = String(threadSettingButton.dataset.dashboardChatThreadSetting || "").trim();
if (action === "rename" || action === "avatar") {
dashboardChatThreadSettingsDialog = {
type: action,
threadId: normalizeDashboardChatThreadId(threadSettingButton.dataset.dashboardChatThreadSettingThread || currentState.selectedThreadId, dashboardChatTeamThreadId),
};
renderDashboardChatWidget();
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-settings-input]")?.focus();
}, 0);
return;
}
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
const threadUserStateButton = event.target.closest("[data-dashboard-chat-thread-user-state]");
if (threadUserStateButton) {
const operation = String(threadUserStateButton.dataset.dashboardChatThreadUserState || "").trim();
const threadId = normalizeDashboardChatThreadId(threadUserStateButton.dataset.dashboardChatThreadUserStateThread || readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
const labels = {
archive: ["Archive chat?", "This hides the chat from your inbox only.", "Archive"],
hide: ["Hide chat?", "This removes the chat from your inbox only.", "Hide"],
delete: ["Delete chat for you?", "This clears your chat history. Other people keep theirs.", "Delete for me"],
block: ["Block chat?", "This removes the direct chat from your inbox.", "Block"],
};
const copy = labels[operation] || ["Update chat?", "This changes your private chat state only.", "Update"];
threadUserStateButton.closest("details")?.removeAttribute("open");
setDashboardChatConfirmAction({
type: "threadUserState",
threadId,
operation,
title: copy[0],
message: copy[1],
confirmLabel: copy[2],
});
renderDashboardChatWidget();
return;
}
const leaveThreadButton = event.target.closest("[data-dashboard-chat-leave-thread]");
if (leaveThreadButton) {
const threadId = normalizeDashboardChatThreadId(leaveThreadButton.dataset.dashboardChatLeaveThread || readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
leaveThreadButton.closest("details")?.removeAttribute("open");
setDashboardChatConfirmAction({
type: "leaveThread",
threadId,
title: "Leave group?",
message: "You leave the group. The existing history stays protected for remaining members.",
confirmLabel: "Leave group",
});
renderDashboardChatWidget();
return;
}
const participantActionButton = event.target.closest("[data-dashboard-chat-participant-action]");
if (participantActionButton) {
const currentState = readDashboardChatWidgetState();
const action = String(participantActionButton.dataset.dashboardChatParticipantAction || "").trim();
const threadId = normalizeDashboardChatThreadId(participantActionButton.dataset.dashboardChatParticipantThread || currentState.selectedThreadId, dashboardChatTeamThreadId);
if (action === "add") {
dashboardChatThreadSettingsDialog = { type: "participants", threadId };
renderDashboardChatWidget();
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-participant-filter]")?.focus();
}, 0);
return;
}
if (action === "remove") {
const participantId = String(participantActionButton.dataset.dashboardChatParticipantId || "").trim();
const participant = getPlatformUsers().find((candidate) => candidate.id === participantId);
const label = participant ? formatUserName(participant) : "this participant";
setDashboardChatConfirmAction({
type: "removeParticipant",
threadId,
participantId,
title: `Remove ${label}?`,
message: "The conversation history stays protected.",
confirmLabel: "Remove",
});
renderDashboardChatWidget();
return;
}
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
} else if (confirmAction?.type === "threadUserState") {
await dashboardChatApiUiActions.setThreadUserStateWithApi(confirmAction.threadId, confirmAction.operation);
} else if (confirmAction?.type === "leaveThread") {
await dashboardChatApiUiActions.leaveThreadWithApi(confirmAction.threadId);
} else if (confirmAction?.type === "removeParticipant") {
const currentIds = getDashboardChatParticipantIdsForApi(confirmAction.threadId);
await dashboardChatApiUiActions.setThreadParticipantsWithApi(
confirmAction.threadId,
currentIds.filter((userId) => userId !== confirmAction.participantId)
);
} else if (confirmAction?.type === "deleteMessage") {
await removeDashboardMessageWithApi(confirmAction.messageId);
platformNavigationController.renderTopIconMenu();
} else if (confirmAction?.type === "deleteMessageForMe") {
await deleteDashboardMessageForMeWithApi(confirmAction.messageId);
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
const actionItemStatusButton = event.target.closest("[data-dashboard-chat-action-item-status]");
if (actionItemStatusButton) {
const currentState = readDashboardChatWidgetState();
await dashboardChatApiUiActions.updateActionItemStatusWithApi(
actionItemStatusButton.dataset.dashboardChatActionItemId,
actionItemStatusButton.dataset.dashboardChatActionItemStatus,
currentState.selectedThreadId
);
return;
}
const copyMessageButton = event.target.closest("[data-dashboard-copy-message]");
if (copyMessageButton) {
if (copyMessageButton.dataset.dashboardChatPromoteTarget === "task") {
await dashboardChatApiUiActions.createActionItemFromMessageWithApi(
copyMessageButton.dataset.dashboardCopyMessage,
copyMessageButton.dataset
);
return;
}
const message = getDashboardMessageById(copyMessageButton.dataset.dashboardCopyMessage);
const text = String(message?.text || "");
const copied = Boolean(text && navigator.clipboard?.writeText && await navigator.clipboard.writeText(text).then(() => true, () => false));
showDashboardChatWidgetToast(copied ? "Copied" : "Failed", message?.threadId || dashboardChatTeamThreadId);
return;
}
const editMessageButton = event.target.closest("[data-dashboard-edit-message]");
if (editMessageButton) {
const message = getDashboardMessageById(editMessageButton.dataset.dashboardEditMessage);
if (!message || message.userId !== getCurrentPlatformUser()?.id) {
showDashboardChatWidgetToast("Only the sender can edit this message.", message?.threadId || dashboardChatTeamThreadId);
return;
}
const nextText = window.prompt("Edit message", message.text || "");
if (nextText !== null) {
await editDashboardMessageWithApi(message.id, nextText);
}
return;
}
const forwardMessageButton = event.target.closest("[data-dashboard-forward-message]");
if (forwardMessageButton) {
const message = getDashboardMessageById(forwardMessageButton.dataset.dashboardForwardMessage);
const availableThreads = dashboardChatApiThreads
.filter((thread) => thread?.threadId && thread.threadId !== message?.threadId)
.slice(0, 20);
const menu = availableThreads.map((thread, index) => `${index + 1}. ${thread.label || thread.title || thread.threadId}`).join("\n");
const answer = window.prompt(`Forward to conversation:\n${menu}`, "1");
const numericIndex = Number(answer) - 1;
const targetThread = Number.isInteger(numericIndex) && numericIndex >= 0 ? availableThreads[numericIndex] : availableThreads.find((thread) => String(thread.label || thread.title || thread.threadId).toLowerCase() === String(answer || "").trim().toLowerCase());
if (targetThread?.threadId) {
await forwardDashboardMessageWithApi(message?.id, targetThread.threadId);
} else if (answer !== null) {
showDashboardChatWidgetToast("Conversation not found.", message?.threadId || dashboardChatTeamThreadId);
}
return;
}
const retryMessageButton = event.target.closest("[data-dashboard-retry-message]");
if (retryMessageButton) {
await retryDashboardMessageWithApi(retryMessageButton.dataset.dashboardRetryMessage);
return;
}
const retrySyncButton = event.target.closest("[data-dashboard-chat-retry-sync]");
if (retrySyncButton) {
const currentState = readDashboardChatWidgetState();
const threadId = normalizeDashboardChatThreadId(
retrySyncButton.dataset.dashboardChatRetrySync || currentState.selectedThreadId,
dashboardChatTeamThreadId
);
queueDashboardChatThreadSummaryRefresh({ delayMs: 0, render: false, forceNetwork: true });
await refreshDashboardChatFromApi({ threadId, forceNetwork: true });
renderDashboardChatWidget();
return;
}
const reactionButton = findDashboardChatActionTarget(event, "[data-dashboard-message-reaction][data-dashboard-reaction-key]");
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
const jumpUnreadButton = event.target.closest("[data-dashboard-chat-jump-unread]");
if (jumpUnreadButton) {
event.preventDefault();
scrollDashboardChatFirstUnread();
return;
}
const openDirectCreatorButton = event.target.closest("[data-dashboard-chat-open-direct-creator]");
if (openDirectCreatorButton) {
event.preventDefault();
openDirectCreatorButton.closest("details")?.removeAttribute("open");
dashboardChatCreatorMode = "dm";
setDashboardChatGroupCreatorOpen(true, { forceRender: true });
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-direct-user-filter]")?.focus();
}, 0);
return;
}
const openGroupCreatorButton = event.target.closest("[data-dashboard-chat-open-group-creator]");
if (openGroupCreatorButton) {
event.preventDefault();
openGroupCreatorButton.closest("details")?.removeAttribute("open");
dashboardChatCreatorMode = "group";
setDashboardChatGroupCreatorOpen(true, { forceRender: true });
win.setTimeout(() => {
ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-group-name-input]")?.focus();
}, 0);
return;
}
const closeGroupCreatorButton = event.target.closest("[data-dashboard-chat-group-create-close]");
const groupCreatorBackdrop = event.target.closest("[data-dashboard-chat-group-create-backdrop]");
if (
  closeGroupCreatorButton ||
  (groupCreatorBackdrop && event.target === groupCreatorBackdrop && !dashboardChatGroupCreatorPointerDownInsideCard)
) {
event.preventDefault();
closeDashboardChatGroupCreator();
return;
}
const directCreateUserRow = event.target.closest("[data-dashboard-chat-direct-user-search]");
if (directCreateUserRow) {
const directCreateForm = directCreateUserRow.closest("[data-dashboard-chat-direct-create-form]");
const directParticipantInput = directCreateUserRow.querySelector("input[name='participantId']");
if (directCreateForm && directParticipantInput && directCreateForm.dataset.busy !== "true") {
event.preventDefault();
directParticipantInput.checked = true;
syncDashboardChatDirectCreateForm(directCreateForm);
await createDashboardDirectThreadFromForm(directCreateForm);
}
return;
}
const groupTitlePresetButton = event.target.closest("[data-dashboard-chat-group-title-preset]");
if (groupTitlePresetButton) {
event.preventDefault();
const groupNameInput = ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-group-name-input]");
if (groupNameInput) {
groupNameInput.value = groupTitlePresetButton.dataset.dashboardChatGroupTitlePreset || "";
groupNameInput.focus();
syncDashboardChatGroupCreateForm(groupNameInput.closest("[data-dashboard-chat-group-create-form]"));
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
const emojiButton = event.target.closest("[data-dashboard-chat-emoji]");
if (emojiButton) {
event.preventDefault();
insertDashboardChatComposerEmoji(emojiButton.dataset.dashboardChatEmoji);
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
if (toggleChat.dataset.dashboardChatLauncherIgnoreNextOpen === "true") {
delete toggleChat.dataset.dashboardChatLauncherIgnoreNextOpen;
return;
}
const currentState = readDashboardChatWidgetState();
if (currentState.isOpen) {
closeDashboardChatWidgetPanel({ render: false });
renderDashboardChatWidget();
focusDashboardChatWidgetLauncher();
return;
}
const nextState = {
...currentState,
isOpen: true,
};
writeDashboardChatWidgetState(nextState);
if (nextState.isOpen) {
dashboardChatMobileConversationOpen = false;
hideDashboardChatWidgetToast();
requestDashboardChatScrollToLatest(nextState.selectedThreadId || dashboardChatTeamThreadId);
queueDashboardChatThreadSummaryRefresh({ delayMs: 0, render: false, forceNetwork: true });
void refreshDashboardChatFromApi({
threadId: normalizeDashboardChatThreadId(nextState.selectedThreadId, dashboardChatTeamThreadId),
forceNetwork: true,
});
void refreshDashboardChatPushDiagnostics({ render: false });
}
renderDashboardChatWidget();
if (nextState.isOpen) {
scrollDashboardChatActiveThreadToLatest(nextState.selectedThreadId || dashboardChatTeamThreadId);
}
if (nextState.isOpen) {
focusDashboardChatWidgetComposer();
}
return;
}
const toggleNotifications = event.target.closest("[data-dashboard-chat-widget-toggle-notifications]");
if (toggleNotifications) {
await runDashboardChatNotificationToggleAction();
return;
}
const testPushNotifications = event.target.closest("[data-dashboard-chat-widget-test-push]");
if (testPushNotifications) {
await runDashboardChatPushTestAction();
return;
}
const refreshPushStatus = event.target.closest("[data-dashboard-chat-widget-refresh-push-status]");
if (refreshPushStatus) {
await refreshDashboardChatPushDiagnostics({ render: true, showToast: true, force: true });
return;
}
const threadFilterButton = event.target.closest("[data-dashboard-chat-thread-filter]");
if (threadFilterButton) {
dashboardChatThreadFilter = ["all", "unread", "mentions", "pinned"].includes(threadFilterButton.dataset.dashboardChatThreadFilter)
? threadFilterButton.dataset.dashboardChatThreadFilter
: "all";
renderDashboardChatWidget();
return;
}
const threadSwitchButton = event.target.closest("[data-dashboard-chat-thread]");
if (threadSwitchButton) {
const threadId = normalizeDashboardChatThreadId(threadSwitchButton.dataset.dashboardChatThread, dashboardChatTeamThreadId);
if (!threadId) {
return;
}
const currentThreadId = normalizeDashboardChatThreadId(readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
const isThreadSwitch = threadId !== currentThreadId;
clearDashboardChatTyping();
setDashboardChatReplyDraft("", "");
setDashboardChatPriorityDraft("normal");
dashboardChatMessageSearchQuery = "";
dashboardChatDetailsOpen = false;
setDashboardChatGroupCreatorOpen(false, { render: false });
dashboardChatCreatorMode = "group";
dashboardChatMobileConversationOpen = true;
writeDashboardChatWidgetState({
isOpen: true,
selectedThreadId: threadId,
});
if (isThreadSwitch) {
requestDashboardChatScrollToLatest(threadId);
}
markDashboardChatWidgetNotificationSeenForThread(threadId);
hideDashboardChatWidgetToast();
renderDashboardChatWidget();
if (isThreadSwitch) {
scrollDashboardChatActiveThreadToLatest(threadId);
}
queueDashboardChatThreadSummaryRefresh({ delayMs: 0, render: false, forceNetwork: true });
void refreshDashboardChatFromApi({ threadId, forceNetwork: true });
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
const deleteMessageForMeButton = event.target.closest("[data-dashboard-delete-message-for-me]");
if (deleteMessageForMeButton) {
const message = getDashboardMessageById(deleteMessageForMeButton.dataset.dashboardDeleteMessageForMe);
setDashboardChatConfirmAction({
type: "deleteMessageForMe",
messageId: deleteMessageForMeButton.dataset.dashboardDeleteMessageForMe,
title: "Delete for you?",
message: "This removes the message from your chat only. Other people keep their copy.",
confirmLabel: "Delete for me",
});
renderDashboardChatWidget();
return;
}
const deleteMessageForEveryoneButton = event.target.closest("[data-dashboard-delete-message-for-everyone]");
if (deleteMessageForEveryoneButton) {
const message = getDashboardMessageById(deleteMessageForEveryoneButton.dataset.dashboardDeleteMessageForEveryone);
if (!canDeleteDashboardChatMessage(message)) {
showDashboardChatWidgetToast("Only the sender or an admin can delete this message for everyone.", message?.threadId || dashboardChatTeamThreadId);
return;
}
setDashboardChatConfirmAction({
type: "deleteMessage",
messageId: deleteMessageForEveryoneButton.dataset.dashboardDeleteMessageForEveryone,
title: "Delete for everyone?",
message: "This removes the message for everyone in the chat. The action is audited.",
confirmLabel: "Delete for everyone",
});
renderDashboardChatWidget();
return;
}
const removeMessageButton = event.target.closest("[data-dashboard-remove-message]");
if (removeMessageButton) {
const message = getDashboardMessageById(removeMessageButton.dataset.dashboardRemoveMessage);
if (!canDeleteDashboardChatMessage(message)) {
showDashboardChatWidgetToast("Only the sender or an admin can delete this message.", message?.threadId || dashboardChatTeamThreadId);
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
const countElement = chatInput.closest("[data-dashboard-chat-form]")?.querySelector("[data-dashboard-chat-character-count]");
if (countElement) {
countElement.textContent = `${String(chatInput.value || "").length}/${dashboardChatMaxMessageLength}`;
}
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
const participantFilterInput = event.target.closest("[data-dashboard-chat-participant-filter]");
if (participantFilterInput) {
const query = String(participantFilterInput.value || "").trim().toLowerCase();
participantFilterInput
.closest("[data-dashboard-chat-participants-form]")
?.querySelectorAll("[data-dashboard-chat-participant-row]")
.forEach((row) => {
const searchableText = row.dataset.dashboardChatParticipantSearch || row.textContent || "";
row.hidden = Boolean(query) && !searchableText.toLowerCase().includes(query);
});
return;
}
const groupCreateForm = event.target.closest("[data-dashboard-chat-group-create-form]");
if (groupCreateForm) {
if (event.target.closest("[data-dashboard-chat-group-user-filter]")) {
filterDashboardChatGroupCreateUsers(groupCreateForm);
return;
}
syncDashboardChatGroupCreateForm(groupCreateForm);
return;
}
const directCreateForm = event.target.closest("[data-dashboard-chat-direct-create-form]");
if (directCreateForm) {
if (event.target.closest("[data-dashboard-chat-direct-user-filter]")) {
filterDashboardChatDirectCreateUsers(directCreateForm);
return;
}
syncDashboardChatDirectCreateForm(directCreateForm);
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
ui.dashboardChatWidgetRoot?.addEventListener("focusout", (event) => {
const groupNameInput = event.target.closest("[data-dashboard-chat-group-name-input]");
const groupAvatarInput = event.target.closest("[data-dashboard-chat-group-avatar-input]");
if (!groupNameInput && !groupAvatarInput) {
return;
}
const targetInput = groupNameInput || groupAvatarInput;
const normalizedValue = groupNameInput
? normalizeDashboardChatGroupNameInput(targetInput.value)
: normalizeDashboardChatGroupAvatarInput(targetInput.value);
if (targetInput.value !== normalizedValue) {
targetInput.value = normalizedValue;
}
syncDashboardChatGroupCreateForm(targetInput.closest("[data-dashboard-chat-group-create-form]"));
});
ui.dashboardChatWidgetRoot?.addEventListener("keydown", (event) => {
if (event.key === "Escape") {
event.preventDefault();
event.stopPropagation();
if (dashboardChatThreadSettingsDialog) {
closeDashboardChatThreadSettingsDialog();
return;
}
if (dashboardChatGroupCreatorOpen) {
closeDashboardChatGroupCreator();
return;
}
closeDashboardChatWidgetPanel();
return;
}
if (!event.target.matches("[data-dashboard-chat-input]")) {
return;
}
if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
event.preventDefault();
event.target.form?.requestSubmit();
}
});
ui.dashboardChatWidgetRoot?.addEventListener("submit", async (event) => {
const settingsForm = event.target.closest("[data-dashboard-chat-settings-form]");
if (settingsForm) {
event.preventDefault();
await submitDashboardChatSettingsForm(settingsForm);
return;
}
const participantsForm = event.target.closest("[data-dashboard-chat-participants-form]");
if (participantsForm) {
event.preventDefault();
await submitDashboardChatParticipantsForm(participantsForm);
return;
}
const groupCreateForm = event.target.closest("[data-dashboard-chat-group-create-form]");
if (groupCreateForm) {
event.preventDefault();
await createDashboardCustomGroupThreadFromForm(groupCreateForm);
return;
}
const directCreateForm = event.target.closest("[data-dashboard-chat-direct-create-form]");
if (directCreateForm) {
event.preventDefault();
await createDashboardDirectThreadFromForm(directCreateForm);
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
const chatThreadButton = event.target.closest("[data-dashboard-chat-thread]");
const chatToggleButton = event.target.closest("[data-dashboard-chat-widget-toggle]");
if (chatThreadButton || chatToggleButton) {
const targetThreadId = normalizeDashboardChatThreadId(
chatThreadButton?.dataset?.dashboardChatThread || readDashboardChatWidgetState().selectedThreadId,
dashboardChatTeamThreadId
);
const currentThreadId = normalizeDashboardChatThreadId(readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
const shouldScrollToLatest = Boolean(chatToggleButton || targetThreadId !== currentThreadId);
if (shouldScrollToLatest) {
requestDashboardChatScrollToLatest(targetThreadId);
win.setTimeout(() => scrollDashboardChatActiveThreadToLatest(targetThreadId), 0);
}
}
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
requestDashboardChatScrollToLatest(threadId);
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
void refreshDashboardChatFromApi({ threadId, forceNetwork: true });
requestDashboardChatScrollToLatest(threadId);
renderDashboardChatWidget();
scrollDashboardChatActiveThreadToLatest(threadId);
focusDashboardChatWidgetComposer();
platformNavigationController.renderTopIconMenu();
});
bindPlatformWorkspaceRuntimeBindings({
ui,
win,
bindProfileStaffRuntimeBindings,
bindAdminRuntimeBindings,
bindMedicalRuntimeBindings,
bindPlayerProfileRuntimeBindings,
bindSessionPlannerRuntimeBindings,
periodizationWorkspaceController,
scheduleWorkspaceController,
profileState: {
getSelectedStaffUserId: () => selectedStaffUserId,
setSelectedStaffUserId: (userId) => { selectedStaffUserId = userId; },
getStaffCreateUserDraft: () => staffCreateUserDraft,
setStaffCreateUserDraft: (draft) => { staffCreateUserDraft = draft && typeof draft === "object" ? { ...draft } : null; },
getStaffCreateUserEditorOpen: () => staffCreateUserEditorOpen,
setStaffCreateUserEditorOpen: (isOpen) => { staffCreateUserEditorOpen = isOpen; },
},
medicalState: {
getMedicalState: () => medicalState,
setMedicalSelectedPlayerId: (playerId) => { medicalState.selectedPlayerId = playerId; },
setMedicalPlayerModalOpen: (isOpen) => { medicalPlayerModalOpen = isOpen; },
setMedicalPlayerModalTab: (tab) => { medicalPlayerModalTab = tab; },
getMedicalBulkRecommendationOpen: () => medicalBulkRecommendationOpen,
setMedicalBulkRecommendationOpen: (isOpen) => { medicalBulkRecommendationOpen = isOpen; },
setMedicalHistoryDateFilter: (filter) => { medicalHistoryDateFilter = filter || "all"; },
setMedicalHistoryPlayerFilter: (filter) => { medicalHistoryPlayerFilter = filter || "all"; },
setMedicalHistorySearchQuery: (query) => { medicalHistorySearchQuery = query || ""; },
setMedicalOperationsTab: (tab) => { medicalOperationsTab = tab; },
setMedicalRosterSearchQuery: (query) => { medicalRosterSearchQuery = query; },
setMedicalStatusFilter: (filter) => { medicalStatusFilter = filter; },
},
playerProfileState: {
getPendingPlayerProfileImportPlan,
setPendingPlayerProfileImportPlan,
getPlayerProfilesState: () => playerProfilesState,
setPlayerProfileActiveTab: (tab) => { playerProfileActiveTab = tab; },
setPlayerProfileAutosaveLastSignature,
getPlayerProfilesTemporarySectionCollapsed: () => playerProfilesTemporarySectionCollapsed,
setPlayerProfilesTemporarySectionCollapsed: (isCollapsed) => { playerProfilesTemporarySectionCollapsed = isCollapsed; },
setPlayerProfilesSearchQuery: (query) => { playerProfilesSearchQuery = query; },
setPlayerProfilesRoleGroupFilter: (filter) => { playerProfilesRoleGroupFilter = filter; },
setPlayerProfilesRosterFilter: (filter) => { playerProfilesRosterFilter = filter; },
setPlayerProfileModalOpen: (isOpen) => { playerProfileModalOpen = isOpen; },
setPlayerProfileNewPlayerModalOpen: (isOpen) => { playerProfileNewPlayerModalOpen = isOpen; },
},
sessionPlannerState: {
localUiState: sessionPlannerLocalUiState,
runtimeDelegates: sessionPlannerRuntimeDelegates,
exerciseLibrary: exerciseLibraryRuntimeFacade,
exerciseLibraryActions,
periodizationBridge: workspaceRuntimeComposition.sessionPlannerPeriodizationBridge,
boardHistory: { undo: undoSessionPlannerBoardHistory, redo: redoSessionPlannerBoardHistory },
normalizers: {
cleanPlayerBoardFormationInput: cleanSessionPlannerPlayerBoardFormationInput,
normalizePlayerBoardAutoMode: normalizeSessionPlannerPlayerBoardAutoMode,
normalizePlayerBoardFormationValue: normalizeSessionPlannerPlayerBoardFormationValue,
normalizePlayerBoardTeamCount: normalizeSessionPlannerPlayerBoardTeamCount,
normalizeTacticalColor,
normalizeTacticalLineWidth,
},
getSelectedDate: () => sessionPlannerState?.selectedDate,
getMultiSelectOpenField: getSessionPlannerMultiSelectOpenField,
setMultiSelectOpenField: setSessionPlannerMultiSelectOpenField,
},
actions: {
addMedicalInjuryPlan, addMedicalRecord, addPlayerProfile, applyMedicalBulkRecommendation, applyMedicalQuickRecommendation,
clearMedicalQuickRecommendation,
applyPlayerProfileImportUndo, buildPlatformAppearanceConfigFromForm, buildPlayerProfileImportFeedback, buildPlayerProfileOperationFeedback,
buildTemporaryLoginMessage, canAdminManageUser, canEditMedicalTeam, canEditPlayerProfiles, canEditSessionPlanner,
clearMedicalInjuryPlanDraft, closeMedicalPlayerModal, closePlayerProfileModal, closePlayerProfileNewPlayerModal,
copyMedicalCoachHandoverToClipboard, createAdminClubFromForm, createAdminTeamFromForm, createDashboardTask,
createDefaultPlatformAppearanceConfig, createProfileImageDataUrl, ensurePlayerProfilesState, ensureTransferRoomState,
exportFootballScienceDataBackup, exportSquadDataFoundationJson, exportSquadSessionPlannerCsv, flushPlayerProfileAutosave,
formatScheduleDateValue, formatUserName, getAdminManagedWorkspaces, getAdminRuntimeBindingState: () => adminRuntimeService.getBindingStateAccessors(),
getAdminTransferRoomAccessTeamId, getCurrentPlatformUser, getFilteredMedicalPlayers, getMedicalBulkSelectedPlayers,
getMedicalDatabasePlayer, getMedicalInjuryPlanFormDraft, getMedicalRecommendationActivityContext, getMedicalRecommendationBlockReason,
getMedicalRtpLibraryProfile, getMedicalRtpExercisesForProfile, getMedicalRtpLibraryStarterDraft, getMedicalRtpLibraryStarterDraftForPlan,
loadMedicalRtpLibraryProfile, loadMedicalRtpLibraryProfiles,
getMedicalRtpPhaseForRecommendation, getMedicalRtpPhaseOption, getMedicalStatusForParticipation, getMedicalStatusOption,
getMedicalStatusOptionForDate, getPasswordValidationMessage, getPlatformAuthStore, getPlatformFormValues, getPlatformRoles,
getPlatformStructureState, getPlatformUsers, getPlayerProfileFormSignature, getSessionPlannerTacticalPlayerBadgeFromKeyboardEvent,
getUserTeamId, getWorkspaceAccessConfig, handlePhotoInput, hasHubState: () => Boolean(hubState), hasUserFieldConflict,
importFootballScienceDataBackupFile, importSquadDataFoundationFile, importSquadDataFoundationPayload, isCurrentPlatformUserAdmin,
isMedicalItemArchived, isPlatformAdminUser, isTemporaryPlayerProfile, loadAdminAuditLog, loadPlatformReadinessReport,
maybeCopyToClipboard, normalizeAdminUserSubmissionValues, normalizeMedicalOperationsTab, normalizeMedicalParticipation,
normalizeMedicalPlayer, normalizeMedicalPlayerModalTab, normalizePlayerProfileTab, openCredentialsMailto, openMedicalPlayerModal,
getMedicalPlayerRtpCoachStatus, loadMedicalPlayerRtpCoachStatus,
openPlayerProfileModal, openPlayerProfileNewPlayerModal, parseMedicalRosterText, persistMedicalInjuryPlanDraftFromForm,
publishPlatformAppearanceConfig, queuePlayerProfileAutosave, readDashboardTasks, readPlatformAppearanceState,
recordMedicalDatabaseSyncEvent, refreshDashboardSurfaces, removeDashboardTask, removeMedicalInjuryPlan, removeMedicalPlayer,
removeMedicalRecord, removePlayerProfile, renderAdminWorkspace, renderMedicalTeamWorkspace, renderPlayerProfilesRosterListOnly,
renderPlayerProfilesWorkspace, renderProfileWorkspace, renderStaffWorkspace, renderWorkspaceChrome, repairWorkspaceState,
savePlayerProfileEditForm, setFormSubmitButtonState, setMedicalBulkNotSetSelection, setMedicalBulkSelection,
setMedicalInjuryPlanDraft, setMedicalInjuryPlanDraftFromPlan, setMedicalSelectedDate, setProfileMenuOpen, shiftMedicalSelectedDate,
stripPasswordConfirmation, syncPlatformStructureWithUsers, syncPlatformUserFromAuth, toggleMedicalBulkPlayer,
togglePasswordInputVisibility, transferRoomRuntime, updateDashboardTask, updateMedicalBulkActivityControls,
updateMedicalGovernancePolicy, updateMedicalInjuryPlan, updateMedicalPlanClearance, updateMedicalPlayerProfile,
updatePlatformUserFromPayload, uploadPlayerProfilePhoto, uploadSquadTeamLogo, upsertMedicalPlayers, withUiTimeout, writeWorkspaceHubState,
},
});
ui.dashboardChatWidgetRoot?.addEventListener("change", async (event) => {
const groupParticipantInput = event.target.closest("[data-dashboard-chat-group-create-form] input[name='participantIds']");
if (groupParticipantInput) {
syncDashboardChatGroupCreateForm(groupParticipantInput.closest("[data-dashboard-chat-group-create-form]"));
return;
}
const directParticipantInput = event.target.closest("[data-dashboard-chat-direct-create-form] input[name='participantId']");
if (directParticipantInput) {
const directCreateForm = directParticipantInput.closest("[data-dashboard-chat-direct-create-form]");
syncDashboardChatDirectCreateForm(directCreateForm);
await createDashboardDirectThreadFromForm(directCreateForm);
return;
}
const attachmentInput = event.target.closest("[data-dashboard-chat-attachment-input]");
if (!attachmentInput) {
return;
}
await handleDashboardChatAttachmentInputChange(attachmentInput);
});
bindPlatformGlobalRuntimeEvents({
documentRef: document,
win,
ui,
workspaceModuleRuntimeController,
isSimulatorIntroActive,
isEditableKeyboardTarget,
launchGameSimulatorFromIntro,
isProfileMenuOpen,
setProfileMenuOpen,
getMedicalPlayerModalOpen: () => medicalPlayerModalOpen,
setMedicalPlayerModalOpen: (isOpen) => { medicalPlayerModalOpen = isOpen; },
setMedicalPlayerModalTab: (tab) => { medicalPlayerModalTab = tab; },
renderMedicalTeamWorkspace,
getPlayerProfileModalOpen: () => playerProfileModalOpen,
closePlayerProfileModal,
getPlayerProfileNewPlayerModalOpen: () => playerProfileNewPlayerModalOpen,
closePlayerProfileNewPlayerModal,
getPeriodizationOverlayState,
setPeriodizationOverlayState,
renderPeriodizationWorkspace,
hasActiveMetricTooltip,
hideMetricTooltip,
setActiveWorkspace,
syncPlatformUserFromAuth,
syncAccountMenu,
getCurrentPlatformUser,
startDashboardPresenceRuntime,
stopDashboardPresenceRuntime,
getCentralStateBridge,
reloadCentralizedAppStateFromStorage,
getHubState: () => hubState,
setHubActiveWorkspaceId: (workspaceId) => { hubState.activeWorkspaceId = workspaceId; },
renderWorkspaceChrome,
scheduleDashboardLoginPopups,
getDataSafetyRuntimeStatus: () => dataSafetyRuntimeStatus,
retryCentral,
flushCentralStateWrites,
refreshDashboardPresence,
requestCentralizedAppStateReload,
refreshDataSafetyStatus,
flushDeferredCentralizedAppStateReload,
applyPlatformThemeByTime,
markDashboardPresenceActivity,
pushDashboardPresence,
queueDashboardChatCurrentViewRefresh,
refreshCentralStateFromSource,
pauseDashboardPresenceRuntime,
renderDashboardChatWidget,
centralAppStateReloadService,
isDataSafetyProtectedStorageKey,
queueDataSafetyStatusRefresh,
sessionPlannerStorageKey,
queueDataSafetySnapshot,
dashboardChatStorageKey,
clearDashboardChatRuntimeMessages: () => { dashboardChatRuntimeMessages = []; },
purgeDashboardDeletedMessagesFromStorage,
syncDashboardChatWidgetNotificationCursor,
platformNavigationController,
dashboardChatDeletedMessageIdsStorageKey,
dashboardTaskStorageKey,
dashboardNotificationSeenStorageKey,
dashboardPresentationStorageKey,
playerProfilesStorageKey,
scoutingStorageKey,
transferRoomStorageKey,
setPlayerProfilesState: (nextState) => { playerProfilesState = nextState; },
readPlayerProfilesState,
syncTransferRoomLinkedState,
renderPlayerProfilesWorkspace,
setScoutingState: (nextState) => { scoutingState = nextState; },
readScoutingState,
getScoutingState: () => scoutingState,
preserveScoutingTransientUiState,
shouldDeferCentralizedAppStateReload,
setCentralizedAppStateReloadPending,
renderScoutingWorkspace,
setTransferRoomState: (nextState) => { transferRoomState = nextState; },
readTransferRoomState,
renderTransferRoomWorkspace,
markDashboardHomeSeenForCurrentUser,
renderDashboardCards,
clearCentralStateWriteTimer,
flushQueuedDataSafetySnapshot,
initializeWorkspaceHub,
queueGameSimulatorControllersLoad,
renderSimulator: render,
startSimulatorAnimationLoop,
});
