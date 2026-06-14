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

function shortDate(value = "") {
  if (!value) return "TBD";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}` : value;
}

function monthLabel(value = "") {
  if (!value) return "No date";
  const [year, month] = String(value).split("-");
  if (!year || !month) return value;
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${labels[Math.max(0, Number(month) - 1)] || month} ${year}`;
}

function itemStatus(item = {}) {
  if (!item.hasVideo) return { key: "missing", label: "Needs video", tone: "warning" };
  if (Number(item.clipCount || 0) > 0) return { key: "analysis", label: `${item.clipCount} clips`, tone: "success" };
  return { key: "ready", label: "Ready to analyse", tone: "ready" };
}

function latestCalendarItems(items = []) {
  return [...items]
    .sort((first, second) => String(second.matchDate || "0000-00-00").localeCompare(String(first.matchDate || "0000-00-00")))
    .slice(0, 10)
    .reverse();
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

function renderOverviewMetric(label, value, detail = "") {
  return `
    <div class="video-analysis-overview-metric">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
}

function renderCalendarCard(item = {}) {
  const status = itemStatus(item);
  const meta = [eventTypeLabel(item.eventType), item.opponent || item.location || item.venue].filter(Boolean).join(" · ");
  return `
    <button
      type="button"
      class="video-analysis-calendar-card is-${escapeHtml(status.tone)}"
      data-video-analysis-open-library-item="${escapeHtml(item.key)}"
    >
      <span class="video-analysis-calendar-card__date">
        <strong>${escapeHtml(shortDate(item.matchDate))}</strong>
        <small>${escapeHtml(monthLabel(item.matchDate))}</small>
      </span>
      <span class="video-analysis-calendar-card__body">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(meta || "Own-team analysis")}</small>
      </span>
      <span class="video-analysis-calendar-card__status">${escapeHtml(status.label)}</span>
    </button>
  `;
}

function renderQueueColumn(label, items = [], tone = "neutral") {
  const preview = items.slice(0, 3);
  return `
    <article class="video-analysis-queue-card is-${escapeHtml(tone)}">
      <div class="video-analysis-queue-card__head">
        <span>${escapeHtml(label)}</span>
        <strong>${items.length}</strong>
      </div>
      <div class="video-analysis-queue-card__items">
        ${preview.length
          ? preview.map((item) => `
              <button type="button" data-video-analysis-open-library-item="${escapeHtml(item.key)}">
                <span>${escapeHtml(item.title)}</span>
                <small>${escapeHtml(formatDate(item.matchDate))}</small>
              </button>
            `).join("")
          : `<p>No sessions here.</p>`}
      </div>
    </article>
  `;
}

function renderOverviewDashboard(allItems = [], visibleItems = []) {
  const calendarItems = latestCalendarItems(visibleItems.length ? visibleItems : allItems);
  const withVideo = allItems.filter((item) => item.hasVideo);
  const needsVideo = allItems.filter((item) => !item.hasVideo);
  const ready = allItems.filter((item) => item.hasVideo && !Number(item.clipCount || 0));
  const inAnalysis = allItems.filter((item) => Number(item.clipCount || 0) > 0);
  const totalClips = allItems.reduce((sum, item) => sum + (Number(item.clipCount || 0) || 0), 0);
  const nextFocus = needsVideo[0] || ready[0] || inAnalysis[0] || allItems[0] || null;
  return `
    <section class="video-analysis-overview-hero" aria-label="Analysis overview">
      <div class="video-analysis-overview-hero__copy">
        <p class="video-analysis-kicker">Overview</p>
        <h2>Video calendar</h2>
        <p>See the analysis pipeline by match day instead of scrolling through every saved session.</p>
      </div>
      <div class="video-analysis-overview-metrics" aria-label="Video analysis summary">
        ${renderOverviewMetric("Sessions", String(allItems.length), `${visibleItems.length} shown`)}
        ${renderOverviewMetric("Video ready", String(withVideo.length), `${totalClips} clips`)}
        ${renderOverviewMetric("Needs link", String(needsVideo.length), "schedule days")}
      </div>
      <div class="video-analysis-overview-actions">
        <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
        <button type="button" class="video-analysis-primary-action" data-video-analysis-load>Link local video</button>
      </div>
    </section>
    <section class="video-analysis-overview-grid">
      <section class="video-analysis-calendar-panel" aria-label="Video calendar">
        <div class="video-analysis-panel-title">
          <div>
            <p class="video-analysis-kicker">Timeline</p>
            <h3>Match video calendar</h3>
          </div>
          <span>${escapeHtml(String(calendarItems.length))} visible</span>
        </div>
        <div class="video-analysis-calendar-strip">
          ${calendarItems.length
            ? calendarItems.map((item) => renderCalendarCard(item)).join("")
            : `<p class="video-analysis-muted">No matches or training sessions found.</p>`}
        </div>
      </section>
      <aside class="video-analysis-focus-panel" aria-label="Next analysis focus">
        <p class="video-analysis-kicker">Next focus</p>
        ${nextFocus ? `
          <h3>${escapeHtml(nextFocus.title)}</h3>
          <p>${escapeHtml([formatDate(nextFocus.matchDate), eventTypeLabel(nextFocus.eventType), nextFocus.opponent].filter(Boolean).join(" · "))}</p>
          <button type="button" data-video-analysis-open-library-item="${escapeHtml(nextFocus.key)}">Open session</button>
        ` : `
          <h3>No active sessions</h3>
          <p>Link a match or training video to start the room.</p>
        `}
      </aside>
    </section>
    <section class="video-analysis-work-queue" aria-label="Analysis work queue">
      ${renderQueueColumn("Needs video", needsVideo, "warning")}
      ${renderQueueColumn("Ready", ready, "ready")}
      ${renderQueueColumn("In analysis", inAnalysis, "success")}
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
  const hasScheduleCandidates = (library.scheduleCandidates || []).length > 0;
  const archiveItems = visibleItems.slice(0, 8);
  return `
    <section class="video-analysis-library" data-video-analysis-library>
      ${renderOverviewDashboard(allItems, visibleItems)}
      ${hasScheduleCandidates ? `
        <div class="video-analysis-library__note">
          Schedule days are available as video candidates. Pick a day or connect an existing video row to a schedule day.
        </div>
      ` : ""}
      <section class="video-analysis-library-archive" aria-label="Compact archive">
        <div class="video-analysis-panel-title">
          <div>
            <p class="video-analysis-kicker">Archive</p>
            <h3>Matches & training</h3>
          </div>
          <span>${escapeHtml(`${archiveItems.length} of ${visibleItems.length}`)}</span>
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
        <div class="video-analysis-library__list">
          ${archiveItems.length
            ? archiveItems.map((item) => renderLibraryRow(item, state)).join("")
            : `<p class="video-analysis-muted">No matches or training sessions found.</p>`}
        </div>
        ${visibleItems.length > archiveItems.length
          ? `<p class="video-analysis-library-archive__hint">Showing the first ${archiveItems.length}. Use search, date or type to narrow the archive.</p>`
          : ""}
      </section>
    </section>
  `;
}
