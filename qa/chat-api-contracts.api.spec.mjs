import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const chatApi = require("../api/chat.js");
const {
  applyChatActionToState,
  applyRetentionPolicy,
  canUseChat,
  filterChatStateForActor,
  normalizeMessageText,
} = chatApi._private;

const staffActor = {
  id: "coach-1",
  email: "coach@example.com",
  firstName: "Casey",
  lastName: "Coach",
  username: "casey.coach",
  role: "coach",
};

const adminActor = {
  ...staffActor,
  id: "admin-1",
  email: "admin@example.com",
  role: "admin",
};

test("chat action layer excludes guests", () => {
  expect(canUseChat({ id: "guest-1", role: "guest" })).toBe(false);
  expect(canUseChat(staffActor)).toBe(true);
});

test("sendMessage normalizes length and redacts body text from audit", () => {
  const result = applyChatActionToState(
    {},
    staffActor,
    {
      action: "sendMessage",
      threadId: "team",
      text: `@analyst ${"x".repeat(1700)}`,
      priority: "high",
    },
    { now: "2026-05-07T12:00:00.000Z" }
  );

  expect(result.ok).toBe(true);
  expect(result.message.text).toHaveLength(1600);
  expect(result.message.mentions).toContain("analyst");
  expect(result.state.audit[0].details.textLength).toBe(1600);
  expect(JSON.stringify(result.state.audit[0])).not.toContain("x".repeat(80));
});

test("clearThread is admin-only and soft-deletes messages", () => {
  const seed = applyChatActionToState(
    {},
    staffActor,
    { action: "sendMessage", threadId: "team", text: "Team update" },
    { now: "2026-05-07T12:00:00.000Z" }
  ).state;

  const denied = applyChatActionToState(
    seed,
    staffActor,
    { action: "clearThread", threadId: "team" },
    { now: "2026-05-07T12:01:00.000Z" }
  );

  expect(denied.ok).toBe(false);
  expect(denied.status).toBe(403);

  const cleared = applyChatActionToState(
    seed,
    adminActor,
    { action: "clearThread", threadId: "team" },
    { now: "2026-05-07T12:02:00.000Z" }
  );

  expect(cleared.ok).toBe(true);
  expect(cleared.state.messages[0].isDeleted).toBe(true);
  expect(cleared.state.messages[0].text).toBe("");
});

test("participant filtering protects dm threads", () => {
  const state = {
    threads: [
      { id: "team", type: "team", title: "Team" },
      { id: "dm-secret", type: "dm", participantIds: ["other-user"] },
      { id: "dm-empty", type: "dm", participantIds: [] },
    ],
    messages: [
      { id: "m1", threadId: "team", text: "Open staff note" },
      { id: "m2", threadId: "dm-secret", text: "Private note" },
      { id: "m3", threadId: "dm-empty", text: "Missing participants" },
    ],
  };

  const filtered = filterChatStateForActor(state, staffActor);

  expect(filtered.threads.map((thread) => thread.id)).toEqual(["team"]);
  expect(filtered.messages.map((message) => message.id)).toEqual(["m1"]);
});

test("message text trimming is stable", () => {
  expect(normalizeMessageText("  hello\r\nteam  ")).toBe("hello\nteam");
});

test("pin, priority, reactions, and read receipts follow server rules", () => {
  const sent = applyChatActionToState(
    {},
    staffActor,
    { action: "sendMessage", threadId: "team", text: "Pin this for matchday" },
    { now: "2026-05-07T12:00:00.000Z" }
  );

  const messageId = sent.message.id;
  const pinned = applyChatActionToState(
    sent.state,
    staffActor,
    { action: "setMessagePinned", messageId, pinned: true },
    { now: "2026-05-07T12:01:00.000Z" }
  );

  expect(pinned.ok).toBe(true);
  expect(pinned.message.pinned).toBe(true);
  expect(pinned.state.audit[0].adminAction).toBe(true);

  const priority = applyChatActionToState(
    pinned.state,
    staffActor,
    { action: "setMessagePriority", messageId, priority: "urgent" },
    { now: "2026-05-07T12:02:00.000Z" }
  );

  expect(priority.ok).toBe(true);
  expect(priority.message.priority).toBe("urgent");

  const reacted = applyChatActionToState(
    priority.state,
    staffActor,
    { action: "addReaction", messageId, reaction: "like" },
    { now: "2026-05-07T12:03:00.000Z" }
  );

  expect(reacted.ok).toBe(true);
  expect(reacted.message.reactions.like).toContain(staffActor.id);

  const unread = applyChatActionToState(
    reacted.state,
    staffActor,
    { action: "markThreadRead", threadId: "team" },
    { now: "2026-05-07T12:04:00.000Z" }
  );

  expect(unread.ok).toBe(true);
  expect(unread.state.readReceipts.team[staffActor.id]).toBe("2026-05-07T12:04:00.000Z");
});

test("non-authors cannot delete another staff message unless admin", () => {
  const otherActor = {
    ...staffActor,
    id: "analyst-1",
    email: "analyst@example.com",
    role: "analyst",
  };
  const sent = applyChatActionToState(
    {},
    staffActor,
    { action: "sendMessage", threadId: "team", text: "Owner only" },
    { now: "2026-05-07T12:00:00.000Z" }
  );

  const denied = applyChatActionToState(
    sent.state,
    otherActor,
    { action: "deleteMessage", messageId: sent.message.id },
    { now: "2026-05-07T12:01:00.000Z" }
  );

  expect(denied.ok).toBe(false);
  expect(denied.status).toBe(403);

  const adminDeleted = applyChatActionToState(
    sent.state,
    adminActor,
    { action: "deleteMessage", messageId: sent.message.id },
    { now: "2026-05-07T12:02:00.000Z" }
  );

  expect(adminDeleted.ok).toBe(true);
  expect(adminDeleted.message.isDeleted).toBe(true);
  expect(adminDeleted.state.audit[0].destructive).toBe(true);
});

test("retention prunes old active, deleted, and audit entries", () => {
  const retained = applyRetentionPolicy(
    {
      retentionPolicy: {
        activeMessageDays: 365,
        deletedMessageDays: 30,
        auditDays: 730,
        maxMessagesPerThread: 100,
      },
      threads: [{ id: "team", type: "team" }],
      messages: [
        { id: "old-active", threadId: "team", text: "too old", createdAt: "2024-01-01T00:00:00.000Z" },
        { id: "fresh-active", threadId: "team", text: "fresh", createdAt: "2026-05-01T00:00:00.000Z" },
        {
          id: "old-deleted",
          threadId: "team",
          text: "",
          isDeleted: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          deletedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      audit: [
        { id: "old-audit", createdAt: "2023-01-01T00:00:00.000Z" },
        { id: "fresh-audit", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    },
    "2026-05-07T00:00:00.000Z"
  );

  expect(retained.messages.map((message) => message.id)).toEqual(["fresh-active"]);
  expect(retained.audit.map((entry) => entry.id)).toEqual(["fresh-audit"]);
});
