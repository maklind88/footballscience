import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.RUNNER_TEMP
  ? path.join(process.env.RUNNER_TEMP, "leaderboard-production-readonly")
  : path.resolve(qaDir, "../test-results/leaderboard-production-readonly");

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir,
  use: {
    baseURL: process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [{
    name: "leaderboard-production-readonly",
    testMatch: /leaderboard-production-readonly\.live\.spec\.mjs/,
    use: { ...devices["Desktop Chrome"] },
  }],
});
