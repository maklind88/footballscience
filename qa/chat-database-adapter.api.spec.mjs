import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const chatDatabase = require("../api/_lib/chat-database.js");

test("chat database adapter is database-first with explicit legacy override", () => {
  const previous = process.env.CHAT_STORAGE_MODE;
  delete process.env.CHAT_STORAGE_MODE;

  expect(chatDatabase.isDatabaseChatEnabled()).toBe(true);

  process.env.CHAT_STORAGE_MODE = "database";
  expect(chatDatabase.isDatabaseChatEnabled()).toBe(true);

  process.env.CHAT_STORAGE_MODE = "legacy";
  expect(chatDatabase.isDatabaseChatEnabled()).toBe(false);

  if (previous === undefined) {
    delete process.env.CHAT_STORAGE_MODE;
  } else {
    process.env.CHAT_STORAGE_MODE = previous;
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
