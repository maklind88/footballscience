import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const readSource = (filePath) => readFileSync(path.join(root, filePath), "utf8");
const pushModule = require("../api/_lib/chat-push-notifications.js");

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
  expect(clientConfig).toContain("chatPush: publicChatPushConfig()");
  expect(permissionMatrix).toContain('"/api/push-subscriptions"');
});

test("chat push test delivery fails clearly without a registered device", () => {
  const pushService = readSource("api/_lib/chat-push-notifications.js");
  const renderer = readSource("src/modules/chat/chat-widget-renderer.mjs");

  expect(pushService).toContain("No push-enabled device is registered for this account.");
  expect(pushService).toContain("ok: sent > 0");
  expect(pushService).toContain("markSubscriptionFailure(subscription.id, error)");
  expect(renderer).toContain("data-dashboard-chat-widget-test-push");
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
  const { shouldSkipRecipient, normalizePushSubscription, hashEndpoint } = pushModule._private;
  const message = { id: "m1", metadata: { mentionedUserIds: ["user-mentioned"] }, created_at: "2026-07-02T12:00:00.000Z" };

  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "sender" })).toBe("sender");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "muted", notification_level: "muted" })).toBe("muted");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "quiet", notification_level: "mentions" })).toBe("mentions-only");
  expect(shouldSkipRecipient({ id: "sender" }, {}, message, { user_id: "user-mentioned", notification_level: "mentions" })).toBe("");
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
