import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { requireProof } from './save-acceptance-staging.mjs';
export const recoveryFixture = JSON.parse(readFileSync(new URL('../fixtures/medical-journey-recovery-40905953798.json', import.meta.url)));
// One observed synthetic fixture only. A prefix or matching date is never enough.
export function prepareJourneyRecovery(state, actorId, timestamp) {
  const { record, player } = recoveryFixture;
  requireProof(actorId === record.createdBy, 'Recovery requires the original synthetic author');
  const currentRecords = state.records?.filter(r => r.id === record.id) || [];
  const currentPlayers = state.players?.filter(p => p.id === player.id) || [];
  requireProof(currentRecords.length === 1 && currentPlayers.length === 1, 'Recovery fixture is missing or duplicated');
  requireProof((state.records || []).filter(r => r.playerId === player.id).length === 1
    && !(state.injuryPlans || []).some(p => p.playerId === player.id), 'Synthetic player has new work; preserved');
  requireProof(isDeepStrictEqual(currentRecords[0], record) && isDeepStrictEqual(currentPlayers[0], player), 'Synthetic content changed; preserved');
  const next = structuredClone(state);
  for (const row of [next.records.find(r => r.id === record.id), next.players.find(p => p.id === player.id)]) {
    row.archivedAt = timestamp; row.archivedBy = actorId; row.archiveReason = 'Synthetic staging QA cleanup 40905953798';
  }
  return next;
}
export function unrelatedRecoveryContent(state) {
  return { ...state, records: state.records.filter(r => r.id !== recoveryFixture.record.id), players: state.players.filter(p => p.id !== recoveryFixture.player.id) };
}
