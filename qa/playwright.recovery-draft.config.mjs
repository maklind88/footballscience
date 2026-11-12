import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
const testMatch = /(?:history-recovery-draft|history-recovery-product)\.smoke\.spec\.mjs$/;
export default defineConfig({ ...base, outputDir: '../test-results/recovery-draft', reporter: [['list']], projects: [
  { name: 'recovery-chromium', testMatch, use: devices['Desktop Chrome'] },
  { name: 'recovery-webkit', testMatch, use: devices['Desktop Safari'] },
] });
