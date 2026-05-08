export const homeChatStorageKey = "football-dashboard-chat-v1";
export const homeChatTeamThreadId = "team";
export const homeChatReactionKeys = Object.freeze(["seen", "agree", "done", "question"]);
export const homeChatPriorityKeys = Object.freeze(["normal", "important", "urgent"]);
export const chatStorageKey = homeChatStorageKey;
export const chatTeamThreadId = homeChatTeamThreadId;
export const chatReactionKeys = homeChatReactionKeys;
export const chatPriorityKeys = homeChatPriorityKeys;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function defaultNow() {
  return new Date().toISOString();
}

function defaultIdFactory() {
  return `home-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function uniqueTextList(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(normalizeText).filter(Boolean)));
}

export function parseHomeChatPayload(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  if (!rawValue || typeof rawValue !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeHomeChatThreadId(rawThreadId, fallbackThreadId = homeChatTeamThreadId) {
  const threadId = normalizeText(rawThreadId || fallbackThreadId);
  if (!threadId || threadId === homeChatTeamThreadId) {
    return homeChatTeamThreadId;
  }

  if (!threadId.startsWith("dm:")) {
    return homeChatTeamThreadId;
  }

  const [, leftId = "", rightId = ""] = threadId.split(":");
  const normalizedIds = [leftId, rightId].map(normalizeText).filter(Boolean).sort();
  if (normalizedIds.length !== 2 || normalizedIds[0] === normalizedIds[1]) {
    return homeChatTeamThreadId;
  }

  return `dm:${normalizedIds[0]}:${normalizedIds[1]}`;
}

export function createHomeChatDirectThreadId(firstUserId, secondUserId) {
  return normalizeHomeChatThreadId(`dm:${normalizeText(firstUserId)}:${normalizeText(secondUserId)}`, homeChatTeamThreadId);
}

export function formatHomeChatUserName(user = {}) {
  const fullName = [user.firstName || user.first_name, user.lastName || user.last_name].map(normalizeText).filter(Boolean).join(" ");
  return fullName || normalizeText(user.username) || normalizeEmail(user.email).split("@", 1)[0] || "Staff";
}

export function normalizeHomeChatMentionToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]/g, "");
}

export function getHomeChatMentionKeys(user = {}) {
  const emailHandle = normalizeEmail(user.email).split("@", 1)[0];
  const fullName = `${user.firstName || user.first_name || ""}.${user.lastName || user.last_name || ""}`;
  return new Set(
    [user.username, emailHandle, user.firstName, user.first_name, user.lastName, user.last_name, fullName, formatHomeChatUserName(user).replace(/\s+/g, ".")]
      .map(normalizeHomeChatMentionToken)
      .filter(Boolean)
  );
}

export function getHomeChatMentionUserIdsForToken(token, users = [], authorUserId = "") {
  const normalizedToken = normalizeHomeChatMentionToken(token);
  if (!normalizedToken) {
    return [];
  }

  const cleanAuthorUserId = normalizeText(authorUserId);
  const activeUsers = users.filter((user) => user.status === "active" && user.id !== cleanAuthorUserId);
  if (["all", "team", "staff", "everyone"].includes(normalizedToken)) {
    return activeUsers.map((user) => user.id).filter(Boolean);
  }

  return activeUsers.filter((user) => getHomeChatMentionKeys(user).has(normalizedToken)).map((user) => user.id).filter(Boolean);
}

export function getHomeChatMentionUserIds(text, users = [], authorUserId = "") {
  const mentionedUserIds = new Set();
  for (const match of normalizeText(text).matchAll(/@([a-zA-Z0-9._-]{2,64})/g)) {
    getHomeChatMentionUserIdsForToken(match[1], users, authorUserId).forEach((userId) => mentionedUserIds.add(userId));
  }

  return Array.from(mentionedUserIds);
}

export function normalizeHomeChatAuthor(author = {}) {
  const id = normalizeText(author?.id);
  if (!id) {
    return null;
  }

  return Object.freeze({
    id,
    email: normalizeEmail(author.email),
    username: normalizeText(author.username),
    firstName: normalizeText(author.firstName || author.first_name),
    lastName: normalizeText(author.lastName || author.last_name),
    role: normalizeText(author.role || "coach").toLowerCase(),
    title: normalizeText(author.title),
    department: normalizeText(author.department),
    team: normalizeText(author.team),
    status: normalizeText(author.status || "active").toLowerCase(),
    profileImageUrl: normalizeText(author.profileImageUrl || author.profile_image_url),
  });
}

export function normalizeHomeChatReactions(reactions = {}) {
  return Object.freeze(
    Object.fromEntries(homeChatReactionKeys.map((key) => [key, Object.freeze(uniqueTextList(reactions?.[key]))]))
  );
}

export function normalizeHomeChatPriority(value) {
  const priority = normalizeText(value || "normal").toLowerCase();
  return homeChatPriorityKeys.includes(priority) ? priority : "normal";
}

export function normalizeHomeChatMessage(message = {}, options = {}) {
  const currentUserId = normalizeText(options.currentUserId);
  const userId = normalizeText(message?.userId || currentUserId);
  const text = normalizeText(message?.text);
  const createdAt = normalizeText(message?.createdAt) || normalizeText(options.now) || defaultNow();
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : defaultIdFactory;
  const mentionedUserIds = Array.isArray(message?.mentionedUserIds)
    ? uniqueTextList(message.mentionedUserIds)
    : getHomeChatMentionUserIds(text, options.users || [], userId);

  return Object.freeze({
    id: normalizeText(message?.id) || normalizeText(idFactory(message)),
    userId,
    threadId: normalizeHomeChatThreadId(message?.threadId, homeChatTeamThreadId),
    text,
    createdAt,
    deliveredAt: normalizeText(message?.deliveredAt || createdAt),
    readBy: Object.freeze(uniqueTextList([userId, ...(Array.isArray(message?.readBy) ? message.readBy : [])])),
    mentionedUserIds: Object.freeze(mentionedUserIds),
    reactions: normalizeHomeChatReactions(message?.reactions),
    replyToId: normalizeText(message?.replyToId),
    priority: normalizeHomeChatPriority(message?.priority),
    pinnedAt: normalizeText(message?.pinnedAt),
    pinnedBy: normalizeText(message?.pinnedBy),
    author: normalizeHomeChatAuthor(message?.author || message?.user || null),
  });
}

export function normalizeHomeChatMessages(rawValue, options = {}) {
  return parseHomeChatPayload(rawValue)
    .map((message, index) =>
      normalizeHomeChatMessage(message, {
        ...options,
        idFactory: message?.id
          ? options.idFactory
          : () =>
              typeof options.idFactory === "function"
                ? options.idFactory(message, index)
                : defaultIdFactory(message, index),
      })
    )
    .filter((message) => message.text && message.userId)
    .sort((first, second) => parseTime(first.createdAt) - parseTime(second.createdAt));
}

export function selectHomeChatThreadMessages(messages = [], threadId = homeChatTeamThreadId) {
  const normalizedThreadId = normalizeHomeChatThreadId(threadId, homeChatTeamThreadId);
  return Object.freeze(messages.filter((message) => message.threadId === normalizedThreadId));
}

export function getHomeChatThreadParticipants(threadId, users = []) {
  const normalizedThreadId = normalizeHomeChatThreadId(threadId);
  if (normalizedThreadId === homeChatTeamThreadId) {
    return [];
  }

  const [, firstId = "", secondId = ""] = normalizedThreadId.split(":");
  return [firstId, secondId].map((userId) => users.find((user) => user.id === userId)).filter(Boolean);
}

export function formatHomeChatThreadLabel(threadId, currentUser = {}, users = []) {
  const normalizedThreadId = normalizeHomeChatThreadId(threadId);
  if (normalizedThreadId === homeChatTeamThreadId) {
    return "Team Chat";
  }

  const [, firstId = "", secondId = ""] = normalizedThreadId.split(":");
  const partnerId = firstId === currentUser?.id ? secondId : firstId;
  const partner = users.find((user) => user.id === partnerId);
  return partner ? formatHomeChatUserName(partner) : "Direct Message";
}

export function selectHomeChatThreadData(threadId, options = {}) {
  const currentUser = options.currentUser || null;
  const users = options.users || [];
  const messages = options.messages || [];
  const normalizedThreadId = normalizeHomeChatThreadId(threadId, homeChatTeamThreadId);
  const isTeamThread = normalizedThreadId === homeChatTeamThreadId;
  const participants = isTeamThread
    ? []
    : getHomeChatThreadParticipants(normalizedThreadId, users).filter((user) => user?.id !== currentUser?.id);
  const threadMessages = selectHomeChatThreadMessages(messages, normalizedThreadId);
  const unreadCount = currentUser?.id
    ? threadMessages.filter((message) => message.userId !== currentUser.id && !message.readBy.includes(currentUser.id)).length
    : 0;
  const mentionCount = currentUser?.id
    ? threadMessages.filter(
        (message) =>
          message.userId !== currentUser.id &&
          message.mentionedUserIds.includes(currentUser.id) &&
          !message.readBy.includes(currentUser.id)
      ).length
    : 0;

  return Object.freeze({
    threadId: normalizedThreadId,
    label: formatHomeChatThreadLabel(normalizedThreadId, currentUser, users),
    isTeamThread,
    participant: participants[0] || null,
    messageCount: threadMessages.length,
    unreadCount,
    mentionCount,
    lastMessage: threadMessages.length ? threadMessages[threadMessages.length - 1] : null,
  });
}

export function selectHomeChatThreadList(options = {}) {
  const currentUser = options.currentUser || null;
  const users = options.users || [];
  const messages = options.messages || [];

  if (!currentUser?.id) {
    return Object.freeze([selectHomeChatThreadData(homeChatTeamThreadId, { currentUser, users, messages })]);
  }

  const activeUsers = users.filter((user) => user.status === "active" && user.id !== currentUser.id);
  const teamThread = selectHomeChatThreadData(homeChatTeamThreadId, { currentUser, users, messages });
  const directThreads = activeUsers.map((user) =>
    selectHomeChatThreadData(createHomeChatDirectThreadId(currentUser.id, user.id), { currentUser, users, messages })
  );

  directThreads.sort((first, second) => {
    const firstTime = parseTime(first.lastMessage?.createdAt);
    const secondTime = parseTime(second.lastMessage?.createdAt);
    if (firstTime === secondTime) {
      return formatHomeChatUserName(first.participant).localeCompare(formatHomeChatUserName(second.participant), undefined, {
        sensitivity: "base",
      });
    }

    return secondTime - firstTime;
  });

  return Object.freeze([teamThread, ...directThreads]);
}

export function getHomeChatUnreadCountForUser(currentUser, messages = [], users = []) {
  if (!currentUser?.id) {
    return 0;
  }

  return selectHomeChatThreadList({ currentUser, users, messages }).reduce((total, thread) => total + thread.unreadCount, 0);
}
