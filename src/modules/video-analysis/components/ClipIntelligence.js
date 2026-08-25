import {
  buildClipMatrix,
  buildCohortComparison,
  buildMatrixDrilldown,
  clipAnalysisAxes,
  clipAnalysisMetrics,
  clipsForIntelligenceState,
} from "../services/clipAnalyticsService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml, optionList } from "./renderHelpers.js";

const matrixModes = Object.freeze([
  { id: "phase-outcome", label: "Phase x Outcome" },
  { id: "mg-principle-player", label: "Principle x Player" },
  { id: "mini-game-unit", label: "Principle x Unit" },
]);

function formatMetric(cell = null, metric = "count") {
  if (!cell?.count) return "";
  if (metric === "duration") return formatVideoTime(cell.durationMs);
  if (metric === "positiveRate") return `${Math.round(cell.value * 100)}%`;
  if (metric === "averageDuration") return formatVideoTime(cell.value);
  return String(cell.count);
}

function renderMatrixCell(rowLabel = "", column = "", cell = null, metric = "count", selected = false) {
  const intensity = Math.max(0, Math.min(1, Number(cell?.intensity || 0))).toFixed(3);
  return `
    <button type="button" class="video-analysis-matrix-cell${selected ? " is-active" : ""}${cell?.count ? " has-value" : ""}"
      style="--matrix-intensity:${intensity}"
      aria-label="${escapeHtml(`${rowLabel}, ${column}, ${formatMetric(cell, metric) || "no clips"}`)}"
      data-video-analysis-matrix-cell="${escapeHtml(rowLabel)}|${escapeHtml(column)}">
      ${escapeHtml(formatMetric(cell, metric))}
    </button>
  `;
}

function renderQueryChips(intelligence = {}) {
  const request = intelligence.interpretation || {};
  const chips = request.mode === "comparison"
    ? [...(request.cohortA?.chips || []), ...(request.cohortB?.chips || [])]
    : request.chips || [];
  if (!chips.length) return "";
  return `
    <div class="video-analysis-intelligence-chips" aria-label="Interpreted query">
      ${chips.slice(0, 24).map((chip) => `<span><small>${escapeHtml(chip.type)}</small>${escapeHtml(chip.label)}</span>`).join("")}
    </div>
  `;
}

function renderCorpusStatus(intelligence = {}, resultCount = 0) {
  const loading = intelligence.status === "loading";
  const source = intelligence.sourceScope === "team-corpus" ? "Team corpus" : "Workspace";
  const count = Number(intelligence.corpusCount || 0);
  return `
    <div class="video-analysis-intelligence-status${loading ? " is-loading" : ""}" aria-live="polite">
      <span aria-hidden="true"></span>
      <strong>${escapeHtml(loading ? "Loading corpus" : intelligence.active ? `${resultCount} results` : `${count || resultCount} clips`)}</strong>
      <small>${escapeHtml(`${source}${intelligence.corpusTruncated ? " / first 20,000" : ""}`)}</small>
    </div>
  `;
}

function renderMatrixControls(matrix = {}) {
  return `
    <div class="video-analysis-intelligence-matrix-controls">
      <label><span>Rows</span><select data-video-analysis-matrix-config="rowAxis">${optionList(clipAnalysisAxes, matrix.rowAxis || "phase", (axis) => axis.id, (axis) => axis.label)}</select></label>
      <label><span>Columns</span><select data-video-analysis-matrix-config="columnAxis">${optionList(clipAnalysisAxes, matrix.columnAxis || "outcome", (axis) => axis.id, (axis) => axis.label)}</select></label>
      <label><span>Metric</span><select data-video-analysis-matrix-config="metric">${optionList(clipAnalysisMetrics, matrix.metric || "count", (metric) => metric.id, (metric) => metric.label)}</select></label>
    </div>
  `;
}

function renderMatrix(model = {}, matrix = {}) {
  if (!model.rows.length || !model.columns.length) {
    return `<div class="video-analysis-intelligence-empty"><strong>No matrix values</strong></div>`;
  }
  return `
    <div class="video-analysis-matrix" style="--matrix-columns:${Math.max(1, model.columns.length)}">
      <div class="video-analysis-matrix__corner">${escapeHtml(`${model.rowAxis} / ${model.columnAxis}`)}</div>
      ${model.columns.map((column) => `<div class="video-analysis-matrix__column" title="${escapeHtml(column)}">${escapeHtml(column)}</div>`).join("")}
      ${model.rows.map((row) => `
        <div class="video-analysis-matrix__row" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</div>
        ${model.columns.map((column) => renderMatrixCell(
          row.label,
          column,
          row.cells.get(column),
          model.metric,
          matrix.selectedRow === row.label && matrix.selectedColumn === column,
        )).join("")}
      `).join("")}
    </div>
  `;
}

function renderOutcomeBars(metrics = {}) {
  const outcomes = [
    { label: "Positive", count: metrics.outcomes?.Positive || 0, className: "is-positive" },
    { label: "Development", count: metrics.outcomes?.Development || 0, className: "is-development" },
    { label: "Neutral", count: metrics.outcomes?.Neutral || 0, className: "is-neutral" },
  ];
  const maximum = Math.max(1, ...outcomes.map((entry) => entry.count));
  return outcomes.map((entry) => `
    <div class="video-analysis-intelligence-bar ${entry.className}">
      <span>${escapeHtml(entry.label)}</span>
      <i><b style="--bar-size:${Math.round((entry.count / maximum) * 100)}%"></b></i>
      <strong>${entry.count}</strong>
    </div>
  `).join("");
}

