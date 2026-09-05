import {
  createLeaderboardIdempotencyKey,
  getLeaderboardMonthValue,
  normalizeLeaderboardDate,
  normalizeLeaderboardText,
  shiftLeaderboardMonth,
} from "./leaderboard-helpers.mjs";
import { canAwardLeaderboard } from "./leaderboard-access.mjs";
import { renderLeaderboardWorkspace } from "./leaderboard-renderer.mjs";
import { getLeaderboardMonthBounds, isLeaderboardCurrentMonth } from "./leaderboard-selectors.mjs";
import { createLeaderboardAwardDraft } from "./leaderboard-state.mjs";
import {
  ensureLeaderboardRuntime,
  getActiveLeaderboardRuntime,
  initializeLeaderboardRuntime,
  onLeaderboardRuntimeDispose,
  resetSharedLeaderboardRuntime,
  runLeaderboardLoad,
} from "./leaderboard-runtime.mjs";

let workspaceSurface = null;
const keyboardDocuments = new WeakSet();

function getRoot(activeRuntime = getActiveLeaderboardRuntime()) {
  if (workspaceSurface?.runtime === activeRuntime) return workspaceSurface.root;
  return activeRuntime?.context?.ui?.leaderboardWorkspace || null;
}

function getDocument(activeRuntime = getActiveLeaderboardRuntime()) {
  return activeRuntime?.context?.win?.document || globalThis.document || null;
}

function canEdit(activeRuntime = getActiveLeaderboardRuntime()) {
  return Boolean(activeRuntime && canAwardLeaderboard(activeRuntime.store.getState(), activeRuntime.context));
}

function capturePaintState(activeRuntime = getActiveLeaderboardRuntime()) {
  const root = getRoot(activeRuntime);
  const active = getDocument(activeRuntime)?.activeElement;
  const focusKey = root?.contains?.(active) ? active?.dataset?.leaderboardFocusKey || "" : "";
  return {
    focusKey,
    selectionStart: Number.isInteger(active?.selectionStart) ? active.selectionStart : null,
    selectionEnd: Number.isInteger(active?.selectionEnd) ? active.selectionEnd : null,
    sheetScrollTop: root?.querySelector?.(".leaderboard-sheet-scroll")?.scrollTop || 0,
  };
}

function getModalFocusables(modal) {
  return [...(modal?.querySelectorAll?.("button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex='0']") || [])]
    .filter((item) => !item.disabled && !item.matches?.(":disabled") && !item.closest?.("[inert]"));
}

function focusSafely(target) {
  if (!target?.focus) return false;
  try { target.focus({ preventScroll: true }); } catch { target.focus(); }
  return true;
}

function ensureTopModalFocus(activeRuntime = getActiveLeaderboardRuntime()) {
  const root = getRoot(activeRuntime);
  const doc = getDocument(activeRuntime);
  const modals = [...(root?.querySelectorAll?.("[data-leaderboard-modal]") || [])];
  const modal = modals.at(-1);
  if (!modal) return false;
  const active = doc?.activeElement;
  if (modal.contains?.(active) && !active?.disabled && !active?.matches?.(":disabled")) return true;
  return focusSafely(getModalFocusables(modal)[0] || modal);
}

function restorePaintState(activeRuntime = getActiveLeaderboardRuntime(), paintState = {}) {
  const root = getRoot(activeRuntime);
  const sheetScroll = root?.querySelector?.(".leaderboard-sheet-scroll");
  if (sheetScroll && paintState.sheetScrollTop) sheetScroll.scrollTop = paintState.sheetScrollTop;
  const target = paintState.focusKey
    ? root?.querySelector?.(`[data-leaderboard-focus-key="${paintState.focusKey}"]`)
    : null;
  if (target && !target.disabled && !target.matches?.(":disabled")) {
    focusSafely(target);
    if (paintState.selectionStart !== null) {
      try { target.setSelectionRange?.(paintState.selectionStart, paintState.selectionEnd); } catch {}
    }
  }
  ensureTopModalFocus(activeRuntime);
}

function paint(activeRuntime = getActiveLeaderboardRuntime()) {
  const root = getRoot(activeRuntime);
  if (!root) return;
  const paintState = capturePaintState(activeRuntime);
  root.innerHTML = renderLeaderboardWorkspace(activeRuntime.store.getState(), activeRuntime.context);
  restorePaintState(activeRuntime, paintState);
}

