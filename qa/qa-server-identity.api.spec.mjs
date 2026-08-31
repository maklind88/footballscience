import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createQaServerIdentity,
  createQaServerReadyPath,
  defaultQaPort,
  isQaServerReadyPath,
  isQaServerReadyRequest,
} from "./qa-server-identity.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("QA server identity is deterministic and worktree-specific", () => {
  const alternateRoot = path.join(rootDir, "alternate-worktree");

  expect(createQaServerIdentity(rootDir)).toMatch(/^[0-9a-f]{16}$/);
  expect(createQaServerIdentity(rootDir)).toBe(createQaServerIdentity(path.join(rootDir, ".")));
  expect(createQaServerIdentity(alternateRoot)).not.toBe(createQaServerIdentity(rootDir));
  expect(defaultQaPort(rootDir)).toBeGreaterThanOrEqual(4200);
  expect(defaultQaPort(rootDir)).toBeLessThan(5200);
});

test("QA readiness accepts only the exact worktree identity", () => {
  const readyPath = createQaServerReadyPath(rootDir);
  const foreignPath = createQaServerReadyPath(path.join(rootDir, "alternate-worktree"));

  expect(isQaServerReadyRequest(readyPath)).toBe(true);
  expect(isQaServerReadyPath(readyPath, rootDir)).toBe(true);
  expect(isQaServerReadyRequest(foreignPath)).toBe(true);
  expect(isQaServerReadyPath(foreignPath, rootDir)).toBe(false);
  expect(isQaServerReadyRequest("/")).toBe(false);
});

test("Playwright and the static server share the checkout identity contract", () => {
  const configSource = fs.readFileSync(path.join(rootDir, "qa/playwright.config.mjs"), "utf8");
  const serverSource = fs.readFileSync(path.join(rootDir, "qa/static-server.mjs"), "utf8");

  expect(configSource).toContain("defaultQaPort(rootDir)");
  expect(configSource).toContain("createQaServerReadyPath(rootDir)");
  expect(configSource).toContain("url: readyURL");
  expect(serverSource).toContain("isQaServerReadyPath(parsedUrl.pathname, rootDir)");
  expect(serverSource).toContain("QA server belongs to a different worktree.");
});
