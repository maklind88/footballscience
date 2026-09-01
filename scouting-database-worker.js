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
let loadedFullDatabaseLoad = null;
let loadedPreviewDatabase = null;
let loadedPreviewScriptUrl = "";
let optionCache = null;
let metricIndexCache = null;
let metricPercentileCache = new Map();
let searchNameSignatureCache = new Map();
let filteredRecordCache = new Map();
let dedupedRecordCache = new Map();
let recordMetadataCache = new WeakMap();
let recordByIdCache = { database: null, byId: new Map() };

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
    return { normalized: "", firstInitial: "", surname: "", tokenCount: 0 };
  }
  const firstToken = tokens[0] || "";
  return {
    normalized,
    firstInitial: firstToken.slice(0, 1),
    surname: tokens[tokens.length - 1] || "",
    tokenCount: tokens.length,
  };
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
  return getRecordMetadata(record).age;
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
  return getRecordMetadata(record).seasonYear;
}

function getRecordIdentityBaseKey(record) {
  return getRecordMetadata(record).identityKey;
}

function hasPlausibleSeasonAgeLink(firstRecord, nextRecord) {
  const first = getRecordMetadata(firstRecord);
  const next = getRecordMetadata(nextRecord);

  if (
    !Number.isFinite(first.age) ||
    !Number.isFinite(next.age) ||
    !Number.isFinite(first.seasonYear) ||
    !Number.isFinite(next.seasonYear)
  ) {
    return true;
  }

  const ageDelta = next.age - first.age;
  const seasonDelta = next.seasonYear - first.seasonYear;
  return Math.abs(ageDelta - seasonDelta) <= 2;
}

function areRecordClubSeasonSignalsCompatible(firstRecord, nextRecord) {
  const first = getRecordMetadata(firstRecord);
  const next = getRecordMetadata(nextRecord);
  if (!first.identityTeam || !next.identityTeam || first.identityTeam === next.identityTeam) {
    return true;
  }
  if (first.identitySeason && next.identitySeason && first.identitySeason === next.identitySeason) {
    if (Number.isFinite(first.age) && Number.isFinite(next.age) && Math.abs(first.age - next.age) > 1) {
      return false;
    }
  }
  return true;
}

function areRecordPositionsCompatibleForWeakIdentity(firstRecord, nextRecord) {
  const firstGroup = getRecordMetadata(firstRecord).positionGroup;
  const nextGroup = getRecordMetadata(nextRecord).positionGroup;
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
    const best = getRecordMetadata(bestRecord);
    const candidate = getRecordMetadata(candidateRecord);

    const selectedSeason = normalizeText(query.season, 80);
    const bestSeasonMatch = selectedSeason && selectedSeason !== "all" && best.season === selectedSeason;
    const candidateSeasonMatch = selectedSeason && selectedSeason !== "all" && candidate.season === selectedSeason;
    if (bestSeasonMatch !== candidateSeasonMatch) {
      return candidateSeasonMatch ? candidateRecord : bestRecord;
    }

    const bestYear = best.seasonYear;
    const candidateYear = candidate.seasonYear;
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

    const bestMinutes = best.minutes;
    const candidateMinutes = candidate.minutes;
    if (candidateMinutes !== bestMinutes) {
      return candidateMinutes > bestMinutes ? candidateRecord : bestRecord;
    }

    if (candidate.name.localeCompare(best.name) < 0) {
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
      const firstMetadata = getRecordMetadata(first);
      const secondMetadata = getRecordMetadata(second);
      const firstYear = firstMetadata.seasonYear;
      const secondYear = secondMetadata.seasonYear;
      const yearDelta =
        (Number.isFinite(secondYear) ? secondYear : Number.NEGATIVE_INFINITY) -
        (Number.isFinite(firstYear) ? firstYear : Number.NEGATIVE_INFINITY);
      return yearDelta || secondMetadata.minutes - firstMetadata.minutes || firstMetadata.name.localeCompare(secondMetadata.name);
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

function dedupeScoutingPlayerRecords(records = [], query = {}, options = {}) {
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
        if (options.attachMergedSeasons === false) {
          options.seasonRecordsByRepresentative?.set(representativeRecord, bucket.records);
          representativeRecords.push(representativeRecord);
        } else {
          representativeRecords.push(attachMergedSeasonRecords(representativeRecord, bucket.records));
        }
      }
    });
  });

  return representativeRecords;
}

