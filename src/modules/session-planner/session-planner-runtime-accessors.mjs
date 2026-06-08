import { sessionPlannerRuntimeDelegateMethodNames } from "./session-planner-runtime-delegates.mjs";

let getSessionPlannerRuntimeAccessorSources = () => ({});

export const sessionPlannerRuntimeAccessorNames = Object.freeze([
  ...sessionPlannerRuntimeDelegateMethodNames,
  "renderSessionPlannerToast",
  "showSessionPlannerToast",
  "commitSessionPlannerExerciseToLibrary",
  "queueSessionPlannerLibrarySaveConflict",
  "resolveSessionPlannerLibrarySaveConflict",
  "saveSelectedSessionPlannerExerciseToLibrary",
  "deleteSessionPlannerLibraryExercise",
  "restoreSessionPlannerLibraryExercise",
  "createSessionPlannerDefaultSession",
  "createSessionPlannerEmptySession",
  "getSessionPlannerPeriodizationOverride",
  "isSessionPlannerOffDate",
  "createSessionPlannerSessionForNewPlan",
  "isGeneratedDefaultSessionPlannerSession",
  "shouldStripSessionPlannerGeneratedDefaultSession",
  "shouldClearSessionPlannerSessionForDate",
  "cloneSessionPlannerSession",
  "createSessionPlannerDefaultState",
  "parseSessionPlannerBlockReductionGuardTime",
  "normalizeSessionPlannerBlockReductionGuard",
  "canReduceSessionPlannerBlocksForDate",
  "normalizeSessionPlannerBlockDeletionTombstones",
  "markSessionPlannerBlockReductionAllowed",
  "markSessionPlannerBlockDeleted",
  "applySessionPlannerBlockReductionGuard",
  "applySessionPlannerBlockDeletionTombstones",
  "getSessionPlannerDeletedBlockIds",
  "cloneSessionPlannerBlockMergeValue",
  "isSessionPlannerBlockFieldEmptyValue",
  "getSessionPlannerBlockFieldUpdatedAtMs",
  "markSessionPlannerBlockFieldsUpdated",
  "mergeSessionPlannerBlockForWrite",
  "filterSessionPlannerDeletedBlocksForWrite",
  "mergeSessionPlannerSessionForWrite",
  "cloneSessionPlannerState",
  "mergeSessionPlannerStateForWrite",
  "mergeSessionPlannerStateFromBackup",
  "assignSessionPlannerBlockFieldValue",
  "syncSelectedSessionPlannerBlockFieldsFromDom",
  "readSessionPlannerState",
  "persistNormalizedSessionPlannerState",
  "findSessionPlannerStateInSnapshots",
  "queueSessionPlannerSnapshotRecovery",
  "writeSessionPlannerState",
]);

export function configureSessionPlannerRuntimeAccessors(sourceResolver) {
  if (typeof sourceResolver !== "function") {
    throw new TypeError("Session planner runtime accessors require a source resolver.");
  }
  getSessionPlannerRuntimeAccessorSources = sourceResolver;
}

function getAccessorSource(sourceName, methodName) {
  const sources = getSessionPlannerRuntimeAccessorSources() || {};
  const source = sources[sourceName];
  if (!source || typeof source !== "object") {
    throw new TypeError("Session planner runtime accessor source " + sourceName + " is missing for " + methodName + ".");
  }
  return source;
}

function callAccessorSource(sourceName, methodName, args) {
  const source = getAccessorSource(sourceName, methodName);
  const method = source[methodName];
  if (typeof method !== "function") {
    throw new TypeError("Session planner runtime accessor source " + sourceName + " is missing " + methodName + ".");
  }
  return method.apply(source, args);
}

function getDefaultDateValue() {
  const sources = getSessionPlannerRuntimeAccessorSources() || {};
  return typeof sources.getDefaultDateValue === "function" ? sources.getDefaultDateValue() : "";
}

const delegateAccessors = Object.freeze(Object.fromEntries(sessionPlannerRuntimeDelegateMethodNames.map((methodName) => [
  methodName,
  (...args) => callAccessorSource("runtimeDelegates", methodName, args),
])));

export const {
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
} = delegateAccessors;

export function renderSessionPlannerToast() { return callAccessorSource("toastController", "render", []); }
export function showSessionPlannerToast(message, tone = "success") { return callAccessorSource("toastController", "show", [message, tone]); }

export function commitSessionPlannerExerciseToLibrary(exercise, mode = "new", existingExerciseId = "") { return callAccessorSource("exerciseLibraryActions", "commitExercise", [exercise, mode, existingExerciseId]); }
export function queueSessionPlannerLibrarySaveConflict(exercise, existingExercise) { return callAccessorSource("exerciseLibraryActions", "queueSaveConflict", [exercise, existingExercise]); }
export function resolveSessionPlannerLibrarySaveConflict(action) { return callAccessorSource("exerciseLibraryActions", "resolveSaveConflict", [action]); }
export function saveSelectedSessionPlannerExerciseToLibrary() { return callAccessorSource("exerciseLibraryActions", "saveSelectedExercise", []); }
export function deleteSessionPlannerLibraryExercise(exerciseId) { return callAccessorSource("exerciseLibraryActions", "archiveExercise", [exerciseId]); }
export function restoreSessionPlannerLibraryExercise(exerciseId) { return callAccessorSource("exerciseLibraryActions", "restoreExercise", [exerciseId]); }