function queueFocus(selector, activeRuntime = getActiveLeaderboardRuntime()) {
  const focus = () => getRoot(activeRuntime)?.querySelector?.(selector)?.focus?.();
  const win = activeRuntime?.context?.win || globalThis;
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(focus);
  else focus();
}

function queueDatasetFocus(selector, datasetKey, value, activeRuntime = getActiveLeaderboardRuntime()) {
  const focus = () => {
    const candidates = Array.from(getRoot(activeRuntime)?.querySelectorAll?.(selector) || []);
    candidates.find((candidate) => candidate.dataset?.[datasetKey] === value)?.focus?.();
  };
  const win = activeRuntime?.context?.win || globalThis;
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(focus);
  else focus();
}

function detachWorkspaceSurface(surface = workspaceSurface) {
  if (!surface || workspaceSurface !== surface) return false;
  workspaceSurface = null;
  surface.unsubscribe?.();
  surface.removeDisposeListener?.();
  return true;
}

function attachWorkspaceSurface(activeRuntime, root) {
  if (!root) return;
  if (workspaceSurface?.runtime === activeRuntime && workspaceSurface.root === root) return;
  detachWorkspaceSurface();
  const surface = { runtime: activeRuntime, root, unsubscribe: null, removeDisposeListener: null };
  workspaceSurface = surface;
  surface.unsubscribe = activeRuntime.store.subscribe(() => paint(activeRuntime));
  surface.removeDisposeListener = onLeaderboardRuntimeDispose(activeRuntime, () => detachWorkspaceSurface(surface));
}

export function unmountLeaderboardWorkspace(root = null) {
  if (root && workspaceSurface?.root !== root) return false;
  return detachWorkspaceSurface();
}

function resetDraftForMonth(month, activeRuntime = getActiveLeaderboardRuntime()) {
  const now = activeRuntime.context.getNow();
  const draft = createLeaderboardAwardDraft(now);
  const bounds = getLeaderboardMonthBounds(month, now);
  draft.occurredOn = bounds.max;
  return draft;
}

export function navigateLeaderboardMonth(month, activeRuntime = getActiveLeaderboardRuntime(), options = {}) {
  const state = activeRuntime.store.getState();
  if (state.ui.pendingAction || (activeRuntime.loadPromise && !options.replace)) return false;
  activeRuntime.store.setState({
    month,
    draft: resetDraftForMonth(month, activeRuntime),
    ui: { awardOpen: false, selectedPlayerId: "", reverseEventId: "", draftError: "", notice: null },
  }, { notify: false });
  runLeaderboardLoad(month, activeRuntime, { replace: Boolean(options.replace) });
  return true;
}

export function restoreLeaderboardCurrentMonth(activeRuntime = getActiveLeaderboardRuntime()) {
  if (!activeRuntime) return false;
  const state = activeRuntime.store.getState();
  if (state.ui.pendingAction) return false;
  const month = getLeaderboardMonthValue(activeRuntime.context.getNow());
  const cached = state.monthCache?.[month] || null;
  activeRuntime.store.setState({
    month,
    status: cached?.status === "ready" ? "ready" : "loading",
    data: cached?.data || null,
    requestError: cached?.error || "",
    draft: resetDraftForMonth(month, activeRuntime),
    ui: { awardOpen: false, selectedPlayerId: "", reverseEventId: "", reverseReason: "", reverseIdempotencyKey: "", draftError: "", notice: null },
  });
  if (cached?.status !== "ready") runLeaderboardLoad(month, activeRuntime, { replace: true });
  return true;
}

function translateAssignments(assignments = {}, nextMode = "placements") {
  return Object.fromEntries(Object.entries(assignments).map(([playerId, assignment]) => [playerId,
    nextMode === "same"
      ? { selected: Boolean(assignment?.selected || assignment?.placement) }
      : { placement: Number(assignment?.placement) || (assignment?.selected ? 1 : 0) },
  ]));
}

