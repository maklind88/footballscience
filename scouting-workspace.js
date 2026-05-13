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
let preferredScoutingShadowSlotId = "";
let scoutingDatabaseResultsFrame = 0;
const scoutingStatusFallbackOptions = [
  { value: "new", label: "New" },
  { value: "monitoring", label: "Monitoring" },
  { value: "shortlist", label: "Shortlist" },
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
function cloneScoutingList(list = {}) {
  const name = normalizeScoutingText(list.name, 80) || "Scouting List";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: normalizeScoutingText(list.id, 120) || `scouting-list-${slug || "list"}-${Date.now()}`,
    name,
    recordIds: normalizeScoutingRecordIds(list.recordIds),
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
        scoutingPercentileCache = new Map();
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
function queueScoutingDatabaseLoad() {
  if (isScoutingDatabaseLoaded() || scoutingDatabaseLoadPromise) {
    return;
  }
  ensureScoutingDatabaseLoaded()
    .then(() => renderScoutingWorkspace({ preserveFocus: true }))
    .catch(() => renderScoutingWorkspace({ preserveFocus: true }));
}
function getScoutingMetricOptions() {
  const database = getScoutingDatabase();
  return [...scoutingCoreMetricOptions, ...(database?.metrics || [])];
}
function getScoutingStatusOptions() {
  return Array.isArray(scoutingStatusOptions) && scoutingStatusOptions.length
    ? scoutingStatusOptions
    : scoutingStatusFallbackOptions;
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
    playerIds: [playerIds[0] || "", playerIds[1] || ""],
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
function getScoutingMetric(metricId) {
  const id = normalizeScoutingText(metricId, 120);
  return getScoutingMetricOptions().find((metric) => metric.id === id) || null;
}
function getScoutingMetricIdByLabels(labels = []) {
  const metrics = getScoutingMetricOptions();
  for (const label of labels) {
    const needle = normalizeScoutingText(label, 120).toLowerCase();
    if (!needle) {
      continue;
    }
    const match = metrics.find((metric) => String(metric.label || "").toLowerCase().includes(needle));
    if (match) {
      return match.id;
    }
  }
  return "";
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
  const value = metrics && typeof metrics === "object" ? Number(metrics[id]) : NaN;
  return Number.isFinite(value) ? value : null;
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
  const filters = ensureScoutingState().databaseFilters;
  const query = filters.query.toLowerCase();
  const minMinutes = Number(filters.minMinutes) || 0;
  const maxAge = Number(filters.maxAge);
  const metricMin = Number(filters.metricMin);
  const metricFilterId = filters.metricId !== "all" ? filters.metricId : "";
  const sortMetricId = filters.sortMetricId || metricFilterId || "minutes";
  return [...(database?.records || [])]
    .filter((record) => {
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
      if (metricFilterId && Number.isFinite(metricMin) && metricMin > 0) {
        const percentile = getScoutingPercentile(record, metricFilterId);
        if (!Number.isFinite(percentile) || percentile < metricMin) {
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
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const metric = getScoutingMetric(sortMetricId);
      if (!metric || sortMetricId === "minutes" || sortMetricId === "matches") {
        return (getScoutingMetricValue(b, sortMetricId) || 0) - (getScoutingMetricValue(a, sortMetricId) || 0);
      }
      return (getScoutingPercentile(b, sortMetricId) || 0) - (getScoutingPercentile(a, sortMetricId) || 0);
    });
}
function getScoutingRadarTemplate(record) {
  const group = getScoutingPositionGroup(record);
  const templates = {
    GK: [
      { label: "Shot stopping", labels: ["Save rate", "Save %", "Shots against saved"] },
      { label: "Goal prevention", labels: ["Prevented goals", "Goals prevented", "xG against"] },
      { label: "Area control", labels: ["Exits", "Aerial duels"] },
      { label: "Distribution", labels: ["Pass accuracy", "Long passes", "Passes"] },
      { label: "Availability", labels: ["Minutes"] },
    ],
    CB: [
      { label: "Def duels", labels: ["Defensive duels won", "Defensive duels"] },
      { label: "Aerial", labels: ["Aerial duels won", "Aerial duels"] },
      { label: "Interceptions", labels: ["Interceptions"] },
      { label: "Build-up", labels: ["Progressive passes", "Forward passes"] },
      { label: "Passing", labels: ["Pass accuracy", "Passes"] },
    ],
    FB: [
      { label: "Crossing", labels: ["Crosses", "Accurate crosses"] },
      { label: "Progression", labels: ["Progressive runs", "Progressive passes"] },
      { label: "1v1 defending", labels: ["Defensive duels won", "Defensive duels"] },
      { label: "Ball carrying", labels: ["Dribbles", "Successful dribbles"] },
      { label: "Final third", labels: ["Passes to final third", "Passes to penalty area"] },
    ],
    MID: [
      { label: "Progression", labels: ["Progressive passes", "Forward passes"] },
      { label: "Creation", labels: ["xA", "Shot assists", "Key passes"] },
      { label: "Security", labels: ["Pass accuracy", "Accurate passes"] },
      { label: "Duels", labels: ["Duels won", "Defensive duels"] },
      { label: "Recoveries", labels: ["Interceptions", "Recoveries"] },
    ],
    WING: [
      { label: "Chance creation", labels: ["xA", "Shot assists", "Key passes"] },
      { label: "Dribbling", labels: ["Successful dribbles", "Dribbles"] },
      { label: "Progression", labels: ["Progressive runs", "Progressive passes"] },
      { label: "Box threat", labels: ["Touches in box", "Touches in penalty area", "xG"] },
      { label: "Output", labels: ["Goals", "Assists"] },
    ],
    CF: [
      { label: "Goals", labels: ["Goals"] },
      { label: "xG", labels: ["xG"] },
      { label: "Shots", labels: ["Shots"] },
      { label: "Box presence", labels: ["Touches in box", "Touches in penalty area"] },
      { label: "Link play", labels: ["Received passes", "Passes"] },
    ],
    OTHER: [
      { label: "Minutes", labels: ["Minutes"] },
      { label: "Duels", labels: ["Duels won", "Duels"] },
      { label: "Passing", labels: ["Pass accuracy", "Passes"] },
      { label: "Progression", labels: ["Progressive passes", "Progressive runs"] },
      { label: "Creation", labels: ["xA", "Shot assists"] },
    ],
  };
  const used = new Set();
  return (templates[group] || templates.OTHER)
    .map((item) => {
      const metricId = getScoutingMetricIdByLabels(item.labels);
      if (!metricId || used.has(metricId)) {
        return null;
      }
      used.add(metricId);
      return { ...item, metricId };
    })
    .filter(Boolean);
}
function renderScoutingRadar(record) {
  const template = getScoutingRadarTemplate(record);
  if (!template.length) {
    return `<div class="scouting-radar-empty">No comparable metric profile yet.</div>`;
  }
  const center = 110;
  const radius = 74;
  const angleOffset = -Math.PI / 2;
  const points = template.map((item, index) => {
    const percentile = getScoutingPercentile(record, item.metricId) || 1;
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
function getScoutingRoleFitScore(record) {
  const template = getScoutingRadarTemplate(record);
  const percentiles = template
    .map((item) => getScoutingPercentile(record, item.metricId))
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
  const filters = state.databaseFilters;
  const options = getScoutingDatabaseOptions();
  const metricOptions = getScoutingMetricOptions();
  return `
    <div class="scouting-database-controls">
      <label>
        <span>Search</span>
        <input type="search" value="${escapeHtml(filters.query)}" placeholder="Player, club, league" data-scouting-filter="query" />
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
        <span>Sort by</span>
        <select data-scouting-filter="sortMetricId">
          ${metricOptions.map((metric) => `<option value="${escapeHtml(metric.id)}" ${filters.sortMetricId === metric.id ? "selected" : ""}>${escapeHtml(metric.label)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}
function getScoutingDatabaseResultsMarkup() {
  const records = getFilteredScoutingDatabaseRecords();
  const visibleRecords = records.slice(0, 72);
  const summary = `${records.length.toLocaleString("en-US")} players match. Showing ${visibleRecords.length.toLocaleString("en-US")}.`;
  return {
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
    return `
      <section class="scouting-load-panel">
        <h2>Loading the scouting database</h2>
        <p>Preparing the Wyscout-based Excel import, player profiles and filter engine.</p>
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
      ${renderScoutingDatabaseControls()}
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
                            return `
                              <div class="scouting-shadow-player-row" style="--stack:${index};">
                                <button type="button" class="scouting-shadow-player" data-open-scouting-record="${escapeHtml(recordId)}">
                                  <strong>${escapeHtml(getScoutingRecordName(record))}</strong>
                                  <span>${escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordLeague(record))}</span>
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
                  <details class="scouting-shadow-depth" ${records.length ? "open" : ""}>
                    <summary><span>${escapeHtml(slot.label)}</span><strong>${records.length}</strong></summary>
                    <div>
                      ${
                        records.length
                          ? records
                              .map(
                                (record) => `
                                  <button type="button" data-open-scouting-record="${escapeHtml(getScoutingRecordId(record))}">
                                    ${escapeHtml(getScoutingRecordName(record))}
                                    <span>${escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordPosition(record))}</span>
                                  </button>
                                `
                              )
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
    <article class="scouting-target-card">
      <div class="scouting-target-main">
        <strong>${escapeHtml(recordName)}</strong>
        <span>${escapeHtml(slot ? slot.label : "Open")}</span>
      </div>
      <p class="scouting-note-line">${escapeHtml(recordClub)} · ${escapeHtml(target.position || "Unknown position")} · ${age ? `${escapeHtml(age)} yrs` : ""} · ${formatScoutingNumber(minutes)} min</p>
      <p class="scouting-fit-line">${escapeHtml(target.fit || "n/a")} · ${escapeHtml(slot ? slot.position : "Open role")} · ${record ? `${escapeHtml(getScoutingRoleFitLabel(targetRoleFit))}` : "No profile score"}</p>
      <p class="scouting-note-line">${escapeHtml(target.notes || "No notes yet")}</p>
      <p class="scouting-note-line">${escapeHtml(bestSignal ? `${bestSignal.metric.label} · P${bestSignal.percentile}` : target.fit ? `Status: ${escapeHtml(target.fit)}` : "No standout signal")}</p>
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
              <div class="scouting-target-board-column">
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
  const selectedPlayerA = normalizeScoutingText(lab.playerIds?.[0], 160);
  const selectedPlayerB = normalizeScoutingText(lab.playerIds?.[1], 160);
  const playerOptions = candidates
    .map((record) => {
      const recordId = getScoutingRecordId(record);
      return `<option value="${escapeHtml(recordId)}" ${selectedPlayerA === recordId || selectedPlayerB === recordId ? "selected" : ""}>${escapeHtml(getScoutingRecordName(record))} · ${escapeHtml(getScoutingRecordTeam(record) || "No club")}</option>`;
    })
    .join("");
  const uniquePlayerIds = Array.from(new Set(lab.playerIds.map((recordId) => normalizeScoutingText(recordId, 160)).filter(Boolean))).slice(0, 2);
  const playerRecords = uniquePlayerIds
    .map((recordId) => ({
      recordId,
      record: getScoutingRecordById(recordId),
    }))
    .filter(({ record }) => Boolean(record));
  const canCompare = playerRecords.length === 2;
  const comparisonSnapshot = canCompare
    ? playerRecords.map(({ record }) => ({
        record,
        value: getScoutingMetricValue(record, metric?.id),
        percentile: metric ? getScoutingPercentile(record, metric.id) : null,
      }))
    : [];
  const metricDelta =
    canCompare && comparisonSnapshot.every((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.percentile))
      ? `${comparisonSnapshot[0].percentile >= comparisonSnapshot[1].percentile ? `${escapeHtml(getScoutingRecordName(comparisonSnapshot[0].record))} leads` : `${escapeHtml(getScoutingRecordName(comparisonSnapshot[1].record))} leads`} by ${formatScoutingNumber(Math.abs((comparisonSnapshot[0].percentile || 0) - (comparisonSnapshot[1].percentile || 0)))} percentile points`
      : "";
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
          ${playerOptions}
        </select>
        <select name="playerB" data-scouting-comparison-player="b" ${canEdit ? "" : "disabled"}>
          <option value="">Player B</option>
          ${playerOptions}
        </select>
      </form>
      <p class="scouting-comparison-summary">
        ${metric ? `Metric: ${escapeHtml(metric.label)}` : "Select a metric"} ${canCompare ? `· ${metricDelta}` : "· Pick two players to compare"}
      </p>
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
                      <button type="button" class="scouting-secondary-button" data-open-scouting-record="${escapeHtml(entry.recordId)}">Open profile</button>
                    </article>
                  `;
                })
                .join("")
            : `<p class="scouting-muted">Choose two players and a role to compare by role-relevant metric.</p>`
        }
      </div>
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
  return `
    <div class="scouting-reports-shell">
      ${renderScoutingTargetsPanel()}
      ${renderScoutingComparisonLabPanel()}
      ${renderScoutingRoleModelsPanel()}
      ${renderScoutingReportsPanel()}
    </div>
  `;
}
function renderScoutingFuturePanel(type) {
  const copy =
    type === "opposition"
      ? "Opposition scouting will connect team tendencies, player threats and match-plan notes."
      : "Reports will turn shortlisted players into recruitment dossiers, role-fit notes and decision memos.";
  return `
    <section class="scouting-load-panel">
      <h2>${type === "opposition" ? "Opposition scouting" : "Scouting reports"}</h2>
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
  const profileMetrics = getScoutingRadarTemplate(record)
    .map((item) => {
      const value = getScoutingMetricValue(record, item.metricId);
      const percentile = getScoutingPercentile(record, item.metricId);
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
  const roleFitScore = getScoutingRoleFitScore(record);
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
              <button type="submit" class="scouting-primary-button" ${canEdit ? "" : "disabled"}>
                ${target ? "Update pipeline" : "Add pipeline"}
              </button>
            </form>
          </div>
        </header>
        <div class="scouting-profile-decision-strip">
          <div>
            <span>Role fit</span>
            <strong class="is-${escapeHtml(getScoutingRoleFitTier(roleFitScore))}">${Number.isFinite(roleFitScore) ? `P${escapeHtml(roleFitScore)}` : "n/a"}</strong>
            <em>${escapeHtml(getScoutingRoleFitLabel(roleFitScore))}</em>
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
        <div class="scouting-profile-grid">
          <section class="scouting-profile-radar">
            ${renderScoutingRadar(record)}
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
                      <em>${escapeHtml(item.metric.label)}: ${escapeHtml(formatScoutingNumber(item.value))}</em>
                    </div>
                  `
                )
                .join("")}
            </div>
          </section>
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
  return isScoutingDatabaseLoaded() ? renderScoutingShadowXi() : renderScoutingDatabasePanel();
}
function renderScoutingWorkspace(options = {}) {
  if (!ui.scoutingWorkspace) {
    return;
  }
  const focusSnapshot = options.preserveFocus ? getScoutingFocusSnapshot() : null;
  const state = ensureScoutingState();
  if (["shadow-xi", "database", "lists"].includes(state.activeTab)) {
    queueScoutingDatabaseLoad();
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
function renderScoutingDatabaseResults() {
  const results = getScoutingDatabaseResultsMarkup();
  const summary = ui.scoutingWorkspace?.querySelector("[data-scouting-result-summary]");
  const grid = ui.scoutingWorkspace?.querySelector("[data-scouting-record-grid]");
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
  state.shadowXi.selectedSlotId = slot.id;
  preferredScoutingShadowSlotId = slot.id;
  writeScoutingState();
  renderScoutingWorkspace();
}
export function render(context) {
  setScoutingContext(context);
  renderScoutingWorkspace();
}
export function handleClick(event, context) {
  setScoutingContext(context);
  const closeProfileTrigger = event.target.closest("[data-close-scouting-profile]");
  if (closeProfileTrigger && (!event.target.closest("[data-scouting-profile-modal]") || closeProfileTrigger.tagName === "BUTTON")) {
    closeScoutingRecordProfile();
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
  const comparisonForm = event.target.closest("[data-scouting-comparison-form]");
  if (comparisonForm) {
    if (!canEditScoutingWorkspace()) {
      return;
    }
    const formData = new FormData(comparisonForm);
    setScoutingComparisonLab({
      slotId: formData.get("slotId"),
      metricId: formData.get("metricId"),
      playerIds: [formData.get("playerA"), formData.get("playerB")],
    });
    renderScoutingWorkspace();
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
    createScoutingReportFromForm(
      formData.get("title"),
      formData.get("type"),
      formData.get("targetId"),
      formData.get("summary")
    );
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
