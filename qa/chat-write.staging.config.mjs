import { defineConfig, devices } from '@playwright/test';

if (!process.env.CHAT_QA_EXPECTED_BUILD) throw new Error('An exact staged build is required for Chat write QA.');

export default defineConfig({
  testDir: '.',
  testMatch: 'production.live.spec.mjs',
  grep: /staging test account can send, reload, and clean up a chat message|staging peer accounts prove DM unread state and read receipt end-to-end/,
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results/chat-write-staging',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.STAGING_QA_BASE_URL,
    serviceWorkers: 'block',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
