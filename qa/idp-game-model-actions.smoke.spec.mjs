import { expect, test } from "@playwright/test";
import { resolveGameModelAction } from "../src/modules/idp/game-model/action-selection.mjs";

const actionId = "creating-phase-8-use-countermovement-to-find-a-new-passing-line";
const positionId = "CMF-8";
const baselineText = "Keep the receiving cue.\n\nReview this alongside the exercise.";

async function mount(page, { editable = true, occupied = false, failFirst = false } = {}) {
  const profile = { playerId: "p1", playerName: "Test Player", position: "CMF", role: "8", status: "active" };
  const focuses = [{ id: "existing", title: "Receive under pressure", description: baselineText, focusLevel: "main", category: "Technical", ownerId: "coach1", reviewDate: "2026-12-08", status: "Active", rowVersion: 5, metadata: { prior: "retained" } }];
  if (occupied) focuses.push(...["secondary", "personal"].map((focusLevel) => ({ id: focusLevel, title: focusLevel, focusLevel, status: "Active" })));
  const related = {
    goals: [{ id: "goal1", focusId: "existing", title: "See a forward pass" }],
    evidence: [{ id: "obs1", focusId: "existing", note: "Existing observation" }],
    interventions: [{ id: "exercise1", focusId: "existing", title: "Existing exercise" }],
    reviews: [{ id: "review1", focusId: "existing", progressSummary: "Existing review" }],
    clipBank: [{ id: "clip1", clipInstanceId: "clip1", linkedFocusId: "existing", status: "Linked To Focus" }],
  };
  const writes = [];
  await page.route("**/__idp-game-model-test", (route) => route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body style="margin:0"><main id="idpWorkspace"></main></body></html>' }));
  await page.route("**/api/idp**", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      const action = new URL(request.url()).searchParams.get("action");
      return route.fulfill({ json: action === "dashboard" ? { players: [{ profile, focus: focuses[0] }] } : { profile, focuses, ...related } });
    }
    const body = request.postDataJSON();
    writes.push(body);
    if (failFirst && writes.length === 1) return route.fulfill({ status: 409, json: { reason: "Focus changed elsewhere. Reload and try again." } });
    const { gameModelActionId, gameModelPositionId, rowVersion, ...changes } = body.focus;
    const editing = body.action === "update-focus";
    const row = editing ? focuses.find((item) => item.id === changes.id) : { id: "new-action-focus", metadata: {} };
    if (editing) expect(Number(rowVersion)).toBe(row.rowVersion);
    else expect(body.action).toBe("create-focus");
    Object.assign(row, changes, { rowVersion: (row.rowVersion || 0) + 1 });
    if (gameModelActionId) row.metadata.game_model_action = resolveGameModelAction(gameModelActionId, gameModelPositionId);
    else if (gameModelActionId === "") delete row.metadata.game_model_action;
    if (!editing) focuses.push(row);
    return route.fulfill({ json: { focus: row } });
  });
  async function boot() {
    await page.goto("/__idp-game-model-test");
    await page.evaluate(async (canEdit) => {
      const module = await import("/src/modules/idp/index.mjs");
      const root = document.querySelector("#idpWorkspace");
      for (const [type, handler] of [["click", module.handleClick], ["change", module.handleChange], ["input", module.handleInput], ["submit", module.handleSubmit]]) root.addEventListener(type, handler);
      module.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => canEdit });
    }, editable);
    await page.locator('[data-idp-player="p1"]').click();
  }
  await boot();
  return { writes, focuses, boot };
}

async function chooseCreatingAction(form, permission) {
  await form.getByText(permission, { exact: true }).click();
  await form.getByRole("combobox", { name: "Sub-Phase", exact: true }).selectOption("creating-phase");
  await expect(form.getByRole("combobox", { name: "Position", exact: true })).toHaveValue(positionId);
  await form.getByRole("button", { name: /action: Use Countermovement/ }).click();
  await expect(form.locator(".idp-gm-summary")).toContainText("Creating Phase · CMF – 8");
}

