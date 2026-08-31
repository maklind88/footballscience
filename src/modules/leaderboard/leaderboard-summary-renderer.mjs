import { escapeLeaderboardHtml, formatLeaderboardMonth, getLeaderboardMonthValue } from "./leaderboard-helpers.mjs";
import {
  getLeaderboardRankedStandings,
  getLeaderboardSquadPlayers,
} from "./leaderboard-selectors.mjs";
import { renderLeaderboardPodium } from "./leaderboard-components.mjs";

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

function renderSummaryHeader(snapshot, editable) {
  return `
    <header class="leaderboard-home-head">
      <div class="leaderboard-home-visual" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/></svg>
      </div>
      <div class="leaderboard-home-copy"><p>Monthly competition</p><h2>NCC Leaderboard</h2><span>${escapeLeaderboardHtml(formatLeaderboardMonth(snapshot.month))} · Live${editable ? "" : " · View only"}</span></div>
      <button type="button" class="leaderboard-home-open" data-leaderboard-home-open>Open</button>
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

function renderReadySummary(data, context, editable) {
  const ranked = getLeaderboardRankedStandings(data, context);
  const squad = getLeaderboardSquadPlayers(data);
  if (!squad.length && !ranked.length) return `
    <section class="leaderboard-home-state"><div><strong>Connect your squad</strong><span>Add players in Squad Room before awarding competition points.</span></div></section>
  `;
  return ranked.length ? renderLeaderboardPodium(ranked) : `
    <section class="leaderboard-home-state is-empty"><div><strong>This month is ready</strong><span>Award the first points to start the podium.</span></div>${editable ? `<button type="button" data-leaderboard-home-award>Award first points</button>` : ""}</section>
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
      ${renderSummaryHeader(snapshot, editable)}
      <div class="leaderboard-home-content">${content}</div>
    </section>
  `;
}
