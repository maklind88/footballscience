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

function layerStyle(tool = "arrow", geometry = {}) {
  const x = Number(geometry.x ?? geometry.cx ?? geometry.x1 ?? 50);
  const y = Number(geometry.y ?? geometry.cy ?? geometry.y1 ?? 50);
  if (tool === "arrow") {
    const x2 = Number(geometry.x2 ?? x + 28);
    const y2 = Number(geometry.y2 ?? y - 10);
    const length = Math.max(12, Math.hypot(x2 - x, y2 - y));
    const angle = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
    return `left:${Math.max(0, Math.min(100, x))}%;top:${Math.max(0, Math.min(100, y))}%;width:${Math.min(70, length)}%;transform:rotate(${angle}deg);`;
  }
  if (tool === "freeze") return "";
  const width = Number(geometry.rx || geometry.width || (tool === "zoom" ? 12 : 16));
  const height = Number(geometry.ry || geometry.height || (tool === "zoom" ? 12 : 10));
  return `left:${Math.max(0, Math.min(94, x - width / 2))}%;top:${Math.max(0, Math.min(92, y - height / 2))}%;`;
}

function renderPresenterLayer(layer = {}) {
  const tool = layer.tool || "arrow";
  const geometry = layer.geometry || layer.geometryJson || layer.geometry_json || {};
  return `<span class="video-analysis-presenter-layer is-${escapeHtml(tool)}" style="${escapeHtml(layerStyle(tool, geometry))}">${escapeHtml(layer.text || tool)}</span>`;
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
  const hasVideo = Boolean(state.videoRef?.objectUrl);
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
