import {
  presentationQueue,
  selectedPresentationItem,
} from "../services/presentationService.js";
import { thumbnailCacheKey } from "../services/localThumbnailCacheService.js";
import { layerStyle } from "../services/presentationLayerGeometryService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function safeNumber(value, fallback = 0) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function itemTitle(item = {}) {
  const clip = item.clip || {};
  return item.customTitle || `${clip.phase || "Clip"} / ${clip.outcome || "Neutral"}`;
}

function clipStartMs(item = {}) {
  const clip = item.clip || {};
  return safeNumber(item.startMs ?? clip.startMs ?? clip.start_ms, 0);
}

function clipEndMs(item = {}) {
  const clip = item.clip || {};
  const startMs = clipStartMs(item);
  return safeNumber(item.endMs ?? clip.endMs ?? clip.end_ms, startMs + 1);
}

function clipDurationMs(item = {}) {
  return Math.max(0, clipEndMs(item) - clipStartMs(item));
}

function queueDurationMs(queue = []) {
  return queue.reduce((sum, item) => sum + clipDurationMs(item), 0);
}

function matchLabel(item = {}) {
  const clip = item.clip || {};
  return clip.matchTitle || clip.matchName || clip.matchId || item.sectionTitle || "Presentation clip";
}

function clipTags(item = {}) {
  const clip = item.clip || {};
  return [
    clip.phase,
    clip.subPhase,
    clip.outcome,
    ...(Array.isArray(clip.tags) ? clip.tags.slice(0, 2) : []),
  ].filter(Boolean).slice(0, 4);
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
  const thumbnailUrl = state.presentation?.thumbnails?.[thumbnailCacheKey(state.videoRef || {}, item.clip || {})] || "";
  const tags = clipTags(item);
  return `
    <button type="button" class="video-analysis-presenter-queue-item${active ? " is-active" : ""}" data-video-analysis-presentation-select-item="${escapeHtml(item.id)}">
      <span class="video-analysis-presenter-queue-number">${escapeHtml(String(index + 1))}</span>
      <span class="video-analysis-presenter-queue-card">
        <span class="video-analysis-presenter-queue-item__thumb">${thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="">` : `<span aria-hidden="true"></span>`}</span>
        <span class="video-analysis-presenter-queue-copy">
          <strong>${escapeHtml(itemTitle(item))}</strong>
          <small>${escapeHtml(`${formatVideoTime(clipDurationMs(item))} / ${formatVideoTime(clipStartMs(item))}`)}</small>
          <em>${escapeHtml(matchLabel(item))}</em>
          <span class="video-analysis-presenter-queue-tags">
            ${tags.length ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") : `<span>${escapeHtml(item.sectionTitle || "Clip")}</span>`}
          </span>
        </span>
      </span>
    </button>
  `;
}

function renderTransportBar(queue = [], activeIndex = 0, item = null) {
  const elapsedMs = queue.slice(0, Math.max(0, activeIndex)).reduce((sum, entry) => sum + clipDurationMs(entry), 0);
  const activeDuration = item ? clipDurationMs(item) : 0;
  const totalMs = queueDurationMs(queue);
  const progress = totalMs ? Math.min(100, ((elapsedMs + Math.min(activeDuration * 0.08, activeDuration)) / totalMs) * 100) : 0;
  return `
    <footer class="video-analysis-presenter-transport" aria-label="Presenter playback controls">
      <div class="video-analysis-presenter-time">
        <strong>${escapeHtml("00:00")}</strong>
        <span>/ ${escapeHtml(formatVideoTime(activeDuration || totalMs))}</span>
      </div>
      <div class="video-analysis-presenter-transport-controls">
        <span>1x</span>
        <button type="button" data-video-analysis-presenter-nudge="-5000" aria-label="Back five seconds">5</button>
        <button type="button" data-video-analysis-presenter-prev ${activeIndex > 0 ? "" : "disabled"} aria-label="Previous clip">Prev</button>
        <button type="button" class="is-play" data-video-analysis-play aria-label="Play or pause"></button>
        <button type="button" data-video-analysis-presenter-next ${activeIndex < queue.length - 1 ? "" : "disabled"} aria-label="Next clip">Next</button>
        <button type="button" data-video-analysis-presenter-nudge="5000" aria-label="Forward five seconds">5</button>
      </div>
      <div class="video-analysis-presenter-scrub">
        <span style="width:${escapeHtml(String(progress))}%"></span>
      </div>
    </footer>
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
  const totalDuration = queueDurationMs(queue);
  return `
    <section class="video-analysis-presenter-mode${frozen ? " is-frozen" : ""}" aria-label="Presenter mode">
      <aside class="video-analysis-presenter-queue" aria-label="Clip queue">
        <div class="video-analysis-presenter-queue__title">
          <button type="button" data-video-analysis-presentation-mode="overview" aria-label="Back to presentation library"></button>
          <div>
            <p class="video-analysis-kicker">Presentation</p>
            <h3>${escapeHtml(presentation.title || "Football Science Review")}</h3>
          </div>
        </div>
        <div class="video-analysis-presenter-queue-list">
          ${queue.length
            ? queue.map((entry, index) => renderQueueItem(entry, entry.id === item?.id, state, index)).join("")
            : `<p class="video-analysis-muted">No clips in this presentation.</p>`}
        </div>
      </aside>
      <section class="video-analysis-presenter-stage" aria-label="Clean presentation stage">
        <div class="video-analysis-presenter-stage__top">
          <button type="button" data-video-analysis-presentation-mode="overview" aria-label="Back to presentation library" class="video-analysis-presenter-home"></button>
          <button type="button" data-video-analysis-presentation-mode="builder" class="video-analysis-presenter-builder-toggle" aria-label="Open builder"></button>
          <div>
            <p class="video-analysis-kicker">${escapeHtml(item?.sectionTitle || "Presenter")}</p>
            <h3>${escapeHtml(item ? itemTitle(item) : presentation.title || "Presentation")}</h3>
          </div>
          <div class="video-analysis-presenter-top-actions">
            <button type="button" data-video-analysis-presenter-freeze>${frozen ? "Unfreeze" : "Freeze"}</button>
            <button type="button" class="video-analysis-presenter-present-button" data-video-analysis-presenter-fullscreen>Present (${escapeHtml(formatVideoTime(totalDuration))})</button>
          </div>
        </div>
        <div class="video-analysis-presenter-workspace">
          <div class="video-analysis-presenter-frame">
            ${hasVideo ? `<video class="video-analysis-presenter-video" data-video-analysis-video src="${escapeHtml(state.videoRef.objectUrl)}" playsinline preload="metadata"></video>` : ""}
            <div class="video-analysis-presenter-layer-stack" aria-hidden="true">
              ${drawings.map(renderPresenterLayer).join("")}
            </div>
            <div class="video-analysis-presenter-frame__copy">
              <span>${escapeHtml(item ? `Clip ${activeIndex + 1} of ${queue.length}` : "No clip selected")}</span>
              <strong>${escapeHtml(item ? itemTitle(item) : "Build the outline first")}</strong>
              <small>${escapeHtml(hasVideo ? matchLabel(item || {}) : "Link local video on this device to present clips.")}</small>
              ${hasVideo ? "" : `<button type="button" data-video-analysis-load>Link local video</button>`}
            </div>
          </div>
          <aside class="video-analysis-presenter-side-tools" aria-label="Presenter tools">
            <button type="button" data-video-analysis-presentation-mode="draw" aria-label="Draw on clip"></button>
            <button type="button" data-video-analysis-presentation-mode="builder" aria-label="Coach notes"></button>
          </aside>
        </div>
        ${renderTransportBar(queue, activeIndex, item)}
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
