import { escapeHtml } from "../components/renderHelpers.js";
import { playerHeaderIcon } from "../components/playerHeaderIcons.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { getClipStartMs, getClipEndMs } from "./timeline.selectors.js";

export function createClipReview(clips = [], title = "Clips") {
  const unique = [...new Map(clips.filter(clip => clip?.id).map(clip => [clip.id, clip])).values()];
  const entries = unique.sort((a, b) => getClipStartMs(a) - getClipStartMs(b) || getClipEndMs(a) - getClipEndMs(b))
    .map(clip => ({ clip: structuredClone(clip), draft: null }));
  return {
    title, entries,
    remember(id, draft, baseline) {
      const entry = entries.find(item => item.clip.id === id);
      if (entry) entry.draft = JSON.stringify(draft) === JSON.stringify(baseline) ? null : structuredClone(draft);
    },
    saved(clip) {
      const entry = entries.find(item => item.clip.id === clip?.id);
      if (entry) { entry.clip = structuredClone(clip); entry.draft = null; }
    },
    remove(id) {
      const index = entries.findIndex(item => item.clip.id === id);
      if (index < 0) return null;
      entries.splice(index, 1);
      return entries[Math.min(index, entries.length - 1)]?.clip || null;
    },
    hasDrafts: () => entries.some(entry => entry.draft),
  };
}

export function renderClipReview(review, activeId) {
  if (!review) return "";
  const index = review.entries.findIndex(entry => entry.clip.id === activeId);
  return `<nav class="video-analysis-clip-review" data-clip-review-nav aria-label="${escapeHtml(review.title)} clips">
    <div class="video-analysis-clip-review__position">
      <button type="button" data-clip-review-step="-1" aria-label="Previous clip" title="Previous clip" ${index <= 0 ? "disabled" : ""}>${playerHeaderIcon("chevronLeft")}</button>
      <span>${index + 1} / ${review.entries.length}</span>
      <button type="button" data-clip-review-step="1" aria-label="Next clip" title="Next clip" ${index >= review.entries.length - 1 ? "disabled" : ""}>${playerHeaderIcon("chevronRight")}</button>
    </div>
    <ol>${review.entries.map(({ clip, draft }, itemIndex) => `<li>
      <button type="button" data-clip-review-select="${escapeHtml(clip.id)}" aria-pressed="${clip.id === activeId}" aria-description="${draft ? "Unsaved changes" : ""}" aria-label="Clip ${itemIndex + 1}, ${formatVideoTime(getClipStartMs(clip))} to ${formatVideoTime(getClipEndMs(clip))}">
        <strong>${itemIndex + 1}</strong><span>${formatVideoTime(getClipStartMs(clip))} - ${formatVideoTime(getClipEndMs(clip))}</span>
        <small data-clip-review-dirty ${draft ? "" : "hidden"}>Unsaved</small>
      </button>
    </li>`).join("")}</ol>
  </nav>`;
}

export function readClipEditorDraft(dialog) {
  return {
    fields: Object.fromEntries([...dialog.querySelectorAll("[data-video-analysis-timeline-edit-field]")]
      .map(input => [input.dataset.videoAnalysisTimelineEditField, input.value])),
    principles: [...dialog.querySelectorAll("[data-video-analysis-timeline-edit-principle]:checked")].map(input => input.value),
  };
}
