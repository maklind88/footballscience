import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

test("theme foundation loads after legacy styles and owns core tokens", () => {
  const index = read("index.html");
  const foundation = read("platform-theme-foundation.css");
  const packageJson = JSON.parse(read("package.json"));

  expect(index).toContain("platform-theme-foundation.css");
  expect(index.indexOf("platform-theme-foundation.css")).toBeGreaterThan(index.indexOf("appearance-governance.css"));
  expect(packageJson.scripts["theme:audit"]).toBe("node scripts/verify-theme-foundation.mjs");
  expect(packageJson.scripts["qa:theme"]).toContain("qa/theme-dark-mode.smoke.spec.mjs");

  for (const token of [
    "--fs-bg",
    "--fs-surface",
    "--fs-surface-soft",
    "--fs-text",
    "--fs-text-muted",
    "--fs-border",
    "--fs-accent",
    "--fs-success",
    "--fs-warning",
    "--fs-danger",
  ]) {
    expect(foundation).toContain(token);
  }

  for (const selector of [
    "body.is-dark-mode",
    ".platform-content",
    ".platform-sidebar",
    ".dashboard-chat-widget",
    ".scouting-workspace",
    ".video-analysis-workspace",
    ".idp-shell",
    "input, select, textarea",
  ]) {
    expect(foundation).toContain(selector);
  }
});

test("theme guard is present and supports strict mode for future hard-coded colors", () => {
  const guard = read("scripts/verify-theme-foundation.mjs");
  const docs = read("docs/THEME_GOVERNANCE.md");

  expect(guard).toContain("THEME_GUARD_STRICT");
  expect(guard).toContain("platform-theme-foundation.css");
  expect(guard).toContain("New hard-coded color outside theme foundation");
  expect(docs).toContain("Dark Mode Foundation v1");
  expect(docs).toContain("Do not add new hard-coded colors");
});
