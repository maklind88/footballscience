import { createLeaderboardActions } from "./leaderboard-actions.mjs";
import {
  createLeaderboardIdempotencyKey,
  getLeaderboardMonthValue,
  shiftLeaderboardMonth,
} from "./leaderboard-helpers.mjs";
import { renderLeaderboardWorkspace } from "./leaderboard-renderer.mjs";
import { getLeaderboardMonthBounds, isLeaderboardCurrentMonth } from "./leaderboard-selectors.mjs";
import { createLeaderboardAwardDraft, createLeaderboardState, createLeaderboardStore } from "./leaderboard-state.mjs";
import { createLeaderboardApiService } from "./services/leaderboard-api-service.mjs";

let runtime = null;
const keyboardDocuments = new WeakSet();

function normalizeContext(context = {}) {
  const team = context.team || null;
  const currentUser = context.currentUser || null;
  const teamId = context.scopeKey || context.teamId || team?.id || team?.teamId || team?.team_id || currentUser?.teamId || currentUser?.team_id || "unscoped-team";
  const userId = currentUser?.id || currentUser?.userId || currentUser?.user_id || "anonymous-user";
  return {
    ui: context.ui || {},
    win: context.win || globalThis,
    team,
    teamId: context.teamId || team?.id || "",
    currentUser,
    scopeSignature: `${String(teamId).trim()}::${String(userId).trim()}`,
    teamName: context.teamName || team?.name || "",
    teamLogoUrl: context.teamLogoUrl || context.logo || team?.logoUrl || team?.logo_url || "",
    getAuthToken: typeof context.getAuthToken === "function" ? context.getAuthToken : () => "",
    getNow: typeof context.getNow === "function" ? context.getNow : () => new Date(),
    canEdit: typeof context.canEdit === "function" ? context.canEdit : () => Boolean(context.canEdit),
    fetchImpl: context.fetchImpl,
  };
}

function getRoot(activeRuntime = runtime) {
  return activeRuntime?.context?.ui?.leaderboardWorkspace || null;
}

function getDocument(activeRuntime = runtime) {
  return activeRuntime?.context?.win?.document || globalThis.document || null;
}

function canEdit(activeRuntime = runtime) {
  try {
    return Boolean(activeRuntime?.context?.canEdit?.());
  } catch {
    return false;
  }
}

function capturePaintState(activeRuntime = runtime) {
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

function restorePaintState(activeRuntime = runtime, paintState = {}) {
  const root = getRoot(activeRuntime);
  const sheetScroll = root?.querySelector?.(".leaderboard-sheet-scroll");
  if (sheetScroll && paintState.sheetScrollTop) sheetScroll.scrollTop = paintState.sheetScrollTop;
  if (!paintState.focusKey) return;
  const target = root?.querySelector?.(`[data-leaderboard-focus-key="${paintState.focusKey}"]`);
  if (!target) return;
  try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
  if (paintState.selectionStart === null) return;
  try { target.setSelectionRange?.(paintState.selectionStart, paintState.selectionEnd); } catch {}
}

function paint(activeRuntime = runtime) {
  const root = getRoot(activeRuntime);
  if (!root) return;
  const paintState = capturePaintState(activeRuntime);
  root.innerHTML = renderLeaderboardWorkspace(activeRuntime.store.getState(), activeRuntime.context);
  restorePaintState(activeRuntime, paintState);
}

function queueFocus(selector, activeRuntime = runtime) {
  const focus = () => getRoot(activeRuntime)?.querySelector?.(selector)?.focus?.();
  const win = activeRuntime?.context?.win || globalThis;
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(focus);
  else focus();
}

function queueDatasetFocus(selector, datasetKey, value, activeRuntime = runtime) {
  const focus = () => {
    const candidates = Array.from(getRoot(activeRuntime)?.querySelectorAll?.(selector) || []);
    candidates.find((candidate) => candidate.dataset?.[datasetKey] === value)?.focus?.();
  };
  const win = activeRuntime?.context?.win || globalThis;
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(focus);
  else focus();
}

function ensureRuntime(context = {}) {
  const nextContext = normalizeContext(context);
  if (runtime) {
    if (runtime.context.scopeSignature !== nextContext.scopeSignature) {
      runtime = null;
      return ensureRuntime(context);
    }
    Object.assign(runtime.context, nextContext);
    return runtime;
  }
  const store = createLeaderboardStore(createLeaderboardState(nextContext.getNow()));
  const api = createLeaderboardApiService(nextContext);
  const actions = createLeaderboardActions({ store, api, context: nextContext });
  runtime = { context: nextContext, store, api, actions, initialized: false, loadPromise: null };
  store.subscribe(() => paint(runtime));
  return runtime;
}

function runLoad(month, activeRuntime = runtime) {
  if (!activeRuntime || activeRuntime.loadPromise) return activeRuntime?.loadPromise || Promise.resolve();
  activeRuntime.loadPromise = activeRuntime.actions.loadMonth(month)
    .catch(() => null)
    .finally(() => { activeRuntime.loadPromise = null; });
  return activeRuntime.loadPromise;
}

function resetDraftForMonth(month, activeRuntime = runtime) {
  const now = activeRuntime.context.getNow();
  const draft = createLeaderboardAwardDraft(now);
  const bounds = getLeaderboardMonthBounds(month, now);
  draft.occurredOn = bounds.max;
  return draft;
}

function navigateMonth(month, activeRuntime = runtime) {
  const state = activeRuntime.store.getState();
  if (state.ui.pendingAction || activeRuntime.loadPromise) return;
  activeRuntime.store.setState({
    month,
    draft: resetDraftForMonth(month, activeRuntime),
    ui: { awardOpen: false, selectedPlayerId: "", reverseEventId: "", draftError: "", notice: null },
  }, { notify: false });
  runLoad(month, activeRuntime);
}

function translateAssignments(assignments = {}, nextMode = "placements") {
  return Object.fromEntries(Object.entries(assignments).map(([playerId, assignment]) => [playerId,
    nextMode === "same"
      ? { selected: Boolean(assignment?.selected || assignment?.placement) }
      : { placement: Number(assignment?.placement) || (assignment?.selected ? 1 : 0) },
  ]));
}

function closeTopOverlay(activeRuntime = runtime) {
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
    activeRuntime.store.setState({ ui: { awardOpen: false, draftError: "" } });
    queueFocus("[data-leaderboard-open-award]", activeRuntime);
  }
  else return false;
  return true;
}

