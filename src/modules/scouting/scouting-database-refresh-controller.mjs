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

  function loadRefreshSource(source) {
    if (source === "fsdb") {
      return deps.loadFootballScienceDbDatabase?.();
    }
    if (source === "api") {
      return deps.loadApiDatabase?.();
    }
    return deps.requestWorkerQuery?.({ timeoutMs: 15000 }).then((database) => {
      const appliedDatabase = deps.applyWorkerDatabase?.(database);
      if (!appliedDatabase) {
        throw new Error("Scouting player database worker returned no records.");
      }
      return appliedDatabase;
    });
  }

  function scheduleRefresh() {
    const source = getRefreshSource(deps);
    if (source === "local") {
      scheduleResultsRender();
      return { mode: "local", status: "scheduled" };
    }
    timers.clearTimeout?.(deps.getApiRefreshTimer?.() || 0);
    const delayMs = source === "api" || source === "fsdb" ? 260 : 80;
    const timer = timers.setTimeout?.(() => {
      deps.setApiRefreshTimer?.(0);
      const perf = deps.startPerformance?.("database.refresh", { source });
      Promise.resolve(loadRefreshSource(source))
        .then(() => {
          perf?.end?.({ status: "loaded" });
          if (deps.ensureState?.()?.activeTab === "database") {
            deps.renderResults?.();
          }
        })
        .catch(() => {
          perf?.end?.({ status: "fallback" });
          scheduleResultsRender();
        });
    }, delayMs);
    deps.setApiRefreshTimer?.(timer);
    return { delayMs, mode: source, status: "scheduled" };
  }

  return {
    scheduleRefresh,
    scheduleResultsRender,
  };
}
