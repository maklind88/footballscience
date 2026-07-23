import { finishSessionPlannerTacticalDraftLine } from "./session-planner-tactical-line-interaction-helpers.mjs";
import {
  getSessionPlannerTacticalKeyboardStep,
  isSessionPlannerTacticalCoarsePointer,
} from "./session-planner-tactical-placement-helpers.mjs";

export function createSessionPlannerTacticalInteractionController(deps = {}) {
  const {
    addElement,
    addPlacementElement,
    canEdit,
    clearSelection,
    cloneElement,
    createLineElement,
    getCanvasPoint,
    getDragElementIds,
    getElementById,
    getElementsInRect,
    getEndpointCoordinates,
    getPointFromRect,
    getRotationFromEvent,
    getSelectedElementIds,
    getSelectionRect,
    isGoalType,
    isLineTool,
    isPlacementTool,
    isSelectionToggleModifier,
    localState,
    moveElementByDelta,
    moveElements,
    normalizeRotation,
    refreshCanvas,
    setClickSuppression,
    setSelectedElements,
    shouldPlaceDoubleClick,
    syncInspector,
    toggleSelection,
    updateHandle,
  } = deps;

  function handleKeyboardAction(event) {
    if (!canEdit() || !localState.sessionPlannerTacticalboardOpen) {
      return false;
    }
    const elementTrigger = event.target?.closest?.("[data-session-tactical-element-id]");
    const elementId = elementTrigger?.dataset?.sessionTacticalElementId || "";
    const element = getElementById(elementId);
    if (!element) {
      return false;
    }
    const handleTrigger = event.target?.closest?.("[data-session-tactical-handle]");
    const rotateTrigger = event.target?.closest?.("[data-session-tactical-rotate-handle]");
    const key = String(event.key || "");
    if ((key === "Enter" || key === " ") && !handleTrigger && !rotateTrigger) {
      event.preventDefault();
      event.stopPropagation();
      if (isSelectionToggleModifier(event)) {
        toggleSelection(element.id, {
          focusTarget: { elementId: element.id },
        });
      } else {
        setSelectedElements([element.id], element.id);
        localState.sessionPlannerTacticalNumberPickerElementId = "";
        localState.sessionPlannerTacticalPendingPoint = null;
        localState.sessionPlannerTacticalDraftLineState = null;
        refreshCanvas({
          focusTarget: { elementId: element.id },
        });
      }
      return true;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const step = getSessionPlannerTacticalKeyboardStep(event);
    const deltaX = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
    const deltaY = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
    if (handleTrigger) {
      const handle = handleTrigger.dataset.sessionTacticalHandle;
      const coordinates = getEndpointCoordinates(element);
      const currentPoint = handle === "start"
        ? { x: coordinates?.x, y: coordinates?.y }
        : handle === "control"
          ? { x: coordinates?.controlX, y: coordinates?.controlY }
          : { x: coordinates?.x2, y: coordinates?.y2 };
      if (!Number.isFinite(Number(currentPoint.x)) || !Number.isFinite(Number(currentPoint.y))) {
        return false;
      }
      setSelectedElements([element.id], element.id);
      updateHandle(element.id, handle, {
        x: Number(currentPoint.x) + deltaX,
        y: Number(currentPoint.y) + deltaY,
      });
      refreshCanvas({
        persist: true,
        focusTarget: { elementId: element.id, handle },
      });
      return true;
    }
    if (rotateTrigger) {
      if (!isGoalType(element.type)) {
        return false;
      }
      const rotationStep = event.shiftKey ? 15 : 5;
      const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
      setSelectedElements([element.id], element.id);
      element.rotation = normalizeRotation(Number(element.rotation) + rotationStep * direction);
      refreshCanvas({
        persist: true,
        focusTarget: { elementId: element.id, rotate: true },
      });
      return true;
    }
    const selectedIds = getSelectedElementIds();
    const moveIds = selectedIds.includes(element.id) && selectedIds.length > 1
      ? selectedIds
      : [element.id];
    setSelectedElements(moveIds, element.id);
    moveIds.forEach((id) => {
      moveElementByDelta(getElementById(id), deltaX, deltaY);
    });
    refreshCanvas({
      persist: true,
      focusTarget: { elementId: element.id },
    });
    return true;
  }

  function startDrag(event) {
    if (!canEdit() || !localState.sessionPlannerTacticalboardOpen) {
      return;
    }
    if (event.target.closest?.(".session-tactical-number-picker")) {
      return;
    }
    const canvas = event.target.closest?.("[data-session-tactical-canvas]");
    if (!canvas) {
      return;
    }
    const toggleTrigger = event.target.closest?.("[data-session-tactical-element-id]");
    if (
      toggleTrigger
      && isSelectionToggleModifier(event)
      && localState.sessionPlannerTacticalTool !== "remove"
    ) {
      event.preventDefault();
      event.stopPropagation();
      toggleSelection(toggleTrigger.dataset.sessionTacticalElementId || "");
      setClickSuppression(true);
      return;
    }
    const handleTrigger = event.target.closest?.("[data-session-tactical-handle]");
    if (handleTrigger && localState.sessionPlannerTacticalTool !== "remove") {
      const element = getElementById(handleTrigger.dataset.sessionTacticalElementId);
      if (!element) {
        return;
      }
      event.preventDefault();
      setSelectedElements([element.id], element.id);
      localState.sessionPlannerTacticalNumberPickerElementId = "";
      localState.sessionPlannerTacticalPendingPoint = null;
      localState.sessionPlannerTacticalDraftLineState = null;
      localState.sessionPlannerTacticalDragState = {
        elementId: element.id,
        handle: handleTrigger.dataset.sessionTacticalHandle,
        canvasRect: canvas.getBoundingClientRect(),
        moved: false,
      };
      refreshCanvas();
      return;
    }
    const rotateTrigger = event.target.closest?.("[data-session-tactical-rotate-handle]");
    if (rotateTrigger && localState.sessionPlannerTacticalTool !== "remove") {
      const element = getElementById(rotateTrigger.dataset.sessionTacticalElementId);
      if (!isGoalType(element?.type)) {
        return;
      }
      event.preventDefault();
      setSelectedElements([element.id], element.id);
      localState.sessionPlannerTacticalNumberPickerElementId = "";
      localState.sessionPlannerTacticalPendingPoint = null;
      localState.sessionPlannerTacticalDraftLineState = null;
      localState.sessionPlannerTacticalDragState = {
        elementId: element.id,
        rotate: true,
        canvasRect: canvas.getBoundingClientRect(),
        moved: false,
      };
      return;
    }
    const elementTrigger = event.target.closest?.("[data-session-tactical-element-id]");
    if (elementTrigger && localState.sessionPlannerTacticalTool !== "remove") {
      const element = getElementById(elementTrigger.dataset.sessionTacticalElementId);
      if (!element) {
        return;
      }
      event.preventDefault();
      const dragIds = getDragElementIds(event, element.id);
      const initialElements = dragIds
        .map((elementId) => getElementById(elementId))
        .filter(Boolean)
        .map(cloneElement);
      setSelectedElements(dragIds, element.id);
      localState.sessionPlannerTacticalNumberPickerElementId = "";
      localState.sessionPlannerTacticalPendingPoint = null;
      localState.sessionPlannerTacticalDraftLineState = null;
      syncInspector();
      localState.sessionPlannerTacticalDragState = {
        elementId: element.id,
        elementIds: dragIds,
        canvasRect: canvas.getBoundingClientRect(),
        startPoint: getCanvasPoint(event, canvas),
        initialElement: cloneElement(element),
        initialElements,
        moved: false,
      };
      return;
    }
    if (isPlacementTool()) {
      event.preventDefault();
      localState.sessionPlannerTacticalNumberPickerElementId = "";
      const canvasRect = canvas.getBoundingClientRect();
      const point = getCanvasPoint(event, canvas, { snap: false });
      localState.sessionPlannerTacticalPendingPoint = null;
      localState.sessionPlannerTacticalDraftLineState = null;
      localState.sessionPlannerTacticalSelectionState = {
        canvasRect,
        startPoint: point,
        currentPoint: point,
        coarsePointer: isSessionPlannerTacticalCoarsePointer(event),
        moved: false,
      };
      return;
    }
    if (localState.sessionPlannerTacticalTool === "freehand") {
      event.preventDefault();
      const canvasRect = canvas.getBoundingClientRect();
      const point = getCanvasPoint(event, canvas, { snap: false });
      localState.sessionPlannerTacticalFreehandState = {
        canvasRect,
        points: [point],
        color: localState.sessionPlannerTacticalColor,
        lineWidth: localState.sessionPlannerTacticalLineWidth,
        lineStyle: localState.sessionPlannerTacticalLineStyle,
      };
      refreshCanvas();
      return;
    }
    if (isLineTool()) {
      event.preventDefault();
      const canvasRect = canvas.getBoundingClientRect();
      const point = getCanvasPoint(event, canvas);
      const pendingPointAtStart = localState.sessionPlannerTacticalPendingPoint
        ? { ...localState.sessionPlannerTacticalPendingPoint }
        : null;
      clearSelection();
      localState.sessionPlannerTacticalPendingPoint = null;
      localState.sessionPlannerTacticalDraftLineState = {
        type: localState.sessionPlannerTacticalTool,
        canvasRect,
        startPoint: point,
        currentPoint: point,
        pendingPointAtStart,
        moved: false,
      };
      refreshCanvas();
    }
  }

  function updateDrag(event) {
    if (localState.sessionPlannerTacticalDraftLineState) {
      const draftLine = localState.sessionPlannerTacticalDraftLineState;
      const point = getPointFromRect(event, draftLine.canvasRect);
      const distance = Math.hypot(
        point.x - draftLine.startPoint.x,
        point.y - draftLine.startPoint.y
      );
      draftLine.currentPoint = point;
      draftLine.moved = distance > 0.35;
      refreshCanvas();
      return;
    }
    if (localState.sessionPlannerTacticalSelectionState) {
      const selection = localState.sessionPlannerTacticalSelectionState;
      const point = getPointFromRect(event, selection.canvasRect, { snap: false });
      const distance = Math.hypot(
        point.x - selection.startPoint.x,
        point.y - selection.startPoint.y
      );
      selection.currentPoint = point;
      selection.moved = distance > 0.35;
      refreshCanvas();
      return;
    }
    if (localState.sessionPlannerTacticalDragState) {
      const dragState = localState.sessionPlannerTacticalDragState;
      const point = getPointFromRect(event, dragState.canvasRect);
      if (dragState.handle) {
        updateHandle(dragState.elementId, dragState.handle, point);
        dragState.moved = true;
        refreshCanvas();
        return;
      }
      if (dragState.rotate) {
        const element = getElementById(dragState.elementId);
        if (isGoalType(element?.type)) {
          element.rotation = getRotationFromEvent(event, element, dragState.canvasRect);
          dragState.moved = true;
          refreshCanvas();
        }
        return;
      }
      const deltaX = point.x - dragState.startPoint.x;
      const deltaY = point.y - dragState.startPoint.y;
      if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) {
        dragState.moved = true;
        moveElements(
          dragState.elementIds ?? [dragState.elementId],
          deltaX,
          deltaY
        );
        refreshCanvas();
      }
      return;
    }
    if (localState.sessionPlannerTacticalFreehandState) {
      const freehand = localState.sessionPlannerTacticalFreehandState;
      const point = getPointFromRect(event, freehand.canvasRect, { snap: false });
      const lastPoint = freehand.points.at(-1);
      if (Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) > 0.55) {
        freehand.points.push(point);
        refreshCanvas();
      }
    }
  }

  function finishDrag() {
    if (localState.sessionPlannerTacticalDraftLineState) {
      const draftLine = localState.sessionPlannerTacticalDraftLineState;
      localState.sessionPlannerTacticalDraftLineState = null;
      setClickSuppression(true);
      const lineAction = finishSessionPlannerTacticalDraftLine(draftLine);
      if (lineAction.action === "pending") {
        localState.sessionPlannerTacticalPendingPoint = lineAction.pendingPoint;
        refreshCanvas();
        return;
      }
      addElement(
        createLineElement(
          lineAction.type,
          lineAction.from,
          lineAction.to,
          lineAction.options
        )
      );
      return;
    }
    if (localState.sessionPlannerTacticalSelectionState) {
      const selection = localState.sessionPlannerTacticalSelectionState;
      const rect = getSelectionRect(selection);
      localState.sessionPlannerTacticalSelectionState = null;
      setClickSuppression(selection.moved);
      if (!selection.moved && isPlacementTool()) {
        const shouldPlace = selection.coarsePointer
          || shouldPlaceDoubleClick(selection.startPoint);
        if (shouldPlace) {
          setClickSuppression(true);
          if (!addPlacementElement(selection.startPoint)) {
            refreshCanvas();
          }
          return;
        }
        clearSelection();
      }
      if (selection.moved && rect) {
        setSelectedElements(getElementsInRect(rect).map((element) => element.id));
      }
      refreshCanvas();
      return;
    }
    if (localState.sessionPlannerTacticalDragState) {
      setClickSuppression(localState.sessionPlannerTacticalDragState.moved);
      localState.sessionPlannerTacticalDragState = null;
      refreshCanvas({ persist: true });
    }
    if (localState.sessionPlannerTacticalFreehandState) {
      const freehand = localState.sessionPlannerTacticalFreehandState;
      localState.sessionPlannerTacticalFreehandState = null;
      if (freehand.points.length > 1) {
        addElement({
          type: "freehand",
          x: freehand.points[0].x,
          y: freehand.points[0].y,
          points: freehand.points,
          color: freehand.color,
          lineWidth: freehand.lineWidth,
          lineStyle: freehand.lineStyle,
        });
        return;
      }
      clearSelection();
      refreshCanvas();
    }
  }

  return {
    finishDrag,
    handleKeyboardAction,
    startDrag,
    updateDrag,
  };
}
