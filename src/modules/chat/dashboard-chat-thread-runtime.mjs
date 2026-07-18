export function createDashboardChatThreadRuntime(dependencies = {}) {
  const {
    dashboardChatAdvancedThreadTemplates = [],
    dashboardChatTeamThreadId = "team",
    dashboardChatThreadSettings = null,
    getCurrentPlatformUser = () => null,
    getDashboardChatApiThreads = () => [],
    getDashboardChatCurrentViewState = () => ({ selectedThreadId: dashboardChatTeamThreadId }),
    getDashboardChatThreadParticipants = () => [],
    getDashboardChatTeamChatTitle = () => "Team Chat",
    getPlatformUsers = () => [],
    isDashboardChatThreadLocallyHidden = () => false,
    isGenericDashboardChatThreadTitle = () => false,
    isSameDashboardUser = () => false,
    normalizeDashboardApiMessage = (message = {}, thread = null) => message,
    normalizeDashboardChatThreadId = (threadId, fallbackThreadId = dashboardChatTeamThreadId) =>
      String(threadId || fallbackThreadId || "").trim() || String(fallbackThreadId).trim() || dashboardChatTeamThreadId,
    formatDashboardChatThreadLabel = () => "",
    createDashboardChatThreadId = () => "",
    readDashboardMessages = () => [],
    readDashboardTasks = () => [],
    readDashboardJson = () => ({}),
    writeDashboardJson = () => {},
    dashboardNotificationSeenStorageKey = "football-dashboard-notification-seen-v1",
    formatUserName = () => "Unknown",
  } = dependencies;
  const advancedThreadTemplates = Array.isArray(dashboardChatAdvancedThreadTemplates)
    ? dashboardChatAdvancedThreadTemplates
    : typeof dashboardChatAdvancedThreadTemplates === "function"
      ? dashboardChatAdvancedThreadTemplates()
      : [];

  function getDashboardChatThreadMessages(messages = readDashboardMessages(), threadId = dashboardChatTeamThreadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    return messages.filter((message) => message.threadId === normalizedThreadId);
  }

  function getDashboardChatNewestThreadMessage(threadMessages = []) {
    return threadMessages.reduce((latestMessage, message) => {
      if (!latestMessage) {
        return message;
      }
      const messageTime = Date.parse(message?.createdAt || "") || 0;
      const latestTime = Date.parse(latestMessage?.createdAt || "") || 0;
      if (messageTime !== latestTime) {
        return messageTime > latestTime ? message : latestMessage;
      }
      const messageId = String(message?.id || "");
      const latestId = String(latestMessage?.id || "");
      return messageId.localeCompare(latestId, undefined, { numeric: true, sensitivity: "base" }) >= 0
        ? message
        : latestMessage;
    }, null);
  }

  function getDashboardChatEmptyThreadActivityMs(apiThread = null, threadSettings = {}) {
    return (
      Date.parse(threadSettings.createdAt || threadSettings.created_at || "") ||
      Date.parse(apiThread?.createdAt || apiThread?.created_at || "") ||
      0
    );
  }

  function isGenericDashboardChatParticipantLabel(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || ["unknown", "unknown user", "staff", "direct message", "private chat"].includes(normalized);
  }

  function isTechnicalDashboardChatIdentityValue(value = "") {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return true;
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      return true;
    }
    if (/^[a-z0-9_-]{18,}$/i.test(normalized) && /\d/.test(normalized)) {
      return true;
    }
    return false;
  }

  function getDashboardChatParticipantDisplayName(participant = null) {
    if (!participant) {
      return "";
    }
    const profile =
      [participant.profile, participant.user, participant.userProfile, participant.user_profile, participant.metadata?.profile, participant.metadata]
        .find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || {};
    const composedName = [
      participant.firstName || participant.first_name || profile.firstName || profile.first_name,
      participant.lastName || participant.last_name || profile.lastName || profile.last_name,
    ]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ");
    if (composedName) {
      return composedName;
    }
    const explicitName = String(
      participant.name ||
        participant.fullName ||
        participant.full_name ||
        participant.displayName ||
        participant.display_name ||
        profile.name ||
        profile.fullName ||
        profile.full_name ||
        profile.displayName ||
        profile.display_name ||
        ""
    ).trim();
    if (explicitName && !isGenericDashboardChatParticipantLabel(explicitName) && !isTechnicalDashboardChatIdentityValue(explicitName)) {
      return explicitName;
    }
    const formattedName = String(formatUserName(participant) || "").trim();
    if (
      formattedName &&
      !isGenericDashboardChatParticipantLabel(formattedName) &&
      !isTechnicalDashboardChatIdentityValue(formattedName)
    ) {
      return formattedName;
    }
    const email = String(participant.email || profile.email || "").trim();
    if (email && !isTechnicalDashboardChatIdentityValue(email.split("@", 1)[0] || email)) {
      return email;
    }
    const username = String(participant.username || participant.userName || profile.username || profile.userName || "").trim();
    return isTechnicalDashboardChatIdentityValue(username) ? "" : username;
  }

  function getDashboardChatThreadData(
    threadId,
    currentUser = getCurrentPlatformUser(),
    users = getPlatformUsers(),
    messages = readDashboardMessages()
  ) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const isTeamThread = normalizedThreadId === dashboardChatTeamThreadId;
    const isManagedThread = advancedThreadTemplates.some((template) => template.key === normalizedThreadId);
    const isGroupThread = normalizedThreadId.startsWith("group-") || normalizedThreadId.startsWith("group:");
    const participants = isTeamThread || isManagedThread
      ? []
      : getDashboardChatThreadParticipants(normalizedThreadId, users).filter((user) => !isSameDashboardUser(user, currentUser));

    const threadMessages = getDashboardChatThreadMessages(messages, normalizedThreadId);
    const unreadCount = currentUser
      ? threadMessages.filter((message) => message.userId !== currentUser.id && !message.readBy.includes(currentUser.id)).length
      : 0;

    const mentionCount = currentUser
      ? threadMessages.filter(
          (message) =>
            message.userId !== currentUser.id && message.mentionedUserIds.includes(currentUser.id) && !message.readBy.includes(currentUser.id)
        ).length
      : 0;

    const apiThreads = getDashboardChatApiThreads().filter(
      (thread) => !thread?.archivedAt && !thread?.archived_at && !isDashboardChatThreadLocallyHidden(thread.threadId)
    );
    const apiThread = apiThreads.find((thread) => thread.threadId === normalizedThreadId) || null;
    const apiLastMessage = apiThread?.lastMessage ? normalizeDashboardApiMessage(apiThread.lastMessage, apiThread) : null;
    const lastMessage = getDashboardChatNewestThreadMessage(threadMessages) || apiLastMessage;
    const effectiveUnreadCount = Math.max(unreadCount, Number(apiThread?.unreadCount || 0) || 0);
    const hasMessageActivity = Boolean(threadMessages.length || apiLastMessage || Number(apiThread?.messageCount || 0) > 0);
    const threadSettings = dashboardChatThreadSettings && dashboardChatThreadSettings.merge
      ? dashboardChatThreadSettings.merge(normalizedThreadId, apiThread?.settings || {})
      : {};

    const lastActivityMs = hasMessageActivity
      ? Math.max(
          Date.parse(lastMessage?.createdAt || "") || 0,
          Date.parse(apiThread?.lastMessageAt || "") || 0
        )
      : getDashboardChatEmptyThreadActivityMs(apiThread, threadSettings);

    const managedTemplate = advancedThreadTemplates.find((template) => template.key === normalizedThreadId);
    const isDirectThread = !isTeamThread && !isManagedThread && normalizedThreadId.startsWith("dm:");
    const fallbackThreadLabel = formatDashboardChatThreadLabel(normalizedThreadId, currentUser, users);
    const apiThreadTitle = String(apiThread?.title || "").trim();
    const shouldUseComputedLabel = isTeamThread || isDirectThread || isGenericDashboardChatThreadTitle(apiThreadTitle);

    const apiParticipants = Array.isArray(apiThread?.participants) ? apiThread.participants : [];
    const resolvedApiParticipants = apiParticipants
      .map((participant) => {
        const userId = String(participant.userId || participant.id || "").trim();
        const platformUser =
          users.find((user) => user.id === userId) ||
          users.find((user) => isSameDashboardUser(user, participant)) ||
          null;
        const participantDisplayName = getDashboardChatParticipantDisplayName(platformUser || participant);
        return {
          ...(platformUser || { id: userId, name: participantDisplayName, firstName: "", lastName: "" }),
          ...participant,
          id: platformUser?.id || userId || "",
          userId: userId || platformUser?.id || "",
          name: participantDisplayName || participant.name || participant.fullName || participant.full_name || platformUser?.name || "",
          firstName: platformUser?.firstName || platformUser?.first_name || participant.firstName || participant.first_name || "",
          lastName: platformUser?.lastName || platformUser?.last_name || participant.lastName || participant.last_name || "",
          chatParticipantRole: participant.participantRole || participant.role || "member",
          lastReadAt: participant.lastReadAt || "",
        };
      })
      .filter((participant) => participant.id);

    const threadParticipants = isTeamThread
      ? users
      : resolvedApiParticipants.length
        ? resolvedApiParticipants
        : participants;
    const currentParticipant = threadParticipants.find((participant) => isSameDashboardUser(participant, currentUser)) || null;
    const currentParticipantRole = String(
      currentParticipant?.chatParticipantRole ||
        currentParticipant?.participantRole ||
        currentParticipant?.participant_role ||
        currentParticipant?.role ||
        ""
    ).trim().toLowerCase();
    const currentUserRole = String(currentUser?.role || "").trim().toLowerCase();
    const isGroupLikeThread = apiThread?.type === "group" || isGroupThread;
    const canManageParticipants = Boolean(
      apiThread?.permissions?.canManageParticipants ||
        (isGroupLikeThread &&
          (currentParticipantRole === "owner" || ["admin", "club-admin", "team-admin", "coach"].includes(currentUserRole)))
    );
    const permissions = {
      canArchiveForMe: !isTeamThread,
      canDeleteForMe: !isTeamThread,
      canBlock: isDirectThread,
      canLeave: isGroupLikeThread,
      ...(apiThread?.permissions || {}),
      ...(canManageParticipants ? { canManageParticipants: true } : {}),
    };
    const directParticipantLabel = isDirectThread
      ? getDashboardChatParticipantDisplayName(threadParticipants.find((participant) => !isSameDashboardUser(participant, currentUser)) || null)
      : "";
    const computedThreadLabel = directParticipantLabel || fallbackThreadLabel;

    return {
      threadId: normalizedThreadId,
      label: threadSettings.customTitle || (shouldUseComputedLabel ? computedThreadLabel : apiThreadTitle),
      isTeamThread,
      type: apiThread?.type || (isGroupThread ? "group" : isManagedThread ? managedTemplate?.type : isTeamThread ? "team" : "dm"),
      participant: threadParticipants.find((participant) => !isSameDashboardUser(participant, currentUser)) || threadParticipants[0] || null,
      participants: threadParticipants,
      permissions,
      messageCount: Math.max(threadMessages.length, apiThread?.messageCount || 0),
      unreadCount: effectiveUnreadCount,
      mentionCount,
      lastMessage,
      lastActivityAt: lastActivityMs ? new Date(lastActivityMs).toISOString() : "",
      apiThread,
      settings: threadSettings,
      avatarUrl: threadSettings.avatarUrl || apiThread?.avatarUrl || "",
    };
  }

  function getDashboardChatThreadList(currentUser = getCurrentPlatformUser(), users = getPlatformUsers(), messages = readDashboardMessages()) {
    if (!currentUser?.id) {
      return [
        {
          threadId: dashboardChatTeamThreadId,
          label: getDashboardChatTeamChatTitle(),
          isTeamThread: true,
          messageCount: 0,
          unreadCount: 0,
          lastMessage: null,
          participant: null,
        },
      ];
    }

    const activeUsers = users.filter((candidate) => candidate.status === "active" && !isSameDashboardUser(candidate, currentUser));
    const threadRows = [getDashboardChatThreadData(dashboardChatTeamThreadId, currentUser, users, messages)];

    const apiThreads = getDashboardChatApiThreads().filter((thread) => !isDashboardChatThreadLocallyHidden(thread.threadId));
    const selectedThreadId = normalizeDashboardChatThreadId(getDashboardChatCurrentViewState?.().selectedThreadId || "", "");
    const selectedGroupThreadIds =
      selectedThreadId &&
      (selectedThreadId.startsWith("group-") || selectedThreadId.startsWith("group:")) &&
      !isDashboardChatThreadLocallyHidden(selectedThreadId)
        ? [selectedThreadId]
        : [];
    const advancedThreadIds = Array.from(
      new Set([
        ...advancedThreadTemplates.map((template) => template.key),
        ...selectedGroupThreadIds,
        ...apiThreads
          .filter((thread) => thread.threadId !== dashboardChatTeamThreadId && !String(thread.threadId).startsWith("dm:"))
          .map((thread) => thread.threadId),
      ])
    );
    const advancedThreads = advancedThreadIds.map((threadId) => getDashboardChatThreadData(threadId, currentUser, users, messages));

    const directThreadIds = Array.from(
      new Set([
        ...activeUsers.map((user) => createDashboardChatThreadId(currentUser.id, user.id)),
        ...apiThreads.filter((thread) => String(thread.threadId || "").startsWith("dm:")).map((thread) => thread.threadId),
        ...messages
          .map((message) => message.threadId)
          .filter((threadId) => String(threadId || "").startsWith("dm:")),
      ])
    );
    const directThreads = directThreadIds.map((threadId) => getDashboardChatThreadData(threadId, currentUser, users, messages));

    const threadTime = (thread) =>
      Date.parse(thread.lastActivityAt || thread.lastMessage?.createdAt || thread.apiThread?.lastMessageAt || thread.apiThread?.createdAt || "") || 0;
    const sortThreads = (first, second) => {
      const firstPinned = Boolean(first.settings?.pinned);
      const secondPinned = Boolean(second.settings?.pinned);
      if (firstPinned !== secondPinned) {
        return firstPinned ? -1 : 1;
      }
      const firstTime = threadTime(first);
      const secondTime = threadTime(second);
      if (firstTime === secondTime) {
        const firstName = getDashboardUserLabel(first.participant?.id, users);
        const secondName = getDashboardUserLabel(second.participant?.id, users);
        return firstName.localeCompare(secondName, undefined, { sensitivity: "base" });
      }
      return secondTime - firstTime;
    };

    advancedThreads.sort(sortThreads);
    directThreads.sort(sortThreads);
    return [...threadRows, ...advancedThreads, ...directThreads].sort(sortThreads);
  }

  function getDashboardChatUnreadCountForCurrentUser(currentUser = getCurrentPlatformUser(), messages = readDashboardMessages()) {
    if (!currentUser?.id) {
      return 0;
    }
    return getDashboardChatThreadList(currentUser, getPlatformUsers(), messages).reduce((total, thread) => total + thread.unreadCount, 0);
  }

  function readDashboardNotificationSeenMap() {
    const parsed = readDashboardJson(dashboardNotificationSeenStorageKey, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function writeDashboardNotificationSeenMap(seenMap) {
    writeDashboardJson(dashboardNotificationSeenStorageKey, seenMap && typeof seenMap === "object" ? seenMap : {});
  }

  function getDashboardNotificationSeenAt(user = getCurrentPlatformUser()) {
    if (!user?.id) {
      return 0;
    }
    const seenAt = readDashboardNotificationSeenMap()[user.id];
    const seenTime = new Date(seenAt || 0).getTime();
    return Number.isFinite(seenTime) ? seenTime : 0;
  }

  function hasDashboardHomeNotifications(user = getCurrentPlatformUser()) {
    if (!user?.id) {
      return false;
    }

    const seenAt = getDashboardNotificationSeenAt(user);
    return (readDashboardTasks() || []).some((task) => {
      const createdAt = new Date(task.createdAt || 0).getTime();
      return (
        task.status === "open" &&
        task.scope === "team" &&
        task.assignedTo === user.id &&
        task.createdBy !== user.id &&
        Number.isFinite(createdAt) &&
        createdAt > seenAt
      );
    });
  }

  function markDashboardHomeSeenForCurrentUser() {
    const user = getCurrentPlatformUser();
    if (!user?.id) {
      return;
    }
    writeDashboardNotificationSeenMap({
      ...readDashboardNotificationSeenMap(),
      [user.id]: new Date().toISOString(),
    });
  }

  function getDashboardUserLabel(userId, users = getPlatformUsers()) {
    const user = users.find((candidate) => candidate.id === userId);
    return user ? formatUserName(user) : "Unknown";
  }

  function getDashboardMessageById(messageId, messages = readDashboardMessages()) {
    return messages.find((message) => message.id === messageId) || null;
  }

  function getDashboardMessageAuthorName(message, users = getPlatformUsers()) {
    const author = users.find((user) => user.id === message?.userId) || message?.author || null;
    return author ? formatUserName(author) : "Staff";
  }

  return {
    getDashboardChatThreadMessages,
    getDashboardChatThreadData,
    getDashboardChatThreadList,
    getDashboardChatUnreadCountForCurrentUser,
    readDashboardNotificationSeenMap,
    writeDashboardNotificationSeenMap,
    getDashboardNotificationSeenAt,
    hasDashboardHomeNotifications,
    markDashboardHomeSeenForCurrentUser,
    getDashboardUserLabel,
    getDashboardMessageById,
    getDashboardMessageAuthorName,
  };
}
