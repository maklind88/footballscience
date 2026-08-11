import { DEFAULT_ACTION_DURATION_MS, setPieceDrawingTypes } from "./constants.mjs";
import { getSetPieceAssignedSlot } from "./assignments.mjs";
import {
  getNearestSetPieceElement,
  getNextSetPiecePlayerPlacement,
  getSetPieceDistance,
  getSetPieceSvgPoint,
  isSetPiecePointInsideRect,
  normalizeSetPiecePoint,
  normalizeSetPiecePointForPitchView,
} from "./geometry.mjs";
import { createSetPiecePlayerLabelMap } from "./player-labels.mjs";
import { createSetPieceId } from "./state.mjs";

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
    if (marker) marker.setAttribute("transform", `translate(${element.x} ${element.y})`);
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
    if (existing) {
      ui.selectedElementIds = new Set([existing.id]);
      ui.selectedDrawingId = "";
      ui.assignmentPickerSlotId = existing.id;
      ui.showAssignments = false;
      ui.activeTool = "select";
      options.render();
      return;
    }
    const label = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player)).get(player.id) || "P";
    options.commit(() => {
      const element = createBoardElement("home-player", point, {
        ...(assignedSlot ? { id: assignedSlot.slotId, role: assignedSlot.role } : {}),
        profileId: player.id,
        label,
      });
      phase.elements.push(element);
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

  function addRosterPlayer(playerId) {
    const { phase, play } = options.getContext();
    if (!phase || !options.canEdit()) return;
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
      options.render();
      return;
    }
    if (["home-player", "opponent", "ball"].includes(ui.activeTool) && options.canEdit()) {
      placeElement(point);
      return;
    }
    if (setPieceDrawingTypes.has(ui.activeTool) && options.canEdit()) {
      interaction = { type: "draw", svg, stage, pointerId: event.pointerId, start: point, drawingType: ui.activeTool };
      capturePointer(stage, event.pointerId);
      ui.previewDrawing = { id: "preview", type: ui.activeTool, startX: point.x, startY: point.y, endX: point.x, endY: point.y, curve: 0 };
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
    if (completed.type === "draw" && getSetPieceDistance(completed.start, point) > 1.5) {
      const actor = getNearestSetPieceElement(phase.elements, completed.start);
      const drawing = {
        id: createSetPieceId("drawing"),
        type: completed.drawingType,
        startX: completed.start.x,
        startY: completed.start.y,
        endX: point.x,
        endY: point.y,
        actorId: actor?.id || "",
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

  return Object.freeze({ addRosterPlayer, handleKeyDown, handlePointerCancel, handlePointerDown, handlePointerMove, handlePointerUp });
}
