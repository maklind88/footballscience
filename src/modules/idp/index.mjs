import { createIdpActions } from "./idp-actions.mjs";
import { createIdpStore } from "./idp-state.mjs";
import { renderIdpWorkspace as renderMarkup } from "./idp-renderer.mjs";
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

let runtime = null;
const IDP_SYNC_INTERVAL_MS = 30000;
const IDP_SYNC_FOCUS_COOLDOWN_MS = 5000;

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
  if (!isOverviewSearch && !isClipSearch) return null;
  const value = activeElement.value || "";
  return {
    selector: isClipSearch ? "[data-idp-clip-search]" : "[data-idp-search]",
    end: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : value.length,
    start: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : value.length,
  };
}

function restoreSearchFocus(activeRuntime = runtime, focusState = null) {
  if (!focusState) return;
  const input = getRoot(activeRuntime?.context)?.querySelector?.(focusState.selector || "[data-idp-search]");
  if (!input) return;
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
}

function paint(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root) return;
  ensureClipBankStyles(activeRuntime);
  ensureIdpProfileStyles(activeRuntime);
  const searchFocus = captureSearchFocus(activeRuntime);
  root.innerHTML = renderMarkup(activeRuntime.store.getState(), {
    canEdit: canEdit(activeRuntime.context),
    currentUser: activeRuntime.context.currentUser,
    users: activeRuntime.context.users,
    formatUserName: activeRuntime.context.formatUserName,
    team: activeRuntime.context.team,
    teamLogoUrl: activeRuntime.context.teamLogoUrl,
    teamName: activeRuntime.context.teamName,
  });
  restoreSearchFocus(activeRuntime, searchFocus);
  setupIdpClipPreviewPlayback(activeRuntime);
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

