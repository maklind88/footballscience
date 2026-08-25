import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireReleaseLock, readReleaseLockOwner, releaseReleaseLock } from "../scripts/lib/release-lock.mjs";

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

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`child exited with ${code}: ${stderr}`));
    });
  });
}

test("machine release lock is atomic, token-scoped, and stale-aware", () => {
  const tempDir = makeTempDir("footballscience-release-lock-unit-");
  const lockDir = path.join(tempDir, "release.lock");

  try {
    const lock = acquireReleaseLock({ lockDir, wait: false, rootDir, branch: "codex/test", sha: "abc123", command: "unit release" });
    expect(readReleaseLockOwner(lockDir)).toMatchObject({
      schema: "footballscience-release-lock-v1",
      pid: process.pid,
      worktree: rootDir,
      branch: "codex/test",
      sha: "abc123",
      command: "unit release",
    });
    expect(() => acquireReleaseLock({ lockDir, wait: false, rootDir })).toThrow(/Another release is already active/);
    expect(releaseReleaseLock({ lockDir, token: "wrong-token" })).toBe(false);
    expect(fs.existsSync(lockDir)).toBe(true);
    lock.release();
    expect(fs.existsSync(lockDir)).toBe(false);

    fs.mkdirSync(lockDir);
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      `${JSON.stringify({
        schema: "footballscience-release-lock-v1",
        token: "stale-token",
        pid: 999_999_999,
        acquiredAt: "2026-01-01T00:00:00.000Z",
        worktree: rootDir,
        branch: "main",
        sha: "deadbeef",
        command: "stale release",
      })}\n`,
    );
    const replacement = acquireReleaseLock({ lockDir, wait: false, rootDir, branch: "codex/replacement", sha: "def456" });
    expect(readReleaseLockOwner(lockDir)).toMatchObject({ branch: "codex/replacement", sha: "def456" });
    replacement.release();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("machine release lock makes a second process wait until the owner exits", async () => {
  const tempDir = makeTempDir("footballscience-release-lock-process-");
  const lockDir = path.join(tempDir, "release.lock");
  const readyFile = path.join(tempDir, "child-ready.txt");
  const moduleUrl = pathToFileURL(path.join(rootDir, "scripts/lib/release-lock.mjs")).href;

  const parent = acquireReleaseLock({ lockDir, wait: false, rootDir, branch: "codex/parent", sha: "parent" });
  try {
    const childSource = `
      import fs from "node:fs";
      import { acquireReleaseLock } from ${JSON.stringify(moduleUrl)};
      const lock = acquireReleaseLock({ lockDir: process.env.TEST_LOCK_DIR, wait: true, pollMs: 25, statusMs: 10_000, timeoutMs: 3_000, rootDir: process.cwd(), branch: "codex/child", sha: "child", command: "child release" });
      fs.writeFileSync(process.env.TEST_READY_FILE, "ready");
      lock.release();
    `;
    const child = spawn(process.execPath, ["--input-type=module", "-e", childSource], {
      cwd: rootDir,
      env: { ...process.env, TEST_LOCK_DIR: lockDir, TEST_READY_FILE: readyFile },
      stdio: ["ignore", "ignore", "pipe"],
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fs.existsSync(readyFile)).toBe(false);
    parent.release();
    await waitForExit(child);
    expect(fs.readFileSync(readyFile, "utf8")).toBe("ready");
  } finally {
    parent.release();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("release deploy paths use the lock and publish the exact SHA to main before production", () => {
  const shipSource = readProjectFile("scripts/release-ship.mjs");
  const quickDeploy = readProjectFile("scripts/quick-ui-deploy.mjs");
  const releaseAuto = readProjectFile("scripts/release-auto.mjs");
  const trafficGuard = readProjectFile("scripts/verify-vercel-release-traffic.mjs");
  const stagingWorkflow = readProjectFile(".github/workflows/staging-deploy.yml");
  const productionWorkflow = readProjectFile(".github/workflows/production-deploy.yml");
  const rollbackWorkflow = readProjectFile(".github/workflows/production-rollback.yml");

  expect(shipSource).toContain("withReleaseLock");
  expect(shipSource).toContain("publishFastReleaseToMain");
  expect(shipSource).toContain('"merge-base"');
  expect(shipSource).toContain('"HEAD:main"');
  expect(shipSource).toContain("origin/main did not fast-forward to the release SHA");
  expect(quickDeploy).toContain("withReleaseLock");
  expect(quickDeploy).toContain('branchName.startsWith("codex/")');
  expect(quickDeploy).toContain('"HEAD:main"');
  expect(quickDeploy).toContain("origin/main did not fast-forward to the exact release SHA");
  expect(releaseAuto).toContain("withReleaseLock");
  expect(trafficGuard).toContain("RELEASE_SKIP_TRAFFIC_GUARD=1 is not allowed");
  expect(trafficGuard).not.toContain("skipped by RELEASE_SKIP_TRAFFIC_GUARD=1");

  for (const workflow of [stagingWorkflow, productionWorkflow, rollbackWorkflow]) {
    expect(workflow).toContain("group: footballscience-production-edge-release");
    expect(workflow).toContain("cancel-in-progress: false");
  }
});

test("release rules contain distributed governance regression guards", () => {
  const releaseRules = readProjectFile("scripts/verify-release-rules.mjs");

  expect(releaseRules).toContain("verifyDistributedSpecialistGovernance");
  expect(releaseRules).toContain("Deploy only when I say");
  expect(releaseRules).toContain("must request a release slot");
  expect(releaseRules).toContain("must wait for central deploy approval");
  expect(releaseRules).toContain("Release Ownership Agreement");
});
