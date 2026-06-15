import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml, optionList } from "./renderHelpers.js";

function clipTitle(clip = {}) {
  return clip.customTitle || `${clip.phase || "Clip"} / ${clip.outcome || "Neutral"}`;
}

function playerLabel(clip = {}) {
  const player = Array.isArray(clip.players) ? clip.players[0] : null;
  return player?.player_label || player?.playerLabel || player?.player_id || player?.playerId || "Team";
}

function renderSourceClip(clip = {}, activeSectionId = "") {
  const startMs = clip.startMs ?? clip.start_ms ?? 0;
  return `
    <article class="video-analysis-presentation-source-clip">
      <button type="button" class="video-analysis-presentation-source-clip__time" data-video-analysis-seek="${escapeHtml(clip.id)}">
        ${escapeHtml(formatVideoTime(startMs))}
      </button>
      <div>
        <strong>${escapeHtml(clipTitle(clip))}</strong>
        <span>${escapeHtml(playerLabel(clip))} - ${escapeHtml(clip.subPhase || clip.sub_phase || "Tagged clip")}</span>
      </div>
      <button type="button" data-video-analysis-presentation-add="${escapeHtml(activeSectionId)}:${escapeHtml(clip.id)}">Add</button>
    </article>
  `;
}

function renderSmartCollection(collection = {}) {
  return `
    <button type="button" class="video-analysis-smart-collection" data-video-analysis-smart-apply="${escapeHtml(collection.id || collection.title)}">
      <span>${escapeHtml(collection.title || "Smart collection")}</span>
    </button>
  `;
}

export function renderPresentationSources(state = {}) {
  const presentation = state.presentation || {};
  const filters = presentation.sourceFilters || {};
  const clips = Array.isArray(presentation.sourceClips) ? presentation.sourceClips : [];
  const smartCollections = Array.isArray(presentation.smartCollections) ? presentation.smartCollections : [];
  return `
    <section class="video-analysis-presentation-sources" aria-label="Presentation sources and smart collections">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Sources</p>
          <h3>Data Explorer</h3>
        </div>
        <button type="button" data-video-analysis-presentation-refresh-sources>Refresh</button>
      </div>
      <div class="video-analysis-presentation-source-filters">
        <input type="search" placeholder="Search clips, tags, player, match or date" data-video-analysis-presentation-filter="search" value="${escapeHtml(filters.search || "")}">
        <select data-video-analysis-presentation-filter="phase">
          <option value="">All phases</option>${optionList(videoAnalysisPhases, filters.phase)}
        </select>
        <select data-video-analysis-presentation-filter="outcome">
          <option value="">All outcomes</option>${optionList(videoAnalysisOutcomes, filters.outcome)}
        </select>
        <input type="search" placeholder="Player or tag" data-video-analysis-presentation-filter="tag" value="${escapeHtml(filters.tag || "")}">
        <input type="date" data-video-analysis-presentation-filter="date" value="${escapeHtml(filters.date || "")}">
        <button type="button" data-video-analysis-smart-save>Save smart</button>
      </div>
      <div class="video-analysis-smart-collections" aria-label="Smart collections">
        ${smartCollections.length
          ? smartCollections.map(renderSmartCollection).join("")
          : `<span class="video-analysis-muted">No smart collections saved yet.</span>`}
      </div>
      <div class="video-analysis-presentation-source-list">
        ${clips.length
          ? clips.map((clip) => renderSourceClip(clip, presentation.activeSectionId || "opening")).join("")
          : `<p class="video-analysis-muted">Search or refresh to load tagged clips.</p>`}
      </div>
    </section>
  `;
}
