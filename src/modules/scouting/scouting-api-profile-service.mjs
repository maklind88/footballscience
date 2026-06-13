function normalizeServiceText(value = "", maxLength = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, maxLength);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function createInitialEntry(status = "idle", profile = null, error = "", promise = null) {
  return { status, profile, error, promise };
}

export function createScoutingApiProfileService(deps = {}) {
  let profileCache = new Map();

  function normalizeId(recordId = "") {
    return normalizeServiceText(recordId, 160, deps.normalizeText);
  }

  function getCacheEntry(recordId = "") {
    const id = normalizeId(recordId);
    return id ? profileCache.get(id) || null : null;
  }

  function setCacheEntry(recordId = "", entry = {}) {
    const id = normalizeId(recordId);
    if (!id) {
      return null;
    }
    const nextEntry = {
      ...createInitialEntry(),
      ...entry,
    };
    profileCache.set(id, nextEntry);
    return nextEntry;
  }

  function resetCache() {
    profileCache = new Map();
  }

  function canRender(recordId = "") {
    if (typeof deps.shouldRender === "function") {
      return deps.shouldRender(recordId) !== false;
    }
    return true;
  }

  function renderPanel(recordId = "", profile = null, status = "loading", error = "") {
    if (!canRender(recordId)) {
      return false;
    }
    deps.renderPanel?.(recordId, profile, status, error);
    return true;
  }

  function hydrateDetails(recordId = "") {
    const id = normalizeId(recordId);
    if (!id || deps.isActive?.() !== true) {
      return null;
    }
    const existing = getCacheEntry(id);
    if (existing?.status === "ready") {
      renderPanel(id, existing.profile, "ready", "");
      return Promise.resolve(existing.profile);
    }
    if (existing?.status === "loading" && existing.promise) {
      renderPanel(id, existing.profile || null, "loading", "");
      return existing.promise;
    }
    renderPanel(id, null, "loading", "");
    const loadPromise = Promise.resolve(deps.fetchApi?.({ action: "profile", recordId: id }))
      .then((response) => {
        if (!response?.ok) {
          throw new Error(response?.reason || "Could not load master player record.");
        }
        const entry = setCacheEntry(id, createInitialEntry("ready", response.result || null, "", null));
        renderPanel(id, entry?.profile || null, "ready", "");
        return entry?.profile || null;
      })
      .catch((error) => {
        const message = error?.message || "Could not load master player record.";
        setCacheEntry(id, createInitialEntry("error", null, message, null));
        renderPanel(id, null, "error", message);
        return null;
      });
    setCacheEntry(id, createInitialEntry("loading", null, "", loadPromise));
    return loadPromise;
  }

  return {
    getCacheEntry,
    hydrateDetails,
    resetCache,
    setCacheEntry,
  };
}
