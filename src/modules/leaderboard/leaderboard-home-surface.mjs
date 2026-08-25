import {
  handleChange,
  handleClick,
  handleInput,
  handleSubmit,
  navigateLeaderboardMonth,
  openLeaderboardAward,
  openLeaderboardPlayerDetail,
  render,
  restoreLeaderboardCurrentMonth,
  unmountLeaderboardWorkspace,
} from "./leaderboard-controller.mjs";
import { renderLeaderboardHomeDialog } from "./leaderboard-dialog-renderer.mjs";
import {
  getLeaderboardMonthValue,
  normalizeLeaderboardDate,
  normalizeLeaderboardText,
} from "./leaderboard-helpers.mjs";
import {
  ensureLeaderboardRuntime,
  initializeLeaderboardRuntime,
  onLeaderboardRuntimeDispose,
  resetSharedLeaderboardRuntime,
  runLeaderboardLoad,
} from "./leaderboard-runtime.mjs";
import { renderLeaderboardHomeSummary } from "./leaderboard-summary-renderer.mjs";

let activeSurface = null;

function listen(surface, target, type, listener) {
  if (typeof target?.addEventListener !== "function") return;
  target.addEventListener(type, listener);
  surface.listeners.push(() => target.removeEventListener?.(type, listener));
}

function queueFocus(surface, target) {
  if (!target?.focus) return;
  const win = surface.runtime.context.win || globalThis;
  const focus = () => {
    try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
  };
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(focus);
  else focus();
}

function renderSummary(surface) {
  if (!surface.mounted) return;
  const root = surface.summaryRoot;
  const active = surface.runtime.context.win?.document?.activeElement;
  const focusSelector = root.contains?.(active)
    ? active?.matches?.("[data-leaderboard-home-open]") ? "[data-leaderboard-home-open]"
      : active?.matches?.("[data-leaderboard-home-retry]") ? "[data-leaderboard-home-retry]" : ""
    : "";
  root.innerHTML = renderLeaderboardHomeSummary(surface.runtime.store.getState(), surface.runtime.context);
  if (focusSelector) queueFocus(surface, root.querySelector?.(focusSelector));
}

function isProtectedWrite(state = {}) {
  return state.ui?.pendingAction === "award" || state.ui?.pendingAction === "reverse";
}

function restoreInertRecords(records = []) {
  records.forEach(({ child, inert, hadInertAttribute, ariaHidden }) => {
    child.inert = inert;
    if (hadInertAttribute) child.setAttribute?.("inert", "");
    else child.removeAttribute?.("inert");
    if (ariaHidden === null || ariaHidden === undefined) child.removeAttribute?.("aria-hidden");
    else child.setAttribute?.("aria-hidden", ariaHidden);
  });
}

function unlockNestedModal(surface) {
  restoreInertRecords(surface.nestedRecords);
  surface.nestedRecords = [];
  const outerRecord = surface.nestedOuterRecord;
  if (outerRecord?.node) {
    if (outerRecord.ariaModal === null || outerRecord.ariaModal === undefined) outerRecord.node.removeAttribute?.("aria-modal");
    else outerRecord.node.setAttribute?.("aria-modal", outerRecord.ariaModal);
  }
  surface.nestedOuterRecord = null;
}

function syncNestedModal(surface) {
  unlockNestedModal(surface);
  const outer = surface.dialogHost.querySelector?.("[data-leaderboard-home-dialog]");
  const dialogs = [...(surface.workspace?.querySelectorAll?.("[data-leaderboard-modal]") || [])];
  const topDialog = dialogs.at(-1);
  if (!outer || !topDialog) return;
  surface.nestedOuterRecord = { node: outer, ariaModal: outer.getAttribute?.("aria-modal") };
  outer.setAttribute?.("aria-modal", "false");
  topDialog.setAttribute?.("aria-modal", "true");
  let keptBranch = topDialog;
  while (keptBranch && keptBranch !== outer) {
    const parent = keptBranch.parentElement;
    if (!parent) break;
    [...(parent.children || [])].filter((child) => child !== keptBranch).forEach((child) => surface.nestedRecords.push({
      child,
      inert: Boolean(child.inert),
      hadInertAttribute: Boolean(child.hasAttribute?.("inert")),
      ariaHidden: child.getAttribute?.("aria-hidden"),
    }));
    keptBranch = parent;
  }
  surface.nestedRecords.forEach(({ child }) => {
    child.inert = true;
    child.setAttribute?.("aria-hidden", "true");
  });
}

