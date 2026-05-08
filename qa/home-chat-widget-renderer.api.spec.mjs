import { expect, test } from "@playwright/test";
import { createDashboardChatWidgetRenderer } from "../src/modules/chat/chat-widget-renderer.mjs";

const priorityOptions = [
  { key: "normal", label: "Normal" },
  { key: "important", label: "Important" },
  { key: "urgent", label: "Urgent" },
];

function createRenderer(messages = []) {
  return createDashboardChatWidgetRenderer({
    priorityOptions,
    escapeHtml: (value) => String(value ?? ""),
    formatUserName: (user = {}) => user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Staff",
    formatTime: () => "10:15",
    normalizePriority: (value) => (priorityOptions.some((option) => option.key === value) ? value : "normal"),
    getPresenceSummary: () => ({ online: 2, away: 1, offline: 0 }),
    getPresenceStatus: () => "online",
    getPresenceLabel: () => "Online",
    renderPresenceAvatar: (user, className) => `<span class="${className}" data-avatar="${user.id}"></span>`,
    renderMessageStatus: () => `<span data-message-status></span>`,
    renderMessageText: (message) => String(message.text || ""),
    renderMessageReactions: () => `<span data-message-reactions></span>`,
    renderReplyReference: (message) => `<span data-reply-ref="${message.id}"></span>`,
    renderPinnedMessages: (pinnedMessages) => `<section data-pinned-count="${pinnedMessages.length}"></section>`,
    renderTypingIndicator: () => `<div data-typing></div>`,
    getPinnedMessagesForThread: (sourceMessages, threadId) =>
      sourceMessages.filter((message) => message.threadId === threadId && message.pinnedAt),
    getMessageById: (messageId) => messages.find((message) => message.id === messageId) || null,
    canDeleteMessage: () => true,
    canPinMessage: () => true,
  });
}

test("home chat widget renderer keeps launcher, conversation, and newest-first message layout", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [
    {
      id: "m1",
      userId: "u2",
      threadId: "team",
      text: "First",
      createdAt: "2026-01-01T10:00:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
    {
      id: "m2",
      userId: "u1",
      threadId: "team",
      text: "Second",
      createdAt: "2026-01-01T10:01:00.000Z",
      readBy: ["u1"],
      mentionedUserIds: [],
      reactions: {},
      priority: "urgent",
      pinnedAt: "2026-01-01T10:02:00.000Z",
    },
  ];
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: 2,
      unreadCount: 1,
      mentionCount: 0,
      lastMessage: messages[1],
      participant: null,
    },
  ];
  const renderer = createRenderer(messages);
  const result = renderer.render({
    currentUser,
    users,
    notificationState: { enabled: true },
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    unreadCount: 1,
    priorityDraft: "urgent",
  });

  expect(result.activeThreadId).toBe("team");
  expect(result.html).toContain("dashboard-chat-widget is-open");
  expect(result.html).toContain("data-pinned-count=\"1\"");
  expect(result.html).toContain("dashboard-chat-priority is-urgent");
  expect(result.html.indexOf("Second")).toBeLessThan(result.html.indexOf("First"));
  expect(result.html).toContain("data-dashboard-clear-thread");
});

test("home chat widget renderer drops stale reply drafts when the selected thread changes", () => {
  const messages = [{ id: "m1", userId: "u2", threadId: "team", text: "Team note", mentionedUserIds: [], reactions: {} }];
  const renderer = createRenderer(messages);
  const result = renderer.render({
    currentUser: { id: "u1", name: "Mak" },
    users: [{ id: "u1", name: "Mak", status: "active" }],
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads: [{ threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 1, unreadCount: 0, lastMessage: messages[0] }],
    replyDraft: { threadId: "dm:u1:u2", messageId: "m1" },
  });

  expect(result.replyDraft).toBeNull();
  expect(result.html).not.toContain("data-reply-ref");
});
