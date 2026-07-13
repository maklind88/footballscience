const {
  parseJsonBody,
  readConfig,
  sendJson,
  listAllAuthUsers,
  buildSupabaseKeyHeaders,
} = require("./supabase-admin.js");
const { notifyChatMessageCreated } = require("./chat-push-notifications.js");

const CHAT_DATABASE_MODE_VALUES = new Set(["database", "db", "postgres", "supabase"]);
const CHAT_LEGACY_MODE_VALUES = new Set(["legacy", "storage", "app-state", "appstate", "local", "off", "false", "0"]);
const CHAT_ACTIVE_READ_HEADER = "x-footballscience-chat-active";
const CHAT_READ_RETRY_AFTER_SECONDS = 300;
const STAFF_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"]);
const MANAGER_ROLES = new Set(["admin", "club-admin", "team-admin", "coach"]);
const ADMIN_ROLES = new Set(["admin"]);
const MAX_MESSAGE_LENGTH = 1600;
const MAX_TEXT_LENGTH = 240;
const MAX_ID_LENGTH = 120;
const MAX_FILE_NAME_LENGTH = 180;
const MAX_MIME_LENGTH = 120;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const DEFAULT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const DEFAULT_ATTACHMENT_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "m4v", "webm", "pdf", "txt", "csv", "docx", "xlsx", "pptx"]);
const PAGE_SIZE_DEFAULT = 40;
const PAGE_SIZE_MAX = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CHAT_DB_REQUEST_TIMEOUT_MS = 8000;
const CHAT_STORAGE_REQUEST_TIMEOUT_MS = 10000;
const RATE_LIMITS = {
  createThread: 8,
  sendMessage: 24,
  editMessage: 24,
  deleteMessage: 20,
  deleteMessageForMe: 30,
  forwardMessage: 24,
  setMessagePinned: 30,
  setMessagePriority: 30,
  addReaction: 80,
  removeReaction: 80,
  markThreadRead: 120,
  setThreadSettings: 30,
  setThreadUserState: 30,
  leaveThread: 10,
  setThreadParticipants: 12,
  clearThread: 5,
  archiveThread: 5,
  createAttachmentIntent: 20,
  uploadAttachmentObject: 20,
  createActionItem: 30,
  updateActionItem: 40,
  readThreads: 60,
  readThread: 120,
  searchMessages: 8,
  readModeration: 8,
  readHealth: 8,
  default: 60,
};
const rateLimitBuckets = new Map();
const THREAD_SELECT = [
  "id",
  "organization_id",
  "team_id",
  "type",
  "title",
  "visibility",
  "created_by",
  "created_at",
  "updated_at",
  "archived_at",
  "last_message_id",
  "last_message_at",
  "message_count",
  "metadata",
].join(",");
const MESSAGE_SELECT = [
  "id",
  "organization_id",
  "team_id",
  "thread_id",
  "author_id",
  "body",
  "body_format",
  "priority",
  "reply_to_id",
  "client_message_id",
  "pinned_at",
  "pinned_by",
  "edited_at",
  "deleted_at",
  "deleted_by",
  "created_at",
  "updated_at",
  "metadata",
].join(",");
const REACTION_SELECT = "message_id,user_id,reaction,created_at";
const RECEIPT_SELECT = "thread_id,user_id,last_read_message_id,last_read_at";
const MENTION_SELECT = "message_id,mentioned_user_id,handle,created_at";
const THREAD_READ_MODEL_SELECT = [
  "thread_id",
  "last_message",
  "last_message_reactions",
  "last_message_attachments",
  "refreshed_at",
].join(",");
const ATTACHMENT_SELECT = [
  "id",
  "organization_id",
  "team_id",
  "thread_id",
  "message_id",
  "uploaded_by",
  "storage_bucket",
  "storage_path",
  "mime_type",
  "byte_size",
  "status",
  "created_at",
  "updated_at",
  "metadata",
].join(",");
const ACTION_ITEM_SELECT = [
  "id",
  "organization_id",
  "team_id",
  "thread_id",
  "message_id",
  "client_action_id",
  "title",
  "status",
  "priority",
  "owner_id",
  "due_label",
  "due_at",
  "created_by",
  "completed_by",
  "created_at",
  "updated_at",
  "completed_at",
  "archived_at",
  "metadata",
].join(",");
const AUDIT_SELECT = [
  "id",
  "organization_id",
  "team_id",
  "thread_id",
  "message_id",
  "action",
  "severity",
  "actor_id",
  "target_user_id",
  "destructive",
  "admin_action",
  "details",
  "created_at",
].join(",");

function isDatabaseChatEnabled() {
  const mode = String(process.env.CHAT_STORAGE_MODE || "").trim().toLowerCase();
  if (!mode) {
    return true;
  }
  if (CHAT_LEGACY_MODE_VALUES.has(mode)) {
    return isLegacyChatFallbackAllowed() ? false : true;
  }
  if (CHAT_DATABASE_MODE_VALUES.has(mode)) {
    return true;
  }
  return true;
}

function isLegacyChatFallbackAllowed() {
  const value = String(process.env.CHAT_ALLOW_LEGACY_STORAGE_FALLBACK || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function normalizeString(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeId(value) {
  return normalizeString(value, MAX_ID_LENGTH);
}

function normalizeSlug(value, fallback = "chat") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function normalizeFileName(value) {
  return normalizeString(value || "attachment", MAX_FILE_NAME_LENGTH)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "attachment";
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function normalizeMessageText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeThreadType(value) {
  const type = normalizeString(value, 24).toLowerCase();
  return ["team", "dm", "group", "system", "medical", "matchday", "training", "announcement"].includes(type)
    ? type
    : "team";
}

function threadRequiresParticipantAccess(thread = {}) {
  return ["dm", "group", "system"].includes(normalizeThreadType(thread?.type));
}

function normalizeThreadVisibility(value, type = "team") {
  const visibility = normalizeString(value, 40).toLowerCase();
  if (visibility === "team") {
    return "members";
  }
  if (["members", "staff", "medical", "private"].includes(visibility)) {
    return visibility;
  }
  return type === "dm" ? "private" : type === "medical" ? "medical" : type === "announcement" ? "staff" : "members";
}

function normalizePriority(value) {
  const priority = normalizeString(value, 24).toLowerCase();
  return ["low", "normal", "medium", "high", "urgent", "critical"].includes(priority) ? priority : "normal";
}

function normalizeActionItemPriority(value) {
  const priority = normalizeString(value, 24).toLowerCase();
  if (priority === "urgent" || priority === "critical" || priority === "high") {
    return "urgent";
  }
  if (priority === "important" || priority === "medium") {
    return "important";
  }
  return "normal";
}

function normalizeActionItemStatus(value) {
  const status = normalizeString(value || "open", 24).toLowerCase();
  return ["open", "done", "archived"].includes(status) ? status : "open";
}

function normalizeActionItemTitle(value) {
  return normalizeString(value, 240).replace(/\s+/g, " ").trim();
}

function normalizeActionItemDueLabel(value) {
  const label = normalizeString(value, 120).replace(/\s+/g, " ").trim();
  return label || null;
}

function normalizeOptionalIsoDate(value) {
  const raw = normalizeString(value, 80);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeMentionedUserIds(value = []) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map((item) => normalizeId(item)).filter(isUuid))).slice(0, 40);
}

function messageMentionedUserIds(message = {}) {
  const metadata = isPlainObject(message.metadata) ? message.metadata : {};
  return normalizeMentionedUserIds([
    ...(Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : []),
    ...(Array.isArray(message.mentioned_user_ids) ? message.mentioned_user_ids : []),
    ...(Array.isArray(metadata.mentionedUserIds) ? metadata.mentionedUserIds : []),
    ...(Array.isArray(metadata.mentioned_user_ids) ? metadata.mentioned_user_ids : []),
  ]);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeThreadSettingPatch(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const patch = {};
  if (hasOwn(source, "muted")) {
    patch.muted = normalizeBoolean(source.muted);
  }
  if (hasOwn(source, "pinned")) {
    patch.pinned = normalizeBoolean(source.pinned);
  }
  if (hasOwn(source, "customTitle")) {
    patch.customTitle = normalizeString(source.customTitle, 140);
  }
  if (hasOwn(source, "avatarLabel")) {
    patch.avatarLabel = normalizeString(source.avatarLabel, 2).toUpperCase();
  }
  if (hasOwn(source, "avatarUrl")) {
    patch.avatarUrl = normalizeString(source.avatarUrl, 800);
  }
  return patch;
}

function normalizeThreadUserStateOperation(value = "") {
  const operation = normalizeString(value, 32).toLowerCase().replace(/_/g, "-");
  if (["archive", "unarchive", "hide", "delete", "block", "unblock", "restore"].includes(operation)) {
    return operation;
  }
  return "";
}

function participantUserStateFromMetadata(metadata = {}) {
  const source = isPlainObject(metadata) ? metadata : {};
  return {
    archivedAt: normalizeString(source.archivedAt || "", 80),
    hiddenAt: normalizeString(source.hiddenAt || "", 80),
    deletedForUserAt: normalizeString(source.deletedForUserAt || "", 80),
    blockedAt: normalizeString(source.blockedAt || "", 80),
    blockedUserId: normalizeId(source.blockedUserId || ""),
    updatedAt: normalizeString(source.userStateUpdatedAt || source.updatedAt || "", 80),
    updatedBy: normalizeId(source.userStateUpdatedBy || source.updatedBy || ""),
  };
}

function stripEmptyThreadUserState(metadata = {}) {
  const next = isPlainObject(metadata) ? { ...metadata } : {};
  ["archivedAt", "hiddenAt", "deletedForUserAt", "blockedAt", "blockedUserId"].forEach((key) => {
    if (!next[key]) {
      delete next[key];
    }
  });
  return next;
}

function normalizeParticipantRole(value) {
  const role = normalizeString(value || "member", 32).toLowerCase();
  return ["owner", "member", "observer"].includes(role) ? role : "member";
}

function normalizeParticipantRoleMap(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return Object.entries(source).reduce((roles, [participantId, role]) => {
    const key = normalizeId(participantId);
    if (key) {
      roles[key] = normalizeParticipantRole(role);
    }
    return roles;
  }, {});
}

function canUseChat(actor = {}) {
  return STAFF_ROLES.has(String(actor.role || "").toLowerCase());
}

function canManageByRole(role) {
  return MANAGER_ROLES.has(String(role || "").toLowerCase());
}

function actorRole(actor = {}) {
  return normalizeString(actor.role || "unknown", 40).toLowerCase();
}

function canAdmin(actor = {}) {
  return ADMIN_ROLES.has(actorRole(actor));
}

function actorTeamLabel(actor = {}) {
  return normalizeString(actor.team || actor.club || "North Carolina Courage", 120) || "North Carolina Courage";
}

function actorOrganizationLabel(actor = {}) {
  return normalizeString(process.env.CHAT_DEFAULT_ORGANIZATION_NAME || actor.organization || actorTeamLabel(actor), 120);
}

function chatDefaultBucket() {
  return normalizeString(process.env.CHAT_ATTACHMENT_BUCKET || "footballscience-chat-attachments", 120);
}

function allowedAttachmentMimeTypes() {
  return String(process.env.CHAT_ATTACHMENT_ALLOWED_MIME_TYPES || "")
    .split(",")
    .map((value) => normalizeString(value, MAX_MIME_LENGTH).toLowerCase())
    .filter(Boolean)
    .concat(DEFAULT_ATTACHMENT_MIME_TYPES)
    .filter((value, index, source) => source.indexOf(value) === index);
}

function isAllowedAttachmentMimeType(value) {
  const mimeType = normalizeString(value || "application/octet-stream", MAX_MIME_LENGTH).toLowerCase();
  return allowedAttachmentMimeTypes().includes(mimeType);
}

function safeFileExtension(fileName) {
  const extension = String(fileName || "")
    .split(".")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  return DEFAULT_ATTACHMENT_EXTENSIONS.has(extension) ? extension : "";
}

function attachmentClientPayload(attachment = {}) {
  const metadata = attachment.metadata && typeof attachment.metadata === "object" ? attachment.metadata : {};
  return {
    ...attachment,
    bucket: attachment.storage_bucket,
    path: attachment.storage_path,
    fileName: metadata.fileName || "Attachment",
    byteSize: attachment.byte_size,
    mimeType: attachment.mime_type,
    metadata,
  };
}

function storageObjectPath(bucket, path) {
  const safeBucket = encodeURIComponent(String(bucket || ""));
  const safePath = String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${safeBucket}/${safePath}`;
}

async function createSignedAttachmentUpload(bucket, path) {
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey || !bucket || !path) {
    return null;
  }
  try {
    const response = await fetch(
      `${config.url}/storage/v1/object/upload/sign/${storageObjectPath(bucket, path)}`,
      {
        method: "POST",
        headers: {
          ...buildSupabaseKeyHeaders(config.serviceRoleKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 * 60 * 2 }),
        signal: timeoutSignal(CHAT_STORAGE_REQUEST_TIMEOUT_MS),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }
    const signedUrl = payload.signedURL || payload.signedUrl || payload.url || "";
    const token =
      payload.token ||
      payload.uploadToken ||
      (() => {
        try {
          const absoluteUrl = signedUrl.startsWith("http")
            ? signedUrl
            : `${config.url}/storage/v1${signedUrl.startsWith("/") ? "" : "/"}${signedUrl}`;
          return new URL(absoluteUrl).searchParams.get("token") || "";
        } catch {
          return "";
        }
      })();
    return {
      signedUrl,
      token,
      expiresIn: 60 * 60 * 2,
    };
  } catch {
    return null;
  }
}

function multipartBoundary(contentType = "") {
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? match[1] || match[2] || "" : "";
}

async function readRequestBuffer(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      const error = new Error("Attachment upload is too large.");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function parseMultipartContentDisposition(value = "") {
  const name = String(value).match(/(?:^|;)\s*name="([^"]*)"/i)?.[1] || "";
  const filename = String(value).match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1] || "";
  return { name, filename };
}

function parseMultipartBody(buffer, boundary) {
  const fields = {};
  const files = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(delimiter);
  while (cursor !== -1) {
    cursor += delimiter.length;
    if (buffer.slice(cursor, cursor + 2).toString() === "--") break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd === -1) break;
    const next = buffer.indexOf(delimiter, headerEnd + 4);
    if (next === -1) break;
    const headers = buffer.slice(cursor, headerEnd).toString("utf8").split(/\r\n/).reduce((map, line) => {
      const index = line.indexOf(":");
      if (index > -1) map[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
      return map;
    }, {});
    const disposition = parseMultipartContentDisposition(headers["content-disposition"]);
    let contentEnd = next;
    if (buffer[contentEnd - 2] === 13 && buffer[contentEnd - 1] === 10) contentEnd -= 2;
    const content = buffer.slice(headerEnd + 4, contentEnd);
    if (disposition.name) {
      if (disposition.filename) {
        files[disposition.name] = {
          fileName: normalizeFileName(disposition.filename),
          mimeType: normalizeString(headers["content-type"] || "application/octet-stream", MAX_MIME_LENGTH),
          buffer: content,
        };
      } else {
        fields[disposition.name] = content.toString("utf8");
      }
    }
    cursor = next;
  }
  return { fields, files };
}

async function parseMultipartRequest(req) {
  const boundary = multipartBoundary(req.headers?.["content-type"] || req.headers?.["Content-Type"]);
  if (!boundary) {
    return null;
  }
  return parseMultipartBody(await readRequestBuffer(req, MAX_ATTACHMENT_BYTES + 1024 * 1024), boundary);
}

async function uploadStorageObject(bucket, path, buffer, mimeType) {
  const config = readConfig();
  if (!config.url || !config.serviceRoleKey) {
    return { ok: false, status: 500, reason: "Attachment storage is not configured." };
  }
  const response = await fetch(`${config.url}/storage/v1/object/${storageObjectPath(bucket, path)}`, {
    method: "POST",
    headers: {
      ...buildSupabaseKeyHeaders(config.serviceRoleKey),
      "Cache-Control": "3600",
      "Content-Type": mimeType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: buffer,
    signal: timeoutSignal(CHAT_STORAGE_REQUEST_TIMEOUT_MS),
  });
  if (response.ok) {
    return { ok: true };
  }
  const payload = await response.json().catch(() => ({}));
  return { ok: false, status: response.status, reason: payload.message || payload.error || "Attachment upload failed." };
}

function restBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: `${url}/rest/v1`,
    serviceRoleKey,
  };
}

function restHeaders(serviceRoleKey, extra = {}) {
  return {
    ...buildSupabaseKeyHeaders(serviceRoleKey, { contentType: "application/json" }),
    ...extra,
  };
}

function filterValue(value) {
  return encodeURIComponent(String(value || ""));
}

function jsonValue(value) {
  return JSON.stringify(value);
}

function timeoutSignal(timeoutMs = CHAT_DB_REQUEST_TIMEOUT_MS) {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function isRequestTimeoutError(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

function createDatabaseError(result = {}) {
  const error = new Error(result.reason || "Chat database request failed.");
  error.status = result.status || 500;
  error.payload = result.payload || null;
  return error;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function dbRequest(path, options = {}) {
  const base = restBaseUrl();
  if (!base) {
    return { ok: false, status: 500, reason: "Missing Supabase database configuration." };
  }

  let response = null;
  try {
    response = await fetch(`${base.url}${path}`, {
      method: options.method || "GET",
      headers: restHeaders(base.serviceRoleKey, options.headers || {}),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeoutSignal(options.timeoutMs || CHAT_DB_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (isRequestTimeoutError(error)) {
      return {
        ok: false,
        status: 503,
        reason: "Chat database is temporarily busy. Please try again.",
      };
    }
    throw error;
  }
  const payload = await parseResponse(response);

  if (!response.ok) {
    const timeoutReason = payload?.message || payload?.hint || payload?.details || "";
    return {
      ok: false,
      status: response.status === 504 || /timeout/i.test(timeoutReason) ? 503 : response.status,
      payload,
      reason:
        response.status === 504 || /timeout/i.test(timeoutReason)
          ? "Chat database is temporarily busy. Please try again."
          : payload?.message || payload?.hint || payload?.details || `Database request failed (${response.status}).`,
    };
  }

  return { ok: true, status: response.status, payload };
}

async function selectOne(table, query) {
  const result = await dbRequest(`/${table}?${query}&limit=1`);
  if (!result.ok) {
    throw createDatabaseError(result);
  }

  return Array.isArray(result.payload) ? result.payload[0] || null : null;
}

async function selectMany(table, query) {
  const result = await dbRequest(`/${table}?${query}`);
  if (!result.ok) {
    throw createDatabaseError(result);
  }

  return Array.isArray(result.payload) ? result.payload : [];
}

async function insertRows(table, rows) {
  if (Array.isArray(rows) && !rows.length) {
    return [];
  }
  const result = await dbRequest(`/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: Array.isArray(rows) ? rows : [rows],
  });
  if (!result.ok) {
    throw createDatabaseError(result);
  }

  return Array.isArray(result.payload) ? result.payload : [];
}

async function patchRows(table, query, patch) {
  const result = await dbRequest(`/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: patch,
  });
  if (!result.ok) {
    throw createDatabaseError(result);
  }

  return Array.isArray(result.payload) ? result.payload : [];
}

async function deleteRows(table, query) {
  const result = await dbRequest(`/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!result.ok) {
    throw createDatabaseError(result);
  }

  return Array.isArray(result.payload) ? result.payload : [];
}

function checkRateLimit(actor, action, nowMs = Date.now()) {
  const normalizedAction = normalizeString(action, 48) || "default";
  const max = RATE_LIMITS[normalizedAction] || RATE_LIMITS.default;
  const identity = normalizeString(actor.id || actor.email || "unknown", MAX_ID_LENGTH) || "unknown";
  const key = `${identity}:${normalizedAction}`;
  const existing = rateLimitBuckets.get(key);

  if (!existing || nowMs - existing.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { startedAt: nowMs, count: 1 });
    return { ok: true };
  }

  existing.count += 1;
  if (existing.count > max) {
    return {
      ok: false,
      status: 429,
      reason: "Too many chat actions. Please wait a moment and try again.",
    };
  }

  if (rateLimitBuckets.size > 1000) {
    for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
      if (nowMs - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
        rateLimitBuckets.delete(bucketKey);
      }
    }
  }

  return { ok: true };
}

