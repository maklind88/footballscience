import {
  clearScoutingMyTeamDropPreview,
  getScoutingDragPayload,
  updateScoutingMyTeamDropPreview,
} from "./scouting-drag-drop-helpers.mjs";

let scoutingDragState = null;
let scoutingDragAndDropDelegatesBound = false;
let scoutingDragAndDropDelegateRoot = null;
let scoutingMyTeamDropPreviewKey = "";

function setScoutingDragState(nextState = null, event = null, dragImage = null, x = 12, y = 12) {
  scoutingDragState = nextState;
  if (nextState) {
    event?.dataTransfer?.setData?.("text/plain", JSON.stringify(nextState));
    event?.dataTransfer?.setDragImage?.(dragImage || event.target, x, y);
  }
  return scoutingDragState;
}

function resetScoutingDragState() {
  scoutingDragState = null;
}

function getClosest(target, selector) {
  return target && typeof target.closest === "function" ? target.closest(selector) : null;
}

function getRectPercentPosition(event, element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) {
    return null;
  }
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

function clearMyTeamDropPreview(root) {
  scoutingMyTeamDropPreviewKey = "";
  clearScoutingMyTeamDropPreview(root);
}

function updateMyTeamDropPreview(event, root, dragPayload, deps = {}) {
  const preview = updateScoutingMyTeamDropPreview({
    event,
    root,
    dragPayload,
    currentPreviewKey: scoutingMyTeamDropPreviewKey,
    normalizeText: deps.normalizeText,
  });
  scoutingMyTeamDropPreviewKey = preview.previewKey;
}

