function getAttachmentStorageRef(attachment = {}) {
  const bucket = String(attachment.bucket || attachment.storage_bucket || "").trim();
  const path = String(attachment.path || attachment.storage_path || "").trim();
  return bucket && path ? { bucket, path } : null;
}

export async function uploadDashboardChatAttachmentFile(file, attachment = {}, supabase = null) {
  const storageRef = getAttachmentStorageRef(attachment);
  if (!file || !storageRef || !supabase?.storage?.from) {
    return { ok: false, reason: "Attachment storage is not ready." };
  }
  const storage = supabase.storage.from(storageRef.bucket);
  const contentType = file.type || attachment.mimeType || attachment.mime_type || "application/octet-stream";
  const uploadIntent = attachment.upload && typeof attachment.upload === "object" ? attachment.upload : {};
  const signedToken = String(uploadIntent.token || attachment.token || "").trim();
  try {
    if (signedToken && typeof storage.uploadToSignedUrl === "function") {
      const uploaded = await storage.uploadToSignedUrl(storageRef.path, signedToken, file, { contentType });
      return uploaded?.error ? { ok: false, reason: uploaded.error.message || "Attachment upload failed." } : { ok: true, path: storageRef.path };
    }
    if (typeof storage.createSignedUploadUrl === "function" && typeof storage.uploadToSignedUrl === "function") {
      const signed = await storage.createSignedUploadUrl(storageRef.path);
      const signedUploadUrl = signed?.data?.signedUrl || signed?.data?.signedURL || "";
      const token = signed?.data?.token || signed?.token || (signedUploadUrl ? new URL(signedUploadUrl).searchParams.get("token") : "");
      if (!signed?.error && token) {
        const uploaded = await storage.uploadToSignedUrl(storageRef.path, token, file, { contentType });
        return uploaded?.error ? { ok: false, reason: uploaded.error.message || "Attachment upload failed." } : { ok: true, path: storageRef.path };
      }
    }
    const uploaded = await storage.upload(storageRef.path, file, { cacheControl: "3600", contentType, upsert: false });
    return uploaded?.error ? { ok: false, reason: uploaded.error.message || "Attachment upload failed." } : { ok: true, path: storageRef.path };
  } catch (error) {
    return { ok: false, reason: error?.message || "Attachment upload failed." };
  }
}
