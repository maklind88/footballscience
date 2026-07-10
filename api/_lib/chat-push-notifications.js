const crypto = require("crypto");
const webPush = require("web-push");
const {
  filterValue,
  inFilter,
  insertRows,
  isPlainObject,
  isUuid,
  normalizeBoolean,
  normalizeId,
  normalizeString,
  patchRows,
  selectMany,
  upsertRows,
} = require("./chat-push-database.js");

const STAFF_ROLES = new Set(["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"]);
const PUSH_SEND_TIMEOUT_MS = 4500;
const PUSH_TTL_SECONDS = 60 * 60 * 24;
const MAX_DELIVERY_ATTEMPTS = 200;

function canUseChat(actor = {}) {
  return STAFF_ROLES.has(String(actor.role || "").toLowerCase());
}

function vapidPublicKey() {
  return normalizeString(process.env.CHAT_PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_CHAT_PUSH_VAPID_PUBLIC_KEY || "", 512);
}

function vapidPrivateKey() {
  return normalizeString(process.env.CHAT_PUSH_VAPID_PRIVATE_KEY || "", 512);
}

function vapidSubject() {
  return normalizeString(process.env.CHAT_PUSH_VAPID_SUBJECT || "mailto:support@footballscience.xyz", 240);
}

function isChatPushConfigured() {
  return Boolean(vapidPublicKey() && vapidPrivateKey());
}

function configureWebPush() {
  if (!isChatPushConfigured()) {
    return false;
  }
  webPush.setVapidDetails(vapidSubject(), vapidPublicKey(), vapidPrivateKey());
  return true;
}

function publicChatPushConfig() {
  return {
    enabled: isChatPushConfigured(),
    publicKey: vapidPublicKey(),
    requiresHomeScreenOnIos: true,
  };
}

function hashEndpoint(endpoint = "") {
  return crypto.createHash("sha256").update(String(endpoint || ""), "utf8").digest("hex");
}

function normalizePushSubscription(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const endpoint = normalizeString(source.endpoint, 2048);
  let endpointUrl = null;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    endpointUrl = null;
  }
  const keys = isPlainObject(source.keys) ? source.keys : {};
  const p256dh = normalizeString(keys.p256dh, 512);
  const auth = normalizeString(keys.auth, 256);
  if (!endpointUrl || endpointUrl.protocol !== "https:" || !p256dh || !auth) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

async function readActorPushScope(actor = {}, body = {}) {
  if (!actor?.id || !canUseChat(actor)) return null;
  const requestedOrganizationId = normalizeId(body.organizationId || body.organization_id);
  const requestedTeamId = normalizeId(body.teamId || body.team_id);
  const rows = await selectMany(
    "chat_team_memberships",
    [
      "select=organization_id,team_id,role,status",
      `user_id=eq.${filterValue(actor.id)}`,
      "status=eq.active",
      "limit=100",
    ].join("&")
  );
  const staffRows = rows.filter((row) => STAFF_ROLES.has(String(row.role || "").toLowerCase()));
  return (
    staffRows.find((row) =>
      (!requestedOrganizationId || row.organization_id === requestedOrganizationId) &&
      (!requestedTeamId || row.team_id === requestedTeamId)
    ) ||
    staffRows.find((row) => !requestedOrganizationId || row.organization_id === requestedOrganizationId) ||
    staffRows[0] ||
    null
  );
}

function subscriptionDeviceLabel(req, body = {}) {
  const label = normalizeString(body.deviceLabel || body.device_label, 140);
  if (label) return label;
  const userAgent = normalizeString(req?.headers?.["user-agent"] || req?.headers?.["User-Agent"] || "", 500);
  if (/iphone|ipad|ios/i.test(userAgent)) return "iOS web app";
  if (/android/i.test(userAgent)) return "Android browser";
  if (/macintosh|mac os/i.test(userAgent)) return "Mac browser";
  if (/windows/i.test(userAgent)) return "Windows browser";
  return "Web browser";
}

