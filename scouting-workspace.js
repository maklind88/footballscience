let activeContext = null;
let scoutingTabs = [];
let scoutingShadowSlots = [];
let scoutingCoreMetricOptions = [];
let scoutingDatabaseLoadPromise = null;
let scoutingDatabaseError = "";
let scoutingDatabaseOptionCache = null;
let scoutingPercentileCache = new Map();
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
function cloneScoutingList(list = {}) {
  const name = normalizeScoutingText(list.name, 80) || "Scouting List";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const seen = new Set();
  const recordIds = (Array.isArray(list.recordIds) ? list.recordIds : [])
    .map((value) => normalizeScoutingText(value, 160))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  return {
    id: normalizeScoutingText(list.id, 120) || `scouting-list-${slug || "list"}-${Date.now()}`,
    name,
    recordIds,
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
    .then(() => renderScoutingWorkspace())
    .catch(() => renderScoutingWorkspace());
}
function getScoutingMetricOptions() {
  const database = getScoutingDatabase();
  return [...scoutingCoreMetricOptions, ...(database?.metrics || [])];
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
function renderScoutingRecordCard(record) {
  const state = ensureScoutingState();
  const recordId = getScoutingRecordId(record);
  const sortMetricId = state.databaseFilters.sortMetricId || (state.databaseFilters.metricId !== "all" ? state.databaseFilters.metricId : "minutes");
  const metric = getScoutingMetric(sortMetricId);
  const metricValue = getScoutingMetricValue(record, sortMetricId);
  const percentile = metric && sortMetricId !== "minutes" && sortMetricId !== "matches" ? getScoutingPercentile(record, sortMetricId) : null;
  const age = getScoutingRecordAge(record);
  const favorite = isScoutingRecordFavorited(recordId);
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
  return `
    <section class="scouting-database-panel">
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
  const favoriteRecords = state.favoriteRecordIds.map(getScoutingRecordById).filter(Boolean).slice(0, 8);
  const filledSlots = scoutingShadowSlots.filter((slot) => state.shadowXi.slots[slot.id]).length;
  return `
    <section class="scouting-shadow-layout">
      <div class="scouting-shadow-pitch" aria-label="Shadow eleven ${escapeHtml(state.shadowXi.formation)}">
        <span class="scouting-pitch-line is-half"></span>
        <span class="scouting-pitch-line is-box-top"></span>
        <span class="scouting-pitch-line is-box-bottom"></span>
        ${scoutingShadowSlots
          .map((slot) => {
            const record = getScoutingRecordById(state.shadowXi.slots[slot.id]);
            const trigger = record ? `data-open-scouting-record="${escapeHtml(getScoutingRecordId(record))}"` : `data-scouting-tab="database"`;
            return `
              <button type="button" class="scouting-shadow-slot${record ? " is-filled" : ""}" style="--x:${slot.x}%;--y:${slot.y}%;" ${trigger}>
                <span>${escapeHtml(slot.label)}</span>
                <strong>${record ? escapeHtml(getScoutingRecordName(record)) : "Add player"}</strong>
                <em>${record ? escapeHtml(getScoutingRecordTeam(record) || getScoutingRecordLeague(record)) : escapeHtml(slot.position)}</em>
              </button>
            `;
          })
          .join("")}
      </div>
      <aside class="scouting-shadow-side">
        <div class="scouting-shadow-card">
          <p class="placeholder-tag">Squad planning</p>
          <h2>${filledSlots}/11 shadow slots filled</h2>
          <p>Build the succession plan by assigning tracked players to future roles.</p>
          <button type="button" class="scouting-primary-button" data-scouting-tab="database">Open database</button>
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
function renderScoutingFuturePanel(type) {
  const copy =
    type === "opposition"
      ? "Opposition workflows will connect team tendencies, player threats and match-plan notes."
      : "Reports will turn shortlisted players into recruitment dossiers, role fit notes and decision memos.";
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
  const goalMetricId = getScoutingMetricIdByLabels(["Goals"]);
  const xgMetricId = getScoutingMetricIdByLabels(["xG"]);
  const assistMetricId = getScoutingMetricIdByLabels(["Assists"]);
  const listOptions = state.lists
    .map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`)
    .join("");
  const slotOptions = scoutingShadowSlots
    .map((slot) => `<option value="${escapeHtml(slot.id)}">${escapeHtml(slot.label)} - ${escapeHtml(slot.position)}</option>`)
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
            <button type="button" class="scouting-primary-button" data-add-scouting-record-to-shadow="${escapeHtml(recordId)}" ${canEdit ? "" : "disabled"}>Assign</button>
          </div>
        </header>
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
  if (state.activeTab === "reports" || state.activeTab === "opposition") {
    return renderScoutingFuturePanel(state.activeTab);
  }
  return isScoutingDatabaseLoaded() ? renderScoutingShadowXi() : renderScoutingDatabasePanel();
}
function renderScoutingWorkspace() {
  if (!ui.scoutingWorkspace) {
    return;
  }
  const state = ensureScoutingState();
  if (["shadow-xi", "database", "lists"].includes(state.activeTab)) {
    queueScoutingDatabaseLoad();
  }
  const database = getScoutingDatabase();
  const playerCount = database?.records?.length || 0;
  const sheetCount = database?.sheets?.length || 0;
  const filledSlots = scoutingShadowSlots.filter((slot) => state.shadowXi.slots[slot.id]).length;
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
          <span><strong>${filledSlots}/11</strong> Shadow XI</span>
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
  const slot = scoutingShadowSlots.find((candidate) => candidate.id === slotId);
  if (!id || !slot) {
    return;
  }
  state.shadowXi.slots = {
    ...state.shadowXi.slots,
    [slot.id]: id,
  };
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
    const slotSelect = ui.scoutingWorkspace?.querySelector("[data-scouting-profile-slot]");
    addScoutingRecordToShadow(addToShadowTrigger.dataset.addScoutingRecordToShadow, slotSelect?.value);
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
    renderScoutingDatabaseResults();
  }
}
export function handleChange(event, context) {
  setScoutingContext(context);
  const filterInput = event.target.closest("[data-scouting-filter]");
  if (!filterInput) {
    return;
  }
  setScoutingDatabaseFilter(filterInput.dataset.scoutingFilter, filterInput.value);
  if (isScoutingDatabaseLoaded()) {
    renderScoutingDatabaseResults();
  }
}
export function handleSubmit(event, context) {
  setScoutingContext(context);
  const listForm = event.target.closest("[data-scouting-list-form]");
  if (!listForm) {
    return;
  }
  event.preventDefault();
  createScoutingList(new FormData(listForm).get("name"));
}
