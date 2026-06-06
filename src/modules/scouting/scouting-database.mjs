export function renderScoutingDatabaseWorkspace(deps = {}) {
  const databaseError = deps.databaseError || "";
  if (databaseError) {
    const filters = deps.normalizeDatabaseFilters(deps.ensureState().databaseFilters);
    const isFootballScienceDb = filters.source === "fsdb";
    const isAuthError = /sign(?:ed)? in|authenticated|session/i.test(databaseError);
    return `
      <section class="scouting-load-panel">
        <h2>${deps.escapeHtml(isFootballScienceDb ? (isAuthError ? "Football Science DB needs an active session" : "Football Science DB failed to load") : "Scouting database failed to load")}</h2>
        <p>${deps.escapeHtml(databaseError)}</p>
        ${
          isFootballScienceDb && isAuthError
            ? `<button type="button" class="scouting-primary-button" data-scouting-sign-in>Sign in again</button>`
            : `<button type="button" class="scouting-primary-button" data-scouting-retry-database>${deps.escapeHtml(isFootballScienceDb ? "Retry Football Science DB" : "Retry database")}</button>`
        }
      </section>
    `;
  }
  const database = deps.getDatabase();
  if (!database) {
    const state = deps.ensureState();
    const filters = deps.normalizeDatabaseFilters(state.databaseFilters);
    const isFootballScienceDb = filters.source === "fsdb";
    const isLoading = Boolean(deps.isDatabaseLoading);
    const fsdbSegmentLabel = deps.getFootballScienceDbGenderSegmentLabel(filters.fsdbGenderSegment);
    return `
      <section class="scouting-load-panel${isLoading ? " is-loading" : ""}">
        ${
          isLoading
            ? `
              <div class="scouting-database-loader" aria-hidden="true">
                <div class="scouting-loader-pitch">
                  <span class="scouting-loader-player">
                    <i class="scouting-loader-head"></i>
                    <i class="scouting-loader-body"></i>
                    <i class="scouting-loader-leg is-left"></i>
                    <i class="scouting-loader-leg is-right"></i>
                  </span>
                  <span class="scouting-loader-ball"></span>
                  <span class="scouting-loader-goal"></span>
                </div>
              </div>
            `
            : ""
        }
        <h2>${isLoading ? (isFootballScienceDb ? `Loading ${fsdbSegmentLabel} source enrichment` : "Loading the scouting database") : isFootballScienceDb ? "Source enrichment is handled inside Scouting" : "Scouting database is ready"}</h2>
        <p>${
          isLoading
            ? isFootballScienceDb
              ? `${fsdbSegmentLabel} are loading through the server so the browser stays light.`
              : "The scouting player database is being prepared. The rest of Scouting stays responsive while it loads."
            : isFootballScienceDb
              ? "Select women's or men's players before the database loads. Football Science DB keeps the segments separate in the server query."
              : "Load the full scouting player database when you want to search, filter and open player profiles. Source enrichment stays attached inside each player profile."
        }</p>
        ${
          isLoading
            ? ""
            : isFootballScienceDb
              ? ""
              : `
                <div class="scouting-load-actions">
                  <button type="button" class="scouting-primary-button" data-scouting-load-database>Load scouting player database</button>
                </div>
              `
        }
        ${isFootballScienceDb ? deps.renderFootballScienceDbQualityPanel() : ""}
      </section>
    `;
  }
  const results = deps.getDatabaseResultsMarkup();
  const state = deps.ensureState();
  const isFootballScienceDb = deps.normalizeText(database.source, 40) === "fsdb";
  const advancedPanelsMarkup = deps.isAdvancedDatabaseMode()
    ? deps.renderAdvancedDatabasePanelsMarkup(results.visibleRecords, state, results.records.length, { lightweight: true })
    : "";
  if (isFootballScienceDb) {
    deps.queueFootballScienceDbQualityLoad();
  }
  return `
    <section class="scouting-database-panel">
      <div class="scouting-database-workbench">
        <main class="scouting-database-main">
          <div class="scouting-database-results-header">
            <div class="scouting-result-summary" data-scouting-result-summary>${deps.escapeHtml(results.summary)}</div>
            <div class="scouting-database-results-actions">
              ${deps.renderSavedViewsButton()}
              ${deps.renderDatabasePagingControls(results.paging)}
            </div>
          </div>
          ${deps.renderDatabaseControls()}
          ${advancedPanelsMarkup}
          <div class="scouting-record-table">
            ${renderScoutingRecordListHeader()}
            <div class="scouting-record-grid" data-scouting-record-grid>
              ${results.html}
            </div>
          </div>
          <div class="scouting-database-results-footer">
            ${deps.renderDatabasePagingControls(results.paging)}
          </div>
        </main>
        ${isFootballScienceDb ? `<aside class="scouting-database-side">${deps.renderFootballScienceDbQualityPanel()}</aside>` : ""}
      </div>
    </section>
  `;
}

