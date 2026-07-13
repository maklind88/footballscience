import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChatPushClient } from "../src/modules/chat/chat-push-client.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const readSource = (filePath) => readFileSync(path.join(root, filePath), "utf8");
const pushModule = require("../api/_lib/chat-push-notifications.js");

function createPushClientTestWindow(subscription = null) {
  const registration = {
    scope: "https://footballscience.xyz/",
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => subscription,
    },
  };
  return {
    isSecureContext: true,
    PushManager: function PushManager() {},
    Notification: {
      permission: "granted",
      requestPermission: async () => "granted",
    },
    navigator: {
      userAgent: "Playwright",
      platform: "MacIntel",
      maxTouchPoints: 0,
      serviceWorker: {
        getRegistration: async () => registration,
        register: async () => registration,
        ready: Promise.resolve(registration),
      },
    },
    matchMedia: () => ({ matches: false }),
  };
}

test("chat push server keeps endpoint subscriptions service-owned and private", () => {
  const migration = readSource("supabase/migrations/20260702124301_chat_web_push_notifications.sql");

  expect(migration).toContain("create table if not exists public.chat_push_subscriptions");
  expect(migration).toContain("endpoint_hash text not null");
  expect(migration).toContain("revoke all on public.chat_push_subscriptions from anon, authenticated");
  expect(migration).toContain("grant select, insert, update, delete on public.chat_push_subscriptions to service_role");
  expect(migration).toContain("alter table public.chat_push_subscriptions enable row level security");
  expect(migration).toContain("chat_push_delivery_attempts");
});

test("chat push service worker handles closed-app notifications and clicks", () => {
  const serviceWorker = readSource("footballscience-sw.js");

  expect(serviceWorker).toContain('self.addEventListener("push"');
  expect(serviceWorker).toContain("self.registration.showNotification");
  expect(serviceWorker).toContain('self.addEventListener("notificationclick"');
  expect(serviceWorker).toContain("self.clients.openWindow");
  expect(serviceWorker).toContain("sameOriginWindow.navigate");
  expect(serviceWorker).toContain("target.origin === self.location.origin");
});

test("chat push deep links open the exact message in the app", () => {
  const pushService = readSource("api/_lib/chat-push-notifications.js");
  const appRuntime = readSource("app-runtime.js");
  const renderer = readSource("src/modules/chat/chat-widget-renderer.mjs");

  expect(pushService).toContain("chatThread=");
  expect(pushService).toContain("&message=");
  expect(appRuntime).toContain('params.get("message")');
  expect(appRuntime).toContain("scrollDashboardChatDeepLinkMessage");
  expect(appRuntime).toContain("is-deep-link-target");
  expect(appRuntime).toContain("is-active-search-match");
  expect(renderer).toContain("data-dashboard-chat-message-id");
});

test("chat push client subscribes through PushManager and secure API route", () => {
  const client = readSource("src/modules/chat/chat-push-client.mjs");
  const appRuntime = readSource("app-runtime.js");
  const clientConfig = readSource("api/client-config.js");
  const permissionMatrix = readSource("src/core/permission-matrix.cjs");

  expect(client).toContain("serviceWorker.register");
  expect(client).toContain("pushManager.subscribe");
  expect(client).toContain("applicationServerKey");
  expect(client).toContain('"/api/push-subscriptions"');
  expect(client).toContain("notificationLevel");
  expect(client).toContain("async function sendTest");
  expect(client).toContain('action: "test"');
  expect(appRuntime).toContain("createChatPushClient");
  expect(appRuntime).toContain("dashboardChatPushClient.toggleFromNotificationLevel");
  expect(appRuntime).toContain("dashboardChatPushClient.sendTest");
  expect(appRuntime).toContain("dashboardChatPushClient.status");
  expect(appRuntime).toContain("refreshDashboardChatPushDiagnostics");
  expect(appRuntime).toContain("runDashboardChatNotificationToggleAction");
  expect(appRuntime).toContain("runDashboardChatPushTestAction");
  expect(appRuntime).toContain("function findDashboardChatActionTarget(event, selector)");
  expect(appRuntime).toContain("event.composedPath");
  expect(appRuntime).toContain('findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-test-push]")');
  expect(appRuntime).toContain('findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-toggle-notifications]")');
  expect(appRuntime).toContain('findDashboardChatActionTarget(event, "[data-dashboard-chat-widget-refresh-push-status]")');
  expect(appRuntime).toContain('document.addEventListener("pointerdown", handleDashboardChatPushActionEvent, true)');
  expect(appRuntime).toContain('document.addEventListener("click", handleDashboardChatPushActionEvent, true)');
  expect(appRuntime).toContain("let testPushMessage =");
  expect(appRuntime).toContain("renderDashboardChatWidget();\nshowDashboardChatWidgetToast(testPushMessage);");
  expect(clientConfig).toContain("chatPush: publicChatPushConfig()");
  expect(permissionMatrix).toContain('"/api/push-subscriptions"');
});

test("chat push client coalesces status checks and caches automatic refreshes", async () => {
  let now = 1_000;
  let pushStatusReads = 0;
  const subscription = {
    endpoint: "https://push.example/device-1",
    toJSON: () => ({
      endpoint: "https://push.example/device-1",
      keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" },
    }),
  };
  const client = createChatPushClient({
    win: createPushClientTestWindow(subscription),
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/api/push-subscriptions") && init.method === "GET") {
        pushStatusReads += 1;
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          subscriptions: [{ id: "sub-1", user_id: "u1" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, chatPush: { enabled: true, publicKey: "" } }), { status: 200 });
    },
    getAuthStore: () => ({ getAccessToken: async () => "token" }),
    now: () => now,
    statusCacheMs: 60_000,
  });

  const [first, second] = await Promise.all([client.status(), client.status()]);
  expect(first.serverConfigured).toBe(true);
  expect(second.serverSubscriptions).toHaveLength(1);
  expect(pushStatusReads).toBe(1);

  await client.status();
  expect(pushStatusReads).toBe(1);

  now += 61_000;
  await client.status();
  expect(pushStatusReads).toBe(2);
});

