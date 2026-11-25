import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({
  ...base,
  timeout: 90_000,
  workers: 1,
  reporter: [['list'], ['./helpers/session-save-chain-reporter.mjs']],
  outputDir: '../test-results/session-saving-chain',
  projects: [{ name: 'sessions-postgres-chromium', testMatch: /session-save-chain\.native-browser\.spec\.mjs$/,
    use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off' } }],
});
