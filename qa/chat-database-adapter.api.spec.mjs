import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const chatDatabase = require("../api/_lib/chat-database.js");

test("chat database adapter is database-first and requires an explicit emergency legacy flag", () => {
  const previous = process.env.CHAT_STORAGE_MODE;
  const previousAllowLegacy = process.env.CHAT_ALLOW_LEGACY_STORAGE_FALLBACK;
  delete process.env.CHAT_STORAGE_MODE;
  delete process.env.CHAT_ALLOW_LEGACY_STORAGE_FALLBACK;

  expect(chatDatabase.isDatabaseChatEnabled()).toBe(true);

  process.env.CHAT_STORAGE_MODE = "database";
  expect(chatDatabase.isDatabaseChatEnabled()).toBe(true);

  process.env.CHAT_STORAGE_MODE = "legacy";
  expect(chatDatabase.isDatabaseChatEnabled()).toBe(true);

  process.env.CHAT_ALLOW_LEGACY_STORAGE_FALLBACK = "1";
  expect(chatDatabase.isDatabaseChatEnabled()).toBe(false);

  if (previous === undefined) {
    delete process.env.CHAT_STORAGE_MODE;
  } else {
    process.env.CHAT_STORAGE_MODE = previous;
  }
  if (previousAllowLegacy === undefined) {
    delete process.env.CHAT_ALLOW_LEGACY_STORAGE_FALLBACK;
  } else {
    process.env.CHAT_ALLOW_LEGACY_STORAGE_FALLBACK = previousAllowLegacy;
  }
});

test("chat database adapter keeps staff-only baseline", () => {
  expect(chatDatabase._private.canUseChat({ role: "guest" })).toBe(false);
  expect(chatDatabase._private.canUseChat({ role: "player" })).toBe(false);
  expect(chatDatabase._private.canUseChat({ role: "coach" })).toBe(true);
  expect(chatDatabase._private.canUseChat({ role: "medical" })).toBe(true);
});

test("chat database adapter normalizes message constraints", () => {
  expect(chatDatabase._private.normalizeMessageText("  hello\r\nteam  ")).toBe("hello\nteam");
  expect(chatDatabase._private.normalizeMessageText("x".repeat(1800))).toHaveLength(1600);
  expect(chatDatabase._private.normalizePriority("urgent")).toBe("urgent");
  expect(chatDatabase._private.normalizePriority("unknown")).toBe("normal");
  expect(chatDatabase._private.normalizeThreadType("matchday")).toBe("matchday");
  expect(chatDatabase._private.normalizeThreadType("announcement")).toBe("announcement");
});

test("chat database adapter exposes persisted thread settings action", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/_lib/chat-database.js"), "utf8");

  expect(source).toContain("setThreadSettings: 30");
  expect(source).toContain("async function setThreadSettings");
  expect(source).toContain("metadata.settingsByUser = settingsByUser");
  expect(source).toContain("metadata.threadSettingsUpdatedAt = now");
  expect(source).toContain("result = await setThreadSettings(actor, body)");
});

test("chat database adapter exposes server-side participant management", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/_lib/chat-database.js"), "utf8");

  expect(source).toContain("setThreadParticipants: 12");
  expect(source).toContain("async function setThreadParticipants");
  expect(source).toContain("Team chat participants are managed by team membership");
  expect(source).toContain("chat_thread_participants");
  expect(source).toContain("participantClientPayload");
  expect(source).toContain("result = await setThreadParticipants(actor, body)");
});

test("chat database adapter exposes WhatsApp-style private and group actions", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/_lib/chat-database.js"), "utf8");

  expect(source).toContain("deleteMessageForMe: 30");
  expect(source).toContain("forwardMessage: 24");
  expect(source).toContain("setThreadUserState: 30");
  expect(source).toContain("leaveThread: 10");
  expect(source).toContain("async function deleteMessageForMe");
  expect(source).toContain("async function forwardMessage");
  expect(source).toContain("async function setThreadUserState");
  expect(source).toContain("async function leaveThread");
  expect(source).toContain("chat_message_user_states");
  expect(source).toContain('operation === "delete"');
  expect(source).toContain('normalizeParticipantRole(actorParticipant?.participant_role) === "owner"');
  expect(source).toContain("result = await deleteMessageForMe(actor, body)");
  expect(source).toContain("result = await forwardMessage(actor, body)");
  expect(source).toContain("result = await setThreadUserState(actor, body)");
  expect(source).toContain("result = await leaveThread(actor, body)");
});

test("chat database adapter allows video attachments through API and storage contracts", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/_lib/chat-database.js"), "utf8");

  expect(source).toContain('"video/mp4"');
  expect(source).toContain('"video/quicktime"');
  expect(source).toContain('"video/webm"');
  expect(source).toContain('"video/x-m4v"');
  expect(source).toContain('"mp4", "mov", "m4v", "webm"');
});

test("chat moderation endpoint supports admin filters", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/_lib/chat-database.js"), "utf8");

  expect(source).toContain("const auditAction");
  expect(source).toContain("action=in.(\"chat.deleteMessage\",\"chat.clearThread\")");
  expect(source).toContain("admin_action=eq.true");
  expect(source).toContain("destructive=eq.true");
  expect(source).toContain("failedUploads");
  expect(source).toContain("status=in.(failed,error)");
  expect(source).toContain('const includeFailedUploads = auditAction === "all" || auditAction === "failed-uploads"');
  expect(source).toContain("auditToDate.setUTCHours(23, 59, 59, 999)");
});

test("chat database adapter fails fast when Supabase is busy", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/_lib/chat-database.js"), "utf8");
  const apiSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/chat.js"), "utf8");

  expect(source).toContain("CHAT_DB_REQUEST_TIMEOUT_MS");
  expect(source).toContain("AbortSignal.timeout");
  expect(source).toContain("Chat database is temporarily busy. Please try again.");
  expect(source).toContain("throw createDatabaseError(result)");
  expect(apiSource).toContain("status >= 400 && status < 600 ? status : 500");
});

test("chat database adapter batches message enrichment for read-heavy views", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../api/_lib/chat-database.js"), "utf8");

  expect(source).toContain("THREAD_READ_MODEL_SELECT");
  expect(source).toContain("async function readThreadReadModelRows");
  expect(source).toContain("const missingLastMessageIds");
  expect(source).toContain("const readModelEnrichment = buildMessageEnrichment");
  expect(source).toContain("fallbackLastMessageEnrichment");
  expect(source).toContain("function buildMessageEnrichment");
  expect(source).toContain("async function loadMessageEnrichment");
  expect(source).toContain("return threads.map((thread) => {");
  expect(source).toContain("const visibleMessages = await filterMessagesForActorByThread");
  expect(source).toContain("shouldShowThreadForActor");
  expect(source).toContain("readHiddenMessageStateRows");
  expect(source).not.toContain("await enrichMessages([lastMessage], thread)");
  expect(source).not.toContain("for (const message of messages.reverse())");
});
