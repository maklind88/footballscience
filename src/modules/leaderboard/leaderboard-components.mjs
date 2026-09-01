import { escapeLeaderboardHtml, formatLeaderboardDate } from "./leaderboard-helpers.mjs";
import {
  getLeaderboardEvents,
  getLeaderboardPlayer,
  getLeaderboardPlayerEvents,
  getLeaderboardSquadPlayers,
} from "./leaderboard-selectors.mjs";
import {
  formatLeaderboardRank,
  renderLeaderboardAvatar,
  resolveLeaderboardProfilePhoto,
} from "./leaderboard-ui-helpers.mjs";

function getRankCounts(rows = []) {
  return rows.reduce((counts, row) => counts.set(row.rank, (counts.get(row.rank) || 0) + 1), new Map());
}

export function renderLeaderboardPodium(rows = [], context = {}) {
  if (!rows.length) return "";
  const rankCounts = getRankCounts(rows);
  return `
    <section class="leaderboard-podium" aria-label="Top three players">
      ${rows.slice(0, 3).map((row, index) => {
        const visualPlace = index + 1;
        const shared = (rankCounts.get(row.rank) || 0) > 1;
        const podiumPlayer = { ...row, photoUrl: resolveLeaderboardProfilePhoto(row, context) };
        return `
          <button type="button" class="leaderboard-podium-card is-place-${visualPlace}" data-leaderboard-player-detail="${escapeLeaderboardHtml(row.playerId)}" aria-label="${escapeLeaderboardHtml(`${shared ? "Joint " : ""}rank ${row.rank}, ${row.name}, ${row.points} points`)}">
            <span class="leaderboard-podium-rank">${formatLeaderboardRank(row.rank, shared)}</span>
            ${renderLeaderboardAvatar(podiumPlayer, "leaderboard-avatar leaderboard-podium-avatar")}
            <span class="leaderboard-podium-copy"><strong>${escapeLeaderboardHtml(row.name)}</strong><small>${escapeLeaderboardHtml(row.number ? `#${row.number}` : row.position || "Squad player")}</small></span>
            <span class="leaderboard-podium-points"><strong>${row.points}</strong><small>pts</small></span>
          </button>
        `;
      }).join("")}
    </section>
  `;
}

