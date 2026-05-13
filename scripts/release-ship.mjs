import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalVercelProjectName = "footballscience";
const fullReleasePatterns = [
  /^\.github\//,
  /^api\//,
  /^app\.js$/,
  /^package-lock\.json$/,
  /^package\.json$/,
  /^scripts\/(create-incident|performance|release|run-staging|verify)/,
  /^src\/core\//,
  /^src\/modules\//,
  /^supabase\//,
  /^vercel\.json$/,
];
const fastValidation = [
  "verify:local-isolation",
  "check",
  "release:rules",
  "storage:guard",
  "security:platform",
];
const safeValidationCoverage = ["qa:contracts", "qa:browser"];
const safeValidation = ["qa"];
const releaseModeAliases = Object.freeze({
  auto: "auto",
  quick: "fast",
  full: "safe",
  fast: "fast",
  safe: "safe",
});

function printHelp() {
  console.log(`Safe Ship release automation

Usage:
  npm run deploy
  npm run release:ship -- --stage-all --commit "fix: message" --push --deploy
  npm run release:ship -- --commit "fix: message" --push
  npm run release:ship -- --mode quick
  npm run release:ship -- --mode fast
  npm run release:ship -- --mode safe

Options:
  --stage-all              Stage every current change in this worktree.
  --commit, -m TEXT        Commit staged changes with TEXT after validation passes.
  --push                   Push the current branch after validation/commit.
  --deploy                 fast mode deploys directly to production after push; safe mode uses staging -> production.
  --mode auto|fast|safe    auto chooses safe for API/data/security/module changes.
  (quick/full are aliases: quick=fast, full=safe)
  fast mode runs the minimum live safety gate, pushes main, deploys Vercel production, and verifies live.
  safe mode runs the full QA gate.
  --skip-github-wait       Push release refs without waiting for GitHub workflows.
  --help                   Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    commitMessage: "",
    deploy: false,
    help: false,
    mode: "auto",
    push: false,
    skipGithubWait: false,
    stageAll: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stage-all") {
      options.stageAll = true;
    } else if (arg === "--push") {
      options.push = true;
    } else if (arg === "--deploy") {
      options.deploy = true;
      options.push = true;
    } else if (arg === "--skip-github-wait") {
      options.skipGithubWait = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--mode") {
      options.mode = String(argv[index + 1] || "").trim().toLowerCase();
      index += 1;
    } else if (arg === "--commit" || arg === "-m") {
      options.commitMessage = String(argv[index + 1] || "").trim();
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["auto", "quick", "full", "fast", "safe"].includes(options.mode)) {
    throw new Error("--mode must be auto, quick, full, fast, or safe.");
  }
  if ((options.commitMessage === "" && argv.includes("--commit")) || (options.commitMessage === "" && argv.includes("-m"))) {
    throw new Error("--commit requires a commit message.");
  }

  return options;
}

function run(command, args = [], options = {}) {
  const label = [command, ...args].join(" ");
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: options.timeoutMs || undefined,
  });

  if (options.capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) throw result.error;
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

function git(args) {
  return capture("git", args);
}

function currentBranch() {
  const branch = git(["branch", "--show-current"]);
  if (!branch) throw new Error("The current branch could not be resolved.");
  return branch;
}

function statusLines() {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).replace(/\n$/, "");
  return status ? status.split("\n").filter(Boolean) : [];
}

function changedPaths() {
  return [...new Set(statusLines().map((line) => line.slice(3).trim().replace(/^.* -> /, "")))].sort();
}

function stagedPaths() {
  const output = tryCapture("git", ["diff", "--cached", "--name-only"]);
  return output ? output.split("\n").filter(Boolean).sort() : [];
}

function branchDiffPaths() {
  const baseRef = tryCapture("git", ["rev-parse", "--verify", "origin/main"]);
  if (!baseRef) return [];
  const output = tryCapture("git", ["diff", "--name-only", "origin/main...HEAD"]);
  return output ? output.split("\n").filter(Boolean).sort() : [];
}

function hasStagedChanges() {
  return spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: rootDir, stdio: "ignore" }).status === 1;
}

function requireCleanWorkingTree(context) {
  const status = statusLines();
  if (status.length) {
    console.error(status.join("\n"));
    throw new Error(`${context} requires a clean worktree.`);
  }
}

function normalizeMode(mode) {
  const normalized = releaseModeAliases[String(mode).toLowerCase()];
  if (!normalized) {
    throw new Error(`Unknown release mode: ${mode}`);
  }
  return normalized;
}

function classifyReleaseMode(paths, requestedMode) {
  const normalizedMode = normalizeMode(requestedMode);
  if (normalizedMode !== "auto") return normalizedMode;
  return paths.some((file) => fullReleasePatterns.some((pattern) => pattern.test(file))) ? "safe" : "fast";
}

function releasePaths(options) {
  const localPaths = changedPaths();
  if (localPaths.length) return localPaths;

  const staged = stagedPaths();
  if (staged.length) return staged;

  if (options.push || options.deploy) return branchDiffPaths();
  return [];
}

function runValidation(mode) {
  if (mode === "safe") {
    for (const scriptName of safeValidation) {
      run("npm", ["run", scriptName]);
    }
    return;
  }

  for (const scriptName of fastValidation) {
    run("npm", ["run", scriptName]);
  }
}

function verifyVercelReleaseTraffic() {
  run("npm", ["run", "release:traffic"]);
}

function requireCanonicalVercelProjectLink() {
  const projectFile = path.join(rootDir, ".vercel", "project.json");
  if (!fs.existsSync(projectFile)) {
    throw new Error(
      `Deploy requires .vercel/project.json linked to ${canonicalVercelProjectName}. ` +
        `Run "vercel link --project ${canonicalVercelProjectName}" or copy the canonical .vercel/project.json before deploying.`,
    );
  }

  let project;
  try {
    project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  } catch (error) {
    throw new Error(`Deploy could not read .vercel/project.json: ${error.message}`);
  }

  const projectName = String(project?.projectName || "").trim();
  if (projectName !== canonicalVercelProjectName) {
    throw new Error(
      `Deploy requires Vercel project ${canonicalVercelProjectName}, but this worktree is linked to ${projectName || "unknown"}. ` +
        `Fix the Vercel link before deploying.`,
    );
  }

  console.log(`- vercel project: ${projectName}`);
}

function pushCurrentBranch() {
  const branch = currentBranch();
  if (branch === "main") {
    run("git", ["push", "origin", "HEAD:main"]);
    return;
  }

  run("git", ["push", "--force-with-lease", "origin", `HEAD:${branch}`]);
}

function syncReleaseBranchWithMain() {
  requireCleanWorkingTree("Sync with main");
  run("git", ["fetch", "origin"]);

  const branch = currentBranch();
  const behindMain = Number(tryCapture("git", ["rev-list", "--count", "HEAD..origin/main"]) || "0");
  if (!behindMain) {
    console.log("- main sync: already current");
    return false;
  }

  if (branch === "main") {
    run("git", ["merge", "--ff-only", "origin/main"]);
    console.log("- main sync: fast-forwarded main");
    return true;
  }

  run("git", ["rebase", "origin/main"]);
  console.log(`- main sync: rebased ${branch} onto origin/main`);
  return true;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listWorkflowRuns(workflow, branch, sha) {
  const output = capture("gh", [
    "run",
    "list",
    "--workflow",
    workflow,
    "--branch",
    branch,
    "--commit",
    sha,
    "--json",
    "conclusion,databaseId,status,url,workflowName",
    "--limit",
    "5",
  ]);
  return JSON.parse(output || "[]");
}

function waitForWorkflow(workflow, branch, sha, timeoutMinutes = 45) {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let lastUrl = "";

  while (Date.now() < deadline) {
    const [runInfo] = listWorkflowRuns(workflow, branch, sha);
    if (!runInfo) {
      console.log(`Waiting for ${workflow} to start on ${branch} (${sha.slice(0, 7)})...`);
      sleep(15_000);
      continue;
    }

    lastUrl = runInfo.url || lastUrl;
    console.log(`${workflow}: ${runInfo.status}${runInfo.conclusion ? ` / ${runInfo.conclusion}` : ""}`);
    if (runInfo.status === "completed") {
      if (runInfo.conclusion === "success") return runInfo;
      throw new Error(`${workflow} finished with ${runInfo.conclusion || "unknown"}: ${lastUrl}`);
    }

    sleep(20_000);
  }

  throw new Error(`${workflow} did not complete within ${timeoutMinutes} minutes.${lastUrl ? ` ${lastUrl}` : ""}`);
}

function deployThroughGithub(options) {
  requireCleanWorkingTree("Deploy");
  const sha = git(["rev-parse", "HEAD"]);

  run("git", ["push", "--force-with-lease", "origin", "HEAD:staging"]);
  if (!options.skipGithubWait) {
    waitForWorkflow("Staging Deploy", "staging", sha);
  }

  run("git", ["push", "origin", "HEAD:main"]);
  if (!options.skipGithubWait) {
    waitForWorkflow("QA", "main", sha);
    run("gh", ["workflow", "run", "production-deploy.yml", "--ref", "main"]);
    waitForWorkflow("Production Deploy", "main", sha);
  }

  run("npm", ["run", "release:postdeploy"]);
}

function extractDeploymentUrl(output) {
  const matches = String(output || "").match(/https:\/\/[^\s]+\.vercel\.app/g);
  return matches?.[matches.length - 1] || "";
}

function deployDirectProduction() {
  requireCleanWorkingTree("Fast production deploy");
  requireCanonicalVercelProjectLink();
  const deployOutput = run("npx", ["--yes", "vercel@53.2.0", "deploy", "--prod", "--yes"], { capture: true });
  const deploymentUrl = extractDeploymentUrl(deployOutput);
  if (deploymentUrl) {
    console.log(`\nFast production deployment: ${deploymentUrl}`);
  }
  run("npm", ["run", "release:postdeploy"]);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }
  if (!args.length) {
    printHelp();
    return;
  }

  console.log("Safe Ship release automation");
  console.log(`- root: ${rootDir}`);

  if (options.stageAll) run("git", ["add", "-A"]);

  if (options.deploy && !statusLines().length) {
    syncReleaseBranchWithMain();
  }

  const paths = releasePaths(options);
  const mode = classifyReleaseMode(paths, options.mode);

  console.log(`- mode: ${mode}`);
  console.log(`- changed files: ${paths.length || 0}`);
  paths.forEach((file) => console.log(`  - ${file}`));

  runValidation(mode);

  if (options.commitMessage) {
    if (!hasStagedChanges()) throw new Error("No staged changes to commit. Use --stage-all or stage intended files first.");
    run("git", ["commit", "-m", options.commitMessage]);
  }

  if (options.deploy && !statusLines().length) {
    const beforeSyncSha = git(["rev-parse", "HEAD"]);
    if (syncReleaseBranchWithMain()) {
      const afterSyncSha = git(["rev-parse", "HEAD"]);
      if (afterSyncSha !== beforeSyncSha) {
        console.log("- main sync changed the release commit; rerunning validation.");
        runValidation(mode);
      }
    }
  }

  if (options.push) {
    requireCleanWorkingTree("Push");
    pushCurrentBranch();
  }

  if (options.deploy) {
    verifyVercelReleaseTraffic();
    if (mode === "fast") {
      deployDirectProduction();
    } else {
      deployThroughGithub(options);
    }
  }

  console.log("\nSafe Ship summary");
  console.log(`- validation: ${mode}`);
  console.log(`- commit: ${options.commitMessage ? git(["rev-parse", "--short", "HEAD"]) : "not requested"}`);
  console.log(`- push: ${options.push ? "done" : "not requested"}`);
  console.log(`- deploy: ${options.deploy ? "done" : "not requested"}`);
}

main().catch((error) => {
  console.error(`\nSafe Ship stopped: ${error.message}`);
  process.exitCode = 1;
});
