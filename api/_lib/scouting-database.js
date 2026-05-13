const crypto = require("crypto");
const { parseJsonBody, readConfig, sendJson } = require("./supabase-admin.js");
const { appendAuditLog } = require("./audit-log.js");

const SCOUTING_DATABASE_SCHEMA = "footballscience-scouting-database-v1";
const SCOUTING_WRITE_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst"]);
const SCOUTING_DATABASE_MODE_VALUES = new Set(["database", "db", "postgres", "supabase", "dual-write", "dualwrite", "shadow"]);
const SCOUTING_LEGACY_MODE_VALUES = new Set(["legacy", "storage", "app-state", "appstate", "local", "off", "false", "0"]);
const MAX_TEXT_LENGTH = 240;
const MAX_ID_LENGTH = 180;
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;
const MAX_IMPORT_CHUNK_RECORDS = 80;
const SCOUTING_RECORD_INDEX = Object.freeze({
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
  sourceSystem: 15,
  playerSourceId: 16,
  sourceRecordId: 17,
  imageUrl: 18,
  playerIdentityId: 19,
  sourceTrace: 20,
  metricQuality: 21,
  dateOfBirth: 22,
});

const SCOUTING_OPTIONS_CACHE_MS = 5 * 60 * 1000;
const SCOUTING_IMPORT_HISTORY_LIMIT = 20;
let scoutingFilterOptionsCache = { updatedAt: 0, options: null };

