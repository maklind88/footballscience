import { expect, test } from "@playwright/test";

async function mount(page, { editable = true, occupied = false, rejectFirst = false, delay = 0 } = {}) {
  const profile = { playerId: "p1", playerName: "Test Player", position: "CMF", role: "8", status: "active" };
  const focuses = [{ id: "existing", title: "Existing individual focus", description: "Keep this coaching content.", focusLevel: "main", category: "Technical", status: "Active", rowVersion: 2 }];
  if (occupied) focuses.push(...["secondary", "personal"].map((focusLevel) => ({ id: focusLevel, title: focusLevel, focusLevel, status: "Active" })));
  const writes = [];
  await page.route("**/__idp-game-model-test", (route) => route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body style="margin:0"><main id="idpWorkspace"></main></body></html>' }));
  await page.route("**/api/idp**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      const action = new URL(req.url()).searchParams.get("action");
      return route.fulfill({ json: action === "dashboard" ? { players: [{ profile, focus: focuses[0] }] } : { profile, focuses } });
    }
    const body = req.postDataJSON(); writes.push(body);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (rejectFirst && writes.length === 1) return route.fulfill({ status: 409, json: { reason: "Focus changed elsewhere. Reload and try again." } });
    expect(body.action).toBe("create-focus");
    const focus = { ...body.focus, id: "new-action-focus", rowVersion: 1 };
    focuses.push(focus);
    return route.fulfill({ json: { focus } });
  });
  const boot = async () => {
    await page.goto("/__idp-game-model-test");
    await page.evaluate(async (editable) => {
      const module = await import("/src/modules/idp/index.mjs");
      const root = document.querySelector("#idpWorkspace");
      for (const [type, handler] of [["click", module.handleClick], ["change", module.handleChange], ["input", module.handleInput], ["submit", module.handleSubmit]]) root.addEventListener(type, handler);
      module.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => editable });
    }, editable);
    await page.locator('[data-idp-player="p1"]').click();
  };
  await boot();
  return { writes, focuses, boot };
}

async function chooseAction(page) {
  await page.getByRole("button", { name: "Choose individual action", exact: true }).click();
  await page.locator('[data-idp-action-select="subPhaseId"]').selectOption("creating-phase");
  await page.locator('[data-idp-action-select="positionId"]').selectOption("CMF-8");
  await expect(page.locator(".idp-gm-card")).toContainText("Countermovement");
}

for (const width of [1440, 390]) {
  test(`select, adapt, save and reload without replacing existing focus at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    const { writes, focuses, boot } = await mount(page, { delay: 300 });
    await chooseAction(page);
    expect(writes).toHaveLength(0);
    await expect(page.locator(".idp-gm-card p").first()).toHaveCSS("text-transform", "none");
    await testInfo.attach("individual-actions.png", { body: await page.getByRole("dialog").screenshot({ path: testInfo.outputPath(`dialog-${writes.length}-${await page.locator("[data-idp-game-model-save]").count()}.png`) }), contentType: "image/png" });
    await page.locator("[data-idp-use-action]").click();
    const form = page.locator("[data-idp-game-model-save]");
    await expect(form.locator('[name="focusLevel"]')).toHaveValue("secondary");
    await expect(form.locator('[name="description"]')).toContainText("Creating Phase · CMF – 8");
    await form.locator('[name="title"]').fill("Find a new passing line before receiving");
    await form.locator('[name="reviewDate"]').fill("2026-12-08");
    const overflow = await page.getByRole("dialog").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflow).toBe(false);
    await testInfo.attach("player-focus.png", { body: await page.getByRole("dialog").screenshot({ path: testInfo.outputPath(`dialog-${writes.length}-${await page.locator("[data-idp-game-model-save]").count()}.png`) }), contentType: "image/png" });
    await form.getByRole("button", { name: "Save Player Focus", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].focus).toMatchObject({ playerId: "p1", focusLevel: "secondary", linkedPhase: "In Possession", linkedSubPhase: "Creating Phase", reviewDate: "2026-12-08" });
    expect(writes[0].focus).not.toHaveProperty("focusId");
    expect(focuses[0].description).toBe("Keep this coaching content.");
    await boot();
    await expect(page.locator(".idp-focus-card")).toHaveCount(2);
    await expect(page.locator('[data-idp-select-focus="new-action-focus"]')).toContainText("Find a new passing line before receiving");
    await expect(page.locator('[data-idp-select-focus="new-action-focus"]')).toContainText("Arrive where you can receive facing the next action.");
    expect(errors).toEqual([]);
  });
}

test("cancel does not write; changing selections filters actions; keyboard closes and restores focus", async ({ page }) => {
  const { writes } = await mount(page);
  await chooseAction(page);
  await page.locator('[data-idp-action-select="positionId"]').selectOption("CB");
  await expect(page.locator(".idp-gm-card")).toContainText("Change Corridor");
  await expect(page.locator(".idp-gm-card")).not.toContainText("Countermovement");
  await page.locator('[data-idp-action-select="subPhaseId"]').selectOption("box-defending");
  await expect(page.locator(".idp-gm-card")).toContainText("Attack the ball");
  await page.locator("[data-idp-use-action]").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose individual action", exact: true })).toBeFocused();
  expect(writes).toHaveLength(0);
});

test("write errors retain the customised draft and allow an explicit retry", async ({ page }) => {
  const { writes } = await mount(page, { rejectFirst: true });
  await chooseAction(page);
  await page.locator("[data-idp-use-action]").click();
  const form = page.locator("[data-idp-game-model-save]");
  await form.locator('[name="title"]').fill("My coaching focus");
  await form.locator('[name="description"]').fill("My specific coaching instruction");
  await form.getByRole("button", { name: "Save Player Focus" }).click();
  await expect(form.getByRole("alert")).toContainText("Focus changed elsewhere");
  await expect(form.locator('[name="title"]')).toHaveValue("My coaching focus");
  await expect(form.locator('[name="description"]')).toHaveValue("My specific coaching instruction");
  await form.getByRole("button", { name: "Save Player Focus" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toHaveLength(2);
});

test("occupied priorities cannot be overwritten by the action picker", async ({ page }) => {
  const { writes } = await mount(page, { occupied: true });
  await chooseAction(page);
  await page.locator("[data-idp-use-action]").click();
  await expect(page.getByRole("button", { name: "Save Player Focus" })).toBeDisabled();
  await expect(page.locator(".idp-game-model")).toContainText("All three focus priorities are in use");
  expect(writes).toHaveLength(0);
});

test("read-only viewers cannot open the creation flow", async ({ page }) => {
  const { writes } = await mount(page, { editable: false });
  await expect(page.locator('[data-idp-action="game-model"]')).toHaveCount(0);
  expect(writes).toHaveLength(0);
});
