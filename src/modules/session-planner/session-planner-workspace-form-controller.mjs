export function bindSessionPlannerWorkspaceFormController(deps = {}) {
  const {
    workspaceElement,
    openPlayerBoardProfile = () => {},
    handleTacticalCanvasDoubleClick = () => {},
    handlePlayerBoardContextMenu = () => {},
    updateExerciseLibraryFolderFromForm = () => {},
    createExerciseLibraryFolderFromForm = () => {},
    savePlayerBoardCustomPersonFromForm = () => {},
    normalizePlayerBoardTeamCount = (value) => value,
    normalizePlayerBoardAutoMode = (value) => value,
    normalizePlayerBoardFormationValue = (value) => value,
    setPlayerBoardTeamCount = () => {},
    setPlayerBoardAutoMode = () => {},
    setPlayerBoardFormationInput = () => {},
    applyPlayerBoardAutoSelect = () => {},
    copyPlayerBoardTeamsFromBlock = () => {},
    applyPlayerBoardFormation = () => {},
  } = deps;

  function handleDoubleClick(event) {
    const playerBoardToken = event.target.closest("[data-session-player-board-token]");
    if (playerBoardToken) {
      openPlayerBoardProfile(playerBoardToken.dataset.sessionPlayerBoardToken);
      return;
    }
    const tacticalCanvas = event.target.closest("[data-session-tactical-canvas]");
    if (!tacticalCanvas) {
      return;
    }
    handleTacticalCanvasDoubleClick(event, tacticalCanvas);
  }

  function handleSubmit(event) {
    const libraryFolderEditForm = event.target.closest?.("[data-session-library-folder-edit-form]");
    if (libraryFolderEditForm) {
      event.preventDefault();
      updateExerciseLibraryFolderFromForm(libraryFolderEditForm);
      return;
    }
    const libraryFolderForm = event.target.closest?.("[data-session-library-folder-form]");
    if (libraryFolderForm) {
      event.preventDefault();
      createExerciseLibraryFolderFromForm(libraryFolderForm);
      return;
    }
    const playerBoardPersonForm = event.target.closest?.("[data-session-player-board-person-form]");
    if (playerBoardPersonForm) {
      event.preventDefault();
      savePlayerBoardCustomPersonFromForm(playerBoardPersonForm);
      return;
    }
    const playerBoardAutoForm = event.target.closest?.("[data-session-player-board-auto-form]");
    if (playerBoardAutoForm) {
      event.preventDefault();
      const teamCountField = playerBoardAutoForm.querySelector("[data-session-player-board-team-count]");
      const autoModeField = playerBoardAutoForm.querySelector("[data-session-player-board-auto-mode]");
      setPlayerBoardTeamCount(normalizePlayerBoardTeamCount(teamCountField?.value));
      setPlayerBoardAutoMode(normalizePlayerBoardAutoMode(autoModeField?.value));
      applyPlayerBoardAutoSelect();
      return;
    }
    const playerBoardCopyForm = event.target.closest?.("[data-session-player-board-copy-form]");
    if (playerBoardCopyForm) {
      event.preventDefault();
      const sourceField = playerBoardCopyForm.querySelector("[data-session-player-board-copy-source]");
      copyPlayerBoardTeamsFromBlock(sourceField?.value);
      return;
    }
    const playerBoardFormationForm = event.target.closest?.("[data-session-player-board-formation-form]");
    if (!playerBoardFormationForm) {
      return;
    }
    event.preventDefault();
    const formationInput = playerBoardFormationForm.querySelector("[data-session-player-board-formation-input]");
    setPlayerBoardFormationInput(normalizePlayerBoardFormationValue(formationInput?.value));
    applyPlayerBoardFormation();
  }

  workspaceElement?.addEventListener?.("dblclick", handleDoubleClick);
  workspaceElement?.addEventListener?.("contextmenu", handlePlayerBoardContextMenu);
  workspaceElement?.addEventListener?.("submit", handleSubmit);

  return {
    handleDoubleClick,
    handleSubmit,
    unbind: () => {
      workspaceElement?.removeEventListener?.("dblclick", handleDoubleClick);
      workspaceElement?.removeEventListener?.("contextmenu", handlePlayerBoardContextMenu);
      workspaceElement?.removeEventListener?.("submit", handleSubmit);
    },
  };
}
