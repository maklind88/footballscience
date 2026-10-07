import { diagnoseMedicalReadNormalization } from "./lib/medical-read-normalization-diagnostic.mjs";
import { pathToFileURL } from 'node:url';
const origin = 'https://footballscience.xyz', backend = 'https://bustidorxevacosqhkcz.supabase.co';
const medicalKey = 'football-medical-team-v1', squadKey = 'football-player-profiles-v1';
class DiagnosticError extends Error {}
const check = (ok, label) => { if (!ok) throw new DiagnosticError(label); };
const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const archived = row => Boolean(row.archivedAt || row.deletedAt || row.archived === true || row.deleted === true);
const dateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : null;
const timestamp = value => /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value || '') ? value : null;
export function summarizeMedicalVisibility(medical, squad, name, date) {
  const matches = row => [row.name, row.fullName, [row.firstName, row.lastName].filter(Boolean).join(' ')].some(v => normalize(v) === normalize(name));
  const medicalPlayers = (medical.players || []).filter(matches), squadPlayers = (squad.players || []).filter(matches);
  const ids = new Set([...medicalPlayers, ...squadPlayers].map(p => p.id).filter(Boolean));
  const removed = new Set(squad.removedPlayerIds || squad.deletedPlayerIds || squad.removedIds || []);
  const records = (medical.records || []).filter(r => ids.has(r.playerId));
  const onDate = records.filter(r => r.date === date);
  const plans = (medical.injuryPlans || []).filter(r => ids.has(r.playerId) && !archived(r) && r.startDate <= date && r.endDate >= date);
  return { targetDate: date, matchedMedicalPlayers: medicalPlayers.length, matchedSquadPlayers: squadPlayers.length,
    archivedMedicalPlayers: medicalPlayers.filter(archived).length,
    explicitlyRemovedMedicalPlayers: medicalPlayers.filter(p => removed.has(p.id)).length,
    temporaryWindowPresent: medicalPlayers.some(p => p.temporaryFrom || p.temporaryTo),
    distinctMatchedPlayerIds: ids.size, dateRecords: onDate.length,
    activeDateRecords: onDate.filter(r => !archived(r)).length, archivedDateRecords: onDate.filter(archived).length,
    activePlansOnDate: plans.length,
    recentRecordDates: [...new Set(records.map(r => dateOnly(r.date)).filter(Boolean))].sort().slice(-7),
    dateRecordMetadata: onDate.slice(0, 12).map(r => ({ archived: archived(r),
      matchesActiveMedicalPlayer: medicalPlayers.some(p => p.id === r.playerId && !archived(p) && !removed.has(p.id)),
      createdAt: timestamp(r.createdAt), updatedAt: timestamp(r.updatedAt) })),
    // No names, ids, free text, medical values, notes, participation or content hashes.
    normalization: diagnoseMedicalReadNormalization(medical, squad, [...ids], date),
    scope: 'Authenticated QA account only; API observation does not prove real-user UI visibility', dataWrites: 0 };
}
export async function diagnoseMedicalVisibility({ env = process.env, fetchImpl = fetch } = {}) {
  check(env.LIVE_QA_BASE_URL?.replace(/\/$/, '') === origin, 'Canonical production origin required');
  check(env.SUPABASE_PROJECT_REF === 'bustidorxevacosqhkcz', 'Canonical production backend required');
  check(/^(?:[a-f0-9]{40}|dpl_[A-Za-z0-9]{16,64})$/.test(env.DIAGNOSTIC_EXPECTED_BUILD || ''), 'Exact production build required');
  check(normalize(env.DIAGNOSTIC_PLAYER).length >= 3 && dateOnly(env.DIAGNOSTIC_DATE), 'Exact player and date required');
  check(env.LIVE_QA_USERNAME && env.LIVE_QA_PASSWORD, 'Production QA credentials missing');
  async function request(url, options = {}) {
    const parsed = new URL(url);
    const allowed = parsed.origin === origin && ['/api/client-config', '/api/app-state'].includes(parsed.pathname)
      || parsed.origin === backend && ['/auth/v1/user', '/auth/v1/logout'].includes(parsed.pathname);
    check(allowed && (options.method !== 'POST' || parsed.pathname === '/api/client-config' || parsed.pathname === '/auth/v1/logout'), 'Non-read-only diagnostic request blocked');
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
      check(response.ok, `Diagnostic ${parsed.pathname}: HTTP ${response.status}`);
      return response.status === 204 ? null : await response.json();
    } catch (error) { if (error instanceof DiagnosticError) throw error; throw new DiagnosticError('Diagnostic transport failed; details suppressed'); }
  }
  async function identity() {
    const config = await request(origin + '/api/client-config');
    check(config.ok && config.url?.replace(/\/$/, '') === backend, 'Production backend mismatch; credentials withheld');
    check(config.buildId === env.DIAGNOSTIC_EXPECTED_BUILD, 'Production build changed');
    check(typeof config.anonKey === 'string' && config.anonKey.length > 0, 'Public key missing');
    if (!config.anonKey.startsWith('sb_publishable_')) {
      let claims; try { claims = JSON.parse(Buffer.from(config.anonKey.split('.')[1], 'base64url')); } catch {}
      check(claims?.role === 'anon' && claims.ref === env.SUPABASE_PROJECT_REF, 'Public backend key required');
    }
    return config;
  }
  const config = await identity();
  const login = await request(origin + '/api/client-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.LIVE_QA_USERNAME, password: env.LIVE_QA_PASSWORD }) });
  const token = login.session?.access_token;
  check(typeof token === 'string' && token.length > 0, 'QA login failed');
  const headers = { apikey: config.anonKey, Authorization: `Bearer ${token}` };
  try {
    let claims; try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); } catch {}
    check(claims?.iss === backend + '/auth/v1' && claims.role === 'authenticated', 'QA token issuer mismatch');
    const user = await request(backend + '/auth/v1/user', { headers });
    check(user.id === claims.sub, 'QA Auth identity mismatch');
    const read = await request(origin + '/api/app-state?fresh=1&keys=' + encodeURIComponent([medicalKey, squadKey].join(',')), { headers: { Authorization: headers.Authorization } });
    check(read.ok && read.entries && read.metadata, 'Central read failed');
    const states = [medicalKey, squadKey].map(key => {
      if (!Object.hasOwn(read.entries, key)) { check(read.absentKeys?.includes(key), 'Unconfirmed absent module'); return {}; }
      let state; try { state = JSON.parse(read.entries[key]); } catch {}
      check(state && typeof state === 'object' && !Array.isArray(state), 'Invalid module state'); return state;
    });
    const result = { build: config.buildId, medicalRevision: read.metadata[medicalKey]?.revision,
      medicalPresent: Object.hasOwn(read.entries, medicalKey), squadPresent: Object.hasOwn(read.entries, squadKey),
      ...summarizeMedicalVisibility(...states, env.DIAGNOSTIC_PLAYER, env.DIAGNOSTIC_DATE) };
    await identity(); return result;
  } finally { await request(backend + '/auth/v1/logout?scope=local', { method: 'POST', headers }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  diagnoseMedicalVisibility().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error instanceof DiagnosticError ? error.message : 'Medical diagnostic failed; all content suppressed'); process.exitCode = 1;
  });
}
