import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboardChatApiRuntime } from "../src/modules/chat/dashboard-chat-api-runtime.mjs";
import { createDashboardChatApiDomainRuntime } from "../src/modules/chat/dashboard-chat-api-domain-runtime.mjs";
import { createDashboardChatDomainRuntime } from "../src/modules/chat/dashboard-chat-domain-runtime.mjs";
import { createDashboardChatWidgetRuntime } from "../src/modules/chat/dashboard-chat-widget-runtime.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chatApi = require("../api/chat.js");
const { applyChatActionToState, filterChatStateForActor } = chatApi._private;

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
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatStorageKey, "[]")');
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatDeletedMessageIdsStorageKey, "[]")');
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatWidgetNotificationCursorStorageKey, "{}")');
  expect(appSource).not.toContain('localStorage.setItem(dashboardChatWidgetNotificationStateStorageKey, "{}")');
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
  expect(rendererSource).toContain("groupedWithNext");
  expect(rendererSource).toContain("MESSAGE_GROUP_WINDOW_MS = 15 * 60 * 1000");

  expect(chatCssSource).toContain("dashboard-chat-message.is-pending");
  expect(chatCssSource).toContain("dashboard-chat-message.is-failed");
  expect(chatCssSource).toContain("dashboard-chat-attachment-library");
  expect(chatCssSource).toContain("dashboard-chat-details-section-head");
  expect(chatCssSource).toContain("dashboard-chat-moderation-filters");
  expect(chatCssSource).toContain("dashboard-chat-search-nav");
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

test("closed chat widget does not queue background API summaries", () => {
  let summaryRefreshCount = 0;
  let widgetState = { isOpen: false, selectedThreadId: "team" };
  const runtime = createDashboardChatWidgetRuntime({
    dashboardChatWidgetRenderer: {
      render: () => ({ html: "<button data-dashboard-chat-widget-toggle></button>", activeThreadId: "team", replyDraft: null }),
    },
    getCurrentPlatformUser: () => ({ id: "admin-qa", firstName: "Admin", lastName: "QA" }),
    getPlatformUsers: () => [{ id: "admin-qa", firstName: "Admin", lastName: "QA", status: "active" }],
    getDashboardChatThreadList: () => [{ threadId: "team", label: "Team Chat" }],
    readDashboardChatWidgetState: () => widgetState,
    queueDashboardChatThreadSummaryRefresh: () => {
      summaryRefreshCount += 1;
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
  expect(summaryRefreshCount).toBe(0);

  widgetState = { isOpen: true, selectedThreadId: "team" };
  runtime.renderDashboardChatWidget();
  expect(summaryRefreshCount).toBe(1);
});

test("closed chat runtime does not queue realtime recovery reads", async () => {
  let fetchCount = 0;
  let summaryTimer = 0;
  let apiTimer = 0;
  const runtime = createDashboardChatApiRuntime({
    fetchDashboardChatApi: async () => {
      fetchCount += 1;
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
  expect(fetchCount).toBe(0);
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
