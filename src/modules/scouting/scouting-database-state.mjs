const scoutingDatabaseUiState = {
  advancedFiltersOpen: false,
  advancedMode: false,
  apiRefreshTimer: 0,
  filterDebounceTimer: 0,
  metricFilterOpen: false,
  metricFilterQuery: "",
  resultsFrame: 0,
  searchDraft: null,
};

export function getScoutingAdvancedDatabaseFiltersOpen() {
  return scoutingDatabaseUiState.advancedFiltersOpen;
}

export function setScoutingAdvancedDatabaseFiltersOpen(open) {
  scoutingDatabaseUiState.advancedFiltersOpen = Boolean(open);
}

export function getScoutingDatabaseAdvancedMode() {
  return scoutingDatabaseUiState.advancedMode;
}

export function setScoutingDatabaseAdvancedMode(enabled) {
  scoutingDatabaseUiState.advancedMode = Boolean(enabled);
}

export function getScoutingDatabaseApiRefreshTimer() {
  return scoutingDatabaseUiState.apiRefreshTimer;
}

export function setScoutingDatabaseApiRefreshTimer(timer) {
  scoutingDatabaseUiState.apiRefreshTimer = timer || 0;
}

export function getScoutingDatabaseFilterDebounceTimer() {
  return scoutingDatabaseUiState.filterDebounceTimer;
}

export function setScoutingDatabaseFilterDebounceTimer(timer) {
  scoutingDatabaseUiState.filterDebounceTimer = timer || 0;
}

export function getScoutingDatabaseMetricFilterOpen() {
  return scoutingDatabaseUiState.metricFilterOpen;
}

export function setScoutingDatabaseMetricFilterOpen(open) {
  scoutingDatabaseUiState.metricFilterOpen = Boolean(open);
}

export function getScoutingDatabaseMetricFilterQuery() {
  return scoutingDatabaseUiState.metricFilterQuery;
}

export function setScoutingDatabaseMetricFilterQuery(query) {
  scoutingDatabaseUiState.metricFilterQuery = query || "";
}

export function getScoutingDatabaseResultsFrame() {
  return scoutingDatabaseUiState.resultsFrame;
}

export function setScoutingDatabaseResultsFrame(frame) {
  scoutingDatabaseUiState.resultsFrame = frame || 0;
}

export function getScoutingDatabaseSearchDraft() {
  return scoutingDatabaseUiState.searchDraft;
}

export function setScoutingDatabaseSearchDraft(value) {
  scoutingDatabaseUiState.searchDraft = value;
}
