import { defineConfig } from '@playwright/test';
import sessions from './playwright.session-saving-chain.config.mjs';
import medical from './playwright.medical-confirmation.config.mjs';
import { assertSavedWorkLoopback, savedWorkIsolationProxy } from './helpers/saved-work-loopback-browser.mjs';

const baseURL = assertSavedWorkLoopback(process.env.SAVED_WORK_ASSETS_LOOPBACK || '');
const onlyMedicalVisibility = /medical-saving-chain\.native-browser\.spec\.mjs$/;
const launchOptions = { proxy: savedWorkIsolationProxy(baseURL) };

export default defineConfig({
  ...sessions,
  webServer: undefined,
  outputDir: process.env.SAVED_WORK_ASSETS_OUTPUT,
  reporter: [['list'], ['json', { outputFile: process.env.SAVED_WORK_ASSETS_REPORT }]],
  use: { ...sessions.use, baseURL, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    ...sessions.projects,
    ...medical.projects.map(project => ({ ...project, testMatch: onlyMedicalVisibility })),
  ].map(project => ({ ...project, use: { ...project.use, baseURL, launchOptions, trace: 'off', screenshot: 'off', video: 'off' } })),
});
