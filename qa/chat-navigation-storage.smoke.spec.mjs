import { test, expect } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';
const key = 'football-dashboard-chat-widget-state-v1';
const threadId = 'dm:peer-qa:set-pieces-coach';
async function setup(page) {
  // WebKit can offer installation asynchronously after auth becomes ready.
  await page.addLocatorHandler(page.locator('#platformInstallPromptHost [data-install-app-action="dismiss"]'),
    async button => button.click());
  const server = await installSetPiecesCentralFixture(page);
  const peer = { id: 'peer-qa', email: 'peer@example.test', user_metadata: { firstName: 'Peer', lastName: 'Synthetic' }, app_metadata: { role: 'coach', status: 'active', organizationId: 'set-pieces-org' } };
  await page.route('**/api/admin-users**', r => r.fulfill({ json: new URL(r.request().url()).searchParams.has('me')
    ? { ok: true, user: server.actor } : { ok: true, users: [server.actor, peer], roles: ['admin', 'coach'] } }));
  const message = { id: 'qa-message', threadId, userId: peer.id, text: 'Synthetic navigation message', createdAt: new Date().toISOString(), readBy: [], mentionedUserIds: [], reactions: [] };
  const threads = [{ id: 'team', type: 'team', title: 'Team Chat' }, { id: threadId, type: 'dm', title: 'Direct message', messageCount: 1, unreadCount: 1, lastMessage: message }];
  await page.route('**/api/chat**', r => r.fulfill({ json: { ok: true, threads, messages: [message], scope: { organizationId: 'set-pieces-org' }, nextCursor: null } }));
  await page.addInitScript(key => {
    const native = Storage.prototype.setItem;
    window.__widgetStorageFailures = 0;
    window.__fillNative = (key, value) => native.call(localStorage, key, value);
    Storage.prototype.setItem = function(k, value) {
      try {
        if (k === key && window.__denyWidgetStorage) throw new DOMException('Synthetic denial', 'SecurityError');
        return native.call(this, k, value);
      } catch (error) { if (k === key) window.__widgetStorageFailures++; throw error; }
    };
    localStorage.setItem('qa-preserved-sentinel', 'must survive');
  }, key);
  await page.goto('/?workspace=home');
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
  await page.locator('[data-dashboard-chat-widget-toggle]').first().click();
  await expect(page.locator(`[data-dashboard-chat-thread="${threadId}"]`).first()).toBeVisible();
}
for (const mode of ['native-quota', 'denied', 'available']) {
  test(`Full app switches Chat threads with storage ${mode}`, async ({ page }) => {
    await setup(page);
    if (mode === 'denied') await page.evaluate(() => { window.__denyWidgetStorage = true; });
    if (mode === 'native-quota') {
      const failures = await page.evaluate(() => {
        let failures = 0, count = 0;
        for (const size of [262144, 16384, 1024, 16, 1]) for (let n = 0; n < 1000; n++) {
          try { window.__fillNative(`qa-fill-${count++}`, 'x'.repeat(size)); }
          catch (error) { if (error.name !== 'QuotaExceededError') throw error; failures++; break; }
        }
        return failures;
      });
      expect(failures).toBe(5);
    }
    const select = async id => {
      await page.locator(`[data-dashboard-chat-thread="${id}"]`).first().click();
      await expect(page.locator(`[data-dashboard-chat-list][data-dashboard-chat-active-thread="${id}"]`)).toBeVisible();
    };
    await select(threadId);
    await expect(page.locator('[data-dashboard-chat-list]')).toContainText('Synthetic navigation message');
    if (mode !== 'available') {
      expect(await page.evaluate(() => window.__widgetStorageFailures)).toBeGreaterThan(0);
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedThreadId, key)).toBe('team');
    }
    await select('team'); await select(threadId);
    expect(await page.evaluate(() => localStorage.getItem('qa-preserved-sentinel'))).toBe('must survive');
    if (mode === 'available') {
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedThreadId, key)).toBe(threadId);
      await page.reload();
      await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
      await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
      await expect(page.locator('.dashboard-chat-widget.is-open')).toHaveCount(0);
      await page.locator('[data-dashboard-chat-widget-toggle]').first().click();
      // The existing renderer can choose Team while its inbox is still loading.
      // Verify navigation after reload; preference restoration is covered at the state boundary.
      await select(threadId);
    }
  });
}
