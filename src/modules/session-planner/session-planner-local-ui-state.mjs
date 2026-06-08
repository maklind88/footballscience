const hasOwn = (source, key) => Object.prototype.hasOwnProperty.call(source, key);

export function createSessionPlannerLocalUiState(options = {}) {
  const printSectionOptions = Array.isArray(options.printSectionOptions) ? options.printSectionOptions : [];
  const state = {
    sessionPlannerAddMenuOpen: false,
    sessionPlannerCentralSyncConflict: null,
    sessionPlannerDraggedBlockId: "",
    sessionPlannerDraggedLibraryExerciseId: "",
    sessionPlannerHistoryEntries: [],
    sessionPlannerHistoryLoadedDate: "",
    sessionPlannerHistoryLoadError: "",
    sessionPlannerHistoryLoading: false,
    sessionPlannerHistoryOpen: false,
    sessionPlannerLibraryArchiveView: "active",
    sessionPlannerLibraryEditExerciseId: "",
    sessionPlannerLibraryEditingFolderId: "",
    sessionPlannerLibraryFilterOpen: "",
    sessionPlannerLibraryOpen: false,
    sessionPlannerLibraryPhaseFilter: "all",
    sessionPlannerLibraryPhaseFilters: [],
    sessionPlannerLibraryPointerDrag: null,
    sessionPlannerLibrarySearchQuery: "",
    sessionPlannerLibrarySelectedFolderId: "all",
    sessionPlannerLibrarySortMode: "updated",
    sessionPlannerLibrarySubPhaseFilter: "all",
    sessionPlannerLibrarySubPhaseFilters: [],
    sessionPlannerLibrarySuppressNextClick: false,
    sessionPlannerLibraryViewExerciseId: "",
    sessionPlannerPendingLibrarySave: null,
    sessionPlannerPlayerBoardAssistantOpen: false,
    sessionPlannerPlayerBoardAutoMode: "balanced",
    sessionPlannerPlayerBoardCustomPersonEditor: null,
    sessionPlannerPlayerBoardDragState: null,
    sessionPlannerPlayerBoardFormationInput: "",
    sessionPlannerPlayerBoardOpen: false,
    sessionPlannerPlayerBoardSelectedPlayerId: "",
    sessionPlannerPlayerBoardSelectedPlayerIds: [],
    sessionPlannerPlayerBoardSelectionState: null,
    sessionPlannerPlayerBoardTeamCount: 2,
    sessionPlannerPrintOverlayOpen: false,
    sessionPlannerPrintPaper: "letter",
    sessionPlannerPrintRootElement: null,
    sessionPlannerPrintSections: Object.fromEntries(printSectionOptions.map((option) => [option.key, true])),
    sessionPlannerState: null,
    sessionPlannerTacticalClipboard: [],
    sessionPlannerTacticalClipboardPasteCount: 0,
    sessionPlannerTacticalColor: "#0d4f86",
    sessionPlannerTacticalDraftLineState: null,
    sessionPlannerTacticalDragState: null,
    sessionPlannerTacticalFreehandState: null,
    sessionPlannerTacticalLastPlacement: null,
    sessionPlannerTacticalLastPlacementClick: null,
    sessionPlannerTacticalLineStyle: "solid",
    sessionPlannerTacticalLineWidth: 1.1,
    sessionPlannerTacticalNumberPickerElementId: "",
    sessionPlannerTacticalPendingPoint: null,
    sessionPlannerTacticalSelectedElementId: "",
    sessionPlannerTacticalSelectedElementIds: [],
    sessionPlannerTacticalSelectionState: null,
    sessionPlannerTacticalSnapEnabled: false,
    sessionPlannerTacticalSuppressNextClick: false,
    sessionPlannerTacticalSuppressNextClickAt: 0,
    sessionPlannerTacticalTool: "blue-player",
    sessionPlannerTacticalboardOpen: false,
    sessionPlannerToastMessage: "",
    sessionPlannerToastTimeoutId: null,
    sessionPlannerToastTone: "success",
    sessionPlannerVisualPreviewOpen: false,
  };
  const keys = new Set(Object.keys(state));

  return {
    state,
    getState() {
      return state;
    },
    applyPatch(patch = {}) {
      if (!patch || typeof patch !== "object") return;
      keys.forEach((key) => {
        if (hasOwn(patch, key)) {
          state[key] = patch[key];
        }
      });
    },
  };
}
