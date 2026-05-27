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
  sourceTrace: 20,
});

let loadedDatabase = null;
let loadedScriptUrl = "";
let loadedFullDatabase = null;
let loadedFullScriptUrl = "";
let loadedPreviewDatabase = null;
let loadedPreviewScriptUrl = "";
let optionCache = null;
let metricIndexCache = null;
let metricPercentileCache = new Map();
let searchCorpusCache = new Map();
let filteredRecordCache = new Map();
let recordByIdCache = { database: null, byId: new Map() };
let loadedManifest = null;
let loadedManifestScriptUrl = "";
let workerDatabaseCacheOpenPromise = null;
const workerDatabaseCacheName = "football-science-scouting-worker-cache-v1";
const workerDatabaseCacheStore = "databases";

function normalizeText(value = "", limit = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizePersonNameForMatch(value = "", limit = 180) {
  return normalizeText(value, limit)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’`´-]/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getPersonNameSignature(value = "") {
  const normalized = normalizePersonNameForMatch(value);
  const tokens = normalized.split(" ").filter(Boolean);
  if (!tokens.length) {
    return { normalized: "", firstInitial: "", surname: "" };
  }
  const firstToken = tokens[0] || "";
  return {
    normalized,
    firstInitial: firstToken.slice(0, 1),
    surname: tokens[tokens.length - 1] || "",
  };
}

function getInitialSurnameAlias(value = "") {
  const signature = getPersonNameSignature(value);
  return signature.firstInitial && signature.surname ? `${signature.firstInitial} ${signature.surname}` : "";
}

function areNamesInitialSurnameMatch(firstName = "", secondName = "") {
  const first = getPersonNameSignature(firstName);
  const second = getPersonNameSignature(secondName);
  return Boolean(first.firstInitial && first.surname && first.firstInitial === second.firstInitial && first.surname === second.surname);
}

function normalizeLeague(value = "") {
  const text = normalizeText(value, 120);
  const fixedCountry = text
    .replace(/^scottland\b/i, "Scotland")
    .replace(/\bSWPL\s*\d+\b/i, "SWPL")
    .trim();
  if (/^Scotland\s+SWPL\b/i.test(fixedCountry)) {
    return "Scotland SWPL";
  }
  return fixedCountry;
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

function normalizeIdentityPart(value = "", limit = 140) {
  return normalizeText(value, limit)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getRecordSeasonYear(record) {
  const season = getRecordSeason(record);
  const years = season.match(/\d{4}/g);
  if (!years || !years.length) return Number.NaN;
  return Math.max(...years.map((year) => Number(year)).filter(Number.isFinite));
}

function getRecordIdentityBaseKey(record) {
  const playerName = normalizeIdentityPart(getRecordName(record));
  if (!playerName) return "";

  const countries = [
    normalizeIdentityPart(getRecordValue(record, recordIndex.birthCountry), 60),
    normalizeIdentityPart(getRecordValue(record, recordIndex.passportCountry), 60),
  ]
    .filter(Boolean)
    .sort()
    .join("|");

  const height = normalizeNumber(getRecordValue(record, recordIndex.height), Number.NaN);
  const heightKey = Number.isFinite(height) && height > 0 ? `h${Math.round(height)}` : "";

  return [playerName, countries, heightKey].filter(Boolean).join("::");
}

function hasPlausibleSeasonAgeLink(firstRecord, nextRecord) {
  const firstAge = getRecordAge(firstRecord);
  const nextAge = getRecordAge(nextRecord);
  const firstYear = getRecordSeasonYear(firstRecord);
  const nextYear = getRecordSeasonYear(nextRecord);

  if (
    !Number.isFinite(firstAge) ||
    !Number.isFinite(nextAge) ||
    !Number.isFinite(firstYear) ||
    !Number.isFinite(nextYear)
  ) {
    return true;
  }

  const ageDelta = nextAge - firstAge;
  const seasonDelta = nextYear - firstYear;
  return Math.abs(ageDelta - seasonDelta) <= 2;
}

function areRecordClubSeasonSignalsCompatible(firstRecord, nextRecord) {
  const firstTeam = normalizeIdentityPart(getRecordTeam(firstRecord), 180);
  const nextTeam = normalizeIdentityPart(getRecordTeam(nextRecord), 180);
  if (!firstTeam || !nextTeam || firstTeam === nextTeam) {
    return true;
  }
  const firstSeason = normalizeIdentityPart(getRecordSeason(firstRecord), 80);
  const nextSeason = normalizeIdentityPart(getRecordSeason(nextRecord), 80);
  if (firstSeason && nextSeason && firstSeason === nextSeason) {
    const firstAge = getRecordAge(firstRecord);
    const nextAge = getRecordAge(nextRecord);
    if (Number.isFinite(firstAge) && Number.isFinite(nextAge) && Math.abs(firstAge - nextAge) > 1) {
      return false;
    }
  }
  return true;
}

function getRecordPositionGroup(record) {
  const tokens = getPositionTokens(record);
  if (tokens.some((token) => token.includes("GK"))) return "GK";
  if (tokens.some((token) => ["CB", "RCB", "LCB"].includes(token))) return "CB";
  if (tokens.some((token) => ["RB", "LB", "RWB", "LWB", "WB"].includes(token))) return "FB";
  if (tokens.some((token) => ["DMF", "CMF", "RCMF", "LCMF", "AMF", "MF"].includes(token))) return "MID";
  if (tokens.some((token) => ["RW", "LW", "RWF", "LWF", "WF", "W"].includes(token))) return "WING";
  if (tokens.some((token) => ["CF", "ST", "FW"].includes(token))) return "CF";
  return tokens[0] || "";
}

function areRecordPositionsCompatibleForWeakIdentity(firstRecord, nextRecord) {
  const firstGroup = getRecordPositionGroup(firstRecord);
  const nextGroup = getRecordPositionGroup(nextRecord);
  if (!firstGroup || !nextGroup || firstGroup === nextGroup) {
    return true;
  }
  if (firstGroup === "GK" || nextGroup === "GK") {
    return false;
  }
  return true;
}

function areWorkerRecordsLikelySamePerson(firstRecord, nextRecord) {
  return (
    hasPlausibleSeasonAgeLink(firstRecord, nextRecord) &&
    areRecordClubSeasonSignalsCompatible(firstRecord, nextRecord) &&
    areRecordPositionsCompatibleForWeakIdentity(firstRecord, nextRecord)
  );
}

function chooseRepresentativeSeasonRecord(records = [], query = {}) {
  return records.reduce((bestRecord, candidateRecord) => {
    if (!bestRecord) return candidateRecord;

    const selectedSeason = normalizeText(query.season, 80);
    const bestSeasonMatch = selectedSeason && selectedSeason !== "all" && getRecordSeason(bestRecord) === selectedSeason;
    const candidateSeasonMatch =
      selectedSeason && selectedSeason !== "all" && getRecordSeason(candidateRecord) === selectedSeason;
    if (bestSeasonMatch !== candidateSeasonMatch) {
      return candidateSeasonMatch ? candidateRecord : bestRecord;
    }

    const bestYear = getRecordSeasonYear(bestRecord);
    const candidateYear = getRecordSeasonYear(candidateRecord);
    if (candidateYear !== bestYear && (Number.isFinite(candidateYear) || Number.isFinite(bestYear))) {
      if (!Number.isFinite(bestYear) || (Number.isFinite(candidateYear) && candidateYear > bestYear)) {
        return candidateRecord;
      }
      return bestRecord;
    }

    const metricId = normalizeText(query.sortMetricId, 160).toLowerCase();
    if (metricId) {
      const metricDelta = compareRepresentativeMetricValues(bestRecord, candidateRecord, metricId);
      if (metricDelta !== 0) {
        return metricDelta > 0 ? candidateRecord : bestRecord;
      }
    }

    const bestMinutes = getRecordMinutes(bestRecord);
    const candidateMinutes = getRecordMinutes(candidateRecord);
    if (candidateMinutes !== bestMinutes) {
      return candidateMinutes > bestMinutes ? candidateRecord : bestRecord;
    }

    if (getRecordName(candidateRecord).localeCompare(getRecordName(bestRecord)) < 0) {
      return candidateRecord;
    }
    return bestRecord;
  }, null);
}

function getRecordSourceTrace(record) {
  const trace = Array.isArray(record) ? record[recordIndex.sourceTrace] : record?.sourceTrace;
  return trace && typeof trace === "object" && !Array.isArray(trace) ? trace : {};
}

function setRecordSourceTrace(record, trace = {}) {
  if (Array.isArray(record)) {
    record[recordIndex.sourceTrace] = trace;
  } else if (record && typeof record === "object") {
    record.sourceTrace = trace;
  }
  return record;
}

function cloneRecordForMergedSeasonPayload(record) {
  const clone = Array.isArray(record) ? record.slice() : { ...record };
  const trace = { ...getRecordSourceTrace(clone) };
  delete trace.mergedSeasonRecords;
  delete trace.mergedSeasonRecordCount;
  setRecordSourceTrace(clone, trace);
  return clone;
}

function sortMergedSeasonRecords(records = []) {
  return records
    .slice()
    .sort((first, second) => {
      const firstYear = getRecordSeasonYear(first);
      const secondYear = getRecordSeasonYear(second);
      const yearDelta =
        (Number.isFinite(secondYear) ? secondYear : Number.NEGATIVE_INFINITY) -
        (Number.isFinite(firstYear) ? firstYear : Number.NEGATIVE_INFINITY);
      return yearDelta || getRecordMinutes(second) - getRecordMinutes(first) || getRecordName(first).localeCompare(getRecordName(second));
    });
}

function attachMergedSeasonRecords(representativeRecord, records = []) {
  if (!representativeRecord || records.length <= 1) {
    return representativeRecord;
  }
  const next = Array.isArray(representativeRecord) ? representativeRecord.slice() : { ...representativeRecord };
  const mergedSeasonRecords = sortMergedSeasonRecords(records).map(cloneRecordForMergedSeasonPayload);
  setRecordSourceTrace(next, {
    ...getRecordSourceTrace(next),
    mergedSeasonRecords,
    mergedSeasonRecordCount: mergedSeasonRecords.length,
  });
  return next;
}

function dedupeScoutingPlayerRecords(records = [], query = {}) {
  const standaloneRecords = [];
  const bucketsByIdentity = new Map();

  records.forEach((record) => {
    const identityKey = getRecordIdentityBaseKey(record);
    if (!identityKey) {
      standaloneRecords.push(record);
      return;
    }

    let buckets = bucketsByIdentity.get(identityKey);
    if (!buckets) {
      buckets = [];
      bucketsByIdentity.set(identityKey, buckets);
    }

    let bucket = buckets.find((candidateBucket) =>
      candidateBucket.records.every((existingRecord) => areWorkerRecordsLikelySamePerson(existingRecord, record))
    );

    if (!bucket) {
      bucket = { records: [] };
      buckets.push(bucket);
    }

    bucket.records.push(record);
  });

  const representativeRecords = [...standaloneRecords];
  bucketsByIdentity.forEach((buckets) => {
    buckets.forEach((bucket) => {
      const representativeRecord = chooseRepresentativeSeasonRecord(bucket.records, query);
      if (representativeRecord) {
        representativeRecords.push(attachMergedSeasonRecords(representativeRecord, bucket.records));
      }
    });
  });

  return representativeRecords;
}

function getRecordMatches(record) {
  return normalizeNumber(getRecordValue(record, recordIndex.matches), 0);
}

function getRecordMinutes(record) {
  return normalizeNumber(getRecordValue(record, recordIndex.minutes), 0);
}

function getDatabaseRecordCount(database = {}) {
  return Array.isArray(database.records) ? database.records.length : 0;
}

function getDatabaseMetricCount(database = {}) {
  return Array.isArray(database.metrics) ? database.metrics.length : 0;
}

function normalizeScriptCacheKey(scriptUrl = "") {
  return String(scriptUrl || "").split("?")[0].split("#")[0] || "scouting-import-data.js";
}

function loadDatabaseManifest(scriptUrl = "scouting-import-manifest.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-manifest.js");
  if (loadedManifest && loadedManifestScriptUrl === normalizedScriptUrl) {
    return loadedManifest;
  }
  self.__footballScienceScoutingDatabaseManifest = null;
  importScripts(normalizedScriptUrl);
  const manifest = self.__footballScienceScoutingDatabaseManifest;
  if (!manifest || manifest.schema !== "football-science-scouting-import-manifest") {
    throw new Error("Scouting player database manifest did not register.");
  }
  loadedManifest = manifest;
  loadedManifestScriptUrl = normalizedScriptUrl;
  return loadedManifest;
}

function getDatabaseManifestEntry(kind = "full", manifest = loadedManifest) {
  const entry = kind === "preview" ? manifest?.preview : manifest?.full;
  return entry && typeof entry === "object" ? entry : null;
}

function getWorkerDatabaseCacheKey(kind = "full", scriptUrl = "", manifest = loadedManifest) {
  const entry = getDatabaseManifestEntry(kind, manifest);
  return [
    "scouting-worker-database",
    kind,
    entry?.version || "",
    entry?.records || "",
    entry?.metrics || "",
    normalizeScriptCacheKey(entry?.script || scriptUrl),
  ].join("|");
}

function isDatabaseCompatibleWithManifest(database = {}, kind = "full", manifest = loadedManifest) {
  const entry = getDatabaseManifestEntry(kind, manifest);
  if (!database || !Array.isArray(database.records) || !Array.isArray(database.metrics)) {
    return false;
  }
  if (!entry) {
    return true;
  }
  if (entry.schema && database.schema && database.schema !== entry.schema) {
    return false;
  }
  if (entry.version && database.version && database.version !== entry.version) {
    return false;
  }
  if (Number.isFinite(Number(entry.records)) && getDatabaseRecordCount(database) !== Number(entry.records)) {
    return false;
  }
  if (Number.isFinite(Number(entry.metrics)) && getDatabaseMetricCount(database) !== Number(entry.metrics)) {
    return false;
  }
  return true;
}

function canUseWorkerDatabaseCache() {
  try {
    return Boolean(self.indexedDB);
  } catch {
    return false;
  }
}

function openWorkerDatabaseCache() {
  if (!canUseWorkerDatabaseCache()) {
    return Promise.resolve(null);
  }
  if (workerDatabaseCacheOpenPromise) {
    return workerDatabaseCacheOpenPromise;
  }
  workerDatabaseCacheOpenPromise = new Promise((resolve) => {
    try {
      const request = self.indexedDB.open(workerDatabaseCacheName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(workerDatabaseCacheStore)) {
          database.createObjectStore(workerDatabaseCacheStore, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return workerDatabaseCacheOpenPromise;
}

async function readWorkerCachedDatabase(kind = "full", scriptUrl = "", manifest = loadedManifest) {
  const cache = await openWorkerDatabaseCache();
  if (!cache) {
    return null;
  }
  const key = getWorkerDatabaseCacheKey(kind, scriptUrl, manifest);
  return new Promise((resolve) => {
    try {
      const transaction = cache.transaction(workerDatabaseCacheStore, "readonly");
      const store = transaction.objectStore(workerDatabaseCacheStore);
      const request = store.get(key);
      request.onsuccess = () => {
        const cached = request.result?.database || null;
        resolve(isDatabaseCompatibleWithManifest(cached, kind, manifest) ? cached : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeWorkerCachedDatabase(kind = "full", scriptUrl = "", database = {}, manifest = loadedManifest) {
  if (!isDatabaseCompatibleWithManifest(database, kind, manifest)) {
    return false;
  }
  const cache = await openWorkerDatabaseCache();
  if (!cache) {
    return false;
  }
  const entry = getDatabaseManifestEntry(kind, manifest);
  const payload = {
    key: getWorkerDatabaseCacheKey(kind, scriptUrl, manifest),
    kind,
    script: normalizeScriptCacheKey(entry?.script || scriptUrl),
    version: entry?.version || database.version || "",
    records: getDatabaseRecordCount(database),
    metrics: getDatabaseMetricCount(database),
    savedAt: new Date().toISOString(),
    database,
  };
  return new Promise((resolve) => {
    try {
      const transaction = cache.transaction(workerDatabaseCacheStore, "readwrite");
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.objectStore(workerDatabaseCacheStore).put(payload);
    } catch {
      resolve(false);
    }
  });
}

function getPositionTokens(recordOrPosition) {
  const position = Array.isArray(recordOrPosition) ? getRecordPosition(recordOrPosition) : normalizeText(recordOrPosition, 120);
  return position
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function positionMatchesFilter(record, selectedPosition) {
  const position = normalizeText(selectedPosition, 80).toUpperCase();
  if (!position || position === "ALL") {
    return true;
  }
  const tokens = getPositionTokens(record);
  if (tokens.includes(position)) {
    return true;
  }
  return ["CB", "CMF", "DMF", "AMF", "WB", "WF", "MF"].includes(position) && tokens.some((token) => token.endsWith(position));
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

function getMetricDirection(metricId) {
  const id = normalizeText(metricId, 160).toLowerCase();
  const metric = (loadedDatabase?.metrics || []).find((item) =>
    [item?.id, item?.key, item?.label].map((value) => normalizeText(value, 160).toLowerCase()).includes(id)
  );
  return normalizeText(metric?.direction, 20).toLowerCase() === "lower" ? "lower" : "higher";
}

function getRecordPositionGroup(record) {
  const tokens = getPositionTokens(record);
  if (!tokens.length) {
    return "GEN";
  }
  if (tokens.some((token) => token === "GK" || token === "GOALKEEPER")) {
    return "GK";
  }
  if (tokens.some((token) => token === "CB" || token.endsWith("CB"))) {
    return "CB";
  }
  if (tokens.some((token) => ["RB", "LB", "RWB", "LWB"].includes(token))) {
    return "FB";
  }
  if (tokens.some((token) => ["DM", "DMF", "CM", "CMF", "RCMF", "LCMF", "AM", "AMF"].includes(token) || token.endsWith("MF"))) {
    return "MF";
  }
  if (tokens.some((token) => ["RW", "LW", "RWF", "LWF", "WF", "W"].includes(token))) {
    return "W";
  }
  if (tokens.some((token) => ["CF", "ST", "FW", "F"].includes(token))) {
    return "FW";
  }
  return tokens[0];
}

function getMetricPercentileValues(metricId, positionGroup) {
  const id = normalizeText(metricId, 160).toLowerCase();
  const group = normalizeText(positionGroup || "GEN", 40);
  const cacheKey = `${group}:${id}`;
  if (metricPercentileCache.has(cacheKey)) {
    return metricPercentileCache.get(cacheKey);
  }
  const values = (loadedDatabase?.records || [])
    .filter((candidate) => getRecordPositionGroup(candidate) === group && getRecordMinutes(candidate) >= 450)
    .map((candidate) => getMetricValue(candidate, id))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  metricPercentileCache.set(cacheKey, values);
  return values;
}

function getMetricPercentile(record, metricId) {
  const value = getMetricValue(record, metricId);
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const values = getMetricPercentileValues(metricId, getRecordPositionGroup(record));
  if (values.length < 2) {
    return 50;
  }
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  let percentile = Math.max(1, Math.min(99, Math.round((low / values.length) * 100)));
  if (getMetricDirection(metricId) === "lower") {
    percentile = 101 - percentile;
  }
  return Math.max(1, Math.min(99, percentile));
}

function buildSearchCorpus(record) {
  const recordId = getRecordId(record);
  if (recordId && searchCorpusCache.has(recordId)) {
    return searchCorpusCache.get(recordId);
  }
  const corpus = [
    getRecordName(record),
    normalizePersonNameForMatch(getRecordName(record)),
    getInitialSurnameAlias(getRecordName(record)),
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

function activateDatabase(database, scriptUrl) {
  if (loadedDatabase === database && loadedScriptUrl === scriptUrl) {
    return loadedDatabase;
  }
  loadedDatabase = database;
  loadedScriptUrl = scriptUrl;
  optionCache = null;
  metricIndexCache = null;
  metricPercentileCache = new Map();
  searchCorpusCache = new Map();
  filteredRecordCache = new Map();
  recordByIdCache = { database: null, byId: new Map() };
  return loadedDatabase;
}

function primeDatabaseIndexes(database = loadedDatabase, options = {}) {
  const records = Array.isArray(database?.records) ? database.records : [];
  if (!records.length) {
    return;
  }
  if (options.recordsById !== false) {
    const byId = new Map();
    for (const record of records) {
      const recordId = getRecordId(record);
      if (recordId && !byId.has(recordId)) {
        byId.set(recordId, record);
      }
    }
    recordByIdCache = { database, byId };
  }
  if (options.options !== false) {
    buildOptions(records);
  }
  if (options.search !== false) {
    for (const record of records) {
      buildSearchCorpus(record);
    }
  }
}

function loadDatabaseFromScript(scriptUrl = "scouting-import-data.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-data.js");
  if (loadedFullDatabase && loadedFullScriptUrl === normalizedScriptUrl) {
    return activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
  }
  self.__footballScienceScoutingDatabase = null;
  importScripts(normalizedScriptUrl);
  const database = self.__footballScienceScoutingDatabase;
  if (!database || !Array.isArray(database.records) || !Array.isArray(database.metrics)) {
    throw new Error("Scouting player database did not register.");
  }
  loadedFullDatabase = database;
  loadedFullScriptUrl = normalizedScriptUrl;
  return activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
}

function loadPreviewDatabaseFromScript(scriptUrl = "scouting-import-preview-data.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-preview-data.js");
  if (loadedPreviewDatabase && loadedPreviewScriptUrl === normalizedScriptUrl) {
    return activateDatabase(loadedPreviewDatabase, loadedPreviewScriptUrl);
  }
  self.__footballScienceScoutingPreviewDatabase = null;
  importScripts(normalizedScriptUrl);
  const database = self.__footballScienceScoutingPreviewDatabase;
  if (!database || !Array.isArray(database.records) || !Array.isArray(database.metrics)) {
    throw new Error("Scouting player database preview did not register.");
  }
  loadedPreviewDatabase = database;
  loadedPreviewScriptUrl = normalizedScriptUrl;
  return activateDatabase(loadedPreviewDatabase, loadedPreviewScriptUrl);
}

async function loadDatabase(scriptUrl = "scouting-import-data.js", manifestScriptUrl = "scouting-import-manifest.js", options = {}) {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-data.js");
  const manifest = loadDatabaseManifest(manifestScriptUrl);
  const primeOptions = options.prime && typeof options.prime === "object" ? options.prime : {};
  if (loadedFullDatabase && loadedFullScriptUrl === normalizedScriptUrl) {
    return activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
  }
  const cachedDatabase = await readWorkerCachedDatabase("full", normalizedScriptUrl, manifest);
  if (cachedDatabase) {
    loadedFullDatabase = cachedDatabase;
    loadedFullScriptUrl = normalizedScriptUrl;
    const database = activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
    primeDatabaseIndexes(database, primeOptions);
    return database;
  }
  const database = loadDatabaseFromScript(normalizedScriptUrl);
  primeDatabaseIndexes(database, primeOptions);
  writeWorkerCachedDatabase("full", normalizedScriptUrl, database, manifest).catch(() => false);
  return database;
}

async function loadPreviewDatabase(scriptUrl = "scouting-import-preview-data.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-preview-data.js");
  if (loadedPreviewDatabase && loadedPreviewScriptUrl === normalizedScriptUrl) {
    return activateDatabase(loadedPreviewDatabase, loadedPreviewScriptUrl);
  }
  const database = loadPreviewDatabaseFromScript(normalizedScriptUrl);
  primeDatabaseIndexes(database, { recordsById: false });
  return database;
}

function normalizeQuery(query = {}) {
  const limit = Math.max(1, Math.min(250, Math.floor(normalizeNumber(query.limit, 50))));
  const offset = Math.max(0, Math.floor(normalizeNumber(query.offset, 0)));
  const metricIds = String(
    Array.isArray(query.metricIds) ? query.metricIds.join(",") : query.metricIds || query.metricId || ""
  )
    .split(",")
    .map((item) => normalizeText(item, 160).toLowerCase())
    .filter((item) => item && item !== "all")
    .slice(0, 20);
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
    metricIds: Array.from(new Set(metricIds)),
    metricMin: normalizeNumber(query.metricMin, NaN),
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
  if (!positionMatchesFilter(record, query.position)) {
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
  if (query.query && !buildSearchCorpus(record).includes(query.query) && !areNamesInitialSurnameMatch(query.query, getRecordName(record))) {
    return false;
  }
  if (query.metricIds.length && Number.isFinite(query.metricMin) && query.metricMin > 0) {
    return query.metricIds.some((metricId) => getMetricPercentile(record, metricId) >= query.metricMin);
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

function compareRepresentativeMetricValues(bestRecord, candidateRecord, sortMetricId) {
  const id = normalizeText(sortMetricId, 160).toLowerCase();
  if (id === "age") {
    const bestAge = getRecordAge(bestRecord);
    const candidateAge = getRecordAge(candidateRecord);
    const safeBestAge = Number.isFinite(bestAge) ? bestAge : Number.MAX_SAFE_INTEGER;
    const safeCandidateAge = Number.isFinite(candidateAge) ? candidateAge : Number.MAX_SAFE_INTEGER;
    return safeBestAge - safeCandidateAge;
  }
  const bestValue = Number.isFinite(getMetricValue(bestRecord, sortMetricId)) ? getMetricValue(bestRecord, sortMetricId) : 0;
  const candidateValue = Number.isFinite(getMetricValue(candidateRecord, sortMetricId))
    ? getMetricValue(candidateRecord, sortMetricId)
    : 0;
  return candidateValue - bestValue;
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
    query.metricIds.length ? query.metricIds.join(",") : "all",
    Number.isFinite(query.metricMin) ? query.metricMin : "",
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
  const filteredSeasonRecords = getFilteredSortedRecords(records, normalizedQuery);
  const filteredRecords = dedupeScoutingPlayerRecords(filteredSeasonRecords, normalizedQuery);
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
  if (recordByIdCache.database !== loadedDatabase) {
    primeDatabaseIndexes(loadedDatabase, { options: false, search: false });
  }
  const matches = [];
  for (const recordId of wantedIds) {
    const record = recordByIdCache.byId.get(recordId);
    if (record) {
      matches.push(record);
    }
  }
  return matches;
}

async function handleWorkerMessage(event) {
  if (!["query", "recordsByIds", "preview", "preload"].includes(event.data?.type)) {
    return;
  }
  const requestId = Number(event.data.requestId) || 0;
  try {
    const fullScriptUrl = event.data.scriptUrl || "scouting-import-data.js";
    const previewScriptUrl = event.data.previewScriptUrl || "scouting-import-preview-data.js";
    const manifestScriptUrl = event.data.manifestScriptUrl || "scouting-import-manifest.js";
    if (event.data.type === "preview") {
      await loadPreviewDatabase(previewScriptUrl, manifestScriptUrl);
      self.postMessage({
        type: "database",
        requestId,
        database: getDatabasePage(event.data.query || {}),
      });
      return;
    }
    if (event.data.type === "preload") {
      await loadDatabase(fullScriptUrl, manifestScriptUrl, { prime: { options: false, search: false } });
      self.postMessage({
        type: "preloaded",
        requestId,
      });
      return;
    }
    if (event.data.type === "recordsByIds") {
      await loadDatabase(fullScriptUrl, manifestScriptUrl, { prime: { options: false, search: false } });
      self.postMessage({
        type: "records",
        requestId,
        records: getRecordsByIds(event.data.recordIds || []),
      });
      return;
    }
    if (!loadedFullDatabase || loadedFullScriptUrl !== String(fullScriptUrl || "scouting-import-data.js")) {
      await loadDatabase(fullScriptUrl, manifestScriptUrl);
    }
    activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
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
}

self.addEventListener("message", (event) => {
  handleWorkerMessage(event);
});
