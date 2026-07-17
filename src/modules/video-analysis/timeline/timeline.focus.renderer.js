import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "../components/renderHelpers.js";
import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import {
  getClipEndMs,
  getClipPrimaryLabel,
  getClipSecondaryLabel,
  getClipStartMs,
} from "./timeline.selectors.js";
import { clipMiniGamePrincipleLabels } from "../services/miniGamePrincipleService.js";

function outcomeClass(outcome = "") {
  const value = String(outcome || "neutral").trim().toLowerCase();
  if (value === "positive") return " is-positive";
  if (value === "development") return " is-development";
  return " is-neutral";
}

function safeHexColor(value = "") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function localWindowPercent(ms = 0, windowStartMs = 0, windowDurationMs = 1) {
  const duration = Math.max(1, Number(windowDurationMs || 1));
  return Math.min(100, Math.max(0, ((Number(ms || 0) - windowStartMs) / duration) * 100));
}

function optionMarkup(options = [], selectedValue = "") {
  const selected = String(selectedValue || "");
  return options.map((option) => {
    const value = String(option || "");
    return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
  }).join("");
}

function renderClipEditorForm(clip = {}) {
  const selectedPrinciples = new Set(clipMiniGamePrincipleLabels(clip));
  const tags = Array.isArray(clip.tags) ? clip.tags.join(", ") : "";
  const note = Array.isArray(clip.notes) ? String(clip.notes[0]?.note || "") : "";
  return `
    <form class="video-analysis-timeline-editor" data-video-analysis-timeline-editor>
      <label>
        <span>Sub-phase</span>
        <select data-video-analysis-timeline-edit-field="subPhase">
          ${optionMarkup(videoAnalysisSubPhases, clip.subPhase || clip.sub_phase)}
        </select>
      </label>
      <label>
        <span>Outcome</span>
        <select data-video-analysis-timeline-edit-field="outcome">
          ${optionMarkup(videoAnalysisOutcomes, clip.outcome)}
        </select>
      </label>
      <label>
        <span>MG principles</span>
        <select multiple data-video-analysis-timeline-edit-field="miniGamePrincipleIds">
          ${miniGamePrinciples.map((principle) => `
            <option value="${escapeHtml(principle.id)}"${selectedPrinciples.has(principle.label) ? " selected" : ""}>${escapeHtml(principle.label)}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Tags</span>
        <input type="text" data-video-analysis-timeline-edit-field="tags" value="${escapeHtml(tags)}">
      </label>
      <label class="video-analysis-timeline-editor__note">
        <span>Note</span>
        <textarea rows="2" data-video-analysis-timeline-edit-field="note">${escapeHtml(note)}</textarea>
      </label>
      <div class="video-analysis-timeline-editor__actions">
        <button type="button" data-video-analysis-timeline-edit-cancel>Cancel</button>
        <button type="button" data-video-analysis-timeline-edit-save>Save changes</button>
      </div>
    </form>
  `;
}

function timelineFocusWindow(clip = {}, totalMs = 1, playheadMs = 0) {
  const safeTotalMs = Math.max(1, Number(totalMs || 1));
  const startMs = getClipStartMs(clip);
  const endMs = getClipEndMs(clip);
  const durationMs = Math.max(100, endMs - startMs);
  const windowDurationMs = Math.min(safeTotalMs, Math.max(60000, durationMs * 4));
  const centerMs = startMs + (durationMs / 2);
  const windowStartMs = Math.max(0, Math.min(safeTotalMs - windowDurationMs, Math.round(centerMs - (windowDurationMs / 2))));
  const windowEndMs = Math.min(safeTotalMs, windowStartMs + windowDurationMs);
  const playheadInside = playheadMs >= windowStartMs && playheadMs <= windowEndMs;
  return {
    startMs,
    endMs,
    durationMs,
    windowStartMs,
    windowEndMs,
    windowDurationMs: Math.max(1, windowEndMs - windowStartMs),
    clipLeft: localWindowPercent(startMs, windowStartMs, windowEndMs - windowStartMs),
    clipWidth: Math.max(1, localWindowPercent(endMs, windowStartMs, windowEndMs - windowStartMs) - localWindowPercent(startMs, windowStartMs, windowEndMs - windowStartMs)),
    playheadLeft: playheadInside ? localWindowPercent(playheadMs, windowStartMs, windowEndMs - windowStartMs) : null,
  };
}

export function renderSelectedClipFocus(
  clip = null,
  selectedClips = [],
  totalMs = 1,
  laneMode = "phase",
  timeline = {},
  button = null,
  canEdit = false
) {
  if (!clip || !selectedClips.length) return "";
  if (selectedClips.length > 1) {
    const startMs = Math.min(...selectedClips.map(getClipStartMs));
    const endMs = Math.max(...selectedClips.map(getClipEndMs));
    const labels = [...new Set(selectedClips.flatMap((item) => [
      getClipPrimaryLabel(item, laneMode),
      ...clipMiniGamePrincipleLabels(item),
      item.outcome,
    ]).map((value) => String(value || "").trim()).filter(Boolean))];
    return `
      <aside class="video-analysis-timeline-focus is-multi" data-video-analysis-timeline-focus>
        <div class="video-analysis-timeline-focus__summary">
          <span>Selection</span>
          <strong>${escapeHtml(`${selectedClips.length} clips selected`)}</strong>
          <small>${escapeHtml(`${formatVideoTime(startMs)} - ${formatVideoTime(endMs)}`)}</small>
        </div>
        <div class="video-analysis-timeline-focus__metrics" aria-label="Selected clip timing">
          <span><em>Start</em><strong>${escapeHtml(formatVideoTime(startMs))}</strong></span>
          <span><em>End</em><strong>${escapeHtml(formatVideoTime(endMs))}</strong></span>
          <span><em>Span</em><strong>${escapeHtml(formatVideoTime(endMs - startMs))}</strong></span>
        </div>
        <div class="video-analysis-timeline-focus__labels" aria-label="Selected clip labels">
          ${labels.slice(0, 8).map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
        </div>
        ${canEdit ? `
          <div class="video-analysis-timeline-focus__actions">
            <button type="button" data-video-analysis-timeline-merge>Merge clips</button>
            <button type="button" data-video-analysis-timeline-delete-selection>Delete</button>
          </div>
        ` : ""}
      </aside>
    `;
  }
  const focus = timelineFocusWindow(clip, totalMs, Number(timeline.playheadMs || 0));
  const primaryLabel = getClipPrimaryLabel(clip, laneMode);
  const secondaryLabel = getClipSecondaryLabel(clip);
  const buttonColor = safeHexColor(button?.color);
  const labels = [
    primaryLabel,
    ...clipMiniGamePrincipleLabels(clip),
    clip.outcome || "",
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return `
    <aside class="video-analysis-timeline-focus" data-video-analysis-timeline-focus>
      <div class="video-analysis-timeline-focus__summary">
        <span>Focus</span>
        <strong>${escapeHtml(primaryLabel || "Selected clip")}</strong>
        <small>${escapeHtml(secondaryLabel || "Timeline clip")}</small>
      </div>
      <div class="video-analysis-timeline-focus__metrics" aria-label="Selected clip timing">
        <span><em>Start</em><strong>${escapeHtml(formatVideoTime(focus.startMs))}</strong></span>
        <span><em>End</em><strong>${escapeHtml(formatVideoTime(focus.endMs))}</strong></span>
        <span><em>Duration</em><strong>${escapeHtml(formatVideoTime(focus.durationMs))}</strong></span>
      </div>
      <div
        class="video-analysis-timeline-focus__window"
        data-video-analysis-timeline-focus-window
        style="${buttonColor ? `--video-analysis-clip-color:${escapeHtml(buttonColor)};` : ""}"
        aria-label="${escapeHtml(`Selected clip from ${formatVideoTime(focus.startMs)} to ${formatVideoTime(focus.endMs)}`)}"
      >
        <span class="video-analysis-timeline-focus__tick is-start" style="left:0%">${escapeHtml(formatVideoTime(focus.windowStartMs))}</span>
        <span class="video-analysis-timeline-focus__tick is-end" style="left:100%">${escapeHtml(formatVideoTime(focus.windowEndMs))}</span>
        <button
          type="button"
          class="video-analysis-timeline-focus__clip${outcomeClass(clip.outcome)}"
          data-video-analysis-seek="${escapeHtml(clip.id)}"
          style="left:${escapeHtml(String(focus.clipLeft))}%;width:${escapeHtml(String(focus.clipWidth))}%;"
        >
          <span>${escapeHtml(formatVideoTime(focus.durationMs))}</span>
        </button>
        ${focus.playheadLeft === null ? "" : `<i class="video-analysis-timeline-focus__playhead" style="left:${escapeHtml(String(focus.playheadLeft))}%"></i>`}
      </div>
      ${labels.length ? `
        <div class="video-analysis-timeline-focus__labels" aria-label="Selected clip labels">
          ${labels.slice(0, 6).map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
        </div>
      ` : ""}
      ${canEdit ? `
        <div class="video-analysis-timeline-focus__actions">
          <button type="button" data-video-analysis-timeline-edit>${timeline.editorOpen ? "Close editor" : "Edit tags"}</button>
          <button type="button" data-video-analysis-timeline-nudge="start:-1000">Start -1s</button>
          <button type="button" data-video-analysis-timeline-nudge="start:1000">Start +1s</button>
          <button type="button" data-video-analysis-timeline-nudge="end:-1000">End -1s</button>
          <button type="button" data-video-analysis-timeline-nudge="end:1000">End +1s</button>
          <button type="button" data-video-analysis-timeline-delete-selection>Delete</button>
        </div>
        ${timeline.editorOpen ? renderClipEditorForm(clip) : ""}
      ` : ""}
    </aside>
  `;
}
