export function createSquadScoutingProfileHelpers(options = {}) {
  const getDatabase = typeof options.getDatabase === "function" ? options.getDatabase : () => null;
  const recordIndex = options.recordIndex || {};
  let metricIndexCache = { database: null, byId: new Map() };

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
    return (database?.metrics || []).find((metric) => metric.id === metricId) || null;
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

  function getPlayerProfileScoutingPositionGroup(recordOrPosition, player = null) {
    const position = Array.isArray(recordOrPosition)
      ? recordOrPosition[recordIndex.position]
      : recordOrPosition || player?.position || player?.primaryRole || "";
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

  function findPlayerProfileNwslScoutingRecord(player) {
    const database = getDatabase();
    const playerName = normalizePlayerProfileScoutingText(player?.name);
    if (!database || !playerName) return null;
    const candidates = database.records
      .filter((record) => isPlayerProfileNwslScoutingRecord(record))
      .filter((record) => doPlayerProfileScoutingNamesMatch(playerName, record?.[recordIndex.player]))
      .sort((first, second) => getPlayerProfileScoutingMinutes(second) - getPlayerProfileScoutingMinutes(first));
    return candidates[0] || null;
  }

  function getPlayerProfileScoutingPercentile(record, metricId, direction = "higher") {
    const database = getDatabase();
    const value = getPlayerProfileScoutingMetricValue(record, metricId);
    const metric = getPlayerProfileScoutingMetric(database, metricId);
    if (!database || !metric || !Number.isFinite(value)) return null;
    const group = getPlayerProfileScoutingPositionGroup(record);
    const values = database.records
      .filter(
        (candidate) =>
          isPlayerProfileNwslScoutingRecord(candidate) &&
          getPlayerProfileScoutingPositionGroup(candidate) === group &&
          getPlayerProfileScoutingMinutes(candidate) >= 300
      )
      .map((candidate) => getPlayerProfileScoutingMetricValue(candidate, metricId))
      .filter((candidateValue) => Number.isFinite(candidateValue))
      .sort((a, b) => a - b);
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
    getPlayerProfileScoutingMetric,
    getPlayerProfileScoutingMetricIndex,
    getPlayerProfileScoutingMetricValue,
    getPlayerProfileScoutingMinutes,
    getPlayerProfileScoutingNameParts,
    getPlayerProfileScoutingPercentile,
    getPlayerProfileScoutingPositionGroup,
    isPlayerProfileNwslScoutingRecord,
    normalizePlayerProfileScoutingText,
  };
}