function readHeaderValue(req, headerName) {
  const headers = req?.headers || {};
  const lowerName = String(headerName || "").toLowerCase();
  return headers[lowerName] || headers[headerName] || headers[lowerName.replace(/(^|-)([a-z])/g, (match) => match.toUpperCase())] || "";
}

function hasActiveChatReadIntent(req) {
  const value = String(readHeaderValue(req, CHAT_ACTIVE_READ_HEADER) || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "open" || value === "active";
}

function getDatabaseChatReadAction(req) {
  const query = new URL(req.url || "/", "http://localhost").searchParams;
  const view = normalizeString(query.get("view"), 40).toLowerCase();
  if (view === "moderation" || view === "admin") return "readModeration";
  if (view === "health") return "readHealth";
  if (normalizeString(query.get("search"), 120)) return "searchMessages";
  if (normalizeId(query.get("threadId")) || query.has("threadId")) return "readThread";
  return "readThreads";
}

function sendChatReadPaused(res) {
  res.setHeader("Retry-After", String(CHAT_READ_RETRY_AFTER_SECONDS));
  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, 429, {
    ok: false,
    status: 429,
    code: "chat_read_inactive",
    retryable: true,
    retryAfterSeconds: CHAT_READ_RETRY_AFTER_SECONDS,
    reason: "Chat reads are paused until the chat panel is opened.",
  });
}

function sendChatReadRateLimited(res, rateLimit) {
  res.setHeader("Retry-After", "60");
  res.setHeader("Cache-Control", "no-store");
  return sendJson(res, rateLimit.status || 429, {
    ...rateLimit,
    retryable: true,
    retryAfterSeconds: 60,
    reason: "Too many chat reads. Please wait a moment and try again.",
  });
}

async function readFirstMembership(actor) {
  if (!actor?.id) {
    return null;
  }

  const memberships = await selectMany(
    "chat_team_memberships",
    [
      "select=organization_id,team_id,user_id,role,status,relationship",
      `user_id=eq.${filterValue(actor.id)}`,
      "status=eq.active",
      "role=in.(admin,club-admin,team-admin,coach,scout,analyst,performance,medical)",
      "limit=1",
    ].join("&")
  );

  return memberships[0] || null;
}

async function ensureOrganization(actor, requestedOrganizationId = "") {
  if (isUuid(requestedOrganizationId)) {
    const existing = await selectOne(
      "chat_organizations",
      `select=id,slug,name,status&id=eq.${filterValue(requestedOrganizationId)}`
    );
    if (existing) {
      return existing;
    }
  }

  const slug = normalizeSlug(process.env.CHAT_DEFAULT_ORGANIZATION_SLUG || actorOrganizationLabel(actor), "football-science");
  const existing = await selectOne("chat_organizations", `select=id,slug,name,status&slug=eq.${filterValue(slug)}`);
  if (existing) {
    return existing;
  }

  const rows = await insertRows("chat_organizations", {
    slug,
    name: actorOrganizationLabel(actor),
    status: "active",
    created_by: isUuid(actor.id) ? actor.id : null,
    metadata: {
      source: "api.chat.database.bootstrap",
    },
  });

  return rows[0] || null;
}

async function ensureTeam(actor, organizationId, requestedTeamId = "") {
  if (isUuid(requestedTeamId)) {
    const existing = await selectOne(
      "chat_teams",
      `select=id,organization_id,slug,name,status&id=eq.${filterValue(requestedTeamId)}`
    );
    if (existing) {
      return existing;
    }
  }

  const teamLabel = actorTeamLabel(actor);
  const slug = normalizeSlug(process.env.CHAT_DEFAULT_TEAM_SLUG || teamLabel, "team");
  const existing = await selectOne(
    "chat_teams",
    [
      "select=id,organization_id,slug,name,status",
      `organization_id=eq.${filterValue(organizationId)}`,
      `slug=eq.${filterValue(slug)}`,
    ].join("&")
  );
  if (existing) {
    return existing;
  }

  const rows = await insertRows("chat_teams", {
    organization_id: organizationId,
    slug,
    name: teamLabel,
    sport: "football",
    season_label: "current",
    status: "active",
    created_by: isUuid(actor.id) ? actor.id : null,
    metadata: {
      source: "api.chat.database.bootstrap",
    },
  });

  return rows[0] || null;
}

async function readOrganizationById(organizationId) {
  if (!isUuid(organizationId)) {
    return null;
  }

  return selectOne("chat_organizations", `select=id,slug,name,status&id=eq.${filterValue(organizationId)}`).catch(() => null);
}

async function readTeamById(teamId) {
  if (!isUuid(teamId)) {
    return null;
  }

  return selectOne("chat_teams", `select=id,organization_id,slug,name,status&id=eq.${filterValue(teamId)}`).catch(() => null);
}

async function hydrateScopeLabels(actor, scope = {}) {
  const [organization, team] = await Promise.all([
    readOrganizationById(scope.organizationId),
    readTeamById(scope.teamId),
  ]);

  return {
    ...scope,
    organizationName: organization?.name || actorOrganizationLabel(actor),
    teamName: team?.name || actorTeamLabel(actor),
  };
}

async function ensureMembership(actor, organizationId, teamId) {
  const existing = await readMembership(actor, organizationId, teamId);
  if (existing) {
    return existing;
  }

  if (!isUuid(actor.id) || !STAFF_ROLES.has(actorRole(actor))) {
    return null;
  }

  const role = actorRole(actor);
  const payload = {
    organization_id: organizationId,
    team_id: teamId,
    user_id: actor.id,
    role,
    status: "active",
    relationship: "staff",
    created_by: actor.id,
    metadata: {
      source: "api.chat.database.bootstrap",
    },
  };

  await insertRows("chat_team_memberships", payload).catch(() => patchRows(
    "chat_team_memberships",
    `team_id=eq.${filterValue(teamId)}&user_id=eq.${filterValue(actor.id)}`,
    {
      role,
      status: "active",
      relationship: "staff",
    }
  ));

  return readMembership(actor, organizationId, teamId);
}

async function resolveChatScope(actor, source = {}) {
  const requestedOrganizationId = normalizeId(source.organizationId || source.organization_id);
  const requestedTeamId = normalizeId(source.teamId || source.team_id);

  if (requestedOrganizationId && requestedTeamId) {
    const membership = await readMembership(actor, requestedOrganizationId, requestedTeamId);
    if (membership) {
      return hydrateScopeLabels(actor, {
        organizationId: requestedOrganizationId,
        teamId: requestedTeamId,
        membership,
        bootstrapped: false,
      });
    }
  }

  const firstMembership = await readFirstMembership(actor);
  if (firstMembership && !requestedOrganizationId && !requestedTeamId) {
    return hydrateScopeLabels(actor, {
      organizationId: firstMembership.organization_id,
      teamId: firstMembership.team_id,
      membership: firstMembership,
      bootstrapped: false,
    });
  }

  const organization = await ensureOrganization(actor, requestedOrganizationId);
  if (!organization?.id) {
    return null;
  }

  const team = await ensureTeam(actor, organization.id, requestedTeamId);
  if (!team?.id) {
    return null;
  }

  const membership = await ensureMembership(actor, organization.id, team.id);
  if (!membership) {
    return null;
  }

  return {
    organizationId: organization.id,
    teamId: team.id,
    organizationName: organization.name || actorOrganizationLabel(actor),
    teamName: team.name || actorTeamLabel(actor),
    membership,
    bootstrapped: true,
  };
}

async function readMembership(actor, organizationId, teamId = "") {
  if (!actor?.id || !organizationId) {
    return null;
  }

  const filters = [
    "select=organization_id,team_id,user_id,role,status,relationship",
    `organization_id=eq.${filterValue(organizationId)}`,
    `user_id=eq.${filterValue(actor.id)}`,
    "status=eq.active",
  ];

  if (teamId) {
    filters.push(`team_id=eq.${filterValue(teamId)}`);
  }

  const memberships = await selectMany("chat_team_memberships", `${filters.join("&")}&limit=20`);
  return memberships.find((membership) => STAFF_ROLES.has(String(membership.role || "").toLowerCase())) || null;
}

async function readThread(threadId) {
  if (!threadId) {
    return null;
  }

  return selectOne("chat_threads", `select=${THREAD_SELECT}&id=eq.${filterValue(threadId)}`);
}

function legacyThreadKey(value, type = "team") {
  const raw = normalizeString(value || "", MAX_ID_LENGTH);
  if (!raw || raw === "team") {
    return type === "team" ? "team" : "";
  }
  return raw;
}

async function readThreadByLegacyKey(scope, legacyKey, type = "team") {
  const threads = await readThreadsByLegacyKey(scope, legacyKey, type);
  return threads[0] || null;
}

async function readThreadsByLegacyKey(scope, legacyKey, type = "team") {
  if (!scope?.organizationId || !legacyKey) {
    return [];
  }

  const filters = [
    `select=${THREAD_SELECT}`,
    `organization_id=eq.${filterValue(scope.organizationId)}`,
    `type=eq.${filterValue(type)}`,
    "archived_at=is.null",
    "order=updated_at.desc",
    "limit=100",
  ];

  if (scope.teamId && type !== "dm") {
    filters.push(`team_id=eq.${filterValue(scope.teamId)}`);
  }

  const threads = await selectMany("chat_threads", filters.join("&"));
  return threads.filter((thread) => thread?.metadata?.legacyThreadId === legacyKey);
}

function logicalThreadSummaryKey(thread = {}) {
  const legacyThreadId = toLegacyThreadId(thread);
  const type = normalizeThreadType(thread.type);
  return [
    normalizeId(thread.organization_id || thread.organizationId || ""),
    normalizeId(thread.team_id || thread.teamId || ""),
    type,
    legacyThreadId || normalizeId(thread.id || ""),
  ].join(":");
}

function threadSummaryTime(summary = {}) {
  return Math.max(
    Date.parse(summary.lastMessage?.createdAt || summary.last_message?.createdAt || summary.last_message?.created_at || "") || 0,
    Date.parse(summary.lastMessageAt || summary.last_message_at || "") || 0,
    Date.parse(summary.updated_at || summary.updatedAt || "") || 0,
    Date.parse(summary.created_at || summary.createdAt || "") || 0
  );
}

function mergeThreadParticipants(first = [], second = []) {
  const byUserId = new Map();
  [...first, ...second].forEach((participant) => {
    const userId = normalizeId(participant?.userId || participant?.user_id || participant?.id || "");
    if (!userId) {
      return;
    }
    byUserId.set(userId, {
      ...(byUserId.get(userId) || {}),
      ...participant,
      id: userId,
      userId,
    });
  });
  return Array.from(byUserId.values());
}

function combineLogicalThreadSummaries(summaries = []) {
  const byLogicalThread = new Map();
  summaries.forEach((summary) => {
    if (!summary?.id) {
      return;
    }
    const key = logicalThreadSummaryKey(summary);
    const existing = byLogicalThread.get(key);
    if (!existing) {
      byLogicalThread.set(key, {
        ...summary,
        messageCount: Number(summary.messageCount || summary.message_count || 0) || 0,
        message_count: Number(summary.messageCount || summary.message_count || 0) || 0,
        unreadCount: Number(summary.unreadCount || summary.unread_count || 0) || 0,
        logicalThreadSourceIds: [summary.id],
      });
      return;
    }

    const existingCount = Number(existing.messageCount || existing.message_count || 0) || 0;
    const summaryCount = Number(summary.messageCount || summary.message_count || 0) || 0;
    const useSummaryAsLatest = threadSummaryTime(summary) > threadSummaryTime(existing);
    const latest = useSummaryAsLatest ? summary : existing;
    const mergedCount = existingCount + summaryCount;
    byLogicalThread.set(key, {
      ...existing,
      ...(useSummaryAsLatest
        ? {
            last_message_id: summary.last_message_id || summary.lastMessageId || existing.last_message_id || existing.lastMessageId || null,
            lastMessageId: summary.lastMessageId || summary.last_message_id || existing.lastMessageId || existing.last_message_id || "",
            last_message_at: summary.last_message_at || summary.lastMessageAt || existing.last_message_at || existing.lastMessageAt || null,
            lastMessageAt: summary.lastMessageAt || summary.last_message_at || existing.lastMessageAt || existing.last_message_at || "",
            lastMessage: summary.lastMessage || summary.last_message || null,
            last_message: summary.last_message || summary.lastMessage || null,
            lastMessagePreview: summary.lastMessagePreview || summary.last_message_preview || "",
          }
        : {}),
      updated_at: latest.updated_at || latest.updatedAt || existing.updated_at || "",
      updatedAt: latest.updatedAt || latest.updated_at || existing.updatedAt || "",
      participants: mergeThreadParticipants(existing.participants || [], summary.participants || []),
      permissions: {
        ...(existing.permissions || {}),
        ...(summary.permissions || {}),
      },
      messageCount: mergedCount,
      message_count: mergedCount,
      unreadCount: (Number(existing.unreadCount || existing.unread_count || 0) || 0) + (Number(summary.unreadCount || summary.unread_count || 0) || 0),
      logicalThreadSourceIds: Array.from(new Set([...(existing.logicalThreadSourceIds || []), summary.id].filter(Boolean))),
    });
  });
  return Array.from(byLogicalThread.values()).sort((first, second) => threadSummaryTime(second) - threadSummaryTime(first));
}

function getThreadSummaryMessageCount(thread = {}) {
  return Number(thread?.messageCount || thread?.message_count || 0) || 0;
}

function withDetailResponseMessageCount(thread = {}, options = {}) {
  const requestedLimit = Math.max(1, Number(options.requestedLimit || PAGE_SIZE_DEFAULT) || PAGE_SIZE_DEFAULT);
  const rawMessageCount = Math.max(0, Number(options.rawMessageCount || 0) || 0);
  const visibleMessageCount = Math.max(0, Number(options.visibleMessageCount || 0) || 0);
  const summaryMessageCount = getThreadSummaryMessageCount(thread);
  const hasMoreHistory = Boolean(options.nextCursor);
  const exhaustedInitialPage = !hasMoreHistory && rawMessageCount < requestedLimit;
  const messageCount = exhaustedInitialPage
    ? visibleMessageCount
    : Math.max(summaryMessageCount, visibleMessageCount);

  return {
    ...thread,
    messageCount,
    message_count: messageCount,
    historyComplete: exhaustedInitialPage || Boolean(thread?.historyComplete || thread?.history_complete),
    history_complete: exhaustedInitialPage || Boolean(thread?.historyComplete || thread?.history_complete),
  };
}

