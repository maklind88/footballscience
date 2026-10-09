import { test, expect } from '@playwright/test';
import { addMedicalAcceptanceRoster } from './helpers/medical-acceptance-roster-fixture.mjs';
import { installMedicalWorkingFailure, verifyMedicalWorkingAcceptance } from './helpers/medical-working-draft-acceptance.mjs';
import { verifySaveAcceptanceFrontend, saveAcceptanceAssets } from './helpers/save-acceptance-frontend.mjs';
import { readFileSync } from 'node:fs';
import transport from '../api/_lib/session-state-transport.js';
import { createStagingAcceptance, medicalKey, sessionsKey, requireProof, digest, assertOwnedSessionChange } from './helpers/save-acceptance-staging.mjs';

test('two authenticated users preserve Medical versions and Sessions offline work', async ({ browser }) => {
  if (process.env.SAVE_QA_CLIENT_CANDIDATE !== "1") {
    const proof = await verifySaveAcceptanceFrontend({ baseUrl: process.env.STAGING_QA_BASE_URL });
    console.log("Reviewed staging frontend verified before fixtures:", proof.verifiedAssets);
  }
  const qa = await createStagingAcceptance();
  console.log('Frontend under test:', process.env.SAVE_QA_CLIENT_CANDIDATE === '1' ? 'candidate client scripts in QA browser; pinned deployed staging backend' : 'deployed staging frontend and backend');
  const contexts = [], recordId = qa.run + '-record', playerId = qa.run + '-player';
  let medicalCreated = false, sessionCreated = false, day = '';
  const others = (state, key) => key === medicalKey ? Object.fromEntries(['players', 'records', 'injuryPlans'].map(field =>
    [field, (state[field] || []).filter(row => !String(row.id || '').startsWith(qa.run + '-')).sort((a, b) => String(a.id).localeCompare(String(b.id)))]))
    : Object.fromEntries(Object.entries(state.sessions || {}).filter(([date]) => date !== day));
  let originalMedical, originalSessions;
  try {
    originalMedical = await qa.read(qa.primary, medicalKey);
    originalSessions = await qa.read(qa.primary, sessionsKey);
    day = Array.from({ length: 30 }, (_, index) => new Date(Date.now() + index * 86400000).toISOString().slice(0, 10))
      .find(date => !originalSessions.state.sessions?.[date]);
    requireProof(Boolean(day), 'No empty nearby staging date; no test fixture written');
    const m = structuredClone(originalMedical.state), now = new Date().toISOString();
    m.players = [...(m.players || []), { id: playerId, name: 'Synthetic Save QA', createdAt: now, updatedAt: now }];
    m.records = [...(m.records || []), { id: recordId, playerId, date: day, participation: 100, comment: 'Synthetic baseline', createdAt: now, updatedAt: now }];
    // Mark before sending so a lost accepted response still triggers scoped cleanup.
    medicalCreated = true;
    await qa.saveMedical(qa.primary, originalMedical, m);
    const stale = await qa.read(qa.peer, medicalKey);
    requireProof(stale.state.records.some(row => row.id === recordId), 'Peer cannot read accepted Medical record');
    const current = await qa.read(qa.primary, medicalKey), newer = structuredClone(current.state);
    const timestamp = new Date(Date.now() + 1000).toISOString();
    Object.assign(newer.records.find(row => row.id === recordId), { comment: 'Accepted central edit', updatedAt: timestamp });
    await qa.saveMedical(qa.primary, current, newer);
    const staleFuture = structuredClone(stale.state);
    Object.assign(staleFuture.records.find(row => row.id === recordId), { comment: 'Stale future activity', date: '2099-12-31' });
    await qa.saveMedical(qa.peer, stale, staleFuture);
    let accepted = await qa.read(qa.peer, medicalKey);
    requireProof(accepted.state.records.find(row => row.id === recordId)?.comment === 'Accepted central edit', 'Future activity replaced newer Medical edit');
    // Medical runtime (explicit candidate overlay only when requested), with
    // browser writes blocked. The second
    // authenticated writer may change only this run's synthetic record via the
    // existing API ownership guard. No clinical screenshots, downloads or traces.
    const medicalContext = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(medicalContext);
    if (process.env.SAVE_QA_CLIENT_CANDIDATE === '1') {
      for (const path of saveAcceptanceAssets) {
        const body = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
        await medicalContext.route(qa.origin + '/' + path + '*', route => route.fulfill({ contentType: 'text/javascript', body }));
      }
    }
    await medicalContext.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 503, json: { ok: false } });
      const url = new URL(route.request().url());
      if (url.origin !== qa.origin || url.pathname !== '/api/app-state') return route.continue();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      // Only the browser sees this run-owned Squad prerequisite. Medical GETs
      // and the authenticated peer write remain server-backed and unchanged.
      const payload = await response.json();
      return route.fulfill({ response, json: addMedicalAcceptanceRoster(payload, { run: qa.run,
        player: { id: playerId, name: 'Synthetic Save QA', rosterType: 'squad', status: 'available' } }) });
    });
    const medicalPage = await medicalContext.newPage(), marker = qa.run + '-unsaved-working';
    const acceptedMarker = qa.run + '-accepted-peer';
    await installMedicalWorkingFailure(medicalPage, marker);
    await medicalPage.goto(qa.origin, { waitUntil: 'domcontentloaded' });
    await medicalPage.waitForFunction(() => window.platformAuthStore?.getSupabaseClient?.());
    requireProof(await medicalPage.evaluate(async session => {
      const { error } = await window.platformAuthStore.getSupabaseClient().auth.setSession(session);
      return !error;
    }, { access_token: qa.primary.session.access_token, refresh_token: qa.primary.session.refresh_token }), 'Medical browser session restoration failed');
    await medicalPage.reload({ waitUntil: 'domcontentloaded' });
    await medicalPage.waitForFunction(() => window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden);
    await medicalPage.evaluate(() => {
      document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click();
      window.dispatchEvent(new CustomEvent('platform:open-workspace', { detail: { workspaceId: 'medical-team' } }));
    });
    await verifyMedicalWorkingAcceptance(medicalPage, { recordId, marker, acceptedMarker, publishPeer: async () => {
      const before = await qa.read(qa.peer, medicalKey), next = structuredClone(before.state);
      Object.assign(next.records.find(row => row.id === recordId), { comment: acceptedMarker, updatedAt: new Date(Date.now() + 2000).toISOString() });
      await qa.saveMedical(qa.peer, before, next);
      requireProof((await qa.read(qa.primary, medicalKey)).state.records.find(row => row.id === recordId)?.comment === acceptedMarker, 'Peer Medical fixture was not accepted');
    } });
    await medicalContext.close();
    contexts.splice(contexts.indexOf(medicalContext), 1);
    accepted = await qa.read(qa.primary, medicalKey);
    requireProof(digest(others(originalMedical.state, medicalKey)) === digest(others(accepted.state, medicalKey)), 'Unrelated Medical content changed during working acceptance');
    console.log('Medical fixture boundary: one run-owned roster row added only to browser reads; no Squad writes or Squad certification.');
    console.log('PASS Medical working runtime: distinct authenticated peer; blocked browser writes; quota and rescue failure; reread preservation; newer accepted peer visible; original unsaved version retained.');
    const archived = structuredClone(accepted.state);
    Object.assign(archived.records.find(row => row.id === recordId), { archivedAt: new Date().toISOString() });
    Object.assign(archived.players.find(row => row.id === playerId), { archivedAt: new Date().toISOString() });
    await qa.saveMedical(qa.primary, accepted, archived);
    await qa.saveMedical(qa.peer, stale, stale.state);
    accepted = await qa.read(qa.primary, medicalKey);
    requireProof(Boolean(accepted.state.records.find(row => row.id === recordId)?.archivedAt), 'Stale Medical client revived archived record');
    requireProof(digest(others(originalMedical.state, medicalKey)) === digest(others(accepted.state, medicalKey)), 'Unrelated Medical content changed');
    console.log('PASS Medical: distinct authenticated writers; future-date ordering; archive protection; unrelated records preserved.');

    const s = structuredClone(originalSessions.state);
    s.sessions = { ...(s.sessions || {}), [day]: { date: day, title: qa.run, selectedBlockId: qa.run + '-block',
      blocks: [{ id: qa.run + '-block', title: 'Synthetic baseline', objective: 'Original objective', minutes: 20 }] } };
    sessionCreated = true;
    await qa.sendSession(qa.primary, originalSessions, qa.sessionChange(originalSessions, s));
    const selectDate = async page => {
      for (let step = 0; step < 8; step++) {
        const target = page.locator(`[data-session-date="${day}"]`);
        if (await target.count()) { await target.click(); return; }
        const dates = await page.locator('[data-session-date]').evaluateAll(nodes => nodes.map(node => node.dataset.sessionDate).sort());
        requireProof(dates.length > 1, 'Session date navigation unavailable');
        const edge = day < dates[0] ? dates[0] : dates.at(-1);
        await page.locator(`[data-session-date="${edge}"]`).click();
      }
      throw new Error('Own Session fixture date is outside reachable navigation');
    };
    const open = async account => {
      const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
      const blockedWrites = new Map(), rejectedOwnWrites = new Map(), candidateFiles = new Set(), sessionStatuses = new Map();
      let allowedOwnWrites = 0;
      if (process.env.SAVE_QA_CLIENT_CANDIDATE === '1') {
        // QA-browser-only candidate overlay; never changes the deployed server/assets.
        for (const path of ['platform-auth-boot.js', 'src/core/data-safety-runtime-service.mjs', 'src/core/central-sync-runtime-service.mjs', 'src/core/central-runtime-facade.mjs',
          'src/core/platform-global-runtime-bindings.mjs',
          'src/modules/session-planner/session-tactical-storage.mjs', 'src/modules/session-planner/session-save-client.mjs', 'src/modules/session-planner/session-planner-recovery-controller.mjs',
          'src/modules/session-planner/session-planner-runtime-state-service.mjs']) {
          const body = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
          await context.route(qa.origin + '/' + path + '*', route => { candidateFiles.add(path); return route.fulfill({ contentType: 'text/javascript', body }); });
        }
      }
      // No clinical screenshots/traces and no incidental writes to other modules.
      await context.route('**/api/app-state**', async route => {
        if (route.request().method() === 'GET') return route.continue();
        let body, change;
        try { body = route.request().postDataJSON(); change = JSON.parse(await transport.decodeSessionStateValue(body.key, body.sessionChange)); } catch {}
        if (body?.key === sessionsKey && change?.date === day) {
          try { assertOwnedSessionChange(change, qa.run); } catch (error) {
            rejectedOwnWrites.set(error.message, (rejectedOwnWrites.get(error.message) || 0) + 1);
            return route.abort('blockedbyclient');
          }
          allowedOwnWrites++;
          return route.continue();
        }
        if (body?.key === sessionsKey) {
          const reason = change?.date ? 'Session change outside own date' : 'Session command missing or undecodable';
          rejectedOwnWrites.set(reason, (rejectedOwnWrites.get(reason) || 0) + 1);
        }
        const key = typeof body?.key === 'string' && /^football-[a-z0-9-]+$/.test(body.key) ? body.key : 'unknown';
        blockedWrites.set(key, (blockedWrites.get(key) || 0) + 1);
        return route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.on('response', response => {
        if (new URL(response.url()).pathname !== '/api/app-state' || response.request().method() !== 'POST') return;
        try {
          if (response.request().postDataJSON()?.key === sessionsKey) sessionStatuses.set(response.status(), (sessionStatuses.get(response.status()) || 0) + 1);
        } catch {}
      });
      await page.goto(qa.origin, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.platformAuthStore?.getSupabaseClient?.());
      const success = await page.evaluate(async session => {
        const { error } = await window.platformAuthStore.getSupabaseClient().auth.setSession(session);
        return !error;
      }, { access_token: account.session.access_token, refresh_token: account.session.refresh_token });
      requireProof(success, 'Browser session restoration failed');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden);
      await page.evaluate(() => {
        document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click();
        window.dispatchEvent(new CustomEvent('platform:open-workspace', { detail: { workspaceId: 'session-planner' } }));
      });
      await selectDate(page);
      try {
        await expect(page.locator('[data-session-field="title"]').first()).toHaveValue('Synthetic baseline');
      } catch (error) {
        console.log('Blocked incidental writes', Object.fromEntries(blockedWrites));
        console.log('Session opening diagnostics', await page.evaluate(async ({ key, day, run }) => {
          const read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
          const saved = read(key), period = read('football-periodization-v2');
          const session = saved.sessions?.[day];
          const status = window.footballScienceCentralState?.getStatus?.();
          const accessors = await import('/src/modules/session-planner/session-planner-runtime-accessors.mjs');
          const permissions = await import('/src/core/platform-runtime-accessors.mjs');
          const overlays = await import('/src/core/overlay-stability.mjs');
          const selected = accessors.getSessionPlannerSelectedSession();
          const parsed = accessors.readSessionPlannerState();
          return { accountRole: window.platformAuthStore?.getCurrentUser?.()?.role || 'unknown',
            activeDate: document.querySelector('.session-date-pill.is-active')?.dataset.sessionDate,
            centralHydrated: status?.hydrated, centralHydrating: status?.hydrating, centralHasError: Boolean(status?.lastError),
            reloadPending: permissions.isCentralizedAppStateReloadPending?.(), reloadDeferred: permissions.shouldDeferCentralizedAppStateReload(),
            visibleOverlays: overlays.platformOverlayStabilityRootSelectors.filter(selector => [...document.querySelectorAll(selector)].some(node => overlays.isPlatformOverlayNodeVisible(node))),
            runtimeOwnBlockCount: (selected?.blocks || []).filter(b => b.id?.startsWith(run + '-')).length,
            parsedOwnBlockCount: (parsed.sessions?.[day]?.blocks || []).filter(b => b.id?.startsWith(run + '-')).length,
            runtimeShouldClear: accessors.shouldClearSessionPlannerSessionForDate(day, session),
            canEdit: permissions.canEditSessionPlanner(),
            ownBlockButtons: document.querySelectorAll('[data-session-block-id^="' + run + '-"]').length,
            datePresent: Boolean(session), ownBlockCount: (session?.blocks || []).filter(b => b.id?.startsWith(run + '-')).length,
            editorCount: document.querySelectorAll('[data-session-field="title"]').length,
            centralRevision: status?.metadata?.[key]?.revision, pendingCount: status?.pendingCount,
            periodOff: ['daySchedule', 'sessionType'].some(k => String(period.days?.[day]?.[k] || '').toUpperCase() === 'OFF'),
            scheduleOff: (read('football-schedule-v1').events || []).some(e => e.date === day && e.type === 'off') };
        }, { key: sessionsKey, day, run: qa.run }));
        throw error;
      }
      return { page, context, async diagnostics() {
        return { blockedWrites: Object.fromEntries(blockedWrites), rejectedOwnWrites: Object.fromEntries(rejectedOwnWrites),
          allowedOwnWrites, sessionStatuses: Object.fromEntries(sessionStatuses), candidateFileCount: candidateFiles.size,
          client: await page.evaluate(async ({ key, day, run }) => {
            const bridge = window.footballScienceCentralState, status = bridge.getStatus();
            const row = JSON.parse(localStorage.getItem(key) || '{}').sessions?.[day];
            const manifest = JSON.parse(localStorage.getItem('football-data-safety-v1') || '{}').entries?.[key];
            return { keyReady: bridge.isKeyHydrated?.(key), scopedReadAvailable: typeof bridge.hydrateSessionState === 'function',
              hydrated: status.hydrated, hydrating: status.hydrating, hasReadError: Boolean(status.lastError), hasWriteError: Boolean(status.lastWriteError),
              revision: status.metadata?.[key]?.revision, pending: manifest?.pendingCentralSync,
              dateTitleOwned: row?.title === run, blockIdsOwned: row?.blocks?.every(block => block.id.startsWith(run + '-')),
              onlineEditPresent: row?.blocks?.[0]?.objective === 'Online coach B',
              journalPending: Boolean(await bridge.getSessionPendingState()), reviews: (await bridge.getSessionSaveReviews()).length };
          }, { key: sessionsKey, day, run: qa.run }) };
      } };
    };
    const a = await open(qa.primary), b = await open(qa.peer);
    const field = (client, name) => client.page.locator(`[data-session-field="${name}"]`).first();
    const changeField = async (client, name, value) => { await field(client, name).fill(value); await field(client, name).dispatchEvent('change'); await field(client, name).blur(); };
    await a.context.setOffline(true);
    await changeField(a, 'title', 'Offline coach A');
    await expect(a.page.locator('[data-platform-autosave-status]')).not.toHaveClass(/is-saved/);
    await changeField(b, 'objective', 'Online coach B');
    try {
    await expect.poll(async () => (await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0].objective).toBe('Online coach B');
    } catch (error) { console.log('Online peer saving diagnostics', await b.diagnostics()); throw error; }
    await a.context.setOffline(false);
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    try {
    await expect.poll(async () => {
      const row = (await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0];
      return row.title === 'Offline coach A' && row.objective === 'Online coach B';
    }, { timeout: 45000, intervals: [1000, 2000, 5000] }).toBe(true);
    } catch (error) { console.log('Reconnect saving diagnostics', await a.diagnostics()); throw error; }
    await expect(a.page.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
    await b.page.reload({ waitUntil: 'domcontentloaded' });
    await b.page.waitForFunction(() => window.__footballScienceAppReady);
    await b.page.evaluate(() => window.dispatchEvent(new CustomEvent('platform:open-workspace', { detail: { workspaceId: 'session-planner' } })));
    await selectDate(b.page);
    await expect(field(b, 'title')).toHaveValue('Offline coach A');
    await expect(field(b, 'objective')).toHaveValue('Online coach B');
    const saved = await qa.read(qa.primary, sessionsKey);
    requireProof(digest(others(originalSessions.state, sessionsKey)) === digest(others(saved.state, sessionsKey)), 'Unrelated Sessions changed');
    console.log('PASS Sessions: two real accounts/browsers; offline draft; independent online edit; reconnect; reload visibility; unrelated dates preserved.');
    await a.context.setOffline(true);
    await changeField(a, 'title', 'Conflicting local A');
    await changeField(b, 'title', 'Accepted central B');
    await expect.poll(async () => (await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0].title === 'Accepted central B').toBe(true);
    await a.context.setOffline(false);
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => a.page.evaluate(async () => (await window.footballScienceCentralState.getSessionSaveReviews()).length), { timeout: 45000 }).toBe(1);
    requireProof((await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0].title === 'Accepted central B', 'Conflict silently overwrote accepted work');
    requireProof(await a.page.evaluate(async () => (await window.footballScienceCentralState.getSessionSaveReviews())[0]?.change?.after?.session?.blocks?.[0]?.title === 'Conflicting local A'), 'Local conflicting draft was not preserved');
    await a.page.getByRole('button', { name: 'Review local saves', exact: true }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Review local saves' });
    await expect(dialog.getByRole('status')).toHaveText('1 local version to review');
    a.page.once('dialog', prompt => prompt.accept());
    await dialog.getByRole('button', { name: 'Keep central version', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('No unresolved local versions.');
    requireProof((await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0].title === 'Accepted central B', 'Review changed central work unexpectedly');
    requireProof(await a.page.evaluate(async () => (await window.footballScienceCentralState.getSessionSaveReviews()).length === 0), 'Resolved review remained pending');
    console.log('PASS Sessions: same-field conflict retains local review; explicit Keep central resolves only the local draft.');
    await qa.identity();
  } finally {
    // Stop every browser writer before scoped fixture cleanup.
    await Promise.all(contexts.map(context => context.close()));
    try {
      await qa.identity();
      if (medicalCreated) {
        const current = await qa.read(qa.primary, medicalKey), next = structuredClone(current.state);
        for (const key of ['players', 'records']) for (const row of next[key] || []) {
          if (String(row.id || '').startsWith(qa.run + '-')) row.archivedAt = new Date().toISOString();
        }
        await qa.saveMedical(qa.primary, current, next);
        const checked = await qa.read(qa.primary, medicalKey);
        requireProof(['players', 'records'].every(key => (checked.state[key] || []).filter(row => String(row.id || '').startsWith(qa.run + '-')).every(row => row.archivedAt)), 'Medical fixture archival failed');
      }
      if (sessionCreated) {
        const current = await qa.read(qa.primary, sessionsKey);
        if (current.state.sessions?.[day]) {
          requireProof(current.state.sessions[day].title === qa.run, 'Session fixture ownership changed; preserved');
          const next = structuredClone(current.state);
          next.blockDeletionTombstones = { ...(next.blockDeletionTombstones || {}), [day]: { ...(next.blockDeletionTombstones?.[day] || {}) } };
          for (const block of next.sessions[day].blocks) {
            requireProof(block.id.startsWith(qa.run + '-'), 'Unexpected Session block; preserved');
            next.blockDeletionTombstones[day][block.id] = new Date().toISOString();
          }
          next.sessions[day].blocks = [];
          await qa.sendSession(qa.primary, current, qa.sessionChange(current, next));
          requireProof((await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks.length === 0, 'Session fixture cleanup failed');
        }
      }
      console.log('Cleanup: own Medical fixtures archived; own Session blocks tombstoned; audit/empty test date retained.');
    } finally { await qa.finish(); }
  }
});
