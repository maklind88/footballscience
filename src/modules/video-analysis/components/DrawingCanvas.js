import {
  presentationDrawingTools,
  selectedPresentationItem,
} from "../services/presentationService.js";
import { layerStyle } from "../services/presentationLayerGeometryService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";
import {
  renderTrackingSidebar,
  renderTrackingStage,
  renderTrackingToolbar,
} from "./TrackingTelestration.js";

const toolBadges = Object.freeze({
  arrow: "AR",
  circle: "CI",
  spotlight: "SP",
  text: "TX",
  freeze: "FR",
  zoom: "ZO",
});

function renderTool(tool = {}, activeTool = "arrow") {
  const active = tool.id === activeTool;
  return `
    <button type="button"
      class="${active ? "is-active" : ""}"
      aria-pressed="${active ? "true" : "false"}"
      data-video-analysis-draw-tool="${escapeHtml(tool.id)}">
      <span>${escapeHtml(toolBadges[tool.id] || "DR")}</span>
      ${escapeHtml(tool.label)}
    </button>
  `;
}

function renderLayer(layer = {}) {
  return `
    <li>
      <button type="button" data-video-analysis-drawing-select="${escapeHtml(layer.id)}">
        <strong>${escapeHtml(layer.tool || "arrow")}</strong>
        <span>${escapeHtml(formatVideoTime(layer.timestampMs || 0))}</span>
      </button>
      <button type="button" data-video-analysis-drawing-remove="${escapeHtml(layer.id)}">Remove</button>
    </li>
  `;
}

function renderOverlayLayer(layer = {}, selectedLayerId = "") {
  const tool = layer.tool || "arrow";
  const text = layer.text || tool;
  const geometry = layer.geometry || layer.geometryJson || layer.geometry_json || {};
  const selected = layer.id === selectedLayerId;
  return `
    <span class="video-analysis-drawing-overlay is-${escapeHtml(tool)}${selected ? " is-selected" : ""}"
      style="${escapeHtml(layerStyle(tool, geometry))}"
      data-video-analysis-drawing-layer="${escapeHtml(layer.id)}">
      ${selected && tool === "text"
        ? `<input class="video-analysis-drawing-overlay-input" type="text" data-video-analysis-drawing-field="text" value="${escapeHtml(text)}" aria-label="Edit drawing text">`
        : escapeHtml(text)}
      ${selected ? `
        <i data-video-analysis-drawing-resize="${escapeHtml(layer.id)}:start"></i>
        <i data-video-analysis-drawing-resize="${escapeHtml(layer.id)}:end"></i>
        <i data-video-analysis-drawing-resize="${escapeHtml(layer.id)}:nw"></i>
        <i data-video-analysis-drawing-resize="${escapeHtml(layer.id)}:se"></i>
      ` : ""}
    </span>
  `;
}

function renderPreviewLayer(layer = null) {
  if (!layer) return "";
  const tool = layer.tool || "arrow";
  return `<span class="video-analysis-drawing-overlay is-${escapeHtml(tool)} is-draft" style="${escapeHtml(layerStyle(tool, layer.geometry || {}))}">${escapeHtml(layer.text || tool)}</span>`;
}

function renderLayerMarker(layer = {}, index = 0, selectedLayerId = "") {
  const selected = layer.id === selectedLayerId;
  return `
    <button type="button" class="${selected ? "is-active" : ""}" data-video-analysis-drawing-select="${escapeHtml(layer.id)}">
      <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      <strong>${escapeHtml(layer.tool || "draw")}</strong>
      <small>${escapeHtml(formatVideoTime(layer.timestampMs || 0))}</small>
    </button>
  `;
}

