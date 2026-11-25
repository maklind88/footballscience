import { spawnSync } from "node:child_process";
import process from "node:process";
import { verifyStagingWriteTarget } from "./verify-staging-write-target.mjs";

const required = process.argv.includes("--required");
const releaseFixtures = process.argv.includes("--release-fixtures");
const stagingBaseUrl = String(process.env.STAGING_QA_BASE_URL || "").trim();
const stagingUsername = String(process.env.STAGING_QA_USERNAME || "").trim();
const stagingPassword = String(process.env.STAGING_QA_PASSWORD || "").trim();
const missing = [];

if (!stagingBaseUrl) {
  missing.push("STAGING_QA_BASE_URL");
}
if (!stagingUsername) {
  missing.push("STAGING_QA_USERNAME");
}
if (!stagingPassword) {
  missing.push("STAGING_QA_PASSWORD");
}

if (missing.length) {
  const message = `Missing staging smoke environment: ${missing.join(", ")}`;
  if (required || releaseFixtures) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message}. Skipping staging smoke.`);
  process.exit(0);
}

const proof = releaseFixtures ? await verifyStagingWriteTarget() : null;
const testEnv = {
  ...process.env,
  LIVE_QA_BASE_URL: stagingBaseUrl,
  PLAYWRIGHT_BASE_URL: stagingBaseUrl,
  LIVE_QA_USERNAME: stagingUsername,
  LIVE_QA_PASSWORD: stagingPassword,
  LIVE_QA_PEER_USERNAME: "",
  LIVE_QA_PEER_PASSWORD: "",
  LEADERBOARD_READONLY_EXPECTED_ORIGIN: new URL(stagingBaseUrl).origin,
  LEADERBOARD_READONLY_EXPECTED_SUPABASE_REF: process.env.STAGING_SUPABASE_PROJECT_REF,
  LEADERBOARD_READONLY_DENIED_SUPABASE_REF: proof?.liveRef || process.env.SUPABASE_PROJECT_REF,
  LIVE_QA_EXPECT_ADMIN: proof ? "1" : process.env.STAGING_QA_EXPECT_ADMIN || "0",
  CHAT_QA_EXPECTED_BUILD: proof?.buildId || "",
  SCHEDULE_QA_EXPECTED_BUILD: proof?.buildId || "",
  SCHEDULE_QA_DATABASE_MODE: proof ? "database" : "",
  SUPABASE_PROJECT_REF: proof?.liveRef || process.env.SUPABASE_PROJECT_REF,
  VERCEL_TOKEN: "",
};

function run(config) {
  const result = spawnSync("npx", ["playwright", "test", `--config=${config}`], {
    env: testEnv,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (proof) {
  console.log(`Isolated staging write target verified for ${proof.buildId}.`);
  run("qa/schedule-write.staging.config.mjs");
  run("qa/chat-write.staging.config.mjs");
} else {
  run("qa/live.playwright.config.mjs");
}
