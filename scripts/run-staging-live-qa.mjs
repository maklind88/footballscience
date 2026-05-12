import { spawnSync } from "node:child_process";
import process from "node:process";

const required = process.argv.includes("--required");
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
  if (required) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message}. Skipping staging smoke.`);
  process.exit(0);
}

const result = spawnSync("npx", ["playwright", "test", "--config=qa/live.playwright.config.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    LIVE_QA_BASE_URL: stagingBaseUrl,
    LIVE_QA_USERNAME: stagingUsername,
    LIVE_QA_PASSWORD: stagingPassword,
    LIVE_QA_EXPECT_ADMIN: process.env.STAGING_QA_EXPECT_ADMIN || "0",
  },
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
