import { leaderboardTabs } from "./leaderboard-constants.mjs";
import { escapeLeaderboardHtml, formatLeaderboardMonth } from "./leaderboard-helpers.mjs";
import {
  getLeaderboardMonthBounds,
  getLeaderboardRankedStandings,
  getLeaderboardSquadPlayers,
  getLeaderboardZeroPointPlayers,
  isLeaderboardCurrentMonth,
} from "./leaderboard-selectors.mjs";
import { renderLeaderboardAwardSheet } from "./leaderboard-award-renderer.mjs";
import {
  renderLeaderboardActivity,
  renderLeaderboardMetrics,
  renderLeaderboardNotice,
  renderLeaderboardPlayerDrawer,
  renderLeaderboardPodium,
  renderLeaderboardReverseDialog,
  renderLeaderboardStandingsTable,
} from "./leaderboard-components.mjs";
import { renderLeaderboardTeamMark } from "./leaderboard-ui-helpers.mjs";

function canEditLeaderboard(context = {}) {
  try {
    return typeof context.canEdit === "function" ? Boolean(context.canEdit()) : Boolean(context.canEdit);
  } catch {
    return false;
  }
}

function renderLoading() {
  return `<section class="leaderboard-loading" aria-busy="true" aria-label="Loading leaderboard"><div></div><div></div><div></div><div></div></section>`;
}

function renderLoadError(message = "") {
  return `<section class="leaderboard-empty-state is-error"><span class="leaderboard-empty-icon" aria-hidden="true">!</span><h2>Leaderboard could not load</h2><p>${escapeLeaderboardHtml(message || "Check your connection and try again.")}</p><button type="button" class="is-primary" data-leaderboard-retry>Try again</button></section>`;
}

function renderNoSquad() {
  return `<section class="leaderboard-empty-state"><span class="leaderboard-empty-icon" aria-hidden="true">11</span><h2>Leaderboard needs your squad</h2><p>Add or import players in Squad Room before awarding points.</p><button type="button" class="is-primary" data-open-workspace="player-profiles">Open Squad Room</button></section>`;
}

function renderEmptyMonth(canEdit) {
  return `<section class="leaderboard-empty-state"><span class="leaderboard-empty-icon" aria-hidden="true">＋</span><h2>This month is ready</h2><p>Award the first competition points. The standings will update automatically.</p>${canEdit ? `<button type="button" class="is-primary" data-leaderboard-open-award>Award first points</button>` : ""}</section>`;
}

function renderStandings(state, context, canEdit) {
  const ranked = getLeaderboardRankedStandings(state.data || {}, context, state.ui.standingsSearch);
  const allRanked = getLeaderboardRankedStandings(state.data || {}, context);
  const zeroRows = getLeaderboardZeroPointPlayers(state.data || {}, context, state.ui.standingsSearch);
  const squadPlayers = getLeaderboardSquadPlayers(state.data || {});
  if (!squadPlayers.length && !allRanked.length) return renderNoSquad();
  if (!allRanked.length) return renderEmptyMonth(canEdit);
  return `
    ${renderLeaderboardPodium(allRanked, context)}
    ${renderLeaderboardMetrics(state.data || {}, context)}
    <section class="leaderboard-standings-head"><div><p>Point distribution</p><h2>Full standings</h2></div><label><span class="sr-only">Search standings</span><input type="search" value="${escapeLeaderboardHtml(state.ui.standingsSearch)}" placeholder="Search player…" data-leaderboard-standings-search data-leaderboard-focus-key="standings-search" /></label></section>
    ${ranked.length || zeroRows.length ? renderLeaderboardStandingsTable(ranked, zeroRows) : `<section class="leaderboard-empty-state is-compact"><h2>No matching players</h2><p>Try another name, number or position.</p><button type="button" data-leaderboard-clear-search>Clear search</button></section>`}
  `;
}

export function renderLeaderboardWorkspace(state = {}, context = {}) {
  const currentMonth = isLeaderboardCurrentMonth(state.month, context.getNow?.() || new Date());
  const permissionCanEdit = canEditLeaderboard(context);
  const canEdit = permissionCanEdit && currentMonth;
  const loading = state.status === "idle" || state.status === "loading";
  const monthLabel = formatLeaderboardMonth(state.month);
  const statusLabel = currentMonth ? "Live" : "Completed";
  const teamName = context.teamName || context.team?.name || "Your team";
  const content = state.status === "error"
    ? renderLoadError(state.requestError)
    : state.status !== "ready"
      ? renderLoading()
      : state.ui.tab === "activity"
        ? renderLeaderboardActivity(state.data || {}, context, canEdit)
        : renderStandings(state, context, canEdit);
  const overlay = state.ui.reverseEventId
    ? renderLeaderboardReverseDialog(state)
    : state.ui.selectedPlayerId
      ? renderLeaderboardPlayerDrawer(state, context)
      : state.ui.awardOpen
        ? renderLeaderboardAwardSheet({ state, players: getLeaderboardSquadPlayers(state.data || {}), bounds: getLeaderboardMonthBounds(state.month, context.getNow?.() || new Date()), canEdit })
        : "";
  const behindOverlay = overlay ? " inert aria-hidden=\"true\"" : "";
  return `
    <div class="leaderboard-shell" data-leaderboard-root>
      <header class="leaderboard-command-bar"${behindOverlay}>
        ${renderLeaderboardTeamMark(context)}
        <div class="leaderboard-command-title"><p>Monthly competition</p><h1>${escapeLeaderboardHtml(teamName)} Leaderboard</h1></div>
        <div class="leaderboard-month-control" aria-label="Leaderboard month navigation"><button type="button" data-leaderboard-shift-month="-1" aria-label="Previous month" ${loading ? "disabled" : ""}>←</button><span><strong>${escapeLeaderboardHtml(monthLabel)}</strong><small class="is-${currentMonth ? "live" : "completed"}">${statusLabel}</small></span><button type="button" data-leaderboard-shift-month="1" aria-label="Next month" ${currentMonth || loading ? "disabled" : ""}>→</button><button type="button" data-leaderboard-today ${currentMonth || loading ? "disabled" : ""}>Today</button></div>
        ${canEdit ? `<button type="button" class="leaderboard-award-trigger" data-leaderboard-open-award ${state.status !== "ready" ? "disabled" : ""}><span aria-hidden="true">＋</span>Award Points</button>` : ""}
      </header>
      ${!canEdit && state.status === "ready" ? `<div class="leaderboard-readonly" role="note"${behindOverlay}><strong>Read-only</strong><span>${currentMonth ? "You can follow the competition, but only team coaches and admins can award points." : "Completed months are historical records. Point awards and reversals are disabled."}</span></div>` : ""}
      <nav class="leaderboard-tabs" aria-label="Leaderboard sections" role="tablist"${behindOverlay}>${leaderboardTabs.map((tab) => `<button type="button" class="${state.ui.tab === tab.id ? "is-active" : ""}" data-leaderboard-tab="${tab.id}" aria-selected="${state.ui.tab === tab.id}" role="tab">${tab.label}</button>`).join("")}</nav>
      <main class="leaderboard-content"${behindOverlay}>${content}</main>
      ${overlay}
      ${overlay ? "" : renderLeaderboardNotice(state.ui.notice)}
    </div>
  `;
}
