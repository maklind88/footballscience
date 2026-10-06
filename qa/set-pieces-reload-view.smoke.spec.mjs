import { expect, test } from "@playwright/test";
import { installSetPiecesCentralFixture, playState, readSetPiecesRecovery, setPiecesKey, waitForSetPieces } from "./helpers/set-pieces-central-fixture.mjs";

for (const width of [1440, 390]) {
  test(`Set Pieces shows fresh team data after reload without consuming its older recovery copy at ${width}px`, async ({ page, baseURL }) => {
    const seed = playState("Retain this old draft", "old-recovery-play");
    const server = await installSetPiecesCentralFixture(page, { seed, viewport: { width, height: 900 } });
    await page.goto(`${baseURL}/?workspace=set-pieces-room`);
    await waitForSetPieces(page);
    await expect(page.getByRole("textbox", { name: "Set piece", exact: true })).toHaveValue("shared-play");
    const recovery = await readSetPiecesRecovery(page);
    expect(recovery.disk).toBe(JSON.stringify(seed));
    expect(recovery.manifest.pendingCentralSync).toBe(true);
    expect(recovery.archives).toContain(JSON.stringify(seed));

    server.state = playState("A colleague updated it", "new-team-play");
    server.revision++;
    await page.reload();
    await waitForSetPieces(page);
    await expect(page.getByRole("textbox", { name: "Set piece", exact: true })).toHaveValue("new-team-play");
    if (width < 600) await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".spr-library-trigger").click();
    await expect(page.getByRole("button", { name: /Attacking.*new-team-play/ })).toBeVisible();
    expect(await readSetPiecesRecovery(page)).toEqual(recovery);
    expect(server.writes.filter((body) => body.key === setPiecesKey)).toEqual([]);
  });
}

