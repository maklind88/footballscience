import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { assertFreshReleaseTimestamp, assertRailEntries, assertReleaseEvidenceWindow, databaseAttestationDigest, normalizeNpmCiDrift, releaseCommandEnvironment, runSinglePreviewAttempt } from "../scripts/leaderboard-production-code-release.mjs";
import { assertCredentialHealth, assertEnvironmentRecord, assertEvidenceFresh, assertFreezeAttestation, assertRequiredSteps, assertRun, buildOwnerFreezeAttestation, otherActiveRuns } from "../scripts/lib/leaderboard-production-release-evidence.mjs";
import { assertArtifactPath, assertNoSecretLeak, assertOnlyMirroredOccurrences, assertSupabaseUrl, canonicalDigest, captureSecrets, childEnvironment, escapeWorkflowCommandData, readArtifact, redact, runChecked, sanitizedApiRequest, writeArtifact } from "../scripts/lib/leaderboard-production-release-security.mjs";
import { deploymentId } from "../scripts/lib/leaderboard-production-vercel-state.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(rootDir, relative), "utf8");
const workflow = read(".github/workflows/leaderboard-production-code-release.yml");
const runner = read("scripts/leaderboard-production-code-release.mjs");
const evidence = read("scripts/lib/leaderboard-production-release-evidence.mjs");
const security = read("scripts/lib/leaderboard-production-release-security.mjs");
const liveSmoke = read("qa/leaderboard-production-readonly.live.spec.mjs");
const liveSmokeConfig = read("qa/leaderboard-production-readonly.playwright.config.mjs");
const baseline = JSON.parse(read("scripts/leaderboard-production-release-baseline.json"));
const packageJson = JSON.parse(read("package.json"));