export function createSessionPlannerDefaultSession(dateValue = getDefaultDateValue()) { return callAccessorSource("sessionFactory", "createDefaultSession", [dateValue]); }
export function createSessionPlannerEmptySession(dateValue = getDefaultDateValue()) { return callAccessorSource("sessionFactory", "createEmptySession", [dateValue]); }
export function getSessionPlannerPeriodizationOverride(dateValue) { return callAccessorSource("sessionFactory", "getPeriodizationOverride", [dateValue]); }
export function isSessionPlannerOffDate(dateValue) { return callAccessorSource("sessionFactory", "isOffDate", [dateValue]); }
export function createSessionPlannerSessionForNewPlan(dateValue = getDefaultDateValue()) { return callAccessorSource("sessionFactory", "createSessionForNewPlan", [dateValue]); }
export function isGeneratedDefaultSessionPlannerSession(session = {}) { return callAccessorSource("sessionFactory", "isGeneratedDefaultSession", [session]); }
export function shouldStripSessionPlannerGeneratedDefaultSession(dateValue, session = {}) { return callAccessorSource("sessionFactory", "shouldStripGeneratedDefaultSession", [dateValue, session]); }
export function shouldClearSessionPlannerSessionForDate(dateValue, session = {}) { return callAccessorSource("sessionFactory", "shouldClearSessionForDate", [dateValue, session]); }

export function cloneSessionPlannerSession(...args) { return callAccessorSource("stateMergeHelpers", "cloneSessionPlannerSession", args); }
export function createSessionPlannerDefaultState(...args) { return callAccessorSource("stateMergeHelpers", "createSessionPlannerDefaultState", args); }
export function parseSessionPlannerBlockReductionGuardTime(...args) { return callAccessorSource("stateMergeHelpers", "parseSessionPlannerBlockReductionGuardTime", args); }
export function normalizeSessionPlannerBlockReductionGuard(...args) { return callAccessorSource("stateMergeHelpers", "normalizeSessionPlannerBlockReductionGuard", args); }
export function canReduceSessionPlannerBlocksForDate(...args) { return callAccessorSource("stateMergeHelpers", "canReduceSessionPlannerBlocksForDate", args); }
export function normalizeSessionPlannerBlockDeletionTombstones(...args) { return callAccessorSource("stateMergeHelpers", "normalizeSessionPlannerBlockDeletionTombstones", args); }
export function markSessionPlannerBlockReductionAllowed(...args) { return callAccessorSource("stateMergeHelpers", "markSessionPlannerBlockReductionAllowed", args); }
export function markSessionPlannerBlockDeleted(...args) { return callAccessorSource("stateMergeHelpers", "markSessionPlannerBlockDeleted", args); }
export function applySessionPlannerBlockReductionGuard(...args) { return callAccessorSource("stateMergeHelpers", "applySessionPlannerBlockReductionGuard", args); }
export function applySessionPlannerBlockDeletionTombstones(...args) { return callAccessorSource("stateMergeHelpers", "applySessionPlannerBlockDeletionTombstones", args); }
export function getSessionPlannerDeletedBlockIds(...args) { return callAccessorSource("stateMergeHelpers", "getSessionPlannerDeletedBlockIds", args); }
export function cloneSessionPlannerBlockMergeValue(...args) { return callAccessorSource("stateMergeHelpers", "cloneSessionPlannerBlockMergeValue", args); }
export function isSessionPlannerBlockFieldEmptyValue(...args) { return callAccessorSource("stateMergeHelpers", "isSessionPlannerBlockFieldEmptyValue", args); }
export function getSessionPlannerBlockFieldUpdatedAtMs(...args) { return callAccessorSource("stateMergeHelpers", "getSessionPlannerBlockFieldUpdatedAtMs", args); }
export function markSessionPlannerBlockFieldsUpdated(...args) { return callAccessorSource("stateMergeHelpers", "markSessionPlannerBlockFieldsUpdated", args); }
export function mergeSessionPlannerBlockForWrite(...args) { return callAccessorSource("stateMergeHelpers", "mergeSessionPlannerBlockForWrite", args); }
export function filterSessionPlannerDeletedBlocksForWrite(...args) { return callAccessorSource("stateMergeHelpers", "filterSessionPlannerDeletedBlocksForWrite", args); }
export function mergeSessionPlannerSessionForWrite(...args) { return callAccessorSource("stateMergeHelpers", "mergeSessionPlannerSessionForWrite", args); }
export function cloneSessionPlannerState(...args) { return callAccessorSource("stateMergeHelpers", "cloneSessionPlannerState", args); }
export function mergeSessionPlannerStateForWrite(...args) { return callAccessorSource("stateMergeHelpers", "mergeSessionPlannerStateForWrite", args); }
export function mergeSessionPlannerStateFromBackup(...args) { return callAccessorSource("stateMergeHelpers", "mergeSessionPlannerStateFromBackup", args); }

export function assignSessionPlannerBlockFieldValue(...args) { return callAccessorSource("runtimeStateService", "assignBlockFieldValue", args); }
export function syncSelectedSessionPlannerBlockFieldsFromDom(...args) { return callAccessorSource("runtimeStateService", "syncSelectedBlockFieldsFromDom", args); }
export function readSessionPlannerState(...args) { return callAccessorSource("runtimeStateService", "readState", args); }
export function persistNormalizedSessionPlannerState(...args) { return callAccessorSource("runtimeStateService", "persistNormalizedState", args); }
export function findSessionPlannerStateInSnapshots(...args) { return callAccessorSource("runtimeStateService", "findStateInSnapshots", args); }
export function queueSessionPlannerSnapshotRecovery(...args) { return callAccessorSource("runtimeStateService", "queueSnapshotRecovery", args); }
export function writeSessionPlannerState(...args) { return callAccessorSource("runtimeStateService", "writeState", args); }
