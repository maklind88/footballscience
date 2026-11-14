import { expect, test } from '@playwright/test';
import { installSetPiecesCentralFixture } from './helpers/set-pieces-central-fixture.mjs';

const threadId = 'dm:peer-qa:set-pieces-coach';
const team = { id: 'team', threadId: 'team', type: 'team', title: 'Team Chat', messageCount: 0 };

async function waitForApp(page) {
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.isHydrated());
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
}

for (const mode of ['unread', 'read-receipt']) {
  test(`late DM inbox renders ${mode} and remains usable after reload`, async ({ page }) => {
    await page.addLocatorHandler(page.locator('#platformInstallPromptHost [data-install-app-action="dismiss"]'),
      button => button.click());
    const server = await installSetPiecesCentralFixture(page);
    const peer = {
      id: 'peer-qa', email: 'peer@example.test',
      user_metadata: { firstName: 'Peer', lastName: 'Synthetic' },
      app_metadata: { role: 'coach', status: 'active', organizationId: 'set-pieces-org' },
    };
    const message = {
      id: 'dm-refresh-message', threadId, userId: mode === 'unread' ? peer.id : server.actor.id,
      text: 'Synthetic DM refresh', createdAt: new Date().toISOString(),
      readBy: mode === 'unread' ? [peer.id] : [server.actor.id, peer.id], mentionedUserIds: [], reactions: [],
    };
    const direct = {
      id: threadId, threadId, type: 'dm', title: 'Direct message',
      messageCount: 1, unreadCount: mode === 'unread' ? 1 : 0, lastMessage: message,
    };
    await page.route('**/api/admin-users**', route => route.fulfill({ json:
      new URL(route.request().url()).searchParams.has('me')
        ? { ok: true, user: server.actor }
        : { ok: true, users: [server.actor, peer], roles: ['admin', 'coach'] },
    }));
    let includeDirect = false;
    let holdNextInbox = false;
    let pendingInbox;
    let inboxReads = 0;
    let readAcknowledged = false;
    await page.route('**/api/chat**', async route => {
      const query = new URL(route.request().url()).searchParams;
      if (route.request().method() === 'POST') {
        const action = route.request().postDataJSON();
        if (action.action === 'markThreadRead' && action.threadId === threadId) {
          readAcknowledged = true;
          direct.unreadCount = 0;
          message.readBy = [server.actor.id, peer.id];
        }
        return route.fulfill({ json: { ok: true } });
      }
      if (query.get('view') === 'threads') {
        inboxReads++;
        if (holdNextInbox) {
          holdNextInbox = false;
          pendingInbox = route;
          return;
        }
        return route.fulfill({ json: { ok: true, threads: includeDirect ? [team, direct] : [team], messages: [] } });
      }
      const isDirect = query.get('threadId') === threadId;
      return route.fulfill({ json: {
        ok: true, thread: isDirect ? direct : team,
        messages: isDirect ? [message] : [], nextCursor: null,
      } });
    });
    await page.goto('/?workspace=home');
    await waitForApp(page);
    await expect.poll(() => inboxReads).toBeGreaterThan(0);

    // A peer creates a DM after the closed-widget read. Opening must fetch it anew.
    includeDirect = true;
    holdNextInbox = true;
    const messagesLoaded = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/chat' && url.searchParams.get('threadId') === 'team' && response.ok();
    });
    await page.locator('[data-dashboard-chat-widget-toggle]').first().click();
    await (await messagesLoaded).finished();
    await expect(page.locator('[data-dashboard-chat-input]')).toBeVisible();
    await expect.poll(() => Boolean(pendingInbox)).toBe(true);
    const row = page.locator(`[data-dashboard-chat-thread="${threadId}"]`).first();
    await expect(row).toHaveCount(0);
    // The live helper leaves the pointer on Team while waiting for the new DM.
    const teamRow = page.locator('[data-dashboard-chat-thread="team"]').first();
    await teamRow.hover();
    const teamPosition = await teamRow.boundingBox();
    await pendingInbox.fulfill({ json: { ok: true, threads: [team, direct], messages: [] } });
    await expect(row).toBeVisible();
    expect(await teamRow.boundingBox()).toEqual(teamPosition);
    if (mode === 'unread') await expect(row.locator('.dashboard-chat-thread-unread')).toHaveText('1');
    await row.click();
    await expect(page.locator('[data-dashboard-chat-list]')).toContainText(message.text);
    if (mode === 'unread') {
      await expect.poll(() => readAcknowledged).toBe(true);
    } else {
      await expect(page.locator('[data-dashboard-chat-message-delivery-status="read"]').last()).toHaveAttribute('title', /Read by 1/);
    }

    await page.reload();
    await waitForApp(page);
    await page.locator('[data-dashboard-chat-widget-toggle]').first().click();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('[data-dashboard-chat-list]')).toContainText(message.text);
    await expect(row.locator('.dashboard-chat-thread-unread')).toHaveCount(0);
    if (mode === 'read-receipt') {
      await expect(page.locator('[data-dashboard-chat-message-delivery-status="read"]').last()).toHaveAttribute('title', /Read by 1/);
    }
  });
}
