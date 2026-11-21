import { assertTrackingReviewTarget } from "./lib/fs-player-tracking-release-review.mjs";

const response = await fetch("https://footballscience.xyz/api/client-config", {
  signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store",
});
if (!response.ok) throw new Error("Production build identity could not be read.");
const live = await response.json();
assertTrackingReviewTarget({ repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF,
  sha: process.env.GITHUB_SHA, expectedSha: process.env.EXPECTED_CANDIDATE_SHA,
  expectedLiveBuild: process.env.EXPECTED_LIVE_BUILD_ID, liveBuild: live.buildId });
console.log(`Reviewed tracking candidate: ${process.env.GITHUB_SHA}; no deployment performed.`);
