import {
  normalizePresentationMode,
  presentationModes,
  presentationQueue,
  selectedPresentationItem,
} from "../services/presentationService.js";
import { thumbnailCacheKey } from "../services/localThumbnailCacheService.js";
import { layerStyle } from "../services/presentationLayerGeometryService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { renderDrawingCanvas } from "./DrawingCanvas.js";
import { renderPresentationOutline } from "./PresentationOutline.js";
import { renderPresentationOverview } from "./PresentationOverview.js";
import { renderPresentationSources } from "./PresentationSources.js";
import { renderPresenterMode } from "./PresenterMode.js";
import { renderSelectedClipInspector } from "./SelectedClipInspector.js";
import { renderAnalysisReportSummary } from "./AnalysisReportSummary.js";
import { escapeHtml, optionList } from "./renderHelpers.js";

function renderPresentationOption(presentation = {}, activeId = "") {
  return `<option value="${escapeHtml(presentation.id || "")}" ${presentation.id === activeId ? "selected" : ""}>${escapeHtml(presentation.title || "Untitled presentation")}</option>`;
}

function renderPlayerTargetOptions(players = [], selected = "") {
  return optionList(players, selected, (player) => player.id, (player) => `${player.name}${player.position ? ` / ${player.position}` : ""}`);
}

function renderPresentationShareTarget(target = {}) {
  const key = `${target.targetType || "role"}:${target.targetId || ""}`;
  return `
    <span class="video-analysis-share-target-pill">
      ${escapeHtml(`${key} / ${target.accessLevel || "view"}`)}
      <button type="button" aria-label="Remove access target" data-video-analysis-presentation-share-remove="${escapeHtml(target.targetType || "")}:${escapeHtml(target.targetId || "")}">x</button>
    </span>
  `;
}

