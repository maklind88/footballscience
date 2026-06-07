import {
  playerProfileAttributeGroups,
  playerProfileRoleOptions,
  playerRoleDnaDefinitions,
} from "./player-profile-options.mjs";

const roleGroups = Object.freeze({
  GK: "goalkeeper",
  LB: "defender",
  CB: "defender",
  RB: "defender",
  LWB: "defender",
  RWB: "defender",
  6: "midfielder",
  8: "midfielder",
  10: "midfielder",
  LW: "forward",
  RW: "forward",
  ST: "forward",
});

const compatibleRoles = Object.freeze({
  GK: ["GK"],
  LB: ["LWB", "CB", "RB"],
  CB: ["LB", "RB", "6"],
  RB: ["RWB", "CB", "LB"],
  LWB: ["LB", "LW", "RWB"],
  RWB: ["RB", "RW", "LWB"],
  6: ["8", "CB", "10"],
  8: ["6", "10", "LW", "RW"],
  10: ["8", "ST", "LW", "RW"],
  LW: ["LWB", "RW", "10", "ST"],
  RW: ["RWB", "LW", "10", "ST"],
  ST: ["10", "LW", "RW"],
});

export function createPlayerProfileIntelligenceHelpers(options = {}) {
  const formatDateValue = typeof options.formatDateValue === "function" ? options.formatDateValue : (date) => new Date(date).toISOString().slice(0, 10);
  const formatMedicalDateLabel = typeof options.formatMedicalDateLabel === "function" ? options.formatMedicalDateLabel : (value) => String(value || "");
  const getCompleteness = typeof options.getCompleteness === "function" ? options.getCompleteness : () => 0;
  const getMedicalSnapshot = typeof options.getMedicalSnapshot === "function" ? options.getMedicalSnapshot : () => null;
  const isDateValue = typeof options.isDateValue === "function" ? options.isDateValue : (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  const normalizeNumber = typeof options.normalizeNumber === "function" ? options.normalizeNumber : (value, fallback = 3) => Number(value) || fallback;
  const normalizeRole = typeof options.normalizeRole === "function" ? options.normalizeRole : (value, fallback = "8") => (playerProfileRoleOptions.includes(String(value || "").toUpperCase()) ? String(value).toUpperCase() : fallback);
  const parseDateValue = typeof options.parseDateValue === "function" ? options.parseDateValue : (value) => new Date(`${value}T00:00:00`);

  function getPlayerRoleDnaDefinition(role) {
    const roleKey = normalizeRole(role, "8");
    return playerRoleDnaDefinitions[roleKey] ?? playerRoleDnaDefinitions["8"];
  }

  function getPlayerRoleDnaAttributeBreakdown(player = {}) {
    const ratings = player.attributeRatings || {};
    return playerProfileAttributeGroups.map((group) => ({
      key: group.key,
      label: group.label,
      rating: normalizeNumber(ratings[group.key], 3),
    }));
  }

  function getPlayerRoleDnaAttributeFit(player = {}, role = "8") {
    const definition = getPlayerRoleDnaDefinition(role);
    const weightedTotal = playerProfileAttributeGroups.reduce((total, group) => {
      const weight = definition.weights?.[group.key] ?? 0.25;
      const rating = normalizeNumber(player.attributeRatings?.[group.key], 3);
      return total + rating * weight;
    }, 0);
    const weightTotal = playerProfileAttributeGroups.reduce((total, group) => total + (definition.weights?.[group.key] ?? 0.25), 0);
    return Math.round((weightedTotal / Math.max(weightTotal, 0.01)) * 20);
  }

  function getSquadMatrixRoleGroup(role) {
    return roleGroups[role] || "forward";
  }

  function getSquadMatrixCompatibleRoles(role) {
    return compatibleRoles[role] ?? [];
  }

  function getPlayerRoleDnaBaseFit(player = {}, role = "8") {
    const roleKey = normalizeRole(role, "");
    const primaryRole = normalizeRole(player.primaryRole, "");
    const secondaryRoles = Array.isArray(player.secondaryRoles) ? player.secondaryRoles.map((candidate) => normalizeRole(candidate, "")).filter(Boolean) : [];
    const compatible = getSquadMatrixCompatibleRoles(roleKey);
    if (!roleKey) return 0;
    if (primaryRole === roleKey) return 100;
    if (secondaryRoles.includes(roleKey)) return 86;
    if (compatible.includes(primaryRole)) return 72;
    if (secondaryRoles.some((candidate) => compatible.includes(candidate))) return 64;
    if (primaryRole && getSquadMatrixRoleGroup(primaryRole) === getSquadMatrixRoleGroup(roleKey)) return 52;
    return 32;
  }

  function getSquadMatrixSideAdjustment(player, role) {
    const preferredSide = String(player?.preferredSide ?? "").toLowerCase();
    if (!preferredSide || preferredSide === "any") return 0;
    if (["LB", "LWB", "LW"].includes(role)) return preferredSide === "left" ? 4 : preferredSide === "right" ? -3 : 0;
    if (["RB", "RWB", "RW"].includes(role)) return preferredSide === "right" ? 4 : preferredSide === "left" ? -3 : 0;
    if (["CB", "6", "8", "10", "ST", "GK"].includes(role)) return preferredSide === "center" ? 3 : 0;
    return 0;
  }

  function getSquadMatrixAvailabilityAdjustment(player) {
    const summary = player?.medicalSummary ?? {};
    const availabilityText = [player?.status, summary.currentAvailability, summary.availability, summary.rtpStatus, summary.status].filter(Boolean).join(" ").toLowerCase();
    if (/injur|unavailable|out|not available/.test(availabilityText)) return -24;
    if (/rehab|restricted|rtp|return/.test(availabilityText)) return -12;
    if (/limited|modified|partial|monitor/.test(availabilityText)) return -7;
    if (/available|fit|full|ready/.test(availabilityText)) return 4;
    return 0;
  }

  function getPlayerRoleDnaScore(player = {}, role = "8") {
    const roleKey = normalizeRole(role, "");
    if (!roleKey) return 0;
    const score = Math.round(
      getPlayerRoleDnaBaseFit(player, roleKey) * 0.62 +
      getPlayerRoleDnaAttributeFit(player, roleKey) * 0.38 +
      getSquadMatrixSideAdjustment(player, roleKey)
    );
    return Math.max(25, Math.min(99, score));
  }

  function getPlayerRoleDnaBestMatches(player = {}, limit = 3) {
    return playerProfileRoleOptions
      .map((role) => ({
        role,
        score: getPlayerRoleDnaScore(player, role),
        definition: getPlayerRoleDnaDefinition(role),
        attributeFit: getPlayerRoleDnaAttributeFit(player, role),
      }))
      .sort((first, second) => second.score - first.score || second.attributeFit - first.attributeFit)
      .slice(0, limit);
  }

  function getPlayerRoleDnaReasons(player = {}, role = "8") {
    const roleKey = normalizeRole(role, "8");
    const definition = getPlayerRoleDnaDefinition(roleKey);
    const baseFit = getPlayerRoleDnaBaseFit(player, roleKey);
    const attributeFit = getPlayerRoleDnaAttributeFit(player, roleKey);
    const sideAdjustment = getSquadMatrixSideAdjustment(player, roleKey);
    const availabilityAdjustment = getSquadMatrixAvailabilityAdjustment(player);
    const strongestAttribute = getPlayerRoleDnaAttributeBreakdown(player).sort((first, second) => second.rating - first.rating)[0];
    const strengths = [];
    const risks = [];
    if (player.primaryRole === roleKey) strengths.push(`Natural primary role as ${roleKey}`);
    else if (Array.isArray(player.secondaryRoles) && player.secondaryRoles.includes(roleKey)) strengths.push(`Secondary role coverage as ${roleKey}`);
    else if (baseFit >= 64) strengths.push(`Compatible role family for ${roleKey}`);
    if (attributeFit >= 76) strengths.push(`${definition.label} DNA fits the attribute model`);
    if (strongestAttribute) strengths.push(`${strongestAttribute.label} is the strongest current attribute`);
    if (sideAdjustment > 0) strengths.push("Preferred side supports the role");
    if (baseFit < 58) risks.push(`Not a natural ${roleKey} profile yet`);
    if (attributeFit < 62) risks.push("Attribute profile needs more evidence");
    if (sideAdjustment < 0) risks.push("Preferred side conflicts with the role");
    if (availabilityAdjustment < 0) risks.push("Availability reduces selection confidence");
    return { strengths: strengths.slice(0, 3), risks: risks.slice(0, 3) };
  }

  function getPlayerProfileRoleFitScore(player, role) {
    const roleKey = normalizeRole(role, "");
    return player && roleKey ? getPlayerRoleDnaScore(player, roleKey) : 0;
  }

  function getSquadStatusRank(statusKey) {
    const ranks = { important: 1, rotation: 2, depth: 3, development: 4, loan: 5 };
    return ranks[statusKey] ?? 9;
  }

  function getPlayerProfileDateDiffDays(fromDateValue, toDateValue) {
    if (!isDateValue(fromDateValue) || !isDateValue(toDateValue)) return 0;
    const fromDate = parseDateValue(fromDateValue);
    const toDate = parseDateValue(toDateValue);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(0, 0, 0, 0);
    return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
  }

  function getPlayerProfileDateValueFromTimestamp(value = "") {
    const parsedTime = Date.parse(value);
    return Number.isFinite(parsedTime) ? formatDateValue(new Date(parsedTime)) : "";
  }

  function getPlayerProfileIdpReviewLabel(reviewDate = "", todayValue = formatDateValue(new Date())) {
    if (!isDateValue(reviewDate)) return "";
    const daysUntilReview = getPlayerProfileDateDiffDays(todayValue, reviewDate);
    if (daysUntilReview < 0) return `Review overdue ${Math.abs(daysUntilReview)}d`;
    if (daysUntilReview === 0) return "Review today";
    if (daysUntilReview === 1) return "Review tomorrow";
    if (daysUntilReview <= 14) return `Review in ${daysUntilReview}d`;
    return `Review ${formatMedicalDateLabel(reviewDate)}`;
  }

  function getPlayerProfileIdpMissingFocusLabel(player, todayValue = formatDateValue(new Date())) {
    const anchorDate = getPlayerProfileDateValueFromTimestamp(player.updatedAt) || getPlayerProfileDateValueFromTimestamp(player.createdAt) || todayValue;
    return `No IDP focus · ${Math.max(0, getPlayerProfileDateDiffDays(anchorDate, todayValue))}d`;
  }

  function getPlayerProfileIdpFollowUpLabel(player, statusOption) {
    const idp = player.idp || {};
    const todayValue = formatDateValue(new Date());
    const nextAction = String(idp.nextAction || "").trim();
    const reviewLabel = getPlayerProfileIdpReviewLabel(idp.reviewDate, todayValue);
    if (statusOption.key === "none") return "No active IDP";
    if (!String(idp.primaryFocus || "").trim()) return getPlayerProfileIdpMissingFocusLabel(player, todayValue);
    if (nextAction && reviewLabel) return `${nextAction} · ${reviewLabel}`;
    if (reviewLabel) return reviewLabel;
    if (nextAction) return `Next: ${nextAction}`;
    if (statusOption.key === "review") return "Review needed";
    return "Set follow-up date";
  }

  function getSquadPlayerDataQualityFlags(player = {}) {
    const flags = [];
    const completeness = getCompleteness(player);
    const baselineAttributes = playerProfileAttributeGroups
      .map((group) => normalizeNumber(player.attributeRatings?.[group.key], 3))
      .every((value) => value === 3);
    const medicalSnapshot = player.id ? getMedicalSnapshot(player.id) : null;
    if (!player.primaryRole) flags.push({ key: "missing-role", label: "Missing primary role", severity: "critical" });
    if (!Array.isArray(player.secondaryRoles) || player.secondaryRoles.length === 0) flags.push({ key: "secondary-roles", label: "Add secondary roles", severity: "watch" });
    if (!player.preferredSide) flags.push({ key: "preferred-side", label: "Missing preferred side", severity: "watch" });
    if (baselineAttributes) flags.push({ key: "attributes", label: "Attribute ratings need review", severity: "watch" });
    if (!player.idp?.primaryFocus && player.idp?.status !== "none") flags.push({ key: "idp", label: "IDP focus missing", severity: "watch" });
    if (!medicalSnapshot || medicalSnapshot.latestLogSummary === "No medical log yet") flags.push({ key: "medical-link", label: "No medical log linked", severity: "watch" });
    if (completeness < 70) flags.push({ key: "profile-complete", label: `Profile ${completeness}% complete`, severity: "critical" });
    return flags;
  }

  return {
    getPlayerProfileDateDiffDays,
    getPlayerProfileDateValueFromTimestamp,
    getPlayerProfileIdpFollowUpLabel,
    getPlayerProfileIdpMissingFocusLabel,
    getPlayerProfileIdpReviewLabel,
    getPlayerProfileRoleFitScore,
    getPlayerRoleDnaAttributeBreakdown,
    getPlayerRoleDnaAttributeFit,
    getPlayerRoleDnaBaseFit,
    getPlayerRoleDnaBestMatches,
    getPlayerRoleDnaDefinition,
    getPlayerRoleDnaReasons,
    getPlayerRoleDnaScore,
    getSquadMatrixAvailabilityAdjustment,
    getSquadMatrixCompatibleRoles,
    getSquadMatrixRoleGroup,
    getSquadMatrixSideAdjustment,
    getSquadPlayerDataQualityFlags,
    getSquadStatusRank,
  };
}
