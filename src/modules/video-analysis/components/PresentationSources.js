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

function clipDuration(clip = {}) {
  const startMs = clip.startMs ?? clip.start_ms ?? 0;
  const endMs = clip.endMs ?? clip.end_ms ?? startMs;
  return Math.max(0, Number(endMs || 0) - Number(startMs || 0));
}

function clipTags(clip = {}) {
  const rawTags = []
    .concat(Array.isArray(clip.tags) ? clip.tags : [])
    .concat(Array.isArray(clip.labels) ? clip.labels.map((label) => label.label_text || label.labelText || label.label_value || label.labelValue) : [])
    .concat(Array.isArray(clip.descriptors) ? clip.descriptors.map((entry) => entry.descriptor_label || entry.descriptorLabel || entry.descriptor_value || entry.descriptorValue) : []);
  return rawTags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 4);
}

function clipInitial(clip = {}) {
  const phase = clip.phase || clip.subPhase || clip.sub_phase || "Clip";
  return String(phase).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "CL";
}

function renderSourceClip(clip = {}, activeSectionId = "") {
  const startMs = clip.startMs ?? clip.start_ms ?? 0;
  const tags = clipTags(clip);
  return `
    <article class="video-analysis-presentation-source-clip">
      <button type="button" class="video-analysis-presentation-source-clip__thumb" data-video-analysis-seek="${escapeHtml(clip.id)}" aria-label="Preview clip">
        <strong>${escapeHtml(clipInitial(clip))}</strong>
        <span>${escapeHtml(formatVideoTime(startMs))}</span>
      </button>
      <div>
        <strong>${escapeHtml(clipTitle(clip))}</strong>
        <span>${escapeHtml(playerLabel(clip))} - ${escapeHtml(clip.subPhase || clip.sub_phase || "Tagged clip")}</span>
        <small>${escapeHtml(`${formatVideoTime(clipDuration(clip))} duration`)}</small>
        <div class="video-analysis-presentation-clip-tags">
          ${(tags.length ? tags : [clip.outcome || "Ready"]).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
      <button type="button" data-video-analysis-presentation-add="${escapeHtml(activeSectionId)}:${escapeHtml(clip.id)}">Add</button>
    </article>
  `;
}

function renderSmartCollection(collection = {}) {
  const filters = collection.searchJson || collection.search_json || {};
  const filterParts = [filters.phase, filters.outcome, filters.tag, filters.date, filters.search]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return `
    <button type="button" class="video-analysis-smart-collection" data-video-analysis-smart-apply="${escapeHtml(collection.id || collection.title)}">
      <strong>${escapeHtml(collection.title || "Smart collection")}</strong>
      <span>${escapeHtml(filterParts.length ? filterParts.join(" / ") : "Saved clip playlist")}</span>
    </button>
  `;
}

export function renderPresentationSources(state = {}) {
  const presentation = state.presentation || {};
  const filters = presentation.sourceFilters || {};
  const clips = Array.isArray(presentation.sourceClips) ? presentation.sourceClips : [];
  const smartCollections = Array.isArray(presentation.smartCollections) ? presentation.smartCollections : [];
  const total = Number(presentation.sourceTotal || clips.length || 0);
  return `
    <section class="video-analysis-presentation-sources" aria-label="Presentation sources and smart collections">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Find clips</p>
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
        <button type="button" data-video-analysis-smart-save>Save search</button>
      </div>
      <div class="video-analysis-smart-collections" aria-label="Smart collections">
        ${smartCollections.length
          ? smartCollections.map(renderSmartCollection).join("")
          : `<span class="video-analysis-muted">Save searches here as live clip playlists.</span>`}
      </div>
      <div class="video-analysis-presentation-source-summary">
        <span>${escapeHtml(`${total} matching clips`)}</span>
        <span>${escapeHtml(presentation.activeSectionId ? "Adds to active section" : "Choose a section first")}</span>
      </div>
      <div class="video-analysis-presentation-source-list">
        ${clips.length
          ? clips.map((clip) => renderSourceClip(clip, presentation.activeSectionId || "opening")).join("")
          : `<p class="video-analysis-muted">Search or refresh to load tagged clips.</p>`}
      </div>
    </section>
  `;
}
