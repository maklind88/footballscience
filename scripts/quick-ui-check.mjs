import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const riskyPatterns = [
  /^\.github\//,
  /^api\//,
  /^package-lock\.json$/,
  /^scripts\/(?!quick-ui-check\.mjs$|quick-ui-deploy\.mjs$)/,
  /^src\/core\//,
  /^supabase\//,
  /^vercel\.json$/,
];
const cautionPatterns = [
  /^app\.js$/,
  /^package\.json$/,
  /^scripts\/quick-ui-check\.mjs$/,
  /^scripts\/quick-ui-deploy\.mjs$/,
  /^src\/modules\//,
];

function parseArgs(argv) {
  const options = {
    allowRisky: false,
    from: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-risky") {
      options.allowRisky = true;
    } else if (arg === "--from") {
      options.from = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Quick UI check

Usage:
  npm run quick:ui
  npm run quick:ui -- --from origin/main

Options:
  --from REF       When the worktree is clean, validate changed files from REF...HEAD.
  --allow-risky   Allow risky paths for workflow/tooling changes. Do not use for normal UI polish.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function capture(command, args = []) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryCapture(command, args = []) {
  try {
    return capture(command, args);
  } catch {
    return "";
  }
}

function run(command, args = []) {
  const label = [command, ...args].join(" ");
  console.log(`> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function getUpstreamRef() {
  return tryCapture("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || "origin/main";
}

function getChangedFiles(options) {
  const files = new Set([
    ...splitLines(tryCapture("git", ["diff", "--name-only"])),
    ...splitLines(tryCapture("git", ["diff", "--name-only", "--cached"])),
    ...splitLines(tryCapture("git", ["ls-files", "--others", "--exclude-standard"])),
  ]);
  if (files.size > 0) {
    return { files: [...files].map(normalizePath).sort(), source: "worktree" };
  }

  const baseRef = options.from || getUpstreamRef();
  const committedFiles = splitLines(tryCapture("git", ["diff", "--name-only", `${baseRef}...HEAD`]));
  return { files: committedFiles.map(normalizePath).sort(), source: `${baseRef}...HEAD` };
}

function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => pattern.test(filePath));
}

function runDiffChecks(source) {
  if (source === "worktree") {
    run("git", ["diff", "--check"]);
    run("git", ["diff", "--cached", "--check"]);
    return;
  }
  run("git", ["diff", "--check", source]);
}

function runSyntaxChecks(files) {
  const jsFiles = files.filter((filePath) => /\.(?:cjs|js|mjs)$/i.test(filePath) && fs.existsSync(path.join(rootDir, filePath)));
  if (jsFiles.length === 0) {
    console.log("- syntax: no changed JS files");
    return;
  }
  for (const filePath of jsFiles) {
    run("node", ["--check", filePath]);
  }
}

const options = parseArgs(process.argv.slice(2));
const startedAt = Date.now();
const { files, source } = getChangedFiles(options);
const riskyFiles = files.filter((filePath) => matchesAny(filePath, riskyPatterns));
const cautionFiles = files.filter((filePath) => matchesAny(filePath, cautionPatterns) && !riskyFiles.includes(filePath));

console.log("Quick UI check");
console.log(`- source: ${source}`);
console.log(`- changed files: ${files.length}`);
files.forEach((filePath) => console.log(`  - ${filePath}`));

if (riskyFiles.length > 0 && !options.allowRisky) {
  console.error("\nQuick UI check stopped: risky files require Safe Lane validation.");
  riskyFiles.forEach((filePath) => console.error(`- ${filePath}`));
  console.error("\nUse the Safe Lane, or rerun with --allow-risky only for workflow/tooling changes.");
  process.exit(1);
}

if (riskyFiles.length > 0) {
  console.log("- risky files allowed by --allow-risky");
}
if (cautionFiles.length > 0) {
  console.log("- caution: large/shared UI files changed; add a targeted browser smoke when the visual result matters");
  cautionFiles.forEach((filePath) => console.log(`  - ${filePath}`));
}

runDiffChecks(source);
runSyntaxChecks(files);

const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Quick UI check: ok (${elapsedSeconds}s)`);
