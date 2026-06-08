function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") {
    throw new TypeError(`createScoutingDatabaseFilterService requires ${name}`);
  }
  return deps[name];
}

export function createScoutingDatabaseFilterService(deps = {}) {
  const getScoutingDatabase = requireFunction(deps, "getScoutingDatabase");
  const ensureScoutingState = requireFunction(deps, "ensureScoutingState");
  const normalizeScoutingDatabaseFilters = requireFunction(deps, "normalizeScoutingDatabaseFilters");
  const normalizeScoutingText = requireFunction(deps, "normalizeScoutingText");
  const ensureScoutingRecordLookupsReady = requireFunction(deps, "ensureScoutingRecordLookupsReady");
  const getScoutingRoleProfileById = requireFunction(deps, "getScoutingRoleProfileById");
  const getScoutingRoleCategoryGroup = requireFunction(deps, "getScoutingRoleCategoryGroup");
  const normalizeScoutingRecordIds = requireFunction(deps, "normalizeScoutingRecordIds");
  const getScoutingTargetedRecordIds = requireFunction(deps, "getScoutingTargetedRecordIds");
  const getScoutingAllShadowRecordIds = requireFunction(deps, "getScoutingAllShadowRecordIds");
  const getScoutingApiOffset = requireFunction(deps, "getScoutingApiOffset");
  const groupScoutingDatabaseRecordsByPerson = requireFunction(deps, "groupScoutingDatabaseRecordsByPerson");
  const getScoutingRecordLeague = requireFunction(deps, "getScoutingRecordLeague");
  const getScoutingRecordTeam = requireFunction(deps, "getScoutingRecordTeam");
  const getScoutingRecordSeason = requireFunction(deps, "getScoutingRecordSeason");
  const scoutingPositionMatchesFilter = requireFunction(deps, "scoutingPositionMatchesFilter");
  const getScoutingRecordMinutes = requireFunction(deps, "getScoutingRecordMinutes");
  const getScoutingRecordAge = requireFunction(deps, "getScoutingRecordAge");
  const getScoutingMetricValue = requireFunction(deps, "getScoutingMetricValue");
  const getScoutingRoleFitScore = requireFunction(deps, "getScoutingRoleFitScore");
  const getScoutingComparablePercentile = requireFunction(deps, "getScoutingComparablePercentile");
  const getScoutingRoleMetricFloor = requireFunction(deps, "getScoutingRoleMetricFloor");
  const getScoutingRecordId = requireFunction(deps, "getScoutingRecordId");
  const getScoutingPositionGroup = requireFunction(deps, "getScoutingPositionGroup");
  const getScoutingSampleConfidenceScore = requireFunction(deps, "getScoutingSampleConfidenceScore");
  const getScoutingIntelligenceProfile = requireFunction(deps, "getScoutingIntelligenceProfile");
  const getScoutingMarketInfo = requireFunction(deps, "getScoutingMarketInfo");
  const isScoutingHighDealProbability = requireFunction(deps, "isScoutingHighDealProbability");
  const doesScoutingRecordMatchSearchQuery = requireFunction(deps, "doesScoutingRecordMatchSearchQuery");
  const getScoutingMetric = requireFunction(deps, "getScoutingMetric");
  const getFilteredDatabaseCache =
    typeof deps.getFilteredDatabaseCache === "function" ? deps.getFilteredDatabaseCache : () => ({ key: "", records: [] });
  const setFilteredDatabaseCache =
    typeof deps.setFilteredDatabaseCache === "function" ? deps.setFilteredDatabaseCache : () => {};
  const getRecordLookupFingerprint =
    typeof deps.getRecordLookupFingerprint === "function" ? deps.getRecordLookupFingerprint : () => "";
  const getMarketIntelVersion = typeof deps.getMarketIntelVersion === "function" ? deps.getMarketIntelVersion : () => 0;

  function getFilteredScoutingDatabaseRecords() {
    const database = getScoutingDatabase();
    const records = database?.records || [];
    const state = ensureScoutingState();
    const filters = normalizeScoutingDatabaseFilters(state.databaseFilters);
    const databaseSource = normalizeScoutingText(database?.source, 40);
    const isApi = databaseSource === "api";
    const isWorker = databaseSource === "worker";
    const isPaged = isApi || isWorker;
    ensureScoutingRecordLookupsReady();
    const query = filters.query.toLowerCase();
    const hasQuery = Boolean(query);
    const minMinutes = Number(filters.minMinutes) || 0;
    const maxMinutes = Number(filters.maxMinutes);
    const minAge = Number(filters.minAge);
    const maxAge = Number(filters.maxAge);
    const metricMin = Number(filters.metricMin);
    const roleFitMin = Number(filters.roleFitMin);
    const roleFloorMin = Number(filters.roleFloorMin);
    const hasMinMinutes = Number.isFinite(minMinutes) && minMinutes > 0;
    const hasMaxMinutes = Number.isFinite(maxMinutes) && maxMinutes > 0 && maxMinutes < 5000;
    const hasMinAge = Number.isFinite(minAge) && minAge > 14;
    const hasMaxAge = Number.isFinite(maxAge) && maxAge > 0 && maxAge < 45;
    const metricFilterId = filters.metricId !== "all" ? filters.metricId : "";
    const metricFilterIds = Array.isArray(filters.metricIds) && filters.metricIds.length ? filters.metricIds : metricFilterId ? [metricFilterId] : [];
    const roleProfileId = filters.roleProfileId !== "all" ? filters.roleProfileId : "";
    const sortMetricId = filters.sortMetricId || metricFilterId || "minutes";
    const signalMode = filters.signalMode || "all";
    const marketStatus = filters.marketStatus || "all";
    const selectedRoleProfile = roleProfileId ? getScoutingRoleProfileById(roleProfileId) : null;
    const selectedRoleCategory = getScoutingRoleCategoryGroup(roleProfileId);
    const selectedRoleGroups = selectedRoleProfile && selectedRoleProfile.groups ? new Set(selectedRoleProfile.groups) : null;
    const includeFavoritesFilter = signalMode === "favorites";
    const includePipelineFilter = signalMode === "pipeline";
    const includeShadowFilter = signalMode === "shadow";
    const favorites = includeFavoritesFilter ? normalizeScoutingRecordIds(state.favoriteRecordIds) : [];
    const pipeline = includePipelineFilter ? getScoutingTargetedRecordIds(state) : [];
    const shadow = includeShadowFilter ? getScoutingAllShadowRecordIds(state) : [];
    const hasFavoritesFilter = favorites.length > 0 && includeFavoritesFilter;
    const hasPipelineFilter = pipeline.length > 0 && includePipelineFilter;
    const hasShadowFilter = shadow.length > 0 && includeShadowFilter;
    const hasMetricMin = Number.isFinite(metricMin) && metricMin > 0;
    const hasRoleFitMin = Number.isFinite(roleFitMin) && roleFitMin > 0;
    const hasRoleFloorMin = Number.isFinite(roleFloorMin) && roleFloorMin > 0;
    const hasPagedMetricFilter = isPaged && metricFilterIds.length && hasMetricMin;
    const shouldApplyLocalMetricFilter = !hasPagedMetricFilter && metricFilterIds.length && hasMetricMin;
    const sortNeedsSimpleFilter = sortMetricId === "minutes" || sortMetricId === "matches";
    const isPagedSimplePageView =
      isPaged &&
      sortNeedsSimpleFilter &&
      !hasQuery &&
      filters.team === "all" &&
      signalMode === "all" &&
      marketStatus === "all" &&
      !roleProfileId &&
      !shouldApplyLocalMetricFilter &&
      !hasRoleFitMin &&
      !hasRoleFloorMin &&
      (!hasMetricMin || hasPagedMetricFilter);
    const isLocalSimplePageView =
      !isApi &&
      !hasQuery &&
      filters.team === "all" &&
      signalMode === "all" &&
      marketStatus === "all" &&
      !roleProfileId &&
      !metricFilterIds.length &&
      !selectedRoleProfile &&
      !selectedRoleCategory &&
      !hasRoleFitMin &&
      !hasRoleFloorMin &&
      !hasMetricMin &&
      !hasFavoritesFilter &&
      !hasPipelineFilter &&
      !hasShadowFilter &&
      sortNeedsSimpleFilter;
    const shouldUseDecisionPrecheck = signalMode === "decision-ready" || signalMode === "value";
    const decisionPrecheckCache = shouldUseDecisionPrecheck ? new Map() : null;
    const needsRoleFit =
      Boolean(roleProfileId) ||
      hasRoleFitMin ||
      hasRoleFloorMin ||
      ["priority", "decision-ready", "breakout", "value"].includes(signalMode) ||
      sortMetricId === "role-fit";
    const favoriteIds = includeFavoritesFilter ? new Set(favorites) : null;
    const pipelineIds = includePipelineFilter ? new Set(pipeline) : null;
    const shadowIds = includeShadowFilter ? new Set(shadow) : null;
    const filterCacheKey = [
      getRecordLookupFingerprint(),
      query,
      filters.league,
      filters.team,
      filters.season,
      filters.position,
      filters.minMinutes,
      filters.maxMinutes || "-",
      filters.minAge || "-",
      filters.maxAge || "-",
      sortMetricId,
      metricFilterIds.length ? metricFilterIds.join(",") : "all",
      filters.metricMin || "-",
      roleProfileId || "none",
      filters.roleFitMin || "-",
      filters.roleFloorMin || "-",
      signalMode,
      marketStatus,
      filters.benchmarkMode,
      includeFavoritesFilter ? `fav:${favorites.join("|")}` : "fav-all",
      includePipelineFilter ? `pipe:${pipeline.join("|")}` : "pipe-all",
      includeShadowFilter ? `sh:${shadow.join("|")}` : "sh-all",
      marketStatus === "all" ? "mv:none" : `mv:${getMarketIntelVersion()}`,
      isPaged ? `offset:${getScoutingApiOffset(filters.offset)}` : "offset:local",
    ].join("|");
    const filteredDatabaseCache = getFilteredDatabaseCache();
    if (filteredDatabaseCache.key === filterCacheKey) {
      return filteredDatabaseCache.records;
    }
    if (isPagedSimplePageView) {
      const simpleRecords = groupScoutingDatabaseRecordsByPerson(Array.isArray(records) ? records : [], filters);
      setFilteredDatabaseCache({
        key: filterCacheKey,
        records: simpleRecords,
      });
      return simpleRecords;
    }
    if (isLocalSimplePageView) {
      const sortBy = sortMetricId === "matches" ? "matches" : "minutes";
      const nextRecords = [...records]
        .filter((record) => {
          if (filters.league !== "all" && getScoutingRecordLeague(record) !== filters.league) {
            return false;
          }
          if (filters.team !== "all" && getScoutingRecordTeam(record) !== filters.team) {
            return false;
          }
          if (filters.season !== "all" && getScoutingRecordSeason(record) !== filters.season) {
            return false;
          }
          if (filters.position !== "all" && !scoutingPositionMatchesFilter(record, filters.position)) {
            return false;
          }
          const recordMinutes = getScoutingRecordMinutes(record);
          const recordAge = getScoutingRecordAge(record);
          if (hasMinMinutes && recordMinutes < minMinutes) {
            return false;
          }
          if (hasMaxMinutes && recordMinutes > maxMinutes) {
            return false;
          }
          if (hasMinAge && (!Number.isFinite(recordAge) || recordAge < minAge)) {
            return false;
          }
          if (hasMaxAge && (!Number.isFinite(recordAge) || recordAge > maxAge)) {
            return false;
          }
          return true;
        })
        .sort((a, b) => (getScoutingMetricValue(b, sortBy) || 0) - (getScoutingMetricValue(a, sortBy) || 0));
      const groupedRecords = groupScoutingDatabaseRecordsByPerson(nextRecords, filters);
      setFilteredDatabaseCache({
        key: filterCacheKey,
        records: groupedRecords,
      });
      return groupedRecords;
    }
    const roleFitCache = needsRoleFit ? new Map() : null;
    const metricFilterCache = shouldApplyLocalMetricFilter ? new Map() : null;
    const sortPercentileCache = sortMetricId !== "minutes" && sortMetricId !== "matches" && sortMetricId !== "role-fit" ? new Map() : null;
    const roleFloorCache = Number.isFinite(roleFloorMin) && roleFloorMin > 0 ? new Map() : null;
    const getCachedRoleFit = (record) => {
      if (!roleFitCache) {
        return getScoutingRoleFitScore(record, roleProfileId);
      }
      const recordId = getScoutingRecordId(record);
      if (roleFitCache.has(recordId)) {
        return roleFitCache.get(recordId);
      }
      const score = getScoutingRoleFitScore(record, roleProfileId);
      roleFitCache.set(recordId, score);
      return score;
    };
    const getCachedMetricPercentile = (record, metricId = metricFilterId) => {
      if (!metricFilterCache) {
        return getScoutingComparablePercentile(record, metricId);
      }
      const cacheKey = `${getScoutingRecordId(record)}:${metricId}`;
      if (metricFilterCache.has(cacheKey)) {
        return metricFilterCache.get(cacheKey);
      }
      const percentile = getScoutingComparablePercentile(record, metricId);
      metricFilterCache.set(cacheKey, percentile);
      return percentile;
    };
    const getCachedSortPercentile = (record) => {
      if (!sortPercentileCache) {
        return getScoutingComparablePercentile(record, sortMetricId);
      }
      const recordId = getScoutingRecordId(record);
      if (sortPercentileCache.has(recordId)) {
        return sortPercentileCache.get(recordId);
      }
      const percentile = getScoutingComparablePercentile(record, sortMetricId);
      sortPercentileCache.set(recordId, percentile);
      return percentile;
    };
    const getCachedRoleFloor = (record) => {
      if (!roleFloorCache) {
        return getScoutingRoleMetricFloor(record, roleProfileId);
      }
      const recordId = getScoutingRecordId(record);
      if (roleFloorCache.has(recordId)) {
        return roleFloorCache.get(recordId);
      }
      const floor = getScoutingRoleMetricFloor(record, roleProfileId);
      roleFloorCache.set(recordId, floor);
      return floor;
    };
    const getDecisionPrecheck = (record, roleFitScore, recordAge) => {
      const recordId = getScoutingRecordId(record);
      if (!decisionPrecheckCache || decisionPrecheckCache.has(recordId)) {
        return decisionPrecheckCache?.get(recordId) || null;
      }
      const age = Number.isFinite(recordAge) ? recordAge : getScoutingRecordAge(record);
      const minutes = getScoutingRecordMinutes(record);
      const precheck = {
        age,
        minutes,
        sampleConfidence: getScoutingSampleConfidenceScore(record),
      };
      decisionPrecheckCache.set(recordId, precheck);
      return precheck;
    };
    const nextRecords = [...records]
      .filter((record) => {
        const recordId = getScoutingRecordId(record);
        const group = getScoutingPositionGroup(record);
        if (selectedRoleGroups && !selectedRoleGroups.has(group)) {
          return false;
        }
        if (selectedRoleCategory && selectedRoleCategory !== group) {
          return false;
        }
        if (filters.league !== "all" && getScoutingRecordLeague(record) !== filters.league) {
          return false;
        }
        if (filters.team !== "all" && getScoutingRecordTeam(record) !== filters.team) {
          return false;
        }
        if (filters.season !== "all" && getScoutingRecordSeason(record) !== filters.season) {
          return false;
        }
        if (filters.position !== "all" && !scoutingPositionMatchesFilter(record, filters.position)) {
          return false;
        }
        const recordMinutes = getScoutingRecordMinutes(record);
        const recordAge = getScoutingRecordAge(record);
        if (hasMinMinutes && recordMinutes < minMinutes) {
          return false;
        }
        if (hasMaxMinutes && recordMinutes > maxMinutes) {
          return false;
        }
        if (hasMinAge) {
          if (!Number.isFinite(recordAge) || recordAge < minAge) {
            return false;
          }
        }
        if (hasMaxAge) {
          if (!Number.isFinite(recordAge) || recordAge > maxAge) {
            return false;
          }
        }
        const roleFitScore = needsRoleFit ? getCachedRoleFit(record) : null;
        if (shouldApplyLocalMetricFilter) {
          const passesSelectedMetrics = metricFilterIds.some((selectedMetricId) => {
            const percentile = getCachedMetricPercentile(record, selectedMetricId);
            return Number.isFinite(percentile) && percentile >= metricMin;
          });
          if (!passesSelectedMetrics) {
            return false;
          }
        }
        if (hasRoleFitMin && (!Number.isFinite(roleFitScore) || roleFitScore < roleFitMin)) {
          return false;
        }
        if (hasRoleFloorMin) {
          const roleFloor = getCachedRoleFloor(record);
          if (!Number.isFinite(roleFloor) || roleFloor < roleFloorMin) {
            return false;
          }
        }
        if (signalMode === "priority" && (!Number.isFinite(roleFitScore) || roleFitScore < 82)) {
          return false;
        }
          if (signalMode === "decision-ready") {
            const precheck = getDecisionPrecheck(record, roleFitScore, recordAge);
          if (!precheck || !Number.isFinite(roleFitScore) || roleFitScore < 74 || precheck.sampleConfidence < 66) {
            return false;
          }
          const decisionRoleFloor = getCachedRoleFloor(record);
          if (!Number.isFinite(decisionRoleFloor) || decisionRoleFloor < 50) {
            return false;
          }
          const intelligence = getScoutingIntelligenceProfile(record, state, roleProfileId);
          if (
            !Number.isFinite(intelligence.floor.score) ||
            intelligence.floor.score < 50 ||
            !Number.isFinite(intelligence.confidence.score) ||
            intelligence.confidence.score < 82
          ) {
            return false;
          }
        }
        if (signalMode === "breakout") {
          if (!Number.isFinite(recordAge) || recordAge > 23 || !Number.isFinite(roleFitScore) || roleFitScore < 70) {
            return false;
          }
        }
        if (signalMode === "value") {
          const precheck = getDecisionPrecheck(record, roleFitScore, recordAge);
          if (!Number.isFinite(roleFitScore) || roleFitScore < 80 || precheck.minutes > 900 || precheck.sampleConfidence < 66) {
            return false;
          }
          const intelligence = getScoutingIntelligenceProfile(record, state, roleProfileId);
          if (
            !Number.isFinite(intelligence.confidence.score) ||
            intelligence.confidence.score < 66 ||
            !Number.isFinite(precheck.age) ||
            precheck.age > 23
          ) {
            return false;
          }
        }
        if (signalMode === "favorites" && favoriteIds && !favoriteIds.has(recordId)) {
          return false;
        }
        if (signalMode === "pipeline" && pipelineIds && !pipelineIds.has(recordId)) {
          return false;
        }
        if (signalMode === "shadow" && shadowIds && !shadowIds.has(recordId)) {
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
        return doesScoutingRecordMatchSearchQuery(record, query);
      })
      .sort((a, b) => {
        if (sortMetricId === "role-fit") {
          return (getCachedRoleFit(b) || 0) - (getCachedRoleFit(a) || 0);
        }
        const metric = getScoutingMetric(sortMetricId);
        if (!metric || sortMetricId === "minutes" || sortMetricId === "matches") {
          return (getScoutingMetricValue(b, sortMetricId) || 0) - (getScoutingMetricValue(a, sortMetricId) || 0);
        }
        return (getCachedSortPercentile(b) || 0) - (getCachedSortPercentile(a) || 0);
      });
    const groupedRecords = groupScoutingDatabaseRecordsByPerson(nextRecords, filters);
    setFilteredDatabaseCache({
      key: filterCacheKey,
      records: groupedRecords,
    });
    return groupedRecords;
  }

  return {
    getFilteredScoutingDatabaseRecords,
  };
}
