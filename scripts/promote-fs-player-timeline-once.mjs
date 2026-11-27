import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { assertProductionDeployment } from "./lib/production-promotion.mjs";
import { supabaseRefFromConfig } from "./lib/vercel-protected-read.mjs";

const repository = "maklind88/footballscience";
const reviewRef = "refs/heads/codex/fs-player-timeline-live-review";
const sha = "9d1cf1e90109f3094bda3afa408f9d6f8bff2851";
const projectId = "prj_GazeaGD3eThx8p2w1m334AAFNN0x";
const teamId = "team_ayMHRHhvpCWLhB7Hss525k0z";
const deploymentId = "dpl_HrsbnBZgknCderqU51DxjP1nTTJT";
const previousLiveId = "dpl_DWYvMvk3ebRPmaEajSjHvjVkDN7A";
const deploymentHost = "footballscience-nf06v1sra-makattack.vercel.app";
const liveHost = "footballscience.xyz";
const supabaseRef = "bustidorxevacosqhkcz";
const harness = [
  ".github/workflows/fs-player-timeline-promotion.yml",
  "scripts/promote-fs-player-timeline-once.mjs",
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const ensure = (value, message) => { if (!value) throw new Error(message); };

async function read(url, token) {
  const response = await fetch(url, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  ensure(response.ok, `Read failed for ${url.hostname} (${response.status}).`);
  return response;
}

async function assertMain() {
  const ref = await (await read(new URL(`https://api.github.com/repos/${repository}/git/ref/heads/main`),
    process.env.GITHUB_TOKEN)).json();
  ensure(ref.object?.sha === sha, "main changed; this promotion is no longer authorized.");
}

async function preflight() {
  const env = process.env;
  ensure(env.GITHUB_REPOSITORY === repository && env.GITHUB_REF === reviewRef && env.GITHUB_EVENT_NAME === "push",
    "This approval is only valid for the dedicated review branch.");
  ensure(!git("status", "--porcelain") && git("rev-parse", "HEAD") === env.GITHUB_SHA
    && git("rev-parse", "HEAD^") === sha, "Checkout differs from the approved product commit and review harness.");
  ensure(git("diff", "--name-only", sha, "HEAD") === harness.join("\n"),
    "Only the one-off review harness may differ from the release candidate.");
  await assertMain();
}

function vercel(...args) {
  ensure(process.env.VERCEL_TOKEN, "Vercel credential is unavailable after review.");
  try {
    return execFileSync("npx", ["--yes", "vercel@53.2.0", ...args,
      "--scope", teamId, "--token", process.env.VERCEL_TOKEN], { timeout: 340_000, maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw new Error(`Vercel ${args[0]} did not complete successfully.`);
  }
}

async function inspect(path) {
  const url = new URL(`https://api.vercel.com${path}`);
  url.searchParams.set("teamId", teamId);
  return (await read(url, process.env.VERCEL_TOKEN)).json();
}

function protectedAsset(path) {
  // Keep credential flags before curl's argument separator.
  ensure(process.env.VERCEL_TOKEN, "Vercel credential is unavailable after review.");
  try {
    return execFileSync("npx", ["--yes", "vercel@53.2.0", "curl", path, "--deployment", deploymentId,
      "--scope", teamId, "--token", process.env.VERCEL_TOKEN, "--", "--fail", "--silent", "--show-error",
      "--max-time", "30", "--proto", "=https"], { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw new Error(`Could not verify the reviewed artifact at ${path}.`);
  }
}

async function liveDeployment() {
  const alias = await inspect(`/v4/aliases/${liveHost}`);
  ensure(alias.projectId === projectId, "Live alias belongs to the wrong Vercel project.");
  return alias.deploymentId;
}

async function promote() {
  ensure(process.env.VERCEL_TOKEN, "Protected promotion requires the existing Vercel credential.");
  const candidate = await inspect(`/v13/deployments/${deploymentId}`);
  ensure(assertProductionDeployment(candidate, { projectId }) === deploymentId && candidate.url === deploymentHost,
    "Vercel deployment identity differs from the approved artifact.");
  const commit = candidate.meta?.githubCommitSha || candidate.meta?.gitCommitSha || candidate.gitSource?.sha;
  ensure(!commit || commit === sha, "Vercel reports an unexpected source commit.");
  mkdirSync(".vercel", { recursive: true });
  writeFileSync(".vercel/project.json", JSON.stringify({ projectId, orgId: teamId, projectName: "footballscience" }),
    { flag: "wx" });
  ensure(supabaseRefFromConfig(JSON.parse(protectedAsset("/api/client-config"))) === supabaseRef,
    "Reviewed artifact is not bound to production data.");

  const paths = ["app.js", "app-runtime.js",
    ...git("diff-tree", "--no-commit-id", "--name-only", "-r", sha).split("\n")
      .filter(path => path.startsWith("src/modules/video-analysis/"))];
  ensure(paths.length === 11, "Unexpected production asset scope.");
  for (const path of paths) {
    ensure(protectedAsset(`/${path}`).equals(readFileSync(path)), `Artifact mismatch: ${path}`);
  }
  console.log(`Verified ${paths.length} deployed assets against ${sha}.`);
  await assertMain();
  ensure(await liveDeployment() === previousLiveId, "Live changed; refusing to replace a different release.");
  vercel("promote", `https://${deploymentHost}`, "--yes", "--timeout=5m");

  for (let attempt = 0; attempt < 30 && await liveDeployment() !== deploymentId; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  ensure(await liveDeployment() === deploymentId, "The reviewed deployment does not own the production alias.");
  for (const path of paths) {
    const url = new URL(`/${path}?fs-timeline-release=${sha}`, `https://${liveHost}`);
    const received = Buffer.from(await (await read(url)).arrayBuffer());
    ensure(received.equals(readFileSync(path)), `Live asset mismatch: ${path}`);
  }
  console.log(`Promoted and verified ${deploymentId} on https://${liveHost}.`);
}

await preflight();
if (process.argv.includes("--preflight")) console.log(`Approval scope verified: ${sha} -> ${deploymentId}.`);
else await promote();
