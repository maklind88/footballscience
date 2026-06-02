import { spawnSync } from "node:child_process";
import process from "node:process";

const defaultLiveUrl = "https://footballscience.xyz";
const defaultStagingUrl = "https://staging.footballscience.xyz";
const defaultStagingBranchAlias = "footballscience-git-staging-makattack.vercel.app";
const defaultAttempts = 12;
const defaultDelayMs = 5000;

const options = parseArgs(process.argv.slice(2));
const liveHost = hostnameFrom(process.env.LIVE_QA_BASE_URL || defaultLiveUrl);
const stagingHost = hostnameFrom(process.env.STAGING_QA_BASE_URL || defaultStagingUrl);
const stagingBranchHost = hostnameFrom(process.env.STAGING_BRANCH_ALIAS || defaultStagingBranchAlias);
const attempts = Number.parseInt(process.env.STAGING_ISOLATION_ATTEMPTS || `${defaultAttempts}`, 10);
const delayMs = Number.parseInt(process.env.STAGING_ISOLATION_DELAY_MS || `${defaultDelayMs}`, 10);

if (!liveHost || !stagingHost || !stagingBranchHost) {
  throw new Error("Live, staging, and staging branch hosts are required for staging/live isolation verification.");
}

const initialReport = await readIsolationReport();
printReport(initialReport);

if (isIsolated(initialReport)) {
  console.log("Staging/live isolation: ok");
  process.exit(0);
}

if (!options.repair) {
  failWithIsolationMessage(initialReport, "Staging/live isolation failed.");
}

if (refsMatch(initialReport.stagingBranch, initialReport.live)) {
  failWithIsolationMessage(
    initialReport,
    "Staging/live isolation repair refused because the staging branch alias is serving the live Supabase project.",
  );
}

restoreStagingAlias();

const repairedReport = await waitForIsolation();
printReport(repairedReport);
console.log("Staging/live isolation repaired: ok");

function parseArgs(argv) {
  const parsed = { repair: false };
  for (const arg of argv) {
    if (arg === "--repair") {
      parsed.repair = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Staging/live isolation guard

Usage:
  npm run release:staging-isolation
  npm run release:staging-isolation:repair

Verifies that staging.footballscience.xyz and footballscience.xyz do not serve the same Supabase project.
With --repair, staging.footballscience.xyz is reassigned to the staging branch deployment.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return parsed;
}

function hostnameFrom(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  const url = input.startsWith("http://") || input.startsWith("https://") ? input : `https://${input}`;
  return new URL(url).hostname;
}

function refFromSupabaseUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    return new URL(value).hostname.split(".")[0] || value;
  } catch {
    return value;
  }
}

async function readClientConfig(host) {
  const configUrl = new URL("/api/client-config", `https://${host}`);
  configUrl.searchParams.set("isolationCheck", `${Date.now()}`);
  const response = await fetch(configUrl, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload?.error?.message || payload?.message || response.statusText || response.status;
    throw new Error(`${host} /api/client-config failed: ${reason}`);
  }
  return {
    host,
    supabaseUrl: String(payload?.url || ""),
    supabaseRef: refFromSupabaseUrl(payload?.url),
  };
}

async function readIsolationReport() {
  const [stagingBranch, staging, live] = await Promise.all([
    readClientConfig(stagingBranchHost),
    readClientConfig(stagingHost),
    readClientConfig(liveHost),
  ]);
  return { stagingBranch, staging, live };
}

function refsMatch(left, right) {
  return Boolean(left?.supabaseRef && right?.supabaseRef && left.supabaseRef === right.supabaseRef);
}

function isIsolated(report) {
  return refsMatch(report.staging, report.stagingBranch) && !refsMatch(report.staging, report.live);
}

function printReport(report) {
  console.log("Staging/live isolation report:");
  console.log(`- staging branch: ${report.stagingBranch.host} -> ${report.stagingBranch.supabaseRef || "<missing>"}`);
  console.log(`- staging alias:  ${report.staging.host} -> ${report.staging.supabaseRef || "<missing>"}`);
  console.log(`- live alias:     ${report.live.host} -> ${report.live.supabaseRef || "<missing>"}`);
}

function failWithIsolationMessage(report, message) {
  printReport(report);
  console.error(message);
  console.error("- staging alias must match the staging branch alias.");
  console.error("- staging alias must not match the live alias.");
  console.error("- To repair locally, run: npm run release:staging-isolation:repair");
  process.exit(1);
}

function restoreStagingAlias() {
  const args = ["--yes", "vercel@53.2.0", "alias", "set", stagingBranchHost, stagingHost];
  if (process.env.VERCEL_TOKEN) {
    args.push("--token", process.env.VERCEL_TOKEN);
  }

  const safeArgs = args.map((arg, index) => (args[index - 1] === "--token" ? "<hidden>" : arg));
  console.log(`\n> npx ${safeArgs.join(" ")}`);
  const result = spawnSync("npx", args, {
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Vercel staging alias repair failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function waitForIsolation() {
  let lastReport = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastReport = await readIsolationReport();
    if (isIsolated(lastReport)) {
      return lastReport;
    }
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }
  failWithIsolationMessage(lastReport, `Staging/live isolation repair did not settle after ${attempts} attempts.`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
