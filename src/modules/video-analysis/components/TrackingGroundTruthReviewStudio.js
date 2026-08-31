import { trackingGroundTruthReviewStudioState } from "../services/trackingGroundTruthReviewStudioService.js";
import { escapeHtml } from "./renderHelpers.js";

function actionButton(value = {}, primary = false) {
  if (value.trackId) {
    return `<button type="button" class="${primary ? "is-primary" : ""}" data-video-analysis-track-select="${escapeHtml(value.trackId)}">${escapeHtml(value.label)}</button>`;
  }
  const data = Object.entries(value.data || {}).map(([key, entry]) => (
    ` data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeHtml(String(entry))}"`
  )).join("");
  return `<button type="button" class="${primary ? "is-primary" : ""}" data-video-analysis-tracking-action="${escapeHtml(value.id)}"${data}>${escapeHtml(value.label)}</button>`;
}

export function renderTrackingGroundTruthReviewStudio(state = {}, item = null) {
  const studio = trackingGroundTruthReviewStudioState(state, item);
  const completed = studio.stages.filter((entry) => entry.status === "complete").length;
  const campaignLabel = studio.campaign.caseCount
    ? `${studio.campaign.completeCaseCount}/${studio.campaign.caseCount} cases`
    : "Pilot review";
  return `
    <section class="video-analysis-ground-truth-studio" aria-label="Ground truth review studio">
      <header>
        <div><span>Ground truth</span><strong>Review Studio</strong></div>
        <em>${escapeHtml(campaignLabel)}</em>
      </header>
      <p class="video-analysis-ground-truth-studio__case"><span>Current case</span><strong>${escapeHtml(studio.caseId)}</strong><span>${completed}/${studio.stages.length} stages</span></p>
      <ol class="video-analysis-ground-truth-studio__stages">
        ${studio.stages.map((entry, index) => `
          <li class="is-${escapeHtml(entry.status)}" ${entry.id === studio.currentStageId ? 'aria-current="step"' : ""}>
            <span>${index + 1}</span>
            <div><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.detail)}</small></div>
          </li>
        `).join("")}
      </ol>
      <div class="video-analysis-ground-truth-studio__next" aria-live="polite">
        <span>Next safe action</span>
        <strong>${escapeHtml(studio.next.title)}</strong>
        <p>${escapeHtml(studio.next.detail)}</p>
        ${studio.next.actions.length ? `<div>${studio.next.actions.map((entry, index) => actionButton(entry, index === 0)).join("")}</div>` : ""}
      </div>
    </section>
  `;
}