function normalizeString(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeScoutingLeague(value = "") {
  const normalized = normalizeString(value, 180);
  if (!normalized) {
    return "";
  }
  const fixedCountry = normalized.replace(/^scottland\b/i, "Scotland");
  if (/^Scotland\s+SWPL\b/i.test(fixedCountry)) {
    return "Scotland SWPL";
  }
  return fixedCountry;
}

function normalizeNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeMetricKey(value, fallback = "metric") {
  return normalizeString(value || fallback, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || fallback;
}

function normalizeSortName(value) {
  return normalizeString(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeIdentityPart(value, maxLength = 180) {
  return normalizeString(value, maxLength)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDateValue(value = "") {
  const raw = normalizeString(value, 40);
  if (!raw) {
    return "";
  }
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }
  const european = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (european) {
    return `${european[3]}-${String(european[2]).padStart(2, "0")}-${String(european[1]).padStart(2, "0")}`;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString().slice(0, 10);
}

function normalizeMetricQuality(value = "") {
  const normalized = normalizeString(value, 20).toLowerCase();
  return normalized === "trusted" || normalized === "estimated" || normalized === "missing" ? normalized : "trusted";
}

function recordValue(record = [], key) {
  return Array.isArray(record) ? record[SCOUTING_RECORD_INDEX[key]] : record?.[key];
}

function getClientRecordId(record = {}) {
  return normalizeString(recordValue(record, "id"), MAX_ID_LENGTH);
}

function getClientRecordName(record = {}) {
  return normalizeString(recordValue(record, "player"), 180);
}

function getClientRecordPositionGroup(record = {}) {
  const position = normalizeString(recordValue(record, "position"), 120).toUpperCase();
  const tokens = position.split(/[^A-Z0-9]+/).filter(Boolean);
  if (tokens.some((token) => token.includes("GK"))) return "GK";
  if (tokens.some((token) => ["CB", "RCB", "LCB"].includes(token))) return "CB";
  if (tokens.some((token) => ["RB", "LB", "RWB", "LWB", "WB"].includes(token))) return "FB";
  if (tokens.some((token) => ["DMF", "CMF", "RCMF", "LCMF", "AMF", "MF"].includes(token))) return "MID";
  if (tokens.some((token) => ["RW", "LW", "RWF", "LWF", "WF", "W"].includes(token))) return "WING";
  if (tokens.some((token) => ["CF", "ST", "FW"].includes(token))) return "CF";
  return tokens[0] || "OTHER";
}

function actorRole(actor = {}) {
  return normalizeString(actor.role || "unknown", 40).toLowerCase();
}

function canWriteScoutingDatabase(actor = {}) {
  return SCOUTING_WRITE_ROLES.has(actorRole(actor));
}

function isScoutingDatabaseEnabled() {
  const mode = normalizeString(
    process.env.SCOUTING_STORAGE_MODE || process.env.SCOUTING_DATABASE_MODE || process.env.SCOUTING_DUAL_WRITE_MODE,
    80
  ).toLowerCase();
  if (!mode) {
    return false;
  }
  if (SCOUTING_LEGACY_MODE_VALUES.has(mode)) {
    return false;
  }
  if (SCOUTING_DATABASE_MODE_VALUES.has(mode)) {
    return true;
  }
  return true;
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

async function dbRequest(path, options = {}) {
  const base = restBaseUrl();
  if (!base) {
    return { ok: false, status: 500, reason: "Missing Supabase database configuration." };
  }
  const response = await fetch(`${base.url}${path}`, {
    method: options.method || "GET",
    headers: restHeaders(base.serviceRoleKey, options.headers || {}),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
      reason: payload?.message || payload?.hint || payload?.details || `Database request failed (${response.status}).`,
    };
  }
  return { ok: true, status: response.status, payload };
}

function asLimit(value, fallback = DEFAULT_LIMIT) {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(limit, MAX_LIMIT);
}

function asOffset(value) {
  const offset = Math.floor(Number(value));
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

function asHistoryLimit(value) {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) {
    return SCOUTING_IMPORT_HISTORY_LIMIT;
  }
  return Math.min(limit, 100);
}

function safeIlike(value) {
  return normalizeString(value, 120).toLowerCase().replace(/[*,()]/g, " ").replace(/\s+/g, "%");
}

function metricToClient(row = {}) {
  return {
    id: normalizeString(row.metric_key, 120),
    label: normalizeString(row.label, 160),
    direction: normalizeString(row.direction, 20) === "lower" ? "lower" : "higher",
    unit: normalizeString(row.unit, 40),
    category: normalizeString(row.category, 80),
  };
}

function seasonRowToClientRecord(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  return [
    normalizeString(row.record_key || row.id, MAX_ID_LENGTH),
    normalizeString(row.player_name, 180),
    normalizeString(row.team_name, 180),
    normalizeString(row.team_within_timeframe || row.team_name, 180),
    normalizeScoutingLeague(row.league_name),
    normalizeString(row.season_label, 80),
    normalizeString(row.position_text, 120),
    normalizeNumber(row.age, ""),
    normalizeNumber(row.matches, ""),
    normalizeNumber(row.minutes, 0),
    normalizeString(row.birth_country, 120),
    normalizeString(row.passport_country, 120),
    normalizeString(row.height_cm, 40),
    normalizeString(row.weight_kg, 40),
    row.metrics && typeof row.metrics === "object" && !Array.isArray(row.metrics) ? row.metrics : {},
    normalizeString(row.source_system, 40) || null,
    normalizeString(row.source_player_id, 160) || null,
    normalizeString(row.source_record_id, 160) || null,
    normalizeString(metadata.imageUrl || metadata.image_url, 220) || null,
    normalizeString(row.player_identity_key || metadata.playerIdentityId || metadata.player_identity_key || row.source_player_id, 160) || null,
    metadata.sourceTrace || metadata.source_trace || {},
    metadata.metricQuality || metadata.metric_quality || {},
    normalizeDateValue(row.date_of_birth || metadata.dateOfBirth || metadata.date_of_birth),
  ];
}

function importBatchToClient(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  return {
    id: normalizeString(row.id, 80),
    status: normalizeString(row.status, 40),
    sourceLabel: normalizeString(row.source_label, 120),
    sourceFileName: normalizeString(row.source_file_name, 240),
    sheetName: normalizeString(row.sheet_name, 160),
    seasonLabel: normalizeString(row.season_label, 80),
    rowCount: normalizeNumber(row.row_count, 0),
    metricCount: normalizeNumber(row.metric_count, 0),
    dataHash: normalizeString(row.data_hash, 120),
    createdAt: normalizeString(row.created_at, 80),
    updatedAt: normalizeString(row.updated_at, 80),
    publishedAt: normalizeString(row.published_at, 80),
    metadata,
  };
}

function importChangeToClient(row = {}) {
  return {
    id: normalizeString(row.id, 80),
    importBatchId: normalizeString(row.import_batch_id, 80),
    seasonRecordId: normalizeString(row.season_record_id, 80),
    changeType: normalizeString(row.change_type, 80),
    beforeValue: row.before_value && typeof row.before_value === "object" && !Array.isArray(row.before_value) ? row.before_value : {},
    afterValue: row.after_value && typeof row.after_value === "object" && !Array.isArray(row.after_value) ? row.after_value : {},
    createdAt: normalizeString(row.created_at, 80),
  };
}

function playerRowToClient(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  return {
    id: normalizeString(row.id, 80),
    playerIdentityId: normalizeString(row.player_identity_key || row.source_player_id, 160),
    canonicalName: normalizeString(row.canonical_name, 180),
    sortName: normalizeString(row.sort_name, 180),
    sourceSystem: normalizeString(row.source_system, 40),
    sourcePlayerId: normalizeString(row.source_player_id, 160),
    birthCountry: normalizeString(row.birth_country, 120),
    passportCountry: normalizeString(row.passport_country, 120),
    dateOfBirth: normalizeDateValue(row.date_of_birth),
    height: normalizeNumber(row.height_cm, null),
    weight: normalizeNumber(row.weight_kg, null),
    status: normalizeString(row.status, 40),
    aliases: Array.isArray(metadata.aliases) ? metadata.aliases.map((value) => normalizeString(value, 180)).filter(Boolean) : [],
    metadata,
  };
}

function normalizeScoutingSourceSystem(record = {}) {
  return normalizeString(recordValue(record, "sourceSystem"), 40) || normalizeString(recordValue(record, "source_system"), 40) || "file-import";
}

function normalizeScoutingSourcePlayerId(record = {}) {
  const explicit =
    normalizeString(recordValue(record, "playerIdentityId"), 160) ||
    normalizeString(recordValue(record, "sourcePlayerId"), 160) ||
    normalizeString(recordValue(record, "playerSourceId"), 160) ||
    normalizeString(recordValue(record, "source_player_id"), 160);
  if (explicit) {
    return explicit;
  }
  const player = getClientRecordName(record);
  const dateOfBirth = normalizeDateValue(recordValue(record, "dateOfBirth"));
  const birthCountry = normalizeString(recordValue(record, "birthCountry"), 120);
  const passportCountry = normalizeString(recordValue(record, "passportCountry"), 120);
  const fallbackSeed = [
    normalizeIdentityPart(player),
    normalizeIdentityPart(dateOfBirth),
    normalizeIdentityPart(passportCountry || birthCountry),
  ].filter(Boolean).join(" | ");
  if (fallbackSeed) {
    const hash = crypto.createHash("sha256").update(fallbackSeed.toLowerCase()).digest("hex").slice(0, 48);
    return normalizeString(`player-${hash}`, 160);
  }
  return "player-unknown";
}

function normalizeScoutingSourceScopedId(value = "", sourceSystem = "file-import") {
  const normalized = normalizeString(value, MAX_ID_LENGTH);
  if (!normalized) {
    return "";
  }
  const scope = normalizeString(sourceSystem, 40) || "file-import";
  return normalized.includes("::") ? normalized : normalizeString(`${scope}::${normalized}`, MAX_ID_LENGTH);
}

function normalizeScoutingRecordSourceId(record = {}) {
  const sourceSystem = normalizeScoutingSourceSystem(record);
  const sourceRecordId =
    normalizeString(recordValue(record, "sourceRecordId"), 160) ||
    normalizeString(recordValue(record, "source_record_id"), 160) ||
    normalizeString(recordValue(record, "recordSourceId"), 160);
  const sourcePlayerId = normalizeScoutingSourcePlayerId(record);
  const mergeSeed = [
    sourcePlayerId,
    normalizeString(recordValue(record, "season"), 80),
    normalizeScoutingLeague(recordValue(record, "league")),
    normalizeString(recordValue(record, "team"), 180),
  ].filter(Boolean).join("::");
  return (
    normalizeScoutingSourceScopedId(sourceRecordId, sourceSystem) ||
    normalizeScoutingSourceScopedId(getClientRecordId(record), sourceSystem) ||
    normalizeScoutingSourceScopedId(crypto.createHash("sha1").update(mergeSeed || getClientRecordName(record)).digest("hex"), sourceSystem) ||
    normalizeScoutingSourceScopedId(`record-${Date.now()}`, sourceSystem)
  );
}

function normalizeScoutingPlayerSourceKey(record = {}) {
  const sourceSystem = normalizeScoutingSourceSystem(record);
  const sourcePlayerId = normalizeScoutingSourcePlayerId(record);
  return `${sourceSystem}::${sourcePlayerId}`;
}

function getRecordSourceTrace(record = {}) {
  const trace = recordValue(record, "sourceTrace");
  return trace && typeof trace === "object" && !Array.isArray(trace) ? trace : {};
}

function getRecordMetricQualityMap(record = {}) {
  const quality = recordValue(record, "metricQuality");
  return quality && typeof quality === "object" && !Array.isArray(quality) ? quality : {};
}

function normalizeMetricPayload(metrics = {}, qualityMap = {}) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metrics).map(([metricKey, entry]) => {
      const value = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.value : entry;
      const quality = entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizeMetricQuality(entry.quality)
        : normalizeMetricQuality(qualityMap[metricKey]);
      if (!Number.isFinite(Number(value))) {
        return [metricKey, { value: null, quality: "missing" }];
      }
      return [metricKey, { value: Number(value), quality }];
    })
  );
}

function getMetricQualitySummary(metrics = {}) {
  return Object.values(metrics || {}).reduce(
    (summary, entry) => {
      const quality = entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizeMetricQuality(entry.quality)
        : "trusted";
      summary[quality] = (summary[quality] || 0) + 1;
      return summary;
    },
    { trusted: 0, estimated: 0, missing: 0 }
  );
}

function scoutingDatabaseStatus(actor = {}) {
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: isScoutingDatabaseEnabled() ? "database" : "legacy",
    enabled: isScoutingDatabaseEnabled(),
    canWrite: canWriteScoutingDatabase(actor),
    tables: {
      imports: "scouting_import_batches",
      metrics: "scouting_metrics",
      players: "scouting_players",
      seasons: "scouting_player_seasons",
      percentiles: "scouting_metric_percentiles",
      roleScores: "scouting_role_profile_scores",
      lists: "scouting_lists",
      shadow: "scouting_shadow_entries",
      reports: "scouting_reports",
    },
  };
}

async function fetchMetrics() {
  const params = new URLSearchParams({
    select: "metric_key,label,direction,unit,category,display_order,status",
    status: "eq.active",
    order: "display_order.asc,label.asc",
    limit: "1000",
  });
  const result = await dbRequest(`/scouting_metrics?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload.map(metricToClient).filter((metric) => metric.id && metric.label) : [];
}

function addSeasonFilters(params, query = {}) {
  params.set("status", "eq.active");
  params.set("deleted_at", "is.null");
  const league = normalizeScoutingLeague(query.league);
  const season = normalizeString(query.season, 80);
  const position = normalizeString(query.position, 80).toUpperCase();
  const minMinutes = normalizeNumber(query.minMinutes, null);
  const maxAge = normalizeNumber(query.maxAge, null);
  const textQuery = safeIlike(query.query);
  if (league && league !== "all") {
    if (/^Scotland SWPL$/i.test(league)) {
      params.set("league_name", "ilike.*Scotland SWPL*");
    } else {
      params.set("league_name", `eq.${league}`);
    }
  }
  if (season && season !== "all") {
    params.set("season_label", `eq.${season}`);
  }
  if (position && position !== "ALL") {
    params.set("position_text", `ilike.*${position}*`);
  }
  if (Number.isFinite(minMinutes) && minMinutes > 0) {
    params.set("minutes", `gte.${Math.round(minMinutes)}`);
  }
  if (Number.isFinite(maxAge) && maxAge > 0) {
    params.set("age", `lte.${maxAge}`);
  }
  if (textQuery) {
    params.set("search_text", `ilike.*${textQuery}*`);
  }
}

function getSeasonOrder(query = {}) {
  const sortMetricId = normalizeString(query.sortMetricId || query.sort, 120);
  if (sortMetricId === "age") {
    return "age.asc.nullslast,minutes.desc";
  }
  if (sortMetricId === "matches") {
    return "matches.desc.nullslast,minutes.desc";
  }
  return "minutes.desc,player_name.asc";
}

async function fetchSeasonRows(query = {}) {
  const params = new URLSearchParams({
    select:
      "id,record_key,import_batch_id,player_id,player_name,team_name,team_within_timeframe,league_name,season_label,position_text,age,matches,minutes,birth_country,passport_country,height_cm,weight_kg,date_of_birth,metrics,source_system,source_player_id,source_record_id,player_identity_key,metadata,updated_at",
    order: getSeasonOrder(query),
    limit: String(asLimit(query.limit)),
    offset: String(asOffset(query.offset)),
  });
  addSeasonFilters(params, query);
  const result = await dbRequest(`/scouting_player_seasons?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload : [];
}

function buildOptionsFromRows(rows = []) {
  const leagues = new Set();
  const seasons = new Set();
  const positions = new Set();
  rows.forEach((row) => {
    const league = normalizeScoutingLeague(row.league_name);
    const season = normalizeString(row.season_label, 80);
    const position = normalizeString(row.position_text, 120).toUpperCase();
    if (league) leagues.add(league);
    if (season) seasons.add(season);
    position.split(/[^A-Z0-9]+/).filter(Boolean).forEach((token) => positions.add(token));
  });
  return {
    leagues: [...leagues].sort((a, b) => a.localeCompare(b)),
    seasons: [...seasons].sort((a, b) => String(b).localeCompare(String(a))),
    positions: [...positions].sort((a, b) => a.localeCompare(b)),
  };
}

async function fetchDatabaseFilterOptions() {
  const now = Date.now();
  if (scoutingFilterOptionsCache.options && now - scoutingFilterOptionsCache.updatedAt < SCOUTING_OPTIONS_CACHE_MS) {
    return scoutingFilterOptionsCache.options;
  }
  const params = new URLSearchParams({
    select: "league_name,season_label,position_text",
    status: "eq.active",
    deleted_at: "is.null",
    order: "league_name.asc,season_label.desc,position_text.asc",
    limit: "10000",
  });
  const result = await dbRequest(`/scouting_player_seasons?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  const options = buildOptionsFromRows(Array.isArray(result.payload) ? result.payload : []);
  scoutingFilterOptionsCache = { updatedAt: now, options };
  return options;
}

async function fetchImportHistory(query = {}) {
  const params = new URLSearchParams({
    select: "id,source_label,source_file_name,sheet_name,season_label,status,row_count,metric_count,data_hash,metadata,created_at,updated_at,published_at",
    order: "created_at.desc",
    limit: String(asHistoryLimit(query.limit)),
  });
  const result = await dbRequest(`/scouting_import_batches?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    imports: (Array.isArray(result.payload) ? result.payload : []).map(importBatchToClient),
  };
}

async function fetchImportChanges(query = {}) {
  const importBatchId = normalizeString(query.importBatchId || query.import_batch_id || query.id, 80);
  if (!importBatchId) {
    return { ok: false, status: 400, reason: "Missing scouting import batch id." };
  }
  const params = new URLSearchParams({
    select: "id,import_batch_id,season_record_id,change_type,before_value,after_value,created_at",
    import_batch_id: `eq.${importBatchId}`,
    order: "created_at.desc",
    limit: String(asHistoryLimit(query.limit)),
  });
  const result = await dbRequest(`/scouting_import_changes?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    importBatchId,
    changes: (Array.isArray(result.payload) ? result.payload : []).map(importChangeToClient),
  };
}

async function fetchDatabaseSnapshot(query = {}) {
  const [metrics, rows, options] = await Promise.all([fetchMetrics(), fetchSeasonRows(query), fetchDatabaseFilterOptions()]);
  const limit = asLimit(query.limit);
  const offset = asOffset(query.offset);
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    source: "api",
    importedAt: new Date().toISOString(),
    metrics,
    records: rows.map(seasonRowToClientRecord),
    options,
    page: {
      limit,
      offset,
      returned: rows.length,
      nextOffset: rows.length === limit ? offset + rows.length : null,
      hasMore: rows.length === limit,
    },
  };
}

async function fetchPlayerRowByIdentity(playerIdentityKey = "") {
  const identityKey = normalizeString(playerIdentityKey, 160);
  if (!identityKey) {
    return null;
  }
  const params = new URLSearchParams({
    select:
      "id,canonical_name,sort_name,player_identity_key,source_system,source_player_id,birth_country,passport_country,height_cm,weight_kg,date_of_birth,status,metadata,updated_at",
    player_identity_key: `eq.${identityKey}`,
    limit: "1",
  });
  const result = await dbRequest(`/scouting_players?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload[0] || null : null;
}

async function fetchPlayerSeasonHistory(row = {}) {
  const playerId = normalizeString(row.player_id, 80);
  const playerIdentityKey = normalizeString(row.player_identity_key, 160);
  const params = new URLSearchParams({
    select:
      "id,record_key,import_batch_id,player_id,player_name,team_name,team_within_timeframe,league_name,season_label,position_text,age,matches,minutes,birth_country,passport_country,height_cm,weight_kg,date_of_birth,metrics,source_system,source_player_id,source_record_id,player_identity_key,metadata,updated_at",
    status: "eq.active",
    deleted_at: "is.null",
    order: "season_label.desc,minutes.desc,updated_at.desc",
    limit: "40",
  });
  if (playerId) {
    params.set("player_id", `eq.${playerId}`);
  } else if (playerIdentityKey) {
    params.set("player_identity_key", `eq.${playerIdentityKey}`);
  } else {
    return [];
  }
  const result = await dbRequest(`/scouting_player_seasons?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload : [];
}

function buildPlayerProfileSummary(row = {}, seasonRows = []) {
  const clientRows = seasonRows.map(seasonRowToClientRecord);
  const clubs = uniqueBy(
    seasonRows
      .map((seasonRow) => ({
        team: normalizeString(seasonRow.team_name, 180),
        league: normalizeScoutingLeague(seasonRow.league_name),
        season: normalizeString(seasonRow.season_label, 80),
      }))
      .filter((entry) => entry.team || entry.league || entry.season),
    (entry) => `${entry.team}|${entry.league}|${entry.season}`
  );
  const importBatchIds = uniqueBy(
    seasonRows
      .map((seasonRow) => normalizeString(seasonRow.import_batch_id || seasonRow.metadata?.sourceTrace?.importBatchId, 80))
      .filter(Boolean),
    (value) => value
  );
  return {
    playerIdentityId: normalizeString(row.player_identity_key, 160),
    seasonCount: clientRows.length,
    totalMinutes: seasonRows.reduce((sum, seasonRow) => sum + Math.max(0, Math.round(normalizeNumber(seasonRow.minutes, 0))), 0),
    clubs,
    importBatchIds,
    quality: getMetricQualitySummary(
      seasonRows.reduce((metrics, seasonRow) => {
        const payload = seasonRow.metrics && typeof seasonRow.metrics === "object" && !Array.isArray(seasonRow.metrics) ? seasonRow.metrics : {};
        Object.assign(metrics, payload);
        return metrics;
      }, {})
    ),
  };
}

async function fetchPlayerProfile(query = {}) {
  const recordKey = normalizeString(query.recordId || query.recordKey || query.id, MAX_ID_LENGTH);
  if (!recordKey) {
    return { ok: false, status: 400, reason: "Missing scouting record id." };
  }
  const params = new URLSearchParams({
    select:
      "id,record_key,import_batch_id,player_id,player_name,team_name,team_within_timeframe,league_name,season_label,position_text,age,matches,minutes,birth_country,passport_country,height_cm,weight_kg,date_of_birth,metrics,source_system,source_player_id,source_record_id,player_identity_key,metadata,updated_at",
    or: `record_key.eq.${recordKey},source_record_id.eq.${recordKey}`,
    limit: "1",
  });
  const result = await dbRequest(`/scouting_player_seasons?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  const row = Array.isArray(result.payload) ? result.payload[0] : null;
  if (!row) {
    return { ok: false, status: 404, reason: "Scouting player was not found." };
  }
  const [playerRow, seasonRows] = await Promise.all([
    fetchPlayerRowByIdentity(row.player_identity_key || row.source_player_id),
    fetchPlayerSeasonHistory(row),
  ]);
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    record: seasonRowToClientRecord(row),
    player: playerRow ? playerRowToClient(playerRow) : null,
    seasons: seasonRows.map(seasonRowToClientRecord),
    profileSummary: buildPlayerProfileSummary(row, seasonRows),
    row,
  };
}

function normalizeImportIntent(body = {}, actor = {}) {
  const rowCount = Math.max(0, Math.round(normalizeNumber(body.rowCount || body.row_count, 0)));
  const metricCount = Math.max(0, Math.round(normalizeNumber(body.metricCount || body.metric_count, 0)));
  const hashSource = JSON.stringify({
    sourceFileName: body.sourceFileName || body.source_file_name || "",
    sheetName: body.sheetName || body.sheet_name || "",
    seasonLabel: body.seasonLabel || body.season_label || "",
    rowCount,
    metricCount,
    actorId: actor.id || "",
  });
  return {
    source_label: "scouting player database",
    source_file_name: normalizeString(body.sourceFileName || body.source_file_name, 240) || null,
    sheet_name: normalizeString(body.sheetName || body.sheet_name, 160) || null,
    season_label: normalizeString(body.seasonLabel || body.season_label, 80) || null,
    status: "staged",
    row_count: rowCount,
    metric_count: metricCount,
    data_hash: crypto.createHash("sha256").update(hashSource).digest("hex"),
    imported_by: /^[0-9a-f-]{36}$/i.test(String(actor.id || "")) ? actor.id : null,
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  };
}

function normalizeImportMetric(metric = {}, index = 0) {
  const metricKey = normalizeMetricKey(metric.id || metric.metricKey || metric.metric_key || metric.label, `metric_${index + 1}`);
  const direction = normalizeString(metric.direction, 20).toLowerCase() === "lower" ? "lower" : "higher";
  return {
    metric_key: metricKey,
    label: normalizeString(metric.label || metricKey, 160) || metricKey,
    direction,
    category: normalizeString(metric.category, 80) || "performance",
    unit: normalizeString(metric.unit, 40) || null,
    source_column: normalizeString(metric.sourceColumn || metric.source_column || metric.label, 240) || null,
    display_order: Number.isFinite(Number(metric.displayOrder)) ? Number(metric.displayOrder) : 1000 + index,
    status: "active",
    metadata: metric.metadata && typeof metric.metadata === "object" && !Array.isArray(metric.metadata) ? metric.metadata : {},
  };
}

function normalizeImportPlayer(record = {}) {
  const name = getClientRecordName(record);
  const sortName = normalizeSortName(name);
  if (!name || !sortName) {
    return null;
  }
  const sourceSystem = normalizeScoutingSourceSystem(record);
  const sourcePlayerId = normalizeScoutingSourcePlayerId(record);
  const dateOfBirth = normalizeDateValue(recordValue(record, "dateOfBirth"));
  const sourceTrace = getRecordSourceTrace(record);
  return {
    canonical_name: name,
    sort_name: sortName,
    player_identity_key: sourcePlayerId,
    source_system: sourceSystem,
    source_player_id: sourcePlayerId,
    birth_country: normalizeString(recordValue(record, "birthCountry"), 120) || null,
    passport_country: normalizeString(recordValue(record, "passportCountry"), 120) || null,
    height_cm: normalizeNumber(recordValue(record, "height"), null),
    weight_kg: normalizeNumber(recordValue(record, "weight"), null),
    date_of_birth: dateOfBirth || null,
    status: "active",
    metadata: {
      playerIdentityId: sourcePlayerId,
      aliases: [
        normalizeString(recordValue(record, "player"), 180),
        normalizeString(recordValue(record, "sourcePlayerId"), 160),
        normalizeString(sourceTrace.sourcePlayerAlias, 160),
      ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index),
      latestSourceSystem: sourceSystem,
    },
  };
}

function normalizeImportSeasonRecord(record = {}, playerId = null, importBatchId = null) {
  const recordKey = normalizeScoutingRecordSourceId(record);
  const playerName = getClientRecordName(record);
  if (!recordKey || !playerId || !playerName) {
    return null;
  }
  const metrics = recordValue(record, "metrics");
  const sourceSystem = normalizeScoutingSourceSystem(record);
  const sourcePlayerId = normalizeScoutingSourcePlayerId(record);
  const sourceRecordId = normalizeScoutingRecordSourceId(record);
  const sourceTrace = getRecordSourceTrace(record);
  const importedMetricQuality = getRecordMetricQualityMap(record);
  const metricPayload = normalizeMetricPayload(metrics, importedMetricQuality);
  const dateOfBirth = normalizeDateValue(recordValue(record, "dateOfBirth"));
  const mergeKey = [
    sourceSystem,
    sourcePlayerId,
    normalizeString(recordValue(record, "season"), 80),
    normalizeScoutingLeague(recordValue(record, "league")),
    normalizeString(recordValue(record, "team"), 180),
  ].filter(Boolean).join("|");
  return {
    import_batch_id: importBatchId || null,
    player_id: playerId,
    record_key: recordKey,
    player_identity_key: sourcePlayerId,
    source_system: sourceSystem,
    source_player_id: sourcePlayerId,
    source_record_id: sourceRecordId,
    player_name: playerName,
    team_name: normalizeString(recordValue(record, "team"), 180) || null,
    team_within_timeframe: normalizeString(recordValue(record, "teamWithinTimeframe"), 180) || normalizeString(recordValue(record, "team"), 180) || null,
    league_name: normalizeScoutingLeague(recordValue(record, "league")) || null,
    season_label: normalizeString(recordValue(record, "season"), 80) || null,
    position_text: normalizeString(recordValue(record, "position"), 120) || null,
    position_group: getClientRecordPositionGroup(record),
    age: normalizeNumber(recordValue(record, "age"), null),
    matches: normalizeNumber(recordValue(record, "matches"), null),
    minutes: Math.max(0, Math.round(normalizeNumber(recordValue(record, "minutes"), 0))),
    birth_country: normalizeString(recordValue(record, "birthCountry"), 120) || null,
    passport_country: normalizeString(recordValue(record, "passportCountry"), 120) || null,
    height_cm: normalizeNumber(recordValue(record, "height"), null),
    weight_kg: normalizeNumber(recordValue(record, "weight"), null),
    date_of_birth: dateOfBirth || null,
    metrics: metricPayload,
    status: "active",
    metadata: {
      playerIdentityId: sourcePlayerId,
      mergeKey,
      sourceTrace: {
        ...sourceTrace,
        sourceSystem,
        importBatchId: importBatchId || sourceTrace.importBatchId || "",
        sourceFileName: normalizeString(sourceTrace.sourceFileName, 240),
        sheetName: normalizeString(sourceTrace.sheetName, 160),
        sourceRowNumber: normalizeNumber(sourceTrace.sourceRowNumber, null),
        uploadedAt: normalizeString(sourceTrace.uploadedAt, 80) || null,
        deletedAt: null,
      },
      metricQuality: {
        ...Object.fromEntries(Object.entries(importedMetricQuality).map(([key, quality]) => [key, normalizeMetricQuality(quality)])),
        ...Object.fromEntries(Object.entries(metricPayload).map(([key, entry]) => [key, normalizeMetricQuality(entry.quality)])),
      },
      metricQualitySummary: getMetricQualitySummary(metricPayload),
      imageUrl: normalizeString(recordValue(record, "imageUrl"), 220) || null,
      dateOfBirth,
    },
  };
}

function uniqueBy(items = [], keyFn = (item) => item) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchExistingSeasonBySource(sourceSystem = "", sourceRecordId = "") {
  const normalizedSourceSystem = normalizeString(sourceSystem, 40);
  const normalizedSourceRecordId = normalizeString(sourceRecordId, 160);
  if (!normalizedSourceSystem || !normalizedSourceRecordId) {
    return null;
  }
  const params = new URLSearchParams({
    select: "id,record_key,source_system,source_record_id,player_identity_key,season_label,league_name,team_name,status,deleted_at,updated_at",
    source_system: `eq.${normalizedSourceSystem}`,
    source_record_id: `eq.${normalizedSourceRecordId}`,
    limit: "1",
  });
  const result = await dbRequest(`/scouting_player_seasons?${params.toString()}`);
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload[0] || null : null;
}

async function previewScoutingImportRows(records = []) {
  const rows = uniqueBy(records.slice(0, MAX_IMPORT_CHUNK_RECORDS).filter(Boolean), (record) =>
    `${normalizeScoutingSourceSystem(record)}|${normalizeScoutingRecordSourceId(record)}`
  );
  const existingRows = await Promise.all(
    rows.map((record) => fetchExistingSeasonBySource(normalizeScoutingSourceSystem(record), normalizeScoutingRecordSourceId(record)))
  );
  const changes = rows.map((record, index) => {
    const existing = existingRows[index];
    const sourceSystem = normalizeScoutingSourceSystem(record);
    const sourceRecordId = normalizeScoutingRecordSourceId(record);
    const playerIdentityId = normalizeScoutingSourcePlayerId(record);
    const mergeKey = [
      sourceSystem,
      playerIdentityId,
      normalizeString(recordValue(record, "season"), 80),
      normalizeScoutingLeague(recordValue(record, "league")),
      normalizeString(recordValue(record, "team"), 180),
    ].filter(Boolean).join("|");
    return {
      sourceSystem,
      sourceRecordId,
      playerIdentityId,
      playerName: getClientRecordName(record),
      season: normalizeString(recordValue(record, "season"), 80),
      league: normalizeScoutingLeague(recordValue(record, "league")),
      team: normalizeString(recordValue(record, "team"), 180),
      mergeKey,
      status: existing ? "replace" : "new",
      existingRecordKey: normalizeString(existing?.record_key, MAX_ID_LENGTH),
      existingStatus: normalizeString(existing?.status, 40),
      existingDeletedAt: normalizeString(existing?.deleted_at, 80),
    };
  });
  return {
    rowCount: rows.length,
    newRows: changes.filter((change) => change.status === "new").length,
    replacementRows: changes.filter((change) => change.status === "replace").length,
    changes,
  };
}

async function upsertScoutingMetrics(metrics = []) {
  const rows = uniqueBy(metrics.map(normalizeImportMetric).filter(Boolean), (row) => row.metric_key);
  if (!rows.length) {
    return [];
  }
  const result = await dbRequest("/scouting_metrics?on_conflict=metric_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: rows,
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload : [];
}

async function upsertScoutingPlayers(records = []) {
  const rows = uniqueBy(records.map(normalizeImportPlayer).filter(Boolean), (row) => row.player_identity_key || `${row.source_system || "file-import"}::${row.source_player_id || "unknown"}`);
  if (!rows.length) {
    return new Map();
  }
  const sourceKeyByIdentity = new Map(rows.map((row) => [row.player_identity_key, `${row.source_system || "file-import"}::${row.source_player_id || "unknown"}`]));
  const result = await dbRequest("/scouting_players?on_conflict=player_identity_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: rows,
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return new Map(
    (Array.isArray(result.payload) ? result.payload : [])
      .map((row) => {
        const identityKey = normalizeString(row.player_identity_key || row.source_player_id, 160);
        const sourceKey = sourceKeyByIdentity.get(identityKey);
        if (!sourceKey) {
          return null;
        }
        return [sourceKey, row.id];
      })
      .filter(Boolean)
  );
}

async function upsertScoutingSeasonRecords(records = [], playersBySourceId = new Map(), importBatchId = null) {
  const rows = records
    .map((record) => normalizeImportSeasonRecord(record, playersBySourceId.get(normalizeScoutingPlayerSourceKey(record)), importBatchId))
    .filter(Boolean);
  if (!rows.length) {
    return [];
  }
  const result = await dbRequest("/scouting_player_seasons?on_conflict=source_system,source_record_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: rows,
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload : [];
}

async function appendImportChanges(importBatchId = "", preview = {}, seasonRows = []) {
  const batchId = normalizeString(importBatchId, 80);
  if (!batchId || !Array.isArray(preview.changes) || !preview.changes.length) {
    return [];
  }
  const seasonBySourceRecordId = new Map(
    (Array.isArray(seasonRows) ? seasonRows : [])
      .map((row) => [normalizeString(row.source_record_id, 160), row])
      .filter(([sourceRecordId]) => Boolean(sourceRecordId))
  );
  const rows = preview.changes.map((change) => {
    const seasonRow = seasonBySourceRecordId.get(normalizeString(change.sourceRecordId, 160));
    return {
      import_batch_id: batchId,
      season_record_id: seasonRow?.id || null,
      change_type: change.status === "replace" ? "updated-player" : "new-season-row",
      before_value: change.status === "replace" ? { recordKey: change.existingRecordKey, status: change.existingStatus } : {},
      after_value: {
        recordKey: seasonRow?.record_key || "",
        sourceSystem: change.sourceSystem,
        sourceRecordId: change.sourceRecordId,
        playerIdentityId: change.playerIdentityId,
        playerName: change.playerName,
        season: change.season,
        league: change.league,
        team: change.team,
        mergeKey: change.mergeKey,
      },
    };
  });
  const result = await dbRequest("/scouting_import_changes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: rows,
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  return Array.isArray(result.payload) ? result.payload : [];
}

async function startExcelImport(body = {}, actor = {}) {
  if (!canWriteScoutingDatabase(actor)) {
    return { ok: false, status: 403, reason: "Scouting database imports require scouting write access." };
  }
  if (!isScoutingDatabaseEnabled()) {
    return {
      ok: true,
      schema: SCOUTING_DATABASE_SCHEMA,
      mode: "legacy",
      enabled: false,
      stored: false,
      reason: "Scouting database mode is not enabled.",
    };
  }
  const row = normalizeImportIntent(body, actor);
  const result = await dbRequest("/scouting_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [row],
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  const inserted = Array.isArray(result.payload) ? result.payload[0] : null;
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    importBatchId: inserted?.id || "",
    dataHash: row.data_hash,
    status: "staged",
  };
}

async function importExcelChunk(body = {}, actor = {}) {
  if (!canWriteScoutingDatabase(actor)) {
    return { ok: false, status: 403, reason: "Scouting database imports require scouting write access." };
  }
  if (!isScoutingDatabaseEnabled()) {
    return { ok: true, schema: SCOUTING_DATABASE_SCHEMA, mode: "legacy", enabled: false, stored: false };
  }
  const importBatchId = normalizeString(body.importBatchId || body.import_batch_id, 80);
  const records = Array.isArray(body.records) ? body.records.slice(0, MAX_IMPORT_CHUNK_RECORDS) : [];
  const metrics = Array.isArray(body.metrics) ? body.metrics : [];
  if (!records.length) {
    return { ok: false, status: 400, reason: "Import chunk does not contain any player rows." };
  }
  const preview = await previewScoutingImportRows(records);
  await upsertScoutingMetrics(metrics);
  const playersBySortName = await upsertScoutingPlayers(records);
  const seasonRows = await upsertScoutingSeasonRecords(records, playersBySortName, importBatchId || null);
  const importChanges = await appendImportChanges(importBatchId, preview, seasonRows);
  scoutingFilterOptionsCache = { updatedAt: 0, options: null };
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    stored: true,
    importBatchId,
    chunkIndex: Math.max(0, Math.round(normalizeNumber(body.chunkIndex, 0))),
    chunkCount: Math.max(1, Math.round(normalizeNumber(body.chunkCount, 1))),
    metricCount: metrics.length,
    recordCount: records.length,
    storedRecordCount: seasonRows.length,
    preview,
    importChangeCount: importChanges.length,
  };
}

async function previewExcelImport(body = {}, actor = {}) {
  if (!canWriteScoutingDatabase(actor)) {
    return { ok: false, status: 403, reason: "Scouting database imports require scouting write access." };
  }
  if (!isScoutingDatabaseEnabled()) {
    return { ok: true, schema: SCOUTING_DATABASE_SCHEMA, mode: "legacy", enabled: false, stored: false };
  }
  const records = Array.isArray(body.records) ? body.records.slice(0, MAX_IMPORT_CHUNK_RECORDS) : [];
  if (!records.length) {
    return { ok: false, status: 400, reason: "Import preview does not contain any player rows." };
  }
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    preview: await previewScoutingImportRows(records),
  };
}

async function finishExcelImport(body = {}, actor = {}) {
  const importBatchId = normalizeString(body.importBatchId || body.import_batch_id, 80);
  if (!importBatchId) {
    return { ok: false, status: 400, reason: "Missing scouting import batch id." };
  }
  if (!canWriteScoutingDatabase(actor)) {
    return { ok: false, status: 403, reason: "Scouting database imports require scouting write access." };
  }
  if (!isScoutingDatabaseEnabled()) {
    return { ok: true, schema: SCOUTING_DATABASE_SCHEMA, mode: "legacy", enabled: false, stored: false };
  }
  const result = await dbRequest(`/scouting_import_batches?id=eq.${encodeURIComponent(importBatchId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      status: "published",
      published_at: new Date().toISOString(),
      published_by: /^[0-9a-f-]{36}$/i.test(String(actor.id || "")) ? actor.id : null,
      row_count: Math.max(0, Math.round(normalizeNumber(body.rowCount || body.row_count, 0))),
      metric_count: Math.max(0, Math.round(normalizeNumber(body.metricCount || body.metric_count, 0))),
    },
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  await appendAuditLog(actor, {
    action: "scouting.database.import_published",
    summary: "Published scouting player database import",
    details: {
      importBatchId,
      rowCount: body.rowCount || body.row_count || 0,
      metricCount: body.metricCount || body.metric_count || 0,
    },
  });
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    stored: true,
    importBatchId,
    status: "published",
    updatedAt: new Date().toISOString(),
  };
}

async function rollbackScoutingImport(body = {}, actor = {}) {
  const importBatchId = normalizeString(body.importBatchId || body.import_batch_id || body.id, 80);
  if (!importBatchId) {
    return { ok: false, status: 400, reason: "Missing scouting import batch id." };
  }
  if (!canWriteScoutingDatabase(actor)) {
    return { ok: false, status: 403, reason: "Scouting database rollback requires scouting write access." };
  }
  if (!isScoutingDatabaseEnabled()) {
    return { ok: true, schema: SCOUTING_DATABASE_SCHEMA, mode: "legacy", enabled: false, stored: false };
  }
  const now = new Date().toISOString();
  const seasonResult = await dbRequest(`/scouting_player_seasons?import_batch_id=eq.${encodeURIComponent(importBatchId)}&deleted_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      status: "inactive",
      deleted_at: now,
    },
  });
  if (!seasonResult.ok) {
    throw Object.assign(new Error(seasonResult.reason), { status: seasonResult.status, payload: seasonResult.payload });
  }
  const batchResult = await dbRequest(`/scouting_import_batches?id=eq.${encodeURIComponent(importBatchId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      status: "archived",
    },
  });
  if (!batchResult.ok) {
    throw Object.assign(new Error(batchResult.reason), { status: batchResult.status, payload: batchResult.payload });
  }
  scoutingFilterOptionsCache = { updatedAt: 0, options: null };
  await appendAuditLog(actor, {
    action: "scouting.database.import_rolled_back",
    summary: "Rolled back scouting player database import",
    details: {
      importBatchId,
      affectedSeasonRows: Array.isArray(seasonResult.payload) ? seasonResult.payload.length : 0,
    },
  });
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    importBatchId,
    status: "rolled-back",
    affectedSeasonRows: Array.isArray(seasonResult.payload) ? seasonResult.payload.length : 0,
    updatedAt: now,
  };
}

async function recordImportIntent(body = {}, actor = {}) {
  if (!canWriteScoutingDatabase(actor)) {
    return { ok: false, status: 403, reason: "Scouting database imports require scouting write access." };
  }
  if (!isScoutingDatabaseEnabled()) {
    return {
      ok: true,
      schema: SCOUTING_DATABASE_SCHEMA,
      mode: "legacy",
      enabled: false,
      stored: false,
      reason: "Scouting database mode is not enabled.",
    };
  }
  const row = normalizeImportIntent(body, actor);
  const result = await dbRequest("/scouting_import_batches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [row],
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.reason), { status: result.status, payload: result.payload });
  }
  const inserted = Array.isArray(result.payload) ? result.payload[0] : null;
  await appendAuditLog(actor, {
    action: "scouting.database.import_intent",
    summary: "Created scouting database import batch",
    details: {
      importBatchId: inserted?.id || "",
      rowCount: row.row_count,
      metricCount: row.metric_count,
      sourceFileName: row.source_file_name || "",
    },
  });
  return {
    ok: true,
    schema: SCOUTING_DATABASE_SCHEMA,
    mode: "database",
    enabled: true,
    stored: Boolean(inserted?.id),
    importBatchId: inserted?.id || "",
    dataHash: row.data_hash,
    updatedAt: new Date().toISOString(),
  };
}

async function handleScoutingGet(req, res, actor) {
  const url = new URL(req.url || "/api/scouting", "https://footballscience.local");
  const action = normalizeString(url.searchParams.get("action") || "status", 40);
  const status = scoutingDatabaseStatus(actor);
  if (action === "status") {
    return sendJson(res, 200, status);
  }
  if (!status.enabled) {
    return sendJson(res, 200, {
      ...status,
      records: [],
      metrics: [],
      reason: "Scouting database mode is not enabled.",
    });
  }
  const query = Object.fromEntries(url.searchParams.entries());
  if (["snapshot", "search", "database"].includes(action)) {
    return sendJson(res, 200, await fetchDatabaseSnapshot(query));
  }
  if (action === "options") {
    return sendJson(res, 200, {
      ok: true,
      schema: SCOUTING_DATABASE_SCHEMA,
      mode: "database",
      enabled: true,
      options: await fetchDatabaseFilterOptions(),
    });
  }
  if (action === "imports" || action === "importHistory") {
    return sendJson(res, 200, await fetchImportHistory(query));
  }
  if (action === "importChanges") {
    const result = await fetchImportChanges(query);
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }
  if (action === "profile") {
    const result = await fetchPlayerProfile(query);
    return sendJson(res, result.ok ? 200 : result.status || 404, result);
  }
  return sendJson(res, 400, { ok: false, reason: "Unsupported scouting database action." });
}

async function handleScoutingPost(req, res, actor) {
  const body = await parseJsonBody(req);
  const action = normalizeString(body.action || "recordImportIntent", 80);
  if (action === "startExcelImport") {
    const result = await startExcelImport(body, actor);
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }
  if (action === "importExcelChunk") {
    const result = await importExcelChunk(body, actor);
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }
  if (action === "previewExcelImport") {
    const result = await previewExcelImport(body, actor);
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }
  if (action === "finishExcelImport") {
    const result = await finishExcelImport(body, actor);
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }
  if (action === "rollbackImport") {
    const result = await rollbackScoutingImport(body, actor);
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }
  if (action === "recordImportIntent") {
    const result = await recordImportIntent(body, actor);
    return sendJson(res, result.ok ? 200 : result.status || 400, result);
  }
  return sendJson(res, 400, { ok: false, reason: "Unsupported scouting database action." });
}

async function handleScoutingDatabaseRequest(req, res, actor) {
  if (req.method === "GET") {
    return handleScoutingGet(req, res, actor);
  }
  if (req.method === "POST") {
    return handleScoutingPost(req, res, actor);
  }
  return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
}

module.exports = {
  SCOUTING_DATABASE_SCHEMA,
  canWriteScoutingDatabase,
  handleScoutingDatabaseRequest,
  isScoutingDatabaseEnabled,
  _private: {
    addSeasonFilters,
    buildOptionsFromRows,
    fetchDatabaseFilterOptions,
    fetchImportHistory,
    fetchPlayerProfile,
    getClientRecordPositionGroup,
    importExcelChunk,
    metricToClient,
    normalizeImportIntent,
    normalizeImportMetric,
    normalizeImportPlayer,
    normalizeImportSeasonRecord,
    previewExcelImport,
    rollbackScoutingImport,
    seasonRowToClientRecord,
    startExcelImport,
  },
};
