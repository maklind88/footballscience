import { trackingCapabilityReadiness } from "../services/trackingCapabilityReadinessService.js";
import { escapeHtml } from "./renderHelpers.js";

export function renderTrackingCapabilityReadiness(tracking = {}) {
  const readiness = trackingCapabilityReadiness(tracking);
  return `
    <section class="video-analysis-tracking-readiness" aria-label="Tracking capability readiness">
      <header>
        <span>Tracking readiness</span>
        <strong>${escapeHtml(readiness.modeLabel)}</strong>
      </header>
      <dl>
        ${readiness.entries.map((entry) => `
          <div class="is-${escapeHtml(entry.status)}" data-video-analysis-tracking-capability="${escapeHtml(entry.id)}">
            <dt><i aria-hidden="true"></i>${escapeHtml(entry.label)}</dt>
            <dd>${escapeHtml(entry.detail)}</dd>
          </div>
        `).join("")}
      </dl>
    </section>
  `;
}
