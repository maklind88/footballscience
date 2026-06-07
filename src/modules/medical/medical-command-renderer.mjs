const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function createMedicalCommandRenderer({
  escapeHtml = defaultEscapeHtml,
  formatMedicalDateLabel,
  getActiveMedicalPlayers,
  getMedicalAttentionPlayers,
  getMedicalCoachComment,
  getMedicalCoachHandoverItems,
  getMedicalDailyHuddle,
  getMedicalDailyStats,
  getMedicalPositionSummaries,
  getMedicalReviewAlerts,
  getMedicalRtpPhaseOption,
  getSelectedDate,
} = {}) {
  const renderCoachHandoverPanel = () => {
    const selectedDate = getSelectedDate();
    const items = getMedicalCoachHandoverItems(selectedDate);
    const stats = getMedicalDailyStats(selectedDate);
    return `
<section class="medical-coach-handover" aria-label="Coach-safe handover">
<article class="medical-coach-handover-brief">
<span>Coach-Safe Handover</span>
<strong>${items.length}</strong>
<small>${stats.modifiedCount} modified / ${stats.unavailableCount} out</small>
</article>
<div class="medical-coach-handover-list">
${
  items.length
    ? items
        .slice(0, 8)
        .map((item) => {
          const coachNote = getMedicalCoachComment(item.record);
          return `
<button type="button" data-medical-select-player="${escapeHtml(item.player.id)}" class="medical-coach-handover-row medical-tone-${escapeHtml(item.status.tone)}">
<strong>${escapeHtml(item.player.name)}</strong>
<span>${item.participation}% / ${escapeHtml(item.status.label)}</span>
<small>${escapeHtml(coachNote || "No coach-approved note.")}</small>
</button>
`;
        })
        .join("")
    : `<div class="medical-empty-inline">No managed players or coach-approved notes for this date.</div>`
}
</div>
<button type="button" class="medical-coach-copy-button" data-medical-copy-handover ${items.length ? "" : "disabled"}>Copy handover</button>
</section>
`;
  };

  const renderHuddleList = (items, renderItem, emptyLabel) => {
    if (!items.length) {
      return `<div class="medical-empty-inline">${escapeHtml(emptyLabel)}</div>`;
    }
    return items.map(renderItem).join("");
  };

  const renderDailyHuddle = () => {
    const selectedDate = getSelectedDate();
    const huddle = getMedicalDailyHuddle(selectedDate);
    const stats = getMedicalDailyStats(selectedDate);
    const activePlayerCount = getActiveMedicalPlayers().length;
    return `
<section class="medical-huddle" aria-label="Daily Medical Huddle">
<article class="medical-huddle-brief">
<span>Daily Huddle</span>
<strong>${stats.fullCount}/${activePlayerCount}</strong>
<div class="medical-huddle-kpis">
<small>${huddle.restricted.length} managed</small>
<small>${huddle.needsRecommendation.length} open</small>
<small>${huddle.reviewAlerts.length} review</small>
</div>
</article>
<article class="medical-huddle-card">
<div class="medical-command-head">
<span>Changed since yesterday</span>
<strong>${huddle.changes.length}</strong>
</div>
<div class="medical-huddle-list">
${renderHuddleList(
  huddle.changes.slice(0, 5),
  (item) => `
<button type="button" data-medical-select-player="${escapeHtml(item.player.id)}">
<span>${escapeHtml(item.player.name)}</span>
<small>${item.previousParticipation === null ? "--" : `${item.previousParticipation}%`} -> ${item.participation === null ? "--" : `${item.participation}%`}</small>
</button>
`,
  "No changed recommendations."
)}
</div>
</article>
<article class="medical-huddle-card">
<div class="medical-command-head">
<span>Managed Today</span>
<strong>${huddle.restricted.length}</strong>
</div>
<div class="medical-huddle-list">
${renderHuddleList(
  huddle.restricted.slice(0, 5),
  (item) => `
<button type="button" data-medical-select-player="${escapeHtml(item.player.id)}">
<span>${escapeHtml(item.player.name)}</span>
<small>${item.participation}% / ${escapeHtml(item.status.label)}</small>
</button>
`,
  "No restricted players today."
)}
</div>
</article>
<article class="medical-huddle-card">
<div class="medical-command-head">
<span>Coach Handover</span>
<strong>${huddle.coachHandover.length}</strong>
</div>
<div class="medical-huddle-list">
${renderHuddleList(
  huddle.coachHandover.slice(0, 4),
  (item) => `
<button type="button" data-medical-select-player="${escapeHtml(item.player.id)}">
<span>${escapeHtml(item.player.name)}</span>
<small>${escapeHtml(getMedicalCoachComment(item.record))}</small>
</button>
`,
  "No coach-approved notes."
)}
</div>
</article>
</section>
`;
  };

  const renderCommandBoard = () => {
    const selectedDate = getSelectedDate();
    const attentionPlayers = getMedicalAttentionPlayers(selectedDate).slice(0, 6);
    const positionSummaries = getMedicalPositionSummaries(selectedDate);
    const reviewAlerts = getMedicalReviewAlerts(selectedDate);
    const activePlayerCount = getActiveMedicalPlayers().length;
    const fullClearance = activePlayerCount ? Math.round((getMedicalDailyStats(selectedDate).fullCount / activePlayerCount) * 100) : 0;
    return `
<section class="medical-command-board" aria-label="Medical command board">
<article class="medical-command-card medical-command-card-dark">
<span>Readiness</span>
<strong>${fullClearance}%</strong>
<small>${escapeHtml(formatMedicalDateLabel(selectedDate, "long"))}</small>
</article>
<article class="medical-command-card">
<div class="medical-command-head">
<span>Recommendation Queue</span>
<strong>${getMedicalAttentionPlayers(selectedDate).length}</strong>
</div>
<div class="medical-mini-list">
${
  attentionPlayers.length
    ? attentionPlayers
        .map(
          ({ player, record, status }) => `
<button type="button" data-medical-select-player="${escapeHtml(player.id)}">
<span>${escapeHtml(player.name)}</span>
<small>${record ? `${record.participation}%` : "Not set"} / ${escapeHtml(status.label)}</small>
</button>
`
        )
        .join("")
    : `<div class="medical-empty-inline">All players are cleared for the selected day.</div>`
}
</div>
</article>
<article class="medical-command-card">
<div class="medical-command-head">
<span>Position Load</span>
<strong>${activePlayerCount}</strong>
</div>
<div class="medical-position-load">
${positionSummaries
  .map(
    (summary) => `
<div class="medical-position-row">
<span>${escapeHtml(summary.position)}</span>
<div class="medical-position-track">
<span style="width: ${summary.average ?? 0}%"></span>
</div>
<strong>${summary.average === null ? "-" : `${summary.average}%`}</strong>
<small>${summary.logged}/${summary.players}</small>
</div>
`
  )
  .join("")}
</div>
</article>
<article class="medical-command-card medical-review-card">
<div class="medical-command-head">
<span>Review Alerts</span>
<strong>${reviewAlerts.length}</strong>
</div>
<div class="medical-mini-list">
${
  reviewAlerts.length
    ? reviewAlerts
        .slice(0, 5)
        .map(
          ({ player, plan, isOverdue }) => `
<button type="button" data-medical-select-player="${escapeHtml(player.id)}" class="${isOverdue ? "is-overdue" : ""}">
<span>${escapeHtml(player.name)}</span>
<small>${escapeHtml(isOverdue ? "Overdue" : formatMedicalDateLabel(plan.reviewDate))} / ${escapeHtml(getMedicalRtpPhaseOption(plan.rtpPhase).label)}</small>
</button>
`
        )
        .join("")
    : `<div class="medical-empty-inline">No medical reviews due in the next 7 days.</div>`
}
</div>
</article>
</section>
`;
  };

  return {
    renderCoachHandoverPanel,
    renderCommandBoard,
    renderDailyHuddle,
    renderHuddleList,
  };
}
