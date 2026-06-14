import { buildVideoLibraryItems, filterVideoLibraryItems } from "../services/videoLibraryService.js";
import { escapeHtml } from "./renderHelpers.js";

function eventTypeLabel(type = "") {
  return String(type || "").toLowerCase() === "match" ? "Match" : "Training";
}

function formatDate(value = "") {
  if (!value) return "No date";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function renderScheduleOptions(candidates = [], selectedId = "") {
  const options = candidates
    .map((candidate) => `
      <option value="${escapeHtml(candidate.scheduleEventId)}" ${candidate.scheduleEventId === selectedId ? "selected" : ""}>
        ${escapeHtml(`${formatDate(candidate.matchDate)} - ${eventTypeLabel(candidate.eventType)} - ${candidate.title}`)}
      </option>
    `)
    .join("");
  return `<option value="">No schedule day</option>${options}`;
}

function renderMatchControls(item = {}, candidates = [], canEdit = false) {
  const scheduleOptions = renderScheduleOptions(candidates, item.scheduleEventId);
  return `
    <div class="video-analysis-library-row__controls" aria-label="Saved day link">
      <label>
        <span>Schedule</span>
        <select data-video-analysis-link-schedule="${escapeHtml(item.id)}" ${canEdit ? "" : "disabled"}>
          ${scheduleOptions}
        </select>
      </label>
      <label>
        <span>Date</span>
        <input type="date" value="${escapeHtml(item.matchDate)}" data-video-analysis-link-date="${escapeHtml(item.id)}" ${canEdit ? "" : "disabled"}>
      </label>
      <label>
        <span>Type</span>
        <select data-video-analysis-link-type="${escapeHtml(item.id)}" ${canEdit ? "" : "disabled"}>
          <option value="match" ${item.eventType === "match" ? "selected" : ""}>Match</option>
          <option value="training" ${item.eventType === "training" ? "selected" : ""}>Training</option>
        </select>
      </label>
    </div>
  `;
}

function renderLibraryRow(item = {}, state = {}) {
  const isScheduleCandidate = item.kind === "schedule-candidate";
  const isSaving = state.library?.savingLinkId === item.id;
  const candidates = state.library?.scheduleCandidates || [];
  const meta = [
    formatDate(item.matchDate),
    eventTypeLabel(item.eventType),
    item.opponent,
    item.location || item.venue,
  ].filter(Boolean).join(" · ");
  const stats = item.hasVideo
    ? `${item.clipCount} clips · ${item.sourceCount || item.videoCount || 1} local video${(item.sourceCount || item.videoCount) === 1 ? "" : "s"}`
    : "No video linked";
  return `
    <article class="video-analysis-library-row${item.hasVideo ? " has-video" : " is-schedule-candidate"}">
      <button type="button" class="video-analysis-library-row__main" data-video-analysis-open-library-item="${escapeHtml(item.key)}">
        <span class="video-analysis-library-row__date">${escapeHtml(formatDate(item.matchDate))}</span>
        <span class="video-analysis-library-row__body">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(meta)}</small>
        </span>
        <span class="video-analysis-library-row__status">${escapeHtml(isScheduleCandidate ? "Schedule day" : stats)}</span>
      </button>
      ${isScheduleCandidate ? `
        <div class="video-analysis-library-row__hint">Open this day and link the local match/training video once.</div>
      ` : renderMatchControls(item, candidates, state.canEdit)}
      ${isSaving ? `<span class="video-analysis-library-row__saving">Saving day link</span>` : ""}
    </article>
  `;
}

export function renderVideoLibrary(state = {}) {
  const library = state.library || {};
  const allItems = buildVideoLibraryItems(state);
  const visibleItems = filterVideoLibraryItems(allItems, library.filters || {});
  const hasScheduleCandidates = (library.scheduleCandidates || []).length > 0;
  return `
    <section class="video-analysis-library" data-video-analysis-library>
      <div class="video-analysis-library__header">
        <div>
          <p class="video-analysis-kicker">Video Library</p>
          <h2>Matches & training</h2>
        </div>
        <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
        <button type="button" class="video-analysis-primary-action" data-video-analysis-load>Link local video</button>
      </div>
      <div class="video-analysis-library__toolbar">
        <input
          type="search"
          placeholder="Search match, training or date"
          value="${escapeHtml(library.filters?.search || "")}"
          data-video-analysis-library-filter="search"
        >
        <input
          type="date"
          value="${escapeHtml(library.filters?.date || "")}"
          data-video-analysis-library-filter="date"
        >
        <select data-video-analysis-library-filter="type">
          <option value="all" ${!library.filters?.type || library.filters?.type === "all" ? "selected" : ""}>All</option>
          <option value="match" ${library.filters?.type === "match" ? "selected" : ""}>Matches</option>
          <option value="training" ${library.filters?.type === "training" ? "selected" : ""}>Training</option>
        </select>
        <button type="button" data-video-analysis-library-refresh>Refresh</button>
      </div>
      ${hasScheduleCandidates ? `
        <div class="video-analysis-library__note">
          Schedule days are available as video candidates. Pick a day or connect an existing video row to a schedule day.
        </div>
      ` : ""}
      <div class="video-analysis-library__list">
        ${visibleItems.length
          ? visibleItems.map((item) => renderLibraryRow(item, state)).join("")
          : `<p class="video-analysis-muted">No matches or training sessions found.</p>`}
      </div>
    </section>
  `;
}
