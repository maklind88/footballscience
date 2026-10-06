import { expect, test } from "@playwright/test";

async function mountConflict(page, options = {}) {
  await page.route("**/qa/set-pieces-conflict-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><link rel="stylesheet" href="/src/modules/set-pieces-room/set-pieces-room.css"></head><body><section id="board"></section></body></html>',
  }));
  await page.goto("/qa/set-pieces-conflict-fixture");
  await page.evaluate(async (options) => {
    const { createSetPiecesRoomController } = await import("/src/modules/set-pieces-room/controller.mjs");
    const { createSetPiecePlay, normalizeSetPiecesState } = await import("/src/modules/set-pieces-room/state.mjs");
    const { createSetPiecesSaveClient } = await import("/src/modules/set-pieces-room/set-pieces-save-client.mjs");
    const { applySetPiecePlayChange } = await import("/src/modules/set-pieces-room/set-pieces-save-protocol.mjs");
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const play = createSetPiecePlay({ id: "conflict-play", title: "Corner", objective: "Baseline", context: "library" });
    let server = normalizeSetPiecesState({ plays: [play], activePlayId: play.id });
    let cached = JSON.stringify(server), revision = 1, scope = "team-a", actor = "coach-a";
    let writes = 0, refreshes = 0, resolutions = 0, release;
    const rows = new Map();
    const client = createSetPiecesSaveClient({
      getScope: () => scope,
      getLatest: async () => ({ value: JSON.stringify(server), metadata: { revision } }),
      journal: {
        put: async (row) => rows.set(row.id, clone(row)),
        list: async (scope) => [...rows.values()].filter((row) => row.scope === scope && row.status !== "applied").map(clone),
        updateStatus: async (id, scope, status) => {
          const row = rows.get(id);
          if (!row || row.scope !== scope) return false;
          row.status = status;
          return true;
        },
      },
      send: async (change) => {
        const applied = applySetPiecePlayChange(server, change);
        if (!applied.ok) return { ok: false, status: 409, payload: { conflicts: applied.conflicts } };
        server = applied.state;
        return { ok: true, payload: { metadata: { revision: ++revision },
          setPieceChange: { id: change.id, playId: change.playId, value: server.plays.find((item) => item.id === change.playId) || null } } };
      },
    });
    client.observe(cached, { revision });
    window.footballScienceCentralState = {
      getReadScope: () => scope,
      getSetPiecesSaveReviews: () => client.reviews(),
      resolveSetPiecesSaveReview: async (...args) => {
        resolutions += 1;
        if (options.pause === "resolve") await new Promise((resolve) => { release = resolve; });
        if (options.failure === "resolve") throw new Error("Test save unavailable");
        return client.resolveReview(...args);
      },
      refreshSetPiecesLocalView: async () => {
        refreshes += 1;
        if (options.pause === "refresh") await new Promise((resolve) => { release = resolve; });
        if (options.failure === "refresh") return false;
        if (options.failure === "refresh-throw") throw new Error("Test refresh unavailable");
        const view = await client.project();
        if (!client.isProjectionCurrent(view)) return false;
        cached = view.value;
        return true;
      },
    };
    const controller = createSetPiecesRoomController({
      root: document.getElementById("board"), win: window,
      getCurrentUser: () => ({ id: actor }), canEdit: () => true,
      storage: {
        getItem: (key) => key === "football-set-pieces-room-v1" ? cached : "dismissed",
        setItem: (_key, value) => {
          writes += 1;
          const previousValue = cached;
          cached = value;
          void client.stage(value, { previousValue });
        },
      },
    });
    controller.mount();
    window.conflictTest = {
      async collide() {
        server.plays[0].objective = "Team objective";
        revision += 1;
        const result = await client.replay();
        controller.setSyncStatus("issue", result.reason);
        return result.reviewRequired;
      },
      snapshot: () => ({ server, cached: JSON.parse(cached), writes, refreshes, resolutions }),
      changeScope: () => { scope = "team-b"; },
      changeActor: () => { actor = "coach-b"; },
      resume: () => release(),
      reload: () => controller.reloadFromStorage(),
    };
  }, options);
  await page.getByRole("button", { name: "Toggle details", exact: true }).click();
  await page.getByRole("textbox", { name: "Objective", exact: true }).fill("Local objective");
  await page.getByRole("textbox", { name: "Objective", exact: true }).press("Tab");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.conflictTest.collide())).toBe(true);
  await expect(page.getByRole("region", { name: "Set piece save conflicts" })).toBeVisible();
}

for (const width of [1440, 390]) {
  for (const mode of ["Keep team version", "Save mine as a copy"]) {
    test(`Set Pieces conflict recovery refreshes editor and library: ${mode}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mountConflict(page);
      await page.getByRole("button", { name: mode, exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("Team objective");
      await expect(page.getByRole("region", { name: "Set piece save conflicts" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
      await expect(page.getByRole("status")).toContainText("Saved to team");
      const isCopy = mode === "Save mine as a copy";
      const snapshot = await page.evaluate(() => window.conflictTest.snapshot());
      expect(snapshot.writes).toBe(1);
      expect(snapshot.refreshes).toBe(1);
      expect(snapshot.server.plays).toHaveLength(isCopy ? 2 : 1);
      expect(snapshot.cached.plays).toEqual(snapshot.server.plays);
      await page.getByRole("button", { name: `Library ${isCopy ? 2 : 1}`, exact: true }).click();
      await expect(page.getByRole("button", { name: /Attacking.*Corner.*library/ }).first()).toBeVisible();
      if (isCopy) {
        await page.getByRole("button", { name: /Attacking.*Corner copy.*library/ }).click();
        await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("Local objective");
      } else await page.getByRole("button", { name: "Close set piece library", exact: true }).click();
      await page.evaluate(() => window.conflictTest.reload());
      await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue(isCopy ? "Local objective" : "Team objective");
    });
  }
}

for (const failure of ["resolve", "refresh", "refresh-throw"]) {
  test(`Set Pieces conflict recovery does not report success when ${failure} fails`, async ({ page }) => {
    await mountConflict(page, { failure });
    await page.getByRole("button", { name: "Keep team version", exact: true }).click();
    await expect(page.locator(".spr-save-state.is-error")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("Local objective");
    await expect(page.locator("#board")).not.toHaveAttribute("inert", "");
    expect((await page.evaluate(() => window.conflictTest.snapshot())).writes).toBe(1);
    if (failure === "resolve") await expect(page.getByRole("button", { name: "Keep team version" })).toBeEnabled();
  });
}

for (const pause of ["resolve", "refresh"]) {
  for (const change of ["changeActor", "changeScope"]) {
    test(`Set Pieces conflict recovery ignores late ${pause} after ${change}`, async ({ page }) => {
      await mountConflict(page, { pause });
      await page.getByRole("button", { name: "Keep team version", exact: true }).click();
      await expect(page.locator("#board")).toHaveAttribute("inert", "");
      await expect.poll(() => page.evaluate((pause) => {
        const snapshot = window.conflictTest.snapshot();
        return pause === "resolve" ? snapshot.resolutions : snapshot.refreshes;
      }, pause)).toBe(1);
      await page.evaluate((change) => { window.conflictTest[change](); window.conflictTest.resume(); }, change);
      await expect(page.locator("#board")).not.toHaveAttribute("inert", "");
      await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("Local objective");
      await expect(page.getByRole("status")).not.toContainText("Saved to team");
    });
  }
}
