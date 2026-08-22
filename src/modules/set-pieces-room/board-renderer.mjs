import {
  getSetPieceElementTransform,
  getSetPiecePitchTransform,
  getSetPiecePitchViewBox,
  setPiecePitchCanvas,
} from "./geometry.mjs";
import { renderSetPieceBoardBallSymbol } from "./ball-symbol.mjs";
import { getSetPieceDrawingControlPoint, getSetPieceDrawingPath } from "./drawing-geometry.mjs";
import {
  DEFAULT_SET_PIECE_OPPONENT_COLOR,
  DEFAULT_SET_PIECE_TEXT_BACKGROUND,
  DEFAULT_SET_PIECE_TEXT_COLOR,
  DEFAULT_SET_PIECE_TEXT_FONT_SIZE,
  DEFAULT_SET_PIECE_ZONE_COLOR,
  MAX_SET_PIECE_TEXT_FONT_SIZE,
  MIN_SET_PIECE_TEXT_FONT_SIZE,
  setPieceOpponentColors,
  setPieceTextBackgrounds,
  setPieceTextColors,
  setPieceZoneColors,
} from "./constants.mjs";

export function escapeSetPieceHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getSetPieceTextAnnotationMetrics(label = "", requestedFontSize = DEFAULT_SET_PIECE_TEXT_FONT_SIZE) {
  const source = String(label || "Text").trim() || "Text";
  const visibleLabel = source.length > 34 ? `${source.slice(0, 31)}...` : source;
  const numericFontSize = Number(requestedFontSize);
  const fontSize = Math.min(
    MAX_SET_PIECE_TEXT_FONT_SIZE,
    Math.max(MIN_SET_PIECE_TEXT_FONT_SIZE, Number.isFinite(numericFontSize) ? numericFontSize : DEFAULT_SET_PIECE_TEXT_FONT_SIZE)
  );
  return {
    label: visibleLabel,
    width: Number(Math.min(38, Math.max(7, visibleLabel.length * fontSize * .56 + 2.8)).toFixed(2)),
    height: Number((fontSize + 2.2).toFixed(2)),
    fontSize,
  };
}

function renderPitchGoal({ side, frontX, direction }) {
  const round = (value) => Number(value.toFixed(2));
  const frontTop = 30.34;
  const frontBottom = 37.66;
  const depth = 2.05;
  const rearInset = .55;
  const rearX = round(frontX + direction * depth);
  const rearTop = round(frontTop + rearInset);
  const rearBottom = round(frontBottom - rearInset);
  const surface = `M${frontX} ${frontTop}L${rearX} ${rearTop}V${rearBottom}L${frontX} ${frontBottom}Z`;
  const frame = `M${frontX} ${frontTop}L${rearX} ${rearTop}V${rearBottom}L${frontX} ${frontBottom}`;
  const depthNet = [.17, .34, .51, .68, .85].map((progress) => {
    const x = round(frontX + direction * depth * progress);
    const top = round(frontTop + rearInset * progress);
    const bottom = round(frontBottom - rearInset * progress);
    return `M${x} ${top}V${bottom}`;
  }).join("");
  const widthNet = [.125, .25, .375, .5, .625, .75, .875].map((progress) => {
    const startY = round(frontTop + (frontBottom - frontTop) * progress);
    const rearY = round(rearTop + (rearBottom - rearTop) * progress);
    return `M${frontX} ${startY}L${rearX} ${rearY}`;
  }).join("");
  return `<g class="spr-pitch-goal is-${side}-goal">
      <path d="${surface}" class="spr-pitch-goal-shadow" transform="translate(${round(direction * .14)} .16)"></path>
      <path d="${surface}" class="spr-pitch-goal-surface"></path>
      <path d="${depthNet}${widthNet}" class="spr-pitch-goal-net"></path>
      <path d="${frame}" class="spr-pitch-goal-frame"></path>
      <path d="M${frontX} ${frontTop}V${frontBottom}" class="spr-pitch-goal-mouth"></path>
      <circle cx="${frontX}" cy="${frontTop}" r=".18" class="spr-pitch-goal-post spr-round-marking"></circle>
      <circle cx="${frontX}" cy="${frontBottom}" r=".18" class="spr-pitch-goal-post spr-round-marking"></circle>
    </g>`;
}

