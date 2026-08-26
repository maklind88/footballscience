import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { assertDeployment, assertFreshReleaseTimestamp, assertPlanArtifact, assertRailEntries, assertReleaseEvidenceWindow, assertResolvedDeploymentIdentity, assertUploadedArtifactRecord, assertVercelLock, captureVercelRace, collectVercelDeploymentHistory, databaseAttestationDigest, inspectVercelRace, normalizeNpmCiDrift, releaseCommandEnvironment, releaseDeploymentMeta, selectDeploymentMatches, selectPriorRailDeployments, settleCleanupThenRepair } from "../scripts/leaderboard-production-code-release.mjs";
import { assertCredentialHealth, assertEnvironmentRecord, assertEvidenceFresh, assertFreezeAttestation, assertRequiredSteps, assertRun, assertVercelDeploymentRecords, buildOwnerFreezeAttestation, otherActiveRuns } from "../scripts/lib/leaderboard-production-release-evidence.mjs";
import { assertArtifactPath, assertNoSecretLeak, assertOnlyMirroredOccurrences, assertSupabaseUrl, canonicalDigest, captureSecrets, childEnvironment, escapeWorkflowCommandData, readArtifact, readDotenv, redact, runChecked, sanitizedApiRequest, writeArtifact } from "../scripts/lib/leaderboard-production-release-security.mjs";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const workflow = read(".github/workflows/leaderboard-production-code-release.yml"); const runner = read("scripts/leaderboard-production-code-release.mjs");
const evidence = read("scripts/lib/leaderboard-production-release-evidence.mjs"); const security = read("scripts/lib/leaderboard-production-release-security.mjs");
const liveSmoke = read("qa/leaderboard-production-readonly.live.spec.mjs"); const liveSmokeConfig = read("qa/leaderboard-production-readonly.playwright.config.mjs"); const baseline = JSON.parse(read("scripts/leaderboard-production-release-baseline.json"));
const packageJson = JSON.parse(read("package.json")); const deploymentFixture = (id, state, target = null, meta = {}) => ({ id, readyState: state, state, target, projectId: baseline.vercel.projectId, createdAt: 1_000_000, meta });
function withRunIdentity(callback) {
  const previous = [process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT];
  process.env.GITHUB_RUN_ID = "123456";
  process.env.GITHUB_RUN_ATTEMPT = "1";
  try { return callback(); } finally {
    if (previous[0] === undefined) delete process.env.GITHUB_RUN_ID; else process.env.GITHUB_RUN_ID = previous[0];
    if (previous[1] === undefined) delete process.env.GITHUB_RUN_ATTEMPT; else process.env.GITHUB_RUN_ATTEMPT = previous[1];
  }
}
test("release baseline locks exact candidate, evidence, projects, hashes, and infra-only scope", () => {
  expect(baseline.schema).toBe("footballscience-leaderboard-production-code-release-baseline-v1");
  expect(baseline.repository).toEqual({ id: 1231879845, fullName: "maklind88/footballscience", defaultBranch: "main" });
  expect(baseline.candidate).toMatchObject({
    sha: "c1b1821ab796bb680eb3480979542b6a461af964",
    tree: "4f1313f370d647fbffaa20236f6dee6a4412006a",
  });
  expect(baseline.allowedRailPaths).toEqual([
    ".github/workflows/leaderboard-production-code-release.yml",
    "package.json",
    "qa/leaderboard-production-code-release.api.spec.mjs",
    "qa/leaderboard-production-readonly.live.spec.mjs",
    "qa/leaderboard-production-readonly.playwright.config.mjs",
    "scripts/leaderboard-production-code-release.mjs",
    "scripts/leaderboard-production-release-baseline.json",
    "scripts/lib/leaderboard-production-release-evidence.mjs",
    "scripts/lib/leaderboard-production-release-security.mjs",
    "scripts/release-tools/vercel-cli/package-lock.json",
    "scripts/release-tools/vercel-cli/package.json",
  ]);
  expect(baseline.evidence).toMatchObject({
    codeql: { runId: 32926215969, conclusion: "success" },
    qa: { runId: 32926216162, conclusion: "failure", failedJobId: 98049538827, expectedJobs: 6 },
    stagingSmoke: { runId: 32927128439, jobId: 98052178006, conclusion: "success" },
  });
  expect(baseline.vercel).toMatchObject({
    teamId: "team_ayMHRHhvpCWLhB7Hss525k0z",
    projectId: "prj_GazeaGD3eThx8p2w1m334AAFNN0x",
    cliVersion: "53.2.0",
    nodeVersion: "24.15.0",
    cliLockSha256: "cf2cda833a248212b371cb3324c8784722a8ad986be0bf7894c9872d47b4e080",
  });
  expect(baseline.supabase).toMatchObject({
    stagingRef: "pokrksgempkuraueglpu",
    productionRef: "bustidorxevacosqhkcz",
    migrationCount: 48,
    leaderboardVersion: "20260825181453",
    migrationRawSha256: "c4e719b1fc7600f57f4bcf8726704877a76b793423eaeb42d4c7365e43d19717",
    migrationCanonicalSha256: "e51c119d3f47b9cc1e473a1518f646b749799dfb3e0f64d882701fddc3fcc36e",
    catalogObjects: 175,
    catalogMd5: "ff4915614faf4a99ed13ec2dd1c8af17",
  });
  expect(Object.values(baseline.supabase.rowCounts)).toEqual([0, 0, 0, 0, 0]);
  expect(baseline.freezes).toEqual({
    branch: { name: "temporary-leaderboard-staging-secret-freeze-branch-20260825", payloadSha256: "63b90492f82b8979d484fbb05e6ef757ebe09f17f4fb4facae3ff8f1a491669f" },
    tag: { name: "temporary-leaderboard-staging-secret-freeze-tag-20260825", payloadSha256: "ff441ee1e4cd15156ef6267d955213483f8231b2493325fa1ae7313da04412a9" },
  });
  expect(baseline.environments).toMatchObject({ reviewer: "maklind88", reviewerId: 279889782, requiredExternalSecretCount: 0 });
});
test("package diff adds only three standalone release scripts and no dependency or hook", () => {
  const candidate = JSON.parse(execFileSync("git", ["show", `${baseline.candidate.sha}:package.json`], { cwd: rootDir, encoding: "utf8" }));
  const additions = {
    "check:leaderboard-production-release": "node --check scripts/leaderboard-production-code-release.mjs && node --check scripts/lib/leaderboard-production-release-evidence.mjs && node --check scripts/lib/leaderboard-production-release-security.mjs && node --check qa/leaderboard-production-code-release.api.spec.mjs && node --check qa/leaderboard-production-readonly.live.spec.mjs && node --check qa/leaderboard-production-readonly.playwright.config.mjs",
    "qa:contracts:leaderboard-production-release": "playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/leaderboard-production-code-release.api.spec.mjs",
    "qa:live:leaderboard:readonly": "playwright test --config=qa/leaderboard-production-readonly.playwright.config.mjs qa/leaderboard-production-readonly.live.spec.mjs",
  };
  for (const [key, value] of Object.entries(additions)) expect(packageJson.scripts[key]).toBe(value);
  const withoutAdditions = structuredClone(packageJson);
  for (const key of Object.keys(additions)) delete withoutAdditions.scripts[key];
  expect(withoutAdditions).toEqual(candidate);
  expect(read("package-lock.json")).toBe(execFileSync("git", ["show", `${baseline.candidate.sha}:package-lock.json`], { cwd: rootDir, encoding: "utf8" }));
});
test("workflow is dispatch-only, pinned, read-only, exact-candidate, and separately approved", () => {
  expect(workflow).toContain("workflow_dispatch:"); expect(workflow).not.toMatch(/\n\s+(?:push|schedule|workflow_run):/);
  expect(workflow).toContain("contents: read\n  actions: read"); expect(workflow).not.toMatch(/(?:contents|actions|id-token|deployments): write/);
  expect(workflow).toContain("group: footballscience-production-edge-release"); expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow.match(/environment:\n\s+name: leaderboard-production-code-release-plan/g)).toHaveLength(1); expect(workflow.match(/environment:\n\s+name: leaderboard-production-code-release-apply/g)).toHaveLength(1);
  expect(workflow.match(/if: github\.ref == 'refs\/heads\/main'/g)).toHaveLength(3);
  expect(workflow.match(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g)).toHaveLength(7);
  expect(workflow.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/g)).toHaveLength(4);
  expect(workflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"); expect(workflow).toContain("actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0");
  expect(workflow).not.toMatch(/uses:\s+[^\s@]+@v\d/);
  expect(workflow.match(/persist-credentials: false/g)).toHaveLength(7);
  expect(workflow.match(/ref: c1b1821ab796bb680eb3480979542b6a461af964/g)).toHaveLength(3);
  expect(workflow.match(/npm ci/g)).toHaveLength(7);
  expect(workflow.match(/node-version: 24\.15\.0/g)).toHaveLength(4);
  expect(workflow.match(/mcr\.microsoft\.com\/playwright:v1\.59\.1-noble@sha256:b0ab6f3cb99aa7803adbc14d9027ec1785fc6e433b97e134e0f8fe61683b6b53/g)).toHaveLength(2);
  expect(workflow).toContain("needs: plan"); expect(workflow).toContain("needs.plan.result == 'success'");
  expect(workflow).toContain("artifact_digest: ${{ steps.upload.outputs.artifact-digest }}"); expect(workflow).toContain("EXPECTED_UPLOAD_DIGEST: ${{ needs.plan.outputs.artifact_digest }}");
  expect(workflow.match(/FREEZE_ATTESTATION_SHA256: \$\{\{ inputs\.freeze_attestation_sha256 \}\}/g)).toHaveLength(2);
  expect(workflow.match(/FREEZE_OBSERVED_AT: \$\{\{ inputs\.freeze_observed_at \}\}/g)).toHaveLength(2);
  expect(workflow.match(/leaderboard-production-plan-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/g)).toHaveLength(2);
  expect(workflow).not.toMatch(/promote|rollback|apply_migration|supabase db|RELEASE_SKIP|RELEASE_ACK/i); expect(workflow).not.toContain("expected_production_monitor_run_id");
  expect(workflow).toContain("if: always() && needs.apply.outputs.release_authorized == 'true'"); expect(workflow).toContain("release_authorized: ${{ steps.authorization.outputs.release_authorized }}");
  expect(workflow).toContain('release_authorized=true\\n');
});
test("only reviewed Node runner steps inherit tokens or repository secrets", () => {
  const steps = workflow.split("\n      - name: ");
  const secretSteps = steps.filter((step) => step.includes("${{ secrets."));
  expect(secretSteps).toHaveLength(4);
  expect(secretSteps[0]).toContain("--mode environment-preflight");
  expect(secretSteps[1]).toContain("--mode plan");
  expect(secretSteps[2]).toContain("--mode apply");
  expect(secretSteps[3]).toContain("--mode cleanup");
  expect(secretSteps[1]).toContain("LIVE_QA_USERNAME");
  expect(secretSteps[1]).toContain("LIVE_QA_PASSWORD");
  expect(secretSteps[1]).toContain("STAGING_QA_USERNAME");
  expect(secretSteps[1]).toContain("STAGING_QA_PASSWORD");
  expect(secretSteps[1]).not.toMatch(/CRON_SECRET|LIVE_QA_PEER/);
  expect(secretSteps[3]).not.toMatch(/GITHUB_TOKEN|CRON_SECRET|LIVE_QA|STAGING_QA|--mode apply|--prebuilt|\bdeploy\b/);
  for (const step of secretSteps) {
    expect(step).not.toContain("run: |");
    expect(step.match(/\n\s+run:/g)).toHaveLength(1);
  }
  const permissionStep = steps.find((step) => step.startsWith("Normalize downloaded plan permissions"));
  expect(permissionStep).toContain("chmod 0700");
  expect(permissionStep).toContain("chmod 0600");
  expect(permissionStep).not.toContain("${{ secrets.");
  expect(workflow.split("jobs:")[0]).not.toContain("${{ secrets.");
});
test("runner has one production deployment, no plan mutation, and no escape hatch", () => {
  expect(runner.match(/runCaptured\("single production deploy"/g)).toHaveLength(1);
  expect(runner.match(/cliEntry, "deploy", "--prebuilt", "--prod"/g)).toHaveLength(1);
  for (const field of ["githubCommitSha", "githubCommitRef", "gitDirty", "releaseLane", "candidateTree", "githubRunId", "githubRunAttempt", "planArtifactSha256"]) expect(runner).toContain(`${field}:`);
  expect(runner).toContain("releaseDeploymentMeta(orchestrationSha");
  expect(runner).not.toMatch(/\bpromote\b|apply_migration|migration repair|supabase db|RELEASE_ALLOW_DIRTY|RELEASE_ALLOW_UNPUSHED/i);
  expect(runner).not.toMatch(/\bnpx\b|--token|release:staging-isolation:repair/);
  expect(runner).not.toMatch(/RELEASE_SKIP_STAGING_TREE_CHECK\s*[:=]\s*["']?1/);
  const planBody = runner.slice(runner.indexOf("async function plan"), runner.indexOf("function assertVercelTooling"));
  expect(planBody).not.toMatch(/runCaptured|Vercel production (?:pull|build)|single production deploy|repair staging/i);
  expect(planBody).not.toContain("release:monitor");
  expect(planBody).toContain('["live", "staging"]');
  expect(planBody).toContain("read-only ${target} credential health proof");
  expect(planBody).not.toMatch(/qa:staging:required|qa:live:required/);
  expect(evidence).not.toContain("Production Monitor");
  expect(runner).toContain("resolveSingleDeployment");
  expect(runner).toContain("Multiple matching production deployments");
  expect(runner).toContain("must not be retried");
  expect(runner).toContain("scanProductionOutput");
  expect(runner).toContain("state-driven staging alias repair");
  expect(runner).toContain("qa:live:leaderboard:readonly");
  expect(runner).toContain('ignoreCommand === "node scripts/vercel-ignore-build.mjs"');
  expect(runner).toContain('key === "ALLOW_VERCEL_GIT_PRODUCTION"');
  expect(runner).toContain('/v10/projects/${baseline.vercel.projectId}/env');
  expect(runner).toContain('{ decrypt: "false" }');
  expect(runner).toContain('"--porcelain", "--untracked-files=normal"');
  expect(runner).toContain('fs.mkdirSync(path.join(candidateDir(), ".vercel"), { recursive: true, mode: 0o700 })');
  expect(runner).toContain("console.error(redact(");
  expect(runner).toContain("A prior immutable Leaderboard production deployment already exists");
  const applyBody = runner.slice(runner.indexOf("async function apply"), runner.indexOf("async function cleanup"));
  expect(applyBody.match(/assertPlanFresh\(value\)/g)).toHaveLength(1);
  expect(applyBody.match(/assertDbAttestation\(/g)).toHaveLength(2);
  expect(applyBody.match(/assertGithubEvidence\(secrets\.GITHUB_TOKEN\)/g)).toHaveLength(2);
  expect(applyBody.match(/assertVercelState\(secrets, value\.vercel\.stagingDeploymentId\)/g)).toHaveLength(2);
  const predeployBody = applyBody.slice(applyBody.indexOf("scanProductionOutput()"));
  const predeployOrder = ["scanProductionOutput()", "const predeployGithub = await assertGithubEvidence", "await assertVercelState", "const finalGithub = await assertGithubRace", "await assertVercelReleaseRace", "const finalNow = Date.now()", "const predeployDb = assertDbAttestation(finalNow)", "assertReleaseEvidenceWindow", "deployIssued = true", "runCaptured(\"single production deploy\""];
  expect(predeployOrder.map((needle) => predeployBody.indexOf(needle)).every((position, index, all) => position >= 0 && (index === 0 || position > all[index - 1]))).toBe(true);
  const finalGate = predeployBody.slice(predeployBody.indexOf("await assertVercelReleaseRace"), predeployBody.indexOf('runCaptured("single production deploy"'));
  expect(finalGate.match(/\bawait\b/g)).toHaveLength(1);
  expect(applyBody.indexOf("appendGithubOutput({ deployment_id: deploymentId })")).toBeLessThan(applyBody.indexOf("await verifyNewLive"));
  expect(applyBody.match(/repairStagingIsolation\(/g)).toHaveLength(3);
  expect(applyBody).toContain("Mandatory staging repair failure");
  const cleanupBody = runner.slice(runner.indexOf("async function cleanup"), runner.indexOf("async function main"));
  expect(cleanupBody).not.toMatch(/single production deploy|cliEntry, "deploy"|--prebuilt|--prod/);
  expect(cleanupBody).toContain("await settleCleanupThenRepair");
  expect(cleanupBody).toContain("() => repairStagingIsolation");
  expect(runner).toContain("[baseline.hosts.staging, baseline.hosts.stagingBranch]");
  for (const identity of ["GITHUB_ACTOR", "GITHUB_TRIGGERING_ACTOR", "GITHUB_RUN_ATTEMPT", "GITHUB_REF_PROTECTED", "GITHUB_WORKFLOW_REF", "GITHUB_WORKFLOW_SHA"]) expect(runner).toContain(identity);
});
test("negative identity, stale-run, missing-step, active-run, and duplicate-deploy fixtures fail closed", () => {
  const expected = { runId: 1, workflowId: 2, branch: "main", event: "push", attempt: 1, conclusion: "success" };
  const exact = { id: 1, workflow_id: 2, head_sha: baseline.candidate.sha, head_branch: "main", event: "push", run_attempt: 1, status: "completed", conclusion: "success" };
  expect(() => assertRun(exact, expected, "fixture")).not.toThrow();
  for (const drift of [{ head_sha: "f".repeat(40) }, { workflow_id: 3 }, { run_attempt: 2 }, { head_branch: "staging" }, { conclusion: "failure" }]) {
    expect(() => assertRun({ ...exact, ...drift }, expected, "fixture")).toThrow();
  }
  expect(() => assertEvidenceFresh("2026-08-26T00:00:00Z", Date.parse("2026-08-26T01:00:00Z"))).not.toThrow();
  expect(() => assertEvidenceFresh("2026-08-20T00:00:00Z", Date.parse("2026-08-26T01:00:00Z"))).toThrow(/stale/);
  expect(() => assertRequiredSteps({ steps: [{ name: "exact", conclusion: "failure" }] }, ["exact"])).toThrow(/Required step/);
  expect(otherActiveRuns([{ id: 7 }, { id: 8 }, { id: 8 }], 7)).toEqual([{ id: 8 }]);
  const started = 1_000_000;
  const expectedMeta = { ...releaseDeploymentMeta("d".repeat(40)), githubRunId: "9", githubRunAttempt: "1", planArtifactSha256: "a".repeat(64) };
  const match = { id: "dpl_one", readyState: "READY", state: "READY", target: "production", projectId: baseline.vercel.projectId, createdAt: started, meta: expectedMeta };
  expect(() => selectDeploymentMatches(null, started, expectedMeta)).toThrow(/malformed/);
  expect(selectDeploymentMatches([match], started, expectedMeta)).toEqual([match]);
  for (const key of Object.keys(expectedMeta)) expect(selectDeploymentMatches([{ ...match, meta: { ...match.meta, [key]: "wrong" } }], started, expectedMeta)).toEqual([]);
  expect(() => selectDeploymentMatches([match, { ...match, id: "dpl_two" }], started, expectedMeta)).toThrow(/Multiple/);
  expect(() => selectPriorRailDeployments(null)).toThrow(/malformed/);
  expect(selectPriorRailDeployments([match])).toEqual([match]);
  expect(selectPriorRailDeployments([{ ...match, target: null }])).toEqual([]);
  expect(assertVercelDeploymentRecords([match])).toEqual([match]);
  for (const malformed of [[{ ...match, meta: null }], [{ ...match, projectId: "wrong" }], [{ ...match, target: "preview" }], [{ ...match, state: "ERROR" }], [{ ...match, uid: "dpl_other" }], [match, { ...match }], [{}]]) expect(() => assertVercelDeploymentRecords(malformed)).toThrow();
  const resolved = { ...match, id: "dpl_Exact123", target: "production", projectId: baseline.vercel.projectId, name: baseline.vercel.projectName };
  expect(assertResolvedDeploymentIdentity(resolved, expectedMeta)).toBe("dpl_Exact123");
  expect(() => assertResolvedDeploymentIdentity({ ...resolved, target: null }, expectedMeta)).toThrow(/target\/project/);
  expect(assertFreshReleaseTimestamp("2026-08-26T00:00:00Z", 60_000, Date.parse("2026-08-26T00:00:30Z"))).toBe(Date.parse("2026-08-26T00:00:00Z"));
  expect(() => assertFreshReleaseTimestamp("2026-08-25T23:00:00Z", 60_000, Date.parse("2026-08-26T00:00:30Z"))).toThrow(/stale/);
  expect(() => assertFreshReleaseTimestamp("2026-08-26T00:03:00Z", 60_000, Date.parse("2026-08-26T00:00:30Z"))).toThrow(/future/);
});
test("Vercel race and cleanup fixtures wait for late, exact, and unrelated deployments before repair", async () => {
  const meta = { ...releaseDeploymentMeta("d".repeat(40)), githubRunId: "9", githubRunAttempt: "1", planArtifactSha256: "a".repeat(64) };
  const prior = deploymentFixture("dpl_prior", "READY", "production", meta);
  const order = []; const pages = [{ deployments: [], pagination: { next: 2 } }, { deployments: [prior], pagination: { next: null } }];
  const afterPageOne = await captureVercelRace(() => collectVercelDeploymentHistory(async () => { order.push(`history-${order.length}`); return pages.shift(); }), async () => { order.push("traffic"); return []; });
  expect(order).toEqual(["history-0", "history-1", "traffic"]); expect(afterPageOne.prior).toHaveLength(1);
  expect((await captureVercelRace(async () => [], async () => [prior])).prior).toHaveLength(1);
  for (const pagination of [null, {}, { next: false }, { next: "9" }, { next: 0 }, { next: -1 }, { next: 1.5 }]) await expect(collectVercelDeploymentHistory(async () => ({ deployments: [], pagination }))).rejects.toThrow(/malformed|cursor/);
  const repeated = [{ deployments: [], pagination: { next: 9 } }, { deployments: [], pagination: { next: 9 } }]; await expect(collectVercelDeploymentHistory(async () => repeated.shift())).rejects.toThrow(/did not advance/);
  let boundedPage = 0; await expect(collectVercelDeploymentHistory(async () => ({ deployments: [], pagination: { next: 20 - boundedPage++ } }))).rejects.toThrow(/bound/);
  const exactActive = deploymentFixture("dpl_exact", "BUILDING", "production", meta); const exactReady = { ...exactActive, readyState: "READY", state: "READY" };
  expect(inspectVercelRace([exactActive], [exactReady], meta).active).toHaveLength(0); expect(inspectVercelRace([exactReady], [exactActive], meta).active).toHaveLength(1);
  const otherActive = deploymentFixture("dpl_other", "QUEUED"); const otherReady = { ...otherActive, readyState: "READY", state: "READY" };
  let clock = 0; const events = []; const states = [inspectVercelRace([], [], meta), inspectVercelRace([exactActive], [], meta), inspectVercelRace([exactReady, otherActive], [], meta), inspectVercelRace([exactReady, otherReady], [], meta)];
  const settled = await settleCleanupThenRepair(async () => { events.push("observe"); return states.shift(); }, async () => events.push("repair-primary", "repair-branch"), meta, { now: () => clock, sleep: async () => { clock += 5; }, horizonMs: 20, pollMs: 5 });
  expect(settled.sawExact).toBe(true); expect(events).toEqual(["observe", "observe", "observe", "observe", "repair-primary", "repair-branch"]);
  let timeoutRepair = 0; clock = 0;
  await expect(settleCleanupThenRepair(async () => inspectVercelRace([exactActive], [], meta), async () => { timeoutRepair += 1; }, meta, { now: () => clock, sleep: async () => { clock += 10; }, horizonMs: 10 })).rejects.toThrow(/not repaired early/);
  expect(timeoutRepair).toBe(0); clock = 0;
  const absent = await settleCleanupThenRepair(async () => inspectVercelRace([], [], meta), async () => { timeoutRepair += 1; }, meta, { now: () => clock, sleep: async () => { clock += 10; }, horizonMs: 10 });
  expect(absent).toEqual({ sawExact: false, elapsed: 10 }); expect(timeoutRepair).toBe(1);
});
test("deployment and rail fixtures reject wrong target, provenance, paths, deletions, and duplicate scope", () => {
  const deployment = {
    id: "dpl_exact", readyState: "READY", target: "production", projectId: baseline.vercel.projectId,
    name: baseline.vercel.projectName, meta: { githubCommitSha: baseline.candidate.sha },
  };
  expect(() => assertDeployment(deployment, { id: "dpl_exact", target: "production", sha: baseline.candidate.sha }, "fixture")).not.toThrow();
  expect(() => assertDeployment({ ...deployment, target: null }, { id: "dpl_exact", target: "production", sha: baseline.candidate.sha }, "fixture")).toThrow(/readiness\/target/);
  expect(() => assertDeployment({ ...deployment, meta: { githubCommitSha: "f".repeat(40) } }, { id: "dpl_exact", target: "production", sha: baseline.candidate.sha }, "fixture")).toThrow(/metadata/);
  expect(() => assertDeployment({ ...deployment, url: "wrong", createdAt: 1 }, { id: "dpl_exact", target: "production", sha: baseline.candidate.sha, url: "exact", createdAt: 1 }, "fixture")).toThrow(/creation time/);
  const exactEntries = baseline.allowedRailPaths.map((file) => [file === "package.json" ? "M" : "A", file]);
  expect(assertRailEntries(exactEntries)).toEqual([...baseline.allowedRailPaths].sort());
  expect(() => assertRailEntries(exactEntries.map((entry, index) => index ? entry : ["A", "app.js"]))).toThrow(/allowlist/);
  expect(() => assertRailEntries(exactEntries.map((entry, index) => index ? entry : ["D", entry[1]]))).toThrow(/status/);
  expect(() => assertRailEntries(exactEntries.map((entry, index) => index ? entry : exactEntries[1]))).toThrow(/duplicated/);
  const lock = JSON.parse(read("scripts/release-tools/vercel-cli/package-lock.json"));
  expect(assertVercelLock(lock)).toBe(true);
  expect(() => assertVercelLock({ ...lock, packages: { ...lock.packages, "node_modules/vercel": { ...lock.packages["node_modules/vercel"], integrity: "wrong" } } })).toThrow(/lock/);
});
test("protected environment fixtures require exact ids, reviewer, no bypass, and main-only policy", () => {
  const reviewer = { type: "User", reviewer: { id: baseline.environments.reviewerId, login: baseline.environments.reviewer } };
  const environment = {
    id: 123, name: baseline.environments.plan, can_admins_bypass: false,
    protection_rules: [{ type: "required_reviewers", prevent_self_review: false, reviewers: [reviewer] }, { type: "branch_policy" }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  };
  const policies = { total_count: 1, branch_policies: [{ id: 456, name: "main", type: "branch" }] };
  const expected = { id: 123, name: baseline.environments.plan };
  expect(assertEnvironmentRecord(environment, policies, expected)).toEqual({ id: 123, name: baseline.environments.plan, policyId: 456 });
  expect(() => assertEnvironmentRecord({ ...environment, can_admins_bypass: true }, policies, expected)).toThrow(/bypass/);
  expect(() => assertEnvironmentRecord({ ...environment, protection_rules: [...environment.protection_rules, { type: "wait_timer" }] }, policies, expected)).toThrow(/rules/);
  expect(() => assertEnvironmentRecord({ ...environment, protection_rules: [{ ...environment.protection_rules[0], prevent_self_review: true }, environment.protection_rules[1]] }, policies, expected)).toThrow(/reviewer/);
  expect(() => assertEnvironmentRecord(environment, { total_count: 1, branch_policies: [{ id: 456, name: "release", type: "branch" }] }, expected)).toThrow(/main-only/);
});
test("owner freeze attestation binds hidden bypass, dynamic ids, updated_at, payloads, and TTL", () => {
  const observedAt = "2026-08-26T12:00:00.000Z";
  const now = Date.parse("2026-08-26T12:01:00.000Z");
  const rule = (target, id) => ({
    id, name: baseline.freezes[target].name, target, enforcement: "active", current_user_can_bypass: "never", updated_at: "2026-08-26T11:59:00.000Z", bypass_actors: [],
    conditions: { ref_name: { include: ["~ALL"], exclude: [] } },
    rules: [{ type: "creation" }, { type: "update", parameters: { update_allows_fetch_and_merge: false } }, { type: "deletion" }],
  });
  const ownerRules = [rule("branch", 11), rule("tag", 12)];
  const owner = buildOwnerFreezeAttestation(ownerRules, observedAt, now);
  for (const item of owner.rules) expect(item.payloadSha256).toBe(baseline.freezes[item.target].payloadSha256);
  const visible = ownerRules.map(({ bypass_actors, ...item }) => item);
  expect(assertFreezeAttestation(visible, observedAt, owner.digest, now).digest).toBe(owner.digest);
  expect(() => buildOwnerFreezeAttestation(visible, observedAt, now)).toThrow(/empty bypass/);
  expect(() => buildOwnerFreezeAttestation([{ ...ownerRules[0], bypass_actors: [{ actor_id: 1 }] }, ownerRules[1]], observedAt, now)).toThrow(/empty bypass/);
  expect(() => buildOwnerFreezeAttestation([{ ...ownerRules[0], rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }] }, ownerRules[1]], observedAt, now)).toThrow(/owner freeze update/);
  expect(() => buildOwnerFreezeAttestation([{ ...ownerRules[0], rules: [{ type: "creation" }, { type: "update", parameters: { update_allows_fetch_and_merge: false, extra: true } }, { type: "deletion" }] }, ownerRules[1]], observedAt, now)).toThrow(/owner freeze update/);
  expect(() => assertFreezeAttestation([{ ...visible[0], updated_at: "2026-08-26T12:03:00Z" }, visible[1]], observedAt, owner.digest, now)).toThrow(/updated after/);
  expect(() => assertFreezeAttestation(visible, observedAt, "f".repeat(64), now)).toThrow(/digest/);
  expect(() => assertFreezeAttestation(visible, "2026-08-26T10:00:00Z", owner.digest, now)).toThrow(/stale/);
  const previousDigest = process.env.FREEZE_ATTESTATION_SHA256; process.env.FREEZE_ATTESTATION_SHA256 = owner.digest;
  try { expect(assertReleaseEvidenceWindow({ createdAt: observedAt }, { observedAt }, owner, now)).toBe(true); expect(() => assertReleaseEvidenceWindow({ createdAt: observedAt }, { observedAt }, owner, now + 46 * 60_000)).toThrow(/stale/); expect(() => assertReleaseEvidenceWindow({ createdAt: "2026-08-26T12:04:00Z" }, { observedAt }, owner, now)).toThrow(/future/); } finally { if (previousDigest === undefined) delete process.env.FREEZE_ATTESTATION_SHA256; else process.env.FREEZE_ATTESTATION_SHA256 = previousDigest; }
});
test("live and staging credential proofs allow one auth exchange then GET-only tenant identity", async () => {
  const identity = {
    ok: true,
    scope: {
      teams: [{ id: "team", clubId: "club", organizationId: "org", status: "active" }],
      memberships: [{ scope: "team", teamId: "team", status: "active" }],
      manageable: { canManagePlatform: true },
    },
  };
  for (const target of ["live", "staging"]) {
    const calls = [];
    const expectedRef = target === "staging" ? baseline.supabase.stagingRef : baseline.supabase.productionRef;
    const fetcher = async (url, options = {}) => {
      calls.push({ url, method: options.method || "GET", token: Boolean(options.token), body: options.body, redirect: options.redirect });
      if (url.endsWith("/api/auth-health")) return { ok: true, service: "supabase-auth" };
      if (url.endsWith("/api/client-config") && options.method === "POST") return { ok: true, session: { access_token: "access", refresh_token: "refresh" } };
      if (url.endsWith("/api/client-config")) return { url: `https://${expectedRef}.supabase.co` };
      return identity;
    };
    const host = target === "staging" ? baseline.hosts.staging : baseline.hosts.production;
    const result = await assertCredentialHealth({ target, baseUrl: `https://${host}`, username: "user", password: "secret" }, fetcher);
    expect(result).toMatchObject({ target, tenant: expectedRef, auth: "ok" });
    expect(calls.map(({ method }) => method)).toEqual(["GET", "POST", "GET", "GET"]);
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
    expect(calls.at(-1).token).toBe(true);
    expect(calls.every(({ redirect }) => redirect === "error")).toBe(true);
  }
  await expect(assertCredentialHealth({ target: "live", baseUrl: "https://footballscience.xyz.attacker.example", username: "u", password: "p" }, async () => ({}))).rejects.toThrow(/exact expected origin/);
  const noAdmin = structuredClone(identity); noAdmin.scope.manageable.canManagePlatform = false;
  const noAdminFetch = async (url, options = {}) => url.endsWith("auth-health") ? { ok: true, service: "supabase-auth" } : url.endsWith("client-config") && options.method === "POST" ? { ok: true, session: { access_token: "a", refresh_token: "r" } } : url.endsWith("client-config") ? { url: `https://${baseline.supabase.productionRef}.supabase.co` } : noAdmin;
  await expect(assertCredentialHealth({ target: "live", baseUrl: `https://${baseline.hosts.production}`, username: "u", password: "p" }, noAdminFetch)).rejects.toThrow(/admin authority/);
});
test("same-run artifact and DB attestation detect wrong run, tamper, mode, and stale bytes", () => withRunIdentity(() => {
  const observedAt = "2026-08-26T12:00:00.000Z";
  expect(databaseAttestationDigest(observedAt)).toMatch(/^[0-9a-f]{64}$/);
  expect(databaseAttestationDigest(observedAt)).not.toBe(databaseAttestationDigest("2026-08-26T12:00:01.000Z"));
  const core = {
    schema: "footballscience-leaderboard-production-code-plan-v1",
    repository: baseline.repository.fullName,
    runId: "123456",
    runAttempt: "1",
    orchestration: { sha: "d".repeat(40) },
    candidate: { sha: baseline.candidate.sha, tree: baseline.candidate.tree },
  };
  const artifact = { ...core, planSha256: canonicalDigest(core) };
  expect(() => assertPlanArtifact(artifact, { rail: { head: "d".repeat(40) } })).not.toThrow();
  expect(() => assertPlanArtifact({ ...artifact, runAttempt: "2" }, { rail: { head: "d".repeat(40) } })).toThrow(/exact run/);
  expect(() => assertPlanArtifact({ ...artifact, candidate: { ...artifact.candidate, tree: "f".repeat(40) } }, { rail: { head: "d".repeat(40) } })).toThrow();
  const uploadDigest = "b".repeat(64);
  const uploadName = "leaderboard-production-plan-123456-1";
  const upload = { total_count: 1, artifacts: [{ id: 99, name: uploadName, expired: false, digest: `sha256:${uploadDigest}` }] };
  expect(assertUploadedArtifactRecord(upload, uploadName, uploadDigest)).toEqual({ id: 99, digest: `sha256:${uploadDigest}` });
  expect(() => assertUploadedArtifactRecord({ ...upload, artifacts: [{ ...upload.artifacts[0], digest: "sha256:wrong" }] }, uploadName, uploadDigest)).toThrow(/digest/);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "leaderboard-production-plan-"));
  try {
    fs.chmodSync(tempDir, 0o700);
    const file = path.join(tempDir, "plan.json");
    const written = writeArtifact(file, artifact);
    expect(readArtifact(file, written.sha256).value).toEqual(artifact);
    fs.chmodSync(file, 0o644);
    expect(() => readArtifact(file, written.sha256)).toThrow(/0600/);
    fs.chmodSync(file, 0o600);
    fs.appendFileSync(file, "tamper");
    expect(() => readArtifact(file, written.sha256)).toThrow(/SHA256/);
    expect(() => assertArtifactPath(path.join(tempDir, "..", "escape.json"), tempDir)).toThrow(/RUNNER_TEMP/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}));
test("npm-ci normalization accepts only the proven root-name removal", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "leaderboard-npm-drift-"));
  const lockPath = path.join(tempDir, "package-lock.json");
  try {
    execFileSync("git", ["init", "-q"], { cwd: tempDir });
    execFileSync("git", ["config", "user.name", "contract"], { cwd: tempDir });
    execFileSync("git", ["config", "user.email", "contract@example.test"], { cwd: tempDir });
    fs.writeFileSync(lockPath, '{"name":"footballscience","lockfileVersion":3,"packages":{}}\n');
    execFileSync("git", ["add", "package-lock.json"], { cwd: tempDir });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: tempDir });
    fs.writeFileSync(lockPath, '{"lockfileVersion":3,"packages":{}}\n');
    expect(normalizeNpmCiDrift(tempDir)).toBe("restored-root-name-only");
    expect(JSON.parse(fs.readFileSync(lockPath, "utf8")).name).toBe("footballscience");
    fs.writeFileSync(lockPath, '{"lockfileVersion":4,"packages":{}}\n');
    expect(() => normalizeNpmCiDrift(tempDir)).toThrow(/not the proven/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
test("secret capture, masking, redaction, child env, and artifact checks fail closed", async () => {
  expect(escapeWorkflowCommandData("secret%\r\n::warning::hostile")).toBe("secret%25%0D%0A::warning::hostile");
  const dynamicToken = "eyJ.fake-dynamic_token+/="; const dynamicTeamId = "11111111-2222-4333-8444-555555555555";
  let outwardRequestError; try { await sanitizedApiRequest("identity", async () => { throw new Error(`Authorization: Bearer ${dynamicToken} https://footballscience.xyz/api/platform-identity?teamId=${dynamicTeamId}`); }); } catch (error) { outwardRequestError = error; }
  expect(outwardRequestError?.message).toBe("Leaderboard read-only request failed: identity."); expect(Object.hasOwn(outwardRequestError, "cause")).toBe(false);
  const hostileChild = 'const t=process.env.HOSTILE_TOKEN,id=process.env.HOSTILE_TEAM,e=encodeURIComponent(t),text=`Authorization: Bearer ${t}\\n{"access_token":"${t}","refresh_token":"${t}"}\\nhttps://footballscience.xyz/api/leaderboard?teamId=${id}\\nAuthorization%3A%20Bearer%20${e}\\naccess_token%3D${e}%26refresh_token%3D${e}\\n%22access_token%22%3A%22${e}%22%2C%22refresh_token%22%3A%22${e}%22%2C%22teamId%22%3A%22${encodeURIComponent(id)}%22\\n`;process.stdout.write(text);process.stderr.write(text);if(process.env.HOSTILE_FAIL==="1")process.exit(7);';
  const hostileEnv = childEnvironment({ HOSTILE_TOKEN: dynamicToken, HOSTILE_TEAM: dynamicTeamId, HOSTILE_FAIL: "1" }); let outwardChildError = "";
  try { runChecked("hostile child", process.execPath, ["-e", hostileChild], { env: hostileEnv }); } catch (error) { outwardChildError = error.message; }
  expect(outwardChildError).toContain("Bearer ***"); expect(outwardChildError).toContain("Bearer%20***"); expect(outwardChildError).toContain("access_token%3D***"); for (const secret of [dynamicToken, encodeURIComponent(dynamicToken), dynamicTeamId]) expect(outwardChildError).not.toContain(secret);
  const writes = []; const stdoutWrite = process.stdout.write; const stderrWrite = process.stderr.write;
  try { process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; }; process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; }; runChecked("hostile child log", process.execPath, ["-e", hostileChild], { env: childEnvironment({ HOSTILE_TOKEN: dynamicToken, HOSTILE_TEAM: dynamicTeamId }), print: true }); } finally { process.stdout.write = stdoutWrite; process.stderr.write = stderrWrite; }
  for (const secret of [dynamicToken, encodeURIComponent(dynamicToken), dynamicTeamId]) expect(writes.join("")).not.toContain(secret);
  const source = { GITHUB_ACTIONS: "false", GITHUB_TOKEN: "token-secret", VERCEL_TOKEN: "vercel-secret", PATH: "/bin", UNRELATED_SECRET: "do-not-inherit" };
  const secrets = captureSecrets(source);
  expect(secrets).toMatchObject({ GITHUB_TOKEN: "token-secret", VERCEL_TOKEN: "vercel-secret" });
  expect(source.GITHUB_TOKEN).toBeUndefined();
  expect(redact("token-secret and vercel-secret", secrets)).toBe("*** and ***");
  const previous = process.env.UNRELATED_SECRET;
  process.env.UNRELATED_SECRET = "do-not-inherit";
  try { expect(childEnvironment().UNRELATED_SECRET).toBeUndefined(); } finally {
    if (previous === undefined) delete process.env.UNRELATED_SECRET; else process.env.UNRELATED_SECRET = previous;
  }
  expect(() => assertNoSecretLeak({ value: "token-secret" }, secrets)).toThrow(/secret material/);
  expect(security).toContain("delete source[name]");
  expect(security).toContain("encodeURIComponent(secret)");
  const releaseSecrets = { VERCEL_TOKEN: "vt", VERCEL_ORG_ID: baseline.vercel.teamId, VERCEL_PROJECT_ID: baseline.vercel.projectId, CRON_SECRET: "cron", LIVE_QA_USERNAME: "live-user", LIVE_QA_PASSWORD: "live-pass", LIVE_QA_PEER_USERNAME: "peer-user", LIVE_QA_PEER_PASSWORD: "peer-pass", STAGING_QA_USERNAME: "stage-user", STAGING_QA_PASSWORD: "stage-pass" };
  const vercelEnv = releaseCommandEnvironment("vercel", releaseSecrets);
  expect(vercelEnv).toMatchObject({ VERCEL_TOKEN: "vt", VERCEL_ORG_ID: baseline.vercel.teamId, VERCEL_PROJECT_ID: baseline.vercel.projectId });
  for (const forbidden of ["CRON_SECRET", "LIVE_QA_PASSWORD", "STAGING_QA_PASSWORD", "UNRELATED_SECRET"]) expect(vercelEnv[forbidden]).toBeUndefined();
  const liveEnv = releaseCommandEnvironment("live", releaseSecrets);
  for (const forbidden of ["CRON_SECRET", "VERCEL_TOKEN", "STAGING_QA_PASSWORD", "UNRELATED_SECRET"]) expect(liveEnv[forbidden]).toBeUndefined();
  expect(() => releaseCommandEnvironment("hostile", releaseSecrets)).toThrow(/Unknown release child/);
  const liveCredentialEnv = releaseCommandEnvironment("credential-live", releaseSecrets);
  expect(liveCredentialEnv).toMatchObject({ LIVE_QA_USERNAME: "live-user", LIVE_QA_PASSWORD: "live-pass", LEADERBOARD_CREDENTIAL_PROOF_ONLY: "1", LEADERBOARD_CREDENTIAL_PROOF_TARGET: "live" });
  const stagingCredentialEnv = releaseCommandEnvironment("credential-staging", releaseSecrets);
  expect(stagingCredentialEnv).toMatchObject({ LIVE_QA_USERNAME: "stage-user", LIVE_QA_PASSWORD: "stage-pass", LEADERBOARD_CREDENTIAL_PROOF_ONLY: "1", LEADERBOARD_CREDENTIAL_PROOF_TARGET: "staging" });
  for (const environment of [liveCredentialEnv, stagingCredentialEnv]) {
    for (const forbidden of ["CRON_SECRET", "VERCEL_TOKEN", "LIVE_QA_PEER_PASSWORD", "STAGING_QA_PASSWORD", "UNRELATED_SECRET"]) expect(environment[forbidden]).toBeUndefined();
  }
  const safetyEnv = releaseCommandEnvironment("safety", releaseSecrets);
  for (const forbidden of ["CRON_SECRET", "VERCEL_TOKEN", "VERCEL_PROJECT_ID", "UNRELATED_SECRET"]) expect(safetyEnv[forbidden]).toBeUndefined();
  const leaderboardEnv = releaseCommandEnvironment("leaderboard", releaseSecrets);
  for (const forbidden of ["CRON_SECRET", "VERCEL_TOKEN", "LIVE_QA_PEER_PASSWORD", "STAGING_QA_PASSWORD", "UNRELATED_SECRET"]) expect(leaderboardEnv[forbidden]).toBeUndefined();
  expect(releaseCommandEnvironment("postdeploy", releaseSecrets)).toEqual(expect.objectContaining({ LIVE_QA_BASE_URL: "https://footballscience.xyz" }));
  for (const verifierEnv of [releaseCommandEnvironment("ci", releaseSecrets), safetyEnv]) {
    for (const secret of Object.values(releaseSecrets)) expect(Object.values(verifierEnv)).not.toContain(secret);
  }
  expect(security).toContain("escapeWorkflowCommandData(value)");
});
test("production environment and build scan reject target drift and non-mirrored staging refs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "leaderboard-output-scan-"));
  const sourceDir = path.join(tempDir, "source");
  const outputDir = path.join(tempDir, "output");
  try {
    fs.mkdirSync(path.join(sourceDir, "docs"), { recursive: true });
    fs.mkdirSync(path.join(outputDir, "static/docs"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "docs/proof.md"), `review-only ${baseline.supabase.stagingRef}\n`);
    fs.copyFileSync(path.join(sourceDir, "docs/proof.md"), path.join(outputDir, "static/docs/proof.md"));
    expect(assertOnlyMirroredOccurrences(outputDir, sourceDir, baseline.supabase.stagingRef, ["static/docs/proof.md"])).toEqual(["static/docs/proof.md"]);
    fs.writeFileSync(path.join(outputDir, "runtime.js"), `runtime=${baseline.supabase.stagingRef}\n`);
    expect(() => assertOnlyMirroredOccurrences(outputDir, sourceDir, baseline.supabase.stagingRef, ["static/docs/proof.md"])).toThrow(/unexpected staging-reference/);
    fs.rmSync(path.join(outputDir, "runtime.js"));
    const largePath = path.join(outputDir, "large-function.bin");
    const descriptor = fs.openSync(largePath, "w");
    fs.ftruncateSync(descriptor, 26 * 1024 * 1024);
    fs.writeSync(descriptor, Buffer.from(baseline.supabase.stagingRef), 0, baseline.supabase.stagingRef.length, 26 * 1024 * 1024 - 64);
    fs.closeSync(descriptor);
    expect(() => assertOnlyMirroredOccurrences(outputDir, sourceDir, baseline.supabase.stagingRef, ["static/docs/proof.md"])).toThrow(/unexpected staging-reference/);
    fs.rmSync(largePath);
    const linkPath = path.join(outputDir, "escape-link");
    fs.symlinkSync(path.join(sourceDir, "docs/proof.md"), linkPath);
    expect(() => assertOnlyMirroredOccurrences(outputDir, sourceDir, baseline.supabase.stagingRef, ["static/docs/proof.md"])).toThrow(/symlink or special/);
    fs.unlinkSync(linkPath);
    const fifoPath = path.join(outputDir, "special-fifo");
    execFileSync("mkfifo", [fifoPath]);
    expect(() => assertOnlyMirroredOccurrences(outputDir, sourceDir, baseline.supabase.stagingRef, ["static/docs/proof.md"])).toThrow(/symlink or special/);
    fs.unlinkSync(fifoPath);
    const envFile = path.join(tempDir, ".env.production.local");
    fs.writeFileSync(envFile, 'VERCEL_ENV="production"\nSUPABASE_PROJECT_REF="bustidorxevacosqhkcz"\n');
    expect(readDotenv(envFile)).toEqual({ VERCEL_ENV: "production", SUPABASE_PROJECT_REF: "bustidorxevacosqhkcz" });
    expect(assertSupabaseUrl(`https://${baseline.supabase.productionRef}.supabase.co`, baseline.supabase.productionRef, baseline.supabase.stagingRef).ref).toBe(baseline.supabase.productionRef);
    for (const hostile of [`https://${baseline.supabase.productionRef}.supabase.co.attacker.example`, `http://${baseline.supabase.productionRef}.supabase.co`, `https://user@${baseline.supabase.productionRef}.supabase.co`, `https://${baseline.supabase.productionRef}.supabase.co:444`, `https://${baseline.supabase.productionRef}.supabase.co/path`, `https://${baseline.supabase.productionRef}.supabase.co/?query=1`, `https://${baseline.supabase.productionRef}.supabase.co/#fragment`]) {
      expect(() => assertSupabaseUrl(hostile, baseline.supabase.productionRef, baseline.supabase.stagingRef)).toThrow(/exact expected/);
    }
    expect(security).toContain("escaped its trusted root");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
test("new Leaderboard smoke is structurally read-only and verifies tenant, zero rows, UI, and anonymous denial", () => {
  expect(liveSmoke.match(/page\.request\.post\(/g)).toHaveLength(1); expect(liveSmoke.match(/maxRedirects: 0/g)).toHaveLength(5);
  const wrappedCalls = ['sanitizedApiRequest("login", () => page.request.post(', 'sanitizedApiRequest("client-config", () => page.request.get(', 'sanitizedApiRequest("identity", () => page.request.get(', 'sanitizedApiRequest("leaderboard", () => page.request.get(', 'sanitizedApiRequest("anonymous-leaderboard", () => anonymous.get(', 'sanitizedApiRequest("anonymous-dispose", () => anonymous.dispose('];
  for (const call of wrappedCalls) expect(liveSmoke).toContain(call); expect(liveSmoke.match(/(?:page\.request|anonymous)\.(?:get|post|dispose)\(/g)).toHaveLength(wrappedCalls.length); expect(liveSmoke.match(/sanitizedApiRequest\(/g)).toHaveLength(wrappedCalls.length);
  expect(liveSmoke).toContain("assertSupabaseUrl(clientConfig?.url, productionRef, stagingRef)"); expect(liveSmoke).toContain("new URL(page.url()).origin === expectedOrigin");
  expect(liveSmoke).toContain('page.route("**/*"'); expect(liveSmoke).toContain('["GET", "HEAD", "OPTIONS"]'); expect(liveSmoke).toContain('route.abort("blockedbyclient")');
  const withoutExactAuthExchange = liveSmoke.replace("page.request.post(", "page.request.get(");
  expect(withoutExactAuthExchange).not.toMatch(/page\.request\.(?:post|put|patch|delete)|anonymous\.(?:post|put|patch|delete)|method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
  expect(liveSmoke).not.toMatch(/data-leaderboard-award-form|data-leaderboard-toggle-winner|reverse-event|idempotencyKey/); expect(liveSmoke).toContain("footballscience-leaderboard-v1");
  expect(liveSmoke).toContain("Array.isArray(direct?.events) ? direct.events.length : -1"); expect(liveSmoke).toContain("Array.isArray(uiPayload?.standings) ? uiPayload.standings.length : -1");
  expect(liveSmoke).toContain("data-leaderboard-home-open"); expect(liveSmoke).toContain("data-leaderboard-dialog-workspace"); expect(liveSmoke).toContain("expect([401, 403]).toContain(denied.status())");
  expect(liveSmoke).toContain("productionRef"); expect(liveSmoke).toContain("stagingRef"); expect(liveSmoke).toContain("forbiddenMethodCount");
  expect(liveSmoke).not.toMatch(/JSON\.stringify|toMatchObject|toEqual\(\[\]\)|forbiddenMethods|apiFailures|pageErrors|leaderboardConsoleErrors/);
  expect(liveSmoke).not.toMatch(/response\.url\(\).*push|request\(\)\.url\(\).*push|teamId.*console|console\.(?:log|warn|error)/);
  expect(liveSmokeConfig).toContain('trace: "off"'); expect(liveSmokeConfig).toContain('screenshot: "off"'); expect(liveSmokeConfig).toContain('video: "off"');
  expect(liveSmokeConfig).not.toMatch(/globalSetup|storageState|retain-on-failure/);
});
test("new files respect architecture size targets", () => {
  const lines = (source) => source.trimEnd().split("\n").length;
  expect(lines(runner)).toBeLessThan(500); expect(lines(evidence)).toBeLessThan(250); expect(lines(security)).toBeLessThan(250);
  expect(lines(liveSmoke)).toBeLessThan(250);
  expect(lines(liveSmokeConfig)).toBeLessThan(250);
  expect(lines(read("qa/leaderboard-production-code-release.api.spec.mjs"))).toBeLessThan(500);
});
