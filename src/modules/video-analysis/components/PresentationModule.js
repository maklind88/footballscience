import {
  normalizePresentationMode,
  presentationModes,
  presentationQueue,
  selectedPresentationItem,
} from "../services/presentationService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { renderDrawingCanvas } from "./DrawingCanvas.js";
import { renderPresentationOutline } from "./PresentationOutline.js";
import { renderPresentationSources } from "./PresentationSources.js";
import { renderPresenterMode } from "./PresenterMode.js";
import { renderSelectedClipInspector } from "./SelectedClipInspector.js";
import { escapeHtml } from "./renderHelpers.js";

function renderPresentationOption(presentation = {}, activeId = "") {
  return `<option value="${escapeHtml(presentation.id || "")}" ${presentation.id === activeId ? "selected" : ""}>${escapeHtml(presentation.title || "Untitled presentation")}</option>`;
}

function itemTitle(item = {}) {
  const clip = item.clip || {};
  return item.customTitle || `${clip.phase || "Clip"} / ${clip.outcome || "Neutral"}`;
}

function stageStatus(state = {}, item = null) {
  if (!state.videoRef?.objectUrl) return item ? "Video not linked on this device" : "Ready for clips";
  if (!item) return "Local video linked";
  const clip = item.clip || {};
  const startMs = item.startMs ?? clip.startMs ?? clip.start_ms ?? 0;
  const endMs = item.endMs ?? clip.endMs ?? clip.end_ms ?? null;
  return `${formatVideoTime(startMs)}${endMs ? ` - ${formatVideoTime(endMs)}` : ""}`;
}

function renderStageLayer(layer = {}) {
  const tool = layer.tool || "arrow";
  const geometry = layer.geometry || layer.geometryJson || layer.geometry_json || {};
  const style = layerStyle(tool, geometry);
  return `<span class="video-analysis-presentation-stage-layer is-${escapeHtml(tool)}" style="${escapeHtml(style)}">${escapeHtml(layer.text || tool)}</span>`;
}

