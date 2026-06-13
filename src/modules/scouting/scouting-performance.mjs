export const scoutingPerformanceBudgets = Object.freeze({
  "tab.switch": 220,
  "render.workspace": 450,
  "render.active-content": 180,
  "state.write": 120,
  "database.refresh": 450,
  "database.results-render": 180,
  "favorite.toggle": 180,
  "list.add": 220,
  "shadow.add": 260,
  "my-team.assign": 220,
});

function getPerformanceNow(performanceRef) {
  if (performanceRef && typeof performanceRef.now === "function") {
    return performanceRef.now();
  }
  return Date.now();
}

function normalizePerformanceText(value, maxLength = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizePerformanceDetail(detail = {}) {
  if (!detail || typeof detail !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(detail)
      .map(([key, value]) => [normalizePerformanceText(key, 80), normalizePerformanceText(value, 180)])
      .filter(([key]) => key)
  );
}

export function createScoutingPerformanceMonitor(options = {}) {
  const windowRef = options.windowRef || null;
  const performanceRef = options.performanceRef || windowRef?.performance || null;
  const maxEntries = Math.max(20, Math.min(500, Math.floor(Number(options.maxEntries) || 120)));
  const budgets = options.budgets || scoutingPerformanceBudgets;
  const entries = [];

  function publish() {
    if (!windowRef) {
      return;
    }
    windowRef.__footballScienceScoutingPerformance = {
      budgets,
      entries: entries.slice(-maxEntries),
      last: entries[entries.length - 1] || null,
    };
  }

  function shouldLogSlowEntry() {
    return Boolean(windowRef?.__footballScienceScoutingPerfDebug);
  }

  function record(label, detail = {}) {
    const normalizedLabel = normalizePerformanceText(label, 120);
    if (!normalizedLabel) {
      return null;
    }
    const durationMs = Number(detail.durationMs);
    const budgetMs = Number(budgets[normalizedLabel]);
    const entry = {
      label: normalizedLabel,
      durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
      budgetMs: Number.isFinite(budgetMs) ? budgetMs : null,
      at: Math.round(getPerformanceNow(performanceRef)),
      detail: normalizePerformanceDetail(detail.detail || detail),
    };
    entry.slow = Number.isFinite(entry.budgetMs) && entry.durationMs > entry.budgetMs;
    entries.push(entry);
    if (entries.length > maxEntries) {
      entries.splice(0, entries.length - maxEntries);
    }
    publish();
    if (entry.slow && shouldLogSlowEntry() && windowRef?.console?.warn) {
      windowRef.console.warn("[scouting-performance]", entry);
    }
    return entry;
  }

  function start(label, detail = {}) {
    const startedAt = getPerformanceNow(performanceRef);
    return {
      end(extraDetail = {}) {
        const endedAt = getPerformanceNow(performanceRef);
        return record(label, {
          durationMs: endedAt - startedAt,
          detail: {
            ...normalizePerformanceDetail(detail),
            ...normalizePerformanceDetail(extraDetail),
          },
        });
      },
    };
  }

  function getEntries() {
    return entries.slice();
  }

  function clear() {
    entries.splice(0, entries.length);
    publish();
  }

  return {
    budgets,
    clear,
    getEntries,
    record,
    start,
  };
}
