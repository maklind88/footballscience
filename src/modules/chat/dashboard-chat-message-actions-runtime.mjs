export function createDashboardChatMessageActionsRuntime(dependencies = {}) {
  const {
    dashboardChatTeamThreadId = "team",
    dashboardChatMaxMessageLength = 1600,
    applyDashboardChatApiPayload = () => {},
    canFallbackDashboardChatApiResult = () => false,
    canPinDashboardChatMessage = () => false,
    createDashboardId = () => `msg-${Date.now()}`,
    getCurrentPlatformUser = () => null,
    getDashboardChatApiUiActions = () => null,
    getDashboardChatThreadLabel = () => "Team",
    getDashboardChatThreadTypeForApi = () => "team",
    getDashboardChatParticipantIdsForApi = () => [],
    getDashboardMentionUserIds = () => [],
    getPlatformUsers = () => [],
    getDashboardChatThreads = () => [],
    setDashboardChatThreads = () => {},
    getDashboardComposerAttachmentDraft = () => null,
    getDashboardChatReplyDraft = () => null,
    getDashboardChatPriorityDraft = () => "normal",
    logDashboardChatApiFailure = () => {},
    getDashboardChatReactionOptions = () => [],
    normalizeDashboardApiMessage = () => ({}),
    normalizeDashboardChatThreadId = (threadId, fallbackThreadId = dashboardChatTeamThreadId) =>
      String(threadId || fallbackThreadId || "").trim() || String(fallbackThreadId || "").trim(),
    normalizeDashboardMessage = (message = {}) => message,
    normalizeDashboardReactions = () => ({}),
    queueDashboardChatThreadSummaryRefresh = () => {},
    readDashboardMessages = () => [],
    rememberDashboardDeletedMessageId = () => {},
    renderDashboardChatWidget = () => {},
    sanitizeDashboardMessageText = (text) => String(text || "").trim(),
    sendDashboardChatApiAction = async () => ({ ok: false }),
    setDashboardChatConfirmAction = () => {},
    setDashboardChatPriorityDraft = () => {},
    setDashboardChatReplyDraft = () => {},
    setDashboardChatComposerAttachmentDraft = () => {},
    showDashboardChatWidgetToast = () => {},
    writeDashboardMessages = () => {},
  } = dependencies;

  const dashboardChatReactionOptions = getDashboardChatReactionOptions();

  const dashboardChatApiReadReceiptSyncSignatures = new Set();

  async function commitDashboardChatApiAction(payload, localCommit) {
    const result = await sendDashboardChatApiAction(payload);
    if (result.ok) {
      applyDashboardChatApiPayload(result.result || {}, {
        threadId: payload?.threadId,
      });
    }
    if (result.ok || canFallbackDashboardChatApiResult(result)) {
      return localCommit(result);
    }
    logDashboardChatApiFailure(payload?.action || "unknown", result);
    return null;
  }

  function createDashboardMessage(text, threadId = dashboardChatTeamThreadId, options = {}) {
    const currentUser = getCurrentPlatformUser();
    const cleanText = sanitizeDashboardMessageText(text);
    if (!currentUser || !cleanText) {
      return null;
    }
    const replyDraft = getDashboardChatReplyDraft();
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const message = normalizeDashboardMessage({
      id: options.id || "",
      clientMessageId: options.clientMessageId || options.id || "",
      threadId: normalizedThreadId,
      text: cleanText,
      userId: currentUser.id,
      readBy: [currentUser.id],
      mentionedUserIds: getDashboardMentionUserIds(cleanText, getPlatformUsers(), currentUser.id),
      replyToId: replyDraft?.threadId === normalizedThreadId ? replyDraft.messageId : "",
      priority: getDashboardChatPriorityDraft(),
      author: currentUser,
      status: options.status || "sent",
    });
    writeDashboardMessages([...readDashboardMessages(), message], {
      skipCentralSync: Boolean(options.skipCentralSync),
    });
    return message;
  }

  function updateDashboardMessageLocalStatus(messageId, status, patch = {}) {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return null;
    }
    let updatedMessage = null;
    writeDashboardMessages(
      readDashboardMessages().map((message) => {
        if (message.id !== normalizedMessageId) {
          return message;
        }
        updatedMessage = normalizeDashboardMessage({ ...message, ...patch, status });
        return updatedMessage;
      }),
      { skipCentralSync: true }
    );
    return updatedMessage;
  }

  async function createDashboardMessageWithApi(text, threadId = dashboardChatTeamThreadId) {
    const currentUser = getCurrentPlatformUser();
    const cleanText = sanitizeDashboardMessageText(text).slice(0, dashboardChatMaxMessageLength);
    if (!currentUser || !cleanText) {
      return null;
    }
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const messageId = createDashboardId("message");
    const replyDraft = getDashboardChatReplyDraft();
    const replyToId = replyDraft?.threadId === normalizedThreadId ? replyDraft.messageId : "";
    const priority = getDashboardChatPriorityDraft();
    const attachmentDraft = getDashboardComposerAttachmentDraft();
    const attachmentIds = attachmentDraft?.id ? [attachmentDraft.id] : [];

    const pendingMessage = createDashboardMessage(cleanText, normalizedThreadId, {
      id: messageId,
      status: "pending",
      skipCentralSync: true,
    });
    renderDashboardChatWidget();

    const result = await sendDashboardChatApiAction({
      action: "sendMessage",
      id: messageId,
      clientMessageId: messageId,
      threadId: normalizedThreadId,
      threadType: getDashboardChatThreadTypeForApi(normalizedThreadId),
      threadTitle: getDashboardChatThreadLabel(normalizedThreadId, currentUser),
      participantIds: getDashboardChatParticipantIdsForApi(normalizedThreadId),
      text: cleanText,
      replyToId,
      priority,
      mentionedUserIds: getDashboardMentionUserIds(cleanText, getPlatformUsers(), currentUser.id),
      attachmentIds,
    });

    setDashboardChatComposerAttachmentDraft(null);
    if (result.ok) {
      applyDashboardChatApiPayload(result.result || {}, { threadId: normalizedThreadId });
      const message = result.result?.message ? normalizeDashboardApiMessage(result.result.message, result.result.thread) : null;
      return message || updateDashboardMessageLocalStatus(messageId, "sent") || pendingMessage;
    }
    if (canFallbackDashboardChatApiResult(result)) {
      return updateDashboardMessageLocalStatus(messageId, "sent") || pendingMessage;
    }
    logDashboardChatApiFailure("sendMessage", result);
    updateDashboardMessageLocalStatus(messageId, "failed");
    showDashboardChatWidgetToast(result.reason || "Message could not be sent.", normalizedThreadId);
    renderDashboardChatWidget();
    return null;
  }

  function retryDashboardMessageWithApi(messageId) {
    const apiActions = getDashboardChatApiUiActions();
    return apiActions?.retryMessageWithApi ? apiActions.retryMessageWithApi(messageId) : Promise.resolve(false);
  }

  function markDashboardChatApiThreadRead(threadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    if (!normalizedThreadId) {
      return;
    }
    const nextThreads = getDashboardChatThreads().map((thread) =>
      thread.threadId === normalizedThreadId
        ? {
            ...thread,
            unreadCount: 0,
            lastReadAt: new Date().toISOString(),
          }
        : thread
    );
    setDashboardChatThreads(nextThreads);
  }

  function queueDashboardChatReadReceiptApiFromPayload(threadId, messages = readDashboardMessages()) {
    const currentUser = getCurrentPlatformUser();
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const latestMessage = [...messages]
      .reverse()
      .find((message) => message.threadId === normalizedThreadId && message.status !== "pending" && message.status !== "failed");
    const currentThreads = getDashboardChatThreads();
    const apiThread = currentThreads.find((thread) => thread.threadId === normalizedThreadId) || null;
    const apiLastMessage = apiThread?.lastMessage ? normalizeDashboardApiMessage(apiThread.lastMessage, apiThread) : null;
    const latestMessageId = String(latestMessage?.id || apiLastMessage?.id || apiThread?.lastMessageId || "").trim();
    if (!currentUser?.id || !latestMessageId) {
      return;
    }
    const signature = `${currentUser.id}:${normalizedThreadId}:${latestMessageId}`;
    if (dashboardChatApiReadReceiptSyncSignatures.has(signature)) {
      return;
    }
    if (dashboardChatApiReadReceiptSyncSignatures.size > 250) {
      dashboardChatApiReadReceiptSyncSignatures.clear();
    }
    dashboardChatApiReadReceiptSyncSignatures.add(signature);
    void sendDashboardChatApiAction({
      action: "markThreadRead",
      threadId: normalizedThreadId,
      lastReadMessageId: latestMessageId,
    }).then((result) => {
      if (result.ok) {
        markDashboardChatApiThreadRead(normalizedThreadId);
        renderDashboardChatWidget();
        return;
      }
      if (!canFallbackDashboardChatApiResult(result)) {
        dashboardChatApiReadReceiptSyncSignatures.delete(signature);
        logDashboardChatApiFailure("markThreadRead", result);
      }
    });
  }

  function markDashboardMessagesReadForCurrentUser(messages = readDashboardMessages(), threadId = null) {
    const currentUser = getCurrentPlatformUser();
    if (!currentUser) {
      return messages;
    }
    const normalizedThreadId = threadId ? normalizeDashboardChatThreadId(threadId, null) : null;
    let changed = false;
    const nextMessages = messages.map((message) => {
      if (normalizedThreadId && message.threadId !== normalizedThreadId) {
        return message;
      }
      if (message.userId === currentUser.id || message.readBy.includes(currentUser.id)) {
        return message;
      }
      changed = true;
      return normalizeDashboardMessage({
        ...message,
        readBy: [...message.readBy, currentUser.id],
      });
    });

    if (changed) {
      writeDashboardMessages(nextMessages);
      if (normalizedThreadId) {
        markDashboardChatApiThreadRead(normalizedThreadId);
        queueDashboardChatReadReceiptApiFromPayload(normalizedThreadId, nextMessages);
      }
    } else if (normalizedThreadId) {
      markDashboardChatApiThreadRead(normalizedThreadId);
      queueDashboardChatReadReceiptApiFromPayload(normalizedThreadId, nextMessages);
    }
    return nextMessages;
  }

  function removeDashboardMessage(messageId, options = {}) {
    rememberDashboardDeletedMessageId(messageId);
    writeDashboardMessages(readDashboardMessages().filter((message) => message.id !== messageId), {
      skipCentralSync: Boolean(options.skipCentralSync),
    });
  }

  async function removeDashboardMessageWithApi(messageId) {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return null;
    }
    const result = await sendDashboardChatApiAction({
      action: "deleteMessage",
      messageId: normalizedMessageId,
    });
    if (result.ok) {
      applyDashboardChatApiPayload(result.result || {}, { threadId: result.result?.thread?.metadata?.legacyThreadId });
      removeDashboardMessage(normalizedMessageId);
      queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
      return true;
    }
    if (result.status === 404) {
      removeDashboardMessage(normalizedMessageId);
      queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
      return true;
    }
    logDashboardChatApiFailure("deleteMessage", result);
    showDashboardChatWidgetToast(result.reason || "Message could not be deleted.");
    return false;
  }

  async function deleteDashboardMessageForMeWithApi(messageId) {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return false;
    }
    const result = await sendDashboardChatApiAction({
      action: "deleteMessageForMe",
      messageId: normalizedMessageId,
    });
    if (result.ok || canFallbackDashboardChatApiResult(result) || result.status === 404) {
      removeDashboardMessage(normalizedMessageId, { skipCentralSync: Boolean(result.ok) });
      queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
      renderDashboardChatWidget();
      return true;
    }
    logDashboardChatApiFailure("deleteMessageForMe", result);
    showDashboardChatWidgetToast(result.reason || "Message could not be deleted for you.");
    return false;
  }

  async function editDashboardMessageWithApi(messageId, nextText) {
    const normalizedMessageId = String(messageId || "").trim();
    const cleanText = sanitizeDashboardMessageText(nextText).slice(0, dashboardChatMaxMessageLength);
    if (!normalizedMessageId || !cleanText) {
      return false;
    }
    const previousMessages = readDashboardMessages();
    let changed = false;
    writeDashboardMessages(previousMessages.map((message) => {
      if (message.id !== normalizedMessageId) {
        return message;
      }
      changed = true;
      return normalizeDashboardMessage({
        ...message,
        text: cleanText,
        editedAt: new Date().toISOString(),
      });
    }), { skipCentralSync: true });
    if (!changed) {
      return false;
    }
    renderDashboardChatWidget();
    const result = await sendDashboardChatApiAction({
      action: "editMessage",
      messageId: normalizedMessageId,
      text: cleanText,
    });
    if (result.ok || canFallbackDashboardChatApiResult(result)) {
      if (result.ok) {
        applyDashboardChatApiPayload(result.result || {}, { threadId: result.result?.thread?.metadata?.legacyThreadId });
      }
      queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
      renderDashboardChatWidget();
      return true;
    }
    writeDashboardMessages(previousMessages, { skipCentralSync: true });
    logDashboardChatApiFailure("editMessage", result);
    showDashboardChatWidgetToast(result.reason || "Message could not be edited.");
    renderDashboardChatWidget();
    return false;
  }

  async function forwardDashboardMessageWithApi(messageId, targetThreadId) {
    const normalizedMessageId = String(messageId || "").trim();
    const normalizedTargetThreadId = normalizeDashboardChatThreadId(targetThreadId, "");
    if (!normalizedMessageId || !normalizedTargetThreadId) {
      return false;
    }
    const targetThread = getDashboardChatThreads().find((thread) => thread.threadId === normalizedTargetThreadId) || null;
    const result = await sendDashboardChatApiAction({
      action: "forwardMessage",
      messageId: normalizedMessageId,
      targetThreadId: normalizedTargetThreadId,
      targetThreadType: getDashboardChatThreadTypeForApi(normalizedTargetThreadId),
      targetThreadTitle: getDashboardChatThreadLabel(normalizedTargetThreadId, getCurrentPlatformUser()),
      participantIds: getDashboardChatParticipantIdsForApi(normalizedTargetThreadId),
    });
    if (result.ok || canFallbackDashboardChatApiResult(result)) {
      if (result.ok) {
        applyDashboardChatApiPayload(result.result || {}, { threadId: normalizedTargetThreadId });
      }
      queueDashboardChatThreadSummaryRefresh({ delayMs: 50 });
      showDashboardChatWidgetToast(`Forwarded to ${targetThread?.label || getDashboardChatThreadLabel(normalizedTargetThreadId, getCurrentPlatformUser())}.`, normalizedTargetThreadId);
      renderDashboardChatWidget();
      return true;
    }
    logDashboardChatApiFailure("forwardMessage", result);
    showDashboardChatWidgetToast(result.reason || "Message could not be forwarded.");
    return false;
  }

  function toggleDashboardMessagePin(messageId, options = {}) {
    const currentUser = getCurrentPlatformUser();
    if (!canPinDashboardChatMessage(currentUser)) {
      return false;
    }
    let changed = false;
    const currentTime = new Date().toISOString();
    const currentUserId = currentUser?.id || "";
    const nextMessages = readDashboardMessages().map((message) => {
      if (message.id !== messageId) {
        return message;
      }
      changed = true;
      return normalizeDashboardMessage({
        ...message,
        pinnedAt: message.pinnedAt ? "" : currentTime,
        pinnedBy: message.pinnedAt ? "" : currentUserId,
      });
    });
    if (changed) {
      writeDashboardMessages(nextMessages, { skipCentralSync: Boolean(options.skipCentralSync) });
    }
    return changed;
  }

  function toggleDashboardMessagePinWithApi(messageId) {
    const normalizedMessageId = String(messageId || "").trim();
    const message = readDashboardMessages().find((candidate) => candidate.id === normalizedMessageId);
    if (!message || !canPinDashboardChatMessage()) {
      return Promise.resolve(false);
    }
    return commitDashboardChatApiAction(
      {
        action: "setMessagePinned",
        messageId: normalizedMessageId,
        pinned: !message.pinnedAt,
      },
      (apiResult) => toggleDashboardMessagePin(normalizedMessageId, { skipCentralSync: Boolean(apiResult?.ok) })
    );
  }

  function toggleDashboardMessageReaction(messageId, reactionKey, options = {}) {
    const currentUser = getCurrentPlatformUser();
    const normalizedReactionKey = dashboardChatReactionOptions.some((option) => option.key === reactionKey) ? reactionKey : "";
    if (!currentUser?.id || !normalizedReactionKey) {
      return false;
    }
    let changed = false;
    const nextMessages = readDashboardMessages().map((message) => {
      if (message.id !== messageId) {
        return message;
      }
      changed = true;
      const reactions = normalizeDashboardReactions(message.reactions);
      const currentSet = new Set(reactions[normalizedReactionKey] || []);
      if (currentSet.has(currentUser.id)) {
        currentSet.delete(currentUser.id);
      } else {
        currentSet.add(currentUser.id);
      }
      reactions[normalizedReactionKey] = Array.from(currentSet);
      return normalizeDashboardMessage({
        ...message,
        reactions,
      });
    });
    if (changed) {
      writeDashboardMessages(nextMessages, { skipCentralSync: Boolean(options.skipCentralSync) });
    }
    return changed;
  }

  function toggleDashboardMessageReactionWithApi(messageId, reactionKey) {
    const currentUser = getCurrentPlatformUser();
    const normalizedMessageId = String(messageId || "").trim();
    const normalizedReactionKey = dashboardChatReactionOptions.some((option) => option.key === reactionKey) ? reactionKey : "";
    const message = readDashboardMessages().find((candidate) => candidate.id === normalizedMessageId);
    if (!currentUser?.id || !normalizedMessageId || !normalizedReactionKey || !message) {
      return Promise.resolve(false);
    }
    const reactions = normalizeDashboardReactions(message.reactions);
    const action = reactions[normalizedReactionKey]?.includes(currentUser.id) ? "removeReaction" : "addReaction";
    return commitDashboardChatApiAction(
      {
        action,
        messageId: normalizedMessageId,
        reaction: normalizedReactionKey,
      },
      (apiResult) =>
        toggleDashboardMessageReaction(normalizedMessageId, normalizedReactionKey, {
          skipCentralSync: Boolean(apiResult?.ok),
        })
    );
  }

  function clearDashboardMessages() {
    writeDashboardMessages([]);
  }

  function clearDashboardMessagesForThread(threadId, options = {}) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    writeDashboardMessages(readDashboardMessages().filter((message) => message.threadId !== normalizedThreadId), {
      skipCentralSync: Boolean(options.skipCentralSync),
    });
  }

  function clearDashboardMessagesForThreadWithApi(threadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    if (!normalizedThreadId) {
      return Promise.resolve(false);
    }
    return commitDashboardChatApiAction(
      {
        action: "clearThread",
        threadId: normalizedThreadId,
      },
      (apiResult) => {
        if (apiResult?.ok || canFallbackDashboardChatApiResult(apiResult)) {
          clearDashboardMessagesForThread(normalizedThreadId, { skipCentralSync: Boolean(apiResult?.ok) });
          return true;
        }
        return false;
      }
    );
  }

  function setDashboardChatReplyDraftAction(messageId, threadId) {
    setDashboardChatReplyDraft(
      messageId
        ? {
            messageId: String(messageId || "").trim(),
            threadId: normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId),
          }
        : null
    );
  }

  function setDashboardChatPriorityDraftAction(priority) {
    setDashboardChatPriorityDraft(priority);
  }

  function setDashboardChatConfirmActionState(action = null) {
    setDashboardChatConfirmAction(
      action
        ? {
            type: String(action.type || "").trim(),
            messageId: String(action.messageId || "").trim(),
            threadId: normalizeDashboardChatThreadId(action.threadId, dashboardChatTeamThreadId),
            title: String(action.title || "Confirm chat action").trim(),
            message: String(action.message || "This action cannot be undone.").trim(),
            confirmLabel: String(action.confirmLabel || "Confirm").trim(),
          }
        : null
    );
  }

  return {
    commitDashboardChatApiAction,
    createDashboardMessage,
    updateDashboardMessageLocalStatus,
    createDashboardMessageWithApi,
    retryDashboardMessageWithApi,
    markDashboardChatApiThreadRead,
    queueDashboardChatReadReceiptApi: queueDashboardChatReadReceiptApiFromPayload,
    markDashboardMessagesReadForCurrentUser,
    removeDashboardMessage,
    removeDashboardMessageWithApi,
    deleteDashboardMessageForMeWithApi,
    editDashboardMessageWithApi,
    forwardDashboardMessageWithApi,
    toggleDashboardMessagePin,
    toggleDashboardMessagePinWithApi,
    toggleDashboardMessageReaction,
    toggleDashboardMessageReactionWithApi,
    clearDashboardMessages,
    clearDashboardMessagesForThread,
    clearDashboardMessagesForThreadWithApi,
    setDashboardChatReplyDraft: setDashboardChatReplyDraftAction,
    setDashboardChatPriorityDraft: setDashboardChatPriorityDraftAction,
    setDashboardChatConfirmAction: setDashboardChatConfirmActionState,
  };
}
