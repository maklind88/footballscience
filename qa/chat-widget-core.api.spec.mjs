import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createDashboardChatWidgetRenderer } from "../src/modules/chat/chat-widget-renderer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardChatCss = readFileSync(resolve(__dirname, "../dashboard-chat.css"), "utf8");
const platformNavigationCss = readFileSync(resolve(__dirname, "../platform-navigation.css"), "utf8");
const appRuntimeSource = readFileSync(resolve(__dirname, "../app-runtime.js"), "utf8");
const composerRuntimeSource = readFileSync(resolve(__dirname, "../src/modules/chat/dashboard-chat-composer-runtime.mjs"), "utf8");
const widgetRuntimeSource = readFileSync(resolve(__dirname, "../src/modules/chat/dashboard-chat-widget-runtime.mjs"), "utf8");

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
  expect(result.html).toContain("data-dashboard-chat-message-card");
  expect(result.html).toContain("has-evidence");
  expect(result.html).toContain("dashboard-chat-search-hit");
  expect(result.html).toContain("dashboard-chat-attachment-library");
  expect(result.html).toContain("data-dashboard-chat-coach-workflow");
  expect(result.html).toContain("Evidence attached");
  expect(result.html).toContain("data-dashboard-chat-intelligence-rail");
  expect(result.html).toContain("data-dashboard-chat-intelligence-panel");
  expect(result.html).toContain('data-dashboard-chat-evidence-kind="doc"');
  expect(result.html).toContain('data-dashboard-chat-promote-target="task"');
  expect(result.html).toContain("readiness-report.pdf");
  expect(result.html).toContain("footballscience.xyz");
  expect(result.html).toContain('placeholder="Message"');
  expect(result.html).toContain('aria-label="Message Team Chat"');
  expect(result.html).toContain('data-dashboard-chat-thread-setting="toggle-mute"');
  expect(result.html).toContain('data-dashboard-chat-thread-setting="toggle-pin"');
  expect(result.html).not.toContain("dashboard-chat-realtime-pill");
  expect(result.html).toContain("data-dashboard-chat-widget-toggle-notifications");
});

test("chat widget renders coach workflow and evidence intelligence layers", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [
    currentUser,
    { id: "u2", name: "Analyst", status: "active" },
    { id: "p1", name: "Player Nine", role: "player", status: "active" },
  ];
  const messages = [
    {
      id: "decision-1",
      userId: "u2",
      threadId: "team",
      text: "Decision: we go with high press in the match.",
      pinnedAt: "2026-01-01T09:58:00.000Z",
      createdAt: "2026-01-01T10:00:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "important",
    },
    {
      id: "clip-1",
      userId: "u2",
      threadId: "team",
      text: "Needs action: @PlayerNine review later with the training session clip.",
      createdAt: "2026-01-01T10:05:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: ["p1"],
      reactions: {},
      priority: "urgent",
      attachments: [
        {
          id: "video-1",
          signedUrl: "https://footballscience.xyz/high-press.mp4",
          metadata: { fileName: "high-press.mp4", mimeType: "video/mp4", byteSize: 4096 },
        },
      ],
    },
  ];
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: 2,
      unreadCount: 0,
      mentionCount: 1,
      lastMessage: messages[1],
      participant: null,
      settings: { pinned: true },
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
  });

  expect(result.html).toContain("data-dashboard-chat-coach-workflow");
  expect(result.html).toContain("Needs action");
  expect(result.html).toContain("Decision made");
  expect(result.html).toContain("Evidence attached");
  expect(result.html).toContain("Review later");
  expect(result.html).not.toContain("dashboard-chat-message-signals");
  expect(result.html).toContain("data-dashboard-chat-intelligence-rail");
  expect(result.html).toContain("data-dashboard-chat-intelligence-panel");
  expect(result.html).toContain("Video card");
  expect(result.html).toContain("Player card");
  expect(result.html).toContain("Training-session card");
  expect(result.html).toContain("Match-event card");
  expect(result.html).toContain("Decision card");
  expect(result.html).toContain('data-dashboard-chat-evidence-kind="video"');
  expect(result.html).toContain('data-dashboard-chat-promote-target="player-note"');
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

test("chat widget header uses group avatar identity for group conversations", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [{ id: "m1", userId: "u2", threadId: "group:match-prep", text: "Group note", mentionedUserIds: [], reactions: {} }];
  const threads = [
    {
      threadId: "group:match-prep",
      label: "Final third match prep",
      type: "group",
      messageCount: 1,
      unreadCount: 0,
      lastMessage: messages[0],
      participants: users,
      settings: { avatarLabel: "F3" },
    },
  ];

  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "group:match-prep" },
    messages,
    threads,
  });

  expect(result.html).toMatch(/dashboard-chat-widget-title[\s\S]*dashboard-chat-stack-avatar is-team\">F3/);
  expect(result.html).toContain("Final third match prep");
});

