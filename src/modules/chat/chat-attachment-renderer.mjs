function getStorageRef(attachment = {}) {
  const bucket = String(attachment.bucket || attachment.storage_bucket || "").trim();
  const path = String(attachment.path || attachment.storage_path || "").trim();
  return bucket && path ? { bucket, path } : null;
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
  return String(attachment.mimeType || attachment.mime_type || attachment.metadata?.mimeType || "").toLowerCase();
}

function getAttachmentKind(attachment = {}) {
  const mimeType = getAttachmentMimeType(attachment);
  const name = getAttachmentName(attachment).toLowerCase();
  if (mimeType.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) return { key: "video", label: "Clip" };
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(name)) return { key: "image", label: "Image" };
  if (mimeType.includes("pdf") || /\.pdf$/.test(name)) return { key: "pdf", label: "PDF" };
  if (mimeType.includes("spreadsheet") || /\.(csv|xlsx?)$/.test(name)) return { key: "sheet", label: "Sheet" };
  if (mimeType.includes("document") || /\.(docx?|pptx?)$/.test(name)) return { key: "doc", label: "Doc" };
  return { key: "file", label: "File" };
}

export function createDashboardChatAttachmentRenderer({ escapeHtml, getSupabaseClient }) {
  const signedUrlCache = new Map();
  const cacheKey = (attachment = {}) => {
    const storageRef = getStorageRef(attachment);
    return storageRef ? `${storageRef.bucket}:${storageRef.path}` : "";
  };
  const selectorValue = (value) => (globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&"));
  const getSignedUrl = (attachment = {}) => {
    const cached = signedUrlCache.get(cacheKey(attachment));
    return cached?.url && Date.now() <= Number(cached.expiresAt || 0) ? cached.url : "";
  };
  const updateAttachmentTargets = (attachment = {}) => {
    if (typeof document === "undefined") return;
    const key = cacheKey(attachment);
    const signedUrl = getSignedUrl(attachment);
    if (!key || !signedUrl) return;
    document.querySelectorAll(`[data-dashboard-chat-attachment-key="${selectorValue(key)}"]`).forEach((node) => {
      node.disabled = false;
      node.classList.remove("is-loading");
      node.dataset.dashboardChatAttachmentUrl = signedUrl;
      const size = Number(attachment.byte_size || attachment.byteSize || 0);
      const statusNode = node.querySelector("[data-dashboard-chat-attachment-status]");
      if (statusNode) statusNode.textContent = size ? `${Math.ceil(size / 1024)} KB` : "Ready";
      const actionNode = node.querySelector(".dashboard-chat-evidence-action");
      if (actionNode) actionNode.textContent = "Open";
    });
  };
  const queueAttachmentTargetUpdate = (attachment = {}) => {
    const run = () => updateAttachmentTargets(attachment);
    if (typeof queueMicrotask === "function") {
      queueMicrotask(run);
      return;
    }
    setTimeout(run, 0);
  };
  const queueSignedUrls = (messages = []) => {
    const supabase = getSupabaseClient?.();
    if (!supabase?.storage?.from) return;
    messages
      .flatMap((message) => (Array.isArray(message.attachments) ? message.attachments : []))
      .filter((attachment) => String(attachment.status || "ready").toLowerCase() === "ready")
      .forEach((attachment) => {
        const storageRef = getStorageRef(attachment);
        const key = cacheKey(attachment);
        const cached = key ? signedUrlCache.get(key) : null;
        if (!storageRef || !key || cached?.pending || (cached?.url && Date.now() < Number(cached.expiresAt || 0))) return;
        signedUrlCache.set(key, { pending: true, expiresAt: Date.now() + 30000 });
        supabase.storage.from(storageRef.bucket).createSignedUrl(storageRef.path, 600).then(({ data, error }) => {
          signedUrlCache.set(key, error
            ? { pending: false, error: error.message, expiresAt: Date.now() + 30000 }
            : { pending: false, url: data?.signedUrl || data?.signedURL || "", expiresAt: Date.now() + 9 * 60 * 1000 });
          if (!error) updateAttachmentTargets(attachment);
        }).catch((error) => signedUrlCache.set(key, { pending: false, error: error?.message || "Signing failed.", expiresAt: Date.now() + 30000 }));
      });
  };
  const renderMessageAttachments = (message = {}) => {
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (!attachments.length) return "";
    return `<div class="dashboard-chat-attachments" aria-label="Message attachments">${attachments.map((attachment) => {
      const name = getAttachmentName(attachment);
      const mimeType = getAttachmentMimeType(attachment);
      const kind = getAttachmentKind(attachment);
      const size = Number(attachment.byte_size || attachment.byteSize || 0);
      const sizeLabel = size ? `${Math.ceil(size / 1024)} KB` : "Pending";
      const key = cacheKey(attachment);
      const signedUrl = getSignedUrl(attachment);
      if (signedUrl) queueAttachmentTargetUpdate(attachment);
      const statusLabel = signedUrl ? sizeLabel : `${sizeLabel} · preparing`;
      const content = `
        <span class="dashboard-chat-evidence-icon is-${escapeHtml(kind.key)}" aria-hidden="true">${escapeHtml(kind.label)}</span>
        <span class="dashboard-chat-evidence-copy">
          <strong>${escapeHtml(name)}</strong>
          <small><span>${escapeHtml(kind.label)} evidence</span><span data-dashboard-chat-attachment-status>${escapeHtml(statusLabel)}</span></small>
        </span>
        <span class="dashboard-chat-evidence-action">${signedUrl ? "Open" : "Preparing"}</span>
      `;
      return `<button type="button" class="dashboard-chat-attachment-pill dashboard-chat-evidence-card is-${escapeHtml(kind.key)}${signedUrl ? "" : " is-loading"}" data-dashboard-chat-attachment-preview data-dashboard-chat-attachment-key="${escapeHtml(key)}" data-dashboard-chat-attachment-url="${escapeHtml(signedUrl)}" data-dashboard-chat-attachment-name="${escapeHtml(name)}" data-dashboard-chat-attachment-mime="${escapeHtml(mimeType)}" ${signedUrl ? "" : "disabled"}>${content}</button>`;
    }).join("")}</div>`;
  };
  return { queueSignedUrls, renderMessageAttachments };
}
