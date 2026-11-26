import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: [/sessions-offline-start\.smoke\.spec\.mjs$/, /sessions-offline-code\.spec\.mjs$/],
  outputDir: '../test-results/sessions-offline-start',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'offline-start-chromium', use: { browserName: 'chromium' } },
    { name: 'offline-start-webkit', use: { browserName: 'webkit' } },
  ],
});
