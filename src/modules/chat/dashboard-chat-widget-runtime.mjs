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
    getDashboardChatCreatorMode = () => "group",
    getDashboardChatThreadFilter = () => "all",
    getDashboardChatThreadSettingsDialog = () => null,
    getDashboardChatPushDiagnosticsState = () => null,
    getDashboardChatApiStatus = () => ({ key: "idle" }),
    dashboardChatThreadSettings = { get: () => ({ muted: false }) },
    dashboardChatModerationState = {},
    normalizeDashboardChatThreadId = (threadId, fallback = dashboardChatTeamThreadId) => threadId || fallback,
    normalizeDashboardApiMessage = (message) => message,
    getDashboardMessageCreatedAtMs = () => 0,
    formatDashboardChatThreadLabel = () => "",
    markDashboardChatWidgetNotificationSeenForThread = () => {},
    formatUserName = () => "Staff",
    sendBrowserNotification = () => {},
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
  let dashboardChatScrollToLatestRequest = { threadId: "", requestedAt: 0 };
  const dashboardChatHydrationAttemptAtByThread = new Map();
  const dashboardChatHydrationRetryWindowMs = 10 * 1000;

  const runtimeDashboardChatAttachmentRenderer = dashboardChatAttachmentRenderer || { queueSignedUrls: () => {} };

  function readInputDraft(input = null) {
    if (!input) {
      return null;
    }
    return {
      value: input.value || "",
      wasFocused: Boolean(documentRef?.activeElement === input),
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    };
  }

  function restoreInputDraft(input = null, draft = null) {
    if (!input || !draft) {
      return;
    }
    input.value = draft.value || "";
    if (draft.wasFocused) {
      input.focus();
      if (draft.selectionStart !== null && draft.selectionEnd !== null) {
        input.setSelectionRange(draft.selectionStart, draft.selectionEnd);
      }
    }
  }

  function readDashboardChatDialogDrafts(root = null) {
    const groupForm = root?.querySelector("[data-dashboard-chat-group-create-form]");
    const directForm = root?.querySelector("[data-dashboard-chat-direct-create-form]");
    const settingsForm = root?.querySelector("[data-dashboard-chat-settings-form]");
    return {
      group: groupForm
        ? {
            title: readInputDraft(groupForm.querySelector("[data-dashboard-chat-group-name-input]")),
            avatar: readInputDraft(groupForm.querySelector("[data-dashboard-chat-group-avatar-input]")),
            filter: readInputDraft(groupForm.querySelector("[data-dashboard-chat-group-user-filter]")),
            participantIds: Array.from(groupForm.querySelectorAll("input[name='participantIds']:checked"))
              .map((input) => String(input.value || "").trim())
              .filter(Boolean),
          }
        : null,
      direct: directForm
        ? {
            filter: readInputDraft(directForm.querySelector("[data-dashboard-chat-direct-user-filter]")),
            participantId: String(directForm.querySelector("input[name='participantId']:checked")?.value || "").trim(),
          }
        : null,
      settings: settingsForm
        ? {
            type: String(settingsForm.dataset.dashboardChatSettingsType || "").trim(),
            threadId: String(settingsForm.dataset.dashboardChatThread || "").trim(),
            value: readInputDraft(settingsForm.querySelector("[data-dashboard-chat-settings-input]")),
          }
        : null,
    };
  }

  function applyDashboardChatUserFilter(form = null, selector = "", query = "") {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    form?.querySelectorAll(selector).forEach((row) => {
      const searchableText =
        row.dataset.dashboardChatGroupUserSearch ||
        row.dataset.dashboardChatDirectUserSearch ||
        row.textContent ||
        "";
      row.hidden = Boolean(normalizedQuery) && !searchableText.toLowerCase().includes(normalizedQuery);
    });
  }

  function refreshDashboardChatGroupCreateForm(form = null) {
    if (!form) {
      return;
    }
    const titleInput = form.querySelector("[data-dashboard-chat-group-name-input]");
    const selectedInputs = Array.from(form.querySelectorAll("input[name='participantIds']:checked"));
    const selectedCount = selectedInputs.length;
    const minLength = Number(titleInput?.getAttribute("minlength") || 2) || 2;
    const hasTitle = String(titleInput?.value || "").trim().replace(/\s+/g, " ").length >= minLength;
    const isReady = Boolean(hasTitle && selectedCount);
    const submitButton = form.querySelector("[data-dashboard-chat-group-create-submit]");
    const visibleCount = Array.from(form.querySelectorAll("[data-dashboard-chat-group-user-search]")).filter((row) => !row.hidden).length;
    const statusElement = form.querySelector("[data-dashboard-chat-group-filter-status]");
    const selectedList = form.querySelector("[data-dashboard-chat-group-selected-list]");
    form.querySelectorAll("[data-dashboard-chat-group-user-search]").forEach((row) => {
      const checkbox = row.querySelector("input[name='participantIds']");
      row.classList.toggle("is-selected", Boolean(checkbox?.checked));
    });
    if (submitButton) {
      submitButton.disabled = !isReady || form.dataset.busy === "true";
      submitButton.setAttribute("aria-disabled", submitButton.disabled ? "true" : "false");
      submitButton.title = isReady
        ? "Create group"
        : `${hasTitle ? "Choose at least one teammate" : `Add a group name with at least ${minLength} characters`}${!hasTitle && !selectedCount ? " and choose at least one teammate" : ""}`;
      if (form.dataset.busy !== "true") {
        submitButton.textContent = selectedCount ? `Create group (${selectedCount})` : "Create group";
      }
    }
    if (statusElement) {
      statusElement.textContent = `${visibleCount} teammate${visibleCount === 1 ? "" : "s"} visible - ${selectedCount} selected`;
    }
    if (selectedList) {
      const selectedNames = selectedInputs
        .map((input) => String(input.dataset.dashboardChatGroupParticipantName || input.value || "").trim())
        .filter(Boolean)
        .slice(0, 6);
      selectedList.hidden = !selectedNames.length;
      selectedList.textContent = selectedNames.join(", ");
    }
  }

  function refreshDashboardChatDirectCreateForm(form = null) {
    if (!form) {
      return;
    }
    const selectedInput = form.querySelector("input[name='participantId']:checked");
    const visibleCount = Array.from(form.querySelectorAll("[data-dashboard-chat-direct-user-search]")).filter((row) => !row.hidden).length;
    const submitButton = form.querySelector("[data-dashboard-chat-direct-create-submit]");
    const statusElement = form.querySelector("[data-dashboard-chat-direct-filter-status]");
    form.querySelectorAll("[data-dashboard-chat-direct-user-search]").forEach((row) => {
      const radio = row.querySelector("input[name='participantId']");
      row.classList.toggle("is-selected", Boolean(radio?.checked));
    });
    if (submitButton) {
      const selectedHasExistingThread = Boolean(selectedInput?.dataset.dashboardChatDirectExistingThread);
      submitButton.disabled = !selectedInput || form.dataset.busy === "true";
      submitButton.setAttribute("aria-disabled", submitButton.disabled ? "true" : "false");
      submitButton.title = selectedInput ? (selectedHasExistingThread ? "Open chat" : "Start chat") : "Choose a teammate";
    }
    if (statusElement) {
      statusElement.textContent = selectedInput
        ? `${visibleCount} teammate${visibleCount === 1 ? "" : "s"} visible - 1 selected`
        : `${visibleCount} teammate${visibleCount === 1 ? "" : "s"} available - start new or open existing`;
    }
  }

  function restoreDashboardChatDialogDrafts(root = null, drafts = {}) {
    const groupForm = root?.querySelector("[data-dashboard-chat-group-create-form]");
    if (groupForm && drafts.group) {
      restoreInputDraft(groupForm.querySelector("[data-dashboard-chat-group-name-input]"), drafts.group.title);
      restoreInputDraft(groupForm.querySelector("[data-dashboard-chat-group-avatar-input]"), drafts.group.avatar);
      restoreInputDraft(groupForm.querySelector("[data-dashboard-chat-group-user-filter]"), drafts.group.filter);
      const selectedIds = new Set(drafts.group.participantIds || []);
      groupForm.querySelectorAll("input[name='participantIds']").forEach((input) => {
        input.checked = selectedIds.has(String(input.value || "").trim());
      });
      applyDashboardChatUserFilter(groupForm, "[data-dashboard-chat-group-user-search]", drafts.group.filter?.value || "");
      refreshDashboardChatGroupCreateForm(groupForm);
    }

    const directForm = root?.querySelector("[data-dashboard-chat-direct-create-form]");
    if (directForm && drafts.direct) {
      restoreInputDraft(directForm.querySelector("[data-dashboard-chat-direct-user-filter]"), drafts.direct.filter);
      directForm.querySelectorAll("input[name='participantId']").forEach((input) => {
        input.checked = String(input.value || "").trim() === drafts.direct.participantId;
      });
      applyDashboardChatUserFilter(directForm, "[data-dashboard-chat-direct-user-search]", drafts.direct.filter?.value || "");
      refreshDashboardChatDirectCreateForm(directForm);
    }

    const settingsForm = root?.querySelector("[data-dashboard-chat-settings-form]");
    if (
      settingsForm &&
      drafts.settings &&
      String(settingsForm.dataset.dashboardChatSettingsType || "").trim() === drafts.settings.type &&
      String(settingsForm.dataset.dashboardChatThread || "").trim() === drafts.settings.threadId
    ) {
      restoreInputDraft(settingsForm.querySelector("[data-dashboard-chat-settings-input]"), drafts.settings.value);
    }
  }

  function getDashboardChatRenderSignature(html = "") {
    let hash = 0;
    for (let index = 0; index < html.length; index += 1) {
      hash = (hash * 31 + html.charCodeAt(index)) >>> 0;
    }
    return `${html.length}:${hash}`;
  }

  function isDashboardChatPreviewMessage(message = {}) {
    return Boolean(
      message?.previewOnly ||
        message?.metadata?.previewOnly ||
        String(message?.status || "").trim().toLowerCase() === "preview"
    );
  }

  function getDashboardChatExpectedMessageCount(thread = null) {
    return Math.max(
      0,
      Number(thread?.messageCount || 0) ||
        Number(thread?.message_count || 0) ||
        Number(thread?.apiThread?.messageCount || 0) ||
        Number(thread?.apiThread?.message_count || 0) ||
        0
    );
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
      const composer = ui.dashboardChatWidgetRoot?.querySelector("[data-dashboard-chat-input]");
      if (!composer?.focus) {
        return;
      }
      try {
        composer.focus({ preventScroll: true });
      } catch {
        composer.focus();
      }
    }, 0);
  }

  function focusDashboardChatElement(element) {
    if (!element?.focus) {
      return;
    }
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }

  function applyDashboardChatListScrollTop(chatList, scrollTop, threadId = "") {
    if (!chatList) {
      return;
    }
    const expectedThreadId = String(threadId || chatList.dataset?.dashboardChatActiveThread || "").trim();
    const apply = () => {
      if (expectedThreadId && String(chatList.dataset?.dashboardChatActiveThread || "").trim() !== expectedThreadId) {
        return;
      }
      const maxScrollTop = Math.max(0, (chatList.scrollHeight || 0) - (chatList.clientHeight || 0));
      const targetScrollTop = typeof scrollTop === "function" ? scrollTop(chatList, maxScrollTop) : scrollTop;
      const nextScrollTop = Math.min(Math.max(0, Number(targetScrollTop) || 0), maxScrollTop);
      if (typeof chatList.scrollTo === "function") {
        chatList.scrollTo({ top: nextScrollTop, behavior: "auto" });
      } else {
        chatList.scrollTop = nextScrollTop;
      }
    };
    apply();
    const raf = typeof win.requestAnimationFrame === "function"
      ? win.requestAnimationFrame.bind(win)
      : (callback) => win.setTimeout(callback, 0);
    raf(() => {
      apply();
      raf(apply);
    });
  }

  function scrollDashboardChatListToLatest(chatList, threadId = "") {
    if (!chatList) {
      return;
    }
    applyDashboardChatListScrollTop(chatList, (_chatList, maxScrollTop) => maxScrollTop, threadId);
  }

  function requestDashboardChatScrollToLatest(threadId = "") {
    dashboardChatScrollToLatestRequest = {
      threadId: normalizeDashboardChatThreadId(threadId || readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId),
      requestedAt: Date.now(),
    };
  }

  function clearDashboardChatScrollToLatestRequest(threadId = "") {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId || dashboardChatScrollToLatestRequest.threadId, dashboardChatTeamThreadId);
    if (!dashboardChatScrollToLatestRequest.threadId || dashboardChatScrollToLatestRequest.threadId !== normalizedThreadId) {
      return;
    }
    dashboardChatScrollToLatestRequest = { threadId: "", requestedAt: 0 };
  }

  function scrollDashboardChatActiveThreadToLatest(threadId = "") {
    const root = ui.dashboardChatWidgetRoot;
    const chatList = root?.querySelector("[data-dashboard-chat-list]");
    const targetThreadId = normalizeDashboardChatThreadId(threadId || chatList?.dataset?.dashboardChatActiveThread, dashboardChatTeamThreadId);
    if (!chatList || String(chatList.dataset?.dashboardChatActiveThread || "").trim() !== targetThreadId) {
      requestDashboardChatScrollToLatest(targetThreadId);
      return false;
    }
    scrollDashboardChatListToLatest(chatList, targetThreadId);
    clearDashboardChatScrollToLatestRequest(targetThreadId);
    return true;
  }

  function scrollDashboardChatFirstUnread(options = {}) {
    const root = ui.dashboardChatWidgetRoot;
    const target =
      root?.querySelector("[data-dashboard-chat-first-unread]") ||
      root?.querySelector("[data-dashboard-chat-first-unread-message='true']");
    if (!target?.scrollIntoView) {
      return false;
    }
    target.scrollIntoView({
      block: options.block || "center",
      inline: "nearest",
      behavior: options.behavior || "smooth",
    });
    return true;
  }

  function getDashboardChatFirstUnreadMessageId(messages = [], threadId = "", currentUser = null) {
    const currentUserId = String(currentUser?.id || "").trim();
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    if (!currentUserId || !normalizedThreadId) {
      return "";
    }
    return String(
      (Array.isArray(messages) ? messages : []).find((message) => {
        const messageThreadId = normalizeDashboardChatThreadId(message?.threadId, "");
        const messageUserId = String(message?.userId || "").trim();
        const status = String(message?.status || "sent").trim().toLowerCase();
        if (
          !message?.id ||
          messageThreadId !== normalizedThreadId ||
          messageUserId === currentUserId ||
          message?.isDeleted ||
          ["deleted", "failed", "pending", "preview"].includes(status)
        ) {
          return false;
        }
        const readBy = Array.isArray(message.readBy) ? message.readBy.map((userId) => String(userId || "")) : [];
        return !readBy.includes(currentUserId);
      })?.id || ""
    );
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
    if (!syncTimer && Date.now() - lastRequestedAt > 30000) {
      queueDashboardChatThreadSummaryRefresh({
        delayMs: 50,
        render: true,
        forceNetwork: !state.isOpen,
      });
    }

    const users = getPlatformUsers().filter((user) => user.status === "active");
    const notificationState = readDashboardChatWidgetNotificationState();
    const pushDiagnostics = getDashboardChatPushDiagnosticsState();
    const apiStatus = getDashboardChatApiStatus();

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
    const previousWidgetWasOpen = Boolean(root.querySelector(".dashboard-chat-widget.is-open"));
    const previousActiveChatThreadId = String(existingChatList?.dataset?.dashboardChatActiveThread || previousComposerThreadId || "");
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
    const firstUnreadMessageId = getDashboardChatFirstUnreadMessageId(messages, activeThreadId, currentUser);

    const hydratedThreadIds = getDashboardHydratedThreadIds();
    const activeThread = threads.find((thread) => thread.threadId === activeThreadId) || null;
    const activeThreadMessages = resolvedMessages.filter((message) => message.threadId === activeThreadId);
    const activeThreadRealMessageCount = activeThreadMessages.filter((message) => !isDashboardChatPreviewMessage(message)).length;
    const activeThreadExpectedMessageCount = getDashboardChatExpectedMessageCount(activeThread);
    const activeThreadHasPartialHistory = Boolean(
      activeThreadExpectedMessageCount &&
        activeThreadRealMessageCount < activeThreadExpectedMessageCount
    );
    const activeThreadHasServerActivity = Boolean(
      activeThread &&
        (
          Number(activeThread.messageCount || 0) > 0 ||
          activeThread.lastMessage ||
          activeThread.lastActivityAt ||
          activeThread.apiThread?.lastMessage ||
          activeThread.apiThread?.last_message ||
          activeThread.apiThread?.lastMessageAt ||
          activeThread.apiThread?.last_message_at
        )
    );
    const activeThreadNeedsHydration = Boolean(
      activeThreadId &&
        hydratedThreadIds instanceof Set &&
        (
          !hydratedThreadIds.has(activeThreadId) ||
          (activeThreadHasServerActivity && activeThreadRealMessageCount === 0) ||
          activeThreadHasPartialHistory
        )
    );
    if (activeThreadId && activeThreadRealMessageCount > 0 && !activeThreadHasPartialHistory) {
      dashboardChatHydrationAttemptAtByThread.delete(activeThreadId);
    }
    const lastHydrationAttemptAt = Number(dashboardChatHydrationAttemptAtByThread.get(activeThreadId) || 0);
    const canQueueActiveThreadHydration =
      !lastHydrationAttemptAt || Date.now() - lastHydrationAttemptAt >= dashboardChatHydrationRetryWindowMs;
    const widgetAppearsOpen = Boolean(
      state.isOpen ||
        root.querySelector(".dashboard-chat-widget.is-open") ||
        root.querySelector("[data-dashboard-chat-form]")
    );
    if (
      widgetAppearsOpen &&
      activeThreadId &&
      activeThreadNeedsHydration &&
      canQueueActiveThreadHydration
    ) {
      dashboardChatHydrationAttemptAtByThread.set(activeThreadId, Date.now());
      queueDashboardChatApiRefresh({
        threadId: activeThreadId,
        delayMs: 0,
        immediate: true,
        forceNetwork: true,
      });
    }

    const localUnreadCount = getDashboardChatUnreadCountForCurrentUser(currentUser, resolvedMessages);
    const apiUnreadCount = threads.reduce((total, thread) => total + (Number(thread?.unreadCount || 0) || 0), 0);
    const unreadCount = Math.max(localUnreadCount, apiUnreadCount);
    const apiPagination = getDashboardApiPagination?.() || {};
    const renderedWidget = dashboardChatWidgetRenderer.render({
      currentUser,
      users,
      notificationState,
      pushDiagnostics,
      apiStatus,
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
      chatCreatorMode: getDashboardChatCreatorMode(),
      threadFilter: getDashboardChatThreadFilter(),
      threadSettingsDialog: getDashboardChatThreadSettingsDialog(),
      firstUnreadMessageId,
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
    const previousDialogDrafts = readDashboardChatDialogDrafts(root);

    root.innerHTML = renderedWidget.html;
    root.dataset.dashboardChatRenderSignature = renderSignature;
    restoreDashboardChatDialogDrafts(root, previousDialogDrafts);
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
        focusDashboardChatElement(nextMessageSearchInput);
        if (previousMessageSearchSelectionStart !== null && previousMessageSearchSelectionEnd !== null) {
          nextMessageSearchInput.setSelectionRange(previousMessageSearchSelectionStart, previousMessageSearchSelectionEnd);
        }
      }
    }

    const nextChatList = root.querySelector("[data-dashboard-chat-list]");
    const activeSearchMatchElement = root.querySelector("[data-dashboard-chat-search-active='true']");
    const previousChatListThreadMatches = previousActiveChatThreadId === renderedWidget.activeThreadId;
    const shouldForceLatestScroll = Boolean(
      dashboardChatScrollToLatestRequest.threadId &&
        dashboardChatScrollToLatestRequest.threadId === renderedWidget.activeThreadId &&
        Date.now() - Number(dashboardChatScrollToLatestRequest.requestedAt || 0) < 1800
    );
    if (activeSearchMatchElement) {
      activeSearchMatchElement.scrollIntoView({ block: "center", inline: "nearest" });
    } else if (nextChatList && shouldForceLatestScroll) {
      scrollDashboardChatListToLatest(nextChatList, renderedWidget.activeThreadId);
      clearDashboardChatScrollToLatestRequest(renderedWidget.activeThreadId);
    } else if (nextChatList && previousChatListScrollTop !== null && previousChatListThreadMatches) {
      const nextMaxScrollTop = Math.max(0, nextChatList.scrollHeight - nextChatList.clientHeight);
      const nextScrollTop = preserveChatScroll
        ? previousChatListScrollTop + Math.max(0, nextChatList.scrollHeight - previousChatListScrollHeight)
        : previousChatListScrollTop;
      if (previousChatListWasAtBottom) {
        scrollDashboardChatListToLatest(nextChatList, renderedWidget.activeThreadId);
      } else {
        applyDashboardChatListScrollTop(nextChatList, Math.min(Math.max(0, nextScrollTop), nextMaxScrollTop), renderedWidget.activeThreadId);
      }
    } else if (nextChatList && state.isOpen && (!previousWidgetWasOpen || !previousChatListThreadMatches)) {
      scrollDashboardChatListToLatest(nextChatList, renderedWidget.activeThreadId);
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
          focusDashboardChatElement(nextComposer);
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
    sendBrowserNotification({
      title: mentionedCurrentUser ? `${senderName} mentioned you` : `New message from ${senderName}`,
      body: threadName,
      threadId: latestVisibleMessage.threadId,
      messageId: latestVisibleMessage.id,
    });
    writeDashboardChatWidgetNotificationCursorForMessage(latestVisibleMessage);
    markDashboardChatWidgetNotificationSeenForThread?.(latestVisibleMessage.threadId);
  }

  return {
    renderDashboardChatWidget,
    syncDashboardChatWidgetNotificationCursor,
    showDashboardChatWidgetToast,
    hideDashboardChatWidgetToast,
    focusDashboardChatWidgetComposer,
    scrollDashboardChatFirstUnread,
    requestDashboardChatScrollToLatest,
    scrollDashboardChatActiveThreadToLatest,
  };
}
