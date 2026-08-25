function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export const MAX_FREEHAND_POINTS = 256;

export function clampPercent(value, fallback = 0) {
  return Math.max(0, Math.min(100, numberValue(value, fallback)));
}

export function pointerPercent(event, surface) {
  const rect = surface?.getBoundingClientRect?.();
  return {
    x: rect?.width ? clampPercent(((event.clientX - rect.left) / rect.width) * 100, 50) : 50,
    y: rect?.height ? clampPercent(((event.clientY - rect.top) / rect.height) * 100, 50) : 50,
  };
}

export function normalizeFreehandPoints(points = [], maximum = MAX_FREEHAND_POINTS) {
  return (Array.isArray(points) ? points : [])
    .slice(0, Math.max(2, Math.min(MAX_FREEHAND_POINTS, Math.floor(Number(maximum) || MAX_FREEHAND_POINTS))))
    .map((entry = {}) => ({
      x: clampPercent(entry.x, 50),
      y: clampPercent(entry.y, 50),
    }));
}

export function appendFreehandPoint(geometry = {}, point = {}, options = {}) {
  const points = normalizeFreehandPoints(geometry.points);
  const next = { x: clampPercent(point.x, 50), y: clampPercent(point.y, 50) };
  const previous = points.at(-1);
  const minimumDistance = Math.max(0, numberValue(options.minimumDistance, 0.3));
  if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) < minimumDistance) {
    return { ...geometry, points };
  }
  if (points.length >= MAX_FREEHAND_POINTS) {
    return { ...geometry, points: [...points.slice(0, -1), next] };
  }
  return { ...geometry, points: [...points, next] };
}

export function normalizeDrawingGeometry(tool = "arrow", geometry = {}) {
  const source = geometry && typeof geometry === "object" && !Array.isArray(geometry) ? geometry : {};
  return tool === "freehand" ? { points: normalizeFreehandPoints(source.points) } : { ...source };
}

export function defaultDrawingGeometry(tool = "arrow", point = { x: 50, y: 50 }) {
  const x = clampPercent(point.x, 50);
  const y = clampPercent(point.y, 50);
  if (tool === "freehand") return { points: [{ x: Math.max(0, x - 3), y }, { x: Math.min(100, x + 3), y }] };
  if (tool === "arrow") return { x1: Math.max(0, x - 18), y1: Math.min(100, y + 8), x2: Math.min(100, x + 18), y2: Math.max(0, y - 8) };
  if (tool === "circle") return { cx: x, cy: y, rx: 12, ry: 8 };
  if (tool === "spotlight") return { cx: x, cy: y, rx: 16, ry: 11 };
  if (tool === "text") return { x, y };
  if (tool === "zoom") return { cx: x, cy: y, rx: 12, ry: 8, scale: 1.6 };
  if (tool === "freeze") return { x: 0, y: 0, width: 100, height: 100 };
  return { x, y };
}

export function geometryFromDrag(tool = "arrow", start = {}, end = {}) {
  const x1 = clampPercent(start.x, 50);
  const y1 = clampPercent(start.y, 50);
  const x2 = clampPercent(end.x, x1);
  const y2 = clampPercent(end.y, y1);
  const center = { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  const rx = Math.max(4, Math.abs(x2 - x1) / 2);
  const ry = Math.max(4, Math.abs(y2 - y1) / 2);
  if (tool === "freehand") return { points: normalizeFreehandPoints([{ x: x1, y: y1 }, { x: x2, y: y2 }]) };
  if (tool === "arrow") return { x1, y1, x2, y2 };
  if (tool === "circle" || tool === "spotlight") return { ...center, rx, ry };
  if (tool === "zoom") return { ...center, rx, ry, scale: 1.6 };
  return defaultDrawingGeometry(tool, end);
}

export function moveGeometry(geometry = {}, dx = 0, dy = 0) {
  const patch = { ...geometry };
  if (Array.isArray(patch.points)) {
    patch.points = normalizeFreehandPoints(patch.points).map((entry) => ({
      x: clampPercent(entry.x + dx, entry.x),
      y: clampPercent(entry.y + dy, entry.y),
    }));
  }
  for (const key of ["x", "x1", "x2", "cx"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) patch[key] = clampPercent(numberValue(patch[key], 0) + dx, patch[key]);
  }
  for (const key of ["y", "y1", "y2", "cy"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) patch[key] = clampPercent(numberValue(patch[key], 0) + dy, patch[key]);
  }
  return patch;
}

export function resizeGeometry(tool = "arrow", geometry = {}, handle = "se", point = {}) {
  const x = clampPercent(point.x, 50);
  const y = clampPercent(point.y, 50);
  if (tool === "freehand") return normalizeDrawingGeometry(tool, geometry);
  if (tool === "arrow") {
    return handle === "start"
      ? { ...geometry, x1: x, y1: y }
      : { ...geometry, x2: x, y2: y };
  }
  const cx = numberValue(geometry.cx ?? geometry.x, 50);
  const cy = numberValue(geometry.cy ?? geometry.y, 50);
  return {
    ...geometry,
    cx,
    cy,
    rx: Math.max(4, Math.abs(x - cx)),
    ry: Math.max(4, Math.abs(y - cy)),
  };
}

export function layerStyle(tool = "arrow", geometry = {}) {
  if (tool === "freehand") return "";
  const x = numberValue(geometry.x ?? geometry.cx ?? geometry.x1, 50);
  const y = numberValue(geometry.y ?? geometry.cy ?? geometry.y1, 50);
  if (tool === "arrow") {
    const x2 = numberValue(geometry.x2, x + 28);
    const y2 = numberValue(geometry.y2, y - 10);
    const length = Math.max(12, Math.hypot(x2 - x, y2 - y));
    const angle = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
    return `left:${clampPercent(x, 50)}%;top:${clampPercent(y, 50)}%;width:${Math.min(70, length)}%;transform:rotate(${angle}deg);`;
  }
  if (tool === "freeze") return "";
  const width = numberValue(geometry.rx || geometry.width || (tool === "zoom" ? 12 : 16), 16);
  const height = numberValue(geometry.ry || geometry.height || (tool === "zoom" ? 12 : 10), 10);
  return `left:${Math.max(0, Math.min(94, x - width / 2))}%;top:${Math.max(0, Math.min(92, y - height / 2))}%;`;
}
