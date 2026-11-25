import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { deploymentIdOf, normalizeHttpsOrigin } from "./lib/production-promotion.mjs";
import { supabaseRefFromConfig } from "./lib/vercel-protected-read.mjs";

const stagingOrigin = "https://staging.footballscience.xyz";
const productionOrigin = "https://footballscience.xyz";
const writeProofStep = "Isolated Schedule and Chat write, reload, and cleanup proofs";

function requireProof(ok, message) {
  if (!ok) throw new Error(message);
}

export function verifyStagingWriteBuildEnvironment(source) {
  const { APP_STATE_DATABASE_MODE: mode } = parseEnv(source);
  requireProof(["database", "db", "postgres", "supabase", "on", "true", "1"].includes(mode?.trim().toLowerCase()),
    "Staging must already use atomic app-state database writes.");
  return "STAGING_APP_STATE_DATABASE_MODE=database";
}

export async function verifyStagingWriteTarget({ env = process.env, request = fetch } = {}) {
  requireProof(env.STAGING_QA_BASE_URL === stagingOrigin, "The isolated staging hostname is required.");
  requireProof(env.VERCEL_TOKEN && env.VERCEL_ORG_ID && env.VERCEL_PROJECT_ID,
    "Verified staging deployment metadata requires the release credentials.");
  requireProof(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ""), "An exact staging source commit is required.");
  const deployed = normalizeHttpsOrigin(env.STAGING_DEPLOYMENT_URL, "Staging deployment");
  requireProof(deployed.endsWith(".vercel.app"), "An immutable staging deployment URL is required.");

  async function read(url, headers) {
    const response = await request(url, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    requireProof(response.ok, `Staging write isolation check failed at ${url.hostname} (HTTP ${response.status}).`);
    return response.json();
  }

  function inspect(origin) {
    const url = new URL(`/v13/deployments/${new URL(origin).hostname}`, "https://api.vercel.com");
    url.searchParams.set("teamId", env.VERCEL_ORG_ID);
    return read(url, { Authorization: `Bearer ${env.VERCEL_TOKEN}` });
  }
  const [deployment, alias, staging, production] = await Promise.all([
    inspect(deployed),
    inspect(stagingOrigin),
    read(new URL("/api/client-config", stagingOrigin)),
    read(new URL("/api/client-config", productionOrigin)),
  ]);
  requireProof((deployment.projectId || deployment.project?.id) === env.VERCEL_PROJECT_ID
    && deployment.readyState === "READY" && [null, "preview"].includes(deployment.target)
    && deployment.meta?.githubCommitRef === "staging" && deployment.meta?.githubCommitSha === env.GITHUB_SHA
    && deployment.meta?.scheduleQaDatabaseMode === "database", "Staging deployment is not the approved database-backed preview for this release.");
  const deploymentId = deploymentIdOf(deployment);
  requireProof(/^dpl_[A-Za-z0-9]+$/.test(deploymentId) && deploymentIdOf(alias) === deploymentId
    && staging.ok && [deploymentId, env.GITHUB_SHA].includes(staging.buildId),
    "The staging alias must serve the exact staging deployment before fixture writes.");
  const liveRef = supabaseRefFromConfig(production);
  requireProof(production.ok && (!env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF === liveRef),
    "The production backend identity changed.");
  requireProof(supabaseRefFromConfig(staging) === env.STAGING_SUPABASE_PROJECT_REF && env.STAGING_SUPABASE_PROJECT_REF !== liveRef,
    "Staging fixture writes require the configured backend separate from production.");
  return { buildId: staging.buildId, liveRef };
}

export async function verifyCompletedStagingWriteProof({ env = process.env, request = fetch } = {}) {
  requireProof(env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || "")
    && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ""), "Exact release commit and GitHub access required for staging proof.");
  const base = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/`;
  async function read(path) {
    const response = await request(new URL(path, base), {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}` },
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    requireProof(response.ok, `Cannot verify GitHub staging write proof (HTTP ${response.status}).`);
    return response.json();
  }
  const { workflow_runs: runs } = await read(`workflows/staging-deploy.yml/runs?branch=staging&head_sha=${env.GITHUB_SHA}`);
  const run = runs?.find(entry => entry.head_sha === env.GITHUB_SHA && entry.head_branch === "staging");
  requireProof(run?.conclusion === "success" && Number.isSafeInteger(run.id), "The latest exact-commit staging deployment must succeed before release.");
  const { jobs } = await read(`runs/${run.id}/jobs`);
  requireProof(jobs?.some(job => job.conclusion === "success"
    && job.steps?.some(step => step.name === writeProofStep && step.conclusion === "success")),
    "The exact-commit staging workflow did not pass its isolated write proofs.");
  return run.id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes("--completed-proof")) {
      console.log(`Exact-commit isolated staging writes passed in workflow ${await verifyCompletedStagingWriteProof()}.`);
    } else {
      console.log(verifyStagingWriteBuildEnvironment(readFileSync(".vercel/.env.preview.local", "utf8")));
    }
  } catch (error) {
    console.error(error instanceof Error && !["ENOENT", "EACCES"].includes(error.code)
      ? error.message : "Could not read the preview app-state mode. Values suppressed.");
    process.exitCode = 1;
  }
}
