import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCanonicalVercelProjectLink } from "../scripts/lib/vercel-project-link.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

test("safe ship release automation owns the staging to production flow", () => {
  const packageJson = readJson("package.json");
  const shipSource = readProjectFile("scripts/release-ship.mjs");

  expect(packageJson.scripts["check"]).toContain("scripts/release-ship.mjs");
  expect(packageJson.scripts["release:ship"]).toBe("node scripts/release-ship.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/release-automation.api.spec.mjs");
  expect(shipSource).toContain("Safe Ship release automation");
  expect(shipSource).toContain("classifyReleaseMode");
  expect(shipSource).toContain("releasePaths");
  expect(shipSource).toContain("branchDiffPaths");
  expect(shipSource).toContain("syncReleaseBranchWithMain");
  expect(shipSource).toContain("requireCanonicalVercelProjectLink");
  expect(shipSource).toContain(".vercel");
  expect(shipSource).toContain("footballscience");
  expect(shipSource).toContain('"npm"');
  expect(shipSource).toContain('"qa"');
  expect(shipSource).toContain('"qa:browser"');
  expect(shipSource).toContain('"qa:contracts"');
  expect(shipSource).toContain('"fetch"');
  expect(shipSource).toContain('"rebase"');
  expect(shipSource).toContain('"--force-with-lease"');
  expect(shipSource).toContain('"HEAD:staging"');
  expect(shipSource).toContain('"HEAD:main"');
  expect(shipSource).toContain('"Staging Deploy"');
  expect(shipSource).toContain('"Production Deploy"');
  expect(shipSource).toContain('"release:staging-isolation"');
  expect(shipSource).toContain('"release:staging-isolation:repair"');
  expect(shipSource).toContain('"release:postdeploy"');
});

test("full QA keeps complete coverage while balancing API and browser tests", () => {
  const packageJson = readJson("package.json");
  const fullQa = readProjectFile(".github/workflows/full-qa.yml");
  const qaWorkflow = readProjectFile(".github/workflows/qa.yml");
  const stagingWorkflow = readProjectFile(".github/workflows/staging-deploy.yml");
  const productionWorkflow = readProjectFile(".github/workflows/production-deploy.yml");

  expect(packageJson.scripts.qa).toBe("npm run qa:static && npm run qa:playwright");
  expect(packageJson.scripts["qa:static"]).toContain("npm run security:platform");
  expect(packageJson.scripts["qa:static"]).toContain("npm run qa:supabase");
  expect(packageJson.scripts["qa:static"]).toContain("npm run architecture:budgets");
  expect(packageJson.scripts["qa:playwright"]).toBe("playwright test --config=qa/playwright.config.mjs");
  expect(packageJson.scripts["qa:playwright:ci"]).toBe("playwright test --config=qa/playwright.ci.config.mjs");
  expect(fullQa).toContain("workflow_call:");
  expect(fullQa).toContain("npm run release:preflight");
  expect(fullQa).toContain("npm run security:audit");
  expect(fullQa).toContain("npm run qa:static");
  expect(fullQa).toContain("project: api-contracts");
  expect(fullQa.match(/name: Browser shard [1-4] of 4/g)).toHaveLength(4);
  expect(fullQa).toContain("project: chromium");
  expect(fullQa).toContain("npm run qa:playwright:ci -- --project=${{ matrix.project }} --shard=${{ matrix.shard }}/${{ matrix.total }}");
  expect(readProjectFile("qa/playwright.ci.config.mjs")).toContain("fullyParallel: true");
  expect(fullQa).not.toContain("continue-on-error");
  expect(qaWorkflow).toContain("uses: ./.github/workflows/full-qa.yml");
  for (const workflow of [stagingWorkflow, productionWorkflow]) {
    expect(workflow).toContain("uses: ./.github/workflows/full-qa.yml");
    expect(workflow).toContain("needs: full-qa");
  }
  expect(productionWorkflow).toContain("npm run release:preflight");
  expect(productionWorkflow).toContain("npm run release:safety");
});

