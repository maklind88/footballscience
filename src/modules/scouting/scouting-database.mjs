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