async function readAccessibleLogicalThreads(actor, scope, thread, requestedThreadId = "") {
  if (!thread?.id) {
    return [];
  }
  if (isUuid(requestedThreadId) || !scope?.organizationId) {
    return [thread];
  }

  const candidates = await readThreadsByLegacyKey(scope, toLegacyThreadId(thread), normalizeThreadType(thread.type)).catch(() => []);
  const accessibleThreads = [];
  for (const candidateThread of candidates.length ? candidates : [thread]) {
    const access = await ensureThreadAccess(actor, candidateThread).catch(() => ({ ok: false }));
    if (access.ok && candidateThread?.id) {
      accessibleThreads.push(candidateThread);
    }
  }
  return accessibleThreads.length ? accessibleThreads : [thread];
}

function getParticipantIdsFromLegacyKey(legacyKey, type = "team") {
  if (type !== "dm") {
    return [];
  }
  const [, firstId = "", secondId = ""] = String(legacyKey || "").split(":");
  return [firstId, secondId].filter((userId) => isUuid(userId));
}

function getParticipantIdsForThread(actor, body = {}, legacyKey = "", type = "team") {
  return Array.from(
    new Set([
      actor.id,
      ...getParticipantIdsFromLegacyKey(legacyKey, type),
      ...(Array.isArray(body.participantIds) ? body.participantIds : []),
      ...(Array.isArray(body.participants) ? body.participants.map((participant) => {
        if (participant && typeof participant === "object") {
          return participant.userId || participant.user_id || participant.id;
        }
        return participant;
      }) : []),
    ].filter((userId) => isUuid(userId)))
  ).slice(0, 80);
}

function normalizeParticipantLookupKey(value = "") {
  return normalizeString(value, 254).toLowerCase();
}

function collectParticipantLookupKeys(body = {}) {
  const keys = new Set();
  const addKey = (value) => {
    const key = normalizeParticipantLookupKey(value);
    if (key) {
      keys.add(key);
    }
  };
  const collect = (value) => {
    if (!value) {
      return;
    }
    if (typeof value === "object") {
      addKey(value.id);
      addKey(value.userId);
      addKey(value.user_id);
      addKey(value.email);
      addKey(value.username);
      addKey(value.userName);
      return;
    }
    addKey(value);
  };
  [
    ...(Array.isArray(body.participantIds) ? body.participantIds : []),
    ...(Array.isArray(body.participants) ? body.participants : []),
  ].forEach(collect);
  return keys;
}

function participantScopeKey(...values) {
  return normalizeString(values.find(Boolean) || "", 180).toLowerCase();
}

function canResolveParticipantForActor(actor = {}, user = {}) {
  if (normalizeString(user.status || "active", 24).toLowerCase() !== "active") {
    return false;
  }
  const role = actorRole(actor);
  if (role === "admin") {
    return true;
  }
  const actorClub = participantScopeKey(actor.clubId, actor.clubName);
  const userClub = participantScopeKey(user.clubId, user.clubName);
  if (role === "club-admin" && actorClub && userClub) {
    return actorClub === userClub;
  }
  const actorTeam = participantScopeKey(actor.teamId, actor.teamName, actor.team);
  const userTeam = participantScopeKey(user.teamId, user.teamName, user.team);
  return !actorTeam || !userTeam || actorTeam === userTeam;
}

async function resolveParticipantIdsForThread(actor, body = {}, legacyKey = "", type = "team") {
  const directIds = getParticipantIdsForThread(actor, body, legacyKey, type);
  const lookupKeys = collectParticipantLookupKeys(body);
  if (!lookupKeys.size) {
    return directIds;
  }
  const users = await listAllAuthUsers().catch(() => []);
  const resolvedIds = users
    .filter((user) => isUuid(user.id) && canResolveParticipantForActor(actor, user))
    .filter((user) => [
      user.id,
      user.email,
      user.username,
    ].map(normalizeParticipantLookupKey).some((key) => lookupKeys.has(key)))
    .map((user) => user.id);
  return Array.from(new Set([...directIds, ...resolvedIds].filter((userId) => isUuid(userId)))).slice(0, 80);
}

async function ensureThreadParticipants(actor, thread, participantIds = []) {
  if (!thread?.id || !participantIds.length) {
    return;
  }
  const existingParticipants = await selectMany(
    "chat_thread_participants",
    `select=user_id&thread_id=eq.${filterValue(thread.id)}&user_id=${inFilter(participantIds)}`
  ).catch(() => []);
  const existingIds = new Set(existingParticipants.map((participant) => participant.user_id));
  const missingIds = participantIds.filter((userId) => !existingIds.has(userId));
  if (!missingIds.length) {
    return;
  }
  await insertRows(
    "chat_thread_participants",
    missingIds.map((userId) => ({
      thread_id: thread.id,
      organization_id: thread.organization_id,
      team_id: thread.team_id,
      user_id: userId,
      participant_role: userId === actor.id ? "owner" : "member",
      created_by: isUuid(actor.id) ? actor.id : null,
    }))
  ).catch(() => null);
}

function canonicalDirectThreadKey(actor, body = {}, requestedThreadId = "") {
  const participantIds = Array.from(
    new Set(getParticipantIdsForThread(actor, body, requestedThreadId, "dm").filter(Boolean))
  ).sort();
  if (participantIds.length >= 2) {
    return `dm:${participantIds.slice(0, 2).join(":")}`;
  }
  const rawKey = normalizeId(requestedThreadId || body.legacyThreadId || body.legacy_thread_id || "");
  return rawKey.startsWith("dm:") ? rawKey : legacyThreadKey(rawKey || "dm", "dm");
}

async function ensureScopedThread(actor, body = {}, scope, options = {}) {
  const requestedThreadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (isUuid(requestedThreadId)) {
    return readThread(requestedThreadId);
  }

  const inferredThreadType = requestedThreadId === "team" ? "team" : requestedThreadId.startsWith("dm:") ? "dm" : "group";
  const type = normalizeThreadType(body.type || body.threadType || options.type || inferredThreadType);
  const canonicalThreadId = type === "dm" ? canonicalDirectThreadKey(actor, body, requestedThreadId) : requestedThreadId;
  const legacyKey = legacyThreadKey(canonicalThreadId || body.legacyThreadId || type, type) || `${type}:${actor.id || "staff"}`;
  const existing = await readThreadByLegacyKey(scope, legacyKey, type);
  if (existing) {
    await ensureThreadParticipants(actor, existing, getParticipantIdsForThread(actor, body, legacyKey, type));
    return existing;
  }

  const titleFallback = type === "dm"
    ? "Direct message"
    : type === "medical"
      ? "Medical room"
      : type === "matchday"
        ? "Matchday room"
        : type === "training"
          ? "Training room"
          : type === "announcement"
            ? "Announcements"
            : "Team chat";
  const title = normalizeString(body.title || body.threadTitle || body.name || titleFallback, 140);
  const visibility = normalizeThreadVisibility(body.visibility, type);
  const threadRows = await insertRows("chat_threads", {
    organization_id: scope.organizationId,
    team_id: type === "dm" ? null : scope.teamId || null,
    type,
    title,
    visibility,
    created_by: isUuid(actor.id) ? actor.id : null,
    metadata: {
      source: "api.chat.database",
      legacyThreadId: legacyKey,
      announcementOnly: type === "announcement" || body.announcementOnly === true,
    },
  });
  const thread = threadRows[0] || null;

  const participantIds = getParticipantIdsForThread(actor, body, legacyKey, type);

  if (thread?.id && (type !== "team" || participantIds.length)) {
    await insertRows(
      "chat_thread_participants",
      participantIds.map((userId) => ({
        thread_id: thread.id,
        organization_id: scope.organizationId,
        team_id: thread.team_id,
        user_id: userId,
        participant_role: userId === actor.id ? "owner" : "member",
        created_by: isUuid(actor.id) ? actor.id : null,
      }))
    ).catch(() => null);
  }

  if (thread?.id) {
    await insertAudit(actor, "createThread", {
      organization_id: thread.organization_id,
      team_id: thread.team_id,
      thread_id: thread.id,
    }, {
      type,
      title,
      legacyThreadId: legacyKey,
    }).catch(() => null);
  }

  return thread;
}

async function resolveThreadForAction(actor, body = {}, options = {}) {
  const requestedThreadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (isUuid(requestedThreadId)) {
    return readThread(requestedThreadId);
  }

  const scope = await resolveChatScope(actor, body);
  if (!scope) {
    return null;
  }

  if (options.createIfMissing === false) {
    const inferredThreadType = requestedThreadId === "team" ? "team" : requestedThreadId.startsWith("dm:") ? "dm" : "group";
    const type = normalizeThreadType(body.type || body.threadType || body.thread_type || inferredThreadType);
    const canonicalThreadId = type === "dm" ? canonicalDirectThreadKey(actor, body, requestedThreadId) : requestedThreadId;
    const legacyKey =
      legacyThreadKey(canonicalThreadId || body.legacyThreadId || body.legacy_thread_id || type, type) ||
      `${type}:${actor.id || "staff"}`;
    return readThreadByLegacyKey(scope, legacyKey, type);
  }

  return ensureScopedThread(actor, body, scope, options);
}

async function isThreadParticipant(actor, threadId) {
  return Boolean(await readActorThreadParticipant(actor, threadId));
}

async function readActorThreadParticipant(actor, threadId) {
  if (!actor?.id || !threadId) {
    return null;
  }

  return selectOne(
    "chat_thread_participants",
    `select=thread_id,user_id,participant_role,notification_level,left_at,metadata&thread_id=eq.${filterValue(threadId)}&user_id=eq.${filterValue(actor.id)}&left_at=is.null`
  ).catch(() => null);
}

async function ensureActorThreadParticipant(actor, thread) {
  if (!actor?.id || !thread?.id) {
    return null;
  }
  const existing = await readActorThreadParticipant(actor, thread.id);
  if (existing) {
    return existing;
  }

  const inserted = await insertRows("chat_thread_participants", {
    thread_id: thread.id,
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    user_id: actor.id,
    participant_role: "member",
    created_by: isUuid(actor.id) ? actor.id : null,
    metadata: { addedBy: "self-state", addedAt: new Date().toISOString() },
  }).catch(() => []);
  return inserted[0] || readActorThreadParticipant(actor, thread.id);
}

async function ensureThreadAccess(actor, thread, options = {}) {
  if (!canUseChat(actor)) {
    return { ok: false, status: 403, reason: "Chat access requires a staff role." };
  }

  if (!thread?.id) {
    return { ok: false, status: 404, reason: "Thread not found." };
  }

  const type = normalizeThreadType(thread.type);
  const membership = await readMembership(actor, thread.organization_id, thread.team_id);
  const actorParticipant = await readActorThreadParticipant(actor, thread.id);

  if (threadRequiresParticipantAccess(thread)) {
    if (!actorParticipant) {
      return { ok: false, status: 403, reason: "You do not have access to this chat thread." };
    }
    const isGroupOwner = normalizeParticipantRole(actorParticipant.participant_role) === "owner";
    if (options.manager && actorRole(actor) !== "admin" && !canManageByRole(membership?.role) && !isGroupOwner) {
      return { ok: false, status: 403, reason: "Chat manager access required." };
    }
    return { ok: true, membership, participant: actorParticipant };
  }

  if (["team", "medical", "matchday", "training", "announcement"].includes(type) && membership) {
    if (type === "medical" && !["admin", "club-admin", "team-admin", "coach", "medical", "performance"].includes(String(membership.role || "").toLowerCase())) {
      return { ok: false, status: 403, reason: "Medical chat access required." };
    }
    const isGroupOwner = normalizeParticipantRole(actorParticipant?.participant_role) === "owner";
    if (options.manager && !canManageByRole(membership.role) && actorRole(actor) !== "admin" && !isGroupOwner) {
      return { ok: false, status: 403, reason: "Chat manager access required." };
    }
    return { ok: true, membership, participant: actorParticipant };
  }

  if (actorRole(actor) === "admin" && membership) {
    return { ok: true, membership };
  }

  return { ok: false, status: 403, reason: "You do not have access to this chat thread." };
}

function mentionHandles(text) {
  const handles = [];
  const matcher = /(^|\s)@([a-zA-Z0-9._-]{2,64})/g;
  let match = matcher.exec(text);
  while (match) {
    handles.push(match[2].toLowerCase());
    match = matcher.exec(text);
  }
  return Array.from(new Set(handles)).slice(0, 40);
}

function databaseAuditEvent(actor, action, details = {}) {
  const destructive = ["deleteMessage", "deleteMessageForMe", "clearThread", "archiveThread", "leaveThread"].includes(action);
  const adminAction = ["setMessagePinned", "setMessagePriority", "setThreadSettings", "setThreadParticipants", "clearThread", "archiveThread"].includes(action);
  return {
    action: `chat.${action}`,
    severity: destructive ? "warning" : adminAction ? "notice" : "info",
    actor_id: actor.id || null,
    destructive,
    admin_action: adminAction,
    details,
  };
}

async function insertAudit(actor, action, scope = {}, details = {}) {
  const event = {
    ...databaseAuditEvent(actor, action, details),
    organization_id: scope.organization_id || null,
    team_id: scope.team_id || null,
    thread_id: scope.thread_id || null,
    message_id: scope.message_id || null,
  };

  const rows = await insertRows("chat_audit_events", event);
  return rows[0] || null;
}

function inFilter(values = []) {
  return `in.(${values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`;
}

function toLegacyThreadId(thread = {}) {
  const legacyThreadId = normalizeString(thread?.metadata?.legacyThreadId, MAX_ID_LENGTH);
  if (legacyThreadId) {
    return legacyThreadId;
  }
  return normalizeThreadType(thread?.type) === "team" ? "team" : thread?.id || "";
}

function messagePreviewText(message = {}) {
  return normalizeString(message.body || message.text || "", 180).replace(/\s+/g, " ").trim();
}

function threadParticipantIds(thread = {}) {
  const metadata = thread.metadata && typeof thread.metadata === "object" ? thread.metadata : {};
  const legacyThreadId = toLegacyThreadId(thread);
  return Array.from(
    new Set([
      ...(Array.isArray(metadata.participantIds) ? metadata.participantIds : []),
      ...getParticipantIdsFromLegacyKey(legacyThreadId, normalizeThreadType(thread.type)),
    ].map((value) => normalizeId(value)).filter(Boolean))
  );
}

function participantClientPayload(row = {}, receipt = null) {
  const userId = normalizeId(row.user_id || row.id || row.userId);
  const metadata = isPlainObject(row.metadata) ? row.metadata : {};
  const participantRole = normalizeParticipantRole(row.participant_role || row.participantRole);
  return {
    id: userId,
    userId,
    participantRole,
    role: participantRole,
    chatParticipantRole: participantRole,
    notificationLevel: normalizeString(row.notification_level || row.notificationLevel || "all", 40) || "all",
    metadata,
    userState: participantUserStateFromMetadata(metadata),
    joinedAt: normalizeString(row.joined_at || row.joinedAt || "", 80),
    leftAt: normalizeString(row.left_at || row.leftAt || "", 80),
    lastReadAt: normalizeString(receipt?.last_read_at || receipt?.lastReadAt || "", 80),
    lastReadMessageId: normalizeId(receipt?.last_read_message_id || receipt?.lastReadMessageId || ""),
  };
}

async function readThreadParticipantRows(threadIds = []) {
  const ids = Array.from(new Set(threadIds.filter(Boolean)));
  if (!ids.length) {
    return [];
  }
  return selectMany(
    "chat_thread_participants",
    `select=thread_id,user_id,participant_role,notification_level,joined_at,left_at,metadata&thread_id=${inFilter(ids)}&left_at=is.null`
  ).catch(() => []);
}

async function readActorThreadParticipantRows(actor, threadIds = []) {
  const ids = Array.from(new Set(threadIds.filter(Boolean)));
  if (!actor?.id || !ids.length) {
    return [];
  }
  return selectMany(
    "chat_thread_participants",
    `select=thread_id,user_id,participant_role,notification_level,joined_at,left_at,metadata&thread_id=${inFilter(ids)}&user_id=eq.${filterValue(actor.id)}`
  ).catch(() => []);
}

function isAfterIso(value = "", threshold = "") {
  const valueMs = Date.parse(value || "");
  const thresholdMs = Date.parse(threshold || "");
  return Number.isFinite(valueMs) && Number.isFinite(thresholdMs) && valueMs > thresholdMs;
}

function shouldShowThreadForActor(thread = {}) {
  const userState = participantUserStateFromMetadata(thread.userState || thread.metadata?.userState || {});
  if (userState.archivedAt || userState.hiddenAt || userState.blockedAt) {
    return false;
  }
  if (userState.deletedForUserAt) {
    return isAfterIso(thread.lastMessage?.createdAt || thread.last_message_at || thread.lastMessageAt || "", userState.deletedForUserAt);
  }
  return true;
}

async function filterThreadsForActorAccess(actor, threads = []) {
  const sourceThreads = Array.isArray(threads) ? threads : [];
  if (!sourceThreads.length) {
    return [];
  }
  const accessResults = await Promise.all(
    sourceThreads.map(async (thread) => {
      const access = await ensureThreadAccess(actor, thread).catch(() => ({ ok: false }));
      return access.ok ? thread : null;
    })
  );
  return accessResults.filter(Boolean);
}

