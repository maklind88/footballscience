import { teamPrinciples } from "../constants/principles.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { optionList, escapeHtml } from "./renderHelpers.js";

export function renderClipFilters(state = {}) {
  const filters = state.filters || {};
  return `
    <section class="video-analysis-filters">
      <input type="search" placeholder="Search clips" data-video-analysis-filter="search" value="${escapeHtml(filters.search)}">
      <select data-video-analysis-filter="phase">
        <option value="">All phases</option>${optionList(videoAnalysisPhases, filters.phase)}
      </select>
      <select data-video-analysis-filter="principleId">
        <option value="">All principles</option>${optionList(teamPrinciples, filters.principleId, (item) => item.id, (item) => item.label)}
      </select>
      <select data-video-analysis-filter="playerId">
        <option value="">All players</option>${optionList(state.players || [], filters.playerId, (player) => player.id, (player) => player.name)}
      </select>
      <select data-video-analysis-filter="outcome">
        <option value="">All outcomes</option>${optionList(videoAnalysisOutcomes, filters.outcome)}
      </select>
      <button type="button" data-video-analysis-clear-filters>Clear</button>
    </section>
  `;
}
