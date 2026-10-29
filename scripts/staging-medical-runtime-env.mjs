import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

// Carry only this non-secret, explicitly configured staging flag into the CLI
// runtime. A branch-scoped pull supplies build env, not necessarily runtime env.
export function stagingMedicalRuntimeEnv(source) {
  const value = parseEnv(source).MEDICAL_STORAGE_MODE;
  if (!['database', 'legacy'].includes(value)) {
    throw new Error('Staging MEDICAL_STORAGE_MODE must explicitly be database or legacy; value suppressed');
  }
  return 'STAGING_MEDICAL_STORAGE_MODE=' + value;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(stagingMedicalRuntimeEnv(readFileSync('.vercel/.env.preview.local', 'utf8'))); }
  catch { console.error('Staging Medical runtime configuration missing or invalid; values suppressed'); process.exitCode = 1; }
}
