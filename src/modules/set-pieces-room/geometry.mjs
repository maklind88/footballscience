const PITCH_LENGTH = 105;
const PITCH_WIDTH = 68;
const PITCH_THIRD_LENGTH = PITCH_LENGTH / 3;
const ATTACKING_THIRD_START = PITCH_LENGTH - PITCH_THIRD_LENGTH;
const PITCH_GOAL_LINE_SURROUND = 6.25;
const PITCH_TOUCH_LINE_SURROUND = 3.75;
const EDITOR_LAYOUT_SURROUND = 2.25;

const SET_PIECE_ELEMENT_EDGE_INSETS = Object.freeze({
  "home-player": 2.2,
  opponent: 1.88,
  ball: .82,
});

export function clampSetPieceCoordinate(value, min, max) {
  const numeric = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : min));
}

export function normalizeSetPiecePoint(point = {}) {
  const bounds = getSetPiecePitchBounds("full");
  const x = Number(point.x);
  const y = Number(point.y);
  return {
    x: clampSetPieceCoordinate(Number.isFinite(x) ? x : 0, bounds.minX, bounds.maxX),
    y: clampSetPieceCoordinate(Number.isFinite(y) ? y : 0, bounds.minY, bounds.maxY),
  };
}

export function normalizeSetPiecePointForPitchView(point = {}, pitchView = "full", inset = 0) {
  const bounds = getSetPiecePitchBounds(pitchView, inset);
  const x = Number(point.x);
  const y = Number(point.y);
  return {
    x: clampSetPieceCoordinate(Number.isFinite(x) ? x : 0, bounds.minX, bounds.maxX),
    y: clampSetPieceCoordinate(Number.isFinite(y) ? y : 0, bounds.minY, bounds.maxY),
  };
}

export function getSetPieceElementEdgeInset(kind = "") {
  return SET_PIECE_ELEMENT_EDGE_INSETS[kind] || 0;
}

export function normalizeSetPieceElementPointForPitchView(point = {}, pitchView = "full", kind = point.kind) {
  return normalizeSetPiecePointForPitchView(point, pitchView, getSetPieceElementEdgeInset(kind));
}

export function getSetPiecePitchViewBox(pitchView = "full") {
  const halfWidth = PITCH_WIDTH + PITCH_TOUCH_LINE_SURROUND * 2;
  const halfHeight = PITCH_THIRD_LENGTH + PITCH_TOUCH_LINE_SURROUND + PITCH_GOAL_LINE_SURROUND;
  if (pitchView === "attacking-half") {
    return `${-PITCH_TOUCH_LINE_SURROUND} ${-PITCH_GOAL_LINE_SURROUND} ${halfWidth} ${halfHeight}`;
  }
  if (pitchView === "defensive-half") {
    return `${-PITCH_TOUCH_LINE_SURROUND} ${-PITCH_TOUCH_LINE_SURROUND} ${halfWidth} ${halfHeight}`;
  }
  return `${-PITCH_GOAL_LINE_SURROUND} ${-PITCH_TOUCH_LINE_SURROUND} ${PITCH_LENGTH + PITCH_GOAL_LINE_SURROUND * 2} ${PITCH_WIDTH + PITCH_TOUCH_LINE_SURROUND * 2}`;
}

export function getSetPiecePitchLayoutAspect(pitchView = "full") {
  if (pitchView === "attacking-half" || pitchView === "defensive-half") {
    return (PITCH_WIDTH + EDITOR_LAYOUT_SURROUND * 2) / (PITCH_THIRD_LENGTH + EDITOR_LAYOUT_SURROUND * 2);
  }
  return (PITCH_LENGTH + EDITOR_LAYOUT_SURROUND * 2) / (PITCH_WIDTH + EDITOR_LAYOUT_SURROUND * 2);
}

export function getSetPiecePitchTransform(pitchView = "full") {
  if (pitchView === "attacking-half") return "matrix(0 -1 1 0 0 105)";
  if (pitchView === "defensive-half") return "matrix(0 -1 1 0 0 35)";
  return "";
}

