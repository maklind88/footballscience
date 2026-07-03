import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingBaseUrl = clean(process.env.STAGING_QA_BASE_URL);
const stagingProjectRef = clean(process.env.STAGING_SUPABASE_PROJECT_REF);
const branchAliasHost = hostnameFrom(process.env.STAGING_BRANCH_ALIAS || "footballscience-git-staging-makattack.vercel.app");
const stagingHost = hostnameFrom(stagingBaseUrl);
const teamId = clean(process.env.VERCEL_ORG_ID);
const token = clean(process.env.VERCEL_TOKEN);
const projectConfig = readVercelProjectConfig();
const projectId = clean(process.env.VERCEL_PROJECT_ID || projectConfig.projectId);
const projectName = clean(process.env.VERCEL_PROJECT_NAME || projectConfig.projectName || "footballscience");
const attempts = Number.parseInt(clean(process.env.STAGING_ALIAS_VERIFY_ATTEMPTS) || "18", 10);
const delayMs = Number.parseInt(clean(process.env.STAGING_ALIAS_VERIFY_DELAY_MS) || "5000", 10);
const expectedRuntimeHash = fileHash("app-runtime.js");

if (!stagingBaseUrl) {
  console.log("Staging alias restore skipped: STAGING_QA_BASE_URL is not configured.");
  process.exit(0);
}

if (!stagingProjectRef) {
  throw new Error("STAGING_SUPABASE_PROJECT_REF is required before restoring the staging alias.");
}

if (!teamId || !token) {
  throw new Error("VERCEL_ORG_ID and VERCEL_TOKEN are required before restoring the staging alias.");
}

const vercelHeaders = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const deployment = await resolveStagingDeployment();
const deploymentId = deployment.id || deployment.uid;
const deploymentHost = hostnameFrom(deployment.url || deployment.name || branchAliasHost);

if (!deploymentId) {
  throw new Error(`Could not resolve a Vercel deployment id for ${branchAliasHost}.`);
}

await assertHostUsesStagingSupabase(deploymentHost, "staging branch alias");
await assertHostServesCurrentRuntime(deploymentHost, "staging branch alias");
await assignAlias(deploymentId, stagingHost);
await waitForAliasToServeStaging(stagingHost);
await assertHostServesCurrentRuntime(stagingHost, "staging alias");

console.log(`Staging alias restored: ${stagingHost} -> ${deploymentHost}.`);

function readVercelProjectConfig() {
  const projectConfigPath = path.join(rootDir, ".vercel", "project.json");
  if (!fs.existsSync(projectConfigPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(projectConfigPath, "utf8"));
  } catch {
    return {};
  }
}

