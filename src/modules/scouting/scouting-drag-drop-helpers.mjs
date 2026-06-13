function normalizeFallback(value = "", maxLength = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function getScoutingDragPayload(event, currentDragState = null) {
  if (currentDragState) {
    return currentDragState;
  }
  const textPayload = event?.dataTransfer?.getData?.("text/plain");
  if (!textPayload) {
    return null;
  }
  try {
    const parsed = JSON.parse(textPayload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearScoutingMyTeamDropPreview(root = null) {
  if (!root) {
    return false;
  }
  root
    .querySelectorAll(
      ".scouting-my-team-slot-entry.is-drop-before, .scouting-my-team-slot.is-drag-over, [data-scouting-my-team-bench-drop].is-drag-over"
    )
    .forEach((node) => node.classList.remove("is-drop-before", "is-drag-over"));
  return true;
}

export function updateScoutingMyTeamDropPreview(options = {}) {
  const event = options.event;
  const root = options.root;
  const dragPayload = options.dragPayload || {};
  const normalizeText = typeof options.normalizeText === "function" ? options.normalizeText : normalizeFallback;
  const currentPreviewKey = normalizeText(options.currentPreviewKey, 500);
  if (!event?.target || !root) {
    return { changed: false, previewKey: "" };
  }

  const beforeEntry = event.target.closest?.("[data-scouting-my-team-drop-before]");
  const slotTarget = event.target.closest?.(".scouting-my-team-slot[data-scouting-my-team-drop-slot]");
  const benchTarget = event.target.closest?.("[data-scouting-my-team-bench-drop]");
  const draggingId = normalizeText(dragPayload?.playerId, 160);
  const beforeId =
    beforeEntry && root.contains(beforeEntry) && beforeEntry.dataset.scoutingMyTeamDropBefore !== draggingId
      ? beforeEntry.dataset.scoutingMyTeamDropBefore || ""
      : "";
  const slotId = slotTarget && root.contains(slotTarget) ? slotTarget.dataset.scoutingMyTeamDropSlot || "" : "";
  const benchId = benchTarget && root.contains(benchTarget) && !slotTarget ? "bench" : "";
  const previewKey = [draggingId, slotId, beforeId, benchId].join("|");
  if (previewKey === currentPreviewKey) {
    return { changed: false, previewKey };
  }

  clearScoutingMyTeamDropPreview(root);
  if (beforeId) {
    beforeEntry.classList.add("is-drop-before");
  }
  if (slotId) {
    slotTarget.classList.add("is-drag-over");
  }
  if (benchId) {
    benchTarget.classList.add("is-drag-over");
  }
  return { changed: true, previewKey, beforeId, slotId, benchId };
}
