import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import permissions from '../src/core/permission-matrix.cjs';
import transport from '../api/_lib/session-state-transport.js';

const backend = 'https://pokrksgempkuraueglpu.supabase.co';
const keys = ['football-medical-team-v1', 'football-session-planner-v3'];
const modules = ['medical-team', 'session-planner'];
class ProbeError extends Error {}
function check(ok, code) { if (!ok) throw new ProbeError(code); }
function claims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); }
  catch { throw new ProbeError('Invalid QA token'); }
}

// Read-only acceptance prerequisites. This does not certify writes, UI visibility,
// concurrent editing, or offline recovery, and never prints saved content.
export async function verifySaveReadiness({ env = process.env, fetchImpl = fetch } = {}) {
  const base = new URL(env.STAGING_QA_BASE_URL);
  check(base.protocol === 'https:' && !base.username && !base.password && !base.port
    && base.pathname === '/' && !base.search && !base.hash
    && base.hostname === 'staging.footballscience.xyz', 'Invalid staging origin');
  check(env.STAGING_SUPABASE_PROJECT_REF === 'pokrksgempkuraueglpu', 'Invalid staging project');
  check(/^(?:[a-f0-9]{40}|dpl_[A-Za-z0-9]{16,64})$/.test(env.SAVE_QA_EXPECTED_BUILD || ''), 'Exact staging build required');
  check(env.STAGING_QA_USERNAME && env.STAGING_QA_PASSWORD, 'Missing staging account');
  const sessions = [];
  async function request(url, options = {}) {
    const label = url.includes('/api/app-state?') ? 'central-read' : url.includes('/auth/v1/user') ? 'auth-user'
      : url.includes('/auth/v1/logout?') ? 'logout' : options.method === 'POST' ? 'login' : 'client-config';
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
      check(response.ok, `${label}: HTTP ${response.status}`);
      return response.status === 204 ? null : await response.json();
    } catch (error) { if (error instanceof ProbeError) throw error; throw new ProbeError(`${label}: request failed; content suppressed`); }
  }
  const configUrl = new URL('/api/client-config', base).href;
  const verifyConfig = async () => {
    const config = await request(configUrl);
    check(config.ok === true && new URL(config.url).href === backend + '/', 'Staging backend mismatch');
    check(config.buildId === env.SAVE_QA_EXPECTED_BUILD, 'Staging build changed');
    check(typeof config.anonKey === 'string' && config.anonKey.length > 0, 'Missing public key');
    if (!config.anonKey.startsWith('sb_publishable_')) {
      const key = claims(config.anonKey);
      check(key.role === 'anon' && key.ref === 'pokrksgempkuraueglpu', 'Non-public API key');
    }
    return config;
  };
  const config = await verifyConfig(); // Fail before sending any credentials.
  async function login(username, password) {
    const result = await request(configUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: username, password }) });
    const token = result.session?.access_token;
    check(typeof token === 'string' && token.length > 0, 'Missing QA token');
    sessions.push(token);
    const tokenClaims = claims(token);
    check(tokenClaims.iss === backend + '/auth/v1' && tokenClaims.role === 'authenticated', 'Wrong QA issuer');
    const user = await request(backend + '/auth/v1/user', { headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } });
    check(user.id === tokenClaims.sub, 'QA identity mismatch');
    return { token, user };
  }
  async function read(account, fresh) {
    const url = new URL('/api/app-state', base);
    url.searchParams.set('keys', keys.join(','));
    url.searchParams.set('sessionTransport', 'gzip-base64-v1');
    if (fresh) url.searchParams.set('fresh', '1');
    const result = await request(url.href, { headers: { Authorization: `Bearer ${account.token}` } });
    check(result.ok === true && result.entries && result.metadata, 'Invalid central response');
    const rows = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], value = result.entries[key], meta = result.metadata[key];
      if (value === undefined) {
        rows.push({ module: modules[i], present: false, confirmedAbsent: result.absentKeys?.includes(key) === true });
        continue;
      }
      const decoded = await transport.decodeSessionStateValue(key, value);
      let state;
      try { state = JSON.parse(decoded); } catch { throw new ProbeError('Invalid stored JSON'); }
      check(state && typeof state === 'object' && !Array.isArray(state), 'Invalid stored object');
      check(Number.isInteger(meta?.revision) && meta.revision >= 0, 'Missing central revision');
      rows.push({ module: modules[i], present: true, revision: meta.revision,
        sourceOfTruth: ['server', 'database', 'storage'].includes(meta.sourceOfTruth) ? meta.sourceOfTruth : 'other',
        digest: createHash('sha256').update(decoded).digest('hex') });
    }
    return rows;
  }
  try {
    const first = await login(env.STAGING_QA_USERNAME, env.STAGING_QA_PASSWORD);
    const peerConfigured = Boolean(env.STAGING_QA_PEER_USERNAME && env.STAGING_QA_PEER_PASSWORD);
    const second = await login(peerConfigured ? env.STAGING_QA_PEER_USERNAME : env.STAGING_QA_USERNAME,
      peerConfigured ? env.STAGING_QA_PEER_PASSWORD : env.STAGING_QA_PASSWORD);
    const a = await read(first, false), b = await read(second, true);
    const sameIdentity = first.user.id === second.user.id;
    const role = first.user.app_metadata?.role;
    const output = { build: config.buildId, distinctUsers: !sameIdentity, peerConfigured,
      primaryRole: permissions.platformRoles.includes(role) ? role : 'unknown',
      writesTested: false, browserTested: false, offlineTested: false,
      modules: a.map((row, i) => ({ module: row.module, present: row.present,
        secondPresent: b[i].present, revision: row.revision,
        sameRevision: row.revision !== undefined && row.revision === b[i].revision,
        sameContent: row.digest !== undefined && row.digest === b[i].digest,
        primaryPolicyAllowsWrite: permissions.hasModulePermission({ role }, row.module, 'write'),
        sourceOfTruth: row.sourceOfTruth })) };
    if (sameIdentity) for (let i = 0; i < a.length; i++) {
      if (a[i].present && b[i].present && a[i].revision === b[i].revision)
        check(a[i].digest === b[i].digest, 'Same user and revision returned different content');
    }
    await verifyConfig();
    return output;
  } finally {
    const cleanups = await Promise.allSettled(sessions.map(token => request(backend + '/auth/v1/logout?scope=local',
      { method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } })));
    check(cleanups.every(result => result.status === 'fulfilled'), 'QA session cleanup failed');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifySaveReadiness().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error instanceof ProbeError ? error.message : 'Save acceptance readiness failed; content suppressed.');
    process.exitCode = 1;
  });
}
