function getStorageRef(attachment = {}) {
  const bucket = String(attachment.bucket || attachment.storage_bucket || "").trim();
  const path = String(attachment.path || attachment.storage_path || "").trim();
  return bucket && path ? { bucket, path } : null;
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
      const name = attachment.metadata?.fileName || attachment.fileName || "Attachment";
      const mimeType = attachment.mimeType || attachment.mime_type || attachment.metadata?.mimeType || "";
      const size = Number(attachment.byte_size || attachment.byteSize || 0);
      const sizeLabel = size ? `${Math.ceil(size / 1024)} KB` : "Pending";
      const key = cacheKey(attachment);
      const signedUrl = getSignedUrl(attachment);
      if (signedUrl) queueAttachmentTargetUpdate(attachment);
      const content = `<span aria-hidden="true">□</span><strong>${escapeHtml(name)}</strong><small data-dashboard-chat-attachment-status>${escapeHtml(`${sizeLabel} · preparing`)}</small>`;
      return `<button type="button" class="dashboard-chat-attachment-pill is-loading" data-dashboard-chat-attachment-preview data-dashboard-chat-attachment-key="${escapeHtml(key)}" data-dashboard-chat-attachment-url="" data-dashboard-chat-attachment-name="${escapeHtml(name)}" data-dashboard-chat-attachment-mime="${escapeHtml(mimeType)}" disabled>${content}</button>`;
    }).join("")}</div>`;
  };
  return { queueSignedUrls, renderMessageAttachments };
}
