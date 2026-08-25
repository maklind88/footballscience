const GENERIC_THREAD_TITLES = new Set([
  "",
  "chat",
  "team chat",
  "group chat",
  "direct message",
  "direct message chat",
  "private chat",
  "unknown",
  "unknown user",
  "staff",
]);

function normalizeIdentityValue(value = "") {
  return String(value || "").trim();
}

export function isGenericDashboardChatIdentity(value = "") {
  return GENERIC_THREAD_TITLES.has(normalizeIdentityValue(value).toLowerCase());
}

export function isTechnicalDashboardChatIdentity(value = "") {
  const normalized = normalizeIdentityValue(value);
  if (!normalized) {
    return true;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }
  return (
    /^(?:user|usr|auth|profile|member)[_:-][a-z0-9_-]+$/i.test(normalized) ||
    (/^[a-z0-9_-]{18,}$/i.test(normalized) && /\d/.test(normalized))
  );
}

export function resolveDashboardChatParticipantName(participant = null, formatUserName = () => "") {
  if (!participant) {
    return "";
  }
  const profile = [
    participant.profile,
    participant.user,
    participant.userProfile,
    participant.user_profile,
    participant.metadata?.profile,
    participant.metadata,
  ].find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || {};
  const composedName = [
    participant.firstName || participant.first_name || profile.firstName || profile.first_name,
    participant.lastName || participant.last_name || profile.lastName || profile.last_name,
  ].map(normalizeIdentityValue).filter(Boolean).join(" ");
  const technicalValues = new Set([
    participant.id,
    participant.userId,
    participant.user_id,
    participant.profileId,
    participant.profile_id,
    profile.id,
    profile.userId,
    profile.user_id,
  ].map(normalizeIdentityValue).filter(Boolean));
  const email = normalizeIdentityValue(participant.email || profile.email);
  const emailName = email
    ? email.split("@", 1)[0]
      .split(/[._-]+/)
      .filter((part) => /^[a-z][a-z'-]*$/i.test(part))
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(" ")
    : "";
  const candidates = [
    composedName,
    participant.name,
    participant.fullName,
    participant.full_name,
    participant.displayName,
    participant.display_name,
    profile.name,
    profile.fullName,
    profile.full_name,
    profile.displayName,
    profile.display_name,
    formatUserName(participant),
    emailName,
  ].map(normalizeIdentityValue);
  return candidates.find((value) =>
    value &&
    !technicalValues.has(value) &&
    !isGenericDashboardChatIdentity(value) &&
    !isTechnicalDashboardChatIdentity(value)
  ) || "";
}

export function resolveDashboardChatThreadIdentity({
  threadId = "",
  type = "",
  isTeamThread = false,
  teamTitle = "Team Chat",
  customTitle = "",
  apiTitle = "",
  currentUser = null,
  participants = [],
  messages = [],
  users = [],
  isSameUser = () => false,
  formatUserName = () => "",
} = {}) {
  if (isTeamThread || type === "team") {
    return normalizeIdentityValue(teamTitle) || "Team Chat";
  }

  const normalizedType = normalizeIdentityValue(type).toLowerCase();
  const isGroup = normalizedType === "group" || String(threadId).startsWith("group-") || String(threadId).startsWith("group:");
  if (isGroup) {
    const groupTitle = [customTitle, apiTitle]
      .map(normalizeIdentityValue)
      .find((value) => value && !isGenericDashboardChatIdentity(value) && !isTechnicalDashboardChatIdentity(value));
    return groupTitle || "Group chat";
  }

  const participantCandidates = (Array.isArray(participants) ? participants : [])
    .filter((participant) => participant && !isSameUser(participant, currentUser));
  const authorCandidates = (Array.isArray(messages) ? [...messages].reverse() : [])
    .map((message) => {
      const authorId = normalizeIdentityValue(message?.userId || message?.authorId || message?.senderId || message?.author?.id);
      return users.find((user) => normalizeIdentityValue(user?.id) === authorId) || message?.author || null;
    })
    .filter((author) => author && !isSameUser(author, currentUser));
  const [, firstId = "", secondId = ""] = String(threadId || "").split(":");
  const idCandidates = [firstId, secondId]
    .map((id) => users.find((user) => normalizeIdentityValue(user?.id) === normalizeIdentityValue(id)))
    .filter((user) => user && !isSameUser(user, currentUser));
  const directName = [...participantCandidates, ...authorCandidates, ...idCandidates]
    .map((candidate) => resolveDashboardChatParticipantName(candidate, formatUserName))
    .find(Boolean);
  return directName || "Former teammate";
}
