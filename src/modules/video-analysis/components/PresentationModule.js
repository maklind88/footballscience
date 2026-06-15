import {
  normalizePresentationMode,
  presentationModes,
} from "../services/presentationService.js";
import { renderDrawingCanvas } from "./DrawingCanvas.js";
import { renderPresentationOutline } from "./PresentationOutline.js";
import { renderPresentationSources } from "./PresentationSources.js";
import { renderPresenterMode } from "./PresenterMode.js";
import { renderSelectedClipInspector } from "./SelectedClipInspector.js";
import { escapeHtml } from "./renderHelpers.js";

function renderPresentationOption(presentation = {}, activeId = "") {
  return `<option value="${escapeHtml(presentation.id || "")}" ${presentation.id === activeId ? "selected" : ""}>${escapeHtml(presentation.title || "Untitled presentation")}</option>`;
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
    <div class="video-analysis-presentation-builder">
      ${renderPresentationSources(state)}
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
  return `
    <section class="video-analysis-presentation" data-video-analysis-presentation-module>
      <div class="video-analysis-presentation-topbar">
        <div class="video-analysis-presentation-title-fields">
          <p class="video-analysis-kicker">Presentation Builder</p>
          <input type="text" aria-label="Presentation title" data-video-analysis-presentation-title value="${escapeHtml(current.title || "Football Science Review")}">
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
      <textarea class="video-analysis-presentation-notes" rows="2" placeholder="Presentation notes for the coaching staff" data-video-analysis-presentation-notes>${escapeHtml(current.notes || "")}</textarea>
      ${renderModeBar(activeMode)}
      ${presentationState.error ? `<div class="video-analysis-error" role="alert">${escapeHtml(presentationState.error)}</div>` : ""}
      ${renderPresentationBody(state, activeMode)}
    </section>
  `;
}