function renderPitchGoals() {
  return `${renderPitchGoal({ side: "left", frontX: .7, direction: -1 })}
    ${renderPitchGoal({ side: "right", frontX: 104.3, direction: 1 })}`;
}

function renderPitchMarkings() {
  return `
    <g class="spr-pitch-markings" aria-hidden="true">
      <rect x="0.7" y="0.7" width="103.6" height="66.6" rx="0.5"></rect>
      <path d="M52.5 0.7V67.3"></path>
      <circle cx="52.5" cy="34" r="9.15" class="spr-round-marking"></circle>
      <circle cx="52.5" cy="34" r="0.8" class="spr-pitch-spot spr-round-marking"></circle>
      <path d="M0.7 13.84H17.2V54.16H0.7M104.3 13.84H87.8V54.16H104.3"></path>
      <path d="M0.7 24.84H6.2V43.16H0.7M104.3 24.84H98.8V43.16H104.3"></path>
      <circle cx="11" cy="34" r="0.65" class="spr-pitch-spot spr-round-marking"></circle>
      <circle cx="94" cy="34" r="0.65" class="spr-pitch-spot spr-round-marking"></circle>
      <path d="M17.2 26.65A9.15 9.15 0 0 1 17.2 41.35" class="spr-round-marking"></path>
      <path d="M87.8 26.65A9.15 9.15 0 0 0 87.8 41.35" class="spr-round-marking"></path>
      ${renderPitchGoals()}
      <path d="M0.7 1.7A1 1 0 0 0 1.7.7M103.3.7a1 1 0 0 0 1 1M.7 66.3a1 1 0 0 1 1 1M104.3 66.3a1 1 0 0 0-1 1"></path>
    </g>`;
}

function renderPitchGuides() {
  return `<g class="spr-pitch-guides" aria-hidden="true">
    <path d="M.7 13.6H104.3M.7 27.2H104.3M.7 40.8H104.3M.7 54.4H104.3"></path>
  </g>`;
}

