import { createSquadScoutingProfileHelpers } from "./squad-scouting-profile-helpers.mjs";
import { createSquadScoutingSpiderRenderer } from "./squad-scouting-spider-renderer.mjs";

const playerProfileScoutingDatabaseStorageKey = "football-scouting-imported-database-v1";

const playerProfileScoutingRecordIndex = Object.freeze({
  id: 0,
  player: 1,
  team: 2,
  league: 4,
  season: 5,
  position: 6,
  minutes: 9,
  metrics: 14,
});

const playerProfileScoutingSpiderTemplates = Object.freeze({
  GK: [
    { label: "Exits", metricId: "exits-per-90" },
    { label: "Save rate", metricId: "save-rate" },
    { label: "Prevention", metricId: "prevented-goals-per-90" },
    { label: "Accuracy", metricId: "accurate-passes" },
    { label: "Short game", metricId: "average-pass-length-m", direction: "lower" },
    { label: "Pass volume", metricId: "passes-per-90" },
    { label: "Shots faced", metricId: "shots-against-per-90", direction: "lower" },
    { label: "Goals against", metricId: "conceded-goals-per-90", direction: "lower" },
  ],
  CB: [
    { label: "Def actions", metricId: "successful-defensive-actions-per-90" },
    { label: "Aerial", metricId: "aerial-duels-won" },
    { label: "Interceptions", metricId: "padj-interceptions" },
    { label: "Prog pass", metricId: "progressive-passes-per-90" },
    { label: "Short game", metricId: "average-pass-length-m", direction: "lower" },
    { label: "Accuracy", metricId: "accurate-passes" },
    { label: "Pass volume", metricId: "passes-per-90" },
  ],
  FB: [
    { label: "Prog runs", metricId: "progressive-runs-per-90" },
    { label: "Crossing", metricId: "crosses-per-90" },
    { label: "Def actions", metricId: "successful-defensive-actions-per-90" },
    { label: "Key passes", metricId: "key-passes-per-90" },
    { label: "xA", metricId: "xa-per-90" },
    { label: "Accuracy", metricId: "accurate-passes" },
    { label: "Prog pass", metricId: "progressive-passes-per-90" },
  ],
  MID: [
    { label: "Pass volume", metricId: "passes-per-90" },
    { label: "Prog pass", metricId: "progressive-passes-per-90" },
    { label: "Receives", metricId: "received-passes-per-90" },
    { label: "Def work", metricId: "successful-defensive-actions-per-90" },
    { label: "Creativity", metricId: "smart-passes-per-90" },
    { label: "Short game", metricId: "average-pass-length-m", direction: "lower" },
  ],
  WING: [
    { label: "Prog runs", metricId: "progressive-runs-per-90" },
    { label: "Dribbles", metricId: "dribbles-per-90" },
    { label: "Dribble win", metricId: "successful-dribbles" },
    { label: "Acceleration", metricId: "accelerations-per-90" },
    { label: "Box threat", metricId: "touches-in-box-per-90" },
    { label: "xA", metricId: "xa-per-90" },
  ],
  CF: [
    { label: "Shots", metricId: "shots-per-90" },
    { label: "xG", metricId: "xg-per-90" },
    { label: "Box touches", metricId: "touches-in-box-per-90" },
    { label: "Receives", metricId: "received-passes-per-90" },
    { label: "Key passes", metricId: "key-passes-per-90" },
    { label: "Goal conversion", metricId: "goal-conversion" },
    { label: "Shot assists", metricId: "shot-assists-per-90" },
  ],
  OTHER: [
    { label: "Passing", metricId: "accurate-passes" },
    { label: "Progression", metricId: "progressive-passes-per-90" },
    { label: "Duels", metricId: "duels-won" },
    { label: "Def work", metricId: "successful-defensive-actions-per-90" },
    { label: "Creation", metricId: "xa-per-90" },
    { label: "Pass volume", metricId: "passes-per-90" },
    { label: "Receives", metricId: "received-passes-per-90" },
  ],
});

