import {
  clampSetPieceCoordinate,
  getSetPieceElementEdgeInset,
  getSetPiecePitchBounds,
} from "./geometry.mjs";
import { getSetPieceDrawingControlPoint } from "./drawing-geometry.mjs";

function normalizedRect(rect = {}) {
  return {
    minX: Math.min(Number(rect.startX || 0), Number(rect.endX || 0)),
    maxX: Math.max(Number(rect.startX || 0), Number(rect.endX || 0)),
    minY: Math.min(Number(rect.startY || 0), Number(rect.endY || 0)),
    maxY: Math.max(Number(rect.startY || 0), Number(rect.endY || 0)),
  };
}

function pointInsideRect(point, rect) {
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a, b, c, d) {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y)
  ) return false;
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return first * second <= 0 && third * fourth <= 0;
}

function segmentIntersectsRect(start, end, rect) {
  if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) return true;
  const nw = { x: rect.minX, y: rect.minY };
  const ne = { x: rect.maxX, y: rect.minY };
  const se = { x: rect.maxX, y: rect.maxY };
  const sw = { x: rect.minX, y: rect.maxY };
  return [[nw, ne], [ne, se], [se, sw], [sw, nw]]
    .some(([first, second]) => segmentsIntersect(start, end, first, second));
}

function drawingPoints(drawing = {}) {
  const start = { x: Number(drawing.startX || 0), y: Number(drawing.startY || 0) };
  const end = { x: Number(drawing.endX || 0), y: Number(drawing.endY || 0) };
  if (drawing.type === "zone" || !Number(drawing.curve || 0)) return [start, end];
  const control = getSetPieceDrawingControlPoint(drawing);
  return Array.from({ length: 17 }, (_, index) => {
    const progress = index / 16;
    const inverse = 1 - progress;
    return {
      x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
      y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
    };
  });
}

export function isSetPieceDrawingInsideRect(drawing = {}, selectionRect = {}) {
  const rect = normalizedRect(selectionRect);
  if (drawing.type === "zone") {
    const zone = normalizedRect(drawing);
    return zone.minX <= rect.maxX && zone.maxX >= rect.minX && zone.minY <= rect.maxY && zone.maxY >= rect.minY;
  }
  const points = drawingPoints(drawing);
  return points.slice(1).some((point, index) => segmentIntersectsRect(points[index], point, rect));
}

export function constrainSetPieceSelectionDelta(elements = [], drawings = [], delta = {}, pitchView = "full") {
  const bounds = getSetPiecePitchBounds(pitchView);
  const extents = [];
  elements.forEach((element) => {
    const inset = getSetPieceElementEdgeInset(element.kind);
    const x = Number(element.x || 0);
    const y = Number(element.y || 0);
    extents.push({
      minX: x - inset,
      maxX: x + inset,
      minY: y - inset,
      maxY: y + inset,
    });
  });
  drawings.forEach((drawing) => {
    const points = drawingPoints(drawing);
    extents.push({
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    });
  });
  if (!extents.length) return { x: 0, y: 0 };
  const minX = Math.min(...extents.map((extent) => extent.minX));
  const maxX = Math.max(...extents.map((extent) => extent.maxX));
  const minY = Math.min(...extents.map((extent) => extent.minY));
  const maxY = Math.max(...extents.map((extent) => extent.maxY));
  return {
    x: clampSetPieceCoordinate(Number(delta.x || 0), bounds.minX - minX, bounds.maxX - maxX),
    y: clampSetPieceCoordinate(Number(delta.y || 0), bounds.minY - minY, bounds.maxY - maxY),
  };
}
