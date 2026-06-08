export function bindSessionPlannerWorkspaceClickController(deps = {}) {
  const {
    workspaceElement,
    getSuppressNextClick = () => false,
    setSuppressNextClick = () => {},
    handlePeriodizationClick = () => false,
    closeLibrary = () => {},
    resolveLibrarySaveConflict = () => {},
    resolveCentralSyncConflict = () => {},
    setVisualPreviewOpen = () => {},
    setPrintOverlayOpen = () => {},
    printCurrentSession = () => {},
    setTacticalboardOpen = () => {},
    updateTacticalPlayerNumber = () => {},
    closePlayerBoardProfile = () => {},
    setPlayerBoardAssistantOpen = () => {},
    setPlayerBoardSelectedPlayerId = () => {},
    renderWorkspace = () => {},
    openPlayerBoardProfile = () => {},
    applySelectionAssistant = () => {},
    normalizePlayerBoardFormationValue = (value) => value,
    setPlayerBoardFormationInput = () => {},
    applyPlayerBoardFormation = () => {},
    updatePlayerBoardSelectedColor = () => {},
    resetPlayerBoardPositions = () => {},
    clearPlayerBoardSelectedColors = () => {},
    closePlayerBoardCustomPersonEditor = () => {},
    clearPlayerBoardCustomPersonEditor = () => {},
    removePlayerBoardCustomPerson = () => {},
    setPlayerBoardOpen = () => {},
    selectTacticalFrame = () => {},
    addTacticalFrame = () => {},
    duplicateTacticalFrame = () => {},
    deleteTacticalFrame = () => {},
    arrangeTacticalElements = () => {},
    setTacticalTool = () => {},
    clearTacticalBoard = () => {},
    undoBoardHistory = () => {},
    redoBoardHistory = () => {},
    copySelectedTacticalElements = () => {},
    pasteTacticalClipboard = () => {},
    removeSelectedTacticalElement = () => {},
    handleTacticalCanvasClick = () => {},
    getHistoryOpen = () => false,
    setHistoryOpen = () => {},
    getSelectedDate = () => "",
    loadHistory = () => Promise.resolve(),
    restoreHistoryEntry = () => {},
    setLibraryOpen = () => {},
    selectLibraryFolder = () => {},
    archiveLibraryFolder = () => {},
    startLibraryFolderEdit = () => {},
    cancelLibraryFolderEdit = () => {},
    restoreLibraryFolder = () => {},
    saveSelectedExerciseToLibrary = () => {},
    getMultiSelectOpenField = () => "",
    setMultiSelectOpenField = () => {},
    refreshMultiSelectFields = () => {},
    toggleMultiSelectValue = () => {},
    clearMultiSelectValue = () => {},
    jumpToToday = () => {},
    scrollDateStrip = () => {},
    selectDate = () => {},
    moveBlock = () => {},
    deleteBlock = () => {},
    selectBlock = () => {},
    getAddMenuOpen = () => false,
    setAddMenuOpen = () => {},
    addBlock = () => {},
    applyExercise = () => {},
    duplicateLibraryExercise = () => {},
    startLibraryExerciseView = () => {},
    startLibraryExerciseEdit = () => {},
    updateLibraryExerciseFromEdit = () => {},
    saveLibraryExerciseEditAsCopy = () => {},
    cancelLibraryExerciseEdit = () => {},
    closeLibraryExerciseView = () => {},
    deleteLibraryExercise = () => {},
    restoreLibraryExercise = () => {},
    removeExerciseFromLibraryFolder = () => {},
    toggleLibraryFilterOpen = () => {},
    toggleLibraryFilterValue = () => {},
    clearLibraryFilter = () => {},
    updateLibraryArchiveView = () => {},
  } = deps;

  function closest(event, selector) {
    return event.target?.closest?.(selector) || null;
  }

  function matches(event, selector) {
    return Boolean(event.target?.matches?.(selector));
  }

  function callIfClosest(event, selector, callback) {
    const element = closest(event, selector);
    if (!element) return false;
    callback(element);
    return true;
  }

  function handleClick(event) {
    if (getSuppressNextClick()) {
      setSuppressNextClick(false);
      event.preventDefault();
      return;
    }
    if (handlePeriodizationClick(event)) return;
    if (matches(event, "[data-session-library-overlay]")) { closeLibrary(); return; }
    if (matches(event, "[data-session-save-conflict-overlay]")) { resolveLibrarySaveConflict("cancel"); return; }
    if (matches(event, "[data-session-central-conflict-overlay]")) { resolveCentralSyncConflict("keep-central"); return; }
    if (callIfClosest(event, "[data-session-save-conflict-action]", (el) => resolveLibrarySaveConflict(el.dataset.sessionSaveConflictAction))) return;
    if (callIfClosest(event, "[data-session-central-conflict-action]", (el) => resolveCentralSyncConflict(el.dataset.sessionCentralConflictAction))) return;
    if (matches(event, "[data-session-visual-preview-overlay]")) { setVisualPreviewOpen(false); return; }
    if (callIfClosest(event, "[data-session-close-visual-preview]", () => setVisualPreviewOpen(false))) return;
    if (matches(event, "[data-session-print-overlay]")) { setPrintOverlayOpen(false); return; }
    if (callIfClosest(event, "[data-session-close-print]", () => setPrintOverlayOpen(false))) return;
    if (callIfClosest(event, "[data-session-print-now]", () => printCurrentSession())) return;
    if (matches(event, "[data-session-tacticalboard-overlay]")) { setTacticalboardOpen(false); return; }
    if (callIfClosest(event, "[data-session-close-tacticalboard]", () => setTacticalboardOpen(false))) return;
    if (callIfClosest(event, "[data-session-tactical-number]", (el) => updateTacticalPlayerNumber(el.dataset.sessionTacticalNumberElement, el.dataset.sessionTacticalNumber))) return;
    if (matches(event, "[data-session-player-board-profile-overlay]")) { closePlayerBoardProfile(); return; }
    if (callIfClosest(event, "[data-session-close-player-board-profile]", () => closePlayerBoardProfile())) return;
    if (matches(event, "[data-session-selection-assistant-overlay]")) { setPlayerBoardAssistantOpen(false); renderWorkspace({ preserveDateStripScroll: true }); return; }
    if (callIfClosest(event, "[data-session-selection-assistant-open]", () => { setPlayerBoardAssistantOpen(true); setPlayerBoardSelectedPlayerId(""); renderWorkspace({ preserveDateStripScroll: true }); })) return;
    if (callIfClosest(event, "[data-session-selection-assistant-close]", () => { setPlayerBoardAssistantOpen(false); renderWorkspace({ preserveDateStripScroll: true }); })) return;
    if (callIfClosest(event, "[data-session-squad-bridge-player]", (el) => openPlayerBoardProfile(el.dataset.sessionSquadBridgePlayer))) return;
    if (callIfClosest(event, "[data-session-selection-assistant-apply]", () => applySelectionAssistant())) return;
    if (callIfClosest(event, "[data-session-player-board-prioritize]", () => {
      const formationInput = workspaceElement?.querySelector("[data-session-player-board-formation-input]");
      setPlayerBoardFormationInput(normalizePlayerBoardFormationValue(formationInput?.value));
      applyPlayerBoardFormation({ prioritize: true });
    })) return;
    if (callIfClosest(event, "[data-session-player-board-color]", (el) => updatePlayerBoardSelectedColor(el.dataset.sessionPlayerBoardColor))) return;
    if (callIfClosest(event, "[data-session-player-board-reset-positions]", () => resetPlayerBoardPositions())) return;
    if (callIfClosest(event, "[data-session-player-board-clear-colors]", () => clearPlayerBoardSelectedColors())) return;
    if (callIfClosest(event, "[data-session-player-board-person-cancel]", () => closePlayerBoardCustomPersonEditor())) return;
    if (callIfClosest(event, "[data-session-player-board-person-remove]", (el) => { clearPlayerBoardCustomPersonEditor(); removePlayerBoardCustomPerson(el.dataset.sessionPlayerBoardPersonRemove); })) return;
    if (matches(event, "[data-session-player-board-overlay]")) { setPlayerBoardOpen(false); return; }
    if (callIfClosest(event, "[data-session-close-player-board]", () => setPlayerBoardOpen(false))) return;
    if (callIfClosest(event, "[data-session-tactical-frame]", (el) => selectTacticalFrame(el.dataset.sessionTacticalFrame))) return;
    if (callIfClosest(event, "[data-session-add-tactical-frame]", () => addTacticalFrame())) return;
    if (callIfClosest(event, "[data-session-duplicate-tactical-frame]", () => duplicateTacticalFrame())) return;
    if (callIfClosest(event, "[data-session-delete-tactical-frame]", () => deleteTacticalFrame())) return;
    if (callIfClosest(event, "[data-session-arrange-tactical]", (el) => arrangeTacticalElements(el.dataset.sessionArrangeTactical))) return;
    if (callIfClosest(event, "[data-session-tactical-tool]", (el) => setTacticalTool(el.dataset.sessionTacticalTool))) return;
    if (callIfClosest(event, "[data-session-clear-board]", () => clearTacticalBoard())) return;
    if (callIfClosest(event, "[data-session-undo-board]", (el) => undoBoardHistory(el.dataset.sessionUndoBoard || "tactical"))) return;
    if (callIfClosest(event, "[data-session-redo-board]", (el) => redoBoardHistory(el.dataset.sessionRedoBoard || "tactical"))) return;
    if (callIfClosest(event, "[data-session-copy-tactical-selected]", () => copySelectedTacticalElements())) return;
    if (callIfClosest(event, "[data-session-paste-tactical-clipboard]", () => pasteTacticalClipboard())) return;
    if (callIfClosest(event, "[data-session-delete-tactical-selected]", () => removeSelectedTacticalElement())) return;
    if (callIfClosest(event, "[data-session-tactical-canvas]", (el) => handleTacticalCanvasClick(event, el))) return;
    if (callIfClosest(event, "[data-session-preview-visual]", () => setVisualPreviewOpen(true))) return;
    if (callIfClosest(event, "[data-session-open-tacticalboard]", () => setTacticalboardOpen(true))) return;
    if (callIfClosest(event, "[data-session-open-player-board]", () => setPlayerBoardOpen(true))) return;
    if (callIfClosest(event, "[data-session-open-print]", () => setPrintOverlayOpen(true))) return;
    if (callIfClosest(event, "[data-session-toggle-history]", () => {
      const nextOpen = !getHistoryOpen();
      setHistoryOpen(nextOpen);
      if (nextOpen) loadHistory(getSelectedDate())?.catch?.(() => {});
      renderWorkspace({ preserveDateStripScroll: true });
    })) return;
    if (callIfClosest(event, "[data-session-refresh-history]", () => loadHistory(getSelectedDate(), { force: true })?.catch?.(() => {}))) return;
    if (callIfClosest(event, "[data-session-restore-history]", (el) => restoreHistoryEntry(el.dataset.sessionRestoreHistory))) return;
    if (callIfClosest(event, "[data-session-close-library]", () => closeLibrary())) return;
    if (callIfClosest(event, "[data-session-open-library]", () => setLibraryOpen(true))) return;
    if (callIfClosest(event, "[data-session-library-folder]", (el) => selectLibraryFolder(el.dataset.sessionLibraryFolder))) return;
    if (callIfClosest(event, "[data-session-library-archive-folder]", (el) => archiveLibraryFolder(el.dataset.sessionLibraryArchiveFolder))) return;
    if (callIfClosest(event, "[data-session-library-edit-folder]", (el) => startLibraryFolderEdit(el.dataset.sessionLibraryEditFolder))) return;
    if (callIfClosest(event, "[data-session-library-cancel-folder-edit]", () => cancelLibraryFolderEdit())) return;
    if (callIfClosest(event, "[data-session-library-restore-folder]", (el) => restoreLibraryFolder(el.dataset.sessionLibraryRestoreFolder))) return;
    if (callIfClosest(event, "[data-session-save-exercise]", () => saveSelectedExerciseToLibrary())) return;
    if (callIfClosest(event, "[data-session-multiselect-toggle]", (el) => {
      const field = el.dataset.sessionMultiselectToggle;
      const previousOpenField = getMultiSelectOpenField();
      setMultiSelectOpenField(previousOpenField === field ? "" : field);
      refreshMultiSelectFields([previousOpenField, field]);
    })) return;
    if (callIfClosest(event, "[data-session-multiselect-option]", (el) => toggleMultiSelectValue(el.dataset.sessionMultiselectOption, el.dataset.sessionMultiselectValue))) return;
    if (callIfClosest(event, "[data-session-multiselect-clear]", (el) => clearMultiSelectValue(el.dataset.sessionMultiselectClear))) return;
    if (callIfClosest(event, "[data-session-today]", () => jumpToToday())) return;
    if (callIfClosest(event, "[data-session-scroll-dates]", (el) => scrollDateStrip(Number(el.dataset.sessionScrollDates) || 0))) return;
    if (callIfClosest(event, "[data-session-date]", (el) => selectDate(el.dataset.sessionDate))) return;
    if (callIfClosest(event, "[data-session-move-block]", (el) => moveBlock(el.dataset.sessionMoveBlock, Number(el.dataset.sessionMoveDirection) || 0))) return;
    if (callIfClosest(event, "[data-session-delete-block]", (el) => deleteBlock(el.dataset.sessionDeleteBlock))) return;
    if (callIfClosest(event, "[data-session-block-id]", (el) => selectBlock(el.dataset.sessionBlockId))) return;
    if (callIfClosest(event, "[data-session-add-menu-toggle]", () => setAddMenuOpen(!getAddMenuOpen()))) return;
    if (callIfClosest(event, "[data-session-add-new]", () => addBlock())) return;
    if (callIfClosest(event, "[data-session-add-from-library]", () => { addBlock(); setLibraryOpen(true); })) return;
    if (callIfClosest(event, "[data-session-add-tacticalboard]", () => { addBlock(); setTacticalboardOpen(true); })) return;
    if (callIfClosest(event, "[data-session-use-exercise]", (el) => applyExercise(el.dataset.sessionUseExercise))) return;
    if (callIfClosest(event, "[data-session-duplicate-library-exercise]", (el) => duplicateLibraryExercise(el.dataset.sessionDuplicateLibraryExercise))) return;
    if (callIfClosest(event, "[data-session-view-exercise]", (el) => startLibraryExerciseView(el.dataset.sessionViewExercise))) return;
    if (callIfClosest(event, "[data-session-edit-library-exercise]", (el) => startLibraryExerciseEdit(el.dataset.sessionEditLibraryExercise))) return;
    if (callIfClosest(event, "[data-session-save-library-edit]", (el) => updateLibraryExerciseFromEdit(el.dataset.sessionSaveLibraryEdit))) return;
    if (callIfClosest(event, "[data-session-save-library-edit-copy]", (el) => saveLibraryExerciseEditAsCopy(el.dataset.sessionSaveLibraryEditCopy))) return;
    if (callIfClosest(event, "[data-session-cancel-library-edit]", () => cancelLibraryExerciseEdit())) return;
    if (matches(event, "[data-session-library-edit-dialog]")) { cancelLibraryExerciseEdit(); return; }
    if (callIfClosest(event, "[data-session-close-view]", () => closeLibraryExerciseView())) return;
    if (matches(event, "[data-session-view-dialog]")) { closeLibraryExerciseView(); return; }
    if (callIfClosest(event, "[data-session-delete-library-exercise]", (el) => deleteLibraryExercise(el.dataset.sessionDeleteLibraryExercise))) return;
    if (callIfClosest(event, "[data-session-restore-library-exercise]", (el) => restoreLibraryExercise(el.dataset.sessionRestoreLibraryExercise))) return;
    if (callIfClosest(event, "[data-session-remove-library-exercise-from-folder]", (el) => removeExerciseFromLibraryFolder(el.dataset.sessionRemoveLibraryExerciseFromFolder, el.dataset.sessionRemoveLibraryFolder))) return;
    if (callIfClosest(event, "[data-session-library-filter-toggle]", (el) => toggleLibraryFilterOpen(el.dataset.sessionLibraryFilterToggle))) return;
    if (callIfClosest(event, "[data-session-library-filter-option]", (el) => toggleLibraryFilterValue(el.dataset.sessionLibraryFilterOption, el.dataset.sessionLibraryFilterValue))) return;
    if (callIfClosest(event, "[data-session-library-filter-clear]", (el) => clearLibraryFilter(el.dataset.sessionLibraryFilterClear))) return;
    callIfClosest(event, "[data-session-library-archive-view]", (el) => updateLibraryArchiveView(el.dataset.sessionLibraryArchiveView));
  }

  workspaceElement?.addEventListener?.("click", handleClick);
  return {
    handleClick,
    unbind: () => workspaceElement?.removeEventListener?.("click", handleClick),
  };
}
