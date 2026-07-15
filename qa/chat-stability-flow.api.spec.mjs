import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboardChatApiRuntime } from "../src/modules/chat/dashboard-chat-api-runtime.mjs";
import { createDashboardChatApiDomainRuntime } from "../src/modules/chat/dashboard-chat-api-domain-runtime.mjs";
import { createDashboardChatDomainRuntime } from "../src/modules/chat/dashboard-chat-domain-runtime.mjs";
import { createDashboardChatMessageRuntime } from "../src/modules/chat/dashboard-chat-message-runtime.mjs";
import { createDashboardChatThreadRuntime } from "../src/modules/chat/dashboard-chat-thread-runtime.mjs";
import { createDashboardChatWidgetRuntime } from "../src/modules/chat/dashboard-chat-widget-runtime.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chatApi = require("../api/chat.js");
const chatDatabase = require("../api/_lib/chat-database.js");
const { applyChatActionToState, checkChatRateLimit, filterChatStateForActor } = chatApi._private;
const { checkRateLimit: checkDatabaseChatRateLimit } = chatDatabase._private;

const appSource = readFileSync(path.join(__dirname, "../app-runtime.js"), "utf8");
const chatApiRuntimeSource = readFileSync(path.join(__dirname, "../src/modules/chat/dashboard-chat-api-runtime.mjs"), "utf8");
const chatApiDomainRuntimeSource = readFileSync(path.join(__dirname, "../src/modules/chat/dashboard-chat-api-domain-runtime.mjs"), "utf8");
const chatModuleSource = readFileSync(path.join(__dirname, "../src/modules/chat/chat.mjs"), "utf8");
const chatWidgetRuntimeSource = readFileSync(path.join(__dirname, "../src/modules/chat/dashboard-chat-widget-runtime.mjs"), "utf8");
const chatThreadRuntimeSource = readFileSync(path.join(__dirname, "../src/modules/chat/dashboard-chat-thread-runtime.mjs"), "utf8");
const chatThreadSettingsSource = readFileSync(path.join(__dirname, "../src/modules/chat/chat-thread-settings.mjs"), "utf8");
const rendererSource = readFileSync(path.join(__dirname, "../src/modules/chat/chat-widget-renderer.mjs"), "utf8");
const chatCssSource = readFileSync(path.join(__dirname, "../dashboard-chat.css"), "utf8");
const attachmentPreviewSource = readFileSync(path.join(__dirname, "../src/modules/chat/chat-attachment-preview.mjs"), "utf8");
const chatApiSource = readFileSync(path.join(__dirname, "../api/chat.js"), "utf8");
const databaseSource = readFileSync(path.join(__dirname, "../api/_lib/chat-database.js"), "utf8");

function readNumericConstant(source, constantName) {
  const match = source.match(new RegExp(`(?:const|,|\\{)\\s+${constantName}\\s*=\\s*([^,;}]+)`));
  expect(match, `${constantName} must be declared`).toBeTruthy();
  const expression = match[1].trim();
  expect(expression, `${constantName} must stay a simple numeric expression`).toMatch(/^[\d\s*+/-]+$/);
  return Function(`"use strict"; return (${expression});`)();
}

const coachActor = {
  id: "coach-qa",
  email: "coach.qa@example.com",
  firstName: "Casey",
  lastName: "Coach",
  username: "casey.coach",
  role: "coach",
};

const teammateActor = {
  id: "teammate-qa",
  email: "teammate.qa@example.com",
  firstName: "Taylor",
  lastName: "Teammate",
  username: "taylor.teammate",
  role: "analyst",
};

const adminActor = {
  ...coachActor,
  id: "admin-qa",
  email: "admin.qa@example.com",
  role: "admin",
};

test("core chat flow: send, receive, read, delete, reload, and sorting timestamps stay stable", () => {
  const first = applyChatActionToState(
    {},
    coachActor,
    { action: "sendMessage", threadId: "team", text: "Morning staff update" },
    { now: "2026-05-22T08:00:00.000Z" }
  );
  expect(first.ok).toBe(true);
  expect(first.message.text).toBe("Morning staff update");
  expect(first.thread.lastMessageAt).toBe("2026-05-22T08:00:00.000Z");

  const receivedByTeammate = filterChatStateForActor(first.state, teammateActor);
  expect(receivedByTeammate.messages.map((message) => message.id)).toContain(first.message.id);
  expect(receivedByTeammate.messages.find((message) => message.id === first.message.id)?.text).toBe("Morning staff update");

  const read = applyChatActionToState(
    first.state,
    teammateActor,
    { action: "markThreadRead", threadId: "team" },
    { now: "2026-05-22T08:01:00.000Z" }
  );
  expect(read.ok).toBe(true);
  expect(read.state.readReceipts.team[teammateActor.id]).toBe("2026-05-22T08:01:00.000Z");

  const second = applyChatActionToState(
    read.state,
    teammateActor,
    { action: "sendMessage", threadId: "team", text: "Reply after reading" },
    { now: "2026-05-23T09:00:00.000Z" }
  );
  expect(second.ok).toBe(true);
  expect(second.thread.lastMessageAt).toBe("2026-05-23T09:00:00.000Z");
  expect(Date.parse(second.thread.lastMessageAt)).toBeGreaterThan(Date.parse(first.thread.lastMessageAt));

  const deleted = applyChatActionToState(
    second.state,
    teammateActor,
    { action: "deleteMessage", messageId: second.message.id },
    { now: "2026-05-23T09:01:00.000Z" }
  );
  expect(deleted.ok).toBe(true);
  expect(deleted.message.isDeleted).toBe(true);
  expect(deleted.message.text).toBe("");

  const reloadedForCoach = filterChatStateForActor(JSON.parse(JSON.stringify(deleted.state)), coachActor);
  const deletedAfterReload = reloadedForCoach.messages.find((message) => message.id === second.message.id);
  expect(deletedAfterReload?.isDeleted).toBe(true);
  expect(deletedAfterReload?.text).toBe("");
});

test("chat thread sorting is driven by pinned state and message activity, not selected thread clicks", () => {
  expect(chatThreadRuntimeSource).toContain("const selectedThreadId = normalizeDashboardChatThreadId");
  expect(chatThreadRuntimeSource).toContain("selectedGroupThreadIds");
  expect(chatThreadRuntimeSource).toContain("function getDashboardChatNewestThreadMessage");
  expect(chatThreadRuntimeSource).toContain("const lastMessage = getDashboardChatNewestThreadMessage(threadMessages) || apiLastMessage;");
  expect(chatThreadRuntimeSource).toContain("messageId.localeCompare(latestId, undefined, { numeric: true, sensitivity: \"base\" })");
  expect(chatThreadRuntimeSource).toContain("function getDashboardChatEmptyThreadActivityMs");
  expect(chatThreadRuntimeSource).toContain("Date.parse(apiThread?.createdAt || apiThread?.created_at || \"\")");
  expect(chatThreadRuntimeSource).toContain(": getDashboardChatEmptyThreadActivityMs(apiThread, threadSettings);");
  expect(chatThreadSettingsSource).toContain("createdAt: normalizeText(value?.createdAt || value?.created_at)");
  expect(chatThreadRuntimeSource.indexOf("Date.parse(threadSettings.createdAt || threadSettings.created_at || \"\")")).toBeLessThan(
    chatThreadRuntimeSource.indexOf("Date.parse(apiThread?.createdAt || apiThread?.created_at || \"\")")
  );
  expect(chatThreadRuntimeSource).not.toContain("threadMessages[threadMessages.length - 1]");
  expect(chatModuleSource).toContain("export function getLatestHomeChatMessage");
  expect(chatModuleSource).toContain("lastMessage: getLatestHomeChatMessage(threadMessages)");
  expect(chatModuleSource).toContain("messageId.localeCompare(latestId, undefined, { numeric: true, sensitivity: \"base\" })");
  expect(chatThreadRuntimeSource).toContain("const threadTime = (thread) =>");
  expect(chatThreadRuntimeSource).toContain("const firstPinned = Boolean(first.settings?.pinned);");
  expect(chatThreadRuntimeSource).toContain("return secondTime - firstTime;");
  expect(chatThreadRuntimeSource).not.toContain("firstIsSelectedEmptyGroup");
  expect(chatThreadRuntimeSource).not.toContain("secondIsSelectedEmptyGroup");
});

test("direct and group chats expose baseline private cleanup permissions from thread data", () => {
  const currentUser = { id: "coach-qa", firstName: "Casey", lastName: "Coach", role: "coach", status: "active" };
  const teammate = { id: "teammate-qa", firstName: "Taylor", lastName: "Teammate", role: "analyst", status: "active" };
  const runtime = createDashboardChatThreadRuntime({
    getCurrentPlatformUser: () => currentUser,
    getPlatformUsers: () => [currentUser, teammate],
    getDashboardChatApiThreads: () => [
      {
        threadId: "dm:coach-qa:teammate-qa",
        type: "dm",
        title: "Direct message",
        participants: [
          { userId: currentUser.id, participantRole: "member" },
          { userId: teammate.id, participantRole: "member" },
        ],
        permissions: {},
      },
      {
        threadId: "group:staff-room",
        type: "group",
        title: "Staff room",
        participants: [
          { userId: currentUser.id, participantRole: "owner" },
          { userId: teammate.id, participantRole: "member" },
        ],
        permissions: {},
      },
    ],
    normalizeDashboardChatThreadId: (threadId, fallback = "team") => String(threadId || fallback || "team"),
    isSameDashboardUser: (first, second) => String(first?.id || first?.userId || "") === String(second?.id || second?.userId || ""),
    formatDashboardChatThreadLabel: () => "Taylor Teammate",
    formatUserName: (user = {}) => `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.id,
  });

  const directThread = runtime.getDashboardChatThreadData("dm:coach-qa:teammate-qa");
  const groupThread = runtime.getDashboardChatThreadData("group:staff-room");

  expect(directThread.permissions).toMatchObject({
    canArchiveForMe: true,
    canDeleteForMe: true,
    canBlock: true,
  });
  expect(groupThread.permissions).toMatchObject({
    canArchiveForMe: true,
    canDeleteForMe: true,
    canLeave: true,
    canManageParticipants: true,
  });
});

test("chat unread badges keep API unread when local history cache is stale", () => {
  const currentUser = { id: "coach-qa", firstName: "Casey", lastName: "Coach", role: "coach", status: "active" };
  const teammate = { id: "teammate-qa", firstName: "Taylor", lastName: "Teammate", role: "analyst", status: "active" };
  const threadId = "dm:coach-qa:teammate-qa";
  const runtime = createDashboardChatThreadRuntime({
    getCurrentPlatformUser: () => currentUser,
    getPlatformUsers: () => [currentUser, teammate],
    getDashboardChatApiThreads: () => [
      {
        threadId,
        type: "dm",
        title: "Taylor Teammate",
        unreadCount: 1,
        messageCount: 2,
        lastMessageAt: "2026-06-30T12:10:00.000Z",
        lastMessage: {
          id: "api-new-unread",
          threadId,
          userId: teammate.id,
          text: "New server-side message",
          createdAt: "2026-06-30T12:10:00.000Z",
          readBy: [teammate.id],
        },
        participants: [
          { userId: currentUser.id, participantRole: "member" },
          { userId: teammate.id, participantRole: "member" },
        ],
      },
    ],
    readDashboardMessages: () => [
      {
        id: "cached-old-read",
        threadId,
        userId: teammate.id,
        text: "Old cached message",
        createdAt: "2026-06-30T12:00:00.000Z",
        readBy: [teammate.id, currentUser.id],
        mentionedUserIds: [],
      },
    ],
    normalizeDashboardApiMessage: (message, thread) => ({ ...message, threadId: message.threadId || thread.threadId }),
    normalizeDashboardChatThreadId: (threadId, fallback = "team") => String(threadId || fallback || "team"),
    isSameDashboardUser: (first, second) => String(first?.id || first?.userId || "") === String(second?.id || second?.userId || ""),
    formatDashboardChatThreadLabel: () => "Taylor Teammate",
    formatUserName: (user = {}) => `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.id,
  });

  const thread = runtime.getDashboardChatThreadData(threadId);

  expect(thread.unreadCount).toBe(1);
  expect(runtime.getDashboardChatUnreadCountForCurrentUser(currentUser)).toBe(1);
});

