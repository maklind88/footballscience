import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { buildLeaderboardStagingChildEnv } from "./lib/leaderboard-staging-qa-env.mjs";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");

const validateOnly = process.argv.includes("--validate-only");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectRefPattern = /^[a-z0-9]{20}$/;

function clean(value) {
  return String(value || "").trim();
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const baseUrl = clean(process.env.STAGING_QA_BASE_URL);
const stagingRef = clean(process.env.STAGING_SUPABASE_PROJECT_REF);
const productionRef = clean(process.env.SUPABASE_PROJECT_REF);
const teamId = clean(process.env.LEADERBOARD_STAGING_QA_TEAM_ID).toLowerCase();
const dedicatedUsername = clean(process.env.LEADERBOARD_STAGING_QA_USERNAME);
const dedicatedPassword = clean(process.env.LEADERBOARD_STAGING_QA_PASSWORD);
const hasDedicatedCredentials = Boolean(dedicatedUsername || dedicatedPassword);
const username = hasDedicatedCredentials ? dedicatedUsername : clean(process.env.STAGING_QA_USERNAME);
const password = hasDedicatedCredentials ? dedicatedPassword : clean(process.env.STAGING_QA_PASSWORD);
const stagingUrl = safeUrl(baseUrl);
const productionUrl = safeUrl(clean(process.env.LIVE_QA_BASE_URL) || "https://footballscience.xyz");
const failures = [];

if (!stagingUrl || stagingUrl.protocol !== "https:" || stagingUrl.origin !== baseUrl.replace(/\/$/, "")) {
  failures.push("STAGING_QA_BASE_URL must be an HTTPS origin without a path, query, or credentials.");
}
if (stagingUrl && [productionUrl?.hostname, "footballscience.xyz", "www.footballscience.xyz"].includes(stagingUrl.hostname)) {
  failures.push("STAGING_QA_BASE_URL must not point at the production host.");
}
if (!projectRefPattern.test(stagingRef)) failures.push("STAGING_SUPABASE_PROJECT_REF must be a valid 20-character project ref.");
if (!projectRefPattern.test(productionRef)) failures.push("SUPABASE_PROJECT_REF must be a valid 20-character project ref for isolation proof.");
if (stagingRef && productionRef && stagingRef === productionRef) {
  failures.push("STAGING_SUPABASE_PROJECT_REF must not equal SUPABASE_PROJECT_REF.");
}
if (!uuidPattern.test(teamId)) failures.push("LEADERBOARD_STAGING_QA_TEAM_ID must be a stable Platform team UUID.");
if (hasDedicatedCredentials && (!dedicatedUsername || !dedicatedPassword)) {
  failures.push("LEADERBOARD_STAGING_QA_USERNAME and LEADERBOARD_STAGING_QA_PASSWORD must be configured as a pair.");
}
if (!username || !password) {
  failures.push("Set the LEADERBOARD_STAGING_QA credential pair or the STAGING_QA credential pair.");
}

if (failures.length) {
  console.error("Leaderboard staging QA environment verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (validateOnly) {
  console.log("Leaderboard staging QA environment verification: ok (validation only; no remote smoke executed)");
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [playwrightCli, "test", "--config=qa/leaderboard-staging.playwright.config.mjs"],
  {
    cwd: process.cwd(),
    env: buildLeaderboardStagingChildEnv(process.env, {
      baseUrl: stagingUrl.origin,
      productionBaseUrl: productionUrl?.origin || "https://footballscience.xyz",
      stagingRef,
      productionRef,
      teamId,
      username,
      password,
    }),
    stdio: "inherit",
    shell: false,
  },
);

process.exit(result.status ?? 1);
