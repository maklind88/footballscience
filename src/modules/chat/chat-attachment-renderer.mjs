function getStorageRef(attachment = {}) {
  const bucket = String(attachment.bucket || attachment.storage_bucket || "").trim();
  const path = String(attachment.path || attachment.storage_path || "").trim();
  return bucket && path ? { bucket, path } : null;
}

export function createDashboardChatAttachmentRenderer({ escapeHtml, getSupabaseClient, renderChatWidget }) {
  const signedUrlCache = new Map();
  const cacheKey = (attachment = {}) => {
    const storageRef = getStorageRef(attachment);
    return storageRef ? `${storageRef.bucket}:${storageRef.path}` : "";
  };
  const getSignedUrl = (attachment = {}) => {
    const cached = signedUrlCache.get(cacheKey(attachment));
    return cached?.url && Date.now() <= Number(cached.expiresAt || 0) ? cached.url : "";
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
          if (!error) renderChatWidget?.();
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
      const signedUrl = getSignedUrl(attachment);
      const content = `<span aria-hidden="true">□</span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(signedUrl ? sizeLabel : `${sizeLabel} · preparing`)}</small>`;
      return signedUrl
        ? `<button type="button" class="dashboard-chat-attachment-pill" data-dashboard-chat-attachment-preview data-dashboard-chat-attachment-url="${escapeHtml(signedUrl)}" data-dashboard-chat-attachment-name="${escapeHtml(name)}" data-dashboard-chat-attachment-mime="${escapeHtml(mimeType)}">${content}</button>`
        : `<span class="dashboard-chat-attachment-pill">${content}</span>`;
    }).join("")}</div>`;
  };
  return { queueSignedUrls, renderMessageAttachments };
}
