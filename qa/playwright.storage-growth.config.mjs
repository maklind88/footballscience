import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
const testMatch = /(?:storage-growth-observability|compact-recovery-readiness)\.smoke\.spec\.mjs$/;
export default defineConfig({ ...base, outputDir: '../test-results/storage-growth', reporter: [['list']], projects: [
  { name: 'growth-chromium', testMatch, use: devices['Desktop Chrome'] },
  { name: 'growth-webkit', testMatch, use: devices['Desktop Safari'] },
] });
