function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createSquadWorkspaceRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;

  function renderMessage(message) {
    if (!message) {
      return "";
    }
    if (typeof message === "string") {
      return `<div class="player-profile-message platform-inline-toast" role="status" aria-live="polite">${escapeHtml(message).replace(/\n/g, "<br>")}</div>`;
    }
    if (typeof message === "object") {
      const lines = Array.isArray(message.lines) ? message.lines.filter(Boolean) : [];
      const items = Array.isArray(message.items) ? message.items.filter(Boolean) : [];
      const status = message.status === "error"
        ? "is-error"
        : message.status === "warning"
          ? "is-warning"
          : message.status === "success"
            ? "is-success"
            : "";
      const body = [
        ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
        items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "",
      ].join("");
      return `<div class="player-profile-message ${status} platform-inline-toast" role="status" aria-live="polite">${body || ""}</div>`;
    }
    return "";
  }

  function renderPendingImport(plan, preview, canApply = false) {
    if (!plan || !preview) {
      return "";
    }
    const statusClass = preview.status === "error"
      ? "is-error"
      : preview.status === "warning"
        ? "is-warning"
        : "is-success";
    const rowItems = Array.isArray(preview.items) ? preview.items : [];
    return `
<section class="player-profile-import-preview ${statusClass}">
<div class="player-profile-import-preview-head">
<strong>Import preview</strong>
<span>${escapeHtml(preview.status || "info")}</span>
</div>
<p>Source rows: ${plan.sourceRows || 0}</p>
${preview.lines.length ? `<p>${preview.lines.map((line) => escapeHtml(line)).join("</p><p>")}</p>` : ""}
${rowItems.length
? `<div class="player-profile-import-preview-list-wrap"><ul>${rowItems.map((rowItem) => `<li>${escapeHtml(rowItem)}</li>`).join("")}</ul></div>`
: ""}
<div class="player-profile-import-preview-actions">
<button
type="button"
class="player-profile-import-apply-button"
data-player-profile-import-apply
${plan.canApply && canApply ? "" : "disabled"}
>
Apply previewed import
</button>
<button type="button" data-player-profile-import-cancel>Cancel import preview</button>
</div>
</section>
`;
  }

  function renderBirthdayCalendar(calendar = {}) {
    const items = Array.isArray(calendar.items) ? calendar.items : [];
    const nextItem = calendar.next || items[0] || null;
    const thisMonthCount = Math.max(0, Number(calendar.thisMonthCount) || 0);
    const missingBirthDateCount = Math.max(0, Number(calendar.missingBirthDateCount) || 0);
    const trackedCount = Math.max(0, Number(calendar.trackedCount) || 0);
    const withBirthDateCount = Math.max(0, Number(calendar.withBirthDateCount) || items.length);
    const renderAgeLabel = (item = {}) => {
      const age = Number(item.turningAge);
      return Number.isFinite(age) && age > 0 ? `Turns ${age}` : "Age not set";
    };
    const renderBirthdayItem = (item = {}, index = 0) => {
      const playerId = String(item.id || "").trim();
      const meta = [renderAgeLabel(item), item.relativeLabel].filter(Boolean).join(" - ");
      return `
        <button
          type="button"
          class="squad-birthday-item${index === 0 ? " is-next" : ""}"
          data-player-profile-select="${escapeHtml(playerId)}"
          aria-label="Open ${escapeHtml(item.name || "player")} birthday profile"
          ${playerId ? "" : "disabled"}
        >
          <span class="squad-birthday-date">${escapeHtml(item.dateLabel || item.nextBirthday || "")}</span>
          <span class="squad-birthday-player">
            <strong>${escapeHtml(item.name || "Player")}</strong>
            <small>${escapeHtml([item.number ? `#${item.number}` : "", item.primaryRole].filter(Boolean).join(" - "))}</small>
          </span>
          <span class="squad-birthday-meta">${escapeHtml(meta)}</span>
        </button>
      `;
    };
    const emptyText = trackedCount
      ? "Add birth dates in player profiles to build the calendar."
      : "Add players with birth dates to start the calendar.";
    return `
<section class="squad-birthday-calendar" aria-label="Player birthday calendar">
  <header class="squad-birthday-calendar-head">
    <span class="squad-birthday-calendar-mark" aria-hidden="true">BD</span>
    <div>
      <p>Birthday Calendar</p>
      <h2>Upcoming player birthdays</h2>
    </div>
    <div class="squad-birthday-calendar-stats" aria-label="Birthday calendar summary">
      <span>${escapeHtml(String(thisMonthCount))} this month</span>
      <span>${escapeHtml(String(missingBirthDateCount))} missing dates</span>
    </div>
  </header>
  ${
    nextItem
      ? `<div class="squad-birthday-calendar-body">
          <article class="squad-birthday-next">
            <span>Next</span>
            <strong>${escapeHtml(nextItem.name || "Player")}</strong>
            <small>${escapeHtml([nextItem.dateLabel, renderAgeLabel(nextItem), nextItem.relativeLabel].filter(Boolean).join(" - "))}</small>
          </article>
          <div class="squad-birthday-list">
            ${items.map((item, index) => renderBirthdayItem(item, index)).join("")}
          </div>
        </div>`
      : `<div class="squad-birthday-calendar-empty">
          <strong>No birthdays to show</strong>
          <span>${escapeHtml(emptyText)}</span>
        </div>`
  }
  <footer class="squad-birthday-calendar-foot">
    <span>${escapeHtml(String(withBirthDateCount))}/${escapeHtml(String(trackedCount))} player profiles include a birth date.</span>
  </footer>
</section>
`;
  }

  function renderWorkspace(context = {}) {
    return `
<div class="squad-board-shell">
<header class="squad-command-bar">
${context.teamLogoMarkup || ""}
<div class="squad-command-title">
<p>Squad Room</p>
<h1>${escapeHtml(context.teamName)}</h1>
</div>
<div class="squad-command-actions">
<button
type="button"
class="squad-add-player-trigger squad-add-player-trigger-header"
data-player-profile-new-open
aria-label="Add player"
title="Add player"
${context.canEdit ? "" : "disabled"}
>
+
</button>
</div>
<div class="squad-command-tools" aria-label="Squad list controls">
<div class="squad-list-tools">
<input
type="search"
value="${escapeHtml(context.searchQuery)}"
placeholder="Search player, role, number..."
data-player-profile-search
/>
<select data-player-profile-role-group-filter aria-label="Filter by role group">
<option value="all" ${context.roleGroupFilter === "all" ? "selected" : ""}>All groups</option>
${context.roleGroupOptionsMarkup || ""}
</select>
<select data-player-profile-roster-filter aria-label="Filter by roster type">
${context.rosterFilterOptionsMarkup || ""}
</select>
</div>
</div>
</header>
${context.messageMarkup || ""}
${context.pendingImportMarkup || ""}
${context.birthdayCalendarMarkup || ""}
<section class="squad-workspace-layout squad-workspace-layout-list-first">
<main class="squad-list-panel" aria-label="Squad overview">
${context.rosterSectionsMarkup || ""}
</main>
</section>
${context.playerModalMarkup || ""}
${context.newPlayerModalMarkup || ""}
</div>
`;
  }

  return {
    renderBirthdayCalendar,
    renderMessage,
    renderPendingImport,
    renderWorkspace,
  };
}
