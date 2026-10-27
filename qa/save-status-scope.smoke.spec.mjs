import { test, expect } from "@playwright/test";
import { installSetPiecesCentralFixture } from "./helpers/set-pieces-central-fixture.mjs";

const scheduleKey = "football-schedule-v1";

// Exercise real auth, hydration and the profile indicator; remote data is synthetic.
test("server save proof belongs to its account and disappears while another account loads", async ({ page }) => {
  const fixture = await installSetPiecesCentralFixture(page);
  let hold = false, held = false, release, holdWrites = false, releaseWrites;
  const barrier = new Promise(resolve => { release = resolve; });
  const writeBarrier = new Promise(resolve => { releaseWrites = resolve; });
  await page.route("**/api/app-state**", async route => {
    if (route.request().method() === "GET") {
      if (hold) { held = true; await barrier; }
      return route.fallback();
    }
    if (holdWrites) await writeBarrier;
    const body = route.request().postDataJSON();
    if (body.key !== scheduleKey) return route.fallback();
    return route.fulfill({ json: { ok: true, value: body.value, metadata: { revision: 11 } } });
  });
  await page.goto("/?workspace=set-pieces-room");
  await page.waitForFunction(() => window.__footballScienceAppReady && window.footballScienceCentralState?.getStatus().lastFetchedAt);
  const first = await page.evaluate(() => ({ scope: window.footballScienceCentralState.getReadScope(),
    status: window.footballScienceCentralState.getStatus() }));
  expect(first.status.lastFetchedScope).toBe(first.scope);
  // The full app can also save workspace preferences during startup.
  await expect(page.locator("#dataSafetyStatus")).toHaveText(/^(Saved |Up to date)/);
  const result = await page.evaluate(async key => {
    const result = await window.footballScienceCentralState.syncKey(key, "[]");
    window.dispatchEvent(new CustomEvent("footballscience:library-save-status"));
    return { result, status: window.footballScienceCentralState.getStatus() };
  }, scheduleKey);
  expect(result.result.ok).toBe(true);
  expect(result.status.lastSavedScope).toBe(first.scope);
  expect(result.status.lastSavedAt).not.toBe("");
  await expect(page.locator("#dataSafetyStatus")).toHaveText(/^Saved /);

  fixture.actor.id = "other-synthetic-coach";
  fixture.actor.app_metadata.organizationId = "other-synthetic-organization";
  hold = true; holdWrites = true;
  try {
    await page.evaluate(user => {
      window.__qaSetPiecesSession = { access_token: "qa-other-account-token", user };
      void window.__qaSetPiecesAuth("SIGNED_IN", window.__qaSetPiecesSession);
    }, fixture.actor);
    await expect.poll(() => held).toBe(true);
    const waiting = await page.evaluate(() => ({ scope: window.footballScienceCentralState.getReadScope(),
      status: window.footballScienceCentralState.getStatus() }));
    expect(waiting.scope).not.toBe(first.scope);
    expect(waiting.status.lastSavedScope).toBe(first.scope);
    await expect(page.locator("#dataSafetyStatus")).not.toHaveText(/Saved|Up to date/);
    await expect(page.locator("#dataSafetyStatus")).not.toHaveClass(/is-backed-up/);
    hold = false; release();
    await page.waitForFunction(() => {
      const bridge = window.footballScienceCentralState;
      return bridge.getStatus().lastFetchedScope === bridge.getReadScope();
    });
    await expect(page.locator("#dataSafetyStatus")).not.toHaveText(/^Saved /);
    expect(await page.evaluate(() => window.footballScienceCentralState.getStatus().lastSavedScope)).toBe(first.scope);
  } finally { hold = false; holdWrites = false; release(); releaseWrites(); }
});
