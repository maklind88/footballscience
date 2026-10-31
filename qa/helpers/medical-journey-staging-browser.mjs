import { createMedicalReconnectGuard } from './medical-reconnect-guard.mjs';
import sessionTransport from '../../api/_lib/session-state-transport.js';
import { expect } from '@playwright/test';
import { addMedicalAcceptanceRoster } from './medical-acceptance-roster-fixture.mjs';
import { medicalKey, sessionsKey, requireProof } from './save-acceptance-staging.mjs';

function prerequisiteProof(ok, label) {
  if (!ok) throw Object.assign(new Error(label), { journeyGuard: true });
}

export async function verifyJourneyCapability(qa, fetchImpl = fetch) {
  await qa.identity();
  let response, payload;
  try {
    response = await fetchImpl(qa.origin + '/api/medical', { headers: { Authorization: 'Bearer ' + qa.primary.token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    payload = await response.json();
  } catch { throw new Error('Medical capability transport failed; private details suppressed'); }
  const flags = { status: response.status, enabled: payload.enabled === true, canWrite: payload.canWrite === true, databaseMode: payload.mode === 'database' };
  requireProof(response.ok && payload.ok === true && flags.enabled && flags.canWrite && flags.databaseMode,
    'Medical canonical prerequisites unavailable: ' + JSON.stringify(flags));
  return flags;
}

export function selectJourneyDay(sessions, schedule, now = Date.now()) {
  prerequisiteProof(!schedule.events || Array.isArray(schedule.events), 'Invalid Schedule prerequisite');
  prerequisiteProof(!sessions.sessions || (typeof sessions.sessions === 'object' && !Array.isArray(sessions.sessions)), 'Invalid Sessions prerequisite');
  const occupied = new Set((schedule.events || []).map(event => event.date));
  const day = Array.from({ length: 90 }, (_, index) => new Date(now + (index + 1) * 86400000).toISOString().slice(0, 10))
    .find(date => !sessions.sessions?.[date] && !occupied.has(date));
  prerequisiteProof(day, 'No unused Sessions and Schedule date within 90 days; no recommendation written');
  return day;
}

// Only prerequisites are synthetic browser reads. Medical responses and canonical
// receipts are never invented. This does NOT certify Squad/Schedule persistence.
export async function addJourneyPrerequisites(payload, { run, day, player }, requestUrl = "/api/app-state?sessionTransport=gzip-base64-v1") {
  let next = addMedicalAcceptanceRoster(payload, { run, player });
  for (const key of ['football-schedule-v1', sessionsKey]) {
    if (!Object.hasOwn(next.entries || {}, key) && !next.absentKeys?.includes(key)) continue;
    let state; try { state = JSON.parse(await sessionTransport.decodeSessionStateValue(key, next.entries?.[key]) || '{}'); } catch { prerequisiteProof(false, 'Unreadable journey prerequisite'); }
    prerequisiteProof(state && typeof state === 'object' && !Array.isArray(state), 'Invalid journey prerequisite');
    if (key === sessionsKey) {
      prerequisiteProof(!state.sessions?.[day], 'Journey date already has a session; preserved');
      state = { ...state, sessions: { ...state.sessions, [day]: { date: day, title: run, blocks: [] } } };
    } else {
      prerequisiteProof(!(state.events || []).some(event => event.date === day), 'Journey date already has an activity; preserved');
      state = { ...state, events: [...(state.events || []), { id: run + '-training', date: day, type: 'training', title: 'Synthetic journey training' }] };
    }
    next = { ...next, entries: { ...next.entries, [key]: await sessionTransport.encodeSessionStateValue({ url: requestUrl }, key, JSON.stringify(state)) },
      metadata: { ...next.metadata, [key]: next.metadata?.[key] || { revision: 0 } },
      absentKeys: (next.absentKeys || []).filter(k => k !== key) };
  }
  return next;
}

export function createJourneyRequestHandler({ qa, fixture, guard, mode, ledger, writable = false }) {
  const errors = [];
  const actor = writable ? 'author' : 'peer';
  const reconnect = writable && mode === 'peer-archived' ? createMedicalReconnectGuard() : null;
  let lost = false;
  const handler = async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== qa.origin) return route.abort('blockedbyclient');
    let phase = 'request';
    try {
      if (request.method() === 'GET') {
        if (url.pathname !== '/api/app-state') return route.continue();
        if (reconnect?.blocksReads()) return route.abort('internetdisconnected');
        phase = 'read-fetch';
        const response = await route.fetch({ maxRedirects: 0, timeout: 30000 });
        if (!response.ok()) return route.fulfill({ response });
        phase = 'read-json';
        const payload = await response.json();
        if (payload.entries?.[medicalKey]) {
          const state = JSON.parse(payload.entries[medicalKey]);
          ledger.push({ stage: 'read', actor, revision: payload.metadata?.[medicalKey]?.revision,
            ownIds: (state.records || []).filter(row => row.playerId === fixture.player.id && !row.archivedAt).map(row => row.id),
            archivedOwnIds: (state.records || []).filter(row => row.playerId === fixture.player.id && row.archivedAt).map(row => row.id) });
        }
        phase = 'prerequisites';
        const next = await addJourneyPrerequisites(payload, fixture, request.url());
        phase = 'read-delivery';
        if (reconnect?.blocksReads()) return route.abort('internetdisconnected');
        return await route.fulfill({ response, json: next });
      }
      // Incidental mutations and peer browser writes are blocked. Initial writes
      // require the armed ownership guard; reconnect permits one exact sealed replay.
      if (!writable || request.method() !== 'POST' || !['/api/medical', '/api/app-state'].includes(url.pathname)) return route.abort('blockedbyclient');
      let body; try { body = request.postDataJSON(); } catch { return route.abort('blockedbyclient'); }
      if (url.pathname === '/api/app-state' && body?.key !== medicalKey) return route.abort('blockedbyclient');
      if (reconnect?.isReplaying()) {
        if (url.pathname !== '/api/medical') return route.abort('blockedbyclient');
        phase = 'replay-identity'; await qa.identity();
        const current = await qa.read(qa.primary, medicalKey);
        phase = 'replay-guard'; const id = reconnect.event(body, current.state);
        ledger.push({ stage: 'archived-replay-request', actor, id });
        phase = 'replay-fetch'; const response = await route.fetch({ maxRedirects: 0, timeout: 30000 });
        const payload = await response.json();
        phase = 'replay-response'; reconnect.response(response.status(), payload);
        ledger.push({ stage: 'archived-replay-conflict', actor, id, status: response.status(), eventId: payload.eventId });
        return route.fulfill({ response });
      }
      if (!guard.isArmed()) return route.abort('blockedbyclient');
      phase = 'write-identity';
      await qa.identity();
      phase = 'write-current';
      const current = await qa.read(qa.primary, medicalKey);
      if (!guard.isArmed()) return route.abort('blockedbyclient');
      const canonical = url.pathname === '/api/medical';
      phase = 'write-guard';
      const id = canonical ? guard.event(body, current.state) : guard.generic(body, current.state);
      const path = canonical ? 'canonical' : 'generic';
      ledger.push({ stage: path + '-request', actor, id, ...(canonical ? { idempotencyKey: body.idempotencyKey } : {}) });
      if ((canonical && mode === 'canonical-failed') || (!canonical && ['generic-failed', 'peer-archived'].includes(mode))) {
        ledger.push({ stage: path + '-injected-failure', actor, id });
        return route.fulfill({ status: 503, json: { ok: false, stored: false } });
      }
      phase = 'write-fetch';
      const response = await route.fetch({ maxRedirects: 0, timeout: 30000 });
      phase = 'write-json';
      const payload = await response.json();
      const accepted = response.ok() && payload.ok === true && (!canonical || (payload.canonicalStored === true && payload.stored === true));
      ledger.push({ stage: path + '-server-response', actor, id, accepted, status: response.status(),
        ...(canonical ? { duplicate: payload.duplicate === true, eventId: payload.eventId || '' } : {}) });
      if (canonical && accepted) reconnect?.remember(body, payload);
      if (canonical && mode === 'lost-response' && !lost && accepted) {
        lost = true;
        ledger.push({ stage: 'accepted-response-dropped', actor, id });
        return route.abort('failed');
      }
      return route.fulfill({ response });
    } catch (error) {
      // Do not attach response bodies, credentials or clinical state to reports.
      errors.push(phase + ': ' + (error?.journeyGuard === true ? error.message : 'request rejected; private details suppressed'));
      await route.abort('blockedbyclient').catch(() => {});
    }
  };
  return { handler, errors, reconnect };
}

export async function openJourneyBrowser({ browser, qa, account, fixture, guard, mode, ledger, contexts, writable = false }) {
  const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
  const { handler, errors, reconnect } = createJourneyRequestHandler({ qa, fixture, guard, mode, ledger, writable });
  await context.route('**/api/**', handler);
  const page = await context.newPage();
  await page.goto(qa.origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.platformAuthStore?.getSupabaseClient?.());
  requireProof(await page.evaluate(async session => !(await window.platformAuthStore.getSupabaseClient().auth.setSession(session)).error,
    { access_token: account.session.access_token, refresh_token: account.session.refresh_token }), 'Journey login failed');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openJourneyMedical(page, fixture);
  return { page, context, errors, reconnect };
}

export async function openJourneyMedical(page, { day, player }) {
  await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden);
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.getByRole('button', { name: 'Medical', exact: true }).click();
  const date = page.getByLabel('Selected medical date', { exact: true });
  await date.fill(day); await date.dispatchEvent('change'); await date.blur();
  await expect(page.getByRole('button', { name: player.name + ' 50% training recommendation', exact: true })).toBeVisible();
}