async function upsertChatPushSubscription(actor = {}, body = {}, req = null) {
  const subscription = normalizePushSubscription(body.subscription || body);
  if (!subscription) {
    return { ok: false, status: 400, reason: "A valid push subscription is required." };
  }
  const scope = await readActorPushScope(actor, body);
  if (!scope?.organization_id) {
    return { ok: false, status: 403, reason: "Chat membership is required before enabling push notifications." };
  }
  const now = new Date().toISOString();
  const endpointHash = hashEndpoint(subscription.endpoint);
  const rows = await upsertRows("chat_push_subscriptions", {
    organization_id: scope.organization_id,
    team_id: scope.team_id || null,
    user_id: actor.id,
    endpoint: subscription.endpoint,
    endpoint_hash: endpointHash,
    p256dh_key: subscription.keys.p256dh,
    auth_key: subscription.keys.auth,
    platform: normalizeString(body.platform || "web", 80).toLowerCase() || "web",
    device_label: subscriptionDeviceLabel(req, body),
    user_agent: normalizeString(req?.headers?.["user-agent"] || req?.headers?.["User-Agent"] || "", 500),
    permission: normalizeString(body.permission || "granted", 20) || "granted",
    enabled: true,
    revoked_at: null,
    last_seen_at: now,
    metadata: {
      source: "api.push-subscriptions",
      lastSubscribedAt: now,
      notificationLevel: normalizeString(body.notificationLevel || body.notification_level || "all", 40).toLowerCase() || "all",
      swScope: normalizeString(body.swScope || body.scope || "", 300),
    },
  }, "endpoint_hash");
  return { ok: true, subscription: rows[0] || null, configured: isChatPushConfigured(), publicKey: vapidPublicKey() };
}

async function revokeChatPushSubscription(actor = {}, body = {}) {
  if (!actor?.id) {
    return { ok: false, status: 401, reason: "You must be signed in." };
  }
  const endpoint = normalizeString(body.endpoint || body.subscription?.endpoint || "", 2048);
  const now = new Date().toISOString();
  const query = endpoint
    ? `user_id=eq.${filterValue(actor.id)}&endpoint_hash=eq.${filterValue(hashEndpoint(endpoint))}`
    : `user_id=eq.${filterValue(actor.id)}&enabled=is.true&revoked_at=is.null`;
  const rows = await patchRows("chat_push_subscriptions", query, {
    enabled: false,
    revoked_at: now,
    last_seen_at: now,
    metadata: { source: "api.push-subscriptions", revokedByUserAt: now },
  });
  return { ok: true, revoked: rows.length };
}

async function readChatPushSubscriptionStatus(actor = {}) {
  if (!actor?.id) {
    return { ok: false, status: 401, reason: "You must be signed in." };
  }
  const rows = await selectMany(
    "chat_push_subscriptions",
    [
      "select=id,organization_id,team_id,device_label,platform,last_seen_at,last_success_at,last_failure_at,enabled,revoked_at",
      `user_id=eq.${filterValue(actor.id)}`,
      "enabled=is.true",
      "revoked_at=is.null",
      "order=updated_at.desc",
      "limit=20",
    ].join("&")
  );
  return { ok: true, configured: isChatPushConfigured(), publicKey: vapidPublicKey(), subscriptions: rows };
}

function participantUserStateFromMetadata(metadata = {}) {
  const source = isPlainObject(metadata) ? metadata : {};
  return {
    archivedAt: normalizeString(source.archivedAt || "", 80),
    hiddenAt: normalizeString(source.hiddenAt || "", 80),
    deletedForUserAt: normalizeString(source.deletedForUserAt || "", 80),
    blockedAt: normalizeString(source.blockedAt || "", 80),
  };
}

function isAfterIso(value = "", threshold = "") {
  const valueMs = Date.parse(value || "");
  const thresholdMs = Date.parse(threshold || "");
  return Number.isFinite(valueMs) && Number.isFinite(thresholdMs) && valueMs > thresholdMs;
}

function messageMentionedUserIds(message = {}) {
  const metadata = isPlainObject(message.metadata) ? message.metadata : {};
  return Array.from(new Set([
    ...(Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : []),
    ...(Array.isArray(message.mentioned_user_ids) ? message.mentioned_user_ids : []),
    ...(Array.isArray(metadata.mentionedUserIds) ? metadata.mentionedUserIds : []),
    ...(Array.isArray(metadata.mentioned_user_ids) ? metadata.mentioned_user_ids : []),
  ].map((value) => normalizeId(value)).filter(Boolean)));
}

async function readNotificationRecipients(thread = {}, message = {}) {
  const type = normalizeString(thread.type || "team", 40).toLowerCase();
  if (type === "dm" || type === "group" || type === "system") {
    return selectMany(
      "chat_thread_participants",
      [
        "select=user_id,notification_level,metadata",
        `thread_id=eq.${filterValue(thread.id)}`,
        "left_at=is.null",
        "limit=200",
      ].join("&")
    );
  }
  return selectMany(
    "chat_team_memberships",
    [
      "select=user_id,role,metadata",
      `organization_id=eq.${filterValue(thread.organization_id)}`,
      thread.team_id ? `team_id=eq.${filterValue(thread.team_id)}` : "",
      "status=eq.active",
      "limit=200",
    ].filter(Boolean).join("&")
  ).then((rows) => rows
    .filter((row) => STAFF_ROLES.has(String(row.role || "").toLowerCase()))
    .map((row) => ({ ...row, notification_level: "all", metadata: row.metadata || {} })));
}

