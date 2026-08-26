import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertSupabaseUrl, canonicalDigest, canonicalJson, fetchBytes, fetchJson, invariant, readJson, sha256 } from "./leaderboard-production-release-security.mjs";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = readJson(path.join(rootDir, "scripts/leaderboard-production-release-baseline.json"), "release baseline");
const githubHeaders = { "X-GitHub-Api-Version": "2026-03-10", Accept: "application/vnd.github+json" };
const activeStatuses = ["in_progress", "pending", "queued", "requested", "waiting"];
const requiredRuleTypes = ["creation", "update", "deletion"];
const freezeAttestationSchema = "footballscience-leaderboard-freeze-attestation-v1";
async function github(pathname, token, label) {
  return fetchJson(`https://api.github.com/repos/${baseline.repository.fullName}${pathname}`, { token, label, headers: githubHeaders });
}
async function githubPages(pathname, token, label) {
  const items = [];
  for (let page = 1; page <= 20; page += 1) {
    const join = pathname.includes("?") ? "&" : "?";
    const payload = await github(`${pathname}${join}per_page=100&page=${page}`, token, label);
    const next = Array.isArray(payload) ? payload : payload.workflow_runs ?? payload.jobs;
    invariant(Array.isArray(next), `${label} returned a malformed collection.`);
    items.push(...next);
    if (next.length < 100) return items;
  }
  throw new Error(`${label} exceeded the fail-closed pagination bound.`);
}
export function assertRun(run, expected, label) {
  invariant(Number(run.id) === expected.runId && Number(run.workflow_id) === expected.workflowId, `${label} run/workflow identity drifted.`);
  invariant(run.head_sha === (expected.sha || baseline.candidate.sha) && run.head_branch === expected.branch, `${label} SHA/branch drifted.`);
  invariant(run.event === expected.event && Number(run.run_attempt) === expected.attempt, `${label} event/attempt drifted.`);
  invariant(run.status === "completed" && run.conclusion === expected.conclusion, `${label} status/conclusion drifted.`);
}
export function assertEvidenceFresh(createdAt, now = Date.now(), maxAgeMs = 72 * 60 * 60_000) {
  const createdMs = Date.parse(createdAt);
  invariant(Number.isFinite(createdMs) && now >= createdMs && now - createdMs < maxAgeMs, "Release evidence is stale or from the future.");
  return createdMs;
}
function assertFreshObservation(observedAt, now = Date.now(), maxAgeMs = 30 * 60_000) {
  const observedMs = Date.parse(observedAt);
  invariant(Number.isFinite(observedMs) && now - observedMs <= maxAgeMs && observedMs - now <= 120_000, "External observation is stale or from the future.");
  return observedMs;
}
function normalizeFreezeRule(rule, requireBypass) {
  const expected = baseline.freezes?.[rule?.target];
  invariant(expected && Number.isSafeInteger(Number(rule.id)) && Number(rule.id) > 0, "Freeze ruleset identity/target drifted.");
  invariant(rule.name === expected.name && rule.enforcement === "active" && rule.current_user_can_bypass === "never", `${rule.target} freeze name/enforcement/reviewer drifted.`);
  invariant(canonicalJson(rule.conditions) === canonicalJson({ ref_name: { include: ["~ALL"], exclude: [] } }), `${rule.target} freeze conditions drifted.`);
  const conditions = { ref_name: { include: ["~ALL"], exclude: [] } };
  invariant(Array.isArray(rule.rules) && canonicalJson(rule.rules.map(({ type }) => type)) === canonicalJson(requiredRuleTypes), `${rule.target} freeze rules drifted.`);
  const [creation, update, deletion] = rule.rules;
  invariant(canonicalJson(Object.keys(creation).sort()) === canonicalJson(["type"]) && canonicalJson(Object.keys(deletion).sort()) === canonicalJson(["type"]), `${rule.target} freeze non-update rule schema drifted.`);
  const updateKeys = Object.keys(update).sort();
  invariant(canonicalJson(updateKeys) === canonicalJson(["type"]) || canonicalJson(updateKeys) === canonicalJson(["parameters", "type"]), `${rule.target} freeze update schema drifted.`);
  if (requireBypass) invariant(canonicalJson(update.parameters) === canonicalJson({ update_allows_fetch_and_merge: false }), `${rule.target} owner freeze update parameters drifted.`);
  else if (update.parameters !== undefined) invariant(canonicalJson(update.parameters) === canonicalJson({ update_allows_fetch_and_merge: false }), `${rule.target} freeze update parameters drifted.`);
  if (requireBypass) invariant(Object.hasOwn(rule, "bypass_actors") && Array.isArray(rule.bypass_actors) && rule.bypass_actors.length === 0, `${rule.target} owner attestation did not prove empty bypass actors.`);
  else if (Object.hasOwn(rule, "bypass_actors")) invariant(Array.isArray(rule.bypass_actors) && rule.bypass_actors.length === 0, `${rule.target} visible bypass actors were nonempty or malformed.`);
  invariant(Number.isFinite(Date.parse(rule.updated_at)), `${rule.target} freeze updated_at was invalid.`);
  const payload = { name: rule.name, target: rule.target, enforcement: rule.enforcement, bypass_actors: [], conditions, rules: [{ type: "creation" }, { type: "update", parameters: { update_allows_fetch_and_merge: false } }, { type: "deletion" }] };
  const payloadSha256 = sha256(JSON.stringify(payload));
  invariant(payloadSha256 === expected.payloadSha256, `${rule.target} observed freeze payload bytes drifted.`);
  return {
    id: Number(rule.id), name: rule.name, target: rule.target, updatedAt: rule.updated_at,
    payloadSha256, bypassActors: [], reviewerCanBypass: "never",
    conditions,
    rules: [{ type: "creation" }, { type: "update", parameters: { update_allows_fetch_and_merge: false } }, { type: "deletion" }],
  };
}
function freezeAttestationCore(rules, observedAt, requireBypass) {
  invariant(Array.isArray(rules) && rules.length === 2, "Freeze attestation requires exact branch+tag rulesets.");
  const normalized = rules.map((rule) => normalizeFreezeRule(rule, requireBypass)).sort((a, b) => a.target.localeCompare(b.target));
  invariant(canonicalJson(normalized.map(({ target }) => target)) === canonicalJson(["branch", "tag"]), "Freeze attestation targets drifted.");
  invariant(new Set(normalized.map(({ id }) => id)).size === 2, "Freeze attestation ruleset ids were not unique.");
  const observedMs = Date.parse(observedAt);
  for (const rule of normalized) invariant(Date.parse(rule.updatedAt) <= observedMs + 120_000, `${rule.target} freeze was updated after the external observation.`);
  return { schema: freezeAttestationSchema, repositoryId: baseline.repository.id, observedAt, rules: normalized };
}
export function buildOwnerFreezeAttestation(rules, observedAt, now = Date.now()) {
  assertFreshObservation(observedAt, now);
  const core = freezeAttestationCore(rules, observedAt, true);
  return { ...core, digest: canonicalDigest(core), authority: "owner-admin-reviewed" };
}
export function assertFreezeAttestation(rules, observedAt = process.env.FREEZE_OBSERVED_AT, expectedDigest = process.env.FREEZE_ATTESTATION_SHA256, now = Date.now()) {
  assertFreshObservation(observedAt, now);
  const core = freezeAttestationCore(rules, observedAt, false);
  const digest = canonicalDigest(core);
  invariant(/^[0-9a-f]{64}$/.test(String(expectedDigest || "")) && expectedDigest === digest, "Owner/admin freeze attestation digest drifted.");
  return { ...core, digest, authority: "owner-admin-reviewed" };
}
export function assertFreezeFresh(attestation, now = Date.now()) {
  assertFreshObservation(attestation?.observedAt, now);
  invariant(attestation?.digest === process.env.FREEZE_ATTESTATION_SHA256, "Freeze attestation digest drifted at the final race gate.");
  return attestation;
}
export function assertVercelDeploymentRecords(deployments, label = "Vercel deployment list") {
  invariant(Array.isArray(deployments), `${label} was malformed.`);
  const ids = new Set();
  for (const deployment of deployments) {
    invariant(deployment && typeof deployment === "object" && !Array.isArray(deployment), `${label} contained a malformed record.`);
    const id = deployment.id || deployment.uid;
    const readyState = deployment.readyState;
    const state = deployment.state;
    const timestamp = Number(deployment.createdAt ?? deployment.created);
    invariant(/^dpl_[A-Za-z0-9]+$/.test(String(id || "")) && !ids.has(id) && (!deployment.id || !deployment.uid || deployment.id === deployment.uid), `${label} contained a missing, conflicting, or duplicate deployment id.`);
    invariant([readyState, state].some((value) => ["BUILDING", "CANCELED", "ERROR", "INITIALIZING", "QUEUED", "READY"].includes(value)) && (!readyState || !state || readyState === state), `${label} contained an unknown or conflicting state.`);
    invariant(Object.hasOwn(deployment, "target") && [null, "production"].includes(deployment.target), `${label} contained a missing or unreviewed target.`);
    invariant(deployment.projectId === baseline.vercel.projectId && Number.isFinite(timestamp) && timestamp > 0, `${label} project/timestamp drifted.`);
    invariant(deployment.meta && typeof deployment.meta === "object" && !Array.isArray(deployment.meta), `${label} metadata was missing or malformed.`);
    ids.add(id);
  }
  return deployments;
}
function hasCoveredActiveTeam(identity) {
  const teams = Array.isArray(identity?.scope?.teams) ? identity.scope.teams : [];
  const memberships = Array.isArray(identity?.scope?.memberships) ? identity.scope.memberships : [];
  return teams.some((team) => team.status === "active" && memberships.some((membership) => {
    if (membership.status !== "active") return false;
    if (membership.scope === "team") return membership.teamId === team.id;
    if (membership.scope === "club") return Boolean(team.clubId && membership.clubId === team.clubId);
    return membership.scope === "organization" && membership.organizationId === team.organizationId;
  }));
}
export async function assertCredentialHealth(input, fetcher = fetchJson) {
  const target = String(input.target || "");
  invariant(target === "live" || target === "staging" || target === "preview", "Credential proof target must be live, staging, or preview.");
  const base = new URL(input.baseUrl);
  const expectedHost = target === "preview" ? String(input.expectedHost || "") : target === "staging" ? baseline.hosts.staging : baseline.hosts.production;
  if (target === "preview") invariant(/^footballscience-[a-z0-9]+-makattack\.vercel\.app$/.test(expectedHost), "Preview credential proof host was not a generated deployment host.");
  invariant(base.href === `https://${expectedHost}/`, "Credential proof base URL did not match the exact expected origin.");
  const expectedRef = target === "preview" ? String(input.expectedRef || "") : target === "staging" ? baseline.supabase.stagingRef : baseline.supabase.productionRef;
  const deniedRef = target === "preview" ? String(input.deniedRef || "") : target === "staging" ? baseline.supabase.productionRef : baseline.supabase.stagingRef;
  const health = await fetcher(new URL("/api/auth-health", base).href, { label: `${target} auth health`, redirect: "error" });
  invariant(health.ok === true && health.service === "supabase-auth", `${target} auth health was not ready.`);
  const login = await fetcher(new URL("/api/client-config", base).href, {
    method: "POST",
    body: { email: input.username, password: input.password },
    label: `${target} credential exchange`,
    redirect: "error",
  });
  const accessToken = String(login.session?.access_token || "");
  invariant(login.ok === true && accessToken && login.session?.refresh_token, `${target} credentials did not produce an authenticated session.`);
  const config = await fetcher(new URL("/api/client-config", base).href, { label: `${target} client config`, redirect: "error" });
  assertSupabaseUrl(config.url, expectedRef, deniedRef);
  const identity = await fetcher(new URL("/api/platform-identity", base).href, { token: accessToken, label: `${target} authenticated identity`, redirect: "error" });
  invariant(identity.ok === true && hasCoveredActiveTeam(identity), `${target} credentials lacked a covered active team identity.`);
  if (target === "live") invariant(identity.scope?.manageable?.canManagePlatform === true, "Live credential proof did not establish server-owned platform admin authority.");
  return { target, host: base.hostname, auth: "ok", tenant: expectedRef, platformAdmin: target === "live" };
}
async function assertFreezeRules(token) {
  const summaries = await githubPages("/rulesets?includes_parents=true", token, "list repository rulesets");
  const exact = [];
  for (const summary of summaries.filter((item) => item.enforcement === "active")) {
    const rule = await github(`/rulesets/${summary.id}`, token, `ruleset ${summary.id}`);
    const target = String(rule.target || "");
    const include = rule.conditions?.ref_name?.include;
    invariant(Array.isArray(include), "Ruleset conditions were malformed.");
    if ((target === "branch" || target === "tag") && canonicalJson(include) === canonicalJson(["~ALL"])) exact.push(rule);
  }
  invariant(exact.length === 2 && new Set(exact.map((rule) => rule.target)).size === 2, "Exact active branch+tag freezes were not present.");
  for (const rule of exact) {
    normalizeFreezeRule(rule, false);
  }
  for (const ref of ["main", "staging", baseline.candidate.featureRef]) {
    const effective = await github(`/rules/branches/${encodeURIComponent(ref)}`, token, `effective rules for ${ref}`);
    const branchId = exact.find((rule) => rule.target === "branch").id;
    const types = effective.filter((rule) => Number(rule.ruleset_id) === Number(branchId)).map(({ type }) => type).sort();
    invariant(canonicalJson(types) === canonicalJson([...requiredRuleTypes].sort()), `Effective branch freeze drifted for ${ref}.`);
  }
  return exact;
}
export function otherActiveRuns(runs, currentRunId) {
  return [...new Map(runs.map((run) => [run.id, run])).values()].filter((run) => Number(run.id) !== Number(currentRunId));
}
async function assertNoOtherActions(token) {
  const current = Number(process.env.GITHUB_RUN_ID);
  const active = [];
  for (const status of activeStatuses) active.push(...await githubPages(`/actions/runs?status=${status}`, token, `list ${status} workflow runs`));
  const other = otherActiveRuns(active, current);
  invariant(other.length === 0, `Another GitHub Actions run is active: ${other.map(({ id, name, status }) => `${id}/${name}/${status}`).join(", ")}.`);
}
export function assertRequiredSteps(job, requiredNames) {
  for (const name of requiredNames) invariant(job?.steps?.some((step) => step.name === name && step.conclusion === "success"), `Required step failed or disappeared: ${name}.`);
  return true;
}
export function assertEnvironmentRecord(environment, policies, expected) {
  invariant(Number(environment.id) === Number(expected.id) && environment.name === expected.name, `${expected.name} environment identity drifted.`);
  invariant(environment.can_admins_bypass === false, `${expected.name} allowed administrator bypass.`);
  const rules = environment.protection_rules || [];
  invariant(canonicalJson(rules.map(({ type }) => type).sort()) === canonicalJson(["branch_policy", "required_reviewers"]), `${expected.name} protection rules drifted.`);
  const reviewerRule = rules.find(({ type }) => type === "required_reviewers");
  invariant(reviewerRule?.prevent_self_review === false && reviewerRule.reviewers?.length === 1, `${expected.name} reviewer policy drifted.`);
  const reviewer = reviewerRule.reviewers[0];
  invariant(reviewer.type === "User" && reviewer.reviewer?.id === baseline.environments.reviewerId && reviewer.reviewer?.login === baseline.environments.reviewer, `${expected.name} required reviewer drifted.`);
  invariant(canonicalJson(environment.deployment_branch_policy) === canonicalJson({ protected_branches: false, custom_branch_policies: true }), `${expected.name} branch policy mode drifted.`);
  invariant(policies.total_count === 1 && policies.branch_policies?.length === 1 && policies.branch_policies[0].name === "main" && policies.branch_policies[0].type === "branch", `${expected.name} must have exactly one main-only branch policy.`);
  return { id: Number(environment.id), name: environment.name, policyId: Number(policies.branch_policies[0].id) };
}
export async function assertReleaseEnvironments(token) {
  const expected = [
    { name: baseline.environments.plan, id: process.env.EXPECTED_PLAN_ENVIRONMENT_ID },
    { name: baseline.environments.previewApply, id: process.env.EXPECTED_PREVIEW_APPLY_ENVIRONMENT_ID },
  ];
  const results = [];
  for (const item of expected) {
    invariant(/^\d+$/.test(String(item.id || "")), `${item.name} expected environment id is invalid.`);
    const encoded = encodeURIComponent(item.name);
    const environment = await github(`/environments/${encoded}`, token, `${item.name} environment`);
    const policies = await github(`/environments/${encoded}/deployment-branch-policies?per_page=100&page=1`, token, `${item.name} branch policies`);
    results.push(assertEnvironmentRecord(environment, policies, item));
  }
  const externalAudit = baseline.environments.externalOwnerAdminPredispatchAudit; invariant(canonicalJson(externalAudit) === canonicalJson({ authority: "owner-admin-read-only", environmentSecrets: 0, environmentVariables: 0, runtimeVerified: false, status: "required-fresh-before-dispatch" }), "External environment secret/variable audit policy drifted.");
  return { records: results, runtimeScope: "ids-protection-policies-only", externalOwnerAdminAudit: externalAudit };
}
export async function assertGithubRace(token) {
  for (const [ref, sha] of [["main", process.env.GITHUB_SHA], ["staging", baseline.candidate.sha], [baseline.candidate.featureRef, baseline.candidate.sha]]) {
    const payload = await github(`/git/ref/heads/${encodeURIComponent(ref)}`, token, `ref ${ref}`);
    invariant(payload.object?.sha === sha, `Remote ${ref} drifted.`);
  }
  await assertNoOtherActions(token);
  return { freezes: assertFreezeAttestation(await assertFreezeRules(token)) };
}
export async function assertGithubEvidence(token) {
  const repo = await fetchJson(`https://api.github.com/repositories/${baseline.repository.id}`, { token, label: "repository identity", headers: githubHeaders });
  invariant(repo.full_name === baseline.repository.fullName && repo.default_branch === "main", "Repository id/name/default branch drifted.");
  const { freezes } = await assertGithubRace(token); const environments = await assertReleaseEnvironments(token);
  const codeqlExpected = { ...baseline.evidence.codeql, workflowId: baseline.workflows.codeql };
  const codeql = await github(`/actions/runs/${codeqlExpected.runId}`, token, "CodeQL evidence");
  assertRun(codeql, codeqlExpected, "CodeQL");
  const qaExpected = { ...baseline.evidence.qa, workflowId: baseline.workflows.qa };
  const qa = await github(`/actions/runs/${qaExpected.runId}`, token, "QA evidence");
  assertRun(qa, qaExpected, "QA");
  const qaJobs = await githubPages(`/actions/runs/${qaExpected.runId}/jobs`, token, "QA jobs");
  invariant(qaJobs.length === qaExpected.expectedJobs, "QA job count drifted.");
  const failed = qaJobs.filter(({ conclusion }) => conclusion === "failure");
  invariant(failed.length === 1 && failed[0].id === qaExpected.failedJobId && failed[0].name === qaExpected.failedJobName, "QA failure was not the single accepted iframe job.");
  invariant(qaJobs.filter(({ conclusion }) => conclusion === "success").length === qaExpected.expectedJobs - 1, "A non-baseline QA job did not succeed.");
  const log = await fetchBytes(`https://api.github.com/repos/${baseline.repository.fullName}/actions/jobs/${qaExpected.failedJobId}/logs`, { token, label: "accepted QA failure log" });
  const logText = log.bytes.toString("utf8").replace(/\u001b\[[0-9;]*m/g, "");
  for (const proof of [qaExpected.failure.url, qaExpected.failure.test, qaExpected.failure.message, qaExpected.failure.counts, `"lineNumber": ${qaExpected.failure.lineNumber}`, `"columnNumber": ${qaExpected.failure.columnNumber}`, "  1 failed", "  38 passed"]) {
    invariant(logText.includes(proof), `Accepted QA log signature drifted: ${proof}.`);
  }
  const stagingExpected = { ...baseline.evidence.stagingSmoke, workflowId: baseline.workflows.stagingSmoke };
  const staging = await github(`/actions/runs/${stagingExpected.runId}`, token, "Staging Smoke evidence");
  assertRun(staging, stagingExpected, "Staging Smoke");
  assertEvidenceFresh(staging.created_at);
  const jobs = await githubPages(`/actions/runs/${stagingExpected.runId}/jobs`, token, "Staging Smoke jobs");
  const job = jobs.find(({ id }) => id === stagingExpected.jobId);
  invariant(jobs.length === 1 && job?.conclusion === "success", "Staging Smoke job identity/conclusion drifted.");
  assertRequiredSteps(job, stagingExpected.requiredSteps);
  return { freezes, environments, codeqlRunId: codeql.id, qaRunId: qa.id, stagingRunId: staging.id, stagingJobId: job.id };
}