export function handleScoutingDatabaseClick(event, deps = {}) {
  const target = event.target;
  const retryTrigger = target.closest("[data-scouting-retry-database]");
  if (retryTrigger) {
    deps.setDatabaseError("");
    deps.queueDatabaseLoad(deps.renderActiveTabSurfaceOrWorkspace);
    deps.renderActiveTabSurfaceOrWorkspace({ preserveFocus: true });
    return true;
  }
  const signInTrigger = target.closest("[data-scouting-sign-in]");
  if (signInTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.requestSignIn();
    return true;
  }
  const loadTrigger = target.closest("[data-scouting-load-database]");
  if (loadTrigger) {
    deps.queueDatabaseLoad(deps.renderActiveTabSurfaceOrWorkspace);
    deps.renderActiveTabSurfaceOrWorkspace({ preserveFocus: true });
    return true;
  }
  const refreshQualityTrigger = target.closest("[data-refresh-fsdb-quality]");
  if (refreshQualityTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.queueFootballScienceDbQualityLoad({ force: true });
    deps.renderWorkspace({ preserveFocus: true });
    return true;
  }
  const openFsdbProfileTrigger = target.closest("[data-open-fsdb-profile]");
  if (openFsdbProfileTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.openFootballScienceDbProfileFromQueue({
      id: openFsdbProfileTrigger.dataset.fsdbProfileId || openFsdbProfileTrigger.dataset.openFsdbProfile,
      fsdbId: openFsdbProfileTrigger.dataset.fsdbProfileFsdbId,
    });
    return true;
  }
  const loadFsdbProfileTrigger = target.closest("[data-load-fsdb-profile]");
  if (loadFsdbProfileTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.hydrateFootballScienceDbProfileDetails(loadFsdbProfileTrigger.dataset.loadFsdbProfile, { force: true });
    return true;
  }
  const pageTrigger = target.closest("[data-scouting-page-offset]");
  if (pageTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.setDatabasePageOffset(pageTrigger.dataset.scoutingPageOffset);
    return true;
  }
  const cursorPageTrigger = target.closest("[data-scouting-page-cursor]");
  if (cursorPageTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.setDatabasePageCursor(cursorPageTrigger.dataset.scoutingPageCursor, cursorPageTrigger.dataset.scoutingNextCursor || "");
    return true;
  }
  const refreshImportHistoryTrigger = target.closest("[data-refresh-scouting-import-history]");
  if (refreshImportHistoryTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.loadImportHistory({ force: true });
    return true;
  }
  const rollbackImportTrigger = target.closest("[data-rollback-scouting-import]");
  if (rollbackImportTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.rollbackImport(rollbackImportTrigger.dataset.rollbackScoutingImport);
    return true;
  }
  const advancedFiltersTrigger = target.closest("[data-toggle-scouting-advanced-filters]");
  if (advancedFiltersTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.setAdvancedFiltersOpen(!deps.getAdvancedFiltersOpen());
    return true;
  }
  const advancedModeTrigger = target.closest("[data-toggle-scouting-database-mode]");
  if (advancedModeTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.setAdvancedDatabaseMode(!deps.isAdvancedDatabaseMode());
    return true;
  }
  const metricFilterSummary = target.closest("[data-scouting-metric-filter-summary]");
  if (metricFilterSummary) {
    event.preventDefault();
    event.stopPropagation();
    const details = metricFilterSummary.closest("[data-scouting-metric-filter-details]");
    const open = !details?.open;
    deps.setDatabaseMetricFilterOpen(open);
    if (details) {
      details.open = open;
    }
    return true;
  }
  const resetRangeFilterTrigger = target.closest("[data-reset-scouting-range-filter]");
  if (resetRangeFilterTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.resetRangeFilter(resetRangeFilterTrigger.dataset.resetScoutingRangeFilter);
    return true;
  }
  const openImportTrigger = target.closest("[data-scouting-import-open]");
  if (openImportTrigger) {
    if (!deps.canEdit()) {
      return true;
    }
    deps.getWorkspaceRoot()?.querySelector("[data-scouting-import-file]")?.click();
    return true;
  }
  const openSettingsPanelTrigger = target.closest("[data-open-scouting-settings-panel]");
  if (openSettingsPanelTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.openSettingsPanel(openSettingsPanelTrigger.dataset.openScoutingSettingsPanel);
    return true;
  }
  const closeSettingsPanelTrigger = target.closest("[data-close-scouting-settings-panel]");
  if (closeSettingsPanelTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.closeSettingsPanel();
    return true;
  }
  const settingsOverlay = target.closest("[data-scouting-settings-overlay]");
  if (settingsOverlay && target === settingsOverlay) {
    deps.closeSettingsPanel();
    return true;
  }
  const datasourceToggle = target.closest("[data-scouting-datasource-toggle]");
  if (datasourceToggle) {
    window.setTimeout(() => deps.loadImportHistory(), 0);
    return true;
  }
  const applyImportTrigger = target.closest("[data-apply-scouting-import]");
  if (applyImportTrigger) {
    deps.applyImportDraft();
    return true;
  }
  const presetImportTrigger = target.closest("[data-scouting-import-preset]");
  if (presetImportTrigger) {
    deps.applyImportSourcePreset(presetImportTrigger.dataset.scoutingImportPreset);
    return true;
  }
  const clearImportTrigger = target.closest("[data-clear-scouting-import]");
  if (clearImportTrigger) {
    deps.clearImportedDatabase();
    return true;
  }
  const openSavedViewsTrigger = target.closest("[data-open-scouting-saved-views]");
  if (openSavedViewsTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.openSavedViews();
    return true;
  }
  const closeSavedViewsTrigger = target.closest("[data-close-scouting-saved-views]");
  if (closeSavedViewsTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.closeSavedViews();
    return true;
  }
  const saveCurrentViewTrigger = target.closest("[data-save-scouting-current-view]");
  if (saveCurrentViewTrigger) {
    event.preventDefault();
    event.stopPropagation();
    const form = saveCurrentViewTrigger.closest("[data-scouting-saved-view-form]");
    const input = form?.querySelector("[data-scouting-saved-view-name]");
    deps.createSavedView(input?.value || "");
    return true;
  }
  const savedViewsOverlay = target.closest("[data-scouting-saved-views-overlay]");
  if (savedViewsOverlay && target === savedViewsOverlay) {
    deps.closeSavedViews();
    return true;
  }
  const applySavedViewTrigger = target.closest("[data-apply-scouting-saved-view]");
  if (applySavedViewTrigger) {
    deps.setSavedViewsOpen(false);
    deps.applySavedView(applySavedViewTrigger.dataset.applyScoutingSavedView);
    return true;
  }
  const applyPresetViewTrigger = target.closest("[data-apply-scouting-preset-view]");
  if (applyPresetViewTrigger) {
    deps.setSavedViewsOpen(false);
    deps.applyPresetView(applyPresetViewTrigger.dataset.applyScoutingPresetView);
    return true;
  }
  const deleteSavedViewTrigger = target.closest("[data-delete-scouting-saved-view]");
  if (deleteSavedViewTrigger) {
    event.stopPropagation();
    deps.deleteSavedView(deleteSavedViewTrigger.dataset.deleteScoutingSavedView);
    return true;
  }
  return false;
}

