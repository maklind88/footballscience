import { expect, test } from "@playwright/test";

for (const width of [1450, 390]) {
  test(`IDP background sync preserves DOM, focus and unaffected sections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    let revision = "r1";
    let evidence = [];
    let syncReads = 0;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const profile = { playerId: "p1", playerName: "Test Player", position: "Goalkeeper" };
    await page.route("**/__idp-refresh-test", (route) => route.fulfill({
      contentType: "text/html",
      body: '<html><head><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body><main id="idpWorkspace"></main></body></html>',
    }));
    await page.route("**/api/idp?*", (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      if (action === "sync") syncReads += 1;
      const payload = action === "dashboard" ? { players: [{ profile }] }
        : action === "player" ? { profile, evidence, focuses: [] } : {};
      return route.fulfill({ json: { ...payload, sync: { revision } } });
    });
    await page.goto("/__idp-refresh-test");
    await page.clock.install();
    await page.evaluate(async () => {
      const module = await import("/src/modules/idp/index.mjs");
      const root = document.getElementById("idpWorkspace");
      const context = { ui: { idpWorkspace: root }, win: window, canEdit: () => true };
      root.addEventListener("click", module.handleClick);
      root.addEventListener("input", module.handleInput);
      window.idpTest = { module, context, root };
      module.render(context);
    });
    await page.locator('[data-idp-player="p1"]').click();
    await expect(page.locator(".idp-profile-menu")).toBeVisible();
    await expect(page.locator(".idp-notice.is-loading")).toHaveCount(0);
    await page.evaluate(() => {
      const test = window.idpTest;
      test.profile = document.querySelector(".idp-player-profile");
      test.menu = document.querySelector(".idp-profile-menu");
      test.focus = document.querySelector(".idp-development-board");
      test.button = test.menu.querySelector("button");
      test.button.focus();
      test.mutations = 0;
      test.observer = new MutationObserver((records) => { test.mutations += records.length; });
      test.observer.observe(test.root, { childList: true, subtree: true });
    });
    for (let tick = 1; tick <= 3; tick += 1) {
      await page.clock.fastForward(30000);
      await expect.poll(() => syncReads).toBe(tick);
      // Drain the response and its render callback before asserting DOM identity.
      await expect.poll(() => page.evaluate(() => window.idpTest.mutations)).toBe(0);
    }
    await page.evaluate(() => window.idpTest.module.render(window.idpTest.context));
    expect(await page.evaluate(() => ({
      mutations: window.idpTest.mutations,
      focused: document.activeElement === window.idpTest.button,
      sameProfile: window.idpTest.profile === document.querySelector(".idp-player-profile"),
    }))).toEqual({ mutations: 0, focused: true, sameProfile: true });

    revision = "r2";
    evidence = [{ id: "e1", playerId: "p1", note: "New coach observation", type: "Coach Note" }];
    await page.clock.fastForward(30000);
    await expect(page.locator(".idp-signal-stream-panel")).toContainText("New coach observation");
    expect(await page.evaluate(() => ({
      sameProfile: window.idpTest.profile === document.querySelector(".idp-player-profile"),
      sameMenu: window.idpTest.menu === document.querySelector(".idp-profile-menu"),
      sameFocus: window.idpTest.focus === document.querySelector(".idp-development-board"),
      focused: document.activeElement === window.idpTest.button,
    }))).toEqual({ sameProfile: true, sameMenu: true, sameFocus: true, focused: true });
    await expect(page.locator(".idp-notice.is-loading")).toHaveCount(0);

    await page.evaluate(() => {
      window.idpTest.mutations = 0;
      window.idpTest.root.hidden = true;
    });
    const readsBeforeHidden = syncReads;
    await page.clock.fastForward(30000);
    expect(syncReads).toBe(readsBeforeHidden);
    expect(errors).toEqual([]);
  });
}
