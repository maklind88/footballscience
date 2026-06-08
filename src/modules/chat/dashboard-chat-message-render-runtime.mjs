export function createDashboardChatMessageRenderRuntime(dependencies = {}) {
  const {
    dashboardChatTeamThreadId = "team",
    dashboardChatPinnedLimit = 3,
    escapeHtml = (value) => String(value ?? ""),
    canPinDashboardChatMessage = () => false,
    formatUserName = (user = {}) => `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim() || "Staff",
    formatDashboardMessageText = () => "",
    dashboardChatReactionOptions = [],
    getCurrentPlatformUser = () => null,
    getDashboardMessageAuthorName = () => "Staff",
    normalizeDashboardChatThreadId = (threadId, fallbackThreadId = dashboardChatTeamThreadId) =>
      String(threadId || fallbackThreadId || "").trim() || String(fallbackThreadId).trim() || "team",
    normalizeDashboardReactions = () => ({}),
    readDashboardMessages = () => [],
  } = dependencies;

  function getDashboardMessagePreview(message) {
    return String(message?.text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 86);
  }

  function renderDashboardReplyReference(message, users = [], options = {}) {
    if (!message) {
      return "";
    }

    const authorName = getDashboardMessageAuthorName(message, users);
    const preview = getDashboardMessagePreview(message);
    const closeButton = options.cancelable
      ? `<button type="button" data-dashboard-cancel-reply aria-label="Cancel reply">×</button>`
      : "";

    return `
    <div class="dashboard-chat-reply-ref${options.compact ? " is-compact" : ""}">
      <span>
        <strong>${escapeHtml(authorName)}</strong>
        <small>${escapeHtml(preview || "Message")}</small>
      </span>
      ${closeButton}
    </div>
  `;
  }

  function getDashboardPinnedMessagesForThread(messages = readDashboardMessages(), threadId = dashboardChatTeamThreadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    return messages
      .filter((message) => message.threadId === normalizedThreadId && message.pinnedAt)
      .sort((first, second) => new Date(second.pinnedAt || 0) - new Date(first.pinnedAt || 0))
      .slice(0, dashboardChatPinnedLimit);
  }

  function renderDashboardPinnedMessages(pinnedMessages = [], users = [], currentUser = getCurrentPlatformUser()) {
    if (!pinnedMessages.length) {
      return "";
    }

    return `
    <section class="dashboard-chat-pins" aria-label="Pinned chat messages">
      <div class="dashboard-chat-pins-head">
        <strong>Pinned</strong>
        <span>${escapeHtml(`${pinnedMessages.length}`)}</span>
      </div>
      ${pinnedMessages
        .map((message) => {
          const author = users.find((user) => user.id === message.userId) || message.author || null;
    const canUnpin = canPinDashboardChatMessage(currentUser);
          return `
<article class="dashboard-chat-pin-card">
<div>
<strong>${escapeHtml(author ? formatUserName(author) : "Staff")}</strong>
<p>${escapeHtml(formatDashboardMessageText(message, users, {}))}</p>
</div>
${
canUnpin
  ? `<button type="button" data-dashboard-toggle-pin-message="${escapeHtml(message.id)}">Unpin</button>`
  : ""
}
</article>
`;
        })
        .join("")}
    </section>
  `;
  }

  function renderDashboardMessageReactions(message, currentUser = getCurrentPlatformUser()) {
    const reactions = normalizeDashboardReactions(message?.reactions || {});
    return `
    <div class="dashboard-chat-reactions" aria-label="Message reactions">
      ${dashboardChatReactionOptions
        .map((option) => {
          const userIds = reactions[option.key] || [];
          const isActive = currentUser?.id ? userIds.includes(currentUser.id) : false;
          const countLabel = userIds.length ? ` ${userIds.length}` : "";
          return `
<button
type="button"
class="${isActive ? "is-active" : ""}"
data-dashboard-message-reaction="${escapeHtml(message.id)}"
data-dashboard-reaction-key="${escapeHtml(option.key)}"
aria-pressed="${isActive}"
>${escapeHtml(option.label)}${escapeHtml(countLabel)}</button>
`;
        })
        .join("")}
    </div>
  `;
  }

  return {
    getDashboardMessagePreview,
    renderDashboardReplyReference,
    getDashboardPinnedMessagesForThread,
    renderDashboardPinnedMessages,
    renderDashboardMessageReactions,
  };
}
