import { escapeLeaderboardHtml, formatLeaderboardMonth, getLeaderboardMonthValue } from "./leaderboard-helpers.mjs";
import {
  getLeaderboardRankedStandings,
  getLeaderboardSquadPlayers,
  getLeaderboardSummary,
  getLeaderboardZeroPointPlayers,
} from "./leaderboard-selectors.mjs";
import { renderLeaderboardPodium } from "./leaderboard-components.mjs";
import { formatLeaderboardRank, renderLeaderboardAvatar, renderLeaderboardTeamMark } from "./leaderboard-ui-helpers.mjs";

function canEditLeaderboard(context = {}) {
  try {
    return typeof context.canEdit === "function" ? Boolean(context.canEdit()) : Boolean(context.canEdit);
  } catch {
    return false;
  }
}

export function getLeaderboardCurrentMonthSnapshot(state = {}, context = {}) {
  const month = getLeaderboardMonthValue(context.getNow?.() || new Date());
  const cached = state.monthCache?.[month];
  if (cached) return { month, status: cached.status || "idle", data: cached.data || null, error: cached.error || "" };
  if (state.month === month) return { month, status: state.status || "idle", data: state.data || null, error: state.requestError || "" };
  return { month, status: "idle", data: null, error: "" };
}

function renderSummaryHeader(snapshot, context, editable) {
  const teamName = context.teamName || context.team?.name || "Your team";
  return `
    <header class="leaderboard-home-head">
      ${renderLeaderboardTeamMark(context)}
      <div><p>Monthly competition</p><h2>${escapeLeaderboardHtml(teamName)} Leaderboard</h2><span>${escapeLeaderboardHtml(formatLeaderboardMonth(snapshot.month))} · Live${editable ? "" : " · View only"}</span></div>
      <button type="button" class="leaderboard-home-open" data-leaderboard-home-open>Open Leaderboard <span aria-hidden="true">↗</span></button>
    </header>
  `;
}

function renderSummaryLoading() {
  return `<div class="leaderboard-home-loading" aria-busy="true" aria-label="Loading current leaderboard"><i></i><i></i><i></i></div>`;
}

function renderSummaryError(message = "") {
  return `
    <section class="leaderboard-home-state is-error" role="alert">
      <div><strong>Leaderboard could not load</strong><span>${escapeLeaderboardHtml(message || "Check your connection and try again.")}</span></div>
      <button type="button" data-leaderboard-home-retry>Try again</button>
    </section>
  `;
}

function renderCompactRows(ranked = [], zeroRows = []) {
  const rankedItems = ranked.slice(0, 5);
  const remainingSlots = Math.max(0, 5 - rankedItems.length);
  const rows = [...rankedItems, ...zeroRows.slice(0, remainingSlots)];
  if (!rows.length) return "";
  return `<ol class="leaderboard-home-standings-list">${rows.map((row) => {
    const rankedPlayer = Number(row.points) > 0;
    return `
      <li><button type="button" data-leaderboard-home-player="${escapeLeaderboardHtml(row.playerId)}" aria-label="Open ${escapeLeaderboardHtml(row.name)} leaderboard detail">
        <span class="leaderboard-home-rank">${rankedPlayer ? formatLeaderboardRank(row.rank) : "—"}</span>
        ${renderLeaderboardAvatar(row)}
        <span class="leaderboard-home-player"><strong>${escapeLeaderboardHtml(row.name)}</strong><small>${escapeLeaderboardHtml(row.number ? `#${row.number}` : row.position || "Squad player")}</small></span>
        <span class="leaderboard-home-points"><strong>${Number(row.points) || 0}</strong><small>pts</small></span>
      </button></li>
    `;
  }).join("")}</ol>`;
}

function renderReadySummary(data, context, editable) {
  const ranked = getLeaderboardRankedStandings(data, context);
  const zeroRows = getLeaderboardZeroPointPlayers(data, context);
  const squad = getLeaderboardSquadPlayers(data);
  const summary = getLeaderboardSummary(data, context);
  const remainingPlayers = Math.max(0, ranked.length + zeroRows.length - 5);
  if (!squad.length && !ranked.length) return `
    <section class="leaderboard-home-state"><div><strong>Connect your squad</strong><span>Add players in Squad Room before awarding competition points.</span></div></section>
  `;
  return `
    ${ranked.length ? renderLeaderboardPodium(ranked) : `
      <section class="leaderboard-home-state is-empty"><div><strong>This month is ready</strong><span>Award the first points to start the podium.</span></div>${editable ? `<button type="button" data-leaderboard-home-award>Award first points</button>` : ""}</section>
    `}
    <section class="leaderboard-home-standings" aria-label="Current month team standings">
      <header><div><p>Current month</p><h3>Team standings</h3></div><span><strong>${summary.totalPoints}</strong> points · ${summary.scoredPlayerCount} scored</span></header>
      ${renderCompactRows(ranked, zeroRows)}
      ${remainingPlayers || zeroRows.length ? `<footer>${remainingPlayers ? `<span>${remainingPlayers} more players</span>` : ""}<span>${zeroRows.length} without points</span></footer>` : ""}
    </section>
  `;
}

export function renderLeaderboardHomeSummary(state = {}, context = {}) {
  const snapshot = getLeaderboardCurrentMonthSnapshot(state, context);
  const editable = canEditLeaderboard(context);
  const content = snapshot.status === "error"
    ? renderSummaryError(snapshot.error)
    : snapshot.status !== "ready"
      ? renderSummaryLoading()
      : renderReadySummary(snapshot.data || {}, context, editable);
  return `
    <section class="leaderboard-shell leaderboard-home-summary" data-leaderboard-home-root aria-label="Current month leaderboard summary">
      ${renderSummaryHeader(snapshot, context, editable)}
      <div class="leaderboard-home-content">${content}</div>
    </section>
  `;
}
