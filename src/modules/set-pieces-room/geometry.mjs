const PITCH_LENGTH = 105;
const PITCH_WIDTH = 68;
const PLAYER_MARKER_INSET = 4;

export function clampSetPieceCoordinate(value, min, max) {
  const numeric = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : min));
}

export function normalizeSetPiecePoint(point = {}) {
  return {
    x: clampSetPieceCoordinate(point.x, 0, PITCH_LENGTH),
    y: clampSetPieceCoordinate(point.y, 0, PITCH_WIDTH),
  };
}

export function normalizeSetPiecePointForPitchView(point = {}, pitchView = "full") {
  const normalized = normalizeSetPiecePoint(point);
  if (pitchView === "attacking-half") normalized.x = clampSetPieceCoordinate(normalized.x, PITCH_LENGTH / 2, PITCH_LENGTH);
  if (pitchView === "defensive-half") normalized.x = clampSetPieceCoordinate(normalized.x, 0, PITCH_LENGTH / 2);
  return normalized;
}

export function normalizeSetPieceElementPointForPitchView(point = {}, pitchView = "full", kind = point.kind) {
  const normalized = normalizeSetPiecePointForPitchView(point, pitchView);
  if (!["home-player", "opponent"].includes(kind)) return normalized;
  const minX = pitchView === "attacking-half" ? PITCH_LENGTH / 2 : 0;
  const maxX = pitchView === "defensive-half" ? PITCH_LENGTH / 2 : PITCH_LENGTH;
  return {
    x: clampSetPieceCoordinate(normalized.x, minX + PLAYER_MARKER_INSET, maxX - PLAYER_MARKER_INSET),
    y: clampSetPieceCoordinate(normalized.y, PLAYER_MARKER_INSET, PITCH_WIDTH - PLAYER_MARKER_INSET),
  };
}

export function getSetPiecePitchViewBox(pitchView = "full") {
  if (pitchView === "attacking-half" || pitchView === "defensive-half") return "0 0 68 52.5";
  return "0 0 105 68";
}

export function getSetPiecePitchTransform(pitchView = "full") {
  if (pitchView === "attacking-half") return "matrix(0 -1 1 0 0 105)";
  if (pitchView === "defensive-half") return "matrix(0 -1 1 0 0 52.5)";
  return "";
}

export function getSetPieceSourcePoint(point = {}, pitchView = "full") {
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  if (pitchView === "attacking-half") return normalizeSetPiecePointForPitchView({ x: PITCH_LENGTH - y, y: x }, pitchView);
  if (pitchView === "defensive-half") return normalizeSetPiecePointForPitchView({ x: PITCH_LENGTH / 2 - y, y: x }, pitchView);
  return normalizeSetPiecePoint(point);
}

export function getSetPieceElementTransform(point = {}, pitchView = "full") {
  const normalized = normalizeSetPieceElementPointForPitchView(point, pitchView);
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
    ? [62, 70, 78]
    : pitchView === "defensive-half"
      ? [43, 35, 27]
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