function fileHash(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    return "";
  }

  return sha256(fs.readFileSync(fullPath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clean(value) {
  return String(value || "").trim();
}

function hostnameFrom(value) {
  const input = clean(value);
  if (!input) {
    return "";
  }

  const url = input.startsWith("http://") || input.startsWith("https://")
    ? input
    : `https://${input}`;
  return new URL(url).hostname;
}

async function getDeployment(host) {
  const deploymentUrl = new URL(`https://api.vercel.com/v13/deployments/${host}`);
  deploymentUrl.searchParams.set("teamId", teamId);
  return fetchJson(deploymentUrl, { headers: vercelHeaders }, `inspect ${host}`);
}

async function resolveStagingDeployment() {
  const explicitDeploymentHost = hostnameFrom(process.env.STAGING_DEPLOYMENT_URL);
  if (explicitDeploymentHost) {
    console.log(`Using explicit staging deployment: ${explicitDeploymentHost}.`);
    return getDeployment(explicitDeploymentHost);
  }

  const candidates = await listLatestStagingDeployments();
  let lastCandidateError = "";

  for (const candidate of candidates) {
    const candidateHost = hostnameFrom(candidate.url || candidate.name);
    if (!candidateHost) {
      continue;
    }

    try {
      await assertHostUsesStagingSupabase(candidateHost, `staging deployment candidate ${candidateHost}`);
      await assertHostServesCurrentRuntime(candidateHost, `staging deployment candidate ${candidateHost}`);
      console.log(`Selected latest staging deployment: ${candidateHost}.`);
      return getDeployment(candidateHost);
    } catch (error) {
      lastCandidateError = error instanceof Error ? error.message : String(error);
    }
  }

  console.warn(
    `Could not validate a latest staging deployment from the Vercel deployment list. ` +
      `Falling back to staging branch alias ${branchAliasHost}.` +
      (lastCandidateError ? ` Last candidate error: ${lastCandidateError}` : "")
  );
  return getDeployment(branchAliasHost);
}

async function listLatestStagingDeployments() {
  const deploymentsUrl = new URL("https://api.vercel.com/v6/deployments");
  deploymentsUrl.searchParams.set("teamId", teamId);
  deploymentsUrl.searchParams.set("limit", "25");
  deploymentsUrl.searchParams.set("target", "preview");

  if (projectId) {
    deploymentsUrl.searchParams.set("projectId", projectId);
  } else {
    deploymentsUrl.searchParams.set("app", projectName);
  }

  const payload = await fetchJson(deploymentsUrl, { headers: vercelHeaders }, "list staging deployments");
  const deployments = Array.isArray(payload.deployments) ? payload.deployments : [];
  return deployments
    .filter((deployment) => {
      const state = clean(deployment.state || deployment.readyState).toUpperCase();
      if (state && state !== "READY") {
        return false;
      }

      const meta = deployment.meta || {};
      const commitRef = clean(meta.githubCommitRef || meta.gitBranch || meta.githubCommitBranch || deployment.gitSource?.ref);
      return !commitRef || commitRef === "staging";
    })
    .sort((left, right) => deploymentCreatedAt(right) - deploymentCreatedAt(left));
}

function deploymentCreatedAt(deployment) {
  const value = deployment.createdAt || deployment.created || deployment.ready || 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function assignAlias(deploymentId, aliasHost) {
  const aliasUrl = new URL(`https://api.vercel.com/v2/deployments/${deploymentId}/aliases`);
  aliasUrl.searchParams.set("teamId", teamId);
  try {
    await fetchJson(
      aliasUrl,
      {
        method: "POST",
        headers: vercelHeaders,
        body: JSON.stringify({ alias: aliasHost }),
      },
      `assign ${aliasHost}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("already associated with this deployment")) {
      console.log(`Staging alias already restored: ${aliasHost}.`);
      return;
    }

    throw error;
  }
}

async function fetchJson(url, options, label) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText || response.status;
    throw new Error(`Vercel request failed while trying to ${label}: ${message}`);
  }

  return payload;
}

async function readClientConfig(host) {
  const configUrl = new URL("/api/client-config", `https://${host}`);
  configUrl.searchParams.set("aliasVerify", `${Date.now()}`);
  const response = await fetch(configUrl, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText || response.status;
    throw new Error(`${host} /api/client-config failed: ${message}`);
  }

  return payload;
}

async function readHostText(host, pathname) {
  const url = new URL(pathname, `https://${host}`);
  url.searchParams.set("aliasVerify", `${Date.now()}`);
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${host} ${pathname} failed: ${response.status}`);
  }

  return text;
}

function usesStagingSupabase(config) {
  return String(config?.url || "").includes(stagingProjectRef);
}

async function assertHostUsesStagingSupabase(host, label) {
  const config = await readClientConfig(host);

  if (!usesStagingSupabase(config)) {
    throw new Error(`${label} ${host} is not serving staging Supabase project ${stagingProjectRef}.`);
  }
}

async function assertHostServesCurrentRuntime(host, label) {
  if (!expectedRuntimeHash) {
    return;
  }

  const runtime = await readHostText(host, "/app-runtime.js");
  const runtimeHash = sha256(runtime);

  if (runtimeHash !== expectedRuntimeHash) {
    throw new Error(
      `${label} ${host} is not serving the current release runtime. ` +
        `expected=${expectedRuntimeHash} received=${runtimeHash}`
    );
  }
}

async function waitForAliasToServeStaging(host) {
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const config = await readClientConfig(host);

      if (usesStagingSupabase(config)) {
        console.log(`Verified ${host} serves staging Supabase project ${stagingProjectRef}.`);
        return;
      }

      lastError = `received Supabase URL ${config?.url || "<missing>"}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Staging alias ${host} did not serve staging Supabase project ${stagingProjectRef} after ${attempts} attempts. Last result: ${lastError}`,
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
