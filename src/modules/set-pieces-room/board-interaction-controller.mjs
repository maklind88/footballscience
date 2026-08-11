import { DEFAULT_ACTION_DURATION_MS, setPieceDrawingTypes } from "./constants.mjs";
import {
  getNearestSetPieceElement,
  getSetPieceDistance,
  getSetPieceSvgPoint,
  isSetPiecePointInsideRect,
  normalizeSetPiecePoint,
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

  function placeElement(point) {
    const { phase } = options.getContext();
    const ui = options.ui;
    if (!phase) return;
    if (ui.activeTool === "home-player") {
      const roster = options.getRoster();
      const player = roster.find((entry) => entry.id === ui.selectedRosterId);
      if (!player) return;
      const existing = phase.elements.find((element) => element.kind === "home-player" && element.profileId === player.id);
      if (existing) {
        ui.selectedElementIds = new Set([existing.id]);
        ui.activeTool = "select";
        options.render();
        return;
      }
      const label = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player)).get(player.id) || "P";
      options.commit(() => {
        const element = createBoardElement("home-player", point, { profileId: player.id, label });
        phase.elements.push(element);
        ui.selectedElementIds = new Set([element.id]);
        ui.activeTool = "select";
      });
      return;
    }
    if (ui.activeTool === "opponent") {
      const used = new Set(phase.elements.filter((element) => element.kind === "opponent").map((element) => Number(element.label)));
      let opponentNumber = 1;
      while (used.has(opponentNumber)) opponentNumber += 1;
      options.commit(() => {
        const element = createBoardElement("opponent", point, { label: String(opponentNumber) });
        phase.elements.push(element);
        ui.selectedElementIds = new Set([element.id]);
        ui.activeTool = "select";
      });
      return;
    }
    if (ui.activeTool === "ball") {
      const existingBall = phase.elements.find((element) => element.kind === "ball");
      options.commit(() => {
        if (existingBall) Object.assign(existingBall, point);
        else phase.elements.push(createBoardElement("ball", point));
        ui.activeTool = "select";
      });
    }
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const svg = event.target.closest?.("[data-set-piece-pitch]");
    if (!svg) return;
    const point = getSetPieceSvgPoint(svg, event.clientX, event.clientY);
    const { phase } = options.getContext();
    if (!point || !phase) return;
    const ui = options.ui;
    const elementId = event.target.closest?.("[data-element-id]")?.dataset.elementId;
    const drawingId = event.target.closest?.("[data-drawing-id]")?.dataset.drawingId;
    if (ui.activeTool === "select" && elementId) {
      if (event.shiftKey) {
        if (ui.selectedElementIds.has(elementId)) ui.selectedElementIds.delete(elementId);
        else ui.selectedElementIds.add(elementId);
      } else if (!ui.selectedElementIds.has(elementId)) {
        ui.selectedElementIds = new Set([elementId]);
      }
      ui.selectedDrawingId = "";
      const positions = new Map(phase.elements.filter((element) => ui.selectedElementIds.has(element.id)).map((element) => [element.id, { x: element.x, y: element.y }]));
      interaction = { type: "move", svg, start: point, positions, beforeState: structuredClone(options.getState()), moved: false };
      options.renderBoardOnly();
      event.preventDefault();
      return;
    }
    if (ui.activeTool === "select" && drawingId && drawingId !== "preview") {
      ui.selectedElementIds.clear();
      ui.selectedDrawingId = drawingId;
      options.render();
      return;
    }
    if (["home-player", "opponent", "ball"].includes(ui.activeTool) && options.canEdit()) {
      placeElement(point);
      return;
    }
    if (setPieceDrawingTypes.has(ui.activeTool) && options.canEdit()) {
      interaction = { type: "draw", svg, start: point };
      ui.previewDrawing = { id: "preview", type: ui.activeTool, startX: point.x, startY: point.y, endX: point.x, endY: point.y, curve: 0 };
      options.renderBoardOnly();
      event.preventDefault();
      return;
    }
    if (ui.activeTool === "select") {
      ui.selectedElementIds.clear();
      ui.selectedDrawingId = "";
      interaction = { type: "select", svg, start: point };
      ui.selectionRect = { startX: point.x, startY: point.y, endX: point.x, endY: point.y };
      options.renderBoardOnly();
    }
  }

  function handlePointerMove(event) {
    if (!interaction) return;
    const point = getSetPieceSvgPoint(interaction.svg, event.clientX, event.clientY);
    const { phase } = options.getContext();
    if (!point || !phase) return;
    const ui = options.ui;
    if (interaction.type === "move" && options.canEdit()) {
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      interaction.moved ||= Math.hypot(dx, dy) > 0.35;
      phase.elements.forEach((element) => {
        const origin = interaction.positions.get(element.id);
        if (origin) Object.assign(element, normalizeSetPiecePoint({ x: origin.x + dx, y: origin.y + dy }));
      });
      options.renderBoardOnly();
    }
    if (interaction.type === "draw") {
      Object.assign(ui.previewDrawing, { endX: point.x, endY: point.y });
      options.renderBoardOnly();
    }
    if (interaction.type === "select") {
      Object.assign(ui.selectionRect, { endX: point.x, endY: point.y });
      options.renderBoardOnly();
    }
  }

  function handlePointerUp(event) {
    if (!interaction) return;
    const completed = interaction;
    interaction = null;
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
        type: ui.activeTool,
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

  return Object.freeze({ handleKeyDown, handlePointerDown, handlePointerMove, handlePointerUp });
}
