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

  function loadRefreshSource(source, revision) {
    if (source === "fsdb") {
      return deps.loadFootballScienceDbDatabase?.();
    }
    if (source === "api") {
      return deps.loadApiDatabase?.();
    }
    return deps.requestWorkerQuery?.({ timeoutMs: 45000 }).then((database) => {
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
    if (source === "local") {
      scheduleResultsRender();
      return { mode: "local", status: "scheduled" };
    }
    timers.clearTimeout?.(deps.getApiRefreshTimer?.() || 0);
    const delayMs = source === "api" || source === "fsdb" ? 260 : 80;
    const timer = timers.setTimeout?.(() => {
      deps.setApiRefreshTimer?.(0);
      const perf = deps.startPerformance?.("database.refresh", { source });
      deps.onRefreshStatus?.({ revision, source, status: "loading" });
      Promise.resolve(loadRefreshSource(source, revision))
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
        .catch(() => {
          if (revision !== refreshRevision) {
            perf?.end?.({ status: "stale" });
            deps.onRefreshStatus?.({ revision, source, status: "stale" });
            return;
          }
          perf?.end?.({ status: "fallback" });
          scheduleResultsRender();
          deps.onRefreshStatus?.({ revision, source, status: "fallback" });
        });
    }, delayMs);
    deps.setApiRefreshTimer?.(timer);
    return { delayMs, mode: source, status: "scheduled" };
  }

  return {
    getRefreshRevision: () => refreshRevision,
    scheduleRefresh,
    scheduleResultsRender,
  };
}