function mentionsRecipient(message = {}, recipient = {}) {
  return messageMentionedUserIds(message).includes(recipient.user_id);
}

function shouldSkipRecipient(actor = {}, thread = {}, message = {}, recipient = {}) {
  if (!recipient?.user_id || recipient.user_id === actor.id) return "sender";
  const notificationLevel = normalizeString(recipient.notification_level || "all", 40).toLowerCase();
  if (notificationLevel === "muted") return "muted";
  if (notificationLevel === "mentions" && !mentionsRecipient(message, recipient)) return "mentions-only";
  const metadata = isPlainObject(thread.metadata) ? thread.metadata : {};
  const settingsByUser = isPlainObject(metadata.settingsByUser) ? metadata.settingsByUser : {};
  const userSettings = isPlainObject(settingsByUser[recipient.user_id]) ? settingsByUser[recipient.user_id] : {};
  if (normalizeBoolean(userSettings.muted)) return "muted";
  const userState = participantUserStateFromMetadata(recipient.metadata);
  if (userState.archivedAt || userState.hiddenAt || userState.blockedAt) return "hidden";
  if (userState.deletedForUserAt && !isAfterIso(message.created_at || message.createdAt || "", userState.deletedForUserAt)) {
    return "deleted-for-user";
  }
  return "";
}

async function readSubscriptionsForRecipients(thread = {}, recipientIds = []) {
  const ids = Array.from(new Set(recipientIds.filter(isUuid))).slice(0, 200);
  if (!ids.length || !thread.organization_id) return [];
  return selectMany(
    "chat_push_subscriptions",
    [
      "select=id,user_id,endpoint,p256dh_key,auth_key,platform,metadata",
      `organization_id=eq.${filterValue(thread.organization_id)}`,
      `user_id=${inFilter(ids)}`,
      "enabled=is.true",
      "revoked_at=is.null",
      "limit=200",
    ].join("&")
  );
}

function senderName(actor = {}) {
  return normalizeString(`${actor.firstName || ""} ${actor.lastName || ""}`.trim() || actor.username || actor.email || "Team member", 80);
}

function threadTitle(thread = {}) {
  const metadata = isPlainObject(thread.metadata) ? thread.metadata : {};
  return normalizeString(metadata.customTitle || thread.title || "Football Science chat", 120);
}

function pushPayload(actor = {}, thread = {}, message = {}) {
  const url = `/?workspace=home&chatThread=${encodeURIComponent(normalizeString(thread.metadata?.legacyThreadId || thread.id, 120))}&message=${encodeURIComponent(message.id || "")}`;
  return {
    schema: "footballscience-chat-push-v1",
    title: `New message from ${senderName(actor)}`,
    body: threadTitle(thread),
    tag: `footballscience-chat-${normalizeString(thread.id, 80)}`,
    url,
    threadId: thread.metadata?.legacyThreadId || thread.id,
    messageId: message.id || "",
    createdAt: message.created_at || new Date().toISOString(),
  };
}

function webPushSubscription(row = {}) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh_key,
      auth: row.auth_key,
    },
  };
}

async function recordDeliveryAttempt(row = {}) {
  return insertRows("chat_push_delivery_attempts", row).catch(() => []);
}

async function markSubscriptionFailure(subscriptionId, error = {}) {
  const statusCode = Number(error?.statusCode || error?.status || 0) || null;
  const now = new Date().toISOString();
  const revoke = statusCode === 404 || statusCode === 410;
  await patchRows("chat_push_subscriptions", `id=eq.${filterValue(subscriptionId)}`, {
    last_failure_at: now,
    failure_count: 1,
    ...(revoke ? { enabled: false, revoked_at: now } : {}),
  }).catch(() => []);
  return statusCode;
}

async function sendToSubscription(actor, thread, message, subscription, payload) {
  try {
    const result = await webPush.sendNotification(webPushSubscription(subscription), JSON.stringify(payload), {
      TTL: PUSH_TTL_SECONDS,
      urgency: "normal",
      timeout: PUSH_SEND_TIMEOUT_MS,
    });
    await patchRows("chat_push_subscriptions", `id=eq.${filterValue(subscription.id)}`, {
      last_success_at: new Date().toISOString(),
      failure_count: 0,
    }).catch(() => []);
    await recordDeliveryAttempt({
      organization_id: thread.organization_id,
      team_id: thread.team_id || null,
      thread_id: thread.id,
      message_id: message.id,
      recipient_user_id: subscription.user_id,
      subscription_id: subscription.id,
      status: "sent",
      provider_status: Number(result?.statusCode || 201) || 201,
    });
    return { ok: true };
  } catch (error) {
    const providerStatus = await markSubscriptionFailure(subscription.id, error);
    await recordDeliveryAttempt({
      organization_id: thread.organization_id,
      team_id: thread.team_id || null,
      thread_id: thread.id,
      message_id: message.id,
      recipient_user_id: subscription.user_id,
      subscription_id: subscription.id,
      status: "failed",
      reason: normalizeString(error?.body || error?.message || "Push delivery failed.", 240),
      provider_status: providerStatus,
    });
    return { ok: false, reason: error?.message || "Push delivery failed." };
  }
}

