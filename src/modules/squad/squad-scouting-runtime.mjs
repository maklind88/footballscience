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
  ],
  CB: [
    { label: "Def actions", metricId: "successful-defensive-actions-per-90" },
    { label: "Aerial", metricId: "aerial-duels-won" },
    { label: "Interceptions", metricId: "padj-interceptions" },
    { label: "Prog pass", metricId: "progressive-passes-per-90" },
    { label: "Short game", metricId: "average-pass-length-m", direction: "lower" },
  ],
  FB: [
    { label: "Prog runs", metricId: "progressive-runs-per-90" },
    { label: "Crossing", metricId: "crosses-per-90" },
    { label: "Def actions", metricId: "successful-defensive-actions-per-90" },
    { label: "Key passes", metricId: "key-passes-per-90" },
    { label: "xA", metricId: "xa-per-90" },
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
  ],
  OTHER: [
    { label: "Passing", metricId: "accurate-passes" },
    { label: "Progression", metricId: "progressive-passes-per-90" },
    { label: "Duels", metricId: "duels-won" },
    { label: "Def work", metricId: "successful-defensive-actions-per-90" },
    { label: "Creation", metricId: "xa-per-90" },
  ],
});

export function createSquadScoutingRuntime(deps = {}) {
  const { escapeHtml, platformModuleLoader, renderWorkspace, win } = deps;
  let databaseLoadPromise = null;

  function getPlayerProfileScoutingDatabase() {
    const importedDatabase = win.__footballScienceImportedScoutingDatabase;
    if (importedDatabase && Array.isArray(importedDatabase.records) && Array.isArray(importedDatabase.metrics)) {
      return importedDatabase;
    }
    const bundledDatabase = win.__footballScienceScoutingDatabase;
    if (bundledDatabase && Array.isArray(bundledDatabase.records) && Array.isArray(bundledDatabase.metrics)) {
      return bundledDatabase;
    }
    try {
      const stored = win.localStorage?.getItem(playerProfileScoutingDatabaseStorageKey);
      if (!stored) {
        return null;
      }
      const parsed = JSON.parse(stored);
      return parsed && Array.isArray(parsed.records) && Array.isArray(parsed.metrics) ? parsed : null;
    } catch {
      return null;
    }
  }

  function queuePlayerProfileScoutingDatabaseLoad() {
    if (getPlayerProfileScoutingDatabase() || databaseLoadPromise || !platformModuleLoader?.loadScript) {
      return;
    }
    databaseLoadPromise = platformModuleLoader
      .loadScript("scouting-import-data", "scouting-import-data.js", {
        id: "scoutingImportDataScript",
        required: false,
        async: true,
      })
      .then(() => {
        databaseLoadPromise = null;
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
    getPlayerProfileScoutingMetric,
    getPlayerProfileScoutingMetricValue,
    getPlayerProfileScoutingPercentile,
    getPlayerProfileScoutingPositionGroup,
  } = playerProfileScoutingHelpers;
  const squadScoutingSpiderRenderer = createSquadScoutingSpiderRenderer({
    escapeHtml,
    getDatabase: getPlayerProfileScoutingDatabase,
    queueDatabaseLoad: queuePlayerProfileScoutingDatabaseLoad,
    findRecord: findPlayerProfileNwslScoutingRecord,
    getPositionGroup: getPlayerProfileScoutingPositionGroup,
    getMetricValue: getPlayerProfileScoutingMetricValue,
    getPercentile: getPlayerProfileScoutingPercentile,
    getMetric: getPlayerProfileScoutingMetric,
    templates: playerProfileScoutingSpiderTemplates,
    recordIndex: playerProfileScoutingRecordIndex,
  });

  return {
    ...playerProfileScoutingHelpers,
    getPlayerProfileScoutingDatabase,
    queuePlayerProfileScoutingDatabaseLoad,
    renderPlayerProfileScoutingSpider: (player, renderOptions = {}) => squadScoutingSpiderRenderer.render(player, renderOptions),
  };
}