function syncDialogChrome(surface) {
  if (!surface.dialogOpen) return;
  const pending = isProtectedWrite(surface.runtime.store.getState());
  const layer = surface.dialogHost.querySelector?.("[data-leaderboard-home-dialog-layer]");
  const dialog = surface.dialogHost.querySelector?.("[data-leaderboard-home-dialog]");
  const close = surface.dialogHost.querySelector?.("button[data-leaderboard-home-close]");
  layer?.toggleAttribute?.("data-leaderboard-home-close", !pending);
  if (close) close.disabled = pending;
  dialog?.setAttribute?.("aria-busy", String(pending));
  syncNestedModal(surface);
  ensureTopDialogFocus(surface);
}

function queueDialogChrome(surface) {
  if (surface.dialogSyncQueued) return;
  surface.dialogSyncQueued = true;
  Promise.resolve().then(() => {
    surface.dialogSyncQueued = false;
    if (surface.mounted && surface.dialogOpen) syncDialogChrome(surface);
  });
}

function lockBackground(surface) {
  const doc = surface.runtime.context.win?.document;
  const body = doc?.body;
  if (!body) return;
  const records = [];
  let keptBranch = surface.dialogHost;
  while (keptBranch && keptBranch !== body) {
    const parent = keptBranch.parentElement;
    if (!parent) break;
    [...(parent.children || [])].filter((child) => child !== keptBranch).forEach((child) => records.push({
      child,
      inert: Boolean(child.inert),
      hadInertAttribute: Boolean(child.hasAttribute?.("inert")),
      ariaHidden: child.getAttribute?.("aria-hidden"),
    }));
    keptBranch = parent;
  }
  surface.backgroundRecords = records;
  surface.backgroundRecords.forEach(({ child }) => {
    child.inert = true;
    child.setAttribute?.("aria-hidden", "true");
  });
  body.classList?.add("is-leaderboard-dialog-open");
}

function unlockBackground(surface) {
  const body = surface.runtime.context.win?.document?.body;
  restoreInertRecords(surface.backgroundRecords);
  surface.backgroundRecords = [];
  body?.classList?.remove("is-leaderboard-dialog-open");
}

function createDialogContext(surface, workspace) {
  const source = surface.sourceContext;
  return { ...source, ui: { ...(source.ui || {}), leaderboardWorkspace: workspace } };
}

function rememberOpener(surface, opener) {
  const doc = surface.runtime.context.win?.document;
  const candidate = opener?.focus ? opener : doc?.activeElement;
  surface.opener = candidate || null;
  surface.openerPlayerId = candidate?.dataset?.leaderboardHomePlayer
    || candidate?.dataset?.leaderboardPlayerDetail || "";
}

function findReturnFocus(surface) {
  if (surface.opener?.isConnected !== false && surface.opener?.focus) return surface.opener;
  if (surface.openerPlayerId) {
    const players = [...(surface.summaryRoot.querySelectorAll?.("[data-leaderboard-home-player], [data-leaderboard-player-detail]") || [])];
    const player = players.find((item) => item.dataset.leaderboardHomePlayer === surface.openerPlayerId
      || item.dataset.leaderboardPlayerDetail === surface.openerPlayerId);
    if (player) return player;
  }
  return surface.summaryRoot.querySelector?.("[data-leaderboard-home-open]") || null;
}

function openDialog(surface, opener = null) {
  if (!surface.mounted) return false;
  if (surface.dialogOpen) return true;
  rememberOpener(surface, opener);
  const pending = isProtectedWrite(surface.runtime.store.getState());
  surface.dialogHost.innerHTML = renderLeaderboardHomeDialog(surface.runtime.context, { pendingWrite: pending });
  const workspace = surface.dialogHost.querySelector?.("[data-leaderboard-dialog-workspace]");
  if (!workspace) return false;
  surface.dialogOpen = true;
  surface.workspace = workspace;
  surface.dialogContext = createDialogContext(surface, workspace);
  lockBackground(surface);
  render(surface.dialogContext);
  syncDialogChrome(surface);
  const close = surface.dialogHost.querySelector?.("button[data-leaderboard-home-close]");
  queueFocus(surface, close?.disabled ? surface.dialogHost.querySelector?.("[data-leaderboard-home-dialog]") : close);
  return true;
}

