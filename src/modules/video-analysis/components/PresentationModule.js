import { formatVideoTime } from "../services/videoPlaybackService.js";
import { buildVideoLibraryItems } from "../services/videoLibraryService.js";
import { renderClipFilters } from "./ClipFilters.js";
import { renderClipIntelligence } from "./ClipIntelligence.js";
import { renderClipList } from "./ClipList.js";
import { escapeHtml } from "./renderHelpers.js";

function formatDate(value = "") {
  if (!value) return "No date";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function eventTypeLabel(type = "") {
  return String(type || "").toLowerCase() === "match" ? "Match" : "Training";
}

function renderPresentationItem(item = {}, clip = {}, sectionId = "") {
  const startMs = clip.startMs || clip.start_ms || 0;
  return `
    <li class="video-analysis-presentation-item">
      <button type="button" data-video-analysis-seek="${escapeHtml(item.clipId)}">${escapeHtml(formatVideoTime(startMs))}</button>
      <span>${escapeHtml(clip.phase || "Clip")} / ${escapeHtml(clip.outcome || "Neutral")}</span>
      <button type="button" data-video-analysis-review-remove="${escapeHtml(sectionId)}:${escapeHtml(item.clipId)}">Remove</button>
    </li>
  `;
}

function renderPresentationSection(section = {}, clipsById = new Map(), activeSectionId = "") {
  const items = Array.isArray(section.items) ? section.items : [];
  return `
    <section class="video-analysis-presentation-section${activeSectionId === section.id ? " is-active" : ""}">
      <button type="button" class="video-analysis-presentation-section__header" data-video-analysis-review-section="${escapeHtml(section.id)}">
        <span>${escapeHtml(section.title)}</span>
        <strong>${items.length}</strong>
      </button>
      <textarea rows="2" placeholder="Meeting note" data-video-analysis-review-note="${escapeHtml(section.id)}">${escapeHtml(section.note || "")}</textarea>
      <ol>
        ${items.length ? items.map((item) => renderPresentationItem(item, clipsById.get(item.clipId) || {}, section.id)).join("") : `<li class="video-analysis-muted">No clips selected.</li>`}
      </ol>
    </section>
  `;
}

function taggedSessions(state = {}) {
  const items = buildVideoLibraryItems(state)
    .filter((item) => item.kind === "match" && item.hasVideo && Number(item.clipCount || 0) > 0);
  if (items.length || !state.match?.id || !Number((state.clips || []).length)) return items;
  return [{
    key: `match:${state.match.id}`,
    id: state.match.id,
    title: state.match.title || "Current session",
    matchDate: state.match.match_date || state.match.matchDate || "",
    eventType: state.match.event_type || state.match.eventType || "match",
    clipCount: (state.clips || []).length,
  }];
}

function renderTaggedSession(item = {}, state = {}) {
  const active = item.id && state.match?.id === item.id;
  return `
    <button type="button" class="video-analysis-presentation-session${active ? " is-active" : ""}"
      data-video-analysis-presentation-session="${escapeHtml(item.key)}">
      <span>${escapeHtml(item.title || "Untitled session")}</span>
      <small>${escapeHtml(`${formatDate(item.matchDate)} - ${eventTypeLabel(item.eventType)} - ${item.clipCount || 0} clips`)}</small>
    </button>
  `;
}

function renderTaggedSessionList(state = {}) {
  const sessions = taggedSessions(state);
  return `
    <aside class="video-analysis-presentation-sessions" aria-label="Tagged matches and training">
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Tagged sessions</p>
          <h3>${escapeHtml(`${sessions.length} ready`)}</h3>
        </div>
      </div>
      <div class="video-analysis-presentation-session-list">
        ${sessions.length
          ? sessions.map((item) => renderTaggedSession(item, state)).join("")
          : `<p class="video-analysis-muted">No tagged matches or training sessions yet.</p>`}
      </div>
    </aside>
  `;
}

export function renderPresentationModule(state = {}) {
  const clipsById = new Map((state.clips || []).map((clip) => [clip.id, clip]));
  const sections = Array.isArray(state.reviewSections) ? state.reviewSections : [];
  return `
    <section class="video-analysis-presentation" data-video-analysis-presentation-module>
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Presentation</p>
          <h3>${escapeHtml(state.reviewTitle || "Football Science Review")}</h3>
        </div>
        <div class="video-analysis-presentation-actions">
          <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
          <button type="button" class="video-analysis-primary-action" data-video-analysis-load>Link local video</button>
          <button type="button" data-video-analysis-save-review ${state.canEdit ? "" : "disabled"}>Save presentation</button>
        </div>
      </div>
      <div class="video-analysis-presentation-board">
        ${renderTaggedSessionList(state)}
        <section class="video-analysis-presentation-library" aria-label="Presentation clip library">
          ${renderClipFilters(state)}
          ${renderClipIntelligence(state)}
          ${renderClipList(state)}
        </section>
      </div>
      <div class="video-analysis-presentation-sections">
        ${sections.map((section) => renderPresentationSection(section, clipsById, state.activeReviewSectionId)).join("")}
      </div>
    </section>
  `;
}
