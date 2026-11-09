import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';
const browser = /(?:history-compatible-product|save-sync-growth|snapshot-scope-reuse|snapshot-preservation|snapshot-growth|snapshot-history|storage-health|indexeddb-storage-health|save-status-snapshot|distinct-snapshot)\.smoke\.spec\.mjs$/;
export default defineConfig({...base,outputDir:'../test-results/snapshot-history',reporter:[['list']],projects:[
  {name:'history-contracts',testMatch:/(?:data-safety-runtime-service-contract|library-cache-pressure)\.api\.spec\.mjs$/},
  {name:'history-chromium',testMatch:browser,use:devices['Desktop Chrome']},
  {name:'history-webkit',testMatch:browser,use:devices['Desktop Safari']},
]});
