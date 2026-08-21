import {
  DEFAULT_ACTION_DURATION_MS,
  DEFAULT_SET_PIECE_OPPONENT_COLOR,
  DEFAULT_SET_PIECE_TEXT_BACKGROUND,
  DEFAULT_SET_PIECE_TEXT_COLOR,
  DEFAULT_SET_PIECE_TEXT_FONT_SIZE,
  setPieceDrawingTypes,
} from "./constants.mjs";
import { getSetPieceAssignedSlot, getSetPieceAssignment } from "./assignments.mjs";
import {
  getNearestSetPieceElement,
  getNextSetPiecePlayerPlacement,
  getSetPieceDistance,
  getSetPieceElementTransform,
  getSetPieceSvgPoint,
  isSetPiecePointInsideRect,
  normalizeSetPieceElementPointForPitchView,
} from "./geometry.mjs";
import { createSetPiecePlayerLabelMap } from "./player-labels.mjs";
import { createSetPieceId } from "./state.mjs";
import { chooseSetPieceDrawingActor } from "./drawing-actors.mjs";
import { translateSetPieceDrawing, updateSetPieceDrawingHandle } from "./drawing-geometry.mjs";
import { constrainSetPieceSelectionDelta, isSetPieceDrawingInsideRect } from "./selection-geometry.mjs";

const DOUBLE_SELECTION_DELAY_MS = 450;

function createBoardElement(kind, point, overrides = {}) {
  return {
    id: createSetPieceId(kind),
    kind,
    ...point,
    profileId: "",
    label: "",
    role: "",
    instruction: "",
    rotation: 0,
    delayMs: 0,
    durationMs: DEFAULT_ACTION_DURATION_MS,
    ...overrides,
  };
}

