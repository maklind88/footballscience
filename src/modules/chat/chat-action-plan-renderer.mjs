import { getDashboardChatMessageWorkflowSignals } from "./chat-intelligence-renderer.mjs";

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value = "", limit = 78) {
  const text = normalizeText(value);
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function getThreadMessages(messages = [], activeThreadId = "team") {
  return (Array.isArray(messages) ? messages : []).filter((message) => String(message?.threadId || "") === String(activeThreadId));
}

function getMessageAuthorName(message = {}, users = [], formatUserName = () => "Staff") {
  const user = users.find((candidate) => candidate?.id === message.userId) || message.author || null;
  return user ? formatUserName(user) : "Staff";
}

function getUserNameById(userId = "", users = [], formatUserName = () => "Staff") {
  const user = users.find((candidate) => String(candidate?.id || "") === String(userId || ""));
  return user ? formatUserName(user) : "";
}

function getMentionedOwners(message = {}, users = [], formatUserName = () => "Staff") {
  const mentionedIds = new Set((Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : []).map(String));
  return users
    .filter((user) => user?.id && mentionedIds.has(String(user.id)))
    .map((user) => formatUserName(user))
    .filter(Boolean);
}

function getOwnerFromText(text = "") {
  const match = normalizeText(text).match(/\b(?:owner|responsible|assigned to)\s*:?\s*([A-Za-z][A-Za-z .'-]{1,36})/);
  return match ? match[1].replace(/\b(deadline|due|today|tomorrow|by)\b.*$/i, "").trim() : "";
}

function getActionOwner(message = {}, users = [], formatUserName = () => "Staff") {
  return getMentionedOwners(message, users, formatUserName)[0] || getOwnerFromText(message.text) || getMessageAuthorName(message, users, formatUserName);
}

function getActionDueLabel(text = "") {
  const normalizedText = normalizeText(text);
  const dateMatch = normalizedText.match(/\b(?:deadline|due|by)\s*:?\s*([A-Za-z0-9][A-Za-z0-9 ./:-]{1,28})/);
  if (dateMatch) {
    return dateMatch[1].replace(/\b(owner|responsible|assigned)\b.*$/i, "").replace(/[.,;:]+$/, "").trim();
  }
  const relativeMatch = normalizedText.match(/\b(today|tomorrow|tonight|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  return relativeMatch ? relativeMatch[1] : "No deadline";
}

function getActionPriority(message = {}) {
  const priority = String(message.priority || "").trim().toLowerCase();
  if (priority === "urgent" || /\b(urgent|must|asap|critical)\b/i.test(message.text || "")) {
    return "Urgent";
  }
  if (priority === "important" || /\b(important|high priority)\b/i.test(message.text || "")) {
    return "Important";
  }
  return "Normal";
}

function getPersistedActionPriority(actionItem = {}) {
  const priority = String(actionItem.priority || "normal").trim().toLowerCase();
  if (priority === "urgent") return "Urgent";
  if (priority === "important") return "Important";
  return "Normal";
}

function getPersistedActionOwner(actionItem = {}, users = [], formatUserName = () => "Staff") {
  return normalizeText(actionItem.ownerLabel) ||
    getUserNameById(actionItem.ownerId, users, formatUserName) ||
    "Unassigned";
}

function getPersistedActionDue(actionItem = {}, formatTime = () => "") {
  return normalizeText(actionItem.dueLabel) ||
    (actionItem.dueAt ? formatTime(actionItem.dueAt) : "") ||
    "No deadline";
}

function getMessageSummary(message = {}) {
  return truncateText(message.text || "Message");
}

function normalizePersistedActionItems(actionItems = [], activeThreadId = "team", users = [], formatUserName = () => "Staff", formatTime = () => "") {
  return (Array.isArray(actionItems) ? actionItems : [])
    .filter((actionItem) => String(actionItem?.threadId || activeThreadId) === String(activeThreadId))
    .filter((actionItem) => String(actionItem?.status || "open").toLowerCase() !== "archived")
    .map((actionItem) => ({
      actionItem,
      actionItemId: String(actionItem.id || actionItem.actionItemId || "").trim(),
      persisted: true,
      message: { id: actionItem.messageId || "", createdAt: actionItem.createdAt || "" },
      owner: getPersistedActionOwner(actionItem, users, formatUserName),
      due: getPersistedActionDue(actionItem, formatTime),
      priority: getPersistedActionPriority(actionItem),
      status: String(actionItem.status || "open").toLowerCase() === "done" ? "done" : "open",
      summary: truncateText(actionItem.title || "Action item"),
      createdAt: actionItem.createdAt || "",
    }))
    .filter((action) => action.actionItemId && action.summary);
}

function buildThreadActionPlan({ messages = [], activeThreadId = "team", users = [], pinnedMessages = [], actionItems = [], formatUserName = () => "Staff", formatTime = () => "" } = {}) {
  const threadMessages = getThreadMessages(messages, activeThreadId);
  const signalMessages = threadMessages.map((message) => ({
    message,
    signals: getDashboardChatMessageWorkflowSignals(message),
  }));
  const persistedActions = normalizePersistedActionItems(actionItems, activeThreadId, users, formatUserName, formatTime);
  const persistedMessageIds = new Set(persistedActions.map((action) => String(action.message?.id || "")).filter(Boolean));
  const signalActions = signalMessages
    .filter((entry) => entry.signals.includes("action"))
    .filter((entry) => !persistedMessageIds.has(String(entry.message?.id || "")))
    .map(({ message }) => ({
      message,
      persisted: false,
      status: "signal",
      owner: getActionOwner(message, users, formatUserName),
      due: getActionDueLabel(message.text),
      priority: getActionPriority(message),
      summary: getMessageSummary(message),
    }));
  const actions = [...persistedActions, ...signalActions];
  const decisions = [
    ...signalMessages.filter((entry) => entry.signals.includes("decision")).map((entry) => entry.message),
    ...getThreadMessages(pinnedMessages, activeThreadId),
  ].filter((message, index, source) => source.findIndex((candidate) => candidate?.id === message?.id) === index);
  const evidenceCount = signalMessages.filter((entry) => entry.signals.includes("evidence")).length;
  const reviewCount = signalMessages.filter((entry) => entry.signals.includes("review")).length;
  const latestAction = actions.find((action) => action.persisted && action.status !== "done") || actions.at(-1) || null;

  return {
    actions,
    persistedActions,
    decisions,
    evidenceCount,
    reviewCount,
    latestAction,
    summary: {
      owner: latestAction?.owner || "Unassigned",
      due: latestAction?.due || "No deadline",
      next: latestAction?.summary || "No active action",
      decision: decisions.at(-1) ? getMessageSummary(decisions.at(-1)) : "No decision captured",
    },
  };
}

export function createDashboardChatActionPlanRenderer(dependencies = {}) {
  const {
    teamThreadId = "team",
    escapeHtml = (value) => String(value ?? ""),
    formatUserName = () => "Staff",
    formatTime = () => "",
  } = dependencies;

  function renderActionSummaryCard(key = "", label = "", value = "", detail = "") {
    return `
      <article data-dashboard-chat-action-plan-summary="${escapeHtml(key)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(detail)}</small>
      </article>
    `;
  }

  function renderActionItem(action = {}) {
    const messageId = String(action.message?.id || "").trim();
    const actionItemId = String(action.actionItemId || "").trim();
    const status = String(action.status || "").trim().toLowerCase();
    const statusDetail = action.persisted ? (status === "done" ? "Done" : "Saved") : "Signal";
    return `
      <article class="dashboard-chat-intelligence-card dashboard-chat-action-item is-${escapeHtml(action.priority.toLowerCase())} ${action.persisted ? "is-persisted" : "is-signal"} ${status === "done" ? "is-done" : ""}" data-dashboard-chat-action-item data-dashboard-chat-action-message="${escapeHtml(messageId)}" data-dashboard-chat-action-item-id="${escapeHtml(actionItemId)}">
        <div>
          <span class="dashboard-chat-intelligence-thumb">ACT</span>
          <span class="dashboard-chat-intelligence-copy">
            <small>${escapeHtml(`${action.priority} - ${action.owner} - ${statusDetail}`)}</small>
            <strong>${escapeHtml(action.summary)}</strong>
            <em>${escapeHtml(action.due)}</em>
          </span>
        </div>
        ${
          action.persisted && actionItemId
            ? `<footer class="dashboard-chat-intelligence-actions"><button type="button" data-dashboard-chat-action-item-status="${escapeHtml(status === "done" ? "open" : "done")}" data-dashboard-chat-action-item-id="${escapeHtml(actionItemId)}">${escapeHtml(status === "done" ? "Reopen" : "Done")}</button></footer>`
            : messageId
              ? `<footer class="dashboard-chat-intelligence-actions"><button type="button" data-dashboard-copy-message="${escapeHtml(messageId)}" data-dashboard-chat-promote-target="task" data-dashboard-chat-action-title="${escapeHtml(action.summary)}" data-dashboard-chat-action-owner-label="${escapeHtml(action.owner)}" data-dashboard-chat-action-due-label="${escapeHtml(action.due)}" data-dashboard-chat-action-priority="${escapeHtml(action.priority.toLowerCase())}">Task</button></footer>`
              : ""
        }
      </article>
    `;
  }

  function renderFallbackActionItem() {
    return `
      <article class="dashboard-chat-intelligence-card dashboard-chat-action-item is-empty">
        <div>
          <span class="dashboard-chat-intelligence-thumb">OK</span>
          <span class="dashboard-chat-intelligence-copy">
            <small>No active action</small>
            <strong>No action items yet</strong>
            <em>Use action, owner or deadline language in chat to build this plan.</em>
          </span>
        </div>
      </article>
    `;
  }

  function renderThreadActionPlanPanel({ messages = [], activeThreadId = teamThreadId, users = [], pinnedMessages = [], actionItems = [] } = {}) {
    const plan = buildThreadActionPlan({ messages, activeThreadId, users, pinnedMessages, actionItems, formatUserName, formatTime });
    const latestActionTime = plan.latestAction?.message?.createdAt ? formatTime(plan.latestAction.message.createdAt) : "";
    return `
      <div class="dashboard-chat-details-section dashboard-chat-action-plan" data-dashboard-chat-action-plan>
        <div class="dashboard-chat-details-section-head">
          <strong>Action plan</strong>
          <small>${escapeHtml(plan.persistedActions.length ? `${plan.persistedActions.length} saved action${plan.persistedActions.length === 1 ? "" : "s"}` : plan.actions.length ? `${plan.actions.length} active signal${plan.actions.length === 1 ? "" : "s"}` : "No active actions")}</small>
        </div>
        <div class="dashboard-chat-details-grid">
          ${renderActionSummaryCard("owner", "Owner", plan.summary.owner, latestActionTime || "Latest action owner")}
          ${renderActionSummaryCard("due", "Deadline", plan.summary.due, "From latest action")}
          ${renderActionSummaryCard("decision", "Decision", plan.summary.decision, `${plan.decisions.length} captured`)}
          ${renderActionSummaryCard("evidence", "Evidence", String(plan.evidenceCount), `${plan.reviewCount} review item${plan.reviewCount === 1 ? "" : "s"}`)}
        </div>
        ${
          plan.actions.length
            ? `<div class="dashboard-chat-intelligence-grid dashboard-chat-action-list">${plan.actions.slice(-3).reverse().map(renderActionItem).join("")}</div>`
            : `<div class="dashboard-chat-intelligence-grid dashboard-chat-action-list">${renderFallbackActionItem()}</div>`
        }
      </div>
    `;
  }

  return Object.freeze({
    renderThreadActionPlanPanel,
  });
}
