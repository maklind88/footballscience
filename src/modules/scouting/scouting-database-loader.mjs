export function createScoutingDatabaseLoader(deps = {}) {
  let activeLoadPromise = null;
  let activeLoadSource = "";

  function getFilters() {
    return deps.normalizeDatabaseFilters?.(deps.ensureState?.().databaseFilters) || {};
  }

  function clearLoadState() {
    activeLoadPromise = null;
    activeLoadSource = "";
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
      const loader = deps.loadBySource?.(filters);
      const loadPromise = Promise.resolve(loader)
        .then(() => {
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
            clearLoadState();
          }
          return database;
        })
        .catch((error) => {
          if (activeLoadPromise === loadPromise) {
            clearLoadState();
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
    if (activeLoadPromise) {
      activeLoadPromise.then(scheduleRender).catch(scheduleRender);
      return;
    }
    ensureLoaded().then(scheduleRender).catch(scheduleRender);
  }

  return {
    clearLoadState,
    ensureLoaded,
    getLoadSource,
    isLoading,
    queueLoad,
  };
}
