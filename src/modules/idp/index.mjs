import { createIdpActions } from "./idp-actions.mjs";
import { createIdpStore } from "./idp-state.mjs";
import { renderIdpWorkspace as renderMarkup } from "./idp-renderer.mjs";
import {
  applyTacticalBoardSvgElementGeometry,
  getTacticalBoardSvgElementTagName,
  getTacticalBoardKeyboardNudge,
  offsetTacticalBoardPoint,
  snapTacticalBoardPoint,
  tacticalBoardDefaultCurveControlPoint,
} from "../tactical-board/index.mjs";
import {
  closeClipPreview,
  ensureClipBankStyles,
  jumpClipPreview,
  moveClipPreview,
  openClipPreview,
  revokePreviewUrl,
  selectedClipIds,
  setupIdpClipPreviewPlayback,
  toggleClipBankSelection,
} from "./idp-clip-preview-controller.mjs";
import { createIdpApiService } from "./services/idp-api-service.mjs";
import { idpBoardTemplateInterventionId } from "./idp-player-board-template-library.mjs";

let runtime = null;
const IDP_SYNC_INTERVAL_MS = 30000;
const IDP_SYNC_FOCUS_COOLDOWN_MS = 5000;
const IDP_BOARD_GRID_SIZE = 1;
const BOARD_HISTORY_FIELDS = [
  "playerX",
  "playerY",
  "referenceLabel",
  "referenceX",
  "referenceY",
  "cone1Active",
  "cone1X",
  "cone1Y",
  "cone2Active",
  "cone2X",
  "cone2Y",
  "cone3Active",
  "cone3X",
  "cone3Y",
  "zoneLabel",
  "zoneX",
  "zoneY",
  "zoneWidth",
  "zoneHeight",
  "arrowLabel",
  "arrowFromX",
  "arrowFromY",
  "arrowToX",
  "arrowToY",
  "arrowType",
  "arrowColor",
  "arrowLineStyle",
  "arrowLineWidth",
  "noteText",
  "noteX",
  "noteY",
  "frameLabel",
  "frameCoachCue",
  "framePlayerCue",
  "frameClipAnchor",
];
const BOARD_DRAFT_EXCLUDED_FIELDS = new Set([
  "interventionId",
  "focusId",
  "rowVersion",
]);

function normalizeContext(context = {}) {
  return {
    ui: context.ui || {},
    win: context.win || globalThis,
    currentUser: context.currentUser || null,
    users: Array.isArray(context.users) ? context.users : [],
    formatUserName: typeof context.formatUserName === "function" ? context.formatUserName : null,
    team: context.team || null,
    teamName: context.teamName || context.team?.name || context.currentUser?.teamName || context.currentUser?.team || "",
    teamLogoUrl: context.teamLogoUrl || context.team?.logoUrl || context.team?.logo_url || context.currentUser?.teamLogoUrl || "",
    getAuthToken: typeof context.getAuthToken === "function" ? context.getAuthToken : () => "",
    getPlayerProfilesState:
      typeof context.getPlayerProfilesState === "function" ? context.getPlayerProfilesState : () => ({}),
    getExerciseLibrary:
      typeof context.getExerciseLibrary === "function" ? context.getExerciseLibrary : () => [],
    renderPlayerProfileScoutingSpider:
      typeof context.renderPlayerProfileScoutingSpider === "function" ? context.renderPlayerProfileScoutingSpider : () => "",
    canEdit: typeof context.canEdit === "function" ? context.canEdit : () => Boolean(context.canEdit),
  };
}

function canEdit(context = {}) {
  try {
    return Boolean(context.canEdit?.());
  } catch {
    return false;
  }
}

function getRoot(context = {}) {
  return context.ui?.idpWorkspace || null;
}

function getDocument(activeRuntime) {
  return activeRuntime?.context?.win?.document || globalThis.document || null;
}

function ensureIdpProfileStyles(activeRuntime = runtime) {
  const doc = getDocument(activeRuntime);
  if (!doc?.head || doc.getElementById("idp-profile-focus-styles")) return;
  const link = doc.createElement("link");
  link.id = "idp-profile-focus-styles";
  link.rel = "stylesheet";
  link.href = "src/modules/idp/idp-profile-focus.css";
  doc.head.appendChild(link);
}

function scrollWorkspaceTop(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root) return;
  const win = activeRuntime?.context?.win || globalThis;
  const doc = getDocument(activeRuntime);
  const target = root.querySelector?.(".idp-player-profile, .idp-overview-board") || root;
  const scroll = () => {
    target.scrollIntoView?.({ block: "start", inline: "nearest" });
    doc?.scrollingElement?.scrollTo?.({ top: 0, left: 0 });
  };
  if (typeof win.requestAnimationFrame === "function") {
    win.requestAnimationFrame(scroll);
    return;
  }
  scroll();
}

function shouldRunSyncCheck(activeRuntime) {
  const root = getRoot(activeRuntime?.context);
  if (!root || root.isConnected === false) return false;
  const doc = getDocument(activeRuntime);
  return !doc?.hidden;
}

function queueSyncCheck(activeRuntime = runtime, options = {}) {
  if (!activeRuntime || !activeRuntime.initialized || !shouldRunSyncCheck(activeRuntime)) return;
  const now = Date.now();
  if (!options.force && activeRuntime.lastSyncCheckAt && now - activeRuntime.lastSyncCheckAt < IDP_SYNC_FOCUS_COOLDOWN_MS) {
    return;
  }
  if (activeRuntime.syncInFlight) return;
  activeRuntime.lastSyncCheckAt = now;
  activeRuntime.syncInFlight = true;
  Promise.resolve()
    .then(() => activeRuntime.actions.checkForExternalUpdates())
    .catch(() => {})
    .finally(() => {
      activeRuntime.syncInFlight = false;
    });
}

function startAutoSync(activeRuntime) {
  const win = activeRuntime?.context?.win || globalThis;
  if (!activeRuntime.syncIntervalId && typeof win.setInterval === "function") {
    activeRuntime.syncIntervalId = win.setInterval(() => queueSyncCheck(activeRuntime), IDP_SYNC_INTERVAL_MS);
  }
  if (activeRuntime.syncListening || typeof win.addEventListener !== "function") return;
  const onFocus = () => queueSyncCheck(activeRuntime, { force: true });
  const onVisibilityChange = () => queueSyncCheck(activeRuntime, { force: true });
  win.addEventListener("focus", onFocus);
  getDocument(activeRuntime)?.addEventListener?.("visibilitychange", onVisibilityChange);
  activeRuntime.syncListening = true;
  activeRuntime.syncListeners = { onFocus, onVisibilityChange };
}

function captureSearchFocus(activeRuntime = runtime) {
  const activeElement = getDocument(activeRuntime)?.activeElement;
  const isOverviewSearch = Boolean(activeElement?.matches?.("[data-idp-search]"));
  const isClipSearch = Boolean(activeElement?.matches?.("[data-idp-clip-search]"));
  const isPlayerBoardSearch = Boolean(activeElement?.matches?.("[data-idp-player-board-search]"));
  const isPlayerBoardTemplateSearch = Boolean(activeElement?.matches?.("[data-idp-player-board-template-search]"));
  const isBoardClipPickerSearch = Boolean(activeElement?.matches?.("[data-idp-board-clip-picker-search]"));
  if (!isOverviewSearch && !isClipSearch && !isPlayerBoardSearch && !isPlayerBoardTemplateSearch && !isBoardClipPickerSearch) return null;
  const value = activeElement.value || "";
  return {
    preserveValue: isBoardClipPickerSearch,
    selector: isBoardClipPickerSearch
      ? "[data-idp-board-clip-picker-search]"
      : isPlayerBoardSearch
        ? "[data-idp-player-board-search]"
        : isPlayerBoardTemplateSearch
          ? "[data-idp-player-board-template-search]"
          : isClipSearch
            ? "[data-idp-clip-search]"
            : "[data-idp-search]",
    end: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : value.length,
    start: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : value.length,
    value,
  };
}

function restoreSearchFocus(activeRuntime = runtime, focusState = null) {
  if (!focusState) return;
  const input = getRoot(activeRuntime?.context)?.querySelector?.(focusState.selector || "[data-idp-search]");
  if (!input) return;
  if (focusState.preserveValue) input.value = focusState.value || "";
  const valueLength = input.value?.length || 0;
  const start = Math.min(focusState.start ?? valueLength, valueLength);
  const end = Math.min(focusState.end ?? start, valueLength);
  try {
    input.focus?.({ preventScroll: true });
  } catch {
    input.focus?.();
  }
  try {
    input.setSelectionRange?.(start, end);
  } catch {
    // Some browser/input combinations do not expose selection for this field.
  }
  if (focusState.selector === "[data-idp-board-clip-picker-search]") {
    filterBoardClipPicker(input);
  }
}

function playerBoardDraftKey(activeRuntime = runtime, form = null) {
  const state = activeRuntime?.store?.getState?.() || {};
  const playerId = state.ui?.selectedPlayerId || "";
  const uiInterventionId = state.ui?.playerBoardInterventionId || "";
  const formInterventionId = form?.querySelector?.('[name="interventionId"]')?.value || "";
  return `${playerId}::${uiInterventionId || formInterventionId || "__active"}`;
}

function captureBoardDraftFocus(activeRuntime = runtime, form = null) {
  const activeElement = getDocument(activeRuntime)?.activeElement;
  if (!form?.contains?.(activeElement) || !activeElement?.name) return null;
  const value = activeElement.value || "";
  return {
    name: activeElement.name,
    end: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : value.length,
    start: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : value.length,
  };
}

function restoreBoardDraftFocus(activeRuntime = runtime, form = null, focusState = null) {
  if (!form || !focusState?.name) return;
  const target = form.elements?.namedItem?.(focusState.name) || form.querySelector?.(`[name="${focusState.name}"]`);
  if (!target) return;
  const valueLength = target.value?.length || 0;
  const start = Math.min(focusState.start ?? valueLength, valueLength);
  const end = Math.min(focusState.end ?? start, valueLength);
  try {
    target.focus?.({ preventScroll: true });
  } catch {
    target.focus?.();
  }
  try {
    target.setSelectionRange?.(start, end);
  } catch {
    // Some inputs do not expose a selectable text range.
  }
}

function capturePlayerBoardDraft(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  const modal = root?.querySelector?.(".idp-player-board-modal");
  const form = modal?.querySelector?.("[data-idp-save-intervention]");
  if (!modal || !form) return null;
  syncActiveBoardFrameFromModal(modal);
  const values = {};
  form.querySelectorAll?.("[name]")?.forEach((field) => {
    const name = field.getAttribute("name") || "";
    if (!name || BOARD_DRAFT_EXCLUDED_FIELDS.has(name)) return;
    values[name] = field.value ?? "";
  });
  return {
    activeFrameIndex: activeBoardFrameIndex(modal, readBoardFrames(modal).length || 1),
    activeTool: modal.dataset?.idpBoardActiveTool || "player",
    focus: captureBoardDraftFocus(activeRuntime, form),
    frames: readBoardFrames(modal),
    key: playerBoardDraftKey(activeRuntime, form),
    values,
  };
}

function restorePlayerBoardDraft(activeRuntime = runtime, draft = null) {
  if (!draft?.key) return;
  const root = getRoot(activeRuntime?.context);
  const modal = root?.querySelector?.(".idp-player-board-modal");
  const form = modal?.querySelector?.("[data-idp-save-intervention]");
  if (!modal || !form || playerBoardDraftKey(activeRuntime, form) !== draft.key) return;
  Object.entries(draft.values || {}).forEach(([name, value]) => {
    setBoardFormValue(modal, name, value);
  });
  const frames = Array.isArray(draft.frames) && draft.frames.length ? draft.frames.slice(0, 8) : readBoardFrames(modal);
  const activeIndex = activeBoardFrameIndex({ querySelector: () => ({ value: String(draft.activeFrameIndex || 0) }) }, frames.length || 1);
  writeBoardFrames(modal, frames);
  rebuildBoardFrameButtons(modal, frames, activeIndex);
  applyBoardFrameToModal(modal, frames[activeIndex] || frames[0] || {}, activeIndex);
  writeBoardFrames(modal, frames);
  setActiveBoardFrameIndex(modal, activeIndex, frames.length || 1);
  const toolButton = draft.activeTool ? modal.querySelector?.(`[data-idp-board-tool="${draft.activeTool}"]`) : null;
  setBoardActiveToolState(modal, toolButton, draft.activeTool || "player");
  updateBoardHistoryButtons(modal);
  restoreBoardDraftFocus(activeRuntime, form, draft.focus);
}

function paint(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root) return;
  ensureClipBankStyles(activeRuntime);
  ensureIdpProfileStyles(activeRuntime);
  const searchFocus = captureSearchFocus(activeRuntime);
  const boardDraft = capturePlayerBoardDraft(activeRuntime);
  root.innerHTML = renderMarkup(activeRuntime.store.getState(), {
    canEdit: canEdit(activeRuntime.context),
    currentUser: activeRuntime.context.currentUser,
    users: activeRuntime.context.users,
    formatUserName: activeRuntime.context.formatUserName,
    team: activeRuntime.context.team,
    teamLogoUrl: activeRuntime.context.teamLogoUrl,
    teamName: activeRuntime.context.teamName,
    exerciseLibraryTemplates: activeRuntime.context.getExerciseLibrary?.() || [],
    renderPlayerProfileScoutingSpider: activeRuntime.context.renderPlayerProfileScoutingSpider,
  });
  restoreSearchFocus(activeRuntime, searchFocus);
  restorePlayerBoardDraft(activeRuntime, boardDraft);
  setupIdpClipPreviewPlayback(activeRuntime);
  updateBoardHistoryButtons(root.querySelector?.(".idp-player-board-modal"));
  bindBoardClipPickerInputEvents(activeRuntime);
}

