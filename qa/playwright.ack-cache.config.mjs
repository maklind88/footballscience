import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
const browser = /(?:acknowledged-cache-pressure|session-full-app-storage|medical-saved-visibility|medical-recommendation-journey|save-status-snapshot)\.smoke\.spec\.mjs$/;
export default defineConfig({ ...base, reporter: [['list']], projects: [
  { name: 'cache-contracts', testMatch: /(?:acknowledged-cache-pressure|central-sync-runtime-service-contract|data-safety-runtime-service-contract)\.api\.spec\.mjs$/ },
  { name: 'cache-chromium', testMatch: browser, use: devices['Desktop Chrome'] },
  { name: 'cache-webkit', testMatch: browser, use: devices['Desktop Safari'] },
] });
