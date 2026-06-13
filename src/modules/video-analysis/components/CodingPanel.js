import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { teamPrinciples } from "../constants/principles.js";
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
        <p class="video-analysis-kicker">Coding</p>
        <h3>Instance</h3>
      </div>
      <form data-video-analysis-form>
        <div class="video-analysis-grid-2">
          <label>Start ms<input type="number" min="0" step="100" data-video-analysis-draft="startMs" value="${escapeHtml(draft.startMs)}"></label>
          <label>End ms<input type="number" min="0" step="100" data-video-analysis-draft="endMs" value="${escapeHtml(draft.endMs)}"></label>
        </div>
        <div class="video-analysis-inline-actions">
          <button type="button" data-video-analysis-mark="start">Set start</button>
          <button type="button" data-video-analysis-mark="end">Set end</button>
        </div>
        <label>Period<input type="text" data-video-analysis-draft="period" value="${escapeHtml(draft.period)}"></label>
        <label>Phase<select data-video-analysis-draft="phase">${optionList(videoAnalysisPhases, draft.phase)}</select></label>
        <label>Sub Phase<select data-video-analysis-draft="subPhase">${optionList(videoAnalysisSubPhases, draft.subPhase)}</select></label>
        <label>Team Principle<select data-video-analysis-draft="teamPrincipleId">${optionList(
          teamPrinciples,
          draft.teamPrincipleId,
          (item) => item.id,
          (item) => item.label
        )}</select></label>
        <label>Mini-Game Principle<select data-video-analysis-draft="miniGamePrincipleId">${optionList(
          miniGamePrinciples,
          draft.miniGamePrincipleId,
          (item) => item.id,
          (item) => item.label
        )}</select></label>
        <label>Player<select data-video-analysis-draft="playerId">${playerOptions}</select></label>
        <label>Role<select data-video-analysis-draft="playerRole">
          ${optionList(["primary", "secondary", "supporting", "unit"], draft.playerRole)}
        </select></label>
        <label>Outcome<select data-video-analysis-draft="outcome">${optionList(videoAnalysisOutcomes, draft.outcome)}</select></label>
        <label>Tags<input type="text" data-video-analysis-draft="tags" value="${escapeHtml(draft.tags)}"></label>
        <label>Notes<textarea rows="4" data-video-analysis-draft="note">${escapeHtml(draft.note)}</textarea></label>
        <button type="submit" class="video-analysis-primary-button" ${canSave ? "" : "disabled"}>Save clip</button>
      </form>
    </section>
  `;
}
