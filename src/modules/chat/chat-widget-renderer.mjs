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
    renderMessageText = (message) => escapeHtml(message?.text || ""),
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

    return lastMessage.mentionedUserIds?.includes(currentUser?.id)
      ? `${priorityPrefix}Mentioned you: ${shortText}`
      : `${priorityPrefix}${senderName}: ${shortText}`;
  }

  function getLatestThread(threads = []) {
    return [...threads].sort((first, second) => {
      const firstTime = new Date(first.lastMessage?.createdAt || first.apiThread?.lastMessageAt || 0).getTime();
      const secondTime = new Date(second.lastMessage?.createdAt || second.apiThread?.lastMessageAt || 0).getTime();
      return secondTime - firstTime;
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

  function renderMessage(message, users, currentUser) {
    const isOwn = message.userId === currentUser?.id;
    const isMentioned = !isOwn && message.mentionedUserIds.includes(currentUser?.id);
    const user = users.find((candidate) => candidate.id === message.userId) ?? message.author ?? null;
    const userName = user ? formatUserName(user) : "Unknown";
    const avatarMarkup = user
      ? renderPresenceAvatar(user, "dashboard-chat-avatar")
      : `<span class="dashboard-chat-avatar" aria-hidden="true">?</span>`;
    const statusMarkup = isOwn ? renderMessageStatus(message, users, currentUser) : "";
    const canDeleteChat = canDeleteMessage(currentUser);
    const canPinChat = canPinMessage(currentUser);
    const pinLabel = message.pinnedAt ? "Unpin" : "Pin";
    const replyMessage = message.replyToId ? getMessageById(message.replyToId) : null;
    const replyMarkup = replyMessage ? renderReplyReference(replyMessage, users, { compact: true }) : "";
    const priorityMarkup = renderMessagePriority(message);
    const reactionMarkup = renderMessageReactions(message, currentUser);

    return `
    <article class="dashboard-chat-message${isOwn ? " is-own" : ""}${isMentioned ? " is-mentioned" : ""}${message.pinnedAt ? " is-pinned" : ""}">
      <div class="dashboard-chat-meta">
        ${avatarMarkup}
        <span class="dashboard-chat-author">
          <strong>${escapeHtml(userName)}</strong>
          <small>${escapeHtml(formatTime(message.createdAt))}</small>
        </span>
      </div>
      <div class="dashboard-chat-bubble">
        <details class="dashboard-chat-message-menu">
          <summary aria-label="Message actions">
            <span aria-hidden="true">&#8964;</span>
          </summary>
          <div class="dashboard-chat-message-menu-panel" role="menu">
            <button type="button" class="dashboard-chat-menu-action" data-dashboard-reply-message="${escapeHtml(message.id)}" role="menuitem">Reply</button>
            ${
              reactionMarkup
                ? `<div class="dashboard-chat-menu-reaction-group" role="group" aria-label="React to message">${reactionMarkup}</div>`
                : ""
            }
            ${
              canPinChat
                ? `<button type="button" class="dashboard-chat-menu-action" data-dashboard-toggle-pin-message="${escapeHtml(message.id)}" role="menuitem">${escapeHtml(pinLabel)}</button>`
                : ""
            }
            ${
              canDeleteChat
                ? `<button type="button" class="dashboard-chat-menu-action is-danger" data-dashboard-remove-message="${escapeHtml(message.id)}" aria-label="Delete message from ${escapeHtml(userName)}" role="menuitem">Delete</button>`
                : ""
            }
          </div>
        </details>
        ${priorityMarkup}
        ${replyMarkup}
        <p>${renderMessageText(message, users)}</p>
        ${renderMessageAttachments(message, users)}
        ${statusMarkup}
      </div>
    </article>
  `;
  }

  function renderThreadItem(thread, currentUser, users, isSelected, isUnread) {
    const threadLabel = thread.isTeamThread ? "Team Room" : thread.label;
    const preview = getThreadPreview(thread, users, currentUser);
    const threadStatus = getThreadStatus(thread, users);
    const avatarMarkup = thread.participant
      ? renderPresenceAvatar(thread.participant, "dashboard-chat-thread-avatar")
      : `<span class="dashboard-chat-thread-avatar is-team" aria-hidden="true">${escapeHtml(thread.isTeamThread ? "T" : (threadLabel[0] || "C"))}</span>`;
    const threadTime = thread.lastMessage
      ? escapeHtml(formatTime(thread.lastMessage.createdAt))
      : thread.apiThread?.lastMessageAt
        ? escapeHtml(formatTime(thread.apiThread.lastMessageAt))
        : "&mdash;";
    const searchText = `${threadLabel} ${preview} ${threadStatus}`.toLowerCase();

    return `
    <button
      type="button"
      class="dashboard-chat-thread-item${isSelected ? " is-active" : ""}${isUnread ? " is-unread" : ""}${thread.mentionCount ? " is-mentioned" : ""}"
      data-dashboard-chat-thread="${escapeHtml(thread.threadId)}"
      data-dashboard-chat-search="${escapeHtml(searchText)}"
    >
      ${avatarMarkup}
      <span class="dashboard-chat-thread-copy">
        <span class="dashboard-chat-thread-row">
          <strong>${escapeHtml(threadLabel)}</strong>
          <small>${threadTime}</small>
        </span>
        <small>${escapeHtml(preview)}</small>
        <span class="dashboard-chat-thread-meta">
          <span>${escapeHtml(threadStatus)}</span>
          <span>${escapeHtml(`${thread.messageCount || 0} message${thread.messageCount === 1 ? "" : "s"}`)}</span>
        </span>
      </span>
      ${thread.mentionCount ? `<span class="dashboard-chat-thread-mention-badge">@</span>` : isUnread ? `<span class="dashboard-chat-thread-unread">${isUnread}</span>` : ""}
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
          <div class="dashboard-chat-attachment-draft">
            <span aria-hidden="true">&#9633;</span>
            <strong>${escapeHtml(attachmentDraft.metadata?.fileName || "Attachment")}</strong>
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
    <aside class="dashboard-chat-widget${isOpen ? " is-open" : ""}">
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
          ${moderationMarkup}
          ${renderPinnedMessages(pinnedMessages, users, currentUser)}
          <div class="dashboard-chat-list" data-dashboard-chat-list aria-live="polite">
            ${hasOlderMessages && !normalizedMessageSearch ? `<button type="button" class="dashboard-chat-load-more" data-dashboard-chat-load-earlier="${escapeHtml(activeThreadId)}">Load earlier</button>` : ""}
            ${visibleMessages.length ? visibleMessages.map((message) => renderMessage(message, users, currentUser)).join("") : `<div class="dashboard-chat-empty-state"><strong>No messages yet</strong><span>${escapeHtml(activeThread?.isTeamThread ? "Start the team thread." : `Start a direct message with ${activeThreadLabel}.`)}</span></div>`}
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
                <label class="dashboard-chat-attachment-button" title="Attach file" aria-label="Attach file">
                  <input type="file" data-dashboard-chat-attachment-input hidden />
                  <span aria-hidden="true">&#128206;</span>
                </label>
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