export function createSquadScoutingRuntime(deps = {}) {
  const { escapeHtml, platformModuleLoader, renderWorkspace, win } = deps;
  let databaseLoadPromise = null;
  let storedDatabaseCache = { raw: null, database: null };
  const helperCache = new WeakMap();
  const rendererCache = new WeakMap();
  const playerSourceCache = new Map();

  function isPlayerProfileScoutingDatabase(database) {
    return Boolean(database && Array.isArray(database.records) && Array.isArray(database.metrics));
  }

  function getImportedPlayerProfileScoutingDatabase() {
    const database = win.__footballScienceImportedScoutingDatabase;
    return isPlayerProfileScoutingDatabase(database) ? database : null;
  }

  function getStoredPlayerProfileScoutingDatabase() {
    let raw = null;
    try {
      raw = win.localStorage?.getItem(playerProfileScoutingDatabaseStorageKey) || null;
    } catch {
      raw = null;
    }
    if (raw === storedDatabaseCache.raw) return storedDatabaseCache.database;
    let database = null;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      database = isPlayerProfileScoutingDatabase(parsed) ? parsed : null;
    } catch {
      database = null;
    }
    storedDatabaseCache = { raw, database };
    return database;
  }

  function getBundledPlayerProfileScoutingDatabase() {
    const profileDatabase = win.__footballScienceNwslScoutingProfileDatabase;
    if (isPlayerProfileScoutingDatabase(profileDatabase)) return profileDatabase;
    const bundledDatabase = win.__footballScienceBundledScoutingDatabase;
    if (isPlayerProfileScoutingDatabase(bundledDatabase)) return bundledDatabase;
    const activeDatabase = win.__footballScienceScoutingDatabase;
    return activeDatabase?.schema === "football-science-scouting-import" && isPlayerProfileScoutingDatabase(activeDatabase)
      ? activeDatabase
      : null;
  }

  function getPlayerProfileScoutingDatabase() {
    return (
      getImportedPlayerProfileScoutingDatabase() ||
      getStoredPlayerProfileScoutingDatabase() ||
      getBundledPlayerProfileScoutingDatabase()
    );
  }

  function queuePlayerProfileScoutingDatabaseLoad() {
    if (getBundledPlayerProfileScoutingDatabase() || databaseLoadPromise || !platformModuleLoader?.loadScript) {
      return;
    }
    databaseLoadPromise = platformModuleLoader
      .loadScript("scouting-import-nwsl-profile", "scouting-import-nwsl-profile-data.js", {
        id: "scoutingImportNwslProfileDataScript",
        required: false,
        async: true,
      })
      .then(() => {
        databaseLoadPromise = null;
        playerSourceCache.clear();
        renderWorkspace?.();
      })
      .catch(() => {
        databaseLoadPromise = null;
      });
  }

  const playerProfileScoutingHelpers = createSquadScoutingProfileHelpers({
    getDatabase: getPlayerProfileScoutingDatabase,
    recordIndex: playerProfileScoutingRecordIndex,
  });
  const {
    findPlayerProfileNwslScoutingRecord,
    getPlayerProfileNwslScoutingSeasonOptions,
    getPlayerProfileScoutingMetric,
    getPlayerProfileScoutingMetricValue,
    getPlayerProfileScoutingPercentile,
    getPlayerProfileScoutingPositionGroup,
  } = playerProfileScoutingHelpers;

  function getPlayerProfileScoutingHelpers(database) {
    if (!database) return null;
    const cached = helperCache.get(database);
    if (cached) return cached;
    const helpers = createSquadScoutingProfileHelpers({
      getDatabase: () => database,
      recordIndex: playerProfileScoutingRecordIndex,
    });
    helperCache.set(database, helpers);
    return helpers;
  }

  function getPlayerProfileScoutingCandidates() {
    const importedDatabase = getImportedPlayerProfileScoutingDatabase();
    const candidates = [
      importedDatabase,
      importedDatabase ? null : getStoredPlayerProfileScoutingDatabase(),
      getBundledPlayerProfileScoutingDatabase(),
    ].filter(Boolean);
    return candidates.filter((database, index) => candidates.indexOf(database) === index);
  }

  function isSafePlayerProfileScoutingMatch(playerName, records, helpers) {
    const targetName = helpers.normalizePlayerProfileScoutingText(playerName);
    const targetParts = helpers.getPlayerProfileScoutingNameParts(targetName);
    const targetFirst = targetParts[0] || "";
    const targetLast = targetParts.at(-1) || "";
    const matchedNames = new Set(
      records.map((record) => helpers.normalizePlayerProfileScoutingText(record?.[playerProfileScoutingRecordIndex.player])).filter(Boolean)
    );
    if (!targetFirst || !targetLast || !matchedNames.size) return false;
    return [...matchedNames].every((recordName) => {
      if (recordName === targetName) return true;
      const recordParts = helpers.getPlayerProfileScoutingNameParts(recordName);
      const recordFirst = recordParts[0] || "";
      const recordLast = recordParts.at(-1) || "";
      return recordParts.length === 2 && recordFirst.length === 1 && recordFirst === targetFirst[0] && recordLast === targetLast;
    });
  }

  function resolvePlayerProfileScoutingSource(player = {}) {
    const playerName = String(player.name || player.playerName || "").trim();
    const cacheKey = playerProfileScoutingHelpers.normalizePlayerProfileScoutingText(playerName);
    const databases = getPlayerProfileScoutingCandidates();
    const cached = playerSourceCache.get(cacheKey);
    if (cached && cached.databases.length === databases.length && cached.databases.every((database, index) => database === databases[index])) {
      return cached.source;
    }
    let source = { ambiguous: false, database: null, helpers: null };
    for (const database of databases) {
      const helpers = getPlayerProfileScoutingHelpers(database);
      const records = helpers.getPlayerProfileNwslScoutingRecords(player);
      if (!records.length) continue;
      if (!isSafePlayerProfileScoutingMatch(playerName, records, helpers)) {
        source = { ambiguous: true, database: null, helpers: null };
        break;
      }
      source = { ambiguous: false, database, helpers };
      break;
    }
    if (playerSourceCache.size >= 200) playerSourceCache.clear();
    playerSourceCache.set(cacheKey, { databases, source });
    return source;
  }

  function getPlayerProfileScoutingRenderer(database, helpers) {
    const cached = rendererCache.get(database);
    if (cached) return cached;
    const renderer = createSquadScoutingSpiderRenderer({
      escapeHtml,
      getDatabase: () => database,
      queueDatabaseLoad: queuePlayerProfileScoutingDatabaseLoad,
      findRecord: helpers.findPlayerProfileNwslScoutingRecord,
      getPositionGroup: helpers.getPlayerProfileScoutingPositionGroup,
      getMetricValue: helpers.getPlayerProfileScoutingMetricValue,
      getPercentile: helpers.getPlayerProfileScoutingPercentile,
      getMetric: helpers.getPlayerProfileScoutingMetric,
      templates: playerProfileScoutingSpiderTemplates,
      recordIndex: playerProfileScoutingRecordIndex,
    });
    rendererCache.set(database, renderer);
    return renderer;
  }

  const loadingScoutingSpiderRenderer = createSquadScoutingSpiderRenderer({
    escapeHtml,
    getDatabase: () => null,
    queueDatabaseLoad: queuePlayerProfileScoutingDatabaseLoad,
  });
  const noMatchScoutingSpiderRenderer = createSquadScoutingSpiderRenderer({
    escapeHtml,
    getDatabase: () => getBundledPlayerProfileScoutingDatabase() || { metrics: [], records: [] },
    queueDatabaseLoad: queuePlayerProfileScoutingDatabaseLoad,
    findRecord: () => null,
    templates: playerProfileScoutingSpiderTemplates,
    recordIndex: playerProfileScoutingRecordIndex,
  });

  return {
    ...playerProfileScoutingHelpers,
    getPlayerProfileScoutingDatabase,
    queuePlayerProfileScoutingDatabaseLoad,
    renderPlayerProfileScoutingSpider: (player, renderOptions = {}) => {
      const source = resolvePlayerProfileScoutingSource(player);
      if (!source.database || !source.helpers) {
        const renderer = !source.ambiguous && !getBundledPlayerProfileScoutingDatabase()
          ? loadingScoutingSpiderRenderer
          : noMatchScoutingSpiderRenderer;
        return renderer.render(player, renderOptions);
      }
      const seasonOptions = source.helpers.getPlayerProfileNwslScoutingSeasonOptions(player);
      const requestedSeason = String(renderOptions.selectedSeason || "").trim();
      const selectedSeason = seasonOptions.some((season) => season.value === requestedSeason)
        ? requestedSeason
        : seasonOptions[0]?.value || "";
      return getPlayerProfileScoutingRenderer(source.database, source.helpers).render(player, {
        ...renderOptions,
        seasonOptions,
        selectedSeason,
      });
    },
  };
}
