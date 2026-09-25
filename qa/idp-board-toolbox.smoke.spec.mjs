import { expect, test } from "@playwright/test";

for (const width of [1450, 390]) {
  test(`IDP toolbox, material, drawing and history at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const profile = { playerId: "p1", playerName: "Ashley Sanchez" };
    const interventions = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/__idp-tools", (route) => route.fulfill({ contentType: "text/html", body: '<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-planner-overrides.css"><link rel="stylesheet" href="/src/modules/session-planner/session-planner-tacticalboard.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body><main id="idpWorkspace"></main></body></html>' }));
    await page.route("**/api/idp**", (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        expect(body.action).toBe("create-intervention");
        const intervention = { ...body.intervention, id: "exercise-1", rowVersion: 1 };
        interventions.push(intervention);
        return route.fulfill({ json: { intervention } });
      }
      const dashboard = new URL(req.url()).searchParams.get("action") === "dashboard";
      return route.fulfill({ json: dashboard ? { players: [{ profile }] } : { profile, interventions } });
    });
    await page.goto("/__idp-tools");
    await page.evaluate(async () => {
      const idp = await import("/src/modules/idp/index.mjs");
      const root = document.getElementById("idpWorkspace");
      for (const [event, handler] of [["click", idp.handleClick], ["input", idp.handleInput], ["change", idp.handleChange], ["submit", idp.handleSubmit]]) root.addEventListener(event, handler);
      idp.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => true });
    });
    await page.locator('[data-idp-player="p1"]').click();
    await page.locator('.idp-profile-menu [data-idp-profile-view="player-board"]').click();
    await page.locator("[data-idp-board-new]").click();
    const modal = page.getByRole("dialog", { name: "IDP Player Board", exact: true });
    const canvas = modal.locator("[data-session-tactical-canvas]");
    await expect(modal).toBeVisible();
    await modal.getByRole("tab", { name: "Players", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(modal.getByRole("tab", { name: "Equipment", exact: true })).toBeFocused();
    await expect(modal.getByRole("tab", { name: "Equipment", exact: true })).toHaveAttribute("aria-selected", "true");
    await modal.locator("[data-idp-board-title]").fill("Material and movements");
    let count = 0;
    const place = async (tool, group) => {
      await modal.getByRole("tab", { name: group, exact: true }).click();
      await modal.locator(`[data-session-tactical-tool="${tool}"]`).click();
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await canvas.dblclick({ position: { x: box.width * (.15 + (count % 4) * .2), y: box.height * (.15 + Math.floor(count / 4) * .2) } });
      count++;
      await expect(modal.locator("[data-idp-board-rendered-object-count]")).toHaveAttribute("data-idp-board-rendered-object-count", String(count));
      await expect(modal.locator("[data-session-tactical-width]")).toBeHidden();
    };
    for (const tool of ["blue-player", "red-player", "neutral-player", "ball", "coach"]) await place(tool, "Players");
    for (const tool of ["cone", "mini-goal", "big-goal", "mannequin", "pole", "gate"]) await place(tool, "Equipment");
    await modal.locator("[data-session-delete-tactical-selected]").click();
    await expect(modal.locator("[data-idp-board-rendered-object-count]")).toHaveAttribute("data-idp-board-rendered-object-count", "10");
    await modal.locator("[data-session-undo-board]").click();
    await expect(modal.locator("[data-idp-board-rendered-object-count]")).toHaveAttribute("data-idp-board-rendered-object-count", "11");
    await modal.getByRole("tab", { name: "Draw", exact: true }).click();
    for (const tool of ["arrow", "pass", "run", "line", "dashed-line", "curve", "freehand", "zone", "dashed-zone", "ellipse"]) {
      await modal.locator(`[data-session-tactical-tool="${tool}"]`).click();
      await expect(modal.locator("[data-session-tactical-width]")).toBeVisible();
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * .15, box.y + box.height * .85);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .6, box.y + box.height * .92, { steps: 8 });
      await page.mouse.up();
      count++;
      await expect(modal.locator("[data-idp-board-rendered-object-count]")).toHaveAttribute("data-idp-board-rendered-object-count", String(count));
      await modal.locator("[data-session-delete-tactical-selected]").click();
      count--;
      await expect(modal.locator("[data-idp-board-rendered-object-count]")).toHaveAttribute("data-idp-board-rendered-object-count", String(count));
    }
    await modal.locator('[data-session-tactical-tool="text"]').click();
    page.once("dialog", (dialog) => dialog.accept("Scan first"));
    await canvas.scrollIntoViewIfNeeded();
    const textBox = await canvas.boundingBox();
    await canvas.dblclick({ position: { x: textBox.width * .5, y: textBox.height * .8 } });
    await expect(modal.locator(".session-tactical-text")).toHaveText("Scan first");
    await modal.locator('[data-session-tactical-tool="remove"]').click();
    await modal.locator(".session-tactical-text").click();
    await expect(modal.locator(".session-tactical-text")).toHaveCount(0);
    await modal.locator("[data-idp-board-select-tool]").click();
    const player = modal.locator(".session-tactical-blue-player");
    await player.click();
    await expect(modal.locator("[data-idp-board-player-number]")).toBeVisible();
    await modal.locator("[data-idp-board-player-number]").fill("14");
    await modal.locator("[data-idp-board-player-number]").press("Tab");
    await expect(player).toContainText("14");
    await canvas.scrollIntoViewIfNeeded();
    const before = await player.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 20, before.y + before.height / 2 + 15, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await player.boundingBox()).x).toBeGreaterThan(before.x + 5);
    await modal.getByRole("tab", { name: "Equipment", exact: true }).click();
    await modal.locator(".session-tacticalboard-toolbox").scrollIntoViewIfNeeded();
    const layout = await modal.evaluate((node) => {
      const box = (selector) => { const r = node.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      return { toolbox: box(".session-tacticalboard-toolbox"), canvas: box(".session-tacticalboard-canvas-wrap"), inspector: box(".session-tacticalboard-inspector"), board: box(".session-visual-board-editor") };
    });
    if (width < 1120) {
      expect(layout.canvas.top).toBeGreaterThanOrEqual(layout.toolbox.bottom);
      expect(layout.inspector.top).toBeGreaterThanOrEqual(layout.canvas.bottom);
    } else {
      expect(layout.board.bottom).toBeLessThanOrEqual(layout.canvas.bottom + 1);
      expect(layout.toolbox.right).toBeLessThan(layout.canvas.left);
    }
    await page.screenshot({ path: testInfo.outputPath(`toolbox-final-${width}.png`) });
    await page.evaluate(() => document.body.classList.add("is-dark-mode"));
    await expect(modal.locator('[data-session-tactical-tool="cone"]')).toHaveCSS("background-color", "rgb(36, 43, 40)");
    await page.screenshot({ path: testInfo.outputPath(`toolbox-dark-${width}.png`) });
    await modal.locator("[data-idp-board-save]").click();
    await expect(page.locator('[data-idp-board-select="exercise-1"]')).toContainText("Material and movements");
    expect(interventions[0].boardState.tacticalElements).toHaveLength(11);
    expect(interventions[0].focusId).toBe("");
    await page.locator("[data-idp-board-open]").click();
    await expect(page.locator(".session-tactical-cone").last()).toBeVisible();
    expect(errors).toEqual([]);
  });
}