function renderElement(element = {}, options = {}) {
  const selected = options.selectedElementIds?.has(element.id);
  const ghost = Boolean(options.ghost);
  const opponentColor = setPieceOpponentColors.has(element.opponentColor)
    ? element.opponentColor
    : DEFAULT_SET_PIECE_OPPONENT_COLOR;
  const classes = [
    "spr-board-element",
    `is-${element.kind}`,
    element.kind === "opponent" ? `is-opponent-color-${opponentColor}` : "",
    selected ? "is-selected" : "",
    ghost ? "is-ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const transform = getSetPieceElementTransform(element, options.pitchView || "full");
  const labels = {
    "home-player": `Own player ${element.playerName || element.label || "P"}${element.role ? `, ${element.role}` : ""}`,
    opponent: `Opponent ${element.showNumber === false ? "" : element.label || ""}`.trim(),
    ball: "Ball",
  };
  const interactive = options.interactive && !ghost;
  const accessibility = interactive
    ? ` tabindex="0" role="button" aria-label="${escapeSetPieceHtml(labels[element.kind] || "Board object")}" aria-keyshortcuts="Enter ArrowUp ArrowDown ArrowLeft ArrowRight Delete Backspace"`
    : "";
  const common = `class="${classes}" transform="${transform}" data-element-id="${escapeSetPieceHtml(element.id)}" data-layer="${escapeSetPieceHtml(element.kind)}"${accessibility}`;
  if (element.kind === "opponent") {
    return `<g ${common}>
      <circle r="4" class="spr-element-hit"></circle>
      <circle r="1.85" class="spr-opponent-token"></circle>
      ${element.showNumber === false ? "" : `<text y=".52">${escapeSetPieceHtml(element.label || "1")}</text>`}
      ${selected ? '<circle r="2.25" class="spr-selection-ring"></circle>' : ""}
    </g>`;
  }
  if (element.kind === "ball") {
    return `<g ${common}>
      <circle r="2.8" class="spr-element-hit"></circle>
      <g class="spr-board-ball-visual">${renderSetPieceBoardBallSymbol()}</g>
      ${selected ? '<circle r=".82" class="spr-selection-ring"></circle>' : ""}
    </g>`;
  }
  const photoUrl = String(element.photoUrl || "").trim();
  const playerMarkerMode = options.playerMarkerMode === "initials" ? "initials" : "photo";
  const showPhoto = playerMarkerMode === "photo" && Boolean(photoUrl);
  const avatarClipId = `${options.markerPrefix || "spr-board"}-home-avatar-clip`;
  return `<g ${common}>
    <circle r="3" class="spr-element-hit"></circle>
    <g class="spr-home-avatar ${showPhoto ? "has-photo" : "is-initials"}${playerMarkerMode === "photo" && !showPhoto ? " is-fallback" : ""}">
      <circle r="1.86" class="spr-home-avatar-frame"></circle>
      <circle r="1.62" class="spr-home-avatar-fallback"></circle>
      ${showPhoto ? `<image x="-1.62" y="-1.62" width="3.24" height="3.24" preserveAspectRatio="xMidYMid slice" href="${escapeSetPieceHtml(photoUrl)}" clip-path="url(#${escapeSetPieceHtml(avatarClipId)})" class="spr-home-avatar-photo"></image>` : `<text y=".43" class="spr-home-initials">${escapeSetPieceHtml(element.label || "P")}</text>`}
    </g>
    ${selected ? '<circle r="2.2" class="spr-selection-ring"></circle>' : ""}
  </g>`;
}

function renderDrawing(drawing = {}, options = {}) {
  const selected = options.selectedDrawingIds?.has(drawing.id) || drawing.id === options.selectedDrawingId;
  const preview = Boolean(options.preview);
  const zoneColor = setPieceZoneColors.has(drawing.zoneColor) ? drawing.zoneColor : DEFAULT_SET_PIECE_ZONE_COLOR;
  const textColor = setPieceTextColors.has(drawing.textColor) ? drawing.textColor : DEFAULT_SET_PIECE_TEXT_COLOR;
  const textBackground = setPieceTextBackgrounds.has(drawing.textBackground) ? drawing.textBackground : DEFAULT_SET_PIECE_TEXT_BACKGROUND;
  const classes = [
    "spr-drawing",
    `is-${drawing.type}`,
    drawing.type === "zone" ? `is-zone-${zoneColor}` : "",
    drawing.type === "text" ? `is-text-color-${textColor} is-text-background-${textBackground}` : "",
    selected ? "is-selected" : "",
    preview ? "is-preview" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const interactive = options.interactive && !preview;
  const drawingAccessibilityLabel = drawing.type === "text"
    ? `Text annotation: ${drawing.label || "Text"}`
    : `${drawing.type || "Movement"} drawing`;
  const accessibility = interactive
    ? ` tabindex="0" role="button" aria-label="${escapeSetPieceHtml(drawingAccessibilityLabel)}" aria-keyshortcuts="Enter ArrowUp ArrowDown ArrowLeft ArrowRight Delete Backspace"`
    : "";
  const common = `class="${classes}" data-drawing-id="${escapeSetPieceHtml(drawing.id || "preview")}"${accessibility}`;
  if (drawing.type === "text") {
    const metrics = getSetPieceTextAnnotationMetrics(drawing.label, drawing.fontSize);
    const orientation = options.halfPitch ? ' transform="rotate(90)"' : "";
    return `<g ${common} transform="translate(${Number(drawing.startX || 0)} ${Number(drawing.startY || 0)})" data-set-piece-text-annotation>
      <g${orientation}><g class="spr-text-annotation-content" style="--spr-text-font-size:${metrics.fontSize}px">
        <rect x="${-metrics.width / 2 - .8}" y="${-metrics.height / 2 - .8}" width="${metrics.width + 1.6}" height="${metrics.height + 1.6}" rx="1.5" class="spr-text-annotation-hit"></rect>
        <rect x="${-metrics.width / 2}" y="${-metrics.height / 2}" width="${metrics.width}" height="${metrics.height}" rx="1.2" class="spr-text-annotation-surface"></rect>
        <text y=".12" class="spr-text-annotation-label">${escapeSetPieceHtml(metrics.label)}</text>
      </g></g>
    </g>`;
  }
  if (drawing.type === "zone") {
    const x = Math.min(drawing.startX, drawing.endX);
    const y = Math.min(drawing.startY, drawing.endY);
    const width = Math.abs(drawing.endX - drawing.startX);
    const height = Math.abs(drawing.endY - drawing.startY);
    return `<g ${common}>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1.2" class="spr-zone-shape"></rect>
      ${drawing.label ? `<text x="${x + 1.2}" y="${y + 2.7}" class="spr-drawing-label">${escapeSetPieceHtml(drawing.label)}</text>` : ""}
    </g>`;
  }
  const markerPrefix = options.markerPrefix || "spr-board";
  const marker = ["run", "pass", "dribble", "press", "mark"].includes(drawing.type)
    ? ` marker-end="url(#${markerPrefix}-arrow-${drawing.type})"`
    : "";
  const midpointX = (Number(drawing.startX) + Number(drawing.endX)) / 2;
  const midpointY = (Number(drawing.startY) + Number(drawing.endY)) / 2;
  const labelTransform = options.halfPitch ? ` transform="rotate(90 ${midpointX} ${midpointY})"` : "";
  return `<g ${common}>
    <path d="${getSetPieceDrawingPath(drawing)}" class="spr-drawing-hit"></path>
    <path d="${getSetPieceDrawingPath(drawing)}" class="spr-drawing-shape"${marker}></path>
    ${drawing.label ? `<text x="${midpointX}" y="${midpointY - 1.25}" class="spr-drawing-label"${labelTransform}>${escapeSetPieceHtml(drawing.label)}</text>` : ""}
  </g>`;
}

function renderDrawingHandle(x, y, handle, className) {
  return `<g class="spr-drawing-handle-target ${className}">
    <circle cx="${x}" cy="${y}" r=".55" class="spr-drawing-handle-hit" data-drawing-handle="${handle}" aria-hidden="true"></circle>
    <circle cx="${x}" cy="${y}" r=".26" class="spr-drawing-handle ${className}" aria-hidden="true"></circle>
  </g>`;
}

function renderDrawingControls(drawing = {}, options = {}) {
  const drawingSelectionCount = options.selectedDrawingIds?.size || (options.selectedDrawingId ? 1 : 0);
  if (
    !drawing?.id ||
    drawing.type === "text" ||
    !options.interactive ||
    drawing.id !== options.selectedDrawingId ||
    drawingSelectionCount !== 1 ||
    options.selectedElementIds?.size
  ) return "";
  const common = `class="spr-drawing-controls is-${escapeSetPieceHtml(drawing.type)}" data-drawing-id="${escapeSetPieceHtml(drawing.id)}"`;
  if (drawing.type === "zone") {
    const x = Math.min(drawing.startX, drawing.endX);
    const y = Math.min(drawing.startY, drawing.endY);
    const width = Math.abs(drawing.endX - drawing.startX);
    const height = Math.abs(drawing.endY - drawing.startY);
    return `<g ${common}>
      ${renderDrawingHandle(x, y, "zone-nw", "is-zone")}
      ${renderDrawingHandle(x + width, y, "zone-ne", "is-zone")}
      ${renderDrawingHandle(x + width, y + height, "zone-se", "is-zone")}
      ${renderDrawingHandle(x, y + height, "zone-sw", "is-zone")}
    </g>`;
  }
  const midpointX = (Number(drawing.startX) + Number(drawing.endX)) / 2;
  const midpointY = (Number(drawing.startY) + Number(drawing.endY)) / 2;
  const control = getSetPieceDrawingControlPoint(drawing);
  return `<g ${common}>
    <path d="M ${midpointX} ${midpointY} L ${control.x} ${control.y}" class="spr-drawing-transform-guide"></path>
    ${renderDrawingHandle(drawing.startX, drawing.startY, "start", "is-endpoint")}
    ${renderDrawingHandle(drawing.endX, drawing.endY, "end", "is-endpoint")}
    ${renderDrawingHandle(control.x, control.y, "curve", "is-curve")}
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
  const halfPitch = options.pitchView === "attacking-half" || options.pitchView === "defensive-half";
  const wideEditor = Boolean(options.wideEditor);
  const markerPrefix = String(options.markerPrefix || "spr-board").replace(/[^a-zA-Z0-9_-]/g, "-");
  const renderOptions = { ...options, halfPitch, markerPrefix };
  const ghosts = previousPhase
    ? (previousPhase.elements || []).filter((element) => visibleElement(element) && previousIds.has(element.id)).map((element) => renderElement(element, { ...renderOptions, ghost: true })).join("")
    : "";
  const drawings = layers.has("drawings")
    ? (phase.drawings || []).map((drawing) => renderDrawing(drawing, renderOptions)).join("")
    : "";
  const elements = (phase.elements || [])
    .filter(visibleElement)
    .map((element) => renderElement(element, renderOptions))
    .join("");
  const drawingControls = renderDrawingControls(
    (phase.drawings || []).find((drawing) => drawing.id === options.selectedDrawingId),
    renderOptions
  );
  const preview = options.previewDrawing ? renderDrawing(options.previewDrawing, { preview: true, halfPitch, markerPrefix }) : "";
  const pitchTransform = getSetPiecePitchTransform(options.pitchView);
  return `<svg class="spr-pitch ${halfPitch ? "is-half-pitch" : "is-full-pitch"} ${wideEditor ? "is-wide-editor-pitch" : ""}" data-set-piece-pitch data-pitch-view="${escapeSetPieceHtml(options.pitchView || "full")}" viewBox="${getSetPiecePitchViewBox(options.pitchView)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Set piece tactical board">
    <defs>
      ${["run", "pass", "dribble", "press", "mark"].map((type) => `<marker id="${markerPrefix}-arrow-${type}" class="spr-arrow-marker is-${type}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z"></path></marker>`).join("")}
      <pattern id="${markerPrefix}-pitch-pattern" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="12"></rect></pattern>
      <clipPath id="${markerPrefix}-home-avatar-clip"><circle r="1.62"></circle></clipPath>
    </defs>
    <g class="spr-pitch-content"${pitchTransform ? ` transform="${pitchTransform}"` : ""}>
      <rect x="${setPiecePitchCanvas.x}" y="${setPiecePitchCanvas.y}" width="${setPiecePitchCanvas.width}" height="${setPiecePitchCanvas.height}" class="spr-pitch-base"></rect>
      <rect x="${setPiecePitchCanvas.x}" y="${setPiecePitchCanvas.y}" width="${setPiecePitchCanvas.width}" height="${setPiecePitchCanvas.height}" fill="url(#${markerPrefix}-pitch-pattern)" class="spr-pitch-stripes"></rect>
      ${renderPitchMarkings()}
      ${options.showPitchGuides ? renderPitchGuides() : ""}
      <g class="spr-ghost-layer">${ghosts}</g>
      <g class="spr-drawing-layer">${drawings}${preview}</g>
      <g class="spr-element-layer ${layers.has("labels") ? "" : "hide-labels"}">${elements}</g>
      <g class="spr-interaction-layer">${drawingControls}</g>
      ${renderSelectionRect(options.selectionRect)}
    </g>
  </svg>`;
}

export function renderSetPiecePhaseThumbnail(phase = {}, pitchView = "full") {
  const halfPitch = pitchView === "attacking-half" || pitchView === "defensive-half";
  const transform = getSetPiecePitchTransform(pitchView);
  const elements = (phase.elements || []).map((element) => {
    const className = element.kind === "home-player" ? "home" : element.kind === "opponent" ? "opponent" : "ball";
    const radius = element.kind === "ball" ? 1.2 : 1.8;
    return `<circle cx="${element.x}" cy="${element.y}" r="${radius}" class="${className}"></circle>`;
  }).join("");
  return `<svg class="${halfPitch ? "is-half-pitch" : "is-full-pitch"}" viewBox="${getSetPiecePitchViewBox(pitchView)}" aria-hidden="true"><g${transform ? ` transform="${transform}"` : ""}><rect x="${setPiecePitchCanvas.x}" y="${setPiecePitchCanvas.y}" width="${setPiecePitchCanvas.width}" height="${setPiecePitchCanvas.height}"></rect><path d="M52.5 0V68M0 13.84H17V54.16H0M105 13.84H88V54.16H105"></path>${elements}</g></svg>`;
}