test("chat inbox exposes coach-fast conversation filters", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [{ id: "m1", userId: "u2", threadId: "team", text: "Team note", mentionedUserIds: [], reactions: {} }];
  const threads = [
    { threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 1, unreadCount: 0, mentionCount: 0, lastMessage: messages[0], settings: {} },
    { threadId: "matchday", label: "Matchday", type: "matchday", messageCount: 3, unreadCount: 2, mentionCount: 1, lastMessage: messages[0], settings: {} },
    { threadId: "training", label: "Training", type: "training", messageCount: 2, unreadCount: 0, mentionCount: 0, lastMessage: messages[0], settings: { pinned: true } },
  ];

  const mentions = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
    threadFilter: "mentions",
  });

  expect(mentions.html).toContain('class="dashboard-chat-thread-filters" role="toolbar" aria-label="Filter chat conversations"');
  expect(mentions.html).toContain('data-dashboard-chat-thread-filter="all"');
  expect(mentions.html).toContain('data-dashboard-chat-thread-filter="unread"');
  expect(mentions.html).toContain('data-dashboard-chat-thread-filter="mentions"');
  expect(mentions.html).toContain('data-dashboard-chat-thread-filter="pinned"');
  expect(mentions.html).toContain('data-dashboard-chat-thread="matchday"');
  expect(mentions.html).not.toContain('data-dashboard-chat-thread="training"');

  const empty = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads: threads.map((thread) => ({ ...thread, settings: {}, mentionCount: 0, unreadCount: 0 })),
    activeThreadId: "team",
    threadFilter: "pinned",
  });

  expect(empty.html).toContain("dashboard-chat-thread-empty");
  expect(empty.html).toContain("No pinned conversations");
});

test("chat inbox defaults to relevant conversations instead of empty staff DMs", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [
    currentUser,
    { id: "u2", name: "Coach A", status: "active" },
    { id: "u3", name: "Coach B", status: "active" },
  ];
  const messages = [];
  const threads = [
    { threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 0, unreadCount: 0, mentionCount: 0, lastMessage: null, settings: {} },
    { threadId: "dm:u2", label: "Coach A", type: "dm", participant: users[1], messageCount: 0, unreadCount: 0, mentionCount: 0, lastMessage: null, settings: {} },
    { threadId: "medical", label: "Medical Room", type: "medical", messageCount: 0, unreadCount: 0, mentionCount: 0, lastMessage: null, settings: {} },
    { threadId: "dm:u3", label: "Coach B", type: "dm", participant: users[2], messageCount: 0, unreadCount: 1, mentionCount: 0, lastMessage: null, settings: {} },
  ];

  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
    threadFilter: "all",
  });

  expect(result.html).toContain("<strong>Chats</strong>");
  expect(result.html).toContain("3 conversations");
  expect(result.html).toContain('data-dashboard-chat-thread="team"');
  expect(result.html).toContain('data-dashboard-chat-thread="medical"');
  expect(result.html).toContain('data-dashboard-chat-thread="dm:u3"');
  expect(result.html).not.toContain('data-dashboard-chat-thread="dm:u2"');
});

test("chat composer keeps priority behind message options and renders message bubble footers", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [
    {
      id: "m1",
      userId: "u1",
      threadId: "team",
      text: "Simple message",
      createdAt: "2026-01-01T10:00:00.000Z",
      readBy: ["u1", "u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
  ];
  const threads = [{ threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 1, unreadCount: 0, lastMessage: messages[0], settings: {} }];

  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
    priorityDraft: "urgent",
  });

  expect(result.html).toContain("dashboard-chat-compose-more");
  expect(result.html).toContain('aria-label="Open message options"');
  expect(result.html).toContain("dashboard-chat-compose-more-panel");
  expect(result.html).toContain('class="dashboard-chat-priority-label">Urgent</span>');
  expect(result.html).toContain("dashboard-chat-bubble-footer");
  expect(result.html).toContain('<time datetime="2026-01-01T10:00:00.000Z">10:15</time>');
  expect(result.html).toContain("data-message-status");
  expect(result.html).not.toContain("dashboard-chat-character-count");
  expect(result.html).not.toContain("dashboard-chat-widget-notify");
  expect(result.html).not.toContain("dashboard-chat-realtime-pill");
  expect(result.html).not.toContain("dashboard-chat-priority is-urgent");
  expect(result.html).not.toContain("dashboard-chat-message-signals");
});