export function renderDrawingCanvas(state = {}) {
  const presentation = state.presentation?.current || {};
  const activeTool = state.presentation?.drawingTool || "arrow";
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  const layers = Array.isArray(item?.drawings) ? item.drawings : [];
  const draft = state.presentation?.drawingDraft || {};
  const selectedLayerId = state.presentation?.selectedDrawingLayerId || "";
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || null;
  const previewLayer = state.presentation?.drawingInteraction?.previewLayer || null;
  const hasVideo = Boolean(state.videoRef?.objectUrl);
  const trackingMode = state.presentation?.tracking?.mode || "static";
  return `
    <section class="video-analysis-drawing-builder" aria-label="Drawing layers">
      <div class="video-analysis-drawing-builder__stage">
        <div class="video-analysis-panel-header">
          <div>
            <p class="video-analysis-kicker">Telestration</p>
            <h3>${escapeHtml(item ? (item.customTitle || item.sectionTitle || "Selected clip") : "No clip selected")}</h3>
          </div>
          <div class="video-analysis-drawing-actions">
            <span>${escapeHtml(selectedLayer ? `Selected ${selectedLayer.tool || "layer"}` : `${layers.length} layers`)}</span>
            <button type="button" data-video-analysis-drawing-undo ${state.presentation?.drawingUndoStack?.length ? "" : "disabled"}>Undo</button>
            <button type="button" data-video-analysis-drawing-redo ${state.presentation?.drawingRedoStack?.length ? "" : "disabled"}>Redo</button>
            <button type="button" data-video-analysis-presentation-mode="builder">Done</button>
          </div>
        </div>
        <div class="video-analysis-telestration-mode" role="group" aria-label="Telestration mode">
          <button type="button" class="${trackingMode === "static" ? "is-active" : ""}" data-video-analysis-tracking-mode="static">Draw</button>
          <button type="button" class="${trackingMode === "tracking" ? "is-active" : ""}" data-video-analysis-tracking-mode="tracking">Auto follow</button>
        </div>
        <div class="video-analysis-draw-tool-grid video-analysis-draw-tool-grid--stage${trackingMode === "static" ? "" : " is-hidden"}">
          ${trackingMode === "static" ? presentationDrawingTools.map((tool) => renderTool(tool, activeTool)).join("") : ""}
        </div>
        ${renderTrackingToolbar(state)}
        <div class="video-analysis-drawing-canvas is-${escapeHtml(activeTool)}" data-video-analysis-drawing-surface>
          ${hasVideo ? `<video class="video-analysis-drawing-video" data-video-analysis-video src="${escapeHtml(state.videoRef.objectUrl)}" controls playsinline preload="metadata"></video>` : ""}
          <span class="video-analysis-drawing-field-lines"></span>
          ${layers.map((layer) => renderOverlayLayer(layer, selectedLayerId)).join("")}
          ${renderPreviewLayer(previewLayer)}
          ${renderTrackingStage(state, item)}
          <strong>${escapeHtml(activeTool)}</strong>
          <small>${escapeHtml(item ? (hasVideo ? "Direct telestration layer" : "Local video source needed") : "No clip selected")}</small>
          ${!hasVideo ? `<button type="button" class="video-analysis-drawing-link-video" data-video-analysis-load>Link local video</button>` : ""}
        </div>
        <div class="video-analysis-drawing-layer-timeline" aria-label="Drawing timeline">
          ${layers.length ? layers.map((layer, index) => renderLayerMarker(layer, index, selectedLayerId)).join("") : `<p class="video-analysis-muted">No drawing points yet.</p>`}
        </div>
      </div>
      <aside class="video-analysis-drawing-side" aria-label="Drawing tools and layers">
        ${trackingMode === "tracking" ? renderTrackingSidebar(state, item) : `
        <div>
          <p class="video-analysis-kicker">Layer controls</p>
          <h3>${escapeHtml(layers.length ? `${layers.length} saved layers` : "Prepare first drawing")}</h3>
        </div>
        <details class="video-analysis-drawing-settings">
          <summary>Layer metadata</summary>
          <div class="video-analysis-drawing-form">
            <input type="number" min="0" step="0.1" placeholder="Timestamp seconds" data-video-analysis-drawing-field="timestampSeconds" value="${escapeHtml(draft.timestampSeconds || "")}">
            <input type="number" min="0" step="0.1" placeholder="Duration seconds" data-video-analysis-drawing-field="durationSeconds" value="${escapeHtml(draft.durationSeconds || "")}">
            <input type="text" placeholder="${escapeHtml(selectedLayer ? "Edit selected layer text" : "Text label")}" data-video-analysis-drawing-field="text" value="${escapeHtml(selectedLayer ? selectedLayer.text || "" : draft.text || "")}">
            <button type="button" data-video-analysis-drawing-add ${item ? "" : "disabled"}>Add layer</button>
            <button type="button" data-video-analysis-drawing-save ${item?.drawings?.length ? "" : "disabled"}>Save layers</button>
          </div>
        </details>
        <ol class="video-analysis-drawing-layer-list">
          ${layers.length ? layers.map(renderLayer).join("") : `<li class="video-analysis-muted">No saved layers on this clip.</li>`}
        </ol>
        `}
      </aside>
    </section>
  `;
}
