import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chatApi = require("../api/chat.js");
const { applyChatActionToState, filterChatStateForActor } = chatApi._private;

const appSource = readFileSync(path.join(__dirname, "../app.js"), "utf8");
const rendererSource = readFileSync(path.join(__dirname, "../src/modules/chat/chat-widget-renderer.mjs"), "utf8");
const chatCssSource = readFileSync(path.join(__dirname, "../dashboard-chat.css"), "utf8");

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
  expect(appSource).toContain("markDashboardMessagesReadForCurrentUser");
  expect(appSource).toContain("previousThreadListScrollTop");
  expect(appSource).toContain("previousChatListWasAtBottom");

  expect(rendererSource).toContain("data-dashboard-chat-message-retry");
  expect(rendererSource).toContain("data-dashboard-chat-mobile-back");
  expect(rendererSource).toContain("dashboard-chat-attachment-library");
  expect(rendererSource).toContain("dashboard-chat-search-hit");
  expect(rendererSource).toContain("groupedWithNext");

  expect(chatCssSource).toContain("dashboard-chat-message.is-pending");
  expect(chatCssSource).toContain("dashboard-chat-message.is-failed");
  expect(chatCssSource).toContain("dashboard-chat-attachment-library");
  expect(chatCssSource).toContain("dashboard-chat-widget.is-mobile-conversation");
});
