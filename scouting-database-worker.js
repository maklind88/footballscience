self.window = self;

const recordIndex = Object.freeze({
  id: 0,
  player: 1,
  team: 2,
  teamWithinTimeframe: 3,
  league: 4,
  season: 5,
  position: 6,
  age: 7,
  matches: 8,
  minutes: 9,
  birthCountry: 10,
  passportCountry: 11,
  height: 12,
  weight: 13,
  metrics: 14,
});

let loadedDatabase = null;
let loadedScriptUrl = "";
let optionCache = null;
let metricIndexCache = null;
let searchCorpusCache = new Map();
let filteredRecordCache = new Map();

function normalizeText(value = "", limit = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeLeague(value = "") {
  const text = normalizeText(value, 120);
  return text.replace(/^scotland\s+swpl$/i, "Scotland SWPL");
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getRecordValue(record, index) {
  return Array.isArray(record) ? record[index] : "";
}

function getRecordId(record) {
  return normalizeText(getRecordValue(record, recordIndex.id), 160);
}

function getRecordName(record) {
  return normalizeText(getRecordValue(record, recordIndex.player), 160);
}

function getRecordTeam(record) {
  return normalizeText(getRecordValue(record, recordIndex.teamWithinTimeframe) || getRecordValue(record, recordIndex.team), 160);
}

function getRecordLeague(record) {
  return normalizeLeague(getRecordValue(record, recordIndex.league));
}

function getRecordSeason(record) {
  return normalizeText(getRecordValue(record, recordIndex.season), 80);
}

function getRecordPosition(record) {
  return normalizeText(getRecordValue(record, recordIndex.position), 120);
}

function getRecordAge(record) {
  return normalizeNumber(getRecordValue(record, recordIndex.age), NaN);
}

function getRecordMatches(record) {
  return normalizeNumber(getRecordValue(record, recordIndex.matches), 0);
}

function getRecordMinutes(record) {
  return normalizeNumber(getRecordValue(record, recordIndex.minutes), 0);
}

function getPositionTokens(recordOrPosition) {
  const position = Array.isArray(recordOrPosition) ? getRecordPosition(recordOrPosition) : normalizeText(recordOrPosition, 120);
  return position
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getMetricIndex() {
  if (metricIndexCache) {
    return metricIndexCache;
  }
  const index = new Map();
  (loadedDatabase?.metrics || []).forEach((metric, metricOffset) => {
    const ids = [metric?.id, metric?.key, metric?.label].map((value) => normalizeText(value, 160).toLowerCase()).filter(Boolean);
    ids.forEach((id) => {
      if (!index.has(id)) {
        index.set(id, metricOffset);
      }
    });
  });
  metricIndexCache = index;
  return metricIndexCache;
}

function getMetricValue(record, metricId) {
  const id = normalizeText(metricId, 160).toLowerCase();
  if (!id) {
    return NaN;
  }
  if (id === "minutes") {
    return getRecordMinutes(record);
  }
  if (id === "matches" || id === "matches-played") {
    return getRecordMatches(record);
  }
  if (id === "age") {
    return getRecordAge(record);
  }
  const metrics = getRecordValue(record, recordIndex.metrics);
  if (Array.isArray(metrics)) {
    const metricOffset = getMetricIndex().get(id);
    const rawValue = Number.isInteger(metricOffset) ? metrics[metricOffset] : undefined;
    const value = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue.value : rawValue;
    return normalizeNumber(value, NaN);
  }
  if (metrics && typeof metrics === "object") {
    const rawValue = metrics[metricId] ?? metrics[id];
    const value = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue.value : rawValue;
    return normalizeNumber(value, NaN);
  }
  return NaN;
}

function buildSearchCorpus(record) {
  const recordId = getRecordId(record);
  if (recordId && searchCorpusCache.has(recordId)) {
    return searchCorpusCache.get(recordId);
  }
  const corpus = [
    getRecordName(record),
    getRecordTeam(record),
    getRecordLeague(record),
    getRecordSeason(record),
    getRecordPosition(record),
    normalizeText(getRecordValue(record, recordIndex.birthCountry), 120),
    normalizeText(getRecordValue(record, recordIndex.passportCountry), 120),
    getRecordId(record),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (recordId) {
    searchCorpusCache.set(recordId, corpus);
  }
  return corpus;
}

function buildOptions(records = []) {
  if (optionCache) {
    return optionCache;
  }
  const leagues = new Set();
  const teams = new Set();
  const seasons = new Set();
  const positions = new Set();
  records.forEach((record) => {
    const league = getRecordLeague(record);
    const team = getRecordTeam(record);
    const season = getRecordSeason(record);
    if (league) {
      leagues.add(league);
    }
    if (team) {
      teams.add(team);
    }
    if (season) {
      seasons.add(season);
    }
    getPositionTokens(record).forEach((token) => positions.add(token));
  });
  optionCache = {
    leagues: [...leagues].sort((a, b) => a.localeCompare(b)),
    teams: [...teams].sort((a, b) => a.localeCompare(b)),
    seasons: [...seasons].sort((a, b) => String(b).localeCompare(String(a))),
    positions: [...positions].sort((a, b) => a.localeCompare(b)),
  };
  return optionCache;
}

function loadDatabase(scriptUrl = "scouting-import-data.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-data.js");
  if (loadedDatabase && loadedScriptUrl === normalizedScriptUrl) {
    return loadedDatabase;
  }
  self.__footballScienceScoutingDatabase = null;
  importScripts(normalizedScriptUrl);
  const database = self.__footballScienceScoutingDatabase;
  if (!database || !Array.isArray(database.records) || !Array.isArray(database.metrics)) {
    throw new Error("Scouting player database did not register.");
  }
  loadedDatabase = database;
  loadedScriptUrl = normalizedScriptUrl;
  optionCache = null;
  metricIndexCache = null;
  searchCorpusCache = new Map();
  filteredRecordCache = new Map();
  return loadedDatabase;
}

function normalizeQuery(query = {}) {
  const limit = Math.max(1, Math.min(250, Math.floor(normalizeNumber(query.limit, 50))));
  const offset = Math.max(0, Math.floor(normalizeNumber(query.offset, 0)));
  return {
    query: normalizeText(query.query, 120).toLowerCase(),
    league: normalizeLeague(query.league || "all") || "all",
    team: normalizeText(query.team || "all", 160) || "all",
    season: normalizeText(query.season || "all", 80) || "all",
    position: normalizeText(query.position || "all", 80).toUpperCase() || "ALL",
    minMinutes: Math.max(0, Math.round(normalizeNumber(query.minMinutes, 0))),
    maxMinutes: Math.max(0, Math.round(normalizeNumber(query.maxMinutes, 0))),
    minAge: normalizeNumber(query.minAge, NaN),
    maxAge: normalizeNumber(query.maxAge, NaN),
    sortMetricId: normalizeText(query.sortMetricId || query.sort || "minutes", 160) || "minutes",
    limit,
    offset,
  };
}

function recordMatchesQuery(record, query) {
  if (query.league && query.league !== "all" && getRecordLeague(record) !== query.league) {
    return false;
  }
  if (query.team && query.team !== "all" && getRecordTeam(record) !== query.team) {
    return false;
  }
  if (query.season && query.season !== "all" && getRecordSeason(record) !== query.season) {
    return false;
  }
  if (query.position && query.position !== "ALL" && !getPositionTokens(record).includes(query.position)) {
    return false;
  }
  const minutes = getRecordMinutes(record);
  if (query.minMinutes > 0 && minutes < query.minMinutes) {
    return false;
  }
  if (query.maxMinutes > 0 && minutes > query.maxMinutes) {
    return false;
  }
  const age = getRecordAge(record);
  if (Number.isFinite(query.minAge) && query.minAge > 0 && (!Number.isFinite(age) || age < query.minAge)) {
    return false;
  }
  if (Number.isFinite(query.maxAge) && query.maxAge > 0 && (!Number.isFinite(age) || age > query.maxAge)) {
    return false;
  }
  if (query.query && !buildSearchCorpus(record).includes(query.query)) {
    return false;
  }
  return true;
}

function createRecordComparator(sortMetricId) {
  const id = normalizeText(sortMetricId, 160).toLowerCase();
  if (id === "age") {
    return (a, b) => {
      const ageA = getRecordAge(a);
      const ageB = getRecordAge(b);
      const safeAgeA = Number.isFinite(ageA) ? ageA : Number.MAX_SAFE_INTEGER;
      const safeAgeB = Number.isFinite(ageB) ? ageB : Number.MAX_SAFE_INTEGER;
      return safeAgeA - safeAgeB || getRecordMinutes(b) - getRecordMinutes(a) || getRecordName(a).localeCompare(getRecordName(b));
    };
  }
  if (!id || id === "minutes") {
    return (a, b) => getRecordMinutes(b) - getRecordMinutes(a) || getRecordName(a).localeCompare(getRecordName(b));
  }
  if (id === "matches" || id === "matches-played") {
    return (a, b) =>
      getRecordMatches(b) - getRecordMatches(a) ||
      getRecordMinutes(b) - getRecordMinutes(a) ||
      getRecordName(a).localeCompare(getRecordName(b));
  }
  return (a, b) => {
    const valueA = getMetricValue(a, sortMetricId);
    const valueB = getMetricValue(b, sortMetricId);
    const safeValueA = Number.isFinite(valueA) ? valueA : 0;
    const safeValueB = Number.isFinite(valueB) ? valueB : 0;
    return safeValueB - safeValueA || getRecordMinutes(b) - getRecordMinutes(a) || getRecordName(a).localeCompare(getRecordName(b));
  };
}

function getFilteredRecordCacheKey(query) {
  return [
    query.query,
    query.league,
    query.team,
    query.season,
    query.position,
    query.minMinutes,
    query.maxMinutes,
    Number.isFinite(query.minAge) ? query.minAge : "",
    Number.isFinite(query.maxAge) ? query.maxAge : "",
    query.sortMetricId,
  ].join("|");
}

function getFilteredSortedRecords(records, query) {
  const cacheKey = getFilteredRecordCacheKey(query);
  if (filteredRecordCache.has(cacheKey)) {
    return filteredRecordCache.get(cacheKey);
  }
  const filteredRecords = [];
  for (const record of records) {
    if (recordMatchesQuery(record, query)) {
      filteredRecords.push(record);
    }
  }
  filteredRecords.sort(createRecordComparator(query.sortMetricId));
  if (filteredRecordCache.size > 12) {
    filteredRecordCache.clear();
  }
  filteredRecordCache.set(cacheKey, filteredRecords);
  return filteredRecords;
}

function getDatabasePage(query = {}) {
  const database = loadedDatabase;
  const records = Array.isArray(database?.records) ? database.records : [];
  const normalizedQuery = normalizeQuery(query);
  const filteredRecords = getFilteredSortedRecords(records, normalizedQuery);
  const total = filteredRecords.length;
  const pageRecords = filteredRecords.slice(normalizedQuery.offset, normalizedQuery.offset + normalizedQuery.limit);
  const nextOffset = normalizedQuery.offset + pageRecords.length;
  const hasMore = nextOffset < total;
  return {
    source: "worker",
    importedAt: database?.importedAt || "",
    fileName: database?.fileName || "",
    sheets: Array.isArray(database?.sheets) ? database.sheets : [],
    metrics: Array.isArray(database?.metrics) ? database.metrics : [],
    options: buildOptions(records),
    records: pageRecords,
    page: {
      limit: normalizedQuery.limit,
      offset: normalizedQuery.offset,
      returned: pageRecords.length,
      total,
      nextOffset: hasMore ? nextOffset : null,
      hasMore,
    },
  };
}

function getRecordsByIds(recordIds = []) {
  const wantedIds = new Set((Array.isArray(recordIds) ? recordIds : []).map((id) => normalizeText(id, 160)).filter(Boolean));
  if (!wantedIds.size) {
    return [];
  }
  const matches = [];
  for (const record of loadedDatabase?.records || []) {
    const recordId = getRecordId(record);
    if (wantedIds.has(recordId)) {
      matches.push(record);
      wantedIds.delete(recordId);
      if (!wantedIds.size) {
        break;
      }
    }
  }
  return matches;
}

self.addEventListener("message", (event) => {
  if (!["query", "recordsByIds"].includes(event.data?.type)) {
    return;
  }
  const requestId = Number(event.data.requestId) || 0;
  try {
    loadDatabase(event.data.scriptUrl);
    if (event.data.type === "recordsByIds") {
      self.postMessage({
        type: "records",
        requestId,
        records: getRecordsByIds(event.data.recordIds || []),
      });
      return;
    }
    self.postMessage({
      type: "database",
      requestId,
      database: getDatabasePage(event.data.query || {}),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error?.message || "Scouting player database could not be loaded.",
    });
  }
});
