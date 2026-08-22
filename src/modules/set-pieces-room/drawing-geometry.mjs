import {
  clampSetPieceCoordinate,
  getSetPiecePitchBounds,
  normalizeSetPiecePointForPitchView,
} from "./geometry.mjs";

const MIN_ZONE_SIZE = 3;
const MAX_CURVE = 36;

export function getSetPieceDrawingControlPoint(drawing = {}) {
  const startX = Number(drawing.startX || 0);
  const startY = Number(drawing.startY || 0);
  const endX = Number(drawing.endX || 0);
  const endY = Number(drawing.endY || 0);
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const curve = Number(drawing.curve || 0);
  return {
    x: (startX + endX) / 2 - (dy / distance) * curve,
    y: (startY + endY) / 2 + (dx / distance) * curve,
  };
}

export function getSetPieceDrawingPath(drawing = {}) {
  const startX = Number(drawing.startX || 0);
  const startY = Number(drawing.startY || 0);
  const endX = Number(drawing.endX || 0);
  const endY = Number(drawing.endY || 0);
  if (!Number(drawing.curve || 0)) return `M ${startX} ${startY} L ${endX} ${endY}`;
  const control = getSetPieceDrawingControlPoint(drawing);
  return `M ${startX} ${startY} Q ${control.x} ${control.y} ${endX} ${endY}`;
}

export function getSetPieceDrawingLength(drawing = {}) {
  return Math.hypot(
    Number(drawing.endX || 0) - Number(drawing.startX || 0),
    Number(drawing.endY || 0) - Number(drawing.startY || 0)
  );
}

function resizeZone(drawing, handle, point, pitchView) {
  const bounds = getSetPiecePitchBounds(pitchView);
  const x1 = Math.min(Number(drawing.startX || 0), Number(drawing.endX || 0));
  const x2 = Math.max(Number(drawing.startX || 0), Number(drawing.endX || 0));
  const y1 = Math.min(Number(drawing.startY || 0), Number(drawing.endY || 0));
  const y2 = Math.max(Number(drawing.startY || 0), Number(drawing.endY || 0));
  const normalized = normalizeSetPiecePointForPitchView(point, pitchView);

  if (handle === "zone-nw") {
    return { startX: clampSetPieceCoordinate(normalized.x, bounds.minX, x2 - MIN_ZONE_SIZE), startY: clampSetPieceCoordinate(normalized.y, bounds.minY, y2 - MIN_ZONE_SIZE), endX: x2, endY: y2 };
  }
  if (handle === "zone-ne") {
    return { startX: x1, startY: clampSetPieceCoordinate(normalized.y, bounds.minY, y2 - MIN_ZONE_SIZE), endX: clampSetPieceCoordinate(normalized.x, x1 + MIN_ZONE_SIZE, bounds.maxX), endY: y2 };
  }
  if (handle === "zone-se") {
    return { startX: x1, startY: y1, endX: clampSetPieceCoordinate(normalized.x, x1 + MIN_ZONE_SIZE, bounds.maxX), endY: clampSetPieceCoordinate(normalized.y, y1 + MIN_ZONE_SIZE, bounds.maxY) };
  }
  return { startX: clampSetPieceCoordinate(normalized.x, bounds.minX, x2 - MIN_ZONE_SIZE), startY: y1, endX: x2, endY: clampSetPieceCoordinate(normalized.y, y1 + MIN_ZONE_SIZE, bounds.maxY) };
}

function curveFromPoint(drawing, point, pitchView) {
  const normalized = normalizeSetPiecePointForPitchView(point, pitchView);
  const startX = Number(drawing.startX || 0);
  const startY = Number(drawing.startY || 0);
  const endX = Number(drawing.endX || 0);
  const endY = Number(drawing.endY || 0);
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const midpointX = (startX + endX) / 2;
  const midpointY = (startY + endY) / 2;
  const curve = ((normalized.x - midpointX) * (-dy) + (normalized.y - midpointY) * dx) / distance;
  return { curve: clampSetPieceCoordinate(curve, -MAX_CURVE, MAX_CURVE) };
}

export function updateSetPieceDrawingHandle(drawing = {}, handle = "", point = {}, pitchView = "full") {
  if (drawing.type === "zone" && handle.startsWith("zone-")) return resizeZone(drawing, handle, point, pitchView);
  if (handle === "curve") return curveFromPoint(drawing, point, pitchView);
  const normalized = normalizeSetPiecePointForPitchView(point, pitchView);
  if (handle === "start") return { startX: normalized.x, startY: normalized.y };
  if (handle === "end") return { endX: normalized.x, endY: normalized.y };
  return {};
}

export function translateSetPieceDrawing(drawing = {}, delta = {}, pitchView = "full") {
  const bounds = getSetPiecePitchBounds(pitchView);
  const startX = Number(drawing.startX || 0);
  const startY = Number(drawing.startY || 0);
  const endX = Number(drawing.endX || 0);
  const endY = Number(drawing.endY || 0);
  const points = [{ x: startX, y: startY }, { x: endX, y: endY }];
  if (Number(drawing.curve || 0)) points.push(getSetPieceDrawingControlPoint(drawing));
  const dx = clampSetPieceCoordinate(
    Number(delta.x || 0),
    bounds.minX - Math.min(...points.map((point) => point.x)),
    bounds.maxX - Math.max(...points.map((point) => point.x))
  );
  const dy = clampSetPieceCoordinate(
    Number(delta.y || 0),
    bounds.minY - Math.min(...points.map((point) => point.y)),
    bounds.maxY - Math.max(...points.map((point) => point.y))
  );
  return { startX: startX + dx, startY: startY + dy, endX: endX + dx, endY: endY + dy };
}