function ensureRuntime(context = {}) {
  const nextContext = normalizeContext(context);
  if (runtime) {
    Object.assign(runtime.context, nextContext);
    return runtime;
  }
  const store = createIdpStore();
  const api = createIdpApiService(nextContext);
  const actions = createIdpActions({ store, api, context: nextContext });
  runtime = {
    actions,
    api,
    boardDrag: null,
    boardPointerEventsBound: false,
    boardPlaybackTimer: null,
    boardRedoStack: [],
    boardSuppressNextClick: false,
    boardUndoStack: [],
    context: nextContext,
    initialized: false,
    lastSyncCheckAt: 0,
    store,
    syncInFlight: false,
    syncIntervalId: 0,
    syncListening: false,
    syncListeners: null,
  };
  store.subscribe(() => paint(runtime));
  return runtime;
}

async function boot(activeRuntime) {
  if (activeRuntime.initialized) return;
  activeRuntime.initialized = true;
  await activeRuntime.actions.loadDashboard();
  const state = activeRuntime.store.getState();
  const playerId = state.ui.selectedPlayerId || "";
  if (playerId) {
    await activeRuntime.actions.selectPlayer(playerId, { preserveProfileView: true });
  }
}

function setError(error) {
  runtime?.store.setState({
    ui: {
      error: error?.message || "IDP action could not be completed.",
      loading: false,
      message: "",
    },
  });
}

function runAction(action) {
  Promise.resolve()
    .then(action)
    .catch(setError);
}

function clampBoardPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 10) / 10)) : 50;
}

function snapBoardPoint(point = {}, options = {}) {
  return snapTacticalBoardPoint(point, {
    gridSize: options.gridSize ?? IDP_BOARD_GRID_SIZE,
    precision: 1,
  });
}

function boardPointFromEvent(event, pitch) {
  const rect = pitch?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  return snapBoardPoint({
    x: clampBoardPercent(((event.clientX - rect.left) / rect.width) * 100),
    y: clampBoardPercent(((event.clientY - rect.top) / rect.height) * 100),
  });
}

function setBoardFormValue(modal, name, value) {
  const input = modal?.querySelector?.(`[name="${name}"]`);
  if (!input) return;
  input.value = String(value ?? "");
}

function boardFormNumber(modal, name, fallback) {
  const value = Number(modal?.querySelector?.(`[name="${name}"]`)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function boardFormBoolean(modal, name, fallback = true) {
  const input = modal?.querySelector?.(`[name="${name}"]`);
  if (!input) return fallback;
  return String(input.value || "").trim() !== "0";
}

function elementClassTokens(element) {
  return String(element?.getAttribute?.("class") || element?.className || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setElementClass(element, className = "", enabled = true) {
  if (!element || !className) return;
  if (element.classList && typeof element.classList.toggle === "function") {
    element.classList.toggle(className, Boolean(enabled));
    return;
  }
  const tokens = new Set(elementClassTokens(element));
  if (enabled) tokens.add(className);
  if (!enabled) tokens.delete(className);
  element.setAttribute?.("class", Array.from(tokens).join(" "));
}

function setBoardObjectHidden(element, hidden = false) {
  if (!element) return;
  setElementClass(element, "is-board-hidden", hidden);
  if (element.style) element.style.display = hidden ? "none" : "";
  element.setAttribute?.("aria-hidden", hidden ? "true" : "false");
}

function boardConeActive(modal, index = 1) {
  return boardFormBoolean(modal, `cone${index}Active`, true);
}

function setBoardConeActive(modal, index = 1, active = true) {
  setBoardFormValue(modal, `cone${index}Active`, active ? "1" : "0");
  setElementClass(modal, `idp-board-cone-${index}-hidden`, !active);
  const cone = modal && typeof modal.querySelector === "function"
    ? modal.querySelector(`[data-idp-board-cone="${index}"]`)
    : null;
  setBoardObjectHidden(cone, !active);
}

function ensureBoardNotePin(pitch, text = "Coach note") {
  let note = pitch?.querySelector?.(".idp-player-board-note-pin");
  if (note || !pitch) return note;
  const doc = pitch.ownerDocument || getDocument(runtime);
  const svgLayer = pitch.querySelector?.(".idp-tactical-board-notes");
  if (svgLayer && doc?.createElementNS) {
    note = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    note.setAttribute("class", "idp-player-board-note-pin");
    note.setAttribute("data-idp-board-object", "note");
    note.setAttribute("data-idp-board-note", "1");
    note.setAttribute("transform", "translate(12 14)");
    const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "-8");
    rect.setAttribute("y", "-4.2");
    rect.setAttribute("width", "16");
    rect.setAttribute("height", "8.4");
    rect.setAttribute("rx", "1.8");
    const label = doc.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("y", ".45");
    label.textContent = text;
    note.append(rect, label);
    svgLayer.appendChild(note);
    return note;
  }
  note = doc?.createElement?.("span");
  if (!note) return null;
  note.className = "idp-player-board-note-pin";
  note.textContent = text;
  pitch.appendChild(note);
  return note;
}

function setMarkerPosition(marker, point) {
  if (!marker || !point) return;
  if (typeof marker.setAttribute === "function" && marker.namespaceURI === "http://www.w3.org/2000/svg") {
    marker.setAttribute("transform", `translate(${point.x} ${point.y})`);
    marker.dataset.x = String(point.x);
    marker.dataset.y = String(point.y);
    return;
  }
  marker.style.left = `${point.x}%`;
  marker.style.top = `${point.y}%`;
}

function boardLineDasharray(lineStyle = "dashed") {
  if (lineStyle === "solid") return "";
  if (lineStyle === "dotted") return "1 5";
  return "6 4";
}

function boardRenderLineWidth(value, fallback = 2.5) {
  const number = Number(value);
  const logicalWidth = Number.isFinite(number) ? Math.min(6, Math.max(.75, number)) : fallback;
  return Math.min(3.15, Math.max(.16, Math.round(logicalWidth * .52 * 100) / 100));
}

function normalizeBoardArrowType(value = "run") {
  const type = String(value || "run").trim();
  return ["run", "pass", "arrow", "line", "curve"].includes(type) ? type : "run";
}

function boardSvgClamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number * 10) / 10)) : min;
}

function normalizeBoardColor(value = "", fallback = "#38bdf8") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
}

function boardMovementElement(modal) {
  return modal?.querySelector?.(".idp-player-board-arrow-layer .idp-player-board-movement");
}

function boardMovementPoints(modal) {
  return {
    fromX: boardFormNumber(modal, "arrowFromX", boardFormNumber(modal, "playerX", 50)),
    fromY: boardFormNumber(modal, "arrowFromY", boardFormNumber(modal, "playerY", 70)),
    toX: boardFormNumber(modal, "arrowToX", 62),
    toY: boardFormNumber(modal, "arrowToY", 42),
  };
}

function updateBoardMovementHandles(modal) {
  const { fromX, fromY, toX, toY } = boardMovementPoints(modal);
  const fromHandle = modal?.querySelector?.('[data-idp-board-movement-handle="from"]');
  const toHandle = modal?.querySelector?.('[data-idp-board-movement-handle="to"]');
  fromHandle?.setAttribute?.("cx", String(fromX));
  fromHandle?.setAttribute?.("cy", String(fromY));
  toHandle?.setAttribute?.("cx", String(toX));
  toHandle?.setAttribute?.("cy", String(toY));
}

function boardMovementTacticalElement(modal, typeOverride = "") {
  const type = normalizeBoardArrowType(typeOverride || modal?.querySelector?.('[name="arrowType"]')?.value || "run");
  const { fromX, fromY, toX, toY } = boardMovementPoints(modal);
  return {
    id: "arrow-1",
    type,
    x: fromX,
    y: fromY,
    x2: toX,
    y2: toY,
    color: normalizeBoardColor(modal?.querySelector?.('[name="arrowColor"]')?.value || "", type === "pass" ? "#fbbf24" : "#38bdf8"),
    lineStyle: modal?.querySelector?.('[name="arrowLineStyle"]')?.value || (type === "pass" ? "dotted" : type === "run" ? "dashed" : "solid"),
    lineWidth: boardFormNumber(modal, "arrowLineWidth", 2.5),
  };
}

function boardMovementRenderOptions(type = "run") {
  return {
    clamp: boardSvgClamp,
    normalizeColor: normalizeBoardColor,
    getDefaultColor: (candidateType = "arrow") => (candidateType === "pass" ? "#fbbf24" : "#38bdf8"),
    getRenderStrokeWidth: boardRenderLineWidth,
    getStrokeDasharray: boardLineDasharray,
    getDefaultLineStyle: (candidateType = "arrow") => (candidateType === "pass" ? "dotted" : candidateType === "run" ? "dashed" : "solid"),
    getDefaultCurveControlPoint: (from = {}, to = {}) => tacticalBoardDefaultCurveControlPoint(from, to, { bend: type === "run" ? 10 : 13 }),
    getCurveControlPoint: (_element = {}, coordinates = {}) => tacticalBoardDefaultCurveControlPoint(
      { x: coordinates.x, y: coordinates.y },
      { x: coordinates.x2, y: coordinates.y2 },
      { bend: 13 }
    ),
  };
}

function applyBoardMovementIdentity(element, type = "run") {
  if (!element) return;
  const safeType = normalizeBoardArrowType(type);
  element.dataset.idpBoardObject = "movement";
  element.dataset.idpBoardArrowType = safeType;
  element.setAttribute("class", `session-tactical-${safeType} idp-player-board-movement`);
}

function setBoardMovementCoordinates(modal) {
  const element = boardMovementElement(modal);
  const type = normalizeBoardArrowType(modal?.querySelector?.('[name="arrowType"]')?.value || element?.dataset?.idpBoardArrowType || "run");
  if (element) {
    applyBoardMovementIdentity(element, type);
    applyTacticalBoardSvgElementGeometry(
      element,
      boardMovementTacticalElement(modal, type),
      "idp-player-board-editor-arrow",
      boardMovementRenderOptions(type)
    );
  }
  updateBoardMovementHandles(modal);
}

function ensureBoardMovementElement(modal, type = "run") {
  const safeType = normalizeBoardArrowType(type);
  const svg = modal?.querySelector?.(".idp-player-board-arrow-layer");
  const current = boardMovementElement(modal);
  if (!svg) return current;
  const targetTag = getTacticalBoardSvgElementTagName(boardMovementTacticalElement(modal, safeType));
  if (!current) {
    const doc = svg.ownerDocument || getDocument(runtime);
    const next = doc?.createElementNS?.("http://www.w3.org/2000/svg", targetTag);
    if (!next) return null;
    applyBoardMovementIdentity(next, safeType);
    svg.appendChild(next);
    setBoardMovementCoordinates(modal);
    updateBoardArrowStyle(modal);
    return next;
  }
  const currentTag = current.tagName?.toLowerCase?.();
  if (currentTag === targetTag) {
    applyBoardMovementIdentity(current, safeType);
    return current;
  }
  const doc = current.ownerDocument || getDocument(runtime);
  const next = doc?.createElementNS?.("http://www.w3.org/2000/svg", targetTag);
  if (!next) return current;
  applyBoardMovementIdentity(next, safeType);
  current.replaceWith(next);
  setBoardMovementCoordinates(modal);
  return next;
}

function updateBoardArrowStyle(modal) {
  const color = modal?.querySelector?.('[name="arrowColor"]')?.value || "#38bdf8";
  const type = normalizeBoardArrowType(modal?.querySelector?.('[name="arrowType"]')?.value || "run");
  const element = boardMovementElement(modal);
  if (element) {
    applyBoardMovementIdentity(element, type);
    applyTacticalBoardSvgElementGeometry(
      element,
      boardMovementTacticalElement(modal, type),
      "idp-player-board-editor-arrow",
      boardMovementRenderOptions(type)
    );
  }
  modal?.querySelector?.(".idp-player-board-arrow-layer marker path")?.setAttribute?.("fill", color);
  modal?.querySelector?.(".idp-player-board-arrow-layer marker path")?.setAttribute?.("stroke", color);
  modal?.querySelectorAll?.("[data-idp-board-color-choice]")?.forEach((button) => {
    button.classList.toggle("is-active", String(button.dataset.idpBoardColorChoice || "").toLowerCase() === String(color || "").toLowerCase());
  });
}

function captureBoardSnapshot(modal) {
  const snapshot = {};
  BOARD_HISTORY_FIELDS.forEach((name) => {
    snapshot[name] = modal?.querySelector?.(`[name="${name}"]`)?.value ?? "";
  });
  return snapshot;
}

function boardSnapshotsEqual(a = {}, b = {}) {
  return BOARD_HISTORY_FIELDS.every((name) => String(a[name] ?? "") === String(b[name] ?? ""));
}

function boardFormText(modal, name, fallback = "") {
  return String(modal?.querySelector?.(`[name="${name}"]`)?.value || fallback).trim();
}