export async function verifyStagingJourneyViews(page, fixture, recordId) {
  await openJourneyMedical(page, fixture);
  const { day, player } = fixture;
  const button = page.getByRole('button', { name: player.name + ' 50% training recommendation', exact: true });
  if (recordId) await expect(button).toHaveClass(/is-active/);
  else await expect(button).not.toHaveClass(/is-active/);
  requireProof(await page.evaluate(async ({ day, playerId, recordId }) => {
    const m = await import('/src/modules/medical/medical-runtime-accessors.mjs');
    const r = m.getLatestMedicalRecord(playerId, day);
    return recordId ? r?.id === recordId && r?.date === day && r?.participation === 50 : !r;
  }, { day, playerId: player.id, recordId }), 'Medical did not display the accepted recommendation identity');
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  for (let step = 0; step < 12; step++) {
    const target = page.locator(`[data-session-date="${day}"]`);
    if (await target.count()) { await target.click(); break; }
    const dates = await page.locator('[data-session-date]').evaluateAll(nodes => nodes.map(n => n.dataset.sessionDate).sort());
    requireProof(dates.length > 1, 'Session navigation unavailable');
    await page.locator(`[data-session-date="${day < dates[0] ? dates[0] : dates.at(-1)}"]`).click();
  }
  const observed = await page.evaluate(async ({ day, playerId, recordId }) => {
    const sessions = await import('/src/modules/session-planner/session-planner-runtime-accessors.mjs');
    const availability = sessions.getSessionPlannerMedicalAvailability(day);
    const own = availability.all.filter(item => item.player.id === playerId);
    return { matches: own.length === 1 && (recordId ? own[0].record?.id === recordId && own[0].participation === 50 : !own[0].record && own[0].participation === null && availability.unconfirmed.some(item => item.player.id === playerId)),
      bucket: availability.all.filter(item => item.record && item.participation === 50).length,
      selected: document.querySelector('.session-date-pill.is-active')?.dataset.sessionDate === day };
  }, { day, playerId: player.id, recordId });
  requireProof(observed.matches && observed.selected, 'Sessions did not select the accepted recommendation identity/date');
  const panel = page.getByRole('region', { name: 'Medical availability for selected session', exact: true });
  await expect(panel.locator('.is-availability-50 small')).toHaveText(String(observed.bucket));
}