test("Add focus retains a coach’s draft while selecting a Game Model action", async ({ page }) => {
  const { writes } = await mount(page);
  await page.getByRole("button", { name: "Add focus", exact: true }).click();
  const form = page.locator("[data-idp-create-focus]");
  await form.getByLabel("Focus", { exact: true }).fill("Arrive facing the next action");
  await form.getByLabel("Focus areas").fill("Keep my coaching cue.\nUse it on Thursday.");
  await form.getByLabel("Category").selectOption("Technical");
  await form.getByLabel("Review date").fill("2026-12-12");
  await chooseCreatingAction(form, "Use Game Model action");
  expect(writes).toHaveLength(0);
  await expect(form.getByLabel("Focus", { exact: true })).toHaveValue("Arrive facing the next action");
  await expect(form.getByLabel("Focus areas")).toHaveValue("Keep my coaching cue.\nUse it on Thursday.");
  await form.getByRole("button", { name: "Save focus", exact: true }).click();
  await expect(page.locator("#idp-focus-detail-new-action-focus .idp-gm-summary")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ action: "create-focus", focus: { gameModelActionId: actionId, gameModelPositionId: positionId, category: "Technical", reviewDate: "2026-12-12", focusLevel: "secondary" } });
  await expect(page.locator('[data-idp-select-focus="existing"]')).toContainText("Receive under pressure");
});

test("Edit focus links and reloads on mobile with every priority occupied", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { writes, focuses, boot } = await mount(page, { occupied: true });
  await expect(page.getByRole("button", { name: "Add focus", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit focus: Receive under pressure" }).click();
  const form = page.locator("[data-idp-create-focus]");
  await chooseCreatingAction(form, "Link Game Model action");
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("mobile-edit-focus.png") });
  await form.getByRole("button", { name: "Save focus", exact: true }).click();
  await expect(page.locator("#idp-focus-detail-existing .idp-gm-summary")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toEqual({ action: "update-focus", focus: { id: "existing", focusId: "existing", playerId: "p1", rowVersion: "5", gameModelActionId: actionId, gameModelPositionId: positionId } });
  expect(focuses[0]).toMatchObject({ description: baselineText, ownerId: "coach1", reviewDate: "2026-12-08", metadata: { prior: "retained" } });
  await boot();
  await page.locator('[data-idp-select-focus="existing"]').click();
  const card = page.locator("#idp-focus-detail-existing");
  for (const value of ["When", "Action", "Detail", "See a forward pass", "Existing observation", "Existing exercise"]) await expect(card).toContainText(value);
  await expect(page.locator(".idp-focus-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Edit focus: Receive under pressure" }).click();
  await form.getByRole("button", { name: "Remove action", exact: true }).click();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(1);
  await expect(card.locator(".idp-gm-summary")).toBeVisible();
});

test("a stale edit retains the coach’s draft and selected action", async ({ page }) => {
  const { writes } = await mount(page, { failFirst: true });
  await page.getByRole("button", { name: "Edit focus: Receive under pressure" }).click();
  const form = page.locator("[data-idp-create-focus]");
  await form.getByLabel("Focus areas").fill("My updated instruction");
  await chooseCreatingAction(form, "Link Game Model action");
  await form.getByRole("button", { name: "Save focus", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Focus changed elsewhere");
  await expect(form.getByLabel("Focus areas")).toHaveValue("My updated instruction");
  await expect(form.locator(".idp-gm-summary")).toContainText("Countermovement");
  expect(writes).toHaveLength(1);
});

test("read-only IDP shows focus cards without editing or picking an action", async ({ page }) => {
  await mount(page, { editable: false });
  await expect(page.locator('[data-idp-select-focus="existing"]')).toBeVisible();
  await expect(page.locator("[data-idp-edit-focus], [data-idp-game-model]")).toHaveCount(0);
});
