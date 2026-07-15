function isLocalHost(hostname = "") {
  const normalized = String(hostname).trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

const activeChatReadQueryKey = "__activeChatRead";
const forceNetworkReadQueryKey = "__forceNetwork";
const activeChatReadHeader = "X-FootballScience-Chat-Active";

export function createDashboardChatApiDomainRuntime(dependencies = {}) {
  const {
    dashboardChatAdvancedThreadTemplates = () => [],
    getDashboardChatAdvancedThreadTemplates = null,
    dashboardChatTeamThreadId = "team",
    dashboardChatThreadSettings = null,
    getDashboardChatApiThreads = () => [],
    getDashboardChatThreadParticipants,
    getDashboardChatTeamChatTitle = () => "Team Chat",
    getCurrentPlatformUser = () => null,
    normalizeDashboardChatThreadId = (threadId, fallbackThreadId) => {
      const normalized = String(threadId || "").trim();
      const fallback = String(fallbackThreadId || dashboardChatTeamThreadId).trim() || dashboardChatTeamThreadId;
      return normalized || fallback;
    },
    normalizeDashboardMessage = (message = {}) => message,
    getDashboardMessageIdentityKeys = () => [],
    getDashboardMessageCreatedAtMs = () => 0,
    getPlatformAuthStore = () => null,
    withUiTimeout = (promise) => Promise.resolve(promise),
    win = typeof globalThis !== "undefined" ? globalThis : {},
    fetchImpl = (...args) => {
      if (typeof globalThis.fetch !== "function") {
        throw new Error("fetch is not available for dashboard chat API domain runtime.");
      }
      return globalThis.fetch(...args);
    },
    chatApiReadDedupeWindowMs = 2000,
    chatApiReadMinimumGapMs = 1000,
  } = dependencies;
  const dashboardChatApiBackoffMs = 60 * 1000;
  const dashboardChatApiReadDedupeWindowMs = Math.max(0, Number(chatApiReadDedupeWindowMs) || 0);
  const dashboardChatApiReadMinimumGapMs = Math.max(0, Number(chatApiReadMinimumGapMs) || 0);
  const dashboardChatApiReadCacheMaxEntries = 40;
  const dashboardChatApiReadRequests = new Map();
  let dashboardChatApiBackoffUntil = 0;
  let dashboardChatApiBackoffStatus = 503;
  let dashboardChatApiBackoffReason = "Chat API is backing off while the platform data service recovers.";
  let dashboardChatApiReadLastStartedAt = 0;
  let dashboardChatApiReadGate = Promise.resolve();

  function getAdvancedThreadTemplates() {
    const source =
      typeof getDashboardChatAdvancedThreadTemplates === "function"
        ? getDashboardChatAdvancedThreadTemplates()
        : typeof dashboardChatAdvancedThreadTemplates === "function"
          ? dashboardChatAdvancedThreadTemplates()
          : dashboardChatAdvancedThreadTemplates;
    return Array.isArray(source) ? source : [];
  }

  function getThreadSettingsStore() {
    return typeof dashboardChatThreadSettings === "function" ? dashboardChatThreadSettings() : dashboardChatThreadSettings;
  }

  function getRetryAfterMs(response = null) {
    const rawValue = String(response?.headers?.get?.("Retry-After") || "").trim();
    if (!rawValue) {
      return 0;
    }
    const seconds = Number(rawValue);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const retryAt = Date.parse(rawValue);
    return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 0;
  }

  function markDashboardChatApiBackoff(durationMs = dashboardChatApiBackoffMs, status = 503, reason = "") {
    dashboardChatApiBackoffUntil = Date.now() + Math.max(1000, Number(durationMs) || dashboardChatApiBackoffMs);
    dashboardChatApiBackoffStatus = Number(status) || 503;
    dashboardChatApiBackoffReason = String(reason || "Chat API is backing off while the platform data service recovers.");
  }

  function clearDashboardChatApiBackoff() {
    dashboardChatApiBackoffUntil = 0;
    dashboardChatApiBackoffStatus = 503;
    dashboardChatApiBackoffReason = "Chat API is backing off while the platform data service recovers.";
  }

  function getDashboardChatApiBackoffResult() {
    const remainingMs = dashboardChatApiBackoffUntil - Date.now();
    if (remainingMs <= 0) {
      return null;
    }
    return {
      ok: false,
      status: dashboardChatApiBackoffStatus,
      reason: dashboardChatApiBackoffReason,
      retryable: true,
      backoffMs: remainingMs,
    };
  }

  function getDashboardChatPublicReadQuery(query = {}) {
    const publicQuery = { ...(query || {}) };
    delete publicQuery[activeChatReadQueryKey];
    delete publicQuery[forceNetworkReadQueryKey];
    delete publicQuery.forceNetwork;
    return publicQuery;
  }

  function buildDashboardChatApiReadParams(query = {}) {
    const params = new URLSearchParams();
    Object.entries(getDashboardChatPublicReadQuery(query))
      .sort(([firstKey], [secondKey]) => String(firstKey).localeCompare(String(secondKey)))
      .forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim()) {
          params.set(key, String(value));
        }
      });
    return params;
  }

  function getDashboardChatApiReadCacheKey(query = {}) {
    const actorId = String(getCurrentPlatformUser()?.id || "").trim() || "anonymous";
    return `${actorId}:${buildDashboardChatApiReadParams(query).toString()}`;
  }

  function cloneDashboardChatApiReadResult(result = {}) {
    return result && typeof result === "object" ? { ...result } : result;
  }

  function pruneDashboardChatApiReadRequests(nowMs = Date.now()) {
    if (dashboardChatApiReadRequests.size <= dashboardChatApiReadCacheMaxEntries) {
      return;
    }
    for (const [key, entry] of dashboardChatApiReadRequests.entries()) {
      if (!entry?.inFlight && (!entry?.expiresAt || entry.expiresAt <= nowMs)) {
        dashboardChatApiReadRequests.delete(key);
      }
    }
  }

  function waitForDashboardChatApiReadDelay(delayMs = 0) {
    const normalizedDelay = Math.max(0, Number(delayMs) || 0);
    if (!normalizedDelay) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      win.setTimeout(resolve, normalizedDelay);
    });
  }

  function waitForDashboardChatApiReadBudget() {
    const previousGate = dashboardChatApiReadGate.catch(() => {});
    const nextGate = previousGate.then(async () => {
      const elapsedMs = Date.now() - Number(dashboardChatApiReadLastStartedAt || 0);
      const delayMs = Math.max(0, dashboardChatApiReadMinimumGapMs - elapsedMs);
      await waitForDashboardChatApiReadDelay(delayMs);
      dashboardChatApiReadLastStartedAt = Date.now();
    });
    dashboardChatApiReadGate = nextGate.catch(() => {});
    return nextGate;
  }

  function getDashboardChatThreadTypeForApi(threadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    if (normalizedThreadId === dashboardChatTeamThreadId) {
      return "team";
    }
    if (normalizedThreadId.startsWith("group-") || normalizedThreadId.startsWith("group:")) {
      return "group";
    }
    const template = getAdvancedThreadTemplates().find((candidate) => candidate.key === normalizedThreadId);
    return template?.type || "dm";
  }

  function getDashboardChatPublicThreadId(rawThreadId = "") {
    const threadId = String(rawThreadId || "").trim();
    if (!threadId) {
      return "";
    }

    const sanitizedThreadId = threadId.replace(/[^a-zA-Z0-9_.:-]/g, "-");
    const templateKeys = new Set(getAdvancedThreadTemplates().map((template) => template?.key).filter(Boolean));
    if (
      threadId === dashboardChatTeamThreadId ||
      threadId.startsWith("dm:") ||
      sanitizedThreadId.startsWith("group-") ||
      sanitizedThreadId.startsWith("group:") ||
      templateKeys.has(threadId) ||
      templateKeys.has(sanitizedThreadId)
    ) {
      return normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    }

    return "";
  }

  function getDashboardChatParticipantIdsForApi(threadId) {
    return (getDashboardChatThreadParticipants(threadId) || [])
      .map((user) => user?.id)
      .filter(Boolean);
  }

  async function getDashboardChatApiAccessToken() {
    if (win.platformAuthReadyPromise instanceof Promise) {
      try {
        await win.platformAuthReadyPromise;
      } catch {
        // noop
      }
    }

    const authStore = getPlatformAuthStore();
    if (typeof authStore?.getAccessToken !== "function") {
      return "";
    }

    try {
      return String((await authStore.getAccessToken()) || "").trim();
    } catch {
      return "";
    }
  }

  async function sendDashboardChatApiAction(payload = {}) {
    let token = "";
    try {
      token = await withUiTimeout(
        getDashboardChatApiAccessToken(),
        8000,
        "Chat session check took too long. Try again."
      );
    } catch (error) {
      return {
        ok: false,
        status: 0,
        reason: error?.message || "Chat session check took too long. Try again.",
        retryable: true,
      };
    }

    if (!token) {
      return { ok: false, status: 401, reason: "Chat API requires an authenticated session." };
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutId = 0;
    try {
      if (controller) {
        timeoutId = win.setTimeout(() => controller.abort(), 15000);
      }

      const response = await fetchImpl("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      const responseText = await response.text();
      let result = {};
      if (responseText) {
        try {
          result = JSON.parse(responseText);
        } catch {
          result = { reason: responseText.slice(0, 240) };
        }
      }

      if (!response.ok || result?.ok === false) {
        const reason = result?.reason || result?.message || `Chat API failed (${response.status}).`;
        if (response.status === 429 || response.status >= 500) {
          markDashboardChatApiBackoff(
            getRetryAfterMs(response) || (response.status === 429 ? 15 * 1000 : dashboardChatApiBackoffMs),
            response.status,
            reason
          );
        }
        return {
          ok: false,
          status: response.status,
          reason,
          retryable: response.status >= 500,
        };
      }

      clearDashboardChatApiBackoff();
      return { ok: true, status: response.status, result };
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      markDashboardChatApiBackoff();
      return {
        ok: false,
        status: 0,
        reason: timedOut ? "Chat API timed out. Try again." : error?.message || "Chat API could not be reached.",
        retryable: true,
      };
    } finally {
      if (timeoutId) {
        win.clearTimeout(timeoutId);
      }
    }
  }

  async function fetchDashboardChatApi(query = {}) {
    const backoffResult = getDashboardChatApiBackoffResult();
    if (backoffResult) {
      return backoffResult;
    }

    let token = "";
    try {
      token = await withUiTimeout(
        getDashboardChatApiAccessToken(),
        8000,
        "Chat session check took too long. Try again."
      );
    } catch (error) {
      markDashboardChatApiBackoff();
      return {
        ok: false,
        status: 0,
        reason: error?.message || "Chat session check took too long. Try again.",
        retryable: true,
      };
    }
    if (!token) {
      return { ok: false, status: 401, reason: "Chat API requires an authenticated session." };
    }

    const activeChatRead = Boolean(query?.[activeChatReadQueryKey]);
    const forceNetworkRead = Boolean(query?.[forceNetworkReadQueryKey] || query?.forceNetwork);
    const params = buildDashboardChatApiReadParams(query);
    const readCacheKey = getDashboardChatApiReadCacheKey(query);
    const nowMs = Date.now();
    const cachedRequest = dashboardChatApiReadRequests.get(readCacheKey);
    if (!forceNetworkRead && cachedRequest?.inFlight) {
      return cachedRequest.inFlight;
    }
    if (!forceNetworkRead && cachedRequest?.result?.ok && cachedRequest.expiresAt > nowMs) {
      return cloneDashboardChatApiReadResult(cachedRequest.result);
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutId = 0;
    const requestPromise = (async () => {
      try {
        await waitForDashboardChatApiReadBudget();
        if (controller) {
          timeoutId = win.setTimeout(() => controller.abort(), 15000);
        }

        const response = await fetchImpl(`/api/chat${params.toString() ? `?${params.toString()}` : ""}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(activeChatRead ? { [activeChatReadHeader]: "1" } : {}),
          },
          cache: "no-store",
          signal: controller?.signal,
        });

        const responseText = await response.text();
        let result = {};
        if (responseText) {
          try {
            result = JSON.parse(responseText);
          } catch {
            result = { reason: responseText.slice(0, 240) };
          }
        }

        if (!response.ok || result?.ok === false) {
          const reason = result?.reason || result?.message || `Chat API failed (${response.status}).`;
          if (response.status === 429 || response.status >= 500) {
            markDashboardChatApiBackoff(
              getRetryAfterMs(response) || (response.status === 429 ? 15 * 1000 : dashboardChatApiBackoffMs),
              response.status,
              reason
            );
          }
          return {
            ok: false,
            status: response.status,
            reason,
          };
        }

        clearDashboardChatApiBackoff();
        return { ok: true, status: response.status, result };
      } catch (error) {
        const timedOut = error?.name === "AbortError";
        markDashboardChatApiBackoff();
        return {
          ok: false,
          status: 0,
          reason: timedOut ? "Chat API timed out. Try again." : error?.message || "Chat API could not be reached.",
          retryable: true,
        };
      } finally {
        if (timeoutId) {
          win.clearTimeout(timeoutId);
        }
      }
    })();

    dashboardChatApiReadRequests.set(readCacheKey, { inFlight: requestPromise, expiresAt: 0, result: null });
    requestPromise.then((result) => {
      if (result?.ok) {
        const resolvedAt = Date.now();
        dashboardChatApiReadRequests.set(readCacheKey, {
          inFlight: null,
          result,
          resolvedAt,
          expiresAt: resolvedAt + dashboardChatApiReadDedupeWindowMs,
        });
        pruneDashboardChatApiReadRequests(resolvedAt);
        return;
      }
      if (dashboardChatApiReadRequests.get(readCacheKey)?.inFlight === requestPromise) {
        dashboardChatApiReadRequests.delete(readCacheKey);
      }
    });

    return requestPromise;
  }

  function canFallbackDashboardChatApiResult(result = {}) {
    const host = win.location?.hostname || "";
    const isLocal = isLocalHost(host);
    const isDevAuth = Boolean(getPlatformAuthStore()?.isDevMode?.());
    return Boolean(isLocal && isDevAuth && (result.status === 401 || result.retryable));
  }

  function logDashboardChatApiFailure(action, result = {}) {
    if (Number(result.status || 0) === 429) {
      return;
    }
    console.warn(`Chat action ${action} was not saved through /api/chat.`, result.reason || result.status || result);
  }

  function normalizeDashboardApiParticipant(participant = {}) {
    if (participant && typeof participant === "object" && !Array.isArray(participant)) {
      const metadata = participant.metadata && typeof participant.metadata === "object" ? participant.metadata : {};
      const profile = metadata.profile && typeof metadata.profile === "object" ? metadata.profile : metadata;
      const userId = String(participant.userId || participant.user_id || participant.id || "").trim();
      const displayName = String(
        participant.name ||
          participant.fullName ||
          participant.full_name ||
          profile.name ||
          profile.fullName ||
          profile.full_name ||
          ""
      ).trim();
      const [fallbackFirstName = "", ...fallbackLastNameParts] = displayName.split(/\s+/).filter(Boolean);
      const firstName = String(
        participant.firstName ||
          participant.first_name ||
          profile.firstName ||
          profile.first_name ||
          fallbackFirstName ||
          ""
      ).trim();
      const lastName = String(
        participant.lastName ||
          participant.last_name ||
          profile.lastName ||
          profile.last_name ||
          fallbackLastNameParts.join(" ") ||
          ""
      ).trim();
      return {
        id: userId,
        userId,
        name: displayName || [firstName, lastName].filter(Boolean).join(" ").trim(),
        firstName,
        lastName,
        email: String(participant.email || profile.email || "").trim().toLowerCase(),
        username: String(participant.username || participant.userName || profile.username || profile.userName || "").trim(),
        participantRole:
          String(participant.participantRole || participant.participant_role || participant.role || "member").trim().toLowerCase() || "member",
        role:
          String(participant.participantRole || participant.participant_role || participant.role || "member").trim().toLowerCase() || "member",
        chatParticipantRole:
          String(participant.chatParticipantRole || participant.participantRole || participant.participant_role || participant.role || "member").trim().toLowerCase() || "member",
        notificationLevel: String(participant.notificationLevel || participant.notification_level || "all").trim() || "all",
        metadata,
        userState: participant.userState && typeof participant.userState === "object" ? participant.userState : {},
        joinedAt: String(participant.joinedAt || participant.joined_at || "").trim(),
        leftAt: String(participant.leftAt || participant.left_at || "").trim(),
        lastReadAt: String(participant.lastReadAt || participant.last_read_at || "").trim(),
        lastReadMessageId: String(participant.lastReadMessageId || participant.last_read_message_id || "").trim(),
      };
    }

    const userId = String(participant || "").trim();
    return userId
      ? { id: userId, userId, participantRole: "member", role: "member", joinedAt: "", leftAt: "", lastReadAt: "", lastReadMessageId: "" }
      : null;
  }

  function normalizeDashboardApiActionItem(actionItem = {}, thread = null) {
    const metadata = actionItem.metadata && typeof actionItem.metadata === "object" ? actionItem.metadata : {};
    const rawPriority = String(actionItem.priority || "normal").trim().toLowerCase();
    const rawStatus = String(actionItem.status || "open").trim().toLowerCase();
    return {
      id: String(actionItem.id || actionItem.actionItemId || actionItem.action_item_id || "").trim(),
      actionItemId: String(actionItem.actionItemId || actionItem.action_item_id || actionItem.id || "").trim(),
      threadId: normalizeDashboardChatThreadId(
        thread?.threadId || actionItem.legacyThreadId || actionItem.legacy_thread_id || actionItem.threadId || actionItem.thread_id || "",
        dashboardChatTeamThreadId
      ),
      databaseThreadId: String(actionItem.thread_id || actionItem.databaseThreadId || thread?.databaseThreadId || thread?.id || "").trim(),
      messageId: String(actionItem.messageId || actionItem.message_id || "").trim(),
      clientActionId: String(actionItem.clientActionId || actionItem.client_action_id || "").trim(),
      title: String(actionItem.title || actionItem.summary || "").trim(),
      status: ["open", "done", "archived"].includes(rawStatus) ? rawStatus : "open",
      priority: ["urgent", "important", "normal"].includes(rawPriority) ? rawPriority : "normal",
      ownerId: String(actionItem.ownerId || actionItem.owner_id || "").trim(),
      ownerLabel: String(actionItem.ownerLabel || actionItem.owner_label || metadata.ownerLabel || metadata.owner_label || "").trim(),
      dueLabel: String(actionItem.dueLabel || actionItem.due_label || "").trim(),
      dueAt: String(actionItem.dueAt || actionItem.due_at || "").trim(),
      createdBy: String(actionItem.createdBy || actionItem.created_by || "").trim(),
      completedBy: String(actionItem.completedBy || actionItem.completed_by || "").trim(),
      createdAt: String(actionItem.createdAt || actionItem.created_at || "").trim(),
      updatedAt: String(actionItem.updatedAt || actionItem.updated_at || "").trim(),
      completedAt: String(actionItem.completedAt || actionItem.completed_at || "").trim(),
      archivedAt: String(actionItem.archivedAt || actionItem.archived_at || "").trim(),
      persisted: true,
      metadata,
    };
  }

  function normalizeDashboardApiMessageDelivery(delivery = {}, message = {}) {
    const source = delivery && typeof delivery === "object" && !Array.isArray(delivery) ? delivery : {};
    const rawStatus = String(source.status || source.state || "").trim().toLowerCase();
    const fallbackStatus = String(message.status || "").trim().toLowerCase();
    const authorId = String(message.userId || message.author_id || message.authorId || "").trim();
    const readBy = Array.from(new Set(
      (Array.isArray(source.readBy) ? source.readBy : Array.isArray(message.readBy) ? message.readBy : [])
        .map((userId) => String(userId || "").trim())
        .filter((userId) => userId && userId !== authorId)
    ));
    const status = ["pending", "failed", "sent", "delivered", "read", "deleted"].includes(rawStatus)
      ? rawStatus
      : readBy.length || fallbackStatus === "read"
        ? "read"
        : ["pending", "failed", "deleted"].includes(fallbackStatus)
          ? fallbackStatus
          : String(message.id || message.messageId || "").trim()
            ? "delivered"
            : "sent";

    return {
      status,
      deliveredAt: String(source.deliveredAt || source.delivered_at || message.deliveredAt || message.delivered_at || message.createdAt || message.created_at || "").trim(),
      readAt: String(source.readAt || source.read_at || "").trim(),
      readBy,
      readCount: Number(source.readCount || source.read_count || readBy.length) || 0,
      source: String(source.source || (Object.keys(source).length ? "api" : "derived")).trim(),
    };
  }

  function normalizeDashboardApiThread(thread = {}) {
    const type = String(thread.type || "team").trim().toLowerCase();
    const legacyThreadId = String(thread.metadata?.legacyThreadId || thread.legacyThreadId || "").trim();
    const messageCount = Number(thread.message_count || thread.messageCount || 0) || 0;
    const lastMessage = thread.lastMessage || thread.last_message || null;
    const lastMessageId = String(thread.lastMessageId || thread.last_message_id || lastMessage?.id || lastMessage?.messageId || "").trim();

    const templates = getAdvancedThreadTemplates();
    const templateByLegacyId = legacyThreadId
      ? templates.find((candidate) => candidate.key === legacyThreadId)
      : null;
    const templateByManagedType = ["medical", "matchday", "training", "announcement"].includes(type)
      ? templates.find((candidate) => candidate.type === type)
      : null;
    const template = templateByLegacyId || templateByManagedType;
    const resolvedLegacyThreadId = legacyThreadId || template?.key || "";
    const threadId = normalizeDashboardChatThreadId(
      resolvedLegacyThreadId || (type === "team" ? dashboardChatTeamThreadId : thread.id),
      dashboardChatTeamThreadId
    );
    const databaseThreadId = String(thread.id || "").trim();
    const sourceActionItems = Array.isArray(thread.actionItems)
      ? thread.actionItems
      : Array.isArray(thread.action_items)
        ? thread.action_items
        : [];

    return {
      threadId,
      databaseThreadId,
      type,
      title: String(
        thread.title || thread.name || template?.title || (type === "team" ? getDashboardChatTeamChatTitle() : "Chat")
      ).trim(),
      visibility: String(thread.visibility || "members").trim(),
      createdAt: String(thread.created_at || thread.createdAt || "").trim(),
      archivedAt: String(thread.archived_at || thread.archivedAt || "").trim(),
      avatarUrl: String(thread.avatarUrl || thread.avatar_url || thread.metadata?.avatarUrl || thread.metadata?.imageUrl || "").trim(),
      lastMessageAt: String(messageCount || lastMessage ? thread.last_message_at || thread.lastMessageAt || "" : "").trim(),
      messageCount,
      unreadCount: Number(thread.unreadCount || thread.unread_count || 0) || 0,
      lastReadAt: String(thread.lastReadAt || thread.last_read_at || "").trim(),
      lastMessage,
      lastMessageId,
      lastMessagePreview: String(thread.lastMessagePreview || thread.last_message_preview || "").trim(),
      historyComplete: Boolean(thread.historyComplete || thread.history_complete || thread.metadata?.historyComplete || thread.metadata?.history_complete),
      participants: Array.isArray(thread.participants)
        ? thread.participants.map(normalizeDashboardApiParticipant).filter(Boolean)
        : [],
      permissions: thread.permissions && typeof thread.permissions === "object" ? thread.permissions : {},
      settings: getThreadSettingsStore()?.normalize ? getThreadSettingsStore().normalize(thread.settings || thread.threadSettings || {}) : {},
      userState: thread.userState && typeof thread.userState === "object" ? thread.userState : {},
      notificationLevel: String(thread.notificationLevel || thread.notification_level || "all").trim() || "all",
      actionItems: sourceActionItems.map((actionItem) => normalizeDashboardApiActionItem(actionItem, { ...thread, threadId, databaseThreadId })),
      hasActionItemsPayload: Array.isArray(thread.actionItems) || Array.isArray(thread.action_items),
      metadata: thread.metadata || {},
    };
  }

  function normalizeDashboardApiMessage(message = {}, thread = null) {
    const apiThread = thread ? normalizeDashboardApiThread(thread) : null;
    const messageMetadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
    const messageLegacyThreadId = String(
      message.legacyThreadId ||
        message.legacy_thread_id ||
        messageMetadata.legacyThreadId ||
        messageMetadata.legacy_thread_id ||
        ""
    ).trim();
    const threadId = normalizeDashboardChatThreadId(
      getDashboardChatPublicThreadId(messageLegacyThreadId) ||
        getDashboardChatPublicThreadId(message.threadId || message.thread_id) ||
        apiThread?.threadId ||
        message.threadId ||
        message.thread_id ||
        dashboardChatTeamThreadId,
      dashboardChatTeamThreadId
    );
    const author = message.author || message.user || null;
    const authorId = message.userId || message.author_id || message.authorId || "";
    const delivery = normalizeDashboardApiMessageDelivery(message.delivery, {
      ...message,
      userId: authorId,
    });
    const readBy = Array.from(new Set([
      authorId,
      ...(Array.isArray(message.readBy) ? message.readBy : []),
      ...delivery.readBy,
    ].map((userId) => String(userId || "").trim()).filter(Boolean)));

    return normalizeDashboardMessage({
      id: message.id || message.messageId,
      clientMessageId:
        message.clientMessageId ||
        message.client_message_id ||
        messageMetadata.clientMessageId ||
        messageMetadata.client_message_id ||
        "",
      threadId,
      text: message.text ?? message.body ?? "",
      userId: authorId,
      createdAt: message.createdAt || message.created_at,
      editedAt: message.editedAt || message.edited_at || "",
      deliveredAt: delivery.deliveredAt || message.deliveredAt || message.createdAt || message.created_at,
      readBy,
      delivery,
      mentionedUserIds: Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : [],
      reactions: message.reactions || {},
      replyToId: message.replyToId || message.reply_to_id || "",
      priority: message.priority,
      pinnedAt: message.pinnedAt || message.pinned_at || "",
      pinnedBy: message.pinnedBy || message.pinned_by || "",
      author,
      metadata: messageMetadata,
      forwardedFromMessageId: message.forwardedFromMessageId || message.forwarded_from_message_id || messageMetadata.forwardedFromMessageId || "",
      forwardedFromThreadId: message.forwardedFromThreadId || message.forwarded_from_thread_id || messageMetadata.forwardedFromThreadId || "",
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      status: message.status || (message.deleted_at || message.deletedAt ? "deleted" : "sent"),
    });
  }

  return {
    canFallbackDashboardChatApiResult,
    fetchDashboardChatApi,
    getDashboardChatApiAccessToken,
    getDashboardChatApiThreads,
    getDashboardChatParticipantIdsForApi,
    getDashboardChatThreadTypeForApi,
    getDashboardMessageCreatedAtMs,
    getDashboardMessageIdentityKeys,
    logDashboardChatApiFailure,
    normalizeDashboardApiMessage,
    normalizeDashboardApiMessageDelivery,
    normalizeDashboardApiActionItem,
    normalizeDashboardApiParticipant,
    normalizeDashboardApiThread,
    sendDashboardChatApiAction,
  };
}
