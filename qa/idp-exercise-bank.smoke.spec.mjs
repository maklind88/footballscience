import { expect, test } from "@playwright/test";

for (const width of [1450, 390]) {
  test(`IDP exercise bank layout and interactions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const profile = { playerId: "p1", playerName: "Ryan Williams", position: "Defender" };
    const focuses = [{ id: "focus-1", title: "Delivery & Crossing (Execution)", category: "Technical", status: "Active", description: "Find the far post with a first-time delivery." }];
    const interventions = Array.from({ length: 5 }, (_, index) => ({
      id: `exercise-${index + 1}`, playerId: "p1", focusId: "focus-1", rowVersion: 1, status: "active",
      title: ["First-time crossing", "Overlapping run", "Delivery under pressure", "Counter movement", "Far post finish"][index],
      objective: "Find the next action after receiving under pressure.",
      boardState: {
        tacticalActiveFrameId: "frame-1",
        tacticalFrames: [{ id: "frame-1", elements: [{ id: "cone-1", type: "cone", x: 30, y: 40 }] }],
        tacticalElements: [{ id: "cone-1", type: "cone", x: 30, y: 40 }],
      },
    }));
    await page.route("**/__idp-bank-test", (route) => route.fulfill({
      contentType: "text/html",
      body: '<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body style="margin:0"><main id="idpWorkspace"></main></body></html>',
    }));
    await page.route("**/api/idp?*", (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      return route.fulfill({ json: action === "dashboard" ? { players: [{ profile }] } : { profile, focuses, interventions } });
    });
    await page.goto("/__idp-bank-test");
    await page.evaluate(async () => {
      const module = await import("/src/modules/idp/index.mjs");
      const root = document.getElementById("idpWorkspace");
      root.addEventListener("click", module.handleClick);
      root.addEventListener("input", module.handleInput);
      module.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => true });
    });
    await page.locator('[data-idp-player="p1"]').click();
    await page.locator('.idp-profile-menu [data-idp-profile-view="player-board"]').click();
    const bank = page.getByRole("region", { name: "Individual exercise bank", exact: true });
    const focus = page.getByRole("region", { name: "Current IDP focus", exact: true });
    await expect(bank).toBeVisible();
    await expect(bank.locator("[data-idp-board-select]")).toHaveCount(3);
    await expect(page.locator(".idp-player-board-sidebar .idp-player-board-head")).toHaveCount(0);
    await expect(page.locator(".idp-player-board-stage-head")).toContainText("Player Board");
    await expect(page.locator(".idp-player-board-stage-head strong")).toHaveText("Ryan Williams");
    await expect(page.locator(".idp-player-board-sidebar > :first-child")).toHaveClass("idp-player-board-exercise-bank");
    const bankBox = await bank.boundingBox();
    const focusBox = await focus.boundingBox();
    expect(focusBox.y).toBeGreaterThanOrEqual(bankBox.y + bankBox.height);
    expect(bankBox.x + bankBox.width).toBeLessThanOrEqual(width);
    await testInfo.attach(`bank-${width}.png`, { body: await page.locator(".idp-player-board-sidebar").screenshot(), contentType: "image/png" });
    await bank.locator("[data-idp-board-load-more]").click();
    await expect(bank.locator("[data-idp-board-select]")).toHaveCount(5);
    await bank.locator('[data-idp-board-select="exercise-5"]').click();
    await expect(bank.locator('[data-idp-board-select="exercise-5"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".idp-player-board-stage-head strong")).toHaveText("Ryan Williams");
    await bank.getByRole("searchbox").fill("overlapping");
    await expect(bank.locator("[data-idp-board-select]")).toHaveCount(1);
    await expect(bank).toContainText("Overlapping run");
    await bank.getByRole("searchbox").fill("no-such-exercise");
    await expect(bank).toContainText("No exercises match your search.");
    await bank.getByRole("searchbox").fill("");
    await expect(bank.locator("[data-idp-board-select]")).toHaveCount(3);
    await page.evaluate(() => document.body.classList.add("is-dark-mode"));
    await testInfo.attach(`bank-dark-${width}.png`, { body: await page.locator(".idp-player-board-sidebar").screenshot(), contentType: "image/png" });
    await bank.locator("[data-idp-board-new]").click();
    await expect(page.locator(".session-tacticalboard-modal")).toBeVisible();
    await expect(page.locator(".session-library-modal-head h2")).toHaveText("Ryan Williams");
    await expect(page.locator(".session-tacticalboard-status-strip")).toBeHidden();
    await expect(page.locator(".idp-player-board-editor-details")).toHaveCount(0);
  });
}
