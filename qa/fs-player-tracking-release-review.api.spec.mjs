import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { assertTrackingReviewTarget, assertTrackingReleaseReview, verifyTrackingReleaseReview,
  reviewBranch, reviewEnvironment, reviewOwner, reviewRepository } from "../scripts/lib/fs-player-tracking-release-review.mjs";

const sha = "a".repeat(40);
function evidence() {
  return {
    sha,
    run: { head_sha: sha, head_branch: reviewBranch, repository: { full_name: reviewRepository },
      path: ".github/workflows/production-smoke.yml", event: "workflow_dispatch",
      display_title: `FS Player tracking release ${sha}`, status: "completed", conclusion: "success", run_attempt: 1 },
    environment: { id: 42, name: reviewEnvironment, can_admins_bypass: false,
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: reviewOwner }] }],
      deployment_branch_policy: { custom_branch_policies: true, protected_branches: false } },
    policies: { total_count: 1, branch_policies: [{ name: reviewBranch, type: "branch" }] },
    approvals: [{ state: "approved", user: reviewOwner, environments: [{ id: 42, name: reviewEnvironment }] }],
  };
}

test("tracking review pins the exact candidate and current live build", () => {
  const input = { repository: reviewRepository, ref: `refs/heads/${reviewBranch}`, sha, expectedSha: sha,
    expectedLiveBuild: "dpl_current", liveBuild: "dpl_current" };
  expect(() => assertTrackingReviewTarget(input)).not.toThrow();
  for (const change of [{ repository: "other/repo" }, { ref: "refs/heads/main" }, { sha: "b".repeat(40) },
    { expectedSha: "" }, { expectedLiveBuild: "" }, { liveBuild: "changed" }]) {
    expect(() => assertTrackingReviewTarget({ ...input, ...change })).toThrow();
  }
});

test("tracking release accepts an exact successful human approval", () => {
  expect(() => assertTrackingReleaseReview(evidence())).not.toThrow();
});

for (const [name, mutate] of [
  ["changed SHA", e => { e.sha = "b".repeat(40); }],
  ["wrong title", e => { e.run.display_title = `DM/Schedule release ${sha}`; }],
  ["wrong repository", e => { e.run.repository.full_name = "other/repo"; }],
  ["wrong workflow", e => { e.run.path = ".github/workflows/other.yml"; }],
  ["wrong event", e => { e.run.event = "push"; }],
  ["unreviewed branch", e => { e.run.head_branch = "main"; }],
  ["failed run", e => { e.run.conclusion = "failure"; }],
  ["unfinished run", e => { e.run.status = "in_progress"; }],
  ["rerun", e => { e.run.run_attempt = 2; }],
  ["missing approval", e => { e.approvals = []; }],
  ["rejection", e => { e.approvals[0].state = "rejected"; }],
  ["different reviewer", e => { e.approvals[0].user = { id: 99, login: "other" }; }],
  ["different environment", e => { e.approvals[0].environments[0].id = 43; }],
  ["admin bypass", e => { e.environment.can_admins_bypass = true; }],
  ["removed reviewer", e => { e.environment.protection_rules = []; }],
  ["broadened branch policy", e => { e.policies.branch_policies[0].name = "*"; }],
  ["extra branch policy", e => { e.policies.total_count = 2; }],
]) {
  test(`tracking review rejects ${name}`, () => {
    const item = evidence(); mutate(item);
    expect(() => assertTrackingReleaseReview(item)).toThrow();
  });
}

test("tracking candidate cannot skip review or Safe Lane; other releases are unchanged", () => {
  const readApi = () => { throw new Error("Must not call GitHub"); };
  expect(() => verifyTrackingReleaseReview({ branch: reviewBranch, sha, mode: "safe", readApi })).toThrow(/TRACKING_RELEASE_REVIEW_RUN_ID/);
  for (const options of [{ mode: "fast" }, { mode: "safe", skipGithubWait: true }]) {
    expect(() => verifyTrackingReleaseReview({ branch: reviewBranch, sha, runId: "1", readApi, ...options })).toThrow(/Safe Lane/);
  }
  expect(() => verifyTrackingReleaseReview({ branch: "codex/unrelated", sha, mode: "fast", readApi })).not.toThrow();
});

test("tracking ship guard retrieves current run, approval and environment policy", () => {
  const item = evidence(), paths = [];
  const responses = [item.run, item.approvals, item.environment, item.policies];
  verifyTrackingReleaseReview({ branch: reviewBranch, sha, mode: "safe", runId: "123", readApi: endpoint => {
    paths.push(endpoint); return responses.shift();
  } });
  expect(paths).toEqual([`repos/${reviewRepository}/actions/runs/123`, `repos/${reviewRepository}/actions/runs/123/approvals`,
    `repos/${reviewRepository}/environments/${reviewEnvironment}`, `repos/${reviewRepository}/environments/${reviewEnvironment}/deployment-branch-policies`]);
  expect(() => verifyTrackingReleaseReview({ branch: reviewBranch, sha, mode: "safe", runId: "123", readApi: () => { throw new Error("GitHub unavailable"); } })).toThrow(/GitHub unavailable/);
});

test("tracking review uses pinned actions, no service secrets and no deploy actions", () => {
  const source = fs.readFileSync(new URL("../.github/workflows/production-smoke.yml", import.meta.url), "utf8");
  const job = source.slice(source.indexOf("  fs-player-tracking-review:"));
  expect(job).toContain(`github.ref == 'refs/heads/${reviewBranch}' && inputs.tracking_review && inputs.review_action == 'monitor'`);
  expect(job).toContain(`name: ${reviewEnvironment}`);
  expect(job).toContain("ref: ${{ github.sha }}");
  expect(job).toContain("persist-credentials: false");
  expect(job.match(/uses: [^\n]+/g).every(action => /@[a-f0-9]{40}$/.test(action))).toBe(true);
  expect(job).toContain("node scripts/verify-fs-player-tracking-review-target.mjs");
  expect(job).not.toMatch(/secrets\.|npm ci|npm run deploy|git push|upload-artifact|continue-on-error/);
  expect(source).toContain("&& !inputs.tracking_review");
  const ship = fs.readFileSync(new URL("../scripts/release-ship.mjs", import.meta.url), "utf8");
  expect(ship).toContain("verifyTrackingReleaseReview({ branch: currentBranch(), sha: git([\"rev-parse\", \"HEAD\"]), mode,");
  expect(ship).toContain("runId: process.env.TRACKING_RELEASE_REVIEW_RUN_ID");
});
