function normalizeDelay(value = 0) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function getTimerApi(deps = {}) {
  const windowRef = deps.windowRef || (typeof globalThis !== "undefined" ? globalThis.window : null);
  return {
    clearTimeout: deps.clearTimeout || windowRef?.clearTimeout?.bind(windowRef) || globalThis.clearTimeout,
    setTimeout: deps.setTimeout || windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout,
  };
}

export function createScoutingDatabaseBackgroundController(deps = {}) {
  const timers = getTimerApi(deps);
  let autoLoadTimer = 0;
  let workerPreloadTimer = 0;
  let workerFullPreloadTimer = 0;
  let workerFullRefreshTimer = 0;

  function getState() {
    return deps.ensureState?.() || {};
  }

  function isDatabaseTab() {
    return getState().activeTab === "database";
  }

  function clearTimer(timerId) {
    timers.clearTimeout?.(timerId);
  }

  function cancel() {
    clearTimer(autoLoadTimer);
    clearTimer(workerPreloadTimer);
    clearTimer(workerFullPreloadTimer);
    clearTimer(workerFullRefreshTimer);
    autoLoadTimer = 0;
    workerPreloadTimer = 0;
    workerFullPreloadTimer = 0;
    workerFullRefreshTimer = 0;
  }

  function scheduleWorkerPrewarm(delayMs = 180) {
    clearTimer(workerPreloadTimer);
    workerPreloadTimer = timers.setTimeout?.(() => {
      workerPreloadTimer = 0;
      if (!isDatabaseTab()) {
        return;
      }
      deps.prewarmWorker?.();
    }, normalizeDelay(delayMs));
  }

  function scheduleFullWorkerPreload(delayMs = 650) {
    clearTimer(workerFullPreloadTimer);
    workerFullPreloadTimer = timers.setTimeout?.(() => {
      workerFullPreloadTimer = 0;
      if (!isDatabaseTab()) {
        return;
      }
      deps.prewarmFullWorker?.();
    }, normalizeDelay(delayMs));
  }

  function scheduleWorkerFullRefresh(delayMs = 2500) {
    clearTimer(workerFullRefreshTimer);
    workerFullRefreshTimer = timers.setTimeout?.(() => {
      workerFullRefreshTimer = 0;
      if (
        !isDatabaseTab() ||
        !deps.isWorkerDatabaseActive?.() ||
        deps.getAdvancedFiltersOpen?.() ||
        deps.hasOpenOverlay?.()
      ) {
        return;
      }
      deps.scheduleDatabaseRefresh?.();
    }, normalizeDelay(delayMs));
  }

  function scheduleAutoLoad(delayMs = 320) {
    clearTimer(autoLoadTimer);
    autoLoadTimer = timers.setTimeout?.(() => {
      autoLoadTimer = 0;
      const state = getState();
      const filters = deps.normalizeDatabaseFilters?.(state.databaseFilters) || state.databaseFilters || {};
      if (
        state.activeTab !== "database" ||
        filters.source === "fsdb" ||
        deps.isDatabaseLoaded?.() ||
        deps.isDatabaseLoading?.() ||
        deps.getDatabaseError?.()
      ) {
        return;
      }
      deps.queueDatabaseLoad?.((renderOptions = {}) => {
        if (!isDatabaseTab()) {
          return;
        }
        deps.renderActiveTabSurfaceOrWorkspace?.(renderOptions);
      });
    }, normalizeDelay(delayMs));
  }

  function getTimerIds() {
    return {
      autoLoadTimer,
      workerPreloadTimer,
      workerFullPreloadTimer,
      workerFullRefreshTimer,
    };
  }

  return {
    cancel,
    getTimerIds,
    scheduleAutoLoad,
    scheduleFullWorkerPreload,
    scheduleWorkerFullRefresh,
    scheduleWorkerPrewarm,
  };
}
