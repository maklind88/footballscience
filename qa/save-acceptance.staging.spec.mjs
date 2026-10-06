import { test, expect } from '@playwright/test';
import { createStagingAcceptance, medicalKey, sessionsKey, requireProof, digest } from './helpers/save-acceptance-staging.mjs';

test('two authenticated users preserve Medical versions and Sessions offline work', async ({ browser }) => {
  const qa = await createStagingAcceptance();
  const contexts = [], recordId = qa.run + '-record', playerId = qa.run + '-player';
  let medicalCreated = false, sessionCreated = false, day = '';
  const others = (state, key) => key === medicalKey ? Object.fromEntries(['players', 'records', 'injuryPlans'].map(field =>
    [field, (state[field] || []).filter(row => !String(row.id || '').startsWith(qa.run + '-')).sort((a, b) => String(a.id).localeCompare(String(b.id)))]))
    : Object.fromEntries(Object.entries(state.sessions || {}).filter(([date]) => date !== day));
  let originalMedical, originalSessions;
  try {
    originalMedical = await qa.read(qa.primary, medicalKey);
    originalSessions = await qa.read(qa.primary, sessionsKey);
    day = Array.from({ length: 4 }, (_, index) => new Date(Date.now() + index * 86400000).toISOString().slice(0, 10))
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
    const archived = structuredClone(accepted.state);
    Object.assign(archived.records.find(row => row.id === recordId), { archivedAt: new Date().toISOString() });
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
    const open = async account => {
      const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
      // No clinical screenshots/traces and no incidental writes to other modules.
      await context.route('**/api/app-state**', async route => {
        if (route.request().method() === 'GET') return route.continue();
        let body, change;
        try { body = route.request().postDataJSON(); change = typeof body.sessionChange === 'string' ? JSON.parse(body.sessionChange) : body.sessionChange; } catch {}
        if (body?.key === sessionsKey && change?.date === day && change.after?.session?.title === qa.run) return route.continue();
        return route.abort('blockedbyclient');
      });
      const page = await context.newPage();
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
      await page.locator(`[data-session-date="${day}"]`).click();
      await expect(page.locator('[data-session-field="title"]').first()).toHaveValue('Synthetic baseline');
      return { page, context };
    };
    const a = await open(qa.primary), b = await open(qa.peer);
    const field = (client, name) => client.page.locator(`[data-session-field="${name}"]`).first();
    const changeField = async (client, name, value) => { await field(client, name).fill(value); await field(client, name).dispatchEvent('change'); await field(client, name).blur(); };
    await a.context.setOffline(true);
    await changeField(a, 'title', 'Offline coach A');
    await expect(a.page.locator('[data-platform-autosave-status]')).not.toHaveClass(/is-saved/);
    await changeField(b, 'objective', 'Online coach B');
    await expect.poll(async () => (await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0].objective).toBe('Online coach B');
    await a.context.setOffline(false);
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => {
      const row = (await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0];
      return row.title === 'Offline coach A' && row.objective === 'Online coach B';
    }, { timeout: 45000, intervals: [1000, 2000, 5000] }).toBe(true);
    await expect(a.page.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
    await b.page.reload({ waitUntil: 'domcontentloaded' });
    await b.page.waitForFunction(() => window.__footballScienceAppReady);
    await b.page.evaluate(() => window.dispatchEvent(new CustomEvent('platform:open-workspace', { detail: { workspaceId: 'session-planner' } })));
    await b.page.locator(`[data-session-date="${day}"]`).click();
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
    await expect.poll(() => a.page.evaluate(() => window.footballScienceCentralState.getSessionSaveReviews().length), { timeout: 45000 }).toBe(1);
    requireProof((await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0].title === 'Accepted central B', 'Conflict silently overwrote accepted work');
    await a.page.getByRole('button', { name: 'Review local saves', exact: true }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Review local saves' });
    await expect(dialog.getByRole('status')).toHaveText('1 local version to review');
    a.page.once('dialog', prompt => prompt.accept());
    await dialog.getByRole('button', { name: 'Keep central version', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('No unresolved local versions.');
    requireProof((await qa.read(qa.primary, sessionsKey)).state.sessions[day].blocks[0].title === 'Accepted central B', 'Review changed central work unexpectedly');
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
