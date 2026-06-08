export const SESSION_TACTICALBOARD_KEY_HANDLED = "__sessionTacticalboardKeyHandled";

function isShortcutTextEditingTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

export function createSessionPlannerTacticalShortcutController(deps = {}) {
  const {
    clearPendingPoint = () => {},
    copySelectedElements = () => false,
    getPlayerBadgeFromKeyboardEvent = () => "",
    getPendingPoint = () => null,
    getSelectedElementIds = () => [],
    hasClipboard = () => false,
    isTacticalboardOpen = () => false,
    pasteClipboard = () => false,
    removeSelectedElement = () => false,
    updateSelectedPlayerBadges = () => false,
    undoSelectedBoardAction = () => false,
    win = globalThis,
  } = deps;

  function hasActiveTextSelection() {
    const selection = win.getSelection?.();
    return Boolean(selection && !selection.isCollapsed && String(selection).trim());
  }

  function shouldHandleShortcut(event, options = {}) {
    if (!isTacticalboardOpen() || event[SESSION_TACTICALBOARD_KEY_HANDLED]) {
      return false;
    }
    if (isShortcutTextEditingTarget(event.target)) {
      return false;
    }
    if (options.skipWhenTextSelected && hasActiveTextSelection()) {
      return false;
    }
    if (options.requireSelection && !getSelectedElementIds().length) {
      return false;
    }
    return true;
  }

  function markHandled(event) {
    event.preventDefault();
    event[SESSION_TACTICALBOARD_KEY_HANDLED] = true;
  }

  function handleKeydown(event) {
    if (!shouldHandleShortcut(event)) return;
    const isTextEditingTarget = isShortcutTextEditingTarget(event.target);
    const isUndoShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z";
    const isCopyShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c";
    const isPasteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v";
    const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
    const hasSelectedTacticalElements = getSelectedElementIds().length > 0;
    if (isUndoShortcut && !isTextEditingTarget) {
      markHandled(event);
      undoSelectedBoardAction();
      return;
    }
    if (event.key === "Escape") {
      markHandled(event);
      clearPendingPoint({ clearSelection: true });
      return;
    }
    if (isCopyShortcut && !isTextEditingTarget && hasSelectedTacticalElements) {
      markHandled(event);
      copySelectedElements();
      return;
    }
    if (isPasteShortcut && !isTextEditingTarget) {
      markHandled(event);
      pasteClipboard();
      return;
    }
    const playerBadgeKey = getPlayerBadgeFromKeyboardEvent(event);
    if (playerBadgeKey && updateSelectedPlayerBadges(playerBadgeKey)) {
      markHandled(event);
      return;
    }
    if (isDeleteKey && !isTextEditingTarget && (getPendingPoint() || hasSelectedTacticalElements)) {
      markHandled(event);
      if (getPendingPoint()) {
        clearPendingPoint();
        return;
      }
      removeSelectedElement();
    }
  }

  function handleCopy(event) {
    if (!shouldHandleShortcut(event, { requireSelection: true, skipWhenTextSelected: true })) return;
    markHandled(event);
    const selectedCount = getSelectedElementIds().length;
    event.clipboardData?.setData("text/plain", `Football Science tactical selection (${selectedCount} item${selectedCount === 1 ? "" : "s"})`);
    copySelectedElements();
  }

  function handlePaste(event) {
    if (!hasClipboard() || !shouldHandleShortcut(event, { skipWhenTextSelected: true })) return;
    markHandled(event);
    pasteClipboard();
  }

  function handleDeleteKeyup(event) {
    const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
    if (!isDeleteKey || !shouldHandleShortcut(event)) return;
    const hasSelectedTacticalElements = getSelectedElementIds().length > 0;
    if (!getPendingPoint() && !hasSelectedTacticalElements) return;
    markHandled(event);
    if (getPendingPoint()) {
      clearPendingPoint();
      return;
    }
    removeSelectedElement();
  }

  function bind() {
    win.addEventListener?.("keydown", handleKeydown, true);
    win.addEventListener?.("keyup", handleDeleteKeyup, true);
    win.addEventListener?.("copy", handleCopy, true);
    win.addEventListener?.("paste", handlePaste, true);
    return controller;
  }

  const controller = {
    bind,
    handleCopy,
    handleDeleteKeyup,
    handleKeydown,
    handlePaste,
    handledKey: SESSION_TACTICALBOARD_KEY_HANDLED,
    shouldHandleShortcut,
  };
  return controller;
}

