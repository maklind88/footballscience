import {
  presentationQueue,
  selectedPresentationItem,
} from "../services/presentationService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function itemTitle(item = {}) {
  const clip = item.clip || {};
  return item.customTitle || `${clip.phase || "Clip"} / ${clip.outcome || "Neutral"}`;
}

function renderQueueItem(item = {}, active = false) {
  const clip = item.clip || {};
  const startMs = item.startMs ?? clip.startMs ?? clip.start_ms ?? 0;
  return `
    <button type="button" class="video-analysis-presenter-queue-item${active ? " is-active" : ""}" data-video-analysis-presentation-select-item="${escapeHtml(item.id)}">
      <span>${escapeHtml(formatVideoTime(startMs))}</span>
      <strong>${escapeHtml(itemTitle(item))}</strong>
      <small>${escapeHtml(item.sectionTitle || "Section")}</small>
    </button>
  `;
}

export function renderPresenterMode(state = {}) {
  const presentation = state.presentation?.current || {};
  const queue = presentationQueue(presentation);
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  const activeIndex = Math.max(0, queue.findIndex((entry) => entry.id === item?.id));
  const drawings = Array.isArray(item?.drawings) ? item.drawings : [];
  return `
    <section class="video-analysis-presenter-mode" aria-label="Presenter mode">
      <aside class="video-analysis-presenter-queue" aria-label="Clip queue">
        <div>
          <p class="video-analysis-kicker">Meeting queue</p>
          <h3>${escapeHtml(`${queue.length} clips`)}</h3>
        </div>
        <div class="video-analysis-presenter-queue-list">
          ${queue.length
            ? queue.map((entry) => renderQueueItem(entry, entry.id === item?.id)).join("")
            : `<p class="video-analysis-muted">No clips in this presentation.</p>`}
        </div>
      </aside>
      <section class="video-analysis-presenter-stage" aria-label="Clean presentation stage">
        <div class="video-analysis-presenter-stage__top">
          <div>
            <p class="video-analysis-kicker">${escapeHtml(item?.sectionTitle || "Presenter")}</p>
            <h3>${escapeHtml(item ? itemTitle(item) : presentation.title || "Presentation")}</h3>
          </div>
          <div class="video-analysis-presenter-controls">
            <button type="button" data-video-analysis-presenter-prev ${activeIndex > 0 ? "" : "disabled"}>Previous clip</button>
            <button type="button" data-video-analysis-presenter-next ${activeIndex < queue.length - 1 ? "" : "disabled"}>Next clip</button>
            <button type="button" data-video-analysis-presenter-fullscreen>Fullscreen</button>
            <button type="button" data-video-analysis-presentation-mode="builder">Exit</button>
          </div>
        </div>
        <div class="video-analysis-presenter-frame">
          <span>${escapeHtml(item ? `Clip ${activeIndex + 1} of ${queue.length}` : "No clip selected")}</span>
          <strong>${escapeHtml(item ? itemTitle(item) : "Build the outline first")}</strong>
          <small>${escapeHtml(drawings.length ? `${drawings.length} drawing layers ready` : "No drawings yet")}</small>
        </div>
        <div class="video-analysis-presenter-notes">
          <div>
            <p class="video-analysis-kicker">Coach notes</p>
            <p>${escapeHtml(item?.coachNote || item?.sectionNote || presentation.notes || "No notes added.")}</p>
          </div>
          <div>
            <p class="video-analysis-kicker">Freeze / drawing points</p>
            <p>${escapeHtml(drawings.map((layer) => `${layer.tool} ${formatVideoTime(layer.timestampMs || 0)}`).join(" | ") || "No freeze points.")}</p>
          </div>
        </div>
      </section>
    </section>
  `;
}
