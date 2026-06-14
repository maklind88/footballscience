import { buildClipMatrix } from "../services/clipIntelligenceService.js";
import { escapeHtml } from "./renderHelpers.js";

const matrixModes = Object.freeze([
  { id: "phase-outcome", label: "Phase x Outcome" },
  { id: "principle-player", label: "Principle x Player" },
  { id: "mini-game-unit", label: "Mini-game x Unit" },
]);

function renderMatrixCell(rowLabel = "", column = "", count = 0, selected = false) {
  return `
    <button type="button" class="video-analysis-matrix-cell${selected ? " is-active" : ""}"
      data-video-analysis-matrix-cell="${escapeHtml(rowLabel)}|${escapeHtml(column)}">
      ${count || ""}
    </button>
  `;
}

export function renderClipIntelligence(state = {}) {
  const matrix = state.matrix || {};
  const model = buildClipMatrix(state.clips || [], matrix.mode);
  return `
    <section class="video-analysis-intelligence">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Find</p>
          <h3>Clip Intelligence</h3>
        </div>
        <div class="video-analysis-mode-toggle" role="group" aria-label="Matrix mode">
          ${matrixModes.map((mode) => `
            <button type="button" class="${matrix.mode === mode.id ? "is-active" : ""}" data-video-analysis-matrix="${mode.id}">
              ${escapeHtml(mode.label)}
            </button>
          `).join("")}
        </div>
      </div>
      <div class="video-analysis-matrix">
        <div class="video-analysis-matrix__corner">${escapeHtml(`${model.rowAxis} / ${model.columnAxis}`)}</div>
        ${model.columns.map((column) => `<div class="video-analysis-matrix__column">${escapeHtml(column)}</div>`).join("")}
        ${model.rows.map((row) => `
          <div class="video-analysis-matrix__row">${escapeHtml(row.label)}</div>
          ${model.columns.map((column) => renderMatrixCell(
            row.label,
            column,
            row.counts.get(column) || 0,
            matrix.selectedRow === row.label && matrix.selectedColumn === column
          )).join("")}
        `).join("")}
      </div>
      <div class="video-analysis-saved-searches">
        <button type="button" data-video-analysis-save-search>Save search</button>
        ${(state.savedSearches || []).slice(0, 4).map((search) => `
          <button type="button" data-video-analysis-apply-search="${escapeHtml(search.id || search.title)}">
            ${escapeHtml(search.title || "Saved search")}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}
