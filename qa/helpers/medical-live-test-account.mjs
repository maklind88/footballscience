import { randomUUID, randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { saveAcceptanceAssets } from './save-acceptance-frontend.mjs';
import { requireProof } from './save-acceptance-staging.mjs';
import transport from '../../api/_lib/session-state-transport.js';

export const liveOrigin = 'https://footballscience.xyz';
const backend = 'https://bustidorxevacosqhkcz.supabase.co';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertLiveMedicalIntent(env) {
  requireProof(env.MEDICAL_LIVE_TEST_INTENT === 'synthetic-medical-only', 'Explicit synthetic Medical live intent required');
  requireProof(env.LIVE_QA_BASE_URL === liveOrigin, 'Exact production origin required');
  requireProof(/^[a-f0-9]{40}$/.test(env.MEDICAL_LIVE_EXPECTED_BUILD || ''), 'Exact reviewed production SHA required');
  requireProof(env.LIVE_QA_USERNAME && env.LIVE_QA_PASSWORD, 'Live QA credentials required');
}

// Independent production opt-in. The staging helper still rejects production.
// No bulk state writer, service-role credential, or existing-account edit is exposed.
export async function createLiveMedicalTestAccount(env = process.env) {
  assertLiveMedicalIntent(env);
  for (const path of saveAcceptanceAssets) {
    const response = await fetch(liveOrigin + '/' + path, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    requireProof(response.ok && hash(Buffer.from(await response.arrayBuffer())) === hash(readFileSync(new URL('../../' + path, import.meta.url))), 'Live source mismatch: ' + path);
  }
  const request = async (path, { token, method = 'GET', data, status = 200 } = {}) => {
    const url = new URL(path, liveOrigin);
    requireProof(url.origin === liveOrigin && ['/api/client-config', '/api/admin-users', '/api/app-state'].includes(url.pathname), 'Unexpected test endpoint');
    requireProof(url.pathname !== '/api/app-state' || method === 'GET', 'Live aggregate writes are forbidden');
    let response, payload;
    try {
      response = await fetch(url, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
      payload = await response.json();
    } catch { throw new Error('Live QA transport failed; private details suppressed'); }
    requireProof(response.status === status && payload.ok, 'Live QA ' + url.pathname + ' HTTP ' + response.status);
    return payload;
  };
  const identity = async () => {
    const config = await request('/api/client-config');
    requireProof(config.url === backend && config.buildId === env.MEDICAL_LIVE_EXPECTED_BUILD, 'Live backend/build mismatch');
    requireProof(typeof config.anonKey === 'string' && config.anonKey.length > 0, 'Missing public auth key');
    if (!config.anonKey.startsWith('sb_publishable_')) {
      let claims;
      try { claims = JSON.parse(Buffer.from(config.anonKey.split('.')[1], 'base64url')); } catch {}
      requireProof(claims?.role === 'anon' && claims?.ref === 'bustidorxevacosqhkcz', 'Production public key required');
    }
    return config;
  };
  const config = await identity(), run = 'qa-save-' + randomUUID();
  const email = run + '@footballscience.qa', tokens = [];
  let admin, medical, createdId = '', creationAttempted = false;
  const login = async (email, password) => {
    const payload = await request('/api/client-config', { method: 'POST', data: { email, password } });
    const session = payload.session;
    requireProof(session?.access_token && session?.refresh_token && session?.user?.id, 'Incomplete Auth session');
    tokens.push(session.access_token);
    const response = await fetch(backend + '/auth/v1/user', { headers: { apikey: config.anonKey, Authorization: 'Bearer ' + session.access_token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    requireProof(response.ok, 'Auth identity verification failed');
    const user = await response.json();
    requireProof(user.id === session.user.id, 'Auth identity mismatch');
    return { token: session.access_token, session, user };
  };
  const revoke = async token => {
    const response = await fetch(backend + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: config.anonKey, Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    requireProof(response.status === 204, 'Test session revocation failed');
    tokens.splice(tokens.indexOf(token), 1);
  };
  const finish = async () => {
    try {
      if (admin && creationAttempted) {
        const inventory = await request('/api/admin-users', { token: admin.token });
        const matches = (inventory.users || []).filter(u => u.email === email && u.username === run);
        requireProof(matches.length <= 1, 'Ambiguous test account; preserved');
        const own = matches[0];
        if (own) {
          requireProof(own.id !== admin.user.id && own.role === 'medical' && (!createdId || own.id === createdId), 'Changed test account; preserved');
          await request('/api/admin-users?userId=' + encodeURIComponent(own.id), { token: admin.token, method: 'PUT', data: { status: 'paused' } });
          if (medical) await revoke(medical.token);
          await request('/api/admin-users?userId=' + encodeURIComponent(own.id), { token: admin.token, method: 'DELETE' });
          const after = await request('/api/admin-users', { token: admin.token });
          requireProof(!(after.users || []).some(u => u.id === own.id), 'Test account deletion not confirmed');
        }
      }
    } finally {
      for (const token of [...tokens]) await revoke(token);
    }
  };
  try {
    admin = await login(env.LIVE_QA_USERNAME, env.LIVE_QA_PASSWORD);
    requireProof(admin.user.app_metadata?.role === 'admin', 'Admin setup identity required');
    const metadata = admin.user.user_metadata || {}, password = randomBytes(24).toString('base64url') + '!7a';
    requireProof(metadata.teamId && metadata.clubId, 'Explicit admin team and club are required');
    await identity();
    creationAttempted = true;
    const result = await request('/api/admin-users', { token: admin.token, method: 'POST', status: 201, data: {
      email, password, username: run, firstName: 'Synthetic', lastName: 'Medical verification', role: 'medical', status: 'active',
      clubId: metadata.clubId, clubName: metadata.clubName, teamId: metadata.teamId, teamName: metadata.teamName, team: metadata.team,
    } });
    createdId = result.user?.id;
    requireProof(createdId && createdId !== admin.user.id, 'Temporary identity creation failed');
    medical = await login(email, password);
    requireProof(medical.user.id === createdId && medical.user.app_metadata?.role === 'medical'
      && medical.user.app_metadata?.status === 'active', 'Real active medical Auth role required');
    const read = async (account, key) => {
      requireProof(['football-medical-team-v1', 'football-schedule-v1', 'football-session-planner-v3'].includes(key), 'Unexpected read module');
      const payload = await request('/api/app-state?fresh=1&sessionTransport=gzip-base64-v1&keys=' + encodeURIComponent(key), { token: account.token });
      requireProof(Object.hasOwn(payload.entries || {}, key) && Number.isInteger(payload.metadata?.[key]?.revision), 'Missing authoritative module');
      let state;
      try { state = JSON.parse(await transport.decodeSessionStateValue(key, payload.entries[key])); } catch { throw new Error('Unreadable authoritative module'); }
      return { state, revision: payload.metadata[key].revision };
    };
    return { origin: liveOrigin, run, primary: medical, peer: admin, identity, read, finish };
  } catch (error) { await finish(); throw error; }
}
