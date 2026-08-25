import { escapeLeaderboardHtml } from "./leaderboard-helpers.mjs";

export function renderLeaderboardHomeDialog(context = {}, options = {}) {
  const teamName = context.teamName || context.team?.name || "Your team";
  const pendingWrite = Boolean(options.pendingWrite);
  return `
    <div class="leaderboard-home-dialog-layer" data-leaderboard-home-dialog-layer${pendingWrite ? "" : " data-leaderboard-home-close"}>
      <section class="leaderboard-home-dialog" role="dialog" aria-modal="true" aria-labelledby="leaderboardHomeDialogTitle" data-leaderboard-home-dialog tabindex="-1" aria-busy="${pendingWrite}">
        <header class="leaderboard-home-dialog-head">
          <div><p>Monthly competition</p><h2 id="leaderboardHomeDialogTitle">${escapeLeaderboardHtml(teamName)} Leaderboard</h2></div>
          <button type="button" data-leaderboard-home-close aria-label="Close Leaderboard" ${pendingWrite ? "disabled" : ""}>×</button>
        </header>
        <div class="leaderboard-home-dialog-scroll">
          <div data-leaderboard-dialog-workspace></div>
        </div>
      </section>
    </div>
  `;
}