async function readHiddenMessageStateRows(actor, messageIds = []) {
  const ids = Array.from(new Set(messageIds.filter(Boolean)));
  if (!actor?.id || !ids.length) {
    return [];
  }
  return selectMany(
    "chat_message_user_states",
    `select=message_id,hidden_at,thread_id,user_id&message_id=${inFilter(ids)}&user_id=eq.${filterValue(actor.id)}&hidden_at=not.is.null`
  ).catch(() => []);
}

async function filterMessagesForActor(actor, messages = [], thread = null) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  if (!sourceMessages.length) {
    return [];
  }
  const actorParticipant = thread?.id ? await readActorThreadParticipant(actor, thread.id) : null;
  const userState = participantUserStateFromMetadata(actorParticipant?.metadata);
  const hiddenRows = await readHiddenMessageStateRows(actor, sourceMessages.map((message) => message.id));
  const hiddenIds = new Set(hiddenRows.map((row) => row.message_id).filter(Boolean));
  return sourceMessages.filter((message) => {
    if (hiddenIds.has(message.id)) {
      return false;
    }
    if (userState.deletedForUserAt && !isAfterIso(message.created_at || message.createdAt || "", userState.deletedForUserAt)) {
      return false;
    }
    return true;
  });
}

async function filterMessagesForActorByThread(actor, messages = [], threadsById = new Map()) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  if (!sourceMessages.length) {
    return [];
  }
  const grouped = sourceMessages.reduce((map, message) => {
    const key = normalizeId(message.thread_id || message.threadId || "");
    map.set(key, [...(map.get(key) || []), message]);
    return map;
  }, new Map());
  const filteredGroups = await Promise.all(
    Array.from(grouped.entries()).map(async ([threadId, groupedMessages]) =>
      filterMessagesForActor(actor, groupedMessages, threadsById.get(threadId) || { id: threadId })
    )
  );
  const visibleIds = new Set(filteredGroups.flat().map((message) => message.id).filter(Boolean));
  return sourceMessages.filter((message) => visibleIds.has(message.id));
}

async function readThreadReadModelRows(threadIds = []) {
  const ids = Array.from(new Set(threadIds.filter(Boolean)));
  if (!ids.length) {
    return [];
  }
  return selectMany(
    "chat_thread_read_models",
    `select=${THREAD_READ_MODEL_SELECT}&thread_id=${inFilter(ids)}`
  ).catch(() => []);
}

function readModelMessage(row = {}) {
  const message = row?.last_message;
  return isPlainObject(message) && message.id ? message : null;
}

function readModelJsonRows(row = {}, key = "") {
  const rows = row?.[key];
  return Array.isArray(rows) ? rows.filter(isPlainObject) : [];
}

function threadPermissionsForActor(actor, thread = {}) {
  const role = actorRole(actor);
  const manager = canAdmin(actor) || MANAGER_ROLES.has(role);
  const type = normalizeThreadType(thread.type);
  return {
    canSend: type !== "announcement" || manager,
    canAttach: true,
    canReact: true,
    canReadReceipts: true,
    canManageParticipants: type !== "team" && manager,
    canPin: manager,
    canClear: canAdmin(actor),
    canModerate: canAdmin(actor),
    canEditOwnMessages: true,
    canDeleteOwnMessages: true,
    canDeleteForMe: true,
    canArchiveForMe: true,
    canForward: true,
    canBlock: type === "dm",
    canLeave: type === "group",
  };
}

function buildMessageEnrichment(reactionRows = [], attachmentRows = [], receiptRows = [], mentionRows = []) {
  const reactionsByMessage = reactionRows.reduce((map, row) => {
    const reactions = map.get(row.message_id) || {};
    const key = normalizeString(row.reaction || "like", 32);
    reactions[key] = Array.from(new Set([...(reactions[key] || []), row.user_id].filter(Boolean)));
    map.set(row.message_id, reactions);
    return map;
  }, new Map());
  const attachmentsByMessage = attachmentRows.reduce((map, row) => {
    map.set(row.message_id, [...(map.get(row.message_id) || []), row]);
    return map;
  }, new Map());
  const mentionsByMessage = mentionRows.reduce((map, row) => {
    const messageId = normalizeId(row.message_id);
    const mentionedUserId = normalizeId(row.mentioned_user_id);
    if (messageId && isUuid(mentionedUserId)) {
      map.set(messageId, [...(map.get(messageId) || []), mentionedUserId]);
    }
    return map;
  }, new Map());

  return {
    reactionsByMessage,
    attachmentsByMessage,
    mentionsByMessage,
    receiptRows: Array.isArray(receiptRows) ? receiptRows : [],
  };
}

function buildMessageDeliveryState(message = {}, thread = null, receiptRows = []) {
  const messageId = normalizeId(message.id || message.message_id || "");
  const threadId = normalizeId(thread?.id || message.thread_id || message.threadId || "");
  const authorId = normalizeId(message.author_id || message.authorId || message.userId || "");
  const createdAt = normalizeString(message.created_at || message.createdAt || "", 80);
  if (message.deleted_at || message.deletedAt || message.isDeleted) {
    return {
      status: "deleted",
      deliveredAt: "",
      readAt: "",
      readBy: [],
      readCount: 0,
      source: "chat_messages",
    };
  }

  const readers = (Array.isArray(receiptRows) ? receiptRows : [])
    .filter((receipt) => {
      const receiptUserId = normalizeId(receipt?.user_id || receipt?.userId || "");
      if (!receiptUserId || receiptUserId === authorId) {
        return false;
      }
      if (threadId && normalizeId(receipt?.thread_id || receipt?.threadId || "") !== threadId) {
        return false;
      }
      if (receipt.last_read_message_id === messageId || receipt.lastReadMessageId === messageId) {
        return true;
      }
      return Date.parse(receipt.last_read_at || receipt.lastReadAt || "") >= Date.parse(createdAt || "");
    })
    .map((receipt) => ({
      userId: normalizeId(receipt.user_id || receipt.userId || ""),
      readAt: normalizeString(receipt.last_read_at || receipt.lastReadAt || "", 80),
    }))
    .filter((reader) => reader.userId);
  const readBy = Array.from(new Set(readers.map((reader) => reader.userId)));
  const readAt = readers
    .map((reader) => reader.readAt)
    .filter(Boolean)
    .sort((first, second) => (Date.parse(second) || 0) - (Date.parse(first) || 0))[0] || "";

  return {
    status: readBy.length ? "read" : messageId ? "delivered" : "sent",
    deliveredAt: createdAt,
    readAt,
    readBy,
    readCount: readBy.length,
    source: "chat_read_receipts",
  };
}

async function loadMessageEnrichment(messages = [], options = {}) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const messageIds = Array.from(new Set(sourceMessages.map((message) => message.id).filter(Boolean)));
  if (!messageIds.length) {
    return buildMessageEnrichment();
  }

  const providedReceiptRows = Array.isArray(options.receiptRows) ? options.receiptRows : null;
  const threadIds = Array.from(new Set(
    (Array.isArray(options.threadIds) ? options.threadIds : [options.thread?.id])
      .map((value) => normalizeId(value))
      .filter(Boolean)
  ));
  const receiptQuery = !providedReceiptRows && threadIds.length
    ? threadIds.length === 1
      ? `select=${RECEIPT_SELECT}&thread_id=eq.${filterValue(threadIds[0])}`
      : `select=${RECEIPT_SELECT}&thread_id=${inFilter(threadIds)}`
    : "";
  const [reactionRows, attachmentRows, fetchedReceiptRows, mentionRows] = await Promise.all([
    selectMany(
      "chat_reactions",
      `select=${REACTION_SELECT}&message_id=${inFilter(messageIds)}`
    ).catch(() => []),
    selectMany(
      "chat_attachments",
      `select=${ATTACHMENT_SELECT}&message_id=${inFilter(messageIds)}&status=in.(pending,ready)`
    ).catch(() => []),
    receiptQuery ? selectMany("chat_read_receipts", receiptQuery).catch(() => []) : Promise.resolve([]),
    selectMany(
      "chat_message_mentions",
      `select=${MENTION_SELECT}&message_id=${inFilter(messageIds)}`
    ).catch(() => []),
  ]);

  return buildMessageEnrichment(reactionRows, attachmentRows, providedReceiptRows || fetchedReceiptRows, mentionRows);
}

function mapEnrichedMessage(message = {}, thread = null, enrichment = buildMessageEnrichment()) {
  const delivery = buildMessageDeliveryState(message, thread, enrichment.receiptRows || []);

  const mentionedUserIds = normalizeMentionedUserIds([
    ...messageMentionedUserIds(message),
    ...(enrichment.mentionsByMessage.get(message.id) || []),
  ]);

  return {
    ...message,
    legacyThreadId: thread ? toLegacyThreadId(thread) : "",
    text: message.body,
    userId: message.author_id,
    threadId: thread ? toLegacyThreadId(thread) : message.thread_id,
    createdAt: message.created_at,
    updatedAt: message.updated_at,
    editedAt: message.edited_at || "",
    replyToId: message.reply_to_id || "",
    pinnedAt: message.pinned_at || "",
    pinnedBy: message.pinned_by || "",
    metadata: isPlainObject(message.metadata) ? message.metadata : {},
    mentionedUserIds,
    forwardedFromMessageId: normalizeId(message.metadata?.forwardedFromMessageId || message.metadata?.forwarded_from_message_id || ""),
    forwardedFromThreadId: normalizeId(message.metadata?.forwardedFromThreadId || message.metadata?.forwarded_from_thread_id || ""),
    author: {
      id: message.author_id || "",
      firstName: normalizeString(message.metadata?.authorName || "Staff", 80).split(" ")[0] || "Staff",
      lastName: normalizeString(message.metadata?.authorName || "", 80).split(" ").slice(1).join(" "),
      role: normalizeString(message.metadata?.authorRole || "coach", 40),
    },
    reactions: enrichment.reactionsByMessage.get(message.id) || {},
    readBy: Array.from(new Set([message.author_id, ...delivery.readBy].filter(Boolean))),
    delivery,
    deliveredAt: delivery.deliveredAt,
    attachments: (enrichment.attachmentsByMessage.get(message.id) || []).map(attachmentClientPayload),
    status: message.deleted_at ? "deleted" : "sent",
  };
}

async function enrichMessages(messages = [], thread = null, options = {}) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const messageIds = sourceMessages.map((message) => message.id).filter(Boolean);
  if (!messageIds.length) {
    return [];
  }

  const threadIds = Array.isArray(options.threadIds)
    ? options.threadIds
    : thread?.id
      ? [thread.id]
      : [];
  const enrichment = options.enrichment || await loadMessageEnrichment(sourceMessages, {
    thread,
    threadIds,
    receiptRows: options.receiptRows,
  });
  const threadsById = options.threadsById instanceof Map ? options.threadsById : null;
  return sourceMessages.map((message) => mapEnrichedMessage(message, threadsById?.get(message.thread_id) || thread, enrichment));
}

async function enrichThreadSummaries(actor, threads = []) {
  if (!Array.isArray(threads) || !threads.length) {
    return [];
  }
  const threadIds = threads.map((thread) => thread.id).filter(Boolean);
  const lastMessageIds = threads.map((thread) => thread.last_message_id).filter(Boolean);
  const threadReadModelRows = await readThreadReadModelRows(threadIds);
  const readModelRowsByThreadId = new Map(threadReadModelRows.map((row) => [row.thread_id, row]));
  const readModelMessages = threadReadModelRows.map(readModelMessage).filter(Boolean);
  const readModelMessageIds = new Set(readModelMessages.map((message) => message.id).filter(Boolean));
  const missingLastMessageIds = lastMessageIds.filter((messageId) => !readModelMessageIds.has(messageId));
  const [fallbackLastMessages, receipts, participantRows, allReceipts] = await Promise.all([
    missingLastMessageIds.length
      ? selectMany("chat_messages", `select=${MESSAGE_SELECT}&id=${inFilter(missingLastMessageIds)}&deleted_at=is.null`).catch(() => [])
      : Promise.resolve([]),
    actor?.id && threadIds.length
      ? selectMany(
          "chat_read_receipts",
          `select=${RECEIPT_SELECT}&thread_id=${inFilter(threadIds)}&user_id=eq.${filterValue(actor.id)}`
        ).catch(() => [])
      : Promise.resolve([]),
    readThreadParticipantRows(threadIds),
    threadIds.length
      ? selectMany("chat_read_receipts", `select=${RECEIPT_SELECT}&thread_id=${inFilter(threadIds)}`).catch(() => [])
      : Promise.resolve([]),
  ]);
  const [actorParticipantRows, hiddenLastMessageRows] = await Promise.all([
    readActorThreadParticipantRows(actor, threadIds),
    readHiddenMessageStateRows(actor, lastMessageIds),
  ]);
  const hiddenLastMessageIds = new Set(hiddenLastMessageRows.map((row) => row.message_id).filter(Boolean));
  const readModelReactionRows = threadReadModelRows.flatMap((row) => readModelJsonRows(row, "last_message_reactions"));
  const readModelAttachmentRows = threadReadModelRows.flatMap((row) => readModelJsonRows(row, "last_message_attachments"));
  const readModelEnrichment = buildMessageEnrichment(readModelReactionRows, readModelAttachmentRows, allReceipts);
  const fallbackLastMessageEnrichment = await loadMessageEnrichment(fallbackLastMessages, {
    threadIds,
    receiptRows: allReceipts,
  });
  const lastMessages = [...readModelMessages, ...fallbackLastMessages];
  const messagesById = new Map(lastMessages.map((message) => [message.id, message]));
  const receiptsByThreadId = new Map(receipts.map((receipt) => [receipt.thread_id, receipt]));
  const participantRowsByThreadId = participantRows.reduce((map, participant) => {
    map.set(participant.thread_id, [...(map.get(participant.thread_id) || []), participant]);
    return map;
  }, new Map());
  const actorParticipantByThreadId = new Map(actorParticipantRows.map((participant) => [participant.thread_id, participant]));
  const receiptsByThreadAndUser = allReceipts.reduce((map, receipt) => {
    map.set(`${receipt.thread_id}:${receipt.user_id}`, receipt);
    return map;
  }, new Map());
  return threads.map((thread) => {
    const actorParticipant = actorParticipantByThreadId.get(thread.id) || null;
    const actorUserState = participantUserStateFromMetadata(actorParticipant?.metadata);
    const lastMessage = messagesById.get(thread.last_message_id) || null;
    const threadReadModel = readModelRowsByThreadId.get(thread.id) || null;
    const hasReadModelLastMessage = Boolean(threadReadModel && lastMessage?.id && readModelMessageIds.has(lastMessage.id));
    const lastMessageHiddenByUserState =
      hiddenLastMessageIds.has(lastMessage?.id) ||
      (actorUserState.deletedForUserAt && lastMessage && !isAfterIso(lastMessage.created_at || lastMessage.createdAt || "", actorUserState.deletedForUserAt));
    const enrichedLastMessage = lastMessage && !lastMessageHiddenByUserState
      ? mapEnrichedMessage(lastMessage, thread, hasReadModelLastMessage ? readModelEnrichment : fallbackLastMessageEnrichment)
      : null;
    const receipt = receiptsByThreadId.get(thread.id) || null;
    const metadata = isPlainObject(thread.metadata) ? thread.metadata : {};
    const settingsByUser = isPlainObject(metadata.settingsByUser) ? metadata.settingsByUser : {};
    const actorSettings = normalizeThreadSettingPatch(settingsByUser[actor?.id] || {});
    const lastMessageAtMs = Date.parse(thread.last_message_at || lastMessage?.created_at || "");
    const lastReadAtMs = Date.parse(receipt?.last_read_at || "");
    const unreadCount =
      enrichedLastMessage?.author_id && enrichedLastMessage.author_id !== actor?.id && Number.isFinite(lastMessageAtMs) && (!Number.isFinite(lastReadAtMs) || lastMessageAtMs > lastReadAtMs)
        ? 1
        : 0;
    return {
      ...thread,
      legacyThreadId: toLegacyThreadId(thread),
      threadId: toLegacyThreadId(thread),
      participants: (participantRowsByThreadId.get(thread.id) || []).length
        ? (participantRowsByThreadId.get(thread.id) || []).map((participant) =>
            participantClientPayload(participant, receiptsByThreadAndUser.get(`${thread.id}:${participant.user_id}`))
          )
        : threadParticipantIds(thread).map((userId) => participantClientPayload({ user_id: userId })),
      permissions: threadPermissionsForActor(actor, thread),
      userState: actorUserState,
      notificationLevel: normalizeString(actorParticipant?.notification_level || "all", 40) || "all",
      avatarUrl: normalizeString(metadata.avatarUrl || metadata.imageUrl || "", 800),
      settings: {
        muted: Boolean(actorSettings.muted),
        pinned: Boolean(actorSettings.pinned),
        customTitle: normalizeString(metadata.customTitle || "", 140),
        avatarLabel: normalizeString(metadata.avatarLabel || "", 2).toUpperCase(),
        avatarUrl: normalizeString(metadata.avatarUrl || metadata.imageUrl || "", 800),
        updatedAt: normalizeString(settingsByUser[actor?.id]?.updatedAt || metadata.threadSettingsUpdatedAt || metadata.settingsUpdatedAt || "", 80),
      },
      lastMessage: enrichedLastMessage || null,
      lastMessagePreview: enrichedLastMessage ? messagePreviewText(enrichedLastMessage) : "",
      unreadCount,
      lastReadAt: receipt?.last_read_at || "",
    };
  });
}

