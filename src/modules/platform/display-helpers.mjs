function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultNormalizeText(value, fallback = "") {
  return String(value || fallback).trim();
}

function defaultNormalizeImageUrl(value = "") {
  return String(value ?? "").trim();
}

export const defaultMaxProfileImageUrlLength = 1800;
export const defaultMaxProfileImageUploadDataUrlLength = 900000;

export function formatPlatformUserName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "Unknown User";
}

export function getPlatformUserInitials(user) {
  const firstInitial = user?.firstName?.trim()?.[0] ?? "";
  const lastInitial = user?.lastName?.trim()?.[0] ?? "";
  return `${firstInitial}${lastInitial}`.toUpperCase() || "U";
}

export function getPlatformRoleLabel(role) {
  const labels = {
    admin: "Platform Admin",
    "club-admin": "Club Admin",
    "team-admin": "Team Admin",
    coach: "Coach",
    scout: "Scout",
    analyst: "Analyst",
    performance: "Performance",
    medical: "Medical",
    guest: "Guest",
  };
  return labels[role] ?? "Coach";
}

export function normalizePlatformProfileImageUrl(value = "", limits = {}) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) {
    return "";
  }
  const maxUploadDataUrlLength = Number(limits.maxUploadDataUrlLength) || defaultMaxProfileImageUploadDataUrlLength;
  const maxUrlLength = Number(limits.maxUrlLength) || defaultMaxProfileImageUrlLength;
  if (cleanValue.startsWith("data:image/")) {
    return cleanValue.length <= maxUploadDataUrlLength ? cleanValue : "";
  }
  if (cleanValue.length > maxUrlLength) {
    return "";
  }
  return cleanValue;
}

export function getPlatformUserProfileImageUrl(user, limits = {}) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const value =
    [
      user?.profileImageUrl,
      user?.profile_image_url,
      user?.avatarUrl,
      user?.avatar_url,
      metadata.profileImageUrl,
      metadata.profile_image_url,
      metadata.avatarUrl,
      metadata.avatar_url,
    ].find((candidate) => String(candidate || "").trim()) || "";
  return normalizePlatformProfileImageUrl(value, limits);
}

export function createPlatformDisplayHelpers(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const normalizeText = typeof options.normalizeText === "function" ? options.normalizeText : defaultNormalizeText;
  const normalizeImageUrl = typeof options.normalizeImageUrl === "function" ? options.normalizeImageUrl : defaultNormalizeImageUrl;
  const getUserProfileImageUrl =
    typeof options.getUserProfileImageUrl === "function" ? options.getUserProfileImageUrl : () => "";
  const getUserInitials = typeof options.getUserInitials === "function" ? options.getUserInitials : () => "U";

  function getPlatformTeamLogoUrl(team) {
    return normalizeImageUrl(team?.logoUrl || team?.logo_url || team?.logo || team?.badgeUrl || team?.crestUrl || "");
  }

  function getPlatformTeamLogoInitials(team = {}, fallbackName = "Team") {
    const shortName = normalizeText(team?.shortName || team?.short_name, "");
    if (shortName && shortName.length <= 4) {
      return shortName.toUpperCase();
    }
    const name = normalizeText(team?.name || fallbackName, "Team");
    return (
      name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 3)
        .toUpperCase() || "TM"
    );
  }

  function renderPlatformTeamLogoMark(team = {}, renderOptions = {}) {
    const teamName = normalizeText(team?.name || renderOptions.teamName, "Team");
    const logoUrl = getPlatformTeamLogoUrl(team);
    const canUpload = Boolean(renderOptions.canUpload);
    const content = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(`${teamName} logo`)}" />`
      : `<strong>${escapeHtml(getPlatformTeamLogoInitials(team, teamName))}</strong>`;
    const uploadInput = canUpload
      ? `<input type="file" accept="image/*" data-squad-team-logo-upload aria-label="Upload team logo" />`
      : "";
    const uploadDot = canUpload ? `<span class="squad-team-logo-upload-dot" aria-hidden="true">+</span>` : "";
    const className = `squad-module-mark squad-team-logo-mark${logoUrl ? " has-logo" : " is-empty"}${canUpload ? " can-upload" : ""}`;
    const label = logoUrl ? `Change ${teamName} logo` : `Upload ${teamName} logo`;
    return canUpload
      ? `<label class="${className}" title="${escapeHtml(label)}">${content}${uploadInput}${uploadDot}</label>`
      : `<span class="${className}" aria-label="${escapeHtml(`${teamName} logo`)}">${content}</span>`;
  }

  function renderUserAvatar(user, className) {
    const profileImageUrl = getUserProfileImageUrl(user);
    const avatarClassName = `${className}${profileImageUrl ? " has-photo" : ""}`;
    return `
    <span class="${avatarClassName}">
      ${profileImageUrl ? `<img src="${escapeHtml(profileImageUrl)}" alt="" />` : escapeHtml(getUserInitials(user))}
    </span>
  `;
  }

  function applyUserAvatar(element, user) {
    if (!element) {
      return;
    }
    const profileImageUrl = getUserProfileImageUrl(user);
    element.classList.toggle("has-photo", Boolean(profileImageUrl));
    element.innerHTML = profileImageUrl
      ? `<img src="${escapeHtml(profileImageUrl)}" alt="" />`
      : escapeHtml(getUserInitials(user));
  }

  return {
    applyUserAvatar,
    getPlatformTeamLogoInitials,
    getPlatformTeamLogoUrl,
    renderPlatformTeamLogoMark,
    renderUserAvatar,
  };
}
