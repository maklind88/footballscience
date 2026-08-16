import {
  setPieceMomentOptions,
  setPieceRestartOptions,
  setPieceSubPhaseOptions,
} from "./constants.mjs";
import { escapeSetPieceHtml } from "./board-renderer.mjs";
import { countSetPieceLibraryFilters, matchesSetPieceLibraryFilters } from "./library-filters.mjs";
import { renderSetPieceToolIcon } from "./tool-icons.mjs";

const filterSections = Object.freeze([
  { key: "moment", label: "Moment", options: setPieceMomentOptions },
  { key: "restart", label: "Set-piece type", options: setPieceRestartOptions },
  { key: "subPhase", label: "Sub-phase", options: setPieceSubPhaseOptions },
]);

const optionLabels = new Map(filterSections.flatMap((section) => (
  section.options.map((option) => [`${section.key}:${option.value}`, option.label])
)));

function labelFor(group, value) {
  return optionLabels.get(`${group}:${value}`) || String(value || "").replaceAll("-", " ");
}

function renderFilterSection(section, ui) {
  const selected = ui.libraryFilters?.[section.key] || new Set();
  return `<fieldset class="spr-library-filter-group">
    <legend>${escapeSetPieceHtml(section.label)}</legend>
    <div class="spr-library-filter-options">
      ${section.options.map((option) => `<label class="spr-library-filter-option ${selected.has(option.value) ? "is-selected" : ""}">
        <input type="checkbox" data-set-piece-library-filter-group="${section.key}" data-set-piece-library-filter-value="${escapeSetPieceHtml(option.value)}" ${selected.has(option.value) ? "checked" : ""}>
        <span>${escapeSetPieceHtml(option.label)}</span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

function renderFilterControl(ui = {}) {
  const activeCount = countSetPieceLibraryFilters(ui.libraryFilters);
  return `<div class="spr-library-filter-control">
    <button type="button" class="spr-library-filter-trigger ${activeCount ? "is-active" : ""}" data-set-piece-action="toggle-library-filters" aria-expanded="${Boolean(ui.libraryFiltersOpen)}" aria-controls="setPieceLibraryFilters">
      <span class="spr-library-filter-icon">${renderSetPieceToolIcon("filter")}</span>
      <span>Filters</span>
      <small>${activeCount || "All"}</small>
      <span class="spr-library-filter-chevron" aria-hidden="true">⌄</span>
    </button>
    ${ui.libraryFiltersOpen ? `<div id="setPieceLibraryFilters" class="spr-library-filter-panel" aria-label="Library filters">
      <div class="spr-library-filter-heading"><strong>Filter library</strong><button type="button" data-set-piece-action="clear-library-filters" ${activeCount ? "" : "disabled"}>Clear</button></div>
      ${filterSections.map((section) => renderFilterSection(section, ui)).join("")}
    </div>` : ""}
  </div>`;
}

function matchesSearch(play = {}, query = "") {
  if (!query) return true;
  const values = [
    play.title,
    play.opponent,
    labelFor("restart", play.restart),
    labelFor("moment", play.moment),
    ...(play.subPhases || []).map((value) => labelFor("subPhase", value)),
  ];
  return values.some((value) => String(value || "").toLowerCase().includes(query));
}

function renderPlayLibrary(state = {}, ui = {}) {
  const query = String(ui.searchQuery || "").trim().toLowerCase();
  const plays = (state.plays || []).filter((play) => (
    matchesSetPieceLibraryFilters(play, ui.libraryFilters) && matchesSearch(play, query)
  ));
  return `<aside class="spr-library" aria-label="Set piece library">
    <div class="spr-panel-heading">
      <div><p>Library</p><strong>${state.plays?.length || 0} plans</strong></div>
      <div class="spr-library-heading-actions">
        <button type="button" class="spr-command-button" data-set-piece-action="new-play"><span aria-hidden="true">＋</span> New</button>
        <button type="button" class="spr-icon-button spr-library-close" data-set-piece-action="close-library" aria-label="Close set piece library" title="Close library">×</button>
      </div>
    </div>
    <label class="spr-search-field"><span class="sr-only">Search set pieces</span><input type="search" placeholder="Search" value="${escapeSetPieceHtml(ui.searchQuery)}" data-set-piece-search></label>
    ${renderFilterControl(ui)}
    <div class="spr-play-list">
      ${plays.map((play) => {
        const subPhases = (play.subPhases || []).map((value) => labelFor("subPhase", value));
        return `<button type="button" class="spr-play-item ${play.id === state.activePlayId ? "is-active" : ""}" data-set-piece-play-id="${escapeSetPieceHtml(play.id)}">
          <span class="spr-play-type">${escapeSetPieceHtml(`${labelFor("moment", play.moment)} · ${labelFor("restart", play.restart)}`)}</span>
          <strong data-set-piece-play-title="${escapeSetPieceHtml(play.id)}">${escapeSetPieceHtml(play.title)}</strong>
          <small>${escapeSetPieceHtml([play.context, ...subPhases, play.opponent].filter(Boolean).join(" · "))}</small>
        </button>`;
      }).join("") || '<div class="spr-empty-list" aria-label="No matching set pieces"><strong>No matches</strong><small>Try removing a filter.</small></div>'}
    </div>
  </aside>`;
}

export function renderSetPieceLibraryLayer(state = {}, ui = {}) {
  return `<div id="setPieceLibraryPanel" class="spr-library-layer" ${ui.libraryOpen ? "" : "hidden"}>
    <button type="button" class="spr-library-backdrop" data-set-piece-action="close-library" tabindex="-1" aria-hidden="true"></button>
    ${renderPlayLibrary(state, ui)}
  </div>`;
}
