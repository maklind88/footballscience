export function createDashboardChatDomainRuntime(dependencies = {}) {
  const {
    getCurrentPlatformUser = () => null,
    getPlatformUsers = () => [],
    getDashboardChatApiScope = () => null,
    getDashboardChatAdvancedThreadTemplates = () => [],
    getDashboardChatApiThreads = () => [],
    getDashboardChatThreadSettings = () => null,
    dashboardChatTeamThreadId = "team",
    dashboardChatWidgetStateStorageKey = "football-dashboard-chat-widget-state-v1",
    dashboardChatWidgetNotificationStateStorageKey = "football-dashboard-chat-widget-notification-state-v1",
    dashboardChatWidgetNotificationCursorStorageKey = "football-dashboard-chat-widget-notification-cursor-v1",
    dashboardChatPriorityKeys = new Set(["normal", "important", "urgent"]),
    dashboardChatReactionOptions = [],
    dashboardChatMaxMessageLength = 1600,
    createDashboardId = () => `dashboard-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    normalizePlatformRole = () => "",
    formatUserName = (user = {}) => [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(" ") || "Staff",
    escapeHtml = (value) => String(value ?? ""),
    normalizeDashboardApiMessage = () => null,
    readDashboardMessages = () => [],
    createDashboardChatMessageTextRenderer,
    readDashboardJson = () => null,
    writeDashboardJson = () => {},
  } = dependencies;

  const createMessageTextRenderer = createDashboardChatMessageTextRenderer;
  const safeReadDashboardJson = readDashboardJson;
  const safeWriteDashboardJson = writeDashboardJson;
  let dashboardChatWidgetSessionOpen = false;

  if (typeof createMessageTextRenderer !== "function") {
    throw new Error("createDashboardChatDomainRuntime requires createDashboardChatMessageTextRenderer.");
  }

  function normalizeDashboardChatThreadId(rawThreadId, fallbackThreadId = dashboardChatTeamThreadId) {
    const threadId = String(rawThreadId || fallbackThreadId || "").trim();
    if (!threadId || threadId === dashboardChatTeamThreadId) {
      return dashboardChatTeamThreadId;
    }
    const templates = getDashboardChatAdvancedThreadTemplates();
    if (templates.some((template) => template.key === threadId)) {
      return threadId;
    }
    const sanitizedThreadId = threadId.replace(/[^a-zA-Z0-9_.:-]/g, "-");
    if (sanitizedThreadId.startsWith("group-") || sanitizedThreadId.startsWith("group:")) {
      return sanitizedThreadId;
    }
    if (!threadId.startsWith("dm:")) {
      return dashboardChatTeamThreadId;
    }
    const [, leftId = "", rightId = ""] = threadId.split(":");
    const normalizedIds = [leftId, rightId]
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .sort();
    if (normalizedIds.length !== 2 || normalizedIds[0] === normalizedIds[1]) {
      return dashboardChatTeamThreadId;
    }
    return `dm:${normalizedIds[0]}:${normalizedIds[1]}`;
  }

  function createDashboardChatThreadId(firstUserId, secondUserId) {
    return normalizeDashboardChatThreadId(`dm:${String(firstUserId || "").trim()}:${String(secondUserId || "").trim()}`, dashboardChatTeamThreadId);
  }

  function getDashboardChatTeamName() {
    const dashboardChatApiScope = getDashboardChatApiScope();
    const scopedTeamName = String(
      dashboardChatApiScope?.teamName || dashboardChatApiScope?.team?.name || dashboardChatApiScope?.team_name || ""
    ).trim();
    const userTeamName = String(getCurrentPlatformUser()?.team || "").trim();
    return scopedTeamName || userTeamName || "Team";
  }

  function getDashboardChatTeamChatTitle() {
    const teamName = getDashboardChatTeamName();
    return teamName && teamName !== "Team" ? `${teamName} Chat` : "Team Chat";
  }

  function getDashboardChatParticipantDisplayName(participant = null) {
    if (!participant) {
      return "";
    }
    const profile =
      [participant.profile, participant.user, participant.userProfile, participant.user_profile, participant.metadata?.profile, participant.metadata]
        .find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || {};
    return (
      [participant.firstName || participant.first_name || profile.firstName || profile.first_name, participant.lastName || participant.last_name || profile.lastName || profile.last_name]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(" ") ||
      String(
        participant.name ||
          participant.fullName ||
          participant.full_name ||
          participant.displayName ||
          participant.display_name ||
          profile.name ||
          profile.fullName ||
          profile.full_name ||
          ""
      ).trim()
    );
  }

  function formatDashboardChatThreadLabel(threadId, currentUser, users = getPlatformUsers()) {
    const normalized = normalizeDashboardChatThreadId(threadId);
    if (normalized === dashboardChatTeamThreadId) {
      return getDashboardChatTeamChatTitle();
    }
    const templates = getDashboardChatAdvancedThreadTemplates();
    const template = templates.find((candidate) => candidate.key === normalized);
    if (template) {
      return template.title;
    }
    if (normalized.startsWith("group-") || normalized.startsWith("group:")) {
      const dashboardChatApiThreads = getDashboardChatApiThreads();
      const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalized);
      const threadSettings = getDashboardChatThreadSettings();
      return threadSettings?.merge?.(normalized, apiThread?.settings || {}).customTitle || apiThread?.title || "Group chat";
    }
    const participantPartner = getDashboardChatThreadParticipants(normalized, users).find((user) => !isSameDashboardUser(user, currentUser));
    if (participantPartner) {
      return getDashboardChatParticipantDisplayName(participantPartner) || formatUserName(participantPartner);
    }
    const [, firstId = "", secondId = ""] = normalized.split(":");
    const currentUserId = currentUser?.id || "";
    const partnerId = firstId === currentUserId ? secondId : firstId;
    const partner = users.find((user) => user.id === partnerId);
    return partner ? formatUserName(partner) : "Direct Message";
  }

  function normalizeDashboardUserIdentityValue(value = "") {
    return String(value || "").trim().toLowerCase();
  }

  function isSameDashboardUser(firstUser = {}, secondUser = {}) {
    if (!firstUser || !secondUser) {
      return false;
    }
    const firstKeys = [firstUser.id, firstUser.email, firstUser.username]
      .map(normalizeDashboardUserIdentityValue)
      .filter(Boolean);
    const secondKeys = new Set([secondUser.id, secondUser.email, secondUser.username].map(normalizeDashboardUserIdentityValue).filter(Boolean));
    return firstKeys.some((key) => secondKeys.has(key));
  }

  function isGenericDashboardChatThreadTitle(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || ["chat", "team chat", "group chat", "direct message", "direct message chat", "private chat", "unknown user"].includes(normalized);
  }

  function getDashboardChatThreadParticipants(threadId, users = getPlatformUsers()) {
    const normalized = normalizeDashboardChatThreadId(threadId);
    const templates = getDashboardChatAdvancedThreadTemplates();
    if (normalized === dashboardChatTeamThreadId || templates.some((template) => template.key === normalized)) {
      return [];
    }
    const dashboardChatApiThreads = getDashboardChatApiThreads();
    const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalized);
    const apiParticipants = Array.isArray(apiThread?.participants) ? apiThread.participants : [];
    if (apiParticipants.length) {
      return apiParticipants
        .map((participant) => {
          const userId = String(participant.userId || participant.id || "").trim();
          const platformUser =
            users.find((user) => user.id === userId) ||
            users.find((user) => isSameDashboardUser(user, participant)) ||
            null;
          return userId || platformUser
            ? {
                ...(platformUser || {}),
                ...participant,
                id: userId || platformUser?.id || "",
                userId: userId || platformUser?.id || "",
                name: participant.name || participant.fullName || participant.full_name || platformUser?.name || "",
                firstName: platformUser?.firstName || platformUser?.first_name || participant.firstName || participant.first_name || "",
                lastName: platformUser?.lastName || platformUser?.last_name || participant.lastName || participant.last_name || "",
                email: participant.email || platformUser?.email || "",
                username: participant.username || participant.userName || platformUser?.username || "",
              }
            : null;
        })
        .filter(Boolean);
    }
    const [, firstId = "", secondId = ""] = normalized.split(":");
    const userIds = [firstId, secondId];
    return userIds.map((userId) => users.find((user) => user.id === userId)).filter(Boolean);
  }

  function getDashboardChatThreadLabel(threadId, currentUser, users = getPlatformUsers()) {
    if (threadId === dashboardChatTeamThreadId) {
      return getDashboardChatTeamChatTitle();
    }
    return formatDashboardChatThreadLabel(threadId, currentUser, users);
  }

  function getDashboardChatActiveToastThreadId() {
    return normalizeDashboardChatThreadId(readDashboardChatWidgetState().selectedThreadId, dashboardChatTeamThreadId);
  }

  function readDashboardChatWidgetState() {
    const parsed = safeReadDashboardJson(dashboardChatWidgetStateStorageKey, {
      isOpen: false,
      selectedThreadId: dashboardChatTeamThreadId,
    });
    return {
      isOpen: dashboardChatWidgetSessionOpen,
      selectedThreadId: normalizeDashboardChatThreadId(parsed?.selectedThreadId, dashboardChatTeamThreadId),
    };
  }

  function writeDashboardChatWidgetState(nextState) {
    dashboardChatWidgetSessionOpen = Boolean(nextState?.isOpen);
    safeWriteDashboardJson(dashboardChatWidgetStateStorageKey, {
      isOpen: false,
      selectedThreadId: normalizeDashboardChatThreadId(nextState?.selectedThreadId, dashboardChatTeamThreadId),
    });
  }

  function readDashboardChatWidgetNotificationState() {
    const parsed = safeReadDashboardJson(dashboardChatWidgetNotificationStateStorageKey, {
      enabled: true,
      level: "all",
    });
    const level = ["all", "mentions", "muted"].includes(parsed?.level)
      ? parsed.level
      : parsed?.enabled === false
      ? "muted"
      : "all";
    return {
      enabled: level !== "muted",
      level,
    };
  }

  function writeDashboardChatWidgetNotificationState(nextState) {
    const level = ["all", "mentions", "muted"].includes(nextState?.level)
      ? nextState.level
      : nextState?.enabled === false
      ? "muted"
      : "all";
    safeWriteDashboardJson(dashboardChatWidgetNotificationStateStorageKey, {
      enabled: level !== "muted",
      level,
    });
  }

  function readDashboardChatWidgetNotificationCursor() {
    const parsed = safeReadDashboardJson(dashboardChatWidgetNotificationCursorStorageKey, {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { lastMessageId: "", seenAt: 0, userId: "", threadId: dashboardChatTeamThreadId, threads: {} };
    }
    const fallbackThreadId = normalizeDashboardChatThreadId(parsed.threadId, dashboardChatTeamThreadId);
    const legacyCursor = {
      lastMessageId: String(parsed.lastMessageId || "").trim(),
      seenAt: Number.isFinite(Number(parsed.seenAt)) ? Number(parsed.seenAt) : 0,
      userId: String(parsed.userId || "").trim(),
      threadId: fallbackThreadId,
      messageCreatedAtMs: Number.isFinite(Number(parsed.messageCreatedAtMs)) ? Number(parsed.messageCreatedAtMs) : 0,
    };
    const rawThreads = parsed.threads && typeof parsed.threads === "object" && !Array.isArray(parsed.threads) ? parsed.threads : {};
    const threads = Object.fromEntries(
      Object.entries(rawThreads)
        .map(([threadId, cursor]) => {
          const normalizedThreadId = normalizeDashboardChatThreadId(threadId, "");
          if (!normalizedThreadId || !cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
            return null;
          }
          return [
            normalizedThreadId,
            {
              lastMessageId: String(cursor.lastMessageId || "").trim(),
              seenAt: Number.isFinite(Number(cursor.seenAt)) ? Number(cursor.seenAt) : 0,
              userId: String(cursor.userId || "").trim(),
              threadId: normalizedThreadId,
              messageCreatedAtMs: Number.isFinite(Number(cursor.messageCreatedAtMs)) ? Number(cursor.messageCreatedAtMs) : 0,
            },
          ];
        })
        .filter(Boolean)
    );
    if (legacyCursor.lastMessageId && !threads[legacyCursor.threadId]) {
      threads[legacyCursor.threadId] = legacyCursor;
    }
    return { ...legacyCursor, threads };
  }

  function writeDashboardChatWidgetNotificationCursor(nextCursor) {
    const parsed = safeReadDashboardJson(dashboardChatWidgetNotificationCursorStorageKey, {});
    const previousThreads =
      parsed?.threads && typeof parsed.threads === "object" && !Array.isArray(parsed.threads) ? parsed.threads : {};
    const threadId = normalizeDashboardChatThreadId(nextCursor?.threadId, dashboardChatTeamThreadId);
    const cursor = {
      lastMessageId: String(nextCursor?.lastMessageId || "").trim(),
      seenAt: Number(nextCursor?.seenAt || 0) || 0,
      userId: String(nextCursor?.userId || "").trim(),
      threadId,
      messageCreatedAtMs: Number.isFinite(Number(nextCursor?.messageCreatedAtMs))
        ? Number(nextCursor.messageCreatedAtMs)
        : Number.isFinite(Date.parse(nextCursor?.createdAt || ""))
          ? Date.parse(nextCursor.createdAt)
          : 0,
    };
    const threads = {
      ...previousThreads,
      [threadId]: cursor,
    };
    const trimmedThreads = Object.fromEntries(
      Object.entries(threads)
        .sort(([, first], [, second]) => (Number(second?.seenAt || 0) || 0) - (Number(first?.seenAt || 0) || 0))
        .slice(0, 100)
    );
    safeWriteDashboardJson(dashboardChatWidgetNotificationCursorStorageKey, {
      ...cursor,
      threads: trimmedThreads,
    });
  }

  function getDashboardChatLatestNotificationMessageForThread(threadId, messages = readDashboardMessages()) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const dashboardChatApiThreads = getDashboardChatApiThreads();
    const apiThread = dashboardChatApiThreads.find((thread) => thread.threadId === normalizedThreadId) || null;
    const apiLastMessage = apiThread?.lastMessage ? normalizeDashboardApiMessage(apiThread.lastMessage, apiThread) : null;
    const latestLocalMessage = (Array.isArray(messages) ? messages : [])
      .filter((message) => {
        const status = String(message?.status || "sent").trim().toLowerCase();
        return message?.threadId === normalizedThreadId && message?.id && message?.text && status !== "pending" && status !== "failed" && status !== "deleted";
      })
      .sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || ""))[0] || null;
    return (
      latestLocalMessage ||
      apiLastMessage ||
      (apiThread?.lastMessageId ? { id: apiThread.lastMessageId, userId: "", threadId: normalizedThreadId } : null)
    );
  }

  function markDashboardChatWidgetNotificationSeenForThread(threadId, messages = readDashboardMessages()) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const exactMessage =
      !Array.isArray(messages) &&
      messages?.id &&
      normalizeDashboardChatThreadId(messages.threadId, dashboardChatTeamThreadId) === normalizedThreadId
        ? messages
        : null;
    const latestMessage = exactMessage || getDashboardChatLatestNotificationMessageForThread(normalizedThreadId, messages);
    if (!latestMessage?.id) {
      return;
    }
    writeDashboardChatWidgetNotificationCursor({
      lastMessageId: latestMessage.id,
      seenAt: Date.now(),
      userId: latestMessage.userId,
      threadId: latestMessage.threadId,
      messageCreatedAtMs: getDashboardMessageCreatedAtMs(latestMessage),
    });
  }

  function isDashboardDocumentActivelyViewed() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  function isDashboardChatThreadActivelyViewed(threadId = "") {
    const state = readDashboardChatWidgetState();
    const selectedThreadId = normalizeDashboardChatThreadId(state.selectedThreadId, dashboardChatTeamThreadId);
    const targetThreadId = threadId ? normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId) : selectedThreadId;
    return Boolean(state.isOpen && isDashboardDocumentActivelyViewed() && selectedThreadId === targetThreadId);
  }

  function normalizeDashboardMentionToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9._-]/g, "");
  }

  function getDashboardMentionKeys(user = {}) {
    const emailHandle = String(user.email || "").split("@", 1)[0];
    const fullName = `${user.firstName || ""}.${user.lastName || ""}`;
    return new Set(
      [user.username, emailHandle, user.firstName, user.lastName, fullName, formatUserName(user).replace(/\s+/g, ".")]
        .map(normalizeDashboardMentionToken)
        .filter(Boolean)
    );
  }

  function getDashboardMentionUserIdsForToken(token, users = getPlatformUsers(), authorUserId = "") {
    const normalizedToken = normalizeDashboardMentionToken(token);
    if (!normalizedToken) {
      return [];
    }
    const activeUsers = users.filter((user) => user.status === "active" && user.id !== authorUserId);
    if (["all", "team", "staff", "everyone"].includes(normalizedToken)) {
      return activeUsers.map((user) => user.id);
    }
    return activeUsers.filter((user) => getDashboardMentionKeys(user).has(normalizedToken)).map((user) => user.id);
  }

  function getDashboardMentionUserIds(text, users = getPlatformUsers(), authorUserId = "") {
    const matches = String(text || "").matchAll(/@([a-zA-Z0-9._-]{2,64})/g);
    const mentionedUserIds = new Set();
    for (const match of matches) {
      getDashboardMentionUserIdsForToken(match[1], users, authorUserId).forEach((userId) => mentionedUserIds.add(userId));
    }
    return Array.from(mentionedUserIds);
  }

  const dashboardChatMessageTextRenderer = createMessageTextRenderer({
    escapeHtml,
    getMentionUserIdsForToken: getDashboardMentionUserIdsForToken,
  });

  function renderDashboardMessageText(message, users = getPlatformUsers(), options = {}) {
    return dashboardChatMessageTextRenderer(message, users, options);
  }

  function canPinDashboardChatMessage(user = getCurrentPlatformUser()) {
    const normalizedRole = normalizePlatformRole(user?.role, "");
    return (
      normalizedRole === "admin" ||
      normalizedRole === "coach" ||
      normalizedRole === "club-admin" ||
      normalizedRole === "team-admin"
    );
  }

  function normalizeDashboardChatPriority(value) {
    const priority = String(value || "normal").trim().toLowerCase();
    return dashboardChatPriorityKeys.has(priority) ? priority : "normal";
  }

  function normalizeDashboardReactions(reactions = {}) {
    const normalized = {};
    dashboardChatReactionOptions.forEach((option) => {
      normalized[option.key] = Array.from(
        new Set(
          (Array.isArray(reactions?.[option.key]) ? reactions[option.key] : [])
            .map((userId) => String(userId || "").trim())
            .filter(Boolean)
        )
      );
    });
    return normalized;
  }

  function normalizeDashboardMessageAuthor(author = {}) {
    const id = String(author?.id || "").trim();
    if (!id) {
      return null;
    }
    return {
      id,
      email: String(author?.email || "").toLowerCase(),
      username: String(author?.username || "").trim(),
      firstName: String(author?.firstName || author?.first_name || "").trim(),
      lastName: String(author?.lastName || author?.last_name || "").trim(),
      role: String(author?.role || "coach").trim().toLowerCase(),
      title: String(author?.title || "").trim(),
      department: String(author?.department || "").trim(),
      team: String(author?.team || "").trim(),
      status: String(author?.status || "active").trim().toLowerCase(),
      profileImageUrl: String(author?.profileImageUrl || author?.profile_image_url || "").trim(),
    };
  }

  function normalizeDashboardMessage(message) {
    const currentUser = getCurrentPlatformUser();
    const userId = message?.userId || message?.authorId || message?.senderId || currentUser?.id || "";
    const text = String(message?.text ?? "").trim().slice(0, dashboardChatMaxMessageLength);
    const id = String(message?.id || message?.messageId || "").trim() || createDashboardId("message");
    const clientMessageId = String(
      message?.clientMessageId ||
        message?.client_message_id ||
        message?.metadata?.clientMessageId ||
        message?.metadata?.client_message_id ||
        ""
    ).trim();
    const createdAt = String(message?.createdAt || message?.created_at || "").trim() || new Date().toISOString();
    const readBy = Array.isArray(message?.readBy)
      ? message.readBy.map((userId) => String(userId ?? "").trim()).filter(Boolean)
      : [];
    const mentionedUserIds = Array.isArray(message?.mentionedUserIds)
      ? message.mentionedUserIds.map((userId) => String(userId || "").trim()).filter(Boolean)
      : getDashboardMentionUserIds(text, getPlatformUsers(), userId);
    return {
      id,
      clientMessageId,
      userId,
      threadId: normalizeDashboardChatThreadId(message?.threadId, dashboardChatTeamThreadId),
      text,
      createdAt,
      editedAt: String(message?.editedAt || message?.edited_at || "").trim(),
      deliveredAt: message?.deliveredAt || message?.createdAt || createdAt,
      readBy: Array.from(new Set([userId, ...readBy].filter(Boolean))),
      mentionedUserIds: Array.from(new Set(mentionedUserIds)),
      reactions: normalizeDashboardReactions(message?.reactions),
      replyToId: String(message?.replyToId || "").trim(),
      priority: normalizeDashboardChatPriority(message?.priority),
      pinnedAt: String(message?.pinnedAt || "").trim(),
      pinnedBy: String(message?.pinnedBy || "").trim(),
      author: normalizeDashboardMessageAuthor(message?.author || message?.user || null),
      metadata: message?.metadata && typeof message.metadata === "object" ? message.metadata : {},
      forwardedFromMessageId: String(message?.forwardedFromMessageId || message?.forwarded_from_message_id || message?.metadata?.forwardedFromMessageId || "").trim(),
      forwardedFromThreadId: String(message?.forwardedFromThreadId || message?.forwarded_from_thread_id || message?.metadata?.forwardedFromThreadId || "").trim(),
      attachments: Array.isArray(message?.attachments) ? message.attachments : [],
      status: String(message?.status || "sent").trim().toLowerCase(),
    };
  }

  function getDashboardMessageCreatedAtMs(message = {}) {
    const createdAtMs = Date.parse(message.createdAt || message.created_at || "");
    if (Number.isFinite(createdAtMs)) {
      return createdAtMs;
    }
    const deliveredAtMs = Date.parse(message.deliveredAt || message.delivered_at || "");
    return Number.isFinite(deliveredAtMs) ? deliveredAtMs : 0;
  }

  function compareDashboardChatMessages(first = {}, second = {}) {
    const firstTime = getDashboardMessageCreatedAtMs(first);
    const secondTime = getDashboardMessageCreatedAtMs(second);
    if (firstTime !== secondTime) {
      return firstTime - secondTime;
    }
    const firstId = String(first.id || first.clientMessageId || "");
    const secondId = String(second.id || second.clientMessageId || "");
    return firstId.localeCompare(secondId, undefined, { sensitivity: "base" });
  }

  function getDashboardMessageIdentityKeys(message = {}) {
    return Array.from(
      new Set(
        [
          message.id,
          message.messageId,
          message.clientMessageId,
          message.client_message_id,
          message.metadata?.clientMessageId,
          message.metadata?.client_message_id,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  }

  return {
    normalizeDashboardChatThreadId,
    createDashboardChatThreadId,
    getDashboardChatTeamName,
    getDashboardChatTeamChatTitle,
    formatDashboardChatThreadLabel,
    normalizeDashboardUserIdentityValue,
    isSameDashboardUser,
    isGenericDashboardChatThreadTitle,
    getDashboardChatThreadParticipants,
    getDashboardChatThreadLabel,
    getDashboardChatActiveToastThreadId,
    readDashboardChatWidgetState,
    writeDashboardChatWidgetState,
    readDashboardChatWidgetNotificationState,
    writeDashboardChatWidgetNotificationState,
    readDashboardChatWidgetNotificationCursor,
    writeDashboardChatWidgetNotificationCursor,
    getDashboardChatLatestNotificationMessageForThread,
    markDashboardChatWidgetNotificationSeenForThread,
    isDashboardDocumentActivelyViewed,
    isDashboardChatThreadActivelyViewed,
    normalizeDashboardMentionToken,
    getDashboardMentionKeys,
    getDashboardMentionUserIdsForToken,
    getDashboardMentionUserIds,
    renderDashboardMessageText,
    canPinDashboardChatMessage,
    normalizeDashboardChatPriority,
    normalizeDashboardReactions,
    normalizeDashboardMessageAuthor,
    normalizeDashboardMessage,
    getDashboardMessageCreatedAtMs,
    compareDashboardChatMessages,
    getDashboardMessageIdentityKeys,
  };
}
