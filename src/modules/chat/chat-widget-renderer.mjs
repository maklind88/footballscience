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
  const time = Date.parse(thread.lastActivityAt || thread.lastMessage?.createdAt || thread.apiThread?.lastMessageAt || "");
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

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

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
  return `<div class="dashboard-chat-status is-${statusKey}" title="${escapeHtml(statusLabel)}" aria-label="${escapeHtml(statusLabel)}"><span class="dashboard-chat-check-label">${statusIcon}</span><span class="dashboard-chat-status-text">${escapeHtml(statusLabel)}</span></div>`;
}

function defaultRenderMessageText(message = {}, options = {}, escapeHtml = defaultEscapeHtml) {
  return renderDashboardChatTextPartWithSearchHighlight(message?.text, options.searchQuery, escapeHtml);
}

export function createDashboardChatWidgetRenderer(dependencies = {}) {
  const {
    teamThreadId = "team",
    messageLimit = 50,
    maxMessageLength = 1600,
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

  function renderMessagePriority(message) {
    const priority = normalizePriority(message?.priority);
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
    const shortText =
      String(lastMessage.text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 55) || "Message";
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

  function renderMessage(message, users, currentUser, options = {}) {
    const isOwn = message.userId === currentUser?.id;
    const isMentioned = !isOwn && message.mentionedUserIds.includes(currentUser?.id);
    const isGroupedWithPrevious = Boolean(options.groupedWithPrevious);
    const isGroupedWithNext = Boolean(options.groupedWithNext);
    const searchQuery = String(options.searchQuery || "").trim();
    const isSearchMatch = Boolean(searchQuery && String(message.text || "").toLowerCase().includes(searchQuery.toLowerCase()));
    const messageStatus = String(message.status || "sent").trim().toLowerCase().replace(/[^a-z-]/g, "");
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
    const priorityMarkup = renderMessagePriority(message);
    const reactionMarkup = renderMessageReactions(message, currentUser);
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

    return `
    <article class="dashboard-chat-message${isOwn ? " is-own" : ""}${isMentioned ? " is-mentioned" : ""}${isSearchMatch ? " is-search-match" : ""}${message.pinnedAt ? " is-pinned" : ""}${isGroupedWithPrevious ? " is-grouped-with-previous" : ""}${isGroupedWithNext ? " is-grouped-with-next" : ""}${messageStatus ? ` is-${escapeHtml(messageStatus)} is-status-${escapeHtml(messageStatus)}` : ""}" data-dashboard-chat-message-id="${escapeHtml(message.id)}" aria-label="${escapeHtml(`${userName}${timeLabel ? `, ${timeLabel}` : ""}`)}">
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
        ${replyMarkup}
        <p>${renderMessageText(message, users, { searchQuery })}</p>
        ${renderMessageAttachments(message, users)}
        ${statusMarkup}
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
        return `${separator}${renderMessage(message, users, currentUser, { groupedWithPrevious, groupedWithNext, searchQuery: options.searchQuery })}`;
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
    const avatarMarkup = thread.participant
      ? renderPresenceAvatar(thread.participant, "dashboard-chat-thread-avatar")
      : `<span class="dashboard-chat-thread-avatar is-team" aria-hidden="true">${escapeHtml(avatarLabel)}</span>`;
    const threadTime = thread.lastActivityAt
      ? escapeHtml(formatTime(thread.lastActivityAt))
      : thread.lastMessage
        ? escapeHtml(formatTime(thread.lastMessage.createdAt))
        : thread.apiThread?.lastMessageAt
          ? escapeHtml(formatTime(thread.apiThread.lastMessageAt))
        : "&mdash;";
    const searchText = `${threadLabel} ${preview} ${threadStatus} ${threadKindLabel}`.toLowerCase();

    return `
    <button
      type="button"
      class="dashboard-chat-thread-item${isSelected ? " is-active" : ""}${unreadCount ? " is-unread" : ""}${thread.mentionCount ? " is-mentioned" : ""}${attachmentCount ? " has-attachment" : ""}${threadSettings.pinned ? " is-thread-pinned" : ""}${threadSettings.muted ? " is-thread-muted" : ""}"
      data-dashboard-chat-thread="${escapeHtml(thread.threadId)}"
      data-dashboard-chat-search="${escapeHtml(searchText)}"
      aria-label="${escapeHtml(`${threadLabel}. ${preview}. ${unreadCount ? `${unreadLabel} unread.` : "No unread messages."}`)}"
    >
      ${avatarMarkup}
      <span class="dashboard-chat-thread-copy">
        <span class="dashboard-chat-thread-row">
          <strong>${escapeHtml(threadLabel)}</strong>
          <small>${threadTime}</small>
        </span>
        <span class="dashboard-chat-thread-preview-line">
          <small class="dashboard-chat-thread-kind">${escapeHtml(threadKindLabel)}</small>
          <small class="dashboard-chat-thread-preview">${escapeHtml(preview)}</small>
        </span>
        <span class="dashboard-chat-thread-meta">
          <span>${escapeHtml(threadStatus)}</span>
          <span>${escapeHtml(`${thread.messageCount || 0} message${thread.messageCount === 1 ? "" : "s"}`)}</span>
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

  function getThreadDetailParticipants(thread, users = []) {
    if (!thread) {
      return [];
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

  function renderThreadDetailsPanel({ activeThread, activeThreadId, activeThreadLabel, activeThreadSubLabel, users, messages, pinnedMessages, messageSearchQuery = "", searchMatchCount = 0, threadMessageCount = 0 }) {
    const participants = getThreadDetailParticipants(activeThread, users).slice(0, 8);
    const files = getThreadFiles(messages, activeThreadId);
    const links = getThreadLinks(messages, activeThreadId);
    const threadSettings = activeThread?.settings || {};
    const normalizedSearch = String(messageSearchQuery || "").trim();
    const searchSummary = normalizedSearch
      ? `${searchMatchCount} match${searchMatchCount === 1 ? "" : "es"} in ${threadMessageCount} messages`
      : "Search messages in this conversation";
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
        <label class="dashboard-chat-details-search">
          <span>Search conversation</span>
          <input type="search" data-dashboard-chat-message-search value="${escapeHtml(normalizedSearch)}" placeholder="${escapeHtml(`Search ${activeThreadLabel}`)}" autocomplete="off">
          <small>${escapeHtml(searchSummary)}</small>
        </label>
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
              <small>${escapeHtml(threadSettings.avatarLabel || "Set initials")}</small>
            </button>
          </div>
        </div>
        <div class="dashboard-chat-details-section">
          <strong>Participants</strong>
          <div class="dashboard-chat-details-people">
            ${
              participants.length
                ? participants
                    .map(
                      (participant) => `
                        <span>
                          ${renderPresenceAvatar(participant, "dashboard-chat-details-avatar")}
                          <small>${escapeHtml(formatUserName(participant))}</small>
                        </span>
                      `
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
      realtimeStatus = { key: "warming", label: "Syncing", detail: "Realtime warming up" },
      detailsOpen = false,
      mobileConversationOpen = true,
      replyDraft = null,
      priorityDraft = "normal",
      confirmAction = null,
      messageSearchQuery = "",
      hasOlderMessages = false,
      advancedThreadTemplates = [],
      moderationOpen = false,
      moderationState = { loading: false, audits: [], retentionPolicy: null, error: "" },
      attachmentDraft = null,
      teamChatTitle = "Team Chat",
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
    const visibleMessages = searchedMessages.slice(-messageLimit);
    const pinnedMessages = getPinnedMessagesForThread(messages, activeThreadId);
    const latestThread = threads.find((thread) => thread.unreadCount) || getLatestThread(threads);
    const activeThreadLabel = activeThread?.label || teamChatTitle;
    const activeThreadSubLabel = activeThread
      ? `${getThreadStatus(activeThread, users)} \u00b7 ${activeThread.messageCount} message${activeThread.messageCount === 1 ? "" : "s"}`
      : "No messages";
    const headerParticipants = activeThread?.isTeamThread ? users : [activeThread?.participant].filter(Boolean);
    const launcherThread = activeThread || latestThread;
    const launcherParticipants = launcherThread?.isTeamThread ? users : [launcherThread?.participant].filter(Boolean);
    const launcherLabel = launcherThread?.label || teamChatTitle;
    const launcherPreview = launcherThread ? getThreadPreview(launcherThread, users, currentUser) : "Open team room";
    const teamPresenceLabel = getThreadStatus({ isTeamThread: true }, users);
    const notificationLevel = notificationState.level || (notificationState.enabled ? "all" : "muted");
    const notificationLabel = { all: "All", mentions: "Mentions", muted: "Muted" }[notificationLevel] || "All";
    const realtimeKey = String(realtimeStatus?.key || "warming").replace(/[^a-z-]/g, "");
    const realtimeLabel = String(realtimeStatus?.label || "Syncing");
    const realtimeDetail = String(realtimeStatus?.detail || realtimeLabel);
    const threadPresetMarkup = advancedThreadTemplates.length
      ? `
          <details class="dashboard-chat-thread-presets" data-dashboard-chat-thread-presets>
            <summary aria-label="Create new chat">+</summary>
            <div class="dashboard-chat-thread-preset-menu" aria-label="Create chat thread">
              ${advancedThreadTemplates
                .map(
                  (template) => `
                    <button type="button" data-dashboard-chat-create-thread="${escapeHtml(template.key)}">
                      ${escapeHtml(template.label)}
                    </button>
                  `
                )
                .join("")}
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
            ${
              moderationState.health
                ? `
                  <div class="dashboard-chat-health-grid" aria-label="Chat health">
                    <span><strong>${escapeHtml(moderationState.health.threadCount ?? 0)}</strong><small>Threads</small></span>
                    <span><strong>${escapeHtml(moderationState.health.messageCount ?? 0)}</strong><small>Messages</small></span>
                    <span><strong>${escapeHtml(moderationState.health.deletedMessageCount ?? 0)}</strong><small>Deleted</small></span>
                    <span><strong>${escapeHtml(moderationState.health.pendingAttachmentCount ?? 0)}</strong><small>Pending files</small></span>
                  </div>
                `
                : ""
            }
            ${
              moderationState.error
                ? `<p>${escapeHtml(moderationState.error)}</p>`
                : Array.isArray(moderationState.audits) && moderationState.audits.length
                  ? `
                    <div class="dashboard-chat-moderation-list">
                      ${moderationState.audits
                        .slice(0, 8)
                        .map(
                          (audit) => `
                            <article>
                              <strong>${escapeHtml(audit.action || "chat.action")}</strong>
                              <span>${escapeHtml(audit.severity || "info")} \u00b7 ${escapeHtml(formatTime(audit.created_at))}</span>
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
          ${escapeHtml(icon)}
        </button>
      `;
      })
      .join("");

    return {
      activeThreadId,
      replyDraft: replyState.replyDraft,
      html: `
    <aside class="dashboard-chat-widget${isOpen ? " is-open" : ""}${mobileConversationOpen ? " is-mobile-conversation" : " is-mobile-inbox"}">
      ${
        isOpen
          ? `
            <header class="dashboard-chat-widget-header">
              <button type="button" class="dashboard-chat-widget-title" data-dashboard-chat-widget-toggle aria-expanded="true">
                ${renderAvatarStack(headerParticipants)}
                <span class="dashboard-chat-widget-title-copy">
                  <span>${escapeHtml(activeThreadLabel)}</span>
                  <small>${escapeHtml(activeThreadSubLabel)}</small>
                </span>
              </button>
              <div class="dashboard-chat-widget-actions">
                <button
                  type="button"
                  class="dashboard-chat-widget-notify"
                  data-dashboard-chat-widget-toggle-notifications
                  aria-pressed="${notificationState.enabled}"
                  aria-label="${notificationState.enabled ? "Turn chat notifications off" : "Turn chat notifications on"}"
                >
                  ${escapeHtml(notificationLabel)}
                </button>
                <span class="dashboard-chat-realtime-pill is-${escapeHtml(realtimeKey)}" title="${escapeHtml(realtimeDetail)}" aria-label="${escapeHtml(`Chat ${realtimeLabel}. ${realtimeDetail}`)}">
                  <i aria-hidden="true"></i>
                  <span>${escapeHtml(realtimeLabel)}</span>
                </span>
                <button type="button" class="dashboard-chat-details-button${detailsOpen ? " is-active" : ""}" data-dashboard-chat-details-toggle aria-expanded="${detailsOpen}" aria-label="Open conversation details">
                  Info
                </button>
                ${
                  canDeleteMessage(currentUser)
                    ? `
                      <button
                        type="button"
                        class="dashboard-chat-clear-button"
                        data-dashboard-clear-thread
                        data-dashboard-chat-clear-thread="${escapeHtml(activeThreadId)}"
                      >
                        Clear
                      </button>
                    `
                    : ""
                }
                ${
                  canDeleteMessage(currentUser)
                    ? `<button type="button" class="dashboard-chat-moderation-button" data-dashboard-chat-moderation-toggle aria-pressed="${moderationOpen}">Audit</button>`
                    : ""
                }
                <button
                  type="button"
                  class="dashboard-chat-widget-close"
                  data-dashboard-chat-widget-toggle
                  aria-label="Close team chat"
                >
                  &times;
                </button>
              </div>
            </header>
          `
          : `
            <button type="button" class="dashboard-chat-launcher" data-dashboard-chat-widget-toggle aria-expanded="false">
              ${renderAvatarStack(launcherParticipants)}
              <span class="dashboard-chat-launcher-copy">
                <strong>${escapeHtml(launcherLabel)}</strong>
                <small>${escapeHtml(launcherPreview)}</small>
              </span>
              ${unreadCount ? `<span class="dashboard-chat-header-badge is-unread" aria-label="${escapeHtml(`${unreadCount} unread chat message${unreadCount === 1 ? "" : "s"}`)}">${unreadCount}</span>` : `<span class="dashboard-chat-launcher-dot" aria-hidden="true"></span>`}
            </button>
          `
      }
      <button type="button" class="dashboard-chat-widget-toast" data-dashboard-chat-widget-toast data-dashboard-chat-toast-open aria-live="polite" aria-atomic="true" hidden></button>
      ${renderConfirmDialog(confirmAction)}
      ${isOpen && detailsOpen ? renderThreadDetailsPanel({ activeThread, activeThreadId, activeThreadLabel, activeThreadSubLabel, users, messages, pinnedMessages, messageSearchQuery, searchMatchCount: searchedMessages.length, threadMessageCount: hasThreadMessages.length }) : ""}
      <div class="dashboard-chat-widget-body">
        <section class="dashboard-chat-thread-list" aria-label="Chat threads">
          <div class="dashboard-chat-inbox-head">
            <div>
              <strong>Inbox</strong>
              <small>${escapeHtml(unreadCount ? `${unreadCount} unread` : "All caught up")}</small>
            </div>
            ${threadPresetMarkup}
            <input
              type="search"
              data-dashboard-chat-filter
              autocomplete="off"
              placeholder="Search"
              aria-label="Search chat threads"
            />
          </div>
          <div class="dashboard-chat-thread-scroll" data-dashboard-chat-thread-list>
            ${threads
              .map((thread) =>
                renderThreadItem(
                  thread,
                  currentUser,
                  users,
                  thread.threadId === activeThreadId,
                  thread.unreadCount
                )
              )
              .join("")}
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
          ${renderPinnedMessages(pinnedMessages, users, currentUser)}
          <div class="dashboard-chat-list" data-dashboard-chat-list aria-live="polite">
            ${hasOlderMessages && !normalizedMessageSearch ? `<button type="button" class="dashboard-chat-load-more" data-dashboard-chat-load-earlier="${escapeHtml(activeThreadId)}">Load earlier</button>` : ""}
            ${visibleMessages.length ? renderMessagesWithDateSeparators(visibleMessages, users, currentUser, { searchQuery: normalizedMessageSearch }) : `<div class="dashboard-chat-empty-state"><strong>No messages yet</strong><span>${escapeHtml(activeThread?.isTeamThread ? "Start the team thread." : `Start a direct message with ${activeThreadLabel}.`)}</span></div>`}
          </div>
          ${renderTypingIndicator(activeThreadId, users, currentUser)}
          ${replyComposerMarkup}
          ${attachmentDraftMarkup}
          <form class="dashboard-chat-form" data-dashboard-chat-form>
            <div class="dashboard-chat-input-shell">
              <textarea
                name="message"
                data-dashboard-chat-input
                autocomplete="off"
                rows="1"
                maxlength="${maxMessageLength}"
                placeholder="Message ${escapeHtml(activeThreadLabel)}"
              ></textarea>
              <div class="dashboard-chat-compose-tools" role="group" aria-label="Message priority and attachments">
                ${priorityControlsMarkup}
                <button type="button" class="dashboard-chat-attachment-button" data-dashboard-chat-attachment-trigger title="Attach file" aria-label="Attach file">
                  <span aria-hidden="true">&#128206;</span>
                </button>
                <input type="file" data-dashboard-chat-attachment-input hidden />
              </div>
            </div>
            <button type="submit">Send</button>
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
