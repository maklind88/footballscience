import { test, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
import transport from '../api/_lib/session-state-transport.js';
import { applySessionDateChange, sessionDateValue } from '../src/modules/session-planner/session-save-protocol.mjs';

const key = 'football-session-planner-v3', day = '2026-10-06';
test('two real editors merge independent offline edits to a legacy session without invented conflicts', async ({ browser }) => {
  let state = { sessions: { [day]: { date: day, title: 'Synthetic session', selectedBlockId: 'qa-block',
    blocks: [{ id: 'qa-block', title: 'Original title', objective: 'Original objective', minutes: 20 }] } } };
  let revision = 10;
  const conflicts = [], contexts = [];
  const open = async name => {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage();
    const fixture = await installSetPiecesCentralFixture(page); fixture.actor.id = name;
    await page.route('**/api/app-state**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true,
        entries: { [key]: JSON.stringify(state) }, metadata: { [key]: { revision } }, absentKeys: [] } });
      const body = route.request().postDataJSON();
      if (body.key !== key) return route.abort('blockedbyclient');
      if (!await page.evaluate(() => navigator.onLine)) return route.abort('internetdisconnected');
      const change = JSON.parse(await transport.decodeSessionStateValue(key, body.sessionChange));
      const result = applySessionDateChange(state, change);
      if (!result.ok) {
        conflicts.push(...result.conflicts);
        return route.fulfill({ status: 409, json: { ok: false, currentRevision: revision, conflicts: result.conflicts } });
      }
      state = result.state; revision++;
      return route.fulfill({ json: { ok: true, metadata: { revision }, sessionChange: JSON.stringify({
        id: change.id, date: day, value: sessionDateValue(state, day),
      }) } });
    });
    await page.goto('/?workspace=session-planner');
    await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState.isHydrated());
    await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
    await page.locator(`[data-session-date="${day}"]`).click();
    await expect(page.locator('[data-session-field="title"]').first()).toHaveValue('Original title');
    return { page, context };
  };
  const edit = async (client, field, value) => {
    const input = client.page.locator(`[data-session-field="${field}"]`).first();
    await input.fill(value); await input.dispatchEvent('change'); await input.blur();
  };
  try {
    const a = await open('coach-a'), b = await open('coach-b');
    await a.context.setOffline(true);
    await edit(a, 'title', 'Offline A');
    await edit(b, 'objective', 'Online B');
    await expect.poll(() => state.sessions[day].blocks[0].objective).toBe('Online B');
    await a.context.setOffline(false);
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => ({ title: state.sessions[day].blocks[0].title, conflicts }), { timeout: 10000 })
      .toEqual({ title: 'Offline A', conflicts: [] });
    expect(state.sessions[day].blocks[0].objective).toBe('Online B');
    await expect(a.page.locator('[data-platform-autosave-status]')).toHaveClass(/is-saved/);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
