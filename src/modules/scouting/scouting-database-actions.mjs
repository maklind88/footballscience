function normalizeText(deps = {}, value = "", limit = 160) {
  if (typeof deps.normalizeText === "function") {
    return deps.normalizeText(value, limit);
  }
  return String(value || "").trim().slice(0, limit);
}

function normalizeFilters(deps = {}, value = {}) {
  return deps.normalizeDatabaseFilters?.(value) || { ...(value || {}) };
}

function getActionState(deps = {}) {
  const state = deps.ensureState?.();
  return state && typeof state === "object" ? state : null;
}

function clearFilteredCache(deps = {}) {
  deps.clearFilteredDatabaseCache?.();
}

function writeState(deps = {}, options = {}) {
  deps.writeState?.(options);
}

function renderWorkspace(deps = {}, options = {}) {
  deps.renderWorkspace?.(options);
}

export function createScoutingDatabaseActions(deps = {}) {
  function setFilter(field, value) {
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, field, status: "empty" };
    }
    if (field === "query") {
      deps.setDatabaseSearchDraft?.(null);
    }
    const nextPatch = {
      ...(state.databaseFilters || {}),
      [field]: value,
      offset: field === "offset" ? value : 0,
    };
    if (field !== "fsdbCursor" && field !== "fsdbCursorStack") {
      nextPatch.fsdbCursor = "";
      nextPatch.fsdbCursorStack = [];
    }
    if (field === "source") {
      deps.clearDatabaseLoadState?.();
    }
    if (field === "metricIds") {
      const metricIds = Array.isArray(value) ? value.map((item) => normalizeText(deps, item, 120)).filter(Boolean) : [];
      nextPatch.metricIds = metricIds;
      nextPatch.metricId = metricIds[0] || "all";
    }
    if (field === "minMinutes") {
      nextPatch.minMinutesIntentional = Number(value) > 0;
    }
    state.databaseFilters = normalizeFilters(deps, nextPatch);
    clearFilteredCache(deps);
    deps.deferStateWrite?.({ syncCentral: false });
    return { changed: true, field, status: "updated" };
  }

  function setPageOffset(offset) {
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, status: "empty" };
    }
    const nextOffset = deps.getApiOffset?.(offset) ?? Math.max(0, Math.floor(Number(offset) || 0));
    if (deps.isPagedDatabaseActive?.()) {
      const currentFilters = normalizeFilters(deps, state.databaseFilters || {});
      const liveQuery = deps.getDatabaseLiveSearchQuery?.(currentFilters.query) || "";
      const currentOffset = deps.getApiOffset?.(currentFilters.offset) ?? Math.max(0, Math.floor(Number(currentFilters.offset) || 0));
      if (currentOffset === nextOffset && normalizeText(deps, currentFilters.query, 120) === liveQuery) {
        return { changed: false, offset: nextOffset, status: "unchanged" };
      }
      state.databaseFilters = normalizeFilters(deps, {
        ...currentFilters,
        query: liveQuery,
        offset: nextOffset,
      });
      clearFilteredCache(deps);
      writeState(deps, { syncCentral: false });
      deps.scheduleDatabaseRefresh?.();
      return { changed: true, offset: nextOffset, status: "updated" };
    }
    const filtered = deps.getFilteredDatabaseRecords?.() || [];
    const pageSize = Math.max(1, Math.floor(Number(deps.pageSize) || 50));
    const total = Math.max(0, Math.floor(filtered.length));
    const lastPageStart = Math.max(0, Math.floor((total - 1) / pageSize) * pageSize);
    const desiredOffset = Math.max(0, Math.min(nextOffset, lastPageStart));
    const offsetToSet = Number.isFinite(desiredOffset) ? desiredOffset : 0;
    const currentOffset = deps.getApiOffset?.(state.databaseFilters?.offset) ?? Math.max(0, Math.floor(Number(state.databaseFilters?.offset) || 0));
    if (currentOffset === offsetToSet) {
      return { changed: false, offset: offsetToSet, status: "unchanged" };
    }
    state.databaseFilters = normalizeFilters(deps, {
      ...(state.databaseFilters || {}),
      offset: offsetToSet,
    });
    clearFilteredCache(deps);
    writeState(deps, { syncCentral: false });
    deps.scheduleDatabaseResultsRender?.();
    return { changed: true, offset: offsetToSet, status: "updated" };
  }

  function setPageCursor(direction = "", cursor = "") {
    const state = getActionState(deps);
    if (!state) {
      return { changed: false, status: "empty" };
    }
    const currentFilters = normalizeFilters(deps, state.databaseFilters || {});
    if (currentFilters.source !== "fsdb") {
      return { changed: false, status: "not-fsdb" };
    }
    const liveQuery = deps.getDatabaseLiveSearchQuery?.(currentFilters.query) || "";
    const stack = Array.isArray(currentFilters.fsdbCursorStack) ? currentFilters.fsdbCursorStack.slice() : [];
    let nextCursor = currentFilters.fsdbCursor || "";
    let nextStack = stack;
    if (direction === "next") {
      const incomingCursor = normalizeText(deps, cursor || deps.getDatabasePage?.()?.nextCursor, 400);
      if (!incomingCursor) {
        return { changed: false, status: "empty" };
      }
      nextStack = [...stack, currentFilters.fsdbCursor ? currentFilters.fsdbCursor : "__first__"].slice(-50);
      nextCursor = incomingCursor;
    } else if (direction === "previous") {
      if (!stack.length) {
        return { changed: false, status: "empty" };
      }
      const previousCursor = stack[stack.length - 1];
      nextStack = stack.slice(0, -1);
      nextCursor = previousCursor === "__first__" ? "" : previousCursor;
    } else {
      return { changed: false, status: "empty" };
    }
    state.databaseFilters = normalizeFilters(deps, {
      ...currentFilters,
      query: liveQuery,
      fsdbCursor: nextCursor,
      fsdbCursorStack: nextStack,
      offset: 0,
    });
    clearFilteredCache(deps);
    writeState(deps, { syncCentral: false });
    deps.scheduleDatabaseRefresh?.();
    return { changed: true, cursor: nextCursor, status: "updated" };
  }

  function setPageNumber(pageNumber) {
    const isPaged = deps.isPagedDatabaseActive?.() === true;
    const databasePage = deps.getDatabasePage?.() || {};
    const pageSize = isPaged
      ? Math.max(1, Math.floor(Number(databasePage.limit) || Number(deps.apiPageLimit) || 50))
      : Math.max(1, Math.floor(Number(deps.pageSize) || 50));
    const requestedPage = Math.max(1, Math.floor(Number(pageNumber) || 1));
    const total = isPaged
      ? Math.max(0, Math.floor(Number(databasePage.total) || 0))
      : (deps.getFilteredDatabaseRecords?.() || []).length;
    const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : requestedPage;
    const safePage = Math.min(requestedPage, totalPages);
    return setPageOffset((safePage - 1) * pageSize);
  }

  function scheduleFilterRefresh() {
    if (deps.isPagedDatabaseActive?.()) {
      deps.scheduleDatabaseRefresh?.();
      return { changed: true, mode: "paged", status: "scheduled" };
    }
    deps.clearTimeout?.(deps.getDatabaseFilterDebounceTimer?.());
    const timer = deps.setTimeout?.(() => {
      deps.setDatabaseFilterDebounceTimer?.(0);
      deps.scheduleDatabaseResultsRender?.();
    }, 120);
    deps.setDatabaseFilterDebounceTimer?.(timer);
    return { changed: true, mode: "local", status: "scheduled" };
  }

  function resetRangeFilter(field) {
    const result = setFilter(field, deps.getRangeFilterResetValue?.(field));
    renderWorkspace(deps, { preserveFocus: true });
    if (deps.isDatabaseLoaded?.()) {
      scheduleFilterRefresh();
    }
    return result;
  }

  function createSavedView(name) {
    if (deps.canEdit?.() !== true) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const safeName = normalizeText(deps, name, 80);
    if (!state || !safeName) {
      return { changed: false, status: "empty" };
    }
    deps.setSavedViewNameDraft?.("");
    const view = deps.cloneSavedView?.({ name: safeName, filters: state.databaseFilters }) || {
      id: safeName,
      name: safeName,
      filters: state.databaseFilters,
    };
    const views = deps.getSavedViews?.(state) || [];
    state.savedViews = [view, ...views.filter((item) => String(item.name || "").toLowerCase() !== safeName.toLowerCase())];
    deps.setSavedViewsOpen?.(true);
    writeState(deps);
    renderWorkspace(deps, { preserveFocus: true });
    return { changed: true, viewId: view.id || "", status: "updated" };
  }

  function applyPresetView(presetId) {
    const preset = (deps.getSavedViewPresets?.() || []).find((item) => item.id === normalizeText(deps, presetId, 80));
    const state = getActionState(deps);
    if (!state || !preset) {
      return { changed: false, status: "empty" };
    }
    deps.setDatabaseSearchDraft?.(null);
    state.databaseFilters = normalizeFilters(deps, {
      ...normalizeFilters(deps, {}),
      ...(preset.filters || {}),
    });
    state.activeTab = "database";
    writeState(deps, { syncCentral: false });
    renderWorkspace(deps, { preserveFocus: true });
    return { changed: true, viewId: preset.id, status: "updated" };
  }

  function applySavedView(viewId) {
    const state = getActionState(deps);
    const id = normalizeText(deps, viewId, 120);
    const view = (state ? deps.getSavedViews?.(state) || [] : []).find((item) => item.id === id);
    if (!state || !view) {
      return { changed: false, viewId: id, status: "empty" };
    }
    deps.setDatabaseSearchDraft?.(null);
    state.databaseFilters = normalizeFilters(deps, view.filters);
    state.activeTab = "database";
    writeState(deps, { syncCentral: false });
    renderWorkspace(deps, { preserveFocus: true });
    return { changed: true, viewId: id, status: "updated" };
  }

  function deleteSavedView(viewId) {
    if (deps.canEdit?.() !== true) {
      return { changed: false, status: "blocked" };
    }
    const state = getActionState(deps);
    const id = normalizeText(deps, viewId, 120);
    if (!state || !id) {
      return { changed: false, viewId: id, status: "empty" };
    }
    state.savedViews = (deps.getSavedViews?.(state) || []).filter((view) => view.id !== id);
    writeState(deps);
    renderWorkspace(deps, { preserveFocus: true });
    return { changed: true, viewId: id, status: "updated" };
  }

  function setAdvancedMode(enabled) {
    const nextMode = Boolean(enabled);
    if (nextMode === Boolean(deps.getAdvancedMode?.())) {
      return { changed: false, status: "unchanged" };
    }
    deps.setAdvancedModeState?.(nextMode);
    if (!deps.syncAdvancedModeDom?.()) {
      deps.refreshDatabaseSurface?.({ controls: true });
    }
    return { changed: true, enabled: nextMode, status: "updated" };
  }

  function setAdvancedFiltersOpen(open) {
    const nextOpen = Boolean(open);
    if (nextOpen === Boolean(deps.getAdvancedFiltersOpen?.())) {
      return { changed: false, status: "unchanged" };
    }
    deps.setAdvancedFiltersOpenState?.(nextOpen);
    if (!nextOpen) {
      deps.setDatabaseMetricFilterOpen?.(false);
    }
    if (!deps.syncAdvancedFiltersDom?.()) {
      deps.refreshDatabaseSurface?.({ controls: true });
    }
    return { changed: true, open: nextOpen, status: "updated" };
  }

  return {
    applyPresetView,
    applySavedView,
    createSavedView,
    deleteSavedView,
    resetRangeFilter,
    scheduleFilterRefresh,
    setAdvancedFiltersOpen,
    setAdvancedMode,
    setFilter,
    setPageCursor,
    setPageNumber,
    setPageOffset,
  };
}
