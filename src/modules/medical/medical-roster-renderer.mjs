const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalRosterRenderer({
  escapeHtml = defaultEscapeHtml,
  canEditMedicalTeam,
  canViewPrivateMedicalDetails,
  formatMedicalDateLabel,
  formatScheduleDateValue,
  getActiveMedicalPlayers,
  getFilteredMedicalPlayers,
  getLatestMedicalRecord,
  getMedicalDailyStats,
  getMedicalMonthAverageStats,
  getMedicalPlayerSquadAvailabilityBlockReason,
  getMedicalRecommendationActivityContext,
  getMedicalRecordStatus,
  getMedicalRosterPositionGroups,
  getMedicalRosterPositionStats,
  getMedicalScheduleSummary,
  getMedicalStatusForParticipation,
  getMedicalStatusOptionForDate,
  getMedicalVisibleComment,
  getMedicalWindowAverage,
  getMedicalWindowDates,
  getRosterSearchQuery,
  getSelectedDate,
  getSelectedPlayerId,
  getStatusFilter,
  isPlayerModalOpen,
  isTemporaryPlayerProfile,
  medicalParticipationOptions = [],
  medicalStatusOptions = [],
  renderMedicalMetric,
  renderMedicalOperationsSystem,
  renderMedicalPlayerAvatar,
  renderMedicalSquadAvailabilityBadge,
  renderMedicalTemporaryPlayerBadge,
} = {}) {
  const renderDateStrip = () => {
    const selectedDate = getSelectedDate();
    const todayValue = formatScheduleDateValue(new Date());
    return `
<section class="medical-date-strip" aria-label="Medical recommendation dates">
<input type="date" value="${escapeHtml(selectedDate)}" data-medical-date-picker aria-label="Selected medical date" />
<button type="button" class="medical-icon-button" data-medical-shift-date="-1" aria-label="Previous day">&larr;</button>
<button type="button" class="medical-today-button" data-medical-today>Today</button>
<button type="button" class="medical-icon-button" data-medical-shift-date="1" aria-label="Next day">&rarr;</button>
<div class="medical-window-days">
${getMedicalWindowDates()
  .map((dateValue) => {
    const isActive = dateValue === selectedDate;
    const isToday = dateValue === todayValue;
    return `
<button
type="button"
class="medical-window-day${isActive ? " is-active" : ""}${isToday ? " is-today" : ""}"
data-medical-set-date="${escapeHtml(dateValue)}"
>
<span>${escapeHtml(formatMedicalDateLabel(dateValue))}</span>
<small>${escapeHtml(getMedicalScheduleSummary(dateValue))}</small>
</button>
`;
  })
  .join("")}
</div>
</section>
`;
  };

  const renderActivityContextPanel = () => {
    const selectedDate = getSelectedDate();
    const activityContext = getMedicalRecommendationActivityContext(selectedDate);
    const modifier = activityContext.isRecommendable ? ` is-${activityContext.type}` : " is-locked";
    const statusLabel = activityContext.isRecommendable
      ? `${activityContext.activityLabel} recommendations enabled`
      : "Recommendations locked";
    const detailLabel = activityContext.isRecommendable
      ? `${formatMedicalDateLabel(activityContext.date, "long")} / ${activityContext.scheduleLabel}`
      : `${formatMedicalDateLabel(activityContext.date, "long")} / no training or match`;
    return `
<section class="medical-activity-context${modifier} is-hidden" data-medical-activity-context aria-hidden="true">
<div>
<span>Recommendation target</span>
<strong>${escapeHtml(activityContext.recommendationLabel)}</strong>
<small>${escapeHtml(detailLabel)}</small>
</div>
<p>${escapeHtml(statusLabel)}</p>
</section>
`;
  };

  const renderDayCell = (player, dateValue) => {
    const record = getLatestMedicalRecord(player.id, dateValue);
    const status = getMedicalRecordStatus(record);
    const value = record ? `${record.participation}%` : "--";
    return `
<span
class="medical-day-cell medical-tone-${escapeHtml(status.tone)}"
title="${escapeHtml(formatMedicalDateLabel(dateValue, "long"))}: ${escapeHtml(status.label)}"
>
${escapeHtml(value)}
</span>
`;
  };

  const renderQuickRecommendationButtons = (player, record) => {
    const selectedDate = getSelectedDate();
    const canEdit = canEditMedicalTeam();
    const activityContext = getMedicalRecommendationActivityContext(selectedDate);
    const squadBlockReason = getMedicalPlayerSquadAvailabilityBlockReason(player, selectedDate);
    const canRecommend = canEdit && activityContext.isRecommendable && !squadBlockReason;
    const canClearManualRecord = canEdit && Boolean(record) && !record?.source && !record?.injuryPlanId;
    const label = squadBlockReason || activityContext.quickLabel;
    return `
<div class="medical-quick-rec-row${canClearManualRecord ? " has-clear" : ""}" role="group" aria-label="${escapeHtml(label)} for ${escapeHtml(player.name)}">
${canClearManualRecord ? `
<button
type="button"
class="medical-quick-rec-button medical-quick-clear"
data-medical-quick-clear="${escapeHtml(player.id)}"
aria-label="Clear ${escapeHtml(player.name)} manual recommendation for ${escapeHtml(formatMedicalDateLabel(selectedDate, "long"))}"
title="Clear manual recommendation"
>Clear</button>
` : ""}
${medicalParticipationOptions
  .map((participation) => {
    const statusKey = getMedicalStatusForParticipation(participation);
    return `
<button
type="button"
class="medical-quick-rec-button medical-quick-${escapeHtml(statusKey)}${record?.participation === participation ? " is-active" : ""}"
data-medical-quick-recommend="${escapeHtml(player.id)}"
data-medical-quick-participation="${participation}"
aria-label="${escapeHtml(player.name)} ${participation}% ${escapeHtml(activityContext.activityLabel.toLowerCase())} recommendation"
title="${escapeHtml(label)}"
${canRecommend ? "" : "disabled"}
>${participation}%</button>
`;
  })
  .join("")}
</div>
`;
  };

  const renderRosterRow = (player) => {
    const selectedDate = getSelectedDate();
    const record = getLatestMedicalRecord(player.id, selectedDate);
    const status = getMedicalRecordStatus(record);
    const isSelected = player.id === getSelectedPlayerId();
    const latestComment = getMedicalVisibleComment(record);
    return `
<article
class="medical-roster-row medical-tone-${escapeHtml(status.tone)}${isSelected && isPlayerModalOpen() ? " is-selected" : ""}"
data-medical-select-player="${escapeHtml(player.id)}"
data-medical-roster-row="${escapeHtml(player.id)}"
tabindex="0"
role="button"
aria-label="Open ${escapeHtml(player.name)} recommendation"
>
<div class="medical-roster-player-cell">
${renderMedicalPlayerAvatar(player)}
<div class="medical-roster-player-copy">
<strong>${escapeHtml(player.name)}</strong>
<div class="medical-roster-player-meta">
${player.number ? `<span>#${escapeHtml(player.number)}</span>` : ""}
<span>${escapeHtml(player.position || "Position")}</span>
${renderMedicalTemporaryPlayerBadge(player)}
${renderMedicalSquadAvailabilityBadge(player, selectedDate)}
</div>
</div>
</div>
<div class="medical-roster-quick-cell">
${renderQuickRecommendationButtons(player, record)}
</div>
${latestComment ? `<p class="medical-row-comment">${escapeHtml(latestComment)}</p>` : ""}
</article>
`;
  };

  const renderPositionGroup = (group) => {
    const stats = getMedicalRosterPositionStats(group.players);
    return `
<section class="medical-position-group">
<header class="medical-position-group-head">
<div>
<span>Position</span>
<strong>${escapeHtml(group.position)}</strong>
</div>
<p>${stats.total} players / ${stats.full} full / ${stats.modified} modified / ${stats.unavailable} unavailable / ${stats.missing} not set</p>
</header>
<div class="medical-roster-list">
<div class="medical-roster-list-head" aria-hidden="true">
<span>Player</span>
<span>Quick Recommendation</span>
</div>
${group.players.map(renderRosterRow).join("")}
</div>
</section>
`;
  };

  const renderTemporaryPlayerSection = (players = []) => {
    const activeCount = players.length;
    return `
<section class="medical-temporary-player-panel" aria-label="Temporary training guests for selected date">
<header class="medical-temporary-player-head">
<div>
<span class="medical-temporary-tab">Training guests</span>
<strong>Temporary players</strong>
<small>Available in Squad Room for ${escapeHtml(formatMedicalDateLabel(getSelectedDate(), "long"))}.</small>
</div>
<p>${activeCount ? `${activeCount} active for this date` : "None active for this date"}</p>
</header>
${
  activeCount
    ? `
<div class="medical-roster-list medical-temporary-roster-list">
<div class="medical-roster-list-head" aria-hidden="true">
<span>Player</span>
<span>Quick Recommendation</span>
</div>
${players.map(renderRosterRow).join("")}
</div>
`
    : `<div class="medical-empty-inline medical-temporary-empty">No temporary players are marked as training with the team on this date.</div>`
}
</section>
`;
  };

  const renderNewPlayerCard = () => {
    const canEdit = canEditMedicalTeam();
    return `
<article class="medical-side-card">
<div class="medical-card-headline">
<h2>Add Player</h2>
<span>Profile</span>
</div>
<form id="medicalNewPlayerForm" class="medical-profile-form">
<div class="medical-form-grid">
<label>
<span>Number</span>
<input name="number" inputmode="numeric" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Name</span>
<input name="name" required ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Position</span>
<input name="position" ${canEdit ? "" : "disabled"} />
</label>
<label>
<span>Image URL</span>
<input name="photoUrl" type="url" ${canEdit ? "" : "disabled"} />
</label>
</div>
<button type="submit" ${canEdit ? "" : "disabled"}>Add player</button>
</form>
</article>
`;
  };

  const renderRosterSetup = () => {
    const canEdit = canEditMedicalTeam();
    return `
<section class="medical-empty-state">
<article class="medical-empty-card">
<p class="placeholder-tag">Roster</p>
<h2>Medical availability starts with the squad.</h2>
<form id="medicalRosterImportForm" class="medical-import-form">
<label>
<span>Paste roster</span>
<textarea
name="rosterText"
rows="8"
placeholder="10 | Player Name | Forward | image URL"
${canEdit ? "" : "disabled"}
></textarea>
</label>
<button type="submit" ${canEdit ? "" : "disabled"}>Import roster</button>
</form>
</article>
${renderNewPlayerCard()}
</section>
`;
  };

  const renderRosterPanel = () => {
    const players = getFilteredMedicalPlayers();
    const squadPlayers = players.filter((player) => !isTemporaryPlayerProfile(player));
    const temporaryPlayers = players.filter(isTemporaryPlayerProfile);
    const positionGroups = getMedicalRosterPositionGroups(squadPlayers);
    const selectedDate = getSelectedDate();
    const activityContext = getMedicalRecommendationActivityContext(selectedDate);
    const statusFilter = getStatusFilter();
    return `
<section class="medical-roster-panel">
<div class="medical-section-head">
<div>
<p class="placeholder-tag">${escapeHtml(activityContext.availabilityLabel)}</p>
<h2>${escapeHtml(formatMedicalDateLabel(selectedDate, "long"))}</h2>
</div>
<div class="medical-roster-tools">
<input
type="search"
value="${escapeHtml(getRosterSearchQuery())}"
placeholder="Search squad"
data-medical-roster-search
aria-label="Search squad"
/>
<select data-medical-status-filter aria-label="Filter medical status">
<option value="all"${statusFilter === "all" ? " selected" : ""}>All</option>
${medicalStatusOptions
  .map(
    (status) =>
      `<option value="${escapeHtml(status.key)}"${statusFilter === status.key ? " selected" : ""}>${escapeHtml(getMedicalStatusOptionForDate(status.key, selectedDate).label)}</option>`
  )
  .join("")}
<option value="not-set"${statusFilter === "not-set" ? " selected" : ""}>Not set</option>
</select>
</div>
</div>
<div class="medical-position-overview">
${
  squadPlayers.length
    ? positionGroups.map(renderPositionGroup).join("")
    : `<div class="medical-empty-inline">${temporaryPlayers.length ? "No squad players match the current filter." : "No players match the current filter."}</div>`
}
</div>
${renderTemporaryPlayerSection(temporaryPlayers)}
</section>
`;
  };

  const renderAvailabilityWorkspace = (message = "") => {
    const selectedDate = getSelectedDate();
    const stats = getMedicalDailyStats(selectedDate);
    const windowAverage = getMedicalWindowAverage();
    const monthStats = getMedicalMonthAverageStats();
    const hasActivePlayers = getActiveMedicalPlayers().length > 0;
    return `
<section class="medical-availability-workspace" data-medical-availability-workspace aria-label="Medical availability recommendations">
${renderDateStrip()}
${renderActivityContextPanel()}
${message ? `<div class="medical-message platform-inline-toast" role="status" aria-live="polite">${escapeHtml(message)}</div>` : ""}
<section class="medical-metrics-grid" aria-label="Medical availability summary">
${renderMedicalMetric("Full", String(stats.fullCount), "100%", "full")}
${renderMedicalMetric("Modified", String(stats.modifiedCount), "10-75%", "modified")}
${renderMedicalMetric("Unavailable", String(stats.unavailableCount), "0%", "unavailable")}
${renderMedicalMetric("Not set", String(stats.unloggedCount), "no entry")}
${renderMedicalMetric("Month average", monthStats.averageParticipation === null ? "-" : `${monthStats.averageParticipation}%`)}
${renderMedicalMetric("5-session average", windowAverage === null ? "-" : `${windowAverage}%`, "planned sessions")}
</section>
${
  hasActivePlayers
    ? `
<section class="medical-layout">
${renderRosterPanel()}
</section>
${canViewPrivateMedicalDetails() ? "" : renderMedicalOperationsSystem()}
`
    : renderRosterSetup()
}
</section>
`;
  };

  return {
    renderAvailabilityWorkspace,
    renderDateStrip,
    renderActivityContextPanel,
    renderDayCell,
    renderQuickRecommendationButtons,
    renderRosterRow,
    renderPositionGroup,
    renderTemporaryPlayerSection,
    renderRosterSetup,
    renderNewPlayerCard,
    renderRosterPanel,
  };
}
