export function renderHomeLeaderboardMount({ visible = false } = {}) {
  if (!visible) return "";
  return `
    <section class="dashboard-leaderboard-slot" aria-label="Monthly team Leaderboard">
      <div id="leaderboardSummary" class="dashboard-leaderboard-summary-mount">
        <section class="dashboard-leaderboard-loading" aria-busy="true" aria-label="Loading Leaderboard">
          <span></span><span></span><span></span>
        </section>
      </div>
    </section>
  `;
}
