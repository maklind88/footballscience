import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyMedicalProductionMode } from '../scripts/verify-medical-production-mode.mjs';
const expectedBuild = 'a'.repeat(40);
const env = { LIVE_QA_USERNAME: 'synthetic@example.test', LIVE_QA_PASSWORD: 'synthetic-secret' };
const config = { ok: true, buildId: expectedBuild, url: 'https://bustidorxevacosqhkcz.supabase.co/', anonKey: 'sb_publishable_synthetic' };
function fixture({ mode = 'database', initial = {}, final = {}, statusError = false, logoutError = false } = {}) {
  const calls = []; let reads = 0;
  const request = async (url, options) => {
    calls.push({url, options});
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    let value, code = 200;
    if (url.endsWith('/api/client-config') && options.method === 'POST') value = { session: { access_token: 'synthetic-token', user: { id: 'synthetic-user' } } };
    else if (url.endsWith('/api/client-config')) value = { ...config, ...(reads++ ? final : initial) };
    else if (url.endsWith('/api/medical')) { assert.equal(options.method, undefined); value = { ok: true, schema: 'footballscience-medical-database-v1', mode, enabled: mode === 'database' }; if (statusError) code = 503; }
    else if (url === 'https://bustidorxevacosqhkcz.supabase.co/auth/v1/logout?scope=local') code = logoutError ? 500 : 204;
    else assert.fail('Unexpected destination');
    return { ok: code < 400, status: code, json: async () => value };
  };
  return { calls, request };
}
for (const mode of ['database', 'legacy']) test('reports actual ' + mode + ' mode without clinical writes and revokes only its session', async () => {
  const f = fixture({ mode }); const result = await verifyMedicalProductionMode({ expectedBuild, env, request: f.request });
  assert.equal(result.mode, mode); assert.equal(result.enabled, mode === 'database');
  assert.equal(f.calls.length, 5); assert.ok(!JSON.stringify(result).includes('synthetic'));
  assert.deepEqual(f.calls.filter(c => c.options.method === 'POST').map(c => new URL(c.url).pathname), ['/api/client-config', '/auth/v1/logout']);
});
for (const initial of [{ buildId: 'b'.repeat(40) }, { url: 'https://other.example/' }, { anonKey: 'service-role-key' }]) test('refuses mismatched identity before transmitting credentials ' + JSON.stringify(initial), async () => {
  const f = fixture({initial}); await assert.rejects(verifyMedicalProductionMode({expectedBuild,env,request:f.request})); assert.equal(f.calls.length,1);
});
for (const options of [{statusError:true},{final:{buildId:'b'.repeat(40)}}]) test('revokes new session after failed capability/build check ' + JSON.stringify(options), async () => {
  const f = fixture(options); await assert.rejects(verifyMedicalProductionMode({expectedBuild,env,request:f.request})); assert.ok(f.calls.at(-1).url.endsWith('/logout?scope=local'));
});
test('fails if session revocation is unconfirmed', async () => {
  const f=fixture({logoutError:true}); await assert.rejects(verifyMedicalProductionMode({expectedBuild,env,request:f.request}),/HTTP 500/);
});
test('requires exact build and credentials before network', async () => {
  const request=()=>assert.fail('Network must not run');
  await assert.rejects(verifyMedicalProductionMode({expectedBuild:'main',env,request}));
  await assert.rejects(verifyMedicalProductionMode({expectedBuild,env:{},request}));
});
