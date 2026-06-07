export const adminTitleSuggestions = Object.freeze([
  "Sporting Director",
  "Head of Scouting",
  "Scout",
  "Recruitment Analyst",
  "Opposition Analyst",
  "Coach",
]);

export const adminDepartmentSuggestions = Object.freeze([
  "Football",
  "Scouting",
  "Recruitment",
  "Analysis",
  "Performance",
  "Medical",
]);

export function formatAdminDateTime(value) {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatAuditActor(entry) {
  return entry?.actor?.name || entry?.actor?.email || "System";
}

export function formatAuditTarget(entry) {
  return entry?.target?.name || entry?.target?.email || "";
}

export function formatAuditActionLabel(action) {
  const labels = {
    "user.created": "User created",
    "user.updated": "User updated",
    "user.removed": "User removed",
    "profile.updated": "Profile updated",
    "user.reset_email_sent": "Reset email",
    "access.updated": "Access changed",
  };
  return labels[action] || String(action || "Activity");
}

export function getAdminUserInitials(user = {}, options = {}) {
  const formatUserName = typeof options.formatUserName === "function" ? options.formatUserName : (value = {}) => value.name || "";
  const normalizeText = typeof options.normalizeText === "function" ? options.normalizeText : (value, fallback = "") => String(value || fallback).trim();
  const name = formatUserName(user);
  const first = normalizeText(user.firstName || name.split(" ")[0], "");
  const last = normalizeText(user.lastName || name.split(" ").slice(-1)[0], "");
  return `${first[0] || "U"}${last[0] || ""}`.toUpperCase();
}
