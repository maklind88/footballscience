import { normalizeScoutingComparisonLab, normalizeScoutingText } from "./scouting-state.mjs";

function normalizeText(deps = {}, value = "", limit = 160) {
  if (typeof deps.normalizeText === "function") {
    return deps.normalizeText(value, limit);
  }
  return normalizeScoutingText(value, limit);
}

function canMutate(deps = {}) {
  return deps.canEdit?.() === true;
}

function getComparisonRecordId(deps = {}, record) {
  return normalizeText(deps, deps.getRecordId?.(record), 160);
}

function getComparisonSearchKey(deps = {}, query = "") {
  return `${deps.getAssetVersion?.() || "local"}::${normalizeText(deps, query, 120).toLowerCase()}`;
}

function getComparisonSearchText(deps = {}, record) {
  return [
    deps.getRecordName?.(record),
    deps.getRecordTeam?.(record),
    deps.getRecordLeague?.(record),
    deps.getRecordPosition?.(record),
    deps.getRecordNationality?.(record),
  ]
    .map((value) => normalizeText(deps, value, 160).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function getLocalComparisonSearchRecords(deps = {}, query = "", limit = 24) {
  const normalizedQuery = normalizeText(deps, query, 120).toLowerCase();
  if (normalizedQuery.length < 2) {
    return [];
  }
  const database = deps.getDatabase?.();
  const records = Array.isArray(database?.records) ? database.records : [];
  return records.filter((record) => getComparisonSearchText(deps, record).includes(normalizedQuery)).slice(0, limit);
}

function renderComparisonWorkspace(deps = {}, options = { preserveFocus: true }) {
  deps.renderComparisonWorkspace?.(options);
}

function focusComparisonSearch(deps = {}) {
  deps.requestAnimationFrame?.(() => deps.focusPlayerSearch?.());
}

export function createScoutingComparisonActions(deps = {}) {
  let searchTimer = 0;
  let searchCache = { key: "", status: "idle", records: [], error: "", promise: null };

  function getSearchCache() {
    return searchCache;
  }

  function setSearchCache(nextCache = {}) {
    searchCache = {
      key: normalizeText(deps, nextCache.key, 220),
      status: normalizeText(deps, nextCache.status, 40) || "idle",
      records: Array.isArray(nextCache.records) ? nextCache.records : [],
      error: normalizeText(deps, nextCache.error, 240),
      promise: nextCache.promise || null,
    };
    return searchCache;
  }

  function getCachedRecordById(recordId) {
    const id = normalizeText(deps, recordId, 160);
    if (!id) {
      return null;
    }
    return (Array.isArray(searchCache.records) ? searchCache.records : []).find((record) => getComparisonRecordId(deps, record) === id) || null;
  }

  function addPlayer(recordId) {
    const id = normalizeText(deps, recordId, 160);
    if (!id || !canMutate(deps)) {
      return { changed: false, recordId: id, status: id ? "blocked" : "empty" };
    }
    const record = deps.getRecordById?.(id) || getCachedRecordById(id);
    if (record) {
      deps.rememberRecordSnapshot?.(record);
    }
    const lab = normalizeScoutingComparisonLab(deps.getComparisonLab?.());
    const nextPlayerIds = [lab.playerIds[0] || "", lab.playerIds[1] || "", lab.playerIds[2] || "", lab.playerIds[3] || ""];
    if (nextPlayerIds.includes(id)) {
      deps.setPlayerSearchQuery?.("");
      deps.setCandidatesOpen?.(false);
      renderComparisonWorkspace(deps, { preserveFocus: true });
      focusComparisonSearch(deps);
      return { changed: false, recordId: id, status: "already-selected" };
    }
    const targetIndex = nextPlayerIds.findIndex((playerId) => !playerId);
    if (targetIndex < 0) {
      return { changed: false, recordId: id, status: "full" };
    }
    nextPlayerIds[targetIndex] = id;
    deps.setComparisonLab?.({ ...lab, playerIds: nextPlayerIds });
    deps.setPlayerSearchQuery?.("");
    deps.setCandidatesOpen?.(false);
    renderComparisonWorkspace(deps, { preserveFocus: true });
    focusComparisonSearch(deps);
    return { changed: true, recordId: id, playerIds: nextPlayerIds, status: "updated" };
  }

  function removePlayer(recordId) {
    const id = normalizeText(deps, recordId, 160);
    if (!id || !canMutate(deps)) {
      return { changed: false, recordId: id, status: id ? "blocked" : "empty" };
    }
    const lab = normalizeScoutingComparisonLab(deps.getComparisonLab?.());
    const nextPlayerIds = lab.playerIds.map((playerId) => (playerId === id ? "" : playerId));
    deps.setComparisonLab?.({ ...lab, playerIds: nextPlayerIds });
    deps.setCandidatesOpen?.(true);
    deps.renderWorkspace?.({ preserveFocus: true });
    return { changed: true, recordId: id, playerIds: nextPlayerIds, status: "updated" };
  }

  function queuePlayerSearch(query = deps.getPlayerSearchQuery?.() || "") {
    const normalizedQuery = normalizeText(deps, query, 120);
    deps.clearTimeout?.(searchTimer);
    searchTimer = 0;
    deps.setPlayerSearchQuery?.(normalizedQuery);
    deps.setCandidatesOpen?.(true);
    if (normalizedQuery.length < 2) {
      setSearchCache({ key: getComparisonSearchKey(deps, normalizedQuery), status: "idle", records: [], error: "", promise: null });
      renderComparisonWorkspace(deps, { preserveFocus: true });
      return searchCache;
    }
    const schedule = deps.setTimeout || ((callback) => {
      callback();
      return 0;
    });
    searchTimer = schedule(() => {
      const key = getComparisonSearchKey(deps, normalizedQuery);
      if (searchCache.key === key && ["loading", "ready"].includes(searchCache.status)) {
        renderComparisonWorkspace(deps, { preserveFocus: true });
        return;
      }
      const localRecords = getLocalComparisonSearchRecords(deps, normalizedQuery, 24);
      setSearchCache({ key, status: "loading", records: localRecords, error: "", promise: null });
      renderComparisonWorkspace(deps, { preserveFocus: true });
      const workerQuery = {
        ...(deps.getWorkerQueryFromState?.() || {}),
        query: normalizedQuery,
        league: "",
        team: "",
        season: "",
        position: "",
        offset: 0,
        limit: 32,
        includeTotal: "0",
        includeOptions: "0",
        includeMetrics: "0",
      };
      const promise = Promise.resolve(deps.requestDatabaseWorkerQuery?.({ query: workerQuery, timeoutMs: 18000 }))
        .then((database) => {
          if (searchCache.key !== key) {
            return searchCache;
          }
          const remoteRecords = Array.isArray(database?.records) ? database.records : [];
          const recordMap = new Map();
          [...localRecords, ...remoteRecords].forEach((record) => {
            const recordId = getComparisonRecordId(deps, record);
            if (recordId && !recordMap.has(recordId)) {
              recordMap.set(recordId, record);
              deps.rememberRecordSnapshot?.(record);
            }
          });
          setSearchCache({ key, status: "ready", records: Array.from(recordMap.values()).slice(0, 32), error: "", promise: null });
          renderComparisonWorkspace(deps, { preserveFocus: true });
          return searchCache;
        })
        .catch((error) => {
          if (searchCache.key !== key) {
            return searchCache;
          }
          setSearchCache({
            key,
            status: localRecords.length ? "ready" : "error",
            records: localRecords,
            error: error?.message || "Could not search the full scouting database.",
            promise: null,
          });
          renderComparisonWorkspace(deps, { preserveFocus: true });
          return searchCache;
        });
      searchCache = { ...searchCache, promise };
    }, 180);
    return searchCache;
  }

  return {
    addPlayer,
    getCachedRecordById,
    getSearchCache,
    queuePlayerSearch,
    removePlayer,
  };
}
