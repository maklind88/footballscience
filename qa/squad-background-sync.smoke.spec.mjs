import { test, expect } from "@playwright/test";

const key = "football-player-profiles-v1";
const pulse = (page) => page.evaluate(() => window.dispatchEvent(new CustomEvent("footballscience:central-state-ready")));

async function boot(page) {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 3, rosterVersion: "qa-quiet-sync",
      players: [{ id: "qa-quiet-player", name: "QA Quiet Player", position: "Defender", primaryRole: "CB",
        rosterType: "squad", countsInSquad: true, rosterOrder: 1, birthDate: "2000-01-01" }],
      removedPlayerIds: [], selectedPlayerId: "qa-quiet-player" }));
  }, { key });
  await page.goto("/?workspace=player-profiles", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await expect(page.locator('[data-player-profile-select="qa-quiet-player"]')).toBeVisible();
  await page.evaluate(({ key }) => {
    window.__qaSquadMetadata = { [key]: { revision: 8, organizationId: "qa-quiet-org" } };
    const original = window.footballScienceCentralState.getStatus;
    window.footballScienceCentralState.getStatus = () => ({ ...original(), metadata: window.__qaSquadMetadata });
    // Localhost auth has no server. Acknowledge fixture writes before simulating a colleague.
    window.footballScienceCentralState.isHydrated = () => true;
    window.footballScienceCentralState.syncKey = async (key, value) => {
      const metadata = { revision: (window.__qaSquadMetadata[key]?.revision || 0) + 1 };
      window.__qaSquadMetadata[key] = metadata;
      return { ok: true, value, metadata };
    };
  }, { key });
  await pulse(page);
  await expect(page.locator('.squad-availability-cell[aria-busy="true"]')).toHaveCount(0);
}

for (const width of [1470, 390]) {
  test(`Squad retains DOM, search and scroll across unchanged background sync at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 820 });
    await boot(page);
    const search = page.locator("[data-player-profile-search]");
    await search.fill("Quiet");
    await search.blur();
    await expect(page.locator('.squad-availability-cell[aria-busy="true"]')).toHaveCount(0);
    await page.evaluate(() => {
      window.__qaSquadNode = document.querySelector(".squad-board-shell");
      window.__qaSquadRow = document.querySelector(".squad-player-row");
      window.__qaSquadScroll = document.querySelector(".platform-content").scrollTop;
    });
    for (let i = 0; i < 3; i++) await pulse(page);
    await page.evaluate(() => { window.__qaSquadMetadata["football-scouting-v1"] = { revision: 12 }; });
    await pulse(page);
    expect(await page.evaluate(() => ({
      root: window.__qaSquadNode === document.querySelector(".squad-board-shell"),
      row: window.__qaSquadRow === document.querySelector(".squad-player-row"),
      scroll: window.__qaSquadScroll === document.querySelector(".platform-content").scrollTop,
    }))).toEqual({ root: true, row: true, scroll: true });
    await expect(search).toHaveValue("Quiet");
    await expect(page.locator('.squad-availability-cell[aria-busy="true"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`squad-quiet-${width}.png`) });
    expect(errors).toEqual([]);
  });
}

test("a colleague's changed player appears after closing a protected profile and subsequent unchanged sync stays quiet", async ({ page }) => {
  await boot(page);
  await page.locator('[data-player-profile-select="qa-quiet-player"]').click();
  await expect(page.locator("#playerProfileEditForm")).toBeVisible();
  await expect.poll(() => page.evaluate(({ key }) =>
    Boolean(JSON.parse(localStorage.getItem("football-data-safety-v1") || "{}").entries?.[key]?.pendingCentralSync), { key }))
    .toBe(false);
  await page.evaluate(({ key }) => {
    window.__qaSquadForm = document.querySelector("#playerProfileEditForm");
    const state = JSON.parse(localStorage.getItem(key));
    state.players.find((player) => player.id === "qa-quiet-player").name = "QA Updated By Colleague";
    window.__footballScienceCentralHydrating = true;
    try { localStorage.setItem(key, JSON.stringify(state)); }
    finally { window.__footballScienceCentralHydrating = false; }
    window.__qaSquadMetadata[key].revision++;
  }, { key });
  await pulse(page);
  expect(await page.evaluate(({ key }) => JSON.parse(localStorage.getItem(key)).players.find((player) => player.id === "qa-quiet-player").name, { key })).toBe("QA Updated By Colleague");
  expect(await page.evaluate(() => window.__qaSquadForm === document.querySelector("#playerProfileEditForm"))).toBe(true);
  await expect(page.locator('#playerProfileEditForm input[name="name"]')).toHaveValue("QA Quiet Player");
  await page.locator("[data-player-profile-modal-close]").click();
  await pulse(page);
  await expect(page.locator('[data-player-profile-select="qa-quiet-player"]')).toContainText("QA Updated By Colleague");
  // Renaming also updates the Medical projection. Acknowledge that real change before testing an unchanged pulse.
  await expect.poll(() => page.evaluate(() => Object.values(
    JSON.parse(localStorage.getItem("football-data-safety-v1") || "{}").entries || {}
  ).some((entry) => entry.pendingCentralSync))).toBe(false);
  await pulse(page);
  await expect(page.locator('.squad-availability-cell[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => {
    window.__qaUpdatedRow = document.querySelector('[data-player-profile-select="qa-quiet-player"]');
    window.__qaSettledMetadata = JSON.stringify(window.__qaSquadMetadata);
  });
  await pulse(page);
  expect(await page.evaluate(() => JSON.stringify(window.__qaSquadMetadata))).toBe(await page.evaluate(() => window.__qaSettledMetadata));
  expect(await page.evaluate(() => window.__qaUpdatedRow === document.querySelector('[data-player-profile-select="qa-quiet-player"]'))).toBe(true);
});
