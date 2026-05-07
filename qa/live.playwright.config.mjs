import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"]],
  outputDir: "../test-results/live",
  use: {
    baseURL: process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "live-chromium",
      testMatch: /.*\.live\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
