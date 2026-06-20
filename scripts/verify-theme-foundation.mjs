import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict") || process.env.THEME_GUARD_STRICT === "1";
const failures = [];
const warnings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function requireText(filePath, expected, message) {
  if (!read(filePath).includes(expected)) failures.push(message);
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", ".vercel", "backups", "node_modules", "playwright-report", "test-results"].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else output.push(path.relative(rootDir, fullPath).replaceAll("\\", "/"));
  }
  return output;
}

function capture(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

const hardColorPattern = /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/g;
const darkPattern = /is-dark-mode|data-theme|prefers-color-scheme|color-scheme/g;
const cssFiles = walk(rootDir).filter((file) => file.endsWith(".css"));
const cssDebt = cssFiles
  .map((file) => {
    const source = read(file);
    return {
      file,
      colors: source.match(hardColorPattern)?.length || 0,
      darkRefs: source.match(darkPattern)?.length || 0,
      lines: source.split(/\r?\n/).length,
    };
  })
  .filter((row) => row.colors || row.darkRefs)
  .sort((a, b) => b.colors - a.colors);

const index = read("index.html");
const appearanceIndex = index.indexOf("appearance-governance.css");
const themeIndex = index.indexOf("platform-theme-foundation.css");
if (themeIndex === -1) failures.push("index.html must load platform-theme-foundation.css.");
if (appearanceIndex !== -1 && themeIndex !== -1 && themeIndex < appearanceIndex) {
  failures.push("platform-theme-foundation.css must load after appearance-governance.css.");
}

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
  requireText("platform-theme-foundation.css", token, `Missing theme token ${token}.`);
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
  requireText("platform-theme-foundation.css", selector, `Missing dark-mode selector coverage for ${selector}.`);
}

const diff = capture("git", ["diff", "--unified=0", "--", "*.css", "*.html", "*.mjs", "*.js"]);
let currentFile = "";
for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice("+++ b/".length);
    continue;
  }
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  if (!hardColorPattern.test(line)) {
    hardColorPattern.lastIndex = 0;
    continue;
  }
  hardColorPattern.lastIndex = 0;
  if (currentFile === "platform-theme-foundation.css") continue;
  warnings.push(`New hard-coded color outside theme foundation: ${currentFile}`);
}

const uniqueWarnings = [...new Set(warnings)].sort();
console.log("Theme foundation audit");
console.log(`- css files scanned: ${cssFiles.length}`);
console.log(`- files with color/theme debt: ${cssDebt.length}`);
console.log(`- hard-coded color references: ${cssDebt.reduce((sum, row) => sum + row.colors, 0)}`);
console.table(cssDebt.slice(0, 12));
if (uniqueWarnings.length) {
  console.warn("Theme guard warnings:");
  uniqueWarnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (strict && uniqueWarnings.length) {
  failures.push("Strict theme guard forbids new hard-coded colors outside platform-theme-foundation.css.");
}

if (failures.length) {
  console.error("Theme foundation audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Theme foundation audit: ok");
}