async function recalculateThreadSummary(thread = {}) {
  if (!thread?.id) {
    return thread;
  }
  const [messages, visibleMessages] = await Promise.all([
    selectMany(
      "chat_messages",
      [
        `select=${MESSAGE_SELECT}`,
        `thread_id=eq.${filterValue(thread.id)}`,
        "deleted_at=is.null",
        "order=created_at.desc",
        "limit=1",
      ].join("&")
    ).catch(() => []),
    selectMany(
      "chat_messages",
      [
        "select=id",
        `thread_id=eq.${filterValue(thread.id)}`,
        "deleted_at=is.null",
      ].join("&")
    ).catch(() => []),
  ]);
  const latestMessage = messages[0] || null;
  const nextMessageCount = visibleMessages.length;
  const [updatedThread] = await patchRows("chat_threads", `id=eq.${filterValue(thread.id)}`, {
    last_message_id: latestMessage?.id || null,
    last_message_at: latestMessage?.created_at || null,
    message_count: nextMessageCount,
  }).catch(() => []);
  return updatedThread || {
    ...thread,
    last_message_id: latestMessage?.id || null,
    last_message_at: latestMessage?.created_at || null,
    message_count: nextMessageCount,
  };
}

function isMissingOptionalTableError(error, tableName = "") {
  const payload = error?.payload && typeof error.payload === "object" ? error.payload : {};
  const haystack = [
    payload.code,
    payload.message,
    payload.details,
    payload.hint,
    error?.message,
  ].map((value) => String(value || "")).join(" ");
  return payload.code === "42P01" || (tableName && haystack.includes(tableName) && /schema cache|does not exist|not found/i.test(haystack));
}

function actionItemClientPayload(row = {}) {
  const metadata = isPlainObject(row.metadata) ? row.metadata : {};
  return {
    id: normalizeId(row.id || ""),
    actionItemId: normalizeId(row.id || ""),
    organizationId: normalizeId(row.organization_id || ""),
    teamId: normalizeId(row.team_id || ""),
    threadId: normalizeId(row.thread_id || ""),
    messageId: normalizeId(row.message_id || ""),
    clientActionId: normalizeString(row.client_action_id || "", 120),
    title: normalizeActionItemTitle(row.title || ""),
    status: normalizeActionItemStatus(row.status || "open"),
    priority: normalizeActionItemPriority(row.priority || "normal"),
    ownerId: normalizeId(row.owner_id || ""),
    dueLabel: normalizeActionItemDueLabel(row.due_label || "") || "",
    dueAt: normalizeString(row.due_at || "", 80),
    createdBy: normalizeId(row.created_by || ""),
    completedBy: normalizeId(row.completed_by || ""),
    createdAt: normalizeString(row.created_at || "", 80),
    updatedAt: normalizeString(row.updated_at || "", 80),
    completedAt: normalizeString(row.completed_at || "", 80),
    archivedAt: normalizeString(row.archived_at || "", 80),
    metadata,
  };
}

async function readActionItemsForThreads(threadIds = [], options = {}) {
  const ids = Array.from(new Set((Array.isArray(threadIds) ? threadIds : []).map(normalizeId).filter(isUuid)));
  if (!ids.length) {
    return [];
  }
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 50));
  const filters = [
    `select=${ACTION_ITEM_SELECT}`,
    ids.length === 1 ? `thread_id=eq.${filterValue(ids[0])}` : `thread_id=${inFilter(ids)}`,
    "status=neq.archived",
    "order=created_at.desc",
    `limit=${limit}`,
  ];
  try {
    const rows = await selectMany("chat_action_items", filters.join("&"));
    return rows.map(actionItemClientPayload);
  } catch (error) {
    if (isMissingOptionalTableError(error, "chat_action_items")) {
      return [];
    }
    throw error;
  }
}

async function handleDatabaseGet(req, res, actor) {
  const query = new URL(req.url, "http://localhost").searchParams;
  const view = normalizeString(query.get("view"), 40).toLowerCase();
  const search = normalizeString(query.get("search"), 120);
  const organizationId = normalizeId(query.get("organizationId"));
  const teamId = normalizeId(query.get("teamId"));
  const threadId = normalizeId(query.get("threadId"));
  const cursor = normalizeString(query.get("cursor"), 80);
  const limit = Math.max(1, Math.min(PAGE_SIZE_MAX, Number(query.get("limit")) || PAGE_SIZE_DEFAULT));
  const auditAction = normalizeString(query.get("action"), 80).toLowerCase();
  const auditUserId = normalizeId(query.get("userId") || query.get("user"));
  const auditThreadId = normalizeId(query.get("auditThreadId") || query.get("thread"));
  const auditFrom = normalizeString(query.get("from"), 80);
  const auditTo = normalizeString(query.get("to"), 80);
  const auditFromIso = auditFrom && !Number.isNaN(Date.parse(auditFrom)) ? new Date(auditFrom).toISOString() : "";
  const auditToDate = auditTo && !Number.isNaN(Date.parse(auditTo)) ? new Date(auditTo) : null;
  if (auditToDate && /^\d{4}-\d{2}-\d{2}$/.test(auditTo)) {
    auditToDate.setUTCHours(23, 59, 59, 999);
  }
  const auditToIso = auditToDate ? auditToDate.toISOString() : "";

  const scope = await resolveChatScope(actor, { organizationId, teamId });
  if (!scope) {
    return sendJson(res, 403, { ok: false, reason: "You do not have access to this chat organization or team." });
  }

  if (view === "moderation" || view === "admin") {
    if (!canAdmin(actor)) {
      return sendJson(res, 403, { ok: false, reason: "Admin chat access required." });
    }

    const auditFilters = [
      `select=${AUDIT_SELECT}`,
      `organization_id=eq.${filterValue(scope.organizationId)}`,
      "order=created_at.desc",
      `limit=${limit}`,
    ];
    if (auditAction && auditAction !== "all" && auditAction !== "failed-uploads") {
      if (auditAction === "delete") {
        auditFilters.push('action=in.("chat.deleteMessage","chat.clearThread")');
      } else if (auditAction === "admin") {
        auditFilters.push("admin_action=eq.true");
      } else if (auditAction === "destructive") {
        auditFilters.push("destructive=eq.true");
      } else {
        auditFilters.push(`action=eq.${filterValue(auditAction.startsWith("chat.") ? auditAction : `chat.${auditAction}`)}`);
      }
    }
    if (isUuid(auditUserId)) {
      auditFilters.push(`actor_id=eq.${filterValue(auditUserId)}`);
    }
    if (isUuid(auditThreadId)) {
      auditFilters.push(`thread_id=eq.${filterValue(auditThreadId)}`);
    }
    if (auditFromIso) {
      auditFilters.push(`created_at=gte.${filterValue(auditFromIso)}`);
    }
    if (auditToIso) {
      auditFilters.push(`created_at=lte.${filterValue(auditToIso)}`);
    }

    const failedUploadFilters = [
      "select=id,thread_id,uploaded_by,status,created_at,updated_at,metadata",
      `organization_id=eq.${filterValue(scope.organizationId)}`,
      "status=in.(failed,error)",
      "order=created_at.desc",
      `limit=${limit}`,
    ];
    if (isUuid(auditUserId)) {
      failedUploadFilters.push(`uploaded_by=eq.${filterValue(auditUserId)}`);
    }
    if (isUuid(auditThreadId)) {
      failedUploadFilters.push(`thread_id=eq.${filterValue(auditThreadId)}`);
    }
    if (auditFromIso) {
      failedUploadFilters.push(`created_at=gte.${filterValue(auditFromIso)}`);
    }
    if (auditToIso) {
      failedUploadFilters.push(`created_at=lte.${filterValue(auditToIso)}`);
    }

    const includeFailedUploads = auditAction === "all" || auditAction === "failed-uploads";
    const [audits, failedUploads] = await Promise.all([
      auditAction === "failed-uploads" ? Promise.resolve([]) : selectMany("chat_audit_events", auditFilters.join("&")),
      includeFailedUploads ? selectMany("chat_attachments", failedUploadFilters.join("&")).catch(() => []) : Promise.resolve([]),
    ]);
    const retentionPolicies = await selectMany(
      "chat_retention_policies",
      `select=*&organization_id=eq.${filterValue(scope.organizationId)}&limit=1`
    ).catch(() => []);
    return sendJson(res, 200, {
      ok: true,
      schema: "footballscience-chat-database-v1",
      mode: "database",
      scope,
      audits,
      failedUploads,
      filters: {
        action: auditAction || "all",
        userId: auditUserId,
        threadId: auditThreadId,
        from: auditFrom,
        to: auditTo,
      },
      retentionPolicy: retentionPolicies[0] || null,
    });
  }

  if (view === "health") {
    if (!canAdmin(actor)) {
      return sendJson(res, 403, { ok: false, reason: "Admin chat access required." });
    }
    const [threads, messages, attachments, audits] = await Promise.all([
      selectMany(
        "chat_threads",
        `select=id,last_message_at,message_count,updated_at&organization_id=eq.${filterValue(scope.organizationId)}&archived_at=is.null&limit=1000`
      ).catch(() => []),
      selectMany(
        "chat_messages",
        `select=id,thread_id,deleted_at,created_at&organization_id=eq.${filterValue(scope.organizationId)}&limit=1000`
      ).catch(() => []),
      selectMany(
        "chat_attachments",
        `select=id,status,created_at&organization_id=eq.${filterValue(scope.organizationId)}&limit=1000`
      ).catch(() => []),
      selectMany(
        "chat_audit_events",
        `select=${AUDIT_SELECT}&organization_id=eq.${filterValue(scope.organizationId)}&order=created_at.desc&limit=8`
      ).catch(() => []),
    ]);
    return sendJson(res, 200, {
      ok: true,
      schema: "footballscience-chat-database-v1",
      mode: "database",
      scope,
      health: {
        checkedAt: new Date().toISOString(),
        threadCount: threads.length,
        messageCount: messages.filter((message) => !message.deleted_at).length,
        deletedMessageCount: messages.filter((message) => message.deleted_at).length,
        attachmentCount: attachments.length,
        pendingAttachmentCount: attachments.filter((attachment) => attachment.status === "pending").length,
        latestThreadAt:
          threads
            .map((thread) => thread.last_message_at || thread.updated_at || "")
            .filter(Boolean)
            .sort()
            .at(-1) || "",
        latestAuditAt: audits[0]?.created_at || "",
      },
      audits,
    });
  }

  if (search) {
    const participantRows = actor?.id
      ? await selectMany(
          "chat_thread_participants",
          [
            "select=thread_id",
            `organization_id=eq.${filterValue(scope.organizationId)}`,
            `user_id=eq.${filterValue(actor.id)}`,
            "left_at=is.null",
            "limit=200",
          ].join("&")
        ).catch(() => [])
      : [];
    const participantThreadIds = new Set(participantRows.map((row) => row.thread_id).filter(Boolean));
    const searchFetchLimit = Math.min(PAGE_SIZE_MAX * 5, Math.max(limit * 5, limit));
    const filters = [
      `select=${MESSAGE_SELECT}`,
      `organization_id=eq.${filterValue(scope.organizationId)}`,
      "deleted_at=is.null",
      `body=ilike.*${filterValue(search)}*`,
      "order=created_at.desc",
      `limit=${searchFetchLimit}`,
    ];
    const messages = await selectMany("chat_messages", filters.join("&"));
    const threads = messages.length
      ? await selectMany("chat_threads", `select=${THREAD_SELECT}&id=${inFilter(Array.from(new Set(messages.map((message) => message.thread_id))))}`)
      : [];
    const candidateThreads = Array.from(new Map(
      threads
        .filter((thread) => thread.team_id === scope.teamId || (thread.type === "dm" && participantThreadIds.has(thread.id)))
        .map((thread) => [thread.id, thread])
    ).values());
    const accessibleThreads = await filterThreadsForActorAccess(actor, candidateThreads);
    const threadsById = new Map(accessibleThreads.map((thread) => [thread.id, thread]));
    const searchableThreadSummaries = await enrichThreadSummaries(actor, Array.from(threadsById.values()));
    const visibleThreadIds = new Set(searchableThreadSummaries.filter(shouldShowThreadForActor).map((thread) => thread.id));
    const visibleMessages = await filterMessagesForActorByThread(
      actor,
      messages.reverse().filter((message) => threadsById.has(message.thread_id) && visibleThreadIds.has(message.thread_id)).slice(-limit),
      threadsById
    );
    const enriched = await enrichMessages(visibleMessages, null, {
      threadIds: Array.from(new Set(visibleMessages.map((message) => message.thread_id).filter(Boolean))),
      threadsById,
    });
    return sendJson(res, 200, {
      ok: true,
      schema: "footballscience-chat-database-v1",
      mode: "database",
      scope,
      messages: enriched,
      search,
    });
  }

  if (threadId || query.has("threadId")) {
    const requestedThreadId = threadId || "team";
    const requestedThreadType = query.get("threadType") || (String(requestedThreadId || "").startsWith("dm:") ? "dm" : "team");
    const thread = await resolveThreadForAction(actor, {
      organizationId: scope.organizationId,
      teamId: scope.teamId,
      threadId: requestedThreadId,
      type: requestedThreadType,
    });
    const access = await ensureThreadAccess(actor, thread);
    if (!access.ok) {
      return sendJson(res, access.status || 403, access);
    }

    const activeThreads = await readAccessibleLogicalThreads(actor, scope, thread, requestedThreadId);
    const logicalThreadIds = Array.from(new Set(activeThreads.map((candidateThread) => candidateThread.id).filter(Boolean)));
    const threadFilter = logicalThreadIds.length === 1
      ? `thread_id=eq.${filterValue(logicalThreadIds[0])}`
      : `thread_id=${inFilter(logicalThreadIds)}`;

    const filters = [
      `select=${MESSAGE_SELECT}`,
      threadFilter,
      "deleted_at=is.null",
      "order=created_at.desc",
      `limit=${limit}`,
    ];

    if (cursor) {
      filters.push(`created_at=lt.${filterValue(cursor)}`);
    }

    const messages = await selectMany("chat_messages", filters.join("&"));
    const threadsById = new Map(activeThreads.map((candidateThread) => [candidateThread.id, candidateThread]));
    const filteredMessages = await filterMessagesForActorByThread(actor, messages, threadsById);
    const nextCursor = messages.length === limit ? messages[messages.length - 1]?.created_at || "" : "";
    const enrichedMessages = await enrichMessages([...filteredMessages].reverse(), null, {
      threadIds: logicalThreadIds,
      threadsById,
    });
    const threadSummaries = combineLogicalThreadSummaries(
      (await enrichThreadSummaries(actor, activeThreads)).filter(shouldShowThreadForActor)
    );
    const responseThread = withDetailResponseMessageCount(
      threadSummaries[0] || (await enrichThreadSummaries(actor, [thread]))[0] || thread,
      {
        requestedLimit: limit,
        rawMessageCount: messages.length,
        visibleMessageCount: enrichedMessages.length,
        nextCursor,
      }
    );
    const actionItems = await readActionItemsForThreads(logicalThreadIds);
    responseThread.actionItems = actionItems;
    responseThread.action_items = actionItems;
    const responseThreads = threadSummaries.length
      ? [responseThread, ...threadSummaries.slice(1)]
      : [responseThread];
    return sendJson(res, 200, {
      ok: true,
      schema: "footballscience-chat-database-v1",
      mode: "database",
      scope,
      thread: responseThread,
      threads: responseThreads,
      messages: enrichedMessages,
      actionItems,
      nextCursor,
    });
  }

  const threadFilters = [
    `select=${THREAD_SELECT}`,
    `organization_id=eq.${filterValue(scope.organizationId)}`,
    "archived_at=is.null",
    "order=last_message_at.desc.nullslast",
    `limit=${limit}`,
  ];

  if (scope.teamId) {
    threadFilters.push(`team_id=eq.${filterValue(scope.teamId)}`);
  }

  const scopedThreads = await selectMany("chat_threads", threadFilters.join("&"));
  const participantRows = actor?.id
    ? await selectMany(
        "chat_thread_participants",
        [
          "select=thread_id",
          `organization_id=eq.${filterValue(scope.organizationId)}`,
          `user_id=eq.${filterValue(actor.id)}`,
          "left_at=is.null",
          "limit=200",
        ].join("&")
      ).catch(() => [])
    : [];
  const participantThreadIds = Array.from(new Set(participantRows.map((row) => row.thread_id).filter(Boolean)));
  const directThreads = participantThreadIds.length
    ? await selectMany(
        "chat_threads",
        [
          `select=${THREAD_SELECT}`,
          `organization_id=eq.${filterValue(scope.organizationId)}`,
          "type=eq.dm",
          `id=${inFilter(participantThreadIds)}`,
          "archived_at=is.null",
          "order=last_message_at.desc.nullslast",
          `limit=${limit}`,
        ].join("&")
      ).catch(() => [])
    : [];
  const threadsById = new Map();
  [...scopedThreads, ...directThreads].forEach((thread) => {
    if (thread?.id) {
      threadsById.set(thread.id, thread);
    }
  });
  const threads = (await filterThreadsForActorAccess(actor, Array.from(threadsById.values()))).sort((first, second) => {
    const firstTime = Date.parse(first.last_message_at || "") || 0;
    const secondTime = Date.parse(second.last_message_at || "") || 0;
    if (firstTime !== secondTime) {
      return secondTime - firstTime;
    }
    return String(first.title || "").localeCompare(String(second.title || ""), undefined, { sensitivity: "base" });
  });
  const threadSummaries = combineLogicalThreadSummaries(
    (await enrichThreadSummaries(actor, threads)).filter(shouldShowThreadForActor)
  );
  return sendJson(res, 200, {
    ok: true,
    schema: "footballscience-chat-database-v1",
    mode: "database",
    scope,
    threads: threadSummaries,
    messages: [],
  });
}

