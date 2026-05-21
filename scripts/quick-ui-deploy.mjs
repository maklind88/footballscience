import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function parseArgs(argv) {
  const options = {
    skipPush: false,
  };
  for (const arg of argv) {
    if (arg === "--skip-push") {
      options.skipPush = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Quick UI deploy

Usage:
  npm run deploy:ui

Deploys a clean, committed Fast UI Lane change quickly:
  1. requires main
  2. pulls/rebases origin/main
  3. runs npm run quick:ui
  4. pushes main unless --skip-push is used
  5. checks release traffic
  6. deploys production through Vercel CLI
  7. runs production postdeploy verification
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const branchName = capture("git", ["branch", "--show-current"]);
if (branchName !== "main") {
  throw new Error(`Quick UI deploy must run from main, not ${branchName || "detached HEAD"}.`);
}

const status = capture("git", ["status", "--porcelain"]);
if (status) {
  console.error(status);
  throw new Error("Quick UI deploy requires a clean worktree. Commit or set aside changes first.");
}

console.log("Quick UI deploy");
run("git", ["fetch", "origin"]);
run("git", ["pull", "--rebase", "origin", "main"]);
run("npm", ["run", "quick:ui"]);
if (!options.skipPush) {
  run("git", ["push", "origin", "HEAD:main"]);
}
run("npm", ["run", "release:traffic"]);
run("npx", ["--yes", "vercel@53.2.0", "deploy", "--prod", "--yes"]);
run("npm", ["run", "release:postdeploy"]);
console.log("Quick UI deploy: ok");
