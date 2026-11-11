import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('authenticated history is registered by the real live config without worker-option errors', () => {
  // --list loads the real spec/options but never runs auth setup or contacts Live.
  const output = execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
    'test', '--config=qa/live.playwright.config.mjs', '--list',
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8', timeout: 20_000,
  });
  expect(output).toContain('production history reads both formats and revokes access during export');
  expect(output).toContain('production storage diagnostics preserve pending work and stop restore under quota pressure');
});
