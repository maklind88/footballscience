function normalizeText(value) {
  return String(value ?? "").trim();
}

function getAttachmentIds(message = {}) {
  return (Array.isArray(message.attachments) ? message.attachments : [])
    .map((attachment) => normalizeText(attachment?.id || attachment?.attachmentId || attachment?.attachment_id))
    .filter(Boolean);
}

export function createDashboardChatApiUiActions(dependencies = {}) {
  const {
    applyApiPayload,
    canFallbackApiResult,
    formatTime = () => "",
    getApiScope = () => ({ organizationId: true }),
    getApiThreads,
    getCurrentUser,
    getMentionUserIds,
    getParticipantIds,
    getRealtimeLastEventAt = () => 0,
    getRealtimeStatus,
    getThreadLabel,
    getThreadType,
    getUsers,
    logApiFailure = () => {},
    maxMessageLength = 1600,
    normalizeThreadId,
    queueThreadSummaryRefresh,
    readMessages,
    renderTopIconMenu = () => {},
    renderWidget,
    sendApiAction,
    settingsStore,
    showToast,
    teamThreadId = "team",
    updateMessageLocalStatus,
  } = dependencies;

  const getNormalizedThreadId = (threadId) =>
    typeof normalizeThreadId === "function" ? normalizeThreadId(threadId, teamThreadId) : normalizeText(threadId || teamThreadId);

  async function setThreadSettingsWithApi(threadId = teamThreadId, patch = {}) {
    const normalizedThreadId = getNormalizedThreadId(threadId);
    const previousStoredSettings = settingsStore.getStored(normalizedThreadId);
    const apiThread = (getApiThreads() || []).find((thread) => thread.threadId === normalizedThreadId) || null;
    const nextSettings = settingsStore.normalize({
      ...settingsStore.merge(normalizedThreadId, apiThread?.settings || {}),
      ...patch,
    });
    settingsStore.update(normalizedThreadId, nextSettings);
    renderWidget();
    const result = await sendApiAction({
      action: "setThreadSettings",
      threadId: normalizedThreadId,
      threadType: getThreadType(normalizedThreadId),
      settings: nextSettings,
    });
    if (result?.ok) {
      applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
      const savedSettings = result.result?.thread?.settings;
      if (savedSettings) {
        settingsStore.write(normalizedThreadId, savedSettings);
      }
      renderWidget();
      return true;
    }
    if (canFallbackApiResult(result)) {
      renderWidget();
      return true;
    }
    if (previousStoredSettings) {
      settingsStore.write(normalizedThreadId, previousStoredSettings);
    } else {
      settingsStore.remove(normalizedThreadId);
    }
    showToast(result?.reason || "Thread settings could not be saved.", normalizedThreadId);
    renderWidget();
    return false;
  }

  function getRealtimeRenderState() {
    const rawStatus = normalizeText(getRealtimeStatus() || "idle").toUpperCase();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { key: "offline", label: "Offline", detail: "No network connection" };
    }
    if (!getApiScope()?.organizationId) {
      return { key: "warming", label: "Syncing", detail: "Preparing secure chat scope" };
    }
    if (rawStatus === "SUBSCRIBED") {
      const lastEventAt = getRealtimeLastEventAt();
      return {
        key: "connected",
        label: "Connected",
        detail: lastEventAt ? `Last event ${formatTime(new Date(lastEventAt).toISOString())}` : "Realtime active",
      };
    }
    if (rawStatus === "CHANNEL_ERROR" || rawStatus === "TIMED_OUT" || rawStatus === "CLOSED") {
      return { key: "reconnecting", label: "Reconnecting", detail: "Realtime is recovering" };
    }
    return { key: "warming", label: "Syncing", detail: rawStatus === "IDLE" ? "Realtime warming up" : `Realtime ${rawStatus.toLowerCase()}` };
  }

  async function retryMessageWithApi(messageId) {
    const currentUser = getCurrentUser();
    const normalizedMessageId = normalizeText(messageId);
    const message = (readMessages() || []).find((candidate) => candidate.id === normalizedMessageId);
    if (!currentUser?.id || !message || message.userId !== currentUser.id) {
      return false;
    }
    const normalizedThreadId = getNormalizedThreadId(message.threadId);
    const cleanText = normalizeText(message.text).slice(0, maxMessageLength);
    if (!cleanText) {
      return false;
    }
    updateMessageLocalStatus(normalizedMessageId, "pending");
    renderWidget();
    const result = await sendApiAction({
      action: "sendMessage",
      id: normalizedMessageId,
      clientMessageId: message.clientMessageId || normalizedMessageId,
      threadId: normalizedThreadId,
      threadType: getThreadType(normalizedThreadId),
      threadTitle: getThreadLabel(normalizedThreadId, currentUser),
      participantIds: getParticipantIds(normalizedThreadId),
      text: cleanText,
      replyToId: message.replyToId || "",
      priority: message.priority || "normal",
      mentionedUserIds: Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : getMentionUserIds(cleanText, getUsers(), currentUser.id),
      attachmentIds: getAttachmentIds(message),
    });
    if (result.ok || canFallbackApiResult(result)) {
      if (result.ok) {
        applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
        queueThreadSummaryRefresh({ delayMs: 50 });
      }
      updateMessageLocalStatus(normalizedMessageId, "sent");
      renderWidget();
      renderTopIconMenu();
      return true;
    }
    logApiFailure("retryMessage", result);
    updateMessageLocalStatus(normalizedMessageId, "failed");
    showToast(result.reason || "Message could not be sent.", normalizedThreadId);
    renderWidget();
    return false;
  }

  function handleThreadSettingAction(trigger, selectedThreadId = teamThreadId) {
    const threadId = getNormalizedThreadId(trigger?.dataset?.dashboardChatThreadSettingThread || selectedThreadId);
    const action = normalizeText(trigger?.dataset?.dashboardChatThreadSetting);
    const currentSettings = settingsStore.get(threadId);
    if (action === "toggle-mute") {
      void setThreadSettingsWithApi(threadId, { muted: !currentSettings.muted });
      return true;
    }
    if (action === "toggle-pin") {
      void setThreadSettingsWithApi(threadId, { pinned: !currentSettings.pinned });
      return true;
    }
    if (action === "rename") {
      const nextTitle = window.prompt("Rename conversation", currentSettings.customTitle || getThreadLabel(threadId, getCurrentUser()));
      if (nextTitle !== null) {
        void setThreadSettingsWithApi(threadId, { customTitle: normalizeText(nextTitle) });
      }
      return true;
    }
    if (action === "avatar") {
      const nextAvatarLabel = window.prompt("Conversation initials", currentSettings.avatarLabel || "");
      if (nextAvatarLabel !== null) {
        void setThreadSettingsWithApi(threadId, { avatarLabel: normalizeText(nextAvatarLabel).slice(0, 2).toUpperCase() });
      }
      return true;
    }
    return false;
  }

  return Object.freeze({
    getRealtimeRenderState,
    handleThreadSettingAction,
    retryMessageWithApi,
    setThreadSettingsWithApi,
  });
}