function renderPresentationShareSettings(state = {}, current = {}) {
  const draft = state.presentation?.presentationShareDraft || {};
  const targetType = draft.targetType || "role";
  const shareTargets = Array.isArray(current.shareTargets) ? current.shareTargets : [];
  return `
    <details class="video-analysis-presentation-access" ${state.presentation?.presentationAccessOpen ? "open" : ""}>
      <summary data-video-analysis-presentation-access-toggle>
        <span>Share</span>
        <strong>${escapeHtml(shareTargets.length ? `${shareTargets.length} targets` : "Coach + analyst")}</strong>
      </summary>
      <div class="video-analysis-presentation-access__grid">
        <label>
          <span>Target</span>
          <select data-video-analysis-presentation-share-draft="targetType">
            ${optionList(["role", "player", "group", "user", "team"], targetType)}
          </select>
        </label>
        <label>
          <span>${escapeHtml(targetType === "player" ? "Player" : "Id")}</span>
          ${targetType === "player"
            ? `<select data-video-analysis-presentation-share-draft="targetId"><option value="">Choose player</option>${renderPlayerTargetOptions(state.players || [], draft.targetId || "")}</select>`
            : `<input type="text" placeholder="${escapeHtml(targetType === "role" ? "coach, analyst..." : "group/user id")}" data-video-analysis-presentation-share-draft="targetId" value="${escapeHtml(draft.targetId || "")}">`}
        </label>
        <label>
          <span>Access</span>
          <select data-video-analysis-presentation-share-draft="accessLevel">
            ${optionList(["view", "present", "edit"], draft.accessLevel || "view")}
          </select>
        </label>
        <button type="button" data-video-analysis-presentation-share-add>Add target</button>
        <button type="button" class="video-analysis-primary-action" data-video-analysis-presentation-share-save>Save access</button>
      </div>
      <div class="video-analysis-smart-share-targets">
        ${shareTargets.length ? shareTargets.map(renderPresentationShareTarget).join("") : `<span class="video-analysis-muted">Default access: coaches and analysts.</span>`}
      </div>
    </details>
  `;
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

function renderStageQueueItem(item = {}, active = false, state = {}, index = 0) {
  const clip = item.clip || {};
  const thumbnailUrl = state.presentation?.thumbnails?.[thumbnailCacheKey(state.videoRef || {}, clip)] || "";
  const startMs = item.startMs ?? clip.startMs ?? clip.start_ms ?? 0;
  return `
    <button type="button" class="video-analysis-presentation-stage-queue-item${active ? " is-active" : ""}" data-video-analysis-presentation-select-item="${escapeHtml(item.id)}">
      <span class="video-analysis-presentation-stage-queue-item__thumb">${thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="">` : escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      <span>
        <strong>${escapeHtml(itemTitle(item))}</strong>
        <small>${escapeHtml(`${formatVideoTime(startMs)} / ${item.sectionTitle || "Section"}`)}</small>
      </span>
    </button>
  `;
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
  const hasVideo = Boolean(state.videoRef?.objectUrl);
  return `
    <section class="video-analysis-presentation-stage-v2" aria-label="Presentation stage">
      <div class="video-analysis-presentation-stage-v2__header">
        <div>
          <p class="video-analysis-kicker">${escapeHtml(item?.sectionTitle || "Coach stage")}</p>
          <h3>${escapeHtml(item ? itemTitle(item) : presentation.title || "Build a presentation")}</h3>
        </div>
        <div class="video-analysis-presentation-stage-kpis" aria-label="Presentation status">
          <span>${escapeHtml(`${queue.length} clips`)}</span>
          <span>${escapeHtml(`${layers.length} layers`)}</span>
          <span>${escapeHtml(state.videoRef?.objectUrl ? "Video linked" : "Metadata only")}</span>
        </div>
        <div class="video-analysis-presentation-stage-v2__actions">
          <button type="button" data-video-analysis-seek="${escapeHtml(item?.clipId || "")}" ${item ? "" : "disabled"}>Cue</button>
          <button type="button" data-video-analysis-presentation-mode="draw" ${item ? "" : "disabled"}>Draw</button>
          <button type="button" class="video-analysis-primary-action" data-video-analysis-presentation-mode="presenter" ${queue.length ? "" : "disabled"}>Present</button>
        </div>
      </div>
      <div class="video-analysis-presentation-stage-frame-v2">
        ${renderStageMedia(state, item, layers)}
        ${hasVideo ? `
          <div class="video-analysis-presentation-stage-copy">
            <span>${escapeHtml(item ? `Clip ${activeIndex + 1} of ${queue.length}` : "No clip selected")}</span>
            <strong>${escapeHtml(item ? itemTitle(item) : "Drag clips into the outline to build the meeting")}</strong>
            <small>${escapeHtml(stageStatus(state, item))}</small>
          </div>
        ` : ""}
      </div>
      <div class="video-analysis-presentation-stage-timeline" aria-label="Drawing and freeze points">
        <div>
          ${layers.length ? layers.map(renderDrawingMarker).join("") : `<span><strong>00</strong>No drawing points yet</span>`}
        </div>
      </div>
      <div class="video-analysis-presentation-stage-queue" aria-label="Presentation clip queue">
        ${queue.length
          ? queue.map((entry, index) => renderStageQueueItem(entry, entry.id === item?.id, state, index)).join("")
          : `<p class="video-analysis-muted">Add clips to start the meeting queue.</p>`}
      </div>
      <details class="video-analysis-presentation-brief-panel">
        <summary>Coach brief</summary>
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
  if (activeMode === "overview") return renderPresentationOverview(state);
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
  if (activeMode === "presenter") {
    return `
      <section class="video-analysis-presentation is-presenter" data-video-analysis-presentation-module>
        ${presentationState.error ? `<div class="video-analysis-error" role="alert">${escapeHtml(presentationState.error)}</div>` : ""}
        ${renderPresenterMode(state)}
      </section>
    `;
  }
  if (activeMode === "overview") {
    return `
      <section class="video-analysis-presentation is-library" data-video-analysis-presentation-module>
        ${presentationState.error ? `<div class="video-analysis-error" role="alert">${escapeHtml(presentationState.error)}</div>` : ""}
        ${renderPresentationOverview(state)}
      </section>
    `;
  }
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
        <div class="video-analysis-presentation-command-stack">
          ${renderModeBar(activeMode)}
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
      </div>
      ${renderPresentationShareSettings(state, current)}
      ${presentationState.error ? `<div class="video-analysis-error" role="alert">${escapeHtml(presentationState.error)}</div>` : ""}
      ${renderAnalysisReportSummary(current)}
      ${renderPresentationBody(state, activeMode)}
    </section>
  `;
}