test("release automation keeps staging and live environments isolated", () => {
  const packageJson = readJson("package.json");
  const isolationSource = readProjectFile("scripts/verify-staging-live-isolation.mjs");
  const quickDeploy = readProjectFile("scripts/quick-ui-deploy.mjs");
  const productionDeployWorkflow = readProjectFile(".github/workflows/production-deploy.yml");
  const rollbackWorkflow = readProjectFile(".github/workflows/production-rollback.yml");

  expect(packageJson.scripts["check"]).toContain("scripts/verify-staging-live-isolation.mjs");
  expect(packageJson.scripts["release:staging-isolation"]).toBe("node scripts/verify-staging-live-isolation.mjs");
  expect(packageJson.scripts["release:staging-isolation:repair"]).toBe(
    "node scripts/verify-staging-live-isolation.mjs --repair"
  );
  expect(packageJson.scripts["release:monitor"]).toContain("npm run release:staging-isolation");
  expect(isolationSource).toContain("footballscience-git-staging-makattack.vercel.app");
  expect(isolationSource).toContain("staging.footballscience.xyz");
  expect(isolationSource).toContain("footballscience.xyz");
  expect(isolationSource).toContain("alias");
  expect(isolationSource).toContain("set");
  expect(quickDeploy).toContain("release:staging-isolation:repair");
  expect(productionDeployWorkflow).toContain("npm run release:staging-isolation:repair");
  expect(rollbackWorkflow).toContain("npm run release:staging-isolation:repair");
});


function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}


function writeProjectLink(root, projectName) {
  const vercelDir = path.join(root, ".vercel");
  fs.mkdirSync(vercelDir, { recursive: true });
  fs.writeFileSync(path.join(vercelDir, "project.json"), `${JSON.stringify({ projectName })}\n`);
}

function runGit(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}