test("chat message menu exposes WhatsApp baseline actions", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [
    {
      id: "m1",
      userId: "u1",
      threadId: "group-1",
      text: "Edited forwarded message",
      createdAt: "2026-01-01T10:00:00.000Z",
      editedAt: "2026-01-01T10:01:00.000Z",
      readBy: ["u1", "u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
      forwardedFromMessageId: "source-1",
    },
  ];
  const threads = [
    {
      threadId: "group-1",
      label: "Match prep",
      type: "group",
      messageCount: 1,
      unreadCount: 0,
      lastMessage: messages[0],
      participants: users,
      permissions: { canManageParticipants: true, canArchiveForMe: true, canDeleteForMe: true, canLeave: true, canForward: true },
      settings: {},
    },
  ];

  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "group-1" },
    messages,
    threads,
    activeThreadId: "group-1",
    detailsOpen: true,
  });

  expect(result.html).toContain('data-dashboard-edit-message="m1"');
  expect(result.html).toContain('data-dashboard-forward-message="m1"');
  expect(result.html).toContain('data-dashboard-delete-message-for-me="m1"');
  expect(result.html).toContain('data-dashboard-delete-message-for-everyone="m1"');
  expect(result.html).toContain("dashboard-chat-edited-label");
  expect(result.html).toContain("Forwarded");
  expect(result.html).toContain('data-dashboard-chat-thread-user-state="archive"');
  expect(result.html).toContain('data-dashboard-chat-thread-user-state="delete"');
  expect(result.html).toContain('data-dashboard-chat-leave-thread="group-1"');
  expect(result.html).toContain("Delete chat for me");
  expect(appRuntimeSource).toContain("editDashboardMessageWithApi");
  expect(appRuntimeSource).toContain("forwardDashboardMessageWithApi");
  expect(appRuntimeSource).toContain("deleteDashboardMessageForMeWithApi");
  expect(appRuntimeSource).toContain('type: "threadUserState"');
  expect(appRuntimeSource).toContain('type: "leaveThread"');
});

test("chat runtime supports browser notification permission and delivery hook", () => {
  expect(appRuntimeSource).toContain("sendDashboardChatBrowserNotification");
  expect(appRuntimeSource).toContain("win.Notification.requestPermission()");
  expect(widgetRuntimeSource).toContain("sendBrowserNotification");
  expect(widgetRuntimeSource).toContain("New message from");
  expect(widgetRuntimeSource).toContain("mentioned you");
});

test("chat settings use in-widget dialogs for names, images, and people", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [
    currentUser,
    { id: "u2", name: "Coach A", role: "coach", status: "active" },
    { id: "u3", name: "Analyst B", role: "analyst", status: "active" },
  ];
  const messages = [{ id: "m1", userId: "u2", threadId: "group-1", text: "Plan", mentionedUserIds: [], reactions: {} }];
  const threads = [
    {
      threadId: "group-1",
      label: "Match prep",
      type: "group",
      messageCount: 1,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: messages[0],
      participants: [currentUser, users[1]],
      permissions: { canManageParticipants: true },
      settings: { customTitle: "Match prep", avatarLabel: "MP" },
    },
  ];

  const rename = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "group-1" },
    messages,
    threads,
    activeThreadId: "group-1",
    threadSettingsDialog: { type: "rename", threadId: "group-1" },
  });

  expect(rename.html).toContain("dashboard-chat-settings-overlay");
  expect(rename.html).toContain('role="dialog" aria-modal="true" aria-labelledby="dashboardChatSettingsTitle"');
  expect(rename.html).toContain('data-dashboard-chat-settings-form data-dashboard-chat-settings-type="rename" data-dashboard-chat-thread="group-1"');
  expect(rename.html).toContain('value="Match prep"');
  expect(rename.html).not.toContain("dashboard-chat-character-count");

  const avatar = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "group-1" },
    messages,
    threads,
    activeThreadId: "group-1",
    threadSettingsDialog: { type: "avatar", threadId: "group-1" },
  });

  expect(avatar.html).toContain('data-dashboard-chat-settings-form data-dashboard-chat-settings-type="avatar" data-dashboard-chat-thread="group-1"');
  expect(avatar.html).toContain('value="MP"');

  const participants = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "group-1" },
    messages,
    threads,
    activeThreadId: "group-1",
    threadSettingsDialog: { type: "participants", threadId: "group-1" },
  });

  expect(participants.html).toContain("data-dashboard-chat-participants-form");
  expect(participants.html).toContain("data-dashboard-chat-participant-filter");
  expect(participants.html).toContain("data-dashboard-chat-participant-row");
  expect(participants.html).toContain('value="u2" checked');
  expect(participants.html).toContain('value="u3"');
});


