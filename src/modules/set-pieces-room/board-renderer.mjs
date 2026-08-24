import {
  getSetPieceElementTransform,
  getSetPiecePitchLayoutAspect,
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

const pitchGrassImage = Object.freeze({
  x: 52.5 - setPiecePitchCanvas.height / 2,
  y: 34 - setPiecePitchCanvas.width / 2,
  width: setPiecePitchCanvas.height,
  height: setPiecePitchCanvas.width,
});

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
  const rotation = direction < 0 ? -90 : 90;
  const frontHalfWidth = 3.66;
  const rearHalfWidth = 4.08;
  const rearDepth = -2.12;
  const rearY = (x) => round(rearDepth + .34 * (1 - Math.abs(x / frontHalfWidth)));
  const depthMesh = [-3.05, -2.44, -1.83, -1.22, -.61, 0, .61, 1.22, 1.83, 2.44, 3.05]
    .map((x) => {
      const rearX = round((x / frontHalfWidth) * rearHalfWidth);
      const controlX = round((x + rearX) / 2);
      return `M${x} 0Q${controlX} -1.06 ${rearX} ${rearY(x)}`;
    })
    .join("");
  const widthMesh = [.14, .28, .42, .56, .7, .84]
    .map((progress) => {
      const edgeX = round(frontHalfWidth + (rearHalfWidth - frontHalfWidth) * progress);
      const edgeY = round(rearDepth * progress);
      const centerY = round((rearDepth + .34) * progress + .08 * Math.sin(progress * Math.PI));
      return `M-${edgeX} ${edgeY}Q0 ${centerY} ${edgeX} ${edgeY}`;
    })
    .join("");
  const rearCurve = `Q0 ${rearDepth + .34} ${rearHalfWidth} ${rearDepth}`;
  const rearEdge = `M-${rearHalfWidth} ${rearDepth}${rearCurve}`;
  return `<g class="spr-pitch-goal is-${side}-goal" transform="translate(${frontX} 34) rotate(${rotation})">
      <g class="spr-pitch-goal-net">
        <image href="assets/set-pieces/pitch-goal-reference.png" x="-5.18" y="-5.58" width="10.36" height="6.21" preserveAspectRatio="xMidYMid meet" class="spr-pitch-goal-image"></image>
        <path d="M-${frontHalfWidth} 0L-${rearHalfWidth} ${rearDepth}${rearCurve}L${frontHalfWidth} 0Z" class="spr-pitch-goal-net-surface"></path>
        <path d="${depthMesh}${widthMesh}${rearEdge}" class="spr-pitch-goal-mesh"></path>
        <path d="M-${frontHalfWidth} 0L-${rearHalfWidth} ${rearDepth}${rearCurve}L${frontHalfWidth} 0" class="spr-pitch-goal-net-edge"></path>
      </g>
      <path d="M-3.66 0H3.66" class="spr-pitch-goal-mouth"></path>
      <circle cx="-3.66" cy="0" r=".13" class="spr-pitch-goal-post spr-round-marking"></circle>
      <circle cx="3.66" cy="0" r=".13" class="spr-pitch-goal-post spr-round-marking"></circle>
    </g>`;
}

function renderPitchGoals() {
  return `${renderPitchGoal({ side: "left", frontX: .7, direction: -1 })}
    ${renderPitchGoal({ side: "right", frontX: 104.3, direction: 1 })}`;
}

function renderPitchCornerFlags() {
  return [
    { x: .7, y: .7, rotation: -45 },
    { x: 104.3, y: .7, rotation: 45 },
    { x: .7, y: 67.3, rotation: -135 },
    { x: 104.3, y: 67.3, rotation: 135 },
  ].map(({ x, y, rotation }) => `<g class="spr-pitch-corner-flag" transform="translate(${x} ${y}) rotate(${rotation})">
      <circle r=".11" class="spr-pitch-corner-flag-base"></circle>
      <path d="M0 0V-1.55" class="spr-pitch-corner-flag-pole"></path>
      <path d="M0 -1.52L.66 -1.3L0 -1.07Z" class="spr-pitch-corner-flag-pennant"></path>
    </g>`).join("");
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
      <circle cx="11" cy="34" r="0.4" class="spr-pitch-spot spr-penalty-spot spr-round-marking"></circle>
      <circle cx="94" cy="34" r="0.4" class="spr-pitch-spot spr-penalty-spot spr-round-marking"></circle>
      <path d="M17.2 26.65A9.15 9.15 0 0 1 17.2 41.35" class="spr-round-marking"></path>
      <path d="M87.8 26.65A9.15 9.15 0 0 0 87.8 41.35" class="spr-round-marking"></path>
      ${renderPitchGoals()}
      <g class="spr-pitch-corner-flags">${renderPitchCornerFlags()}</g>
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
      <circle r="2.7" class="spr-element-hit"></circle>
      <circle r="1.5" class="spr-opponent-token"></circle>
      ${element.showNumber === false ? "" : `<text y=".42">${escapeSetPieceHtml(element.label || "1")}</text>`}
      ${selected ? '<circle r="1.88" class="spr-selection-ring"></circle>' : ""}
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
  return `<svg class="spr-pitch ${halfPitch ? "is-half-pitch" : "is-full-pitch"} ${wideEditor ? "is-wide-editor-pitch" : ""}" data-set-piece-pitch data-pitch-view="${escapeSetPieceHtml(options.pitchView || "full")}" data-layout-aspect="${getSetPiecePitchLayoutAspect(options.pitchView)}" viewBox="${getSetPiecePitchViewBox(options.pitchView)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Set piece tactical board">
    <defs>
      ${["run", "pass", "dribble", "press", "mark"].map((type) => `<marker id="${markerPrefix}-arrow-${type}" class="spr-arrow-marker is-${type}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z"></path></marker>`).join("")}
      <clipPath id="${markerPrefix}-home-avatar-clip"><circle r="1.62"></circle></clipPath>
    </defs>
    <g class="spr-pitch-content"${pitchTransform ? ` transform="${pitchTransform}"` : ""}>
      <rect x="${setPiecePitchCanvas.x}" y="${setPiecePitchCanvas.y}" width="${setPiecePitchCanvas.width}" height="${setPiecePitchCanvas.height}" class="spr-pitch-base"></rect>
      <image href="assets/set-pieces/pitch-grass-ad.jpg" x="${pitchGrassImage.x}" y="${pitchGrassImage.y}" width="${pitchGrassImage.width}" height="${pitchGrassImage.height}" transform="rotate(90 52.5 34)" preserveAspectRatio="xMidYMid slice" class="spr-pitch-grass"></image>
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
