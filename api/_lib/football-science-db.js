const crypto = require("node:crypto");
const { parseJsonBody, readConfig, sendJson } = require("./supabase-admin.js");

const FOOTBALL_SCIENCE_DB_SCHEMA = "footballscience-db-v1";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_IMPORT_RECORDS = 250;
const FSDB_READ_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"]);
const FSDB_WRITE_ROLES = new Set(["admin", "club-admin", "team-admin", "scout", "analyst"]);

function normalizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeIdentityText(value = "", maxLength = 240) {
  return normalizeText(value, maxLength)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizePersonNameForMatch(value = "") {
  return normalizeIdentityText(value, 240);
}

function getNameTokens(value = "") {
  return normalizeText(value, 240).split(/\s+/).filter(Boolean);
}

function isNameInitialToken(token = "") {
  return /^[A-Za-z]$/.test(String(token || "").replace(/\./g, ""));
}

function isInitialOnlyName(value = "") {
  const raw = normalizeText(value, 240);
  if (!raw) {
    return false;
  }
  if (/^(?:[A-Za-z]\.\s*){1,4}\S+/.test(raw)) {
    return true;
  }
  const tokens = getNameTokens(raw.replace(/\./g, " "));
  if (tokens.length < 2) {
    return false;
  }
  const givenTokens = tokens.slice(0, -1);
  return givenTokens.length > 0 && givenTokens.every(isNameInitialToken);
}

function isUsableFullName(value = "") {
  const tokens = getNameTokens(value);
  return tokens.length >= 2 && !isInitialOnlyName(value) && tokens.some((token) => token.replace(/[^A-Za-z]/g, "").length > 1);
}

function chooseBestPlayerName(canonicalName = "", fullName = "", displayName = "") {
  const canonical = normalizeText(canonicalName, 180);
  const full = normalizeText(fullName, 240);
  const display = normalizeText(displayName, 180);
  if (isUsableFullName(full)) {
    if (!canonical || isInitialOnlyName(canonical) || getNameTokens(full).length > getNameTokens(canonical).length) {
      return full.slice(0, 180);
    }
  }
  if (isUsableFullName(display) && (!canonical || isInitialOnlyName(canonical))) {
    return display.slice(0, 180);
  }
  return canonical || full.slice(0, 180) || display;
}

function getPlayerNameQuality(value = "") {
  const name = normalizeText(value, 240);
  if (!name) {
    return "unknown";
  }
  return isUsableFullName(name) ? "full" : isInitialOnlyName(name) ? "initial" : "unknown";
}

function normalizeSourceSystem(value = "") {
  return normalizeText(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function normalizeGenderSegment(value = "") {
  const normalized = normalizeText(value, 20).toLowerCase();
  return ["women", "men", "mixed", "unknown"].includes(normalized) ? normalized : "";
}

function normalizeActiveStatus(value = "") {
  const normalized = normalizeText(value, 20).toLowerCase();
  return ["active", "inactive", "retired", "archived", "unknown"].includes(normalized) ? normalized : "";
}

function normalizePositionGroup(value = "") {
  return normalizeText(value, 40).toUpperCase();
}

function normalizeNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBirthYear(value) {
  const year = Math.round(normalizeNumber(value, NaN));
  return Number.isFinite(year) && year >= 1800 && year <= 2100 ? year : null;
}

function normalizeDateOfBirth(value = "") {
  const date = normalizeText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  return normalizeBirthYear(date.slice(0, 4)) ? date : null;
}

function getPrimaryIdentityCountry(record = {}) {
  const passports = Array.isArray(record.passportCountries || record.passport_countries)
    ? record.passportCountries || record.passport_countries
    : [];
  return (
    normalizeText(record.nationality, 120) ||
    normalizeText(passports[0], 120) ||
    normalizeText(record.passportCountry || record.passport_country, 120) ||
    normalizeText(record.birthCountry || record.birth_country, 120) ||
    ""
  );
}

function buildStrongPlayerDedupeKey(record = {}) {
  const name = chooseBestPlayerName(
    record.canonicalName || record.canonical_name || record.name,
    record.fullName || record.full_name,
    record.displayName || record.display_name
  );
  const dateOfBirth = normalizeText(record.dateOfBirth || record.date_of_birth, 40);
  const country = getPrimaryIdentityCountry(record);
  const gender = normalizeGenderSegment(record.genderSegment || record.gender_segment) || "unknown";
  if (!isUsableFullName(name) || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !country) {
    return null;
  }
  return [
    `name:${normalizePersonNameForMatch(name)}`,
    `dob:${dateOfBirth}`,
    `country:${normalizeIdentityText(country, 120)}`,
    `gender:${gender}`,
  ].join("|");
}

function asLimit(value, fallback = DEFAULT_LIMIT) {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(limit, MAX_LIMIT);
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  try {
    const decoded = JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
    return decoded && typeof decoded === "object" ? decoded : null;
  } catch {
    return null;
  }
}

function encodePlayerCursor(player = {}) {
  const id = normalizeText(player.id, 80);
  return id ? base64UrlEncode({ id }) : null;
}

function decodePlayerCursor(cursor = "") {
  const decoded = base64UrlDecode(cursor);
  const id = normalizeText(decoded?.id, 80);
  return /^[0-9a-f-]{36}$/i.test(id) ? { id } : null;
}

function safeIlike(value = "") {
  return normalizeText(value, 180).replace(/[%*_]/g, "").slice(0, 180);
}

function actorRole(actor = {}) {
  return normalizeText(actor.role || "unknown", 40).toLowerCase();
}

function canReadFootballScienceDb(actor = {}) {
  return FSDB_READ_ROLES.has(actorRole(actor));
}

function canWriteFootballScienceDb(actor = {}) {
  return FSDB_WRITE_ROLES.has(actorRole(actor));
}

function restBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return {
    url: `${url}/rest/v1`,
    serviceRoleKey,
  };
}

function restHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function parseCount(responseHeaders) {
  if (!responseHeaders || typeof responseHeaders.get !== "function") {
    return null;
  }
  const contentRange = responseHeaders.get("content-range");
  if (!contentRange) {
    return null;
  }
  const match = String(contentRange).match(/\/(\*|[0-9]+)\s*$/);
  if (!match || match[1] === "*") {
    return null;
  }
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : null;
}

async function dbRequest(path, options = {}) {
  const base = restBaseUrl();
  if (!base) {
    return { ok: false, status: 500, reason: "Missing Supabase database configuration." };
  }

  const headers = restHeaders(base.serviceRoleKey, options.headers || {});
  if (options.includeCount) {
    const existingPrefer = String(headers.Prefer || headers.prefer || "").trim();
    const countStrategy = ["exact", "planned", "estimated"].includes(normalizeText(options.countStrategy, 20))
      ? normalizeText(options.countStrategy, 20)
      : "exact";
    headers.Prefer = existingPrefer ? `${existingPrefer},count=${countStrategy}` : `count=${countStrategy}`;
  }

  const response = await fetch(`${base.url}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: payload?.message || payload?.error || `Football Science DB request failed (${response.status}).`,
      payload,
    };
  }
  return {
    ok: true,
    status: response.status,
    payload,
    count: parseCount(response.headers),
  };
}

function footballScienceDbStatus(actor = {}) {
  return {
    ok: true,
    schema: FOOTBALL_SCIENCE_DB_SCHEMA,
    mode: "server-first",
    enabled: true,
    canRead: canReadFootballScienceDb(actor),
    canWrite: canWriteFootballScienceDb(actor),
    maxPageSize: MAX_LIMIT,
    tables: {
      players: "fsdb_players",
      aliases: "fsdb_player_aliases",
      sourceLinks: "fsdb_player_source_links",
      teams: "fsdb_teams",
      competitions: "fsdb_competitions",
      rosters: "fsdb_roster_entries",
      stats: "fsdb_player_season_stats",
      imports: "fsdb_import_batches",
      importErrors: "fsdb_import_errors",
    },
  };
}

function fsdbPercent(part, total) {
  const numerator = Math.max(0, Number(part) || 0);
  const denominator = Math.max(0, Number(total) || 0);
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function normalizeQualityCountMap(counts = {}) {
  const result = {};
  Object.entries(counts || {}).forEach(([key, value]) => {
    const number = Number(value);
    result[key] = Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  });
  return result;
}

function buildFootballScienceDbQualitySummary(counts = {}, reviewQueues = {}) {
  const safeCounts = normalizeQualityCountMap(counts);
  const total = safeCounts.total || 0;
  const knownGender = (safeCounts.women || 0) + (safeCounts.men || 0) + (safeCounts.mixed || 0);
  const fullNames = safeCounts.fullNames || 0;
  const dedupeReady = safeCounts.dedupeReady || 0;
  const sourceLinked = safeCounts.sourceLinked || 0;
  const rosterLinked = safeCounts.rosterLinked || 0;
  const statsLinked = safeCounts.statsLinked || 0;
  const spiderMetricDepth = safeCounts.spiderMetricDepth || 0;
  const profileSignals = [
    fsdbPercent(safeCounts.birthDateKnown, total),
    fsdbPercent(safeCounts.nationalityKnown, total),
    fsdbPercent(safeCounts.positionKnown, total),
    fsdbPercent(fullNames, total),
    fsdbPercent(dedupeReady, total),
  ];
  const profileCompleteness = total ? Math.round(profileSignals.reduce((sum, value) => sum + value, 0) / profileSignals.length) : 0;

  return {
    ok: true,
    schema: FOOTBALL_SCIENCE_DB_SCHEMA,
    generatedAt: new Date().toISOString(),
    countStrategy: "planned",
    totals: {
      players: total,
      women: safeCounts.women || 0,
      men: safeCounts.men || 0,
      mixed: safeCounts.mixed || 0,
      unknownGender: Math.max(0, total - knownGender),
    },
    coverage: {
      profileCompleteness,
      fullNamePct: fsdbPercent(fullNames, total),
      dedupePct: fsdbPercent(dedupeReady, total),
      sourceLinkPct: fsdbPercent(sourceLinked, total),
      rosterPct: fsdbPercent(rosterLinked, total),
      statsPct: fsdbPercent(statsLinked, total),
      spiderMetricPct: fsdbPercent(spiderMetricDepth, total),
      birthDatePct: fsdbPercent(safeCounts.birthDateKnown, total),
      nationalityPct: fsdbPercent(safeCounts.nationalityKnown, total),
      positionPct: fsdbPercent(safeCounts.positionKnown, total),
    },
    counts: {
      ...safeCounts,
      missingFullName: Math.max(0, total - fullNames),
      missingDedupe: Math.max(0, total - dedupeReady),
      missingSourceLink: Math.max(0, total - sourceLinked),
      missingRoster: Math.max(0, total - rosterLinked),
      missingStats: Math.max(0, total - statsLinked),
      missingSpiderMetrics: Math.max(0, total - spiderMetricDepth),
    },
    reviewQueues: {
      weakIdentity: Array.isArray(reviewQueues.weakIdentity) ? reviewQueues.weakIdentity.slice(0, 8) : [],
      initialNames: Array.isArray(reviewQueues.initialNames) ? reviewQueues.initialNames.slice(0, 8) : [],
    },
  };
}

async function countFsdbPlayers(filters = {}) {
  const params = new URLSearchParams({
    select: "id",
    active_status: "neq.archived",
    limit: "1",
  });
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  });
  const result = await dbRequest(`/fsdb_players?${params.toString()}`, { includeCount: true, countStrategy: "planned" });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Number.isFinite(Number(result.count)) ? Math.max(0, Math.floor(Number(result.count))) : 0;
}

function qualityPlayerReviewToClient(row = {}) {
  return {
    id: normalizeText(row.id, 80),
    fsdbId: normalizeText(row.fsdb_id, 80),
    name: normalizeText(row.canonical_name || row.full_name || row.display_name, 180),
    dateOfBirth: normalizeText(row.date_of_birth, 40),
    birthYear: Number.isFinite(Number(row.birth_year)) ? Number(row.birth_year) : null,
    genderSegment: normalizeGenderSegment(row.gender_segment) || "unknown",
    nationality: normalizeText(row.nationality || row.birth_country, 120),
    team: normalizeText(row.current_team_name, 180),
    position: normalizeText(row.primary_position || row.position_group, 120),
    nameQuality: normalizeText(row.name_quality, 40) || getPlayerNameQuality(row.canonical_name || row.full_name),
    sourceConfidence: normalizeNumber(row.source_confidence, 0),
    sourceLinkCount: normalizeNumber(row.source_link_count, 0),
    rosterEntryCount: normalizeNumber(row.roster_entry_count, 0),
    metricCount: normalizeNumber(row.metric_count, 0),
    dedupeKeyPresent: Boolean(normalizeText(row.dedupe_key, 260)),
    updatedAt: normalizeText(row.updated_at, 40),
  };
}

async function fetchQualityReviewQueue(filters = {}) {
  const params = new URLSearchParams({
    select:
      "id,fsdb_id,canonical_name,full_name,display_name,date_of_birth,birth_year,gender_segment,nationality,birth_country,primary_position,position_group,current_team_name,source_confidence,source_link_count,roster_entry_count,metric_count,name_quality,dedupe_key,updated_at",
    active_status: "neq.archived",
    order: "source_confidence.asc,updated_at.desc",
    limit: "8",
  });
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  });
  const result = await dbRequest(`/fsdb_players?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return (Array.isArray(result.payload) ? result.payload : []).map(qualityPlayerReviewToClient);
}

async function getFootballScienceDbQuality() {
  const countRequests = [
    ["total", {}],
    ["women", { gender_segment: "eq.women" }],
    ["men", { gender_segment: "eq.men" }],
    ["mixed", { gender_segment: "eq.mixed" }],
    ["fullNames", { name_quality: "eq.full" }],
    ["initialNames", { name_quality: "eq.initial" }],
    ["unknownNames", { name_quality: "eq.unknown" }],
    ["dedupeReady", { dedupe_key: "not.is.null" }],
    ["sourceLinked", { source_link_count: "gte.1" }],
    ["birthDateKnown", { date_of_birth: "not.is.null" }],
    ["nationalityKnown", { nationality: "not.is.null" }],
    ["positionKnown", { position_group: "not.is.null" }],
    ["rosterLinked", { roster_entry_count: "gte.1" }],
    ["statsLinked", { season_stat_count: "gte.1" }],
    ["metricLinked", { metric_count: "gte.1" }],
    ["spiderMetricDepth", { metric_count: "gte.4" }],
  ];
  const [countPairs, weakIdentity, initialNames] = await Promise.all([
    Promise.all(countRequests.map(async ([key, filters]) => [key, await countFsdbPlayers(filters)])),
    fetchQualityReviewQueue({ dedupe_key: "is.null" }),
    fetchQualityReviewQueue({ name_quality: "eq.initial" }),
  ]);
  return buildFootballScienceDbQualitySummary(Object.fromEntries(countPairs), { weakIdentity, initialNames });
}

function addPlayerSearchFilters(params, query = {}) {
  params.set("active_status", "neq.archived");
  const textQuery = safeIlike(query.query || query.q);
  const gender = normalizeGenderSegment(query.gender || query.genderSegment || query.segment);
  const positionGroup = normalizePositionGroup(query.positionGroup || query.position);
  const nationality = normalizeText(query.nationality, 120);
  const country = normalizeText(query.country || query.currentCountry, 120);
  const team = normalizeText(query.team || query.currentTeam, 180);
  const competition = normalizeText(query.competition || query.league || query.currentCompetition, 180);
  const status = normalizeActiveStatus(query.status || query.activeStatus);
  const minBirthYear = normalizeNumber(query.minBirthYear, null);
  const maxBirthYear = normalizeNumber(query.maxBirthYear, null);

  if (textQuery) {
    params.set("search_text", `ilike.*${textQuery}*`);
  }
  if (gender && gender !== "all") {
    params.set("gender_segment", `eq.${gender}`);
  }
  if (positionGroup && positionGroup !== "ALL") {
    params.set("position_group", `eq.${positionGroup}`);
  }
  if (nationality && nationality !== "all") {
    params.set("nationality", `ilike.*${safeIlike(nationality)}*`);
  }
  if (country && country !== "all") {
    params.set("current_country", `ilike.*${safeIlike(country)}*`);
  }
  if (team && team !== "all") {
    params.set("current_team_name", `ilike.*${safeIlike(team)}*`);
  }
  if (competition && competition !== "all") {
    params.set("current_competition_name", `ilike.*${safeIlike(competition)}*`);
  }
  if (status && status !== "all") {
    params.set("active_status", `eq.${status}`);
  }
  if (Number.isFinite(minBirthYear)) {
    params.set("birth_year", `gte.${Math.round(minBirthYear)}`);
  }
  if (Number.isFinite(maxBirthYear)) {
    params.append("birth_year", `lte.${Math.round(maxBirthYear)}`);
  }
}

function buildPlayerSearchParams(query = {}) {
  const limit = asLimit(query.limit);
  const cursor = decodePlayerCursor(query.cursor);
  const params = new URLSearchParams({
    select:
      "id,fsdb_id,canonical_name,full_name,sort_name,display_name,date_of_birth,birth_year,gender_segment,nationality,birth_country,primary_position,position_group,position_detail,preferred_foot,height_cm,weight_kg,current_team_name,current_competition_name,current_country,source_priority,source_confidence,source_link_count,roster_entry_count,season_stat_count,metric_count,name_quality,dedupe_key,identity_status,active_status,last_seen_at,updated_at,metadata",
    order: "id.asc",
    limit: String(limit + 1),
  });
  addPlayerSearchFilters(params, query);
  if (cursor?.id) {
    params.set("id", `gt.${cursor.id}`);
  }
  return { params, limit };
}

function getPlayerDataReadiness(row = {}) {
  const hasIdentity = Boolean(normalizeText(row.fsdb_id, 80) && normalizeText(row.canonical_name || row.full_name || row.display_name, 240));
  const hasDate = Boolean(normalizeText(row.date_of_birth, 40) || Number.isFinite(Number(row.birth_year)));
  const hasCountry = Boolean(normalizeText(row.nationality || row.birth_country, 120));
  const hasPosition = Boolean(normalizeText(row.primary_position || row.position_group, 120));
  const sourceLinks = Math.max(0, Math.floor(normalizeNumber(row.source_link_count, 0)));
  const rosterEntries = Math.max(0, Math.floor(normalizeNumber(row.roster_entry_count, 0)));
  const seasonStats = Math.max(0, Math.floor(normalizeNumber(row.season_stat_count, 0)));
  const metrics = Math.max(0, Math.floor(normalizeNumber(row.metric_count, 0)));
  const profileReady = hasIdentity && hasDate && hasCountry && hasPosition;
  const rosterReady = profileReady && (rosterEntries > 0 || Boolean(normalizeText(row.current_team_name, 180)));
  const statsReady = rosterReady && (seasonStats > 0 || metrics > 0);
  const spiderReady = statsReady && metrics >= 4;
  const missing = [];
  if (!hasDate) missing.push("date_of_birth");
  if (!hasCountry) missing.push("nationality");
  if (!hasPosition) missing.push("position");
  if (!rosterReady) missing.push("roster");
  if (!statsReady) missing.push("season_stats");
  if (!spiderReady) missing.push("spider_metrics");
  return {
    tier: spiderReady ? "spider_ready" : statsReady ? "stats_ready" : rosterReady ? "roster_ready" : profileReady ? "profile_ready" : "identity_only",
    label: spiderReady ? "Spider ready" : statsReady ? "Stats ready" : rosterReady ? "Roster ready" : profileReady ? "Profile ready" : "Identity only",
    identityReady: hasIdentity,
    profileReady,
    rosterReady,
    statsReady,
    spiderReady,
    sourceLinks,
    rosterEntries,
    seasonStats,
    metrics,
    missing,
  };
}

function playerToClient(row = {}) {
  const dataReadiness = getPlayerDataReadiness(row);
  return {
    id: normalizeText(row.id, 80),
    fsdbId: normalizeText(row.fsdb_id, 80),
    name: normalizeText(row.canonical_name, 180),
    fullName: normalizeText(row.full_name, 240),
    sortName: normalizeText(row.sort_name, 180),
    displayName: normalizeText(row.display_name, 180),
    dateOfBirth: normalizeText(row.date_of_birth, 40),
    birthYear: Number.isFinite(Number(row.birth_year)) ? Number(row.birth_year) : null,
    genderSegment: normalizeGenderSegment(row.gender_segment) || "unknown",
    nationality: normalizeText(row.nationality, 120),
    birthCountry: normalizeText(row.birth_country, 120),
    primaryPosition: normalizeText(row.primary_position, 80),
    positionGroup: normalizePositionGroup(row.position_group),
    positionDetail: normalizeText(row.position_detail, 160),
    preferredFoot: normalizeText(row.preferred_foot, 20),
    heightCm: normalizeNumber(row.height_cm, null),
    weightKg: normalizeNumber(row.weight_kg, null),
    currentTeam: normalizeText(row.current_team_name, 180),
    currentCompetition: normalizeText(row.current_competition_name, 180),
    currentCountry: normalizeText(row.current_country, 120),
    sourcePriority: normalizeText(row.source_priority, 80),
    sourceConfidence: normalizeNumber(row.source_confidence, 0),
    sourceLinkCount: normalizeNumber(row.source_link_count, 0),
    rosterEntryCount: normalizeNumber(row.roster_entry_count, 0),
    seasonStatCount: normalizeNumber(row.season_stat_count, 0),
    metricCount: normalizeNumber(row.metric_count, 0),
    nameQuality: normalizeText(row.name_quality, 40) || getPlayerNameQuality(row.canonical_name || row.full_name),
    dedupeKeyPresent: Boolean(normalizeText(row.dedupe_key, 260)),
    dataReadiness,
    identityStatus: normalizeText(row.identity_status, 40) || "unverified",
    activeStatus: normalizeText(row.active_status, 40) || "unknown",
    lastSeenAt: normalizeText(row.last_seen_at, 40),
    updatedAt: normalizeText(row.updated_at, 40),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

function aliasToClient(row = {}) {
  return {
    id: normalizeText(row.id, 80),
    alias: normalizeText(row.alias, 240),
    aliasType: normalizeText(row.alias_type, 40),
    sourceSystem: normalizeText(row.source_system, 60),
    locale: normalizeText(row.locale, 20),
    confidence: normalizeNumber(row.confidence, 0),
    status: normalizeText(row.status, 40),
  };
}

function sourceLinkToClient(row = {}) {
  return {
    id: normalizeText(row.id, 80),
    sourceSystem: normalizeText(row.source_system, 60),
    sourceEntityId: normalizeText(row.source_entity_id, 180),
    sourceUrl: normalizeText(row.source_url, 600),
    sourceSlug: normalizeText(row.source_slug, 240),
    confidence: normalizeNumber(row.confidence, 0),
    verifiedStatus: normalizeText(row.verified_status, 40),
    importedAt: normalizeText(row.imported_at, 40),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

function rosterEntryToClient(row = {}) {
  return {
    id: normalizeText(row.id, 80),
    season: normalizeText(row.season_label, 80),
    genderSegment: normalizeGenderSegment(row.gender_segment) || "unknown",
    team: normalizeText(row.team_name, 180),
    competition: normalizeText(row.competition_name, 180),
    country: normalizeText(row.country, 120),
    shirtNumber: normalizeText(row.shirt_number, 20),
    position: normalizeText(row.position_text, 160),
    positionGroup: normalizePositionGroup(row.position_group),
    rosterStatus: normalizeText(row.roster_status, 40),
    sourceSystem: normalizeText(row.source_system, 60),
    sourceRecordId: normalizeText(row.source_record_id, 180),
    sourceConfidence: normalizeNumber(row.source_confidence, 0),
    updatedAt: normalizeText(row.updated_at, 40),
  };
}

function seasonStatsToClient(row = {}) {
  return {
    id: normalizeText(row.id, 80),
    season: normalizeText(row.season_label, 80),
    genderSegment: normalizeGenderSegment(row.gender_segment) || "unknown",
    team: normalizeText(row.team_name, 180),
    competition: normalizeText(row.competition_name, 180),
    position: normalizeText(row.position_text, 160),
    matches: normalizeNumber(row.matches, null),
    starts: normalizeNumber(row.starts, null),
    minutes: normalizeNumber(row.minutes, 0),
    metrics: row.metrics && typeof row.metrics === "object" ? row.metrics : {},
    metricQuality: row.metric_quality && typeof row.metric_quality === "object" ? row.metric_quality : {},
    metricCount: normalizeNumber(row.metric_count, 0),
    sourceSystem: normalizeText(row.source_system, 60),
    sourceRecordId: normalizeText(row.source_record_id, 180),
    sourceConfidence: normalizeNumber(row.source_confidence, 0),
    updatedAt: normalizeText(row.updated_at, 40),
  };
}

async function searchPlayers(query = {}) {
  const { params, limit } = buildPlayerSearchParams(query);
  const includeTotal = ["1", "true", "yes"].includes(normalizeText(query.includeTotal, 20).toLowerCase());
  const result = await dbRequest(`/fsdb_players?${params.toString()}`, { includeCount: includeTotal, countStrategy: "planned" });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  const rows = Array.isArray(result.payload) ? result.payload : [];
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return {
    ok: true,
    schema: FOOTBALL_SCIENCE_DB_SCHEMA,
    source: "api",
    players: pageRows.map(playerToClient),
    page: {
      limit,
      returned: pageRows.length,
      hasMore,
      nextCursor: hasMore ? encodePlayerCursor(pageRows[pageRows.length - 1]) : null,
      total: includeTotal && Number.isFinite(Number(result.count)) ? Number(result.count) : null,
    },
  };
}

async function findPlayerIdBySource(query = {}) {
  const sourceSystem = normalizeSourceSystem(query.sourceSystem || query.source_system);
  const sourceEntityId = normalizeText(query.sourceEntityId || query.sourceId || query.source_entity_id, 180);
  if (!sourceSystem || !sourceEntityId) {
    return "";
  }
  const params = new URLSearchParams({
    select: "player_id",
    source_system: `eq.${sourceSystem}`,
    source_entity_id: `eq.${sourceEntityId}`,
    limit: "1",
  });
  const result = await dbRequest(`/fsdb_player_source_links?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  const row = Array.isArray(result.payload) ? result.payload[0] : null;
  return normalizeText(row?.player_id, 80);
}

async function fetchSinglePlayer(query = {}) {
  const directId = normalizeText(query.id || query.playerId, 80);
  const fsdbId = normalizeText(query.fsdbId || query.fsdb_id, 80);
  const sourcePlayerId = await findPlayerIdBySource(query);
  const params = new URLSearchParams({
    select:
      "id,fsdb_id,canonical_name,full_name,sort_name,display_name,date_of_birth,birth_year,gender_segment,nationality,birth_country,primary_position,position_group,position_detail,preferred_foot,height_cm,weight_kg,current_team_name,current_competition_name,current_country,source_priority,source_confidence,source_link_count,roster_entry_count,season_stat_count,metric_count,name_quality,dedupe_key,identity_status,active_status,last_seen_at,updated_at,metadata",
    limit: "1",
  });
  if (/^[0-9a-f-]{36}$/i.test(directId || sourcePlayerId)) {
    params.set("id", `eq.${directId || sourcePlayerId}`);
  } else if (fsdbId) {
    params.set("fsdb_id", `eq.${fsdbId}`);
  } else {
    return null;
  }
  const result = await dbRequest(`/fsdb_players?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload[0] : null;
}

async function fetchPlayersByDedupeKey(dedupeKey = "") {
  const key = normalizeText(dedupeKey, 260);
  if (!key) {
    return [];
  }
  const params = new URLSearchParams({
    select:
      "id,fsdb_id,canonical_name,full_name,sort_name,display_name,date_of_birth,birth_year,gender_segment,nationality,birth_country,primary_position,position_group,position_detail,preferred_foot,height_cm,weight_kg,current_team_name,current_competition_name,current_country,source_priority,source_confidence,source_link_count,roster_entry_count,season_stat_count,metric_count,name_quality,dedupe_key,identity_status,active_status,last_seen_at,updated_at,metadata",
    dedupe_key: `eq.${key}`,
    limit: "3",
  });
  const result = await dbRequest(`/fsdb_players?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload : [];
}

function getLastNameForIdentityProbe(name = "") {
  const tokens = normalizePersonNameForMatch(name).split(/\s+/).filter(Boolean);
  return tokens.length ? tokens[tokens.length - 1] : "";
}

async function probeInitialOnlyPlayer(record = {}) {
  const name = normalizeText(record.player_name || record.canonical_name || record.name, 180);
  const dateOfBirth = normalizeText(record.date_of_birth || record.dateOfBirth, 40);
  const team = normalizeText(record.team_name || record.currentTeam || record.current_team_name, 180);
  const surname = getLastNameForIdentityProbe(name);
  if (!isInitialOnlyName(name) || !surname || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !team) {
    return [];
  }
  const params = new URLSearchParams({
    select:
      "id,fsdb_id,canonical_name,full_name,sort_name,display_name,date_of_birth,birth_year,gender_segment,nationality,birth_country,primary_position,position_group,position_detail,preferred_foot,height_cm,weight_kg,current_team_name,current_competition_name,current_country,source_priority,source_confidence,source_link_count,roster_entry_count,season_stat_count,metric_count,name_quality,dedupe_key,identity_status,active_status,last_seen_at,updated_at,metadata",
    date_of_birth: `eq.${dateOfBirth}`,
    search_text: `ilike.*${safeIlike(surname)}*`,
    current_team_name: `ilike.*${safeIlike(team)}*`,
    active_status: "neq.archived",
    limit: "3",
  });
  const result = await dbRequest(`/fsdb_players?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload : [];
}

async function fetchPlayerProfile(query = {}) {
  const row = await fetchSinglePlayer(query);
  if (!row?.id) {
    return { ok: false, status: 404, reason: "Football Science DB player not found." };
  }
  const playerId = normalizeText(row.id, 80);
  const [aliases, sourceLinks, rosters, stats] = await Promise.all([
    dbRequest(`/fsdb_player_aliases?${new URLSearchParams({
      select: "id,alias,alias_type,source_system,locale,confidence,status",
      player_id: `eq.${playerId}`,
      status: "eq.active",
      order: "confidence.desc,alias.asc",
      limit: "40",
    }).toString()}`),
    dbRequest(`/fsdb_player_source_links?${new URLSearchParams({
      select: "id,source_system,source_entity_id,source_url,source_slug,confidence,verified_status,imported_at,metadata",
      player_id: `eq.${playerId}`,
      order: "confidence.desc,source_system.asc",
      limit: "80",
    }).toString()}`),
    dbRequest(`/fsdb_roster_entries?${new URLSearchParams({
      select: "id,season_label,gender_segment,team_name,competition_name,country,shirt_number,position_text,position_group,roster_status,source_system,source_record_id,source_confidence,updated_at",
      player_id: `eq.${playerId}`,
      deleted_at: "is.null",
      order: "season_label.desc,updated_at.desc",
      limit: "30",
    }).toString()}`),
    dbRequest(`/fsdb_player_season_stats?${new URLSearchParams({
      select: "id,season_label,gender_segment,team_name,competition_name,position_text,matches,starts,minutes,metrics,metric_quality,metric_count,source_system,source_record_id,source_confidence,updated_at",
      player_id: `eq.${playerId}`,
      deleted_at: "is.null",
      order: "season_label.desc,minutes.desc",
      limit: "30",
    }).toString()}`),
  ]);

  for (const result of [aliases, sourceLinks, rosters, stats]) {
    if (!result.ok) {
      throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
    }
  }

  return {
    ok: true,
    schema: FOOTBALL_SCIENCE_DB_SCHEMA,
    player: playerToClient(row),
    aliases: (Array.isArray(aliases.payload) ? aliases.payload : []).map(aliasToClient),
    sourceLinks: (Array.isArray(sourceLinks.payload) ? sourceLinks.payload : []).map(sourceLinkToClient),
    rosters: (Array.isArray(rosters.payload) ? rosters.payload : []).map(rosterEntryToClient),
    stats: (Array.isArray(stats.payload) ? stats.payload : []).map(seasonStatsToClient),
  };
}

function getScoutingRecordMetadata(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata : {};
  const sourceTrace = metadata.sourceTrace || metadata.source_trace;
  return {
    ...metadata,
    sourceTrace: sourceTrace && typeof sourceTrace === "object" && !Array.isArray(sourceTrace) ? sourceTrace : {},
  };
}

function getScoutingSourceCandidates(record = {}) {
  const metadata = getScoutingRecordMetadata(record);
  const trace = metadata.sourceTrace || {};
  const sourceSystem = normalizeSourceSystem(record.source_system || record.sourceSystem || metadata.latestSourceSystem || trace.sourceSystem);
  const directIds = [
    record.source_player_id,
    record.player_identity_key,
    record.source_record_id,
    metadata.playerIdentityId,
    metadata.player_identity_key,
    trace.playerIdentityId,
    trace.sourcePlayerId,
    trace.sourceRecordId,
  ];
  const candidates = [];
  directIds.forEach((value) => {
    const sourceEntityId = normalizeText(value, 180);
    if (sourceSystem && sourceEntityId) {
      candidates.push({ sourceSystem, sourceEntityId });
    }
  });
  const providerKeys = [
    ["wyscout", ["wyscoutId", "wyscout_id"]],
    ["fbref", ["fbrefId", "fbref_id"]],
    ["transfermarkt", ["transfermarktId", "transfermarkt_id"]],
    ["sofascore", ["sofascoreId", "sofascore_id"]],
    ["statsbomb", ["statsbombId", "statsbomb_id"]],
    ["reep", ["reepId", "reep_id"]],
  ];
  providerKeys.forEach(([provider, keys]) => {
    keys.forEach((key) => {
      const sourceEntityId = normalizeText(metadata[key] || trace[key] || record[key], 180);
      if (sourceEntityId) {
        candidates.push({ sourceSystem: provider, sourceEntityId });
      }
    });
  });
  const identityCandidates = Array.isArray(trace.identityCandidates) ? trace.identityCandidates : [];
  identityCandidates.forEach((candidate) => {
    const sourceEntityId = normalizeText(candidate?.value || candidate?.id, 180);
    const candidateSystem = normalizeSourceSystem(candidate?.sourceSystem || candidate?.source || sourceSystem);
    if (candidateSystem && sourceEntityId) {
      candidates.push({ sourceSystem: candidateSystem, sourceEntityId });
    }
  });
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.sourceSystem}:${candidate.sourceEntityId}`;
    if (!candidate.sourceSystem || !candidate.sourceEntityId || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function scoutingRowToFsdbMatchRecord(row = {}) {
  return {
    name: normalizeText(row.player_name || row.canonical_name || row.name, 180),
    canonicalName: normalizeText(row.player_name || row.canonical_name || row.name, 180),
    fullName: normalizeText(row.full_name || row.player_full_name, 240),
    displayName: normalizeText(row.display_name || row.player_name, 180),
    dateOfBirth: normalizeText(row.date_of_birth || row.dateOfBirth, 40),
    birthCountry: normalizeText(row.birth_country || row.birthCountry, 120),
    passportCountry: normalizeText(row.passport_country || row.passportCountry, 120),
    nationality: normalizeText(row.passport_country || row.nationality || row.birth_country, 120),
    genderSegment: normalizeGenderSegment(row.gender_segment || row.genderSegment) || "unknown",
    team_name: normalizeText(row.team_name || row.currentTeam || row.current_team_name, 180),
    sourceSystem: row.source_system || row.sourceSystem,
    sourceEntityId: row.source_player_id || row.player_identity_key || row.source_record_id,
  };
}

async function fetchFootballScienceProfileForScoutingRecord(row = {}) {
  const scoutingName = normalizeText(row.player_name || row.canonical_name || row.name, 180);
  const candidates = getScoutingSourceCandidates(row);
  for (const candidate of candidates) {
    const playerId = await findPlayerIdBySource(candidate);
    if (playerId) {
      const profile = await fetchPlayerProfile({ id: playerId });
      return {
        ok: true,
        linkStatus: "linked",
        matchMethod: "source-link",
        confidence: 100,
        scoutingName,
        initialOnlyScoutingName: isInitialOnlyName(scoutingName),
        profile,
      };
    }
  }

  const matchRecord = scoutingRowToFsdbMatchRecord(row);
  const dedupeKey = buildStrongPlayerDedupeKey(matchRecord);
  if (dedupeKey) {
    const rows = await fetchPlayersByDedupeKey(dedupeKey);
    if (rows.length === 1) {
      const profile = await fetchPlayerProfile({ id: rows[0].id });
      return {
        ok: true,
        linkStatus: "linked",
        matchMethod: "strong-dedupe",
        confidence: 92,
        scoutingName,
        initialOnlyScoutingName: false,
        profile,
      };
    }
    if (rows.length > 1) {
      return {
        ok: true,
        linkStatus: "ambiguous",
        matchMethod: "strong-dedupe",
        confidence: 0,
        scoutingName,
        candidates: rows.map(playerToClient),
      };
    }
  }

  const probedRows = await probeInitialOnlyPlayer({
    ...matchRecord,
    player_name: scoutingName,
    date_of_birth: matchRecord.dateOfBirth,
    team_name: matchRecord.team_name,
  });
  if (probedRows.length === 1) {
    const profile = await fetchPlayerProfile({ id: probedRows[0].id });
    return {
      ok: true,
      linkStatus: "linked",
      matchMethod: "initial-name-team-dob",
      confidence: 78,
      scoutingName,
      initialOnlyScoutingName: true,
      profile,
    };
  }
  if (probedRows.length > 1) {
    return {
      ok: true,
      linkStatus: "ambiguous",
      matchMethod: "initial-name-team-dob",
      confidence: 0,
      scoutingName,
      initialOnlyScoutingName: true,
      candidates: probedRows.map(playerToClient),
    };
  }

  return {
    ok: true,
    linkStatus: "unlinked",
    matchMethod: dedupeKey ? "strong-dedupe" : isInitialOnlyName(scoutingName) ? "initial-name-needs-confirmation" : "identity-incomplete",
    confidence: 0,
    scoutingName,
    initialOnlyScoutingName: isInitialOnlyName(scoutingName),
  };
}

function normalizeFsdbId(value = "", prefix = "fsdb_p") {
  const raw = normalizeText(value, 120);
  if (/^fsdb_[pct][a-z0-9]{8,80}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  const hash = crypto.createHash("sha1").update(raw || `${Date.now()}-${Math.random()}`).digest("hex").slice(0, 16);
  return `${prefix}${hash}`;
}

function normalizePlayerRecord(record = {}) {
  const canonicalName = chooseBestPlayerName(
    record.canonicalName || record.canonical_name || record.name,
    record.fullName || record.full_name,
    record.displayName || record.display_name
  );
  if (!canonicalName) {
    return null;
  }
  const originalCanonicalName = normalizeText(record.canonicalName || record.canonical_name || record.name, 180);
  const dateOfBirth = normalizeDateOfBirth(record.dateOfBirth || record.date_of_birth);
  const explicitBirthYear = normalizeBirthYear(record.birthYear || record.birth_year);
  const dateBirthYear = normalizeBirthYear(dateOfBirth?.slice(0, 4));
  const birthYear = explicitBirthYear ?? dateBirthYear;
  const sourceLinks = Array.isArray(record.sourceLinks || record.source_links) ? record.sourceLinks || record.source_links : [];
  const directSourceSystem = normalizeSourceSystem(record.sourceSystem || record.source_system);
  const directSourceId = normalizeText(record.sourceEntityId || record.sourceId || record.source_entity_id, 180);
  const sourceLinkCount = sourceLinks.length + (directSourceSystem && directSourceId ? 1 : 0) + (record.reepId || record.reep_id ? 1 : 0);
  const dedupeKey = buildStrongPlayerDedupeKey({ ...record, canonicalName, dateOfBirth });
  const fsdbSeed = record.fsdbId || record.fsdb_id || record.footballScienceId || dedupeKey || record.reepId || record.reep_id || canonicalName;
  const fsdbId = normalizeFsdbId(fsdbSeed);
  return {
    fsdb_id: fsdbId,
    canonical_name: canonicalName,
    full_name: normalizeText(record.fullName || record.full_name, 240) || (canonicalName !== originalCanonicalName ? canonicalName : null),
    sort_name: normalizeText(record.sortName || record.sort_name || canonicalName, 180).toLowerCase(),
    display_name: normalizeText(record.displayName || record.display_name || canonicalName, 180),
    dedupe_key: dedupeKey,
    name_quality: getPlayerNameQuality(canonicalName),
    date_of_birth: dateOfBirth,
    birth_year: birthYear,
    gender_segment: normalizeGenderSegment(record.genderSegment || record.gender_segment) || "unknown",
    nationality: normalizeText(record.nationality, 120) || null,
    birth_country: normalizeText(record.birthCountry || record.birth_country, 120) || null,
    passport_countries: Array.isArray(record.passportCountries || record.passport_countries)
      ? (record.passportCountries || record.passport_countries).map((entry) => normalizeText(entry, 120)).filter(Boolean).slice(0, 8)
      : [],
    primary_position: normalizeText(record.primaryPosition || record.primary_position || record.position, 80) || null,
    position_group: normalizePositionGroup(record.positionGroup || record.position_group) || null,
    position_detail: normalizeText(record.positionDetail || record.position_detail, 160) || null,
    preferred_foot: normalizeText(record.preferredFoot || record.preferred_foot, 20) || null,
    height_cm: normalizeNumber(record.heightCm || record.height_cm, null),
    weight_kg: normalizeNumber(record.weightKg || record.weight_kg, null),
    current_team_name: normalizeText(record.currentTeam || record.current_team_name, 180) || null,
    current_competition_name: normalizeText(record.currentCompetition || record.current_competition_name, 180) || null,
    current_country: normalizeText(record.currentCountry || record.current_country, 120) || null,
    source_priority: normalizeSourceSystem(record.sourcePriority || record.source_priority || record.sourceSystem || record.source_system) || null,
    source_confidence: Math.max(0, Math.min(100, normalizeNumber(record.sourceConfidence || record.source_confidence, 0))),
    source_link_count: Math.max(0, Math.round(normalizeNumber(record.sourceLinkCount || record.source_link_count, sourceLinkCount))),
    roster_entry_count: Math.max(0, Math.round(normalizeNumber(record.rosterEntryCount || record.roster_entry_count, 0))),
    season_stat_count: Math.max(0, Math.round(normalizeNumber(record.seasonStatCount || record.season_stat_count, 0))),
    metric_count: Math.max(0, Math.round(normalizeNumber(record.metricCount || record.metric_count, 0))),
    identity_status: normalizeText(record.identityStatus || record.identity_status, 40) || "unverified",
    active_status: normalizeActiveStatus(record.activeStatus || record.active_status) || "unknown",
    metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : {},
  };
}

function normalizeSourceLinkRecords(records = [], insertedPlayers = []) {
  const playerIdByFsdbId = new Map(insertedPlayers.map((player) => [normalizeText(player.fsdb_id, 120), normalizeText(player.id, 80)]));
  const rows = [];
  records.forEach((record) => {
    const normalizedPlayer = normalizePlayerRecord(record);
    const fsdbId = normalizedPlayer?.fsdb_id || normalizeFsdbId(record.fsdbId || record.fsdb_id || record.footballScienceId || record.reepId || record.reep_id || record.name);
    const playerId = playerIdByFsdbId.get(fsdbId);
    if (!playerId) return;
    const sourceLinks = Array.isArray(record.sourceLinks || record.source_links) ? record.sourceLinks || record.source_links : [];
    const directSourceSystem = normalizeSourceSystem(record.sourceSystem || record.source_system);
    const directSourceId = normalizeText(record.sourceEntityId || record.sourceId || record.source_entity_id, 180);
    const allLinks = [...sourceLinks];
    if (directSourceSystem && directSourceId) {
      allLinks.push({ sourceSystem: directSourceSystem, sourceEntityId: directSourceId, confidence: record.sourceConfidence });
    }
    if (record.reepId || record.reep_id) {
      allLinks.push({ sourceSystem: "reep", sourceEntityId: record.reepId || record.reep_id, confidence: 100, verifiedStatus: "linked" });
    }
    allLinks.forEach((link) => {
      const sourceSystem = normalizeSourceSystem(link.sourceSystem || link.source_system);
      const sourceEntityId = normalizeText(link.sourceEntityId || link.sourceId || link.source_entity_id, 180);
      if (!sourceSystem || !sourceEntityId) return;
      rows.push({
        player_id: playerId,
        source_system: sourceSystem,
        source_entity_id: sourceEntityId,
        source_url: normalizeText(link.sourceUrl || link.source_url, 600) || null,
        source_slug: normalizeText(link.sourceSlug || link.source_slug, 240) || null,
        confidence: Math.max(0, Math.min(100, normalizeNumber(link.confidence, 0))),
        verified_status: normalizeText(link.verifiedStatus || link.verified_status, 40) || "unverified",
        metadata: link.metadata && typeof link.metadata === "object" ? link.metadata : {},
      });
    });
  });
  return rows;
}

async function upsertPlayersChunk(body = {}, actor = {}) {
  if (!canWriteFootballScienceDb(actor)) {
    return { ok: false, status: 403, reason: "Football Science DB imports require database write access." };
  }
  const records = Array.isArray(body.records) ? body.records.slice(0, MAX_IMPORT_RECORDS) : [];
  const playerRows = records.map(normalizePlayerRecord).filter(Boolean);
  if (!playerRows.length) {
    return { ok: false, status: 400, reason: "Import chunk does not contain valid player rows." };
  }
  const playersResult = await dbRequest("/fsdb_players?on_conflict=fsdb_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: playerRows,
  });
  if (!playersResult.ok) {
    return playersResult;
  }
  const insertedPlayers = Array.isArray(playersResult.payload) ? playersResult.payload : [];
  const sourceRows = normalizeSourceLinkRecords(records, insertedPlayers);
  let sourceLinkCount = 0;
  if (sourceRows.length) {
    const sourceResult = await dbRequest("/fsdb_player_source_links?on_conflict=source_system,source_entity_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: sourceRows,
    });
    if (!sourceResult.ok) {
      return sourceResult;
    }
    sourceLinkCount = sourceRows.length;
  }
  return {
    ok: true,
    schema: FOOTBALL_SCIENCE_DB_SCHEMA,
    imported: insertedPlayers.length,
    sourceLinkCount,
    limit: MAX_IMPORT_RECORDS,
  };
}

async function recordImportBatch(body = {}, actor = {}) {
  if (!canWriteFootballScienceDb(actor)) {
    return { ok: false, status: 403, reason: "Football Science DB imports require database write access." };
  }
  const sourceSystem = normalizeSourceSystem(body.sourceSystem || body.source_system);
  if (!sourceSystem) {
    return { ok: false, status: 400, reason: "Missing source system." };
  }
  const row = {
    source_system: sourceSystem,
    source_label: normalizeText(body.sourceLabel || body.source_label || sourceSystem, 160),
    source_url: normalizeText(body.sourceUrl || body.source_url, 600) || null,
    source_file_name: normalizeText(body.sourceFileName || body.source_file_name, 240) || null,
    source_license: normalizeText(body.sourceLicense || body.source_license, 120) || null,
    source_version: normalizeText(body.sourceVersion || body.source_version, 120) || null,
    entity_scope: normalizeText(body.entityScope || body.entity_scope || "players", 40) || "players",
    status: normalizeText(body.status || "running", 40) || "running",
    imported_by: /^[0-9a-f-]{36}$/i.test(String(actor.id || "")) ? actor.id : null,
    started_at: new Date().toISOString(),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };
  const result = await dbRequest("/fsdb_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  if (!result.ok) {
    return result;
  }
  const inserted = Array.isArray(result.payload) ? result.payload[0] : null;
  return {
    ok: true,
    schema: FOOTBALL_SCIENCE_DB_SCHEMA,
    importBatchId: normalizeText(inserted?.id, 80),
    batch: inserted || null,
  };
}

async function handleFootballScienceDbRequest(req, res, actor = {}) {
  if (!canReadFootballScienceDb(actor)) {
    return sendJson(res, 403, { ok: false, reason: "You do not have access to Football Science DB." });
  }

  if (req.method === "GET") {
    const url = new URL(req.url || "/api/football-science-db", "https://footballscience.local");
    const action = normalizeText(url.searchParams.get("action") || "players", 40);
    const query = Object.fromEntries(url.searchParams.entries());
    if (action === "status") {
      return sendJson(res, 200, footballScienceDbStatus(actor));
    }
    if (action === "quality" || action === "health") {
      const result = await getFootballScienceDbQuality();
      return sendJson(res, 200, result);
    }
    if (action === "player" || action === "profile") {
      const result = await fetchPlayerProfile(query);
      return sendJson(res, result.ok ? 200 : result.status || 404, result);
    }
    if (["players", "search", "database"].includes(action)) {
      return sendJson(res, 200, await searchPlayers(query));
    }
    return sendJson(res, 400, { ok: false, reason: "Unknown Football Science DB action." });
  }

  if (req.method === "POST") {
    const body = await parseJsonBody(req);
    const action = normalizeText(body.action || "upsertPlayersChunk", 80);
    const result =
      action === "recordImportBatch" || action === "startImport"
        ? await recordImportBatch(body, actor)
        : action === "upsertPlayersChunk"
          ? await upsertPlayersChunk(body, actor)
          : { ok: false, status: 400, reason: "Unknown Football Science DB write action." };
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }

  return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
}

module.exports = {
  FOOTBALL_SCIENCE_DB_SCHEMA,
  MAX_LIMIT,
  addPlayerSearchFilters,
  asLimit,
  buildPlayerSearchParams,
  buildStrongPlayerDedupeKey,
  buildFootballScienceDbQualitySummary,
  canReadFootballScienceDb,
  canWriteFootballScienceDb,
  chooseBestPlayerName,
  decodePlayerCursor,
  encodePlayerCursor,
  fetchFootballScienceProfileForScoutingRecord,
  fetchPlayerProfile,
  footballScienceDbStatus,
  getFootballScienceDbQuality,
  getPlayerDataReadiness,
  getPlayerNameQuality,
  handleFootballScienceDbRequest,
  isInitialOnlyName,
  normalizePlayerRecord,
  normalizePersonNameForMatch,
  normalizeSourceSystem,
  playerToClient,
};