test("closed chat launcher keeps unread badge visible in compact sidebar mode", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [
    {
      id: "m1",
      userId: "u2",
      threadId: "team",
      text: "Unread team note",
      createdAt: "2026-01-01T10:00:00.000Z",
      readBy: ["u2"],
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
      messageCount: 1,
      unreadCount: 1,
      mentionCount: 0,
      lastMessage: messages[0],
      settings: {},
    },
  ];

  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: false, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
    unreadCount: 1,
  });

  expect(result.html).toContain("dashboard-chat-launcher");
  expect(result.html).toContain('aria-expanded="false"');
  expect(result.html).toContain('aria-controls="dashboardChatWidgetRoot"');
  expect(result.html).toContain('aria-haspopup="dialog"');
  expect(result.html).not.toContain('role="dialog"');
  expect(result.html).not.toContain('aria-modal="false"');
  expect(result.html).toContain('aria-label="Open Team Chat, 1 unread chat message"');
  expect(result.html).toContain('title="Open Team Chat, 1 unread chat message"');
  expect(result.html).toContain("dashboard-chat-header-badge is-unread");
  expect(result.html).toContain('<span class="dashboard-chat-launcher-icon" aria-hidden="true"></span>');
  expect(result.html).toContain('<span class="dashboard-chat-header-badge is-unread" aria-hidden="true">1</span>');
  expect(result.html).toContain("1 unread chat message");
  expect(dashboardChatCss).toContain("closed launcher is a polished left-rail menu item, not a bottom-right bubble");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-root{left:var(--platform-rail-item-left,1.169rem)");
  expect(dashboardChatCss).toContain("right:auto!important");
  expect(dashboardChatCss).toContain("top:min(var(--platform-rail-chat-slot-top,calc(50vh + 10.55rem)),calc(100vh - 8.6rem))!important");
  expect(dashboardChatCss).toContain("bottom:auto!important");
  expect(dashboardChatCss).toContain("width:var(--platform-rail-item-size,3.05rem)!important;height:var(--platform-rail-item-size,3.05rem)!important");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher>*:not(.dashboard-chat-header-badge):not(.dashboard-chat-launcher-icon)");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher .dashboard-chat-header-badge.is-unread");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher>.dashboard-chat-launcher-icon:not(.dashboard-chat-header-badge){display:block!important;flex:0 0 auto!important}");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher-copy{display:none!important}");
  expect(dashboardChatCss).toContain("width:var(--platform-rail-item-size,3.05rem)!important;height:var(--platform-rail-item-size,3.05rem)!important");
  expect(dashboardChatCss).toContain("border-radius:14px!important");
  expect(dashboardChatCss).toContain("background:transparent!important");
  expect(dashboardChatCss).toContain("backdrop-filter:blur(18px) saturate(1.15)!important");
  expect(dashboardChatCss).toContain(".dashboard-chat-launcher:before,body.is-dashboard-chat-closed .dashboard-chat-launcher:after{content:none!important}");
  expect(dashboardChatCss).toContain("closed launcher icon alignment follows platform rail rhythm");
  expect(dashboardChatCss).toContain("display:flex!important;align-items:center!important;justify-content:center!important;overflow:visible!important");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher-icon{position:relative!important;width:1.42rem!important;height:1.42rem!important;border:0!important");
  expect(dashboardChatCss).toContain("inset:.22rem .17rem .3rem!important;border:2px solid currentColor!important;border-radius:.32rem!important");
  expect(dashboardChatCss).toContain("box-shadow:0 .27rem 0 currentColor!important;clip-path:none!important;transform:none!important");
  expect(dashboardChatCss).toContain("top:.34rem!important;right:.34rem!important");
  expect(dashboardChatCss).toContain("background:#d7b46a!important");
  expect(dashboardChatCss).toContain("@media(max-width:820px){body.is-dashboard-chat-closed .dashboard-chat-widget-root{left:var(--platform-rail-chat-mobile-left,27.74rem)");
  expect(dashboardChatCss).toContain("left:var(--platform-rail-chat-mobile-left,27.74rem)!important;");
  expect(dashboardChatCss).toContain("bottom:var(--platform-rail-chat-mobile-bottom,calc(.85rem + env(safe-area-inset-bottom)))!important;");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher .dashboard-chat-header-badge.is-unread");
  expect(dashboardChatCss).toContain("top:.36rem!important;");
  expect(dashboardChatCss).toContain("right:.36rem!important;");
  expect(platformNavigationCss).toContain("--platform-rail-chat-mobile-left: 27.74rem;");
  expect(platformNavigationCss).toContain("--platform-rail-chat-mobile-bottom: calc(0.85rem + env(safe-area-inset-bottom));");
  expect(platformNavigationCss).toContain("--platform-rail-item-left: 1.334rem;");
  expect(platformNavigationCss).toContain("--platform-rail-chat-slot-top: calc(50vh + 8.93rem);");
  expect(platformNavigationCss).toContain("body.has-dashboard-chat-widget .platform-nav-more {\n    margin-top: 0;\n    margin-left: calc(var(--platform-rail-item-size) + var(--platform-rail-item-gap));\n  }");
  expect(dashboardChatCss).not.toContain("right:calc(.7rem + 3.14rem + .38rem + env(safe-area-inset-right))!important");
  expect(dashboardChatCss).toContain("@media(prefers-reduced-motion:reduce)");

  const calmResult = createRenderer([]).render({
    currentUser,
    users,
    state: { isOpen: false, selectedThreadId: "team" },
    messages: [],
    threads: [{ ...threads[0], unreadCount: 0, messageCount: 0, lastMessage: null }],
    activeThreadId: "team",
    unreadCount: 0,
  });

  expect(calmResult.html).toContain('aria-label="Open Team Chat"');
  expect(calmResult.html).toContain('title="Open Team Chat"');
  expect(calmResult.html).toContain("dashboard-chat-launcher-dot");
  expect(calmResult.html).not.toContain("dashboard-chat-header-badge is-unread");
  expect(calmResult.html).not.toContain("unread chat message");

  const busyResult = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: false, selectedThreadId: "team" },
    messages,
    threads: [{ ...threads[0], unreadCount: 2 }],
    activeThreadId: "team",
    unreadCount: 2,
  });

  expect(busyResult.html).toContain('aria-label="Open Team Chat, 2 unread chat messages"');
  expect(busyResult.html).toContain('title="Open Team Chat, 2 unread chat messages"');
  expect(busyResult.html).toContain('<span class="dashboard-chat-header-badge is-unread" aria-hidden="true">2</span>');

  const openResult = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads: [{ ...threads[0], unreadCount: 0 }],
    activeThreadId: "team",
    unreadCount: 0,
  });

  expect(openResult.html).toContain('role="dialog"');
  expect(openResult.html).toContain('aria-modal="false"');
  expect(openResult.html).toContain('aria-keyshortcuts="Escape"');
  expect(openResult.html).toContain('aria-label="Team Chat panel"');
  expect(openResult.html).toContain('aria-expanded="true" aria-controls="dashboardChatWidgetRoot" aria-label="Close Team Chat panel"');
  expect(openResult.html).toContain('title="Close Team Chat panel"');
  expect(openResult.html).toContain('class="dashboard-chat-widget-close"');
  expect(openResult.html).toContain('aria-controls="dashboardChatWidgetRoot"');
  expect(openResult.html).toMatch(/class="dashboard-chat-widget-close"[\s\S]*aria-expanded="true"[\s\S]*aria-controls="dashboardChatWidgetRoot"[\s\S]*aria-label="Close Team Chat panel"[\s\S]*title="Close Team Chat panel"/);

  const namedOpenResult = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads: [{ ...threads[0], label: "North Carolina Courage", unreadCount: 0 }],
    activeThreadId: "team",
    unreadCount: 0,
  });

  expect(namedOpenResult.html).toContain('aria-label="North Carolina Courage chat panel"');

  const unnamedOpenResult = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads: [{ ...threads[0], label: "   ", unreadCount: 0 }],
    activeThreadId: "team",
    unreadCount: 0,
  });

  expect(unnamedOpenResult.html).toContain('aria-label="Team Chat panel"');
});