test("chat history pagination keeps older loaded API pages in the runtime cache", () => {
  let runtimeMessages = [];
  const persistedWrites = [];
  const normalizeThreadId = (threadId, fallback = "team") => String(threadId || fallback || "team").trim();
  const normalizeMessage = (message = {}) => ({
    id: String(message.id || message.messageId || ""),
    clientMessageId: String(message.clientMessageId || message.client_message_id || ""),
    userId: String(message.userId || message.authorId || message.author_id || "coach-qa"),
    threadId: normalizeThreadId(message.threadId || message.thread_id, "team"),
    text: String(message.text || message.body || ""),
    createdAt: String(message.createdAt || message.created_at || ""),
    readBy: Array.isArray(message.readBy) ? message.readBy : [],
    mentionedUserIds: Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : [],
    reactions: message.reactions || {},
    priority: String(message.priority || "normal"),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    status: String(message.status || "sent"),
  });
  const messageTime = (message = {}) => Date.parse(message.createdAt || message.created_at || "") || 0;
  const makeMessage = (index) => ({
    id: `history-${String(index).padStart(3, "0")}`,
    author_id: index % 2 ? coachActor.id : teammateActor.id,
    thread_id: "team",
    body: `History ${String(index).padStart(3, "0")}`,
    created_at: new Date(Date.UTC(2026, 5, 26, 10, index)).toISOString(),
  });
  const runtime = createDashboardChatMessageRuntime({
    getDashboardChatRuntimeMessages: () => runtimeMessages,
    setDashboardChatRuntimeMessages: (nextMessages) => {
      runtimeMessages = nextMessages;
    },
    readDashboardJson: () => [],
    writeDashboardJson: (key, value) => {
      persistedWrites.push({ key, value });
    },
    normalizeDashboardChatThreadId: normalizeThreadId,
    normalizeDashboardMessage: normalizeMessage,
    normalizeDashboardApiMessage: normalizeMessage,
    getDashboardMessageIdentityKeys: (message = {}) => [message.id, message.messageId, message.clientMessageId].filter(Boolean),
    getDashboardMessageCreatedAtMs: messageTime,
    compareDashboardChatMessages: (first, second) =>
      messageTime(first) - messageTime(second) || String(first.id || "").localeCompare(String(second.id || "")),
    renderDashboardChatWidget: () => {},
  });

  runtime.writeDashboardMessages(Array.from({ length: 80 }, (_, index) => normalizeMessage(makeMessage(index + 40))), {
    skipCentralSync: true,
  });
  const mergedMessages = runtime.mergeDashboardChatApiMessages(
    Array.from({ length: 40 }, (_, index) => makeMessage(index)),
    { thread: { threadId: "team" }, keepThread: true, render: false }
  );

  expect(mergedMessages.map((message) => message.id)).toContain("history-000");
  expect(mergedMessages.map((message) => message.id)).toContain("history-119");
  expect(runtimeMessages.map((message) => message.id)).toContain("history-000");
  expect(runtimeMessages.map((message) => message.id)).toContain("history-119");
  expect(persistedWrites.at(-1).value.map((message) => message.id)).toContain("history-000");
});

test("server-first chat runtime ignores legacy local history and does not persist API history", () => {
  let runtimeMessages = [];
  const writes = [];
  const storage = new Map([
    [
      "football-dashboard-chat-v1",
      [
        {
          id: "legacy-local-only",
          userId: "coach-qa",
          threadId: "team",
          text: "This local cache must not become chat truth.",
          createdAt: "2026-06-01T08:00:00.000Z",
        },
      ],
    ],
    ["football-dashboard-chat-deleted-message-ids-v1", ["server-v2"]],
  ]);
  const normalizeThreadId = (threadId, fallback = "team") => String(threadId || fallback || "team").trim();
  const normalizeMessage = (message = {}) => ({
    id: String(message.id || message.messageId || ""),
    clientMessageId: String(message.clientMessageId || message.client_message_id || ""),
    userId: String(message.userId || message.authorId || message.author_id || "coach-qa"),
    threadId: normalizeThreadId(message.threadId || message.thread_id, "team"),
    text: String(message.text || message.body || ""),
    createdAt: String(message.createdAt || message.created_at || ""),
    readBy: Array.isArray(message.readBy) ? message.readBy : [],
    mentionedUserIds: Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : [],
    reactions: message.reactions || {},
    priority: String(message.priority || "normal"),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    status: String(message.status || "sent"),
  });
  const messageTime = (message = {}) => Date.parse(message.createdAt || message.created_at || "") || 0;
  const runtime = createDashboardChatMessageRuntime({
    readMessagesFromStorage: false,
    persistMessagesToStorage: false,
    respectDeletedMessageIdsFromStorage: false,
    persistDeletedMessageIdsToStorage: false,
    getDashboardChatRuntimeMessages: () => runtimeMessages,
    setDashboardChatRuntimeMessages: (nextMessages) => {
      runtimeMessages = nextMessages;
    },
    readDashboardJson: (key, fallback) => storage.get(key) ?? fallback,
    writeDashboardJson: (key, value) => {
      writes.push({ key, value });
      storage.set(key, value);
    },
    normalizeDashboardChatThreadId: normalizeThreadId,
    normalizeDashboardMessage: normalizeMessage,
    normalizeDashboardApiMessage: normalizeMessage,
    getDashboardMessageIdentityKeys: (message = {}) => [message.id, message.messageId, message.clientMessageId].filter(Boolean),
    getDashboardMessageCreatedAtMs: messageTime,
    compareDashboardChatMessages: (first, second) =>
      messageTime(first) - messageTime(second) || String(first.id || "").localeCompare(String(second.id || "")),
    renderDashboardChatWidget: () => {},
  });

  expect(runtime.readDashboardMessages()).toEqual([]);

  const mergedMessages = runtime.mergeDashboardChatApiMessages(
    [
      {
        id: "server-v2",
        thread_id: "team",
        author_id: coachActor.id,
        body: "Server-backed truth",
        created_at: "2026-06-04T11:45:22.000Z",
      },
    ],
    { thread: { threadId: "team" }, replaceThreadId: "team", render: false }
  );

  expect(mergedMessages.map((message) => message.id)).toEqual(["server-v2"]);
  expect(runtimeMessages.map((message) => message.id)).toEqual(["server-v2"]);
  expect(writes.some((entry) => entry.key === "football-dashboard-chat-v1")).toBe(false);
  expect(writes.some((entry) => entry.key === "football-dashboard-chat-deleted-message-ids-v1")).toBe(false);
});

test("retryable chat API write failures only use local dev fallback", () => {
  const productionRuntime = createDashboardChatApiDomainRuntime({
    getPlatformAuthStore: () => ({ isDevMode: () => true }),
    win: { location: { hostname: "footballscience.xyz" } },
  });
  const localRuntime = createDashboardChatApiDomainRuntime({
    getPlatformAuthStore: () => ({ isDevMode: () => true }),
    win: { location: { hostname: "localhost" } },
  });
  const localNonDevRuntime = createDashboardChatApiDomainRuntime({
    getPlatformAuthStore: () => ({ isDevMode: () => false }),
    win: { location: { hostname: "localhost" } },
  });

  expect(productionRuntime.canFallbackDashboardChatApiResult({ retryable: true, status: 503 })).toBe(false);
  expect(localRuntime.canFallbackDashboardChatApiResult({ retryable: true, status: 503 })).toBe(true);
  expect(localRuntime.canFallbackDashboardChatApiResult({ status: 401 })).toBe(true);
  expect(localNonDevRuntime.canFallbackDashboardChatApiResult({ retryable: true, status: 503 })).toBe(false);
  expect(chatApiDomainRuntimeSource).toContain("isLocal && isDevAuth && (result.status === 401 || result.retryable)");
});

test("server-visible chat history clears stale local deleted tombstones", () => {
  let runtimeMessages = [];
  const storage = new Map([
    ["football-dashboard-chat-v1", []],
    ["football-dashboard-chat-deleted-message-ids-v1", ["server-history-1"]],
  ]);
  const normalizeThreadId = (threadId, fallback = "team") => String(threadId || fallback || "team").trim();
  const normalizeMessage = (message = {}) => ({
    id: String(message.id || message.messageId || ""),
    clientMessageId: String(message.clientMessageId || message.client_message_id || ""),
    userId: String(message.userId || message.authorId || message.author_id || "coach-qa"),
    threadId: normalizeThreadId(message.threadId || message.thread_id, "team"),
    text: String(message.text || message.body || ""),
    createdAt: String(message.createdAt || message.created_at || ""),
    readBy: Array.isArray(message.readBy) ? message.readBy : [],
    mentionedUserIds: Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : [],
    reactions: message.reactions || {},
    priority: String(message.priority || "normal"),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    status: String(message.status || "sent"),
  });
  const messageTime = (message = {}) => Date.parse(message.createdAt || message.created_at || "") || 0;
  const runtime = createDashboardChatMessageRuntime({
    getDashboardChatRuntimeMessages: () => runtimeMessages,
    setDashboardChatRuntimeMessages: (nextMessages) => {
      runtimeMessages = nextMessages;
    },
    readDashboardJson: (key, fallback) => storage.get(key) ?? fallback,
    writeDashboardJson: (key, value) => {
      storage.set(key, value);
    },
    normalizeDashboardChatThreadId: normalizeThreadId,
    normalizeDashboardMessage: normalizeMessage,
    normalizeDashboardApiMessage: normalizeMessage,
    getDashboardMessageIdentityKeys: (message = {}) => [message.id, message.messageId, message.clientMessageId].filter(Boolean),
    getDashboardMessageCreatedAtMs: messageTime,
    compareDashboardChatMessages: (first, second) =>
      messageTime(first) - messageTime(second) || String(first.id || "").localeCompare(String(second.id || "")),
    renderDashboardChatWidget: () => {},
  });

  const mergedMessages = runtime.mergeDashboardChatApiMessages(
    [
      {
        id: "server-history-1",
        thread_id: "team",
        author_id: coachActor.id,
        body: "Older server history",
        created_at: "2026-06-04T11:45:22.000Z",
        deleted_at: null,
      },
    ],
    { thread: { threadId: "team" }, replaceThreadId: "team", render: false }
  );

  expect(mergedMessages.map((message) => message.id)).toContain("server-history-1");
  expect(runtimeMessages.map((message) => message.id)).toContain("server-history-1");
  expect(storage.get("football-dashboard-chat-deleted-message-ids-v1")).toEqual([]);
});

