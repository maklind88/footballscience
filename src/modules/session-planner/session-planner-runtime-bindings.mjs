import { bindSessionPlannerTacticalShortcutController, bindSessionPlannerWorkspaceKeydownController } from "./session-planner-shortcuts-controller.mjs";
import { bindSessionPlannerWorkspaceClickController } from "./session-planner-workspace-click-controller.mjs";
import { bindSessionPlannerWorkspaceDragPointerController } from "./session-planner-workspace-drag-pointer-controller.mjs";
import { bindSessionPlannerWorkspaceFormController } from "./session-planner-workspace-form-controller.mjs";
import { bindSessionPlannerWorkspaceInputChangeController } from "./session-planner-workspace-input-change-controller.mjs";

function getLocalState(localUiState = {}) {
  return localUiState.state && typeof localUiState.state === "object" ? localUiState.state : localUiState;
}

function setLocalStateValue(localUiState, key, value) {
  getLocalState(localUiState)[key] = value;
}

function callOptional(target, methodName, ...args) {
  const method = target?.[methodName];
  return typeof method === "function" ? method(...args) : undefined;
}

export function bindSessionPlannerRuntimeBindings(deps = {}) {
  const {
    canEditSessionPlanner = () => false,
    boardHistory = {},
    exerciseLibrary = {},
    exerciseLibraryActions = {},
    getMultiSelectOpenField = () => "",
    getSelectedDate = () => "",
    localUiState = {},
    normalizers = {},
    periodizationBridge = {},
    runtimeDelegates = {},
    setMultiSelectOpenField = () => {},
    win = globalThis,
    workspaceElement = null,
  } = deps;
  const state = getLocalState(localUiState);
  const {
    cleanPlayerBoardFormationInput = (value) => value,
    normalizePlayerBoardAutoMode = (value) => value,
    normalizePlayerBoardFormationValue = (value) => value,
    normalizePlayerBoardTeamCount = (value) => value,
    normalizeTacticalColor = (value) => value,
    normalizeTacticalLineWidth = (value) => value,
  } = normalizers;

  const controllers = {};

  controllers.click = bindSessionPlannerWorkspaceClickController({
    workspaceElement,
    getSuppressNextClick: () => state.sessionPlannerLibrarySuppressNextClick,
    setSuppressNextClick: (value) => setLocalStateValue(localUiState, "sessionPlannerLibrarySuppressNextClick", value),
    handlePeriodizationClick: (event) => callOptional(periodizationBridge, "handleClick", event),
    closeLibrary: runtimeDelegates.closeSessionPlannerLibrary,
    resolveLibrarySaveConflict: (action) => callOptional(exerciseLibraryActions, "resolveSaveConflict", action),
    resolveCentralSyncConflict: runtimeDelegates.resolveSessionPlannerCentralSyncConflict,
    setVisualPreviewOpen: runtimeDelegates.setSessionPlannerVisualPreviewOpen,
    setPrintOverlayOpen: runtimeDelegates.setSessionPlannerPrintOverlayOpen,
    printCurrentSession: runtimeDelegates.printSessionPlannerCurrentSession,
    setTacticalboardOpen: runtimeDelegates.setSessionPlannerTacticalboardOpen,
    updateTacticalPlayerNumber: runtimeDelegates.updateSessionPlannerTacticalPlayerNumber,
    closePlayerBoardProfile: runtimeDelegates.closeSessionPlannerPlayerBoardProfile,
    setPlayerBoardAssistantOpen: (open) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardAssistantOpen", open),
    setPlayerBoardSelectedPlayerId: (playerId) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardSelectedPlayerId", playerId),
    renderWorkspace: runtimeDelegates.renderSessionPlannerWorkspace,
    openPlayerBoardProfile: runtimeDelegates.openSessionPlannerPlayerBoardProfile,
    applySelectionAssistant: runtimeDelegates.applySessionPlannerSelectionAssistant,
    normalizePlayerBoardFormationValue,
    setPlayerBoardFormationInput: (formationInput) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardFormationInput", formationInput),
    applyPlayerBoardFormation: runtimeDelegates.applySessionPlannerPlayerBoardFormation,
    updatePlayerBoardSelectedColor: runtimeDelegates.updateSessionPlannerPlayerBoardSelectedColor,
    resetPlayerBoardPositions: runtimeDelegates.resetSessionPlannerPlayerBoardPositions,
    clearPlayerBoardSelectedColors: runtimeDelegates.clearSessionPlannerPlayerBoardSelectedColors,
    closePlayerBoardCustomPersonEditor: runtimeDelegates.closeSessionPlannerPlayerBoardCustomPersonEditor,
    clearPlayerBoardCustomPersonEditor: () => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardCustomPersonEditor", null),
    removePlayerBoardCustomPerson: runtimeDelegates.removeSessionPlannerPlayerBoardCustomPerson,
    setPlayerBoardOpen: runtimeDelegates.setSessionPlannerPlayerBoardOpen,
    selectTacticalFrame: runtimeDelegates.selectSessionPlannerTacticalFrame,
    addTacticalFrame: runtimeDelegates.addSessionPlannerTacticalFrame,
    duplicateTacticalFrame: runtimeDelegates.duplicateSessionPlannerTacticalFrame,
    deleteTacticalFrame: runtimeDelegates.deleteSessionPlannerTacticalFrame,
    arrangeTacticalElements: runtimeDelegates.arrangeSelectedSessionPlannerTacticalElements,
    setTacticalTool: runtimeDelegates.setSessionPlannerTacticalTool,
    clearTacticalBoard: runtimeDelegates.clearSelectedSessionPlannerTacticalBoard,
    undoBoardHistory: boardHistory.undo,
    redoBoardHistory: boardHistory.redo,
    copySelectedTacticalElements: runtimeDelegates.copySelectedSessionPlannerTacticalElements,
    pasteTacticalClipboard: runtimeDelegates.pasteSessionPlannerTacticalClipboard,
    removeSelectedTacticalElement: runtimeDelegates.removeSelectedSessionPlannerTacticalElement,
    handleTacticalCanvasClick: runtimeDelegates.handleSessionPlannerTacticalCanvasClick,
    getHistoryOpen: () => state.sessionPlannerHistoryOpen,
    setHistoryOpen: (open) => setLocalStateValue(localUiState, "sessionPlannerHistoryOpen", open),
    getSelectedDate,
    loadHistory: runtimeDelegates.loadSessionPlannerHistory,
    restoreHistoryEntry: runtimeDelegates.restoreSessionPlannerHistoryEntry,
    setLibraryOpen: runtimeDelegates.setSessionPlannerLibraryOpen,
    selectLibraryFolder: exerciseLibrary.selectSessionPlannerLibraryFolder,
    archiveLibraryFolder: exerciseLibrary.archiveSessionPlannerExerciseLibraryFolder,
    startLibraryFolderEdit: exerciseLibrary.startSessionPlannerExerciseLibraryFolderEdit,
    cancelLibraryFolderEdit: exerciseLibrary.cancelSessionPlannerExerciseLibraryFolderEdit,
    restoreLibraryFolder: exerciseLibrary.restoreSessionPlannerExerciseLibraryFolder,
    saveSelectedExerciseToLibrary: () => callOptional(exerciseLibraryActions, "saveSelectedExercise"),
    getMultiSelectOpenField,
    setMultiSelectOpenField,
    refreshMultiSelectFields: exerciseLibrary.refreshSessionPlannerMultiSelectFields,
    toggleMultiSelectValue: exerciseLibrary.toggleSessionPlannerMultiSelectValue,
    clearMultiSelectValue: exerciseLibrary.clearSessionPlannerMultiSelectValue,
    jumpToToday: runtimeDelegates.jumpSessionPlannerToToday,
    scrollDateStrip: runtimeDelegates.scrollSessionPlannerDateStrip,
    selectDate: runtimeDelegates.selectSessionPlannerDate,
    moveBlock: runtimeDelegates.moveSessionPlannerBlock,
    deleteBlock: runtimeDelegates.deleteSessionPlannerBlock,
    selectBlock: runtimeDelegates.selectSessionPlannerBlock,
    getAddMenuOpen: () => state.sessionPlannerAddMenuOpen,
    setAddMenuOpen: runtimeDelegates.setSessionPlannerAddMenuOpen,
    addBlock: runtimeDelegates.addSessionPlannerBlock,
    applyExercise: runtimeDelegates.applySessionPlannerExercise,
    duplicateLibraryExercise: exerciseLibrary.duplicateSessionPlannerLibraryExercise,
    startLibraryExerciseView: exerciseLibrary.startSessionPlannerLibraryExerciseView,
    startLibraryExerciseEdit: exerciseLibrary.startSessionPlannerLibraryExerciseEdit,
    updateLibraryExerciseFromEdit: exerciseLibrary.updateSessionPlannerLibraryExerciseFromEdit,
    saveLibraryExerciseEditAsCopy: exerciseLibrary.saveSessionPlannerLibraryExerciseEditAsCopy,
    cancelLibraryExerciseEdit: exerciseLibrary.cancelSessionPlannerLibraryExerciseEdit,
    closeLibraryExerciseView: exerciseLibrary.closeSessionPlannerLibraryExerciseView,
    deleteLibraryExercise: (exerciseId) => callOptional(exerciseLibraryActions, "archiveExercise", exerciseId),
    restoreLibraryExercise: (exerciseId) => callOptional(exerciseLibraryActions, "restoreExercise", exerciseId),
    removeExerciseFromLibraryFolder: exerciseLibrary.removeSessionPlannerExerciseFromLibraryFolder,
    toggleLibraryFilterOpen: exerciseLibrary.toggleSessionPlannerLibraryFilterOpen,
    toggleLibraryFilterValue: exerciseLibrary.toggleSessionPlannerLibraryFilterValue,
    clearLibraryFilter: exerciseLibrary.clearSessionPlannerLibraryFilter,
    updateLibraryArchiveView: exerciseLibrary.updateSessionPlannerLibraryArchiveView,
  });

  controllers.form = bindSessionPlannerWorkspaceFormController({
    workspaceElement,
    openPlayerBoardProfile: runtimeDelegates.openSessionPlannerPlayerBoardProfile,
    handleTacticalCanvasDoubleClick: runtimeDelegates.handleSessionPlannerTacticalCanvasDoubleClick,
    handlePlayerBoardContextMenu: runtimeDelegates.handleSessionPlannerPlayerBoardContextMenu,
    updateExerciseLibraryFolderFromForm: exerciseLibrary.updateSessionPlannerExerciseLibraryFolderFromForm,
    createExerciseLibraryFolderFromForm: exerciseLibrary.createSessionPlannerExerciseLibraryFolderFromForm,
    savePlayerBoardCustomPersonFromForm: runtimeDelegates.saveSessionPlannerPlayerBoardCustomPersonFromForm,
    normalizePlayerBoardTeamCount,
    normalizePlayerBoardAutoMode,
    normalizePlayerBoardFormationValue,
    setPlayerBoardTeamCount: (teamCount) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardTeamCount", teamCount),
    setPlayerBoardAutoMode: (autoMode) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardAutoMode", autoMode),
    setPlayerBoardFormationInput: (formationInput) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardFormationInput", formationInput),
    applyPlayerBoardAutoSelect: runtimeDelegates.applySessionPlannerPlayerBoardAutoSelect,
    copyPlayerBoardTeamsFromBlock: runtimeDelegates.copySessionPlannerPlayerBoardTeamsFromBlock,
    applyPlayerBoardFormation: runtimeDelegates.applySessionPlannerPlayerBoardFormation,
  });

  controllers.dragPointer = bindSessionPlannerWorkspaceDragPointerController({
    workspaceElement,
    win,
    canEditSessionPlanner,
    getDraggedLibraryExerciseId: () => state.sessionPlannerDraggedLibraryExerciseId,
    setDraggedLibraryExerciseId: (exerciseId) => setLocalStateValue(localUiState, "sessionPlannerDraggedLibraryExerciseId", exerciseId),
    getDraggedBlockId: () => state.sessionPlannerDraggedBlockId,
    setDraggedBlockId: (blockId) => setLocalStateValue(localUiState, "sessionPlannerDraggedBlockId", blockId),
    getBlockDropPlacement: runtimeDelegates.getSessionPlannerBlockDropPlacement,
    addExerciseToLibraryFolder: exerciseLibrary.addSessionPlannerExerciseToLibraryFolder,
    clearBlockDragState: runtimeDelegates.clearSessionPlannerBlockDragState,
    clearLibraryDragState: runtimeDelegates.clearSessionPlannerLibraryDragState,
    reorderBlock: runtimeDelegates.reorderSessionPlannerBlock,
    startLibraryPointerDrag: runtimeDelegates.startSessionPlannerLibraryPointerDrag,
    updateLibraryPointerDrag: runtimeDelegates.updateSessionPlannerLibraryPointerDrag,
    finishLibraryPointerDrag: runtimeDelegates.finishSessionPlannerLibraryPointerDrag,
    startPlayerBoardDrag: runtimeDelegates.startSessionPlannerPlayerBoardDrag,
    updatePlayerBoardDrag: runtimeDelegates.updateSessionPlannerPlayerBoardDrag,
    finishPlayerBoardDrag: runtimeDelegates.finishSessionPlannerPlayerBoardDrag,
    startPlayerBoardSelection: runtimeDelegates.startSessionPlannerPlayerBoardSelection,
    updatePlayerBoardSelection: runtimeDelegates.updateSessionPlannerPlayerBoardSelection,
    finishPlayerBoardSelection: runtimeDelegates.finishSessionPlannerPlayerBoardSelection,
    startTacticalDrag: runtimeDelegates.startSessionPlannerTacticalDrag,
    updateTacticalDrag: runtimeDelegates.updateSessionPlannerTacticalDrag,
    finishTacticalDrag: runtimeDelegates.finishSessionPlannerTacticalDrag,
  });

  controllers.inputChange = bindSessionPlannerWorkspaceInputChangeController({
    workspaceElement,
    cleanPlayerBoardFormationInput,
    setPlayerBoardFormationInput: (formationInput) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardFormationInput", formationInput),
    normalizeTacticalColor,
    getTacticalColor: () => state.sessionPlannerTacticalColor,
    setTacticalColor: (color) => setLocalStateValue(localUiState, "sessionPlannerTacticalColor", color),
    normalizeTacticalLineWidth,
    getTacticalLineWidth: () => state.sessionPlannerTacticalLineWidth,
    setTacticalLineWidth: (lineWidth) => setLocalStateValue(localUiState, "sessionPlannerTacticalLineWidth", lineWidth),
    getSelectedTacticalElementIds: runtimeDelegates.getSessionPlannerTacticalSelectedElementIds,
    getSelectedTacticalElements: runtimeDelegates.getSelectedSessionPlannerTacticalElements,
    isTacticalStrokeElement: runtimeDelegates.isSessionPlannerTacticalStrokeElement,
    updateSelectedTacticalElement: runtimeDelegates.updateSelectedSessionPlannerTacticalElement,
    updateTacticalLineStyle: runtimeDelegates.updateSessionPlannerTacticalLineStyle,
    handlePeriodizationInput: (event) => callOptional(periodizationBridge, "handleInput", event),
    handlePeriodizationChange: (event) => callOptional(periodizationBridge, "handleChange", event),
    updateLibrarySearch: exerciseLibrary.updateSessionPlannerLibrarySearch,
    updateSelectedBlockField: runtimeDelegates.updateSelectedSessionPlannerBlockField,
    resizeTextarea: runtimeDelegates.resizeSessionPlannerTextarea,
    updatePlayerBoardSelectedColor: runtimeDelegates.updateSessionPlannerPlayerBoardSelectedColor,
    normalizePlayerBoardTeamCount,
    setPlayerBoardTeamCount: (teamCount) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardTeamCount", teamCount),
    normalizePlayerBoardAutoMode,
    setPlayerBoardAutoMode: (autoMode) => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardAutoMode", autoMode),
    updatePrintPaper: runtimeDelegates.updateSessionPlannerPrintPaper,
    updatePrintSection: runtimeDelegates.updateSessionPlannerPrintSection,
    setTacticalPitchMode: runtimeDelegates.setSessionPlannerTacticalPitchMode,
    handleVisualUpload: runtimeDelegates.handleSessionPlannerVisualUpload,
    updateLibraryFilter: exerciseLibrary.updateSessionPlannerLibraryFilter,
    updateLibrarySortMode: exerciseLibrary.updateSessionPlannerLibrarySortMode,
    renderWorkspace: runtimeDelegates.renderSessionPlannerWorkspace,
  });

  controllers.tacticalShortcut = bindSessionPlannerTacticalShortcutController({
    clearPendingPoint: ({ clearSelection = false } = {}) => {
      state.sessionPlannerTacticalPendingPoint = null;
      state.sessionPlannerTacticalDraftLineState = null;
      if (clearSelection) {
        state.sessionPlannerTacticalSelectionState = null;
        callOptional(runtimeDelegates, "clearSessionPlannerTacticalSelection");
      }
      callOptional(runtimeDelegates, "refreshSessionPlannerTacticalboardCanvas");
    },
    copySelectedElements: runtimeDelegates.copySelectedSessionPlannerTacticalElements,
    getPendingPoint: () => state.sessionPlannerTacticalPendingPoint,
    getPlayerBadgeFromKeyboardEvent: deps.getPlayerBadgeFromKeyboardEvent || (() => ""),
    getSelectedElementIds: runtimeDelegates.getSessionPlannerTacticalSelectedElementIds,
    hasClipboard: () => (state.sessionPlannerTacticalClipboard || []).length > 0,
    isTacticalboardOpen: () => state.sessionPlannerTacticalboardOpen,
    pasteClipboard: runtimeDelegates.pasteSessionPlannerTacticalClipboard,
    removeSelectedElement: runtimeDelegates.removeSelectedSessionPlannerTacticalElement,
    updateSelectedPlayerBadges: runtimeDelegates.updateSelectedSessionPlannerTacticalPlayerBadges,
    undoSelectedBoardAction: runtimeDelegates.undoSelectedSessionPlannerTacticalBoardAction,
    win,
  });

  win?.addEventListener?.("afterprint", runtimeDelegates.removeSessionPlannerPrintRoot || (() => {}));

  controllers.keydown = bindSessionPlannerWorkspaceKeydownController({
    workspaceElement,
    isPlayerBoardOpen: () => state.sessionPlannerPlayerBoardOpen,
    isPlayerBoardAssistantOpen: () => state.sessionPlannerPlayerBoardAssistantOpen,
    closePlayerBoardAssistant: () => setLocalStateValue(localUiState, "sessionPlannerPlayerBoardAssistantOpen", false),
    hasPlayerBoardProfile: () => Boolean(state.sessionPlannerPlayerBoardSelectedPlayerId),
    closePlayerBoardProfile: runtimeDelegates.closeSessionPlannerPlayerBoardProfile,
    setPlayerBoardOpen: runtimeDelegates.setSessionPlannerPlayerBoardOpen,
    isPrintOverlayOpen: () => state.sessionPlannerPrintOverlayOpen,
    setPrintOverlayOpen: runtimeDelegates.setSessionPlannerPrintOverlayOpen,
    isTacticalboardOpen: () => state.sessionPlannerTacticalboardOpen,
    redoBoardHistory: boardHistory.redo,
    undoBoardHistory: boardHistory.undo,
    hasTacticalPendingPoint: () => Boolean(state.sessionPlannerTacticalPendingPoint),
    clearTacticalPendingPoint: ({ clearSelectionState = false } = {}) => {
      state.sessionPlannerTacticalPendingPoint = null;
      state.sessionPlannerTacticalDraftLineState = null;
      if (clearSelectionState) {
        state.sessionPlannerTacticalSelectionState = null;
      }
    },
    clearTacticalSelection: runtimeDelegates.clearSessionPlannerTacticalSelection,
    refreshTacticalboardCanvas: runtimeDelegates.refreshSessionPlannerTacticalboardCanvas,
    getSelectedTacticalElementIds: runtimeDelegates.getSessionPlannerTacticalSelectedElementIds,
    removeSelectedTacticalElement: runtimeDelegates.removeSelectedSessionPlannerTacticalElement,
    handlePeriodizationKeydown: (event) => callOptional(periodizationBridge, "handleKeydown", event),
  });

  return controllers;
}