function renderDrilldown(drilldown = {}) {
  return `
    <section class="video-analysis-intelligence-drilldown" aria-label="Matrix drilldown">
      <header>
        <div><p class="video-analysis-kicker">Drilldown</p><strong>${escapeHtml(drilldown.title)}</strong></div>
        <div>
          <span><strong>${drilldown.clipCount}</strong><small>Clips</small></span>
          <span><strong>${escapeHtml(formatVideoTime(drilldown.durationMs))}</strong><small>Duration</small></span>
          <span><strong>${Math.round(drilldown.positiveRate * 100)}%</strong><small>Positive</small></span>
          <span><strong>${drilldown.matchCount}</strong><small>Sources</small></span>
        </div>
      </header>
      <div class="video-analysis-intelligence-bars">${renderOutcomeBars(drilldown)}</div>
    </section>
  `;
}

function comparisonMetric(label = "", aValue = "", bValue = "", delta = "") {
  return `
    <div class="video-analysis-intelligence-compare-row">
      <span>${escapeHtml(label)}</span><strong>${escapeHtml(aValue)}</strong><strong>${escapeHtml(bValue)}</strong><em>${escapeHtml(delta)}</em>
    </div>
  `;
}

function signed(value = 0, suffix = "") {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${Math.round(number)}${suffix}`;
}

function renderComparison(comparison = null) {
  if (!comparison) return "";
  return `
    <section class="video-analysis-intelligence-comparison" aria-label="Cohort comparison">
      <header>
        <div><p class="video-analysis-kicker">Cohort A</p><strong>${escapeHtml(comparison.a.label)}</strong></div>
        <div><p class="video-analysis-kicker">Cohort B</p><strong>${escapeHtml(comparison.b.label)}</strong></div>
      </header>
      <div class="video-analysis-intelligence-compare-table">
        <div class="video-analysis-intelligence-compare-row is-head"><span>Metric</span><strong>A</strong><strong>B</strong><em>Delta B-A</em></div>
        ${comparisonMetric("Clips", String(comparison.a.clipCount), String(comparison.b.clipCount), signed(comparison.deltas.clipCount))}
        ${comparisonMetric("Sources", String(comparison.a.matchCount), String(comparison.b.matchCount), signed(comparison.deltas.matchCount))}
        ${comparisonMetric("Duration", formatVideoTime(comparison.a.durationMs), formatVideoTime(comparison.b.durationMs), signed(comparison.deltas.durationMs / 1000, "s"))}
        ${comparisonMetric("Positive", `${Math.round(comparison.a.positiveRate * 100)}%`, `${Math.round(comparison.b.positiveRate * 100)}%`, signed(comparison.deltas.positiveRate * 100, " pp"))}
      </div>
    </section>
  `;
}

export function renderClipIntelligence(state = {}) {
  const intelligence = state.intelligence || {};
  const matrix = state.matrix || {};
  const results = clipsForIntelligenceState(state);
  const corpus = intelligence.corpus?.length ? intelligence.corpus : (state.allClips?.length ? state.allClips : state.clips || []);
  const model = buildClipMatrix(results, matrix);
  const drilldown = buildMatrixDrilldown(results, matrix);
  const comparison = buildCohortComparison(corpus, intelligence.cohortA, intelligence.cohortB);
  return `
    <section class="video-analysis-intelligence" data-video-analysis-intelligence>
      <header class="video-analysis-intelligence-header">
        <div><p class="video-analysis-kicker">Find</p><h3>Clip Intelligence</h3></div>
        ${renderCorpusStatus(intelligence, results.length)}
      </header>
      <div class="video-analysis-intelligence-query">
        <input type="search" aria-label="Natural language clip query" placeholder="High Press, Positive, latest 5 matches" data-video-analysis-intelligence-query value="${escapeHtml(intelligence.queryText || "")}">
        <button type="button" class="is-primary" data-video-analysis-intelligence-action="run">Run</button>
        <button type="button" data-video-analysis-intelligence-action="clear">Clear</button>
        <button type="button" data-video-analysis-intelligence-action="set-a" title="Set current query as cohort A">Set A</button>
        <button type="button" data-video-analysis-intelligence-action="set-b" title="Set current query as cohort B">Set B</button>
        <button type="button" data-video-analysis-intelligence-action="load">Refresh corpus</button>
      </div>
      ${intelligence.error ? `<p class="video-analysis-intelligence-error">${escapeHtml(intelligence.error)}</p>` : ""}
      ${renderQueryChips(intelligence)}
      <div class="video-analysis-intelligence-modebar">
        <div class="video-analysis-mode-toggle" role="group" aria-label="Matrix presets">
          ${matrixModes.map((mode) => `<button type="button" class="${matrix.mode === mode.id ? "is-active" : ""}" data-video-analysis-matrix="${mode.id}">${escapeHtml(mode.label)}</button>`).join("")}
        </div>
        ${renderMatrixControls(matrix)}
      </div>
      ${renderMatrix(model, matrix)}
      <div class="video-analysis-intelligence-lower">
        ${renderDrilldown(drilldown)}
        ${renderComparison(comparison)}
      </div>
      <footer class="video-analysis-intelligence-actions">
        <button type="button" data-video-analysis-intelligence-action="select-results" ${results.length ? "" : "disabled"}>Select results</button>
        <button type="button" class="is-primary" data-video-analysis-intelligence-action="report" ${results.length || comparison ? "" : "disabled"}>Build analysis report</button>
      </footer>
    </section>
  `;
}