test("closed chat receives realtime summary refresh for unread notifications", async () => {
  const fetchCalls = [];
  const timers = [];
  let apiThreads = [];
  let detailTimer = 0;
  let summaryTimer = 0;

  const runtime = createDashboardChatApiRuntime({
    canFallbackDashboardChatApiResult: () => false,
    fetchDashboardChatApi: async (query) => {
      fetchCalls.push(query);
      return {
        ok: true,
        result: {
          threads: [
            {
              threadId: "dm:coach-qa:teammate-qa",
              type: "dm",
              messageCount: 1,
              unreadCount: 1,
              lastMessage: {
                id: "incoming-dm",
                threadId: "dm:coach-qa:teammate-qa",
                userId: "teammate-qa",
                text: "Private update",
                createdAt: "2026-06-27T10:00:00.000Z",
                readBy: ["teammate-qa"],
              },
            },
          ],
        },
      };
    },
    getDashboardApiThreads: () => apiThreads,
    setDashboardApiThreads: (nextThreads) => {
      apiThreads = nextThreads;
    },
    getDashboardChatCurrentViewState: () => ({ isOpen: false, selectedThreadId: "team" }),
    getDashboardChatApiSyncTimer: () => detailTimer,
    setDashboardChatApiSyncTimer: (value) => {
      detailTimer = value;
    },
    getDashboardChatApiThreadSummarySyncTimer: () => summaryTimer,
    setDashboardChatApiThreadSummarySyncTimer: (value) => {
      summaryTimer = value;
    },
    getDashboardChatApiThreadSummarySyncLastRequestedAt: () => 0,
    setDashboardChatApiThreadSummarySyncLastRequestedAt: () => {},
    normalizeDashboardApiThread: (thread) => thread,
    normalizeDashboardApiMessage: (message) => message,
    normalizeDashboardChatThreadId: (threadId, fallback = "team") => String(threadId || fallback || "team"),
    syncDashboardChatWidgetNotificationCursor: () => {},
    renderDashboardChatWidget: () => {},
    win: {
      clearTimeout: () => {},
      setTimeout: (callback) => {
        timers.push(callback);
        callback();
        return timers.length;
      },
    },
  });

  runtime.handleDashboardChatRealtimeMessageChange({
    eventType: "INSERT",
    new: {
      id: "incoming-dm",
      thread_id: "database-thread-id",
      organization_id: "org-qa",
    },
  });
  await Promise.resolve();

  expect(fetchCalls).toHaveLength(1);
  expect(fetchCalls[0]).toMatchObject({ view: "threads", __activeChatRead: true });
  expect(fetchCalls[0].threadId).toBeUndefined();
  expect(detailTimer).toBe(0);
  expect(apiThreads[0]).toMatchObject({
    threadId: "dm:coach-qa:teammate-qa",
    unreadCount: 1,
  });
});

test("chat api runtime records visible sync health for failures and recovery", async () => {
  const fetchCalls = [];
  let shouldFail = true;
  let apiStatus = { key: "idle" };
  let apiThreads = [];
  let messages = [];
  let hydratedThreadIds = new Set();
  let renderCount = 0;

  const runtime = createDashboardChatApiRuntime({
    canFallbackDashboardChatApiResult: () => false,
    fetchDashboardChatApi: async (query) => {
      fetchCalls.push(query);
      if (shouldFail) {
        return {
          ok: false,
          status: 503,
          reason: "Database is temporarily unavailable.",
          retryable: true,
        };
      }
      return {
        ok: true,
        status: 200,
        result: {
          threads: [
            {
              threadId: "team",
              type: "team",
              messageCount: 0,
              unreadCount: 0,
            },
          ],
          messages: [],
          pagination: {},
        },
      };
    },
    getDashboardChatApiStatus: () => apiStatus,
    setDashboardChatApiStatus: (nextStatus) => {
      apiStatus = nextStatus;
    },
    getDashboardApiThreads: () => apiThreads,
    setDashboardApiThreads: (nextThreads) => {
      apiThreads = nextThreads;
    },
    getDashboardMessages: () => messages,
    setDashboardMessages: (nextMessages) => {
      messages = nextMessages;
    },
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    setDashboardHydratedThreadIds: (nextValue) => {
      hydratedThreadIds = nextValue instanceof Set ? nextValue : new Set(nextValue || []);
    },
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    normalizeDashboardChatThreadId: (threadId, fallback = "team") => String(threadId || fallback || "team"),
    getDashboardChatThreadTypeForApi: () => "team",
    normalizeDashboardApiThread: (thread) => thread,
    normalizeDashboardApiMessage: (message) => message,
    mergeDashboardChatApiMessages: (nextMessages) => {
      messages = nextMessages;
      return messages;
    },
    renderDashboardChatWidget: () => {
      renderCount += 1;
    },
    syncDashboardChatWidgetNotificationCursor: () => {},
  });

  const failed = await runtime.refreshDashboardChatFromApi({ threadId: "team", forceNetwork: true });
  expect(failed.ok).toBe(false);
  expect(apiStatus).toMatchObject({
    key: "server-error",
    label: "Chat server issue",
    detail: "Database is temporarily unavailable.",
    retryable: true,
    status: 503,
  });
  expect(renderCount).toBeGreaterThanOrEqual(1);

  shouldFail = false;
  const recovered = await runtime.refreshDashboardChatFromApi({ threadId: "team", forceNetwork: true });
  expect(recovered.ok).toBe(true);
  expect(apiStatus).toMatchObject({
    key: "ready",
    label: "Chat synced",
    retryable: false,
    status: 200,
  });
  expect(fetchCalls).toHaveLength(2);
  expect(hydratedThreadIds.has("team")).toBe(true);
});

test("dm flow stays scoped to participants and does not leak to other staff", () => {
  const dmThreadId = "dm:coach-qa:teammate-qa";
  const seededState = {
    threads: [
      {
        id: dmThreadId,
        type: "dm",
        title: "Taylor Teammate",
        participantIds: [coachActor.id, teammateActor.id],
      },
    ],
    messages: [],
    audit: [],
    readReceipts: {},
  };

  const sent = applyChatActionToState(
    seededState,
    coachActor,
    { action: "sendMessage", threadId: dmThreadId, text: "Private DM" },
    { now: "2026-05-23T10:00:00.000Z" }
  );
  expect(sent.ok).toBe(true);

  const visibleToRecipient = filterChatStateForActor(sent.state, teammateActor);
  expect(visibleToRecipient.messages.map((message) => message.id)).toContain(sent.message.id);

  const outsider = {
    ...teammateActor,
    id: "outsider-qa",
    email: "outsider.qa@example.com",
  };
  const hiddenFromOutsider = filterChatStateForActor(sent.state, outsider);
  expect(hiddenFromOutsider.threads).toHaveLength(0);
  expect(hiddenFromOutsider.messages).toHaveLength(0);
});

test("multi-user consistency keeps send, receive, unread, read receipt, and delete in one shared truth", () => {
  const threadId = "dm:coach-qa:teammate-qa";
  const seedState = {
    threads: [
      {
        id: threadId,
        type: "dm",
        title: "Taylor Teammate",
        participantIds: [coachActor.id, teammateActor.id],
      },
    ],
    messages: [],
    audit: [],
    readReceipts: {},
  };

  const coachSend = applyChatActionToState(
    seedState,
    coachActor,
    { action: "sendMessage", id: "qa-coach-message", threadId, text: "Shared truth from Casey" },
    { now: "2026-05-24T08:00:00.000Z" }
  );
  expect(coachSend.ok).toBe(true);

  const teammateViewAfterSend = filterChatStateForActor(coachSend.state, teammateActor);
  const teammateReceived = teammateViewAfterSend.messages.find((message) => message.id === "qa-coach-message");
  expect(teammateReceived?.text).toBe("Shared truth from Casey");
  expect(teammateReceived?.readBy).toContain(coachActor.id);
  expect(teammateReceived?.readBy).not.toContain(teammateActor.id);

  const teammateRead = applyChatActionToState(
    coachSend.state,
    teammateActor,
    { action: "markThreadRead", threadId },
    { now: "2026-05-24T08:01:00.000Z" }
  );
  expect(teammateRead.ok).toBe(true);
  expect(teammateRead.state.readReceipts[threadId][teammateActor.id]).toBe("2026-05-24T08:01:00.000Z");
  expect(teammateRead.state.messages.find((message) => message.id === "qa-coach-message")?.readBy).toContain(teammateActor.id);

  const teammateReply = applyChatActionToState(
    teammateRead.state,
    teammateActor,
    { action: "sendMessage", id: "qa-teammate-message", threadId, text: "Taylor sees the same truth" },
    { now: "2026-05-24T08:02:00.000Z" }
  );
  expect(teammateReply.ok).toBe(true);
  const coachViewAfterReply = filterChatStateForActor(teammateReply.state, coachActor);
  const coachUnreadReply = coachViewAfterReply.messages.find((message) => message.id === "qa-teammate-message");
  expect(coachUnreadReply?.text).toBe("Taylor sees the same truth");
  expect(coachUnreadReply?.readBy).toContain(teammateActor.id);
  expect(coachUnreadReply?.readBy).not.toContain(coachActor.id);

  const deleted = applyChatActionToState(
    teammateReply.state,
    coachActor,
    { action: "deleteMessage", messageId: "qa-coach-message" },
    { now: "2026-05-24T08:03:00.000Z" }
  );
  expect(deleted.ok).toBe(true);
  for (const actor of [coachActor, teammateActor]) {
    const visible = filterChatStateForActor(deleted.state, actor);
    const removed = visible.messages.find((message) => message.id === "qa-coach-message");
    expect(removed?.isDeleted).toBe(true);
    expect(removed?.text).toBe("");
  }
});

