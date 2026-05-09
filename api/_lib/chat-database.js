const { parseJsonBody, readConfig, sendJson } = require("./supabase-admin.js");

const CHAT_DATABASE_MODE_VALUES = new Set(["database", "db", "postgres", "supabase"]);
const CHAT_LEGACY_MODE_VALUES = new Set(["legacy", "storage", "app-state", "appstate", "local", "off", "false", "0"]);
const STAFF_ROLES = new Set(["admin", "coach", "analyst", "performance", "medical"]);
const MANAGER_ROLES = new Set(["admin", "coach"]);
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
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const DEFAULT_ATTACHMENT_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf", "txt", "csv", "docx", "xlsx", "pptx"]);
const PAGE_SIZE_DEFAULT = 40;
const PAGE_SIZE_MAX = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = {
  createThread: 8,
  sendMessage: 24,
  editMessage: 24,
  deleteMessage: 20,
  setMessagePinned: 30,
  setMessagePriority: 30,
  addReaction: 80,
  removeReaction: 80,
  markThreadRead: 120,
  clearThread: 5,
  createAttachmentIntent: 20,
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
    return false;
  }
  if (CHAT_DATABASE_MODE_VALUES.has(mode)) {
    return true;
  }
  return true;
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

function normalizePriority(value) {
  const priority = normalizeString(value, 24).toLowerCase();
  return ["low", "normal", "medium", "high", "urgent", "critical"].includes(priority) ? priority : "normal";
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
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
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 * 60 * 2 }),
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
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function filterValue(value) {
  return encodeURIComponent(String(value || ""));
}

function jsonValue(value) {
  return JSON.stringify(value);
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

  const response = await fetch(`${base.url}${path}`, {
    method: options.method || "GET",
    headers: restHeaders(base.serviceRoleKey, options.headers || {}),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
      reason: payload?.message || payload?.hint || payload?.details || `Database request failed (${response.status}).`,
    };
  }

  return { ok: true, status: response.status, payload };
}

async function selectOne(table, query) {
  const result = await dbRequest(`/${table}?${query}&limit=1`);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  return Array.isArray(result.payload) ? result.payload[0] || null : null;
}

async function selectMany(table, query) {
  const result = await dbRequest(`/${table}?${query}`);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  return Array.isArray(result.payload) ? result.payload : [];
}

async function insertRows(table, rows) {
  const result = await dbRequest(`/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: Array.isArray(rows) ? rows : [rows],
  });
  if (!result.ok) {
    throw new Error(result.reason);
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
    throw new Error(result.reason);
  }

  return Array.isArray(result.payload) ? result.payload : [];
}

async function deleteRows(table, query) {
  const result = await dbRequest(`/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!result.ok) {
    throw new Error(result.reason);
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
      "role=in.(admin,coach,analyst,performance,medical)",
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
  if (!scope?.organizationId || !legacyKey) {
    return null;
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
  return threads.find((thread) => thread?.metadata?.legacyThreadId === legacyKey) || null;
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
      ...(Array.isArray(body.participants) ? body.participants : []),
    ].filter((userId) => isUuid(userId)))
  ).slice(0, 80);
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
  const visibility = normalizeString(
    body.visibility ||
      (type === "dm" ? "private" : type === "medical" ? "medical" : type === "announcement" ? "staff" : "members"),
    40
  );
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

async function resolveThreadForAction(actor, body = {}) {
  const requestedThreadId = normalizeId(body.threadId || body.thread_id || body.id);
  if (isUuid(requestedThreadId)) {
    return readThread(requestedThreadId);
  }

  const scope = await resolveChatScope(actor, body);
  if (!scope) {
    return null;
  }

  return ensureScopedThread(actor, body, scope);
}

