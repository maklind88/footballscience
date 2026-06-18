import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisSubPhases } from "../constants/subPhases.js";
import {
  buildClipLibraryGroups,
  buildClipLibraryStats,
  clipLibraryGroupModes,
  playerEntries,
} from "../services/clipLibraryService.js";
import { clipMiniGamePrincipleLabels } from "../services/miniGamePrincipleService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { renderClipPreviewOverlay } from "./ClipLibraryPreview.js";
import { escapeHtml, optionList } from "./renderHelpers.js";

function primaryPlayerLabel(clip = {}) {
  return playerEntries(clip)[0]?.label || "Unit";
}

function clipTitle(clip = {}) {
  const phase = String(clip.phase || "Uncoded").trim();
  const subPhase = String(clip.subPhase || clip.sub_phase || "").trim();
  return [subPhase, phase].filter(Boolean).join(" / ") || "Uncoded clip";
}

function clipOutcome(clip = {}) {
  return String(clip.outcome || "Neutral").trim() || "Neutral";
}

function clipNotes(clip = {}) {
  return Array.isArray(clip.notes) ? String(clip.notes.at(-1)?.note || "").trim() : "";
}

function clipDescriptorSummary(clip = {}) {
  return (Array.isArray(clip.descriptors) ? clip.descriptors : [])
    .map((entry) => entry.descriptor_label || entry.descriptor_value || entry.value)
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

function renderStat(label = "", value = "") {
  return `
    <span class="video-analysis-clip-library-stat">
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(label)}</small>
    </span>
  `;
}

function renderFilters(state = {}) {
  const filters = state.filters || {};
  return `
    <section class="video-analysis-clip-library-toolbar" aria-label="Clip library filters">
      <input type="search" placeholder="Search clips, players, principles or notes" data-video-analysis-filter="search" value="${escapeHtml(filters.search)}">
      <select data-video-analysis-filter="subPhase">
        <option value="">All sub-phases</option>${optionList(videoAnalysisSubPhases, filters.subPhase)}
      </select>
      <select data-video-analysis-filter="playerId">
        <option value="">All players</option>${optionList(state.players || [], filters.playerId, (player) => player.id, (player) => player.name)}
      </select>
      <select data-video-analysis-filter="miniGamePrincipleId">
        <option value="">All MG principles</option>${optionList(miniGamePrinciples, filters.miniGamePrincipleId, (item) => item.id, (item) => item.label)}
      </select>
      <select data-video-analysis-filter="outcome">
        <option value="">All outcomes</option>${optionList(videoAnalysisOutcomes, filters.outcome)}
      </select>
      <button type="button" data-video-analysis-clear-filters>Clear</button>
    </section>
  `;
}

function renderGroupModeButton(mode = {}, active = "subPhase") {
  return `
    <button type="button" class="${mode.id === active ? "is-active" : ""}" data-video-analysis-clip-library-group="${escapeHtml(mode.id)}">
      ${escapeHtml(mode.label)}
    </button>
  `;
}

function renderSavedSearches(searches = []) {
  return `
    <div class="video-analysis-clip-library-saved">
      <button type="button" data-video-analysis-save-search>Save search</button>
      ${searches.slice(0, 6).map((search) => `
        <button type="button" data-video-analysis-apply-search="${escapeHtml(search.id || search.title)}">
          ${escapeHtml(search.title || "Saved search")}
        </button>
      `).join("")}
    </div>
  `;
}

function selectedClipIds(state = {}) {
  return new Set((Array.isArray(state.clipLibrary?.selectedClipIds) ? state.clipLibrary.selectedClipIds : [])
    .map((id) => String(id || ""))
    .filter(Boolean));
}

function renderOrganizer(state = {}) {
  const count = selectedClipIds(state).size;
  return `
    <section class="video-analysis-clip-library-organizer" aria-label="Clip organizer">
      <div>
        <p class="video-analysis-kicker">Organizer</p>
        <strong>${count ? `${count} selected` : "Select clips to play in order"}</strong>
      </div>
      <div>
        <button type="button" data-video-analysis-clip-library-play-selected ${count ? "" : "disabled"}>Play selected</button>
        <button type="button" data-video-analysis-clip-library-clear-selected ${count ? "" : "disabled"}>Clear</button>
      </div>
    </section>
  `;
}

function renderPrinciples(clip = {}) {
  const principles = clipMiniGamePrincipleLabels(clip);
  if (!principles.length) return `<span class="video-analysis-clip-library-muted">No MG principle</span>`;
  return `
    <span class="video-analysis-clip-library-principles">
      ${principles.map((principle) => `<em>${escapeHtml(principle)}</em>`).join("")}
    </span>
  `;
}

function formatSourceDate(value = "") {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-");
  return `${day}/${month}/${year}`;
}

function sourceTypeLabel(value = "") {
  return String(value || "").toLowerCase() === "training" ? "Training" : "Match";
}

function clipSourceTitle(clip = {}, state = {}) {
  return String(
    clip.matchTitle
    || clip.match_title
    || clip.match?.title
    || clip.videoTitle
    || clip.video_title
    || state.match?.title
    || state.videoRef?.displayName
    || "Source not linked"
  ).trim();
}

function clipSourceLine(clip = {}, state = {}) {
  const type = sourceTypeLabel(clip.eventType || clip.event_type || state.match?.eventType || state.match?.event_type);
  const title = clipSourceTitle(clip, state);
  const date = formatSourceDate(clip.matchDate || clip.match_date || state.match?.matchDate || state.match?.match_date);
  return [type, title, date].filter(Boolean).join(" · ");
}

function renderClip(clip = {}, state = {}) {
  const note = clipNotes(clip);
  const descriptors = clipDescriptorSummary(clip);
  const clipId = String(clip.id || "");
  const isSelected = selectedClipIds(state).has(clipId);
  return `
    <article class="video-analysis-clip-library-card${isSelected ? " is-selected" : ""}" data-video-analysis-clip="${escapeHtml(clipId)}">
      <label class="video-analysis-clip-library-card__select" aria-label="Select clip for organizer">
        <input
          type="checkbox"
          data-video-analysis-clip-library-select="${escapeHtml(clipId)}"
          ${isSelected ? "checked" : ""}
        >
        <span aria-hidden="true"></span>
      </label>
      <div class="video-analysis-clip-library-card__body">
        <div class="video-analysis-clip-library-card__primary">
          <strong>${escapeHtml(clipTitle(clip))}</strong>
          <span class="video-analysis-clip-library-card__source">${escapeHtml(clipSourceLine(clip, state))}</span>
        </div>
        <div class="video-analysis-clip-library-card__meta">
          <span>${escapeHtml(primaryPlayerLabel(clip))} · ${escapeHtml(clipOutcome(clip))}</span>
          ${renderPrinciples(clip)}
          ${descriptors ? `<small>${escapeHtml(descriptors)}</small>` : ""}
          ${note ? `<p>${escapeHtml(note)}</p>` : ""}
        </div>
      </div>
      <div class="video-analysis-clip-library-card__actions">
        <button type="button" data-video-analysis-clip-library-play="${escapeHtml(clipId)}">Play</button>
        <button type="button" data-video-analysis-review="${escapeHtml(clipId)}">Presentation</button>
      </div>
    </article>
  `;
}

function renderGroup(group = {}, groupBy = "subPhase", state = {}) {
  return `
    <section class="video-analysis-clip-library-group">
      <header>
        <div>
          <h3>${escapeHtml(group.label)}</h3>
          <span>${escapeHtml(`${group.clips.length} clips · ${formatVideoTime(group.durationMs)}`)}</span>
        </div>
        <button
          type="button"
          data-video-analysis-clip-library-add-group="${escapeHtml(groupBy)}"
          data-video-analysis-clip-library-group-value="${escapeHtml(group.label)}"
        >
          Add group
        </button>
      </header>
      <div class="video-analysis-clip-library-grid">
        ${group.clips.map((clip) => renderClip(clip, state)).join("")}
      </div>
    </section>
  `;
}

export function renderClipLibrary(state = {}) {
  const clips = Array.isArray(state.clips) ? state.clips : [];
  const previewClips = Array.isArray(state.allClips) ? state.allClips : clips;
  const groupBy = state.clipLibrary?.groupBy || "subPhase";
  const stats = buildClipLibraryStats(clips);
  const groups = buildClipLibraryGroups(clips, groupBy);
  const title = state.match?.title || state.videoRef?.displayName || "All tagged clips";
  return `
    <section class="video-analysis-clip-library" data-video-analysis-clip-library>
      <header class="video-analysis-clip-library-hero">
        <div>
          <p class="video-analysis-kicker">Clip Library</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="video-analysis-clip-library-stats" aria-label="Clip library summary">
          ${renderStat("Clips", String(stats.clips))}
          ${renderStat("Duration", formatVideoTime(stats.durationMs))}
          ${renderStat("Sub-phases", String(stats.subPhases))}
          ${renderStat("Players", String(stats.players))}
          ${renderStat("Principles", String(stats.principles))}
        </div>
      </header>
      ${renderFilters(state)}
      <section class="video-analysis-clip-library-controls">
        <div class="video-analysis-mode-toggle" role="group" aria-label="Group clips by">
          ${clipLibraryGroupModes.map((mode) => renderGroupModeButton(mode, groupBy)).join("")}
        </div>
        ${renderSavedSearches(state.savedSearches || [])}
      </section>
      ${renderOrganizer(state)}
      <section class="video-analysis-clip-library-groups">
        ${groups.length ? groups.map((group) => renderGroup(group, groupBy, state)).join("") : `
          <section class="video-analysis-clip-library-empty">
            <h3>No clips found</h3>
          </section>
        `}
      </section>
      ${renderClipPreviewOverlay(state, previewClips)}
    </section>
  `;
}
