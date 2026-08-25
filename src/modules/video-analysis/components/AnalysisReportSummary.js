import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function reportOf(presentation = {}) {
  const report = presentation.metadata?.analysisReport;
  return report?.schema === "football-science-analysis-report-v1" ? report : null;
}

function renderKpi(label = "", value = "") {
  return `<span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(label)}</small></span>`;
}

function renderDistribution(values = []) {
  const maximum = Math.max(1, ...values.map((entry) => Number(entry.count || 0)));
  return values.slice(0, 6).map((entry) => `
    <div class="video-analysis-report-distribution-row">
      <span>${escapeHtml(entry.label || "Uncoded")}</span>
      <i><b style="--report-bar:${Math.round((Number(entry.count || 0) / maximum) * 100)}%"></b></i>
      <strong>${Number(entry.count || 0)}</strong>
    </div>
  `).join("");
}

function renderComparison(report = {}) {
  const comparison = report.comparison;
  if (!comparison) return "";
  return `
    <section class="video-analysis-report-comparison">
      <header><strong>${escapeHtml(comparison.a.label || "Cohort A")}</strong><strong>${escapeHtml(comparison.b.label || "Cohort B")}</strong></header>
      <div><span>Clips</span><strong>${comparison.a.clipCount}</strong><strong>${comparison.b.clipCount}</strong></div>
      <div><span>Sources</span><strong>${comparison.a.matchCount}</strong><strong>${comparison.b.matchCount}</strong></div>
      <div><span>Positive</span><strong>${Math.round(comparison.a.positiveRate * 100)}%</strong><strong>${Math.round(comparison.b.positiveRate * 100)}%</strong></div>
      <div><span>Average clip</span><strong>${escapeHtml(formatVideoTime(comparison.a.averageDurationMs))}</strong><strong>${escapeHtml(formatVideoTime(comparison.b.averageDurationMs))}</strong></div>
    </section>
  `;
}

export function renderAnalysisReportSummary(presentation = {}) {
  const report = reportOf(presentation);
  if (!report) return "";
  const summary = report.summary || {};
  const principles = summary.distributions?.principles || [];
  const subPhases = summary.distributions?.subPhases || [];
  return `
    <section class="video-analysis-report-summary" data-video-analysis-report-summary>
      <header>
        <div>
          <p class="video-analysis-kicker">Analysis report</p>
          <h2>${escapeHtml(presentation.title || "FS Player Analysis Report")}</h2>
          <p>${escapeHtml(report.finding || "")}</p>
        </div>
        <button type="button" data-video-analysis-report-print>Print / PDF</button>
      </header>
      <div class="video-analysis-report-kpis">
        ${renderKpi("Clips", String(summary.clipCount || 0))}
        ${renderKpi("Sources", String(summary.matchCount || 0))}
        ${renderKpi("Duration", formatVideoTime(summary.durationMs || 0))}
        ${renderKpi("Positive", `${Math.round(Number(summary.positiveRate || 0) * 100)}%`)}
        ${renderKpi("Development", `${Math.round(Number(summary.developmentRate || 0) * 100)}%`)}
      </div>
      ${report.interpretation?.length ? `
        <div class="video-analysis-report-query">
          ${report.interpretation.map((chip) => `<span><small>${escapeHtml(chip.type || "Filter")}</small>${escapeHtml(chip.label || "")}</span>`).join("")}
        </div>
      ` : ""}
      <div class="video-analysis-report-analysis-grid">
        <section><h3>Sub-phases</h3>${renderDistribution(subPhases)}</section>
        <section><h3>MG principles</h3>${renderDistribution(principles)}</section>
        ${renderComparison(report)}
      </div>
      <footer>
        <span>${escapeHtml(report.source?.scope === "team-corpus" ? "Team corpus" : "Workspace")}</span>
        <time datetime="${escapeHtml(report.generatedAt || "")}">${escapeHtml(String(report.generatedAt || "").slice(0, 16).replace("T", " "))}</time>
      </footer>
    </section>
  `;
}
