const WORKFLOW_CARDS = [
  { key: "action", label: "Needs action", emptyTitle: "Clear", emptyDetail: "No action signal" },
  { key: "decision", label: "Decision made", emptyTitle: "Open", emptyDetail: "No decision captured" },
  { key: "evidence", label: "Evidence attached", emptyTitle: "0 evidence", emptyDetail: "Clips, files and links" },
  { key: "review", label: "Review later", emptyTitle: "None", emptyDetail: "Nothing parked" },
];

const SIGNAL_LABELS = {
  action: "Needs action",
  decision: "Decision",
  evidence: "Evidence",
  review: "Review",
};

function normalizeText(message = {}) {
  return String(message?.text || "").replace(/\s+/g, " ").trim();
}

function truncateText(value = "", limit = 72) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function getMessageAttachments(message = {}) {
  return Array.isArray(message?.attachments) ? message.attachments.filter(Boolean) : [];
}

function getAttachmentName(attachment = {}) {
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

function getAttachmentKind(attachment = {}) {
  const mimeType = getAttachmentMimeType(attachment);
  const fileName = getAttachmentName(attachment).toLowerCase();
  if (mimeType.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(fileName)) {
    return "video";
  }
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(fileName)) {
    return "image";
  }
  if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
    return "doc";
  }
  if (mimeType.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(fileName)) {
    return "sheet";
  }
  return "file";
}

function getAttachmentUrl(attachment = {}) {
  return String(attachment.signedUrl || attachment.url || attachment.publicUrl || "").trim();
}

function getAttachmentThumbnailUrl(attachment = {}) {
  return String(
    attachment.thumbnailUrl ||
      attachment.thumbnail_url ||
      attachment.previewUrl ||
      attachment.preview_url ||
      attachment.metadata?.thumbnailUrl ||
      attachment.metadata?.thumbnail_url ||
      ""
  ).trim();
}

function textMatches(text = "", pattern) {
  return pattern.test(String(text || "").toLowerCase());
}