function ensureCandidateObject() {
  const git = (args) => execFileSync("git", ["-c", `safe.directory=${rootDir}`, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  try {
    git(["cat-file", "-e", `${baseline.candidate.sha}^{commit}`]);
  } catch {
    git(["fetch", "--no-tags", "--depth=1", "origin", baseline.candidate.featureRef]);
    expect(git(["rev-parse", "FETCH_HEAD^{commit}"])).toBe(baseline.candidate.sha);
  }
}

ensureCandidateObject();

test("baseline locks candidate, Files API, disabled production, and exact infra-only scope", () => {
  expect(baseline.repository).toEqual({ id: 1231879845, fullName: "maklind88/footballscience", defaultBranch: "main" });
  expect(baseline.candidate).toMatchObject({ sha: "c1b1821ab796bb680eb3480979542b6a461af964", tree: "4f1313f370d647fbffaa20236f6dee6a4412006a" });
  expect(baseline.vercel.filesApi).toMatchObject({ origin: "https://api.vercel.com", preview: { supabaseRef: "pokrksgempkuraueglpu", createTarget: null }, production: { enabled: false, requiredReadySubstate: "STAGED" } });
  expect(baseline.vercel.filesApi.project).toMatchObject({ commandForIgnoringBuildStep: null, candidateConfig: { file: "vercel.json", size: 1814, sha256: "341f61a369f0cd584d7a11aa0945e81605d0c064bc11603a8abc06f65b32d574", gitBlob: "6da4a55db7b42bb38ab409039f9ae9ebd50131c2", ignoreCommand: "node scripts/vercel-ignore-build.mjs" }, productionRequiresAutoAssignCustomDomains: false });
  expect(baseline.vercel.filesApi.preview.supabaseRef).toBe(baseline.supabase.stagingRef);
  expect(baseline.vercel).not.toHaveProperty("cliVersion");
  expect(baseline.allowedRailPaths).toEqual([
    ".github/workflows/leaderboard-production-code-release.yml", "package.json",
    "qa/leaderboard-production-code-release.api.spec.mjs", "qa/leaderboard-production-files-manifest.api.spec.mjs",
    "qa/leaderboard-production-readonly.live.spec.mjs", "qa/leaderboard-production-readonly.playwright.config.mjs",
    "qa/leaderboard-production-vercel-files.api.spec.mjs", "scripts/leaderboard-production-code-release.mjs",
    "scripts/leaderboard-production-release-baseline.json", "scripts/lib/leaderboard-production-release-evidence.mjs",
    "scripts/lib/leaderboard-production-release-security.mjs", "scripts/lib/leaderboard-production-source-manifest.mjs",
    "scripts/lib/leaderboard-production-vercel-deployments.mjs", "scripts/lib/leaderboard-production-vercel-files.mjs",
    "scripts/lib/leaderboard-production-vercel-state.mjs", "scripts/lib/leaderboard-production-vercel-transport.mjs",
  ]);
  expect(fs.existsSync(path.join(rootDir, "scripts/release-tools/vercel-cli/package.json"))).toBe(false);
  expect(fs.existsSync(path.join(rootDir, "scripts/release-tools/vercel-cli/package-lock.json"))).toBe(false);
  expect(Object.values(baseline.supabase.rowCounts)).toEqual([0, 0, 0, 0, 0]);
  expect(baseline.environments).toEqual({ plan: "leaderboard-production-code-release-plan", previewApply: "leaderboard-production-code-release-apply", reviewer: "maklind88", reviewerId: 279889782, externalOwnerAdminPredispatchAudit: { authority: "owner-admin-read-only", environmentSecrets: 0, environmentVariables: 0, runtimeVerified: false, status: "required-fresh-before-dispatch" } });
});

test("package delta is three isolated scripts and no dependency or hook", () => {
  const gitShow = (file) => execFileSync("git", ["-c", `safe.directory=${path.resolve(rootDir)}`, "show", `${baseline.candidate.sha}:${file}`], { cwd: rootDir, encoding: "utf8", env: { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: "1" } });
  const candidate = JSON.parse(gitShow("package.json"));
  const additions = {
    "check:leaderboard-production-release": "node --check scripts/leaderboard-production-code-release.mjs && node --check scripts/lib/leaderboard-production-release-evidence.mjs && node --check scripts/lib/leaderboard-production-release-security.mjs && node --check scripts/lib/leaderboard-production-source-manifest.mjs && node --check scripts/lib/leaderboard-production-vercel-deployments.mjs && node --check scripts/lib/leaderboard-production-vercel-files.mjs && node --check scripts/lib/leaderboard-production-vercel-state.mjs && node --check scripts/lib/leaderboard-production-vercel-transport.mjs && node --check qa/leaderboard-production-code-release.api.spec.mjs && node --check qa/leaderboard-production-files-manifest.api.spec.mjs && node --check qa/leaderboard-production-vercel-files.api.spec.mjs && node --check qa/leaderboard-production-readonly.live.spec.mjs && node --check qa/leaderboard-production-readonly.playwright.config.mjs",
    "qa:contracts:leaderboard-production-release": "playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/leaderboard-production-code-release.api.spec.mjs qa/leaderboard-production-files-manifest.api.spec.mjs qa/leaderboard-production-vercel-files.api.spec.mjs",
    "qa:live:leaderboard:readonly": "playwright test --config=qa/leaderboard-production-readonly.playwright.config.mjs qa/leaderboard-production-readonly.live.spec.mjs",
  };
  for (const [key, value] of Object.entries(additions)) expect(packageJson.scripts[key]).toBe(value);
  const without = structuredClone(packageJson); for (const key of Object.keys(additions)) delete without.scripts[key];
  expect(without).toEqual(candidate); expect(read("package-lock.json")).toBe(gitShow("package-lock.json"));
});

test("workflow is pinned, dispatch-only, PLAN then separately approved PREVIEW-APPLY", () => {
  expect(workflow).toContain("workflow_dispatch:"); expect(workflow).not.toMatch(/\n\s+(?:push|schedule|workflow_run):/);
  expect(workflow).toContain("contents: read\n  actions: read"); expect(workflow).not.toMatch(/(?:contents|actions|id-token|deployments): write/);
  expect(workflow.match(/environment:\n\s+name: leaderboard-production-code-release-plan/g)).toHaveLength(1);
  expect(workflow.match(/environment:\n\s+name: leaderboard-production-code-release-apply/g)).toHaveLength(1);
  expect(workflow.match(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g)).toHaveLength(3);
  expect(workflow.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/g)).toHaveLength(3);
  expect(workflow.match(/persist-credentials: false/g)).toHaveLength(3);
  expect(workflow.match(/node-version: 24\.15\.0/g)).toHaveLength(3);
  expect(workflow.match(/mcr\.microsoft\.com\/playwright:v1\.59\.1-noble@sha256:b0ab6f3cb99aa7803adbc14d9027ec1785fc6e433b97e134e0f8fe61683b6b53/g)).toHaveLength(1);
  expect(workflow).toContain("leaderboard-files-preview-plan-${{ github.run_id }}-${{ github.run_attempt }}");
  expect(workflow).toContain("EXPECTED_UPLOAD_DIGEST: ${{ needs.plan.outputs.artifact_digest }}");
  expect(workflow.match(/--mode preview-apply/g)).toHaveLength(1); expect(workflow.match(/\bnpm ci\b/g)).toHaveLength(1);
  expect(workflow).toContain("fresh owner/admin read-only audit"); expect(workflow).toContain("never claims visibility into hidden secret or variable counts");
  expect(evidence).not.toMatch(/\/environments\/[^`\n]*(?:secrets|variables)/);
  expect(workflow).not.toMatch(/vercel-cli|\bnpx\b|--prebuilt|--prod|\bpromote\b|\brollback\b|--mode apply|--mode cleanup|apply_migration|RELEASE_SKIP|RELEASE_ACK/i);
});

test("only the three reviewed Node runner steps inherit secrets", () => {
  const steps = workflow.split("\n      - name: "); const secretSteps = steps.filter((step) => step.includes("${{ secrets."));
  expect(secretSteps).toHaveLength(3); expect(secretSteps[0]).toContain("--mode environment-preflight"); expect(secretSteps[1]).toContain("--mode plan"); expect(secretSteps[2]).toContain("--mode preview-apply");
  for (const step of secretSteps) { expect(step).not.toContain("run: |"); expect(step.match(/\n\s+run:/g)).toHaveLength(1); expect(step).not.toMatch(/CRON_SECRET|LIVE_QA_PEER/); }
  const permissions = steps.find((step) => step.startsWith("Normalize downloaded plan permissions")); expect(permissions).toContain("chmod 0700"); expect(permissions).not.toContain("${{ secrets.");
});

test("runner has one preview create, no production mutation, no CLI, and final race gates", () => {
  expect(runner.match(/api\.createPreview\(body\.value\)/g)).toHaveLength(1);
  expect(runner).toContain("uploadSourceFiles"); expect(runner).toContain("resolveAmbiguousCreate"); expect(runner).toContain("preview_deployment_id");
  expect(runner).toContain("assertAliasesUnchanged"); expect(runner).toContain("verifyDeploymentFileContents"); expect(runner).toContain("qa:live:leaderboard:readonly");
  expect(runner).not.toMatch(/vercel-cli|\bnpx\b|--prebuilt|--prod|\bpromote\b|\brollback\b|buildStagedProductionCreateBody|apply_migration/i);
  const main = runner.slice(runner.indexOf("async function main")); expect(main.indexOf("assertNoProxyEnvironment();")).toBeLessThan(main.indexOf("captureSecrets(process.env)"));
  const plan = runner.slice(runner.indexOf("async function plan"), runner.indexOf("function assertCreateResponse"));
  expect(plan).not.toMatch(/uploadSourceFiles|createPreview|createPreview\(|cancel\(/);
  const apply = runner.slice(runner.indexOf("async function previewApply"), runner.indexOf("async function main"));
  const createAt = apply.indexOf("api.createPreview");
  for (const gate of ["assertGithubRace", "assertVercelState", "assertDbAttestation", "assertReleaseEvidenceWindow"]) expect(apply.lastIndexOf(gate)).toBeLessThan(createAt);
  const finalRace = apply.slice(apply.lastIndexOf("const finalGithub"), createAt);
  expect(finalRace).toMatch(/assertGithubRace[\s\S]*assertVercelState[\s\S]*assertDbAttestation[\s\S]*assertReleaseEvidenceWindow[\s\S]*buildPreviewCreateBody/);
  expect(finalRace.match(/\bawait\b/g)).toHaveLength(4); expect(runner).toContain("rows: 0");
  for (const identity of ["GITHUB_ACTOR", "GITHUB_TRIGGERING_ACTOR", "GITHUB_RUN_ATTEMPT", "GITHUB_REF_PROTECTED", "GITHUB_WORKFLOW_REF", "GITHUB_WORKFLOW_SHA"]) expect(runner).toContain(identity);
  expect(runner).toContain("baseline.vercel.filesApi.production.enabled === false"); expect(runner).toContain("console.error(redact(");
});

test("known unsafe create responses and unresolved transport still report identity and check aliases", async () => {
  const calls = { issue: 0, resolve: 0, identify: 0, report: 0, validate: 0, prove: 0, aliases: 0 };
  const known = { id: "dpl_KnownUnsafe", target: "production", alias: ["footballscience.xyz"] };
  await expect(runSinglePreviewAttempt({
    issue: async () => { calls.issue += 1; return known; },
    resolve: async () => { calls.resolve += 1; throw new Error("resolver must not run"); },
    identify: (record) => { calls.identify += 1; return deploymentId(record); },
    report: (record, id) => { calls.report += 1; expect(record.id).toBe(known.id); expect(id).toBe(known.id); },
    validate: () => { calls.validate += 1; throw new Error("known unsafe response"); },
    prove: async () => { calls.prove += 1; },
    assertAliases: async () => { calls.aliases += 1; throw new Error("alias moved"); },
  })).rejects.toThrow(/known unsafe response[\s\S]*alias moved/);
  expect(calls).toEqual({ issue: 1, resolve: 0, identify: 1, report: 1, validate: 1, prove: 0, aliases: 1 });

  const malformed = { issue: 0, resolve: 0, identify: 0, report: 0, validate: 0, prove: 0, aliases: 0 };
  const reconciled = { id: "dpl_Reconciled", target: null };
  await expect(runSinglePreviewAttempt({
    issue: async () => { malformed.issue += 1; return { id: "dpl_Conflict", uid: "dpl_Other" }; },
    resolve: async () => { malformed.resolve += 1; return reconciled; },
    identify: (record) => { malformed.identify += 1; return deploymentId(record); },
    report: (record, id) => { malformed.report += 1; expect(record).toBe(reconciled); expect(id).toBe(reconciled.id); },
    validate: (record) => { malformed.validate += 1; return record; },
    prove: async (_record, id) => { malformed.prove += 1; return id; },
    assertAliases: async () => { malformed.aliases += 1; },
  })).resolves.toBe(reconciled.id);
  expect(malformed).toEqual({ issue: 1, resolve: 1, identify: 2, report: 1, validate: 1, prove: 1, aliases: 1 });

  const missing = { issue: 0, resolve: 0, identify: 0, report: 0, validate: 0, prove: 0, aliases: 0 };
  await expect(runSinglePreviewAttempt({
    issue: async () => { missing.issue += 1; return {}; },
    resolve: async () => { missing.resolve += 1; throw new Error("UNKNOWN malformed 200 after bounded reconciliation"); },
    identify: (record) => { missing.identify += 1; return deploymentId(record); },
    report: () => { missing.report += 1; }, validate: () => { missing.validate += 1; }, prove: async () => { missing.prove += 1; },
    assertAliases: async () => { missing.aliases += 1; },
  })).rejects.toThrow(/UNKNOWN malformed 200 after bounded reconciliation/);
  expect(missing).toEqual({ issue: 1, resolve: 1, identify: 1, report: 0, validate: 0, prove: 0, aliases: 1 });

  const unresolved = { issue: 0, resolve: 0, identify: 0, report: 0, validate: 0, prove: 0, aliases: 0 };
  await expect(runSinglePreviewAttempt({
    issue: async () => { unresolved.issue += 1; throw new Error("transport unknown"); },
    resolve: async () => { unresolved.resolve += 1; throw new Error("UNKNOWN after bounded reconciliation"); },
    identify: () => { unresolved.identify += 1; },
    report: () => { unresolved.report += 1; }, validate: () => { unresolved.validate += 1; }, prove: async () => { unresolved.prove += 1; },
    assertAliases: async () => { unresolved.aliases += 1; },
  })).rejects.toThrow(/UNKNOWN after bounded reconciliation/);
  expect(unresolved).toEqual({ issue: 1, resolve: 1, identify: 0, report: 0, validate: 0, prove: 0, aliases: 1 });
});

test("GitHub run, environment, stale evidence, and active-run fixtures fail closed", () => {
  const expected = { runId: 1, workflowId: 2, branch: "main", event: "push", attempt: 1, conclusion: "success" };
  const exact = { id: 1, workflow_id: 2, head_sha: baseline.candidate.sha, head_branch: "main", event: "push", run_attempt: 1, status: "completed", conclusion: "success" };
  expect(() => assertRun(exact, expected, "fixture")).not.toThrow(); expect(() => assertRun({ ...exact, run_attempt: 2 }, expected, "fixture")).toThrow();
  expect(() => assertEvidenceFresh("2026-08-26T00:00:00Z", Date.parse("2026-08-26T01:00:00Z"))).not.toThrow(); expect(() => assertEvidenceFresh("2026-08-20T00:00:00Z", Date.parse("2026-08-26T01:00:00Z"))).toThrow(/stale/);
  expect(() => assertRequiredSteps({ steps: [{ name: "exact", conclusion: "failure" }] }, ["exact"])).toThrow(); expect(otherActiveRuns([{ id: 7 }, { id: 8 }, { id: 8 }], 7)).toEqual([{ id: 8 }]);
  const environment = { id: 7, name: baseline.environments.plan, can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", prevent_self_review: false, reviewers: [{ type: "User", reviewer: { id: baseline.environments.reviewerId, login: baseline.environments.reviewer } }] }, { type: "branch_policy" }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } };
  const policies = { total_count: 1, branch_policies: [{ id: 9, name: "main", type: "branch" }] };
  expect(assertEnvironmentRecord(environment, policies, { id: 7, name: baseline.environments.plan })).toMatchObject({ id: 7, policyId: 9 });
  for (const drift of [{ ...environment, can_admins_bypass: true }, { ...environment, protection_rules: environment.protection_rules.slice(1) }]) expect(() => assertEnvironmentRecord(drift, policies, { id: 7, name: baseline.environments.plan })).toThrow();
  expect(evidence).toContain('runtimeScope: "ids-protection-policies-only"'); expect(evidence).toContain("externalOwnerAdminAudit: externalAudit");
});

test("owner freeze and DB/plan freshness are exact and future-skew bounded", () => {
  const now = Date.parse("2026-08-26T12:00:00Z"); const observedAt = "2026-08-26T11:55:00Z";
  const rules = ["branch", "tag"].map((target, index) => ({ id: 100 + index, name: baseline.freezes[target].name, target, enforcement: "active", current_user_can_bypass: "never", updated_at: "2026-08-26T11:54:00Z", bypass_actors: [], conditions: { ref_name: { include: ["~ALL"], exclude: [] } }, rules: [{ type: "creation" }, { type: "update", parameters: { update_allows_fetch_and_merge: false } }, { type: "deletion" }] }));
  const owner = buildOwnerFreezeAttestation(rules, observedAt, now); expect(owner.authority).toBe("owner-admin-reviewed");
  const apiOrdered = rules.map((rule) => ({ ...rule, conditions: { ref_name: { exclude: [], include: ["~ALL"] } } }));
  expect(buildOwnerFreezeAttestation(apiOrdered, observedAt, now).digest).toBe(owner.digest);
  const visible = rules.map(({ bypass_actors, ...rule }) => rule); expect(assertFreezeAttestation(visible, observedAt, owner.digest, now).digest).toBe(owner.digest);
  expect(() => assertFreezeAttestation(visible, observedAt, "f".repeat(64), now)).toThrow(/digest/);
  const prior = process.env.FREEZE_ATTESTATION_SHA256; process.env.FREEZE_ATTESTATION_SHA256 = owner.digest;
  try { expect(assertReleaseEvidenceWindow({ createdAt: observedAt }, { observedAt }, owner, now)).toBe(true); expect(() => assertReleaseEvidenceWindow({ createdAt: observedAt }, { observedAt }, owner, now + 46 * 60_000)).toThrow(/stale/); } finally { if (prior === undefined) delete process.env.FREEZE_ATTESTATION_SHA256; else process.env.FREEZE_ATTESTATION_SHA256 = prior; }
  expect(databaseAttestationDigest(observedAt)).toMatch(/^[0-9a-f]{64}$/); expect(() => assertFreshReleaseTimestamp("2026-08-26T12:03:00Z", 60_000, now)).toThrow(/future/);
});

test("live, staging, and generated-preview credentials are exact-origin read-only proofs", async () => {
  const identity = { ok: true, scope: { teams: [{ id: "team", clubId: "club", organizationId: "org", status: "active" }], memberships: [{ scope: "team", teamId: "team", status: "active" }], manageable: { canManagePlatform: true } } };
  for (const target of ["live", "staging", "preview"]) {
    const expectedRef = target === "live" ? baseline.supabase.productionRef : baseline.supabase.stagingRef; const host = target === "live" ? baseline.hosts.production : target === "staging" ? baseline.hosts.staging : "footballscience-proof-makattack.vercel.app"; const calls = [];
    const fetcher = async (url, options = {}) => { calls.push({ method: options.method || "GET", redirect: options.redirect }); if (url.endsWith("auth-health")) return { ok: true, service: "supabase-auth" }; if (url.endsWith("client-config") && options.method === "POST") return { ok: true, session: { access_token: "a", refresh_token: "r" } }; if (url.endsWith("client-config")) return { url: `https://${expectedRef}.supabase.co` }; return identity; };
    const input = { target, baseUrl: `https://${host}`, username: "u", password: "p", ...(target === "preview" ? { expectedHost: host, expectedRef, deniedRef: baseline.supabase.productionRef } : {}) };
    expect((await assertCredentialHealth(input, fetcher)).tenant).toBe(expectedRef); expect(calls.map(({ method }) => method)).toEqual(["GET", "POST", "GET", "GET"]); expect(calls.every(({ redirect }) => redirect === "error")).toBe(true);
  }
  await expect(assertCredentialHealth({ target: "live", baseUrl: "https://footballscience.xyz.attacker.example", username: "u", password: "p" }, async () => ({}))).rejects.toThrow(/exact expected origin/);
});

test("secrets, hostile child output, large-file scans, and artifacts fail closed", async () => {
  expect(escapeWorkflowCommandData("secret%\r\n::warning::hostile")).toBe("secret%25%0D%0A::warning::hostile");
  const token = "eyJ.fake-token+/="; const team = "11111111-2222-4333-8444-555555555555";
  let outward; try { await sanitizedApiRequest("identity", async () => { throw new Error(`Authorization: Bearer ${token}?teamId=${team}`); }); } catch (error) { outward = error; }
  expect(outward.message).toBe("Leaderboard read-only request failed: identity."); expect(Object.hasOwn(outward, "cause")).toBe(false);
  const child = 'const t=process.env.T,id=process.env.I,e=encodeURIComponent(t),x=`Authorization: Bearer ${t}\\nAuthorization%3A%20Bearer%20${e}%26teamId%3D${id}\\n`;process.stdout.write(x);process.stderr.write(x);process.exit(7)'; let errorText = "";
  try { runChecked("hostile child", process.execPath, ["-e", child], { env: childEnvironment({ T: token, I: team }) }); } catch (error) { errorText = error.message; }
  for (const raw of [token, encodeURIComponent(token), team]) expect(errorText).not.toContain(raw); expect(redact(`Bearer ${token}`, {})).toBe("Bearer ***");
  const source = { GITHUB_ACTIONS: "false", GITHUB_TOKEN: "token-secret", VERCEL_TOKEN: "vercel-secret" }; const secrets = captureSecrets(source); expect(source.GITHUB_TOKEN).toBeUndefined(); expect(() => assertNoSecretLeak({ value: "token-secret" }, secrets)).toThrow();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "leaderboard-files-")); try { const sourceDir = path.join(temp, "source"); const output = path.join(temp, "output"); fs.mkdirSync(sourceDir); fs.mkdirSync(output); const large = path.join(output, "large.bin"); const descriptor = fs.openSync(large, "w"); fs.ftruncateSync(descriptor, 26 * 1024 * 1024); fs.writeSync(descriptor, Buffer.from(baseline.supabase.stagingRef), 0, baseline.supabase.stagingRef.length, 26 * 1024 * 1024 - 64); fs.closeSync(descriptor); expect(() => assertOnlyMirroredOccurrences(output, sourceDir, baseline.supabase.stagingRef, [])).toThrow(/unexpected staging-reference/); const link = path.join(output, "link"); fs.symlinkSync(large, link); expect(() => assertOnlyMirroredOccurrences(output, sourceDir, "absent", [])).toThrow(/symlink or special/); } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  const planTemp = fs.mkdtempSync(path.join(os.tmpdir(), "leaderboard-plan-")); try { fs.chmodSync(planTemp, 0o700); const file = path.join(planTemp, "plan.json"); const value = { schema: "test", digest: canonicalDigest({ ok: true }) }; const written = writeArtifact(file, value); expect(readArtifact(file, written.sha256).value).toEqual(value); fs.chmodSync(file, 0o644); expect(() => readArtifact(file, written.sha256)).toThrow(/0600/); expect(() => assertArtifactPath(path.join(planTemp, "..", "escape"), planTemp)).toThrow(); } finally { fs.rmSync(planTemp, { recursive: true, force: true }); }
});

