import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseMedicalVisibility, summarizeMedicalVisibility } from '../scripts/diagnose-medical-visibility.mjs';
const backend = 'https://bustidorxevacosqhkcz.supabase.co', build = 'a'.repeat(40);
const jwt = x => 'x.' + Buffer.from(JSON.stringify(x)).toString('base64url') + '.x';
const env = { LIVE_QA_BASE_URL: 'https://footballscience.xyz', SUPABASE_PROJECT_REF: 'bustidorxevacosqhkcz',
  LIVE_QA_USERNAME: 'secret-user', LIVE_QA_PASSWORD: 'secret-password', DIAGNOSTIC_PLAYER: 'Target Player', DIAGNOSTIC_DATE: '2026-10-05', DIAGNOSTIC_EXPECTED_BUILD: build };
function harness(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/client-config') && !options.method) return Response.json({ ok: true, url: overrides.backend || backend, buildId: overrides.build || build, anonKey: jwt({ role: 'anon', ref: env.SUPABASE_PROJECT_REF }) });
    if (url.endsWith('/api/client-config')) return Response.json({ session: { access_token: jwt({ iss: backend + '/auth/v1', role: 'authenticated', sub: 'qa' }) } });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'qa' });
    if (url.includes('/api/app-state?')) {
      if (overrides.fail) throw new Error('secret-password clinical note');
      return Response.json({ ok: true, entries: { 'football-medical-team-v1': JSON.stringify({ players: [{ id: 'private-id', name: 'Target Player' }], records: [{ playerId: 'private-id', date: '2026-10-05', comment: 'clinical note', participation: 47 }] }) }, metadata: { 'football-medical-team-v1': { revision: 4 } }, absentKeys: ['football-player-profiles-v1'] });
    }
    if (url.endsWith('/auth/v1/logout?scope=local')) return new Response(null, { status: 204 });
    throw new Error('Unexpected request');
  }; return { fetchImpl, calls };
}
test('read-only diagnosis suppresses identity and clinical content and closes only its login', async () => {
  const h = harness(), result = await diagnoseMedicalVisibility({ env, ...h });
  assert.equal(result.activeDateRecords, 1); assert.equal(result.dataWrites, 0);
  assert.doesNotMatch(JSON.stringify(result), /private-id|Target Player|clinical note|47|secret/);
  assert.ok(h.calls.filter(c => c.url.includes('/api/app-state?')).every(c => !c.options.method));
  assert.equal(h.calls.filter(c => c.url.endsWith('/auth/v1/logout?scope=local')).length, 1);
});
test('wrong backend/build stops before login and wrong origin before network', async () => {
  for (const override of [{ backend: 'https://other.supabase.co' }, { build: 'b'.repeat(40) }]) {
    const h = harness(override); await assert.rejects(diagnoseMedicalVisibility({ env, ...h })); assert.equal(h.calls.length, 1);
  }
  const h = harness(); await assert.rejects(diagnoseMedicalVisibility({ env: { ...env, LIVE_QA_BASE_URL: 'https://other.test' }, ...h })); assert.equal(h.calls.length, 0);
});
test('read failures hide exception content and revoke session', async () => {
  const h = harness({ fail: true }); await assert.rejects(diagnoseMedicalVisibility({ env, ...h }), e => !/secret|clinical note/.test(e.message));
  assert.equal(h.calls.at(-1).url, backend + '/auth/v1/logout?scope=local');
});
test('duplicate identities, archives and removed players are reported as evidence not merged', () => {
  const medical = { players: [{ id: 'a', name: 'Target Player' }, { id: 'b', name: 'Target Player', archivedAt: '2026-10-04' }], records: [
    { playerId: 'a', date: '2026-10-05' }, { playerId: 'b', date: '2026-10-05', archivedAt: '2026-10-06' }, { playerId: 'other', date: '2026-10-05' }] };
  const out = summarizeMedicalVisibility(medical, { removedPlayerIds: ['a'] }, 'Target Player', '2026-10-05');
  assert.equal(out.dateRecords, 2); assert.equal(out.distinctMatchedPlayerIds, 2); assert.equal(out.archivedDateRecords, 1); assert.equal(out.explicitlyRemovedMedicalPlayers, 1);
  assert.ok(out.dateRecordMetadata.every(r => !r.matchesActiveMedicalPlayer));
});
