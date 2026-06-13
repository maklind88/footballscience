import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function renderReviewItem(item = {}, clip = {}) {
  return `
    <li class="video-analysis-review-item">
      <button type="button" data-video-analysis-seek="${escapeHtml(item.clipId)}">${escapeHtml(formatVideoTime(clip.startMs || clip.start_ms || 0))}</button>
      <span>${escapeHtml(clip.phase || "Clip")} / ${escapeHtml(clip.outcome || "Neutral")}</span>
      <button type="button" data-video-analysis-review-remove="${escapeHtml(item.clipId)}">Remove</button>
    </li>
  `;
}

export function renderPlaylistBuilder(state = {}) {
  const clipsById = new Map((state.clips || []).map((clip) => [clip.id, clip]));
  const items = Array.isArray(state.reviewList) ? state.reviewList : [];
  return `
    <section class="video-analysis-review">
      <div class="video-analysis-panel-header">
        <p class="video-analysis-kicker">Review</p>
        <h3>${items.length} clips</h3>
      </div>
      <ol>
        ${items.length ? items.map((item) => renderReviewItem(item, clipsById.get(item.clipId) || {})).join("") : `<li class="video-analysis-muted">No review clips selected.</li>`}
      </ol>
    </section>
  `;
}
