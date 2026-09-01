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

function renderPodiumPlayer(escapeHtml, player = {}, index = 0) {
  const rank = Number(player.rank) || index + 1;
  return `
    <article class="presentation-leaderboard-podium-player is-rank-${Math.min(3, rank)}">
      <span class="presentation-leaderboard-rank" aria-label="Rank ${escapeHtml(rank)}">${escapeHtml(rank)}</span>
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
      <span class="presentation-leaderboard-standing-rank">${escapeHtml(rank)}</span>
      ${renderAvatar(escapeHtml, player)}
      <div class="presentation-leaderboard-player-copy">
        <strong title="${escapeHtml(player.name || "Player")}">${escapeHtml(player.name || "Player")}</strong>
        ${renderPlayerMeta(escapeHtml, player)}
      </div>
      <strong class="presentation-leaderboard-standing-points">${escapeHtml(player.points || 0)}</strong>
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
              ${podium.map((player, index) => renderPodiumPlayer(escapeHtml, player, index)).join("")}
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
