import { trackingMeasurementIntelligence } from "../services/trackingMeasurementIntelligenceService.js";
import { escapeHtml } from "./renderHelpers.js";

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "--";
}

function signedPercent(value) {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${(value * 100).toFixed(1)} pp`;
}

function valueOrDash(value) {
  return Number.isInteger(value) ? String(value) : "--";
}

function statusLabel(status) {
  if (status === "passed") return "Approval gate passed";
  if (status === "failed") return "Below approval gate";
  return "Evidence incomplete";
}

function metricRows(intelligence) {
  return intelligence.metrics.map((entry) => `
    <div class="is-${escapeHtml(entry.status)}">
      <dt><span>${escapeHtml(entry.label)}</span><em>${escapeHtml(signedPercent(entry.delta))}</em></dt>
      <dd>${escapeHtml(percent(entry.actual))}</dd>
      <small>Gate ${escapeHtml(percent(entry.expected))}</small>
    </div>
  `).join("");
}

function entityRows(intelligence) {
  return intelligence.entities.map((entry) => `
    <tr class="${entry.id === intelligence.weakestEntity?.id ? "is-weakest" : ""}">
      <th scope="row">${escapeHtml(entry.label)}</th>
      <td>${escapeHtml(percent(entry.HOTA))}</td>
      <td>${escapeHtml(percent(entry.DetA))}</td>
      <td>${escapeHtml(percent(entry.AssA))}</td>
      <td>${escapeHtml(percent(entry.IDF1))}</td>
    </tr>
  `).join("");
}

function evidenceSummary(intelligence) {
  const limiter = intelligence.limiter;
  const weakestCase = intelligence.weakestCase;
  if (!intelligence.verified || !limiter) {
    return `<p class="video-analysis-measurement-intelligence__issue">Verified metrics, per-entity evidence or case cross-validation is missing.</p>`;
  }
  return `
    <div class="video-analysis-measurement-intelligence__focus">
      <span>Measured limiter</span>
      <strong>${escapeHtml(limiter.dimension)} · ${escapeHtml(limiter.label)}</strong>
      <p>${escapeHtml(limiter.recommendation)}</p>
    </div>
    <dl class="video-analysis-measurement-intelligence__evidence">
      <div><dt>Weakest class</dt><dd>${escapeHtml(intelligence.weakestEntity?.label || "--")}</dd></div>
      <div><dt>Weakest case</dt><dd>${escapeHtml(weakestCase?.id || "--")}</dd></div>
      <div><dt>ID switches</dt><dd>${escapeHtml(valueOrDash(intelligence.events.identitySwitches))}</dd></div>
      <div><dt>Fragments</dt><dd>${escapeHtml(valueOrDash(intelligence.events.fragmentations))}</dd></div>
    </dl>
  `;
}

export function renderTrackingMeasurementIntelligence(evaluation = {}) {
  const intelligence = trackingMeasurementIntelligence(evaluation);
  if (!intelligence) return "";
  return `
    <section class="video-analysis-measurement-intelligence is-${escapeHtml(intelligence.status)}" aria-label="TrackEval measurement intelligence">
      <header>
        <div><span>Tracking intelligence</span><strong>TrackEval measurement</strong></div>
        <em>${escapeHtml(statusLabel(intelligence.status))}</em>
      </header>
      <dl class="video-analysis-measurement-intelligence__metrics">
        ${metricRows(intelligence)}
      </dl>
      <div class="video-analysis-measurement-intelligence__entities">
        <span>Entity profile</span>
        <table>
          <thead><tr><th scope="col">Class</th><th scope="col">HOTA</th><th scope="col">DetA</th><th scope="col">AssA</th><th scope="col">IDF1</th></tr></thead>
          <tbody>${entityRows(intelligence)}</tbody>
        </table>
      </div>
      ${evidenceSummary(intelligence)}
      <footer>
        <span>Independent cross-check</span>
        <strong>${escapeHtml(`${intelligence.crossValidation.passedCaseCount}/${intelligence.crossValidation.caseCount} cases`)}</strong>
      </footer>
    </section>
  `;
}
