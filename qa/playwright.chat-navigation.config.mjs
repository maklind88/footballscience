import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({ ...base, reporter: [['list']], projects: [
  { name: 'chat-contracts', testMatch: /(?:chat-navigation-storage|chat-stability-flow|chat-widget-core|chat-inbox-refresh)\.api\.spec\.mjs$/ },
  { name: 'chat-chromium', testMatch: /(?:chat-navigation-storage|chat-create-menu-stability|chat-inbox-refresh)\.smoke\.spec\.mjs$/, use: devices['Desktop Chrome'] },
  { name: 'chat-webkit', testMatch: /(?:chat-navigation-storage|chat-inbox-refresh)\.smoke\.spec\.mjs$/, use: devices['Desktop Safari'] },
] });
