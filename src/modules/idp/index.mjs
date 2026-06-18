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
  if (!activeElement?.matches?.("[data-idp-search]")) return null;
  const value = activeElement.value || "";
  return {
    end: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : value.length,
    start: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : value.length,
  };
}

function restoreSearchFocus(activeRuntime = runtime, focusState = null) {
  if (!focusState) return;
  const input = getRoot(activeRuntime?.context)?.querySelector?.("[data-idp-search]");
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
    await activeRuntime.actions.selectPlayer(playerId);
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

export function render(context = {}) {
  const activeRuntime = ensureRuntime(context);
  paint(activeRuntime);
  startAutoSync(activeRuntime);
  runAction(() => boot(activeRuntime));
}

export function handleInput(event) {
  const target = event?.target;
  if (!target?.matches?.("[data-idp-search]")) return;
  runtime?.store.setState({ ui: { searchQuery: target.value || "" } });
}

export function handleChange(event) {
  const target = event?.target;
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
    runtime?.store.setState({ ui: { actionMode: "" } });
    return;
  }
  const backTrigger = event?.target?.closest?.("[data-idp-back-overview]");
  if (backTrigger) {
    revokePreviewUrl(runtime);
    runtime?.store.setState({ ui: { selectedPlayerId: "", actionMode: "", error: "", message: "" } });
    scrollWorkspaceTop(runtime);
    return;
  }
  const actionTrigger = event?.target?.closest?.("[data-idp-action]");
  if (actionTrigger) {
    runtime?.store.setState({
      ui: {
        actionMode: actionTrigger.dataset.idpAction || "",
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
  if (!form?.matches?.("[data-idp-create-focus], [data-idp-add-evidence], [data-idp-complete-review], [data-idp-assign-owner]")) {
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
  if (form.matches("[data-idp-complete-review]")) {
    runAction(() => runtime?.actions.completeReview(formData));
  }
  if (form.matches("[data-idp-assign-owner]")) {
    runAction(() => runtime?.actions.assignOwner(formData));
  }
}
