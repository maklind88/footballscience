import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
const testMatch = /(?:lossless-write-(?:admission|growth|failures|lifecycle)|compact-recovery-readiness)\.smoke\.spec\.mjs$/;
export default defineConfig({ ...base, outputDir: '../test-results/lossless-write', reporter: [
  ['list'], ['json', { outputFile: '../test-results/lossless-write/results.json' }],
], projects: [
  { name: 'proof-chromium', testMatch, use: devices['Desktop Chrome'] },
  { name: 'proof-webkit', testMatch, use: devices['Desktop Safari'] },
] });