test("chat notification cursor is persisted when active-thread toasts are suppressed", () => {
  expect(widgetRuntimeSource).toContain("function writeDashboardChatWidgetNotificationCursorForMessage");
  expect(widgetRuntimeSource).toContain("const threadId = normalizeDashboardChatThreadId(message.threadId, dashboardChatTeamThreadId);");
  expect(widgetRuntimeSource).toContain("writeDashboardChatWidgetNotificationCursorForMessage(activeThreadLastMessage);");
  expect(widgetRuntimeSource).toContain("if (isDashboardChatThreadActivelyViewed(latestVisibleMessage.threadId)) {");
  expect(widgetRuntimeSource).toContain("writeDashboardChatWidgetNotificationCursorForMessage(latestVisibleMessage);");
  expect(widgetRuntimeSource).toContain("markDashboardChatWidgetNotificationSeenForThread?.(latestVisibleMessage.threadId);");
  expect(widgetRuntimeSource).toContain("hideDashboardChatWidgetToast();");
});

test("group creator overlay exposes a labelled dialog contract", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [
    currentUser,
    { id: "u2", name: "Ceri Bowley", role: "scout", status: "active" },
  ];
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: 0,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: null,
    },
  ];
  const result = createRenderer([]).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages: [],
    threads,
    activeThreadId: "team",
    groupCreatorOpen: true,
    unreadCount: 0,
  });

  expect(result.html).toContain('id="dashboardChatGroupCreateDialog"');
  expect(result.html).toContain('role="dialog"');
  expect(result.html).toContain('aria-modal="true"');
  expect(result.html).toContain('aria-keyshortcuts="Escape"');
  expect(result.html).toContain('aria-labelledby="dashboardChatGroupCreateTitle"');
  expect(result.html).toContain('aria-describedby="dashboardChatGroupCreateDescription"');
  expect(result.html).toContain('id="dashboardChatGroupCreateTitle">New group</strong>');
  expect(result.html).toContain('id="dashboardChatGroupCreateDescription">Choose people, name the room and keep the conversation focused.</small>');
  expect(result.html).toContain('minlength="2" maxlength="80" placeholder="Example: Match prep" required autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-label="Group name" data-dashboard-chat-group-name-input');
  expect(result.html).toContain('id="dashboardChatGroupAvatarHelp">Paste an image URL or type two initials for the group avatar.</small>');
  expect(result.html).toContain('maxlength="800" placeholder="Image URL or initials, e.g. MP" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="Group image URL or initials" aria-describedby="dashboardChatGroupAvatarHelp" data-dashboard-chat-group-avatar-input');
  expect(result.html).toContain('data-dashboard-chat-group-filter-status aria-live="polite" aria-atomic="true"');
  expect(result.html).toContain('data-dashboard-chat-group-selected-list hidden aria-live="polite" aria-atomic="true"');
  expect(result.html).toContain('class="dashboard-chat-group-create-users" role="group" aria-label="Choose group members"');
  expect(result.html).toContain('aria-label="Add Ceri Bowley (scout) to group"');
  expect(result.html).toContain('aria-describedby="dashboardChatGroupUserMeta-u2"');
  expect(result.html).toContain('<small id="dashboardChatGroupUserMeta-u2">scout</small>');
  expect(result.html).toContain('data-dashboard-chat-group-create-submit disabled aria-disabled="true" aria-label="Create selected group" title="Add a group name with at least 2 characters and choose at least one teammate"');
  expect(result.html).toContain('class="dashboard-chat-group-create-close" aria-controls="dashboardChatGroupCreateDialog" aria-label="Close new group dialog" title="Close new group dialog"');
  expect(result.html).toContain('data-dashboard-chat-create-menu-trigger aria-label="Open create chat menu" title="Open create chat menu" aria-haspopup="menu" aria-controls="dashboardChatCreateMenu"');
  expect(result.html).toContain('id="dashboardChatCreateMenu" class="dashboard-chat-thread-preset-menu" role="menu" aria-label="Create chat"');
  expect(result.html).toContain('role="menuitem" data-dashboard-chat-open-group-creator aria-haspopup="dialog" aria-controls="dashboardChatGroupCreateDialog"');
});

