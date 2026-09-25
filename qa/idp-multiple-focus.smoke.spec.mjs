import { expect, test } from "@playwright/test";

for (const width of [1450, 390]) {
  test(`multiple focus and independent exercise flow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const profile = { playerId: "p1", playerName: "Ryan Williams", position: "Defender" };
    const focuses = [{ id: "main-focus", rowVersion: 1, focusLevel: "main", title: "Crossing", category: "Technical", status: "Active" }];
    const goals = [];
    const interventions = [];
    const writes = [];
    let rejectDelete = false;
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
      if (body.action === "archive-intervention") {
        const index = interventions.findIndex((item) => item.id === body.intervention.id);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(body.intervention.playerId).toBe("p1");
        expect(body.intervention.rowVersion).toBe(interventions[index].rowVersion);
        if (rejectDelete) return route.fulfill({ status: 409, json: { reason: "Exercise changed. Reload before deleting." } });
        const [intervention] = interventions.splice(index, 1);
        return route.fulfill({ json: { intervention: { ...intervention, deletedAt: new Date().toISOString() } } });
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
    await page.locator('[data-idp-edit-focus="main-focus"]').click();
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
    const editorName = page.locator(".idp-player-board-editor-name input");
    await expect(editorName).toBeVisible();
    await editorName.fill("Turn & accelerate");
    await expect(page.locator(".session-tacticalboard-modal h2")).toHaveText("Ryan Williams");
    await expect(page.getByRole("tab", { name: "Players", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-session-tactical-tool="cone"]')).toBeHidden();
    await page.getByRole("tab", { name: "Equipment", exact: true }).click();
    await page.locator('[data-session-tactical-tool="cone"]').click();
    await expect(page.locator('[data-session-tactical-tool="cone"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-session-tactical-width]')).toBeHidden();
    const canvas = page.locator("[data-session-tactical-canvas]");
    await canvas.dblclick({ position: { x: 80, y: 100 } });
    await expect(page.locator(".session-tacticalboard-modal .session-tactical-cone")).toHaveCount(1);
    await page.locator('[data-session-undo-board]').click();
    await expect(page.locator(".session-tacticalboard-modal .session-tactical-cone")).toHaveCount(0);
    await page.locator('[data-session-redo-board]').click();
    await expect(page.locator(".session-tacticalboard-modal .session-tactical-cone")).toHaveCount(1);
    await page.getByRole("tab", { name: "Draw", exact: true }).click();
    await page.locator('[data-session-tactical-tool="line"]').click();
    await expect(page.locator('[data-session-tactical-width]')).toBeVisible();
    await page.locator('[data-idp-board-select-tool]').click();
    await canvas.dblclick({ position: { x: 120, y: 150 } });
    await expect(page.locator(".session-tacticalboard-modal .session-tactical-cone")).toHaveCount(1);
    await page.getByRole("tab", { name: "Equipment", exact: true }).click();
    await expect(editorName).toHaveValue("Turn & accelerate");
    const nameBox = await editorName.boundingBox();
    expect(nameBox.x).toBeGreaterThanOrEqual(0);
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(width);
    await testInfo.attach(`exercise-editor-${width}.png`, { body: await page.locator(".session-library-modal-head").screenshot({ path: testInfo.outputPath(`exercise-editor-${width}.png`) }), contentType: "image/png" });
    await page.locator(".session-tacticalboard-toolbox").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`toolbox-${width}.png`) });
    await page.locator(".idp-player-board-editor-save").click();
    await expect(page.locator('.idp-player-board-bank-list [data-idp-board-select="exercise-1"]')).toBeVisible();
    expect(interventions[0].focusId).toBe("");
    expect(interventions[0].title).toBe("Turn & accelerate");
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toContainText("Turn & accelerate");
    expect(interventions[0].boardState.tacticalElements).toHaveLength(1);
    const drawing = structuredClone(interventions[0].boardState);
    await page.locator('[data-idp-board-edit-details="exercise-1"]').click();
    await page.locator("[data-idp-board-title]").fill("Receive and turn");
    await page.locator("[data-idp-board-focus]").selectOption("secondary-focus");
    await page.locator(".idp-exercise-link-details [data-idp-board-save]").click();
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toContainText("Receive and turn");
    expect(interventions).toHaveLength(1);
    expect(interventions[0].focusId).toBe("secondary-focus");
    expect(interventions[0].boardState).toEqual(drawing);
    await expect(page.locator(".idp-exercise-entry .idp-exercise-link-details")).toHaveCount(0);
    await page.locator("[data-idp-board-open]").click();
    await expect(editorName).toHaveValue("Receive and turn");
    await editorName.fill("Receive and turn again");
    await expect(page.locator(".session-tacticalboard-modal .session-tactical-cone")).toHaveCount(1);
    await page.locator(".idp-player-board-editor-save").click();
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toContainText("Receive and turn again");
    expect(interventions).toHaveLength(1);
    expect(interventions[0].boardState).toEqual(drawing);
    await page.locator('[data-idp-board-edit-details="exercise-1"]').click();
    await page.locator("[data-idp-board-focus]").selectOption("");
    await page.locator(".idp-exercise-link-details [data-idp-board-save]").click();
    await expect.poll(() => interventions[0].focusId).toBe("");
    expect(interventions[0].boardState).toEqual(drawing);
    await page.locator("[data-idp-board-new]").click();
    await page.locator(".idp-player-board-editor-save").click();
    await expect(page.locator('[data-idp-board-select="exercise-2"]')).toBeVisible();
    await page.locator('[data-idp-board-edit-details="exercise-1"]').click();
    await expect(page.locator("[data-idp-board-title]")).toHaveValue("Receive and turn again");
    await page.locator("[data-idp-board-title]").fill("Receive, scan and turn");
    await page.locator(".idp-exercise-link-details [data-idp-board-save]").click();
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toContainText("Receive, scan and turn");
    expect(interventions.find((item) => item.id === "exercise-1").boardState).toEqual(drawing);
    await expect(page.locator(".idp-player-board-sidebar > .idp-exercise-link-details")).toHaveCount(0);
    await expect.poll(() => page.locator(".idp-player-board-sidebar").evaluate((sidebar) => {
      const bank = sidebar.querySelector(".idp-player-board-exercise-bank")?.getBoundingClientRect();
      const focus = sidebar.querySelector(".idp-player-board-focus-card")?.getBoundingClientRect();
      return Boolean(bank?.height && focus?.height && focus.top >= bank.bottom);
    })).toBe(true);
    await testInfo.attach(`exercise-bank-${width}.png`, { body: await page.screenshot(), contentType: "image/png" });

    await page.locator('[data-idp-board-select="exercise-2"]').click();
    await page.locator('.idp-exercise-entry [data-idp-board-delete="exercise-1"]').click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(writes.filter((write) => write.action === "archive-intervention")).toHaveLength(0);
    rejectDelete = true;
    await page.locator('.idp-exercise-entry [data-idp-board-delete="exercise-1"]').click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete exercise", exact: true }).click();
    await expect(page.getByText("Exercise changed. Reload before deleting.", { exact: true })).toBeVisible();
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toBeVisible();
    expect(interventions).toHaveLength(2);
    rejectDelete = false;
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.locator('.idp-exercise-entry [data-idp-board-delete="exercise-1"]').click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete exercise", exact: true }).click();
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toHaveCount(0);
    await expect(page.locator('[data-idp-board-select="exercise-2"]')).toBeVisible();
    expect(interventions.map((item) => item.id)).toEqual(["exercise-2"]);
    expect(focuses.find((focus) => focus.id === "main-focus").title).toBe("Crossing");
    expect(writes.every((write) => ["create-focus", "create-goal", "create-intervention", "update-intervention", "archive-intervention"].includes(write.action))).toBe(true);
  });
}
