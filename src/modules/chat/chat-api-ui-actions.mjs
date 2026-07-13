import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";

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
    archiveThreadLocal = () => {},
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

  function getThreadParticipantIdsFromApi(threadId = teamThreadId) {
    const normalizedThreadId = getNormalizedThreadId(threadId);
    const apiThread = (getApiThreads() || []).find((thread) => thread.threadId === normalizedThreadId) || null;
    const apiParticipantIds = Array.isArray(apiThread?.participants)
      ? apiThread.participants.map((participant) => normalizeText(participant?.userId || participant?.id || participant)).filter(Boolean)
      : [];
    return Array.from(new Set((apiParticipantIds.length ? apiParticipantIds : getParticipantIds(normalizedThreadId)).filter(Boolean)));
  }

  function resolveUserFromQuery(query = "") {
    const normalizedQuery = normalizeText(query).toLowerCase();
    if (!normalizedQuery) return null;
    return (getUsers() || []).find((user) => {
      const haystack = [
        user.id,
        user.email,
        user.username,
        user.firstName,
        user.lastName,
        `${user.firstName || ""} ${user.lastName || ""}`,
      ].map((part) => normalizeText(part).toLowerCase());
      return haystack.some((part) => part && (part === normalizedQuery || part.includes(normalizedQuery)));
    }) || null;
  }

  async function setThreadParticipantsWithApi(threadId = teamThreadId, participantIds = []) {
    const normalizedThreadId = getNormalizedThreadId(threadId);
    const currentUser = getCurrentUser();
    const nextParticipantIds = Array.from(new Set([currentUser?.id, ...participantIds].map(normalizeText).filter(Boolean)));
    if (nextParticipantIds.length < 2) {
      showToast("A chat needs at least two participants.", normalizedThreadId);
      return false;
    }
    const result = await sendApiAction({
      action: "setThreadParticipants",
      threadId: normalizedThreadId,
      threadType: getThreadType(normalizedThreadId),
      participantIds: nextParticipantIds,
    });
    if (result?.ok) {
      applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
      queueThreadSummaryRefresh({ delayMs: 50 });
      renderWidget();
      return true;
    }
    if (canFallbackApiResult(result)) {
      renderWidget();
      return true;
    }
    showToast(result?.reason || "Participants could not be updated.", normalizedThreadId);
    renderWidget();
    return false;
  }

  async function archiveThreadWithApi(threadId = teamThreadId) {
    const normalizedThreadId = getNormalizedThreadId(threadId);
    const result = await sendApiAction({
      action: "archiveThread",
      threadId: normalizedThreadId,
      threadType: getThreadType(normalizedThreadId),
    });
    if (result?.ok) {
      applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
    }
    if (result?.ok || canFallbackApiResult(result)) {
      archiveThreadLocal(normalizedThreadId, result);
      queueThreadSummaryRefresh({ delayMs: 0, render: true });
      showToast("Group deleted.", teamThreadId);
      renderWidget();
      return true;
    }
    logApiFailure("archiveThread", result);
    showToast(result?.reason || "Group could not be deleted.", normalizedThreadId);
    renderWidget();
    return false;
  }

  async function setThreadUserStateWithApi(threadId = teamThreadId, operation = "") {
    const normalizedThreadId = getNormalizedThreadId(threadId);
    const normalizedOperation = normalizeText(operation).toLowerCase();
    if (!normalizedThreadId || !normalizedOperation) {
      return false;
    }
    const result = await sendApiAction({
      action: "setThreadUserState",
      threadId: normalizedThreadId,
      threadType: getThreadType(normalizedThreadId),
      operation: normalizedOperation,
    });
    if (result?.ok) {
      applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
    }
    if (result?.ok || canFallbackApiResult(result)) {
      if (["archive", "hide", "delete", "block"].includes(normalizedOperation)) {
        archiveThreadLocal(normalizedThreadId, result);
      }
      queueThreadSummaryRefresh({ delayMs: 0, render: true });
      const labels = {
        archive: "Chat archived.",
        hide: "Chat hidden.",
        delete: "Chat deleted for you.",
        block: "Chat blocked.",
        unarchive: "Chat restored.",
        unblock: "Chat unblocked.",
        restore: "Chat restored.",
      };
      showToast(labels[normalizedOperation] || "Chat updated.", teamThreadId);
      renderWidget();
      return true;
    }
    logApiFailure("setThreadUserState", result);
    showToast(result?.reason || "Chat state could not be updated.", normalizedThreadId);
    renderWidget();
    return false;
  }

  async function leaveThreadWithApi(threadId = teamThreadId) {
    const normalizedThreadId = getNormalizedThreadId(threadId);
    const result = await sendApiAction({
      action: "leaveThread",
      threadId: normalizedThreadId,
      threadType: getThreadType(normalizedThreadId),
    });
    if (result?.ok) {
      applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
    }
    if (result?.ok || canFallbackApiResult(result)) {
      archiveThreadLocal(normalizedThreadId, result);
      queueThreadSummaryRefresh({ delayMs: 0, render: true });
      showToast("You left the group.", teamThreadId);
      renderWidget();
      return true;
    }
    logApiFailure("leaveThread", result);
    showToast(result?.reason || "You could not leave this group.", normalizedThreadId);
    renderWidget();
    return false;
  }

  function handleThreadParticipantAction(trigger, selectedThreadId = teamThreadId) {
    const threadId = getNormalizedThreadId(trigger?.dataset?.dashboardChatParticipantThread || selectedThreadId);
    const action = normalizeText(trigger?.dataset?.dashboardChatParticipantAction);
    const currentUser = getCurrentUser();
    const currentIds = getThreadParticipantIdsFromApi(threadId);
    if (action === "add") {
      const query = window.prompt("Add participant by name or email", "");
      if (query === null) return true;
      const user = resolveUserFromQuery(query);
      if (!user?.id) {
        showToast("No matching user found.", threadId);
        return true;
      }
      void setThreadParticipantsWithApi(threadId, [...currentIds, user.id]);
      return true;
    }
    if (action === "remove") {
      const participantId = normalizeText(trigger?.dataset?.dashboardChatParticipantId);
      if (!participantId || participantId === currentUser?.id) {
        showToast("You cannot remove yourself from this chat here.", threadId);
        return true;
      }
      const user = (getUsers() || []).find((candidate) => candidate.id === participantId);
      const label = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "this participant" : "this participant";
      void confirmPlatformAction({
        eyebrow: "Team Room",
        title: "Remove participant?",
        message: `Remove ${label} from this chat?`,
        confirmLabel: "Remove",
        tone: "danger",
        win: window,
      }).then((confirmed) => {
        if (!confirmed) return;
        void setThreadParticipantsWithApi(threadId, currentIds.filter((userId) => userId !== participantId));
      });
      return true;
    }
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

  function getMessageById(messageId = "") {
    const normalizedMessageId = normalizeText(messageId);
    return (readMessages() || []).find((message) => message.id === normalizedMessageId) || null;
  }

  function normalizeActionPriority(value = "") {
    const priority = normalizeText(value).toLowerCase();
    if (priority === "urgent" || priority === "critical" || priority === "high") return "urgent";
    if (priority === "important" || priority === "medium") return "important";
    return "normal";
  }

  async function createActionItemFromMessageWithApi(messageId, source = {}) {
    const message = getMessageById(messageId);
    if (!message?.id) {
      showToast("Message not found.", teamThreadId);
      return false;
    }
    const normalizedThreadId = getNormalizedThreadId(message.threadId);
    const title = normalizeText(source.dashboardChatActionTitle || message.text).slice(0, 240);
    if (!title) {
      showToast("Task title is empty.", normalizedThreadId);
      return false;
    }
    const result = await sendApiAction({
      action: "createActionItem",
      messageId: message.id,
      threadId: normalizedThreadId,
      threadType: getThreadType(normalizedThreadId),
      title,
      priority: normalizeActionPriority(source.dashboardChatActionPriority || message.priority),
      dueLabel: normalizeText(source.dashboardChatActionDueLabel || ""),
      ownerLabel: normalizeText(source.dashboardChatActionOwnerLabel || ""),
      clientActionId: `message:${message.id}`,
      metadata: {
        source: "chat-promote",
        promotedTarget: "task",
      },
    });
    if (result?.ok) {
      applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
      queueThreadSummaryRefresh({ delayMs: 50 });
      showToast(result.result?.duplicate ? "Task already saved." : "Task saved.", normalizedThreadId);
      renderWidget();
      return true;
    }
    logApiFailure("createActionItem", result);
    showToast(result?.reason || "Task could not be saved.", normalizedThreadId);
    renderWidget();
    return false;
  }

  async function updateActionItemStatusWithApi(actionItemId = "", status = "open", threadId = teamThreadId) {
    const normalizedActionItemId = normalizeText(actionItemId);
    const normalizedStatus = normalizeText(status).toLowerCase() === "done" ? "done" : "open";
    const normalizedThreadId = getNormalizedThreadId(threadId || teamThreadId);
    if (!normalizedActionItemId) {
      showToast("Task not found.", normalizedThreadId);
      return false;
    }
    const result = await sendApiAction({
      action: "updateActionItem",
      actionItemId: normalizedActionItemId,
      status: normalizedStatus,
    });
    if (result?.ok) {
      applyApiPayload(result.result || {}, { threadId: normalizedThreadId });
      queueThreadSummaryRefresh({ delayMs: 50 });
      showToast(normalizedStatus === "done" ? "Task done." : "Task reopened.", normalizedThreadId);
      renderWidget();
      return true;
    }
    logApiFailure("updateActionItem", result);
    showToast(result?.reason || "Task could not be updated.", normalizedThreadId);
    renderWidget();
    return false;
  }

  async function retryMessageWithApi(messageId) {
    const currentUser = getCurrentUser();
    const normalizedMessageId = normalizeText(messageId);
    const message = getMessageById(normalizedMessageId);
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
      const nextAvatarValue = window.prompt("Group image URL or initials", currentSettings.avatarUrl || currentSettings.avatarLabel || "");
      if (nextAvatarValue !== null) {
        const cleanValue = normalizeText(nextAvatarValue);
        const patch = /^https?:\/\//i.test(cleanValue)
          ? { avatarUrl: cleanValue, avatarLabel: "" }
          : { avatarLabel: cleanValue.slice(0, 2).toUpperCase(), avatarUrl: "" };
        void setThreadSettingsWithApi(threadId, patch);
      }
      return true;
    }
    return false;
  }

  return Object.freeze({
    getRealtimeRenderState,
    archiveThreadWithApi,
    createActionItemFromMessageWithApi,
    handleThreadParticipantAction,
    handleThreadSettingAction,
    leaveThreadWithApi,
    retryMessageWithApi,
    updateActionItemStatusWithApi,
    setThreadUserStateWithApi,
    setThreadParticipantsWithApi,
    setThreadSettingsWithApi,
  });
}
