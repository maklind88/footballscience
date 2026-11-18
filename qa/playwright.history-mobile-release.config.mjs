import {defineConfig,devices} from '@playwright/test';
import base from './playwright.config.mjs';
const testMatch=/(?:history-dedup-upgrade|storage-upgrade-guide|storage-mobile-access)\.smoke\.spec\.mjs$|compact-writer(?:-transaction)?\.smoke\.spec\.mjs$/;
export default defineConfig({...base,outputDir:'../test-results/history-mobile-release',reporter:[['list']],projects:[
{name:'release-chromium',testMatch,use:devices['Desktop Chrome']},
{name:'release-webkit',testMatch,use:devices['Desktop Safari']},
]});
