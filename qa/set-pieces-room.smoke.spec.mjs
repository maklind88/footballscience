import { expect, test } from "@playwright/test";

async function waitForPlatformShell(page) {
  await page.waitForFunction(
    () => Boolean(
      window.__footballScienceAppReady &&
      document.body?.dataset.appReady === "true" &&
      document.getElementById("hubShell") &&
      !document.getElementById("hubShell").hidden &&
      !document.body.classList.contains("is-booting")
    ),
    null,
    { timeout: 20_000 }
  );
}

async function openSetPiecesRoom(page) {
  const modal = page.locator("#dashboardIntroModal, .dashboard-intro-modal, [data-dashboard-intro-modal]").first();
  if (await modal.isVisible().catch(() => false)) {
    const dismiss = modal.getByRole("button", { name: /close|dismiss|skip|later|continue|got it/i }).first();
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    else await page.keyboard.press("Escape");
  }
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("platform:open-workspace", { detail: { workspaceId: "set-pieces-room" } }));
  });
  await expect(page.locator('[data-workspace-view="set-pieces-room"].is-active')).toBeVisible();
  await expect(page.locator("[data-set-pieces-room]")).toBeVisible();
}

test("Set Pieces Room builds, persists and plays a phased opponent response", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const isFreshTestRun = !window.sessionStorage.getItem("set-pieces-room-smoke-seeded");
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [
        { id: "player-alex", name: "Alex Example", position: "Forward" },
        { id: "player-beth", name: "Beth Miller", position: "Midfielder" },
      ],
    }));
    if (isFreshTestRun) {
      window.localStorage.removeItem("football-set-pieces-room-v1");
      window.sessionStorage.setItem("set-pieces-room-smoke-seeded", "true");
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);

  await expect(page.getByRole("heading", { name: "Set Pieces Room" })).toBeVisible();
  await expect(page.locator(".spr-header-team-mark")).toBeVisible();
  await expect(page.locator(".spr-header-team-name")).not.toHaveText("Football Science");
  await page.getByRole("button", { name: "Create set piece" }).click();
  await expect(page.locator("[data-set-piece-pitch]")).toBeVisible();

  const pitch = page.locator("[data-set-piece-pitch]");
  const box = await pitch.boundingBox();
  expect(box).not.toBeNull();

  await page.locator("[data-set-piece-player-picker] summary").click();
  await page.getByRole("menuitem", { name: "Add Alex Example" }).click();
  await page.getByRole("button", { name: "Opponent" }).click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.4);
  const opponentNumber = page.getByRole("spinbutton", { name: "Number" });
  await opponentNumber.fill("12");
  await opponentNumber.press("Tab");
  const showOpponentNumber = page.getByRole("checkbox", { name: "Show number on board" });
  await showOpponentNumber.uncheck();
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveCount(0);
  await showOpponentNumber.check();
  await page.getByRole("button", { name: "Ball", exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.48);

  await expect(page.locator(".spr-board-element.is-home-player text")).toHaveText("AE");
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("12");
  await expect(page.locator(".spr-body-direction")).toHaveCount(0);
  await expect(page.locator(".spr-board-element.is-ball")).toHaveCount(1);

  await page.getByRole("button", { name: "Run" }).click();
  await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.34);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.25, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".spr-drawing.is-run")).toHaveCount(1);

  await page.getByRole("button", { name: "Duplicate current phase" }).click();
  await expect(page.locator("[data-set-piece-phase-id]")).toHaveCount(2);
  const homeMarker = page.locator(".spr-board-element.is-home-player:not(.is-ghost)");
  const markerBox = await homeMarker.boundingBox();
  expect(markerBox).not.toBeNull();
  const startCenter = { x: markerBox.x + markerBox.width / 2, y: markerBox.y + markerBox.height / 2 };
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + markerBox.width / 2 + 110, markerBox.y + markerBox.height / 2 + 45, { steps: 10 });
  await page.mouse.up();
  const movedMarkerBox = await homeMarker.boundingBox();
  expect(movedMarkerBox).not.toBeNull();
  expect(movedMarkerBox.x + movedMarkerBox.width / 2).toBeGreaterThan(startCenter.x + 80);
  expect(movedMarkerBox.y + movedMarkerBox.height / 2).toBeGreaterThan(startCenter.y + 25);
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.12);
  await page.mouse.click(movedMarkerBox.x + movedMarkerBox.width - 2, movedMarkerBox.y + movedMarkerBox.height / 2);
  await expect(page.locator(".spr-inspector-title").filter({ hasText: "Selected role" })).toBeVisible();
  const movedTransform = await homeMarker.getAttribute("transform");

  await page.locator("[data-set-piece-phase-id]").first().click();
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  await scrubber.fill("0.5");
  await expect(scrubber).toHaveValue("0.5");
  await page.getByRole("button", { name: "Back to phase 1" }).click();
  const loopButton = page.getByRole("button", { name: "Loop playback" });
  await loopButton.click();
  await expect(loopButton).toHaveAttribute("aria-pressed", "true");
  await loopButton.click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedTransform = await page.locator(".spr-board-element.is-home-player:not(.is-ghost)").getAttribute("transform");
  await page.waitForTimeout(250);
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveAttribute("transform", pausedTransform);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".spr-phase-counter")).toContainText("Phase 2", { timeout: 5_000 });
  await expect(page.locator(".spr-phase-counter")).toContainText("of 2");

  await page.getByRole("button", { name: "Create variant" }).click();
  await expect(page.locator("[data-set-piece-variant-id]")).toHaveCount(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await expect(page.locator("[data-set-piece-variant-id]")).toHaveCount(2);
  await expect(page.locator(".spr-board-element.is-opponent:not(.is-ghost) text")).toHaveText("12");
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost)")).toHaveAttribute("transform", movedTransform);
  expect(pageErrors).toEqual([]);
});

