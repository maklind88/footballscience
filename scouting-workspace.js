let activeContext = null;
let scoutingTabs = [];
let scoutingShadowSlots = [];
let scoutingCoreMetricOptions = [];
let scoutingStatusOptions = [];
let scoutingPriorityOptions = [];
let scoutingDatabaseLoadPromise = null;
let scoutingDatabaseError = "";
let scoutingDatabaseOptionCache = null;
let scoutingPercentileCache = new Map();
let scoutingMetricAliasCache = new Map();
let scoutingRoleProfileCache = new Map();
let scoutingMetricIndexCache = { database: null, byId: new Map() };
let preferredScoutingShadowSlotId = "";
let scoutingDatabaseResultsFrame = 0;
let scoutingImportedDatabaseLoaded = false;
let scoutingImportDraft = null;
let scoutingImportParserPromise = null;
let scoutingDragState = null;
let scoutingOppositionFilters = { team: "", season: "all", minMinutes: 450 };
let scoutingOppositionLatestSnapshot = null;
const scoutingImportedDatabaseStorageKey = "football-scouting-imported-database-v1";
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
function setScoutingContext(context) {
  activeContext = context;
  scoutingTabs = context.tabs || [];
  scoutingShadowSlots = context.shadowSlots || [];
  scoutingCoreMetricOptions = context.coreMetricOptions || [];
  scoutingStatusOptions = context.scoutingStatusOptions || scoutingStatusFallbackOptions;
  scoutingPriorityOptions = context.scoutingPriorityOptions || scoutingPriorityFallbackOptions;
}
function ensureScoutingState() {
  return activeContext.ensureState();
}
function writeScoutingState(options = {}) {
  return activeContext.writeState(options);
}
function canEditScoutingWorkspace() {
  return activeContext.canEdit();
}
function escapeHtml(value) {
  return activeContext.escapeHtml(value);
}
function normalizeScoutingText(value, maxLength = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
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
function resetScoutingComputedCaches() {
  scoutingPercentileCache = new Map();
  scoutingMetricAliasCache = new Map();
  scoutingRoleProfileCache = new Map();
  scoutingMetricIndexCache = { database: null, byId: new Map() };
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
function normalizeScoutingDatabaseFilters(filters = {}) {
  const minMinutes = Number(filters.minMinutes);
  return {
    query: normalizeScoutingText(filters.query, 120),
    league: normalizeScoutingText(filters.league, 120) || "all",
    season: normalizeScoutingText(filters.season, 80) || "all",
    position: normalizeScoutingText(filters.position, 40) || "all",
    minMinutes: Number.isFinite(minMinutes) && minMinutes >= 0 ? Math.round(minMinutes) : 450,
    maxAge: normalizeScoutingText(filters.maxAge, 12),
    metricId: normalizeScoutingText(filters.metricId, 120) || "all",
    metricMin: normalizeScoutingText(filters.metricMin, 12),
    roleProfileId: normalizeScoutingRoleProfileId(filters.roleProfileId, "all"),
    benchmarkMode: normalizeScoutingBenchmarkMode(filters.benchmarkMode),
    roleFitMin: normalizeScoutingText(filters.roleFitMin, 12),
    signalMode: normalizeScoutingText(filters.signalMode, 40) || "all",
    marketStatus: normalizeScoutingText(filters.marketStatus, 40) || "all",
    sortMetricId: normalizeScoutingText(filters.sortMetricId, 120) || "minutes",
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
    return importedDatabase;
  }
  const database = window.__footballScienceScoutingDatabase;
  return database && Array.isArray(database.records) && Array.isArray(database.metrics) ? database : null;
}
function isScoutingDatabaseLoaded() {
  return Boolean(getScoutingDatabase());
}
function ensureScoutingDatabaseLoaded() {
  const existingDatabase = getScoutingDatabase();
  if (existingDatabase) {
    return Promise.resolve(existingDatabase);
  }
  if (!scoutingDatabaseLoadPromise) {
    scoutingDatabaseError = "";
    scoutingDatabaseLoadPromise = platformModuleLoader
      .loadScript("scouting-import-data", "scouting-import-data.js", {
        id: "scoutingImportDataScript",
        required: true,
        async: true,
      })
      .then(() => {
        const database = getScoutingDatabase();
        if (!database) {
          throw new Error("Scouting database did not register on window.");
        }
        scoutingDatabaseOptionCache = null;
        resetScoutingComputedCaches();
        return database;
      })
      .catch((error) => {
        scoutingDatabaseLoadPromise = null;
        scoutingDatabaseError = "Scouting database could not be loaded.";
        throw error;
      });
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
  const slotId = normalizeScoutingText(value.slotId, 40);
  return {
    slotId,
    playerIds: [playerIds[0] || "", playerIds[1] || "", playerIds[2] || "", playerIds[3] || ""],
    metricId: metricId || "minutes",
  };
}
function getScoutingComparisonLab(state = ensureScoutingState()) {
  return normalizeScoutingComparisonLab(state.comparisonLab);
}
function setScoutingComparisonLab(patch = {}) {
  const state = ensureScoutingState();
  state.comparisonLab = {
    ...normalizeScoutingComparisonLab(state.comparisonLab),
    ...normalizeScoutingComparisonLab(patch),
  };
  writeScoutingState();
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
  }
  writeScoutingState();
  renderScoutingWorkspace({ preserveFocus: true });
}
function deleteScoutingContactLogEntry(contactId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const id = normalizeScoutingText(contactId, 120);
  const state = ensureScoutingState();
  state.contactLog = getScoutingContactLog(state).filter((entry) => entry.id !== id);
  writeScoutingState();
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
function getScoutingRecordTeam(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.team], 160);
}
function getScoutingRecordLeague(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.league], 160);
}
function getScoutingRecordSeason(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.season], 80);
}
function getScoutingRecordPosition(record) {
  return normalizeScoutingText(record?.[scoutingRecordIndex.position], 80);
}
function getScoutingRecordAge(record) {
  const value = Number(record?.[scoutingRecordIndex.age]);
  return Number.isFinite(value) ? value : null;
}
function getScoutingRecordMinutes(record) {
  const value = Number(record?.[scoutingRecordIndex.minutes]);
  return Number.isFinite(value) ? value : 0;
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
  const metrics = record[scoutingRecordIndex.metrics];
  const rawValue = Array.isArray(metrics)
    ? metrics[getScoutingMetricIndex(id)]
    : metrics && typeof metrics === "object"
      ? metrics[id]
      : null;
  const value = rawValue === null || rawValue === undefined || rawValue === "" ? NaN : Number(rawValue);
  return Number.isFinite(value) ? value : null;
}
function getScoutingRecordMetricValueCount(record) {
  const metrics = record?.[scoutingRecordIndex.metrics];
  const values = Array.isArray(metrics) ? metrics : Object.values(metrics || {});
  return values.filter((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))).length;
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
  const leagues = new Set();
  const seasons = new Set();
  const positions = new Set();
  for (const record of database?.records || []) {
    const league = getScoutingRecordLeague(record);
    const season = getScoutingRecordSeason(record);
    if (league) {
      leagues.add(league);
    }
    if (season) {
      seasons.add(season);
    }
    getScoutingPositionTokens(record).forEach((token) => positions.add(token));
  }
  scoutingDatabaseOptionCache = {
    leagues: [...leagues].sort((a, b) => a.localeCompare(b)),
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
    matches: findScoutingImportHeader(headers, ["matches", "apps", "appearances"]),
    minutes: findScoutingImportHeader(headers, ["minutes", "mins", "played"]),
    birthCountry: findScoutingImportHeader(headers, ["birth country", "country of birth"]),
    passportCountry: findScoutingImportHeader(headers, ["passport", "nationality"]),
    height: findScoutingImportHeader(headers, ["height"]),
    weight: findScoutingImportHeader(headers, ["weight"]),
  };
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
async function loadScoutingImportFile(file) {
  if (!file) {
    return;
  }
  scoutingImportDraft = {
    status: "loading",
    fileName: normalizeScoutingText(file.name, 180),
    error: "",
  };
  renderScoutingWorkspace({ preserveFocus: true });
  try {
    await ensureScoutingSpreadsheetParserLoaded();
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheets = workbook.SheetNames.map((sheetName) => {
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
    const selectedSheet = sheets[0]?.name || "";
    const selected = sheets.find((sheet) => sheet.name === selectedSheet);
    scoutingImportDraft = {
      status: "ready",
      fileName: normalizeScoutingText(file.name, 180),
      sheets,
      selectedSheet,
      seasonOverride: "",
      map: getScoutingImportAutoMap(selected?.headers || []),
      error: "",
    };
  } catch (error) {
    scoutingImportDraft = {
      status: "error",
      fileName: normalizeScoutingText(file.name, 180),
      error: error?.message || "Import failed.",
    };
  }
  renderScoutingWorkspace({ preserveFocus: true });
}
function setScoutingImportDraftPatch(patch = {}) {
  if (!scoutingImportDraft) {
    return;
  }
  scoutingImportDraft = {
    ...scoutingImportDraft,
    ...patch,
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
    map: {
      ...(scoutingImportDraft.map || {}),
      [field]: normalizeScoutingText(value, 120),
    },
  };
}
function getScoutingImportMetricHeaders(headers = [], map = {}) {
  const coreHeaders = new Set(Object.values(map).filter(Boolean));
  return headers.filter((header) => !coreHeaders.has(header));
}
function getScoutingImportMetricDirection(header = "") {
  const label = normalizeScoutingText(header, 120).toLowerCase();
  return /(against|conceded|lost|errors|fouls|cards|turnovers|losses)/.test(label) ? "lower" : "higher";
}
function buildScoutingImportedDatabase() {
  if (!scoutingImportDraft || scoutingImportDraft.status !== "ready") {
    return null;
  }
  const selected = scoutingImportDraft.sheets.find((sheet) => sheet.name === scoutingImportDraft.selectedSheet);
  if (!selected) {
    return null;
  }
  const map = scoutingImportDraft.map || {};
  const metricHeaders = getScoutingImportMetricHeaders(selected.headers, map);
  const metrics = metricHeaders
    .map((header) => ({
      id: `import_${getScoutingImportColumnId(header)}`,
      label: normalizeScoutingText(header, 120),
      direction: getScoutingImportMetricDirection(header),
    }))
    .filter((metric, index, values) => metric.label && values.findIndex((item) => item.id === metric.id) === index);
  const records = selected.rows
    .map((row, index) => {
      const player = normalizeScoutingText(row[map.player], 160);
      const team = normalizeScoutingText(row[map.team], 160);
      const season = normalizeScoutingText(scoutingImportDraft.seasonOverride || row[map.season], 80);
      const position = normalizeScoutingText(row[map.position], 80);
      if (!player && !team && !position) {
        return null;
      }
      const metricValues = {};
      for (const metric of metrics) {
        const header = metric.label;
        const value = Number(String(row[header] ?? "").replace(",", ".").replace(/[^0-9.+-]/g, ""));
        if (Number.isFinite(value)) {
          metricValues[metric.id] = value;
        }
      }
      const idBits = [player, team, season, position, index].map((value) => getScoutingImportColumnId(value)).join("-");
      return [
        `import-${idBits}`,
        player,
        team,
        team,
        normalizeScoutingText(row[map.league], 160),
        season,
        position,
        Number(row[map.age]) || "",
        Number(row[map.matches]) || "",
        Number(row[map.minutes]) || 0,
        normalizeScoutingText(row[map.birthCountry], 120),
        normalizeScoutingText(row[map.passportCountry], 120),
        normalizeScoutingText(row[map.height], 40),
        normalizeScoutingText(row[map.weight], 40),
        metricValues,
      ];
    })
    .filter(Boolean);
  return {
    source: "ui-import",
    fileName: scoutingImportDraft.fileName,
    importedAt: new Date().toISOString(),
    sheets: [selected.name],
    metrics,
    records,
  };
}
function applyScoutingImportDraft() {
  const database = buildScoutingImportedDatabase();
  if (!database?.records?.length) {
    scoutingImportDraft = {
      ...(scoutingImportDraft || {}),
      status: "error",
      error: "No importable player rows found. Check column mapping.",
    };
    renderScoutingWorkspace({ preserveFocus: true });
    return;
  }
  window.__footballScienceImportedScoutingDatabase = database;
  scoutingDatabaseOptionCache = null;
  resetScoutingComputedCaches();
  try {
    window.localStorage?.setItem(scoutingImportedDatabaseStorageKey, JSON.stringify(database));
  } catch {}
  scoutingImportDraft = {
    ...scoutingImportDraft,
    status: "imported",
    importedCount: database.records.length,
    metricCount: database.metrics.length,
  };
  renderScoutingWorkspace();
}
function clearScoutingImportedDatabase() {
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
function getScoutingRecordById(recordId) {
  const id = normalizeScoutingText(recordId, 160);
  return (getScoutingDatabase()?.records || []).find((record) => getScoutingRecordId(record) === id) || null;
}
function getScoutingRecordsForPlayer(record) {
  const name = getScoutingRecordName(record).toLowerCase();
  if (!name) {
    return [];
  }
  return (getScoutingDatabase()?.records || [])
    .filter((candidate) => getScoutingRecordName(candidate).toLowerCase() === name)
    .sort((a, b) => getScoutingRecordSeason(b).localeCompare(getScoutingRecordSeason(a)) || getScoutingRecordMinutes(b) - getScoutingRecordMinutes(a));
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
  const nextTarget = createScoutingTarget(record, {
    ...target,
    ...patch,
    updatedAt: normalizeScoutingText(patch.updatedAt, 40) || new Date().toISOString(),
  });
  state.targets = getScoutingTargets(state).map((entry) => (entry.id === target.id ? nextTarget : entry));
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
function getScoutingRoleModelMatchScore(record, model) {
  const metric = getScoutingMetric(model?.metricId);
  if (!metric) {
    return 0;
  }
  const metricPercentile = getScoutingPercentile(record, metric.id);
  const minPercentile = Number(model?.minPercentile);
  if (!Number.isFinite(minPercentile) || !Number.isFinite(metricPercentile)) {
    return 0;
  }
  return metricPercentile >= minPercentile ? Math.max(0, metricPercentile - minPercentile) : 0;
}
function getScoutingRoleModelCandidates(model) {
  if (!model) {
    return [];
  }
  const slot = getScoutingSlotById(model.slotId) || getScoutingSlotById(scoutingShadowSlots[0]?.id || "");
  if (!slot) {
    return [];
  }
  const metric = getScoutingMetric(model.metricId);
  if (!metric) {
    return [];
  }
  return (getScoutingDatabase()?.records || [])
    .filter((record) => getScoutingPositionTokens(record).includes(slot.position) || getScoutingPositionTokens(record).includes(slot.label))
    .map((record) => ({
      record,
      score: getScoutingRoleModelMatchScore(record, model),
      percentile: getScoutingPercentile(record, metric.id),
      fit: getScoutingRoleFitScore(record),
    }))
    .filter((entry) => Number.isFinite(entry.percentile))
    .sort((a, b) => (b.percentile - a.percentile) * 2 + (b.fit || 0) - (a.fit || 0));
}
function createScoutingRoleModel(model = {}) {
  const now = new Date().toISOString();
  const slot = getScoutingSlotById(model.slotId) || scoutingShadowSlots[0];
  const metric = getScoutingMetric(model.metricId) || getScoutingMetricOptions()[0];
  const nextModel = {
    id: normalizeScoutingText(model.id, 120) || `scouting-role-model-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: normalizeScoutingText(model.name, 120) || "Role model",
    slotId: normalizeScoutingText(slot?.id, 40),
    metricId: normalizeScoutingText(metric?.id, 120) || "minutes",
    minPercentile: Number.isFinite(Number(model.minPercentile)) ? Math.max(1, Math.min(99, Math.round(Number(model.minPercentile)))) : 60,
    notes: normalizeScoutingText(model.notes, 900),
    createdAt: now,
    updatedAt: now,
  };
  const state = ensureScoutingState();
  state.roleModels = [nextModel, ...getScoutingRoleModels(state).filter((entry) => entry.name).filter((entry) => entry.id !== nextModel.id)];
  writeScoutingState();
  renderScoutingWorkspace();
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
function getScoutingDirectionalPercentile(record, metricId, desiredDirection = "higher", benchmarkMode = getScoutingActiveBenchmarkMode()) {
  const direction = normalizeScoutingText(desiredDirection, 20).toLowerCase();
  if (direction === "metric") {
    return getScoutingPercentile(record, metricId);
  }
  const rawPercentile = getScoutingRawPercentile(record, metricId, benchmarkMode);
  if (!Number.isFinite(rawPercentile)) {
    return null;
  }
  return direction === "lower" ? Math.max(1, Math.min(99, 101 - rawPercentile)) : rawPercentile;
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
function getFilteredScoutingDatabaseRecords() {
  const database = getScoutingDatabase();
  const state = ensureScoutingState();
  const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
  const query = filters.query.toLowerCase();
  const minMinutes = Number(filters.minMinutes) || 0;
  const maxAge = Number(filters.maxAge);
  const metricMin = Number(filters.metricMin);
  const roleFitMin = Number(filters.roleFitMin);
  const metricFilterId = filters.metricId !== "all" ? filters.metricId : "";
  const roleProfileId = filters.roleProfileId !== "all" ? filters.roleProfileId : "";
  const sortMetricId = filters.sortMetricId || metricFilterId || "minutes";
  const signalMode = filters.signalMode || "all";
  const marketStatus = filters.marketStatus || "all";
  const selectedRoleProfile = roleProfileId ? getScoutingRoleProfileById(roleProfileId) : null;
  const needsRoleFit =
    Boolean(roleProfileId) ||
    (Number.isFinite(roleFitMin) && roleFitMin > 0) ||
    ["priority", "breakout", "value"].includes(signalMode) ||
    sortMetricId === "role-fit";
  const favoriteIds = new Set(normalizeScoutingRecordIds(state.favoriteRecordIds));
  const pipelineIds = new Set(getScoutingTargetedRecordIds(state));
  const shadowIds = new Set(getScoutingAllShadowRecordIds(state));
  return [...(database?.records || [])]
    .filter((record) => {
      const recordId = getScoutingRecordId(record);
      if (selectedRoleProfile && !selectedRoleProfile.groups.includes(getScoutingPositionGroup(record))) {
        return false;
      }
      if (filters.league !== "all" && getScoutingRecordLeague(record) !== filters.league) {
        return false;
      }
      if (filters.season !== "all" && getScoutingRecordSeason(record) !== filters.season) {
        return false;
      }
      if (filters.position !== "all" && !getScoutingPositionTokens(record).includes(filters.position.toUpperCase())) {
        return false;
      }
      if (getScoutingRecordMinutes(record) < minMinutes) {
        return false;
      }
      if (Number.isFinite(maxAge) && maxAge > 0) {
        const age = getScoutingRecordAge(record);
        if (!Number.isFinite(age) || age > maxAge) {
          return false;
        }
      }
      const roleFitScore = needsRoleFit ? getScoutingRoleFitScore(record, roleProfileId) : null;
      if (metricFilterId && Number.isFinite(metricMin) && metricMin > 0) {
        const percentile = getScoutingPercentile(record, metricFilterId);
        if (!Number.isFinite(percentile) || percentile < metricMin) {
          return false;
        }
      }
      if (Number.isFinite(roleFitMin) && roleFitMin > 0 && (!Number.isFinite(roleFitScore) || roleFitScore < roleFitMin)) {
        return false;
      }
      if (signalMode === "priority" && (!Number.isFinite(roleFitScore) || roleFitScore < 82)) {
        return false;
      }
      if (signalMode === "breakout") {
        const age = getScoutingRecordAge(record);
        if (!Number.isFinite(age) || age > 23 || !Number.isFinite(roleFitScore) || roleFitScore < 70) {
          return false;
        }
      }
      if (signalMode === "value" && (!Number.isFinite(roleFitScore) || roleFitScore < 70 || getScoutingRecordMinutes(record) > 1600)) {
        return false;
      }
      if (signalMode === "favorites" && !favoriteIds.has(recordId)) {
        return false;
      }
      if (signalMode === "pipeline" && !pipelineIds.has(recordId)) {
        return false;
      }
      if (signalMode === "shadow" && !shadowIds.has(recordId)) {
        return false;
      }
      if (marketStatus !== "all") {
        const marketInfo = getScoutingMarketInfo(recordId, state);
        if (marketStatus === "budgeted") {
          if (!marketInfo.estimatedFee && !marketInfo.salaryRange && !marketInfo.budgetImpact) {
            return false;
          }
        } else if (marketStatus === "high-probability") {
          if (!isScoutingHighDealProbability(marketInfo.dealProbability)) {
            return false;
          }
        } else if (marketInfo.contractStatus !== marketStatus) {
          return false;
        }
      }
      if (!query) {
        return true;
      }
      return [
        getScoutingRecordName(record),
        getScoutingRecordTeam(record),
        getScoutingRecordLeague(record),
        getScoutingRecordSeason(record),
        getScoutingRecordPosition(record),
        query ? getScoutingRoleLabelsForGroup(record).join(" ") : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (sortMetricId === "role-fit") {
        return (getScoutingRoleFitScore(b, roleProfileId) || 0) - (getScoutingRoleFitScore(a, roleProfileId) || 0);
      }
      const metric = getScoutingMetric(sortMetricId);
      if (!metric || sortMetricId === "minutes" || sortMetricId === "matches") {
        return (getScoutingMetricValue(b, sortMetricId) || 0) - (getScoutingMetricValue(a, sortMetricId) || 0);
      }
      return (getScoutingPercentile(b, sortMetricId) || 0) - (getScoutingPercentile(a, sortMetricId) || 0);
    });
}
const scoutingRoleSpiderProfiles = Object.freeze([
  {
    id: "wide-winger-dribbler",
    label: "Wide winger - dribbler",
    description: "Wants to receive wide, run at defenders and create separation with carries.",
    groups: ["WING"],
    axes: [
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Dribble volume", labels: ["dribbles-per-90", "Dribbles per 90"] },
      { label: "Dribble win", labels: ["successful-dribbles", "Successful dribbles"] },
      { label: "Acceleration", labels: ["accelerations-per-90", "Accelerations per 90"] },
      { label: "Box threat", labels: ["touches-in-box-per-90", "Touches in box per 90"] },
      { label: "xA", labels: ["xa-per-90", "xA per 90", "xA"] },
    ],
  },
  {
    id: "cb-ball-carrier",
    label: "Ball-carrying centre-back",
    description: "Can step into midfield, carry past first pressure and attack the next line.",
    groups: ["CB"],
    axes: [
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Dribble volume", labels: ["dribbles-per-90", "Dribbles per 90"] },
      { label: "Dribble win", labels: ["successful-dribbles", "Successful dribbles"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Prog passing", labels: ["progressive-passes-per-90", "Progressive passes per 90"] },
    ],
  },
  {
    id: "cb-playmaker",
    label: "Playing centre-back",
    description: "High-volume short build-up defender with clean circulation and final-third access.",
    groups: ["CB"],
    axes: [
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Prog passes", labels: ["progressive-passes-per-90", "Progressive passes per 90"] },
      { label: "Final 3rd", labels: ["accurate-passes-to-final-third", "Accurate passes to final third"] },
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
    ],
  },
  {
    id: "cb-aerial",
    label: "Aerial centre-back",
    description: "Dominates aerial volume and turns box defending into reliable first contacts.",
    groups: ["CB"],
    axes: [
      { label: "Aerial volume", labels: ["aerial-duels-per-90", "Aerial duels per 90"] },
      { label: "Aerial win", labels: ["aerial-duels-won", "Aerial duels won"] },
      { label: "Def duel win", labels: ["defensive-duels-won", "Defensive duels won"] },
      { label: "Blocks", labels: ["shots-blocked-per-90", "Shots blocked per 90"] },
      { label: "Head goals", labels: ["head-goals-per-90", "Head goals per 90"] },
    ],
  },
  {
    id: "aggressive-defender",
    label: "Aggressive ball-winner",
    description: "Steps out, duels early, intercepts and accepts card-risk as part of pressure.",
    groups: ["CB", "FB", "MID"],
    axes: [
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "PAdj ints", labels: ["padj-interceptions", "PAdj Interceptions"] },
      { label: "Interceptions", labels: ["interceptions-per-90", "Interceptions per 90"] },
      { label: "Def duels", labels: ["defensive-duels-per-90", "Defensive duels per 90"] },
      { label: "Cards edge", labels: ["yellow-cards-per-90", "Yellow cards per 90"], direction: "higher" },
    ],
  },
  {
    id: "running-fullback",
    label: "Running fullback",
    description: "Gets up and down, progresses by runs, crosses and still carries defensive load.",
    groups: ["FB"],
    axes: [
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Cross volume", labels: ["crosses-per-90", "Crosses per 90"] },
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "Off actions", labels: ["successful-attacking-actions-per-90", "Successful attacking actions per 90"] },
      { label: "Acceleration", labels: ["accelerations-per-90", "Accelerations per 90"] },
    ],
  },
  {
    id: "creative-fullback",
    label: "Creative fullback",
    description: "Connects possession, receives often and creates final-third access from wide zones.",
    groups: ["FB"],
    axes: [
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Key passes", labels: ["key-passes-per-90", "Key passes per 90"] },
      { label: "Final 3rd", labels: ["passes-to-final-third-per-90", "Passes to final third per 90"] },
      { label: "xA", labels: ["xa-per-90", "xA per 90", "xA"] },
      { label: "Shot assists", labels: ["shot-assists-per-90", "Shot assists per 90"] },
    ],
  },
  {
    id: "cm-playmaker",
    label: "Playing central midfielder",
    description: "Dictates tempo with high receive/pass volume, progression and creative lanes.",
    groups: ["MID"],
    axes: [
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Prog passes", labels: ["progressive-passes-per-90", "Progressive passes per 90"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Creativity", labels: ["through-passes-per-90", "Through passes per 90", "smart-passes-per-90", "Smart passes per 90", "xa-per-90"] },
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
    ],
  },
  {
    id: "cm-worker",
    label: "Hard-working central midfielder",
    description: "Covers ground defensively, duels, blocks and breaks opposition possession.",
    groups: ["MID"],
    axes: [
      { label: "Def duels", labels: ["defensive-duels-per-90", "Defensive duels per 90"] },
      { label: "Def duel win", labels: ["defensive-duels-won", "Defensive duels won"] },
      { label: "PAdj ints", labels: ["padj-interceptions", "PAdj Interceptions"] },
      { label: "Blocks", labels: ["shots-blocked-per-90", "Shots blocked per 90"] },
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
    ],
  },
  {
    id: "target-forward",
    label: "Target forward",
    description: "Can be found directly, pins centre-backs, attacks crosses and owns box volume.",
    groups: ["CF"],
    axes: [
      { label: "Long receives", labels: ["received-long-passes-per-90", "Received long passes per 90"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Head goals", labels: ["head-goals-per-90", "Head goals per 90"] },
      { label: "Layoffs", labels: ["back-passes-per-90", "Back passes per 90"] },
      { label: "Shots", labels: ["shots-per-90", "Shots per 90"] },
      { label: "Box touches", labels: ["touches-in-box-per-90", "Touches in box per 90"] },
    ],
  },
  {
    id: "forward-playmaker",
    label: "Playmaking forward",
    description: "Links attacks, receives under pressure, dribbles and creates for runners.",
    groups: ["CF"],
    axes: [
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Key passes", labels: ["key-passes-per-90", "Key passes per 90"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Dribbling", labels: ["dribbles-per-90", "Dribbles per 90"] },
      { label: "xA", labels: ["xa-per-90", "xA per 90"] },
      { label: "Smart pass", labels: ["smart-passes-per-90", "Smart passes per 90"] },
    ],
  },
  {
    id: "gk-aerial",
    label: "Aerial goalkeeper",
    description: "Controls the air, claims space and reduces chaos before shots arrive.",
    groups: ["GK"],
    axes: [
      { label: "Exits", labels: ["exits-per-90", "Exits per 90"] },
      { label: "Aerial volume", labels: ["aerial-duels-per-90", "Aerial duels per 90"] },
      { label: "Aerial win", labels: ["aerial-duels-won", "Aerial duels won"] },
      { label: "Save rate", labels: ["save-rate", "Save rate"] },
      { label: "Prevention", labels: ["prevented-goals-per-90", "Prevented goals per 90", "prevented-goals"] },
    ],
  },
  {
    id: "gk-playmaker",
    label: "Playing goalkeeper",
    description: "Shorter build-up goalkeeper with repeatable passing accuracy and circulation.",
    groups: ["GK"],
    axes: [
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Back-pass use", labels: ["back-passes-received-as-gk-per-90", "Back passes received as GK per 90"] },
      { label: "Long accuracy", labels: ["accurate-long-passes", "Accurate long passes"] },
    ],
  },
]);
const scoutingFallbackSpiderProfiles = Object.freeze({
  GK: {
    id: "gk-general",
    label: "Goalkeeper profile",
    description: "General goalkeeper spider from available shot-stopping and distribution metrics.",
    axes: [
      { label: "Save rate", labels: ["save-rate", "Save rate"] },
      { label: "Prevention", labels: ["prevented-goals-per-90", "Prevented goals per 90", "prevented-goals"] },
      { label: "Exits", labels: ["exits-per-90", "Exits per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
    ],
  },
  OTHER: {
    id: "general-player",
    label: "General player profile",
    description: "Fallback spider from broad possession, progression and duel metrics.",
    axes: [
      { label: "Minutes", labels: ["minutes", "Minutes"] },
      { label: "Duels", labels: ["duels-won", "Duels won"] },
      { label: "Passing", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Progression", labels: ["progressive-passes-per-90", "Progressive passes per 90", "progressive-runs-per-90"] },
      { label: "Creation", labels: ["xa-per-90", "xA per 90", "shot-assists-per-90"] },
    ],
  },
});
const scoutingAdditionalRoleSpiderProfiles = Object.freeze([
  {
    id: "gk-shot-stopper",
    label: "Shot-Stopping Goalkeeper",
    description: "Primary value comes from saves, goal prevention and reliable penalty-box shot management.",
    groups: ["GK"],
    axes: [
      { label: "Save rate", labels: ["save-rate", "Save rate"] },
      { label: "Prevention", labels: ["prevented-goals-per-90", "Prevented goals per 90", "prevented-goals"] },
      { label: "Clean sheets", labels: ["clean-sheets", "Clean sheets"] },
      { label: "Shots faced", labels: ["shots-against-per-90", "Shots against per 90"], direction: "higher" },
      { label: "Conceded", labels: ["conceded-goals-per-90", "Conceded goals per 90"], direction: "lower" },
    ],
  },
  {
    id: "gk-sweeper-keeper",
    label: "Sweeper Keeper",
    description: "Controls space behind the back line and offers an extra possession outlet.",
    groups: ["GK"],
    axes: [
      { label: "Exits", labels: ["exits-per-90", "Exits per 90"] },
      { label: "Back-pass use", labels: ["back-passes-received-as-gk-per-90", "Back passes received as GK per 90"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
    ],
  },
  {
    id: "cb-no-nonsense",
    label: "No-Nonsense Centre-Back",
    description: "Defends first, clears danger and wins high-leverage defensive contacts.",
    groups: ["CB"],
    axes: [
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "Aerial volume", labels: ["aerial-duels-per-90", "Aerial duels per 90"] },
      { label: "Aerial win", labels: ["aerial-duels-won", "Aerial duels won"] },
      { label: "Blocks", labels: ["shots-blocked-per-90", "Shots blocked per 90"] },
      { label: "Interceptions", labels: ["interceptions-per-90", "Interceptions per 90"] },
    ],
  },
  {
    id: "cb-cover-defender",
    label: "Cover Defender",
    description: "Reads depth, covers space, intercepts and protects the line without excessive fouls.",
    groups: ["CB"],
    axes: [
      { label: "Interceptions", labels: ["interceptions-per-90", "Interceptions per 90"] },
      { label: "PAdj ints", labels: ["padj-interceptions", "PAdj Interceptions"] },
      { label: "Def duel win", labels: ["defensive-duels-won", "Defensive duels won"] },
      { label: "Foul control", labels: ["fouls-per-90", "Fouls per 90"], direction: "lower" },
      { label: "Pass security", labels: ["accurate-passes", "Accurate passes"] },
    ],
  },
  {
    id: "cb-wide-centre-back",
    label: "Wide Centre-Back",
    description: "Can defend wide channels and progress play from an outside centre-back lane.",
    groups: ["CB", "FB"],
    axes: [
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Prog passes", labels: ["progressive-passes-per-90", "Progressive passes per 90"] },
      { label: "Final 3rd", labels: ["passes-to-final-third-per-90", "Passes to final third per 90"] },
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
    ],
  },
  {
    id: "fb-defensive-fullback",
    label: "Defensive Fullback",
    description: "Locks down wide areas and prioritises duels, interceptions and defensive security.",
    groups: ["FB"],
    axes: [
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "Def duels", labels: ["defensive-duels-per-90", "Defensive duels per 90"] },
      { label: "Def duel win", labels: ["defensive-duels-won", "Defensive duels won"] },
      { label: "Interceptions", labels: ["interceptions-per-90", "Interceptions per 90"] },
      { label: "Foul control", labels: ["fouls-per-90", "Fouls per 90"], direction: "lower" },
    ],
  },
  {
    id: "fb-inverted-fullback",
    label: "Inverted Fullback",
    description: "Moves inside to connect possession, combine short and progress from central lanes.",
    groups: ["FB"],
    axes: [
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Prog passes", labels: ["progressive-passes-per-90", "Progressive passes per 90"] },
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
    ],
  },
  {
    id: "fb-overlap-fullback",
    label: "Overlap Fullback",
    description: "Attacks outside lanes with repeated runs, crosses and final-third width.",
    groups: ["FB"],
    axes: [
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Cross volume", labels: ["crosses-per-90", "Crosses per 90"] },
      { label: "Cross accuracy", labels: ["accurate-crosses", "Accurate crosses"] },
      { label: "Acceleration", labels: ["accelerations-per-90", "Accelerations per 90"] },
      { label: "Deep crosses", labels: ["deep-completed-crosses-per-90", "Deep completed crosses per 90"] },
    ],
  },
  {
    id: "mid-holding-midfielder",
    label: "Holding Midfielder",
    description: "Protects the defensive line while providing secure circulation in possession.",
    groups: ["MID"],
    axes: [
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "Interceptions", labels: ["interceptions-per-90", "Interceptions per 90"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
    ],
  },
  {
    id: "mid-deep-lying-playmaker",
    label: "Deep-Lying Playmaker",
    description: "Build-up organiser who dictates tempo and breaks lines from deeper midfield zones.",
    groups: ["MID"],
    axes: [
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Prog passes", labels: ["progressive-passes-per-90", "Progressive passes per 90"] },
      { label: "Final 3rd", labels: ["passes-to-final-third-per-90", "Passes to final third per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Through balls", labels: ["through-passes-per-90", "Through passes per 90"] },
    ],
  },
  {
    id: "mid-box-to-box",
    label: "Box-to-Box Midfielder",
    description: "Two-way runner who contributes to ball-winning, carrying and late final-third actions.",
    groups: ["MID"],
    axes: [
      { label: "Def duels", labels: ["defensive-duels-per-90", "Defensive duels per 90"] },
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Box touches", labels: ["touches-in-box-per-90", "Touches in box per 90"] },
      { label: "Shots", labels: ["shots-per-90", "Shots per 90"] },
    ],
  },
  {
    id: "mid-advanced-playmaker",
    label: "Advanced Playmaker",
    description: "Occupies pockets, creates chances and supplies runners between the lines.",
    groups: ["MID"],
    axes: [
      { label: "Key passes", labels: ["key-passes-per-90", "Key passes per 90"] },
      { label: "xA", labels: ["xa-per-90", "xA per 90"] },
      { label: "Smart pass", labels: ["smart-passes-per-90", "Smart passes per 90"] },
      { label: "Through balls", labels: ["through-passes-per-90", "Through passes per 90"] },
      { label: "Penalty area", labels: ["passes-to-penalty-area-per-90", "Passes to penalty area per 90"] },
    ],
  },
  {
    id: "mid-press-resistant",
    label: "Press-Resistant Midfielder",
    description: "Receives under pressure, survives contact and keeps possession moving safely.",
    groups: ["MID"],
    axes: [
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Dribble win", labels: ["successful-dribbles", "Successful dribbles"] },
      { label: "Fouls won", labels: ["fouls-suffered-per-90", "Fouls suffered per 90"], direction: "higher" },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
    ],
  },
  {
    id: "mid-connector",
    label: "Connector",
    description: "Links phases with repeat receives, short passing and low-risk tempo control.",
    groups: ["MID", "FB"],
    axes: [
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Accuracy", labels: ["accurate-passes", "Accurate passes"] },
      { label: "Short volume", labels: ["short-medium-passes-per-90", "Short / medium passes per 90"] },
      { label: "Short game", labels: ["average-pass-length-m", "Average pass length"], direction: "lower" },
    ],
  },
  {
    id: "wing-inside-forward",
    label: "Inside Forward",
    description: "Wide forward who moves inside to shoot, attack the box and score from high-value zones.",
    groups: ["WING", "CF"],
    axes: [
      { label: "Shots", labels: ["shots-per-90", "Shots per 90"] },
      { label: "xG", labels: ["xg-per-90", "xG per 90"] },
      { label: "Box touches", labels: ["touches-in-box-per-90", "Touches in box per 90"] },
      { label: "Dribbling", labels: ["dribbles-per-90", "Dribbles per 90"] },
      { label: "Non-pen goals", labels: ["non-penalty-goals-per-90", "Non-penalty goals per 90"] },
    ],
  },
  {
    id: "wing-touchline-winger",
    label: "Touchline Winger",
    description: "Holds width, attacks the outside lane and creates from crosses or cutbacks.",
    groups: ["WING"],
    axes: [
      { label: "Cross volume", labels: ["crosses-per-90", "Crosses per 90"] },
      { label: "Cross accuracy", labels: ["accurate-crosses", "Accurate crosses"] },
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Dribbles", labels: ["dribbles-per-90", "Dribbles per 90"] },
      { label: "Key passes", labels: ["key-passes-per-90", "Key passes per 90"] },
    ],
  },
  {
    id: "wing-wide-playmaker",
    label: "Wide Playmaker",
    description: "Creates from wide or half-space positions through passing, xA and final-third access.",
    groups: ["WING", "MID"],
    axes: [
      { label: "xA", labels: ["xa-per-90", "xA per 90"] },
      { label: "Key passes", labels: ["key-passes-per-90", "Key passes per 90"] },
      { label: "Smart pass", labels: ["smart-passes-per-90", "Smart passes per 90"] },
      { label: "Final 3rd", labels: ["passes-to-final-third-per-90", "Passes to final third per 90"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
    ],
  },
  {
    id: "wing-pressing-winger",
    label: "High-Pressing Winger",
    description: "Defensive wide forward who presses, duels and turns pressure into regain threat.",
    groups: ["WING"],
    axes: [
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "Def duels", labels: ["defensive-duels-per-90", "Defensive duels per 90"] },
      { label: "Interceptions", labels: ["interceptions-per-90", "Interceptions per 90"] },
      { label: "Acceleration", labels: ["accelerations-per-90", "Accelerations per 90"] },
      { label: "Off actions", labels: ["successful-attacking-actions-per-90", "Successful attacking actions per 90"] },
    ],
  },
  {
    id: "fw-poacher",
    label: "Poacher",
    description: "Penalty-box striker whose profile is driven by shots, xG and finishing actions.",
    groups: ["CF"],
    axes: [
      { label: "Goals", labels: ["goals-per-90", "Goals per 90"] },
      { label: "xG", labels: ["xg-per-90", "xG per 90"] },
      { label: "Shots", labels: ["shots-per-90", "Shots per 90"] },
      { label: "Box touches", labels: ["touches-in-box-per-90", "Touches in box per 90"] },
      { label: "Conversion", labels: ["goal-conversion", "Goal conversion"] },
    ],
  },
  {
    id: "fw-pressing-forward",
    label: "Pressing Forward",
    description: "Forward who leads pressure while still supplying shot and box threat.",
    groups: ["CF", "WING"],
    axes: [
      { label: "Def actions", labels: ["successful-defensive-actions-per-90", "Successful defensive actions per 90"] },
      { label: "Def duels", labels: ["defensive-duels-per-90", "Defensive duels per 90"] },
      { label: "Interceptions", labels: ["interceptions-per-90", "Interceptions per 90"] },
      { label: "Shots", labels: ["shots-per-90", "Shots per 90"] },
      { label: "Acceleration", labels: ["accelerations-per-90", "Accelerations per 90"] },
    ],
  },
  {
    id: "fw-mobile-striker",
    label: "Mobile Striker",
    description: "Dynamic striker who attacks channels, receives direct passes and threatens in transition.",
    groups: ["CF"],
    axes: [
      { label: "Prog runs", labels: ["progressive-runs-per-90", "Progressive runs per 90"] },
      { label: "Acceleration", labels: ["accelerations-per-90", "Accelerations per 90"] },
      { label: "Long receives", labels: ["received-long-passes-per-90", "Received long passes per 90"] },
      { label: "Shots", labels: ["shots-per-90", "Shots per 90"] },
      { label: "Dribbling", labels: ["dribbles-per-90", "Dribbles per 90"] },
    ],
  },
  {
    id: "fw-complete-forward",
    label: "Complete Forward",
    description: "Blends goal threat, link play, dribbling and chance creation into one front-line profile.",
    groups: ["CF"],
    axes: [
      { label: "Shots", labels: ["shots-per-90", "Shots per 90"] },
      { label: "xG", labels: ["xg-per-90", "xG per 90"] },
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Key passes", labels: ["key-passes-per-90", "Key passes per 90"] },
      { label: "Dribbling", labels: ["successful-dribbles", "Successful dribbles"] },
    ],
  },
  {
    id: "fw-false-nine",
    label: "False Nine",
    description: "Drops from the front line to receive, connect and create for runners.",
    groups: ["CF", "MID"],
    axes: [
      { label: "Receives", labels: ["received-passes-per-90", "Received passes per 90"] },
      { label: "Pass volume", labels: ["passes-per-90", "Passes per 90"] },
      { label: "Key passes", labels: ["key-passes-per-90", "Key passes per 90"] },
      { label: "xA", labels: ["xa-per-90", "xA per 90"] },
      { label: "Layoffs", labels: ["back-passes-per-90", "Back passes per 90"] },
    ],
  },
]);
function getScoutingRoleSpiderProfiles() {
  return [...scoutingRoleSpiderProfiles, ...scoutingAdditionalRoleSpiderProfiles];
}
function getScoutingRoleProfileById(profileId) {
  const id = normalizeScoutingText(profileId, 120);
  return getScoutingRoleSpiderProfiles().find((profile) => profile.id === id) || null;
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
  return getScoutingRoleProfileById(normalized) ? normalized : fallback;
}
function renderScoutingRoleProfileOptions(selectedValue = "all", options = {}) {
  const selected = normalizeScoutingRoleProfileId(selectedValue, options.auto ? "auto" : "all");
  const groups = [
    ["GK", "Goalkeepers"],
    ["CB", "Centre-backs"],
    ["FB", "Fullbacks / wingbacks"],
    ["MID", "Midfielders"],
    ["WING", "Wingers / wide forwards"],
    ["CF", "Forwards"],
  ];
  const allProfiles = getScoutingRoleSpiderProfiles();
  return `
    ${options.auto ? `<option value="auto" ${selected === "auto" ? "selected" : ""}>Auto best role</option>` : `<option value="all" ${selected === "all" ? "selected" : ""}>Auto best role</option>`}
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
  const axes = (profile.axes || [])
    .map((item) => {
      const metricId = getScoutingMetricIdByLabels(item.labels);
      if (!metricId || used.has(metricId)) {
        return null;
      }
      used.add(metricId);
      return { ...item, metricId };
    })
    .filter(Boolean);
  const percentiles = axes
    .map((item) => getScoutingTemplatePercentile(record, item, benchmarkMode))
    .filter((value) => Number.isFinite(value));
  if (percentiles.length < 3) {
    scoutingRoleProfileCache.set(cacheKey, null);
    return null;
  }
  axes.profileId = profile.id;
  axes.profileLabel = profile.label;
  axes.profileDescription = profile.description;
  axes.profileCoverage = percentiles.length / Math.max((profile.axes || []).length, 1);
  axes.profileScore = Math.round(percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length);
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
  if (explicitProfile && explicitProfile.groups.includes(getScoutingPositionGroup(record))) {
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
  const metricRows = (template || [])
    .map((item) => ({
      item,
      metric: getScoutingMetric(item.metricId),
      value: getScoutingMetricValue(record, item.metricId),
      percentile: getScoutingTemplatePercentile(record, item),
    }))
    .filter((row) => row.metric && Number.isFinite(row.percentile));
  const strengths = [...metricRows].sort((a, b) => b.percentile - a.percentile).slice(0, 3);
  const watch = [...metricRows].sort((a, b) => a.percentile - b.percentile).slice(0, 2);
  return {
    title: template.profileLabel || "Role profile",
    summary: strengths.length
      ? `Profiles as ${template.profileLabel || "this role"} because the strongest role signals are ${strengths.map((row) => `${row.item.label} (P${row.percentile})`).join(", ")}.`
      : "Not enough comparable role signals yet.",
    strengths,
    watch,
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
            .map((row) => `<strong>${escapeHtml(row.item.label)} P${escapeHtml(row.percentile)}</strong>`)
            .join("")}
        </article>
        <article>
          <span>Watch points</span>
          ${explanation.watch
            .map((row) => `<strong>${escapeHtml(row.item.label)} P${escapeHtml(row.percentile)}</strong>`)
            .join("")}
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
function renderScoutingRadar(record, roleProfileId = "") {
  const template = getScoutingRadarTemplate(record, roleProfileId);
  if (!template.length) {
    return `<div class="scouting-radar-empty">No comparable metric profile yet.</div>`;
  }
  const center = 110;
  const radius = 74;
  const angleOffset = -Math.PI / 2;
  const points = template.map((item, index) => {
    const percentile = getScoutingTemplatePercentile(record, item) || 1;
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
      <div class="scouting-radar-head">
        <span>Role spider</span>
        <strong>${escapeHtml(template.profileLabel || "Player profile")}</strong>
        ${template.profileDescription ? `<small>${escapeHtml(template.profileDescription)}</small>` : ""}
      </div>
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
function renderScoutingTabButton(tab) {
  const active = ensureScoutingState().activeTab === tab.id;
  return `
    <button type="button" class="scouting-tab${active ? " is-active" : ""}" data-scouting-tab="${escapeHtml(tab.id)}">
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
  return getScoutingShadowSlotRecordIds(slotId, state).map(getScoutingRecordById).filter(Boolean);
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
  };
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
  renderScoutingWorkspace({ preserveFocus: true });
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
  renderScoutingWorkspace({ preserveFocus: true });
}
function reorderScoutingShadowRecord(slotId, recordId, beforeRecordId = "") {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const slot = getScoutingShadowSlot(slotId);
  const id = normalizeScoutingText(recordId, 160);
  const beforeId = normalizeScoutingText(beforeRecordId, 160);
  const current = slot ? getScoutingShadowSlotRecordIds(slot.id, state) : [];
  if (!slot || !current.includes(id)) {
    return;
  }
  const next = current.filter((item) => item !== id);
  const beforeIndex = beforeId ? next.indexOf(beforeId) : -1;
  next.splice(beforeIndex >= 0 ? beforeIndex : next.length, 0, id);
  state.shadowXi.slots = {
    ...state.shadowXi.slots,
    [slot.id]: next,
  };
  state.shadowXi.selectedSlotId = slot.id;
  preferredScoutingShadowSlotId = slot.id;
  writeScoutingState();
  renderScoutingWorkspace({ preserveFocus: true });
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
  root.querySelectorAll("[data-scouting-drag-shadow-record]").forEach((element) => {
    element.draggable = true;
    element.ondragstart = (event) => {
      scoutingDragState = {
        type: "shadow",
        recordId: element.dataset.scoutingDragShadowRecord,
        slotId: element.dataset.scoutingShadowSlot,
      };
      event.dataTransfer?.setData("text/plain", JSON.stringify(scoutingDragState));
      event.dataTransfer?.setDragImage?.(element, 12, 12);
    };
  });
  root.querySelectorAll("[data-scouting-shadow-drop-slot], [data-scouting-shadow-drop-before]").forEach((element) => {
    element.ondragover = (event) => {
      if (scoutingDragState?.type === "shadow") {
        event.preventDefault();
      }
    };
    element.ondrop = (event) => {
      if (scoutingDragState?.type !== "shadow") {
        return;
      }
      event.preventDefault();
      reorderScoutingShadowRecord(
        element.dataset.scoutingShadowDropSlot || scoutingDragState.slotId,
        scoutingDragState.recordId,
        element.dataset.scoutingShadowDropBefore || ""
      );
      scoutingDragState = null;
    };
  });
  root.querySelectorAll("[data-scouting-drag-target]").forEach((element) => {
    element.draggable = true;
    element.ondragstart = (event) => {
      scoutingDragState = {
        type: "target",
        targetId: element.dataset.scoutingDragTarget,
      };
      event.dataTransfer?.setData("text/plain", JSON.stringify(scoutingDragState));
      event.dataTransfer?.setDragImage?.(element, 12, 12);
    };
  });
  root.querySelectorAll("[data-scouting-target-drop-status]").forEach((element) => {
    element.ondragover = (event) => {
      if (scoutingDragState?.type === "target") {
        event.preventDefault();
      }
    };
    element.ondrop = (event) => {
      if (scoutingDragState?.type !== "target") {
        return;
      }
      event.preventDefault();
      setScoutingTargetStatusByDrag(scoutingDragState.targetId, element.dataset.scoutingTargetDropStatus);
      scoutingDragState = null;
    };
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
  const percentiles = template
    .map((item) => getScoutingTemplatePercentile(record, item))
    .filter((value) => Number.isFinite(value));
  if (!percentiles.length) {
    return null;
  }
  return Math.round(percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length);
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
function getScoutingBestSignal(record) {
  return getScoutingMetricOptions()
    .map((metric) => ({
      metric,
      value: getScoutingMetricValue(record, metric.id),
      percentile: getScoutingPercentile(record, metric.id),
    }))
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.percentile))
    .sort((a, b) => b.percentile - a.percentile)[0] || null;
}
function getScoutingAllShadowRecordIds(state = ensureScoutingState()) {
  return normalizeScoutingRecordIds(scoutingShadowSlots.flatMap((slot) => getScoutingShadowSlotRecordIds(slot.id, state)));
}
function getScoutingDecisionLensOptions() {
  return [
    { value: "all", label: "All players" },
    { value: "priority", label: "Priority fits P82+" },
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
      id: "value-cases",
      name: "Value Cases",
      filters: { signalMode: "value", roleFitMin: "70" },
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
  const roleFitScore = getScoutingRoleFitScore(record);
  const bestSignal = getScoutingBestSignal(record);
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
    signal: bestSignal ? `${bestSignal.metric.label} P${bestSignal.percentile}` : "No standout signal yet",
  };
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
  return (getScoutingDatabase()?.records || [])
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
function renderScoutingNextActionCenter(state) {
  const targets = getScoutingTargets(state);
  const urgentTargets = targets
    .map((target) => ({ target, record: getScoutingTargetRecord(target) }))
    .filter((item) => item.record && ["urgent", "high"].includes(item.target.priority))
    .slice(0, 3);
  const queueRows = getScoutingGlobalRecruitmentQueue(state, 4);
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
        <h2>${escapeHtml(queueRows[0] ? getScoutingRecordName(queueRows[0].record) : "None")}</h2>
        <p>${escapeHtml(queueRows[0] ? `${queueRows[0].slot.label} / P${queueRows[0].fit}` : "Add filters or load database recommendations.")}</p>
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
            : `<p class="scouting-muted">Build the Shadow XI and pipeline to unlock next actions.</p>`
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
  const candidatePool = records.slice(0, 160).map((record) => ({
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
function renderScoutingProfileDossier(record, state, playerRows) {
  const recommendation = getScoutingProfileRecommendation(record, state);
  const seasonInsights = getScoutingSeasonInsights(record, playerRows);
  const comparablePlayers = getScoutingComparablePlayers(record, 4);
  return `
    <section class="scouting-profile-dossier">
      <article class="scouting-action-card is-primary">
        <span>Recommended next action</span>
        <strong>${escapeHtml(recommendation.action)}</strong>
        <p>${escapeHtml(recommendation.question)}</p>
      </article>
      <article class="scouting-action-card">
        <span>Pipeline status</span>
        <strong>${escapeHtml(recommendation.status)}</strong>
        <p>${escapeHtml(recommendation.signal)}</p>
      </article>
      <article class="scouting-action-card">
        <span>Risk read</span>
        <strong>${escapeHtml(seasonInsights.reliability)}</strong>
        <p>${escapeHtml(recommendation.risk)}</p>
      </article>
      <article class="scouting-action-card">
        <span>Season trajectory</span>
        <strong>${escapeHtml(seasonInsights.trendLabel)}</strong>
        <p>${escapeHtml(`Best: ${seasonInsights.bestSeason}. Seasons: ${seasonInsights.seasonCount}.`)}</p>
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
  return {
    segment,
    urgency,
    availability,
    negotiationAngle,
    checks,
    saved,
    completeness: getScoutingMarketCompleteness(saved),
    bestSignal: bestSignal ? `${bestSignal.metric.label} P${bestSignal.percentile}` : "No standout signal",
  };
}
function getScoutingProfileReportDraft(record, state = ensureScoutingState()) {
  const playerRows = getScoutingRecordsForPlayer(record).slice(0, 10);
  const recommendation = getScoutingProfileRecommendation(record, state);
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
  }
  const roleFit = getScoutingRoleFitScore(record);
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
        ${market.checks.map((check) => `<p>${escapeHtml(check)}</p>`).join("")}
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
          Create report draft
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
  state.profileTab = normalizeScoutingProfileTab(tabId);
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace({ preserveFocus: true });
}
function setScoutingProfileRoleProfile(roleProfileId) {
  const state = ensureScoutingState();
  state.profileRoleProfileId = normalizeScoutingRoleProfileId(roleProfileId, "auto");
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace({ preserveFocus: true });
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
                        ${canEdit ? `<button type="button" data-delete-scouting-contact="${escapeHtml(entry.id)}">x</button>` : ""}
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
    .map((player, index) => {
      const name = normalizeScoutingText(player.name || player.player || player.playerName || player.fullName || player.displayName, 160);
      const position = normalizeScoutingText(player.position || player.primaryPosition || player.role || player.positions, 80);
      const ratingValue = Number(player.rating ?? player.overall ?? player.score ?? player.currentAbility ?? player.performanceScore);
      const ageValue = Number(player.age);
      const id = normalizeScoutingText(player.id || player.playerId || `${name}-${position}-${index}`, 160);
      return {
        id,
        name,
        position,
        team: normalizeScoutingText(player.team || player.club || player.squad || "Current squad", 120),
        age: Number.isFinite(ageValue) ? ageValue : null,
        rating: Number.isFinite(ratingValue) ? Math.max(1, Math.min(99, ratingValue <= 5 ? ratingValue * 20 : ratingValue)) : null,
        status: normalizeScoutingText(player.status || player.availability || player.squadStatus, 80),
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
      <h3>Season and club history</h3>
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
function renderScoutingComparisonRadarOverlay(playerRecords) {
  const records = playerRecords.map(({ record }) => record).filter(Boolean).slice(0, 4);
  if (records.length < 2) {
    return "";
  }
  const template = getScoutingRadarTemplate(records[0]);
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
      const percentile = getScoutingTemplatePercentile(record, item) || 1;
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
        <strong>${records.length} player ${escapeHtml(template.profileLabel || "role spider")}</strong>
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
    [...(getScoutingDatabase()?.records || [])]
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
      <div class="scouting-cockpit-roles">
        ${roleRows
          .map(
            (row) => `
              <button type="button" class="${row.records.length ? "has-depth" : "is-empty"}" data-select-scouting-shadow-slot="${escapeHtml(row.slot.id)}">
                <span>${escapeHtml(row.slot.label)}</span>
                <strong>${escapeHtml(row.need)}</strong>
                <em>${
                  row.topCandidate
                    ? `${escapeHtml(getScoutingRecordName(row.topCandidate.record))} · P${escapeHtml(row.topCandidate.score ?? "-")}`
                    : "No candidates"
                }</em>
              </button>
            `
          )
          .join("")}
      </div>
      <div class="scouting-cockpit-hotlist">
        <h3>Hot role fits</h3>
        ${
          hotCandidates.length
            ? hotCandidates
                .map(
                  (item) => `
                    <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(item.record))}">
                      <span>${escapeHtml(item.slot.label)}</span>
                      <strong>${escapeHtml(getScoutingRecordName(item.record))}</strong>
                      <em>${escapeHtml(getScoutingRoleFitLabel(item.score))} · P${escapeHtml(item.score ?? "-")}</em>
                    </button>
                  `
                )
                .join("")
            : `<p class="scouting-muted">Add players to Shadow XI positions to build a hotlist.</p>`
        }
      </div>
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
  renderScoutingWorkspace();
}
function clearScoutingShadowSlotSelection() {
  const state = ensureScoutingState();
  preferredScoutingShadowSlotId = "";
  state.shadowXi.selectedSlotId = "";
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace({ preserveFocus: true });
}
function getScoutingFocusSnapshot() {
  const activeElement = document.activeElement;
  if (!activeElement || !ui.scoutingWorkspace?.contains(activeElement)) {
    return null;
  }
  const filterField = activeElement.closest?.("[data-scouting-filter]");
  if (!filterField) {
    return null;
  }
  return {
    field: filterField.dataset.scoutingFilter,
    selectionStart: typeof filterField.selectionStart === "number" ? filterField.selectionStart : null,
    selectionEnd: typeof filterField.selectionEnd === "number" ? filterField.selectionEnd : null,
  };
}
function restoreScoutingFocus(snapshot) {
  if (!snapshot?.field) {
    return;
  }
  const fields = Array.from(ui.scoutingWorkspace?.querySelectorAll("[data-scouting-filter]") || []);
  const nextField = fields.find((field) => field.dataset.scoutingFilter === snapshot.field);
  if (!nextField) {
    return;
  }
  nextField.focus({ preventScroll: true });
  if (
    typeof nextField.setSelectionRange === "function" &&
    Number.isInteger(snapshot.selectionStart) &&
    Number.isInteger(snapshot.selectionEnd)
  ) {
    nextField.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}
function renderScoutingRecordCard(record) {
  const state = ensureScoutingState();
  const recordId = getScoutingRecordId(record);
  const selectedSlotId = getSelectedScoutingShadowSlotId(state);
  const selectedSlot = getScoutingShadowSlot(selectedSlotId);
  const inSelectedSlot = selectedSlotId ? getScoutingShadowSlotRecordIds(selectedSlotId, state).includes(recordId) : false;
  const sortMetricId = state.databaseFilters.sortMetricId || (state.databaseFilters.metricId !== "all" ? state.databaseFilters.metricId : "minutes");
  const metric = getScoutingMetric(sortMetricId);
  const metricValue = getScoutingMetricValue(record, sortMetricId);
  const percentile = metric && sortMetricId !== "minutes" && sortMetricId !== "matches" ? getScoutingPercentile(record, sortMetricId) : null;
  const age = getScoutingRecordAge(record);
  const favorite = isScoutingRecordFavorited(recordId);
  const roleFitScore = getScoutingRoleFitScore(record);
  const bestSignal = getScoutingBestSignal(record);
  const meta = [
    getScoutingRecordPosition(record),
    age ? `${formatScoutingNumber(age)} yrs` : "",
    `${formatScoutingNumber(getScoutingRecordMinutes(record))} min`,
  ]
    .filter(Boolean)
    .join(" / ");
  return `
    <article class="scouting-record-card" data-open-scouting-record="${escapeHtml(recordId)}" tabindex="0" role="button">
      <div class="scouting-record-card-head">
        <div>
          <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
          <span>${escapeHtml(meta)}</span>
        </div>
        <button
          type="button"
          class="scouting-star-button${favorite ? " is-active" : ""}"
          data-toggle-scouting-favorite="${escapeHtml(recordId)}"
          aria-pressed="${favorite ? "true" : "false"}"
          aria-label="${favorite ? "Remove favorite" : "Favorite player"}"
        >${favorite ? "★" : "☆"}</button>
      </div>
      <div class="scouting-record-card-meta">
        <span>${escapeHtml(getScoutingRecordTeam(record) || "No club")}</span>
        <span>${escapeHtml(getScoutingRecordLeague(record))}</span>
        <span>${escapeHtml(getScoutingRecordSeason(record))}</span>
      </div>
      <div class="scouting-record-card-score">
        <span>${escapeHtml(metric?.label || "Minutes")}</span>
        <strong>${percentile ? `P${percentile}` : formatScoutingNumber(metricValue)}</strong>
      </div>
      <div class="scouting-record-decision">
        <span class="is-${escapeHtml(getScoutingRoleFitTier(roleFitScore))}">${escapeHtml(getScoutingRoleFitLabel(roleFitScore))}${Number.isFinite(roleFitScore) ? ` · P${escapeHtml(roleFitScore)}` : ""}</span>
        <em>${escapeHtml(bestSignal ? `${bestSignal.metric.label} P${bestSignal.percentile}` : "Need more comparable metrics")}</em>
      </div>
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
    </article>
  `;
}
function renderScoutingDatabaseControls() {
  const state = ensureScoutingState();
  const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
  const options = getScoutingDatabaseOptions();
  const metricOptions = getScoutingMetricOptions();
  const sortOptions = [{ id: "role-fit", label: "Role fit" }, ...metricOptions];
  return `
    <div class="scouting-database-controls">
      <label>
        <span>Search</span>
        <input type="search" value="${escapeHtml(filters.query)}" placeholder="Player, club, league, player type" data-scouting-filter="query" />
      </label>
      <label>
        <span>League</span>
        <select data-scouting-filter="league">
          <option value="all">All leagues</option>
          ${options.leagues.map((league) => `<option value="${escapeHtml(league)}" ${filters.league === league ? "selected" : ""}>${escapeHtml(league)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Season</span>
        <select data-scouting-filter="season">
          <option value="all">All seasons</option>
          ${options.seasons.map((season) => `<option value="${escapeHtml(season)}" ${filters.season === season ? "selected" : ""}>${escapeHtml(season)}</option>`).join("")}
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
        <span>Min minutes</span>
        <input type="number" min="0" step="50" value="${escapeHtml(filters.minMinutes)}" data-scouting-filter="minMinutes" />
      </label>
      <label>
        <span>Max age</span>
        <input type="number" min="14" step="1" value="${escapeHtml(filters.maxAge)}" placeholder="Any" data-scouting-filter="maxAge" />
      </label>
      <label>
        <span>Highlight metric</span>
        <select data-scouting-filter="metricId">
          <option value="all">No metric floor</option>
          ${metricOptions.map((metric) => `<option value="${escapeHtml(metric.id)}" ${filters.metricId === metric.id ? "selected" : ""}>${escapeHtml(metric.label)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Min percentile</span>
        <input type="number" min="1" max="99" step="1" value="${escapeHtml(filters.metricMin)}" placeholder="75" data-scouting-filter="metricMin" />
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
        <input type="number" min="1" max="99" step="1" value="${escapeHtml(filters.roleFitMin)}" placeholder="70" data-scouting-filter="roleFitMin" />
      </label>
      <label>
        <span>Market status</span>
        <select data-scouting-filter="marketStatus">
          ${getScoutingMarketStatusFilterOptions()
            .map((option) => `<option value="${escapeHtml(option.value)}" ${filters.marketStatus === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
            .join("")}
        </select>
      </label>
      <label>
        <span>Sort by</span>
        <select data-scouting-filter="sortMetricId">
          ${sortOptions.map((metric) => `<option value="${escapeHtml(metric.id)}" ${filters.sortMetricId === metric.id ? "selected" : ""}>${escapeHtml(metric.label)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}
function renderScoutingImportPanel() {
  const database = getScoutingDatabase();
  const isImported = database?.source === "ui-import";
  const draft = scoutingImportDraft;
  const selected = draft?.sheets?.find((sheet) => sheet.name === draft.selectedSheet);
  const headers = selected?.headers || [];
  const coreFields = [
    ["player", "Player"],
    ["team", "Team"],
    ["league", "League"],
    ["season", "Season"],
    ["position", "Position"],
    ["age", "Age"],
    ["matches", "Matches"],
    ["minutes", "Minutes"],
    ["birthCountry", "Birth country"],
    ["passportCountry", "Passport country"],
    ["height", "Height"],
    ["weight", "Weight"],
  ];
  const columnOptions = (currentValue) => `
    <option value="">Not mapped</option>
    ${headers.map((header) => `<option value="${escapeHtml(header)}" ${currentValue === header ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}
  `;
  return `
    <section class="scouting-import-panel">
      <div class="scouting-import-head">
        <div>
          <span>Scouting player database</span>
          <h2>${escapeHtml(isImported ? `Imported: ${database.fileName || "Scouting player database"}` : "Update scouting player database")}</h2>
          <p>${escapeHtml(isImported ? `${database.records.length.toLocaleString("en-US")} players / ${database.metrics.length} metrics / imported ${String(database.importedAt || "").slice(0, 10)}` : "Upload a scouting player database file, choose sheet, map columns and update the database without code.")}</p>
        </div>
        <label class="scouting-import-upload">
          <input type="file" accept=".xlsx,.xls" data-scouting-import-file />
          <span>Choose database file</span>
        </label>
        ${isImported ? `<button type="button" class="scouting-secondary-button" data-clear-scouting-import>Use built-in data</button>` : ""}
      </div>
      ${
        draft
          ? `
            <div class="scouting-import-workbench">
              <div class="scouting-import-status">
                <span>${escapeHtml(draft.fileName || "Import")}</span>
                <strong>${escapeHtml(draft.status === "loading" ? "Reading workbook..." : draft.status === "imported" ? `Imported ${draft.importedCount || 0} rows` : draft.status === "error" ? "Import needs attention" : "Ready to map")}</strong>
                <p>${escapeHtml(draft.error || (selected ? `${selected.rows.length.toLocaleString("en-US")} preview rows / ${headers.length} columns` : "Choose a sheet."))}</p>
              </div>
              ${
                draft.status === "ready" || draft.status === "imported" || draft.status === "error"
                  ? `
                    <div class="scouting-import-controls">
                      <label>
                        <span>Sheet</span>
                        <select data-scouting-import-sheet>
                          ${(draft.sheets || []).map((sheet) => `<option value="${escapeHtml(sheet.name)}" ${draft.selectedSheet === sheet.name ? "selected" : ""}>${escapeHtml(sheet.name)}</option>`).join("")}
                        </select>
                      </label>
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
                      <strong>Metric columns</strong>
                      <p>${escapeHtml(`${getScoutingImportMetricHeaders(headers, draft.map || {}).length} unmapped columns will be imported as metrics.`)}</p>
                      <button type="button" class="scouting-primary-button" data-apply-scouting-import>Update scouting database</button>
                    </div>
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
function renderScoutingSavedViewsPanel() {
  const state = ensureScoutingState();
  const savedViews = getScoutingSavedViews(state);
  const canEdit = canEditScoutingWorkspace();
  return `
    <section class="scouting-saved-views">
      <div>
        <span>Saved database views</span>
        <strong>${savedViews.length ? `${savedViews.length} saved` : "No saved views yet"}</strong>
      </div>
      <div class="scouting-preset-view-list">
        ${getScoutingSavedViewPresets()
          .map((preset) => `<button type="button" data-apply-scouting-preset-view="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</button>`)
          .join("")}
      </div>
      ${
        canEdit
          ? `
            <form data-scouting-saved-view-form>
              <input name="name" placeholder="Save current filter as..." required />
              <button type="submit" class="scouting-primary-button">Save view</button>
            </form>
          `
          : ""
      }
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
                        ].filter(Boolean).join(" / ") || "All players")}</span>
                      </button>
                      ${canEdit ? `<button type="button" data-delete-scouting-saved-view="${escapeHtml(view.id)}" aria-label="Delete ${escapeHtml(view.name)}">x</button>` : ""}
                    </article>
                  `
                )
                .join("")
            : `<p class="scouting-muted">Save useful searches such as U23 fullbacks, priority fits or value cases.</p>`
        }
      </div>
    </section>
  `;
}
function getScoutingDataQualitySummary() {
  const database = getScoutingDatabase();
  const records = database?.records || [];
  const options = getScoutingDatabaseOptions();
  const seenKeys = new Set();
  let duplicateRows = 0;
  let missingCore = 0;
  let missingAge = 0;
  let missingMinutes = 0;
  let metricValueCount = 0;
  records.forEach((record) => {
    const key = [
      getScoutingRecordName(record).toLowerCase(),
      getScoutingRecordTeam(record).toLowerCase(),
      getScoutingRecordSeason(record).toLowerCase(),
      getScoutingRecordPosition(record).toLowerCase(),
    ].join("|");
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
    metricValueCount += getScoutingRecordMetricValueCount(record);
  });
  const metricAverage = records.length ? Math.round(metricValueCount / records.length) : 0;
  const coreCompleteness = records.length ? Math.round(((records.length - missingCore) / records.length) * 100) : 0;
  return {
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
  };
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
        <article><span>Missing age</span><strong>${escapeHtml(summary.missingAge)}</strong><em>rows to enrich</em></article>
        <article><span>Missing minutes</span><strong>${escapeHtml(summary.missingMinutes)}</strong><em>sample risk</em></article>
      </div>
    </section>
  `;
}
function getScoutingDatabaseResultsMarkup() {
  const records = getFilteredScoutingDatabaseRecords();
  const visibleRecords = records.slice(0, 72);
  const summary = `${records.length.toLocaleString("en-US")} players match. Showing ${visibleRecords.length.toLocaleString("en-US")}.`;
  return {
    records,
    summary,
    html: visibleRecords.length
      ? visibleRecords.map(renderScoutingRecordCard).join("")
      : `<div class="scouting-empty-panel">No players match these filters yet.</div>`,
  };
}
function renderScoutingDatabasePanel() {
  if (scoutingDatabaseError) {
    return `
      <section class="scouting-load-panel">
        <h2>Scouting database failed to load</h2>
        <p>${escapeHtml(scoutingDatabaseError)}</p>
        <button type="button" class="scouting-primary-button" data-scouting-retry-database>Retry database</button>
      </section>
    `;
  }
  const database = getScoutingDatabase();
  if (!database) {
    const isLoading = Boolean(scoutingDatabaseLoadPromise);
    return `
      <section class="scouting-load-panel">
        <h2>${isLoading ? "Loading the scouting database" : "Scouting database is ready"}</h2>
        <p>${
          isLoading
            ? "The scouting player database is being prepared. The rest of Scouting stays responsive while it loads."
            : "Load the full scouting player database when you want to search, filter and open player profiles."
        }</p>
        ${
          isLoading
            ? ""
            : `<button type="button" class="scouting-primary-button" data-scouting-load-database>Load scouting player database</button>`
        }
      </section>
    `;
  }
  const results = getScoutingDatabaseResultsMarkup();
  const state = ensureScoutingState();
  const selectedSlotId = getSelectedScoutingShadowSlotId(state);
  const selectedSlot = getScoutingShadowSlot(selectedSlotId);
  const selectedSlotCount = selectedSlot ? getScoutingShadowSlotRecordIds(selectedSlot.id, state).length : 0;
  return `
    <section class="scouting-database-panel">
      ${
        selectedSlot
          ? `
            <div class="scouting-database-context">
              <div>
                <p class="placeholder-tag">Adding to Shadow XI</p>
                <h2>${escapeHtml(selectedSlot.label)} wishlist</h2>
                <span>${selectedSlotCount} player${selectedSlotCount === 1 ? "" : "s"} already stacked for ${escapeHtml(selectedSlot.position)}.</span>
              </div>
              <div>
                <button type="button" class="scouting-primary-button" data-scouting-tab="shadow-xi">Back to Shadow XI</button>
                <button type="button" class="scouting-secondary-button" data-clear-scouting-shadow-slot-selection>Clear role</button>
              </div>
            </div>
          `
          : ""
      }
      ${renderScoutingImportPanel()}
      ${renderScoutingDatabaseControls()}
      ${renderScoutingSavedViewsPanel()}
      ${renderScoutingDataQualityPanel()}
      ${renderScoutingMarketRadar(results.records)}
      <div class="scouting-result-summary" data-scouting-result-summary>${escapeHtml(results.summary)}</div>
      <div class="scouting-record-grid" data-scouting-record-grid>
        ${results.html}
      </div>
    </section>
  `;
}
function renderScoutingShadowXi() {
  const state = ensureScoutingState();
  const canEdit = canEditScoutingWorkspace();
  const favoriteRecords = state.favoriteRecordIds.map(getScoutingRecordById).filter(Boolean).slice(0, 8);
  const selectedSlotId = getSelectedScoutingShadowSlotId(state);
  const shadowCounts = getScoutingShadowSlotCounts(state);
  return `
    ${renderScoutingRecruitmentCockpit(state)}
    ${renderScoutingRecruitmentAlerts(state)}
    <section class="scouting-shadow-layout">
      <div class="scouting-shadow-pitch" aria-label="Shadow eleven ${escapeHtml(state.shadowXi.formation)}">
        <span class="scouting-pitch-line is-half"></span>
        <span class="scouting-pitch-line is-box-top"></span>
        <span class="scouting-pitch-line is-box-bottom"></span>
        ${scoutingShadowSlots
          .map((slot) => {
            const records = getScoutingShadowSlotRecords(slot.id, state);
            const hiddenCount = Math.max(0, getScoutingShadowSlotRecordIds(slot.id, state).length - records.slice(0, 2).length);
            return `
              <article class="scouting-shadow-slot${records.length ? " is-filled" : ""}${selectedSlotId === slot.id ? " is-selected" : ""}" style="--x:${slot.x}%;--y:${slot.y}%;">
                <div class="scouting-shadow-slot-head">
                  <span>${escapeHtml(slot.label)}</span>
                  <strong>${records.length ? `${records.length} target${records.length === 1 ? "" : "s"}` : "Wishlist"}</strong>
                  <em>${escapeHtml(slot.position)}</em>
                </div>
                <div class="scouting-shadow-stack">
                  ${
                    records.length
                      ? records
                          .slice(0, 2)
                          .map((record, index) => {
                            const recordId = getScoutingRecordId(record);
                            const meta = getScoutingShadowRecordMeta(slot.id, recordId, state);
                            const tagLabel = getScoutingShadowTagOptions().find((option) => option.value === meta.tag)?.label || "Monitor";
                            return `
                              <div class="scouting-shadow-player-row" style="--stack:${index};">
                                <button type="button" class="scouting-shadow-player" data-open-scouting-record="${escapeHtml(recordId)}">
                                  <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
                                  <span>${escapeHtml(tagLabel)} / ${escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordLeague(record))}</span>
                                </button>
                                ${
                                  canEdit
                                    ? `<button type="button" class="scouting-shadow-remove" data-remove-scouting-shadow-slot="${escapeHtml(slot.id)}" data-remove-scouting-shadow-record="${escapeHtml(recordId)}" aria-label="Remove ${escapeHtml(getScoutingRecordName(record))} from ${escapeHtml(slot.label)}">x</button>`
                                    : ""
                                }
                              </div>
                            `;
                          })
                          .join("")
                      : `<p class="scouting-shadow-empty">Choose this role, then add players from profiles.</p>`
                  }
                  ${hiddenCount ? `<span class="scouting-shadow-more">+${hiddenCount} more in this role</span>` : ""}
                </div>
                <button type="button" class="scouting-shadow-add" data-select-scouting-shadow-slot="${escapeHtml(slot.id)}" ${canEdit ? "" : "disabled"}>+ Add player</button>
              </article>
            `;
          })
          .join("")}
      </div>
      <aside class="scouting-shadow-side">
        <div class="scouting-shadow-card">
          <p class="placeholder-tag">Squad planning</p>
          <h2>${shadowCounts.playerCount} players across ${shadowCounts.filledSlots}/11 roles</h2>
          <p>Build each position as a wishlist with several players stacked behind the first choice.</p>
          <button type="button" class="scouting-primary-button" data-scouting-tab="database">Open database</button>
        </div>
        <div class="scouting-shadow-card">
          <p class="placeholder-tag">Position wishlists</p>
          <div class="scouting-shadow-depth-list">
            ${scoutingShadowSlots
              .map((slot) => {
                const records = getScoutingShadowSlotRecords(slot.id, state);
                return `
                  <details class="scouting-shadow-depth" data-scouting-shadow-drop-slot="${escapeHtml(slot.id)}" ${records.length ? "open" : ""}>
                    <summary><span>${escapeHtml(slot.label)} / coverage ${escapeHtml(getScoutingShadowCoverageScore(slot.id, state))}</span><strong>${records.length}</strong></summary>
                    <div>
                      ${
                        records.length
                          ? records
                              .map((record, index) => {
                                const recordId = getScoutingRecordId(record);
                                const meta = getScoutingShadowRecordMeta(slot.id, recordId, state);
                                return `
                                  <article
                                    class="scouting-shadow-depth-player"
                                    data-scouting-drag-shadow-record="${escapeHtml(recordId)}"
                                    data-scouting-shadow-slot="${escapeHtml(slot.id)}"
                                    data-scouting-shadow-drop-slot="${escapeHtml(slot.id)}"
                                    data-scouting-shadow-drop-before="${escapeHtml(recordId)}"
                                  >
                                    <button type="button" data-open-scouting-record="${escapeHtml(recordId)}">
                                      ${escapeHtml(index + 1)}. ${escapeHtml(getScoutingRecordName(record))}
                                      <span>${escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordPosition(record))}</span>
                                    </button>
                                    <div>
                                      <select data-scouting-shadow-tag="${escapeHtml(recordId)}" data-scouting-shadow-slot="${escapeHtml(slot.id)}" ${canEdit ? "" : "disabled"}>
                                        ${getScoutingShadowTagOptions()
                                          .map((option) => `<option value="${escapeHtml(option.value)}" ${meta.tag === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
                                          .join("")}
                                      </select>
                                      <button type="button" data-move-scouting-shadow-record="${escapeHtml(recordId)}" data-scouting-shadow-slot="${escapeHtml(slot.id)}" data-scouting-shadow-direction="up" ${canEdit ? "" : "disabled"}>Up</button>
                                      <button type="button" data-move-scouting-shadow-record="${escapeHtml(recordId)}" data-scouting-shadow-slot="${escapeHtml(slot.id)}" data-scouting-shadow-direction="down" ${canEdit ? "" : "disabled"}>Down</button>
                                    </div>
                                  </article>
                                `;
                              })
                              .join("")
                          : `<p class="scouting-muted">No players yet.</p>`
                      }
                    </div>
                  </details>
                `;
              })
              .join("")}
          </div>
        </div>
        <div class="scouting-shadow-card">
          <p class="placeholder-tag">Favorites ready for XI</p>
          <div class="scouting-mini-list">
            ${
              favoriteRecords.length
                ? favoriteRecords
                    .map(
                      (record) => `
                        <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(record))}">
                          <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
                          <span>${escapeHtml(getScoutingRecordPosition(record))} / ${escapeHtml(getScoutingRecordTeam(record))}</span>
                        </button>
                      `
                    )
                    .join("")
                : `<p class="scouting-muted">Favorite players from the database to prepare the XI.</p>`
            }
          </div>
        </div>
      </aside>
    </section>
  `;
}
function renderScoutingListsPanel() {
  const state = ensureScoutingState();
  const canEdit = canEditScoutingWorkspace();
  const favoriteRecords = state.favoriteRecordIds.map(getScoutingRecordById).filter(Boolean);
  return `
    <section class="scouting-lists-panel">
      ${
        canEdit
          ? `
            <form class="scouting-list-form" data-scouting-list-form>
              <input name="name" placeholder="Name a new scouting list" required />
              <button type="submit" class="scouting-primary-button">Create list</button>
            </form>
          `
          : ""
      }
      <div class="scouting-list-grid">
        <article class="scouting-list-card is-featured">
          <div>
            <p class="placeholder-tag">Favorites</p>
            <h2>${favoriteRecords.length} players</h2>
          </div>
          <div class="scouting-list-players">
            ${
              favoriteRecords.length
                ? favoriteRecords
                    .slice(0, 16)
                    .map((record) => `<button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(record))}">${escapeHtml(getScoutingRecordName(record))}<span>${escapeHtml(getScoutingRecordPosition(record))}</span></button>`)
                    .join("")
                : `<p class="scouting-muted">Favorites become your master live watchlist.</p>`
            }
          </div>
        </article>
        ${state.lists
          .map((list) => {
            const records = list.recordIds.map(getScoutingRecordById).filter(Boolean);
            return `
              <article class="scouting-list-card">
                <div>
                  <p class="placeholder-tag">${records.length} players</p>
                  <h2>${escapeHtml(list.name)}</h2>
                </div>
                <div class="scouting-list-players">
                  ${
                    records.length
                      ? records
                          .slice(0, 16)
                          .map((record) => `<button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(record))}">${escapeHtml(getScoutingRecordName(record))}<span>${escapeHtml(getScoutingRecordTeam(record))}</span></button>`)
                          .join("")
                      : `<p class="scouting-muted">Add players from a scouting profile.</p>`
                  }
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
  </section>
  `;
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
  return `
    <article class="scouting-target-card" data-scouting-drag-target="${escapeHtml(target.id)}">
      <div class="scouting-target-main">
        <strong>${escapeHtml(recordName)}</strong>
        <span>${escapeHtml(slot ? slot.label : "Open")}</span>
      </div>
      <p class="scouting-note-line">${escapeHtml(recordClub)} · ${escapeHtml(target.position || "Unknown position")} · ${age ? `${escapeHtml(age)} yrs` : ""} · ${formatScoutingNumber(minutes)} min</p>
      <p class="scouting-fit-line">${escapeHtml(target.fit || "n/a")} · ${escapeHtml(slot ? slot.position : "Open role")} · ${record ? `${escapeHtml(getScoutingRoleFitLabel(targetRoleFit))}` : "No profile score"}</p>
      <p class="scouting-note-line">${escapeHtml(target.notes || "No notes yet")}</p>
      <p class="scouting-note-line">${escapeHtml(bestSignal ? `${bestSignal.metric.label} · P${bestSignal.percentile}` : target.fit ? `Status: ${escapeHtml(target.fit)}` : "No standout signal")}</p>
      <div class="scouting-workflow-meta">
        <span>Owner: ${escapeHtml(target.owner || "Unassigned")}</span>
        <span>Next: ${escapeHtml(target.nextAction || "No next action")}</span>
        <span>Due: ${escapeHtml(target.nextActionDate || target.decisionDeadline || "No date")}</span>
        <span>Contact: ${escapeHtml(target.lastContact || "No contact logged")}</span>
      </div>
      <div class="scouting-target-actions">
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
        ${record ? `<button type="button" class="scouting-primary-button" data-open-scouting-record="${escapeHtml(target.recordId)}">Open player</button>` : ""}
        ${canEditScoutingWorkspace() ? `<button type="button" data-remove-scouting-target="${escapeHtml(target.id)}" class="scouting-secondary-button">Remove</button>` : ""}
      </div>
    </article>
  `;
}
function renderScoutingTargetsPanel() {
  const state = ensureScoutingState();
  const targets = getScoutingTargets(state);
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
      <h2>Funnel</h2>
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
function renderScoutingComparisonLabPanel() {
  const state = ensureScoutingState();
  const lab = getScoutingComparisonLab(state);
  const selectedSlot = getScoutingSlotById(lab.slotId) || getScoutingSlotById(scoutingShadowSlots[0]?.id || "");
  const slotId = selectedSlot?.id || "";
  const slotOptions = scoutingShadowSlots
    .map((slot) => `<option value="${escapeHtml(slot.id)}" ${slotId === slot.id ? "selected" : ""}>${escapeHtml(slot.label)} · ${escapeHtml(slot.position)}</option>`)
    .join("");
  const metric = getScoutingMetric(lab.metricId) || getScoutingMetricOptions()[0];
  const candidates = selectedSlot ? getScoutingComparisonCandidatesForSlot(slotId).slice(0, 80) : [];
  const selectedPlayerIds = (lab.playerIds || []).map((recordId) => normalizeScoutingText(recordId, 160));
  const getPlayerOptions = (currentValue) =>
    candidates
      .map((record) => {
        const recordId = getScoutingRecordId(record);
        return `<option value="${escapeHtml(recordId)}" ${currentValue === recordId ? "selected" : ""}>${escapeHtml(getScoutingRecordName(record))} · ${escapeHtml(getScoutingRecordTeam(record) || "No club")}</option>`;
      })
      .join("");
  const uniquePlayerIds = Array.from(new Set(selectedPlayerIds.filter(Boolean))).slice(0, 4);
  const playerRecords = uniquePlayerIds
    .map((recordId) => ({
      recordId,
      record: getScoutingRecordById(recordId),
    }))
    .filter(({ record }) => Boolean(record));
  const canCompare = playerRecords.length >= 2;
  const comparisonSnapshot = canCompare
    ? playerRecords.map(({ record }) => ({
        record,
        value: getScoutingMetricValue(record, metric?.id),
        percentile: metric ? getScoutingPercentile(record, metric.id) : null,
      }))
    : [];
  const comparisonLeader = comparisonSnapshot
    .filter((entry) => Number.isFinite(entry.percentile))
    .sort((a, b) => b.percentile - a.percentile)[0];
  const metricDelta =
    canCompare && comparisonLeader
      ? `${escapeHtml(getScoutingRecordName(comparisonLeader.record))} leads ${escapeHtml(metric?.label || "selected metric")} at P${escapeHtml(comparisonLeader.percentile)}`
      : "";
  const comparisonMetricRows = canCompare
    ? getScoutingRadarTemplate(playerRecords[0].record)
        .map((item) => {
          const values = playerRecords
            .map(({ record }) => ({
              record,
              value: getScoutingMetricValue(record, item.metricId),
              percentile: getScoutingTemplatePercentile(record, item),
            }))
            .filter((entry) => Number.isFinite(entry.percentile));
          const winner = [...values].sort((a, b) => b.percentile - a.percentile)[0];
          return winner
            ? {
                label: item.label,
                metric: getScoutingMetric(item.metricId),
                winner,
                values,
              }
            : null;
        })
        .filter(Boolean)
    : [];
  const canEdit = canEditScoutingWorkspace();
  return `
    <section class="scouting-comparison-lab">
      <h2>Comparison lab</h2>
      <form class="scouting-target-form is-open scouting-comparison-form" data-scouting-comparison-form>
        <select name="slotId" data-scouting-comparison-slot ${canEdit ? "" : "disabled"}>
          ${slotOptions}
        </select>
        <select name="metricId" data-scouting-comparison-metric ${canEdit ? "" : "disabled"}>
          ${getScoutingMetricOptions().map((metricOption) => `<option value="${escapeHtml(metricOption.id)}" ${metricOption.id === metric.id ? "selected" : ""}>${escapeHtml(metricOption.label)}</option>`).join("")}
        </select>
        <select name="playerA" data-scouting-comparison-player="a" ${canEdit ? "" : "disabled"}>
          <option value="">Player A</option>
          ${getPlayerOptions(selectedPlayerIds[0])}
        </select>
        <select name="playerB" data-scouting-comparison-player="b" ${canEdit ? "" : "disabled"}>
          <option value="">Player B</option>
          ${getPlayerOptions(selectedPlayerIds[1])}
        </select>
        <select name="playerC" data-scouting-comparison-player="c" ${canEdit ? "" : "disabled"}>
          <option value="">Player C</option>
          ${getPlayerOptions(selectedPlayerIds[2])}
        </select>
        <select name="playerD" data-scouting-comparison-player="d" ${canEdit ? "" : "disabled"}>
          <option value="">Player D</option>
          ${getPlayerOptions(selectedPlayerIds[3])}
        </select>
      </form>
      <p class="scouting-comparison-summary">
        ${metric ? `Metric: ${escapeHtml(metric.label)}` : "Select a metric"} ${canCompare ? `· ${metricDelta}` : "· Pick at least two players to compare"}
      </p>
      ${canCompare ? renderScoutingComparisonRadarOverlay(playerRecords) : ""}
      <div class="scouting-comparison-results">
        ${
          canCompare
            ? comparisonSnapshot
                .map((entry) => {
                  const roleFit = getScoutingRoleFitScore(entry.record);
                  const bestSignal = getScoutingBestSignal(entry.record);
                    return `
                    <article class="scouting-target-card">
                      <div class="scouting-target-main">
                        <strong>${escapeHtml(getScoutingRecordName(entry.record))}</strong>
                        <span>${escapeHtml(formatScoutingNumber(entry.value))}</span>
                      </div>
                      <p class="scouting-fit-line">${escapeHtml(metric?.label || "Metric")}: ${escapeHtml(formatScoutingNumber(entry.value))}${entry.percentile ? ` · P${escapeHtml(entry.percentile)}` : ""}</p>
                      <p class="scouting-note-line">Role fit ${escapeHtml(getScoutingRoleFitLabel(roleFit))} ${Number.isFinite(roleFit) ? `· P${escapeHtml(roleFit)}` : ""}</p>
                      <p class="scouting-note-line">Best signal: ${escapeHtml(bestSignal ? `${bestSignal.metric.label} · P${bestSignal.percentile}` : "No signal")}</p>
                      <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(entry.record))}">Open profile</button>
                    </article>
                  `;
                })
                .join("")
            : `<p class="scouting-muted">Choose two players and a role to compare by role-relevant metric.</p>`
        }
      </div>
      ${
        canCompare
          ? `
            <div class="scouting-comparison-winners">
              <h3>Who wins what</h3>
              <div>
                ${comparisonMetricRows
                  .map(
                    (row) => `
                      <article>
                        <span>${escapeHtml(row.label)}</span>
                        <strong>${escapeHtml(getScoutingRecordName(row.winner.record))}</strong>
                        <em>${escapeHtml(row.metric?.label || "Metric")} · P${escapeHtml(row.winner.percentile)} · ${escapeHtml(formatScoutingNumber(row.winner.value))}</em>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
    </section>
  `;
}
function renderScoutingRoleModelsPanel() {
  const state = ensureScoutingState();
  const models = getScoutingRoleModels(state);
  const slotOptions = scoutingShadowSlots
    .map((slot) => `<option value="${escapeHtml(slot.id)}">${escapeHtml(slot.label)} - ${escapeHtml(slot.position)}</option>`)
    .join("");
  return `
    <section class="scouting-role-models">
      <h2>Role models</h2>
      ${
        canEditScoutingWorkspace()
          ? `<form class="scouting-target-form is-open" data-scouting-role-model-form>
              <input type="text" name="name" placeholder="Role model name" required />
              <select name="slotId">${slotOptions}</select>
              <select name="metricId">${getScoutingMetricOptions().map((metric) => `<option value="${escapeHtml(metric.id)}">${escapeHtml(metric.label)}</option>`).join("")}</select>
              <input type="number" min="1" max="99" name="minPercentile" placeholder="Min percentile" />
              <input type="text" name="notes" placeholder="Model notes" />
              <button type="submit" class="scouting-primary-button">Save role model</button>
            </form>`
          : `<p class="scouting-muted">Role models editing is locked.</p>`
      }
      <div class="scouting-role-model-list">
        ${
          models.length
            ? models
                .map((model) => {
                  const slot = getScoutingSlotById(model.slotId);
                  const metric = getScoutingMetric(model.metricId);
                  const candidates = getScoutingRoleModelCandidates(model).slice(0, 3);
                  return `
                    <article class="scouting-target-card">
                      <div class="scouting-target-main">
                        <strong>${escapeHtml(model.name || "Custom role model")}</strong>
                        <span>${escapeHtml(slot ? `${slot.label} · ${slot.position}` : "Open role")}</span>
                      </div>
                      <p class="scouting-note-line">Benchmark: ${escapeHtml(metric?.label || "Minutes")} · P${escapeHtml(formatScoutingNumber(model.minPercentile))}</p>
                      <p class="scouting-fit-line">${escapeHtml(model.notes || "No notes")}</p>
                      <div class="scouting-target-actions">
                        <p class="scouting-fit-line">Top matches:</p>
                        ${
                          candidates.length
                            ? candidates
                                .map(
                                  (entry) => `
                                    <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(entry.record))}">
                                      ${escapeHtml(getScoutingRecordName(entry.record))} · P${escapeHtml(formatScoutingNumber(entry.percentile))}
                                    </button>
                                  `
                                )
                                .join("")
                            : `<p class="scouting-muted">No matching players found yet.</p>`
                        }
                        ${canEditScoutingWorkspace() ? `<button type="button" class="scouting-secondary-button" data-remove-scouting-role-model="${escapeHtml(model.id)}">Remove model</button>` : ""}
                      </div>
                    </article>
                  `;
                })
                .join("")
            : `<p class="scouting-muted">Create role models to build own recruitment archetypes.</p>`
        }
      </div>
    </section>
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
      <section class="scouting-reports-form-card">
        <h2>Scout reports</h2>
        <form class="scouting-target-form is-open" data-scouting-report-form>
          <select name="type" required ${canEdit ? "" : "disabled"}>
            ${reportTypeOptions.map((type) => `<option value="${escapeHtml(type.value)}">${escapeHtml(type.label)}</option>`).join("")}
          </select>
          <select name="targetId" ${targetOptions ? "" : "disabled"} ${canEdit ? "" : "disabled"}>
            <option value="">Attach to player target</option>
            ${targetOptions}
          </select>
          <select name="recommendation" ${canEdit ? "" : "disabled"}>
            ${getScoutingReportRecommendationOptions().map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
          </select>
          <input type="number" name="confidence" min="1" max="5" value="3" placeholder="Confidence 1-5" ${canEdit ? "" : "disabled"} />
          <input type="number" name="technical" min="1" max="5" value="3" placeholder="Technical 1-5" ${canEdit ? "" : "disabled"} />
          <input type="number" name="tactical" min="1" max="5" value="3" placeholder="Tactical 1-5" ${canEdit ? "" : "disabled"} />
          <input type="number" name="physical" min="1" max="5" value="3" placeholder="Physical 1-5" ${canEdit ? "" : "disabled"} />
          <input type="number" name="psychological" min="1" max="5" value="3" placeholder="Psychological 1-5" ${canEdit ? "" : "disabled"} />
          <input type="text" name="scoutType" placeholder="Live / video / data" ${canEdit ? "" : "disabled"} />
          <input type="text" name="title" required placeholder="Report title" ${canEdit ? "" : "disabled"} />
          <textarea name="summary" rows="5" placeholder="Recruitment assessment and notes" ${canEdit ? "" : "disabled"}></textarea>
          <button type="submit" class="scouting-primary-button" ${canEdit ? "" : "disabled"}>Save report</button>
        </form>
      </section>
      <section class="scouting-reports-list">
        <h2>Saved reports</h2>
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
    </div>
  `;
}
function renderScoutingReportsHub() {
  const state = ensureScoutingState();
  return `
    <div class="scouting-reports-shell">
      ${renderScoutingNextActionCenter(state)}
      ${renderScoutingRecruitmentAlerts(state)}
      ${renderScoutingBudgetBoard(state)}
      ${renderScoutingTargetsPanel()}
      ${renderScoutingComparisonLabPanel()}
      ${renderScoutingRoleModelsPanel()}
      ${renderScoutingReportsPanel()}
    </div>
  `;
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
function renderScoutingProfileModal() {
  const state = ensureScoutingState();
  const record = getScoutingRecordById(state.selectedRecordId);
  if (!record) {
    return "";
  }
  const recordId = getScoutingRecordId(record);
  const canEdit = canEditScoutingWorkspace();
  const favorite = isScoutingRecordFavorited(recordId);
  const profileRoleProfileId = normalizeScoutingRoleProfileId(state.profileRoleProfileId, "auto");
  const selectedProfileRoleId = profileRoleProfileId === "auto" ? "" : profileRoleProfileId;
  const radarTemplate = getScoutingRadarTemplate(record, selectedProfileRoleId);
  const profileMetrics = radarTemplate
    .map((item) => {
      const value = getScoutingMetricValue(record, item.metricId);
      const percentile = getScoutingTemplatePercentile(record, item);
      return { ...item, value, percentile, metric: getScoutingMetric(item.metricId) };
    })
    .filter((item) => item.metric);
  const topMetrics = getScoutingMetricOptions()
    .map((metric) => ({
      metric,
      value: getScoutingMetricValue(record, metric.id),
      percentile: getScoutingPercentile(record, metric.id),
    }))
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.percentile))
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 10);
  const playerRows = getScoutingRecordsForPlayer(record).slice(0, 10);
  const roleFitScore = getScoutingRoleFitScore(record, selectedProfileRoleId);
  const bestSignal = getScoutingBestSignal(record);
  const shadowRoles = scoutingShadowSlots.filter((slot) => getScoutingShadowSlotRecordIds(slot.id, state).includes(recordId));
  const goalMetricId = getScoutingMetricIdByLabels(["Goals"]);
  const xgMetricId = getScoutingMetricIdByLabels(["xG"]);
  const assistMetricId = getScoutingMetricIdByLabels(["Assists"]);
  const target = findScoutingTargetByRecordId(recordId, state);
  const listOptions = state.lists
    .map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`)
    .join("");
  const targetStatus = target?.status || getScoutingStatusOptions()[0]?.value || "new";
  const targetPriority = target?.priority || getScoutingPriorityOptions()[0]?.value || "normal";
  const targetSlotId = target?.slotId || getSelectedScoutingShadowSlotId(state) || scoutingShadowSlots[0]?.id || "";
  const slotOptions = scoutingShadowSlots
    .map((slot) => `<option value="${escapeHtml(slot.id)}" ${targetSlotId === slot.id ? "selected" : ""}>${escapeHtml(slot.label)} - ${escapeHtml(slot.position)}</option>`)
    .join("");
  const activeProfileTab = normalizeScoutingProfileTab(state.profileTab);
  return `
    <div class="scouting-profile-backdrop" data-close-scouting-profile>
      <article class="scouting-profile-modal" data-scouting-profile-modal>
        <button type="button" class="scouting-profile-close" data-close-scouting-profile aria-label="Close scouting profile">x</button>
        <header class="scouting-profile-head">
          <div>
            <p class="placeholder-tag">${escapeHtml(getScoutingRecordLeague(record))} / ${escapeHtml(getScoutingRecordSeason(record))}</p>
            <h2>${escapeHtml(getScoutingRecordName(record))}</h2>
            <p>${escapeHtml([getScoutingRecordPosition(record), getScoutingRecordTeam(record), getScoutingRecordAge(record) ? `${formatScoutingNumber(getScoutingRecordAge(record))} yrs` : ""].filter(Boolean).join(" / "))}</p>
          </div>
          <div class="scouting-profile-actions">
            <button type="button" class="scouting-star-button${favorite ? " is-active" : ""}" data-toggle-scouting-favorite="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>${favorite ? "Favorited" : "Favorite"}</button>
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
            <form
              class="scouting-target-form is-open"
              data-scouting-target-form="${escapeHtml(recordId)}"
            >
              <select name="status" ${canEdit ? "" : "disabled"}>
                ${getScoutingOptionMarkup(getScoutingStatusOptions(), targetStatus)}
              </select>
              <select name="priority" ${canEdit ? "" : "disabled"}>
                ${getScoutingOptionMarkup(getScoutingPriorityOptions(), targetPriority)}
              </select>
              <select name="slotId" ${canEdit ? "" : "disabled"}>${slotOptions}</select>
              <input
                type="text"
                name="notes"
                placeholder="Pipeline notes"
                value="${escapeHtml(target?.notes || "")}"
                ${canEdit ? "" : "disabled"}
              />
              <input
                type="text"
                name="owner"
                placeholder="Owner / scout"
                value="${escapeHtml(target?.owner || "")}"
                ${canEdit ? "" : "disabled"}
              />
              <input
                type="text"
                name="nextAction"
                placeholder="Next action"
                value="${escapeHtml(target?.nextAction || "")}"
                ${canEdit ? "" : "disabled"}
              />
              <input
                type="date"
                name="nextActionDate"
                value="${escapeHtml(target?.nextActionDate || "")}"
                ${canEdit ? "" : "disabled"}
              />
              <input
                type="date"
                name="lastContact"
                value="${escapeHtml(target?.lastContact || "")}"
                ${canEdit ? "" : "disabled"}
              />
              <input
                type="date"
                name="decisionDeadline"
                value="${escapeHtml(target?.decisionDeadline || "")}"
                ${canEdit ? "" : "disabled"}
              />
              <button type="submit" class="scouting-primary-button" ${canEdit ? "" : "disabled"}>
                ${target ? "Update pipeline" : "Add pipeline"}
              </button>
            </form>
          </div>
        </header>
        ${renderScoutingProfileTabs(activeProfileTab)}
        <div class="scouting-profile-tab-panel ${activeProfileTab === "overview" ? "is-active" : ""}">
          ${renderScoutingProfileDossier(record, state, playerRows)}
          <div class="scouting-profile-decision-strip">
            <div>
              <span>Role fit</span>
              <strong class="is-${escapeHtml(getScoutingRoleFitTier(roleFitScore))}">${Number.isFinite(roleFitScore) ? `P${escapeHtml(roleFitScore)}` : "n/a"}</strong>
              <em>${escapeHtml([getScoutingRoleFitLabel(roleFitScore), radarTemplate.profileLabel].filter(Boolean).join(" / "))}</em>
            </div>
            <div>
              <span>Best signal</span>
              <strong>${escapeHtml(bestSignal ? `P${bestSignal.percentile}` : "n/a")}</strong>
              <em>${escapeHtml(bestSignal?.metric?.label || "No standout metric")}</em>
            </div>
            <div>
              <span>Role stack</span>
              <strong>${shadowRoles.length}</strong>
              <em>${escapeHtml(shadowRoles.length ? shadowRoles.map((slot) => slot.label).join(", ") : "Not in Shadow XI")}</em>
            </div>
            <div>
              <span>Minutes</span>
              <strong>${escapeHtml(formatScoutingNumber(getScoutingRecordMinutes(record)))}</strong>
              <em>${escapeHtml(getScoutingRecordSeason(record) || "Current dataset")}</em>
            </div>
          </div>
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "market" ? "is-active" : ""}">
          ${renderScoutingMarketIntelligencePanel(record, state)}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "performance" ? "is-active" : ""}">
          <div class="scouting-profile-grid">
          <section class="scouting-profile-radar">
            <label class="scouting-profile-role-selector">
              <span>View as player type</span>
              <select data-scouting-profile-role-template>
                ${renderScoutingRoleProfileOptions(profileRoleProfileId, { auto: true })}
              </select>
            </label>
            ${renderScoutingRadar(record, selectedProfileRoleId)}
          </section>
          <section class="scouting-profile-metrics">
            <h3>Role spider metrics</h3>
            <div class="scouting-metric-stack">
              ${profileMetrics
                .map(
                  (item) => `
                    <div>
                      <span>${escapeHtml(item.label)}</span>
                      <strong>P${escapeHtml(item.percentile ?? "n/a")}</strong>
                      <em>${escapeHtml(item.metric.label)}: ${escapeHtml(formatScoutingNumber(item.value))}${item.direction === "lower" ? " / low value is positive" : ""}</em>
                    </div>
                  `
                )
                .join("")}
            </div>
          </section>
          ${renderScoutingRoleFitStack(record)}
          ${renderScoutingRoleExplanation(record, radarTemplate)}
          <section class="scouting-profile-metrics">
            <h3>Best percentile signals</h3>
            <div class="scouting-metric-stack">
              ${topMetrics
                .map(
                  (item) => `
                    <div>
                      <span>${escapeHtml(item.metric.label)}</span>
                      <strong>P${escapeHtml(item.percentile)}</strong>
                      <em>${escapeHtml(formatScoutingNumber(item.value))}</em>
                    </div>
                  `
                )
                .join("")}
            </div>
          </section>
          <section class="scouting-season-table">
            <h3>Season snapshots</h3>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Team</th>
                    <th>League</th>
                    <th>Min</th>
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
                          <td>${escapeHtml(formatScoutingNumber(getScoutingRecordMinutes(row)))}</td>
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
          </div>
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "squad" ? "is-active" : ""}">
          ${renderScoutingSquadFitPanel(record, state)}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "reports" ? "is-active" : ""}">
          ${renderScoutingProfileReportsTab(record, state)}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "contacts" ? "is-active" : ""}">
          ${renderScoutingContactsTab(record, state)}
        </div>
        <div class="scouting-profile-tab-panel ${activeProfileTab === "history" ? "is-active" : ""}">
          ${renderScoutingProfileHistoryTab(record, playerRows)}
        </div>
      </article>
    </div>
  `;
}
function renderScoutingActiveContent() {
  const state = ensureScoutingState();
  if (state.activeTab === "database") {
    return renderScoutingDatabasePanel();
  }
  if (state.activeTab === "lists") {
    return isScoutingDatabaseLoaded() ? renderScoutingListsPanel() : renderScoutingDatabasePanel();
  }
  if (state.activeTab === "reports") {
    return renderScoutingReportsHub();
  }
  if (state.activeTab === "opposition") {
    return renderScoutingFuturePanel(state.activeTab);
  }
  return renderScoutingShadowXi();
}
function renderScoutingWorkspace(options = {}) {
  if (!ui.scoutingWorkspace) {
    return;
  }
  const focusSnapshot = options.preserveFocus ? getScoutingFocusSnapshot() : null;
  const state = ensureScoutingState();
  if (!scoutingTabs.some((tab) => tab.id === state.activeTab)) {
    state.activeTab = "shadow-xi";
    writeScoutingState({ syncCentral: false });
  }
  const database = getScoutingDatabase();
  const playerCount = database?.records?.length || 0;
  const sheetCount = database?.sheets?.length || 0;
  const shadowCounts = getScoutingShadowSlotCounts(state);
  ui.scoutingWorkspace.innerHTML = `
    <section class="scouting-shell">
      <header class="scouting-hero">
        <div>
          <p class="placeholder-tag">Scouting</p>
          <h1>Shadow XI and recruitment intelligence</h1>
        </div>
        <div class="scouting-metrics" aria-label="Scouting summary">
          <span><strong>${playerCount ? playerCount.toLocaleString("en-US") : "..."}</strong> Players</span>
          <span><strong>${sheetCount ? sheetCount.toLocaleString("en-US") : "..."}</strong> Data sheets</span>
          <span><strong>${state.favoriteRecordIds.length}</strong> Favorites</span>
          <span><strong>${shadowCounts.playerCount}</strong> Shadow targets</span>
        </div>
      </header>
      <section class="scouting-board">
        <div class="scouting-command-bar">
          <div class="scouting-tabs" role="tablist" aria-label="Scouting views">
            ${scoutingTabs.map(renderScoutingTabButton).join("")}
          </div>
          <div class="scouting-tools">
            <span>${escapeHtml(state.shadowXi.formation)}</span>
            <span>${escapeHtml(state.lists.length)} lists</span>
          </div>
        </div>
        <div class="scouting-content">
          ${renderScoutingActiveContent()}
        </div>
      </section>
    </section>
    ${renderScoutingProfileModal()}
  `;
  restoreScoutingFocus(focusSnapshot);
  bindScoutingDragAndDrop();
}
function renderScoutingAnalysisRoomWorkspace(options = {}) {
  if (!ui.scoutingWorkspace) {
    return;
  }
  if (!isScoutingDatabaseLoaded()) {
    queueScoutingDatabaseLoad(renderScoutingAnalysisRoomWorkspace);
  }
  const focusSnapshot = options.preserveFocus ? getScoutingFocusSnapshot() : null;
  const database = getScoutingDatabase();
  const playerCount = database?.records?.length || 0;
  const sheetCount = database?.sheets?.length || 0;
  ui.scoutingWorkspace.innerHTML = `
    <section class="scouting-shell">
      <header class="scouting-hero">
        <div>
          <p class="placeholder-tag">Analysis Room</p>
          <h1>Opposition intelligence</h1>
        </div>
        <div class="scouting-metrics" aria-label="Analysis summary">
          <span><strong>${playerCount ? playerCount.toLocaleString("en-US") : "..."}</strong> Players</span>
          <span><strong>${sheetCount ? sheetCount.toLocaleString("en-US") : "..."}</strong> Data sheets</span>
        </div>
      </header>
      <section class="scouting-board">
        <div class="scouting-content">
          ${renderScoutingOppositionPanel()}
        </div>
      </section>
    </section>
    ${renderScoutingProfileModal()}
  `;
  restoreScoutingFocus(focusSnapshot);
  bindScoutingDragAndDrop();
}
function setScoutingActiveTab(tabId) {
  const state = ensureScoutingState();
  if (!scoutingTabs.some((tab) => tab.id === tabId)) {
    return;
  }
  state.activeTab = tabId;
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace();
}
function setScoutingDatabaseFilter(field, value) {
  const state = ensureScoutingState();
  state.databaseFilters = normalizeScoutingDatabaseFilters({
    ...state.databaseFilters,
    [field]: value,
  });
  writeScoutingState({ syncCentral: false });
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
  const view = cloneScoutingSavedView({
    name: safeName,
    filters: state.databaseFilters,
  });
  state.savedViews = [view, ...getScoutingSavedViews(state).filter((item) => item.name.toLowerCase() !== safeName.toLowerCase())];
  writeScoutingState();
  renderScoutingWorkspace({ preserveFocus: true });
}
function applyScoutingPresetView(presetId) {
  const preset = getScoutingSavedViewPresets().find((item) => item.id === normalizeScoutingText(presetId, 80));
  if (!preset) {
    return;
  }
  const state = ensureScoutingState();
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
  const results = getScoutingDatabaseResultsMarkup();
  const market = ui.scoutingWorkspace?.querySelector("[data-scouting-market-radar]");
  const summary = ui.scoutingWorkspace?.querySelector("[data-scouting-result-summary]");
  const grid = ui.scoutingWorkspace?.querySelector("[data-scouting-record-grid]");
  if (market) {
    market.outerHTML = renderScoutingMarketRadar(results.records);
  }
  if (summary) {
    summary.textContent = results.summary;
  }
  if (grid) {
    grid.innerHTML = results.html;
  }
}
function scheduleScoutingDatabaseResultsRender() {
  if (scoutingDatabaseResultsFrame) {
    cancelAnimationFrame(scoutingDatabaseResultsFrame);
  }
  scoutingDatabaseResultsFrame = requestAnimationFrame(() => {
    scoutingDatabaseResultsFrame = 0;
    renderScoutingDatabaseResults();
  });
}
function openScoutingRecordProfile(recordId) {
  const state = ensureScoutingState();
  state.selectedRecordId = normalizeScoutingText(recordId, 160);
  state.profileTab = "overview";
  state.profileRoleProfileId = "auto";
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace();
}
function closeScoutingRecordProfile() {
  const state = ensureScoutingState();
  state.selectedRecordId = "";
  writeScoutingState({ syncCentral: false });
  renderScoutingWorkspace();
}
function toggleScoutingFavorite(recordId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  if (!id) {
    return;
  }
  state.favoriteRecordIds = state.favoriteRecordIds.includes(id)
    ? state.favoriteRecordIds.filter((recordIdValue) => recordIdValue !== id)
    : [id, ...state.favoriteRecordIds];
  writeScoutingState();
  renderScoutingWorkspace();
}
function addScoutingRecordToList(recordId, listId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  const targetListId = normalizeScoutingText(listId, 120) || state.lists[0]?.id;
  state.lists = state.lists.map((list) =>
    list.id === targetListId
      ? cloneScoutingList({
          ...list,
          recordIds: list.recordIds.includes(id) ? list.recordIds : [id, ...list.recordIds],
        })
      : list
  );
  writeScoutingState();
  renderScoutingWorkspace();
}
function createScoutingList(name) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const listName = normalizeScoutingText(name, 80);
  if (!listName) {
    return;
  }
  const state = ensureScoutingState();
  state.lists = [cloneScoutingList({ name: listName, recordIds: [] }), ...state.lists];
  writeScoutingState();
  renderScoutingWorkspace();
}
function addScoutingRecordToShadow(recordId, slotId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  const slot = getScoutingShadowSlot(slotId);
  if (!id || !slot) {
    return;
  }
  const currentRecordIds = getScoutingShadowSlotRecordIds(slot.id, state);
  state.shadowXi.slots = {
    ...state.shadowXi.slots,
    [slot.id]: [id, ...currentRecordIds.filter((candidateId) => candidateId !== id)],
  };
  state.shadowXi.meta = {
    ...(state.shadowXi.meta && typeof state.shadowXi.meta === "object" ? state.shadowXi.meta : {}),
    [getScoutingShadowMetaKey(slot.id, id)]: {
      ...getScoutingShadowRecordMeta(slot.id, id, state),
      tag: getScoutingRecordAge(getScoutingRecordById(id)) <= 23 ? "u23" : currentRecordIds.length ? "backup" : "first-choice",
      updatedAt: new Date().toISOString(),
    },
  };
  state.shadowXi.selectedSlotId = slot.id;
  preferredScoutingShadowSlotId = slot.id;
  writeScoutingState();
  renderScoutingWorkspace({ preserveFocus: state.activeTab === "database" });
}
function removeScoutingRecordFromShadow(recordId, slotId) {
  if (!canEditScoutingWorkspace()) {
    return;
  }
  const state = ensureScoutingState();
  const id = normalizeScoutingText(recordId, 160);
  const slot = getScoutingShadowSlot(slotId);
  if (!id || !slot) {
    return;
  }
  const nextRecordIds = getScoutingShadowSlotRecordIds(slot.id, state).filter((candidateId) => candidateId !== id);
  state.shadowXi.slots = {
    ...state.shadowXi.slots,
  };
  if (nextRecordIds.length) {
    state.shadowXi.slots[slot.id] = nextRecordIds;
  } else {
    delete state.shadowXi.slots[slot.id];
  }
  if (state.shadowXi.meta && typeof state.shadowXi.meta === "object") {
    const nextMeta = { ...state.shadowXi.meta };
    delete nextMeta[getScoutingShadowMetaKey(slot.id, id)];
    state.shadowXi.meta = nextMeta;
  }
  state.shadowXi.selectedSlotId = slot.id;
  preferredScoutingShadowSlotId = slot.id;
  writeScoutingState();
  renderScoutingWorkspace();
}
export function render(context) {
  setScoutingContext(context);
  renderScoutingWorkspace();
}
export function renderAnalysisRoom(context) {
  setScoutingContext(context);
  renderScoutingAnalysisRoomWorkspace();
}
export function handleClick(event, context) {
  setScoutingContext(context);
  const closeProfileTrigger = event.target.closest("[data-close-scouting-profile]");
  if (closeProfileTrigger && (!event.target.closest("[data-scouting-profile-modal]") || closeProfileTrigger.tagName === "BUTTON")) {
    closeScoutingRecordProfile();
    return;
  }
  const profileTabTrigger = event.target.closest("[data-scouting-profile-tab]");
  if (profileTabTrigger) {
    setScoutingProfileTab(profileTabTrigger.dataset.scoutingProfileTab);
    return;
  }
  const selectShadowSlotTrigger = event.target.closest("[data-select-scouting-shadow-slot]");
  if (selectShadowSlotTrigger) {
    selectScoutingShadowSlot(selectShadowSlotTrigger.dataset.selectScoutingShadowSlot);
    return;
  }
  const clearShadowSlotTrigger = event.target.closest("[data-clear-scouting-shadow-slot-selection]");
  if (clearShadowSlotTrigger) {
    clearScoutingShadowSlotSelection();
    return;
  }
  const removeShadowRecordTrigger = event.target.closest("[data-remove-scouting-shadow-record]");
  if (removeShadowRecordTrigger) {
    event.stopPropagation();
    removeScoutingRecordFromShadow(
      removeShadowRecordTrigger.dataset.removeScoutingShadowRecord,
      removeShadowRecordTrigger.dataset.removeScoutingShadowSlot
    );
    return;
  }
  const moveShadowRecordTrigger = event.target.closest("[data-move-scouting-shadow-record]");
  if (moveShadowRecordTrigger) {
    event.stopPropagation();
    moveScoutingShadowRecord(
      moveShadowRecordTrigger.dataset.scoutingShadowSlot,
      moveShadowRecordTrigger.dataset.moveScoutingShadowRecord,
      moveShadowRecordTrigger.dataset.scoutingShadowDirection
    );
    return;
  }
  const tabTrigger = event.target.closest("[data-scouting-tab]");
  if (tabTrigger) {
    setScoutingActiveTab(tabTrigger.dataset.scoutingTab);
    return;
  }
  const retryDatabaseTrigger = event.target.closest("[data-scouting-retry-database]");
  if (retryDatabaseTrigger) {
    scoutingDatabaseError = "";
    queueScoutingDatabaseLoad();
    renderScoutingWorkspace();
    return;
  }
  const loadDatabaseTrigger = event.target.closest("[data-scouting-load-database]");
  if (loadDatabaseTrigger) {
    queueScoutingDatabaseLoad();
    renderScoutingWorkspace();
    return;
  }
  const applyImportTrigger = event.target.closest("[data-apply-scouting-import]");
  if (applyImportTrigger) {
    applyScoutingImportDraft();
    return;
  }
  const clearImportTrigger = event.target.closest("[data-clear-scouting-import]");
  if (clearImportTrigger) {
    clearScoutingImportedDatabase();
    return;
  }
  const applySavedViewTrigger = event.target.closest("[data-apply-scouting-saved-view]");
  if (applySavedViewTrigger) {
    applyScoutingSavedView(applySavedViewTrigger.dataset.applyScoutingSavedView);
    return;
  }
  const applyPresetViewTrigger = event.target.closest("[data-apply-scouting-preset-view]");
  if (applyPresetViewTrigger) {
    applyScoutingPresetView(applyPresetViewTrigger.dataset.applyScoutingPresetView);
    return;
  }
  const deleteSavedViewTrigger = event.target.closest("[data-delete-scouting-saved-view]");
  if (deleteSavedViewTrigger) {
    event.stopPropagation();
    deleteScoutingSavedView(deleteSavedViewTrigger.dataset.deleteScoutingSavedView);
    return;
  }
  const deleteContactTrigger = event.target.closest("[data-delete-scouting-contact]");
  if (deleteContactTrigger) {
    event.stopPropagation();
    deleteScoutingContactLogEntry(deleteContactTrigger.dataset.deleteScoutingContact);
    return;
  }
  const printProfileReportTrigger = event.target.closest("[data-print-scouting-profile-report]");
  if (printProfileReportTrigger) {
    printScoutingProfileReport(printProfileReportTrigger.dataset.printScoutingProfileReport);
    return;
  }
  const saveTargetTrigger = event.target.closest("[data-save-scouting-target]");
  if (saveTargetTrigger) {
    saveScoutingTarget(saveTargetTrigger.dataset.saveScoutingTarget, {
      status: saveTargetTrigger.dataset.scoutingTargetStatus,
      priority: saveTargetTrigger.dataset.scoutingTargetPriority,
    });
    return;
  }
      const removeTargetTrigger = event.target.closest("[data-remove-scouting-target]");
  if (removeTargetTrigger) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    removeScoutingTarget(removeTargetTrigger.dataset.removeScoutingTarget);
    return;
  }
  const deleteReportTrigger = event.target.closest("[data-delete-scouting-report]");
  if (deleteReportTrigger) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    deleteScoutingReport(deleteReportTrigger.dataset.deleteScoutingReport);
    return;
  }
  const createOppositionReportTrigger = event.target.closest("[data-create-scouting-opposition-report]");
  if (createOppositionReportTrigger) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    const snapshot = scoutingOppositionLatestSnapshot || getScoutingOppositionContext();
    const title = `Opposition memo: ${snapshot.team || "Scouting analysis"}`;
    const summary =
      scoutingOppositionLatestSnapshot?.memo ||
      getScoutingOppositionReportText() ||
      `Opposition memo generated from current analysis (${snapshot.team || "all teams"}, ${snapshot.season === "all" ? "All seasons" : snapshot.season}).`;
    createScoutingReportFromForm(title, "opposition", "", summary);
    return;
  }
  const createProfileReportTrigger = event.target.closest("[data-create-scouting-profile-report]");
  if (createProfileReportTrigger) {
    createScoutingReportForRecord(createProfileReportTrigger.dataset.createScoutingProfileReport);
    return;
  }
  const removeRoleModelTrigger = event.target.closest("[data-remove-scouting-role-model]");
  if (removeRoleModelTrigger) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    removeScoutingRoleModel(removeRoleModelTrigger.dataset.removeScoutingRoleModel);
    return;
  }
  const favoriteTrigger = event.target.closest("[data-toggle-scouting-favorite]");
  if (favoriteTrigger) {
    event.stopPropagation();
    toggleScoutingFavorite(favoriteTrigger.dataset.toggleScoutingFavorite);
    return;
  }
  const addToListTrigger = event.target.closest("[data-add-scouting-record-to-list]");
  if (addToListTrigger) {
    const listSelect = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-list]");
    addScoutingRecordToList(addToListTrigger.dataset.addScoutingRecordToList, listSelect?.value);
    return;
  }
  const addToShadowTrigger = event.target.closest("[data-add-scouting-record-to-shadow]");
  if (addToShadowTrigger) {
    event.stopPropagation();
    const slotSelect = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-slot]");
    addScoutingRecordToShadow(
      addToShadowTrigger.dataset.addScoutingRecordToShadow,
      addToShadowTrigger.dataset.scoutingShadowSlotId || slotSelect?.value
    );
    return;
  }
  const recordTrigger = event.target.closest("[data-open-scouting-record]");
  if (recordTrigger) {
    openScoutingRecordProfile(recordTrigger.dataset.openScoutingRecord);
  }
}
export function handleInput(event, context) {
  setScoutingContext(context);
  const importSeasonInput = event.target.closest("[data-scouting-import-season]");
  if (importSeasonInput) {
    if (scoutingImportDraft) {
      scoutingImportDraft = {
        ...scoutingImportDraft,
        seasonOverride: importSeasonInput.value,
      };
    }
    return;
  }
  const filterInput = event.target.closest("[data-scouting-filter]");
  if (!filterInput) {
    return;
  }
  setScoutingDatabaseFilter(filterInput.dataset.scoutingFilter, filterInput.value);
  if (isScoutingDatabaseLoaded()) {
    scheduleScoutingDatabaseResultsRender();
  }
}
export function handleChange(event, context) {
  setScoutingContext(context);
  const importFileInput = event.target.closest("[data-scouting-import-file]");
  if (importFileInput) {
    loadScoutingImportFile(importFileInput.files?.[0]).catch(() => {});
    return;
  }
  const importSheetInput = event.target.closest("[data-scouting-import-sheet]");
  if (importSheetInput) {
    setScoutingImportDraftPatch({ selectedSheet: importSheetInput.value });
    return;
  }
  const importMapInput = event.target.closest("[data-scouting-import-map]");
  if (importMapInput) {
    setScoutingImportMapField(importMapInput.dataset.scoutingImportMap, importMapInput.value);
    return;
  }
  const targetStatusTrigger = event.target.closest("[data-scouting-target-status]");
  if (targetStatusTrigger) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    updateScoutingTarget(targetStatusTrigger.dataset.scoutingTargetStatus, {
      status: normalizeScoutingTargetStatus(targetStatusTrigger.value),
    });
    return;
  }
  const targetPriorityTrigger = event.target.closest("[data-scouting-target-priority]");
  if (targetPriorityTrigger) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    updateScoutingTarget(targetPriorityTrigger.dataset.scoutingTargetPriority, {
      priority: normalizeScoutingTargetPriority(targetPriorityTrigger.value),
    });
    return;
  }
  const profileRoleTemplateTrigger = event.target.closest("[data-scouting-profile-role-template]");
  if (profileRoleTemplateTrigger) {
    setScoutingProfileRoleProfile(profileRoleTemplateTrigger.value);
    return;
  }
  const comparisonForm = event.target.closest("[data-scouting-comparison-form]");
  if (comparisonForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    const formData = new FormData(comparisonForm);
    setScoutingComparisonLab({
      slotId: formData.get("slotId"),
      metricId: formData.get("metricId"),
      playerIds: [formData.get("playerA"), formData.get("playerB"), formData.get("playerC"), formData.get("playerD")],
    });
    renderScoutingWorkspace();
    return;
  }
  const oppositionForm = event.target.closest("[data-scouting-opposition-form]");
  if (oppositionForm) {
    const formData = new FormData(oppositionForm);
    setScoutingOppositionFilters({
      team: formData.get("team"),
      season: formData.get("season"),
      minMinutes: formData.get("minMinutes"),
    });
    return;
  }
  const shadowTagTrigger = event.target.closest("[data-scouting-shadow-tag]");
  if (shadowTagTrigger) {
    setScoutingShadowRecordMeta(shadowTagTrigger.dataset.scoutingShadowSlot, shadowTagTrigger.dataset.scoutingShadowTag, {
      tag: shadowTagTrigger.value,
    });
    return;
  }
  const filterInput = event.target.closest("[data-scouting-filter]");
  if (!filterInput) {
    return;
  }
  setScoutingDatabaseFilter(filterInput.dataset.scoutingFilter, filterInput.value);
  if (isScoutingDatabaseLoaded()) {
    scheduleScoutingDatabaseResultsRender();
  }
}
export function handleSubmit(event, context) {
  setScoutingContext(context);
  const savedViewForm = event.target.closest("[data-scouting-saved-view-form]");
  if (savedViewForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    event.preventDefault();
    createScoutingSavedView(new FormData(savedViewForm).get("name"));
    savedViewForm.reset();
    return;
  }
  const contactForm = event.target.closest("[data-scouting-contact-form]");
  if (contactForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(contactForm);
    createScoutingContactLogEntry(contactForm.dataset.scoutingContactForm, {
      date: formData.get("date"),
      type: formData.get("type"),
      contact: formData.get("contact"),
      outcome: formData.get("outcome"),
      nextStep: formData.get("nextStep"),
      notes: formData.get("notes"),
    });
    contactForm.reset();
    return;
  }
  const marketForm = event.target.closest("[data-scouting-market-form]");
  if (marketForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(marketForm);
    saveScoutingMarketInfo(marketForm.dataset.scoutingMarketForm, {
      contractStatus: formData.get("contractStatus"),
      contractEnd: formData.get("contractEnd"),
      optionYears: formData.get("optionYears"),
      agent: formData.get("agent"),
      wageBand: formData.get("wageBand"),
      estimatedFee: formData.get("estimatedFee"),
      salaryRange: formData.get("salaryRange"),
      dealProbability: formData.get("dealProbability"),
      budgetImpact: formData.get("budgetImpact"),
      transferStatus: formData.get("transferStatus"),
      medicalLoad: formData.get("medicalLoad"),
      roleTranslation: formData.get("roleTranslation"),
      notes: formData.get("notes"),
    });
    return;
  }
  const targetForm = event.target.closest("[data-scouting-target-form]");
  if (targetForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    event.preventDefault();
    const recordId = targetForm.dataset.scoutingTargetForm;
    const formData = new FormData(targetForm);
    saveScoutingTarget(recordId, {
      status: formData.get("status"),
      priority: formData.get("priority"),
      slotId: formData.get("slotId"),
      notes: formData.get("notes"),
      owner: formData.get("owner"),
      nextAction: formData.get("nextAction"),
      nextActionDate: formData.get("nextActionDate"),
      lastContact: formData.get("lastContact"),
      decisionDeadline: formData.get("decisionDeadline"),
    });
    return;
  }
  const roleModelForm = event.target.closest("[data-scouting-role-model-form]");
  if (roleModelForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(roleModelForm);
    createScoutingRoleModel({
      name: formData.get("name"),
      slotId: formData.get("slotId"),
      metricId: formData.get("metricId"),
      minPercentile: formData.get("minPercentile"),
      notes: formData.get("notes"),
    });
    roleModelForm.reset();
    return;
  }
  const reportForm = event.target.closest("[data-scouting-report-form]");
  if (reportForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(reportForm);
    createScoutingReport({
      title: formData.get("title"),
      type: formData.get("type"),
      targetId: formData.get("targetId"),
      summary: formData.get("summary"),
      recommendation: formData.get("recommendation"),
      confidence: formData.get("confidence"),
      technical: formData.get("technical"),
      tactical: formData.get("tactical"),
      physical: formData.get("physical"),
      psychological: formData.get("psychological"),
      scoutType: formData.get("scoutType"),
    });
    if (reportForm.elements.type?.value !== "opposition") {
      reportForm.reset();
    }
    return;
  }
  const listForm = event.target.closest("[data-scouting-list-form]");
  if (!listForm) {
    return;
  }
  event.preventDefault();
  createScoutingList(new FormData(listForm).get("name"));
}
