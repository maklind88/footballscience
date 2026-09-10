import { normalizeLibraryMatch } from "../services/videoLibraryService.js";
import { escapeHtml } from "./renderHelpers.js";

function pagination(page, previous, next, attribute, label, busy = false) {
  return `
    <nav class="video-analysis-archive-pagination" aria-label="${label}">
      <button type="button" ${attribute}="${page - 1}" aria-label="Previous ${label}" title="Previous page" ${!previous || busy ? "disabled" : ""}>
        <span aria-hidden="true">&#8249;</span>
      </button>
      <span>Page ${page + 1}</span>
      <button type="button" ${attribute}="${page + 1}" aria-label="Next ${label}" title="Next page" ${!next || busy ? "disabled" : ""}>
        <span aria-hidden="true">&#8250;</span>
      </button>
    </nav>`;
}

export function renderVideoArchiveResults(state, scheduleItems, renderRow) {
  const archive = state.library.archive;
  const items = (archive.matches || []).map(normalizeLibraryMatch);
  const loading = archive.status === "loading";
  const page = archive.page || 0;
  const schedulePage = Math.min(state.library.scheduleSearchPage || 0, Math.max(0, Math.ceil(scheduleItems.length / 8) - 1));
  const scheduleRows = scheduleItems.slice(schedulePage * 8, (schedulePage + 1) * 8);
  return `
    <section class="video-analysis-library-archive video-analysis-archive-results" aria-label="Video archive results" aria-busy="${loading}">
      <div class="video-analysis-panel-title">
        <h3 tabindex="-1" data-video-analysis-archive-results-title>Video archive</h3>
        ${pagination(page, page > 0, archive.hasMore, "data-video-analysis-archive-page", "archive results", loading)}
      </div>
      <p class="video-analysis-archive-status" role="status">${loading ? "Searching..." : archive.error ? escapeHtml(archive.error) : `${items.length} result${items.length === 1 ? "" : "s"} on this page`}</p>
      ${archive.error ? '<button type="button" data-video-analysis-archive-retry>Retry search</button>' : ""}
      <div class="video-analysis-library__list">
        ${items.map((item) => renderRow(item, state)).join("")}
      </div>
    </section>
    ${scheduleRows.length ? `
      <section class="video-analysis-library-archive video-analysis-archive-results" aria-label="Schedule search results">
        <div class="video-analysis-panel-title">
          <h3>Schedule days</h3>
          ${pagination(schedulePage, schedulePage > 0, (schedulePage + 1) * 8 < scheduleItems.length, "data-video-analysis-schedule-search-page", "schedule results")}
        </div>
        <div class="video-analysis-library__list">${scheduleRows.map((item) => renderRow(item, state)).join("")}</div>
      </section>` : ""}`;
}
