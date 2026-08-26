export function createScoutingDatabaseLoader(deps = {}) {
  let activeLoadPromise = null;
  let activeLoadSource = "";
  let activeLoadController = null;
  let queuedRenderRequest = null;

  function getFilters() {
    return deps.normalizeDatabaseFilters?.(deps.ensureState?.().databaseFilters) || {};
  }

  function clearLoadState(options = {}) {
    if (options.abort !== false) {
      activeLoadController?.abort?.();
      queuedRenderRequest = null;
    }
    activeLoadPromise = null;
    activeLoadSource = "";
    activeLoadController = null;
  }

  function isLoading() {
    return Boolean(activeLoadPromise);
  }

  function getLoadSource() {
    return activeLoadSource;
  }

  function ensureLoaded() {
    const existingDatabase = deps.getDatabase?.();
    if (existingDatabase) {
      return Promise.resolve(existingDatabase);
    }
    const filters = getFilters();
    if (activeLoadPromise && activeLoadSource !== filters.source) {
      clearLoadState();
    }
    if (!activeLoadPromise) {
      deps.setDatabaseError?.("");
      activeLoadSource = filters.source;
      activeLoadController = deps.createAbortController?.() || (typeof AbortController === "function" ? new AbortController() : null);
      const loadController = activeLoadController;
      const loader = deps.loadBySource?.(filters, { signal: loadController?.signal });
      const loadPromise = Promise.resolve(loader)
        .then(() => {
          if (loadController?.signal?.aborted || activeLoadPromise !== loadPromise) {
            throw new DOMException("Scouting database load was superseded.", "AbortError");
          }
          const database = deps.getDatabase?.();
          if (!database) {
            throw new Error(
              filters.source === "fsdb"
                ? "Football Science DB did not register on window."
                : "Scouting database did not register on window."
            );
          }
          deps.clearDatabaseOptionCache?.();
          deps.resetComputedCaches?.();
          if (activeLoadPromise === loadPromise) {
            clearLoadState({ abort: false });
          }
          return database;
        })
        .catch((error) => {
          if (activeLoadPromise === loadPromise) {
            clearLoadState({ abort: false });
          }
          if (error?.name === "AbortError") {
            throw error;
          }
          deps.setDatabaseError?.(
            error?.message ||
              (filters.source === "fsdb"
                ? "Football Science DB could not be loaded."
                : "Scouting database could not be loaded.")
          );
          throw error;
        });
      activeLoadPromise = loadPromise;
    }
    return activeLoadPromise;
  }

  function queueLoad(onReady = deps.renderWorkspace) {
    const render = typeof onReady === "function" ? onReady : deps.renderWorkspace;
    const scheduleRender = () => render?.({ preserveFocus: true });
    if (deps.isDatabaseLoaded?.()) {
      scheduleRender();
      return;
    }
    const loadPromise = activeLoadPromise || ensureLoaded();
    if (queuedRenderRequest?.promise === loadPromise) {
      queuedRenderRequest.render = render;
      return;
    }
    const request = { promise: loadPromise, render };
    queuedRenderRequest = request;
    const finish = () => {
      if (queuedRenderRequest !== request) {
        return;
      }
      queuedRenderRequest = null;
      request.render?.({ preserveFocus: true });
    };
    loadPromise.then(finish).catch(finish);
  }

  return {
    clearLoadState,
    ensureLoaded,
    getLoadSource,
    isLoading,
    queueLoad,
  };
}
