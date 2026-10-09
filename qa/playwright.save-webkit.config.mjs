import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config.mjs";

export default defineConfig({
  ...baseConfig,
  projects: [{
    name: "save-webkit",
    testMatch: /(?:medical-working-drafts|medical-draft-verification|medical-draft-recovery|central-state-revision|local-database-compatibility|save-offline-recovery|offline-operation-journal|session-save-storage|medical-saved-visibility|storage-health|indexeddb-storage-health|save-status-snapshot|local-save-issues|distinct-snapshot|library-save-storage)\.smoke\.spec\.mjs/,
    use: { ...devices["Desktop Safari"] },
  }],
});
