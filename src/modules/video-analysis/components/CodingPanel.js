import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import { optionList, escapeHtml } from "./renderHelpers.js";

export function renderCodingPanel(state = {}) {
  const draft = state.draft || {};
  const canSave = state.canEdit && state.match?.id && state.video?.id;
  const playerOptions = `<option value="">Unit / no player</option>${optionList(
    state.players || [],
    draft.playerId,
    (player) => player.id,
    (player) => `${player.number ? `${player.number} ` : ""}${player.name}`
  )}`;
  return `
    <section class="video-analysis-coding-panel">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Draft</p>
          <h3>${escapeHtml(draft.phase)} / ${escapeHtml(draft.outcome)}</h3>
        </div>
        <span class="video-analysis-draft-mode">${escapeHtml(state.codingSession?.mode || "manual")}</span>
      </div>
      <form data-video-analysis-form>
        <div class="video-analysis-grid-2">
          <label>Start ms<input type="number" min="0" step="100" data-video-analysis-draft="startMs" value="${escapeHtml(draft.startMs)}"></label>
          <label>End ms<input type="number" min="0" step="100" data-video-analysis-draft="endMs" value="${escapeHtml(draft.endMs)}"></label>
        </div>
        <div class="video-analysis-inline-actions">
          <button type="button" data-video-analysis-mark="start">In</button>
          <button type="button" data-video-analysis-mark="end">Out</button>
          <button type="button" data-video-analysis-trim="start:-100">Start -</button>
          <button type="button" data-video-analysis-trim="end:100">End +</button>
        </div>
        <div class="video-analysis-grid-2">
          <label>Period<input type="text" data-video-analysis-draft="period" value="${escapeHtml(draft.period)}"></label>
          <label>Outcome<select data-video-analysis-draft="outcome">${optionList(videoAnalysisOutcomes, draft.outcome)}</select></label>
        </div>
        <label>Phase<select data-video-analysis-draft="phase">${optionList(videoAnalysisPhases, draft.phase)}</select></label>
        <label>Sub Phase<select data-video-analysis-draft="subPhase">${optionList(videoAnalysisSubPhases, draft.subPhase)}</select></label>
        <label>MG Principle<select data-video-analysis-draft="miniGamePrincipleId"><option value="">None</option>${optionList(miniGamePrinciples, draft.miniGamePrincipleId, (item) => item.id, (item) => item.label)}</select></label>
        <div class="video-analysis-grid-2">
          <label>Player<select data-video-analysis-draft="playerId">${playerOptions}</select></label>
          <label>Role<select data-video-analysis-draft="playerRole">${optionList(["primary", "secondary", "supporting", "unit"], draft.playerRole)}</select></label>
        </div>
        <label>Tags<input type="text" data-video-analysis-draft="tags" value="${escapeHtml(draft.tags)}"></label>
        <label>Notes<textarea rows="4" data-video-analysis-draft="note">${escapeHtml(draft.note)}</textarea></label>
        <button type="submit" class="video-analysis-primary-button" ${canSave ? "" : "disabled"}>Save clip</button>
      </form>
    </section>
  `;
}
