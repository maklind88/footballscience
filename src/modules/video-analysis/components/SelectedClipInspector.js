import { formatVideoTime } from "../services/videoPlaybackService.js";
import { selectedPresentationItem } from "../services/presentationService.js";
import { escapeHtml } from "./renderHelpers.js";

function clipLabel(item = {}) {
  const clip = item.clip || {};
  return item.customTitle || `${clip.phase || "Selected clip"} / ${clip.outcome || "Neutral"}`;
}

export function renderSelectedClipInspector(state = {}) {
  const presentation = state.presentation?.current || {};
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  if (!item) {
    return `
      <aside class="video-analysis-selected-clip" aria-label="Selected clip">
        <div class="video-analysis-panel-header">
          <div>
            <p class="video-analysis-kicker">Clip prep</p>
            <h3>No clip selected</h3>
          </div>
        </div>
        <p class="video-analysis-muted">Add a tagged clip to prepare notes, drawings and presenter cues.</p>
      </aside>
    `;
  }
  const clip = item.clip || {};
  const startMs = item.startMs ?? clip.startMs ?? clip.start_ms ?? 0;
  const drawings = Array.isArray(item.drawings) ? item.drawings : [];
  return `
    <aside class="video-analysis-selected-clip" aria-label="Selected clip">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">${escapeHtml(item.sectionTitle || "Clip prep")}</p>
          <h3>${escapeHtml(clipLabel(item))}</h3>
        </div>
        <button type="button" data-video-analysis-seek="${escapeHtml(item.clipId)}">${escapeHtml(formatVideoTime(startMs))}</button>
      </div>
      <div class="video-analysis-selected-clip__actions">
        <button type="button" data-video-analysis-presentation-mode="draw">Open telestration</button>
        <button type="button" data-video-analysis-presentation-mode="presenter">Cue in presenter</button>
      </div>
      <label>
        Display title
        <input type="text" data-video-analysis-presentation-item-title="${escapeHtml(item.id)}" value="${escapeHtml(item.customTitle || "")}">
      </label>
      <label>
        Coach note for this moment
        <textarea rows="4" data-video-analysis-presentation-item-note="${escapeHtml(item.id)}">${escapeHtml(item.coachNote || "")}</textarea>
      </label>
      <div class="video-analysis-selected-clip__meta">
        <span>${escapeHtml(clip.phase || "Phase")}</span>
        <span>${escapeHtml(clip.subPhase || clip.sub_phase || "Sub-phase")}</span>
        <span>${escapeHtml(`${drawings.length} drawings`)}</span>
      </div>
    </aside>
  `;
}
