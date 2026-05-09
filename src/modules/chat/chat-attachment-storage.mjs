function getAttachmentStorageRef(attachment = {}) {
  const bucket = String(attachment.bucket || attachment.storage_bucket || "").trim();
  const path = String(attachment.path || attachment.storage_path || "").trim();
  return bucket && path ? { bucket, path } : null;
}

async function uploadViaChatApi(file, attachment = {}, getAccessToken = null) {
  if (!attachment.id || typeof getAccessToken !== "function") {
    return { ok: false, reason: "Attachment API upload is not ready." };
  }
  const token = String((await getAccessToken()) || "").trim();
  if (!token) {
    return { ok: false, reason: "Chat API requires an authenticated session." };
  }
  const formData = new FormData();
  formData.append("action", "uploadAttachmentObject");
  formData.append("attachmentId", attachment.id);
  formData.append("file", file, file.name || "attachment");
  const response = await fetch("/api/chat", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    return { ok: false, reason: result.reason || result.message || `Attachment upload failed (${response.status}).` };
  }
  return { ok: true, path: attachment.path || attachment.storage_path || "", attachment: result.attachment || null };
}

export async function uploadDashboardChatAttachmentFile(file, attachment = {}, supabase = null, getAccessToken = null) {
  const storageRef = getAttachmentStorageRef(attachment);
  if (!file) {
    return { ok: false, reason: "Attachment storage is not ready." };
  }
  if (!storageRef || !supabase?.storage?.from) {
    return uploadViaChatApi(file, attachment, getAccessToken);
  }
  const storage = supabase.storage.from(storageRef.bucket);
  const contentType = file.type || attachment.mimeType || attachment.mime_type || "application/octet-stream";
  const uploadIntent = attachment.upload && typeof attachment.upload === "object" ? attachment.upload : {};
  const signedToken = String(uploadIntent.token || attachment.token || "").trim();
  try {
    if (signedToken && typeof storage.uploadToSignedUrl === "function") {
      const uploaded = await storage.uploadToSignedUrl(storageRef.path, signedToken, file, { contentType });
      if (!uploaded?.error) return { ok: true, path: storageRef.path };
    }
    if (typeof storage.createSignedUploadUrl === "function" && typeof storage.uploadToSignedUrl === "function") {
      const signed = await storage.createSignedUploadUrl(storageRef.path);
      const signedUploadUrl = signed?.data?.signedUrl || signed?.data?.signedURL || "";
      const token = signed?.data?.token || signed?.token || (signedUploadUrl ? new URL(signedUploadUrl).searchParams.get("token") : "");
      if (!signed?.error && token) {
        const uploaded = await storage.uploadToSignedUrl(storageRef.path, token, file, { contentType });
        if (!uploaded?.error) return { ok: true, path: storageRef.path };
      }
    }
    const uploaded = await storage.upload(storageRef.path, file, { cacheControl: "3600", contentType, upsert: false });
    if (!uploaded?.error) return { ok: true, path: storageRef.path };
    return uploadViaChatApi(file, attachment, getAccessToken);
  } catch (error) {
    return uploadViaChatApi(file, attachment, getAccessToken).catch(() => ({ ok: false, reason: error?.message || "Attachment upload failed." }));
  }
}
