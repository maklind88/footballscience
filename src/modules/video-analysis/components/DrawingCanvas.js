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
  const geometry = layer.geometry || layer.geometryJson || layer.geometry_json || {};
  const style = layerStyle(tool, geometry);
  return `<span class="video-analysis-drawing-overlay is-${escapeHtml(tool)}" style="${escapeHtml(style)}">${escapeHtml(text)}</span>`;
}

function renderLayerMarker(layer = {}, index = 0) {
  return `
    <button type="button" data-video-analysis-drawing-select="${escapeHtml(layer.id)}">
      <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      <strong>${escapeHtml(layer.tool || "draw")}</strong>
      <small>${escapeHtml(formatVideoTime(layer.timestampMs || 0))}</small>
    </button>
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

export function renderDrawingCanvas(state = {}) {
  const presentation = state.presentation?.current || {};
  const activeTool = state.presentation?.drawingTool || "arrow";
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  const layers = Array.isArray(item?.drawings) ? item.drawings : [];
  const draft = state.presentation?.drawingDraft || {};
  const hasVideo = Boolean(state.videoRef?.objectUrl);
  return `
    <section class="video-analysis-drawing-builder" aria-label="Drawing layers">
      <div class="video-analysis-drawing-builder__stage">
        <div class="video-analysis-panel-header">
          <div>
            <p class="video-analysis-kicker">Telestration</p>
            <h3>${escapeHtml(item ? (item.customTitle || item.sectionTitle || "Selected clip") : "No clip selected")}</h3>
          </div>
          <div class="video-analysis-drawing-actions">
            <button type="button" data-video-analysis-drawing-undo ${state.presentation?.drawingUndoStack?.length ? "" : "disabled"}>Undo</button>
            <button type="button" data-video-analysis-drawing-redo ${state.presentation?.drawingRedoStack?.length ? "" : "disabled"}>Redo</button>
            <button type="button" data-video-analysis-presentation-mode="builder">Done</button>
          </div>
        </div>
        <div class="video-analysis-draw-tool-grid video-analysis-draw-tool-grid--stage">
          ${presentationDrawingTools.map((tool) => renderTool(tool, activeTool)).join("")}
        </div>
        <div class="video-analysis-drawing-canvas is-${escapeHtml(activeTool)}" data-video-analysis-drawing-surface>
          ${hasVideo ? `<video class="video-analysis-drawing-video" data-video-analysis-video src="${escapeHtml(state.videoRef.objectUrl)}" controls playsinline preload="metadata"></video>` : ""}
          <span class="video-analysis-drawing-field-lines"></span>
          ${layers.map(renderOverlayLayer).join("")}
          <strong>${escapeHtml(activeTool)}</strong>
          <small>${escapeHtml(item ? (hasVideo ? "Click the video to place this drawing tool. Drawings are saved as metadata." : "Link local video to draw on the source clip.") : "Select a clip from the outline first.")}</small>
          ${!hasVideo ? `<button type="button" class="video-analysis-drawing-link-video" data-video-analysis-load>Link local video</button>` : ""}
        </div>
        <div class="video-analysis-drawing-layer-timeline" aria-label="Drawing timeline">
          ${layers.length ? layers.map(renderLayerMarker).join("") : `<p class="video-analysis-muted">No drawing points yet. Choose a tool, set timing if needed, then add layer.</p>`}
        </div>
      </div>
      <aside class="video-analysis-drawing-side" aria-label="Drawing tools and layers">
        <div>
          <p class="video-analysis-kicker">Layer controls</p>
          <h3>${escapeHtml(layers.length ? `${layers.length} saved layers` : "Prepare first drawing")}</h3>
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
