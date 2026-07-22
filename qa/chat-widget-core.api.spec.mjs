import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  clampDashboardChatLauncherPosition,
  isDashboardChatImmersiveSurfaceActive,
} from "../src/modules/chat/dashboard-chat-launcher-runtime.mjs";
import { createDashboardChatWidgetRenderer, renderDashboardChatMessageStatus } from "../src/modules/chat/chat-widget-renderer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardChatCss = readFileSync(resolve(__dirname, "../dashboard-chat.css"), "utf8");
const dashboardChatLauncherCss = readFileSync(resolve(__dirname, "../dashboard-chat-launcher.css"), "utf8");
const dashboardChatCreateCss = readFileSync(resolve(__dirname, "../dashboard-chat-create.css"), "utf8");
const dashboardChatMessageCss = readFileSync(resolve(__dirname, "../dashboard-chat-message.css"), "utf8");
const indexSource = readFileSync(resolve(__dirname, "../index.html"), "utf8");
const appRuntimeSource = readFileSync(resolve(__dirname, "../app-runtime.js"), "utf8");
const chatPushClientSource = readFileSync(resolve(__dirname, "../src/modules/chat/chat-push-client.mjs"), "utf8");
const composerRuntimeSource = readFileSync(resolve(__dirname, "../src/modules/chat/dashboard-chat-composer-runtime.mjs"), "utf8");
const widgetRuntimeSource = readFileSync(resolve(__dirname, "../src/modules/chat/dashboard-chat-widget-runtime.mjs"), "utf8");
const chatWidgetRendererSource = readFileSync(resolve(__dirname, "../src/modules/chat/chat-widget-renderer.mjs"), "utf8");

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

function getInboxHeadMarkup(html = "") {
  return String(html).match(/<div class="dashboard-chat-inbox-head">[\s\S]*?<\/div>\s*<details/)?.[0] || "";
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

test("chat widget renders direct message bodies in the active conversation pane", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const peer = { id: "u2", name: "Michita Toda", status: "active" };
  const threadId = "dm:u1:u2";
  const messages = [
    {
      id: "m1",
      userId: "u1",
      threadId,
      text: "Hi",
      createdAt: "2026-06-26T19:44:04.000Z",
      readBy: ["u1"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
    },
  ];
  const threads = [
    {
      threadId,
      type: "dm",
      label: "Michita Toda",
      isTeamThread: false,
      messageCount: 1,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: messages[0],
      participants: [currentUser, peer],
      participant: peer,
      settings: {},
      permissions: {},
    },
  ];

  const result = createRenderer(messages).render({
    currentUser,
    users: [currentUser, peer],
    state: { isOpen: true, selectedThreadId: threadId },
    messages,
    threads,
    activeThreadId: threadId,
    mobileConversationOpen: true,
    realtimeStatus: { key: "connected", label: "Connected", detail: "Realtime active" },
  });

  expect(result.html).toContain("Hi");
  expect(result.html).toContain('data-dashboard-chat-message-card');
  expect(result.html).not.toContain("No messages yet");
});

test("chat details render persisted action items ahead of action signals", () => {
  const currentUser = { id: "u1", name: "Mak", status: "active" };
  const users = [currentUser, { id: "u2", name: "Analyst", status: "active" }];
  const messages = [
    {
      id: "m-action",
      userId: "u2",
      threadId: "team",
      text: "Action: review opponent buildup owner: Analyst deadline: tomorrow",
      createdAt: "2026-07-13T10:00:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "urgent",
    },
  ];
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: 1,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: messages[0],
      participant: null,
      settings: {},
      apiThread: {
        actionItems: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            threadId: "team",
            messageId: "m-action",
            title: "Review opponent buildup",
            priority: "urgent",
            status: "open",
            ownerLabel: "Analyst",
            dueLabel: "tomorrow",
            createdAt: "2026-07-13T10:01:00.000Z",
          },
        ],
      },
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

  expect(result.html).toContain("1 saved action");
  expect(result.html).toContain("Review opponent buildup");
  expect(result.html).toContain("Urgent - Analyst - Saved");
  expect(result.html).toContain('data-dashboard-chat-action-item-status="done"');
  expect(result.html).toContain('data-dashboard-chat-action-item-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
  expect(result.html).not.toContain('data-dashboard-chat-action-title="Action: review opponent buildup');
});

test("chat widget renders push notification health in the More menu", () => {
  const currentUser = { id: "u1", name: "Mak", status: "active" };
  const users = [currentUser, { id: "u2", name: "Medical Lead", status: "active" }];
  const renderer = createRenderer([]);

  const result = renderer.render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    activeThreadId: "team",
    messages: [],
    threads: [
      {
        threadId: "team",
        label: "Team Chat",
        isTeamThread: true,
        participants: users,
        messageCount: 0,
      },
    ],
    notificationState: { enabled: true, level: "all" },
    pushDiagnostics: {
      status: "ready",
      label: "Ready - 1 device",
      detail: "This account has an active push device registration.",
    },
  });

  expect(result.html).toContain("Notification health");
  expect(result.html).toContain("Ready - 1 device");
  expect(result.html).toContain('data-dashboard-chat-widget-refresh-push-status');
  expect(result.html).toContain('title="This account has an active push device registration."');
  expect(result.html).toContain("Send system notification");
});

