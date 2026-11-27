import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertClipDrawReleaseReview, assertClipDrawReviewTarget, verifyClipDrawReleaseReview,
  branchName, environmentName, repository } from "../scripts/lib/fs-player-clip-draw-release-review.mjs";

const sha = "a".repeat(40);
const owner = { login: "maklind88", id: 279889782 };
const proof = () => ({
  sha,
  run: { head_sha: sha, head_branch: branchName, repository: { full_name: repository },
    path: ".github/workflows/production-smoke.yml", event: "workflow_dispatch",
    display_title: `FS Player Draw and Present ${sha}`, status: "completed", conclusion: "success", run_attempt: 1 },
  environment: { id: 42, name: environmentName, can_admins_bypass: false,
    protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: owner }] }],
    deployment_branch_policy: { custom_branch_policies: true, protected_branches: false } },
  policies: { total_count: 1, branch_policies: [{ name: branchName, type: "branch" }] },
  approvals: [{ state: "approved", user: owner, environments: [{ id: 42, name: environmentName }] }],
});

test("review pins the branch, candidate and current live build", () => {
  const target = { repo: repository, ref: `refs/heads/${branchName}`, sha, expectedSha: sha, expectedLiveBuild: "dpl_a", liveBuild: "dpl_a" };
  assert.doesNotThrow(() => assertClipDrawReviewTarget(target));
  for (const change of [{ ref: "refs/heads/main" }, { repo: "other/repo" }, { expectedSha: "" }, { liveBuild: "dpl_b" }]) {
    assert.throws(() => assertClipDrawReviewTarget({ ...target, ...change }));
  }
});

test("only an exact, successful owner-approved original run may release", () => {
  assert.doesNotThrow(() => assertClipDrawReleaseReview(proof()));
  for (const change of [
    item => { item.sha = "b".repeat(40); },
    item => { item.run.run_attempt = 2; },
    item => { item.run.status = "waiting"; },
    item => { item.run.display_title = `FS Player tracking release ${sha}`; },
    item => { item.approvals[0].user = { login: "other", id: 123 }; },
    item => { item.approvals[0].state = "rejected"; },
    item => { item.approvals[0].environments[0].id = 43; },
    item => { item.environment.can_admins_bypass = true; },
    item => { item.environment.protection_rules = []; },
    item => { item.policies.branch_policies[0].name = "*"; },
  ]) {
    const item = proof(); change(item);
    assert.throws(() => assertClipDrawReleaseReview(item));
  }
});

test("the candidate cannot skip review or Safe Lane and does not affect unrelated releases", () => {
  const readApi = () => { throw new Error("GitHub unavailable"); };
  const params = { branch: branchName, sha, mode: "safe", readApi };
  assert.throws(() => verifyClipDrawReleaseReview(params), /CLIP_DRAW_RELEASE_REVIEW_RUN_ID/);
  assert.throws(() => verifyClipDrawReleaseReview({ ...params, runId: "123", readApi }), /GitHub unavailable/);
  for (const change of [{ mode: "fast" }, { skipGithubWait: true }, { branch: "main" }]) {
    assert.throws(() => verifyClipDrawReleaseReview({ ...params, ...change, runId: "123" }), /complete Safe Lane/);
  }
  assert.doesNotThrow(() => verifyClipDrawReleaseReview({ ...params, branch: "codex/unrelated", mode: "fast" }));
  const item = proof();
  const responses = [item.run, item.approvals, item.environment, item.policies];
  verifyClipDrawReleaseReview({ ...params, runId: "123", readApi: () => responses.shift() });
  assert.equal(responses.length, 0);
});

test("GitHub runs the isolated review without service secrets or deploy steps", () => {
  const source = readFileSync(new URL("../.github/workflows/production-smoke.yml", import.meta.url), "utf8");
  const job = source.slice(source.indexOf("  fs-player-clip-draw-review:"), source.indexOf("  dm-schedule-review:"));
  assert.match(job, /refs\/heads\/codex\/fs-player-clip-draw/);
  assert.match(job, /fs-player-clip-draw-review/);
  assert.ok(job.includes("ref: ${{ github.sha }}"));
  assert.match(job, /persist-credentials: false/);
  assert.match(job, /verify-fs-player-clip-draw-review-target\.mjs/);
  assert.doesNotMatch(job, /secrets\.|npm ci|npm run deploy|git push|continue-on-error/);
  assert.ok(job.match(/uses: [^\n]+/g).every(line => /@[a-f0-9]{40}$/.test(line)));
  const ship = readFileSync(new URL("../scripts/release-ship.mjs", import.meta.url), "utf8");
  assert.match(ship, /verifyClipDrawReleaseReview\(\{ branch: currentBranch\(\), sha: git\(\["rev-parse", "HEAD"\]\), mode,/);
  assert.match(ship, /runId: process\.env\.CLIP_DRAW_RELEASE_REVIEW_RUN_ID/);
});