test("chat push client rate-limits repeated existing subscription refreshes", async () => {
  let now = 10_000;
  let pushSubscribeWrites = 0;
  const subscription = {
    endpoint: "https://push.example/device-2",
    toJSON: () => ({
      endpoint: "https://push.example/device-2",
      keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" },
    }),
  };
  const client = createChatPushClient({
    win: createPushClientTestWindow(subscription),
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/api/push-subscriptions") && init.method === "POST") {
        pushSubscribeWrites += 1;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    getAuthStore: () => ({ getAccessToken: async () => "token" }),
    getChatScope: () => ({ organizationId: "org-1", teamId: "team-1" }),
    now: () => now,
    subscriptionRefreshCooldownMs: 300_000,
  });

  await client.refreshExistingSubscription("all");
  await client.refreshExistingSubscription("all");
  expect(pushSubscribeWrites).toBe(1);

  now += 301_000;
  await client.refreshExistingSubscription("all");
  expect(pushSubscribeWrites).toBe(2);
});

test("chat push client backs off failed automatic subscription refreshes", async () => {
  let now = 20_000;
  let pushSubscribeWrites = 0;
  const subscription = {
    endpoint: "https://push.example/device-3",
    toJSON: () => ({
      endpoint: "https://push.example/device-3",
      keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" },
    }),
  };
  const client = createChatPushClient({
    win: createPushClientTestWindow(subscription),
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/api/push-subscriptions") && init.method === "POST") {
        pushSubscribeWrites += 1;
        return new Response(JSON.stringify({ ok: false, reason: "Too many requests." }), { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    getAuthStore: () => ({ getAccessToken: async () => "token" }),
    now: () => now,
    subscriptionRefreshCooldownMs: 300_000,
  });

  const first = await client.refreshExistingSubscription("all");
  const second = await client.refreshExistingSubscription("all");
  expect(first.ok).toBe(false);
  expect(second.cached).toBe(true);
  expect(pushSubscribeWrites).toBe(1);

  now += 301_000;
  await client.refreshExistingSubscription("all");
  expect(pushSubscribeWrites).toBe(2);
});

test("chat push test delivery fails clearly without a registered device", () => {
  const pushService = readSource("api/_lib/chat-push-notifications.js");
  const renderer = readSource("src/modules/chat/chat-widget-renderer.mjs");

  expect(pushService).toContain("No push-enabled device is registered for this account.");
  expect(pushService).toContain("ok: sent > 0");
  expect(pushService).toContain("markSubscriptionFailure(subscription.id, error)");
  expect(renderer).toContain("data-dashboard-chat-widget-test-push");
  expect(renderer).toContain("data-dashboard-chat-widget-refresh-push-status");
  expect(renderer).toContain("Notification health");
  expect(renderer).toContain("Test push");
});

test("chat sendMessage queues push after the database message exists", () => {
  const chatDatabase = readSource("api/_lib/chat-database.js");

  expect(chatDatabase).toContain('const { notifyChatMessageCreated } = require("./chat-push-notifications.js");');
  expect(chatDatabase).toContain('rows = await insertRows("chat_messages"');
  expect(chatDatabase.indexOf('rows = await insertRows("chat_messages"')).toBeLessThan(
    chatDatabase.indexOf("await notifyChatMessageCreated(actor")
  );
});

test("chat push recipient filter skips sender, muted and mentions-only users", () => {
  const { shouldSkipRecipient, mentionsRecipient, messageMentionedUserIds, normalizePushSubscription, hashEndpoint } = pushModule._private;
  const message = { id: "m1", metadata: { mentionedUserIds: ["user-mentioned"] }, created_at: "2026-07-02T12:00:00.000Z" };
  const topLevelMentionMessage = { id: "m2", mentionedUserIds: ["top-level-mentioned"], created_at: "2026-07-02T12:00:00.000Z" };

  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "sender" })).toBe("sender");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "muted", notification_level: "muted" })).toBe("muted");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "quiet", notification_level: "mentions" })).toBe("mentions-only");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "user-mentioned", notification_level: "mentions" })).toBe("");
  expect(shouldSkipRecipient({ id: "sender" }, {}, topLevelMentionMessage, { user_id: "top-level-mentioned", notification_level: "mentions" })).toBe("");
  expect(mentionsRecipient(topLevelMentionMessage, { user_id: "top-level-mentioned" })).toBe(true);
  expect(messageMentionedUserIds({ mentioned_user_ids: ["snake-mentioned"], metadata: { mentionedUserIds: ["metadata-mentioned"] } })).toEqual([
    "snake-mentioned",
    "metadata-mentioned",
  ]);
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "archived", metadata: { archivedAt: "2026-07-02T11:00:00.000Z" } })).toBe("hidden");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "blocked", metadata: { blockedAt: "2026-07-02T11:00:00.000Z" } })).toBe("hidden");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "deleted", metadata: { deletedForUserAt: "2026-07-02T12:30:00.000Z" } })).toBe("deleted-for-user");
  expect(hashEndpoint("https://push.example/sub")).toHaveLength(64);
  expect(normalizePushSubscription({
    endpoint: "https://push.example/sub",
    keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" },
  })).toMatchObject({ endpoint: "https://push.example/sub" });
  expect(normalizePushSubscription({
    endpoint: "http://push.example/sub",
    keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" },
  })).toBeNull();
});
