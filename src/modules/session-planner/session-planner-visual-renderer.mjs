import {
  getTacticalBoardElementEndpointCoordinates,
  renderTacticalBoardSvgElement,
} from "../tactical-board/index.mjs";

function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultClamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function defaultNoop() {
  return "";
}

function defaultState() {
  return {
    visualPreviewOpen: false,
    tacticalboardOpen: false,
    tool: "blue-player",
    color: "#0d4f86",
    lineWidth: 1.1,
    lineStyle: "solid",
    pendingPoint: null,
    selectedElementId: "",
    draftLineState: null,
    freehandState: null,
  };
}

export function createSessionPlannerVisualRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const getState = typeof options.getState === "function" ? options.getState : defaultState;
  const getPitchModeOptions =
    typeof options.getPitchModeOptions === "function"
      ? options.getPitchModeOptions
      : () => [{ key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false }];
  const normalizeSessionPlannerTacticalPitchMode =
    typeof options.normalizeTacticalPitchMode === "function"
      ? options.normalizeTacticalPitchMode
      : (value) => String(value || "full").trim() || "full";
  const getSessionPlannerTacticalPitchModeOption =
    typeof options.getTacticalPitchModeOption === "function"
      ? options.getTacticalPitchModeOption
      : (mode) => getPitchModeOptions().find((option) => option.key === normalizeSessionPlannerTacticalPitchMode(mode)) ?? getPitchModeOptions()[0];
  const isSessionPlannerTacticalElementSelected =
    typeof options.isTacticalElementSelected === "function" ? options.isTacticalElementSelected : () => false;
  const isSessionPlannerTacticalPlayerType =
    typeof options.isTacticalPlayerType === "function"
      ? options.isTacticalPlayerType
      : (type = "") => type === "blue-player" || type === "red-player" || type === "neutral-player";
  const normalizeTacticalColor =
    typeof options.normalizeTacticalColor === "function"
      ? options.normalizeTacticalColor
      : (value, fallback = "#111827") => (/^#[0-9a-f]{3,8}$/i.test(String(value || "").trim()) ? String(value).trim() : fallback);
  const getDefaultTacticalColor =
    typeof options.getDefaultTacticalColor === "function" ? options.getDefaultTacticalColor : () => "#111827";
  const getSessionPlannerTacticalRenderStrokeWidth =
    typeof options.getTacticalRenderStrokeWidth === "function" ? options.getTacticalRenderStrokeWidth : (value) => clamp(Number(value) || 1.1, 0.16, 3.15);
  const getTacticalStrokeDasharray =
    typeof options.getTacticalStrokeDasharray === "function" ? options.getTacticalStrokeDasharray : () => "";
  const getDefaultTacticalLineStyle =
    typeof options.getDefaultTacticalLineStyle === "function" ? options.getDefaultTacticalLineStyle : () => "solid";
  const getSessionPlannerTacticalDefaultCurveControlPoint =
    typeof options.getTacticalDefaultCurveControlPoint === "function"
      ? options.getTacticalDefaultCurveControlPoint
      : (from = {}, to = {}) => ({ x: (Number(from.x) + Number(to.x || from.x || 0)) / 2, y: (Number(from.y) + Number(to.y || from.y || 0)) / 2 });
  const getSessionPlannerTacticalCurveControlPoint =
    typeof options.getTacticalCurveControlPoint === "function"
      ? options.getTacticalCurveControlPoint
      : (element = {}, coordinates = null) => getSessionPlannerTacticalDefaultCurveControlPoint(element, coordinates || element);
  const isSessionPlannerTacticalGoalType =
    typeof options.isTacticalGoalType === "function" ? options.isTacticalGoalType : (type = "") => type === "mini-goal" || type === "big-goal";
  const normalizeTacticalRotation =
    typeof options.normalizeTacticalRotation === "function" ? options.normalizeTacticalRotation : (value) => Number(value) || 0;
  const normalizeSessionPlannerTacticalPlayerBadge =
    typeof options.normalizeTacticalPlayerBadge === "function" ? options.normalizeTacticalPlayerBadge : (value) => String(value ?? "").trim().slice(0, 2);
  const isSessionPlannerTacticalEndpointElement =
    typeof options.isTacticalEndpointElement === "function"
      ? options.isTacticalEndpointElement
      : (element = {}) => Boolean(element && ["arrow", "pass", "run", "line", "dashed-line", "curve", "zone", "dashed-zone", "ellipse"].includes(element.type));
  const getSessionPlannerTacticalPitchDimensionsForBlock =
    typeof options.getTacticalPitchDimensionsForBlock === "function"
      ? options.getTacticalPitchDimensionsForBlock
      : (block = {}) => getSessionPlannerTacticalPitchModeOption(block.tacticalPitchMode).dimensions;
  const cloneSessionPlannerTacticalElement =
    typeof options.cloneTacticalElement === "function" ? options.cloneTacticalElement : (element = {}) => ({ ...element });
  const createSessionPlannerLineElement =
    typeof options.createLineElement === "function"
      ? options.createLineElement
      : (type, from, to) => ({ type, x: from.x, y: from.y, x2: to.x, y2: to.y });
  const renderSelectionBox = typeof options.renderSelectionBox === "function" ? options.renderSelectionBox : defaultNoop;
  const ensureSessionPlannerTacticalFrames =
    typeof options.ensureTacticalFrames === "function" ? options.ensureTacticalFrames : () => [];
  const getSessionPlannerTacticalActiveFrameId =
    typeof options.getTacticalActiveFrameId === "function" ? options.getTacticalActiveFrameId : () => "";
  const getSessionPlannerTacticalSelectedElementIds =
    typeof options.getTacticalSelectedElementIds === "function" ? options.getTacticalSelectedElementIds : () => [];
  const getSessionPlannerTacticalNumberPickerElementId =
    typeof options.getTacticalNumberPickerElementId === "function" ? options.getTacticalNumberPickerElementId : () => "";
  const clearSessionPlannerTacticalNumberPickerElementId =
    typeof options.clearTacticalNumberPickerElementId === "function" ? options.clearTacticalNumberPickerElementId : () => {};

function renderSessionPlannerPitchDiagram(diagram = "empty", options = {}) {
const markersByDiagram = {
empty: [],
"possession-lanes": [
[13, 46, "blue"], [22, 40, "blue"], [33, 50, "blue"], [43, 44, "blue"], [54, 52, "blue"], [68, 58, "blue"],
[18, 60, "red"], [31, 67, "red"], [42, 62, "red"], [56, 69, "red"], [75, 64, "red"], [46, 38, "red"],
[26, 30, "ball"],
],
"build-up": [
[16, 76, "blue"], [28, 64, "blue"], [42, 72, "blue"], [55, 58, "blue"], [68, 68, "blue"],
[34, 48, "red"], [50, 44, "red"], [66, 48, "red"], [44, 62, "ball"],
],
"final-third": [
[18, 44, "blue"], [31, 38, "blue"], [45, 45, "blue"], [58, 34, "blue"], [72, 50, "blue"],
[35, 55, "red"], [50, 58, "red"], [66, 56, "red"], [22, 44, "ball"],
],
};
const resolvedDiagram = markersByDiagram[diagram] ? diagram : "empty";
const markers = markersByDiagram[resolvedDiagram];
const isEmptyDiagram = resolvedDiagram === "empty";
const pitchMode = normalizeSessionPlannerTacticalPitchMode(options.pitchMode);
const pitchModeOption = getSessionPlannerTacticalPitchModeOption(pitchMode);
const isLandscape = Boolean(options.landscape || pitchModeOption.landscape);
return `
    <div class="session-pitch-diagram session-pitch-diagram-${escapeHtml(resolvedDiagram)} session-pitch-diagram-mode-${escapeHtml(pitchMode)}${isLandscape ? " session-pitch-diagram-landscape" : ""}" aria-label="Exercise pitch diagram">
      <div class="session-pitch-goal session-pitch-goal-top"></div>
      <div class="session-pitch-goal session-pitch-goal-bottom"></div>
      <div class="session-pitch-box session-pitch-box-top"></div>
      <div class="session-pitch-box session-pitch-box-bottom"></div>
      <div class="session-pitch-goal-area session-pitch-goal-area-top"></div>
      <div class="session-pitch-goal-area session-pitch-goal-area-bottom"></div>
      <span class="session-pitch-penalty-spot session-pitch-penalty-spot-top"></span>
      <span class="session-pitch-penalty-spot session-pitch-penalty-spot-bottom"></span>
      <div class="session-pitch-halfway-edge session-pitch-halfway-edge-top"></div>
      <div class="session-pitch-halfway-edge session-pitch-halfway-edge-bottom"></div>
      <div class="session-pitch-circle"></div>
      ${
        isEmptyDiagram
          ? ""
          : `
<div class="session-pitch-zone"></div>
<div class="session-pitch-dashed session-pitch-dashed-top"></div>
<div class="session-pitch-dashed session-pitch-dashed-bottom"></div>
<div class="session-mini-goal" style="left: 24%; top: 30%;"></div>
<div class="session-mini-goal" style="left: 48%; top: 30%;"></div>
<div class="session-mini-goal" style="left: 72%; top: 30%;"></div>
<div class="session-mini-goal" style="left: 24%; top: 78%;"></div>
<div class="session-mini-goal" style="left: 48%; top: 78%;"></div>
<div class="session-mini-goal" style="left: 72%; top: 78%;"></div>
`
      }
      ${markers
        .map(([left, top, team]) => `
<span
class="session-player-marker session-player-marker-${escapeHtml(team)}"
style="left: ${left}%; top: ${top}%;"
></span>
`)
        .join("")}
    </div>
  `;
}
function getSessionPlannerVisualElementId(block) {
return `session-arrow-${String(block?.id || "block").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
function renderSessionPlannerTacticalSvgElement(element, arrowId) {
return renderTacticalBoardSvgElement(element, arrowId, {
  escapeHtml,
  clamp,
  isSelected: isSessionPlannerTacticalElementSelected,
  normalizeColor: normalizeTacticalColor,
  getDefaultColor: getDefaultTacticalColor,
  getRenderStrokeWidth: getSessionPlannerTacticalRenderStrokeWidth,
  getStrokeDasharray: getTacticalStrokeDasharray,
  getDefaultLineStyle: getDefaultTacticalLineStyle,
  getDefaultCurveControlPoint: getSessionPlannerTacticalDefaultCurveControlPoint,
  getCurveControlPoint: getSessionPlannerTacticalCurveControlPoint,
  dataAttributeName: "data-session-tactical-element-id",
  classPrefix: "session-tactical",
  hitTargetClassName: "session-tactical-hit-target",
  shapeHitTargetClassName: "session-tactical-shape-hit-target",
});
}
function renderSessionPlannerTacticalHtmlElement(element) {
const x = Number.isFinite(Number(element.x)) ? Number(element.x) : 50;
const y = Number.isFinite(Number(element.y)) ? Number(element.y) : 50;
const color = normalizeTacticalColor(element.color, getDefaultTacticalColor(element.type));
const rotation = isSessionPlannerTacticalGoalType(element.type) ? normalizeTacticalRotation(element.rotation) : 0;
const style = `left: ${x}%; top: ${y}%; --session-tactical-color: ${escapeHtml(color)}; --session-tactical-rotation: ${rotation}deg;`;
const dataAttribute = `data-session-tactical-element-id="${escapeHtml(element.id)}"`;
const selectedClass = isSessionPlannerTacticalElementSelected(element.id) ? " is-selected" : "";
if (element.type === "text") {
return `
      <span
        class="session-tactical-marker session-tactical-text${selectedClass}"
        ${dataAttribute}
        style="${style}"
      >${escapeHtml(element.label || "Text")}</span>
    `;
}
if (element.type === "mini-goal") {
return `
      <span
        class="session-tactical-marker session-tactical-mini-goal${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      ></span>
    `;
}
if (element.type === "big-goal") {
return `
      <span
        class="session-tactical-marker session-tactical-big-goal${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      ></span>
    `;
}
if (element.type === "coach") {
return `
      <span
        class="session-tactical-marker session-tactical-coach${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-label="Coach"
      >C</span>
    `;
}
if (element.type === "mannequin") {
return `
      <span
        class="session-tactical-marker session-tactical-mannequin${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      ></span>
    `;
}
if (element.type === "pole") {
return `
      <span
        class="session-tactical-marker session-tactical-pole${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      ></span>
    `;
}
if (element.type === "gate") {
return `
      <span
        class="session-tactical-marker session-tactical-gate${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      ></span>
    `;
}
if (element.type === "cone") {
return `
      <span
        class="session-tactical-marker session-tactical-cone${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      ></span>
    `;
}
if (element.type === "ball") {
return `
      <span
        class="session-tactical-marker session-tactical-ball${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      ></span>
    `;
}
if (element.type === "blue-player" || element.type === "red-player" || element.type === "neutral-player") {
const playerBadge = normalizeSessionPlannerTacticalPlayerBadge(element.playerNumber);
const badgeClass = playerBadge ? " has-badge" : "";
const badgeSizeClass = playerBadge.length > 1 ? " is-wide" : "";
return `
      <span
        class="session-tactical-marker session-tactical-player session-tactical-${escapeHtml(element.type)}${badgeClass}${selectedClass}"
        ${dataAttribute}
        style="${style}"
        aria-hidden="true"
      >${playerBadge ? `<span class="session-tactical-player-badge${badgeSizeClass}">${escapeHtml(playerBadge)}</span>` : ""}</span>
    `;
}
return "";
}
function getSessionPlannerTacticalEndpointCoordinates(element) {
return getTacticalBoardElementEndpointCoordinates(element, {
  clamp,
  isEndpointElement: isSessionPlannerTacticalEndpointElement,
  getCurveControlPoint: getSessionPlannerTacticalCurveControlPoint,
});
}
function getSessionPlannerTacticalPointDistanceMeters(from = {}, to = {}) {
const dimensions = getSessionPlannerTacticalPitchDimensionsForBlock();
const deltaX = ((Number(to.x) || 0) - (Number(from.x) || 0)) * dimensions.x / 100;
const deltaY = ((Number(to.y) || 0) - (Number(from.y) || 0)) * dimensions.y / 100;
return Math.hypot(deltaX, deltaY);
}
function formatSessionPlannerTacticalMeters(value) {
const safeValue = Math.max(Number(value) || 0, 0);
if (safeValue < 10) {
return `${safeValue.toFixed(1)} m`;
}
return `${Math.round(safeValue)} m`;
}
function getSessionPlannerTacticalCurveLengthMeters(element, coordinates) {
const controlPoint = element.type === "curve"
? getSessionPlannerTacticalCurveControlPoint(element, coordinates)
: getSessionPlannerTacticalDefaultCurveControlPoint(
{ x: coordinates.x, y: coordinates.y },
{ x: coordinates.x2, y: coordinates.y2 }
);
let previousPoint = { x: coordinates.x, y: coordinates.y };
let length = 0;
for (let index = 1; index <= 18; index += 1) {
const t = index / 18;
const inverseT = 1 - t;
const point = {
x:
inverseT * inverseT * coordinates.x +
2 * inverseT * t * controlPoint.x +
t * t * coordinates.x2,
y:
inverseT * inverseT * coordinates.y +
2 * inverseT * t * controlPoint.y +
t * t * coordinates.y2,
};
length += getSessionPlannerTacticalPointDistanceMeters(previousPoint, point);
previousPoint = point;
}
return length;
}
function getSessionPlannerTacticalFreehandLengthMeters(element) {
if (!Array.isArray(element?.points) || element.points.length < 2) {
return 0;
}
return element.points.reduce((total, point, index, points) => {
if (index === 0) {
return total;
}
return total + getSessionPlannerTacticalPointDistanceMeters(points[index - 1], point);
}, 0);
}
function getSessionPlannerTacticalElementMeasurement(element) {
if (!element) {
return null;
}
if (element.type === "freehand") {
const length = getSessionPlannerTacticalFreehandLengthMeters(element);
if (!length) {
return null;
}
return {
label: formatSessionPlannerTacticalMeters(length),
x: clamp(Number(element.x) || 50, 5, 95),
y: clamp(Number(element.y) || 50, 5, 95),
};
}
const coordinates = getSessionPlannerTacticalEndpointCoordinates(element);
if (!coordinates) {
return null;
}
if (element.type === "zone" || element.type === "dashed-zone" || element.type === "ellipse") {
const dimensions = getSessionPlannerTacticalPitchDimensionsForBlock();
const width = Math.abs(coordinates.x2 - coordinates.x) * dimensions.x / 100;
const length = Math.abs(coordinates.y2 - coordinates.y) * dimensions.y / 100;
return {
label: `${formatSessionPlannerTacticalMeters(width)} x ${formatSessionPlannerTacticalMeters(length)}`,
x: clamp((coordinates.x + coordinates.x2) / 2, 8, 92),
y: clamp((coordinates.y + coordinates.y2) / 2, 8, 92),
};
}
const length = element.type === "curve" || element.type === "run"
? getSessionPlannerTacticalCurveLengthMeters(element, coordinates)
: getSessionPlannerTacticalPointDistanceMeters(
{ x: coordinates.x, y: coordinates.y },
{ x: coordinates.x2, y: coordinates.y2 }
);
if (!length) {
return null;
}
return {
label: formatSessionPlannerTacticalMeters(length),
x: clamp((coordinates.x + coordinates.x2) / 2, 6, 94),
y: clamp((coordinates.y + coordinates.y2) / 2, 6, 94),
};
}
function renderSessionPlannerTacticalMeasurementLabel(element) {
const measurement = getSessionPlannerTacticalElementMeasurement(element);
if (!measurement) {
return "";
}
return `
    <span
      class="session-tactical-measurement${element.preview ? " is-preview" : ""}"
      style="left: ${measurement.x}%; top: ${measurement.y}%;"
      aria-hidden="true"
    >${escapeHtml(measurement.label)}</span>
  `;
}
function renderSessionPlannerTacticalMeasurementLabels(elements = []) {
return elements
.filter(Boolean)
.map(renderSessionPlannerTacticalMeasurementLabel)
.join("");
}
function renderSessionPlannerTacticalSelectionHandles(element) {
const coordinates = getSessionPlannerTacticalEndpointCoordinates(element);
if (!coordinates) {
return "";
}
const elementId = escapeHtml(element.id);
const renderHandle = (handle, x, y) => `
    <span
      class="session-tactical-edit-handle session-tactical-edit-handle-${escapeHtml(handle)}"
      data-session-tactical-element-id="${elementId}"
      data-session-tactical-handle="${escapeHtml(handle)}"
      style="left: ${x}%; top: ${y}%;"
      aria-hidden="true"
    ></span>
  `;
return `
    ${renderHandle("start", coordinates.x, coordinates.y)}
    ${
      element.type === "curve"
        ? renderHandle("control", coordinates.controlX, coordinates.controlY)
        : ""
    }
    ${renderHandle("end", coordinates.x2, coordinates.y2)}
  `;
}
function renderSessionPlannerTacticalRotationHandle(element) {
if (!isSessionPlannerTacticalGoalType(element?.type)) {
return "";
}
const x = Number.isFinite(Number(element.x)) ? clamp(Number(element.x), 0, 100) : 50;
const y = Number.isFinite(Number(element.y)) ? clamp(Number(element.y), 0, 100) : 50;
const rotation = normalizeTacticalRotation(element.rotation);
const offset = element.type === "big-goal" ? "-3.05rem" : "-2.5rem";
return `
    <span
      class="session-tactical-rotate-handle"
      data-session-tactical-element-id="${escapeHtml(element.id)}"
      data-session-tactical-rotate-handle
      style="left: ${x}%; top: ${y}%; --session-tactical-rotation: ${rotation}deg; --session-tactical-rotate-offset: ${offset};"
      aria-hidden="true"
    >
      <span></span>
    </span>
  `;
}
function renderSessionPlannerTacticalPendingMarkers() {
if (!getState().pendingPoint) {
return "";
}
const pendingPoint = getState().pendingPoint;
const startPoint = pendingPoint.startPoint || pendingPoint;
const controlPoint = pendingPoint.type === "curve" ? pendingPoint.controlPoint : null;
const renderPendingPoint = (point, className = "") => {
if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
return "";
}
return `
      <span
        class="session-tactical-marker session-tactical-pending${className ? ` ${className}` : ""}"
        style="left: ${clamp(Number(point.x), 0, 100)}%; top: ${clamp(Number(point.y), 0, 100)}%; --session-tactical-color: ${escapeHtml(getState().color)};"
      ></span>
    `;
};
return `
    ${renderPendingPoint(startPoint)}
    ${renderPendingPoint(controlPoint, "session-tactical-pending-control")}
  `;
}
function renderSessionPlannerTacticalNumberPicker(elements = []) {
const numberPickerElementId = getSessionPlannerTacticalNumberPickerElementId();
if (!numberPickerElementId) {
return "";
}
const element = elements.find((candidate) => candidate.id === numberPickerElementId);
if (!isSessionPlannerTacticalPlayerType(element?.type)) {
clearSessionPlannerTacticalNumberPickerElementId();
return "";
}
const x = Number.isFinite(Number(element.x)) ? clamp(Number(element.x), 8, 92) : 50;
const y = Number.isFinite(Number(element.y)) ? clamp(Number(element.y) - 6, 8, 92) : 50;
return `
    <div class="session-tactical-number-picker" style="left: ${x}%; top: ${y}%;">
      <span>Player number</span>
      <div>
        ${Array.from({ length: 11 }, (_, index) => index + 1)
          .map((number) => `
<button
type="button"
class="${normalizeSessionPlannerTacticalPlayerBadge(element.playerNumber) === String(number) ? "is-active" : ""}"
data-session-tactical-number="${number}"
data-session-tactical-number-element="${escapeHtml(element.id)}"
>${number}</button>
`)
          .join("")}
      </div>
    </div>
  `;
}
function renderSessionPlannerExerciseVisual(block, options = {}) {
if (!block) {
return "";
}
const elementsSource = Array.isArray(block.tacticalElements)
? block.tacticalElements.map(cloneSessionPlannerTacticalElement)
: [];
const elements = elementsSource;
const pitchMode = normalizeSessionPlannerTacticalPitchMode(block.tacticalPitchMode);
const pitchModeOption = getSessionPlannerTacticalPitchModeOption(pitchMode);
const selectedElement =
options.editor && getState().selectedElementId
? elements.find((element) => element.id === getState().selectedElementId)
: null;
const arrowId = getSessionPlannerVisualElementId(block);
const freehandPreview =
options.editor && getState().freehandState?.points?.length > 1
? getState().freehandState.points
.map((point, index) => `${index === 0 ? "M" : "L"} ${clamp(point.x, 0, 100)} ${clamp(point.y, 0, 100)}`)
.join(" ")
: "";
const draftLineElement =
options.editor &&
getState().draftLineState?.startPoint &&
getState().draftLineState?.currentPoint
? {
...createSessionPlannerLineElement(
getState().draftLineState.type,
getState().draftLineState.startPoint,
getState().draftLineState.currentPoint
),
id: "session-tactical-draft-line",
preview: true,
}
: null;
const classNames = [
"session-visual-board",
block.visualImage ? "has-uploaded-image" : "",
options.large ? "session-visual-board-large" : "",
options.editor ? "session-visual-board-editor" : "",
options.printRotated ? "session-visual-board-print-rotated" : "",
options.landscape ? "session-visual-board-print-landscape" : "",
pitchModeOption.landscape ? "session-visual-board-landscape" : "",
`session-visual-board-mode-${pitchMode}`,
].filter(Boolean).join(" ");
return `
    <div
      class="${classNames}"
      aria-label="Exercise tactical visual"
    >
      <div class="session-visual-board-surface" ${options.editor ? 'data-session-tactical-canvas' : ""}>
        ${
          block.visualImage
            ? `<img class="session-visual-image" src="${escapeHtml(block.visualImage)}" alt="Exercise visual" />`
            : renderSessionPlannerPitchDiagram(block.diagram, { landscape: options.landscape, pitchMode })
        }
        <svg class="session-tactical-svg-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="${escapeHtml(arrowId)}" markerWidth="6" markerHeight="6" refX="5.45" refY="3" orient="auto" markerUnits="strokeWidth" viewBox="0 0 6 6">
              <path d="M0.75,0.6 L5.45,3 L0.75,5.4 Z" fill="context-stroke" stroke="context-stroke" stroke-width="0.22" stroke-linejoin="round"></path>
            </marker>
          </defs>
          ${elements.map((element) => renderSessionPlannerTacticalSvgElement(element, arrowId)).join("")}
          ${draftLineElement ? renderSessionPlannerTacticalSvgElement(draftLineElement, arrowId) : ""}
          ${
            freehandPreview
              ? `<path class="session-tactical-freehand session-tactical-freehand-preview" d="${escapeHtml(freehandPreview)}" stroke="${escapeHtml(getState().color)}" stroke-width="${getSessionPlannerTacticalRenderStrokeWidth(getState().lineWidth)}"></path>`
              : ""
          }
          ${options.editor ? renderSelectionBox() : ""}
        </svg>
        <div class="session-tactical-html-layer" aria-hidden="true">
          ${elements.map(renderSessionPlannerTacticalHtmlElement).join("")}
          ${options.editor ? renderSessionPlannerTacticalMeasurementLabels([selectedElement, draftLineElement]) : ""}
          ${selectedElement ? renderSessionPlannerTacticalSelectionHandles(selectedElement) : ""}
          ${selectedElement ? renderSessionPlannerTacticalRotationHandle(selectedElement) : ""}
          ${options.editor ? renderSessionPlannerTacticalPendingMarkers() : ""}
          ${options.editor ? renderSessionPlannerTacticalNumberPicker(elements) : ""}
        </div>
      </div>
    </div>
  `;
}
function renderSessionPlannerActionIcon(name) {
const icons = {
eye: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z"></path>
        <circle cx="12" cy="12" r="3.1"></circle>
      </svg>
    `,
pencil: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 19.5l4.1-.9 10-10a2.2 2.2 0 0 0-3.1-3.1l-10 10-.9 4Z"></path>
        <path d="M13.8 7.2l3 3"></path>
      </svg>
    `,
upload: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15V4"></path>
        <path d="M7.5 8.5 12 4l4.5 4.5"></path>
        <path d="M5 15v4.5h14V15"></path>
      </svg>
    `,
};
return icons[name] ?? "";
}
function renderSessionPlannerVisualPreviewOverlay(block) {
if (!getState().visualPreviewOpen || !block) {
return "";
}
return `
    <div class="session-library-overlay session-visual-preview-overlay" data-session-visual-preview-overlay>
      <section class="session-library-modal session-visual-modal" role="dialog" aria-modal="true" aria-label="Exercise visual preview">
        <header class="session-library-modal-head">
          <div>
            <span>Preview</span>
            <h2>${escapeHtml(block.title || "Exercise Visual")}</h2>
          </div>
          <button type="button" class="session-library-close-button" data-session-close-visual-preview aria-label="Close preview">Close</button>
        </header>
        ${renderSessionPlannerExerciseVisual(block, { large: true })}
      </section>
    </div>
  `;
}
function renderSessionPlannerTacticalToolIcon(tool) {
const icons = {
"blue-player": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2.4"></circle></svg>',
"red-player": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>',
"neutral-player": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M8.5 15.5 15.5 8.5"></path></svg>',
coach: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M15.5 8.8a4.8 4.8 0 1 0 0 6.4"></path></svg>',
ball: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M12 5v14"></path><path d="M5 12h14"></path><path d="M7.5 7.5 16.5 16.5"></path></svg>',
cone: '<svg viewBox="0 0 24 24"><path d="M10 5h4l2 12H8l2-12Z"></path><path d="M6 19h12"></path><path d="M9 13h6"></path></svg>',
"mini-goal": '<svg viewBox="0 0 24 24"><path d="M5 18V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9"></path><path d="M5 18h14"></path><path d="M8 18V9"></path><path d="M16 18V9"></path></svg>',
"big-goal": '<svg viewBox="0 0 24 24"><path d="M3.5 18V8.5A2.5 2.5 0 0 1 6 6h12a2.5 2.5 0 0 1 2.5 2.5V18"></path><path d="M3.5 18h17"></path><path d="M7 18V6"></path><path d="M12 18V6"></path><path d="M17 18V6"></path></svg>',
mannequin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="2"></circle><path d="M8.5 10.5h7L17 19H7l1.5-8.5Z"></path></svg>',
pole: '<svg viewBox="0 0 24 24"><path d="M12 4v16"></path><path d="M8 20h8"></path><path d="M10 7h4"></path></svg>',
gate: '<svg viewBox="0 0 24 24"><path d="M6 17V8"></path><path d="M18 17V8"></path><path d="M6 17h12"></path><path d="M8.5 12h7"></path></svg>',
zone: '<svg viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="10" rx="2"></rect><path d="M8 10h8"></path></svg>',
"dashed-zone": '<svg viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="10" rx="2" stroke-dasharray="2 2"></rect></svg>',
ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5"></ellipse></svg>',
arrow: '<svg viewBox="0 0 24 24"><path d="M5 18 18 5"></path><path d="M12 5h6v6"></path></svg>',
pass: '<svg viewBox="0 0 24 24"><path d="M5 12h13"></path><path d="m14 8 4 4-4 4"></path><circle cx="5" cy="12" r="1.5"></circle></svg>',
run: '<svg viewBox="0 0 24 24"><path d="M5 18c3-8 8-11 14-12"></path><path d="M14 5h5v5"></path><path d="M8 15l2 2"></path></svg>',
line: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5"></path></svg>',
"dashed-line": '<svg viewBox="0 0 24 24"><path d="M5 19 19 5" stroke-dasharray="2 2"></path></svg>',
curve: '<svg viewBox="0 0 24 24"><path d="M5 17c5-12 10 2 14-10"></path></svg>',
freehand: '<svg viewBox="0 0 24 24"><path d="M4 15c3-6 5 5 8-1s4-8 8-3"></path></svg>',
text: '<svg viewBox="0 0 24 24"><path d="M5 7h14"></path><path d="M12 7v11"></path><path d="M8 18h8"></path></svg>',
remove: '<svg viewBox="0 0 24 24"><path d="M7 7h10"></path><path d="M9 7l1 12h4l1-12"></path><path d="M10 5h4"></path></svg>',
};
return icons[tool] || '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle></svg>';
}
function renderSessionPlannerTacticalboardOverlay(block) {
if (!getState().tacticalboardOpen || !block) {
return "";
}
const toolGroups = [
{
label: "Players",
tools: [
["blue-player", "Blue"],
["red-player", "Red"],
["neutral-player", "Neutral"],
["ball", "Ball"],
["coach", "Coach"],
],
},
{
label: "Equipment",
tools: [
["cone", "Cone"],
["mini-goal", "Goal"],
["big-goal", "11v11 Goal"],
["mannequin", "Dummy"],
["pole", "Pole"],
["gate", "Gate"],
["dashed-line", "Dashed Line"],
["zone", "Zone"],
["dashed-zone", "Dashed Box"],
["ellipse", "Circle"],
],
},
{
label: "Draw",
tools: [
["arrow", "Arrow"],
["pass", "Pass"],
["run", "Run"],
["line", "Line"],
["curve", "Curve"],
["freehand", "Free"],
["text", "Text"],
["remove", "Erase"],
],
},
];
const lineStyleOptions = ["solid", "dashed", "dotted"]
.map((lineStyle) => `
      <option value="${lineStyle}"${getState().lineStyle === lineStyle ? " selected" : ""}>
        ${lineStyle.charAt(0).toUpperCase() + lineStyle.slice(1)}
      </option>
    `)
.join("");
const tacticalPitchMode = normalizeSessionPlannerTacticalPitchMode(block.tacticalPitchMode);
const pitchModeOptions = getPitchModeOptions()
.map((option) => `
      <option value="${escapeHtml(option.key)}"${tacticalPitchMode === option.key ? " selected" : ""}>
        ${escapeHtml(option.label)}
      </option>
    `)
.join("");
const pitchDimensions = getSessionPlannerTacticalPitchDimensionsForBlock(block);
const pitchMeasurementLabel = `${pitchDimensions.x} x ${pitchDimensions.y} m`;
const tacticalFrames = ensureSessionPlannerTacticalFrames(block);
const activeFrameId = getSessionPlannerTacticalActiveFrameId(block);
const frameButtons = tacticalFrames
.map((frame, index) => `
      <button
        type="button"
        class="session-tacticalboard-frame${frame.id === activeFrameId ? " is-active" : ""}"
        data-session-tactical-frame="${escapeHtml(frame.id)}"
        title="${escapeHtml(frame.label)}"
      >
        ${index + 1}
      </button>
`)
.join("");
const frameStatusLabel = `${Math.max(1, tacticalFrames.findIndex((frame) => frame.id === activeFrameId) + 1)} / ${tacticalFrames.length || 1}`;
const selectedTacticalCount = getSessionPlannerTacticalSelectedElementIds().length;
const arrangeDisabled = selectedTacticalCount < 2 ? "disabled" : "";
const activeToolEntry = toolGroups.flatMap((group) => group.tools).find(([tool]) => tool === getState().tool);
const activeToolLabel = activeToolEntry?.[1] || "Tool";
const selectedLabel = `${selectedTacticalCount} selected`;
const normalizedCurrentColor = normalizeTacticalColor(getState().color, "#111827").toLowerCase();
const colorChoices = [
["#1d8bff", "Blue"],
["#ff4f4f", "Red"],
["#fbbf24", "Yellow"],
["#10b981", "Green"],
["#f97316", "Orange"],
["#111827", "Black"],
["#ffffff", "White"],
];
const colorChoiceButtons = colorChoices
.map(([color, label]) => `
                <button
                  type="button"
                  class="session-tactical-colour-swatch${normalizedCurrentColor === color ? " is-active" : ""}"
                  data-session-tactical-color-choice="${escapeHtml(color)}"
                  style="--session-tactical-swatch: ${escapeHtml(color)};"
                  title="${escapeHtml(label)}"
                  aria-label="${escapeHtml(label)}"
                ></button>
              `)
.join("");
return `
    <div class="session-library-overlay session-tacticalboard-overlay" data-session-tacticalboard-overlay>
      <section class="session-library-modal session-tacticalboard-modal session-tacticalboard-modal-tool-${escapeHtml(getState().tool)}${selectedTacticalCount ? " has-selection" : " has-no-selection"}" role="dialog" aria-modal="true" aria-label="Tacticalboard">
        <header class="session-library-modal-head">
          <div>
            <span>Tacticalboard</span>
            <h2>${escapeHtml(block.title || "Exercise Board")}</h2>
            <div class="session-tacticalboard-status-strip" aria-label="Board state">
              <span data-session-tactical-active-tool-label>${escapeHtml(activeToolLabel)}</span>
              <span data-session-tactical-selected-label>${escapeHtml(selectedLabel)}</span>
              <span data-session-tactical-pitch-label>${escapeHtml(pitchMeasurementLabel)}</span>
            </div>
          </div>
          <button type="button" class="session-library-close-button" data-session-close-tacticalboard aria-label="Close tacticalboard">Close</button>
        </header>
        <div class="session-tacticalboard-layout">
          <aside class="session-tacticalboard-side session-tacticalboard-toolbox">
            <div class="session-tacticalboard-tools" aria-label="Tacticalboard tools">
              ${toolGroups
                .map((group) => `
<div class="session-tacticalboard-tool-group">
<span>${escapeHtml(group.label)}</span>
<div class="session-tacticalboard-tool-row">
${group.tools
.map(([tool, label]) => `
                          <button
                            type="button"
                            class="session-tactical-tool-button${getState().tool === tool ? " is-active" : ""}"
                            data-session-tactical-tool="${escapeHtml(tool)}"
                            title="${escapeHtml(label)}"
                            aria-label="${escapeHtml(label)}"
                          >
                            <span class="session-tactical-tool-icon" aria-hidden="true">${renderSessionPlannerTacticalToolIcon(tool)}</span>
                            <span class="session-tactical-tool-label">${escapeHtml(label)}</span>
                          </button>
                        `)
.join("")}
</div>
</div>
`)
                .join("")}
            </div>
          </aside>
          <div class="session-tacticalboard-canvas-wrap" data-session-tactical-canvas-wrap>
            ${renderSessionPlannerExerciseVisual(block, { large: true, editor: true })}
          </div>
          <aside class="session-tacticalboard-side session-tacticalboard-inspector">
            <div class="session-tacticalboard-settings" aria-label="Drawing settings">
              <label>
                <span>Pitch view</span>
                <select data-session-tactical-pitch-mode>${pitchModeOptions}</select>
              </label>
              <label>
                <span>Colour</span>
                <div class="session-tacticalboard-colour-row">
                  <input type="color" value="${escapeHtml(getState().color)}" data-session-tactical-color />
                  <div class="session-tacticalboard-colour-swatches" aria-label="Quick colours">
                    ${colorChoiceButtons}
                  </div>
                </div>
              </label>
              <label>
                <span>Width</span>
                <input type="range" min="0.25" max="6" step="0.25" value="${getState().lineWidth}" data-session-tactical-width />
              </label>
              <label>
                <span>Style</span>
                <select data-session-tactical-style>${lineStyleOptions}</select>
              </label>
            </div>
            <div class="session-tacticalboard-frames" aria-label="Frames">
              <div class="session-tacticalboard-panel-head">
                <span>Frames</span>
                <small>${escapeHtml(frameStatusLabel)}</small>
              </div>
              <div class="session-tacticalboard-frame-list">
                ${frameButtons}
              </div>
              <div class="session-tacticalboard-frame-actions">
                <button type="button" data-session-add-tactical-frame>New</button>
                <button type="button" data-session-duplicate-tactical-frame>Duplicate</button>
                <button type="button" data-session-delete-tactical-frame ${tacticalFrames.length <= 1 ? "disabled" : ""}>Delete</button>
              </div>
            </div>
            <div class="session-tacticalboard-arrange" aria-label="Arrange selected items">
              <div class="session-tacticalboard-panel-head">
                <span>Arrange</span>
                <small data-session-tactical-arrange-count>${selectedTacticalCount} selected</small>
              </div>
              <div class="session-tacticalboard-arrange-grid">
                <button type="button" data-session-arrange-tactical="row" ${arrangeDisabled}>Row</button>
                <button type="button" data-session-arrange-tactical="column" ${arrangeDisabled}>Column</button>
                <button type="button" data-session-arrange-tactical="grid" ${arrangeDisabled}>Grid</button>
              </div>
            </div>
            <div class="session-tacticalboard-hint">
              <strong data-session-tactical-hint-tool>${escapeHtml(activeToolLabel)}</strong>
              <span data-session-tactical-hint-state data-session-tactical-frame-status="${escapeHtml(frameStatusLabel)}">${escapeHtml(selectedLabel)} / Frame ${escapeHtml(frameStatusLabel)}</span>
            </div>
            <label class="session-media-upload-button session-tacticalboard-upload">
              ${renderSessionPlannerActionIcon("upload")}
              <span>Upload image</span>
              <input class="session-upload-input" type="file" accept="image/*" data-session-upload-visual />
            </label>
            <div class="session-tacticalboard-actions">
              <button type="button" class="session-tacticalboard-copy-selected" data-session-copy-tactical-selected>Copy selected</button>
              <button type="button" class="session-tacticalboard-paste" data-session-paste-tactical-clipboard>Paste</button>
              <button type="button" class="session-tacticalboard-delete-selected" data-session-delete-tactical-selected>Delete selected</button>
              <button type="button" class="session-tacticalboard-undo" data-session-undo-board="tactical">Undo</button>
              <button type="button" class="session-tacticalboard-redo" data-session-redo-board="tactical">Redo</button>
              <button type="button" class="session-tacticalboard-clear" data-session-clear-board title="Delete all drawings">Delete all</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

  return {
    renderPitchDiagram: renderSessionPlannerPitchDiagram,
    getVisualElementId: getSessionPlannerVisualElementId,
    renderTacticalSvgElement: renderSessionPlannerTacticalSvgElement,
    renderTacticalHtmlElement: renderSessionPlannerTacticalHtmlElement,
    getTacticalEndpointCoordinates: getSessionPlannerTacticalEndpointCoordinates,
    getTacticalPointDistanceMeters: getSessionPlannerTacticalPointDistanceMeters,
    formatTacticalMeters: formatSessionPlannerTacticalMeters,
    getTacticalCurveLengthMeters: getSessionPlannerTacticalCurveLengthMeters,
    getTacticalFreehandLengthMeters: getSessionPlannerTacticalFreehandLengthMeters,
    getTacticalElementMeasurement: getSessionPlannerTacticalElementMeasurement,
    renderTacticalMeasurementLabel: renderSessionPlannerTacticalMeasurementLabel,
    renderTacticalMeasurementLabels: renderSessionPlannerTacticalMeasurementLabels,
    renderTacticalSelectionHandles: renderSessionPlannerTacticalSelectionHandles,
    renderTacticalRotationHandle: renderSessionPlannerTacticalRotationHandle,
    renderTacticalPendingMarkers: renderSessionPlannerTacticalPendingMarkers,
    renderTacticalNumberPicker: renderSessionPlannerTacticalNumberPicker,
    renderExerciseVisual: renderSessionPlannerExerciseVisual,
    renderActionIcon: renderSessionPlannerActionIcon,
    renderVisualPreviewOverlay: renderSessionPlannerVisualPreviewOverlay,
    renderTacticalToolIcon: renderSessionPlannerTacticalToolIcon,
    renderTacticalboardOverlay: renderSessionPlannerTacticalboardOverlay,
  };
}
