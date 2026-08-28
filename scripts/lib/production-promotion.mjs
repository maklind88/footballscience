import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const readyStates = new Set(["READY"]);
const productionTargets = new Set(["PRODUCTION"]);

function clean(value) {
  return String(value || "").trim();
}

export function normalizeHttpsOrigin(value, label) {
  let url;
  try {
    url = new URL(clean(value));
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin without credentials, path, query, or hash.`);
  }
  return url.origin;
}

export function deploymentIdOf(deployment = {}) {
  return clean(deployment.id || deployment.uid);
}

export function assertProductionDeployment(deployment, expected = {}) {
  const deploymentId = deploymentIdOf(deployment);
  const projectId = clean(deployment?.projectId || deployment?.project?.id);
  const readyState = clean(deployment?.readyState || deployment?.state).toUpperCase();
  const target = clean(deployment?.target).toUpperCase();
  const commitSha = clean(
    deployment?.meta?.githubCommitSha
      || deployment?.meta?.gitCommitSha
      || deployment?.gitSource?.sha,
  );

  if (!deploymentId) throw new Error("Vercel deployment inspection did not return an id.");
  if (projectId !== clean(expected.projectId)) {
    throw new Error(`Production deployment belongs to the wrong Vercel project (${projectId || "unknown"}).`);
  }
  if (!readyStates.has(readyState)) {
    throw new Error(`Production deployment is not ready (${readyState || "unknown"}).`);
  }
  if (!productionTargets.has(target)) {
    throw new Error(`Deployment target must be production, received ${target || "unknown"}.`);
  }
  if (clean(expected.commitSha) && commitSha !== clean(expected.commitSha)) {
    throw new Error(`Production deployment commit does not match the release SHA (${commitSha || "missing"}).`);
  }

  return deploymentId;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readResponseJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
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
    const reason = payload?.error?.message || payload?.message || response.statusText || response.status;
    throw new Error(`${label} failed: ${reason}`);
  }
  return payload;
}

async function inspectDeployment(fetchImpl, host, config) {
  const url = new URL(`https://api.vercel.com/v13/deployments/${host}`);
  url.searchParams.set("teamId", config.teamId);
  return readResponseJson(fetchImpl, url, {
    headers: { Authorization: `Bearer ${config.token}` },
  }, `Inspect Vercel deployment ${host}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLiveDeployment(fetchImpl, liveHost, expectedId, config, options = {}) {
  const attempts = Math.max(1, Number(options.attempts ?? 30));
  const delayMs = Math.max(0, Number(options.delayMs ?? 2_000));
  let lastId = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const live = await inspectDeployment(fetchImpl, liveHost, config);
    lastId = assertProductionDeployment(live, config);
    if (lastId === expectedId) return live;
    if (attempt < attempts) await sleep(delayMs);
  }

  throw new Error(`Live domain points to ${lastId || "unknown"}, expected exact deployment ${expectedId}.`);
}

async function assertSupabaseProject(fetchImpl, origin, projectRef) {
  const url = new URL("/api/client-config", origin);
  url.searchParams.set("releasePromotion", String(Date.now()));
  const payload = await readResponseJson(fetchImpl, url, { cache: "no-store" }, `Read ${origin} client config`);
  let configuredUrl;
  try {
    configuredUrl = new URL(clean(payload?.url));
  } catch {
    throw new Error(`${origin} client config has an invalid Supabase URL.`);
  }
  const expectedHost = `${projectRef}.supabase.co`;
  if (configuredUrl.protocol !== "https:" || configuredUrl.hostname !== expectedHost || configuredUrl.origin !== `https://${expectedHost}`) {
    throw new Error(`${origin} does not use production Supabase project ${projectRef}.`);
  }
}

async function assertReleaseAssets(fetchImpl, origin, rootDir) {
  const assets = [
    "app.js",
    "app-runtime.js",
    "src/modules/platform/navigation-controller.mjs",
  ];
  for (const relativePath of assets) {
    const expected = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    const url = new URL(`/${relativePath}`, origin);
    url.searchParams.set("releasePromotion", String(Date.now()));
    const response = await fetchImpl(url, { cache: "no-store" });
    const received = await response.text();
    if (!response.ok) throw new Error(`${origin}/${relativePath} failed: ${response.status}`);
    if (sha256(received) !== sha256(expected)) {
      throw new Error(`${origin}/${relativePath} does not match the release artifact.`);
    }
  }
}

export async function verifyProductionPromotion(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const phase = clean(options.phase || env.PRODUCTION_PROMOTION_PHASE || "staged").toLowerCase();
  if (!new Set(["staged", "live"]).has(phase)) throw new Error(`Unknown production promotion phase: ${phase}.`);

  const deploymentOrigin = normalizeHttpsOrigin(env.PRODUCTION_DEPLOYMENT_URL, "PRODUCTION_DEPLOYMENT_URL");
  const liveOrigin = normalizeHttpsOrigin(env.LIVE_QA_BASE_URL || "https://footballscience.xyz", "LIVE_QA_BASE_URL");
  const projectRef = clean(env.SUPABASE_PROJECT_REF);
  const config = {
    projectId: clean(env.VERCEL_PROJECT_ID),
    teamId: clean(env.VERCEL_ORG_ID),
    token: clean(env.VERCEL_TOKEN),
    commitSha: clean(env.GITHUB_SHA || env.RELEASE_SHA),
  };
  for (const [name, value] of Object.entries({
    SUPABASE_PROJECT_REF: projectRef,
    VERCEL_PROJECT_ID: config.projectId,
    VERCEL_ORG_ID: config.teamId,
    VERCEL_TOKEN: config.token,
    GITHUB_SHA: config.commitSha,
  })) {
    if (!value) throw new Error(`${name} is required for production promotion verification.`);
  }
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("SUPABASE_PROJECT_REF must be a valid 20-character project ref.");
  if (!deploymentOrigin.endsWith(".vercel.app")) throw new Error("PRODUCTION_DEPLOYMENT_URL must be an immutable Vercel deployment origin.");
  if (deploymentOrigin === liveOrigin) throw new Error("The staged deployment origin must differ from the live origin.");

  const staged = await inspectDeployment(fetchImpl, new URL(deploymentOrigin).hostname, config);
  const stagedId = assertProductionDeployment(staged, config);
  await assertSupabaseProject(fetchImpl, deploymentOrigin, projectRef);
  await assertReleaseAssets(fetchImpl, deploymentOrigin, rootDir);

  if (phase === "live") {
    const live = await waitForLiveDeployment(
      fetchImpl,
      new URL(liveOrigin).hostname,
      stagedId,
      config,
      {
        attempts: options.liveVerifyAttempts ?? env.PRODUCTION_PROMOTION_VERIFY_ATTEMPTS,
        delayMs: options.liveVerifyDelayMs ?? env.PRODUCTION_PROMOTION_VERIFY_DELAY_MS,
      },
    );
    const liveId = assertProductionDeployment(live, config);
    if (liveId !== stagedId) throw new Error(`Live domain points to ${liveId}, expected exact deployment ${stagedId}.`);
    await assertSupabaseProject(fetchImpl, liveOrigin, projectRef);
    await assertReleaseAssets(fetchImpl, liveOrigin, rootDir);
  }

  return { deploymentId: stagedId, deploymentOrigin, liveOrigin, phase };
}
