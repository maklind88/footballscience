import {
  presentationQueue,
  selectedPresentationItem,
} from "../services/presentationService.js";
import { thumbnailCacheKey } from "../services/localThumbnailCacheService.js";
import { layerStyle } from "../services/presentationLayerGeometryService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function itemTitle(item = {}) {
  const clip = item.clip || {};
  return item.customTitle || `${clip.phase || "Clip"} / ${clip.outcome || "Neutral"}`;
}

function renderPresenterLayer(layer = {}) {
  const tool = layer.tool || "arrow";
  const geometry = layer.geometry || layer.geometryJson || layer.geometry_json || {};
  return `<span class="video-analysis-presenter-layer is-${escapeHtml(tool)}" style="${escapeHtml(layerStyle(tool, geometry))}">${escapeHtml(layer.text || tool)}</span>`;
}

function presenterPointLabel(point = {}) {
  return `${point.tool || point.label || "freeze"} ${formatVideoTime(point.timestampMs || point.timestamp_ms || 0)}`;
}

function renderQueueItem(item = {}, active = false, state = {}, index = 0) {
  const clip = item.clip || {};
  const startMs = item.startMs ?? clip.startMs ?? clip.start_ms ?? 0;
  const thumbnailUrl = state.presentation?.thumbnails?.[thumbnailCacheKey(state.videoRef || {}, clip)] || "";
  return `
    <button type="button" class="video-analysis-presenter-queue-item${active ? " is-active" : ""}" data-video-analysis-presentation-select-item="${escapeHtml(item.id)}">
      <span class="video-analysis-presenter-queue-item__thumb">${thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="">` : escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      <span>
        <strong>${escapeHtml(itemTitle(item))}</strong>
        <small>${escapeHtml(`${formatVideoTime(startMs)} / ${item.sectionTitle || "Section"}`)}</small>
      </span>
    </button>
  `;
}

export function renderPresenterMode(state = {}) {
  const presentation = state.presentation?.current || {};
  const queue = presentationQueue(presentation);
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  const activeIndex = Math.max(0, queue.findIndex((entry) => entry.id === item?.id));
  const drawings = Array.isArray(item?.drawings) ? item.drawings : [];
  const freezePoints = [
    ...(Array.isArray(item?.freezePoints) ? item.freezePoints : []),
    ...drawings.filter((layer) => layer.tool === "freeze"),
  ];
  const hasVideo = Boolean(state.videoRef?.objectUrl);
  const frozen = Boolean(state.presentation?.presenterFrozen);
  return `
    <section class="video-analysis-presenter-mode${frozen ? " is-frozen" : ""}" aria-label="Presenter mode">
      <aside class="video-analysis-presenter-queue" aria-label="Clip queue">
        <div>
          <p class="video-analysis-kicker">Meeting queue</p>
          <h3>${escapeHtml(`${queue.length} clips`)}</h3>
        </div>
        <div class="video-analysis-presenter-queue-list">
          ${queue.length
            ? queue.map((entry, index) => renderQueueItem(entry, entry.id === item?.id, state, index)).join("")
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
            <button type="button" data-video-analysis-presenter-prev ${activeIndex > 0 ? "" : "disabled"}>Previous</button>
            <button type="button" data-video-analysis-presenter-next ${activeIndex < queue.length - 1 ? "" : "disabled"}>Next</button>
            <button type="button" data-video-analysis-presenter-freeze>${frozen ? "Unfreeze" : "Freeze"}</button>
            <button type="button" data-video-analysis-presenter-fullscreen>Fullscreen</button>
            <button type="button" data-video-analysis-presentation-mode="builder">Exit</button>
          </div>
        </div>
        <div class="video-analysis-presenter-frame">
          ${hasVideo ? `<video class="video-analysis-presenter-video" data-video-analysis-video src="${escapeHtml(state.videoRef.objectUrl)}" controls playsinline preload="metadata"></video>` : ""}
          <div class="video-analysis-presenter-layer-stack" aria-hidden="true">
            ${drawings.map(renderPresenterLayer).join("")}
          </div>
          <div class="video-analysis-presenter-frame__copy">
            <span>${escapeHtml(item ? `Clip ${activeIndex + 1} of ${queue.length}` : "No clip selected")}</span>
            <strong>${escapeHtml(item ? itemTitle(item) : "Build the outline first")}</strong>
            <small>${escapeHtml(hasVideo ? (drawings.length ? `${drawings.length} drawing layers ready` : "No drawings yet") : "Link local video on this device to present clips.")}</small>
            ${hasVideo ? "" : `<button type="button" data-video-analysis-load>Link local video</button>`}
          </div>
        </div>
        <div class="video-analysis-presenter-progress" aria-label="Presentation progress">
          <span style="width:${escapeHtml(String(queue.length ? ((activeIndex + 1) / queue.length) * 100 : 0))}%"></span>
        </div>
        <div class="video-analysis-presenter-notes">
          <div>
            <p class="video-analysis-kicker">Coach notes</p>
            <p>${escapeHtml(item?.coachNote || item?.sectionNote || presentation.notes || "No notes added.")}</p>
          </div>
          <div>
            <p class="video-analysis-kicker">Freeze / drawing points</p>
            <p>${escapeHtml((freezePoints.length ? freezePoints : drawings).map(presenterPointLabel).join(" | ") || "No freeze points.")}</p>
          </div>
        </div>
      </section>
    </section>
  `;
}
