export function duplicateSessionPlannerTacticalClipboard(options = {}) {
  const {
    clipboard = [],
    cloneElement,
    createStableId,
    moveElementFromInitial,
    pasteCount = 0,
  } = options;
  const baseOffset = Math.min(4.5, Math.max(2.2, clipboard.length > 1 ? 2.8 : 3.6));
  const copyOffset = baseOffset * (pasteCount + 1);
  return clipboard.map((element) => {
    const duplicate = cloneElement({
      ...element,
      id: createStableId("tactical"),
    });
    moveElementFromInitial(duplicate, element, copyOffset, copyOffset);
    return duplicate;
  });
}
