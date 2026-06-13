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
  }
  function isSessionPlannerTacticalLineTool(tool = local.sessionPlannerTacticalTool) {
  return ["arrow", "pass", "run", "line", "dashed-line", "curve", "zone", "dashed-zone", "ellipse"].includes(tool);
  }
  function isSessionPlannerTacticalStrokeElement(element = {}) {
  return Boolean(element) && (isSessionPlannerTacticalLineTool(element.type) || element.type === "freehand");
  }
  function isSessionPlannerTacticalPlacementTool(tool = local.sessionPlannerTacticalTool) {
  return Boolean(tool) && tool !== "remove" && tool !== "freehand" && !isSessionPlannerTacticalLineTool(tool);
  }
  function uniqueValues(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [values]).filter((value) => {
  if (seen.has(value)) {
  return false;
  }
  seen.add(value);
  return true;
  });
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
  function toggleSessionPlannerTacticalElementSelection(elementId) {
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
  refreshSessionPlannerTacticalboardCanvas();
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
  const allowedTools = new Set([
  "blue-player",
  "red-player",
  "neutral-player",
  "coach",
  "ball",
  "cone",
  "mini-goal",
  "big-goal",
  "mannequin",
  "pole",
  "gate",
  "dashed-line",
  "zone",
  "dashed-zone",
  "ellipse",
  "arrow",
  "pass",
  "run",
  "line",
  "curve",
  "freehand",
  "text",
  "remove",
  ]);
  if (!allowedTools.has(tool)) {
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
  function clearSelectedSessionPlannerTacticalBoard() {
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
  const shouldDeleteAll = win.confirm("Delete all drawings from this exercise board?");
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
  if (!selection?.startPoint || !selection?.currentPoint) {
  return null;
  }
  const left = Math.min(selection.startPoint.x, selection.currentPoint.x);
  const top = Math.min(selection.startPoint.y, selection.currentPoint.y);
  const right = Math.max(selection.startPoint.x, selection.currentPoint.x);
  const bottom = Math.max(selection.startPoint.y, selection.currentPoint.y);
  return {
  left,
  top,
  right,
  bottom,
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
  };
  }
  function getSessionPlannerTacticalElementBounds(element) {
  if (!element) {
  return null;
  }
  const points = [];
  const addPoint = (x, y) => {
  const pointX = Number(x);
  const pointY = Number(y);
  if (Number.isFinite(pointX) && Number.isFinite(pointY)) {
  points.push({
  x: clamp(pointX, 0, 100),
  y: clamp(pointY, 0, 100),
  });
  }
  };
  addPoint(element.x, element.y);
  addPoint(element.x2, element.y2);
  if (element.type === "curve") {
  const curveCoordinates = getSessionPlannerTacticalEndpointCoordinates(element);
  addPoint(curveCoordinates?.controlX, curveCoordinates?.controlY);
  }
  if (Array.isArray(element.points)) {
  element.points.forEach((point) => addPoint(point.x, point.y));
  }
  if (!points.length) {
  return null;
  }
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  const boundsPaddingByType = {
  "blue-player": 2.4,
  "red-player": 2.4,
  "neutral-player": 2.4,
  coach: 2.5,
  ball: 1.8,
  cone: 2.1,
  "mini-goal": 4.2,
  "big-goal": 5.2,
  mannequin: 2.8,
  pole: 1.6,
  gate: 3.2,
  text: 6,
  };
  const padding = isSessionPlannerTacticalStrokeElement(element)
  ? 1.2
  : boundsPaddingByType[element.type] ?? 2.4;
  return {
  left: clamp(left - padding, 0, 100),
  top: clamp(top - padding, 0, 100),
  right: clamp(right + padding, 0, 100),
  bottom: clamp(bottom + padding, 0, 100),
  };
  }
  function isSessionPlannerTacticalPointInRect(point, rect) {
  return Boolean(point && rect) &&
  Number(point.x) >= rect.left &&
  Number(point.x) <= rect.right &&
  Number(point.y) >= rect.top &&
  Number(point.y) <= rect.bottom;
  }
  function getSessionPlannerTacticalElementSelectionPoints(element) {
  if (!element) {
  return [];
  }
  const points = [];
  const addPoint = (x, y) => {
  const pointX = Number(x);
  const pointY = Number(y);
  if (Number.isFinite(pointX) && Number.isFinite(pointY)) {
  points.push({
  x: clamp(pointX, 0, 100),
  y: clamp(pointY, 0, 100),
  });
  }
  };
  addPoint(element.x, element.y);
  if (Number.isFinite(Number(element.x2)) && Number.isFinite(Number(element.y2))) {
  addPoint(element.x2, element.y2);
  addPoint((Number(element.x) + Number(element.x2)) / 2, (Number(element.y) + Number(element.y2)) / 2);
  }
  if (element.type === "curve") {
  const coordinates = getSessionPlannerTacticalEndpointCoordinates(element);
  addPoint(coordinates?.controlX, coordinates?.controlY);
  }
  if (Array.isArray(element.points)) {
  element.points.forEach((point) => addPoint(point.x, point.y));
  }
  const bounds = getSessionPlannerTacticalElementBounds(element);
  if (bounds) {
  addPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
  }
  return points;
  }
  function isSessionPlannerTacticalElementInSelectionRect(element, rect) {
  if (!element || !rect) {
  return false;
  }
  return getSessionPlannerTacticalElementSelectionPoints(element).some((point) =>
  isSessionPlannerTacticalPointInRect(point, rect)
  );
  }
  function getSessionPlannerTacticalElementsInRect(rect) {
  const block = getSessionPlannerSelectedBlock();
  if (!rect || !block || !Array.isArray(block.tacticalElements)) {
  return [];
  }
  return block.tacticalElements.filter((element) =>
  isSessionPlannerTacticalElementInSelectionRect(element, rect)
  );
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
  function clampMovedTacticalPoint(point, deltaX, deltaY) {
  return {
  x: clamp(Number(point.x) + deltaX, 0, 100),
  y: clamp(Number(point.y) + deltaY, 0, 100),
  };
  }
  function moveSessionPlannerTacticalElementFromInitial(element, initial, deltaX, deltaY) {
  if (!element || !initial) {
  return;
  }
  const moved = clampMovedTacticalPoint(initial, deltaX, deltaY);
  element.x = moved.x;
  element.y = moved.y;
  if (Number.isFinite(Number(initial.x2)) && Number.isFinite(Number(initial.y2))) {
  const movedEnd = clampMovedTacticalPoint({ x: initial.x2, y: initial.y2 }, deltaX, deltaY);
  element.x2 = movedEnd.x;
  element.y2 = movedEnd.y;
  }
  if (Number.isFinite(Number(initial.controlX)) && Number.isFinite(Number(initial.controlY))) {
  const movedControl = clampMovedTacticalPoint(
  { x: initial.controlX, y: initial.controlY },
  deltaX,
  deltaY
  );
  element.controlX = movedControl.x;
  element.controlY = movedControl.y;
  }
  if (Array.isArray(initial.points)) {
  element.points = initial.points.map((point) => clampMovedTacticalPoint(point, deltaX, deltaY));
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
  function moveSessionPlannerTacticalElementByDelta(element, deltaX, deltaY) {
  if (!element) {
  return;
  }
  moveSessionPlannerTacticalElementFromInitial(
  element,
  cloneSessionPlannerTacticalElement(element),
  deltaX,
  deltaY
  );
  }
  function getSessionPlannerTacticalBoundsCollection(elements = []) {
  const items = elements
  .map((element) => {
  const bounds = getSessionPlannerTacticalElementBounds(element);
  if (!bounds) {
  return null;
  }
  return {
  element,
  bounds,
  centerX: (bounds.left + bounds.right) / 2,
  centerY: (bounds.top + bounds.bottom) / 2,
  };
  })
  .filter(Boolean);
  if (!items.length) {
  return null;
  }
  return {
  items,
  left: Math.min(...items.map((item) => item.bounds.left)),
  right: Math.max(...items.map((item) => item.bounds.right)),
  top: Math.min(...items.map((item) => item.bounds.top)),
  bottom: Math.max(...items.map((item) => item.bounds.bottom)),
  };
  }
  function getSessionPlannerTacticalArrangeSpacing(count, span, fallback = 5.2) {
  if (count <= 1) {
  return 0;
  }
  const availableSpan = Math.abs(Number(span));
  if (Number.isFinite(availableSpan) && availableSpan >= count * 2.6) {
  return clamp(availableSpan / (count - 1), 3.2, 9.5);
  }
  return fallback;
  }
  function moveSessionPlannerTacticalElementCenterTo(item, targetCenterX, targetCenterY) {
  if (!item?.element) {
  return;
  }
  const deltaX = Number(targetCenterX) - item.centerX;
  const deltaY = Number(targetCenterY) - item.centerY;
  moveSessionPlannerTacticalElementByDelta(item.element, deltaX, deltaY);
  }
  function arrangeSelectedSessionPlannerTacticalElements(mode) {
  if (!canEditSessionPlanner()) {
  return;
  }
  const collection = getSessionPlannerTacticalBoundsCollection(getSelectedSessionPlannerTacticalElements());
  if (!collection || collection.items.length < 2) {
  showSessionPlannerToast("Select at least two items to arrange.", "warning");
  return;
  }
  const count = collection.items.length;
  const centerX = (collection.left + collection.right) / 2;
  const centerY = (collection.top + collection.bottom) / 2;
  const sortedItems = [...collection.items].sort((a, b) =>
  a.centerY === b.centerY ? a.centerX - b.centerX : a.centerY - b.centerY
  );
  if (mode === "row") {
  const rowItems = [...collection.items].sort((a, b) => a.centerX - b.centerX);
  const spacing = getSessionPlannerTacticalArrangeSpacing(count, collection.right - collection.left, 5);
  const startX = clamp(centerX - (spacing * (count - 1)) / 2, 3, 97 - spacing * (count - 1));
  rowItems.forEach((item, index) => {
  moveSessionPlannerTacticalElementCenterTo(item, startX + spacing * index, centerY);
  });
  } else if (mode === "column") {
  const columnItems = [...collection.items].sort((a, b) => a.centerY - b.centerY);
  const spacing = getSessionPlannerTacticalArrangeSpacing(count, collection.bottom - collection.top, 4.6);
  const startY = clamp(centerY - (spacing * (count - 1)) / 2, 3, 97 - spacing * (count - 1));
  columnItems.forEach((item, index) => {
  moveSessionPlannerTacticalElementCenterTo(item, centerX, startY + spacing * index);
  });
  } else {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const spacingX = 5.4;
  const spacingY = 4.9;
  const startX = clamp(centerX - (spacingX * (columns - 1)) / 2, 3, 97 - spacingX * (columns - 1));
  const startY = clamp(centerY - (spacingY * (rows - 1)) / 2, 3, 97 - spacingY * (rows - 1));
  sortedItems.forEach((item, index) => {
  const columnIndex = index % columns;
  const rowIndex = Math.floor(index / columns);
  moveSessionPlannerTacticalElementCenterTo(item, startX + spacingX * columnIndex, startY + spacingY * rowIndex);
  });
  }
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  showSessionPlannerToast(`Arranged ${count} selected item${count === 1 ? "" : "s"}.`);
  }
  function copySelectedSessionPlannerTacticalElements() {
  if (!canEditSessionPlanner()) {
  return false;
  }
  const selectedElements = getSelectedSessionPlannerTacticalElements();
  if (!selectedElements.length) {
  showSessionPlannerToast("Select players or tools first.", "error");
  return false;
  }
  local.sessionPlannerTacticalClipboard = selectedElements.map(cloneSessionPlannerTacticalElement);
  local.sessionPlannerTacticalClipboardPasteCount = 0;
  showSessionPlannerToast(
  `Copied: ${selectedElements.length} item${selectedElements.length === 1 ? "" : "s"}. Paste with Cmd/Ctrl+V.`
  );
  return true;
  }
  function pasteSessionPlannerTacticalClipboard() {
  if (!canEditSessionPlanner()) {
  return false;
  }
  const block = getSessionPlannerSelectedBlock();
  if (!block) {
  return false;
  }
  if (!local.sessionPlannerTacticalClipboard.length) {
  showSessionPlannerToast("Nothing copied yet.", "error");
  return false;
  }
  if (!Array.isArray(block.tacticalElements)) {
  block.tacticalElements = [];
  }
  const baseOffset = Math.min(
  4.5,
  Math.max(2.2, local.sessionPlannerTacticalClipboard.length > 1 ? 2.8 : 3.6)
  );
  const copyOffset = baseOffset * (local.sessionPlannerTacticalClipboardPasteCount + 1);
  const duplicatedElements = local.sessionPlannerTacticalClipboard.map((element) => {
  const duplicate = cloneSessionPlannerTacticalElement({
  ...element,
  id: createSessionPlannerStableId("tactical"),
  });
  moveSessionPlannerTacticalElementFromInitial(duplicate, element, copyOffset, copyOffset);
  return duplicate;
  });
  block.tacticalElements.push(...duplicatedElements);
  local.sessionPlannerTacticalClipboardPasteCount += 1;
  clearSessionPlannerTacticalSelection();
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalSelectionState = null;
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  showSessionPlannerToast(`Pasted: ${duplicatedElements.length} item${duplicatedElements.length === 1 ? "" : "s"}.`);
  return true;
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
  if (!point || !isSessionPlannerTacticalPlacementTool()) {
  local.sessionPlannerTacticalLastPlacementClick = null;
  return false;
  }
  const now = Date.now();
  const previousClick = local.sessionPlannerTacticalLastPlacementClick;
  local.sessionPlannerTacticalLastPlacementClick = {
  tool: local.sessionPlannerTacticalTool,
  x: point.x,
  y: point.y,
  time: now,
  };
  if (!previousClick || previousClick.tool !== local.sessionPlannerTacticalTool) {
  return false;
  }
  const distance = Math.hypot(point.x - previousClick.x, point.y - previousClick.y);
  return now - previousClick.time <= 520 && distance <= 4.5;
  }
  function shouldSkipRepeatedSessionPlannerTacticalPlacement(point) {
  const now = Date.now();
  const previousPlacement = local.sessionPlannerTacticalLastPlacement;
  local.sessionPlannerTacticalLastPlacement = {
  tool: local.sessionPlannerTacticalTool,
  x: point.x,
  y: point.y,
  time: now,
  };
  if (!previousPlacement || previousPlacement.tool !== local.sessionPlannerTacticalTool) {
  return false;
  }
  const distance = Math.hypot(point.x - previousPlacement.x, point.y - previousPlacement.y);
  return now - previousPlacement.time < 350 && distance < 0.8;
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
  refreshSessionPlannerTacticalboardCanvas();
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
  const { x, y } = point;
  if (isSessionPlannerTacticalLineTool()) {
  if (local.sessionPlannerTacticalTool === "curve") {
  const pendingCurve = local.sessionPlannerTacticalPendingPoint?.type === "curve"
  ? local.sessionPlannerTacticalPendingPoint
  : null;
  if (!pendingCurve) {
  local.sessionPlannerTacticalPendingPoint = {
  ...point,
  type: "curve",
  startPoint: point,
  controlPoint: null,
  };
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  if (!pendingCurve.controlPoint) {
  local.sessionPlannerTacticalPendingPoint = {
  ...pendingCurve,
  controlPoint: point,
  };
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  addSessionPlannerTacticalElement(
  createSessionPlannerLineElement("curve", pendingCurve.startPoint || pendingCurve, point, {
  controlPoint: pendingCurve.controlPoint,
  })
  );
  local.sessionPlannerTacticalPendingPoint = null;
  return;
  }
  if (!local.sessionPlannerTacticalPendingPoint) {
  local.sessionPlannerTacticalPendingPoint = { ...point, type: local.sessionPlannerTacticalTool };
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  addSessionPlannerTacticalElement(
  createSessionPlannerLineElement(
  local.sessionPlannerTacticalTool,
  local.sessionPlannerTacticalPendingPoint,
  point
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
  function startSessionPlannerTacticalDrag(event) {
  if (!canEditSessionPlanner() || !local.sessionPlannerTacticalboardOpen) {
  return;
  }
  if (event.target.closest?.(".session-tactical-number-picker")) {
  return;
  }
  const canvas = event.target.closest?.("[data-session-tactical-canvas]");
  if (!canvas) {
  return;
  }
  const toggleTrigger = event.target.closest?.("[data-session-tactical-element-id]");
  if (toggleTrigger && isSessionPlannerTacticalSelectionToggleModifier(event) && local.sessionPlannerTacticalTool !== "remove") {
  event.preventDefault();
  event.stopPropagation();
  toggleSessionPlannerTacticalElementSelection(toggleTrigger.dataset.sessionTacticalElementId || "");
  setSessionPlannerTacticalClickSuppression(true);
  return;
  }
  const handleTrigger = event.target.closest?.("[data-session-tactical-handle]");
  if (handleTrigger && local.sessionPlannerTacticalTool !== "remove") {
  const element = getSessionPlannerTacticalElementById(handleTrigger.dataset.sessionTacticalElementId);
  if (!element) {
  return;
  }
  event.preventDefault();
  setSessionPlannerTacticalSelectedElements([element.id], element.id);
  local.sessionPlannerTacticalNumberPickerElementId = "";
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalDragState = {
  elementId: element.id,
  handle: handleTrigger.dataset.sessionTacticalHandle,
  canvasRect: canvas.getBoundingClientRect(),
  moved: false,
  };
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  const rotateTrigger = event.target.closest?.("[data-session-tactical-rotate-handle]");
  if (rotateTrigger && local.sessionPlannerTacticalTool !== "remove") {
  const element = getSessionPlannerTacticalElementById(rotateTrigger.dataset.sessionTacticalElementId);
  if (!isSessionPlannerTacticalGoalType(element?.type)) {
  return;
  }
  event.preventDefault();
  setSessionPlannerTacticalSelectedElements([element.id], element.id);
  local.sessionPlannerTacticalNumberPickerElementId = "";
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalDragState = {
  elementId: element.id,
  rotate: true,
  canvasRect: canvas.getBoundingClientRect(),
  moved: false,
  };
  return;
  }
  const elementTrigger = event.target.closest?.("[data-session-tactical-element-id]");
  if (elementTrigger && local.sessionPlannerTacticalTool !== "remove") {
  const element = getSessionPlannerTacticalElementById(elementTrigger.dataset.sessionTacticalElementId);
  if (!element) {
  return;
  }
  event.preventDefault();
  const dragIds = getSessionPlannerTacticalDragElementIds(event, element.id);
  const initialElements = dragIds
  .map((elementId) => getSessionPlannerTacticalElementById(elementId))
  .filter(Boolean)
  .map(cloneSessionPlannerTacticalElement);
  setSessionPlannerTacticalSelectedElements(dragIds, element.id);
  local.sessionPlannerTacticalNumberPickerElementId = "";
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  syncSessionPlannerTacticalboardInspector();
  local.sessionPlannerTacticalDragState = {
  elementId: element.id,
  elementIds: dragIds,
  canvasRect: canvas.getBoundingClientRect(),
  startPoint: getSessionPlannerTacticalCanvasPoint(event, canvas),
  initialElement: cloneSessionPlannerTacticalElement(element),
  initialElements,
  moved: false,
  };
  return;
  }
  if (isSessionPlannerTacticalPlacementTool()) {
  event.preventDefault();
  local.sessionPlannerTacticalNumberPickerElementId = "";
  const canvasRect = canvas.getBoundingClientRect();
  const point = getSessionPlannerTacticalCanvasPoint(event, canvas, { snap: false });
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = null;
  local.sessionPlannerTacticalSelectionState = {
  canvasRect,
  startPoint: point,
  currentPoint: point,
  moved: false,
  };
  return;
  }
  if (local.sessionPlannerTacticalTool === "freehand") {
  event.preventDefault();
  const canvasRect = canvas.getBoundingClientRect();
  const point = getSessionPlannerTacticalCanvasPoint(event, canvas, { snap: false });
  local.sessionPlannerTacticalFreehandState = {
  canvasRect,
  points: [point],
  color: local.sessionPlannerTacticalColor,
  lineWidth: local.sessionPlannerTacticalLineWidth,
  lineStyle: local.sessionPlannerTacticalLineStyle,
  };
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  if (isSessionPlannerTacticalLineTool()) {
  event.preventDefault();
  const canvasRect = canvas.getBoundingClientRect();
  const point = getSessionPlannerTacticalCanvasPoint(event, canvas);
  const pendingPointAtStart = local.sessionPlannerTacticalPendingPoint
  ? { ...local.sessionPlannerTacticalPendingPoint }
  : null;
  clearSessionPlannerTacticalSelection();
  local.sessionPlannerTacticalPendingPoint = null;
  local.sessionPlannerTacticalDraftLineState = {
  type: local.sessionPlannerTacticalTool,
  canvasRect,
  startPoint: point,
  currentPoint: point,
  pendingPointAtStart,
  moved: false,
  };
  refreshSessionPlannerTacticalboardCanvas();
  }
  }
  function updateSessionPlannerTacticalDrag(event) {
  if (local.sessionPlannerTacticalDraftLineState) {
  const point = getSessionPlannerTacticalPointFromRect(event, local.sessionPlannerTacticalDraftLineState.canvasRect);
  const distance = Math.hypot(
  point.x - local.sessionPlannerTacticalDraftLineState.startPoint.x,
  point.y - local.sessionPlannerTacticalDraftLineState.startPoint.y
  );
  local.sessionPlannerTacticalDraftLineState.currentPoint = point;
  local.sessionPlannerTacticalDraftLineState.moved = distance > 0.35;
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  if (local.sessionPlannerTacticalSelectionState) {
  const point = getSessionPlannerTacticalPointFromRect(event, local.sessionPlannerTacticalSelectionState.canvasRect, { snap: false });
  const distance = Math.hypot(
  point.x - local.sessionPlannerTacticalSelectionState.startPoint.x,
  point.y - local.sessionPlannerTacticalSelectionState.startPoint.y
  );
  local.sessionPlannerTacticalSelectionState.currentPoint = point;
  local.sessionPlannerTacticalSelectionState.moved = distance > 0.35;
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  if (local.sessionPlannerTacticalDragState) {
  const point = getSessionPlannerTacticalPointFromRect(event, local.sessionPlannerTacticalDragState.canvasRect);
  if (local.sessionPlannerTacticalDragState.handle) {
  updateSessionPlannerTacticalElementHandle(
  local.sessionPlannerTacticalDragState.elementId,
  local.sessionPlannerTacticalDragState.handle,
  point
  );
  local.sessionPlannerTacticalDragState.moved = true;
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  if (local.sessionPlannerTacticalDragState.rotate) {
  const element = getSessionPlannerTacticalElementById(local.sessionPlannerTacticalDragState.elementId);
  if (isSessionPlannerTacticalGoalType(element?.type)) {
  element.rotation = getSessionPlannerTacticalRotationFromEvent(
  event,
  element,
  local.sessionPlannerTacticalDragState.canvasRect
  );
  local.sessionPlannerTacticalDragState.moved = true;
  refreshSessionPlannerTacticalboardCanvas();
  }
  return;
  }
  const deltaX = point.x - local.sessionPlannerTacticalDragState.startPoint.x;
  const deltaY = point.y - local.sessionPlannerTacticalDragState.startPoint.y;
  if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) {
  local.sessionPlannerTacticalDragState.moved = true;
  moveSessionPlannerTacticalElements(
  local.sessionPlannerTacticalDragState.elementIds ?? [local.sessionPlannerTacticalDragState.elementId],
  deltaX,
  deltaY
  );
  refreshSessionPlannerTacticalboardCanvas();
  }
  return;
  }
  if (local.sessionPlannerTacticalFreehandState) {
  const point = getSessionPlannerTacticalPointFromRect(event, local.sessionPlannerTacticalFreehandState.canvasRect, { snap: false });
  const lastPoint = local.sessionPlannerTacticalFreehandState.points.at(-1);
  const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
  if (distance > 0.55) {
  local.sessionPlannerTacticalFreehandState.points.push(point);
  refreshSessionPlannerTacticalboardCanvas();
  }
  }
  }
  function finishSessionPlannerTacticalDrag() {
  if (local.sessionPlannerTacticalDraftLineState) {
  const draftLine = local.sessionPlannerTacticalDraftLineState;
  local.sessionPlannerTacticalDraftLineState = null;
  setSessionPlannerTacticalClickSuppression(true);
  if (draftLine.moved) {
  addSessionPlannerTacticalElement(
  createSessionPlannerLineElement(draftLine.type, draftLine.startPoint, draftLine.currentPoint)
  );
  return;
  }
  if (draftLine.pendingPointAtStart) {
  if (draftLine.type === "curve") {
  const pendingCurve = draftLine.pendingPointAtStart.type === "curve"
  ? draftLine.pendingPointAtStart
  : { ...draftLine.pendingPointAtStart, type: "curve", startPoint: draftLine.pendingPointAtStart };
  if (!pendingCurve.controlPoint) {
  local.sessionPlannerTacticalPendingPoint = {
  ...pendingCurve,
  type: "curve",
  startPoint: pendingCurve.startPoint || draftLine.pendingPointAtStart,
  controlPoint: draftLine.startPoint,
  };
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  addSessionPlannerTacticalElement(
  createSessionPlannerLineElement(
  "curve",
  pendingCurve.startPoint || pendingCurve,
  draftLine.startPoint,
  { controlPoint: pendingCurve.controlPoint }
  )
  );
  return;
  }
  addSessionPlannerTacticalElement(
  createSessionPlannerLineElement(draftLine.type, draftLine.pendingPointAtStart, draftLine.startPoint)
  );
  return;
  }
  local.sessionPlannerTacticalPendingPoint =
  draftLine.type === "curve"
  ? {
  ...draftLine.startPoint,
  type: "curve",
  startPoint: draftLine.startPoint,
  controlPoint: null,
  }
  : { ...draftLine.startPoint, type: draftLine.type };
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  if (local.sessionPlannerTacticalSelectionState) {
  const selection = local.sessionPlannerTacticalSelectionState;
  const rect = getSessionPlannerTacticalSelectionRect(selection);
  local.sessionPlannerTacticalSelectionState = null;
  setSessionPlannerTacticalClickSuppression(selection.moved);
  if (!selection.moved && isSessionPlannerTacticalPlacementTool()) {
  if (shouldPlaceSessionPlannerTacticalDoubleClick(selection.startPoint)) {
  setSessionPlannerTacticalClickSuppression(true);
  if (!addSessionPlannerTacticalPlacementElement(selection.startPoint)) {
  refreshSessionPlannerTacticalboardCanvas();
  }
  return;
  }
  clearSessionPlannerTacticalSelection();
  }
  if (selection.moved && rect) {
  const selectedIds = getSessionPlannerTacticalElementsInRect(rect).map((element) => element.id);
  setSessionPlannerTacticalSelectedElements(selectedIds);
  }
  refreshSessionPlannerTacticalboardCanvas();
  return;
  }
  if (local.sessionPlannerTacticalDragState) {
  setSessionPlannerTacticalClickSuppression(local.sessionPlannerTacticalDragState.moved);
  local.sessionPlannerTacticalDragState = null;
  refreshSessionPlannerTacticalboardCanvas({ persist: true });
  }
  if (local.sessionPlannerTacticalFreehandState) {
  const freehand = local.sessionPlannerTacticalFreehandState;
  local.sessionPlannerTacticalFreehandState = null;
  if (freehand.points.length > 1) {
  addSessionPlannerTacticalElement({
  type: "freehand",
  x: freehand.points[0].x,
  y: freehand.points[0].y,
  points: freehand.points,
  color: freehand.color,
  lineWidth: freehand.lineWidth,
  lineStyle: freehand.lineStyle,
  });
  return;
  }
  clearSessionPlannerTacticalSelection();
  refreshSessionPlannerTacticalboardCanvas();
  }
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
    startSessionPlannerTacticalDrag,
    updateSessionPlannerTacticalDrag,
    finishSessionPlannerTacticalDrag,
  };
}
