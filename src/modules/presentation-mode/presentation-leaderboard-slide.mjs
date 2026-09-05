function getInitials(name = "Player") {
  return String(name || "Player")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "P";
}

function renderAvatar(escapeHtml, player = {}, className = "") {
  const photoUrl = String(player.photoUrl || "").trim();
  return `
    <span class="presentation-leaderboard-avatar${className ? ` ${className}` : ""}${photoUrl ? " has-photo" : ""}">
      <span class="presentation-leaderboard-avatar-initials" aria-hidden="true">${escapeHtml(getInitials(player.name))}</span>
      ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="" loading="lazy" onerror="this.closest('.presentation-leaderboard-avatar')?.classList.remove('has-photo');this.remove()" />` : ""}
    </span>
  `;
}

function renderPlayerMeta(escapeHtml, player = {}) {
  const details = [
    player.number ? `#${player.number}` : "",
    player.position || "",
  ].filter(Boolean);
  return details.length ? `<span>${escapeHtml(details.join(" · "))}</span>` : "";
}

function formatRankOrdinal(value = 0) {
  const rank = Math.max(0, Number(value) || 0);
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${rank}th`;
  if (rank % 10 === 1) return `${rank}st`;
  if (rank % 10 === 2) return `${rank}nd`;
  if (rank % 10 === 3) return `${rank}rd`;
  return `${rank}th`;
}

function renderPodiumPlayer(escapeHtml, player = {}, index = 0, shared = false) {
  const rank = Number(player.rank) || index + 1;
  const tone = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
  return `
    <article class="presentation-leaderboard-podium-player is-rank-${Math.min(3, rank)}">
      <span class="presentation-leaderboard-rank is-tone-${tone}" aria-label="${shared ? "Joint rank" : "Rank"} ${escapeHtml(rank)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path class="is-cup" d="M7 3h10v6a5 5 0 0 1-10 0V3Z" />
          <path d="M7 5H4v2a4 4 0 0 0 4 4M17 5h3v2a4 4 0 0 1-4 4M12 14v4M8 21h8M9 18h6" />
        </svg>
        <strong aria-hidden="true">${escapeHtml(rank)}</strong>
      </span>
      ${renderAvatar(escapeHtml, player, "is-podium")}
      <div class="presentation-leaderboard-player-copy">
        <strong title="${escapeHtml(player.name || "Player")}">${escapeHtml(player.name || "Player")}</strong>
        ${renderPlayerMeta(escapeHtml, player)}
      </div>
      <div class="presentation-leaderboard-points">
        <strong>${escapeHtml(player.points || 0)}</strong>
        <span>PTS</span>
      </div>
    </article>
  `;
}

function renderStandingPlayer(escapeHtml, player = {}, index = 0) {
  const rank = Number(player.rank) || index + 4;
  return `
    <article class="presentation-leaderboard-standing">
      <span class="presentation-leaderboard-standing-rank" aria-label="Rank ${escapeHtml(rank)}">${escapeHtml(formatRankOrdinal(rank))}</span>
      ${renderAvatar(escapeHtml, player)}
      <div class="presentation-leaderboard-player-copy">
        <strong title="${escapeHtml(player.name || "Player")}">${escapeHtml(player.name || "Player")}</strong>
        ${renderPlayerMeta(escapeHtml, player)}
      </div>
      <span class="presentation-leaderboard-standing-points">
        <strong>${escapeHtml(player.points || 0)}</strong>
        <span>PTS</span>
      </span>
    </article>
  `;
}

function renderLeaderboardState(escapeHtml, snapshot = {}) {
  if (snapshot.status === "error") {
    return `
      <section class="presentation-leaderboard-state is-error" role="status">
        <strong>Leaderboard could not load</strong>
        <span>${escapeHtml(snapshot.requestError || "Try again when the connection is restored.")}</span>
      </section>
    `;
  }
  if (snapshot.status === "unavailable") {
    return `
      <section class="presentation-leaderboard-state" role="status">
        <strong>Leaderboard unavailable</strong>
        <span>This view is not available for the current account.</span>
      </section>
    `;
  }
  if (snapshot.status !== "ready") {
    return `
      <section class="presentation-leaderboard-state is-loading" aria-busy="true" aria-label="Loading leaderboard">
        <i></i><i></i><i></i>
      </section>
    `;
  }
  return `
    <section class="presentation-leaderboard-state is-empty" role="status">
      <strong>The leaderboard is ready</strong>
      <span>Players will appear here as soon as the first points are awarded.</span>
    </section>
  `;
}

export function renderPresentationLeaderboardBody({
  escapeHtml,
  model = {},
  slide = {},
  renderEditableElement,
} = {}) {
  const snapshot = slide.leaderboard || {};
  const standings = Array.isArray(snapshot.standings) ? snapshot.standings : [];
  const podium = standings.slice(0, 3);
  const remaining = standings.slice(3);
  const rankCounts = standings.reduce((counts, player) => {
    const rank = Number(player.rank) || 0;
    if (rank) counts.set(rank, (counts.get(rank) || 0) + 1);
    return counts;
  }, new Map());
  const densityClass = remaining.length > 27
    ? " is-ultra-crowded"
    : remaining.length > 18
      ? " is-very-crowded"
    : remaining.length > 12
      ? " is-crowded"
      : "";
  const title = slide.infoSlide?.title || "Leaderboard";

  return `
    <section class="presentation-leaderboard-layout${densityClass}" data-presentation-leaderboard-status="${escapeHtml(snapshot.status || "loading")}">
      <header class="presentation-leaderboard-header">
        <div>
          ${renderEditableElement(model, slide, "leaderboard.title", title, "h1", "class=\"presentation-leaderboard-title\"", { label: "Leaderboard title" })}
          <span class="presentation-leaderboard-month">${escapeHtml(snapshot.monthLabel || "Current month")}</span>
        </div>
      </header>
      ${standings.length
        ? `
            <div class="presentation-leaderboard-podium" aria-label="Top three players">
              ${podium.map((player, index) => renderPodiumPlayer(
                escapeHtml,
                player,
                index,
                (rankCounts.get(Number(player.rank) || index + 1) || 0) > 1,
              )).join("")}
            </div>
            ${remaining.length
              ? `
                  <section class="presentation-leaderboard-remaining">
                    <h2>Standings</h2>
                    <div class="presentation-leaderboard-standing-grid">
                      ${remaining.map((player, index) => renderStandingPlayer(escapeHtml, player, index)).join("")}
                    </div>
                  </section>
                `
              : ""}
          `
        : renderLeaderboardState(escapeHtml, snapshot)}
    </section>
  `;
}
