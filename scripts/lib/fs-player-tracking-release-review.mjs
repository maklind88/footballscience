export const reviewRepository = "maklind88/footballscience";
export const reviewBranch = "codex/fs-player-two-player-distance-20261119";
export const reviewEnvironment = "fs-player-tracking-review";
export const reviewOwner = { login: "maklind88", id: 279889782 };
const invariant = (condition, message) => { if (!condition) throw new Error(message); };

export function assertTrackingReviewTarget({ repository, ref, sha, expectedSha, expectedLiveBuild, liveBuild }) {
  invariant(repository === reviewRepository && ref === `refs/heads/${reviewBranch}`, "Wrong tracking review repository or branch.");
  invariant(/^[a-f0-9]{40}$/.test(expectedSha || "") && sha === expectedSha, "Tracking candidate SHA changed; request a new manual review.");
  invariant(typeof expectedLiveBuild === "string" && expectedLiveBuild.length > 0 && liveBuild === expectedLiveBuild,
    "Production changed; inspect the current build before requesting review.");
}

export function assertTrackingReviewEnvironment(environment, policies) {
  invariant(environment?.name === reviewEnvironment && Number.isInteger(environment.id) && environment.can_admins_bypass === false,
    "Tracking review environment is missing or permits admin bypass.");
  const reviewer = environment.protection_rules?.find(rule => rule.type === "required_reviewers");
  invariant(reviewer?.reviewers?.length === 1 && reviewer.reviewers[0].type === "User"
    && reviewer.reviewers[0].reviewer?.id === reviewOwner.id && reviewer.reviewers[0].reviewer?.login === reviewOwner.login,
  "The repository owner must approve the tracking release.");
  invariant(environment.deployment_branch_policy?.custom_branch_policies === true
    && environment.deployment_branch_policy.protected_branches === false && policies?.total_count === 1
    && policies.branch_policies?.[0]?.name === reviewBranch && policies.branch_policies[0].type === "branch",
  "Tracking review must be restricted to the tracking candidate branch.");
}

export function assertTrackingReleaseReview({ sha, run, approvals, environment, policies }) {
  assertTrackingReviewEnvironment(environment, policies);
  invariant(/^[a-f0-9]{40}$/.test(sha || "") && run?.head_sha === sha && run.head_branch === reviewBranch
    && run.repository?.full_name === reviewRepository && run.path === ".github/workflows/production-smoke.yml"
    && run.event === "workflow_dispatch" && run.display_title === `FS Player tracking release ${sha}`,
  "This is not a tracking release review for the exact candidate SHA.");
  invariant(run.status === "completed" && run.conclusion === "success" && run.run_attempt === 1,
    "Tracking review must succeed in its original manually approved run.");
  const reviews = (Array.isArray(approvals) ? approvals : []).filter(review => review.environments?.some(
    item => item.id === environment.id && item.name === reviewEnvironment));
  invariant(reviews.length === 1 && reviews[0].state === "approved"
    && reviews[0].user?.id === reviewOwner.id && reviews[0].user?.login === reviewOwner.login,
  "Manual owner approval of this exact tracking review is required.");
}

export function verifyTrackingReleaseReview({ branch, sha, mode, skipGithubWait, runId, readApi }) {
  if (branch !== reviewBranch && !runId) return;
  invariant(mode === "safe" && !skipGithubWait, "The tracking release must retain the complete Safe Lane workflow.");
  invariant(/^[1-9][0-9]*$/.test(String(runId || "")), "Set TRACKING_RELEASE_REVIEW_RUN_ID to the manually approved review run.");
  const prefix = `repos/${reviewRepository}`;
  assertTrackingReleaseReview({ sha,
    run: readApi(`${prefix}/actions/runs/${runId}`),
    approvals: readApi(`${prefix}/actions/runs/${runId}/approvals`),
    environment: readApi(`${prefix}/environments/${reviewEnvironment}`),
    policies: readApi(`${prefix}/environments/${reviewEnvironment}/deployment-branch-policies`),
  });
}