test("chat creator exposes private-message mode before group creation", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [
    currentUser,
    { id: "u2", name: "Ceri Bowley", role: "scout", email: "ceri@example.com", status: "active" },
  ];
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: 0,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: null,
    },
  ];
  const result = createRenderer([]).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages: [],
    threads,
    activeThreadId: "team",
    groupCreatorOpen: true,
    chatCreatorMode: "dm",
    unreadCount: 0,
  });

  expect(result.html).toContain('id="dashboardChatGroupCreateTitle">New chat</strong>');
  expect(result.html).toContain("Choose one person and start a private conversation.");
  expect(result.html).toContain("data-dashboard-chat-direct-create-form");
  expect(result.html).toContain("data-dashboard-chat-direct-user-filter");
  expect(result.html).toContain('role="radiogroup" aria-label="Choose private chat recipient"');
  expect(result.html).toContain('name="participantId"');
  expect(result.html).toContain('aria-label="Start private chat with Ceri Bowley (scout)"');
  expect(result.html).toContain("data-dashboard-chat-direct-create-submit disabled");
  expect(result.html).toContain("data-dashboard-chat-open-direct-creator");
  expect(result.html).toContain("Private message");
  expect(result.html).toContain("New group");
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-open-direct-creator]")');
  expect(appRuntimeSource).toContain('querySelector("[data-dashboard-chat-direct-user-filter]")?.focus();');
  expect(appRuntimeSource).toContain("syncDashboardChatDirectCreateForm");
  expect(appRuntimeSource).toContain("filterDashboardChatDirectCreateUsers");
  expect(composerRuntimeSource).toContain("createDashboardDirectThreadFromForm");
  expect(composerRuntimeSource).toContain('action: "createThread"');
  expect(composerRuntimeSource).toContain('type: "dm"');
});

test("chat panel escape close reuses shared cleanup path", () => {
  expect(appRuntimeSource).toContain("function closeDashboardChatWidgetPanel");
  expect(appRuntimeSource).toContain("function focusDashboardChatWidgetLauncher");
  expect(appRuntimeSource).toContain('querySelector("[data-dashboard-chat-widget-toggle]")?.focus?.();');
  expect(appRuntimeSource).toContain("function focusDashboardChatCreateMenuTrigger");
  expect(appRuntimeSource).toContain('querySelector("[data-dashboard-chat-create-menu-trigger]")?.focus?.();');
  expect(appRuntimeSource).toContain("function closeDashboardChatGroupCreator");
  expect(appRuntimeSource).toContain("focusDashboardChatCreateMenuTrigger();");
  expect(appRuntimeSource).toContain("closeChatMenus();");
  expect(appRuntimeSource).toContain('if (event.key === "Escape")');
  expect(appRuntimeSource).toContain("event.stopPropagation();");
  expect(appRuntimeSource).toContain("closeDashboardChatWidgetPanel();");
  expect(appRuntimeSource).toContain("closeDashboardChatWidgetPanel({ render: false });");
  expect(appRuntimeSource).toContain("closeDashboardChatGroupCreator();");
  expect(appRuntimeSource).toContain("dashboardChatGroupCreatorOpen = false;");

  const groupCreatorCloseIndex = appRuntimeSource.indexOf("if (dashboardChatGroupCreatorOpen)");
  const panelCloseIndex = appRuntimeSource.indexOf("closeDashboardChatWidgetPanel();");

  expect(groupCreatorCloseIndex).toBeGreaterThan(-1);
  expect(panelCloseIndex).toBeGreaterThan(groupCreatorCloseIndex);
});

test("group creator opening closes the menu and focuses the group name", () => {
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-open-group-creator]")');
  expect(appRuntimeSource).toContain('openGroupCreatorButton.closest("details")?.removeAttribute("open");');
  expect(appRuntimeSource).toContain("dashboardChatGroupCreatorOpen = true;");
  expect(appRuntimeSource).toContain("renderDashboardChatWidget();");
  expect(appRuntimeSource).toContain('querySelector("[data-dashboard-chat-group-name-input]")?.focus();');
});

