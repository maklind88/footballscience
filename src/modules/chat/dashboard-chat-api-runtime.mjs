export function createDashboardChatApiRuntime(dependencies = {}) {
  const {
    dashboardChatTeamThreadId = "team",
    normalizeDashboardChatThreadId = (threadId, fallbackThreadId) => {
      const normalized = String(threadId || "").trim();
      const fallback = String(fallbackThreadId || dashboardChatTeamThreadId).trim() || dashboardChatTeamThreadId;
      return normalized || fallback;
    },
    dashboardChatApiPageLimit = 40,
    dashboardChatModerationDefaultFilters = { action: "all", userId: "", threadId: "", from: "", to: "" },
    createDashboardId = (prefix = "") => `dashboard-chat-${Date.now()}-${String(Math.random()).slice(2, 10)}`,
    canFallbackDashboardChatApiResult = () => false,
    canPinDashboardChatMessage = () => false,
    fetchDashboardChatApi = async () => ({ ok: false, status: 0, reason: "fetchDashboardChatApi missing" }),
    formatDashboardTime = () => "",
    getCurrentPlatformUser = () => null,
    getDashboardApiFilters = () => ({
      action: "all",
      userId: "",
      threadId: "",
      from: "",
      to: "",
    }),
    getDashboardApiPagination = () => ({}),
    setDashboardApiPagination = () => {},
    getDashboardApiScope = () => null,
    setDashboardApiScope = () => {},
    getDashboardApiThreads = () => [],
    setDashboardApiThreads = () => {},
    getDashboardHydratedThreadIds = () => new Set(),
    setDashboardHydratedThreadIds = () => {},
    getDashboardChatCurrentViewState = () => ({ isOpen: false, selectedThreadId: dashboardChatTeamThreadId }),
    getDashboardChatThreadTypeForApi = () => "team",
    getDashboardMentionUserIds = () => [],
    getDashboardMessageIdentity = () => [],
    getDashboardMessageById = () => null,
    getDashboardMentionedThreads = () => [],
    getDashboardMentionUsers = () => [],
    getDashboardMessageReadReceipts = () => [],
    getDashboardMessageCreatedAtMs = () => 0,
    getDashboardMentionUserIdsForText = () => [],
    getDashboardMessageSearchQuery = () => "",
    getDashboardAttachmentDraft = () => null,
    getDashboardChatComposerAttachmentDraft = () => null,
    getDashboardChatThreadSettings = () => ({
      merge: () => ({}),
      write: () => {},
    }),
    getDashboardChatThreadSummary = () => [],
    getDashboardMessageDraft = () => "",
    getDashboardChatHydrationBuffer = () => ({
      markThreadMessageCount: () => {},
    }),
    getDashboardChatMessageSearchActiveIndex = () => 0,
    getDashboardChatAttachmentRenderer = () => ({}),
    getDashboardChatApiThreadSummarySyncLastRequestedAt = () => 0,
    setDashboardChatApiThreadSummarySyncLastRequestedAt = () => {},
    getDashboardChatApiThreadSummarySyncTimer = () => 0,
    setDashboardChatApiThreadSummarySyncTimer = () => {},
    getDashboardChatApiSyncTimer = () => 0,
    setDashboardChatApiSyncTimer = () => {},
    getDashboardChatRealtimeSignature = () => "",
    setDashboardChatRealtimeSignature = () => {},
    getDashboardChatRealtimeChannel = () => null,
    setDashboardChatRealtimeChannel = () => {},
    getDashboardChatRealtimeStatus = () => "idle",
    setDashboardChatRealtimeStatus = () => {},
    getDashboardChatRealtimeLastEventAt = () => 0,
    setDashboardChatRealtimeLastEventAt = () => {},
    getDashboardChatRealtimeRecoveryTimer = () => 0,
    setDashboardChatRealtimeRecoveryTimer = () => {},
    getDashboardChatModerationState = () => ({ loading: false, audits: [], failedUploads: [], retentionPolicy: null, health: null, filters: dashboardChatModerationDefaultFilters, error: "" }),
    setDashboardChatModerationState = () => {},
    getDashboardChatRuntimeState = () => ({
      threads: getDashboardApiThreads(),
      scope: getDashboardApiScope(),
      pagination: getDashboardApiPagination(),
    }),
    setDashboardChatRuntimeState = () => {},
    getDashboardMentionIds = () => [],
    getDashboardChatApiThreadsById = () => null,
    getDashboardMessages = () => [],
    setDashboardMessages = () => {},
    getDashboardChatHydratedThreads = () => new Set(),
    setDashboardChatHydratedThreads = () => {},
    getDashboardAttachmentStorageRef = () => null,
    getPlatformAuthStore = () => null,
    getCurrentAuthStore = () => null,
    getIsCurrentPlatformUserAdmin = () => false,
    getPlatformUsers = () => [],
    getDashboardMessage = () => null,
    getDashboardMessageBySearch = () => null,
    getDashboardMessageByReply = () => null,
    removeDashboardMessage = () => {},
    syncDashboardChatWidgetNotificationCursor = () => {},
    renderDashboardChatWidget = () => {},
    platformNavigationController = {},
    normalizeDashboardApiThread = (thread = {}) => thread,
    mergeDashboardChatApiMessages = () => [],
    normalizeDashboardApiMessage = (message = {}, thread = null) => message,
    logDashboardChatApiFailure = () => {},
    dashboardChatSubmittedComposerDrafts = new Map(),
    getDashboardMessageReactions = () => ({}),
    getDashboardChatThreadLabel = () => "",
    getDashboardChatThreadParticipants = () => [],
    getDashboardMentionTokenIds = () => [],
    getCurrentPlatformUserFromRuntime = getCurrentPlatformUser,
    getDashboardChatMessageSearchQuery = () => "",
    getDashboardChatPriority = () => "normal",
    dashboardChatReactionOptions = [],
    documentRef = typeof document !== "undefined" ? document : null,
    win = typeof globalThis !== "undefined" ? globalThis : {},
  } = dependencies;

  const DASHBOARD_CHAT_API_REFRESH_MIN_INTERVAL_MS = 8000;
  const DASHBOARD_CHAT_THREAD_SUMMARY_REFRESH_MIN_INTERVAL_MS = 15000;
  let dashboardChatApiLastRequestedAt = 0;

  function normalizeRefreshDelay(value = 0) {
    const delayMs = Number(value) || 0;
    return Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
  }

  function refreshDelayWithBudget(requestedDelayMs, lastRequestedAt, minIntervalMs) {
    const elapsedMs = Date.now() - Number(lastRequestedAt || 0);
    const budgetDelayMs = Math.max(0, Number(minIntervalMs || 0) - elapsedMs);
    return Math.max(normalizeRefreshDelay(requestedDelayMs), budgetDelayMs);
  }

  function canRunDashboardChatNetworkRefresh(options = {}) {
    if (options.forceNetwork) {
      return true;
    }
    return !documentRef || documentRef.visibilityState === "visible";
  }

  function createDashboardChatHiddenTabResult() {
    return {
      ok: false,
      status: 0,
      skipped: true,
      reason: "Chat refresh is paused while this tab is hidden.",
    };
  }

  function createDashboardChatClosedResult() {
    return {
      ok: false,
      status: 0,
      skipped: true,
      reason: "Chat refresh is paused until the chat panel is opened.",
    };
  }

  function getApiScope() {
    return getDashboardApiScope();
  }

  function setApiScope(nextScope) {
    return setDashboardApiScope(nextScope);
  }

  function getApiThreads() {
    return Array.isArray(getDashboardApiThreads()) ? getDashboardApiThreads() : [];
  }

  function setApiThreads(nextThreads = []) {
    setDashboardApiThreads(Array.isArray(nextThreads) ? nextThreads : []);
  }

  function getPagination() {
    const source = getDashboardApiPagination();
    return source && typeof source === "object" && !Array.isArray(source) ? source : {};
  }

  function setPagination(nextPagination = {}) {
    setDashboardApiPagination(nextPagination && typeof nextPagination === "object" && !Array.isArray(nextPagination) ? nextPagination : {});
  }

  function getOldestPayloadMessageCursor(messages = []) {
    let oldestCursor = "";
    let oldestMs = Number.POSITIVE_INFINITY;
    (Array.isArray(messages) ? messages : []).forEach((message) => {
      const cursor = String(message?.createdAt || message?.created_at || "").trim();
      if (!cursor) {
        return;
      }
      const cursorMs = Date.parse(cursor);
      if (Number.isFinite(cursorMs) && cursorMs < oldestMs) {
        oldestMs = cursorMs;
        oldestCursor = cursor;
      } else if (!oldestCursor) {
        oldestCursor = cursor;
      }
    });
    return oldestCursor;
  }

  function getThreadSummarySyncTimer() {
    const value = Number(getDashboardChatApiThreadSummarySyncTimer?.() || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setThreadSummarySyncTimer(value = 0) {
    setDashboardChatApiThreadSummarySyncTimer(Number(value) || 0);
  }

  function getThreadSummaryLastRequestedAt() {
    const value = Number(getDashboardChatApiThreadSummarySyncLastRequestedAt?.() || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setThreadSummaryLastRequestedAt(value = 0) {
    const nextValue = Number(value) || 0;
    setDashboardChatApiThreadSummarySyncLastRequestedAt(nextValue);
  }

  function getApiSyncTimer() {
    const value = Number(getDashboardChatApiSyncTimer?.() || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setApiSyncTimer(value = 0) {
    setDashboardChatApiSyncTimer(Number(value) || 0);
  }

  function getRealtimeSignature() {
    return String(getDashboardChatRealtimeSignature?.() || "");
  }

  function setRealtimeSignature(nextSignature) {
    setDashboardChatRealtimeSignature(String(nextSignature || ""));
  }

  function getRealtimeChannel() {
    return getDashboardChatRealtimeChannel?.() || null;
  }

  function setRealtimeChannel(nextChannel) {
    setDashboardChatRealtimeChannel(nextChannel || null);
  }

  function getRealtimeStatus() {
    return String(getDashboardChatRealtimeStatus?.() || "idle");
  }

  function setRealtimeStatus(nextStatus) {
    setDashboardChatRealtimeStatus(String(nextStatus || "idle"));
  }

  function getRealtimeLastEventAt() {
    const value = Number(getDashboardChatRealtimeLastEventAt?.() || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setRealtimeLastEventAt(value = 0) {
    const nextValue = Number(value) || 0;
    setDashboardChatRealtimeLastEventAt(nextValue);
  }

  function getRealtimeRecoveryTimer() {
    const value = Number(getDashboardChatRealtimeRecoveryTimer?.() || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setRealtimeRecoveryTimer(value = 0) {
    setDashboardChatRealtimeRecoveryTimer(Number(value) || 0);
  }

  function getHydratedThreadIds() {
    const hydrated = getDashboardHydratedThreadIds?.();
    return hydrated instanceof Set ? hydrated : new Set();
  }

  function setHydratedThreadIds(nextValue = new Set()) {
    if (nextValue instanceof Set) {
      setDashboardHydratedThreadIds(nextValue);
      return;
    }
    const nextSet = new Set(Array.isArray(nextValue) ? nextValue : []);
    setDashboardHydratedThreadIds(nextSet);
  }

  function markThreadHydrated(threadId = "") {
    const hydrated = getHydratedThreadIds();
    const nextSet = new Set(hydrated);
    nextSet.add(normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId));
    setHydratedThreadIds(nextSet);
  }

  function unmarkThreadHydrated(threadId = "") {
    const hydrated = getHydratedThreadIds();
    const nextSet = new Set(hydrated);
    nextSet.delete(normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId));
    setHydratedThreadIds(nextSet);
  }

  function getModerationState() {
    const fallback = { loading: false, audits: [], failedUploads: [], retentionPolicy: null, health: null, filters: dashboardChatModerationDefaultFilters, error: "" };
    const state = getDashboardChatModerationState?.() || {};
    return { ...fallback, ...state };
  }

  function setModerationState(nextState) {
    setDashboardChatModerationState?.({ ...nextState });
  }

  function getDashboardChatLegacyStatePayload(payload = {}) {
    const state = payload?.state;
    return state && typeof state === "object" && !Array.isArray(state) ? state : null;
  }

  function isDashboardChatLegacyStatePayload(payload = {}) {
    const state = getDashboardChatLegacyStatePayload(payload);
    return Boolean(state && (Array.isArray(state.messages) || Array.isArray(state.threads)));
  }

  function getDashboardChatPayloadThreads(payload = {}) {
    if (Array.isArray(payload?.threads)) {
      return payload.threads;
    }
    const legacyState = getDashboardChatLegacyStatePayload(payload);
    return Array.isArray(legacyState?.threads) ? legacyState.threads : [];
  }

  function getDashboardChatSourceThreadId(thread = {}) {
    const type = String(thread?.type || "").trim().toLowerCase();
    return normalizeDashboardChatThreadId(
      thread?.threadId ||
        thread?.thread_id ||
        thread?.legacyThreadId ||
        thread?.legacy_thread_id ||
        thread?.metadata?.legacyThreadId ||
        thread?.metadata?.legacy_thread_id ||
        (type === "team" ? dashboardChatTeamThreadId : thread?.id),
      dashboardChatTeamThreadId
    );
  }

  function getDashboardChatPayloadThread(payload = {}, options = {}) {
    if (payload?.thread) {
      return payload.thread;
    }
    const normalizedThreadId = normalizeDashboardChatThreadId(options.threadId || "", "");
    if (!normalizedThreadId) {
      return null;
    }
    return getDashboardChatPayloadThreads(payload).find((thread) => getDashboardChatSourceThreadId(thread) === normalizedThreadId) || null;
  }

  function getDashboardChatSourceMessageThreadId(message = {}, payloadThread = null) {
    return normalizeDashboardChatThreadId(
      message?.threadId ||
        message?.thread_id ||
        message?.legacyThreadId ||
        message?.legacy_thread_id ||
        message?.metadata?.legacyThreadId ||
        message?.metadata?.legacy_thread_id ||
        getDashboardChatSourceThreadId(payloadThread || {}),
      dashboardChatTeamThreadId
    );
  }

  function getDashboardChatPayloadMessages(payload = {}, options = {}) {
    const legacyState = getDashboardChatLegacyStatePayload(payload);
    const sourceMessages = Array.isArray(payload?.messages)
      ? payload.messages
      : Array.isArray(legacyState?.messages)
        ? legacyState.messages
        : [];
    if (!isDashboardChatLegacyStatePayload(payload) || !options.threadId || options.search) {
      return sourceMessages;
    }

    const normalizedThreadId = normalizeDashboardChatThreadId(options.threadId, dashboardChatTeamThreadId);
    const payloadThread = getDashboardChatPayloadThread(payload, options);
    return sourceMessages.filter((message) => getDashboardChatSourceMessageThreadId(message, payloadThread) === normalizedThreadId);
  }

  function isArchivedApiThread(thread = {}) {
    return Boolean(thread?.archivedAt || thread?.archived_at || thread?.metadata?.archivedAt || thread?.metadata?.archived_at);
  }

  function updateDashboardChatApiThreads(threads = [], options = {}) {
    if (!Array.isArray(threads)) {
      return;
    }

    const existingThreads = getApiThreads().filter((thread) => thread?.threadId && !isArchivedApiThread(thread));
    const normalizedThreads = threads.map(normalizeDashboardApiThread).filter((thread) => thread?.threadId);
    const selectedThreadId = normalizeDashboardChatThreadId(getDashboardChatCurrentViewState?.().selectedThreadId || "", "");
    const shouldPreserveSelectedGroup = Boolean(
      options.replace &&
        selectedThreadId &&
        (selectedThreadId.startsWith("group-") || selectedThreadId.startsWith("group:")) &&
        existingThreads.some((thread) => thread.threadId === selectedThreadId) &&
        !normalizedThreads.some((thread) => thread.threadId === selectedThreadId)
    );
    const preservedSelectedGroup = shouldPreserveSelectedGroup
      ? existingThreads.find((thread) => thread.threadId === selectedThreadId)
      : null;
    const existingById = new Map(existingThreads.map((thread) => [thread.threadId, thread]));
    const byId = new Map(
      (options.replace ? [preservedSelectedGroup].filter(Boolean) : existingThreads).map((thread) => [thread.threadId, thread])
    );
    normalizedThreads.forEach((thread) => {
      if (isArchivedApiThread(thread)) {
        byId.delete(thread.threadId);
      } else {
        const existingThread = existingById.get(thread.threadId) || null;
        if (!existingThread) {
          byId.set(thread.threadId, thread);
          return;
        }

        const sameLastMessage = Boolean(
          (thread.lastMessageId && existingThread.lastMessageId && thread.lastMessageId === existingThread.lastMessageId) ||
            (thread.lastMessageAt && existingThread.lastMessageAt && thread.lastMessageAt === existingThread.lastMessageAt)
        );
        const keepVerifiedMessageCount = Boolean(
          existingThread.historyComplete &&
            !thread.historyComplete &&
            sameLastMessage &&
            Number(existingThread.messageCount || 0) < Number(thread.messageCount || 0)
        );
        const nextThread = {
          ...existingThread,
          ...thread,
          createdAt: thread.createdAt || existingThread.createdAt || "",
          lastMessageAt: thread.lastMessageAt || existingThread.lastMessageAt || "",
          lastReadAt: thread.lastReadAt || existingThread.lastReadAt || "",
          participants: Array.isArray(thread.participants) && thread.participants.length
            ? thread.participants
            : existingThread.participants || [],
          permissions: Object.keys(thread.permissions || {}).length
            ? thread.permissions
            : existingThread.permissions || {},
          settings: Object.keys(thread.settings || {}).length ? thread.settings : existingThread.settings || {},
          historyComplete: Boolean(thread.historyComplete || (existingThread.historyComplete && sameLastMessage)),
        };
        if (keepVerifiedMessageCount) {
          nextThread.messageCount = existingThread.messageCount;
        }
        byId.set(thread.threadId, nextThread);
      }
    });
    setApiThreads(Array.from(byId.values()).filter((thread) => !isArchivedApiThread(thread)));
  }

  function mergeActiveThreadLastMessageFromSummary(threads = []) {
    if (!Array.isArray(threads) || !threads.length) {
      return;
    }

    const activeThreadId = normalizeDashboardChatThreadId(
      getDashboardChatCurrentViewState?.().selectedThreadId || "",
      ""
    );
    if (!activeThreadId) {
      return;
    }

    const hasLocalActiveMessages = getDashboardMessages()
      .some((message) => normalizeDashboardChatThreadId(message?.threadId || "", "") === activeThreadId);
    if (hasLocalActiveMessages) {
      return;
    }

    const activeSummary = threads.find((thread) => normalizeDashboardApiThread(thread)?.threadId === activeThreadId) || null;
    const lastMessage = activeSummary?.lastMessage || activeSummary?.last_message || null;
    const hasServerActivity = Boolean(
      lastMessage ||
        Number(activeSummary?.messageCount || activeSummary?.message_count || 0) > 0 ||
        activeSummary?.lastMessageAt ||
        activeSummary?.last_message_at ||
        activeSummary?.lastMessageId ||
        activeSummary?.last_message_id
    );
    if (!lastMessage || !hasServerActivity) {
      return;
    }

    mergeDashboardChatApiMessages([lastMessage], {
      render: false,
      thread: activeSummary,
      keepThread: true,
    });
  }

  function applyDashboardChatApiPayload(payload = {}, options = {}) {
    if (payload.scope) {
      setApiScope(payload.scope);
      setupDashboardChatRealtime();
    }

    if (payload.health) {
      const moderationState = getModerationState();
      setModerationState({
        ...moderationState,
        health: payload.health,
        audits: Array.isArray(payload.audits) ? payload.audits : moderationState.audits,
      });
    }

    const payloadThreads = getDashboardChatPayloadThreads(payload);
    if (payloadThreads.length) {
      updateDashboardChatApiThreads(payloadThreads, { replace: Boolean(options.replaceThreadList) });
      mergeActiveThreadLastMessageFromSummary(payloadThreads);
    } else if (payload.thread) {
      updateDashboardChatApiThreads([payload.thread]);
    }

    if (payload.nextCursor !== undefined || options.nextCursorFallback !== undefined) {
      const cursorValue = payload.nextCursor !== undefined ? payload.nextCursor : options.nextCursorFallback;
      const threadId = normalizeDashboardChatThreadId(
        options.threadId || payload.thread?.threadId || payload.thread?.legacyThreadId || payload.thread?.metadata?.legacyThreadId || dashboardChatTeamThreadId,
        dashboardChatTeamThreadId
      );
      const nextPagination = {
        ...getPagination(),
        [threadId]: String(cursorValue || ""),
      };
      setPagination(nextPagination);
    }

    const payloadThread = getDashboardChatPayloadThread(payload, options);
    const payloadMessages = getDashboardChatPayloadMessages(payload, options);

    if (Array.isArray(payload.messages) || isDashboardChatLegacyStatePayload(payload)) {
      mergeDashboardChatApiMessages(payloadMessages, {
        render: false,
        thread: payloadThread,
        keepThread: Boolean(payload.nextCursor || options.keepThread),
        replaceThreadId: options.replaceThread
          ? options.threadId || payloadThread?.threadId || payloadThread?.legacyThreadId || payloadThread?.metadata?.legacyThreadId
          : "",
      });
    }

    if (payload.message) {
      mergeDashboardChatApiMessages([payload.message], {
        render: false,
        thread: payloadThread,
      });
    } else if (!payloadMessages.length && (payloadThread?.lastMessage || payloadThread?.last_message)) {
      mergeDashboardChatApiMessages([payloadThread.lastMessage || payloadThread.last_message], {
        render: false,
        thread: payloadThread,
        keepThread: true,
      });
    }
  }

  async function refreshDashboardChatThreadSummariesFromApi(options = {}) {
    if (!canRunDashboardChatNetworkRefresh(options)) {
      return createDashboardChatHiddenTabResult();
    }
    if (!options.forceNetwork && !getDashboardChatCurrentViewState()?.isOpen) {
      return createDashboardChatClosedResult();
    }
    const result = await fetchDashboardChatApi({ view: "threads", limit: options.limit || 80, __activeChatRead: true });
    if (!result.ok) {
      if (!canFallbackDashboardChatApiResult(result)) {
        logDashboardChatApiFailure("threads", result);
      }
      return result;
    }

    applyDashboardChatApiPayload(result.result || {}, { replaceThreadList: true });
    syncDashboardChatWidgetNotificationCursor();
    if (options.render !== false) {
      renderDashboardChatWidget();
    }
    return result;
  }

  function queueDashboardChatThreadSummaryRefresh(options = {}) {
    if (!options.forceNetwork && !getDashboardChatCurrentViewState()?.isOpen) {
      return;
    }

    if (getThreadSummarySyncTimer()) {
      win.clearTimeout(getThreadSummarySyncTimer());
    }

    const delayMs = refreshDelayWithBudget(
      options.delayMs ?? 200,
      getThreadSummaryLastRequestedAt(),
      DASHBOARD_CHAT_THREAD_SUMMARY_REFRESH_MIN_INTERVAL_MS
    );
    setThreadSummarySyncTimer(
      win.setTimeout(() => {
        setThreadSummarySyncTimer(0);
        if (!canRunDashboardChatNetworkRefresh(options)) {
          void refreshDashboardChatThreadSummariesFromApi(options);
          return;
        }
        setThreadSummaryLastRequestedAt(Date.now());
        void refreshDashboardChatThreadSummariesFromApi(options);
      }, delayMs)
    );
  }

  function queueDashboardChatCurrentViewRefresh(options = {}) {
    const state = getDashboardChatCurrentViewState();
    if (!options.forceNetwork && !state.isOpen) {
      return;
    }

    queueDashboardChatThreadSummaryRefresh({ delayMs: Number(options.delayMs ?? 120), render: false, forceNetwork: options.forceNetwork });

    if (state.isOpen) {
      queueDashboardChatApiRefresh({
        threadId: state.selectedThreadId,
        delayMs: Number(options.delayMs ?? 120) + 40,
        forceNetwork: options.forceNetwork,
      });
    }
  }

  async function refreshDashboardChatFromApi(options = {}) {
    if (!canRunDashboardChatNetworkRefresh(options)) {
      return createDashboardChatHiddenTabResult();
    }
    if (!options.forceNetwork && !getDashboardChatCurrentViewState()?.isOpen) {
      return createDashboardChatClosedResult();
    }
    const threadId = normalizeDashboardChatThreadId(
      options.threadId || getDashboardChatCurrentViewState().selectedThreadId,
      dashboardChatTeamThreadId
    );

    const query = {
      threadId,
      threadType: getDashboardChatThreadTypeForApi(threadId),
      limit: options.limit || dashboardChatApiPageLimit,
      __activeChatRead: true,
      ...(options.forceNetwork ? { __forceNetwork: true } : {}),
    };

    if (options.cursor) {
      query.cursor = options.cursor;
    }

    if (options.search) {
      query.search = options.search;
      delete query.threadId;
    }

    const result = await fetchDashboardChatApi(query);
    if (!result.ok) {
      unmarkThreadHydrated(threadId);
      if (!canFallbackDashboardChatApiResult(result)) {
        logDashboardChatApiFailure("load", result);
      }
      return result;
    }

    const payload = result.result || {};
    const payloadMessages = getDashboardChatPayloadMessages(payload, { threadId, search: options.search });
    const payloadThread = getDashboardChatPayloadThread(payload, { threadId });
    const payloadThreadMessageCount = Number(payloadThread?.messageCount || payloadThread?.message_count || 0) || 0;
    const requestedMessageLimit = Math.max(1, Number(options.limit || dashboardChatApiPageLimit) || dashboardChatApiPageLimit);
    const expectedInitialPayloadCount = payloadThreadMessageCount
      ? Math.min(payloadThreadMessageCount, requestedMessageLimit)
      : 0;
    const payloadHasIncompleteInitialHistory = Boolean(
      !options.cursor &&
        !options.search &&
        payloadMessages.length &&
        expectedInitialPayloadCount &&
        payloadMessages.length < expectedInitialPayloadCount
    );
    const recoveryCursor = payloadHasIncompleteInitialHistory
      ? String(payload.nextCursor || getOldestPayloadMessageCursor(payloadMessages) || "").trim()
      : "";
    const payloadHasCompleteInitialHistory = Boolean(
      payloadMessages.length &&
        (!expectedInitialPayloadCount || payloadMessages.length >= expectedInitialPayloadCount)
    );
    const payloadThreadHasServerActivity = Boolean(
      payloadThread &&
        (
          payloadThreadMessageCount > 0 ||
          payloadThread.lastMessage ||
          payloadThread.last_message ||
          payloadThread.lastMessageId ||
          payloadThread.last_message_id ||
          payloadThread.lastMessageAt ||
          payloadThread.last_message_at
        )
    );

    applyDashboardChatApiPayload(payload, {
      threadId,
      replaceThread: !options.cursor && !options.search,
      keepThread: payloadHasIncompleteInitialHistory,
      nextCursorFallback: payloadHasIncompleteInitialHistory && payload.nextCursor === undefined ? recoveryCursor : undefined,
    });

    if (payloadHasCompleteInitialHistory || !payloadThreadHasServerActivity || options.cursor || options.search) {
      markThreadHydrated(threadId);
    } else {
      unmarkThreadHydrated(threadId);
    }
    renderDashboardChatWidget();
    if (recoveryCursor && options.autoLoadOlder !== false) {
      const recoveryResult = await refreshDashboardChatFromApi({
        threadId,
        cursor: recoveryCursor,
        forceNetwork: options.forceNetwork,
        autoLoadOlder: false,
      });
      return {
        ...result,
        recoveredOlderHistory: Boolean(recoveryResult?.ok),
        olderResult: recoveryResult,
      };
    }
    return result;
  }

  function queueDashboardChatApiRefresh(options = {}) {
    if (!options.forceNetwork && !getDashboardChatCurrentViewState()?.isOpen) {
      return;
    }

    if (getApiSyncTimer()) {
      win.clearTimeout(getApiSyncTimer());
    }

    const shouldBypassRefreshBudget = Boolean(options.forceNetwork || options.immediate);
    const delayMs = shouldBypassRefreshBudget
      ? normalizeRefreshDelay(options.delayMs ?? 0)
      : refreshDelayWithBudget(
          options.delayMs ?? 160,
          dashboardChatApiLastRequestedAt,
          DASHBOARD_CHAT_API_REFRESH_MIN_INTERVAL_MS
        );
    setApiSyncTimer(
      win.setTimeout(() => {
        setApiSyncTimer(0);
        if (!canRunDashboardChatNetworkRefresh(options)) {
          void refreshDashboardChatFromApi(options);
          return;
        }
        dashboardChatApiLastRequestedAt = Date.now();
        void refreshDashboardChatFromApi(options);
      }, delayMs)
    );
  }

  let dashboardChatPageScroll = false;

  async function loadOlderDashboardChatMessagesWithApi(threadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const cursor = getPagination()[normalizedThreadId];
    if (!cursor) {
      return null;
    }
    dashboardChatPageScroll = true;
    return refreshDashboardChatFromApi({ threadId: normalizedThreadId, cursor });
  }

  function isDashboardChatPageScrollActive() {
    return dashboardChatPageScroll;
  }

  function setDashboardChatPageScroll(nextState = false) {
    dashboardChatPageScroll = Boolean(nextState);
  }

  async function loadDashboardChatModerationFromApi() {
    if (!getIsCurrentPlatformUserAdmin()) {
      return null;
    }

    const currentModeration = getModerationState();
    setModerationState({ ...currentModeration, loading: true, error: "" });
    renderDashboardChatWidget();

    const filters = getDashboardApiFilters?.() || dashboardChatModerationDefaultFilters;
    const moderationQuery = {
      view: "moderation",
      limit: 80,
      action: filters.action || "all",
      userId: filters.userId || "",
      thread: filters.threadId || "",
      from: filters.from || "",
      to: filters.to || "",
      __activeChatRead: true,
    };

    const result = await fetchDashboardChatApi(moderationQuery);
    const healthResult = await fetchDashboardChatApi({ view: "health", limit: 8, __activeChatRead: true });

    if (!result.ok) {
      setModerationState({ ...getModerationState(), loading: false, error: result.reason || "Could not load moderation." });
      renderDashboardChatWidget();
      return result;
    }

    setModerationState({
      loading: false,
      audits: Array.isArray(result.result.audits) ? result.result.audits : [],
      failedUploads: Array.isArray(result.result.failedUploads) ? result.result.failedUploads : [],
      retentionPolicy: result.result.retentionPolicy || null,
      health: healthResult.ok ? healthResult.result.health || null : getModerationState().health,
      filters: result.result.filters || filters,
      error: "",
    });

    if (healthResult.ok && Array.isArray(healthResult.result.audits) && !getModerationState().audits.length) {
      setModerationState({
        ...getModerationState(),
        audits: healthResult.result.audits,
      });
    }

    if (result.result.scope) {
      setApiScope(result.result.scope);
    }

    renderDashboardChatWidget();
    return result;
  }

  function getDashboardSupabaseClient() {
    const authStore = getPlatformAuthStore?.() || getCurrentAuthStore?.();
    return authStore?.getSupabaseClient?.() || authStore?.supabase || null;
  }

  function handleDashboardChatRealtimeMessageChange(change = {}) {
    const activeState = getDashboardChatCurrentViewState();

    setRealtimeLastEventAt(Date.now());
    const eventType = String(change.eventType || change.type || "").toUpperCase();
    const record = change.new || change.old || {};
    const messageId = String(record?.id || record?.messageId || "").trim();
    const deletedAt = String(record?.deleted_at || record?.deletedAt || "").trim();

    if (messageId && (deletedAt || eventType === "DELETE")) {
      const state = getDashboardMessages();
      const nextState = state.filter((message) => message.id !== messageId);
      setDashboardMessages(nextState);
      syncDashboardChatWidgetNotificationCursor();
      platformNavigationController?.renderTopIconMenu?.();
    }

    if (activeState.isOpen) {
      queueDashboardChatApiRefresh({ delayMs: 250 });
      queueDashboardChatThreadSummaryRefresh({ delayMs: 350 });
      return;
    }

    queueDashboardChatThreadSummaryRefresh({ delayMs: 350, forceNetwork: true, render: true });
  }

  function handleDashboardChatRealtimeRelatedChange(change = {}) {
    const activeState = getDashboardChatCurrentViewState();

    setRealtimeLastEventAt(Date.now());
    const record = change.new || change.old || {};
    const databaseThreadId = String(record.thread_id || record.id || "").trim();
    const matchingThread = getApiThreads().find((thread) => thread.databaseThreadId === databaseThreadId) || null;
    const refreshThreadId = matchingThread?.threadId || activeState.selectedThreadId || dashboardChatTeamThreadId;
    if (activeState.isOpen) {
      queueDashboardChatThreadSummaryRefresh({ delayMs: 180 });
      queueDashboardChatApiRefresh({ threadId: refreshThreadId, delayMs: 220 });
      return;
    }

    queueDashboardChatThreadSummaryRefresh({ delayMs: 180, forceNetwork: true, render: true });
  }

  function handleDashboardChatRealtimeStatus(status = "") {
    setRealtimeStatus(String(status || "unknown"));
    renderDashboardChatWidget();

    if (getRealtimeRecoveryTimer()) {
      win.clearTimeout(getRealtimeRecoveryTimer());
      setRealtimeRecoveryTimer(0);
    }

    if (getRealtimeStatus() === "SUBSCRIBED") {
      queueDashboardChatCurrentViewRefresh({ delayMs: 250 });
      return;
    }

    setRealtimeRecoveryTimer(
      win.setTimeout(() => {
        setRealtimeRecoveryTimer(0);
        queueDashboardChatCurrentViewRefresh({ delayMs: 0 });
      }, 1200)
    );
  }

  function setupDashboardChatRealtime() {
    const authStore = getPlatformAuthStore?.();
    const supabaseClient = typeof authStore?.getSupabaseClient === "function" ? authStore.getSupabaseClient() : null;
    const scope = getApiScope();

    if (!supabaseClient?.channel || !scope?.organizationId) {
      return;
    }

    const signature = `${scope.organizationId || ""}:${scope.teamId || ""}`;
    if (getRealtimeSignature() === signature && getRealtimeChannel()) {
      return;
    }

    if (getRealtimeChannel() && typeof supabaseClient.removeChannel === "function") {
      supabaseClient.removeChannel(getRealtimeChannel());
    }

    setRealtimeSignature(signature);
    const realtimeScopeFilter = `organization_id=eq.${scope.organizationId}`;

    setRealtimeChannel(
      supabaseClient
        .channel(`chat:${signature}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads", filter: realtimeScopeFilter }, handleDashboardChatRealtimeRelatedChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: realtimeScopeFilter }, handleDashboardChatRealtimeMessageChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_attachments", filter: realtimeScopeFilter }, handleDashboardChatRealtimeRelatedChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_thread_participants", filter: realtimeScopeFilter }, handleDashboardChatRealtimeRelatedChange)
        .subscribe(handleDashboardChatRealtimeStatus)
    );
  }

  return {
    updateDashboardChatApiThreads,
    applyDashboardChatApiPayload,
    refreshDashboardChatThreadSummariesFromApi,
    queueDashboardChatThreadSummaryRefresh,
    queueDashboardChatCurrentViewRefresh,
    refreshDashboardChatFromApi,
    queueDashboardChatApiRefresh,
    loadOlderDashboardChatMessagesWithApi,
    isDashboardChatPageScrollActive,
    setDashboardChatPageScroll,
    loadDashboardChatModerationFromApi,
    getDashboardSupabaseClient,
    getDashboardAttachmentStorageRef,
    handleDashboardChatRealtimeMessageChange,
    handleDashboardChatRealtimeRelatedChange,
    handleDashboardChatRealtimeStatus,
    setupDashboardChatRealtime,
    getThreadSummarySyncTimer,
    getThreadSummaryLastRequestedAt,
  };
}
