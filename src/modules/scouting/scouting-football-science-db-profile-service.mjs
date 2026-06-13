function normalizeServiceText(value = "", maxLength = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, maxLength);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function createFootballScienceDbProfileService(deps = {}) {
  let profileCache = new Map();

  function getCacheKeys(record = {}) {
    const getRecordId = deps.getRecordId;
    const getMeta = deps.getFootballScienceDbMeta;
    const getPlayerSourceId = deps.getRecordPlayerSourceId;
    const normalizeText = deps.normalizeText;
    const recordId = typeof getRecordId === "function" ? getRecordId(record) : "";
    const fsdb = typeof getMeta === "function" ? getMeta(record) || {} : {};
    return [
      recordId,
      normalizeServiceText(fsdb.id, 160, normalizeText),
      normalizeServiceText(fsdb.fsdbId, 160, normalizeText),
      typeof getPlayerSourceId === "function" ? getPlayerSourceId(record) : "",
    ].filter(Boolean);
  }

  function getCacheEntry(record = {}) {
    for (const key of getCacheKeys(record)) {
      const entry = profileCache.get(key);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  function setCacheEntry(record = {}, entry = {}) {
    getCacheKeys(record).forEach((key) => {
      profileCache.set(key, entry);
    });
    return entry;
  }

  function resetCache() {
    profileCache = new Map();
  }

  function getQueryFromRecord(record = {}) {
    const getMeta = deps.getFootballScienceDbMeta;
    const getPlayerSourceId = deps.getRecordPlayerSourceId;
    const normalizeText = deps.normalizeText;
    const fsdb = typeof getMeta === "function" ? getMeta(record) || {} : {};
    const id = normalizeServiceText(fsdb.id, 160, normalizeText);
    const fsdbId = normalizeServiceText(fsdb.fsdbId || (typeof getPlayerSourceId === "function" ? getPlayerSourceId(record) : ""), 160, normalizeText);
    return {
      id: /^[0-9a-f-]{36}$/i.test(id) ? id : "",
      fsdbId,
    };
  }

  function registerProfileRecord(record, profile = null) {
    const recordId = deps.registerRecord?.(record) || "";
    if (recordId && profile) {
      setCacheEntry(record, { status: "ready", profile, error: "", promise: null });
    }
    return recordId;
  }

  async function hydrateDetails(recordId, options = {}) {
    const id = normalizeServiceText(recordId, 160, deps.normalizeText);
    const record = deps.getRecordById?.(id);
    if (!record || !deps.getFootballScienceDbMeta?.(record)) {
      return;
    }
    const existing = getCacheEntry(record);
    if (!options.force && (existing?.status === "ready" || existing?.status === "loading")) {
      deps.renderProfilePanel?.(id);
      return;
    }
    const query = getQueryFromRecord(record);
    if (!query.id && !query.fsdbId) {
      return;
    }
    setCacheEntry(record, { status: "loading", profile: existing?.profile || null, error: "", promise: null });
    deps.renderProfilePanel?.(id);
    const response = await deps.fetchApi?.({
      action: "profile",
      id: query.id,
      fsdbId: query.fsdbId,
    });
    if (!response?.ok) {
      setCacheEntry(record, {
        status: "error",
        profile: existing?.profile || null,
        error: response?.reason || "Football Science DB profile could not be loaded.",
        promise: null,
      });
      deps.renderProfilePanel?.(id);
      return;
    }
    const profile = deps.normalizeProfile?.(response.result || {}) || response.result || {};
    const hydratedRecord = deps.playerToRecord?.(profile.player) || null;
    const hydratedRecordId = hydratedRecord ? registerProfileRecord(hydratedRecord, profile) : "";
    setCacheEntry(record, { status: "ready", profile, error: "", promise: null });
    deps.renderProfilePanel?.(hydratedRecordId || id);
  }

  function queueHydration(recordId, options = {}) {
    const id = normalizeServiceText(recordId, 160, deps.normalizeText);
    if (!id) {
      return;
    }
    const record = deps.getRecordById?.(id);
    if (!record || !deps.getFootballScienceDbMeta?.(record)) {
      return;
    }
    const requestAnimationFrame = deps.requestAnimationFrame || ((callback) => callback());
    requestAnimationFrame(() => {
      hydrateDetails(id, options);
    });
  }

  async function openFromQueue(options = {}) {
    const id = normalizeServiceText(options.id, 160, deps.normalizeText);
    const fsdbId = normalizeServiceText(options.fsdbId, 160, deps.normalizeText);
    if (!id && !fsdbId) {
      return;
    }
    const response = await deps.fetchApi?.({ action: "profile", id, fsdbId });
    if (!response?.ok) {
      deps.setQualityError?.(response?.reason || "Football Science DB profile could not be opened.");
      deps.renderWorkspace?.({ preserveFocus: true });
      return;
    }
    const profile = deps.normalizeProfile?.(response.result || {}) || response.result || {};
    const record = deps.playerToRecord?.(profile.player) || null;
    const recordId = record ? registerProfileRecord(record, profile) : "";
    if (recordId) {
      deps.openRecordProfile?.(recordId);
    }
  }

  return {
    getCacheEntry,
    getCacheKeys,
    getQueryFromRecord,
    hydrateDetails,
    openFromQueue,
    queueHydration,
    registerProfileRecord,
    resetCache,
    setCacheEntry,
  };
}