test("group creator readiness respects the group name minimum length", () => {
  expect(appRuntimeSource).toContain("const dashboardChatGroupNameMinLength = 2;");
  expect(appRuntimeSource).toContain("groupNameMinLength: dashboardChatGroupNameMinLength,");
  expect(appRuntimeSource).toContain("dashboardChatGroupNameMinLength,");
  expect(appRuntimeSource).toContain("function normalizeDashboardChatGroupNameInput");
  expect(appRuntimeSource).toContain("function normalizeDashboardChatGroupAvatarInput");
  expect(appRuntimeSource).toContain('addEventListener("focusout"');
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-group-name-input]")');
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-group-avatar-input]")');
  expect(appRuntimeSource).toContain("const targetInput = groupNameInput || groupAvatarInput;");
  expect(appRuntimeSource).toContain("normalizeDashboardChatGroupNameInput(targetInput.value)");
  expect(appRuntimeSource).toContain("normalizeDashboardChatGroupAvatarInput(targetInput.value);");
  expect(appRuntimeSource).toContain("targetInput.value = normalizedValue;");
  expect(appRuntimeSource).toContain("function getDashboardChatGroupNameRequirementLabel()");
  expect(appRuntimeSource).toContain("function getDashboardChatGroupCreateDisabledTitle");
  expect(appRuntimeSource).toContain("const titleValue = normalizeDashboardChatGroupNameInput(titleInput?.value);");
  expect(appRuntimeSource).toContain("const hasTitle = titleValue.length >= dashboardChatGroupNameMinLength;");
  expect(appRuntimeSource).toContain("const missingGroupName = !hasTitle;");
  expect(appRuntimeSource).toContain("const missingParticipants = !selectedCount;");
  expect(appRuntimeSource).toContain("const disabledTitle = getDashboardChatGroupCreateDisabledTitle({ missingGroupName, missingParticipants });");
  expect(appRuntimeSource).toContain("return `${getDashboardChatGroupNameRequirementLabel()} and choose at least one teammate`;");
  expect(appRuntimeSource).toContain("Add a group name with at least ${dashboardChatGroupNameMinLength} characters");
  expect(appRuntimeSource).toContain("Choose at least one teammate");
  expect(composerRuntimeSource).toContain("dashboardChatGroupNameMinLength = 2");
  expect(composerRuntimeSource).toContain('normalizeDashboardChatGroupAvatarInput = (value = "") => String(value ?? "").trim().replace(/\\s+/g, " ")');
  expect(appRuntimeSource).toContain("normalizeDashboardChatGroupAvatarInput,");
  expect(composerRuntimeSource).toContain('normalizeDashboardChatGroupNameInput = (value = "") => String(value ?? "").trim().replace(/\\s+/g, " ")');
  expect(appRuntimeSource).toContain("normalizeDashboardChatGroupNameInput,");
  expect(composerRuntimeSource).toContain("syncDashboardChatGroupCreateForm = () => {}");
  expect(appRuntimeSource).toContain("syncDashboardChatGroupCreateForm,");
  expect(composerRuntimeSource).toContain('const title = normalizeDashboardChatGroupNameInput(formData.get("title")).slice(0, 80);');
  expect(composerRuntimeSource).toContain('const avatarValue = normalizeDashboardChatGroupAvatarInput(formData.get("avatar")).slice(0, 800);');
  expect(composerRuntimeSource).toContain("const previousSubmitState = submitButton");
  expect(composerRuntimeSource).toContain('form.setAttribute("aria-busy", "true");');
  expect(composerRuntimeSource).toContain('submitButton.setAttribute("aria-disabled", "true");');
  expect(composerRuntimeSource).toContain('submitButton.title = "Creating group...";');
  expect(composerRuntimeSource).toContain('form.removeAttribute("aria-busy");');
  expect(composerRuntimeSource).toContain("submitButton.disabled = Boolean(previousSubmitState?.disabled);");
  expect(composerRuntimeSource).toContain("submitButton.textContent = previousSubmitState?.textContent || \"Create group\";");
  expect(composerRuntimeSource).toContain("syncDashboardChatGroupCreateForm(form);");
  expect(composerRuntimeSource).toContain('const avatarInput = form.querySelector("[data-dashboard-chat-group-avatar-input]");');
  expect(composerRuntimeSource).toContain("avatarInput.value = avatarValue;");
  expect(composerRuntimeSource).toContain('const avatarLabelValue = avatarValue.replace(/\\s+/g, "").slice(0, 2).toUpperCase();');
  expect(composerRuntimeSource).toContain('const titleInput = form.querySelector("[data-dashboard-chat-group-name-input]");');
  expect(composerRuntimeSource).toContain("titleInput.value = title;");
  expect(composerRuntimeSource).toContain("if (title.length < dashboardChatGroupNameMinLength)");
  expect(composerRuntimeSource).toContain("Add a group name with at least ${dashboardChatGroupNameMinLength} characters.");
});