test("chat widget surfaces API sync failures with a real retry action", () => {
  const currentUser = { id: "u1", name: "Mak", status: "active" };
  const users = [currentUser, { id: "u2", name: "Medical Lead", status: "active" }];
  const renderer = createRenderer([]);

  const degraded = renderer.render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    activeThreadId: "team",
    messages: [],
    threads: [
      {
        threadId: "team",
        label: "Team Chat",
        isTeamThread: true,
        participants: users,
        messageCount: 0,
      },
    ],
    apiStatus: {
      key: "server-error",
      label: "Chat server issue",
      detail: "Database is temporarily unavailable.",
      retryable: true,
    },
  });
  const ready = renderer.render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    activeThreadId: "team",
    messages: [],
    threads: [
      {
        threadId: "team",
        label: "Team Chat",
        isTeamThread: true,
        participants: users,
        messageCount: 0,
      },
    ],
    apiStatus: { key: "ready", label: "Chat synced", detail: "Messages are up to date." },
  });

  expect(degraded.html).toContain('data-dashboard-chat-sync-status');
  expect(degraded.html).toContain('data-dashboard-chat-status-overlay');
  expect(degraded.html).toContain("Chat server issue");
  expect(degraded.html).toContain("Database is temporarily unavailable.");
  expect(degraded.html).toContain('data-dashboard-chat-retry-sync="team"');
  expect(degraded.html).toContain("Chat sync");
  expect(degraded.html).toContain("dashboard-chat-more-action is-server-error");
  expect(ready.html).not.toContain("data-dashboard-chat-sync-status");
  expect(ready.html).not.toContain("data-dashboard-chat-status-overlay");
  expect(ready.html).toContain("dashboard-chat-more-action is-ready");
  expect(dashboardChatCss).toContain(".dashboard-chat-status-overlay");
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-retry-sync]")');
  expect(appRuntimeSource).toContain("await refreshDashboardChatFromApi({ threadId, forceNetwork: true });");
  expect(widgetRuntimeSource).toContain("getDashboardChatApiStatus");
});

test("chat inbox renders trust summary and conversation delivery state", () => {
  const currentUser = { id: "u1", name: "Mak", status: "active" };
  const peer = { id: "u2", name: "Analyst", status: "active" };
  const messages = [
    {
      id: "m1",
      userId: "u2",
      threadId: "team",
      text: "Mentioning you for the match plan.",
      createdAt: "2026-01-01T10:00:00.000Z",
      readBy: ["u2"],
      mentionedUserIds: ["u1"],
      reactions: {},
      priority: "normal",
    },
    {
      id: "m2",
      userId: "u1",
      threadId: "team",
      text: "I will check it.",
      createdAt: "2026-01-01T10:01:00.000Z",
      readBy: ["u1"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
      status: "failed",
    },
  ];
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: 2,
      unreadCount: 1,
      mentionCount: 1,
      lastMessage: messages[1],
      participants: [currentUser, peer],
      settings: {},
    },
  ];

  const result = createRenderer(messages).render({
    currentUser,
    users: [currentUser, peer],
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
    unreadCount: 1,
    apiStatus: {
      key: "ready",
      label: "Chat synced",
      detail: "Messages are up to date.",
      checkedAt: Date.UTC(2026, 0, 1, 10, 15),
    },
  });

  const inboxHead = getInboxHeadMarkup(result.html);

  expect(result.html).toContain("<strong>Inbox</strong>");
  expect(inboxHead).not.toContain('data-dashboard-chat-inbox-trust');
  expect(inboxHead).not.toContain("1 unread");
  expect(inboxHead).not.toContain("1 active");
  expect(inboxHead).not.toContain("1 mention");
  expect(inboxHead).not.toContain("Synced");
  expect(result.html).toContain('data-dashboard-chat-trust');
  expect(result.html).toContain('data-dashboard-chat-trust-sync');
  expect(result.html).toContain("Synced");
  expect(result.html).toContain('data-dashboard-chat-trust-delivery');
  expect(result.html).toContain('data-dashboard-chat-delivery-state="failed"');
  expect(result.html).toContain('data-dashboard-chat-trust-delivery-detail');
  expect(result.html).toContain("1 not sent");
  expect(result.html).toContain("Retry the failed message.");
  expect(result.html).toContain('data-dashboard-chat-delivery-retry="m2"');
  expect(result.html).toContain('data-dashboard-retry-message="m2"');
  expect(result.html).toContain('data-dashboard-chat-trust-context');
  expect(result.html).toContain("2 messages - 2 online");
  expect(dashboardChatCss).toContain(".dashboard-chat-delivery-pill");
});

test("chat conversation trust stays quiet for normal delivered and read states", () => {
  const currentUser = { id: "u1", name: "Mak", status: "active" };
  const peer = { id: "u2", name: "Analyst", status: "active" };
  const messages = [
    {
      id: "m1",
      userId: "u1",
      threadId: "dm:u1:u2",
      text: "Can you review the press plan?",
      createdAt: "2026-01-01T10:00:00.000Z",
      readBy: ["u1", "u2", "u2"],
      mentionedUserIds: [],
      reactions: {},
      priority: "normal",
      status: "sent",
    },
  ];
  const threads = [
    {
      threadId: "dm:u1:u2",
      label: "Analyst",
      type: "dm",
      isTeamThread: false,
      messageCount: 1,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: messages[0],
      participant: peer,
      participants: [currentUser, peer],
      settings: {},
    },
  ];

  const readResult = createRenderer(messages).render({
    currentUser,
    users: [currentUser, peer],
    state: { isOpen: true, selectedThreadId: "dm:u1:u2" },
    messages,
    threads,
    activeThreadId: "dm:u1:u2",
    unreadCount: 0,
    apiStatus: { key: "ready", checkedAt: Date.UTC(2026, 0, 1, 10, 15) },
  });

  const sentResult = createRenderer([{ ...messages[0], readBy: ["u1"] }]).render({
    currentUser,
    users: [currentUser, peer],
    state: { isOpen: true, selectedThreadId: "dm:u1:u2" },
    messages: [{ ...messages[0], readBy: ["u1"] }],
    threads,
    activeThreadId: "dm:u1:u2",
    unreadCount: 0,
    apiStatus: { key: "ready", checkedAt: Date.UTC(2026, 0, 1, 10, 15) },
  });
  const deliveredResult = createRenderer([{ ...messages[0], readBy: ["u1"], status: "delivered" }]).render({
    currentUser,
    users: [currentUser, peer],
    state: { isOpen: true, selectedThreadId: "dm:u1:u2" },
    messages: [{ ...messages[0], readBy: ["u1"], status: "delivered" }],
    threads,
    activeThreadId: "dm:u1:u2",
    unreadCount: 0,
    apiStatus: { key: "ready", checkedAt: Date.UTC(2026, 0, 1, 10, 15) },
  });

  expect(readResult.html).not.toContain('data-dashboard-chat-trust');
  expect(readResult.html).not.toContain('data-dashboard-chat-status-overlay');
  expect(sentResult.html).not.toContain('data-dashboard-chat-trust');
  expect(deliveredResult.html).not.toContain('data-dashboard-chat-trust');
  expect(renderDashboardChatMessageStatus(messages[0], currentUser, escapeHtml)).toContain('title="Read by 1"');
  expect(renderDashboardChatMessageStatus({ ...messages[0], readBy: ["u1"] }, currentUser, escapeHtml)).toContain('title="Sent"');
  expect(renderDashboardChatMessageStatus({ ...messages[0], readBy: ["u1"], status: "delivered" }, currentUser, escapeHtml)).toContain(
    'title="Delivered"'
  );
  expect(sentResult.html).not.toContain("All sent");
});