export function bindScoutingDragAndDrop(root = null, deps = {}) {
  if (!root) {
    return false;
  }
  if (scoutingDragAndDropDelegatesBound && scoutingDragAndDropDelegateRoot === root) {
    return false;
  }
  scoutingDragAndDropDelegatesBound = true;
  scoutingDragAndDropDelegateRoot = root;
  let slotPositionDrag = null;

  const finishSlotPositionDrag = (event, cancel = false) => {
    if (!slotPositionDrag || event.pointerId !== slotPositionDrag.pointerId) {
      return;
    }
    const drag = slotPositionDrag;
    slotPositionDrag = null;
    drag.slotElement?.classList.remove("is-position-dragging");
    try {
      drag.handle?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can already be released by the browser.
    }
    if (!cancel && drag.lastPosition) {
      if (drag.mode === "shadow") {
        deps.setShadowSlotPitchPosition?.(drag.slotId, drag.lastPosition.x, drag.lastPosition.y);
      } else {
        deps.setMyTeamSlotPitchPosition?.(drag.slotId, drag.lastPosition.x, drag.lastPosition.y);
      }
    }
  };

  root.addEventListener("pointerdown", (event) => {
    const myTeamSlotHandle = getClosest(event.target, "[data-scouting-drag-my-team-slot]");
    const shadowSlotHandle = getClosest(event.target, "[data-scouting-drag-shadow-slot]");
    const slotHandle = myTeamSlotHandle || shadowSlotHandle;
    if (!slotHandle || !root.contains(slotHandle) || deps.canEdit?.() === false) {
      return;
    }
    const mode = shadowSlotHandle ? "shadow" : "my-team";
    const slotElement = getClosest(slotHandle, ".scouting-shadow-slot");
    const pitchElement = getClosest(slotHandle, ".scouting-shadow-pitch");
    const position = deps.getPointerPitchPosition?.(event, pitchElement);
    if (!slotElement || !pitchElement || !position) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    slotPositionDrag = {
      pointerId: event.pointerId,
      mode,
      slotId: mode === "shadow" ? slotHandle.dataset.scoutingDragShadowSlot : slotHandle.dataset.scoutingDragMyTeamSlot,
      handle: slotHandle,
      slotElement,
      pitchElement,
      lastPosition: position,
    };
    slotElement.classList.add("is-position-dragging");
    deps.previewSlotPitchPosition?.(slotElement, position);
    slotHandle.setPointerCapture?.(event.pointerId);
  });

  root.addEventListener("pointermove", (event) => {
    if (!slotPositionDrag || event.pointerId !== slotPositionDrag.pointerId) {
      return;
    }
    event.preventDefault();
    const position = deps.getPointerPitchPosition?.(event, slotPositionDrag.pitchElement);
    if (!position) {
      return;
    }
    slotPositionDrag.lastPosition = position;
    deps.previewSlotPitchPosition?.(slotPositionDrag.slotElement, position);
  });

  root.addEventListener("pointerup", (event) => finishSlotPositionDrag(event));
  root.addEventListener("pointercancel", (event) => finishSlotPositionDrag(event, true));

  root.addEventListener("dragstart", (event) => {
    const myTeamSlotHandle = getClosest(event.target, "[data-scouting-drag-my-team-slot]");
    if (myTeamSlotHandle && root.contains(myTeamSlotHandle)) {
      const slotElement = getClosest(myTeamSlotHandle, ".scouting-my-team-slot");
      setScoutingDragState({ type: "my-team-slot", slotId: myTeamSlotHandle.dataset.scoutingDragMyTeamSlot }, event, slotElement || myTeamSlotHandle, 18, 18);
      slotElement?.classList.add("is-position-dragging");
      return;
    }
    const shadowSlotHandle = getClosest(event.target, "[data-scouting-drag-shadow-slot]");
    if (shadowSlotHandle && root.contains(shadowSlotHandle)) {
      const slotElement = getClosest(shadowSlotHandle, ".scouting-shadow-slot");
      setScoutingDragState({ type: "shadow-slot", slotId: shadowSlotHandle.dataset.scoutingDragShadowSlot }, event, slotElement || shadowSlotHandle, 18, 18);
      slotElement?.classList.add("is-position-dragging");
      return;
    }
    const myTeamElement = getClosest(event.target, "[data-scouting-drag-my-team-player]");
    if (myTeamElement && root.contains(myTeamElement)) {
      setScoutingDragState({ type: "my-team", playerId: myTeamElement.dataset.scoutingDragMyTeamPlayer }, event, myTeamElement, 12, 12);
      myTeamElement.classList.add("is-dragging");
      return;
    }
    const favoriteElement = getClosest(event.target, "[data-scouting-drag-favorite-record]");
    if (favoriteElement && root.contains(favoriteElement)) {
      setScoutingDragState({ type: "favorite", recordId: favoriteElement.dataset.scoutingDragFavoriteRecord }, event, favoriteElement, 12, 12);
      return;
    }
    const shadowElement = getClosest(event.target, "[data-scouting-drag-shadow-record]");
    if (shadowElement && root.contains(shadowElement)) {
      setScoutingDragState(
        {
          type: "shadow",
          recordId: shadowElement.dataset.scoutingDragShadowRecord,
          slotId: shadowElement.dataset.scoutingShadowSlot,
        },
        event,
        shadowElement,
        12,
        12
      );
      return;
    }
    const targetElement = getClosest(event.target, "[data-scouting-drag-target]");
    if (targetElement && root.contains(targetElement)) {
      setScoutingDragState({ type: "target", targetId: targetElement.dataset.scoutingDragTarget }, event, targetElement, 12, 12);
    }
  });

  root.addEventListener("dragover", (event) => {
    const dragPayload = getScoutingDragPayload(event, scoutingDragState);
    if (dragPayload?.type === "my-team-slot" && getClosest(event.target, ".scouting-my-team-pitch")) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      return;
    }
    if (dragPayload?.type === "shadow-slot" && getClosest(event.target, ".scouting-shadow-layout:not(.scouting-my-team-layout) .scouting-shadow-pitch")) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      return;
    }
    if ((dragPayload?.type === "my-team" || !dragPayload?.type) && getClosest(event.target, "[data-scouting-my-team-drop-slot], [data-scouting-my-team-bench-drop]")) {
      event.preventDefault();
      updateMyTeamDropPreview(event, root, dragPayload || scoutingDragState, deps);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    } else if (dragPayload?.type === "my-team") {
      clearMyTeamDropPreview(root);
    }
    if (["shadow", "favorite"].includes(dragPayload?.type) && getClosest(event.target, "[data-scouting-shadow-drop-slot], [data-scouting-shadow-drop-before]")) {
      event.preventDefault();
    }
    if (dragPayload?.type === "target" && getClosest(event.target, "[data-scouting-target-drop-status]")) {
      event.preventDefault();
    }
  });

  root.addEventListener("drop", (event) => {
    const dragPayload = getScoutingDragPayload(event, scoutingDragState);
    const myTeamPitchDrop = getClosest(event.target, ".scouting-my-team-pitch");
    if (dragPayload?.type === "my-team-slot" && myTeamPitchDrop && root.contains(myTeamPitchDrop)) {
      event.preventDefault();
      const position = getRectPercentPosition(event, myTeamPitchDrop);
      if (position) {
        deps.setMyTeamSlotPitchPosition?.(dragPayload.slotId, position.x, position.y);
      }
      resetScoutingDragState();
      return;
    }
    const shadowPitchDrop = getClosest(event.target, ".scouting-shadow-layout:not(.scouting-my-team-layout) .scouting-shadow-pitch");
    if (dragPayload?.type === "shadow-slot" && shadowPitchDrop && root.contains(shadowPitchDrop)) {
      event.preventDefault();
      const position = getRectPercentPosition(event, shadowPitchDrop);
      if (position) {
        deps.setShadowSlotPitchPosition?.(dragPayload.slotId, position.x, position.y);
      }
      resetScoutingDragState();
      return;
    }
    const myTeamBenchDrop = getClosest(event.target, "[data-scouting-my-team-bench-drop]");
    if (dragPayload?.type === "my-team" && myTeamBenchDrop && root.contains(myTeamBenchDrop) && !getClosest(event.target, "[data-scouting-my-team-drop-slot]")) {
      event.preventDefault();
      clearMyTeamDropPreview(root);
      deps.removeMyTeamPlayerFromAllSlots?.(dragPayload.playerId);
      resetScoutingDragState();
      return;
    }
    const myTeamBeforeDrop = getClosest(event.target, "[data-scouting-my-team-drop-before]");
    const myTeamDrop = getClosest(event.target, "[data-scouting-my-team-drop-slot]");
    if (dragPayload?.type === "my-team" && myTeamDrop && root.contains(myTeamDrop)) {
      event.preventDefault();
      clearMyTeamDropPreview(root);
      deps.assignMyTeamPlayerToSlot?.(
        dragPayload.playerId,
        myTeamDrop.dataset.scoutingMyTeamDropSlot,
        myTeamBeforeDrop?.dataset.scoutingMyTeamDropBefore || ""
      );
      resetScoutingDragState();
      return;
    }
    const shadowDrop = getClosest(event.target, "[data-scouting-shadow-drop-slot], [data-scouting-shadow-drop-before]");
    if (dragPayload?.type === "favorite" && shadowDrop && root.contains(shadowDrop)) {
      event.preventDefault();
      deps.addRecordToShadow?.(dragPayload.recordId, shadowDrop.dataset.scoutingShadowDropSlot || "");
      resetScoutingDragState();
      return;
    }
    if (dragPayload?.type === "shadow" && shadowDrop && root.contains(shadowDrop)) {
      event.preventDefault();
      deps.reorderShadowRecord?.(
        shadowDrop.dataset.scoutingShadowDropSlot || dragPayload.slotId,
        dragPayload.recordId,
        shadowDrop.dataset.scoutingShadowDropBefore || ""
      );
      resetScoutingDragState();
      return;
    }
    const targetDrop = getClosest(event.target, "[data-scouting-target-drop-status]");
    if (dragPayload?.type === "target" && targetDrop && root.contains(targetDrop)) {
      event.preventDefault();
      deps.setTargetStatusByDrag?.(dragPayload.targetId, targetDrop.dataset.scoutingTargetDropStatus);
      resetScoutingDragState();
    }
  });

  root.addEventListener("dragend", () => {
    clearMyTeamDropPreview(root);
    root.querySelectorAll(".scouting-my-team-player.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
    root.querySelectorAll(".scouting-my-team-slot.is-position-dragging").forEach((node) => node.classList.remove("is-position-dragging"));
    root.querySelectorAll(".scouting-shadow-slot.is-position-dragging").forEach((node) => node.classList.remove("is-position-dragging"));
    resetScoutingDragState();
  });

  return true;
}

export function resetScoutingDragDropRouterForTests() {
  scoutingDragState = null;
  scoutingDragAndDropDelegatesBound = false;
  scoutingDragAndDropDelegateRoot = null;
  scoutingMyTeamDropPreviewKey = "";
}
