export function createDashboardChatWidgetRuntime(dependencies = {}) {
  const {
    dashboardChatTeamThreadId = "team",
    dashboardChatWidgetRenderer = { render: () => ({ html: "", activeThreadId: "team", replyDraft: null }) },
    dashboardChatAdvancedThreadTemplates = [],
    dashboardChatSubmittedComposerDrafts = new Map(),
    getDashboardApiThreads = () => [],
    getDashboardApiPagination = () => ({}),
    getDashboardChatThreadSummarySyncTimer = () => 0,
    getDashboardChatThreadSummaryLastRequestedAt = () => 0,
    queueDashboardChatThreadSummaryRefresh = () => {},
    queueDashboardChatApiRefresh = () => {},
    getDashboardHydratedThreadIds = () => new Set(),
    getDashboardChatApiSyncTimer = () => 0,
    getDashboardChatThreadList = () => [],
    readDashboardMessages = () => [],
    isDashboardChatThreadActivelyViewed = () => false,
    markDashboardMessagesReadForCurrentUser = (messages) => messages,
    getDashboardChatUnreadCountForCurrentUser = () => 0,
    isDashboardChatPageScrollActive = () => false,
    setDashboardChatPageScroll = () => {},
    dashboardChatAttachmentRenderer = { queueSignedUrls: () => {} },
    readDashboardChatWidgetNotificationState = () => ({ enabled: true, level: "all" }),
    readDashboardChatWidgetState = () => ({ isOpen: false, selectedThreadId: dashboardChatTeamThreadId }),
    writeDashboardChatWidgetState = () => {},
    readDashboardChatWidgetNotificationCursor = () => ({ threads: {} }),
    writeDashboardChatWidgetNotificationCursor = () => {},
    getDashboardChatThreadSettings = () => ({ get: () => ({}) }),
    getCurrentPlatformUser = () => null,
    getPlatformUsers = () => [],
    getDashboardChatTeamChatTitle = () => "Team Chat",
    getDashboardChatReplyDraft = () => null,
    setDashboardChatReplyDraft = () => {},
    getDashboardChatPriorityDraft = () => "normal",
    getDashboardChatConfirmAction = () => null,
    getDashboardChatMessageSearchQuery = () => "",
    getDashboardChatMessageSearchActiveIndex = () => 0,
    getDashboardChatModerationOpen = () => false,
    getDashboardChatDetailsOpen = () => false,
    getDashboardChatMobileConversationOpen = () => true,
    getDashboardChatComposerAttachmentDraft = () => null,
    getDashboardChatGroupCreatorOpen = () => false,
    getDashboardChatThreadFilter = () => "all",
    getDashboardChatThreadSettingsDialog = () => null,
    dashboardChatThreadSettings = { get: () => ({ muted: false }) },
    dashboardChatModerationState = {},
    normalizeDashboardChatThreadId = (threadId, fallback = dashboardChatTeamThreadId) => threadId || fallback,
    normalizeDashboardApiMessage = (message) => message,
    getDashboardMessageCreatedAtMs = () => 0,
    formatDashboardChatThreadLabel = () => "",
    markDashboardChatWidgetNotificationSeenForThread = () => {},
    formatUserName = () => "Staff",
    platformNavigationController = {},
    ui = {},
    win = typeof globalThis !== "undefined" ? globalThis : {},
    documentRef = typeof document !== "undefined" ? document : null,
    ensureDashboardChatStylesheet = () => Promise.resolve(),
    resetDashboardChatLocalCacheIfNeeded = () => {},
    getRealtimeStatus = () => ({}),
  } = dependencies;

  let dashboardChatWidgetToastTimer = null;
  let dashboardChatWidgetToastState = null;

  const runtimeDashboardChatAttachmentRenderer = dashboardChatAttachmentRenderer || { queueSignedUrls: () => {} };

  function getDashboardChatRenderSignature(html = "") {
    let hash = 0;
    for (let index = 0; index < html.length; index += 1) {
      hash = (hash * 31 + html.charCodeAt(index)) >>> 0;
    }
    return `${html.length}:${hash}`;
  }

  function showDashboardChatWidgetToast(messageText, threadId = dashboardChatTeamThreadId) {
    const root = ui.dashboardChatWidgetRoot;
    if (!root) {
      return;
    }

    if (dashboardChatWidgetToastTimer) {
      win.clearTimeout(dashboardChatWidgetToastTimer);
      dashboardChatWidgetToastTimer = null;
    }

    const toastState = {
      text: String(messageText || "").trim(),
      createdAt: Date.now(),
      threadId: normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId),
    };

    dashboardChatWidgetToastState = toastState;

    const toastRoot = root.querySelector("[data-dashboard-chat-widget-toast]");
    if (!toastRoot || !toastState.text) {
      return;
    }

    toastRoot.textContent = toastState.text;
    toastRoot.dataset.dashboardChatToastThread = toastState.threadId;
    toastRoot.hidden = false;
    dashboardChatWidgetToastTimer = win.setTimeout(() => {
      if (root.querySelector("[data-dashboard-chat-widget-toast]")) {
        root.querySelector("[data-dashboard-chat-widget-toast]").hidden = true;
      }
      dashboardChatWidgetToastTimer = null;
    }, 3900);
  }

  function hideDashboardChatWidgetToast() {
    const root = ui.dashboardChatWidgetRoot;
    if (!root) {
      return;
    }

    const toastRoot = root.querySelector("[data-dashboard-chat-widget-toast]");
    if (toastRoot) {
      toastRoot.hidden = true;
      toastRoot.textContent = "";
      delete toastRoot.dataset.dashboardChatToastThread;
    }

    if (dashboardChatWidgetToastTimer) {
      win.clearTimeout(dashboardChatWidgetToastTimer);
      dashboardChatWidgetToastTimer = null;
    }

    dashboardChatWidgetToastState = null;
  }

  function focusDashboardChatWidgetComposer() {
    win.setTimeout(() => {
      ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-input]")?.focus();
    }, 0);
  }

  function isDashboardChatNotificationCursorCurrentForMessage(cursor = {}, message = {}) {
    if (!cursor || !message?.id) {
      return false;
    }
    const messageThreadId = normalizeDashboardChatThreadId(message.threadId, dashboardChatTeamThreadId);
    const cursorThreadId = normalizeDashboardChatThreadId(cursor.threadId, "");
    const messageId = String(message.id || "").trim();
    const cursorMessageId = String(cursor.lastMessageId || "").trim();
    const messageUserId = String(message.userId || "").trim();
    const cursorUserId = String(cursor.userId || "").trim();
    if (cursorThreadId === messageThreadId && cursorMessageId === messageId && cursorUserId === messageUserId) {
      return true;
    }
    const messageCreatedAtMs = Number(getDashboardMessageCreatedAtMs(message) || 0) || 0;
    const cursorSeenAt = Number(cursor.seenAt || 0) || 0;
    const cursorMessageCreatedAtMs = Number(cursor.messageCreatedAtMs || 0) || 0;
    return Boolean(
      cursorThreadId === messageThreadId &&
        cursorUserId === messageUserId &&
        messageCreatedAtMs > 0 &&
        (cursorSeenAt >= messageCreatedAtMs || cursorMessageCreatedAtMs >= messageCreatedAtMs)
    );
  }

  function writeDashboardChatWidgetNotificationCursorForMessage(message = {}) {
    if (!message?.id) {
      return;
    }

    const threadId = normalizeDashboardChatThreadId(message.threadId, dashboardChatTeamThreadId);
    writeDashboardChatWidgetNotificationCursor({
      lastMessageId: message.id,
      seenAt: Date.now(),
      userId: message.userId,
      threadId,
      messageCreatedAtMs: getDashboardMessageCreatedAtMs(message),
    });
  }

  function renderDashboardChatWidget() {
    const root = ui.dashboardChatWidgetRoot;
    if (!root) {
      return;
    }

    const currentUser = getCurrentPlatformUser();
    if (!currentUser) {
      documentRef?.body?.classList.remove("has-dashboard-chat-widget");
      documentRef?.body?.classList.remove("is-dashboard-chat-closed");
      documentRef?.body?.classList.remove("is-dashboard-chat-open");
      delete root.dataset.dashboardChatRenderSignature;
      root.innerHTML = "";
      return;
    }

    ensureDashboardChatStylesheet().catch(() => {});
    resetDashboardChatLocalCacheIfNeeded();

    const state = readDashboardChatWidgetState();
    const lastRequestedAt = Number(getDashboardChatThreadSummaryLastRequestedAt?.() || 0);
    const syncTimer = Number(getDashboardChatThreadSummarySyncTimer?.() || 0);
    if (state.isOpen && !syncTimer && Date.now() - lastRequestedAt > 30000) {
      queueDashboardChatThreadSummaryRefresh({ delayMs: 50, render: true });
    }

    const users = getPlatformUsers().filter((user) => user.status === "active");
    const notificationState = readDashboardChatWidgetNotificationState();

    documentRef?.body?.classList.add("has-dashboard-chat-widget");
    documentRef?.body?.classList.toggle("is-dashboard-chat-open", Boolean(state.isOpen));
    documentRef?.body?.classList.toggle("is-dashboard-chat-closed", !state.isOpen);

    const activeElement = documentRef?.activeElement;
    const existingComposer = root.querySelector("[data-dashboard-chat-input]");
    const wasComposerFocused = Boolean(existingComposer && activeElement === existingComposer);
    const previousComposerSelectionStart = wasComposerFocused ? existingComposer.selectionStart : null;
    const previousComposerSelectionEnd = wasComposerFocused ? existingComposer.selectionEnd : null;
    const previousComposerThreadId = state.selectedThreadId;
    const previousComposerRawDraft = existingComposer?.value || "";
    const submittedComposerDraft = dashboardChatSubmittedComposerDrafts.get(previousComposerThreadId) || "";
    const shouldClearSubmittedComposerDraft = Boolean(submittedComposerDraft) &&
      (!previousComposerRawDraft || previousComposerRawDraft.trim() === submittedComposerDraft);
    const previousComposerDraft = shouldClearSubmittedComposerDraft ? "" : previousComposerRawDraft;

    const existingThreadList = root.querySelector("[data-dashboard-chat-thread-list]");
    const previousThreadListScrollTop = existingThreadList?.scrollTop ?? 0;
    const previousThreadListScrollLeft = existingThreadList?.scrollLeft ?? 0;
    const existingChatList = root.querySelector("[data-dashboard-chat-list]");
    const previousChatListScrollTop = existingChatList?.scrollTop ?? null;
    const previousChatListScrollHeight = existingChatList?.scrollHeight ?? 0;
    const previousChatListClientHeight = existingChatList?.clientHeight ?? 0;
    const previousChatListWasAtBottom =
      existingChatList && previousChatListScrollHeight - previousChatListScrollTop - previousChatListClientHeight < 96;

    const preserveChatScroll = isDashboardChatPageScrollActive();
    const messages = readDashboardMessages();
    const resolvedMessages = isDashboardChatThreadActivelyViewed(state.selectedThreadId)
      ? markDashboardMessagesReadForCurrentUser(messages, state.selectedThreadId)
      : messages;

    runtimeDashboardChatAttachmentRenderer.queueSignedUrls(resolvedMessages);

    const threads = getDashboardChatThreadList(currentUser, users, resolvedMessages);
    const activeThreadId = threads.some((thread) => thread.threadId === state.selectedThreadId)
      ? state.selectedThreadId
      : threads[0]?.threadId || dashboardChatTeamThreadId;

    const hydratedThreadIds = getDashboardHydratedThreadIds();
    if (
      state.isOpen &&
      activeThreadId &&
      hydratedThreadIds instanceof Set &&
      !hydratedThreadIds.has(activeThreadId) &&
      !getDashboardChatApiSyncTimer()
    ) {
      hydratedThreadIds.add(activeThreadId);
      queueDashboardChatApiRefresh({ threadId: activeThreadId, delayMs: 0 });
    }

    const unreadCount = getDashboardChatUnreadCountForCurrentUser(currentUser, resolvedMessages);
    const apiPagination = getDashboardApiPagination?.() || {};
    const renderedWidget = dashboardChatWidgetRenderer.render({
      currentUser,
      users,
      notificationState,
      state,
      messages: resolvedMessages,
      threads,
      activeThreadId,
      unreadCount,
      realtimeStatus: getRealtimeStatus(),
      detailsOpen: getDashboardChatDetailsOpen(),
      mobileConversationOpen: getDashboardChatMobileConversationOpen(),
      replyDraft: getDashboardChatReplyDraft(),
      priorityDraft: getDashboardChatPriorityDraft(),
      confirmAction: getDashboardChatConfirmAction(),
      messageSearchQuery: getDashboardChatMessageSearchQuery(),
      messageSearchActiveIndex: getDashboardChatMessageSearchActiveIndex(),
      hasOlderMessages: Boolean(apiPagination?.[activeThreadId]),
      advancedThreadTemplates: dashboardChatAdvancedThreadTemplates,
      moderationOpen: getDashboardChatModerationOpen(),
      moderationState: dashboardChatModerationState,
      attachmentDraft: getDashboardChatComposerAttachmentDraft(),
      teamChatTitle: getDashboardChatTeamChatTitle(),
      groupCreatorOpen: getDashboardChatGroupCreatorOpen(),
      threadFilter: getDashboardChatThreadFilter(),
      threadSettingsDialog: getDashboardChatThreadSettingsDialog(),
    });

    setDashboardChatReplyDraft(renderedWidget.replyDraft);
    if (renderedWidget.activeThreadId !== state.selectedThreadId) {
      writeDashboardChatWidgetState({
        ...state,
        selectedThreadId: renderedWidget.activeThreadId,
      });
    }

    const renderSignature = getDashboardChatRenderSignature(renderedWidget.html);
    if (root.dataset.dashboardChatRenderSignature === renderSignature) {
      if (shouldClearSubmittedComposerDraft) {
        dashboardChatSubmittedComposerDrafts.delete(previousComposerThreadId);
      }
      setDashboardChatPageScroll(false);
      platformNavigationController.renderTopIconMenu?.();
      return;
    }

    const previousMessageSearchInput = root.querySelector("[data-dashboard-chat-message-search]");
    const wasMessageSearchFocused = Boolean(
      previousMessageSearchInput && documentRef?.activeElement === previousMessageSearchInput
    );
    const previousMessageSearchSelectionStart = wasMessageSearchFocused ? previousMessageSearchInput.selectionStart : null;
    const previousMessageSearchSelectionEnd = wasMessageSearchFocused ? previousMessageSearchInput.selectionEnd : null;

    root.innerHTML = renderedWidget.html;
    root.dataset.dashboardChatRenderSignature = renderSignature;
    if (shouldClearSubmittedComposerDraft) {
      dashboardChatSubmittedComposerDrafts.delete(previousComposerThreadId);
    }

    const nextThreadList = root.querySelector("[data-dashboard-chat-thread-list]");
    if (nextThreadList) {
      nextThreadList.scrollTop = previousThreadListScrollTop;
      nextThreadList.scrollLeft = previousThreadListScrollLeft;
    }
    if (wasMessageSearchFocused) {
      const nextMessageSearchInput = root.querySelector("[data-dashboard-chat-message-search]");
      if (nextMessageSearchInput) {
        nextMessageSearchInput.focus();
        if (previousMessageSearchSelectionStart !== null && previousMessageSearchSelectionEnd !== null) {
          nextMessageSearchInput.setSelectionRange(previousMessageSearchSelectionStart, previousMessageSearchSelectionEnd);
        }
      }
    }

    const nextChatList = root.querySelector("[data-dashboard-chat-list]");
    const activeSearchMatchElement = root.querySelector("[data-dashboard-chat-search-active='true']");
    if (activeSearchMatchElement) {
      activeSearchMatchElement.scrollIntoView({ block: "center", inline: "nearest" });
    } else if (nextChatList && previousChatListScrollTop !== null && previousComposerThreadId === renderedWidget.activeThreadId) {
      const nextMaxScrollTop = Math.max(0, nextChatList.scrollHeight - nextChatList.clientHeight);
      const nextScrollTop = preserveChatScroll
        ? previousChatListScrollTop + Math.max(0, nextChatList.scrollHeight - previousChatListScrollHeight)
        : previousChatListScrollTop;
      nextChatList.scrollTop = previousChatListWasAtBottom
        ? nextMaxScrollTop
        : Math.min(Math.max(0, nextScrollTop), nextMaxScrollTop);
    }

    setDashboardChatPageScroll(false);
    if (previousComposerThreadId === renderedWidget.activeThreadId) {
      const nextComposer = root.querySelector("[data-dashboard-chat-input]");
      if (nextComposer) {
        nextComposer.value = previousComposerDraft;
        const characterCount = nextComposer.closest("[data-dashboard-chat-form]")?.querySelector("[data-dashboard-chat-character-count]");
        if (characterCount) {
          characterCount.textContent = `${String(previousComposerDraft || "").length}/${nextComposer.getAttribute("maxlength") || ""}`;
        }
        if (wasComposerFocused) {
          nextComposer.focus();
        }
        if (wasComposerFocused && previousComposerSelectionStart !== null && previousComposerSelectionEnd !== null) {
          nextComposer.setSelectionRange(previousComposerSelectionStart, previousComposerSelectionEnd);
        }
      }
    }

    platformNavigationController.renderTopIconMenu?.();
  }

  function syncDashboardChatWidgetNotificationCursor() {
    const currentUser = getCurrentPlatformUser();
    if (!currentUser) {
      return;
    }

    const state = readDashboardChatWidgetState();
    const notifications = readDashboardChatWidgetNotificationState();
    const messages = readDashboardMessages();
    const normalizedActiveThreadId = normalizeDashboardChatThreadId(state.selectedThreadId, dashboardChatTeamThreadId);
    const apiThreads = getDashboardApiThreads?.() || [];
    const activeThreadApi = apiThreads.find((thread) => thread.threadId === normalizedActiveThreadId) || null;
    const activeThreadApiLastMessage = activeThreadApi?.lastMessage
      ? normalizeDashboardApiMessage(activeThreadApi.lastMessage, activeThreadApi)
      : null;
    const isSettledVisibleMessage = (message) => {
      const status = String(message?.status || "sent").trim().toLowerCase();
      return Boolean(message?.id && message?.text && status !== "pending" && status !== "failed" && status !== "deleted");
    };
    const newestMessage = (sourceMessages = []) =>
      sourceMessages
        .filter(isSettledVisibleMessage)
        .sort((first, second) => getDashboardMessageCreatedAtMs(second) - getDashboardMessageCreatedAtMs(first))[0] || null;
    const activeThreadLastMessage =
      newestMessage(messages.filter((message) => message.threadId === normalizedActiveThreadId)) ||
      activeThreadApiLastMessage ||
      (activeThreadApi?.lastMessageId ? { id: activeThreadApi.lastMessageId, userId: "", threadId: normalizedActiveThreadId } : null);
    const currentCursor = readDashboardChatWidgetNotificationCursor();
    const activeThreadCursor = currentCursor?.threads?.[activeThreadLastMessage?.threadId] || {};

    if (
      activeThreadLastMessage &&
      isDashboardChatThreadActivelyViewed(activeThreadLastMessage.threadId)
    ) {
      if (
        !isDashboardChatNotificationCursorCurrentForMessage(activeThreadCursor, activeThreadLastMessage)
      ) {
        writeDashboardChatWidgetNotificationCursorForMessage(activeThreadLastMessage);
      }
      if (dashboardChatWidgetToastState?.threadId === activeThreadLastMessage.threadId) {
        hideDashboardChatWidgetToast();
      }
    }

    if (!notifications?.enabled) {
      return;
    }

    const latestMessage = newestMessage(messages.filter((message) => message.userId !== currentUser.id));
    const latestApiThreadMessage = apiThreads
      .map((thread) => (thread.lastMessage ? normalizeDashboardApiMessage(thread.lastMessage, thread) : null))
      .filter((message) => message && message.userId !== currentUser.id)
      .sort((first, second) => getDashboardMessageCreatedAtMs(second) - getDashboardMessageCreatedAtMs(first))[0] || null;
    const latestVisibleMessage =
      [latestMessage, latestApiThreadMessage]
        .filter(Boolean)
        .sort((first, second) => getDashboardMessageCreatedAtMs(second) - getDashboardMessageCreatedAtMs(first))[0] || null;

    if (!latestVisibleMessage) {
      return;
    }

    const latestCursorState = readDashboardChatWidgetNotificationCursor();
    const cursor = latestCursorState?.threads?.[latestVisibleMessage.threadId] || latestCursorState;
    if (isDashboardChatNotificationCursorCurrentForMessage(cursor, latestVisibleMessage)) {
      return;
    }

    if (isDashboardChatThreadActivelyViewed(latestVisibleMessage.threadId)) {
      writeDashboardChatWidgetNotificationCursorForMessage(latestVisibleMessage);
      markDashboardChatWidgetNotificationSeenForThread?.(latestVisibleMessage.threadId);
      if (dashboardChatWidgetToastState?.threadId === latestVisibleMessage.threadId) {
        hideDashboardChatWidgetToast();
      }
      return;
    }

    const currentSettings = dashboardChatThreadSettings || { get: () => ({ muted: false }) };
    const muted = currentSettings?.get?.(latestVisibleMessage.threadId)?.muted;
    if (muted) {
      return;
    }

    const users = getPlatformUsers();
    const sender = users?.find((entry) => entry.id === latestVisibleMessage.userId);
    const senderName = formatUserName(sender ?? latestVisibleMessage.author ?? { firstName: "Team", lastName: "Member" });
    const threadName = formatDashboardChatThreadLabel(latestVisibleMessage.threadId, currentUser, getPlatformUsers());
    const mentionedCurrentUser = Array.isArray(latestVisibleMessage.mentionedUserIds) && latestVisibleMessage.mentionedUserIds.includes(currentUser.id);

    if (notifications.level === "mentions" && !mentionedCurrentUser) {
      return;
    }

    showDashboardChatWidgetToast(
      mentionedCurrentUser
        ? `${senderName} mentioned you in ${threadName}`
        : `New message from ${senderName} in ${threadName}`,
      latestVisibleMessage.threadId
    );
    writeDashboardChatWidgetNotificationCursorForMessage(latestVisibleMessage);
    markDashboardChatWidgetNotificationSeenForThread?.(latestVisibleMessage.threadId);
  }

  return {
    renderDashboardChatWidget,
    syncDashboardChatWidgetNotificationCursor,
    showDashboardChatWidgetToast,
    hideDashboardChatWidgetToast,
    focusDashboardChatWidgetComposer,
  };
}
