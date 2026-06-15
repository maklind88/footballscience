import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function itemTitle(item = {}) {
  const clip = item.clip || {};
  return item.customTitle || `${clip.phase || "Clip"} / ${clip.outcome || "Neutral"}`;
}

function renderOutlineItem(sectionId = "", item = {}, active = false) {
  const clip = item.clip || {};
  const startMs = item.startMs ?? clip.startMs ?? clip.start_ms ?? 0;
  return `
    <li class="video-analysis-presentation-outline-item${active ? " is-active" : ""}" draggable="true" data-video-analysis-presentation-drag-item="${escapeHtml(item.id)}" data-video-analysis-presentation-drop-item="${escapeHtml(sectionId)}:${escapeHtml(item.id)}">
      <button type="button" class="video-analysis-presentation-outline-item__main" data-video-analysis-presentation-select-item="${escapeHtml(item.id)}">
        <span>${escapeHtml(formatVideoTime(startMs))}</span>
        <strong>${escapeHtml(itemTitle(item))}</strong>
      </button>
      <div class="video-analysis-presentation-outline-item__tools">
        <button type="button" aria-label="Move clip up" data-video-analysis-presentation-move-item="${escapeHtml(item.id)}:-1">Up</button>
        <button type="button" aria-label="Move clip down" data-video-analysis-presentation-move-item="${escapeHtml(item.id)}:1">Down</button>
        <button type="button" aria-label="Remove clip" data-video-analysis-presentation-remove-item="${escapeHtml(item.id)}">Remove</button>
      </div>
    </li>
  `;
}

function renderOutlineSection(section = {}, state = {}) {
  const activeSection = (state.presentation?.activeSectionId || "") === section.id;
  const selectedItemId = state.presentation?.selectedItemId || "";
  const items = Array.isArray(section.items) ? section.items : [];
  return `
    <section class="video-analysis-presentation-outline-section${activeSection ? " is-active" : ""}" data-video-analysis-presentation-drop-section="${escapeHtml(section.id)}">
      <button type="button" class="video-analysis-presentation-outline-section__select" data-video-analysis-presentation-section="${escapeHtml(section.id)}">
        <span>${escapeHtml(section.title || "Section")}</span>
        <strong>${items.length}</strong>
      </button>
      <input type="text" aria-label="Section title" data-video-analysis-presentation-section-title="${escapeHtml(section.id)}" value="${escapeHtml(section.title || "")}">
      <textarea rows="2" aria-label="Section coach note" placeholder="Section note" data-video-analysis-presentation-section-note="${escapeHtml(section.id)}">${escapeHtml(section.coachNote || "")}</textarea>
      <ol>
        ${items.length
          ? items.map((item) => renderOutlineItem(section.id, item, item.id === selectedItemId)).join("")
          : `<li class="video-analysis-muted" data-video-analysis-presentation-drop-empty="${escapeHtml(section.id)}">Drop or add clips here.</li>`}
      </ol>
    </section>
  `;
}

export function renderPresentationOutline(state = {}) {
  const presentation = state.presentation?.current || {};
  const sections = Array.isArray(presentation.sections) ? presentation.sections : [];
  return `
    <section class="video-analysis-presentation-outline" aria-label="Presentation outline">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Outline</p>
          <h3>${escapeHtml(presentation.title || "Football Science Review")}</h3>
        </div>
        <button type="button" data-video-analysis-presentation-add-section>Add section</button>
      </div>
      <div class="video-analysis-presentation-outline-list">
        ${sections.map((section) => renderOutlineSection(section, state)).join("")}
      </div>
    </section>
  `;
}
