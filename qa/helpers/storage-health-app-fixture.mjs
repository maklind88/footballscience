import { installSetPiecesCentralFixture } from './set-pieces-central-fixture.mjs';

const readyTitle = 'Storage health fixture ready';

export async function installStorageHealthAppFixture(page, { deferUserList = false } = {}) {
  const server = await installSetPiecesCentralFixture(page);
  let releaseUserList;
  let requested = false;
  const gate = new Promise(resolve => { releaseUserList = resolve; });
  if (!deferUserList) releaseUserList();
  await page.route('**/api/admin-users', async route => {
    requested = true;
    await gate;
    // The title proves that the late user-list response was applied, not just received.
    const actor = { ...server.actor, user_metadata: { ...server.actor.user_metadata, title: readyTitle } };
    await route.fulfill({ json: { ok: true, users: [actor], roles: ['admin', 'coach'] } });
  });
  return { server, releaseUserList, userListRequested: () => requested };
}

export async function waitForStorageHealthApp(page) {
  await page.waitForFunction(() => window.__footballScienceAppReady && document.querySelector('#loginScreen')?.hidden);
  await page.evaluate(() => window.platformAuthReadyPromise);
  // App readiness precedes post-auth hydration, whose user-change event closes menus.
  await page.waitForFunction(title => window.platformAuthStore?.getCurrentUser?.()?.title === title, readyTitle);
  await page.evaluate(() => document.querySelector('#dashboardModalRoot button[data-dashboard-modal-close]')?.click());
}