export function handleScoutingDatabaseInput(event, deps = {}) {
  const target = event.target;
  const importSeasonInput = target.closest("[data-scouting-import-season]");
  if (importSeasonInput) {
    deps.updateImportSeasonDraft(importSeasonInput.value);
    return true;
  }
  const databaseSearchInput = target.closest("[data-scouting-database-search-input]");
  if (databaseSearchInput) {
    deps.setDatabaseSearchDraft(databaseSearchInput.value);
    return true;
  }
  const savedViewNameInput = target.closest("[data-scouting-saved-view-name]");
  if (savedViewNameInput) {
    deps.setSavedViewNameDraft(savedViewNameInput.value);
    return true;
  }
  const metricFilterSearchInput = target.closest("[data-scouting-metric-filter-search]");
  if (metricFilterSearchInput) {
    deps.setDatabaseMetricFilterOpen(true);
    deps.setDatabaseMetricFilterQuery(deps.normalizeText(metricFilterSearchInput.value, 80));
    deps.refreshDatabaseSurface({ controls: true });
    return true;
  }
  const filterInput = target.closest("[data-scouting-filter]");
  if (!filterInput || filterInput.dataset.scoutingFilter === "query") {
    return false;
  }
  if (filterInput.type === "range") {
    deps.updateRangeFilterDisplay(filterInput);
  }
  applyDatabaseFilterInput(filterInput, deps);
  return true;
}