function renderStandingRow(row, maxPoints, rankCounts) {
  const shared = (rankCounts.get(row.rank) || 0) > 1;
  const distribution = maxPoints ? Math.max(4, Math.round((row.points / maxPoints) * 100)) : 0;
  const lastScored = row.lastScoredOn ? formatLeaderboardDate(row.lastScoredOn) : "Not recorded";
  return `
    <tr data-leaderboard-player-detail="${escapeLeaderboardHtml(row.playerId)}" tabindex="0" role="button" aria-label="Open ${escapeLeaderboardHtml(row.name)} leaderboard detail">
      <td data-label="Rank"><span class="leaderboard-rank${row.rank <= 3 ? ` is-top-${row.rank}` : ""}">${formatLeaderboardRank(row.rank, shared)}</span></td>
      <td data-label="Player"><span class="leaderboard-player-cell">${renderLeaderboardAvatar(row)}<span><strong>${escapeLeaderboardHtml(row.name)}</strong><small>${escapeLeaderboardHtml([row.number ? `#${row.number}` : "", row.position, row.archived ? "Former squad" : ""].filter(Boolean).join(" · ") || "Squad player")}</small></span></span></td>
      <td data-label="Points"><span class="leaderboard-points-cell"><strong>${row.points}</strong><small>pts</small></span></td>
      <td data-label="Distribution"><span class="leaderboard-distribution" style="--leaderboard-share:${distribution}%"><i></i><small>${distribution}% of leader</small></span></td>
      <td data-label="Awards"><strong class="leaderboard-count-cell">${row.awardCount}</strong></td>
      <td data-label="Last scored"><span class="leaderboard-date-cell">${escapeLeaderboardHtml(lastScored)}</span></td>
    </tr>
  `;
}

export function renderLeaderboardStandingsTable(rankedRows = [], zeroRows = []) {
  const maxPoints = rankedRows[0]?.points || 0;
  const rankCounts = getRankCounts(rankedRows);
  return `
    <section class="leaderboard-table-card">
      <div class="leaderboard-table-wrap">
        <table class="leaderboard-table">
          <caption class="sr-only">Monthly leaderboard standings</caption>
          <thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Distribution</th><th>Awards</th><th>Last scored</th></tr></thead>
          <tbody>${rankedRows.map((row) => renderStandingRow(row, maxPoints, rankCounts)).join("")}</tbody>
        </table>
      </div>
      ${zeroRows.length ? `
        <details class="leaderboard-zero-group">
          <summary><span><strong>No points yet</strong><small>Unranked this month</small></span><b>${zeroRows.length}</b></summary>
          <div class="leaderboard-zero-list">${zeroRows.map((row) => `
            <button type="button" data-leaderboard-player-detail="${escapeLeaderboardHtml(row.playerId)}">${renderLeaderboardAvatar(row)}<span><strong>${escapeLeaderboardHtml(row.name)}</strong><small>${escapeLeaderboardHtml(row.number ? `#${row.number}` : row.position || "Squad player")}</small></span><b>0 pts</b></button>
          `).join("")}</div>
        </details>
      ` : ""}
    </section>
  `;
}

export function renderLeaderboardActivity(data = {}, context = {}, canEdit = false) {
  const events = getLeaderboardEvents(data);
  if (!events.length) return `
    <section class="leaderboard-empty-state"><span class="leaderboard-empty-icon" aria-hidden="true">＋</span><h2>No point activity yet</h2><p>Every saved award will appear here with its date, players and coach record.</p>${canEdit ? `<button type="button" class="is-primary" data-leaderboard-open-award>Award first points</button>` : ""}</section>
  `;
  const playerMap = new Map(getLeaderboardSquadPlayers(data, { includeArchived: true })
    .map((player) => [player.id, player.name]));
  return `<section class="leaderboard-activity-list" aria-label="Point award activity">${events.map((event) => {
    const reversed = Boolean(event.reversedAt);
    const awardTotal = event.awards.reduce((sum, award) => sum + award.points, 0);
    const total = event.points || awardTotal;
    return `
      <article class="leaderboard-event${reversed ? " is-reversed" : ""}">
        <header><div><span>${escapeLeaderboardHtml(formatLeaderboardDate(event.occurredOn))}</span><h3>${escapeLeaderboardHtml(event.title)}</h3></div><strong>${reversed ? "Reversed" : `+${total} pts`}</strong></header>
        <div class="leaderboard-event-awards">${event.awards.length
          ? event.awards.map((award) => `<span><b>${escapeLeaderboardHtml(playerMap.get(award.playerId) || award.playerName)}</b> +${award.points}${award.placement ? ` · #${award.placement}` : ""}</span>`).join("")
          : `<span><b>Team award</b> +${total}</span>`}</div>
        ${event.note ? `<p>${escapeLeaderboardHtml(event.note)}</p>` : ""}
        <footer><span>Awarded by ${escapeLeaderboardHtml(event.createdByName)}${event.createdAt ? ` · ${escapeLeaderboardHtml(new Date(event.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}` : ""}</span>${reversed ? `<small>${escapeLeaderboardHtml(event.reverseReason || "Award reversed")}</small>` : canEdit ? `<button type="button" data-leaderboard-open-reverse="${escapeLeaderboardHtml(event.id)}">Reverse award</button>` : ""}</footer>
      </article>
    `;
  }).join("")}</section>`;
}

export function renderLeaderboardPlayerDrawer(state = {}, context = {}) {
  const playerId = state.ui?.selectedPlayerId || "";
  if (!playerId) return "";
  const player = getLeaderboardPlayer(state.data || {}, context, playerId);
  if (!player) return "";
  const events = getLeaderboardPlayerEvents(state.data || {}, playerId);
  return `
    <div class="leaderboard-layer leaderboard-drawer-layer" data-leaderboard-close-player>
      <aside class="leaderboard-player-drawer" role="dialog" aria-modal="true" aria-labelledby="leaderboardPlayerTitle" data-leaderboard-modal tabindex="-1">
        <header class="leaderboard-sheet-header"><div><p>Monthly detail</p><h2 id="leaderboardPlayerTitle">${escapeLeaderboardHtml(player.name)}</h2></div><button type="button" class="leaderboard-icon-button" data-leaderboard-close-player aria-label="Close player detail">×</button></header>
        <section class="leaderboard-player-hero">${renderLeaderboardAvatar(player, "leaderboard-avatar leaderboard-player-hero-avatar")}<div><span>Rank</span><strong>${player.rank ? `#${player.rank}` : "Unranked"}</strong></div><div><span>Points</span><strong>${player.points || 0}</strong></div><div><span>Awards</span><strong>${player.awardCount || events.filter((event) => !event.reversedAt).length}</strong></div></section>
        <div class="leaderboard-player-history"><h3>Point history</h3>${events.length ? events.map((event) => {
          const award = event.awards.find((item) => item.playerId === playerId);
          return `<article class="${event.reversedAt ? "is-reversed" : ""}"><time>${escapeLeaderboardHtml(formatLeaderboardDate(event.occurredOn))}</time><span><strong>${escapeLeaderboardHtml(event.title)}</strong><small>${event.reversedAt ? "Reversed" : award?.placement ? `Placement ${award.placement}` : "Team award"}</small></span><b>+${award?.points || 0}</b></article>`;
        }).join("") : `<div class="leaderboard-player-history-empty">No points recorded this month.</div>`}</div>
      </aside>
    </div>
  `;
}

export function renderLeaderboardReverseDialog(state = {}) {
  const eventId = state.ui?.reverseEventId || "";
  if (!eventId) return "";
  const event = getLeaderboardEvents(state.data || {}).find((item) => item.id === eventId);
  if (!event) return "";
  const pending = state.ui.pendingAction === "reverse";
  return `
    <div class="leaderboard-layer" ${pending ? "" : "data-leaderboard-close-reverse"}>
      <section class="leaderboard-reverse-dialog" role="dialog" aria-modal="true" aria-labelledby="leaderboardReverseTitle" data-leaderboard-modal tabindex="-1">
        <form data-leaderboard-reverse-form aria-busy="${pending}">
          <header class="leaderboard-sheet-header"><div><p>Correction</p><h2 id="leaderboardReverseTitle">Reverse award?</h2></div><button type="button" class="leaderboard-icon-button" data-leaderboard-close-reverse aria-label="Close correction" ${pending ? "disabled" : ""}>×</button></header>
          <p>This removes <strong>${escapeLeaderboardHtml(event.title)}</strong> from the standings while retaining its audit record.</p>
          <label><span>Reason</span><textarea rows="3" maxlength="240" placeholder="Explain the correction" data-leaderboard-reverse-reason data-leaderboard-focus-key="reverse-reason" required ${pending ? "disabled" : ""}>${escapeLeaderboardHtml(state.ui.reverseReason)}</textarea></label>
          ${state.ui.draftError ? `<p class="leaderboard-form-error" role="alert">${escapeLeaderboardHtml(state.ui.draftError)}</p>` : ""}
          <footer><button type="button" data-leaderboard-close-reverse ${pending ? "disabled" : ""}>Cancel</button><button type="submit" class="is-danger" ${pending ? "disabled" : ""}>${pending ? "Reversing…" : "Reverse award"}</button></footer>
        </form>
      </section>
    </div>
  `;
}

export function renderLeaderboardNotice(notice = null) {
  if (!notice?.message) return "";
  return `<div class="leaderboard-notice is-${escapeLeaderboardHtml(notice.tone || "neutral")}" role="status"><span>${escapeLeaderboardHtml(notice.message)}</span>${notice.undoEventId ? `<button type="button" data-leaderboard-undo="${escapeLeaderboardHtml(notice.undoEventId)}">Undo</button>` : ""}<button type="button" data-leaderboard-dismiss-notice aria-label="Dismiss notification">×</button></div>`;
}
