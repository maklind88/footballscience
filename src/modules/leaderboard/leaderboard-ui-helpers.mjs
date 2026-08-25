import { escapeLeaderboardHtml, getLeaderboardInitials, normalizeLeaderboardText } from "./leaderboard-helpers.mjs";

export function renderLeaderboardAvatar(player = {}, className = "leaderboard-avatar") {
  const name = normalizeLeaderboardText(player.name || player.playerName || "Player", 120);
  const photoUrl = normalizeLeaderboardText(player.photoUrl, 1800);
  const initials = getLeaderboardInitials(name);
  return `
    <span class="${escapeLeaderboardHtml(className)}${photoUrl ? " has-photo" : ""}" aria-hidden="true">
      ${photoUrl ? `<img src="${escapeLeaderboardHtml(photoUrl)}" alt="" loading="lazy" />` : ""}
      <strong>${escapeLeaderboardHtml(initials)}</strong>
    </span>
  `;
}

export function renderLeaderboardTeamMark(context = {}) {
  const team = context.team || {};
  const teamName = normalizeLeaderboardText(context.teamName || team.name || "Your team", 120);
  const logoUrl = normalizeLeaderboardText(
    context.teamLogoUrl || context.logo || team.logoUrl || team.logo_url || "",
    1800,
  );
  return `
    <span class="leaderboard-team-mark${logoUrl ? " has-logo" : ""}" aria-label="${escapeLeaderboardHtml(`${teamName} crest`)}">
      ${logoUrl ? `<img src="${escapeLeaderboardHtml(logoUrl)}" alt="" />` : ""}
      <strong>${escapeLeaderboardHtml(getLeaderboardInitials(teamName))}</strong>
    </span>
  `;
}

export function formatLeaderboardRank(rank = 0, shared = false) {
  const cleanRank = Number(rank) || 0;
  if (!cleanRank) return "—";
  return `${shared ? "=" : ""}${cleanRank}`;
}
