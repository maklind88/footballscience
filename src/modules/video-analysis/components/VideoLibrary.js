import { buildVideoLibraryItems, filterVideoLibraryItems, videoLibraryResultPage } from "../services/videoLibraryService.js";
import { escapeHtml } from "./renderHelpers.js";
import { renderVideoArchiveResults } from "./VideoArchiveResults.js";

function eventTypeLabel(type = "") {
  return String(type || "").toLowerCase() === "match" ? "Match" : "Training";
}

function formatDate(value = "") {
  if (!value) return "No date";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function monthLabel(value = "") {
  if (!value) return "No date";
  const [year, month] = String(value).split("-");
  if (!year || !month) return value;
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${labels[Math.max(0, Number(month) - 1)] || month} ${year}`;
}

function isoMonth(value = "") {
  const [year, month] = String(value || "").split("-");
  return year && month ? `${year}-${month}` : "";
}

function currentIsoMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function currentIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function addMonths(month = "", offset = 0) {
  const [year, monthNumber] = String(month || "").split("-").map((part) => Number(part));
  if (!year || !monthNumber) return currentIsoMonth();
  const date = new Date(Date.UTC(year, monthNumber - 1 + Number(offset || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthDateValue(month = "", day = 1) {
  const [year, monthNumber] = String(month || "").split("-");
  const safeDay = String(day).padStart(2, "0");
  return year && monthNumber ? `${year}-${monthNumber}-${safeDay}` : "";
}

function daysInMonth(month = "") {
  const [year, monthNumber] = String(month || "").split("-").map((part) => Number(part));
  if (!year || !monthNumber) return 30;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function monthStartOffset(month = "") {
  const [year, monthNumber] = String(month || "").split("-").map((part) => Number(part));
  if (!year || !monthNumber) return 0;
  const sundayFirst = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

function itemStatus(item = {}) {
  if (!item.hasVideo) return { key: "missing", label: "Needs video", tone: "warning" };
  if (Number(item.clipCount || 0) > 0) return { key: "analysis", label: `${item.clipCount} clips`, tone: "success" };
  return { key: "ready", label: "Ready to analyse", tone: "ready" };
}

function isLibrarySearchActive(filters = {}) {
  return Boolean(
    String(filters.search || "").trim()
    || String(filters.date || "").trim()
    || (String(filters.type || "all").trim() && String(filters.type || "all").trim() !== "all")
  );
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

function renderCalendarEvent(item = {}) {
  const status = itemStatus(item);
  return `
    <button
      type="button"
      class="video-analysis-calendar-event is-${escapeHtml(status.tone)}"
      data-video-analysis-open-library-item="${escapeHtml(item.key)}"
      title="${escapeHtml(item.title)}"
    >
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(status.label)}</small>
    </button>
  `;
}

function renderCalendarDay(date = "", items = [], count = items.length) {
  const day = Number(String(date).slice(-2)) || "";
  const isToday = date === currentIsoDate();
  const preview = items.slice(0, 2);
  return `
    <div role="listitem" class="video-analysis-calendar-day${items.length ? " has-items" : ""}${isToday ? " is-today" : ""}" aria-label="${escapeHtml(`${isToday ? "Today, " : ""}${formatDate(date)}`)}">
      <button type="button" class="video-analysis-calendar-day__number" data-video-analysis-calendar-day="${escapeHtml(date)}" aria-label="${escapeHtml(`Show activities for ${formatDate(date)}`)}" ${isToday ? 'aria-current="date"' : ""}>${escapeHtml(String(day))}</button>
      ${preview.map((item) => renderCalendarEvent(item)).join("")}
      ${count > preview.length ? `<button type="button" class="video-analysis-calendar-more" data-video-analysis-calendar-day="${escapeHtml(date)}" aria-label="${escapeHtml(`Show all ${count} activities for ${formatDate(date)}`)}">+${count - preview.length}</button>` : ""}
    </div>
  `;
}

function renderCalendarOverview(visibleItems = [], filters = {}, calendar = {}) {
  const month = isoMonth(filters.calendarMonth) || isoMonth(filters.date) || currentIsoMonth();
  const todayMonth = currentIsoMonth();
  const previousMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);
  const itemsByDate = new Map();
  const counts = new Map((calendar.days || []).map((day) => [day.date, day.count]));
  for (const item of visibleItems) {
    if (isoMonth(item.matchDate) !== month) continue;
    const list = itemsByDate.get(item.matchDate) || [];
    list.push(item);
    itemsByDate.set(item.matchDate, list);
  }
  const leadingDays = Array.from({ length: monthStartOffset(month) }, () => "");
  const monthDays = Array.from({ length: daysInMonth(month) }, (_, index) => monthDateValue(month, index + 1));
  const totalCells = Math.ceil((leadingDays.length + monthDays.length) / 7) * 7;
  const trailingDays = Array.from({ length: totalCells - leadingDays.length - monthDays.length }, () => "");
  const cells = [...leadingDays, ...monthDays, ...trailingDays];
  return `
    <section class="video-analysis-calendar-overview" aria-label="Video calendar overview">
      <div class="video-analysis-calendar-overview__header">
        <div>
          <p class="video-analysis-kicker">Video calendar</p>
          <h2>${escapeHtml(monthLabel(`${month}-01`))}</h2>
        </div>
        <div class="video-analysis-calendar-actions" aria-label="Calendar month navigation">
          <button type="button" data-video-analysis-calendar-month="${escapeHtml(previousMonth)}" aria-label="Previous month">
            <span aria-hidden="true">&#8249;</span>
          </button>
          <button type="button" data-video-analysis-calendar-month="${escapeHtml(todayMonth)}">Today</button>
          <button type="button" data-video-analysis-calendar-month="${escapeHtml(nextMonth)}" aria-label="Next month">
            <span aria-hidden="true">&#8250;</span>
          </button>
        </div>
      </div>
      <div class="video-analysis-calendar-weekdays" aria-hidden="true">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="video-analysis-calendar-month" role="list">
        ${cells.map((date) => date
          ? renderCalendarDay(date, itemsByDate.get(date) || [], counts.has(date)
            ? counts.get(date) + (itemsByDate.get(date) || []).filter((item) => item.kind === "schedule-candidate").length
            : (itemsByDate.get(date) || []).length)
          : `<div class="video-analysis-calendar-day is-empty" aria-hidden="true"></div>`).join("")}
      </div>
    </section>
  `;
}

function renderLibrarySearch(library = {}, visibleCount = 0, isActive = false) {
  return `
    <section class="video-analysis-library-search${isActive ? " is-active" : ""}" aria-label="Search videos and match days">
      <input
        type="search"
        maxlength="120"
        placeholder="Search day, video, match, team or date"
        value="${escapeHtml(library.filters?.search || "")}"
        data-video-analysis-library-filter="search"
        aria-label="Search day, video, match, team or date"
      >
      <div class="video-analysis-library-search__filters">
        <input
          type="date"
          value="${escapeHtml(library.filters?.date || "")}"
          data-video-analysis-library-filter="date"
          aria-label="Filter by date"
        >
        <select data-video-analysis-library-filter="type" aria-label="Filter by type">
          <option value="all" ${!library.filters?.type || library.filters?.type === "all" ? "selected" : ""}>All</option>
          <option value="match" ${library.filters?.type === "match" ? "selected" : ""}>Matches</option>
          <option value="training" ${library.filters?.type === "training" ? "selected" : ""}>Training</option>
        </select>
        <button type="button" data-video-analysis-library-refresh ${library.status === "loading" ? "disabled" : ""}>Refresh</button>
      </div>
      ${isActive && !library.remote ? `<span>${escapeHtml(`${visibleCount} results`)}</span>` : ""}
    </section>
  `;
}

function renderLibraryStatus(library = {}) {
  if (library.status === "loading") return `<p class="video-analysis-library-status" role="status">Loading video calendar...</p>`;
  if (!library.error) return "";
  return `<div class="video-analysis-library-status is-error" role="alert">
    <span>${escapeHtml(library.error)}</span>
    <button type="button" data-video-analysis-library-refresh>Retry</button>
  </div>`;
}

function renderResultNavigation(resultPage = {}) {
  if (resultPage.pageCount <= 1) return "";
  return `<nav class="video-analysis-library-pagination" aria-label="Search result pages">
    <button type="button" data-video-analysis-library-page="${resultPage.page - 1}" aria-label="Previous results" title="Previous results" ${resultPage.page === 0 ? "disabled" : ""}><span aria-hidden="true">&#8249;</span></button>
    <span role="status">${resultPage.page + 1} / ${resultPage.pageCount}</span>
    <button type="button" data-video-analysis-library-page="${resultPage.page + 1}" aria-label="Next results" title="Next results" ${resultPage.page === resultPage.pageCount - 1 ? "disabled" : ""}><span aria-hidden="true">&#8250;</span></button>
  </nav>`;
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
  const localItems = library.remote ? allItems.filter((item) => item.kind === "schedule-candidate") : allItems;
  const visibleItems = filterVideoLibraryItems(localItems, library.filters || {});
  const calendarItems = library.remote ? [...allItems.filter((item) => item.kind === "match"), ...visibleItems] : visibleItems;
  const searchIsActive = isLibrarySearchActive(library.filters || {});
  const resultPage = videoLibraryResultPage(visibleItems, library.resultPage);
  const archiveItems = resultPage.items;
  return `
    <section class="video-analysis-library" data-video-analysis-library aria-busy="${library.status === "loading"}">
      ${renderLibrarySearch(library, visibleItems.length, searchIsActive)}
      ${renderLibraryStatus(library)}
      ${renderCalendarOverview(calendarItems, library.filters || {}, library.remote ? library.calendar : {})}
      ${searchIsActive && library.remote ? renderVideoArchiveResults(state, renderLibraryRow) : ""}
      ${searchIsActive && (!library.remote || visibleItems.length || (library.archive?.status === "ready" && !library.archive?.matches?.length)) ? `
        <section class="video-analysis-library-archive" aria-label="Search results">
        <div class="video-analysis-panel-title">
          <div>
            <p class="video-analysis-kicker">Results</p>
            <h3 tabindex="-1" data-video-analysis-library-results-title>${library.remote ? "Schedule activities" : "Matches, training & videos"}</h3>
          </div>
          <span>${escapeHtml(`${resultPage.start}-${resultPage.end} of ${visibleItems.length}`)}</span>
        </div>
        <div class="video-analysis-library__list">
          ${archiveItems.length
            ? archiveItems.map((item) => renderLibraryRow(item, state)).join("")
            : `<p class="video-analysis-muted">No matches or training sessions found.</p>`}
        </div>
        ${renderResultNavigation(resultPage)}
        </section>
      ` : ""}
    </section>
  `;
}