export function handleScoutingDatabaseChange(event, deps = {}) {
  const target = event.target;
  const importFileInput = target.closest("[data-scouting-import-file]");
  if (importFileInput) {
    const nextFile = importFileInput.files?.[0];
    importFileInput.value = "";
    deps.loadImportFile(nextFile).catch((error) => {
      deps.setImportDraftFailure(error, nextFile?.name || "");
    });
    return true;
  }
  const importSheetInput = target.closest("[data-scouting-import-sheet]");
  if (importSheetInput) {
    deps.setImportDraftPatch({ selectedSheet: importSheetInput.value });
    return true;
  }
  const importMapInput = target.closest("[data-scouting-import-map]");
  if (importMapInput) {
    deps.setImportMapField(importMapInput.dataset.scoutingImportMap, importMapInput.value);
    return true;
  }
  const metricFilterChoice = target.closest("[data-scouting-metric-filter]");
  if (metricFilterChoice) {
    deps.setDatabaseMetricFilterOpen(true);
    const filters = deps.normalizeDatabaseFilters(deps.ensureState().databaseFilters);
    const selectedMetricIds = new Set(
      Array.isArray(filters.metricIds) && filters.metricIds.length
        ? filters.metricIds
        : filters.metricId && filters.metricId !== "all"
          ? [filters.metricId]
          : []
    );
    const metricId = deps.normalizeText(metricFilterChoice.value, 120);
    if (metricId) {
      if (metricFilterChoice.checked) {
        selectedMetricIds.add(metricId);
      } else {
        selectedMetricIds.delete(metricId);
      }
    }
    const nextMetricIds = Array.from(selectedMetricIds);
    deps.setDatabaseFilter("metricIds", nextMetricIds);
    const metricMin = Number(deps.normalizeDatabaseFilters(deps.ensureState().databaseFilters).metricMin);
    if (nextMetricIds.length && (!Number.isFinite(metricMin) || metricMin <= 0)) {
      deps.setDatabaseFilter("metricMin", 75);
    } else if (!nextMetricIds.length && Number.isFinite(metricMin) && metricMin > 0) {
      deps.setDatabaseFilter("metricMin", 0);
    }
    deps.refreshDatabaseSurface({ controls: true });
    return true;
  }
  const filterInput = target.closest("[data-scouting-filter]");
  if (!filterInput) {
    return false;
  }
  applyDatabaseFilterInput(filterInput, deps);
  return true;
}

export function handleScoutingDatabaseSubmit(event, deps = {}) {
  const target = event.target;
  const pageJumpForm = target.closest("[data-scouting-page-jump-form]");
  if (pageJumpForm) {
    event.preventDefault();
    deps.setDatabasePageNumber(new FormData(pageJumpForm).get("page"));
    return true;
  }
  const databaseSearchForm = target.closest("[data-scouting-database-search-form]");
  if (databaseSearchForm) {
    event.preventDefault();
    const query = new FormData(databaseSearchForm).get("query");
    deps.setDatabaseSearchDraft(null);
    deps.setDatabaseFilter("query", query);
    if (deps.isDatabaseLoaded()) {
      deps.scheduleDatabaseFilterRefresh();
    }
    return true;
  }
  const savedViewForm = target.closest("[data-scouting-saved-view-form]");
  if (savedViewForm) {
    if (!deps.canEdit()) {
      return true;
    }
    event.preventDefault();
    deps.createSavedView(new FormData(savedViewForm).get("name"));
    savedViewForm.reset();
    return true;
  }
  return false;
}

function applyDatabaseFilterInput(filterInput, deps) {
  const filterField = filterInput.dataset.scoutingFilter;
  deps.setDatabaseFilter(filterField, filterInput.value);
  if (filterField === "source") {
    deps.renderActiveTabSurfaceOrWorkspace({ preserveFocus: true });
    const nextFilters = deps.normalizeDatabaseFilters(deps.ensureState().databaseFilters);
    if (nextFilters.source === "fsdb" && nextFilters.fsdbGenderSegment) {
      deps.queueDatabaseLoad(deps.renderActiveTabSurfaceOrWorkspace);
    }
    return;
  }
  if (filterField === "fsdbGenderSegment") {
    deps.renderActiveTabSurfaceOrWorkspace({ preserveFocus: true });
    if (deps.normalizeDatabaseFilters(deps.ensureState().databaseFilters).source === "fsdb") {
      deps.queueDatabaseLoad(deps.renderActiveTabSurfaceOrWorkspace);
    }
    return;
  }
  if (deps.isDatabaseLoaded()) {
    deps.scheduleDatabaseFilterRefresh();
  }
}

function renderScoutingRecordListHeader() {
  return `
    <div class="scouting-record-table-head" aria-hidden="true">
      <span class="scouting-record-head-cell scouting-record-head-cell--spacer"></span>
      <span class="scouting-record-head-cell">Player</span>
      <span class="scouting-record-head-cell">Position</span>
      <span class="scouting-record-head-cell">Age</span>
      <span class="scouting-record-head-cell">Club</span>
      <span class="scouting-record-head-cell">Nationality</span>
      <span class="scouting-record-head-cell">Best role</span>
      <span class="scouting-record-head-cell">Recommendation</span>
      <span class="scouting-record-head-cell">Actions</span>
    </div>
  `;
}