test("chat conversation trust prioritizes API delivery contracts", () => {
  const currentUser = { id: "u1", name: "Mak", status: "active" };
  const peer = { id: "u2", name: "Analyst", status: "active" };
  const baseMessage = {
    id: "m1",
    userId: "u1",
    threadId: "dm:u1:u2",
    text: "The server owns this delivery state.",
    createdAt: "2026-01-01T10:00:00.000Z",
    readBy: ["u1"],
    mentionedUserIds: [],
    reactions: {},
    priority: "normal",
    status: "sent",
  };
  const threads = [
    {
      threadId: "dm:u1:u2",
      label: "Analyst",
      type: "dm",
      isTeamThread: false,
      messageCount: 1,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: baseMessage,
      participant: peer,
      participants: [currentUser, peer],
      settings: {},
    },
  ];

  const deliveredResult = createRenderer([{ ...baseMessage, delivery: { status: "delivered", deliveredAt: baseMessage.createdAt } }]).render({
    currentUser,
    users: [currentUser, peer],
    state: { isOpen: true, selectedThreadId: "dm:u1:u2" },
    messages: [{ ...baseMessage, delivery: { status: "delivered", deliveredAt: baseMessage.createdAt } }],
    threads,
    activeThreadId: "dm:u1:u2",
    unreadCount: 0,
    apiStatus: { key: "ready", checkedAt: Date.UTC(2026, 0, 1, 10, 15) },
  });
  const readMessage = {
    ...baseMessage,
    delivery: {
      status: "read",
      deliveredAt: baseMessage.createdAt,
      readAt: "2026-01-01T10:02:00.000Z",
      readBy: ["u2"],
      readCount: 1,
    },
  };
  const readResult = createRenderer([readMessage]).render({
    currentUser,
    users: [currentUser, peer],
    state: { isOpen: true, selectedThreadId: "dm:u1:u2" },
    messages: [readMessage],
    threads,
    activeThreadId: "dm:u1:u2",
    unreadCount: 0,
    apiStatus: { key: "ready", checkedAt: Date.UTC(2026, 0, 1, 10, 15) },
  });

  expect(deliveredResult.html).not.toContain('data-dashboard-chat-trust');
  expect(deliveredResult.html).not.toContain('data-dashboard-chat-delivery-state="delivered"');
  expect(readResult.html).not.toContain('data-dashboard-chat-trust');
  expect(readResult.html).not.toContain('data-dashboard-chat-delivery-state="read"');
  expect(renderDashboardChatMessageStatus({ ...baseMessage, delivery: { status: "delivered" } }, currentUser, escapeHtml)).toContain(
    'data-dashboard-chat-message-delivery-status="delivered"'
  );
  expect(renderDashboardChatMessageStatus(readMessage, currentUser, escapeHtml)).toContain(
    'data-dashboard-chat-message-delivery-status="read"'
  );
  expect(renderDashboardChatMessageStatus(readMessage, currentUser, escapeHtml)).toContain('title="Read by 1"');
});

test("chat API domain keeps explicit delivery payloads after normalization", async () => {
  const { createDashboardChatApiDomainRuntime } = await import("../src/modules/chat/dashboard-chat-api-domain-runtime.mjs");
  const runtime = createDashboardChatApiDomainRuntime({
    getCurrentPlatformUser: () => ({ id: "u1" }),
    normalizeDashboardMessage: (message) => message,
  });
  const message = runtime.normalizeDashboardApiMessage({
    id: "m1",
    threadId: "team",
    userId: "u1",
    text: "Stored",
    createdAt: "2026-01-01T10:00:00.000Z",
    status: "sent",
    delivery: {
      status: "read",
      deliveredAt: "2026-01-01T10:00:00.000Z",
      readAt: "2026-01-01T10:01:00.000Z",
      readBy: ["u2"],
      readCount: 1,
      source: "chat_read_receipts",
    },
  });

  expect(message.delivery).toEqual({
    status: "read",
    deliveredAt: "2026-01-01T10:00:00.000Z",
    readAt: "2026-01-01T10:01:00.000Z",
    readBy: ["u2"],
    readCount: 1,
    source: "chat_read_receipts",
  });
  expect(message.readBy).toEqual(["u1", "u2"]);
});

