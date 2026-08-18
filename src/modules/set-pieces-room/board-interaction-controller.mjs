import { DEFAULT_ACTION_DURATION_MS, setPieceDrawingTypes } from "./constants.mjs";
import { getSetPieceAssignedSlot, getSetPieceAssignment } from "./assignments.mjs";
import {
  getNearestSetPieceElement,
  getNextSetPiecePlayerPlacement,
  getSetPieceDistance,
  getSetPieceElementTransform,
  getSetPieceSvgPoint,
  isSetPiecePointInsideRect,
  normalizeSetPiecePoint,
  normalizeSetPiecePointForPitchView,
} from "./geometry.mjs";
import { createSetPiecePlayerLabelMap } from "./player-labels.mjs";
import { createSetPieceId } from "./state.mjs";
import { chooseSetPieceDrawingActor } from "./drawing-actors.mjs";

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
      ui.selectedDrawingId = "";
      ui.assignmentPickerSlotId = existing.id;
      ui.showAssignments = false;
      ui.inspectorCollapsed = false;
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
      ui.selectedDrawingId = "";
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
        const element = createBoardElement("opponent", point, { label: String(opponentNumber), showNumber: true });
        phase.elements.push(element);
        ui.selectedElementIds = new Set([element.id]);
        ui.assignmentPickerSlotId = "";
        ui.showAssignments = false;
        ui.inspectorCollapsed = false;
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
    const nearbyElement = ui.activeTool === "select" && !directElementId && !drawingId
      ? getNearestSetPieceElement(getVisibleElements(phase, ui), point, getSvgHitRadius(svg))
      : null;
    const elementId = directElementId || nearbyElement?.id || "";
    const stage = svg.closest?.("[data-set-piece-board-stage]");
    if (ui.activeTool === "select" && elementId) {
      if (event.shiftKey) {
        if (ui.selectedElementIds.has(elementId)) ui.selectedElementIds.delete(elementId);
        else ui.selectedElementIds.add(elementId);
      } else if (!ui.selectedElementIds.has(elementId)) {
        ui.selectedElementIds = new Set([elementId]);
      }
      ui.selectedDrawingId = "";
      ui.assignmentPickerSlotId = phase.elements.find((element) => element.id === elementId)?.kind === "home-player" ? elementId : "";
      ui.showAssignments = false;
      ui.inspectorCollapsed = false;
      const positions = new Map(phase.elements.filter((element) => ui.selectedElementIds.has(element.id)).map((element) => [element.id, { x: element.x, y: element.y }]));
      interaction = {
        type: "move",
        svg,
        stage,
        pointerId: event.pointerId,
        start: point,
        startClient: { x: event.clientX, y: event.clientY },
        positions,
        beforeState: structuredClone(options.getState()),
        moved: false,
      };
      capturePointer(stage, event.pointerId);
      refreshInteractionBoard();
      event.preventDefault();
      return;
    }
    if (ui.activeTool === "select" && drawingId && drawingId !== "preview") {
      ui.selectedElementIds.clear();
      ui.selectedDrawingId = drawingId;
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      ui.inspectorCollapsed = false;
      options.render();
      return;
    }
    if (["home-player", "opponent", "ball"].includes(ui.activeTool) && options.canEdit()) {
      placeElement(point);
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
      ui.selectedElementIds.clear();
      ui.selectedDrawingId = "";
      ui.assignmentPickerSlotId = "";
      ui.showAssignments = false;
      interaction = { type: "select", svg, stage, pointerId: event.pointerId, start: point };
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
    if (interaction.type === "move" && options.canEdit()) {
      const screenDistance = Math.hypot(event.clientX - interaction.startClient.x, event.clientY - interaction.startClient.y);
      if (!interaction.moved && screenDistance < 3) return;
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      interaction.moved = true;
      phase.elements.forEach((element) => {
        const origin = interaction.positions.get(element.id);
        if (!origin) return;
        Object.assign(element, normalizeSetPiecePointForPitchView({ x: origin.x + dx, y: origin.y + dy }, play?.pitchView));
        updateMovedElementDom(element);
      });
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
    if (completed.type === "move" && completed.moved && options.canEdit()) {
      options.finalizeDirectMutation(completed.beforeState);
      return;
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
        ui.selectedDrawingId = drawing.id;
        ui.selectedElementIds.clear();
        ui.activeTool = "select";
      });
      return;
    }
    if (completed.type === "select" && ui.selectionRect) {
      ui.selectedElementIds = new Set(phase.elements.filter((element) => isSetPiecePointInsideRect(element, ui.selectionRect)).map((element) => element.id));
    }
    ui.previewDrawing = null;
    ui.selectionRect = null;
    options.render();
  }

  function handlePointerCancel(event) {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    const cancelled = interaction;
    interaction = null;
    releasePointer(cancelled.stage, cancelled.pointerId);
    if (cancelled.type === "move") {
      const { phase } = options.getContext();
      phase?.elements?.forEach((element) => {
        const origin = cancelled.positions.get(element.id);
        if (origin) Object.assign(element, origin);
      });
    }
    options.ui.previewDrawing = null;
    options.ui.selectionRect = null;
    options.render();
  }

  function handleKeyDown(event) {
    if (!root?.closest?.(".workspace-view")?.classList.contains("is-active")) return;
    const editable = event.target?.matches?.("input, textarea, select, [contenteditable='true']");
    const key = String(event.key || "").toLowerCase();
    const focusedMarker = event.target?.closest?.("[data-element-id]");
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
    if (focusedMarker && !options.ui.presentationMode) {
      const elementId = focusedMarker.dataset.elementId;
      const { phase, play } = options.getContext();
      const element = phase?.elements?.find((candidate) => candidate.id === elementId);
      if (!element) return;
      if (key === "enter" || key === " ") {
        event.preventDefault();
        options.ui.selectedElementIds = new Set([elementId]);
        options.ui.selectedDrawingId = "";
        options.ui.assignmentPickerSlotId = element.kind === "home-player" ? elementId : "";
        options.ui.inspectorCollapsed = false;
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
        options.commit(() => {
          Object.assign(element, normalizeSetPiecePointForPitchView({
            x: element.x + direction.x * distance,
            y: element.y + direction.y * distance,
          }, play?.pitchView));
        });
        root?.querySelector?.(`[data-element-id="${CSS.escape(elementId)}"]`)?.focus?.();
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
    const tool = { v: "select", p: "home-player", o: "opponent", b: "ball", r: "run", a: "pass", d: "dribble", k: "block", e: "press", m: "mark", z: "zone" }[key];
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

  return Object.freeze({ handleKeyDown, handlePointerCancel, handlePointerDown, handlePointerMove, handlePointerUp, toggleRosterPlayer });
}
