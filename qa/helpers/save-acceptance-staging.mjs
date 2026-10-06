import { randomUUID, randomBytes, createHash } from 'node:crypto';
import transport from '../../api/_lib/session-state-transport.js';
import { createSessionDateChanges } from '../../src/modules/session-planner/session-save-protocol.mjs';
export const medicalKey = 'football-medical-team-v1', sessionsKey = 'football-session-planner-v3';
const origin = 'https://staging.footballscience.xyz', backend = 'https://pokrksgempkuraueglpu.supabase.co';
export function requireProof(ok, label) { if (!ok) throw new Error(label); }
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertOwnedMedicalChange(before, after, run) {
  const excludeOwned = state => ({ ...state, ...Object.fromEntries(['players', 'records', 'injuryPlans'].map(key =>
    [key, (state[key] || []).filter(row => !String(row.id || '').startsWith(run + '-'))])) });
  requireProof(digest(excludeOwned(before)) === digest(excludeOwned(after)), 'Refusing change to existing Medical content');
}
export function assertOwnedSessionChange(change, run) {
  requireProof(change.after.session.title === run && (!change.before.session || change.before.session.title === run), 'Refusing change to existing Session date');
  requireProof(change.after.session.blocks.every(block => block.id.startsWith(run + '-')), 'Unexpected Session block owner');
}