test("npm-ci normalization is narrow and smoke remains read-only", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "leaderboard-npm-")); try { execFileSync("git", ["init", "-q"], { cwd: temp }); execFileSync("git", ["config", "user.name", "contract"], { cwd: temp }); execFileSync("git", ["config", "user.email", "contract@example.test"], { cwd: temp }); fs.writeFileSync(path.join(temp, "package-lock.json"), '{"name":"footballscience","lockfileVersion":3,"packages":{}}\n'); execFileSync("git", ["add", "package-lock.json"], { cwd: temp }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: temp }); fs.writeFileSync(path.join(temp, "package-lock.json"), '{"lockfileVersion":3,"packages":{}}\n'); expect(normalizeNpmCiDrift(temp)).toBe("restored-root-name-only"); } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  expect(liveSmoke.match(/sanitizedApiRequest\(/g)).toHaveLength(6); expect(liveSmoke.match(/maxRedirects: 0/g)).toHaveLength(5); expect(liveSmoke).toContain('["GET", "HEAD", "OPTIONS"]'); expect(liveSmoke).not.toMatch(/JSON\.stringify|toMatchObject|toEqual\(\[\]\)|console\.(?:log|warn|error)/);
  expect(liveSmokeConfig).toContain('trace: "off"'); expect(liveSmokeConfig).not.toMatch(/globalSetup|storageState|retain-on-failure/);
});

test("new rail files stay within architecture targets", () => {
  const lines = (file) => read(file).trimEnd().split("\n").length;
  for (const file of ["scripts/leaderboard-production-code-release.mjs", "scripts/lib/leaderboard-production-release-evidence.mjs", "scripts/lib/leaderboard-production-release-security.mjs", "scripts/lib/leaderboard-production-source-manifest.mjs", "scripts/lib/leaderboard-production-vercel-deployments.mjs", "scripts/lib/leaderboard-production-vercel-files.mjs", "scripts/lib/leaderboard-production-vercel-state.mjs", "scripts/lib/leaderboard-production-vercel-transport.mjs", "qa/leaderboard-production-code-release.api.spec.mjs", "qa/leaderboard-production-files-manifest.api.spec.mjs", "qa/leaderboard-production-vercel-files.api.spec.mjs", "qa/leaderboard-production-readonly.live.spec.mjs"]) expect(lines(file)).toBeLessThan(500);
});
