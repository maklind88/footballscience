const hasOwn = (source, key) => Object.prototype.hasOwnProperty.call(source, key);

const exerciseLibraryUiStateMap = Object.freeze({
  open: "sessionPlannerLibraryOpen",
  selectedFolderId: "sessionPlannerLibrarySelectedFolderId",
  editExerciseId: "sessionPlannerLibraryEditExerciseId",
  viewExerciseId: "sessionPlannerLibraryViewExerciseId",
  editingFolderId: "sessionPlannerLibraryEditingFolderId",
  archiveView: "sessionPlannerLibraryArchiveView",
  filterOpen: "sessionPlannerLibraryFilterOpen",
  searchQuery: "sessionPlannerLibrarySearchQuery",
  sortMode: "sessionPlannerLibrarySortMode",
  pendingSave: "sessionPlannerPendingLibrarySave",
  phaseFilter: "sessionPlannerLibraryPhaseFilter",
  subPhaseFilter: "sessionPlannerLibrarySubPhaseFilter",
  phaseFilters: "sessionPlannerLibraryPhaseFilters",
  subPhaseFilters: "sessionPlannerLibrarySubPhaseFilters",
});

export function createExerciseLibraryUiStateBridge(options = {}) {
  const getLocalState = typeof options.getLocalState === "function" ? options.getLocalState : () => ({});
  const applyLocalPatch = typeof options.applyLocalPatch === "function" ? options.applyLocalPatch : () => {};

  function readLocalValue(uiKey) {
    const localKey = exerciseLibraryUiStateMap[uiKey];
    return getLocalState()?.[localKey];
  }

  function getUiState() {
    return Object.fromEntries(
      Object.keys(exerciseLibraryUiStateMap).map((uiKey) => [uiKey, readLocalValue(uiKey)])
    );
  }

  function setUiState(nextState = {}) {
    if (!nextState || typeof nextState !== "object") {
      return;
    }
    const patch = {};
    Object.entries(exerciseLibraryUiStateMap).forEach(([uiKey, localKey]) => {
      if (hasOwn(nextState, uiKey)) {
        patch[localKey] = uiKey === "open" ? Boolean(nextState[uiKey]) : nextState[uiKey];
      }
    });
    applyLocalPatch(patch);
  }

  return Object.freeze({
    getUiState,
    setUiState,
  });
}
