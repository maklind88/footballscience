export function createDashboardChatThreadRuntime(dependencies = {}) {
  const {
    dashboardChatAdvancedThreadTemplates = () => [],
    dashboardChatTeamThreadId = "team",
    dashboardChatThreadSettings = null,
    getCurrentPlatformUser = () => null,
    getDashboardChatApiThreads = () => [],
    getDashboardChatCurrentViewState = () => ({ selectedThreadId: dashboardChatTeamThreadId }),
    getDashboardChatThreadParticipants = () => [],
    getDashboardChatTeamChatTitle = () => "Team Chat",
    getPlatformUsers = () => [],
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

  function getDashboardChatThreadMessages(messages = readDashboardMessages(), threadId = dashboardChatTeamThreadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    return messages.filter((message) => message.threadId === normalizedThreadId);
  }

  function getDashboardChatThreadData(
    threadId,
    currentUser = getCurrentPlatformUser(),
    users = getPlatformUsers(),
    messages = readDashboardMessages()
  ) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const isTeamThread = normalizedThreadId === dashboardChatTeamThreadId;
    const isManagedThread = dashboardChatAdvancedThreadTemplates.some((template) => template.key === normalizedThreadId);
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

    const apiThreads = getDashboardChatApiThreads().filter((thread) => !thread?.archivedAt && !thread?.archived_at);
    const apiThread = apiThreads.find((thread) => thread.threadId === normalizedThreadId) || null;
    const apiLastMessage = apiThread?.lastMessage ? normalizeDashboardApiMessage(apiThread.lastMessage, apiThread) : null;
    const lastMessage = threadMessages.length ? threadMessages[threadMessages.length - 1] : apiLastMessage;
    const effectiveUnreadCount = threadMessages.length
      ? unreadCount
      : Number(apiThread?.unreadCount || 0) || 0;
    const hasMessageActivity = Boolean(threadMessages.length || apiLastMessage || Number(apiThread?.messageCount || 0) > 0);
    const threadSettings = dashboardChatThreadSettings && dashboardChatThreadSettings.merge
      ? dashboardChatThreadSettings.merge(normalizedThreadId, apiThread?.settings || {})
      : {};

    const lastActivityMs = hasMessageActivity
      ? Math.max(
          Date.parse(lastMessage?.createdAt || "") || 0,
          Date.parse(apiThread?.lastMessageAt || "") || 0
        )
      : Date.parse(apiThread?.createdAt || threadSettings.createdAt || threadSettings.created_at || "") || 0;

    const managedTemplate = dashboardChatAdvancedThreadTemplates.find((template) => template.key === normalizedThreadId);
    const isDirectThread = !isTeamThread && !isManagedThread && normalizedThreadId.startsWith("dm:");
    const fallbackThreadLabel = formatDashboardChatThreadLabel(normalizedThreadId, currentUser, users);
    const apiThreadTitle = String(apiThread?.title || "").trim();
    const shouldUseComputedLabel = isTeamThread || isDirectThread || isGenericDashboardChatThreadTitle(apiThreadTitle);

    const apiParticipants = Array.isArray(apiThread?.participants) ? apiThread.participants : [];
    const resolvedApiParticipants = apiParticipants
      .map((participant) => {
        const userId = String(participant.userId || participant.id || "").trim();
        const platformUser = users.find((user) => user.id === userId) || null;
        return {
          ...(platformUser || { id: userId, firstName: userId ? "Staff" : "Unknown", lastName: "" }),
          ...participant,
          id: userId || platformUser?.id || "",
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
      ...(apiThread?.permissions || {}),
      ...(canManageParticipants ? { canManageParticipants: true } : {}),
    };

    return {
      threadId: normalizedThreadId,
      label: threadSettings.customTitle || (shouldUseComputedLabel ? fallbackThreadLabel : apiThreadTitle),
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

    const apiThreads = getDashboardChatApiThreads();
    const selectedThreadId = normalizeDashboardChatThreadId(getDashboardChatCurrentViewState?.().selectedThreadId || "", "");
    const selectedGroupThreadIds =
      selectedThreadId && (selectedThreadId.startsWith("group-") || selectedThreadId.startsWith("group:")) ? [selectedThreadId] : [];
    const advancedThreadIds = Array.from(
      new Set([
        ...dashboardChatAdvancedThreadTemplates.map((template) => template.key),
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
      const firstIsSelectedEmptyGroup = first.threadId === selectedThreadId && first.type === "group" && !first.messageCount && !threadTime(first);
      const secondIsSelectedEmptyGroup = second.threadId === selectedThreadId && second.type === "group" && !second.messageCount && !threadTime(second);
      if (firstIsSelectedEmptyGroup !== secondIsSelectedEmptyGroup) {
        return firstIsSelectedEmptyGroup ? -1 : 1;
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
