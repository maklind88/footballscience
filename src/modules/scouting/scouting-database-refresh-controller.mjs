function getTimerApi(deps = {}) {
  const windowRef = deps.windowRef || (typeof globalThis !== "undefined" ? globalThis.window : null);
  return {
    cancelAnimationFrame: deps.cancelAnimationFrame || windowRef?.cancelAnimationFrame?.bind(windowRef) || globalThis.cancelAnimationFrame,
    clearTimeout: deps.clearTimeout || windowRef?.clearTimeout?.bind(windowRef) || globalThis.clearTimeout,
    requestAnimationFrame: deps.requestAnimationFrame || windowRef?.requestAnimationFrame?.bind(windowRef) || globalThis.requestAnimationFrame,
    setTimeout: deps.setTimeout || windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout,
  };
}

function getRefreshSource(deps = {}) {
  if (deps.isFootballScienceDbDatabaseActive?.()) {
    return "fsdb";
  }
  if (deps.isApiDatabaseActive?.()) {
    return "api";
  }
  if (deps.isWorkerDatabaseActive?.()) {
    return "worker";
  }
  return "local";
}

export function createScoutingDatabaseRefreshController(deps = {}) {
  const timers = getTimerApi(deps);
  let refreshRevision = 0;
  let activeRequestController = null;

  function scheduleResultsRender() {
    const frame = deps.getResultsFrame?.() || 0;
    if (frame) {
      timers.cancelAnimationFrame?.(frame);
    }
    const nextFrame = timers.requestAnimationFrame?.(() => {
      deps.setResultsFrame?.(0);
      const perf = deps.startPerformance?.("database.results-render", {});
      deps.renderResults?.();
      perf?.end?.();
    });
    deps.setResultsFrame?.(nextFrame);
    return { frame: nextFrame || 0, status: "scheduled" };
  }

  function loadRefreshSource(source, revision, signal = null) {
    if (source === "fsdb") {
      return deps.loadFootballScienceDbDatabase?.({ signal });
    }
    if (source === "api") {
      return deps.loadApiDatabase?.({ signal });
    }
    return deps.requestWorkerQuery?.({ signal, timeoutMs: 45000 }).then((database) => {
      if (revision !== refreshRevision) {
        return { stale: true };
      }
      const appliedDatabase = deps.applyWorkerDatabase?.(database);
      if (!appliedDatabase) {
        throw new Error("Scouting player database worker returned no records.");
      }
      return appliedDatabase;
    });
  }

  function scheduleRefresh() {
    const source = getRefreshSource(deps);
    const revision = (refreshRevision += 1);
    activeRequestController?.abort?.();
    activeRequestController = null;
    const pendingTimer = deps.getApiRefreshTimer?.() || 0;
    if (pendingTimer) {
      timers.clearTimeout?.(pendingTimer);
      deps.setApiRefreshTimer?.(0);
    }
    if (source === "local") {
      scheduleResultsRender();
      return { mode: "local", status: "scheduled" };
    }
    const delayMs = source === "api" || source === "fsdb" ? 260 : 80;
    const timer = timers.setTimeout?.(() => {
      deps.setApiRefreshTimer?.(0);
      const perf = deps.startPerformance?.("database.refresh", { source });
      const requestController = deps.createAbortController?.() || (typeof AbortController === "function" ? new AbortController() : null);
      activeRequestController = requestController;
      deps.onRefreshStatus?.({ revision, source, status: "loading" });
      Promise.resolve(loadRefreshSource(source, revision, requestController?.signal))
        .then((result) => {
          if (revision !== refreshRevision || result?.stale) {
            perf?.end?.({ status: "stale" });
            deps.onRefreshStatus?.({ revision, source, status: "stale" });
            return;
          }
          perf?.end?.({ status: "loaded" });
          if (deps.ensureState?.()?.activeTab === "database") {
            deps.renderResults?.();
          }
          deps.onRefreshStatus?.({ revision, source, status: "loaded" });
        })
        .catch((error) => {
          if (revision !== refreshRevision) {
            perf?.end?.({ status: "stale" });
            deps.onRefreshStatus?.({ revision, source, status: "stale" });
            return;
          }
          if (error?.name === "AbortError") {
            perf?.end?.({ status: "cancelled" });
            deps.onRefreshStatus?.({ revision, source, status: "cancelled" });
            return;
          }
          perf?.end?.({ status: "fallback" });
          scheduleResultsRender();
          deps.onRefreshStatus?.({ revision, source, status: "fallback" });
        })
        .finally(() => {
          if (activeRequestController === requestController) {
            activeRequestController = null;
          }
        });
    }, delayMs);
    deps.setApiRefreshTimer?.(timer);
    return { delayMs, mode: source, status: "scheduled" };
  }

  function cancel() {
    const revision = (refreshRevision += 1);
    activeRequestController?.abort?.();
    activeRequestController = null;
    const pendingTimer = deps.getApiRefreshTimer?.() || 0;
    if (pendingTimer) {
      timers.clearTimeout?.(pendingTimer);
      deps.setApiRefreshTimer?.(0);
    }
    const frame = deps.getResultsFrame?.() || 0;
    if (frame) {
      timers.cancelAnimationFrame?.(frame);
      deps.setResultsFrame?.(0);
    }
    deps.onRefreshStatus?.({ revision, source: getRefreshSource(deps), status: "cancelled" });
    return { revision, status: "cancelled" };
  }

  return {
    cancel,
    getRefreshRevision: () => refreshRevision,
    scheduleRefresh,
    scheduleResultsRender,
  };
}
