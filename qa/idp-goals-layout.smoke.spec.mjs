import { expect, test } from "@playwright/test";

for (const width of [1450, 390]) {
  test(`IDP goals remain readable with one or multiple goals at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const profile = { playerId: "p1", playerName: "Carly Wickenheiser" };
    const goal = {
      id: "goal-1", playerId: "p1", title: "Playing slower with more touches on the ball under pressure",
      description: "Recognise the available space before receiving and choose the next action with composure.",
      goalRole: "supporting", category: "Psychological", status: "active",
      metricLabel: "Player observations of composed decisions under pressure", metricType: "observation",
      currentValue: 3, targetValue: 5, cadence: "daily",
    };
    let goals = [goal];
    const note = "Looked up before receiving and found the forward pass. Repeat this in the next training session, including when the first option is blocked.";
    await page.route("**/__idp-goals-test", (route) => route.fulfill({
      contentType: "text/html",
      body: '<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body style="margin:0"><main id="idpWorkspace"></main></body></html>',
    }));
    await page.route("**/api/idp?*", (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      return route.fulfill({ json: action === "dashboard" ? { players: [{ profile }] } : {
        profile, focuses: [], goals, goalCheckins: [{ id: "check-1", goalId: "goal-1", checkinOn: "2026-09-23", note }],
      } });
    });
    async function openGoals() {
      await page.goto("/__idp-goals-test");
      await page.evaluate(async () => {
        const module = await import("/src/modules/idp/index.mjs");
        const root = document.getElementById("idpWorkspace");
        root.addEventListener("click", module.handleClick);
        root.addEventListener("input", module.handleInput);
        module.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => true });
      });
      await page.locator('[data-idp-player="p1"]').click();
      await page.locator('.idp-profile-menu [data-idp-profile-view="goals"]').click();
    }
    async function assertReadable() {
      const overflows = await page.locator(".idp-goals-board .idp-goal-card").evaluateAll((cards) => cards.flatMap((card) => {
        return [...card.querySelectorAll("strong, p, small, button")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent);
      }));
      expect(overflows).toEqual([]);
      for (const card of await page.locator(".idp-goals-board .idp-goal-card").all()) {
        const box = await card.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await expect(card.getByRole("button", { name: "Check-in", exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
      }
    }
    await openGoals();
    const card = page.locator(".idp-goals-board .idp-goal-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(goal.metricLabel);
    await expect(card).toContainText(note);
    await expect(card.locator(".idp-goal-metrics strong").first()).toHaveCSS("white-space", "normal");
    const cardBox = await card.boundingBox();
    const gridBox = await page.locator(".idp-goals-grid").first().boundingBox();
    expect(Math.abs(cardBox.width - gridBox.width)).toBeLessThan(2);
    await expect(page.getByText("No leadership goal yet", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create leadership goal", exact: true })).toHaveAttribute("data-idp-action", "leadership-goal");
    await assertReadable();
    await testInfo.attach(`goal-single-${width}.png`, { body: await page.locator(".idp-goals-board").screenshot(), contentType: "image/png" });
    goals = [goal, { ...goal, id: "goal-2", title: "First touch into space", category: "Technical" }, { ...goal, id: "goal-3", goalRole: "leadership", category: "Leadership", title: "Organise the midfield before the restart" }];
    await openGoals();
    await expect(page.locator(".idp-goals-board .idp-goal-card")).toHaveCount(3);
    await assertReadable();
    await testInfo.attach(`goals-multiple-${width}.png`, { body: await page.locator(".idp-goals-board").screenshot(), contentType: "image/png" });
  });
}
