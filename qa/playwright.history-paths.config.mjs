import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
const testMatch = /(?:history-default-paths|history-path-concurrency)\.smoke\.spec\.mjs$/;
export default defineConfig({ ...base, outputDir: '../test-results/history-paths', reporter: [['list']], projects: [
  { name: 'paths-chromium', testMatch, use: devices['Desktop Chrome'] },
  { name: 'paths-webkit', testMatch, use: devices['Desktop Safari'] },
] });
