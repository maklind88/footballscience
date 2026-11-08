import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({ ...base, testMatch: /(?:save-sync-growth|snapshot-scope-reuse)\.smoke\.spec\.mjs$/,
  outputDir: '../test-results/save-sync-growth', reporter: [['list']], retries: 0,
  projects: [{ name: 'growth-chromium', use: devices['Desktop Chrome'] },
    { name: 'growth-webkit', use: devices['Desktop Safari'] }] });