function boardPointFromEvent(event, pitch) {
  const rect = pitch?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  return {
    x: clampBoardPercent(((event.clientX - rect.left) / rect.width) * 100),
    y: clampBoardPercent(((event.clientY - rect.top) / rect.height) * 100),
  };
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

function ensureBoardNotePin(pitch, text = "Coach note") {
  let note = pitch?.querySelector?.(".idp-player-board-note-pin");
  if (note || !pitch) return note;
  const doc = pitch.ownerDocument || getDocument(runtime);
  note = doc?.createElement?.("span");
  if (!note) return null;
  note.className = "idp-player-board-note-pin";
  note.textContent = text;
  pitch.appendChild(note);
  return note;
}

function setMarkerPosition(marker, point) {
  if (!marker || !point) return;
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

function boardMovementPath(fromX, fromY, toX, toY) {
  const controlX = (Number(fromX) + Number(toX)) / 2;
  const controlY = Math.min(Number(fromY), Number(toY)) - Math.max(6, Math.abs(Number(toX) - Number(fromX)) / 5);
  return `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;
}

function boardMovementElement(modal) {
  return modal?.querySelector?.(".idp-player-board-arrow-layer line, .idp-player-board-arrow-layer path[data-idp-board-arrow-type]");
}

function boardMovementPoints(modal) {
  return {
    fromX: boardFormNumber(modal, "arrowFromX", boardFormNumber(modal, "playerX", 50)),
    fromY: boardFormNumber(modal, "arrowFromY", boardFormNumber(modal, "playerY", 70)),
    toX: boardFormNumber(modal, "arrowToX", 62),
    toY: boardFormNumber(modal, "arrowToY", 42),
  };
}

function setBoardMovementCoordinates(modal) {
  const element = boardMovementElement(modal);
  const type = modal?.querySelector?.('[name="arrowType"]')?.value || element?.dataset?.idpBoardArrowType || "run";
  const { fromX, fromY, toX, toY } = boardMovementPoints(modal);
  if (!element) return;
  if (type === "line" || type === "curve") {
    element.removeAttribute("marker-end");
  } else if (!element.getAttribute("marker-end")) {
    element.setAttribute("marker-end", "url(#idp-player-board-editor-arrow)");
  }
  if (type === "run" || element.tagName?.toLowerCase?.() === "path") {
    element.setAttribute("d", boardMovementPath(fromX, fromY, toX, toY));
    return;
  }
  element.setAttribute("x1", String(fromX));
  element.setAttribute("y1", String(fromY));
  element.setAttribute("x2", String(toX));
  element.setAttribute("y2", String(toY));
}

function ensureBoardMovementElement(modal, type = "run") {
  const svg = modal?.querySelector?.(".idp-player-board-arrow-layer");
  const current = boardMovementElement(modal);
  if (!svg || !current) return current;
  const currentTag = current.tagName?.toLowerCase?.();
  const targetTag = type === "run" || type === "curve" ? "path" : "line";
  if (currentTag === targetTag) {
    current.dataset.idpBoardArrowType = type;
    return current;
  }
  const doc = current.ownerDocument || getDocument(runtime);
  const next = doc?.createElementNS?.("http://www.w3.org/2000/svg", targetTag);
  if (!next) return current;
  next.dataset.idpBoardArrowType = type;
  if (type !== "line" && type !== "curve") {
    next.setAttribute("marker-end", current.getAttribute("marker-end") || "url(#idp-player-board-editor-arrow)");
  }
  current.replaceWith(next);
  setBoardMovementCoordinates(modal);
  return next;
}

function updateBoardArrowStyle(modal) {
  const color = modal?.querySelector?.('[name="arrowColor"]')?.value || "#38bdf8";
  const lineStyle = modal?.querySelector?.('[name="arrowLineStyle"]')?.value || "dashed";
  const lineWidth = Number(modal?.querySelector?.('[name="arrowLineWidth"]')?.value || 2.5);
  const renderLineWidth = boardRenderLineWidth(lineWidth, 2.5);
  const element = boardMovementElement(modal);
  element?.setAttribute?.("stroke", color);
  element?.setAttribute?.("stroke-width", String(renderLineWidth));
  element?.setAttribute?.("stroke-dasharray", boardLineDasharray(lineStyle));
  element?.setAttribute?.("fill", "none");
  if (element?.style) {
    element.style.stroke = color;
    element.style.strokeWidth = String(renderLineWidth);
    element.style.strokeDasharray = boardLineDasharray(lineStyle);
    element.style.fill = "none";
  }
  modal?.querySelector?.(".idp-player-board-arrow-layer marker path")?.setAttribute?.("fill", color);
  modal?.querySelector?.(".idp-player-board-arrow-layer marker path")?.setAttribute?.("stroke", color);
  modal?.querySelectorAll?.("[data-idp-board-color-choice]")?.forEach((button) => {
    button.classList.toggle("is-active", String(button.dataset.idpBoardColorChoice || "").toLowerCase() === String(color || "").toLowerCase());
  });
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
    setBoardFormValue(modal, "referenceX", point.x);
    setBoardFormValue(modal, "referenceY", point.y);
    setMarkerPosition(pitch.querySelector(".idp-player-board-reference"), point);
    return true;
  }
  if (tool === "cone") {
    setBoardFormValue(modal, "cone1X", point.x);
    setBoardFormValue(modal, "cone1Y", point.y);
    setMarkerPosition(pitch.querySelector('[data-idp-board-cone="1"]'), point);
    return true;
  }
  if (tool === "zone") {
    const width = boardFormNumber(modal, "zoneWidth", 32);
    const height = boardFormNumber(modal, "zoneHeight", 28);
    const zonePoint = {
      x: clampBoardPercent(point.x - width / 2),
      y: clampBoardPercent(point.y - height / 2),
    };
    setBoardFormValue(modal, "zoneX", zonePoint.x);
    setBoardFormValue(modal, "zoneY", zonePoint.y);
    const zone = pitch.querySelector(".idp-player-board-zone");
    if (zone) {
      zone.style.left = `${zonePoint.x}%`;
      zone.style.top = `${zonePoint.y}%`;
      zone.style.width = `${width}%`;
      zone.style.height = `${height}%`;
    }
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
    return true;
  }
  return false;
}

function selectBoardTool(toolButton) {
  const modal = toolButton?.closest?.(".idp-player-board-modal");
  const tool = toolButton?.dataset?.idpBoardTool || "player";
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
  const activeLabel = modal.querySelector?.("[data-idp-board-active-tool-label]");
  const hintTool = modal.querySelector?.("[data-idp-board-hint-tool]");
  if (activeLabel) activeLabel.textContent = label;
  if (hintTool) hintTool.textContent = label;
  setBoardArrowPreset(modal, tool);
  return true;
}

export function render(context = {}) {
  const activeRuntime = ensureRuntime(context);
  paint(activeRuntime);
  startAutoSync(activeRuntime);
  runAction(() => boot(activeRuntime));
}

export function handleInput(event) {
  const target = event?.target;
  if (target?.matches?.("[data-idp-board-color-input], [data-idp-board-line-width]")) {
    updateBoardArrowStyle(target.closest?.(".idp-player-board-modal"));
    return;
  }
  if (target?.matches?.("[data-idp-clip-search]")) {
    runtime?.store.setState({ ui: { clipBankSearchQuery: target.value || "" } });
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
  if (!event?.target?.closest?.(".idp-stage-actions")) {
    getRoot(runtime?.context)?.querySelectorAll?.(".idp-stage-actions[open]")?.forEach((node) => {
      node.removeAttribute("open");
    });
  }
  const backTrigger = event?.target?.closest?.("[data-idp-back-overview]");
  if (backTrigger) {
    event?.preventDefault?.();
    revokePreviewUrl(runtime);
    runtime?.store.setState({ ui: { openFilterMenu: "", selectedPlayerId: "", profileView: "development", actionMode: "", editEvidenceId: "", playerBoardOpen: false, playerBoardInterventionId: "", error: "", message: "" } });
    scrollWorkspaceTop(runtime);
    return;
  }
  const profileViewTrigger = event?.target?.closest?.("[data-idp-profile-view]");
  if (profileViewTrigger) {
    event?.preventDefault?.();
    revokePreviewUrl(runtime);
    const profileView = profileViewTrigger.dataset.idpProfileView === "clip-bank" ? "clip-bank" : "development";
    runtime?.store.setState({
      ui: {
        profileView,
        actionMode: "",
        editEvidenceId: "",
        playerBoardOpen: false,
        playerBoardInterventionId: "",
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
  const closeActionTrigger = event?.target?.closest?.("[data-idp-close-action]");
  if (closeActionTrigger || event?.target?.matches?.("[data-idp-action-layer]")) {
    runtime?.store.setState({ ui: { actionMode: "", editEvidenceId: "" } });
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
  const boardToolTrigger = event?.target?.closest?.("[data-idp-board-tool]");
  if (boardToolTrigger) {
    event?.preventDefault?.();
    selectBoardTool(boardToolTrigger);
    return;
  }
  const boardEditorPitch = event?.target?.closest?.("[data-idp-board-editor-pitch]");
  if (boardEditorPitch) {
    event?.preventDefault?.();
    if (applyBoardPitchPoint(event, boardEditorPitch)) return;
  }
  const playerBoardClose = event?.target?.closest?.("[data-idp-player-board-close]");
  if (playerBoardClose || event?.target?.matches?.("[data-idp-player-board-layer]")) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { playerBoardOpen: false, playerBoardInterventionId: "" } });
    return;
  }
  const playerBoardNew = event?.target?.closest?.("[data-idp-player-board-new]");
  if (playerBoardNew) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { playerBoardOpen: true, playerBoardInterventionId: "__new", actionMode: "", error: "", message: "" } });
    return;
  }
  const playerBoardOpen = event?.target?.closest?.("[data-idp-player-board-open]");
  if (playerBoardOpen) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { playerBoardOpen: true, actionMode: "", error: "", message: "" } });
    return;
  }
  const playerBoardSelect = event?.target?.closest?.("[data-idp-player-board-select]");
  if (playerBoardSelect) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { playerBoardOpen: true, playerBoardInterventionId: playerBoardSelect.dataset.idpPlayerBoardSelect || "" } });
    return;
  }
  const playerBoardLinkClip = event?.target?.closest?.("[data-idp-player-board-link-clip]");
  if (playerBoardLinkClip) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { actionMode: "evidence", playerBoardOpen: false, message: "Link a clip by marking it as IDP observation from Clip Bank." } });
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
  const actionTrigger = event?.target?.closest?.("[data-idp-action]");
  if (actionTrigger) {
    runtime?.store.setState({
      ui: {
        actionMode: actionTrigger.dataset.idpAction || "",
        editEvidenceId: "",
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
  if (!form?.matches?.("[data-idp-create-focus], [data-idp-add-evidence], [data-idp-update-evidence], [data-idp-complete-review], [data-idp-assign-owner], [data-idp-save-intervention]")) {
    return;
  }
  event.preventDefault();
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
  if (form.matches("[data-idp-save-intervention]")) {
    runAction(() => runtime?.actions.saveIntervention(formData));
  }
}