function boardTokenList(value = "") {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function boardClipAnchorIds(anchor = "") {
  const text = String(anchor || "").trim();
  const beforeTime = text.split("@")[0]?.trim() || "";
  return new Set([
    beforeTime,
    ...text.split(/[\s,;|]+/),
  ].map((item) => item.trim()).filter(Boolean));
}

function updateBoardClipPickerSelection(modal) {
  if (!modal) return;
  const anchor = boardFormText(modal, "frameClipAnchor", "");
  const anchorIds = boardClipAnchorIds(anchor);
  let selectedButton = null;
  modal.querySelectorAll?.("[data-idp-board-clip-pick]")?.forEach((button) => {
    const id = button.dataset.idpBoardClipPick || "";
    const selected = Boolean(id && anchorIds.has(id));
    button.classList.toggle("is-selected", selected);
    if (selected && !selectedButton) selectedButton = button;
  });
  const status = modal.querySelector?.("[data-idp-board-clip-picker-status]");
  const clear = modal.querySelector?.("[data-idp-board-clip-clear]");
  const title = selectedButton?.querySelector?.("strong")?.textContent?.trim?.() || "";
  if (status) status.textContent = title ? `Linked: ${title}` : anchor ? `Linked: ${anchor}` : "No frame clip selected";
  if (clear) clear.hidden = !anchor;
}

function addBoardLinkedClipId(modal, clipId = "") {
  const input = modal?.querySelector?.("[data-idp-board-linked-clip-ids], [name=\"linkedClipIds\"]");
  const id = String(clipId || "").trim();
  if (!input || !id) return;
  const tokens = boardTokenList(input.value || "");
  if (!tokens.includes(id)) tokens.push(id);
  input.value = tokens.slice(0, 12).join(", ");
}

function filterBoardClipPicker(input) {
  const picker = input?.closest?.("[data-idp-board-clip-picker]");
  if (!picker) return;
  const query = String(input.value || "").trim().toLowerCase();
  let visible = 0;
  const buttons = Array.from(picker.querySelectorAll?.("[data-idp-board-clip-pick]") || []);
  buttons.forEach((button) => {
    const searchText = String(button.dataset.idpBoardClipSearch || button.textContent || "").toLowerCase();
    const show = !query || searchText.includes(query);
    button.hidden = !show;
    if (show) visible += 1;
  });
  const empty = picker.querySelector?.("[data-idp-board-clip-picker-empty]");
  const count = picker.querySelector?.("[data-idp-board-clip-picker-count]");
  if (empty) empty.hidden = visible > 0;
  if (count) count.textContent = query ? `${visible}/${buttons.length} shown` : `${buttons.length} clips`;
}

function pickBoardClip(button) {
  const modal = button?.closest?.(".idp-player-board-modal");
  if (!modal) return false;
  const clipId = button.dataset.idpBoardClipPick || "";
  const anchor = button.dataset.idpBoardClipAnchor || clipId;
  stopBoardPlayback(runtime, modal);
  setBoardFormValue(modal, "frameClipAnchor", anchor);
  addBoardLinkedClipId(modal, clipId);
  syncActiveBoardFrameFromModal(modal);
  updateBoardClipPickerSelection(modal);
  return true;
}

function clearBoardClipAnchor(button) {
  const modal = button?.closest?.(".idp-player-board-modal");
  if (!modal) return false;
  stopBoardPlayback(runtime, modal);
  setBoardFormValue(modal, "frameClipAnchor", "");
  syncActiveBoardFrameFromModal(modal);
  updateBoardClipPickerSelection(modal);
  return true;
}

function escapeBoardHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readBoardFrames(modal) {
  const input = modal?.querySelector?.("[data-idp-board-frames]");
  try {
    const parsed = JSON.parse(input?.value || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeBoardFrames(modal, frames = []) {
  const input = modal?.querySelector?.("[data-idp-board-frames]");
  if (!input) return;
  input.value = JSON.stringify(Array.isArray(frames) ? frames.slice(0, 8) : []);
}

function activeBoardFrameIndex(modal, total = 1) {
  const count = Math.max(1, Number(total) || 1);
  const value = Number(modal?.querySelector?.("[data-idp-board-active-frame-index]")?.value);
  return Number.isInteger(value) && value >= 0 && value < count ? value : 0;
}

function setActiveBoardFrameIndex(modal, index = 0, total = 1) {
  const count = Math.max(1, Number(total) || 1);
  const safeIndex = Number.isInteger(Number(index)) ? Math.min(count - 1, Math.max(0, Number(index))) : 0;
  const input = modal?.querySelector?.("[data-idp-board-active-frame-index]");
  if (input) input.value = String(safeIndex);
  modal?.querySelectorAll?.("[data-idp-board-frame-index]")?.forEach((button) => {
    const isActive = Number(button.dataset.idpBoardFrameIndex || 0) === safeIndex;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  modal?.querySelectorAll?.("[data-idp-board-frame-status]")?.forEach((node) => {
    node.textContent = `${safeIndex + 1} / ${count}`;
  });
  modal?.querySelectorAll?.("[data-idp-board-frame-inspector-status]")?.forEach((node) => {
    node.textContent = `${safeIndex + 1} / ${count}`;
  });
}

function boardFrameFromModal(modal, existingFrame = {}, index = 0) {
  const arrowType = boardFormText(modal, "arrowType", "run");
  const arrowLabel = boardFormText(modal, "arrowLabel", "");
  const noteText = boardFormText(modal, "noteText", "");
  const referenceLabel = boardFormText(modal, "referenceLabel", "");
  const zoneLabel = boardFormText(modal, "zoneLabel", "");
  return {
    id: existingFrame.id || `frame-${index + 1}`,
    label: boardFormText(modal, "frameLabel", existingFrame.label || (index === 0 ? "Start" : `Frame ${index + 1}`)),
    coachCue: boardFormText(modal, "frameCoachCue", ""),
    playerCue: boardFormText(modal, "framePlayerCue", ""),
    clipAnchor: boardFormText(modal, "frameClipAnchor", ""),
    player: {
      x: boardFormNumber(modal, "playerX", 50),
      y: boardFormNumber(modal, "playerY", 70),
    },
    referencePlayers: referenceLabel ? [{
      id: existingFrame.referencePlayers?.[0]?.id || "reference-1",
      label: referenceLabel,
      x: boardFormNumber(modal, "referenceX", 50),
      y: boardFormNumber(modal, "referenceY", 44),
    }] : [],
    cones: [1, 2, 3]
      .filter((coneIndex) => boardConeActive(modal, coneIndex))
      .map((coneIndex, activeIndex) => ({
        id: existingFrame.cones?.[activeIndex]?.id || `cone-${activeIndex + 1}`,
        x: boardFormNumber(modal, `cone${coneIndex}X`, coneIndex === 1 ? 40 : coneIndex === 2 ? 60 : 50),
        y: boardFormNumber(modal, `cone${coneIndex}Y`, coneIndex === 3 ? 42 : 58),
      })),
    zones: zoneLabel ? [{
      id: existingFrame.zones?.[0]?.id || "zone-1",
      label: zoneLabel,
      x: boardFormNumber(modal, "zoneX", 34),
      y: boardFormNumber(modal, "zoneY", 28),
      width: boardFormNumber(modal, "zoneWidth", 32),
      height: boardFormNumber(modal, "zoneHeight", 28),
    }] : [],
    arrows: arrowLabel ? [{
      id: existingFrame.arrows?.[0]?.id || "arrow-1",
      type: arrowType,
      label: arrowLabel,
      color: boardFormText(modal, "arrowColor", "#38bdf8"),
      lineStyle: boardFormText(modal, "arrowLineStyle", "dashed"),
      lineWidth: boardFormNumber(modal, "arrowLineWidth", 2.5),
      from: {
        x: boardFormNumber(modal, "arrowFromX", boardFormNumber(modal, "playerX", 50)),
        y: boardFormNumber(modal, "arrowFromY", boardFormNumber(modal, "playerY", 70)),
      },
      to: {
        x: boardFormNumber(modal, "arrowToX", 62),
        y: boardFormNumber(modal, "arrowToY", 42),
      },
    }] : [],
    notes: noteText ? [{
      id: existingFrame.notes?.[0]?.id || "note-1",
      text: noteText,
      x: boardFormNumber(modal, "noteX", 12),
      y: boardFormNumber(modal, "noteY", 14),
    }] : [],
  };
}

function boardSnapshotFromFrame(frame = {}) {
  const player = frame.player || {};
  const reference = frame.referencePlayers?.[0] || {};
  const cones = Array.isArray(frame.cones) ? frame.cones : [];
  const zone = frame.zones?.[0] || {};
  const arrow = frame.arrows?.[0] || {};
  const note = frame.notes?.[0] || {};
  return {
    playerX: player.x ?? 50,
    playerY: player.y ?? 70,
    referenceLabel: reference.label || "",
    referenceX: reference.x ?? 50,
    referenceY: reference.y ?? 44,
    cone1X: cones[0]?.x ?? 40,
    cone1Y: cones[0]?.y ?? 58,
    cone1Active: cones[0] ? "1" : "0",
    cone2X: cones[1]?.x ?? 60,
    cone2Y: cones[1]?.y ?? 58,
    cone2Active: cones[1] ? "1" : "0",
    cone3X: cones[2]?.x ?? 50,
    cone3Y: cones[2]?.y ?? 42,
    cone3Active: cones[2] ? "1" : "0",
    zoneLabel: zone.label || "",
    zoneX: zone.x ?? 34,
    zoneY: zone.y ?? 28,
    zoneWidth: zone.width ?? 32,
    zoneHeight: zone.height ?? 28,
    arrowLabel: arrow.label || "",
    arrowFromX: arrow.from?.x ?? player.x ?? 50,
    arrowFromY: arrow.from?.y ?? player.y ?? 70,
    arrowToX: arrow.to?.x ?? 62,
    arrowToY: arrow.to?.y ?? 42,
    arrowType: arrow.type || "run",
    arrowColor: arrow.color || "#38bdf8",
    arrowLineStyle: arrow.lineStyle || "dashed",
    arrowLineWidth: arrow.lineWidth ?? 2.5,
    noteText: note.text || "",
    noteX: note.x ?? 12,
    noteY: note.y ?? 14,
    frameLabel: frame.label || "Frame",
    frameCoachCue: frame.coachCue || "",
    framePlayerCue: frame.playerCue || "",
    frameClipAnchor: frame.clipAnchor || "",
  };
}

function updateBoardFrameMetaPreview(modal) {
  if (!modal) return;
  const frames = readBoardFrames(modal);
  const index = activeBoardFrameIndex(modal, frames.length || 1);
  const label = boardFormText(modal, "frameLabel", index === 0 ? "Start" : `Frame ${index + 1}`);
  const coachCue = boardFormText(modal, "frameCoachCue", "");
  const playerCue = boardFormText(modal, "framePlayerCue", "");
  const clipAnchor = boardFormText(modal, "frameClipAnchor", "");
  const cue = playerCue || coachCue;
  const title = modal.querySelector?.("[data-idp-board-frame-preview-title]");
  const previewCue = modal.querySelector?.("[data-idp-board-frame-preview-cue]");
  const previewAnchor = modal.querySelector?.("[data-idp-board-frame-preview-anchor]");
  if (title) title.textContent = label || `Frame ${index + 1}`;
  if (previewCue) previewCue.textContent = cue || "No cue on this frame yet";
  if (previewAnchor) previewAnchor.textContent = clipAnchor || "No clip anchor";
  updateBoardClipPickerSelection(modal);
  const button = modal.querySelector?.(`[data-idp-board-frame-index="${index}"]`);
  const buttonLabel = button?.querySelector?.("[data-idp-board-frame-button-label]");
  if (buttonLabel) buttonLabel.textContent = label || `Frame ${index + 1}`;
  if (button) {
    button.classList.toggle("has-cue", Boolean(coachCue || playerCue || clipAnchor));
    button.setAttribute("title", cue || label || `Frame ${index + 1}`);
  }
}

function setBoardFrameApplying(modal, value = false) {
  if (!modal?.dataset) return;
  if (value) {
    modal.dataset.idpBoardApplyingFrame = "1";
    return;
  }
  delete modal.dataset.idpBoardApplyingFrame;
}

function clearBoardFrameApplyingSoon(modal) {
  const win = runtime?.context?.win || globalThis;
  const clear = () => setBoardFrameApplying(modal, false);
  if (typeof win.setTimeout === "function") {
    win.setTimeout(clear, 0);
    return;
  }
  clear();
}

function updateBoardZoneVisual(modal) {
  const zone = modal?.querySelector?.(".idp-player-board-zone");
  if (!zone) return;
  const x = boardFormNumber(modal, "zoneX", 34);
  const y = boardFormNumber(modal, "zoneY", 28);
  const width = boardFormNumber(modal, "zoneWidth", 32);
  const height = boardFormNumber(modal, "zoneHeight", 28);
  const zoneElement = {
    id: "zone-1",
    type: "zone",
    x,
    y,
    x2: clampBoardPercent(x + width),
    y2: clampBoardPercent(y + height),
    color: "#10b981",
    lineStyle: "dashed",
    lineWidth: 1.2,
  };
  if (zone.namespaceURI === "http://www.w3.org/2000/svg") {
    applyTacticalBoardSvgElementGeometry(zone, zoneElement, "idp-player-board-editor-arrow", {
      clamp: boardSvgClamp,
      normalizeColor: normalizeBoardColor,
      getDefaultColor: () => "#10b981",
      getRenderStrokeWidth: boardRenderLineWidth,
      getStrokeDasharray: boardLineDasharray,
      getDefaultLineStyle: () => "dashed",
    });
    const rectX = Math.min(zoneElement.x, zoneElement.x2);
    const rectY = Math.min(zoneElement.y, zoneElement.y2);
    const rectWidth = Math.max(Math.abs(zoneElement.x2 - zoneElement.x), 4);
    const rectHeight = Math.max(Math.abs(zoneElement.y2 - zoneElement.y), 4);
    const label = modal.querySelector?.('[data-idp-board-zone-label="1"]');
    label?.setAttribute?.("x", String(clampBoardPercent(rectX + rectWidth / 2)));
    label?.setAttribute?.("y", String(clampBoardPercent(rectY + rectHeight / 2)));
    return;
  }
  zone.style.left = `${x}%`;
  zone.style.top = `${y}%`;
  zone.style.width = `${width}%`;
  zone.style.height = `${height}%`;
}

function updateBoardNoteVisual(modal) {
  const note = modal?.querySelector?.(".idp-player-board-note-pin");
  if (!note) return;
  const point = {
    x: boardFormNumber(modal, "noteX", 12),
    y: boardFormNumber(modal, "noteY", 14),
  };
  setMarkerPosition(note, point);
  const text = modal.querySelector?.('[name="noteText"]')?.value || "Coach note";
  const label = note.querySelector?.("text");
  if (label) label.textContent = text.slice(0, 18);
  if (!label) note.textContent = text;
}

function refreshBoardObjectVisibility(modal) {
  if (!modal) return;
  const referenceHidden = !boardFormText(modal, "referenceLabel", "");
  setElementClass(modal, "idp-board-reference-hidden", referenceHidden);
  setBoardObjectHidden(modal.querySelector?.(".idp-player-board-reference"), referenceHidden);
  [1, 2, 3].forEach((index) => setBoardConeActive(modal, index, boardConeActive(modal, index)));
  const zoneHidden = !boardFormText(modal, "zoneLabel", "");
  setElementClass(modal, "idp-board-zone-hidden", zoneHidden);
  setBoardObjectHidden(modal.querySelector?.(".idp-player-board-zone"), zoneHidden);
  setBoardObjectHidden(modal.querySelector?.('[data-idp-board-zone-label="1"]'), zoneHidden);
  const movementHidden = !boardFormText(modal, "arrowLabel", "");
  setElementClass(modal, "idp-board-movement-hidden", movementHidden);
  setBoardObjectHidden(modal.querySelector?.(".idp-player-board-movement"), movementHidden);
  modal.querySelectorAll?.("[data-idp-board-movement-handle]")?.forEach((handle) => {
    setBoardObjectHidden(handle, movementHidden);
  });
  const noteHidden = !boardFormText(modal, "noteText", "");
  setElementClass(modal, "idp-board-note-hidden", noteHidden);
  setBoardObjectHidden(modal.querySelector?.(".idp-player-board-note-pin"), noteHidden);
}

function applyBoardSnapshot(modal, snapshot = {}) {
  BOARD_HISTORY_FIELDS.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(snapshot, name)) {
      setBoardFormValue(modal, name, snapshot[name]);
    }
  });
  setMarkerPosition(modal?.querySelector?.(".idp-player-board-player"), {
    x: boardFormNumber(modal, "playerX", 50),
    y: boardFormNumber(modal, "playerY", 70),
  });
  setMarkerPosition(modal?.querySelector?.(".idp-player-board-reference"), {
    x: boardFormNumber(modal, "referenceX", 50),
    y: boardFormNumber(modal, "referenceY", 44),
  });
  [1, 2, 3].forEach((index) => {
    setMarkerPosition(modal?.querySelector?.(`[data-idp-board-cone="${index}"]`), {
      x: boardFormNumber(modal, `cone${index}X`, 50),
      y: boardFormNumber(modal, `cone${index}Y`, 50),
    });
  });
  ensureBoardMovementElement(modal, modal?.querySelector?.('[name="arrowType"]')?.value || "run");
  setBoardMovementCoordinates(modal);
  updateBoardArrowStyle(modal);
  updateBoardZoneVisual(modal);
  updateBoardNoteVisual(modal);
  refreshBoardObjectVisibility(modal);
  updateBoardFrameMetaPreview(modal);
  updateBoardLayerList(modal);
}

function syncActiveBoardFrameFromModal(modal) {
  if (!modal) return [];
  const safeFrames = captureBoardFramesFromModal(modal);
  const index = activeBoardFrameIndex(modal, safeFrames.length || 1);
  writeBoardFrames(modal, safeFrames);
  setActiveBoardFrameIndex(modal, index, safeFrames.length);
  updateBoardFrameMetaPreview(modal);
  updateBoardLayerList(modal);
  return safeFrames;
}

function captureBoardFramesFromModal(modal) {
  if (!modal) return [];
  const frames = readBoardFrames(modal);
  const index = activeBoardFrameIndex(modal, frames.length || 1);
  const safeFrames = frames.length ? frames : [boardFrameFromModal(modal, {}, 0)];
  safeFrames[index] = boardFrameFromModal(modal, safeFrames[index], index);
  return safeFrames;
}

function applyBoardFrameToModal(modal, frame = {}, index = 0) {
  if (!modal) return;
  setBoardFrameApplying(modal, true);
  setActiveBoardFrameIndex(modal, index, readBoardFrames(modal).length || 1);
  applyBoardSnapshot(modal, boardSnapshotFromFrame(frame));
  setActiveBoardFrameIndex(modal, index, readBoardFrames(modal).length || 1);
  modal.querySelectorAll?.("[data-idp-board-color-choice]")?.forEach((button) => {
    button.classList.toggle("is-active", String(button.dataset.idpBoardColorChoice || "").toLowerCase() === boardFormText(modal, "arrowColor", "").toLowerCase());
  });
  updateBoardFrameMetaPreview(modal);
  updateBoardLayerList(modal);
  clearBoardFrameApplyingSoon(modal);
}

function selectBoardFrame(modal, index = 0) {
  if (!modal) return false;
  stopBoardPlayback(runtime, modal);
  const frames = syncActiveBoardFrameFromModal(modal);
  const safeIndex = activeBoardFrameIndex({ querySelector: () => ({ value: String(index) }) }, frames.length);
  writeBoardFrames(modal, frames);
  setActiveBoardFrameIndex(modal, safeIndex, frames.length);
  applyBoardFrameToModal(modal, frames[safeIndex], safeIndex);
  writeBoardFrames(modal, frames);
  setActiveBoardFrameIndex(modal, safeIndex, frames.length);
  resetBoardHistory(runtime);
  updateBoardHistoryButtons(modal);
  return true;
}

function boardFrameButtonHtml(frame = {}, index = 0, activeIndex = 0) {
  const label = frame.label || `Frame ${index + 1}`;
  const cue = frame.playerCue || frame.coachCue || "";
  const hasCue = Boolean(frame.coachCue || frame.playerCue || frame.clipAnchor);
  return `
    <button
      type="button"
      class="session-tacticalboard-frame idp-player-board-frame${index === activeIndex ? " is-active" : ""}${hasCue ? " has-cue" : ""}"
      data-idp-board-frame-index="${index}"
      aria-pressed="${index === activeIndex ? "true" : "false"}"
      title="${escapeBoardHtml(cue || label)}"
    >
      <strong>${index + 1}</strong>
      <span data-idp-board-frame-button-label>${escapeBoardHtml(label)}</span>
    </button>
  `;
}

function rebuildBoardFrameButtons(modal, frames = [], activeIndex = 0) {
  const list = modal?.querySelector?.(".idp-player-board-frame-list");
  if (!list) return;
  list.innerHTML = frames.map((frame, index) => boardFrameButtonHtml(frame, index, activeIndex)).join("");
  setActiveBoardFrameIndex(modal, activeIndex, frames.length || 1);
}

function addBoardFrame(modal, duplicateActive = false) {
  if (!modal) return false;
  stopBoardPlayback(runtime, modal);
  const frames = captureBoardFramesFromModal(modal);
  if (frames.length >= 8) return false;
  const currentIndex = activeBoardFrameIndex(modal, frames.length || 1);
  const source = frames[currentIndex] || boardFrameFromModal(modal, {}, currentIndex);
  const nextIndex = frames.length;
  const nextFrame = {
    ...(source || {}),
    id: `frame-${nextIndex + 1}`,
    label: duplicateActive ? `${source?.label || `Frame ${currentIndex + 1}`} copy` : `Frame ${nextIndex + 1}`,
    coachCue: duplicateActive ? source?.coachCue || "" : "",
    playerCue: duplicateActive ? source?.playerCue || "" : "",
    clipAnchor: duplicateActive ? source?.clipAnchor || "" : "",
  };
  const nextFrames = [...frames, nextFrame].slice(0, 8);
  writeBoardFrames(modal, nextFrames);
  rebuildBoardFrameButtons(modal, nextFrames, nextIndex);
  applyBoardFrameToModal(modal, nextFrame, nextIndex);
  writeBoardFrames(modal, nextFrames);
  setActiveBoardFrameIndex(modal, nextIndex, nextFrames.length);
  resetBoardHistory(runtime);
  updateBoardHistoryButtons(modal);
  return true;
}

function setBoardPlaybackState(modal, isPlaying = false) {
  const playButton = modal?.querySelector?.("[data-idp-board-play]");
  const stopButton = modal?.querySelector?.("[data-idp-board-stop]");
  if (playButton) playButton.hidden = isPlaying;
  if (stopButton) stopButton.hidden = !isPlaying;
}

function stopBoardPlayback(activeRuntime = runtime, modal = null) {
  if (activeRuntime?.boardPlaybackTimer) {
    clearInterval(activeRuntime.boardPlaybackTimer);
    activeRuntime.boardPlaybackTimer = null;
  }
  setBoardPlaybackState(modal || getRoot(activeRuntime?.context)?.querySelector?.(".idp-player-board-modal"), false);
}

function playerBoardPreviewFrameCount(activeRuntime = runtime) {
  const state = activeRuntime?.store?.getState?.() || {};
  const detail = state.playerDetail || {};
  const interventions = Array.isArray(detail.interventions)
    ? detail.interventions.filter((item) => item.status !== "archived")
    : [];
  const selectedId = state.ui?.playerBoardInterventionId || "";
  const intervention = interventions.find((item) => item.id && item.id === selectedId) || interventions[0] || null;
  const frames = intervention?.boardState?.frames;
  return Math.max(1, Array.isArray(frames) && frames.length ? frames.length : 1);
}

function normalizePlayerBoardPreviewFrame(value = 0, total = 1) {
  const count = Math.max(1, Number(total) || 1);
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

function stopPlayerBoardPreviewPlayback(activeRuntime = runtime, options = {}) {
  if (activeRuntime?.playerBoardPreviewTimer) {
    clearInterval(activeRuntime.playerBoardPreviewTimer);
    activeRuntime.playerBoardPreviewTimer = null;
  }
  if (options.updateState === false) return;
  activeRuntime?.store?.setState?.({ ui: { playerBoardPreviewPlaying: false } });
}

function setPlayerBoardPreviewFrame(activeRuntime = runtime, index = 0, options = {}) {
  if (options.stopPlayback !== false) {
    stopPlayerBoardPreviewPlayback(activeRuntime, { updateState: false });
  }
  const count = playerBoardPreviewFrameCount(activeRuntime);
  activeRuntime?.store?.setState?.({
    ui: {
      playerBoardPreviewFrameIndex: normalizePlayerBoardPreviewFrame(index, count),
      playerBoardPreviewPlaying: options.playing === true,
    },
  });
}

function playPlayerBoardPreviewFrames(activeRuntime = runtime) {
  const count = playerBoardPreviewFrameCount(activeRuntime);
  if (count <= 1) return false;
  stopPlayerBoardPreviewPlayback(activeRuntime, { updateState: false });
  const win = activeRuntime?.context?.win || globalThis;
  if (typeof win.setInterval !== "function") return false;
  activeRuntime?.store?.setState?.({ ui: { playerBoardPreviewPlaying: true } });
  activeRuntime.playerBoardPreviewTimer = win.setInterval(() => {
    const state = activeRuntime?.store?.getState?.() || {};
    const nextCount = playerBoardPreviewFrameCount(activeRuntime);
    if (nextCount <= 1 || state.ui?.profileView !== "player-board" || state.ui?.playerBoardOpen) {
      stopPlayerBoardPreviewPlayback(activeRuntime);
      return;
    }
    const current = normalizePlayerBoardPreviewFrame(state.ui?.playerBoardPreviewFrameIndex, nextCount);
    activeRuntime?.store?.setState?.({
      ui: {
        playerBoardPreviewFrameIndex: (current + 1) % nextCount,
        playerBoardPreviewPlaying: true,
      },
    });
  }, 1200);
  return true;
}

function playBoardFrames(activeRuntime = runtime, modal) {
  if (!modal) return false;
  const frames = syncActiveBoardFrameFromModal(modal);
  if (frames.length < 2) return false;
  stopBoardPlayback(activeRuntime, modal);
  let index = activeBoardFrameIndex(modal, frames.length);
  setBoardPlaybackState(modal, true);
  activeRuntime.boardPlaybackTimer = setInterval(() => {
    index = (index + 1) % frames.length;
    setActiveBoardFrameIndex(modal, index, frames.length);
    applyBoardFrameToModal(modal, frames[index], index);
    writeBoardFrames(modal, frames);
    setActiveBoardFrameIndex(modal, index, frames.length);
  }, 900);
  return true;
}

function updateBoardHistoryButtons(modal) {
  const undoButton = modal?.querySelector?.("[data-idp-board-undo]");
  const redoButton = modal?.querySelector?.("[data-idp-board-redo]");
  if (undoButton) undoButton.disabled = !(runtime?.boardUndoStack?.length);
  if (redoButton) redoButton.disabled = !(runtime?.boardRedoStack?.length);
}

function resetBoardHistory(activeRuntime = runtime) {
  if (!activeRuntime) return;
  activeRuntime.boardUndoStack = [];
  activeRuntime.boardRedoStack = [];
}

function pushBoardHistory(activeRuntime = runtime, modal, before = null, after = null) {
  if (!activeRuntime || !modal || !before || !after || boardSnapshotsEqual(before, after)) return;
  activeRuntime.boardUndoStack = [...(activeRuntime.boardUndoStack || []), before].slice(-40);
  activeRuntime.boardRedoStack = [];
  updateBoardHistoryButtons(modal);
}

function undoBoardHistory(activeRuntime = runtime, modal) {
  const previous = activeRuntime?.boardUndoStack?.pop?.();
  if (!previous || !modal) return false;
  activeRuntime.boardRedoStack = [...(activeRuntime.boardRedoStack || []), captureBoardSnapshot(modal)].slice(-40);
  applyBoardSnapshot(modal, previous);
  syncActiveBoardFrameFromModal(modal);
  updateBoardHistoryButtons(modal);
  return true;
}

function redoBoardHistory(activeRuntime = runtime, modal) {
  const next = activeRuntime?.boardRedoStack?.pop?.();
  if (!next || !modal) return false;
  activeRuntime.boardUndoStack = [...(activeRuntime.boardUndoStack || []), captureBoardSnapshot(modal)].slice(-40);
  applyBoardSnapshot(modal, next);
  syncActiveBoardFrameFromModal(modal);
  updateBoardHistoryButtons(modal);
  return true;
}

function boardObjectLabel(object) {
  const type = object?.dataset?.idpBoardObject || "";
  if (type === "player") return "Player marker";
  if (type === "reference") return "Reference player";
  if (type === "cone") return `Cone ${object?.dataset?.idpBoardCone || 1}`;
  if (type === "zone") return "Development zone";
  if (type === "movement-from") return "Movement start";
  if (type === "movement-to") return "Movement end";
  if (type === "movement") return "Movement path";
  if (type === "note") return "Coach note";
  return "Board object";
}

function boardObjectKey(object) {
  const type = object?.dataset?.idpBoardObject || "";
  if (type === "player") return "player";
  if (type === "reference") return "reference:1";
  if (type === "cone") return `cone:${object?.dataset?.idpBoardCone || 1}`;
  if (type === "zone") return `zone:${object?.dataset?.idpBoardZone || 1}`;
  if (type === "movement" || type === "movement-from" || type === "movement-to") {
    return `movement:${object?.dataset?.idpBoardArrow || 1}`;
  }
  if (type === "note") return `note:${object?.dataset?.idpBoardNote || 1}`;
  return "";
}

function boardObjectForKey(modal, key = "") {
  const [type, rawIndex = "1"] = String(key || "").split(":");
  const index = Number(rawIndex) || 1;
  if (type === "player") return modal?.querySelector?.(".idp-player-board-player");
  if (type === "reference") return modal?.querySelector?.(".idp-player-board-reference");
  if (type === "cone") return modal?.querySelector?.(`[data-idp-board-cone="${index}"]`);
  if (type === "zone") return modal?.querySelector?.(`[data-idp-board-zone="${index}"]`) || modal?.querySelector?.(".idp-player-board-zone");
  if (type === "movement") return modal?.querySelector?.(`[data-idp-board-object="movement"][data-idp-board-arrow="${index}"]`) || boardMovementElement(modal);
  if (type === "note") return modal?.querySelector?.(`[data-idp-board-note="${index}"]`);
  return null;
}

function selectedBoardObject(modal) {
  return modal?.querySelector?.("[data-idp-board-object].is-selected")
    || modal?.querySelector?.(".idp-player-board-player")
    || null;
}

function boardObjectPoint(modal, object) {
  const type = object?.dataset?.idpBoardObject || "";
  if (type === "player") {
    return { x: boardFormNumber(modal, "playerX", 50), y: boardFormNumber(modal, "playerY", 70) };
  }
  if (type === "reference") {
    return { x: boardFormNumber(modal, "referenceX", 50), y: boardFormNumber(modal, "referenceY", 44) };
  }
  if (type === "cone") {
    const coneIndex = Number(object.dataset?.idpBoardCone || 1);
    const safeIndex = [1, 2, 3].includes(coneIndex) ? coneIndex : 1;
    return {
      x: boardFormNumber(modal, `cone${safeIndex}X`, safeIndex === 1 ? 40 : safeIndex === 2 ? 60 : 50),
      y: boardFormNumber(modal, `cone${safeIndex}Y`, safeIndex === 3 ? 42 : 58),
    };
  }
  if (type === "zone") {
    const x = boardFormNumber(modal, "zoneX", 34);
    const y = boardFormNumber(modal, "zoneY", 28);
    return {
      x: clampBoardPercent(x + boardFormNumber(modal, "zoneWidth", 32) / 2),
      y: clampBoardPercent(y + boardFormNumber(modal, "zoneHeight", 28) / 2),
    };
  }
  if (type === "movement-from") {
    return {
      x: boardFormNumber(modal, "arrowFromX", boardFormNumber(modal, "playerX", 50)),
      y: boardFormNumber(modal, "arrowFromY", boardFormNumber(modal, "playerY", 70)),
    };
  }
  if (type === "movement-to") {
    return { x: boardFormNumber(modal, "arrowToX", 62), y: boardFormNumber(modal, "arrowToY", 42) };
  }
  if (type === "movement") {
    const { fromX, fromY, toX, toY } = boardMovementPoints(modal);
    return { x: clampBoardPercent((fromX + toX) / 2), y: clampBoardPercent((fromY + toY) / 2) };
  }
  if (type === "note") {
    return { x: boardFormNumber(modal, "noteX", 12), y: boardFormNumber(modal, "noteY", 14) };
  }
  return null;
}

function boardPointLabel(point = null) {
  if (!point) return "--";
  return `${Math.round(Number(point.x) || 0)} / ${Math.round(Number(point.y) || 0)}`;
}

function escapeBoardAttribute(value = "") {
  return escapeBoardHtml(value).replace(/`/g, "&#096;");
}

function boardLayerEntriesFromModal(modal) {
  const entries = [{
    canDelete: false,
    canDuplicate: false,
    detail: boardPointLabel(boardObjectPoint(modal, modal?.querySelector?.(".idp-player-board-player"))),
    key: "player",
    label: "Player marker",
    meta: "Player",
  }];
  if (boardFormText(modal, "referenceLabel", "")) {
    entries.push({
      canDelete: true,
      canDuplicate: false,
      detail: boardPointLabel(boardObjectPoint(modal, modal?.querySelector?.(".idp-player-board-reference"))),
      key: "reference:1",
      label: boardFormText(modal, "referenceLabel", "Reference"),
      meta: "Reference",
    });
  }
  if (boardFormText(modal, "arrowLabel", "")) {
    entries.push({
      canDelete: true,
      canDuplicate: false,
      detail: normalizeBoardArrowType(modal?.querySelector?.('[name="arrowType"]')?.value || "run"),
      key: "movement:1",
      label: boardFormText(modal, "arrowLabel", "Movement path"),
      meta: "Movement",
    });
  }
  if (boardFormText(modal, "zoneLabel", "")) {
    entries.push({
      canDelete: true,
      canDuplicate: false,
      detail: boardPointLabel(boardObjectPoint(modal, modal?.querySelector?.(".idp-player-board-zone"))),
      key: "zone:1",
      label: boardFormText(modal, "zoneLabel", "Development zone"),
      meta: "Zone",
    });
  }
  const activeConeIndexes = [1, 2, 3].filter((index) => boardConeActive(modal, index));
  activeConeIndexes.forEach((index) => {
    entries.push({
      canDelete: true,
      canDuplicate: activeConeIndexes.length < 3,
      detail: boardPointLabel(boardObjectPoint(modal, modal?.querySelector?.(`[data-idp-board-cone="${index}"]`))),
      key: `cone:${index}`,
      label: `Cone ${index}`,
      meta: "Cone",
    });
  });
  if (boardFormText(modal, "noteText", "")) {
    entries.push({
      canDelete: true,
      canDuplicate: false,
      detail: boardPointLabel(boardObjectPoint(modal, modal?.querySelector?.(".idp-player-board-note-pin"))),
      key: "note:1",
      label: boardFormText(modal, "noteText", "Coach note"),
      meta: "Note",
    });
  }
  return entries;
}

function boardLayerItemHtml(entry = {}, selectedKey = "player") {
  const isSelected = entry.key === selectedKey;
  return `
    <article class="idp-board-layer-item${isSelected ? " is-selected" : ""}" data-idp-board-layer-item="${escapeBoardAttribute(entry.key)}">
      <button type="button" class="idp-board-layer-select" data-idp-board-layer-select="${escapeBoardAttribute(entry.key)}" aria-pressed="${isSelected ? "true" : "false"}">
        <span class="idp-board-layer-glyph" aria-hidden="true">${escapeBoardHtml(String(entry.meta || "Obj").slice(0, 2).toUpperCase())}</span>
        <span class="idp-board-layer-copy">
          <strong>${escapeBoardHtml(entry.label || "Board object")}</strong>
          <small>${escapeBoardHtml(entry.meta || "Object")} · ${escapeBoardHtml(entry.detail || "--")}</small>
        </span>
      </button>
      <span class="idp-board-layer-actions">
        <button type="button" ${entry.canDuplicate ? "" : "disabled"} data-idp-board-object-duplicate="${escapeBoardAttribute(entry.key)}">Copy</button>
        <button type="button" ${entry.canDelete ? "" : "disabled"} data-idp-board-object-delete="${escapeBoardAttribute(entry.key)}">Delete</button>
      </span>
    </article>
  `;
}

function updateBoardLayerSelection(modal) {
  if (!modal) return;
  const selectedKey = modal.dataset?.idpBoardSelectedObjectKey || boardObjectKey(selectedBoardObject(modal)) || "player";
  modal.querySelectorAll?.("[data-idp-board-layer-item]")?.forEach((item) => {
    const isSelected = item.dataset.idpBoardLayerItem === selectedKey;
    item.classList.toggle("is-selected", isSelected);
    item.querySelector?.("[data-idp-board-layer-select]")?.setAttribute?.("aria-pressed", isSelected ? "true" : "false");
  });
}

function updateBoardLayerList(modal) {
  if (!modal) return;
  const list = modal.querySelector?.("[data-idp-board-layer-list]");
  if (!list) return;
  const selectedKey = modal.dataset?.idpBoardSelectedObjectKey || boardObjectKey(selectedBoardObject(modal)) || "player";
  const entries = boardLayerEntriesFromModal(modal);
  list.innerHTML = entries.map((entry) => boardLayerItemHtml(entry, selectedKey)).join("");
  const count = modal.querySelector?.("[data-idp-board-layer-count]");
  if (count) count.textContent = `${entries.length} objects`;
}

function updateBoardSelectedObjectMeta(modal, object = selectedBoardObject(modal)) {
  if (!modal) return;
  const label = boardObjectLabel(object);
  const point = boardObjectPoint(modal, object);
  if (modal.dataset) modal.dataset.idpBoardSelectedObjectKey = boardObjectKey(object) || "player";
  modal.querySelectorAll?.("[data-idp-board-selected-object]")?.forEach((node) => {
    node.textContent = label;
  });
  modal.querySelectorAll?.("[data-idp-board-selected-position]")?.forEach((node) => {
    node.textContent = boardPointLabel(point);
  });
  modal.querySelectorAll?.("[data-idp-board-precision-state]")?.forEach((node) => {
    node.textContent = `${IDP_BOARD_GRID_SIZE}%`;
  });
  updateBoardLayerSelection(modal);
}

function selectBoardObject(modal, object) {
  if (!modal || !object) return;
  modal.querySelectorAll?.("[data-idp-board-object].is-selected")?.forEach((node) => {
    setElementClass(node, "is-selected", false);
  });
  setElementClass(object, "is-selected", true);
  if (["movement", "movement-from", "movement-to"].includes(object.dataset?.idpBoardObject || "")) {
    setElementClass(modal.querySelector?.(".idp-player-board-movement"), "is-selected", true);
  }
  updateBoardSelectedObjectMeta(modal, object);
}

function selectBoardObjectByKey(modal, key = "") {
  const object = boardObjectForKey(modal, key);
  if (!modal || !object) return false;
  selectBoardObject(modal, object);
  return true;
}

function nextAvailableConeIndex(modal) {
  return [1, 2, 3].find((index) => !boardConeActive(modal, index)) || 0;
}

function deleteBoardObjectByKey(modal, key = "") {
  if (!modal || !key || key === "player") return false;
  const [type, rawIndex = "1"] = String(key).split(":");
  const index = Number(rawIndex) || 1;
  if (type === "reference") {
    setBoardFormValue(modal, "referenceLabel", "");
  } else if (type === "cone") {
    setBoardConeActive(modal, index, false);
  } else if (type === "zone") {
    setBoardFormValue(modal, "zoneLabel", "");
  } else if (type === "movement") {
    setBoardFormValue(modal, "arrowLabel", "");
    delete modal.dataset.idpBoardArrowStart;
  } else if (type === "note") {
    setBoardFormValue(modal, "noteText", "");
  } else {
    return false;
  }
  refreshBoardObjectVisibility(modal);
  selectBoardObjectByKey(modal, "player");
  updateBoardLayerList(modal);
  return true;
}

function duplicateBoardObjectByKey(modal, key = "") {
  if (!modal || !key) return false;
  const [type, rawIndex = "1"] = String(key).split(":");
  if (type !== "cone") return false;
  const sourceIndex = Number(rawIndex) || 1;
  if (!boardConeActive(modal, sourceIndex)) return false;
  const targetIndex = nextAvailableConeIndex(modal);
  if (!targetIndex) return false;
  const sourcePoint = {
    x: boardFormNumber(modal, `cone${sourceIndex}X`, sourceIndex === 1 ? 40 : sourceIndex === 2 ? 60 : 50),
    y: boardFormNumber(modal, `cone${sourceIndex}Y`, sourceIndex === 3 ? 42 : 58),
  };
  const targetPoint = offsetTacticalBoardPoint(sourcePoint, { x: 4, y: 4 }, { gridSize: IDP_BOARD_GRID_SIZE, precision: 1 });
  setBoardFormValue(modal, `cone${targetIndex}X`, targetPoint.x);
  setBoardFormValue(modal, `cone${targetIndex}Y`, targetPoint.y);
  setBoardConeActive(modal, targetIndex, true);
  setMarkerPosition(modal.querySelector?.(`[data-idp-board-cone="${targetIndex}"]`), targetPoint);
  refreshBoardObjectVisibility(modal);
  selectBoardObjectByKey(modal, `cone:${targetIndex}`);
  updateBoardLayerList(modal);
  return true;
}

function mutateBoardObjectLayer(modal, key = "", mutation = "select") {
  if (!modal || !key) return false;
  if (mutation === "select") return selectBoardObjectByKey(modal, key);
  stopBoardPlayback(runtime, modal);
  const before = captureBoardSnapshot(modal);
  const changed = mutation === "duplicate"
    ? duplicateBoardObjectByKey(modal, key)
    : deleteBoardObjectByKey(modal, key);
  if (!changed) return false;
  pushBoardHistory(runtime, modal, before, captureBoardSnapshot(modal));
  syncActiveBoardFrameFromModal(modal);
  return true;
}

function movementDragHandleForPoint(modal, point) {
  const { fromX, fromY, toX, toY } = boardMovementPoints(modal);
  const fromDistance = Math.hypot(point.x - fromX, point.y - fromY);
  const toDistance = Math.hypot(point.x - toX, point.y - toY);
  return fromDistance < toDistance ? "from" : "to";
}

function boardObjectForPointer(modal, object, point) {
  const type = object?.dataset?.idpBoardObject || "";
  if (!modal || !object || !point || type !== "movement-from") return object;
  const playerX = boardFormNumber(modal, "playerX", 50);
  const playerY = boardFormNumber(modal, "playerY", 70);
  if (Math.hypot(point.x - playerX, point.y - playerY) <= 6) {
    return modal.querySelector?.(".idp-player-board-player") || object;
  }
  return object;
}

function setBoardObjectPoint(modal, pitch, object, point) {
  if (!modal || !pitch || !object || !point) return false;
  const type = object.dataset?.idpBoardObject || "";
  const markChanged = () => {
    updateBoardSelectedObjectMeta(modal, object);
    return true;
  };
  if (type === "player") {
    setBoardFormValue(modal, "playerX", point.x);
    setBoardFormValue(modal, "playerY", point.y);
    setMarkerPosition(modal.querySelector(".idp-player-board-player"), point);
    return markChanged();
  }
  if (type === "reference") {
    setBoardFormValue(modal, "referenceX", point.x);
    setBoardFormValue(modal, "referenceY", point.y);
    setMarkerPosition(modal.querySelector(".idp-player-board-reference"), point);
    return markChanged();
  }
  if (type === "cone") {
    const coneIndex = Number(object.dataset?.idpBoardCone || 1);
    const safeIndex = [1, 2, 3].includes(coneIndex) ? coneIndex : 1;
    setBoardFormValue(modal, `cone${safeIndex}X`, point.x);
    setBoardFormValue(modal, `cone${safeIndex}Y`, point.y);
    setMarkerPosition(modal.querySelector(`[data-idp-board-cone="${safeIndex}"]`), point);
    return markChanged();
  }
  if (type === "zone") {
    const width = boardFormNumber(modal, "zoneWidth", 32);
    const height = boardFormNumber(modal, "zoneHeight", 28);
    setBoardFormValue(modal, "zoneX", clampBoardPercent(point.x - width / 2));
    setBoardFormValue(modal, "zoneY", clampBoardPercent(point.y - height / 2));
    updateBoardZoneVisual(modal);
    return markChanged();
  }
  if (type === "movement-from" || (type === "movement" && modal.dataset.idpBoardMovementDragHandle === "from")) {
    setBoardFormValue(modal, "arrowFromX", point.x);
    setBoardFormValue(modal, "arrowFromY", point.y);
    setBoardMovementCoordinates(modal);
    return markChanged();
  }
  if (type === "movement-to" || type === "movement") {
    setBoardFormValue(modal, "arrowToX", point.x);
    setBoardFormValue(modal, "arrowToY", point.y);
    setBoardMovementCoordinates(modal);
    return markChanged();
  }
  if (type === "note") {
    setBoardFormValue(modal, "noteX", point.x);
    setBoardFormValue(modal, "noteY", point.y);
    updateBoardNoteVisual(modal);
    return markChanged();
  }
  return false;
}

function nudgeBoardObject(modal, object, delta = {}) {
  const pitch = modal?.querySelector?.("[data-idp-board-editor-pitch]");
  if (!modal || !pitch || !object || !delta) return false;
  const type = object.dataset?.idpBoardObject || "";
  const snapOptions = { gridSize: IDP_BOARD_GRID_SIZE, precision: 1 };
  if (type === "movement") {
    const { fromX, fromY, toX, toY } = boardMovementPoints(modal);
    const nextFrom = offsetTacticalBoardPoint({ x: fromX, y: fromY }, delta, snapOptions);
    const nextTo = offsetTacticalBoardPoint({ x: toX, y: toY }, delta, snapOptions);
    setBoardFormValue(modal, "arrowFromX", nextFrom.x);
    setBoardFormValue(modal, "arrowFromY", nextFrom.y);
    setBoardFormValue(modal, "arrowToX", nextTo.x);
    setBoardFormValue(modal, "arrowToY", nextTo.y);
    setBoardMovementCoordinates(modal);
    updateBoardSelectedObjectMeta(modal, object);
    return true;
  }
  const current = boardObjectPoint(modal, object);
  if (!current) return false;
  const next = offsetTacticalBoardPoint(current, delta, snapOptions);
  return setBoardObjectPoint(modal, pitch, object, next);
}

function setBoardArrowPreset(modal, tool = "arrow") {
  if (!modal || !["run", "pass", "arrow", "line", "curve"].includes(tool)) return;
  const arrowType = modal.querySelector?.('[name="arrowType"]');
  const arrowLabel = modal.querySelector?.('[name="arrowLabel"]');
  const lineStyle = modal.querySelector?.('[name="arrowLineStyle"]');
  const preset = {
    run: { label: "Run", lineStyle: "dashed", color: "#38bdf8" },
    pass: { label: "Pass", lineStyle: "dotted", color: "#fbbf24" },
    arrow: { label: "Action path", lineStyle: "solid", color: "#38bdf8" },
    line: { label: "Line", lineStyle: "solid", color: "#111827" },
    curve: { label: "Curve", lineStyle: "solid", color: "#111827" },
  }[tool];
  const color = modal.querySelector?.('[name="arrowColor"]');
  if (arrowType) arrowType.value = tool;
  if (arrowLabel && (!String(arrowLabel.value || "").trim() || ["Run", "Pass", "Action path", "Attack ball", "Line", "Curve"].includes(arrowLabel.value))) {
    arrowLabel.value = preset.label;
  }
  if (lineStyle) lineStyle.value = preset.lineStyle;
  if (color && (!String(color.value || "").trim() || ["#fef08a", "#38bdf8", "#fbbf24", "#111827"].includes(String(color.value).toLowerCase()))) {
    color.value = preset.color;
  }
  ensureBoardMovementElement(modal, tool);
  setBoardMovementCoordinates(modal);
  updateBoardArrowStyle(modal);
}

function applyBoardPitchPoint(event, pitch) {
  const modal = pitch?.closest?.(".idp-player-board-modal");
  const point = boardPointFromEvent(event, pitch);
  if (!modal || !point) return false;
  const tool = modal.dataset.idpBoardActiveTool || "player";
  if (tool === "player") {
    setBoardFormValue(modal, "playerX", point.x);
    setBoardFormValue(modal, "playerY", point.y);
    setMarkerPosition(pitch.querySelector(".idp-player-board-player"), point);
    return true;
  }
  if (tool === "reference") {
    const referenceLabel = modal.querySelector?.('[name="referenceLabel"]');
    if (referenceLabel && !String(referenceLabel.value || "").trim()) referenceLabel.value = "REF";
    setBoardFormValue(modal, "referenceX", point.x);
    setBoardFormValue(modal, "referenceY", point.y);
    setMarkerPosition(pitch.querySelector(".idp-player-board-reference"), point);
    refreshBoardObjectVisibility(modal);
    selectBoardObjectByKey(modal, "reference:1");
    return true;
  }
  if (tool === "cone") {
    const selectedCone = selectedBoardObject(modal);
    const selectedIndex = selectedCone?.dataset?.idpBoardObject === "cone" ? Number(selectedCone.dataset.idpBoardCone || 1) : 0;
    const coneIndex = selectedIndex || nextAvailableConeIndex(modal) || 1;
    setBoardFormValue(modal, `cone${coneIndex}X`, point.x);
    setBoardFormValue(modal, `cone${coneIndex}Y`, point.y);
    setBoardConeActive(modal, coneIndex, true);
    setMarkerPosition(pitch.querySelector(`[data-idp-board-cone="${coneIndex}"]`), point);
    refreshBoardObjectVisibility(modal);
    selectBoardObjectByKey(modal, `cone:${coneIndex}`);
    return true;
  }
  if (tool === "zone") {
    const zoneLabel = modal.querySelector?.('[name="zoneLabel"]');
    if (zoneLabel && !String(zoneLabel.value || "").trim()) zoneLabel.value = "Development zone";
    const width = boardFormNumber(modal, "zoneWidth", 32);
    const height = boardFormNumber(modal, "zoneHeight", 28);
    const zonePoint = {
      x: clampBoardPercent(point.x - width / 2),
      y: clampBoardPercent(point.y - height / 2),
    };
    setBoardFormValue(modal, "zoneX", zonePoint.x);
    setBoardFormValue(modal, "zoneY", zonePoint.y);
    updateBoardZoneVisual(modal);
    refreshBoardObjectVisibility(modal);
    selectBoardObjectByKey(modal, "zone:1");
    return true;
  }
  if (["arrow", "run", "pass", "line", "curve"].includes(tool)) {
    setBoardArrowPreset(modal, tool);
    if (modal.dataset.idpBoardArrowStart === "1") {
      setBoardFormValue(modal, "arrowToX", point.x);
      setBoardFormValue(modal, "arrowToY", point.y);
      setBoardMovementCoordinates(modal);
      delete modal.dataset.idpBoardArrowStart;
      return true;
    }
    setBoardFormValue(modal, "arrowFromX", point.x);
    setBoardFormValue(modal, "arrowFromY", point.y);
    setBoardFormValue(modal, "arrowToX", point.x);
    setBoardFormValue(modal, "arrowToY", point.y);
    setBoardMovementCoordinates(modal);
    refreshBoardObjectVisibility(modal);
    selectBoardObjectByKey(modal, "movement:1");
    modal.dataset.idpBoardArrowStart = "1";
    return true;
  }
  if (tool === "note") {
    const noteText = modal.querySelector?.('[name="noteText"]');
    if (noteText && !String(noteText.value || "").trim()) noteText.value = "Coach note";
    setBoardFormValue(modal, "noteX", point.x);
    setBoardFormValue(modal, "noteY", point.y);
    const note = ensureBoardNotePin(pitch, noteText?.value || "Coach note");
    setMarkerPosition(note, point);
    refreshBoardObjectVisibility(modal);
    selectBoardObjectByKey(modal, "note:1");
    return true;
  }
  return false;
}

function setBoardActiveToolState(modal, toolButton = null, fallbackTool = "player") {
  const tool = toolButton?.dataset?.idpBoardTool || fallbackTool || "player";
  if (!modal) return false;
  modal.dataset.idpBoardActiveTool = tool;
  delete modal.dataset.idpBoardArrowStart;
  [...modal.classList].forEach((className) => {
    if (className.startsWith("idp-player-board-modal-tool-")) modal.classList.remove(className);
  });
  modal.classList.add(`idp-player-board-modal-tool-${tool}`);
  modal.querySelectorAll?.("[data-idp-board-tool]")?.forEach((button) => {
    button.classList.toggle("is-active", button === toolButton);
  });
  const label = toolButton?.getAttribute?.("aria-label") || toolButton?.textContent?.trim?.() || "Player";
  modal.querySelectorAll?.("[data-idp-board-active-tool-label]")?.forEach((node) => {
    node.textContent = label;
  });
  modal.querySelectorAll?.("[data-idp-board-hint-tool]")?.forEach((node) => {
    node.textContent = label;
  });
  return true;
}

function selectBoardTool(toolButton) {
  const modal = toolButton?.closest?.(".idp-player-board-modal");
  const tool = toolButton?.dataset?.idpBoardTool || "player";
  if (!setBoardActiveToolState(modal, toolButton, tool)) return false;
  setBoardArrowPreset(modal, tool);
  return true;
}

function handleBoardPointerDown(event, activeRuntime = runtime) {
  const object = event?.target?.closest?.("[data-idp-board-object]");
  const modal = object?.closest?.(".idp-player-board-modal");
  const pitch = object?.closest?.("[data-idp-board-editor-pitch]");
  if (!object || !modal || !pitch) return;
  event.preventDefault?.();
  stopBoardPlayback(activeRuntime, modal);
  const point = boardPointFromEvent(event, pitch);
  const selectedObject = boardObjectForPointer(modal, object, point);
  selectBoardObject(modal, selectedObject);
  if (selectedObject.dataset?.idpBoardObject === "movement") {
    modal.dataset.idpBoardMovementDragHandle = movementDragHandleForPoint(modal, point || { x: 50, y: 50 });
  } else {
    delete modal.dataset.idpBoardMovementDragHandle;
  }
  activeRuntime.boardSuppressNextClick = true;
  activeRuntime.boardDrag = {
    before: captureBoardSnapshot(modal),
    modal,
    moved: false,
    object: selectedObject,
    pitch,
    pointerId: event.pointerId,
  };
  try {
    selectedObject.setPointerCapture?.(event.pointerId);
  } catch {
    // SVG elements do not all expose pointer capture consistently.
  }
}

function handleBoardPointerMove(event, activeRuntime = runtime) {
  const drag = activeRuntime?.boardDrag;
  if (!drag?.modal || !drag.pitch || !drag.object) return;
  event.preventDefault?.();
  const point = boardPointFromEvent(event, drag.pitch);
  if (!point) return;
  drag.moved = setBoardObjectPoint(drag.modal, drag.pitch, drag.object, point) || drag.moved;
}

function handleBoardPointerUp(event, activeRuntime = runtime) {
  const drag = activeRuntime?.boardDrag;
  if (!drag?.modal) return;
  event?.preventDefault?.();
  if (drag.moved) {
    pushBoardHistory(activeRuntime, drag.modal, drag.before, captureBoardSnapshot(drag.modal));
    syncActiveBoardFrameFromModal(drag.modal);
  }
  delete drag.modal.dataset.idpBoardMovementDragHandle;
  activeRuntime.boardDrag = null;
  activeRuntime.boardSuppressNextClick = true;
}

function isBoardKeyboardInputTarget(target) {
  return Boolean(target?.closest?.("button, input, textarea, select, [contenteditable='true']"));
}

function handleBoardKeyboardDown(event, activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  const modal = root?.querySelector?.(".idp-player-board-modal");
  if (!modal || isBoardKeyboardInputTarget(event?.target)) return;
  if ((event?.metaKey || event?.ctrlKey) && String(event?.key || "").toLowerCase() === "d") {
    event.preventDefault?.();
    stopBoardPlayback(activeRuntime, modal);
    addBoardFrame(modal, true);
    return;
  }
  const delta = getTacticalBoardKeyboardNudge(event?.key || "", {
    shiftKey: Boolean(event?.shiftKey),
    step: IDP_BOARD_GRID_SIZE,
    largeStep: 5,
  });
  if (!delta) return;
  const object = selectedBoardObject(modal);
  if (!object) return;
  event.preventDefault?.();
  stopBoardPlayback(activeRuntime, modal);
  const before = captureBoardSnapshot(modal);
  if (nudgeBoardObject(modal, object, delta)) {
    pushBoardHistory(activeRuntime, modal, before, captureBoardSnapshot(modal));
    syncActiveBoardFrameFromModal(modal);
  }
}

function bindBoardPointerEvents(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root || root.__idpBoardPointerEventsBound) return;
  const doc = getDocument(activeRuntime);
  root.addEventListener?.("pointerdown", (event) => handleBoardPointerDown(event, runtime));
  doc?.addEventListener?.("pointermove", (event) => handleBoardPointerMove(event, runtime));
  doc?.addEventListener?.("pointerup", (event) => handleBoardPointerUp(event, runtime));
  doc?.addEventListener?.("keydown", (event) => handleBoardKeyboardDown(event, runtime));
  root.__idpBoardPointerEventsBound = true;
  activeRuntime.boardPointerEventsBound = true;
}

function bindBoardClipPickerInputEvents(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root) return;
  root.querySelectorAll?.("[data-idp-board-clip-picker-search]")?.forEach((input) => {
    if (input.dataset.idpBoardClipPickerInputBound === "true") return;
    input.dataset.idpBoardClipPickerInputBound = "true";
    input.addEventListener?.("input", () => filterBoardClipPicker(input));
  });
}

export function render(context = {}) {
  const activeRuntime = ensureRuntime(context);
  paint(activeRuntime);
  startAutoSync(activeRuntime);
  bindBoardPointerEvents(activeRuntime);
  bindBoardClipPickerInputEvents(activeRuntime);
  runAction(() => boot(activeRuntime));
}

export function handleInput(event) {
  const target = event?.target;
  if (target?.matches?.("[data-idp-board-clip-picker-search]")) {
    filterBoardClipPicker(target);
    return;
  }
  if (target?.matches?.("[data-idp-board-color-input], [data-idp-board-line-width]")) {
    updateBoardArrowStyle(target.closest?.(".idp-player-board-modal"));
    return;
  }
  if (target?.matches?.("[data-idp-board-frame-meta]")) {
    const modal = target.closest?.(".idp-player-board-modal");
    if (modal?.dataset?.idpBoardApplyingFrame === "1") return;
    syncActiveBoardFrameFromModal(modal);
    return;
  }
  if (target?.matches?.("[data-idp-clip-search]")) {
    runtime?.store.setState({ ui: { clipBankSearchQuery: target.value || "" } });
    return;
  }
  if (target?.matches?.("[data-idp-player-board-search]")) {
    runtime?.store.setState({ ui: { playerBoardSearchQuery: target.value || "" } });
    return;
  }
  if (target?.matches?.("[data-idp-player-board-template-search]")) {
    runtime?.store.setState({ ui: { playerBoardTemplateSearchQuery: target.value || "" } });
    return;
  }
  if (target?.matches?.("[data-idp-search]")) {
    runtime?.store.setState({ ui: { searchQuery: target.value || "" } });
  }
}

export function handleChange(event) {
  const target = event?.target;
  if (target?.matches?.("[data-idp-board-line-style]")) {
    updateBoardArrowStyle(target.closest?.(".idp-player-board-modal"));
    return;
  }
  const clipSelect = target?.closest?.("[data-idp-clip-select]");
  if (clipSelect) {
    const id = clipSelect.dataset.idpClipSelect || "";
    toggleClipBankSelection(runtime, id, Boolean(clipSelect.checked));
    return;
  }
  const filter = target?.dataset?.idpFilter || "";
  if (!filter) return;
  if (filter === "status") runtime?.store.setState({ ui: { statusFilter: target.value || "All" } });
  if (filter === "category") runtime?.store.setState({ ui: { categoryFilter: target.value || "All" } });
  if (filter === "owner") runtime?.store.setState({ ui: { ownerFilter: target.value || "All" } });
}

export function handleClick(event) {
  const filterToggle = event?.target?.closest?.("[data-idp-filter-toggle]");
  if (filterToggle) {
    event?.preventDefault?.();
    const filter = filterToggle.dataset.idpFilterToggle || "";
    const currentOpen = runtime?.store.getState?.()?.ui?.openFilterMenu || "";
    runtime?.store.setState({ ui: { openFilterMenu: currentOpen === filter ? "" : filter } });
    return;
  }
  const filterOption = event?.target?.closest?.("[data-idp-filter-option]");
  if (filterOption) {
    event?.preventDefault?.();
    const filter = filterOption.dataset.idpFilterOption || "";
    const value = filterOption.dataset.idpFilterValue || "All";
    const uiPatch = { openFilterMenu: "" };
    if (filter === "category") uiPatch.categoryFilter = value || "All";
    if (filter === "owner") uiPatch.ownerFilter = value || "All";
    runtime?.store.setState({ ui: uiPatch });
    return;
  }
  if (!event?.target?.closest?.(".idp-stage-actions, .idp-coach-assist")) {
    getRoot(runtime?.context)?.querySelectorAll?.(".idp-stage-actions[open], .idp-coach-assist[open]")?.forEach((node) => {
      node.removeAttribute("open");
    });
  }
  const backTrigger = event?.target?.closest?.("[data-idp-back-overview]");
  if (backTrigger) {
    event?.preventDefault?.();
    revokePreviewUrl(runtime);
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    runtime?.store.setState({ ui: { openFilterMenu: "", selectedPlayerId: "", profileView: "development", actionMode: "", editEvidenceId: "", editGoalId: "", playerBoardOpen: false, playerBoardInterventionId: "", playerBoardSearchQuery: "", playerBoardTemplateSearchQuery: "", playerBoardTemplateId: "", playerBoardPreviewFrameIndex: 0, playerBoardPreviewPlaying: false, playerBoardHandoutOpen: false, error: "", message: "" } });
    scrollWorkspaceTop(runtime);
    return;
  }
  const profileViewTrigger = event?.target?.closest?.("[data-idp-profile-view]");
  if (profileViewTrigger) {
    event?.preventDefault?.();
    revokePreviewUrl(runtime);
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    const requestedProfileView = profileViewTrigger.dataset.idpProfileView || "";
    const profileView = ["clip-bank", "player-board", "goals"].includes(requestedProfileView) ? requestedProfileView : "development";
    runtime?.store.setState({
      ui: {
        profileView,
        actionMode: "",
        editEvidenceId: "",
        editGoalId: "",
        playerBoardOpen: false,
        playerBoardInterventionId: "",
        playerBoardTemplateId: "",
        playerBoardPreviewFrameIndex: 0,
        playerBoardPreviewPlaying: false,
        playerBoardHandoutOpen: false,
        clipPreviewOpen: false,
        clipPreviewQueueIds: [],
        clipPreviewActiveIndex: 0,
        clipPreviewStatus: "",
        clipPreviewMessage: "",
        clipPreviewObjectUrl: "",
        error: "",
        message: "",
      },
    });
    scrollWorkspaceTop(runtime);
    return;
  }
  const openFilterMenu = runtime?.store.getState?.()?.ui?.openFilterMenu || "";
  if (openFilterMenu && !event?.target?.closest?.("[data-idp-filter-shell]")) {
    runtime?.store.setState({ ui: { openFilterMenu: "" } });
    return;
  }
  const clipPreviewClose = event?.target?.closest?.("[data-idp-clip-preview-close]");
  if (clipPreviewClose || event?.target?.matches?.("[data-idp-clip-preview-layer]")) {
    event?.preventDefault?.();
    closeClipPreview(runtime);
    return;
  }
  const clipPreviewPrev = event?.target?.closest?.("[data-idp-clip-preview-prev]");
  if (clipPreviewPrev) {
    event?.preventDefault?.();
    moveClipPreview(runtime, -1);
    return;
  }
  const clipPreviewNext = event?.target?.closest?.("[data-idp-clip-preview-next]");
  if (clipPreviewNext) {
    event?.preventDefault?.();
    moveClipPreview(runtime, 1);
    return;
  }
  const clipPreviewJump = event?.target?.closest?.("[data-idp-clip-preview-jump]");
  if (clipPreviewJump) {
    event?.preventDefault?.();
    jumpClipPreview(runtime, Number(clipPreviewJump.dataset.idpClipPreviewJump || 0));
    return;
  }
  const clipPlaySelected = event?.target?.closest?.("[data-idp-clip-play-selected]");
  if (clipPlaySelected) {
    event?.preventDefault?.();
    openClipPreview(runtime, selectedClipIds(runtime));
    return;
  }
  const clipPlay = event?.target?.closest?.("[data-idp-clip-play]");
  if (clipPlay) {
    event?.preventDefault?.();
    const id = clipPlay.dataset.idpClipPlay || "";
    openClipPreview(runtime, [id]);
    return;
  }
  const searchTrigger = event?.target?.closest?.("[data-idp-search-submit]");
  if (searchTrigger) {
    event?.preventDefault?.();
    const root = getRoot(runtime?.context);
    const input = root?.querySelector?.("[data-idp-search]");
    runtime?.store.setState({ ui: { searchQuery: input?.value || "" } });
    const focusSearch = () => getRoot(runtime?.context)?.querySelector?.("[data-idp-search]")?.focus?.();
    const win = runtime?.context?.win || globalThis;
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(focusSearch);
    } else {
      focusSearch();
    }
    return;
  }
  const playerBoardSearchTrigger = event?.target?.closest?.("[data-idp-player-board-search-submit]");
  if (playerBoardSearchTrigger) {
    event?.preventDefault?.();
    const root = getRoot(runtime?.context);
    const input = root?.querySelector?.("[data-idp-player-board-search]");
    runtime?.store.setState({ ui: { playerBoardSearchQuery: input?.value || "" } });
    const focusSearch = () => getRoot(runtime?.context)?.querySelector?.("[data-idp-player-board-search]")?.focus?.();
    const win = runtime?.context?.win || globalThis;
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(focusSearch);
    } else {
      focusSearch();
    }
    return;
  }
  const playerBoardTemplatePreview = event?.target?.closest?.("[data-idp-player-board-template-preview]");
  if (playerBoardTemplatePreview) {
    event?.preventDefault?.();
    runtime?.store.setState({
      ui: {
        playerBoardTemplateId: playerBoardTemplatePreview.dataset.idpPlayerBoardTemplatePreview || "",
        playerBoardHandoutOpen: false,
        error: "",
        message: "",
      },
    });
    return;
  }
  const playerBoardTemplateUse = event?.target?.closest?.("[data-idp-player-board-template-use]");
  if (playerBoardTemplateUse) {
    event?.preventDefault?.();
    const templateId = playerBoardTemplateUse.dataset.idpPlayerBoardTemplateUse || "";
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    resetBoardHistory(runtime);
    runtime?.store.setState({
      ui: {
        playerBoardOpen: true,
        playerBoardInterventionId: idpBoardTemplateInterventionId(templateId),
        playerBoardTemplateId: templateId,
        playerBoardPreviewFrameIndex: 0,
        playerBoardPreviewPlaying: false,
        playerBoardHandoutOpen: false,
        actionMode: "",
        error: "",
        message: "Template loaded. Review and save it to the player's IDP.",
      },
    });
    return;
  }
  const playerBoardPreviewFrame = event?.target?.closest?.("[data-idp-player-board-preview-frame]");
  if (playerBoardPreviewFrame) {
    event?.preventDefault?.();
    setPlayerBoardPreviewFrame(runtime, Number(playerBoardPreviewFrame.dataset.idpPlayerBoardPreviewFrame || 0));
    return;
  }
  const playerBoardPreviewPlay = event?.target?.closest?.("[data-idp-player-board-preview-play]");
  if (playerBoardPreviewPlay) {
    event?.preventDefault?.();
    playPlayerBoardPreviewFrames(runtime);
    return;
  }
  const playerBoardPreviewStop = event?.target?.closest?.("[data-idp-player-board-preview-stop]");
  if (playerBoardPreviewStop) {
    event?.preventDefault?.();
    stopPlayerBoardPreviewPlayback(runtime);
    return;
  }
  const playerBoardHandoutClose = event?.target?.closest?.("[data-idp-player-board-handout-close]");
  if (playerBoardHandoutClose || event?.target?.matches?.("[data-idp-player-board-handout-layer]")) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { playerBoardHandoutOpen: false } });
    return;
  }
  const playerBoardPrint = event?.target?.closest?.("[data-idp-player-board-print]");
  if (playerBoardPrint) {
    event?.preventDefault?.();
    const win = runtime?.context?.win || globalThis;
    if (typeof win.print === "function") win.print();
    return;
  }
  const playerBoardPreviewClip = event?.target?.closest?.("[data-idp-player-board-preview-clip]");
  if (playerBoardPreviewClip) {
    event?.preventDefault?.();
    stopPlayerBoardPreviewPlayback(runtime);
    openClipPreview(runtime, [playerBoardPreviewClip.dataset.idpPlayerBoardPreviewClip || ""]);
    return;
  }
  const boardClipPick = event?.target?.closest?.("[data-idp-board-clip-pick]");
  if (boardClipPick) {
    event?.preventDefault?.();
    pickBoardClip(boardClipPick);
    return;
  }
  const boardClipClear = event?.target?.closest?.("[data-idp-board-clip-clear]");
  if (boardClipClear) {
    event?.preventDefault?.();
    clearBoardClipAnchor(boardClipClear);
    return;
  }
  const closeActionTrigger = event?.target?.closest?.("[data-idp-close-action]");
  if (closeActionTrigger || event?.target?.matches?.("[data-idp-action-layer]")) {
    runtime?.store.setState({ ui: { actionMode: "", editEvidenceId: "", editGoalId: "" } });
    return;
  }
  const archiveFocusTrigger = event?.target?.closest?.("[data-idp-archive-focus]");
  if (archiveFocusTrigger) {
    event?.preventDefault?.();
    const win = runtime?.context?.win || globalThis;
    const confirmed = typeof win.confirm === "function"
      ? win.confirm("Archive this focus? It will leave the active IDP view and you can create a new current focus afterwards.")
      : true;
    if (!confirmed) return;
    runAction(() => runtime?.actions.archiveFocus(archiveFocusTrigger.dataset.idpArchiveFocus || ""));
    return;
  }
  const deleteFocusTrigger = event?.target?.closest?.("[data-idp-delete-focus]");
  if (deleteFocusTrigger) {
    event?.preventDefault?.();
    const win = runtime?.context?.win || globalThis;
    const confirmed = typeof win.confirm === "function"
      ? win.confirm("Delete this focus from the active IDP view? This cannot be undone from the player profile.")
      : true;
    if (!confirmed) return;
    runAction(() => runtime?.actions.deleteFocus(deleteFocusTrigger.dataset.idpDeleteFocus || ""));
    return;
  }
  const boardColorChoice = event?.target?.closest?.("[data-idp-board-color-choice]");
  if (boardColorChoice) {
    event?.preventDefault?.();
    const modal = boardColorChoice.closest?.(".idp-player-board-modal");
    const color = boardColorChoice.dataset.idpBoardColorChoice || "#fef08a";
    setBoardFormValue(modal, "arrowColor", color);
    modal?.querySelectorAll?.("[data-idp-board-color-choice]")?.forEach((button) => {
      button.classList.toggle("is-active", button === boardColorChoice);
    });
    updateBoardArrowStyle(modal);
    return;
  }
  const boardLayerDuplicate = event?.target?.closest?.("[data-idp-board-object-duplicate]");
  if (boardLayerDuplicate) {
    event?.preventDefault?.();
    mutateBoardObjectLayer(boardLayerDuplicate.closest?.(".idp-player-board-modal"), boardLayerDuplicate.dataset.idpBoardObjectDuplicate || "", "duplicate");
    return;
  }
  const boardLayerDelete = event?.target?.closest?.("[data-idp-board-object-delete]");
  if (boardLayerDelete) {
    event?.preventDefault?.();
    mutateBoardObjectLayer(boardLayerDelete.closest?.(".idp-player-board-modal"), boardLayerDelete.dataset.idpBoardObjectDelete || "", "delete");
    return;
  }
  const boardLayerSelect = event?.target?.closest?.("[data-idp-board-layer-select]");
  if (boardLayerSelect) {
    event?.preventDefault?.();
    mutateBoardObjectLayer(boardLayerSelect.closest?.(".idp-player-board-modal"), boardLayerSelect.dataset.idpBoardLayerSelect || "", "select");
    return;
  }
  const boardToolTrigger = event?.target?.closest?.("[data-idp-board-tool]");
  if (boardToolTrigger) {
    event?.preventDefault?.();
    selectBoardTool(boardToolTrigger);
    return;
  }
  const boardUndoTrigger = event?.target?.closest?.("[data-idp-board-undo]");
  if (boardUndoTrigger) {
    event?.preventDefault?.();
    undoBoardHistory(runtime, boardUndoTrigger.closest?.(".idp-player-board-modal"));
    return;
  }
  const boardRedoTrigger = event?.target?.closest?.("[data-idp-board-redo]");
  if (boardRedoTrigger) {
    event?.preventDefault?.();
    redoBoardHistory(runtime, boardRedoTrigger.closest?.(".idp-player-board-modal"));
    return;
  }
  const boardFrameTrigger = event?.target?.closest?.("[data-idp-board-frame-index]");
  if (boardFrameTrigger) {
    event?.preventDefault?.();
    selectBoardFrame(boardFrameTrigger.closest?.(".idp-player-board-modal"), Number(boardFrameTrigger.dataset.idpBoardFrameIndex || 0));
    return;
  }
  const boardFrameAdd = event?.target?.closest?.("[data-idp-board-frame-add]");
  if (boardFrameAdd) {
    event?.preventDefault?.();
    addBoardFrame(boardFrameAdd.closest?.(".idp-player-board-modal"), false);
    return;
  }
  const boardFrameDuplicate = event?.target?.closest?.("[data-idp-board-frame-duplicate]");
  if (boardFrameDuplicate) {
    event?.preventDefault?.();
    addBoardFrame(boardFrameDuplicate.closest?.(".idp-player-board-modal"), true);
    return;
  }
  const boardPlay = event?.target?.closest?.("[data-idp-board-play]");
  if (boardPlay) {
    event?.preventDefault?.();
    playBoardFrames(runtime, boardPlay.closest?.(".idp-player-board-modal"));
    return;
  }
  const boardStop = event?.target?.closest?.("[data-idp-board-stop]");
  if (boardStop) {
    event?.preventDefault?.();
    stopBoardPlayback(runtime, boardStop.closest?.(".idp-player-board-modal"));
    return;
  }
  const boardEditorPitch = event?.target?.closest?.("[data-idp-board-editor-pitch]");
  if (boardEditorPitch) {
    event?.preventDefault?.();
    if (runtime?.boardSuppressNextClick) {
      runtime.boardSuppressNextClick = false;
      return;
    }
    const modal = boardEditorPitch.closest?.(".idp-player-board-modal");
    const before = captureBoardSnapshot(modal);
    if (applyBoardPitchPoint(event, boardEditorPitch)) {
      pushBoardHistory(runtime, modal, before, captureBoardSnapshot(modal));
      syncActiveBoardFrameFromModal(modal);
      return;
    }
  }
  const playerBoardClose = event?.target?.closest?.("[data-idp-player-board-close]");
  if (playerBoardClose || event?.target?.matches?.("[data-idp-player-board-layer]")) {
    event?.preventDefault?.();
    stopBoardPlayback(runtime, playerBoardClose?.closest?.(".idp-player-board-modal") || getRoot(runtime?.context)?.querySelector?.(".idp-player-board-modal"));
    resetBoardHistory(runtime);
    runtime?.store.setState({ ui: { playerBoardOpen: false, playerBoardInterventionId: "", playerBoardHandoutOpen: false } });
    return;
  }
  const playerBoardNew = event?.target?.closest?.("[data-idp-player-board-new]");
  if (playerBoardNew) {
    event?.preventDefault?.();
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    stopBoardPlayback(runtime, playerBoardNew.closest?.(".idp-player-board-modal"));
    resetBoardHistory(runtime);
    runtime?.store.setState({ ui: { playerBoardOpen: true, playerBoardInterventionId: "__new", playerBoardTemplateId: "", playerBoardPreviewFrameIndex: 0, playerBoardPreviewPlaying: false, playerBoardHandoutOpen: false, actionMode: "", error: "", message: "" } });
    return;
  }
  const playerBoardPreviewSelect = event?.target?.closest?.("[data-idp-player-board-preview-select]");
  if (playerBoardPreviewSelect) {
    event?.preventDefault?.();
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    runtime?.store.setState({ ui: { playerBoardOpen: false, playerBoardInterventionId: playerBoardPreviewSelect.dataset.idpPlayerBoardPreviewSelect || "", playerBoardTemplateId: "", playerBoardPreviewFrameIndex: 0, playerBoardPreviewPlaying: false, playerBoardHandoutOpen: false, error: "", message: "" } });
    return;
  }
  const playerBoardHandoutOpen = event?.target?.closest?.("[data-idp-player-board-handout-open]");
  if (playerBoardHandoutOpen) {
    event?.preventDefault?.();
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    runtime?.store.setState({ ui: { playerBoardHandoutOpen: true, playerBoardPreviewPlaying: false, error: "", message: "" } });
    return;
  }
  const playerBoardOpen = event?.target?.closest?.("[data-idp-player-board-open]");
  if (playerBoardOpen) {
    event?.preventDefault?.();
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    stopBoardPlayback(runtime, playerBoardOpen.closest?.(".idp-player-board-modal"));
    resetBoardHistory(runtime);
    runtime?.store.setState({ ui: { playerBoardOpen: true, playerBoardTemplateId: "", playerBoardPreviewPlaying: false, playerBoardHandoutOpen: false, actionMode: "", error: "", message: "" } });
    return;
  }
  const playerBoardSelect = event?.target?.closest?.("[data-idp-player-board-select]");
  if (playerBoardSelect) {
    event?.preventDefault?.();
    stopBoardPlayback(runtime, playerBoardSelect.closest?.(".idp-player-board-modal"));
    resetBoardHistory(runtime);
    runtime?.store.setState({ ui: { playerBoardOpen: true, playerBoardInterventionId: playerBoardSelect.dataset.idpPlayerBoardSelect || "", playerBoardTemplateId: "", playerBoardHandoutOpen: false } });
    return;
  }
  const playerBoardLinkClip = event?.target?.closest?.("[data-idp-player-board-link-clip]");
  if (playerBoardLinkClip) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { actionMode: "evidence", playerBoardOpen: false, playerBoardHandoutOpen: false, message: "Link a clip by marking it as IDP observation from Clip Bank." } });
    return;
  }
  const archiveIntervention = event?.target?.closest?.("[data-idp-archive-intervention]");
  if (archiveIntervention) {
    event?.preventDefault?.();
    const win = runtime?.context?.win || globalThis;
    const confirmed = typeof win.confirm === "function" ? win.confirm("Archive this individual exercise?") : true;
    if (!confirmed) return;
    runAction(() => runtime?.actions.archiveIntervention(archiveIntervention.dataset.idpArchiveIntervention || ""));
    return;
  }
  const editEvidenceTrigger = event?.target?.closest?.("[data-idp-edit-evidence]");
  if (editEvidenceTrigger) {
    event?.preventDefault?.();
    runtime?.store.setState({
      ui: {
        actionMode: "edit-evidence",
        editEvidenceId: editEvidenceTrigger.dataset.idpEditEvidence || "",
        error: "",
        message: "",
      },
    });
    return;
  }
  const deleteEvidenceTrigger = event?.target?.closest?.("[data-idp-delete-evidence]");
  if (deleteEvidenceTrigger) {
    event?.preventDefault?.();
    const win = runtime?.context?.win || globalThis;
    const confirmed = typeof win.confirm === "function" ? win.confirm("Delete this observation?") : true;
    if (!confirmed) return;
    runAction(() => runtime?.actions.deleteEvidence(deleteEvidenceTrigger.dataset.idpDeleteEvidence || ""));
    return;
  }
  const editGoalTrigger = event?.target?.closest?.("[data-idp-edit-goal]");
  if (editGoalTrigger) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { actionMode: "edit-goal", editGoalId: editGoalTrigger.dataset.idpEditGoal || "", error: "", message: "" } });
    return;
  }
  const goalCheckinTrigger = event?.target?.closest?.("[data-idp-goal-checkin]");
  if (goalCheckinTrigger) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { actionMode: "goal-checkin", editGoalId: goalCheckinTrigger.dataset.idpGoalCheckin || "", error: "", message: "" } });
    return;
  }
  const archiveGoalTrigger = event?.target?.closest?.("[data-idp-archive-goal]");
  if (archiveGoalTrigger) {
    event?.preventDefault?.();
    const win = runtime?.context?.win || globalThis;
    const confirmed = typeof win.confirm === "function" ? win.confirm("Archive this development goal?") : true;
    if (!confirmed) return;
    runAction(() => runtime?.actions.archiveGoal(archiveGoalTrigger.dataset.idpArchiveGoal || ""));
    return;
  }
  const actionTrigger = event?.target?.closest?.("[data-idp-action]");
  if (actionTrigger) {
    runtime?.store.setState({
      ui: {
        actionMode: actionTrigger.dataset.idpAction || "",
        editEvidenceId: "",
        editGoalId: "",
        error: "",
        message: "",
      },
    });
    return;
  }
  const statusFilterTrigger = event?.target?.closest?.("[data-idp-status-filter]");
  if (statusFilterTrigger) {
    runtime?.store.setState({ ui: { statusFilter: statusFilterTrigger.dataset.idpStatusFilter || "All" } });
    return;
  }
  const playerTrigger = event?.target?.closest?.("[data-idp-player]");
  if (playerTrigger) {
    revokePreviewUrl(runtime);
    stopPlayerBoardPreviewPlayback(runtime, { updateState: false });
    runAction(async () => {
      await runtime?.actions.selectPlayer(playerTrigger.dataset.idpPlayer || "");
      scrollWorkspaceTop(runtime);
    });
    return;
  }
  const refreshTrigger = event?.target?.closest?.("[data-idp-refresh]");
  if (refreshTrigger) {
    runAction(() => runtime?.actions.refreshSelectedPlayer());
  }
}

export function handleSubmit(event) {
  const form = event?.target;
  if (!form?.matches?.("[data-idp-create-focus], [data-idp-add-evidence], [data-idp-update-evidence], [data-idp-complete-review], [data-idp-assign-owner], [data-idp-save-goal], [data-idp-add-goal-checkin], [data-idp-save-intervention]")) {
    return;
  }
  event.preventDefault();
  if (form.matches("[data-idp-save-intervention]")) {
    syncActiveBoardFrameFromModal(form.closest?.(".idp-player-board-modal"));
    stopBoardPlayback(runtime, form.closest?.(".idp-player-board-modal"));
  }
  const formData = new FormData(form);
  if (form.matches("[data-idp-create-focus]")) {
    runAction(() => runtime?.actions.createFocus(formData));
  }
  if (form.matches("[data-idp-add-evidence]")) {
    runAction(() => runtime?.actions.addEvidence(formData));
  }
  if (form.matches("[data-idp-update-evidence]")) {
    runAction(() => runtime?.actions.updateEvidence(formData));
  }
  if (form.matches("[data-idp-complete-review]")) {
    runAction(() => runtime?.actions.completeReview(formData));
  }
  if (form.matches("[data-idp-assign-owner]")) {
    runAction(() => runtime?.actions.assignOwner(formData));
  }
  if (form.matches("[data-idp-save-goal]")) {
    runAction(() => runtime?.actions.saveGoal(formData));
  }
  if (form.matches("[data-idp-add-goal-checkin]")) {
    runAction(() => runtime?.actions.addGoalCheckin(formData));
  }
  if (form.matches("[data-idp-save-intervention]")) {
    runAction(() => runtime?.actions.saveIntervention(formData));
  }
}