function getRecordMatches(record) {
  return getRecordMetadata(record).matches;
}

function getRecordMinutes(record) {
  return getRecordMetadata(record).minutes;
}

function tokenizePosition(position = "") {
  return position
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getPositionGroupFromTokens(tokens = []) {
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

function getRecordMetadata(record) {
  if (record && typeof record === "object" && recordMetadataCache.has(record)) {
    return recordMetadataCache.get(record);
  }
  const name = getRecordName(record);
  const team = getRecordTeam(record);
  const league = getRecordLeague(record);
  const season = getRecordSeason(record);
  const position = getRecordPosition(record);
  const positionTokens = tokenizePosition(position);
  const age = normalizeNumber(getRecordValue(record, recordIndex.age), Number.NaN);
  const matches = normalizeNumber(getRecordValue(record, recordIndex.matches), 0);
  const minutes = normalizeNumber(getRecordValue(record, recordIndex.minutes), 0);
  const years = season.match(/\d{4}/g);
  const identityName = normalizeIdentityPart(name);
  const countries = [
    normalizeIdentityPart(getRecordValue(record, recordIndex.birthCountry), 60),
    normalizeIdentityPart(getRecordValue(record, recordIndex.passportCountry), 60),
  ]
    .filter(Boolean)
    .sort()
    .join("|");
  const height = normalizeNumber(getRecordValue(record, recordIndex.height), Number.NaN);
  const heightKey = Number.isFinite(height) && height > 0 ? `h${Math.round(height)}` : "";
  const metadata = {
    age,
    identityKey: identityName ? [identityName, countries, heightKey].filter(Boolean).join("::") : "",
    identitySeason: normalizeIdentityPart(season, 80),
    identityTeam: normalizeIdentityPart(team, 180),
    league,
    matches,
    minutes,
    name,
    positionGroup: getPositionGroupFromTokens(positionTokens),
    positionTokens,
    season,
    seasonYear: years?.length ? Math.max(...years.map((year) => Number(year)).filter(Number.isFinite)) : Number.NaN,
    team,
  };
  if (record && typeof record === "object") {
    recordMetadataCache.set(record, metadata);
  }
  return metadata;
}

function getPositionTokens(recordOrPosition) {
  return Array.isArray(recordOrPosition)
    ? getRecordMetadata(recordOrPosition).positionTokens
    : tokenizePosition(normalizeText(recordOrPosition, 120));
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
  return getRecordMetadata(record).positionGroup;
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

function getSearchNameSignature(record) {
  const recordId = getRecordId(record);
  if (recordId && searchNameSignatureCache.has(recordId)) {
    return searchNameSignatureCache.get(recordId);
  }
  const signature = getPersonNameSignature(getRecordName(record));
  if (recordId) {
    searchNameSignatureCache.set(recordId, signature);
  }
  return signature;
}

function searchValueIncludes(value, query) {
  return String(value ?? "").toLowerCase().includes(query);
}

function recordMatchesSearchQuery(record, query) {
  const searchQuery = query.query;
  const playerName = getRecordValue(record, recordIndex.player);
  if (
    searchValueIncludes(playerName, searchQuery) ||
    searchValueIncludes(
      getRecordValue(record, recordIndex.teamWithinTimeframe) || getRecordValue(record, recordIndex.team),
      searchQuery
    ) ||
    searchValueIncludes(getRecordValue(record, recordIndex.league), searchQuery) ||
    searchValueIncludes(getRecordValue(record, recordIndex.season), searchQuery) ||
    searchValueIncludes(getRecordValue(record, recordIndex.position), searchQuery) ||
    searchValueIncludes(getRecordValue(record, recordIndex.birthCountry), searchQuery) ||
    searchValueIncludes(getRecordValue(record, recordIndex.passportCountry), searchQuery) ||
    searchValueIncludes(getRecordValue(record, recordIndex.id), searchQuery)
  ) {
    return true;
  }
  const queryNameSignature = query.queryNameSignature;
  if (queryNameSignature?.tokenCount < 2 && !/[^\x00-\x7F]/.test(String(playerName || ""))) {
    return false;
  }
  const recordNameSignature = getSearchNameSignature(record);
  if (queryNameSignature?.normalized && recordNameSignature.normalized.includes(queryNameSignature.normalized)) {
    return true;
  }
  return Boolean(
    queryNameSignature?.tokenCount >= 2 &&
      queryNameSignature.firstInitial &&
      queryNameSignature.surname &&
      queryNameSignature.firstInitial === recordNameSignature.firstInitial &&
      queryNameSignature.surname === recordNameSignature.surname
  );
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
    const metadata = getRecordMetadata(record);
    const { league, team, season } = metadata;
    if (league) {
      leagues.add(league);
    }
    if (team) {
      teams.add(team);
    }
    if (season) {
      seasons.add(season);
    }
    metadata.positionTokens.forEach((token) => positions.add(token));
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
  searchNameSignatureCache = new Map();
  filteredRecordCache = new Map();
  dedupedRecordCache = new Map();
  recordMetadataCache = new WeakMap();
  recordByIdCache = { database: null, byId: new Map() };
  return loadedDatabase;
}

function primeDatabaseIndexes(database = loadedDatabase, options = {}) {
  const records = Array.isArray(database?.records) ? database.records : [];
  if (!records.length) {
    return;
  }
  if (options.recordsById === true) {
    const byId = new Map();
    for (const record of records) {
      const recordId = getRecordId(record);
      if (recordId && !byId.has(recordId)) {
        byId.set(recordId, record);
      }
    }
    recordByIdCache = { database, byId };
  }
  if (options.options === true) {
    buildOptions(records);
  }
  if (options.search === true) {
    for (const record of records) {
      getSearchNameSignature(record);
    }
  }
}

function parseGeneratedDatabaseSource(source = "", globalName = "") {
  const marker = `window.${globalName}=`;
  const startIndex = source.indexOf(marker);
  if (startIndex < 0) {
    throw new Error("Scouting player database payload marker is missing.");
  }
  const payloadStart = startIndex + marker.length;
  const nextAssignmentIndex = source.indexOf(";\nwindow.", payloadStart);
  const payloadEnd = nextAssignmentIndex >= 0 ? nextAssignmentIndex : source.lastIndexOf(";");
  if (payloadEnd <= payloadStart) {
    throw new Error("Scouting player database payload is incomplete.");
  }
  return JSON.parse(source.slice(payloadStart, payloadEnd));
}

async function fetchGeneratedDatabase(scriptUrl, globalName) {
  const response = await fetch(scriptUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Scouting player database request failed (${response.status}).`);
  }
  return parseGeneratedDatabaseSource(await response.text(), globalName);
}

async function loadDatabaseFromScript(scriptUrl = "scouting-import-data.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-data.js");
  if (loadedFullDatabase && loadedFullScriptUrl === normalizedScriptUrl) {
    return activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
  }
  let database = null;
  try {
    database = await fetchGeneratedDatabase(normalizedScriptUrl, "__footballScienceBundledScoutingDatabase");
  } catch {
    self.__footballScienceScoutingDatabase = null;
    importScripts(normalizedScriptUrl);
    database = self.__footballScienceScoutingDatabase;
  }
  if (!database || !Array.isArray(database.records) || !Array.isArray(database.metrics)) {
    throw new Error("Scouting player database did not register.");
  }
  loadedFullDatabase = database;
  loadedFullScriptUrl = normalizedScriptUrl;
  return activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
}

async function loadPreviewDatabaseFromScript(scriptUrl = "scouting-import-preview-data.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-preview-data.js");
  if (loadedPreviewDatabase && loadedPreviewScriptUrl === normalizedScriptUrl) {
    return activateDatabase(loadedPreviewDatabase, loadedPreviewScriptUrl);
  }
  let database = null;
  try {
    database = await fetchGeneratedDatabase(normalizedScriptUrl, "__footballScienceScoutingPreviewDatabase");
  } catch {
    self.__footballScienceScoutingPreviewDatabase = null;
    importScripts(normalizedScriptUrl);
    database = self.__footballScienceScoutingPreviewDatabase;
  }
  if (!database || !Array.isArray(database.records) || !Array.isArray(database.metrics)) {
    throw new Error("Scouting player database preview did not register.");
  }
  loadedPreviewDatabase = database;
  loadedPreviewScriptUrl = normalizedScriptUrl;
  return activateDatabase(loadedPreviewDatabase, loadedPreviewScriptUrl);
}

async function loadDatabase(scriptUrl = "scouting-import-data.js", options = {}) {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-data.js");
  const primeOptions = options.prime && typeof options.prime === "object" ? options.prime : null;
  if (loadedFullDatabase && loadedFullScriptUrl === normalizedScriptUrl) {
    const activeDatabase = activateDatabase(loadedFullDatabase, loadedFullScriptUrl);
    if (primeOptions) primeDatabaseIndexes(activeDatabase, primeOptions);
    return activeDatabase;
  }

  if (!loadedFullDatabaseLoad || loadedFullDatabaseLoad.scriptUrl !== normalizedScriptUrl) {
    const promise = Promise.resolve().then(() => {
      const database = loadDatabaseFromScript(normalizedScriptUrl);
      return database;
    });
    loadedFullDatabaseLoad = { promise, scriptUrl: normalizedScriptUrl };
  }

  const activeLoad = loadedFullDatabaseLoad;
  try {
    const database = await activeLoad.promise;
    const activeDatabase = activateDatabase(database, normalizedScriptUrl);
    if (primeOptions) primeDatabaseIndexes(activeDatabase, primeOptions);
    return activeDatabase;
  } finally {
    if (loadedFullDatabaseLoad === activeLoad) {
      loadedFullDatabaseLoad = null;
    }
  }
}

async function loadPreviewDatabase(scriptUrl = "scouting-import-preview-data.js") {
  const normalizedScriptUrl = String(scriptUrl || "scouting-import-preview-data.js");
  if (loadedPreviewDatabase && loadedPreviewScriptUrl === normalizedScriptUrl) {
    return activateDatabase(loadedPreviewDatabase, loadedPreviewScriptUrl);
  }
  const database = await loadPreviewDatabaseFromScript(normalizedScriptUrl);
  primeDatabaseIndexes(database, { options: true });
  return database;
}

function normalizeQuery(query = {}) {
  const searchQuery = normalizeText(query.query, 120).toLowerCase();
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
    query: searchQuery,
    queryNameSignature: searchQuery ? getPersonNameSignature(searchQuery) : null,
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
    includeMetrics: !["0", "false"].includes(String(query.includeMetrics ?? "1").toLowerCase()),
    includeOptions: !["0", "false"].includes(String(query.includeOptions ?? "1").toLowerCase()),
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
  if (query.position && query.position !== "ALL" && !positionMatchesFilter(record, query.position)) {
    return false;
  }
  if (query.minMinutes > 0 || query.maxMinutes > 0) {
    const minutes = getRecordMinutes(record);
    if (query.minMinutes > 0 && minutes < query.minMinutes) {
      return false;
    }
    if (query.maxMinutes > 0 && minutes > query.maxMinutes) {
      return false;
    }
  }
  const hasMinAge = Number.isFinite(query.minAge) && query.minAge > 0;
  const hasMaxAge = Number.isFinite(query.maxAge) && query.maxAge > 0;
  if (hasMinAge || hasMaxAge) {
    const age = getRecordAge(record);
    if (hasMinAge && (!Number.isFinite(age) || age < query.minAge)) {
      return false;
    }
    if (hasMaxAge && (!Number.isFinite(age) || age > query.maxAge)) {
      return false;
    }
  }
  if (query.query && !recordMatchesSearchQuery(record, query)) {
    return false;
  }
  if (query.metricIds.length && Number.isFinite(query.metricMin) && query.metricMin > 0) {
    return query.metricIds.some((metricId) => getMetricPercentile(record, metricId) >= query.metricMin);
  }
  return true;
}

function sortRecordsByMetric(records = [], sortMetricId = "minutes") {
  const id = normalizeText(sortMetricId, 160).toLowerCase();
  const mode = id === "age" ? "age" : id === "matches" || id === "matches-played" ? "matches" : !id || id === "minutes" ? "minutes" : "metric";
  const entries = records.map((record) => {
    const metadata = getRecordMetadata(record);
    let primaryValue = metadata.minutes;
    if (mode === "age") {
      primaryValue = Number.isFinite(metadata.age) ? metadata.age : Number.MAX_SAFE_INTEGER;
    } else if (mode === "matches") {
      primaryValue = metadata.matches;
    } else if (mode === "metric") {
      const metricValue = getMetricValue(record, sortMetricId);
      primaryValue = Number.isFinite(metricValue) ? metricValue : 0;
    }
    return {
      minutes: metadata.minutes,
      name: metadata.name,
      primaryValue,
      record,
    };
  });
  entries.sort((first, second) => {
    const primaryDelta = mode === "age"
      ? first.primaryValue - second.primaryValue
      : second.primaryValue - first.primaryValue;
    return primaryDelta || second.minutes - first.minutes || first.name.localeCompare(second.name);
  });
  return entries.map((entry) => entry.record);
}

function compareRepresentativeMetricValues(bestRecord, candidateRecord, sortMetricId) {
  const id = normalizeText(sortMetricId, 160).toLowerCase();
  if (id === "age") {
    const bestAge = getRecordMetadata(bestRecord).age;
    const candidateAge = getRecordMetadata(candidateRecord).age;
    const safeBestAge = Number.isFinite(bestAge) ? bestAge : Number.MAX_SAFE_INTEGER;
    const safeCandidateAge = Number.isFinite(candidateAge) ? candidateAge : Number.MAX_SAFE_INTEGER;
    return safeBestAge - safeCandidateAge;
  }
  const bestMetricValue = getMetricValue(bestRecord, sortMetricId);
  const candidateMetricValue = getMetricValue(candidateRecord, sortMetricId);
  const bestValue = Number.isFinite(bestMetricValue) ? bestMetricValue : 0;
  const candidateValue = Number.isFinite(candidateMetricValue) ? candidateMetricValue : 0;
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
  const sortedRecords = sortRecordsByMetric(filteredRecords, query.sortMetricId);
  if (filteredRecordCache.size > 12) {
    filteredRecordCache.clear();
  }
  filteredRecordCache.set(cacheKey, sortedRecords);
  return sortedRecords;
}

function getDedupedRecordEntry(records, query) {
  const cacheKey = getFilteredRecordCacheKey(query);
  if (dedupedRecordCache.has(cacheKey)) {
    return dedupedRecordCache.get(cacheKey);
  }
  const seasonRecordsByRepresentative = new Map();
  const dedupedRecords = dedupeScoutingPlayerRecords(records, query, {
    attachMergedSeasons: false,
    seasonRecordsByRepresentative,
  });
  if (dedupedRecordCache.size > 12) {
    dedupedRecordCache.clear();
  }
  const entry = { records: dedupedRecords, seasonRecordsByRepresentative };
  dedupedRecordCache.set(cacheKey, entry);
  return entry;
}

function getDatabasePage(query = {}) {
  const database = loadedDatabase;
  const records = Array.isArray(database?.records) ? database.records : [];
  const normalizedQuery = normalizeQuery(query);
  const filteredSeasonRecords = getFilteredSortedRecords(records, normalizedQuery);
  const dedupedEntry = getDedupedRecordEntry(filteredSeasonRecords, normalizedQuery);
  const filteredRecords = dedupedEntry.records;
  const total = filteredRecords.length;
  const pageRecords = filteredRecords
    .slice(normalizedQuery.offset, normalizedQuery.offset + normalizedQuery.limit)
    .map((record) => {
      const seasonRecords = dedupedEntry.seasonRecordsByRepresentative.get(record);
      return seasonRecords ? attachMergedSeasonRecords(record, seasonRecords) : record;
    });
  const nextOffset = normalizedQuery.offset + pageRecords.length;
  const hasMore = nextOffset < total;
  return {
    source: "worker",
    sourceRows: Math.max(0, Math.floor(Number(database?.totalRecords) || records.length)),
    importedAt: database?.importedAt || "",
    fileName: database?.fileName || "",
    sheets: Array.isArray(database?.sheets) ? database.sheets : [],
    metrics: normalizedQuery.includeMetrics && Array.isArray(database?.metrics) ? database.metrics : undefined,
    options: normalizedQuery.includeOptions ? buildOptions(records) : undefined,
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
    primeDatabaseIndexes(loadedDatabase, { recordsById: true });
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
    if (event.data.type === "preview") {
      await loadPreviewDatabase(previewScriptUrl);
      self.postMessage({
        type: "database",
        requestId,
        database: getDatabasePage(event.data.query || {}),
      });
      return;
    }
    if (event.data.type === "preload") {
      await loadDatabase(fullScriptUrl, { prime: { recordsById: false, options: true, search: false } });
      self.postMessage({
        type: "preloaded",
        requestId,
      });
      return;
    }
    if (event.data.type === "recordsByIds") {
      await loadDatabase(fullScriptUrl, { prime: { recordsById: true, options: false, search: false } });
      self.postMessage({
        type: "records",
        requestId,
        records: getRecordsByIds(event.data.recordIds || []),
      });
      return;
    }
    if (!loadedFullDatabase || loadedFullScriptUrl !== String(fullScriptUrl || "scouting-import-data.js")) {
      await loadDatabase(fullScriptUrl);
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