function hasUrl(text = "") {
  return /\bhttps?:\/\/[^\s<>"']+/i.test(String(text || ""));
}

export function getDashboardChatMessageWorkflowSignals(message = {}) {
  const text = normalizeText(message);
  const priority = String(message.priority || "").trim().toLowerCase();
  const attachments = getMessageAttachments(message);
  const signals = [];

  if (
    message.pinnedAt ||
    textMatches(text, /\b(decision|decided|agreed|confirmed|approved|locked|final call|we will|we go with)\b/)
  ) {
    signals.push("decision");
  }

  if (
    priority === "urgent" ||
    priority === "important" ||
    textMatches(text, /\b(needs action|action|todo|to do|follow up|owner|deadline|urgent|important|must|next step)\b/)
  ) {
    signals.push("action");
  }

  if (attachments.length || hasUrl(text) || textMatches(text, /\b(evidence|clip|video|tagged|attached|attachment|analysis|report|link)\b/)) {
    signals.push("evidence");
  }

  if (textMatches(text, /\b(review later|review|revisit|circle back|watch later|check later)\b/)) {
    signals.push("review");
  }

  return [...new Set(signals)];
}

function getThreadMessages(messages = [], activeThreadId = "team") {
  return messages.filter((message) => String(message?.threadId || "") === String(activeThreadId));
}

function getMessageAuthorName(message = {}, users = [], formatUserName = () => "Staff") {
  const user = users.find((candidate) => candidate?.id === message.userId) || message.author || null;
  return user ? formatUserName(user) : "Staff";
}

function getMessageSummary(message = {}) {
  const text = normalizeText(message);
  if (text) {
    return truncateText(text, 74);
  }
  const attachment = getMessageAttachments(message)[0];
  return attachment ? getAttachmentName(attachment) : "Message";
}

function buildSignalBuckets(messages = [], activeThreadId = "team", pinnedMessages = []) {
  const bucketMap = {
    action: [],
    decision: [],
    evidence: [],
    review: [],
  };
  const threadMessages = getThreadMessages(messages, activeThreadId);

  threadMessages.forEach((message) => {
    getDashboardChatMessageWorkflowSignals(message).forEach((signal) => {
      if (bucketMap[signal]) {
        bucketMap[signal].push(message);
      }
    });
  });

  pinnedMessages
    .filter((message) => String(message?.threadId || "") === String(activeThreadId))
    .forEach((message) => {
      if (!bucketMap.decision.some((candidate) => candidate.id === message.id)) {
        bucketMap.decision.push(message);
      }
    });

  return bucketMap;
}

function getLatestMessage(messages = []) {
  return [...messages].reverse()[0] || null;
}

function getSmartSummary({ messages = [], activeThreadId = "team", pinnedMessages = [] } = {}) {
  const buckets = buildSignalBuckets(messages, activeThreadId, pinnedMessages);
  const counts = {
    action: buckets.action.length,
    decision: buckets.decision.length,
    evidence: buckets.evidence.length,
    review: buckets.review.length,
  };
  const totalSignals = counts.action + counts.decision + counts.evidence + counts.review;

  if (counts.action) {
    return { title: "Action needed", detail: `${counts.action} action signal${counts.action === 1 ? "" : "s"} in this thread`, counts };
  }
  if (counts.decision) {
    return { title: "Decision captured", detail: `${counts.decision} decision${counts.decision === 1 ? "" : "s"} pinned or detected`, counts };
  }
  if (counts.evidence) {
    return { title: "Evidence ready", detail: `${counts.evidence} evidence item${counts.evidence === 1 ? "" : "s"} available`, counts };
  }
  if (counts.review) {
    return { title: "Review queue", detail: `${counts.review} item${counts.review === 1 ? "" : "s"} marked for review`, counts };
  }
  return { title: "Clean thread", detail: totalSignals ? "Signals detected" : "No workflow signals yet", counts };
}

function getMentionedUsers(message = {}, users = []) {
  const ids = new Set(Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds.map(String) : []);
  return users.filter((user) => user?.id && ids.has(String(user.id)));
}

function getContextType(message = {}) {
  const text = normalizeText(message);
  if (textMatches(text, /\b(training|session|drill|practice|rondo|exercise)\b/)) {
    return "training";
  }
  if (textMatches(text, /\b(match|game|opponent|fixture|goal|press|build-up|transition|corner|throw-in|event)\b/)) {
    return "match";
  }
  return "";
}

function getIntelligenceCards({ messages = [], activeThreadId = "team", users = [], pinnedMessages = [] } = {}) {
  const cards = [];
  const seen = new Set();
  const threadMessages = getThreadMessages(messages, activeThreadId);
  const buckets = buildSignalBuckets(messages, activeThreadId, pinnedMessages);

  threadMessages.forEach((message) => {
    getMessageAttachments(message).forEach((attachment, index) => {
      const kind = getAttachmentKind(attachment);
      const key = `attachment:${message.id}:${attachment.id || index}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      cards.push({
        key,
        type: kind,
        label: kind === "video" ? "Video card" : kind === "image" ? "Image evidence" : "Evidence card",
        title: getAttachmentName(attachment),
        detail: getMessageSummary(message),
        message,
        url: getAttachmentUrl(attachment),
        thumbnailUrl: getAttachmentThumbnailUrl(attachment),
      });
    });
  });

  threadMessages.forEach((message) => {
    getMentionedUsers(message, users).forEach((user) => {
      const key = `player:${message.id}:${user.id}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      cards.push({
        key,
        type: "player",
        label: "Player card",
        title: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Player",
        detail: getMessageSummary(message),
        message,
        user,
      });
    });
  });

  threadMessages.forEach((message) => {
    const contextType = getContextType(message);
    if (!contextType) {
      return;
    }
    const key = `${contextType}:${message.id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    cards.push({
      key,
      type: contextType,
      label: contextType === "training" ? "Training-session card" : "Match-event card",
      title: contextType === "training" ? "Training context" : "Match context",
      detail: getMessageSummary(message),
      message,
    });
  });

  buckets.decision.slice(-4).forEach((message) => {
    const key = `decision:${message.id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    cards.push({
      key,
      type: "decision",
      label: "Decision card",
      title: "Decision made",
      detail: getMessageSummary(message),
      message,
    });
  });

  return cards.slice(-10).reverse();
}

export function createDashboardChatIntelligenceRenderer(dependencies = {}) {
  const {
    teamThreadId = "team",
    escapeHtml = (value) => String(value ?? ""),
    formatUserName = () => "Staff",
    formatTime = () => "",
    renderPresenceAvatar = () => `<span class="dashboard-chat-stack-avatar is-team">T</span>`,
  } = dependencies;

  function renderMessageWorkflowBadges(message = {}) {
    const signals = getDashboardChatMessageWorkflowSignals(message);
    if (!signals.length) {
      return "";
    }
    return `
      <div class="dashboard-chat-message-signals" aria-label="Message context">
        ${signals
          .slice(0, 3)
          .map((signal) => `<span class="is-${escapeHtml(signal)}">${escapeHtml(SIGNAL_LABELS[signal] || signal)}</span>`)
          .join("")}
      </div>
    `;
  }

  function renderMessagePromoteActions(message = {}) {
    const messageId = String(message?.id || "").trim();
    if (!messageId) {
      return "";
    }
    return `
      <div class="dashboard-chat-promote-group" role="group" aria-label="Promote message">
        <strong>Promote</strong>
        <button type="button" data-dashboard-copy-message="${escapeHtml(messageId)}" data-dashboard-chat-promote-target="task">Task</button>
        <button type="button" data-dashboard-copy-message="${escapeHtml(messageId)}" data-dashboard-chat-promote-target="review">Review</button>
        <button type="button" data-dashboard-copy-message="${escapeHtml(messageId)}" data-dashboard-chat-promote-target="player-note">Player note</button>
      </div>
    `;
  }

  function renderWorkflowCard(card, buckets = {}, users = []) {
    const messages = buckets[card.key] || [];
    const latest = getLatestMessage(messages);
    const count = messages.length;
    const author = latest ? getMessageAuthorName(latest, users, formatUserName) : "";
    const title = latest ? getMessageSummary(latest) : card.emptyTitle;
    const detail = latest
      ? `${author}${latest.createdAt ? `, ${formatTime(latest.createdAt)}` : ""}`
      : card.emptyDetail;

    return `
      <article class="dashboard-chat-workflow-card is-${escapeHtml(card.key)}${latest ? " has-signal" : " is-empty"}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(count ? `${count} · ${title}` : title)}</strong>
        <small>${escapeHtml(detail)}</small>
      </article>
    `;
  }

  function renderCoachWorkflowPanel({ messages = [], activeThreadId = teamThreadId, users = [], pinnedMessages = [] } = {}) {
    const buckets = buildSignalBuckets(messages, activeThreadId, pinnedMessages);
    return `
      <section class="dashboard-chat-coach-workflow" data-dashboard-chat-coach-workflow aria-label="Conversation workflow">
        ${WORKFLOW_CARDS.map((card) => renderWorkflowCard(card, buckets, users)).join("")}
      </section>
    `;
  }

  function renderCardThumbnail(card = {}) {
    if (card.thumbnailUrl || card.type === "image") {
      const imageUrl = card.thumbnailUrl || card.url || "";
      if (imageUrl) {
        return `<span class="dashboard-chat-intelligence-thumb has-image"><img src="${escapeHtml(imageUrl)}" alt=""></span>`;
      }
    }
    if (card.type === "player" && card.user) {
      return renderPresenceAvatar(card.user, "dashboard-chat-intelligence-thumb is-player");
    }
    const label = {
      video: "VID",
      image: "IMG",
      doc: "DOC",
      sheet: "XLS",
      training: "TRN",
      match: "MAT",
      decision: "DEC",
      player: "PLY",
      file: "FILE",
    }[card.type] || "FS";
    return `<span class="dashboard-chat-intelligence-thumb">${escapeHtml(label)}</span>`;
  }

  function renderCardPromoteActions(card = {}) {
    const messageId = String(card.message?.id || "").trim();
    if (!messageId) {
      return "";
    }
    const primaryTarget = card.type === "player" ? "player-note" : card.type === "decision" ? "review" : "task";
    return `
      <footer class="dashboard-chat-intelligence-actions">
        <button type="button" data-dashboard-copy-message="${escapeHtml(messageId)}" data-dashboard-chat-promote-target="${escapeHtml(primaryTarget)}">${escapeHtml(primaryTarget === "player-note" ? "Player note" : primaryTarget === "review" ? "Review" : "Task")}</button>
        <button type="button" data-dashboard-copy-message="${escapeHtml(messageId)}" data-dashboard-chat-promote-target="review">Review later</button>
      </footer>
    `;
  }

  function renderIntelligenceCard(card = {}) {
    const url = String(card.url || "").trim();
    const body = `
      ${renderCardThumbnail(card)}
      <span class="dashboard-chat-intelligence-copy">
        <small>${escapeHtml(card.label || "Evidence card")}</small>
        <strong>${escapeHtml(truncateText(card.title || "Context", 44))}</strong>
        <em>${escapeHtml(truncateText(card.detail || "Thread context", 74))}</em>
      </span>
    `;
    const cardMarkup = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
      : `<div>${body}</div>`;

    return `
      <article class="dashboard-chat-intelligence-card is-${escapeHtml(card.type || "context")}" data-dashboard-chat-evidence-kind="${escapeHtml(card.type || "context")}">
        ${cardMarkup}
        ${renderCardPromoteActions(card)}
      </article>
    `;
  }

  function renderConversationIntelligenceRail({ messages = [], activeThreadId = teamThreadId, users = [], pinnedMessages = [] } = {}) {
    const summary = getSmartSummary({ messages, activeThreadId, pinnedMessages });
    const cards = getIntelligenceCards({ messages, activeThreadId, users, pinnedMessages }).slice(0, 4);

    return `
      <section class="dashboard-chat-intelligence-rail" data-dashboard-chat-intelligence-rail aria-label="Thread intelligence summary">
        <div class="dashboard-chat-smart-summary">
          <span>Smart summary</span>
          <strong>${escapeHtml(summary.title)}</strong>
          <small>${escapeHtml(summary.detail)}</small>
        </div>
        ${
          cards.length
            ? `<div class="dashboard-chat-intelligence-mini-grid">${cards.map(renderIntelligenceCard).join("")}</div>`
            : `<div class="dashboard-chat-intelligence-empty"><strong>No evidence yet</strong><small>Attach clips, files or link context.</small></div>`
        }
      </section>
    `;
  }

  function renderThreadIntelligencePanel({ messages = [], activeThreadId = teamThreadId, activeThreadLabel = "Conversation", users = [], pinnedMessages = [] } = {}) {
    const summary = getSmartSummary({ messages, activeThreadId, pinnedMessages });
    const cards = getIntelligenceCards({ messages, activeThreadId, users, pinnedMessages });

    return `
      <div class="dashboard-chat-details-section dashboard-chat-intelligence-panel" data-dashboard-chat-intelligence-panel>
        <div class="dashboard-chat-details-section-head">
          <strong>Intelligence</strong>
          <small>${escapeHtml(activeThreadLabel)}</small>
        </div>
        <div class="dashboard-chat-intelligence-summary">
          <span>Smart summary</span>
          <strong>${escapeHtml(summary.title)}</strong>
          <small>${escapeHtml(summary.detail)}</small>
        </div>
        ${
          cards.length
            ? `<div class="dashboard-chat-intelligence-grid">${cards.map(renderIntelligenceCard).join("")}</div>`
            : `<div class="dashboard-chat-intelligence-empty"><strong>No cards yet</strong><small>Evidence and decisions will appear here.</small></div>`
        }
      </div>
    `;
  }

  return Object.freeze({
    renderCoachWorkflowPanel,
    renderConversationIntelligenceRail,
    renderThreadIntelligencePanel,
    renderMessageWorkflowBadges,
    renderMessagePromoteActions,
  });
}
