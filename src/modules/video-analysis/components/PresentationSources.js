import { videoAnalysisOutcomes } from "../constants/outcomes.js";
import { videoAnalysisPhases } from "../constants/phases.js";
import { thumbnailCacheKey } from "../services/localThumbnailCacheService.js";
import {
  normalizeSmartCollection,
  smartCollectionShareLabel,
} from "../services/presentationService.js";
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

function renderSourceClip(clip = {}, activeSectionId = "", state = {}) {
  const startMs = clip.startMs ?? clip.start_ms ?? 0;
  const tags = clipTags(clip);
  const thumbnailUrl = state.presentation?.thumbnails?.[thumbnailCacheKey(state.videoRef || {}, clip)] || "";
  return `
    <article class="video-analysis-presentation-source-clip">
      <button type="button" class="video-analysis-presentation-source-clip__thumb" data-video-analysis-seek="${escapeHtml(clip.id)}" aria-label="Preview clip">
        ${thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="">` : `<strong>${escapeHtml(clipInitial(clip))}</strong>`}
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

function renderSmartCollection(collection = {}, state = {}) {
  const normalized = normalizeSmartCollection(collection);
  const filters = normalized.searchJson || {};
  const metadata = normalized.metadata || {};
  const pinned = Boolean(metadata.pinned);
  const active = state.presentation?.activeSmartCollectionId === normalized.id;
  const filterParts = [filters.phase, filters.outcome, filters.tag, filters.date, filters.search]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 4);
  return `
    <article class="video-analysis-smart-collection${pinned ? " is-pinned" : ""}${active ? " is-active" : ""}">
      <button type="button" class="video-analysis-smart-collection__main" data-video-analysis-smart-apply="${escapeHtml(normalized.id || normalized.title)}">
        <span>${escapeHtml(pinned ? "Pinned playlist" : normalized.visibility)}</span>
        <strong>${escapeHtml(normalized.title || "Smart collection")}</strong>
        <small>${escapeHtml(filterParts.length ? filterParts.join(" / ") : normalized.description || "Saved clip playlist")}</small>
      </button>
      <div class="video-analysis-smart-collection__meta">
        <span>${escapeHtml(smartCollectionShareLabel(normalized))}</span>
        <span>${escapeHtml(normalized.sortMode || "newest")}</span>
      </div>
      <div class="video-analysis-smart-collection__actions">
        <button type="button" data-video-analysis-smart-pin="${escapeHtml(normalized.id || normalized.title)}">${pinned ? "Unpin" : "Pin"}</button>
        <button type="button" data-video-analysis-smart-duplicate="${escapeHtml(normalized.id || normalized.title)}">Duplicate</button>
        <button type="button" data-video-analysis-smart-share="${escapeHtml(normalized.id || normalized.title)}">Share</button>
      </div>
      ${state.presentation?.sharePanelTargetId === normalized.id ? renderSmartCollectionSharePanel(normalized, state) : ""}
    </article>
  `;
}

function renderPlayerTargetOptions(players = [], selected = "") {
  return optionList(players, selected, (player) => player.id, (player) => `${player.name}${player.position ? ` / ${player.position}` : ""}`);
}

function renderShareTarget(target = {}, collectionId = "") {
  const label = `${target.targetType || "role"}:${target.targetId || ""}`;
  return `
    <span class="video-analysis-share-target-pill">
      ${escapeHtml(`${label} / ${target.accessLevel || "view"}`)}
      <button type="button" aria-label="Remove share target" data-video-analysis-smart-share-remove="${escapeHtml(collectionId)}:${escapeHtml(target.targetType || "")}:${escapeHtml(target.targetId || "")}">x</button>
    </span>
  `;
}