test("Set Pieces reload overlays its pending draft without hiding a colleague's new play", async ({ page }) => {
  const server = await installSetPiecesCentralFixture(page);
  server.denyWrites = true;
  await page.goto("/?workspace=set-pieces-room");
  await waitForSetPieces(page);
  await page.getByRole("button", { name: "Toggle details", exact: true }).click();
  await page.getByRole("textbox", { name: "Objective", exact: true }).fill("Offline local draft");
  await page.getByRole("textbox", { name: "Objective", exact: true }).press("Tab");
  await expect.poll(() => server.writes.filter((body) => body.key === setPiecesKey).length).toBeGreaterThan(0);
  server.state.plays.push(playState("Colleague's new routine", "colleague-play").plays[0]);
  server.revision++;
  await page.reload();
  await waitForSetPieces(page);
  await page.getByRole("button", { name: "Toggle details", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("Offline local draft");
  await page.locator(".spr-library-trigger").click();
  await expect(page.getByRole("button", { name: /Attacking.*colleague-play.*library/ })).toBeVisible();
  expect(server.state.plays[0].objective).toBe("Team version");
});

test("Set Pieces does not consume a legacy draft when the recovery journal is unavailable", async ({ page }) => {
  const seed = playState("Keep this draft", "old-recovery-play");
  const server = await installSetPiecesCentralFixture(page, { seed, journalDenied: true });
  await page.goto("/?workspace=set-pieces-room");
  await expect.poll(() => page.evaluate(() => window.footballScienceCentralState?.getStatus()?.lastError)).toContain("QA journal unavailable");
  expect(await page.evaluate((key) => window.__setPiecesNativeGet.call(localStorage, key), setPiecesKey)).toBe(JSON.stringify(seed));
  expect(await page.evaluate(() => window.footballScienceCentralState.isHydrated())).toBe(false);
  expect(server.writes.filter((body) => body.key === setPiecesKey)).toEqual([]);
});

for (const change of ["actor", "organization", "team"]) {
  test(`Set Pieces reload never carries another ${change}'s journal into the current library`, async ({ page }) => {
    const server = await installSetPiecesCentralFixture(page);
    server.denyWrites = true;
    await page.goto("/?workspace=set-pieces-room");
    await waitForSetPieces(page);
    const oldScope = await page.evaluate(async (key) => {
      const bridge = window.footballScienceCentralState;
      const previousValue = localStorage.getItem(key);
      const draft = JSON.parse(previousValue);
      draft.plays[0].objective = "Private old scope draft";
      const result = await bridge.stageSetPiecesWrite(JSON.stringify(draft), { previousValue });
      if (!result.ok) throw new Error(result.reason);
      return JSON.stringify(["set-pieces-actor-team-v1", ...JSON.parse(bridge.getReadScope()).slice(0, 4)]);
    }, setPiecesKey);
    if (change === "actor") server.actor.id = "other-coach";
    if (change === "organization") server.actor.app_metadata.organizationId = "other-organization";
    if (change === "team") server.actor.teamId = "other-team";
    server.state = playState("New scope's objective");
    server.revision++;
    server.writes.length = 0;
    await page.reload();
    await waitForSetPieces(page);
    await page.getByRole("button", { name: "Toggle details", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("New scope's objective");
    const retained = await page.evaluate(async (scope) => {
      const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
      const journal = createOfflineOperationJournal({ databaseName: "football-science-set-pieces-saves-v1" });
      const rows = await journal.list(scope);
      await journal.close();
      return rows.map((row) => row.payload.change.after.objective);
    }, oldScope);
    expect(retained).toContain("Private old scope draft");
    expect(server.writes.filter((body) => body.key === setPiecesKey)).toEqual([]);
  });
}

for (const absent of [false, true]) {
  test(`Set Pieces keeps a foreign recovery copy private with an ${absent ? "absent" : "existing"} team library`, async ({ page }) => {
    const seed = playState("Other coach's private draft", "private-recovery-play");
    const server = await installSetPiecesCentralFixture(page, { seed, principalScope: "other-coach-scope" });
    server.absent = absent;
    await page.goto("/?workspace=set-pieces-room");
    await waitForSetPieces(page);
    if (absent) await expect(page.getByRole("button", { name: "Create set piece", exact: true })).toBeVisible();
    else await expect(page.getByRole("textbox", { name: "Set piece", exact: true })).toHaveValue("shared-play");
    expect(await page.evaluate((key) => localStorage.getItem(key), setPiecesKey)).not.toContain("private-recovery-play");
    const recovery = await readSetPiecesRecovery(page);
    expect(recovery.disk).toBe(JSON.stringify(seed));
    expect(recovery.manifest.pendingCentralSync).toBe(true);
    expect(server.writes.filter((body) => body.key === setPiecesKey)).toEqual([]);
  });

  test(`Set Pieces does not resurrect recovery plays when the server library is ${absent ? "absent" : "empty"}`, async ({ page }) => {
    const seed = playState("Retain only as recovery", "old-recovery-play");
    const server = await installSetPiecesCentralFixture(page, { seed });
    server.state = { schemaVersion: 4, plays: [], activePlayId: "" };
    server.absent = absent;
    await page.goto("/?workspace=set-pieces-room");
    await waitForSetPieces(page);
    await expect(page.getByRole("textbox", { name: "Set piece", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create set piece", exact: true })).toBeVisible();
    const recovery = await readSetPiecesRecovery(page);
    expect(recovery.disk).toBe(JSON.stringify(seed));
    expect(recovery.manifest.pendingCentralSync).toBe(true);
    expect(recovery.archives).toContain(JSON.stringify(seed));
    expect(server.writes.filter((body) => body.key === setPiecesKey || body.entries?.[setPiecesKey])).toEqual([]);
  });
}

for (const mode of ["Keep team version", "Save mine as a copy"]) {
  test(`Set Pieces real boot retains conflict resolution after a full reload: ${mode}`, async ({ page }) => {
    const seed = playState("Old recovery", "old-recovery-play");
    const server = await installSetPiecesCentralFixture(page, { seed });
    server.denyWrites = true;
    await page.goto("/?workspace=set-pieces-room");
    await waitForSetPieces(page);
    await page.getByRole("button", { name: "Toggle details", exact: true }).click();
    await page.getByRole("textbox", { name: "Objective", exact: true }).fill("Local objective");
    await page.getByRole("textbox", { name: "Objective", exact: true }).press("Tab");
    await expect.poll(() => server.writes.filter((body) => body.key === setPiecesKey).length).toBeGreaterThan(0);
    server.state.plays[0].objective = "Team objective";
    server.revision++;
    server.denyWrites = false;
    await page.reload();
    await waitForSetPieces(page);
    await expect(page.getByRole("region", { name: "Set piece save conflicts" })).toBeVisible();
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByRole("region", { name: "Set piece save conflicts" })).toHaveCount(0);
    const isCopy = mode === "Save mine as a copy";
    await expect.poll(() => server.state.plays.length).toBe(isCopy ? 2 : 1);
    expect(server.state.plays.find((play) => play.id === "shared-play").objective).toBe("Team objective");
    if (isCopy) expect(server.state.plays.find((play) => play.id !== "shared-play").objective).toBe("Local objective");
    await page.reload();
    await waitForSetPieces(page);
    await page.getByRole("button", { name: "Toggle details", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("Team objective");
    await page.locator(".spr-library-trigger").click();
    await expect(page.getByRole("button", { name: /Attacking.*shared-play.*library/ })).toHaveCount(isCopy ? 2 : 1);
    if (isCopy) {
      await page.getByRole("button", { name: /Attacking.*shared-play copy.*library/ }).click();
      await expect(page.getByRole("textbox", { name: "Objective", exact: true })).toHaveValue("Local objective");
    }
    expect((await readSetPiecesRecovery(page)).archives).toContain(JSON.stringify(seed));
    expect(server.writes.filter((body) => body.key === setPiecesKey).every((body) => body.setPieceChange)).toBe(true);
    expect(server.state.plays.some((play) => play.id === "old-recovery-play")).toBe(false);
  });
}
