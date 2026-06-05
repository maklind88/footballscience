import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chatDatabaseSource = readFileSync(path.join(__dirname, "../api/_lib/chat-database.js"), "utf8");
const appSource = readFileSync(path.join(__dirname, "../app.js"), "utf8");
const chatApiUiActionsSource = readFileSync(path.join(__dirname, "../src/modules/chat/chat-api-ui-actions.mjs"), "utf8");
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

test("database read receipts resolve legacy thread ids before writing", () => {
  expect(chatDatabaseSource).toContain("createIfMissing === false");
  expect(chatDatabaseSource).toContain("body.thread_type");
  expect(chatDatabaseSource).toContain("const thread = await resolveThreadForAction(actor, body, { createIfMissing: false });");
  expect(chatDatabaseSource).toContain("const [threadSummary] = await enrichThreadSummaries(actor, [thread]);");
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

test("thread settings persist mute and pin while manager-gating shared identity", () => {
  const seeded = applyChatActionToState(
    {},
    staffActor,
    { action: "sendMessage", threadId: "team", text: "Settings seed" },
    { now: "2026-05-07T12:00:00.000Z" }
  ).state;

  const updated = applyChatActionToState(
    seeded,
    staffActor,
    {
      action: "setThreadSettings",
      threadId: "team",
      settings: {
        muted: true,
        pinned: true,
        customTitle: "Staff Hub",
        avatarLabel: "SH",
      },
    },
    { now: "2026-05-07T12:01:00.000Z" }
  );

  expect(updated.ok).toBe(true);
  expect(updated.thread.settings.muted).toBe(true);
  expect(updated.thread.settings.pinned).toBe(true);
  expect(updated.thread.settings.customTitle).toBe("Staff Hub");
  expect(updated.thread.settings.avatarLabel).toBe("SH");
  expect(updated.thread.settingsByUser[staffActor.id].muted).toBe(true);
  expect(updated.thread.title).toBe("Staff Hub");
  expect(updated.state.audit[0].action).toBe("chat.setThreadSettings");

  const analystActor = {
    ...staffActor,
    id: "analyst-1",
    email: "analyst@example.com",
    role: "analyst",
  };
  const personalOnly = applyChatActionToState(
    updated.state,
    analystActor,
    { action: "setThreadSettings", threadId: "team", settings: { muted: true, pinned: true } },
    { now: "2026-05-07T12:02:00.000Z" }
  );
  expect(personalOnly.ok).toBe(true);
  expect(personalOnly.thread.settingsByUser[analystActor.id].pinned).toBe(true);

  const deniedRename = applyChatActionToState(
    updated.state,
    analystActor,
    { action: "setThreadSettings", threadId: "team", settings: { customTitle: "Analyst Rename" } },
    { now: "2026-05-07T12:03:00.000Z" }
  );
  expect(deniedRename.ok).toBe(false);
  expect(deniedRename.status).toBe(403);
});

test("thread participant management is manager-only and preserves private thread scope", () => {
  const seed = applyChatActionToState(
    {},
    staffActor,
    {
      action: "createThread",
      threadId: "group:staff-room",
      type: "group",
      title: "Staff Room",
      participantIds: [staffActor.id, "analyst-1"],
    },
    { now: "2026-05-07T13:00:00.000Z" }
  ).state;

  const denied = applyChatActionToState(
    seed,
    { ...staffActor, id: "analyst-1", email: "analyst@example.com", role: "analyst" },
    { action: "setThreadParticipants", threadId: "group:staff-room", addParticipantIds: ["medical-1"] },
    { now: "2026-05-07T13:01:00.000Z" }
  );
  expect(denied.ok).toBe(false);
  expect(denied.status).toBe(403);

  const updated = applyChatActionToState(
    seed,
    staffActor,
    {
      action: "setThreadParticipants",
      threadId: "group:staff-room",
      addParticipantIds: ["medical-1"],
      removeParticipantIds: ["analyst-1"],
      participantRoles: { "medical-1": "observer" },
    },
    { now: "2026-05-07T13:02:00.000Z" }
  );

  expect(updated.ok).toBe(true);
  expect(updated.thread.participantIds).toContain(staffActor.id);
  expect(updated.thread.participantIds).toContain("medical-1");
  expect(updated.thread.participantIds).not.toContain("analyst-1");
  expect(updated.thread.participantRoles[staffActor.id]).toBe("owner");
  expect(updated.thread.participantRoles["medical-1"]).toBe("observer");
  expect(updated.state.audit[0].action).toBe("chat.setThreadParticipants");

  const teamDenied = applyChatActionToState(
    updated.state,
    staffActor,
    { action: "setThreadParticipants", threadId: "team", addParticipantIds: ["someone"] },
    { now: "2026-05-07T13:03:00.000Z" }
  );
  expect(teamDenied.ok).toBe(false);
  expect(teamDenied.status).toBe(400);
});

test("database chat group creation normalizes unsupported team visibility before insert", () => {
  expect(chatDatabaseSource).toContain("function normalizeThreadVisibility");
  expect(chatDatabaseSource).toContain('if (visibility === "team")');
  expect(chatDatabaseSource).toContain('return "members"');
  expect(chatDatabaseSource).toContain("const visibility = normalizeThreadVisibility(body.visibility, type);");
  expect(appSource).toContain('visibility: "members"');
});

test("custom database groups keep their own title instead of managed room templates", () => {
  expect(appSource).toContain("const templateByLegacyId = legacyThreadId");
  expect(appSource).toContain('const templateByManagedType = ["medical", "matchday", "training", "announcement"].includes(type)');
  expect(appSource).toContain("title: String(thread.title || thread.name || template?.title");
});

test("custom groups support top placement, avatar metadata, and safe delete", () => {
  expect(appSource).toContain("createdAt: String(thread.created_at || thread.createdAt");
  expect(appSource).toContain("Date.parse(apiThread?.createdAt || \"\")");
  expect(appSource).toContain("archiveThreadWithApi");
  expect(chatApiUiActionsSource).toContain('action: "archiveThread"');
  expect(chatDatabaseSource).toContain("async function archiveThread");
  expect(chatDatabaseSource).toContain('thread?.type !== "group"');
  expect(chatDatabaseSource).toContain("archived_at: now");
  expect(chatDatabaseSource).toContain("avatarUrl");
});

test("legacy custom groups support avatarUrl branding and archiveThread", () => {
  const created = applyChatActionToState(
    {},
    staffActor,
    {
      action: "createThread",
      threadId: "group:staff-room",
      type: "group",
      title: "Staff room",
      participantIds: ["analyst-1"],
    },
    { now: "2026-05-07T13:00:00.000Z" }
  );

  const branded = applyChatActionToState(
    created.state,
    staffActor,
    {
      action: "setThreadSettings",
      threadId: "group:staff-room",
      avatarUrl: "https://img.example/group.png",
    },
    { now: "2026-05-07T13:01:00.000Z" }
  );

  expect(branded.ok).toBe(true);
  expect(branded.thread.settings.avatarUrl).toBe("https://img.example/group.png");
  expect(branded.thread.metadata.avatarUrl).toBe("https://img.example/group.png");

  const archived = applyChatActionToState(
    branded.state,
    staffActor,
    {
      action: "archiveThread",
      threadId: "group:staff-room",
    },
    { now: "2026-05-07T13:02:00.000Z" }
  );

  expect(archived.ok).toBe(true);
  expect(archived.thread.archivedAt).toBe("2026-05-07T13:02:00.000Z");
  expect(archived.state.messages.some((message) => message.threadId === "group:staff-room")).toBe(false);
  expect(archived.state.audit[0]).toMatchObject({
    action: "chat.archiveThread",
    adminAction: true,
    destructive: true,
  });
});
