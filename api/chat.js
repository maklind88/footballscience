const crypto = require("crypto");
const {
  getCurrentActor,
  parseJsonBody,
  readConfig,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const {
  handleDatabaseChatRequest,
  isDatabaseChatEnabled,
} = require("./_lib/chat-database.js");

const STORAGE_BUCKET = "footballscience-app-state";
const STORAGE_PREFIX = "global";
const APP_STATE_SCHEMA = "footballscience-app-state-v1";
const CHAT_STATE_KEY = "football-dashboard-chat-v1";
const CHAT_LEGACY_SCHEMA = "football-dashboard-chat-v1";
const CHAT_API_SCHEMA = "footballscience-chat-api-v1";
const MAX_MESSAGE_LENGTH = 1600;
const MAX_AUDIT_ENTRIES = 200;
const MAX_TEXT_FIELD_LENGTH = 240;
const MAX_THREAD_TITLE_LENGTH = 80;
const MAX_ID_LENGTH = 120;
const MAX_REACTION_LENGTH = 32;
const STAFF_ROLES = new Set(["admin", "coach", "analyst", "performance", "medical"]);
const CHAT_MANAGER_ROLES = new Set(["admin", "coach"]);
const CHAT_ADMIN_ROLES = new Set(["admin"]);
const CHAT_ACTIONS = new Set([
  "createThread",
  "sendMessage",
  "editMessage",
  "deleteMessage",
  "setMessagePinned",
  "setMessagePriority",
  "addReaction",
  "removeReaction",
  "markThreadRead",
  "clearThread",
  "createAttachmentIntent",
]);
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = {
  createThread: 8,
  sendMessage: 24,
  editMessage: 24,
  deleteMessage: 20,
  setMessagePinned: 30,
  setMessagePriority: 30,
  addReaction: 80,
  removeReaction: 80,
  markThreadRead: 120,
  clearThread: 5,
  default: 60,
};
const DEFAULT_RETENTION_POLICY = {
  activeMessageDays: 365,
  deletedMessageDays: 30,
  auditDays: 730,
  maxMessagesPerThread: 5000,
};
const rateLimitBuckets = new Map();

function randomId(prefix = "chat") {
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

function normalizeString(value, maxLength = MAX_TEXT_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeId(value, fallback = "") {
  const normalized = normalizeString(value, MAX_ID_LENGTH).replace(/[^a-zA-Z0-9_.:-]/g, "-");
  if (!normalized || UNSAFE_OBJECT_KEYS.has(normalized)) {
    return fallback;
  }
  return normalized;
}

function normalizeObjectKey(value, fallback = "item", maxLength = MAX_ID_LENGTH) {
  const normalized = normalizeString(value, maxLength).replace(/[<>{}[\]\\]/g, "");
  if (!normalized || UNSAFE_OBJECT_KEYS.has(normalized)) {
    return fallback;
  }
  return normalized;
}

function normalizeMessageText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeAction(value) {
  const action = normalizeString(value, 48);
  return CHAT_ACTIONS.has(action) ? action : "";
}

function normalizeThreadType(value) {
  const type = normalizeString(value, 24).toLowerCase();
  return type === "dm" || type === "group" ? type : "team";
}

function normalizePriority(value) {
  const priority = normalizeString(value, 24).toLowerCase();
  if (["low", "normal", "medium", "high", "urgent", "critical"].includes(priority)) {
    return priority;
  }
  return "normal";
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function actorName(actor = {}) {
  return normalizeString(
    `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email || "Unknown user",
    MAX_TEXT_FIELD_LENGTH
  );
}

function actorIdentitySet(actor = {}) {
  return new Set(
    [actor.id, actor.email, actor.username]
      .map((value) => normalizeString(value, MAX_ID_LENGTH).toLowerCase())
      .filter(Boolean)
  );
}

function normalizeParticipantIds(values = [], actor) {
  const source = Array.isArray(values) ? values : [values];
  const participantIds = source
    .map((value) => {
      if (value && typeof value === "object") {
        return value.id || value.email || value.username;
      }
      return value;
    })
    .map((value) => normalizeString(value, MAX_ID_LENGTH))
    .filter(Boolean);

  if (actor?.id) {
    participantIds.push(actor.id);
  }

  return Array.from(new Set(participantIds)).slice(0, 80);
}

function extractMentionHandles(text) {
  const handles = [];
  const source = String(text || "");
  const matcher = /(^|\s)@([a-zA-Z0-9._-]{2,64})/g;
  let match = matcher.exec(source);
  while (match) {
    handles.push(match[2].toLowerCase());
    match = matcher.exec(source);
  }
  return Array.from(new Set(handles)).slice(0, 40);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canUseChat(actor = {}) {
  return STAFF_ROLES.has(String(actor.role || "").toLowerCase());
}

function canManageChat(actor = {}) {
  return CHAT_MANAGER_ROLES.has(String(actor.role || "").toLowerCase());
}

function canAdminChat(actor = {}) {
  return CHAT_ADMIN_ROLES.has(String(actor.role || "").toLowerCase());
}

function defaultChatState() {
  return {
    schema: CHAT_LEGACY_SCHEMA,
    contract: CHAT_API_SCHEMA,
    threads: [],
    messages: [],
    readReceipts: {},
    audit: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeChatState(rawState = {}) {
  const fallback = defaultChatState();
  if (Array.isArray(rawState)) {
    const messages = rawState.filter((message) => message && typeof message === "object");
    const threadParticipants = new Map();
    messages.forEach((message) => {
      const threadId = normalizeId(message.threadId || message.channelId || "team", "");
      if (!threadId) {
        return;
      }
      const participants = threadParticipants.get(threadId) || new Set();
      [message.userId, message.authorId, message.senderId].forEach((value) => {
        const participantId = normalizeString(value, MAX_ID_LENGTH);
        if (participantId) {
          participants.add(participantId);
        }
      });
      if (Array.isArray(message.readBy)) {
        message.readBy.forEach((value) => {
          const participantId = normalizeString(value, MAX_ID_LENGTH);
          if (participantId) {
            participants.add(participantId);
          }
        });
      }
      threadParticipants.set(threadId, participants);
    });
    const threadIds = Array.from(threadParticipants.keys());
    return {
      ...fallback,
      threads: threadIds.map((threadId) => ({
        id: threadId,
        type: threadId === "team" ? "team" : "dm",
        title: threadId === "team" ? "Team chat" : "Direct message",
        participantIds: Array.from(threadParticipants.get(threadId) || []),
        createdAt: fallback.updatedAt,
        updatedAt: fallback.updatedAt,
      })),
      messages,
    };
  }
  const state = isPlainObject(rawState) ? { ...rawState } : {};

  state.schema = normalizeString(state.schema || fallback.schema, 80);
  state.contract = CHAT_API_SCHEMA;
  state.threads = Array.isArray(state.threads) ? state.threads : [];
  state.messages = Array.isArray(state.messages) ? state.messages : [];
  state.readReceipts = isPlainObject(state.readReceipts) ? { ...state.readReceipts } : {};
  state.audit = Array.isArray(state.audit) ? state.audit.slice(0, MAX_AUDIT_ENTRIES) : [];
  state.updatedAt = normalizeString(state.updatedAt || fallback.updatedAt, 80);

  return state;
}

function normalizeRetentionPolicy(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    activeMessageDays: Math.max(30, Math.min(3650, Number(source.activeMessageDays) || DEFAULT_RETENTION_POLICY.activeMessageDays)),
    deletedMessageDays: Math.max(1, Math.min(365, Number(source.deletedMessageDays) || DEFAULT_RETENTION_POLICY.deletedMessageDays)),
    auditDays: Math.max(30, Math.min(3650, Number(source.auditDays) || DEFAULT_RETENTION_POLICY.auditDays)),
    maxMessagesPerThread: Math.max(100, Math.min(50000, Number(source.maxMessagesPerThread) || DEFAULT_RETENTION_POLICY.maxMessagesPerThread)),
  };
}

function timestampMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysToMs(days) {
  return Number(days || 0) * 24 * 60 * 60 * 1000;
}

function applyRetentionPolicy(state, nowValue = new Date().toISOString()) {
  const normalized = normalizeChatState(state);
  const retention = normalizeRetentionPolicy(normalized.retentionPolicy);
  const nowMs = timestampMs(nowValue) || Date.now();
  const activeCutoff = nowMs - daysToMs(retention.activeMessageDays);
  const deletedCutoff = nowMs - daysToMs(retention.deletedMessageDays);
  const auditCutoff = nowMs - daysToMs(retention.auditDays);

  const byThread = new Map();
  normalized.messages.forEach((message) => {
    const threadId = normalizeId(message?.threadId, "team");
    const createdAtMs = timestampMs(message?.createdAt || message?.updatedAt);
    const deletedAtMs = timestampMs(message?.deletedAt);
    const isDeleted = Boolean(message?.isDeleted);

    if (isDeleted && deletedAtMs && deletedAtMs < deletedCutoff) {
      return;
    }

    if (!isDeleted && createdAtMs && createdAtMs < activeCutoff) {
      return;
    }

    const current = byThread.get(threadId) || [];
    current.push(message);
    byThread.set(threadId, current);
  });

  normalized.messages = Array.from(byThread.values()).flatMap((messages) =>
    messages
      .sort((a, b) => timestampMs(b.createdAt || b.updatedAt) - timestampMs(a.createdAt || a.updatedAt))
      .slice(0, retention.maxMessagesPerThread)
      .reverse()
  );

  normalized.audit = (Array.isArray(normalized.audit) ? normalized.audit : [])
    .filter((entry) => {
      const createdAtMs = timestampMs(entry?.createdAt);
      return !createdAtMs || createdAtMs >= auditCutoff;
    })
    .slice(0, MAX_AUDIT_ENTRIES);

  normalized.retentionPolicy = retention;
  normalized.retentionAppliedAt = nowValue;
  return normalized;
}

function normalizeAuditDetails(value, depth = 0) {
  if (depth > 3) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => normalizeAuditDetails(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce((details, [key, item]) => {
      const normalizedKey = normalizeObjectKey(key, "detail", 80);
      if (["text", "messageText", "body", "token", "secret", "password"].includes(normalizedKey)) {
        details[normalizedKey] = "[redacted]";
        return details;
      }
      details[normalizedKey] = normalizeAuditDetails(item, depth + 1);
      return details;
    }, {});
  }

  if (typeof value === "string") {
    return normalizeString(value, MAX_TEXT_FIELD_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  return null;
}

function addChatAuditEntry(state, actor, action, summary, details = {}) {
  const now = new Date().toISOString();
  const isDestructive = ["deleteMessage", "clearThread"].includes(action);
  const isAdminAction = ["setMessagePinned", "setMessagePriority", "clearThread"].includes(action);
  const entry = {
    id: `${now}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: now,
    action: `chat.${action}`,
    summary: normalizeString(summary || `chat.${action}`, MAX_TEXT_FIELD_LENGTH),
    severity: isDestructive ? "warning" : isAdminAction ? "notice" : "info",
    destructive: isDestructive,
    adminAction: isAdminAction,
    actor: {
      id: normalizeString(actor.id, MAX_ID_LENGTH),
      email: normalizeString(actor.email, MAX_TEXT_FIELD_LENGTH).toLowerCase(),
      name: actorName(actor),
      role: normalizeString(actor.role || "unknown", 40),
    },
    details: normalizeAuditDetails(details),
  };

  state.audit = [entry, ...(Array.isArray(state.audit) ? state.audit : [])].slice(0, MAX_AUDIT_ENTRIES);
  return entry;
}

function threadParticipantValues(thread = {}) {
  const rawParticipants = [
    ...(Array.isArray(thread.participantIds) ? thread.participantIds : []),
    ...(Array.isArray(thread.participants) ? thread.participants : []),
  ];

  return rawParticipants
    .map((participant) => {
      if (participant && typeof participant === "object") {
        return participant.id || participant.email || participant.username;
      }
      return participant;
    })
    .map((value) => normalizeString(value, MAX_ID_LENGTH).toLowerCase())
    .filter(Boolean);
}

function actorCanAccessThread(actor, thread) {
  const type = normalizeThreadType(thread?.type || thread?.kind);
  if (type === "team") {
    return true;
  }

  const participants = threadParticipantValues(thread);
  if (!participants.length) {
    return canAdminChat(actor);
  }

  const identities = actorIdentitySet(actor);
  return participants.some((participant) => identities.has(participant));
}

function filterChatStateForActor(state, actor) {
  const normalized = normalizeChatState(state);
  const allowedThreads = normalized.threads.filter((thread) => actorCanAccessThread(actor, thread));
  const allowedThreadIds = new Set(
    allowedThreads.map((thread) => normalizeId(thread.id || thread.threadId, "")).filter(Boolean)
  );

  const filtered = {
    ...normalized,
    threads: allowedThreads,
    messages: normalized.messages.filter((message) => {
      const threadId = normalizeId(message?.threadId || message?.channelId, "");
      return !message?.isDeleted && (!threadId || allowedThreadIds.has(threadId));
    }),
  };

  if (!canAdminChat(actor)) {
    filtered.audit = [];
  }

  return filtered;
}

function getThreadById(state, threadId) {
  return state.threads.find((thread) => normalizeId(thread?.id || thread?.threadId, "") === threadId) || null;
}

function getMessageById(state, messageId) {
  return state.messages.find((message) => normalizeId(message?.id || message?.messageId, "") === messageId) || null;
}

function upsertThread(state, actor, body = {}, now = new Date().toISOString()) {
  const requestedId = normalizeId(body.threadId || body.id, "");
  const threadId = requestedId || randomId("thread");
  const existing = getThreadById(state, threadId);

  if (existing) {
    return existing;
  }

  const type = normalizeThreadType(body.type || body.kind);
  const title = normalizeString(
    body.title || body.name || (type === "dm" ? "Direct message" : type === "group" ? "Group chat" : "Team chat"),
    MAX_THREAD_TITLE_LENGTH
  );

  const thread = {
    id: threadId,
    type,
    title,
    name: title,
    participantIds: normalizeParticipantIds(body.participantIds || body.participants || [], actor),
    createdAt: now,
    createdBy: actor.id || actor.email || "",
    updatedAt: now,
  };

  state.threads.push(thread);
  return thread;
}

function touchThread(thread, patch = {}) {
  Object.assign(thread, patch);
  return thread;
}

function ensureActionAllowed(actor, state, thread) {
  if (!canUseChat(actor)) {
    return { ok: false, status: 403, reason: "Chat access requires a staff role." };
  }

  if (thread && !actorCanAccessThread(actor, thread)) {
    return { ok: false, status: 403, reason: "You do not have access to this chat thread." };
  }

  return { ok: true };
}

function applyCreateThread(state, actor, body, now) {
  const thread = upsertThread(state, actor, body, now);
  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  const auditEntry = addChatAuditEntry(state, actor, "createThread", "Created or confirmed a chat thread.", {
    threadId: thread.id,
    type: thread.type,
  });

  return { ok: true, status: 200, action: "createThread", state, thread, auditEntry };
}

function applySendMessage(state, actor, body, now) {
  const rawText = body.text || body.message || body.body;
  const text = normalizeMessageText(rawText);
  if (!text) {
    return { ok: false, status: 400, reason: "Message text is required." };
  }

  const thread = upsertThread(state, actor, {
    threadId: body.threadId || body.channelId || "team",
    type: body.threadType || body.type || "team",
    title: body.threadTitle || body.title,
    participantIds: body.participantIds || body.participants,
  }, now);
  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  const message = {
    id: normalizeId(body.id || body.messageId, "") || randomId("msg"),
    threadId: thread.id,
    text,
    userId: actor.id || "",
    authorId: actor.id || "",
    authorEmail: normalizeString(actor.email, MAX_TEXT_FIELD_LENGTH).toLowerCase(),
    authorName: actorName(actor),
    authorRole: normalizeString(actor.role || "unknown", 40),
    author: {
      id: actor.id || "",
      email: normalizeString(actor.email, MAX_TEXT_FIELD_LENGTH).toLowerCase(),
      username: normalizeString(actor.username, MAX_TEXT_FIELD_LENGTH),
      firstName: normalizeString(actor.firstName, MAX_TEXT_FIELD_LENGTH),
      lastName: normalizeString(actor.lastName, MAX_TEXT_FIELD_LENGTH),
      role: normalizeString(actor.role || "unknown", 40),
      title: normalizeString(actor.title, MAX_TEXT_FIELD_LENGTH),
      department: normalizeString(actor.department, MAX_TEXT_FIELD_LENGTH),
      team: normalizeString(actor.team, MAX_TEXT_FIELD_LENGTH),
      status: normalizeString(actor.status || "active", 40),
      profileImageUrl: normalizeString(actor.profileImageUrl, MAX_TEXT_FIELD_LENGTH),
    },
    senderId: actor.id || "",
    senderName: actorName(actor),
    role: normalizeString(actor.role || "unknown", 40),
    createdAt: now,
    updatedAt: now,
    replyToId: normalizeId(body.replyToId || body.parentMessageId, ""),
    priority: normalizePriority(body.priority),
    pinned: false,
    mentions: extractMentionHandles(rawText),
    mentionedUserIds: Array.isArray(body.mentionedUserIds)
      ? body.mentionedUserIds.map((value) => normalizeString(value, MAX_ID_LENGTH)).filter(Boolean).slice(0, 40)
      : [],
    reactions: {},
    readBy: [actor.id || actor.email || "actor"].filter(Boolean),
  };

  state.messages.push(message);
  touchThread(thread, {
    updatedAt: now,
    lastMessageAt: now,
    lastMessageId: message.id,
    messageCount: state.messages.filter((item) => normalizeId(item?.threadId, "") === thread.id && !item?.isDeleted).length,
  });
  state.readReceipts[thread.id] = {
    ...(isPlainObject(state.readReceipts[thread.id]) ? state.readReceipts[thread.id] : {}),
    [normalizeObjectKey(actor.id || actor.email || "actor")]: now,
  };

  const auditEntry = addChatAuditEntry(state, actor, "sendMessage", "Sent a chat message.", {
    threadId: thread.id,
    messageId: message.id,
    textLength: text.length,
    mentionCount: message.mentions.length,
    priority: message.priority,
  });

  return { ok: true, status: 200, action: "sendMessage", state, thread, message, auditEntry };
}

function applyEditMessage(state, actor, body, now) {
  const messageId = normalizeId(body.messageId || body.id, "");
  const message = getMessageById(state, messageId);
  if (!message) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = getThreadById(state, normalizeId(message.threadId, ""));
  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  if (message.authorId !== actor.id) {
    return { ok: false, status: 403, reason: "Only the author can edit this message." };
  }

  const rawText = body.text || body.message || body.body;
  const text = normalizeMessageText(rawText);
  if (!text) {
    return { ok: false, status: 400, reason: "Message text is required." };
  }

  message.text = text;
  message.updatedAt = now;
  message.editedAt = now;
  message.editedBy = actor.id || "";
  message.mentions = extractMentionHandles(rawText);

  const auditEntry = addChatAuditEntry(state, actor, "editMessage", "Edited a chat message.", {
    threadId: message.threadId,
    messageId,
    textLength: text.length,
    mentionCount: message.mentions.length,
  });

  return { ok: true, status: 200, action: "editMessage", state, thread, message, auditEntry };
}

function applyDeleteMessage(state, actor, body, now) {
  const messageId = normalizeId(body.messageId || body.id, "");
  const message = getMessageById(state, messageId);
  if (!message) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = getThreadById(state, normalizeId(message.threadId, ""));
  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  if (message.authorId !== actor.id && !canAdminChat(actor)) {
    return { ok: false, status: 403, reason: "Only the author or an admin can delete this message." };
  }

  message.text = "";
  message.isDeleted = true;
  message.deletedAt = now;
  message.deletedBy = actor.id || "";
  message.updatedAt = now;

  const auditEntry = addChatAuditEntry(state, actor, "deleteMessage", "Deleted a chat message.", {
    threadId: message.threadId,
    messageId,
  });

  return { ok: true, status: 200, action: "deleteMessage", state, thread, message, auditEntry };
}

function applySetMessagePinned(state, actor, body, now) {
  if (!canManageChat(actor)) {
    return { ok: false, status: 403, reason: "Chat manager access required." };
  }

  const messageId = normalizeId(body.messageId || body.id, "");
  const message = getMessageById(state, messageId);
  if (!message) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = getThreadById(state, normalizeId(message.threadId, ""));
  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  const pinned = normalizeBoolean(body.pinned ?? body.value);
  message.pinned = pinned;
  message.pinnedAt = pinned ? now : "";
  message.pinnedBy = pinned ? actor.id || "" : "";
  message.updatedAt = now;

  const auditEntry = addChatAuditEntry(state, actor, "setMessagePinned", pinned ? "Pinned a chat message." : "Unpinned a chat message.", {
    threadId: message.threadId,
    messageId,
    pinned,
  });

  return { ok: true, status: 200, action: "setMessagePinned", state, thread, message, auditEntry };
}

function applySetMessagePriority(state, actor, body, now) {
  if (!canManageChat(actor)) {
    return { ok: false, status: 403, reason: "Chat manager access required." };
  }

  const messageId = normalizeId(body.messageId || body.id, "");
  const message = getMessageById(state, messageId);
  if (!message) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = getThreadById(state, normalizeId(message.threadId, ""));
  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  message.priority = normalizePriority(body.priority);
  message.updatedAt = now;
  message.priorityUpdatedAt = now;
  message.priorityUpdatedBy = actor.id || "";

  const auditEntry = addChatAuditEntry(state, actor, "setMessagePriority", "Updated chat message priority.", {
    threadId: message.threadId,
    messageId,
    priority: message.priority,
  });

  return { ok: true, status: 200, action: "setMessagePriority", state, thread, message, auditEntry };
}

function applyReaction(state, actor, body, now, shouldAdd) {
  const messageId = normalizeId(body.messageId || body.id, "");
  const message = getMessageById(state, messageId);
  if (!message) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = getThreadById(state, normalizeId(message.threadId, ""));
  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  const reaction = normalizeObjectKey(body.reaction || body.emoji || body.key, "like", MAX_REACTION_LENGTH);
  const actorKey = normalizeObjectKey(actor.id || actor.email || "actor", "actor", MAX_ID_LENGTH);
  const reactions = isPlainObject(message.reactions) ? { ...message.reactions } : {};
  const current = Array.isArray(reactions[reaction]) ? reactions[reaction] : [];

  reactions[reaction] = shouldAdd
    ? Array.from(new Set([...current, actorKey]))
    : current.filter((value) => value !== actorKey);

  if (!reactions[reaction].length) {
    delete reactions[reaction];
  }

  message.reactions = reactions;
  message.updatedAt = now;

  const action = shouldAdd ? "addReaction" : "removeReaction";
  const auditEntry = addChatAuditEntry(state, actor, action, shouldAdd ? "Added a chat reaction." : "Removed a chat reaction.", {
    threadId: message.threadId,
    messageId,
    reaction,
  });

  return { ok: true, status: 200, action, state, thread, message, auditEntry };
}

function applyMarkThreadRead(state, actor, body, now) {
  const threadId = normalizeId(body.threadId || body.id || body.channelId, "");
  const thread = getThreadById(state, threadId);
  if (!thread) {
    return { ok: false, status: 404, reason: "Thread not found." };
  }

  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  const actorKey = normalizeObjectKey(actor.id || actor.email || "actor", "actor", MAX_ID_LENGTH);
  state.readReceipts[thread.id] = {
    ...(isPlainObject(state.readReceipts[thread.id]) ? state.readReceipts[thread.id] : {}),
    [actorKey]: now,
  };

  thread.readBy = {
    ...(isPlainObject(thread.readBy) ? thread.readBy : {}),
    [actorKey]: now,
  };
  thread.updatedAt = now;

  const auditEntry = addChatAuditEntry(state, actor, "markThreadRead", "Marked a chat thread as read.", {
    threadId: thread.id,
  });

  return { ok: true, status: 200, action: "markThreadRead", state, thread, auditEntry };
}

function applyClearThread(state, actor, body, now) {
  if (!canAdminChat(actor)) {
    return { ok: false, status: 403, reason: "Admin chat access required." };
  }

  const threadId = normalizeId(body.threadId || body.id || body.channelId, "");
  const thread = getThreadById(state, threadId);
  if (!thread) {
    return { ok: false, status: 404, reason: "Thread not found." };
  }

  const access = ensureActionAllowed(actor, state, thread);
  if (!access.ok) {
    return access;
  }

  let deletedCount = 0;
  state.messages.forEach((message) => {
    if (normalizeId(message?.threadId, "") !== thread.id || message.isDeleted) {
      return;
    }
    message.text = "";
    message.isDeleted = true;
    message.deletedAt = now;
    message.deletedBy = actor.id || "";
    message.updatedAt = now;
    deletedCount += 1;
  });

  touchThread(thread, {
    updatedAt: now,
    clearedAt: now,
    clearedBy: actor.id || "",
    messageCount: 0,
  });

  const auditEntry = addChatAuditEntry(state, actor, "clearThread", "Cleared a chat thread.", {
    threadId: thread.id,
    deletedCount,
  });

  return { ok: true, status: 200, action: "clearThread", state, thread, auditEntry };
}

function applyChatActionToState(rawState, actor, body = {}, context = {}) {
  const now = context.now || new Date().toISOString();
  const state = applyRetentionPolicy(rawState, now);
  const action = normalizeAction(body.action);

  if (!canUseChat(actor)) {
    return { ok: false, status: 403, reason: "Chat access requires a staff role." };
  }

  if (!action) {
    return { ok: false, status: 400, reason: "Unsupported chat action." };
  }

  let result;
  if (action === "createThread") {
    result = applyCreateThread(state, actor, body, now);
  } else if (action === "sendMessage") {
    result = applySendMessage(state, actor, body, now);
  } else if (action === "editMessage") {
    result = applyEditMessage(state, actor, body, now);
  } else if (action === "deleteMessage") {
    result = applyDeleteMessage(state, actor, body, now);
  } else if (action === "setMessagePinned") {
    result = applySetMessagePinned(state, actor, body, now);
  } else if (action === "setMessagePriority") {
    result = applySetMessagePriority(state, actor, body, now);
  } else if (action === "addReaction") {
    result = applyReaction(state, actor, body, now, true);
  } else if (action === "removeReaction") {
    result = applyReaction(state, actor, body, now, false);
  } else if (action === "markThreadRead") {
    result = applyMarkThreadRead(state, actor, body, now);
  } else if (action === "clearThread") {
    result = applyClearThread(state, actor, body, now);
  }

  if (result?.ok) {
    result.state = applyRetentionPolicy(result.state, now);
    result.state.updatedAt = now;
    result.state.updatedBy = actor.id || actor.email || "";
  }

  return result || { ok: false, status: 400, reason: "Unsupported chat action." };
}

function getStorageBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: `${url}/storage/v1`,
    serviceRoleKey,
  };
}

function storageHeaders(serviceRoleKey, contentType = "application/json") {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function parseStorageBody(response, raw = false) {
  const text = await response.text();
  if (raw) {
    return text;
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function storageRequest(path, options = {}) {
  const storage = getStorageBaseUrl();
  if (!storage) {
    return { ok: false, status: 500, reason: "Missing Supabase server configuration." };
  }

  const response = await fetch(`${storage.url}${path}`, {
    ...options,
    headers: {
      ...storageHeaders(storage.serviceRoleKey, options.contentType),
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return { ok: false, status: 404, payload: {} };
  }

  const payload = await parseStorageBody(response, Boolean(options.raw));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
      reason: payload?.error || payload?.message || payload?.msg || `Storage request failed (${response.status}).`,
    };
  }

  return { ok: true, status: response.status, payload };
}

async function ensureChatBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(STORAGE_BUCKET)}`, { method: "GET" });
  if (existing.ok) {
    return true;
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: STORAGE_BUCKET,
      name: STORAGE_BUCKET,
      public: false,
    }),
  });

  return created.ok || created.status === 409 || String(created.reason || "").toLowerCase().includes("already");
}

function chatObjectPath() {
  return `${STORAGE_PREFIX}/${encodeURIComponent(CHAT_STATE_KEY)}.json`;
}

function parseChatStateObject(payload) {
  if (!payload) {
    return defaultChatState();
  }

  if (typeof payload === "string") {
    try {
      return parseChatStateObject(JSON.parse(payload));
    } catch {
      return defaultChatState();
    }
  }

  if (typeof payload.value === "string") {
    try {
      return normalizeChatState(JSON.parse(payload.value));
    } catch {
      return defaultChatState();
    }
  }

  if (isPlainObject(payload.value)) {
    return normalizeChatState(payload.value);
  }

  return normalizeChatState(payload);
}

async function readChatState() {
  const result = await storageRequest(`/object/${encodeURIComponent(STORAGE_BUCKET)}/${chatObjectPath()}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });

  if (result.status === 404) {
    return defaultChatState();
  }

  if (!result.ok) {
    throw new Error(result.reason || "Chat state could not be loaded.");
  }

  return applyRetentionPolicy(parseChatStateObject(result.payload));
}

async function writeChatState(state, actor) {
  const now = new Date().toISOString();
  const normalized = normalizeChatState(state);
  normalized.updatedAt = normalized.updatedAt || now;
  normalized.updatedBy = actor?.id || actor?.email || "";

  const entry = {
    schema: APP_STATE_SCHEMA,
    key: CHAT_STATE_KEY,
    value: JSON.stringify(normalized),
    removed: false,
    updatedAt: now,
    updatedBy: actor?.id || "",
  };

  const bucketReady = await ensureChatBucket();
  if (!bucketReady) {
    throw new Error("Chat storage bucket could not be prepared.");
  }

  const result = await storageRequest(`/object/${encodeURIComponent(STORAGE_BUCKET)}/${chatObjectPath()}`, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  if (result.ok || result.status !== 404) {
    if (!result.ok) {
      throw new Error(result.reason || "Chat state could not be saved.");
    }
    return true;
  }

  const fallback = await storageRequest(`/object/${encodeURIComponent(STORAGE_BUCKET)}/${chatObjectPath()}`, {
    method: "POST",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  if (!fallback.ok) {
    throw new Error(fallback.reason || "Chat state could not be saved.");
  }

  return true;
}

function checkChatRateLimit(actor, action, nowMs = Date.now()) {
  const normalizedAction = normalizeAction(action) || "default";
  const max = RATE_LIMITS[normalizedAction] || RATE_LIMITS.default;
  const identity = normalizeObjectKey(actor.id || actor.email || "unknown", "unknown", MAX_ID_LENGTH);
  const key = `${identity}:${normalizedAction}`;
  const existing = rateLimitBuckets.get(key);

  if (!existing || nowMs - existing.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { startedAt: nowMs, count: 1 });
    return { ok: true };
  }

  existing.count += 1;
  if (existing.count > max) {
    return {
      ok: false,
      status: 429,
      reason: "Too many chat actions. Please wait a moment and try again.",
    };
  }

  if (rateLimitBuckets.size > 1000) {
    for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
      if (nowMs - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
        rateLimitBuckets.delete(bucketKey);
      }
    }
  }

  return { ok: true };
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  if (!canUseChat(actor)) {
    return sendJson(res, 403, { ok: false, reason: "Chat access requires a staff role." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/chat",
    moduleId: "chat",
    actor,
  });
  if (!security.ok) {
    return;
  }

  if (isDatabaseChatEnabled()) {
    try {
      return await handleDatabaseChatRequest(req, res, actor);
    } catch (error) {
      if (error?.code === "BODY_TOO_LARGE") {
        return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
      }
      return sendJson(res, 500, { ok: false, reason: error?.message || "Chat database API failed." });
    }
  }

  try {
    if (req.method === "GET") {
      const state = await readChatState();
      return sendJson(res, 200, {
        ok: true,
        schema: CHAT_API_SCHEMA,
        state: filterChatStateForActor(state, actor),
        updatedAt: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    }

    const body = await parseJsonBody(req);
    const rateLimit = checkChatRateLimit(actor, body?.action);
    if (!rateLimit.ok) {
      return sendJson(res, rateLimit.status || 429, rateLimit);
    }

    const state = await readChatState();
    const result = applyChatActionToState(state, actor, body, {
      ip: normalizeString(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "", MAX_TEXT_FIELD_LENGTH),
      userAgent: normalizeString(req.headers?.["user-agent"] || "", MAX_TEXT_FIELD_LENGTH),
    });

    if (!result.ok) {
      return sendJson(res, result.status || 400, result);
    }

    await writeChatState(result.state, actor);

    return sendJson(res, 200, {
      ok: true,
      schema: CHAT_API_SCHEMA,
      action: result.action,
      thread: result.thread,
      message: result.message,
      auditId: result.auditEntry?.id || "",
      state: filterChatStateForActor(result.state, actor),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, 500, { ok: false, reason: error?.message || "Chat API failed." });
  }
};

module.exports._private = {
  applyChatActionToState,
  canAdminChat,
  canManageChat,
  canUseChat,
  checkChatRateLimit,
  filterChatStateForActor,
  normalizeChatState,
  applyRetentionPolicy,
  normalizeMessageText,
};
