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
