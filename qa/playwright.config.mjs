import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.QA_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../playwright-report" }],
  ],
  outputDir: "../test-results",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node static-server.mjs --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    {
      name: "api-contracts",
      testMatch: /.*\.api\.spec\.mjs/,
    },
    {
      name: "chromium",
      testMatch: /.*\.smoke\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