function closeDialog(surface, restoreFocus = true) {
  if (!surface.dialogOpen) return true;
  if (isProtectedWrite(surface.runtime.store.getState())) return false;
  unlockNestedModal(surface);
  restoreLeaderboardCurrentMonth(surface.runtime);
  unmountLeaderboardWorkspace(surface.workspace);
  surface.dialogOpen = false;
  surface.dialogContext = null;
  surface.workspace = null;
  surface.dialogHost.innerHTML = "";
  unlockBackground(surface);
  if (restoreFocus) queueFocus(surface, findReturnFocus(surface));
  return true;
}

function getFocusable(dialog) {
  return [...(dialog?.querySelectorAll?.("button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex='0']") || [])]
    .filter((item) => !item.disabled && !item.matches?.(":disabled") && !item.closest?.("[inert]"));
}

function getTopDialog(surface) {
  const nested = [...(surface.workspace?.querySelectorAll?.("[data-leaderboard-modal]") || [])].at(-1);
  return nested || surface.dialogHost.querySelector?.("[data-leaderboard-home-dialog]") || null;
}

function focusElement(target) {
  if (!target?.focus) return false;
  try { target.focus({ preventScroll: true }); } catch { target.focus(); }
  return true;
}

function ensureTopDialogFocus(surface) {
  const dialog = getTopDialog(surface);
  if (!dialog) return false;
  const active = surface.runtime.context.win?.document?.activeElement;
  if (dialog.contains?.(active) && !active?.disabled && !active?.matches?.(":disabled")) return true;
  return focusElement(getFocusable(dialog)[0] || dialog);
}

function handleDialogKeydown(surface, event) {
  if (!surface.dialogOpen || event.defaultPrevented) return;
  const state = surface.runtime.store.getState();
  const dialog = getTopDialog(surface);
  const outer = surface.dialogHost.querySelector?.("[data-leaderboard-home-dialog]");
  const innerOpen = Boolean(dialog && dialog !== outer);
  if (event.key === "Escape") {
    if (isProtectedWrite(state)) {
      event.preventDefault?.();
      ensureTopDialogFocus(surface);
    }
    else if (!innerOpen && closeDialog(surface)) event.preventDefault?.();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const focusable = getFocusable(dialog);
  if (!focusable.length) {
    event.preventDefault?.();
    focusElement(dialog);
    return;
  }
  const active = surface.runtime.context.win?.document?.activeElement;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!dialog.contains?.(active)) { event.preventDefault?.(); focusElement(event.shiftKey ? last : first); }
  else if (event.shiftKey && active === first) { event.preventDefault?.(); focusElement(last); }
  else if (!event.shiftKey && active === last) { event.preventDefault?.(); focusElement(first); }
}

async function openAward(surface, initial = {}, opener = null) {
  if (!openDialog(surface, opener)) return false;
  const date = normalizeLeaderboardDate(initial.occurredOn);
  const currentMonth = getLeaderboardMonthValue(surface.runtime.context.getNow());
  if (date && date.slice(0, 7) !== currentMonth) {
    navigateLeaderboardMonth(date.slice(0, 7), surface.runtime, { replace: true });
    surface.runtime.store.setState({ ui: { notice: { tone: "neutral", message: "Completed Leaderboard months are read-only.", undoEventId: "" } } });
    return false;
  }
  if (surface.runtime.store.getState().month !== currentMonth) restoreLeaderboardCurrentMonth(surface.runtime);
  if (surface.runtime.store.getState().status !== "ready") await surface.runtime.loadPromise;
  if (!surface.mounted || !surface.dialogOpen) return false;
  const awardInitial = {};
  if (date) awardInitial.occurredOn = date;
  if (Object.prototype.hasOwnProperty.call(initial, "title")) awardInitial.title = normalizeLeaderboardText(initial.title, 160);
  const opened = openLeaderboardAward(awardInitial, surface.runtime);
  if (!opened) surface.runtime.store.setState({ ui: { notice: { tone: "neutral", message: "Leaderboard is read-only for your current access.", undoEventId: "" } } });
  return opened;
}