function closeTopOverlay(activeRuntime = getActiveLeaderboardRuntime()) {
  const state = activeRuntime?.store?.getState?.();
  if (!state) return false;
  if (state.ui.reverseEventId) {
    if (state.ui.pendingAction === "reverse") return false;
    const eventId = state.ui.reverseEventId;
    activeRuntime.store.setState({ ui: { reverseEventId: "", reverseReason: "", draftError: "" } });
    queueDatasetFocus("[data-leaderboard-open-reverse]", "leaderboardOpenReverse", eventId, activeRuntime);
  } else if (state.ui.selectedPlayerId) {
    const playerId = state.ui.selectedPlayerId;
    activeRuntime.store.setState({ ui: { selectedPlayerId: "" } });
    queueDatasetFocus("[data-leaderboard-player-detail]", "leaderboardPlayerDetail", playerId, activeRuntime);
  } else if (state.ui.awardOpen) {
    if (state.ui.pendingAction === "award") return false;
    activeRuntime.store.setState({ ui: { awardOpen: false, draftError: "" } });
    queueFocus("[data-leaderboard-open-award]", activeRuntime);
  }
  else return false;
  return true;
}

export function openLeaderboardPlayerDetail(playerId = "", activeRuntime = getActiveLeaderboardRuntime()) {
  const safePlayerId = normalizeLeaderboardText(playerId, 120);
  if (!activeRuntime || !safePlayerId) return false;
  activeRuntime.store.setState({ ui: { selectedPlayerId: safePlayerId } });
  queueFocus("button[data-leaderboard-close-player]", activeRuntime);
  return true;
}

export function openLeaderboardAward(initial = {}, activeRuntime = getActiveLeaderboardRuntime()) {
  if (!activeRuntime) return false;
  const state = activeRuntime.store.getState();
  const now = activeRuntime.context.getNow();
  if (!canEdit(activeRuntime) || state.status !== "ready" || !isLeaderboardCurrentMonth(state.month, now)) return false;
  const bounds = getLeaderboardMonthBounds(state.month, now);
  const requestedDate = normalizeLeaderboardDate(initial.occurredOn);
  const occurredOn = requestedDate >= bounds.min && requestedDate <= bounds.max
    ? requestedDate
    : state.draft.occurredOn < bounds.min || state.draft.occurredOn > bounds.max ? bounds.max : state.draft.occurredOn;
  const draftPatch = { occurredOn };
  if (Object.prototype.hasOwnProperty.call(initial, "title")) draftPatch.title = normalizeLeaderboardText(initial.title, 160);
  activeRuntime.store.setState({ draft: draftPatch, ui: { awardOpen: true, draftError: "" } });
  queueFocus("[data-leaderboard-award-title]", activeRuntime);
  return true;
}

function bindKeyboard(activeRuntime = getActiveLeaderboardRuntime()) {
  const doc = getDocument(activeRuntime);
  if (!doc || typeof doc.addEventListener !== "function" || keyboardDocuments.has(doc)) return;
  keyboardDocuments.add(doc);
  doc.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const currentRuntime = getActiveLeaderboardRuntime();
    const root = getRoot(currentRuntime);
    const modals = [...(root?.querySelectorAll?.("[data-leaderboard-modal]") || [])];
    const modal = modals.at(-1);
    const targetInRoot = root?.contains?.(event.target);
    if (!targetInRoot && !modal) return;
    if (event.key === "Escape" && closeTopOverlay(currentRuntime)) {
      event.preventDefault();
      return;
    }
    const playerRow = targetInRoot ? event.target?.closest?.("tr[data-leaderboard-player-detail]") : null;
    if (playerRow && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openLeaderboardPlayerDetail(playerRow.dataset.leaderboardPlayerDetail || "", currentRuntime);
      return;
    }
    if (!modal || event.key !== "Tab") return;
    const focusable = getModalFocusables(modal);
    if (!focusable.length) {
      event.preventDefault();
      focusSafely(modal);
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!modal.contains?.(doc.activeElement)) { event.preventDefault(); focusSafely(event.shiftKey ? last : first); }
    else if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); focusSafely(last); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); focusSafely(first); }
  });
}

export function render(context = {}) {
  const activeRuntime = ensureLeaderboardRuntime(context);
  attachWorkspaceSurface(activeRuntime, context.ui?.leaderboardWorkspace || activeRuntime.context.ui?.leaderboardWorkspace);
  paint(activeRuntime);
  bindKeyboard(activeRuntime);
  initializeLeaderboardRuntime(activeRuntime);
  return activeRuntime;
}

