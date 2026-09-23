import { createSessionPlannerTextDraftStore } from "./session-planner-text-drafts.mjs";

export function bindSessionPlannerWorkspaceInputChangeController(deps = {}) {
  const {
    workspaceElement,
    cleanPlayerBoardFormationInput = (value) => value,
    setPlayerBoardFormationInput = () => {},
    normalizeTacticalColor = (value) => value,
    getTacticalColor = () => "",
    setTacticalColor = () => {},
    normalizeTacticalLineWidth = (value) => value,
    getTacticalLineWidth = () => 1,
    setTacticalLineWidth = () => {},
    getSelectedTacticalElementIds = () => [],
    getSelectedTacticalElements = () => [],
    isTacticalStrokeElement = () => false,
    updateSelectedTacticalElement = () => {},
    updateTacticalLineStyle = () => {},
    handlePeriodizationInput = () => false,
    handlePeriodizationChange = () => false,
    handlePeriodizationFocusIn = () => false,
    handlePeriodizationFocusOut = () => false,
    updateLibrarySearch = () => {},
    updateSelectedBlockField = () => {},
    resizeTextarea = () => {},
    updatePlayerBoardSelectedColor = () => {},
    normalizePlayerBoardTeamCount = (value) => value,
    setPlayerBoardTeamCount = () => {},
    normalizePlayerBoardAutoMode = (value) => value,
    setPlayerBoardAutoMode = () => {},
    updatePrintPaper = () => {},
    updatePrintSection = () => {},
    setTacticalPitchMode = () => {},
    selectTacticalFrame = () => {},
    handleVisualUpload = () => {},
    updateLibraryFilter = () => {},
    updateLibrarySortMode = () => {},
    renderWorkspace = () => {},
    getSelectedBlock = () => null,
    getSelectedDate = () => "",
    textDraftStore = null,
    win = globalThis,
  } = deps;
  const drafts = textDraftStore || createSessionPlannerTextDraftStore({
    storage: win?.sessionStorage,
    getScope: deps.getDraftScope,
    setTimeout: win?.setTimeout?.bind(win),
    clearTimeout: win?.clearTimeout?.bind(win),
  });

  function getTextDraftContext(field) {
    const block = getSelectedBlock?.();
    const date = getSelectedDate?.();
    const name = field?.dataset?.sessionField;
    if (!block?.id || !date || !name) return null;
    return { date, blockId: block.id, field: name };
  }

  function restoreTextDraft(field) {
    const context = getTextDraftContext(field);
    if (!context) return false;
    const result = drafts.restore(context, field.value);
    if (result.status === "restore") {
      field.value = result.value;
      resizeTextarea(field);
    }
    field.dataset.sessionDraftBaseValue = field.value;
    field.toggleAttribute?.("data-session-draft-conflict", result.status === "conflict");
    return result.status === "restore";
  }

  function restoreTextDrafts() {
    workspaceElement?.querySelectorAll?.("[data-session-field]").forEach(restoreTextDraft);
  }

  function recordTextDraft(field) {
    const context = getTextDraftContext(field);
    if (!context) return false;
    return drafts.record(context, field.value, field.dataset.sessionDraftBaseValue ?? field.value);
  }

  function commitSelectedBlockField(field) {
    if (!field?.dataset?.sessionField) {
      return false;
    }
    const saved = updateSelectedBlockField(field.dataset.sessionField, field.value, {
      syncExerciseReview: field.dataset.sessionField === "postSessionNotes",
    });
    if (saved) {
      drafts.clear(getTextDraftContext(field));
    }
    return saved;
  }

  function handleInput(event) {
    const playerBoardFormationInput = event.target.closest("[data-session-player-board-formation-input]");
    if (playerBoardFormationInput) {
      const nextValue = cleanPlayerBoardFormationInput(playerBoardFormationInput.value);
      setPlayerBoardFormationInput(nextValue);
      playerBoardFormationInput.value = nextValue;
      return;
    }
    const tacticalColorField = event.target.closest("[data-session-tactical-color]");
    if (tacticalColorField) {
      const nextColor = normalizeTacticalColor(tacticalColorField.value, getTacticalColor());
      setTacticalColor(nextColor);
      if (getSelectedTacticalElementIds().length) {
        updateSelectedTacticalElement({ color: nextColor });
      }
      return;
    }
    const tacticalWidthField = event.target.closest("[data-session-tactical-width]");
    if (tacticalWidthField) {
      const nextLineWidth = normalizeTacticalLineWidth(tacticalWidthField.value, getTacticalLineWidth());
      setTacticalLineWidth(nextLineWidth);
      if (getSelectedTacticalElements().some(isTacticalStrokeElement)) {
        updateSelectedTacticalElement({ lineWidth: nextLineWidth });
      }
      return;
    }
    const tacticalStyleInput = event.target.closest("[data-session-tactical-style]");
    if (tacticalStyleInput) {
      updateTacticalLineStyle(tacticalStyleInput.value);
      return;
    }
    if (handlePeriodizationInput(event)) {
      return;
    }
    const librarySearchField = event.target.closest("[data-session-library-search]");
    if (librarySearchField) {
      updateLibrarySearch(librarySearchField.value);
      return;
    }
    const field = event.target.closest("[data-session-field]");
    if (!field) {
      return;
    }
    // Text fields stay as a local DOM draft while the coach is composing.
    // Committing on every keystroke creates noisy central writes and makes
    // concurrent editing needlessly conflict-prone.
    resizeTextarea(field);
    recordTextDraft(field);
  }

  function handleChange(event) {
    const frameSelect = event.target.closest("[data-session-tactical-frame-select]");
    if (frameSelect) {
      selectTacticalFrame(frameSelect.value);
      workspaceElement?.querySelector?.("[data-session-tactical-frame-select]")?.focus();
      return;
    }
    const playerBoardColorSelect = event.target.closest("[data-session-player-board-color-select]");
    if (playerBoardColorSelect) {
      const colorValue = playerBoardColorSelect.value;
      if (colorValue) {
        updatePlayerBoardSelectedColor(colorValue);
      }
      playerBoardColorSelect.value = "";
      return;
    }
    const playerBoardTeamCountField = event.target.closest("[data-session-player-board-team-count]");
    if (playerBoardTeamCountField) {
      const nextTeamCount = normalizePlayerBoardTeamCount(playerBoardTeamCountField.value);
      setPlayerBoardTeamCount(nextTeamCount);
      playerBoardTeamCountField.value = String(nextTeamCount);
      return;
    }
    const playerBoardAutoModeField = event.target.closest("[data-session-player-board-auto-mode]");
    if (playerBoardAutoModeField) {
      const nextAutoMode = normalizePlayerBoardAutoMode(playerBoardAutoModeField.value);
      setPlayerBoardAutoMode(nextAutoMode);
      playerBoardAutoModeField.value = nextAutoMode;
      return;
    }
    const printPaperField = event.target.closest("[data-session-print-paper]");
    if (printPaperField) {
      updatePrintPaper(printPaperField.value);
      return;
    }
    const printSectionField = event.target.closest("[data-session-print-section]");
    if (printSectionField) {
      updatePrintSection(printSectionField.dataset.sessionPrintSection, printSectionField.checked);
      return;
    }
    const tacticalPitchModeField = event.target.closest("[data-session-tactical-pitch-mode]");
    if (tacticalPitchModeField) {
      setTacticalPitchMode(tacticalPitchModeField.value);
      return;
    }
    const tacticalStyleField = event.target.closest("[data-session-tactical-style]");
    if (tacticalStyleField) {
      updateTacticalLineStyle(tacticalStyleField.value);
      return;
    }
    const visualUploadField = event.target.closest("[data-session-upload-visual]");
    if (visualUploadField) {
      handleVisualUpload(visualUploadField.files?.[0]);
      visualUploadField.value = "";
      return;
    }
    if (handlePeriodizationChange(event)) {
      return;
    }
    const libraryFilter = event.target.closest("[data-session-library-filter]");
    if (libraryFilter) {
      updateLibraryFilter(libraryFilter.dataset.sessionLibraryFilter, libraryFilter.value);
      return;
    }
    const librarySort = event.target.closest("[data-session-library-sort]");
    if (librarySort) {
      updateLibrarySortMode(librarySort.value);
      return;
    }
    const field = event.target.closest("[data-session-field]");
    if (!field) {
      return;
    }
    commitSelectedBlockField(field);
    renderWorkspace({ preserveDateStripScroll: true });
  }

  function handleFocusOut(event) {
    if (handlePeriodizationFocusOut(event)) return;
    const field = event.target.closest?.("[data-session-field]");
    commitSelectedBlockField(field);
  }

  function handleFocusIn(event) {
    if (handlePeriodizationFocusIn(event)) return;
    const field = event.target.closest?.("[data-session-field]");
    restoreTextDraft(field);
  }

  function handleKeydown(event) {
    const field = event.target.closest?.("[data-session-field]");
    if (!field || event.key !== "Enter") {
      return;
    }
    const isSingleLineField = field.tagName === "INPUT";
    const requestsTextAreaCommit = field.tagName === "TEXTAREA" && (event.metaKey || event.ctrlKey);
    if (!isSingleLineField && !requestsTextAreaCommit) {
      return;
    }
    event.preventDefault?.();
    commitSelectedBlockField(field);
    field.blur?.();
  }

  workspaceElement?.addEventListener?.("input", handleInput);
  workspaceElement?.addEventListener?.("change", handleChange);
  workspaceElement?.addEventListener?.("focusout", handleFocusOut);
  workspaceElement?.addEventListener?.("focusin", handleFocusIn);
  workspaceElement?.addEventListener?.("keydown", handleKeydown);
  win?.addEventListener?.("pagehide", drafts.flush);
  const observer = typeof win?.MutationObserver === "function"
    ? new win.MutationObserver(restoreTextDrafts)
    : null;
  observer?.observe?.(workspaceElement, { childList: true, subtree: true });
  restoreTextDrafts();

  return {
    handleInput,
    handleChange,
    handleFocusOut,
    handleFocusIn,
    handleKeydown,
    unbind: () => {
      workspaceElement?.removeEventListener?.("input", handleInput);
      workspaceElement?.removeEventListener?.("change", handleChange);
      workspaceElement?.removeEventListener?.("focusout", handleFocusOut);
      workspaceElement?.removeEventListener?.("focusin", handleFocusIn);
      workspaceElement?.removeEventListener?.("keydown", handleKeydown);
      win?.removeEventListener?.("pagehide", drafts.flush);
      observer?.disconnect?.();
    },
  };
}
