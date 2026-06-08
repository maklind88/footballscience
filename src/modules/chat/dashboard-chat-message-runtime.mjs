export function createDashboardChatMessageRuntime(dependencies = {}) {
  const {
    dashboardChatTeamThreadId = "team",
    dashboardChatStorageKey = "football-dashboard-chat-v1",
    dashboardChatDeletedMessageIdsStorageKey = "football-dashboard-chat-deleted-message-ids-v1",
    normalizeDashboardChatThreadId = (threadId, fallbackThreadId = dashboardChatTeamThreadId) =>
      String(threadId || fallbackThreadId || "").trim() || String(fallbackThreadId || "team").trim(),
    normalizeDashboardMessage = (message = {}) => message,
    normalizeDashboardApiMessage = (message = {}, thread = null) => message,
    getDashboardMessageIdentityKeys = () => [],
    getDashboardMessageCreatedAtMs = () => 0,
    compareDashboardChatMessages = () => 0,
    getDashboardChatRuntimeMessages = () => [],
    setDashboardChatRuntimeMessages = () => {},
    centralStateWriteSuppressionKeys = null,
    readDashboardJson = () => null,
    writeDashboardJson = () => {},
    renderDashboardChatWidget = () => {},
  } = dependencies;

  function isDashboardMessageRememberedDeleted(message = {}, deletedMessageIds = readDashboardDeletedMessageIds()) {
    return getDashboardMessageIdentityKeys(message).some((id) => deletedMessageIds.has(id));
  }

  function mergeDashboardChatMessageRecords(existingMessage, incomingMessage) {
    if (!existingMessage) {
      return normalizeDashboardMessage(incomingMessage);
    }

    const existing = normalizeDashboardMessage(existingMessage);
    const incoming = normalizeDashboardMessage(incomingMessage);
    const incomingIsServerSettled = incoming.status !== "pending" && incoming.status !== "failed";
    const existingIsLocalOnly = existing.status === "pending" || existing.status === "failed";
    const preferIncoming = incomingIsServerSettled && (existingIsLocalOnly || getDashboardMessageCreatedAtMs(incoming) >= getDashboardMessageCreatedAtMs(existing));

    const base = preferIncoming ? existing : incoming;
    const overlay = preferIncoming ? incoming : existing;
    const reactions = mergeDashboardReactions(base.reactions, overlay.reactions);

    return normalizeDashboardMessage({
      ...base,
      ...overlay,
      id: overlay.id || base.id,
      clientMessageId: overlay.clientMessageId || base.clientMessageId,
      readBy: Array.from(new Set([...(base.readBy || []), ...(overlay.readBy || [])].filter(Boolean))),
      mentionedUserIds: Array.from(
        new Set([...(base.mentionedUserIds || []), ...(overlay.mentionedUserIds || [])].filter(Boolean))
      ),
      reactions,
      attachments: overlay.attachments?.length ? overlay.attachments : base.attachments,
      author: overlay.author || base.author,
      status: incomingIsServerSettled ? incoming.status : overlay.status || base.status,
    });
  }

  function mergeDashboardReactions(baseReactions = {}, overlayReactions = {}) {
    const reactions = { ...baseReactions, ...overlayReactions };
    Object.keys(reactions).forEach((key) => {
      const baseUsers = Array.isArray(baseReactions?.[key]) ? baseReactions[key] : [];
      const overlayUsers = Array.isArray(overlayReactions?.[key]) ? overlayReactions[key] : [];
      reactions[key] = Array.from(new Set([...baseUsers, ...overlayUsers].filter(Boolean)));
    });
    return reactions;
  }

  function setDashboardMessageInIdentityMap(messageMap, message) {
    const normalizedMessage = normalizeDashboardMessage(message);
    const identityKeys = getDashboardMessageIdentityKeys(normalizedMessage);
    const existingKey = identityKeys.find((key) => messageMap.has(key));
    const existingMessage = existingKey ? messageMap.get(existingKey) : null;
    const nextMessage = mergeDashboardChatMessageRecords(existingMessage, normalizedMessage);

    if (existingMessage) {
      getDashboardMessageIdentityKeys(existingMessage).forEach((key) => messageMap.delete(key));
    }
    getDashboardMessageIdentityKeys(nextMessage).forEach((key) => messageMap.set(key, nextMessage));
  }

  function getDashboardMessagesFromIdentityMap(messageMap) {
    return Array.from(new Set(messageMap.values())).sort(compareDashboardChatMessages);
  }

  function normalizeDashboardMessageCollection(messages = [], options = {}) {
    const deletedMessageIds = options.deletedMessageIds || readDashboardDeletedMessageIds();
    const messageMap = new Map();
    (Array.isArray(messages) ? messages : []).forEach((sourceMessage) => {
      const message = normalizeDashboardMessage(sourceMessage);
      if (!message.text || !message.userId || isDashboardMessageRememberedDeleted(message, deletedMessageIds)) {
        return;
      }
      setDashboardMessageInIdentityMap(messageMap, message);
    });
    return getDashboardMessagesFromIdentityMap(messageMap);
  }

  function readDashboardDeletedMessageIds() {
    const parsed = readDashboardJson(dashboardChatDeletedMessageIdsStorageKey, []);
    return new Set(Array.isArray(parsed) ? parsed.map((id) => String(id || "").trim()).filter(Boolean) : []);
  }

  function rememberDashboardDeletedMessageId(messageId) {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return;
    }
    const nextIds = [
      normalizedMessageId,
      ...Array.from(readDashboardDeletedMessageIds()).filter((id) => id !== normalizedMessageId),
    ].slice(0, 500);
    writeDashboardJson(dashboardChatDeletedMessageIdsStorageKey, nextIds);
    purgeDashboardDeletedMessagesFromStorage();
  }

  function purgeDashboardDeletedMessagesFromStorage(options = {}) {
    const deletedMessageIds = readDashboardDeletedMessageIds();
    if (!deletedMessageIds.size) {
      return;
    }

    const dashboardChatRuntimeMessages = getDashboardChatRuntimeMessages();
    if (!dashboardChatRuntimeMessages.length) {
      return;
    }

    const nextMessages = dashboardChatRuntimeMessages.filter((message) => {
      const sourceId = String(message?.id || message?.messageId || "").trim();
      const normalizedId = normalizeDashboardMessage(message).id;
      return (
        !deletedMessageIds.has(sourceId) &&
        !deletedMessageIds.has(normalizedId) &&
        !isDashboardMessageRememberedDeleted(message, deletedMessageIds)
      );
    });
    if (nextMessages.length === dashboardChatRuntimeMessages.length) {
      return;
    }
    writeDashboardMessages(nextMessages, {
      skipCentralSync: Boolean(options.skipCentralSync),
    });
  }

  function readDashboardMessages() {
    if (!getDashboardChatRuntimeMessages().length) {
      const parsed = readDashboardJson(dashboardChatStorageKey, []);
      setDashboardChatRuntimeMessages(
        Array.isArray(parsed) ? parsed : Array.isArray(parsed?.messages) ? parsed.messages : []
      );
    }
    const deletedMessageIds = readDashboardDeletedMessageIds();
    return normalizeDashboardMessageCollection(getDashboardChatRuntimeMessages(), { deletedMessageIds });
  }

  function writeDashboardMessages(messages, options = {}) {
    const deletedMessageIds = readDashboardDeletedMessageIds();
    const normalizedMessages = normalizeDashboardMessageCollection(messages, { deletedMessageIds });
    const recentMessages = normalizedMessages.slice(-80);
    const pinnedMessages = normalizedMessages
      .filter((message) => message.pinnedAt && !recentMessages.some((recentMessage) => recentMessage.id === message.id))
      .slice(-20);
    const nextMessages = normalizeDashboardMessageCollection([...pinnedMessages, ...recentMessages], { deletedMessageIds });

    setDashboardChatRuntimeMessages(nextMessages);

    if (centralStateWriteSuppressionKeys?.add && centralStateWriteSuppressionKeys?.delete) {
      centralStateWriteSuppressionKeys.add(dashboardChatStorageKey);
    }
    try {
      writeDashboardJson(dashboardChatStorageKey, nextMessages);
    } finally {
      if (centralStateWriteSuppressionKeys?.delete) {
        centralStateWriteSuppressionKeys.delete(dashboardChatStorageKey);
      }
    }
  }

  function mergeDashboardChatApiMessages(messages = [], options = {}) {
    if (!Array.isArray(messages)) {
      return readDashboardMessages();
    }

    const replaceThreadId = options.replaceThreadId ? normalizeDashboardChatThreadId(options.replaceThreadId, "") : "";
    const messageThread = options.thread || null;
    const existingMessages = readDashboardMessages();
    const existingThreadMessages = replaceThreadId ? existingMessages.filter((message) => message.threadId === replaceThreadId) : [];
    const keepThread = Boolean(options.keepThread);

    const incomingApiMessages = messages.map((sourceMessage) => ({
      sourceMessage,
      message: normalizeDashboardApiMessage(sourceMessage, messageThread),
      sourceMessageId: String(sourceMessage?.id || sourceMessage?.messageId || "").trim(),
      clientMessageId: String(
        sourceMessage?.clientMessageId ||
          sourceMessage?.client_message_id ||
          sourceMessage?.metadata?.clientMessageId ||
          sourceMessage?.metadata?.client_message_id ||
          ""
      ).trim(),
      deletedAt: String(sourceMessage?.deletedAt || sourceMessage?.deleted_at || "").trim(),
    }));

    const incomingIdentityKeys = new Set();
    let incomingMaxCreatedAtMs = 0;
    incomingApiMessages.forEach(({ message, sourceMessageId, clientMessageId }) => {
      [sourceMessageId, clientMessageId, ...getDashboardMessageIdentityKeys(message)].filter(Boolean).forEach((key) =>
        incomingIdentityKeys.add(key)
      );
      incomingMaxCreatedAtMs = Math.max(incomingMaxCreatedAtMs, getDashboardMessageCreatedAtMs(message));
    });

    const recentLocalMessageCutoff = Date.now() - 5 * 60 * 1000;
    const shouldKeepExistingThreadMessage = (message) => {
      if (!replaceThreadId || message.threadId !== replaceThreadId) {
        return true;
      }
      if (message.status === "pending" || message.status === "failed") {
        return true;
      }
      if (getDashboardMessageIdentityKeys(message).some((key) => incomingIdentityKeys.has(key))) {
        return false;
      }
      const createdAtMs = getDashboardMessageCreatedAtMs(message);
      return Boolean(createdAtMs && (createdAtMs >= incomingMaxCreatedAtMs || createdAtMs >= recentLocalMessageCutoff));
    };

    const current = replaceThreadId && !keepThread ? existingMessages.filter(shouldKeepExistingThreadMessage) : existingMessages;

    if (!messages.length) {
      if (replaceThreadId) {
        const hasRecentLocalThreadMessages = existingThreadMessages.some((message) => {
          const createdAtMs = getDashboardMessageCreatedAtMs(message);
          return (
            message.status === "pending" ||
            message.status === "failed" ||
            (Number.isFinite(createdAtMs) && createdAtMs >= recentLocalMessageCutoff)
          );
        });
        const threadStillHasServerActivity = [
          messageThread?.lastMessage,
          messageThread?.last_message,
          messageThread?.last_message_id,
          messageThread?.lastMessageAt,
          messageThread?.last_message_at,
          Number(messageThread?.messageCount || messageThread?.message_count || 0) > 0,
        ].some(Boolean);

        if (hasRecentLocalThreadMessages || threadStillHasServerActivity) {
          return existingMessages;
        }
        writeDashboardMessages(current, { skipCentralSync: true });
        if (options.render !== false) {
          renderDashboardChatWidget();
        }
      }
      return current;
    }

    const byId = new Map();
    current.forEach((message) => {
      if (message.text && message.userId) {
        setDashboardMessageInIdentityMap(byId, message);
      }
    });
    const deletedMessageIds = readDashboardDeletedMessageIds();

    incomingApiMessages.forEach(({ sourceMessageId, clientMessageId, deletedAt, message }) => {
      if (sourceMessageId && deletedAt) {
        rememberDashboardDeletedMessageId(sourceMessageId);
        deletedMessageIds.add(sourceMessageId);
        byId.delete(sourceMessageId);
        if (clientMessageId) {
          rememberDashboardDeletedMessageId(clientMessageId);
          deletedMessageIds.add(clientMessageId);
          byId.delete(clientMessageId);
        }
        return;
      }

      const existingMessage =
        getDashboardMessageIdentityKeys({ ...message, clientMessageId }).map((key) => byId.get(key)).find(Boolean) || null;
      const readBy = existingMessage
        ? Array.from(new Set([...(existingMessage.readBy || []), ...(message.readBy || [])].filter(Boolean)))
        : message.readBy;
      const resolvedMessage = normalizeDashboardMessage({
        ...message,
        clientMessageId: message.clientMessageId || clientMessageId,
        threadId:
          replaceThreadId && message?.threadId !== replaceThreadId ? replaceThreadId : message.threadId,
        readBy,
      });

      if (resolvedMessage?.text && resolvedMessage.userId && !isDashboardMessageRememberedDeleted(resolvedMessage, deletedMessageIds)) {
        setDashboardMessageInIdentityMap(byId, resolvedMessage);
      }
    });

    const mergedMessages = getDashboardMessagesFromIdentityMap(byId);
    writeDashboardMessages(mergedMessages, { skipCentralSync: true });
    if (options.render !== false) {
      renderDashboardChatWidget();
    }
    return mergedMessages;
  }

  return {
    isDashboardMessageRememberedDeleted,
    mergeDashboardChatMessageRecords,
    readDashboardDeletedMessageIds,
    rememberDashboardDeletedMessageId,
    purgeDashboardDeletedMessagesFromStorage,
    readDashboardMessages,
    writeDashboardMessages,
    mergeDashboardChatApiMessages,
  };
}
