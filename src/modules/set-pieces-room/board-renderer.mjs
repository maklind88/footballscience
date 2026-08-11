import { getSetPiecePitchViewBox } from "./geometry.mjs";

export function escapeSetPieceHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function drawingPath(drawing = {}) {
  const startX = Number(drawing.startX || 0);
  const startY = Number(drawing.startY || 0);
  const endX = Number(drawing.endX || 0);
  const endY = Number(drawing.endY || 0);
  const curve = Number(drawing.curve || 0);
  if (!curve) return `M ${startX} ${startY} L ${endX} ${endY}`;
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const controlX = (startX + endX) / 2 - (dy / distance) * curve;
  const controlY = (startY + endY) / 2 + (dx / distance) * curve;
  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

function renderPitchMarkings() {
  return `
    <g class="spr-pitch-markings" aria-hidden="true">
      <rect x="0.7" y="0.7" width="103.6" height="66.6" rx="0.5"></rect>
      <path d="M52.5 0.7V67.3"></path>
      <circle cx="52.5" cy="34" r="9.15"></circle>
      <circle cx="52.5" cy="34" r="0.8" class="spr-pitch-spot"></circle>
      <path d="M0.7 13.84H17.2V54.16H0.7M104.3 13.84H87.8V54.16H104.3"></path>
      <path d="M0.7 24.84H6.2V43.16H0.7M104.3 24.84H98.8V43.16H104.3"></path>
      <circle cx="11" cy="34" r="0.65" class="spr-pitch-spot"></circle>
      <circle cx="94" cy="34" r="0.65" class="spr-pitch-spot"></circle>
      <path d="M17.2 26.65A9.15 9.15 0 0 1 17.2 41.35M87.8 26.65A9.15 9.15 0 0 0 87.8 41.35"></path>
      <path d="M0 30.34H-2.4V37.66H0M105 30.34H107.4V37.66H105" class="spr-pitch-goals"></path>
      <path d="M0.7 1.7A1 1 0 0 0 1.7.7M103.3.7a1 1 0 0 0 1 1M.7 66.3a1 1 0 0 1 1 1M104.3 66.3a1 1 0 0 0-1 1"></path>
    </g>`;
}

function renderElement(element = {}, options = {}) {
  const selected = options.selectedElementIds?.has(element.id);
  const ghost = Boolean(options.ghost);
  const classes = ["spr-board-element", `is-${element.kind}`, selected ? "is-selected" : "", ghost ? "is-ghost" : ""]
    .filter(Boolean)
    .join(" ");
  const transform = `translate(${Number(element.x || 0)} ${Number(element.y || 0)}) rotate(${Number(element.rotation || 0)})`;
  const common = `class="${classes}" transform="${transform}" data-element-id="${escapeSetPieceHtml(element.id)}" data-layer="${escapeSetPieceHtml(element.kind)}"`;
  if (element.kind === "opponent") {
    return `<g ${common}>
      <circle r="4" class="spr-element-hit"></circle>
      <circle r="2.75" class="spr-opponent-token"></circle>
      <path d="M0-2.2V-4.3" class="spr-body-direction"></path>
      <text y=".85">${escapeSetPieceHtml(element.label || "1")}</text>
      ${selected ? '<circle r="4.25" class="spr-selection-ring"></circle>' : ""}
    </g>`;
  }
  if (element.kind === "ball") {
    return `<g ${common}>
      <circle r="3.4" class="spr-element-hit"></circle>
      <circle r="1.45" class="spr-ball-token"></circle>
      <path d="M-.8-.45.1-1.05.9-.35.55.65-.55.65Z" class="spr-ball-detail"></path>
      ${selected ? '<circle r="3.35" class="spr-selection-ring"></circle>' : ""}
    </g>`;
  }
  return `<g ${common}>
    <rect x="-4" y="-4" width="8" height="8" rx="2.65" class="spr-element-hit"></rect>
    <rect x="-2.85" y="-2.85" width="5.7" height="5.7" rx="1.7" class="spr-home-token"></rect>
    <path d="M0-2.35V-4.45" class="spr-body-direction"></path>
    <text y=".82">${escapeSetPieceHtml(element.label || "P")}</text>
    ${selected ? '<rect x="-4.15" y="-4.15" width="8.3" height="8.3" rx="2.8" class="spr-selection-ring"></rect>' : ""}
  </g>`;
}

function renderDrawing(drawing = {}, options = {}) {
  const selected = drawing.id === options.selectedDrawingId;
  const preview = Boolean(options.preview);
  const classes = ["spr-drawing", `is-${drawing.type}`, selected ? "is-selected" : "", preview ? "is-preview" : ""]
    .filter(Boolean)
    .join(" ");
  if (drawing.type === "zone") {
    const x = Math.min(drawing.startX, drawing.endX);
    const y = Math.min(drawing.startY, drawing.endY);
    const width = Math.abs(drawing.endX - drawing.startX);
    const height = Math.abs(drawing.endY - drawing.startY);
    return `<g class="${classes}" data-drawing-id="${escapeSetPieceHtml(drawing.id || "preview")}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1.2" class="spr-zone-shape"></rect>
      ${drawing.label ? `<text x="${x + 1.2}" y="${y + 2.7}" class="spr-drawing-label">${escapeSetPieceHtml(drawing.label)}</text>` : ""}
    </g>`;
  }
  const marker = ["run", "pass", "dribble", "press", "mark"].includes(drawing.type) ? ` marker-end="url(#spr-arrow-${drawing.type})"` : "";
  const midpointX = (Number(drawing.startX) + Number(drawing.endX)) / 2;
  const midpointY = (Number(drawing.startY) + Number(drawing.endY)) / 2;
  return `<g class="${classes}" data-drawing-id="${escapeSetPieceHtml(drawing.id || "preview")}">
    <path d="${drawingPath(drawing)}"${marker}></path>
    ${drawing.label ? `<text x="${midpointX}" y="${midpointY - 1.25}" class="spr-drawing-label">${escapeSetPieceHtml(drawing.label)}</text>` : ""}
  </g>`;
}

function renderSelectionRect(selectionRect = null) {
  if (!selectionRect) return "";
  const x = Math.min(selectionRect.startX, selectionRect.endX);
  const y = Math.min(selectionRect.startY, selectionRect.endY);
  return `<rect class="spr-selection-box" x="${x}" y="${y}" width="${Math.abs(selectionRect.endX - selectionRect.startX)}" height="${Math.abs(selectionRect.endY - selectionRect.startY)}"></rect>`;
}

export function renderSetPieceBoard(options = {}) {
  const phase = options.phase || { elements: [], drawings: [] };
  const previousPhase = options.previousPhase || null;
  const layers = options.layers || new Set(["home", "opponent", "ball", "drawings", "labels"]);
  const visibleElement = (element) => {
    if (element.kind === "home-player") return layers.has("home");
    if (element.kind === "opponent") return layers.has("opponent");
    return layers.has("ball");
  };
  const previousIds = new Set((phase.elements || []).map((element) => element.id));
  const ghosts = previousPhase
    ? (previousPhase.elements || []).filter((element) => visibleElement(element) && previousIds.has(element.id)).map((element) => renderElement(element, { ghost: true })).join("")
    : "";
  const drawings = layers.has("drawings")
    ? (phase.drawings || []).map((drawing) => renderDrawing(drawing, options)).join("")
    : "";
  const elements = (phase.elements || [])
    .filter(visibleElement)
    .map((element) => renderElement(element, options))
    .join("");
  const preview = options.previewDrawing ? renderDrawing(options.previewDrawing, { preview: true }) : "";
  return `<svg class="spr-pitch" data-set-piece-pitch viewBox="${getSetPiecePitchViewBox(options.pitchView)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Set piece tactical board">
    <defs>
      ${["run", "pass", "dribble", "press", "mark"].map((type) => `<marker id="spr-arrow-${type}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z"></path></marker>`).join("")}
      <pattern id="spr-pitch-pattern" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="12"></rect></pattern>
    </defs>
    <rect width="105" height="68" class="spr-pitch-base"></rect>
    <rect width="105" height="68" fill="url(#spr-pitch-pattern)" class="spr-pitch-stripes"></rect>
    ${renderPitchMarkings()}
    <g class="spr-ghost-layer">${ghosts}</g>
    <g class="spr-drawing-layer">${drawings}${preview}</g>
    <g class="spr-element-layer ${layers.has("labels") ? "" : "hide-labels"}">${elements}</g>
    ${renderSelectionRect(options.selectionRect)}
  </svg>`;
}

export function renderSetPiecePhaseThumbnail(phase = {}, pitchView = "full") {
  const elements = (phase.elements || []).map((element) => {
    const className = element.kind === "home-player" ? "home" : element.kind === "opponent" ? "opponent" : "ball";
    const radius = element.kind === "ball" ? 1.2 : 1.8;
    return `<circle cx="${element.x}" cy="${element.y}" r="${radius}" class="${className}"></circle>`;
  }).join("");
  return `<svg viewBox="${getSetPiecePitchViewBox(pitchView)}" aria-hidden="true"><rect width="105" height="68"></rect><path d="M52.5 0V68M0 13.84H17V54.16H0M105 13.84H88V54.16H105"></path>${elements}</svg>`;
}
