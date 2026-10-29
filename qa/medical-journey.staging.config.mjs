import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'medical-journey.staging.spec.mjs', timeout: 240000,
  workers: 1, retries: 0, maxFailures: 1, reporter: 'list', outputDir: '../test-results/medical-journey-staging',
  expect: { timeout: 30000 },
  use: { ...devices['Desktop Chrome'], screenshot: 'off', trace: 'off', video: 'off' },
});
