import { escapeLeaderboardHtml, getLeaderboardInitials, normalizeLeaderboardText } from "./leaderboard-helpers.mjs";

const maxLeaderboardProfilePhotoLength = 900000;

function normalizeLeaderboardPhotoUrl(value = "") {
  const photoUrl = String(value ?? "").trim();
  if (!photoUrl || photoUrl.length > maxLeaderboardProfilePhotoLength) return "";
  if (/^data:image\/(?:avif|gif|jpe?g|png|webp);base64,[a-z0-9+/]+=*$/i.test(photoUrl)) {
    // The current roster projection used to cut inline images at exactly 1,800
    // characters. Reject that known-invalid shape instead of rendering a broken image.
    return photoUrl.length === 1800 ? "" : photoUrl;
  }
  return /^(?:https?:\/\/|blob:|\/(?!\/))/i.test(photoUrl) ? photoUrl : "";
}

export function resolveLeaderboardProfilePhoto(player = {}, context = {}) {
  const serverPhotoUrl = normalizeLeaderboardPhotoUrl(player.photoUrl);
  if (serverPhotoUrl) return serverPhotoUrl;

  const playerId = normalizeLeaderboardText(player.playerId || player.id, 160);
  if (!playerId || typeof context.getPlayerProfilesState !== "function") return "";
  try {
    const profiles = context.getPlayerProfilesState()?.players;
    if (!Array.isArray(profiles)) return "";
    const matches = profiles.filter((profile) => normalizeLeaderboardText(profile?.id, 160) === playerId);
    if (matches.length !== 1) return "";
    return normalizeLeaderboardPhotoUrl(matches[0].photoUrl || matches[0].photo_url);
  } catch {
    return "";
  }
}

export function renderLeaderboardAvatar(player = {}, className = "leaderboard-avatar") {
  const name = normalizeLeaderboardText(player.name || player.playerName || "Player", 120);
  const photoUrl = normalizeLeaderboardPhotoUrl(player.photoUrl);
  const initials = getLeaderboardInitials(name);
  return `
    <span class="${escapeLeaderboardHtml(className)}${photoUrl ? " has-photo" : ""}" aria-hidden="true">
      ${photoUrl ? `<img src="${escapeLeaderboardHtml(photoUrl)}" alt="" loading="lazy" onerror="this.closest('.leaderboard-avatar')?.classList.remove('has-photo');this.remove()" />` : ""}
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
