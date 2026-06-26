import { createDashboardChatIntelligenceRenderer } from "./chat-intelligence-renderer.mjs";

function defaultEscapeHtml(value) {
  return String(value ?? "");
}

function defaultFormatUserName(user = {}) {
  return [user?.firstName || user?.first_name, user?.lastName || user?.last_name].filter(Boolean).join(" ") || "Staff";
}

function defaultNormalizePriority(value, priorityOptions = []) {
  const priority = String(value || "normal").trim().toLowerCase();
  return priorityOptions.some((option) => option.key === priority) ? priority : "normal";
}

function parseThreadActivityTime(thread = {}) {
  const time = Date.parse(thread.lastActivityAt || thread.lastMessage?.createdAt || thread.apiThread?.lastMessageAt || thread.apiThread?.createdAt || "");
  return Number.isFinite(time) ? time : 0;
}

function dateSeparatorKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateSeparator(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Yesterday";
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

const MESSAGE_GROUP_WINDOW_MS = 15 * 60 * 1000;

function getMessageGroupingAuthorKey(message = {}, currentUser = null) {
  const source = message || {};
  const userId = String(source.userId || source.authorId || source.senderId || "").trim();
  const author = source.author || {};
  const authorId = String(author.id || author.userId || author.user_id || "").trim();
  const currentUserId = String(currentUser?.id || "").trim();
  if (currentUserId && (userId === currentUserId || authorId === currentUserId)) {
    return `self:${currentUserId}`;
  }
  if (userId || authorId) {
    return userId || authorId;
  }
  return [
    author.firstName || author.first_name,
    author.lastName || author.last_name,
    author.email,
    author.username,
  ]
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

function shouldGroupWithPreviousMessage(message = {}, previousMessage = null, currentDateKey = "", previousDateKey = "", currentUser = null) {
  if (!message || !previousMessage) {
    return false;
  }
  if (currentDateKey && previousDateKey && currentDateKey !== previousDateKey) {
    return false;
  }
  const currentAuthorKey = getMessageGroupingAuthorKey(message, currentUser);
  const previousAuthorKey = getMessageGroupingAuthorKey(previousMessage, currentUser);
  if (!currentAuthorKey || currentAuthorKey !== previousAuthorKey) {
    return false;
  }

  const currentTime = Date.parse(message.createdAt || "");
  const previousTime = Date.parse(previousMessage.createdAt || "");
  if (!Number.isFinite(currentTime) || !Number.isFinite(previousTime)) {
    return true;
  }

  return Math.abs(currentTime - previousTime) <= MESSAGE_GROUP_WINDOW_MS;
}

function formatFileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentDraftIcon(attachmentDraft = {}) {
  const mimeType = String(attachmentDraft.metadata?.mimeType || attachmentDraft.mimeType || attachmentDraft.mime_type || "").toLowerCase();
  const fileName = String(attachmentDraft.metadata?.fileName || attachmentDraft.file_name || "").toLowerCase();
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(fileName)) {
    return "IMG";
  }
  if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
    return "PDF";
  }
  if (mimeType.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(fileName)) {
    return "XLS";
  }
  if (mimeType.includes("word") || /\.(docx?|rtf)$/.test(fileName)) {
    return "DOC";
  }
  if (mimeType.startsWith("video/")) {
    return "VID";
  }
  return "FILE";
}

export function renderDashboardChatTextPartWithSearchHighlight(part = "", searchQuery = "", escapeHtml = defaultEscapeHtml) {
  const text = String(part || "");
  const query = String(searchQuery || "").trim();
  if (query.length < 2) {
    return escapeHtml(text).replaceAll("\n", "<br />");
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  let output = "";
  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) {
      output += escapeHtml(text.slice(cursor)).replaceAll("\n", "<br />");
      break;
    }
    output += escapeHtml(text.slice(cursor, matchIndex)).replaceAll("\n", "<br />");
    output += `<mark class="dashboard-chat-search-hit">${escapeHtml(text.slice(matchIndex, matchIndex + query.length)).replaceAll("\n", "<br />")}</mark>`;
    cursor = matchIndex + query.length;
  }
  return output;
}

export function createDashboardChatMessageTextRenderer({ escapeHtml = defaultEscapeHtml, getMentionUserIdsForToken = () => [] } = {}) {
  return function renderDashboardChatMessageText(message, users = [], options = {}) {
    return String(message?.text || "")
      .split(/(@[a-zA-Z0-9._-]{2,64})/g)
      .map((part) => {
        if (!part.startsWith("@") || !getMentionUserIdsForToken(part.slice(1), users, message.userId).length) {
          return renderDashboardChatTextPartWithSearchHighlight(part, options.searchQuery, escapeHtml);
        }
        return `<mark class="dashboard-chat-mention">${escapeHtml(part)}</mark>`;
      })
      .join("");
  };
}

export function renderDashboardChatMessageStatus(message = {}, currentUser = {}, escapeHtml = defaultEscapeHtml) {
  if (message.userId !== currentUser?.id) {
    return "";
  }
  const readCount = (Array.isArray(message?.readBy) ? message.readBy : []).filter((userId) => userId !== currentUser?.id && userId !== message.userId).length;
  const status = String(message?.status || "").trim().toLowerCase();
  const statusKey = status === "failed" || status === "pending" || status === "delivered" ? status : readCount || status === "read" ? "read" : "sent";
  const statusIcon = statusKey === "pending" ? "..." : statusKey === "failed" ? "!" : statusKey === "sent" ? "✓" : "✓✓";
  const statusLabel =
    statusKey === "pending" ? "Sending" : statusKey === "failed" ? "Not sent" : statusKey === "read" ? (readCount ? `Read by ${readCount}` : "Read") : statusKey === "delivered" ? "Delivered" : "Sent";
  return `<div class="dashboard-chat-status is-${statusKey}" title="${escapeHtml(statusLabel)}" aria-label="${escapeHtml(statusLabel)}"><span class="dashboard-chat-check-label" aria-hidden="true">${statusIcon}</span></div>`;
}

function defaultRenderMessageText(message = {}, options = {}, escapeHtml = defaultEscapeHtml) {
  return renderDashboardChatTextPartWithSearchHighlight(message?.text, options.searchQuery, escapeHtml);
}