test("multi-user QA suite covers reload, offline retry hooks, attachments, delete, and read receipts", () => {
  const threadId = "dm:coach-qa:teammate-qa";
  const seedState = {
    threads: [
      {
        id: threadId,
        type: "dm",
        title: "Taylor Teammate",
        participantIds: [coachActor.id, teammateActor.id],
      },
    ],
    messages: [],
    audit: [],
    readReceipts: {},
  };

  const sent = applyChatActionToState(
    seedState,
    coachActor,
    { action: "sendMessage", id: "qa-reload-message", threadId, text: "Reload proof with attachment intent" },
    { now: "2026-05-24T09:00:00.000Z" }
  );
  const read = applyChatActionToState(
    sent.state,
    teammateActor,
    { action: "markThreadRead", threadId },
    { now: "2026-05-24T09:01:00.000Z" }
  );
  const deleted = applyChatActionToState(
    read.state,
    coachActor,
    { action: "deleteMessage", messageId: "qa-reload-message" },
    { now: "2026-05-24T09:02:00.000Z" }
  );
  const reloaded = filterChatStateForActor(JSON.parse(JSON.stringify(deleted.state)), teammateActor);
  const messageAfterReload = reloaded.messages.find((message) => message.id === "qa-reload-message");

  expect(messageAfterReload?.isDeleted).toBe(true);
  expect(messageAfterReload?.text).toBe("");
  expect(deleted.state.readReceipts[threadId][teammateActor.id]).toBe("2026-05-24T09:01:00.000Z");
  expect(appSource).toContain("retryDashboardMessageWithApi");
  expect(appSource).toContain("dashboardChatSubmittedComposerDrafts");
  expect(appSource).toContain("dashboardChatComposerAttachmentDraft");
  expect(databaseSource).toContain("createAttachmentIntent");
  expect(databaseSource).toContain("uploadAttachmentObject");
  expect(databaseSource).toContain("attachmentIds");
});

test("settings flow covers mute, pin, rename, avatar, and manager permissions", () => {
  const seed = applyChatActionToState(
    {},
    coachActor,
    { action: "sendMessage", threadId: "team", text: "Settings baseline" },
    { now: "2026-05-23T11:00:00.000Z" }
  ).state;

  const teammatePersonalSettings = applyChatActionToState(
    seed,
    teammateActor,
    { action: "setThreadSettings", threadId: "team", settings: { muted: true, pinned: true } },
    { now: "2026-05-23T11:01:00.000Z" }
  );
  expect(teammatePersonalSettings.ok).toBe(true);
  expect(teammatePersonalSettings.thread.settingsByUser[teammateActor.id].muted).toBe(true);
  expect(teammatePersonalSettings.thread.settingsByUser[teammateActor.id].pinned).toBe(true);

  const deniedRename = applyChatActionToState(
    teammatePersonalSettings.state,
    teammateActor,
    { action: "setThreadSettings", threadId: "team", settings: { customTitle: "Analyst title" } },
    { now: "2026-05-23T11:02:00.000Z" }
  );
  expect(deniedRename.ok).toBe(false);
  expect(deniedRename.status).toBe(403);

  const managerRename = applyChatActionToState(
    teammatePersonalSettings.state,
    coachActor,
    { action: "setThreadSettings", threadId: "team", settings: { customTitle: "Staff Room", avatarLabel: "SR" } },
    { now: "2026-05-23T11:03:00.000Z" }
  );
  expect(managerRename.ok).toBe(true);
  expect(managerRename.thread.title).toBe("Staff Room");
  expect(managerRename.thread.settings.customTitle).toBe("Staff Room");
  expect(managerRename.thread.settings.avatarLabel).toBe("SR");
});

test("admin destructive flow keeps delete and clear soft-deleted instead of resurrecting content", () => {
  const sent = applyChatActionToState(
    {},
    coachActor,
    { action: "sendMessage", threadId: "team", text: "Clear me later" },
    { now: "2026-05-23T12:00:00.000Z" }
  );
  const cleared = applyChatActionToState(
    sent.state,
    adminActor,
    { action: "clearThread", threadId: "team" },
    { now: "2026-05-23T12:01:00.000Z" }
  );

  expect(cleared.ok).toBe(true);
  expect(cleared.state.messages.every((message) => message.isDeleted)).toBe(true);
  expect(cleared.state.messages.every((message) => message.text === "")).toBe(true);
  expect(JSON.stringify(cleared.state)).not.toContain("Clear me later");
});

test("frontend stability contract covers retry, unread, attachments, mobile, and reload guards", () => {
  expect(appSource).toContain("retryDashboardMessageWithApi");
  expect(appSource).toContain("dashboardChatSubmittedComposerDrafts");
  expect(appSource).toContain("dashboardChatMobileConversationOpen");
  expect(appSource).toContain("setDashboardChatThreadSettingsWithApi");
  expect(appSource).toContain("dashboardChatAttachmentRenderer");
  expect(appSource).toContain("dashboardChatComposerAttachmentDraft");
  expect(appSource).toContain("previewItems");
  expect(appSource).toContain("handleThreadParticipantAction");
  expect(appSource).toContain("dashboardChatModerationFilters");
  expect(appSource).toContain("data-dashboard-chat-moderation-filter-form");
  expect(appSource).toContain("dashboardChatMessageSearchActiveIndex");
  expect(appSource).toContain("data-dashboard-chat-search-step");
  expect(rendererSource).toContain("data-dashboard-chat-search-active");
  expect(appSource).toContain("handleDashboardChatRealtimeRelatedChange");
  const chatRealtimePatterns = `${appSource}\n${chatApiRuntimeSource}`;
  expect(readNumericConstant(chatApiRuntimeSource, "DASHBOARD_CHAT_API_REFRESH_MIN_INTERVAL_MS")).toBeGreaterThanOrEqual(8000);
  expect(readNumericConstant(chatApiRuntimeSource, "DASHBOARD_CHAT_THREAD_SUMMARY_REFRESH_MIN_INTERVAL_MS")).toBeGreaterThanOrEqual(15000);
  expect(chatApiRuntimeSource).toContain("refreshDelayWithBudget");
  expect(appSource).toContain("Compatibility marker only");
  expect(appSource).toContain("readMessagesFromStorage: false");
  expect(appSource).toContain("persistMessagesToStorage: false");
  expect(appSource).toContain("respectDeletedMessageIdsFromStorage: false");
  expect(appSource).toContain("persistDeletedMessageIdsToStorage: false");
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatStorageKey, "[]")');
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatDeletedMessageIdsStorageKey, "[]")');
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatWidgetNotificationCursorStorageKey, "{}")');
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatWidgetNotificationStateStorageKey, "{}")');
  expect(databaseSource).toContain("CHAT_ALLOW_LEGACY_STORAGE_FALLBACK");
  expect(chatApiDomainRuntimeSource).toContain("response.status === 429");
  expect(chatApiDomainRuntimeSource).toContain("getRetryAfterMs(response)");
  expect(chatApiDomainRuntimeSource).toContain("dashboardChatApiReadRequests");
  expect(chatApiDomainRuntimeSource).toContain("chatApiReadMinimumGapMs");
  expect(chatApiDomainRuntimeSource).toContain("X-FootballScience-Chat-Active");
  expect(chatApiDomainRuntimeSource).toContain("__activeChatRead");
  expect(chatApiRuntimeSource).toContain("Chat refresh is paused while this tab is hidden.");
  expect(chatApiRuntimeSource).toContain("Chat refresh is paused until the chat panel is opened.");
  expect(chatApiRuntimeSource).toContain("__activeChatRead: true");
  expect(databaseSource).toContain("CHAT_ACTIVE_READ_HEADER");
  expect(databaseSource).toContain("chat_read_inactive");
  expect(chatApiSource).toContain('req.method === "GET" && !isDatabaseChatEnabled()');
  expect(chatApiSource).toContain("function getChatReadAction");
  expect(chatApiSource).toContain("function normalizeRateLimitAction");
  expect(chatApiSource).toContain("readThread: 18");
  expect(databaseSource).toContain("readThread: 120");
  expect(chatApiRuntimeSource).toContain("mergeActiveThreadLastMessageFromSummary");
  expect(appSource).toContain("mergeDashboardChatApiMessages: (...args) => mergeDashboardChatApiMessages(...args)");
  expect(appSource).toContain("isDashboardChatThreadActivelyViewed(notification.threadId)");
  expect(appSource).not.toContain("document.visibilityState === \"visible\" && readDashboardChatWidgetState().isOpen");
  expect(appSource).toContain("refreshDashboardChatFromApi({ threadId, forceNetwork: true })");
  expect(appSource).toContain("refreshDashboardChatFromApi({");
  expect(appSource).toContain("forceNetwork: true");
  expect(chatRealtimePatterns).toContain('table: "chat_threads"');
  expect(chatRealtimePatterns).toContain('table: "chat_attachments"');
  expect(chatRealtimePatterns).toContain('table: "chat_thread_participants"');
  expect(chatRealtimePatterns).not.toContain('table: "chat_reactions"');
  expect(chatRealtimePatterns).not.toContain('table: "chat_read_receipts"');
  const chatWidgetRuntimeContractSource = `${chatWidgetRuntimeSource}\n${rendererSource}`;
  expect(chatWidgetRuntimeContractSource).toContain("latestApiThreadMessage");
  expect(chatWidgetRuntimeContractSource).toContain("newestMessage");
  expect(chatWidgetRuntimeContractSource).toContain("hideDashboardChatWidgetToast");
  expect(chatWidgetRuntimeContractSource).toContain("isDashboardChatNotificationCursorCurrentForMessage");
  expect(chatWidgetRuntimeContractSource).toContain("messageCreatedAtMs");
  expect(chatWidgetRuntimeContractSource).toContain("markDashboardMessagesReadForCurrentUser");
  expect(chatWidgetRuntimeContractSource).toContain("previousThreadListScrollTop");
  expect(chatWidgetRuntimeContractSource).toContain("previousChatListWasAtBottom");
  expect(chatWidgetRuntimeContractSource).toContain("firstUnreadMessageId");
  expect(chatWidgetRuntimeContractSource).toContain("data-dashboard-chat-first-unread");
  expect(chatWidgetRuntimeContractSource).toContain("data-dashboard-chat-jump-unread");
  expect(appSource).toContain("scrollDashboardChatFirstUnread");

  expect(rendererSource).toContain("data-dashboard-chat-message-retry");
  expect(rendererSource).toContain("data-dashboard-chat-mobile-back");
  expect(rendererSource).toContain("data-dashboard-chat-participant-action");
  expect(rendererSource).toContain("dashboard-chat-moderation-filters");
  expect(rendererSource).toContain("dashboard-chat-attachment-library");
  expect(rendererSource).toContain("dashboard-chat-search-hit");
  expect(rendererSource).toContain("dashboard-chat-search-nav");
  expect(rendererSource).toContain("dashboard-chat-more-menu");
  expect(rendererSource).toContain("dashboard-chat-support-diagnostics");
  expect(rendererSource).toContain("is-active-search-match");
  expect(rendererSource).toContain("is-first-unread");
  expect(rendererSource).toContain("groupedWithNext");
  expect(rendererSource).toContain("MESSAGE_GROUP_WINDOW_MS = 15 * 60 * 1000");

  expect(chatCssSource).toContain("dashboard-chat-message.is-pending");
  expect(chatCssSource).toContain("dashboard-chat-message.is-failed");
  expect(chatCssSource).toContain("dashboard-chat-attachment-library");
  expect(chatCssSource).toContain("dashboard-chat-details-section-head");
  expect(chatCssSource).toContain("dashboard-chat-moderation-filters");
  expect(chatCssSource).toContain("dashboard-chat-search-nav");
  expect(chatCssSource).toContain("dashboard-chat-unread-separator");
  expect(chatCssSource).toContain("dashboard-chat-unread-jump");
  expect(chatCssSource).toContain("dashboard-chat-more-menu");
  expect(chatCssSource).toContain("dashboard-chat-support-diagnostics");
  expect(chatCssSource).toContain("dashboard-chat-attachment-preview-empty");
  expect(chatCssSource).toContain("dashboard-chat-widget.is-mobile-conversation");
  expect(chatCssSource).toContain("Chat owner stabilization pass");

  expect(attachmentPreviewSource).toContain("data-chat-attachment-preview-previous");
  expect(attachmentPreviewSource).toContain("data-chat-attachment-preview-next");
  expect(attachmentPreviewSource).toContain("data-chat-attachment-preview-retry");
  expect(attachmentPreviewSource).toContain('aria-label="Retry attachment preview"');
  expect(attachmentPreviewSource).toContain('aria-labelledby="dashboardChatAttachmentPreviewTitle"');
  expect(attachmentPreviewSource).toContain('aria-describedby="dashboardChatAttachmentPreviewStatus"');
  expect(attachmentPreviewSource).toContain("aria-keyshortcuts=\"Escape ArrowLeft ArrowRight\"");
  expect(attachmentPreviewSource).toContain("previous.setAttribute(\"aria-disabled\", String(singleAttachment));");
  expect(attachmentPreviewSource).toContain("next.setAttribute(\"aria-disabled\", String(singleAttachment));");
  expect(attachmentPreviewSource).toContain("const canNavigatePreview = () => state.items.length > 1;");
  expect(attachmentPreviewSource).toContain("if (!state.items.length || !canNavigatePreview()) return;");
  expect(attachmentPreviewSource).toContain("if (canNavigatePreview()) showIndex(state.index - 1);");
  expect(attachmentPreviewSource).toContain("if (canNavigatePreview()) showIndex(state.index + 1);");
  expect(attachmentPreviewSource).toContain("event.preventDefault();");
  expect(attachmentPreviewSource).toContain("previewLoadToken");
  expect(attachmentPreviewSource).toContain("showSaveFilePicker");
  expect(attachmentPreviewSource).toContain("event.key === \"Escape\"");
  expect(attachmentPreviewSource).toContain("event.key === \"ArrowLeft\"");
  expect(attachmentPreviewSource).toContain("event.key === \"ArrowRight\"");
  expect(attachmentPreviewSource).toContain("event.stopPropagation();");
  expect(attachmentPreviewSource).toContain("}, true);");
  expect(attachmentPreviewSource).toContain("return { open, close, isOpen };");
  expect(attachmentPreviewSource).toContain("getPreviewKind");

  expect(databaseSource).toContain("attachmentIds");
  expect(databaseSource).toContain("status: \"ready\"");
  expect(databaseSource).toContain("chat_read_receipts");
});

