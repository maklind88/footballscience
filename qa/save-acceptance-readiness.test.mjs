import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySaveReadiness } from '../scripts/verify-save-acceptance-readiness.mjs';
const ref = 'pokrksgempkuraueglpu', backend = `https://${ref}.supabase.co`;
const sha = 'a'.repeat(40), keys = ['football-medical-team-v1', 'football-session-planner-v3'];
const jwt = (body) => 'x.' + Buffer.from(JSON.stringify(body)).toString('base64url') + '.x';
const env = { STAGING_QA_BASE_URL: 'https://staging.footballscience.xyz', STAGING_SUPABASE_PROJECT_REF: ref,
  SAVE_QA_EXPECTED_BUILD: sha, STAGING_QA_USERNAME: 'secret-user', STAGING_QA_PASSWORD: 'secret-password' };
function harness(change = {}) {
  const calls = []; let logins = 0, reads = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/api/client-config') && options.method !== 'POST')
      return Response.json({ ok: true, url: change.backend || backend, buildId: change.build || sha, anonKey: jwt({ role: 'anon', ref }) });
    if (url.endsWith('/api/client-config')) {
      logins++;
      return Response.json({ session: { access_token: jwt({ iss: backend + '/auth/v1', role: 'authenticated', sub: change.distinct && logins === 2 ? 'b' : 'a' }) } });
    }
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: change.distinct && logins === 2 ? 'b' : 'a', app_metadata: { role: 'medical' } });
    if (url.includes('/api/app-state?')) {
      reads++;
      if (change.failRead) throw new Error('secret-password clinical content');
      return Response.json({ ok: true, entries: Object.fromEntries(keys.map(k => [k, JSON.stringify({ data: change.drift && reads === 2 ? 'changed' : 'private' })])),
        metadata: Object.fromEntries(keys.map(k => [k, { revision: 4, sourceOfTruth: 'server' }])) });
    }
    if (url === backend + '/auth/v1/logout?scope=local') return new Response(null, { status: 204 });
    throw new Error('Unexpected request');
  };
  return { fetchImpl, calls };
}
test('same-account sessions are explicit; read-only probe cannot certify multiuser/offline', async () => {
  const h = harness(), result = await verifySaveReadiness({ env, ...h });
  assert.equal(result.distinctUsers, false); assert.equal(result.peerConfigured, false);
  assert.equal(result.writesTested, false); assert.equal(result.offlineTested, false);
  assert.ok(result.modules.every(m => m.sameContent && m.sameRevision));
  assert.equal(result.modules[0].primaryPolicyAllowsWrite, true);
  assert.equal(h.calls.filter(c => c.url.includes('logout?scope=local')).length, 2);
  assert.ok(h.calls.filter(c => c.url.includes('/api/app-state?')).every(c => !c.options.method));
  assert.ok(!JSON.stringify(result).includes('private')); assert.ok(!JSON.stringify(result).includes('secret'));
});
test('two distinct authenticated identities are reported without claiming writes', async () => {
  const result = await verifySaveReadiness({ env: { ...env, STAGING_QA_PEER_USERNAME: 'peer', STAGING_QA_PEER_PASSWORD: 'peer-secret' }, ...harness({ distinct: true }) });
  assert.equal(result.distinctUsers, true); assert.equal(result.writesTested, false);
});
test('production backend mismatch stops before login', async () => {
  const h = harness({ backend: 'https://bustidorxevacosqhkcz.supabase.co' });
  await assert.rejects(verifySaveReadiness({ env, ...h }), /backend mismatch/);
  assert.equal(h.calls.length, 1);
});
test('noncanonical credential destination rejected before network', async () => {
  for (const url of ['https://footballscience.xyz', 'https://staging.footballscience.xyz.attacker.test', 'https://user@staging.footballscience.xyz']) {
    const h = harness();
    await assert.rejects(verifySaveReadiness({ env: { ...env, STAGING_QA_BASE_URL: url }, ...h }));
    assert.equal(h.calls.length, 0);
  }
});
test('same-revision inconsistency fails and revokes only created sessions', async () => {
  const h = harness({ drift: true });
  await assert.rejects(verifySaveReadiness({ env, ...h }), /different content/);
  assert.equal(h.calls.filter(c => c.url.includes('logout?scope=local')).length, 2);
});
test('network failure suppresses secrets and still cleans up', async () => {
  const h = harness({ failRead: true });
  await assert.rejects(verifySaveReadiness({ env, ...h }), error => !error.message.includes('secret-password') && !error.message.includes('clinical'));
  assert.equal(h.calls.filter(c => c.url.includes('logout?scope=local')).length, 2);
});

test('exact deployment id is accepted, wrong id fails before login', async () => {
  const build = 'dpl_7kYorqofNykQ4Uu4ArS1sRNts6Wq';
  assert.equal((await verifySaveReadiness({ env: { ...env, SAVE_QA_EXPECTED_BUILD: build }, ...harness({ build }) })).build, build);
  const h = harness({ build });
  await assert.rejects(verifySaveReadiness({ env, ...h }), /build changed/);
  assert.equal(h.calls.length, 1);
});
