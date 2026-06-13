function normalizeServiceText(value = "", maxLength = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, maxLength);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizePageNumber(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

export function createScoutingDatabaseResultsService(deps = {}) {
  function getDatabaseSource() {
    return normalizeServiceText(deps.getDatabase?.()?.source, 40, deps.normalizeText);
  }

  function resolveVisibleRecords() {
    const filteredRecords = deps.getFilteredRecords?.();
    const records = Array.isArray(filteredRecords) ? filteredRecords : [];
    const apiPage = deps.getDatabasePage?.() || null;
    const databaseSource = getDatabaseSource();
    const isFootballScienceDb = databaseSource === "fsdb";
    const isPaged = databaseSource === "api" || databaseSource === "worker" || isFootballScienceDb;
    const pageOffset = isPaged ? apiPage?.offset || 0 : deps.getDatabasePageOffset?.(records.length) || 0;
    const pageSize = Math.max(1, normalizePageNumber(deps.pageSize, 50));
    const visibleRecords = isPaged ? records : records.slice(pageOffset, pageOffset + pageSize);
    return { apiPage, databaseSource, isFootballScienceDb, isPaged, pageOffset, records, visibleRecords };
  }

  function getVisibleRecordsForPanels() {
    const { records, visibleRecords } = resolveVisibleRecords();
    return { records, visibleRecords };
  }

  function getResultsMarkup() {
    const { apiPage, databaseSource, isFootballScienceDb, isPaged, pageOffset, records, visibleRecords } = resolveVisibleRecords();
    const state = deps.ensureState?.() || {};
    const activeFilters = deps.normalizeDatabaseFilters?.(state.databaseFilters || {}) || state.databaseFilters || {};
    const fsdbSegmentLabel = deps.getFootballScienceDbGenderSegmentLabel?.(activeFilters.fsdbGenderSegment, { short: true }) || "";
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
    deps.hydrateNavigationCache?.(
      visibleRecords,
      `${deps.getFilteredDatabaseCacheKey?.() || ""}:visible:${pageOffset}:${visibleRecords.length}`
    );
    return {
      records,
      visibleRecords,
      summary,
      paging: {
        total,
        offset: pageOffset,
        limit: isPaged ? apiPage?.limit || deps.apiPageLimit || deps.pageSize || 50 : deps.pageSize || 50,
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
              deps.renderRecordCard?.(record, {
                lightweight: true,
                compactMode: deps.isAdvancedDatabaseMode?.() !== true,
              }) || ""
            )
            .join("")
        : `<div class="scouting-empty-panel">No players match these filters yet.</div>`,
    };
  }

  return {
    getResultsMarkup,
    getVisibleRecordsForPanels,
  };
}
