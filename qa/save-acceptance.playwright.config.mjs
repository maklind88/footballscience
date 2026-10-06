import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'save-acceptance.staging.spec.mjs', timeout: 240000,
  workers: 1, retries: 0, reporter: 'list', outputDir: '../test-results/save-acceptance',
  expect: { timeout: 20000 },
  use: { ...devices['Desktop Chrome'], screenshot: 'off', trace: 'off', video: 'off' },
});