export function handleInput(event, context = null) {
  const activeRuntime = context ? ensureLeaderboardRuntime(context) : getActiveLeaderboardRuntime();
  const target = event?.target;
  if (!activeRuntime || !target) return;
  if (target.matches?.("[data-leaderboard-standings-search]")) activeRuntime.store.setState({ ui: { standingsSearch: target.value || "" } });
  if (target.matches?.("[data-leaderboard-award-search]")) activeRuntime.store.setState({ draft: { searchQuery: target.value || "" } });
  if (target.matches?.("[data-leaderboard-custom-points]")) activeRuntime.store.setState({ draft: { customPoints: target.value || "" } });
  if (target.matches?.("[data-leaderboard-award-title]")) activeRuntime.store.setState({ draft: { title: target.value || "" } }, { notify: false });
  if (target.matches?.("[data-leaderboard-award-note]")) activeRuntime.store.setState({ draft: { note: target.value || "" } }, { notify: false });
  if (target.matches?.("[data-leaderboard-reverse-reason]")) activeRuntime.store.setState({ ui: { reverseReason: target.value || "" } }, { notify: false });
}

export function handleChange(event, context = null) {
  const activeRuntime = context ? ensureLeaderboardRuntime(context) : getActiveLeaderboardRuntime();
  const target = event?.target;
  if (!activeRuntime || !target) return;
  if (target.matches?.("[data-leaderboard-award-date]")) activeRuntime.store.setState({ draft: { occurredOn: target.value || "" } }, { notify: false });
  if (target.matches?.("[data-leaderboard-custom-points]")) activeRuntime.store.setState({ draft: { customPoints: target.value || "" } });
}

