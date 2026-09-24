import { expect, test } from "@playwright/test";

for (const width of [1450, 390]) {
  test(`multiple focus and independent exercise flow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const profile = { playerId: "p1", playerName: "Ryan Williams", position: "Defender" };
    const focuses = [{ id: "main-focus", rowVersion: 1, focusLevel: "main", title: "Crossing", category: "Technical", status: "Active" }];
    const goals = [];
    const interventions = [];
    const writes = [];
    await page.route("**/__idp-focus-test", (route) => route.fulfill({ contentType: "text/html", body: '<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-planner-overrides.css"><link rel="stylesheet" href="/src/modules/session-planner/session-planner-tacticalboard.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body style="margin:0"><main id="idpWorkspace"></main></body></html>' }));
    await page.route("**/api/idp**", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        const action = new URL(request.url()).searchParams.get("action");
        return route.fulfill({ json: action === "dashboard" ? { players: [{ profile }] } : { profile, focuses, goals, interventions } });
      }
      const body = request.postDataJSON();
      writes.push(body);
      if (body.action === "create-focus") {
        const focus = { ...body.focus, id: "secondary-focus", rowVersion: 1 };
        focuses.unshift(focus);
        return route.fulfill({ json: { focus } });
      }
      if (body.action === "create-goal") {
        const goal = { ...body.goal, id: "goal-1", rowVersion: 1 };
        goals.push(goal);
        return route.fulfill({ json: { goal } });
      }
      if (body.action === "create-intervention") {
        const intervention = { ...body.intervention, id: `exercise-${interventions.length + 1}`, rowVersion: 1 };
        interventions.unshift(intervention);
        return route.fulfill({ json: { intervention } });
      }
      if (body.action === "update-intervention") {
        const index = interventions.findIndex((item) => item.id === body.intervention.id);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(body.intervention.rowVersion).toBe(interventions[index].rowVersion);
        const intervention = { ...interventions[index], ...body.intervention, rowVersion: body.intervention.rowVersion + 1 };
        interventions[index] = intervention;
        return route.fulfill({ json: { intervention } });
      }
      throw new Error(`Unexpected write ${body.action}`);
    });
    await page.goto("/__idp-focus-test");
    await page.evaluate(async () => {
      const module = await import("/src/modules/idp/index.mjs");
      const root = document.getElementById("idpWorkspace");
      root.addEventListener("click", module.handleClick);
      root.addEventListener("input", module.handleInput);
      root.addEventListener("change", module.handleChange);
      root.addEventListener("submit", module.handleSubmit);
      module.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => true });
    });
    await page.locator('[data-idp-player="p1"]').click();
    await page.locator('[data-idp-action="new-focus"]').click();
    const focusForm = page.locator("[data-idp-create-focus]");
    await expect(focusForm.locator('[name="focusLevel"]')).toHaveValue("secondary");
    await focusForm.locator('[name="title"]').fill("Scanning before receiving");
    await focusForm.getByRole("button", { name: "Save focus", exact: true }).click();
    await expect(page.locator('[data-idp-select-focus="secondary-focus"]')).toHaveAttribute("aria-pressed", "true");
    expect(focuses.find((focus) => focus.id === "main-focus").title).toBe("Crossing");
    await page.locator('[data-idp-select-focus="main-focus"]').click();
    await page.locator('.idp-current-focus-actions [data-idp-action="focus"]').click();
    await expect(focusForm.locator('[name="focusId"]')).toHaveValue("main-focus");
    await expect(focusForm.locator('[name="title"]')).toHaveValue("Crossing");
    await page.locator("[data-idp-close-action]").first().click();
    await testInfo.attach(`focus-${width}.png`, { body: await page.locator(".idp-current-focus-card").screenshot(), contentType: "image/png" });

    await page.locator('.idp-profile-menu [data-idp-profile-view="goals"]').click();
    await page.locator('.idp-profile-goals-page [data-idp-action="goal"]').first().click();
    const goalForm = page.locator("[data-idp-save-goal]");
    await goalForm.locator('[name="focusId"]').selectOption("secondary-focus");
    await goalForm.locator('[name="title"]').fill("Scan before three receptions");
    await goalForm.locator('button[type="submit"]').click();
    await expect(page.locator(".idp-goal-focus-label")).toContainText("Scanning before receiving");
    expect(goals[0].focusId).toBe("secondary-focus");

    await page.locator('.idp-profile-menu [data-idp-profile-view="player-board"]').click();
    await page.locator("[data-idp-board-new]").click();
    await expect(page.locator(".idp-player-board-editor-save")).toBeEnabled();
    await page.locator('[data-session-tactical-tool="cone"]').click();
    const canvas = page.locator("[data-session-tactical-canvas]");
    await canvas.dblclick({ position: { x: 80, y: 100 } });
    await expect(page.locator(".session-tacticalboard-modal .session-tactical-cone")).toHaveCount(1);
    await page.locator(".idp-player-board-editor-save").click();
    await expect(page.locator('.idp-player-board-bank-list [data-idp-board-select="exercise-1"]')).toBeVisible();
    expect(interventions[0].focusId).toBe("");
    expect(interventions[0].boardState.tacticalElements).toHaveLength(1);
    const drawing = structuredClone(interventions[0].boardState);
    await page.locator(".idp-exercise-link-details summary").click();
    await page.locator("[data-idp-board-title]").fill("Receive and turn");
    await page.locator("[data-idp-board-focus]").selectOption("secondary-focus");
    await page.locator(".idp-exercise-link-details [data-idp-board-save]").click();
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toContainText("Receive and turn");
    expect(interventions).toHaveLength(1);
    expect(interventions[0].focusId).toBe("secondary-focus");
    expect(interventions[0].boardState).toEqual(drawing);
    await page.locator("[data-idp-board-open]").click();
    await expect(page.locator(".session-tacticalboard-modal .session-tactical-cone")).toHaveCount(1);
    await page.locator("[data-session-close-tacticalboard]").click();
    await page.locator(".idp-exercise-link-details summary").click();
    await page.locator("[data-idp-board-focus]").selectOption("");
    await page.locator(".idp-exercise-link-details [data-idp-board-save]").click();
    await expect.poll(() => interventions[0].focusId).toBe("");
    expect(interventions[0].boardState).toEqual(drawing);
    expect(writes.every((write) => ["create-focus", "create-goal", "create-intervention", "update-intervention"].includes(write.action))).toBe(true);
  });
}
