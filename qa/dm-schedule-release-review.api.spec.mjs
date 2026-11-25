import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { assertReviewTarget, assertReleaseReview, verifyDmScheduleReleaseReview,
  reviewBranch, reviewEnvironment, reviewOwner, reviewRepository } from "../scripts/lib/dm-schedule-release-review.mjs";

const sha = "a".repeat(40);
function evidence() {
  return {
    sha,
    run: { head_sha: sha, head_branch: reviewBranch, repository: { full_name: reviewRepository },
      path: ".github/workflows/production-smoke.yml", event: "workflow_dispatch",
      display_title: `DM/Schedule release ${sha}`, status: "completed", conclusion: "success", run_attempt: 1 },
    environment: { id: 42, name: reviewEnvironment, can_admins_bypass: false,
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: reviewOwner }] }],
      deployment_branch_policy: { custom_branch_policies: true, protected_branches: false } },
    policies: { total_count: 1, branch_policies: [{ name: reviewBranch, type: "branch" }] },
    approvals: [{ state: "approved", user: reviewOwner, environments: [{ id: 42, name: reviewEnvironment }] }],
  };
}

test("only the reviewed candidate and unchanged live build can enter diagnostics", () => {
  const input = { repository: reviewRepository, ref: `refs/heads/${reviewBranch}`, sha, expectedSha: sha,
    action: "diagnostics", expectedLiveBuild: "b".repeat(40), liveBuild: "b".repeat(40) };
  expect(() => assertReviewTarget(input)).not.toThrow();
  for (const change of [{ repository: "other/repo" }, { ref: "refs/heads/main" }, { sha: "c".repeat(40) },
    { expectedSha: "" }, { action: "monitor" }, { expectedLiveBuild: "" }, { liveBuild: "changed" }]) {
    expect(() => assertReviewTarget({ ...input, ...change })).toThrow();
  }
});

test("exact successful human-reviewed release evidence is accepted", () => {
  expect(() => assertReleaseReview(evidence())).not.toThrow();
});

for (const [name, mutate] of [
  ["changed SHA", e => { e.sha = "b".repeat(40); }],
  ["diagnostic approval", e => { e.run.display_title = `DM/Schedule diagnostics ${sha}`; }],
  ["wrong repository", e => { e.run.repository.full_name = "other/repo"; }],
  ["wrong workflow", e => { e.run.path = ".github/workflows/other.yml"; }],
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
]) {
  test(`release review rejects ${name}`, () => {
    const item = evidence(); mutate(item);
    expect(() => assertReleaseReview(item)).toThrow();
  });
}

test("task branch fails closed without review while unrelated branches retain their existing flow", () => {
  const readApi = () => { throw new Error("Must not call GitHub"); };
  expect(() => verifyDmScheduleReleaseReview({ branch: reviewBranch, sha, mode: "safe", readApi })).toThrow(/RELEASE_REVIEW_RUN_ID/);
  expect(() => verifyDmScheduleReleaseReview({ branch: reviewBranch, sha, mode: "fast", runId: "1", readApi })).toThrow(/Safe Lane/);
  expect(() => verifyDmScheduleReleaseReview({ branch: reviewBranch, sha, mode: "safe", skipGithubWait: true, runId: "1", readApi })).toThrow(/Safe Lane/);
  expect(() => verifyDmScheduleReleaseReview({ branch: "codex/unrelated", sha, mode: "fast", readApi })).not.toThrow();
});

test("release guard verifies current GitHub run, review and environment policy", () => {
  const item = evidence();
  const responses = [item.run, item.approvals, item.environment, item.policies];
  const paths = [];
  verifyDmScheduleReleaseReview({ branch: reviewBranch, sha, mode: "safe", runId: "123", readApi: endpoint => {
    paths.push(endpoint); return responses.shift();
  } });
  expect(paths).toEqual([`repos/${reviewRepository}/actions/runs/123`, `repos/${reviewRepository}/actions/runs/123/approvals`,
    `repos/${reviewRepository}/environments/${reviewEnvironment}`, `repos/${reviewRepository}/environments/${reviewEnvironment}/deployment-branch-policies`]);
  expect(() => verifyDmScheduleReleaseReview({ branch: reviewBranch, sha, mode: "safe", runId: "123", readApi: () => { throw new Error("GitHub unavailable"); } })).toThrow(/GitHub unavailable/);
});

test("review workflow exposes only QA credentials after the protected job and never deploys", () => {
  const source = fs.readFileSync(new URL("../.github/workflows/production-smoke.yml", import.meta.url), "utf8");
  const job = source.slice(source.indexOf("  dm-schedule-review:"));
  expect(source).toContain("if: github.ref == 'refs/heads/main' && (!inputs.review_action || inputs.review_action == 'monitor')");
  expect(job).toContain("name: dm-schedule-review");
  expect(job).toContain("ref: ${{ github.sha }}");
  expect(job).toContain("persist-credentials: false");
  expect(job).toContain("needs: dm-schedule-review");
  expect(job).toContain("needs.dm-schedule-review.result == 'success'");
  expect(job).toContain("group: production-monitor");
  expect(source).toContain("'dm-schedule-review' || 'production-monitor'");
  expect(job.indexOf("node scripts/verify-dm-schedule-review-target.mjs")).toBeLessThan(job.indexOf("${{ secrets."));
  expect(job.indexOf("node scripts/ci-install.mjs")).toBeLessThan(job.indexOf("${{ secrets."));
  expect(job.match(/\$\{\{ secrets\.[A-Z_]+ \}\}/g)).toEqual([
    "${{ secrets.LIVE_QA_USERNAME }}", "${{ secrets.LIVE_QA_PASSWORD }}",
  ]);
  expect(job).toContain("production test account can open Schedule|production Chat is reachable for authenticated QA without product writes");
  expect(job).not.toMatch(/LIVE_QA_PEER|--release-fixtures/);
  expect(job).not.toMatch(/VERCEL_TOKEN|CRON_SECRET|upload-artifact|continue-on-error|git push|npm run deploy/);
  const ship = fs.readFileSync(new URL("../scripts/release-ship.mjs", import.meta.url), "utf8");
  expect(ship).toContain('requireManualReleaseReview(options, "safe");\n  run("git", ["push", "origin", "HEAD:main"]);');
  expect(ship).toContain('if (options.push) {\n    requireManualReleaseReview(options, mode);');
});