export function createDashboardChatWidgetRenderer(dependencies = {}) {
  const {
    teamThreadId = "team",
    messageLimit = 50,
    maxMessageLength = 1600,
    groupNameMinLength = 2,
    priorityOptions = [],
    escapeHtml = defaultEscapeHtml,
    formatUserName = defaultFormatUserName,
    formatTime = () => "",
    normalizePriority = (value) => defaultNormalizePriority(value, priorityOptions),
    getPresenceSummary = () => ({ online: 0, away: 0, offline: 0 }),
    getPresenceStatus = () => "offline",
    getPresenceLabel = (status) => String(status || "Offline"),
    renderPresenceAvatar = () => `<span class="dashboard-chat-stack-avatar is-team">T</span>`,
    renderMessageStatus = () => "",
    renderMessageText = (message, _users, options = {}) => defaultRenderMessageText(message, options, escapeHtml),
    renderMessageReactions = () => "",
    renderMessageAttachments = () => "",
    renderReplyReference = () => "",
    renderPinnedMessages = () => "",
    renderTypingIndicator = () => "",
    getPinnedMessagesForThread = () => [],
    getMessageById = (messageId, messages = []) => messages.find((message) => message.id === messageId) || null,
    canDeleteMessage = () => false,
    canPinMessage = () => false,
  } = dependencies;
  const chatIntelligenceRenderer = createDashboardChatIntelligenceRenderer({
    teamThreadId,
    escapeHtml,
    formatUserName,
    formatTime,
    renderPresenceAvatar,
  });
  const {
    renderCoachWorkflowPanel,
    renderConversationIntelligenceRail,
    renderThreadIntelligencePanel,
    renderMessagePromoteActions,
  } = chatIntelligenceRenderer;

  function renderMessagePriority(message, normalizedPriority = "") {
    const priority = normalizedPriority || normalizePriority(message?.priority);
    if (priority === "normal") {
      return "";
    }

    const option = priorityOptions.find((candidate) => candidate.key === priority);
    return `<span class="dashboard-chat-priority is-${escapeHtml(priority)}">${escapeHtml(option?.label || priority)}</span>`;
  }

  function getThreadPreview(thread, users, currentUser) {
    const lastMessage = thread?.lastMessage;
    if (!lastMessage) {
      return thread?.isTeamThread ? "Open team room" : thread?.type === "announcement" ? "Broadcast staff updates" : "Start a conversation";
    }

    const isOwn = lastMessage.userId === currentUser?.id;
    const sender = users.find((user) => user.id === lastMessage.userId);
    const senderName = isOwn ? "You" : (sender || lastMessage.author ? formatUserName(sender || lastMessage.author) : "Staff");
    const normalizedText = String(lastMessage.text || "")
      .replace(/\s+/g, " ")
      .trim();
    const shortText = normalizedText.length > 42 ? `${normalizedText.slice(0, 39).trimEnd()}...` : normalizedText;
    const priority = normalizePriority(lastMessage.priority);
    const priorityOption = priorityOptions.find((option) => option.key === priority);
    const priorityPrefix = priority === "normal" ? "" : `${priorityOption?.label || priority}: `;
    const attachmentCount = getMessageAttachmentCount(lastMessage);
    const attachmentSuffix = attachmentCount
      ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
      : "";
    const previewText = shortText || (attachmentCount ? "Attachment" : "Message");

    return lastMessage.mentionedUserIds?.includes(currentUser?.id)
      ? `${priorityPrefix}Mentioned you: ${previewText}${attachmentSuffix}`
      : `${priorityPrefix}${senderName}: ${previewText}${attachmentSuffix}`;
  }

  function getMessageAttachmentCount(message = {}) {
    return Array.isArray(message?.attachments) ? message.attachments.length : 0;
  }

  function getThreadAttachmentCount(thread = {}) {
    return getMessageAttachmentCount(thread.lastMessage || thread.apiThread?.lastMessage || thread.apiThread?.last_message || null);
  }

  function getThreadKindLabel(thread = {}) {
    if (thread.isTeamThread) {
      return "Team";
    }
    if (thread.participant) {
      return "Direct";
    }
    return {
      group: "Staff",
      medical: "Medical",
      matchday: "Matchday",
      training: "Training",
      announcement: "Announcements",
    }[thread.type] || "Group";
  }

  function getLatestThread(threads = []) {
    return [...threads].sort((first, second) => {
      return parseThreadActivityTime(second) - parseThreadActivityTime(first);
    })[0] ?? null;
  }

  function hasThreadConversationActivity(thread = {}) {
    return Boolean(
      Number(thread.messageCount || 0) > 0 ||
        thread.lastMessage ||
        thread.lastActivityAt ||
        thread.apiThread?.lastMessageAt ||
        thread.apiThread?.last_message_at
    );
  }

  function isOperationalRoomThread(thread = {}) {
    const label = String(thread.label || thread.title || "").toLowerCase();
    const type = String(thread.type || "").toLowerCase();
    return Boolean(
      thread.isTeamThread ||
        ["group", "medical", "matchday", "training", "announcement"].includes(type) ||
        (!thread.participant && /\b(room|announcements?|matchday|training|medical|staff|team)\b/.test(label))
    );
  }

  function shouldShowThreadInSimpleInbox(thread = {}, activeThreadId = teamThreadId) {
    if (!thread?.threadId) {
      return false;
    }
    return Boolean(
      thread.threadId === activeThreadId ||
        Number(thread.unreadCount || 0) > 0 ||
        Number(thread.mentionCount || 0) > 0 ||
        thread.settings?.pinned ||
        hasThreadConversationActivity(thread) ||
        isOperationalRoomThread(thread)
    );
  }

  function getSimpleInboxThreads(threads = [], activeThreadId = teamThreadId) {
    return threads.filter((thread) => shouldShowThreadInSimpleInbox(thread, activeThreadId));
  }

  function getThreadStatus(thread, users = []) {
    if (thread?.isTeamThread) {
      const summary = getPresenceSummary(users);
      if (summary.online || summary.away) {
        return `${summary.online} online${summary.away ? ` \u00b7 ${summary.away} passive` : ""}`;
      }
      return `${users.length} staff`;
    }

    if (!thread?.participant) {
      return {
        group: "staff group",
        medical: "medical staff",
        matchday: "matchday",
        training: "training",
        announcement: "announcements",
      }[thread?.type] || "staff thread";
    }

    return getPresenceLabel(getPresenceStatus(thread?.participant?.id));
  }

  function getNormalizedThreadFilter(value = "") {
    const filter = String(value || "all").trim().toLowerCase();
    return ["all", "unread", "mentions", "pinned"].includes(filter) ? filter : "all";
  }

  function doesThreadMatchFilter(thread = {}, filter = "all") {
    const normalizedFilter = getNormalizedThreadFilter(filter);
    if (normalizedFilter === "unread") {
      return Number(thread.unreadCount || 0) > 0;
    }
    if (normalizedFilter === "mentions") {
      return Number(thread.mentionCount || 0) > 0;
    }
    if (normalizedFilter === "pinned") {
      return Boolean(thread.settings?.pinned);
    }
    return true;
  }

  function getThreadFilterCounts(threads = []) {
    return {
      all: threads.length,
      unread: threads.filter((thread) => doesThreadMatchFilter(thread, "unread")).length,
      mentions: threads.filter((thread) => doesThreadMatchFilter(thread, "mentions")).length,
      pinned: threads.filter((thread) => doesThreadMatchFilter(thread, "pinned")).length,
    };
  }

  function renderThreadFilters(activeFilter = "all", threads = []) {
    const normalizedFilter = getNormalizedThreadFilter(activeFilter);
    const counts = getThreadFilterCounts(threads);
    const filters = [
      { key: "all", label: "All" },
      { key: "unread", label: "Unread" },
      { key: "mentions", label: "Mentions" },
      { key: "pinned", label: "Pinned" },
    ];

    return `
      <div class="dashboard-chat-thread-filters" role="toolbar" aria-label="Filter chat conversations" data-dashboard-chat-thread-filters>
        ${filters
          .map((filter) => {
            const isActive = filter.key === normalizedFilter;
            const count = counts[filter.key] || 0;
            return `
              <button
                type="button"
                class="${isActive ? "is-active" : ""}"
                data-dashboard-chat-thread-filter="${escapeHtml(filter.key)}"
                aria-pressed="${isActive}"
              >
                <span>${escapeHtml(filter.label)}</span>
                <small>${escapeHtml(String(count))}</small>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderThreadFilterEmpty(activeFilter = "all") {
    const labels = {
      unread: "No unread conversations",
      mentions: "No mentions right now",
      pinned: "No pinned conversations",
      all: "No relevant conversations yet",
    };
    const detail = {
      unread: "Everything is caught up.",
      mentions: "No one needs your attention.",
      pinned: "Pin key rooms from conversation details.",
      all: "Team rooms, active chats and unread conversations will appear here.",
    };
    const filter = getNormalizedThreadFilter(activeFilter);
    return `
      <div class="dashboard-chat-thread-empty" role="status">
        <strong>${escapeHtml(labels[filter] || labels.all)}</strong>
        <small>${escapeHtml(detail[filter] || detail.all)}</small>
      </div>
    `;
  }

  function renderAvatarStack(users = [], className = "dashboard-chat-avatar-stack") {
    const visibleUsers = users.filter(Boolean).slice(0, 3);
    if (!visibleUsers.length) {
      return `
      <span class="${className}" aria-hidden="true">
        <span class="dashboard-chat-stack-avatar is-team">T</span>
      </span>
    `;
    }

    return `
    <span class="${className}" aria-hidden="true">
      ${visibleUsers.map((user) => renderPresenceAvatar(user, "dashboard-chat-stack-avatar")).join("")}
    </span>
  `;
  }

  function getThreadAvatarLabel(thread = null) {
    const threadSettings = thread?.settings || {};
    const configuredLabel = String(threadSettings.avatarLabel || "").trim();
    if (configuredLabel) {
      return configuredLabel.slice(0, 2).toUpperCase();
    }
    const words = String(thread?.label || "Chat")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const initials = words.slice(0, 2).map((word) => word[0]).join("");
    return (initials || "C").slice(0, 2).toUpperCase();
  }

  function renderThreadAvatarStack(thread = null, users = []) {
    if (!thread || thread.isTeamThread || thread.type === "dm") {
      return renderAvatarStack(users);
    }
    const threadSettings = thread.settings || {};
    const avatarUrl = threadSettings.avatarUrl || thread.avatarUrl || "";
    const avatarLabel = getThreadAvatarLabel(thread);
    return `
      <span class="dashboard-chat-avatar-stack" aria-hidden="true">
        ${
          avatarUrl
            ? `<span class="dashboard-chat-stack-avatar is-team has-photo"><img src="${escapeHtml(avatarUrl)}" alt=""></span>`
            : `<span class="dashboard-chat-stack-avatar is-team">${escapeHtml(avatarLabel)}</span>`
        }
      </span>
    `;
  }

  function renderMessage(message, users, currentUser, options = {}) {
    const isOwn = message.userId === currentUser?.id;
    const isMentioned = !isOwn && message.mentionedUserIds.includes(currentUser?.id);
    const isGroupedWithPrevious = Boolean(options.groupedWithPrevious);
    const isGroupedWithNext = Boolean(options.groupedWithNext);
    const searchQuery = String(options.searchQuery || "").trim();
    const isTextSearchMatch = Boolean(searchQuery && String(message.text || "").toLowerCase().includes(searchQuery.toLowerCase()));
    const isActiveSearchMatch = Boolean(searchQuery && options.activeSearchMatchId && String(message.id) === String(options.activeSearchMatchId));
    const isSearchMatch = Boolean(isTextSearchMatch || isActiveSearchMatch);
    const messageStatus = String(message.status || "sent").trim().toLowerCase().replace(/[^a-z-]/g, "");
    const normalizedPriority = normalizePriority(message?.priority);
    const user = users.find((candidate) => candidate.id === message.userId) ?? message.author ?? null;
    const userName = user ? formatUserName(user) : "Unknown";
    const avatarMarkup = user
      ? renderPresenceAvatar(user, "dashboard-chat-avatar")
      : `<span class="dashboard-chat-avatar" aria-hidden="true">?</span>`;
    const statusMarkup = isOwn && !isGroupedWithNext ? renderMessageStatus(message, users, currentUser) : "";
    const canDeleteChat = canDeleteMessage(currentUser);
    const canPinChat = canPinMessage(currentUser);
    const canRetryMessage = isOwn && messageStatus === "failed";
    const pinLabel = message.pinnedAt ? "Unpin" : "Pin";
    const replyMessage = message.replyToId ? getMessageById(message.replyToId) : null;
    const replyMarkup = replyMessage ? renderReplyReference(replyMessage, users, { compact: true }) : "";
    const priorityMarkup = "";
    const reactionMarkup = renderMessageReactions(message, currentUser);
    const workflowBadgeMarkup = "";
    const promoteActionMarkup = renderMessagePromoteActions(message);
    const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
    const cardStateClasses = [
      normalizedPriority && normalizedPriority !== "normal" ? ` is-priority-${escapeHtml(normalizedPriority)}` : "",
      replyMarkup ? " has-reply" : "",
      hasAttachments ? " has-evidence" : "",
      reactionMarkup ? " has-reactions" : "",
    ].join("");
    const timeLabel = formatTime(message.createdAt);
    const metaMarkup = isGroupedWithPrevious
      ? ""
      : `
      <div class="dashboard-chat-meta">
        ${avatarMarkup}
        <span class="dashboard-chat-author">
          <strong>${escapeHtml(userName)}</strong>
          <small>${escapeHtml(timeLabel)}</small>
        </span>
      </div>
    `;
    const bubbleFooterMarkup = timeLabel || statusMarkup
      ? `
        <div class="dashboard-chat-bubble-footer">
          ${timeLabel ? `<time datetime="${escapeHtml(message.createdAt || "")}">${escapeHtml(timeLabel)}</time>` : ""}
          ${statusMarkup}
        </div>
      `
      : "";

    return `
    <article class="dashboard-chat-message${isOwn ? " is-own" : ""}${isMentioned ? " is-mentioned" : ""}${isSearchMatch ? " is-search-match" : ""}${isActiveSearchMatch ? " is-active-search-match" : ""}${message.pinnedAt ? " is-pinned" : ""}${isGroupedWithPrevious ? " is-grouped-with-previous" : ""}${isGroupedWithNext ? " is-grouped-with-next" : ""}${messageStatus ? ` is-${escapeHtml(messageStatus)} is-status-${escapeHtml(messageStatus)}` : ""}${cardStateClasses}" data-dashboard-chat-message-id="${escapeHtml(message.id)}" data-dashboard-chat-message-card${isActiveSearchMatch ? ' data-dashboard-chat-search-active="true"' : ""} aria-label="${escapeHtml(`${userName}${timeLabel ? `, ${timeLabel}` : ""}`)}">
      ${metaMarkup}
      <div class="dashboard-chat-bubble">
        <details class="dashboard-chat-message-menu">
          <summary aria-label="Open message actions">
            <span aria-hidden="true">&#8964;</span>
          </summary>
          <div class="dashboard-chat-message-menu-panel" role="menu">
            <button type="button" class="dashboard-chat-menu-action" data-dashboard-reply-message="${escapeHtml(message.id)}" role="menuitem"><span aria-hidden="true">&#8617;</span><span>Reply</span></button>
            ${
              canRetryMessage
                ? `<button type="button" class="dashboard-chat-menu-action is-primary" data-dashboard-retry-message="${escapeHtml(message.id)}" data-dashboard-chat-message-retry="${escapeHtml(message.id)}" role="menuitem"><span aria-hidden="true">&#8635;</span><span>Retry send</span></button>`
                : ""
            }
            <button type="button" class="dashboard-chat-menu-action" data-dashboard-copy-message="${escapeHtml(message.id)}" role="menuitem"><span aria-hidden="true">&#10697;</span><span>Copy</span></button>
            ${promoteActionMarkup}
            ${
              reactionMarkup
                ? `<div class="dashboard-chat-menu-reaction-group" role="group" aria-label="React to message"><strong>React</strong>${reactionMarkup}</div>`
                : ""
            }
            ${
              canPinChat
                ? `<button type="button" class="dashboard-chat-menu-action" data-dashboard-toggle-pin-message="${escapeHtml(message.id)}" role="menuitem"><span aria-hidden="true">&#9733;</span><span>${escapeHtml(pinLabel)}</span></button>`
                : ""
            }
            ${
              canDeleteChat
                ? `<button type="button" class="dashboard-chat-menu-action is-danger" data-dashboard-remove-message="${escapeHtml(message.id)}" aria-label="Delete message from ${escapeHtml(userName)}" role="menuitem"><span aria-hidden="true">&#128465;</span><span>Delete</span></button>`
                : ""
            }
          </div>
        </details>
        ${priorityMarkup}
        ${workflowBadgeMarkup}
        ${replyMarkup}
        <p>${renderMessageText(message, users, { searchQuery })}</p>
        ${renderMessageAttachments(message, users)}
        ${bubbleFooterMarkup}
      </div>
    </article>
  `;
  }

  function renderMessagesWithDateSeparators(messages, users, currentUser, options = {}) {
    let previousKey = "";
    let previousMessage = null;
    return messages
      .map((message, index, source) => {
        const currentKey = dateSeparatorKey(message.createdAt);
        const nextMessage = source[index + 1] || null;
        const nextKey = nextMessage ? dateSeparatorKey(nextMessage.createdAt) : "";
        const hasSeparator = Boolean(currentKey && currentKey !== previousKey);
        const separator = hasSeparator
          ? `<div class="dashboard-chat-date-separator"><span>${escapeHtml(formatDateSeparator(message.createdAt))}</span></div>`
          : "";
        const groupedWithPrevious = !hasSeparator && shouldGroupWithPreviousMessage(message, previousMessage, currentKey, previousKey, currentUser);
        const groupedWithNext = shouldGroupWithPreviousMessage(nextMessage, message, nextKey, currentKey, currentUser);
        previousKey = currentKey || previousKey;
        previousMessage = message;
        return `${separator}${renderMessage(message, users, currentUser, { groupedWithPrevious, groupedWithNext, searchQuery: options.searchQuery, activeSearchMatchId: options.activeSearchMatchId })}`;
      })
      .join("");
  }

  function renderThreadItem(thread, currentUser, users, isSelected, isUnread) {
    const threadLabel = thread.isTeamThread ? thread.label || "Team Room" : thread.label;
    const preview = getThreadPreview(thread, users, currentUser);
    const threadStatus = getThreadStatus(thread, users);
    const threadKindLabel = getThreadKindLabel(thread);
    const threadSettings = thread.settings || {};
    const attachmentCount = getThreadAttachmentCount(thread);
    const unreadCount = Number(isUnread || 0) || 0;
    const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);
    const signalMarkup = [
      attachmentCount
        ? `<span class="dashboard-chat-thread-signal is-attachment" title="${escapeHtml(`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`)}" aria-label="${escapeHtml(`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`)}">&#128206;</span>`
        : "",
      threadSettings.pinned ? `<span class="dashboard-chat-thread-signal is-pinned" title="Pinned conversation" aria-label="Pinned conversation">&#9733;</span>` : "",
      threadSettings.muted ? `<span class="dashboard-chat-thread-signal is-muted" title="Muted conversation" aria-label="Muted conversation">&#128263;</span>` : "",
      thread.mentionCount ? `<span class="dashboard-chat-thread-mention-badge" aria-label="Mentioned">@</span>` : "",
      unreadCount ? `<span class="dashboard-chat-thread-unread" aria-label="${escapeHtml(`${unreadLabel} unread message${unreadCount === 1 ? "" : "s"}`)}">${escapeHtml(unreadLabel)}</span>` : "",
    ].filter(Boolean).join("");
    const avatarLabel = threadSettings.avatarLabel || (thread.isTeamThread ? "T" : (threadLabel[0] || "C"));
    const avatarUrl = threadSettings.avatarUrl || thread.avatarUrl || "";
    const avatarMarkup = thread.participant
      ? renderPresenceAvatar(thread.participant, "dashboard-chat-thread-avatar")
      : avatarUrl
        ? `<span class="dashboard-chat-thread-avatar is-team has-photo" aria-hidden="true"><img src="${escapeHtml(avatarUrl)}" alt=""></span>`
        : `<span class="dashboard-chat-thread-avatar is-team" aria-hidden="true">${escapeHtml(avatarLabel)}</span>`;
    const threadTimeSource = thread.lastActivityAt || thread.lastMessage?.createdAt || thread.apiThread?.lastMessageAt || thread.apiThread?.last_message_at || "";
    const threadTime = threadTimeSource ? escapeHtml(formatTime(threadTimeSource)) : "";
    const searchText = `${threadLabel} ${preview} ${threadStatus} ${threadKindLabel}`.toLowerCase();

    return `
    <button
      type="button"
      class="dashboard-chat-thread-item${isSelected ? " is-active" : ""}${unreadCount ? " is-unread" : ""}${thread.mentionCount ? " is-mentioned" : ""}${attachmentCount ? " has-attachment" : ""}${threadSettings.pinned ? " is-thread-pinned" : ""}${threadSettings.muted ? " is-thread-muted" : ""}"
      data-dashboard-chat-thread="${escapeHtml(thread.threadId)}"
      data-dashboard-chat-search="${escapeHtml(searchText)}"
      title="${escapeHtml(`${threadLabel} - ${preview}`)}"
      aria-label="${escapeHtml(`${threadLabel}. ${preview}. ${unreadCount ? `${unreadLabel} unread.` : "No unread messages."}`)}"
    >
      ${avatarMarkup}
      <span class="dashboard-chat-thread-copy">
        <span class="dashboard-chat-thread-row">
          <strong>${escapeHtml(threadLabel)}</strong>
          <small class="dashboard-chat-thread-time${threadTime ? "" : " is-empty"}">${threadTime}</small>
        </span>
        <span class="dashboard-chat-thread-preview-line">
          <small class="dashboard-chat-thread-preview">${escapeHtml(preview)}</small>
        </span>
      </span>
      <span class="dashboard-chat-thread-signals">${signalMarkup}</span>
    </button>
  `;
  }

  function renderConfirmDialog(confirmAction) {
    if (!confirmAction) {
      return "";
    }

    return `
    <div class="dashboard-chat-confirm-backdrop" data-dashboard-chat-confirm-backdrop>
      <section class="dashboard-chat-confirm-card" role="dialog" aria-modal="true" aria-labelledby="dashboardChatConfirmTitle" aria-describedby="dashboardChatConfirmMessage">
        <span class="dashboard-chat-confirm-kicker">Chat safety</span>
        <h3 id="dashboardChatConfirmTitle">${escapeHtml(confirmAction.title)}</h3>
        <p id="dashboardChatConfirmMessage">${escapeHtml(confirmAction.message)}</p>
        <div class="dashboard-chat-confirm-actions">
          <button type="button" class="dashboard-chat-confirm-secondary" data-dashboard-chat-confirm-cancel>Cancel</button>
          <button type="button" class="dashboard-chat-confirm-danger" data-dashboard-chat-confirm-apply>${escapeHtml(confirmAction.confirmLabel)}</button>
        </div>
      </section>
    </div>
  `;
  }

  function renderThreadSettingsDialog(dialog = null, threads = [], users = [], currentUser = null) {
    if (!dialog) {
      return "";
    }

    const type = String(dialog.type || "").trim().toLowerCase();
    const threadId = String(dialog.threadId || teamThreadId).trim() || teamThreadId;
    const activeThread = threads.find((thread) => thread.threadId === threadId) || threads[0] || null;
    const activeThreadLabel = activeThread?.label || "Conversation";
    const settings = activeThread?.settings || {};
    const dialogTitle = type === "avatar" ? "Conversation image" : type === "participants" ? "People" : "Conversation name";
    const dialogDescription = type === "participants"
      ? activeThreadLabel
      : `${activeThreadLabel} settings`;
    const selectedParticipantIds = new Set(
      getThreadDetailParticipants(activeThread, users)
        .map((participant) => String(participant.id || participant.userId || "").trim())
        .filter(Boolean)
    );
    const participantRows = users
      .filter((user) => user?.id && user.id !== currentUser?.id)
      .map((user) => {
        const userName = formatUserName(user);
        const userMeta = user.role || user.teamRole || user.email || "Staff";
        const checked = selectedParticipantIds.has(user.id);
        const search = `${userName} ${userMeta} ${user.email || ""} ${user.username || ""}`.toLowerCase();
        return `
          <label class="dashboard-chat-settings-person" data-dashboard-chat-participant-row data-dashboard-chat-participant-search="${escapeHtml(search)}">
            <input type="checkbox" name="participantIds" value="${escapeHtml(user.id)}" ${checked ? "checked" : ""}>
            ${renderPresenceAvatar(user, "dashboard-chat-settings-avatar")}
            <span>
              <strong>${escapeHtml(userName)}</strong>
              <small>${escapeHtml(userMeta)}</small>
            </span>
          </label>
        `;
      })
      .join("");

    const formMarkup = type === "participants"
      ? `
        <form class="dashboard-chat-settings-form is-participants" data-dashboard-chat-participants-form data-dashboard-chat-thread="${escapeHtml(threadId)}">
          <label class="dashboard-chat-settings-field">
            <span>Find staff</span>
            <input type="search" data-dashboard-chat-participant-filter autocomplete="off" placeholder="Search people">
          </label>
          <div class="dashboard-chat-settings-people" role="group" aria-label="Conversation participants">
            ${participantRows || `<em>No staff available.</em>`}
          </div>
          <footer>
            <button type="button" class="dashboard-chat-settings-secondary" data-dashboard-chat-settings-close>Cancel</button>
            <button type="submit" class="dashboard-chat-settings-primary" data-dashboard-chat-participants-save>Save people</button>
          </footer>
        </form>
      `
      : `
        <form class="dashboard-chat-settings-form" data-dashboard-chat-settings-form data-dashboard-chat-settings-type="${escapeHtml(type === "avatar" ? "avatar" : "rename")}" data-dashboard-chat-thread="${escapeHtml(threadId)}">
          <label class="dashboard-chat-settings-field">
            <span>${escapeHtml(type === "avatar" ? "Image URL or initials" : "Display name")}</span>
            <input
              name="value"
              type="text"
              maxlength="${type === "avatar" ? "800" : "80"}"
              value="${escapeHtml(type === "avatar" ? settings.avatarUrl || settings.avatarLabel || "" : settings.customTitle || activeThreadLabel)}"
              autocomplete="off"
              spellcheck="${type === "avatar" ? "false" : "true"}"
              data-dashboard-chat-settings-input
            >
          </label>
          <footer>
            <button type="button" class="dashboard-chat-settings-secondary" data-dashboard-chat-settings-close>Cancel</button>
            <button type="submit" class="dashboard-chat-settings-primary" data-dashboard-chat-settings-save>Save</button>
          </footer>
        </form>
      `;

    return `
      <div class="dashboard-chat-settings-overlay" data-dashboard-chat-settings-backdrop>
        <section class="dashboard-chat-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboardChatSettingsTitle" aria-describedby="dashboardChatSettingsDescription">
          <header>
            <span>
              <strong id="dashboardChatSettingsTitle">${escapeHtml(dialogTitle)}</strong>
              <small id="dashboardChatSettingsDescription">${escapeHtml(dialogDescription)}</small>
            </span>
            <button type="button" data-dashboard-chat-settings-close aria-label="Close conversation settings">&times;</button>
          </header>
          ${formMarkup}
        </section>
      </div>
    `;
  }

  function getThreadDetailParticipants(thread, users = []) {
    if (!thread) {
      return [];
    }
    if (Array.isArray(thread.participants) && thread.participants.length) {
      return thread.participants;
    }
    if (thread.isTeamThread || !thread.participant) {
      return users;
    }
    return [thread.participant].filter(Boolean);
  }

  function getThreadFiles(messages = [], activeThreadId = teamThreadId) {
    return messages
      .filter((message) => message.threadId === activeThreadId)
      .flatMap((message) =>
        (Array.isArray(message.attachments) ? message.attachments : []).map((attachment) => ({
          attachment,
          message,
        }))
      )
      .slice(-8)
      .reverse();
  }

  function getSafePanelId(value = "") {
    return String(value || "thread").replace(/[^a-zA-Z0-9_-]/g, "-") || "thread";
  }

  function getAttachmentDisplayName(attachment = {}) {
    return String(
      attachment.metadata?.fileName ||
        attachment.metadata?.filename ||
        attachment.fileName ||
        attachment.file_name ||
        attachment.name ||
        "Attachment"
    ).trim();
  }

  function getAttachmentMimeType(attachment = {}) {
    return String(attachment.metadata?.mimeType || attachment.mimeType || attachment.mime_type || "").toLowerCase();
  }

  function getAttachmentLibraryType(attachment = {}) {
    const mimeType = getAttachmentMimeType(attachment);
    const fileName = getAttachmentDisplayName(attachment).toLowerCase();
    if (mimeType.startsWith("image/") || mimeType.startsWith("video/") || /\.(png|jpe?g|webp|gif|svg|mp4|mov|m4v|webm)$/.test(fileName)) {
      return "media";
    }
    if (
      mimeType.includes("pdf") ||
      mimeType.includes("document") ||
      mimeType.includes("spreadsheet") ||
      mimeType.includes("presentation") ||
      /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf)$/.test(fileName)
    ) {
      return "docs";
    }
    return "files";
  }

  function getThreadLinks(messages = [], activeThreadId = teamThreadId) {
    const urlPattern = /\bhttps?:\/\/[^\s<>"']+/gi;
    const seen = new Set();
    return messages
      .filter((message) => message.threadId === activeThreadId)
      .flatMap((message) => Array.from(String(message.text || "").matchAll(urlPattern)).map((match) => String(match[0] || "").replace(/[),.;]+$/, "")))
      .filter((url) => {
        if (!url || seen.has(url)) {
          return false;
        }
        seen.add(url);
        return true;
      })
      .slice(-12)
      .reverse();
  }

  function getLinkLabel(url = "") {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") || url;
    } catch {
      return url;
    }
  }

  function renderAttachmentLibraryItem(entry = {}) {
    const attachment = entry.attachment || {};
    const name = getAttachmentDisplayName(attachment);
    const size = formatFileSize(attachment.metadata?.byteSize || attachment.byte_size || attachment.size);
    const url = attachment.signedUrl || attachment.url || "";
    return `
      <button type="button" data-dashboard-chat-attachment-preview data-dashboard-chat-attachment-url="${escapeHtml(url)}" data-dashboard-chat-attachment-name="${escapeHtml(name)}" data-dashboard-chat-attachment-mime="${escapeHtml(getAttachmentMimeType(attachment))}" ${url ? "" : "disabled"}>
        <span>${escapeHtml(getAttachmentDraftIcon(attachment))}</span>
        <small>${escapeHtml(name)}${size ? ` · ${escapeHtml(size)}` : ""}</small>
      </button>
    `;
  }

  function renderLinkLibraryItem(url = "") {
    return `
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        <span>LINK</span>
        <small>${escapeHtml(getLinkLabel(url))}</small>
      </a>
    `;
  }

  function renderLibraryPanel(section) {
    return `
      <div class="dashboard-chat-library-panel is-${escapeHtml(section.key)}">
        ${
          section.items.length
            ? section.items.map((item) => (section.key === "links" ? renderLinkLibraryItem(item) : renderAttachmentLibraryItem(item))).join("")
            : `<em>No ${escapeHtml(section.label.toLowerCase())} yet.</em>`
        }
      </div>
    `;
  }

  function renderAttachmentLibrary(messages = [], activeThreadId = teamThreadId) {
    const attachments = getThreadFiles(messages, activeThreadId);
    const links = getThreadLinks(messages, activeThreadId);
    const sections = [
      { key: "media", label: "Media", items: attachments.filter((entry) => getAttachmentLibraryType(entry.attachment) === "media") },
      { key: "docs", label: "Docs", items: attachments.filter((entry) => getAttachmentLibraryType(entry.attachment) === "docs") },
      { key: "links", label: "Links", items: links },
      { key: "files", label: "Files", items: attachments.filter((entry) => getAttachmentLibraryType(entry.attachment) === "files") },
    ];
    const panelId = `dashboardChatLibrary-${getSafePanelId(activeThreadId)}`;
    return `
      <div class="dashboard-chat-attachment-library">
        ${sections
          .map((section, index) => `<input class="dashboard-chat-library-radio is-${escapeHtml(section.key)}" type="radio" id="${escapeHtml(`${panelId}-${section.key}`)}" name="${escapeHtml(panelId)}" ${index === 0 ? "checked" : ""}>`)
          .join("")}
        <div class="dashboard-chat-library-tabs" role="tablist" aria-label="Attachment library">
          ${sections
            .map(
              (section) => `
                <label for="${escapeHtml(`${panelId}-${section.key}`)}">
                  ${escapeHtml(section.label)}
                  <span>${escapeHtml(String(section.items.length))}</span>
                </label>
              `
            )
            .join("")}
        </div>
        <div class="dashboard-chat-library-panels">
          ${sections.map(renderLibraryPanel).join("")}
        </div>
      </div>
    `;
  }

  function renderThreadDetailsPanel({ activeThread, activeThreadId, activeThreadLabel, activeThreadSubLabel, currentUser, users, messages, pinnedMessages, messageSearchQuery = "", searchMatchCount = 0, searchActiveMatchIndex = 0, threadMessageCount = 0 }) {
    const participants = getThreadDetailParticipants(activeThread, users).slice(0, 8);
    const files = getThreadFiles(messages, activeThreadId);
    const links = getThreadLinks(messages, activeThreadId);
    const threadSettings = activeThread?.settings || {};
    const canManageParticipants = Boolean(activeThread?.permissions?.canManageParticipants && !activeThread?.isTeamThread);
    const canManageGroup = Boolean(activeThread && activeThread.type === "group" && canManageParticipants);
    const normalizedSearch = String(messageSearchQuery || "").trim();
    const activeMatchPosition = searchMatchCount ? Math.min(Math.max(Number(searchActiveMatchIndex) || 0, 0), searchMatchCount - 1) + 1 : 0;
    const searchSummary = normalizedSearch
      ? searchMatchCount
        ? `${activeMatchPosition} of ${searchMatchCount} matches in ${threadMessageCount} messages`
        : `No matches in ${threadMessageCount} messages`
      : "Search messages in this conversation";
    const searchNavigationMarkup = normalizedSearch
      ? `
        <div class="dashboard-chat-search-nav" aria-label="Search result navigation">
          <button type="button" data-dashboard-chat-search-step="previous" ${searchMatchCount > 1 ? "" : "disabled"} aria-label="Previous search result">Previous</button>
          <strong>${escapeHtml(searchMatchCount ? `${activeMatchPosition} / ${searchMatchCount}` : "0 / 0")}</strong>
          <button type="button" data-dashboard-chat-search-step="next" ${searchMatchCount > 1 ? "" : "disabled"} aria-label="Next search result">Next</button>
        </div>
      `
      : "";
    return `
      <section class="dashboard-chat-details-panel" aria-label="Conversation details">
        <header>
          <div>
            <span class="dashboard-chat-details-kicker">Conversation</span>
            <strong>${escapeHtml(activeThreadLabel)}</strong>
            <small>${escapeHtml(activeThreadSubLabel)}</small>
          </div>
          <button type="button" data-dashboard-chat-details-close aria-label="Close conversation details">&times;</button>
        </header>
        <div class="dashboard-chat-details-grid">
          <article>
            <span>People</span>
            <strong>${escapeHtml(String(participants.length || (activeThread?.isTeamThread ? users.length : 0)))}</strong>
            <small>${escapeHtml(activeThread?.isTeamThread ? "Team access" : activeThread?.participant ? "Direct chat" : "Group thread")}</small>
          </article>
          <article>
            <span>Pins</span>
            <strong>${escapeHtml(String(pinnedMessages.length))}</strong>
            <small>Important notes</small>
          </article>
          <article>
            <span>Files</span>
            <strong>${escapeHtml(String(files.length + links.length))}</strong>
            <small>Media, docs and links</small>
          </article>
        </div>
        ${renderThreadIntelligencePanel({ activeThreadId, activeThreadLabel, messages, pinnedMessages, users, currentUser })}
        <label class="dashboard-chat-details-search">
          <span>Search conversation</span>
          <input type="search" data-dashboard-chat-message-search value="${escapeHtml(normalizedSearch)}" placeholder="${escapeHtml(`Search ${activeThreadLabel}`)}" autocomplete="off">
          <small>${escapeHtml(searchSummary)}</small>
        </label>
        ${searchNavigationMarkup}
        <div class="dashboard-chat-details-section">
          <strong>Thread settings</strong>
          <div class="dashboard-chat-settings-grid">
            <button type="button" data-dashboard-chat-thread-setting="toggle-mute" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}" class="${threadSettings.muted ? "is-active" : ""}">
              <span>${threadSettings.muted ? "Muted" : "Mute"}</span>
              <small>${threadSettings.muted ? "Notifications paused" : "Pause this chat"}</small>
            </button>
            <button type="button" data-dashboard-chat-thread-setting="toggle-pin" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}" class="${threadSettings.pinned ? "is-active" : ""}">
              <span>${threadSettings.pinned ? "Pinned" : "Pin"}</span>
              <small>${threadSettings.pinned ? "Shown first" : "Keep near top"}</small>
            </button>
            <button type="button" data-dashboard-chat-thread-setting="rename" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}">
              <span>Rename</span>
              <small>${escapeHtml(threadSettings.customTitle || "Set display name")}</small>
            </button>
            <button type="button" data-dashboard-chat-thread-setting="avatar" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}">
              <span>Image</span>
              <small>${escapeHtml(threadSettings.avatarUrl ? "Photo set" : threadSettings.avatarLabel || "Photo or initials")}</small>
            </button>
            ${
              canManageGroup
                ? `<button type="button" class="is-danger" data-dashboard-chat-archive-thread="${escapeHtml(activeThreadId)}">
                    <span>Delete group</span>
                    <small>Remove from chat list</small>
                  </button>`
                : ""
            }
          </div>
        </div>
        <div class="dashboard-chat-details-section">
          <div class="dashboard-chat-details-section-head">
            <strong>Participants</strong>
            ${
              canManageParticipants
                ? `<button type="button" data-dashboard-chat-participant-action="add" data-dashboard-chat-participant-thread="${escapeHtml(activeThreadId)}">Add</button>`
                : ""
            }
          </div>
          <div class="dashboard-chat-details-people">
            ${
              participants.length
                ? participants
                    .map(
                      (participant) => {
                        const participantId = String(participant.id || participant.userId || "").trim();
                        const participantRole = String(participant.chatParticipantRole || participant.participantRole || participant.participant_role || participant.role || "member").trim();
                        const readLabel = participant.lastReadAt ? `Read ${formatTime(participant.lastReadAt)}` : "Not read yet";
                        const canRemoveParticipant = Boolean(canManageParticipants && participantId && participantId !== currentUser?.id && participantRole !== "owner");
                        return `
                        <span>
                          ${renderPresenceAvatar(participant, "dashboard-chat-details-avatar")}
                          <small>
                            <strong>${escapeHtml(formatUserName(participant))}</strong>
                            <em>${escapeHtml(`${participantRole || "member"} · ${readLabel}`)}</em>
                          </small>
                          ${
                            canRemoveParticipant
                              ? `<button type="button" data-dashboard-chat-participant-action="remove" data-dashboard-chat-participant-thread="${escapeHtml(activeThreadId)}" data-dashboard-chat-participant-id="${escapeHtml(participantId)}" aria-label="${escapeHtml(`Remove ${formatUserName(participant)}`)}">&times;</button>`
                              : ""
                          }
                        </span>
                      `;
                      }
                    )
                    .join("")
                : `<em>No participants loaded yet.</em>`
            }
          </div>
        </div>
        <div class="dashboard-chat-details-section">
          <strong>Library</strong>
          ${renderAttachmentLibrary(messages, activeThreadId)}
        </div>
      </section>
    `;
  }

  function resolveReplyDraft(replyDraft, activeThreadId, messages) {
    if (replyDraft?.threadId !== activeThreadId) {
      return { replyDraft: null, activeReplyMessage: null };
    }

    const activeReplyMessage = getMessageById(replyDraft.messageId, messages);
    return activeReplyMessage
      ? { replyDraft, activeReplyMessage }
      : { replyDraft: null, activeReplyMessage: null };
  }

  function render(options = {}) {
    const {
      currentUser,
      users = [],
      notificationState = { enabled: true },
      state = { isOpen: false, selectedThreadId: teamThreadId },
      messages = [],
      threads = [],
      activeThreadId = threads.some((thread) => thread.threadId === state.selectedThreadId)
        ? state.selectedThreadId
        : threads[0]?.threadId || teamThreadId,
      unreadCount = 0,
      detailsOpen = false,
      mobileConversationOpen = true,
      replyDraft = null,
      priorityDraft = "normal",
      confirmAction = null,
      messageSearchQuery = "",
      messageSearchActiveIndex = 0,
      hasOlderMessages = false,
      advancedThreadTemplates = [],
      moderationOpen = false,
      moderationState = { loading: false, audits: [], retentionPolicy: null, error: "" },
      attachmentDraft = null,
      teamChatTitle = "Team Chat",
      groupCreatorOpen = false,
      threadFilter = "all",
      threadSettingsDialog = null,
    } = options;
    const isOpen = Boolean(state.isOpen);
    const activeThread = threads.find((thread) => thread.threadId === activeThreadId);
    const hasThreadMessages = messages.filter((message) => message.threadId === activeThreadId);
    const normalizedMessageSearch = String(messageSearchQuery || "").trim().toLowerCase();
    const searchedMessages = normalizedMessageSearch
      ? hasThreadMessages.filter((message) =>
          `${message.text || ""} ${formatUserName(users.find((user) => user.id === message.userId) || message.author || {})}`
            .toLowerCase()
            .includes(normalizedMessageSearch)
        )
      : hasThreadMessages;
    const searchMatchCount = normalizedMessageSearch ? searchedMessages.length : 0;
    const normalizedSearchActiveIndex = Number.isFinite(Number(messageSearchActiveIndex)) ? Math.trunc(Number(messageSearchActiveIndex)) : 0;
    const searchActiveMatchIndex = normalizedMessageSearch && searchMatchCount
      ? ((normalizedSearchActiveIndex % searchMatchCount) + searchMatchCount) % searchMatchCount
      : 0;
    const activeSearchMatchId = normalizedMessageSearch && searchMatchCount ? searchedMessages[searchActiveMatchIndex]?.id || "" : "";
    const visibleSearchWindowStart = normalizedMessageSearch && searchedMessages.length > messageLimit
      ? Math.max(0, Math.min(searchActiveMatchIndex - Math.floor(messageLimit / 2), searchedMessages.length - messageLimit))
      : Math.max(0, searchedMessages.length - messageLimit);
    const visibleMessages = searchedMessages.slice(visibleSearchWindowStart, visibleSearchWindowStart + messageLimit);
    const pinnedMessages = getPinnedMessagesForThread(messages, activeThreadId);
    const latestThread = threads.find((thread) => thread.unreadCount) || getLatestThread(threads);
    const activeThreadLabel = activeThread?.label || teamChatTitle;
    const activeThreadSubLabel = activeThread
      ? `${getThreadStatus(activeThread, users)} \u00b7 ${activeThread.messageCount} message${activeThread.messageCount === 1 ? "" : "s"}`
      : "No messages";
    const headerParticipants = activeThread?.isTeamThread
      ? users
      : activeThread?.participants?.length
        ? activeThread.participants
        : [activeThread?.participant].filter(Boolean);
    const launcherThread = activeThread || latestThread;
    const launcherParticipants = launcherThread?.isTeamThread
      ? users
      : launcherThread?.participants?.length
        ? launcherThread.participants
        : [launcherThread?.participant].filter(Boolean);
    const launcherLabel = launcherThread?.label || teamChatTitle;
    const launcherUnreadLabel = unreadCount
      ? `, ${unreadCount} unread chat message${unreadCount === 1 ? "" : "s"}`
      : "";
    const launcherPreview = launcherThread ? getThreadPreview(launcherThread, users, currentUser) : "Open team room";
    const teamPresenceLabel = getThreadStatus({ isTeamThread: true }, users);
    const notificationLevel = notificationState.level || (notificationState.enabled ? "all" : "muted");
    const notificationLabel = { all: "All", mentions: "Mentions", muted: "Muted" }[notificationLevel] || "All";
    const groupCreateUsers = users
      .filter((user) => user?.id && user.id !== currentUser?.id)
      .slice(0, 18);
    const normalizedThreadFilter = getNormalizedThreadFilter(threadFilter);
    const simpleInboxThreads = getSimpleInboxThreads(threads, activeThreadId);
    const filteredThreads = normalizedThreadFilter === "all"
      ? simpleInboxThreads
      : threads.filter((thread) => doesThreadMatchFilter(thread, normalizedThreadFilter));
    const threadFilterMarkup = renderThreadFilters(normalizedThreadFilter, simpleInboxThreads);
    const groupCreateMarkup = groupCreateUsers.length
      ? `
          <form class="dashboard-chat-group-create-form" data-dashboard-chat-group-create-form>
            <p class="dashboard-chat-group-create-error" data-dashboard-chat-group-create-error hidden></p>
            <label class="dashboard-chat-group-name">
              <span>Group name</span>
              <input name="title" type="text" minlength="${escapeHtml(groupNameMinLength)}" maxlength="80" placeholder="Example: Match prep" required autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-label="Group name" data-dashboard-chat-group-name-input>
            </label>
            <label class="dashboard-chat-group-avatar-field">
              <span>Group image or initials</span>
              <small id="dashboardChatGroupAvatarHelp">Paste an image URL or type two initials for the group avatar.</small>
              <input name="avatar" type="text" maxlength="800" placeholder="Image URL or initials, e.g. MP" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="Group image URL or initials" aria-describedby="dashboardChatGroupAvatarHelp" data-dashboard-chat-group-avatar-input>
            </label>
            <div class="dashboard-chat-group-title-presets" aria-label="Suggested group names">
              <button type="button" data-dashboard-chat-group-title-preset="Match prep">Match prep</button>
              <button type="button" data-dashboard-chat-group-title-preset="Training staff">Training staff</button>
              <button type="button" data-dashboard-chat-group-title-preset="Medical update">Medical update</button>
            </div>
            <label class="dashboard-chat-group-search">
              <span>Find teammates</span>
              <input type="search" placeholder="Search by name, role or email" autocomplete="off" data-dashboard-chat-group-user-filter>
            </label>
            <div class="dashboard-chat-group-create-status" data-dashboard-chat-group-filter-status aria-live="polite" aria-atomic="true">
              ${escapeHtml(`${groupCreateUsers.length} teammates available · 0 selected`)}
            </div>
            <div class="dashboard-chat-group-selected-people" data-dashboard-chat-group-selected-list hidden aria-live="polite" aria-atomic="true"></div>
            <div class="dashboard-chat-group-create-users" role="group" aria-label="Choose group members">
              ${groupCreateUsers
                .map((user) => {
                  const userName = formatUserName(user);
                  const userInitial = String(userName || "?").trim().slice(0, 1).toUpperCase() || "?";
                  const userMeta = user.role || user.teamRole || user.email || "Team member";
                  const userDomId = String(user.id || userName || userInitial).trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "member";
                  const userMetaId = `dashboardChatGroupUserMeta-${userDomId}`;
                  const userSearch = `${userName} ${userMeta} ${user.email || ""} ${user.username || ""}`.toLowerCase();
                  return `
                    <label class="dashboard-chat-group-user" data-dashboard-chat-group-user-search="${escapeHtml(userSearch)}">
                      <input
                        type="checkbox"
                        name="participantIds"
                        value="${escapeHtml(user.id)}"
                        aria-label="${escapeHtml(`Add ${userName} (${userMeta}) to group`)}"
                        aria-describedby="${escapeHtml(userMetaId)}"
                        data-dashboard-chat-group-participant-email="${escapeHtml(user.email || "")}"
                        data-dashboard-chat-group-participant-username="${escapeHtml(user.username || "")}"
                        data-dashboard-chat-group-participant-name="${escapeHtml(userName)}"
                      >
                      <span class="dashboard-chat-group-user-avatar">${escapeHtml(userInitial)}</span>
                      <span>
                        <strong>${escapeHtml(userName)}</strong>
                        <small id="${escapeHtml(userMetaId)}">${escapeHtml(userMeta)}</small>
                      </span>
                    </label>
                  `;
                })
                .join("")}
            </div>
            <button type="submit" data-dashboard-chat-group-create-submit disabled aria-disabled="true" aria-label="Create selected group" title="Add a group name with at least 2 characters and choose at least one teammate">Create group</button>
          </form>
        `
      : `
          <div class="dashboard-chat-group-create-empty">
            <strong>No teammates yet</strong>
            <small>Add users before creating a group chat.</small>
          </div>
        `;
    const groupCreateOverlayMarkup = groupCreatorOpen
      ? `
          <div class="dashboard-chat-group-create-overlay" data-dashboard-chat-group-create-backdrop>
            <section id="dashboardChatGroupCreateDialog" class="dashboard-chat-group-create-card" role="dialog" aria-modal="true" aria-keyshortcuts="Escape" aria-labelledby="dashboardChatGroupCreateTitle" aria-describedby="dashboardChatGroupCreateDescription">
              <header>
                <span>
                  <strong id="dashboardChatGroupCreateTitle">New group</strong>
                  <small id="dashboardChatGroupCreateDescription">Choose people, name the room and keep the conversation focused.</small>
                </span>
                <button type="button" class="dashboard-chat-group-create-close" aria-controls="dashboardChatGroupCreateDialog" aria-label="Close new group dialog" title="Close new group dialog" data-dashboard-chat-group-create-close>×</button>
              </header>
              ${groupCreateMarkup}
            </section>
          </div>
        `
      : "";
    const threadPresetMarkup = groupCreateUsers.length
      ? `
          <details class="dashboard-chat-thread-presets" data-dashboard-chat-thread-presets>
            <summary data-dashboard-chat-create-menu-trigger aria-label="Open create chat menu" title="Open create chat menu" aria-haspopup="menu" aria-controls="dashboardChatCreateMenu"><span aria-hidden="true">+</span></summary>
            <div id="dashboardChatCreateMenu" class="dashboard-chat-thread-preset-menu" role="menu" aria-label="Create chat">
              <button type="button" class="dashboard-chat-create-menu-action is-primary" role="menuitem" data-dashboard-chat-open-group-creator aria-haspopup="dialog" aria-controls="dashboardChatGroupCreateDialog">
                <strong>New group</strong>
                <small>Name, avatar and selected teammates</small>
              </button>
            </div>
          </details>
        `
      : "";
    const moderationMarkup = moderationOpen
      ? `
          <section class="dashboard-chat-moderation-panel" aria-label="Chat moderation">
            <div class="dashboard-chat-moderation-head">
              <strong>Moderation</strong>
              <button type="button" data-dashboard-chat-moderation-refresh>${moderationState.loading ? "Loading" : "Refresh"}</button>
            </div>
            <form class="dashboard-chat-moderation-filters" data-dashboard-chat-moderation-filter-form>
              <label>
                <span>Action</span>
                <select name="action">
                  ${[
                    ["all", "All actions"],
                    ["delete", "Delete / clear"],
                    ["failed-uploads", "Failed uploads"],
                    ["destructive", "Destructive"],
                    ["admin", "Admin actions"],
                    ["sendMessage", "Sent messages"],
                    ["setThreadParticipants", "Participants"],
                    ["setThreadSettings", "Settings"],
                    ["createAttachmentIntent", "Attachments"],
                  ].map(([value, label]) => `<option value="${escapeHtml(value)}" ${(moderationState.filters?.action || "all") === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>User</span>
                <select name="userId">
                  <option value="">All users</option>
                  ${users.map((user) => `<option value="${escapeHtml(user.id)}" ${moderationState.filters?.userId === user.id ? "selected" : ""}>${escapeHtml(formatUserName(user))}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>Thread</span>
                <select name="threadId">
                  <option value="">All threads</option>
                  ${threads.map((thread) => `<option value="${escapeHtml(thread.databaseThreadId || thread.apiThread?.databaseThreadId || thread.threadId)}" ${(moderationState.filters?.threadId || "") === (thread.databaseThreadId || thread.apiThread?.databaseThreadId || thread.threadId) ? "selected" : ""}>${escapeHtml(thread.label || thread.title || thread.threadId)}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>From</span>
                <input type="date" name="from" value="${escapeHtml(String(moderationState.filters?.from || "").slice(0, 10))}">
              </label>
              <label>
                <span>To</span>
                <input type="date" name="to" value="${escapeHtml(String(moderationState.filters?.to || "").slice(0, 10))}">
              </label>
              <button type="submit">Apply</button>
            </form>
            ${
              moderationState.health
                ? `
                  <div class="dashboard-chat-health-grid" aria-label="Chat health">
                    <span><strong>${escapeHtml(moderationState.health.threadCount ?? 0)}</strong><small>Threads</small></span>
                    <span><strong>${escapeHtml(moderationState.health.messageCount ?? 0)}</strong><small>Messages</small></span>
                    <span><strong>${escapeHtml(moderationState.health.deletedMessageCount ?? 0)}</strong><small>Deleted</small></span>
                    <span><strong>${escapeHtml(moderationState.health.pendingAttachmentCount ?? 0)}</strong><small>Pending files</small></span>
                  </div>
                  <div class="dashboard-chat-support-diagnostics" aria-label="Chat support diagnostics">
                    <strong>Support diagnostics</strong>
                    <span><small>Checked</small><em>${escapeHtml(formatTime(moderationState.health.checkedAt || new Date().toISOString()))}</em></span>
                    <span><small>Attachments</small><em>${escapeHtml(String(moderationState.health.attachmentCount ?? 0))}</em></span>
                    <span><small>Latest thread</small><em>${escapeHtml(moderationState.health.latestThreadAt ? formatTime(moderationState.health.latestThreadAt) : "No activity")}</em></span>
                    <span><small>Latest audit</small><em>${escapeHtml(moderationState.health.latestAuditAt ? formatTime(moderationState.health.latestAuditAt) : "No audit")}</em></span>
                  </div>
                `
                : ""
            }
            ${
              moderationState.error
                ? `<p>${escapeHtml(moderationState.error)}</p>`
                : (Array.isArray(moderationState.audits) && moderationState.audits.length) || (Array.isArray(moderationState.failedUploads) && moderationState.failedUploads.length)
                  ? `
                    <div class="dashboard-chat-moderation-list">
                      ${(moderationState.failedUploads || [])
                        .slice(0, 8)
                        .map(
                          (upload) => `
                            <article class="is-failed-upload">
                              <strong>chat.failedUpload</strong>
                              <span>${escapeHtml(upload.status || "failed")} \u00b7 ${escapeHtml(formatTime(upload.created_at))}</span>
                              <small>${escapeHtml(upload.metadata?.fileName || upload.metadata?.filename || upload.id || "Attachment")}</small>
                            </article>
                          `
                        )
                        .join("")}
                      ${moderationState.audits
                        .slice(0, 8)
                        .map(
                          (audit) => `
                            <article>
                              <strong>${escapeHtml(audit.action || "chat.action")}</strong>
                              <span>${escapeHtml(audit.severity || "info")} \u00b7 ${escapeHtml(formatTime(audit.created_at))}</span>
                              <small>${escapeHtml([audit.actor_id ? `user ${audit.actor_id}` : "", audit.thread_id ? `thread ${audit.thread_id}` : ""].filter(Boolean).join(" / "))}</small>
                            </article>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `<p>No moderation events loaded.</p>`
            }
          </section>
        `
      : "";
    const attachmentDraftMarkup = attachmentDraft
      ? `
          <div class="dashboard-chat-attachment-draft is-${escapeHtml(attachmentDraft.status || "pending")}">
            <span class="dashboard-chat-attachment-draft-icon" aria-hidden="true">${escapeHtml(attachmentDraft.status === "uploading" ? "..." : attachmentDraft.status === "failed" ? "!" : getAttachmentDraftIcon(attachmentDraft))}</span>
            <span class="dashboard-chat-attachment-draft-copy">
              <strong>${escapeHtml(attachmentDraft.metadata?.fileName || "Attachment")}</strong>
              <small>${escapeHtml(attachmentDraft.status === "failed" ? attachmentDraft.error || "Upload failed" : attachmentDraft.status === "uploading" ? "Uploading" : formatFileSize(attachmentDraft.metadata?.byteSize || attachmentDraft.byte_size) || "Ready")}</small>
            </span>
            <button type="button" data-dashboard-chat-attachment-clear aria-label="Remove attachment">&times;</button>
          </div>
        `
      : "";
    const replyState = resolveReplyDraft(replyDraft, activeThreadId, messages);
    const replyComposerMarkup = replyState.activeReplyMessage
      ? renderReplyReference(replyState.activeReplyMessage, users, { cancelable: true })
      : "";
    const priorityControlsMarkup = priorityOptions
      .map((option) => {
        const isActive = priorityDraft === option.key;
        const icon = option.key === "normal" ? "N" : option.key === "important" ? "!" : option.key === "urgent" ? "!!" : option.label.slice(0, 1);
        return `
        <button
          type="button"
          class="dashboard-chat-priority-button is-${escapeHtml(option.key)}${isActive ? " is-active" : ""}"
          data-dashboard-chat-priority="${escapeHtml(option.key)}"
          aria-pressed="${isActive}"
          title="${escapeHtml(option.label)}"
          aria-label="${escapeHtml(option.label)} priority"
        >
          <span class="dashboard-chat-priority-icon" aria-hidden="true">${escapeHtml(icon)}</span>
          <span class="dashboard-chat-priority-label">${escapeHtml(option.label)}</span>
        </button>
      `;
      })
      .join("");
    const priorityMenuMarkup = priorityControlsMarkup
      ? `
        <details class="dashboard-chat-compose-more dashboard-chat-more-menu">
          <summary class="dashboard-chat-attachment-button" aria-label="Open message options" title="Message options">
            <span aria-hidden="true">+</span>
          </summary>
          <div class="dashboard-chat-more-menu-panel dashboard-chat-compose-more-panel" role="menu" aria-label="Message priority">
            ${priorityControlsMarkup}
          </div>
        </details>
      `
      : "";
    const trimmedLauncherLabel = launcherLabel.trim() || teamChatTitle;
    const widgetDialogLabel = /\bchat$/i.test(trimmedLauncherLabel)
      ? `${trimmedLauncherLabel} panel`
      : `${trimmedLauncherLabel} chat panel`;
    const widgetDialogAttributes = isOpen
      ? ` role="dialog" aria-modal="false" aria-keyshortcuts="Escape" aria-label="${escapeHtml(widgetDialogLabel)}"`
      : "";
    const headerTitleLabel = mobileConversationOpen ? activeThreadLabel : "Chats";
    const headerSubLabel = mobileConversationOpen
      ? activeThreadSubLabel
      : unreadCount
        ? `${unreadCount} unread`
        : `${simpleInboxThreads.length} conversation${simpleInboxThreads.length === 1 ? "" : "s"}`;

    return {
      activeThreadId,
      replyDraft: replyState.replyDraft,
      html: `
    <aside${widgetDialogAttributes} class="dashboard-chat-widget${isOpen ? " is-open" : ""}${mobileConversationOpen ? " is-mobile-conversation" : " is-mobile-inbox"}">
      ${
        isOpen
          ? `
            <header class="dashboard-chat-widget-header">
              <button type="button" class="dashboard-chat-widget-title" data-dashboard-chat-widget-toggle aria-expanded="true" aria-controls="dashboardChatWidgetRoot" aria-label="${escapeHtml(`Close ${widgetDialogLabel}`)}" title="${escapeHtml(`Close ${widgetDialogLabel}`)}">
                ${renderThreadAvatarStack(activeThread, headerParticipants)}
                <span class="dashboard-chat-widget-title-copy">
                  <span>${escapeHtml(headerTitleLabel)}</span>
                  <small>${escapeHtml(headerSubLabel)}</small>
                </span>
              </button>
              <div class="dashboard-chat-widget-actions">
                <button type="button" class="dashboard-chat-details-button${detailsOpen ? " is-active" : ""}" data-dashboard-chat-details-toggle aria-expanded="${detailsOpen}" aria-label="Open conversation details">
                  Info
                </button>
                <details class="dashboard-chat-more-menu">
                  <summary aria-label="Open chat menu">More</summary>
                  <div class="dashboard-chat-more-menu-panel">
                    <button
                      type="button"
                      class="dashboard-chat-more-action"
                      data-dashboard-chat-widget-toggle-notifications
                      aria-pressed="${notificationState.enabled}"
                    >
                      Notifications
                      <small>${escapeHtml(notificationLabel)}</small>
                    </button>
                    ${
                      canDeleteMessage(currentUser)
                        ? `
                          <button
                            type="button"
                            class="dashboard-chat-more-action is-danger"
                            data-dashboard-clear-thread
                            data-dashboard-chat-clear-thread="${escapeHtml(activeThreadId)}"
                          >
                            Clear thread
                            <small>Admin audited</small>
                          </button>
                          <button type="button" class="dashboard-chat-more-action" data-dashboard-chat-moderation-toggle aria-pressed="${moderationOpen}">
                            Support / audit
                            <small>Health, filters and logs</small>
                          </button>
                        `
                        : ""
                    }
                  </div>
                </details>
                <button
                  type="button"
                  class="dashboard-chat-widget-close"
                  data-dashboard-chat-widget-toggle
                  aria-expanded="true"
                  aria-controls="dashboardChatWidgetRoot"
                  aria-label="${escapeHtml(`Close ${widgetDialogLabel}`)}"
                  title="${escapeHtml(`Close ${widgetDialogLabel}`)}"
                >
                  &times;
                </button>
              </div>
            </header>
          `
          : `
            <button type="button" class="dashboard-chat-launcher" data-dashboard-chat-widget-toggle aria-expanded="false" aria-controls="dashboardChatWidgetRoot" aria-haspopup="dialog" aria-label="${escapeHtml(`Open ${launcherLabel}${launcherUnreadLabel}`)}" title="${escapeHtml(`Open ${launcherLabel}${launcherUnreadLabel}`)}">
              ${renderAvatarStack(launcherParticipants)}
              <span class="dashboard-chat-launcher-copy">
                <strong>${escapeHtml(launcherLabel)}</strong>
                <small>${escapeHtml(launcherPreview)}</small>
              </span>
              <span class="dashboard-chat-launcher-icon" aria-hidden="true"></span>
              ${unreadCount ? `<span class="dashboard-chat-header-badge is-unread" aria-hidden="true">${unreadCount}</span>` : `<span class="dashboard-chat-launcher-dot" aria-hidden="true"></span>`}
            </button>
          `
      }
      <button type="button" class="dashboard-chat-widget-toast" data-dashboard-chat-widget-toast data-dashboard-chat-toast-open aria-live="polite" aria-atomic="true" hidden></button>
      ${renderConfirmDialog(confirmAction)}
      ${isOpen ? groupCreateOverlayMarkup : ""}
      ${isOpen ? renderThreadSettingsDialog(threadSettingsDialog, threads, users, currentUser) : ""}
      ${isOpen && detailsOpen ? renderThreadDetailsPanel({ activeThread, activeThreadId, activeThreadLabel, activeThreadSubLabel, currentUser, users, messages, pinnedMessages, messageSearchQuery, searchMatchCount, searchActiveMatchIndex, threadMessageCount: hasThreadMessages.length }) : ""}
      <div class="dashboard-chat-widget-body">
        <section class="dashboard-chat-thread-list" aria-label="Chat threads">
          <div class="dashboard-chat-inbox-head">
            <div>
              <strong>Chats</strong>
              <small>${escapeHtml(unreadCount ? `${unreadCount} unread` : `${simpleInboxThreads.length} conversation${simpleInboxThreads.length === 1 ? "" : "s"}`)}</small>
            </div>
            ${threadPresetMarkup}
            <input
              type="search"
              data-dashboard-chat-filter
              autocomplete="off"
              placeholder="Search"
              aria-label="Search chat threads"
            />
            ${threadFilterMarkup}
          </div>
          <div class="dashboard-chat-thread-scroll" data-dashboard-chat-thread-list>
            ${filteredThreads.length
              ? filteredThreads
                  .map((thread) =>
                    renderThreadItem(
                      thread,
                      currentUser,
                      users,
                      thread.threadId === activeThreadId,
                      thread.unreadCount
                    )
                  )
                  .join("")
              : renderThreadFilterEmpty(normalizedThreadFilter)}
          </div>
        </section>
        <section class="dashboard-chat-conversation" aria-label="Active conversation">
          <div class="dashboard-chat-mobile-thread-bar">
            <button type="button" data-dashboard-chat-mobile-back aria-label="Back to inbox">&#8592;</button>
            <span>
              <strong>${escapeHtml(activeThreadLabel)}</strong>
              <small>${escapeHtml(activeThreadSubLabel)}</small>
            </span>
          </div>
          ${moderationMarkup}
          ${hasThreadMessages.length ? renderCoachWorkflowPanel({ activeThreadId, messages, pinnedMessages, users, currentUser }) : ""}
          ${hasThreadMessages.length ? renderConversationIntelligenceRail({ activeThreadId, messages, pinnedMessages, users, currentUser }) : ""}
          ${renderPinnedMessages(pinnedMessages, users, currentUser)}
          <div class="dashboard-chat-list" data-dashboard-chat-list aria-live="polite">
            ${hasOlderMessages && !normalizedMessageSearch ? `<button type="button" class="dashboard-chat-load-more" data-dashboard-chat-load-earlier="${escapeHtml(activeThreadId)}">Load earlier</button>` : ""}
            ${visibleMessages.length ? renderMessagesWithDateSeparators(visibleMessages, users, currentUser, { searchQuery: normalizedMessageSearch, activeSearchMatchId }) : `<div class="dashboard-chat-empty-state"><strong>No messages yet</strong><span>${escapeHtml(activeThread?.isTeamThread ? "Start the team thread." : `Start a direct message with ${activeThreadLabel}.`)}</span></div>`}
          </div>
          ${renderTypingIndicator(activeThreadId, users, currentUser)}
          ${replyComposerMarkup}
          ${attachmentDraftMarkup}
          <form class="dashboard-chat-form" data-dashboard-chat-form>
            <div class="dashboard-chat-input-shell">
              ${
                replyState.activeReplyMessage || attachmentDraft || priorityDraft !== "normal"
                  ? `<div class="dashboard-chat-compose-status" aria-live="polite">
                      ${replyState.activeReplyMessage ? `<span>Reply</span>` : ""}
                      ${attachmentDraft ? `<span>${escapeHtml(attachmentDraft.status === "failed" ? "Attachment failed" : attachmentDraft.status === "uploading" ? "Uploading file" : "File ready")}</span>` : ""}
                      ${priorityDraft !== "normal" ? `<span>${escapeHtml((priorityOptions.find((option) => option.key === priorityDraft)?.label || priorityDraft))}</span>` : ""}
                    </div>`
                  : ""
              }
              <textarea
                name="message"
                data-dashboard-chat-input
                autocomplete="off"
                rows="1"
                maxlength="${maxMessageLength}"
                placeholder="Message"
                aria-label="${escapeHtml(`Message ${activeThreadLabel}`)}"
              ></textarea>
              <div class="dashboard-chat-compose-tools" role="group" aria-label="Message priority and attachments">
                ${priorityMenuMarkup}
                <button type="button" class="dashboard-chat-attachment-button" data-dashboard-chat-attachment-trigger title="Attach file" aria-label="Attach file">
                  <span aria-hidden="true">&#128206;</span>
                </button>
                <input type="file" data-dashboard-chat-attachment-input hidden />
              </div>
            </div>
            <button type="submit" aria-label="Send message">
              <span class="dashboard-chat-send-icon" aria-hidden="true">&#8593;</span>
              <span class="dashboard-chat-send-label">Send</span>
            </button>
          </form>
        </section>
      </div>
    </aside>
  `,
    };
  }

  return Object.freeze({
    render,
    renderMessage,
    renderThreadItem,
    renderAvatarStack,
    renderConfirmDialog,
    getThreadPreview,
    getLatestThread,
    getThreadStatus,
    renderMessagePriority,
  });
}