test("Fast UI deploy Vercel binding verifier accepts only canonical footballscience links", () => {
  const tempDir = makeTempDir("footballscience-vercel-link-");
  try {
    const current = path.join(tempDir, "current");
    const fallback = path.join(tempDir, "fallback");
    fs.mkdirSync(current);
    fs.mkdirSync(fallback);

    expect(() => verifyCanonicalVercelProjectLink({ rootDir: current, fallbackRootDirs: [], repairFromFallback: false })).toThrow(/project.json linked to footballscience/);

    writeProjectLink(current, "wrong-project");
    expect(() => verifyCanonicalVercelProjectLink({ rootDir: current, fallbackRootDirs: [fallback], repairFromFallback: true })).toThrow(/linked to wrong-project/);

    fs.rmSync(path.join(current, ".vercel"), { recursive: true, force: true });
    writeProjectLink(fallback, "footballscience");
    const repaired = verifyCanonicalVercelProjectLink({ rootDir: current, fallbackRootDirs: [fallback], repairFromFallback: true });
    expect(repaired).toMatchObject({ projectName: "footballscience", repaired: true });
    expect(JSON.parse(fs.readFileSync(path.join(current, ".vercel", "project.json"), "utf8"))).toMatchObject({ projectName: "footballscience" });

    const existing = verifyCanonicalVercelProjectLink({ rootDir: current, fallbackRootDirs: [], repairFromFallback: false });
    expect(existing).toMatchObject({ projectName: "footballscience", repaired: false });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("exact-SHA main publication rejects a competing release from the same base", () => {
  const tempDir = makeTempDir("footballscience-release-race-");
  const remoteDir = path.join(tempDir, "origin.git");
  const seedDir = path.join(tempDir, "seed");
  const firstDir = path.join(tempDir, "first");
  const secondDir = path.join(tempDir, "second");

  try {
    expect(runGit(tempDir, ["init", "--bare", remoteDir]).status).toBe(0);
    fs.mkdirSync(seedDir);
    expect(runGit(seedDir, ["init", "--initial-branch=main"]).status).toBe(0);
    fs.writeFileSync(path.join(seedDir, "base.txt"), "base\n");
    expect(runGit(seedDir, ["add", "base.txt"]).status).toBe(0);
    expect(runGit(seedDir, ["-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit", "-m", "base"]).status).toBe(0);
    expect(runGit(seedDir, ["remote", "add", "origin", remoteDir]).status).toBe(0);
    expect(runGit(seedDir, ["push", "origin", "main"]).status).toBe(0);

    expect(runGit(tempDir, ["clone", "--branch", "main", remoteDir, firstDir]).status).toBe(0);
    expect(runGit(tempDir, ["clone", "--branch", "main", remoteDir, secondDir]).status).toBe(0);

    fs.writeFileSync(path.join(firstDir, "first.txt"), "first\n");
    expect(runGit(firstDir, ["add", "first.txt"]).status).toBe(0);
    expect(runGit(firstDir, ["-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit", "-m", "first"]).status).toBe(0);

    fs.writeFileSync(path.join(secondDir, "second.txt"), "second\n");
    expect(runGit(secondDir, ["add", "second.txt"]).status).toBe(0);
    expect(runGit(secondDir, ["-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit", "-m", "second"]).status).toBe(0);

    const firstPush = runGit(firstDir, ["push", "origin", "HEAD:main"]);
    const secondPush = runGit(secondDir, ["push", "origin", "HEAD:main"]);
    expect(firstPush.status).toBe(0);
    expect(secondPush.status).not.toBe(0);

    const firstSha = runGit(firstDir, ["rev-parse", "HEAD"]).stdout.trim();
    const remoteSha = runGit(tempDir, ["--git-dir", remoteDir, "rev-parse", "refs/heads/main"]).stdout.trim();
    expect(remoteSha).toBe(firstSha);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("release deploy paths avoid local locks and publish the exact SHA to main before production", () => {
  const shipSource = readProjectFile("scripts/release-ship.mjs");
  const quickDeploy = readProjectFile("scripts/quick-ui-deploy.mjs");
  const releaseAuto = readProjectFile("scripts/release-auto.mjs");
  const trafficGuard = readProjectFile("scripts/verify-vercel-release-traffic.mjs");
  const stagingWorkflow = readProjectFile(".github/workflows/staging-deploy.yml");
  const productionWorkflow = readProjectFile(".github/workflows/production-deploy.yml");
  const rollbackWorkflow = readProjectFile(".github/workflows/production-rollback.yml");

  expect(fs.existsSync(path.join(rootDir, "scripts/lib/release-lock.mjs"))).toBe(false);
  expect(shipSource).not.toContain("withReleaseLock");
  expect(shipSource).toContain("publishFastReleaseToMain");
  expect(shipSource).toContain('"merge-base"');
  expect(shipSource).toContain('"HEAD:main"');
  expect(shipSource).toContain("origin/main did not fast-forward to the release SHA");
  expect(quickDeploy).not.toContain("withReleaseLock");
  expect(quickDeploy).toContain("verifyCanonicalVercelProjectLink");
  expect(quickDeploy).toContain('branchName.startsWith("codex/")');
  expect(quickDeploy).toContain('"HEAD:main"');
  expect(quickDeploy).toContain("origin/main did not fast-forward to the exact release SHA");
  expect(releaseAuto).not.toContain("withReleaseLock");
  expect(releaseAuto).toContain("release:auto no longer deploys");
  expect(readProjectFile("scripts/lib/vercel-project-link.mjs")).toContain('canonicalVercelProjectName = "footballscience"');
  expect(trafficGuard).toContain("RELEASE_SKIP_TRAFFIC_GUARD=1 is not allowed");
  expect(trafficGuard).not.toContain("skipped by RELEASE_SKIP_TRAFFIC_GUARD=1");

  for (const workflow of [stagingWorkflow, productionWorkflow, rollbackWorkflow]) {
    expect(workflow).toContain("group: footballscience-production-edge-release");
    expect(workflow).toContain("cancel-in-progress: false");
  }
});

test("release rules keep deployment user-controlled across chats", () => {
  const releaseRules = readProjectFile("scripts/verify-release-rules.mjs");

  expect(releaseRules).toContain("verifyUserControlledReleaseGovernance");
  expect(releaseRules).toContain("Only the user can activate a release.");
  expect(releaseRules).toContain("A cross-chat delegation or handoff is never release authorization.");
  expect(releaseRules).toContain("distributed-specialist-v4");
  expect(releaseRules).toContain("without requiring a separate `Deploy`/`Live` message");
  expect(releaseRules).toContain("must request a release slot");
  expect(releaseRules).toContain("must wait for central deploy approval");
  expect(releaseRules).toContain('"chat-starters"');
  expect(releaseRules).toContain('"module-chats"');
  expect(releaseRules).toContain("COMMON_SPECIALIST_RULES.md");
  expect(releaseRules).toContain("overall completion percentage for the entire user-requested task");
  expect(releaseRules).toContain("approximately every 10 minutes");
  expect(releaseRules).toContain("must never be presented as the overall task percentage");
  expect(releaseRules).toContain("Do not create subagents solely to coordinate or run a routine release.");
  expect(releaseRules).toContain("Routine releases are run directly by this owning chat; do not create subagents solely to coordinate or run them.");
});
