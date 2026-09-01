import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQaServerReadyPath, defaultQaPort } from "./qa-server-identity.mjs";

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(qaDir, "..");
const staticServerPath = path.join(qaDir, "static-server.mjs");
const port = Number(process.env.QA_PORT || defaultQaPort(rootDir));
const baseURL = `http://127.0.0.1:${port}`;
const readyURL = `${baseURL}${createQaServerReadyPath(rootDir)}`;

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  workers: 1,
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
    command: `node ${JSON.stringify(staticServerPath)} --port ${port}`,
    url: readyURL,
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
