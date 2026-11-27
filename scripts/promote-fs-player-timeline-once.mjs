import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const stagingHost = "staging.footballscience.xyz";
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
    && git("merge-base", "HEAD", sha) === sha, "Checkout differs from the approved product commit and review harness.");
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
  const credentials = process.env.VERCEL_TOKEN ? ["--token", process.env.VERCEL_TOKEN] : [];
  try {
    return execFileSync("npx", ["--yes", "vercel@53.2.0", "curl", path, "--deployment", deploymentId,
      "--scope", teamId, ...credentials, "--", "--fail", "--silent", "--show-error",
      "--max-time", "30", "--proto", "=https"], { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw new Error(`Could not verify the reviewed artifact at ${path}.`);
  }
}

async function aliasDeployment(host) {
  const alias = await inspect(`/v4/aliases/${host}`);
  ensure(alias.projectId === projectId && alias.deploymentId, `Invalid Vercel alias for ${host}.`);
  return alias.deploymentId;
}

function linkVercelProject() {
  const file = ".vercel/project.json";
  if (!existsSync(file)) {
    mkdirSync(".vercel", { recursive: true });
    writeFileSync(file, JSON.stringify({ projectId, orgId: teamId, projectName: "footballscience" }), { flag: "wx" });
  }
  const link = JSON.parse(readFileSync(file, "utf8"));
  ensure(link.projectName === "footballscience" && link.projectId === projectId && link.orgId === teamId,
    "Vercel checkout is linked to a different project.");
}

function assertStageIsolation() {
  execFileSync("npm", ["run", "release:staging-isolation"], {
    env: { ...process.env, VERCEL_ORG_ID: teamId, VERCEL_PROJECT_ID: projectId },
    stdio: "inherit",
    timeout: 120_000,
  });
}

function verifyCandidateAssets() {
  linkVercelProject();
  assertStageIsolation();
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
  return paths;
}

async function promote() {
  ensure(process.env.VERCEL_TOKEN, "Protected promotion requires the existing Vercel credential.");
  const candidate = await inspect(`/v13/deployments/${deploymentId}`);
  ensure(assertProductionDeployment(candidate, { projectId }) === deploymentId && candidate.url === deploymentHost,
    "Vercel deployment identity differs from the approved artifact.");
  const commit = candidate.meta?.githubCommitSha || candidate.meta?.gitCommitSha || candidate.gitSource?.sha;
  ensure(!commit || commit === sha, "Vercel reports an unexpected source commit.");
  const paths = verifyCandidateAssets();
  await assertMain();
  const stagingId = await aliasDeployment(stagingHost);
  ensure(await aliasDeployment(liveHost) === previousLiveId, "Live changed; refusing to replace a different release.");
  // A project-wide promotion could also retarget the unpinned staging domain.
  vercel("alias", "set", deploymentHost, liveHost);

  for (let attempt = 0; attempt < 30 && await aliasDeployment(liveHost) !== deploymentId; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  ensure(await aliasDeployment(liveHost) === deploymentId, "The reviewed deployment does not own the production alias.");
  ensure(await aliasDeployment(stagingHost) === stagingId, "The staging alias changed unexpectedly.");
  for (const path of paths) {
    const url = new URL(`/${path}?fs-timeline-release=${sha}`, `https://${liveHost}`);
    const received = Buffer.from(await (await read(url)).arrayBuffer());
    ensure(received.equals(readFileSync(path)), `Live asset mismatch: ${path}`);
  }
  assertStageIsolation();
  console.log(`Promoted and verified ${deploymentId} on https://${liveHost}.`);
}

await preflight();
if (process.argv.includes("--preflight")) console.log(`Approval scope verified: ${sha} -> ${deploymentId}.`);
else if (process.argv.includes("--verify-only")) verifyCandidateAssets();
else await promote();