function bindKeyboard(activeRuntime = runtime) {
  const doc = getDocument(activeRuntime);
  if (!doc || typeof doc.addEventListener !== "function" || keyboardDocuments.has(doc)) return;
  keyboardDocuments.add(doc);
  doc.addEventListener("keydown", (event) => {
    const root = getRoot(runtime);
    if (!root?.contains?.(event.target)) return;
    if (event.key === "Escape" && closeTopOverlay(runtime)) {
      event.preventDefault();
      return;
    }
    const playerRow = event.target?.closest?.("tr[data-leaderboard-player-detail]");
    if (playerRow && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      runtime.store.setState({ ui: { selectedPlayerId: playerRow.dataset.leaderboardPlayerDetail || "" } });
      queueFocus("button[data-leaderboard-close-player]", runtime);
      return;
    }
    const modal = event.target?.closest?.("[data-leaderboard-modal]");
    if (!modal || event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex='0']")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

export function render(context = {}) {
  const activeRuntime = ensureRuntime(context);
  paint(activeRuntime);
  bindKeyboard(activeRuntime);
  if (!activeRuntime.initialized) {
    activeRuntime.initialized = true;
    runLoad(activeRuntime.store.getState().month, activeRuntime);
  }
  return activeRuntime;
}

export function handleInput(event, context = null) {
  const activeRuntime = context ? ensureRuntime(context) : runtime;
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
  const activeRuntime = context ? ensureRuntime(context) : runtime;
  const target = event?.target;
  if (!activeRuntime || !target) return;
  if (target.matches?.("[data-leaderboard-award-date]")) activeRuntime.store.setState({ draft: { occurredOn: target.value || "" } }, { notify: false });
  if (target.matches?.("[data-leaderboard-custom-points]")) activeRuntime.store.setState({ draft: { customPoints: target.value || "" } });
}

export function handleClick(event, context = null) {
  const activeRuntime = context ? ensureRuntime(context) : runtime;
  const target = event?.target;
  if (!activeRuntime || !target) return;
  const state = activeRuntime.store.getState();
  const closeAward = target.closest?.("button[data-leaderboard-close-award]") || target.matches?.(".leaderboard-layer[data-leaderboard-close-award]");
  if (closeAward) { activeRuntime.store.setState({ ui: { awardOpen: false, draftError: "" } }); queueFocus("[data-leaderboard-open-award]", activeRuntime); return; }
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
  if (target.closest?.("[data-leaderboard-retry]")) { runLoad(state.month, activeRuntime); return; }
  if (target.closest?.("[data-leaderboard-clear-search]")) { activeRuntime.store.setState({ ui: { standingsSearch: "" } }); return; }
  const shift = target.closest?.("[data-leaderboard-shift-month]");
  if (shift) { navigateMonth(shiftLeaderboardMonth(state.month, Number(shift.dataset.leaderboardShiftMonth)), activeRuntime); return; }
  if (target.closest?.("[data-leaderboard-today]")) { navigateMonth(getLeaderboardMonthValue(activeRuntime.context.getNow()), activeRuntime); return; }
  if (target.closest?.("[data-leaderboard-open-award]")) {
    if (!canEdit(activeRuntime) || state.status !== "ready" || !isLeaderboardCurrentMonth(state.month, activeRuntime.context.getNow())) return;
    const bounds = getLeaderboardMonthBounds(state.month, activeRuntime.context.getNow());
    const occurredOn = state.draft.occurredOn < bounds.min || state.draft.occurredOn > bounds.max ? bounds.max : state.draft.occurredOn;
    activeRuntime.store.setState({ draft: { occurredOn }, ui: { awardOpen: true, draftError: "" } });
    queueFocus("[data-leaderboard-award-title]", activeRuntime);
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
  if (player) { activeRuntime.store.setState({ ui: { selectedPlayerId: player.dataset.leaderboardPlayerDetail || "" } }); queueFocus("button[data-leaderboard-close-player]", activeRuntime); return; }
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
  const activeRuntime = context ? ensureRuntime(context) : runtime;
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
  return runtime?.store?.getState?.() || null;
}

export function resetLeaderboardRuntime() {
  runtime = null;
}

export * from "./leaderboard-actions.mjs";
export * from "./leaderboard-adapter.mjs";
export * from "./leaderboard-renderer.mjs";
export * from "./leaderboard-selectors.mjs";
export * from "./leaderboard-state.mjs";
export * from "./services/leaderboard-api-service.mjs";
