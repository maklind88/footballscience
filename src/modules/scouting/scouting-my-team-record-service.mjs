function normalizeControllerText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function toRecordArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value.values === "function") {
    return Array.from(value.values());
  }
  return [];
}

export function createScoutingMyTeamRecordService(deps = {}) {
  const matchCache = new Map();

  function normalizeText(value = "", limit = 160) {
    return normalizeControllerText(value, limit, deps.normalizeText);
  }

  function getKnownRecords() {
    return toRecordArray(deps.getKnownRecords?.());
  }

  function getKnownRecordCount() {
    const count = Number(deps.getKnownRecordCount?.());
    return Number.isFinite(count) ? count : getKnownRecords().length;
  }

  function getDatabaseRecords() {
    const database = deps.getDatabase?.();
    return Array.isArray(database?.records) ? database.records : [];
  }

  function getCandidateRecords() {
    deps.ensureRecordLookupsReady?.();
    const seen = new Set();
    const records = [];
    const addRecord = (record) => {
      const id = deps.getRecordId?.(record);
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      records.push(record);
    };
    getDatabaseRecords().forEach(addRecord);
    getKnownRecords().forEach(addRecord);
    Object.values(deps.getPlayerSnapshots?.() || {}).forEach((snapshot) => {
      const fallbackRecord = deps.getSnapshotFallbackRecord?.(snapshot?.recordId);
      if (fallbackRecord) {
        addRecord(fallbackRecord);
      }
    });
    return records;
  }

  function hasCandidateRecordSources(state = null) {
    if (toRecordArray(deps.getActiveDatabaseRecords?.()).length) {
      return true;
    }
    if (toRecordArray(deps.getImportedDatabaseRecords?.()).length) {
      return true;
    }
    if (getKnownRecordCount()) {
      return true;
    }
    const sourceState = state || deps.getCandidateSourceState?.() || null;
    return Boolean(sourceState?.playerSnapshots && typeof sourceState.playerSnapshots === "object" && Object.keys(sourceState.playerSnapshots).length);
  }

  function scoreRecordMatch(player = {}, record = null) {
    if (!record || !deps.areNamesInitialSurnameMatch?.(player.name, deps.getRecordName?.(record))) {
      return -1;
    }
    let score = 70;
    const playerAge = Number(player.age);
    const recordAge = deps.getRecordAge?.(record);
    if (Number.isFinite(playerAge) && Number.isFinite(recordAge)) {
      const delta = Math.abs(playerAge - recordAge);
      score += delta === 0 ? 22 : delta === 1 ? 15 : delta <= 2 ? 8 : -18;
    }
    const playerGroup = deps.getPositionGroup?.(player.position || player.bestRole || "");
    const recordGroup = deps.getPositionGroup?.(record);
    if (playerGroup && recordGroup && playerGroup === recordGroup) {
      score += 16;
    }
    const playerTeam = deps.normalizePersonNameForMatch?.(player.team || player.club || "") || normalizeText(player.team || player.club || "", 160).toLowerCase();
    const recordTeam = deps.normalizePersonNameForMatch?.(deps.getRecordTeam?.(record)) || normalizeText(deps.getRecordTeam?.(record), 160).toLowerCase();
    if (playerTeam && recordTeam && (playerTeam === recordTeam || playerTeam.includes(recordTeam) || recordTeam.includes(playerTeam))) {
      score += 10;
    }
    const seasonYear = Number(deps.getRecordSeasonYearValue?.(record));
    if (Number.isFinite(seasonYear)) {
      score += Math.min(8, Math.max(0, seasonYear - 2018));
    }
    const minutes = Number(deps.getRecordMinutes?.(record));
    if (Number.isFinite(minutes)) {
      score += Math.min(8, Math.round(minutes / 900));
    }
    return score;
  }

  function findRecordForPlayer(player = {}) {
    const playerId = deps.getPlayerId?.(player) || "";
    const cacheKey = [
      playerId,
      normalizeText(player.name, 160),
      normalizeText(player.position, 80),
      normalizeText(player.age, 20),
      deps.getRecordLookupFingerprint?.() || "",
      getKnownRecordCount(),
    ].join("|");
    if (matchCache.has(cacheKey)) {
      return matchCache.get(cacheKey);
    }
    const candidates = getCandidateRecords()
      .map((record) => ({ record, score: scoreRecordMatch(player, record) }))
      .filter((entry) => entry.score >= 70)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(deps.getRecordSeasonYearValue?.(b.record)) - Number(deps.getRecordSeasonYearValue?.(a.record)) ||
          Number(deps.getRecordMinutes?.(b.record)) - Number(deps.getRecordMinutes?.(a.record))
      );
    const match = candidates[0]?.record || null;
    matchCache.set(cacheKey, match);
    return match;
  }

  function clearMatchCache() {
    matchCache.clear();
  }

  function getMatchCacheSize() {
    return matchCache.size;
  }

  return {
    clearMatchCache,
    findRecordForPlayer,
    getCandidateRecords,
    getMatchCacheSize,
    hasCandidateRecordSources,
    scoreRecordMatch,
  };
}