async function notifyChatMessageCreated(actor = {}, context = {}) {
  const thread = context.thread || {};
  const message = context.message || {};
  if (!thread?.id || !message?.id || !configureWebPush()) {
    return { ok: false, skipped: true, reason: "Push is not configured." };
  }
  const recipients = await readNotificationRecipients(thread, message);
  const allowedRecipients = [];
  const skipped = [];
  recipients.forEach((recipient) => {
    const reason = shouldSkipRecipient(actor, thread, message, recipient);
    if (reason) {
      skipped.push({ userId: recipient.user_id, reason });
      return;
    }
    allowedRecipients.push(recipient.user_id);
  });
  const subscriptions = await readSubscriptionsForRecipients(thread, allowedRecipients);
  const deliverableSubscriptions = subscriptions.filter((subscription) => {
    const metadata = isPlainObject(subscription.metadata) ? subscription.metadata : {};
    const level = normalizeString(metadata.notificationLevel || "all", 40).toLowerCase();
    return level !== "muted" && (level !== "mentions" || mentionsRecipient(message, { user_id: subscription.user_id }));
  });
  const payload = pushPayload(actor, thread, message);
  const attempts = await Promise.all(
    deliverableSubscriptions.slice(0, MAX_DELIVERY_ATTEMPTS).map((subscription) =>
      sendToSubscription(actor, thread, message, subscription, payload)
    )
  );
  return {
    ok: true,
    sent: attempts.filter((attempt) => attempt.ok).length,
    failed: attempts.filter((attempt) => !attempt.ok).length,
    skipped: skipped.length,
    subscriptions: deliverableSubscriptions.length,
  };
}

async function sendChatPushTest(actor = {}, body = {}) {
  const status = await readChatPushSubscriptionStatus(actor);
  if (!status.ok) return status;
  if (!configureWebPush()) {
    return { ok: false, status: 503, reason: "Push notifications are not configured on the server." };
  }
  const subscriptions = await selectMany(
    "chat_push_subscriptions",
    [
      "select=id,user_id,endpoint,p256dh_key,auth_key,organization_id,team_id",
      `user_id=eq.${filterValue(actor.id)}`,
      "enabled=is.true",
      "revoked_at=is.null",
      "limit=20",
    ].join("&")
  );
  if (!subscriptions.length) {
    return {
      ok: false,
      status: 409,
      reason: "No push-enabled device is registered for this account.",
      sent: 0,
      failed: 0,
    };
  }
  const payload = {
    schema: "footballscience-chat-push-v1",
    title: "Football Science notifications",
    body: normalizeString(body.body || "Push notifications are enabled.", 120),
    tag: "footballscience-chat-push-test",
    url: "/?workspace=home",
    test: true,
  };
  const attempts = await Promise.all(subscriptions.map((subscription) =>
    webPush.sendNotification(webPushSubscription(subscription), JSON.stringify(payload), {
      TTL: 600,
      urgency: "normal",
      timeout: PUSH_SEND_TIMEOUT_MS,
    }).then(async (result) => {
      await patchRows("chat_push_subscriptions", `id=eq.${filterValue(subscription.id)}`, {
        last_success_at: new Date().toISOString(),
        failure_count: 0,
      }).catch(() => []);
      return { ok: true, providerStatus: Number(result?.statusCode || 201) || 201 };
    }).catch(async (error) => {
      const providerStatus = await markSubscriptionFailure(subscription.id, error);
      return { ok: false, reason: error?.message || "Push failed.", providerStatus };
    })
  ));
  const sent = attempts.filter((attempt) => attempt.ok).length;
  const failed = attempts.filter((attempt) => !attempt.ok).length;
  return {
    ok: sent > 0,
    status: sent > 0 ? 200 : 502,
    sent,
    failed,
    reason: sent > 0 ? "" : attempts.find((attempt) => !attempt.ok)?.reason || "Push test failed.",
  };
}

module.exports = {
  isChatPushConfigured,
  notifyChatMessageCreated,
  publicChatPushConfig,
  readChatPushSubscriptionStatus,
  revokeChatPushSubscription,
  sendChatPushTest,
  upsertChatPushSubscription,
  _private: {
    hashEndpoint,
    mentionsRecipient,
    messageMentionedUserIds,
    normalizePushSubscription,
    shouldSkipRecipient,
  },
};
