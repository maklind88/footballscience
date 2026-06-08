import { escapeHtml } from "../../core/runtime-ui-helpers.mjs";

const defaultNormalizeNumber = (value, fallback = 3) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(1, Math.min(5, Math.round(numericValue))) : fallback;
};

function getProfileFormData(form) {
  return form && typeof form.get === "function" && typeof form.getAll === "function" ? form : new FormData(form);
}

function profileFormHasField(form, formData, name) {
  if (form && typeof form.querySelector === "function") {
    return Boolean(form.querySelector(`[name="${name}"]`));
  }
  return Boolean(formData?.has?.(name));
}

export function createPlayerProfileFormValueReader(options = {}) {
  const attributeGroups = Array.isArray(options.attributeGroups) ? options.attributeGroups : [];
  const normalizeNumber = typeof options.normalizeNumber === "function" ? options.normalizeNumber : defaultNormalizeNumber;

  return function getPlayerProfileFormValues(form) {
    const data = getProfileFormData(form);
    const hasField = (name) => profileFormHasField(form, data, name);
    const attributeRatings = attributeGroups.reduce((result, group) => {
      result[group.key] = normalizeNumber(data.get(`rating.${group.key}`), 3);
      return result;
    }, {});
    const futureData = {
      performanceNotes: String(data.get("performanceNotes") ?? "").trim(),
      scoutingNotes: String(data.get("scoutingNotes") ?? "").trim(),
      analysisNotes: String(data.get("analysisNotes") ?? "").trim(),
    };
    const values = {
      playerId: String(data.get("playerId") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      number: String(data.get("number") ?? "").trim(),
      position: String(data.get("position") ?? "").trim(),
      status: String(data.get("status") ?? "").trim(),
      squadStatus: String(data.get("squadStatus") ?? "").trim(),
      careerPhase: String(data.get("careerPhase") ?? "").trim(),
      primaryRole: String(data.get("primaryRole") ?? "").trim(),
      secondaryRoles: data.getAll("secondaryRoles").map((role) => String(role).trim()),
      preferredSide: String(data.get("preferredSide") ?? "").trim(),
      roleGroup: String(data.get("roleGroup") ?? "").trim(),
      coachNotes: String(data.get("coachNotes") ?? "").trim(),
      attributeRatings,
      idp: {
        status: String(data.get("idpStatus") ?? "").trim(),
        primaryFocus: String(data.get("idpPrimaryFocus") ?? "").trim(),
        strengths: String(data.get("idpStrengths") ?? "").trim(),
        focusAreas: String(data.get("idpFocusAreas") ?? "").trim(),
        nextAction: String(data.get("idpNextAction") ?? "").trim(),
        reviewDate: String(data.get("idpReviewDate") ?? "").trim(),
      },
      futureData,
    };
    if (hasField("age")) values.age = String(data.get("age") ?? "").trim();
    if (hasField("birthDate")) values.birthDate = String(data.get("birthDate") ?? "").trim();
    if (hasField("rosterType")) values.rosterType = String(data.get("rosterType") ?? "").trim();
    if (hasField("temporaryGroup")) values.temporaryGroup = String(data.get("temporaryGroup") ?? "").trim();
    if (hasField("temporaryFrom")) values.temporaryFrom = String(data.get("temporaryFrom") ?? "").trim();
    if (hasField("temporaryTo")) values.temporaryTo = String(data.get("temporaryTo") ?? "").trim();
    if (hasField("photoUrl")) values.photoUrl = String(data.get("photoUrl") ?? "").trim();
    return values;
  };
}

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
