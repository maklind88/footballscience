const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");
const {
  MAX_PORTABLE_MEDIA_BYTES,
  PORTABLE_MEDIA_BUCKET,
} = require("./video-analysis-portable-contracts.js");

const STORAGE_TIMEOUT_MS = 15_000;

function timeoutSignal(milliseconds = STORAGE_TIMEOUT_MS) {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(milliseconds)
    : undefined;
}

function objectPath(bucket, path) {
  return [bucket, ...String(path || "").split("/")].map((part) => encodeURIComponent(part)).join("/");
}

async function parsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function storageRequest(path, options = {}) {
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey) return { ok: false, status: 500, reason: "Portable media storage is not configured." };
  try {
    const response = await fetch(`${config.url}/storage/v1${path}`, {
      method: options.method || "GET",
      headers: {
        ...buildSupabaseKeyHeaders(config.serviceRoleKey),
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeoutSignal(options.timeoutMs),
    });
    const payload = await parsePayload(response);
    return response.ok
      ? { ok: true, status: response.status, payload }
      : { ok: false, status: response.status, reason: payload.message || payload.error || "Portable media storage request failed.", payload };
  } catch (error) {
    return { ok: false, status: error?.name === "TimeoutError" ? 503 : 502, reason: error?.message || "Portable media storage could not be reached." };
  }
}

function directUploadEndpoint() {
  const { url } = readConfig();
  const parsed = new URL(url);
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) {
    const projectRef = parsed.hostname.split(".")[0];
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${parsed.origin}/storage/v1/upload/resumable`;
}

async function ensurePortableMediaBucket() {
  const bucketPath = `/bucket/${encodeURIComponent(PORTABLE_MEDIA_BUCKET)}`;
  const existing = await storageRequest(bucketPath);
  const settings = {
    public: false,
    file_size_limit: MAX_PORTABLE_MEDIA_BYTES,
    allowed_mime_types: ["video/mp4"],
  };
  if (existing.ok) {
    const updated = await storageRequest(bucketPath, { method: "PUT", body: settings });
    return updated.ok ? { ok: true } : updated;
  }
  if (existing.status !== 404) return existing;
  const created = await storageRequest("/bucket", {
    method: "POST",
    body: { id: PORTABLE_MEDIA_BUCKET, name: PORTABLE_MEDIA_BUCKET, ...settings },
  });
  return created.ok || created.status === 409 ? { ok: true } : created;
}

async function createPortableUpload(path) {
  const result = await storageRequest(`/object/upload/sign/${objectPath(PORTABLE_MEDIA_BUCKET, path)}`, {
    method: "POST",
    body: {},
  });
  if (!result.ok) return result;
  const signedUrl = result.payload.signedURL || result.payload.signedUrl || result.payload.url || "";
  let token = result.payload.token || result.payload.uploadToken || "";
  if (!token && signedUrl) {
    try {
      const { url } = readConfig();
      token = new URL(signedUrl, `${url}/storage/v1`).searchParams.get("token") || "";
    } catch { token = ""; }
  }
  if (!token) return { ok: false, status: 502, reason: "Supabase did not return a signed upload token." };
  return { ok: true, payload: { endpoint: directUploadEndpoint(), token, expiresIn: 2 * 60 * 60 } };
}

async function portableObjectInfo(path) {
  return storageRequest(`/object/info/${objectPath(PORTABLE_MEDIA_BUCKET, path)}`);
}

async function createPortablePlaybackUrl(path, expiresIn = 15 * 60, download = false) {
  const result = await storageRequest(`/object/sign/${objectPath(PORTABLE_MEDIA_BUCKET, path)}`, {
    method: "POST",
    body: { expiresIn, ...(download ? { download: true } : {}) },
  });
  if (!result.ok) return result;
  const signedUrl = result.payload.signedURL || result.payload.signedUrl || result.payload.url || "";
  if (!signedUrl) return { ok: false, status: 502, reason: "Supabase did not return a playback URL." };
  const { url } = readConfig();
  return {
    ok: true,
    payload: {
      url: new URL(signedUrl, `${url}/storage/v1`).toString(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    },
  };
}

async function removePortableObject(path) {
  return storageRequest(`/object/${encodeURIComponent(PORTABLE_MEDIA_BUCKET)}`, {
    method: "DELETE",
    body: { prefixes: [path] },
  });
}

module.exports = {
  createPortablePlaybackUrl,
  createPortableUpload,
  ensurePortableMediaBucket,
  portableObjectInfo,
  removePortableObject,
};
