export function createSquadScoutingProfileHelpers(options = {}) {
  const getDatabase = typeof options.getDatabase === "function" ? options.getDatabase : () => null;
  const recordIndex = options.recordIndex || {};
  let metricIndexCache = { database: null, byId: new Map() };
  let playerRecordCache = { database: null, byName: new Map() };
  let percentileCache = { database: null, cohorts: new Map(), values: new Map() };

  function ensureDatabaseCaches(database) {
    if (playerRecordCache.database !== database) {
      playerRecordCache = { database, byName: new Map() };
    }
    if (percentileCache.database !== database) {
      percentileCache = { database, cohorts: new Map(), values: new Map() };
    }
  }

  function normalizePlayerProfileScoutingText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getPlayerProfileScoutingNameParts(value) {
    return normalizePlayerProfileScoutingText(value).split(" ").filter(Boolean);
  }

  function doPlayerProfileScoutingNamesMatch(playerName, recordName) {
    const playerText = normalizePlayerProfileScoutingText(playerName);
    const recordText = normalizePlayerProfileScoutingText(recordName);
    if (!playerText || !recordText) return false;
    if (playerText === recordText || playerText.includes(recordText) || recordText.includes(playerText)) return true;
    const playerParts = getPlayerProfileScoutingNameParts(playerName);
    const recordParts = getPlayerProfileScoutingNameParts(recordName);
    const playerLast = playerParts.at(-1);
    const recordLast = recordParts.at(-1);
    const playerFirst = playerParts[0] || "";
    const recordFirst = recordParts[0] || "";
    return Boolean(playerLast && recordLast && playerLast === recordLast && playerFirst[0] && playerFirst[0] === recordFirst[0]);
  }

  function getPlayerProfileScoutingMetric(database, metricId) {
    const index = getPlayerProfileScoutingMetricIndex(database, metricId);
    return index >= 0 ? database.metrics[index] || null : null;
  }

  function getPlayerProfileScoutingMetricIndex(database, metricId) {
    if (!database) return -1;
    if (metricIndexCache.database !== database) {
      metricIndexCache = {
        database,
        byId: new Map((database.metrics || []).map((metric, index) => [metric.id, index])),
      };
    }
    const index = metricIndexCache.byId.get(metricId);
    return Number.isInteger(index) ? index : -1;
  }

  function getPlayerProfileScoutingMetricValue(record, metricId) {
    const database = getDatabase();
    const metrics = record?.[recordIndex.metrics];
    const rawValue = Array.isArray(metrics)
      ? metrics[getPlayerProfileScoutingMetricIndex(database, metricId)]
      : metrics && typeof metrics === "object"
      ? metrics[metricId]
      : null;
    const value = rawValue === null || rawValue === undefined || rawValue === "" ? NaN : Number(rawValue);
    return Number.isFinite(value) ? value : null;
  }

  function getPlayerProfileScoutingMinutes(record) {
    const minutes = Number(record?.[recordIndex.minutes]);
    return Number.isFinite(minutes) ? minutes : 0;
  }

  function getPlayerProfileScoutingSeason(record) {
    return String(record?.[recordIndex.season] || "").trim();
  }

  function getPlayerProfileScoutingSeasonYearValue(recordOrSeason) {
    const season = typeof recordOrSeason === "string" ? recordOrSeason : getPlayerProfileScoutingSeason(recordOrSeason);
    const years = (season.match(/\d{4}/g) || []).map(Number).filter(Number.isFinite);
    return years.length ? Math.max(...years) : 0;
  }

  function getPlayerProfileScoutingPositionGroup(recordOrPosition, player = null) {
    const position = Array.isArray(recordOrPosition)
      ? recordOrPosition[recordIndex.position]
      : recordOrPosition || player?.position || player?.primaryRole || player?.role || "";
    const tokens = String(position ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    if (tokens.some((token) => token.includes("GK"))) return "GK";
    if (tokens.some((token) => ["CB", "RCB", "LCB"].includes(token))) return "CB";
    if (tokens.some((token) => ["RB", "LB", "RWB", "LWB", "WB"].includes(token))) return "FB";
    if (tokens.some((token) => ["DMF", "CMF", "RCMF", "LCMF", "AMF", "MF", "8", "6", "10"].includes(token))) return "MID";
    if (tokens.some((token) => ["RW", "LW", "RWF", "LWF", "WF", "W"].includes(token))) return "WING";
    if (tokens.some((token) => ["CF", "ST", "FW", "F"].includes(token))) return "CF";
    if (player?.roleGroup === "goalkeeper") return "GK";
    if (player?.roleGroup === "defender") return "CB";
    if (player?.roleGroup === "midfielder") return "MID";
    if (player?.roleGroup === "forward") return "CF";
    return "OTHER";
  }

  function isPlayerProfileNwslScoutingRecord(record) {
    const league = normalizePlayerProfileScoutingText(record?.[recordIndex.league]);
    return league.includes("nwsl") || league.includes("national women");
  }

  function getPlayerProfileNwslScoutingRecords(player) {
    const database = getDatabase();
    const playerName = normalizePlayerProfileScoutingText(player?.name || player?.playerName);
    if (!database || !playerName) return [];
    ensureDatabaseCaches(database);
    const cached = playerRecordCache.byName.get(playerName);
    if (cached) return cached;
    const records = database.records
      .filter((record) => isPlayerProfileNwslScoutingRecord(record))
      .filter((record) => doPlayerProfileScoutingNamesMatch(playerName, record?.[recordIndex.player]));
    if (playerRecordCache.byName.size >= 200) playerRecordCache.byName.clear();
    playerRecordCache.byName.set(playerName, records);
    return records;
  }

  function sortPlayerProfileScoutingRecords(first, second) {
    return (
      getPlayerProfileScoutingSeasonYearValue(second) - getPlayerProfileScoutingSeasonYearValue(first) ||
      getPlayerProfileScoutingMinutes(second) - getPlayerProfileScoutingMinutes(first)
    );
  }

  function getPlayerProfileNwslScoutingSeasonOptions(player) {
    const seasons = new Map();
    getPlayerProfileNwslScoutingRecords(player).forEach((record) => {
      const season = getPlayerProfileScoutingSeason(record);
      if (!season) return;
      const current = seasons.get(season);
      const minutes = getPlayerProfileScoutingMinutes(record);
      if (!current || minutes > current.minutes) {
        seasons.set(season, {
          label: season,
          minutes,
          value: season,
          year: getPlayerProfileScoutingSeasonYearValue(season),
        });
      }
    });
    return [...seasons.values()].sort((first, second) => second.year - first.year || second.minutes - first.minutes);
  }

  function findPlayerProfileNwslScoutingRecord(player, options = {}) {
    const candidates = [...getPlayerProfileNwslScoutingRecords(player)].sort(sortPlayerProfileScoutingRecords);
    if (!candidates.length) return null;
    const selectedSeason = String(options.selectedSeason || "").trim();
    if (selectedSeason) {
      const seasonCandidates = candidates
        .filter((record) => getPlayerProfileScoutingSeason(record) === selectedSeason)
        .sort(sortPlayerProfileScoutingRecords);
      if (seasonCandidates.length) return seasonCandidates[0];
    }
    return candidates[0] || null;
  }

  function getPlayerProfileScoutingPercentile(record, metricId, direction = "higher") {
    const database = getDatabase();
    const value = getPlayerProfileScoutingMetricValue(record, metricId);
    const metric = getPlayerProfileScoutingMetric(database, metricId);
    if (!database || !metric || !Number.isFinite(value)) return null;
    const group = getPlayerProfileScoutingPositionGroup(record);
    const recordSeason = getPlayerProfileScoutingSeason(record);
    ensureDatabaseCaches(database);
    const cohortKey = `${group}\u001f${recordSeason}`;
    let cohort = percentileCache.cohorts.get(cohortKey);
    if (!cohort) {
      cohort = database.records.filter(
        (candidate) =>
          isPlayerProfileNwslScoutingRecord(candidate) &&
          getPlayerProfileScoutingPositionGroup(candidate) === group &&
          (!recordSeason || getPlayerProfileScoutingSeason(candidate) === recordSeason) &&
          getPlayerProfileScoutingMinutes(candidate) >= 300
      );
      percentileCache.cohorts.set(cohortKey, cohort);
    }
    const valuesKey = `${cohortKey}\u001f${metricId}`;
    let values = percentileCache.values.get(valuesKey);
    if (!values) {
      values = cohort
        .map((candidate) => getPlayerProfileScoutingMetricValue(candidate, metricId))
        .filter((candidateValue) => Number.isFinite(candidateValue))
        .sort((a, b) => a - b);
      percentileCache.values.set(valuesKey, values);
    }
    if (values.length < 2) return 50;
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (values[middle] <= value) low = middle + 1;
      else high = middle;
    }
    const rawPercentile = Math.max(1, Math.min(99, Math.round((low / values.length) * 100)));
    return direction === "lower" ? Math.max(1, Math.min(99, 101 - rawPercentile)) : rawPercentile;
  }

  return {
    doPlayerProfileScoutingNamesMatch,
    findPlayerProfileNwslScoutingRecord,
    getPlayerProfileNwslScoutingRecords,
    getPlayerProfileNwslScoutingSeasonOptions,
    getPlayerProfileScoutingMetric,
    getPlayerProfileScoutingMetricIndex,
    getPlayerProfileScoutingMetricValue,
    getPlayerProfileScoutingMinutes,
    getPlayerProfileScoutingNameParts,
    getPlayerProfileScoutingPercentile,
    getPlayerProfileScoutingSeason,
    getPlayerProfileScoutingSeasonYearValue,
    getPlayerProfileScoutingPositionGroup,
    isPlayerProfileNwslScoutingRecord,
    normalizePlayerProfileScoutingText,
  };
}
