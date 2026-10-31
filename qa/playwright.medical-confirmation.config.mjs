import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';

// Native PostgreSQL is mandatory here; never silently skip the mixed-client gate.
// Kept outside the ordinary browser suite which has no database tools installed.
export default defineConfig({
  ...base,
  projects: ['Desktop Chrome', 'Desktop Safari'].map((device, index) => ({
    name: index ? 'confirmation-webkit' : 'confirmation-chromium',
    testMatch: /medical-mixed-client-acceptance\.native-browser\.spec\.mjs/,
    use: { ...devices[device] },
  })),
});
