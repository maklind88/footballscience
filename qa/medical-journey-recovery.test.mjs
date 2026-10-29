import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareJourneyRecovery, unrelatedRecoveryContent, recoveryFixture as f } from './helpers/medical-journey-recovery.mjs';
const actor = f.record.createdBy, timestamp = '2026-10-29T16:30:00.000Z';
const baseline = () => ({ records: [structuredClone(f.record), { id: 'unrelated', playerId: 'other', participation: 75 }], players: [structuredClone(f.player), { id: 'other' }], injuryPlans: [], policy: { preserve: true } });
test('recovery archives only both exact observed synthetic rows and retains all unrelated content', () => {
  const state = baseline(), before = structuredClone(state), next = prepareJourneyRecovery(state, actor, timestamp);
  assert.deepEqual(state, before);
  assert.equal(next.records[0].archivedAt, timestamp); assert.equal(next.players[0].archivedAt, timestamp);
  assert.deepEqual(unrelatedRecoveryContent(next), unrelatedRecoveryContent(state));
});
for (const [label, mutate] of Object.entries({
  changed: s => s.records[0].participation = 75,
  playerChanged: s => s.players[0].name = 'Changed',
  duplicate: s => s.records.push(structuredClone(s.records[0])),
  newWork: s => s.records.push({ id: 'new', playerId: f.player.id }),
  plan: s => s.injuryPlans.push({ playerId: f.player.id }),
  missing: s => s.records.shift(),
  alreadyArchived: s => s.records[0].archivedAt = timestamp,
})) test('recovery refuses ' + label, () => { const s = baseline(); mutate(s); assert.throws(() => prepareJourneyRecovery(s, actor, timestamp)); });
test('recovery refuses another actor', () => assert.throws(() => prepareJourneyRecovery(baseline(), 'other', timestamp)));
