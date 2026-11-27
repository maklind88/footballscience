import { assertClipDrawReviewTarget } from "./lib/fs-player-clip-draw-release-review.mjs";

const response = await fetch("https://footballscience.xyz/api/client-config", {
  signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store",
});
if (!response.ok) throw new Error("Could not read the live build identity.");
const { buildId } = await response.json();
assertClipDrawReviewTarget({ repo: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, sha: process.env.GITHUB_SHA,
  expectedSha: process.env.EXPECTED_CANDIDATE_SHA, expectedLiveBuild: process.env.EXPECTED_LIVE_BUILD_ID, liveBuild: buildId });
console.log(`Reviewed FS Player Draw and Present candidate: ${process.env.GITHUB_SHA}; no deployment performed.`);