export function createSetPiecesBoardInteractionController(options = {}) {
  const root = options.root;
  let interaction = null;
  let lastSelectionActivation = { key: "", at: 0 };
  let lastDirectSelectionTarget = { elementId: "", drawingId: "" };

  function resetSelectionActivation() {
    lastSelectionActivation = { key: "", at: 0 };
  }

  function getSelectedDrawingIds() {
    if (!(options.ui.selectedDrawingIds instanceof Set)) {
      options.ui.selectedDrawingIds = new Set(options.ui.selectedDrawingId ? [options.ui.selectedDrawingId] : []);
    }
    return options.ui.selectedDrawingIds;
  }

  function clearDrawingSelection() {
    getSelectedDrawingIds().clear();
    options.ui.selectedDrawingId = "";
  }

  function setPrimaryDrawingId(drawingId = "") {
    options.ui.selectedDrawingId = drawingId || [...getSelectedDrawingIds()].at(-1) || "";
  }

  function getSelectionCount() {
    return options.ui.selectedElementIds.size + getSelectedDrawingIds().size;
  }

  function registerSelectionActivation(key, event, elementId = "") {
    const at = Number.isFinite(Number(event?.timeStamp)) ? Number(event.timeStamp) : Date.now();
    const isRepeated = lastSelectionActivation.key === key
      && at - lastSelectionActivation.at >= 0
      && at - lastSelectionActivation.at <= DOUBLE_SELECTION_DELAY_MS;
    lastSelectionActivation = isRepeated ? { key: "", at: 0 } : { key, at };
    if (!isRepeated) return false;
    const { phase } = options.getContext();
    const element = elementId ? phase?.elements?.find((candidate) => candidate.id === elementId) : null;
    options.ui.assignmentPickerSlotId = element?.kind === "home-player" ? elementId : "";
    options.ui.showAssignments = false;
    options.ui.inspectorCollapsed = false;
    return true;
  }

  function getVisibleElements(phase, ui) {
    return (phase?.elements || []).filter((element) => {
      if (element.kind === "home-player") return ui.layers.has("home");
      if (element.kind === "opponent") return ui.layers.has("opponent");
      return ui.layers.has("ball");
    });
  }

  function getSvgHitRadius(svg, pixels = 22) {
    const matrix = svg?.getScreenCTM?.();
    if (!matrix) return 3.5;
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    const scale = Math.max(0.01, Math.min(scaleX || scaleY, scaleY || scaleX));
    return Math.min(5, Math.max(1.6, pixels / scale));
  }

  function refreshInteractionBoard() {
    options.renderBoardOnly();
    const activeSvg = root?.querySelector?.("[data-set-piece-pitch]");
    if (interaction && activeSvg) interaction.svg = activeSvg;
  }

  function capturePointer(stage, pointerId) {
    try {
      stage?.setPointerCapture?.(pointerId);
    } catch {
      // Pointer capture is an enhancement; document listeners remain the fallback.
    }
  }

  function releasePointer(stage, pointerId) {
    try {
      if (stage?.hasPointerCapture?.(pointerId)) stage.releasePointerCapture(pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
  }

  function updateMovedElementDom(element) {
    const marker = root?.querySelector?.(`.spr-element-layer [data-element-id="${CSS.escape(element.id)}"]`);
    const pitchView = marker?.closest?.("[data-set-piece-pitch]")?.dataset?.pitchView || "full";
    if (marker) marker.setAttribute("transform", getSetPieceElementTransform(element, pitchView));
  }

  function placeHomePlayer(point, rosterId = options.ui.selectedRosterId) {
    const { play, variant, phase } = options.getContext();
    const ui = options.ui;
    if (!phase) return;
    const roster = options.getRoster();
    const player = roster.find((entry) => entry.id === rosterId);
    if (!player) return;
    ui.selectedRosterId = player.id;
    const assignedSlot = getSetPieceAssignedSlot(play, variant, player.id);
    const existing = phase.elements.find((element) => (
      element.kind === "home-player" &&
      (element.profileId === player.id || element.id === assignedSlot?.slotId)
    ));
    if (existing && variant.phases.every((candidatePhase) => candidatePhase.elements.some((element) => element.id === existing.id))) {
      ui.selectedElementIds = new Set([existing.id]);
      clearDrawingSelection();
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      ui.activeTool = "select";
      options.render();
      return;
    }
    const label = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player)).get(player.id) || "P";
    options.commit(() => {
      const phaseTemplates = variant.phases
        .map((candidatePhase, index) => ({
          index,
          element: candidatePhase.elements.find((element) => (
            element.kind === "home-player" &&
            (element.profileId === player.id || element.id === assignedSlot?.slotId)
          )),
        }))
        .filter((entry) => entry.element);
      const template = phaseTemplates[0]?.element;
      const element = createBoardElement("home-player", point, {
        ...(template || {}),
        ...(assignedSlot ? { id: assignedSlot.slotId, role: assignedSlot.role } : {}),
        profileId: player.id,
        label,
        ...point,
      });
      variant.phases.forEach((candidatePhase, index) => {
        if (candidatePhase.elements.some((candidate) => candidate.id === element.id)) return;
        const nearestTemplate = phaseTemplates.reduce((nearest, entry) => (
          !nearest || Math.abs(entry.index - index) < Math.abs(nearest.index - index) ? entry : nearest
        ), null)?.element;
        candidatePhase.elements.push({
          ...structuredClone(element),
          x: Number(nearestTemplate?.x ?? point.x),
          y: Number(nearestTemplate?.y ?? point.y),
        });
      });
      ui.selectedElementIds = new Set([element.id]);
      clearDrawingSelection();
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      ui.activeTool = "select";
    });
  }

  function placeElement(point) {
    const { phase } = options.getContext();
    const ui = options.ui;
    if (!phase) return;
    if (ui.activeTool === "home-player") {
      placeHomePlayer(point);
      return;
    }
    if (ui.activeTool === "opponent") {
      const used = new Set(phase.elements.filter((element) => element.kind === "opponent").map((element) => Number(element.label)));
      let opponentNumber = 1;
      while (used.has(opponentNumber)) opponentNumber += 1;
      options.commit(() => {
        const element = createBoardElement("opponent", point, {
          label: String(opponentNumber),
          showNumber: true,
          opponentColor: DEFAULT_SET_PIECE_OPPONENT_COLOR,
        });
        phase.elements.push(element);
        ui.selectedElementIds = new Set([element.id]);
        clearDrawingSelection();
        ui.assignmentPickerSlotId = "";
        ui.showAssignments = false;
        ui.activeTool = "select";
      });
      return;
    }
    if (ui.activeTool === "ball") {
      const existingBall = phase.elements.find((element) => element.kind === "ball");
      options.commit(() => {
        if (existingBall) Object.assign(existingBall, point);
        else phase.elements.push(createBoardElement("ball", point));
        ui.assignmentPickerSlotId = "";
        ui.showAssignments = false;
        ui.activeTool = "select";
      });
    }
  }

  function placeTextAnnotation(point) {
    const { phase } = options.getContext();
    const ui = options.ui;
    if (!phase || !options.canEdit()) return;
    const drawing = {
      id: createSetPieceId("drawing"),
      type: "text",
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
      actorId: "",
      label: "Text",
      curve: 0,
      fontSize: DEFAULT_SET_PIECE_TEXT_FONT_SIZE,
      textColor: DEFAULT_SET_PIECE_TEXT_COLOR,
      textBackground: DEFAULT_SET_PIECE_TEXT_BACKGROUND,
    };
    options.commit(() => {
      phase.drawings.push(drawing);
      getSelectedDrawingIds().clear();
      getSelectedDrawingIds().add(drawing.id);
      ui.selectedDrawingId = drawing.id;
      ui.selectedElementIds.clear();
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      ui.inspectorCollapsed = false;
      ui.activeTool = "select";
    });
    options.focusDrawingLabel?.();
  }

  function toggleRosterPlayer(playerId) {
    const { phase, play, variant } = options.getContext();
    if (!phase || !play || !variant) return;
    const placedSlotIds = new Set((variant.phases || []).flatMap((candidatePhase) => (
      candidatePhase.elements || []
    )).filter((element) => (
      element.kind === "home-player" && getSetPieceAssignment(play, variant, element.id).profileId === playerId
    )).map((element) => element.id));
    if (placedSlotIds.size) {
      if (!options.canDelete()) {
        options.setNotice?.("Only coaches and admins can remove players from the board.");
        return;
      }
      options.commit(() => {
        variant.phases.forEach((candidatePhase) => {
          candidatePhase.elements = candidatePhase.elements.filter((element) => !placedSlotIds.has(element.id));
        });
        variant.assignmentOverrides = (variant.assignmentOverrides || [])
          .filter((assignment) => !placedSlotIds.has(assignment.slotId));
        options.ui.selectedElementIds = new Set([...options.ui.selectedElementIds]
          .filter((elementId) => !placedSlotIds.has(elementId)));
        options.ui.assignmentPickerSlotId = "";
        options.ui.showAssignments = false;
      });
      return;
    }
    if (!options.canEdit()) return;
    const point = getNextSetPiecePlayerPlacement(phase.elements, play?.pitchView);
    placeHomePlayer(point, playerId);
  }

  function handlePointerDown(event) {
    if (interaction || event.button !== 0 || event.isPrimary === false) return;
    const svg = event.target.closest?.("[data-set-piece-pitch]");
    if (!svg) return;
    const point = getSetPieceSvgPoint(svg, event.clientX, event.clientY);
    const { phase } = options.getContext();
    if (!point || !phase) return;
    const ui = options.ui;
    if (ui.presentationMode) return;
    const directElementId = event.target.closest?.("[data-element-id]")?.dataset.elementId;
    const drawingId = event.target.closest?.("[data-drawing-id]")?.dataset.drawingId;
    const drawingHandle = event.target.closest?.("[data-drawing-handle]")?.dataset.drawingHandle;
    const nearbyElement = ui.activeTool === "select" && !directElementId && !drawingId
      ? getNearestSetPieceElement(getVisibleElements(phase, ui), point, getSvgHitRadius(svg))
      : null;
    const elementId = directElementId || nearbyElement?.id || "";
    lastDirectSelectionTarget = {
      elementId,
      drawingId: drawingId && drawingId !== "preview" ? drawingId : "",
    };
    const stage = svg.closest?.("[data-set-piece-board-stage]");
    if (ui.activeTool === "select" && elementId) {
      const selectionSurfaceWasOpen = Boolean(ui.assignmentPickerSlotId || ui.showAssignments);
      let selectionChanged = false;
      if (event.shiftKey) {
        if (ui.selectedElementIds.has(elementId)) ui.selectedElementIds.delete(elementId);
        else ui.selectedElementIds.add(elementId);
        selectionChanged = true;
      } else if (!ui.selectedElementIds.has(elementId)) {
        ui.selectedElementIds = new Set([elementId]);
        clearDrawingSelection();
        selectionChanged = true;
      }
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      if (!ui.selectedElementIds.has(elementId)) {
        resetSelectionActivation();
        options.render();
        return;
      }
      interaction = {
        type: "move-selection",
        svg,
        stage,
        pointerId: event.pointerId,
        start: point,
        startClient: { x: event.clientX, y: event.clientY },
        elements: new Map(phase.elements
          .filter((element) => ui.selectedElementIds.has(element.id))
          .map((element) => [element.id, structuredClone(element)])),
        drawings: new Map(phase.drawings
          .filter((drawing) => getSelectedDrawingIds().has(drawing.id))
          .map((drawing) => [drawing.id, structuredClone(drawing)])),
        beforeState: structuredClone(options.getState()),
        moved: false,
        selectionKey: `element:${elementId}`,
        allowInspectorActivation: !event.shiftKey && getSelectionCount() === 1,
        selectionChanged,
        selectionSurfaceWasOpen,
      };
      capturePointer(stage, event.pointerId);
      if (selectionChanged) {
        refreshInteractionBoard();
        event.preventDefault();
      }
      return;
    }
    if (ui.activeTool === "select" && drawingId && drawingId !== "preview") {
      const drawing = phase.drawings.find((candidate) => candidate.id === drawingId);
      if (!drawing) return;
      const selectedDrawingIds = getSelectedDrawingIds();
      const selectionSurfaceWasOpen = Boolean(ui.assignmentPickerSlotId || ui.showAssignments);
      let selectionChanged = false;
      if (event.shiftKey) {
        if (selectedDrawingIds.has(drawingId)) selectedDrawingIds.delete(drawingId);
        else selectedDrawingIds.add(drawingId);
        selectionChanged = true;
      } else if (!selectedDrawingIds.has(drawingId)) {
        ui.selectedElementIds.clear();
        selectedDrawingIds.clear();
        selectedDrawingIds.add(drawingId);
        selectionChanged = true;
      }
      setPrimaryDrawingId(selectedDrawingIds.has(drawingId) ? drawingId : "");
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      if (!selectedDrawingIds.has(drawingId)) {
        resetSelectionActivation();
        options.render();
        return;
      }
      if (drawingHandle && options.canEdit()) {
        resetSelectionActivation();
        interaction = {
          type: "transform-drawing",
          svg,
          stage,
          pointerId: event.pointerId,
          start: point,
          startClient: { x: event.clientX, y: event.clientY },
          drawingId,
          drawingHandle,
          original: structuredClone(drawing),
          beforeState: structuredClone(options.getState()),
          moved: false,
        };
        capturePointer(stage, event.pointerId);
        refreshInteractionBoard();
        event.preventDefault();
        return;
      }
      if (options.canEdit()) {
        interaction = {
          type: "move-selection",
          svg,
          stage,
          pointerId: event.pointerId,
          start: point,
          startClient: { x: event.clientX, y: event.clientY },
          elements: new Map(phase.elements
            .filter((element) => ui.selectedElementIds.has(element.id))
            .map((element) => [element.id, structuredClone(element)])),
          drawings: new Map(phase.drawings
            .filter((candidate) => selectedDrawingIds.has(candidate.id))
            .map((candidate) => [candidate.id, structuredClone(candidate)])),
          beforeState: structuredClone(options.getState()),
          moved: false,
          selectionKey: `drawing:${drawingId}`,
          allowInspectorActivation: !event.shiftKey && getSelectionCount() === 1,
          selectionChanged,
          selectionSurfaceWasOpen,
        };
        capturePointer(stage, event.pointerId);
        if (selectionChanged) {
          refreshInteractionBoard();
          event.preventDefault();
        }
        return;
      }
      if (!event.shiftKey) registerSelectionActivation(`drawing:${drawingId}`, event);
      else resetSelectionActivation();
      options.render();
      return;
    }
    if (["home-player", "opponent", "ball"].includes(ui.activeTool) && options.canEdit()) {
      placeElement(point);
      return;
    }
    if (ui.activeTool === "text" && options.canEdit()) {
      placeTextAnnotation(point);
      event.preventDefault();
      return;
    }
    if (setPieceDrawingTypes.has(ui.activeTool) && options.canEdit()) {
      const actor = chooseSetPieceDrawingActor(phase, ui.activeTool, point, ui.selectedElementIds, {
        maxDistance: getSvgHitRadius(svg, 30),
      });
      const start = actor ? { x: Number(actor.x || 0), y: Number(actor.y || 0) } : point;
      interaction = { type: "draw", svg, stage, pointerId: event.pointerId, start, pointerStart: point, drawingType: ui.activeTool, actorId: actor?.id || "" };
      capturePointer(stage, event.pointerId);
      ui.previewDrawing = { id: "preview", type: ui.activeTool, startX: start.x, startY: start.y, endX: point.x, endY: point.y, curve: 0 };
      refreshInteractionBoard();
      event.preventDefault();
      return;
    }
    if (ui.activeTool === "select") {
      resetSelectionActivation();
      const additive = event.shiftKey;
      const initialElementIds = new Set(ui.selectedElementIds);
      const initialDrawingIds = new Set(getSelectedDrawingIds());
      if (!additive) {
        ui.selectedElementIds.clear();
        clearDrawingSelection();
      }
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      interaction = { type: "select", svg, stage, pointerId: event.pointerId, start: point, additive, initialElementIds, initialDrawingIds };
      capturePointer(stage, event.pointerId);
      ui.selectionRect = { startX: point.x, startY: point.y, endX: point.x, endY: point.y };
      refreshInteractionBoard();
      event.preventDefault();
    }
  }

  function handlePointerMove(event) {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    const point = getSetPieceSvgPoint(interaction.svg, event.clientX, event.clientY);
    const { phase, play } = options.getContext();
    if (!point || !phase) return;
    const ui = options.ui;
    if (interaction.type === "move-selection" && options.canEdit()) {
      const screenDistance = Math.hypot(event.clientX - interaction.startClient.x, event.clientY - interaction.startClient.y);
      if (!interaction.moved && screenDistance < 3) return;
      if (!interaction.moved) resetSelectionActivation();
      const delta = constrainSetPieceSelectionDelta(
        [...interaction.elements.values()],
        [...interaction.drawings.values()],
        { x: point.x - interaction.start.x, y: point.y - interaction.start.y },
        play?.pitchView
      );
      interaction.moved = true;
      phase.elements.forEach((element) => {
        const origin = interaction.elements.get(element.id);
        if (!origin) return;
        Object.assign(element, { x: origin.x + delta.x, y: origin.y + delta.y });
        updateMovedElementDom(element);
      });
      phase.drawings.forEach((drawing) => {
        const origin = interaction.drawings.get(drawing.id);
        if (origin) Object.assign(drawing, translateSetPieceDrawing(origin, delta, play?.pitchView));
      });
      if (interaction.drawings.size) refreshInteractionBoard();
      event.preventDefault();
    }
    if (interaction.type === "transform-drawing" && options.canEdit()) {
      const screenDistance = Math.hypot(event.clientX - interaction.startClient.x, event.clientY - interaction.startClient.y);
      if (!interaction.moved && screenDistance < 3) return;
      if (!interaction.moved) resetSelectionActivation();
      const drawing = phase.drawings.find((candidate) => candidate.id === interaction.drawingId);
      if (!drawing) return;
      interaction.moved = true;
      Object.assign(drawing, updateSetPieceDrawingHandle(
        interaction.original,
        interaction.drawingHandle,
        point,
        play?.pitchView
      ));
      refreshInteractionBoard();
      event.preventDefault();
    }
    if (interaction.type === "draw") {
      Object.assign(ui.previewDrawing, { endX: point.x, endY: point.y });
      refreshInteractionBoard();
      event.preventDefault();
    }
    if (interaction.type === "select") {
      Object.assign(ui.selectionRect, { endX: point.x, endY: point.y });
      refreshInteractionBoard();
      event.preventDefault();
    }
  }

  function handlePointerUp(event) {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    const completed = interaction;
    interaction = null;
    releasePointer(completed.stage, completed.pointerId);
    const point = getSetPieceSvgPoint(completed.svg, event.clientX, event.clientY) || completed.start;
    const { phase } = options.getContext();
    const ui = options.ui;
    if (!phase) return;
    if (completed.type === "move-selection" && completed.moved && options.canEdit()) {
      options.finalizeDirectMutation(completed.beforeState);
      return;
    }
    if (completed.type === "transform-drawing" && completed.moved && options.canEdit()) {
      options.finalizeDirectMutation(completed.beforeState);
      return;
    }
    let selectionActivated = false;
    if (completed.type === "move-selection" && completed.allowInspectorActivation) {
      const elementId = completed.selectionKey.startsWith("element:")
        ? completed.selectionKey.replace("element:", "")
        : "";
      selectionActivated = registerSelectionActivation(completed.selectionKey, event, elementId);
    }
    if (completed.type === "draw" && getSetPieceDistance(completed.pointerStart || completed.start, point) > 1.5) {
      const drawing = {
        id: createSetPieceId("drawing"),
        type: completed.drawingType,
        startX: completed.start.x,
        startY: completed.start.y,
        endX: point.x,
        endY: point.y,
        actorId: completed.actorId,
        label: "",
        curve: 0,
      };
      ui.previewDrawing = null;
      options.commit(() => {
        phase.drawings.push(drawing);
        getSelectedDrawingIds().clear();
        getSelectedDrawingIds().add(drawing.id);
        ui.selectedDrawingId = drawing.id;
        ui.selectedElementIds.clear();
        ui.activeTool = "select";
      });
      return;
    }
    if (completed.type === "select" && ui.selectionRect) {
      const elementIds = new Set(getVisibleElements(phase, ui)
        .filter((element) => isSetPiecePointInsideRect(element, ui.selectionRect))
        .map((element) => element.id));
      const drawingIds = new Set((ui.layers.has("drawings") ? phase.drawings : [])
        .filter((drawing) => isSetPieceDrawingInsideRect(drawing, ui.selectionRect))
        .map((drawing) => drawing.id));
      ui.selectedElementIds = completed.additive
        ? new Set([...completed.initialElementIds, ...elementIds])
        : elementIds;
      ui.selectedDrawingIds = completed.additive
        ? new Set([...completed.initialDrawingIds, ...drawingIds])
        : drawingIds;
      setPrimaryDrawingId();
    }
    ui.previewDrawing = null;
    ui.selectionRect = null;
    if (
      completed.type === "move-selection"
      && !completed.selectionChanged
      && !completed.selectionSurfaceWasOpen
      && !selectionActivated
    ) return;
    options.render();
  }

  function handlePointerCancel(event) {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    const cancelled = interaction;
    interaction = null;
    releasePointer(cancelled.stage, cancelled.pointerId);
    if (cancelled.type === "move-selection") {
      resetSelectionActivation();
      const { phase } = options.getContext();
      phase?.elements?.forEach((element) => {
        const origin = cancelled.elements.get(element.id);
        if (origin) Object.assign(element, origin);
      });
      phase?.drawings?.forEach((drawing) => {
        const origin = cancelled.drawings.get(drawing.id);
        if (origin) Object.assign(drawing, origin);
      });
    }
    if (cancelled.type === "transform-drawing") {
      resetSelectionActivation();
      const { phase } = options.getContext();
      const drawing = phase?.drawings?.find((candidate) => candidate.id === cancelled.drawingId);
      if (drawing) Object.assign(drawing, cancelled.original);
    }
    options.ui.previewDrawing = null;
    options.ui.selectionRect = null;
    options.render();
  }

  function handleDoubleClick(event) {
    if (options.ui.presentationMode) return;
    const svg = event.target?.closest?.("[data-set-piece-pitch]")
      || event.target?.closest?.("[data-set-piece-board-stage]")?.querySelector?.("[data-set-piece-pitch]");
    if (!svg) return;
    const elementId = event.target.closest?.("[data-element-id]")?.dataset.elementId
      || lastDirectSelectionTarget.elementId;
    const drawingId = event.target.closest?.("[data-drawing-id]")?.dataset.drawingId
      || lastDirectSelectionTarget.drawingId;
    const { phase } = options.getContext();
    const element = elementId ? phase?.elements?.find((candidate) => candidate.id === elementId) : null;
    const drawing = drawingId && drawingId !== "preview"
      ? phase?.drawings?.find((candidate) => candidate.id === drawingId)
      : null;
    if (!element && !drawing) return;
    if (element) {
      options.ui.selectedElementIds = new Set([element.id]);
      clearDrawingSelection();
      options.ui.assignmentPickerSlotId = element.kind === "home-player" ? element.id : "";
    } else {
      options.ui.selectedElementIds.clear();
      getSelectedDrawingIds().clear();
      getSelectedDrawingIds().add(drawing.id);
      options.ui.selectedDrawingId = drawing.id;
      options.ui.assignmentPickerSlotId = "";
    }
    options.ui.showAssignments = false;
    options.ui.inspectorCollapsed = false;
    lastDirectSelectionTarget = { elementId: "", drawingId: "" };
    resetSelectionActivation();
    options.render();
    event.preventDefault();
  }

  function handleKeyDown(event) {
    if (!root?.closest?.(".workspace-view")?.classList.contains("is-active")) return;
    resetSelectionActivation();
    const editable = event.target?.matches?.("input, textarea, select, [contenteditable='true']");
    const key = String(event.key || "").toLowerCase();
    const focusedMarker = event.target?.closest?.("[data-element-id]");
    const focusedDrawing = event.target?.closest?.("[data-drawing-id]");
    if (options.ui.presentationMode) {
      if (editable) return;
      if (key === " ") {
        event.preventDefault();
        options.playback.toggle();
      }
      if (key === "arrowleft") {
        event.preventDefault();
        options.selectAdjacentPhase?.(-1);
      }
      if (key === "arrowright") {
        event.preventDefault();
        options.selectAdjacentPhase?.(1);
      }
      if (key === "arrowup") {
        event.preventDefault();
        options.selectAdjacentVariant?.(-1);
      }
      if (key === "arrowdown") {
        event.preventDefault();
        options.selectAdjacentVariant?.(1);
      }
      if (key === "home") {
        event.preventDefault();
        options.restartPlayback?.();
      }
      if (key === "f") {
        event.preventDefault();
        options.toggleFullscreen?.();
      }
      if (key === "escape") {
        if (options.isFullscreen?.()) return;
        event.preventDefault();
        options.playback.stop();
        options.setPresentationMode?.(false);
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      event.shiftKey ? options.redo() : options.undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === "y") {
      event.preventDefault();
      options.redo();
      return;
    }
    if (editable) return;
    if ((event.metaKey || event.ctrlKey) && key === "c") {
      if (options.copySelection?.()) event.preventDefault();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === "v") {
      if (options.pasteSelection?.()) event.preventDefault();
      return;
    }
    if (focusedMarker && !options.ui.presentationMode) {
      const elementId = focusedMarker.dataset.elementId;
      const { phase, play } = options.getContext();
      const element = phase?.elements?.find((candidate) => candidate.id === elementId);
      if (!element) return;
      if (key === "enter" || key === " ") {
        event.preventDefault();
        options.ui.selectedElementIds = new Set([elementId]);
        clearDrawingSelection();
        options.ui.assignmentPickerSlotId = key === "enter" && element.kind === "home-player" ? elementId : "";
        if (key === "enter") options.ui.inspectorCollapsed = false;
        options.render();
        root?.querySelector?.(`[data-element-id="${CSS.escape(elementId)}"]`)?.focus?.();
        return;
      }
      const direction = {
        arrowleft: { x: -1, y: 0 },
        arrowright: { x: 1, y: 0 },
        arrowup: { x: 0, y: -1 },
        arrowdown: { x: 0, y: 1 },
      }[key];
      if (direction && options.canEdit()) {
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 1;
        options.ui.selectedElementIds = new Set([elementId]);
        clearDrawingSelection();
        options.commit(() => {
          Object.assign(element, normalizeSetPieceElementPointForPitchView({
            x: element.x + direction.x * distance,
            y: element.y + direction.y * distance,
          }, play?.pitchView, element.kind));
        });
        root?.querySelector?.(`[data-element-id="${CSS.escape(elementId)}"]`)?.focus?.();
        return;
      }
    }
    if (focusedDrawing && !options.ui.presentationMode) {
      const drawingId = focusedDrawing.dataset.drawingId;
      const { phase, play } = options.getContext();
      const drawing = phase?.drawings?.find((candidate) => candidate.id === drawingId);
      if (!drawing) return;
      if (key === "enter" || key === " ") {
        event.preventDefault();
        options.ui.selectedElementIds.clear();
        getSelectedDrawingIds().clear();
        getSelectedDrawingIds().add(drawingId);
        options.ui.selectedDrawingId = drawingId;
        if (key === "enter") options.ui.inspectorCollapsed = false;
        options.render();
        root?.querySelector?.(`[data-drawing-id="${CSS.escape(drawingId)}"]`)?.focus?.();
        return;
      }
      const direction = {
        arrowleft: { x: -1, y: 0 },
        arrowright: { x: 1, y: 0 },
        arrowup: { x: 0, y: -1 },
        arrowdown: { x: 0, y: 1 },
      }[key];
      if (direction && options.canEdit()) {
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 1;
        options.ui.selectedElementIds.clear();
        getSelectedDrawingIds().clear();
        getSelectedDrawingIds().add(drawingId);
        options.ui.selectedDrawingId = drawingId;
        options.commit(() => {
          Object.assign(drawing, translateSetPieceDrawing(drawing, {
            x: direction.x * distance,
            y: direction.y * distance,
          }, play?.pitchView));
        });
        root?.querySelector?.(`[data-drawing-id="${CSS.escape(drawingId)}"]`)?.focus?.();
        return;
      }
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      options.deleteSelection();
      return;
    }
    if (key === " ") {
      event.preventDefault();
      options.playback.toggle();
      return;
    }
    const tool = { v: "select", p: "home-player", o: "opponent", b: "ball", r: "run", a: "pass", d: "dribble", k: "block", e: "press", m: "mark", z: "zone", t: "text" }[key];
    if (tool) {
      if (tool === "home-player") {
        options.ui.activeTool = "select";
        options.render();
        const picker = root.querySelector?.("[data-set-piece-player-picker]");
        if (picker) {
          picker.open = true;
          picker.querySelector?.("summary")?.focus?.();
        }
        return;
      }
      options.ui.activeTool = tool;
      options.render();
    }
    if (key === "escape") {
      options.playback.stop();
      options.ui.presentationMode = false;
      options.ui.activeTool = "select";
      options.render();
    }
  }

  return Object.freeze({
    handleDoubleClick,
    handleKeyDown,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetSelectionActivation,
    toggleRosterPlayer,
  });
}