test("chat delivery status labels are explicit on own message footers", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const sent = renderDashboardChatMessageStatus({ id: "m1", userId: "u1", status: "sent", readBy: ["u1"] }, currentUser, escapeHtml);
  const pending = renderDashboardChatMessageStatus({ id: "m2", userId: "u1", status: "pending", readBy: ["u1"] }, currentUser, escapeHtml);
  const failed = renderDashboardChatMessageStatus({ id: "m3", userId: "u1", status: "failed", readBy: ["u1"] }, currentUser, escapeHtml);
  const read = renderDashboardChatMessageStatus({ id: "m4", userId: "u1", status: "sent", readBy: ["u1", "u2"] }, currentUser, escapeHtml);
  const delivered = renderDashboardChatMessageStatus({ id: "m5", userId: "u1", status: "sent", readBy: ["u1"], delivery: { status: "delivered" } }, currentUser, escapeHtml);

  expect(sent).toContain('data-dashboard-chat-message-delivery-status="sent"');
  expect(sent).toContain("Sent");
  expect(sent.match(/class="dashboard-chat-check"/g)).toHaveLength(1);
  expect(pending).toContain('data-dashboard-chat-message-delivery-status="pending"');
  expect(pending).toContain("Sending");
  expect(failed).toContain('data-dashboard-chat-message-delivery-status="failed"');
  expect(failed).toContain("Not sent");
  expect(read).toContain('data-dashboard-chat-message-delivery-status="read"');
  expect(read).toContain("Read by 1");
  expect(read).toContain("dashboard-chat-check-cluster is-read");
  expect(read.match(/class="dashboard-chat-check"/g)).toHaveLength(2);
  expect(dashboardChatMessageCss).toContain("width: 0.5rem !important;");
  expect(dashboardChatMessageCss).toContain("margin-left: -0.24rem !important;");
  expect(delivered).toContain('data-dashboard-chat-message-delivery-status="delivered"');
  expect(delivered).toContain("Delivered");
  expect(delivered).toContain("dashboard-chat-check-cluster is-checkmark");
  expect(delivered.match(/class="dashboard-chat-check"/g)).toHaveLength(2);
});

test("chat widget preserves open dialog drafts across sync rerenders", () => {
  expect(widgetRuntimeSource).toContain("readDashboardChatDialogDrafts");
  expect(widgetRuntimeSource).toContain("restoreDashboardChatDialogDrafts(root, previousDialogDrafts)");
  expect(widgetRuntimeSource).toContain("[data-dashboard-chat-group-create-form]");
  expect(widgetRuntimeSource).toContain("[data-dashboard-chat-settings-form]");
  expect(widgetRuntimeSource).toContain("input[name='participantIds']:checked");
  expect(widgetRuntimeSource).toContain("[data-dashboard-chat-settings-input]");
});

test("chat widget keeps loaded older history visible in the active conversation pane", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = Array.from({ length: 75 }, (_, index) => ({
    id: `history-${String(index + 1).padStart(3, "0")}`,
    userId: index % 2 ? "u1" : "u2",
    threadId: "team",
    text: `History ${String(index + 1).padStart(3, "0")}`,
    createdAt: new Date(Date.UTC(2026, 5, 26, 10, index)).toISOString(),
    readBy: [index % 2 ? "u1" : "u2"],
    mentionedUserIds: [],
    reactions: {},
    priority: "normal",
  }));
  const threads = [
    {
      threadId: "team",
      label: "Team Chat",
      isTeamThread: true,
      messageCount: messages.length,
      unreadCount: 0,
      mentionCount: 0,
      lastMessage: messages.at(-1),
      settings: {},
    },
  ];

  const result = createRenderer(messages).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
    hasOlderMessages: true,
  });

  expect(result.html).toContain('data-dashboard-chat-load-earlier="team"');
  expect(result.html).toContain("History 001");
  expect(result.html).toContain("History 075");
  expect(result.html).not.toContain("No messages yet");
});

test("chat widget shows server summary latest message when active history is still hydrating", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Analyst", status: "active" }];
  const lastMessage = {
    id: "server-latest-message",
    userId: "u1",
    threadId: "team",
    text: "fdsafas",
    createdAt: "2026-06-27T01:08:00.000Z",
    readBy: ["u1"],
    mentionedUserIds: [],
    reactions: {},
    priority: "normal",
  };
  const threads = [{
    threadId: "team",
    label: "Team Chat",
    isTeamThread: true,
    messageCount: 7,
    unreadCount: 0,
    mentionCount: 0,
    lastMessage,
    lastMessagePreview: "You: fdsafas",
    lastMessageAt: "2026-06-27T01:08:00.000Z",
    settings: {},
    permissions: {},
  }];

  const result = createRenderer([]).render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages: [],
    threads,
    activeThreadId: "team",
    mobileConversationOpen: true,
    realtimeStatus: { key: "connected", label: "Connected", detail: "Realtime active" },
  });

  expect(result.html).toContain("fdsafas");
  expect(result.html).toContain('data-dashboard-chat-message-id="server-latest-message"');
  expect(result.html).toContain("is-preview");
  expect(result.html).not.toContain("No messages yet");
  expect(result.html).not.toContain("data-dashboard-reply-message");
  expect(result.html).not.toContain("data-dashboard-delete-message-for-me");
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
      text: "Needs action: @PlayerNine review later with the training session clip. Deadline Friday.",
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
  expect(result.html).toContain("data-dashboard-chat-action-plan");
  expect(result.html).toContain("Action plan");
  expect(result.html).toContain('data-dashboard-chat-action-plan-summary="owner"');
  expect(result.html).toContain('data-dashboard-chat-action-plan-summary="due"');
  expect(result.html).toContain('data-dashboard-chat-action-plan-summary="decision"');
  expect(result.html).toContain('data-dashboard-chat-action-plan-summary="evidence"');
  expect(result.html).toContain('data-dashboard-chat-action-message="clip-1"');
  expect(result.html).toContain("Player Nine");
  expect(result.html).toContain("Friday");
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

  const inboxHead = getInboxHeadMarkup(result.html);

  expect(result.html).toContain("<strong>Inbox</strong>");
  expect(inboxHead).not.toContain("3 conversations");
  expect(inboxHead).not.toContain("active");
  expect(inboxHead).not.toContain("No mentions");
  expect(inboxHead).not.toContain("Sync pending");
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
  expect(result.html).toContain('<time class="dashboard-chat-bubble-time" datetime="2026-01-01T10:00:00.000Z" title="10:15">10:15</time>');
  const bubbleFooterMarkup = result.html.match(/<div class="dashboard-chat-bubble-footer">[\s\S]*?<\/div>/)?.[0] || "";
  expect(bubbleFooterMarkup).not.toContain("data-dashboard-chat-message-delivery-status");
  expect(result.html).toContain('<div class="dashboard-chat-message-status">');
  expect(result.html).toContain('aria-label="Open emoji picker"');
  expect(dashboardChatMessageCss).toContain(".dashboard-chat-emoji-menu summary");
  expect(dashboardChatMessageCss).toContain("width: 2.55rem !important;");
  expect(dashboardChatMessageCss).toContain("font-size: 1.28rem !important;");
  expect(result.html).toContain('data-dashboard-chat-emoji="👍"');
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-emoji]")');
  expect(appRuntimeSource).toContain("insertDashboardChatComposerEmoji");
  expect(result.html).not.toMatch(/<span class="dashboard-chat-author">[\s\S]*?<small>10:15<\/small>[\s\S]*?<\/span>/);
  expect(result.html).toContain("data-message-status");
  expect(result.html).not.toContain("dashboard-chat-character-count");
  expect(result.html).not.toContain("dashboard-chat-widget-notify");
  expect(result.html).not.toContain("dashboard-chat-realtime-pill");
  expect(result.html).not.toContain("dashboard-chat-priority is-urgent");
  expect(result.html).not.toContain("dashboard-chat-message-signals");
});

