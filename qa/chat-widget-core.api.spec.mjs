import { expect, test } from "@playwright/test";
import { createDashboardChatWidgetRenderer } from "../src/modules/chat/chat-widget-renderer.mjs";

const priorityOptions = [
  { key: "normal", label: "Normal" },
  { key: "important", label: "Important" },
  { key: "urgent", label: "Urgent" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTextWithSearch(message, users, options = {}) {
  const text = String(message?.text || "");
  const query = String(options.searchQuery || "").trim();
  if (query.length < 2) {
    return escapeHtml(text);
  }
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return escapeHtml(text);
  }
  return `${escapeHtml(text.slice(0, index))}<mark class="dashboard-chat-search-hit">${escapeHtml(text.slice(index, index + query.length))}</mark>${escapeHtml(text.slice(index + query.length))}`;
}

function createRenderer(messages = []) {
  return createDashboardChatWidgetRenderer({
    priorityOptions,
    escapeHtml,
    formatUserName: (user = {}) => user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Staff",
    formatTime: () => "10:15",
    normalizePriority: (value) => (priorityOptions.some((option) => option.key === value) ? value : "normal"),
    getPresenceSummary: () => ({ online: 2, away: 1, offline: 0 }),
    getPresenceStatus: () => "online",
    getPresenceLabel: () => "Online",
    renderPresenceAvatar: (user, className) => `<span class="${className}" data-avatar="${escapeHtml(user.id)}"></span>`,
    renderMessageStatus: () => `<span data-message-status></span>`,
    renderMessageText: renderTextWithSearch,
    renderMessageReactions: () => `<span data-message-reactions></span>`,
    renderReplyReference: (message) => `<span data-reply-ref="${escapeHtml(message.id)}"></span>`,
    renderPinnedMessages: (pinnedMessages) => `<section data-pinned-count="${pinnedMessages.length}"></section>`,
    renderTypingIndicator: () => `<div data-typing></div>`,
    getPinnedMessagesForThread: (sourceMessages, threadId) =>
      sourceMessages.filter((message) => message.threadId === threadId && message.pinnedAt),
    getMessageById: (messageId) => messages.find((message) => message.id === messageId) || null,
    canDeleteMessage: () => true,
    canPinMessage: () => true,
  });
}

test("chat widget highlights searched messages and keeps search inside the details panel", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Medical Lead", status: "active" }];
  const messages = [
    {
      id: "m1",
      userId: "u2",
      threadId: "team",
      text: "Medical report is ready https://footballscience.xyz/report",
      createdAt: "2026-01-01T10:00:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
      attachments: [
        {
          id: "a1",
          signedUrl: "https://footballscience.xyz/file.pdf",
          metadata: { fileName: "readiness-report.pdf", mimeType: "application/pdf", byteSize: 2048 },
        },
      ],
    },
    {
      id: "m2",
      userId: "u1",
      threadId: "team",
      text: "Thanks",
      createdAt: "2026-01-01T10:01:00.000Z",
      readBy: ["u1"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
  ];
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: 2,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: messages[1],
      participant: null,
      settings: { muted: true, pinned: true, customTitle: "Team Chat", avatarLabel: "TC" },
    },
  ];
  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
    detailsOpen: true,
    messageSearchQuery: "medical",
    realtimeStatus: { key: "connected", label: "Connected", detail: "Realtime active" },
  });

  expect(result.html).toContain("dashboard-chat-details-panel");
  expect(result.html).toContain("data-dashboard-chat-message-search");
  expect(result.html).toContain("1 of 1 matches in 2 messages");
  expect(result.html).toContain('data-dashboard-chat-search-step="previous"');
  expect(result.html).toContain('data-dashboard-chat-search-active="true"');
  expect(result.html).toContain("dashboard-chat-message is-search-match");
  expect(result.html).toContain("dashboard-chat-search-hit");
  expect(result.html).toContain("dashboard-chat-attachment-library");
  expect(result.html).toContain("readiness-report.pdf");
  expect(result.html).toContain("footballscience.xyz");
  expect(result.html).toContain('data-dashboard-chat-thread-setting="toggle-mute"');
  expect(result.html).toContain('data-dashboard-chat-thread-setting="toggle-pin"');
  expect(result.html).toContain("dashboard-chat-realtime-pill is-connected");
});

test("chat widget exposes mobile inbox and conversation modes", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [{ id: "m1", userId: "u2", threadId: "team", text: "Team note", mentionedUserIds: [], reactions: {} }];
  const threads = [{ threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 1, unreadCount: 0, lastMessage: messages[0], settings: {} }];

  const inbox = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    mobileConversationOpen: false,
  });
  const conversation = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    mobileConversationOpen: true,
  });

  expect(inbox.html).toContain("is-mobile-inbox");
  expect(conversation.html).toContain("is-mobile-conversation");
  expect(conversation.html).toContain("data-dashboard-chat-mobile-back");
});
