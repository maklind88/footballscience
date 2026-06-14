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

function monthDateValue(month = "", day = 1) {
  const [year, monthNumber] = String(month || "").split("-");
  const safeDay = String(day).padStart(2, "0");
  return year && monthNumber ? `${year}-${monthNumber}-${safeDay}` : "";
}

function calendarMonthForItems(items = []) {
  const dated = items
    .map((item) => item.matchDate)
    .filter(Boolean)
    .sort((first, second) => String(second).localeCompare(String(first)));
  return isoMonth(dated[0]) || isoMonth(new Date().toISOString().slice(0, 10));
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

function renderCalendarDay(date = "", items = []) {
  const day = Number(String(date).slice(-2)) || "";
  const preview = items.slice(0, 2);
  return `
    <div class="video-analysis-calendar-day${items.length ? " has-items" : ""}" aria-label="${escapeHtml(formatDate(date))}">
      <span class="video-analysis-calendar-day__number">${escapeHtml(String(day))}</span>
      ${preview.map((item) => renderCalendarEvent(item)).join("")}
      ${items.length > preview.length ? `<span class="video-analysis-calendar-more">+${items.length - preview.length}</span>` : ""}
    </div>
  `;
}

function renderCalendarOverview(allItems = [], visibleItems = []) {
  const sourceItems = visibleItems.length ? visibleItems : allItems;
  const month = calendarMonthForItems(sourceItems);
  const itemsByDate = new Map();
  for (const item of sourceItems) {
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
  const monthItems = [...itemsByDate.values()].flat();
  return `
    <section class="video-analysis-calendar-overview" aria-label="Video calendar overview">
      <div class="video-analysis-calendar-overview__header">
        <div>
          <p class="video-analysis-kicker">Video calendar</p>
          <h2>${escapeHtml(monthLabel(`${month}-01`))}</h2>
        </div>
        <span>${escapeHtml(`${monthItems.length} in view`)}</span>
      </div>
      <div class="video-analysis-calendar-weekdays" aria-hidden="true">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="video-analysis-calendar-month" role="list">
        ${cells.map((date) => date
          ? renderCalendarDay(date, itemsByDate.get(date) || [])
          : `<div class="video-analysis-calendar-day is-empty" aria-hidden="true"></div>`).join("")}
      </div>
    </section>
  `;
}

function renderLibrarySearch(library = {}, visibleCount = 0, isActive = false) {
  return `
    <section class="video-analysis-library-search${isActive ? " is-active" : ""}" aria-label="Search videos and match days">
      <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
      <input
        type="search"
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
        <button type="button" data-video-analysis-library-refresh>Refresh</button>
        <button type="button" class="video-analysis-primary-action" data-video-analysis-load>Link local video</button>
      </div>
      ${isActive ? `<span>${escapeHtml(`${visibleCount} results`)}</span>` : ""}
    </section>
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
  const searchIsActive = isLibrarySearchActive(library.filters || {});
  const archiveItems = visibleItems.slice(0, 8);
  return `
    <section class="video-analysis-library" data-video-analysis-library>
      ${renderCalendarOverview(allItems, visibleItems)}
      ${renderLibrarySearch(library, visibleItems.length, searchIsActive)}
      ${searchIsActive ? `
        <section class="video-analysis-library-archive" aria-label="Search results">
        <div class="video-analysis-panel-title">
          <div>
            <p class="video-analysis-kicker">Results</p>
            <h3>Matches, training & videos</h3>
          </div>
          <span>${escapeHtml(`${archiveItems.length} of ${visibleItems.length}`)}</span>
        </div>
        <div class="video-analysis-library__list">
          ${archiveItems.length
            ? archiveItems.map((item) => renderLibraryRow(item, state)).join("")
            : `<p class="video-analysis-muted">No matches or training sessions found.</p>`}
        </div>
        ${visibleItems.length > archiveItems.length
          ? `<p class="video-analysis-library-archive__hint">Showing the first ${archiveItems.length}. Use search, date or type to narrow the archive.</p>`
          : ""}
        </section>
      ` : ""}
    </section>
  `;
}
