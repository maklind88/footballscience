import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createDashboardChatWidgetRenderer } from "../src/modules/chat/chat-widget-renderer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardChatCss = readFileSync(resolve(__dirname, "../dashboard-chat.css"), "utf8");
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
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher>*:not(.dashboard-chat-header-badge):not(.dashboard-chat-launcher-icon)");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher .dashboard-chat-header-badge.is-unread");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-widget-root{left:1.04rem");
  expect(dashboardChatCss).toContain("width:2.58rem!important;height:2.28rem!important");
  expect(dashboardChatCss).toContain("border-radius:.72rem .72rem .72rem .24rem!important");
  expect(dashboardChatCss).toContain("linear-gradient(135deg,rgba(236,253,245,.18),rgba(59,130,246,.08))");
  expect(dashboardChatCss).toContain(".dashboard-chat-launcher:before,body.is-dashboard-chat-closed .dashboard-chat-launcher:after{content:none!important}");
  expect(dashboardChatCss).toContain("body.is-dashboard-chat-closed .dashboard-chat-launcher-icon{position:relative!important;display:block!important");
  expect(dashboardChatCss).toContain("border-radius:.26rem .26rem .26rem .12rem!important");
  expect(dashboardChatCss).toContain("clip-path:polygon(0 0,100% 0,0 100%)!important");
  expect(dashboardChatCss).toContain("top:-.4rem!important;right:-.42rem!important");
  expect(dashboardChatCss).toContain("@media(max-width:820px){body.is-dashboard-chat-closed .dashboard-chat-widget-root{left:auto");
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
