function createInitialQualityCache() {
  return { status: "idle", summary: null, error: "", promise: null };
}

export function createFootballScienceDbQualityService(deps = {}) {
  let cache = createInitialQualityCache();

  function getCache() {
    return cache;
  }

  function setError(message = "") {
    cache = {
      ...cache,
      error: message || "",
    };
    return cache;
  }

  function load(options = {}) {
    const force = Boolean(options.force);
    if (!force && cache.status === "ready" && cache.summary) {
      return Promise.resolve(cache.summary);
    }
    if (!force && cache.promise) {
      return cache.promise;
    }
    cache = {
      ...cache,
      status: "loading",
      error: "",
    };
    const loadPromise = Promise.resolve(deps.fetchApi?.({ action: "quality" }))
      .then((response) => {
        if (!response?.ok) {
          throw new Error(response?.reason || "Football Science DB quality snapshot failed.");
        }
        const summary = deps.normalizeSummary?.(response.result || {}) || response.result || {};
        cache = { status: "ready", summary, error: "", promise: null };
        return summary;
      })
      .catch((error) => {
        cache = {
          status: "error",
          summary: cache.summary,
          error: error?.message || "Football Science DB quality snapshot failed.",
          promise: null,
        };
        throw error;
      });
    cache.promise = loadPromise;
    return loadPromise;
  }

  function renderWorkspace() {
    return deps.renderWorkspace?.({ preserveFocus: true });
  }

  function queueLoad(options = {}) {
    const force = Boolean(options.force);
    if (!force && ["loading", "ready"].includes(cache.status)) {
      return null;
    }
    return load({ force })
      .then(renderWorkspace)
      .catch(renderWorkspace);
  }

  return {
    getCache,
    load,
    queueLoad,
    setError,
  };
}
