const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function defaultParseDateValue(dateValue) {
  return new Date(dateValue);
}

function defaultFormatDateValue(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function createSessionPlannerWorkspaceRenderer({
  escapeHtml = defaultEscapeHtml,
  formatDateValue = defaultFormatDateValue,
  parseDateValue = defaultParseDateValue,
  periodizationOptionLibrary = {},
  renderSessionPlannerActionIcon,
  renderSessionPlannerBlockList,
  renderSessionPlannerDateStrip,
  renderSessionPlannerEditableField,
  renderSessionPlannerExerciseVisual,
  renderSessionPlannerHeaderField,
  renderSessionPlannerLibraryOverlay,
  renderSessionPlannerLibrarySaveConflictOverlay,
  renderSessionPlannerMedicalAvailability,
  renderSessionPlannerPeriodizationOverlay,
  renderSessionPlannerPeriodizationSummary,
  renderSessionPlannerPlayerBoard,
  renderSessionPlannerPlayerBoardOverlay,
  renderSessionPlannerPostSessionNotesCard,
  renderSessionPlannerPrintOverlay,
  renderSessionPlannerTacticalboardOverlay,
  renderSessionPlannerVisualPreviewOverlay,
} = {}) {
  function getDateLabel(dateValue, options = {}) {
    return new Intl.DateTimeFormat("en-GB", options).format(parseDateValue(dateValue));
  }

  function renderDateStrip({ selectedDate = "", sessions = {}, hasScheduledSession = () => false } = {}) {
    const selectedDateObject = parseDateValue(selectedDate);
    const startDate = new Date(selectedDateObject);
    startDate.setDate(selectedDateObject.getDate() - 10);
    return Array.from({ length: 21 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      const dateValue = formatDateValue(date);
      const isSelected = dateValue === selectedDate;
      const hasSession = Boolean(sessions?.[dateValue]?.blocks?.length) || Boolean(hasScheduledSession(dateValue));
      return `
      <button
        type="button"
        class="session-date-pill${isSelected ? " is-active" : ""}${hasSession ? " has-session" : ""}"
        data-session-date="${escapeHtml(dateValue)}"
      >
        <span>${escapeHtml(getDateLabel(dateValue, { weekday: "short" }))}</span>
        <strong>${escapeHtml(getDateLabel(dateValue, { day: "numeric" }))}</strong>
        <em>${escapeHtml(getDateLabel(dateValue, { month: "short" }))}</em>
      </button>
    `;
    }).join("");
  }

  function renderMedicalAvailability(availability = {}) {
    const buckets = [0, 10, 25, 50, 75, 100].map((participation) => ({
      participation,
      count: (availability.all ?? []).filter((item) => item.record && item.participation === participation).length,
    }));
    const summaryParts = [
      `${availability.available?.length ?? 0} available`,
      `${availability.limited?.length ?? 0} limited`,
    ];
    if ((availability.unconfirmed?.length ?? 0) > 0) {
      summaryParts.push(`${availability.unconfirmed.length} not set`);
    }
    const summaryLabel = summaryParts.join(" / ");
    return `
    <section class="session-medical-availability" aria-label="Medical availability for selected session">
      <header>
        <div>
          <span>Medical availability</span>
          <strong>${escapeHtml(summaryLabel)}</strong>
        </div>
      </header>
      <div class="session-medical-summary">
        ${buckets
          .map(
            (bucket) => `
<span class="session-medical-bucket is-availability-${bucket.participation}${bucket.count ? " has-count" : ""}">
<strong>${bucket.participation}%</strong>
<small>${bucket.count}</small>
</span>
`
          )
          .join("")}
      </div>
    </section>
  `;
  }

  const renderHistoryPanel = ({
    entries = [],
    isAdmin = false,
    isLoading = false,
    loadedDate = "",
    loadError = "",
    open = false,
    selectedDate = "",
    formatHistoryTime,
    getHistoryActionLabel,
    getHistoryActorLabel,
  } = {}) => {
    if (!isAdmin) {
      return "";
    }
    const visibleEntries = entries.filter((entry) => entry.date === selectedDate).slice(0, 6);
    let body = "";
    if (isLoading && loadedDate !== selectedDate) {
      body = `<p class="session-history-empty">Loading versions...</p>`;
    } else if (loadError) {
      body = `<p class="session-history-empty is-error">${escapeHtml(loadError)}</p>`;
    } else if (!visibleEntries.length) {
      body = `<p class="session-history-empty">No versions saved for this date yet. New changes will be tracked from now.</p>`;
    } else {
      body = visibleEntries
        .map((entry) => {
          const beforeCount = Number(entry.beforeBlockCount) || 0;
          const afterCount = Number(entry.afterBlockCount) || 0;
          const restoreLabel = entry.beforeSession ? "Restore" : "Undo";
          return `
          <article class="session-history-row">
            <div>
              <strong>${escapeHtml(getHistoryActionLabel(entry.action))}</strong>
              <span>${escapeHtml(beforeCount)} &rarr; ${escapeHtml(afterCount)} blocks</span>
              <small>${escapeHtml(getHistoryActorLabel(entry))} &middot; ${escapeHtml(formatHistoryTime(entry.createdAt))}</small>
            </div>
            <button type="button" data-session-restore-history="${escapeHtml(entry.id)}">${escapeHtml(restoreLabel)}</button>
          </article>
        `;
        })
        .join("");
    }
    return `
    <section class="session-tool-panel session-history-panel${open ? " is-open" : " is-collapsed"}">
      <div class="session-tool-panel-head session-history-head">
        <button type="button" class="session-history-toggle" data-session-toggle-history aria-expanded="${open ? "true" : "false"}">
          <div>
            <span>Version history</span>
            <strong>Session restore</strong>
          </div>
          <small>${open ? "Hide" : "Show"}</small>
        </button>
        ${open ? `<button type="button" data-session-refresh-history>Refresh</button>` : ""}
      </div>
      ${open ? `<div class="session-history-list">${body}</div>` : ""}
    </section>
  `;
  };

  const renderToolsPanel = (block, historyContext = {}) => {
    if (!block) {
      return `
      <aside class="session-card session-tools-card">
        <div class="session-card-head">
          <div>
            <span>Detail</span>
            <h2>Exercise Tools</h2>
          </div>
        </div>
        <p class="session-empty-state">Select a block to work with media and player setup.</p>
        ${renderHistoryPanel(historyContext)}
      </aside>
    `;
    }
    return `
    <aside class="session-card session-tools-card">
      <section class="session-tool-panel">
        <div class="session-tool-panel-head">
          <span>Board</span>
          <strong>Exercise visual</strong>
        </div>
        <div class="session-media-drop">
          <div class="session-media-preview">
            ${renderSessionPlannerExerciseVisual(block)}
          </div>
          <div class="session-media-actions">
            <button type="button" data-session-preview-visual>
              ${renderSessionPlannerActionIcon("eye")}
              <span>Preview</span>
            </button>
            <button type="button" data-session-open-tacticalboard>
              ${renderSessionPlannerActionIcon("pencil")}
              <span>Edit</span>
            </button>
            <label class="session-media-upload-button">
              ${renderSessionPlannerActionIcon("upload")}
              <span>Upload</span>
              <input class="session-upload-input" type="file" accept="image/*" data-session-upload-visual />
            </label>
          </div>
        </div>
      </section>
      ${renderSessionPlannerPlayerBoard(block)}
      ${renderHistoryPanel(historyContext)}
    </aside>
  `;
  };

  const renderLeaderboardAwardAction = (action = {}) => {
    if (!action?.visible) return "";
    const command = action.command && typeof action.command === "object" ? action.command : null;
    const enabled = Boolean(action.enabled && command?.occurredOn && command?.title);
    const reason = String(action.reason ?? "").trim();
    const statusLabel = String(action.statusLabel ?? "").trim();
    if (!enabled) {
      const accessibleLabel = reason ? `Award points. ${reason}` : "Award points is unavailable.";
      return `
        <button
          type="button"
          class="session-print-open-button session-leaderboard-award-button"
          data-session-open-leaderboard-award
          data-session-leaderboard-award-enabled="false"
          disabled
          aria-disabled="true"
          aria-label="${escapeHtml(accessibleLabel)}"
          title="${escapeHtml(reason || accessibleLabel)}"
        >Award points${statusLabel ? ` · ${escapeHtml(statusLabel)}` : ""}</button>
      `;
    }
    return `
      <button
        type="button"
        class="session-print-open-button session-leaderboard-award-button"
        data-session-open-leaderboard-award
        data-session-leaderboard-award-enabled="true"
        data-session-leaderboard-award-date="${escapeHtml(command.occurredOn)}"
        data-session-leaderboard-award-title="${escapeHtml(command.title)}"
      >Award points</button>
    `;
  };

  const renderWorkspace = ({
    addMenuOpen = false,
    block = null,
    historyContext = {},
    isAdmin = false,
    leaderboardAwardAction = {},
    selectedDate = "",
    selectedDateLabel = "",
    session = {},
    sessionMatchDayLabel = "",
    sessionTitle = "Session",
    sessionTotalMinutes = 0,
  } = {}) => {
    const sessionTitleLength = String(sessionTitle).trim().length;
    const sessionTitleSizeClass =
      sessionTitleLength > 28 ? " is-very-long" : sessionTitleLength > 16 ? " is-long" : "";

    return `
    <header class="session-planner-hero">
      <div>
        <p class="placeholder-tag">Sessions</p>
        <h1>Session Planner</h1>
      </div>
      <div class="session-date-controls" aria-label="Session date navigation">
        <button type="button" class="session-date-nav-button" data-session-scroll-dates="-1" aria-label="Previous dates">&larr;</button>
        <div class="session-date-strip" aria-label="Session date selector">
          ${renderSessionPlannerDateStrip()}
        </div>
        <button type="button" class="session-date-nav-button" data-session-scroll-dates="1" aria-label="Next dates">&rarr;</button>
        <button type="button" class="session-date-today-button" data-session-today>Today</button>
      </div>
    </header>
    <section class="session-planner-grid">
      <aside class="session-card session-blocks-card">
        <div class="session-card-head">
          <div>
            <span>${escapeHtml(selectedDateLabel)}</span>
            <h2 class="session-overview-title${sessionTitleSizeClass}">${escapeHtml(sessionTitle)}</h2>
            <div class="session-planner-summary-chips">
              ${sessionMatchDayLabel ? `<strong class="session-matchday-chip">(${escapeHtml(sessionMatchDayLabel)})</strong>` : ""}
              <strong class="session-total-time-chip" aria-label="Total training time">
                <span>Total time</span>
                <b>${sessionTotalMinutes || 0} min</b>
              </strong>
            </div>
          </div>
          <div class="session-card-actions">
            <button type="button" class="session-print-open-button" data-session-open-print>Print</button>
            ${renderLeaderboardAwardAction(leaderboardAwardAction)}
            ${
              isAdmin
                ? `
<div class="session-add-menu-wrap">
<button
type="button"
class="session-add-block-button"
data-session-add-menu-toggle
aria-label="Add exercise"
aria-expanded="${addMenuOpen ? "true" : "false"}"
>+</button>
${
  addMenuOpen
    ? `
                          <div class="session-add-menu" role="menu">
                            <button type="button" data-session-add-new>
                              <strong>New exercise</strong>
                              <span>Start from a clean block</span>
                            </button>
                            <button type="button" data-session-add-from-library>
                              <strong>From Library</strong>
                              <span>Use a saved exercise template</span>
                            </button>
                            <button type="button" data-session-add-tacticalboard>
                              <strong>Tacticalboard</strong>
                              <span>Create and draw directly</span>
                            </button>
                          </div>
                        `
    : ""
}
</div>
`
                : ""
            }
          </div>
        </div>
        <div class="session-block-list">
          ${renderSessionPlannerPeriodizationSummary(selectedDate)}
          ${renderSessionPlannerMedicalAvailability(selectedDate)}
          ${renderSessionPlannerBlockList(session)}
        </div>
      </aside>
      <main class="session-card session-builder-card">
        ${
          block
            ? `
<div class="session-builder-head">
<div>
<span>${escapeHtml(block.label)}</span>
${renderSessionPlannerHeaderField(block, "title", "New Exercise", {
  tag: "textarea",
  className: "session-builder-title-input",
})}
${renderSessionPlannerHeaderField(block, "focus", "Add the focus for this exercise.", {
  tag: "textarea",
  className: "session-builder-focus-input",
})}
</div>
<div class="session-builder-side-actions">
<div class="session-builder-metrics">
${renderSessionPlannerEditableField(block, "minutes", "Minutes", { long: false, type: "number" })}
</div>
${
  isAdmin
    ? `
                        <div class="session-builder-action-row">
                          <button type="button" class="session-builder-action-button session-builder-action-button-save" data-session-save-exercise>Save</button>
                          <button type="button" class="session-builder-action-button" data-session-open-library>Library</button>
                          <button
                            type="button"
                            class="session-builder-action-button session-builder-action-button-danger"
                            data-session-delete-block="${escapeHtml(block.id)}"
                          >
                            Delete
                          </button>
                        </div>
                      `
    : ""
}
</div>
</div>
<section class="session-builder-main">
<article class="session-detail-card session-detail-card-full">
<div class="session-builder-fields">
${renderSessionPlannerEditableField(block, "phase", "Phase", { long: false, listOptions: periodizationOptionLibrary.matchPhases })}
${renderSessionPlannerEditableField(block, "subPhase", "Sub Phase", { long: false, listOptions: periodizationOptionLibrary.subPhases })}
${renderSessionPlannerEditableField(block, "objective", "Objective", { rows: 3 })}
${renderSessionPlannerEditableField(block, "why", "Why", { rows: 3 })}
${renderSessionPlannerEditableField(block, "organization", "Organization", { rows: 3 })}
${renderSessionPlannerEditableField(block, "material", "Measure & Material", { rows: 2 })}
${renderSessionPlannerEditableField(block, "principles", "Principles & Coaching Points", { rows: 5 })}
</div>
</article>
${renderSessionPlannerPostSessionNotesCard(block)}
</section>
`
            : `<p class="session-empty-state">Add a block to start building this session.</p>`
        }
      </main>
      ${renderToolsPanel(block, historyContext)}
    </section>
    ${renderSessionPlannerPeriodizationOverlay()}
    ${renderSessionPlannerLibraryOverlay()}
    ${renderSessionPlannerLibrarySaveConflictOverlay()}
    ${renderSessionPlannerVisualPreviewOverlay(block)}
    ${renderSessionPlannerTacticalboardOverlay(block)}
    ${renderSessionPlannerPlayerBoardOverlay(block)}
    ${renderSessionPlannerPrintOverlay(session)}
  `;
  };

  return {
    renderDateStrip,
    renderHistoryPanel,
    renderMedicalAvailability,
    renderToolsPanel,
    renderWorkspace,
  };
}
