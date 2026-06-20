export function createDashboardChatPresenceRuntime(dependencies = {}) {
  const {
    dashboardChatTeamThreadId = "team",
    dashboardPresenceHeartbeatMs = 90000,
    dashboardPresencePollMs = 90000,
    dashboardPresenceSteadyPushMinMs = 45000,
    dashboardPresenceTypingPushMinMs = 5000,
    dashboardPresencePollMinMs = 60000,
    dashboardPresenceIdleMs = 90000,
    dashboardPresenceOnlineTtlMs = 85000,
    dashboardPresenceAwayTtlMs = 6 * 60 * 1000,
    dashboardTypingTtlMs = 9000,
    dashboardTypingSendThrottleMs = 1800,
    getCurrentPlatformUser = () => null,
    getPlatformAuthStore = () => null,
    getPlatformUsers = () => [],
    getHubState = () => null,
    normalizeDashboardChatThreadId = (threadId, fallbackThreadId = dashboardChatTeamThreadId) =>
      String(threadId || fallbackThreadId || "").trim() || String(fallbackThreadId || "team").trim(),
    renderDashboardChatWidget = () => {},
    escapeHtml = (value) => String(value ?? ""),
    formatUserName = (user = {}) =>
      [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(" ") || "Staff",
    renderUserAvatar = () => "",
    win = typeof globalThis !== "undefined" ? globalThis : {},
    documentRef = typeof document !== "undefined" ? document : null,
  } = dependencies;

  const fallbackPresenceState = { online: 0, away: 0, offline: 0 };
  let dashboardPresenceEntriesByUserId = {};
  let dashboardPresenceHeartbeatTimer = null;
  let dashboardPresencePollTimer = null;
  let dashboardPresenceStarted = false;
  let dashboardPresenceInFlight = false;
  let dashboardPresenceLastActivityAt = Date.now();
  let dashboardPresenceLastRenderedSignature = "";
  let dashboardPresenceLastPushAt = 0;
  let dashboardPresenceLastPollAt = 0;
  let dashboardPresenceBackoffUntil = 0;
  const dashboardPresenceBackoffMs = 120 * 1000;

  let dashboardChatTypingThreadId = "";
  let dashboardChatTypingAt = 0;
  let dashboardChatTypingLastSentAt = 0;
  let dashboardChatTypingClearTimer = null;

  function normalizeDashboardPresenceStatus(value) {
    const status = String(value || "").trim().toLowerCase();
    if (status === "away" || status === "offline") {
      return status;
    }
    return "online";
  }

  function getDashboardSelfPresenceStatus() {
    if ((documentRef?.visibilityState || "") !== "visible" || !documentRef?.hasFocus?.()) {
      return "away";
    }
    return Date.now() - dashboardPresenceLastActivityAt > dashboardPresenceIdleMs ? "away" : "online";
  }

  function isDashboardPresenceBackoffActive() {
    return Date.now() < dashboardPresenceBackoffUntil;
  }

  function markDashboardPresenceBackoff() {
    dashboardPresenceBackoffUntil = Date.now() + dashboardPresenceBackoffMs;
  }

  function clearDashboardPresenceBackoff() {
    dashboardPresenceBackoffUntil = 0;
  }

  function resolveDashboardPresenceStatus(entry, userId = "") {
    const currentUser = getCurrentPlatformUser();
    if (!entry && currentUser?.id && currentUser.id === userId) {
      return getDashboardSelfPresenceStatus();
    }
    const lastSeenMs = new Date(entry?.lastSeenAt || entry?.updatedAt || 0).getTime();
    if (!Number.isFinite(lastSeenMs)) {
      return "offline";
    }
    const ageMs = Date.now() - lastSeenMs;
    const rawStatus = normalizeDashboardPresenceStatus(entry?.status);
    if (rawStatus === "offline" || ageMs > dashboardPresenceAwayTtlMs) {
      return "offline";
    }
    if (rawStatus === "away" || ageMs > dashboardPresenceOnlineTtlMs) {
      return "away";
    }
    return "online";
  }

  function normalizeDashboardPresenceEntries(entries = []) {
    if (!Array.isArray(entries)) {
      return {};
    }
    return Object.fromEntries(
      entries
        .map((entry) => {
          const userId = String(entry?.userId || entry?.user?.id || "").trim();
          if (!userId) {
            return null;
          }
          return [
            userId,
            {
              userId,
              status: normalizeDashboardPresenceStatus(entry.status),
              lastSeenAt: String(entry.lastSeenAt || entry.updatedAt || ""),
              lastActivityAt: String(entry.lastActivityAt || ""),
              workspaceId: String(entry.workspaceId || ""),
              typingThreadId: entry.typingThreadId ? normalizeDashboardChatThreadId(entry.typingThreadId, dashboardChatTeamThreadId) : "",
              typingAt: String(entry.typingAt || ""),
              updatedAt: String(entry.updatedAt || ""),
            },
          ];
        })
        .filter(Boolean)
    );
  }

  function getDashboardPresenceSignature(entriesByUserId = dashboardPresenceEntriesByUserId) {
    return Object.entries(entriesByUserId)
      .sort(([firstId], [secondId]) => firstId.localeCompare(secondId))
      .map(([userId, entry]) => `${userId}:${entry.status}:${entry.lastSeenAt}:${entry.typingThreadId}:${entry.typingAt}`)
      .join("|");
  }

  function applyDashboardPresenceEntries(entries = [], options = {}) {
    const nextEntries = normalizeDashboardPresenceEntries(entries);
    const nextSignature = getDashboardPresenceSignature(nextEntries);
    dashboardPresenceEntriesByUserId = nextEntries;
    if (!options.forceRender && nextSignature === dashboardPresenceLastRenderedSignature) {
      return;
    }
    dashboardPresenceLastRenderedSignature = nextSignature;
    renderDashboardChatWidget();
  }

  function getDashboardPresenceEntry(userId) {
    return dashboardPresenceEntriesByUserId[String(userId || "").trim()] || null;
  }

  function getDashboardPresenceStatus(userId) {
    return resolveDashboardPresenceStatus(getDashboardPresenceEntry(userId), String(userId || "").trim());
  }

  function getDashboardPresenceLabel(status) {
    const normalizedStatus = normalizeDashboardPresenceStatus(status);
    if (normalizedStatus === "online") {
      return "Online";
    }
    if (normalizedStatus === "away") {
      return "Passive";
    }
    return "Offline";
  }

  function getDashboardPresenceSummary(users = []) {
    return users.reduce(
      (summary, user) => {
        const status = getDashboardPresenceStatus(user.id);
        summary[status] = (summary[status] || 0) + 1;
        return summary;
      },
      { ...fallbackPresenceState }
    );
  }

  function renderDashboardPresenceDot(user, options = {}) {
    const status = getDashboardPresenceStatus(user?.id);
    const label = getDashboardPresenceLabel(status);
    return `
    <span
      class="dashboard-presence-dot is-${escapeHtml(status)}${options.inline ? " is-inline" : ""}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    ></span>
  `;
  }

  function renderDashboardPresenceAvatar(user, className) {
    return `
    <span class="dashboard-presence-avatar">
      ${renderUserAvatar(user, className)}
      ${renderDashboardPresenceDot(user)}
    </span>
  `;
  }

  function markDashboardPresenceActivity() {
    dashboardPresenceLastActivityAt = Date.now();
  }

  function getDashboardPresenceWorkspaceId() {
    return getHubState?.()?.activeWorkspaceId || "";
  }

  function getActiveDashboardTypingThreadId() {
    if (!dashboardChatTypingThreadId || Date.now() - dashboardChatTypingAt > dashboardTypingTtlMs) {
      return "";
    }
    return dashboardChatTypingThreadId;
  }

  async function pushDashboardPresence(statusOverride = "", options = {}) {
    const currentUser = getCurrentPlatformUser();
    const authStore = getPlatformAuthStore();
    if (!currentUser?.id || !authStore?.updatePresence || dashboardPresenceInFlight) return;
    if (!options.force && isDashboardPresenceBackoffActive()) return;
    if ((documentRef?.visibilityState || "") !== "visible" && statusOverride !== "away" && statusOverride !== "offline") return;

    const status = statusOverride || getDashboardSelfPresenceStatus();
    const typingThreadId = getActiveDashboardTypingThreadId();
    const payload = {
      lastActivityAt: new Date(dashboardPresenceLastActivityAt).toISOString(),
      workspaceId: getDashboardPresenceWorkspaceId(),
      typingThreadId,
      typingAt: typingThreadId ? new Date(dashboardChatTypingAt).toISOString() : "",
    };
    const now = Date.now();
    const minInterval = typingThreadId ? dashboardPresenceTypingPushMinMs : dashboardPresenceSteadyPushMinMs;
    if (!options.force && now - dashboardPresenceLastPushAt < minInterval) return;
    dashboardPresenceInFlight = true;

    try {
      const result = await authStore.updatePresence(status, payload);
      if (result?.ok) {
        clearDashboardPresenceBackoff();
        dashboardPresenceLastPushAt = now;
        applyDashboardPresenceEntries(result.entries, { forceRender: true });
      } else {
        markDashboardPresenceBackoff();
      }
    } catch {
      markDashboardPresenceBackoff();
    } finally {
      dashboardPresenceInFlight = false;
    }
  }

  async function refreshDashboardPresence(options = {}) {
    const currentUser = getCurrentPlatformUser();
    const authStore = getPlatformAuthStore();
    if (!currentUser?.id || !authStore?.getPresence || (documentRef?.visibilityState || "") !== "visible") return;
    if (!options.forceNetwork && isDashboardPresenceBackoffActive()) return;
    const now = Date.now();
    if (!options.forceNetwork && now - dashboardPresenceLastPollAt < dashboardPresencePollMinMs) return;
    dashboardPresenceLastPollAt = now;

    try {
      const result = await authStore.getPresence();
      if (result?.ok) {
        clearDashboardPresenceBackoff();
        applyDashboardPresenceEntries(result.entries, { forceRender: Boolean(options.forceRender) });
      } else {
        markDashboardPresenceBackoff();
      }
    } catch {
      markDashboardPresenceBackoff();
    }
  }

  function startDashboardPresenceRuntime() {
    const currentUser = getCurrentPlatformUser();
    if (!currentUser?.id) return stopDashboardPresenceRuntime();
    if (dashboardPresenceStarted) return;
    dashboardPresenceStarted = true;
    markDashboardPresenceActivity();
    pushDashboardPresence("online").catch(() => {});
    refreshDashboardPresence({ forceRender: true }).catch(() => {});

    dashboardPresenceHeartbeatTimer = win.setInterval(() => {
      pushDashboardPresence().catch(() => {});
    }, dashboardPresenceHeartbeatMs);
    dashboardPresencePollTimer = win.setInterval(() => {
      refreshDashboardPresence().catch(() => {});
    }, dashboardPresencePollMs);
  }

  function pauseDashboardPresenceRuntime(options = {}) {
    if (dashboardPresenceHeartbeatTimer) win.clearInterval(dashboardPresenceHeartbeatTimer);
    if (dashboardPresencePollTimer) win.clearInterval(dashboardPresencePollTimer);
    dashboardPresenceHeartbeatTimer = null;
    dashboardPresencePollTimer = null;
    dashboardPresenceStarted = false;
    if (!options.clearEntries) return;
    dashboardPresenceEntriesByUserId = {};
    dashboardPresenceLastRenderedSignature = "";
    renderDashboardChatWidget();
  }

  function stopDashboardPresenceRuntime() {
    pauseDashboardPresenceRuntime({ clearEntries: true });
  }

  function clearDashboardChatTyping() {
    dashboardChatTypingThreadId = "";
    dashboardChatTypingAt = 0;
    if (dashboardChatTypingClearTimer) {
      win.clearTimeout(dashboardChatTypingClearTimer);
      dashboardChatTypingClearTimer = null;
    }
    pushDashboardPresence().catch(() => {});
  }

  function queueDashboardChatTyping(threadId) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    dashboardChatTypingThreadId = normalizedThreadId;
    dashboardChatTypingAt = Date.now();
    if (dashboardChatTypingClearTimer) {
      win.clearTimeout(dashboardChatTypingClearTimer);
    }
    dashboardChatTypingClearTimer = win.setTimeout(() => {
      dashboardChatTypingClearTimer = null;
      clearDashboardChatTyping();
    }, dashboardTypingTtlMs);

    if (Date.now() - dashboardChatTypingLastSentAt < dashboardTypingSendThrottleMs) {
      return;
    }
    dashboardChatTypingLastSentAt = Date.now();
    pushDashboardPresence().catch(() => {});
  }

  function getDashboardTypingUsers(threadId, users = getPlatformUsers(), currentUser = getCurrentPlatformUser()) {
    const normalizedThreadId = normalizeDashboardChatThreadId(threadId, dashboardChatTeamThreadId);
    const now = Date.now();
    return users.filter((user) => {
      if (!user?.id || user.id === currentUser?.id) {
        return false;
      }
      const entry = getDashboardPresenceEntry(user.id);
      const typingAtMs = new Date(entry?.typingAt || 0).getTime();
      return (
        entry?.typingThreadId === normalizedThreadId &&
        Number.isFinite(typingAtMs) &&
        now - typingAtMs <= dashboardTypingTtlMs
      );
    });
  }

  function renderDashboardTypingIndicator(threadId, users, currentUser) {
    const typingUsers = getDashboardTypingUsers(threadId, users, currentUser);
    if (!typingUsers.length) {
      return "";
    }
    const names = typingUsers.slice(0, 2).map(formatUserName);
    const label = typingUsers.length === 1
      ? `${names[0]} is typing`
      : typingUsers.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : `${names[0]}, ${names[1]} and ${typingUsers.length - 2} more are typing`;
    return `<div class="dashboard-chat-typing" aria-live="polite"><span></span><span></span><span></span><strong>${escapeHtml(label)}</strong></div>`;
  }

  return {
    getDashboardPresenceSummary,
    getDashboardPresenceStatus,
    getDashboardPresenceLabel,
    renderDashboardPresenceDot: renderDashboardPresenceDot,
    renderDashboardPresenceAvatar,
    markDashboardPresenceActivity,
    pushDashboardPresence,
    refreshDashboardPresence,
    startDashboardPresenceRuntime,
    pauseDashboardPresenceRuntime,
    stopDashboardPresenceRuntime,
    clearDashboardChatTyping,
    queueDashboardChatTyping,
    getDashboardTypingUsers,
    renderDashboardTypingIndicator,
    applyDashboardPresenceEntries,
  };
}
