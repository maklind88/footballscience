import {
  presentationDrawingTools,
  selectedPresentationItem,
} from "../services/presentationService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function renderTool(tool = {}, activeTool = "arrow") {
  const active = tool.id === activeTool;
  return `
    <button type="button"
      class="${active ? "is-active" : ""}"
      aria-pressed="${active ? "true" : "false"}"
      data-video-analysis-draw-tool="${escapeHtml(tool.id)}">
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

function renderOverlayLayer(layer = {}) {
  const tool = layer.tool || "arrow";
  const text = layer.text || tool;
  return `<span class="video-analysis-drawing-overlay is-${escapeHtml(tool)}">${escapeHtml(text)}</span>`;
}

export function renderDrawingCanvas(state = {}) {
  const presentation = state.presentation?.current || {};
  const activeTool = state.presentation?.drawingTool || "arrow";
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  const layers = Array.isArray(item?.drawings) ? item.drawings : [];
  const draft = state.presentation?.drawingDraft || {};
  return `
    <section class="video-analysis-drawing-builder" aria-label="Drawing layers">
      <div class="video-analysis-drawing-builder__stage">
        <div class="video-analysis-panel-header">
          <div>
            <p class="video-analysis-kicker">Drawing engine</p>
            <h3>${escapeHtml(item ? (item.customTitle || item.sectionTitle || "Selected clip") : "No clip selected")}</h3>
          </div>
          <div class="video-analysis-drawing-actions">
            <button type="button" data-video-analysis-drawing-undo ${state.presentation?.drawingUndoStack?.length ? "" : "disabled"}>Undo</button>
            <button type="button" data-video-analysis-drawing-redo ${state.presentation?.drawingRedoStack?.length ? "" : "disabled"}>Redo</button>
          </div>
        </div>
        <div class="video-analysis-drawing-canvas is-${escapeHtml(activeTool)}">
          <span class="video-analysis-drawing-field-lines"></span>
          ${layers.map(renderOverlayLayer).join("")}
          <strong>${escapeHtml(activeTool)}</strong>
        </div>
      </div>
      <aside class="video-analysis-drawing-side" aria-label="Drawing tools and layers">
        <div class="video-analysis-draw-tool-grid">
          ${presentationDrawingTools.map((tool) => renderTool(tool, activeTool)).join("")}
        </div>
        <div class="video-analysis-drawing-form">
          <input type="number" min="0" step="0.1" placeholder="Timestamp seconds" data-video-analysis-drawing-field="timestampSeconds" value="${escapeHtml(draft.timestampSeconds || "")}">
          <input type="number" min="0" step="0.1" placeholder="Duration seconds" data-video-analysis-drawing-field="durationSeconds" value="${escapeHtml(draft.durationSeconds || "")}">
          <input type="text" placeholder="Text label" data-video-analysis-drawing-field="text" value="${escapeHtml(draft.text || "")}">
          <button type="button" data-video-analysis-drawing-add ${item ? "" : "disabled"}>Add layer</button>
          <button type="button" data-video-analysis-drawing-save ${item?.drawings?.length ? "" : "disabled"}>Save layers</button>
        </div>
        <ol class="video-analysis-drawing-layer-list">
          ${layers.length ? layers.map(renderLayer).join("") : `<li class="video-analysis-muted">No saved layers on this clip.</li>`}
        </ol>
      </aside>
    </section>
  `;
}
