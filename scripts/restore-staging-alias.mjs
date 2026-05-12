const stagingBaseUrl = clean(process.env.STAGING_QA_BASE_URL);
const stagingProjectRef = clean(process.env.STAGING_SUPABASE_PROJECT_REF);
const branchAliasHost = hostnameFrom(process.env.STAGING_BRANCH_ALIAS || "footballscience-git-staging-makattack.vercel.app");
const stagingHost = hostnameFrom(stagingBaseUrl);
const teamId = clean(process.env.VERCEL_ORG_ID);
const token = clean(process.env.VERCEL_TOKEN);
const attempts = Number.parseInt(clean(process.env.STAGING_ALIAS_VERIFY_ATTEMPTS) || "18", 10);
const delayMs = Number.parseInt(clean(process.env.STAGING_ALIAS_VERIFY_DELAY_MS) || "5000", 10);

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

const deployment = await getDeployment(branchAliasHost);
const deploymentId = deployment.id || deployment.uid;
const deploymentHost = hostnameFrom(deployment.url || branchAliasHost);

if (!deploymentId) {
  throw new Error(`Could not resolve a Vercel deployment id for ${branchAliasHost}.`);
}

await assertHostUsesStagingSupabase(deploymentHost, "staging branch alias");
await assignAlias(deploymentId, stagingHost);
await waitForAliasToServeStaging(stagingHost);

console.log(`Staging alias restored: ${stagingHost} -> ${deploymentHost}.`);

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

async function assignAlias(deploymentId, aliasHost) {
  const aliasUrl = new URL(`https://api.vercel.com/v2/deployments/${deploymentId}/aliases`);
  aliasUrl.searchParams.set("teamId", teamId);
  await fetchJson(
    aliasUrl,
    {
      method: "POST",
      headers: vercelHeaders,
      body: JSON.stringify({ alias: aliasHost }),
    },
    `assign ${aliasHost}`,
  );
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

function usesStagingSupabase(config) {
  return String(config?.url || "").includes(stagingProjectRef);
}

async function assertHostUsesStagingSupabase(host, label) {
  const config = await readClientConfig(host);

  if (!usesStagingSupabase(config)) {
    throw new Error(`${label} ${host} is not serving staging Supabase project ${stagingProjectRef}.`);
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