test("chat inbox thread cards contain long names, timestamps, previews, and badges", () => {
  expect(dashboardChatCss).toContain("final inbox-card containment contract");
  expect(dashboardChatCss).toContain("grid-template-areas:\"avatar copy signals\"");
  expect(dashboardChatCss).toContain("overscroll-behavior:contain!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-thread-row strong,");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-thread-time,");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-thread-preview,");
  expect(dashboardChatCss).toContain("text-overflow:ellipsis!important;");
  expect(dashboardChatCss).toContain("white-space:nowrap!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-thread-signals");
  expect(dashboardChatCss).toContain("pointer-events:none!important;");

  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "A Very Long Staff Member Name That Should Never Break The Inbox Card" }];
  const longText = "This is a very long operational update that should be trimmed before the thread preview reaches layout.";
  const messages = [
    {
      id: "m-long",
      userId: "u2",
      threadId: "long-thread",
      text: longText,
      createdAt: "2026-06-18T10:00:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
  ];
  const threads = [
    {
      threadId: "long-thread",
      label: "A very long scouting and match preparation group name that should stay inside its row",
      type: "group",
      messageCount: 1,
      unreadCount: 3,
      mentionCount: 1,
      lastMessage: messages[0],
      participant: null,
      settings: { pinned: true, muted: true },
    },
  ];
  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "long-thread" },
    messages,
    threads,
    activeThreadId: "long-thread",
  });

  expect(result.html).toContain('<small class="dashboard-chat-thread-preview">A Very Long Staff Member Name That Should Never Break The Inbox Card: This is a very long operational update...</small>');
  expect(result.html).toContain("dashboard-chat-thread-unread");
  expect(result.html).toContain("dashboard-chat-thread-mention-badge");
});

test("open chat uses a calm professional conversation shell", () => {
  expect(dashboardChatCss).toContain("calm professional conversation shell");
  expect(dashboardChatCss).toContain("width:min(58rem,calc(100vw - 7.25rem))!important;");
  expect(dashboardChatCss).toContain("height:min(74dvh,41rem)!important;");
  expect(dashboardChatCss).toContain("grid-template-columns:minmax(15.25rem,16.75rem) minmax(0,1fr)!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-coach-workflow,");
  expect(dashboardChatCss).toContain(".dashboard-chat-intelligence-rail");
  expect(dashboardChatCss).toContain("display:none!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-thread-filters");
  expect(dashboardChatCss).toContain("grid-template-columns:repeat(4,minmax(0,1fr))!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-thread-filters button.is-active");
  expect(dashboardChatCss).toContain("background:#1f6f54!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-input-shell textarea:focus");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-body,");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-toast[hidden]");
  expect(dashboardChatCss).toContain("bottom:var(--platform-rail-chat-mobile-bottom,calc(.85rem + env(safe-area-inset-bottom)))!important;");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-toast");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-confirm-backdrop");
  expect(dashboardChatCss).toContain("z-index:900!important;");
});

test("chat message actions stay behind a compact hover menu", () => {
  expect(dashboardChatCss).toContain("WhatsApp-like message action menu");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-message-menu-panel");
  expect(dashboardChatCss).toContain("top:calc(100% + .36rem)!important;");
  expect(dashboardChatCss).toContain("width:min(13.5rem,72vw)!important;");
  expect(dashboardChatCss).toContain("backdrop-filter:blur(18px)!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-menu-action");
  expect(dashboardChatCss).toContain("grid-template-columns:1.25rem minmax(0,1fr)!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-menu-action.is-danger");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-menu-reaction-group");

  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach" }];
  const messages = [
    {
      id: "m-actions",
      userId: "u2",
      threadId: "team",
      text: "Menu actions should not clutter the message bubble.",
      createdAt: "2026-06-18T10:00:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
  ];
  const threads = [{ threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 1, lastMessage: messages[0], settings: {} }];
  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
  });

  expect(result.html).toContain('class="dashboard-chat-message-menu"');
  expect(result.html).toContain('class="dashboard-chat-message-menu-panel"');
  expect(result.html).toContain("Open message actions");
  expect(result.html).toContain("Reply");
  expect(result.html).toContain("Copy");
  expect(result.html).toContain("Delete");
});

test("chat message delete action follows sender-or-admin permission", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach" }];
  const messages = [
    {
      id: "own-message",
      userId: "u1",
      threadId: "team",
      text: "My message",
      createdAt: "2026-06-18T10:00:00.000Z",
      readBy: ["u1"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
    {
      id: "other-message",
      userId: "u2",
      threadId: "team",
      text: "Their message",
      createdAt: "2026-06-18T10:01:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
  ];
  const renderer = createDashboardChatWidgetRenderer({
    priorityOptions,
    escapeHtml,
    formatUserName: (user = {}) => user?.name || "Staff",
    formatTime: () => "10:15",
    normalizePriority: () => "normal",
    renderMessageText: renderTextWithSearch,
    renderMessageReactions: () => "",
    renderPinnedMessages: () => "",
    renderTypingIndicator: () => "",
    getPinnedMessagesForThread: () => [],
    canDeleteMessage: (message, user) => message?.userId === user?.id,
  });
  const threads = [{ threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 2, lastMessage: messages[1], settings: {} }];
  const result = renderer.render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
  });

  expect(result.html).toContain('data-dashboard-remove-message="own-message"');
  expect(result.html).not.toContain('data-dashboard-remove-message="other-message"');
});
