import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withReleaseLock } from "./lib/release-lock.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function capture(command, args = []) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function run(command, args = []) {
  const label = [command, ...args].join(" ");
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function printHelp() {
  console.log(`Quick UI deploy

Usage:
  npm run deploy:ui

Deploys a clean, committed Fast UI Lane change quickly:
  1. requires main or an isolated codex/* branch
  2. fetches origin/main and rebases when needed
  3. runs npm run quick:ui -- --from origin/main
  4. pushes the codex/* branch when applicable
  5. fast-forwards origin/main to the exact release SHA
  6. checks release traffic
  7. deploys production through Vercel CLI
  8. repairs staging alias drift and runs production postdeploy verification
`);
}

function parseArgs(argv) {
  const options = { help: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--skip-push") {
      throw new Error("--skip-push is not allowed for production deploys because Live must match origin/main.");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function requireCleanWorkingTree(context) {
  const status = capture("git", ["status", "--porcelain"]);
  if (!status) return;
  console.error(status);
  throw new Error(`${context} requires a clean worktree. Commit or set aside changes first.`);
}

function assertBranchCanFastDeploy(branchName) {
  if (branchName === "main" || branchName.startsWith("codex/")) return;
  throw new Error(`Quick UI deploy must run from main or an isolated codex/* branch, not ${branchName || "detached HEAD"}.`);
}

function publishReleaseShaToMain(releaseSha) {
  const originMain = capture("git", ["rev-parse", "origin/main"]);
  const mergeBase = capture("git", ["merge-base", "origin/main", releaseSha]);
  if (mergeBase !== originMain) {
    throw new Error("Quick UI deploy requires the release SHA to contain current origin/main. Rebase first.");
  }

  run("git", ["push", "origin", "HEAD:main"]);
  run("git", ["fetch", "origin", "main"]);
  const publishedMain = capture("git", ["rev-parse", "origin/main"]);
  if (publishedMain !== releaseSha) {
    throw new Error("origin/main did not fast-forward to the exact release SHA; production deploy stopped.");
  }
  console.log(`- main: fast-forwarded to ${releaseSha.slice(0, 12)}`);
}

async function runQuickUiDeploy() {
  const branchName = capture("git", ["branch", "--show-current"]);
  assertBranchCanFastDeploy(branchName);
  requireCleanWorkingTree("Quick UI deploy");

  console.log("Quick UI deploy");
  run("git", ["fetch", "origin"]);
  if (branchName === "main") {
    run("git", ["pull", "--rebase", "origin", "main"]);
  } else {
    run("git", ["rebase", "origin/main"]);
    run("git", ["push", "--force-with-lease", "origin", `HEAD:${branchName}`]);
  }

  run("npm", ["run", "quick:ui", "--", "--from", "origin/main"]);
  const releaseSha = capture("git", ["rev-parse", "HEAD"]);
  publishReleaseShaToMain(releaseSha);
  run("npm", ["run", "release:traffic"]);
  run("npm", ["run", "release:staging-isolation"]);
  run("npx", ["--yes", "vercel@53.2.0", "deploy", "--prod", "--yes"]);
  run("npm", ["run", "release:staging-isolation:repair"]);
  run("npm", ["run", "release:postdeploy"]);
  console.log("Quick UI deploy: ok");
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }

  await withReleaseLock({ rootDir, command: ["node", "scripts/quick-ui-deploy.mjs", ...args].join(" ") }, runQuickUiDeploy);
}

main().catch((error) => {
  console.error(`\nQuick UI deploy stopped: ${error.message}`);
  process.exitCode = 1;
});
