function isLocalHost(hostname = "") {
  const normalized = String(hostname).trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
}

export function createDashboardChatApiDomainRuntime(dependencies = {}) {
  const {
    dashboardChatAdvancedThreadTemplates = () => [],
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
  } = dependencies;

  function getDashboardChatThreadTypeForApi(threadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    if (normalizedThreadId === dashboardChatTeamThreadId) {
      return "team";
    }
    if (normalizedThreadId.startsWith("group-") || normalizedThreadId.startsWith("group:")) {
      return "group";
    }
    const template = dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.key === normalizedThreadId);
    return template?.type || "dm";
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
        return {
          ok: false,
          status: response.status,
          reason: result?.reason || result?.message || `Chat API failed (${response.status}).`,
          retryable: response.status >= 500,
        };
      }

      return { ok: true, status: response.status, result };
    } catch (error) {
      const timedOut = error?.name === "AbortError";
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
    const token = await getDashboardChatApiAccessToken();
    if (!token) {
      return { ok: false, status: 401, reason: "Chat API requires an authenticated session." };
    }

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) {
        params.set(key, String(value));
      }
    });

    try {
      const response = await fetchImpl(`/api/chat${params.toString() ? `?${params.toString()}` : ""}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
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
        return {
          ok: false,
          status: response.status,
          reason: result?.reason || result?.message || `Chat API failed (${response.status}).`,
        };
      }

      return { ok: true, status: response.status, result };
    } catch (error) {
      return { ok: false, status: 0, reason: error?.message || "Chat API could not be reached." };
    }
  }

  function canFallbackDashboardChatApiResult(result = {}) {
    if (result.retryable) {
      return true;
    }

    const host = win.location?.hostname || "";
    const isLocal = isLocalHost(host);
    const isDevAuth = Boolean(getPlatformAuthStore()?.isDevMode?.());
    return Boolean(isLocal && isDevAuth && result.status === 401);
  }

  function logDashboardChatApiFailure(action, result = {}) {
    console.warn(`Chat action ${action} was not saved through /api/chat.`, result.reason || result.status || result);
  }

  function normalizeDashboardApiParticipant(participant = {}) {
    if (participant && typeof participant === "object" && !Array.isArray(participant)) {
      const userId = String(participant.userId || participant.user_id || participant.id || "").trim();
      return {
        id: userId,
        userId,
        participantRole:
          String(participant.participantRole || participant.participant_role || participant.role || "member").trim().toLowerCase() || "member",
        role:
          String(participant.participantRole || participant.participant_role || participant.role || "member").trim().toLowerCase() || "member",
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

  function normalizeDashboardApiThread(thread = {}) {
    const type = String(thread.type || "team").trim().toLowerCase();
    const legacyThreadId = String(thread.metadata?.legacyThreadId || thread.legacyThreadId || "").trim();
    const messageCount = Number(thread.message_count || thread.messageCount || 0) || 0;
    const lastMessage = thread.lastMessage || thread.last_message || null;
    const lastMessageId = String(thread.lastMessageId || thread.last_message_id || lastMessage?.id || lastMessage?.messageId || "").trim();

    const templateByLegacyId = legacyThreadId
      ? dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.key === legacyThreadId)
      : null;
    const templateByManagedType = ["medical", "matchday", "training", "announcement"].includes(type)
      ? dashboardChatAdvancedThreadTemplates.find((candidate) => candidate.type === type)
      : null;
    const template = templateByLegacyId || templateByManagedType;
    const resolvedLegacyThreadId = legacyThreadId || template?.key || "";

    return {
      threadId: normalizeDashboardChatThreadId(
        resolvedLegacyThreadId || (type === "team" ? dashboardChatTeamThreadId : thread.id),
        dashboardChatTeamThreadId
      ),
      databaseThreadId: String(thread.id || "").trim(),
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
      participants: Array.isArray(thread.participants)
        ? thread.participants.map(normalizeDashboardApiParticipant).filter(Boolean)
        : [],
      permissions: thread.permissions && typeof thread.permissions === "object" ? thread.permissions : {},
      settings: dashboardChatThreadSettings?.normalize ? dashboardChatThreadSettings.normalize(thread.settings || thread.threadSettings || {}) : {},
      metadata: thread.metadata || {},
    };
  }

  function normalizeDashboardApiMessage(message = {}, thread = null) {
    const apiThread = thread ? normalizeDashboardApiThread(thread) : null;
    const threadId = normalizeDashboardChatThreadId(
      message.legacyThreadId || message.threadId || message.thread_id || apiThread?.threadId || dashboardChatTeamThreadId,
      dashboardChatTeamThreadId
    );
    const author = message.author || message.user || null;
    const authorId = message.userId || message.author_id || message.authorId || "";

    return normalizeDashboardMessage({
      id: message.id || message.messageId,
      clientMessageId:
        message.clientMessageId ||
        message.client_message_id ||
        message.metadata?.clientMessageId ||
        message.metadata?.client_message_id ||
        "",
      threadId,
      text: message.text ?? message.body ?? "",
      userId: authorId,
      createdAt: message.createdAt || message.created_at,
      deliveredAt: message.deliveredAt || message.createdAt || message.created_at,
      readBy: Array.isArray(message.readBy) ? message.readBy : [],
      mentionedUserIds: Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : [],
      reactions: message.reactions || {},
      replyToId: message.replyToId || message.reply_to_id || "",
      priority: message.priority,
      pinnedAt: message.pinnedAt || message.pinned_at || "",
      pinnedBy: message.pinnedBy || message.pinned_by || "",
      author,
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
    normalizeDashboardApiParticipant,
    normalizeDashboardApiThread,
    sendDashboardChatApiAction,
  };
}