export function handleClick(event, context = null) {
  const activeRuntime = context ? ensureLeaderboardRuntime(context) : getActiveLeaderboardRuntime();
  const target = event?.target;
  if (!activeRuntime || !target) return;
  const state = activeRuntime.store.getState();
  const closeAward = target.closest?.("button[data-leaderboard-close-award]") || target.matches?.(".leaderboard-layer[data-leaderboard-close-award]");
  if (closeAward) {
    if (state.ui.pendingAction === "award") return;
    activeRuntime.store.setState({ ui: { awardOpen: false, draftError: "" } });
    queueFocus("[data-leaderboard-open-award]", activeRuntime);
    return;
  }
  const closePlayer = target.closest?.("button[data-leaderboard-close-player]") || target.matches?.(".leaderboard-layer[data-leaderboard-close-player]");
  if (closePlayer) { const playerId = state.ui.selectedPlayerId; activeRuntime.store.setState({ ui: { selectedPlayerId: "" } }); queueDatasetFocus("[data-leaderboard-player-detail]", "leaderboardPlayerDetail", playerId, activeRuntime); return; }
  const closeReverse = target.closest?.("button[data-leaderboard-close-reverse]") || target.matches?.(".leaderboard-layer[data-leaderboard-close-reverse]");
  if (closeReverse) {
    if (state.ui.pendingAction === "reverse") return;
    const eventId = state.ui.reverseEventId;
    activeRuntime.store.setState({ ui: { reverseEventId: "", reverseReason: "", draftError: "" } });
    queueDatasetFocus("[data-leaderboard-open-reverse]", "leaderboardOpenReverse", eventId, activeRuntime);
    return;
  }
  const tab = target.closest?.("[data-leaderboard-tab]");
  if (tab) { activeRuntime.store.setState({ ui: { tab: tab.dataset.leaderboardTab === "activity" ? "activity" : "standings" } }); return; }
  if (target.closest?.("[data-leaderboard-retry]")) { runLeaderboardLoad(state.month, activeRuntime, { replace: true }); return; }
  if (target.closest?.("[data-leaderboard-clear-search]")) { activeRuntime.store.setState({ ui: { standingsSearch: "" } }); return; }
  const shift = target.closest?.("[data-leaderboard-shift-month]");
  if (shift) { navigateLeaderboardMonth(shiftLeaderboardMonth(state.month, Number(shift.dataset.leaderboardShiftMonth)), activeRuntime); return; }
  if (target.closest?.("[data-leaderboard-today]")) { navigateLeaderboardMonth(getLeaderboardMonthValue(activeRuntime.context.getNow()), activeRuntime); return; }
  if (target.closest?.("[data-leaderboard-open-award]")) {
    openLeaderboardAward({}, activeRuntime);
    return;
  }
  const mode = target.closest?.("[data-leaderboard-award-mode]");
  if (mode) {
    const nextMode = mode.dataset.leaderboardAwardMode === "same" ? "same" : "placements";
    activeRuntime.store.setState({ draft: { mode: nextMode, assignments: translateAssignments(state.draft.assignments, nextMode) }, ui: { draftError: "" } });
    return;
  }
  const placement = target.closest?.("[data-leaderboard-assign-placement]");
  if (placement) {
    const playerId = placement.dataset.leaderboardPlayerId || "";
    const nextPlacement = Number(placement.dataset.leaderboardAssignPlacement) || 0;
    const current = state.draft.assignments?.[playerId]?.placement || 0;
    activeRuntime.store.setState({ draft: { assignments: { ...state.draft.assignments, [playerId]: { placement: current === nextPlacement ? 0 : nextPlacement } } }, ui: { draftError: "" } });
    return;
  }
  const winner = target.closest?.("[data-leaderboard-toggle-winner]");
  if (winner) {
    const playerId = winner.dataset.leaderboardToggleWinner || "";
    const selected = Boolean(state.draft.assignments?.[playerId]?.selected);
    activeRuntime.store.setState({ draft: { assignments: { ...state.draft.assignments, [playerId]: { selected: !selected } } }, ui: { draftError: "" } });
    return;
  }
  const points = target.closest?.("[data-leaderboard-same-points]");
  if (points) { activeRuntime.store.setState({ draft: { samePoints: Number(points.dataset.leaderboardSamePoints) || 1, customPoints: "" }, ui: { draftError: "" } }); return; }
  const player = target.closest?.("[data-leaderboard-player-detail]");
  if (player) { openLeaderboardPlayerDetail(player.dataset.leaderboardPlayerDetail || "", activeRuntime); return; }
  const reverse = target.closest?.("[data-leaderboard-open-reverse]");
  if (reverse) {
    if (!isLeaderboardCurrentMonth(state.month, activeRuntime.context.getNow())) return;
    activeRuntime.store.setState({ ui: { reverseEventId: reverse.dataset.leaderboardOpenReverse || "", reverseReason: "", reverseIdempotencyKey: createLeaderboardIdempotencyKey("leaderboard-reverse"), draftError: "" } });
    queueFocus("[data-leaderboard-reverse-reason]", activeRuntime);
    return;
  }
  const undo = target.closest?.("[data-leaderboard-undo]");
  if (undo) { activeRuntime.actions.reverseEvent({ eventId: undo.dataset.leaderboardUndo, reason: "Undo point award", idempotencyKey: state.ui.notice?.idempotencyKey || createLeaderboardIdempotencyKey("leaderboard-undo") }); return; }
  if (target.closest?.("[data-leaderboard-dismiss-notice]")) activeRuntime.store.setState({ ui: { notice: null } });
}

export function handleSubmit(event, context = null) {
  const activeRuntime = context ? ensureLeaderboardRuntime(context) : getActiveLeaderboardRuntime();
  const form = event?.target;
  if (!activeRuntime || !form) return;
  if (form.matches?.("[data-leaderboard-award-form]")) { event.preventDefault?.(); activeRuntime.actions.awardPoints(); }
  if (form.matches?.("[data-leaderboard-reverse-form]")) {
    event.preventDefault?.();
    const state = activeRuntime.store.getState();
    activeRuntime.actions.reverseEvent({ eventId: state.ui.reverseEventId, reason: state.ui.reverseReason, idempotencyKey: state.ui.reverseIdempotencyKey });
  }
}

export function getLeaderboardRuntimeState() {
  return getActiveLeaderboardRuntime()?.store?.getState?.() || null;
}

export function resetLeaderboardRuntime() {
  detachWorkspaceSurface();
  resetSharedLeaderboardRuntime();
}

export * from "./leaderboard-actions.mjs";
export * from "./leaderboard-adapter.mjs";
export * from "./leaderboard-renderer.mjs";
export * from "./leaderboard-selectors.mjs";
export * from "./leaderboard-state.mjs";
export * from "./services/leaderboard-api-service.mjs";
