import { pathToFileURL } from 'node:url';
const origin = 'https://footballscience.xyz';
const backend = 'https://bustidorxevacosqhkcz.supabase.co';
function requireProof(ok, message) { if (!ok) throw new Error(message); }

// No clinical write, fixture creation, app-state read or environment mutation.
// Credentials are used only for a new QA session, revoked in finally.
export async function verifyMedicalProductionMode({ expectedBuild, env = process.env, request = fetch } = {}) {
  requireProof(/^[a-f0-9]{40}$/.test(expectedBuild || ''), 'Exact production source SHA required');
  requireProof(env.LIVE_QA_USERNAME && env.LIVE_QA_PASSWORD, 'Production QA credentials required');
  let token, publicKey;
  async function send(url, options = {}, json = true) {
    let response;
    try { response = await request(url, { ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Medical mode probe transport failed; details suppressed'); }
    requireProof(response.ok, 'Medical mode probe HTTP ' + response.status);
    if (!json) return response;
    try { return await response.json(); } catch { throw new Error('Medical mode probe returned invalid JSON'); }
  }
  async function identity() {
    const config = await send(origin + '/api/client-config');
    requireProof(config.ok && config.buildId === expectedBuild && [backend, backend + '/'].includes(config.url), 'Production build/backend mismatch');
    requireProof(typeof config.anonKey === 'string', 'Public authentication key required');
    if (!config.anonKey.startsWith('sb_publishable_')) {
      let claims;
      try { claims = JSON.parse(Buffer.from(config.anonKey.split('.')[1], 'base64url')); } catch {}
      requireProof(claims?.role === 'anon' && claims.ref === 'bustidorxevacosqhkcz', 'Unexpected authentication key');
    }
    publicKey = config.anonKey;
  }
  await identity();
  try {
    const auth = await send(origin + '/api/client-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.LIVE_QA_USERNAME, password: env.LIVE_QA_PASSWORD }) });
    token = auth.session?.access_token;
    requireProof(typeof token === 'string' && token && auth.session?.user?.id, 'Production QA login failed');
    const status = await send(origin + '/api/medical', { headers: { Authorization: 'Bearer ' + token } });
    requireProof(status.ok && status.schema === 'footballscience-medical-database-v1' && ['database','legacy'].includes(status.mode) && status.enabled === (status.mode === 'database'), 'Unexpected Medical capability');
    await identity();
    return { origin, buildId: expectedBuild, backendHost: new URL(backend).hostname, mode: status.mode, enabled: status.enabled };
  } finally {
    if (token) {
      const response = await send(backend + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: publicKey, Authorization: 'Bearer ' + token } }, false);
      requireProof(response.status === 204, 'QA session revocation unconfirmed');
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await verifyMedicalProductionMode({ expectedBuild: process.env.MEDICAL_EXPECTED_PRODUCTION_BUILD }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