function bindSurface(surface) {
  listen(surface, surface.summaryRoot, "click", (event) => {
    const target = event.target;
    if (target?.closest?.("[data-leaderboard-home-open]")) { openDialog(surface, target.closest("button")); return; }
    if (target?.closest?.("[data-leaderboard-home-retry]")) { runLeaderboardLoad(getLeaderboardMonthValue(surface.runtime.context.getNow()), surface.runtime, { replace: true }); return; }
    if (target?.closest?.("[data-leaderboard-home-award]")) { openAward(surface, {}, target.closest("button")); return; }
    const player = target?.closest?.("[data-leaderboard-home-player], [data-leaderboard-player-detail]");
    if (player && openDialog(surface, player)) openLeaderboardPlayerDetail(player.dataset.leaderboardHomePlayer || player.dataset.leaderboardPlayerDetail, surface.runtime);
  });
  listen(surface, surface.dialogHost, "click", (event) => {
    const target = event.target;
    const closeButton = target?.closest?.("button[data-leaderboard-home-close]");
    const backdrop = target?.matches?.("[data-leaderboard-home-dialog-layer][data-leaderboard-home-close]");
    if (closeButton || backdrop) { closeDialog(surface); return; }
    handleClick(event, surface.dialogContext);
  });
  listen(surface, surface.dialogHost, "input", (event) => handleInput(event, surface.dialogContext));
  listen(surface, surface.dialogHost, "change", (event) => handleChange(event, surface.dialogContext));
  listen(surface, surface.dialogHost, "submit", (event) => handleSubmit(event, surface.dialogContext));
  listen(surface, surface.runtime.context.win?.document, "keydown", (event) => handleDialogKeydown(surface, event));
}

function cleanupSurface(surface, options = {}) {
  if (!surface.mounted) return;
  if (surface.dialogOpen) {
    unlockNestedModal(surface);
    unmountLeaderboardWorkspace(surface.workspace);
    surface.dialogHost.innerHTML = "";
    unlockBackground(surface);
  }
  surface.mounted = false;
  surface.dialogOpen = false;
  surface.unsubscribe?.();
  surface.removeRuntimeDispose?.();
  surface.listeners.splice(0).forEach((remove) => remove());
  if (options.clearSummary !== false) surface.summaryRoot.innerHTML = "";
  if (activeSurface === surface) activeSurface = null;
}

export function mountLeaderboardHome(context = {}) {
  const summaryRoot = context.ui?.leaderboardSummary;
  const dialogHost = context.ui?.leaderboardDialogHost;
  if (!summaryRoot || !dialogHost) throw new TypeError("Leaderboard Home requires summary and dialog host roots.");
  const runtime = ensureLeaderboardRuntime(context);
  if (activeSurface?.runtime === runtime && activeSurface.summaryRoot === summaryRoot && activeSurface.dialogHost === dialogHost) {
    activeSurface.sourceContext = context;
    renderSummary(activeSurface);
    return activeSurface.handle;
  }
  if (activeSurface && !activeSurface.handle.unmount()) return activeSurface.handle;
  const surface = {
    runtime,
    sourceContext: context,
    summaryRoot,
    dialogHost,
    workspace: null,
    dialogContext: null,
    dialogOpen: false,
    mounted: true,
    opener: null,
    openerPlayerId: "",
    listeners: [],
    backgroundRecords: [],
    nestedRecords: [],
    nestedOuterRecord: null,
    dialogSyncQueued: false,
    unsubscribe: null,
    removeRuntimeDispose: null,
    handle: null,
  };
  surface.handle = Object.freeze({
    openDialog: (opener = null) => openDialog(surface, opener),
    openAward: (initial = {}, opener = null) => openAward(surface, initial, opener),
    requestClose: () => closeDialog(surface),
    unmount: (options = {}) => {
      if (options?.force === true) {
        resetSharedLeaderboardRuntime();
        cleanupSurface(surface);
        return true;
      }
      if (isProtectedWrite(surface.runtime.store.getState())) return false;
      closeDialog(surface, false);
      cleanupSurface(surface);
      return true;
    },
  });
  activeSurface = surface;
  bindSurface(surface);
  surface.unsubscribe = runtime.store.subscribe(() => {
    renderSummary(surface);
    syncDialogChrome(surface);
    queueDialogChrome(surface);
  });
  surface.removeRuntimeDispose = onLeaderboardRuntimeDispose(runtime, () => cleanupSurface(surface));
  renderSummary(surface);
  initializeLeaderboardRuntime(runtime);
  return surface.handle;
}
