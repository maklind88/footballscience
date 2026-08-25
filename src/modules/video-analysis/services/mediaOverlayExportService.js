import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { normalizeDrawingLayer, selectedPresentationItem } from "./presentationService.js";
import { resolveDynamicGraphic } from "./dynamicGraphicRenderService.js";

const PRESET_HEIGHTS = Object.freeze({
  "review-720p": 720,
  "analysis-1080p": 1080,
  "master-2160p": 2160,
});
const MAX_PRIMITIVES = 4000;
const DYNAMIC_STEP_MS = 120;

function bounded(value, minimum = 0, maximum = 1, fallback = minimum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

function point(x = 0, y = 0) {
  return { x: bounded(x), y: bounded(y) };
}

function percentPoint(x = 0, y = 0) {
  return point(Number(x) / 100, Number(y) / 100);
}

function color(value = "", fallback = "#f7d154") {
  return /^#[a-f0-9]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
}

function primitiveStyle(value = {}) {
  return {
    color: color(value.color),
    secondaryColor: color(value.secondaryColor || value.secondary_color, "#ffffff"),
    lineWidth: bounded(value.lineWidth ?? value.line_width, 1, 20, 4),
    opacity: bounded(value.opacity, 0, 1, 0.94),
    fillOpacity: bounded(value.fillOpacity ?? value.fill_opacity, 0, 1, 0.16),
    fontSize: bounded(value.fontSize ?? value.font_size, 10, 72, 24),
  };
}

function visibleWindow(startMs = 0, endMs = 0, range = {}) {
  const absoluteStart = Math.max(Number(range.startMs) || 0, Number(startMs) || 0);
  const absoluteEnd = Math.min(Number(range.endMs) || absoluteStart + 1, Number(endMs) || absoluteStart + 1);
  if (absoluteEnd <= absoluteStart) return null;
  return {
    startMs: Math.round(absoluteStart - (Number(range.startMs) || 0)),
    endMs: Math.round(absoluteEnd - (Number(range.startMs) || 0)),
  };
}

function drawingPrimitive(layerValue = {}, range = {}) {
  const layer = normalizeDrawingLayer(layerValue);
  if (layer.tool === "freeze") return null;
  const durationMs = Math.max(200, Number(layer.durationMs) || 3000);
  const window = visibleWindow(layer.timestampMs, layer.timestampMs + durationMs, range);
  if (!window) return null;
  const geometry = layer.geometry || {};
  const base = {
    id: layer.id,
    ...window,
    style: primitiveStyle(layer.style),
  };
  if (layer.tool === "freehand") {
    const points = (Array.isArray(geometry.points) ? geometry.points : [])
      .slice(0, 256)
      .map((entry) => percentPoint(entry.x, entry.y));
    return points.length >= 2 ? { ...base, type: "line", points } : null;
  }
  if (layer.tool === "arrow") {
    return {
      ...base,
      type: "line",
      points: [percentPoint(geometry.x1, geometry.y1), percentPoint(geometry.x2, geometry.y2)],
      arrow: true,
    };
  }
  if (["circle", "spotlight", "zoom"].includes(layer.tool)) {
    return {
      ...base,
      type: layer.tool === "spotlight" ? "spotlight" : "ellipse",
      center: percentPoint(geometry.cx ?? geometry.x, geometry.cy ?? geometry.y),
      radiusX: bounded((Number(geometry.rx) || 12) / 100, 0.005, 0.5, 0.12),
      radiusY: bounded((Number(geometry.ry) || 8) / 100, 0.005, 0.5, 0.08),
    };
  }
  return {
    ...base,
    type: "label",
    center: percentPoint(geometry.x ?? geometry.cx, geometry.y ?? geometry.cy),
    text: String(layer.text || "Coach point").slice(0, 180),
  };
}

function primitiveFromResolved(graphic = {}, resolved = {}, window = {}) {
  if (!resolved?.available) return [];
  const base = { id: graphic.id, ...window, style: primitiveStyle(resolved.style || graphic.style) };
  if (["circle", "spotlight"].includes(resolved.type) && resolved.anchor) {
    return [{
      ...base,
      type: resolved.type,
      center: point(resolved.anchor.x, resolved.anchor.y),
      radiusX: 0.035,
      radiusY: 0.065,
    }];
  }
  if (resolved.type === "label" && resolved.anchor) {
    return [{ ...base, type: "label", center: point(resolved.anchor.x, resolved.anchor.y), text: resolved.text || "Player" }];
  }
  if (resolved.type === "unit-hull" && resolved.anchors?.length >= 3) {
    return [{ ...base, type: "polygon", points: resolved.anchors.map((entry) => point(entry.x, entry.y)) }];
  }
  if (["trail", "movement-curve"].includes(resolved.type) && resolved.points?.length >= 2) {
    return [{ ...base, type: "line", points: resolved.points.map((entry) => point(entry.x, entry.y)) }];
  }
  if (["distance", "unit-line"].includes(resolved.type) && resolved.anchors?.length >= 2) {
    const points = resolved.anchors.map((entry) => point(entry.x, entry.y));
    const text = Number.isFinite(resolved.distanceM) ? `${resolved.distanceM.toFixed(1)} m` : "";
    return [{ ...base, type: "line", points, text }];
  }
  if (resolved.anchor) return [{ ...base, type: "ellipse", center: point(resolved.anchor.x, resolved.anchor.y), radiusX: 0.035, radiusY: 0.065 }];
  return [];
}

function dynamicPrimitives(graphicValue = {}, item = {}, range = {}, calibration = null) {
  const graphic = normalizeDynamicGraphic(graphicValue);
  const startMs = Math.max(graphic.startMs, Number(range.startMs) || 0);
  const endMs = Math.min(graphic.endMs, Number(range.endMs) || startMs);
  const primitives = [];
  for (let atMs = startMs; atMs < endMs && primitives.length < MAX_PRIMITIVES; atMs += DYNAMIC_STEP_MS) {
    const window = visibleWindow(atMs, Math.min(endMs, atMs + DYNAMIC_STEP_MS), range);
    if (!window) continue;
    const resolved = resolveDynamicGraphic(graphic, item.objectTracks || [], atMs, { calibration });
    primitives.push(...primitiveFromResolved(graphic, resolved, window));
  }
  return primitives;
}

export function buildMediaOverlaySpec(state = {}, options = {}) {
  const range = options.range || { startMs: 0, endMs: 1 };
  const item = selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
  const height = PRESET_HEIGHTS[options.preset] || 1080;
  const drawings = (item?.drawings || []).map((layer) => drawingPrimitive(layer, range)).filter(Boolean);
  const dynamic = (item?.dynamicGraphics || []).flatMap((graphic) => dynamicPrimitives(
    graphic,
    item,
    range,
    state.presentation?.spatial?.calibration || null,
  ));
  const primitives = [...drawings, ...dynamic].slice(0, MAX_PRIMITIVES);
  return {
    schema: "football-science-render-overlay-v1",
    playRes: { width: Math.round((height * 16) / 9), height },
    range: {
      startMs: Math.max(0, Math.round(Number(range.startMs) || 0)),
      endMs: Math.max(1, Math.round(Number(range.endMs) || 1)),
    },
    sampleStepMs: DYNAMIC_STEP_MS,
    truncated: drawings.length + dynamic.length > MAX_PRIMITIVES,
    primitives,
  };
}