export function bindSessionPlannerTacticalShortcutController(deps = {}) {
  return createSessionPlannerTacticalShortcutController(deps).bind();
}

export function bindSessionPlannerWorkspaceKeydownController(deps = {}) {
  const {
    clearTacticalPendingPoint = () => {},
    clearTacticalSelection = () => {},
    closePlayerBoardAssistant = () => {},
    closePlayerBoardProfile = () => {},
    getSelectedTacticalElementIds = () => [],
    handlePeriodizationKeydown = () => false,
    hasPlayerBoardProfile = () => false,
    hasTacticalPendingPoint = () => false,
    isPlayerBoardAssistantOpen = () => false,
    isPlayerBoardOpen = () => false,
    isPrintOverlayOpen = () => false,
    isTacticalboardOpen = () => false,
    refreshTacticalboardCanvas = () => {},
    removeSelectedTacticalElement = () => false,
    renderWorkspace = () => {},
    redoBoardHistory = () => false,
    setPlayerBoardOpen = () => {},
    setPrintOverlayOpen = () => {},
    undoBoardHistory = () => false,
    workspaceElement = null,
  } = deps;

  function handleKeydown(event) {
    if (event[SESSION_TACTICALBOARD_KEY_HANDLED]) {
      return;
    }
    const isTextEditingTarget = isShortcutTextEditingTarget(event.target);
    if (isPlayerBoardOpen() && event.key === "Escape") {
      event.preventDefault();
      if (isPlayerBoardAssistantOpen()) {
        closePlayerBoardAssistant();
        renderWorkspace({ preserveDateStripScroll: true });
        return;
      }
      if (hasPlayerBoardProfile()) {
        closePlayerBoardProfile();
        return;
      }
      setPlayerBoardOpen(false);
      return;
    }
    if (isPrintOverlayOpen() && event.key === "Escape") {
      event.preventDefault();
      setPrintOverlayOpen(false);
      return;
    }
    if (
      isTacticalboardOpen() &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      if (event.shiftKey) {
        redoBoardHistory("tactical");
      } else {
        undoBoardHistory("tactical");
      }
      return;
    }
    if (
      isPlayerBoardOpen() &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z" &&
      !isTextEditingTarget
    ) {
      event.preventDefault();
      if (event.shiftKey) {
        redoBoardHistory("player");
      } else {
        undoBoardHistory("player");
      }
      return;
    }
    if (isTacticalboardOpen() && event.key === "Escape") {
      event.preventDefault();
      clearTacticalPendingPoint({ clearSelectionState: true });
      clearTacticalSelection();
      refreshTacticalboardCanvas();
      return;
    }
    if (
      isTacticalboardOpen() &&
      (event.key === "Backspace" || event.key === "Delete") &&
      hasTacticalPendingPoint()
    ) {
      event.preventDefault();
      clearTacticalPendingPoint();
      refreshTacticalboardCanvas();
      return;
    }
    const hasSelectedTacticalElements = getSelectedTacticalElementIds().length > 0;
    if (
      isTacticalboardOpen() &&
      !isTextEditingTarget &&
      (event.key === "Backspace" || event.key === "Delete") &&
      hasSelectedTacticalElements
    ) {
      event.preventDefault();
      removeSelectedTacticalElement();
      return;
    }
    handlePeriodizationKeydown(event);
  }

  workspaceElement?.addEventListener?.("keydown", handleKeydown);
  return {
    handleKeydown,
    unbind: () => workspaceElement?.removeEventListener?.("keydown", handleKeydown),
  };
}
