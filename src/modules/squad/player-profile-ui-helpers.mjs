import { escapeHtml } from "../../core/runtime-ui-helpers.mjs";

export function getSquadChangeSummary(type, player = {}, changes = []) {
  if (type === "player-added") {
    return `${player?.name || "Player"} added to Squad`;
  }
  if (type === "player-removed") {
    return `${player?.name || "Player"} removed from Squad`;
  }
  if (type === "squad-import") {
    return `${changes.length || 0} player profiles imported`;
  }
  const roleChange = changes.find((change) => change.field === "Primary role");
  if (roleChange) {
    return `${player?.name || "Player"} role changed to ${roleChange.to}`;
  }
  const firstChange = changes[0];
  return firstChange
    ? `${player?.name || "Player"} updated: ${firstChange.field}`
    : `${player?.name || "Player"} profile saved`;
}

export function getPlayerProfileCompleteness(player = {}) {
  const checks = [
    player.name,
    player.position,
    player.primaryRole,
    player.roleGroup,
    player.preferredSide,
    player.squadStatus,
    player.careerPhase,
    player.idp?.primaryFocus,
    player.idp?.nextAction || player.idp?.focusAreas,
    player.futureData?.performanceNotes || player.futureData?.scoutingNotes,
    player.coachNotes,
  ];
  const completeCount = checks.filter((value) => String(value ?? "").trim()).length;
  return Math.round((completeCount / checks.length) * 100);
}

export function renderPlayerProfileAvatar(player = {}, className = "player-profile-avatar") {
  const initials = String(player.name || "")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return `
    <span class="${className}${player.photoUrl ? " has-photo" : ""}">
      ${player.photoUrl ? `<img src="${escapeHtml(player.photoUrl)}" alt="" loading="lazy" />` : escapeHtml(initials)}
    </span>
  `;
}

export function renderPlayerProfileAvatarUpload(player = {}, canEdit = false) {
  const avatar = renderPlayerProfileAvatar(player, "squad-profile-avatar");
  if (!canEdit) {
    return avatar;
  }
  const label = player.photoUrl ? "Change player image" : "Upload player image";
  return `
    <label class="squad-profile-avatar-upload" title="${escapeHtml(label)}">
      ${avatar}
      <input
        type="file"
        accept="image/*"
        data-player-profile-photo-upload="${escapeHtml(player.id)}"
        aria-label="${escapeHtml(`Upload image for ${player.name}`)}"
      />
      <span class="squad-profile-avatar-upload-dot" aria-hidden="true">+</span>
    </label>
  `;
}

export function getPlayerProfileImportUndoRelativeTimeLabel(timestamp) {
  if (!timestamp) {
    return "";
  }
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) {
    return "";
  }
  const diffMs = Date.now() - parsed;
  if (diffMs < 0) {
    return "";
  }
  const absMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (absMinutes < 1) {
    return "just now";
  }
  if (absMinutes < 60) {
    return `${absMinutes} minute${absMinutes === 1 ? "" : "s"} ago`;
  }
  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) {
    return `${absHours} hour${absHours === 1 ? "" : "s"} ago`;
  }
  const absDays = Math.floor(absHours / 24);
  if (absDays < 30) {
    return `${absDays} day${absDays === 1 ? "" : "s"} ago`;
  }
  const absWeeks = Math.floor(absDays / 7);
  if (absWeeks < 5) {
    return `${absWeeks} week${absWeeks === 1 ? "" : "s"} ago`;
  }
  return "";
}