async function createThread(actor, body) {
  const type = normalizeThreadType(body.type || body.threadType);
  const scope = await resolveChatScope(actor, body);
  if (!scope) {
    return { ok: false, status: 403, reason: "You do not have access to this chat organization or team." };
  }

  const requestedThreadId = normalizeId(body.threadId || body.thread_id || body.id);
  const participantIds = await resolveParticipantIdsForThread(actor, body, requestedThreadId, type);
  if ((type === "group" || type === "dm") && participantIds.length < 2) {
    return { ok: false, status: 400, reason: "A private or group chat needs at least two valid participants." };
  }

  const thread = await ensureScopedThread(actor, { ...body, type, participantIds }, scope);
  if (!thread?.id) {
    return { ok: false, status: 500, reason: "Chat thread could not be created." };
  }

  return { ok: true, action: "createThread", scope, thread, auditId: "" };
}

async function sendMessage(actor, body) {
  const text = normalizeMessageText(body.text || body.message || body.body);
  const clientMessageId = normalizeString(body.clientMessageId || body.client_message_id || body.id, 120);
  const requestedReplyToId = normalizeId(body.replyToId || body.reply_to_id);
  const replyToId = isUuid(requestedReplyToId) ? requestedReplyToId : null;
  const attachmentIds = Array.from(new Set(
    Array.isArray(body.attachmentIds)
      ? body.attachmentIds.map((value) => normalizeId(value)).filter(isUuid)
      : []
  )).slice(0, 10);
  const mentionedUserIds = normalizeMentionedUserIds(body.mentionedUserIds || body.mentioned_user_ids || body.metadata?.mentionedUserIds);
  const mentions = mentionHandles(text);

  if (!text && !attachmentIds.length) {
    return { ok: false, status: 400, reason: "Message text or an attachment is required." };
  }

  const thread = await resolveThreadForAction(actor, body);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  if (thread?.metadata?.announcementOnly && !canManageByRole(access.membership?.role) && !canAdmin(actor)) {
    return { ok: false, status: 403, reason: "Only chat managers can post announcements." };
  }

  if (attachmentIds.length) {
    const attachmentRows = await selectMany(
      "chat_attachments",
      [
        `select=${ATTACHMENT_SELECT}`,
        `id=${inFilter(attachmentIds)}`,
        `uploaded_by=eq.${filterValue(actor.id)}`,
        `thread_id=eq.${filterValue(thread.id)}`,
        "status=in.(pending,ready)",
      ].join("&")
    ).catch(() => []);
    const foundAttachmentIds = new Set(attachmentRows.map((attachment) => attachment.id).filter(Boolean));
    if (foundAttachmentIds.size !== attachmentIds.length) {
      return { ok: false, status: 400, reason: "Attachment could not be linked. Message was not sent." };
    }
  }

  if (clientMessageId) {
    const existingMessage = await selectOne(
      "chat_messages",
      [
        `select=${MESSAGE_SELECT}`,
        `thread_id=eq.${filterValue(thread.id)}`,
        `client_message_id=eq.${filterValue(clientMessageId)}`,
        "deleted_at=is.null",
      ].join("&")
    ).catch(() => null);
    if (existingMessage) {
      const [enrichedExistingMessage] = await enrichMessages([existingMessage], thread);
      return {
        ok: true,
        action: "sendMessage",
        duplicate: true,
        thread,
        message: enrichedExistingMessage || existingMessage,
        auditId: "",
      };
    }
  }

  let rows = [];
  try {
    rows = await insertRows("chat_messages", {
      organization_id: thread.organization_id,
      team_id: thread.team_id,
      thread_id: thread.id,
      author_id: actor.id || null,
      body: text,
      priority: normalizePriority(body.priority),
      reply_to_id: replyToId,
      client_message_id: clientMessageId || null,
      metadata: {
        authorName: normalizeString(`${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email),
        authorRole: actorRole(actor),
        mentionedUserIds,
        mentionHandles: mentions,
      },
    });
  } catch (error) {
    if (!clientMessageId) {
      throw error;
    }
    const existingMessage = await selectOne(
      "chat_messages",
      [
        `select=${MESSAGE_SELECT}`,
        `thread_id=eq.${filterValue(thread.id)}`,
        `client_message_id=eq.${filterValue(clientMessageId)}`,
        "deleted_at=is.null",
      ].join("&")
    ).catch(() => null);
    if (!existingMessage) {
      throw error;
    }
    const [enrichedExistingMessage] = await enrichMessages([existingMessage], thread);
    return {
      ok: true,
      action: "sendMessage",
      duplicate: true,
      thread,
      message: enrichedExistingMessage || existingMessage,
      auditId: "",
    };
  }
  const message = rows[0];
  const mentionRows = [
    ...mentions.map((handle) => ({
      message_id: message.id,
      organization_id: thread.organization_id,
      team_id: thread.team_id,
      handle,
    })),
    ...mentionedUserIds.map((userId) => ({
      message_id: message.id,
      organization_id: thread.organization_id,
      team_id: thread.team_id,
      mentioned_user_id: userId,
      handle: `user:${userId}`,
    })),
  ].filter((row, index, rowsToInsert) => rowsToInsert.findIndex((candidate) => candidate.handle === row.handle) === index);

  if (mentionRows.length) {
    await insertRows(
      "chat_message_mentions",
      mentionRows
    );
  }

  if (attachmentIds.length) {
    const linkedAttachments = await patchRows(
      "chat_attachments",
      `id=${inFilter(attachmentIds)}&uploaded_by=eq.${filterValue(actor.id)}`,
      {
        thread_id: thread.id,
        message_id: message.id,
        status: "ready",
      }
    ).catch(() => []);
    if (linkedAttachments.length !== attachmentIds.length) {
      await patchRows("chat_messages", `id=eq.${filterValue(message.id)}`, {
        body: "",
        deleted_at: new Date().toISOString(),
        deleted_by: isUuid(actor.id) ? actor.id : null,
      }).catch(() => []);
      return { ok: false, status: 409, reason: "Attachment could not be linked. Message was not sent." };
    }
  }

  const updatedThread = await recalculateThreadSummary({
    ...thread,
    last_message_id: message.id,
    last_message_at: message.created_at,
  });

  await insertRows("chat_read_receipts", {
    thread_id: thread.id,
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    user_id: actor.id,
    last_read_message_id: message.id,
    last_read_at: message.created_at,
  }).catch(() => patchRows(
    "chat_read_receipts",
    `thread_id=eq.${filterValue(thread.id)}&user_id=eq.${filterValue(actor.id)}`,
    {
      last_read_message_id: message.id,
      last_read_at: message.created_at,
    }
  ));

  const audit = await insertAudit(actor, "sendMessage", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
    message_id: message.id,
  }, {
    textLength: text.length,
    mentionCount: mentionRows.length,
    priority: message.priority,
    attachmentCount: attachmentIds.length,
  });
  const [enrichedMessage] = await enrichMessages([message], thread);
  await notifyChatMessageCreated(actor, { thread: updatedThread || thread, message: enrichedMessage || message }).catch((error) => {
    console.warn(JSON.stringify({
      schema: "footballscience-chat-push-delivery-warning-v1",
      level: "warning",
      eventType: "chat.push.delivery_failed",
      threadId: thread.id,
      messageId: message.id,
      reason: normalizeString(error?.message || "Push delivery failed.", 180),
      timestamp: new Date().toISOString(),
    }));
  });

  return { ok: true, action: "sendMessage", thread: updatedThread, message: enrichedMessage || message, auditId: audit?.id || "" };
}

function actionItemUnavailableResult() {
  return {
    ok: false,
    status: 503,
    reason: "Chat action items are not available until the latest database migration has been applied.",
  };
}

async function createActionItem(actor, body = {}) {
  const requestedMessageId = normalizeId(body.messageId || body.message_id || "");
  if ((body.messageId || body.message_id) && !isUuid(requestedMessageId)) {
    return { ok: false, status: 400, reason: "messageId must be a valid message id." };
  }

  let sourceMessage = null;
  let thread = null;
  if (requestedMessageId) {
    sourceMessage = await selectOne("chat_messages", `select=${MESSAGE_SELECT}&id=eq.${filterValue(requestedMessageId)}`);
    if (!sourceMessage || sourceMessage.deleted_at) {
      return { ok: false, status: 404, reason: "Message not found." };
    }
    thread = await readThread(sourceMessage.thread_id);
  } else {
    thread = await resolveThreadForAction(actor, body);
  }

  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const title = normalizeActionItemTitle(body.title || body.summary || body.text || messagePreviewText(sourceMessage || {}));
  if (!title) {
    return { ok: false, status: 400, reason: "Action item title is required." };
  }

  const ownerId = normalizeId(body.ownerId || body.owner_id || "");
  const dueAt = normalizeOptionalIsoDate(body.dueAt || body.due_at || "");
  if ((body.dueAt || body.due_at) && !dueAt) {
    return { ok: false, status: 400, reason: "dueAt must be a valid date." };
  }

  const clientActionId = normalizeString(
    body.clientActionId || body.client_action_id || (requestedMessageId ? `message:${requestedMessageId}` : ""),
    120
  ) || null;
  const metadata = isPlainObject(body.metadata) ? body.metadata : {};
  const row = {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
    message_id: requestedMessageId || null,
    client_action_id: clientActionId,
    title,
    status: "open",
    priority: normalizeActionItemPriority(body.priority || sourceMessage?.priority || "normal"),
    owner_id: isUuid(ownerId) ? ownerId : null,
    due_label: normalizeActionItemDueLabel(body.dueLabel || body.due_label || metadata.dueLabel || metadata.due_label || ""),
    due_at: dueAt,
    created_by: isUuid(actor.id) ? actor.id : null,
    metadata: {
      ...metadata,
      source: normalizeString(metadata.source || body.source || (requestedMessageId ? "chat-message" : "manual"), 80),
      ownerLabel: normalizeString(body.ownerLabel || body.owner_label || metadata.ownerLabel || metadata.owner_label || "", 120),
    },
  };

  try {
    if (clientActionId) {
      const existing = await selectOne(
        "chat_action_items",
        [
          `select=${ACTION_ITEM_SELECT}`,
          `thread_id=eq.${filterValue(thread.id)}`,
          `client_action_id=eq.${filterValue(clientActionId)}`,
        ].join("&")
      ).catch((error) => {
        if (isMissingOptionalTableError(error, "chat_action_items")) {
          return null;
        }
        throw error;
      });
      if (existing) {
        const actionItems = await readActionItemsForThreads([thread.id]);
        return {
          ok: true,
          action: "createActionItem",
          duplicate: true,
          thread: { ...thread, actionItems, action_items: actionItems },
          actionItem: actionItemClientPayload(existing),
          actionItems,
          auditId: "",
        };
      }
    }

    const rows = await insertRows("chat_action_items", row);
    const actionItem = actionItemClientPayload(rows[0] || row);
    const audit = await insertAudit(actor, "createActionItem", {
      organization_id: thread.organization_id,
      team_id: thread.team_id,
      thread_id: thread.id,
      message_id: requestedMessageId || null,
    }, {
      actionItemId: actionItem.id,
      priority: actionItem.priority,
      hasOwner: Boolean(actionItem.ownerId || actionItem.metadata?.ownerLabel),
      hasDue: Boolean(actionItem.dueLabel || actionItem.dueAt),
    });
    const actionItems = await readActionItemsForThreads([thread.id]);
    return {
      ok: true,
      action: "createActionItem",
      thread: { ...thread, actionItems, action_items: actionItems },
      actionItem,
      actionItems,
      auditId: audit?.id || "",
    };
  } catch (error) {
    if (isMissingOptionalTableError(error, "chat_action_items")) {
      return actionItemUnavailableResult();
    }
    throw error;
  }
}

async function editMessage(actor, body) {
  const messageId = normalizeId(body.messageId || body.message_id || body.id);
  const text = normalizeMessageText(body.text || body.message || body.body);
  if (!messageId) {
    return { ok: false, status: 400, reason: "messageId is required." };
  }
  if (!text) {
    return { ok: false, status: 400, reason: "Message text is required." };
  }

  const message = await selectOne("chat_messages", `select=${MESSAGE_SELECT}&id=eq.${filterValue(messageId)}`);
  if (!message || message.deleted_at) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = await readThread(message.thread_id);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }
  if (message.author_id !== actor.id) {
    return { ok: false, status: 403, reason: "Only the author can edit this message." };
  }

  const rows = await patchRows("chat_messages", `id=eq.${filterValue(message.id)}`, {
    body: text,
    edited_at: new Date().toISOString(),
  });
  const updatedMessage = rows[0] || { ...message, body: text };
  const audit = await insertAudit(actor, "editMessage", {
    organization_id: message.organization_id,
    team_id: message.team_id,
    thread_id: message.thread_id,
    message_id: message.id,
  }, {
    textLength: text.length,
    mentionCount: mentionHandles(text).length,
  });
  const [enrichedMessage] = await enrichMessages([updatedMessage], thread);

  return { ok: true, action: "editMessage", thread, message: enrichedMessage || updatedMessage, auditId: audit?.id || "" };
}

async function updateActionItem(actor, body = {}) {
  const actionItemId = normalizeId(body.actionItemId || body.action_item_id || body.id || "");
  if (!isUuid(actionItemId)) {
    return { ok: false, status: 400, reason: "actionItemId is required." };
  }

  let existing = null;
  try {
    existing = await selectOne("chat_action_items", `select=${ACTION_ITEM_SELECT}&id=eq.${filterValue(actionItemId)}`);
  } catch (error) {
    if (isMissingOptionalTableError(error, "chat_action_items")) {
      return actionItemUnavailableResult();
    }
    throw error;
  }

  if (!existing) {
    return { ok: false, status: 404, reason: "Action item not found." };
  }

  const thread = await readThread(existing.thread_id);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const patch = {};
  if (hasOwn(body, "title")) {
    const title = normalizeActionItemTitle(body.title);
    if (!title) {
      return { ok: false, status: 400, reason: "Action item title is required." };
    }
    patch.title = title;
  }
  if (hasOwn(body, "priority")) {
    patch.priority = normalizeActionItemPriority(body.priority);
  }
  if (hasOwn(body, "ownerId") || hasOwn(body, "owner_id")) {
    const ownerId = normalizeId(body.ownerId || body.owner_id || "");
    patch.owner_id = isUuid(ownerId) ? ownerId : null;
  }
  if (hasOwn(body, "dueLabel") || hasOwn(body, "due_label")) {
    patch.due_label = normalizeActionItemDueLabel(body.dueLabel || body.due_label || "");
  }
  if (hasOwn(body, "dueAt") || hasOwn(body, "due_at")) {
    const dueAt = normalizeOptionalIsoDate(body.dueAt || body.due_at || "");
    if ((body.dueAt || body.due_at) && !dueAt) {
      return { ok: false, status: 400, reason: "dueAt must be a valid date." };
    }
    patch.due_at = dueAt;
  }
  if (hasOwn(body, "metadata") && isPlainObject(body.metadata)) {
    patch.metadata = {
      ...(isPlainObject(existing.metadata) ? existing.metadata : {}),
      ...body.metadata,
    };
  }
  if (hasOwn(body, "status")) {
    const status = normalizeActionItemStatus(body.status);
    const now = new Date().toISOString();
    patch.status = status;
    if (status === "done") {
      patch.completed_at = existing.completed_at || now;
      patch.completed_by = isUuid(actor.id) ? actor.id : null;
      patch.archived_at = null;
    } else if (status === "archived") {
      patch.archived_at = existing.archived_at || now;
      patch.completed_at = existing.completed_at || null;
      patch.completed_by = existing.completed_by || null;
    } else {
      patch.completed_at = null;
      patch.completed_by = null;
      patch.archived_at = null;
    }
  }

  if (!Object.keys(patch).length) {
    const actionItems = await readActionItemsForThreads([thread.id]);
    return {
      ok: true,
      action: "updateActionItem",
      thread: { ...thread, actionItems, action_items: actionItems },
      actionItem: actionItemClientPayload(existing),
      actionItems,
      auditId: "",
    };
  }

  try {
    const rows = await patchRows("chat_action_items", `id=eq.${filterValue(existing.id)}`, patch);
    const actionItem = actionItemClientPayload(rows[0] || { ...existing, ...patch });
    const audit = await insertAudit(actor, "updateActionItem", {
      organization_id: existing.organization_id,
      team_id: existing.team_id,
      thread_id: existing.thread_id,
      message_id: existing.message_id,
    }, {
      actionItemId: actionItem.id,
      status: actionItem.status,
      changedFields: Object.keys(patch).sort(),
    });
    const actionItems = await readActionItemsForThreads([thread.id]);
    return {
      ok: true,
      action: "updateActionItem",
      thread: { ...thread, actionItems, action_items: actionItems },
      actionItem,
      actionItems,
      auditId: audit?.id || "",
    };
  } catch (error) {
    if (isMissingOptionalTableError(error, "chat_action_items")) {
      return actionItemUnavailableResult();
    }
    throw error;
  }
}

async function updateMessageFlag(actor, body, action) {
  const messageId = normalizeId(body.messageId || body.message_id || body.id);
  if (!messageId) {
    return { ok: false, status: 400, reason: "messageId is required." };
  }

  const message = await selectOne("chat_messages", `select=${MESSAGE_SELECT}&id=eq.${filterValue(messageId)}`);
  if (!message || message.deleted_at) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = await readThread(message.thread_id);
  const access = await ensureThreadAccess(actor, thread, { manager: true });
  if (!access.ok) {
    return access;
  }

  const patch = action === "setMessagePinned"
    ? {
        pinned_at: normalizeBoolean(body.pinned ?? body.value) ? new Date().toISOString() : null,
        pinned_by: normalizeBoolean(body.pinned ?? body.value) ? actor.id || null : null,
      }
    : {
        priority: normalizePriority(body.priority),
      };

  const rows = await patchRows("chat_messages", `id=eq.${filterValue(message.id)}`, patch);
  const updatedMessage = rows[0] || { ...message, ...patch };
  const audit = await insertAudit(actor, action, {
    organization_id: message.organization_id,
    team_id: message.team_id,
    thread_id: message.thread_id,
    message_id: message.id,
  }, patch);

  return { ok: true, action, thread, message: updatedMessage, auditId: audit?.id || "" };
}

async function deleteMessage(actor, body) {
  const messageId = normalizeId(body.messageId || body.message_id || body.id);
  if (!messageId) {
    return { ok: false, status: 400, reason: "messageId is required." };
  }

  const message = await selectOne("chat_messages", `select=${MESSAGE_SELECT}&id=eq.${filterValue(messageId)}`);
  if (!message || message.deleted_at) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = await readThread(message.thread_id);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  if (message.author_id !== actor.id && actorRole(actor) !== "admin") {
    return { ok: false, status: 403, reason: "Only the author or an admin can delete this message." };
  }

  const deletedAt = new Date().toISOString();
  const rows = await patchRows("chat_messages", `id=eq.${filterValue(message.id)}`, {
    body: "",
    deleted_at: deletedAt,
    deleted_by: actor.id || null,
  });
  const updatedMessage = rows[0] || {
    ...message,
    body: "",
    deleted_at: deletedAt,
    deleted_by: actor.id || null,
  };
  const audit = await insertAudit(actor, "deleteMessage", {
    organization_id: message.organization_id,
    team_id: message.team_id,
    thread_id: message.thread_id,
    message_id: message.id,
  });
  const updatedThread = await recalculateThreadSummary(thread);

  return { ok: true, action: "deleteMessage", thread: updatedThread, message: updatedMessage, auditId: audit?.id || "" };
}

async function setReaction(actor, body, shouldAdd) {
  const messageId = normalizeId(body.messageId || body.message_id || body.id);
  const reaction = normalizeString(body.reaction || body.emoji || body.key || "like", 32);
  if (!messageId) {
    return { ok: false, status: 400, reason: "messageId is required." };
  }

  const message = await selectOne("chat_messages", `select=${MESSAGE_SELECT}&id=eq.${filterValue(messageId)}`);
  if (!message) {
    return { ok: false, status: 404, reason: "Message not found." };
  }

  const thread = await readThread(message.thread_id);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  if (shouldAdd) {
    await insertRows("chat_reactions", {
      message_id: message.id,
      organization_id: message.organization_id,
      team_id: message.team_id,
      user_id: actor.id,
      reaction,
    }).catch(() => null);
  } else {
    await deleteRows(
      "chat_reactions",
      `message_id=eq.${filterValue(message.id)}&user_id=eq.${filterValue(actor.id)}&reaction=eq.${filterValue(reaction)}`
    );
  }

  const action = shouldAdd ? "addReaction" : "removeReaction";
  const audit = await insertAudit(actor, action, {
    organization_id: message.organization_id,
    team_id: message.team_id,
    thread_id: message.thread_id,
    message_id: message.id,
  }, {
    reaction,
  });

  return { ok: true, action, thread, message, auditId: audit?.id || "" };
}

async function markThreadRead(actor, body) {
  const threadId = normalizeId(body.threadId || body.thread_id || body.id);
  const requestedLastReadMessageId = normalizeId(body.lastReadMessageId || body.last_read_message_id);
  const lastReadMessageId = isUuid(requestedLastReadMessageId) ? requestedLastReadMessageId : "";
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }

  const thread = await resolveThreadForAction(actor, body, { createIfMissing: false });
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const lastMessageAtMs = Date.parse(thread.last_message_at || "");
  const lastReadAt = new Date(Math.max(Date.now(), Number.isFinite(lastMessageAtMs) ? lastMessageAtMs : 0)).toISOString();

  const payload = {
    thread_id: thread.id,
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    user_id: actor.id,
    last_read_message_id: lastReadMessageId || thread.last_message_id || null,
    last_read_at: lastReadAt,
  };

  await insertRows("chat_read_receipts", payload).catch(() => patchRows(
    "chat_read_receipts",
    `thread_id=eq.${filterValue(thread.id)}&user_id=eq.${filterValue(actor.id)}`,
    {
      last_read_message_id: payload.last_read_message_id,
      last_read_at: payload.last_read_at,
    }
  ));

  const [threadSummary] = await enrichThreadSummaries(actor, [thread]);
  return { ok: true, action: "markThreadRead", thread: threadSummary || thread };
}

async function setThreadSettings(actor, body) {
  const threadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }

  const thread = await resolveThreadForAction(actor, body, { createIfMissing: false });
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const rawPatch = { ...(isPlainObject(body.settings) ? body.settings : {}) };
  ["muted", "pinned", "customTitle", "avatarLabel", "avatarUrl"].forEach((key) => {
    if (hasOwn(body, key)) {
      rawPatch[key] = body[key];
    }
  });
  const requestedPatch = normalizeThreadSettingPatch(rawPatch);
  const changesSharedThreadIdentity = hasOwn(requestedPatch, "customTitle") || hasOwn(requestedPatch, "avatarLabel") || hasOwn(requestedPatch, "avatarUrl");
  const canManageThread = actorRole(actor) === "admin" || canManageByRole(access.membership?.role);
  if (changesSharedThreadIdentity && !canManageThread) {
    return { ok: false, status: 403, reason: "Chat manager access required." };
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(isPlainObject(thread.metadata) ? thread.metadata : {}),
  };
  const actorKey = normalizeId(actor.id || actor.email || "actor");
  const settingsByUser = {
    ...(isPlainObject(metadata.settingsByUser) ? metadata.settingsByUser : {}),
  };
  const currentActorSettings = isPlainObject(settingsByUser[actorKey]) ? settingsByUser[actorKey] : {};
  settingsByUser[actorKey] = {
    ...currentActorSettings,
    ...(hasOwn(requestedPatch, "muted") ? { muted: requestedPatch.muted } : {}),
    ...(hasOwn(requestedPatch, "pinned") ? { pinned: requestedPatch.pinned } : {}),
    updatedAt: now,
  };
  metadata.settingsByUser = settingsByUser;
  metadata.threadSettingsUpdatedAt = now;

  const update = { metadata };
  if (hasOwn(requestedPatch, "customTitle")) {
    metadata.customTitle = requestedPatch.customTitle;
    if (requestedPatch.customTitle) {
      update.title = requestedPatch.customTitle;
    }
  }
  if (hasOwn(requestedPatch, "avatarLabel")) {
    metadata.avatarLabel = requestedPatch.avatarLabel;
  }
  if (hasOwn(requestedPatch, "avatarUrl")) {
    metadata.avatarUrl = requestedPatch.avatarUrl;
  }

  const [updatedThread] = await patchRows("chat_threads", `id=eq.${filterValue(thread.id)}`, update);
  const audit = await insertAudit(actor, "setThreadSettings", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
  }, {
    settings: requestedPatch,
  });
  const [threadSummary] = await enrichThreadSummaries(actor, [updatedThread || { ...thread, ...update }]);
  return { ok: true, action: "setThreadSettings", thread: threadSummary || updatedThread || thread, auditId: audit?.id || "" };
}

async function setThreadParticipants(actor, body) {
  const threadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }

  const thread = await resolveThreadForAction(actor, body, { createIfMissing: false });
  const access = await ensureThreadAccess(actor, thread, { manager: true });
  if (!access.ok) {
    return access;
  }

  const type = normalizeThreadType(thread.type);
  if (type === "team") {
    return { ok: false, status: 400, reason: "Team chat participants are managed by team membership." };
  }

  const now = new Date().toISOString();
  const currentRows = await selectMany(
    "chat_thread_participants",
    `select=thread_id,user_id,participant_role,joined_at,left_at&thread_id=eq.${filterValue(thread.id)}`
  ).catch(() => []);
  const activeCurrentIds = currentRows.filter((row) => !row.left_at).map((row) => row.user_id).filter(Boolean);
  const currentIds = Array.from(new Set([...activeCurrentIds, ...threadParticipantIds(thread)]));
  const addedIds = getParticipantIdsForThread(actor, { participantIds: body.addParticipantIds || body.addParticipants || [] }, "", type)
    .filter((userId) => userId !== actor.id);
  const removedIds = new Set(
    getParticipantIdsForThread(actor, { participantIds: body.removeParticipantIds || body.removeParticipants || [] }, "", type)
      .filter((userId) => userId !== actor.id)
  );
  const replacing = Array.isArray(body.participantIds) || Array.isArray(body.participants);
  const requestedIds = replacing
    ? getParticipantIdsForThread(actor, body, toLegacyThreadId(thread), type)
    : Array.from(new Set([...currentIds, ...addedIds])).filter((userId) => !removedIds.has(userId));
  const nextIds = Array.from(new Set([actor.id, ...requestedIds].filter((userId) => isUuid(userId)))).slice(0, 80);

  if (nextIds.length < 2) {
    return { ok: false, status: 400, reason: "A private or group chat needs at least two participants." };
  }

  const existingRoleByUserId = currentRows.reduce((map, row) => {
    if (row.user_id) {
      map[row.user_id] = normalizeParticipantRole(row.participant_role);
    }
    return map;
  }, {});
  const requestedRoles = normalizeParticipantRoleMap(body.participantRoles || body.participant_roles || {});
  const nextRoles = nextIds.reduce((roles, userId) => {
    roles[userId] = userId === actor.id ? "owner" : requestedRoles[userId] || existingRoleByUserId[userId] || "member";
    return roles;
  }, {});
  const nextIdSet = new Set(nextIds);
  const removeIds = activeCurrentIds.filter((userId) => !nextIdSet.has(userId));
  const existingIds = new Set(currentRows.map((row) => row.user_id).filter(Boolean));
  const restoreIds = nextIds.filter((userId) => existingIds.has(userId));
  const insertIds = nextIds.filter((userId) => !existingIds.has(userId));

  await Promise.all([
    restoreIds.length
      ? patchRows(
          "chat_thread_participants",
          `thread_id=eq.${filterValue(thread.id)}&user_id=${inFilter(restoreIds)}`,
          {
            participant_role: "member",
            left_at: null,
            metadata: { updatedBy: actor.id, updatedAt: now },
          }
        ).catch(() => [])
      : Promise.resolve([]),
    removeIds.length
      ? patchRows(
          "chat_thread_participants",
          `thread_id=eq.${filterValue(thread.id)}&user_id=${inFilter(removeIds)}`,
          {
            left_at: now,
            metadata: { removedBy: actor.id, removedAt: now },
          }
        ).catch(() => [])
      : Promise.resolve([]),
    insertIds.length
      ? insertRows(
          "chat_thread_participants",
          insertIds.map((userId) => ({
            thread_id: thread.id,
            organization_id: thread.organization_id,
            team_id: thread.team_id,
            user_id: userId,
            participant_role: nextRoles[userId] || "member",
            created_by: isUuid(actor.id) ? actor.id : null,
            metadata: { addedBy: actor.id, addedAt: now },
          }))
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  await Promise.all(
    nextIds.map((userId) =>
      patchRows(
        "chat_thread_participants",
        `thread_id=eq.${filterValue(thread.id)}&user_id=eq.${filterValue(userId)}`,
        { participant_role: nextRoles[userId] || "member" }
      ).catch(() => [])
    )
  );

  const metadata = {
    ...(isPlainObject(thread.metadata) ? thread.metadata : {}),
    participantIds: nextIds,
    participantRoles: nextRoles,
    participantsUpdatedAt: now,
    participantsUpdatedBy: actor.id,
  };
  const [updatedThread] = await patchRows("chat_threads", `id=eq.${filterValue(thread.id)}`, { metadata });
  const audit = await insertAudit(actor, "setThreadParticipants", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
  }, {
    added: nextIds.filter((userId) => !currentIds.includes(userId)),
    removed: removeIds,
    participantCount: nextIds.length,
  });
  const [threadSummary] = await enrichThreadSummaries(actor, [updatedThread || { ...thread, metadata }]);
  return { ok: true, action: "setThreadParticipants", thread: threadSummary || updatedThread || thread, auditId: audit?.id || "" };
}

async function clearThread(actor, body) {
  const threadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }

  const thread = await readThread(threadId);
  const access = await ensureThreadAccess(actor, thread, { manager: true });
  if (!access.ok) {
    return access;
  }

  if (actorRole(actor) !== "admin") {
    return { ok: false, status: 403, reason: "Admin chat access required." };
  }

  await patchRows("chat_messages", `thread_id=eq.${filterValue(thread.id)}&deleted_at=is.null`, {
    body: "",
    deleted_at: new Date().toISOString(),
    deleted_by: actor.id || null,
  });
  await patchRows("chat_threads", `id=eq.${filterValue(thread.id)}`, {
    last_message_id: null,
    last_message_at: null,
    message_count: 0,
  });
  const audit = await insertAudit(actor, "clearThread", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
  });

  return { ok: true, action: "clearThread", thread, auditId: audit?.id || "" };
}

async function archiveThread(actor, body) {
  const threadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }

  const thread = await resolveThreadForAction(actor, body, { createIfMissing: false });
  const access = await ensureThreadAccess(actor, thread, { manager: true });
  if (!access.ok) {
    return access;
  }
  if (thread?.type !== "group") {
    return { ok: false, status: 400, reason: "Only custom group chats can be deleted." };
  }

  const now = new Date().toISOString();
  const scope = await resolveChatScope(actor, {
    organizationId: thread.organization_id,
    teamId: thread.team_id || body.teamId || body.team_id,
  });
  const targetThreads = await readAccessibleLogicalThreads(actor, scope, thread, threadId);
  const archivedThreads = [];
  for (const targetThread of targetThreads) {
    const targetAccess = await ensureThreadAccess(actor, targetThread, { manager: true }).catch(() => ({ ok: false }));
    if (!targetAccess.ok || targetThread?.type !== "group") {
      continue;
    }
    const [updatedThread] = await patchRows("chat_threads", `id=eq.${filterValue(targetThread.id)}`, {
      archived_at: now,
      metadata: {
        ...(isPlainObject(targetThread.metadata) ? targetThread.metadata : {}),
        archivedBy: actor.id || "",
        archivedAt: now,
      },
    });
    archivedThreads.push(updatedThread || { ...targetThread, archived_at: now });
  }
  if (!archivedThreads.length) {
    return { ok: false, status: 403, reason: "Chat manager access required." };
  }
  const audit = await insertAudit(actor, "archiveThread", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
  }, {
    title: thread.title,
    type: thread.type,
    logicalThreadSourceIds: archivedThreads.map((archivedThread) => archivedThread.id).filter(Boolean),
  });

  return { ok: true, action: "archiveThread", thread: archivedThreads[0], auditId: audit?.id || "" };
}

async function setThreadUserState(actor, body) {
  const threadId = normalizeId(body.threadId || body.thread_id || body.id);
  const operation = normalizeThreadUserStateOperation(body.operation || body.state || body.userStateAction || body.user_state_action);
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }
  if (!operation) {
    return { ok: false, status: 400, reason: "Thread user-state operation is required." };
  }

  const thread = await resolveThreadForAction(actor, body, { createIfMissing: false });
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const type = normalizeThreadType(thread.type);
  if ((operation === "block" || operation === "unblock") && type !== "dm") {
    return { ok: false, status: 400, reason: "Only direct chats can be blocked." };
  }

  const now = new Date().toISOString();
  const scope = await resolveChatScope(actor, {
    organizationId: thread.organization_id,
    teamId: thread.team_id || body.teamId || body.team_id,
  });
  const targetThreads = await readAccessibleLogicalThreads(actor, scope, thread, threadId);
  const targetThreadIds = [];
  const participants = [];
  for (const targetThread of targetThreads) {
    const participant = await ensureActorThreadParticipant(actor, targetThread);
    if (participant) {
      participants.push({ thread: targetThread, participant });
      targetThreadIds.push(targetThread.id);
    }
  }
  if (!participants.length) {
    return { ok: false, status: 403, reason: "You do not have access to this chat thread." };
  }

  let blockedUserId = normalizeId(body.blockedUserId || body.blocked_user_id || "");
  if (operation === "block" && !blockedUserId) {
    const rows = await readThreadParticipantRows(targetThreadIds.length ? targetThreadIds : [thread.id]);
    blockedUserId = normalizeId(rows.find((row) => row.user_id && row.user_id !== actor.id)?.user_id || "");
  }

  for (const { thread: targetThread, participant } of participants) {
    const metadata = stripEmptyThreadUserState(participant.metadata);
    if (operation === "archive") {
      metadata.archivedAt = now;
    } else if (operation === "unarchive") {
      delete metadata.archivedAt;
    } else if (operation === "hide") {
      metadata.hiddenAt = now;
    } else if (operation === "delete") {
      metadata.deletedForUserAt = now;
      delete metadata.archivedAt;
      delete metadata.hiddenAt;
    } else if (operation === "block") {
      metadata.blockedAt = now;
      metadata.blockedUserId = blockedUserId;
    } else if (operation === "unblock") {
      delete metadata.blockedAt;
      delete metadata.blockedUserId;
    } else if (operation === "restore") {
      delete metadata.archivedAt;
      delete metadata.hiddenAt;
      delete metadata.deletedForUserAt;
      delete metadata.blockedAt;
      delete metadata.blockedUserId;
    }
    metadata.userStateUpdatedAt = now;
    metadata.userStateUpdatedBy = actor.id || "";

    await patchRows(
      "chat_thread_participants",
      `thread_id=eq.${filterValue(targetThread.id)}&user_id=eq.${filterValue(actor.id)}`,
      { metadata }
    );
  }

  const audit = await insertAudit(actor, "setThreadUserState", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
  }, {
    operation,
    blockedUserId: operation === "block" ? blockedUserId : "",
    logicalThreadSourceIds: targetThreadIds,
  });
  const [threadSummary] = combineLogicalThreadSummaries(await enrichThreadSummaries(actor, targetThreads));
  return { ok: true, action: "setThreadUserState", thread: threadSummary || thread, auditId: audit?.id || "" };
}

async function leaveThread(actor, body) {
  const threadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }

  const thread = await resolveThreadForAction(actor, body, { createIfMissing: false });
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }
  if (normalizeThreadType(thread.type) !== "group") {
    return { ok: false, status: 400, reason: "Only custom groups can be left." };
  }

  const now = new Date().toISOString();
  const participant = await readActorThreadParticipant(actor, thread.id);
  if (!participant) {
    return { ok: false, status: 404, reason: "You are not an active participant in this group." };
  }
  const participantRows = await selectMany(
    "chat_thread_participants",
    `select=thread_id,user_id,participant_role,joined_at,left_at,metadata&thread_id=eq.${filterValue(thread.id)}`
  ).catch(() => []);
  const activeRows = participantRows.filter((row) => !row.left_at);
  const otherActiveRows = activeRows.filter((row) => row.user_id !== actor.id);
  if (!otherActiveRows.length) {
    return { ok: false, status: 400, reason: "A group needs another participant before you can leave." };
  }

  const metadata = {
    ...(isPlainObject(participant.metadata) ? participant.metadata : {}),
    leftBy: actor.id || "",
    leftAt: now,
    hiddenAt: now,
    userStateUpdatedAt: now,
    userStateUpdatedBy: actor.id || "",
  };
  await patchRows(
    "chat_thread_participants",
    `thread_id=eq.${filterValue(thread.id)}&user_id=eq.${filterValue(actor.id)}`,
    {
      left_at: now,
      metadata,
    }
  );

  if (normalizeParticipantRole(participant.participant_role) === "owner") {
    const nextOwner = otherActiveRows.find((row) => normalizeParticipantRole(row.participant_role) === "member") || otherActiveRows[0];
    if (nextOwner?.user_id) {
      await patchRows(
        "chat_thread_participants",
        `thread_id=eq.${filterValue(thread.id)}&user_id=eq.${filterValue(nextOwner.user_id)}`,
        {
          participant_role: "owner",
          metadata: {
            ...(isPlainObject(nextOwner.metadata) ? nextOwner.metadata : {}),
            promotedBy: actor.id || "",
            promotedAt: now,
          },
        }
      ).catch(() => []);
    }
  }

  const nextParticipantIds = otherActiveRows.map((row) => row.user_id).filter(Boolean);
  const metadataPatch = {
    ...(isPlainObject(thread.metadata) ? thread.metadata : {}),
    participantIds: nextParticipantIds,
    participantsUpdatedAt: now,
    participantsUpdatedBy: actor.id || "",
  };
  const [updatedThread] = await patchRows("chat_threads", `id=eq.${filterValue(thread.id)}`, { metadata: metadataPatch });
  const audit = await insertAudit(actor, "leaveThread", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
  }, {
    remainingParticipantCount: nextParticipantIds.length,
  });

  return { ok: true, action: "leaveThread", thread: updatedThread || { ...thread, metadata: metadataPatch }, auditId: audit?.id || "" };
}

async function deleteMessageForMe(actor, body) {
  const messageId = normalizeId(body.messageId || body.message_id || body.id);
  if (!messageId) {
    return { ok: false, status: 400, reason: "messageId is required." };
  }

  const message = await selectOne("chat_messages", `select=${MESSAGE_SELECT}&id=eq.${filterValue(messageId)}`);
  if (!message || message.deleted_at) {
    return { ok: false, status: 404, reason: "Message not found." };
  }
  const thread = await readThread(message.thread_id);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const now = new Date().toISOString();
  const payload = {
    message_id: message.id,
    organization_id: message.organization_id,
    team_id: message.team_id,
    thread_id: message.thread_id,
    user_id: actor.id,
    hidden_at: now,
    hidden_by: actor.id || null,
    metadata: {
      reason: "delete-for-me",
      updatedBy: actor.id || "",
      updatedAt: now,
    },
  };
  await insertRows("chat_message_user_states", payload).catch(() => patchRows(
    "chat_message_user_states",
    `message_id=eq.${filterValue(message.id)}&user_id=eq.${filterValue(actor.id)}`,
    {
      hidden_at: now,
      hidden_by: actor.id || null,
      metadata: payload.metadata,
    }
  ));
  const audit = await insertAudit(actor, "deleteMessageForMe", {
    organization_id: message.organization_id,
    team_id: message.team_id,
    thread_id: message.thread_id,
    message_id: message.id,
  });

  return { ok: true, action: "deleteMessageForMe", thread, message: { ...message, status: "deleted-for-me" }, auditId: audit?.id || "" };
}

async function forwardMessage(actor, body) {
  const messageId = normalizeId(body.messageId || body.message_id || body.id);
  const targetThreadId = normalizeId(body.targetThreadId || body.target_thread_id || body.threadId || body.thread_id);
  if (!messageId) {
    return { ok: false, status: 400, reason: "messageId is required." };
  }
  if (!targetThreadId) {
    return { ok: false, status: 400, reason: "targetThreadId is required." };
  }

  const sourceMessage = await selectOne("chat_messages", `select=${MESSAGE_SELECT}&id=eq.${filterValue(messageId)}`);
  if (!sourceMessage || sourceMessage.deleted_at) {
    return { ok: false, status: 404, reason: "Message not found." };
  }
  const sourceThread = await readThread(sourceMessage.thread_id);
  const sourceAccess = await ensureThreadAccess(actor, sourceThread);
  if (!sourceAccess.ok) {
    return sourceAccess;
  }

  const targetThread = await resolveThreadForAction(actor, {
    ...body,
    threadId: targetThreadId,
    type: body.targetThreadType || body.threadType,
  }, { createIfMissing: false });
  const targetAccess = await ensureThreadAccess(actor, targetThread);
  if (!targetAccess.ok) {
    return targetAccess;
  }

  const hidden = await readHiddenMessageStateRows(actor, [sourceMessage.id]);
  if (hidden.length) {
    return { ok: false, status: 404, reason: "Message not found." };
  }
  const text = normalizeMessageText(body.text || sourceMessage.body);
  if (!text) {
    return { ok: false, status: 400, reason: "Forwarded message text is empty." };
  }

  const rows = await insertRows("chat_messages", {
    organization_id: targetThread.organization_id,
    team_id: targetThread.team_id,
    thread_id: targetThread.id,
    author_id: actor.id || null,
    body: text,
    priority: "normal",
    metadata: {
      authorName: normalizeString(`${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email),
      authorRole: actorRole(actor),
      forwardedFromMessageId: sourceMessage.id,
      forwardedFromThreadId: sourceThread?.id || "",
      forwardedBy: actor.id || "",
      forwardedAt: new Date().toISOString(),
      originalAuthorId: sourceMessage.author_id || "",
      originalAuthorName: normalizeString(sourceMessage.metadata?.authorName || "", 120),
    },
  });
  const message = rows[0];
  const updatedThread = await recalculateThreadSummary({
    ...targetThread,
    last_message_id: message.id,
    last_message_at: message.created_at,
  });
  const audit = await insertAudit(actor, "forwardMessage", {
    organization_id: targetThread.organization_id,
    team_id: targetThread.team_id,
    thread_id: targetThread.id,
    message_id: message.id,
  }, {
    sourceThreadId: sourceThread?.id || "",
    sourceMessageId: sourceMessage.id,
  });
  const [enrichedMessage] = await enrichMessages([message], targetThread);
  const [threadSummary] = await enrichThreadSummaries(actor, [updatedThread || targetThread]);
  return { ok: true, action: "forwardMessage", thread: threadSummary || updatedThread || targetThread, message: enrichedMessage || message, auditId: audit?.id || "" };
}

async function createAttachmentIntent(actor, body) {
  const thread = await resolveThreadForAction(actor, body);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const fileName = normalizeFileName(body.fileName || body.name);
  const mimeType = normalizeString(body.mimeType || body.type || "application/octet-stream", MAX_MIME_LENGTH);
  const rawByteSize = Number(body.byteSize || body.size) || 0;
  const byteSize = Math.max(0, rawByteSize);
  if (!byteSize) {
    return { ok: false, status: 400, reason: "Attachment byteSize is required." };
  }
  if (byteSize > MAX_ATTACHMENT_BYTES) {
    return { ok: false, status: 413, reason: "Attachment is too large. Maximum file size is 50 MB." };
  }
  if (!isAllowedAttachmentMimeType(mimeType)) {
    return { ok: false, status: 415, reason: "Attachment file type is not allowed." };
  }

  const bucket = chatDefaultBucket();
  const extension = safeFileExtension(fileName);
  const fileSlug = normalizeSlug(fileName.replace(/\.[^.]+$/, ""), "attachment");
  const storagePath = [
    thread.organization_id,
    thread.team_id || "direct",
    thread.id,
    actor.id || "staff",
    `${Date.now()}-${fileSlug}${extension ? `.${extension}` : ""}`,
  ].join("/");
  const rows = await insertRows("chat_attachments", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
    message_id: isUuid(body.messageId) ? body.messageId : null,
    uploaded_by: isUuid(actor.id) ? actor.id : null,
    storage_bucket: bucket,
    storage_path: storagePath,
    mime_type: mimeType,
    byte_size: byteSize,
    status: "pending",
    metadata: {
      fileName,
      source: "api.chat.database.intent",
    },
  });
  const attachment = rows[0] ? attachmentClientPayload(rows[0]) : null;
  const audit = await insertAudit(actor, "createAttachmentIntent", {
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    thread_id: thread.id,
  }, {
    fileName,
    mimeType,
    byteSize,
  });

  const signedUpload = attachment
    ? await createSignedAttachmentUpload(attachment.storage_bucket, attachment.storage_path)
    : null;

  return {
    ok: true,
    action: "createAttachmentIntent",
    thread,
    attachment,
    upload: attachment
      ? {
          bucket: attachment.storage_bucket,
          path: attachment.storage_path,
          signedUrl: signedUpload?.signedUrl || "",
          token: signedUpload?.token || "",
          expiresIn: signedUpload?.expiresIn || 0,
          maxBytes: MAX_ATTACHMENT_BYTES,
          allowedMimeTypes: allowedAttachmentMimeTypes(),
        }
      : null,
    auditId: audit?.id || "",
  };
}

async function uploadAttachmentObject(actor, body, file) {
  const attachmentId = normalizeId(body.attachmentId || body.attachment_id || body.id);
  if (!isUuid(attachmentId)) {
    return { ok: false, status: 400, reason: "attachmentId is required." };
  }
  if (!file?.buffer?.length) {
    return { ok: false, status: 400, reason: "Attachment file is required." };
  }
  if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
    return { ok: false, status: 413, reason: "Attachment is too large. Maximum file size is 50 MB." };
  }
  const attachment = await selectOne(
    "chat_attachments",
    `select=*&id=eq.${filterValue(attachmentId)}&uploaded_by=eq.${filterValue(actor.id)}`
  );
  if (!attachment) {
    return { ok: false, status: 404, reason: "Attachment was not found." };
  }
  const thread = await readThread(attachment.thread_id);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }
  const mimeType = normalizeString(file.mimeType || attachment.mime_type || "application/octet-stream", MAX_MIME_LENGTH);
  if (!isAllowedAttachmentMimeType(mimeType)) {
    return { ok: false, status: 415, reason: "Attachment file type is not allowed." };
  }
  const uploaded = await uploadStorageObject(attachment.storage_bucket, attachment.storage_path, file.buffer, mimeType);
  if (!uploaded.ok) {
    return uploaded;
  }
  const metadata = attachment.metadata && typeof attachment.metadata === "object" ? attachment.metadata : {};
  const rows = await patchRows("chat_attachments", `id=eq.${filterValue(attachment.id)}`, {
    metadata: {
      ...metadata,
      fileName: metadata.fileName || file.fileName || "Attachment",
      uploadReady: true,
      uploadedAt: new Date().toISOString(),
    },
  }).catch(() => [attachment]);
  return {
    ok: true,
    action: "uploadAttachmentObject",
    thread,
    attachment: attachmentClientPayload(rows[0] || attachment),
  };
}

