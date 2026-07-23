import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";
import { createSessionPlannerTacticalArrangeClipboardController } from "./session-planner-tactical-arrange-clipboard-controller.mjs";
import { createSessionPlannerTacticalInteractionController } from "./session-planner-tactical-interaction-controller.mjs";
import { advanceSessionPlannerTacticalLineClick } from "./session-planner-tactical-line-interaction-helpers.mjs";
import {
  isSessionPlannerTacticalLineTool as isTacticalLineTool,
  isSessionPlannerTacticalPlacementTool as isTacticalPlacementTool,
  SESSION_PLANNER_TACTICAL_TOOLS,
  shouldPlaceSessionPlannerTacticalDoubleClick as evaluateTacticalDoubleClick,
  shouldSkipRepeatedSessionPlannerTacticalPlacement as evaluateRepeatedPlacement,
} from "./session-planner-tactical-placement-helpers.mjs";
import { createSessionPlannerTacticalSelectionHelpers } from "./session-planner-tactical-selection-helpers.mjs";
import { createSessionPlannerTacticalTransformHelpers } from "./session-planner-tactical-transform-helpers.mjs";

export function createSessionPlannerTacticalController(deps = {}) {
  const {
    canEditSessionPlanner,
    clamp,
    cloneSessionPlannerTacticalElement,
    createSessionPlannerLineElement,
    createSessionPlannerStableId,
    getDefaultTacticalColor,
    getDefaultTacticalLineStyle,
    getSessionPlannerSelectedBlock,
    getSessionPlannerTacticalEndpointCoordinates,
    isSessionPlannerTacticalGoalType,
    isSessionPlannerTacticalPlayerType,
    markSessionPlannerBlockFieldsUpdated,
    normalizeSessionPlannerTacticalPitchMode,
    normalizeSessionPlannerTacticalPlayerBadge,
    normalizeTacticalColor,
    normalizeTacticalLineStyle,
    normalizeTacticalLineWidth,
    normalizeTacticalRotation,
    persistSessionPlannerTacticalElements,
    renderSessionPlannerExerciseVisual,
    renderSessionPlannerWorkspace,
    sessionPlannerTacticalSnapStep,
    showSessionPlannerToast,
    ui,
    undoSessionPlannerBoardHistory,
    win,
    writeSessionPlannerState,
    getLocalState,
    setLocalState,
  } = deps;
  const local = new Proxy({}, {
    get(_target, property) {
      return getLocalState?.()?.[property];
    },
    set(_target, property, value) {
      setLocalState?.({ [property]: value });
      return true;
    },
  });
  const selectionHelpers = createSessionPlannerTacticalSelectionHelpers({
    clamp,
    getEndpointCoordinates: getSessionPlannerTacticalEndpointCoordinates,
    isStrokeElement: isSessionPlannerTacticalStrokeElement,
  });
  const transformHelpers = createSessionPlannerTacticalTransformHelpers({
    clamp,
    cloneElement: cloneSessionPlannerTacticalElement,
  });
  const {
    getBoundsCollection: getSessionPlannerTacticalBoundsCollection,
    getElementBounds: getSessionPlannerTacticalElementBounds,
    getElementSelectionPoints: getSessionPlannerTacticalElementSelectionPoints,
    getSelectionRect: getSessionPlannerTacticalSelectionRectFromState,
    isElementInSelectionRect: isSessionPlannerTacticalElementInSelectionRect,
    isPointInRect: isSessionPlannerTacticalPointInRect,
    uniqueValues,
  } = selectionHelpers;
  const {
    clampMovedPoint: clampMovedTacticalPoint,
    getArrangeSpacing: getSessionPlannerTacticalArrangeSpacing,
    moveElementByDelta: moveSessionPlannerTacticalElementByDelta,
    moveElementCenterTo: moveSessionPlannerTacticalElementCenterTo,
    moveElementFromInitial: moveSessionPlannerTacticalElementFromInitial,
  } = transformHelpers;
  const arrangeClipboardController = createSessionPlannerTacticalArrangeClipboardController({
    canEdit: canEditSessionPlanner,
    clamp,
    clearSelection: clearSessionPlannerTacticalSelection,
    cloneElement: cloneSessionPlannerTacticalElement,
    createStableId: createSessionPlannerStableId,
    getArrangeSpacing: getSessionPlannerTacticalArrangeSpacing,
    getBoundsCollection: getSessionPlannerTacticalBoundsCollection,
    getSelectedBlock: getSessionPlannerSelectedBlock,
    getSelectedElements: getSelectedSessionPlannerTacticalElements,
    localState: local,
    moveElementCenterTo: moveSessionPlannerTacticalElementCenterTo,
    moveElementFromInitial: moveSessionPlannerTacticalElementFromInitial,
    refreshCanvas: refreshSessionPlannerTacticalboardCanvas,
    showToast: showSessionPlannerToast,
  });
  const {
    arrangeSelectedElements: arrangeSelectedSessionPlannerTacticalElements,
    copySelectedElements: copySelectedSessionPlannerTacticalElements,
    pasteClipboard: pasteSessionPlannerTacticalClipboard,
  } = arrangeClipboardController;
  const interactionController = createSessionPlannerTacticalInteractionController({
    addElement: addSessionPlannerTacticalElement,
    addPlacementElement: addSessionPlannerTacticalPlacementElement,
    canEdit: canEditSessionPlanner,
    clearSelection: clearSessionPlannerTacticalSelection,
    cloneElement: cloneSessionPlannerTacticalElement,
    createLineElement: createSessionPlannerLineElement,
    getCanvasPoint: getSessionPlannerTacticalCanvasPoint,
    getDragElementIds: getSessionPlannerTacticalDragElementIds,
    getElementById: getSessionPlannerTacticalElementById,
    getElementsInRect: getSessionPlannerTacticalElementsInRect,
    getEndpointCoordinates: getSessionPlannerTacticalEndpointCoordinates,
    getPointFromRect: getSessionPlannerTacticalPointFromRect,
    getRotationFromEvent: getSessionPlannerTacticalRotationFromEvent,
    getSelectedElementIds: getSessionPlannerTacticalSelectedElementIds,
    getSelectionRect: getSessionPlannerTacticalSelectionRect,
    isGoalType: isSessionPlannerTacticalGoalType,
    isLineTool: isSessionPlannerTacticalLineTool,
    isPlacementTool: isSessionPlannerTacticalPlacementTool,
    isSelectionToggleModifier: isSessionPlannerTacticalSelectionToggleModifier,
    localState: local,
    moveElementByDelta: moveSessionPlannerTacticalElementByDelta,
    moveElements: moveSessionPlannerTacticalElements,
    normalizeRotation: normalizeTacticalRotation,
    refreshCanvas: refreshSessionPlannerTacticalboardCanvas,
    setClickSuppression: setSessionPlannerTacticalClickSuppression,
    setSelectedElements: setSessionPlannerTacticalSelectedElements,
    shouldPlaceDoubleClick: shouldPlaceSessionPlannerTacticalDoubleClick,
    syncInspector: syncSessionPlannerTacticalboardInspector,
    toggleSelection: toggleSessionPlannerTacticalElementSelection,
    updateHandle: updateSessionPlannerTacticalElementHandle,
  });
  const {
    finishDrag: finishSessionPlannerTacticalDrag,
    handleKeyboardAction: handleSessionPlannerTacticalKeyboardAction,
    startDrag: startSessionPlannerTacticalDrag,
    updateDrag: updateSessionPlannerTacticalDrag,
  } = interactionController;

  function restoreSessionPlannerTacticalFocus(canvasWrap, focusTarget = null) {
  if (!focusTarget?.elementId) {
  return;
  }
  const candidates = canvasWrap?.querySelectorAll?.("[data-session-tactical-element-id]") || [];
  const target = Array.from(candidates).find((candidate) => {
  if (candidate.dataset?.sessionTacticalElementId !== focusTarget.elementId) {
  return false;
  }
  if (focusTarget.handle) {
  return candidate.dataset?.sessionTacticalHandle === focusTarget.handle;
  }
  if (focusTarget.rotate) {
  return candidate.hasAttribute?.("data-session-tactical-rotate-handle");
  }
  return !candidate.dataset?.sessionTacticalHandle
  && !candidate.hasAttribute?.("data-session-tactical-rotate-handle")
  && candidate.getAttribute?.("aria-hidden") !== "true";
  });
  target?.focus?.({ preventScroll: true });
  }

  function confirmTacticalAction(config = {}) {
  return confirmPlatformAction({
  eyebrow: "Tactical Board",
  win,
  ...config,
  });
  }

  function refreshSessionPlannerTacticalboardCanvas(options = {}) {
  const block = getSessionPlannerSelectedBlock();
  if (options.persist) {
  persistSessionPlannerTacticalElements(block);
  }
  const canvasWrap = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-canvas-wrap]");
  if (!local.sessionPlannerTacticalboardOpen || !canvasWrap || !block) {
  renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
  return;
  }
  canvasWrap.innerHTML = renderSessionPlannerExerciseVisual(block, { large: true, editor: true });
  syncSessionPlannerTacticalboardInspector();
  restoreSessionPlannerTacticalFocus(canvasWrap, options.focusTarget);
  }
  function isSessionPlannerTacticalLineTool(tool = local.sessionPlannerTacticalTool) {
  return isTacticalLineTool(tool);
  }
  function isSessionPlannerTacticalStrokeElement(element = {}) {
  return Boolean(element) && (isSessionPlannerTacticalLineTool(element.type) || element.type === "freehand");
  }
  function isSessionPlannerTacticalPlacementTool(tool = local.sessionPlannerTacticalTool) {
  return isTacticalPlacementTool(tool);
  }
  function getSessionPlannerTacticalSelectedElementIds() {
  const block = getSessionPlannerSelectedBlock();
  if (!block || !Array.isArray(block.tacticalElements)) {
  local.sessionPlannerTacticalSelectedElementIds = [];
  local.sessionPlannerTacticalSelectedElementId = "";
  return [];
  }
  const validIds = new Set(block.tacticalElements.map((element) => element.id));
  const nextIds = uniqueValues([
  ...local.sessionPlannerTacticalSelectedElementIds,
  local.sessionPlannerTacticalSelectedElementId,
  ]).filter((id) => id && validIds.has(id));
  local.sessionPlannerTacticalSelectedElementIds = nextIds;
  local.sessionPlannerTacticalSelectedElementId =
  nextIds.includes(local.sessionPlannerTacticalSelectedElementId)
  ? local.sessionPlannerTacticalSelectedElementId
  : nextIds[0] ?? "";
  return nextIds;
  }
  function setSessionPlannerTacticalSelectedElements(elementIds = [], primaryId = "") {
  const block = getSessionPlannerSelectedBlock();
  const validIds = new Set(
  block && Array.isArray(block.tacticalElements)
  ? block.tacticalElements.map((element) => element.id)
  : []
  );
  const nextIds = uniqueValues(elementIds).filter((id) => id && validIds.has(id));
  local.sessionPlannerTacticalSelectedElementIds = nextIds;
  local.sessionPlannerTacticalSelectedElementId =
  primaryId && nextIds.includes(primaryId)
  ? primaryId
  : nextIds[0] ?? "";
  }
  function isSessionPlannerTacticalSelectionToggleModifier(event) {
  return Boolean(event?.metaKey || event?.ctrlKey);
  }
  function toggleSessionPlannerTacticalElementSelection(elementId, options = {}) {
  if (!elementId) {
  return;
  }
  const selectedIds = getSessionPlannerTacticalSelectedElementIds();
  const isSelected = selectedIds.includes(elementId);
  const nextIds = isSelected
  ? selectedIds.filter((selectedId) => selectedId !== elementId)
  : [...selectedIds, elementId];
  setSessionPlannerTacticalSelectedElements(nextIds, isSelected ? nextIds[0] ?? "" : elementId);
  local.sessionPlannerTacticalNumberPickerElementId = "";
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalSelectionState = null;
  syncSessionPlannerTacticalboardInspector();
  refreshSessionPlannerTacticalboardCanvas(options);
  }
  function clearSessionPlannerTacticalSelection() {
  setSessionPlannerTacticalSelectedElements([]);
  local.sessionPlannerTacticalNumberPickerElementId = "";
  }
  function setSessionPlannerTacticalClickSuppression(isSuppressed) {
  local.sessionPlannerTacticalSuppressNextClick = Boolean(isSuppressed);
  local.sessionPlannerTacticalSuppressNextClickAt = local.sessionPlannerTacticalSuppressNextClick ? Date.now() : 0;
  }
  function setSessionPlannerTacticalPitchMode(mode) {
  if (!canEditSessionPlanner()) {
  return;
  }
  const block = getSessionPlannerSelectedBlock();
  if (!block) {
  return;
  }
  const nextMode = normalizeSessionPlannerTacticalPitchMode(mode);
  if (block.tacticalPitchMode === nextMode) {
  return;
  }
  block.tacticalPitchMode = nextMode;
  markSessionPlannerBlockFieldsUpdated(block, ["tacticalPitchMode"]);
  writeSessionPlannerState();
  refreshSessionPlannerTacticalboardCanvas();
  }
  function openSessionPlannerTacticalNumberPicker(elementId) {
  const element = getSessionPlannerTacticalElementById(elementId);
  if (!isSessionPlannerTacticalPlayerType(element?.type)) {
  return;
  }
  local.sessionPlannerTacticalNumberPickerElementId = element.id;
  setSessionPlannerTacticalSelectedElements([element.id], element.id);
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalSelectionState = null;
  refreshSessionPlannerTacticalboardCanvas();
  }
  function updateSessionPlannerTacticalPlayerNumber(elementId, rawNumber) {
  if (!canEditSessionPlanner()) {
  return;
  }
  const element = getSessionPlannerTacticalElementById(elementId);
  if (!isSessionPlannerTacticalPlayerType(element?.type)) {
  return;
  }
  const playerBadge = normalizeSessionPlannerTacticalPlayerBadge(rawNumber);
  element.playerNumber = playerBadge || null;
  local.sessionPlannerTacticalNumberPickerElementId = "";
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  }
  function updateSelectedSessionPlannerTacticalPlayerBadges(rawBadge) {
  if (!canEditSessionPlanner()) {
  return false;
  }
  const playerBadge = normalizeSessionPlannerTacticalPlayerBadge(rawBadge);
  if (!playerBadge) {
  return false;
  }
  const selectedPlayers = getSelectedSessionPlannerTacticalElements()
  .filter((element) => isSessionPlannerTacticalPlayerType(element?.type));
  if (!selectedPlayers.length) {
  return false;
  }
  selectedPlayers.forEach((element) => {
  element.playerNumber = playerBadge;
  });
  local.sessionPlannerTacticalNumberPickerElementId = "";
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  return true;
  }
  function isSessionPlannerTacticalElementSelected(elementId) {
  return getSessionPlannerTacticalSelectedElementIds().includes(elementId);
  }
  function shouldDragSessionPlannerTacticalSelectionGroup(event, elementId) {
  const selectedIds = getSessionPlannerTacticalSelectedElementIds();
  return selectedIds.length > 1 &&
  selectedIds.includes(elementId);
  }
  function getSessionPlannerTacticalDragElementIds(event, elementId) {
  if (!elementId) {
  return [];
  }
  return shouldDragSessionPlannerTacticalSelectionGroup(event, elementId)
  ? getSessionPlannerTacticalSelectedElementIds()
  : [elementId];
  }
  function setSessionPlannerTacticalTool(tool) {
  if (!SESSION_PLANNER_TACTICAL_TOOLS.has(tool)) {
  return;
  }
  local.sessionPlannerTacticalTool = tool;
  if (tool !== "remove") {
  local.sessionPlannerTacticalColor = getDefaultTacticalColor(tool);
  local.sessionPlannerTacticalLineStyle = getDefaultTacticalLineStyle(tool);
  }
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalFreehandState = null;
  local.sessionPlannerTacticalSelectionState = null;
  local.sessionPlannerTacticalLastPlacementClick = null;
  local.sessionPlannerTacticalLastPlacement = null;
  setSessionPlannerTacticalClickSuppression(false);
  clearSessionPlannerTacticalSelection();
  renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
  }
  async function clearSelectedSessionPlannerTacticalBoard() {
  if (!canEditSessionPlanner()) {
  return;
  }
  const block = getSessionPlannerSelectedBlock();
  if (!block) {
  return;
  }
  const hasDrawings = Array.isArray(block.tacticalElements) && block.tacticalElements.length > 0;
  if (!hasDrawings) {
  return;
  }
  const shouldDeleteAll = await confirmTacticalAction({
  title: "Delete all drawings?",
  message: "Delete all drawings from this exercise board?",
  confirmLabel: "Delete drawings",
  tone: "danger",
  });
  if (!shouldDeleteAll) {
  return;
  }
  block.tacticalElements = [];
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalFreehandState = null;
  local.sessionPlannerTacticalSelectionState = null;
  clearSessionPlannerTacticalSelection();
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  }
  function undoSelectedSessionPlannerTacticalBoardAction() {
  if (!canEditSessionPlanner()) {
  return;
  }
  undoSessionPlannerBoardHistory("tactical");
  }
  function removeSessionPlannerTacticalElement(elementId) {
  if (!canEditSessionPlanner() || !elementId) {
  return;
  }
  const block = getSessionPlannerSelectedBlock();
  if (!block || !Array.isArray(block.tacticalElements)) {
  return;
  }
  block.tacticalElements = block.tacticalElements.filter((element) => element.id !== elementId);
  setSessionPlannerTacticalSelectedElements(
  getSessionPlannerTacticalSelectedElementIds().filter((selectedId) => selectedId !== elementId)
  );
  local.sessionPlannerTacticalDraftLineState = null;
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  }
  function removeSelectedSessionPlannerTacticalElement() {
  const selectedIds = getSessionPlannerTacticalSelectedElementIds();
  if (!selectedIds.length) {
  return;
  }
  const block = getSessionPlannerSelectedBlock();
  if (!block || !Array.isArray(block.tacticalElements)) {
  return;
  }
  const selectedIdSet = new Set(selectedIds);
  block.tacticalElements = block.tacticalElements.filter((element) => !selectedIdSet.has(element.id));
  clearSessionPlannerTacticalSelection();
  local.sessionPlannerTacticalDraftLineState = null;
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  }
  function addSessionPlannerTacticalElement(element) {
  if (!canEditSessionPlanner()) {
  return;
  }
  const block = getSessionPlannerSelectedBlock();
  if (!block) {
  return;
  }
  if (!Array.isArray(block.tacticalElements)) {
  block.tacticalElements = [];
  }
  const clonedElement = cloneSessionPlannerTacticalElement(element);
  block.tacticalElements.push(clonedElement);
  setSessionPlannerTacticalSelectedElements([clonedElement.id], clonedElement.id);
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  }
  function snapSessionPlannerTacticalValue(value) {
  return clamp(Math.round(Number(value) / sessionPlannerTacticalSnapStep) * sessionPlannerTacticalSnapStep, 0, 100);
  }
  function snapSessionPlannerTacticalPoint(point = {}) {
  return {
  x: snapSessionPlannerTacticalValue(point.x),
  y: snapSessionPlannerTacticalValue(point.y),
  };
  }
  function shouldSnapSessionPlannerTacticalEvent(event, options = {}) {
  if (options.snap === false) {
  return false;
  }
  if (options.snap === true) {
  return true;
  }
  return Boolean(local.sessionPlannerTacticalSnapEnabled && !event?.altKey);
  }
  function getSessionPlannerTacticalCanvasPoint(event, canvas, options = {}) {
  const rect = canvas.getBoundingClientRect();
  return getSessionPlannerTacticalPointFromRect(event, rect, options);
  }
  function getSessionPlannerTacticalPointFromRect(event, rect, options = {}) {
  const width = rect.width || 1;
  const height = rect.height || 1;
  const point = {
  x: clamp(((event.clientX - rect.left) / width) * 100, 0, 100),
  y: clamp(((event.clientY - rect.top) / height) * 100, 0, 100),
  };
  return shouldSnapSessionPlannerTacticalEvent(event, options)
  ? snapSessionPlannerTacticalPoint(point)
  : point;
  }
  function getSessionPlannerTacticalElementById(elementId) {
  const block = getSessionPlannerSelectedBlock();
  if (!block || !Array.isArray(block.tacticalElements)) {
  return null;
  }
  return block.tacticalElements.find((element) => element.id === elementId) ?? null;
  }
  function getSessionPlannerTacticalSelectionRect(selection = local.sessionPlannerTacticalSelectionState) {
  return getSessionPlannerTacticalSelectionRectFromState(selection);
  }
  function getSessionPlannerTacticalElementsInRect(rect) {
  const block = getSessionPlannerSelectedBlock();
  if (!rect || !block || !Array.isArray(block.tacticalElements)) {
  return [];
  }
  return selectionHelpers.getElementsInRect(block.tacticalElements, rect);
  }
  function renderSessionPlannerTacticalSelectionBox() {
  const rect = getSessionPlannerTacticalSelectionRect();
  if (!rect || rect.width < 0.2 || rect.height < 0.2) {
  return "";
  }
  return `
      <rect
        class="session-tactical-selection-box"
        x="${rect.left}"
        y="${rect.top}"
        width="${rect.width}"
        height="${rect.height}"
        rx="1.4"
      ></rect>
    `;
  }
  function getSelectedSessionPlannerTacticalElement() {
  if (!local.sessionPlannerTacticalSelectedElementId) {
  return null;
  }
  return getSessionPlannerTacticalElementById(local.sessionPlannerTacticalSelectedElementId);
  }
  function getSelectedSessionPlannerTacticalElements() {
  return getSessionPlannerTacticalSelectedElementIds()
  .map((elementId) => getSessionPlannerTacticalElementById(elementId))
  .filter(Boolean);
  }
  function syncSessionPlannerTacticalboardStatus(selectedElementIds = getSessionPlannerTacticalSelectedElementIds()) {
  const selectedCount = selectedElementIds.length;
  const selectedLabel = `${selectedCount} selected`;
  const modal = ui.sessionPlannerWorkspace?.querySelector(".session-tacticalboard-modal");
  const selectedLabelNode = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-selected-label]");
  const hintState = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-hint-state]");
  if (modal) {
  modal.classList.toggle("has-selection", selectedCount > 0);
  modal.classList.toggle("has-no-selection", selectedCount === 0);
  }
  if (selectedLabelNode) {
  selectedLabelNode.textContent = selectedLabel;
  }
  if (hintState) {
  const frameStatus = hintState.dataset.sessionTacticalFrameStatus || "";
  hintState.textContent = frameStatus ? `${selectedLabel} / Frame ${frameStatus}` : selectedLabel;
  }
  }
  function syncSessionPlannerTacticalboardInspector() {
  const colorInput = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-color]");
  const widthInput = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-width]");
  const styleInput = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-style]");
  const selectedElementIds = getSessionPlannerTacticalSelectedElementIds();
  syncSessionPlannerTacticalboardStatus(selectedElementIds);
  const arrangeCountLabel = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-arrange-count]");
  if (arrangeCountLabel) {
  arrangeCountLabel.textContent = `${selectedElementIds.length} selected`;
  }
  ui.sessionPlannerWorkspace
  ?.querySelectorAll("[data-session-arrange-tactical]")
  ?.forEach((button) => {
  button.disabled = selectedElementIds.length < 2;
  });
  if (!colorInput || !widthInput) {
  return;
  }
  const selectedElement = getSelectedSessionPlannerTacticalElement();
  if (selectedElement) {
  local.sessionPlannerTacticalColor = normalizeTacticalColor(
  selectedElement.color,
  getDefaultTacticalColor(selectedElement.type)
  );
  }
  if (isSessionPlannerTacticalStrokeElement(selectedElement)) {
  local.sessionPlannerTacticalLineWidth = normalizeTacticalLineWidth(selectedElement.lineWidth);
  local.sessionPlannerTacticalLineStyle = normalizeTacticalLineStyle(selectedElement.lineStyle);
  }
  colorInput.value = local.sessionPlannerTacticalColor;
  const normalizedColor = normalizeTacticalColor(local.sessionPlannerTacticalColor);
  ui.sessionPlannerWorkspace
  ?.querySelectorAll("[data-session-tactical-color-choice]")
  ?.forEach((button) => {
  button.classList.toggle(
  "is-active",
  normalizeTacticalColor(button.dataset.sessionTacticalColorChoice) === normalizedColor
  );
  });
  widthInput.value = String(local.sessionPlannerTacticalLineWidth);
  if (styleInput) {
  styleInput.value = local.sessionPlannerTacticalLineStyle;
  }
  }
  function updateSelectedSessionPlannerTacticalElement(updates = {}) {
  if (!canEditSessionPlanner()) {
  return;
  }
  const selectedElements = getSelectedSessionPlannerTacticalElements();
  if (!selectedElements.length) {
  return;
  }
  selectedElements.forEach((element) => {
  if (Object.prototype.hasOwnProperty.call(updates, "color")) {
  element.color = normalizeTacticalColor(updates.color, getDefaultTacticalColor(element.type));
  }
  if (
  Object.prototype.hasOwnProperty.call(updates, "lineWidth") &&
  isSessionPlannerTacticalStrokeElement(element)
  ) {
  element.lineWidth = normalizeTacticalLineWidth(updates.lineWidth);
  }
  if (
  Object.prototype.hasOwnProperty.call(updates, "lineStyle") &&
  isSessionPlannerTacticalStrokeElement(element)
  ) {
  element.lineStyle = normalizeTacticalLineStyle(updates.lineStyle);
  }
  });
  const primaryElement = getSelectedSessionPlannerTacticalElement();
  if (primaryElement && Object.prototype.hasOwnProperty.call(updates, "rotation")) {
  primaryElement.rotation = normalizeTacticalRotation(updates.rotation);
  }
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  }
  function updateSessionPlannerTacticalLineStyle(lineStyleValue) {
  local.sessionPlannerTacticalLineStyle = normalizeTacticalLineStyle(lineStyleValue);
  const styleInput = ui.sessionPlannerWorkspace?.querySelector("[data-session-tactical-style]");
  if (styleInput) {
  styleInput.value = local.sessionPlannerTacticalLineStyle;
  }
  if (getSelectedSessionPlannerTacticalElements().some(isSessionPlannerTacticalStrokeElement)) {
  updateSelectedSessionPlannerTacticalElement({ lineStyle: local.sessionPlannerTacticalLineStyle });
  }
  }
  function moveSessionPlannerTacticalElements(elementIds = [], deltaX, deltaY) {
  const initialElements = Array.isArray(local.sessionPlannerTacticalDragState?.initialElements)
  ? local.sessionPlannerTacticalDragState.initialElements
  : [];
  const initialById = new Map(initialElements.map((element) => [element.id, element]));
  elementIds.forEach((elementId) => {
  const element = getSessionPlannerTacticalElementById(elementId);
  const initial = initialById.get(elementId);
  if (element && initial) {
  moveSessionPlannerTacticalElementFromInitial(element, initial, deltaX, deltaY);
  }
  });
  }
  function isSessionPlannerTacticalEndpointElement(element = {}) {
  return isSessionPlannerTacticalLineTool(element.type);
  }
  function updateSessionPlannerTacticalElementHandle(elementId, handle, point) {
  const element = getSessionPlannerTacticalElementById(elementId);
  if (!element || !isSessionPlannerTacticalEndpointElement(element)) {
  return;
  }
  const nextPoint = {
  x: clamp(Number(point.x), 0, 100),
  y: clamp(Number(point.y), 0, 100),
  };
  if (handle === "start") {
  element.x = nextPoint.x;
  element.y = nextPoint.y;
  return;
  }
  if (handle === "control" && element.type === "curve") {
  element.controlX = nextPoint.x;
  element.controlY = nextPoint.y;
  return;
  }
  if (handle === "end") {
  element.x2 = nextPoint.x;
  element.y2 = nextPoint.y;
  }
  }
  function getSessionPlannerTacticalRotationFromEvent(event, element, rect) {
  const centerX = (clamp(Number(element.x), 0, 100) / 100) * rect.width;
  const centerY = (clamp(Number(element.y), 0, 100) / 100) * rect.height;
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const angle = Math.atan2(pointerY - centerY, pointerX - centerX) * (180 / Math.PI) + 90;
  return normalizeTacticalRotation(angle);
  }
  function shouldPlaceSessionPlannerTacticalDoubleClick(point) {
  const result = evaluateTacticalDoubleClick({
  point,
  previousClick: local.sessionPlannerTacticalLastPlacementClick,
  tool: local.sessionPlannerTacticalTool,
  });
  local.sessionPlannerTacticalLastPlacementClick = result.nextClick;
  return result.shouldPlace;
  }
  function shouldSkipRepeatedSessionPlannerTacticalPlacement(point) {
  const result = evaluateRepeatedPlacement({
  point,
  previousPlacement: local.sessionPlannerTacticalLastPlacement,
  tool: local.sessionPlannerTacticalTool,
  });
  local.sessionPlannerTacticalLastPlacement = result.nextPlacement;
  return result.shouldSkip;
  }
  function addSessionPlannerTacticalPlacementElement(point) {
  if (!point || !isSessionPlannerTacticalPlacementTool()) {
  return false;
  }
  const placementPoint = snapSessionPlannerTacticalPoint(point);
  if (shouldSkipRepeatedSessionPlannerTacticalPlacement(placementPoint)) {
  return false;
  }
  const { x, y } = placementPoint;
  if (local.sessionPlannerTacticalTool === "text") {
  const label = win.prompt("Text on board", "Coaching point");
  if (!label) {
  return false;
  }
  addSessionPlannerTacticalElement({
  type: "text",
  x,
  y,
  label,
  color: local.sessionPlannerTacticalColor,
  });
  return true;
  }
  addSessionPlannerTacticalElement({
  type: local.sessionPlannerTacticalTool,
  x,
  y,
  color: local.sessionPlannerTacticalColor,
  });
  return true;
  }
  function handleSessionPlannerTacticalCanvasClick(event, canvas) {
  if (!canEditSessionPlanner() || !canvas) {
  return;
  }
  const clickedElement = event.target.closest?.("[data-session-tactical-element-id]");
  if (local.sessionPlannerTacticalSuppressNextClick) {
  const shouldSuppressClick = Date.now() - local.sessionPlannerTacticalSuppressNextClickAt <= 240;
  setSessionPlannerTacticalClickSuppression(false);
  if (shouldSuppressClick) {
  return;
  }
  }
  if (local.sessionPlannerTacticalTool === "remove" && clickedElement) {
  local.sessionPlannerTacticalNumberPickerElementId = "";
  removeSessionPlannerTacticalElement(clickedElement.dataset.sessionTacticalElementId);
  return;
  }
  if (clickedElement) {
  const elementId = clickedElement.dataset.sessionTacticalElementId || "";
  if (isSessionPlannerTacticalSelectionToggleModifier(event)) {
  toggleSessionPlannerTacticalElementSelection(elementId);
  return;
  }
  local.sessionPlannerTacticalNumberPickerElementId =
  local.sessionPlannerTacticalNumberPickerElementId === elementId ? local.sessionPlannerTacticalNumberPickerElementId : "";
  setSessionPlannerTacticalSelectedElements([elementId], elementId);
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  refreshSessionPlannerTacticalboardCanvas({
  focusTarget: { elementId },
  });
  return;
  }
  clearSessionPlannerTacticalSelection();
  local.sessionPlannerTacticalNumberPickerElementId = "";
  local.sessionPlannerTacticalDraftLineState = null;
  syncSessionPlannerTacticalboardInspector();
  if (local.sessionPlannerTacticalTool === "freehand") {
  return;
  }
  const point = getSessionPlannerTacticalCanvasPoint(event, canvas);
  if (isSessionPlannerTacticalLineTool()) {
  const lineAction = advanceSessionPlannerTacticalLineClick(
  local.sessionPlannerTacticalTool,
  local.sessionPlannerTacticalPendingPoint,
  point
  );
  if (lineAction.action === "pending") {
  local.sessionPlannerTacticalPendingPoint = lineAction.pendingPoint;
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  addSessionPlannerTacticalElement(
  createSessionPlannerLineElement(
  lineAction.type,
  lineAction.from,
  lineAction.to,
  lineAction.options
  )
  );
  local.sessionPlannerTacticalPendingPoint = null;
  return;
  }
  const clickCount = Number(event.detail) || 1;
  if (isSessionPlannerTacticalPlacementTool() && clickCount >= 2) {
  addSessionPlannerTacticalPlacementElement(point);
  }
  }
  function handleSessionPlannerTacticalCanvasDoubleClick(event, canvas) {
  if (!canEditSessionPlanner() || !canvas) {
  return;
  }
  event.preventDefault();
  event.stopPropagation();
  setSessionPlannerTacticalClickSuppression(false);
  const clickedElement = event.target.closest?.("[data-session-tactical-element-id]");
  if (clickedElement) {
  const elementId = clickedElement.dataset.sessionTacticalElementId || "";
  const element = getSessionPlannerTacticalElementById(elementId);
  if (isSessionPlannerTacticalPlayerType(element?.type)) {
  openSessionPlannerTacticalNumberPicker(elementId);
  } else {
  local.sessionPlannerTacticalNumberPickerElementId = "";
  setSessionPlannerTacticalSelectedElements([elementId], elementId);
  refreshSessionPlannerTacticalboardCanvas();
  }
  return;
  }
  if (!isSessionPlannerTacticalPlacementTool()) {
  return;
  }
  const point = getSessionPlannerTacticalCanvasPoint(event, canvas);
  addSessionPlannerTacticalPlacementElement(point);
  }

  return {
    refreshSessionPlannerTacticalboardCanvas,
    isSessionPlannerTacticalLineTool,
    isSessionPlannerTacticalStrokeElement,
    isSessionPlannerTacticalPlacementTool,
    uniqueValues,
    getSessionPlannerTacticalSelectedElementIds,
    setSessionPlannerTacticalSelectedElements,
    isSessionPlannerTacticalSelectionToggleModifier,
    toggleSessionPlannerTacticalElementSelection,
    clearSessionPlannerTacticalSelection,
    setSessionPlannerTacticalClickSuppression,
    setSessionPlannerTacticalPitchMode,
    openSessionPlannerTacticalNumberPicker,
    updateSessionPlannerTacticalPlayerNumber,
    updateSelectedSessionPlannerTacticalPlayerBadges,
    isSessionPlannerTacticalElementSelected,
    shouldDragSessionPlannerTacticalSelectionGroup,
    getSessionPlannerTacticalDragElementIds,
    setSessionPlannerTacticalTool,
    clearSelectedSessionPlannerTacticalBoard,
    undoSelectedSessionPlannerTacticalBoardAction,
    removeSessionPlannerTacticalElement,
    removeSelectedSessionPlannerTacticalElement,
    addSessionPlannerTacticalElement,
    snapSessionPlannerTacticalValue,
    snapSessionPlannerTacticalPoint,
    shouldSnapSessionPlannerTacticalEvent,
    getSessionPlannerTacticalCanvasPoint,
    getSessionPlannerTacticalPointFromRect,
    getSessionPlannerTacticalElementById,
    getSessionPlannerTacticalSelectionRect,
    getSessionPlannerTacticalElementBounds,
    isSessionPlannerTacticalPointInRect,
    getSessionPlannerTacticalElementSelectionPoints,
    isSessionPlannerTacticalElementInSelectionRect,
    getSessionPlannerTacticalElementsInRect,
    renderSessionPlannerTacticalSelectionBox,
    getSelectedSessionPlannerTacticalElement,
    getSelectedSessionPlannerTacticalElements,
    syncSessionPlannerTacticalboardInspector,
    updateSelectedSessionPlannerTacticalElement,
    updateSessionPlannerTacticalLineStyle,
    clampMovedTacticalPoint,
    moveSessionPlannerTacticalElementFromInitial,
    moveSessionPlannerTacticalElements,
    moveSessionPlannerTacticalElementByDelta,
    getSessionPlannerTacticalBoundsCollection,
    getSessionPlannerTacticalArrangeSpacing,
    moveSessionPlannerTacticalElementCenterTo,
    arrangeSelectedSessionPlannerTacticalElements,
    copySelectedSessionPlannerTacticalElements,
    pasteSessionPlannerTacticalClipboard,
    isSessionPlannerTacticalEndpointElement,
    updateSessionPlannerTacticalElementHandle,
    getSessionPlannerTacticalRotationFromEvent,
    shouldPlaceSessionPlannerTacticalDoubleClick,
    shouldSkipRepeatedSessionPlannerTacticalPlacement,
    addSessionPlannerTacticalPlacementElement,
    handleSessionPlannerTacticalCanvasClick,
    handleSessionPlannerTacticalCanvasDoubleClick,
    handleSessionPlannerTacticalKeyboardAction,
    startSessionPlannerTacticalDrag,
    updateSessionPlannerTacticalDrag,
    finishSessionPlannerTacticalDrag,
  };
}
