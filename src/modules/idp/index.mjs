import { createIdpActions } from "./idp-actions.mjs";
import { createIdpStore } from "./idp-state.mjs";
import { renderIdpWorkspace as renderMarkup } from "./idp-renderer.mjs";
import { createIdpApiService } from "./services/idp-api-service.mjs";

let runtime = null;

function normalizeContext(context = {}) {
  return {
    ui: context.ui || {},
    win: context.win || globalThis,
    currentUser: context.currentUser || null,
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

function paint(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root) return;
  root.innerHTML = renderMarkup(activeRuntime.store.getState(), {
    canEdit: canEdit(activeRuntime.context),
  });
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
    store,
  };
  store.subscribe(() => paint(runtime));
  return runtime;
}

async function boot(activeRuntime) {
  if (activeRuntime.initialized) return;
  activeRuntime.initialized = true;
  await activeRuntime.actions.loadDashboard();
  const state = activeRuntime.store.getState();
  const playerId = state.ui.selectedPlayerId || state.dashboardPlayers?.[0]?.profile?.playerId || "";
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
  runAction(() => boot(activeRuntime));
}

export function handleInput(event) {
  const target = event?.target;
  if (!target?.matches?.("[data-idp-search]")) return;
  runtime?.store.setState({ ui: { searchQuery: target.value || "" } });
}

export function handleChange(event) {
  const target = event?.target;
  const filter = target?.dataset?.idpFilter || "";
  if (!filter) return;
  if (filter === "status") runtime?.store.setState({ ui: { statusFilter: target.value || "All" } });
  if (filter === "category") runtime?.store.setState({ ui: { categoryFilter: target.value || "All" } });
}

export function handleClick(event) {
  const playerTrigger = event?.target?.closest?.("[data-idp-player]");
  if (playerTrigger) {
    runAction(() => runtime?.actions.selectPlayer(playerTrigger.dataset.idpPlayer || ""));
    return;
  }
  const refreshTrigger = event?.target?.closest?.("[data-idp-refresh]");
  if (refreshTrigger) {
    runAction(() => runtime?.actions.refreshSelectedPlayer());
  }
}

export function handleSubmit(event) {
  const form = event?.target;
  if (!form?.matches?.("[data-idp-create-focus], [data-idp-add-evidence], [data-idp-complete-review]")) {
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
}
