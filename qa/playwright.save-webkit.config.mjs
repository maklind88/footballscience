import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config.mjs";

export default defineConfig({
  ...baseConfig,
  projects: [{
    name: "save-webkit",
    testMatch: /(?:central-state-revision|local-database-compatibility|save-offline-recovery|offline-operation-journal|session-save-storage)\.smoke\.spec\.mjs/,
    use: { ...devices["Desktop Safari"] },
  }],
});
