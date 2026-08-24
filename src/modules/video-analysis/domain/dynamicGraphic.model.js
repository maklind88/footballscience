const graphicTypes = new Set([
  "arrow",
  "circle",
  "spotlight",
  "label",
  "trail",
  "distance",
  "unit-hull",
  "unit-line",
  "movement-curve",
]);
const graphicSources = new Set(["static", "tracking", "spatial"]);
const anchorTypes = new Set(["center", "ground", "top", "left", "right"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}

function stringValue(value = "") {
  return String(value || "").trim();
}

function normalizeBinding(value = {}, fallbackIndex = 0) {
  const anchor = stringValue(value.anchor).toLowerCase();
  return {
    id: stringValue(value.id || `binding-${fallbackIndex + 1}`),
    trackId: stringValue(value.trackId || value.track_id),
    role: stringValue(value.role || "primary"),
    anchor: anchorTypes.has(anchor) ? anchor : "ground",
    offsetXM: finiteNumber(value.offsetXM ?? value.offset_x_m, 0),
    offsetYM: finiteNumber(value.offsetYM ?? value.offset_y_m, 0),
  };
}

function normalizeStaticPoint(value = {}) {
  return {
    x: clamp(value.x ?? 0),
    y: clamp(value.y ?? 0),
  };
}

function normalizeStyle(value = {}) {
  return {
    color: stringValue(value.color || "#f7d154"),
    secondaryColor: stringValue(value.secondaryColor || value.secondary_color || "#ffffff"),
    lineWidth: Math.min(20, Math.max(1, finiteNumber(value.lineWidth ?? value.line_width, 3))),
    opacity: clamp(value.opacity ?? 0.92),
    fillOpacity: clamp(value.fillOpacity ?? value.fill_opacity ?? 0.18),
    fontSize: Math.min(72, Math.max(10, finiteNumber(value.fontSize ?? value.font_size, 20))),
    showValue: value.showValue === undefined ? true : Boolean(value.showValue),
  };
}

export function normalizeDynamicGraphic(value = {}) {
  const type = stringValue(value.type || value.graphicType || value.graphic_type).toLowerCase();
  const source = stringValue(value.source).toLowerCase();
  const startMs = Math.max(0, Math.round(finiteNumber(value.startMs ?? value.start_ms, 0)));
  const endMs = Math.max(startMs + 1, Math.round(finiteNumber(value.endMs ?? value.end_ms, startMs + 3000)));
  return {
    id: stringValue(value.id),
    clipId: stringValue(value.clipId || value.clip_id),
    type: graphicTypes.has(type) ? type : "circle",
    source: graphicSources.has(source) ? source : "static",
    startMs,
    endMs,
    text: stringValue(value.text),
    bindings: (value.bindings || []).map(normalizeBinding).filter((binding) => binding.trackId),
    staticPoints: (value.staticPoints || value.static_points || []).map(normalizeStaticPoint),
    style: normalizeStyle(value.style),
    trailDurationMs: Math.max(0, Math.round(finiteNumber(
      value.trailDurationMs ?? value.trail_duration_ms,
      2000,
    ))),
    confidenceThreshold: clamp(value.confidenceThreshold ?? value.confidence_threshold ?? 0.55),
    locked: Boolean(value.locked),
    hidden: Boolean(value.hidden),
    status: stringValue(value.status || "active"),
    metadata: value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? value.metadata
      : {},
  };
}

export function dynamicGraphicReadiness(value = {}) {
  const graphic = normalizeDynamicGraphic(value);
  const trackingRequired = graphic.source !== "static";
  const minimumBindings = ["distance", "unit-line"].includes(graphic.type) ? 2 : 1;
  const valid = trackingRequired
    ? graphic.bindings.length >= minimumBindings
    : graphic.staticPoints.length > 0;
  return {
    valid,
    trackingRequired,
    bindingCount: graphic.bindings.length,
    minimumBindings,
  };
}

