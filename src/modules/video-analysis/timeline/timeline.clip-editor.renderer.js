import { escapeHtml, optionList } from "../components/renderHelpers.js";
import { playerHeaderIcon } from "../components/playerHeaderIcons.js";
import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { phaseForSubPhase } from "../services/footballLanguageService.js";
import { clipMiniGamePrincipleLabels } from "../services/miniGamePrincipleService.js";
import { getClipPrimaryLabel, getClipStartMs, getClipEndMs } from "./timeline.selectors.js";
import { renderClipReview } from "./timeline.clip-review.js";

export function formatClipEditorTime(ms = 0) {
  const value = Math.max(0, Math.round(ms));
  const seconds = Math.floor(value / 1000);
  const fraction = value % 1000;
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}${fraction ? `.${String(fraction).padStart(3, "0")}` : ""}`;
}

export function parseClipEditorTime(value = "") {
  const match = String(value).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return NaN;
  return ((Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000)
    + Number((match[4] || "").padEnd(3, "0"));
}

function timeField(label, name, value) {
  return `<label><span>${label}</span><input type="text" required autocomplete="off" aria-label="${label}" data-video-analysis-timeline-edit-field="${name}" value="${escapeHtml(formatClipEditorTime(value))}"></label>`;
}

export function clipEditorSubPhaseOptions(phase, current = "") {
  const choices = [...new Set([current, ...videoAnalysisSubPhases, "Offensive Transition", "Defensive Transition"])]
    .filter(value => value && phaseForSubPhase(value, phase) === phase);
  return `<option value="">Choose sub-phase</option>${optionList(choices, current)}`;
}

export function renderClipEditor(clip = {}, { laneMode = "all", canEdit = false, title = "", review = null } = {}) {
  const start = getClipStartMs(clip);
  const end = getClipEndMs(clip);
  const principles = new Set(clipMiniGamePrincipleLabels(clip));
  const subPhase = clip.subPhase || clip.sub_phase || "";
  const phase = phaseForSubPhase(subPhase, clip.phase);
  const phases = [...new Set([phase, ...videoAnalysisPhases])].filter(Boolean);
  return `
    <header>
      <div><span>${canEdit ? "Edit clip" : "Clip"}</span><h2 id="video-analysis-clip-editor-title">${escapeHtml(title || getClipPrimaryLabel(clip, laneMode) || "Selected clip")}${review ? ` (${review.entries.length})` : ""}</h2></div>
      <div class="video-analysis-clip-editor__tools">
        ${canEdit ? `<button type="button" class="video-analysis-clip-editor__timing-toggle" data-clip-timing-toggle aria-label="Edit clip timing" title="Edit clip timing" aria-expanded="false" aria-controls="video-analysis-clip-timing">${playerHeaderIcon("pencil")}</button>` : ""}
        <button type="button" class="video-analysis-clip-editor__close" data-video-analysis-timeline-edit-cancel aria-label="Close" title="Close">${playerHeaderIcon("x")}</button>
      </div>
    </header>
    <form data-video-analysis-timeline-editor novalidate>
      <fieldset id="video-analysis-clip-timing" class="video-analysis-clip-editor__timing-panel" aria-label="Clip timing" hidden ${canEdit ? "" : "disabled"}>
        <div class="video-analysis-clip-editor__timing">
          ${timeField("Start", "startMs", start)}
          ${timeField("End", "endMs", end)}
          <label><span>Duration (s)</span><input type="number" min="0.001" step="0.001" required aria-label="Duration (s)" data-video-analysis-timeline-edit-field="duration" value="${(end - start) / 1000}"></label>
        </div>
      </fieldset>
      ${renderClipReview(review, clip.id)}
      <div class="video-analysis-clip-editor__layout">
      <section class="video-analysis-clip-editor__media" aria-label="Clip preview">
        <div class="video-analysis-clip-editor__screen">
          <video data-video-analysis-clip-preview playsinline preload="metadata" aria-label="Selected clip"></video>
          <div class="video-analysis-clip-editor__media-state" data-clip-preview-empty>
            <span data-clip-preview-status role="status"></span>
            <button type="button" data-clip-preview-reconnect>Reconnect local file</button>
          </div>
          <input type="file" accept="video/*,.mkv,.mov,.m4v" data-clip-preview-file hidden>
        </div>
        <div class="video-analysis-clip-editor__transport">
          <button type="button" data-clip-preview-play aria-label="Play clip" title="Play clip" disabled>${playerHeaderIcon("play")}</button>
          <input type="range" data-clip-preview-seek aria-label="Clip position" min="0" max="${end - start}" step="1" value="0" disabled>
          <output data-clip-preview-time aria-live="off"></output>
        </div>
      </section>
      <fieldset class="video-analysis-clip-editor__metadata" ${canEdit ? "" : "disabled"}>
          <label><span>Phase</span><select data-video-analysis-timeline-edit-field="phase">${optionList(phases, phase)}</select></label>
          <label><span>Sub-phase</span><select data-video-analysis-timeline-edit-field="subPhase">${clipEditorSubPhaseOptions(phase, subPhase)}</select></label>
          <label><span>Outcome</span><select data-video-analysis-timeline-edit-field="outcome">${optionList(videoAnalysisOutcomes, clip.outcome)}</select></label>
        <details class="video-analysis-clip-editor__principles">
          <summary>MG principles <span data-video-analysis-principle-count>${principles.size || ""}</span></summary>
          <div>${miniGamePrinciples.map(principle => `<label><input type="checkbox" data-video-analysis-timeline-edit-principle value="${escapeHtml(principle.id)}"${principles.has(principle.label) ? " checked" : ""}><span>${escapeHtml(principle.label)}</span></label>`).join("")}</div>
        </details>
        <label><span>Tags</span><input type="text" data-video-analysis-timeline-edit-field="tags" value="${escapeHtml((clip.tags || []).join(", "))}"></label>
        <label><span>Note</span><textarea rows="3" maxlength="4000" data-video-analysis-timeline-edit-field="note">${escapeHtml(clip.notes?.[0]?.note || "")}</textarea></label>
      </fieldset>
      </div>
      <p class="video-analysis-clip-editor__error" role="alert" hidden></p>
      <div class="video-analysis-clip-editor__confirm" data-video-analysis-clip-editor-confirm hidden>
        <span>Delete this clip?</span>
        <button type="button" data-video-analysis-clip-editor-keep>Cancel</button>
        <button type="button" data-video-analysis-clip-editor-delete-confirm>Delete clip</button>
      </div>
      ${review ? `<div class="video-analysis-clip-editor__confirm" data-clip-review-close-confirm hidden>
        <span>Discard unsaved changes?</span>
        <button type="button" data-clip-review-keep>Keep editing</button>
        <button type="button" data-clip-review-discard>Discard</button>
      </div>` : ""}
      <footer>
        ${canEdit ? '<button type="button" class="video-analysis-clip-editor__delete" data-video-analysis-clip-editor-delete>Delete</button>' : ""}
        ${review ? '<span class="video-analysis-clip-review__notice" data-clip-review-notice role="status"></span>' : ""}
        <button type="button" data-video-analysis-timeline-edit-cancel>${canEdit && !review ? "Cancel" : "Close"}</button>
        ${canEdit ? `<button type="submit" class="video-analysis-clip-editor__save" data-video-analysis-timeline-edit-save>${review ? "Save clip" : "Save"}</button>` : ""}
      </footer>
    </form>
  `;
}