async function isThreadParticipant(actor, threadId) {
  if (!actor?.id || !threadId) {
    return false;
  }

  const participant = await selectOne(
    "chat_thread_participants",
    `select=thread_id,user_id,participant_role,left_at&thread_id=eq.${filterValue(threadId)}&user_id=eq.${filterValue(actor.id)}&left_at=is.null`
  );

  return Boolean(participant);
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

  if (["team", "group", "medical", "matchday", "training", "announcement"].includes(type) && membership) {
    if (type === "medical" && !["admin", "coach", "medical", "performance"].includes(String(membership.role || "").toLowerCase())) {
      return { ok: false, status: 403, reason: "Medical chat access required." };
    }
    if (options.manager && !canManageByRole(membership.role) && actorRole(actor) !== "admin") {
      return { ok: false, status: 403, reason: "Chat manager access required." };
    }
    return { ok: true, membership };
  }

  const participant = await isThreadParticipant(actor, thread.id);
  if (participant) {
    if (options.manager && actorRole(actor) !== "admin") {
      return { ok: false, status: 403, reason: "Chat manager access required." };
    }
    return { ok: true, membership };
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
  const destructive = ["deleteMessage", "clearThread"].includes(action);
  const adminAction = ["setMessagePinned", "setMessagePriority", "clearThread"].includes(action);
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

function threadPermissionsForActor(actor, thread = {}) {
  const role = actorRole(actor);
  const manager = canAdmin(actor) || MANAGER_ROLES.has(role);
  const type = normalizeThreadType(thread.type);
  return {
    canSend: type !== "announcement" || manager,
    canAttach: true,
    canReact: true,
    canReadReceipts: true,
    canPin: manager,
    canClear: canAdmin(actor),
    canModerate: canAdmin(actor),
  };
}

async function enrichMessages(messages = [], thread = null) {
  const messageIds = messages.map((message) => message.id).filter(Boolean);
  if (!messageIds.length) {
    return [];
  }

  const reactionRows = await selectMany(
    "chat_reactions",
    `select=${REACTION_SELECT}&message_id=${inFilter(messageIds)}`
  ).catch(() => []);
  const attachmentRows = await selectMany(
    "chat_attachments",
    `select=${ATTACHMENT_SELECT}&message_id=${inFilter(messageIds)}&status=in.(pending,ready)`
  ).catch(() => []);
  const receiptRows = thread?.id
    ? await selectMany(
        "chat_read_receipts",
        `select=${RECEIPT_SELECT}&thread_id=eq.${filterValue(thread.id)}`
      ).catch(() => [])
    : [];
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

  return messages.map((message) => {
    const readBy = receiptRows
      .filter((receipt) => {
        if (!receipt.user_id) {
          return false;
        }
        if (receipt.last_read_message_id === message.id) {
          return true;
        }
        return Date.parse(receipt.last_read_at || "") >= Date.parse(message.created_at || "");
      })
      .map((receipt) => receipt.user_id);

    return {
      ...message,
      legacyThreadId: thread ? toLegacyThreadId(thread) : "",
      text: message.body,
      userId: message.author_id,
      threadId: thread ? toLegacyThreadId(thread) : message.thread_id,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
      replyToId: message.reply_to_id || "",
      pinnedAt: message.pinned_at || "",
      pinnedBy: message.pinned_by || "",
      author: {
        id: message.author_id || "",
        firstName: normalizeString(message.metadata?.authorName || "Staff", 80).split(" ")[0] || "Staff",
        lastName: normalizeString(message.metadata?.authorName || "", 80).split(" ").slice(1).join(" "),
        role: normalizeString(message.metadata?.authorRole || "coach", 40),
      },
      reactions: reactionsByMessage.get(message.id) || {},
      readBy: Array.from(new Set([message.author_id, ...readBy].filter(Boolean))),
      attachments: (attachmentsByMessage.get(message.id) || []).map(attachmentClientPayload),
      status: message.deleted_at ? "deleted" : "sent",
    };
  });
}

async function enrichThreadSummaries(actor, threads = []) {
  if (!Array.isArray(threads) || !threads.length) {
    return [];
  }
  const threadIds = threads.map((thread) => thread.id).filter(Boolean);
  const lastMessageIds = threads.map((thread) => thread.last_message_id).filter(Boolean);
  const [lastMessages, receipts] = await Promise.all([
    lastMessageIds.length
      ? selectMany("chat_messages", `select=${MESSAGE_SELECT}&id=${inFilter(lastMessageIds)}&deleted_at=is.null`).catch(() => [])
      : Promise.resolve([]),
    actor?.id && threadIds.length
      ? selectMany(
          "chat_read_receipts",
          `select=${RECEIPT_SELECT}&thread_id=${inFilter(threadIds)}&user_id=eq.${filterValue(actor.id)}`
        ).catch(() => [])
      : Promise.resolve([]),
  ]);
  const messagesById = new Map(lastMessages.map((message) => [message.id, message]));
  const receiptsByThreadId = new Map(receipts.map((receipt) => [receipt.thread_id, receipt]));
  return Promise.all(
    threads.map(async (thread) => {
      const lastMessage = messagesById.get(thread.last_message_id) || null;
      const [enrichedLastMessage] = lastMessage ? await enrichMessages([lastMessage], thread) : [];
      const receipt = receiptsByThreadId.get(thread.id) || null;
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
        participants: threadParticipantIds(thread),
        permissions: threadPermissionsForActor(actor, thread),
        avatarUrl: normalizeString(thread.metadata?.avatarUrl || thread.metadata?.imageUrl || "", 800),
        lastMessage: enrichedLastMessage || null,
        lastMessagePreview: enrichedLastMessage ? messagePreviewText(enrichedLastMessage) : "",
        unreadCount,
        lastReadAt: receipt?.last_read_at || "",
      };
    })
  );
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

async function handleDatabaseGet(req, res, actor) {
  const query = new URL(req.url, "http://localhost").searchParams;
  const view = normalizeString(query.get("view"), 40).toLowerCase();
  const search = normalizeString(query.get("search"), 120);
  const organizationId = normalizeId(query.get("organizationId"));
  const teamId = normalizeId(query.get("teamId"));
  const threadId = normalizeId(query.get("threadId"));
  const cursor = normalizeString(query.get("cursor"), 80);
  const limit = Math.max(1, Math.min(PAGE_SIZE_MAX, Number(query.get("limit")) || PAGE_SIZE_DEFAULT));

  const scope = await resolveChatScope(actor, { organizationId, teamId });
  if (!scope) {
    return sendJson(res, 403, { ok: false, reason: "You do not have access to this chat organization or team." });
  }

  if (view === "moderation" || view === "admin") {
    if (!canAdmin(actor)) {
      return sendJson(res, 403, { ok: false, reason: "Admin chat access required." });
    }

    const audits = await selectMany(
      "chat_audit_events",
      [
        `select=${AUDIT_SELECT}`,
        `organization_id=eq.${filterValue(scope.organizationId)}`,
        "order=created_at.desc",
        `limit=${limit}`,
      ].join("&")
    );
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
            "limit=200",
          ].join("&")
        ).catch(() => [])
      : [];
    const participantThreadIds = new Set(participantRows.map((row) => row.thread_id).filter(Boolean));
    const filters = [
      `select=${MESSAGE_SELECT}`,
      `organization_id=eq.${filterValue(scope.organizationId)}`,
      "deleted_at=is.null",
      `body=ilike.*${filterValue(search)}*`,
      "order=created_at.desc",
      `limit=${limit}`,
    ];
    const messages = await selectMany("chat_messages", filters.join("&"));
    const threads = messages.length
      ? await selectMany("chat_threads", `select=${THREAD_SELECT}&id=${inFilter(Array.from(new Set(messages.map((message) => message.thread_id))))}`)
      : [];
    const threadsById = new Map(
      threads
        .filter((thread) => thread.team_id === scope.teamId || (thread.type === "dm" && participantThreadIds.has(thread.id)))
        .map((thread) => [thread.id, thread])
    );
    const enriched = [];
    for (const message of messages.reverse()) {
      const thread = threadsById.get(message.thread_id) || null;
      if (!thread) {
        continue;
      }
      const [mapped] = await enrichMessages([message], thread);
      if (mapped) {
        enriched.push(mapped);
      }
    }
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
    const thread = await resolveThreadForAction(actor, {
      organizationId: scope.organizationId,
      teamId: scope.teamId,
      threadId: threadId || "team",
      type: query.get("threadType") || (String(threadId || "").startsWith("dm:") ? "dm" : "team"),
    });
    const access = await ensureThreadAccess(actor, thread);
    if (!access.ok) {
      return sendJson(res, access.status || 403, access);
    }

    const filters = [
      `select=${MESSAGE_SELECT}`,
      `thread_id=eq.${filterValue(thread.id)}`,
      "deleted_at=is.null",
      "order=created_at.desc",
      `limit=${limit}`,
    ];

    if (cursor) {
      filters.push(`created_at=lt.${filterValue(cursor)}`);
    }

    const messages = await selectMany("chat_messages", filters.join("&"));
    const nextCursor = messages.length === limit ? messages[messages.length - 1]?.created_at || "" : "";
    const enrichedMessages = await enrichMessages([...messages].reverse(), thread);
    const [threadSummary] = await enrichThreadSummaries(actor, [thread]);
    const responseThread = threadSummary || thread;
    return sendJson(res, 200, {
      ok: true,
      schema: "footballscience-chat-database-v1",
      mode: "database",
      scope,
      thread: responseThread,
      threads: [responseThread],
      messages: enrichedMessages,
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
  const threads = Array.from(threadsById.values()).sort((first, second) => {
    const firstTime = Date.parse(first.last_message_at || "") || 0;
    const secondTime = Date.parse(second.last_message_at || "") || 0;
    if (firstTime !== secondTime) {
      return secondTime - firstTime;
    }
    return String(first.title || "").localeCompare(String(second.title || ""), undefined, { sensitivity: "base" });
  });
  const threadSummaries = await enrichThreadSummaries(actor, threads);
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

  const thread = await ensureScopedThread(actor, { ...body, type }, scope);
  if (!thread?.id) {
    return { ok: false, status: 500, reason: "Chat thread could not be created." };
  }

  return { ok: true, action: "createThread", scope, thread, auditId: "" };
}

async function sendMessage(actor, body) {
  const text = normalizeMessageText(body.text || body.message || body.body);
  const clientMessageId = normalizeString(body.clientMessageId || body.client_message_id || body.id, 120);

  if (!text) {
    return { ok: false, status: 400, reason: "Message text is required." };
  }

  const thread = await resolveThreadForAction(actor, body);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  if (thread?.metadata?.announcementOnly && !canManageByRole(access.membership?.role) && !canAdmin(actor)) {
    return { ok: false, status: 403, reason: "Only chat managers can post announcements." };
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
      reply_to_id: normalizeId(body.replyToId || body.reply_to_id) || null,
      client_message_id: clientMessageId || null,
      metadata: {
        authorName: normalizeString(`${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email),
        authorRole: actorRole(actor),
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
  const mentions = mentionHandles(text);
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map((value) => normalizeId(value)).filter(isUuid).slice(0, 10)
    : [];

  if (mentions.length) {
    await insertRows(
      "chat_message_mentions",
      mentions.map((handle) => ({
        message_id: message.id,
        organization_id: thread.organization_id,
        team_id: thread.team_id,
        handle,
      }))
    );
  }

  if (attachmentIds.length) {
    await patchRows(
      "chat_attachments",
      `id=${inFilter(attachmentIds)}&uploaded_by=eq.${filterValue(actor.id)}`,
      {
        thread_id: thread.id,
        message_id: message.id,
        status: "ready",
      }
    ).catch(() => null);
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
    mentionCount: mentions.length,
    priority: message.priority,
    attachmentCount: attachmentIds.length,
  });
  const [enrichedMessage] = await enrichMessages([message], thread);

  return { ok: true, action: "sendMessage", thread: updatedThread, message: enrichedMessage || message, auditId: audit?.id || "" };
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
  const lastReadMessageId = normalizeId(body.lastReadMessageId || body.last_read_message_id);
  if (!threadId) {
    return { ok: false, status: 400, reason: "threadId is required." };
  }

  const thread = await readThread(threadId);
  const access = await ensureThreadAccess(actor, thread);
  if (!access.ok) {
    return access;
  }

  const payload = {
    thread_id: thread.id,
    organization_id: thread.organization_id,
    team_id: thread.team_id,
    user_id: actor.id,
    last_read_message_id: lastReadMessageId || thread.last_message_id || null,
    last_read_at: new Date().toISOString(),
  };

  await insertRows("chat_read_receipts", payload).catch(() => patchRows(
    "chat_read_receipts",
    `thread_id=eq.${filterValue(thread.id)}&user_id=eq.${filterValue(actor.id)}`,
    {
      last_read_message_id: payload.last_read_message_id,
      last_read_at: payload.last_read_at,
    }
  ));

  return { ok: true, action: "markThreadRead", thread };
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

async function handleDatabasePost(req, res, actor) {
  const body = await parseJsonBody(req);
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
  } else if (action === "editMessage") {
    result = await editMessage(actor, body);
  } else if (action === "setMessagePinned" || action === "setMessagePriority") {
    result = await updateMessageFlag(actor, body, action);
  } else if (action === "deleteMessage") {
    result = await deleteMessage(actor, body);
  } else if (action === "addReaction") {
    result = await setReaction(actor, body, true);
  } else if (action === "removeReaction") {
    result = await setReaction(actor, body, false);
  } else if (action === "markThreadRead") {
    result = await markThreadRead(actor, body);
  } else if (action === "clearThread") {
    result = await clearThread(actor, body);
  } else if (action === "createAttachmentIntent") {
    result = await createAttachmentIntent(actor, body);
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
    isUuid,
    normalizeMessageText,
    normalizePriority,
    normalizeThreadType,
    toLegacyThreadId,
  },
};
