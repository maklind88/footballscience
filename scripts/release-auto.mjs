import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printHelp() {
  console.log(`Legacy stable release automation

This script is kept for backwards compatibility. Prefer:
  npm run deploy       # everyday fast deploy
  npm run deploy:safe  # risky/auth/data/security deploy

Usage:
  npm run release:auto -- --stage-all --commit "fix: message" --push --deploy
  npm run release:auto -- --commit "fix: message" --push
  npm run release:auto -- --deploy

Options:
  --stage-all          Stage all current changes with git add -A.
  --commit, -m TEXT   Commit staged changes with TEXT.
  --push              Push the current branch after selected checks pass.
  --deploy            Push if needed, run release gate, deploy to Vercel production, then verify.
                      The release gate requires main, staging/live isolation, and a matching staging tree.
  --help              Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    stageAll: false,
    commitMessage: "",
    push: false,
    deploy: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stage-all") {
      options.stageAll = true;
      continue;
    }
    if (arg === "--push") {
      options.push = true;
      continue;
    }
    if (arg === "--deploy") {
      options.deploy = true;
      options.push = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--commit" || arg === "-m") {
      options.commitMessage = String(argv[index + 1] || "").trim();
      if (!options.commitMessage) {
        throw new Error("--commit requires a commit message.");
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function run(command, args = [], options = {}) {
  const label = [command, ...args].join(" ");
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: process.env,
  });

  if (options.capture) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }

  return result.stdout || "";
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

function hasStagedChanges() {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd: rootDir,
    stdio: "ignore",
  });
  return result.status === 1;
}

function getPorcelainStatus() {
  return tryCapture("git", ["status", "--porcelain"]);
}

function requireCleanWorkingTree(context) {
  const status = getPorcelainStatus();
  if (!status) {
    return;
  }
  console.error(status);
  throw new Error(`${context} requires a clean working tree. Commit, stash, or remove unrelated changes first.`);
}

function pushCurrentBranch() {
  const branch = capture("git", ["branch", "--show-current"]);
  if (!branch) {
    throw new Error("Cannot push because the current branch could not be resolved.");
  }
  const upstream = tryCapture("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream) {
    run("git", ["push"]);
    return;
  }
  run("git", ["push", "-u", "origin", branch]);
}

function extractDeploymentUrl(output) {
  const matches = String(output || "").match(/https:\/\/[^\s]+\.vercel\.app/g);
  return matches?.[matches.length - 1] || "";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log("Stable release automation");
  console.log(`- root: ${rootDir}`);

  if (options.stageAll) {
    run("git", ["add", "-A"]);
  }

  let qaPassed = false;

  if (options.commitMessage) {
    if (!hasStagedChanges()) {
      throw new Error("No staged changes to commit. Stage intended files or pass --stage-all.");
    }
    run("npm", ["run", "qa"]);
    qaPassed = true;
    run("git", ["commit", "-m", options.commitMessage]);
  }

  if (options.push) {
    requireCleanWorkingTree("Push");
    if (!qaPassed) {
      run("npm", ["run", "qa"]);
      qaPassed = true;
    }
    pushCurrentBranch();
  }

  if (options.deploy) {
    requireCleanWorkingTree("Production deploy");
    run("npm", ["run", "release:gate"]);
    const deployOutput = run("npx", ["--yes", "vercel@53.2.0", "deploy", "--prod", "--yes"], { capture: true });
    const deploymentUrl = extractDeploymentUrl(deployOutput);
    if (deploymentUrl) {
      console.log(`\nProduction deployment: ${deploymentUrl}`);
    }
    run("npm", ["run", "release:postdeploy"]);
  }

  if (!options.commitMessage && !options.push && !options.deploy) {
    printHelp();
  }
}

main().catch((error) => {
  console.error(`\nRelease automation stopped: ${error.message}`);
  process.exitCode = 1;
});