test("chat read rate limiter separates thread history reads from inbox summary reads", () => {
  const nowMs = Date.parse("2026-06-26T20:45:00.000Z");
  const threadActor = { id: "rate-read-thread-history", role: "coach" };
  const summaryActor = { id: "rate-read-thread-summary", role: "coach" };

  for (let index = 0; index < 18; index += 1) {
    expect(checkChatRateLimit(threadActor, "readThread", nowMs)).toMatchObject({ ok: true });
  }
  expect(checkChatRateLimit(threadActor, "readThread", nowMs)).toMatchObject({ ok: false, status: 429 });

  for (let index = 0; index < 12; index += 1) {
    expect(checkChatRateLimit(summaryActor, "readThreads", nowMs)).toMatchObject({ ok: true });
  }
  expect(checkChatRateLimit(summaryActor, "readThreads", nowMs)).toMatchObject({ ok: false, status: 429 });
});

test("database chat read limiter allows active conversation hydration without blocking message history", () => {
  const nowMs = Date.parse("2026-06-27T01:15:00.000Z");
  const threadActor = { id: "database-rate-read-thread-history", role: "coach" };
  const summaryActor = { id: "database-rate-read-thread-summary", role: "coach" };

  for (let index = 0; index < 60; index += 1) {
    expect(checkDatabaseChatRateLimit(threadActor, "readThread", nowMs)).toMatchObject({ ok: true });
  }
  for (let index = 0; index < 30; index += 1) {
    expect(checkDatabaseChatRateLimit(summaryActor, "readThreads", nowMs)).toMatchObject({ ok: true });
  }
});

test("chat API runtime skips network refreshes while the browser tab is hidden", async () => {
  let fetchCount = 0;
  const runtime = createDashboardChatApiRuntime({
    documentRef: { visibilityState: "hidden" },
    fetchDashboardChatApi: async () => {
      fetchCount += 1;
      return { ok: true, status: 200, result: { threads: [], messages: [] } };
    },
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    win: {
      setTimeout: (handler) => {
        handler();
        return 1;
      },
      clearTimeout: () => {},
    },
  });

  const summaries = await runtime.refreshDashboardChatThreadSummariesFromApi();
  const thread = await runtime.refreshDashboardChatFromApi({ threadId: "team" });
  runtime.queueDashboardChatCurrentViewRefresh({ delayMs: 0 });

  expect(summaries).toMatchObject({ ok: false, skipped: true, status: 0 });
  expect(thread).toMatchObject({ ok: false, skipped: true, status: 0 });
  expect(fetchCount).toBe(0);
});

test("closed chat widget queues server summaries for unread badges", () => {
  const queuedSummaryRefreshes = [];
  let widgetState = { isOpen: false, selectedThreadId: "team" };
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<button data-dashboard-chat-widget-toggle></button>", activeThreadId: "team", replyDraft: null }),
    },
    getCurrentPlatformUser: () => ({ id: "admin-qa", firstName: "Admin", lastName: "QA" }),
    getPlatformUsers: () => [{ id: "admin-qa", firstName: "Admin", lastName: "QA", status: "active" }],
    getDashboardChatThreadList: () => [{ threadId: "team", label: "Team Chat" }],
    readDashboardChatWidgetState: () => widgetState,
    queueDashboardChatThreadSummaryRefresh: (options = {}) => {
      queuedSummaryRefreshes.push(options);
    },
    ui: {
      dashboardChatWidgetRoot: {
        dataset: {},
        innerHTML: "",
        querySelector: () => null,
      },
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();
  expect(queuedSummaryRefreshes).toHaveLength(1);
  expect(queuedSummaryRefreshes[0]).toMatchObject({ render: true, forceNetwork: true });

  widgetState = { isOpen: true, selectedThreadId: "team" };
  runtime.renderDashboardChatWidget();
  expect(queuedSummaryRefreshes).toHaveLength(2);
  expect(queuedSummaryRefreshes[1]).toMatchObject({ render: true, forceNetwork: false });
});

test("open chat queues first thread load without marking the thread hydrated before API success", () => {
  const threadId = "dm:coach-qa:teammate-qa";
  const hydratedThreadIds = new Set();
  const queuedThreadLoads = [];
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<section data-dashboard-chat-list></section>", activeThreadId: threadId, replyDraft: null }),
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{ threadId, label: "Taylor Teammate", messageCount: 3 }],
    readDashboardChatWidgetState: () => ({ isOpen: true, selectedThreadId: threadId }),
    getDashboardChatThreadSummaryLastRequestedAt: () => Date.now(),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    queueDashboardChatApiRefresh: (options) => {
      queuedThreadLoads.push(options);
    },
    ui: {
      dashboardChatWidgetRoot: {
        dataset: {},
        innerHTML: "",
        querySelector: () => null,
      },
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();

  expect(queuedThreadLoads).toEqual([{ threadId, delayMs: 0, immediate: true, forceNetwork: true }]);
  expect(hydratedThreadIds.has(threadId)).toBe(false);
});

test("open chat captures first unread before marking the active thread read without auto-scroll", () => {
  const threadId = "team";
  const unreadMessageId = "message-unread";
  const messages = [
    {
      id: "message-read",
      threadId,
      userId: teammateActor.id,
      text: "Already read",
      createdAt: "2026-06-27T09:00:00.000Z",
      readBy: [teammateActor.id, coachActor.id],
      mentionedUserIds: [],
    },
    {
      id: unreadMessageId,
      threadId,
      userId: teammateActor.id,
      text: "Unread update",
      createdAt: "2026-06-27T09:01:00.000Z",
      readBy: [teammateActor.id],
      mentionedUserIds: [],
    },
  ];
  let rendered = false;
  let htmlValue = "";
  let capturedRenderOptions = null;
  let markedReadThreadId = "";
  const scrollCalls = [];
  const firstUnreadTarget = {
    scrollIntoView: (options) => {
      scrollCalls.push(options);
    },
  };
  const chatList = {
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 320,
    dataset: { dashboardChatActiveThread: threadId },
  };
  const root = {
    dataset: {},
    get innerHTML() {
      return htmlValue;
    },
    set innerHTML(nextValue) {
      htmlValue = nextValue;
      rendered = Boolean(nextValue);
    },
    querySelector: (selector) => {
      if (!rendered) {
        return null;
      }
      if (selector === "[data-dashboard-chat-list]") {
        return chatList;
      }
      if (selector === "[data-dashboard-chat-first-unread]") {
        return firstUnreadTarget;
      }
      return null;
    },
    querySelectorAll: () => [],
  };
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: (options) => {
        capturedRenderOptions = options;
        return {
          html: "<section class=\"dashboard-chat-widget is-open\"><div data-dashboard-chat-list data-dashboard-chat-active-thread=\"team\"><div data-dashboard-chat-first-unread></div></div></section>",
          activeThreadId: threadId,
          replyDraft: null,
        };
      },
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{
      threadId,
      label: "Team Chat",
      messageCount: 2,
      unreadCount: 1,
      lastMessage: messages[1],
      lastActivityAt: "2026-06-27T09:01:00.000Z",
    }],
    readDashboardMessages: () => messages,
    readDashboardChatWidgetState: () => ({ isOpen: true, selectedThreadId: threadId }),
    isDashboardChatThreadActivelyViewed: () => true,
    markDashboardMessagesReadForCurrentUser: (sourceMessages, nextThreadId) => {
      markedReadThreadId = nextThreadId;
      return sourceMessages.map((message) => ({
        ...message,
        readBy: Array.from(new Set([...(message.readBy || []), coachActor.id])),
      }));
    },
    getDashboardHydratedThreadIds: () => new Set([threadId]),
    ui: {
      dashboardChatWidgetRoot: root,
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();

  expect(markedReadThreadId).toBe(threadId);
  expect(capturedRenderOptions.firstUnreadMessageId).toBe(unreadMessageId);
  expect(capturedRenderOptions.messages.find((message) => message.id === unreadMessageId)?.readBy).toContain(coachActor.id);
  expect(scrollCalls).toEqual([]);
  expect(chatList.scrollTop).toBe(480);
});

