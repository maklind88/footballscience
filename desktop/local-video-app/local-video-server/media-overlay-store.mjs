import { createHash, randomUUID } from "node:crypto";

const PRIMITIVE_TYPES = new Set(["line", "ellipse", "spotlight", "polygon", "label"]);

function bounded(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

function safeColor(value = "", fallback = "#f7d154") {
  return /^#[a-f0-9]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

async function readJson(request, maximumBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) {
      request.resume?.();
      throw Object.assign(new Error("The render overlay is too large."), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("The render overlay is invalid."), { statusCode: 400 });
  }
}

function normalizePoint(value = {}) {
  return { x: bounded(value.x, 0, 1), y: bounded(value.y, 0, 1) };
}

function normalizeStyle(value = {}) {
  return {
    color: safeColor(value.color),
    secondaryColor: safeColor(value.secondaryColor, "#ffffff"),
    lineWidth: bounded(value.lineWidth, 1, 20, 4),
    opacity: bounded(value.opacity, 0, 1, 0.94),
    fillOpacity: bounded(value.fillOpacity, 0, 1, 0.16),
    fontSize: bounded(value.fontSize, 10, 72, 24),
  };
}

function normalizePrimitive(value = {}, durationMs = 1) {
  const type = String(value.type || "").toLowerCase();
  if (!PRIMITIVE_TYPES.has(type)) return null;
  const startMs = Math.round(bounded(value.startMs, 0, durationMs, 0));
  const endMs = Math.round(bounded(value.endMs, startMs + 1, durationMs, startMs + 1));
  const points = (Array.isArray(value.points) ? value.points : []).slice(0, 64).map(normalizePoint);
  if (["line", "polygon"].includes(type) && points.length < 2) return null;
  const center = normalizePoint(value.center || {});
  return {
    id: String(value.id || "").slice(0, 120),
    type,
    startMs,
    endMs,
    points,
    center,
    radiusX: bounded(value.radiusX, 0.002, 0.5, 0.04),
    radiusY: bounded(value.radiusY, 0.002, 0.5, 0.07),
    arrow: Boolean(value.arrow),
    text: String(value.text || "").replace(/[\r\n]+/g, " ").slice(0, 180),
    style: normalizeStyle(value.style),
  };
}

function normalizeOverlay(value = {}, limits = {}) {
  if (value.schema !== "football-science-render-overlay-v1") {
    throw Object.assign(new Error("Unsupported render overlay schema."), { statusCode: 400 });
  }
  const startMs = Math.max(0, Math.round(Number(value.range?.startMs) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(value.range?.endMs) || startMs + 1));
  const durationMs = endMs - startMs;
  if (durationMs > limits.maxDurationMs) {
    throw Object.assign(new Error("The render overlay exceeds the export duration limit."), { statusCode: 400 });
  }
  const source = Array.isArray(value.primitives) ? value.primitives : [];
  if (source.length > limits.maxPrimitives) {
    throw Object.assign(new Error("Split this review because it contains too many render primitives."), { statusCode: 400 });
  }
  const primitives = source.map((primitive) => normalizePrimitive(primitive, durationMs)).filter(Boolean);
  if (primitives.length !== source.length) {
    throw Object.assign(new Error("The render overlay contains an invalid primitive."), { statusCode: 400 });
  }
  return {
    schema: value.schema,
    playRes: {
      width: Math.round(bounded(value.playRes?.width, 320, 4096, 1920)),
      height: Math.round(bounded(value.playRes?.height, 180, 2160, 1080)),
    },
    range: { startMs, endMs },
    primitives,
  };
}

function assTime(milliseconds = 0) {
  const centiseconds = Math.max(0, Math.round(Number(milliseconds || 0) / 10));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function assColor(hex = "#ffffff") {
  const safe = safeColor(hex, "#ffffff").slice(1);
  return `&H${safe.slice(4, 6)}${safe.slice(2, 4)}${safe.slice(0, 2)}&`;
}

function assAlpha(opacity = 1) {
  return `&H${Math.round((1 - bounded(opacity, 0, 1, 1)) * 255).toString(16).padStart(2, "0").toUpperCase()}&`;
}

function pixelPoint(value = {}, resolution = {}) {
  return {
    x: Math.round(bounded(value.x, 0, 1) * resolution.width),
    y: Math.round(bounded(value.y, 0, 1) * resolution.height),
  };
}

function ellipsePoints(primitive, resolution) {
  const center = pixelPoint(primitive.center, resolution);
  const radiusX = primitive.radiusX * resolution.width;
  const radiusY = primitive.radiusY * resolution.height;
  return Array.from({ length: 24 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 24;
    return { x: Math.round(center.x + Math.cos(angle) * radiusX), y: Math.round(center.y + Math.sin(angle) * radiusY) };
  });
}

function polygonPath(points = []) {
  if (!points.length) return "";
  return `m ${points[0].x} ${points[0].y} ${points.slice(1).map((entry) => `l ${entry.x} ${entry.y}`).join(" ")} l ${points[0].x} ${points[0].y}`;
}

function linePath(points = [], width = 4, arrow = false) {
  const paths = [];
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const length = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const nx = (-(second.y - first.y) / length) * width / 2;
    const ny = ((second.x - first.x) / length) * width / 2;
    paths.push(polygonPath([
      { x: Math.round(first.x + nx), y: Math.round(first.y + ny) },
      { x: Math.round(second.x + nx), y: Math.round(second.y + ny) },
      { x: Math.round(second.x - nx), y: Math.round(second.y - ny) },
      { x: Math.round(first.x - nx), y: Math.round(first.y - ny) },
    ]));
  }
  if (arrow && points.length >= 2) {
    const end = points.at(-1);
    const previous = points.at(-2);
    const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
    const size = Math.max(12, width * 4);
    paths.push(polygonPath([
      end,
      { x: Math.round(end.x - Math.cos(angle - 0.55) * size), y: Math.round(end.y - Math.sin(angle - 0.55) * size) },
      { x: Math.round(end.x - Math.cos(angle + 0.55) * size), y: Math.round(end.y - Math.sin(angle + 0.55) * size) },
    ]));
  }
  return paths.join(" ");
}

function dialogue(startMs, endMs, payload) {
  return `Dialogue: 0,${assTime(startMs)},${assTime(endMs)},Default,,0,0,0,,${payload}`;
}

function primitiveEvents(primitive = {}, resolution = {}) {
  const style = primitive.style;
  const colorTag = `\\1c${assColor(style.color)}\\1a${assAlpha(style.opacity)}\\3c${assColor(style.secondaryColor)}\\3a${assAlpha(style.opacity)}`;
  if (primitive.type === "label") {
    const center = pixelPoint(primitive.center, resolution);
    const text = primitive.text.replace(/[{}]/g, "").replace(/\\/g, "\\\\");
    return [dialogue(primitive.startMs, primitive.endMs, `{\\an5\\pos(${center.x},${center.y})\\fs${Math.round(style.fontSize)}${colorTag}\\bord2\\shad0}${text}`)];
  }
  const points = primitive.type === "line"
    ? primitive.points.map((entry) => pixelPoint(entry, resolution))
    : primitive.type === "polygon"
      ? primitive.points.map((entry) => pixelPoint(entry, resolution))
      : ellipsePoints(primitive, resolution);
  const path = primitive.type === "line"
    ? linePath(points, style.lineWidth, primitive.arrow)
    : polygonPath(points);
  const fillOpacity = primitive.type === "line" ? style.opacity : style.fillOpacity;
  const shape = `{\\an7\\pos(0,0)\\p1\\bord${Math.round(style.lineWidth)}\\shad0\\1c${assColor(style.color)}\\1a${assAlpha(fillOpacity)}\\3c${assColor(style.color)}\\3a${assAlpha(style.opacity)}}${path}{\\p0}`;
  const events = [dialogue(primitive.startMs, primitive.endMs, shape)];
  if (primitive.text && points.length >= 2) {
    const first = points[0];
    const last = points.at(-1);
    const center = { x: Math.round((first.x + last.x) / 2), y: Math.round((first.y + last.y) / 2) };
    const text = primitive.text.replace(/[{}]/g, "").replace(/\\/g, "\\\\");
    events.push(dialogue(primitive.startMs, primitive.endMs, `{\\an5\\pos(${center.x},${center.y})\\fs${Math.round(style.fontSize)}${colorTag}\\bord2\\shad0}${text}`));
  }
  return events;
}

export function buildAssOverlay(specification = {}) {
  const resolution = specification.playRes || { width: 1920, height: 1080 };
  const events = specification.primitives.flatMap((primitive) => primitiveEvents(primitive, resolution));
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${resolution.width}`,
    `PlayResY: ${resolution.height}`,
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Default,Arial,24,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,5,10,10,10,1",
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events,
    "",
  ].join("\n");
}

export function createMediaOverlayStore(options = {}) {
  const entries = new Map();
  const clock = options.clock || Date.now;
  const ttlMs = Math.max(60_000, Number(options.ttlMs) || 60 * 60 * 1000);
  const limits = {
    maxBytes: Math.max(1024, Number(options.maxBytes) || 2 * 1024 * 1024),
    maxPrimitives: Math.max(1, Number(options.maxPrimitives) || 5000),
    maxDurationMs: Math.max(1000, Number(options.maxDurationMs) || 2 * 60 * 60 * 1000),
  };

  function prune() {
    const now = Number(clock()) || Date.now();
    for (const [id, entry] of entries) if (entry.expiresAtMs <= now) entries.delete(id);
  }

  return {
    async create(request, ownerToken) {
      prune();
      const raw = await readJson(request, limits.maxBytes);
      const specification = normalizeOverlay(raw, limits);
      const sha256 = createHash("sha256").update(stableJson(raw)).digest("hex");
      const id = randomUUID();
      const expiresAtMs = (Number(clock()) || Date.now()) + ttlMs;
      entries.set(id, { id, ownerToken, sha256, specification, expiresAtMs });
      return { id, sha256, primitiveCount: specification.primitives.length, expiresAt: new Date(expiresAtMs).toISOString() };
    },
    take(id, ownerToken, expectedSha256 = "") {
      prune();
      const entry = entries.get(String(id || ""));
      if (!entry || entry.ownerToken !== ownerToken || (expectedSha256 && entry.sha256 !== expectedSha256)) return null;
      entries.delete(entry.id);
      return { ...entry, ass: buildAssOverlay(entry.specification) };
    },
    size() {
      prune();
      return entries.size;
    },
  };
}
