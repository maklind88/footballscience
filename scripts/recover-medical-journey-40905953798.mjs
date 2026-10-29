import { isDeepStrictEqual } from 'node:util';
import { createStagingAcceptance, medicalKey, requireProof } from '../qa/helpers/save-acceptance-staging.mjs';
import { verifySaveAcceptanceFrontend } from '../qa/helpers/save-acceptance-frontend.mjs';
import { prepareJourneyRecovery, unrelatedRecoveryContent, recoveryFixture } from '../qa/helpers/medical-journey-recovery.mjs';

requireProof(process.env.RECOVER_MEDICAL_JOURNEY_RUN === '40905953798', 'Exact recovery authorization required');
await verifySaveAcceptanceFrontend({ baseUrl: process.env.STAGING_QA_BASE_URL });
const qa = await createStagingAcceptance();
try {
  const capabilityResponse = await fetch(qa.origin + '/api/medical', { headers: { Authorization: 'Bearer ' + qa.primary.token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const capability = await capabilityResponse.json();
  console.log(JSON.stringify({ medicalStatus: capabilityResponse.status, enabled: capability.enabled === true, canWrite: capability.canWrite === true, databaseMode: capability.mode === 'database' }));
  const before = await qa.read(qa.primary, medicalKey);
  const next = prepareJourneyRecovery(before.state, qa.primary.user.id, new Date().toISOString());
  await qa.identity();
  const response = await fetch(qa.origin + '/api/app-state', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + qa.primary.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: medicalKey, value: JSON.stringify(next), baseRevision: before.revision }) });
  const receipt = await response.json();
  requireProof(response.ok && receipt.ok === true, 'Synthetic recovery was not accepted');
  const after = await qa.read(qa.primary, medicalKey);
  for (const [key, id] of [['records', recoveryFixture.record.id], ['players', recoveryFixture.player.id]]) {
    requireProof(isDeepStrictEqual(after.state[key].find(r => r.id === id), next[key].find(r => r.id === id)), 'Synthetic archive readback mismatch');
  }
  requireProof(isDeepStrictEqual(unrelatedRecoveryContent(before.state), unrelatedRecoveryContent(after.state)), 'Unrelated content changed during recovery');
  await qa.identity();
  console.log(JSON.stringify({ recoveredWorkflowRun: recoveryFixture.workflowRun, archivedRecords: 1, archivedPlayers: 1, unrelatedContentUnchanged: true }));
} finally { await qa.finish(); }