test("Set Pieces Room reassigns stable tactical roles across routines and variants", async ({ page }) => {
  await page.addInitScript(() => {
    const isFreshTestRun = !window.sessionStorage.getItem("set-pieces-assignment-smoke-seeded");
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [
        { id: "player-alex", name: "Alex Example", position: "Forward" },
        { id: "player-beth", name: "Beth Miller", position: "Midfielder" },
        { id: "player-casey", name: "Casey Evans", position: "Defender" },
      ],
    }));
    if (isFreshTestRun) {
      window.localStorage.removeItem("football-set-pieces-room-v1");
      window.sessionStorage.setItem("set-pieces-assignment-smoke-seeded", "true");
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  const addPlayer = async (name) => {
    await page.locator("[data-set-piece-player-picker] summary").click();
    await page.getByRole("menuitem", { name: `Add ${name}` }).click();
  };
  await addPlayer("Alex Example");
  await addPlayer("Beth Miller");

  const alexMarker = page.locator(".spr-board-element.is-home-player:not(.is-ghost)").filter({ hasText: "AE" });
  const alexSlotId = await alexMarker.getAttribute("data-element-id");
  expect(alexSlotId).toBeTruthy();
  await alexMarker.click();
  await expect(page.locator(".spr-assignment-picker[open]")).toBeVisible();
  const roleField = page.getByRole("textbox", { name: "Tactical role" });
  await roleField.fill("Near post");
  await roleField.press("Tab");
  await page.getByRole("menuitem", { name: "Assign Beth Miller to Near post" }).click();

  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("BM");
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost) text")).toHaveCount(2);
  await expect(page.locator(".spr-board-element.is-home-player:not(.is-ghost) text")).toContainText(["BM", "AE"]);

  await page.getByRole("button", { name: "Assignments" }).click();
  await expect(page.locator(".spr-assignments-overview")).toContainText("Near post");
  await expect(page.locator(".spr-assignment-row").filter({ hasText: "Near post" })).toContainText("Beth Miller");

  await page.getByRole("button", { name: "Create variant" }).click();
  await page.locator(".spr-assignment-row").filter({ hasText: "Near post" }).click();
  await page.getByRole("button", { name: "This variant" }).click();
  await page.getByRole("menuitem", { name: "Assign Casey Evans to Near post" }).click();
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("CE");

  const variants = page.locator("[data-set-piece-variant-id]");
  await variants.first().click();
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("BM");
  await variants.nth(1).click();
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("CE");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await expect(page.locator(`[data-element-id="${alexSlotId}"] text`)).toHaveText("CE");
});

test("Set Pieces Room keeps its editor usable on a narrow touch viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem("football-player-profiles-v1", JSON.stringify({
      schemaVersion: 3,
      players: [{ id: "player-alex", name: "Alex Example", position: "Forward" }],
    }));
    window.localStorage.removeItem("football-set-pieces-room-v1");
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForPlatformShell(page);
  await openSetPiecesRoom(page);
  await page.getByRole("button", { name: "Create set piece" }).click();

  await expect(page.locator("[data-set-piece-pitch]")).toBeVisible();
  await expect(page.locator(".spr-playback")).toBeVisible();
  await expect(page.locator(".spr-inspector")).toBeVisible();
  await page.locator("[data-set-piece-player-picker] summary").click();
  await expect(page.locator(".spr-player-menu")).toBeVisible();
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    toolRailWidth: document.querySelector(".spr-tool-rail")?.scrollWidth || 0,
    boardWidth: document.querySelector(".spr-board-stage")?.getBoundingClientRect().width || 0,
    playerMenuRight: document.querySelector(".spr-player-menu")?.getBoundingClientRect().right || 0,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.toolRailWidth).toBeGreaterThan(300);
  expect(metrics.boardWidth).toBeGreaterThan(280);
  expect(metrics.playerMenuRight).toBeLessThanOrEqual(metrics.viewportWidth);
});
