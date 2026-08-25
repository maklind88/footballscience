import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 150_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"]],
  outputDir: "../test-results/leaderboard-staging",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || process.env.STAGING_QA_BASE_URL || "http://127.0.0.1:9",
    timezoneId: "Europe/Stockholm",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [{
    name: "leaderboard-staging-chromium",
    testMatch: /leaderboard\.staging\.spec\.mjs/,
    use: { ...devices["Desktop Chrome"] },
  }],
});
