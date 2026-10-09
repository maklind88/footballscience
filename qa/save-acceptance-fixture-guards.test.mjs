import test from 'node:test';
import { addMedicalAcceptanceRoster } from './helpers/medical-acceptance-roster-fixture.mjs';
import assert from 'node:assert/strict';
import { assertOwnedMedicalChange, assertOwnedSessionChange, createStagingAcceptance } from './helpers/save-acceptance-staging.mjs';
const run = 'qa-save-test';
test('Medical fixture guard preserves existing records, policy, players and other fields', () => {
  const before = { records: [{ id: 'real', participation: 50 }], policy: { months: 12 }, players: [{ id: 'player' }] };
  const after = structuredClone(before); after.records.push({ id: run + '-record', participation: 100 });
  assert.doesNotThrow(() => assertOwnedMedicalChange(before, after, run));
  for (const mutate of [state => state.records[0].participation = 0, state => state.policy.months = 1,
    state => state.players = [], state => state.otherField = 'changed']) {
    const bad = structuredClone(after); mutate(bad);
    assert.throws(() => assertOwnedMedicalChange(before, bad, run), /existing Medical/);
  }
});
test('Medical fixture archival can only change run-owned ids', () => {
  const before = { records: [{ id: run + '-record' }, { id: 'real' }] }, after = structuredClone(before);
  after.records[0].archivedAt = '2026-10-06T12:00:00Z';
  assert.doesNotThrow(() => assertOwnedMedicalChange(before, after, run));
  after.records[1].archivedAt = '2026-10-06T12:00:00Z';
  assert.throws(() => assertOwnedMedicalChange(before, after, run));
});
test('Session fixture cannot replace an existing date or another run block', () => {
  const change = { before: { session: null }, after: { session: { title: run, blocks: [{ id: run + '-block' }] } } };
  assert.doesNotThrow(() => assertOwnedSessionChange(change, run));
  change.before.session = { title: 'existing training' };
  assert.throws(() => assertOwnedSessionChange(change, run));
  change.before.session.title = run;
  change.after.session.blocks.push({ id: 'real-block' });
  assert.throws(() => assertOwnedSessionChange(change, run));
});
test('production destination and missing explicit fixture activation stop before any network', async () => {
  await assert.rejects(createStagingAcceptance({ STAGING_QA_BASE_URL: 'https://footballscience.xyz' }), /Exact staging/);
  await assert.rejects(createStagingAcceptance({ STAGING_QA_BASE_URL: 'https://staging.footballscience.xyz', STAGING_SUPABASE_PROJECT_REF: 'pokrksgempkuraueglpu' }), /explicitly enabled/);
});

test('Medical browser roster prerequisite preserves existing payloads and cannot replace a player', () => {
  const key = 'football-player-profiles-v1', player = { id: run + '-player', name: 'Synthetic' };
  const state = { players: [{ id: 'existing', name: 'Existing' }], view: 'kept' };
  const payload = { entries: { [key]: JSON.stringify(state), other: 'unchanged' }, metadata: { [key]: { revision: 7 } }, absentKeys: ['absent'] };
  const before = structuredClone(payload), after = addMedicalAcceptanceRoster(payload, { run, player });
  assert.deepEqual(payload, before);
  assert.equal(after.entries.other, before.entries.other);
  assert.deepEqual(JSON.parse(after.entries[key]).players, [...state.players, player]);
  assert.equal(JSON.parse(after.entries[key]).view, 'kept');
  assert.deepEqual(after.metadata, before.metadata);
  assert.throws(() => addMedicalAcceptanceRoster(after, { run, player }), /collision/);
  assert.throws(() => addMedicalAcceptanceRoster(payload, { run, player: { id: 'existing' } }), /ownership/);
  assert.equal(addMedicalAcceptanceRoster({ entries: {} }, { run, player }).entries[key], undefined);
  const absent = addMedicalAcceptanceRoster({ entries: {}, absentKeys: [key] }, { run, player });
  assert.deepEqual(JSON.parse(absent.entries[key]).players, [player]);
  assert.deepEqual(absent.absentKeys, []);
});