function renderDrawingMarker(layer = {}, index = 0) {
  return `
    <span>
      <strong>${escapeHtml(String(index + 1).padStart(2, "0"))}</strong>
      ${escapeHtml(layer.tool || "draw")}
    </span>
  `;
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

function renderStageMedia(state = {}, item = null, layers = []) {
  const ref = state.videoRef || {};
  const hasVideo = Boolean(ref.objectUrl);
  if (!hasVideo) {
    return `
      <div class="video-analysis-presentation-stage-empty">
        <span class="video-analysis-presentation-stage-grid" aria-hidden="true"></span>
        <div>
          <span>${escapeHtml(item ? "Local video needed" : "No video linked")}</span>
          <strong>${escapeHtml(item ? itemTitle(item) : "Link a local match video")}</strong>
          <small>${escapeHtml(item ? "The presentation keeps metadata only. Link the source video on this device to preview clips." : "Use FS Player or this button to connect the local source video.")}</small>
          <button type="button" data-video-analysis-load>Link local video</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="video-analysis-presentation-stage-media">
      <video class="video-analysis-presentation-stage-video" data-video-analysis-video src="${escapeHtml(ref.objectUrl)}" controls playsinline preload="metadata"></video>
      <div class="video-analysis-presentation-stage-overlays" aria-hidden="true">
        ${layers.slice(0, 8).map(renderStageLayer).join("")}
      </div>
    </div>
  `;
}

function renderPresentationStage(state = {}) {
  const presentation = state.presentation?.current || {};
  const queue = presentationQueue(presentation);
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  const activeIndex = Math.max(0, queue.findIndex((entry) => entry.id === item?.id));
  const layers = Array.isArray(item?.drawings) ? item.drawings : [];
  return `
    <section class="video-analysis-presentation-stage-v2" aria-label="Presentation stage">
      <div class="video-analysis-presentation-stage-v2__header">
        <div>
          <p class="video-analysis-kicker">${escapeHtml(item?.sectionTitle || "Coach stage")}</p>
          <h3>${escapeHtml(item ? itemTitle(item) : presentation.title || "Build a presentation")}</h3>
        </div>
        <div class="video-analysis-presentation-stage-v2__actions">
          <button type="button" data-video-analysis-seek="${escapeHtml(item?.clipId || "")}" ${item ? "" : "disabled"}>Cue clip</button>
          <button type="button" data-video-analysis-presentation-mode="draw" ${item ? "" : "disabled"}>Telestrate</button>
          <button type="button" class="video-analysis-primary-action" data-video-analysis-presentation-mode="presenter" ${queue.length ? "" : "disabled"}>Present</button>
        </div>
      </div>
      <div class="video-analysis-presentation-stage-frame-v2">
        ${renderStageMedia(state, item, layers)}
        <div class="video-analysis-presentation-stage-copy">
          <span>${escapeHtml(item ? `Clip ${activeIndex + 1} of ${queue.length}` : "No clip selected")}</span>
          <strong>${escapeHtml(item ? itemTitle(item) : "Drag clips into the outline to build the meeting")}</strong>
          <small>${escapeHtml(stageStatus(state, item))}</small>
        </div>
      </div>
      <div class="video-analysis-presentation-stage-timeline" aria-label="Drawing and freeze points">
        <div>
          ${layers.length ? layers.map(renderDrawingMarker).join("") : `<span><strong>00</strong>No drawing points yet</span>`}
        </div>
      </div>
      <details class="video-analysis-presentation-brief-panel">
        <summary>Meeting notes and setup</summary>
        <label>
          <span>Meeting brief</span>
          <textarea rows="3" placeholder="Private notes for the staff before the room opens" data-video-analysis-presentation-notes>${escapeHtml(presentation.notes || "")}</textarea>
        </label>
      </details>
    </section>
  `;
}

function renderModeBar(activeMode = "builder") {
  return `
    <div class="video-analysis-presentation-modebar" role="tablist" aria-label="Presentation mode">
      ${presentationModes.map((mode) => `
        <button type="button"
          class="${activeMode === mode.id ? "is-active" : ""}"
          role="tab"
          aria-selected="${activeMode === mode.id ? "true" : "false"}"
          data-video-analysis-presentation-mode="${escapeHtml(mode.id)}">
          ${escapeHtml(mode.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderBuilder(state = {}) {
  return `
    <div class="video-analysis-presentation-builder video-analysis-presentation-builder-v2">
      ${renderPresentationSources(state)}
      ${renderPresentationStage(state)}
      ${renderPresentationOutline(state)}
      ${renderSelectedClipInspector(state)}
    </div>
  `;
}

function renderPresentationBody(state = {}, activeMode = "builder") {
  if (activeMode === "presenter") return renderPresenterMode(state);
  if (activeMode === "draw") return renderDrawingCanvas(state);
  return renderBuilder(state);
}

export function renderPresentationModule(state = {}) {
  const presentationState = state.presentation || {};
  const current = presentationState.current || {};
  const activeMode = normalizePresentationMode(presentationState.mode);
  const presentations = Array.isArray(presentationState.presentations) ? presentationState.presentations : [];
  const queue = presentationQueue(current);
  const drawingCount = queue.reduce((sum, item) => sum + (Array.isArray(item.drawings) ? item.drawings.length : 0), 0);
  return `
    <section class="video-analysis-presentation" data-video-analysis-presentation-module>
      <div class="video-analysis-presentation-topbar">
        <div class="video-analysis-presentation-title-fields">
          <p class="video-analysis-kicker">Presentation room</p>
          <input type="text" aria-label="Presentation title" data-video-analysis-presentation-title value="${escapeHtml(current.title || "Football Science Review")}">
          <div class="video-analysis-presentation-meta">
            <span>${escapeHtml(`${current.sections?.length || 0} sections`)}</span>
            <span>${escapeHtml(`${queue.length} clips`)}</span>
            <span>${escapeHtml(`${drawingCount} drawing layers`)}</span>
          </div>
        </div>
        <div class="video-analysis-presentation-actions">
          <select aria-label="Saved presentations" data-video-analysis-presentation-load>
            <option value="">New / unsaved presentation</option>
            ${presentations.map((presentation) => renderPresentationOption(presentation, current.id)).join("")}
          </select>
          <button type="button" data-video-analysis-presentation-new>New</button>
          <button type="button" class="video-analysis-primary-action" data-video-analysis-presentation-save ${state.canEdit ? "" : "disabled"}>Save</button>
          <button type="button" data-video-analysis-presentation-mode="presenter">Present</button>
        </div>
      </div>
      ${renderModeBar(activeMode)}
      ${presentationState.error ? `<div class="video-analysis-error" role="alert">${escapeHtml(presentationState.error)}</div>` : ""}
      ${renderPresentationBody(state, activeMode)}
    </section>
  `;
}
