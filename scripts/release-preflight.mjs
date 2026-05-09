import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowDirty = process.env.RELEASE_ALLOW_DIRTY === "1";
const allowUnpushed = process.env.RELEASE_ALLOW_UNPUSHED === "1";
const failures = [];
const warnings = [];

function git(args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function requireFile(relativePath, label = relativePath) {
  if (!fs.existsSync(path.join(rootDir, relativePath))) {
    failures.push(`${label} is missing.`);
  }
}

requireFile("package-lock.json", "package-lock.json");
requireFile("vercel.json", "vercel.json");
requireFile(".github/workflows/qa.yml", "GitHub QA workflow");
requireFile(".github/workflows/supabase-migrations.yml", "Supabase migration workflow");
requireFile("qa/live.playwright.config.mjs", "live QA config");
requireFile("qa/production.live.spec.mjs", "production live smoke test");

const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
const status = tryGit(["status", "--porcelain"]);
if (status && !allowDirty) {
  failures.push("Working tree has uncommitted changes. Commit or stash before release, or set RELEASE_ALLOW_DIRTY=1 for an emergency hotfix.");
}

const upstream = tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
if (!upstream) {
  warnings.push(`Branch ${branch} has no upstream configured.`);
} else {
  const [behind = "0", ahead = "0"] = tryGit(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]).split(/\s+/);
  if (Number(behind) > 0) {
    failures.push(`Branch ${branch} is behind ${upstream} by ${behind} commit(s). Pull/rebase before release.`);
  }
  if (Number(ahead) > 0 && !allowUnpushed) {
    failures.push(`Branch ${branch} has ${ahead} unpushed commit(s). Push to GitHub before release, or set RELEASE_ALLOW_UNPUSHED=1 for an emergency hotfix.`);
  }
}

if (!process.env.LIVE_QA_USERNAME || !process.env.LIVE_QA_PASSWORD) {
  warnings.push("LIVE_QA_USERNAME/LIVE_QA_PASSWORD are not set, so npm run qa:live will skip production login smoke.");
}

console.log("Release preflight");
console.log(`- branch: ${branch}`);
console.log(`- upstream: ${upstream || "none"}`);
console.log(`- clean working tree: ${status ? "no" : "yes"}`);
warnings.forEach((warning) => console.warn(`- warning: ${warning}`));

if (failures.length) {
  console.error("\nRelease preflight failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("- status: ok");
}
