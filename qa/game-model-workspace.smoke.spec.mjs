import { expect, test } from "@playwright/test";

const teamId = "361ac054-6a22-422e-acb8-ff9cbd423f28";
const newActionId = "d28868d7-a735-47c4-a8c6-a39c8491efcb";
const starterItems = [
  {
    id: "team-build-up-keep-control", kind: "team-principle", subPhaseId: "build-up",
    title: "Keep control through pressure", when: "", detail: "", positionIds: [], revision: 0, archived: false,
  },
  {
    id: "mini-build-up-third-player", kind: "mini-game-principle", subPhaseId: "build-up",
    title: "Find the Third", when: "", detail: "", positionIds: [], revision: 0, archived: false,
  },
  {
    id: "build-up-6-find-the-free-third-player", kind: "individual-action", subPhaseId: "build-up",
    title: "Find the free third player", when: "You receive with pressure close to you.",
    detail: "Adapt the first touch to play forward.", positionIds: ["CMF-6"], revision: 0, archived: false,
  },
  {
    id: "build-up-cb-open-line", kind: "individual-action", subPhaseId: "build-up",
    title: "Show a clear passing line", when: "The ball holder looks inside.",
    detail: "Move outside the cover shadow.", positionIds: ["CB"], revision: 0, archived: false,
  },
];

async function mockCatalog(page, { canEdit = true } = {}) {
  const rows = structuredClone(starterItems);
  const writes = [];
  await page.route("**/api/game-model**", async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer qa-game-model-token");
    if (request.method() === "GET") {
      return route.fulfill({ json: { ok: true, teamId, canEdit, items: rows } });
    }
    expect(request.method()).toBe("POST");
    const payload = request.postDataJSON();
    writes.push(payload);
    expect(payload.teamId).toBe(teamId);
    const existing = rows.find((row) => row.id === payload.item.id);
    expect(payload.item.revision ?? 0).toBe(existing?.revision ?? 0);
    const item = {
      ...existing, ...payload.item,
      id: payload.item.id || newActionId,
      archived: payload.item.archived ?? existing?.archived ?? false,
      revision: (existing?.revision ?? 0) + 1,
    };
    if (existing) Object.assign(existing, item);
    else rows.push(item);
    return route.fulfill({ json: { ok: true, item } });
  });
  return { writes };
}

async function mockIdpPlayer(page) {
  const profile = { playerId: "qa-game-model-player", playerName: "Test Player", position: "CMF", role: "6", status: "active" };
  await page.route("**/api/idp**", (route) => {
    const request = route.request();
    expect(request.method()).toBe("GET");
    const action = new URL(request.url()).searchParams.get("action");
    return route.fulfill({ json: action === "dashboard" ? { players: [{ profile }] } : { profile, focuses: [] } });
  });
}

async function selectGameModel(page) {
  const nav = page.getByRole("navigation", { name: "Platform sections" });
  const entry = nav.getByRole("button", { name: "Game Model", exact: true });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(entry).toHaveClass(/is-active/);
  const workspace = page.locator('[data-workspace-view="game-model"].is-active');
  await expect(workspace.getByRole("heading", { name: "Game Model", exact: true })).toBeVisible();
  return workspace;
}

async function openGameModel(page) {
  // Enter through Home so the fixture token is installed before Game Model fetches.
  await page.goto("/?workspace=home", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__footballScienceAppReady && document.body.dataset.appReady === "true");
  await page.evaluate(() => {
    window.platformAuthStore.getAccessToken = async () => "qa-game-model-token";
  });
  const dashboardDismiss = page.locator(
    "#dashboardModalRoot button:is([data-dashboard-news-dismiss], [data-dashboard-tutorial-never], [data-dashboard-tutorial-save]):visible",
  ).first();
  if (await dashboardDismiss.isVisible()) await dashboardDismiss.click();

  return selectGameModel(page);
}

async function chooseBuildUp(workspace) {
  await workspace.locator('[data-gm-subphase="build-up"]').click();
}

async function showActions(workspace) {
  await workspace.getByRole("button", { name: "Individual Actions", exact: true }).click();
}

