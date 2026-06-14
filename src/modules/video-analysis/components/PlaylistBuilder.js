import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function renderReviewItem(item = {}, clip = {}, sectionId = "") {
  const startMs = clip.startMs || clip.start_ms || 0;
  return `
    <li class="video-analysis-review-item">
      <button type="button" data-video-analysis-seek="${escapeHtml(item.clipId)}">${escapeHtml(formatVideoTime(startMs))}</button>
      <span>${escapeHtml(clip.phase || "Clip")} / ${escapeHtml(clip.outcome || "Neutral")}</span>
      <button type="button" data-video-analysis-review-remove="${escapeHtml(sectionId)}:${escapeHtml(item.clipId)}">Remove</button>
    </li>
  `;
}

function renderSection(section = {}, clipsById = new Map(), activeSectionId = "") {
  const items = Array.isArray(section.items) ? section.items : [];
  return `
    <section class="video-analysis-review-section${activeSectionId === section.id ? " is-active" : ""}">
      <button type="button" class="video-analysis-review-section__header" data-video-analysis-review-section="${escapeHtml(section.id)}">
        <span>${escapeHtml(section.title)}</span>
        <strong>${items.length}</strong>
      </button>
      <textarea rows="2" placeholder="Meeting note" data-video-analysis-review-note="${escapeHtml(section.id)}">${escapeHtml(section.note || "")}</textarea>
      <ol>
        ${items.length ? items.map((item) => renderReviewItem(item, clipsById.get(item.clipId) || {}, section.id)).join("") : `<li class="video-analysis-muted">No clips selected.</li>`}
      </ol>
    </section>
  `;
}

export function renderPlaylistBuilder(state = {}) {
  const clipsById = new Map((state.clips || []).map((clip) => [clip.id, clip]));
  const sections = Array.isArray(state.reviewSections) ? state.reviewSections : [];
  return `
    <section class="video-analysis-review">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Review Builder</p>
          <h3>${escapeHtml(state.reviewTitle || "Football Science Review")}</h3>
        </div>
        <button type="button" data-video-analysis-save-review ${state.canEdit ? "" : "disabled"}>Save review</button>
      </div>
      <div class="video-analysis-review-sections">
        ${sections.map((section) => renderSection(section, clipsById, state.activeReviewSectionId)).join("")}
      </div>
    </section>
  `;
}
