import { createSessionPlannerBoardHistoryController } from "./session-planner-board-history-controller.mjs";
import { createSessionPlannerRuntimeStateService } from "./session-planner-runtime-state-service.mjs";
import { createSessionPlannerTacticalController } from "./session-planner-tactical-controller.mjs";
import { createSessionPlannerVisualUploadHelpers } from "./session-planner-visual-upload.mjs";
import { createSessionPlannerWorkspaceController } from "./session-planner-workspace-controller.mjs";

export function createSessionPlannerRuntimeService(deps = {}) {
  const blockHelpers = deps.blockHelpers || {};
  const delegates = deps.runtimeDelegates || {};
  const library = deps.exerciseLibraryRuntimeFacade || {};
  const reviewHelpers = deps.exerciseLibraryReviewHelpers || {};
  const renderers = deps.runtimeRenderers || {};
  const stateMerge = deps.stateMergeHelpers || {};
  const tactical = deps.tacticalHelpers || {};
  const localUiState = deps.localUiState || { state: {}, getState: () => ({}), applyPatch: () => {} };
  let boardHistory = null;

  const getSessionPlannerState = () => deps.getSessionPlannerState?.() ?? null;
  const writeSessionPlannerState = (...args) => stateService.writeState(...args);
  const renderSessionPlannerWorkspace = (...args) => delegates.renderSessionPlannerWorkspace(...args);
  const showSessionPlannerToast = (...args) => deps.showSessionPlannerToast?.(...args);

  const stateService = createSessionPlannerRuntimeStateService({
    canWriteCentralBackedCache: deps.canWriteCentralBackedCache,
    captureBoardHistoryFromState: () => boardHistory?.captureFromState?.(),
    clamp: deps.clamp,
    cloneState: stateMerge.cloneSessionPlannerState,
    createDefaultState: stateMerge.createSessionPlannerDefaultState,
    dataSafetySnapshotStoreName: deps.dataSafetySnapshotStoreName,
    findWorkspaceFieldElements: () => Array.from(deps.ui?.sessionPlannerWorkspace?.querySelectorAll("[data-session-field]") || []),
    formatMultiValue: deps.formatSessionPlannerMultiValue,
    getActiveWorkspaceId: deps.getActiveWorkspaceId,
    getSelectedBlock: delegates.getSessionPlannerSelectedBlock,
    getSessionPlannerState,
    logEvent: deps.logEvent,
    markBlockFieldsUpdated: stateMerge.markSessionPlannerBlockFieldsUpdated,
    mergeStateForWrite: stateMerge.mergeSessionPlannerStateForWrite,
    mergeStateFromBackup: stateMerge.mergeSessionPlannerStateFromBackup,
    openDataSafetyDatabase: deps.openDataSafetyDatabase,
    rawDataSafetyGetItem: deps.rawDataSafetyGetItem,
    rawDataSafetySetItem: deps.rawDataSafetySetItem,
    recordDataSafetyWrite: deps.recordDataSafetyWrite,
    renderWorkspace: renderSessionPlannerWorkspace,
    sessionPlannerAutosaveBoundary: deps.sessionPlannerAutosaveBoundary,
    sessionPlannerMultiSelectFields: deps.sessionPlannerMultiSelectFields,
    sessionPlannerStorageKey: deps.sessionPlannerStorageKey,
    setSessionPlannerState: deps.setSessionPlannerState,
    showToast: showSessionPlannerToast,
    win: deps.win,
  });

  boardHistory = createSessionPlannerBoardHistoryController({
    canEdit: deps.canEditSessionPlanner,
    clearTacticalSelection: delegates.clearSessionPlannerTacticalSelection,
    cloneTacticalElement: tactical.cloneTacticalElement,
    getSelectedBlock: delegates.getSessionPlannerSelectedBlock,
    getSelectedDate: () => getSessionPlannerState()?.selectedDate || "date",
    markBlockFieldsUpdated: stateMerge.markSessionPlannerBlockFieldsUpdated,
    normalizePlayerBoardColors: renderers.normalizePlayerBoardColors,
    normalizePlayerBoardCustomPeople: renderers.normalizePlayerBoardCustomPeople,
    normalizePlayerBoardPositions: renderers.normalizePlayerBoardPositions,
    normalizeTacticalActiveFrameId: tactical.normalizeTacticalActiveFrameId,
    normalizeTacticalFrames: tactical.normalizeTacticalFrames,
    normalizeTacticalPitchMode: tactical.normalizeTacticalPitchMode,
    renderWorkspace: renderSessionPlannerWorkspace,
    resetTacticalDraftState: () => {
      localUiState.state.sessionPlannerTacticalPendingPoint = null;
      localUiState.state.sessionPlannerTacticalDraftLineState = null;
      localUiState.state.sessionPlannerTacticalSelectionState = null;
    },
    showToast: showSessionPlannerToast,
    writeState: writeSessionPlannerState,
  });

  const workspaceController = createSessionPlannerWorkspaceController({
    areSessionPlannerBlockFieldValuesEqual: stateService.areBlockFieldValuesEqual,
    assignSessionPlannerBlockFieldValue: stateService.assignBlockFieldValue,
    assignSessionPlannerPlayerBoardAutoFormationTeams: renderers.assignAutoFormationTeams,
    assignSessionPlannerPlayerBoardFormationSlots: renderers.assignFormationSlots,
    buildSessionPlannerSelectionAssistant: renderers.buildSessionPlannerSelectionAssistant,
    canEditSessionPlanner: deps.canEditSessionPlanner,
    clamp: deps.clamp,
    clearSelectedSessionPlannerTacticalBoard: delegates.clearSelectedSessionPlannerTacticalBoard,
    cloneSessionPlannerLibraryExercise: library.cloneSessionPlannerLibraryExercise,
    cloneSessionPlannerTacticalElement: tactical.cloneTacticalElement,
    cloneSessionPlannerTacticalFrame: tactical.cloneTacticalFrame,
    compareMedicalPlayers: deps.compareMedicalPlayers,
    createSessionPlannerBlock: blockHelpers.createBlock,
    createSessionPlannerDefaultState: stateMerge.createSessionPlannerDefaultState,
    createSessionPlannerEmptySession: deps.sessionFactory?.createEmptySession,
    createSessionPlannerLineElement: tactical.createLineElement,
    createSessionPlannerPlayerBoardAutoTeamFormationSlots: renderers.createAutoTeamFormationSlots,
    createSessionPlannerPlayerBoardFormationSlots: renderers.createFormationSlots,
    createSessionPlannerPlayerProfileContract: deps.createSessionPlannerPlayerProfileContract,
    createSessionPlannerReviewNoteFromBlock: reviewHelpers.createReviewNoteFromBlock,
    createSessionPlannerReviewNoteId: blockHelpers.createReviewNoteId,
    createSessionPlannerStableId: tactical.createStableId,
    createSessionPlannerTacticalController,
    createSessionPlannerVisualUploadHelpers,
    ensurePeriodizationState: deps.ensurePeriodizationState,
    ensurePlayerProfilesState: deps.ensurePlayerProfilesState,
    escapeHtml: deps.escapeHtml,
    formatScheduleDateValue: deps.formatScheduleDateValue,
    formatSessionPlannerHistoryTimeFromModule: deps.formatSessionPlannerHistoryTimeFromModule,
    getDashboardSessionTotalMinutes: deps.getDashboardSessionTotalMinutes,
    getDefaultTacticalColor: tactical.getDefaultTacticalColor,
    getDefaultTacticalLineStyle: tactical.getDefaultTacticalLineStyle,
    getElement: deps.getElement,
    getMedicalAvailabilityItems: delegates.getMedicalAvailabilityItems,
    getPeriodizationDay: deps.getPeriodizationDay,
    getPeriodizationMatchDayLabel: deps.getPeriodizationMatchDayLabel,
    getPlatformAuthStore: deps.getPlatformAuthStore,
    getPlayerProfileRoleFitScore: deps.getPlayerProfileRoleFitScore,
    getPlayerRoleDnaDefinition: deps.getPlayerRoleDnaDefinition,
    getScheduleSessionEventForDate: deps.getScheduleSessionEventForDate,
    getScheduledSessionTitleForDate: deps.getScheduledSessionTitleForDate,
    getSessionPlannerExerciseLibrary: library.getSessionPlannerExerciseLibrary,
    getSessionPlannerExerciseReviewNotes: reviewHelpers.getExerciseReviewNotes,
    getSessionPlannerHistoryActionLabelFromModule: deps.getSessionPlannerHistoryActionLabelFromModule,
    getSessionPlannerHistoryActorLabelFromModule: deps.getSessionPlannerHistoryActorLabelFromModule,
    getSessionPlannerLibraryEditExercise: library.getSessionPlannerLibraryEditExercise,
    getSessionPlannerLibraryFolderById: library.getSessionPlannerLibraryFolderById,
    getSessionPlannerLibraryNow: blockHelpers.getLibraryNow,
    getSessionPlannerLibraryUserId: blockHelpers.getLibraryUserId,
    getSessionPlannerPlayerBoardCareerPhasePriority: renderers.getCareerPhasePriority,
    getSessionPlannerPlayerBoardDataObject: renderers.getDataObject,
    getSessionPlannerPlayerBoardDefaultPosition: renderers.getDefaultPosition,
    getSessionPlannerPlayerBoardNumericPriorityValue: renderers.getNumericPriorityValue,
    getSessionPlannerPlayerBoardPlayerRoleProfile: renderers.getPlayerRoleProfile,
    getSessionPlannerPlayerBoardPositionGroup: renderers.getPositionGroup,
    getSessionPlannerPlayerBoardSourceLabel: renderers.getSourceLabel,
    getSessionPlannerPlayerBoardSquadStatusPriority: renderers.getSquadStatusPriority,
    getSessionPlannerTacticalEndpointCoordinates: delegates.getSessionPlannerTacticalEndpointCoordinates,
    isCurrentPlatformUserAdmin: deps.isCurrentPlatformUserAdmin,
    isMedicalPlayerBlockedBySquadAvailability: deps.isMedicalPlayerBlockedBySquadAvailability,
    isSessionPlannerLibraryExerciseArchived: library.isSessionPlannerLibraryExerciseArchived,
    isSessionPlannerLibraryFolderArchived: library.isSessionPlannerLibraryFolderArchived,
    isSessionPlannerTacticalGoalType: tactical.isTacticalGoalType,
    isSessionPlannerTacticalPlayerType: tactical.isTacticalPlayerType,
    isTemporaryPlayerProfile: deps.isTemporaryPlayerProfile,
    markSessionPlannerBlockDeleted: stateMerge.markSessionPlannerBlockDeleted,
    markSessionPlannerBlockFieldsUpdated: stateMerge.markSessionPlannerBlockFieldsUpdated,
    medicalAvailabilitySelectors: deps.medicalAvailabilitySelectors,
    normalizePlayerProfileRole: deps.normalizePlayerProfileRole,
    normalizeSessionPlannerLibraryFolderExerciseIds: library.normalizeSessionPlannerLibraryFolderExerciseIds,
    normalizeSessionPlannerPlayerBoardAutoMode: renderers.normalizeAutoMode,
    normalizeSessionPlannerPlayerBoardColors: renderers.normalizePlayerBoardColors,
    normalizeSessionPlannerPlayerBoardCustomPeople: renderers.normalizePlayerBoardCustomPeople,
    normalizeSessionPlannerPlayerBoardFormationValue: renderers.normalizeFormationValue,
    normalizeSessionPlannerPlayerBoardPositions: renderers.normalizePlayerBoardPositions,
    normalizeSessionPlannerPlayerBoardProfileKey: renderers.normalizeProfileKey,
    normalizeSessionPlannerPlayerBoardTeamCount: renderers.normalizeTeamCount,
    normalizeSessionPlannerTacticalActiveFrameId: tactical.normalizeTacticalActiveFrameId,
    normalizeSessionPlannerTacticalFrames: tactical.normalizeTacticalFrames,
    normalizeSessionPlannerTacticalPitchMode: tactical.normalizeTacticalPitchMode,
    normalizeSessionPlannerTacticalPlayerBadge: tactical.normalizeTacticalPlayerBadge,
    normalizeTacticalColor: tactical.normalizeTacticalColor,
    normalizeTacticalLineStyle: tactical.normalizeTacticalLineStyle,
    normalizeTacticalLineWidth: tactical.normalizeTacticalLineWidth,
    normalizeTacticalRotation: tactical.normalizeTacticalRotation,
    parseScheduleDateValue: deps.parseScheduleDateValue,
    parseSessionPlannerPlayerBoardFormation: renderers.parseFormation,
    playerProfileRoleOptions: deps.playerProfileRoleOptions,
    queueCentralStateWrite: deps.queueCentralStateWrite,
    rawDataSafetySetItem: deps.rawDataSafetySetItem,
    readSessionPlannerState: stateService.readState,
    readSessionPlannerStatePreservingUiSelection: deps.readSessionPlannerStatePreservingUiSelection,
    renderSessionPlannerToast: deps.renderSessionPlannerToast,
    sessionPlannerAutosaveBoundary: deps.sessionPlannerAutosaveBoundary,
    sessionPlannerBlockMergeFields: deps.sessionPlannerBlockMergeFields,
    sessionPlannerMedicalAvailabilitySelectors: renderers.sessionPlannerMedicalAvailabilitySelectors,
    sessionPlannerPlayerBoardAutoModeOptions: deps.sessionPlannerPlayerBoardAutoModeOptions,
    sessionPlannerPlayerBoardColorOptions: deps.sessionPlannerPlayerBoardColorOptions,
    sessionPlannerPlayerBoardMaxTeamCount: deps.sessionPlannerPlayerBoardMaxTeamCount,
    sessionPlannerPrintPaperOptions: deps.sessionPlannerPrintPaperOptions,
    sessionPlannerPrintRenderer: renderers.sessionPlannerPrintRenderer,
    sessionPlannerPrintSectionOptions: deps.sessionPlannerPrintSectionOptions,
    sessionPlannerStorageKey: deps.sessionPlannerStorageKey,
    sessionPlannerTacticalMaxFrames: deps.sessionPlannerTacticalMaxFrames,
    sessionPlannerTacticalSnapStep: deps.sessionPlannerTacticalSnapStep,
    sessionPlannerVisualRenderer: renderers.sessionPlannerVisualRenderer,
    sessionPlannerWorkspaceRenderer: renderers.sessionPlannerWorkspaceRenderer,
    setSessionPlannerExerciseLibrary: deps.setSessionPlannerExerciseLibrary,
    setPlatformAutosaveStatusForKey: deps.setPlatformAutosaveStatusForKey,
    showSessionPlannerToast,
    syncSessionPlannerBoardHistoryBaseline: boardHistory.syncBaseline,
    ui: deps.ui,
    undoSessionPlannerBoardHistory: boardHistory.undo,
    win: deps.win,
    writeSessionPlannerExerciseLibraryToStorage: library.writeSessionPlannerExerciseLibraryToStorage,
    writeSessionPlannerState,
    getSessionPlannerPeriodizationBridge: deps.getSessionPlannerPeriodizationBridge,
    getLocalState: () => ({
      ...localUiState.getState(),
      sessionPlannerState: getSessionPlannerState(),
    }),
    setLocalState: (patch = {}) => {
      if (Object.prototype.hasOwnProperty.call(patch, "sessionPlannerState")) {
        deps.setSessionPlannerState?.(patch.sessionPlannerState);
      }
      localUiState.applyPatch(patch);
    },
  });

  return {
    boardHistory,
    stateService,
    workspaceController,
  };
}
