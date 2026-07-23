import { duplicateSessionPlannerTacticalClipboard } from "./session-planner-tactical-clipboard-helpers.mjs";

export function createSessionPlannerTacticalArrangeClipboardController(deps = {}) {
  const {
    canEdit,
    clamp,
    clearSelection,
    cloneElement,
    createStableId,
    getArrangeSpacing,
    getBoundsCollection,
    getSelectedBlock,
    getSelectedElements,
    localState,
    moveElementCenterTo,
    moveElementFromInitial,
    refreshCanvas,
    showToast,
  } = deps;

  function arrangeSelectedElements(mode) {
    if (!canEdit()) {
      return;
    }
    const collection = getBoundsCollection(getSelectedElements());
    if (!collection || collection.items.length < 2) {
      showToast("Select at least two items to arrange.", "warning");
      return;
    }
    const count = collection.items.length;
    const centerX = (collection.left + collection.right) / 2;
    const centerY = (collection.top + collection.bottom) / 2;
    const sortedItems = [...collection.items].sort((a, b) =>
      a.centerY === b.centerY ? a.centerX - b.centerX : a.centerY - b.centerY
    );
    if (mode === "row") {
      const rowItems = [...collection.items].sort((a, b) => a.centerX - b.centerX);
      const spacing = getArrangeSpacing(count, collection.right - collection.left, 5);
      const startX = clamp(centerX - (spacing * (count - 1)) / 2, 3, 97 - spacing * (count - 1));
      rowItems.forEach((item, index) => {
        moveElementCenterTo(item, startX + spacing * index, centerY);
      });
    } else if (mode === "column") {
      const columnItems = [...collection.items].sort((a, b) => a.centerY - b.centerY);
      const spacing = getArrangeSpacing(count, collection.bottom - collection.top, 4.6);
      const startY = clamp(centerY - (spacing * (count - 1)) / 2, 3, 97 - spacing * (count - 1));
      columnItems.forEach((item, index) => {
        moveElementCenterTo(item, centerX, startY + spacing * index);
      });
    } else {
      const columns = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / columns);
      const spacingX = 5.4;
      const spacingY = 4.9;
      const startX = clamp(centerX - (spacingX * (columns - 1)) / 2, 3, 97 - spacingX * (columns - 1));
      const startY = clamp(centerY - (spacingY * (rows - 1)) / 2, 3, 97 - spacingY * (rows - 1));
      sortedItems.forEach((item, index) => {
        moveElementCenterTo(
          item,
          startX + spacingX * (index % columns),
          startY + spacingY * Math.floor(index / columns)
        );
      });
    }
    refreshCanvas({ persist: true });
    showToast(`Arranged ${count} selected item${count === 1 ? "" : "s"}.`);
  }

  function copySelectedElements() {
    if (!canEdit()) {
      return false;
    }
    const selectedElements = getSelectedElements();
    if (!selectedElements.length) {
      showToast("Select players or tools first.", "error");
      return false;
    }
    localState.sessionPlannerTacticalClipboard = selectedElements.map(cloneElement);
    localState.sessionPlannerTacticalClipboardPasteCount = 0;
    showToast(
      `Copied: ${selectedElements.length} item${selectedElements.length === 1 ? "" : "s"}. Paste with Cmd/Ctrl+V.`
    );
    return true;
  }

  function pasteClipboard() {
    if (!canEdit()) {
      return false;
    }
    const block = getSelectedBlock();
    if (!block) {
      return false;
    }
    if (!localState.sessionPlannerTacticalClipboard.length) {
      showToast("Nothing copied yet.", "error");
      return false;
    }
    if (!Array.isArray(block.tacticalElements)) {
      block.tacticalElements = [];
    }
    const duplicatedElements = duplicateSessionPlannerTacticalClipboard({
      clipboard: localState.sessionPlannerTacticalClipboard,
      cloneElement,
      createStableId,
      moveElementFromInitial,
      pasteCount: localState.sessionPlannerTacticalClipboardPasteCount,
    });
    block.tacticalElements.push(...duplicatedElements);
    localState.sessionPlannerTacticalClipboardPasteCount += 1;
    clearSelection();
    localState.sessionPlannerTacticalPendingPoint = null;
    localState.sessionPlannerTacticalDraftLineState = null;
    localState.sessionPlannerTacticalSelectionState = null;
    refreshCanvas({ persist: true });
    showToast(`Pasted: ${duplicatedElements.length} item${duplicatedElements.length === 1 ? "" : "s"}.`);
    return true;
  }

  return {
    arrangeSelectedElements,
    copySelectedElements,
    pasteClipboard,
  };
}
