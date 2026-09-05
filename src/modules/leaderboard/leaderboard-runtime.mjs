import { createLeaderboardActions } from "./leaderboard-actions.mjs";
import { getLeaderboardMonthValue } from "./leaderboard-helpers.mjs";
import { createLeaderboardState, createLeaderboardStore } from "./leaderboard-state.mjs";
import { createLeaderboardApiService } from "./services/leaderboard-api-service.mjs";

let activeRuntime = null;

function normalizeContext(context = {}) {
  const team = context.team || null;
  const currentUser = context.currentUser || null;
  const teamId = context.scopeKey || context.teamId || team?.id || team?.teamId || team?.team_id
    || currentUser?.teamId || currentUser?.team_id || "unscoped-team";
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
    getPlayerProfilesState: typeof context.getPlayerProfilesState === "function"
      ? context.getPlayerProfilesState
      : () => ({}),
    getNow: typeof context.getNow === "function" ? context.getNow : () => new Date(),
    canEdit: typeof context.canEdit === "function" ? context.canEdit : () => Boolean(context.canEdit),
    requireServerAccess: context.requireServerAccess === true,
    fetchImpl: context.fetchImpl,
    allowSyntheticTeamId: context.allowSyntheticTeamId === true || !String(context.scopeKey || "").trim(),
  };
}

function createAbortController(context = {}) {
  const Controller = context.win?.AbortController || globalThis.AbortController;
  return typeof Controller === "function" ? new Controller() : null;
}

function disposeRuntime(runtime) {
  if (!runtime || runtime.disposed) return;
  runtime.disposed = true;
  runtime.requestSequence += 1;
  runtime.readController?.abort?.();
  runtime.lifecycleController?.abort?.();
  runtime.readController = null;
  runtime.loadPromise = null;
  [...runtime.disposeListeners].forEach((listener) => {
    try { listener(); } catch {}
  });
  runtime.disposeListeners.clear();
  if (activeRuntime === runtime) activeRuntime = null;
}

function createRuntime(context) {
  const lifecycleController = createAbortController(context);
  context.getLeaderboardAbortSignal = () => lifecycleController?.signal;
  const store = createLeaderboardStore(createLeaderboardState(context.getNow()));
  const api = createLeaderboardApiService(context);
  const actions = createLeaderboardActions({ store, api, context });
  return {
    context,
    store,
    api,
    actions,
    initialized: false,
    disposed: false,
    loadPromise: null,
    readController: null,
    lifecycleController,
    requestSequence: 0,
    disposeListeners: new Set(),
  };
}

export function ensureLeaderboardRuntime(context = {}) {
  const nextContext = normalizeContext(context);
  if (activeRuntime && activeRuntime.context.scopeSignature !== nextContext.scopeSignature) {
    disposeRuntime(activeRuntime);
  }
  if (!activeRuntime) activeRuntime = createRuntime(nextContext);
  else Object.assign(activeRuntime.context, nextContext);
  return activeRuntime;
}

export function runLeaderboardLoad(month, runtime = activeRuntime, options = {}) {
  if (!runtime || runtime.disposed) return Promise.resolve(null);
  if (runtime.loadPromise && !options.replace) return runtime.loadPromise;
  if (runtime.loadPromise && options.replace) runtime.readController?.abort?.();
  const requestId = ++runtime.requestSequence;
  const scopeSignature = runtime.context.scopeSignature;
  const controller = createAbortController(runtime.context);
  runtime.readController = controller;
  const isCurrent = () => !runtime.disposed
    && activeRuntime === runtime
    && runtime.requestSequence === requestId
    && runtime.context.scopeSignature === scopeSignature;
  const loadPromise = runtime.actions.loadMonth(month, { signal: controller?.signal, isCurrent })
    .catch(() => null)
    .finally(() => {
      if (runtime.requestSequence !== requestId) return;
      runtime.loadPromise = null;
      runtime.readController = null;
    });
  runtime.loadPromise = loadPromise;
  return loadPromise;
}

export function initializeLeaderboardRuntime(runtime = activeRuntime) {
  if (!runtime || runtime.disposed || runtime.initialized) return runtime?.loadPromise || Promise.resolve(null);
  runtime.initialized = true;
  return runLeaderboardLoad(getLeaderboardMonthValue(runtime.context.getNow()), runtime);
}

export function onLeaderboardRuntimeDispose(runtime, listener) {
  if (!runtime || runtime.disposed || typeof listener !== "function") return () => {};
  runtime.disposeListeners.add(listener);
  return () => runtime.disposeListeners.delete(listener);
}

export function getActiveLeaderboardRuntime() {
  return activeRuntime;
}

export function resetSharedLeaderboardRuntime() {
  disposeRuntime(activeRuntime);
}