function renderSmartCollectionSharePanel(collection = {}, state = {}) {
  const draft = state.presentation?.smartCollectionDraft || {};
  const targetType = draft.targetType || "role";
  const shareTargets = Array.isArray(collection.shareTargets) ? collection.shareTargets : [];
  return `
    <div class="video-analysis-smart-share-panel">
      <div class="video-analysis-smart-share-panel__row">
        <label>
          <span>Visibility</span>
          <select data-video-analysis-smart-draft="visibility">
            ${optionList([
              { id: "coach-analyst", label: "Coach + analyst" },
              { id: "team", label: "Team" },
              { id: "player-safe", label: "Player-safe" },
              { id: "custom", label: "Custom" },
              { id: "private", label: "Private" },
            ], draft.visibility || collection.visibility || "coach-analyst", (item) => item.id, (item) => item.label)}
          </select>
        </label>
        <label>
          <span>Target</span>
          <select data-video-analysis-smart-draft="targetType">
            ${optionList(["role", "player", "group", "user", "team"], targetType)}
          </select>
        </label>
        <label>
          <span>${escapeHtml(targetType === "player" ? "Player" : "Id")}</span>
          ${targetType === "player"
            ? `<select data-video-analysis-smart-draft="targetId"><option value="">Choose player</option>${renderPlayerTargetOptions(state.players || [], draft.targetId || "")}</select>`
            : `<input type="text" placeholder="${escapeHtml(targetType === "role" ? "coach, analyst..." : "group/user id")}" data-video-analysis-smart-draft="targetId" value="${escapeHtml(draft.targetId || "")}">`}
        </label>
        <label>
          <span>Access</span>
          <select data-video-analysis-smart-draft="accessLevel">
            ${optionList(["view", "present", "edit"], draft.accessLevel || "view")}
          </select>
        </label>
      </div>
      <div class="video-analysis-smart-share-panel__actions">
        <button type="button" data-video-analysis-smart-share-add="${escapeHtml(collection.id)}">Add target</button>
        <button type="button" class="video-analysis-primary-action" data-video-analysis-smart-share-save="${escapeHtml(collection.id)}">Save sharing</button>
      </div>
      <div class="video-analysis-smart-share-targets">
        ${shareTargets.length ? shareTargets.map((target) => renderShareTarget(target, collection.id)).join("") : `<span class="video-analysis-muted">Private until targets are added.</span>`}
      </div>
    </div>
  `;
}

function renderSmartCollectionDraft(state = {}) {
  const draft = state.presentation?.smartCollectionDraft || {};
  const filters = state.presentation?.sourceFilters || {};
  return `
    <div class="video-analysis-smart-save-strip">
      <input type="text" placeholder="Playlist name, e.g. High press wins" data-video-analysis-smart-draft="title" value="${escapeHtml(draft.title || "")}">
      <input type="text" placeholder="Short description" data-video-analysis-smart-draft="description" value="${escapeHtml(draft.description || "")}">
      <select data-video-analysis-smart-draft="visibility">
        ${optionList([
          { id: "coach-analyst", label: "Coach + analyst" },
          { id: "team", label: "Team" },
          { id: "player-safe", label: "Player-safe" },
          { id: "private", label: "Private" },
        ], draft.visibility || "coach-analyst", (item) => item.id, (item) => item.label)}
      </select>
      <button type="button" data-video-analysis-smart-save>${escapeHtml(filters.search || filters.phase || filters.outcome || filters.tag ? "Save playlist" : "Save current view")}</button>
    </div>
  `;
}

export function renderPresentationSources(state = {}) {
  const presentation = state.presentation || {};
  const filters = presentation.sourceFilters || {};
  const clips = Array.isArray(presentation.sourceClips) ? presentation.sourceClips : [];
  const smartCollections = Array.isArray(presentation.smartCollections) ? presentation.smartCollections.map(normalizeSmartCollection) : [];
  const total = Number(presentation.sourceTotal || clips.length || 0);
  const cache = presentation.thumbnailCache || {};
  return `
    <section class="video-analysis-presentation-sources" aria-label="Presentation sources and smart collections">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Find clips</p>
          <h3>Data Explorer</h3>
        </div>
        <div class="video-analysis-presentation-source-tools">
          <span>${escapeHtml(`${cache.count || 0} thumbnails`)}</span>
          <button type="button" data-video-analysis-thumbnail-cache-clear>Clear cache</button>
          <button type="button" data-video-analysis-presentation-refresh-sources>Refresh</button>
        </div>
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
      </div>
      ${renderSmartCollectionDraft(state)}
      <div class="video-analysis-presentation-source-summary">
        <span>${escapeHtml(`${total} loaded clips`)}</span>
        <span>${escapeHtml(presentation.activeSectionId ? "Adds to active section" : "Choose a section first")}</span>
      </div>
      <div class="video-analysis-presentation-source-list">
        ${clips.length
          ? clips.map((clip) => renderSourceClip(clip, presentation.activeSectionId || "opening", state)).join("")
          : `<p class="video-analysis-muted">Search or refresh to load tagged clips.</p>`}
      </div>
      ${presentation.sourceHasMore ? `<button type="button" class="video-analysis-load-more-clips" data-video-analysis-presentation-load-more>Load more clips</button>` : ""}
      <div class="video-analysis-smart-collections" aria-label="Smart collections">
        <div class="video-analysis-smart-collections__header">
          <p class="video-analysis-kicker">Smart playlists</p>
          <strong>${escapeHtml(`${smartCollections.length} saved`)}</strong>
        </div>
        ${smartCollections.length
          ? smartCollections.map((collection) => renderSmartCollection(collection, state)).join("")
          : `<span class="video-analysis-muted">Save searches as live playlists like High press wins, Set pieces or Player clips.</span>`}
      </div>
    </section>
  `;
}