export async function createStagingAcceptance(env = process.env) {
  requireProof(env.STAGING_QA_BASE_URL?.replace(/\/$/, '') === origin, 'Exact staging origin required');
  requireProof(env.STAGING_SUPABASE_PROJECT_REF === 'pokrksgempkuraueglpu', 'Exact staging backend required');
  requireProof(env.SAVE_QA_ALLOW_FIXTURES === '1', 'Synthetic staging fixtures must be explicitly enabled');
  requireProof(/^(?:[a-f0-9]{40}|dpl_[A-Za-z0-9]{16,64})$/.test(env.SAVE_QA_EXPECTED_BUILD || ''), 'Exact build required');
  requireProof(env.STAGING_QA_USERNAME && env.STAGING_QA_PASSWORD, 'Staging credentials required');
  const run = 'qa-save-' + randomUUID(), tokens = [], accounts = [];
  let peerId = '', peerEmail = '';
  async function request(path, { token, method = 'GET', data, statuses = [200] } = {}) {
    const url = new URL(path, origin);
    requireProof(url.origin === origin && ['/api/client-config', '/api/app-state', '/api/admin-users'].includes(url.pathname), 'Non-allowlisted staging endpoint');
    let response, payload;
    try {
      response = await fetch(url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(45000) });
      payload = await response.json();
    } catch { throw new Error(`Staging ${url.pathname} transport failed; content suppressed`); }
    requireProof(statuses.includes(response.status), `Staging ${url.pathname}: HTTP ${response.status}`);
    return { status: response.status, payload };
  }
  async function identity() {
    const { payload } = await request('/api/client-config');
    requireProof(payload.ok && new URL(payload.url).href === backend + '/', 'Staging isolation mismatch');
    requireProof(payload.buildId === env.SAVE_QA_EXPECTED_BUILD, 'Staging version changed');
    requireProof(typeof payload.anonKey === 'string' && payload.anonKey.length > 0, 'Public key required');
    if (!payload.anonKey.startsWith('sb_publishable_')) {
      let claims;
      try { claims = JSON.parse(Buffer.from(payload.anonKey.split('.')[1], 'base64url')); } catch {}
      requireProof(claims?.role === 'anon' && claims?.ref === 'pokrksgempkuraueglpu', 'Public staging key required');
    }
    return payload;
  }
  const config = await identity();
  async function login(email, password) {
    const { payload } = await request('/api/client-config', { method: 'POST', data: { email, password } });
    const session = payload.session;
    requireProof(session?.access_token && session?.refresh_token && session?.user?.id, 'Incomplete staging session');
    tokens.push(session.access_token);
    const verified = await fetch(backend + '/auth/v1/user', { headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    requireProof(verified.ok, 'Staging Auth identity check failed');
    const user = await verified.json();
    requireProof(user.id === session.user.id, 'Staging identity mismatch');
    const account = { token: session.access_token, session, user };
    accounts.push(account); return account;
  }
  let primary;
  async function closeAccounts() {
    let cleanupOk = true;
    for (const token of tokens) {
      try {
        const response = await fetch(backend + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
        cleanupOk &&= response.status === 204;
      } catch { cleanupOk = false; }
    }
    // The primary session must remain active for deletion, so deletion occurs
    // before primary logout in finish(), not in this generic session cleanup.
    requireProof(cleanupOk, 'Staging QA session revocation failed');
  }
  async function finish() {
    try {
      if (!peerId && peerEmail && primary) {
        const inventory = await request('/api/admin-users', { token: primary.token });
        const own = (inventory.payload.users || []).filter(user => user.email === peerEmail && user.username === run);
        requireProof(own.length <= 1, 'Ambiguous temporary peer; preserved');
        if (own[0]) {
          requireProof(own[0].id !== primary.user.id && own[0].role === 'team-admin', 'Unexpected peer ownership; preserved');
          peerId = own[0].id;
        }
      }
      if (peerId) {
        // Block the created peer before deletion; no existing account is updated.
        await request('/api/admin-users?userId=' + encodeURIComponent(peerId), { token: primary.token, method: 'PUT', data: { status: 'paused' } });
        const peer = accounts.find(a => a.user.id === peerId);
        if (peer) {
          const revoked = await fetch(backend + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${peer.token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
          requireProof(revoked.status === 204, 'Peer session revocation failed');
          tokens.splice(tokens.indexOf(peer.token), 1);
        }
        await request('/api/admin-users?userId=' + encodeURIComponent(peerId), { token: primary.token, method: 'DELETE' });
        peerId = '';
      }
    } finally { await closeAccounts(); }
  }
  try {
    primary = await login(env.STAGING_QA_USERNAME, env.STAGING_QA_PASSWORD);
    requireProof(primary.user.app_metadata?.role === 'admin', 'Staging admin required for temporary peer');
    const metadata = primary.user.user_metadata || {};
    const password = randomBytes(24).toString('base64url') + '!7a';
    const email = run + '@footballscience.qa'; peerEmail = email;
    const created = await request('/api/admin-users', { token: primary.token, method: 'POST', statuses: [201], data: {
      email, password, username: run, firstName: 'Synthetic', lastName: 'Save QA', role: 'team-admin', status: 'active',
      clubId: metadata.clubId, clubName: metadata.clubName, teamId: metadata.teamId, teamName: metadata.teamName, team: metadata.team,
    } });
    requireProof(created.payload.ok && created.payload.user?.id && created.payload.user.id !== primary.user.id, 'Temporary peer creation failed');
    peerId = created.payload.user.id;
    const peer = await login(email, password);
    requireProof(peer.user.id === peerId && peer.user.app_metadata?.role === 'team-admin', 'Distinct peer identity/role required');
    const read = async (account, key) => {
      requireProof([medicalKey, sessionsKey].includes(key), 'Unexpected module');
      const { payload } = await request('/api/app-state?fresh=1&sessionTransport=gzip-base64-v1&keys=' + encodeURIComponent(key), { token: account.token });
      requireProof(payload.ok && payload.entries && payload.metadata, 'Central read failed');
      if (!Object.hasOwn(payload.entries, key)) {
        requireProof(payload.absentKeys?.includes(key), 'Missing module is not confirmed absent');
        return { state: {}, revision: payload.metadata[key]?.revision || 0 };
      }
      let state;
      try { state = JSON.parse(await transport.decodeSessionStateValue(key, payload.entries[key])); } catch { throw new Error('Invalid central state'); }
      requireProof(state && typeof state === 'object' && !Array.isArray(state), 'Invalid central object');
      requireProof(Number.isInteger(payload.metadata[key]?.revision), 'Missing central revision');
      return { state, revision: payload.metadata[key].revision };
    };
    const saveMedical = async (account, before, state) => {
      assertOwnedMedicalChange(before.state, state, run);
      return request('/api/app-state', { token: account.token, method: 'POST',
        data: { key: medicalKey, value: JSON.stringify(state), baseRevision: before.revision } });
    };
    const sessionChange = (before, state) => {
      const changes = createSessionDateChanges(before.state, state);
      requireProof(changes.length === 1, 'Only one run-owned date may change');
      assertOwnedSessionChange(changes[0], run);
      return changes[0];
    };
    const sendSession = async (account, before, change, statuses = [200]) => request('/api/app-state', { token: account.token, method: 'POST', statuses,
      data: { key: sessionsKey, baseRevision: before.revision, sessionChange: JSON.stringify(change) } });
    return { origin, run, primary, peer, read, saveMedical, sessionChange, sendSession, identity, finish };
  } catch (error) { await finish(); throw error; }
}
