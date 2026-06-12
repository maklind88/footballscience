import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const liveAuthStatePath = path.resolve(qaDir, "..", ".playwright", "auth", "live.json");

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"]],
  outputDir: "../test-results/live",
  globalSetup: path.join(qaDir, "live-auth.global-setup.mjs"),
  use: {
    baseURL: process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    storageState: liveAuthStatePath,
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
