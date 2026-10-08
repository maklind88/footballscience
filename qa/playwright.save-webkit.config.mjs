import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config.mjs";

export default defineConfig({
  ...baseConfig,
  projects: [{
    name: "save-webkit",
    testMatch: /(?:central-state-revision|local-database-compatibility|save-offline-recovery|offline-operation-journal|session-save-storage|medical-saved-visibility|storage-health|indexeddb-storage-health|save-status-snapshot|distinct-snapshot|library-save-storage)\.smoke\.spec\.mjs/,
    use: { ...devices["Desktop Safari"] },
  }],
});