test("chat render opens a switched thread at the latest message instead of reusing previous scroll", () => {
  const previousThreadId = "team";
  const nextThreadId = "dm:coach-qa:teammate-qa";
  let renderPhase = "before";
  let capturedRenderOptions = null;
  const previousChatList = {
    scrollTop: 0,
    scrollHeight: 900,
    clientHeight: 300,
    dataset: { dashboardChatActiveThread: previousThreadId },
  };
  const nextChatList = {
    scrollTop: 0,
    scrollHeight: 1200,
    clientHeight: 300,
    dataset: { dashboardChatActiveThread: nextThreadId },
  };
  const root = {
    dataset: {},
    get innerHTML() {
      return "";
    },
    set innerHTML(_nextValue) {
      renderPhase = "after";
    },
    querySelector: (selector) => {
      if (selector === ".dashboard-chat-widget.is-open") {
        return {};
      }
      if (selector === "[data-dashboard-chat-list]") {
        return renderPhase === "before" ? previousChatList : nextChatList;
      }
      return null;
    },
    querySelectorAll: () => [],
  };
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: (options) => {
        capturedRenderOptions = options;
        return {
          html: "<section class=\"dashboard-chat-widget is-open\"><div data-dashboard-chat-list data-dashboard-chat-active-thread=\"dm:coach-qa:teammate-qa\"></div></section>",
          activeThreadId: nextThreadId,
          replyDraft: null,
        };
      },
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{
      threadId: nextThreadId,
      label: "Teammate QA",
      messageCount: 40,
      unreadCount: 0,
      lastMessage: {
        id: "message-latest",
        threadId: nextThreadId,
        userId: teammateActor.id,
        text: "Latest update",
        createdAt: "2026-06-27T09:40:00.000Z",
        readBy: [teammateActor.id, coachActor.id],
      },
      lastActivityAt: "2026-06-27T09:40:00.000Z",
    }],
    readDashboardMessages: () => [
      {
        id: "message-latest",
        threadId: nextThreadId,
        userId: teammateActor.id,
        text: "Latest update",
        createdAt: "2026-06-27T09:40:00.000Z",
        readBy: [teammateActor.id, coachActor.id],
        mentionedUserIds: [],
      },
    ],
    readDashboardChatWidgetState: () => ({ isOpen: true, selectedThreadId: nextThreadId }),
    isDashboardChatThreadActivelyViewed: () => true,
    markDashboardMessagesReadForCurrentUser: (sourceMessages) => sourceMessages,
    getDashboardHydratedThreadIds: () => new Set([nextThreadId]),
    ui: {
      dashboardChatWidgetRoot: root,
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();

  expect(capturedRenderOptions.activeThreadId).toBe(nextThreadId);
  expect(nextChatList.scrollTop).toBe(900);
});

