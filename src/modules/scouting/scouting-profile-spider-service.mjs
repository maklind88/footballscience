function normalizeControllerText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function escapeControllerHtml(value = "", escapeHtml = null) {
  if (typeof escapeHtml === "function") {
    return escapeHtml(value);
  }
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createScoutingProfileSpiderService(deps = {}) {
  const recordIndex = deps.recordIndex || {};

  function normalizeText(value = "", limit = 160) {
    return normalizeControllerText(value, limit, deps.normalizeText);
  }

  function escapeHtml(value = "") {
    return escapeControllerHtml(value, deps.escapeHtml);
  }

  function formatNumber(value, fallback = "n/a") {
    if (typeof deps.formatNumber === "function") {
      return deps.formatNumber(value, fallback);
    }
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number * 10) / 10) : fallback;
  }

  function normalizeSeasonMode(value) {
    const normalized = normalizeText(value, 40).toLowerCase();
    return normalized === "average" || normalized === "season" ? normalized : "latest";
  }

  function getSeasonSelectValue(context = {}) {
    if (context.mode === "average") {
      return "average";
    }
    if (context.mode === "season" && context.season) {
      return `season::${context.season}`;
    }
    return "latest";
  }

  function getSeasonOptions(rows = [], context = {}) {
    const selected = getSeasonSelectValue(context);
    const seasons = Array.from(
      new Set(
        rows
          .slice()
          .sort((a, b) => Number(deps.getSeasonSortValue?.(b)) - Number(deps.getSeasonSortValue?.(a)))
          .map((row) => deps.getRecordSeason?.(row))
          .filter(Boolean)
      )
    );
    const options = [
      { value: "latest", label: "Latest season" },
      { value: "average", label: "All seasons average" },
      ...seasons.map((season) => ({ value: `season::${season}`, label: season })),
    ];
    return options
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}" ${selected === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
      )
      .join("");
  }

  function getRows(record, playerRows = []) {
    return (playerRows.length ? playerRows : deps.getRecordsForPlayer?.(record) || [])
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(deps.getSeasonSortValue?.(b)) - Number(deps.getSeasonSortValue?.(a)) ||
          Number(deps.getRecordMinutes?.(b)) - Number(deps.getRecordMinutes?.(a))
      );
  }

  function getWeightedAverageValue(rows = [], getter, weightGetter = deps.getRecordMinutes) {
    const samples = rows
      .map((row) => {
        const value = Number(getter(row));
        const weight = Math.max(1, Number(weightGetter?.(row)) || 0);
        return Number.isFinite(value) ? { value, weight } : null;
      })
      .filter(Boolean);
    if (!samples.length) {
      return null;
    }
    const weightTotal = samples.reduce((sum, sample) => sum + sample.weight, 0);
    return samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / Math.max(weightTotal, 1);
  }

  function getAverageMetricQuality(rows = [], metricId) {
    const qualities = rows
      .filter((row) => Number.isFinite(Number(deps.getMetricValue?.(row, metricId))))
      .map((row) => deps.getMetricQuality?.(row, metricId))
      .filter((quality) => quality !== "missing");
    if (!qualities.length) {
      return "missing";
    }
    return qualities.includes("estimated") ? "estimated" : "trusted";
  }

  function getAverageMetricIds(rows = []) {
    const ids = new Set(["minutes", "matches", "age"]);
    (deps.getCoreMetricOptions?.() || []).forEach((metric) => {
      const id = normalizeText(metric?.id, 120);
      if (id) {
        ids.add(id);
      }
    });
    rows.forEach((row) => {
      const metrics = row?.[recordIndex.metrics];
      if (Array.isArray(metrics)) {
        metrics.forEach((entry, index) => {
          const metricId = deps.getCoreMetricOptions?.()?.[index]?.id;
          if (entry !== null && entry !== undefined && metricId) {
            ids.add(metricId);
          }
        });
        return;
      }
      if (metrics && typeof metrics === "object") {
        Object.keys(metrics).forEach((id) => ids.add(id));
      }
    });
    return Array.from(ids);
  }

  function buildMinutesWeightedAverageRecord(rows = [], fallbackRecord = null) {
    const sourceRows = rows.filter(Boolean);
    const latest = sourceRows[0] || fallbackRecord;
    if (!latest) {
      return fallbackRecord;
    }
    const averageRecord = Array.isArray(latest) ? latest.slice() : { ...latest };
    const metricIds = getAverageMetricIds(sourceRows);
    const averagedMetrics = {};
    const averagedQuality = {};
    metricIds.forEach((metricId) => {
      const id = normalizeText(metricId, 120);
      if (!id || id === "minutes" || id === "matches" || id === "age") {
        return;
      }
      const value = getWeightedAverageValue(sourceRows, (row) => deps.getMetricValue?.(row, id));
      if (Number.isFinite(value)) {
        const quality = getAverageMetricQuality(sourceRows, id);
        averagedMetrics[id] = { value, quality };
        averagedQuality[id] = quality;
      }
    });
    const averageMinutes = getWeightedAverageValue(sourceRows, deps.getRecordMinutes);
    const averageMatches = getWeightedAverageValue(sourceRows, (row) => Number(row?.[recordIndex.matches]));
    averageRecord[recordIndex.season] = "All seasons average";
    averageRecord[recordIndex.metrics] = averagedMetrics;
    averageRecord[recordIndex.metricQuality] = {
      ...(latest?.[recordIndex.metricQuality] || {}),
      ...averagedQuality,
    };
    if (Number.isFinite(averageMinutes)) {
      averageRecord[recordIndex.minutes] = Math.round(averageMinutes);
    }
    if (Number.isFinite(averageMatches)) {
      averageRecord[recordIndex.matches] = Math.round(averageMatches * 10) / 10;
    }
    averageRecord[recordIndex.sourceTrace] = {
      ...(latest?.[recordIndex.sourceTrace] || {}),
      spiderSeasonMode: "all-seasons-average",
      seasonCount: sourceRows.length,
      weightedBy: "minutes",
    };
    return averageRecord;
  }

  function getTrend(rows = [], roleProfileId = "") {
    const points = rows
      .slice()
      .sort((a, b) => Number(deps.getSeasonSortValue?.(a)) - Number(deps.getSeasonSortValue?.(b)))
      .map((row) => ({
        fit: deps.getRoleFitScore?.(row, roleProfileId),
        minutes: deps.getRecordMinutes?.(row),
        season: deps.getRecordSeason?.(row) || "Season",
      }))
      .filter((point) => Number.isFinite(point.fit));
    if (points.length < 2) {
      return {
        detail: rows.length ? `${rows.length} season${rows.length === 1 ? "" : "s"} available` : "Needs more seasons",
        direction: "flat",
        label: "No trend yet",
      };
    }
    const first = points[0];
    const last = points[points.length - 1];
    const delta = last.fit - first.fit;
    const direction = delta > 5 ? "up" : delta < -5 ? "down" : "flat";
    return {
      detail: `${first.season} P${formatNumber(first.fit)} → ${last.season} P${formatNumber(last.fit)} · ${points.length} seasons`,
      direction,
      label:
        direction === "up"
          ? `Trending up +${formatNumber(delta)}`
          : direction === "down"
            ? `Trending down ${formatNumber(delta)}`
            : `Stable ${delta >= 0 ? "+" : ""}${formatNumber(delta)}`,
    };
  }

  function getContext(record, playerRows = [], roleProfileId = "") {
    const state = deps.ensureState?.() || {};
    const rows = getRows(record, playerRows);
    const latest = rows[0] || record;
    const storedMode = normalizeSeasonMode(state.profileSpiderSeasonMode);
    const storedSeason = normalizeText(state.profileSpiderSeasonValue, 80);
    const selectedSeasonRow = storedMode === "season" ? rows.find((row) => deps.getRecordSeason?.(row) === storedSeason) : null;
    const mode = storedMode === "season" && !selectedSeasonRow ? "latest" : storedMode;
    const sourceRecord =
      mode === "average"
        ? buildMinutesWeightedAverageRecord(rows, latest)
        : mode === "season"
          ? selectedSeasonRow
          : latest;
    const seasonLabel =
      mode === "average"
        ? "All seasons average"
        : mode === "season"
          ? deps.getRecordSeason?.(sourceRecord) || storedSeason
          : deps.getRecordSeason?.(sourceRecord) || "Latest season";
    const minutes = deps.getRecordMinutes?.(sourceRecord);
    return {
      mode,
      record: sourceRecord || record,
      rows,
      sampleLabel:
        mode === "average"
          ? `${rows.length} season${rows.length === 1 ? "" : "s"} · minutes-weighted`
          : `${seasonLabel}${minutes ? ` · ${formatNumber(minutes)} minutes` : ""}`,
      season: mode === "season" ? seasonLabel : "",
      trend: getTrend(rows, roleProfileId),
    };
  }

  return {
    buildMinutesWeightedAverageRecord,
    getAverageMetricIds,
    getAverageMetricQuality,
    getContext,
    getRows,
    getSeasonOptions,
    getSeasonSelectValue,
    getTrend,
    getWeightedAverageValue,
    normalizeSeasonMode,
  };
}
