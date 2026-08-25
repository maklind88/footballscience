const DETAILS_TABS = Object.freeze(["people", "shared", "settings"]);

function normalizeDetailsTab(value) {
  const tab = String(value || "people").trim().toLowerCase();
  return DETAILS_TABS.includes(tab) ? tab : "people";
}

export function createDashboardChatDetailsRenderer(dependencies = {}) {
  const {
    escapeHtml = (value) => String(value ?? ""),
    formatTime = () => "",
    formatUserName = () => "Staff",
    renderPresenceAvatar = () => "",
    renderPinnedMessages = () => "",
    renderAttachmentLibrary = () => "",
    renderThreadIntelligencePanel = () => "",
    renderThreadActionPlanPanel = () => "",
    getThreadDetailParticipants = () => [],
    getThreadFiles = () => [],
    getThreadLinks = () => [],
    canClearThread = () => false,
  } = dependencies;

  function renderTabs(activeTab) {
    return `
      <div class="dashboard-chat-details-tabs" role="tablist" aria-label="Conversation details">
        ${DETAILS_TABS.map((tab) => `
          <button
            type="button"
            class="dashboard-chat-details-tab${activeTab === tab ? " is-active" : ""}"
            role="tab"
            aria-selected="${activeTab === tab}"
            data-dashboard-chat-details-tab="${tab}"
          >${tab[0].toUpperCase()}${tab.slice(1)}</button>
        `).join("")}
      </div>
    `;
  }

  function renderPeople({ activeThread, activeThreadId, currentUser, users }) {
    const participants = getThreadDetailParticipants(activeThread, users).slice(0, 40);
    const canManageParticipants = Boolean(activeThread?.permissions?.canManageParticipants && !activeThread?.isTeamThread);

    return `
      <div class="dashboard-chat-details-view is-people" role="tabpanel">
        <div class="dashboard-chat-details-section-head">
          <span>
            <strong>People</strong>
            <small>${escapeHtml(`${participants.length} participant${participants.length === 1 ? "" : "s"}`)}</small>
          </span>
          ${canManageParticipants ? `
            <button type="button" data-dashboard-chat-participant-action="add" data-dashboard-chat-participant-thread="${escapeHtml(activeThreadId)}">Edit people</button>
          ` : ""}
        </div>
        <div class="dashboard-chat-details-people">
          ${participants.length ? participants.map((participant) => {
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
                ${canRemoveParticipant ? `
                  <button type="button" data-dashboard-chat-participant-action="remove" data-dashboard-chat-participant-thread="${escapeHtml(activeThreadId)}" data-dashboard-chat-participant-id="${escapeHtml(participantId)}" aria-label="${escapeHtml(`Remove ${formatUserName(participant)}`)}">&times;</button>
                ` : ""}
              </span>
            `;
          }).join("") : "<em>No participants loaded yet.</em>"}
        </div>
      </div>
    `;
  }

  function renderSearch({ activeThreadLabel, messageSearchQuery, searchMatchCount, searchActiveMatchIndex, threadMessageCount }) {
    const normalizedSearch = String(messageSearchQuery || "").trim();
    const activeMatchPosition = searchMatchCount
      ? Math.min(Math.max(Number(searchActiveMatchIndex) || 0, 0), searchMatchCount - 1) + 1
      : 0;
    const searchSummary = normalizedSearch
      ? searchMatchCount
        ? `${activeMatchPosition} of ${searchMatchCount} matches in ${threadMessageCount} messages`
        : `No matches in ${threadMessageCount} messages`
      : "Search messages in this conversation";

    return `
      <label class="dashboard-chat-details-search">
        <span>Search conversation</span>
        <input type="search" data-dashboard-chat-message-search value="${escapeHtml(normalizedSearch)}" placeholder="${escapeHtml(`Search ${activeThreadLabel}`)}" autocomplete="off">
        <small>${escapeHtml(searchSummary)}</small>
      </label>
      ${normalizedSearch ? `
        <div class="dashboard-chat-search-nav" aria-label="Search result navigation">
          <button type="button" data-dashboard-chat-search-step="previous" ${searchMatchCount > 1 ? "" : "disabled"} aria-label="Previous search result">Previous</button>
          <strong>${escapeHtml(searchMatchCount ? `${activeMatchPosition} / ${searchMatchCount}` : "0 / 0")}</strong>
          <button type="button" data-dashboard-chat-search-step="next" ${searchMatchCount > 1 ? "" : "disabled"} aria-label="Next search result">Next</button>
        </div>
      ` : ""}
    `;
  }

  function renderShared(context) {
    const { activeThread, activeThreadId, activeThreadLabel, currentUser, users, messages, pinnedMessages } = context;
    const files = getThreadFiles(messages, activeThreadId);
    const links = getThreadLinks(messages, activeThreadId);
    const assistantMarkup = `
      ${renderThreadIntelligencePanel({ activeThreadId, activeThreadLabel, messages, pinnedMessages, users, currentUser })}
      ${renderThreadActionPlanPanel({
        activeThreadId,
        messages,
        pinnedMessages,
        users,
        currentUser,
        actionItems: activeThread?.apiThread?.actionItems || activeThread?.actionItems || [],
      })}
    `.trim();

    return `
      <div class="dashboard-chat-details-view is-shared" role="tabpanel">
        ${renderSearch(context)}
        <div class="dashboard-chat-details-grid" aria-label="Shared items summary">
          <article><span>Pins</span><strong>${escapeHtml(String(pinnedMessages.length))}</strong></article>
          <article><span>Files</span><strong>${escapeHtml(String(files.length))}</strong></article>
          <article><span>Links</span><strong>${escapeHtml(String(links.length))}</strong></article>
        </div>
        ${pinnedMessages.length ? `
          <div class="dashboard-chat-details-section">
            <strong>Pinned</strong>
            ${renderPinnedMessages(pinnedMessages, users, currentUser)}
          </div>
        ` : ""}
        <div class="dashboard-chat-details-section">
          <strong>Shared</strong>
          ${renderAttachmentLibrary(messages, activeThreadId)}
        </div>
        ${assistantMarkup ? `
          <details class="dashboard-chat-assistant-section">
            <summary>Conversation assistant</summary>
            <div>${assistantMarkup}</div>
          </details>
        ` : ""}
      </div>
    `;
  }

  function renderSettings({ activeThread, activeThreadId, currentUser, notificationState }) {
    const participants = getThreadDetailParticipants(activeThread, []).slice(0, 40);
    const threadSettings = activeThread?.settings || {};
    const canManageParticipants = Boolean(activeThread?.permissions?.canManageParticipants && !activeThread?.isTeamThread);
    const canManageGroup = Boolean(activeThread?.type === "group" && canManageParticipants);
    const canArchiveForMe = Boolean(activeThread?.permissions?.canArchiveForMe && !activeThread?.isTeamThread);
    const canDeleteForMe = Boolean(activeThread?.permissions?.canDeleteForMe && !activeThread?.isTeamThread);
    const canLeaveThread = Boolean(activeThread?.permissions?.canLeave && activeThread?.type === "group");
    const canBlockThread = Boolean(activeThread?.permissions?.canBlock && activeThread?.type === "dm");
    const canClearActiveThread = Boolean(canClearThread(currentUser, activeThread));
    const notificationsEnabled = Boolean(notificationState?.enabled);

    return `
      <div class="dashboard-chat-details-view is-settings" role="tabpanel">
        <div class="dashboard-chat-details-section">
          <strong>Conversation</strong>
          <div class="dashboard-chat-settings-grid">
            <button type="button" data-dashboard-chat-thread-setting="toggle-mute" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}" class="${threadSettings.muted ? "is-active" : ""}">
              <span>${threadSettings.muted ? "Muted" : "Mute"}</span>
              <small>${threadSettings.muted ? "Notifications paused" : "Pause this chat"}</small>
            </button>
            <button type="button" data-dashboard-chat-thread-setting="toggle-pin" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}" class="${threadSettings.pinned ? "is-active" : ""}">
              <span>${threadSettings.pinned ? "Pinned" : "Pin"}</span>
              <small>${threadSettings.pinned ? "Shown first" : "Keep near top"}</small>
            </button>
            <button type="button" data-dashboard-chat-widget-toggle-notifications aria-pressed="${notificationsEnabled}">
              <span>Notifications</span>
              <small>${notificationsEnabled ? "Enabled on this device" : "Disabled on this device"}</small>
            </button>
            ${canManageGroup ? `
              <button type="button" data-dashboard-chat-thread-setting="rename" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}">
                <span>Rename group</span>
                <small>${escapeHtml(threadSettings.customTitle || "Set group name")}</small>
              </button>
              <button type="button" data-dashboard-chat-thread-setting="avatar" data-dashboard-chat-thread-setting-thread="${escapeHtml(activeThreadId)}">
                <span>Group image</span>
                <small>${escapeHtml(threadSettings.avatarUrl ? "Photo set" : threadSettings.avatarLabel || "Photo or initials")}</small>
              </button>
              <button type="button" data-dashboard-chat-participant-action="add" data-dashboard-chat-participant-thread="${escapeHtml(activeThreadId)}">
                <span>Edit people</span>
                <small>${escapeHtml(`${participants.length || 0} participant${participants.length === 1 ? "" : "s"}`)}</small>
              </button>
            ` : ""}
            ${canArchiveForMe ? `
              <button type="button" data-dashboard-chat-thread-user-state="archive" data-dashboard-chat-thread-user-state-thread="${escapeHtml(activeThreadId)}">
                <span>Archive</span><small>Hide from your inbox</small>
              </button>
            ` : ""}
          </div>
        </div>
        ${(canDeleteForMe || canLeaveThread || canBlockThread || canClearActiveThread || canManageGroup) ? `
          <div class="dashboard-chat-details-section is-danger-zone">
            <strong>Conversation actions</strong>
            <div class="dashboard-chat-settings-grid">
              ${canDeleteForMe ? `<button type="button" class="is-danger" data-dashboard-chat-thread-user-state="delete" data-dashboard-chat-thread-user-state-thread="${escapeHtml(activeThreadId)}"><span>Delete for me</span><small>Remove your copy</small></button>` : ""}
              ${canLeaveThread ? `<button type="button" class="is-danger" data-dashboard-chat-leave-thread="${escapeHtml(activeThreadId)}"><span>Leave group</span><small>Remove yourself</small></button>` : ""}
              ${canBlockThread ? `<button type="button" class="is-danger" data-dashboard-chat-thread-user-state="block" data-dashboard-chat-thread-user-state-thread="${escapeHtml(activeThreadId)}"><span>Block chat</span><small>Remove this direct chat</small></button>` : ""}
              ${canClearActiveThread ? `<button type="button" class="is-danger" data-dashboard-clear-thread data-dashboard-chat-clear-thread="${escapeHtml(activeThreadId)}"><span>Clear chat</span><small>Delete for everyone</small></button>` : ""}
              ${canManageGroup ? `<button type="button" class="is-danger" data-dashboard-chat-archive-thread="${escapeHtml(activeThreadId)}"><span>Delete group</span><small>Remove group for everyone</small></button>` : ""}
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderThreadDetailsPanel(context = {}) {
    const activeTab = normalizeDetailsTab(context.detailsTab);
    const content = activeTab === "shared"
      ? renderShared(context)
      : activeTab === "settings"
        ? renderSettings(context)
        : renderPeople(context);

    return `
      <section class="dashboard-chat-details-panel" aria-label="Conversation details">
        <header>
          <div>
            <span class="dashboard-chat-details-kicker">Conversation</span>
            <strong>${escapeHtml(context.activeThreadLabel || "Conversation")}</strong>
            <small>${escapeHtml(context.activeThreadSubLabel || "")}</small>
          </div>
          <button type="button" data-dashboard-chat-details-close aria-label="Close conversation details">&times;</button>
        </header>
        ${renderTabs(activeTab)}
        <div class="dashboard-chat-details-content">${content}</div>
      </section>
    `;
  }

  return Object.freeze({ renderThreadDetailsPanel });
}