test("chat message bubble shows only the clock time inside the bubble", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [currentUser, { id: "u2", name: "Coach A", status: "active" }];
  const messages = [
    {
      id: "m-older",
      userId: "u2",
      threadId: "team",
      text: "Older message should keep date out of the visible bubble timestamp.",
      createdAt: "2026-06-04T07:45:00",
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
    formatTime: () => "04 Jun 07:45",
    normalizePriority: () => "normal",
    renderMessageText: renderTextWithSearch,
    renderMessageReactions: () => "",
    renderPinnedMessages: () => "",
    renderTypingIndicator: () => "",
    getPinnedMessagesForThread: () => [],
    canDeleteMessage: () => false,
  });
  const threads = [{ threadId: "team", label: "Team Chat", isTeamThread: true, messageCount: 1, lastMessage: messages[0], settings: {} }];
  const result = renderer.render({
    currentUser,
    users,
    state: { isOpen: true, selectedThreadId: "team" },
    messages,
    threads,
    activeThreadId: "team",
  });

  expect(result.html).toContain('<time class="dashboard-chat-bubble-time" datetime="2026-06-04T07:45:00" title="04 Jun 07:45">07:45</time>');
  expect(result.html).toContain('aria-label="Coach A, 04 Jun 07:45"');
  expect(dashboardChatCss).toContain("Chat message timestamps live inside the bubble");
  expect(dashboardChatCss).toContain(".dashboard-chat-bubble:has(.dashboard-chat-bubble-footer) p");
  expect(dashboardChatCss).toContain("position:absolute!important;right:.62rem!important;bottom:.42rem!important;");
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

test("chat runtime preserves open message action menus across background rerenders", () => {
  expect(widgetRuntimeSource).toContain("function readOpenDashboardChatMessageMenu(root)");
  expect(widgetRuntimeSource).toContain("function restoreOpenDashboardChatMessageMenu(root, state)");
  expect(widgetRuntimeSource).toContain("const previousOpenMessageMenuState = readOpenDashboardChatMessageMenu(root);");
  expect(widgetRuntimeSource).toContain("restoreOpenDashboardChatMessageMenu(root, previousOpenMessageMenuState);");
  expect(appRuntimeSource).toContain("closeChatMenus();\nawait toggleDashboardMessageReactionWithApi(");
});

test("chat runtime supports browser notification permission and delivery hook", () => {
  expect(appRuntimeSource).toContain("sendDashboardChatBrowserNotification");
  expect(appRuntimeSource).toContain("dashboardChatPushClient.toggleFromNotificationLevel");
  expect(appRuntimeSource).toContain("dashboardChatPushClient.sendTest");
  expect(appRuntimeSource).toContain("dashboardChatPushClient.status");
  expect(appRuntimeSource).toContain("refreshDashboardChatPushDiagnostics");
  expect(appRuntimeSource).toContain("runDashboardChatNotificationToggleAction");
  expect(appRuntimeSource).toContain("runDashboardChatPushTestAction");
  expect(appRuntimeSource).toContain("function findDashboardChatActionTarget(event, selector)");
  expect(appRuntimeSource).toContain("event.composedPath");
  expect(appRuntimeSource).toContain('findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-test-push]")');
  expect(appRuntimeSource).toContain('findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-toggle-notifications]")');
  expect(appRuntimeSource).toContain('findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-refresh-push-status]")');
  expect(appRuntimeSource).toContain("function isDashboardChatActionTarget(actionButton)");
  expect(appRuntimeSource).toContain('document.addEventListener("pointerdown", handleDashboardChatPushActionEvent, true)');
  expect(appRuntimeSource).toContain('document.addEventListener("click", handleDashboardChatPushActionEvent, true)');
  expect(appRuntimeSource).toContain("event.stopImmediatePropagation?.();\nif (pushButton) {");
  expect(appRuntimeSource).toContain("let testPushMessage =");
  expect(appRuntimeSource).toContain("renderDashboardChatWidget();\nshowDashboardChatWidgetToast(testPushMessage);");
  expect(chatPushClientSource).toContain("win.Notification.requestPermission()");
  expect(chatPushClientSource).toContain("async function sendTest");
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
  expect(result.html).toContain("dashboard-chat-launcher-dot");
  expect(result.html).toContain('<span class="dashboard-chat-launcher-icon" aria-hidden="true">');
  expect(result.html).not.toContain("dashboard-chat-launcher-copy");
  expect(result.html).toContain('<svg viewBox="0 0 24 24" focusable="false">');
  expect(result.html).toContain('d="M4 5.5h16a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8H9.5L5 20.5v-3.2H4a1.8 1.8 0 0 1-1.8-1.8V7.3A1.8 1.8 0 0 1 4 5.5Z"');
  expect(result.html).toContain('<span class="dashboard-chat-header-badge is-unread" aria-hidden="true">1</span>');
  expect(result.html).toContain("1 unread chat message");
  expect(indexSource).toContain("dashboard-chat-launcher.css");
  expect(indexSource).toContain('id=c rel=stylesheet');
  expect(dashboardChatLauncherCss).toContain("Movable chat launcher: a stable floating control that stays out of focused work.");
  expect(dashboardChatLauncherCss).toContain("html body.has-dashboard-chat-widget.is-dashboard-chat-closed .dashboard-chat-widget-root");
  expect(dashboardChatLauncherCss).toContain("right: max(1.15rem, env(safe-area-inset-right)) !important;");
  expect(dashboardChatLauncherCss).toContain("bottom: max(1.15rem, calc(1.15rem + env(safe-area-inset-bottom))) !important;");
  expect(dashboardChatLauncherCss).toContain("width: 3.25rem !important;");
  expect(dashboardChatLauncherCss).toContain("border-radius: 999px !important;");
  expect(dashboardChatLauncherCss).toContain("grid-template: 1fr / 1fr !important;");
  expect(dashboardChatLauncherCss).toContain("html body.has-dashboard-chat-widget.is-dashboard-chat-closed .dashboard-chat-launcher > .dashboard-chat-launcher-icon");
  expect(dashboardChatLauncherCss).toContain("grid-area: 1 / 1 !important;");
  expect(dashboardChatLauncherCss).toContain("place-items: center !important;");
  expect(dashboardChatLauncherCss).toContain("html body.has-dashboard-chat-widget.is-dashboard-chat-closed .dashboard-chat-launcher-icon svg");
  expect(dashboardChatLauncherCss).toContain("stroke-width: 2 !important;");
  expect(dashboardChatLauncherCss).toContain("html body.has-dashboard-chat-widget.is-dashboard-chat-closed .dashboard-chat-launcher .dashboard-chat-header-badge.is-unread");
  expect(dashboardChatLauncherCss).toContain("bottom: -0.1rem !important;");
  expect(dashboardChatLauncherCss).toContain("top: 0.98rem !important;");
  expect(dashboardChatLauncherCss).toContain("right: 0.78rem !important;");
  expect(dashboardChatLauncherCss).toContain("background: #8dd7c1 !important;");
  expect(dashboardChatLauncherCss).toContain("bottom: auto !important;");
  expect(dashboardChatLauncherCss).toContain("cursor: grab !important;");
  expect(dashboardChatLauncherCss).toContain("touch-action: none !important;");
  expect(dashboardChatLauncherCss).toContain("html body.has-dashboard-chat-widget.is-dashboard-chat-surface-suppressed .dashboard-chat-widget-root");
  expect(dashboardChatLauncherCss).toContain("html body.has-dashboard-chat-widget.is-video-analysis-fs-player-code-mode .dashboard-chat-widget-root");
  expect(dashboardChatLauncherCss).toContain("html body.has-dashboard-chat-widget.is-video-analysis-fs-player-fullscreen .dashboard-chat-widget-root");
  expect(dashboardChatLauncherCss).toContain("body.has-dashboard-chat-widget.is-dashboard-chat-open .dashboard-chat-rail-toggle");
  expect(dashboardChatLauncherCss).toContain("body.has-dashboard-chat-widget.is-dashboard-chat-open .dashboard-chat-rail-toggle .dashboard-chat-rail-toggle-icon svg");
  expect(appRuntimeSource).toContain("createDashboardChatLauncherRuntime");
  expect(appRuntimeSource).toContain("football-dashboard-chat-launcher-position-v1");
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
  expect(openResult.html).toContain('class="dashboard-chat-rail-toggle platform-nav-item is-active"');
  expect(openResult.html).toContain('class="platform-nav-icon dashboard-chat-rail-toggle-icon"');
  expect(openResult.html).toContain('<span class="platform-nav-text">Messages</span>');
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

test("chat launcher clamps saved positions and suppresses immersive surfaces", () => {
  expect(clampDashboardChatLauncherPosition({
    left: -200,
    top: 900,
    width: 58,
    height: 58,
    viewportWidth: 1024,
    viewportHeight: 768,
  })).toEqual({ left: 12, top: 698 });

  const root = { contains: () => false };
  const classNames = new Set(["is-video-analysis-fs-player-code-mode"]);
  const documentRef = {
    fullscreenElement: null,
    body: { classList: { contains: (name) => classNames.has(name) } },
    querySelectorAll: () => [],
  };
  expect(isDashboardChatImmersiveSurfaceActive(documentRef, root)).toBe(true);
  classNames.clear();
  documentRef.fullscreenElement = {};
  expect(isDashboardChatImmersiveSurfaceActive(documentRef, root)).toBe(true);
});

test("chat notification cursor is persisted when active-thread toasts are suppressed", () => {
  expect(widgetRuntimeSource).toContain("function writeDashboardChatWidgetNotificationCursorForMessage");
  expect(widgetRuntimeSource).toContain("const threadId = normalizeDashboardChatThreadId(message.threadId, dashboardChatTeamThreadId);");
  expect(widgetRuntimeSource).toContain("writeDashboardChatWidgetNotificationCursorForMessage(activeThreadLastMessage);");
  expect(widgetRuntimeSource).toContain("if (isDashboardChatThreadActivelyViewed(latestVisibleMessage.threadId)) {");
  expect(widgetRuntimeSource).toContain("writeDashboardChatWidgetNotificationCursorForMessage(latestVisibleMessage);");
  expect(widgetRuntimeSource).toContain("markDashboardChatWidgetNotificationSeenForThread?.(latestVisibleMessage.threadId, latestVisibleMessage);");
  expect(widgetRuntimeSource).toContain("{ message: latestVisibleMessage }");
  expect(widgetRuntimeSource).toContain("function dismissDashboardChatWidgetToast");
  expect(chatWidgetRendererSource).toContain("data-dashboard-chat-toast-dismiss");
  expect(appRuntimeSource).toContain("event.target.closest(\"[data-dashboard-chat-toast-dismiss]\")");
  expect(appRuntimeSource).toContain("const toastMessageId = String(toastOpenButton.dataset.dashboardChatToastMessage || \"\").trim();");
  expect(appRuntimeSource).toContain("scrollDashboardChatDeepLinkMessage(toastMessageId);");
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
  expect(result.html).toContain('id="dashboardChatGroupCreateDescription">Name the group, add people, then create the chat.</small>');
  expect(result.html).toContain('class="dashboard-chat-group-create-flow" aria-hidden="true"');
  expect(result.html).toContain('<span>Name</span>');
  expect(result.html).toContain('<span>Members</span>');
  expect(result.html).toContain('<span>Create</span>');
  expect(result.html).toContain('minlength="2" maxlength="80" placeholder="Group name" required autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-label="Group name" data-dashboard-chat-group-name-input');
  expect(result.html).toContain('id="dashboardChatGroupAvatarHelp">Optional · image URL or two initials</small>');
  expect(result.html).toContain('maxlength="800" placeholder="MP" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="Group image URL or initials" aria-describedby="dashboardChatGroupAvatarHelp" data-dashboard-chat-group-avatar-input');
  expect(result.html).toContain('data-dashboard-chat-group-filter-status aria-live="polite" aria-atomic="true"');
  expect(result.html).toContain('data-dashboard-chat-group-selected-list hidden aria-live="polite" aria-atomic="true"');
  expect(result.html).toContain('class="dashboard-chat-group-create-users" role="group" aria-label="Choose group members"');
  expect(result.html).toContain('aria-label="Add Ceri Bowley (scout) to group"');
  expect(result.html).toContain('aria-describedby="dashboardChatGroupUserMeta-u2"');
  expect(result.html).toContain('<small id="dashboardChatGroupUserMeta-u2">scout</small>');
  expect(result.html).toContain('class="dashboard-chat-group-user-action"');
  expect(result.html).toContain('data-dashboard-chat-group-create-submit disabled aria-disabled="true" aria-label="Create selected group" title="Add a group name with at least 2 characters and choose at least one teammate"');
  expect(result.html).toContain('class="dashboard-chat-group-create-close" aria-controls="dashboardChatGroupCreateDialog" aria-label="Close new group dialog" title="Close new group dialog"');
  expect(result.html).toContain("data-dashboard-chat-create-menu-trigger");
  expect(result.html).toContain('aria-label="Open create chat menu"');
  expect(result.html).toContain('title="Open create chat menu"');
  expect(result.html).toContain('aria-haspopup="menu"');
  expect(result.html).toContain('aria-controls="dashboardChatCreateMenu"');
  expect(result.html).toContain('id="dashboardChatCreateMenu" class="dashboard-chat-thread-preset-menu" role="menu" aria-label="Create chat"');
  expect(result.html).toContain('role="menuitem" data-dashboard-chat-open-group-creator aria-haspopup="dialog" aria-controls="dashboardChatGroupCreateDialog"');
  expect(dashboardChatCreateCss).toContain(".dashboard-chat-group-create-flow");
  expect(dashboardChatCreateCss).toContain(".dashboard-chat-group-user-action");
  expect(dashboardChatCreateCss).toContain(".dashboard-chat-group-create-close::before");
  expect(dashboardChatCreateCss).toContain(".dashboard-chat-group-create-close::after");
  expect(dashboardChatCreateCss).toContain("width: 2.12rem !important;");
  expect(dashboardChatCreateCss).toContain("font-size: 0 !important;");
  expect(dashboardChatCreateCss).toContain("box-shadow: 0 14px 28px rgba(15, 23, 42, 0.2) !important;");
  expect(dashboardChatCreateCss).toContain('content: "Added"');
  expect(dashboardChatCreateCss).toContain("position: sticky");
});

test("chat creator exposes private-message mode before group creation", () => {
  const currentUser = { id: "u1", name: "Mak" };
  const users = [
    currentUser,
    { id: "u2", name: "Ceri Bowley", role: "scout", email: "ceri@example.com", status: "active" },
    { id: "u3", name: "Austin Da Luz", role: "coach", email: "austin@example.com", status: "active" },
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
    {
      threadId: "dm:u1:u2",
      label: "Ceri Bowley",
      type: "dm",
      visibility: "private",
      createdAt: "2026-07-16T10:00:00.000Z",
      messageCount: 0,
      participants: [
        { id: "u1", userId: "u1", name: "Mak" },
        { id: "u2", userId: "u2", name: "Ceri Bowley", email: "ceri@example.com" },
      ],
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
  expect(result.html).toContain("teammates available · start new or open existing");
  expect(result.html).toContain('role="list" aria-label="Start a private chat"');
  expect(result.html).toContain('name="participantId"');
  expect(result.html).toContain('aria-label="Open private chat with Ceri Bowley (scout)"');
  expect(result.html).toContain('data-dashboard-chat-direct-existing-thread="dm:u1:u2"');
  expect(result.html).toContain('aria-label="Start private chat with Austin Da Luz (coach)"');
  expect(result.html).toContain('class="dashboard-chat-direct-user-action"');
  expect(result.html).toContain('class="dashboard-chat-group-user dashboard-chat-direct-user is-existing-thread"');
  expect(result.html).toContain('class="dashboard-chat-group-user dashboard-chat-direct-user is-new-thread"');
  expect(result.html).toContain('<span class="dashboard-chat-direct-user-action" aria-hidden="true">Open</span>');
  expect(result.html).toContain('<span class="dashboard-chat-direct-user-action" aria-hidden="true">Start</span>');
  expect(result.html).toContain("Tap a teammate to start or open the private chat.");
  expect(result.html).toContain('data-dashboard-chat-direct-create-submit hidden aria-hidden="true" tabindex="-1"');
  expect(result.html).toContain("data-dashboard-chat-open-direct-creator");
  expect(result.html).toContain("Private message");
  expect(result.html).toContain("New group");
  expect(indexSource).toContain("dashboard-chat-create.css");
  expect(dashboardChatCreateCss).toContain(".dashboard-chat-direct-user-action");
  expect(dashboardChatCreateCss).toContain('appearance: none');
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-open-direct-creator]")');
  expect(appRuntimeSource).toContain('querySelector("[data-dashboard-chat-direct-user-filter]")?.focus();');
  expect(appRuntimeSource).toContain('event.target.closest("[data-dashboard-chat-direct-user-search]")');
  expect(appRuntimeSource).toContain("syncDashboardChatDirectCreateForm");
  expect(appRuntimeSource).toContain("filterDashboardChatDirectCreateUsers");
  expect(appRuntimeSource).toContain("await createDashboardDirectThreadFromForm(directCreateForm);");
  expect(composerRuntimeSource).toContain("createDashboardDirectThreadFromForm");
  expect(composerRuntimeSource).toContain("dashboardChatDirectExistingThread");
  expect(composerRuntimeSource).toContain("selectedThreadId: existingThreadId");
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
  expect(appRuntimeSource).toContain("setDashboardChatGroupCreatorOpen(true, { forceRender: true });");
  expect(appRuntimeSource).toContain("dashboardChatGroupCreatorOpen = Boolean(next);");
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
  expect(dashboardChatCss).toContain("Chat message width polish");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-message,.dashboard-chat-widget .dashboard-chat-message.is-own{width:100%!important;max-width:100%!important}");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-bubble,.dashboard-chat-widget .dashboard-chat-bubble p{width:100%!important;max-width:100%!important;box-sizing:border-box!important}");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-thread-filters button.is-active");
  expect(dashboardChatCss).toContain("background:#1f6f54!important;");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget .dashboard-chat-input-shell textarea:focus");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-body,");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-toast[hidden]");
  expect(dashboardChatCss).toContain("bottom:var(--platform-rail-chat-mobile-bottom,calc(.85rem + env(safe-area-inset-bottom)))!important;");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-toast");
  expect(dashboardChatMessageCss).toContain(".dashboard-chat-widget .dashboard-chat-widget-toast-dismiss");
  expect(dashboardChatMessageCss).toContain(".dashboard-chat-widget .dashboard-chat-widget-toast:not([hidden])");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-confirm-backdrop");
  expect(dashboardChatCss).toContain("z-index:900!important;");
  expect(dashboardChatCss).toContain("chat menus must float above empty conversation states");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-more-menu[open]");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-empty-state{z-index:0!important;pointer-events:none!important}");
  expect(dashboardChatCss).toContain("chat header menus must sit above conversation content");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-widget-header{position:relative!important;z-index:420!important;overflow:visible!important}");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-more-menu[open] .dashboard-chat-more-menu-panel{z-index:450!important;pointer-events:auto!important}");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-conversation .dashboard-chat-list{position:relative!important;z-index:0!important}");
  expect(dashboardChatCss).toContain("chat composer priority menu opens upward from the bottom input");
  expect(dashboardChatCss).toContain(".dashboard-chat-widget.is-open .dashboard-chat-compose-more .dashboard-chat-compose-more-panel");
  expect(dashboardChatCss).toContain("bottom:calc(100% + .45rem)!important;");
  expect(dashboardChatCss).toContain("top:auto!important;");
  expect(dashboardChatCss).toContain("chat send button has a stronger touch target");
  expect(dashboardChatCss).toContain('.dashboard-chat-widget.is-open .dashboard-chat-form>button[type="submit"]');
  expect(dashboardChatCss).toContain("min-width:5.05rem!important;");
  expect(dashboardChatCss).toContain("min-height:3.05rem!important;");
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
  expect(dashboardChatCss).toContain("width:1.42rem!important;");
  expect(appRuntimeSource).toContain(".dashboard-chat-message-menu[open], .dashboard-chat-message-reaction-menu[open]");
  expect(appRuntimeSource).toContain('findDashboardChatActionTarget(event, ".dashboard-chat-message-menu, .dashboard-chat-message-reaction-menu")');
  expect(appRuntimeSource).toContain('findDashboardChatActionTarget(event, "[data-dashboard-message-reaction][data-dashboard-reaction-key]")');
  expect(appRuntimeSource).toContain("handleDashboardChatReactionActionEvent");
  expect(appRuntimeSource).toContain('document.addEventListener("click", handleDashboardChatReactionActionEvent, true)');
  expect(appRuntimeSource).toContain("function toggleDashboardMessageReactionWithApi(messageId, reactionKey)");

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
  expect(result.html).not.toContain('class="dashboard-chat-message-reaction-menu"');
  expect(result.html).not.toContain('class="dashboard-chat-message-reaction-panel"');
  expect(result.html).toContain("Open message actions");
  expect(result.html).not.toContain("&#128578;");
  expect(result.html).toContain("dashboard-chat-menu-reaction-group");
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
