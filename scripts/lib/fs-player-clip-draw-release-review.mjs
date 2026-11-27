export const repository = "maklind88/footballscience";
export const branchName = "codex/fs-player-clip-draw";
export const environmentName = "fs-player-clip-draw-review";
const owner = { login: "maklind88", id: 279889782 };
const isOwner = actor => actor?.login === owner.login && actor?.id === owner.id;
const isSha = sha => /^[a-f0-9]{40}$/.test(sha || "");
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };

export function assertClipDrawReviewTarget({ repo, ref, sha, expectedSha, expectedLiveBuild, liveBuild }) {
  requireCondition(repo === repository && ref === `refs/heads/${branchName}`, "Wrong Draw/Present review repository or branch.");
  requireCondition(isSha(sha) && sha === expectedSha, "Draw/Present candidate SHA changed; request a new review.");
  requireCondition(Boolean(expectedLiveBuild) && liveBuild === expectedLiveBuild, "Production changed; check the live build and request a new review.");
}

export function assertClipDrawReviewEnvironment(environment, policies) {
  requireCondition(environment?.name === environmentName && Number.isInteger(environment.id) && environment.can_admins_bypass === false,
    "Draw/Present review environment is missing or permits admin bypass.");
  const reviewers = environment.protection_rules?.find(rule => rule.type === "required_reviewers")?.reviewers;
  requireCondition(reviewers?.length === 1 && reviewers[0].type === "User" && isOwner(reviewers[0].reviewer),
    "Draw/Present review must require the repository owner.");
  requireCondition(environment.deployment_branch_policy?.custom_branch_policies === true
    && environment.deployment_branch_policy.protected_branches === false && policies?.total_count === 1
    && policies.branch_policies?.[0]?.type === "branch" && policies.branch_policies[0].name === branchName,
  "Draw/Present review must be restricted to the exact candidate branch.");
}

export function assertClipDrawReleaseReview({ sha, run, approvals, environment, policies }) {
  assertClipDrawReviewEnvironment(environment, policies);
  requireCondition(isSha(sha) && run?.head_sha === sha && run.head_branch === branchName && run.repository?.full_name === repository
    && run.path === ".github/workflows/production-smoke.yml" && run.event === "workflow_dispatch"
    && run.display_title === `FS Player Draw and Present ${sha}` && run.status === "completed" && run.conclusion === "success"
    && run.run_attempt === 1, "Draw/Present review must succeed in its original run for the exact candidate SHA.");
  const reviews = (Array.isArray(approvals) ? approvals : []).filter(review => review.environments?.some(
    item => item.id === environment.id && item.name === environmentName));
  requireCondition(reviews.length === 1 && reviews[0].state === "approved" && isOwner(reviews[0].user),
    "Manual owner approval of this exact Draw/Present candidate is required.");
}

export function verifyClipDrawReleaseReview({ branch, sha, mode, skipGithubWait, runId, readApi }) {
  if (branch !== branchName && !runId) return;
  requireCondition(branch === branchName && mode === "safe" && !skipGithubWait,
    "The Draw/Present release must stay on its candidate branch and retain the complete Safe Lane workflow.");
  requireCondition(/^[1-9][0-9]*$/.test(String(runId || "")), "Set CLIP_DRAW_RELEASE_REVIEW_RUN_ID to the manually approved review run.");
  const prefix = `repos/${repository}`;
  const runPath = `${prefix}/actions/runs/${runId}`;
  const environmentPath = `${prefix}/environments/${environmentName}`;
  assertClipDrawReleaseReview({ sha, run: readApi(runPath), approvals: readApi(`${runPath}/approvals`),
    environment: readApi(environmentPath), policies: readApi(`${environmentPath}/deployment-branch-policies`) });
}
