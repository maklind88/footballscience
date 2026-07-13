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

function getMessageSummary(message = {}) {
  return truncateText(message.text || "Message");
}

function buildThreadActionPlan({ messages = [], activeThreadId = "team", users = [], pinnedMessages = [], formatUserName = () => "Staff" } = {}) {
  const threadMessages = getThreadMessages(messages, activeThreadId);
  const signalMessages = threadMessages.map((message) => ({
    message,
    signals: getDashboardChatMessageWorkflowSignals(message),
  }));
  const actions = signalMessages
    .filter((entry) => entry.signals.includes("action"))
    .map(({ message }) => ({
      message,
      owner: getActionOwner(message, users, formatUserName),
      due: getActionDueLabel(message.text),
      priority: getActionPriority(message),
      summary: getMessageSummary(message),
    }));
  const decisions = [
    ...signalMessages.filter((entry) => entry.signals.includes("decision")).map((entry) => entry.message),
    ...getThreadMessages(pinnedMessages, activeThreadId),
  ].filter((message, index, source) => source.findIndex((candidate) => candidate?.id === message?.id) === index);
  const evidenceCount = signalMessages.filter((entry) => entry.signals.includes("evidence")).length;
  const reviewCount = signalMessages.filter((entry) => entry.signals.includes("review")).length;
  const latestAction = actions.at(-1) || null;

  return {
    actions,
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
    return `
      <article class="dashboard-chat-intelligence-card dashboard-chat-action-item is-${escapeHtml(action.priority.toLowerCase())}" data-dashboard-chat-action-item data-dashboard-chat-action-message="${escapeHtml(messageId)}">
        <div>
          <span class="dashboard-chat-intelligence-thumb">ACT</span>
          <span class="dashboard-chat-intelligence-copy">
            <small>${escapeHtml(`${action.priority} - ${action.owner}`)}</small>
            <strong>${escapeHtml(action.summary)}</strong>
            <em>${escapeHtml(action.due)}</em>
          </span>
        </div>
        ${messageId ? `<footer class="dashboard-chat-intelligence-actions"><button type="button" data-dashboard-copy-message="${escapeHtml(messageId)}" data-dashboard-chat-promote-target="task">Task</button></footer>` : ""}
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

  function renderThreadActionPlanPanel({ messages = [], activeThreadId = teamThreadId, users = [], pinnedMessages = [] } = {}) {
    const plan = buildThreadActionPlan({ messages, activeThreadId, users, pinnedMessages, formatUserName });
    const latestActionTime = plan.latestAction?.message?.createdAt ? formatTime(plan.latestAction.message.createdAt) : "";
    return `
      <div class="dashboard-chat-details-section dashboard-chat-action-plan" data-dashboard-chat-action-plan>
        <div class="dashboard-chat-details-section-head">
          <strong>Action plan</strong>
          <small>${escapeHtml(plan.actions.length ? `${plan.actions.length} active signal${plan.actions.length === 1 ? "" : "s"}` : "No active actions")}</small>
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
