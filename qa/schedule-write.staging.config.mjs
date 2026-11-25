import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "schedule-write.staging.spec.mjs",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../test-results/schedule-write-staging",
  use: { ...devices["Desktop Chrome"], screenshot: "off", trace: "off", video: "off" },
});
