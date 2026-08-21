import { translateSetPieceDrawing } from "./drawing-geometry.mjs";
import { constrainSetPieceSelectionDelta } from "./selection-geometry.mjs";
import { createSetPieceId } from "./state.mjs";

const DEFAULT_PASTE_OFFSET = 2;

function toIdSet(candidate) {
  return candidate instanceof Set ? candidate : new Set(candidate || []);
}

export function createSetPieceBoardClipboard(phase = {}, selection = {}) {
  const elementIds = toIdSet(selection.elementIds);
  const drawingIds = toIdSet(selection.drawingIds);
  const elements = (phase.elements || []).filter((element) => elementIds.has(element.id));
  const drawings = (phase.drawings || []).filter((drawing) => drawingIds.has(drawing.id));
  if (!elements.length && !drawings.length) return null;
  return structuredClone({ elements, drawings });
}

export function pasteSetPieceBoardClipboard(clipboard = {}, options = {}) {
  const createId = options.createId || createSetPieceId;
  const pitchView = options.pitchView || "full";
  const pasteIndex = Math.max(1, Number(options.pasteIndex || 1));
  const existingElementIds = options.existingElementIds == null
    ? null
    : toIdSet(options.existingElementIds);
  const elementIdMap = new Map();
  const elements = (clipboard.elements || []).map((source) => {
    const id = createId(source.kind || "element");
    elementIdMap.set(source.id, id);
    return { ...structuredClone(source), id };
  });
  const drawings = (clipboard.drawings || []).map((source) => ({
    ...structuredClone(source),
    id: createId("drawing"),
    actorId: elementIdMap.get(source.actorId)
      || (existingElementIds?.has(source.actorId) || existingElementIds == null ? source.actorId : "")
      || "",
  }));
  if (!elements.length && !drawings.length) {
    return { elements: [], drawings: [], elementIds: new Set(), drawingIds: new Set() };
  }

  const requestedOffset = DEFAULT_PASTE_OFFSET * pasteIndex;
  const delta = constrainSetPieceSelectionDelta(
    elements,
    drawings,
    { x: requestedOffset, y: requestedOffset },
    pitchView
  );
  elements.forEach((element) => {
    element.x = Number(element.x || 0) + delta.x;
    element.y = Number(element.y || 0) + delta.y;
  });
  drawings.forEach((drawing) => Object.assign(
    drawing,
    translateSetPieceDrawing(drawing, delta, pitchView)
  ));

  return {
    elements,
    drawings,
    elementIds: new Set(elements.map((element) => element.id)),
    drawingIds: new Set(drawings.map((drawing) => drawing.id)),
  };
}