test("open chat rehydrates active server-backed thread when local message store is empty", () => {
  const threadId = "dm:coach-qa:teammate-qa";
  const hydratedThreadIds = new Set([threadId]);
  const queuedThreadLoads = [];
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<section data-dashboard-chat-list></section>", activeThreadId: threadId, replyDraft: null }),
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{
      threadId,
      label: "Taylor Teammate",
      messageCount: 3,
      lastActivityAt: "2026-06-26T20:00:00.000Z",
      apiThread: {
        lastMessageAt: "2026-06-26T20:00:00.000Z",
      },
    }],
    readDashboardMessages: () => [],
    readDashboardChatWidgetState: () => ({ isOpen: true, selectedThreadId: threadId }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    queueDashboardChatApiRefresh: (options) => {
      queuedThreadLoads.push(options);
    },
    ui: {
      dashboardChatWidgetRoot: {
        dataset: {},
        innerHTML: "",
        querySelector: () => null,
      },
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();

  expect(queuedThreadLoads).toEqual([{ threadId, delayMs: 0, immediate: true, forceNetwork: true }]);
});

test("rendered chat conversation can hydrate active server-backed thread even when session open state drifted", () => {
  const threadId = "team";
  const hydratedThreadIds = new Set([threadId]);
  const queuedThreadLoads = [];
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<section data-dashboard-chat-list></section>", activeThreadId: threadId, replyDraft: null }),
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{
      threadId,
      label: "North Carolina Courage Chat",
      messageCount: 7,
      lastActivityAt: "2026-06-27T01:08:00.000Z",
      apiThread: {
        lastMessageAt: "2026-06-27T01:08:00.000Z",
      },
    }],
    readDashboardMessages: () => [],
    readDashboardChatWidgetState: () => ({ isOpen: false, selectedThreadId: threadId }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    queueDashboardChatApiRefresh: (options) => {
      queuedThreadLoads.push(options);
    },
    ui: {
      dashboardChatWidgetRoot: {
        dataset: {},
        innerHTML: "",
        querySelector: (selector) => selector === "[data-dashboard-chat-form]" ? { nodeName: "FORM" } : null,
      },
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();

  expect(queuedThreadLoads).toEqual([{ threadId, delayMs: 0, immediate: true, forceNetwork: true }]);
});

test("open chat rehydrates active server-backed thread when local history is partial", () => {
  const threadId = "team";
  const hydratedThreadIds = new Set([threadId]);
  const queuedThreadLoads = [];
  const localMessages = [{
    id: "m-local-latest",
    threadId,
    userId: coachActor.id,
    text: "Latest only",
    createdAt: "2026-06-27T01:08:00.000Z",
    readBy: [coachActor.id],
    mentionedUserIds: [],
  }];
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<section data-dashboard-chat-list></section>", activeThreadId: threadId, replyDraft: null }),
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{
      threadId,
      label: "North Carolina Courage Chat",
      messageCount: 7,
      lastMessage: localMessages[0],
      lastActivityAt: "2026-06-27T01:08:00.000Z",
      apiThread: {
        messageCount: 7,
        lastMessageAt: "2026-06-27T01:08:00.000Z",
        historyComplete: true,
      },
      historyComplete: true,
    }],
    readDashboardMessages: () => localMessages,
    readDashboardChatWidgetState: () => ({ isOpen: true, selectedThreadId: threadId }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    queueDashboardChatApiRefresh: (options) => {
      queuedThreadLoads.push(options);
    },
    ui: {
      dashboardChatWidgetRoot: {
        dataset: {},
        innerHTML: "",
        querySelector: () => null,
      },
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();

  expect(queuedThreadLoads).toEqual([{ threadId, delayMs: 0, immediate: true, forceNetwork: true }]);
});

test("open chat active history load supersedes a pending chat refresh timer", () => {
  const threadId = "team";
  const hydratedThreadIds = new Set([threadId]);
  const queuedThreadLoads = [];
  const localMessages = [{
    id: "m-local-latest",
    threadId,
    userId: coachActor.id,
    text: "Latest only",
    createdAt: "2026-06-27T01:08:00.000Z",
    readBy: [coachActor.id],
    mentionedUserIds: [],
  }];
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<section data-dashboard-chat-list></section>", activeThreadId: threadId, replyDraft: null }),
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{
      threadId,
      label: "North Carolina Courage Chat",
      messageCount: 7,
      lastMessage: localMessages[0],
      apiThread: {
        messageCount: 7,
        lastMessageAt: "2026-06-27T01:08:00.000Z",
      },
    }],
    readDashboardMessages: () => localMessages,
    readDashboardChatWidgetState: () => ({ isOpen: true, selectedThreadId: threadId }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    getDashboardChatApiSyncTimer: () => 123,
    queueDashboardChatApiRefresh: (options) => {
      queuedThreadLoads.push(options);
    },
    ui: {
      dashboardChatWidgetRoot: {
        dataset: {},
        innerHTML: "",
        querySelector: () => null,
      },
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();

  expect(queuedThreadLoads).toEqual([{ threadId, delayMs: 0, immediate: true, forceNetwork: true }]);
});

test("open chat throttles repeated empty active thread hydration requests", () => {
  const threadId = "dm:coach-qa:teammate-qa";
  const hydratedThreadIds = new Set([threadId]);
  const queuedThreadLoads = [];
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<section data-dashboard-chat-list></section>", activeThreadId: threadId, replyDraft: null }),
    },
    getCurrentPlatformUser: () => coachActor,
    getPlatformUsers: () => [coachActor, teammateActor],
    getDashboardChatThreadList: () => [{
      threadId,
      label: "Taylor Teammate",
      messageCount: 3,
      lastActivityAt: "2026-06-26T20:00:00.000Z",
      apiThread: {
        lastMessageAt: "2026-06-26T20:00:00.000Z",
      },
    }],
    readDashboardMessages: () => [],
    readDashboardChatWidgetState: () => ({ isOpen: true, selectedThreadId: threadId }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    queueDashboardChatApiRefresh: (options) => {
      queuedThreadLoads.push(options);
    },
    ui: {
      dashboardChatWidgetRoot: {
        dataset: {},
        innerHTML: "",
        querySelector: () => null,
      },
    },
    documentRef: {
      activeElement: null,
      body: {
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
      },
    },
  });

  runtime.renderDashboardChatWidget();
  runtime.renderDashboardChatWidget();

  expect(queuedThreadLoads).toEqual([{ threadId, delayMs: 0, immediate: true, forceNetwork: true }]);
});

test("chat API runtime keeps active thread unhydrated when history payload is empty but server has activity", async () => {
  const hydratedThreadIds = new Set();
  let rendered = 0;
  let mergedMessages = [];
  const runtime = createDashboardChatApiRuntime({
    fetchDashboardChatApi: async () => ({
      ok: true,
      status: 200,
      result: {
        thread: {
          threadId: "team",
          type: "team",
          messageCount: 7,
          lastMessageAt: "2026-06-26T20:00:00.000Z",
          lastMessage: {
            id: "msg-latest",
            text: "Latest server message",
            userId: "coach-qa",
            createdAt: "2026-06-26T20:00:00.000Z",
          },
        },
        threads: [],
        messages: [],
      },
    }),
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    setDashboardHydratedThreadIds: (nextValue) => {
      hydratedThreadIds.clear();
      Array.from(nextValue || []).forEach((value) => hydratedThreadIds.add(value));
    },
    mergeDashboardChatApiMessages: (messages) => {
      mergedMessages = messages;
    },
    renderDashboardChatWidget: () => {
      rendered += 1;
    },
  });

  const result = await runtime.refreshDashboardChatFromApi({ threadId: "team" });

  expect(result.ok).toBe(true);
  expect(mergedMessages).toEqual([
    expect.objectContaining({
      id: "msg-latest",
      text: "Latest server message",
    }),
  ]);
  expect(hydratedThreadIds.has("team")).toBe(false);
  expect(rendered).toBe(1);
});

test("chat API runtime hydrates active thread from legacy state payload without leaking other thread messages", async () => {
  const hydratedThreadIds = new Set();
  let apiThreads = [];
  const fetchQueries = [];
  const mergeCalls = [];
  const runtime = createDashboardChatApiRuntime({
    fetchDashboardChatApi: async (query) => {
      fetchQueries.push(query);
      return {
        ok: true,
        status: 200,
        result: {
          ok: true,
          schema: "footballscience-chat-api-v1",
          state: {
            threads: [
              {
                id: "team",
                type: "team",
                title: "North Carolina Courage Chat",
                messageCount: 2,
                lastMessageAt: "2026-06-26T20:00:00.000Z",
              },
              {
                id: "dm:coach-qa:teammate-qa",
                type: "dm",
                title: "Private chat",
                messageCount: 1,
                lastMessageAt: "2026-06-26T20:01:00.000Z",
              },
            ],
            messages: [
              {
                id: "team-first",
                threadId: "team",
                text: "First team message",
                userId: coachActor.id,
                createdAt: "2026-06-26T19:59:00.000Z",
              },
              {
                id: "team-second",
                threadId: "team",
                text: "Second team message",
                userId: teammateActor.id,
                createdAt: "2026-06-26T20:00:00.000Z",
              },
              {
                id: "dm-message",
                threadId: "dm:coach-qa:teammate-qa",
                text: "Private message",
                userId: teammateActor.id,
                createdAt: "2026-06-26T20:01:00.000Z",
              },
            ],
          },
        },
      };
    },
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    setDashboardHydratedThreadIds: (nextValue) => {
      hydratedThreadIds.clear();
      Array.from(nextValue || []).forEach((value) => hydratedThreadIds.add(value));
    },
    getDashboardApiThreads: () => apiThreads,
    setDashboardApiThreads: (nextThreads = []) => {
      apiThreads = nextThreads;
    },
    normalizeDashboardApiThread: (thread = {}) => ({
      ...thread,
      threadId: thread.threadId || thread.id,
    }),
    mergeDashboardChatApiMessages: (messages, options) => {
      mergeCalls.push({ messages, options });
      return messages;
    },
    renderDashboardChatWidget: () => {},
  });

  const result = await runtime.refreshDashboardChatFromApi({ threadId: "team", limit: 40 });

  expect(result.ok).toBe(true);
  expect(fetchQueries).toEqual([expect.objectContaining({ threadId: "team", threadType: "team" })]);
  expect(apiThreads.map((thread) => thread.threadId || thread.id)).toContain("team");
  expect(mergeCalls).toEqual([
    expect.objectContaining({
      messages: [
        expect.objectContaining({ id: "team-first", threadId: "team" }),
        expect.objectContaining({ id: "team-second", threadId: "team" }),
      ],
      options: expect.objectContaining({
        replaceThreadId: "team",
      }),
    }),
  ]);
  expect(mergeCalls[0].messages.some((message) => message.id === "dm-message")).toBe(false);
  expect(hydratedThreadIds.has("team")).toBe(true);
});

test("chat API runtime preserves cached history when payload is smaller than reported history", async () => {
  const hydratedThreadIds = new Set();
  let pagination = {};
  const mergeCalls = [];
  const runtime = createDashboardChatApiRuntime({
    fetchDashboardChatApi: async () => ({
      ok: true,
      status: 200,
      result: {
        thread: {
          threadId: "team",
          type: "team",
          messageCount: 7,
          lastMessageAt: "2026-06-26T20:00:00.000Z",
        },
        messages: [
          {
            id: "msg-only-visible",
            threadId: "team",
            text: "Only one payload row",
            userId: "coach-qa",
            createdAt: "2026-06-26T20:00:00.000Z",
          },
        ],
      },
    }),
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    setDashboardHydratedThreadIds: (nextValue) => {
      hydratedThreadIds.clear();
      Array.from(nextValue || []).forEach((value) => hydratedThreadIds.add(value));
    },
    getDashboardApiPagination: () => pagination,
    setDashboardApiPagination: (nextValue) => {
      pagination = nextValue;
    },
    mergeDashboardChatApiMessages: (messages, options) => {
      mergeCalls.push({ messages, options });
      return messages;
    },
    renderDashboardChatWidget: () => {},
  });

  const result = await runtime.refreshDashboardChatFromApi({ threadId: "team", limit: 40, autoLoadOlder: false });

  expect(result.ok).toBe(true);
  expect(hydratedThreadIds.has("team")).toBe(false);
  expect(pagination.team).toBe("2026-06-26T20:00:00.000Z");
  expect(mergeCalls).toEqual([
    expect.objectContaining({
      messages: [expect.objectContaining({ id: "msg-only-visible" })],
      options: expect.objectContaining({
        keepThread: true,
        replaceThreadId: "team",
      }),
    }),
  ]);
});

test("chat API runtime auto-loads the older page when initial history is shorter than the thread count", async () => {
  const hydratedThreadIds = new Set();
  const fetchQueries = [];
  const mergeCalls = [];
  const runtime = createDashboardChatApiRuntime({
    fetchDashboardChatApi: async (query) => {
      fetchQueries.push(query);
      if (query.cursor) {
        return {
          ok: true,
          status: 200,
          result: {
            thread: {
              threadId: "team",
              type: "team",
              messageCount: 7,
              lastMessageAt: "2026-06-26T20:00:00.000Z",
            },
            messages: [
              {
                id: "msg-earlier-one",
                threadId: "team",
                text: "Earlier one",
                userId: "coach-qa",
                createdAt: "2026-06-26T19:58:00.000Z",
              },
              {
                id: "msg-earlier-two",
                threadId: "team",
                text: "Earlier two",
                userId: "coach-qa",
                createdAt: "2026-06-26T19:59:00.000Z",
              },
            ],
            nextCursor: "",
          },
        };
      }
      return {
        ok: true,
        status: 200,
        result: {
          thread: {
            threadId: "team",
            type: "team",
            messageCount: 7,
            lastMessageAt: "2026-06-26T20:00:00.000Z",
          },
          messages: [
            {
              id: "msg-only-visible",
              threadId: "team",
              text: "Only one payload row",
              userId: "coach-qa",
              createdAt: "2026-06-26T20:00:00.000Z",
            },
          ],
        },
      };
    },
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    getDashboardHydratedThreadIds: () => hydratedThreadIds,
    setDashboardHydratedThreadIds: (nextValue) => {
      hydratedThreadIds.clear();
      Array.from(nextValue || []).forEach((value) => hydratedThreadIds.add(value));
    },
    mergeDashboardChatApiMessages: (messages, options) => {
      mergeCalls.push({ messages, options });
      return messages;
    },
    renderDashboardChatWidget: () => {},
  });

  const result = await runtime.refreshDashboardChatFromApi({ threadId: "team", limit: 40 });

  expect(result.ok).toBe(true);
  expect(result.recoveredOlderHistory).toBe(true);
  expect(fetchQueries).toEqual([
    expect.objectContaining({ threadId: "team", limit: 40 }),
    expect.objectContaining({ threadId: "team", cursor: "2026-06-26T20:00:00.000Z" }),
  ]);
  expect(mergeCalls[0]).toEqual(expect.objectContaining({
    messages: [expect.objectContaining({ id: "msg-only-visible" })],
    options: expect.objectContaining({ keepThread: true, replaceThreadId: "team" }),
  }));
  expect(mergeCalls[1]).toEqual(expect.objectContaining({
    messages: [
      expect.objectContaining({ id: "msg-earlier-one" }),
      expect.objectContaining({ id: "msg-earlier-two" }),
    ],
  }));
  expect(hydratedThreadIds.has("team")).toBe(true);
});

test("chat API runtime keeps verified exhausted history count over stale summaries", () => {
  let apiThreads = [
    {
      threadId: "team",
      type: "team",
      messageCount: 1,
      lastMessageId: "msg-only-visible",
      lastMessageAt: "2026-06-26T20:00:00.000Z",
      historyComplete: true,
    },
  ];
  const runtime = createDashboardChatApiRuntime({
    getDashboardApiThreads: () => apiThreads,
    setDashboardApiThreads: (nextThreads) => {
      apiThreads = nextThreads;
    },
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    getDashboardMessages: () => [{ id: "msg-only-visible", threadId: "team", text: "Only one visible", userId: "coach-qa" }],
    normalizeDashboardApiThread: (thread) => ({
      ...thread,
      threadId: thread.threadId || "team",
      messageCount: Number(thread.messageCount || thread.message_count || 0) || 0,
      lastMessageId: thread.lastMessageId || thread.last_message_id || "",
      lastMessageAt: thread.lastMessageAt || thread.last_message_at || "",
      historyComplete: Boolean(thread.historyComplete || thread.history_complete),
      participants: [],
      permissions: {},
      settings: {},
    }),
  });

  runtime.applyDashboardChatApiPayload({
    threads: [{
      threadId: "team",
      type: "team",
      messageCount: 7,
      lastMessageId: "msg-only-visible",
      lastMessageAt: "2026-06-26T20:00:00.000Z",
    }],
  }, { replaceThreadList: true });

  expect(apiThreads[0].messageCount).toBe(1);
  expect(apiThreads[0].historyComplete).toBe(true);
});

test("chat summary seeds active server last message while full thread history hydrates", async () => {
  const merged = [];
  const runtime = createDashboardChatApiRuntime({
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: "team" }),
    getDashboardMessages: () => [],
    normalizeDashboardApiThread: (thread) => ({
      ...thread,
      threadId: thread.threadId || thread.legacyThreadId || thread.metadata?.legacyThreadId || "team",
      messageCount: thread.messageCount || thread.message_count || 0,
    }),
    mergeDashboardChatApiMessages: (messages, options) => {
      merged.push({ messages, options });
    },
    setDashboardApiThreads: () => {},
  });

  runtime.applyDashboardChatApiPayload({
    threads: [{
      id: "database-team-thread",
      threadId: "team",
      type: "team",
      messageCount: 7,
      lastMessageAt: "2026-06-27T01:08:00.000Z",
      lastMessage: {
        id: "msg-team-latest",
        threadId: "team",
        userId: "coach-qa",
        text: "fdsafas",
        createdAt: "2026-06-27T01:08:00.000Z",
      },
    }],
    messages: [],
  }, { replaceThreadList: true });

  expect(merged[0]).toEqual(expect.objectContaining({
    messages: [expect.objectContaining({ id: "msg-team-latest", text: "fdsafas" })],
    options: expect.objectContaining({ keepThread: true }),
  }));
});

test("closed chat runtime keeps polling paused but allows realtime notification summaries", async () => {
  let fetchCount = 0;
  const fetchQueries = [];
  let summaryTimer = 0;
  let apiTimer = 0;
  const runtime = createDashboardChatApiRuntime({
    fetchDashboardChatApi: async (query) => {
      fetchCount += 1;
      fetchQueries.push(query);
      return { ok: true, status: 200, result: { threads: [], messages: [] } };
    },
    getDashboardChatCurrentViewState: () => ({ isOpen: false, selectedThreadId: "team" }),
    getDashboardChatApiThreadSummarySyncTimer: () => summaryTimer,
    setDashboardChatApiThreadSummarySyncTimer: (value) => {
      summaryTimer = value;
    },
    getDashboardChatApiSyncTimer: () => apiTimer,
    setDashboardChatApiSyncTimer: (value) => {
      apiTimer = value;
    },
    win: {
      setTimeout: (handler) => {
        handler();
        return 1;
      },
      clearTimeout: () => {},
    },
  });

  const summaries = await runtime.refreshDashboardChatThreadSummariesFromApi();
  const thread = await runtime.refreshDashboardChatFromApi({ threadId: "team" });
  runtime.queueDashboardChatCurrentViewRefresh({ delayMs: 0 });
  runtime.handleDashboardChatRealtimeStatus("SUBSCRIBED");
  runtime.handleDashboardChatRealtimeMessageChange({ eventType: "INSERT", new: { id: "m1" } });
  runtime.handleDashboardChatRealtimeRelatedChange({ eventType: "UPDATE", new: { id: "team" } });

  expect(summaries).toMatchObject({ ok: false, skipped: true, status: 0 });
  expect(thread).toMatchObject({ ok: false, skipped: true, status: 0 });
  expect(fetchCount).toBe(2);
  expect(fetchQueries).toEqual([
    expect.objectContaining({ view: "threads", __activeChatRead: true }),
    expect.objectContaining({ view: "threads", __activeChatRead: true }),
  ]);
});

