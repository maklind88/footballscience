import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertLiveMedicalIntent, createLiveMedicalTestAccount } from './helpers/medical-live-test-account.mjs';
import { createStagingAcceptance } from './helpers/save-acceptance-staging.mjs';

const valid = { MEDICAL_LIVE_TEST_INTENT: 'synthetic-medical-only', LIVE_QA_BASE_URL: 'https://footballscience.xyz',
  MEDICAL_LIVE_EXPECTED_BUILD: 'a'.repeat(40), LIVE_QA_USERNAME: 'synthetic', LIVE_QA_PASSWORD: 'not-real' };
test('live synthetic verification requires exact explicit intent, origin, SHA and credentials', async () => {
  assert.doesNotThrow(() => assertLiveMedicalIntent(valid));
  for (const key of Object.keys(valid)) {
    const env = { ...valid }; delete env[key];
    await assert.rejects(createLiveMedicalTestAccount(env));
  }
  for (const origin of ['https://staging.footballscience.xyz', 'https://example.com', 'https://footballscience.xyz.evil.test']) {
    await assert.rejects(createLiveMedicalTestAccount({ ...valid, LIVE_QA_BASE_URL: origin }), /Exact production/);
  }
  await assert.rejects(createLiveMedicalTestAccount({ ...valid, MEDICAL_LIVE_EXPECTED_BUILD: 'latest' }), /Exact reviewed/);
});
test('staging acceptance still rejects production even with live opt-in', async () => {
  await assert.rejects(createStagingAcceptance({ ...valid, STAGING_QA_BASE_URL: valid.LIVE_QA_BASE_URL }), /Exact staging/);
});
test('live test uses canonical-only guarded writes, real identities, cleanup and no clinical capture', () => {
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const helper = source('./helpers/medical-live-test-account.mjs');
  assert.match(helper, /Live aggregate writes are forbidden/);
  assert.ok(helper.includes('await login(email, password)'));
  assert.match(helper, /own.id !== admin.user.id && own.role === 'medical'/);
  assert.ok(helper.includes('await revoke(medical.token)'));
  assert.match(helper, /Test account deletion not confirmed/);
  const spec = source('./medical-role-production.spec.mjs');
  assert.match(spec, /mode: 'generic-failed'/);
  assert.match(spec, /canonicalOnly: true/);
  assert.match(spec, /guard.archiveEvent/);
  assert.match(spec, /guard.unrelatedUnchanged/);
  assert.ok(spec.includes('await qa.finish()'));
  assert.doesNotMatch(spec, /saveMedical|sendSession|storageState|screenshot\(/);
  const config = source('./medical-role-production.config.mjs');
  assert.match(config, /workers: 1, retries: 0/);
  assert.match(config, /screenshot: 'off', trace: 'off', video: 'off'/);
  const workflow = source('../.github/workflows/production-smoke.yml');
  assert.match(workflow, /verify_medical_role:[\s\S]*?default: false/);
  assert.match(workflow, /github.event_name == 'workflow_dispatch' && inputs.verify_medical_role/);
  assert.match(workflow, /inputs.verify_medical_role && 'footballscience-production-edge-release'/);
  assert.match(workflow, /- run: npm run release:monitor\n        if: \$\{\{ !inputs.verify_medical_role \}\}/);
});
