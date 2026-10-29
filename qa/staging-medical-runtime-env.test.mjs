import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stagingMedicalRuntimeEnv } from '../scripts/staging-medical-runtime-env.mjs';
test('carries only the explicit non-secret mode, including a deliberate legacy rollback', () => {
  for (const mode of ['database', 'legacy']) {
    assert.equal(stagingMedicalRuntimeEnv('SECRET_TOKEN="private"\nMEDICAL_STORAGE_MODE="' + mode + '"\nOTHER="ignored"'), 'STAGING_MEDICAL_STORAGE_MODE=' + mode);
  }
});
test('missing, unexpected and multiline flags fail without exposing values', () => {
  for (const text of ['', 'MEDICAL_STORAGE_MODE=private-secret', 'MEDICAL_STORAGE_MODE="database\nEVIL=private-secret"']) {
    assert.throws(() => stagingMedicalRuntimeEnv(text), error => !error.message.includes('private-secret') && error.message.includes('suppressed'));
  }
});
test('only staging preview runtime receives the pulled flag with release serialization intact', () => {
  const workflow = readFileSync(new URL('../.github/workflows/staging-deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull --yes --environment=preview --git-branch=staging/);
  assert.match(workflow, /node scripts\/staging-medical-runtime-env.mjs >> "\$GITHUB_ENV"/);
  assert.match(workflow, /deploy --prebuilt --target=preview --env "MEDICAL_STORAGE_MODE=\$STAGING_MEDICAL_STORAGE_MODE"/);
  assert.match(workflow, /group: footballscience-production-edge-release\n  cancel-in-progress: false/);
  assert.match(workflow, /needs: full-qa/);
});
