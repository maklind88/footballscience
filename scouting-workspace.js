import {
  handleScoutingModuleChange,
  handleScoutingModuleClick,
  handleScoutingModuleInput,
  handleScoutingModuleSubmit,
  handleScoutingWorkspaceClick,
  bindScoutingDragAndDrop as bindScoutingDragAndDropRouter,
  createScoutingListsActions,
  createScoutingMyTeamActions,
  renderScoutingActiveContentByTab,
} from "./src/modules/scouting/index.mjs";
import {
  getScoutingAdvancedDatabaseFiltersOpen,
  getScoutingDatabaseAdvancedMode,
  getScoutingDatabaseApiRefreshTimer,
  getScoutingDatabaseFilterDebounceTimer,
  getScoutingDatabaseMetricFilterOpen,
  getScoutingDatabaseMetricFilterQuery,
  getScoutingDatabaseResultsFrame,
  getScoutingDatabaseSearchDraft,
  setScoutingAdvancedDatabaseFiltersOpen as setScoutingAdvancedDatabaseFiltersOpenState,
  setScoutingDatabaseAdvancedMode as setScoutingDatabaseAdvancedModeState,
  setScoutingDatabaseApiRefreshTimer,
  setScoutingDatabaseFilterDebounceTimer,
  setScoutingDatabaseMetricFilterOpen,
  setScoutingDatabaseMetricFilterQuery,
  setScoutingDatabaseResultsFrame,
  setScoutingDatabaseSearchDraft,
} from "./src/modules/scouting/scouting-database-state.mjs";
import { createScoutingImportHelpers } from "./src/modules/scouting/scouting-import-helpers.mjs";
import { createScoutingPerformanceMonitor } from "./src/modules/scouting/scouting-performance.mjs";
import {
  scoutingFallbackSpiderProfiles,
  scoutingRoleSpiderProfiles,
} from "./src/modules/scouting/scouting-role-spider-profiles.mjs";
import { scoutingAdditionalRoleSpiderProfiles } from "./src/modules/scouting/scouting-role-additional-profiles.mjs";
import {
  scoutingRoleCategoryById,
  scoutingRoleCategoryProfiles,
  scoutingRoleScoringProfiles,
} from "./src/modules/scouting/scouting-role-scoring-profiles.mjs";
import { createScoutingDatabaseFilterService } from "./src/modules/scouting/scouting-database-filter-service.mjs";
import {
  addScoutingRecordIdToShadowSlot,
  removeScoutingRecordIdFromShadowSlot,
  reorderScoutingRecordIdInShadowSlot,
  toggleScoutingFavoriteRecordId,
} from "./src/modules/scouting/scouting-decision-actions.mjs";

let activeContext = null;
let scoutingTabs = [];
let scoutingShadowSlots = [];
let scoutingCoreMetricOptions = [];
let scoutingStatusOptions = [];
let scoutingPriorityOptions = [];
let scoutingDatabaseLoadPromise = null;
let scoutingDatabaseLoadSource = "";
let scoutingDatabaseWorker = null;
let scoutingDatabaseWorkerPreloadPromise = null;
let scoutingDatabaseWorkerPreloadTimer = 0;
let scoutingDatabaseWorkerFullPreloadPromise = null;
let scoutingDatabaseWorkerFullPreloadTimer = 0;
let scoutingDatabaseWorkerFullRefreshTimer = 0;
let scoutingDatabaseAutoLoadTimer = 0;
let scoutingDatabaseWorkerFullReady = false;
let scoutingDatabaseWorkerRequestId = 0;
let scoutingDatabaseError = "";
let scoutingDatabaseOptionCache = null;
let scoutingDatabaseOptionLoadPromise = null;
let scoutingPercentileCache = new Map();
let scoutingMetricAliasCache = new Map();
let scoutingRoleProfileCache = new Map();
let scoutingRecordIntelligenceCache = new Map();
let scoutingRecordSearchCorpusCache = new Map();
let scoutingMetricIndexCache = { database: null, byId: new Map() };
let scoutingRecordIdLookupCache = new Map();
let scoutingRecordNameLookupCache = new Map();
let scoutingRecordPersonLookupCache = new Map();
let scoutingKnownRecordLookupCache = new Map();
let scoutingKnownRecordLookupFingerprint = "";
let scoutingRecordLookupFingerprint = "";
let scoutingShadowFavoriteSearchQuery = "";
let scoutingReportBuilderOpen = false;
let scoutingReportsExpandedPanels = new Set();
let scoutingOpenRecordActionMenuId = "";
let scoutingRoleModelBuilderOpen = false;
let scoutingRoleModelEditId = "";
let scoutingSavedViewsOpen = false;
let scoutingSavedViewNameDraft = "";
let scoutingSettingsPanel = "";
let scoutingComparisonMetricMenuOpen = false;
let scoutingComparisonMetricFilterQuery = "";
let scoutingComparisonCandidatesOpen = false;
let scoutingComparisonPlayerSearchQuery = "";
let scoutingComparisonSearchTimer = 0;
let scoutingComparisonSearchCache = { key: "", status: "idle", records: [], error: "", promise: null };
let scoutingMyTeamRecordMatchCache = new Map();
let scoutingMyTeamRecordHydrationInFlight = new Set();
let scoutingLeagueQualityCache = new Map();
let scoutingRecordMiniRadarCache = new Map();
let scoutingFilteredDatabaseCache = {
  key: "",
  records: [],
};
let scoutingFilteredDatabaseNavigationCache = {
  key: "",
  ids: [],
  indexById: new Map(),
};
const scoutingDatabaseFilterService = createScoutingDatabaseFilterService({
  getScoutingDatabase,
  ensureScoutingState,
  normalizeScoutingDatabaseFilters,
  normalizeScoutingText,
  ensureScoutingRecordLookupsReady,
  getScoutingRoleProfileById,
  getScoutingRoleCategoryGroup,
  normalizeScoutingRecordIds,
  getScoutingTargetedRecordIds,
  getScoutingAllShadowRecordIds,
  getScoutingApiOffset,
  groupScoutingDatabaseRecordsByPerson,
  getScoutingRecordLeague,
  getScoutingRecordTeam,
  getScoutingRecordSeason,
  scoutingPositionMatchesFilter,
  getScoutingRecordMinutes,
  getScoutingRecordAge,
  getScoutingMetricValue,
  getScoutingRoleFitScore,
  getScoutingComparablePercentile,
  getScoutingRoleMetricFloor,
  getScoutingRecordId,
  getScoutingPositionGroup,
  getScoutingSampleConfidenceScore,
  getScoutingIntelligenceProfile,
  getScoutingMarketInfo,
  isScoutingHighDealProbability,
  doesScoutingRecordMatchSearchQuery,
  getScoutingMetric,
  getFilteredDatabaseCache: () => scoutingFilteredDatabaseCache,
  setFilteredDatabaseCache: (cache) => {
    scoutingFilteredDatabaseCache = cache;
  },
  getRecordLookupFingerprint: () => scoutingRecordLookupFingerprint,
  getMarketIntelVersion: () => scoutingMarketIntelVersion,
});
const { getFilteredScoutingDatabaseRecords } = scoutingDatabaseFilterService;
const scoutingPerformanceMonitor = createScoutingPerformanceMonitor({
  windowRef: typeof globalThis !== "undefined" ? globalThis.window : null,
  performanceRef: typeof globalThis !== "undefined" ? globalThis.performance : null,
});
let scoutingMarketIntelVersion = 0;
let preferredScoutingShadowSlotId = "";
let scoutingImportedDatabaseLoaded = false;
let scoutingPendingProfileFocusRecordId = "";
let scoutingPendingProfileFocusUntil = 0;
let scoutingProfileFocusTimer = 0;
let scoutingProfileFocusObserver = null;
let scoutingImportDraft = null;
let scoutingImportParserPromise = null;
let scoutingImportPdfParserPromise = null;
let scoutingMyTeamSelectedPlayerId = "";
let scoutingIntelligenceCacheVersion = 0;
let scoutingImportHistoryCache = { status: "idle", imports: [], error: "", promise: null };
let scoutingFootballScienceDbQualityCache = { status: "idle", summary: null, error: "", promise: null };
let scoutingFootballScienceDbProfileCache = new Map();
let scoutingProfileApiCache = new Map();
let scoutingProfileOverviewPanelHydrateInProgress = new Set();
let scoutingOppositionFilters = { team: "", season: "all", minMinutes: 450 };
let scoutingOppositionLatestSnapshot = null;
let scoutingDataQualitySummaryCache = { key: "", value: null };
const SCOUTING_API_ACCESS_TOKEN_MAX_LENGTH = 6000;
const scoutingDatabaseWorkerRequests = new Map();
const scoutingWorkerRecordHydrationQueue = new Set();
const scoutingWorkerRecordHydrationInFlight = new Set();
let scoutingWorkerRecordHydrationTimer = 0;
const scoutingImportedDatabaseStorageKey = "football-scouting-imported-database-v1";
const scoutingImportLastUploadStorageKey = "football-scouting-last-import-summary-v1";
const scoutingImportSupportedSourceTypes = Object.freeze([
  { id: "xlsx", label: "Excel", extensions: [".xlsx", ".xlsm", ".xlsb", ".xls"], parser: "xlsx", supportsSheets: true },
  { id: "csv", label: "CSV / TSV", extensions: [".csv", ".tsv", ".txt"], parser: "csv", supportsSheets: false },
  { id: "json", label: "JSON", extensions: [".json"], parser: "json", supportsSheets: false },
  { id: "pdf", label: "PDF", extensions: [".pdf"], parser: "pdf", supportsSheets: false },
]);
const scoutingImportSourcePresets = Object.freeze([
  {
    id: "wyscout",
    sourceSystem: "wyscout",
    label: "Apply Wyscout",
    map: {
      player: ["player", "player name", "full name", "name", "player name latin"],
      team: ["team", "club", "squad", "club name"],
      league: ["league", "competition", "comp", "league name", "competition name"],
      season: ["season", "season label", "season year", "year"],
      position: ["position", "positions", "pos", "best role", "primary position"],
      age: ["age", "player age"],
      dateOfBirth: ["date of birth", "dob", "birth date", "birthday", "dateofbirth"],
      matches: ["matches", "apps", "appearances"],
      minutes: ["minutes", "mins", "minutes played", "played min"],
      birthCountry: ["birth country", "country of birth", "birthplace"],
      passportCountry: ["passport country", "nationality", "passport"],
      imageUrl: ["image", "image url", "photo", "photo url", "avatar", "headshot", "headshot url", "player image"],
      height: ["height", "height cm", "player height"],
      weight: ["weight", "weight kg", "player weight"],
      playerIdentityId: ["player id", "playerid", "id", "player id (wyscout)", "wyscout player id"],
      sourceIdentityId: ["source id", "source player id", "external id", "external_id"],
      wyscoutId: ["wyscout id", "wyscout_id", "wyscoutid", "wyscout player id"],
      sourceRecordId: ["record id", "source record id", "record", "wyscout record id", "player season id"],
    },
  },
  {
    id: "fbref",
    sourceSystem: "fbref",
    label: "Apply FBref",
    map: {
      player: ["player", "player name", "name", "player short"],
      team: ["squad", "team", "club", "team name"],
      league: ["league", "competition", "comp", "competition name", "division"],
      season: ["season", "year", "comp season", "season year"],
      position: ["position", "pos", "positions", "primary position"],
      age: ["age", "age (years)"],
      dateOfBirth: ["date of birth", "dob", "birth date", "birthday"],
      matches: ["matches", "apps", "appearances", "played"],
      minutes: ["minutes", "mins", "minutes played", "min"],
      birthCountry: ["birth country", "country of birth"],
      passportCountry: ["nation", "nationality", "country"],
      imageUrl: ["image", "image url", "photo", "photo url"],
      height: ["height", "height cm", "height(cm)"],
      weight: ["weight", "weight kg", "weight(kg)"],
      playerIdentityId: ["player id", "fbref id", "fbref_id", "player_id", "id"],
      sourceIdentityId: ["source id", "external id", "external_id"],
      fbrefId: ["fbref id", "fbref_id", "fbref player id", "fbref player_id"],
      sourceRecordId: ["record id", "source record id", "match id", "player season id"],
    },
  },
  {
    id: "transfermarkt",
    sourceSystem: "transfermarkt",
    label: "Apply Transfermarkt",
    map: {
      player: ["player", "player name", "name", "name with accents"],
      team: ["team", "club", "club name", "squad"],
      league: ["league", "league name", "competition", "division"],
      season: ["season", "season label", "year"],
      position: ["position", "positions", "main position", "pos"],
      age: ["age", "age in years"],
      dateOfBirth: ["date of birth", "dob", "birthday", "born"],
      matches: ["appearances", "apps", "matches"],
      minutes: ["minutes", "mins", "minutes played"],
      birthCountry: ["citizenship", "nationality", "country"],
      passportCountry: ["nationality", "country"],
      imageUrl: ["image", "image url", "photo", "player image", "image_url"],
      height: ["height", "height (cm)", "height cm", "player height"],
      weight: ["weight", "weight (kg)", "weight kg", "player weight"],
      playerIdentityId: ["player id", "tm id", "tm player id", "transfermarkt id", "transfermarkt_id", "id"],
      sourceIdentityId: ["source id", "external id", "external_id", "transfermarkt source id"],
      transfermarktId: ["transfermarkt id", "transfermarkt_id", "tm id", "tm_id", "transfermarkt player id", "player_id"],
      sourceRecordId: ["record id", "source record id", "season record id", "player season id"],
    },
  },
  {
    id: "generic",
    sourceSystem: "file-import",
    label: "Apply Generic CSV/JSON/PDF",
    map: {
      player: ["player", "player name", "name"],
      team: ["team", "club", "squad"],
      league: ["league", "competition", "division", "tournament"],
      season: ["season", "year"],
      position: ["position", "positions", "pos"],
      age: ["age"],
      dateOfBirth: ["date of birth", "dob", "birth date", "birthday", "date"],
      matches: ["matches", "apps", "appearances"],
      minutes: ["minutes", "mins", "played", "played min"],
      birthCountry: ["birth country", "country of birth", "birth place", "birthplace"],
      passportCountry: ["passport country", "nationality", "passport", "nation"],
      imageUrl: ["image", "image url", "photo", "avatar", "headshot", "player image"],
      height: ["height", "height cm", "height(m)"],
      weight: ["weight", "weight kg", "weight(kg)"],
      playerIdentityId: ["player identity id", "player id", "playerid", "source player id", "id"],
      sourceIdentityId: ["source identity id", "source id", "external id", "external_id"],
      wyscoutId: ["wyscout id", "wyscout_id", "wyscoutid"],
      fbrefId: ["fbref id", "fbref_id", "fbrefid"],
      transfermarktId: ["transfermarkt id", "transfermarkt_id", "transfermarktid", "tm id", "tm_id"],
      federationId: ["federation id", "federation_id", "federationid"],
      playerSourceId: ["player source id", "player_id", "player id", "source_player_id", "external_id"],
      sourceRecordId: ["record id", "source record id", "source_record_id", "season record id", "row id"],
    },
  },
]);
const SCOUTING_IMPORT_MAX_RECORDS_PER_CHUNK = 10;
const SCOUTING_IMPORT_MAX_CHUNK_PAYLOAD_CHARACTERS = 70000;
const SCOUTING_IMPORT_MAX_CHUNK_BYTES = 200000;
const SCOUTING_API_DATABASE_PAGE_LIMIT = 50;
const SCOUTING_DATABASE_PAGE_SIZE = 50;
const SCOUTING_ADVANCED_PANEL_RECORD_LIMIT = 4;
const SCOUTING_STANDALONE_FSDB_DATABASE_ENABLED = false;
const SCOUTING_FSDB_GENDER_SEGMENT_OPTIONS = Object.freeze([
  { id: "women", label: "Women's players", shortLabel: "Women's" },
  { id: "men", label: "Men's players", shortLabel: "Men's" },
]);
const scoutingImportSupportedFileExts = Object.freeze(
  scoutingImportSupportedSourceTypes
    .flatMap((sourceType) => sourceType.extensions)
    .map((extension) => normalizeScoutingText(extension, 16).toLowerCase())
    .join(",")
);
const scoutingImportHelpers = createScoutingImportHelpers({
  supportedSourceTypes: scoutingImportSupportedSourceTypes,
  normalizeText: normalizeScoutingText,
  normalizeDateValue: normalizeScoutingDateValue,
  normalizeIdentityPart: normalizeScoutingIdentityPart,
  normalizeLeague: normalizeScoutingLeague,
  getImportDraft: () => scoutingImportDraft,
  getPdfParserPromise: () => scoutingImportPdfParserPromise,
  setPdfParserPromise: (promise) => { scoutingImportPdfParserPromise = promise; },
  windowRef: window,
  documentRef: document,
});
const {
  buildScoutingImportCollectionHash,
  buildScoutingImportHash,
  buildScoutingImportRecordId,
  buildScoutingPlayerSourceId,
  buildScoutingRecordSourceId,
  buildScoutingScopedId,
  detectScoutingImportDelimiter,
  ensureScoutingPdfParserLoaded,
  getScoutingImportHeadersForBatch,
  getScoutingImportIdentityCandidates,
  getScoutingImportMergeKey,
  getScoutingImportMetricDirection,
  getScoutingImportMetricHeaders,
  getScoutingImportMetricQuality,
  getScoutingImportSheetsForBatch,
  getScoutingImportSourceFromFile,
  getScoutingImportSourceSystem,
  isScoutingVerifiedImportIdentityKey,
  normalizeScoutingImportText,
  parseScoutingJsonRows,
  parseScoutingMetricValue,
  parseScoutingPdfSource,
  parseScoutingSeparatedLine,
  parseScoutingSeparatedRows,
  parseScoutingTextRowsToRecords,
  readScoutingText,
} = scoutingImportHelpers;
const scoutingStatusFallbackOptions = [
  { value: "new", label: "Longlist" },
  { value: "monitoring", label: "Monitoring" },
  { value: "shortlist", label: "Shortlist" },
  { value: "contacted", label: "Contacted" },
  { value: "negotiation", label: "Negotiation" },
  { value: "signed", label: "Signed" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];
const scoutingPriorityFallbackOptions = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];
const scoutingRecordIndex = Object.freeze({
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
const scoutingCountryCodeByName = Object.freeze({
  afghanistan: "AF",
  albania: "AL",
  algeria: "DZ",
  argentina: "AR",
  australia: "AU",
  austria: "AT",
  belgium: "BE",
  bosnia: "BA",
  "bosnia and herzegovina": "BA",
  brazil: "BR",
  bulgaria: "BG",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  croatia: "HR",
  czech: "CZ",
  czechia: "CZ",
  denmark: "DK",
  england: "GB",
  estonia: "EE",
  ethiopia: "ET",
  finland: "FI",
  france: "FR",
  georgia: "GE",
  germany: "DE",
  ghana: "GH",
  greece: "GR",
  hungary: "HU",
  iceland: "IS",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  japan: "JP",
  korea: "KR",
  kenya: "KE",
  latvia: "LV",
  lithuania: "LT",
  luxembourg: "LU",
  arg: "AR",
  aus: "AU",
  aut: "AT",
  bel: "BE",
  bih: "BA",
  bra: "BR",
  can: "CA",
  chi: "CL",
  chn: "CN",
  col: "CO",
  cro: "HR",
  cze: "CZ",
  den: "DK",
  eng: "GB",
  esp: "ES",
  fin: "FI",
  fra: "FR",
  ger: "DE",
  gha: "GH",
  gre: "GR",
  hun: "HU",
  isl: "IS",
  irl: "IE",
  isr: "IL",
  ita: "IT",
  jpn: "JP",
  kor: "KR",
  mex: "MX",
  mexico: "MX",
  mar: "MA",
  morocco: "MA",
  ned: "NL",
  netherlands: "NL",
  nzl: "NZ",
  "new zealand": "NZ",
  nga: "NG",
  nigeria: "NG",
  nor: "NO",
  norway: "NO",
  par: "PY",
  paraguay: "PY",
  per: "PE",
  peru: "PE",
  pol: "PL",
  poland: "PL",
  por: "PT",
  portugal: "PT",
  qat: "QA",
  qatar: "QA",
  rou: "RO",
  romania: "RO",
  rus: "RU",
  russia: "RU",
  sco: "GB",
  scotland: "GB",
  srb: "RS",
  serbia: "RS",
  svk: "SK",
  slovakia: "SK",
  svn: "SI",
  slovenia: "SI",
  rsa: "ZA",
  "south africa": "ZA",
  ksa: "SA",
  swe: "SE",
  "south korea": "KR",
  spain: "ES",
  sweden: "SE",
  sui: "CH",
  switzerland: "CH",
  tur: "TR",
  turkey: "TR",
  ukr: "UA",
  ukraine: "UA",
  uru: "UY",
  uruguay: "UY",
  usa: "US",
  "united states": "US",
  "united kingdom": "GB",
  wales: "GB",
  "ivory coast": "CI",
  tunis: "TN",
});
const scoutingLeagueQualityProfiles = Object.freeze([
  { patterns: ["nwsl", "wsl", "women's super league", "fa women's super league", "ligue 1", "ligue i"], factor: 1 },
  { patterns: ["superliga", "d1", "division 1", "ligue 1 feminine", "damallsvenskan", "bundesliga", "serie a", "süper lig", "seriea"], factor: 0.98 },
  { patterns: ["scotland swpl", "women's cup", "cup", "playoff", "division 2", "second division", "u23"], factor: 0.9 },
]);
const scoutingDefaultLeagueQualityFactor = 1;
const scoutingLeagueQualityFactorBounds = Object.freeze({
  min: 0.6,
  max: 1.25,
});
const scoutingWorkflowStatusOptions = Object.freeze([
  { value: "new", label: "Longlist" },
  { value: "monitoring", label: "Monitoring" },
  { value: "shortlist", label: "Shortlist" },
  { value: "contacted", label: "Contacted" },
  { value: "negotiation", label: "Negotiation" },
  { value: "signed", label: "Signed" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
]);
const scoutingProfileTabs = Object.freeze([
  { value: "overview", label: "Overview" },
  { value: "performance", label: "Performance" },
  { value: "squad", label: "Squad fit" },
  { value: "market", label: "Market" },
  { value: "contacts", label: "Contacts" },
  { value: "reports", label: "Reports" },
  { value: "history", label: "History" },
]);
let scoutingEventDeps = null;
let scoutingListsActions = null;
let scoutingMyTeamActions = null;
function setScoutingContext(context) {
  activeContext = context;
  scoutingTabs = context.tabs || [];
  scoutingShadowSlots = context.shadowSlots || [];
  scoutingCoreMetricOptions = context.coreMetricOptions || [];
  scoutingStatusOptions = context.scoutingStatusOptions || scoutingStatusFallbackOptions;
  scoutingPriorityOptions = context.scoutingPriorityOptions || scoutingPriorityFallbackOptions;
}
function ensureScoutingState() {
  const state = activeContext.ensureState();
  hydrateScoutingDurableState(state);
  return state;
}
function writeScoutingState(options = {}) {
  const perf = startScoutingPerformance("state.write", {
    syncCentral: options.syncCentral !== false,
    syncShadowBoard: options.syncShadowBoard !== false,
  });
  try {
    if (options.syncShadowBoard !== false) {
      const previousHydrationState = scoutingDurableHydrating;
      scoutingDurableHydrating = true;
      try {
        syncScoutingActiveShadowBoard();
      } finally {
        scoutingDurableHydrating = previousHydrationState;
      }
    }
    const result = activeContext.writeState(options);
    persistScoutingDurableState(activeContext.ensureState());
    return result;
  } finally {
    perf.end();
  }
}
let scoutingDeferredStateWriteTimer = 0;
function deferScoutingStateWrite(options = {}, beforeWrite = null, delayMs = 120) {
  window.clearTimeout(scoutingDeferredStateWriteTimer);
  scoutingDeferredStateWriteTimer = window.setTimeout(() => {
    scoutingDeferredStateWriteTimer = 0;
    if (typeof beforeWrite === "function") {
      beforeWrite();
    }
    writeScoutingState(options);
  }, Math.max(0, Math.floor(Number(delayMs) || 0)));
}
function canEditScoutingWorkspace() {
  return activeContext.canEdit();
}
function startScoutingPerformance(label, detail = {}) {
  return scoutingPerformanceMonitor.start(label, detail);
}
function recordScoutingPerformance(label, detail = {}) {
  return scoutingPerformanceMonitor.record(label, detail);
}
function escapeHtml(value) {
  return activeContext.escapeHtml(value);
}
function getScoutingWorkspaceTitle() {
  return normalizeScoutingText(activeContext?.teamName) || "Shadow XI and recruitment intelligence";
}
function normalizeScoutingText(value, maxLength = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function normalizeScoutingIdentityPart(value = "", maxLength = 160) {
  return normalizeScoutingText(value, maxLength)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeScoutingDateValue(value = "") {
  const raw = normalizeScoutingText(value, 40);
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
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return raw;
}
function normalizeScoutingShadowBoardVisibility(value = "") {
  const normalized = normalizeScoutingText(value, 40).toLowerCase();
  return ["private", "colleague", "team", "all"].includes(normalized) ? normalized : "private";
}
function getScoutingShadowBoardVisibilityOptions() {
  return [
    { value: "private", label: "Only me" },
    { value: "colleague", label: "Shared with colleague" },
    { value: "team", label: "Shared with team" },
    { value: "all", label: "Shared with all" },
  ];
}
function getScoutingShadowBoardVisibilityLabel(value = "") {
  const normalized = normalizeScoutingShadowBoardVisibility(value);
  return getScoutingShadowBoardVisibilityOptions().find((option) => option.value === normalized)?.label || "Only me";
}
function cloneScoutingShadowSlotMap(slots = {}) {
  return Object.fromEntries(
    Object.entries(slots && typeof slots === "object" ? slots : {})
      .map(([slotId, recordIds]) => [normalizeScoutingText(slotId, 40), normalizeScoutingRecordIds(Array.isArray(recordIds) ? recordIds : recordIds ? [recordIds] : [])])
      .filter(([slotId, recordIds]) => slotId && recordIds.length)
  );
}
function cloneScoutingShadowMetaMap(meta = {}) {
  return Object.fromEntries(
    Object.entries(meta && typeof meta === "object" ? meta : {})
      .map(([key, value]) => [normalizeScoutingText(key, 220), value && typeof value === "object" ? { ...value } : {}])
      .filter(([key]) => key)
  );
}
function cloneScoutingShadowPositionMap(positions = {}) {
  return Object.fromEntries(
    Object.entries(positions && typeof positions === "object" ? positions : {})
      .map(([formation, formationPositions]) => [
        normalizeScoutingFormation(formation),
        Object.fromEntries(
          Object.entries(formationPositions && typeof formationPositions === "object" ? formationPositions : {})
            .map(([slotId, value]) => {
              const x = Number(value?.x);
              const y = Number(value?.y);
              return [normalizeScoutingText(slotId, 40), { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 }];
            })
            .filter(([slotId]) => slotId)
        ),
      ])
      .filter(([formation]) => formation)
  );
}
function buildScoutingShadowBoardFromCurrent(state = ensureScoutingState(), base = {}) {
  const now = new Date().toISOString();
  const id = normalizeScoutingText(base.id || state.shadowXi?.activeBoardId, 100) || "default-shadow-xi";
  return {
    id,
    name: normalizeScoutingText(base.name, 100) || "My Shadow XI",
    visibility: normalizeScoutingShadowBoardVisibility(base.visibility),
    ownerName: normalizeScoutingText(base.ownerName, 120) || "You",
    formation: normalizeScoutingFormation(state.shadowXi?.formation),
    slots: cloneScoutingShadowSlotMap(state.shadowXi?.slots),
    positions: cloneScoutingShadowPositionMap(state.shadowXi?.positions),
    meta: cloneScoutingShadowMetaMap(state.shadowXi?.meta),
    createdAt: normalizeScoutingText(base.createdAt, 40) || now,
    updatedAt: now,
  };
}
function getScoutingShadowBoards(state = ensureScoutingState()) {
  const sourceBoards = Array.isArray(state.shadowXi?.boards) ? state.shadowXi.boards : [];
  const boards = sourceBoards
    .map((board) => ({
      id: normalizeScoutingText(board?.id, 100),
      name: normalizeScoutingText(board?.name, 100) || "Shadow XI",
      visibility: normalizeScoutingShadowBoardVisibility(board?.visibility),
      ownerName: normalizeScoutingText(board?.ownerName, 120) || "You",
      formation: normalizeScoutingFormation(board?.formation),
      slots: cloneScoutingShadowSlotMap(board?.slots),
      positions: cloneScoutingShadowPositionMap(board?.positions),
      meta: cloneScoutingShadowMetaMap(board?.meta),
      createdAt: normalizeScoutingText(board?.createdAt, 40) || new Date().toISOString(),
      updatedAt: normalizeScoutingText(board?.updatedAt, 40) || normalizeScoutingText(board?.createdAt, 40) || new Date().toISOString(),
    }))
    .filter((board) => board.id);
  const activeId = normalizeScoutingText(state.shadowXi?.activeBoardId, 100) || boards[0]?.id || "default-shadow-xi";
  if (!boards.some((board) => board.id === activeId)) {
    boards.unshift(buildScoutingShadowBoardFromCurrent(state, { id: activeId, name: "My Shadow XI" }));
  }
  return boards;
}
function syncScoutingActiveShadowBoard() {
  const state = ensureScoutingState();
  if (!state?.shadowXi) {
    return;
  }
  const activeId = normalizeScoutingText(state.shadowXi.activeBoardId, 100) || "default-shadow-xi";
  const boards = getScoutingShadowBoards(state);
  const existing = boards.find((board) => board.id === activeId);
  const activeBoard = buildScoutingShadowBoardFromCurrent(state, existing || { id: activeId, name: "My Shadow XI" });
  state.shadowXi.activeBoardId = activeBoard.id;
  state.shadowXi.boards = boards.map((board) => (board.id === activeBoard.id ? activeBoard : board));
  if (!state.shadowXi.boards.some((board) => board.id === activeBoard.id)) {
    state.shadowXi.boards.unshift(activeBoard);
  }
}
function setScoutingActiveShadowBoard(boardId) {
  const state = ensureScoutingState();
  syncScoutingActiveShadowBoard();
  const board = getScoutingShadowBoards(state).find((item) => item.id === normalizeScoutingText(boardId, 100));
  if (!board) {
    return;
  }
  state.shadowXi.activeBoardId = board.id;
  state.shadowXi.formation = board.formation || "4-3-3";
  state.shadowXi.slots = cloneScoutingShadowSlotMap(board.slots);
  state.shadowXi.positions = cloneScoutingShadowPositionMap(board.positions);
  state.shadowXi.meta = cloneScoutingShadowMetaMap(board.meta);
  state.shadowXi.selectedSlotId = "";
  writeScoutingState({ syncShadowBoard: false });
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true });
}
function createScoutingShadowBoard(name = "") {
  const state = ensureScoutingState();
  if (!canEditScoutingWorkspace()) {
    return;
  }
  syncScoutingActiveShadowBoard();
  const boards = getScoutingShadowBoards(state);
  const now = new Date().toISOString();
  const board = {
    id: `shadow-xi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: normalizeScoutingText(name, 100) || `Shadow XI ${boards.length + 1}`,
    visibility: "private",
    ownerName: "You",
    formation: normalizeScoutingFormation(state.shadowXi?.formation),
    slots: {},
    positions: {},
    meta: {},
    createdAt: now,
    updatedAt: now,
  };
  state.shadowXi.boards = [...boards, board];
  state.shadowXi.activeBoardId = board.id;
  state.shadowXi.formation = board.formation;
  state.shadowXi.slots = {};
  state.shadowXi.positions = {};
  state.shadowXi.meta = {};
  state.shadowXi.selectedSlotId = "";
  writeScoutingState({ syncShadowBoard: false });
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true });
}
function setScoutingShadowBoardVisibility(boardId, visibility) {
  const state = ensureScoutingState();
  if (!canEditScoutingWorkspace()) {
    return;
  }
  syncScoutingActiveShadowBoard();
  const id = normalizeScoutingText(boardId, 100);
  state.shadowXi.boards = getScoutingShadowBoards(state).map((board) =>
    board.id === id
      ? {
          ...board,
          visibility: normalizeScoutingShadowBoardVisibility(visibility),
          updatedAt: new Date().toISOString(),
        }
      : board
  );
  writeScoutingState({ syncShadowBoard: false });
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true });
}

function normalizeScoutingLeague(value = "") {
  const normalized = normalizeScoutingText(value, 180);
  if (!normalized) {
    return "";
  }
  const fixedCountry = normalized.replace(/^scottland\b/i, "Scotland").replace(/\bSWPL\s*\d+\b/i, "SWPL").trim();
  if (/^Scotland\s+SWPL\b/i.test(fixedCountry)) {
    return "Scotland SWPL";
  }
  return fixedCountry;
}
function getScoutingLeagueQualityFactor(value = "") {
  const normalized = normalizeScoutingLeague(value).toLowerCase();
  if (!normalized) {
    return scoutingDefaultLeagueQualityFactor;
  }
  if (scoutingLeagueQualityCache.has(normalized)) {
    return scoutingLeagueQualityCache.get(normalized);
  }
  const profile = scoutingLeagueQualityProfiles.find((item) => item.patterns.some((pattern) => normalized.includes(pattern)));
  const factor = profile ? profile.factor : scoutingDefaultLeagueQualityFactor;
  scoutingLeagueQualityCache.set(normalized, factor);
  return factor;
}
function getScoutingLeagueQualityFactorForMetric(record, metricId, benchmarkMode = "position") {
  const leagueFactor = getScoutingLeagueQualityFactor(getScoutingRecordLeague(record));
  const normalizedMode = normalizeScoutingBenchmarkMode(benchmarkMode);
  const sampleMode = normalizedMode === "all" ? "position" : normalizedMode || "position";
  const sample = getScoutingBenchmarkSampleSize(record, metricId, sampleMode);
  const sampleFactor = Number.isFinite(sample)
    ? sample >= 40
      ? 1
      : sample >= 24
        ? 0.93
        : sample >= 16
          ? 0.88
          : sample >= 10
            ? 0.82
            : sample >= 6
              ? 0.76
              : 0.7
    : 0.7;
  return Math.max(scoutingLeagueQualityFactorBounds.min, Math.min(scoutingLeagueQualityFactorBounds.max, leagueFactor * sampleFactor));
}
function getScoutingLeagueAdjustedPercentile(record, metricId) {
  const percentile = getScoutingBenchmarkPercentile(record, metricId, "position", "metric");
  if (!Number.isFinite(percentile)) {
    return null;
  }
  const factor = getScoutingLeagueQualityFactorForMetric(record, metricId, "position");
  return applyScoutingLeagueQualityDampening(percentile, record, factor);
}
function applyScoutingLeagueQualityDampening(percentile, record, factor = null) {
  if (!Number.isFinite(percentile)) {
    return null;
  }
  const safeFactor = Number.isFinite(factor)
    ? Math.max(scoutingLeagueQualityFactorBounds.min, Math.min(scoutingLeagueQualityFactorBounds.max, factor))
    : Math.max(scoutingLeagueQualityFactorBounds.min, Math.min(scoutingLeagueQualityFactorBounds.max, getScoutingLeagueQualityFactor(getScoutingRecordLeague(record))));
  return Math.max(1, Math.min(99, Math.round(50 + (percentile - 50) * safeFactor)));
}
function getScoutingImportLastUploadSummary() {
  try {
    const raw = window.localStorage?.getItem(scoutingImportLastUploadStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function setScoutingImportLastUploadSummary(summary = {}) {
  if (!window.localStorage) {
    return;
  }
  try {
    const safe = typeof summary === "object" && summary ? summary : {};
    window.localStorage.setItem(scoutingImportLastUploadStorageKey, JSON.stringify(safe));
  } catch {}
}
function formatScoutingImportSummaryStatus(summary = {}) {
  if (summary.status === "published") {
    return "Published";
  }
  if (summary.status === "failed") {
    return "Failed";
  }
  if (summary.status === "importing" || summary.status === "started") {
    return "Uploading";
  }
  return "Pending";
}
function formatScoutingImportSummaryDate(value = "") {
  const stamp = normalizeScoutingText(value, 120);
  if (!stamp) {
    return "";
  }
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function getScoutingImportLastUploadMarkup() {
  const summary = scoutingImportDraft?.lastUploadSummary || getScoutingImportLastUploadSummary();
  if (!summary || (!summary.status && !summary.fileName)) {
    return `
      <div class="scouting-import-last-upload">
        <span>Latest scouting player database upload</span>
        <strong>No uploads yet</strong>
      </div>
    `;
  }
  const uploadedAt = formatScoutingImportSummaryDate(summary.updatedAt || summary.createdAt || summary.startedAt);
  const rows = Number.isFinite(Number(summary.rowCount)) ? Number(summary.rowCount).toLocaleString("en-US") : "0";
  const metrics = Number.isFinite(Number(summary.metricCount)) ? Number(summary.metricCount).toLocaleString("en-US") : "0";
  const status = formatScoutingImportSummaryStatus(summary);
  const databaseStored = summary.databaseStored ? " · Database updated" : summary.databaseStored === false ? " · Local only" : "";
  const sourceFile = normalizeScoutingText(summary.fileName || "", 140) || "Unknown file";
  const batch = normalizeScoutingText(summary.batchId || "", 110);
  const batchText = batch ? ` · batch ${batch}` : "";
  return `
    <div class="scouting-import-last-upload">
      <span>${escapeHtml("Latest scouting player database upload")}</span>
      <strong>${escapeHtml(sourceFile)}</strong>
      <p>${escapeHtml(`${status}${uploadedAt ? ` · ${uploadedAt}` : ""} · ${rows} rows · ${metrics} metrics${databaseStored}${batchText}`)}</p>
    </div>
  `;
}
function normalizeScoutingRecordIds(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeScoutingText(value, 160))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}
function normalizeScoutingPlayerSnapshot(snapshot = {}) {
  const recordId = normalizeScoutingText(snapshot.recordId || snapshot.id, 160);
  if (!recordId) {
    return null;
  }
  return {
    recordId,
    name: normalizeScoutingText(snapshot.name, 180),
    club: normalizeScoutingText(snapshot.club || snapshot.team, 180),
    position: normalizeScoutingText(snapshot.position, 120),
    age: normalizeScoutingText(snapshot.age, 20),
    minutes: normalizeScoutingText(snapshot.minutes, 24),
    birthCountry: normalizeScoutingText(snapshot.birthCountry, 120),
    passportCountry: normalizeScoutingText(snapshot.passportCountry || snapshot.nationality, 120),
    nationalityCode: normalizeScoutingText(snapshot.nationalityCode, 20),
    nationalityLabel: normalizeScoutingText(snapshot.nationalityLabel, 120),
    dateOfBirth: normalizeScoutingText(snapshot.dateOfBirth, 40),
    height: normalizeScoutingText(snapshot.height, 40),
    weight: normalizeScoutingText(snapshot.weight, 40),
    imageUrl: normalizeScoutingText(snapshot.imageUrl, 300),
    league: normalizeScoutingText(snapshot.league, 180),
    season: normalizeScoutingText(snapshot.season, 80),
    bestRole: normalizeScoutingText(snapshot.bestRole || snapshot.role, 120),
    fit: normalizeScoutingText(snapshot.fit, 40),
    signalLabel: normalizeScoutingText(snapshot.signalLabel, 120),
    signalPercentile: normalizeScoutingText(snapshot.signalPercentile, 20),
    summary: normalizeScoutingText(snapshot.summary, 700),
    facts: (Array.isArray(snapshot.facts) ? snapshot.facts : [])
      .map(normalizeScoutingPlayerSnapshotFact)
      .filter(Boolean)
      .slice(0, 14),
    metrics: (Array.isArray(snapshot.metrics) ? snapshot.metrics : [])
      .map(normalizeScoutingPlayerSnapshotMetric)
      .filter(Boolean)
      .slice(0, 12),
    updatedAt: normalizeScoutingText(snapshot.updatedAt, 40) || new Date().toISOString(),
  };
}
function normalizeScoutingPlayerSnapshotFact(fact = {}) {
  const label = normalizeScoutingText(fact.label || fact.key, 80);
  const value = normalizeScoutingText(fact.value ?? fact.text, 220);
  if (!label || !value) {
    return null;
  }
  return {
    label,
    value,
    tone: normalizeScoutingText(fact.tone, 40),
  };
}
function normalizeScoutingPlayerSnapshotMetric(metric = {}) {
  const label = normalizeScoutingText(metric.label || metric.name, 120);
  const value = normalizeScoutingText(metric.value ?? metric.rawValue, 80);
  const percentile = normalizeScoutingText(metric.percentile ?? metric.score, 20);
  if (!label || (!value && !percentile)) {
    return null;
  }
  return {
    label,
    value,
    percentile,
    quality: normalizeScoutingText(metric.quality, 40),
    group: normalizeScoutingText(metric.group || metric.profile, 120),
  };
}
function getScoutingPlayerSnapshots(state = null) {
  const sourceState = state || (activeContext ? ensureScoutingState() : null);
  const snapshots = sourceState?.playerSnapshots && typeof sourceState.playerSnapshots === "object" ? sourceState.playerSnapshots : {};
  return Object.fromEntries(
    Object.values(snapshots)
      .map(normalizeScoutingPlayerSnapshot)
      .filter(Boolean)
      .map((snapshot) => [snapshot.recordId, snapshot])
  );
}
function formatScoutingSnapshotPhysicalValue(value, unit) {
  const text = normalizeScoutingText(value, 40);
  if (!text) {
    return "";
  }
  return /[a-z]/i.test(text) ? text : `${text} ${unit}`;
}
function formatScoutingSnapshotMetricValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return formatScoutingNumber(value, "");
}
function createScoutingSnapshotFacts(record, options = {}) {
  const minutes = getScoutingRecordMinutes(record);
  const age = getScoutingRecordAge(record);
  const nationality = options.nationality || getScoutingRecordNationalityMeta(record);
  const leagueSeason = [getScoutingRecordLeague(record), getScoutingRecordSeason(record)].filter(Boolean).join(" / ");
  return [
    { label: "Club", value: getScoutingRecordTeam(record) },
    { label: "Position", value: getScoutingRecordPosition(record) },
    { label: "Age", value: Number.isFinite(age) ? `${formatScoutingNumber(age)} yrs` : "" },
    { label: "Nationality", value: [nationality.code, nationality.label].filter(Boolean).join(" / ") },
    { label: "League", value: leagueSeason },
    { label: "Minutes", value: minutes ? formatScoutingNumber(minutes) : "" },
    { label: "Best role", value: options.bestRole || "" },
    { label: "Role fit", value: Number.isFinite(options.roleFit) ? `P${Math.round(options.roleFit)}` : "" },
    { label: "Date of birth", value: getScoutingRecordDateOfBirth(record) },
    { label: "Height", value: formatScoutingSnapshotPhysicalValue(record?.[scoutingRecordIndex.height], "cm") },
    { label: "Weight", value: formatScoutingSnapshotPhysicalValue(record?.[scoutingRecordIndex.weight], "kg") },
  ].map(normalizeScoutingPlayerSnapshotFact).filter(Boolean);
}
function createScoutingSnapshotMetrics(record, template = [], signal = null) {
  const profileLabel = normalizeScoutingText(template.profileLabel, 120) || getScoutingRecordBestRoleLabel(record);
  const rows = getScoutingRoleMetricRows(record, template)
    .filter((row) => Number.isFinite(row.percentile))
    .sort((first, second) => (second.weightedScore || 0) - (first.weightedScore || 0))
    .slice(0, 8)
    .map((row) => ({
      label: row.metric?.label || row.label || row.metricId,
      value: formatScoutingSnapshotMetricValue(row.value),
      percentile: String(Math.round(row.percentile)),
      quality: row.quality,
      group: profileLabel,
    }));
  const bestSignal = signal && Number.isFinite(signal.percentile)
    ? [
        {
          label: signal.metric?.label || "Best signal",
          value: formatScoutingSnapshotMetricValue(signal.value),
          percentile: String(Math.round(signal.percentile)),
          quality: signal.quality,
          group: "Best signal",
        },
      ]
    : [];
  const signalLabel = normalizeScoutingText(bestSignal[0]?.label, 120).toLowerCase();
  return [...bestSignal, ...rows.filter((row) => normalizeScoutingText(row.label, 120).toLowerCase() !== signalLabel)]
    .map(normalizeScoutingPlayerSnapshotMetric)
    .filter(Boolean)
    .slice(0, 12);
}
function createScoutingPlayerSnapshot(record, options = {}) {
  if (!record) {
    return null;
  }
  const recordId = getScoutingRecordId(record);
  if (!recordId) {
    return null;
  }
  const includeAnalysis = options.includeAnalysis !== false;
  const roleFit = includeAnalysis ? getScoutingRoleFitScore(record) : null;
  const signal = includeAnalysis ? getScoutingBestSignal(record) : null;
  const template = includeAnalysis ? getScoutingRadarTemplate(record) : [];
  const bestRole = includeAnalysis ? getScoutingRecordBestRoleLabel(record) : "";
  const nationality = getScoutingRecordNationalityMeta(record);
  const signalPercentile = Number.isFinite(signal?.percentile) ? Math.round(signal.percentile) : null;
  const summary = includeAnalysis
    ? [
        bestRole ? `Best role: ${bestRole}` : "",
        Number.isFinite(roleFit) ? `Role fit P${Math.round(roleFit)}` : "",
        signal?.metric?.label && Number.isFinite(signalPercentile) ? `Best signal: ${signal.metric.label} P${signalPercentile}` : "",
      ].filter(Boolean).join(". ")
    : "";
  return normalizeScoutingPlayerSnapshot({
    recordId,
    name: getScoutingRecordName(record),
    club: getScoutingRecordTeam(record),
    position: getScoutingRecordPosition(record),
    age: String(getScoutingRecordAge(record) || ""),
    minutes: String(getScoutingRecordMinutes(record) || ""),
    birthCountry: getScoutingRecordBirthCountry(record),
    passportCountry: getScoutingRecordPassportCountry(record),
    nationalityCode: nationality.code,
    nationalityLabel: nationality.label,
    dateOfBirth: getScoutingRecordDateOfBirth(record),
    height: formatScoutingSnapshotPhysicalValue(record?.[scoutingRecordIndex.height], "cm"),
    weight: formatScoutingSnapshotPhysicalValue(record?.[scoutingRecordIndex.weight], "kg"),
    imageUrl: getScoutingRecordImageUrl(record),
    league: getScoutingRecordLeague(record),
    season: getScoutingRecordSeason(record),
    bestRole,
    fit: Number.isFinite(roleFit) ? `P${roleFit}` : "",
    signalLabel: signal?.metric?.label || "",
    signalPercentile: Number.isFinite(signalPercentile) ? String(signalPercentile) : "",
    summary,
    facts: createScoutingSnapshotFacts(record, { nationality, bestRole, roleFit }),
    metrics: includeAnalysis ? createScoutingSnapshotMetrics(record, template, signal) : [],
  });
}
function mergeScoutingSnapshotValue(value, previousValue) {
  if (Array.isArray(value)) {
    return value.length ? value : Array.isArray(previousValue) ? previousValue : [];
  }
  return value || previousValue || "";
}
function rememberScoutingRecordSnapshot(record, state = ensureScoutingState(), options = {}) {
  const snapshot = createScoutingPlayerSnapshot(record, options);
  if (!snapshot) {
    return null;
  }
  const snapshots = getScoutingPlayerSnapshots(state);
  const previous = snapshots[snapshot.recordId] || {};
  state.playerSnapshots = {
    ...snapshots,
    [snapshot.recordId]: Object.fromEntries(
      Object.entries({
        ...previous,
        ...snapshot,
        updatedAt: new Date().toISOString(),
      }).map(([key, value]) => [key, mergeScoutingSnapshotValue(value, previous[key])])
    ),
  };
  return state.playerSnapshots[snapshot.recordId];
}
function getScoutingRecordSnapshot(recordId, state = null) {
  const id = normalizeScoutingText(recordId, 160);
  return id ? getScoutingPlayerSnapshots(state)[id] || null : null;
}
function getScoutingSnapshotFallbackRecord(recordId, state = null) {
  const snapshot = getScoutingRecordSnapshot(recordId, state);
  if (!snapshot) {
    return null;
  }
  const record = [];
  record[scoutingRecordIndex.id] = snapshot.recordId;
  record[scoutingRecordIndex.player] = snapshot.name || "Saved player";
  record[scoutingRecordIndex.team] = snapshot.club || "";
  record[scoutingRecordIndex.teamWithinTimeframe] = snapshot.club || "";
  record[scoutingRecordIndex.league] = snapshot.league || "";
  record[scoutingRecordIndex.season] = snapshot.season || "";
  record[scoutingRecordIndex.position] = snapshot.position || "";
  record[scoutingRecordIndex.age] = snapshot.age || "";
  record[scoutingRecordIndex.matches] = "";
  record[scoutingRecordIndex.minutes] = snapshot.minutes || 0;
  record[scoutingRecordIndex.birthCountry] = snapshot.birthCountry || "";
  record[scoutingRecordIndex.passportCountry] = snapshot.passportCountry || "";
  record[scoutingRecordIndex.imageUrl] = snapshot.imageUrl || "";
  record[scoutingRecordIndex.metrics] = {};
  return record;
}
function resetScoutingComputedCaches() {
  scoutingPercentileCache = new Map();
  scoutingRecordMiniRadarCache = new Map();
  scoutingRecordSearchCorpusCache = new Map();
  scoutingMetricAliasCache = new Map();
  scoutingRoleProfileCache = new Map();
  scoutingRecordIntelligenceCache = new Map();
  scoutingMetricIndexCache = { database: null, byId: new Map() };
  scoutingRecordIdLookupCache = new Map();
  scoutingRecordNameLookupCache = new Map();
  scoutingRecordPersonLookupCache = new Map();
  scoutingRecordLookupFingerprint = "";
  scoutingMarketIntelVersion = 0;
  scoutingProfileApiCache = new Map();
  scoutingFootballScienceDbProfileCache = new Map();
  scoutingProfileOverviewPanelHydrateInProgress.clear();
  scoutingDataQualitySummaryCache = { key: "", value: null };
  scoutingFilteredDatabaseNavigationCache = {
    key: "",
    ids: [],
    indexById: new Map(),
  };
  scoutingFilteredDatabaseCache = {
    key: "",
    records: [],
  };
}

function hydrateScoutingFilteredDatabaseNavigationCache(records = [], cacheKey = "") {
  if (!Array.isArray(records) || !cacheKey) {
    scoutingFilteredDatabaseNavigationCache = {
      key: cacheKey || "",
      ids: [],
      indexById: new Map(),
    };
    return scoutingFilteredDatabaseNavigationCache;
  }
  if (scoutingFilteredDatabaseNavigationCache.key === cacheKey) {
    return scoutingFilteredDatabaseNavigationCache;
  }
  const indexById = new Map();
  const ids = [];
  for (let i = 0; i < records.length; i += 1) {
    const recordId = getScoutingRecordId(records[i]);
    if (!recordId) {
      continue;
    }
    if (indexById.has(recordId)) {
      continue;
    }
    indexById.set(recordId, ids.length);
    ids.push(recordId);
  }
  scoutingFilteredDatabaseNavigationCache = {
    key: cacheKey,
    ids,
    indexById,
  };
  return scoutingFilteredDatabaseNavigationCache;
}

function touchScoutingIntelligenceCache() {
  scoutingIntelligenceCacheVersion += 1;
  scoutingRecordIntelligenceCache = new Map();
}
function cloneScoutingList(list = {}) {
  const name = normalizeScoutingText(list.name, 80) || "Scouting List";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: normalizeScoutingText(list.id, 120) || `scouting-list-${slug || "list"}-${Date.now()}`,
    name,
    recordIds: normalizeScoutingRecordIds(list.recordIds),
  };
}
function cloneScoutingSavedView(view = {}) {
  const name = normalizeScoutingText(view.name, 80) || "Saved view";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: normalizeScoutingText(view.id, 120) || `scouting-view-${slug || "view"}-${Date.now()}`,
    name,
    filters: normalizeScoutingDatabaseFilters(view.filters),
    createdAt: normalizeScoutingText(view.createdAt, 40) || new Date().toISOString(),
  };
}
function cloneScoutingTargetState(target = {}) {
  return {
    id: normalizeScoutingText(target.id, 120) || `scouting-target-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recordId: normalizeScoutingText(target.recordId, 160),
    name: normalizeScoutingText(target.name, 180),
    club: normalizeScoutingText(target.club, 180),
    position: normalizeScoutingText(target.position, 80),
    age: normalizeScoutingText(target.age, 20),
    status: normalizeScoutingTargetStatus(target.status),
    priority: normalizeScoutingTargetPriority(target.priority),
    fit: normalizeScoutingText(target.fit, 40),
    notes: normalizeScoutingText(target.notes, 900),
    slotId: normalizeScoutingText(target.slotId, 40),
    owner: normalizeScoutingText(target.owner, 80),
    nextAction: normalizeScoutingText(target.nextAction, 220),
    nextActionDate: normalizeScoutingDateText(target.nextActionDate),
    lastContact: normalizeScoutingDateText(target.lastContact),
    decisionDeadline: normalizeScoutingDateText(target.decisionDeadline),
    createdAt: normalizeScoutingText(target.createdAt, 40) || new Date().toISOString(),
    updatedAt: normalizeScoutingText(target.updatedAt, 40) || normalizeScoutingText(target.createdAt, 40) || new Date().toISOString(),
  };
}
function cloneScoutingMarketIntelState(value = {}) {
  return Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {}).reduce((next, [recordId, info]) => {
    const id = normalizeScoutingText(recordId || info?.recordId, 160);
    if (id) {
      next[id] = normalizeScoutingMarketInfo(id, info || {});
    }
    return next;
  }, {});
}
function cloneScoutingReportsState(reports = []) {
  return Array.isArray(reports) ? reports.map(normalizeScoutingReport) : [];
}

const scoutingDurableStateStorageKey = "football-scouting-durable-state-v1";
let scoutingDurableHydrating = false;

function getScoutingDurableScopeKey() {
  const context = activeContext || {};
  const team =
    normalizeScoutingText(context.teamName, 80) ||
    normalizeScoutingText(context.teamLabel, 80) ||
    normalizeScoutingText(context.clubName, 80) ||
    "default-team";
  return normalizeScoutingText(team, 80).toLowerCase();
}

function readScoutingDurableStateStore() {
  if (!window.localStorage) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(scoutingDurableStateStorageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeScoutingDurableStateStore(store) {
  if (!window.localStorage) return;
  try {
    window.localStorage.setItem(scoutingDurableStateStorageKey, JSON.stringify(store || {}));
  } catch (error) {
    // Local storage can fail in private mode. The central write still runs.
  }
}

function mergeScoutingItemsById(currentItems = [], durableItems = [], cloneItem = (item) => item) {
  const itemsById = new Map();
  durableItems.forEach((item) => {
    const cloned = cloneItem(item);
    const id = normalizeScoutingText(cloned?.id, 160);
    if (id) itemsById.set(id, cloned);
  });
  currentItems.forEach((item) => {
    const cloned = cloneItem(item);
    const id = normalizeScoutingText(cloned?.id, 160);
    if (id) itemsById.set(id, cloned);
  });
  return Array.from(itemsById.values());
}

function cloneScoutingStateObject(value = {}) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : {};
}

function normalizeScoutingDurableStateSlice(state = {}) {
  const shadowClone =
    typeof cloneScoutingShadowXi === "function" ? cloneScoutingShadowXi(state.shadowXi || {}) : cloneScoutingStateObject(state.shadowXi);
  const myTeamClone =
    typeof cloneScoutingMyTeam === "function" ? cloneScoutingMyTeam(state.myTeam || {}) : cloneScoutingStateObject(state.myTeam);
  return {
    savedViews: Array.isArray(state.savedViews) ? state.savedViews.map(cloneScoutingSavedView) : [],
    favoriteRecordIds: normalizeScoutingRecordIds(state.favoriteRecordIds),
    contactLog: Array.isArray(state.contactLog) ? state.contactLog.map(normalizeScoutingContactLogEntry) : [],
    comparisonLab: normalizeScoutingComparisonLab(state.comparisonLab || {}),
    compareRecordIds: normalizeScoutingRecordIds(state.compareRecordIds),
    targets: Array.isArray(state.targets) ? state.targets.map(cloneScoutingTargetState) : [],
    marketIntel: cloneScoutingMarketIntelState(state.marketIntel),
    reports: cloneScoutingReportsState(state.reports),
    lists: Array.isArray(state.lists) ? state.lists.map(cloneScoutingList) : [],
    shadowXi: shadowClone,
    myTeam: myTeamClone,
    playerSnapshots: state.playerSnapshots && typeof state.playerSnapshots === "object" ? { ...state.playerSnapshots } : {},
  };
}

function hydrateScoutingDurableState(state) {
  if (!state || scoutingDurableHydrating) return state;
  scoutingDurableHydrating = true;
  try {
    const store = readScoutingDurableStateStore();
    const durable = normalizeScoutingDurableStateSlice(store[getScoutingDurableScopeKey()] || {});

    state.savedViews = mergeScoutingItemsById(
      Array.isArray(state.savedViews) ? state.savedViews : [],
      durable.savedViews,
      cloneScoutingSavedView,
    );
    state.favoriteRecordIds = normalizeScoutingRecordIds([
      ...(Array.isArray(durable.favoriteRecordIds) ? durable.favoriteRecordIds : []),
      ...(Array.isArray(state.favoriteRecordIds) ? state.favoriteRecordIds : []),
    ]);
    state.contactLog = mergeScoutingItemsById(
      Array.isArray(state.contactLog) ? state.contactLog : [],
      durable.contactLog,
      normalizeScoutingContactLogEntry,
    ).sort((a, b) => normalizeScoutingText(b.createdAt, 40).localeCompare(normalizeScoutingText(a.createdAt, 40)));
    state.lists = mergeScoutingItemsById(
      Array.isArray(state.lists) ? state.lists : [],
      durable.lists,
      cloneScoutingList,
    );
    state.compareRecordIds = normalizeScoutingRecordIds([
      ...(Array.isArray(durable.compareRecordIds) ? durable.compareRecordIds : []),
      ...(Array.isArray(state.compareRecordIds) ? state.compareRecordIds : []),
    ]).slice(0, 5);
    state.targets = mergeScoutingItemsById(
      Array.isArray(state.targets) ? state.targets : [],
      durable.targets,
      cloneScoutingTargetState,
    ).sort((a, b) => normalizeScoutingText(b.updatedAt || b.createdAt, 40).localeCompare(normalizeScoutingText(a.updatedAt || a.createdAt, 40)));
    state.reports = mergeScoutingItemsById(
      Array.isArray(state.reports) ? state.reports : [],
      durable.reports,
      normalizeScoutingReport,
    ).sort((a, b) => normalizeScoutingText(b.createdAt, 40).localeCompare(normalizeScoutingText(a.createdAt, 40)));
    state.marketIntel = {
      ...(durable.marketIntel || {}),
      ...(state.marketIntel && typeof state.marketIntel === "object" ? cloneScoutingMarketIntelState(state.marketIntel) : {}),
    };
    state.comparisonLab =
      state.comparisonLab && Array.isArray(state.comparisonLab.playerIds) && state.comparisonLab.playerIds.some(Boolean)
        ? normalizeScoutingComparisonLab(state.comparisonLab)
        : durable.comparisonLab;
    const hasShadowData =
      state.shadowXi &&
      (Object.keys(state.shadowXi.slots || {}).length ||
        Object.keys(state.shadowXi.positions || {}).length ||
        (Array.isArray(state.shadowXi.boards) && state.shadowXi.boards.length));
    const hasMyTeamData =
      state.myTeam &&
      (Object.keys(state.myTeam.slots || {}).length ||
        Object.keys(state.myTeam.positions || {}).length ||
        (Array.isArray(state.myTeam.players) && state.myTeam.players.length));
    state.shadowXi = hasShadowData ? cloneScoutingStateObject(state.shadowXi) : durable.shadowXi;
    state.myTeam = hasMyTeamData ? cloneScoutingStateObject(state.myTeam) : durable.myTeam;
    state.playerSnapshots = {
      ...(durable.playerSnapshots || {}),
      ...(state.playerSnapshots && typeof state.playerSnapshots === "object" ? state.playerSnapshots : {}),
    };
  } finally {
    scoutingDurableHydrating = false;
  }
  return state;
}

function persistScoutingDurableState(state) {
  if (!state || scoutingDurableHydrating) return;
  const store = readScoutingDurableStateStore();
  store[getScoutingDurableScopeKey()] = normalizeScoutingDurableStateSlice(state);
  writeScoutingDurableStateStore(store);
}
function normalizeScoutingDatabaseFilters(filters = {}) {
  const minMinutes = Number(filters.minMinutes);
  const maxMinutes = Number(filters.maxMinutes);
  const metricId = normalizeScoutingText(filters.metricId, 120);
  const metricIds = Array.isArray(filters.metricIds)
    ? filters.metricIds.map((item) => normalizeScoutingText(item, 120)).filter((item) => item && item !== "all")
    : metricId && metricId !== "all"
      ? [metricId]
      : [];
  return {
    query: normalizeScoutingText(filters.query, 120),
    league: normalizeScoutingLeague(filters.league) || "all",
    team: normalizeScoutingText(filters.team, 160) || "all",
    season: normalizeScoutingText(filters.season, 80) || "all",
    position: normalizeScoutingText(filters.position, 40) || "all",
    minMinutes: Number.isFinite(minMinutes) && minMinutes >= 0 ? Math.round(minMinutes) : 0,
    minMinutesIntentional: Boolean(filters.minMinutesIntentional),
    maxMinutes: Number.isFinite(maxMinutes) && maxMinutes >= 0 ? Math.round(maxMinutes) : 0,
    minAge: normalizeScoutingText(filters.minAge, 12),
    maxAge: normalizeScoutingText(filters.maxAge, 12),
    metricId: metricIds[0] || metricId || "all",
    metricIds: Array.from(new Set(metricIds)).slice(0, 20),
    metricMin: normalizeScoutingText(filters.metricMin, 12),
    roleProfileId: normalizeScoutingRoleProfileId(filters.roleProfileId, "all"),
    benchmarkMode: normalizeScoutingBenchmarkMode(filters.benchmarkMode),
    roleFitMin: normalizeScoutingText(filters.roleFitMin, 12),
    roleFloorMin: normalizeScoutingText(filters.roleFloorMin, 12),
    signalMode: normalizeScoutingText(filters.signalMode, 40) || "all",
    marketStatus: normalizeScoutingText(filters.marketStatus, 40) || "all",
    sortMetricId: normalizeScoutingText(filters.sortMetricId, 120) || "minutes",
    source: SCOUTING_STANDALONE_FSDB_DATABASE_ENABLED && normalizeScoutingText(filters.source, 40) === "fsdb" ? "fsdb" : "scouting",
    fsdbGenderSegment: normalizeFootballScienceDbGenderSegment(filters.fsdbGenderSegment || filters.genderSegment),
    fsdbCursor: normalizeScoutingText(filters.fsdbCursor, 400),
    fsdbCursorStack: Array.isArray(filters.fsdbCursorStack)
      ? filters.fsdbCursorStack.map((cursor) => normalizeScoutingText(cursor, 400)).filter(Boolean).slice(0, 50)
      : [],
    offset: Math.max(0, Math.floor(Number(filters.offset) || 0)),
  };
}
const platformModuleLoader = {
  loadScript(...args) {
    return activeContext.platformModuleLoader.loadScript(...args);
  },
};
const ui = {
  get scoutingWorkspace() {
    return activeContext.ui.scoutingWorkspace;
  },
};
function getScoutingDatabase() {
  const activeFilters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters);
  const selectedSource = activeFilters.source;
  const activeDatabase = window.__footballScienceScoutingDatabase;
  if (selectedSource === "fsdb") {
    const databaseSegment = normalizeFootballScienceDbGenderSegment(activeDatabase?.page?.genderSegment);
    if (
      activeDatabase?.source === "fsdb" &&
      activeFilters.fsdbGenderSegment &&
      databaseSegment === activeFilters.fsdbGenderSegment &&
      Array.isArray(activeDatabase.records) &&
      Array.isArray(activeDatabase.metrics)
    ) {
      rememberScoutingDatabaseRecords(activeDatabase);
      return activeDatabase;
    }
    return null;
  }
  if (!scoutingImportedDatabaseLoaded) {
    scoutingImportedDatabaseLoaded = true;
    try {
      const stored = window.localStorage?.getItem(scoutingImportedDatabaseStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.records) && Array.isArray(parsed.metrics)) {
          window.__footballScienceImportedScoutingDatabase = parsed;
        }
      }
    } catch {}
  }
  const importedDatabase = window.__footballScienceImportedScoutingDatabase;
  if (importedDatabase && Array.isArray(importedDatabase.records) && Array.isArray(importedDatabase.metrics)) {
    rememberScoutingDatabaseRecords(importedDatabase);
    return importedDatabase;
  }
  const database = activeDatabase;
  if (database?.source === "fsdb") {
    return null;
  }
  if (database && Array.isArray(database.records) && Array.isArray(database.metrics)) {
    rememberScoutingDatabaseRecords(database);
    return database;
  }
  return null;
}
function isScoutingDatabaseLoaded() {
  return Boolean(getScoutingDatabase());
}
function isScoutingApiDatabaseActive() {
  return getScoutingDatabase()?.source === "api";
}
function isScoutingWorkerDatabaseActive() {
  return getScoutingDatabase()?.source === "worker";
}
function isFootballScienceDbDatabaseActive() {
  return getScoutingDatabase()?.source === "fsdb";
}
function isScoutingPagedDatabaseActive() {
  const source = getScoutingDatabase()?.source;
  return source === "api" || source === "worker" || source === "fsdb";
}
function getScoutingAssetVersion() {
  return encodeURIComponent(window.__assetVersion || "dev");
}
function normalizeScoutingApiAccessToken(value = "") {
  const token = String(value || "").trim();
  if (!token || token.length > SCOUTING_API_ACCESS_TOKEN_MAX_LENGTH) {
    return "";
  }
  return token;
}
function normalizeFootballScienceDbGenderSegment(value = "") {
  const normalized = normalizeScoutingText(value, 20).toLowerCase();
  return SCOUTING_FSDB_GENDER_SEGMENT_OPTIONS.some((option) => option.id === normalized) ? normalized : "";
}
function getFootballScienceDbGenderSegmentOption(value = "") {
  const normalized = normalizeFootballScienceDbGenderSegment(value);
  return SCOUTING_FSDB_GENDER_SEGMENT_OPTIONS.find((option) => option.id === normalized) || null;
}
function getFootballScienceDbGenderSegmentLabel(value = "", options = {}) {
  const segment = getFootballScienceDbGenderSegmentOption(value);
  if (!segment) {
    return options.fallback || "selected";
  }
  return options.short ? segment.shortLabel : segment.label;
}
async function getScoutingApiAccessToken(options = {}) {
  if (window.platformAuthReadyPromise instanceof Promise) {
    try {
      await window.platformAuthReadyPromise;
    } catch {
      // Keep the local scouting database fallback available if auth boot is not ready.
    }
  }
  const authStore = window.platformAuthStore;
  if (typeof authStore?.getAccessToken !== "function") {
    return "";
  }
  try {
    if (options.forceRefresh && typeof authStore.refreshAccessToken === "function") {
      const refreshedToken = normalizeScoutingApiAccessToken(await authStore.refreshAccessToken());
      if (refreshedToken) {
        return refreshedToken;
      }
    }
    return normalizeScoutingApiAccessToken(await authStore.getAccessToken());
  } catch {
    return "";
  }
}
function requestScoutingSignIn() {
  const authStore = window.platformAuthStore;
  const supabase = typeof authStore?.getSupabaseClient === "function" ? authStore.getSupabaseClient() : null;
  if (typeof supabase?.auth?.signOut === "function") {
    supabase.auth.signOut({ scope: "local" }).catch(() => {}).finally(() => window.location.reload());
    return true;
  }
  if (typeof authStore?.clearCurrentUser === "function") {
    authStore.clearCurrentUser();
    window.location.reload();
    return true;
  }
  window.location.reload();
  return true;
}
function getScoutingApiQueryFromState() {
  const state = ensureScoutingState();
  const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
  const existingDatabase = getScoutingDatabase();
  const offset = getScoutingApiOffset(filters.offset);
  const includeTotal = offset === 0;
  const hasPagedMetrics =
    ["api", "worker"].includes(existingDatabase?.source) && Array.isArray(existingDatabase?.metrics) && existingDatabase.metrics.length > 0;
  return {
    action: "snapshot",
    query: filters.query || "",
    league: filters.league === "all" ? "" : filters.league,
    team: filters.team === "all" ? "" : filters.team,
    season: filters.season === "all" ? "" : filters.season,
    position: filters.position === "all" ? "" : filters.position,
    minMinutes: filters.minMinutes || 0,
    maxMinutes: filters.maxMinutes || 0,
    minAge: filters.minAge || "",
    maxAge: filters.maxAge || "",
    metricId: filters.metricIds?.[0] || filters.metricId || "",
    metricIds: Array.isArray(filters.metricIds) && filters.metricIds.length ? filters.metricIds.join(",") : "",
    metricMin: filters.metricMin || "",
    sortMetricId: filters.sortMetricId,
    offset,
    includeTotal: includeTotal ? "1" : "0",
    includeMetrics: hasPagedMetrics ? "0" : "1",
    limit: SCOUTING_API_DATABASE_PAGE_LIMIT,
  };
}
function getScoutingWorkerQueryFromState() {
  return {
    ...getScoutingApiQueryFromState(),
    includeOptions: "1",
  };
}
function shouldUseScoutingWorkerPreviewFirst(filters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters)) {
  const metricMin = Number(filters.metricMin);
  return (
    filters.source !== "fsdb" &&
    !filters.query &&
    filters.league === "all" &&
    filters.team === "all" &&
    filters.season === "all" &&
    filters.position === "all" &&
    !filters.minMinutes &&
    !filters.maxMinutes &&
    !filters.minAge &&
    !filters.maxAge &&
    (!Array.isArray(filters.metricIds) || filters.metricIds.length === 0) &&
    (!filters.metricId || filters.metricId === "all") &&
    (!Number.isFinite(metricMin) || metricMin <= 0) &&
    (!filters.roleProfileId || filters.roleProfileId === "all") &&
    !filters.roleFitMin &&
    !filters.roleFloorMin &&
    (!filters.signalMode || filters.signalMode === "all") &&
    (!filters.marketStatus || filters.marketStatus === "all") &&
    (!filters.sortMetricId || filters.sortMetricId === "minutes") &&
    getScoutingApiOffset(filters.offset) === 0
  );
}
function getScoutingApiOffset(value) {
  const offset = Math.floor(Number(value));
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}
function getScoutingDatabaseLiveSearchQuery(fallbackQuery = "") {
  const searchDraft = getScoutingDatabaseSearchDraft();
  if (searchDraft !== null) {
    return normalizeScoutingText(searchDraft, 120);
  }
  const searchInput = ui.scoutingWorkspace?.querySelector("[data-scouting-database-search-input]");
  const liveQuery = normalizeScoutingText(searchInput?.value, 120);
  return liveQuery || normalizeScoutingText(fallbackQuery, 120);
}
function getScoutingDatabasePageOffset(totalRecordCount = 0) {
  const rawOffset = getScoutingApiOffset((ensureScoutingState().databaseFilters || {}).offset);
  const total = Math.max(0, Math.floor(Number(totalRecordCount) || 0));
  if (!total) {
    return 0;
  }
  const lastPageStart = Math.max(0, Math.floor((total - 1) / SCOUTING_DATABASE_PAGE_SIZE) * SCOUTING_DATABASE_PAGE_SIZE);
  return Math.max(0, Math.min(rawOffset, lastPageStart));
}
async function fetchScoutingApi(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getScoutingApiAccessToken({ forceRefresh: attempt > 0 });
    if (!token) {
      return { ok: false, status: 401, reason: "Scouting API requires an authenticated session." };
    }
    try {
      const response = await fetch(`/api/scouting${params.toString() ? `?${params.toString()}` : ""}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const text = await response.text();
      let result = {};
      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          result = { reason: text.slice(0, 240) };
        }
      }
      if (response.status === 401 && attempt === 0) {
        continue;
      }
      if (!response.ok || result?.ok === false) {
        return {
          ok: false,
          status: response.status,
          reason: result?.reason || result?.message || `Scouting API failed (${response.status}).`,
        };
      }
      return { ok: true, status: response.status, result };
    } catch (error) {
      return { ok: false, status: 0, reason: error?.message || "Scouting API could not be reached." };
    }
  }
  return { ok: false, status: 401, reason: "Scouting API requires a fresh authenticated session." };
}
function mapScoutingPositionToFootballScienceDbGroup(position = "") {
  const normalized = normalizeScoutingText(position, 40).toUpperCase();
  if (!normalized || normalized === "ALL") return "";
  if (["GK", "G"].includes(normalized)) return "GK";
  if (["CB", "RCB", "LCB", "RB", "LB", "RWB", "LWB", "FB", "DEF"].includes(normalized)) return "DEF";
  if (["DM", "DMF", "CM", "CMF", "AM", "AMF", "MID", "MF"].includes(normalized)) return "MID";
  if (["RW", "LW", "WF", "WING"].includes(normalized)) return "WING";
  if (["CF", "ST", "FW", "F"].includes(normalized)) return "FW";
  return normalized;
}
function getFootballScienceDbQueryFromState() {
  const state = ensureScoutingState();
  const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
  return {
    action: "players",
    query: filters.query || "",
    currentTeam: filters.team === "all" ? "" : filters.team,
    currentCompetition: filters.league === "all" ? "" : filters.league,
    positionGroup: filters.position === "all" ? "" : mapScoutingPositionToFootballScienceDbGroup(filters.position),
    genderSegment: filters.fsdbGenderSegment,
    cursor: filters.fsdbCursor || "",
    includeTotal: filters.fsdbCursor ? "0" : "1",
    limit: SCOUTING_API_DATABASE_PAGE_LIMIT,
  };
}
async function fetchFootballScienceDbApi(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getScoutingApiAccessToken({ forceRefresh: attempt > 0 });
    if (!token) {
      return { ok: false, status: 401, reason: "Football Science DB requires an authenticated session." };
    }
    try {
      const response = await fetch(`/api/football-science-db${params.toString() ? `?${params.toString()}` : ""}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const text = await response.text();
      let result = {};
      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          result = { reason: text.slice(0, 240) };
        }
      }
      if (response.status === 401 && attempt === 0) {
        continue;
      }
      if (!response.ok || result?.ok === false) {
        return {
          ok: false,
          status: response.status,
          reason: result?.reason || result?.message || `Football Science DB failed (${response.status}).`,
        };
      }
      return { ok: true, status: response.status, result };
    } catch (error) {
      return { ok: false, status: 0, reason: error?.message || "Football Science DB could not be reached." };
    }
  }
  return { ok: false, status: 401, reason: "Football Science DB requires a fresh authenticated session." };
}
function calculateScoutingAgeFromBirthDate(dateOfBirth = "", birthYear = null) {
  const iso = normalizeScoutingDateValue(dateOfBirth);
  if (iso) {
    const born = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(born.getTime())) {
      const now = new Date();
      let age = now.getUTCFullYear() - born.getUTCFullYear();
      const monthDelta = now.getUTCMonth() - born.getUTCMonth();
      if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) {
        age -= 1;
      }
      return age >= 0 && age <= 90 ? age : "";
    }
  }
  const year = Number(birthYear);
  if (Number.isFinite(year) && year > 1900) {
    return new Date().getUTCFullYear() - year;
  }
  return "";
}
function getFootballScienceDbReadiness(player = {}) {
  const readiness = player?.dataReadiness && typeof player.dataReadiness === "object" && !Array.isArray(player.dataReadiness)
    ? player.dataReadiness
    : {};
  return {
    tier: normalizeScoutingText(readiness.tier, 40) || "identity_only",
    label: normalizeScoutingText(readiness.label, 80) || "Identity only",
    spiderReady: Boolean(readiness.spiderReady),
    statsReady: Boolean(readiness.statsReady),
    rosterReady: Boolean(readiness.rosterReady),
    missing: Array.isArray(readiness.missing) ? readiness.missing.map((item) => normalizeScoutingText(item, 80)).filter(Boolean) : [],
  };
}
function footballSciencePlayerToScoutingRecord(player = {}) {
  const fsdbId = normalizeScoutingText(player.fsdbId || player.id, 160);
  const name = normalizeScoutingText(player.fullName || player.name || player.displayName, 180) || "Unknown player";
  const readiness = getFootballScienceDbReadiness(player);
  const record = [];
  record[scoutingRecordIndex.id] = fsdbId ? `fsdb:${fsdbId}` : `fsdb:${Date.now()}`;
  record[scoutingRecordIndex.player] = name;
  record[scoutingRecordIndex.team] = normalizeScoutingText(player.currentTeam, 180);
  record[scoutingRecordIndex.teamWithinTimeframe] = normalizeScoutingText(player.currentTeam, 180);
  record[scoutingRecordIndex.league] = normalizeScoutingText(player.currentCompetition, 180);
  record[scoutingRecordIndex.season] = "";
  record[scoutingRecordIndex.position] = normalizeScoutingText(player.primaryPosition || player.positionGroup, 120);
  record[scoutingRecordIndex.age] = calculateScoutingAgeFromBirthDate(player.dateOfBirth, player.birthYear);
  record[scoutingRecordIndex.matches] = "";
  record[scoutingRecordIndex.minutes] = 0;
  record[scoutingRecordIndex.birthCountry] = normalizeScoutingText(player.birthCountry, 120);
  record[scoutingRecordIndex.passportCountry] = normalizeScoutingText(player.nationality, 120);
  record[scoutingRecordIndex.height] = Number.isFinite(Number(player.heightCm)) ? Number(player.heightCm) : "";
  record[scoutingRecordIndex.weight] = Number.isFinite(Number(player.weightKg)) ? Number(player.weightKg) : "";
  record[scoutingRecordIndex.metrics] = {};
  record[scoutingRecordIndex.sourceSystem] = "football-science-db";
  record[scoutingRecordIndex.playerSourceId] = fsdbId;
  record[scoutingRecordIndex.sourceRecordId] = normalizeScoutingText(player.id, 160) || fsdbId;
  record[scoutingRecordIndex.imageUrl] = "";
  record[scoutingRecordIndex.playerIdentityId] = fsdbId;
  record[scoutingRecordIndex.sourceTrace] = {
    identitySource: "football-science-db",
    footballScienceDb: {
      id: normalizeScoutingText(player.id, 160),
      fsdbId,
      nameQuality: normalizeScoutingText(player.nameQuality, 40),
      identityStatus: normalizeScoutingText(player.identityStatus, 40),
      sourcePriority: normalizeScoutingText(player.sourcePriority, 80),
      sourceConfidence: Number(player.sourceConfidence) || 0,
      dataReadiness: readiness,
      sourceLinkCount: Number(player.sourceLinkCount) || 0,
      rosterEntryCount: Number(player.rosterEntryCount) || 0,
      seasonStatCount: Number(player.seasonStatCount) || 0,
      metricCount: Number(player.metricCount) || 0,
      dedupeKeyPresent: Boolean(player.dedupeKeyPresent),
    },
  };
  record[scoutingRecordIndex.metricQuality] = {};
  record[scoutingRecordIndex.dateOfBirth] = normalizeScoutingDateValue(player.dateOfBirth);
  return record;
}
function applyFootballScienceDbDatabase(result = {}) {
  if (!Array.isArray(result.players)) {
    return null;
  }
  const existing = window.__footballScienceScoutingDatabase;
  const page = result.page && typeof result.page === "object" ? result.page : {};
  const filters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters);
  const database = {
    source: "fsdb",
    importedAt: new Date().toISOString(),
    metrics: Array.isArray(existing?.metrics) && existing.source !== "fsdb" ? existing.metrics : [],
    records: result.players.map(footballSciencePlayerToScoutingRecord),
    options: existing?.options || null,
    page: {
      mode: "fsdb",
      limit: Math.max(1, Math.floor(Number(page.limit) || SCOUTING_API_DATABASE_PAGE_LIMIT)),
      cursor: normalizeScoutingText(filters.fsdbCursor, 400),
      genderSegment: filters.fsdbGenderSegment,
      nextCursor: normalizeScoutingText(page.nextCursor, 400),
      returned: Math.max(0, Math.floor(Number(page.returned) || 0)),
      total: Number.isFinite(Number(page.total)) ? Math.max(0, Math.floor(Number(page.total))) : null,
      hasMore: Boolean(page.hasMore),
    },
  };
  window.__footballScienceScoutingDatabase = database;
  resetScoutingComputedCaches();
  rememberScoutingDatabaseRecords(database);
  queueFootballScienceDbQualityLoad();
  return database;
}
async function loadFootballScienceDbDatabase() {
  const query = getFootballScienceDbQueryFromState();
  if (!normalizeFootballScienceDbGenderSegment(query.genderSegment)) {
    throw new Error("Choose Women's or Men's players before loading Football Science DB.");
  }
  const response = await fetchFootballScienceDbApi(query);
  if (!response.ok) {
    throw new Error(response.reason || "Football Science DB is not available.");
  }
  const database = applyFootballScienceDbDatabase(response.result || {});
  if (!database) {
    throw new Error(response.result?.reason || "Football Science DB returned no players.");
  }
  return database;
}
function normalizeFootballScienceDbQualityNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}
function normalizeFootballScienceDbQualityPlayer(player = {}) {
  return {
    id: normalizeScoutingText(player.id, 160),
    fsdbId: normalizeScoutingText(player.fsdbId || player.id, 160),
    name: normalizeScoutingText(player.name, 180) || "Unknown player",
    team: normalizeScoutingText(player.team, 180),
    position: normalizeScoutingText(player.position, 80),
    genderSegment: normalizeScoutingText(player.genderSegment, 40) || "unknown",
    nationality: normalizeScoutingText(player.nationality, 120),
    nameQuality: normalizeScoutingText(player.nameQuality, 40) || "unknown",
    sourceConfidence: normalizeFootballScienceDbQualityNumber(player.sourceConfidence),
    sourceLinkCount: normalizeFootballScienceDbQualityNumber(player.sourceLinkCount),
    rosterEntryCount: normalizeFootballScienceDbQualityNumber(player.rosterEntryCount),
    metricCount: normalizeFootballScienceDbQualityNumber(player.metricCount),
    dedupeKeyPresent: Boolean(player.dedupeKeyPresent),
    reviewStatus: normalizeScoutingText(player.reviewStatus, 60),
    reviewLabel: normalizeScoutingText(player.reviewLabel, 120),
    reviewReasons: Array.isArray(player.reviewReasons)
      ? player.reviewReasons
          .map((reason) => ({
            code: normalizeScoutingText(reason?.code, 80),
            label: normalizeScoutingText(reason?.label, 160),
            priority: normalizeScoutingText(reason?.priority, 40) || "medium",
          }))
          .filter((reason) => reason.label)
          .slice(0, 8)
      : [],
  };
}
function normalizeFootballScienceDbQualitySummary(summary = {}) {
  const totals = summary?.totals && typeof summary.totals === "object" && !Array.isArray(summary.totals) ? summary.totals : {};
  const coverage = summary?.coverage && typeof summary.coverage === "object" && !Array.isArray(summary.coverage) ? summary.coverage : {};
  const counts = summary?.counts && typeof summary.counts === "object" && !Array.isArray(summary.counts) ? summary.counts : {};
  const reviewQueues = summary?.reviewQueues && typeof summary.reviewQueues === "object" && !Array.isArray(summary.reviewQueues) ? summary.reviewQueues : {};
  return {
    generatedAt: normalizeScoutingText(summary.generatedAt, 80),
    countStrategy: normalizeScoutingText(summary.countStrategy, 40) || "planned",
    totals: {
      players: normalizeFootballScienceDbQualityNumber(totals.players),
      women: normalizeFootballScienceDbQualityNumber(totals.women),
      men: normalizeFootballScienceDbQualityNumber(totals.men),
      mixed: normalizeFootballScienceDbQualityNumber(totals.mixed),
      unknownGender: normalizeFootballScienceDbQualityNumber(totals.unknownGender),
    },
    coverage: {
      profileCompleteness: normalizeFootballScienceDbQualityNumber(coverage.profileCompleteness),
      fullNamePct: normalizeFootballScienceDbQualityNumber(coverage.fullNamePct),
      dedupePct: normalizeFootballScienceDbQualityNumber(coverage.dedupePct),
      sourceLinkPct: normalizeFootballScienceDbQualityNumber(coverage.sourceLinkPct),
      rosterPct: normalizeFootballScienceDbQualityNumber(coverage.rosterPct),
      statsPct: normalizeFootballScienceDbQualityNumber(coverage.statsPct),
      spiderMetricPct: normalizeFootballScienceDbQualityNumber(coverage.spiderMetricPct),
      birthDatePct: normalizeFootballScienceDbQualityNumber(coverage.birthDatePct),
      nationalityPct: normalizeFootballScienceDbQualityNumber(coverage.nationalityPct),
      positionPct: normalizeFootballScienceDbQualityNumber(coverage.positionPct),
    },
    counts: Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, normalizeFootballScienceDbQualityNumber(value)])
    ),
    reviewQueues: {
      weakIdentity: Array.isArray(reviewQueues.weakIdentity) ? reviewQueues.weakIdentity.map(normalizeFootballScienceDbQualityPlayer) : [],
      initialNames: Array.isArray(reviewQueues.initialNames) ? reviewQueues.initialNames.map(normalizeFootballScienceDbQualityPlayer) : [],
    },
  };
}
async function loadFootballScienceDbQuality(options = {}) {
  const force = Boolean(options.force);
  if (!force && scoutingFootballScienceDbQualityCache.status === "ready" && scoutingFootballScienceDbQualityCache.summary) {
    return scoutingFootballScienceDbQualityCache.summary;
  }
  if (!force && scoutingFootballScienceDbQualityCache.promise) {
    return scoutingFootballScienceDbQualityCache.promise;
  }
  scoutingFootballScienceDbQualityCache = {
    ...scoutingFootballScienceDbQualityCache,
    status: "loading",
    error: "",
  };
  const promise = fetchFootballScienceDbApi({ action: "quality" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(response.reason || "Football Science DB quality snapshot failed.");
      }
      const summary = normalizeFootballScienceDbQualitySummary(response.result || {});
      scoutingFootballScienceDbQualityCache = { status: "ready", summary, error: "", promise: null };
      return summary;
    })
    .catch((error) => {
      scoutingFootballScienceDbQualityCache = {
        status: "error",
        summary: scoutingFootballScienceDbQualityCache.summary,
        error: error?.message || "Football Science DB quality snapshot failed.",
        promise: null,
      };
      throw error;
    });
  scoutingFootballScienceDbQualityCache.promise = promise;
  return promise;
}
function queueFootballScienceDbQualityLoad(options = {}) {
  const force = Boolean(options.force);
  if (!force && ["loading", "ready"].includes(scoutingFootballScienceDbQualityCache.status)) {
    return;
  }
  loadFootballScienceDbQuality({ force })
    .then(() => renderScoutingWorkspace({ preserveFocus: true }))
    .catch(() => renderScoutingWorkspace({ preserveFocus: true }));
}
function normalizeFootballScienceDbReview(review = {}) {
  const reasons = Array.isArray(review.reasons)
    ? review.reasons
        .map((reason) => ({
          code: normalizeScoutingText(reason?.code, 80),
          label: normalizeScoutingText(reason?.label, 180),
          priority: normalizeScoutingText(reason?.priority, 40) || "medium",
        }))
        .filter((reason) => reason.label)
        .slice(0, 12)
    : [];
  return {
    status: normalizeScoutingText(review.status, 80) || (reasons.length ? "needs_review" : "ready"),
    label: normalizeScoutingText(review.label, 140) || (reasons.length ? "Needs review" : "Ready"),
    reasons,
  };
}
function normalizeFootballScienceDbProfileList(items = [], mapper = (item) => item) {
  return (Array.isArray(items) ? items : []).map(mapper).filter(Boolean);
}
function normalizeFootballScienceDbProfile(result = {}) {
  const player = result.player && typeof result.player === "object" && !Array.isArray(result.player) ? result.player : {};
  return {
    player: {
      id: normalizeScoutingText(player.id, 160),
      fsdbId: normalizeScoutingText(player.fsdbId, 160),
      name: normalizeScoutingText(player.name || player.fullName || player.displayName, 180) || "Unknown player",
      fullName: normalizeScoutingText(player.fullName, 240),
      dateOfBirth: normalizeScoutingText(player.dateOfBirth, 40),
      birthYear: normalizeFootballScienceDbQualityNumber(player.birthYear),
      genderSegment: normalizeScoutingText(player.genderSegment, 40) || "unknown",
      nationality: normalizeScoutingText(player.nationality, 120),
      birthCountry: normalizeScoutingText(player.birthCountry, 120),
      primaryPosition: normalizeScoutingText(player.primaryPosition, 80),
      positionGroup: normalizeScoutingText(player.positionGroup, 40),
      currentTeam: normalizeScoutingText(player.currentTeam, 180),
      currentCompetition: normalizeScoutingText(player.currentCompetition, 180),
      sourceConfidence: normalizeFootballScienceDbQualityNumber(player.sourceConfidence),
      sourceLinkCount: normalizeFootballScienceDbQualityNumber(player.sourceLinkCount),
      rosterEntryCount: normalizeFootballScienceDbQualityNumber(player.rosterEntryCount),
      seasonStatCount: normalizeFootballScienceDbQualityNumber(player.seasonStatCount),
      metricCount: normalizeFootballScienceDbQualityNumber(player.metricCount),
      nameQuality: normalizeScoutingText(player.nameQuality, 40) || "unknown",
      identityStatus: normalizeScoutingText(player.identityStatus, 40) || "unverified",
      dedupeKeyPresent: Boolean(player.dedupeKeyPresent),
      dataReadiness: getFootballScienceDbReadiness(player),
    },
    review: normalizeFootballScienceDbReview(result.review || {}),
    aliases: normalizeFootballScienceDbProfileList(result.aliases, (alias) => ({
      alias: normalizeScoutingText(alias?.alias, 240),
      aliasType: normalizeScoutingText(alias?.aliasType, 40),
      sourceSystem: normalizeScoutingText(alias?.sourceSystem, 60),
      confidence: normalizeFootballScienceDbQualityNumber(alias?.confidence),
      status: normalizeScoutingText(alias?.status, 40),
    })),
    sourceLinks: normalizeFootballScienceDbProfileList(result.sourceLinks, (link) => ({
      sourceSystem: normalizeScoutingText(link?.sourceSystem, 60),
      sourceEntityId: normalizeScoutingText(link?.sourceEntityId, 180),
      sourceUrl: normalizeScoutingText(link?.sourceUrl, 600),
      confidence: normalizeFootballScienceDbQualityNumber(link?.confidence),
      verifiedStatus: normalizeScoutingText(link?.verifiedStatus, 40),
      importedAt: normalizeScoutingText(link?.importedAt, 40),
    })),
    rosters: normalizeFootballScienceDbProfileList(result.rosters, (roster) => ({
      season: normalizeScoutingText(roster?.season, 80),
      team: normalizeScoutingText(roster?.team, 180),
      competition: normalizeScoutingText(roster?.competition, 180),
      country: normalizeScoutingText(roster?.country, 120),
      position: normalizeScoutingText(roster?.position || roster?.positionGroup, 160),
      rosterStatus: normalizeScoutingText(roster?.rosterStatus, 40),
      sourceSystem: normalizeScoutingText(roster?.sourceSystem, 60),
    })),
    stats: normalizeFootballScienceDbProfileList(result.stats, (stat) => ({
      season: normalizeScoutingText(stat?.season, 80),
      team: normalizeScoutingText(stat?.team, 180),
      competition: normalizeScoutingText(stat?.competition, 180),
      position: normalizeScoutingText(stat?.position, 160),
      matches: Number.isFinite(Number(stat?.matches)) ? Number(stat.matches) : null,
      starts: Number.isFinite(Number(stat?.starts)) ? Number(stat.starts) : null,
      minutes: Number.isFinite(Number(stat?.minutes)) ? Number(stat.minutes) : 0,
      metrics: stat?.metrics && typeof stat.metrics === "object" && !Array.isArray(stat.metrics) ? stat.metrics : {},
      metricCount: normalizeFootballScienceDbQualityNumber(stat?.metricCount),
      sourceSystem: normalizeScoutingText(stat?.sourceSystem, 60),
    })),
  };
}
function getFootballScienceDbProfileCacheKeys(record = {}) {
  const recordId = getScoutingRecordId(record);
  const fsdb = getScoutingRecordFootballScienceDbMeta(record) || {};
  return [
    recordId,
    normalizeScoutingText(fsdb.id, 160),
    normalizeScoutingText(fsdb.fsdbId, 160),
    getScoutingRecordPlayerSourceId(record),
  ].filter(Boolean);
}
function getFootballScienceDbProfileCacheEntry(record = {}) {
  for (const key of getFootballScienceDbProfileCacheKeys(record)) {
    const entry = scoutingFootballScienceDbProfileCache.get(key);
    if (entry) {
      return entry;
    }
  }
  return null;
}
function setFootballScienceDbProfileCacheEntry(record = {}, entry = {}) {
  getFootballScienceDbProfileCacheKeys(record).forEach((key) => {
    scoutingFootballScienceDbProfileCache.set(key, entry);
  });
}
function getFootballScienceDbProfileQueryFromRecord(record = {}) {
  const fsdb = getScoutingRecordFootballScienceDbMeta(record) || {};
  const id = normalizeScoutingText(fsdb.id, 160);
  const fsdbId = normalizeScoutingText(fsdb.fsdbId || getScoutingRecordPlayerSourceId(record), 160);
  return {
    id: /^[0-9a-f-]{36}$/i.test(id) ? id : "",
    fsdbId,
  };
}
function registerFootballScienceDbProfileRecord(record, profile = null) {
  const recordId = getScoutingRecordId(record);
  if (!recordId) {
    return "";
  }
  scoutingKnownRecordLookupCache.set(recordId, record);
  rememberScoutingRecordSnapshot(record, ensureScoutingState(), { includeAnalysis: false });
  if (profile) {
    setFootballScienceDbProfileCacheEntry(record, { status: "ready", profile, error: "", promise: null });
  }
  return recordId;
}
function getFootballScienceDbMetricHighlights(profile = {}, limit = 6) {
  const highlights = [];
  for (const stat of profile.stats || []) {
    Object.entries(stat.metrics || {}).forEach(([key, rawValue]) => {
      const value = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue.value : rawValue;
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return;
      }
      const label = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
        ? normalizeScoutingText(rawValue.label || key, 90)
        : normalizeScoutingText(key, 90);
      highlights.push({
        label: label || "Metric",
        value: number,
        season: stat.season,
      });
    });
  }
  return highlights.slice(0, limit);
}
function renderFootballScienceDbReviewReasons(review = {}) {
  const reasons = Array.isArray(review.reasons) ? review.reasons : [];
  if (!reasons.length) {
    return `<div class="scouting-fsdb-review-pills"><span>Identity checks clear</span></div>`;
  }
  return `
    <div class="scouting-fsdb-review-pills">
      ${reasons
        .slice(0, 6)
        .map((reason) => `<span class="is-${escapeHtml(reason.priority || "medium")}">${escapeHtml(reason.label)}</span>`)
        .join("")}
    </div>
  `;
}
function renderFootballScienceDbProfileCollection(items = [], emptyLabel = "No rows yet.", renderer = () => "") {
  if (!items.length) {
    return `<p class="scouting-muted">${escapeHtml(emptyLabel)}</p>`;
  }
  return `<div class="scouting-fsdb-profile-list">${items.slice(0, 5).map(renderer).join("")}</div>`;
}
function renderFootballScienceDbHydratedProfilePanel(record, profile) {
  const player = profile.player || {};
  const review = profile.review || {};
  const readiness = player.dataReadiness || getScoutingRecordFootballScienceDbReadiness(record) || { label: "Identity only", spiderReady: false, statsReady: false };
  const metricHighlights = getFootballScienceDbMetricHighlights(profile);
  const spiderReady = Boolean(readiness.spiderReady);
  return `
    <section class="scouting-profile-section scouting-fsdb-profile" data-scouting-profile-fsdb-panel>
      <div class="scouting-panel-head">
        <div>
          <p class="placeholder-tag">Source enrichment profile</p>
          <h3>${escapeHtml(player.fullName || player.name || getScoutingRecordName(record))}</h3>
        </div>
        <span>${escapeHtml(review.label || readiness.label || "Review")}</span>
      </div>
      <div class="scouting-profile-facts">
        <span><strong>${escapeHtml(String(player.sourceLinkCount || profile.sourceLinks.length || 0))}</strong> sources</span>
        <span><strong>${escapeHtml(String(player.rosterEntryCount || profile.rosters.length || 0))}</strong> roster rows</span>
        <span><strong>${escapeHtml(String(player.seasonStatCount || profile.stats.length || 0))}</strong> stat seasons</span>
        <span><strong>${escapeHtml(String(player.metricCount || metricHighlights.length || 0))}</strong> metrics</span>
      </div>
      ${renderFootballScienceDbReviewReasons(review)}
      <div class="scouting-fsdb-profile-grid">
        <article>
          <span>Identity</span>
          <strong>${escapeHtml(readiness.label || "Identity only")}</strong>
          <p>${escapeHtml([
            player.currentTeam || "No club",
            player.currentCompetition || "No competition",
            player.nationality || player.birthCountry || "No nationality",
          ].join(" / "))}</p>
        </article>
        <article>
          <span>Football Science Spider</span>
          <strong>${escapeHtml(spiderReady ? "Ready" : "Locked")}</strong>
          <p>${escapeHtml(spiderReady ? "Enough FS DB metric depth for a Spider layer." : "Needs trusted season stats and at least four metrics.")}</p>
        </article>
      </div>
      <div class="scouting-fsdb-profile-columns">
        <section>
          <span>Sources</span>
          ${renderFootballScienceDbProfileCollection(profile.sourceLinks, "No source links attached yet.", (link) => `
            <article>
              <strong>${escapeHtml(link.sourceSystem || "source")}</strong>
              <em>${escapeHtml([link.verifiedStatus || "unverified", `${link.confidence || 0}%`].join(" / "))}</em>
              ${link.sourceUrl ? `<a href="${escapeHtml(link.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>` : `<p>${escapeHtml(link.sourceEntityId || "No source URL")}</p>`}
            </article>
          `)}
        </section>
        <section>
          <span>Roster history</span>
          ${renderFootballScienceDbProfileCollection(profile.rosters, "No roster rows yet.", (roster) => `
            <article>
              <strong>${escapeHtml(roster.season || "Unknown season")}</strong>
              <em>${escapeHtml([roster.team || "No team", roster.competition || "No competition"].join(" / "))}</em>
              <p>${escapeHtml([roster.position, roster.rosterStatus].filter(Boolean).join(" / ") || "Roster detail pending")}</p>
            </article>
          `)}
        </section>
        <section>
          <span>Season stats</span>
          ${renderFootballScienceDbProfileCollection(profile.stats, "No season stats yet.", (stat) => `
            <article>
              <strong>${escapeHtml(stat.season || "Unknown season")}</strong>
              <em>${escapeHtml([stat.team || "No team", `${Math.round(stat.minutes || 0).toLocaleString("en-US")} min`].join(" / "))}</em>
              <p>${escapeHtml(`${stat.metricCount || Object.keys(stat.metrics || {}).length} metrics${stat.position ? ` / ${stat.position}` : ""}`)}</p>
            </article>
          `)}
        </section>
      </div>
      ${
        metricHighlights.length
          ? `<div class="scouting-fsdb-metric-pills">
              ${metricHighlights.map((metric) => `<span><strong>${escapeHtml(metric.label)}</strong>${escapeHtml(formatScoutingNumber(metric.value))}</span>`).join("")}
            </div>`
          : ""
      }
    </section>
  `;
}
function renderFootballScienceDbProfilePanelIntoDom(recordId) {
  const record = getScoutingRecordById(recordId);
  if (!record) {
    return;
  }
  const modal = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]");
  if (!modal) {
    return;
  }
  const existing = modal.querySelector("[data-scouting-profile-fsdb-panel]");
  const markup = renderScoutingFootballScienceDbPanel(record);
  if (existing) {
    existing.outerHTML = markup;
  }
}
async function hydrateFootballScienceDbProfileDetails(recordId, options = {}) {
  const record = getScoutingRecordById(recordId);
  if (!record || !getScoutingRecordFootballScienceDbMeta(record)) {
    return;
  }
  const existing = getFootballScienceDbProfileCacheEntry(record);
  if (!options.force && (existing?.status === "ready" || existing?.status === "loading")) {
    renderFootballScienceDbProfilePanelIntoDom(recordId);
    return;
  }
  const query = getFootballScienceDbProfileQueryFromRecord(record);
  if (!query.id && !query.fsdbId) {
    return;
  }
  const loadingEntry = { status: "loading", profile: existing?.profile || null, error: "", promise: null };
  setFootballScienceDbProfileCacheEntry(record, loadingEntry);
  renderFootballScienceDbProfilePanelIntoDom(recordId);
  const response = await fetchFootballScienceDbApi({
    action: "profile",
    id: query.id,
    fsdbId: query.fsdbId,
  });
  if (!response.ok) {
    setFootballScienceDbProfileCacheEntry(record, {
      status: "error",
      profile: existing?.profile || null,
      error: response.reason || "Football Science DB profile could not be loaded.",
      promise: null,
    });
    renderFootballScienceDbProfilePanelIntoDom(recordId);
    return;
  }
  const profile = normalizeFootballScienceDbProfile(response.result || {});
  const hydratedRecord = footballSciencePlayerToScoutingRecord(profile.player);
  registerFootballScienceDbProfileRecord(hydratedRecord, profile);
  setFootballScienceDbProfileCacheEntry(record, { status: "ready", profile, error: "", promise: null });
  renderFootballScienceDbProfilePanelIntoDom(getScoutingRecordId(hydratedRecord) || recordId);
}
function queueFootballScienceDbProfileHydration(recordId, options = {}) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return;
  }
  const record = getScoutingRecordById(id);
  if (!record || !getScoutingRecordFootballScienceDbMeta(record)) {
    return;
  }
  window.requestAnimationFrame(() => {
    hydrateFootballScienceDbProfileDetails(id, options);
  });
}
async function openFootballScienceDbProfileFromQueue(options = {}) {
  const id = normalizeScoutingText(options.id, 160);
  const fsdbId = normalizeScoutingText(options.fsdbId, 160);
  if (!id && !fsdbId) {
    return;
  }
  const response = await fetchFootballScienceDbApi({ action: "profile", id, fsdbId });
  if (!response.ok) {
    scoutingFootballScienceDbQualityCache = {
      ...scoutingFootballScienceDbQualityCache,
      error: response.reason || "Football Science DB profile could not be opened.",
    };
    renderScoutingWorkspace({ preserveFocus: true });
    return;
  }
  const profile = normalizeFootballScienceDbProfile(response.result || {});
  const record = footballSciencePlayerToScoutingRecord(profile.player);
  const recordId = registerFootballScienceDbProfileRecord(record, profile);
  if (recordId) {
    openScoutingRecordProfile(recordId);
  }
}
async function sendScoutingApiAction(payload = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getScoutingApiAccessToken({ forceRefresh: attempt > 0 });
    if (!token) {
      return { ok: false, status: 401, reason: "Scouting API requires an authenticated session." };
    }
    try {
      const response = await fetch("/api/scouting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let result = {};
      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          result = { reason: text.slice(0, 240) };
        }
      }
      if (response.status === 401 && attempt === 0) {
        continue;
      }
      if (!response.ok || result?.ok === false) {
        return {
          ok: false,
          status: response.status,
          reason: result?.reason || result?.message || `Scouting API failed (${response.status}).`,
        };
      }
      return { ok: true, status: response.status, result };
    } catch (error) {
      return { ok: false, status: 0, reason: error?.message || "Scouting API could not be reached." };
    }
  }
  return { ok: false, status: 401, reason: "Scouting API requires a fresh authenticated session." };
}
function applyScoutingApiDatabase(result = {}) {
  const existing = getScoutingDatabase();
  if (!result.enabled || !Array.isArray(result.records)) {
    return null;
  }
  const nextMetrics = Array.isArray(result.metrics) ? result.metrics : Array.isArray(existing?.metrics) ? existing.metrics : [];
  const nextOptions = result.options || existing?.options || null;
  const database = {
    source: "api",
    importedAt: result.importedAt || new Date().toISOString(),
    metrics: nextMetrics,
    records: result.records,
    options: nextOptions,
    page: result.page || null,
  };
  window.__footballScienceScoutingDatabase = database;
  scoutingDatabaseOptionCache = null;
  resetScoutingComputedCaches();
  rememberScoutingDatabaseRecords(database);
  return database;
}
function applyScoutingWorkerDatabase(result = {}) {
  const existing = getScoutingDatabase();
  if (!Array.isArray(result.records)) {
    return null;
  }
  const database = {
    source: "worker",
    importedAt: result.importedAt || existing?.importedAt || new Date().toISOString(),
    fileName: result.fileName || existing?.fileName || "",
    sheets: Array.isArray(result.sheets) ? result.sheets : Array.isArray(existing?.sheets) ? existing.sheets : [],
    metrics: Array.isArray(result.metrics) ? result.metrics : Array.isArray(existing?.metrics) ? existing.metrics : [],
    records: result.records,
    options: result.options || existing?.options || null,
    page: result.page || null,
  };
  window.__footballScienceScoutingDatabase = database;
  scoutingDatabaseOptionCache = null;
  resetScoutingComputedCaches();
  rememberScoutingDatabaseRecords(database);
  queueScoutingWorkerRecordHydration(getScoutingCompareRecordIds());
  return database;
}
function dedupeScoutingRecords(records = [], existingIds = new Set()) {
  const deduped = [];
  const seen = new Set(existingIds);
  for (const record of Array.isArray(records) ? records : []) {
    const recordId = getScoutingRecordId(record);
    if (!recordId || seen.has(recordId)) {
      continue;
    }
    seen.add(recordId);
    deduped.push(record);
  }
  return { deduped, seen };
}
function getScoutingDatabasePage() {
  const page = getScoutingDatabase()?.page;
  return page && typeof page === "object" && !Array.isArray(page)
    ? {
        limit: Math.max(1, Math.floor(Number(page.limit) || 750)),
        offset: Math.max(0, Math.floor(Number(page.offset) || 0)),
        returned: Math.max(0, Math.floor(Number(page.returned) || 0)),
        nextOffset: Number.isFinite(Number(page.nextOffset)) ? Math.max(0, Math.floor(Number(page.nextOffset))) : null,
        cursor: normalizeScoutingText(page.cursor, 400),
        nextCursor: normalizeScoutingText(page.nextCursor, 400),
        total: Number.isFinite(Number(page.total)) ? Math.max(0, Math.floor(Number(page.total))) : null,
        hasMore: Boolean(page.hasMore),
      }
    : null;
}
function getScoutingDatabaseTotalCount(database = getScoutingDatabase()) {
  const total = Number(database?.page?.total);
  if (Number.isFinite(total) && total >= 0) {
    return Math.max(0, Math.floor(total));
  }
  return Array.isArray(database?.records) ? database.records.length : 0;
}
function renderScoutingDatabasePagingControls(paging = {}) {
  const isPaged = paging?.mode === "api" || paging?.mode === "worker";
  const isFootballScienceDb = paging?.mode === "fsdb";
  const pageSize = Math.max(1, Math.floor(Number(paging.limit) || SCOUTING_DATABASE_PAGE_SIZE));
  const total = Math.max(0, Math.floor(Number(paging.total) || 0));
  const returned = Math.max(0, Math.floor(Number(paging.returned) || 0));
  const hasMore = isPaged || isFootballScienceDb ? Boolean(paging.hasMore) : total > pageSize;
  if (isFootballScienceDb) {
    if (!returned) {
      return "";
    }
    const state = ensureScoutingState();
    const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
    const currentPage = Math.max(1, filters.fsdbCursorStack.length + 1);
    const totalLabel = total ? ` of ${total.toLocaleString("en-US")}` : hasMore ? "" : ` of ${returned.toLocaleString("en-US")}`;
    return `
      <div class="scouting-database-paging" data-scouting-database-paging>
        <span>${escapeHtml(`Showing ${returned.toLocaleString("en-US")} FS DB players${totalLabel}`)}</span>
        <form class="scouting-database-page-jump" data-scouting-page-jump-form data-scouting-page-size="${pageSize}">
          <span>Page</span>
          <input type="number" min="1" name="page" value="${currentPage}" aria-label="Football Science DB page" title="Cursor pages can move one page at a time" disabled />
        </form>
        <div>
          <button type="button" class="scouting-secondary-button" data-scouting-page-cursor="previous" ${filters.fsdbCursorStack.length ? "" : "disabled"}>Previous 50</button>
          <button type="button" class="scouting-primary-button" data-scouting-page-cursor="next" data-scouting-next-cursor="${escapeHtml(paging.nextCursor || "")}" ${hasMore && paging.nextCursor ? "" : "disabled"}>Next 50</button>
        </div>
      </div>
    `;
  }
  if (isPaged) {
    if (!returned) {
      return "";
    }
    const apiOffset = Math.max(0, Math.floor(Number(paging.offset) || 0));
    const start = apiOffset + 1;
    const end = apiOffset + returned;
    const previousOffset = Math.max(0, apiOffset - pageSize);
    const nextOffset = Number.isFinite(Number(paging.nextOffset)) ? Number(paging.nextOffset) : apiOffset + returned;
    const currentPage = Math.floor(apiOffset / pageSize) + 1;
    const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : "";
    const totalLabel = total ? ` of ${total.toLocaleString("en-US")}` : hasMore ? "" : ` of ${end.toLocaleString("en-US")}`;
    return `
      <div class="scouting-database-paging" data-scouting-database-paging>
        <span>${escapeHtml(`Showing ${start.toLocaleString("en-US")}-${end.toLocaleString("en-US")}${totalLabel}`)}</span>
        <form class="scouting-database-page-jump" data-scouting-page-jump-form data-scouting-page-size="${pageSize}">
          <span>Page</span>
          <input type="number" min="1" ${totalPages ? `max="${totalPages}"` : ""} name="page" value="${currentPage}" aria-label="Jump to scouting database page" title="Type a page number and press Enter" />
          ${totalPages ? `<span>/ ${totalPages}</span>` : ""}
        </form>
        <div>
          <button type="button" class="scouting-secondary-button" data-scouting-page-offset="${previousOffset}" ${apiOffset <= 0 ? "disabled" : ""}>Previous 50</button>
          <button type="button" class="scouting-primary-button" data-scouting-page-offset="${nextOffset}" ${!hasMore ? "disabled" : ""}>Next 50</button>
        </div>
      </div>
    `;
  }
  if (!total || total <= pageSize) {
    return "";
  }
  const offset = Math.max(0, Math.floor(Number(paging.offset) || 0));
  const start = Math.min(total, offset + 1);
  const end = Math.min(total, offset + pageSize);
  const previousOffset = Math.max(0, offset - pageSize);
  const nextOffset = Math.min(total - 1, offset + pageSize);
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return `
    <div class="scouting-database-paging" data-scouting-database-paging>
      <span>${escapeHtml(`Showing ${start.toLocaleString("en-US")}-${end.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`)}</span>
      <form class="scouting-database-page-jump" data-scouting-page-jump-form data-scouting-page-size="${pageSize}">
        <span>Page</span>
        <input type="number" min="1" max="${totalPages}" name="page" value="${currentPage}" aria-label="Jump to scouting database page" title="Type a page number and press Enter" />
        <span>/ ${totalPages}</span>
      </form>
      <div>
        <button type="button" class="scouting-secondary-button" data-scouting-page-offset="${previousOffset}" ${currentPage <= 1 ? "disabled" : ""}>Previous 50</button>
        <button type="button" class="scouting-primary-button" data-scouting-page-offset="${nextOffset}" ${currentPage >= totalPages ? "disabled" : ""}>Next 50</button>
      </div>
    </div>
  `;
}
function renderScoutingImportHistoryPanel() {
  const canEdit = canEditScoutingWorkspace();
  const imports = Array.isArray(scoutingImportHistoryCache.imports) ? scoutingImportHistoryCache.imports : [];
  const body =
    scoutingImportHistoryCache.status === "loading"
      ? `<p>Loading latest scouting player database imports...</p>`
      : scoutingImportHistoryCache.error
        ? `<p>${escapeHtml(scoutingImportHistoryCache.error)}</p>`
        : imports.length
          ? `
            <div class="scouting-import-history-list">
              ${imports
                .slice(0, 8)
                .map((item) => {
                  const status = normalizeScoutingText(item.status, 40) || "unknown";
                  const rows = Number.isFinite(Number(item.rowCount)) ? Number(item.rowCount).toLocaleString("en-US") : "0";
                  const date = formatScoutingImportSummaryDate(item.publishedAt || item.updatedAt || item.createdAt);
                  return `
                    <article class="scouting-import-history-item">
                      <div>
                        <strong>${escapeHtml(item.sourceFileName || "Scouting player database import")}</strong>
                        <span>${escapeHtml(`${status}${date ? ` · ${date}` : ""} · ${rows} rows`)}</span>
                      </div>
                      ${
                        canEdit && item.id && status !== "archived"
                          ? `<button type="button" class="scouting-secondary-button" data-rollback-scouting-import="${escapeHtml(item.id)}">Rollback</button>`
                          : ""
                      }
                    </article>
                  `;
                })
                .join("")}
            </div>
          `
          : `<p>No import history yet.</p>`;
  return `
    <div class="scouting-side-panel scouting-import-history-panel" data-scouting-import-history-panel>
      <div class="scouting-panel-head">
        <div>
          <p class="placeholder-tag">Data operations</p>
          <h3>Import history</h3>
        </div>
        <button type="button" class="scouting-secondary-button" data-refresh-scouting-import-history>Refresh</button>
      </div>
      ${body}
    </div>
  `;
}
function renderScoutingImportHistoryPanelIntoDom() {
  const container =
    ui.scoutingWorkspace?.querySelector("[data-scouting-settings-data-tools]") ||
    ui.scoutingWorkspace?.querySelector(".scouting-database-side");
  if (!container) {
    return;
  }
  const existing = container.querySelector("[data-scouting-import-history-panel]");
  if (existing) {
    existing.outerHTML = renderScoutingImportHistoryPanel();
  } else {
    container.insertAdjacentHTML("beforeend", renderScoutingImportHistoryPanel());
  }
}
function loadScoutingImportHistory({ force = false } = {}) {
  if (!isScoutingApiDatabaseActive()) {
    return;
  }
  if (scoutingImportHistoryCache.promise && !force) {
    return;
  }
  if (scoutingImportHistoryCache.status === "ready" && !force) {
    renderScoutingImportHistoryPanelIntoDom();
    return;
  }
  scoutingImportHistoryCache = { ...scoutingImportHistoryCache, status: "loading", error: "" };
  renderScoutingImportHistoryPanelIntoDom();
  const promise = fetchScoutingApi({ action: "importHistory", limit: 12 })
    .then((response) => {
      if (!response.ok) {
        throw new Error(response.reason || "Could not load import history.");
      }
      scoutingImportHistoryCache = {
        status: "ready",
        imports: Array.isArray(response.result?.imports) ? response.result.imports : [],
        error: "",
        promise: null,
      };
    })
    .catch((error) => {
      scoutingImportHistoryCache = {
        status: "error",
        imports: [],
        error: error?.message || "Could not load import history.",
        promise: null,
      };
    })
    .finally(renderScoutingImportHistoryPanelIntoDom);
  scoutingImportHistoryCache.promise = promise;
}
function renderScoutingProfileApiPanel(profile = null, status = "loading", error = "") {
  if (status === "loading") {
    return `
      <section class="scouting-profile-section" data-scouting-profile-api-panel>
        <p class="placeholder-tag">Master player record</p>
        <h3>Loading season history...</h3>
      </section>
    `;
  }
  if (error) {
    return `
      <section class="scouting-profile-section" data-scouting-profile-api-panel>
        <p class="placeholder-tag">Master player record</p>
        <h3>Season history unavailable</h3>
        <p>${escapeHtml(error)}</p>
      </section>
    `;
  }
  const seasons = Array.isArray(profile?.seasons) ? profile.seasons : [];
  const summary = profile?.profileSummary && typeof profile.profileSummary === "object" ? profile.profileSummary : {};
  const player = profile?.player && typeof profile.player === "object" ? profile.player : {};
  const footballScienceDb = profile?.footballScienceDb && typeof profile.footballScienceDb === "object" && !Array.isArray(profile.footballScienceDb)
    ? profile.footballScienceDb
    : null;
  const fsdbProfile = footballScienceDb?.profile && typeof footballScienceDb.profile === "object" ? footballScienceDb.profile : null;
  const fsdbPlayer = fsdbProfile?.player && typeof fsdbProfile.player === "object" ? fsdbProfile.player : null;
  const fsdbReadiness = fsdbPlayer?.dataReadiness && typeof fsdbPlayer.dataReadiness === "object" ? fsdbPlayer.dataReadiness : null;
  const fsdbLinkStatus = normalizeScoutingText(footballScienceDb?.linkStatus, 40);
  const fsdbResolvedName = normalizeScoutingText(fsdbPlayer?.fullName || fsdbPlayer?.name, 180);
  const fsdbPanel = footballScienceDb
    ? `
      <div class="scouting-season-timeline">
        <article class="scouting-season-timeline-item">
          <strong>${escapeHtml(fsdbLinkStatus === "linked" ? "Source enrichment linked" : fsdbLinkStatus === "ambiguous" ? "Source enrichment needs review" : "Source enrichment not linked")}</strong>
          <span>${escapeHtml(
            fsdbLinkStatus === "linked"
              ? `${fsdbResolvedName || "Resolved player"} · ${fsdbReadiness?.label || "Identity ready"}`
              : footballScienceDb.reason || footballScienceDb.matchMethod || "No safe identity match yet"
          )}</span>
          <em>${escapeHtml(
            fsdbLinkStatus === "linked" && footballScienceDb.initialOnlyScoutingName && fsdbResolvedName
              ? `Initial-only scouting name resolved as ${fsdbResolvedName}`
              : fsdbLinkStatus === "linked"
                ? `${fsdbPlayer?.sourceLinkCount || 0} source links · ${fsdbPlayer?.metricCount || 0} metrics`
                : "No automatic merge is made without stronger identity evidence"
          )}</em>
        </article>
      </div>
    `
    : "";
  return `
    <section class="scouting-profile-section" data-scouting-profile-api-panel>
      <div class="scouting-panel-head">
        <div>
          <p class="placeholder-tag">Master player record</p>
          <h3>${escapeHtml(player.canonicalName || getScoutingRecordName(profile?.record))}</h3>
        </div>
        <span>${escapeHtml(summary.playerIdentityId || player.playerIdentityId || "Identity pending")}</span>
      </div>
      <div class="scouting-profile-facts">
        <span><strong>${escapeHtml(String(summary.seasonCount || seasons.length || 0))}</strong> seasons</span>
        <span><strong>${escapeHtml(Number(summary.totalMinutes || 0).toLocaleString("en-US"))}</strong> total minutes</span>
        <span><strong>${escapeHtml(String(summary.quality?.trusted || 0))}</strong> trusted metrics</span>
      </div>
      ${fsdbPanel}
      <div class="scouting-season-timeline">
        ${
          seasons.length
            ? seasons
                .slice(0, 8)
                .map((seasonRecord) => {
                  const minutes = Number(seasonRecord?.[scoutingRecordIndex.minutes] || 0).toLocaleString("en-US");
                  const position = normalizeScoutingText(seasonRecord?.[scoutingRecordIndex.position], 80);
                  return `
                    <article class="scouting-season-timeline-item">
                      <strong>${escapeHtml(getScoutingRecordSeason(seasonRecord) || "Unknown season")}</strong>
                      <span>${escapeHtml(`${getScoutingRecordTeam(seasonRecord) || "Unknown club"} · ${getScoutingRecordLeague(seasonRecord) || "Unknown league"}`)}</span>
                      <em>${escapeHtml(`${minutes} minutes · ${position || "Position unknown"}`)}</em>
                    </article>
                  `;
                })
                .join("")
            : `<p>No linked seasons yet.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingProfileApiPanelIntoDom(recordId, profile = null, status = "loading", error = "") {
  const modal = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]");
  if (!modal) {
    return;
  }
  const existing = modal.querySelector("[data-scouting-profile-api-panel]");
  const markup = renderScoutingProfileApiPanel(profile, status, error);
  if (existing) {
    existing.outerHTML = markup;
  } else {
    modal.insertAdjacentHTML("beforeend", markup);
  }
}
function hydrateScoutingProfileApiDetails(recordId) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id || !isScoutingApiDatabaseActive()) {
    return;
  }
  if (scoutingProfileApiCache.has(id)) {
    renderScoutingProfileApiPanelIntoDom(id, scoutingProfileApiCache.get(id), "ready", "");
    return;
  }
  renderScoutingProfileApiPanelIntoDom(id, null, "loading", "");
  fetchScoutingApi({ action: "profile", recordId: id })
    .then((response) => {
      if (!response.ok) {
        throw new Error(response.reason || "Could not load master player record.");
      }
      scoutingProfileApiCache.set(id, response.result);
      renderScoutingProfileApiPanelIntoDom(id, response.result, "ready", "");
    })
    .catch((error) => {
      renderScoutingProfileApiPanelIntoDom(id, null, "error", error?.message || "Could not load master player record.");
    });
}
async function loadScoutingDatabaseWithApi() {
  const query = getScoutingApiQueryFromState();
  const response = await fetchScoutingApi(query);
  if (!response.ok) {
    throw new Error(response.reason || "Scouting API is not available.");
  }
  const database = applyScoutingApiDatabase(response.result || {});
  if (!database) {
    throw new Error(response.result?.reason || "Scouting database API is not enabled.");
  }
  if (!scoutingDatabaseOptionCache && !response.result?.options) {
    void loadScoutingDatabaseFilterOptions().then(() => {
      if (ui.scoutingWorkspace) {
        renderScoutingWorkspace({ preserveFocus: true });
      }
    });
  }
  return database;
}
function loadScoutingDatabaseFilterOptions() {
  if (!isScoutingApiDatabaseActive()) {
    return Promise.resolve(scoutingDatabaseOptionCache || { leagues: ["all"], teams: ["all"], seasons: ["all"], positions: ["ALL"] });
  }
  if (scoutingDatabaseOptionCache) {
    return Promise.resolve(scoutingDatabaseOptionCache);
  }
  if (scoutingDatabaseOptionLoadPromise) {
    return scoutingDatabaseOptionLoadPromise;
  }
  const promise = fetchScoutingApi({ action: "options" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(response.reason || "Could not load scouting database filter options.");
      }
      const payload = response.result || {};
      const rawOptions = payload.options || {};
      const leagues = Array.isArray(rawOptions.leagues) ? rawOptions.leagues.filter(Boolean) : [];
      const teams = Array.isArray(rawOptions.teams) ? rawOptions.teams.filter(Boolean) : [];
      const seasons = Array.isArray(rawOptions.seasons) ? rawOptions.seasons.filter(Boolean) : [];
      const positions = Array.isArray(rawOptions.positions) ? rawOptions.positions.filter(Boolean) : [];
      const normalized = {
        leagues: [...new Set(leagues.map((item) => normalizeScoutingLeague(item)).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
        teams: [...new Set(teams.map((item) => String(item).trim()).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
        seasons: [...new Set(seasons.map((item) => String(item).trim()).filter(Boolean))].sort((a, b) => String(b).localeCompare(String(a))),
        positions: [...new Set(positions.map((item) => String(item).trim()).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
      };
      scoutingDatabaseOptionCache = normalized;
      const loadedDatabase = getScoutingDatabase();
      if (loadedDatabase && loadedDatabase.source === "api" && !loadedDatabase.options) {
        loadedDatabase.options = normalized;
      }
      return normalized;
    })
    .catch((error) => {
      scoutingDatabaseOptionLoadPromise = null;
      scoutingDatabaseOptionCache = scoutingDatabaseOptionCache || {
        leagues: ["all"],
        teams: ["all"],
        seasons: ["all"],
        positions: ["ALL"],
      };
      return scoutingDatabaseOptionCache;
    })
    .finally(() => {
      scoutingDatabaseOptionLoadPromise = null;
    });
  scoutingDatabaseOptionLoadPromise = promise;
  return promise;
}
function recordScoutingImportIntent(database = {}) {
  if (!database?.records?.length) {
    return Promise.resolve({ ok: false });
  }
  return sendScoutingApiAction({
    action: "recordImportIntent",
    sourceFileName: database.fileName || "",
    sheetName: database.sheets?.[0] || "",
    rowCount: database.records.length,
    metricCount: database.metrics?.length || 0,
    metadata: {
      source: "scouting player database",
      sourceSystem: getScoutingImportSourceSystem(),
      sourceType: scoutingImportDraft?.sourceSystem || getScoutingImportSourceSystem(),
      importedAt: database.importedAt || new Date().toISOString(),
      sampleRecordIds: database.records.slice(0, 5).map(getScoutingRecordId),
    },
  }).catch(() => ({ ok: false }));
}
function getScoutingImportChunks(
  records = [],
  maxRecordsPerChunk = SCOUTING_IMPORT_MAX_RECORDS_PER_CHUNK,
  maxPayloadCharacters = SCOUTING_IMPORT_MAX_CHUNK_PAYLOAD_CHARACTERS
) {
  const chunks = [];
  let current = [];
  let currentSize = 0;
  for (const record of records) {
    const recordSize = JSON.stringify(record).length + 8;
    if (current.length && (current.length >= maxRecordsPerChunk || currentSize + recordSize > maxPayloadCharacters)) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(record);
    currentSize += recordSize;
  }
  if (current.length) {
    chunks.push(current);
  }
  return chunks;
}
async function publishScoutingExcelImportToDatabase(database = {}) {
  if (!database?.records?.length) {
    return { ok: false, reason: "No scouting player rows to upload." };
  }
  const startResult = await sendScoutingApiAction({
    action: "startExcelImport",
    sourceFileName: database.fileName || "",
    sheetName: Array.isArray(database.sheets) ? database.sheets.join(", ") : "",
    seasonLabel: scoutingImportDraft?.seasonOverride || "",
    rowCount: database.records.length,
    metricCount: database.metrics?.length || 0,
    metadata: {
      source: "scouting player database",
      sourceSystem: scoutingImportDraft?.sourceSystem || getScoutingImportSourceSystem(),
      importedAt: database.importedAt || new Date().toISOString(),
      importedFrom: scoutingImportDraft?.sourceTypeLabel || scoutingImportDraft?.sourceSystem || "file-import",
    },
  });
  if (!startResult.ok || startResult.result?.enabled === false) {
    return startResult;
  }
  const importBatchId = startResult.result?.importBatchId || "";
  if (!importBatchId) {
    return { ok: false, reason: "Scouting import batch could not be created." };
  }
  const recordsWithBatchTrace = (database.records || []).map((record) => {
    const nextRecord = Array.isArray(record) ? record.slice() : record;
    if (Array.isArray(nextRecord)) {
      nextRecord[scoutingRecordIndex.sourceTrace] = {
        ...getScoutingRecordSourceTrace(record),
        importBatchId,
      };
    }
    return nextRecord;
  });
  const databaseForPublish = {
    ...database,
    records: recordsWithBatchTrace,
  };
  const chunkPlan = getScoutingImportPayloadChunks(databaseForPublish.records, databaseForPublish.metrics || []);
  if (!chunkPlan.ok) {
    return chunkPlan;
  }
  const chunks = chunkPlan.chunks;
  for (let index = 0; index < chunks.length; index += 1) {
    const payloadRows = chunks[index];
    const chunkPayload = {
      action: "importExcelChunk",
      importBatchId,
      chunkIndex: index,
      chunkCount: chunks.length,
      metrics: chunkPlan.metricsFirstChunkIndex === index ? (databaseForPublish.metrics || []) : [],
      records: payloadRows,
    };
    scoutingImportDraft = {
      ...(scoutingImportDraft || {}),
      databaseUploadStatus: `Uploading ${index + 1}/${chunks.length} to scouting player database`,
      databaseImportBatchId: importBatchId,
    };
    renderScoutingWorkspace({ preserveFocus: true });
    const chunkResult = await sendScoutingApiAction(chunkPayload);
    if (!chunkResult.ok) {
      return {
        ok: false,
        reason: chunkResult.reason || "Scouting player database chunk upload failed.",
      };
    }
  }
  const finishResult = await sendScoutingApiAction({
    action: "finishExcelImport",
    importBatchId,
    rowCount: databaseForPublish.records.length,
    metricCount: databaseForPublish.metrics?.length || 0,
  });
  if (!finishResult.ok) {
    return {
      ok: false,
      reason: finishResult.reason || "Scouting player database import could not be published.",
    };
  }
  scoutingImportDraft = {
    ...(scoutingImportDraft || {}),
    databaseStored: true,
    databaseUploadStatus: "Scouting player database updated",
    databaseImportBatchId: importBatchId,
  };
  scoutingImportDraft.lastUploadSummary = {
    ...(scoutingImportDraft.lastUploadSummary || {}),
    status: "published",
    databaseStored: true,
    batchId: importBatchId,
    rowCount: databaseForPublish.records.length,
    metricCount: databaseForPublish.metrics?.length || 0,
    updatedAt: new Date().toISOString(),
  };
  setScoutingImportLastUploadSummary(scoutingImportDraft.lastUploadSummary);
  renderScoutingWorkspace({ preserveFocus: true });
  return finishResult;
}
function getScoutingImportPayloadChunks(records = [], metrics = []) {
  const rawChunks = getScoutingImportChunks(records);
  if (!rawChunks.length) {
    return {
      ok: true,
      chunks: [],
      metricsFirstChunkIndex: 0,
    };
  }
  const chunks = [];
  const queue = rawChunks.map((chunkRecords, index) => ({
    rows: chunkRecords,
    includeMetrics: index === 0,
    source: `chunk-${index}`,
  }));
  while (queue.length) {
    const current = queue.shift();
    const payload = {
      action: "importExcelChunk",
      importBatchId: "",
      chunkIndex: 0,
      chunkCount: 1,
      metrics: current.includeMetrics ? metrics : [],
      records: current.rows,
    };
    if (JSON.stringify(payload).length <= SCOUTING_IMPORT_MAX_CHUNK_BYTES) {
      chunks.push({
        records: current.rows,
        includeMetrics: current.includeMetrics,
        source: current.source,
      });
      continue;
    }
    if (current.rows.length <= 1) {
      return {
        ok: false,
        reason: "Import row is too large for API limits. Please remove unused metric columns and try again.",
      };
    }
    const splitAt = Math.ceil(current.rows.length / 2);
    const firstRows = current.rows.slice(0, splitAt);
    const secondRows = current.rows.slice(splitAt);
    queue.unshift({ rows: secondRows, includeMetrics: false, source: `${current.source}-b` });
    queue.unshift({ rows: firstRows, includeMetrics: current.includeMetrics, source: `${current.source}-a` });
  }
  const metricsFirstChunkIndex = chunks.findIndex((chunk) => chunk.includeMetrics);
  return {
    ok: true,
    chunks: chunks.map((chunk) => chunk.rows),
    metricsFirstChunkIndex: metricsFirstChunkIndex === -1 ? 0 : metricsFirstChunkIndex,
  };
}
function loadScoutingDatabaseWithScript() {
  return platformModuleLoader
    .loadScript("scouting-import-data", "scouting-import-data.js", {
      id: "scoutingImportDataScript",
      required: true,
      async: true,
    })
    .then(() => getScoutingDatabase());
}
function rejectPendingScoutingDatabaseWorkerRequests(error) {
  const requestError = error instanceof Error ? error : new Error(error?.message || "Scouting player database worker failed.");
  for (const request of scoutingDatabaseWorkerRequests.values()) {
    window.clearTimeout(request.timeoutId);
    request.reject(requestError);
  }
  scoutingDatabaseWorkerRequests.clear();
}
function getOrCreateScoutingDatabaseWorker() {
  if (scoutingDatabaseWorker) {
    return scoutingDatabaseWorker;
  }
  if (typeof Worker !== "function") {
    return null;
  }
  const worker = new Worker(`scouting-database-worker.js?v=${getScoutingAssetVersion()}`);
  scoutingDatabaseWorker = worker;
  worker.onmessage = (event) => {
    const message = event.data || {};
    const requestId = Number(message.requestId) || 0;
    const request = scoutingDatabaseWorkerRequests.get(requestId);
    if (!request) {
      return;
    }
    scoutingDatabaseWorkerRequests.delete(requestId);
    window.clearTimeout(request.timeoutId);
    if (message.type === "database") {
      request.resolve(message.database || null);
      return;
    }
    if (message.type === "records") {
      request.resolve(Array.isArray(message.records) ? message.records : []);
      return;
    }
    if (message.type === "preloaded") {
      request.resolve(true);
      return;
    }
    request.reject(new Error(message.message || "Scouting player database could not be loaded."));
  };
  worker.onerror = (error) => {
    if (scoutingDatabaseWorker === worker) {
      scoutingDatabaseWorker = null;
      scoutingDatabaseWorkerFullReady = false;
    }
    worker.terminate();
    rejectPendingScoutingDatabaseWorkerRequests(error);
  };
  return worker;
}
function requestScoutingDatabaseWorkerQuery(options = {}) {
  const worker = getOrCreateScoutingDatabaseWorker();
  if (!worker) {
    return Promise.reject(new Error("Scouting player database worker is unavailable."));
  }
  const requestId = (scoutingDatabaseWorkerRequestId += 1);
  const timeoutMs = Math.max(1000, Math.floor(Number(options.timeoutMs) || 45000));
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      scoutingDatabaseWorkerRequests.delete(requestId);
      if (scoutingDatabaseWorker === worker) {
        scoutingDatabaseWorker = null;
        scoutingDatabaseWorkerFullReady = false;
      }
      worker.terminate();
      reject(new Error("Scouting player database timed out while loading."));
      rejectPendingScoutingDatabaseWorkerRequests(new Error("Scouting player database timed out while loading."));
    }, timeoutMs);
    scoutingDatabaseWorkerRequests.set(requestId, { resolve, reject, timeoutId });
    worker.postMessage({
      type: options.type || "query",
      requestId,
      scriptUrl: `scouting-import-data.js?v=${getScoutingAssetVersion()}`,
      previewScriptUrl: `scouting-import-preview-data.js?v=${getScoutingAssetVersion()}`,
      manifestScriptUrl: `scouting-import-manifest.js?v=${getScoutingAssetVersion()}`,
      query: options.query && typeof options.query === "object" ? options.query : getScoutingWorkerQueryFromState(),
      recordIds: Array.isArray(options.recordIds) ? options.recordIds : [],
    });
  });
}
function requestScoutingDatabaseWorkerRecords(recordIds = [], options = {}) {
  const ids = normalizeScoutingRecordIds(recordIds);
  if (!ids.length) {
    return Promise.resolve([]);
  }
  return requestScoutingDatabaseWorkerQuery({
    type: "recordsByIds",
    recordIds: ids,
    timeoutMs: options.timeoutMs || 8000,
  });
}
function prewarmScoutingDatabaseWorker() {
  const filters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters);
  if (
    ensureScoutingState().activeTab !== "database" ||
    filters.source === "fsdb" ||
    isScoutingDatabaseLoaded() ||
    scoutingDatabaseLoadPromise ||
    typeof Worker !== "function"
  ) {
    return Promise.resolve(false);
  }
  if (scoutingDatabaseWorkerPreloadPromise) {
    return scoutingDatabaseWorkerPreloadPromise;
  }
  scoutingDatabaseWorkerPreloadPromise = requestScoutingDatabaseWorkerQuery({
    type: "preview",
    timeoutMs: 8000,
  })
    .then(() => {
      scheduleFullScoutingDatabaseWorkerPreload(650);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      scoutingDatabaseWorkerPreloadPromise = null;
    });
  return scoutingDatabaseWorkerPreloadPromise;
}
function prewarmFullScoutingDatabaseWorker() {
  const filters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters);
  if (ensureScoutingState().activeTab !== "database" || filters.source === "fsdb" || typeof Worker !== "function") {
    return Promise.resolve(false);
  }
  if (scoutingDatabaseWorkerFullReady) {
    return Promise.resolve(true);
  }
  if (scoutingDatabaseWorkerFullPreloadPromise) {
    return scoutingDatabaseWorkerFullPreloadPromise;
  }
  scoutingDatabaseWorkerFullPreloadPromise = requestScoutingDatabaseWorkerQuery({
    type: "preload",
    timeoutMs: 45000,
  })
    .then(() => {
      scoutingDatabaseWorkerFullReady = true;
      if (isScoutingWorkerDatabaseActive()) {
        scheduleScoutingDatabaseWorkerFullRefresh(180);
      }
      return true;
    })
    .catch(() => false)
    .finally(() => {
      scoutingDatabaseWorkerFullPreloadPromise = null;
    });
  return scoutingDatabaseWorkerFullPreloadPromise;
}
function scheduleScoutingDatabaseWorkerPrewarm(delayMs = 180) {
  window.clearTimeout(scoutingDatabaseWorkerPreloadTimer);
  scoutingDatabaseWorkerPreloadTimer = window.setTimeout(() => {
    scoutingDatabaseWorkerPreloadTimer = 0;
    if (ensureScoutingState().activeTab !== "database") {
      return;
    }
    prewarmScoutingDatabaseWorker();
  }, Math.max(0, Math.floor(Number(delayMs) || 0)));
}
function scheduleFullScoutingDatabaseWorkerPreload(delayMs = 650) {
  window.clearTimeout(scoutingDatabaseWorkerFullPreloadTimer);
  scoutingDatabaseWorkerFullPreloadTimer = window.setTimeout(() => {
    scoutingDatabaseWorkerFullPreloadTimer = 0;
    if (ensureScoutingState().activeTab !== "database") {
      return;
    }
    prewarmFullScoutingDatabaseWorker();
  }, Math.max(0, Math.floor(Number(delayMs) || 0)));
}
function scheduleScoutingDatabaseWorkerFullRefresh(delayMs = 2500) {
  window.clearTimeout(scoutingDatabaseWorkerFullRefreshTimer);
  scoutingDatabaseWorkerFullRefreshTimer = window.setTimeout(() => {
    scoutingDatabaseWorkerFullRefreshTimer = 0;
    if (
      ensureScoutingState().activeTab !== "database" ||
      !isScoutingWorkerDatabaseActive() ||
      getScoutingAdvancedDatabaseFiltersOpen() ||
      hasOpenScoutingOverlay()
    ) {
      return;
    }
    scheduleScoutingDatabaseRefresh();
  }, Math.max(0, Math.floor(Number(delayMs) || 0)));
}
function markScoutingWorkerPreviewDatabase(database = {}) {
  return {
    ...database,
    page:
      database.page && typeof database.page === "object" && !Array.isArray(database.page)
        ? { ...database.page, preview: true, pendingFull: true }
        : { preview: true, pendingFull: true },
  };
}
function loadFullScoutingDatabaseWithWorker() {
  return requestScoutingDatabaseWorkerQuery({ timeoutMs: 45000 })
    .then((database) => {
      const appliedDatabase = applyScoutingWorkerDatabase(database);
      if (!appliedDatabase) {
        throw new Error("Scouting player database worker returned no records.");
      }
      scoutingDatabaseWorkerFullReady = true;
      return appliedDatabase;
    })
    .catch(() => loadScoutingDatabaseWithScript());
}
function loadScoutingDatabaseWithWorker(options = {}) {
  const filters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters);
  if (options.previewFirst !== false && shouldUseScoutingWorkerPreviewFirst(filters) && !scoutingDatabaseWorkerFullReady) {
    return requestScoutingDatabaseWorkerQuery({
      type: "preview",
      timeoutMs: 8000,
    })
      .then((database) => {
        const appliedDatabase = applyScoutingWorkerDatabase(markScoutingWorkerPreviewDatabase(database));
        if (!appliedDatabase) {
          throw new Error("Scouting player database preview returned no records.");
        }
        scheduleFullScoutingDatabaseWorkerPreload(0);
        return appliedDatabase;
      })
      .catch(() => loadFullScoutingDatabaseWithWorker());
  }
  return loadFullScoutingDatabaseWithWorker();
}
function ensureScoutingDatabaseLoaded() {
  const existingDatabase = getScoutingDatabase();
  if (existingDatabase) {
    return Promise.resolve(existingDatabase);
  }
  const filters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters);
  if (scoutingDatabaseLoadPromise && scoutingDatabaseLoadSource !== filters.source) {
    scoutingDatabaseLoadPromise = null;
    scoutingDatabaseLoadSource = "";
  }
  if (!scoutingDatabaseLoadPromise) {
    scoutingDatabaseError = "";
    scoutingDatabaseLoadSource = filters.source;
    const loader = filters.source === "fsdb"
      ? loadFootballScienceDbDatabase()
      : loadScoutingDatabaseWithApi().catch(() => loadScoutingDatabaseWithWorker());
    const loadPromise = loader
      .then(() => {
        const database = getScoutingDatabase();
        if (!database) {
          throw new Error(filters.source === "fsdb" ? "Football Science DB did not register on window." : "Scouting database did not register on window.");
        }
        scoutingDatabaseOptionCache = null;
        resetScoutingComputedCaches();
        if (scoutingDatabaseLoadPromise === loadPromise) {
          scoutingDatabaseLoadPromise = null;
          scoutingDatabaseLoadSource = "";
        }
        return database;
      })
      .catch((error) => {
        if (scoutingDatabaseLoadPromise === loadPromise) {
          scoutingDatabaseLoadPromise = null;
          scoutingDatabaseLoadSource = "";
        }
        scoutingDatabaseError =
          error?.message ||
          (filters.source === "fsdb" ? "Football Science DB could not be loaded." : "Scouting database could not be loaded.");
        throw error;
      });
    scoutingDatabaseLoadPromise = loadPromise;
  }
  return scoutingDatabaseLoadPromise;
}
function queueScoutingDatabaseLoad(onReady = renderScoutingWorkspace) {
  const scheduleRender = () => onReady({ preserveFocus: true });
  if (typeof onReady !== "function") {
    onReady = renderScoutingWorkspace;
  }
  if (isScoutingDatabaseLoaded()) {
    scheduleRender();
    return;
  }
  if (scoutingDatabaseLoadPromise) {
    scoutingDatabaseLoadPromise.then(scheduleRender).catch(scheduleRender);
    return;
  }
  ensureScoutingDatabaseLoaded().then(scheduleRender).catch(scheduleRender);
}
function cancelScoutingDatabaseBackgroundTimers() {
  window.clearTimeout(scoutingDatabaseAutoLoadTimer);
  window.clearTimeout(scoutingDatabaseWorkerPreloadTimer);
  window.clearTimeout(scoutingDatabaseWorkerFullPreloadTimer);
  window.clearTimeout(scoutingDatabaseWorkerFullRefreshTimer);
  scoutingDatabaseAutoLoadTimer = 0;
  scoutingDatabaseWorkerPreloadTimer = 0;
  scoutingDatabaseWorkerFullPreloadTimer = 0;
  scoutingDatabaseWorkerFullRefreshTimer = 0;
}
function scheduleScoutingDatabaseAutoLoad(delayMs = 1200) {
  window.clearTimeout(scoutingDatabaseAutoLoadTimer);
  scoutingDatabaseAutoLoadTimer = window.setTimeout(() => {
    scoutingDatabaseAutoLoadTimer = 0;
    const state = ensureScoutingState();
    const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
    if (
      state.activeTab !== "database" ||
      filters.source === "fsdb" ||
      isScoutingDatabaseLoaded() ||
      scoutingDatabaseLoadPromise ||
      scoutingDatabaseError
    ) {
      return;
    }
    queueScoutingDatabaseLoad((renderOptions = {}) => {
      if (ensureScoutingState().activeTab !== "database") {
        return;
      }
      renderScoutingActiveTabSurfaceOrWorkspace(renderOptions);
    });
  }, Math.max(0, Math.floor(Number(delayMs) || 0)));
}
function getScoutingMetricOptions() {
  const database = getScoutingDatabase();
  return [...scoutingCoreMetricOptions, ...(database?.metrics || [])];
}
function getScoutingStatusOptions() {
  const incoming = Array.isArray(scoutingStatusOptions) && scoutingStatusOptions.length ? scoutingStatusOptions : scoutingStatusFallbackOptions;
  return scoutingWorkflowStatusOptions.map((workflowOption) => {
    const customOption = incoming.find((option) => option.value === workflowOption.value);
    return {
      ...workflowOption,
      label: customOption?.label && customOption.label !== "New" ? customOption.label : workflowOption.label,
    };
  });
}
function getScoutingPriorityOptions() {
  return Array.isArray(scoutingPriorityOptions) && scoutingPriorityOptions.length
    ? scoutingPriorityOptions
    : scoutingPriorityFallbackOptions;
}
function getScoutingOptionMarkup(options, currentValue) {
  return options
    .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === currentValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
}
function normalizeScoutingTargetStatus(value = "") {
  const normalized = normalizeScoutingText(value, 40);
  const options = getScoutingStatusOptions();
  return options.some((option) => option.value === normalized) ? normalized : options[0]?.value || "new";
}
function normalizeScoutingTargetPriority(value = "") {
  const normalized = normalizeScoutingText(value, 40);
  const options = getScoutingPriorityOptions();
  return options.some((option) => option.value === normalized) ? normalized : options[0]?.value || "normal";
}
function normalizeScoutingDateText(value = "") {
  const normalized = normalizeScoutingText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}
function getScoutingReportRecommendationOptions() {
  return [
    { value: "monitor", label: "Monitor" },
    { value: "sign", label: "Sign" },
    { value: "shortlist", label: "Shortlist" },
    { value: "reject", label: "Reject" },
    { value: "revisit", label: "Revisit" },
  ];
}
function getScoutingContactTypeOptions() {
  return [
    { value: "agent", label: "Agent" },
    { value: "club", label: "Club" },
    { value: "player", label: "Player" },
    { value: "internal", label: "Internal" },
    { value: "live-scout", label: "Live scout" },
    { value: "video-scout", label: "Video scout" },
  ];
}
function normalizeScoutingContactType(value = "") {
  const normalized = normalizeScoutingText(value, 40) || "internal";
  return getScoutingContactTypeOptions().some((option) => option.value === normalized) ? normalized : "internal";
}
function normalizeScoutingReportRecommendation(value = "") {
  const normalized = normalizeScoutingText(value, 40) || "monitor";
  return getScoutingReportRecommendationOptions().some((option) => option.value === normalized) ? normalized : "monitor";
}
function normalizeScoutingReportScore(value, fallback = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : fallback;
}
function getScoutingShadowTagOptions() {
  return [
    { value: "first-choice", label: "1st choice" },
    { value: "backup", label: "Backup" },
    { value: "wildcard", label: "Wildcard" },
    { value: "u23", label: "U23" },
    { value: "value", label: "Value" },
    { value: "monitor", label: "Monitor" },
  ];
}
function normalizeScoutingShadowTag(value = "") {
  const normalized = normalizeScoutingText(value, 40) || "monitor";
  return getScoutingShadowTagOptions().some((option) => option.value === normalized) ? normalized : "monitor";
}
function getScoutingFormationOptions() {
  return ["4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "4-4-2"];
}
function normalizeScoutingFormation(value = "") {
  const formation = normalizeScoutingText(value, 40);
  return getScoutingFormationOptions().includes(formation) ? formation : "4-3-3";
}
function getScoutingPitchFormationClass(formation = "") {
  return `scouting-formation-${normalizeScoutingFormation(formation).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}
function getScoutingShadowSlotPitchPosition(slot = {}, formation = "4-3-3") {
  const role = normalizeScoutingText(slot.label, 20).toUpperCase();
  const normalizedFormation = normalizeScoutingFormation(formation);
  const override = ensureScoutingState().shadowXi?.positions?.[normalizedFormation]?.[slot?.id];
  if (Number.isFinite(override?.x) && Number.isFinite(override?.y)) {
    return {
      x: Math.max(6, Math.min(94, Math.round(override.x * 10) / 10)),
      y: Math.max(6, Math.min(94, Math.round(override.y * 10) / 10)),
    };
  }
  const base = {
    GK: [50, 86],
    RB: [86, 70],
    RCB: [62, 74],
    LCB: [38, 74],
    LB: [14, 70],
    DMF: [50, 57],
    RCMF: [64, 45],
    LCMF: [36, 45],
    RW: [87, 23],
    CF: [50, 14],
    LW: [13, 23],
  };
  const formations = {
    "4-3-3": base,
    "4-2-3-1": {
      ...base,
      DMF: [42, 57],
      RCMF: [58, 57],
      LCMF: [50, 40],
      RW: [87, 29],
      LW: [13, 29],
      CF: [50, 14],
    },
    "3-4-3": {
      GK: [50, 86],
      RB: [88, 51],
      RCB: [68, 74],
      LCB: [32, 74],
      LB: [20, 51],
      DMF: [50, 76],
      RCMF: [59, 50],
      LCMF: [41, 50],
      RW: [86, 23],
      CF: [50, 14],
      LW: [14, 23],
    },
    "3-5-2": {
      GK: [50, 86],
      RB: [88, 51],
      RCB: [68, 74],
      LCB: [32, 74],
      LB: [12, 51],
      DMF: [50, 76],
      RCMF: [62, 48],
      LCMF: [38, 48],
      RW: [50, 41],
      CF: [57, 16],
      LW: [43, 16],
    },
    "4-4-2": {
      GK: [50, 86],
      RB: [86, 70],
      RCB: [62, 74],
      LCB: [38, 74],
      LB: [14, 70],
      DMF: [43, 16],
      RCMF: [60, 43],
      LCMF: [40, 43],
      RW: [87, 43],
      CF: [57, 16],
      LW: [13, 43],
    },
  };
  const coordinates = formations[normalizedFormation]?.[role] || base[role] || [Number(slot.x) || 50, Number(slot.y) || 50];
  return { x: coordinates[0], y: coordinates[1] };
}
function getScoutingUnifiedPitchHeightRem(slotDepths = [], totalPlayers = 0) {
  const maxDepth = Math.max(1, ...slotDepths.map((count) => Number(count) || 0));
  return Math.round(Math.min(82, Math.max(64, 52 + maxDepth * 4.2 + totalPlayers * 0.1)));
}
function renderScoutingPitchFormationToolbar(value, dataAttribute, canEdit, options = {}) {
  const positionClass = options.right ? " is-right" : "";
  return `
    <div class="scouting-pitch-toolbar${positionClass}">
      <label>
        <span>Formation</span>
        <select ${dataAttribute} ${canEdit ? "" : "disabled"}>
          ${getScoutingFormationOptions()
            .map((formation) => `<option value="${escapeHtml(formation)}" ${normalizeScoutingFormation(value) === formation ? "selected" : ""}>${escapeHtml(formation)}</option>`)
            .join("")}
        </select>
      </label>
    </div>
  `;
}
function getScoutingMyTeamState(state = ensureScoutingState()) {
  const source = state.myTeam && typeof state.myTeam === "object" ? state.myTeam : {};
  const slotIds = new Set(scoutingShadowSlots.map((slot) => slot.id));
  const formationIds = new Set(getScoutingFormationOptions());
  const normalizeSlotPlayerIds = (slotValue) => {
    const rawIds = Array.isArray(slotValue) ? slotValue : [slotValue];
    const seen = new Set();
    return rawIds
      .map((playerId) => normalizeScoutingText(playerId, 160))
      .filter((playerId) => {
        if (!playerId || seen.has(playerId)) {
          return false;
        }
        seen.add(playerId);
        return true;
      });
  };
  const normalizeSlotPositions = (positionsValue) => {
    if (!positionsValue || typeof positionsValue !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(positionsValue)
        .map(([formationId, formationPositions]) => {
          const formation = normalizeScoutingFormation(formationId);
          if (!formationIds.has(formation) || !formationPositions || typeof formationPositions !== "object") {
            return null;
          }
          const normalizedPositions = Object.fromEntries(
            Object.entries(formationPositions)
              .map(([slotId, coordinates]) => {
                const normalizedSlotId = normalizeScoutingText(slotId, 40);
                const x = Number(coordinates?.x);
                const y = Number(coordinates?.y);
                if (!slotIds.has(normalizedSlotId) || !Number.isFinite(x) || !Number.isFinite(y)) {
                  return null;
                }
                return [
                  normalizedSlotId,
                  {
                    x: normalizeScoutingMyTeamPitchCoordinate(x),
                    y: normalizeScoutingMyTeamPitchCoordinate(y),
                  },
                ];
              })
              .filter(Boolean)
          );
          return Object.keys(normalizedPositions).length ? [formation, normalizedPositions] : null;
        })
        .filter(Boolean)
    );
  };
  state.myTeam = {
    formation: normalizeScoutingFormation(source.formation),
    slots: Object.fromEntries(
      Object.entries(source.slots && typeof source.slots === "object" ? source.slots : {})
        .map(([slotId, playerIds]) => [normalizeScoutingText(slotId, 40), normalizeSlotPlayerIds(playerIds)])
        .filter(([slotId, playerIds]) => slotIds.has(slotId) && playerIds.length)
    ),
    positions: normalizeSlotPositions(source.positions),
  };
  return state.myTeam;
}
function normalizeScoutingMyTeamSlotPlayerIds(slotValue) {
  const rawIds = Array.isArray(slotValue) ? slotValue : [slotValue];
  const seen = new Set();
  return rawIds
    .map((playerId) => normalizeScoutingText(playerId, 160))
    .filter((playerId) => {
      if (!playerId || seen.has(playerId)) {
        return false;
      }
      seen.add(playerId);
      return true;
    });
}
function getScoutingMyTeamPlayerId(player = {}) {
  return normalizeScoutingText(player.id || player.playerId || player.name, 160);
}
function getScoutingMyTeamPlayers() {
  return getScoutingInternalSquadPlayers().sort((a, b) => {
    const firstOrder = Number(a.rosterOrder ?? a.order ?? 999);
    const secondOrder = Number(b.rosterOrder ?? b.order ?? 999);
    return (Number.isFinite(firstOrder) ? firstOrder : 999) - (Number.isFinite(secondOrder) ? secondOrder : 999) || a.name.localeCompare(b.name);
  });
}
function getScoutingMyTeamPlayerById(playerId, players = getScoutingMyTeamPlayers()) {
  const id = normalizeScoutingText(playerId, 160);
  return players.find((player) => getScoutingMyTeamPlayerId(player) === id) || null;
}
function normalizeScoutingSquadRosterType(value = "") {
  return normalizeScoutingText(value, 80)
    .toLowerCase()
    .replace(/[_\s/]+/g, "-")
    .replace(/-+/g, "-");
}
function scoutingPlayerCountsInSquad(player = {}) {
  if (typeof player.countsInSquad === "boolean") {
    return player.countsInSquad;
  }
  if (typeof player.counts_in_squad === "boolean") {
    return player.counts_in_squad;
  }
  const rosterType = normalizeScoutingSquadRosterType(
    player.rosterType || player.roster_type || player.playerType || player.player_type || player.squadType || player.squad_type
  );
  if (["guest", "guest-player", "training-guest", "inactive-guest", "temporary", "temp", "trial", "trialist"].includes(rosterType)) {
    return false;
  }
  const rosterText = normalizeScoutingSquadRosterType(
    [player.status, player.availability, player.squadStatus, player.squad_status, player.temporaryGroup, player.trainingGroup]
      .filter(Boolean)
      .join(" ")
  );
  return !["guest", "training-guest", "inactive-guest", "temporary", "temp", "trial", "trialist"].some((token) => rosterText.includes(token));
}
function getScoutingRecordKnownFullNameAliases(record) {
  const recordName = getScoutingRecordName(record);
  return getScoutingMyTeamPlayers()
    .map((player) => normalizeScoutingText(player.name, 160))
    .filter((name) => name && areScoutingNamesInitialSurnameMatch(name, recordName));
}
function getScoutingMyTeamCandidateRecords() {
  ensureScoutingRecordLookupsReady();
  const seen = new Set();
  const records = [];
  const addRecord = (record) => {
    const id = getScoutingRecordId(record);
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    records.push(record);
  };
  const databaseRecords = Array.isArray(getScoutingDatabase()?.records) ? getScoutingDatabase().records : [];
  databaseRecords.forEach(addRecord);
  scoutingKnownRecordLookupCache.forEach(addRecord);
  Object.values(getScoutingPlayerSnapshots(ensureScoutingState())).forEach((snapshot) => {
    const fallbackRecord = getScoutingSnapshotFallbackRecord(snapshot?.recordId);
    if (fallbackRecord) {
      addRecord(fallbackRecord);
    }
  });
  return records;
}
function hasScoutingMyTeamCandidateRecordSources(state = null) {
  const activeDatabase = window.__footballScienceScoutingDatabase;
  const importedDatabase = window.__footballScienceImportedScoutingDatabase;
  if (Array.isArray(activeDatabase?.records) && activeDatabase.records.length) {
    return true;
  }
  if (Array.isArray(importedDatabase?.records) && importedDatabase.records.length) {
    return true;
  }
  if (scoutingKnownRecordLookupCache.size) {
    return true;
  }
  const sourceState = state || (activeContext ? activeContext.ensureState() : null);
  return Boolean(sourceState?.playerSnapshots && typeof sourceState.playerSnapshots === "object" && Object.keys(sourceState.playerSnapshots).length);
}
function scoreScoutingMyTeamRecordMatch(player = {}, record = null) {
  if (!record || !areScoutingNamesInitialSurnameMatch(player.name, getScoutingRecordName(record))) {
    return -1;
  }
  let score = 70;
  const playerAge = Number(player.age);
  const recordAge = getScoutingRecordAge(record);
  if (Number.isFinite(playerAge) && Number.isFinite(recordAge)) {
    const delta = Math.abs(playerAge - recordAge);
    score += delta === 0 ? 22 : delta === 1 ? 15 : delta <= 2 ? 8 : -18;
  }
  const playerGroup = getScoutingPositionGroup(player.position || player.bestRole || "");
  const recordGroup = getScoutingPositionGroup(record);
  if (playerGroup && recordGroup && playerGroup === recordGroup) {
    score += 16;
  }
  const playerTeam = normalizeScoutingPersonNameForMatch(player.team || player.club || "");
  const recordTeam = normalizeScoutingPersonNameForMatch(getScoutingRecordTeam(record));
  if (playerTeam && recordTeam && (playerTeam === recordTeam || playerTeam.includes(recordTeam) || recordTeam.includes(playerTeam))) {
    score += 10;
  }
  score += Math.min(8, Math.max(0, getScoutingRecordSeasonYearValue(record) - 2018));
  score += Math.min(8, Math.round(getScoutingRecordMinutes(record) / 900));
  return score;
}
function findScoutingRecordForMyTeamPlayer(player = {}) {
  const playerId = getScoutingMyTeamPlayerId(player);
  const cacheKey = [
    playerId,
    normalizeScoutingText(player.name, 160),
    normalizeScoutingText(player.position, 80),
    normalizeScoutingText(player.age, 20),
    scoutingRecordLookupFingerprint,
    scoutingKnownRecordLookupCache.size,
  ].join("|");
  if (scoutingMyTeamRecordMatchCache.has(cacheKey)) {
    return scoutingMyTeamRecordMatchCache.get(cacheKey);
  }
  const candidates = getScoutingMyTeamCandidateRecords()
    .map((record) => ({ record, score: scoreScoutingMyTeamRecordMatch(player, record) }))
    .filter((entry) => entry.score >= 70)
    .sort((a, b) => b.score - a.score || getScoutingRecordSeasonYearValue(b.record) - getScoutingRecordSeasonYearValue(a.record) || getScoutingRecordMinutes(b.record) - getScoutingRecordMinutes(a.record));
  const match = candidates[0]?.record || null;
  scoutingMyTeamRecordMatchCache.set(cacheKey, match);
  return match;
}
function getScoutingMyTeamSlotPitchPosition(slot, formation = "4-3-3") {
  const role = normalizeScoutingText(slot?.label || slot?.id, 40).toUpperCase();
  const normalizedFormation = normalizeScoutingFormation(formation);
  const override = getScoutingMyTeamState().positions?.[normalizedFormation]?.[slot?.id];
  if (Number.isFinite(override?.x) && Number.isFinite(override?.y)) {
    return { x: override.x, y: override.y };
  }
  const layouts = {
    "4-3-3": {
      GK: [50, 86],
      LB: [14, 70],
      LCB: [38, 74],
      RCB: [62, 74],
      RB: [86, 70],
      DMF: [50, 57],
      LCMF: [36, 45],
      RCMF: [64, 45],
      LW: [13, 23],
      CF: [50, 14],
      RW: [87, 23],
    },
    "4-2-3-1": {
      GK: [50, 86],
      LB: [14, 70],
      LCB: [38, 74],
      RCB: [62, 74],
      RB: [86, 70],
      DMF: [42, 57],
      RCMF: [58, 57],
      LCMF: [50, 40],
      LW: [13, 29],
      CF: [50, 14],
      RW: [87, 29],
    },
    "3-4-3": {
      GK: [50, 86],
      LCB: [32, 74],
      DMF: [50, 76],
      RCB: [68, 74],
      LB: [12, 51],
      LCMF: [41, 50],
      RCMF: [59, 50],
      RB: [88, 51],
      LW: [14, 23],
      CF: [50, 14],
      RW: [86, 23],
    },
    "3-5-2": {
      GK: [50, 86],
      LCB: [32, 74],
      DMF: [50, 76],
      RCB: [68, 74],
      LB: [12, 51],
      LCMF: [38, 48],
      RW: [50, 41],
      RCMF: [62, 48],
      RB: [88, 51],
      CF: [57, 16],
      LW: [43, 16],
    },
    "4-4-2": {
      GK: [50, 86],
      LB: [14, 70],
      LCB: [38, 74],
      RCB: [62, 74],
      RB: [86, 70],
      LW: [13, 43],
      LCMF: [40, 43],
      RCMF: [60, 43],
      RW: [87, 43],
      CF: [57, 16],
      DMF: [43, 16],
    },
  };
  const coordinates = layouts[normalizedFormation]?.[role] || [Number(slot?.x) || 50, Number(slot?.y) || 50];
  return { x: coordinates[0], y: coordinates[1] };
}
function normalizeScoutingMyTeamPitchCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.max(4, Math.min(96, Math.round(number * 100) / 100));
}
function getScoutingMyTeamPointerPitchPosition(event, pitchElement) {
  const rect = pitchElement?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) {
    return null;
  }
  const x = normalizeScoutingMyTeamPitchCoordinate(((event.clientX - rect.left) / rect.width) * 100);
  const y = normalizeScoutingMyTeamPitchCoordinate(((event.clientY - rect.top) / rect.height) * 100);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}
function previewScoutingMyTeamSlotPitchPosition(slotElement, coordinates) {
  if (!slotElement || !coordinates) {
    return;
  }
  slotElement.style.setProperty("--x", `${coordinates.x}%`);
  slotElement.style.setProperty("--y", `${coordinates.y}%`);
}
function getScoutingMyTeamAssignedIds(state = ensureScoutingState()) {
  return new Set(Object.values(getScoutingMyTeamState(state).slots).flatMap(normalizeScoutingMyTeamSlotPlayerIds).filter(Boolean));
}
function getScoutingMyTeamInitials(name = "") {
  const parts = normalizeScoutingText(name, 120).split(" ").filter(Boolean);
  return (parts[0]?.[0] || "P") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
}
function getScoutingMyTeamMetaLine(player = {}) {
  return [player.team || "Current squad", player.position || "No position"].filter(Boolean).join(" / ");
}
function getScoutingMyTeamBestRoleLine(player = {}) {
  return normalizeScoutingText(
    player.bestRole || player.best_role || player.roleModel || player.tacticalRole || player.scoutingRole || player.primaryRole || player.position,
    120
  ) || "Best role pending";
}
function formatScoutingMyTeamAge(value) {
  const raw = normalizeScoutingText(value, 20);
  const number = Number(raw);
  return raw && Number.isFinite(number) && number > 0 ? `${Math.round(number)} yrs` : "";
}
function renderScoutingMyTeamInfoPanel(player = {}, slot = null) {
  const age = formatScoutingMyTeamAge(player.age) || "Age unknown";
  const status = normalizeScoutingText(player.status, 80) || "Current squad";
  const role = slot?.position || player.position || "Role";
  return `
    <aside class="scouting-my-team-info-panel" role="tooltip">
      <div>
        <strong>${escapeHtml(player.name || "Unnamed player")}</strong>
        <span>${escapeHtml(role)} baseline</span>
      </div>
      <div class="scouting-my-team-mini-spider" aria-hidden="true">
        <svg class="player-profile-scouting-spider" viewBox="0 0 220 220" role="img" aria-label="Player profile spider">
          <circle class="player-profile-scouting-ring" cx="110" cy="110" r="74" />
          <circle class="player-profile-scouting-ring" cx="110" cy="110" r="49" />
          <circle class="player-profile-scouting-ring" cx="110" cy="110" r="25" />
          <text class="player-profile-scouting-empty-text" x="110" y="108">No data</text>
          <text class="player-profile-scouting-empty-subtext" x="110" y="126">Profile spider</text>
        </svg>
      </div>
      <dl>
        <div><dt>Club</dt><dd>${escapeHtml(player.team || "Current squad")}</dd></div>
        <div><dt>Age</dt><dd>${escapeHtml(age)}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
      </dl>
    </aside>
  `;
}
function renderScoutingMyTeamSpiderButton(player = {}, slot = null, options = {}) {
  const renderPanel = options.renderPanel !== false;
  const isOpen = Boolean(options.open);
  const age = formatScoutingMyTeamAge(player.age) || "Age unknown";
  const canMatchScoutingRecord = renderPanel && hasScoutingMyTeamCandidateRecordSources();
  const linkedRecord = canMatchScoutingRecord ? findScoutingRecordForMyTeamPlayer(player) : null;
  const role = linkedRecord ? getScoutingRecordBestRoleLabel(linkedRecord) : getScoutingMyTeamBestRoleLine(player);
  const status = normalizeScoutingText(player.status, 80) || "Current squad";
  const playerId = getScoutingMyTeamPlayerId(player);
  const dataStatus = linkedRecord
    ? `Linked to ${getScoutingRecordName(linkedRecord)}`
    : canMatchScoutingRecord
      ? "No scouting match yet"
      : "Open Database to match";
  return `
    <details class="scouting-my-team-spider-menu" data-scouting-my-team-spider-shell="${escapeHtml(playerId)}" data-scouting-my-team-spider-linked="${escapeHtml(linkedRecord ? getScoutingRecordId(linkedRecord) : "")}"${isOpen ? " open" : ""}>
      <summary aria-label="Open spider for ${escapeHtml(player.name || "player")}">◎</summary>
      ${
        renderPanel
          ? `<div class="scouting-my-team-spider-panel">
        <div>
          <span>Best profile fit</span>
          <strong>${escapeHtml(role || slot?.label || "No profile fit")}</strong>
          <small>${escapeHtml([linkedRecord ? getScoutingRecordName(linkedRecord) : player.team || "Current squad", age, status].filter(Boolean).join(" · "))}</small>
        </div>
        <div class="scouting-my-team-spider-visual">
          ${
            linkedRecord
              ? getScoutingRecordMiniRadarMarkup(linkedRecord)
              : `
                <svg class="player-profile-scouting-spider" viewBox="0 0 220 220" role="img" aria-label="Player spider">
                  <circle class="player-profile-scouting-ring" cx="110" cy="110" r="78" />
                  <circle class="player-profile-scouting-ring" cx="110" cy="110" r="52" />
                  <circle class="player-profile-scouting-ring" cx="110" cy="110" r="26" />
                  <text class="player-profile-scouting-empty-text" x="110" y="106">${canMatchScoutingRecord ? "No match" : "Database idle"}</text>
                  <text class="player-profile-scouting-empty-subtext" x="110" y="126">${canMatchScoutingRecord ? "Initial + surname" : "Open Database"}</text>
                </svg>
              `
          }
        </div>
        <dl>
          <div><dt>Position</dt><dd>${escapeHtml(slot?.label || player.position || "Unknown")}</dd></div>
          <div><dt>Fit</dt><dd>${escapeHtml(role || "No role model")}</dd></div>
          <div><dt>Data</dt><dd>${escapeHtml(dataStatus)}</dd></div>
        </dl>
      </div>`
          : ""
      }
    </details>
  `;
}
function renderScoutingMyTeamPlayerMenu(player = {}, slot = null) {
  if (!slot || !canEditScoutingWorkspace()) {
    return "";
  }
  const playerId = getScoutingMyTeamPlayerId(player);
  return `
    <details class="scouting-my-team-menu">
      <summary aria-label="Open actions for ${escapeHtml(player.name || "player")}">...</summary>
      <div>
        <button type="button" data-open-scouting-role-models>Role baseline</button>
        <button type="button" data-remove-scouting-my-team-slot="${escapeHtml(slot.id)}" data-remove-scouting-my-team-player="${escapeHtml(playerId)}">Remove player</button>
      </div>
    </details>
  `;
}
function renderScoutingPitchRecordMenu(record, slot, recordId) {
  if (!canEditScoutingWorkspace()) {
    return "";
  }
  return `
    <details class="scouting-my-team-menu scouting-shadow-player-menu">
      <summary aria-label="More actions for ${escapeHtml(getScoutingRecordName(record))}">...</summary>
      <div>
        <button type="button" data-open-scouting-record="${escapeHtml(recordId)}">Open profile</button>
        <button type="button" class="is-danger" data-remove-scouting-shadow-slot="${escapeHtml(slot.id)}" data-remove-scouting-shadow-record="${escapeHtml(recordId)}">
          <span aria-hidden="true">🗑</span>
          Remove player
        </button>
      </div>
    </details>
  `;
}
function renderScoutingPitchRecordProfileButton(record, recordId) {
  return `
    <button type="button" class="scouting-my-team-spider-menu scouting-shadow-profile-trigger" data-open-scouting-record="${escapeHtml(recordId)}" aria-label="Open profile for ${escapeHtml(getScoutingRecordName(record))}">
      ◎
    </button>
  `;
}
function renderScoutingPitchRecordCard(record, options = {}) {
  const recordId = getScoutingRecordId(record);
  const slot = options.slot || null;
  const draggable = canEditScoutingWorkspace() && slot;
  const dragAttributes = slot
    ? `draggable="${draggable ? "true" : "false"}" data-scouting-drag-shadow-record="${escapeHtml(recordId)}" data-scouting-shadow-slot="${escapeHtml(slot.id)}" data-scouting-shadow-drop-slot="${escapeHtml(slot.id)}"`
    : "";
  return `
    <article class="scouting-my-team-player scouting-shadow-player is-compact" ${dragAttributes}>
      ${renderScoutingRecordAvatar(record)}
      <div class="scouting-my-team-player-copy scouting-shadow-player-copy">
        <button type="button" class="scouting-shadow-player-name" data-open-scouting-record="${escapeHtml(recordId)}">
          ${escapeHtml(getScoutingRecordName(record))}
        </button>
        <em>${escapeHtml(getScoutingRecordBestRoleLabel(record) || getScoutingRecordPosition(record) || "Best role pending")}</em>
      </div>
      ${renderScoutingPitchRecordProfileButton(record, recordId)}
      ${slot ? renderScoutingPitchRecordMenu(record, slot, recordId) : ""}
    </article>
  `;
}
function renderScoutingMyTeamPlayerCard(player, options = {}) {
  const id = getScoutingMyTeamPlayerId(player);
  const compact = Boolean(options.compact);
  const slot = options.slot || null;
  const status = normalizeScoutingText(player.status, 80);
  const age = formatScoutingMyTeamAge(player.age);
  const metaLine = compact ? getScoutingMyTeamBestRoleLine(player) : getScoutingMyTeamMetaLine(player);
  const selected = !compact && scoutingMyTeamSelectedPlayerId === id;
  const menuMarkup = compact ? renderScoutingMyTeamPlayerMenu(player, slot) : "";
  const spiderMarkup = compact ? renderScoutingMyTeamSpiderButton(player, slot, { renderPanel: false }) : "";
  return `
    <article class="scouting-my-team-player${compact ? " is-compact" : ""}${selected ? " is-selected" : ""}" draggable="${canEditScoutingWorkspace() ? "true" : "false"}" data-scouting-drag-my-team-player="${escapeHtml(id)}" data-select-scouting-my-team-player="${escapeHtml(id)}">
      <span class="scouting-my-team-avatar">${escapeHtml(getScoutingMyTeamInitials(player.name))}</span>
      <div class="scouting-my-team-player-copy">
        <strong>${escapeHtml(player.name || "Unnamed player")}</strong>
        <em>${escapeHtml(metaLine)}</em>
        ${compact ? "" : `<span>${escapeHtml([age, status].filter(Boolean).join(" / ") || "Ready for placement")}</span>`}
      </div>
      ${spiderMarkup}
      ${menuMarkup}
    </article>
  `;
}
function getScoutingMyTeamActions() {
  if (scoutingMyTeamActions) {
    return scoutingMyTeamActions;
  }
  scoutingMyTeamActions = createScoutingMyTeamActions({
    canEdit: canEditScoutingWorkspace,
    ensureState: ensureScoutingState,
    getMyTeamPlayerById: getScoutingMyTeamPlayerById,
    getMyTeamPlayerId: getScoutingMyTeamPlayerId,
    getMyTeamState: getScoutingMyTeamState,
    getSelectedPlayerId: () => scoutingMyTeamSelectedPlayerId,
    getShadowSlot: getScoutingShadowSlot,
    normalizeFormation: normalizeScoutingFormation,
    normalizePitchCoordinate: normalizeScoutingMyTeamPitchCoordinate,
    normalizeText: normalizeScoutingText,
    refreshWorkspaceAfterLocalMutation: refreshScoutingWorkspaceAfterLocalMutation,
    renderActiveTabSurfaceOrWorkspace: renderScoutingActiveTabSurfaceOrWorkspace,
    setSelectedPlayerId: (playerId) => {
      scoutingMyTeamSelectedPlayerId = playerId || "";
    },
    startPerformance: startScoutingPerformance,
    writeState: writeScoutingState,
  });
  return scoutingMyTeamActions;
}
function getScoutingTargetRecord(target) {
  return getScoutingRecordById(getScoutingTargetRecordId(target));
}
function getScoutingTargetRecordId(target) {
  return normalizeScoutingText(target?.recordId, 160);
}
function findScoutingTargetByRecordId(recordId, state = ensureScoutingState()) {
  const targetRecordId = getScoutingTargetRecordId({ recordId });
  return state.targets.find((target) => getScoutingTargetRecordId(target) === targetRecordId) || null;
}
function findScoutingTargetById(targetId, state = ensureScoutingState()) {
  const target = normalizeScoutingText(targetId, 120);
  return state.targets.find((entry) => normalizeScoutingText(entry.id, 120) === target) || null;
}
function normalizeScoutingComparisonLab(value = {}) {
  const playerIds = normalizeScoutingRecordIds(value.playerIds);
  const metricId = normalizeScoutingText(value.metricId, 120);
  const metricIds = Array.isArray(value.metricIds)
    ? value.metricIds.map((item) => normalizeScoutingText(item, 120)).filter(Boolean)
    : metricId
      ? [metricId]
      : [];
  const slotId = normalizeScoutingText(value.slotId, 40);
  return {
    slotId,
    playerIds: [playerIds[0] || "", playerIds[1] || "", playerIds[2] || "", playerIds[3] || ""],
    metricId: metricIds[0] || "",
    metricIds: Array.from(new Set(metricIds)).slice(0, 12),
  };
}
function getScoutingComparisonLab(state = ensureScoutingState()) {
  return normalizeScoutingComparisonLab(state.comparisonLab);
}
function setScoutingComparisonLab(patch = {}) {
  const state = ensureScoutingState();
  const currentLab = normalizeScoutingComparisonLab(state.comparisonLab);
  const hasPlayerIds = Object.prototype.hasOwnProperty.call(patch, "playerIds");
  const hasMetricIds = Object.prototype.hasOwnProperty.call(patch, "metricIds");
  const hasMetricId = Object.prototype.hasOwnProperty.call(patch, "metricId");
  const hasSlotId = Object.prototype.hasOwnProperty.call(patch, "slotId");
  state.comparisonLab = normalizeScoutingComparisonLab({
    slotId: hasSlotId ? patch.slotId : currentLab.slotId,
    playerIds: hasPlayerIds ? patch.playerIds : currentLab.playerIds,
    metricId: hasMetricId ? patch.metricId : currentLab.metricId,
    metricIds: hasMetricIds ? patch.metricIds : hasMetricId ? [patch.metricId] : currentLab.metricIds,
  });
  writeScoutingState();
}
function syncScoutingComparisonLabFromDom() {
  const form = ui.scoutingWorkspace?.querySelector("[data-scouting-comparison-form]");
  if (!form || !canEditScoutingWorkspace()) {
    return;
  }
  const formData = new FormData(form);
  const metricIds = formData.getAll("metricIds").map((metricId) => normalizeScoutingText(metricId, 120)).filter(Boolean);
  if (!metricIds.length) {
    return;
  }
  const lab = getScoutingComparisonLab();
  if (metricIds.join("|") === (lab.metricIds || []).join("|")) {
    return;
  }
  setScoutingComparisonLab({
    metricId: metricIds[0],
    metricIds,
    playerIds: lab.playerIds,
  });
}
function renderScoutingComparisonWorkspace(options = { preserveFocus: true }) {
  syncScoutingComparisonLabFromDom();
  renderScoutingWorkspace(options);
}
function addScoutingComparisonPlayer(recordId) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id || !canEditScoutingWorkspace()) {
    return;
  }
  const record = getScoutingRecordById(id) || getScoutingComparisonCachedRecordById(id);
  if (record) {
    rememberScoutingRecordSnapshot(record);
  }
  const lab = getScoutingComparisonLab();
  const nextPlayerIds = [lab.playerIds[0] || "", lab.playerIds[1] || "", lab.playerIds[2] || "", lab.playerIds[3] || ""];
  if (nextPlayerIds.includes(id)) {
    scoutingComparisonPlayerSearchQuery = "";
    scoutingComparisonCandidatesOpen = false;
    renderScoutingComparisonWorkspace({ preserveFocus: true });
    window.requestAnimationFrame(() => ui.scoutingWorkspace?.querySelector("[data-scouting-comparison-player-search]")?.focus());
    return;
  }
  const targetIndex = nextPlayerIds.findIndex((playerId) => !playerId);
  if (targetIndex < 0) {
    return;
  }
  nextPlayerIds[targetIndex] = id;
  setScoutingComparisonLab({ ...lab, playerIds: nextPlayerIds });
  scoutingComparisonPlayerSearchQuery = "";
  scoutingComparisonCandidatesOpen = false;
  renderScoutingComparisonWorkspace({ preserveFocus: true });
  window.requestAnimationFrame(() => ui.scoutingWorkspace?.querySelector("[data-scouting-comparison-player-search]")?.focus());
}
function getScoutingComparisonCachedRecordById(recordId) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return null;
  }
  return (Array.isArray(scoutingComparisonSearchCache.records) ? scoutingComparisonSearchCache.records : []).find((record) => getScoutingRecordId(record) === id) || null;
}
function getScoutingComparisonSearchKey(query = "") {
  return `${getScoutingAssetVersion()}::${normalizeScoutingText(query, 120).toLowerCase()}`;
}
function getScoutingComparisonSearchText(record) {
  return [
    getScoutingRecordName(record),
    getScoutingRecordTeam(record),
    getScoutingRecordLeague(record),
    getScoutingRecordPosition(record),
    getScoutingRecordNationality(record),
  ]
    .map((value) => normalizeScoutingText(value, 160).toLowerCase())
    .filter(Boolean)
    .join(" ");
}
function getLocalScoutingComparisonSearchRecords(query = "", limit = 24) {
  const normalizedQuery = normalizeScoutingText(query, 120).toLowerCase();
  if (normalizedQuery.length < 2) {
    return [];
  }
  const database = getScoutingDatabase();
  const records = Array.isArray(database?.records) ? database.records : [];
  return records.filter((record) => getScoutingComparisonSearchText(record).includes(normalizedQuery)).slice(0, limit);
}
function queueScoutingComparisonPlayerSearch(query = scoutingComparisonPlayerSearchQuery) {
  const normalizedQuery = normalizeScoutingText(query, 120);
  window.clearTimeout(scoutingComparisonSearchTimer);
  scoutingComparisonPlayerSearchQuery = normalizedQuery;
  scoutingComparisonCandidatesOpen = true;
  if (normalizedQuery.length < 2) {
    scoutingComparisonSearchCache = { key: getScoutingComparisonSearchKey(normalizedQuery), status: "idle", records: [], error: "", promise: null };
    renderScoutingComparisonWorkspace({ preserveFocus: true });
    return;
  }
  scoutingComparisonSearchTimer = window.setTimeout(() => {
    const key = getScoutingComparisonSearchKey(normalizedQuery);
    if (scoutingComparisonSearchCache.key === key && ["loading", "ready"].includes(scoutingComparisonSearchCache.status)) {
      renderScoutingComparisonWorkspace({ preserveFocus: true });
      return;
    }
    const localRecords = getLocalScoutingComparisonSearchRecords(normalizedQuery, 24);
    scoutingComparisonSearchCache = { key, status: "loading", records: localRecords, error: "", promise: null };
    renderScoutingComparisonWorkspace({ preserveFocus: true });
    const workerQuery = {
      ...getScoutingWorkerQueryFromState(),
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
    const promise = requestScoutingDatabaseWorkerQuery({ query: workerQuery, timeoutMs: 18000 })
      .then((database) => {
        if (scoutingComparisonSearchCache.key !== key) {
          return;
        }
        const remoteRecords = Array.isArray(database?.records) ? database.records : [];
        const recordMap = new Map();
        [...localRecords, ...remoteRecords].forEach((record) => {
          const recordId = getScoutingRecordId(record);
          if (recordId && !recordMap.has(recordId)) {
            recordMap.set(recordId, record);
            rememberScoutingRecordSnapshot(record);
          }
        });
        scoutingComparisonSearchCache = { key, status: "ready", records: Array.from(recordMap.values()).slice(0, 32), error: "", promise: null };
        renderScoutingComparisonWorkspace({ preserveFocus: true });
      })
      .catch((error) => {
        if (scoutingComparisonSearchCache.key !== key) {
          return;
        }
        scoutingComparisonSearchCache = {
          key,
          status: localRecords.length ? "ready" : "error",
          records: localRecords,
          error: error?.message || "Could not search the full scouting database.",
          promise: null,
        };
        renderScoutingComparisonWorkspace({ preserveFocus: true });
      });
    scoutingComparisonSearchCache.promise = promise;
  }, 180);
}
function removeScoutingComparisonPlayer(recordId) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id || !canEditScoutingWorkspace()) {
    return;
  }
  const lab = getScoutingComparisonLab();
  const nextPlayerIds = lab.playerIds.map((playerId) => (playerId === id ? "" : playerId));
  setScoutingComparisonLab({ ...lab, playerIds: nextPlayerIds });
  scoutingComparisonCandidatesOpen = true;
  renderScoutingWorkspace({ preserveFocus: true });
}
function getScoutingRoleModels(state = ensureScoutingState()) {
  return Array.isArray(state.roleModels)
    ? state.roleModels.map((model) => ({
        ...model,
        id: normalizeScoutingText(model?.id, 120),
      }))
    : [];
}
function getScoutingReports(state = ensureScoutingState()) {
  return Array.isArray(state.reports)
    ? [...state.reports].sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0))
    : [];
}
function getScoutingSavedViews(state = ensureScoutingState()) {
  return Array.isArray(state.savedViews) ? state.savedViews.map(cloneScoutingSavedView) : [];
}
function normalizeScoutingContactLogEntry(entry = {}) {
  const now = new Date().toISOString();
  return {
    id: normalizeScoutingText(entry.id, 120) || `scouting-contact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recordId: normalizeScoutingText(entry.recordId, 160),
    date: normalizeScoutingDateText(entry.date) || now.slice(0, 10),
    type: normalizeScoutingContactType(entry.type),
    contact: normalizeScoutingText(entry.contact, 120),
    outcome: normalizeScoutingText(entry.outcome, 160),
    nextStep: normalizeScoutingText(entry.nextStep, 180),
    notes: normalizeScoutingText(entry.notes, 700),
    createdAt: normalizeScoutingText(entry.createdAt, 40) || now,
  };
}
function getScoutingContactLog(state = ensureScoutingState()) {
  return Array.isArray(state.contactLog)
    ? state.contactLog.map(normalizeScoutingContactLogEntry).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
    : [];
}
function getScoutingContactLogForRecord(recordId, state = ensureScoutingState()) {
  const id = normalizeScoutingText(recordId, 160);
  return getScoutingContactLog(state).filter((entry) => entry.recordId === id);
}
function createScoutingContactLogEntry(recordId, entry = {}) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return;
  }
  const state = ensureScoutingState();
  state.contactLog = [
    normalizeScoutingContactLogEntry({
      ...entry,
      recordId: id,
    }),
    ...getScoutingContactLog(state),
  ];
  const target = findScoutingTargetByRecordId(id, state);
  if (target) {
    state.targets = getScoutingTargets(state).map((item) =>
      item.id === target.id
        ? createScoutingTarget(getScoutingRecordById(id), {
            ...target,
            lastContact: normalizeScoutingDateText(entry.date) || new Date().toISOString().slice(0, 10),
            nextAction: normalizeScoutingText(entry.nextStep, 180) || target.nextAction,
            updatedAt: new Date().toISOString(),
          })
        : item
    );
    touchScoutingIntelligenceCache();
  }
  writeScoutingState();
  if (state.selectedRecordId === id && ui.scoutingWorkspace?.querySelector(".scouting-profile-modal")) {
    renderScoutingProfileModalIntoDom(id);
    return;
  }
  renderScoutingWorkspace({ preserveFocus: true });
}
function deleteScoutingContactLogEntry(contactId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const id = normalizeScoutingText(contactId, 120);
  const state = ensureScoutingState();
  const selectedRecordId = normalizeScoutingText(state.selectedRecordId, 160);
  state.contactLog = getScoutingContactLog(state).filter((entry) => entry.id !== id);
  writeScoutingState();
  if (selectedRecordId && ui.scoutingWorkspace?.querySelector(".scouting-profile-modal")) {
    renderScoutingProfileModalIntoDom(selectedRecordId);
    return;
  }
  renderScoutingWorkspace({ preserveFocus: true });
}
function normalizeScoutingReport(report = {}) {
  const now = new Date().toISOString();
  return {
    id: normalizeScoutingText(report.id, 120) || `scouting-report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: normalizeScoutingText(report.title, 160) || "Scouting report",
    type: report.type === "opposition" ? "opposition" : "player",
    targetId: normalizeScoutingText(report.targetId, 120),
    summary: normalizeScoutingText(report.summary, 1200),
    recommendation: normalizeScoutingReportRecommendation(report.recommendation),
    confidence: normalizeScoutingReportScore(report.confidence, 3),
    technical: normalizeScoutingReportScore(report.technical, 3),
    tactical: normalizeScoutingReportScore(report.tactical, 3),
    physical: normalizeScoutingReportScore(report.physical, 3),
    psychological: normalizeScoutingReportScore(report.psychological, 3),
    scoutType: normalizeScoutingText(report.scoutType, 80) || "Video/live",
    createdAt: normalizeScoutingText(report.createdAt, 40) || now,
  };
}
function createScoutingReport(report = {}) {
  const state = ensureScoutingState();
  const nextReport = normalizeScoutingReport(report);
  if (!nextReport.title && !nextReport.summary) {
    return;
  }
  state.reports = [nextReport, ...getScoutingReports(state)];
  writeScoutingState();
  renderScoutingWorkspace();
}
function getScoutingMetric(metricId) {
  const id = normalizeScoutingText(metricId, 120);
  return getScoutingMetricOptions().find((metric) => metric.id === id) || null;
}
function getScoutingMetricIndex(metricId) {
  const database = getScoutingDatabase();
  if (!database) {
    return -1;
  }
  if (scoutingMetricIndexCache.database !== database) {
    scoutingMetricIndexCache = {
      database,
      byId: new Map((database.metrics || []).map((metric, index) => [metric.id, index])),
    };
  }
  const index = scoutingMetricIndexCache.byId.get(metricId);
  return Number.isInteger(index) ? index : -1;
}
function normalizeScoutingMetricAlias(value) {
  return normalizeScoutingText(value, 180)
    .toLowerCase()
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmins?\b/g, "minutes")
    .replace(/\s+/g, " ")
    .trim();
}
function getScoutingMetricIdByLabels(labels = []) {
  const cacheKey = labels.map((label) => normalizeScoutingMetricAlias(label)).filter(Boolean).join("|");
  if (cacheKey && scoutingMetricAliasCache.has(cacheKey)) {
    return scoutingMetricAliasCache.get(cacheKey);
  }
  const indexedMetrics = getScoutingMetricOptions().map((metric) => ({
    metric,
    corpus: [metric.id, metric.key, metric.label].map(normalizeScoutingMetricAlias).filter(Boolean),
  }));
  let resolvedMetricId = "";
  for (const label of labels) {
    const needle = normalizeScoutingMetricAlias(label);
    if (!needle) {
      continue;
    }
    const exactMatch = indexedMetrics.find((entry) => entry.corpus.some((value) => value === needle));
    if (exactMatch) {
      resolvedMetricId = exactMatch.metric.id;
      break;
    }
    const containsMatch = indexedMetrics.find((entry) =>
      entry.corpus.some((value) => value.includes(needle) || needle.includes(value))
    );
    if (containsMatch) {
      resolvedMetricId = containsMatch.metric.id;
      break;
    }
    const words = needle
      .split(" ")
      .filter((word) => word && !["per", "min", "mins", "minutes", "percent", "m"].includes(word));
    const wordMatch = words.length
      ? indexedMetrics.find((entry) => entry.corpus.some((value) => words.every((word) => value.includes(word))))
      : null;
    const match = wordMatch;
    if (match) {
      resolvedMetricId = match.metric.id;
      break;
    }
  }
  if (cacheKey) {
    scoutingMetricAliasCache.set(cacheKey, resolvedMetricId);
  }
  return resolvedMetricId;
}
function getScoutingRecordId(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.id], 160);
}
function getScoutingRecordName(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.player], 160) || "Unknown player";
}
function normalizeScoutingPersonNameForMatch(value = "", limit = 180) {
  return normalizeScoutingText(value, limit)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’`´-]/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function getScoutingPersonNameSignature(value = "") {
  const normalized = normalizeScoutingPersonNameForMatch(value);
  const tokens = normalized.split(" ").filter(Boolean);
  if (!tokens.length) {
    return { normalized: "", firstInitial: "", surname: "" };
  }
  const firstToken = tokens[0] || "";
  const surname = tokens[tokens.length - 1] || "";
  return {
    normalized,
    firstInitial: firstToken.slice(0, 1),
    surname,
  };
}
function getScoutingInitialSurnameAlias(value = "") {
  const signature = getScoutingPersonNameSignature(value);
  return signature.firstInitial && signature.surname ? `${signature.firstInitial} ${signature.surname}` : "";
}
function areScoutingNamesInitialSurnameMatch(firstName = "", secondName = "") {
  const first = getScoutingPersonNameSignature(firstName);
  const second = getScoutingPersonNameSignature(secondName);
  return Boolean(first.firstInitial && first.surname && first.firstInitial === second.firstInitial && first.surname === second.surname);
}
function getScoutingRecordNameAliasTerms(record) {
  const recordName = getScoutingRecordName(record);
  const normalizedName = normalizeScoutingPersonNameForMatch(recordName);
  const initialSurname = getScoutingInitialSurnameAlias(recordName);
  const terms = new Set([normalizedName, initialSurname, initialSurname ? initialSurname.replace(/\s+/g, ". ") : ""]);
  return [...terms].filter(Boolean);
}
function doesScoutingRecordMatchSearchQuery(record, query = "") {
  const normalizedQuery = normalizeScoutingPersonNameForMatch(query, 140);
  if (!normalizedQuery) {
    return true;
  }
  const corpus = normalizeScoutingPersonNameForMatch(getScoutingRecordSearchCorpus(record), 260);
  return corpus.includes(normalizedQuery) || areScoutingNamesInitialSurnameMatch(query, getScoutingRecordName(record));
}
function getScoutingRecordTeam(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.team], 160);
}
function getScoutingRecordLeague(record) {
  return normalizeScoutingLeague(record?.[scoutingRecordIndex.league]);
}
function getScoutingRecordImageUrl(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.imageUrl], 220);
}
function getScoutingRecordPlayerSourceId(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.playerSourceId], 160);
}
function getScoutingRecordSourceSystem(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.sourceSystem], 40) || "file-import";
}
function getScoutingRecordSourceId(record) {
  const trace = getScoutingRecordSourceTrace(record);
  const direct =
    normalizeScoutingText(record?.[scoutingRecordIndex.sourceRecordId], 160) ||
    normalizeScoutingText(trace.sourceRecordId || trace.source_record_id || trace.recordSourceId, 160);
  const sourceSystem = getScoutingRecordSourceSystem(record);
  if (direct) {
    return buildScoutingScopedId(direct, sourceSystem);
  }
  return buildScoutingScopedId(getScoutingRecordId(record) || getScoutingRecordMergeKey(record), sourceSystem);
}
function getScoutingRecordDateOfBirth(record) {
  return normalizeScoutingDateValue(record?.[scoutingRecordIndex.dateOfBirth]);
}
function getScoutingRecordPlayerIdentityId(record) {
  const stored =
    normalizeScoutingText(record?.[scoutingRecordIndex.playerIdentityId], 160) ||
    getScoutingRecordPlayerSourceId(record);
  if (stored) {
    return stored;
  }
  return buildScoutingImportRecordId(
    [
      normalizeScoutingIdentityPart(getScoutingRecordName(record)),
      normalizeScoutingIdentityPart(getScoutingRecordDateOfBirth(record)),
      normalizeScoutingIdentityPart(getScoutingRecordPassportCountry(record) || getScoutingRecordBirthCountry(record)),
    ].filter(Boolean).join("::"),
    "player",
    140
  );
}
function getScoutingRecordSourceTrace(record) {
  const trace = record?.[scoutingRecordIndex.sourceTrace];
  return trace && typeof trace === "object" && !Array.isArray(trace) ? trace : {};
}
function getScoutingRecordMergedSeasonRecords(record) {
  const trace = getScoutingRecordSourceTrace(record);
  return Array.isArray(trace.mergedSeasonRecords) ? trace.mergedSeasonRecords.filter(Boolean) : [];
}
function getScoutingRecordFootballScienceDbMeta(record) {
  const trace = getScoutingRecordSourceTrace(record);
  const fsdb = trace.footballScienceDb;
  return fsdb && typeof fsdb === "object" && !Array.isArray(fsdb) ? fsdb : null;
}
function getScoutingRecordFootballScienceDbReadiness(record) {
  const fsdb = getScoutingRecordFootballScienceDbMeta(record);
  const readiness = fsdb?.dataReadiness && typeof fsdb.dataReadiness === "object" && !Array.isArray(fsdb.dataReadiness)
    ? fsdb.dataReadiness
    : null;
  return readiness
    ? {
        label: normalizeScoutingText(readiness.label, 80) || "Identity only",
        spiderReady: Boolean(readiness.spiderReady),
        statsReady: Boolean(readiness.statsReady),
        rosterReady: Boolean(readiness.rosterReady),
        missing: Array.isArray(readiness.missing) ? readiness.missing.map((item) => normalizeScoutingText(item, 80)).filter(Boolean) : [],
      }
    : null;
}
function renderFootballScienceDbReadinessLine(record) {
  const readiness = getScoutingRecordFootballScienceDbReadiness(record);
  if (!readiness) {
    return "";
  }
  const spiderLabel = readiness.spiderReady ? "Spider ready" : readiness.statsReady ? "Spider needs metric depth" : "Spider needs stats";
  return `<small class="scouting-fit-line">${escapeHtml(`FS DB · ${readiness.label} · ${spiderLabel}`)}</small>`;
}
function getScoutingRecordBirthCountry(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.birthCountry], 120);
}
function getScoutingRecordPassportCountry(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.passportCountry], 120);
}
function getScoutingCountryCode(value = "") {
  const normalized = normalizeScoutingText(value, 120).toLowerCase();
  if (!normalized) {
    return "";
  }
  const tokens = normalized
    .split(/[;,/]/)
    .map((entry) => normalizeScoutingText(entry, 120).toLowerCase())
    .filter(Boolean);
  for (const token of tokens.length ? tokens : [normalized]) {
    const direct = scoutingCountryCodeByName[token];
    if (direct) {
      return direct;
    }
    const cleaned = token
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (cleaned && scoutingCountryCodeByName[cleaned]) {
      return scoutingCountryCodeByName[cleaned];
    }
    const short = cleaned.replace(/\s/g, "");
    if (/^[a-z]{2}$/.test(short)) {
      return short.toUpperCase();
    }
  }
  return "";
}
function getScoutingCountryFlagEmoji(code = "") {
  const normalized = normalizeScoutingText(code, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return "";
  }
  const base = 127462;
  const first = normalized.codePointAt(0) - 65;
  const second = normalized.codePointAt(1) - 65;
  if (first < 0 || first > 25 || second < 0 || second > 25) {
    return "";
  }
  return String.fromCodePoint(base + first, base + second);
}
function getScoutingRecordNationality(record) {
  const nationality = getScoutingRecordNationalityMeta(record);
  return nationality.flag ? `${nationality.flag} ${nationality.code}` : nationality.code;
}
function getScoutingRecordNationalityMeta(record) {
  const passport = getScoutingRecordPassportCountry(record);
  const birth = getScoutingRecordBirthCountry(record);
  const source = passport || birth;
  const code = getScoutingCountryCode(source);
  const flag = getScoutingCountryFlagEmoji(code);
  const label = normalizeScoutingText(source, 160);
  const sourceCode = label.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const displayCode = /^[A-Z]{2,3}$/.test(sourceCode) ? sourceCode : code;
  const fallback = displayCode || code || (label ? label.slice(0, 3).toUpperCase() : "N/A");
  return {
    label: label || "N/A",
    code: fallback,
    flag,
  };
}
function getScoutingRecordInitials(record) {
  const parts = getScoutingRecordName(record)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase());
  if (!parts.length) {
    return "SP";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2);
  }
  return `${parts[0]}${parts[1]}`;
}
function renderScoutingRecordAvatar(record) {
  const imageUrl = getScoutingRecordImageUrl(record);
  const initials = getScoutingRecordInitials(record);
  return imageUrl
    ? `<span class="scouting-record-avatar">
          <img
            src="${escapeHtml(imageUrl)}"
            alt=""
            loading="lazy"
            onerror="this.style.display='none'; const fallback = this.nextElementSibling; if (fallback) { fallback.style.display = 'grid'; }"
          />
          <span class="scouting-record-avatar-fallback" aria-hidden="true">${escapeHtml(initials)}</span>
        </span>`
    : `<span class="scouting-record-avatar"><span class="scouting-record-avatar-fallback" aria-hidden="true">${escapeHtml(initials)}</span></span>`;
}
function getScoutingRecordBestRoleLabel(record) {
  const best = getScoutingRoleScores(record, 1)[0];
  if (best?.profile?.label) {
    return best.profile.label;
  }
  const fallbackProfile = getScoutingDefaultRoleProfile(record);
  return fallbackProfile?.label || "General";
}
function getScoutingComparablePercentile(record, metricId) {
  const calibratedPercentile = getScoutingCalibratedPercentile(record, metricId, "metric", getScoutingActiveBenchmarkMode());
  return Number.isFinite(calibratedPercentile) ? calibratedPercentile : getScoutingPercentile(record, metricId);
}
function getScoutingMiniRadarShortLabel(label = "") {
  const cleaned = normalizeScoutingText(label, 80)
    .replace(/\b(per|p90|90|min|minutes|weighted|role|driver|use|volume)\b/gi, "")
    .replace(/[()%]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = (cleaned || normalizeScoutingText(label, 80)).split(/[\s/-]+/).filter(Boolean);
  if (!words.length) {
    return "Metric";
  }
  if (words.length === 1) {
    return words[0].slice(0, 10);
  }
  return words
    .slice(0, 2)
    .map((word) => word.slice(0, 5))
    .join(" ");
}
function getScoutingRecordMiniRadarMarkup(record) {
  const recordId = getScoutingRecordId(record);
  const benchmarkMode = getScoutingActiveBenchmarkMode();
  const cacheKey = `${recordId}:${benchmarkMode}`;
  if (scoutingRecordMiniRadarCache.has(cacheKey)) {
    return scoutingRecordMiniRadarCache.get(cacheKey);
  }
  const template = getScoutingRadarTemplate(record, "", benchmarkMode);
  if (!template.length) {
    const empty = `<div class="scouting-mini-radar-empty">No data</div>`;
    scoutingRecordMiniRadarCache.set(cacheKey, empty);
    return empty;
  }
  const points = template.slice(0, 6).map((item, index, templateItems) => {
    const percentile = getScoutingTemplatePercentile(record, item, benchmarkMode) || 1;
    const label = normalizeScoutingText(item.label || item.metric || item.id, 80) || `Metric ${index + 1}`;
    const angle = -Math.PI / 2 + (index / templateItems.length) * (Math.PI * 2);
    const radius = 30;
    const center = 36;
    const valueRadius = (radius * percentile) / 100;
    const labelRadius = 36;
    const labelX = center + Math.cos(angle) * labelRadius;
    const labelY = center + Math.sin(angle) * labelRadius;
    return {
      label,
      shortLabel: getScoutingMiniRadarShortLabel(label),
      percentile,
      x: center + Math.cos(angle) * valueRadius,
      y: center + Math.sin(angle) * valueRadius,
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
      labelX,
      labelY,
    };
  });
  const polygon = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const markup = `
    <div class="scouting-mini-radar">
      <strong class="scouting-mini-radar-title">${escapeHtml(template.profileLabel || "Role spider")}</strong>
      <svg class="scouting-mini-radar-svg" viewBox="-8 -8 88 88" role="img" aria-label="Role spider">
        ${points
          .map(
            (point) =>
              `<line class="scouting-radar-axis" x1="36" y1="36" x2="${point.axisX.toFixed(1)}" y2="${point.axisY.toFixed(1)}" />`
          )
          .join("")}
        <circle class="scouting-radar-ring" cx="36" cy="36" r="30" />
        <polygon class="scouting-radar-shape" points="${polygon}" />
        ${points
          .map(
            (point) => `
              <text class="scouting-radar-label" x="${point.labelX.toFixed(1)}" y="${point.labelY.toFixed(1)}">
                <tspan x="${point.labelX.toFixed(1)}">${escapeHtml(point.shortLabel)}</tspan>
                <tspan x="${point.labelX.toFixed(1)}" dy="4.4">P${escapeHtml(point.percentile)}</tspan>
              </text>
            `
          )
          .join("")}
        ${points
          .map(
            (point) => `
              <circle
                class="scouting-radar-dot"
                cx="${point.x.toFixed(1)}"
                cy="${point.y.toFixed(1)}"
                r="2.15"
                tabindex="0"
                aria-label="${escapeHtml(`${point.label}: P${point.percentile}`)}"
              >
                <title>${escapeHtml(`${point.label}: P${point.percentile}`)}</title>
              </circle>
            `
          )
          .join("")}
      </svg>
    </div>
  `;
  scoutingRecordMiniRadarCache.set(cacheKey, markup);
  return markup;
}
function hydrateScoutingRecordMiniRadarShell(shell = null) {
  if (!shell || shell.dataset.scoutingMiniRadarLoaded === "1") {
    return;
  }
  const shellRecordId = normalizeScoutingText(shell.dataset.scoutingMiniRadarShell, 160);
  if (!shellRecordId) {
    return;
  }
  const record = getScoutingRecordById(shellRecordId);
  if (!record) {
    return;
  }
  const popover = shell.querySelector("[role='img']");
  if (!popover) {
    return;
  }
  shell.dataset.scoutingMiniRadarLoaded = "1";
  popover.innerHTML = getScoutingRecordMiniRadarMarkup(record);
}
function bindScoutingRecordMiniRadarShells() {
  const nodes = ui.scoutingWorkspace?.querySelectorAll("[data-scouting-mini-radar-shell]") || [];
  nodes.forEach((shell) => {
    if (shell.dataset.scoutingMiniRadarBound === "1") {
      return;
    }
    const hydrate = () => hydrateScoutingRecordMiniRadarShell(shell);
    shell.addEventListener("mouseenter", hydrate, { passive: true });
    shell.addEventListener("focusin", hydrate, { passive: true });
    shell.dataset.scoutingMiniRadarBound = "1";
  });
}
function getScoutingMyTeamWorkerSearchQuery(player = {}) {
  return getScoutingInitialSurnameAlias(player.name) || normalizeScoutingPersonNameForMatch(player.name, 120) || normalizeScoutingText(player.name, 120);
}
async function hydrateScoutingMyTeamSpiderShell(shell = null) {
  if (!shell || shell.dataset.scoutingMyTeamSpiderLoaded === "1") {
    return;
  }
  const hasRenderedPanel = Boolean(shell.querySelector(".scouting-my-team-spider-panel"));
  if (normalizeScoutingText(shell.dataset.scoutingMyTeamSpiderLinked, 160) && hasRenderedPanel) {
    shell.dataset.scoutingMyTeamSpiderLoaded = "1";
    return;
  }
  const playerId = normalizeScoutingText(shell.dataset.scoutingMyTeamSpiderShell, 160);
  const player = getScoutingMyTeamPlayerById(playerId);
  if (!player) {
    return;
  }
  const slotId = normalizeScoutingText(shell.closest("[data-my-team-slot-role]")?.dataset.myTeamSlotRole, 40);
  const slot = scoutingShadowSlots.find((item) => item.id === slotId) || null;
  let record = findScoutingRecordForMyTeamPlayer(player);
  if (!record && !isScoutingDatabaseLoaded()) {
    shell.outerHTML = renderScoutingMyTeamSpiderButton(player, slot, { renderPanel: true, open: true });
    bindScoutingMyTeamSpiderShells();
    return;
  }
  if (!record && typeof Worker === "function") {
    if (scoutingMyTeamRecordHydrationInFlight.has(playerId)) {
      return;
    }
    scoutingMyTeamRecordHydrationInFlight.add(playerId);
    try {
      const database = await requestScoutingDatabaseWorkerQuery({
        query: {
          ...getScoutingWorkerQueryFromState(),
          query: getScoutingMyTeamWorkerSearchQuery(player),
          league: "all",
          team: "all",
          season: "all",
          position: "all",
          minMinutes: 0,
          maxMinutes: 0,
          minAge: "",
          maxAge: "",
          limit: 25,
          offset: 0,
        },
        timeoutMs: 9000,
      });
      (Array.isArray(database?.records) ? database.records : []).forEach((candidate) => {
        const id = getScoutingRecordId(candidate);
        if (id) {
          scoutingKnownRecordLookupCache.set(id, candidate);
          rememberScoutingRecordSnapshot(candidate, ensureScoutingState(), { includeAnalysis: false });
        }
      });
      scoutingMyTeamRecordMatchCache.clear();
      record = findScoutingRecordForMyTeamPlayer(player);
      if (record) {
        writeScoutingState({ syncCentral: false, syncShadowBoard: false });
      }
    } catch {
      record = null;
    } finally {
      scoutingMyTeamRecordHydrationInFlight.delete(playerId);
    }
  }
  if (!record) {
    shell.outerHTML = renderScoutingMyTeamSpiderButton(player, slot, { renderPanel: true, open: true });
    bindScoutingMyTeamSpiderShells();
    return;
  }
  shell.outerHTML = renderScoutingMyTeamSpiderButton(player, slot, { renderPanel: true, open: true });
  bindScoutingMyTeamSpiderShells();
}
function bindScoutingMyTeamSpiderShells() {
  const nodes = ui.scoutingWorkspace?.querySelectorAll("[data-scouting-my-team-spider-shell]") || [];
  nodes.forEach((shell) => {
    if (shell.dataset.scoutingMyTeamSpiderBound === "1") {
      return;
    }
    const hydrate = () => hydrateScoutingMyTeamSpiderShell(shell);
    shell.addEventListener("toggle", () => {
      if (shell.open) {
        hydrate();
      }
    });
    shell.dataset.scoutingMyTeamSpiderBound = "1";
  });
}
function getScoutingRecordSeason(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.season], 80);
}
function getScoutingRecordPosition(record) {
  const value = normalizeScoutingText(record?.[scoutingRecordIndex.position], 80);
  if (!value) {
    return "";
  }
  return value
    .replace(/\s*[,/]+\s*/g, " / ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function normalizeScoutingOverviewPositionToken(token = "") {
  const compact = normalizeScoutingText(token, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) {
    return "";
  }
  if (["GK", "G", "GOALKEEPER"].includes(compact)) {
    return "GK";
  }
  if (["RCB", "LCB", "CB", "CBR", "CBL", "CENTREBACK", "CENTERBACK", "CENTRALDEFENDER"].includes(compact) || compact.endsWith("CB")) {
    return "CB";
  }
  if (["RB", "RWB", "RIGHTBACK", "RIGHTWINGBACK"].includes(compact)) {
    return "RB";
  }
  if (["LB", "LWB", "LEFTBACK", "LEFTWINGBACK"].includes(compact)) {
    return "LB";
  }
  if (["DM", "DMF", "CDM", "DEFENSIVEMIDFIELDER", "HOLDINGMIDFIELDER"].includes(compact)) {
    return "DM";
  }
  if (["RCM", "LCM", "CM", "RCMF", "LCMF", "CMF", "CENTRALMIDFIELDER", "CENTERMIDFIELDER"].includes(compact) || /C?MF$/.test(compact)) {
    return "CM";
  }
  if (["AM", "AMF", "CAM", "ATTACKINGMIDFIELDER"].includes(compact)) {
    return "AM";
  }
  if (["RW", "RWF", "RM", "RIGHTWINGER", "RIGHTMIDFIELDER"].includes(compact)) {
    return "RW";
  }
  if (["LW", "LWF", "LM", "LEFTWINGER", "LEFTMIDFIELDER"].includes(compact)) {
    return "LW";
  }
  if (["CF", "ST", "FW", "F", "STRIKER", "FORWARD", "CENTREFORWARD", "CENTERFORWARD"].includes(compact)) {
    return "FW";
  }
  return compact.slice(0, 6);
}
function getScoutingRecordOverviewPosition(record) {
  const raw = getScoutingRecordPosition(record);
  const tokens = raw
    .split(/\s*[\/,|;]\s*/)
    .map(normalizeScoutingOverviewPositionToken)
    .filter(Boolean);
  const unique = Array.from(new Set(tokens));
  return unique[0] || normalizeScoutingOverviewPositionToken(raw) || "N/A";
}
function getScoutingRecordAge(record) {
  const value = Number(record?.[scoutingRecordIndex.age]);
  return Number.isFinite(value) ? value : null;
}
function getScoutingRecordMinutes(record) {
  const value = Number(record?.[scoutingRecordIndex.minutes]);
  return Number.isFinite(value) ? value : 0;
}
function normalizeScoutingMetricQuality(value = "") {
  const normalized = normalizeScoutingText(value, 20).toLowerCase();
  return normalized === "trusted" || normalized === "estimated" || normalized === "missing" ? normalized : "trusted";
}
function getScoutingMetricRawEntry(record, metricId) {
  const id = normalizeScoutingText(metricId, 120);
  const metrics = record?.[scoutingRecordIndex.metrics];
  return Array.isArray(metrics)
    ? metrics[getScoutingMetricIndex(id)]
    : metrics && typeof metrics === "object"
      ? metrics[id]
      : null;
}
function getScoutingMetricValue(record, metricId) {
  const id = normalizeScoutingText(metricId, 120);
  if (!record) {
    return null;
  }
  if (id === "minutes") {
    return getScoutingRecordMinutes(record);
  }
  if (id === "matches") {
    const value = Number(record[scoutingRecordIndex.matches]);
    return Number.isFinite(value) ? value : null;
  }
  if (id === "age") {
    return getScoutingRecordAge(record);
  }
  const rawEntry = getScoutingMetricRawEntry(record, id);
  const rawValue = rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry) ? rawEntry.value : rawEntry;
  const value = rawValue === null || rawValue === undefined || rawValue === "" ? NaN : Number(rawValue);
  return Number.isFinite(value) ? value : null;
}
function getScoutingMetricQuality(record, metricId) {
  const id = normalizeScoutingText(metricId, 120);
  if (!record) {
    return "missing";
  }
  if (id === "minutes" || id === "matches" || id === "age") {
    const value = getScoutingMetricValue(record, id);
    return Number.isFinite(value) ? "trusted" : "missing";
  }
  const rawEntry = getScoutingMetricRawEntry(record, id);
  if (rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry)) {
    const value = Number(rawEntry.value);
    if (!Number.isFinite(value)) {
      return "missing";
    }
    return normalizeScoutingMetricQuality(rawEntry.quality);
  }
  const qualityMap = record?.[scoutingRecordIndex.metricQuality];
  if (qualityMap && typeof qualityMap === "object" && !Array.isArray(qualityMap) && qualityMap[id]) {
    return normalizeScoutingMetricQuality(qualityMap[id]);
  }
  return Number.isFinite(Number(rawEntry)) ? "trusted" : "missing";
}
function getScoutingMetricConfidenceFactor(record, metricId) {
  const quality = getScoutingMetricQuality(record, metricId);
  if (quality === "missing") {
    return 0;
  }
  let factor = quality === "estimated" ? 0.84 : 1;
  const minutes = getScoutingRecordMinutes(record);
  if (minutes > 0 && minutes < 180) {
    factor *= 0.72;
  } else if (minutes > 0 && minutes < 450) {
    factor *= 0.86;
  }
  return Math.max(0, Math.min(1, factor));
}
function getScoutingRecordMetricValueCount(record) {
  const metrics = record?.[scoutingRecordIndex.metrics];
  const values = Array.isArray(metrics) ? metrics : Object.values(metrics || {});
  return values.filter((entry) => {
    const value = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.value : entry;
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }).length;
}
function getScoutingRecordLookupFingerprint(database = getScoutingDatabase()) {
  const records = Array.isArray(database?.records) ? database.records : [];
  return [
    normalizeScoutingText(database?.source, 40) || "local",
    normalizeScoutingText(database?.importedAt, 40),
    Array.isArray(database?.metrics) ? database.metrics.length : 0,
    records.length,
    records.length ? getScoutingRecordId(records[0]) : "",
    records.length ? getScoutingRecordId(records[records.length - 1]) : "",
  ].join("|");
}
function ensureScoutingRecordLookupsReady() {
  const database = getScoutingDatabase();
  const fingerprint = getScoutingRecordLookupFingerprint(database);
  if (!fingerprint || fingerprint === scoutingRecordLookupFingerprint) {
    return;
  }
  const records = Array.isArray(database?.records) ? database.records : [];
  const nextIdLookup = new Map();
  const nextNameLookup = new Map();
  const nextPersonLookup = new Map();
  const nextSearchCorpus = new Map();
  for (const record of records) {
    const recordId = getScoutingRecordId(record);
    if (recordId) {
      nextIdLookup.set(recordId, record);
      const searchCorpus = [
        getScoutingRecordName(record),
        ...getScoutingRecordNameAliasTerms(record),
        ...getScoutingRecordKnownFullNameAliases(record),
        getScoutingRecordTeam(record),
        getScoutingRecordLeague(record),
        getScoutingRecordSeason(record),
        getScoutingRecordPosition(record),
        ...getScoutingRoleLabelsForGroup(record),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (searchCorpus) {
        nextSearchCorpus.set(recordId, normalizeScoutingText(searchCorpus, 220).toLowerCase());
      }
    }
    const recordName = getScoutingRecordName(record).toLowerCase();
    if (!recordName) {
      continue;
    }
    const bucket = nextNameLookup.get(recordName);
    if (bucket) {
      bucket.push(record);
    } else {
      nextNameLookup.set(recordName, [record]);
    }
  }
  for (const bucket of nextNameLookup.values()) {
    bucket.sort((a, b) => getScoutingRecordSeason(b).localeCompare(getScoutingRecordSeason(a)) || getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a));
  }
  buildScoutingDatabasePersonClusters(records).forEach((cluster) => {
    const sortedRecords = [...cluster.records].sort(
      (a, b) => getScoutingRecordSeasonYearValue(b) - getScoutingRecordSeasonYearValue(a) || getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a)
    );
    const lookupKeys = new Set();
    cluster.records.forEach((record) => getScoutingRecordPersonLookupKeys(record).forEach((key) => lookupKeys.add(key)));
    lookupKeys.forEach((key) => {
      if (key) {
        nextPersonLookup.set(key, sortedRecords);
      }
    });
  });
  scoutingRecordIdLookupCache = nextIdLookup;
  scoutingRecordNameLookupCache = nextNameLookup;
  scoutingRecordPersonLookupCache = nextPersonLookup;
  scoutingRecordSearchCorpusCache = nextSearchCorpus;
  scoutingRecordLookupFingerprint = fingerprint;
}
function getScoutingRecordSearchCorpus(record) {
  const recordId = getScoutingRecordId(record);
  const cached = recordId ? scoutingRecordSearchCorpusCache.get(recordId) || "" : "";
  const mergedRows = getScoutingRecordMergedSeasonRecords(record);
  if (!mergedRows.length) {
    return cached;
  }
  const mergedCorpus = mergedRows
    .flatMap((seasonRecord) => [
      getScoutingRecordName(seasonRecord),
      ...getScoutingRecordNameAliasTerms(seasonRecord),
      ...getScoutingRecordKnownFullNameAliases(seasonRecord),
      getScoutingRecordTeam(seasonRecord),
      getScoutingRecordLeague(seasonRecord),
      getScoutingRecordSeason(seasonRecord),
      getScoutingRecordPosition(seasonRecord),
      ...getScoutingRoleLabelsForGroup(seasonRecord),
    ])
    .filter(Boolean)
    .join(" ");
  return normalizeScoutingText(`${cached} ${mergedCorpus}`, 800).toLowerCase();
}
function getScoutingRecordStoredIdentityId(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.playerIdentityId], 160);
}
function getScoutingRecordPersonNameKey(record) {
  return normalizeScoutingIdentityPart(getScoutingRecordName(record).replace(/\./g, " "), 140);
}
function getScoutingRecordPersonNationalityKey(record) {
  const nationality = getScoutingRecordNationalityMeta(record);
  const code = nationality.code && nationality.code !== "N/A" ? nationality.code : "";
  return normalizeScoutingIdentityPart(code || nationality.label, 80);
}
function getScoutingRecordPersonAliasKey(record) {
  return normalizeScoutingIdentityPart(getScoutingInitialSurnameAlias(getScoutingRecordName(record)), 140);
}
function getScoutingRecordSoftPersonKey(record) {
  const aliasKey = getScoutingRecordPersonAliasKey(record) || getScoutingRecordPersonNameKey(record);
  const nationalityKey = getScoutingRecordPersonNationalityKey(record);
  const dob = normalizeScoutingIdentityPart(getScoutingRecordDateOfBirth(record), 40);
  return [aliasKey, nationalityKey, dob].filter(Boolean).join("|");
}
function getScoutingRecordPersonLookupKeys(record) {
  const keys = new Set();
  const strongKey = getScoutingRecordStrongPersonKey(record);
  const nameKey = getScoutingRecordPersonNameKey(record);
  const aliasKey = getScoutingRecordPersonAliasKey(record);
  const nationalityKey = getScoutingRecordPersonNationalityKey(record);
  const dob = normalizeScoutingIdentityPart(getScoutingRecordDateOfBirth(record), 40);
  if (strongKey) keys.add(`strong:${strongKey}`);
  if (nameKey && nationalityKey) keys.add(`name:${nameKey}:${nationalityKey}`);
  if (aliasKey && nationalityKey) keys.add(`alias:${aliasKey}:${nationalityKey}`);
  if (aliasKey && dob) keys.add(`aliasdob:${aliasKey}:${dob}`);
  if (nameKey && dob) keys.add(`namedob:${nameKey}:${dob}`);
  return Array.from(keys).filter(Boolean);
}
function getScoutingRecordCanonicalPersonKey(record) {
  const strongKey = getScoutingRecordStrongPersonKey(record);
  if (strongKey) {
    return strongKey;
  }
  const aliasKey = getScoutingRecordPersonAliasKey(record);
  const nameKey = getScoutingRecordPersonNameKey(record);
  const nationalityKey = getScoutingRecordPersonNationalityKey(record);
  const dob = normalizeScoutingIdentityPart(getScoutingRecordDateOfBirth(record), 40);
  return [
    aliasKey || nameKey || "unknown-player",
    nationalityKey || "unknown-nationality",
    dob || "unknown-dob",
  ].join("|");
}
function getScoutingRecordSeasonYearValue(record) {
  const season = getScoutingRecordSeason(record);
  const years = season.match(/\b(?:19|20)\d{2}\b/g);
  if (!years?.length) {
    return 0;
  }
  return Math.max(...years.map((year) => Number(year)).filter(Number.isFinite));
}
function getScoutingRecordStrongPersonKey(record) {
  const sourceSystem = normalizeScoutingIdentityPart(getScoutingRecordSourceSystem(record), 40);
  const sourcePlayerId = normalizeScoutingIdentityPart(getScoutingRecordPlayerSourceId(record), 160);
  const sourceTrace = getScoutingRecordSourceTrace(record);
  const identitySource = normalizeScoutingText(sourceTrace.identitySource, 40).toLowerCase();
  const verifiedIdentitySources = new Set(["football-science-db", "federationid", "wyscoutid", "fbrefid", "transfermarktid"]);
  const sourceIdIsVerified = verifiedIdentitySources.has(identitySource.replace(/[^a-z0-9-]/g, ""));
  if (sourcePlayerId && sourceIdIsVerified) {
    return `source:${sourceSystem}:${sourcePlayerId}`;
  }
  const nameKey = getScoutingRecordPersonNameKey(record);
  const nationalityKey = getScoutingRecordPersonNationalityKey(record);
  const dateOfBirth = normalizeScoutingIdentityPart(getScoutingRecordDateOfBirth(record), 40);
  if (nameKey && nationalityKey && dateOfBirth) {
    return `dob:${nameKey}:${dateOfBirth}:${nationalityKey}`;
  }
  const storedIdentityId = normalizeScoutingIdentityPart(getScoutingRecordStoredIdentityId(record), 160);
  if (storedIdentityId && sourceIdIsVerified) {
    return `identity:${sourceSystem}:${storedIdentityId}`;
  }
  return "";
}
function isScoutingHardPersonKey(key = "") {
  const normalized = normalizeScoutingText(key, 220).toLowerCase();
  return normalized.startsWith("source:") || normalized.startsWith("dob:");
}
function areScoutingNationalitiesCompatible(firstRecord, secondRecord) {
  const first = getScoutingRecordPersonNationalityKey(firstRecord);
  const second = getScoutingRecordPersonNationalityKey(secondRecord);
  return !first || !second || first === second;
}
function areScoutingBirthDatesCompatible(firstRecord, secondRecord) {
  const first = getScoutingRecordDateOfBirth(firstRecord);
  const second = getScoutingRecordDateOfBirth(secondRecord);
  return !first || !second || first === second;
}
function areScoutingAgesSeasonCompatible(firstRecord, secondRecord) {
  const firstAge = getScoutingRecordAge(firstRecord);
  const secondAge = getScoutingRecordAge(secondRecord);
  if (!Number.isFinite(firstAge) || !Number.isFinite(secondAge)) {
    return true;
  }
  const ageSpread = Math.abs(firstAge - secondAge);
  const firstYear = getScoutingRecordSeasonYearValue(firstRecord);
  const secondYear = getScoutingRecordSeasonYearValue(secondRecord);
  if (firstYear && secondYear) {
    const seasonSpread = Math.abs(firstYear - secondYear);
    return ageSpread <= Math.max(3, seasonSpread + 2);
  }
  return ageSpread <= 4;
}
function areScoutingClubSeasonSignalsCompatible(firstRecord, secondRecord) {
  const firstTeam = normalizeScoutingIdentityPart(getScoutingRecordTeam(firstRecord), 180);
  const secondTeam = normalizeScoutingIdentityPart(getScoutingRecordTeam(secondRecord), 180);
  if (!firstTeam || !secondTeam || firstTeam === secondTeam) {
    return true;
  }
  const firstSeason = normalizeScoutingIdentityPart(getScoutingRecordSeason(firstRecord), 80);
  const secondSeason = normalizeScoutingIdentityPart(getScoutingRecordSeason(secondRecord), 80);
  if (firstSeason && secondSeason && firstSeason === secondSeason) {
    const firstStrongKey = getScoutingRecordStrongPersonKey(firstRecord);
    const secondStrongKey = getScoutingRecordStrongPersonKey(secondRecord);
    const hasHardIdentityMatch = firstStrongKey && secondStrongKey && firstStrongKey === secondStrongKey;
    const hasBirthDateMatch =
      getScoutingRecordDateOfBirth(firstRecord) &&
      getScoutingRecordDateOfBirth(firstRecord) === getScoutingRecordDateOfBirth(secondRecord);
    if (!hasHardIdentityMatch && !hasBirthDateMatch) {
      return false;
    }
    const firstAge = getScoutingRecordAge(firstRecord);
    const secondAge = getScoutingRecordAge(secondRecord);
    if (Number.isFinite(firstAge) && Number.isFinite(secondAge) && Math.abs(firstAge - secondAge) > 1) {
      return false;
    }
  }
  return true;
}
function areScoutingPositionsCompatibleForWeakIdentity(firstRecord, secondRecord) {
  const firstGroup = getScoutingPositionGroup(firstRecord);
  const secondGroup = getScoutingPositionGroup(secondRecord);
  if (!firstGroup || !secondGroup || firstGroup === secondGroup) {
    return true;
  }
  if (firstGroup === "GK" || secondGroup === "GK") {
    return false;
  }
  return true;
}
function areScoutingRecordsLikelySamePerson(firstRecord, secondRecord) {
  if (!firstRecord || !secondRecord) {
    return false;
  }
  if (firstRecord === secondRecord) {
    return true;
  }
  const firstStrongKey = getScoutingRecordStrongPersonKey(firstRecord);
  const secondStrongKey = getScoutingRecordStrongPersonKey(secondRecord);
  if (firstStrongKey && secondStrongKey) {
    if (firstStrongKey === secondStrongKey) {
      return true;
    }
    if (isScoutingHardPersonKey(firstStrongKey) || isScoutingHardPersonKey(secondStrongKey)) {
      return false;
    }
  }
  const firstNameKey = getScoutingRecordPersonNameKey(firstRecord);
  const secondNameKey = getScoutingRecordPersonNameKey(secondRecord);
  if (
    firstNameKey !== secondNameKey &&
    !areScoutingNamesInitialSurnameMatch(getScoutingRecordName(firstRecord), getScoutingRecordName(secondRecord))
  ) {
    return false;
  }
  return (
    areScoutingNationalitiesCompatible(firstRecord, secondRecord) &&
    areScoutingBirthDatesCompatible(firstRecord, secondRecord) &&
    areScoutingAgesSeasonCompatible(firstRecord, secondRecord) &&
    areScoutingClubSeasonSignalsCompatible(firstRecord, secondRecord) &&
    areScoutingPositionsCompatibleForWeakIdentity(firstRecord, secondRecord)
  );
}
function getScoutingRepresentativeRecordScore(record, filters = {}) {
  const selectedSeason = normalizeScoutingText(filters.season, 80);
  const seasonYear = getScoutingRecordSeasonYearValue(record);
  const selectedSeasonBonus = selectedSeason && selectedSeason !== "all" && getScoutingRecordSeason(record) === selectedSeason ? 1000000000 : 0;
  const metricsScore = getScoutingRecordMetricValueCount(record) * 1000;
  const minutesScore = Math.min(9999, getScoutingRecordMinutes(record));
  return selectedSeasonBonus + seasonYear * 100000 + metricsScore + minutesScore;
}
function chooseScoutingRepresentativeRecord(records = [], filters = {}) {
  return [...records].sort((first, second) => {
    const scoreDelta = getScoutingRepresentativeRecordScore(second, filters) - getScoutingRepresentativeRecordScore(first, filters);
    if (scoreDelta) {
      return scoreDelta;
    }
    return getScoutingRecordName(first).localeCompare(getScoutingRecordName(second));
  })[0] || null;
}
function buildScoutingDatabasePersonClusters(records = []) {
  const clusters = [];
  for (const record of Array.isArray(records) ? records : []) {
    const strongKey = getScoutingRecordStrongPersonKey(record);
    const softKey = getScoutingRecordSoftPersonKey(record);
    let cluster = strongKey
      ? clusters.find((item) => item.strongKey && item.strongKey === strongKey)
      : null;
    if (!cluster && softKey) {
      cluster = clusters.find((item) => item.softKey && item.softKey === softKey && item.records.every((candidate) => areScoutingRecordsLikelySamePerson(record, candidate)));
    }
    if (!cluster) {
      cluster = clusters.find((item) => {
        if (
          strongKey &&
          item.strongKey &&
          item.strongKey !== strongKey &&
          (isScoutingHardPersonKey(strongKey) || isScoutingHardPersonKey(item.strongKey))
        ) {
          return false;
        }
        return item.records.every((candidate) => areScoutingRecordsLikelySamePerson(record, candidate));
      });
    }
    if (cluster) {
      cluster.records.push(record);
      if (strongKey && !cluster.strongKey) {
        cluster.strongKey = strongKey;
      }
      if (softKey && !cluster.softKey) {
        cluster.softKey = softKey;
      }
    } else {
      clusters.push({ strongKey, softKey, records: [record] });
    }
  }
  return clusters;
}
function attachScoutingMergedSeasonRecords(record, records = []) {
  if (!record) {
    return null;
  }
  const mergedSeasonRecords = [...(Array.isArray(records) ? records : [])].sort((first, second) => {
    const seasonDelta = getScoutingRecordSeasonYearValue(second) - getScoutingRecordSeasonYearValue(first);
    if (seasonDelta) return seasonDelta;
    return getScoutingRecordMinutes(second) - getScoutingRecordMinutes(first);
  });
  const nextRecord = Array.isArray(record) ? record.slice() : { ...record };
  nextRecord[scoutingRecordIndex.sourceTrace] = {
    ...getScoutingRecordSourceTrace(record),
    personClusterKey: getScoutingRecordCanonicalPersonKey(record),
    mergedSeasonRecords,
    mergedSeasonCount: mergedSeasonRecords.length,
    mergedSeasonRecordIds: mergedSeasonRecords.map((seasonRecord) => getScoutingRecordId(seasonRecord)).filter(Boolean),
    seasonOptions: mergedSeasonRecords
      .map((seasonRecord) => getScoutingRecordSeason(seasonRecord))
      .filter((season, index, values) => season && values.indexOf(season) === index),
  };
  return nextRecord;
}
function groupScoutingDatabaseRecordsByPerson(records = [], filters = {}) {
  const clusters = buildScoutingDatabasePersonClusters(records);
  return clusters
    .map((cluster) => attachScoutingMergedSeasonRecords(chooseScoutingRepresentativeRecord(cluster.records, filters), cluster.records))
    .filter(Boolean);
}
function formatScoutingNumber(value, fallback = "n/a") {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  if (Math.abs(number) >= 100) {
    return Math.round(number).toLocaleString("en-US");
  }
  if (Number.isInteger(number)) {
    return number.toLocaleString("en-US");
  }
  return number.toLocaleString("en-US", { maximumFractionDigits: Math.abs(number) < 10 ? 2 : 1 });
}
function getScoutingPositionTokens(recordOrPosition) {
  const position = Array.isArray(recordOrPosition) ? getScoutingRecordPosition(recordOrPosition) : normalizeScoutingText(recordOrPosition, 80);
  return position
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
function scoutingPositionMatchesFilter(recordOrPosition, selectedPosition = "") {
  const position = normalizeScoutingText(selectedPosition, 40).toUpperCase();
  if (!position || position === "ALL") {
    return true;
  }
  const tokens = getScoutingPositionTokens(recordOrPosition);
  if (tokens.includes(position)) {
    return true;
  }
  return ["CB", "CMF", "DMF", "AMF", "WB", "WF", "MF"].includes(position) && tokens.some((token) => token.endsWith(position));
}
function getScoutingPositionGroup(recordOrPosition) {
  const tokens = getScoutingPositionTokens(recordOrPosition);
  if (tokens.some((token) => token.includes("GK"))) {
    return "GK";
  }
  if (tokens.some((token) => ["CB", "RCB", "LCB"].includes(token))) {
    return "CB";
  }
  if (tokens.some((token) => ["RB", "LB", "RWB", "LWB", "WB"].includes(token))) {
    return "FB";
  }
  if (tokens.some((token) => ["DMF", "CMF", "RCMF", "LCMF", "AMF", "MF"].includes(token))) {
    return "MID";
  }
  if (tokens.some((token) => ["RW", "LW", "RWF", "LWF", "WF", "W"].includes(token))) {
    return "WING";
  }
  if (tokens.some((token) => ["CF", "ST", "FW"].includes(token))) {
    return "CF";
  }
  return tokens[0] || "OTHER";
}
function getScoutingDatabaseOptions() {
  if (scoutingDatabaseOptionCache) {
    return scoutingDatabaseOptionCache;
  }
  const database = getScoutingDatabase();
  if (
    database?.options &&
    Array.isArray(database.options.leagues) &&
    Array.isArray(database.options.teams) &&
    Array.isArray(database.options.seasons) &&
    Array.isArray(database.options.positions)
  ) {
    scoutingDatabaseOptionCache = {
      leagues: database.options.leagues,
      teams: database.options.teams,
      seasons: database.options.seasons,
      positions: database.options.positions,
    };
    return scoutingDatabaseOptionCache;
  }
  const leagues = new Set();
  const teams = new Set();
  const seasons = new Set();
  const positions = new Set();
  for (const record of database?.records || []) {
    const league = getScoutingRecordLeague(record);
    const team = getScoutingRecordTeam(record);
    const season = getScoutingRecordSeason(record);
    if (league) {
      leagues.add(league);
    }
    if (team) {
      teams.add(team);
    }
    if (season) {
      seasons.add(season);
    }
    getScoutingPositionTokens(record).forEach((token) => positions.add(token));
  }
  scoutingDatabaseOptionCache = {
    leagues: [...leagues].sort((a, b) => a.localeCompare(b)),
    teams: [...teams].sort((a, b) => a.localeCompare(b)),
    seasons: [...seasons].sort((a, b) => String(b).localeCompare(String(a))),
    positions: [...positions].sort((a, b) => a.localeCompare(b)),
  };
  return scoutingDatabaseOptionCache;
}
function getScoutingImportColumnId(label = "") {
  return normalizeScoutingText(label, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
function findScoutingImportHeader(headers, labels = []) {
  const normalizedHeaders = headers.map((header) => ({
    header,
    normalized: normalizeScoutingText(header, 120).toLowerCase(),
  }));
  for (const label of labels) {
    const needle = normalizeScoutingText(label, 120).toLowerCase();
    const exact = normalizedHeaders.find((item) => item.normalized === needle);
    if (exact) {
      return exact.header;
    }
    const partial = normalizedHeaders.find((item) => item.normalized.includes(needle));
    if (partial) {
      return partial.header;
    }
  }
  return "";
}
function getScoutingImportAutoMap(headers = []) {
  return {
    player: findScoutingImportHeader(headers, ["player", "player name", "name"]),
    team: findScoutingImportHeader(headers, ["team", "squad", "club"]),
    league: findScoutingImportHeader(headers, ["league", "competition"]),
    season: findScoutingImportHeader(headers, ["season", "year"]),
    position: findScoutingImportHeader(headers, ["position", "positions", "pos"]),
    age: findScoutingImportHeader(headers, ["age"]),
    dateOfBirth: findScoutingImportHeader(headers, ["date of birth", "birth date", "dob", "birthday"]),
    matches: findScoutingImportHeader(headers, ["matches", "apps", "appearances"]),
    minutes: findScoutingImportHeader(headers, ["minutes", "mins", "played"]),
    birthCountry: findScoutingImportHeader(headers, ["birth country", "country of birth"]),
    passportCountry: findScoutingImportHeader(headers, ["passport", "nationality"]),
    imageUrl: findScoutingImportHeader(headers, ["image", "image url", "photo", "photo url", "avatar", "headshot", "headshot url"]),
    height: findScoutingImportHeader(headers, ["height"]),
    weight: findScoutingImportHeader(headers, ["weight"]),
    playerIdentityId: findScoutingImportHeader(headers, [
      "player identity id",
      "player_identity_id",
      "playeridentityid",
      "identity id",
    ]),
    sourceIdentityId: findScoutingImportHeader(headers, [
      "source identity id",
      "source_identity_id",
      "source id",
      "external id",
      "external_id",
    ]),
    wyscoutId: findScoutingImportHeader(headers, ["wyscout id", "wyscout_id", "wyscoutid", "wyscout player id"]),
    fbrefId: findScoutingImportHeader(headers, ["fbref id", "fbref_id", "fbrefid", "fbref player id"]),
    transfermarktId: findScoutingImportHeader(headers, [
      "transfermarkt id",
      "transfermarkt_id",
      "transfermarktid",
      "tm id",
      "tm_id",
      "transfermarkt player id",
    ]),
    federationId: findScoutingImportHeader(headers, ["federation id", "federation_id", "federationid"]),
    playerSourceId: findScoutingImportHeader(headers, ["player source id", "player_id", "player id", "source_player_id", "external_id"]),
    sourceRecordId: findScoutingImportHeader(headers, ["record id", "source record id", "source_record_id", "season record id"]),
  };
}
function buildScoutingImportPresetMap(presetId = "", headers = [], map = {}) {
  const normalizedPresetId = normalizeScoutingText(presetId, 40);
  if (!normalizedPresetId) {
    return map || {};
  }
  const preset = scoutingImportSourcePresets.find((item) => normalizeScoutingText(item.id, 40) === normalizedPresetId);
  if (!preset) {
    return map || {};
  }
  const nextMap = {
    ...(map || {}),
  };
  const presetMap = preset.map || {};
  Object.entries(presetMap).forEach(([field, aliases]) => {
    const header = findScoutingImportHeader(headers, Array.isArray(aliases) ? aliases : []);
    if (header) {
      nextMap[field] = header;
    }
  });
  return nextMap;
}
function applyScoutingImportSourcePreset(presetId = "") {
  if (!canEditScoutingWorkspace() || !scoutingImportDraft) {
    return;
  }
  const selected = scoutingImportDraft.sheets?.find((sheet) => sheet.name === scoutingImportDraft.selectedSheet);
  if (!selected) {
    return;
  }
  const normalizedPresetId = normalizeScoutingText(presetId, 40);
  if (!normalizedPresetId) {
    return;
  }
  const preset = scoutingImportSourcePresets.find((item) => normalizeScoutingText(item.id, 40) === normalizedPresetId);
  if (!preset) {
    return;
  }
  scoutingImportDraft = {
    ...scoutingImportDraft,
    sourceSystem: preset.sourceSystem || scoutingImportDraft.sourceSystem,
    map: buildScoutingImportPresetMap(preset.id, selected.headers || [], scoutingImportDraft.map || {}),
    importPreview: null,
  };
  renderScoutingWorkspace({ preserveFocus: true });
}
function getScoutingImportSheetRows(sheet) {
  if (!window.XLSX || !sheet) {
    return [];
  }
  return window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}
function ensureScoutingSpreadsheetParserLoaded() {
  if (window.XLSX?.read) {
    return Promise.resolve(window.XLSX);
  }
  if (!scoutingImportParserPromise) {
    scoutingImportParserPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById("scoutingXlsxParserScript");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.XLSX), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.id = "scoutingXlsxParserScript";
      script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      script.async = true;
      script.onload = () => (window.XLSX?.read ? resolve(window.XLSX) : reject(new Error("Spreadsheet parser did not load.")));
      script.onerror = () => reject(new Error("Spreadsheet parser could not be loaded."));
      document.head.appendChild(script);
    });
  }
  return scoutingImportParserPromise;
}

function getScoutingImportStepState(draft = scoutingImportDraft) {
  if (!draft) {
    return { current: "upload", done: [] };
  }
  if (draft.status === "error") {
    const current = draft.importPreview?.signature ? "publish" : draft.sheets?.length ? "preview" : "upload";
    const done = draft.importPreview?.signature ? ["upload", "preview"] : draft.sheets?.length ? ["upload"] : [];
    return { current, done, error: true };
  }
  if (draft.status === "loading") {
    return { current: "upload", done: [] };
  }
  if (draft.status === "importing") {
    return { current: "publish", done: ["upload", "preview"] };
  }
  if (draft.databaseStored || draft.status === "imported") {
    return { current: "publish", done: ["upload", "preview", "publish"] };
  }
  if (draft.importPreview?.signature) {
    return { current: "publish", done: ["upload", "preview"] };
  }
  return { current: "preview", done: ["upload"] };
}

function getScoutingImportPrimaryActionLabel(draft = scoutingImportDraft) {
  if (draft?.importPreview?.signature) {
    return "Commit to scouting player database";
  }
  return "Build import preview";
}

function getScoutingImportActionHelp(draft = scoutingImportDraft) {
  if (draft?.importPreview?.signature) {
    return "Publishes only new or changed rows. Matching player-season rows are replaced and unchanged rows are skipped.";
  }
  return "Builds a safe preview first. Nothing is published until you commit the preview.";
}

function renderScoutingImportStepTracker(draft = scoutingImportDraft) {
  const state = getScoutingImportStepState(draft);
  const steps = [
    { id: "upload", label: "Upload file", detail: draft?.fileName || "Choose workbook" },
    { id: "preview", label: "Review changes", detail: draft?.importPreview?.signature ? "Preview ready" : "Build preview" },
    {
      id: "publish",
      label: "Publish",
      detail: draft?.databaseStored || draft?.status === "imported" ? "Database updated" : "Commit after review",
    },
  ];
  return `<div class="scouting-import-steps" aria-label="Scouting import progress">
    ${steps.map((step, index) => {
      const done = state.done.includes(step.id);
      const active = state.current === step.id;
      const error = active && state.error;
      return `<span class="scouting-import-step ${done ? "is-done" : ""} ${active ? "is-active" : ""} ${error ? "is-error" : ""}">
        <b>${done ? "✓" : index + 1}</b>
        <span>
          <strong>${escapeHtml(step.label)}</strong>
          <small>${escapeHtml(step.detail)}</small>
        </span>
      </span>`;
    }).join("")}
  </div>`;
}

function setScoutingImportDraftFailure(error, fileName = "") {
  const message = error?.message || "Import failed before the workbook could be read.";
  scoutingImportDraft = {
    status: "error",
    fileName: normalizeScoutingText(fileName || "Uploaded file", 180),
    sourceSystem: getScoutingImportSourceSystem(),
    sourceTypeLabel: "Weekly database upload",
    error: message,
    databaseUploadError: message,
  };
  renderScoutingWorkspace({ preserveFocus: true });
}

function queueScoutingImportPreview(fileName = "") {
  window.setTimeout(() => {
    const stillSameDraft = !fileName || scoutingImportDraft?.fileName === fileName;
    if (!stillSameDraft || scoutingImportDraft?.status !== "ready" || scoutingImportDraft?.importPreview?.signature) {
      return;
    }
    applyScoutingImportDraft();
  }, 0);
}

async function loadScoutingImportFile(file) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  if (!file) {
    return;
  }
  const state = ensureScoutingState();
  state.activeTab = "database";
  writeScoutingState({ syncCentral: false });
  const sourceType = getScoutingImportSourceFromFile(file.name);
  scoutingImportDraft = {
    status: "loading",
    fileName: normalizeScoutingText(file.name, 180),
    sourceSystem: sourceType.id,
    error: "",
  };
  renderScoutingWorkspace({ preserveFocus: true });
  let shouldAutoPreview = false;
  const loadedFileName = normalizeScoutingText(file.name, 180);
  try {
    let sheets = [];
    if (sourceType.parser === "xlsx") {
      try {
        await ensureScoutingSpreadsheetParserLoaded();
        const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        sheets = workbook.SheetNames.map((sheetName) => {
          const rows = getScoutingImportSheetRows(workbook.Sheets[sheetName]).slice(0, 50000);
          const headers = Array.from(
            rows.reduce((set, row) => {
              Object.keys(row || {}).forEach((header) => set.add(header));
              return set;
            }, new Set())
          );
          return {
            name: sheetName,
            rows,
            headers,
          };
        }).filter((sheet) => sheet.headers.length);
        if (!sheets.length) {
          throw new Error("No readable sheet found in the Excel workbook.");
        }
      } catch (error) {
        throw new Error(error?.message || "Could not parse the selected Excel file. Try saving as .xlsx and retry.");
      }
    } else if (sourceType.parser === "json") {
      const payload = JSON.parse(await readScoutingText(file));
      const parsed = parseScoutingJsonRows(payload);
      if (parsed.headers.length) {
        sheets = [{ name: normalizeScoutingText(file.name, 120), rows: parsed.rows, headers: parsed.headers }];
      }
    } else if (sourceType.parser === "pdf") {
      sheets = await parseScoutingPdfSource(file, sourceType);
    } else {
      const rawText = await readScoutingText(file);
      const lines = rawText.split(/\r\n|\r|\n/);
      const delimiter = detectScoutingImportDelimiter(lines);
      const parsedRows = parseScoutingSeparatedRows(rawText, delimiter);
      const parsed = parseScoutingTextRowsToRecords(parsedRows);
      if (parsed.headers.length) {
        sheets = [{ name: normalizeScoutingText(file.name, 120), rows: parsed.rows, headers: parsed.headers }];
      }
    }
    const selectedSheet = sheets[0]?.name || "";
    const selected = sheets.find((sheet) => sheet.name === selectedSheet);
    if (!sheets.length || !selected) {
      throw new Error("No readable data sheets/rows found in the selected file.");
    }
    scoutingImportDraft = {
      status: "ready",
      fileName: loadedFileName,
      sourceSystem: sourceType.id,
      sourceTypeLabel: sourceType.label,
      sheets,
      selectedSheet,
      seasonOverride: "",
      map: getScoutingImportAutoMap(selected?.headers || []),
      error: "",
      databaseUploadStatus: "File loaded. Building import preview so you can review changes before publishing.",
    };
    shouldAutoPreview = true;
  } catch (error) {
    scoutingImportDraft = {
      status: "error",
      fileName: loadedFileName,
      sourceSystem: sourceType.id,
      sourceTypeLabel: sourceType.label,
      error: error?.message || "Import failed.",
      databaseUploadError: error?.message || "Import failed.",
    };
  }
  renderScoutingWorkspace({ preserveFocus: true });
  if (shouldAutoPreview) {
    queueScoutingImportPreview(loadedFileName);
  }
}
function setScoutingImportDraftPatch(patch = {}) {
  if (!scoutingImportDraft) {
    return;
  }
  scoutingImportDraft = {
    ...scoutingImportDraft,
    ...patch,
    importPreview: null,
  };
  if (patch.selectedSheet) {
    const selected = scoutingImportDraft.sheets?.find((sheet) => sheet.name === patch.selectedSheet);
    scoutingImportDraft.map = getScoutingImportAutoMap(selected?.headers || []);
  }
  renderScoutingWorkspace({ preserveFocus: true });
}
function setScoutingImportMapField(field, value) {
  if (!scoutingImportDraft) {
    return;
  }
  scoutingImportDraft = {
    ...scoutingImportDraft,
    importPreview: null,
    map: {
      ...(scoutingImportDraft.map || {}),
      [field]: normalizeScoutingText(value, 120),
    },
  };
}
function getScoutingRecordMergeKey(record) {
  const personIdentityKey = getScoutingRecordStrongPersonKey(record) || getScoutingRecordCanonicalPersonKey(record) || getScoutingRecordPlayerIdentityId(record);
  return getScoutingImportMergeKey(
    normalizeScoutingText(record?.[scoutingRecordIndex.sourceSystem], 40) || "file-import",
    personIdentityKey,
    getScoutingRecordSeason(record),
    getScoutingRecordLeague(record),
    getScoutingRecordTeam(record)
  );
}
function getScoutingMetricFingerprint(metrics = {}) {
  if (Array.isArray(metrics)) {
    return metrics
      .map((entry) => {
        const value = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.value : entry;
        return value === null || value === undefined || value === "" ? null : Number(value);
      });
  }
  return Object.keys(metrics || {})
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const entry = metrics[key];
      const value = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.value : entry;
      const quality = entry && typeof entry === "object" && !Array.isArray(entry) ? normalizeScoutingMetricQuality(entry.quality) : "trusted";
      return [key, Number.isFinite(Number(value)) ? Number(value) : null, quality];
    });
}
function getScoutingRecordImportFingerprint(record) {
  return JSON.stringify({
    player: getScoutingRecordName(record),
    team: getScoutingRecordTeam(record),
    league: getScoutingRecordLeague(record),
    season: getScoutingRecordSeason(record),
    position: getScoutingRecordPosition(record),
    age: getScoutingRecordAge(record),
    matches: getScoutingMetricValue(record, "matches"),
    minutes: getScoutingRecordMinutes(record),
    birthCountry: getScoutingRecordBirthCountry(record),
    passportCountry: getScoutingRecordPassportCountry(record),
    height: normalizeScoutingText(record?.[scoutingRecordIndex.height], 40),
    weight: normalizeScoutingText(record?.[scoutingRecordIndex.weight], 40),
    metrics: getScoutingMetricFingerprint(record?.[scoutingRecordIndex.metrics]),
  });
}
function getScoutingImportIdentitySignature(record) {
  return [
    normalizeScoutingIdentityPart(getScoutingRecordName(record), 120),
    normalizeScoutingIdentityPart(getScoutingRecordDateOfBirth(record), 40),
    normalizeScoutingIdentityPart(getScoutingRecordPassportCountry(record) || getScoutingRecordBirthCountry(record), 120),
  ]
    .filter(Boolean)
    .join("|");
}
function getScoutingImportIdentityLabel(record) {
  const dateOfBirth = getScoutingRecordDateOfBirth(record);
  const nationality = getScoutingRecordPassportCountry(record) || getScoutingRecordBirthCountry(record);
  return [getScoutingRecordName(record), dateOfBirth, nationality].filter(Boolean).join(" / ") || "Unknown player";
}
function preferScoutingImportRecord(nextRecord, currentRecord) {
  if (!currentRecord) {
    return nextRecord;
  }
  const nextScore = getScoutingRecordMetricValueCount(nextRecord) * 10000 + getScoutingRecordMinutes(nextRecord);
  const currentScore = getScoutingRecordMetricValueCount(currentRecord) * 10000 + getScoutingRecordMinutes(currentRecord);
  return nextScore >= currentScore ? nextRecord : currentRecord;
}
function mergeScoutingImportMetrics(existingMetrics = [], importedMetrics = []) {
  const byId = new Map();
  [...existingMetrics, ...importedMetrics].forEach((metric) => {
    const id = normalizeScoutingText(metric?.id, 120);
    if (id && !byId.has(id)) {
      byId.set(id, metric);
    }
  });
  return [...byId.values()];
}
function getScoutingSlotPlayerCount(slots = {}) {
  return Object.values(slots && typeof slots === "object" ? slots : {}).reduce((sum, slot) => {
    const recordIds = Array.isArray(slot?.recordIds) ? slot.recordIds : [];
    return sum + recordIds.length;
  }, 0);
}
function getScoutingImportManualStateSummary(state = ensureScoutingState()) {
  const shadowXi = state?.shadowXi && typeof state.shadowXi === "object" ? state.shadowXi : {};
  const myTeam = state?.myTeam && typeof state.myTeam === "object" ? state.myTeam : {};
  return {
    savedViews: Array.isArray(state?.savedViews) ? state.savedViews.length : 0,
    favorites: normalizeScoutingRecordIds(state?.favoriteRecordIds).length,
    contacts: Array.isArray(state?.contactLog) ? state.contactLog.length : 0,
    lists: Array.isArray(state?.lists) ? state.lists.length : 0,
    targets: Array.isArray(state?.targets) ? state.targets.length : 0,
    reports: Array.isArray(state?.reports) ? state.reports.length : 0,
    comparePlayers: normalizeScoutingRecordIds(state?.compareRecordIds).length,
    shadowXiPlayers: getScoutingSlotPlayerCount(shadowXi.slots),
    myTeamPlayers: getScoutingSlotPlayerCount(myTeam.slots),
  };
}
function buildScoutingImportPreview(database = {}) {
  const existingRecords = getScoutingDatabase()?.records || [];
  const existingByMergeKey = new Map();
  const existingByIdentityId = new Map();
  const existingByIdentitySignature = new Map();
  existingRecords.forEach((record) => {
    const key = getScoutingRecordMergeKey(record);
    if (key) {
      existingByMergeKey.set(key, record);
    }
    const identityId = getScoutingRecordPlayerIdentityId(record);
    if (identityId) {
      if (!existingByIdentityId.has(identityId)) {
        existingByIdentityId.set(identityId, []);
      }
      existingByIdentityId.get(identityId).push(record);
    }
    const identitySignature = getScoutingImportIdentitySignature(record);
    if (identitySignature) {
      if (!existingByIdentitySignature.has(identitySignature)) {
        existingByIdentitySignature.set(identitySignature, []);
      }
      existingByIdentitySignature.get(identitySignature).push(record);
    }
  });
  const operationsByMergeKey = {};
  const samples = [];
  const identityWarnings = [];
  const metricQualityCounts = { trusted: 0, estimated: 0, missing: 0 };
  const summary = {
    incomingRows: database.records?.length || 0,
    newRows: 0,
    replaceRows: 0,
    unchangedRows: 0,
    duplicateRows: database.dedupeSummary?.incomingDuplicates || 0,
    duplicateSamples: database.dedupeSummary?.duplicateSamples || [],
    identityWarningRows: 0,
    criticalIdentityRows: 0,
    identityWarnings,
    metricQualityCounts,
    samples,
    operationsByMergeKey,
    manualStatePreserved: getScoutingImportManualStateSummary(),
    signature: database.importSignature || "",
  };
  (database.records || []).forEach((record) => {
    const key = getScoutingRecordMergeKey(record);
    const existing = key ? existingByMergeKey.get(key) : null;
    const operation = !existing
      ? "new"
      : getScoutingRecordImportFingerprint(existing) === getScoutingRecordImportFingerprint(record)
        ? "unchanged"
        : "replace";
    operationsByMergeKey[key] = operation;
    if (operation === "new") {
      summary.newRows += 1;
    } else if (operation === "replace") {
      summary.replaceRows += 1;
    } else {
      summary.unchangedRows += 1;
    }
    const identityId = getScoutingRecordPlayerIdentityId(record);
    const sourceTrace = getScoutingRecordSourceTrace(record);
    const identitySource = normalizeScoutingText(sourceTrace.identitySource, 40) || "unknown";
    const identitySourceMapped = identitySource !== "derived";
    const identitySignature = getScoutingImportIdentitySignature(record);
    const identityIssueLabels = [];
    const hasDateOfBirth = Boolean(getScoutingRecordDateOfBirth(record));
    const hasNationality = Boolean(getScoutingRecordPassportCountry(record) || getScoutingRecordBirthCountry(record));
    const existingIdentityRows = existingByIdentityId.get(identityId) || [];
    const conflictingIdentity = existingIdentityRows.find((existingRecord) => {
      const existingSignature = getScoutingImportIdentitySignature(existingRecord);
      return existingSignature && identitySignature && existingSignature !== identitySignature;
    });
    const possibleAlias = identitySignature
      ? (existingByIdentitySignature.get(identitySignature) || []).find((existingRecord) => getScoutingRecordPlayerIdentityId(existingRecord) !== identityId)
      : null;
    if (!identitySourceMapped) {
      identityIssueLabels.push(hasDateOfBirth && hasNationality ? "Derived identity" : "Weak identity");
    }
    if (!hasDateOfBirth) {
      identityIssueLabels.push("Missing DOB");
    }
    if (!hasNationality) {
      identityIssueLabels.push("Missing nationality");
    }
    if (conflictingIdentity) {
      identityIssueLabels.push("Identity conflict");
    }
    if (possibleAlias) {
      identityIssueLabels.push("Possible alias");
    }
    if (identityIssueLabels.length) {
      const isCriticalIdentityIssue = identityIssueLabels.includes("Identity conflict") || identityIssueLabels.includes("Possible alias");
      summary.identityWarningRows += 1;
      if (isCriticalIdentityIssue) {
        summary.criticalIdentityRows += 1;
      }
      if (identityWarnings.length < 8) {
        identityWarnings.push({
          labels: Array.from(new Set(identityIssueLabels)),
          name: getScoutingRecordName(record),
          detail: conflictingIdentity
            ? `Same player ID already exists as ${getScoutingImportIdentityLabel(conflictingIdentity)}.`
            : possibleAlias
              ? `Same DOB/nationality profile exists under another player ID: ${getScoutingRecordPlayerIdentityId(possibleAlias)}.`
              : !identitySourceMapped
                ? "No mapped source player ID found. Merge is based on derived name/DOB/nationality identity."
                : "Identity data should be completed before commit.",
          team: getScoutingRecordTeam(record),
          league: getScoutingRecordLeague(record),
          season: getScoutingRecordSeason(record),
        });
      }
    }
    const metricQuality = record?.[scoutingRecordIndex.metricQuality] || {};
    Object.values(metricQuality).forEach((quality) => {
      const normalized = normalizeScoutingMetricQuality(quality);
      metricQualityCounts[normalized] += 1;
    });
    if (samples.length < 6 && operation !== "unchanged") {
      samples.push({
        operation,
        name: getScoutingRecordName(record),
        team: getScoutingRecordTeam(record),
        league: getScoutingRecordLeague(record),
        season: getScoutingRecordSeason(record),
      });
    }
  });
  summary.importSafety =
    summary.criticalIdentityRows > 0
      ? {
          tone: "danger",
          label: "Stop and review identity",
          detail: `${summary.criticalIdentityRows} player rows may collide with an existing player identity. Check aliases before commit.`,
        }
      : summary.identityWarningRows > 0
        ? {
            tone: "warning",
            label: "Review before commit",
            detail: `${summary.identityWarningRows} player rows use derived or incomplete identity. Commit only if name, DOB and nationality look correct.`,
          }
        : summary.replaceRows > 0 || summary.newRows > 0
          ? {
              tone: "safe",
          label: "Safe to commit",
          detail: "No identity conflicts detected in this preview. New and replaced rows will keep source trace metadata; manual notes and lists are preserved.",
        }
          : {
              tone: "neutral",
              label: "No changes detected",
              detail: "This import does not change the scouting player database.",
            };
  return summary;
}
function getScoutingImportPublishDatabase(database = {}, preview = {}) {
  const operations = preview.operationsByMergeKey || {};
  return {
    ...database,
    records: (database.records || []).filter((record) => {
      const operation = operations[getScoutingRecordMergeKey(record)];
      return operation === "new" || operation === "replace";
    }),
  };
}
function mergeScoutingImportedDatabase(database = {}, preview = {}) {
  const existing = getScoutingDatabase();
  const operations = preview.operationsByMergeKey || {};
  const incomingRecords = (database.records || []).filter((record) => {
    const operation = operations[getScoutingRecordMergeKey(record)];
    return operation === "new" || operation === "replace";
  });
  const incomingByMergeKey = new Map(incomingRecords.map((record) => [getScoutingRecordMergeKey(record), record]));
  const nextRecords = [
    ...(existing?.records || []).filter((record) => !incomingByMergeKey.has(getScoutingRecordMergeKey(record))),
    ...incomingRecords,
  ];
  return {
    ...database,
    records: nextRecords,
    metrics: mergeScoutingImportMetrics(existing?.metrics || [], database.metrics || []),
    preview,
  };
}
function renderScoutingImportDiffPreview(preview = null) {
  if (!preview?.signature) {
    return "";
  }
  const quality = preview.metricQualityCounts || {};
  const safety = preview.importSafety || {};
  const manual = preview.manualStatePreserved || {};
  const manualTotal =
    (manual.savedViews || 0) +
    (manual.favorites || 0) +
    (manual.contacts || 0) +
    (manual.lists || 0) +
    (manual.targets || 0) +
    (manual.reports || 0) +
    (manual.comparePlayers || 0) +
    (manual.shadowXiPlayers || 0) +
    (manual.myTeamPlayers || 0);
  return `
    <div class="scouting-import-diff-preview">
      <div class="scouting-import-safety is-${escapeHtml(safety.tone || "neutral")}">
        <strong>${escapeHtml(safety.label || "Import preview")}</strong>
        <p>${escapeHtml(safety.detail || "Review the changed rows before commit.")}</p>
      </div>
      <div class="scouting-import-diff-grid">
        <article><span>New</span><strong>${escapeHtml(preview.newRows || 0)}</strong></article>
        <article><span>Replace</span><strong>${escapeHtml(preview.replaceRows || 0)}</strong></article>
        <article><span>Unchanged</span><strong>${escapeHtml(preview.unchangedRows || 0)}</strong></article>
        <article><span>Deduped</span><strong>${escapeHtml(preview.duplicateRows || 0)}</strong></article>
        <article><span>Review flags</span><strong>${escapeHtml(preview.identityWarningRows || 0)}</strong></article>
        <article><span>Manual preserved</span><strong>${escapeHtml(manualTotal)}</strong></article>
      </div>
      <p>${escapeHtml(`Metric quality: ${quality.trusted || 0} trusted / ${quality.estimated || 0} estimated / ${quality.missing || 0} missing.`)}</p>
      <p>${escapeHtml(
        `Manual work stays intact: ${manual.favorites || 0} favorites, ${manual.lists || 0} lists, ${manual.contacts || 0} contacts, ${manual.targets || 0} pipeline targets, ${manual.reports || 0} reports, ${manual.shadowXiPlayers || 0} Shadow XI players and ${manual.myTeamPlayers || 0} My Team players.`
      )}</p>
      ${
        preview.identityWarnings?.length
          ? `<div class="scouting-import-risk-list">${preview.identityWarnings
              .map(
                (row) => `
                  <article>
                    <strong>${escapeHtml(`${row.labels.join(" + ")} · ${row.name || "Unknown player"}`)}</strong>
                    <p>${escapeHtml(row.detail || "Review identity before commit.")}</p>
                    <span>${escapeHtml(`${row.team || "No club"} · ${row.league || "No league"} · ${row.season || "No season"}`)}</span>
                  </article>
                `
              )
              .join("")}</div>`
          : ""
      }
      ${
        preview.duplicateSamples?.length
          ? `<div class="scouting-import-risk-list is-muted">${preview.duplicateSamples
              .map(
                (row) => `
                  <article>
                    <strong>${escapeHtml(`Deduped · ${row.name || "Unknown player"}`)}</strong>
                    <p>${escapeHtml(`Kept strongest row by metric coverage/minutes. Minutes kept: ${row.keptMinutes || 0}; dropped: ${row.droppedMinutes || 0}.`)}</p>
                    <span>${escapeHtml(`${row.team || "No club"} · ${row.league || "No league"} · ${row.season || "No season"}`)}</span>
                  </article>
                `
              )
              .join("")}</div>`
          : ""
      }
      ${
        preview.samples?.length
          ? `<div class="scouting-import-diff-list">${preview.samples
              .map((row) => `<span>${escapeHtml(`${row.operation.toUpperCase()} · ${row.name} · ${row.team || "No club"} · ${row.league || "No league"} · ${row.season || "No season"}`)}</span>`)
              .join("")}</div>`
          : `<p>${escapeHtml("No changed rows in this preview.")}</p>`
      }
    </div>
  `;
}
function buildScoutingImportedDatabase() {
  if (!scoutingImportDraft || scoutingImportDraft.status !== "ready") {
    return null;
  }
  const selected = scoutingImportDraft.sheets.find((sheet) => sheet.name === scoutingImportDraft.selectedSheet);
  const sheets = getScoutingImportSheetsForBatch(scoutingImportDraft);
  if (!selected || !sheets.length) {
    return null;
  }
  const map = scoutingImportDraft.map || {};
  const batchHeaders = getScoutingImportHeadersForBatch(sheets);
  const metricHeaders = getScoutingImportMetricHeaders(batchHeaders, map);
  const metrics = metricHeaders
    .map((header) => ({
      id: `import_${getScoutingImportColumnId(header)}`,
      label: normalizeScoutingText(header, 120),
      direction: getScoutingImportMetricDirection(header),
      sourceColumn: normalizeScoutingText(header, 160),
    }))
      .filter((metric, index, values) => metric.label && values.findIndex((item) => item.id === metric.id) === index);
  const importedAt = new Date().toISOString();
  const sourceSystem = getScoutingImportSourceSystem();
  let incomingDuplicates = 0;
  const duplicateSamples = [];
  const recordsByMergeKey = new Map();
  sheets
    .flatMap((sheet) =>
      sheet.rows.map((row, index) => ({
        row,
        rowIndex: index,
        sheetName: sheet.name,
      }))
    )
    .map(({ row, rowIndex, sheetName }) => {
      const player = normalizeScoutingText(row[map.player], 160);
      const team = normalizeScoutingText(row[map.team], 160);
      const league = normalizeScoutingLeague(row[map.league]);
      const season = normalizeScoutingText(scoutingImportDraft.seasonOverride || row[map.season], 80);
      const position = normalizeScoutingText(row[map.position], 80);
      if (!player && !team && !position) {
        return null;
      }
      const identityCandidates = getScoutingImportIdentityCandidates(row, map);
      const mappedPlayerSourceId =
        identityCandidates[0]?.value && isScoutingVerifiedImportIdentityKey(identityCandidates[0]?.key) ? identityCandidates[0].value : "";
      const playerSourceId = buildScoutingPlayerSourceId(row, map);
      const sourceRecordId = buildScoutingRecordSourceId(row, map, playerSourceId);
      const age = parseScoutingMetricValue(row[map.age]) || "";
      const matches = parseScoutingMetricValue(row[map.matches]) || "";
      const minutes = Math.max(0, Math.round(parseScoutingMetricValue(row[map.minutes]) || 0));
      const dateOfBirth = normalizeScoutingDateValue(row[map.dateOfBirth]);
      const mergeKey = getScoutingImportMergeKey(sourceSystem, playerSourceId, season, league, team);
      const metricValues = {};
      const metricQuality = {};
      for (const metric of metrics) {
        const header = metric.label;
        const value = parseScoutingMetricValue(row[header]);
        const quality = getScoutingImportMetricQuality(row[header], minutes);
        metricQuality[metric.id] = quality;
        if (Number.isFinite(value) && quality !== "missing") {
          metricValues[metric.id] = {
            value,
            quality,
          };
        }
      }
      const sourceTrace = {
        sourceSystem,
        sourceFileName: scoutingImportDraft.fileName || "",
        sheetName,
        sourceRowNumber: rowIndex + 2,
        uploadedAt: importedAt,
        importedAt,
        importBatchId: "",
        playerIdentityId: playerSourceId,
        sourcePlayerAlias: player,
        identitySource: mappedPlayerSourceId ? identityCandidates[0]?.key || "playerSourceId" : "derived",
        identitySourceLabel: mappedPlayerSourceId ? identityCandidates[0]?.label || "mapped source id" : "name + date of birth + nationality",
        identityCandidateCount: identityCandidates.length || 0,
        identityCandidates: identityCandidates.map((candidate) => ({ key: candidate.key, label: candidate.label, value: candidate.value })),
        identityBasis: mappedPlayerSourceId ? `mapped ${identityCandidates[0]?.label || "player id"}` : "name + date of birth + nationality",
        sourceRecordId,
        mergeKey,
      };
      return [
        sourceRecordId,
        player,
        team,
        team,
        league,
        season,
        position,
        age,
        matches,
        minutes,
        normalizeScoutingText(row[map.birthCountry], 120),
        normalizeScoutingText(row[map.passportCountry], 120),
        normalizeScoutingText(row[map.height], 40),
        normalizeScoutingText(row[map.weight], 40),
        metricValues,
        sourceSystem,
        playerSourceId,
        sourceRecordId,
        normalizeScoutingText(row[map.imageUrl], 220),
        playerSourceId,
        sourceTrace,
        metricQuality,
        dateOfBirth,
      ];
    })
    .filter(Boolean)
    .forEach((record) => {
      const mergeKey = getScoutingRecordMergeKey(record);
      if (recordsByMergeKey.has(mergeKey)) {
        incomingDuplicates += 1;
        if (duplicateSamples.length < 6) {
          const kept = preferScoutingImportRecord(record, recordsByMergeKey.get(mergeKey));
          const dropped = kept === record ? recordsByMergeKey.get(mergeKey) : record;
          duplicateSamples.push({
            name: getScoutingRecordName(record),
            team: getScoutingRecordTeam(record),
            league: getScoutingRecordLeague(record),
            season: getScoutingRecordSeason(record),
            keptMinutes: getScoutingRecordMinutes(kept),
            droppedMinutes: getScoutingRecordMinutes(dropped),
          });
        }
      }
      recordsByMergeKey.set(mergeKey, preferScoutingImportRecord(record, recordsByMergeKey.get(mergeKey)));
    });
  const records = [...recordsByMergeKey.values()];
  const metricSignature = buildScoutingImportCollectionHash(
    metrics.map((metric) => `${metric.id}:${metric.label}:${metric.direction}:${metric.sourceColumn}`)
  );
  const recordSignature = buildScoutingImportCollectionHash(
    records
      .slice()
      .sort((a, b) => getScoutingRecordMergeKey(a).localeCompare(getScoutingRecordMergeKey(b)))
      .map((record) => `${getScoutingRecordMergeKey(record)}:${getScoutingRecordImportFingerprint(record)}`)
  );
  const importSignature = buildScoutingImportCollectionHash([
    scoutingImportDraft.fileName,
    sheets.map((sheet) => sheet.name).join("~"),
    sourceSystem,
    scoutingImportDraft.seasonOverride || "",
    JSON.stringify(scoutingImportDraft.map || {}),
    records.length,
    metrics.length,
    metricSignature,
    recordSignature,
  ]);
  return {
    source: "ui-import",
    fileName: scoutingImportDraft.fileName,
    importedAt,
    sheets: sheets.map((sheet) => sheet.name),
    metrics,
    records,
    importSignature,
    importContentSignature: recordSignature,
    dedupeSummary: {
      incomingDuplicates,
      duplicateSamples,
      mergeStrategy: "sourceSystem + playerId + season + league + team",
    },
  };
}
function applyScoutingImportDraft() {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const database = buildScoutingImportedDatabase();
  if (!database?.records?.length) {
    const failedSummary = {
      status: "failed",
      fileName: scoutingImportDraft?.fileName || "Uploaded file",
      sourceSystem: scoutingImportDraft?.sourceSystem || getScoutingImportSourceSystem(),
      sourceTypeLabel: scoutingImportDraft?.sourceTypeLabel || "",
      rowCount: 0,
      metricCount: 0,
      season: scoutingImportDraft?.seasonOverride || "",
      startedAt: scoutingImportDraft?.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      databaseStored: false,
      databaseUploadError: "No importable player rows found. Check column mapping.",
    };
    scoutingImportDraft = {
      ...(scoutingImportDraft || {}),
      status: "error",
      error: "No importable player rows found. Check column mapping.",
      lastUploadSummary: failedSummary,
    };
    setScoutingImportLastUploadSummary(failedSummary);
    renderScoutingWorkspace({ preserveFocus: true });
    return;
  }
  const preview = buildScoutingImportPreview(database);
  const previewAccepted = scoutingImportDraft?.importPreview?.signature === database.importSignature;
  if (!previewAccepted) {
    scoutingImportDraft = {
      ...(scoutingImportDraft || {}),
      importPreview: preview,
      databaseUploadStatus: "Preview ready. Review new, replaced, unchanged and flagged rows before publishing.",
      databaseUploadError: "",
      importedCount: database.records.length,
      metricCount: database.metrics.length,
    };
    renderScoutingWorkspace({ preserveFocus: true });
    return;
  }
  if (preview.criticalIdentityRows > 0 && scoutingImportDraft?.criticalImportOverrideSignature !== database.importSignature) {
    scoutingImportDraft = {
      ...(scoutingImportDraft || {}),
      importPreview: preview,
      criticalImportOverrideSignature: database.importSignature,
      databaseUploadStatus: "Critical identity review required. Check the flagged rows, then press commit again if this import is intentional.",
      databaseUploadError: "",
      importedCount: database.records.length,
      metricCount: database.metrics.length,
    };
    renderScoutingWorkspace({ preserveFocus: true });
    return;
  }
  const publishDatabase = getScoutingImportPublishDatabase(database, preview);
  const mergedDatabase = mergeScoutingImportedDatabase(database, preview);
  window.__footballScienceImportedScoutingDatabase = mergedDatabase;
  scoutingDatabaseOptionCache = null;
  resetScoutingComputedCaches();
  try {
    window.localStorage?.setItem(scoutingImportedDatabaseStorageKey, JSON.stringify(mergedDatabase));
  } catch {}
  if (!publishDatabase.records.length) {
    const unchangedSummary = {
      status: "published",
      fileName: database.fileName || "Uploaded file",
      sourceSystem: scoutingImportDraft?.sourceSystem || getScoutingImportSourceSystem(),
      sourceTypeLabel: scoutingImportDraft?.sourceTypeLabel || "",
      rowCount: 0,
      metricCount: database.metrics.length,
      season: scoutingImportDraft?.seasonOverride || "",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      databaseStored: true,
      importPreview: preview,
      databaseUploadStatus: "No changed rows to publish.",
    };
    scoutingImportDraft = {
      ...scoutingImportDraft,
      status: "imported",
      databaseStored: true,
      databaseUploadStatus: "No changed rows to publish.",
      databaseUploadError: "",
      lastUploadSummary: unchangedSummary,
      importedCount: 0,
      metricCount: database.metrics.length,
    };
    setScoutingImportLastUploadSummary(unchangedSummary);
    renderScoutingWorkspace({ preserveFocus: true });
    return;
  }
  scoutingImportDraft = {
    ...scoutingImportDraft,
    status: "importing",
    databaseStored: false,
    databaseUploadStatus: "Uploading to scouting player database...",
    databaseUploadError: "",
    lastUploadSummary: {
      status: "importing",
      fileName: database.fileName || "Uploaded file",
      sourceSystem: scoutingImportDraft?.sourceSystem || getScoutingImportSourceSystem(),
      sourceTypeLabel: scoutingImportDraft?.sourceTypeLabel || "",
      rowCount: publishDatabase.records.length,
      metricCount: database.metrics.length,
      season: scoutingImportDraft?.seasonOverride || "",
      startedAt: new Date().toISOString(),
      batchId: "",
      databaseStored: false,
      importPreview: preview,
    },
    importedCount: publishDatabase.records.length,
    metricCount: database.metrics.length,
  };
  setScoutingImportLastUploadSummary(scoutingImportDraft.lastUploadSummary);
  void publishScoutingExcelImportToDatabase(publishDatabase).then((result) => {
    if (!result || result.ok === false) {
      scoutingImportDraft = {
        ...(scoutingImportDraft || {}),
        status: "error",
        databaseStored: false,
        databaseUploadError: result?.reason || "Scouting player database upload failed. Local import is still active.",
      };
      scoutingImportDraft.lastUploadSummary = {
        ...(scoutingImportDraft.lastUploadSummary || {}),
        status: "failed",
        databaseStored: false,
        updatedAt: new Date().toISOString(),
        databaseUploadError: scoutingImportDraft.databaseUploadError,
      };
      setScoutingImportLastUploadSummary(scoutingImportDraft.lastUploadSummary);
      renderScoutingWorkspace({ preserveFocus: true });
      return;
    }
    if (result?.result?.enabled === false) {
      scoutingImportDraft = {
        ...(scoutingImportDraft || {}),
        status: "imported",
        databaseStored: false,
        databaseUploadError:
          result.result?.reason ||
          "Scouting player database mode is disabled. Data is stored locally in your scouting database.",
      };
      scoutingImportDraft.lastUploadSummary = {
        ...(scoutingImportDraft.lastUploadSummary || {}),
        status: "published",
        databaseStored: false,
        updatedAt: new Date().toISOString(),
      };
      setScoutingImportLastUploadSummary(scoutingImportDraft.lastUploadSummary);
      renderScoutingWorkspace({ preserveFocus: true });
      return;
    }
    scoutingImportDraft = {
      ...(scoutingImportDraft || {}),
      status: "imported",
      databaseStored: true,
      databaseUploadStatus: "Scouting player database updated",
      databaseUploadError: "",
      importedCount: database.records.length,
      metricCount: database.metrics.length,
      lastUploadSummary: {
        ...(scoutingImportDraft.lastUploadSummary || {}),
        status: "published",
        databaseStored: true,
        batchId: result?.result?.importBatchId || scoutingImportDraft.lastUploadSummary?.batchId || "",
        rowCount: publishDatabase.records.length,
        updatedAt: new Date().toISOString(),
      },
    };
    setScoutingImportLastUploadSummary(scoutingImportDraft.lastUploadSummary);
    void loadScoutingImportHistory();
    renderScoutingWorkspace({ preserveFocus: true });
  }).catch((error) => {
    scoutingImportDraft = {
      ...(scoutingImportDraft || {}),
      status: "error",
      databaseStored: false,
      databaseUploadError: error?.message || "Scouting player database upload failed. Local import is still active.",
    };
    scoutingImportDraft.lastUploadSummary = {
      ...(scoutingImportDraft.lastUploadSummary || {}),
      status: "failed",
      databaseStored: false,
      updatedAt: new Date().toISOString(),
      databaseUploadError: scoutingImportDraft.databaseUploadError,
    };
    setScoutingImportLastUploadSummary(scoutingImportDraft.lastUploadSummary);
    renderScoutingWorkspace({ preserveFocus: true });
  });
  renderScoutingWorkspace();
}
function clearScoutingImportedDatabase() {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  delete window.__footballScienceImportedScoutingDatabase;
  scoutingImportedDatabaseLoaded = true;
  scoutingDatabaseOptionCache = null;
  resetScoutingComputedCaches();
  try {
    window.localStorage?.removeItem(scoutingImportedDatabaseStorageKey);
  } catch {}
  scoutingImportDraft = null;
  renderScoutingWorkspace();
}
function refreshScoutingAfterWorkerRecordHydration() {
  if (!ui.scoutingWorkspace) {
    return;
  }
  const state = ensureScoutingState();
  if (state.selectedRecordId && ui.scoutingWorkspace.querySelector("[data-scouting-profile-modal]")) {
    renderScoutingProfileModalIntoDom(state.selectedRecordId);
    return;
  }
  if (state.activeTab === "database") {
    if (ui.scoutingWorkspace.querySelector("[data-scouting-compare-set]")) {
      renderScoutingCompareSetPanelIntoDom();
    }
    return;
  }
  const updated = rerenderScoutingActiveContent({ preserveFocus: true });
  if (!updated) {
    renderScoutingWorkspace({ preserveFocus: true });
  }
}
function processScoutingWorkerRecordHydrationQueue() {
  scoutingWorkerRecordHydrationTimer = 0;
  if (!isScoutingWorkerDatabaseActive() || !scoutingWorkerRecordHydrationQueue.size) {
    return;
  }
  const ids = Array.from(scoutingWorkerRecordHydrationQueue).slice(0, 80);
  ids.forEach((id) => {
    scoutingWorkerRecordHydrationQueue.delete(id);
    scoutingWorkerRecordHydrationInFlight.add(id);
  });
  requestScoutingDatabaseWorkerRecords(ids)
    .then((records) => {
      if (records.length) {
        rememberScoutingDatabaseRecords({
          source: "worker-record-hydration",
          importedAt: getScoutingDatabase()?.importedAt || "",
          records,
        });
        refreshScoutingAfterWorkerRecordHydration();
      }
    })
    .catch(() => {})
    .finally(() => {
      ids.forEach((id) => scoutingWorkerRecordHydrationInFlight.delete(id));
      if (scoutingWorkerRecordHydrationQueue.size) {
        window.clearTimeout(scoutingWorkerRecordHydrationTimer);
        scoutingWorkerRecordHydrationTimer = window.setTimeout(processScoutingWorkerRecordHydrationQueue, 0);
      }
    });
}
function queueScoutingWorkerRecordHydration(recordIds = []) {
  if (!isScoutingWorkerDatabaseActive()) {
    return;
  }
  const ids = normalizeScoutingRecordIds(recordIds).filter((id) => {
    if (!id || scoutingWorkerRecordHydrationInFlight.has(id) || scoutingWorkerRecordHydrationQueue.has(id)) {
      return false;
    }
    return !scoutingRecordIdLookupCache.has(id) && !scoutingKnownRecordLookupCache.has(id);
  });
  if (!ids.length) {
    return;
  }
  ids.forEach((id) => scoutingWorkerRecordHydrationQueue.add(id));
  window.clearTimeout(scoutingWorkerRecordHydrationTimer);
  scoutingWorkerRecordHydrationTimer = window.setTimeout(processScoutingWorkerRecordHydrationQueue, 0);
}
function getScoutingRecordById(recordId) {
  ensureScoutingRecordLookupsReady();
  const id = normalizeScoutingText(recordId, 160);
  const record = scoutingRecordIdLookupCache.get(id) || scoutingKnownRecordLookupCache.get(id);
  if (record) {
    return record;
  }
  queueScoutingWorkerRecordHydration([id]);
  return getScoutingSnapshotFallbackRecord(id) || null;
}
function rememberScoutingDatabaseRecords(database = {}) {
  const records = Array.isArray(database.records) ? database.records : [];
  if (!records.length) {
    return;
  }
  const firstId = normalizeScoutingText(records[0]?.[scoutingRecordIndex.id], 160);
  const lastId = normalizeScoutingText(records[records.length - 1]?.[scoutingRecordIndex.id], 160);
  const fingerprint = [
    normalizeScoutingText(database.source, 40),
    normalizeScoutingText(database.importedAt, 60),
    records.length,
    firstId,
    lastId,
  ].join("|");
  if (fingerprint && fingerprint === scoutingKnownRecordLookupFingerprint) {
    return;
  }
  for (const record of records) {
    const id = getScoutingRecordId(record);
    if (id) {
      scoutingKnownRecordLookupCache.set(id, record);
    }
  }
  scoutingKnownRecordLookupFingerprint = fingerprint;
}
function getScoutingRecordsForPlayer(record) {
  ensureScoutingRecordLookupsReady();
  const mergedSeasonRecords = getScoutingRecordMergedSeasonRecords(record);
  if (mergedSeasonRecords.length) {
    return mergedSeasonRecords.filter((candidate) => areScoutingRecordsLikelySamePerson(record, candidate));
  }
  for (const key of getScoutingRecordPersonLookupKeys(record)) {
    const personRecords = scoutingRecordPersonLookupCache.get(key);
    if (personRecords?.length) {
      return personRecords.filter((candidate) => areScoutingRecordsLikelySamePerson(record, candidate));
    }
  }
  const name = getScoutingRecordName(record).toLowerCase();
  if (!name) {
    return [];
  }
  const directRecords = (scoutingRecordNameLookupCache.get(name) || [])
    .filter((candidate) => areScoutingRecordsLikelySamePerson(record, candidate))
    .slice();
  if (directRecords.length) {
    return directRecords;
  }
  return Array.from(scoutingRecordIdLookupCache.values())
    .filter((candidate) => areScoutingRecordsLikelySamePerson(record, candidate))
    .sort((a, b) => getScoutingRecordSeasonYearValue(b) - getScoutingRecordSeasonYearValue(a) || getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a));
}
function getScoutingTargets(state = ensureScoutingState()) {
  return Array.isArray(state.targets) ? state.targets : [];
}
function getScoutingOppositionTeamOptions() {
  const database = getScoutingDatabase();
  if (!database) {
    return [];
  }
  const teams = new Set();
  for (const record of database.records || []) {
    const team = getScoutingRecordTeam(record);
    if (team) {
      teams.add(team);
    }
  }
  return [...teams].sort((a, b) => a.localeCompare(b));
}
function getScoutingOppositionSeasonOptions(team) {
  const database = getScoutingDatabase();
  if (!database) {
    return ["all"];
  }
  const normalizedTeam = normalizeScoutingText(team, 80);
  const seasons = new Set(["all"]);
  for (const record of database.records || []) {
    if (normalizedTeam && getScoutingRecordTeam(record) !== normalizedTeam) {
      continue;
    }
    const season = getScoutingRecordSeason(record);
    if (season) {
      seasons.add(season);
    }
  }
  return [...seasons].sort((a, b) => String(b).localeCompare(String(a)));
}
function getScoutingOppositionContext() {
  const teamOptions = getScoutingOppositionTeamOptions();
  const selectedTeam = teamOptions.includes(normalizeScoutingText(scoutingOppositionFilters.team, 80))
    ? normalizeScoutingText(scoutingOppositionFilters.team, 80)
    : "";
  const seasonOptions = getScoutingOppositionSeasonOptions(selectedTeam);
  const normalizedSeason = normalizeScoutingText(scoutingOppositionFilters.season, 40) || "all";
  const selectedSeason = seasonOptions.includes(normalizedSeason) ? normalizedSeason : "all";
  const minMinutes = Number(scoutingOppositionFilters.minMinutes);
  return {
    teamOptions,
    seasonOptions,
    selectedTeam,
    selectedSeason: selectedSeason || "all",
    minMinutes: Number.isFinite(minMinutes) && minMinutes >= 0 ? Math.max(0, Math.floor(minMinutes)) : 450,
  };
}
function setScoutingOppositionFilters(patch = {}) {
  const teamOptions = getScoutingOppositionTeamOptions();
  const nextTeam = teamOptions.includes(normalizeScoutingText(patch.team, 80)) ? normalizeScoutingText(patch.team, 80) : "";
  const seasonOptions = getScoutingOppositionSeasonOptions(nextTeam);
  const normalizedSeason = normalizeScoutingText(patch.season, 40);
  const nextSeason = seasonOptions.includes(normalizedSeason) ? normalizedSeason : "all";
  const min = Number(patch.minMinutes);
  scoutingOppositionFilters = {
    team: nextTeam,
    season: nextSeason,
    minMinutes: Number.isFinite(min) && min >= 0 ? Math.floor(min) : 450,
  };
  renderScoutingActiveContext({ preserveFocus: true });
}
function getScoutingOppositionTeamPlayers() {
  const context = getScoutingOppositionContext();
  const database = getScoutingDatabase();
  if (!database) {
    return [];
  }
  return (database.records || [])
    .filter((record) => {
      if (context.selectedTeam && getScoutingRecordTeam(record) !== context.selectedTeam) {
        return false;
      }
      if (context.selectedSeason !== "all" && getScoutingRecordSeason(record) !== context.selectedSeason) {
        return false;
      }
      return getScoutingRecordMinutes(record) >= context.minMinutes;
    })
    .sort((a, b) => (getScoutingRoleFitScore(b) || 0) - (getScoutingRoleFitScore(a) || 0));
}
function getScoutingOppositionThreatRows(records, metricLabels, fallbackLabel = "Role fit", limit = 4) {
  const metricId = getScoutingMetricIdByLabels(metricLabels);
  const fallbackMetricId = fallbackLabel === "Role fit" ? "minutes" : "";
  const finalMetricId = metricId || getScoutingMetric(fallbackMetricId)?.id || "";
  return records
    .map((record) => {
      const roleFit = getScoutingRoleFitScore(record);
      const percentile = finalMetricId ? getScoutingPercentile(record, finalMetricId) : null;
      const score = Number.isFinite(percentile) ? percentile : Number.isFinite(roleFit) ? roleFit : null;
      const metric = getScoutingMetric(finalMetricId);
      return score === null
        ? null
        : { record, score, metricLabel: metric?.label || fallbackLabel };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
function getScoutingOppositionMatchupRows(records, slotId, limit = 3) {
  const slot = getScoutingSlotById(slotId);
  if (!slot) {
    return [];
  }
  return records
    .filter((record) => {
      const positionTokens = getScoutingPositionTokens(record);
      return positionTokens.includes(slot.position) || positionTokens.includes(slot.label);
    })
    .map((record) => {
      const fit = getScoutingRoleFitScore(record);
      return Number.isFinite(fit) ? { record, fit } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.fit - a.fit)
    .slice(0, limit);
}
function getScoutingOppositionSummaryText() {
  const context = getScoutingOppositionContext();
  const players = getScoutingOppositionTeamPlayers();
  if (!players.length) {
    return `No opposition pool found for ${context.selectedTeam || "all teams"}${context.selectedSeason === "all" ? "" : ` (${context.selectedSeason})`}.`;
  }
  const attackRow = getScoutingOppositionThreatRows(players, ["xG", "Goals", "Shots"], "Role fit", 1)[0];
  const duelRow = getScoutingOppositionThreatRows(players, ["Duels", "Aerial duels"], "Role fit", 1)[0];
  return `${context.selectedTeam || "All teams"}${context.selectedSeason === "all" ? "" : ` (${context.selectedSeason})`}: ${
    players.length
  } profiles · top threat ${attackRow ? getScoutingRecordName(attackRow.record) : "unavailable"} (${attackRow ? attackRow.metricLabel : "Role fit"})${duelRow ? ` · duel threat ${getScoutingRecordName(duelRow.record)}` : ""}.`;
}
function getScoutingOppositionReportText() {
  const context = getScoutingOppositionContext();
  const players = getScoutingOppositionTeamPlayers();
  const teamLabel = context.selectedTeam || "All teams";
  const seasonLabel = context.selectedSeason === "all" ? "all seasons" : context.selectedSeason;
  const attackThreats = getScoutingOppositionThreatRows(players, ["xG", "Goals", "Shots"], "Role fit", 4);
  const creatorThreats = getScoutingOppositionThreatRows(players, ["xA", "Assists", "Key passes"], "Role fit", 4);
  const aerialThreats = getScoutingOppositionThreatRows(players, ["Aerial duels won", "Aerial duels"], "Role fit", 4);
  const slotThreats = scoutingShadowSlots
    .map((slot) => ({
      slot,
      records: getScoutingOppositionMatchupRows(players, slot.id, 2),
    }))
    .filter((entry) => entry.records.length);
  return [
    `Opposition scan: ${teamLabel} (${seasonLabel})`,
    `Players screened: ${players.length} · Min minutes: ${context.minMinutes}`,
    "",
    "Attack threat:",
    attackThreats.length
      ? attackThreats.map((entry) => `- ${getScoutingRecordName(entry.record)} · ${entry.metricLabel} ${formatScoutingNumber(entry.score)}`).join("\n")
      : "- No clear attack threat in this filter.",
    "",
    "Chance creation threat:",
    creatorThreats.length
      ? creatorThreats.map((entry) => `- ${getScoutingRecordName(entry.record)} · ${entry.metricLabel} ${formatScoutingNumber(entry.score)}`).join("\n")
      : "- No clear creator threat in this filter.",
    "",
    "Aerial / set-piece threat:",
    aerialThreats.length
      ? aerialThreats.map((entry) => `- ${getScoutingRecordName(entry.record)} · ${entry.metricLabel} ${formatScoutingNumber(entry.score)}`).join("\n")
      : "- No clear aerial threat in this filter.",
    "",
    "Role matchups:",
    slotThreats.length
      ? slotThreats
          .map(
            (entry) =>
              `${entry.slot.label} (${entry.slot.position}): ${entry.records
                .map((item) => `${getScoutingRecordName(item.record)} (${formatScoutingNumber(item.fit)})`)
                .join(", ")}`
          )
          .join("\n")
      : "- No role-specific matchups in this scope.",
    "",
    "Next action: Open profiles and assign pipeline status manually after scouting visit.",
  ].join("\n");
}
function renderScoutingActiveContext(options = {}) {
  if (ui.scoutingWorkspace?.id === "analysisRoomWorkspace") {
    return renderScoutingAnalysisRoomWorkspace(options);
  }
  return renderScoutingWorkspace(options);
}
function getScoutingTargetedRecordIds(state = ensureScoutingState()) {
  return getScoutingTargets(state)
    .map((target) => getScoutingTargetRecordId(target))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}
function createScoutingListBackedTarget(recordId, sourceLabel, sourceId, state = ensureScoutingState()) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return null;
  }
  const record = getScoutingRecordById(id);
  const snapshot = getScoutingRecordSnapshot(id, state);
  const roleFit = record ? getScoutingRoleFitScore(record) : null;
  const signal = record ? getScoutingBestSignal(record) : null;
  return {
    id: `scouting-list-backed-${normalizeScoutingText(sourceId, 80)}-${id}`,
    recordId: id,
    name: record ? getScoutingRecordName(record) : snapshot?.name || "Saved list player",
    club: record ? getScoutingRecordTeam(record) : snapshot?.club || "Saved list",
    position: record ? getScoutingRecordPosition(record) : snapshot?.position || "Unknown position",
    age: record ? String(getScoutingRecordAge(record) || "") : snapshot?.age || "",
    status: "longlist",
    priority: "normal",
    fit: Number.isFinite(roleFit) ? `P${roleFit}` : snapshot?.fit || "n/a",
    notes: `From ${normalizeScoutingText(sourceLabel, 80) || "saved list"}. Activate pipeline when this becomes a real recruitment case.`,
    slotId: "",
    owner: "",
    nextAction: "Activate pipeline",
    nextActionDate: "",
    lastContact: "",
    decisionDeadline: "",
    createdAt: snapshot?.updatedAt || new Date().toISOString(),
    updatedAt: snapshot?.updatedAt || new Date().toISOString(),
    isListBacked: true,
    sourceLabel,
    sourceId,
    signalLabel: signal?.metric?.label || snapshot?.signalLabel || "",
    signalPercentile: Number.isFinite(signal?.percentile) ? String(signal.percentile) : snapshot?.signalPercentile || "",
  };
}
function getScoutingListBackedTargets(state = ensureScoutingState()) {
  const existing = new Set(getScoutingTargetedRecordIds(state));
  const rows = [];
  const seen = new Set(existing);
  const addRow = (recordId, sourceLabel, sourceId) => {
    const id = normalizeScoutingText(recordId, 160);
    if (!id || seen.has(id)) {
      return;
    }
    const target = createScoutingListBackedTarget(id, sourceLabel, sourceId, state);
    if (target) {
      rows.push(target);
      seen.add(id);
    }
  };
  normalizeScoutingRecordIds(state.favoriteRecordIds).forEach((recordId) => addRow(recordId, "Favorites", "favorites"));
  (Array.isArray(state.lists) ? state.lists : []).forEach((list) => {
    normalizeScoutingRecordIds(list.recordIds).forEach((recordId) => addRow(recordId, list.name || "Scouting list", list.id || "list"));
  });
  return rows;
}
function getScoutingPipelineTargets(state = ensureScoutingState()) {
  return [...getScoutingTargets(state), ...getScoutingListBackedTargets(state)];
}
function getScoutingComparisonCandidatesForSlot(slotId) {
  const database = getScoutingDatabase();
  const slot = getScoutingShadowSlot(slotId);
  if (!slot) {
    return [];
  }
  return (database?.records || [])
    .filter((record) => getScoutingPositionTokens(record).includes(slot.position) || getScoutingPositionTokens(record).includes(slot.label))
    .sort((a, b) => (getScoutingRoleFitScore(b) || 0) - (getScoutingRoleFitScore(a) || 0));
}
function getScoutingSlotById(slotId) {
  return getScoutingShadowSlot(slotId);
}
function createScoutingTarget(record, target = {}) {
  const now = new Date().toISOString();
  const recordId = getScoutingRecordId(record);
  const roleFit = getScoutingRoleFitScore(record);
  return {
    id: normalizeScoutingText(target.id, 120) || `scouting-target-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recordId,
    name: getScoutingRecordName(record),
    club: getScoutingRecordTeam(record),
    position: getScoutingRecordPosition(record),
    age: String(getScoutingRecordAge(record) || ""),
    status: normalizeScoutingTargetStatus(target.status),
    priority: normalizeScoutingTargetPriority(target.priority),
    fit: Number.isFinite(roleFit) ? `P${roleFit}` : "n/a",
    notes: normalizeScoutingText(target.notes, 900),
    slotId: normalizeScoutingText(target.slotId, 40),
    owner: normalizeScoutingText(target.owner, 80),
    nextAction: normalizeScoutingText(target.nextAction, 220),
    nextActionDate: normalizeScoutingDateText(target.nextActionDate),
    lastContact: normalizeScoutingDateText(target.lastContact),
    decisionDeadline: normalizeScoutingDateText(target.decisionDeadline),
    createdAt: normalizeScoutingText(target.createdAt, 40) || now,
    updatedAt: normalizeScoutingText(target.updatedAt, 40) || now,
  };
}
function saveScoutingTarget(recordId, patch = {}) {
  const state = ensureScoutingState();
  const record = getScoutingRecordById(recordId);
  const now = new Date().toISOString();
  if (!record) {
    return;
  }
  rememberScoutingRecordSnapshot(record, state);
  const baseTarget = findScoutingTargetByRecordId(recordId, state);
  const nextTarget = createScoutingTarget(record, {
    ...(baseTarget || {}),
    ...patch,
    updatedAt: now,
  });
  if (baseTarget) {
    state.targets = getScoutingTargets(state).map((target) => (target.id === baseTarget.id ? nextTarget : target));
  } else {
    state.targets = [nextTarget, ...getScoutingTargets(state)];
  }
  touchScoutingIntelligenceCache();
  writeScoutingState();
  renderScoutingWorkspace();
}
function updateScoutingTarget(targetId, patch = {}) {
  const state = ensureScoutingState();
  const target = findScoutingTargetById(targetId, state);
  if (!target) {
    return;
  }
  const record = getScoutingTargetRecord(target);
  if (!record) {
    return;
  }
  rememberScoutingRecordSnapshot(record, state);
  const nextTarget = createScoutingTarget(record, {
    ...target,
    ...patch,
    updatedAt: normalizeScoutingText(patch.updatedAt, 40) || new Date().toISOString(),
  });
  state.targets = getScoutingTargets(state).map((entry) => (entry.id === target.id ? nextTarget : entry));
  touchScoutingIntelligenceCache();
  writeScoutingState();
  renderScoutingWorkspace();
}
function removeScoutingTarget(targetId) {
  const state = ensureScoutingState();
  const id = normalizeScoutingText(targetId, 120);
  if (!id) {
    return;
  }
  const nextTargets = getScoutingTargets(state).filter((target) => normalizeScoutingText(target.id, 120) !== id);
  if (nextTargets.length !== getScoutingTargets(state).length) {
    state.targets = nextTargets;
    touchScoutingIntelligenceCache();
    writeScoutingState();
    renderScoutingWorkspace();
  }
}
function getScoutingReportTargetOptionMarkup() {
  const state = ensureScoutingState();
  const records = getScoutingTargets(state)
    .map((target) => findScoutingTargetById(target.id, state))
    .filter(Boolean);
  return records
    .map((target) => `<option value="${escapeHtml(target.id)}">${escapeHtml(target.name || "Unknown target")} (${escapeHtml(target.club || "No club")})</option>`)
    .join("");
}
function getScoutingRoleModel(slotId = "", slotIndex = 0) {
  const models = getScoutingRoleModels();
  const model = models.find((entry) => {
    const normalizedSlotId = normalizeScoutingText(entry.slotId, 40);
    return normalizedSlotId === normalizeScoutingText(slotId, 40);
  });
  if (model) {
    return model;
  }
  return models[slotIndex] || null;
}
function normalizeScoutingRoleModelSignal(signal = {}, fallback = {}) {
  const rawSignal = typeof signal === "string" ? { metricId: signal } : signal || {};
  const fallbackMetricId = fallback.metricId || getScoutingMetricOptions()[0]?.id || "minutes";
  const metric = getScoutingMetric(rawSignal.metricId || rawSignal.id || fallbackMetricId) || getScoutingMetric(fallbackMetricId) || getScoutingMetricOptions()[0];
  if (!metric) {
    return null;
  }
  const minPercentile = Number(rawSignal.minPercentile ?? rawSignal.threshold ?? fallback.minPercentile ?? 70);
  const weight = Number(rawSignal.weight ?? fallback.weight ?? 3);
  return {
    metricId: normalizeScoutingText(metric.id, 120),
    minPercentile: Number.isFinite(minPercentile) ? Math.max(1, Math.min(99, Math.round(minPercentile))) : 70,
    weight: Number.isFinite(weight) ? Math.max(1, Math.min(5, Math.round(weight))) : 3,
    direction: normalizeScoutingText(rawSignal.direction || fallback.direction || "higher", 20).toLowerCase() === "lower" ? "lower" : "higher",
  };
}
function getScoutingRoleModelSignals(model = {}) {
  const rawSignals = Array.isArray(model?.metrics) && model.metrics.length
    ? model.metrics
    : model?.metricId
      ? [{ metricId: model.metricId, minPercentile: model.minPercentile, weight: 3, direction: model.direction || "higher" }]
      : [{ metricId: getScoutingMetricOptions()[0]?.id || "minutes", minPercentile: model?.minPercentile || 70, weight: 3, direction: "higher" }];
  const signalsByMetric = new Map();
  rawSignals.forEach((signal) => {
    const normalized = normalizeScoutingRoleModelSignal(signal, {
      metricId: model?.metricId,
      minPercentile: model?.minPercentile,
      direction: model?.direction,
    });
    if (normalized?.metricId && !signalsByMetric.has(normalized.metricId)) {
      signalsByMetric.set(normalized.metricId, normalized);
    }
  });
  return Array.from(signalsByMetric.values());
}
function getScoutingRoleModelSignalScore(record, signal = {}) {
  const percentile = getScoutingPercentile(record, signal.metricId);
  if (!Number.isFinite(percentile)) {
    return null;
  }
  return signal.direction === "lower" ? Math.max(0, Math.min(99, 100 - percentile)) : percentile;
}
function formatScoutingRoleModelSignal(signal = {}) {
  const metric = getScoutingMetric(signal.metricId);
  return `${metric?.label || signal.metricId} · ${signal.direction === "lower" ? "lower is better" : "higher is better"} · P${formatScoutingNumber(signal.minPercentile)} · x${formatScoutingNumber(signal.weight)}`;
}
function getScoutingRoleModelMatchScore(record, model) {
  const signals = getScoutingRoleModelSignals(model);
  if (!signals.length) {
    return 0;
  }
  let weightedScore = 0;
  let totalWeight = 0;
  let coveredSignals = 0;
  signals.forEach((signal) => {
    const signalScore = getScoutingRoleModelSignalScore(record, signal);
    if (!Number.isFinite(signalScore)) {
      return;
    }
    const weight = Math.max(1, Number(signal.weight) || 1);
    const threshold = Number(signal.minPercentile) || 70;
    const adjustedScore = signalScore >= threshold ? signalScore : Math.max(0, signalScore - (threshold - signalScore) * 0.75);
    weightedScore += adjustedScore * weight;
    totalWeight += weight;
    coveredSignals += 1;
  });
  if (!totalWeight) {
    return 0;
  }
  const coverageFactor = Math.max(0.55, coveredSignals / Math.max(1, signals.length));
  return Math.round((weightedScore / totalWeight) * coverageFactor);
}
function getScoutingRoleModelCandidates(model) {
  if (!model) {
    return [];
  }
  const slot = getScoutingSlotById(model.slotId) || getScoutingSlotById(scoutingShadowSlots[0]?.id || "");
  if (!slot) {
    return [];
  }
  const signals = getScoutingRoleModelSignals(model);
  if (!signals.length) {
    return [];
  }
  return (getScoutingDatabase()?.records || [])
    .filter((record) => getScoutingPositionTokens(record).includes(slot.position) || getScoutingPositionTokens(record).includes(slot.label))
    .map((record) => {
      const signalScores = signals
        .map((signal) => ({
          signal,
          score: getScoutingRoleModelSignalScore(record, signal),
        }))
        .filter((entry) => Number.isFinite(entry.score));
      const bestSignal = signalScores.sort((a, b) => b.score - a.score)[0] || null;
      return {
        record,
        score: getScoutingRoleModelMatchScore(record, model),
        percentile: bestSignal?.score ?? null,
        bestSignal: bestSignal?.signal || null,
        fit: getScoutingRoleFitScore(record),
      };
    })
    .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.fit || 0) - (a.fit || 0));
}
function createScoutingRoleModel(model = {}) {
  const now = new Date().toISOString();
  const state = ensureScoutingState();
  const modelId = normalizeScoutingText(model.id, 120);
  const existingModel = getScoutingRoleModels(state).find((entry) => normalizeScoutingText(entry.id, 120) === modelId);
  const slot = getScoutingSlotById(model.slotId) || scoutingShadowSlots[0];
  const signals = getScoutingRoleModelSignals({
    metricId: model.metricId,
    minPercentile: model.minPercentile,
    metrics: model.metrics,
  });
  const primaryMetric = getScoutingMetric(signals[0]?.metricId || model.metricId) || getScoutingMetricOptions()[0];
  const nextModel = {
    id: modelId || `scouting-role-model-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: normalizeScoutingText(model.name, 120) || "Role model",
    slotId: normalizeScoutingText(slot?.id, 40),
    metricId: normalizeScoutingText(primaryMetric?.id, 120) || "minutes",
    minPercentile: Number.isFinite(Number(model.minPercentile)) ? Math.max(1, Math.min(99, Math.round(Number(model.minPercentile)))) : signals[0]?.minPercentile || 70,
    metrics: signals,
    searchIntent: normalizeScoutingText(model.searchIntent, 500),
    notes: normalizeScoutingText(model.notes, 900),
    createdAt: existingModel?.createdAt || now,
    updatedAt: now,
  };
  state.roleModels = [nextModel, ...getScoutingRoleModels(state).filter((entry) => entry.name).filter((entry) => entry.id !== nextModel.id)];
  if (scoutingRoleModelBuilderOpen) {
    scoutingRoleModelEditId = nextModel.id;
  }
  writeScoutingState();
  renderScoutingWorkspace();
  return nextModel.id;
}
function removeScoutingRoleModel(roleModelId) {
  const state = ensureScoutingState();
  const id = normalizeScoutingText(roleModelId, 120);
  if (!id) {
    return;
  }
  const nextRoleModels = getScoutingRoleModels(state).filter((entry) => normalizeScoutingText(entry.id, 120) !== id);
  if (nextRoleModels.length === getScoutingRoleModels(state).length) {
    return;
  }
  state.roleModels = nextRoleModels;
  if (scoutingRoleModelEditId === id) {
    scoutingRoleModelEditId = "";
  }
  writeScoutingState();
  renderScoutingWorkspace();
}
function createScoutingReportFromForm(title, type, targetId, summary) {
  const state = ensureScoutingState();
  const safeTitle = normalizeScoutingText(title, 160);
  const safeSummary = normalizeScoutingText(summary, 1200);
  if (!safeTitle && !safeSummary) {
    return;
  }
  const now = new Date().toISOString();
  const safeType = type === "opposition" ? "opposition" : "player";
  const safeTargetId = safeType === "player" ? normalizeScoutingText(targetId, 120) : "";
  state.reports = [
    {
      id: `scouting-report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      targetId: safeTargetId,
      title: safeTitle || "Scouting report",
      type: safeType,
      summary: safeSummary || "No report summary yet.",
      createdAt: now,
    },
    ...getScoutingReports(state),
  ];
  writeScoutingState();
  renderScoutingWorkspace();
}
function deleteScoutingReport(reportId) {
  const state = ensureScoutingState();
  const id = normalizeScoutingText(reportId, 120);
  if (!id) {
    return;
  }
  const nextReports = getScoutingReports(state).filter((report) => normalizeScoutingText(report.id, 120) !== id);
  if (nextReports.length === getScoutingReports(state).length) {
    return;
  }
  state.reports = nextReports;
  writeScoutingState();
  renderScoutingWorkspace();
}
function getScoutingMetricValuesForGroup(metricId, positionGroup) {
  const metric = getScoutingMetric(metricId);
  if (!metric) {
    return [];
  }
  const cacheKey = `${positionGroup}:${metricId}`;
  if (scoutingPercentileCache.has(cacheKey)) {
    return scoutingPercentileCache.get(cacheKey);
  }
  const values = (getScoutingDatabase()?.records || [])
    .filter((record) => getScoutingPositionGroup(record) === positionGroup && getScoutingRecordMinutes(record) >= 450)
    .map((record) => getScoutingMetricValue(record, metricId))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  scoutingPercentileCache.set(cacheKey, values);
  return values;
}
function getScoutingBenchmarkModeOptions() {
  return [
    { value: "position", label: "Same position group" },
    { value: "league-position", label: "Same league + position" },
    { value: "season-position", label: "Same season + position" },
    { value: "league-season-position", label: "Same league/season + position" },
    { value: "age-position", label: "Same age band + position" },
    { value: "all", label: "All players" },
  ];
}
function normalizeScoutingBenchmarkMode(value = "") {
  const normalized = normalizeScoutingText(value, 40) || "position";
  return getScoutingBenchmarkModeOptions().some((option) => option.value === normalized) ? normalized : "position";
}
function getScoutingActiveBenchmarkMode() {
  try {
    return normalizeScoutingBenchmarkMode(ensureScoutingState()?.databaseFilters?.benchmarkMode);
  } catch {
    return "position";
  }
}
function getScoutingBenchmarkAgeBand(record) {
  const age = getScoutingRecordAge(record);
  if (!Number.isFinite(age)) {
    return "unknown";
  }
  if (age <= 20) {
    return "u20";
  }
  if (age <= 23) {
    return "u23";
  }
  if (age <= 27) {
    return "prime";
  }
  return "senior";
}
function getScoutingBenchmarkValues(metricId, record, benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const metric = getScoutingMetric(metricId);
  if (!metric || !record) {
    return [];
  }
  const normalizedMode = normalizeScoutingBenchmarkMode(benchmarkMode);
  const group = getScoutingPositionGroup(record);
  const league = getScoutingRecordLeague(record);
  const season = getScoutingRecordSeason(record);
  const ageBand = getScoutingBenchmarkAgeBand(record);
  const cacheParts = ["benchmark", normalizedMode, metricId];
  if (normalizedMode !== "all") {
    cacheParts.push(group);
  }
  if (normalizedMode === "league-position" || normalizedMode === "league-season-position") {
    cacheParts.push(league);
  }
  if (normalizedMode === "season-position" || normalizedMode === "league-season-position") {
    cacheParts.push(season);
  }
  if (normalizedMode === "age-position") {
    cacheParts.push(ageBand);
  }
  const cacheKey = cacheParts.join(":");
  if (scoutingPercentileCache.has(cacheKey)) {
    return scoutingPercentileCache.get(cacheKey);
  }
  const values = (getScoutingDatabase()?.records || [])
    .filter((candidate) => {
      if (getScoutingRecordMinutes(candidate) < 450) {
        return false;
      }
      if (normalizedMode !== "all" && getScoutingPositionGroup(candidate) !== group) {
        return false;
      }
      if ((normalizedMode === "league-position" || normalizedMode === "league-season-position") && getScoutingRecordLeague(candidate) !== league) {
        return false;
      }
      if ((normalizedMode === "season-position" || normalizedMode === "league-season-position") && getScoutingRecordSeason(candidate) !== season) {
        return false;
      }
      if (normalizedMode === "age-position" && getScoutingBenchmarkAgeBand(candidate) !== ageBand) {
        return false;
      }
      return true;
    })
    .map((candidate) => getScoutingMetricValue(candidate, metricId))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  scoutingPercentileCache.set(cacheKey, values);
  return values;
}
function getScoutingRawPercentile(record, metricId, benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const value = getScoutingMetricValue(record, metricId);
  const metric = getScoutingMetric(metricId);
  if (!Number.isFinite(value) || !metric) {
    return null;
  }
  const values = getScoutingBenchmarkValues(metricId, record, benchmarkMode);
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
  return Math.max(1, Math.min(99, Math.round((low / values.length) * 100)));
}
function getScoutingBenchmarkPercentile(record, metricId, benchmarkMode = getScoutingActiveBenchmarkMode(), desiredDirection = "metric") {
  const metric = getScoutingMetric(metricId);
  const direction = normalizeScoutingText(desiredDirection, 20).toLowerCase() === "metric"
    ? normalizeScoutingText(metric?.direction || "higher", 20).toLowerCase()
    : normalizeScoutingText(desiredDirection, 20).toLowerCase();
  const rawPercentile = getScoutingRawPercentile(record, metricId, benchmarkMode);
  if (!Number.isFinite(rawPercentile)) {
    return null;
  }
  return direction === "lower" ? Math.max(1, Math.min(99, 101 - rawPercentile)) : rawPercentile;
}
function getScoutingBenchmarkSampleSize(record, metricId, benchmarkMode = getScoutingActiveBenchmarkMode()) {
  return getScoutingBenchmarkValues(metricId, record, benchmarkMode).length;
}
function getScoutingCalibratedPercentile(record, metricId, desiredDirection = "metric", benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const normalizedMode = normalizeScoutingBenchmarkMode(benchmarkMode);
  const metricFactor =
    typeof getScoutingLeagueQualityFactorForMetric === "function"
      ? getScoutingLeagueQualityFactorForMetric(record, metricId, normalizedMode)
      : getScoutingLeagueQualityFactor(getScoutingRecordLeague(record));
  const broadPercentile = getScoutingBenchmarkPercentile(record, metricId, "position", desiredDirection);
  const localModes = normalizedMode === "position"
    ? ["league-season-position", "league-position", "season-position"]
    : [normalizedMode, "league-season-position", "league-position", "season-position"];
  const localCandidate = localModes
    .map((mode) => ({
      mode,
      sample: getScoutingBenchmarkSampleSize(record, metricId, mode),
      percentile: getScoutingBenchmarkPercentile(record, metricId, mode, desiredDirection),
    }))
    .find((candidate) => Number.isFinite(candidate.percentile) && candidate.sample >= (candidate.mode === "league-season-position" ? 8 : 12));
  if (!localCandidate) {
    return applyScoutingLeagueQualityDampening(broadPercentile, record, metricFactor);
  }
  const sampleWeight = Math.max(0.28, Math.min(0.76, (localCandidate.sample - 6) / 30));
  const blended = Number.isFinite(broadPercentile)
    ? localCandidate.percentile * sampleWeight + broadPercentile * (1 - sampleWeight)
    : localCandidate.percentile;
  return applyScoutingLeagueQualityDampening(blended, record, metricFactor);
}
function getScoutingDirectionalPercentile(record, metricId, desiredDirection = "higher", benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const direction = normalizeScoutingText(desiredDirection, 20).toLowerCase();
  return getScoutingCalibratedPercentile(record, metricId, direction || "higher", benchmarkMode);
}
function getScoutingTemplatePercentile(record, item, benchmarkMode = getScoutingActiveBenchmarkMode()) {
  return getScoutingDirectionalPercentile(record, item?.metricId, item?.direction || item?.desiredDirection || "higher", benchmarkMode);
}
function getScoutingPercentile(record, metricId) {
  const value = getScoutingMetricValue(record, metricId);
  const metric = getScoutingMetric(metricId);
  if (!Number.isFinite(value) || !metric) {
    return null;
  }
  const values = getScoutingMetricValuesForGroup(metricId, getScoutingPositionGroup(record));
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
  let percentile = Math.round((low / values.length) * 100);
  if (metric.direction === "lower") {
    percentile = 101 - percentile;
  }
  return Math.max(1, Math.min(99, percentile));
}
function getScoutingRoleSignalProfile(profile = {}, record = null) {
  const profileGroups = Array.isArray(profile?.groups) ? profile.groups : ["OTHER"];
  const recordGroup = getScoutingPositionGroup(record);
  const group = profileGroups.includes(recordGroup) ? recordGroup : profileGroups[0] || "OTHER";
  return scoutingRoleScoringProfiles[group] || scoutingRoleScoringProfiles.OTHER;
}
function getScoutingRoleSignalAxis(profile = {}, item = {}, index = 0, record = null) {
  if (typeof index === "object" && index !== null && !Array.isArray(index) && record === null) {
    record = index;
    index = 0;
  }
  const signalProfile = getScoutingRoleSignalProfile(profile, record);
  const metricId = getScoutingMetricIdByLabels(item.labels || []);
  if (!metricId) {
    return null;
  }
  const direct = signalProfile?.axes?.find((axis) => axis.metricId === metricId);
  if (direct) {
    return direct;
  }
  const fallbackByMetricText = signalProfile?.axes?.find((axis) => normalizeScoutingText(axis.metricId, 120) === normalizeScoutingText(metricId, 120));
  if (fallbackByMetricText) {
    return fallbackByMetricText;
  }
  if (Array.isArray(signalProfile?.axes)) {
    return signalProfile.axes[index % signalProfile.axes.length] || null;
  }
  return null;
}
function getScoutingRoleSpiderProfiles() {
  return [...scoutingRoleSpiderProfiles, ...scoutingAdditionalRoleSpiderProfiles];
}
function getScoutingRoleProfileById(profileId) {
  const id = normalizeScoutingText(profileId, 120);
  return getScoutingRoleSpiderProfiles().find((profile) => profile.id === id) || null;
}
function getScoutingRoleCategoryGroup(roleProfileId = "") {
  return scoutingRoleCategoryById[normalizeScoutingText(roleProfileId, 120)] || "";
}
function getScoutingRoleAxisWeight(profile = {}, item = {}, index = 0, record = null) {
  if (typeof index === "object" && index !== null && !Array.isArray(index) && record === null) {
    record = index;
    index = 0;
  }
  const roleAxis = getScoutingRoleSignalAxis(profile, item, index, record);
  if (roleAxis?.weight && Number.isFinite(Number(roleAxis.weight))) {
    return Math.max(0.45, Math.min(1.85, Number(roleAxis.weight)));
  }
  const explicitWeight = Number(item.weight);
  if (Number.isFinite(explicitWeight) && explicitWeight > 0) {
    return Math.max(0.45, Math.min(1.85, explicitWeight));
  }
  const baseWeights = [1.34, 1.22, 1.08, 0.96, 0.86, 0.78, 0.72];
  const haystack = normalizeScoutingMetricAlias(
    [profile.id, profile.label, item.label, ...(Array.isArray(item.labels) ? item.labels : [])].filter(Boolean).join(" ")
  );
  const tokens = record ? getScoutingPositionTokens(record) : [];
  let multiplier = 1;
  if (/playmaker|connector|inverted|false nine/.test(haystack) && /pass|accuracy|receive|short|progressive|through|smart|final/.test(haystack)) {
    multiplier += 0.16;
  }
  if (/dribbler|winger|wide|carrier|mobile/.test(haystack) && /dribble|progressive runs|acceleration|carry|cross/.test(haystack)) {
    multiplier += 0.16;
  }
  if (/aerial|target|claiming/.test(haystack) && /aerial|long|head|box|exit/.test(haystack)) {
    multiplier += 0.18;
  }
  if (/worker|press|defensive|holding|no nonsense|cover/.test(haystack) && /defensive|interception|duel|block|foul/.test(haystack)) {
    multiplier += 0.15;
  }
  if (tokens.some((token) => ["LCB", "RCB"].includes(token)) && /progressive|dribble|pass|receive/.test(haystack)) {
    multiplier += 0.08;
  }
  if (tokens.some((token) => ["RB", "LB", "RWB", "LWB"].includes(token)) && /progressive runs|cross|acceleration|defensive/.test(haystack)) {
    multiplier += 0.08;
  }
  return Math.max(0.5, Math.min(1.75, (baseWeights[index] || 0.72) * multiplier));
}
function getScoutingDefaultRoleProfile(record) {
  const defaultProfileByGroup = {
    GK: "gk-playmaker",
    CB: "cb-playmaker",
    FB: "running-fullback",
    MID: "cm-playmaker",
    WING: "wide-winger-dribbler",
    CF: "target-forward",
    OTHER: "general-player",
  };
  return getScoutingRoleProfileById(defaultProfileByGroup[getScoutingPositionGroup(record)] || defaultProfileByGroup.OTHER);
}
function getScoutingRoleLabelsForGroup(record) {
  const group = getScoutingPositionGroup(record);
  return getScoutingRoleSpiderProfiles()
    .filter((profile) => profile.groups.includes(group))
    .map((profile) => profile.label);
}
function normalizeScoutingRoleProfileId(value = "", fallback = "all") {
  const normalized = normalizeScoutingText(value, 120);
  if (!normalized || normalized === "all" || normalized === "auto") {
    return fallback;
  }
  if (getScoutingRoleCategoryGroup(normalized)) {
    return normalized;
  }
  return getScoutingRoleProfileById(normalized) ? normalized : fallback;
}
function renderScoutingRoleProfileOptions(selectedValue = "all", options = {}) {
  const selected = normalizeScoutingRoleProfileId(selectedValue, options.auto ? "auto" : "all");
  const groups = [
    ["GK", "Målvakt"],
    ["CB", "Mittback"],
    ["FB", "Ytterback"],
    ["MID", "Central mittfältare"],
    ["WING", "Winge (yttermittfältare)"],
    ["CF", "Anfallare"],
  ];
  const allProfiles = getScoutingRoleSpiderProfiles();
  return `
    ${options.auto ? `<option value="auto" ${selected === "auto" ? "selected" : ""}>Auto best role</option>` : `<option value="all" ${selected === "all" ? "selected" : ""}>Auto best role</option>`}
    ${scoutingRoleCategoryProfiles
      .map((category) => `<option value="${escapeHtml(category.id)}" ${selected === category.id ? "selected" : ""}>${escapeHtml(category.label)}</option>`)
      .join("")}
    ${groups
      .map(([group, label]) => {
        const profileOptions = allProfiles
          .filter((profile) => profile.groups.includes(group))
          .map((profile) => `<option value="${escapeHtml(profile.id)}" ${selected === profile.id ? "selected" : ""}>${escapeHtml(profile.label)}</option>`)
          .join("");
        return profileOptions ? `<optgroup label="${escapeHtml(label)}">${profileOptions}</optgroup>` : "";
      })
      .join("")}
  `;
}
function buildScoutingRadarTemplateFromProfile(record, profile, benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const cacheKey = `template:${getScoutingRecordId(record)}:${profile?.id || "none"}:${normalizeScoutingBenchmarkMode(benchmarkMode)}`;
  if (scoutingRoleProfileCache.has(cacheKey)) {
    const cachedTemplate = scoutingRoleProfileCache.get(cacheKey);
    return cachedTemplate || null;
  }
  const used = new Set();
  const missingMetricLabels = [];
  const axes = (profile.axes || [])
    .map((item, index) => {
      const metricId = getScoutingMetricIdByLabels(item.labels);
      if (!metricId || metricId === "minutes" || used.has(metricId)) {
        missingMetricLabels.push(item.label);
        return null;
      }
      used.add(metricId);
      const axis = getScoutingRoleSignalAxis(profile, item, index, record);
      return {
        ...item,
        metricId,
        direction: axis?.direction || item.direction || "higher",
        desiredDirection: axis?.direction || item.direction || item.desiredDirection || "higher",
        weight: getScoutingRoleAxisWeight(profile, item, index, record),
      };
    })
    .filter(Boolean);
  const rows = axes
    .map((item) => ({
      item,
      percentile: getScoutingTemplatePercentile(record, item, benchmarkMode),
      confidence: getScoutingMetricConfidenceFactor(record, item.metricId),
    }))
    .filter((row) => Number.isFinite(row.percentile));
  if (rows.length < 3) {
    scoutingRoleProfileCache.set(cacheKey, null);
    return null;
  }
  const weightedTotal = rows.reduce((sum, row) => sum + row.percentile * row.item.weight, 0);
  const totalWeight = rows.reduce((sum, row) => sum + row.item.weight, 0);
  axes.profileId = profile.id;
  axes.profileLabel = profile.label;
  axes.profileDescription = profile.description;
  axes.profileCoverage = rows.length / Math.max((profile.axes || []).length, 1);
  axes.profileScore = Math.round(weightedTotal / Math.max(totalWeight, 0.1));
  axes.profileExpectedAxes = (profile.axes || []).length;
  axes.profileMissingMetrics = missingMetricLabels;
  axes.profileConfidence = Math.round(
    (rows.reduce((sum, row) => sum + row.confidence, 0) / Math.max(rows.length, 1)) * axes.profileCoverage * 100
  );
  scoutingRoleProfileCache.set(cacheKey, axes);
  return axes;
}
function getScoutingRoleScores(record, limit = 6, benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const cacheKey = `scores:${getScoutingRecordId(record)}:${normalizeScoutingBenchmarkMode(benchmarkMode)}`;
  if (scoutingRoleProfileCache.has(cacheKey)) {
    return scoutingRoleProfileCache.get(cacheKey).slice(0, limit);
  }
  const group = getScoutingPositionGroup(record);
  const scores = getScoutingRoleSpiderProfiles()
    .filter((profile) => profile.groups.includes(group))
    .map((profile) => {
      const template = buildScoutingRadarTemplateFromProfile(record, profile, benchmarkMode);
      return template
        ? {
            profile,
            template,
            score: template.profileScore,
            coverage: template.profileCoverage,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage);
  scoutingRoleProfileCache.set(cacheKey, scores);
  return scores.slice(0, limit);
}
function getScoutingRadarTemplate(record, roleProfileId = "", benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const explicitProfile = getScoutingRoleProfileById(roleProfileId);
  const roleCategoryGroup = getScoutingRoleCategoryGroup(roleProfileId);
  const recordGroup = getScoutingPositionGroup(record);
  if (roleCategoryGroup && roleCategoryGroup !== recordGroup) {
    return [];
  }
  if (explicitProfile && explicitProfile.groups.includes(recordGroup)) {
    const explicitTemplate = buildScoutingRadarTemplateFromProfile(record, explicitProfile, benchmarkMode);
    if (explicitTemplate) {
      return explicitTemplate;
    }
  }
  const defaultProfile = getScoutingDefaultRoleProfile(record);
  if (defaultProfile) {
    const defaultTemplate = buildScoutingRadarTemplateFromProfile(record, defaultProfile, benchmarkMode);
    if (defaultTemplate) {
      return defaultTemplate;
    }
  }
  return (
    buildScoutingRadarTemplateFromProfile(
      record,
      scoutingFallbackSpiderProfiles[getScoutingPositionGroup(record)] || scoutingFallbackSpiderProfiles.OTHER,
      benchmarkMode
    ) ||
    []
  );
}
function getScoutingRoleExplanation(record, template) {
  const metricRows = getScoutingRoleMetricRows(record, template).filter((row) => Number.isFinite(row.percentile));
  const roleScore = getScoutingWeightedScoreFromRows(metricRows);
  const strengths = [...metricRows].sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0)).slice(0, 3);
  const watch = [...metricRows].sort((a, b) => a.percentile - b.percentile).slice(0, 2);
  const over = [...metricRows]
    .filter((row) => Number.isFinite(roleScore) && row.percentile >= roleScore + 10)
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 2);
  return {
    title: template.profileLabel || "Role profile",
    summary: strengths.length
      ? `Profiles as ${template.profileLabel || "this role"} because weighted role signals are ${strengths.map((row) => `${row.label} (P${row.percentile}, w${formatScoutingNumber(row.weight)})`).join(", ")}.`
      : "Not enough comparable role signals yet.",
    strengths,
    watch,
    over,
  };
}
function renderScoutingRoleExplanation(record, template) {
  if (!template?.length) {
    return "";
  }
  const explanation = getScoutingRoleExplanation(record, template);
  return `
    <section class="scouting-role-explanation">
      <div>
        <span>Role explanation</span>
        <strong>${escapeHtml(explanation.title)}</strong>
        <p>${escapeHtml(explanation.summary)}</p>
      </div>
      <div class="scouting-role-explanation-grid">
        <article>
          <span>Strength drivers</span>
          ${explanation.strengths
            .map((row) => `<strong>${escapeHtml(row.label)} P${escapeHtml(row.percentile)} / w${escapeHtml(formatScoutingNumber(row.weight))}</strong>`)
            .join("")}
        </article>
        <article>
          <span>Watch points</span>
          ${explanation.watch
            .map((row) => `<strong>${escapeHtml(row.label)} P${escapeHtml(row.percentile)}</strong>`)
            .join("")}
          ${explanation.over.length ? `<strong>${escapeHtml(`Over role expectation: ${explanation.over.map((row) => `${row.label} P${row.percentile}`).join(", ")}`)}</strong>` : ""}
        </article>
      </div>
    </section>
  `;
}
function renderScoutingRoleFitStack(record) {
  const scores = getScoutingRoleScores(record, 5);
  if (!scores.length) {
    return "";
  }
  return `
    <section class="scouting-role-fit-stack">
      <header>
        <span>Multi-role fit</span>
        <strong>Alternative player types</strong>
      </header>
      <div>
        ${scores
          .map(
            (entry, index) => `
              <article>
                <span>${escapeHtml(index === 0 ? "Primary archetype" : "Alternative role")}</span>
                <strong>${escapeHtml(entry.profile.label)}</strong>
                <em>P${escapeHtml(entry.score)} / ${escapeHtml(Math.round(entry.coverage * 100))}% coverage</em>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
function renderScoutingRadar(record, roleProfileId = "", precomputedTemplate = null, precomputedMetricRows = null) {
  const template = precomputedTemplate || getScoutingRadarTemplate(record, roleProfileId);
  if (!template.length) {
    const dataNeeds = getScoutingRoleDataNeeds(record, roleProfileId);
    return `
      <div class="scouting-radar-empty">
        <strong>No data</strong>
        <span>${escapeHtml(dataNeeds.length ? `Needs: ${dataNeeds.join(", ")}` : "Needs role-specific metric columns for this player type.")}</span>
      </div>
    `;
  }
  const metricRows = Array.isArray(precomputedMetricRows) ? precomputedMetricRows : getScoutingRoleMetricRows(record, template);
  const percentileByMetricId = new Map(metricRows.map((row) => [row.metricId, row.percentile]));
  const center = 110;
  const radius = 74;
  const angleOffset = -Math.PI / 2;
  const points = template.map((item, index) => {
    const percentile = percentileByMetricId.get(item.metricId) || 1;
    const angle = angleOffset + (index / template.length) * Math.PI * 2;
    const valueRadius = radius * (percentile / 100);
    return {
      x: center + Math.cos(angle) * valueRadius,
      y: center + Math.sin(angle) * valueRadius,
      labelX: center + Math.cos(angle) * (radius + 25),
      labelY: center + Math.sin(angle) * (radius + 25),
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
      label: item.label,
    };
  });
  const polygon = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return `
    <div class="scouting-radar-frame">
      <svg class="scouting-radar" viewBox="0 0 220 220" role="img" aria-label="Player spider profile">
        <circle class="scouting-radar-ring" cx="${center}" cy="${center}" r="${radius}" />
        <circle class="scouting-radar-ring" cx="${center}" cy="${center}" r="${radius * 0.66}" />
        <circle class="scouting-radar-ring" cx="${center}" cy="${center}" r="${radius * 0.33}" />
        ${points
          .map(
            (point) =>
              `<line class="scouting-radar-axis" x1="${center}" y1="${center}" x2="${point.axisX.toFixed(1)}" y2="${point.axisY.toFixed(1)}" />`
          )
          .join("")}
        <polygon class="scouting-radar-shape" points="${polygon}" />
        ${points
          .map(
            (point) => `
              <circle class="scouting-radar-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2" />
              <text class="scouting-radar-label" x="${point.labelX.toFixed(1)}" y="${point.labelY.toFixed(1)}">${escapeHtml(point.label)}</text>
            `
          )
          .join("")}
      </svg>
    </div>
  `;
}
function renderScoutingRoleSpiderSummary(record, template = [], metricRows = []) {
  if (!template.length) {
    return "";
  }
  const roleScore = getScoutingWeightedScoreFromRows(metricRows);
  const overPerformance = metricRows
    .filter((row) => Number.isFinite(row.percentile) && Number.isFinite(roleScore) && row.percentile >= roleScore + 10)
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 2);
  const dataNeeds = getScoutingRoleDataNeeds(record, template.profileId);
  return `
    <div class="scouting-radar-head scouting-radar-head-summary">
      <span>Role spider</span>
      <strong>${escapeHtml(template.profileLabel || "Player profile")}</strong>
      ${template.profileDescription ? `<small>${escapeHtml(template.profileDescription)}</small>` : ""}
      <small>${escapeHtml(
        overPerformance.length
          ? `Over expectation: ${overPerformance.map((row) => `${row.label} P${row.percentile}`).join(", ")}`
          : dataNeeds.length
            ? `Data needs: ${dataNeeds.join(", ")}`
            : `Weighted role fit ${Number.isFinite(roleScore) ? `P${roleScore}` : "n/a"}`
      )}</small>
    </div>
  `;
}
function renderScoutingTabButton(tab) {
  const active = ensureScoutingState().activeTab === tab.id;
  return `
    <button type="button" class="scouting-tab${active ? " is-active" : ""}" data-scouting-tab="${escapeHtml(tab.id)}" aria-selected="${active ? "true" : "false"}">
      ${escapeHtml(tab.label)}
    </button>
  `;
}
function isScoutingRecordFavorited(recordId) {
  return ensureScoutingState().favoriteRecordIds.includes(normalizeScoutingText(recordId, 160));
}
function getScoutingShadowSlotRecordIds(slotId, state = ensureScoutingState()) {
  const slotValue = state.shadowXi?.slots?.[slotId];
  return normalizeScoutingRecordIds(Array.isArray(slotValue) ? slotValue : slotValue ? [slotValue] : []);
}
function getScoutingShadowSlotRecords(slotId, state = ensureScoutingState()) {
  return getScoutingShadowSlotRecordIds(slotId, state)
    .map((recordId) => getScoutingRecordById(recordId) || getScoutingSnapshotFallbackRecord(recordId, state) || getScoutingShadowFallbackRecord(slotId, recordId, state))
    .filter(Boolean);
}
function getScoutingStoredPlayerRecord(recordId, state = ensureScoutingState()) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return null;
  }
  const shadowSlotId = Object.keys(state?.shadowXi?.slots || {}).find((slotId) => getScoutingShadowSlotRecordIds(slotId, state).includes(id));
  const shadowFallback = shadowSlotId ? getScoutingShadowFallbackRecord(shadowSlotId, id, state) : null;
  const record = getScoutingRecordById(id) || getScoutingSnapshotFallbackRecord(id, state) || shadowFallback;
  if (record) {
    return record;
  }
  const fallbackRecord = [];
  fallbackRecord[scoutingRecordIndex.id] = id;
  fallbackRecord[scoutingRecordIndex.player] = "Saved player";
  fallbackRecord[scoutingRecordIndex.position] = "";
  fallbackRecord[scoutingRecordIndex.team] = "";
  fallbackRecord[scoutingRecordIndex.metrics] = {};
  return fallbackRecord;
}
function renderScoutingStoredPlayerButton(recordId, state = ensureScoutingState(), secondary = "position") {
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return "";
  }
  const record = getScoutingStoredPlayerRecord(id, state);
  const name = record ? getScoutingRecordName(record) : "Saved player";
  const secondaryText =
    record && secondary === "team"
      ? getScoutingRecordTeam(record) || getScoutingRecordLeague(record) || "Team scouting"
      : record
        ? getScoutingRecordPosition(record) || getScoutingRecordTeam(record) || "Team scouting"
        : "Stored in team scouting";
  return `<button type="button" data-open-scouting-record="${escapeHtml(id)}">${escapeHtml(name)}<span>${escapeHtml(secondaryText)}</span></button>`;
}
function getScoutingShadowMetaKey(slotId, recordId) {
  return `${normalizeScoutingText(slotId, 40)}:${normalizeScoutingText(recordId, 160)}`;
}
function getScoutingShadowRecordMeta(slotId, recordId, state = ensureScoutingState()) {
  const meta = state.shadowXi?.meta && typeof state.shadowXi.meta === "object" ? state.shadowXi.meta : {};
  const value = meta[getScoutingShadowMetaKey(slotId, recordId)] || {};
  return {
    tag: normalizeScoutingShadowTag(value.tag),
    note: normalizeScoutingText(value.note, 180),
    updatedAt: normalizeScoutingText(value.updatedAt, 40),
    playerName: normalizeScoutingText(value.playerName, 180),
    team: normalizeScoutingText(value.team, 180),
    league: normalizeScoutingText(value.league, 180),
    season: normalizeScoutingText(value.season, 80),
    position: normalizeScoutingText(value.position, 120),
  };
}
function getScoutingShadowFallbackRecord(slotId, recordId, state = ensureScoutingState()) {
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return null;
  }
  const meta = getScoutingShadowRecordMeta(slotId, id, state);
  const record = [];
  record[scoutingRecordIndex.id] = id;
  record[scoutingRecordIndex.player] = meta.playerName || "Saved target";
  record[scoutingRecordIndex.team] = meta.team || "";
  record[scoutingRecordIndex.teamWithinTimeframe] = meta.team || "";
  record[scoutingRecordIndex.league] = meta.league || "";
  record[scoutingRecordIndex.season] = meta.season || "";
  record[scoutingRecordIndex.position] = meta.position || "";
  record[scoutingRecordIndex.age] = "";
  record[scoutingRecordIndex.matches] = "";
  record[scoutingRecordIndex.minutes] = 0;
  record[scoutingRecordIndex.metrics] = {};
  return record;
}
function setScoutingShadowRecordMeta(slotId, recordId, patch = {}) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const slot = getScoutingShadowSlot(slotId);
  const id = normalizeScoutingText(recordId, 160);
  if (!slot || !id || !getScoutingShadowSlotRecordIds(slot.id, state).includes(id)) {
    return;
  }
  const key = getScoutingShadowMetaKey(slot.id, id);
  state.shadowXi.meta = {
    ...(state.shadowXi.meta && typeof state.shadowXi.meta === "object" ? state.shadowXi.meta : {}),
    [key]: {
      ...getScoutingShadowRecordMeta(slot.id, id, state),
      ...patch,
      tag: normalizeScoutingShadowTag(patch.tag || getScoutingShadowRecordMeta(slot.id, id, state).tag),
      updatedAt: new Date().toISOString(),
    },
  };
  writeScoutingState();
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true }, id);
}
function moveScoutingShadowRecord(slotId, recordId, direction) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const slot = getScoutingShadowSlot(slotId);
  const id = normalizeScoutingText(recordId, 160);
  const current = slot ? getScoutingShadowSlotRecordIds(slot.id, state) : [];
  const index = current.indexOf(id);
  if (!slot || index < 0) {
    return;
  }
  const nextIndex = direction === "down" ? Math.min(current.length - 1, index + 1) : Math.max(0, index - 1);
  if (nextIndex === index) {
    return;
  }
  const next = [...current];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  state.shadowXi.slots = {
    ...state.shadowXi.slots,
    [slot.id]: next,
  };
  state.shadowXi.selectedSlotId = slot.id;
  preferredScoutingShadowSlotId = slot.id;
  writeScoutingState();
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true }, id);
}
function reorderScoutingShadowRecord(slotId, recordId, beforeRecordId = "") {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const mutation = reorderScoutingRecordIdInShadowSlot(state, { recordId, slotId, beforeRecordId });
  if (!mutation.changed) {
    return;
  }
  preferredScoutingShadowSlotId = mutation.slotId;
  writeScoutingState();
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true }, mutation.recordId);
}
function setScoutingTargetStatusByDrag(targetId, status) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const safeStatus = normalizeScoutingTargetStatus(status);
  updateScoutingTarget(targetId, { status: safeStatus });
}
function bindScoutingDragAndDrop() {
  const root = ui.scoutingWorkspace;
  if (!root) {
    return;
  }
  const myTeamActions = getScoutingMyTeamActions();
  bindScoutingDragAndDropRouter(root, {
    addRecordToShadow: addScoutingRecordToShadow,
    assignMyTeamPlayerToSlot: myTeamActions.assignPlayerToSlot,
    canEdit: canEditScoutingWorkspace,
    getPointerPitchPosition: getScoutingMyTeamPointerPitchPosition,
    normalizeText: normalizeScoutingText,
    previewSlotPitchPosition: previewScoutingMyTeamSlotPitchPosition,
    removeMyTeamPlayerFromAllSlots: myTeamActions.removePlayerFromAllSlots,
    reorderShadowRecord: reorderScoutingShadowRecord,
    setMyTeamSlotPitchPosition: myTeamActions.setSlotPitchPosition,
    setShadowSlotPitchPosition: setScoutingShadowSlotPitchPosition,
    setTargetStatusByDrag: setScoutingTargetStatusByDrag,
  });
}
function getScoutingShadowCoverageScore(slotId, state = ensureScoutingState()) {
  const records = getScoutingShadowSlotRecords(slotId, state);
  if (!records.length) {
    return 0;
  }
  const fitAverage = records
    .map((record) => getScoutingRoleFitScore(record))
    .filter((score) => Number.isFinite(score))
    .reduce((sum, score, index, values) => (index === values.length - 1 ? (sum + score) / values.length : sum + score), 0);
  const depthBonus = Math.min(18, records.length * 6);
  return Math.round(Math.min(99, (Number.isFinite(fitAverage) ? fitAverage : 50) * 0.82 + depthBonus));
}
function getScoutingShadowSlot(slotId) {
  const id = normalizeScoutingText(slotId, 40);
  return scoutingShadowSlots.find((slot) => slot.id === id) || null;
}
function getSelectedScoutingShadowSlotId(state = ensureScoutingState()) {
  const selectedSlotId = normalizeScoutingText(state.shadowXi?.selectedSlotId || preferredScoutingShadowSlotId, 40);
  return scoutingShadowSlots.some((slot) => slot.id === selectedSlotId) ? selectedSlotId : "";
}
function getScoutingShadowSlotCounts(state = ensureScoutingState()) {
  return scoutingShadowSlots.reduce(
    (summary, slot) => {
      const count = getScoutingShadowSlotRecordIds(slot.id, state).length;
      if (count) {
        summary.filledSlots += 1;
        summary.playerCount += count;
      }
      return summary;
    },
    { filledSlots: 0, playerCount: 0 }
  );
}
function getScoutingRoleFitScore(record, roleProfileId = "") {
  const template = getScoutingRadarTemplate(record, roleProfileId);
  if (Number.isFinite(template.profileScore)) {
    return template.profileScore;
  }
  return getScoutingWeightedScoreFromRows(getScoutingRoleMetricRows(record, template));
}
function getScoutingRoleFitTier(score) {
  if (!Number.isFinite(score)) {
    return "unknown";
  }
  if (score >= 82) {
    return "elite";
  }
  if (score >= 70) {
    return "strong";
  }
  if (score >= 58) {
    return "monitor";
  }
  return "risk";
}
function getScoutingRoleFitLabel(score) {
  const tier = getScoutingRoleFitTier(score);
  if (tier === "elite") {
    return "Priority";
  }
  if (tier === "strong") {
    return "Strong fit";
  }
  if (tier === "monitor") {
    return "Monitor";
  }
  if (tier === "risk") {
    return "Risk";
  }
  return "No score";
}
function getScoutingRecommendationTone(label = "") {
  const normalized = normalizeScoutingText(label, 80);
  if (normalized === "strong fit") {
    return "strong-fit";
  }
  if (normalized === "potential fit") {
    return "potential-fit";
  }
  if (normalized === "watchlist") {
    return "watchlist";
  }
  return "no-signal";
}
function getScoutingRoleMetricRows(record, template = getScoutingRadarTemplate(record), benchmarkMode = getScoutingActiveBenchmarkMode()) {
  return (template || [])
    .map((item) => {
      const metric = getScoutingMetric(item.metricId);
      const percentile = getScoutingTemplatePercentile(record, item, benchmarkMode);
      const value = getScoutingMetricValue(record, item.metricId);
      const confidence = getScoutingMetricConfidenceFactor(record, item.metricId);
      const weight = Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1;
      return {
        ...item,
        metric,
        value,
        percentile,
        confidence,
        weight,
        weightedScore: Number.isFinite(percentile) ? percentile * weight : null,
        quality: getScoutingMetricQuality(record, item.metricId),
      };
    })
    .filter((row) => row.metric && row.metric.id !== "minutes" && row.metricId !== "minutes");
}
function getScoutingWeightedScoreFromRows(rows = []) {
  const validRows = rows.filter((row) => Number.isFinite(row.percentile) && Number.isFinite(row.weight));
  if (!validRows.length) {
    return null;
  }
  const weightedTotal = validRows.reduce((sum, row) => sum + row.percentile * row.weight, 0);
  const totalWeight = validRows.reduce((sum, row) => sum + row.weight, 0);
  return Math.round(weightedTotal / Math.max(totalWeight, 0.1));
}
function getScoutingRoleMetricFloor(record, roleProfileId = "") {
  const rows = getScoutingRoleMetricRows(record, getScoutingRadarTemplate(record, roleProfileId)).filter((row) =>
    Number.isFinite(row.percentile)
  );
  if (!rows.length) {
    return null;
  }
  return Math.min(...rows.map((row) => row.percentile));
}
function getScoutingRoleMetricFloorLabel(floor) {
  if (!Number.isFinite(floor)) {
    return "No floor";
  }
  if (floor >= 65) {
    return "Complete profile";
  }
  if (floor >= 50) {
    return "Balanced enough";
  }
  if (floor >= 35) {
    return "One watch point";
  }
  return "Critical gap";
}
function getScoutingRoleDataNeeds(record, roleProfileId = "") {
  const profile =
    getScoutingRoleProfileById(roleProfileId) ||
    getScoutingDefaultRoleProfile(record) ||
    scoutingFallbackSpiderProfiles[getScoutingPositionGroup(record)] ||
    null;
  if (!profile) {
    return [];
  }
  return (profile.axes || [])
    .map((item) => {
      const metricId = getScoutingMetricIdByLabels(item.labels);
      const metric = metricId ? getScoutingMetric(metricId) : null;
      const value = metricId ? getScoutingMetricValue(record, metricId) : null;
      if (!metricId || !metric) {
        return `${item.label} column`;
      }
      if (!Number.isFinite(value)) {
        return metric.label || item.label;
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 6);
}
function getScoutingSampleConfidenceScore(record) {
  const minutes = getScoutingRecordMinutes(record);
  if (minutes >= 1800) {
    return 96;
  }
  if (minutes >= 1200) {
    return 88;
  }
  if (minutes >= 900) {
    return 80;
  }
  if (minutes >= 450) {
    return 66;
  }
  if (minutes >= 180) {
    return 48;
  }
  return minutes > 0 ? 34 : 22;
}
function getScoutingBenchmarkConfidenceScore(record, rows = []) {
  const samples = rows
    .map((row) => getScoutingBenchmarkSampleSize(record, row.metricId, "league-season-position"))
    .filter((value) => Number.isFinite(value));
  if (!samples.length) {
    return 44;
  }
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  if (average >= 40) {
    return 96;
  }
  if (average >= 24) {
    return 84;
  }
  if (average >= 12) {
    return 68;
  }
  return 50;
}
function getScoutingTrendDirectionLabel(delta, sampleWeight = 1) {
  if (!Number.isFinite(delta)) {
    return "No trend";
  }
  const weightedDelta = delta * Math.max(0.35, Math.min(1, sampleWeight));
  if (weightedDelta >= 7) {
    return `Rising +${formatScoutingNumber(delta)}`;
  }
  if (weightedDelta <= -7) {
    return `Dropping ${formatScoutingNumber(delta)}`;
  }
  return `Stable ${delta >= 0 ? "+" : ""}${formatScoutingNumber(delta)}`;
}
function getScoutingIntelligenceProfile(record, state = ensureScoutingState(), roleProfileId = "") {
  const roleProfile = getScoutingRoleProfileById(roleProfileId) || getScoutingDefaultRoleProfile(record);
  const recordId = getScoutingRecordId(record);
  const cacheKey = [
    recordId,
    normalizeScoutingBenchmarkMode(getScoutingActiveBenchmarkMode()),
    normalizeScoutingText(roleProfile?.id || roleProfileId, 120) || "auto",
    scoutingIntelligenceCacheVersion,
  ].join(":");
  if (scoutingRecordIntelligenceCache.has(cacheKey)) {
    return scoutingRecordIntelligenceCache.get(cacheKey);
  }
  const template = getScoutingRadarTemplate(record, roleProfile?.id || roleProfileId);
  const rows = getScoutingRoleMetricRows(record, template);
  const validRows = rows.filter((row) => Number.isFinite(row.percentile));
  const roleFitScore = getScoutingWeightedScoreFromRows(validRows);
  const bestRoleLabel = template?.profileLabel || roleProfile?.label || getScoutingRecordBestRoleLabel(record);
  const target = findScoutingTargetByRecordId(getScoutingRecordId(record), state);
  const dateOfBirth = getScoutingRecordDateOfBirth(record);
  const nationality = getScoutingRecordNationalityMeta(record);
  const identityId = getScoutingRecordPlayerIdentityId(record);
  const profileRows = getScoutingRecordsForPlayer(record);
  const seasons = profileRows.map((candidate) => getScoutingRecordSeason(candidate)).filter(Boolean);
  const uniqueSeasons = new Set(seasons);
  const seasonRecency = Math.min(100, uniqueSeasons.size * 24 + 20);
  const identitySignals = {
    flags: [
      !identityId ? "missing player identity id" : "",
      !dateOfBirth ? "missing date of birth" : "",
      !nationality?.code || nationality.code === "N/A" ? "missing nationality" : "",
    ].filter(Boolean),
  };
  const rawPositionRows = validRows
    .map((row) => ({
      ...row,
      rawPercentile: getScoutingBenchmarkPercentile(record, row.metricId, "position", row.direction || row.desiredDirection || "higher"),
      localPercentile: getScoutingBenchmarkPercentile(record, row.metricId, "league-season-position", row.direction || row.desiredDirection || "higher"),
      localSample: getScoutingBenchmarkSampleSize(record, row.metricId, "league-season-position"),
      leagueQualityFactor: typeof getScoutingLeagueQualityFactorForMetric === "function"
        ? getScoutingLeagueQualityFactorForMetric(record, row.metricId, getScoutingActiveBenchmarkMode())
        : getScoutingLeagueQualityFactor(getScoutingRecordLeague(record)),
    }))
    .filter((row) => Number.isFinite(row.rawPercentile));
  const rawRoleFitScore = getScoutingWeightedScoreFromRows(
    rawPositionRows.map((row) => ({
      ...row,
      percentile: row.rawPercentile,
    }))
  );
  const topDrivers = [...validRows].sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0)).slice(0, 3);
  const weakDrivers = [...validRows].sort((a, b) => (a.percentile || 0) - (b.percentile || 0)).slice(0, 2);
  const dataNeeds = getScoutingRoleDataNeeds(record, roleProfile?.id || roleProfileId || template.profileId);
  const minutes = getScoutingRecordMinutes(record);
  const age = getScoutingRecordAge(record);
  const expectedAxes = Number.isFinite(Number(template?.profileExpectedAxes))
    ? Number(template.profileExpectedAxes)
    : Math.max((template?.length || 0), 1);
  const coverage = expectedAxes ? validRows.length / Math.max(expectedAxes, 1) : 0;
  const roleFloor = getScoutingRoleMetricFloor(record, roleProfileId);
  const trustedShare = validRows.length
    ? validRows.filter((row) => row.quality === "trusted").length / validRows.length
    : 0;
  const sampleShare = Math.min(1, uniqueSeasons.size / 3);
  const confidenceScore = Math.round(
    getScoutingSampleConfidenceScore(record) * 0.34 +
      Math.min(100, coverage * 100) * 0.26 +
      Math.round(trustedShare * 100) * 0.18 +
      getScoutingBenchmarkConfidenceScore(record, validRows) * 0.14 +
      sampleShare * 14 +
      seasonRecency * 0.08 +
      Math.max(0, (identitySignals.flags.length - 2) * -16)
  );
  const clampedConfidence = Math.max(1, Math.min(99, confidenceScore));
  const confidenceLabel = clampedConfidence >= 82 ? "High confidence" : clampedConfidence >= 66 ? "Medium confidence" : "Low confidence";
  const leagueFactors = rawPositionRows
    .map((row) => row.leagueQualityFactor)
    .filter((value) => Number.isFinite(value));
  const leagueFactor = leagueFactors.length
    ? leagueFactors.reduce((sum, value) => sum + value, 0) / leagueFactors.length
    : getScoutingLeagueQualityFactor(getScoutingRecordLeague(record));
  const localSampleAverage = rawPositionRows.length
    ? Math.round(rawPositionRows.reduce((sum, row) => sum + (row.localSample || 0), 0) / rawPositionRows.length)
    : 0;
  const calibrationDelta =
    Number.isFinite(roleFitScore) && Number.isFinite(rawRoleFitScore) ? Math.round(roleFitScore - rawRoleFitScore) : null;
  const valueAlert =
    Number.isFinite(roleFitScore) && roleFitScore >= 80 && minutes <= 900 && Number.isFinite(age) && age <= 23
      ? "Value case alert: high role fit, lower minutes and U23 profile."
      : "";
  const signalHeadline = topDrivers.length
    ? `${bestRoleLabel}: ${topDrivers.map((row) => `${row.label} P${row.percentile}`).join(" / ")}`
    : "No standout role signal yet";
  const confidenceDetail = `${Math.round(coverage * 100)}% role data coverage / ${validRows.length} weighted metrics / ${minutes ? `${formatScoutingNumber(minutes)} minutes` : "minutes missing"}.`;
  const roleFitConfidenceBonus = Number.isFinite(roleFitScore) && roleFitScore >= 82 ? 8 : 0;
  const minutesPenalty = minutes <= 180 ? 10 : minutes <= 450 ? 6 : 0;
  const identityPenalty = identitySignals.flags.length * 2;
  const riskReasons = [
    minutes < 450 ? "small sample" : "",
    dataNeeds.length ? `${dataNeeds.length} missing role metric${dataNeeds.length === 1 ? "" : "s"}` : "",
    leagueFactor < 0.94 ? "league-quality dampened" : "",
    validRows.some((row) => row.quality === "estimated") ? "estimated values present" : "",
    Number.isFinite(roleFloor) && roleFloor < 35 ? `critical role-floor gap P${roleFloor}` : "",
    weakDrivers[0] && weakDrivers[0].percentile < 35 ? `${weakDrivers[0].label} under role benchmark` : "",
    identitySignals.flags.length ? `identity signal: ${identitySignals.flags.slice(0, 2).join(", ")}` : "",
  ].filter(Boolean);
  const riskPenalty = riskReasons.length * 6;
  const samplePenalty = roleFloor < 35 ? 8 : roleFloor < 45 ? 4 : 0;
  const recommendationScore = Number.isFinite(roleFitScore)
    ? Math.max(1, Math.min(99, Math.round(roleFitScore * 0.62 + clampedConfidence * 0.24 + 12 + roleFitConfidenceBonus - minutesPenalty - identityPenalty - riskPenalty - samplePenalty)))
    : null;
  const isMinutesRiskLow = minutes > 250 && minutes < 2200;
  const recommendationLabel = !Number.isFinite(recommendationScore)
    ? "No signal"
    : recommendationScore >= 82 && roleFitScore >= 82 && isMinutesRiskLow
      ? "Strong fit"
      : recommendationScore >= 72 && clampedConfidence >= 66
        ? "Potential fit"
        : "Watchlist";
  const riskFlags = [
    weakDrivers[0] && weakDrivers[0].percentile < 30 ? `${weakDrivers[0].label} below role floor` : "",
    minutes > 0 && minutes <= 240 ? "very low minutes" : "",
    leagueFactor < 0.75 ? "low league sample quality" : "",
    identitySignals.flags.length ? `identity: ${identitySignals.flags.slice(0, 2).join(", ")}` : "",
    dataNeeds.length ? `${dataNeeds.length} missing role metric${dataNeeds.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const intelligence = {
    roleFitScore,
    roleLabel: bestRoleLabel,
    signal: {
      headline: valueAlert || signalHeadline,
      detail: topDrivers.length
        ? `Weighted role drivers: ${topDrivers.map((row) => `${row.metric.label} (${row.label}, P${row.percentile})`).join(", ")}.`
        : "The player needs more role-specific data before a strong signal can be trusted.",
      drivers: topDrivers,
    },
    confidence: {
      score: clampedConfidence,
      label: confidenceLabel,
      detail: target ? `${confidenceDetail} Pipeline context included.` : confidenceDetail,
    },
    recommendation: {
      score: recommendationScore,
      label: recommendationLabel,
      detail: riskFlags.length ? `Signals: ${riskFlags.slice(0, 3).join(" · ")}` : "Stable role fit profile with limited risk flags.",
    },
    calibration: {
      benchmark: "league/season + position blended with broader position baseline",
      leagueFactor,
      localSampleAverage,
      rawRoleFitScore,
      delta: calibrationDelta,
      label:
        leagueFactor < 0.94
          ? "League-quality dampened"
          : localSampleAverage >= 24
            ? "Strong local benchmark"
            : localSampleAverage >= 12
              ? "Usable local benchmark"
              : "Broad benchmark fallback",
    },
    floor: {
      score: roleFloor,
      label: getScoutingRoleMetricFloorLabel(roleFloor),
    },
    risk: {
      label: riskReasons.length ? "Risk flags" : "Clean initial read",
      detail: riskReasons.length
        ? `Check ${riskReasons.join(", ")} before moving the player up.`
        : "No major data-quality, sample-size or league calibration red flag in this profile.",
      needs: dataNeeds,
    },
  };
  scoutingRecordIntelligenceCache.set(cacheKey, intelligence);
  return intelligence;
}
function getScoutingBestSignal(record) {
  return getScoutingMetricOptions()
    .map((metric) => ({
      metric,
      value: getScoutingMetricValue(record, metric.id),
      percentile: getScoutingComparablePercentile(record, metric.id),
      quality: getScoutingMetricQuality(record, metric.id),
      confidence: getScoutingMetricConfidenceFactor(record, metric.id),
    }))
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.percentile))
    .filter((item) => !["minutes", "matches", "age"].includes(normalizeScoutingText(item.metric?.id, 120)))
    .map((item) => ({
      ...item,
      adjustedPercentile: Math.max(1, Math.min(99, Math.round(item.percentile * item.confidence))),
    }))
    .filter((item) => item.confidence > 0)
    .sort((a, b) => b.adjustedPercentile - a.adjustedPercentile || b.percentile - a.percentile)[0] || null;
}
function getScoutingAllShadowRecordIds(state = ensureScoutingState()) {
  return normalizeScoutingRecordIds(scoutingShadowSlots.flatMap((slot) => getScoutingShadowSlotRecordIds(slot.id, state)));
}
function getScoutingDecisionLensOptions() {
  return [
    { value: "all", label: "All players" },
    { value: "priority", label: "Priority fits P82+" },
    { value: "decision-ready", label: "Decision ready" },
    { value: "breakout", label: "U23 breakout" },
    { value: "value", label: "High fit / lower minutes" },
    { value: "favorites", label: "Favorites only" },
    { value: "pipeline", label: "Pipeline only" },
    { value: "shadow", label: "Shadow XI only" },
  ];
}
function getScoutingMarketStatusFilterOptions() {
  return [
    { value: "all", label: "All market statuses" },
    { value: "unknown", label: "Contract unknown" },
    { value: "under-contract", label: "Under contract" },
    { value: "option", label: "Option year" },
    { value: "free-agent", label: "Free agent" },
    { value: "loan", label: "Loan situation" },
    { value: "contacted", label: "Agent contacted" },
    { value: "budgeted", label: "Budget info added" },
    { value: "high-probability", label: "High deal probability" },
  ];
}
function getScoutingAdvancedFilterCount(filters = {}) {
  const hasMetricSelection = (Array.isArray(filters.metricIds) && filters.metricIds.length) || (filters.metricId && filters.metricId !== "all");
  return [
    filters.season && filters.season !== "all",
    Number(filters.minMinutes) > 0,
    Number(filters.maxMinutes) > 0 && Number(filters.maxMinutes) < 5000,
    Number(filters.minAge) > 14,
    Number(filters.maxAge) > 0 && Number(filters.maxAge) < 45,
    (Array.isArray(filters.metricIds) && filters.metricIds.length) || (filters.metricId && filters.metricId !== "all"),
    hasMetricSelection && Boolean(filters.metricMin),
    filters.signalMode && filters.signalMode !== "all",
    filters.roleProfileId && filters.roleProfileId !== "all",
    filters.benchmarkMode && filters.benchmarkMode !== "position",
    Boolean(filters.roleFitMin),
    Boolean(filters.roleFloorMin),
    filters.sortMetricId && filters.sortMetricId !== "minutes",
  ].filter(Boolean).length;
}
function isScoutingHighDealProbability(value = "") {
  const normalized = normalizeScoutingText(value, 80).toLowerCase();
  const numeric = Number(normalized.replace(/[^0-9.]/g, ""));
  return normalized.includes("high") || normalized.includes("likely") || (Number.isFinite(numeric) && numeric >= 60);
}
function getScoutingDaysUntil(value = "") {
  const normalized = normalizeScoutingText(value, 40);
  if (!normalized) {
    return null;
  }
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}
function getScoutingDaysSince(value = "") {
  const daysUntil = getScoutingDaysUntil(value);
  return Number.isFinite(daysUntil) ? -daysUntil : null;
}
function isScoutingHighBudgetImpact(value = "") {
  const normalized = normalizeScoutingText(value, 180).toLowerCase();
  const numeric = Number(normalized.replace(/[^0-9.]/g, ""));
  return normalized.includes("high") || normalized.includes("major") || normalized.includes("expensive") || normalized.includes("over budget") || (Number.isFinite(numeric) && numeric >= 250000);
}
function getScoutingReportAverage(report = {}) {
  const values = [report.technical, report.tactical, report.physical, report.psychological]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}
function getScoutingSavedViewPresets() {
  return [
    {
      id: "u23-breakouts",
      name: "U23 Breakouts",
      filters: { signalMode: "breakout", maxAge: "23", roleFitMin: "70", sortMetricId: "minutes" },
    },
    {
      id: "priority-fits",
      name: "High Role Fit",
      filters: { signalMode: "priority", roleFitMin: "82" },
    },
    {
      id: "decision-ready",
      name: "Decision Ready",
      filters: { signalMode: "decision-ready", roleFitMin: "74", roleFloorMin: "50", sortMetricId: "role-fit" },
    },
    {
      id: "value-cases",
      name: "Value Cases",
      filters: { signalMode: "value", roleFitMin: "80", maxAge: "23", maxMinutes: 900 },
    },
    {
      id: "complete-role-profiles",
      name: "Complete Role Profiles",
      filters: { roleFitMin: "74", roleFloorMin: "55", sortMetricId: "role-fit" },
    },
    {
      id: "free-agents",
      name: "Free Agents",
      filters: { marketStatus: "free-agent", minMinutes: 0 },
    },
    {
      id: "contract-unknown",
      name: "Contract Unknown",
      filters: { marketStatus: "unknown" },
    },
  ];
}
function getScoutingProfileRecommendation(record, state = ensureScoutingState()) {
  const intelligence = getScoutingIntelligenceProfile(record, state);
  const roleFitScore = intelligence.roleFitScore;
  const minutes = getScoutingRecordMinutes(record);
  const age = getScoutingRecordAge(record);
  const target = findScoutingTargetByRecordId(getScoutingRecordId(record), state);
  const targetStatusLabel = getScoutingStatusOptions().find((option) => option.value === target?.status)?.label || "";
  const priorityLabel = getScoutingPriorityOptions().find((option) => option.value === target?.priority)?.label || "";
  const action =
    target?.status === "shortlist" || target?.priority === "urgent"
      ? "Move to decision meeting"
      : Number.isFinite(roleFitScore) && roleFitScore >= 82
        ? "Book live/video scout"
        : Number.isFinite(roleFitScore) && roleFitScore >= 70
          ? "Monitor next 3 matches"
          : "Keep as database watch";
  const risk =
    minutes < 450
      ? "Small sample: verify role and minutes before pushing."
      : Number.isFinite(age) && age >= 30
        ? "Age curve: check contract length and physical durability."
        : Number.isFinite(roleFitScore) && roleFitScore < 58
          ? "Role-fit risk: only pursue if tactical context explains the gap."
          : "No obvious data red flag from current scouting player database profile.";
  const question =
    getScoutingPositionGroup(record) === "GK"
      ? "Can she solve pressure, distribution and box control against our league tempo?"
      : getScoutingPositionGroup(record) === "CF"
        ? "Is the box output repeatable, or driven by team chance quality?"
        : getScoutingPositionGroup(record) === "MID"
          ? "Can she keep progression and security under pressure?"
          : "Does the role-fit translate against stronger opposition and our match model?";
  return {
    action,
    risk,
    question,
    status: targetStatusLabel ? `${targetStatusLabel}${priorityLabel ? ` / ${priorityLabel}` : ""}` : "Not in pipeline",
    signal: intelligence.signal.headline,
    signalDetail: intelligence.signal.detail,
    confidence: `${intelligence.confidence.label} (${intelligence.confidence.score}/99)`,
    confidenceDetail: intelligence.confidence.detail,
    riskDetail: intelligence.risk.detail,
    dataNeeds: intelligence.risk.needs,
  };
}
function getScoutingCompareRecordIds(state = ensureScoutingState()) {
  return normalizeScoutingRecordIds(state.compareRecordIds).slice(0, 5);
}
function isScoutingRecordInCompareSet(recordId, state = ensureScoutingState()) {
  return getScoutingCompareRecordIds(state).includes(normalizeScoutingText(recordId, 160));
}
function toggleScoutingCompareRecord(recordId) {
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return;
  }
  const record = getScoutingRecordById(id);
  if (record) {
    rememberScoutingRecordSnapshot(record, state);
  }
  const current = getScoutingCompareRecordIds(state);
  state.compareRecordIds = current.includes(id) ? current.filter((candidateId) => candidateId !== id) : [id, ...current].slice(0, 5);
  writeScoutingState();
  renderScoutingCompareSetPanelIntoDom();
  updateScoutingCompareControls();
}
function clearScoutingCompareSet() {
  const state = ensureScoutingState();
  state.compareRecordIds = [];
  writeScoutingState();
  renderScoutingCompareSetPanelIntoDom();
  updateScoutingCompareControls();
}
function createScoutingCompareSetReport() {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const records = getScoutingCompareRecordIds(state).map(getScoutingRecordById).filter(Boolean);
  if (!records.length) {
    return;
  }
  const rows = records
    .map((record) => {
      const intelligence = getScoutingIntelligenceProfile(record, state);
      const market = getScoutingMarketIntelligence(record, state);
      const topDriver = intelligence.signal.drivers?.[0];
      return `${getScoutingRecordName(record)}: ${intelligence.roleLabel}, role fit P${intelligence.roleFitScore || "n/a"}, ${intelligence.confidence.label} ${intelligence.confidence.score}/99, risk ${intelligence.risk.label}, top driver ${topDriver ? `${topDriver.label} P${topDriver.percentile}` : "n/a"}, ${formatScoutingNumber(getScoutingRecordMinutes(record))} minutes, market ${market.segment}.`;
    })
    .join(" ");
  const leader = [...records]
    .map((record) => ({ record, fit: getScoutingRoleFitScore(record), confidence: getScoutingIntelligenceProfile(record, state).confidence.score }))
    .sort((a, b) => (b.fit || 0) - (a.fit || 0) || (b.confidence || 0) - (a.confidence || 0))[0];
  state.activeTab = "reports";
  createScoutingReport({
    title: `Compare set memo: ${records.map(getScoutingRecordName).slice(0, 3).join(" vs ")}`,
    type: "player",
    summary: normalizeScoutingText(
      [
        `Comparison set generated from scouting player database. Players: ${records.map(getScoutingRecordName).join(", ")}.`,
        leader ? `Current leader: ${getScoutingRecordName(leader.record)} with role fit P${leader.fit || "n/a"} and confidence ${leader.confidence || "n/a"}/99.` : "",
        rows,
        "Decision prompt: validate the leader live/video, check due diligence gaps, and decide whether the value case belongs in Shadow XI or active pipeline.",
      ].join(" "),
      1200
    ),
    recommendation: leader?.fit >= 82 ? "shortlist" : "monitor",
    confidence: leader?.confidence >= 82 ? 4 : 3,
    technical: leader?.fit ? Math.max(2, Math.min(5, Math.round(leader.fit / 20))) : 3,
    tactical: leader?.fit ? Math.max(2, Math.min(5, Math.round(leader.fit / 20))) : 3,
    physical: 3,
    psychological: 3,
    scoutType: "Compare set",
    createdAt: new Date().toISOString(),
  });
}
function renderScoutingCompareSetMatrix(records = [], state = ensureScoutingState()) {
  const rows = records
    .map((record) => {
      const intelligence = getScoutingIntelligenceProfile(record, state);
      const market = getScoutingMarketIntelligence(record, state);
      const topDriver = intelligence.signal.drivers?.[0];
      const dueKnown = market.dueDiligence.filter((item) => item.status === "known").length;
      return {
        record,
        recordId: getScoutingRecordId(record),
        intelligence,
        topDriver,
        roleFloor: intelligence.floor.score,
        dueKnown,
        dueTotal: market.dueDiligence.length,
        minutes: getScoutingRecordMinutes(record),
        age: getScoutingRecordAge(record),
      };
    })
    .sort((a, b) => (b.intelligence.roleFitScore || 0) - (a.intelligence.roleFitScore || 0));
  if (!rows.length) {
    return "";
  }
  const bestFit = rows[0]?.recordId;
  const bestConfidence = [...rows].sort((a, b) => (b.intelligence.confidence.score || 0) - (a.intelligence.confidence.score || 0))[0]?.recordId;
  const bestFloor = [...rows].sort((a, b) => (b.roleFloor || 0) - (a.roleFloor || 0))[0]?.recordId;
  const bestValue = [...rows]
    .sort(
      (a, b) =>
        (b.intelligence.roleFitScore || 0) +
        (b.intelligence.confidence.score || 0) * 0.35 -
        Math.min(b.minutes || 0, 2200) / 80 -
        ((b.age || 26) - 21) * 1.5 -
        ((a.intelligence.roleFitScore || 0) + (a.intelligence.confidence.score || 0) * 0.35 - Math.min(a.minutes || 0, 2200) / 80 - ((a.age || 26) - 21) * 1.5)
    )[0]?.recordId;
  return `
    <div class="scouting-compare-matrix">
      <div class="scouting-compare-matrix-head">
        <span>Decision matrix</span>
        <strong>${escapeHtml(rows.length === 1 ? "Add another player for comparison" : "Compare role fit, evidence and risk")}</strong>
      </div>
      <div class="scouting-compare-matrix-table">
        ${rows
          .map((row) => {
            const badges = [
              row.recordId === bestFit ? "Best fit" : "",
              row.recordId === bestConfidence ? "Best evidence" : "",
              row.recordId === bestFloor ? "Best floor" : "",
              row.recordId === bestValue ? "Value angle" : "",
            ].filter(Boolean);
            return `
              <button type="button" data-open-scouting-record="${escapeHtml(row.recordId)}">
                <strong>${escapeHtml(getScoutingRecordName(row.record))}</strong>
                <span>${escapeHtml(`${row.intelligence.roleLabel} / P${row.intelligence.roleFitScore || "n/a"}`)}</span>
                <span>${escapeHtml(`${row.intelligence.confidence.label} ${row.intelligence.confidence.score}/99`)}</span>
                <span>${escapeHtml(`${row.intelligence.floor.label} ${Number.isFinite(row.roleFloor) ? `P${row.roleFloor}` : "n/a"}`)}</span>
                <span>${escapeHtml(row.topDriver ? `${row.topDriver.label} P${row.topDriver.percentile}` : "No top driver")}</span>
                <span>${escapeHtml(`${formatScoutingNumber(row.minutes)} min / ${Number.isFinite(row.age) ? `${formatScoutingNumber(row.age)} yrs` : "age n/a"}`)}</span>
                <span>${escapeHtml(`${row.dueKnown}/${row.dueTotal} DD known`)}</span>
                <em>${escapeHtml(badges.length ? badges.join(" / ") : row.intelligence.risk.label)}</em>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}
function toggleScoutingRecordQuickView(recordId) {
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  scoutingOpenRecordActionMenuId = id;
  state.databaseExpandedRecordId = state.databaseExpandedRecordId === id ? "" : id;
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace({ preserveFocus: true });
}
function renderScoutingCompareSetPanel(state = ensureScoutingState()) {
  const records = getScoutingCompareRecordIds(state).map((recordId) => getScoutingStoredPlayerRecord(recordId, state)).filter(Boolean);
  if (!records.length) {
    return `
      <section class="scouting-compare-set is-empty" data-scouting-compare-set>
        <div>
          <span>Compare set</span>
          <strong>No players selected</strong>
          <p>Add up to five players from the database list to compare role fit, signal, confidence and risk.</p>
        </div>
      </section>
    `;
  }
  const best = [...records]
    .map((record) => ({
      record,
      intelligence: getScoutingIntelligenceProfile(record, state),
    }))
    .sort((a, b) => (b.intelligence.roleFitScore || 0) - (a.intelligence.roleFitScore || 0))[0];
  return `
    <section class="scouting-compare-set" data-scouting-compare-set>
      <div>
        <span>Compare set</span>
        <strong>${escapeHtml(`${records.length}/5 selected${best ? ` / leader ${getScoutingRecordName(best.record)} P${best.intelligence.roleFitScore || "n/a"}` : ""}`)}</strong>
        <p>${escapeHtml(best ? best.intelligence.signal.headline : "Use compare to separate similar profiles before shortlisting.")}</p>
      </div>
      <div class="scouting-compare-pills">
        ${records
          .map((record) => {
            const intelligence = getScoutingIntelligenceProfile(record, state);
            return `
              <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(record))}">
                <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
                <span>${escapeHtml(`${intelligence.roleLabel} / P${intelligence.roleFitScore || "n/a"} / ${intelligence.confidence.label}`)}</span>
              </button>
            `;
          })
          .join("")}
        <button type="button" class="scouting-secondary-button" data-clear-scouting-compare-set>Clear</button>
        <button type="button" class="scouting-primary-button" data-create-scouting-compare-report>Create compare memo</button>
      </div>
      ${renderScoutingCompareSetMatrix(records, state)}
    </section>
  `;
}
function renderScoutingCompareSetPanelIntoDom() {
  const panel = ui.scoutingWorkspace?.querySelector("[data-scouting-compare-set]");
  if (!panel) {
    return;
  }
  panel.outerHTML = renderScoutingCompareSetPanel(ensureScoutingState());
}
function updateScoutingCompareControls() {
  const state = ensureScoutingState();
  ui.scoutingWorkspace
    ?.querySelectorAll(".scouting-record-actions [data-toggle-scouting-record-compare]")
    ?.forEach((button) => {
      const active = isScoutingRecordInCompareSet(button.dataset.toggleScoutingRecordCompare, state);
      button.classList.toggle("is-active", active);
      button.textContent = active ? "Compare ✓" : "Compare";
    });
}
function getScoutingSeasonInsights(record, playerRows = []) {
  const rows = (playerRows.length ? playerRows : getScoutingRecordsForPlayer(record))
    .map((row) => ({
      record: row,
      fit: getScoutingRoleFitScore(row),
      minutes: getScoutingRecordMinutes(row),
      season: getScoutingRecordSeason(row),
      team: getScoutingRecordTeam(row),
    }))
    .filter((row) => row.record)
    .slice(0, 10);
  const current = rows[0];
  const previous = rows[1];
  const best = [...rows].filter((row) => Number.isFinite(row.fit)).sort((a, b) => b.fit - a.fit)[0] || current;
  const trend =
    current && previous && Number.isFinite(current.fit) && Number.isFinite(previous.fit)
      ? current.fit - previous.fit
      : null;
  const trendLabel =
    Number.isFinite(trend)
      ? trend > 6
        ? `Rising +${formatScoutingNumber(trend)}`
        : trend < -6
          ? `Dropping ${formatScoutingNumber(trend)}`
          : `Stable ${trend >= 0 ? "+" : ""}${formatScoutingNumber(trend)}`
      : "No trend yet";
  const reliability =
    current?.minutes >= 1800
      ? "Full-season sample"
      : current?.minutes >= 900
        ? "Useful sample"
        : current?.minutes >= 450
          ? "Moderate sample"
          : "Small sample";
  return {
    trendLabel,
    reliability,
    bestSeason: best ? `${best.season || "Unknown season"} / ${best.team || "No club"}${Number.isFinite(best.fit) ? ` / P${best.fit}` : ""}` : "No season profile",
    seasonCount: rows.length,
  };
}
function normalizeScoutingProfileSpiderSeasonMode(value) {
  const normalized = normalizeScoutingText(value, 40).toLowerCase();
  return normalized === "average" || normalized === "season" ? normalized : "latest";
}
function getScoutingProfileSpiderSeasonSelectValue(context = {}) {
  if (context.mode === "average") {
    return "average";
  }
  if (context.mode === "season" && context.season) {
    return `season::${context.season}`;
  }
  return "latest";
}
function getScoutingProfileSpiderSeasonOptions(rows = [], context = {}) {
  const selected = getScoutingProfileSpiderSeasonSelectValue(context);
  const seasons = Array.from(
    new Set(
      rows
        .slice()
        .sort((a, b) => getScoutingSeasonSortValue(b) - getScoutingSeasonSortValue(a))
        .map((row) => getScoutingRecordSeason(row))
        .filter(Boolean)
    )
  );
  const options = [
    { value: "latest", label: "Latest season" },
    { value: "average", label: "All seasons average" },
    ...seasons.map((season) => ({ value: `season::${season}`, label: season })),
  ];
  return options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}" ${selected === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}
function getScoutingProfileSpiderRows(record, playerRows = []) {
  return (playerRows.length ? playerRows : getScoutingRecordsForPlayer(record))
    .filter(Boolean)
    .sort((a, b) => getScoutingSeasonSortValue(b) - getScoutingSeasonSortValue(a) || getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a));
}
function getScoutingWeightedAverageValue(rows = [], getter, weightGetter = getScoutingRecordMinutes) {
  const samples = rows
    .map((row) => {
      const value = Number(getter(row));
      const weight = Math.max(1, Number(weightGetter(row)) || 0);
      return Number.isFinite(value) ? { value, weight } : null;
    })
    .filter(Boolean);
  if (!samples.length) {
    return null;
  }
  const weightTotal = samples.reduce((sum, sample) => sum + sample.weight, 0);
  return samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / Math.max(weightTotal, 1);
}
function getScoutingAverageMetricQuality(rows = [], metricId) {
  const qualities = rows
    .filter((row) => Number.isFinite(Number(getScoutingMetricValue(row, metricId))))
    .map((row) => getScoutingMetricQuality(row, metricId))
    .filter((quality) => quality !== "missing");
  if (!qualities.length) {
    return "missing";
  }
  return qualities.includes("estimated") ? "estimated" : "trusted";
}
function getScoutingAverageMetricIds(rows = []) {
  const ids = new Set(["minutes", "matches", "age"]);
  scoutingCoreMetricOptions.forEach((metric) => {
    const id = normalizeScoutingText(metric?.id, 120);
    if (id) {
      ids.add(id);
    }
  });
  rows.forEach((row) => {
    const metrics = row?.[scoutingRecordIndex.metrics];
    if (Array.isArray(metrics)) {
      metrics.forEach((entry, index) => {
        if (entry !== null && entry !== undefined && scoutingCoreMetricOptions[index]?.id) {
          ids.add(scoutingCoreMetricOptions[index].id);
        }
      });
      return;
    }
    if (metrics && typeof metrics === "object") {
      Object.keys(metrics).forEach((id) => ids.add(id));
    }
  });
  return Array.from(ids);
}
function buildScoutingMinutesWeightedAverageRecord(rows = [], fallbackRecord = null) {
  const sourceRows = rows.filter(Boolean);
  const latest = sourceRows[0] || fallbackRecord;
  if (!latest) {
    return fallbackRecord;
  }
  const averageRecord = Array.isArray(latest) ? latest.slice() : { ...latest };
  const metricIds = getScoutingAverageMetricIds(sourceRows);
  const averagedMetrics = {};
  const averagedQuality = {};
  metricIds.forEach((metricId) => {
    const id = normalizeScoutingText(metricId, 120);
    if (!id || id === "minutes" || id === "matches" || id === "age") {
      return;
    }
    const value = getScoutingWeightedAverageValue(sourceRows, (row) => getScoutingMetricValue(row, id));
    if (Number.isFinite(value)) {
      const quality = getScoutingAverageMetricQuality(sourceRows, id);
      averagedMetrics[id] = { value, quality };
      averagedQuality[id] = quality;
    }
  });
  const averageMinutes = getScoutingWeightedAverageValue(sourceRows, getScoutingRecordMinutes);
  const averageMatches = getScoutingWeightedAverageValue(sourceRows, (row) => Number(row?.[scoutingRecordIndex.matches]));
  averageRecord[scoutingRecordIndex.season] = "All seasons average";
  averageRecord[scoutingRecordIndex.metrics] = averagedMetrics;
  averageRecord[scoutingRecordIndex.metricQuality] = {
    ...(latest?.[scoutingRecordIndex.metricQuality] || {}),
    ...averagedQuality,
  };
  if (Number.isFinite(averageMinutes)) {
    averageRecord[scoutingRecordIndex.minutes] = Math.round(averageMinutes);
  }
  if (Number.isFinite(averageMatches)) {
    averageRecord[scoutingRecordIndex.matches] = Math.round(averageMatches * 10) / 10;
  }
  averageRecord[scoutingRecordIndex.sourceTrace] = {
    ...(latest?.[scoutingRecordIndex.sourceTrace] || {}),
    spiderSeasonMode: "all-seasons-average",
    seasonCount: sourceRows.length,
    weightedBy: "minutes",
  };
  return averageRecord;
}
function getScoutingProfileSpiderTrend(rows = [], roleProfileId = "") {
  const points = rows
    .slice()
    .sort((a, b) => getScoutingSeasonSortValue(a) - getScoutingSeasonSortValue(b))
    .map((row) => ({
      season: getScoutingRecordSeason(row) || "Season",
      minutes: getScoutingRecordMinutes(row),
      fit: getScoutingRoleFitScore(row, roleProfileId),
    }))
    .filter((point) => Number.isFinite(point.fit));
  if (points.length < 2) {
    return {
      label: "No trend yet",
      detail: rows.length ? `${rows.length} season${rows.length === 1 ? "" : "s"} available` : "Needs more seasons",
      direction: "flat",
    };
  }
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.fit - first.fit;
  const direction = delta > 5 ? "up" : delta < -5 ? "down" : "flat";
  return {
    label:
      direction === "up"
        ? `Trending up +${formatScoutingNumber(delta)}`
        : direction === "down"
          ? `Trending down ${formatScoutingNumber(delta)}`
          : `Stable ${delta >= 0 ? "+" : ""}${formatScoutingNumber(delta)}`,
    detail: `${first.season} P${formatScoutingNumber(first.fit)} → ${last.season} P${formatScoutingNumber(last.fit)} · ${points.length} seasons`,
    direction,
  };
}
function getScoutingProfileSpiderContext(record, playerRows = [], roleProfileId = "") {
  const state = ensureScoutingState();
  const rows = getScoutingProfileSpiderRows(record, playerRows);
  const latest = rows[0] || record;
  const storedMode = normalizeScoutingProfileSpiderSeasonMode(state.profileSpiderSeasonMode);
  const storedSeason = normalizeScoutingText(state.profileSpiderSeasonValue, 80);
  const selectedSeasonRow = storedMode === "season" ? rows.find((row) => getScoutingRecordSeason(row) === storedSeason) : null;
  const mode = storedMode === "season" && !selectedSeasonRow ? "latest" : storedMode;
  const sourceRecord =
    mode === "average"
      ? buildScoutingMinutesWeightedAverageRecord(rows, latest)
      : mode === "season"
        ? selectedSeasonRow
        : latest;
  const seasonLabel =
    mode === "average"
      ? "All seasons average"
      : mode === "season"
        ? getScoutingRecordSeason(sourceRecord) || storedSeason
        : getScoutingRecordSeason(sourceRecord) || "Latest season";
  return {
    mode,
    season: mode === "season" ? seasonLabel : "",
    record: sourceRecord || record,
    rows,
    trend: getScoutingProfileSpiderTrend(rows, roleProfileId),
    sampleLabel:
      mode === "average"
        ? `${rows.length} season${rows.length === 1 ? "" : "s"} · minutes-weighted`
        : `${seasonLabel}${getScoutingRecordMinutes(sourceRecord) ? ` · ${formatScoutingNumber(getScoutingRecordMinutes(sourceRecord))} minutes` : ""}`,
  };
}
function getScoutingSeasonSortValue(record) {
  const season = getScoutingRecordSeason(record);
  const years = (season.match(/\d{4}/g) || []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (years.length) {
    return Math.max(...years);
  }
  const updated = Date.parse(normalizeScoutingText(record?.updatedAt || record?.updated_at, 80));
  return Number.isFinite(updated) ? updated : 0;
}
function getScoutingTrendRows(record, template, playerRows = []) {
  const rows = (playerRows.length ? playerRows : getScoutingRecordsForPlayer(record))
    .slice()
    .sort((a, b) => getScoutingSeasonSortValue(a) - getScoutingSeasonSortValue(b))
    .slice(-5);
  if (rows.length < 2 || !template?.length) {
    return [];
  }
  return getScoutingRoleMetricRows(record, template)
    .filter((row) => Number.isFinite(row.percentile))
    .sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0))
    .slice(0, 4)
    .map((metricRow) => {
      const points = rows
        .map((row) => ({
          season: getScoutingRecordSeason(row) || "Season",
          minutes: getScoutingRecordMinutes(row),
          value: getScoutingMetricValue(row, metricRow.metricId),
          percentile: getScoutingTemplatePercentile(row, metricRow, "league-season-position"),
        }))
        .filter((point) => Number.isFinite(point.percentile));
      if (points.length < 2) {
        return null;
      }
      const first = points[0];
      const last = points[points.length - 1];
      const delta = last.percentile - first.percentile;
      const sampleWeight = Math.min(1, points.reduce((sum, point) => sum + Math.min(point.minutes || 0, 900), 0) / Math.max(points.length * 900, 1));
      return {
        ...metricRow,
        points,
        delta,
        sampleWeight,
        label: getScoutingTrendDirectionLabel(delta, sampleWeight),
      };
    })
    .filter(Boolean);
}
function renderScoutingTrendSparkline(points = []) {
  if (points.length < 2) {
    return "";
  }
  const width = 132;
  const height = 34;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - (Math.max(1, Math.min(99, point.percentile)) / 100) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `
    <svg class="scouting-trend-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Metric trend">
      <polyline points="${coordinates.join(" ")}" />
      ${coordinates.map((point) => {
        const [x, y] = point.split(",");
        return `<circle cx="${x}" cy="${y}" r="2.2" />`;
      }).join("")}
    </svg>
  `;
}
function renderScoutingTrendPanel(record, template, playerRows = []) {
  const trends = getScoutingTrendRows(record, template, playerRows);
  return `
    <section class="scouting-profile-metrics scouting-trend-panel">
      <h3>Role metric trends</h3>
      <div class="scouting-trend-grid">
        ${
          trends.length
            ? trends
                .map(
                  (trend) => `
                    <article>
                      <div>
                        <span>${escapeHtml(trend.metric.label)}</span>
                        <strong>${escapeHtml(trend.label)}</strong>
                        <em>${escapeHtml(`${trend.points.length} seasons / sample-weight ${Math.round(trend.sampleWeight * 100)}%`)}</em>
                      </div>
                      ${renderScoutingTrendSparkline(trend.points)}
                    </article>
                  `
                )
                .join("")
            : `<p class="scouting-muted">Need at least two seasons with role metric data to show trend flags.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingCalibrationPanel(record, state = ensureScoutingState(), roleProfileId = "") {
  const intelligence = getScoutingIntelligenceProfile(record, state, roleProfileId);
  const template = getScoutingRadarTemplate(record, roleProfileId);
  const rows = getScoutingRoleMetricRows(record, template)
    .filter((row) => Number.isFinite(row.percentile))
    .sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0))
    .slice(0, 6);
  return `
    <section class="scouting-profile-metrics scouting-calibration-panel">
      <h3>Calibration and benchmark</h3>
      <div class="scouting-calibration-summary">
        <article>
          <span>Calibration read</span>
          <strong>${escapeHtml(intelligence.calibration.label)}</strong>
          <em>${escapeHtml(intelligence.calibration.benchmark)}</em>
        </article>
        <article>
          <span>League factor</span>
          <strong>${escapeHtml(formatScoutingNumber(intelligence.calibration.leagueFactor))}</strong>
          <em>${escapeHtml(getScoutingRecordLeague(record) || "League unknown")}</em>
        </article>
        <article>
          <span>Role fit movement</span>
          <strong>${escapeHtml(Number.isFinite(intelligence.calibration.delta) ? `${intelligence.calibration.delta >= 0 ? "+" : ""}${intelligence.calibration.delta}` : "n/a")}</strong>
          <em>${escapeHtml(`Raw P${intelligence.calibration.rawRoleFitScore || "n/a"} -> calibrated P${intelligence.roleFitScore || "n/a"}`)}</em>
        </article>
        <article>
          <span>Local sample</span>
          <strong>${escapeHtml(intelligence.calibration.localSampleAverage || "n/a")}</strong>
          <em>average league/season/position rows</em>
        </article>
      </div>
      <div class="scouting-calibration-rows">
        ${
          rows.length
            ? rows
                .map((row) => {
                  const raw = getScoutingBenchmarkPercentile(record, row.metricId, "position", row.direction || row.desiredDirection || "higher");
                  const local = getScoutingBenchmarkPercentile(record, row.metricId, "league-season-position", row.direction || row.desiredDirection || "higher");
                  const sample = getScoutingBenchmarkSampleSize(record, row.metricId, "league-season-position");
                  return `
                    <p>
                      <strong>${escapeHtml(row.metric.label)}</strong>
                      <span>${escapeHtml(`calibrated P${row.percentile} / raw P${Number.isFinite(raw) ? raw : "n/a"} / local P${Number.isFinite(local) ? local : "n/a"} / sample ${sample}`)}</span>
                    </p>
                  `;
                })
                .join("")
            : `<p class="scouting-muted">No calibrated role metrics available yet.</p>`
        }
      </div>
    </section>
  `;
}
function getScoutingDataReadinessStatus(score) {
  if (score >= 82) {
    return "Decision ready";
  }
  if (score >= 64) {
    return "Scouting ready";
  }
  if (score >= 42) {
    return "Needs verification";
  }
  return "Data light";
}
function getScoutingPlayerDataReadiness(record, state = ensureScoutingState(), roleProfileId = "") {
  const intelligence = getScoutingIntelligenceProfile(record, state, roleProfileId);
  const market = getScoutingMarketIntelligence(record, state);
  const marketKnown = market.dueDiligence.filter((item) => item.status === "known").length;
  const sourceTrace = getScoutingRecordSourceTrace(record);
  const sourceId = getScoutingRecordPlayerSourceId(record) || normalizeScoutingText(sourceTrace.sourcePlayerId || sourceTrace.source_player_id, 160);
  const identitySource = normalizeScoutingText(sourceTrace.identitySource, 40);
  const hasMappedSourceId = Boolean(sourceId && identitySource !== "derived");
  const identityId = getScoutingRecordPlayerIdentityId(record);
  const dateOfBirth = getScoutingRecordDateOfBirth(record);
  const nationality = getScoutingRecordNationalityMeta(record);
  const seasonRows = getScoutingRecordsForPlayer(record);
  const roleNeeds = intelligence.risk.needs || [];
  const itemScores = [
    {
      label: "Player identity",
      score: identityId && dateOfBirth && nationality.code !== "N/A" ? 100 : identityId ? 68 : 28,
      detail: identityId && dateOfBirth ? `ID ${identityId} / DOB ${dateOfBirth} / ${nationality.code}` : "Needs player ID, date of birth and nationality lock.",
    },
    {
      label: "Source IDs",
      score: hasMappedSourceId ? 100 : sourceId ? 58 : 42,
      detail: hasMappedSourceId
        ? `Mapped source ID ${sourceId}`
        : sourceId
          ? "Identity is derived. Add an external player/source ID so weekly imports merge safely."
          : "Add source IDs so future imports merge safely.",
    },
    {
      label: "Role metrics",
      score: roleNeeds.length ? Math.max(30, 100 - roleNeeds.length * 18) : 100,
      detail: roleNeeds.length ? `Missing: ${roleNeeds.slice(0, 4).join(", ")}` : "Role spider has the required metric columns.",
    },
    {
      label: "Season trend",
      score: seasonRows.length >= 3 ? 100 : seasonRows.length >= 2 ? 70 : 34,
      detail: `${seasonRows.length} season row${seasonRows.length === 1 ? "" : "s"} linked to this player.`,
    },
    {
      label: "Market due diligence",
      score: Math.round((marketKnown / Math.max(market.dueDiligence.length, 1)) * 100),
      detail: `${marketKnown}/${market.dueDiligence.length} market checks known.`,
    },
    {
      label: "Calibration sample",
      score:
        intelligence.calibration.localSampleAverage >= 24
          ? 100
          : intelligence.calibration.localSampleAverage >= 12
            ? 72
            : 44,
      detail: `${intelligence.calibration.label}. Local sample ${intelligence.calibration.localSampleAverage || "n/a"}.`,
    },
  ];
  const score = Math.round(itemScores.reduce((sum, item) => sum + item.score, 0) / Math.max(itemScores.length, 1));
  const weakest = [...itemScores].sort((a, b) => a.score - b.score)[0] || null;
  return {
    score,
    label: getScoutingDataReadinessStatus(score),
    weakest,
    items: itemScores.map((item) => ({
      ...item,
      status: item.score >= 82 ? "ready" : item.score >= 58 ? "partial" : "missing",
    })),
  };
}
function getScoutingDecisionGate(record, state = ensureScoutingState(), roleProfileId = "") {
  const intelligence = getScoutingIntelligenceProfile(record, state, roleProfileId);
  const readiness = getScoutingPlayerDataReadiness(record, state, roleProfileId);
  const market = getScoutingMarketIntelligence(record, state);
  const target = findScoutingTargetByRecordId(getScoutingRecordId(record), state);
  const marketKnown = market.dueDiligence.filter((item) => item.status === "known").length;
  const marketReady = marketKnown >= 4 || ["shortlist", "contacted", "negotiation"].includes(target?.status || "");
  const roleReady =
    Number.isFinite(intelligence.roleFitScore) &&
    intelligence.roleFitScore >= 74 &&
    Number.isFinite(intelligence.floor.score) &&
    intelligence.floor.score >= 50;
  const evidenceReady = intelligence.confidence.score >= 82 && readiness.score >= 72;
  const highUpside = intelligence.roleFitScore >= 80 && intelligence.confidence.score >= 66;
  if (roleReady && evidenceReady && marketReady) {
    return {
      tone: "ready",
      label: "Decision gate",
      title: "Ready for decision meeting",
      action: "Prepare final recommendation and confirm commercial terms.",
      blocker: "No major data blocker.",
      nextStep: "Create report memo and move to decision meeting.",
    };
  }
  if (roleReady && evidenceReady && !marketReady) {
    return {
      tone: "market",
      label: "Decision gate",
      title: "Sporting case ready, market blocked",
      action: "Verify contract, agent, wage band and transfer pathway before decision.",
      blocker: "Market due diligence is incomplete.",
      nextStep: "Complete due diligence checklist.",
    };
  }
  if (highUpside && intelligence.floor.score < 50) {
    return {
      tone: "watch",
      label: "Decision gate",
      title: "High upside, role-floor risk",
      action: "Scout the weakest role KPI before shortlisting.",
      blocker: `Role floor ${Number.isFinite(intelligence.floor.score) ? `P${intelligence.floor.score}` : "missing"}.`,
      nextStep: "Open quick view and validate the watch point on video.",
    };
  }
  if (highUpside && intelligence.confidence.score < 82) {
    return {
      tone: "evidence",
      label: "Decision gate",
      title: "Promising but needs evidence",
      action: "Increase sample confidence before pushing to decision.",
      blocker: intelligence.confidence.detail,
      nextStep: "Add more match data, trend history or live scout notes.",
    };
  }
  if (readiness.score < 64) {
    return {
      tone: "data",
      label: "Decision gate",
      title: "Data not decision-safe",
      action: "Fix identity/source/role metric gaps first.",
      blocker: readiness.weakest ? `${readiness.weakest.label}: ${readiness.weakest.detail}` : "Data readiness is low.",
      nextStep: "Complete missing data before compare or report.",
    };
  }
  return {
    tone: "monitor",
    label: "Decision gate",
    title: "Monitor, not decision-ready",
    action: "Keep in database watch unless tactical context changes.",
    blocker: intelligence.risk.detail,
    nextStep: "Use saved view or compare set if the role need becomes active.",
  };
}
function renderScoutingDecisionGateCard(record, state = ensureScoutingState(), roleProfileId = "") {
  const gate = getScoutingDecisionGate(record, state, roleProfileId);
  return `
    <article class="scouting-decision-gate is-${escapeHtml(gate.tone)}">
      <span>${escapeHtml(gate.label)}</span>
      <strong>${escapeHtml(gate.title)}</strong>
      <p>${escapeHtml(gate.action)}</p>
      <em>${escapeHtml(`Blocker: ${gate.blocker}`)}</em>
      <small>${escapeHtml(gate.nextStep)}</small>
    </article>
  `;
}
function renderScoutingDataReadinessPanel(record, state = ensureScoutingState(), roleProfileId = "") {
  const readiness = getScoutingPlayerDataReadiness(record, state, roleProfileId);
  return `
    <section class="scouting-profile-metrics scouting-data-readiness">
      <h3>Data readiness</h3>
      <div class="scouting-data-readiness-head">
        <div>
          <span>Readiness score</span>
          <strong>${escapeHtml(`${readiness.label} / ${readiness.score}%`)}</strong>
          <em>${escapeHtml(readiness.weakest ? `Next data need: ${readiness.weakest.label}` : "No major data need")}</em>
        </div>
      </div>
      <div class="scouting-data-readiness-grid">
        ${readiness.items
          .map(
            (item) => `
              <article class="is-${escapeHtml(item.status)}">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.status === "ready" ? "OK" : item.status === "partial" ? "Partial" : "Missing")}</strong>
                <p>${escapeHtml(item.detail)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
function getScoutingPlayerIdentityAudit(record) {
  const trace = getScoutingRecordSourceTrace(record);
  const identityId = getScoutingRecordPlayerIdentityId(record);
  const sourceId = getScoutingRecordPlayerSourceId(record) || normalizeScoutingText(trace.sourcePlayerId || trace.source_player_id, 160);
  const identitySource = normalizeScoutingText(trace.identitySource, 40);
  const dateOfBirth = getScoutingRecordDateOfBirth(record);
  const nationality = getScoutingRecordNationalityMeta(record);
  const sourceRecordId = getScoutingRecordSourceId(record);
  const sourceFileName = normalizeScoutingText(trace.sourceFileName, 180);
  const batchId = normalizeScoutingText(trace.importBatchId, 100);
  const rowNumber = normalizeScoutingText(trace.sourceRowNumber, 40);
  const importedAt = formatScoutingImportSummaryDate(trace.importedAt || trace.uploadedAt || "");
  const warnings = [];
  if (!dateOfBirth) {
    warnings.push("Missing date of birth");
  }
  if (!nationality.code || nationality.code === "N/A") {
    warnings.push("Missing nationality");
  }
  if (identitySource === "derived" || !identitySource) {
    warnings.push("Derived player identity");
  }
  if (!sourceRecordId) {
    warnings.push("Missing season/source row key");
  }
  const tone = warnings.length ? (warnings.length >= 3 ? "risk" : "watch") : "ready";
  const label = tone === "ready" ? "Identity locked" : tone === "risk" ? "Identity risk" : "Identity needs review";
  return {
    tone,
    label,
    detail:
      tone === "ready"
        ? "This player has enough identity and row lineage to merge future imports safely."
        : "Complete identity fields before relying on this profile for weekly database updates.",
    warnings,
    items: [
      {
        label: "Player identity",
        value: identityId || "Missing",
        detail: identitySource === "derived" ? "Derived from name, date of birth and nationality." : "Mapped identity key.",
      },
      {
        label: "External source ID",
        value: sourceId && identitySource !== "derived" ? "Mapped" : "Not mapped",
        detail: sourceId && identitySource !== "derived" ? sourceId : "Add a stable external player ID when available.",
      },
      {
        label: "DOB / nationality",
        value: `${dateOfBirth || "No DOB"} / ${nationality.code || "N/A"}`,
        detail: nationality.label || "Nationality is missing.",
      },
      {
        label: "Season row key",
        value: sourceRecordId || "Missing",
        detail: "Used with season, league and team to replace the correct row.",
      },
      {
        label: "Import batch",
        value: batchId || "Local / pending",
        detail: importedAt || "No uploaded timestamp found.",
      },
      {
        label: "Database row trace",
        value: rowNumber ? `Row ${rowNumber}` : "No row number",
        detail: sourceFileName ? "Scouting player database upload trace available." : "No upload trace available.",
      },
    ],
  };
}
function renderScoutingIdentityAuditPanel(record) {
  const audit = getScoutingPlayerIdentityAudit(record);
  return `
    <section class="scouting-profile-metrics scouting-identity-audit is-${escapeHtml(audit.tone)}">
      <div class="scouting-identity-audit-head">
        <div>
          <span>Identity & lineage</span>
          <strong>${escapeHtml(audit.label)}</strong>
          <p>${escapeHtml(audit.detail)}</p>
        </div>
        <em>${escapeHtml(audit.warnings.length ? audit.warnings.join(" / ") : "No identity warnings")}</em>
      </div>
      <div class="scouting-identity-audit-grid">
        ${audit.items
          .map(
            (item) => `
              <article>
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
                <p>${escapeHtml(item.detail)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
function getScoutingComparablePlayers(record, limit = 4) {
  const recordId = getScoutingRecordId(record);
  const template = getScoutingRadarTemplate(record);
  const base = template
    .map((item) => ({ metricId: item.metricId, percentile: getScoutingTemplatePercentile(record, item), templateItem: item }))
    .filter((item) => Number.isFinite(item.percentile));
  if (base.length < 2) {
    return [];
  }
  const group = getScoutingPositionGroup(record);
  return (getScoutingDatabase()?.records || [])
    .filter((candidate) => getScoutingRecordId(candidate) !== recordId && getScoutingPositionGroup(candidate) === group)
    .map((candidate) => {
      const candidateValues = base
        .map((item) => {
          const percentile = getScoutingTemplatePercentile(candidate, item.templateItem);
          return Number.isFinite(percentile) ? Math.abs(percentile - item.percentile) : null;
        })
        .filter((value) => Number.isFinite(value));
      if (candidateValues.length < 2) {
        return null;
      }
      const similarity = Math.max(1, Math.round(100 - candidateValues.reduce((sum, value) => sum + value, 0) / candidateValues.length));
      return {
        record: candidate,
        similarity,
        fit: getScoutingRoleFitScore(candidate),
        signal: getScoutingBestSignal(candidate),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity || (b.fit || 0) - (a.fit || 0))
    .slice(0, limit);
}
function getScoutingSlotRecommendationRows(slot, state = ensureScoutingState(), limit = 5) {
  if (!slot || !isScoutingDatabaseLoaded()) {
    return [];
  }
  const existingSlotIds = new Set(getScoutingShadowSlotRecordIds(slot.id, state));
  const allShadowIds = new Set(getScoutingAllShadowRecordIds(state));
  const favoriteIds = new Set(normalizeScoutingRecordIds(state.favoriteRecordIds));
  const pipelineIds = new Set(getScoutingTargetedRecordIds(state));
  const candidateRecords = getScoutingDatabase()?.records || [];
  return candidateRecords
    .filter((record) => {
      const recordId = getScoutingRecordId(record);
      const tokens = getScoutingPositionTokens(record);
      return (
        recordId &&
        !existingSlotIds.has(recordId) &&
        getScoutingRecordMinutes(record) >= 450 &&
        (tokens.includes(slot.position) || tokens.includes(slot.label))
      );
    })
    .map((record) => {
      const recordId = getScoutingRecordId(record);
      const fit = getScoutingRoleFitScore(record);
      const age = getScoutingRecordAge(record);
      const minutes = getScoutingRecordMinutes(record);
      const score =
        (Number.isFinite(fit) ? fit : 0) +
        (favoriteIds.has(recordId) ? 5 : 0) +
        (pipelineIds.has(recordId) ? 6 : 0) +
        (allShadowIds.has(recordId) ? -3 : 0) +
        (Number.isFinite(age) && age <= 23 ? 3 : 0) +
        (minutes <= 1600 ? 2 : 0);
      return {
        record,
        recordId,
        slot,
        fit,
        age,
        minutes,
        score,
        signal: getScoutingBestSignal(record),
        isFavorite: favoriteIds.has(recordId),
        isPipeline: pipelineIds.has(recordId),
        isShadow: allShadowIds.has(recordId),
      };
    })
    .filter((item) => Number.isFinite(item.fit))
    .sort((a, b) => b.score - a.score || (b.fit || 0) - (a.fit || 0))
    .slice(0, limit);
}
function getScoutingGlobalRecruitmentQueue(state = ensureScoutingState(), limit = 8) {
  const seen = new Set();
  return scoutingShadowSlots
    .flatMap((slot) => {
      const depth = getScoutingShadowSlotRecordIds(slot.id, state).length;
      const urgencyBoost = depth === 0 ? 10 : depth === 1 ? 5 : depth === 2 ? 2 : 0;
      return getScoutingSlotRecommendationRows(slot, state, 3).map((item) => ({
        ...item,
        slotDepth: depth,
        queueScore: item.score + urgencyBoost,
      }));
    })
    .sort((a, b) => b.queueScore - a.queueScore || (b.fit || 0) - (a.fit || 0))
    .filter((item) => {
      if (seen.has(item.recordId)) {
        return false;
      }
      seen.add(item.recordId);
      return true;
    })
    .slice(0, limit);
}
function renderScoutingRecruitmentQueue(state) {
  const rows = getScoutingGlobalRecruitmentQueue(state, 8);
  const openSlots = scoutingShadowSlots.filter((slot) => !getScoutingShadowSlotRecordIds(slot.id, state).length);
  return `
    <div class="scouting-cockpit-queue">
      <div class="scouting-cockpit-queue-head">
        <div>
          <span>Auto shortlist</span>
          <h3>${rows.length ? "Best next recruitment actions" : "No auto recommendations yet"}</h3>
        </div>
        <p>${escapeHtml(
          openSlots.length
            ? `Open roles first: ${openSlots.slice(0, 4).map((slot) => slot.label).join(", ")}${openSlots.length > 4 ? "..." : ""}`
            : "Every role has at least one player. Now build depth and rank candidates."
        )}</p>
      </div>
      <div class="scouting-cockpit-queue-grid">
        ${
          rows.length
            ? rows
                .map(
                  (item) => `
                    <article>
                      <button type="button" class="scouting-queue-player" data-open-scouting-record="${escapeHtml(item.recordId)}">
                        <span>${escapeHtml(item.slot.label)} / ${escapeHtml(item.slot.position)}</span>
                        <strong>${escapeHtml(getScoutingRecordName(item.record))}</strong>
                        <em>${escapeHtml(getScoutingRecordTeam(item.record) || getScoutingRecordLeague(item.record))}</em>
                      </button>
                      <div>
                        <span>${escapeHtml(getScoutingRoleFitLabel(item.fit))} / P${escapeHtml(item.fit)}</span>
                        <span>${escapeHtml(item.signal ? `${item.signal.metric.label} P${item.signal.percentile}` : "No standout signal")}</span>
                      </div>
                      <button
                        type="button"
                        class="scouting-secondary-button"
                        data-add-scouting-record-to-shadow="${escapeHtml(item.recordId)}"
                        data-scouting-shadow-slot-id="${escapeHtml(item.slot.id)}"
                      >
                        Add to ${escapeHtml(item.slot.label)}
                      </button>
                    </article>
                  `
                )
                .join("")
            : `<p class="scouting-muted">Load the database and choose a Shadow XI role to generate recommendations.</p>`
        }
      </div>
    </div>
  `;
}
function renderScoutingNextActionCenter(state, options = {}) {
  const includeRecommendations = options.includeRecommendations !== false;
  const targets = getScoutingTargets(state);
  const urgentTargets = targets
    .map((target) => ({ target, record: getScoutingTargetRecord(target) }))
    .filter((item) => item.record && ["urgent", "high"].includes(item.target.priority))
    .slice(0, 3);
  const queueRows = includeRecommendations ? getScoutingGlobalRecruitmentQueue(state, 4) : [];
  const openSlots = scoutingShadowSlots.filter((slot) => !getScoutingShadowSlotRecordIds(slot.id, state).length);
  const targetCount = targets.length;
  return `
    <section class="scouting-next-actions">
      <article class="is-primary">
        <span>Scouting control tower</span>
        <h2>${openSlots.length ? `${openSlots.length} open roles` : "Role coverage complete"}</h2>
        <p>${escapeHtml(
          openSlots.length
            ? `Fill ${openSlots.slice(0, 3).map((slot) => slot.label).join(", ")} before final ranking.`
            : "Start separating must-buy, monitor and no-go players."
        )}</p>
      </article>
      <article>
        <span>Pipeline</span>
        <h2>${targetCount}</h2>
        <p>${escapeHtml(urgentTargets.length ? `${urgentTargets.length} high/urgent target${urgentTargets.length === 1 ? "" : "s"} need follow-up.` : "No urgent targets yet.")}</p>
      </article>
      <article>
        <span>Best next add</span>
        <h2>${escapeHtml(queueRows[0] ? getScoutingRecordName(queueRows[0].record) : includeRecommendations ? "None" : "Shadow XI")}</h2>
        <p>${escapeHtml(
          queueRows[0]
            ? `${queueRows[0].slot.label} / P${queueRows[0].fit}`
            : includeRecommendations
              ? "Add filters or load database recommendations."
              : "Open Shadow XI for live recommendations."
        )}</p>
      </article>
      <div class="scouting-next-action-list">
        ${
          urgentTargets.length || queueRows.length
            ? [...urgentTargets.map((item) => ({ type: "target", ...item })), ...queueRows.map((item) => ({ type: "queue", ...item }))]
                .slice(0, 5)
                .map((item) => {
                  const record = item.record;
                  const recordId = getScoutingRecordId(record);
                  const title = getScoutingRecordName(record);
                  const label = item.type === "target" ? "Pipeline follow-up" : `${item.slot.label} recommendation`;
                  const detail = item.type === "target" ? `${item.target.status} / ${item.target.priority}` : `Role fit P${item.fit}`;
                  return `
                    <button type="button" data-open-scouting-record="${escapeHtml(recordId)}">
                      <span>${escapeHtml(label)}</span>
                      <strong>${escapeHtml(title)}</strong>
                      <em>${escapeHtml(detail)}</em>
                    </button>
                  `;
                })
                .join("")
            : ""
        }
      </div>
    </section>
  `;
}
function renderScoutingBudgetBoard(state = ensureScoutingState()) {
  const activeTargets = getScoutingTargets(state)
    .map((target) => ({
      target,
      record: getScoutingTargetRecord(target),
    }))
    .filter((item) => item.record && !["rejected", "archived", "signed"].includes(item.target.status))
    .map((item) => ({
      ...item,
      market: getScoutingMarketInfo(getScoutingRecordId(item.record), state),
      fit: getScoutingRoleFitScore(item.record),
    }));
  const budgeted = activeTargets.filter((item) => item.market.estimatedFee || item.market.salaryRange || item.market.budgetImpact);
  const highProbability = activeTargets.filter((item) => isScoutingHighDealProbability(item.market.dealProbability));
  return `
    <section class="scouting-budget-board">
      <div class="scouting-budget-head">
        <div>
          <span>Budget board</span>
          <h2>${budgeted.length ? `${budgeted.length} costed target${budgeted.length === 1 ? "" : "s"}` : "No costed targets yet"}</h2>
        </div>
        <p>${escapeHtml(`${activeTargets.length} active pipeline targets / ${highProbability.length} high-probability deals`)}</p>
      </div>
      <div class="scouting-budget-grid">
        ${
          activeTargets.length
            ? activeTargets
                .slice(0, 8)
                .map(
                  (item) => `
                    <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(item.record))}">
                      <span>${escapeHtml(item.target.status)} / ${escapeHtml(item.target.priority)}</span>
                      <strong>${escapeHtml(getScoutingRecordName(item.record))}</strong>
                      <em>${escapeHtml([
                        item.market.estimatedFee ? `Fee ${item.market.estimatedFee}` : "Fee unknown",
                        item.market.salaryRange ? `Salary ${item.market.salaryRange}` : "Salary unknown",
                        item.market.dealProbability ? `Deal ${item.market.dealProbability}` : "Probability unknown",
                      ].join(" / "))}</em>
                      <small>${escapeHtml(item.market.budgetImpact || `Role fit ${Number.isFinite(item.fit) ? `P${item.fit}` : "n/a"}`)}</small>
                    </button>
                  `
                )
                .join("")
            : `<p class="scouting-muted">Add players to the pipeline and market file to build a budget board.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingMarketRadar(records) {
  const state = ensureScoutingState();
  const candidatePool = records.slice(0, SCOUTING_ADVANCED_PANEL_RECORD_LIMIT).map((record) => ({
    record,
    recordId: getScoutingRecordId(record),
    fit: getScoutingRoleFitScore(record),
    age: getScoutingRecordAge(record),
    minutes: getScoutingRecordMinutes(record),
    signal: getScoutingBestSignal(record),
  }));
  const favorites = new Set(normalizeScoutingRecordIds(state.favoriteRecordIds));
  const pipeline = new Set(getScoutingTargetedRecordIds(state));
  const shadow = new Set(getScoutingAllShadowRecordIds(state));
  const cards = [
    {
      label: "Best role fit",
      record: [...candidatePool].filter((item) => Number.isFinite(item.fit)).sort((a, b) => b.fit - a.fit)[0],
      detail: (item) => `${getScoutingRoleFitLabel(item.fit)} / P${item.fit}`,
    },
    {
      label: "Breakout watch",
      record: [...candidatePool]
        .filter((item) => Number.isFinite(item.age) && item.age <= 23 && Number.isFinite(item.fit))
        .sort((a, b) => b.fit - a.fit || a.age - b.age)[0],
      detail: (item) => `${formatScoutingNumber(item.age)} yrs / P${item.fit}`,
    },
    {
      label: "Value angle",
      record: [...candidatePool]
        .filter((item) => Number.isFinite(item.fit) && item.fit >= 70 && item.minutes <= 1600)
        .sort((a, b) => b.fit - a.fit || a.minutes - b.minutes)[0],
      detail: (item) => `${formatScoutingNumber(item.minutes)} min / P${item.fit}`,
    },
    {
      label: "Already on radar",
      record: candidatePool.find((item) => favorites.has(item.recordId) || pipeline.has(item.recordId) || shadow.has(item.recordId)),
      detail: (item) =>
        `${favorites.has(item.recordId) ? "Favorite" : pipeline.has(item.recordId) ? "Pipeline" : "Shadow XI"} / ${
          Number.isFinite(item.fit) ? `P${item.fit}` : "No fit"
        }`,
    },
  ].filter((card) => card.record);
  return `
    <section class="scouting-market-radar" data-scouting-market-radar>
      ${
        cards.length
          ? cards
              .map(
                (card) => `
                  <button type="button" data-open-scouting-record="${escapeHtml(card.record.recordId)}">
                    <span>${escapeHtml(card.label)}</span>
                    <strong>${escapeHtml(getScoutingRecordName(card.record.record))}</strong>
                    <em>${escapeHtml(card.detail(card.record))}</em>
                  </button>
                `
              )
              .join("")
          : `<p class="scouting-muted">No market radar cards for this filter set yet.</p>`
      }
    </section>
  `;
}
function getScoutingDatabaseBriefCards(records = [], state = ensureScoutingState()) {
  const reports = getScoutingReports(state);
  const reportTargetIds = new Set(reports.map((report) => normalizeScoutingText(report.targetId, 120)).filter(Boolean));
  const pool = records.slice(0, SCOUTING_ADVANCED_PANEL_RECORD_LIMIT).map((record) => {
    const recordId = getScoutingRecordId(record);
    const intelligence = getScoutingIntelligenceProfile(record, state);
    const target = findScoutingTargetByRecordId(recordId, state);
    const market = getScoutingMarketIntelligence(record, state);
    const gate = getScoutingDecisionGate(record, state);
    return {
      record,
      recordId,
      intelligence,
      target,
      market,
      gate,
      age: getScoutingRecordAge(record),
      minutes: getScoutingRecordMinutes(record),
      dataNeedCount: intelligence.risk.needs.length,
      hasReport: target ? reportTargetIds.has(target.id) : false,
    };
  });
  const valueCases = pool
    .filter(
      (item) =>
        Number.isFinite(item.intelligence.roleFitScore) &&
        item.intelligence.roleFitScore >= 80 &&
        item.intelligence.confidence.score >= 66 &&
        Number.isFinite(item.age) &&
        item.age <= 23 &&
        item.minutes <= 900
    )
    .sort((a, b) => b.intelligence.roleFitScore - a.intelligence.roleFitScore || b.intelligence.confidence.score - a.intelligence.confidence.score);
  const trapWatch = pool
    .filter((item) => item.intelligence.roleFitScore >= 76 && item.intelligence.confidence.score < 66)
    .sort((a, b) => b.intelligence.roleFitScore - a.intelligence.roleFitScore || a.intelligence.confidence.score - b.intelligence.confidence.score);
  const dataGaps = pool
    .filter((item) => item.dataNeedCount >= 2 && item.intelligence.roleFitScore >= 68)
    .sort((a, b) => b.dataNeedCount - a.dataNeedCount || b.intelligence.roleFitScore - a.intelligence.roleFitScore);
  const completeProfiles = pool
    .filter(
      (item) =>
        Number.isFinite(item.intelligence.roleFitScore) &&
        item.intelligence.roleFitScore >= 74 &&
        Number.isFinite(item.intelligence.floor.score) &&
        item.intelligence.floor.score >= 55 &&
        item.intelligence.confidence.score >= 66
    )
    .sort((a, b) => b.intelligence.roleFitScore - a.intelligence.roleFitScore || b.intelligence.floor.score - a.intelligence.floor.score);
  const decisionGates = pool
    .filter((item) => item.gate.tone === "ready" || item.gate.tone === "market")
    .sort(
      (a, b) =>
        (a.gate.tone === "ready" ? -1 : 0) - (b.gate.tone === "ready" ? -1 : 0) ||
        b.intelligence.roleFitScore - a.intelligence.roleFitScore
    );
  const reportQueue = pool
    .filter((item) => item.target && !item.hasReport && item.intelligence.roleFitScore >= 70)
    .sort((a, b) => b.intelligence.roleFitScore - a.intelligence.roleFitScore || b.intelligence.confidence.score - a.intelligence.confidence.score);
  return [
    {
      tone: "opportunity",
      label: "Value cases",
      title: valueCases.length ? `${valueCases.length} undervalued profile${valueCases.length === 1 ? "" : "s"}` : "No value case in this view",
      detail: valueCases[0]
        ? `${getScoutingRecordName(valueCases[0].record)}: P${valueCases[0].intelligence.roleFitScore}, ${valueCases[0].confidence?.label || valueCases[0].intelligence.confidence.label}, ${formatScoutingNumber(valueCases[0].minutes)} min.`
        : "Try U23, low minutes and high role-fit filters.",
      item: valueCases[0],
      action: "Compare",
    },
    {
      tone: "warning",
      label: "Trap watch",
      title: trapWatch.length ? `${trapWatch.length} high-fit / low-confidence case${trapWatch.length === 1 ? "" : "s"}` : "No obvious trap in this view",
      detail: trapWatch[0]
        ? `${getScoutingRecordName(trapWatch[0].record)} needs evidence: ${trapWatch[0].intelligence.confidence.detail}`
        : "Confidence, sample-size and data-quality look acceptable.",
      item: trapWatch[0],
      action: "Open",
    },
    {
      tone: "risk",
      label: "Data gaps",
      title: dataGaps.length ? `${dataGaps.length} useful profile${dataGaps.length === 1 ? "" : "s"} need data` : "No major role-data gaps",
      detail: dataGaps[0]
        ? `${getScoutingRecordName(dataGaps[0].record)} needs ${dataGaps[0].intelligence.risk.needs.slice(0, 3).join(", ")}.`
        : "Role spiders have enough columns for this result set.",
      item: dataGaps[0],
      action: "Quick view",
    },
    {
      tone: "opportunity",
      label: "Complete profiles",
      title: completeProfiles.length ? `${completeProfiles.length} balanced role fit${completeProfiles.length === 1 ? "" : "s"}` : "No complete profile in this view",
      detail: completeProfiles[0]
        ? `${getScoutingRecordName(completeProfiles[0].record)}: role fit P${completeProfiles[0].intelligence.roleFitScore}, floor P${completeProfiles[0].intelligence.floor.score}.`
        : "Use the complete role profile preset or lower min role floor.",
      item: completeProfiles[0],
      action: "Compare",
    },
    {
      tone: decisionGates[0]?.gate.tone === "market" ? "warning" : "opportunity",
      label: "Decision gate",
      title: decisionGates.length ? `${decisionGates.length} decision case${decisionGates.length === 1 ? "" : "s"}` : "No decision-ready case",
      detail: decisionGates[0]
        ? `${getScoutingRecordName(decisionGates[0].record)}: ${decisionGates[0].gate.title}.`
        : "Need stronger evidence, role floor or market due diligence.",
      item: decisionGates[0],
      action: decisionGates[0]?.gate.tone === "market" ? "Quick view" : "Create memo",
    },
    {
      tone: "urgent",
      label: "Report queue",
      title: reportQueue.length ? `${reportQueue.length} pipeline target${reportQueue.length === 1 ? "" : "s"} need memo` : "No missing pipeline memos",
      detail: reportQueue[0]
        ? `${getScoutingRecordName(reportQueue[0].record)} is ${reportQueue[0].target.status}/${reportQueue[0].target.priority} without a report draft.`
        : "Active pipeline targets in this view have memo coverage.",
      item: reportQueue[0],
      action: "Create memo",
    },
  ];
}
function renderScoutingDatabaseIntelligenceBrief(records = [], state = ensureScoutingState(), options = {}) {
  const cards = getScoutingDatabaseBriefCards(records, state);
  const totalCount = Math.max(records.length, Math.floor(Number(options.totalCount) || 0));
  return `
    <section class="scouting-intelligence-brief" data-scouting-intelligence-brief>
      <div class="scouting-intelligence-brief-head">
        <span>Database intelligence brief</span>
        <strong>${escapeHtml(`${totalCount.toLocaleString("en-US")} players in current view`)}</strong>
      </div>
      <div class="scouting-intelligence-brief-grid">
        ${cards
          .map((card) => {
            const recordId = card.item?.recordId || "";
            const actionAttribute =
              card.action === "Create memo" && recordId
                ? `data-create-scouting-profile-report="${escapeHtml(recordId)}"`
                : card.action === "Compare" && recordId
                  ? `data-toggle-scouting-record-compare="${escapeHtml(recordId)}"`
                  : card.action === "Quick view" && recordId
                    ? `data-toggle-scouting-record-details="${escapeHtml(recordId)}"`
                    : recordId
                      ? `data-open-scouting-record="${escapeHtml(recordId)}"`
                      : "disabled";
            return `
              <button type="button" class="is-${escapeHtml(card.tone)}" ${actionAttribute}>
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.title)}</strong>
                <em>${escapeHtml(card.detail)}</em>
                <small>${escapeHtml(recordId ? card.action : "No action")}</small>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}
function getScoutingDatabaseActionQueue(records = [], state = ensureScoutingState(), limit = 8) {
  const seen = new Set();
  return records
    .slice(0, SCOUTING_ADVANCED_PANEL_RECORD_LIMIT)
    .map((record) => {
      const recordId = getScoutingRecordId(record);
      const gate = getScoutingDecisionGate(record, state);
      const intelligence = getScoutingIntelligenceProfile(record, state);
      const readiness = getScoutingPlayerDataReadiness(record, state);
      const target = findScoutingTargetByRecordId(recordId, state);
      const priority =
        gate.tone === "ready"
          ? 98
          : gate.tone === "market"
            ? 92
            : gate.tone === "evidence"
              ? 82
              : gate.tone === "watch"
                ? 76
                : gate.tone === "data"
                  ? 70
                  : 52;
      const action =
        gate.tone === "ready"
          ? "Create decision memo"
          : gate.tone === "market"
            ? "Complete market check"
            : gate.tone === "evidence"
              ? "Assign scout evidence"
              : gate.tone === "watch"
                ? "Verify weak KPI"
                : gate.tone === "data"
                  ? "Fix data identity"
                  : "Keep monitoring";
      const actionType =
        gate.tone === "ready"
          ? "report"
          : gate.tone === "market" || gate.tone === "evidence" || gate.tone === "watch" || gate.tone === "data"
            ? "quick"
            : "open";
      return {
        record,
        recordId,
        gate,
        intelligence,
        readiness,
        target,
        action,
        actionType,
        score: priority + (target ? 4 : 0) + Math.min(8, Math.max(0, (intelligence.roleFitScore || 0) - 74) / 2),
      };
    })
    .filter((item) => item.recordId && item.action !== "Keep monitoring")
    .filter((item) => {
      if (seen.has(item.recordId)) {
        return false;
      }
      seen.add(item.recordId);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
function renderScoutingDatabaseActionQueue(records = [], state = ensureScoutingState()) {
  const queue = getScoutingDatabaseActionQueue(records, state, 8);
  return `
    <section class="scouting-action-queue" data-scouting-action-queue>
      <div class="scouting-action-queue-head">
        <div>
          <span>Scout action queue</span>
          <strong>${escapeHtml(queue.length ? `${queue.length} next task${queue.length === 1 ? "" : "s"}` : "No urgent scout tasks")}</strong>
        </div>
        <p>${escapeHtml(queue.length ? "Prioritised from decision gate, data readiness and market blockers." : "Current view has no high-priority blockers.")}</p>
      </div>
      <div class="scouting-action-queue-list">
        ${
          queue.length
            ? queue
                .map((item) => {
                  const actionAttribute =
                    item.actionType === "report"
                      ? `data-create-scouting-profile-report="${escapeHtml(item.recordId)}"`
                      : item.actionType === "quick"
                        ? `data-toggle-scouting-record-details="${escapeHtml(item.recordId)}"`
                        : `data-open-scouting-record="${escapeHtml(item.recordId)}"`;
                  return `
                    <button type="button" class="is-${escapeHtml(item.gate.tone)}" ${actionAttribute}>
                      <span>${escapeHtml(item.action)}</span>
                      <strong>${escapeHtml(getScoutingRecordName(item.record))}</strong>
                      <em>${escapeHtml(`${item.gate.title} / ${item.intelligence.roleLabel} P${item.intelligence.roleFitScore || "n/a"}`)}</em>
                      <small>${escapeHtml(item.gate.blocker)}</small>
                    </button>
                  `;
                })
                .join("")
            : `<p class="scouting-muted">Try a narrower role, lower minutes, U23 or market-status filter to surface tasks.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingRecordQuickPanel(record, state = ensureScoutingState()) {
  const recordId = getScoutingRecordId(record);
  const intelligence = getScoutingIntelligenceProfile(record, state);
  const market = getScoutingMarketIntelligence(record, state);
  const target = findScoutingTargetByRecordId(recordId, state);
  const roleRows = getScoutingRoleMetricRows(record, getScoutingRadarTemplate(record))
    .filter((row) => Number.isFinite(row.percentile))
    .sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0))
    .slice(0, 3);
  const dueKnown = market.dueDiligence.filter((item) => item.status === "known").length;
  return `
    <section class="scouting-record-quick-panel">
      <article class="is-primary">
        <span>Intelligence read</span>
        <strong>${escapeHtml(intelligence.signal.headline)}</strong>
        <p>${escapeHtml(`${intelligence.confidence.label} ${intelligence.confidence.score}/99. ${intelligence.risk.detail}`)}</p>
      </article>
      ${renderScoutingDecisionGateCard(record, state)}
      <article>
        <span>Top role drivers</span>
        ${
          roleRows.length
            ? roleRows.map((row) => `<strong>${escapeHtml(`${row.label} P${row.percentile} / w${formatScoutingNumber(row.weight)}`)}</strong>`).join("")
            : `<p class="scouting-muted">No role metric drivers yet.</p>`
        }
      </article>
      <article>
        <span>Pipeline and due diligence</span>
        <strong>${escapeHtml(target ? `${target.status} / ${target.priority}` : "Not in pipeline")}</strong>
        <p>${escapeHtml(`${dueKnown}/${market.dueDiligence.length} due-diligence checks known. ${market.availability}`)}</p>
      </article>
      <article>
        <span>Role floor</span>
        <strong>${escapeHtml(`${intelligence.floor.label}${Number.isFinite(intelligence.floor.score) ? ` / P${intelligence.floor.score}` : ""}`)}</strong>
        <p>${escapeHtml("Lowest weighted role KPI. Use this to catch hidden weaknesses before shortlisting.")}</p>
      </article>
      <article>
        <span>Calibration</span>
        <strong>${escapeHtml(intelligence.calibration.label)}</strong>
        <p>${escapeHtml(`Raw P${intelligence.calibration.rawRoleFitScore || "n/a"} / calibrated ${Number.isFinite(intelligence.calibration.delta) ? `${intelligence.calibration.delta >= 0 ? "+" : ""}${intelligence.calibration.delta}` : "n/a"} / sample ${intelligence.calibration.localSampleAverage}`)}</p>
      </article>
      <article class="scouting-record-quick-actions">
        <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(recordId)}">Open full profile</button>
        <button type="button" class="scouting-primary-button" data-create-scouting-profile-report="${escapeHtml(recordId)}">Pipeline + report</button>
        <button type="button" class="scouting-secondary-button" data-toggle-scouting-record-compare="${escapeHtml(recordId)}">
          ${isScoutingRecordInCompareSet(recordId, state) ? "Remove compare" : "Add compare"}
        </button>
      </article>
    </section>
  `;
}
function renderScoutingProfileDossier(record, state, playerRows) {
  const recommendation = getScoutingProfileRecommendation(record, state);
  const seasonInsights = getScoutingSeasonInsights(record, playerRows);
  const readiness = getScoutingPlayerDataReadiness(record, state);
  const comparablePlayers = getScoutingComparablePlayers(record, 4);
  return `
    <section class="scouting-profile-dossier">
      <article class="scouting-action-card is-primary">
        <span>Recommended next action</span>
        <strong>${escapeHtml(recommendation.action)}</strong>
        <p>${escapeHtml(recommendation.question)}</p>
      </article>
      ${renderScoutingDecisionGateCard(record, state)}
      <article class="scouting-action-card">
        <span>Signal</span>
        <strong>${escapeHtml(recommendation.signal)}</strong>
        <p>${escapeHtml(recommendation.signalDetail || recommendation.status)}</p>
      </article>
      <article class="scouting-action-card">
        <span>Confidence</span>
        <strong>${escapeHtml(recommendation.confidence || seasonInsights.reliability)}</strong>
        <p>${escapeHtml(recommendation.confidenceDetail || seasonInsights.reliability)}</p>
      </article>
      <article class="scouting-action-card">
        <span>Risk</span>
        <strong>${escapeHtml(recommendation.risk)}</strong>
        <p>${escapeHtml(recommendation.riskDetail || "No major data red flag in current profile.")}</p>
      </article>
      <article class="scouting-action-card">
        <span>Season trajectory</span>
        <strong>${escapeHtml(seasonInsights.trendLabel)}</strong>
        <p>${escapeHtml(`Best: ${seasonInsights.bestSeason}. Seasons: ${seasonInsights.seasonCount}.`)}</p>
      </article>
      <article class="scouting-action-card">
        <span>Data readiness</span>
        <strong>${escapeHtml(`${readiness.label} / ${readiness.score}%`)}</strong>
        <p>${escapeHtml(readiness.weakest ? `Next data need: ${readiness.weakest.label}. ${readiness.weakest.detail}` : "No major data need.")}</p>
      </article>
      <article class="scouting-similar-profiles">
        <div>
          <span>Similar profiles</span>
          <strong>Comparison shortlist</strong>
        </div>
        <div class="scouting-similar-grid">
          ${
            comparablePlayers.length
              ? comparablePlayers
                  .map(
                    (item) => `
                      <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(item.record))}">
                        <strong>${escapeHtml(getScoutingRecordName(item.record))}</strong>
                        <span>${escapeHtml(getScoutingRecordTeam(item.record) || getScoutingRecordLeague(item.record))}</span>
                        <em>${escapeHtml(`Similarity ${item.similarity}%${Number.isFinite(item.fit) ? ` / P${item.fit}` : ""}`)}</em>
                      </button>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">Not enough comparable radar data yet.</p>`
          }
        </div>
      </article>
    </section>
  `;
}
function getScoutingMarketIntelligence(record, state = ensureScoutingState()) {
  const recordId = getScoutingRecordId(record);
  const roleFitScore = getScoutingRoleFitScore(record);
  const age = getScoutingRecordAge(record);
  const minutes = getScoutingRecordMinutes(record);
  const bestSignal = getScoutingBestSignal(record);
  const target = findScoutingTargetByRecordId(recordId, state);
  const saved = getScoutingMarketInfo(recordId, state);
  const hasSavedContractContext = Boolean(
    saved.contractStatus !== "unknown" ||
      saved.contractEnd ||
      saved.optionYears ||
      saved.agent ||
      saved.wageBand ||
      saved.transferStatus
  );
  const favorite = isScoutingRecordFavorited(recordId);
  const shadowRoles = scoutingShadowSlots.filter((slot) => getScoutingShadowSlotRecordIds(slot.id, state).includes(recordId));
  const positionGroup = getScoutingPositionGroup(record);
  const segment =
    Number.isFinite(roleFitScore) && roleFitScore >= 82 && Number.isFinite(age) && age <= 24
      ? "Strategic upside signing"
      : Number.isFinite(roleFitScore) && roleFitScore >= 82
        ? "Immediate impact target"
        : Number.isFinite(age) && age <= 23 && Number.isFinite(roleFitScore) && roleFitScore >= 70
          ? "Breakout watch"
          : Number.isFinite(roleFitScore) && roleFitScore >= 70 && minutes <= 1600
            ? "Value opportunity"
            : "Monitoring profile";
  const urgency =
    target?.priority === "urgent"
      ? "Urgent follow-up"
      : shadowRoles.length && Number.isFinite(roleFitScore) && roleFitScore >= 75
        ? "Live scout soon"
        : favorite || target
          ? "Keep active"
          : "Verify before pipeline";
  const availability = hasSavedContractContext
    ? `${getScoutingContractStatusLabel(saved.contractStatus)}${saved.contractEnd ? ` / Ends ${saved.contractEnd}` : ""}${saved.agent ? ` / Agent ${saved.agent}` : ""}`
    : target
      ? "Pipeline target - contract still unverified"
      : shadowRoles.length
        ? "Shadow XI target - verify agent/contract"
        : favorite
          ? "Favorite - needs contract check"
          : "Contract status unknown";
  const negotiationAngle =
    saved.transferStatus
      ? `Market note: ${saved.transferStatus}`
      : minutes <= 900
      ? "Potential minutes/opportunity angle: ask why playing time is limited."
      : Number.isFinite(age) && age <= 23
        ? "Development pathway angle: sell role growth, minutes and performance plan."
        : Number.isFinite(roleFitScore) && roleFitScore >= 82
          ? "Sporting impact angle: clarify fee/wage level early."
          : "Low-pressure monitoring angle: gather agent and contract context first.";
  const checks = [
    saved.contractEnd ? `Contract end: ${saved.contractEnd}` : "Contract end date, option years and release clauses",
    saved.optionYears ? `Option/release context: ${saved.optionYears}` : "Option years and release clauses",
    saved.agent || saved.wageBand
      ? `Agent/wage: ${[saved.agent ? `Agent ${saved.agent}` : "", saved.wageBand ? `Wage ${saved.wageBand}` : ""].filter(Boolean).join(" / ")}`
      : "Agent contact, current wage band and transfer expectations",
    saved.medicalLoad ? `Medical/load: ${saved.medicalLoad}` : "Medical availability, recent injuries and match load",
    saved.roleTranslation
      ? `Role translation: ${saved.roleTranslation}`
      : positionGroup === "GK"
        ? "Distribution and pressure profile on video"
        : "Role translation against stronger opposition",
  ];
  const dueDiligence = [
    {
      label: "Contract",
      status: saved.contractStatus !== "unknown" || saved.contractEnd ? "known" : "missing",
      detail: saved.contractEnd ? `Ends ${saved.contractEnd}` : "Contract end and club option unverified",
    },
    {
      label: "Agent",
      status: saved.agent ? "known" : "missing",
      detail: saved.agent || "Agent/agency not verified",
    },
    {
      label: "Wages",
      status: saved.wageBand || saved.salaryRange ? "known" : "missing",
      detail: saved.wageBand || saved.salaryRange || "Wage band not verified",
    },
    {
      label: "Injury/load",
      status: saved.medicalLoad ? "known" : "missing",
      detail: saved.medicalLoad || "Injury and match-load check required",
    },
    {
      label: "Role translation",
      status: saved.roleTranslation ? "known" : "missing",
      detail: saved.roleTranslation || "Needs video/live validation against our model",
    },
    {
      label: "Transfer heatmap",
      status: saved.transferStatus || saved.dealProbability ? "known" : "missing",
      detail: saved.transferStatus || saved.dealProbability || "Club stance and deal probability unknown",
    },
  ];
  return {
    segment,
    urgency,
    availability,
    negotiationAngle,
    checks,
    dueDiligence,
    saved,
    completeness: getScoutingMarketCompleteness(saved),
    bestSignal: bestSignal ? `${bestSignal.metric.label} P${bestSignal.percentile}` : "No standout signal",
  };
}
function getScoutingProfileReportDraft(record, state = ensureScoutingState()) {
  const playerRows = getScoutingRecordsForPlayer(record).slice(0, 10);
  const recommendation = getScoutingProfileRecommendation(record, state);
  const intelligence = getScoutingIntelligenceProfile(record, state);
  const readiness = getScoutingPlayerDataReadiness(record, state);
  const gate = getScoutingDecisionGate(record, state);
  const market = getScoutingMarketIntelligence(record, state);
  const savedMarket = market.saved;
  const seasonInsights = getScoutingSeasonInsights(record, playerRows);
  const roleFitScore = getScoutingRoleFitScore(record);
  const bestSignal = getScoutingBestSignal(record);
  const similarPlayers = getScoutingComparablePlayers(record, 3);
  const similarText = similarPlayers.length
    ? similarPlayers.map((item) => `${getScoutingRecordName(item.record)} (${item.similarity}% similar)`).join(", ")
    : "No strong comparable profile yet";
  return normalizeScoutingText(
    [
      `${getScoutingRecordName(record)} - ${getScoutingRecordPosition(record)} / ${getScoutingRecordTeam(record) || "No club"}.`,
      `Decision: ${recommendation.action}. Role fit ${Number.isFinite(roleFitScore) ? `P${roleFitScore}` : "n/a"} (${getScoutingRoleFitLabel(roleFitScore)}).`,
      `Decision gate: ${gate.title}. Next step: ${gate.nextStep}. Blocker: ${gate.blocker}.`,
      `Signal: ${intelligence.signal.headline}. ${intelligence.signal.detail}`,
      `Confidence: ${intelligence.confidence.label} ${intelligence.confidence.score}/99. ${intelligence.confidence.detail}`,
      `Risk: ${intelligence.risk.label}. ${intelligence.risk.detail}`,
      `Data needs: ${intelligence.risk.needs.length ? intelligence.risk.needs.join(", ") : "none for selected role spider"}.`,
      `Data readiness: ${readiness.label} ${readiness.score}%. Next data need: ${readiness.weakest?.label || "none"}.`,
      `Best data signal: ${bestSignal ? `${bestSignal.metric.label} P${bestSignal.percentile}` : "No standout signal"}.`,
      `Market lens: ${market.segment}. Availability: ${market.availability}. Urgency: ${market.urgency}.`,
      `Contract/agent detail: status ${getScoutingContractStatusLabel(savedMarket.contractStatus)}; end ${savedMarket.contractEnd || "unknown"}; option ${savedMarket.optionYears || "unknown"}; agent ${savedMarket.agent || "unknown"}; wage band ${savedMarket.wageBand || "unknown"}; fee ${savedMarket.estimatedFee || "unknown"}; salary ${savedMarket.salaryRange || "unknown"}; deal probability ${savedMarket.dealProbability || "unknown"}; budget impact ${savedMarket.budgetImpact || "unknown"}; transfer status ${savedMarket.transferStatus || "unknown"}.`,
      `Season trend: ${seasonInsights.trendLabel}. Sample: ${seasonInsights.reliability}. Best season: ${seasonInsights.bestSeason}.`,
      `Risk/read: ${recommendation.risk}`,
      `Negotiation angle: ${market.negotiationAngle}`,
      `Medical/load: ${savedMarket.medicalLoad || "not verified"}. Role translation: ${savedMarket.roleTranslation || "not verified"}.`,
      savedMarket.notes ? `Market notes: ${savedMarket.notes}` : "",
      `Comparable profiles: ${similarText}.`,
      `Due diligence: ${market.checks.join("; ")}.`,
    ].join(" "),
    1200
  );
}
function getScoutingContractStatusOptions() {
  return [
    { value: "unknown", label: "Unknown / unverified" },
    { value: "under-contract", label: "Under contract" },
    { value: "option", label: "Option year exists" },
    { value: "free-agent", label: "Free agent" },
    { value: "loan", label: "Loan situation" },
    { value: "contacted", label: "Agent contacted" },
  ];
}
function getScoutingContractStatusLabel(value) {
  const normalized = normalizeScoutingText(value, 40) || "unknown";
  return getScoutingContractStatusOptions().find((option) => option.value === normalized)?.label || "Unknown / unverified";
}
function normalizeScoutingMarketInfo(recordId, value = {}) {
  const id = normalizeScoutingText(recordId || value.recordId, 160);
  const status = normalizeScoutingText(value.contractStatus, 40) || "unknown";
  const allowedStatus = getScoutingContractStatusOptions().some((option) => option.value === status) ? status : "unknown";
  return {
    recordId: id,
    contractStatus: allowedStatus,
    contractEnd: normalizeScoutingText(value.contractEnd, 60),
    optionYears: normalizeScoutingText(value.optionYears, 120),
    agent: normalizeScoutingText(value.agent, 120),
    wageBand: normalizeScoutingText(value.wageBand, 120),
    estimatedFee: normalizeScoutingText(value.estimatedFee, 120),
    salaryRange: normalizeScoutingText(value.salaryRange, 120),
    dealProbability: normalizeScoutingText(value.dealProbability, 80),
    budgetImpact: normalizeScoutingText(value.budgetImpact, 180),
    transferStatus: normalizeScoutingText(value.transferStatus, 180),
    medicalLoad: normalizeScoutingText(value.medicalLoad, 220),
    roleTranslation: normalizeScoutingText(value.roleTranslation, 260),
    notes: normalizeScoutingText(value.notes, 500),
    updatedAt: normalizeScoutingText(value.updatedAt, 40),
  };
}
function getScoutingMarketInfo(recordId, state = ensureScoutingState()) {
  const id = normalizeScoutingText(recordId, 160);
  const records = state.marketIntel && typeof state.marketIntel === "object" ? state.marketIntel : {};
  return normalizeScoutingMarketInfo(id, records[id] || {});
}
function saveScoutingMarketInfo(recordId, patch = {}) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return;
  }
  const state = ensureScoutingState();
  state.marketIntel = {
    ...(state.marketIntel && typeof state.marketIntel === "object" ? state.marketIntel : {}),
    [id]: normalizeScoutingMarketInfo(id, {
      ...getScoutingMarketInfo(id, state),
      ...patch,
      updatedAt: new Date().toISOString(),
    }),
  };
  scoutingMarketIntelVersion += 1;
  writeScoutingState();
  renderScoutingWorkspace();
}
function getScoutingMarketCompleteness(info) {
  const fields = ["contractEnd", "optionYears", "agent", "wageBand", "estimatedFee", "salaryRange", "dealProbability", "budgetImpact", "transferStatus", "medicalLoad", "roleTranslation"];
  const completed = fields.filter((field) => normalizeScoutingText(info[field], 280)).length + (info.contractStatus !== "unknown" ? 1 : 0);
  return Math.round((completed / (fields.length + 1)) * 100);
}
function createScoutingReportForRecord(recordId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const record = getScoutingRecordById(recordId);
  if (!record) {
    return;
  }
  const normalizedRecordId = getScoutingRecordId(record);
  const now = new Date().toISOString();
  let target = findScoutingTargetByRecordId(normalizedRecordId, state);
  if (!target) {
    const matchingSlot = scoutingShadowSlots.find((slot) => {
      const tokens = getScoutingPositionTokens(record);
      return tokens.includes(slot.position) || tokens.includes(slot.label);
    });
    target = createScoutingTarget(record, {
      status: "monitoring",
      priority: (getScoutingRoleFitScore(record) || 0) >= 82 ? "high" : "normal",
      slotId: matchingSlot?.id || getSelectedScoutingShadowSlotId(state),
      notes: "Auto-created from scouting profile report draft.",
      createdAt: now,
      updatedAt: now,
    });
    state.targets = [target, ...getScoutingTargets(state)];
    touchScoutingIntelligenceCache();
  }
  const roleFit = getScoutingRoleFitScore(record);
  state.selectedRecordId = normalizedRecordId;
  state.profileTab = "reports";
  createScoutingReport({
    title: `${getScoutingRecordName(record)} recruitment report`,
    type: "player",
    targetId: target.id,
    summary: getScoutingProfileReportDraft(record, state),
    recommendation: Number.isFinite(roleFit) && roleFit >= 82 ? "sign" : Number.isFinite(roleFit) && roleFit >= 70 ? "shortlist" : "monitor",
    confidence: Number.isFinite(roleFit) && roleFit >= 82 ? 4 : 3,
    technical: Number.isFinite(roleFit) ? Math.max(2, Math.min(5, Math.round(roleFit / 20))) : 3,
    tactical: Number.isFinite(roleFit) ? Math.max(2, Math.min(5, Math.round(roleFit / 20))) : 3,
    physical: getScoutingRecordMinutes(record) >= 1800 ? 4 : 3,
    psychological: 3,
    scoutType: "Auto draft",
    createdAt: now,
  });
}
function renderScoutingMarketIntelligencePanel(record, state) {
  const market = getScoutingMarketIntelligence(record, state);
  const saved = market.saved;
  const recordId = getScoutingRecordId(record);
  const canEdit = canEditScoutingWorkspace();
  const contractStatusOptions = getScoutingContractStatusOptions()
    .map((option) => `<option value="${escapeHtml(option.value)}" ${saved.contractStatus === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  return `
    <section class="scouting-market-intelligence">
      <article class="is-primary">
        <span>Market segment</span>
        <strong>${escapeHtml(market.segment)}</strong>
        <p>${escapeHtml(market.negotiationAngle)}</p>
      </article>
      <article>
        <span>Contract status</span>
        <strong>${escapeHtml(market.availability)}</strong>
        <p>${escapeHtml(`Market file ${market.completeness}% complete. Do not treat contract data as verified until agent/club info is added.`)}</p>
      </article>
      <article>
        <span>Urgency</span>
        <strong>${escapeHtml(market.urgency)}</strong>
        <p>${escapeHtml(market.bestSignal)}</p>
      </article>
      <article class="scouting-due-diligence">
        <span>Due diligence</span>
        <div class="scouting-due-diligence-grid">
          ${market.dueDiligence
            .map(
              (item) => `
                <p class="is-${escapeHtml(item.status)}">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span>${escapeHtml(item.detail)}</span>
                </p>
              `
            )
            .join("")}
        </div>
      </article>
      <article class="scouting-market-editor">
        <div>
          <span>Market file</span>
          <strong>Contract and agent tracker</strong>
          <p>Save verified or provisional market notes here. Report drafts will include these fields.</p>
        </div>
        <form data-scouting-market-form="${escapeHtml(recordId)}">
          <label>
            <span>Contract status</span>
            <select name="contractStatus" ${canEdit ? "" : "disabled"}>${contractStatusOptions}</select>
          </label>
          <label>
            <span>Contract end</span>
            <input name="contractEnd" value="${escapeHtml(saved.contractEnd)}" placeholder="e.g. Dec 2026 / unknown" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Options / clauses</span>
            <input name="optionYears" value="${escapeHtml(saved.optionYears)}" placeholder="Club option, release clause..." ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Agent</span>
            <input name="agent" value="${escapeHtml(saved.agent)}" placeholder="Agent / agency / contact" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Wage band</span>
            <input name="wageBand" value="${escapeHtml(saved.wageBand)}" placeholder="Known/provisional wage band" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Estimated fee</span>
            <input name="estimatedFee" value="${escapeHtml(saved.estimatedFee)}" placeholder="Fee / free / trade / allocation" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Salary range</span>
            <input name="salaryRange" value="${escapeHtml(saved.salaryRange)}" placeholder="Expected salary range" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Deal probability</span>
            <input name="dealProbability" value="${escapeHtml(saved.dealProbability)}" placeholder="Low / medium / high / %" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Budget impact</span>
            <input name="budgetImpact" value="${escapeHtml(saved.budgetImpact)}" placeholder="Cap/budget impact" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Transfer status</span>
            <input name="transferStatus" value="${escapeHtml(saved.transferStatus)}" placeholder="Availability, fee, club stance..." ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Medical / load</span>
            <input name="medicalLoad" value="${escapeHtml(saved.medicalLoad)}" placeholder="Injury/load notes" ${canEdit ? "" : "disabled"} />
          </label>
          <label>
            <span>Role translation</span>
            <input name="roleTranslation" value="${escapeHtml(saved.roleTranslation)}" placeholder="How she translates to our model" ${canEdit ? "" : "disabled"} />
          </label>
          <label class="is-wide">
            <span>Market notes</span>
            <textarea name="notes" rows="3" placeholder="Context, calls, warnings, next steps" ${canEdit ? "" : "disabled"}>${escapeHtml(saved.notes)}</textarea>
          </label>
          <button type="submit" class="scouting-primary-button" ${canEdit ? "" : "disabled"}>Save market file</button>
        </form>
      </article>
      <article class="scouting-report-builder">
        <div>
          <span>Scout report builder</span>
          <strong>Generate recruitment memo</strong>
          <p>Creates a player report draft from role-fit, trend, market lens and due-diligence checklist.</p>
        </div>
        <button type="button" class="scouting-primary-button" data-create-scouting-profile-report="${escapeHtml(recordId)}">
          Add to pipeline + report draft
        </button>
      </article>
    </section>
  `;
}
function normalizeScoutingProfileTab(value) {
  const normalized = normalizeScoutingText(value, 40) || "overview";
  return scoutingProfileTabs.some((tab) => tab.value === normalized) ? normalized : "overview";
}
function setScoutingProfileTab(tabId) {
  const state = ensureScoutingState();
  const nextTab = normalizeScoutingProfileTab(tabId);
  state.profileTab = nextTab;
  writeScoutingState({ syncCentral: false });
  if (ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]")) {
    renderScoutingProfileModalIntoDom(state.selectedRecordId, { resetScroll: true });
  } else {
    renderScoutingWorkspace({ preserveFocus: true });
  }
  if (nextTab === "history" && state.selectedRecordId) {
    requestAnimationFrame(() => {
      hydrateScoutingProfileApiDetails(state.selectedRecordId);
    });
  }
  if (nextTab === "overview" && state.selectedRecordId) {
    queueFootballScienceDbProfileHydration(state.selectedRecordId);
  }
}
function setScoutingProfileRoleProfile(roleProfileId) {
  const state = ensureScoutingState();
  state.profileRoleProfileId = normalizeScoutingRoleProfileId(roleProfileId, "auto");
  writeScoutingState({ syncCentral: false });
  if (ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]")) {
    renderScoutingProfileModalIntoDom(state.selectedRecordId);
  } else {
    renderScoutingWorkspace({ preserveFocus: true });
  }
}
function setScoutingProfileSpiderSeason(value) {
  const state = ensureScoutingState();
  const rawValue = normalizeScoutingText(value, 120);
  if (rawValue === "average") {
    state.profileSpiderSeasonMode = "average";
    state.profileSpiderSeasonValue = "";
  } else if (rawValue.startsWith("season::")) {
    state.profileSpiderSeasonMode = "season";
    state.profileSpiderSeasonValue = normalizeScoutingText(rawValue.replace(/^season::/, ""), 80);
  } else {
    state.profileSpiderSeasonMode = "latest";
    state.profileSpiderSeasonValue = "";
  }
  writeScoutingState({ syncCentral: false });
  if (ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]")) {
    renderScoutingProfileModalIntoDom(state.selectedRecordId);
  } else {
    renderScoutingWorkspace({ preserveFocus: true });
  }
}

function renderScoutingFootballScienceDbPanel(record) {
  const fsdb = getScoutingRecordFootballScienceDbMeta(record);
  if (!fsdb) {
    return "";
  }
  const profileEntry = getFootballScienceDbProfileCacheEntry(record);
  if (profileEntry?.status === "ready" && profileEntry.profile) {
    return renderFootballScienceDbHydratedProfilePanel(record, profileEntry.profile);
  }
  const readiness = getScoutingRecordFootballScienceDbReadiness(record) || { label: "Identity only", spiderReady: false, statsReady: false };
  const spiderText = readiness.spiderReady
    ? "Spider can use trusted source metrics"
    : readiness.statsReady
      ? "Spider needs more metric depth"
      : "Spider stays locked until trusted stats exist";
  const missing = readiness.missing?.length ? readiness.missing.join(", ") : "none";
  const isLoading = profileEntry?.status === "loading";
  const error = normalizeScoutingText(profileEntry?.error, 240);
  return `
    <section class="scouting-profile-section scouting-fsdb-profile" data-scouting-profile-fsdb-panel>
      <div class="scouting-panel-head">
        <div>
          <p class="placeholder-tag">Source enrichment</p>
          <h3>${escapeHtml(isLoading ? "Loading source profile" : readiness.label)}</h3>
        </div>
        <span>${escapeHtml(fsdb.fsdbId || fsdb.id || "Identity pending")}</span>
      </div>
      <div class="scouting-profile-facts">
        <span><strong>${escapeHtml(String(fsdb.sourceLinkCount || 0))}</strong> source links</span>
        <span><strong>${escapeHtml(String(fsdb.rosterEntryCount || 0))}</strong> roster rows</span>
        <span><strong>${escapeHtml(String(fsdb.seasonStatCount || 0))}</strong> stat seasons</span>
        <span><strong>${escapeHtml(String(fsdb.metricCount || 0))}</strong> metrics</span>
      </div>
      <p>${escapeHtml(error || spiderText)}</p>
      <p class="scouting-muted">${escapeHtml(`Missing for full profile: ${missing}`)}</p>
      <button
        type="button"
        class="scouting-secondary-button"
        data-load-fsdb-profile="${escapeHtml(getScoutingRecordId(record))}"
        ${isLoading ? "disabled" : ""}
      >${escapeHtml(isLoading ? "Loading profile..." : error ? "Retry source profile" : "Load source profile")}</button>
    </section>
  `;
}

function renderScoutingProfileOverviewPanelShell(record) {
  return renderScoutingFootballScienceDbPanel(record);
}

function hydrateScoutingProfileOverviewPanel(recordId) {
  const normalizedId = normalizeScoutingText(recordId, 160);
  if (!normalizedId) {
    return;
  }
  const state = ensureScoutingState();
  if (state.selectedRecordId !== normalizedId || normalizeScoutingProfileTab(state.profileTab) !== "overview") {
    return;
  }
  if (scoutingProfileOverviewPanelHydrateInProgress.has(normalizedId)) {
    return;
  }
  const modal = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]");
  if (!modal) {
    return;
  }
  const record = getScoutingRecordById(normalizedId);
  if (!record) {
    return;
  }
  scoutingProfileOverviewPanelHydrateInProgress.add(normalizedId);
  const scheduleHydration = typeof window.requestIdleCallback === "function"
    ? (callback) => window.requestIdleCallback(callback, { timeout: 1200 })
    : (callback) => window.setTimeout(callback, 80);
  scheduleHydration(() => {
    try {
      const latestState = ensureScoutingState();
      if (latestState.selectedRecordId !== normalizedId || normalizeScoutingProfileTab(latestState.profileTab) !== "overview") {
        return;
      }
      const latestModal = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]");
      if (!latestModal) {
        return;
      }
      const profileRoleProfileId = normalizeScoutingRoleProfileId(latestState.profileRoleProfileId, "auto");
      const selectedProfileRoleId = profileRoleProfileId === "auto" ? "" : profileRoleProfileId;
      const roleFitScore = getScoutingRoleFitScore(record, selectedProfileRoleId);
      const intelligence = getScoutingIntelligenceProfile(record, latestState, selectedProfileRoleId);
      const shadowRoles = scoutingShadowSlots.filter((slot) => getScoutingShadowSlotRecordIds(slot.id, latestState).includes(normalizedId));
      const dossierNode = Array.from(latestModal.querySelectorAll("[data-scouting-profile-overview-shell]")).find((entry) => entry.dataset.scoutingProfileOverviewShell === normalizedId);
      if (dossierNode) {
        const profileRows = getScoutingRecordsForPlayer(record).slice(0, 10);
        dossierNode.outerHTML = renderScoutingProfileDossier(record, latestState, profileRows);
      }
      const decisionStrip = latestModal.querySelector("[data-scouting-profile-decision-strip]");
      if (decisionStrip) {
        const roleFit = decisionStrip.querySelector("[data-scouting-profile-role-fit]");
        const roleFitLabel = decisionStrip.querySelector("[data-scouting-profile-role-fit-label]");
        const roleFloor = decisionStrip.querySelector("[data-scouting-profile-role-floor]");
        const roleFloorLabel = decisionStrip.querySelector("[data-scouting-profile-role-floor-label]");
        const confidence = decisionStrip.querySelector("[data-scouting-profile-confidence]");
        const signalLabel = decisionStrip.querySelector("[data-scouting-profile-best-signal]");
        const roleStack = decisionStrip.querySelector("[data-scouting-profile-role-stack]");
        const roleStackLabel = decisionStrip.querySelector("[data-scouting-profile-role-stack-label]");
        if (roleFit) {
          roleFit.className = `is-${escapeHtml(getScoutingRoleFitTier(roleFitScore))}`;
          roleFit.textContent = Number.isFinite(roleFitScore) ? `P${escapeHtml(formatScoutingNumber(roleFitScore))}` : "n/a";
        }
        if (roleFitLabel) {
          roleFitLabel.textContent = escapeHtml([getScoutingRoleFitLabel(roleFitScore), intelligence?.roleLabel].filter(Boolean).join(" / "));
        }
        if (roleFloor) {
          roleFloor.textContent = Number.isFinite(intelligence?.floor?.score) ? `P${escapeHtml(formatScoutingNumber(intelligence.floor.score))}` : "n/a";
        }
        if (roleFloorLabel) {
          roleFloorLabel.textContent = escapeHtml(intelligence?.floor?.label || "No floor signal");
        }
        if (confidence) {
          confidence.textContent = escapeHtml(intelligence?.confidence?.label || "n/a");
        }
        if (signalLabel) {
          signalLabel.textContent = escapeHtml(intelligence?.signal?.headline || "No standout role signal yet");
        }
        if (roleStack) {
          roleStack.textContent = String(shadowRoles.length);
        }
        if (roleStackLabel) {
          roleStackLabel.textContent = escapeHtml(shadowRoles.length ? shadowRoles.map((slot) => slot.label).join(", ") : "Not in Shadow XI");
        }
      }
    } finally {
      scoutingProfileOverviewPanelHydrateInProgress.delete(normalizedId);
    }
  });
}

function renderScoutingProfileModalIntoDom(recordId, options = {}) {
  const state = ensureScoutingState();
  const normalizedId = normalizeScoutingText(recordId, 160) || normalizeScoutingText(state.selectedRecordId, 160);
  if (!normalizedId) {
    return false;
  }
  const workspace = ui.scoutingWorkspace;
  if (!workspace) {
    return false;
  }
  const focusSnapshot = getScoutingFocusSnapshot();
  const scrollSnapshot = options.resetScroll ? null : getScoutingScrollSnapshot();
  const disclosureSnapshot = getScoutingDisclosureSnapshot();
  state.selectedRecordId = normalizedId;
  const modalMarkup = renderScoutingProfileModal();
  if (!modalMarkup) {
    const existingBackdrop = workspace.querySelector(".scouting-profile-backdrop");
    if (existingBackdrop) {
      existingBackdrop.remove();
    }
    return false;
  }
  const parser = document.createElement("template");
  parser.innerHTML = modalMarkup;
  const nextBackdrop = parser.content.firstElementChild;
  if (!nextBackdrop) {
    return false;
  }
  const existingBackdrop = workspace.querySelector(".scouting-profile-backdrop");
  if (existingBackdrop) {
    existingBackdrop.replaceWith(nextBackdrop);
  } else {
    workspace.insertAdjacentHTML("beforeend", modalMarkup);
  }
  bindScoutingRecordMiniRadarShells();
  restoreScoutingDisclosureSnapshot(disclosureSnapshot);
  restoreScoutingFocus(focusSnapshot);
  if (options.resetScroll) {
    resetScoutingProfileModalScroll();
  } else {
    restoreScoutingScrollSnapshot(scrollSnapshot);
  }
  return true;
}
function resetScoutingProfileModalScroll() {
  const applyReset = () => {
    const backdrop = ui.scoutingWorkspace?.querySelector(".scouting-profile-backdrop");
    const modal = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]");
    if (backdrop) {
      backdrop.scrollTop = 0;
      backdrop.scrollLeft = 0;
    }
    if (modal) {
      modal.scrollTop = 0;
      modal.scrollLeft = 0;
    }
  };
  applyReset();
  requestAnimationFrame(() => {
    applyReset();
    requestAnimationFrame(applyReset);
  });
}

function renderScoutingProfileTabs(activeTab) {
  return `
    <nav class="scouting-profile-tabs" aria-label="Scouting profile sections">
      ${scoutingProfileTabs
        .map(
          (tab) => `
            <button type="button" class="${activeTab === tab.value ? "is-active" : ""}" data-scouting-profile-tab="${escapeHtml(tab.value)}">
              ${escapeHtml(tab.label)}
            </button>
          `
        )
        .join("")}
    </nav>
  `;
}
function getScoutingProfileNavigation(record) {
  const recordId = getScoutingRecordId(record);
  let cache = scoutingFilteredDatabaseNavigationCache;
  if (!cache.indexById.has(recordId) && scoutingFilteredDatabaseCache.key && scoutingFilteredDatabaseCache.records.length) {
    cache = hydrateScoutingFilteredDatabaseNavigationCache(
      scoutingFilteredDatabaseCache.records.slice(0, SCOUTING_DATABASE_PAGE_SIZE),
      `${scoutingFilteredDatabaseCache.key}:profile-visible`
    );
  }
  const index = cache.indexById.get(recordId);
  if (!Number.isFinite(index)) {
    return {
      index: -1,
      total: cache.ids.length,
      previous: null,
      next: null,
    };
  }
  return {
    index,
    total: cache.ids.length,
    previous: index > 0 ? getScoutingRecordById(cache.ids[index - 1]) : null,
    next: index >= 0 && index < cache.ids.length - 1 ? getScoutingRecordById(cache.ids[index + 1]) : null,
  };
}
function renderScoutingProfileNavigation(record) {
  const navigation = getScoutingProfileNavigation(record);
  if (navigation.index < 0 || navigation.total < 2) {
    return "";
  }
  const previousId = navigation.previous ? getScoutingRecordId(navigation.previous) : "";
  const nextId = navigation.next ? getScoutingRecordId(navigation.next) : "";
  return `
    <div class="scouting-profile-nav">
      <span>${escapeHtml(navigation.index + 1)} / ${escapeHtml(navigation.total)} in current view</span>
      <button type="button" ${previousId ? `data-open-scouting-record="${escapeHtml(previousId)}"` : "disabled"}>Previous</button>
      <button type="button" ${nextId ? `data-open-scouting-record="${escapeHtml(nextId)}"` : "disabled"}>Next</button>
      <button type="button" data-close-scouting-profile>Back to database</button>
    </div>
  `;
}
function renderScoutingProfileReportsTab(record, state) {
  const recordId = getScoutingRecordId(record);
  const target = findScoutingTargetByRecordId(recordId, state);
  const reports = getScoutingReports(state).filter((report) => report.targetId && target?.id === report.targetId);
  const canEdit = canEditScoutingWorkspace();
  return `
    <section class="scouting-profile-reports">
      <article class="scouting-report-builder is-profile-report-builder">
        <div>
          <span>Scout report builder</span>
          <strong>${escapeHtml(target ? "Update recruitment memo" : "Create first recruitment memo")}</strong>
          <p>${escapeHtml(target ? "Uses pipeline status, market file, role-fit and season trend." : "Creates a pipeline target first, then saves the recruitment memo.")}</p>
        </div>
        <button type="button" class="scouting-primary-button" data-create-scouting-profile-report="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>
          Create report draft
        </button>
        <button type="button" class="scouting-secondary-button" data-print-scouting-profile-report="${escapeHtml(recordId)}">
          Print profile memo
        </button>
      </article>
      <article class="scouting-profile-report-list">
        <div>
          <span>Saved player reports</span>
          <strong>${reports.length} report${reports.length === 1 ? "" : "s"}</strong>
        </div>
        <div class="scouting-target-board-list">
          ${
            reports.length
              ? reports
                  .map(
                    (report) => `
                      <article class="scouting-target-card">
                        <div class="scouting-target-main">
                          <strong>${escapeHtml(report.title || "Recruitment report")}</strong>
                          <span>${escapeHtml(new Date(report.createdAt).toLocaleDateString("en-US"))}</span>
                        </div>
                        <div class="scouting-report-scoreline">
                          <span>${escapeHtml(report.recommendation || "monitor")}</span>
                          <span>Confidence ${escapeHtml(report.confidence || 3)}/5</span>
                          <span>Tec ${escapeHtml(report.technical || 3)}</span>
                          <span>Tac ${escapeHtml(report.tactical || 3)}</span>
                          <span>Phy ${escapeHtml(report.physical || 3)}</span>
                          <span>Psy ${escapeHtml(report.psychological || 3)}</span>
                        </div>
                        <p class="scouting-fit-line">${escapeHtml(report.summary || "No summary")}</p>
                        ${canEdit ? `<button type="button" class="scouting-secondary-button" data-delete-scouting-report="${escapeHtml(report.id)}">Delete report</button>` : ""}
                      </article>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">No saved reports for this player yet.</p>`
          }
        </div>
      </article>
    </section>
  `;
}
function getScoutingTimelineForRecord(record, state = ensureScoutingState()) {
  const recordId = getScoutingRecordId(record);
  const target = findScoutingTargetByRecordId(recordId, state);
  const market = getScoutingMarketInfo(recordId, state);
  const shadowRoles = scoutingShadowSlots.filter((slot) => getScoutingShadowSlotRecordIds(slot.id, state).includes(recordId));
  const items = [];
  if (target) {
    items.push({
      date: target.updatedAt || target.createdAt,
      label: "Pipeline",
      title: getScoutingStatusOptions().find((option) => option.value === target.status)?.label || "Pipeline updated",
      detail: [target.priority, target.owner ? `Owner ${target.owner}` : "", target.nextAction ? `Next: ${target.nextAction}` : ""].filter(Boolean).join(" / "),
    });
  }
  if (isScoutingRecordFavorited(recordId)) {
    items.push({
      date: target?.createdAt || new Date().toISOString(),
      label: "Favorite",
      title: "Marked as favorite",
      detail: "Player is on the live watchlist.",
    });
  }
  shadowRoles.forEach((slot) => {
    const meta = getScoutingShadowRecordMeta(slot.id, recordId, state);
    items.push({
      date: meta.updatedAt || target?.updatedAt || new Date().toISOString(),
      label: "Shadow XI",
      title: `Added to ${slot.label}`,
      detail: getScoutingShadowTagOptions().find((option) => option.value === meta.tag)?.label || "Monitor",
    });
  });
  if (market.updatedAt) {
    items.push({
      date: market.updatedAt,
      label: "Market",
      title: getScoutingContractStatusLabel(market.contractStatus),
      detail: [market.agent ? `Agent ${market.agent}` : "", market.estimatedFee ? `Fee ${market.estimatedFee}` : "", market.dealProbability ? `Deal ${market.dealProbability}` : ""].filter(Boolean).join(" / ") || "Market file updated.",
    });
  }
  getScoutingContactLogForRecord(recordId, state).forEach((entry) => {
    items.push({
      date: entry.date || entry.createdAt,
      label: getScoutingContactTypeOptions().find((option) => option.value === entry.type)?.label || "Contact",
      title: entry.contact || entry.outcome || "Contact logged",
      detail: [entry.outcome, entry.nextStep ? `Next: ${entry.nextStep}` : "", entry.notes].filter(Boolean).join(" / "),
    });
  });
  if (target) {
    getScoutingReportsForTarget(target.id, state).forEach((report) => {
      items.push({
        date: report.createdAt,
        label: "Report",
        title: report.title || "Report created",
        detail: `${report.recommendation || "monitor"} / confidence ${report.confidence || 3}/5`,
      });
    });
  }
  return items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
function renderScoutingTimeline(record, state = ensureScoutingState()) {
  const items = getScoutingTimelineForRecord(record, state);
  return `
    <section class="scouting-profile-timeline">
      <div>
        <span>Case timeline</span>
        <strong>${items.length ? `${items.length} events` : "No case events yet"}</strong>
      </div>
      <div class="scouting-timeline-list">
        ${
          items.length
            ? items
                .map(
                  (item) => `
                    <article>
                      <span>${escapeHtml(item.label)} / ${escapeHtml(String(item.date || "").slice(0, 10) || "No date")}</span>
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.detail || "No detail")}</p>
                    </article>
                  `
                )
                .join("")
            : `<p class="scouting-muted">Add this player to pipeline, Shadow XI, market file or contact log to start a timeline.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingContactsTab(record, state = ensureScoutingState()) {
  const recordId = getScoutingRecordId(record);
  const contacts = getScoutingContactLogForRecord(recordId, state);
  const canEdit = canEditScoutingWorkspace();
  return `
    <section class="scouting-contact-log">
      <article class="scouting-contact-form-card">
        <div>
          <span>Contact log</span>
          <strong>Agent, club and internal notes</strong>
          <p>Log every call, video scout, live scout or internal decision touchpoint.</p>
        </div>
        ${
          canEdit
            ? `
              <form data-scouting-contact-form="${escapeHtml(recordId)}">
                <input type="date" name="date" value="${escapeHtml(new Date().toISOString().slice(0, 10))}" />
                <select name="type">
                  ${getScoutingContactTypeOptions().map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
                </select>
                <input name="contact" placeholder="Contact person / scout" />
                <input name="outcome" placeholder="Outcome" />
                <input name="nextStep" placeholder="Next step" />
                <textarea name="notes" rows="3" placeholder="Notes"></textarea>
                <button type="submit" class="scouting-primary-button">Save contact</button>
              </form>
            `
            : `<p class="scouting-muted">Contact log is locked.</p>`
        }
      </article>
      <article class="scouting-contact-list-card">
        <div>
          <span>Logged contacts</span>
          <strong>${contacts.length} entries</strong>
        </div>
        <div class="scouting-contact-list">
          ${
            contacts.length
              ? contacts
                  .map(
                    (entry) => `
                      <article>
                        <div>
                          <span>${escapeHtml(entry.date)} / ${escapeHtml(getScoutingContactTypeOptions().find((option) => option.value === entry.type)?.label || "Contact")}</span>
                          <strong>${escapeHtml(entry.contact || entry.outcome || "Contact")}</strong>
                          <p>${escapeHtml([entry.outcome, entry.nextStep ? `Next: ${entry.nextStep}` : "", entry.notes].filter(Boolean).join(" / ") || "No notes")}</p>
                        </div>
                        ${
                          canEdit
                            ? `<button type="button" class="scouting-contact-delete-button" data-delete-scouting-contact="${escapeHtml(entry.id)}" aria-label="Remove contact entry">
                                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                                  <path d="M9 4h6l1 2h4v2H4V6h4l1-2Z"></path>
                                  <path d="M7 10h2l.4 9h5.2l.4-9h2l-.5 10.4A1.8 1.8 0 0 1 14.7 22H9.3a1.8 1.8 0 0 1-1.8-1.6L7 10Z"></path>
                                  <path d="M10.4 11h1.5v8h-1.5v-8Zm3.7 0h1.5v8h-1.5v-8Z"></path>
                                </svg>
                              </button>`
                            : ""
                        }
                      </article>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">No contacts logged for this player yet.</p>`
          }
        </div>
      </article>
      ${renderScoutingTimeline(record, state)}
    </section>
  `;
}
function printScoutingProfileReport(recordId) {
  const record = getScoutingRecordById(recordId);
  if (!record) {
    return;
  }
  const state = ensureScoutingState();
  const reportText = getScoutingProfileReportDraft(record, state);
  const title = `${getScoutingRecordName(record)} scouting memo`;
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=920,height=720");
  if (!printWindow) {
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body{font-family:Georgia,serif;margin:42px;color:#172018;line-height:1.55}
          h1{font-size:30px;margin:0 0 8px}
          .meta{color:#5f665f;margin-bottom:24px}
          .box{border:1px solid #d9dfd8;border-radius:14px;padding:18px;margin:16px 0}
          @media print{button{display:none}}
        </style>
      </head>
      <body>
        <button onclick="window.print()">Print</button>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml([getScoutingRecordPosition(record), getScoutingRecordTeam(record), getScoutingRecordLeague(record), getScoutingRecordSeason(record)].filter(Boolean).join(" / "))}</p>
        <div class="box">${escapeHtml(reportText)}</div>
      </body>
    </html>
  `);
  printWindow.document.close();
}
function getScoutingLikelySlotsForRecord(record, state = ensureScoutingState()) {
  const recordId = getScoutingRecordId(record);
  const target = findScoutingTargetByRecordId(recordId, state);
  const tokens = getScoutingPositionTokens(record);
  const slots = [];
  const pushSlot = (slot) => {
    if (slot && !slots.some((entry) => entry.id === slot.id)) {
      slots.push(slot);
    }
  };
  pushSlot(getScoutingSlotById(target?.slotId));
  scoutingShadowSlots.forEach((slot) => {
    if (getScoutingShadowSlotRecordIds(slot.id, state).includes(recordId)) {
      pushSlot(slot);
    }
  });
  scoutingShadowSlots.forEach((slot) => {
    if (tokens.includes(slot.position) || tokens.includes(slot.label)) {
      pushSlot(slot);
    }
  });
  return slots.slice(0, 3);
}
function getScoutingSquadFitRows(record, state = ensureScoutingState()) {
  const recordId = getScoutingRecordId(record);
  const candidateFit = getScoutingRoleFitScore(record);
  return getScoutingLikelySlotsForRecord(record, state).map((slot) => {
    const slotRecords = getScoutingShadowSlotRecords(slot.id, state);
    const incumbents = slotRecords.filter((item) => getScoutingRecordId(item) !== recordId);
    const incumbent = incumbents[0] || null;
    const incumbentFit = incumbent ? getScoutingRoleFitScore(incumbent) : null;
    const coverage = getScoutingShadowCoverageScore(slot.id, state);
    const delta = Number.isFinite(candidateFit) && Number.isFinite(incumbentFit) ? candidateFit - incumbentFit : null;
    const verdict = !incumbent
      ? "Fills open role"
      : Number.isFinite(delta) && delta >= 8
        ? "Potential upgrade"
        : Number.isFinite(delta) && delta >= -4
          ? "Direct competition"
          : "Depth option";
    const minutes = getScoutingRecordMinutes(record);
    const minutesRole = !incumbent
      ? "Immediate pathway"
      : slotRecords.length <= 1
        ? "Rotation minutes"
        : minutes >= 1800
          ? "Needs clear role promise"
          : "Development/depth minutes";
    return { slot, incumbent, incumbentFit, candidateFit, coverage, delta, verdict, minutesRole, depth: slotRecords.length };
  });
}
function getScoutingInternalSquadPlayers() {
  const rawCandidates = [];
  try {
    const raw = window.localStorage?.getItem("football-player-profiles-v1");
    if (raw) {
      rawCandidates.push(JSON.parse(raw));
    }
  } catch {}
  const found = [];
  const visit = (value, depth = 0) => {
    if (!value || depth > 5) {
      return;
    }
    if (Array.isArray(value)) {
      const objectRows = value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
      const playerLike = objectRows.filter((item) => {
        const name = item.name || item.player || item.playerName || item.fullName || item.displayName;
        const position = item.position || item.primaryPosition || item.role || item.positions;
        return name && position;
      });
      if (playerLike.length >= Math.max(1, Math.floor(objectRows.length * 0.35))) {
        found.push(...playerLike);
      }
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      Object.values(value).forEach((item) => visit(item, depth + 1));
    }
  };
  rawCandidates.forEach((candidate) => visit(candidate));
  const seen = new Set();
  return found
    .filter(scoutingPlayerCountsInSquad)
    .map((player, index) => {
      const name = normalizeScoutingText(player.name || player.player || player.playerName || player.fullName || player.displayName, 160);
      const position = normalizeScoutingText(player.position || player.primaryPosition || player.role || player.positions, 80);
      const bestRole = normalizeScoutingText(
        player.bestRole || player.best_role || player.roleModel || player.tacticalRole || player.scoutingRole || player.primaryRole || position,
        120
      );
      const ratingValue = Number(player.rating ?? player.overall ?? player.score ?? player.currentAbility ?? player.performanceScore);
      const ageValue = Number(player.age);
      const id = normalizeScoutingText(player.id || player.playerId || `${name}-${position}-${index}`, 160);
      return {
        id,
        name,
        position,
        bestRole,
        team: normalizeScoutingText(player.team || player.club || player.squad || "Current squad", 120),
        age: Number.isFinite(ageValue) ? ageValue : null,
        rating: Number.isFinite(ratingValue) ? Math.max(1, Math.min(99, ratingValue <= 5 ? ratingValue * 20 : ratingValue)) : null,
        status: normalizeScoutingText(player.status || player.availability || player.squadStatus, 80),
        rosterType: normalizeScoutingSquadRosterType(player.rosterType || player.roster_type || player.playerType || player.player_type || player.squadType || player.squad_type),
      };
    })
    .filter((player) => {
      const key = `${player.name.toLowerCase()}|${player.position.toLowerCase()}`;
      if (!player.name || !player.position || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}
function getScoutingRealSquadFitRows(record) {
  const targetTokens = new Set(getScoutingPositionTokens(record));
  const targetGroup = getScoutingPositionGroup(record);
  const targetFit = getScoutingRoleFitScore(record);
  return getScoutingInternalSquadPlayers()
    .map((player) => {
      const playerTokens = new Set(getScoutingPositionTokens(player.position));
      const sameToken = [...targetTokens].some((token) => playerTokens.has(token));
      const sameGroup = getScoutingPositionGroup(player.position) === targetGroup;
      if (!sameToken && !sameGroup) {
        return null;
      }
      const proxyRating = Number.isFinite(player.rating) ? player.rating : sameToken ? 64 : 58;
      const delta = Number.isFinite(targetFit) ? targetFit - proxyRating : null;
      const verdict =
        Number.isFinite(delta) && delta >= 10
          ? "Clear upgrade signal"
          : Number.isFinite(delta) && delta >= 2
            ? "Competitive upgrade"
            : Number.isFinite(delta) && delta >= -6
              ? "Depth/competition"
              : "Needs stronger case";
      return {
        player,
        score: sameToken ? 2 : 1,
        proxyRating,
        delta,
        verdict,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.proxyRating || 0) - (a.proxyRating || 0))
    .slice(0, 5);
}
function renderScoutingSquadFitPanel(record, state = ensureScoutingState()) {
  const rows = getScoutingSquadFitRows(record, state);
  const realRows = getScoutingRealSquadFitRows(record);
  const recordId = getScoutingRecordId(record);
  return `
    <section class="scouting-squad-fit-panel">
      <article class="scouting-squad-fit-lead">
        <span>Squad fit</span>
        <strong>${escapeHtml(realRows[0]?.verdict || rows[0]?.verdict || "Role not mapped yet")}</strong>
        <p>${escapeHtml(realRows.length ? "Compared against current player-profile squad data first, with Shadow XI depth as planning context." : rows.length ? "No player-profile squad match found yet, using Shadow XI depth as the squad-planning proxy." : "Add player to Shadow XI or pipeline slot to evaluate squad fit.")}</p>
      </article>
      <div class="scouting-squad-fit-grid">
        ${
          realRows.length
            ? realRows
                .map(
                  (row) => `
                    <article>
                      <div>
                        <span>Current squad / ${escapeHtml(row.player.position)}</span>
                        <strong>${escapeHtml(row.verdict)}</strong>
                      </div>
                      <p>${escapeHtml(`${row.player.name} (${row.player.team})${row.player.status ? ` / ${row.player.status}` : ""}`)}</p>
                      <div class="scouting-squad-fit-metrics">
                        <span>Target ${Number.isFinite(getScoutingRoleFitScore(record)) ? `P${getScoutingRoleFitScore(record)}` : "n/a"}</span>
                        <span>Squad proxy ${Number.isFinite(row.proxyRating) ? Math.round(row.proxyRating) : "n/a"}</span>
                        <span>Delta ${Number.isFinite(row.delta) ? `${row.delta > 0 ? "+" : ""}${Math.round(row.delta)}` : "n/a"}</span>
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<p class="scouting-muted">No matching current-squad players found in Player Profiles local data.</p>`
        }
      </div>
      <div class="scouting-squad-fit-grid">
        ${
          rows.length
            ? rows
                .map(
                  (row) => `
                    <article>
                      <div>
                        <span>${escapeHtml(row.slot.label)} / ${escapeHtml(row.slot.position)}</span>
                        <strong>${escapeHtml(row.verdict)}</strong>
                      </div>
                      <p>${escapeHtml(row.incumbent ? `Compared with ${getScoutingRecordName(row.incumbent)} (${Number.isFinite(row.incumbentFit) ? `P${row.incumbentFit}` : "no score"})` : "No incumbent in this Shadow XI role.")}</p>
                      <div class="scouting-squad-fit-metrics">
                        <span>Target ${Number.isFinite(row.candidateFit) ? `P${row.candidateFit}` : "n/a"}</span>
                        <span>Delta ${Number.isFinite(row.delta) ? `${row.delta > 0 ? "+" : ""}${row.delta}` : "n/a"}</span>
                        <span>Coverage ${row.coverage}</span>
                        <span>${escapeHtml(row.minutesRole)}</span>
                      </div>
                      <button type="button" class="scouting-secondary-button" data-add-scouting-record-to-shadow="${escapeHtml(recordId)}" data-scouting-shadow-slot-id="${escapeHtml(row.slot.id)}">
                        Add to ${escapeHtml(row.slot.label)}
                      </button>
                    </article>
                  `
                )
                .join("")
            : `<p class="scouting-muted">No matching Shadow XI role found for this profile yet.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingProfileHistoryTab(record, playerRows) {
  const goalMetricId = getScoutingMetricIdByLabels(["Goals"]);
  const xgMetricId = getScoutingMetricIdByLabels(["xG"]);
  const assistMetricId = getScoutingMetricIdByLabels(["Assists"]);
  return `
    <section class="scouting-season-table scouting-profile-history-table">
      <h3>Season snapshots</h3>
      <div>
        <table>
          <thead>
            <tr>
              <th>Season</th>
              <th>Team</th>
              <th>League</th>
              <th>Position</th>
              <th>Min</th>
              <th>Role fit</th>
              <th>G</th>
              <th>xG</th>
              <th>A</th>
            </tr>
          </thead>
          <tbody>
            ${playerRows
              .map(
                (row) => `
                  <tr>
                    <td>${escapeHtml(getScoutingRecordSeason(row))}</td>
                    <td>${escapeHtml(getScoutingRecordTeam(row))}</td>
                    <td>${escapeHtml(getScoutingRecordLeague(row))}</td>
                    <td>${escapeHtml(getScoutingRecordPosition(row))}</td>
                    <td>${escapeHtml(formatScoutingNumber(getScoutingRecordMinutes(row)))}</td>
                    <td>${escapeHtml(formatScoutingNumber(getScoutingRoleFitScore(row), "-"))}</td>
                    <td>${escapeHtml(formatScoutingNumber(getScoutingMetricValue(row, goalMetricId), "-"))}</td>
                    <td>${escapeHtml(formatScoutingNumber(getScoutingMetricValue(row, xgMetricId), "-"))}</td>
                    <td>${escapeHtml(formatScoutingNumber(getScoutingMetricValue(row, assistMetricId), "-"))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
function renderScoutingProfileRoleSpiderGrid(record, selectedProfileRoleId, profileRoleProfileId, radarTemplate, profileMetrics, spiderContext = {}) {
  const trend = spiderContext.trend || { label: "No trend yet", detail: "Needs more seasons", direction: "flat" };
  return `
    <div class="scouting-profile-grid scouting-profile-role-spider-grid">
      <section class="scouting-profile-radar">
        <div class="scouting-profile-role-controls">
          <label class="scouting-profile-role-selector">
            <span>View as player type</span>
            <select data-scouting-profile-role-template>
              ${renderScoutingRoleProfileOptions(profileRoleProfileId, { auto: true })}
            </select>
          </label>
          <label class="scouting-profile-role-selector scouting-profile-season-selector">
            <span>Spider data</span>
            <select data-scouting-profile-spider-season>
              ${getScoutingProfileSpiderSeasonOptions(spiderContext.rows || [record], spiderContext)}
            </select>
          </label>
        </div>
        ${renderScoutingRadar(record, selectedProfileRoleId, radarTemplate, profileMetrics)}
      </section>
      <section class="scouting-profile-metrics">
        ${renderScoutingRoleSpiderSummary(record, radarTemplate, profileMetrics)}
        <div class="scouting-profile-spider-context is-${escapeHtml(trend.direction || "flat")}">
          <span>${escapeHtml(spiderContext.sampleLabel || "Latest season")}</span>
          <strong>${escapeHtml(trend.label)}</strong>
          <em>${escapeHtml(trend.detail)}</em>
        </div>
        <h3>Role spider metrics</h3>
        <div class="scouting-metric-stack">
          ${
            profileMetrics.length
              ? profileMetrics
                  .map(
                    (item) => `
                      <div>
                        <span>${escapeHtml(item.label)}</span>
                        <strong>P${escapeHtml(item.percentile ?? "n/a")}</strong>
                        <em>${escapeHtml(`${item.metric.label}: ${formatScoutingNumber(item.value)} / weight ${formatScoutingNumber(item.weight)} / ${item.quality}${item.direction === "lower" ? " / low value is positive" : ""}`)}</em>
                      </div>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">No data. Needs role metrics.</p>`
          }
        </div>
      </section>
    </div>
  `;
}
function renderScoutingComparisonRadarOverlay(playerRecords, metricItems = []) {
  const records = playerRecords.map(({ record }) => record).filter(Boolean).slice(0, 4);
  if (records.length < 2) {
    return "";
  }
  const selectedTemplate = Array.isArray(metricItems)
    ? metricItems
        .map((metric) => ({
          metricId: metric?.id,
          label: metric?.label || metric?.id || "Metric",
        }))
        .filter((item) => item.metricId)
    : [];
  const template = selectedTemplate.length ? selectedTemplate : getScoutingRadarTemplate(records[0]);
  if (!template.length) {
    return "";
  }
  const colors = ["#2e6d4a", "#c47a2c", "#2f5f8f", "#8a4f9f"];
  const center = 118;
  const radius = 76;
  const angleOffset = -Math.PI / 2;
  const axes = template.map((item, index) => {
    const angle = angleOffset + (index / template.length) * Math.PI * 2;
    return {
      label: item.label,
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
      labelX: center + Math.cos(angle) * (radius + 28),
      labelY: center + Math.sin(angle) * (radius + 28),
    };
  });
  const shapes = records.map((record, recordIndex) => {
    const points = template.map((item, index) => {
      const percentile = getScoutingPercentile(record, item.metricId) || 1;
      const angle = angleOffset + (index / template.length) * Math.PI * 2;
      const valueRadius = radius * (percentile / 100);
      return `${(center + Math.cos(angle) * valueRadius).toFixed(1)},${(center + Math.sin(angle) * valueRadius).toFixed(1)}`;
    });
    return {
      record,
      color: colors[recordIndex % colors.length],
      points: points.join(" "),
    };
  });
  return `
    <section class="scouting-comparison-radar">
      <div>
        <span>Radar overlay</span>
        <strong>${records.length} players · ${escapeHtml(template.length)} selected metrics</strong>
      </div>
      <svg viewBox="0 0 236 236" role="img" aria-label="Comparison radar overlay">
        <circle class="scouting-radar-ring" cx="${center}" cy="${center}" r="${radius}" />
        <circle class="scouting-radar-ring" cx="${center}" cy="${center}" r="${radius * 0.66}" />
        <circle class="scouting-radar-ring" cx="${center}" cy="${center}" r="${radius * 0.33}" />
        ${axes.map((axis) => `<line class="scouting-radar-axis" x1="${center}" y1="${center}" x2="${axis.axisX.toFixed(1)}" y2="${axis.axisY.toFixed(1)}" />`).join("")}
        ${shapes.map((shape) => `<polygon class="scouting-comparison-radar-shape" points="${shape.points}" style="--radar-color:${shape.color};" />`).join("")}
        ${axes.map((axis) => `<text class="scouting-radar-label" x="${axis.labelX.toFixed(1)}" y="${axis.labelY.toFixed(1)}">${escapeHtml(axis.label)}</text>`).join("")}
      </svg>
      <div class="scouting-comparison-radar-legend">
        ${shapes
          .map(
            (shape) => `
              <span style="--radar-color:${shape.color};">
                ${escapeHtml(getScoutingRecordName(shape.record))}
              </span>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
function getScoutingReportsForTarget(targetId, state = ensureScoutingState()) {
  const id = normalizeScoutingText(targetId, 120);
  return getScoutingReports(state).filter((report) => normalizeScoutingText(report.targetId, 120) === id);
}
function getScoutingRecruitmentAlerts(state = ensureScoutingState(), limit = 10) {
  const alerts = [];
  const targetedIds = new Set(getScoutingTargetedRecordIds(state));
  const shadowIds = new Set(getScoutingAllShadowRecordIds(state));
  scoutingShadowSlots
    .filter((slot) => !getScoutingShadowSlotRecordIds(slot.id, state).length)
    .slice(0, 5)
    .forEach((slot) => {
      alerts.push({
        tone: "risk",
        label: "Open role",
        title: `${slot.label} has no candidates`,
        detail: `Start a ${slot.position} wishlist from the database.`,
        slotId: slot.id,
      });
    });
  getScoutingTargets(state).forEach((target) => {
    const record = getScoutingTargetRecord(target);
    const reports = getScoutingReportsForTarget(target.id, state);
    const status = normalizeScoutingText(target.status, 40);
    const priority = normalizeScoutingText(target.priority, 40);
    const recordId = record ? getScoutingRecordId(record) : getScoutingTargetRecordId(target);
    const todayValue = new Date().toISOString().slice(0, 10);
    if (!target.owner && ["shortlist", "contacted", "negotiation"].includes(status)) {
      alerts.push({
        tone: "warning",
        label: "No owner",
        title: `${target.name || "Target"} has no scout owner`,
        detail: "Assign owner before advancing the case.",
        recordId,
      });
    }
    if (!target.nextAction && ["monitoring", "shortlist", "contacted", "negotiation"].includes(status)) {
      alerts.push({
        tone: "warning",
        label: "No next action",
        title: `${target.name || "Target"} needs next action`,
        detail: "Add call, video scout, live scout or decision meeting.",
        recordId,
      });
    }
    if (target.nextActionDate && target.nextActionDate < todayValue && !["signed", "rejected", "archived"].includes(status)) {
      alerts.push({
        tone: "urgent",
        label: "Overdue",
        title: `${target.name || "Target"} action is overdue`,
        detail: `Next action date was ${target.nextActionDate}.`,
        recordId,
      });
    }
    if (target.decisionDeadline && target.decisionDeadline < todayValue && !["signed", "rejected", "archived"].includes(status)) {
      alerts.push({
        tone: "urgent",
        label: "Deadline missed",
        title: `${target.name || "Target"} missed decision deadline`,
        detail: `Decision deadline was ${target.decisionDeadline}.`,
        recordId,
      });
    }
    if (["shortlist", "contacted", "negotiation"].includes(status) && !reports.length) {
      alerts.push({
        tone: "warning",
        label: "Missing report",
        title: `${target.name || "Target"} needs a memo`,
        detail: `${status} player without saved scout report.`,
        recordId,
      });
    }
    if (["contacted", "negotiation"].includes(status) && record) {
      const completeness = getScoutingMarketCompleteness(getScoutingMarketInfo(recordId, state));
      if (completeness < 55) {
        alerts.push({
          tone: "warning",
          label: "Market gap",
          title: `${target.name || getScoutingRecordName(record)} market file incomplete`,
          detail: `Contract/agent tracker is ${completeness}% complete.`,
          recordId,
        });
      }
    }
    if (priority === "urgent" && !["negotiation", "signed", "rejected", "archived"].includes(status)) {
      alerts.push({
        tone: "urgent",
        label: "Urgent next step",
        title: `${target.name || "Urgent target"} needs owner action`,
        detail: `Priority is urgent but status is ${status || "unknown"}.`,
        recordId,
      });
    }
    if (record) {
      const market = getScoutingMarketInfo(recordId, state);
      const contractDays = getScoutingDaysUntil(market.contractEnd);
      const lastContactDays = getScoutingDaysSince(target.lastContact);
      const lowConfidenceReport = reports.find((report) => Number(report.confidence) <= 2 || (getScoutingReportAverage(report) || 5) <= 2.5);
      if (Number.isFinite(contractDays) && contractDays >= 0 && contractDays <= 180 && !["signed", "rejected", "archived"].includes(status)) {
        alerts.push({
          tone: "opportunity",
          label: "Contract window",
          title: `${target.name || getScoutingRecordName(record)} contract ends soon`,
          detail: `${contractDays} days until ${market.contractEnd}.`,
          recordId,
        });
      }
      if (Number.isFinite(lastContactDays) && lastContactDays >= 21 && ["contacted", "negotiation"].includes(status)) {
        alerts.push({
          tone: "warning",
          label: "Stale contact",
          title: `${target.name || getScoutingRecordName(record)} needs follow-up`,
          detail: `Last contact was ${lastContactDays} days ago.`,
          recordId,
        });
      }
      if ((isScoutingHighBudgetImpact(market.budgetImpact) || isScoutingHighBudgetImpact(market.estimatedFee) || isScoutingHighBudgetImpact(market.salaryRange)) && ["shortlist", "contacted", "negotiation"].includes(status)) {
        alerts.push({
          tone: "warning",
          label: "Budget risk",
          title: `${target.name || getScoutingRecordName(record)} may be expensive`,
          detail: market.budgetImpact || market.estimatedFee || market.salaryRange,
          recordId,
        });
      }
      if (lowConfidenceReport && ["shortlist", "contacted", "negotiation"].includes(status)) {
        alerts.push({
          tone: "warning",
          label: "Low confidence",
          title: `${target.name || getScoutingRecordName(record)} report needs review`,
          detail: `${lowConfidenceReport.title || "Report"} confidence ${lowConfidenceReport.confidence || "n/a"}/5.`,
          recordId,
        });
      }
      if (isScoutingHighDealProbability(market.dealProbability) && !["negotiation", "signed"].includes(status)) {
        alerts.push({
          tone: "opportunity",
          label: "Deal momentum",
          title: `${target.name || getScoutingRecordName(record)} has high deal probability`,
          detail: `Current status is ${status || "unknown"}; consider moving case forward.`,
          recordId,
        });
      }
    }
  });
  if (isScoutingDatabaseLoaded()) {
    const alertDatabaseRecords = getScoutingDatabase()?.records || [];
    [...alertDatabaseRecords]
      .filter((record) => getScoutingRecordMinutes(record) >= 450)
      .sort((a, b) => getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a))
      .slice(0, 450)
      .map((record) => ({
        record,
        recordId: getScoutingRecordId(record),
        fit: getScoutingRoleFitScore(record),
        minutes: getScoutingRecordMinutes(record),
      }))
      .filter((item) => item.recordId && Number.isFinite(item.fit) && item.fit >= 84)
      .filter((item) => !targetedIds.has(item.recordId) && !shadowIds.has(item.recordId))
      .sort((a, b) => b.fit - a.fit || b.minutes - a.minutes)
      .slice(0, 4)
      .forEach((item) => {
        alerts.push({
          tone: "opportunity",
          label: "Hidden priority",
          title: `${getScoutingRecordName(item.record)} is not in pipeline`,
          detail: `Role fit P${item.fit} with ${formatScoutingNumber(item.minutes)} minutes.`,
          recordId: item.recordId,
        });
      });
    [...alertDatabaseRecords]
      .filter((record) => {
        const age = getScoutingRecordAge(record);
        return Number.isFinite(age) && age <= 23 && getScoutingRecordMinutes(record) <= 900;
      })
      .slice(0, 650)
      .map((record) => {
        const recordId = getScoutingRecordId(record);
        const intelligence = getScoutingIntelligenceProfile(record, state);
        return {
          record,
          recordId,
          fit: intelligence.roleFitScore,
          confidence: intelligence.confidence.score,
          risk: intelligence.risk.label,
          age: getScoutingRecordAge(record),
          minutes: getScoutingRecordMinutes(record),
        };
      })
      .filter(
        (item) =>
          item.recordId &&
          Number.isFinite(item.fit) &&
          item.fit >= 80 &&
          Number.isFinite(item.confidence) &&
          item.confidence >= 66 &&
          Number.isFinite(item.age) &&
          item.age <= 23 &&
          item.minutes <= 900 &&
          !targetedIds.has(item.recordId)
      )
      .sort((a, b) => b.fit - a.fit || b.confidence - a.confidence || a.minutes - b.minutes)
      .slice(0, 4)
      .forEach((item) => {
        alerts.push({
          tone: "opportunity",
          label: "Value case alert",
          title: `${getScoutingRecordName(item.record)} looks undervalued`,
          detail: `Role fit P${item.fit}, confidence ${item.confidence}/99, ${formatScoutingNumber(item.minutes)} min, age ${formatScoutingNumber(item.age)}. Risk: ${item.risk}.`,
          recordId: item.recordId,
        });
      });
  }
  return alerts.slice(0, limit);
}
function renderScoutingRecruitmentAlerts(state = ensureScoutingState()) {
  const alerts = getScoutingRecruitmentAlerts(state, 10);
  return `
    <section class="scouting-alert-center">
      <div class="scouting-alert-head">
        <div>
          <span>Recruitment alerts</span>
          <h2>${alerts.length ? `${alerts.length} process signal${alerts.length === 1 ? "" : "s"}` : "No process gaps"}</h2>
        </div>
        <p>${escapeHtml(alerts.length ? "Alerts catch missing reports, market gaps, open roles and hidden high-fit profiles." : "Workflow, market files and Shadow XI look aligned right now.")}</p>
      </div>
      <div class="scouting-alert-grid">
        ${
          alerts.length
            ? alerts
                .map((alert) => {
                  const attrs = alert.recordId
                    ? `data-open-scouting-record="${escapeHtml(alert.recordId)}"`
                    : alert.slotId
                      ? `data-select-scouting-shadow-slot="${escapeHtml(alert.slotId)}"`
                      : "";
                  return `
                    <button type="button" class="is-${escapeHtml(alert.tone)}" ${attrs}>
                      <span>${escapeHtml(alert.label)}</span>
                      <strong>${escapeHtml(alert.title)}</strong>
                      <em>${escapeHtml(alert.detail)}</em>
                    </button>
                  `;
                })
                .join("")
            : `<p class="scouting-muted">No active recruitment alerts.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingRecruitmentCockpit(state) {
  const roleRows = scoutingShadowSlots.map((slot) => {
    const records = getScoutingShadowSlotRecords(slot.id, state)
      .map((record) => ({
        record,
        score: getScoutingRoleFitScore(record),
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    const topCandidate = records[0];
    return {
      slot,
      records,
      topCandidate,
      need: records.length >= 3 ? "Covered" : records.length ? "Build depth" : "Open need",
    };
  });
  const missingRoles = roleRows.filter((row) => !row.records.length);
  const eliteCandidates = roleRows.flatMap((row) => row.records.filter((item) => (item.score || 0) >= 82));
  const hotCandidates = roleRows
    .flatMap((row) =>
      row.records.map((item) => ({
        ...item,
        slot: row.slot,
      }))
    )
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);
  return `
    <section class="scouting-cockpit">
      <article class="scouting-cockpit-lead">
        <p class="placeholder-tag">Recruitment cockpit</p>
        <h2>${missingRoles.length ? `${missingRoles.length} open role${missingRoles.length === 1 ? "" : "s"}` : "Shadow XI has coverage"}</h2>
        <p>${escapeHtml(missingRoles.length ? `Start with ${missingRoles.slice(0, 3).map((row) => row.slot.label).join(", ")}.` : "Now rank, compare and move the best candidates through the funnel.")}</p>
      </article>
      <article>
        <span>Tracked candidates</span>
        <strong>${roleRows.reduce((sum, row) => sum + row.records.length, 0)}</strong>
        <em>Across ${roleRows.filter((row) => row.records.length).length}/11 roles</em>
      </article>
      <article>
        <span>Priority fits</span>
        <strong>${eliteCandidates.length}</strong>
        <em>Average role spider P82+</em>
      </article>
      <article>
        <span>Favorites</span>
        <strong>${state.favoriteRecordIds.length}</strong>
        <em>Ready for list or XI</em>
      </article>
      ${renderScoutingRecruitmentQueue(state)}
    </section>
  `;
}
function selectScoutingShadowSlot(slotId) {
  const state = ensureScoutingState();
  const id = normalizeScoutingText(slotId, 40);
  const slot = getScoutingShadowSlot(id);
  if (!slot) {
    return;
  }
  preferredScoutingShadowSlotId = slot.id;
  state.shadowXi.selectedSlotId = slot.id;
  state.activeTab = "database";
  writeScoutingState({ syncCentral: false });
  renderScoutingActiveTabSurfaceOrWorkspace({ preserveFocus: true });
}
function clearScoutingShadowSlotSelection() {
  const state = ensureScoutingState();
  preferredScoutingShadowSlotId = "";
  state.shadowXi.selectedSlotId = "";
  writeScoutingState({ syncCentral: false });
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true });
}
function setScoutingShadowFormation(value) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  state.shadowXi.formation = normalizeScoutingFormation(value);
  writeScoutingState();
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true });
}
function setScoutingShadowSlotPitchPosition(slotId = "", xValue, yValue) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const slot = getScoutingShadowSlot(slotId);
  if (!slot) {
    return;
  }
  const state = ensureScoutingState();
  const formation = normalizeScoutingFormation(state.shadowXi?.formation);
  const x = Math.max(6, Math.min(94, Math.round(Number(xValue) * 10) / 10));
  const y = Math.max(6, Math.min(94, Math.round(Number(yValue) * 10) / 10));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  state.shadowXi = {
    ...(state.shadowXi || {}),
    formation,
    positions: {
      ...(state.shadowXi?.positions || {}),
      [formation]: {
        ...(state.shadowXi?.positions?.[formation] || {}),
        [slot.id]: { x, y },
      },
    },
  };
  writeScoutingState();
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true });
}
function getScoutingFocusSnapshot() {
  const activeElement = document.activeElement;
  if (!activeElement || !ui.scoutingWorkspace?.contains(activeElement)) {
    return null;
  }
  const field = activeElement.closest?.("input, textarea, select, [contenteditable='true']");
  if (!field || !ui.scoutingWorkspace.contains(field)) {
    return null;
  }
  const fields = getScoutingFocusableFields();
  const selector = getScoutingFocusSelector(field);
  const matches = selector ? Array.from(ui.scoutingWorkspace.querySelectorAll(selector)) : [];
  return {
    selector,
    selectorIndex: matches.indexOf(field),
    fieldIndex: fields.indexOf(field),
    selectionStart: typeof field.selectionStart === "number" ? field.selectionStart : null,
    selectionEnd: typeof field.selectionEnd === "number" ? field.selectionEnd : null,
  };
}
function getScoutingFocusableFields(root = ui.scoutingWorkspace) {
  return Array.from(root?.querySelectorAll("input, textarea, select, [contenteditable='true']") || []);
}
function getScoutingFocusSelector(field) {
  if (!field) {
    return "";
  }
  const dataset = field.dataset || {};
  const dataEntry = Object.entries(dataset).find(([key]) => key.startsWith("scouting"));
  if (dataEntry) {
    const [key, value] = dataEntry;
    const attrName = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
    const attrValue = normalizeScoutingText(value, 200);
    return attrValue ? `[data-${attrName}="${escapeScoutingCssAttribute(attrValue)}"]` : `[data-${attrName}]`;
  }
  const tag = String(field.tagName || "").toLowerCase();
  if (!tag) {
    return "";
  }
  const name = normalizeScoutingText(field.getAttribute("name"), 120);
  if (name) {
    return `${tag}[name="${escapeScoutingCssAttribute(name)}"]`;
  }
  const placeholder = normalizeScoutingText(field.getAttribute("placeholder"), 120);
  if (placeholder) {
    return `${tag}[placeholder="${escapeScoutingCssAttribute(placeholder)}"]`;
  }
  return tag;
}
function escapeScoutingCssAttribute(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function restoreScoutingFocus(snapshot) {
  if (!snapshot) {
    return;
  }
  const fields = getScoutingFocusableFields();
  const selectorMatches = snapshot.selector ? Array.from(ui.scoutingWorkspace?.querySelectorAll(snapshot.selector) || []) : [];
  const nextField =
    selectorMatches[snapshot.selectorIndex >= 0 ? snapshot.selectorIndex : 0] ||
    fields[snapshot.fieldIndex >= 0 ? snapshot.fieldIndex : -1];
  if (!nextField) {
    return;
  }
  focusScoutingElementWithoutScroll(nextField);
  if (
    typeof nextField.setSelectionRange === "function" &&
    Number.isInteger(snapshot.selectionStart) &&
    Number.isInteger(snapshot.selectionEnd)
  ) {
    nextField.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}
function focusScoutingElementWithoutScroll(element) {
  if (!element || typeof element.focus !== "function") {
    return;
  }
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}
function getScoutingScrollSnapshot() {
  const selectors = [
    ".scouting-profile-backdrop",
    "[data-scouting-profile-modal]",
    "[data-scouting-role-model-overlay]",
    ".scouting-role-model-modal",
    "[data-scouting-report-builder-overlay]",
    ".scouting-report-builder-card.is-overlay",
    "[data-scouting-saved-views-overlay]",
    ".scouting-saved-views-modal",
    "[data-scouting-settings-overlay]",
    ".scouting-settings-modal",
    "[data-scouting-active-content]",
  ];
  return {
    windowX: window.scrollX || 0,
    windowY: window.scrollY || 0,
    elements: selectors
      .map((selector) => {
        const element = ui.scoutingWorkspace?.querySelector(selector);
        return element ? { selector, scrollTop: element.scrollTop || 0, scrollLeft: element.scrollLeft || 0 } : null;
      })
      .filter(Boolean),
  };
}
function getScoutingDisclosureSnapshot(root = ui.scoutingWorkspace) {
  return Array.from(root?.querySelectorAll(".scouting-profile-action-menu") || [])
    .map((element, index) => ({
      selector: ".scouting-profile-action-menu",
      index,
      open: Boolean(element.open),
    }))
    .filter((item) => item.open);
}
function restoreScoutingDisclosureSnapshot(snapshot = []) {
  for (const item of snapshot || []) {
    if (!item?.open || !item.selector) {
      continue;
    }
    const element = Array.from(ui.scoutingWorkspace?.querySelectorAll(item.selector) || [])[item.index || 0];
    if (element) {
      element.open = true;
    }
  }
}
function restoreScoutingScrollSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  const applySnapshot = () => {
    for (const item of snapshot.elements || []) {
      const element = ui.scoutingWorkspace?.querySelector(item.selector);
      if (element) {
        element.scrollTop = item.scrollTop;
        element.scrollLeft = item.scrollLeft;
      }
    }
    window.scrollTo(snapshot.windowX || 0, snapshot.windowY || 0);
  };
  applySnapshot();
  requestAnimationFrame(() => {
    applySnapshot();
    requestAnimationFrame(applySnapshot);
  });
}
function hasOpenScoutingOverlay(root = ui.scoutingWorkspace) {
  return Boolean(
    root?.querySelector(
      ".scouting-profile-backdrop,[data-scouting-role-model-overlay],[data-scouting-report-builder-overlay],[data-scouting-saved-views-overlay],[data-scouting-settings-overlay]"
    )
  );
}
function isScoutingDatabaseAdvancedMode() {
  return Boolean(getScoutingDatabaseAdvancedMode());
}
function setScoutingDatabaseAdvancedMode(enabled) {
  const nextMode = Boolean(enabled);
  if (nextMode === getScoutingDatabaseAdvancedMode()) {
    return;
  }
  setScoutingDatabaseAdvancedModeState(nextMode);
  if (!syncScoutingAdvancedDatabaseModeDom()) {
    refreshScoutingDatabaseSurface({ controls: true });
  }
}
function renderScoutingRecordCard(record, options = {}) {
  const lightweight = Boolean(options.lightweight);
  const compactRow = options.compactMode === true || (lightweight && !isScoutingDatabaseAdvancedMode());
  const state = ensureScoutingState();
  const recordId = getScoutingRecordId(record);
  const canSendToTransferRoom = canSendScoutingRecordToTransferRoom();
  const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
  const selectedSlotId = getSelectedScoutingShadowSlotId(state);
  const selectedSlot = getScoutingShadowSlot(selectedSlotId);
  const inSelectedSlot = selectedSlotId ? getScoutingShadowSlotRecordIds(selectedSlotId, state).includes(recordId) : false;
  const age = getScoutingRecordAge(record);
  const favorite = isScoutingRecordFavorited(recordId);
  const roleProfileId = normalizeScoutingRoleProfileId(filters.roleProfileId, "all");
  const signalMode = filters.signalMode || "all";
  const metricId = filters.metricId || "all";
  const roleFitMin = Number(filters.roleFitMin);
  const roleFloorMin = Number(filters.roleFloorMin);
  const metricMin = Number(filters.metricMin);
  const shouldComputeFullSignal = !compactRow && (
    state.databaseFilters.sortMetricId === "role-fit" ||
    roleProfileId !== "all" ||
    (Number.isFinite(roleFitMin) && roleFitMin > 0) ||
    (Number.isFinite(roleFloorMin) && roleFloorMin > 0) ||
    ["priority", "decision-ready", "breakout", "value"].includes(signalMode) ||
    (metricId !== "all" && Number.isFinite(metricMin) && metricMin > 0)
  );
  const roleFitScore = shouldComputeFullSignal ? getScoutingRoleFitScore(record, roleProfileId || "") : null;
  const recommendation = shouldComputeFullSignal
    ? getScoutingIntelligenceProfile(record, state, roleProfileId || "").recommendation
    : {
        score: null,
        label: "No signal",
        detail: "Open profile for full scouting recommendation and risk details.",
      };
  const inCompareSet = isScoutingRecordInCompareSet(recordId, state);
  const isExpanded = normalizeScoutingText(state.databaseExpandedRecordId, 160) === recordId;
  const position = getScoutingRecordOverviewPosition(record);
  const team = getScoutingRecordTeam(record) || "No club";
  const role = getScoutingRecordBestRoleLabel(record);
  const nationality = getScoutingRecordNationalityMeta(record);
  const ageDisplay = Number.isFinite(age) ? `${formatScoutingNumber(age)} yrs` : "N/A";
  const recommendationTone = getScoutingRecommendationTone(recommendation.label);
  const recommendationText = recommendation.label || "No signal";
  return `
    <article class="scouting-record-card${isExpanded ? " is-expanded" : ""}" data-scouting-record-row="${escapeHtml(recordId)}" tabindex="0" role="button">
      <div class="scouting-record-avatar-shell">
        ${renderScoutingRecordAvatar(record)}
        ${compactRow
          ? ""
          : `<div class="scouting-record-mini-radar-popover" role="img" aria-label="Player role spider" data-scouting-mini-radar-shell="${escapeHtml(recordId)}">
              <span class="scouting-mini-radar-placeholder" aria-hidden="true">◌</span>
            </div>`}
      </div>
      <div class="scouting-record-name-cell">
        <button type="button" class="scouting-record-name-button" data-open-scouting-record="${escapeHtml(recordId)}">
          <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
        </button>
        ${renderFootballScienceDbReadinessLine(record)}
      </div>
      <div class="scouting-record-table-cell scouting-record-position">${escapeHtml(position)}</div>
      <div class="scouting-record-table-cell scouting-record-age">${escapeHtml(ageDisplay)}</div>
      <div class="scouting-record-table-cell scouting-record-club">${escapeHtml(team)}</div>
      <div class="scouting-record-table-cell scouting-record-nationality" title="${escapeHtml(nationality.label)}">
        ${nationality.flag ? `<span class="scouting-record-flag" aria-hidden="true">${escapeHtml(nationality.flag)}</span>` : `<span class="scouting-record-flag is-empty" aria-hidden="true"></span>`}
        <span>${escapeHtml(nationality.code)}</span>
      </div>
      <div class="scouting-record-card-meta-cell scouting-record-best-role" data-scouting-mini-radar-shell="${escapeHtml(recordId)}" tabindex="0">
        <span><i aria-hidden="true">◌</i> Best role</span>
        <strong>${escapeHtml(role)}</strong>
        <div class="scouting-record-mini-radar-popover is-role-popover" role="img" aria-label="Player best-role spider">
          <span class="scouting-mini-radar-placeholder" aria-hidden="true">◌</span>
        </div>
      </div>
      <div class="scouting-record-card-meta-cell scouting-record-card-recommendation">
        <span>Recommendation</span>
        <strong class="scouting-record-card-recommendation-badge is-${escapeHtml(recommendationTone)}" title="${escapeHtml(
    `${recommendationText}${recommendation.score ? ` · ${recommendation.score}` : ""} · ${recommendation.detail || ""}`
  )}">
          ${escapeHtml(recommendationText)}
        </strong>
      </div>
      <div class="scouting-record-actions">
        <button
          type="button"
          class="scouting-star-button${favorite ? " is-active" : ""}"
          data-toggle-scouting-favorite="${escapeHtml(recordId)}"
          aria-pressed="${favorite ? "true" : "false"}"
          aria-label="${favorite ? "Remove favorite" : "Favorite player"}"
        >${favorite ? "★" : "☆"}</button>
        <details class="scouting-record-more-menu" data-scouting-record-more-menu="${escapeHtml(recordId)}" ${scoutingOpenRecordActionMenuId === recordId ? "open" : ""}>
          <summary data-toggle-scouting-record-more-menu="${escapeHtml(recordId)}" aria-label="More actions for ${escapeHtml(getScoutingRecordName(record))}">•••</summary>
          <div>
            <button
              type="button"
              class="scouting-secondary-button${inCompareSet ? " is-active" : ""}"
              data-toggle-scouting-record-compare="${escapeHtml(recordId)}"
            >${inCompareSet ? "Compare ✓" : "Compare"}</button>
            <button
              type="button"
              class="scouting-secondary-button"
              data-toggle-scouting-record-details="${escapeHtml(recordId)}"
            >${isExpanded ? "Hide quick view" : "Quick view"}</button>
            ${
              canSendToTransferRoom
                ? `<button
                    type="button"
                    class="scouting-secondary-button"
                    data-send-scouting-record-to-transfer-room="${escapeHtml(recordId)}"
                  >Send to Transfer Room</button>`
                : ""
            }
            ${
              selectedSlot && canEditScoutingWorkspace()
                ? `
                  <button
                    type="button"
                    class="scouting-record-shadow-add${inSelectedSlot ? " is-added" : ""}"
                    data-add-scouting-record-to-shadow="${escapeHtml(recordId)}"
                    data-scouting-shadow-slot-id="${escapeHtml(selectedSlot.id)}"
                  >
                    ${inSelectedSlot ? "In wishlist" : `Add to ${escapeHtml(selectedSlot.label)}`}
                  </button>
                `
                : ""
            }
          </div>
        </details>
      </div>
      ${isExpanded ? renderScoutingRecordQuickPanel(record, state) : ""}
    </article>
  `;
}
function getScoutingRangeFilterDisplay(field, value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "";
  }
  if (field === "minMinutes") {
    return numericValue > 0 ? `${formatScoutingNumber(numericValue)}+` : "";
  }
  if (field === "maxMinutes") {
    return numericValue > 0 && numericValue < 5000 ? formatScoutingNumber(numericValue) : "";
  }
  if (field === "minAge") {
    return numericValue > 14 ? `${Math.round(numericValue)}+` : "";
  }
  if (field === "maxAge") {
    return numericValue > 0 && numericValue < 45 ? String(Math.round(numericValue)) : "";
  }
  if (field === "metricMin" || field === "roleFitMin" || field === "roleFloorMin") {
    return numericValue > 0 ? `P${Math.round(numericValue)}` : "";
  }
  return "";
}
function getScoutingRangeFilterResetValue(field) {
  if (field === "minMinutes") {
    return 0;
  }
  if (field === "maxMinutes") {
    return 0;
  }
  return "";
}
function renderScoutingRangeFilter({ field, value, min, max, step, ariaLabel, disabled = false, active = null }) {
  const display = active === false ? "" : getScoutingRangeFilterDisplay(field, value);
  const isActive = Boolean(display);
  return `
    <div class="scouting-range-filter${isActive ? " is-active" : " is-any"}">
      <div class="scouting-range-filter-topline">
        <button type="button" class="scouting-range-any-button${isActive ? "" : " is-active"}" data-reset-scouting-range-filter="${escapeHtml(field)}" aria-pressed="${isActive ? "false" : "true"}">Any</button>
        <strong data-scouting-range-value>${escapeHtml(display)}</strong>
      </div>
      <input type="range" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(value)}" data-scouting-filter="${escapeHtml(field)}" aria-label="${escapeHtml(ariaLabel)}" ${disabled ? "disabled" : ""} />
    </div>
  `;
}
function updateScoutingRangeFilterDisplay(rangeInput) {
  const wrap = rangeInput?.closest?.(".scouting-range-filter");
  if (!wrap) {
    return;
  }
  const field = rangeInput.dataset.scoutingFilter;
  const display = getScoutingRangeFilterDisplay(field, rangeInput.value);
  const anyButton = wrap.querySelector("[data-reset-scouting-range-filter]");
  const valueLabel = wrap.querySelector("[data-scouting-range-value]");
  wrap.classList.toggle("is-active", Boolean(display));
  wrap.classList.toggle("is-any", !display);
  if (anyButton) {
    anyButton.classList.toggle("is-active", !display);
    anyButton.setAttribute("aria-pressed", display ? "false" : "true");
  }
  if (valueLabel) {
    valueLabel.textContent = display;
  }
}
function resetScoutingRangeFilter(field) {
  const resetValue = getScoutingRangeFilterResetValue(field);
  setScoutingDatabaseFilter(field, resetValue);
  renderScoutingWorkspace({ preserveFocus: true });
  if (isScoutingDatabaseLoaded()) {
    scheduleScoutingDatabaseFilterRefresh();
  }
}
function renderScoutingDatabaseControls() {
  const state = ensureScoutingState();
  const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
  const searchDraft = getScoutingDatabaseSearchDraft();
  const searchValue = searchDraft === null ? filters.query : searchDraft;
  const options = getScoutingDatabaseOptions();
  const metricOptions = getScoutingMetricOptions();
  const sortOptions = [{ id: "role-fit", label: "Role fit" }, ...metricOptions];
  const advancedCount = getScoutingAdvancedFilterCount(filters);
  const selectedMetricIds = Array.isArray(filters.metricIds) && filters.metricIds.length
    ? filters.metricIds
    : filters.metricId !== "all"
      ? [filters.metricId]
      : [];
  const selectedMetricLabels = selectedMetricIds.map((metricId) => getScoutingMetric(metricId)?.label || metricId).filter(Boolean);
  const selectedMetricSummary = selectedMetricLabels.length > 2
    ? `${selectedMetricLabels.slice(0, 2).join(", ")} +${selectedMetricLabels.length - 2}`
    : selectedMetricLabels.join(", ");
  const advancedFiltersOpen = getScoutingAdvancedDatabaseFiltersOpen();
  const metricFilterOpen = getScoutingDatabaseMetricFilterOpen();
  const metricFilterInputValue = getScoutingDatabaseMetricFilterQuery();
  const metricFilterQuery = metricFilterInputValue.toLowerCase();
  const filteredMetricOptions = metricFilterQuery
    ? metricOptions.filter((metric) => `${metric.label} ${metric.id}`.toLowerCase().includes(metricFilterQuery))
    : metricOptions;
  const minutesMinValue = Math.max(0, Math.min(5000, Math.round(Number(filters.minMinutes) || 0)));
  const minutesMaxValue = Number(filters.maxMinutes) > 0 ? Math.max(0, Math.min(5000, Math.round(Number(filters.maxMinutes)))) : 5000;
  const ageMinValue = Number(filters.minAge) > 0 ? Math.max(14, Math.min(45, Math.round(Number(filters.minAge)))) : 14;
  const ageMaxValue = Number(filters.maxAge) > 0 ? Math.max(14, Math.min(45, Math.round(Number(filters.maxAge)))) : 45;
  const metricMinValue = Number(filters.metricMin) > 0 ? Math.max(1, Math.min(99, Math.round(Number(filters.metricMin)))) : 75;
  const roleFitValue = Number(filters.roleFitMin) > 0 ? Math.max(1, Math.min(99, Math.round(Number(filters.roleFitMin)))) : 70;
  const roleFloorValue = Number(filters.roleFloorMin) > 0 ? Math.max(1, Math.min(99, Math.round(Number(filters.roleFloorMin)))) : 45;
  const hasMetricFloor = selectedMetricIds.length && Number(filters.metricMin) > 0;
  const hasRoleFitFloor = Number(filters.roleFitMin) > 0;
  const hasRoleFloor = Number(filters.roleFloorMin) > 0;
  return `
    <div class="scouting-database-controls">
      <form class="scouting-database-search" data-scouting-database-search-form>
        <label>
          <span>Search</span>
          <input type="search" name="query" value="${escapeHtml(searchValue)}" placeholder="Player, club, league, player type" data-scouting-database-search-input />
        </label>
        <button type="submit" class="scouting-primary-button">Search</button>
      </form>
      <div class="scouting-database-quick-filters">
        <label>
          <span>League</span>
          <select data-scouting-filter="league">
            <option value="all">All leagues</option>
            ${options.leagues.map((league) => `<option value="${escapeHtml(league)}" ${filters.league === league ? "selected" : ""}>${escapeHtml(league)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Team</span>
          <select data-scouting-filter="team">
            <option value="all">All teams</option>
            ${(options.teams || []).map((team) => `<option value="${escapeHtml(team)}" ${filters.team === team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Position</span>
          <select data-scouting-filter="position">
            <option value="all">All positions</option>
            ${options.positions.map((position) => `<option value="${escapeHtml(position)}" ${filters.position === position ? "selected" : ""}>${escapeHtml(position)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Market status</span>
          <select data-scouting-filter="marketStatus">
            ${getScoutingMarketStatusFilterOptions()
              .map((option) => `<option value="${escapeHtml(option.value)}" ${filters.marketStatus === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
              .join("")}
          </select>
        </label>
        <button type="button" class="scouting-filter-toggle${advancedFiltersOpen ? " is-open" : ""}" data-toggle-scouting-advanced-filters aria-expanded="${advancedFiltersOpen ? "true" : "false"}">
          ${escapeHtml(`Advanced filters${advancedCount ? ` (${advancedCount})` : ""}`)}
        </button>
      </div>
      <div class="scouting-database-advanced-filters${advancedFiltersOpen ? " is-open" : ""}" ${advancedFiltersOpen ? "" : "hidden"}>
        <div class="scouting-database-mode-inline">
          <span>Display mode</span>
          <button type="button" class="scouting-filter-toggle${isScoutingDatabaseAdvancedMode() ? " is-open" : ""}" data-toggle-scouting-database-mode aria-pressed="${isScoutingDatabaseAdvancedMode() ? "true" : "false"}">
            ${escapeHtml(isScoutingDatabaseAdvancedMode() ? "Advanced mode on" : "Advanced mode")}
          </button>
        </div>
        <label>
          <span>Season</span>
          <select data-scouting-filter="season">
            <option value="all">All seasons</option>
            ${options.seasons.map((season) => `<option value="${escapeHtml(season)}" ${filters.season === season ? "selected" : ""}>${escapeHtml(season)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Min minutes</span>
          ${renderScoutingRangeFilter({ field: "minMinutes", value: minutesMinValue, min: 0, max: 5000, step: 50, ariaLabel: "Minimum minutes" })}
        </label>
        <label>
          <span>Max minutes</span>
          ${renderScoutingRangeFilter({ field: "maxMinutes", value: minutesMaxValue, min: 0, max: 5000, step: 50, ariaLabel: "Maximum minutes" })}
        </label>
        <label>
          <span>Min age</span>
          ${renderScoutingRangeFilter({ field: "minAge", value: ageMinValue, min: 14, max: 45, step: 1, ariaLabel: "Minimum age" })}
        </label>
        <label>
          <span>Max age</span>
          ${renderScoutingRangeFilter({ field: "maxAge", value: ageMaxValue, min: 14, max: 45, step: 1, ariaLabel: "Maximum age" })}
        </label>
        <div class="scouting-filter-multi scouting-filter-metric-picker">
          <span>Metric filters</span>
          <details ${metricFilterOpen ? "open" : ""} data-scouting-metric-filter-details>
            <summary data-scouting-metric-filter-summary>
              <strong title="${escapeHtml(selectedMetricLabels.join(", "))}">${escapeHtml(selectedMetricSummary || "Choose metrics")}</strong>
              <em>${escapeHtml(selectedMetricLabels.length ? `${selectedMetricLabels.length} selected` : `${metricOptions.length} available`)}</em>
            </summary>
            <div class="scouting-filter-multi-search">
              <input
                type="search"
                value="${escapeHtml(metricFilterInputValue)}"
                placeholder="Search among ${escapeHtml(metricOptions.length)} metrics..."
                data-scouting-metric-filter-search
              />
              <p>Select one or more metrics, then use Metric percentile to set the floor.</p>
            </div>
            <div class="scouting-filter-multi-options">
              ${filteredMetricOptions.length ? filteredMetricOptions
                .map(
                  (metric) => `
                    <label>
                      <input type="checkbox" value="${escapeHtml(metric.id)}" data-scouting-metric-filter ${selectedMetricIds.includes(metric.id) ? "checked" : ""} />
                      <span>
                        <strong>${escapeHtml(metric.label)}</strong>
                        ${metric.group ? `<em>${escapeHtml(metric.group)}</em>` : ""}
                      </span>
                    </label>
                  `
                )
                .join("") : `<p class="scouting-filter-multi-empty">No metrics match this search.</p>`}
            </div>
          </details>
        </div>
        <label>
          <span>Metric percentile</span>
          ${renderScoutingRangeFilter({ field: "metricMin", value: metricMinValue, min: 1, max: 99, step: 1, ariaLabel: "Minimum metric percentile", disabled: !selectedMetricIds.length, active: Boolean(hasMetricFloor) })}
        </label>
        <label>
          <span>Decision lens</span>
          <select data-scouting-filter="signalMode">
            ${getScoutingDecisionLensOptions()
              .map((option) => `<option value="${escapeHtml(option.value)}" ${filters.signalMode === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
              .join("")}
          </select>
        </label>
        <label>
          <span>Player type</span>
          <select data-scouting-filter="roleProfileId">
            ${renderScoutingRoleProfileOptions(filters.roleProfileId)}
          </select>
        </label>
        <label>
          <span>Benchmark</span>
          <select data-scouting-filter="benchmarkMode">
            ${getScoutingBenchmarkModeOptions()
              .map((option) => `<option value="${escapeHtml(option.value)}" ${filters.benchmarkMode === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
              .join("")}
          </select>
        </label>
        <label>
          <span>Min role fit</span>
          ${renderScoutingRangeFilter({ field: "roleFitMin", value: roleFitValue, min: 1, max: 99, step: 1, ariaLabel: "Minimum role fit percentile", active: hasRoleFitFloor })}
        </label>
        <label>
          <span>Min role floor</span>
          ${renderScoutingRangeFilter({ field: "roleFloorMin", value: roleFloorValue, min: 1, max: 99, step: 1, ariaLabel: "Minimum role floor percentile", active: hasRoleFloor })}
        </label>
        <label>
          <span>Sort by</span>
          <select data-scouting-filter="sortMetricId">
            ${sortOptions.map((metric) => `<option value="${escapeHtml(metric.id)}" ${filters.sortMetricId === metric.id ? "selected" : ""}>${escapeHtml(metric.label)}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>
  `;
}
function renderScoutingImportPanel() {
  if (!canEditScoutingWorkspace()) {
    return "";
  }
  const database = getScoutingDatabase();
  const isImported = database?.source === "ui-import";
  const draft = scoutingImportDraft;
  const selected = draft?.sheets?.find((sheet) => sheet.name === draft.selectedSheet);
  const batchSheets = getScoutingImportSheetsForBatch(draft);
  const batchRowCount = batchSheets.reduce((sum, sheet) => sum + (sheet.rows?.length || 0), 0);
  const headers = batchSheets.length ? getScoutingImportHeadersForBatch(batchSheets) : selected?.headers || [];
  const importStepState = getScoutingImportStepState(draft);
  const importPrimaryActionLabel = getScoutingImportPrimaryActionLabel(draft);
  const importActionHelp = getScoutingImportActionHelp(draft);
  const draftStatusLabel =
    draft?.status === "loading"
      ? "Reading workbook..."
      : draft?.status === "importing"
        ? "Uploading to scouting player database..."
      : draft?.databaseStored
        ? "Scouting player database updated"
        : draft?.status === "imported"
          ? `Imported ${draft.importedCount || 0} rows`
          : draft?.status === "error"
            ? "Import needs attention"
            : "Ready to map";
  const draftStatusDetail =
    draft?.error ||
    draft?.databaseUploadError ||
    draft?.databaseUploadStatus ||
    (selected
      ? `${batchRowCount.toLocaleString("en-US")} preview rows / ${batchSheets.length.toLocaleString("en-US")} sheet${batchSheets.length === 1 ? "" : "s"} / ${headers.length} columns`
      : "Choose a file and sheet if available.");
  const coreFields = [
    ["player", "Player"],
    ["team", "Team"],
    ["league", "League"],
    ["season", "Season"],
    ["position", "Position"],
    ["age", "Age"],
    ["dateOfBirth", "Date of birth"],
    ["matches", "Matches"],
    ["minutes", "Minutes"],
    ["birthCountry", "Birth country"],
    ["passportCountry", "Passport country"],
    ["imageUrl", "Player image URL (optional)"],
    ["height", "Height"],
    ["weight", "Weight"],
    ["playerIdentityId", "Player identity id (optional)"],
    ["sourceIdentityId", "Source identity id (optional)"],
    ["wyscoutId", "Wyscout ID (optional)"],
    ["fbrefId", "FBref ID (optional)"],
    ["transfermarktId", "Transfermarkt ID (optional)"],
    ["federationId", "Federation ID (optional)"],
    ["playerSourceId", "Player source id (optional)"],
    ["sourceRecordId", "Source record id (optional)"],
  ];
  const columnOptions = (currentValue) => `
    <option value="">Not mapped</option>
    ${headers.map((header) => `<option value="${escapeHtml(header)}" ${currentValue === header ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}
  `;
  const presetButtons = scoutingImportSourcePresets
    .map(
      (preset) =>
        `<button type="button" class="scouting-import-preset-button" data-scouting-import-preset="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</button>`
    )
    .join("");
  return `
    <section class="scouting-import-panel">
        <div class="scouting-import-head">
        <div>
          <span>Scouting player database</span>
          <h2>${escapeHtml(isImported ? "Imported scouting player database" : "Update scouting player database")}</h2>
          <p>${escapeHtml(isImported ? `${database.records.length.toLocaleString("en-US")} players / ${database.metrics.length} metrics / imported ${String(database.importedAt || "").slice(0, 10)}` : "Upload a scouting player database file, choose sheet, map columns and update the database without code.")}</p>
        </div>
        ${isImported ? `<button type="button" class="scouting-secondary-button" data-clear-scouting-import>Use built-in data</button>` : ""}
        </div>
        ${getScoutingImportLastUploadMarkup()}
        ${renderScoutingImportStepTracker(draft)}
        ${
          draft
            ? `
            <div class="scouting-import-workbench">
              <div class="scouting-import-status ${importStepState.error ? "is-error" : ""}" aria-live="polite">
                <span>${escapeHtml("Scouting player database file")}</span>
                <strong>${escapeHtml(draftStatusLabel)}</strong>
                <p>${escapeHtml(draftStatusDetail)}</p>
              </div>
              ${
                draft.status === "ready" || draft.status === "imported" || draft.status === "error"
                  ? `
                  <div class="scouting-import-controls">
                    <div class="scouting-import-presets">
                      <span>Quick map</span>
                      <div class="scouting-import-preset-list">
                        ${presetButtons}
                      </div>
                    </div>
                      ${
                        draft.sheets.length > 1
                          ? `
                            <label>
                              <span>Mapping sheet</span>
                              <select data-scouting-import-sheet>
                                ${(draft.sheets || []).map((sheet) => `<option value="${escapeHtml(sheet.name)}" ${draft.selectedSheet === sheet.name ? "selected" : ""}>${escapeHtml(sheet.name)}</option>`).join("")}
                              </select>
                            </label>
                          `
                          : ""
                      }
                      <label>
                        <span>Season override</span>
                        <input value="${escapeHtml(draft.seasonOverride || "")}" placeholder="Optional season label" data-scouting-import-season />
                      </label>
                    </div>
                    <div class="scouting-import-map">
                      ${coreFields
                        .map(
                          ([field, label]) => `
                            <label>
                              <span>${escapeHtml(label)}</span>
                              <select data-scouting-import-map="${escapeHtml(field)}">
                                ${columnOptions(draft.map?.[field] || "")}
                              </select>
                            </label>
                          `
                        )
                        .join("")}
                    </div>
                    <div class="scouting-import-preview">
                      <div>
                        <strong>Metric columns</strong>
                        <p>${escapeHtml(`${getScoutingImportMetricHeaders(headers, draft.map || {}).length} unmapped columns will be imported as metrics.`)}</p>
                      </div>
                      <div class="scouting-import-action-stack">
                        <button type="button" class="scouting-primary-button scouting-import-primary-action" data-apply-scouting-import>${escapeHtml(importPrimaryActionLabel)}</button>
                        <small>${escapeHtml(importActionHelp)}</small>
                      </div>
                    </div>
                    ${renderScoutingImportDiffPreview(draft.importPreview)}
                  `
                  : ""
              }
            </div>
          `
          : ""
      }
    </section>
  `;
}
function renderScoutingImportLaunch({ label = "Update scouting database" } = {}) {
  if (!canEditScoutingWorkspace()) {
    return "";
  }
  return `
    <div class="scouting-import-launch">
      <input
        type="file"
        class="scouting-import-file-input"
        accept="${escapeHtml(scoutingImportSupportedFileExts)}"
        data-scouting-import-file
        style="display: none;"
      />
      <button type="button" class="scouting-secondary-button" data-scouting-import-open>${escapeHtml(label)}</button>
    </div>
  `;
}
function renderScoutingSettingsMenu() {
  if (!canEditScoutingWorkspace()) {
    return "";
  }
  return `
    <details class="scouting-settings-menu">
      <summary aria-label="Open scouting settings" title="Scouting settings">⚙</summary>
      <div class="scouting-settings-panel">
        <div class="scouting-settings-panel-head">
          <span>Scouting settings</span>
          <strong>Control centre</strong>
          <p>Choose the area you want to manage.</p>
        </div>
        <div class="scouting-settings-option-grid">
          <button type="button" class="scouting-settings-option" data-open-scouting-settings-panel="datasource">
            <span>Datasource & imports</span>
            <strong>Update scouting player database</strong>
            <small>Upload files, review import history and inspect data foundation.</small>
          </button>
          <button type="button" class="scouting-settings-option" data-open-scouting-role-models>
            <span>Role models</span>
            <strong>Manage search blueprints</strong>
            <small>Edit the baselines used for My Team and scouting recommendations.</small>
          </button>
          <button type="button" class="scouting-settings-option" data-open-scouting-saved-views>
            <span>Database views</span>
            <strong>Saved filters</strong>
            <small>Open saved searches and reusable scouting database views.</small>
          </button>
        </div>
      </div>
    </details>
  `;
}
function openScoutingSettingsPanel(panelId) {
  const id = normalizeScoutingText(panelId, 80);
  if (!canEditScoutingWorkspace() || id !== "datasource") {
    return;
  }
  scoutingSettingsPanel = id;
  loadScoutingImportHistory();
  renderScoutingWorkspace({ preserveFocus: true });
}
function closeScoutingSettingsPanel() {
  scoutingSettingsPanel = "";
  renderScoutingWorkspace({ preserveFocus: true });
}
function renderScoutingSettingsOverlay() {
  if (!scoutingSettingsPanel || !canEditScoutingWorkspace()) {
    return "";
  }
  if (scoutingSettingsPanel !== "datasource") {
    return "";
  }
  return `
    <div class="scouting-settings-overlay" data-scouting-settings-overlay role="dialog" aria-modal="true" aria-label="Datasource and imports">
      <section class="scouting-settings-modal" data-scouting-settings-data-tools>
        <header class="scouting-settings-modal-head">
          <div>
            <p class="placeholder-tag">Settings</p>
            <h2>Datasource & imports</h2>
            <p>Manage uploads, import history and the scouting player database foundation from one clean workspace.</p>
          </div>
          <button type="button" class="scouting-report-builder-close" data-close-scouting-settings-panel aria-label="Close scouting settings">Close</button>
        </header>
        <div class="scouting-settings-modal-grid">
          <section class="scouting-settings-modal-card scouting-settings-upload-card">
            <div>
              <p class="placeholder-tag">Update</p>
              <h3>Upload datasource</h3>
              <p>Add a new scouting player database file, preview changes and commit only when the import looks right.</p>
            </div>
            ${renderScoutingImportLaunch({ label: "Upload datasource" })}
          </section>
          <div class="scouting-settings-foundation">
            ${renderScoutingDataQualityPanel()}
            ${renderScoutingImportHistoryPanel()}
          </div>
          <div class="scouting-settings-import-workspace">
            ${renderScoutingImportPanel()}
          </div>
        </div>
      </section>
    </div>
  `;
}
function openScoutingSavedViews() {
  scoutingSavedViewsOpen = true;
  renderScoutingWorkspace({ preserveFocus: true });
}
function closeScoutingSavedViews() {
  scoutingSavedViewsOpen = false;
  scoutingSavedViewNameDraft = "";
  renderScoutingWorkspace({ preserveFocus: true });
}
function renderScoutingSavedViewsButton() {
  const savedViews = getScoutingSavedViews(ensureScoutingState());
  return `
    <button type="button" class="scouting-saved-views-trigger" data-open-scouting-saved-views>
      <span>Saved Database Views</span>
      <strong>${escapeHtml(savedViews.length)}</strong>
    </button>
  `;
}
function renderScoutingSavedViewsOverlay() {
  if (!scoutingSavedViewsOpen) {
    return "";
  }
  const state = ensureScoutingState();
  const savedViews = getScoutingSavedViews(state);
  const canEdit = canEditScoutingWorkspace();
  return `
    <div class="scouting-saved-views-overlay" data-scouting-saved-views-overlay role="dialog" aria-modal="true" aria-label="Saved database views">
      <section class="scouting-saved-views-modal">
        <header class="scouting-saved-views-head">
          <div>
            <p class="placeholder-tag">Database library</p>
            <h2>Saved Database Views</h2>
            <p>Load saved searches, apply scouting presets, or save the current filter setup for later.</p>
          </div>
          <button type="button" class="scouting-report-builder-close" data-close-scouting-saved-views aria-label="Close saved database views">Close</button>
        </header>
        ${
          canEdit
            ? `
              <form class="scouting-saved-view-save" data-scouting-saved-view-form>
                <label>
                  Save current filter as
                  <input name="name" value="${escapeHtml(scoutingSavedViewNameDraft)}" placeholder="Example: U23 attacking fullbacks" required data-scouting-saved-view-name />
                </label>
                <button type="button" class="scouting-primary-button" data-save-scouting-current-view>Save current view</button>
              </form>
            `
            : ""
        }
        <section class="scouting-saved-view-section">
          <div class="scouting-saved-view-section-head">
            <h3>Quick presets</h3>
            <span>${escapeHtml(getScoutingSavedViewPresets().length)} presets</span>
          </div>
          <div class="scouting-preset-view-list">
            ${getScoutingSavedViewPresets()
              .map((preset) => `<button type="button" data-apply-scouting-preset-view="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</button>`)
              .join("")}
          </div>
        </section>
        <section class="scouting-saved-view-section">
          <div class="scouting-saved-view-section-head">
            <h3>Your saved views</h3>
            <span>${escapeHtml(savedViews.length)} saved</span>
          </div>
          <div class="scouting-saved-view-list">
            ${
              savedViews.length
                ? savedViews
                    .map(
                      (view) => `
                        <article>
                          <button type="button" data-apply-scouting-saved-view="${escapeHtml(view.id)}">
                            <strong>${escapeHtml(view.name)}</strong>
                            <span>${escapeHtml([
                              view.filters.signalMode !== "all" ? view.filters.signalMode : "",
                              view.filters.position !== "all" ? view.filters.position : "",
                              view.filters.league !== "all" ? view.filters.league : "",
                              view.filters.season !== "all" ? view.filters.season : "",
                              view.filters.roleFitMin ? `Role P${view.filters.roleFitMin}+` : "",
                              view.filters.query ? `Search: ${view.filters.query}` : "",
                            ].filter(Boolean).join(" / ") || "All players")}</span>
                          </button>
                          ${canEdit ? `<button type="button" data-delete-scouting-saved-view="${escapeHtml(view.id)}" aria-label="Delete ${escapeHtml(view.name)}">x</button>` : ""}
                        </article>
                      `
                    )
                    .join("")
                : `<p class="scouting-muted">No saved views yet. Save useful searches such as U23 fullbacks, priority fits or value cases.</p>`
            }
          </div>
        </section>
      </section>
    </div>
  `;
}
function getScoutingDataQualitySummary() {
  const database = getScoutingDatabase();
  const records = database?.records || [];
  const options = getScoutingDatabaseOptions();
  const metricOptions = getScoutingMetricOptions();
  const metricOptionCount = metricOptions.length;
  const cacheKey = [
    getScoutingRecordLookupFingerprint(database),
    metricOptionCount,
    options.seasons.length,
    options.leagues.length,
    options.positions.length,
  ].join("|");
  if (scoutingDataQualitySummaryCache.key === cacheKey && scoutingDataQualitySummaryCache.value) {
    return scoutingDataQualitySummaryCache.value;
  }
  const seenKeys = new Set();
  let duplicateRows = 0;
  let missingCore = 0;
  let missingAge = 0;
  let missingMinutes = 0;
  let metricValueCount = 0;
  let trustedMetrics = 0;
  let estimatedMetrics = 0;
  let missingMetrics = 0;
  records.forEach((record) => {
    const key = getScoutingRecordMergeKey(record);
    if (seenKeys.has(key)) {
      duplicateRows += 1;
    }
    seenKeys.add(key);
    if (!getScoutingRecordName(record) || !getScoutingRecordPosition(record) || !getScoutingRecordSeason(record)) {
      missingCore += 1;
    }
    if (!Number.isFinite(getScoutingRecordAge(record))) {
      missingAge += 1;
    }
    if (!getScoutingRecordMinutes(record)) {
      missingMinutes += 1;
    }
    const rowMetricValueCount = getScoutingRecordMetricValueCount(record);
    metricValueCount += rowMetricValueCount;
    const metrics = record?.[scoutingRecordIndex.metrics];
    const qualityMap = record?.[scoutingRecordIndex.metricQuality] || {};
    const entries = Array.isArray(metrics)
      ? metrics.map((entry, index) => [metricOptions[index]?.id || String(index), entry])
      : Object.entries(metrics || {});
    entries.forEach(([metricId, entry]) => {
      const value = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.value : entry;
      if (!Number.isFinite(Number(value))) {
        return;
      }
      const quality = entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizeScoutingMetricQuality(entry.quality)
        : normalizeScoutingMetricQuality(qualityMap[metricId]);
      if (quality === "trusted") {
        trustedMetrics += 1;
      } else if (quality === "estimated") {
        estimatedMetrics += 1;
      }
    });
    missingMetrics += Math.max(0, metricOptionCount - rowMetricValueCount);
  });
  const metricAverage = records.length ? Math.round(metricValueCount / records.length) : 0;
  const coreCompleteness = records.length ? Math.round(((records.length - missingCore) / records.length) * 100) : 0;
  const summary = {
    records: records.length,
    sheets: database?.sheets?.length || 0,
    metrics: database?.metrics?.length || 0,
    seasons: options.seasons.length,
    leagues: options.leagues.length,
    positions: options.positions.length,
    duplicateRows,
    missingCore,
    missingAge,
    missingMinutes,
    metricAverage,
    coreCompleteness,
    trustedMetrics,
    estimatedMetrics,
    missingMetrics,
  };
  scoutingDataQualitySummaryCache = { key: cacheKey, value: summary };
  return summary;
}
function renderScoutingDataQualityPanel() {
  const summary = getScoutingDataQualitySummary();
  return `
    <section class="scouting-data-quality">
      <div>
        <span>Data foundation</span>
        <strong>${summary.coreCompleteness}% core completeness</strong>
        <p>${escapeHtml(`${summary.records.toLocaleString("en-US")} rows / ${summary.sheets} sheets / ${summary.metrics} metrics`)}</p>
      </div>
      <div class="scouting-data-quality-grid">
        <article><span>Seasons</span><strong>${escapeHtml(summary.seasons)}</strong><em>${escapeHtml(summary.leagues)} leagues</em></article>
        <article><span>Positions</span><strong>${escapeHtml(summary.positions)}</strong><em>Parsed role tokens</em></article>
        <article><span>Metric depth</span><strong>${escapeHtml(summary.metricAverage)}</strong><em>avg values/player</em></article>
        <article><span>Duplicates</span><strong>${escapeHtml(summary.duplicateRows)}</strong><em>same player/team/season</em></article>
        <article><span>Trusted metrics</span><strong>${escapeHtml(summary.trustedMetrics)}</strong><em>${escapeHtml(summary.estimatedMetrics)} estimated</em></article>
        <article><span>Missing metrics</span><strong>${escapeHtml(summary.missingMetrics)}</strong><em>${escapeHtml(summary.missingMinutes)} rows missing minutes</em></article>
      </div>
    </section>
  `;
}
function renderFootballScienceDbQualityPlayerList(players = [], emptyLabel = "No review cases in this queue.") {
  if (!players.length) {
    return `<p class="scouting-muted">${escapeHtml(emptyLabel)}</p>`;
  }
  return `
    <div class="scouting-fsdb-quality-list">
      ${players
        .slice(0, 6)
        .map((player) => {
          const detail = [
            player.team,
            player.position,
            player.nationality,
            player.genderSegment && player.genderSegment !== "unknown" ? player.genderSegment : "",
          ].filter(Boolean).join(" / ");
          const signals = [
            player.dedupeKeyPresent ? "dedupe key" : "no dedupe",
            `${player.sourceLinkCount} sources`,
            `${player.metricCount} metrics`,
          ].join(" · ");
          const reviewReason = player.reviewReasons?.[0]?.label || player.reviewLabel || "";
          return `
            <button
              type="button"
              class="scouting-fsdb-quality-player"
              data-open-fsdb-profile="${escapeHtml(player.id)}"
              data-fsdb-profile-id="${escapeHtml(player.id)}"
              data-fsdb-profile-fsdb-id="${escapeHtml(player.fsdbId)}"
            >
              <strong>${escapeHtml(player.name)}</strong>
              <span>${escapeHtml(detail || "Identity details missing")}</span>
              <em>${escapeHtml(reviewReason ? `${reviewReason} · ${signals}` : signals)}</em>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}
function renderFootballScienceDbQualityPanel() {
  const cache = scoutingFootballScienceDbQualityCache;
  const summary = cache.summary;
  const status = normalizeScoutingText(cache.status, 40) || "idle";
  const isLoading = status === "loading";
  const total = normalizeFootballScienceDbQualityNumber(summary?.totals?.players);
  const coverage = summary?.coverage || {};
  const counts = summary?.counts || {};
  const totals = summary?.totals || {};
  const generatedAt = summary?.generatedAt ? formatScoutingImportSummaryDate(summary.generatedAt) : "";
  if (!summary && status === "idle") {
    queueFootballScienceDbQualityLoad();
  }
  return `
    <section class="scouting-data-quality scouting-fsdb-quality${isLoading ? " is-loading" : ""}" data-scouting-fsdb-quality-panel>
      <div>
        <span>Source enrichment</span>
        <strong>${summary ? `${coverage.profileCompleteness || 0}% profile coverage` : isLoading ? "Loading quality snapshot" : "Quality snapshot"}</strong>
        <p>${escapeHtml(
          cache.error ||
            (summary
              ? `${total.toLocaleString("en-US")} global players tracked${generatedAt ? ` / updated ${generatedAt}` : ""}`
              : "Server-side quality snapshot for identity, duplicate risk and spider readiness.")
        )}</p>
      </div>
      <div class="scouting-data-quality-grid scouting-fsdb-quality-grid">
        <article><span>Players</span><strong>${escapeHtml(summary ? total.toLocaleString("en-US") : "...")}</strong><em>${escapeHtml(summary ? `${totals.women || 0} women / ${totals.men || 0} men` : "planned count")}</em></article>
        <article><span>Full names</span><strong>${escapeHtml(summary ? `${coverage.fullNamePct || 0}%` : "...")}</strong><em>${escapeHtml(summary ? `${counts.missingFullName || 0} need names` : "name quality")}</em></article>
        <article><span>Dedupe safe</span><strong>${escapeHtml(summary ? `${coverage.dedupePct || 0}%` : "...")}</strong><em>${escapeHtml(summary ? `${counts.missingDedupe || 0} weak identities` : "strong key")}</em></article>
        <article><span>Source links</span><strong>${escapeHtml(summary ? `${coverage.sourceLinkPct || 0}%` : "...")}</strong><em>${escapeHtml(summary ? `${counts.missingSourceLink || 0} source gaps` : "provenance")}</em></article>
        <article><span>Roster / stats</span><strong>${escapeHtml(summary ? `${coverage.rosterPct || 0}% / ${coverage.statsPct || 0}%` : "...")}</strong><em>${escapeHtml(summary ? `${counts.missingStats || 0} missing stats` : "depth")}</em></article>
        <article><span>Spider ready</span><strong>${escapeHtml(summary ? `${coverage.spiderMetricPct || 0}%` : "...")}</strong><em>${escapeHtml(summary ? `${counts.spiderMetricDepth || 0} metric-rich` : "4+ metrics")}</em></article>
      </div>
      <div class="scouting-fsdb-quality-review">
        <article>
          <div>
            <span>Weak identity queue</span>
            <strong>${escapeHtml(counts.missingDedupe || 0)}</strong>
          </div>
          ${renderFootballScienceDbQualityPlayerList(summary?.reviewQueues?.weakIdentity || [], "No weak identity cases in the current snapshot.")}
        </article>
        <article>
          <div>
            <span>Initial-name queue</span>
            <strong>${escapeHtml(counts.initialNames || 0)}</strong>
          </div>
          ${renderFootballScienceDbQualityPlayerList(summary?.reviewQueues?.initialNames || [], "No initial-only player names in the current snapshot.")}
        </article>
      </div>
      <button type="button" class="scouting-secondary-button" data-refresh-fsdb-quality ${isLoading ? "disabled" : ""}>
        ${escapeHtml(isLoading ? "Refreshing..." : "Refresh source quality")}
      </button>
    </section>
  `;
}
function getScoutingDatabaseResultsMarkup() {
  const records = getFilteredScoutingDatabaseRecords();
  const apiPage = getScoutingDatabasePage();
  const databaseSource = normalizeScoutingText(getScoutingDatabase()?.source, 40);
  const isFootballScienceDb = databaseSource === "fsdb";
  const activeFilters = normalizeScoutingDatabaseFilters(ensureScoutingState().databaseFilters);
  const fsdbSegmentLabel = getFootballScienceDbGenderSegmentLabel(activeFilters.fsdbGenderSegment, { short: true });
  const isPaged = databaseSource === "api" || databaseSource === "worker" || isFootballScienceDb;
  const pageOffset = isPaged ? apiPage?.offset || 0 : getScoutingDatabasePageOffset(records.length);
  const visibleRecords = isPaged
    ? records
    : records.slice(pageOffset, pageOffset + SCOUTING_DATABASE_PAGE_SIZE);
  const shownStart = visibleRecords.length ? pageOffset + 1 : 0;
  const shownEnd = visibleRecords.length ? pageOffset + visibleRecords.length : 0;
  const hasMore = isPaged ? Boolean(apiPage?.hasMore) : false;
  const knownTotal =
    isPaged && Number.isFinite(Number(apiPage?.total)) ? Math.max(0, Math.floor(Number(apiPage.total))) : Number.isFinite(Number(apiPage?.returned))
      ? Math.max(pageOffset + Math.floor(Number(apiPage.returned)), pageOffset)
      : null;
  const total = isPaged
    ? !apiPage?.hasMore && Number.isFinite(Number(knownTotal)) && records.length < knownTotal
      ? records.length
      : knownTotal
    : records.length;
  const summary = isFootballScienceDb
    ? total
      ? `${total.toLocaleString("en-US")} ${fsdbSegmentLabel} Football Science DB players match.`
      : visibleRecords.length
        ? `${visibleRecords.length.toLocaleString("en-US")} ${fsdbSegmentLabel} Football Science DB players shown.`
        : `No ${fsdbSegmentLabel} Football Science DB players found this page.`
    : isPaged
    ? total
      ? `${total.toLocaleString("en-US")} players match.`
      : "No players found this page."
    : `${total.toLocaleString("en-US")} players match.`;
  hydrateScoutingFilteredDatabaseNavigationCache(
    visibleRecords,
    `${scoutingFilteredDatabaseCache.key}:visible:${pageOffset}:${visibleRecords.length}`
  );
  return {
    records,
    visibleRecords,
    summary,
    paging: {
      total,
      offset: pageOffset,
      limit: isPaged ? apiPage?.limit || SCOUTING_API_DATABASE_PAGE_LIMIT : SCOUTING_DATABASE_PAGE_SIZE,
      returned: isPaged ? visibleRecords.length : records.length,
      hasMore,
      nextOffset: isPaged ? apiPage?.nextOffset : null,
      nextCursor: isFootballScienceDb ? apiPage?.nextCursor || "" : "",
      mode: isPaged ? databaseSource : "local",
      shownStart,
      shownEnd,
    },
    html: visibleRecords.length
      ? visibleRecords
          .map((record) =>
            renderScoutingRecordCard(record, {
              lightweight: true,
              compactMode: !isScoutingDatabaseAdvancedMode(),
            })
          )
          .join("")
      : `<div class="scouting-empty-panel">No players match these filters yet.</div>`,
  };
}
function renderScoutingTargetCard(target) {
  const state = ensureScoutingState();
  const record = getScoutingTargetRecord(target);
  const slot = getScoutingSlotById(target?.slotId);
  const recordName = target?.name || (record ? getScoutingRecordName(record) : "Unknown target");
  const recordClub = target?.club || (record ? getScoutingRecordTeam(record) : "Unknown club");
  const targetRoleFit = record ? getScoutingRoleFitScore(record) : null;
  const bestSignal = record ? getScoutingBestSignal(record) : null;
  const minutes = record ? getScoutingRecordMinutes(record) : 0;
  const age = target?.age || "";
  const isListBacked = Boolean(target?.isListBacked);
  return `
    <article class="scouting-target-card${isListBacked ? " is-list-backed" : ""}" draggable="${isListBacked ? "false" : "true"}" ${isListBacked ? "" : `data-scouting-drag-target="${escapeHtml(target.id)}"`}>
      <div class="scouting-target-main">
        <strong>${escapeHtml(recordName)}</strong>
        <span>${escapeHtml(isListBacked ? target.sourceLabel || "Saved list" : slot ? slot.label : "Open")}</span>
      </div>
      <p class="scouting-note-line">${escapeHtml(recordClub)} · ${escapeHtml(target.position || "Unknown position")} · ${age ? `${escapeHtml(age)} yrs` : ""} · ${formatScoutingNumber(minutes)} min</p>
      <p class="scouting-fit-line">${escapeHtml(target.fit || "n/a")} · ${escapeHtml(slot ? slot.position : "Open role")} · ${record ? `${escapeHtml(getScoutingRoleFitLabel(targetRoleFit))}` : "No profile score"}</p>
      <p class="scouting-note-line">${escapeHtml(target.notes || "No notes yet")}</p>
      <p class="scouting-note-line">${escapeHtml(bestSignal ? `${bestSignal.metric.label} · P${bestSignal.percentile}` : target.signalLabel ? `${target.signalLabel} · P${target.signalPercentile || "-"}` : target.fit ? `Status: ${target.fit}` : "No standout signal")}</p>
      <div class="scouting-workflow-meta">
        <span>Owner: ${escapeHtml(target.owner || "Unassigned")}</span>
        <span>Next: ${escapeHtml(target.nextAction || "No next action")}</span>
        <span>Due: ${escapeHtml(target.nextActionDate || target.decisionDeadline || "No date")}</span>
        <span>Contact: ${escapeHtml(target.lastContact || "No contact logged")}</span>
      </div>
      <div class="scouting-target-actions">
        ${
          isListBacked
            ? `<span class="scouting-list-backed-badge">List-backed</span>`
            : `
              <label>
                <span>Status</span>
                <select data-scouting-target-status="${escapeHtml(target.id)}">
                  ${getScoutingOptionMarkup(getScoutingStatusOptions(), target.status)}
                </select>
              </label>
              <label>
                <span>Priority</span>
                <select data-scouting-target-priority="${escapeHtml(target.id)}">
                  ${getScoutingOptionMarkup(getScoutingPriorityOptions(), target.priority)}
                </select>
              </label>
            `
        }
        ${record ? `<button type="button" class="scouting-primary-button" data-open-scouting-record="${escapeHtml(target.recordId)}">Open player</button>` : ""}
        ${isListBacked && canEditScoutingWorkspace() ? `<button type="button" class="scouting-secondary-button" data-save-scouting-target="${escapeHtml(target.recordId)}" data-scouting-target-status="longlist" data-scouting-target-priority="normal">Activate pipeline</button>` : ""}
        ${!isListBacked && canEditScoutingWorkspace() ? `<button type="button" data-remove-scouting-target="${escapeHtml(target.id)}" class="scouting-secondary-button">Remove</button>` : ""}
      </div>
    </article>
  `;
}
function renderScoutingTargetsPanel() {
  const state = ensureScoutingState();
  const targets = getScoutingPipelineTargets(state);
  const statusOptions = getScoutingStatusOptions();
  const sortedTargets = [...targets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const statusMap = statusOptions.map((statusOption) => {
    const list = sortedTargets.filter((target) => target.status === statusOption.value);
    return {
      ...statusOption,
      list,
    };
  });
  return `
    <section class="scouting-target-board">
      <div class="scouting-target-board-title">
        <h2>Funnel</h2>
        <button type="button" class="scouting-secondary-button" data-collapse-scouting-reports-panel="targets">Göm</button>
      </div>
      <div class="scouting-target-board-columns">
        ${statusMap
          .map(
            (statusBucket) => `
              <div class="scouting-target-board-column" data-scouting-target-drop-status="${escapeHtml(statusBucket.value)}">
                <div class="scouting-target-board-head">
                  <h3>${escapeHtml(statusBucket.label)}</h3>
                  <strong>${statusBucket.list.length}</strong>
                </div>
                <div class="scouting-target-board-list">
                  ${
                    statusBucket.list.length
                      ? statusBucket.list.map(renderScoutingTargetCard).join("")
                      : `<p class="scouting-muted">No targets in ${escapeHtml(statusBucket.label).toLowerCase()} yet.</p>`
                  }
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
function openScoutingRoleModels(roleModelId = "") {
  scoutingRoleModelBuilderOpen = true;
  scoutingRoleModelEditId = normalizeScoutingText(roleModelId, 120);
  renderScoutingWorkspace({ preserveFocus: true });
  if (!isScoutingDatabaseLoaded()) {
    ensureScoutingDatabaseLoaded()
      .then(() => {
        if (scoutingRoleModelBuilderOpen) {
          renderScoutingWorkspace({ preserveFocus: true });
        }
      })
      .catch(() => {});
  }
}
function closeScoutingRoleModels() {
  scoutingRoleModelBuilderOpen = false;
  scoutingRoleModelEditId = "";
  renderScoutingWorkspace({ preserveFocus: true });
}
function renderScoutingRoleModelSlotOptions(selectedSlotId = "") {
  return scoutingShadowSlots
    .map(
      (slot) =>
        `<option value="${escapeHtml(slot.id)}" ${selectedSlotId === slot.id ? "selected" : ""}>${escapeHtml(slot.label)} - ${escapeHtml(slot.position)}</option>`
    )
    .join("");
}
function renderScoutingRoleModelMetricRows(metricOptions, activeModel = null) {
  const signals = activeModel ? getScoutingRoleModelSignals(activeModel) : [];
  const signalByMetricId = new Map(signals.map((signal) => [normalizeScoutingText(signal.metricId, 120), signal]));
  const defaultThreshold = Number.isFinite(Number(activeModel?.minPercentile)) ? Math.max(1, Math.min(99, Math.round(Number(activeModel.minPercentile)))) : 70;
  return metricOptions
    .map((metric, index) => {
      const signal = signalByMetricId.get(metric.id);
      const checked = activeModel ? Boolean(signal) : index < 4;
      const direction = signal?.direction === "lower" ? "lower" : "higher";
      const threshold = Number.isFinite(Number(signal?.minPercentile)) ? Math.max(1, Math.min(99, Math.round(Number(signal.minPercentile)))) : defaultThreshold;
      const weight = Number.isFinite(Number(signal?.weight)) ? Math.max(1, Math.min(5, Math.round(Number(signal.weight)))) : 3;
      return `
        <div class="scouting-role-metric-row${checked ? " is-selected" : ""}" data-role-model-metric-row data-metric-id="${escapeHtml(metric.id)}" data-metric-label="${escapeHtml([metric.label, metric.group, metric.id].filter(Boolean).join(" "))}">
          <label class="scouting-role-metric-use">
            <input type="checkbox" name="metricIds" value="${escapeHtml(metric.id)}" ${checked ? "checked" : ""} data-role-model-metric-checkbox />
            <span>Use</span>
          </label>
          <strong>${escapeHtml(metric.label)}</strong>
          <select name="metricDirection:${escapeHtml(metric.id)}">
            <option value="higher" ${direction === "higher" ? "selected" : ""}>Higher is better</option>
            <option value="lower" ${direction === "lower" ? "selected" : ""}>Lower is better</option>
          </select>
          <input type="number" name="metricThreshold:${escapeHtml(metric.id)}" min="1" max="99" value="${escapeHtml(threshold)}" aria-label="Minimum percentile for ${escapeHtml(metric.label)}" />
          <select name="metricWeight:${escapeHtml(metric.id)}" aria-label="Weight for ${escapeHtml(metric.label)}">
            <option value="5" ${weight === 5 ? "selected" : ""}>Key x5</option>
            <option value="4" ${weight === 4 ? "selected" : ""}>High x4</option>
            <option value="3" ${weight === 3 ? "selected" : ""}>Normal x3</option>
            <option value="2" ${weight === 2 ? "selected" : ""}>Support x2</option>
            <option value="1" ${weight === 1 ? "selected" : ""}>Tie-breaker x1</option>
          </select>
          <button type="button" class="scouting-role-metric-remove" data-remove-role-model-metric="${escapeHtml(metric.id)}" aria-label="Remove ${escapeHtml(metric.label)}">
            <span aria-hidden="true">🗑</span>
          </button>
        </div>
      `;
    })
    .join("");
}
function setScoutingRoleModelMetricRowSelected(row, selected = true) {
  const checkbox = row?.querySelector("[data-role-model-metric-checkbox]");
  if (!row || !checkbox) {
    return false;
  }
  checkbox.checked = Boolean(selected);
  row.classList.toggle("is-selected", Boolean(selected));
  updateScoutingRoleModelMetricSelectedCount(row.closest("[data-scouting-role-model-form]"));
  return true;
}
function updateScoutingRoleModelMetricSelectedCount(form) {
  const counter = form?.querySelector("[data-scouting-role-model-metric-selected-count]");
  if (!counter) {
    return;
  }
  const selectedCount = form.querySelectorAll("[data-role-model-metric-checkbox]:checked").length;
  counter.textContent = `${selectedCount} selected`;
}
function addScoutingRoleModelMetricFromPicker(form) {
  const searchInput = form?.querySelector("[data-scouting-role-model-metric-search]");
  const query = normalizeScoutingText(searchInput?.value, 180).toLowerCase();
  if (!query) {
    searchInput?.focus();
    return false;
  }
  const rows = Array.from(form.querySelectorAll("[data-role-model-metric-row]"));
  const exactRow =
    rows.find((row) => normalizeScoutingText(row.dataset.metricId, 120).toLowerCase() === query) ||
    rows.find((row) => normalizeScoutingText(row.querySelector("strong")?.textContent, 180).toLowerCase() === query);
  const metricRow = exactRow || rows.find((row) => normalizeScoutingText(row.dataset.metricLabel, 260).toLowerCase().includes(query));
  if (!metricRow) {
    searchInput?.classList.add("is-invalid");
    searchInput?.focus();
    return false;
  }
  setScoutingRoleModelMetricRowSelected(metricRow, true);
  searchInput.value = "";
  searchInput.classList.remove("is-invalid");
  metricRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
}
function renderScoutingRoleModelMetricPicker(metricOptions, activeModel = null) {
  const selectedIds = new Set(
    (activeModel ? getScoutingRoleModelSignals(activeModel).map((signal) => signal.metricId) : metricOptions.slice(0, 4).map((metric) => metric.id))
      .map((metricId) => normalizeScoutingText(metricId, 120))
      .filter(Boolean)
  );
  return `
    <div class="scouting-role-metric-search">
      <label>
        Add metric
        <input type="search" list="scouting-role-model-metric-options" placeholder="Search metric, e.g. progressive runs, xA, duels..." data-scouting-role-model-metric-search />
      </label>
      <button type="button" class="scouting-secondary-button" data-add-scouting-role-model-metric>Add metric</button>
      <datalist id="scouting-role-model-metric-options">
        ${metricOptions.map((metric) => `<option value="${escapeHtml(metric.label)}">${escapeHtml(metric.group || metric.id)}</option>`).join("")}
      </datalist>
      <span>${escapeHtml(metricOptions.length)} metrics available · <strong data-scouting-role-model-metric-selected-count>${escapeHtml(selectedIds.size)} selected</strong></span>
    </div>
  `;
}
function renderScoutingRoleModelForm(canEdit, metricOptions, activeModel = null) {
  const modelName = activeModel?.name || "";
  const selectedSlotId = activeModel?.slotId || scoutingShadowSlots[0]?.id || "";
  const defaultThreshold = Number.isFinite(Number(activeModel?.minPercentile)) ? Math.max(1, Math.min(99, Math.round(Number(activeModel.minPercentile)))) : 70;
  return canEdit
    ? `<form class="scouting-role-model-form" data-scouting-role-model-form>
        <input type="hidden" name="id" value="${escapeHtml(activeModel?.id || "")}" />
        <div class="scouting-role-model-setup">
          <label>
            Role model name
            <input type="text" name="name" value="${escapeHtml(modelName)}" placeholder="Example: Progressive wide back" required />
          </label>
          <label>
            Position / role
            <select name="slotId">${renderScoutingRoleModelSlotOptions(selectedSlotId)}</select>
          </label>
          <label>
            Default threshold
            <input type="number" min="1" max="99" name="minPercentile" value="${escapeHtml(defaultThreshold)}" />
          </label>
          <label class="is-wide">
            Search intent
            <input type="text" name="searchIntent" value="${escapeHtml(activeModel?.searchIntent || "")}" placeholder="Describe what this role should find, e.g. ball-carrying fullback with crossing volume." />
          </label>
        </div>
        <details class="scouting-role-metric-picker" open>
          <summary>
            <span>Metric blueprint</span>
            <em>Search the database metrics, add KPI, then set direction, threshold and weight.</em>
          </summary>
          ${renderScoutingRoleModelMetricPicker(metricOptions, activeModel)}
          <div class="scouting-role-metric-head">
            <span>Use</span>
            <span>Metric</span>
            <span>Direction</span>
            <span>Min P</span>
            <span>Weight</span>
            <span></span>
          </div>
          <div class="scouting-role-metric-list">
            ${renderScoutingRoleModelMetricRows(metricOptions, activeModel)}
          </div>
        </details>
        <label class="scouting-role-model-notes">
          Model notes
          <textarea name="notes" rows="4" placeholder="Add scouting language, video cues, or role-specific context that should guide the search.">${escapeHtml(activeModel?.notes || "")}</textarea>
        </label>
        <button type="submit" class="scouting-primary-button">${activeModel ? "Update role model baseline" : "Save role model blueprint"}</button>
      </form>`
    : `<p class="scouting-muted">Role models editing is locked.</p>`;
}
function renderScoutingRoleModelCard(model, canEdit) {
  const slot = getScoutingSlotById(model.slotId);
  const signals = getScoutingRoleModelSignals(model);
  const candidates = getScoutingRoleModelCandidates(model).slice(0, 3);
  return `
    <article class="scouting-role-model-card${scoutingRoleModelEditId === model.id ? " is-active" : ""}">
      <header class="scouting-role-model-card-head">
        <div>
          <span class="placeholder-tag">Role model</span>
          <strong>${escapeHtml(model.name || "Custom role model")}</strong>
        </div>
        <em>${escapeHtml(slot ? `${slot.label} · ${slot.position}` : "Open role")}</em>
      </header>
      <p class="scouting-role-model-intent">${escapeHtml(model.searchIntent || "Position-specific player search blueprint.")}</p>
      <div class="scouting-role-model-signal-pills" aria-label="Metric blueprint">
        ${
          signals.length
            ? signals.map((signal) => `<span>${escapeHtml(formatScoutingRoleModelSignal(signal))}</span>`).join("")
            : `<span>No metric blueprint</span>`
        }
      </div>
      <div class="scouting-role-model-card-notes">
        <span>Notes</span>
        <p>${escapeHtml(model.notes || "No notes added yet.")}</p>
      </div>
      <div class="scouting-role-model-card-matches">
        <span>Top matches</span>
        ${
          candidates.length
            ? `<div>${candidates
                .map(
                  (entry) => `
                    <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(entry.record))}">
                      <strong>${escapeHtml(getScoutingRecordName(entry.record))}</strong>
                      <small>Match P${escapeHtml(formatScoutingNumber(entry.score))}</small>
                    </button>
                  `
                )
                .join("")}</div>`
            : `<p>No matching players found yet.</p>`
        }
      </div>
      <footer class="scouting-role-model-card-actions">
        ${canEdit ? `<button type="button" class="scouting-secondary-button" data-edit-scouting-role-model="${escapeHtml(model.id)}">Edit model</button>` : ""}
        ${canEdit ? `<button type="button" class="scouting-secondary-button" data-remove-scouting-role-model="${escapeHtml(model.id)}">Remove model</button>` : ""}
      </footer>
    </article>
  `;
}
function renderScoutingRoleModelsOverlay() {
  if (!scoutingRoleModelBuilderOpen) {
    return "";
  }
  const state = ensureScoutingState();
  const canEdit = canEditScoutingWorkspace();
  const models = getScoutingRoleModels(state);
  const metricOptions = getScoutingMetricOptions();
  const activeModel = models.find((model) => normalizeScoutingText(model.id, 120) === scoutingRoleModelEditId) || null;
  return `
    <div class="scouting-role-model-overlay" data-scouting-role-model-overlay role="dialog" aria-modal="true" aria-label="Manage role models">
      <section class="scouting-role-models scouting-role-model-builder scouting-role-model-modal">
        <div class="scouting-role-model-head">
          <div>
            <p class="placeholder-tag">Search blueprint</p>
            <h2>${activeModel ? "Edit role model" : "Role models"}</h2>
            <p>Build the baseline that grades your own squad and ranks new players against the same position profile.</p>
          </div>
          <div class="scouting-role-model-toolbar">
            <button type="button" class="scouting-report-builder-close" data-close-scouting-role-models aria-label="Close role models">Close</button>
          </div>
        </div>
        <div class="scouting-role-model-modal-grid">
          <div>
            ${renderScoutingRoleModelForm(canEdit, metricOptions, activeModel)}
          </div>
          <aside class="scouting-role-model-side">
            <div class="scouting-shadow-card-head">
              <p class="placeholder-tag">All role models</p>
              <span>${models.length}</span>
            </div>
            <div class="scouting-role-model-list is-overlay-list">
              ${
                models.length
                  ? models.map((model) => renderScoutingRoleModelCard(model, canEdit)).join("")
                  : `<p class="scouting-muted">Create role models to build your recruitment and My Team benchmarks.</p>`
              }
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}
function renderScoutingRoleModelsPanel() {
  const state = ensureScoutingState();
  const models = getScoutingRoleModels(state);
  const metricOptions = getScoutingMetricOptions();
  return `
    <section class="scouting-role-models scouting-role-model-launcher">
      <div class="scouting-role-model-head">
        <div>
          <p class="placeholder-tag">Search blueprint</p>
          <h2>Role models</h2>
          <p>Manage position baselines for My Team benchmarking and scouting database ranking.</p>
        </div>
        <div class="scouting-role-model-toolbar">
          <span>${escapeHtml(models.length)} models</span>
          <span>${escapeHtml(metricOptions.length)} metrics</span>
          <button type="button" class="scouting-primary-button" data-open-scouting-role-models>Manage role models</button>
        </div>
      </div>
    </section>
  `;
}
function openScoutingReportBuilder() {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  scoutingReportBuilderOpen = true;
  renderScoutingWorkspace({ preserveFocus: true });
}
function closeScoutingReportBuilder() {
  scoutingReportBuilderOpen = false;
  renderScoutingWorkspace({ preserveFocus: true });
}
function renderScoutingReportBuilderOverlay(canEdit, targetOptions, reportTypeOptions) {
  if (!scoutingReportBuilderOpen) {
    return "";
  }
  return `
    <div class="scouting-report-builder-overlay" data-scouting-report-builder-overlay role="dialog" aria-modal="true" aria-label="Create scout report">
      <section class="scouting-reports-form-card scouting-report-builder-card is-overlay">
        <div class="scouting-report-builder-head">
          <div>
            <p class="placeholder-tag">Report builder</p>
            <h2>Scout reports</h2>
            <p>Build a structured recruitment memo from live, video or data scouting.</p>
          </div>
          <div class="scouting-report-builder-head-actions">
            <span>1-5 grading scale</span>
            <button type="button" class="scouting-report-builder-close" data-close-scouting-report-builder aria-label="Close report builder">Close</button>
          </div>
        </div>
        <form class="scouting-target-form scouting-report-form is-open" data-scouting-report-form>
          <div class="scouting-report-section is-wide">
            <span>1. Report setup</span>
            <label>
              Report type
              <select name="type" required ${canEdit ? "" : "disabled"}>
                ${reportTypeOptions.map((type) => `<option value="${escapeHtml(type.value)}">${escapeHtml(type.label)}</option>`).join("")}
              </select>
            </label>
            <label>
              Player / target
              <select name="targetId" ${targetOptions ? "" : "disabled"} ${canEdit ? "" : "disabled"}>
                <option value="">Attach to player target</option>
                ${targetOptions}
              </select>
            </label>
            <label>
              Recommendation
              <select name="recommendation" ${canEdit ? "" : "disabled"}>
                ${getScoutingReportRecommendationOptions().map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </label>
            <label>
              Scouting source
              <input type="text" name="scoutType" placeholder="Live, video, data or mixed" ${canEdit ? "" : "disabled"} />
            </label>
            <label class="scouting-report-title-field">
              Report title
              <input type="text" name="title" required placeholder="Example: High-upside winger for right side" ${canEdit ? "" : "disabled"} />
            </label>
          </div>
          <div class="scouting-report-section">
            <span>2. Core grades</span>
            <label>
              Confidence
              <input type="number" name="confidence" min="1" max="5" value="3" ${canEdit ? "" : "disabled"} />
            </label>
            <label>
              Technical
              <input type="number" name="technical" min="1" max="5" value="3" ${canEdit ? "" : "disabled"} />
            </label>
            <label>
              Tactical
              <input type="number" name="tactical" min="1" max="5" value="3" ${canEdit ? "" : "disabled"} />
            </label>
            <label>
              Physical
              <input type="number" name="physical" min="1" max="5" value="3" ${canEdit ? "" : "disabled"} />
            </label>
            <label>
              Mental
              <input type="number" name="psychological" min="1" max="5" value="3" ${canEdit ? "" : "disabled"} />
            </label>
          </div>
          <div class="scouting-report-section is-wide">
            <span>3. Recruitment assessment</span>
            <label class="scouting-report-summary-field">
              Main assessment
              <textarea name="summary" rows="6" placeholder="Role fit, match context, player usage, and why this matters for our squad." ${canEdit ? "" : "disabled"}></textarea>
            </label>
            <label>
              Top strengths
              <textarea name="strengths" rows="3" placeholder="What stands out positively? Link it to role and metrics." ${canEdit ? "" : "disabled"}></textarea>
            </label>
            <label>
              Risks / questions
              <textarea name="risks" rows="3" placeholder="Data risk, league context, injury/load, tactical translation, contract unknowns." ${canEdit ? "" : "disabled"}></textarea>
            </label>
            <label>
              Recommended next step
              <textarea name="nextStep" rows="3" placeholder="Example: second video review, live watch, agent check, compare against shortlist." ${canEdit ? "" : "disabled"}></textarea>
            </label>
          </div>
          <div class="scouting-report-actions">
            <p>Reports should answer: why this player, why now, what risk, and what decision comes next.</p>
            <button type="submit" class="scouting-primary-button" ${canEdit ? "" : "disabled"}>Save structured report</button>
          </div>
        </form>
      </section>
    </div>
  `;
}
function renderScoutingReportsPanel() {
  const state = ensureScoutingState();
  const canEdit = canEditScoutingWorkspace();
  const reports = getScoutingReports(state);
  const targetOptions = getScoutingReportTargetOptionMarkup();
  const reportTypeOptions = [
    { value: "player", label: "Player report" },
    { value: "opposition", label: "Opposition report" },
  ];
  return `
    <div class="scouting-reports-grid">
      <section class="scouting-reports-list">
        <div class="scouting-reports-list-head">
          <div>
            <p class="placeholder-tag">Reports hub</p>
            <h2>Saved reports</h2>
            <p>Collect player reports, opposition notes, and recruitment decisions in one place.</p>
          </div>
          ${canEdit ? `<button type="button" class="scouting-primary-button" data-open-scouting-report-builder>Create report</button>` : ""}
        </div>
        <div class="scouting-target-board-list">
          ${
            reports.length
              ? reports
                  .map((report) => {
                    const target = state.targets.find((item) => item.id === report.targetId);
                    const targetRecord = target ? getScoutingRecordById(target.recordId) : null;
                    return `
                      <article class="scouting-target-card">
                        <div class="scouting-target-main">
                          <strong>${escapeHtml(report.title || "Scouting report")}</strong>
                          <span>${escapeHtml(report.type === "opposition" ? "Opposition" : "Player")}</span>
                        </div>
                        <p class="scouting-note-line">${escapeHtml(targetRecord ? getScoutingRecordName(targetRecord) : target?.name || "No attached target")}</p>
                        <div class="scouting-report-scoreline">
                          <span>${escapeHtml(report.recommendation || "monitor")}</span>
                          <span>Confidence ${escapeHtml(report.confidence || 3)}/5</span>
                          <span>Tec ${escapeHtml(report.technical || 3)}</span>
                          <span>Tac ${escapeHtml(report.tactical || 3)}</span>
                          <span>Phy ${escapeHtml(report.physical || 3)}</span>
                          <span>Psy ${escapeHtml(report.psychological || 3)}</span>
                        </div>
                        <p class="scouting-fit-line">${escapeHtml(report.summary)}</p>
                        <p class="scouting-fit-line">${new Date(report.createdAt).toLocaleString("en-US")}</p>
                        ${canEdit ? `<button type="button" class="scouting-secondary-button" data-delete-scouting-report="${escapeHtml(report.id)}">Delete report</button>` : ""}
                      </article>
                    `;
                  })
                  .join("")
              : `<p class="scouting-muted">Create a first scouting report from the funnel target list.</p>`
          }
        </div>
      </section>
      ${renderScoutingReportBuilderOverlay(canEdit, targetOptions, reportTypeOptions)}
    </div>
  `;
}
function expandScoutingReportsPanel(panelId) {
  const id = normalizeScoutingText(panelId, 80);
  if (!["comparison-lab", "targets"].includes(id)) {
    return;
  }
  scoutingReportsExpandedPanels = new Set([...scoutingReportsExpandedPanels, id]);
  if (!rerenderScoutingActiveContent({ preserveFocus: true })) {
    renderScoutingWorkspace({ preserveFocus: true });
  }
}
function collapseScoutingReportsPanel(panelId) {
  const id = normalizeScoutingText(panelId, 80);
  if (!scoutingReportsExpandedPanels.has(id)) {
    return;
  }
  scoutingReportsExpandedPanels = new Set([...scoutingReportsExpandedPanels].filter((panel) => panel !== id));
  if (!rerenderScoutingActiveContent({ preserveFocus: true })) {
    renderScoutingWorkspace({ preserveFocus: true });
  }
}
function renderScoutingOppositionPanel() {
  if (!isScoutingDatabaseLoaded()) {
    return `
      <section class="scouting-load-panel">
        <h2>Opposition scouting</h2>
        <p>Waiting for scouting data before analysis can run.</p>
      </section>
    `;
  }
  const context = getScoutingOppositionContext();
  const players = getScoutingOppositionTeamPlayers();
  const teamOptions = context.teamOptions;
  const seasonOptions = context.seasonOptions;
  const seasonLabel = context.selectedSeason === "all" ? "All seasons" : context.selectedSeason;
  const topAttackThreats = getScoutingOppositionThreatRows(players, ["xG", "Goals", "Shots"], "Role fit", 4);
  const topCreativeThreats = getScoutingOppositionThreatRows(players, ["xA", "Assists", "Key passes"], "Role fit", 4);
  const topAerialThreats = getScoutingOppositionThreatRows(players, ["Aerial duels won", "Aerial duels"], "Role fit", 4);
  const slotThreats = scoutingShadowSlots
    .map((slot) => ({
      slot,
      records: getScoutingOppositionMatchupRows(players, slot.id, 2),
    }))
    .filter((entry) => entry.records.length);
  const summaryText = getScoutingOppositionSummaryText();
  const reportText = getScoutingOppositionReportText();
  scoutingOppositionLatestSnapshot = {
    team: context.selectedTeam || "All teams",
    season: context.selectedSeason,
    seasonLabel,
    totalPlayers: players.length,
    minMinutes: context.minMinutes,
    summary: summaryText,
    memo: reportText,
  };
  return `
    <section class="scouting-opposition-shell">
      <article class="scouting-opposition-controls">
        <h2>Opposition command</h2>
        <form class="scouting-target-form is-open scouting-opposition-form" data-scouting-opposition-form>
          <select name="team">
            <option value="">All teams</option>
            ${teamOptions
              .map((team) => `<option value="${escapeHtml(team)}" ${context.selectedTeam === team ? "selected" : ""}>${escapeHtml(team)}</option>`)
              .join("")}
          </select>
          <select name="season">
            ${seasonOptions
              .map(
                (season) =>
                  `<option value="${escapeHtml(season)}" ${context.selectedSeason === season ? "selected" : ""}>${season === "all" ? "All seasons" : escapeHtml(season)}</option>`
              )
              .join("")}
          </select>
          <input type="number" name="minMinutes" min="0" max="10000" value="${escapeHtml(String(context.minMinutes))}" placeholder="Minimum minutes" />
          <button type="submit" class="scouting-primary-button">Update scan</button>
          <button type="button" class="scouting-secondary-button" data-create-scouting-opposition-report ${players.length ? "" : "disabled"}>
            Save opposition memo
          </button>
        </form>
        <p class="scouting-opposition-summary">${escapeHtml(summaryText)}</p>
        <p class="scouting-muted">
          Team: ${escapeHtml(context.selectedTeam || "All teams")} · Season: ${escapeHtml(seasonLabel)} · Players: ${players.length.toLocaleString("en-US")} · Min minutes: ${escapeHtml(
    formatScoutingNumber(context.minMinutes)
  )}
        </p>
      </article>
      <section class="scouting-opposition-grid">
        <article class="scouting-opposition-block">
          <h3>Attack threat</h3>
          ${
            topAttackThreats.length
              ? topAttackThreats
                  .map(
                    (entry) => `
                      <article class="scouting-target-card">
                        <div class="scouting-target-main">
                          <strong>${escapeHtml(getScoutingRecordName(entry.record))}</strong>
                          <span>${escapeHtml(entry.metricLabel)} · P${escapeHtml(formatScoutingNumber(entry.score))}</span>
                        </div>
                        <p class="scouting-note-line">${escapeHtml(getScoutingRecordTeam(entry.record))} · ${escapeHtml(getScoutingRecordPosition(entry.record))}</p>
                        <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(entry.record))}">Open profile</button>
                      </article>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">No clear attack threats for this set.</p>`
          }
        </article>
        <article class="scouting-opposition-block">
          <h3>Chance creator threat</h3>
          ${
            topCreativeThreats.length
              ? topCreativeThreats
                  .map(
                    (entry) => `
                      <article class="scouting-target-card">
                        <div class="scouting-target-main">
                          <strong>${escapeHtml(getScoutingRecordName(entry.record))}</strong>
                          <span>${escapeHtml(entry.metricLabel)} · P${escapeHtml(formatScoutingNumber(entry.score))}</span>
                        </div>
                        <p class="scouting-note-line">${escapeHtml(getScoutingRecordTeam(entry.record))} · ${escapeHtml(getScoutingRecordPosition(entry.record))}</p>
                        <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(entry.record))}">Open profile</button>
                      </article>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">No clear creator threats for this set.</p>`
          }
        </article>
        <article class="scouting-opposition-block">
          <h3>Aerial / set-piece threat</h3>
          ${
            topAerialThreats.length
              ? topAerialThreats
                  .map(
                    (entry) => `
                      <article class="scouting-target-card">
                        <div class="scouting-target-main">
                          <strong>${escapeHtml(getScoutingRecordName(entry.record))}</strong>
                          <span>${escapeHtml(entry.metricLabel)} · P${escapeHtml(formatScoutingNumber(entry.score))}</span>
                        </div>
                        <p class="scouting-note-line">${escapeHtml(getScoutingRecordTeam(entry.record))} · ${escapeHtml(getScoutingRecordPosition(entry.record))}</p>
                        <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(entry.record))}">Open profile</button>
                      </article>
                    `
                  )
                  .join("")
              : `<p class="scouting-muted">No clear aerial threats for this set.</p>`
          }
        </article>
      </section>
      <section class="scouting-opposition-block">
        <h3>Role-risk matchups</h3>
        ${
          slotThreats.length
            ? `
              <div class="scouting-opposition-slot-grid">
                ${slotThreats
                  .map(
                    (entry) => `
                      <article class="scouting-target-card">
                        <div class="scouting-target-main">
                          <strong>${escapeHtml(entry.slot.label)} (${escapeHtml(entry.slot.position)})</strong>
                          <span>${entry.records.length} matched players</span>
                        </div>
                        ${entry.records
                          .map(
                            (item) => `
                              <p class="scouting-note-line">${escapeHtml(getScoutingRecordName(item.record))} · P${escapeHtml(formatScoutingNumber(item.fit))}</p>
                              <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(item.record))}">Open profile</button>
                            `
                          )
                          .join("")}
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
            : `<p class="scouting-muted">No role-specific opposition matchups yet.</p>`
        }
      </section>
    </section>
  `;
}
function renderScoutingFuturePanel(type) {
  if (type === "opposition") {
    return renderScoutingOppositionPanel();
  }
  const copy = "Reports will turn shortlisted players into recruitment dossiers, role-fit notes and decision memos.";
  return `
    <section class="scouting-load-panel">
      <h2>Scouting reports</h2>
      <p>${escapeHtml(copy)}</p>
    </section>
  `;
}
function renderScoutingShadowPlayerProfileButton(record, recordId) {
  return `
    <button type="button" class="scouting-shadow-profile-trigger" data-open-scouting-record="${escapeHtml(recordId)}" aria-label="Open profile for ${escapeHtml(getScoutingRecordName(record))}">
      ${renderScoutingRecordAvatar(record)}
    </button>
  `;
}
function renderScoutingShadowPlayerMenu(record, slot, recordId) {
  if (!canEditScoutingWorkspace()) {
    return "";
  }
  return `
    <details class="scouting-shadow-player-menu">
      <summary aria-label="More actions for ${escapeHtml(getScoutingRecordName(record))}">...</summary>
      <div>
        <button type="button" class="is-danger" data-remove-scouting-shadow-slot="${escapeHtml(slot.id)}" data-remove-scouting-shadow-record="${escapeHtml(recordId)}">
          <span aria-hidden="true">🗑</span>
          Remove
        </button>
      </div>
    </details>
  `;
}
function renderScoutingProfileModal() {
  const state = ensureScoutingState();
  const record = getScoutingStoredPlayerRecord(state.selectedRecordId, state);
  if (!record) {
    return "";
  }
  const recordId = getScoutingRecordId(record);
  const canEdit = canEditScoutingWorkspace();
  const canSendToTransferRoom = canSendScoutingRecordToTransferRoom();
  const favorite = isScoutingRecordFavorited(recordId);
  const profileRoleProfileId = normalizeScoutingRoleProfileId(state.profileRoleProfileId, "auto");
  const selectedProfileRoleId = profileRoleProfileId === "auto" ? "" : profileRoleProfileId;
  const activeProfileTab = normalizeScoutingProfileTab(state.profileTab);
  const needsPerformanceData = activeProfileTab === "performance";
  const needsRoleSpiderData = activeProfileTab === "overview" || activeProfileTab === "performance";
  const playerRows = getScoutingRecordsForPlayer(record).slice(0, 20);
  const spiderContext = needsRoleSpiderData ? getScoutingProfileSpiderContext(record, playerRows, selectedProfileRoleId) : null;
  const spiderRecord = spiderContext?.record || record;
  const radarTemplate = needsRoleSpiderData ? getScoutingRadarTemplate(spiderRecord, selectedProfileRoleId) : { profileLabel: "" };
  const profileMetrics = needsRoleSpiderData ? getScoutingRoleMetricRows(spiderRecord, radarTemplate) : [];
  const shadowRoles = scoutingShadowSlots.filter((slot) => getScoutingShadowSlotRecordIds(slot.id, state).includes(recordId));
  const target = findScoutingTargetByRecordId(recordId, state);
  const listOptions = state.lists
    .map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`)
    .join("");
  const targetStatus = target?.status || getScoutingStatusOptions()[0]?.value || "new";
  const targetPriority = target?.priority || getScoutingPriorityOptions()[0]?.value || "normal";
  const targetSlotId = target?.slotId || getSelectedScoutingShadowSlotId(state) || scoutingShadowSlots[0]?.id || "";
  const nationality = getScoutingRecordNationalityMeta(record);
  const slotOptions = scoutingShadowSlots
    .map((slot) => `<option value="${escapeHtml(slot.id)}" ${targetSlotId === slot.id ? "selected" : ""}>${escapeHtml(slot.label)} - ${escapeHtml(slot.position)}</option>`)
    .join("");
  return `
    <div class="scouting-profile-backdrop" data-close-scouting-profile>
      <article class="scouting-profile-modal" data-scouting-profile-modal tabindex="-1">
        <div class="scouting-profile-top-actions">
          ${renderScoutingProfileNavigation(record)}
        </div>
        <button type="button" class="scouting-profile-close" data-close-scouting-profile aria-label="Close scouting profile">
          <span aria-hidden="true">×</span>
        </button>
        <header class="scouting-profile-head">
          <div class="scouting-profile-identity">
            <h2>
              <span>${escapeHtml(getScoutingRecordName(record))}</span>
              <button
                type="button"
                class="scouting-profile-favorite-star${favorite ? " is-active" : ""}"
                data-toggle-scouting-favorite="${escapeHtml(recordId)}"
                aria-label="${favorite ? "Remove favorite" : "Add favorite"}"
                aria-pressed="${favorite ? "true" : "false"}"
                ${canEdit ? "" : "disabled"}
              >
                <span aria-hidden="true">★</span>
                <span class="scouting-sr-only">${favorite ? "Favorited" : "Favorite"}</span>
              </button>
            </h2>
            <div class="scouting-profile-identity-meta">
              <span><strong>Nation</strong>${nationality.flag ? `<i aria-hidden="true">${escapeHtml(nationality.flag)}</i>` : ""}${escapeHtml([nationality.code, nationality.label].filter(Boolean).join(" · ") || "Unknown")}</span>
              <span><strong>Age</strong>${escapeHtml(getScoutingRecordAge(record) ? `${formatScoutingNumber(getScoutingRecordAge(record))} yrs` : "Unknown")}</span>
              <span><strong>Club</strong>${escapeHtml(getScoutingRecordTeam(record) || "Unknown club")}</span>
            </div>
          </div>
        </header>
        <div class="scouting-profile-tabs-row">
          ${renderScoutingProfileTabs(activeProfileTab)}
          <div class="scouting-profile-tabs-actions">
            ${
              shadowRoles.length
                ? `<span class="scouting-profile-shadow-count" title="${escapeHtml(shadowRoles.map((slot) => slot.label).join(", "))}">
                    <strong data-scouting-profile-role-stack>${escapeHtml(String(shadowRoles.length))}</strong>
                    <em data-scouting-profile-role-stack-label>Shadow XI</em>
                  </span>`
                : `<span class="scouting-sr-only" data-scouting-profile-role-stack>0</span>`
            }
            <details class="scouting-profile-action-menu">
              <summary>Player actions</summary>
              <div class="scouting-profile-action-menu-panel">
                <section>
                  <p class="placeholder-tag">Quick actions</p>
                  <div class="scouting-profile-action-row">
                    <button type="button" class="scouting-star-button${favorite ? " is-active" : ""}" data-toggle-scouting-favorite="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>${favorite ? "Favorited" : "Favorite"}</button>
                    <button type="button" class="scouting-primary-button" data-create-scouting-profile-report="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>
                      Add pipeline + report draft
                    </button>
                    <button type="button" class="scouting-secondary-button" data-send-scouting-record-to-transfer-room="${escapeHtml(recordId)}" ${canSendToTransferRoom ? "" : "disabled"}>
                      Send to Transfer Room
                    </button>
                  </div>
                </section>
                <section>
                  <p class="placeholder-tag">Lists and Shadow XI</p>
                  <div class="scouting-profile-action-grid">
                    <label>
                      <span>Add to list</span>
                      <select data-scouting-profile-list ${canEdit ? "" : "disabled"}>${listOptions}</select>
                    </label>
                    <button type="button" class="scouting-primary-button" data-add-scouting-record-to-list="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>Add</button>
                    <label>
                      <span>Shadow slot</span>
                      <select data-scouting-profile-slot ${canEdit ? "" : "disabled"}>${slotOptions}</select>
                    </label>
                    <button type="button" class="scouting-primary-button" data-add-scouting-record-to-shadow="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>Add to wishlist</button>
                  </div>
                </section>
                <section>
                  <p class="placeholder-tag">Pipeline</p>
                  <form class="scouting-target-form is-open" data-scouting-target-form="${escapeHtml(recordId)}">
                    <select name="status" ${canEdit ? "" : "disabled"}>
                      ${getScoutingOptionMarkup(getScoutingStatusOptions(), targetStatus)}
                    </select>
                    <select name="priority" ${canEdit ? "" : "disabled"}>
                      ${getScoutingOptionMarkup(getScoutingPriorityOptions(), targetPriority)}
                    </select>
                    <select name="slotId" ${canEdit ? "" : "disabled"}>${slotOptions}</select>
                    <input type="text" name="notes" placeholder="Pipeline notes" value="${escapeHtml(target?.notes || "")}" ${canEdit ? "" : "disabled"} />
                    <input type="text" name="owner" placeholder="Owner / scout" value="${escapeHtml(target?.owner || "")}" ${canEdit ? "" : "disabled"} />
                    <input type="text" name="nextAction" placeholder="Next action" value="${escapeHtml(target?.nextAction || "")}" ${canEdit ? "" : "disabled"} />
                    <input type="date" name="nextActionDate" value="${escapeHtml(target?.nextActionDate || "")}" ${canEdit ? "" : "disabled"} />
                    <input type="date" name="lastContact" value="${escapeHtml(target?.lastContact || "")}" ${canEdit ? "" : "disabled"} />
                    <input type="date" name="decisionDeadline" value="${escapeHtml(target?.decisionDeadline || "")}" ${canEdit ? "" : "disabled"} />
                    <button type="submit" class="scouting-primary-button" ${canEdit ? "" : "disabled"}>
                      ${target ? "Update pipeline" : "Add pipeline"}
                    </button>
                  </form>
                </section>
              </div>
            </details>
          </div>
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "overview" ? "is-active" : ""}">
          ${activeProfileTab === "overview" ? renderScoutingProfileRoleSpiderGrid(spiderRecord, selectedProfileRoleId, profileRoleProfileId, radarTemplate, profileMetrics, spiderContext) : ""}
          ${activeProfileTab === "overview" ? renderScoutingProfileOverviewPanelShell(record) : ""}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "market" ? "is-active" : ""}">
          ${activeProfileTab === "market" ? renderScoutingMarketIntelligencePanel(record, state) : ""}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "performance" ? "is-active" : ""}">
          ${
            activeProfileTab === "performance"
              ? renderScoutingProfileRoleSpiderGrid(spiderRecord, selectedProfileRoleId, profileRoleProfileId, radarTemplate, profileMetrics, spiderContext)
              : ""
          }
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "squad" ? "is-active" : ""}">
          ${activeProfileTab === "squad" ? renderScoutingSquadFitPanel(record, state) : ""}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "reports" ? "is-active" : ""}">
          ${activeProfileTab === "reports" ? renderScoutingProfileReportsTab(record, state) : ""}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "contacts" ? "is-active" : ""}">
          ${activeProfileTab === "contacts" ? renderScoutingContactsTab(record, state) : ""}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "history" ? "is-active" : ""}">
          ${activeProfileTab === "history" ? renderScoutingProfileHistoryTab(record, playerRows) : ""}
        </div>
      </article>
    </div>
  `;
}
function renderScoutingActiveContent() {
  const state = ensureScoutingState();
  return renderScoutingActiveContentByTab({
    activeTab: state.activeTab,
    canEdit: canEditScoutingWorkspace,
    comparisonCandidatesOpen: scoutingComparisonCandidatesOpen,
    comparisonMetricFilterQuery: scoutingComparisonMetricFilterQuery,
    comparisonMetricMenuOpen: scoutingComparisonMetricMenuOpen,
    comparisonPlayerSearchQuery: scoutingComparisonPlayerSearchQuery,
    comparisonSearchCache: scoutingComparisonSearchCache,
    databaseError: scoutingDatabaseError,
    expandedPanels: scoutingReportsExpandedPanels,
    formatNumber: formatScoutingNumber,
    getComparisonCachedRecordById: getScoutingComparisonCachedRecordById,
    getComparisonLab: getScoutingComparisonLab,
    getDatabase: getScoutingDatabase,
    getDatabaseResultsMarkup: getScoutingDatabaseResultsMarkup,
    getFootballScienceDbGenderSegmentLabel,
    getIntelligenceProfile: getScoutingIntelligenceProfile,
    getMetric: getScoutingMetric,
    getMetricOptions: getScoutingMetricOptions,
    getMetricValue: getScoutingMetricValue,
    getMyTeamAssignedIds: getScoutingMyTeamAssignedIds,
    getMyTeamPlayerById: getScoutingMyTeamPlayerById,
    getMyTeamPlayerId: getScoutingMyTeamPlayerId,
    getMyTeamPlayers: getScoutingMyTeamPlayers,
    getMyTeamSlotPitchPosition: getScoutingMyTeamSlotPitchPosition,
    getMyTeamState: getScoutingMyTeamState,
    getPercentile: getScoutingPercentile,
    getPitchFormationClass: getScoutingPitchFormationClass,
    getRecordAvatar: renderScoutingRecordAvatar,
    getRecordById: getScoutingRecordById,
    getRecordId: getScoutingRecordId,
    getRecordLeague: getScoutingRecordLeague,
    getRecordMinutes: getScoutingRecordMinutes,
    getRecordName: getScoutingRecordName,
    getRecordPosition: getScoutingRecordPosition,
    getRecordTeam: getScoutingRecordTeam,
    getRoleModels: getScoutingRoleModels,
    getSelectedShadowSlotId: getSelectedScoutingShadowSlotId,
    getShadowBoardVisibilityLabel: getScoutingShadowBoardVisibilityLabel,
    getShadowBoardVisibilityOptions: getScoutingShadowBoardVisibilityOptions,
    getShadowBoards: getScoutingShadowBoards,
    getShadowSlotPitchPosition: getScoutingShadowSlotPitchPosition,
    getShadowSlotRecordIds: getScoutingShadowSlotRecordIds,
    getShadowSlotRecords: getScoutingShadowSlotRecords,
    getStoredPlayerRecord: getScoutingStoredPlayerRecord,
    getUnifiedPitchHeightRem: getScoutingUnifiedPitchHeightRem,
    ensureState: ensureScoutingState,
    escapeHtml,
    isAdvancedDatabaseMode: isScoutingDatabaseAdvancedMode,
    isDatabaseLoading: Boolean(scoutingDatabaseLoadPromise),
    normalizeDatabaseFilters: normalizeScoutingDatabaseFilters,
    normalizeMyTeamSlotPlayerIds: normalizeScoutingMyTeamSlotPlayerIds,
    normalizeRecordIds: normalizeScoutingRecordIds,
    normalizeShadowBoardVisibility: normalizeScoutingShadowBoardVisibility,
    normalizeText: normalizeScoutingText,
    queueFootballScienceDbQualityLoad,
    renderAdvancedDatabasePanelsMarkup: renderScoutingAdvancedDatabasePanelsMarkup,
    renderBudgetBoard: renderScoutingBudgetBoard,
    renderComparisonRadarOverlay: renderScoutingComparisonRadarOverlay,
    renderDatabaseControls: renderScoutingDatabaseControls,
    renderDatabasePagingControls: renderScoutingDatabasePagingControls,
    renderFuturePanel: renderScoutingFuturePanel,
    renderFootballScienceDbQualityPanel,
    renderMyTeamPlayerCard: renderScoutingMyTeamPlayerCard,
    renderNextActionCenter: renderScoutingNextActionCenter,
    renderPitchFormationToolbar: renderScoutingPitchFormationToolbar,
    renderPitchRecordCard: renderScoutingPitchRecordCard,
    renderRecordAvatar: renderScoutingRecordAvatar,
    renderReportsPanel: renderScoutingReportsPanel,
    renderRoleModelsPanel: renderScoutingRoleModelsPanel,
    renderSavedViewsButton: renderScoutingSavedViewsButton,
    renderStoredPlayerButton: renderScoutingStoredPlayerButton,
    renderTargetsPanel: renderScoutingTargetsPanel,
    selectedMyTeamPlayerId: scoutingMyTeamSelectedPlayerId,
    shadowFavoriteSearchQuery: scoutingShadowFavoriteSearchQuery,
    shadowSlots: scoutingShadowSlots,
  });
}
function renderScoutingWorkspace(options = {}) {
  if (!ui.scoutingWorkspace) {
    return;
  }
  const preserveOverlayState = options.preserveFocus || hasOpenScoutingOverlay();
  const focusSnapshot = preserveOverlayState ? getScoutingFocusSnapshot() : null;
  const scrollSnapshot = preserveOverlayState ? getScoutingScrollSnapshot() : null;
  const disclosureSnapshot = getScoutingDisclosureSnapshot();
  const state = ensureScoutingState();
  if (!scoutingTabs.some((tab) => tab.id === state.activeTab)) {
    state.activeTab = "shadow-xi";
    writeScoutingState({ syncCentral: false });
  }
  const database = getScoutingDatabase();
  const playerCount = getScoutingDatabaseTotalCount(database);
  const shadowCounts = getScoutingShadowSlotCounts(state);
  const workspaceTitle = getScoutingWorkspaceTitle();
  const perf = startScoutingPerformance("render.workspace", { tab: state.activeTab });
  ui.scoutingWorkspace.innerHTML = `
    <section class="scouting-shell">
      <header class="scouting-hero">
        <div>
          <p class="placeholder-tag">Scouting</p>
          <h1>${escapeHtml(workspaceTitle)}</h1>
        </div>
        ${renderScoutingSettingsMenu()}
      </header>
      <section class="scouting-board">
        <div class="scouting-command-bar">
          <div class="scouting-tabs" role="tablist" aria-label="Scouting views">
            ${scoutingTabs.map(renderScoutingTabButton).join("")}
          </div>
        </div>
          <div class="scouting-content" data-scouting-active-content>
            ${renderScoutingActiveContent()}
          </div>
      </section>
    </section>
    ${renderScoutingProfileModal()}
    ${renderScoutingRoleModelsOverlay()}
    ${renderScoutingSavedViewsOverlay()}
    ${renderScoutingSettingsOverlay()}
  `;
  restoreScoutingDisclosureSnapshot(disclosureSnapshot);
  restoreScoutingFocus(focusSnapshot);
  runScoutingPostRenderHooks(state);
  restoreScoutingScrollSnapshot(scrollSnapshot);
  perf.end({ tab: state.activeTab });
}
function runScoutingPostRenderHooks(state = ensureScoutingState()) {
  if (["database", "shadow-xi", "my-team", "reports"].includes(state.activeTab)) {
    bindScoutingDragAndDrop();
  }
  if (state.activeTab === "my-team") {
    bindScoutingMyTeamSpiderShells();
  }
  if (state.activeTab === "database") {
    bindScoutingRecordMiniRadarShells();
    scheduleScoutingDatabaseAutoLoad();
    if (isScoutingDatabaseAdvancedMode()) {
      loadScoutingImportHistory();
    }
  }
  if (shouldFocusScoutingProfileModal(state.selectedRecordId)) {
    focusScoutingProfileModal();
    queueScoutingProfileModalFocus(state.selectedRecordId);
  }
  if (state.selectedRecordId && normalizeScoutingProfileTab(state.profileTab) === "overview") {
    queueFootballScienceDbProfileHydration(state.selectedRecordId);
  }
  if (state.activeTab === "database") {
    scheduleScoutingDatabaseWorkerPrewarm(1200);
  }
}
function syncScoutingTabButtonsDom(state = ensureScoutingState()) {
  ui.scoutingWorkspace?.querySelectorAll("[data-scouting-tab]").forEach((button) => {
    const active = normalizeScoutingText(button.dataset.scoutingTab, 80) === state.activeTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}
function refreshScoutingActiveTabSurface(options = {}) {
  if (!ui.scoutingWorkspace) {
    return false;
  }
  const state = ensureScoutingState();
  syncScoutingTabButtonsDom(state);
  const updated = rerenderScoutingActiveContent({ preserveFocus: options.preserveFocus !== false });
  if (!updated) {
    return false;
  }
  refreshScoutingWorkspaceSummaryMetrics();
  return true;
}
function renderScoutingActiveTabSurfaceOrWorkspace(options = {}) {
  if (!refreshScoutingActiveTabSurface(options)) {
    renderScoutingWorkspace(options);
  }
}
function refreshScoutingWorkspaceSummaryMetrics() {
  if (!ui.scoutingWorkspace) {
    return;
  }
  const state = ensureScoutingState();
  const summary = ui.scoutingWorkspace.querySelector("[data-scouting-summary-metrics]") || ui.scoutingWorkspace.querySelector(".scouting-metrics");
  if (!summary) {
    return;
  }
  const database = getScoutingDatabase();
  const shadowCounts = getScoutingShadowSlotCounts(state);
  const hasLoadedDatabase = isScoutingDatabaseLoaded();
  const summaryNodes = {
    players: summary.querySelector("[data-scouting-summary-players]"),
    sheets: summary.querySelector("[data-scouting-summary-sheets]"),
    favorites: summary.querySelector("[data-scouting-summary-favorites]"),
    shadowTargets: summary.querySelector("[data-scouting-summary-shadow-targets]"),
  };
  if (summaryNodes.players) {
    const count = getScoutingDatabaseTotalCount(database);
    summaryNodes.players.textContent = hasLoadedDatabase && count ? count.toLocaleString("en-US") : "...";
  }
  if (summaryNodes.sheets) {
    const count = database?.sheets?.length || 0;
    summaryNodes.sheets.textContent = hasLoadedDatabase && count ? count.toLocaleString("en-US") : "...";
  }
  if (summaryNodes.favorites) {
    summaryNodes.favorites.textContent = String(state.favoriteRecordIds.length);
  }
  if (summaryNodes.shadowTargets) {
    summaryNodes.shadowTargets.textContent = String(shadowCounts.playerCount);
  }
}
function refreshScoutingProfileShadowSummary(recordId) {
  const normalizedRecordId = normalizeScoutingText(recordId, 160);
  if (!normalizedRecordId) {
    return;
  }
  const modal = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]");
  if (!modal) {
    return;
  }
  const state = ensureScoutingState();
  const shadowRoles = scoutingShadowSlots.filter((slot) => getScoutingShadowSlotRecordIds(slot.id, state).includes(normalizedRecordId));
  const roleStack = modal.querySelector("[data-scouting-profile-role-stack]");
  const roleStackLabel = modal.querySelector("[data-scouting-profile-role-stack-label]");
  if (roleStack) {
    roleStack.textContent = String(shadowRoles.length);
  }
  if (roleStackLabel) {
    roleStackLabel.textContent = shadowRoles.length ? shadowRoles.map((slot) => slot.label).join(", ") : "Not in Shadow XI";
  }
}
function refreshScoutingWorkspaceAfterShadowMutation(options = {}, recordId = "") {
  const state = ensureScoutingState();
  const preserveFocus = options.preserveFocus !== false;
  const hasProfileModal = Boolean(ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]"));
  if (hasProfileModal && recordId) {
    refreshScoutingProfileShadowSummary(recordId);
  }
  if (!ui.scoutingWorkspace) {
    return;
  }
  refreshScoutingWorkspaceSummaryMetrics();
  if (hasProfileModal) {
    return;
  }
  if (["database", "lists", "comparison", "shadow-xi", "opposition", "reports"].includes(state.activeTab)) {
    const updated = rerenderScoutingActiveContent({ preserveFocus });
    if (updated) {
      return;
    }
  }
  renderScoutingWorkspace({ preserveFocus });
}
function rerenderScoutingActiveContent(options = {}) {
  if (!ui.scoutingWorkspace) {
    return false;
  }
  const content = ui.scoutingWorkspace.querySelector("[data-scouting-active-content]");
  if (!content) {
    return false;
  }
  const state = ensureScoutingState();
  const perf = startScoutingPerformance("render.active-content", { tab: state.activeTab });
  const preserveOverlayState = options.preserveFocus || hasOpenScoutingOverlay();
  const focusSnapshot = preserveOverlayState ? getScoutingFocusSnapshot() : null;
  const scrollSnapshot = preserveOverlayState ? getScoutingScrollSnapshot() : null;
  content.innerHTML = renderScoutingActiveContent();
  if (preserveOverlayState) {
    restoreScoutingFocus(focusSnapshot);
  }
  runScoutingPostRenderHooks(state);
  restoreScoutingScrollSnapshot(scrollSnapshot);
  perf.end({ tab: state.activeTab });
  return true;
}
function refreshScoutingWorkspaceAfterLocalMutation(options = {}) {
  const state = ensureScoutingState();
  const preserveFocus = options.preserveFocus !== false;
  const activeProfileModal = Boolean(ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]"));
  if (["database", "lists", "my-team", "shadow-xi", "comparison", "opposition", "reports"].includes(state.activeTab) && !activeProfileModal) {
    const updated = rerenderScoutingActiveContent({ preserveFocus });
    if (updated) {
      refreshScoutingWorkspaceSummaryMetrics();
      return;
    }
  }
  renderScoutingWorkspace({ preserveFocus });
  refreshScoutingWorkspaceSummaryMetrics();
}
function renderScoutingAnalysisRoomWorkspace(options = {}) {
  if (!ui.scoutingWorkspace) {
    return;
  }
  const preserveOverlayState = options.preserveFocus || hasOpenScoutingOverlay();
  const focusSnapshot = preserveOverlayState ? getScoutingFocusSnapshot() : null;
  const scrollSnapshot = preserveOverlayState ? getScoutingScrollSnapshot() : null;
  ui.scoutingWorkspace.innerHTML = `
    <section class="scouting-shell">
      <header class="scouting-hero">
        <div>
          <p class="placeholder-tag">Analysis Room</p>
          <h1>Own team performance</h1>
        </div>
      </header>
      <section class="scouting-board">
        <div class="scouting-content">
          <section class="analysis-room-placeholder" aria-label="Analysis Room placeholder">
            <div class="analysis-room-placeholder-copy">
              <p class="placeholder-tag">Own team review</p>
              <h2>Skunks Work building this</h2>
              <p>Analysis Room will focus on our own team performances, match reviews and the feedback loop back into training.</p>
            </div>
            <div class="analysis-room-skunk-card" aria-hidden="true">
              <div class="analysis-room-skunk">
                <span class="analysis-room-skunk-tail"></span>
                <span class="analysis-room-skunk-body"></span>
                <span class="analysis-room-skunk-stripe"></span>
                <span class="analysis-room-skunk-head"></span>
                <span class="analysis-room-skunk-ear is-left"></span>
                <span class="analysis-room-skunk-ear is-right"></span>
                <span class="analysis-room-skunk-eye"></span>
                <span class="analysis-room-skunk-nose"></span>
              </div>
            </div>
          </section>
        </div>
      </section>
    </section>
  `;
  restoreScoutingFocus(focusSnapshot);
  restoreScoutingScrollSnapshot(scrollSnapshot);
}
function setScoutingActiveTab(tabId) {
  const state = ensureScoutingState();
  if (!scoutingTabs.some((tab) => tab.id === tabId)) {
    return;
  }
  if (state.activeTab === tabId) {
    return;
  }
  const previousTab = state.activeTab;
  const perf = startScoutingPerformance("tab.switch", { from: previousTab, to: tabId });
  state.activeTab = tabId;
  if (tabId === "shadow-xi") {
    preferredScoutingShadowSlotId = "";
    state.shadowXi.selectedSlotId = "";
  }
  if (tabId !== "reports" && scoutingReportsExpandedPanels.size) {
    scoutingReportsExpandedPanels = new Set();
  }
  if (tabId !== "database") {
    cancelScoutingDatabaseBackgroundTimers();
  }
  writeScoutingState({ syncCentral: false });
  syncScoutingTabButtonsDom(state);
  renderScoutingActiveTabSurfaceOrWorkspace({ preserveFocus: false });
  perf.end({ from: previousTab, to: tabId });
}
function setScoutingDatabaseFilter(field, value) {
  const state = ensureScoutingState();
  if (field === "query") {
    setScoutingDatabaseSearchDraft(null);
  }
  const nextPatch = {
    ...state.databaseFilters,
    [field]: value,
    offset: field === "offset" ? value : 0,
  };
  if (field !== "fsdbCursor" && field !== "fsdbCursorStack") {
    nextPatch.fsdbCursor = "";
    nextPatch.fsdbCursorStack = [];
  }
  if (field === "source") {
    scoutingDatabaseError = "";
    scoutingDatabaseLoadPromise = null;
    scoutingDatabaseLoadSource = "";
  }
  if (field === "metricIds") {
    const metricIds = Array.isArray(value) ? value.map((item) => normalizeScoutingText(item, 120)).filter(Boolean) : [];
    nextPatch.metricIds = metricIds;
    nextPatch.metricId = metricIds[0] || "all";
  }
  if (field === "minMinutes") {
    nextPatch.minMinutesIntentional = Number(value) > 0;
  }
  state.databaseFilters = normalizeScoutingDatabaseFilters({
    ...nextPatch,
  });
  scoutingFilteredDatabaseCache.key = "";
  deferScoutingStateWrite({ syncCentral: false });
}
function setScoutingDatabasePageOffset(offset) {
  const nextOffset = getScoutingApiOffset(offset);
  const state = ensureScoutingState();
  if (isScoutingPagedDatabaseActive()) {
    const offsetToSet = nextOffset;
    const currentFilters = normalizeScoutingDatabaseFilters(state.databaseFilters || {});
    const liveQuery = getScoutingDatabaseLiveSearchQuery(currentFilters.query);
    if (
      getScoutingApiOffset(currentFilters.offset) === offsetToSet &&
      normalizeScoutingText(currentFilters.query, 120) === liveQuery
    ) {
      return;
    }
    state.databaseFilters = normalizeScoutingDatabaseFilters({
      ...currentFilters,
      query: liveQuery,
      offset: offsetToSet,
    });
    scoutingFilteredDatabaseCache.key = "";
    writeScoutingState({ syncCentral: false });
    scheduleScoutingDatabaseRefresh();
    return;
  }
  const filtered = getFilteredScoutingDatabaseRecords();
  const total = Math.max(0, Math.floor(filtered.length));
  const lastPageStart = Math.max(0, Math.floor((total - 1) / SCOUTING_DATABASE_PAGE_SIZE) * SCOUTING_DATABASE_PAGE_SIZE);
  const desiredOffset = Math.max(0, Math.min(nextOffset, lastPageStart));
  const offsetToSet = Number.isFinite(desiredOffset) ? desiredOffset : 0;
  if (getScoutingApiOffset(state.databaseFilters.offset) === offsetToSet) {
    return;
  }
  state.databaseFilters = normalizeScoutingDatabaseFilters({
    ...state.databaseFilters,
    offset: offsetToSet,
  });
  scoutingFilteredDatabaseCache.key = "";
  writeScoutingState({ syncCentral: false });
  scheduleScoutingDatabaseResultsRender();
}
function setScoutingDatabasePageCursor(direction = "", cursor = "") {
  const state = ensureScoutingState();
  const currentFilters = normalizeScoutingDatabaseFilters(state.databaseFilters || {});
  if (currentFilters.source !== "fsdb") {
    return;
  }
  const liveQuery = getScoutingDatabaseLiveSearchQuery(currentFilters.query);
  const stack = Array.isArray(currentFilters.fsdbCursorStack) ? currentFilters.fsdbCursorStack.slice() : [];
  let nextCursor = currentFilters.fsdbCursor;
  let nextStack = stack;
  if (direction === "next") {
    const incomingCursor = normalizeScoutingText(cursor || getScoutingDatabasePage()?.nextCursor, 400);
    if (!incomingCursor) {
      return;
    }
    if (currentFilters.fsdbCursor) {
      nextStack = [...stack, currentFilters.fsdbCursor].slice(-50);
    } else {
      nextStack = [...stack, "__first__"].slice(-50);
    }
    nextCursor = incomingCursor;
  } else if (direction === "previous") {
    if (!stack.length) {
      return;
    }
    const previousCursor = stack[stack.length - 1];
    nextStack = stack.slice(0, -1);
    nextCursor = previousCursor === "__first__" ? "" : previousCursor;
  } else {
    return;
  }
  state.databaseFilters = normalizeScoutingDatabaseFilters({
    ...currentFilters,
    query: liveQuery,
    fsdbCursor: nextCursor,
    fsdbCursorStack: nextStack,
    offset: 0,
  });
  scoutingFilteredDatabaseCache.key = "";
  writeScoutingState({ syncCentral: false });
  scheduleScoutingDatabaseRefresh();
}
function setScoutingDatabasePageNumber(pageNumber) {
  const isPaged = isScoutingPagedDatabaseActive();
  const pageSize = isPaged
    ? Math.max(1, Math.floor(Number(getScoutingDatabasePage()?.limit) || SCOUTING_API_DATABASE_PAGE_LIMIT))
    : SCOUTING_DATABASE_PAGE_SIZE;
  const requestedPage = Math.max(1, Math.floor(Number(pageNumber) || 1));
  const total = isPaged
    ? Math.max(0, Math.floor(Number(getScoutingDatabasePage()?.total) || 0))
    : getFilteredScoutingDatabaseRecords().length;
  const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : requestedPage;
  const safePage = Math.min(requestedPage, totalPages);
  setScoutingDatabasePageOffset((safePage - 1) * pageSize);
}

function scheduleScoutingDatabaseFilterRefresh() {
  if (isScoutingPagedDatabaseActive()) {
    scheduleScoutingDatabaseRefresh();
    return;
  }
  window.clearTimeout(getScoutingDatabaseFilterDebounceTimer());
  setScoutingDatabaseFilterDebounceTimer(window.setTimeout(() => {
    setScoutingDatabaseFilterDebounceTimer(0);
    scheduleScoutingDatabaseResultsRender();
  }, 120));
}
function rollbackScoutingImport(importBatchId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const batchId = normalizeScoutingText(importBatchId, 80);
  if (!batchId || !isScoutingApiDatabaseActive()) {
    return;
  }
  scoutingImportHistoryCache = { ...scoutingImportHistoryCache, status: "loading", error: "" };
  renderScoutingImportHistoryPanelIntoDom();
  sendScoutingApiAction({ action: "rollbackImport", importBatchId: batchId })
    .then((result) => {
      if (!result?.ok) {
        throw new Error(result?.reason || "Could not rollback import.");
      }
      scoutingDatabaseOptionCache = null;
      resetScoutingComputedCaches();
      scoutingImportHistoryCache = { status: "idle", imports: [], error: "", promise: null };
      return loadScoutingDatabaseWithApi();
    })
    .then(() => {
      renderScoutingDatabaseResults();
      loadScoutingImportHistory({ force: true });
    })
    .catch((error) => {
      scoutingImportHistoryCache = {
        status: "error",
        imports: [],
        error: error?.message || "Could not rollback import.",
        promise: null,
      };
      renderScoutingImportHistoryPanelIntoDom();
    });
}
function createScoutingSavedView(name) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const safeName = normalizeScoutingText(name, 80);
  if (!safeName) {
    return;
  }
  scoutingSavedViewNameDraft = "";
  const view = cloneScoutingSavedView({
    name: safeName,
    filters: state.databaseFilters,
  });
  state.savedViews = [view, ...getScoutingSavedViews(state).filter((item) => item.name.toLowerCase() !== safeName.toLowerCase())];
  scoutingSavedViewsOpen = true;
  writeScoutingState();
  renderScoutingWorkspace({ preserveFocus: true });
}
function applyScoutingPresetView(presetId) {
  const preset = getScoutingSavedViewPresets().find((item) => item.id === normalizeScoutingText(presetId, 80));
  if (!preset) {
    return;
  }
  const state = ensureScoutingState();
  setScoutingDatabaseSearchDraft(null);
  state.databaseFilters = normalizeScoutingDatabaseFilters({
    ...normalizeScoutingDatabaseFilters({}),
    ...preset.filters,
  });
  state.activeTab = "database";
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace({ preserveFocus: true });
}
function applyScoutingSavedView(viewId) {
  const state = ensureScoutingState();
  const id = normalizeScoutingText(viewId, 120);
  const view = getScoutingSavedViews(state).find((item) => item.id === id);
  if (!view) {
    return;
  }
  setScoutingDatabaseSearchDraft(null);
  state.databaseFilters = normalizeScoutingDatabaseFilters(view.filters);
  state.activeTab = "database";
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace({ preserveFocus: true });
}
function deleteScoutingSavedView(viewId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(viewId, 120);
  state.savedViews = getScoutingSavedViews(state).filter((view) => view.id !== id);
  writeScoutingState();
  renderScoutingWorkspace({ preserveFocus: true });
}
function renderScoutingDatabaseResults() {
  if (ensureScoutingState().activeTab !== "database") {
    recordScoutingPerformance("database.results-render", {
      durationMs: 0,
      detail: { status: "skipped-inactive-tab" },
    });
    return;
  }
  const results = getScoutingDatabaseResultsMarkup();
  const isAdvancedMode = isScoutingDatabaseAdvancedMode();
  const market = isAdvancedMode ? ui.scoutingWorkspace?.querySelector("[data-scouting-market-radar]") : null;
  const brief = isAdvancedMode ? ui.scoutingWorkspace?.querySelector("[data-scouting-intelligence-brief]") : null;
  const queue = isAdvancedMode ? ui.scoutingWorkspace?.querySelector("[data-scouting-action-queue]") : null;
  const compare = isAdvancedMode ? ui.scoutingWorkspace?.querySelector("[data-scouting-compare-set]") : null;
  const summary = ui.scoutingWorkspace?.querySelector("[data-scouting-result-summary]");
  const resultsActions = ui.scoutingWorkspace?.querySelector(".scouting-database-results-actions");
  const resultsFooter = ui.scoutingWorkspace?.querySelector(".scouting-database-results-footer");
  const grid = ui.scoutingWorkspace?.querySelector("[data-scouting-record-grid]");
  const pagingHtml = renderScoutingDatabasePagingControls(results.paging);
  if (brief) {
    brief.outerHTML = renderScoutingDatabaseIntelligenceBrief(results.visibleRecords, ensureScoutingState(), { totalCount: results.records.length });
  }
  if (queue) {
    queue.outerHTML = renderScoutingDatabaseActionQueue(results.visibleRecords, ensureScoutingState());
  }
  if (compare) {
    compare.outerHTML = renderScoutingCompareSetPanel(ensureScoutingState());
  }
  if (market) {
    market.outerHTML = renderScoutingMarketRadar(results.visibleRecords);
  }
  if (summary) {
    summary.textContent = results.summary;
  }
  if (resultsActions) {
    resultsActions.querySelector("[data-scouting-database-paging]")?.remove();
    resultsActions.insertAdjacentHTML("beforeend", pagingHtml);
  }
  if (resultsFooter) {
    resultsFooter.innerHTML = pagingHtml;
  }
  if (grid) {
    grid.innerHTML = results.html;
    if (!resultsActions && !resultsFooter) {
      ui.scoutingWorkspace?.querySelector("[data-scouting-database-paging]")?.remove();
      grid.insertAdjacentHTML("afterend", pagingHtml);
    }
  }
  if (isAdvancedMode) {
    bindScoutingRecordMiniRadarShells();
    loadScoutingImportHistory();
  }
}
function getScoutingDatabaseVisibleRecordsForPanels() {
  const records = getFilteredScoutingDatabaseRecords();
  const apiPage = getScoutingDatabasePage();
  const databaseSource = normalizeScoutingText(getScoutingDatabase()?.source, 40);
  const isFootballScienceDb = databaseSource === "fsdb";
  const isPaged = databaseSource === "api" || databaseSource === "worker" || isFootballScienceDb;
  const pageOffset = isPaged ? apiPage?.offset || 0 : getScoutingDatabasePageOffset(records.length);
  const visibleRecords = isPaged
    ? records
    : records.slice(pageOffset, pageOffset + SCOUTING_DATABASE_PAGE_SIZE);
  return {
    records,
    visibleRecords,
  };
}
function updateScoutingDatabaseModeButtonsDom() {
  const advancedMode = isScoutingDatabaseAdvancedMode();
  ui.scoutingWorkspace?.querySelectorAll("[data-toggle-scouting-database-mode]")?.forEach((button) => {
    button.classList.toggle("is-open", advancedMode);
    button.setAttribute("aria-pressed", advancedMode ? "true" : "false");
    button.textContent = advancedMode ? "Advanced mode on" : "Advanced mode";
  });
}
function removeScoutingAdvancedDatabasePanels() {
  ui.scoutingWorkspace
    ?.querySelectorAll("[data-scouting-compare-set], [data-scouting-intelligence-brief], [data-scouting-action-queue], [data-scouting-market-radar]")
    ?.forEach((panel) => panel.remove());
}
function renderScoutingDatabaseIntelligenceBriefLite(records = [], state = ensureScoutingState(), totalCount = records.length) {
  const visibleRecords = records.slice(0, SCOUTING_ADVANCED_PANEL_RECORD_LIMIT);
  const minutesLeader = [...visibleRecords].sort((a, b) => getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a))[0] || null;
  const youngest = [...visibleRecords]
    .filter((record) => Number.isFinite(getScoutingRecordAge(record)))
    .sort((a, b) => getScoutingRecordAge(a) - getScoutingRecordAge(b))[0] || null;
  const compareRecord = getScoutingCompareRecordIds(state).map((recordId) => getScoutingStoredPlayerRecord(recordId, state)).filter(Boolean)[0] || null;
  const cards = [
    {
      tone: "opportunity",
      label: "Current view",
      title: `${Math.max(totalCount, records.length).toLocaleString("en-US")} players ready`,
      detail: `${visibleRecords.length.toLocaleString("en-US")} visible profiles in this database slice.`,
      record: visibleRecords[0] || null,
      action: visibleRecords[0] ? "Open" : "No action",
    },
    {
      tone: "opportunity",
      label: "Compare set",
      title: `${getScoutingCompareRecordIds(state).length}/5 selected`,
      detail: compareRecord ? `${getScoutingRecordName(compareRecord)} is available for comparison.` : "Add players from the list to start a compare read.",
      record: compareRecord,
      action: compareRecord ? "Open" : "No action",
    },
    {
      tone: "warning",
      label: "Minutes leader",
      title: minutesLeader ? getScoutingRecordName(minutesLeader) : "No minutes leader",
      detail: minutesLeader ? `${formatScoutingNumber(getScoutingRecordMinutes(minutesLeader))} minutes / ${getScoutingRecordTeam(minutesLeader) || "club n/a"}` : "No current page player data yet.",
      record: minutesLeader,
      action: minutesLeader ? "Open" : "No action",
    },
    {
      tone: "risk",
      label: "Young profile",
      title: youngest ? getScoutingRecordName(youngest) : "No age data",
      detail: youngest ? `${formatScoutingNumber(getScoutingRecordAge(youngest))} yrs / ${getScoutingRecordPosition(youngest) || "position n/a"}` : "Age metadata is missing in this slice.",
      record: youngest,
      action: youngest ? "Open" : "No action",
    },
  ];
  return `
    <section class="scouting-intelligence-brief" data-scouting-intelligence-brief>
      <div class="scouting-intelligence-brief-head">
        <span>Database intelligence brief</span>
        <strong>${escapeHtml(`${Math.max(totalCount, records.length).toLocaleString("en-US")} players in current view`)}</strong>
      </div>
      <div class="scouting-intelligence-brief-grid">
        ${cards
          .map((card) => {
            const recordId = card.record ? getScoutingRecordId(card.record) : "";
            return `
              <button type="button" class="is-${escapeHtml(card.tone)}" ${recordId ? `data-open-scouting-record="${escapeHtml(recordId)}"` : "disabled"}>
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.title)}</strong>
                <em>${escapeHtml(card.detail)}</em>
                <small>${escapeHtml(recordId ? card.action : "No action")}</small>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}
function renderScoutingDatabaseActionQueueLite(records = []) {
  const queue = records.slice(0, SCOUTING_ADVANCED_PANEL_RECORD_LIMIT).map((record) => ({
    record,
    recordId: getScoutingRecordId(record),
    minutes: getScoutingRecordMinutes(record),
    age: getScoutingRecordAge(record),
  })).filter((item) => item.recordId);
  return `
    <section class="scouting-action-queue" data-scouting-action-queue>
      <div class="scouting-action-queue-head">
        <div>
          <span>Scout action queue</span>
          <strong>${escapeHtml(queue.length ? `${queue.length} quick review${queue.length === 1 ? "" : "s"}` : "No quick reviews")}</strong>
        </div>
        <p>${escapeHtml(queue.length ? "Visible profiles are ready for scouting triage." : "Current view has no visible players yet.")}</p>
      </div>
      <div class="scouting-action-queue-list">
        ${
          queue.length
            ? queue
                .map(
                  (item) => `
                    <button type="button" class="is-watch" data-open-scouting-record="${escapeHtml(item.recordId)}">
                      <span>Open player review</span>
                      <strong>${escapeHtml(getScoutingRecordName(item.record))}</strong>
                      <em>${escapeHtml(`${getScoutingRecordPosition(item.record) || "Position n/a"} / ${getScoutingRecordTeam(item.record) || "club n/a"}`)}</em>
                      <small>${escapeHtml(`${formatScoutingNumber(item.minutes)} min${Number.isFinite(item.age) ? ` / ${formatScoutingNumber(item.age)} yrs` : ""}`)}</small>
                    </button>
                  `
                )
                .join("")
            : `<p class="scouting-muted">No visible players to review yet.</p>`
        }
      </div>
    </section>
  `;
}
function renderScoutingMarketRadarLite(records = [], state = ensureScoutingState()) {
  const visibleRecords = records.slice(0, SCOUTING_ADVANCED_PANEL_RECORD_LIMIT);
  const favorites = new Set(normalizeScoutingRecordIds(state.favoriteRecordIds));
  const watched = visibleRecords.find((record) => favorites.has(getScoutingRecordId(record))) || visibleRecords[0] || null;
  const cards = [
    { label: "Shortlist look", record: visibleRecords[0] || null, detail: (record) => getScoutingRecordPosition(record) || "Open profile" },
    { label: "Most minutes", record: [...visibleRecords].sort((a, b) => getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a))[0] || null, detail: (record) => `${formatScoutingNumber(getScoutingRecordMinutes(record))} min` },
    { label: "Youngest", record: [...visibleRecords].filter((record) => Number.isFinite(getScoutingRecordAge(record))).sort((a, b) => getScoutingRecordAge(a) - getScoutingRecordAge(b))[0] || null, detail: (record) => `${formatScoutingNumber(getScoutingRecordAge(record))} yrs` },
    { label: "Already on radar", record: watched, detail: (record) => (favorites.has(getScoutingRecordId(record)) ? "Favorite" : getScoutingRecordTeam(record) || "Review") },
  ].filter((card) => card.record);
  return `
    <section class="scouting-market-radar" data-scouting-market-radar>
      ${
        cards.length
          ? cards
              .map(
                (card) => `
                  <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(card.record))}">
                    <span>${escapeHtml(card.label)}</span>
                    <strong>${escapeHtml(getScoutingRecordName(card.record))}</strong>
                    <em>${escapeHtml(card.detail(card.record))}</em>
                  </button>
                `
              )
              .join("")
          : `<p class="scouting-muted">No market radar cards for this filter set yet.</p>`
      }
    </section>
  `;
}
function renderScoutingAdvancedDatabasePanelsMarkup(records = [], state = ensureScoutingState(), totalCount = records.length, options = {}) {
  if (options.lightweight) {
    return [
      renderScoutingCompareSetPanel(state),
      renderScoutingDatabaseIntelligenceBriefLite(records, state, totalCount),
      renderScoutingDatabaseActionQueueLite(records),
      renderScoutingMarketRadarLite(records, state),
    ].join("");
  }
  return [
    renderScoutingCompareSetPanel(state),
    renderScoutingDatabaseIntelligenceBrief(records, state, { totalCount }),
    renderScoutingDatabaseActionQueue(records, state),
    renderScoutingMarketRadar(records),
  ].join("");
}
function syncScoutingAdvancedDatabaseModeDom() {
  const root = ui.scoutingWorkspace;
  if (!root || ensureScoutingState().activeTab !== "database") {
    return false;
  }
  const recordTable = root.querySelector(".scouting-record-table");
  if (!recordTable) {
    return false;
  }
  updateScoutingDatabaseModeButtonsDom();
  removeScoutingAdvancedDatabasePanels();
  if (!isScoutingDatabaseAdvancedMode()) {
    return true;
  }
  const panelRecords = getScoutingDatabaseVisibleRecordsForPanels();
  recordTable.insertAdjacentHTML(
    "beforebegin",
    renderScoutingAdvancedDatabasePanelsMarkup(
      panelRecords.visibleRecords,
      ensureScoutingState(),
      panelRecords.records.length,
      { lightweight: true }
    )
  );
  bindScoutingRecordMiniRadarShells();
  loadScoutingImportHistory();
  return true;
}
function refreshScoutingDatabaseSurface(options = {}) {
  const state = ensureScoutingState();
  if (state.activeTab !== "database" || options.controls) {
    const updated = rerenderScoutingActiveContent({ preserveFocus: true });
    if (!updated) {
      renderScoutingWorkspace({ preserveFocus: true });
    }
    return;
  }
  renderScoutingDatabaseResults();
  refreshScoutingWorkspaceSummaryMetrics();
}
function syncScoutingAdvancedDatabaseFiltersDom() {
  const root = ui.scoutingWorkspace;
  const trigger = root?.querySelector("[data-toggle-scouting-advanced-filters]");
  const panel = root?.querySelector(".scouting-database-advanced-filters");
  if (!trigger || !panel) {
    return false;
  }
  const isOpen = getScoutingAdvancedDatabaseFiltersOpen();
  trigger.classList.toggle("is-open", isOpen);
  trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  panel.classList.toggle("is-open", isOpen);
  panel.hidden = !isOpen;
  return true;
}
function setScoutingAdvancedDatabaseFiltersOpen(open) {
  const nextOpen = Boolean(open);
  if (nextOpen === getScoutingAdvancedDatabaseFiltersOpen()) {
    return;
  }
  setScoutingAdvancedDatabaseFiltersOpenState(nextOpen);
  if (!nextOpen) {
    setScoutingDatabaseMetricFilterOpen(false);
  }
  if (!syncScoutingAdvancedDatabaseFiltersDom()) {
    refreshScoutingDatabaseSurface({ controls: true });
  }
}
function scheduleScoutingDatabaseRefresh() {
  const isApi = isScoutingApiDatabaseActive();
  const isWorker = isScoutingWorkerDatabaseActive();
  const isFootballScienceDb = isFootballScienceDbDatabaseActive();
  if (!isApi && !isWorker && !isFootballScienceDb) {
    scheduleScoutingDatabaseResultsRender();
    return;
  }
  window.clearTimeout(getScoutingDatabaseApiRefreshTimer());
  setScoutingDatabaseApiRefreshTimer(window.setTimeout(() => {
    setScoutingDatabaseApiRefreshTimer(0);
    const perf = startScoutingPerformance("database.refresh", {
      source: isFootballScienceDb ? "fsdb" : isApi ? "api" : "worker",
    });
    const refreshPromise = isFootballScienceDb
      ? loadFootballScienceDbDatabase()
      : isApi
      ? loadScoutingDatabaseWithApi()
      : requestScoutingDatabaseWorkerQuery({ timeoutMs: 15000 }).then((database) => {
          const appliedDatabase = applyScoutingWorkerDatabase(database);
          if (!appliedDatabase) {
            throw new Error("Scouting player database worker returned no records.");
          }
          return appliedDatabase;
        });
    refreshPromise
      .then(() => {
        perf.end({ status: "loaded" });
        if (ensureScoutingState().activeTab === "database") {
          renderScoutingDatabaseResults();
        }
      })
      .catch(() => {
        perf.end({ status: "fallback" });
        scheduleScoutingDatabaseResultsRender();
      });
  }, isApi || isFootballScienceDb ? 260 : 80));
}
function scheduleScoutingDatabaseResultsRender() {
  const frame = getScoutingDatabaseResultsFrame();
  if (frame) {
    cancelAnimationFrame(frame);
  }
  setScoutingDatabaseResultsFrame(requestAnimationFrame(() => {
    setScoutingDatabaseResultsFrame(0);
    const perf = startScoutingPerformance("database.results-render", {});
    renderScoutingDatabaseResults();
    perf.end();
  }));
}
function focusScoutingProfileModal() {
  const modal = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]");
  if (!modal || typeof modal.focus !== "function") {
    return;
  }
  if (modal.contains(document.activeElement) && document.activeElement?.matches?.("input, textarea, select, [contenteditable='true']")) {
    return;
  }
  try {
    modal.focus({ preventScroll: true });
  } catch {
    modal.focus();
  }
  if (document.activeElement !== modal) {
    focusScoutingElementWithoutScroll(modal);
  }
}
function shouldFocusScoutingProfileModal(recordId) {
  const id = normalizeScoutingText(recordId, 160);
  return Boolean(
    id &&
      scoutingPendingProfileFocusRecordId === id &&
      Date.now() <= scoutingPendingProfileFocusUntil
  );
}
function ensureScoutingProfileFocusObserver() {
  return;
}
function queueScoutingProfileModalFocus(recordId) {
  const targetId = normalizeScoutingText(recordId, 160);
  window.clearTimeout(scoutingProfileFocusTimer);
  const applyFocus = () => {
    if (ensureScoutingState().selectedRecordId !== targetId || !shouldFocusScoutingProfileModal(targetId)) {
      window.clearTimeout(scoutingProfileFocusTimer);
      scoutingProfileFocusTimer = 0;
      return;
    }
    focusScoutingProfileModal();
    scoutingProfileFocusTimer = 0;
    scoutingPendingProfileFocusRecordId = "";
    scoutingPendingProfileFocusUntil = 0;
  };
  scoutingProfileFocusTimer = window.setTimeout(applyFocus, 40);
}
function openScoutingRecordProfile(recordId) {
  const state = ensureScoutingState();
  const normalizedRecordId = normalizeScoutingText(recordId, 160);
  if (!normalizedRecordId) {
    return;
  }
  const modalExists = Boolean(ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]"));
  const isSamePlayer = state.selectedRecordId === normalizedRecordId;
  if (modalExists && isSamePlayer) {
    queueScoutingProfileModalFocus(normalizedRecordId);
    return;
  }
  state.selectedRecordId = normalizedRecordId;
  state.profileTab = "overview";
  state.profileRoleProfileId = "auto";
  state.profileSpiderSeasonMode = "latest";
  state.profileSpiderSeasonValue = "";
  scoutingPendingProfileFocusRecordId = state.selectedRecordId;
  scoutingPendingProfileFocusUntil = Date.now() + 1500;
  writeScoutingState({ syncCentral: false });
  ensureScoutingProfileFocusObserver();
  renderScoutingProfileModalIntoDom(state.selectedRecordId);
  focusScoutingProfileModal();
  queueScoutingProfileModalFocus(state.selectedRecordId);
  queueFootballScienceDbProfileHydration(state.selectedRecordId);
}
function closeScoutingRecordProfile() {
  const state = ensureScoutingState();
  state.selectedRecordId = "";
  writeScoutingState({ syncCentral: false });
  const backdrop = ui.scoutingWorkspace?.querySelector(".scouting-profile-backdrop");
  if (backdrop) {
    backdrop.remove();
    refreshScoutingWorkspaceSummaryMetrics();
    return;
  }
  renderScoutingWorkspace();
}
function toggleScoutingFavorite(recordId) {
  const perf = startScoutingPerformance("favorite.toggle", { recordId });
  const debugTimings = window.__footballScienceScoutingPerfDebug ? [] : null;
  const markDebugTiming = (label) => {
    if (debugTimings) {
      debugTimings.push({ label, at: performance.now() });
    }
  };
  markDebugTiming("start");
  if (!canEditScoutingWorkspace()) {
    perf.end({ status: "blocked" });
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    perf.end({ status: "empty" });
    return;
  }
  markDebugTiming("state-ready");
  const hasProfileModal = Boolean(ui.scoutingWorkspace?.querySelector("[data-scouting-profile-modal]"));
  const mutation = toggleScoutingFavoriteRecordId(state, id);
  if (!mutation.changed) {
    perf.end({ status: mutation.reason || "unchanged" });
    return;
  }
  markDebugTiming("favorite-state-updated");
  if (hasProfileModal) {
    updateScoutingFavoriteControls(id, state);
    markDebugTiming("favorite-controls-updated");
    refreshScoutingWorkspaceSummaryMetrics();
    markDebugTiming("summary-updated");
    const record = getScoutingRecordById(id);
    if (record) {
      rememberScoutingRecordSnapshot(record, state, { includeAnalysis: false });
    }
    writeScoutingState();
    markDebugTiming("state-written");
    if (debugTimings) {
      const base = debugTimings[0]?.at || 0;
      console.log(
        "[scouting-favorite-performance]",
        JSON.stringify(debugTimings.map((item) => ({ label: item.label, ms: Math.round(item.at - base) })))
      );
    }
    perf.end({ status: "profile-modal" });
    return;
  }
  const record = getScoutingRecordById(id);
  markDebugTiming("record-ready");
  if (record) {
    rememberScoutingRecordSnapshot(record, state);
  }
  markDebugTiming("snapshot-ready");
  writeScoutingState();
  markDebugTiming("state-written");
  refreshScoutingWorkspaceAfterLocalMutation({ preserveFocus: true });
  markDebugTiming("workspace-refreshed");
  if (debugTimings) {
    const base = debugTimings[0]?.at || 0;
    console.log(
      "[scouting-favorite-performance]",
      JSON.stringify(debugTimings.map((item) => ({ label: item.label, ms: Math.round(item.at - base) })))
    );
  }
  perf.end({ status: "updated" });
}
function updateScoutingFavoriteControls(recordId, state = ensureScoutingState()) {
  const id = normalizeScoutingText(recordId, 160);
  const favorite = state.favoriteRecordIds.includes(id);
  Array.from(ui.scoutingWorkspace?.querySelectorAll("[data-toggle-scouting-favorite]") || [])
    .filter((button) => button.getAttribute("data-toggle-scouting-favorite") === id)
    .forEach((button) => {
      button.classList.toggle("is-active", favorite);
      button.setAttribute("aria-pressed", favorite ? "true" : "false");
      if (button.classList.contains("scouting-profile-favorite-star")) {
        button.innerHTML = `<span aria-hidden="true">★</span><span class="scouting-sr-only">${favorite ? "Favorited" : "Favorite"}</span>`;
      } else {
        const usesLabel = /favorite/i.test(button.textContent || "");
        button.textContent = usesLabel ? (favorite ? "Favorited" : "Favorite") : favorite ? "★" : "☆";
      }
      if (button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", favorite ? "Remove favorite" : "Favorite player");
      }
    });
}
function getScoutingListsActions() {
  if (scoutingListsActions) {
    return scoutingListsActions;
  }
  scoutingListsActions = createScoutingListsActions({
    canEdit: canEditScoutingWorkspace,
    confirm: (message) => window.confirm(message),
    ensureState: ensureScoutingState,
    getRecordById: getScoutingRecordById,
    normalizeText: normalizeScoutingText,
    refreshWorkspaceAfterLocalMutation: refreshScoutingWorkspaceAfterLocalMutation,
    rememberRecordSnapshot: rememberScoutingRecordSnapshot,
    startPerformance: startScoutingPerformance,
    writeState: writeScoutingState,
  });
  return scoutingListsActions;
}
function addScoutingRecordToShadow(recordId, slotId) {
  const perf = startScoutingPerformance("shadow.add", { recordId, slotId });
  if (!canEditScoutingWorkspace()) {
    perf.end({ status: "blocked" });
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  const record = getScoutingRecordById(id);
  const slot =
    getScoutingShadowSlot(slotId) ||
    getScoutingShadowSlot(state.shadowXi?.selectedSlotId) ||
    getScoutingShadowSlot(preferredScoutingShadowSlotId) ||
    scoutingShadowSlots[0];
  if (!id || !slot) {
    perf.end({ status: "empty" });
    return;
  }
  if (record) {
    rememberScoutingRecordSnapshot(record, state, { includeAnalysis: true });
  }
  const currentRecordIds = getScoutingShadowSlotRecordIds(slot.id, state);
  const mutation = addScoutingRecordIdToShadowSlot(state, {
    recordId: id,
    slotId: slot.id,
    meta: {
      ...getScoutingShadowRecordMeta(slot.id, id, state),
      tag: getScoutingRecordAge(record) <= 23 ? "u23" : currentRecordIds.length ? "backup" : "first-choice",
      playerName: record ? getScoutingRecordName(record) : "",
      team: record ? getScoutingRecordTeam(record) : "",
      league: record ? getScoutingRecordLeague(record) : "",
      season: record ? getScoutingRecordSeason(record) : "",
      position: record ? normalizeScoutingText(record?.[scoutingRecordIndex.position], 120) : "",
      updatedAt: new Date().toISOString(),
    },
  });
  if (!mutation.changed) {
    perf.end({ status: mutation.reason || "unchanged" });
    return;
  }
  preferredScoutingShadowSlotId = slot.id;
  writeScoutingState();
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: state.activeTab === "database" }, id);
  perf.end({ status: "updated", slot: slot.id });
}
function canSendScoutingRecordToTransferRoom() {
  return typeof activeContext?.sendToTransferRoom === "function" && activeContext.canSendToTransferRoom?.() === true;
}
function sendScoutingRecordToTransferRoom(recordId) {
  if (!canSendScoutingRecordToTransferRoom()) {
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return;
  }
  const record = getScoutingStoredPlayerRecord(id, state);
  const snapshot = record ? rememberScoutingRecordSnapshot(record, state, { includeAnalysis: true }) : getScoutingRecordSnapshot(id, state);
  if (!snapshot) {
    return;
  }
  activeContext.sendToTransferRoom(snapshot, {
    source: "scouting",
    recordId: snapshot.recordId,
  });
  writeScoutingState();
}
function removeScoutingRecordFromShadow(recordId, slotId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const mutation = removeScoutingRecordIdFromShadowSlot(state, { recordId, slotId });
  if (!mutation.changed) {
    return;
  }
  preferredScoutingShadowSlotId = mutation.slotId;
  writeScoutingState();
  refreshScoutingWorkspaceAfterShadowMutation({ preserveFocus: true }, mutation.recordId);
}
export function render(context) {
  setScoutingContext(context);
  renderScoutingWorkspace();
}
export function renderAnalysisRoom(context) {
  setScoutingContext(context);
  renderScoutingAnalysisRoomWorkspace();
}
export function openRecord(recordId, context = activeContext) {
  if (context) {
    setScoutingContext(context);
  }
  openScoutingRecordProfile(recordId);
}
function getScoutingEventDeps() {
  if (scoutingEventDeps) {
    return scoutingEventDeps;
  }
  const listsActions = getScoutingListsActions();
  const myTeamActions = getScoutingMyTeamActions();
  // Keep entries as functions or live-state closures; direct values would become stale.
  scoutingEventDeps = {
    addComparisonPlayer: addScoutingComparisonPlayer,
    addRecordToList: listsActions.addRecordToList,
    addRecordToShadow: addScoutingRecordToShadow,
    addRoleModelMetricFromPicker: addScoutingRoleModelMetricFromPicker,
    applyImportDraft: applyScoutingImportDraft,
    applyImportSourcePreset: applyScoutingImportSourcePreset,
    applyPresetView: applyScoutingPresetView,
    applySavedView: applyScoutingSavedView,
    assignMyTeamPlayerToSlot: myTeamActions.assignPlayerToSlot,
    canEdit: canEditScoutingWorkspace,
    clearCompareSet: clearScoutingCompareSet,
    clearImportedDatabase: clearScoutingImportedDatabase,
    clearShadowSlotSelection: clearScoutingShadowSlotSelection,
    closeRecordProfile: closeScoutingRecordProfile,
    closeReportBuilder: closeScoutingReportBuilder,
    closeRoleModels: closeScoutingRoleModels,
    closeSavedViews: closeScoutingSavedViews,
    closeSettingsPanel: closeScoutingSettingsPanel,
    collapseReportsPanel: collapseScoutingReportsPanel,
    createCompareSetReport: createScoutingCompareSetReport,
    createContactLogEntry: createScoutingContactLogEntry,
    createList: listsActions.createList,
    createReport: createScoutingReport,
    createReportForRecord: createScoutingReportForRecord,
    createReportFromForm: createScoutingReportFromForm,
    createRoleModel: createScoutingRoleModel,
    createSavedView: createScoutingSavedView,
    createShadowBoard: createScoutingShadowBoard,
    deleteContactLogEntry: deleteScoutingContactLogEntry,
    deleteList: listsActions.deleteList,
    deleteReport: deleteScoutingReport,
    deleteSavedView: deleteScoutingSavedView,
    ensureState: ensureScoutingState,
    expandReportsPanel: expandScoutingReportsPanel,
    getAdvancedFiltersOpen: getScoutingAdvancedDatabaseFiltersOpen,
    getComparisonCandidatesOpen: () => scoutingComparisonCandidatesOpen,
    getComparisonLab: getScoutingComparisonLab,
    getComparisonMetricMenuOpen: () => scoutingComparisonMetricMenuOpen,
    getComparisonPlayerSearchQuery: () => scoutingComparisonPlayerSearchQuery,
    getMyTeamSelectedPlayerId: () => scoutingMyTeamSelectedPlayerId,
    getOppositionContext: getScoutingOppositionContext,
    getOppositionLatestSnapshot: () => scoutingOppositionLatestSnapshot,
    getOppositionReportText: getScoutingOppositionReportText,
    getOpenRecordActionMenuId: () => scoutingOpenRecordActionMenuId,
    getWorkspaceRoot: () => ui.scoutingWorkspace,
    handleModuleClick: handleScoutingModuleClick,
    hydrateFootballScienceDbProfileDetails,
    isAdvancedDatabaseMode: isScoutingDatabaseAdvancedMode,
    isDatabaseLoaded: isScoutingDatabaseLoaded,
    loadImportFile: loadScoutingImportFile,
    loadImportHistory: loadScoutingImportHistory,
    moveShadowRecord: moveScoutingShadowRecord,
    normalizeDatabaseFilters: normalizeScoutingDatabaseFilters,
    normalizeTargetPriority: normalizeScoutingTargetPriority,
    normalizeTargetStatus: normalizeScoutingTargetStatus,
    normalizeText: normalizeScoutingText,
    openFootballScienceDbProfileFromQueue,
    openReportBuilder: openScoutingReportBuilder,
    openRecordProfile: openScoutingRecordProfile,
    openRoleModels: openScoutingRoleModels,
    openSavedViews: openScoutingSavedViews,
    openSettingsPanel: openScoutingSettingsPanel,
    printProfileReport: printScoutingProfileReport,
    queueComparisonPlayerSearch: queueScoutingComparisonPlayerSearch,
    queueDatabaseLoad: queueScoutingDatabaseLoad,
    queueFootballScienceDbQualityLoad,
    refreshDatabaseSurface: refreshScoutingDatabaseSurface,
    removeComparisonPlayer: removeScoutingComparisonPlayer,
    removeMyTeamPlayerFromSlot: myTeamActions.removePlayerFromSlot,
    removeRecordFromShadow: removeScoutingRecordFromShadow,
    removeRoleModel: removeScoutingRoleModel,
    removeTarget: removeScoutingTarget,
    renderActiveTabSurfaceOrWorkspace: renderScoutingActiveTabSurfaceOrWorkspace,
    renderComparisonWorkspace: renderScoutingComparisonWorkspace,
    renderWorkspace: renderScoutingWorkspace,
    requestSignIn: requestScoutingSignIn,
    resetRangeFilter: resetScoutingRangeFilter,
    rollbackImport: rollbackScoutingImport,
    saveMarketInfo: saveScoutingMarketInfo,
    saveTarget: saveScoutingTarget,
    scheduleDatabaseFilterRefresh: scheduleScoutingDatabaseFilterRefresh,
    selectShadowSlot: selectScoutingShadowSlot,
    setActiveShadowBoard: setScoutingActiveShadowBoard,
    setActiveTab: setScoutingActiveTab,
    setAdvancedDatabaseMode: setScoutingDatabaseAdvancedMode,
    setAdvancedFiltersOpen: setScoutingAdvancedDatabaseFiltersOpen,
    setComparisonCandidatesOpen: (open) => {
      scoutingComparisonCandidatesOpen = Boolean(open);
    },
    setComparisonLab: setScoutingComparisonLab,
    setComparisonMetricFilterQuery: (query) => {
      scoutingComparisonMetricFilterQuery = query;
    },
    setComparisonMetricMenuOpen: (open) => {
      scoutingComparisonMetricMenuOpen = Boolean(open);
    },
    setDatabaseError: (message) => {
      scoutingDatabaseError = message || "";
    },
    setDatabaseFilter: setScoutingDatabaseFilter,
    setDatabaseMetricFilterOpen: setScoutingDatabaseMetricFilterOpen,
    setDatabaseMetricFilterQuery: setScoutingDatabaseMetricFilterQuery,
    setDatabasePageCursor: setScoutingDatabasePageCursor,
    setDatabasePageNumber: setScoutingDatabasePageNumber,
    setDatabasePageOffset: setScoutingDatabasePageOffset,
    setDatabaseSearchDraft: setScoutingDatabaseSearchDraft,
    setImportDraftFailure: setScoutingImportDraftFailure,
    setImportDraftPatch: setScoutingImportDraftPatch,
    setImportMapField: setScoutingImportMapField,
    setMyTeamFormation: myTeamActions.setFormation,
    setMyTeamSelectedPlayerId: (playerId) => {
      scoutingMyTeamSelectedPlayerId = playerId || "";
    },
    setOppositionFilters: setScoutingOppositionFilters,
    setOpenRecordActionMenuId: (recordId) => {
      scoutingOpenRecordActionMenuId = normalizeScoutingText(recordId, 160);
    },
    setProfileRoleProfile: setScoutingProfileRoleProfile,
    setProfileSpiderSeason: setScoutingProfileSpiderSeason,
    setProfileTab: setScoutingProfileTab,
    setReportBuilderOpen: (open) => {
      scoutingReportBuilderOpen = Boolean(open);
    },
    setRoleModelMetricRowSelected: setScoutingRoleModelMetricRowSelected,
    setSavedViewNameDraft: (value) => {
      scoutingSavedViewNameDraft = value;
    },
    setSavedViewsOpen: (open) => {
      scoutingSavedViewsOpen = Boolean(open);
    },
    setShadowBoardVisibility: setScoutingShadowBoardVisibility,
    setShadowFavoriteSearchQuery: (query) => {
      scoutingShadowFavoriteSearchQuery = query;
    },
    setShadowFormation: setScoutingShadowFormation,
    setShadowRecordMeta: setScoutingShadowRecordMeta,
    toggleCompareRecord: toggleScoutingCompareRecord,
    toggleFavorite: toggleScoutingFavorite,
    toggleRecordQuickView: toggleScoutingRecordQuickView,
    updateImportSeasonDraft: (value) => {
      if (scoutingImportDraft) {
        scoutingImportDraft = {
          ...scoutingImportDraft,
          seasonOverride: value,
          importPreview: null,
        };
      }
    },
    updateRangeFilterDisplay: updateScoutingRangeFilterDisplay,
    updateTarget: updateScoutingTarget,
  };
  return scoutingEventDeps;
}
export function handleClick(event, context) {
  setScoutingContext(context);
  handleScoutingWorkspaceClick(event, getScoutingEventDeps());
}
export function handleInput(event, context) {
  setScoutingContext(context);
  handleScoutingModuleInput(event, getScoutingEventDeps());
}
export function handleChange(event, context) {
  setScoutingContext(context);
  handleScoutingModuleChange(event, getScoutingEventDeps());
}
export function handleSubmit(event, context) {
  setScoutingContext(context);
  handleScoutingModuleSubmit(event, getScoutingEventDeps());
}
