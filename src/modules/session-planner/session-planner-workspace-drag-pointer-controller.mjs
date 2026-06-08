export function bindSessionPlannerWorkspaceDragPointerController(deps = {}) {
  const {
    workspaceElement,
    win = globalThis,
    canEditSessionPlanner = () => false,
    getDraggedLibraryExerciseId = () => "",
    setDraggedLibraryExerciseId = () => {},
    getDraggedBlockId = () => "",
    setDraggedBlockId = () => {},
    getBlockDropPlacement = () => "after",
    addExerciseToLibraryFolder = () => {},
    clearBlockDragState = () => {},
    clearLibraryDragState = () => {},
    reorderBlock = () => {},
    startLibraryPointerDrag = () => false,
    updateLibraryPointerDrag = () => false,
    finishLibraryPointerDrag = () => false,
    startPlayerBoardDrag = () => false,
    updatePlayerBoardDrag = () => false,
    finishPlayerBoardDrag = () => false,
    startPlayerBoardSelection = () => false,
    updatePlayerBoardSelection = () => false,
    finishPlayerBoardSelection = () => false,
    startTacticalDrag = () => {},
    updateTacticalDrag = () => {},
    finishTacticalDrag = () => {},
  } = deps;

  function handleDragStart(event) {
    const libraryExerciseItem = event.target.closest("[data-session-library-drag-exercise]");
    if (libraryExerciseItem && canEditSessionPlanner()) {
      const exerciseId = libraryExerciseItem.dataset.sessionLibraryDragExercise;
      setDraggedLibraryExerciseId(exerciseId);
      libraryExerciseItem.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", exerciseId);
      return;
    }
    const row = event.target.closest("[data-session-block-drop-id]");
    if (!row || !canEditSessionPlanner()) {
      return;
    }
    const blockId = row.dataset.sessionBlockDropId;
    setDraggedBlockId(blockId);
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", blockId);
  }

  function handleDragOver(event) {
    const folderDropTarget = event.target.closest("[data-session-library-folder-drop]");
    if (folderDropTarget && getDraggedLibraryExerciseId()) {
      event.preventDefault();
      workspaceElement
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
    const draggedBlockId = getDraggedBlockId();
    if (!row || !draggedBlockId || row.dataset.sessionBlockDropId === draggedBlockId) {
      return;
    }
    event.preventDefault();
    const placement = getBlockDropPlacement(event, row);
    workspaceElement
      ?.querySelectorAll(".session-block-row.is-drop-before, .session-block-row.is-drop-after")
      .forEach((dropRow) => {
        if (dropRow !== row) {
          dropRow.classList.remove("is-drop-before", "is-drop-after");
        }
      });
    row.classList.toggle("is-drop-before", placement === "before");
    row.classList.toggle("is-drop-after", placement === "after");
    event.dataTransfer.dropEffect = "move";
  }

  function handleDragLeave(event) {
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
  }

  function handleDrop(event) {
    const folderDropTarget = event.target.closest("[data-session-library-folder-drop]");
    const draggedLibraryExerciseId = getDraggedLibraryExerciseId();
    if (folderDropTarget && draggedLibraryExerciseId) {
      event.preventDefault();
      addExerciseToLibraryFolder(
        draggedLibraryExerciseId,
        folderDropTarget.dataset.sessionLibraryFolderDrop
      );
      clearLibraryDragState();
      return;
    }
    const row = event.target.closest("[data-session-block-drop-id]");
    const draggedBlockId = getDraggedBlockId();
    if (!row || !draggedBlockId) {
      return;
    }
    event.preventDefault();
    reorderBlock(
      draggedBlockId,
      row.dataset.sessionBlockDropId,
      getBlockDropPlacement(event, row)
    );
    clearBlockDragState();
  }

  function handleDragEnd() {
    clearBlockDragState();
    clearLibraryDragState();
  }

  function handlePointerDown(event) {
    if (startLibraryPointerDrag(event)) {
      return;
    }
    if (startPlayerBoardDrag(event)) {
      return;
    }
    if (startPlayerBoardSelection(event)) {
      return;
    }
    startTacticalDrag(event);
  }

  function handlePointerMove(event) {
    if (updateLibraryPointerDrag(event)) {
      return;
    }
    if (updatePlayerBoardDrag(event)) {
      return;
    }
    if (updatePlayerBoardSelection(event)) {
      return;
    }
    updateTacticalDrag(event);
  }

  function handlePointerUp(event) {
    if (finishLibraryPointerDrag(event)) {
      return;
    }
    if (finishPlayerBoardDrag()) {
      return;
    }
    if (finishPlayerBoardSelection()) {
      return;
    }
    finishTacticalDrag();
  }

  workspaceElement?.addEventListener?.("dragstart", handleDragStart);
  workspaceElement?.addEventListener?.("dragover", handleDragOver);
  workspaceElement?.addEventListener?.("dragleave", handleDragLeave);
  workspaceElement?.addEventListener?.("drop", handleDrop);
  workspaceElement?.addEventListener?.("dragend", handleDragEnd);
  workspaceElement?.addEventListener?.("pointerdown", handlePointerDown);
  win.addEventListener?.("pointermove", handlePointerMove);
  win.addEventListener?.("pointerup", handlePointerUp);

  return {
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    unbind: () => {
      workspaceElement?.removeEventListener?.("dragstart", handleDragStart);
      workspaceElement?.removeEventListener?.("dragover", handleDragOver);
      workspaceElement?.removeEventListener?.("dragleave", handleDragLeave);
      workspaceElement?.removeEventListener?.("drop", handleDrop);
      workspaceElement?.removeEventListener?.("dragend", handleDragEnd);
      workspaceElement?.removeEventListener?.("pointerdown", handlePointerDown);
      win.removeEventListener?.("pointermove", handlePointerMove);
      win.removeEventListener?.("pointerup", handlePointerUp);
    },
  };
}
