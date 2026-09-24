import { expect, test } from "@playwright/test";

for (const width of [1450, 390]) {
  test(`IDP clip bank empty and filtered layouts at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const profile = { playerId: "p1", playerName: "Ryan Williams" };
    let clipBank = [];
    await page.route("**/__idp-clips-test", (route) => route.fulfill({
      contentType: "text/html",
      body: '<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"><link rel="stylesheet" href="/src/modules/idp/idp-clip-bank.css"></head><body style="margin:0"><main id="idpWorkspace"></main></body></html>',
    }));
    await page.route("**/api/idp?*", (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      return route.fulfill({ json: action === "dashboard" ? { players: [{ profile }] } : { profile, focuses: [], clipBank } });
    });
    async function openBank() {
      await page.goto("/__idp-clips-test");
      await page.evaluate(async () => {
        const module = await import("/src/modules/idp/index.mjs");
        const root = document.getElementById("idpWorkspace");
        root.addEventListener("click", module.handleClick);
        root.addEventListener("input", module.handleInput);
        module.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => true });
      });
      await page.locator('[data-idp-player="p1"]').click();
      await page.locator('.idp-profile-menu [data-idp-profile-view="clip-bank"]').click();
    }
    await openBank();
    const bank = page.locator(".idp-clip-bank-organizer");
    await expect(bank.getByRole("status")).toHaveText("No clips yet");
    await expect(bank.getByText("0 clips", { exact: true })).toHaveCount(1);
    await expect(bank.getByRole("searchbox", { name: "Search clips" })).toBeVisible();
    const headBox = await bank.locator(".idp-clip-bank-head").boundingBox();
    const searchBox = await bank.locator(".idp-clip-bank-search").boundingBox();
    const bankBox = await bank.boundingBox();
    expect(searchBox.y - (headBox.y + headBox.height)).toBeLessThanOrEqual(16);
    expect(bankBox.height).toBeLessThan(310);
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(width);
    await testInfo.attach(`empty-clips-${width}.png`, { body: await bank.screenshot(), contentType: "image/png" });

    clipBank = [
      { id: "clip-1", playerId: "p1", videoTitle: "Crossing practice", startMs: 1000, endMs: 8000 },
      { id: "clip-2", playerId: "p1", videoTitle: "Defending practice", startMs: 9000, endMs: 15000 },
    ];
    await openBank();
    await expect(bank.locator(".idp-clip-bank-row")).toHaveCount(2);
    await bank.getByRole("searchbox").fill("Crossing");
    await expect(bank.locator(".idp-clip-bank-row")).toHaveCount(1);
    await expect(bank).toContainText("1 of 2 clips");
    await bank.getByRole("searchbox").fill("no-match");
    await expect(bank.getByRole("status")).toHaveText("No clips match this search.");
    await expect(bank).toContainText("0 of 2 clips");
    await bank.getByRole("searchbox").fill("");
    await expect(bank.locator(".idp-clip-bank-row")).toHaveCount(2);
  });
}