test("main navigation opens Game Model and staff can create, edit and archive an action", async ({ page }) => {
  const { writes } = await mockCatalog(page);
  await mockIdpPlayer(page);
  const workspace = await openGameModel(page);
  await chooseBuildUp(workspace);
  await workspace.getByRole("button", { name: "Team Principles", exact: true }).click();
  await expect(workspace.getByText("Keep control through pressure", { exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "Mini-Game Principles", exact: true }).click();
  await expect(workspace.getByText("Find the Third", { exact: true })).toBeVisible();

  await showActions(workspace);
  await workspace.getByRole("combobox", { name: "Position", exact: true }).selectOption("CMF-6");
  await expect(workspace.getByText("Find the free third player", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Show a clear passing line", { exact: true })).toHaveCount(0);

  const actionTitle = "Create a forward angle";
  await workspace.getByRole("button", { name: "Add action", exact: true }).click();
  const editor = workspace.locator("[data-gm-editor]");
  await editor.locator('[name="title"]').fill(actionTitle);
  await editor.locator('[name="when"]').fill("The pass into midfield is available.");
  await editor.locator('[name="detail"]').fill("Show on the outside shoulder.");
  await editor.locator('[name="positionIds"][value="CMF-6"]').check();
  await editor.getByRole("button", { name: "Save action", exact: true }).click();
  await expect(workspace.getByText(actionTitle, { exact: true })).toBeVisible();
  expect(writes[0].item).toMatchObject({
    kind: "individual-action", subPhaseId: "build-up", title: actionTitle, positionIds: ["CMF-6"],
    when: "The pass into midfield is available.", detail: "Show on the outside shoulder.",
  });

  const editedTitle = "Create a clearer forward angle";
  await workspace.getByRole("button", { name: `Edit ${actionTitle}`, exact: true }).click();
  await editor.locator('[name="title"]').fill(editedTitle);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(workspace.getByText(editedTitle, { exact: true })).toBeVisible();
  expect(writes[1].item).toMatchObject({
    id: writes[0].item.id || newActionId, revision: 1, title: editedTitle,
  });

  const reopened = await openGameModel(page);
  await chooseBuildUp(reopened);
  await showActions(reopened);
  await expect(reopened.getByText(editedTitle, { exact: true })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Platform sections" });
  await nav.locator('[data-open-workspace="idp"]').click();
  const idp = page.locator('[data-workspace-view="idp"].is-active');
  await idp.locator('[data-idp-player="qa-game-model-player"]').click();
  await idp.getByRole("button", { name: "Add focus", exact: true }).click();
  const focus = idp.locator("[data-idp-create-focus]");
  await focus.getByText("Use Game Model action", { exact: true }).click();
  await focus.getByRole("combobox", { name: "Sub-Phase", exact: true }).selectOption("build-up");
  await focus.getByRole("combobox", { name: "Position", exact: true }).selectOption("CMF-6");
  await expect(focus.getByRole("button", { name: `Use action: ${editedTitle}`, exact: true })).toBeVisible();
  await focus.getByRole("button", { name: "Cancel", exact: true }).click();

  await selectGameModel(page);
  await chooseBuildUp(reopened);
  await showActions(reopened);
  await reopened.getByRole("button", { name: `Archive ${editedTitle}`, exact: true }).click();
  await page.locator("[data-platform-confirm-ok]").click();
  await expect(reopened.getByText(editedTitle, { exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(3);
  expect(writes[2].item).toMatchObject({
    id: writes[0].item.id || newActionId, revision: 2, archived: true,
  });
});

test("Game Model read-only access still shows actions and exposes no write controls", async ({ page }) => {
  const { writes } = await mockCatalog(page, { canEdit: false });
  const workspace = await openGameModel(page);
  await chooseBuildUp(workspace);
  await showActions(workspace);
  await expect(workspace.getByText("Find the free third player", { exact: true })).toBeVisible();
  await expect(workspace.locator("[data-gm-add]")).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: /^(Edit|Archive) / })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("staff can add and edit both principle types from the same sub-phase", async ({ page }) => {
  const { writes } = await mockCatalog(page);
  const workspace = await openGameModel(page);
  await chooseBuildUp(workspace);

  for (const [section, kind, title] of [
    ["Team Principles", "team-principle", "Create a free passing lane"],
    ["Mini-Game Principles", "mini-game-principle", "Move as the pass travels"],
  ]) {
    await workspace.getByRole("button", { name: section, exact: true }).click();
    await workspace.getByRole("button", { name: "Add principle", exact: true }).click();
    const editor = workspace.getByRole("form", { name: "Add principle" });
    await editor.getByLabel("Principle", { exact: true }).fill(title);
    await editor.getByLabel("Detail", { exact: true }).fill("Make the next pass possible.");
    await editor.getByRole("button", { name: "Save principle", exact: true }).click();
    await expect(workspace.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const created = writes.at(-1).item;
    expect(created).toMatchObject({ kind, title, subPhaseId: "build-up", positionIds: [], revision: 0 });

    await workspace.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
    const edit = workspace.getByRole("form", { name: "Edit principle" });
    await edit.locator('[name="detail"]').fill("Show before the ball arrives.");
    await edit.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(workspace.getByText("Show before the ball arrives.", { exact: true })).toBeVisible();
    expect(writes.at(-1).item).toMatchObject({ id: created.id, kind, revision: 1, detail: "Show before the ball arrives." });
  }
  expect(writes).toHaveLength(4);
});