export function getSetPiecePitchBounds(pitchView = "full", requestedInset = 0) {
  const inset = clampSetPieceCoordinate(requestedInset, 0, PITCH_TOUCH_LINE_SURROUND);
  if (pitchView === "attacking-half") {
    return {
      minX: ATTACKING_THIRD_START - PITCH_TOUCH_LINE_SURROUND + inset,
      maxX: PITCH_LENGTH + PITCH_GOAL_LINE_SURROUND - inset,
      minY: -PITCH_TOUCH_LINE_SURROUND + inset,
      maxY: PITCH_WIDTH + PITCH_TOUCH_LINE_SURROUND - inset,
    };
  }
  if (pitchView === "defensive-half") {
    return {
      minX: -PITCH_GOAL_LINE_SURROUND + inset,
      maxX: PITCH_THIRD_LENGTH + PITCH_TOUCH_LINE_SURROUND - inset,
      minY: -PITCH_TOUCH_LINE_SURROUND + inset,
      maxY: PITCH_WIDTH + PITCH_TOUCH_LINE_SURROUND - inset,
    };
  }
  return {
    minX: -PITCH_GOAL_LINE_SURROUND + inset,
    maxX: PITCH_LENGTH + PITCH_GOAL_LINE_SURROUND - inset,
    minY: -PITCH_TOUCH_LINE_SURROUND + inset,
    maxY: PITCH_WIDTH + PITCH_TOUCH_LINE_SURROUND - inset,
  };
}

export function getSetPieceSourcePoint(point = {}, pitchView = "full") {
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  if (pitchView === "attacking-half") return normalizeSetPiecePointForPitchView({ x: PITCH_LENGTH - y, y: x }, pitchView);
  if (pitchView === "defensive-half") return normalizeSetPiecePointForPitchView({ x: PITCH_THIRD_LENGTH - y, y: x }, pitchView);
  return normalizeSetPiecePoint(point);
}

export function getSetPieceElementTransform(point = {}, pitchView = "full") {
  // Pitch views are cameras over one canonical full-pitch coordinate system.
  const normalized = normalizeSetPieceElementPointForPitchView(point, "full", point.kind);
  const rotation = pitchView === "attacking-half" || pitchView === "defensive-half" ? " rotate(90)" : "";
  return `translate(${normalized.x} ${normalized.y})${rotation}`;
}

export function getSetPieceSvgPoint(svg, clientX, clientY) {
  if (!svg?.createSVGPoint || !svg.getScreenCTM) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  return getSetPieceSourcePoint(point.matrixTransform(matrix.inverse()), svg.dataset?.pitchView || "full");
}

export function getSetPieceDistance(first = {}, second = {}) {
  return Math.hypot(Number(second.x || 0) - Number(first.x || 0), Number(second.y || 0) - Number(first.y || 0));
}

export function getNearestSetPieceElement(elements = [], point = {}, maxDistance = 7) {
  let nearest = null;
  let nearestDistance = maxDistance;
  for (const element of elements) {
    if (!element || element.kind === "zone") continue;
    const distance = getSetPieceDistance(element, point);
    if (distance <= nearestDistance) {
      nearest = element;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function getNextSetPiecePlayerPlacement(elements = [], pitchView = "full") {
  const columns = pitchView === "attacking-half"
    ? [78, 86, 94]
    : pitchView === "defensive-half"
      ? [27, 19, 11]
      : [43, 51, 59];
  const rows = [10, 18, 26, 34, 42, 50, 58];
  const occupied = Array.isArray(elements) ? elements : [];
  const candidates = columns.flatMap((x) => rows.map((y) => ({ x, y })));
  const openPoint = candidates.find((candidate) => (
    occupied.every((element) => getSetPieceDistance(element, candidate) >= 6.5)
  ));
  return normalizeSetPiecePointForPitchView(openPoint || candidates[0], pitchView);
}

export function isSetPiecePointInsideRect(point = {}, rect = {}) {
  const minX = Math.min(rect.startX, rect.endX);
  const maxX = Math.max(rect.startX, rect.endX);
  const minY = Math.min(rect.startY, rect.endY);
  const maxY = Math.max(rect.startY, rect.endY);
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

export function interpolateSetPieceValue(from, to, progress) {
  const start = Number(from || 0);
  const end = Number(to || 0);
  const amount = clampSetPieceCoordinate(progress, 0, 1);
  const eased = amount < 0.5 ? 2 * amount * amount : 1 - Math.pow(-2 * amount + 2, 2) / 2;
  return start + (end - start) * eased;
}

export const setPiecePitchSize = Object.freeze({ length: PITCH_LENGTH, width: PITCH_WIDTH });
export const setPiecePitchCanvas = Object.freeze({
  x: -PITCH_GOAL_LINE_SURROUND,
  y: -PITCH_TOUCH_LINE_SURROUND,
  width: PITCH_LENGTH + PITCH_GOAL_LINE_SURROUND * 2,
  height: PITCH_WIDTH + PITCH_TOUCH_LINE_SURROUND * 2,
  margin: PITCH_TOUCH_LINE_SURROUND,
  goalLineMargin: PITCH_GOAL_LINE_SURROUND,
  touchLineMargin: PITCH_TOUCH_LINE_SURROUND,
});