test("chat widget open state is session-only and cannot revive stale background chat", () => {
  let storedWidgetState = { isOpen: true, selectedThreadId: "team" };
  const createRuntime = () =>
    createDashboardChatDomainRuntime({
      createDashboardChatMessageTextRenderer: () => () => "",
      readDashboardJson: () => storedWidgetState,
      writeDashboardJson: (key, value) => {
        storedWidgetState = value;
      },
    });

  const runtime = createRuntime();
  expect(runtime.readDashboardChatWidgetState()).toEqual({ isOpen: false, selectedThreadId: "team" });

  runtime.writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: "team" });
  expect(runtime.readDashboardChatWidgetState()).toEqual({ isOpen: true, selectedThreadId: "team" });
  expect(storedWidgetState).toEqual({ isOpen: false, selectedThreadId: "team" });

  const reloadedRuntime = createRuntime();
  expect(reloadedRuntime.readDashboardChatWidgetState()).toEqual({ isOpen: false, selectedThreadId: "team" });
});

test("chat API GET 429 enters backoff instead of hammering reads", async () => {
  let fetchCount = 0;
  const runtime = createDashboardChatApiDomainRuntime({
    getPlatformAuthStore: () => ({
      getAccessToken: async () => "token",
    }),
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: false,
        status: 429,
        headers: {
          get: (key) => (String(key).toLowerCase() === "retry-after" ? "2" : ""),
        },
        text: async () => JSON.stringify({ reason: "Too many requests. Please wait a moment and try again." }),
      };
    },
    win: {
      location: { hostname: "footballscience.xyz" },
      setTimeout,
      clearTimeout,
    },
  });

  const first = await runtime.fetchDashboardChatApi({ view: "threads" });
  const second = await runtime.fetchDashboardChatApi({ view: "threads" });

  expect(first).toMatchObject({
    ok: false,
    status: 429,
    reason: "Too many requests. Please wait a moment and try again.",
  });
  expect(second).toMatchObject({
    ok: false,
    status: 429,
    retryable: true,
  });
  expect(fetchCount).toBe(1);
});

test("chat API GET marks intentional reads without leaking internal query keys", async () => {
  let capturedUrl = "";
  let capturedHeaders = {};
  const runtime = createDashboardChatApiDomainRuntime({
    chatApiReadMinimumGapMs: 0,
    getPlatformAuthStore: () => ({
      getAccessToken: async () => "token",
    }),
    fetchImpl: async (url, options = {}) => {
      capturedUrl = url;
      capturedHeaders = options.headers || {};
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () => JSON.stringify({ ok: true, threads: [] }),
      };
    },
    win: {
      location: { hostname: "footballscience.xyz" },
      setTimeout,
      clearTimeout,
    },
  });

  const result = await runtime.fetchDashboardChatApi({ view: "threads", limit: 80, __activeChatRead: true });

  expect(result.ok).toBe(true);
  expect(capturedUrl).toBe("/api/chat?limit=80&view=threads");
  expect(capturedHeaders.Authorization).toBe("Bearer token");
  expect(capturedHeaders["X-FootballScience-Chat-Active"]).toBe("1");
  expect(capturedUrl).not.toContain("__activeChatRead");
});

test("chat API GET coalesces duplicate reads and reuses short settled results", async () => {
  let fetchCount = 0;
  const runtime = createDashboardChatApiDomainRuntime({
    chatApiReadDedupeWindowMs: 5000,
    chatApiReadMinimumGapMs: 0,
    getCurrentPlatformUser: () => ({ id: "admin-qa" }),
    getPlatformAuthStore: () => ({
      getAccessToken: async () => "token",
    }),
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () => JSON.stringify({ ok: true, threads: [{ id: "team" }] }),
      };
    },
    win: {
      location: { hostname: "footballscience.xyz" },
      setTimeout,
      clearTimeout,
    },
  });

  const [first, second] = await Promise.all([
    runtime.fetchDashboardChatApi({ view: "threads", limit: 80 }),
    runtime.fetchDashboardChatApi({ limit: 80, view: "threads" }),
  ]);
  const third = await runtime.fetchDashboardChatApi({ view: "threads", limit: 80 });

  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(third.ok).toBe(true);
  expect(fetchCount).toBe(1);
});

test("chat API GET forceNetwork bypasses short settled read cache without leaking the flag", async () => {
  let fetchCount = 0;
  const capturedUrls = [];
  const runtime = createDashboardChatApiDomainRuntime({
    chatApiReadDedupeWindowMs: 5000,
    chatApiReadMinimumGapMs: 0,
    getCurrentPlatformUser: () => ({ id: "admin-qa" }),
    getPlatformAuthStore: () => ({
      getAccessToken: async () => "token",
    }),
    fetchImpl: async (url) => {
      fetchCount += 1;
      capturedUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () => JSON.stringify({ ok: true, messages: [{ id: `server-${fetchCount}` }] }),
      };
    },
    win: {
      location: { hostname: "footballscience.xyz" },
      setTimeout,
      clearTimeout,
    },
  });

  const first = await runtime.fetchDashboardChatApi({ threadId: "team", limit: 40 });
  const cached = await runtime.fetchDashboardChatApi({ threadId: "team", limit: 40 });
  const forced = await runtime.fetchDashboardChatApi({ threadId: "team", limit: 40, __forceNetwork: true });

  expect(first.ok).toBe(true);
  expect(cached.result.messages[0].id).toBe("server-1");
  expect(forced.result.messages[0].id).toBe("server-2");
  expect(fetchCount).toBe(2);
  expect(capturedUrls).toEqual([
    "/api/chat?limit=40&threadId=team",
    "/api/chat?limit=40&threadId=team",
  ]);
});

test("chat API GET paces different read queries through one client budget", async () => {
  const startedAt = [];
  const runtime = createDashboardChatApiDomainRuntime({
    chatApiReadDedupeWindowMs: 0,
    chatApiReadMinimumGapMs: 25,
    getCurrentPlatformUser: () => ({ id: "admin-qa" }),
    getPlatformAuthStore: () => ({
      getAccessToken: async () => "token",
    }),
    fetchImpl: async () => {
      startedAt.push(Date.now());
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () => JSON.stringify({ ok: true, threads: [] }),
      };
    },
    win: {
      location: { hostname: "footballscience.xyz" },
      setTimeout,
      clearTimeout,
    },
  });

  await Promise.all([
    runtime.fetchDashboardChatApi({ view: "threads" }),
    runtime.fetchDashboardChatApi({ threadId: "team", threadType: "team" }),
  ]);

  expect(startedAt).toHaveLength(2);
  expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(20);
});

test("chat API message normalization keeps database-backed direct messages on the public thread id", () => {
  const databaseThreadId = "0c85c2d2-4814-4233-885c-31ac41ddfe9c";
  const publicThreadId = "dm:coach-qa:teammate-qa";
  const runtime = createDashboardChatApiDomainRuntime({
    normalizeDashboardMessage: (message) => message,
    normalizeDashboardChatThreadId: (rawThreadId, fallbackThreadId = "team") => {
      const threadId = String(rawThreadId || "").trim();
      const fallback = String(fallbackThreadId || "team").trim() || "team";
      if (!threadId || threadId === "team") {
        return fallback;
      }
      if (threadId.startsWith("dm:") || threadId.startsWith("group:") || threadId.startsWith("group-")) {
        return threadId;
      }
      return fallback;
    },
  });

  const message = runtime.normalizeDashboardApiMessage(
    {
      id: "message-1",
      thread_id: databaseThreadId,
      author_id: "coach-qa",
      body: "This must show in the conversation body.",
    },
    {
      id: databaseThreadId,
      type: "dm",
      message_count: 3,
      metadata: { legacyThreadId: publicThreadId },
    }
  );

  expect(message.threadId).toBe(publicThreadId);
  expect(message.text).toBe("This must show in the conversation body.");
});

test("notification cursor survives reload when API replaces the local message id", () => {
  const currentUser = { id: "coach-qa", firstName: "Casey", lastName: "Coach", status: "active" };
  const sender = { id: "teammate-qa", firstName: "Taylor", lastName: "Teammate", status: "active" };
  const threadId = "dm:coach-qa:teammate-qa";
  const createdAt = "2026-05-24T10:00:00.000Z";
  const seenAt = Date.parse("2026-05-24T10:00:05.000Z");
  const toasts = [];
  let cursor = {
    lastMessageId: "local-temp-message",
    userId: sender.id,
    threadId,
    seenAt,
    messageCreatedAtMs: Date.parse(createdAt),
    threads: {
      [threadId]: {
        lastMessageId: "local-temp-message",
        userId: sender.id,
        threadId,
        seenAt,
        messageCreatedAtMs: Date.parse(createdAt),
      },
    },
  };
  const apiThread = {
    threadId,
    lastMessage: {
      id: "api-final-message",
      userId: sender.id,
      threadId,
      text: "Reload should not show this again",
      createdAt,
      status: "sent",
    },
  };

  const runtime = createDashboardChatWidgetRuntime({
    getCurrentPlatformUser: () => currentUser,
    getPlatformUsers: () => [currentUser, sender],
    readDashboardMessages: () => [],
    readDashboardChatWidgetNotificationState: () => ({ enabled: true, level: "all" }),
    readDashboardChatWidgetState: () => ({ isOpen: false, selectedThreadId: "team" }),
    readDashboardChatWidgetNotificationCursor: () => cursor,
    writeDashboardChatWidgetNotificationCursor: (nextCursor) => {
      cursor = {
        ...nextCursor,
        threads: {
          ...(cursor.threads || {}),
          [nextCursor.threadId]: nextCursor,
        },
      };
    },
    getDashboardApiThreads: () => [apiThread],
    normalizeDashboardApiMessage: (message, thread) => ({ ...message, threadId: message.threadId || thread.threadId }),
    getDashboardMessageCreatedAtMs: (message) => Date.parse(message.createdAt || ""),
    normalizeDashboardChatThreadId: (value, fallback = "team") => value || fallback,
    isDashboardChatThreadActivelyViewed: () => false,
    formatDashboardChatThreadLabel: () => "Taylor Teammate",
    formatUserName: (user = {}) => `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Staff",
    ui: {
      dashboardChatWidgetRoot: {
        querySelector: () => ({
          hidden: true,
          textContent: "",
          dataset: {},
        }),
      },
    },
    win: {
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
  });

  runtime.showDashboardChatWidgetToast = (message) => toasts.push(message);
  runtime.syncDashboardChatWidgetNotificationCursor();

  expect(toasts).toEqual([]);
  expect(cursor.threads[threadId].lastMessageId).toBe("local-temp-message");
  expect(cursor.threads[threadId].messageCreatedAtMs).toBe(Date.parse(createdAt));
});