async function handleDatabasePost(req, res, actor) {
  const multipart = String(req.headers?.["content-type"] || req.headers?.["Content-Type"] || "").toLowerCase().includes("multipart/form-data")
    ? await parseMultipartRequest(req)
    : null;
  const body = multipart?.fields || await parseJsonBody(req);
  const action = normalizeString(body?.action, 48);
  const rateLimit = checkRateLimit(actor, action);
  if (!rateLimit.ok) {
    return sendJson(res, rateLimit.status || 429, rateLimit);
  }

  let result;
  if (action === "createThread") {
    result = await createThread(actor, body);
  } else if (action === "sendMessage") {
    result = await sendMessage(actor, body);
  } else if (action === "createActionItem") {
    result = await createActionItem(actor, body);
  } else if (action === "editMessage") {
    result = await editMessage(actor, body);
  } else if (action === "updateActionItem") {
    result = await updateActionItem(actor, body);
  } else if (action === "setMessagePinned" || action === "setMessagePriority") {
    result = await updateMessageFlag(actor, body, action);
  } else if (action === "deleteMessage") {
    result = await deleteMessage(actor, body);
  } else if (action === "deleteMessageForMe") {
    result = await deleteMessageForMe(actor, body);
  } else if (action === "forwardMessage") {
    result = await forwardMessage(actor, body);
  } else if (action === "addReaction") {
    result = await setReaction(actor, body, true);
  } else if (action === "removeReaction") {
    result = await setReaction(actor, body, false);
  } else if (action === "markThreadRead") {
    result = await markThreadRead(actor, body);
  } else if (action === "setThreadSettings") {
    result = await setThreadSettings(actor, body);
  } else if (action === "setThreadUserState") {
    result = await setThreadUserState(actor, body);
  } else if (action === "leaveThread") {
    result = await leaveThread(actor, body);
  } else if (action === "setThreadParticipants") {
    result = await setThreadParticipants(actor, body);
  } else if (action === "clearThread") {
    result = await clearThread(actor, body);
  } else if (action === "archiveThread") {
    result = await archiveThread(actor, body);
  } else if (action === "createAttachmentIntent") {
    result = await createAttachmentIntent(actor, body);
  } else if (action === "uploadAttachmentObject") {
    result = await uploadAttachmentObject(actor, body, multipart?.files?.file || multipart?.files?.attachment);
  } else {
    result = { ok: false, status: 400, reason: "Unsupported chat action." };
  }

  return sendJson(res, result.ok ? 200 : result.status || 400, {
    ...result,
    schema: "footballscience-chat-database-v1",
    mode: "database",
  });
}

async function handleDatabaseChatRequest(req, res, actor) {
  if (!canUseChat(actor)) {
    return sendJson(res, 403, { ok: false, reason: "Chat access requires a staff role." });
  }

  if (req.method === "GET") {
    if (!hasActiveChatReadIntent(req)) {
      return sendChatReadPaused(res);
    }
    const rateLimit = checkRateLimit(actor, getDatabaseChatReadAction(req));
    if (!rateLimit.ok) {
      return sendChatReadRateLimited(res, rateLimit);
    }
    return handleDatabaseGet(req, res, actor);
  }

  if (req.method === "POST") {
    return handleDatabasePost(req, res, actor);
  }

  return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
}

module.exports = {
  handleDatabaseChatRequest,
  isDatabaseChatEnabled,
  _private: {
    canUseChat,
    checkRateLimit,
    getDatabaseChatReadAction,
    hasActiveChatReadIntent,
    isUuid,
    messageMentionedUserIds,
    normalizeActionItemPriority,
    normalizeActionItemStatus,
    normalizeMessageText,
    normalizeMentionedUserIds,
    normalizePriority,
    normalizeThreadType,
    buildMessageDeliveryState,
    threadRequiresParticipantAccess,
    toLegacyThreadId,
  },
};
