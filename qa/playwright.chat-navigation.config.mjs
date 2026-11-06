import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({ ...base, reporter: [['list']], projects: [
  { name: 'chat-contracts', testMatch: /(?:chat-navigation-storage|chat-stability-flow|chat-widget-core)\.api\.spec\.mjs$/ },
  { name: 'chat-chromium', testMatch: /(?:chat-navigation-storage|chat-create-menu-stability)\.smoke\.spec\.mjs$/, use: devices['Desktop Chrome'] },
  { name: 'chat-webkit', testMatch: /chat-navigation-storage\.smoke\.spec\.mjs$/, use: devices['Desktop Safari'] },
] });
